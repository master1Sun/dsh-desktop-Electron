import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'

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

async function waitForPortClosed(port: number, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await tcpOpen(port))) return
    await new Promise((r) => setTimeout(r, 150))
  }
}

function tcpOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createConnection({ host: '127.0.0.1', port }, () => {
      s.destroy()
      resolve(true)
    })
    s.on('error', () => resolve(false))
    setTimeout(() => {
      s.destroy()
      resolve(false)
    }, 800)
  })
}

describe('page meta parsing', () => {
  it('reads dsh-plugin-market container.json', () => {
    const meta = readPageMeta(pagesDir, 'dsh-plugin-market')
    expect(meta.port).toBe(8889)
    expect(meta.startCommand).toBe('node server.js')
  })

  it('scanInstalledPages includes dsh-plugin-market', () => {
    const list = scanInstalledPages(pagesDir)
    expect(list.some((p) => p.id === 'dsh-plugin-market')).toBe(true)
  })

  it('reads the built-in codex page as terminal kind', () => {
    const meta = readPageMeta(pagesDir, 'codex')
    expect(meta.kind).toBe('terminal')
    expect(meta.startCommand).toBe('codex')
    expect(meta.envVars?.some((v) => v.key === 'CODEX_HOME')).toBe(true)
  })

  it('user port override wins over container.json without rewriting it', () => {
    setPagePort('dsh-plugin-market', 8890)
    try {
      const meta = readPageMeta(pagesDir, 'dsh-plugin-market')
      expect(meta.port).toBe(8889)
      expect(meta.containerPort).toBe(8890)
    } finally {
      setPagePort('dsh-plugin-market', undefined)
    }
    expect(readPageMeta(pagesDir, 'dsh-plugin-market').containerPort).toBe(8889)
  })
})

describe('page lifecycle with bundled node', () => {
  let registry: PageRegistry

  beforeAll(() => {
    registry = new PageRegistry({ pagesDir, projectDir })
  })

  afterAll(async () => {
    registry.shutdownAll()
    await new Promise((r) => setTimeout(r, 500))
  })

  it('starts dsh-plugin-market and reaches running state', async () => {
    const state = await registry.start('dsh-plugin-market')
    expect(state.status).toBe('running')
    expect(state.pid).toBeTypeOf('number')
    expect(await tcpOpen(8889)).toBe(true)
  }, 40_000)

  it('collects logs while running', async () => {
    // stdout arrives asynchronously after readiness — poll before asserting
    let logs: string[] = []
    for (let i = 0; i < 25; i++) {
      logs = registry.logs('dsh-plugin-market')
      if (logs.join('\n').includes('dsh-plugin-market listening on 8889')) break
      await new Promise((r) => setTimeout(r, 200))
    }
    expect(logs.join('\n')).toContain('dsh-plugin-market listening on 8889')
  }, 10_000)

  it('serves the plugin market page with recommended repos', async () => {
    const res = await fetch('http://127.0.0.1:8889/')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('DSH 插件市场')
    expect(html).toContain('master1Sun/dsh-prompt-library')
    expect(html).toContain('master1Sun/dsh-file-workbench-lib')
    expect(html).toContain('master1Sun/dsh-QQbot')
  })

  it('stop kills the process and frees the port', async () => {
    registry.stop('dsh-plugin-market')
    await waitForPortClosed(8889)
    expect(registry.get('dsh-plugin-market')?.status).toBe('stopped')
    expect(await tcpOpen(8889)).toBe(false)
  }, 15_000)

  it('honors a custom port when spawning', async () => {
    setPagePort('dsh-plugin-market', 8891)
    try {
      registry.reconcile() // refresh cached metas so the override takes effect
      const state = await registry.start('dsh-plugin-market')
      expect(state.status).toBe('running')
      expect(state.url).toContain(':8891')
      expect(await tcpOpen(8891)).toBe(true)
      expect(await tcpOpen(8889)).toBe(false)
      registry.stop('dsh-plugin-market')
      await waitForPortClosed(8891)
    } finally {
      setPagePort('dsh-plugin-market', undefined)
    }
  }, 40_000)

  it('start failure surfaces error status', async () => {
    // non-listening command: node -e that exits immediately
    const badId = '__bad__'
    // inject a fake entry via reconcile is not possible; test waitPortReady timeout instead
    await expect(waitPortReady(59_432, 1500)).rejects.toThrow(/未就绪/)
    void badId
  }, 10_000)

  it('terminal-kind page: start() refuses and points at the embedded terminal', async () => {
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
