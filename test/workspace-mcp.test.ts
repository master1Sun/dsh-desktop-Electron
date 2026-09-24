import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

// workspace-mcp → workspace/store read `app.getPath('userData')`; the electron-store mock keeps
// settings in memory. node-runtime is stubbed so the spec command is deterministic without a real
// bundled runtime on disk. Same scratch-dir pattern as test/workspace.test.ts.
const scratch = join(tmpdir(), `dsh-container-wsmcp-test-${process.pid}`)
vi.mock('electron', () => {
  const stub = {
    app: {
      getAppPath: () => scratch,
      getPath: (name: string) => (name === 'userData' ? scratch : scratch),
      getVersion: () => '0.0.0-test',
      isPackaged: false
    },
    nativeTheme: { shouldUseDarkColors: false },
    ipcMain: { on: () => undefined },
    shell: { openPath: () => Promise.resolve('') }
  }
  return { ...stub, default: stub }
})

vi.mock('electron-store', () => ({
  default: class MemoryStore {
    private data = new Map<string, unknown>()
    constructor(opts?: { defaults?: Record<string, unknown> }) {
      for (const [k, v] of Object.entries(opts?.defaults ?? {})) this.data.set(k, v)
    }
    get(key: string): unknown {
      return this.data.get(key)
    }
    set(key: string, value: unknown): void {
      this.data.set(key, value)
    }
    delete(key: string): void {
      this.data.delete(key)
    }
    get store(): Record<string, unknown> {
      return Object.fromEntries(this.data)
    }
  }
}))

vi.mock('../src/main/runtime/node-runtime', () => ({
  getNodeExePath: () => join(scratch, 'bin', 'node'),
  bundledEnv: (e: Record<string, string>) => e,
  envWithPATH: (_dirs: string[], e: Record<string, string>) => e
}))

import { updateSettings } from '../src/main/shell/store'
import { workspaceFile, normalizeContext } from '../src/main/runtime/workspace'
import {
  WORKSPACE_MCP_ID,
  workspaceServerFile,
  ensureWorkspaceServerScript,
  workspaceMcpSpec
} from '../src/main/runtime/workspace-mcp'

beforeEach(() => {
  rmSync(scratch, { recursive: true, force: true })
  updateSettings({ workspaceRoot: '', sharedWorkspace: true })
})

