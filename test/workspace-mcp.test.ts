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
import { workspaceFile } from '../src/main/runtime/workspace'
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

  it('writes a dependency-free server (only node: builtins) exposing the three tools', () => {
    const file = ensureWorkspaceServerScript()
    expect(existsSync(file)).toBe(true)
    const src = readFileSync(file, 'utf8')
    for (const tool of ['workspace_read', 'workspace_append', 'workspace_set_task']) {
      expect(src).toContain(tool)
    }
    // it must run under a plain node.exe that cannot read app.asar, so only relative or
    // node: builtin imports are allowed — never a bare package specifier
    expect(src).not.toMatch(/from\s+['"](?!\.{1,2}[/\\]|node:)/)
  })
})

describe('workspace-server.mjs (stdio MCP over newline-delimited JSON-RPC)', () => {
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
})
