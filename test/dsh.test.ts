import { describe, it, expect, afterAll, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repoRoot = join(__dirname, '..')
const scratch = mkdtempSync(join(tmpdir(), 'dsh-home-'))
const home = join(scratch, 'dsh-home')
const pagesDir = join(scratch, 'pages')
mkdirSync(home, { recursive: true })
mkdirSync(pagesDir, { recursive: true })
process.env.DSH_HOME = home
process.env.DSH_PAGES_DIR = pagesDir

vi.mock('electron', () => ({
  app: {
    getAppPath: () => repoRoot,
    getPath: () => scratch,
    isPackaged: false
  }
}))

// readPageMeta reads settings for per-page port overrides; conf rejects the mocked
// app.getPath cwd under vitest's ESM resolution, so back electron-store with memory.
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

const dsh = await import('../src/main/dsh')
const pages = await import('../src/main/pages')

describe('dsh plugin management against the installed CLI', () => {
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true })
  })

  it('detects the installed @deepseek-ai/dsh and pnpm', async () => {
    const s = await dsh.getDshStatus('web')
    expect(s.installed).toBe(true)
    expect(s.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(s.pnpmFound).toBe(true)
    expect(s.profileDir).toBe(join(home, 'profiles', 'web'))
  })

  it('rejects profile names dsh itself would reject', async () => {
    await expect(dsh.getDshStatus('desktop')).rejects.toThrow(/desktop/)
    await expect(dsh.getDshStatus('a/b')).rejects.toThrow(/非法 profile/)
  })

  it('initializes a shipped profile through dsh and lists its bundle layers', async () => {
    expect(existsSync(join(home, 'profiles', 'probe1'))).toBe(false)
    // Forwarding must succeed end-to-end: dsh initializes the profile lazily and
    // runs pnpm through the PATH we inject (the bundled prefix's pnpm.cmd shim).
    await dsh.dshPluginForward(['list'], 'probe1')
    expect(existsSync(join(home, 'profiles', 'probe1'))).toBe(true)
  }, 300_000)

  it('installs and uninstalls an npm plugin, keeping the bundle stack intact', async () => {
    await dsh.installDshPlugin('@deepseek-ai/dsh-plugin-manager', 'web')
    let listed = dsh.listDshPlugins('web')
    expect(
      listed.some((p) => p.name === '@deepseek-ai/dsh-plugin-manager' && p.source === 'profile')
    ).toBe(true)
    // the in-box web template layers survive as bundle rows
    expect(listed.filter((p) => p.source === 'bundle').map((p) => p.name)).toContain(
      '@deepseek-ai/dsh-web-app'
    )

    await dsh.uninstallDshPlugin('@deepseek-ai/dsh-plugin-manager', 'web')
    listed = dsh.listDshPlugins('web')
    expect(listed.some((p) => p.name === '@deepseek-ai/dsh-plugin-manager')).toBe(false)
  }, 600_000)

  it('refuses malformed plugin specs before touching pnpm', async () => {
    await expect(dsh.installDshPlugin('bad name;rm -rf /', 'web')).rejects.toThrow(/非法/)
    await expect(dsh.updateDshPlugin('@scope/pkg', 'git', undefined, 'web')).rejects.toThrow(
      /仓库地址/
    )
  })

  it('registers a dsh page entry as container.json instead of copying files', () => {
    const id = dsh.createDshPage('web', 8899)
    expect(id).toBe('dsh-web')
    const raw = JSON.parse(readFileSync(join(pagesDir, id, 'container.json'), 'utf-8'))
    expect(raw.kind).toBe('dsh')
    expect(raw.dsh).toEqual({ profile: 'web', port: 8899 })
    const meta = pages.readPageMeta(pagesDir, id)
    expect(meta.kind).toBe('dsh')
    expect(meta.port).toBe(8899)
    expect(meta.dshProfile).toBe('web')
    // no project tree was copied next to the manifest
    expect(existsSync(join(pagesDir, id, 'package.json'))).toBe(false)
    expect(() => dsh.createDshPage('web', 8899)).toThrow(/已存在/)
  })

  it('builds a spawn spec that pins host/port and suppresses the external browser', async () => {
    const spec = await dsh.dshSpawnCommand('web', 8899)
    expect(spec.cmd).toMatch(/node(\.exe)?$/)
    expect(spec.args[0]).toMatch(/@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js$/)
    expect(spec.args.slice(1)).toEqual([
      '--profile',
      'web',
      '--host',
      '127.0.0.1',
      '--port',
      '8899',
      '--no-open'
    ])
    expect(spec.cwd).toBe(join(home, 'profiles', 'web'))
    expect(join(spec.env.DSH_HOME as string)).toBe(home)
    // dsh hosts node-pty terminals — its interpreter must be plain Node, ABI-pinned for children
    expect(spec.env.DSH_NODE_PATH).toBe(spec.cmd)
  })
})

describe('launch URL discovery', () => {
  it('parses the authenticated URL out of the dsh ready line', () => {
    const line = 'dsh web: http://127.0.0.1:8899/?token=abc123'
    expect(pages.parseLaunchLine(line)).toEqual({
      port: 8899,
      url: 'http://127.0.0.1:8899/?token=abc123'
    })
    expect(pages.parseLaunchLine('unrelated log line')).toBeNull()
    expect(pages.parseLaunchLine('dsh web: not-a-url')).toBeNull()
  })
})