describe('workspaceMcpSpec', () => {
  it('is withheld entirely when the shared-workspace master switch is off', () => {
    updateSettings({ sharedWorkspace: false })
    expect(workspaceMcpSpec()).toBeNull()
  })

  it('is a code-owned, auto-starting row pointed at the materialized server', () => {
    const spec = workspaceMcpSpec()
    expect(spec).not.toBeNull()
    expect(spec!.id).toBe(WORKSPACE_MCP_ID)
    expect(spec!.builtin).toBe(true)
    expect(spec!.enabled).toBe(true)
    expect(spec!.autoStart).toBe(true)
    expect(spec!.command).toBe(join(scratch, 'bin', 'node'))
    // launched as `node <userData>/mcp-bridge/workspace-server.mjs`
    expect(spec!.args).toEqual([workspaceServerFile()])
    expect(workspaceServerFile().endsWith('workspace-server.mjs')).toBe(true)
    // the server finds the same document the UI edits, through this env pointer
    expect(spec!.env).toMatchObject({ DSH_WORKSPACE_FILE: workspaceFile() })
    expect(spec!.name).toBeTruthy()
  })

  it('writes a dependency-free server (only node: builtins) exposing the six tools', () => {
    const file = ensureWorkspaceServerScript()
    expect(existsSync(file)).toBe(true)
    const src = readFileSync(file, 'utf8')
    for (
      const tool of [
        'workspace_read',
        'workspace_append',
        'workspace_set_task',
        'workspace_submit',
        'workspace_claim',
        'workspace_complete'
      ]
    ) {
      expect(src).toContain(tool)
    }
    // it must run under a plain node.exe that cannot read app.asar, so only relative or
    // node: builtin imports are allowed — never a bare package specifier
    expect(src).not.toMatch(/from\s+['"](?!\.{1,2}[/\\]|node:)/)
  })
})

describe('workspace-server.mjs (stdio MCP over newline-delimited JSON-RPC)', () => {
  /** Minimal newline-JSON-RPC stdio client shared by the end-to-end cases below. */
  async function startServer(file: string): Promise<{
    call: (method: string, params?: unknown) => Promise<Record<string, unknown>>
    kill: () => void
  }> {
    const script = join(__dirname, '..', 'src', 'main', 'runtime', 'workspace-server.mjs')
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, DSH_WORKSPACE_FILE: file }
    })
    const lines: string[] = []
    let buf = ''
    const wake: Array<() => void> = []
    child.stdout.on('data', (d) => {
      buf += d.toString()
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (line) {
          lines.push(line)
          wake.splice(0).forEach((w) => w())
        }
      }
    })
    let seq = 0
    const call = async (method: string, params?: unknown): Promise<Record<string, unknown>> => {
      const id = ++seq
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      const deadline = Date.now() + 8000
      for (;;) {
        const hit = lines
          .map((l) => JSON.parse(l) as Record<string, unknown>)
          .find((m) => m.id === id)
        if (hit) return hit
        if (Date.now() > deadline) throw new Error(`timeout waiting for response id ${id}`)
        await new Promise<void>((res) => {
          const timer = setTimeout(res, 50)
          wake.push(() => {
            clearTimeout(timer)
            res()
          })
        })
      }
    }
    // every MCP exchange starts with a handshake; notifications get no response
    await call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' }
    })
    child.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'
    )
    return { call, kill: () => child.kill() }
  }

  it('reads, appends to the shared memory, and sets the task end to end', async () => {
    const file = join(scratch, 'workspace', 'context.json')
    const script = join(__dirname, '..', 'src', 'main', 'runtime', 'workspace-server.mjs')
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, DSH_WORKSPACE_FILE: file }
    })

    const lines: string[] = []
    let buf = ''
    const wake: Array<() => void> = []
    child.stdout.on('data', (d) => {
      buf += d.toString()
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (line) {
          lines.push(line)
          wake.splice(0).forEach((w) => w())
        }
      }
    })

    const send = (msg: unknown): void => {
      child.stdin.write(JSON.stringify(msg) + '\n')
    }
    const waitFor = async (id: number, timeoutMs = 8000): Promise<Record<string, unknown>> => {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        const hit = lines
          .map((l) => JSON.parse(l) as Record<string, unknown>)
          .find((m) => m.id === id)
        if (hit) return hit
        if (Date.now() > deadline) throw new Error(`timeout waiting for response id ${id}`)
        await new Promise<void>((res) => {
          const t = setTimeout(res, 50)
          wake.push(() => {
            clearTimeout(t)
            res()
          })
        })
      }
    }

    try {
      send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' }
        }
      })
      const init = await waitFor(1)
      expect((init.result as { serverInfo: { name: string } }).serverInfo.name).toBe(
        'dsh-workspace'
      )
      send({ jsonrpc: '2.0', method: 'notifications/initialized' })

      send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
      const list = await waitFor(2)
      const names = (list.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name)
      expect(names).toEqual(
        expect.arrayContaining(['workspace_read', 'workspace_append', 'workspace_set_task'])
      )

      send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'workspace_append', arguments: { text: 'from agent', author: 'codex' } }
      })
      const appended = await waitFor(3)
      expect((appended.result as { isError: boolean }).isError).toBe(false)

      send({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'workspace_set_task', arguments: { task: 'ship option A' } }
      })
      await waitFor(4)

      send({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'workspace_read', arguments: {} }
      })
      const read = await waitFor(5)
      const doc = JSON.parse((read.result as { content: Array<{ text: string }> }).content[0].text)
      expect(doc.task).toBe('ship option A')
      expect(
        doc.notes.some(
          (n: { text: string; author: string }) => n.text === 'from agent' && n.author === 'codex'
        )
      ).toBe(true)

      // the write landed in the very file the container's UI reads — the shared-memory round trip
      const onDisk = JSON.parse(readFileSync(file, 'utf8'))
      expect(onDisk.task).toBe('ship option A')
      expect(onDisk.notes.length).toBe(1)
    } finally {
      child.kill()
    }
  }, 20000)

  it('runs the task queue end to end: submit → claim → complete, with the done-mirror note', async () => {
    const file = join(scratch, 'workspace', 'context.json')
    const { call, kill } = await startServer(file)
    try {
      const toolText = (r: Record<string, unknown>): string =>
        (r.result as { content: Array<{ text: string }> }).content[0].text
      const submitted = await call('tools/call', {
        name: 'workspace_submit',
        arguments: { title: ' wire the adapter ', deps: ['nope'] }
      })
      expect((submitted.result as { isError: boolean }).isError).toBe(false)
      const doc1 = JSON.parse(toolText(submitted)) as { revision: number; tasks: Array<{ id: string }> }
      expect(doc1.revision).toBe(1) // any queue mutation bumps the poll counter
      const taskId = doc1.tasks[0].id

      // a foreign claim is honest about the race, and a missing id never half-applies
      const missing = await call('tools/call', {
        name: 'workspace_claim',
        arguments: { taskId: 't-nope', owner: 'codex' }
      })
      expect((missing.result as { isError: boolean }).isError).toBe(true)

      const claimed = await call('tools/call', {
        name: 'workspace_claim',
        arguments: { taskId, owner: 'codex' }
      })
      expect(JSON.parse(toolText(claimed)).tasks[0]).toMatchObject({ status: 'doing', owner: 'codex' })
      const raced = await call('tools/call', {
        name: 'workspace_claim',
        arguments: { taskId, owner: 'openclaw' }
      })
      expect((raced.result as { isError: boolean }).isError).toBe(true)

      const done = await call('tools/call', {
        name: 'workspace_complete',
        arguments: { taskId, result: 'landed in c1' }
      })
      expect(JSON.parse(toolText(done)).tasks[0]).toMatchObject({ status: 'done', result: 'landed in c1' })

      // the outcome mirrored into the shared memory, and it all landed in the container's file
      const read = await call('tools/call', { name: 'workspace_read', arguments: {} })
      const doc = JSON.parse(toolText(read)) as {
        tasks: unknown[]
        notes: Array<{ text: string; author: string }>
      }
      expect(doc.tasks).toHaveLength(1)
      expect(doc.notes.some((n) => n.text.includes('wire the adapter') && n.author === 'codex')).toBe(
        true
      )
      const onDisk = JSON.parse(readFileSync(file, 'utf8'))
      expect(onDisk.tasks[0].status).toBe('done')
      // the container's own ingest reads the server's writes through the same contract
      expect(normalizeContext(onDisk).tasks?.[0]).toMatchObject({ id: taskId, status: 'done' })
    } finally {
      kill()
    }
  }, 20000)
})
