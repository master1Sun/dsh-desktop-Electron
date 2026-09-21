import { describe, it, expect, afterAll, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PageState } from '../src/shared/types'

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

  it('extracts the token for the DSH panel', () => {
    expect(pages.tokenFromLaunchUrl('http://127.0.0.1:8899/?token=abc123')).toBe('abc123')
    // Percent-escapes are decoded: the panel must copy the raw token the server compares
    // against, not the escaped form as it appears in an address bar.
    expect(pages.tokenFromLaunchUrl('http://127.0.0.1:8899/?token=a%2Bb%3Dc')).toBe('a+b=c')
    // toState() appends ?theme=dark on a dark OS theme; the token has to survive that.
    expect(pages.tokenFromLaunchUrl('http://127.0.0.1:8899/?token=abc123&theme=dark')).toBe(
      'abc123'
    )
  })

  it('reports no token rather than a wrong one', () => {
    // A stopped page reports a bare origin (launchUrl was cleared on start) — the panel then
    // shows its "not generated yet" hint instead of a stale credential.
    expect(pages.tokenFromLaunchUrl('http://127.0.0.1:8899')).toBeNull()
    expect(pages.tokenFromLaunchUrl('http://127.0.0.1:8899/?token=')).toBeNull()
    expect(pages.tokenFromLaunchUrl('http://127.0.0.1:8899/?token=%20')).toBeNull()
    expect(pages.tokenFromLaunchUrl(undefined)).toBeNull()
    expect(pages.tokenFromLaunchUrl('not a url')).toBeNull()
  })
})

describe('dsh token resolution (DSH panel)', () => {
  const dshPage = (over: Partial<PageState> = {}): PageState => ({
    id: 'dsh-web',
    name: 'DSH (web)',
    dir: 'pages/dsh-web',
    port: 8899,
    startCommand: 'dsh --profile web',
    kind: 'dsh',
    dshProfile: 'web',
    status: 'running',
    ...over
  })

  it('reads the token off a running dsh page', () => {
    expect(
      pages.resolveDshToken([dshPage({ launchUrl: 'http://127.0.0.1:8899/?token=abc123' })], 'web')
    ).toEqual({
      kind: 'ok',
      token: 'abc123',
      pageId: 'dsh-web',
      url: 'http://127.0.0.1:8899/?token=abc123'
    })
  })

  it('matches by profile, not by folder name', () => {
    const renamed = dshPage({
      id: 'my-harness',
      dshProfile: 'web',
      launchUrl: 'http://127.0.0.1:8899/?token=t1'
    })
    expect(pages.resolveDshToken([renamed], 'web')).toMatchObject({
      kind: 'ok',
      pageId: 'my-harness'
    })
  })

  it('prefers the live page over an idle one for the same profile', () => {
    const idle = dshPage({ id: 'dsh-web-old', status: 'stopped' })
    const live = dshPage({ launchUrl: 'http://127.0.0.1:8899/?token=live' })
    expect(pages.resolveDshToken([idle, live], 'web')).toMatchObject({ kind: 'ok', token: 'live' })
  })

  it('says "not started" when the profile has a page but no live token', () => {
    // launchUrl is cleared on start, so a stopped entry reports a bare origin.
    expect(pages.resolveDshToken([dshPage({ status: 'stopped' })], 'web')).toEqual({
      kind: 'stopped',
      pageId: 'dsh-web'
    })
    expect(
      pages.resolveDshToken(
        [dshPage({ status: 'stopped', launchUrl: 'http://127.0.0.1:8899' })],
        'web'
      )
    ).toEqual({ kind: 'stopped', pageId: 'dsh-web' })
  })

  it('says "no page" when the profile was never registered', () => {
    expect(pages.resolveDshToken([], 'web')).toEqual({ kind: 'no-page', profile: 'web' })
    expect(pages.resolveDshToken([dshPage()], 'acp')).toEqual({ kind: 'no-page', profile: 'acp' })
  })

  it('ignores non-dsh pages and treats a blank profile as "web"', () => {
    const plain = dshPage({
      id: 'my-app',
      kind: 'page',
      dshProfile: undefined,
      launchUrl: 'http://127.0.0.1:3000/?token=nope'
    })
    expect(pages.resolveDshToken([plain], 'web')).toEqual({ kind: 'no-page', profile: 'web' })
    expect(
      pages.resolveDshToken([dshPage({ launchUrl: 'http://127.0.0.1:8899/?token=x' })], '  ')
    ).toMatchObject({ kind: 'ok', token: 'x' })
  })
})

describe('stale dsh writer-lock reclaim', () => {
  it('drops locks whose holder pid is dead, keeps live and unparseable ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-locks-'))
    // A finished spawnSync child: its pid is guaranteed not running anymore.
    const deadPid = spawnSync(process.execPath, ['-e', '0']).pid as number
    writeFileSync(join(dir, '.credentials.yaml.lock'), String(deadPid))
    writeFileSync(join(dir, '.live.lock'), String(process.pid))
    writeFileSync(join(dir, '.unknown.lock'), 'not-a-pid')
    // A crashed holder leaves an EMPTY lock; backdate it past the grace window.
    const oldEmpty = join(dir, '.empty-old.lock')
    writeFileSync(oldEmpty, '')
    const past = new Date(Date.now() - 60_000)
    utimesSync(oldEmpty, past, past)
    // A fresh empty lock may be a live writer mid-flush: must be left alone.
    writeFileSync(join(dir, '.empty-fresh.lock'), '')

    const removed = dsh.clearStaleDshLocks(dir)

    expect(removed.sort()).toEqual([join(dir, '.credentials.yaml.lock'), oldEmpty].sort())
    expect(existsSync(join(dir, '.credentials.yaml.lock'))).toBe(false)
    expect(existsSync(oldEmpty)).toBe(false)
    expect(existsSync(join(dir, '.empty-fresh.lock'))).toBe(true)
    expect(existsSync(join(dir, '.live.lock'))).toBe(true)
    expect(existsSync(join(dir, '.unknown.lock'))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})
