import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'

// openclaw.ts → store.ts / node-runtime.ts import electron at module load; stub it like the
// other main-process tests. The token helpers only need the fs + a resolved config path.
vi.mock('electron', () => {
  const stub = {
    app: {
      getAppPath: () => join(__dirname, '..'),
      getPath: () => join(tmpdir(), 'dsh-container-openclaw-test'),
      getVersion: () => '0.0.0-test',
      isPackaged: false
    },
    ipcMain: { on: () => undefined, handle: () => undefined, removeHandler: () => undefined },
    shell: { openPath: () => Promise.resolve('') },
    nativeTheme: { shouldUseDarkColors: false, on: () => undefined }
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
    get store(): Record<string, unknown> {
      return Object.fromEntries(this.data)
    }
  }
}))

import { initializeOpenclawToken, getOpenclawGatewayToken } from '../src/main/runtime/openclaw'

let base = ''
let cfgPath = ''

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'dsh-oc-token-'))
  cfgPath = join(base, 'openclaw.json')
  // openclawConfigPath() reads OPENCLAW_CONFIG_PATH first — pin it so no home resolution runs.
  process.env.OPENCLAW_CONFIG_PATH = cfgPath
  delete process.env.OPENCLAW_GATEWAY_TOKEN
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
  delete process.env.OPENCLAW_CONFIG_PATH
  delete process.env.OPENCLAW_GATEWAY_TOKEN
})

function readCfg(): Record<string, unknown> {
  return JSON.parse(readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>
}

function tokenInCfg(): string {
  const g = readCfg().gateway as { auth?: { token?: string } }
  return g?.auth?.token ?? ''
}

describe('initializeOpenclawToken', () => {
  it('mints a token into a fresh config and seeds local mode', () => {
    const r = initializeOpenclawToken()
    expect(r.created).toBe(true)
    expect(r.token).toMatch(/^[A-Za-z0-9_-]{20,}$/)
    expect(existsSync(cfgPath)).toBe(true)
    const g = readCfg().gateway as { mode?: string; auth?: { token?: string } }
    expect(g.mode).toBe('local')
    expect(g.auth?.token).toBe(r.token)
    // The written token is immediately revealable through the config-first reader.
    expect(getOpenclawGatewayToken()).toEqual({ token: r.token, source: 'config' })
  })

  it('is idempotent: a second call returns the existing token untouched', () => {
    const first = initializeOpenclawToken()
    const before = readFileSync(cfgPath, 'utf-8')
    const second = initializeOpenclawToken()
    expect(second.created).toBe(false)
    expect(second.token).toBe(first.token)
    expect(readFileSync(cfgPath, 'utf-8')).toBe(before)
  })

  it('rotate mints a different token and overwrites the old one', () => {
    const first = initializeOpenclawToken()
    const rotated = initializeOpenclawToken(true)
    expect(rotated.created).toBe(true)
    expect(rotated.token).not.toBe(first.token)
    expect(tokenInCfg()).toBe(rotated.token)
  })

  it('preserves unrelated config keys when writing the token', () => {
    writeFileSync(
      cfgPath,
      JSON.stringify(
        { gateway: { mode: 'local', port: 18789 }, channels: { slack: { token: 'secret' } } },
        null,
        2
      )
    )
    const r = initializeOpenclawToken()
    const cfg = readCfg()
    const g = cfg.gateway as { mode?: string; port?: number; auth?: { token?: string } }
    expect(g.mode).toBe('local')
    expect(g.port).toBe(18789)
    expect(g.auth?.token).toBe(r.token)
    // A sibling section must survive the merge untouched.
    expect((cfg.channels as { slack: { token: string } }).slack.token).toBe('secret')
  })

  it('adopts an existing gateway.auth.token instead of generating one', () => {
    writeFileSync(cfgPath, JSON.stringify({ gateway: { auth: { token: 'pre-existing' } } }))
    const r = initializeOpenclawToken()
    expect(r.created).toBe(false)
    expect(r.token).toBe('pre-existing')
    expect(tokenInCfg()).toBe('pre-existing')
  })

  it('creates the parent directory when the config path is nested', () => {
    cfgPath = join(base, 'nested', 'deep', 'openclaw.json')
    process.env.OPENCLAW_CONFIG_PATH = cfgPath
    const r = initializeOpenclawToken()
    expect(existsSync(cfgPath)).toBe(true)
    expect(tokenInCfg()).toBe(r.token)
  })

  it('refuses to clobber an unparseable config', () => {
    mkdirSync(base, { recursive: true })
    writeFileSync(cfgPath, '{ this is not json ,,,' )
    expect(() => initializeOpenclawToken()).toThrow()
    // The broken file is left exactly as it was — no silent overwrite.
    expect(readFileSync(cfgPath, 'utf-8')).toBe('{ this is not json ,,,' )
  })
})
