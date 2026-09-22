import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, rmSync } from 'node:fs'
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

const ENV_ROOT = join(scratch, 'env')

/** Point the whole env chain at a scratch tree so the case never touches a real `~/.dsh`. */
function setEnvRoot(): void {
  updateSettings({ envRoot: ENV_ROOT })
}

const savedProcessEnv: Record<string, string | undefined> = {}

function stubProcessEnv(key: string, value: string | undefined): void {
  if (!(key in savedProcessEnv)) savedProcessEnv[key] = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

beforeEach(() => {
  rmSync(scratch, { recursive: true, force: true })
  setEnvRoot()
  updateSettings({ pageEnvs: {}, pageCustomEnvs: {} })
})

afterEach(() => {
  for (const [key, value] of Object.entries(savedProcessEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('declared directory vars', () => {
  it('expands {envRoot} in a default and creates the directory', () => {
    const env = buildPageEnv(
      metaFor('p1', [{ key: 'FIXTURE_HOME', defaultPath: '{envRoot}/fixture' }])
    )
    // The placeholder is substituted textually, so the manifest's own separator survives
    // (`env/fixture` on Windows) — both spellings resolve to the same directory there.
    expect(env).toEqual({ FIXTURE_HOME: `${ENV_ROOT}/fixture` })
    // The var names a home dir a CLI aborts on when missing, so declaring it creates it.
    expect(existsSync(join(ENV_ROOT, 'fixture'))).toBe(true)
  })

  it('lets a user override beat the declared default, and expands ~', () => {
    stubProcessEnv('FIXTURE_HOME', undefined)
    updateSettings({ pageEnvs: { p1: { FIXTURE_HOME: '~/fixture-override' } } })
    const env = buildPageEnv(
      metaFor('p1', [{ key: 'FIXTURE_HOME', defaultPath: '{envRoot}/fixture' }])
    )
    expect(env.FIXTURE_HOME).toBe(join(homedir(), 'fixture-override'))
  })

  it('lets the inherited process env beat both', () => {
    stubProcessEnv('FIXTURE_HOME', join(scratch, 'from-process'))
    updateSettings({ pageEnvs: { p1: { FIXTURE_HOME: join(scratch, 'from-settings') } } })
    const env = buildPageEnv(metaFor('p1', [{ key: 'FIXTURE_HOME', defaultPath: '{envRoot}/x' }]))
    expect(env.FIXTURE_HOME).toBe(join(scratch, 'from-process'))
  })

  it('omits a var with nothing behind it instead of injecting an empty string', () => {
    expect(buildPageEnv(metaFor('p1', [{ key: 'FIXTURE_HOME' }]))).toEqual({})
  })

  it('keeps an unusable spec row out of the way', () => {
    // A manifest row missing its key can't be edited or injected — skip it, don't spawn `""=`.
    expect(buildPageEnv(metaFor('p1', [{ key: '' }]))).toEqual({})
    expect(buildPageEnv(metaFor('p1', undefined))).toEqual({})
  })
})

describe('declared text vars', () => {
  it('falls back to the manifest default and stays verbatim', () => {
    const env = buildPageEnv(
      metaFor('p1', [{ key: 'FIXTURE_FLAG', type: 'text', defaultValue: ' {envRoot}/literal ' }])
    )
    // No expansion for a text value: `~`/`{envRoot}` are directory conventions, and a feature
    // flag holding a literal `{envRoot}` must reach the CLI unchanged.
    expect(env).toEqual({ FIXTURE_FLAG: '{envRoot}/literal' })
  })

  it('prefers the user override, then the inherited env, over the default', () => {
    const spec: EnvVarSpec[] = [{ key: 'FIXTURE_FLAG', type: 'text', defaultValue: 'from-manifest' }]
    updateSettings({ pageEnvs: { p1: { FIXTURE_FLAG: 'from-settings' } } })
    expect(buildPageEnv(metaFor('p1', spec))).toEqual({ FIXTURE_FLAG: 'from-settings' })
    stubProcessEnv('FIXTURE_FLAG', 'from-process')
    expect(buildPageEnv(metaFor('p1', spec))).toEqual({ FIXTURE_FLAG: 'from-process' })
  })

  it('injects nothing for an optional flag nobody set', () => {
    updateSettings({ pageEnvs: { p1: { FIXTURE_FLAG: '   ' } } })
    expect(buildPageEnv(metaFor('p1', [{ key: 'FIXTURE_FLAG', type: 'text' }]))).toEqual({})
  })
})

describe('free-form overrides', () => {
  it('wins over a declared var of the same name', () => {
    updateSettings({
      pageCustomEnvs: { p1: { FIXTURE_HOME: join(scratch, 'user-picked') } }
    })
    const env = buildPageEnv(
      metaFor('p1', [{ key: 'FIXTURE_HOME', defaultPath: '{envRoot}/fixture' }])
    )
    expect(env.FIXTURE_HOME).toBe(join(scratch, 'user-picked'))
  })

  it('passes values through without expansion', () => {
    updateSettings({ pageCustomEnvs: { p1: { FIXTURE_URL: '{envRoot}/raw', FIXTURE_TILDE: '~/raw' } } })
    const env = buildPageEnv(metaFor('p1'))
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
    expect(buildPageEnv(metaFor('p1'))).toEqual({ GOOD_KEY: '1' })
  })

  it('is scoped to the page it was written for', () => {
    updateSettings({ pageCustomEnvs: { other: { FIXTURE_FLAG: 'leak' } } })
    expect(buildPageEnv(metaFor('p1', [{ key: 'FIXTURE_FLAG', type: 'text' }]))).toEqual({})
  })

  it('still injects a value stored as a number by an imported snapshot', () => {
    updateSettings({ pageCustomEnvs: { p1: { FIXTURE_PORT: 8123 as unknown as string } } })
    expect(buildPageEnv(metaFor('p1'))).toEqual({ FIXTURE_PORT: '8123' })
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
