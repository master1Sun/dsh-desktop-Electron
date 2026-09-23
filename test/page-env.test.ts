import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

// pages.ts → node-runtime.ts → electron `app`; store.ts reads `app.getPath` for {envRoot} /
// {userData} and isPackaged. One scratch dir for both: the paths the assertions below care
// about are all derived from it.
const scratch = join(tmpdir(), `dsh-container-env-test-${process.pid}`)
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
    get store(): Record<string, unknown> {
      return Object.fromEntries(this.data)
    }
  }
}))

import { updateSettings } from '../src/main/shell/store'
import { buildPageEnv, expandStartCommand } from '../src/main/runtime/pages'
import type { EnvVarSpec, PageMeta } from '../src/shared/types'

/**
 * B2: what a page's environment ends up holding. Two chains meet in `buildPageEnv` — the
 * manifest's declared `envVars` (a directory chain with `~`/`{envRoot}` expansion and an
 * auto-created home, or a verbatim text var) and the user's free-form KEY=VALUE rows, which are
 * deliberately applied last so an override beats a declaration instead of being ignored.
 */

function metaFor(id: string, envVars?: EnvVarSpec[]): PageMeta {
  return { id, name: id, dir: scratch, port: 0, startCommand: '', envVars }
}

/** The MCP bridge + shared workspace ride along on every spawn (design); the chains under test
    here are the declared/free-form ones, so exact-equality assertions look at the page's own vars only. */
function pageEnv(meta: PageMeta): Record<string, string> {
  const {
    DSH_MCP_BRIDGE_DIR,
    DSH_MCP_CATALOG,
    DSH_MCP_CONFIG_JSON,
    DSH_WORKSPACE_DIR,
    DSH_WORKSPACE_FILE,
    ...rest
  } = buildPageEnv(meta)
  return rest
}

const ENV_ROOT = join(scratch, 'env')

/** The env root is fixed at userData/env now (no user choice, packaged or not): the unpackaged
 *  electron stub maps userData → scratch, so the default root already IS <scratch>/env — a real
 *  `~/.dsh` is never touched. The reset only keeps persisted values deterministic between cases. */
function resetEnvRoot(): void {
  updateSettings({ envRoot: '' })
}

const savedProcessEnv: Record<string, string | undefined> = {}

