import { describe, it, expect, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'

// pages.ts -> node-runtime.ts imports electron (app), so stub it for vitest.
// getPath('userData') is needed because spawning a plain page now reads persisted
// settings (auto-injected APP_DIR → resolvePageEnv → electron-store).
vi.mock('electron', () => {
  const stub = {
    app: {
      getAppPath: () => join(__dirname, '..'),
      getPath: () => join(tmpdir(), 'dsh-container-pages-test'),
      getVersion: () => '0.0.0-test',
      isPackaged: false
    },
    // electron-store publishes its default cwd via an ipcMain handler; without this
    // stub present it leaves cwd undefined and conf throws for a missing projectName.
    ipcMain: { on: () => undefined },
    shell: { openPath: () => Promise.resolve('') }
  }
  // electron-store uses a default import (`import electron from 'electron'`) while our
  // source uses named imports — expose both shapes pointing at the same stubs.
  return { ...stub, default: stub }
})

// Production initializes electron-store before any page spawns, so resolvePageEnv reads a
// warm cache. The real conf backend won't accept the mocked app.getPath cwd under vitest's
// ESM resolution, so back electron-store with an in-memory map to mirror that warm path.
// `store` must be exposed too: getSettings() spreads store.store, not per-key getters.
vi.mock('electron-store', () => {
  return {
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
      get store(): Record<string, unknown> {
        return Object.fromEntries(this.data)
      }
    }
  }
})

import { PageRegistry, waitPortReady, readPageMeta, scanInstalledPages } from '../src/main/pages'
import { updateSettings } from '../src/main/store'

const projectDir = join(__dirname, '..')
const pagesDir = join(projectDir, 'pages')

function setPagePort(id: string, port?: number): void {
  const pagePorts = { ...updateSettings({}).pagePorts }
  if (port) pagePorts[id] = port
  else delete pagePorts[id]
  updateSettings({ pagePorts })
}

describe('page meta parsing', () => {
  it('reads the dsh-web page as dsh kind', () => {
    const meta = readPageMeta(pagesDir, 'dsh-web')
    expect(meta.kind).toBe('dsh')
    expect(meta.port).toBe(8899)
    expect(meta.startCommand).toBe('dsh --profile web')
    expect(meta.dshProfile).toBe('web')
    expect(meta.builtin).toBe(true)
  })

  it('reads the openclaw page as openclaw kind', () => {
    const meta = readPageMeta(pagesDir, 'openclaw')
    expect(meta.kind).toBe('openclaw')
    expect(meta.port).toBe(18789)
    expect(meta.builtin).toBe(true)
  })

  it('scanInstalledPages lists the two builtin pages and no retired ones', () => {
    const list = scanInstalledPages(pagesDir)
    expect(list.some((p) => p.id === 'dsh-web')).toBe(true)
    expect(list.some((p) => p.id === 'openclaw')).toBe(true)
    // codex / dsh-plugin-market were retired: codex removed, market moved into the renderer.
    expect(list.some((p) => p.id === 'codex')).toBe(false)
    expect(list.some((p) => p.id === 'dsh-plugin-market')).toBe(false)
  })

  it('user port override wins over container.json without rewriting it', () => {
    setPagePort('openclaw', 18800)
    try {
      const meta = readPageMeta(pagesDir, 'openclaw')
      expect(meta.port).toBe(18789)
      expect(meta.containerPort).toBe(18800)
    } finally {
      setPagePort('openclaw', undefined)
    }
    expect(readPageMeta(pagesDir, 'openclaw').containerPort).toBe(18789)
  })
})

describe('page start errors', () => {
  it('start failure surfaces error status', async () => {
    // non-listening port: waitPortReady must time out with the ready error
    await expect(waitPortReady(59_432, 1500)).rejects.toThrow(/未就绪/)
  }, 10_000)
})

describe('terminal-kind pages', () => {
  it('start() refuses and points at the embedded terminal', async () => {
    // A temp pages root keeps the fixture isolated from the real pages/ dir.
    const tmpRoot = mkdtempSync(join(tmpdir(), 'dsh-cli-page-'))
    const id = 'cli-terminal-fixture'
    const dir = join(tmpRoot, id)
    mkdirSync(dir, { recursive: true })
    try {
      writeFileSync(
        join(dir, 'container.json'),
        JSON.stringify({
          name: 'CLI Fixture',
          kind: 'terminal',
          startCommand: 'node ping-pong.js'
        })
      )
      // A long-lived CLI: prints a line then keeps the event loop alive.
      writeFileSync(
        join(dir, 'ping-pong.js'),
        "console.log('cli fixture alive')\nsetInterval(() => {}, 1000)\n"
      )
      const cliRegistry = new PageRegistry({ pagesDir: tmpRoot, projectDir })
      const meta = readPageMeta(tmpRoot, id)
      expect(meta.kind).toBe('terminal')
      expect(meta.port).toBe(0)

      // Terminal kinds run only in the embedded PTY (CliTerminalView); a detached
      // spawn would exit instantly and show a bogus error state.
      await expect(cliRegistry.start(id)).rejects.toThrow(/终端/)
      expect(cliRegistry.get(id)?.status).toBe('stopped')
    } finally {
      // Windows holds the killed child's cwd handle open a beat after its 'close'
      // event; retry but never let cleanup noise mask the test's own failure.
      for (let i = 0; i <= 10; i++) {
        try {
          rmSync(tmpRoot, { recursive: true, force: true })
          break
        } catch {
          if (i === 10) break
          await new Promise((r) => setTimeout(r, 500))
        }
      }
    }
  }, 40_000)
})

describe('terminal-kind meta parsing', () => {
  it('rejects a terminal page without a start command', () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'dsh-cli-meta-'))
    const id = 'cli-no-cmd'
    const dir = join(tmpRoot, id)
    mkdirSync(dir, { recursive: true })
    try {
      writeFileSync(join(dir, 'container.json'), JSON.stringify({ kind: 'terminal' }))
      // No server.js/index.js/package.json either → nothing to infer.
      expect(() => readPageMeta(tmpRoot, id)).toThrow(/startCommand/)
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true })
    }
  })
})
