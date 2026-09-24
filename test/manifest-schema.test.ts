import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * D1: reading a page manifest. The rule the feature lives by is *tolerant* — a container.json
 * written for a newer container (or with a typo'd field) must still load and still run, with the
 * problem reported once instead of turning into a startup failure. These cases build throwaway
 * page trees and assert both halves: what survives into `PageMeta`, and what gets warned about.
 */

const scratch = join(tmpdir(), `dsh-container-manifest-test-${process.pid}`)
const pagesRoot = join(scratch, 'pages')

vi.mock('electron', () => {
  const stub = {
    app: {
      getAppPath: () => scratch,
      getPath: () => scratch,
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

import { MANIFEST_KEYS, readPageMeta, scanInstalledPages } from '../src/main/runtime/pages'
import { listEvents, resetEventState } from '../src/main/shell/events'
import { updateSettings } from '../src/main/shell/store'

/** Write one page directory; returns its id so the case reads it back. */
function makePage(id: string, manifest: Record<string, unknown>, files?: Record<string, string | Buffer>): string {
  const dir = join(pagesRoot, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'container.json'), JSON.stringify(manifest))
  for (const [name, content] of Object.entries(files ?? {})) {
    const file = join(dir, name)
    // Icons may live in a subdirectory, which is part of what the resolver has to get right.
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
  return id
}

function read(id: string): ReturnType<typeof readPageMeta> {
  return readPageMeta(pagesRoot, id)
}

/** Warnings are localized, so cases match the machine-readable fragment inside them. */
function warned(meta: ReturnType<typeof readPageMeta>, fragment: string): boolean {
  return (meta.manifestWarnings ?? []).some((w) => w.includes(fragment))
}

beforeEach(() => {
  rmSync(pagesRoot, { recursive: true, force: true })
  mkdirSync(pagesRoot, { recursive: true })
  // The timeline is durable, so its scratch file has to be cleared too — not just the mirror.
  rmSync(join(scratch, 'logs'), { recursive: true, force: true })
  updateSettings({ pagePorts: {}, pageEnvs: {}, pageCustomEnvs: {} })
  resetEventState()
})

afterEach(() => {
  rmSync(pagesRoot, { recursive: true, force: true })
})

describe('manifest v1 additions', () => {
  it('reads the new optional fields and stays quiet about $schema', () => {
    const dataUrl = 'data:image/svg+xml;base64,AAAA'
    makePage('rich', {
      $schema: '../../pages/container.schema.json',
      schemaVersion: 1,
      name: 'Rich Page',
      author: '  someone  ',
      version: '2.1.0',
      icon: dataUrl,
      permissions: ['notify', 'downloads'],
      port: 3001,
      startCommand: 'node server.js'
    })
    const meta = read('rich')
    expect(meta.schemaVersion).toBe(1)
    // Author/version are trimmed but otherwise verbatim; an all-whitespace value reads as unset.
    expect(meta.author).toBe('someone')
    expect(meta.version).toBe('2.1.0')
    // A `data:` icon is handed to the renderer untouched — it is already a usable `src`.
    expect(meta.iconUrl).toBe(dataUrl)
    expect(meta.permissions).toEqual(['notify', 'downloads'])
    expect(meta.manifestWarnings).toBeUndefined()
  })

  it('treats a blank author/version as unset rather than an empty chip in the UI', () => {
    makePage('blanks', { port: 3002, startCommand: 'node server.js', author: '   ', version: '' })
    const meta = read('blanks')
    expect(meta.author).toBeUndefined()
    expect(meta.version).toBeUndefined()
  })

  it('keeps a name fallback so a manifest without one still labels the page', () => {
    makePage('unnamed', { port: 3003, startCommand: 'node server.js' })
    expect(read('unnamed').name).toBe('unnamed')
  })

  it("carries an imported npm CLI capability's package + dir into PageMeta", () => {
    makePage('capx', {
      kind: 'terminal',
      startCommand: 'node "/abs/capabilities/capx/node_modules/@openai/codex/bin/codex.js"',
      npmPackage: '@openai/codex',
      capabilityDir: join(scratch, 'capabilities', 'capx')
    })
    const meta = read('capx')
    expect(meta.npmPackage).toBe('@openai/codex')
    expect(meta.capabilityDir).toBe(join(scratch, 'capabilities', 'capx'))
    // Both keys are known, so the capability page loads with no manifest warning.
    expect(meta.manifestWarnings).toBeUndefined()
  })

  it('treats a blank npmPackage/capabilityDir as unset rather than an empty string', () => {
    makePage('capblank', {
      kind: 'terminal',
      startCommand: 'node server.js',
      npmPackage: '   ',
      capabilityDir: ''
    })
    const meta = read('capblank')
    expect(meta.npmPackage).toBeUndefined()
    expect(meta.capabilityDir).toBeUndefined()
  })
})

describe('tolerant validation', () => {
  it('warns about an unknown field and a wrong type but still loads the page', () => {
    makePage('sloppy', {
      name: 'Sloppy',
      // A field from a future container: ignored, but never fatal.
      futureFeature: { enabled: true },
      port: '3004',
      startCommand: 'node server.js'
    })
    const meta = read('sloppy')
    expect(warned(meta, 'futureFeature')).toBe(true)
    expect(warned(meta, 'port')).toBe(true)
    // `Number('3004')` still works, so the page is usable — the warning is the whole penalty.
    expect(meta.port).toBe(3004)
    expect(meta.startCommand).toBe('node server.js')
  })

  it('warns about a permission the container does not implement and keeps it for display', () => {
    makePage('nosy', {
      port: 3005,
      startCommand: 'node server.js',
      permissions: ['notify', 'readAllFiles', 7]
    })
    const meta = read('nosy')
    expect(warned(meta, 'readAllFiles')).toBe(true)
    // Non-strings are dropped from the record (the renderer would interpolate "7" as a
    // capability); the unknown name is kept, so the declared list stays honest.
    expect(meta.permissions).toEqual(['notify', 'readAllFiles'])
  })

  it('warns when permissions is not a list at all', () => {
    makePage('badperm', { port: 3006, startCommand: 'node server.js', permissions: 'notify' })
    expect(warned(read('badperm'), 'permissions')).toBe(true)
  })

  it('warns about an envVars editor kind it cannot render and drops it', () => {
    makePage('badenv', {
      port: 3007,
      startCommand: 'node server.js',
      envVars: [
        { key: 'OK_DIR' },
        { key: 'BOGUS_VAR', type: 'select' },
        { key: 'TEXT_VAR', type: 'text', defaultValue: 'x' }
      ]
    })
    const meta = read('badenv')
    expect(warned(meta, 'BOGUS_VAR')).toBe(true)
    const byKey = Object.fromEntries((meta.envVars ?? []).map((v) => [v.key, v]))
    expect(byKey['OK_DIR'].type).toBeUndefined()
    expect(byKey['TEXT_VAR'].type).toBe('text')
    expect(byKey['BOGUS_VAR'].type).toBeUndefined()
  })

  it('records only the non-empty, non-self dependencies', () => {
    makePage('deps', {
      port: 3008,
      startCommand: 'node server.js',
      dependsOn: ['other', 'deps', '  spaced  ', '', 12]
    })
    expect(read('deps').dependsOn).toEqual(['other', 'spaced'])
  })

  it('ignores a health check on a page that has no local server', () => {
    makePage('ext', { external: true, externalUrl: 'https://example.com', healthUrl: '/healthz' })
    const meta = read('ext')
    expect(meta.external).toBe(true)
    expect(meta.healthUrl).toBeUndefined()

    makePage('local', { port: 3009, startCommand: 'node server.js', healthUrl: ' /healthz ' })
    expect(read('local').healthUrl).toBe('/healthz')
  })
})

describe('icon resolution', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  it('inlines a file from the page directory as a data URL', () => {
    makePage('iconified', { port: 3010, startCommand: 'node server.js', icon: 'assets/icon.png' }, {
      'assets/icon.png': PNG
    })
    const meta = read('iconified')
    expect(meta.iconUrl).toBe(`data:image/png;base64,${PNG.toString('base64')}`)
    expect(meta.manifestWarnings).toBeUndefined()
  })

  it('refuses an icon above the inline cap', () => {
    makePage('huge', { port: 3011, startCommand: 'node server.js', icon: 'big.png' }, {
      'big.png': Buffer.alloc(65 * 1024, 1)
    })
    const meta = read('huge')
    expect(meta.iconUrl).toBeUndefined()
    expect(warned(meta, '64')).toBe(true)
  })

  it('refuses a data URL past the cap too', () => {
    makePage('huge-data', {
      port: 3012,
      startCommand: 'node server.js',
      icon: `data:image/png;base64,${'A'.repeat(64 * 1024 * 2 + 10)}`
    })
    expect(read('huge-data').iconUrl).toBeUndefined()
  })

  it('refuses paths that leave the page directory or are not images', () => {
    for (const [id, icon] of [
      ['escape', '../outside.png'],
      ['absolute', join(scratch, 'outside.png')],
      ['root-relative', '/etc/passwd.png'],
      ['wrong-type', 'notes.txt']
    ] as const) {
      makePage(id, { port: 3013, startCommand: 'node server.js', icon })
      const meta = read(id)
      expect(meta.iconUrl, id).toBeUndefined()
      expect(warned(meta, icon), id).toBe(true)
    }
  })

  it('warns instead of throwing when the icon file is simply gone', () => {
    makePage('ghost', { port: 3014, startCommand: 'node server.js', icon: 'missing.png' })
    const meta = read('ghost')
    expect(meta.iconUrl).toBeUndefined()
    expect(warned(meta, 'missing.png')).toBe(true)
  })
})

describe('plain page defaults', () => {
  it('auto-declares APP_DIR so an imported page has a configurable directory', () => {
    makePage('plain', { port: 3015, startCommand: 'node server.js' })
    const meta = read('plain')
    expect(meta.envVars?.[0]?.key).toBe('APP_DIR')
    expect(meta.envVars?.[0]?.defaultPath).toBe(join(pagesRoot, 'plain'))
  })

  it('does not inject APP_DIR for an external page or over a declared one', () => {
    makePage('ext2', { external: true, externalUrl: 'https://example.com' })
    expect(read('ext2').envVars).toBeUndefined()

    makePage('declared', {
      port: 3016,
      startCommand: 'node server.js',
      envVars: [{ key: 'APP_DIR', defaultPath: '{envRoot}/mine' }]
    })
    const meta = read('declared')
    expect(meta.envVars).toHaveLength(1)
    expect(meta.envVars?.[0]?.defaultPath).toBe('{envRoot}/mine')
  })
})

describe('timeline reporting', () => {
  it('logs one manifest.invalid event per distinct problem set, not per scan', () => {
    makePage('chatty', { port: 3020, startCommand: 'node server.js', futureFeature: 1 })
    // The page list re-scans on every refresh; a typo'd field must not bury the timeline.
    scanInstalledPages(pagesRoot)
    scanInstalledPages(pagesRoot)
    scanInstalledPages(pagesRoot)
    const events = listEvents({ kind: 'manifest.invalid' })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ pageId: 'chatty', level: 'warn' })
    expect(events[0]?.detail).toContain('futureFeature')

    // Fixing the manifest clears the row, so a later regression is reported again.
    makePage('chatty', { port: 3020, startCommand: 'node server.js' })
    scanInstalledPages(pagesRoot)
    makePage('chatty', { port: 3020, startCommand: 'node server.js', anotherBad: 1 })
    scanInstalledPages(pagesRoot)
    const after = listEvents({ kind: 'manifest.invalid' })
    expect(after).toHaveLength(2)
    expect(after[0]?.detail).toContain('anotherBad')
  })
})

describe('container.schema.json', () => {
  it('documents exactly the keys readPageMeta accepts', () => {
    // The schema file is hand-written, so it is the one artifact of D1 that can go stale on its
    // own: a field added here but not there punishes authors who opted into validation with an
    // editor error on a key the container reads happily (and vice versa advertises a field that
    // would come back as an unknown-key warning). `$schema` is deliberately read-list-only.
    const schema = JSON.parse(
      readFileSync(join(__dirname, '..', 'pages', 'container.schema.json'), 'utf-8')
    ) as { properties?: Record<string, unknown> }
    const documented = Object.keys(schema.properties ?? {})
    expect(new Set(documented)).toEqual(new Set([...MANIFEST_KEYS].filter((k) => k !== '$schema')))
  })
})