function stubProcessEnv(key: string, value: string | undefined): void {
  if (!(key in savedProcessEnv)) savedProcessEnv[key] = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

beforeEach(() => {
  rmSync(scratch, { recursive: true, force: true })
  resetEnvRoot()
  updateSettings({ pageEnvs: {}, pageCustomEnvs: {}, workspaceRoot: '' })
})

afterEach(() => {
  for (const [key, value] of Object.entries(savedProcessEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('shared workspace pointers', () => {
  it('injects DSH_WORKSPACE_DIR / DSH_WORKSPACE_FILE and creates the workspace', () => {
    const full = buildPageEnv(metaFor('p1'))
    // userData-scoped default (the electron `app` stub maps userData → scratch).
    expect(full.DSH_WORKSPACE_DIR).toBe(join(scratch, 'workspace'))
    expect(full.DSH_WORKSPACE_FILE).toBe(join(scratch, 'workspace', 'context.json'))
    // The spawn path ensures the dir exists so a first-turn agent can write into it.
    expect(existsSync(full.DSH_WORKSPACE_DIR)).toBe(true)
  })

  it('honors a settings workspaceRoot override', () => {
    updateSettings({ workspaceRoot: '{envRoot}/shared' })
    const full = buildPageEnv(metaFor('p1'))
    // {envRoot} is substituted textually, so the template's own separator survives.
    expect(full.DSH_WORKSPACE_DIR).toBe(`${ENV_ROOT}/shared`)
  })
})

describe('declared directory vars', () => {
  it('defaults an untouched dir var to the container install dir, over the declared home', () => {
    const env = pageEnv(
      metaFor('p1', [{ key: 'FIXTURE_HOME', defaultPath: '~/.fixture' }])
    )
    // No choice persisted → the install default wins over the declared system-common home.
    expect(env.FIXTURE_HOME).toBe(join(ENV_ROOT, '.fixture'))
    // The var names a home dir a CLI aborts on when missing, so the default creates it.
    expect(existsSync(join(ENV_ROOT, '.fixture'))).toBe(true)
  })

  it('an untouched dir var reuses a populated system default instead of the empty container dir', () => {
    stubProcessEnv('FIXTURE_HOME', undefined)
    const systemHome = join(scratch, 'system-home')
    mkdirSync(systemHome, { recursive: true })
    writeFileSync(join(systemHome, 'credentials.yaml'), 'login')
    const env = pageEnv(metaFor('p1', [{ key: 'FIXTURE_HOME', defaultPath: systemHome }]))
    // The declared system home already holds data, so a never-touched row keeps it rather than
    // booting the CLI against the empty independent dir (which is how dsh/openclaw broke).
    expect(env.FIXTURE_HOME).toBe(systemHome)
  })

  it("the explicit '@install' choice forces a fresh container dir over a populated system home", () => {
    stubProcessEnv('FIXTURE_HOME', undefined)
    const systemHome = join(scratch, 'system-home-forced')
    mkdirSync(systemHome, { recursive: true })
    writeFileSync(join(systemHome, 'config'), 'x')
    updateSettings({ pageEnvs: { p1: { FIXTURE_HOME: '@install' } } })
    const env = pageEnv(metaFor('p1', [{ key: 'FIXTURE_HOME', defaultPath: systemHome }]))
    // An active pick is honored literally: the independent dir wins even though the system home
    // has data, so opting into container isolation stays possible (the user re-logs in there).
    expect(env.FIXTURE_HOME).toBe(join(ENV_ROOT, '.fixture'))
  })

  it("the '@system' choice expands {envRoot} in the declared default and creates it", () => {
    updateSettings({ pageEnvs: { p1: { FIXTURE_HOME: '@system' } } })
    const env = pageEnv(
      metaFor('p1', [{ key: 'FIXTURE_HOME', defaultPath: '{envRoot}/fixture' }])
    )
    // '@system' hands the row back to the tool's own home — the declared defaultPath, whose
    // {envRoot} placeholder is substituted textually (so the manifest's separator survives).
    expect(env).toEqual({ FIXTURE_HOME: `${ENV_ROOT}/fixture` })
    expect(existsSync(join(ENV_ROOT, 'fixture'))).toBe(true)
  })

  it('routes the @install choice into <envRoot>/.<tool-name>, whatever the default declares', () => {
    stubProcessEnv('FIXTURE_HOME', undefined)
    updateSettings({ pageEnvs: { p1: { FIXTURE_HOME: '@install' } } })
    const env = pageEnv(
      metaFor('p1', [{ key: 'FIXTURE_HOME', defaultPath: '{envRoot}/elsewhere' }])
    )
    // FIXTURE_HOME → envDirName ".fixture" (the leading dot mirrors the tool's ~/.name home):
    // the choice wins over the declared default, and the created dir proves it is treated as a
    // home the runtime may refuse to miss.
    expect(env.FIXTURE_HOME).toBe(join(ENV_ROOT, '.fixture'))
    expect(existsSync(join(ENV_ROOT, '.fixture'))).toBe(true)
  })

  it('reads a legacy free-text override as the install default (free paths no longer honored)', () => {
    stubProcessEnv('FIXTURE_HOME', undefined)
    updateSettings({ pageEnvs: { p1: { FIXTURE_HOME: '~/fixture-override' } } })
    const env = pageEnv(
      metaFor('p1', [{ key: 'FIXTURE_HOME', defaultPath: '{envRoot}/fixture' }])
    )
    // The two-choice UI replaced free inputs: any persisted path that is not exactly '@system'
    // resolves as the install default.
    expect(env.FIXTURE_HOME).toBe(join(ENV_ROOT, '.fixture'))
  })

  it('lets the inherited process env beat both', () => {
    stubProcessEnv('FIXTURE_HOME', join(scratch, 'from-process'))
    updateSettings({ pageEnvs: { p1: { FIXTURE_HOME: join(scratch, 'from-settings') } } })
    const env = pageEnv(metaFor('p1', [{ key: 'FIXTURE_HOME', defaultPath: '{envRoot}/x' }]))
    expect(env.FIXTURE_HOME).toBe(join(scratch, 'from-process'))
  })

  it('resolves a declared dir var with no defaultPath to the container install dir', () => {
    // Declaring a directory var means "configurable"; even with no defaultPath the install
    // default resolves to <envRoot>/.<name> (envDirName derived from the key).
    expect(pageEnv(metaFor('p1', [{ key: 'FIXTURE_HOME' }]))).toEqual({
      FIXTURE_HOME: join(ENV_ROOT, '.fixture')
    })
  })

  it('keeps an unusable spec row out of the way', () => {
    // A manifest row missing its key can't be edited or injected — skip it, don't spawn `""=`.
    expect(pageEnv(metaFor('p1', [{ key: '' }]))).toEqual({})
    expect(pageEnv(metaFor('p1', undefined))).toEqual({})
  })
})

describe('declared text vars', () => {
  it('falls back to the manifest default and stays verbatim', () => {
    const env = pageEnv(
      metaFor('p1', [{ key: 'FIXTURE_FLAG', type: 'text', defaultValue: ' {envRoot}/literal ' }])
    )
    // No expansion for a text value: `~`/`{envRoot}` are directory conventions, and a feature
    // flag holding a literal `{envRoot}` must reach the CLI unchanged.
    expect(env).toEqual({ FIXTURE_FLAG: '{envRoot}/literal' })
  })

  it('prefers the user override, then the inherited env, over the default', () => {
    const spec: EnvVarSpec[] = [{ key: 'FIXTURE_FLAG', type: 'text', defaultValue: 'from-manifest' }]
    updateSettings({ pageEnvs: { p1: { FIXTURE_FLAG: 'from-settings' } } })
    expect(pageEnv(metaFor('p1', spec))).toEqual({ FIXTURE_FLAG: 'from-settings' })
    stubProcessEnv('FIXTURE_FLAG', 'from-process')
    expect(pageEnv(metaFor('p1', spec))).toEqual({ FIXTURE_FLAG: 'from-process' })
  })

  it('injects nothing for an optional flag nobody set', () => {
    updateSettings({ pageEnvs: { p1: { FIXTURE_FLAG: '   ' } } })
    expect(pageEnv(metaFor('p1', [{ key: 'FIXTURE_FLAG', type: 'text' }]))).toEqual({})
  })
})

describe('free-form overrides', () => {
  it('wins over a declared var of the same name', () => {
    updateSettings({
      pageCustomEnvs: { p1: { FIXTURE_HOME: join(scratch, 'user-picked') } }
    })
    const env = pageEnv(
      metaFor('p1', [{ key: 'FIXTURE_HOME', defaultPath: '{envRoot}/fixture' }])
    )
    expect(env.FIXTURE_HOME).toBe(join(scratch, 'user-picked'))
  })

  it('passes values through without expansion', () => {
    updateSettings({ pageCustomEnvs: { p1: { FIXTURE_URL: '{envRoot}/raw', FIXTURE_TILDE: '~/raw' } } })
    const env = pageEnv(metaFor('p1'))
    expect(env).toEqual({ FIXTURE_URL: '{envRoot}/raw', FIXTURE_TILDE: '~/raw' })
  })

  it('drops a name the runtime cannot take, and one the container owns', () => {
    updateSettings({
      pageCustomEnvs: {
        p1: {
          GOOD_KEY: '1',
          'BAD-KEY': '2',
          '1LEADING_DIGIT': '3',
          'HAS SPACE': '4',
          PATH: '/spoof',
          NODE_OPTIONS: '--inspect',
          npm_config_registry: 'http://evil'
        }
      }
    })
    expect(pageEnv(metaFor('p1'))).toEqual({ GOOD_KEY: '1' })
  })

  it('is scoped to the page it was written for', () => {
    updateSettings({ pageCustomEnvs: { other: { FIXTURE_FLAG: 'leak' } } })
    expect(pageEnv(metaFor('p1', [{ key: 'FIXTURE_FLAG', type: 'text' }]))).toEqual({})
  })

  it('still injects a value stored as a number by an imported snapshot', () => {
    updateSettings({ pageCustomEnvs: { p1: { FIXTURE_PORT: 8123 as unknown as string } } })
    expect(pageEnv(metaFor('p1'))).toEqual({ FIXTURE_PORT: '8123' })
  })
})

describe('start command tilde', () => {
  it('expands a leading ~ so tilde paths work without a shell', () => {
    // The replacement is textual (expandHome only maps `~` itself), so the slash the manifest
    // author typed survives — what matters is that the home prefix is real.
    expect(expandStartCommand('~/app/server.js --flag')).toBe(`${homedir()}/app/server.js --flag`)
    expect(expandStartCommand('node ~/app/server.js')).toBe(`node ${homedir()}/app/server.js`)
    // Only a standalone `~` token is a home reference; a tilde inside an argument is left alone.
    expect(expandStartCommand('echo a~b')).toBe('echo a~b')
  })
})
