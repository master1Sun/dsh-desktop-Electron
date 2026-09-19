import { app } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import Store from 'electron-store'
import type { ContainerSettings, DefaultView } from '../shared/types'

const DEFAULTS: ContainerSettings = {
  defaultView: { kind: 'none' },
  openExternalIn: 'embedded',
  minimizeToTray: true,
  // auto-run the three bundled runtimes on launch: codex (terminal), openclaw (gateway), dsh-web (server)
  autoStartPages: ['codex', 'openclaw', 'dsh-web'],
  lastExternalUrls: [],
  externalSites: [],
  theme: 'auto',
  dshHome: '',
  openclawHome: '',
  pageEnvs: {},
  pagePorts: {}
}

let store: Store<ContainerSettings> | null = null

export function getStore(): Store<ContainerSettings> {
  if (!store) {
    store = new Store<ContainerSettings>({ name: 'container-settings', defaults: DEFAULTS })
  }
  return store
}

export function getSettings(): ContainerSettings {
  return { ...DEFAULTS, ...(getStore().store as ContainerSettings) }
}

export function updateSettings(partial: Partial<ContainerSettings>): ContainerSettings {
  const s = getStore()
  for (const [k, v] of Object.entries(partial)) {
    if (v !== undefined) s.set(k as keyof ContainerSettings, v as never)
  }
  return getSettings()
}

export function setDefaultView(view: DefaultView): void {
  const s = getStore()
  s.set('defaultView', view as never)
  if (view.kind === 'external') {
    const list = (s.get('lastExternalUrls') || []).filter((u) => u !== view.url)
    list.unshift(view.url)
    s.set('lastExternalUrls', list.slice(0, 10) as never)
  }
}

/** project root: dev = repo checkout; packaged = inside asar (read-only) */
export function resolveProjectDir(): string {
  return app.getAppPath()
}

/** pages/ lives in the repo in dev so it is editable; packaged it moves to userData so installs survive updates */
export function resolvePagesDir(): string {
  if (process.env.DSH_PAGES_DIR) return process.env.DSH_PAGES_DIR
  if (app.isPackaged) return join(app.getPath('userData'), 'pages')
  return join(resolveProjectDir(), 'pages')
}

/** dsh runtime roots, most-recently-writable first: userData survives packaged updates
    (reprovision upgrade target), resources/dsh ships with the installer / dev provision.
    Deliberately NOT the repo root: dsh locates pnpm via `import.meta.resolve('@pnpm/exe/pnpm')`
    walking up from its own install dir, and this repo's node_modules holds @pnpm/exe as a
    directory — spawning that fails. Provisioned prefixes never contain it. */
export function resolveDshRuntimeDirs(): string[] {
  const pinned = (process.env.DSH_DSH_ROOT || '').trim()
  const roots = [
    join(app.getPath('userData'), 'dsh'),
    join(process.resourcesPath || '', 'dsh'),
    join(app.getAppPath(), 'resources', 'dsh'),
    join(process.cwd(), 'resources', 'dsh')
  ].filter(Boolean)
  return pinned ? [pinned, ...roots.filter((r) => r !== pinned)] : roots
}

/** dsh home: profiles live under <dshHome>/profiles/<name>. Defaults to dsh's own `~/.dsh` (matching the CLI's precedence: explicit config → $DSH_HOME → ~/.dsh) so the container manages the same profiles as the terminal by default; any non-empty setting overrides, with `~` expanded. The dsh-web page's Settings "DSH 配置目录" (pageEnvs DSH_HOME) is honored too, so that input actually takes effect. */
export function resolveDshHome(): string {
  const fromEnv = (process.env.DSH_HOME || '').trim()
  if (fromEnv) return expandHome(fromEnv)
  const override =
    (getSettings().dshHome || '').trim() ||
    (getSettings().pageEnvs?.['dsh-web']?.DSH_HOME || '').trim()
  if (!override) return join(homedir(), '.dsh')
  return expandHome(override)
}

export function expandHome(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/') || p.startsWith('~\\')) return join(homedir(), p.slice(2))
  return p
}

export function resolveDshProfileDir(profile: string): string {
  const safe = profile.replace(/[^\w-]/g, '')
  return join(resolveDshHome(), 'profiles', safe || 'web')
}

/** openclaw config home: defaults to the CLI's own `~/.openclaw`; any non-empty setting overrides (`~` expanded). The openclaw page's Settings "OPENCLAW 配置目录" (pageEnvs OPENCLAW_HOME) is honored too. */
export function resolveOpenclawHome(): string {
  const fromEnv = (process.env.OPENCLAW_STATE_DIR || '').trim()
  if (fromEnv) return expandHome(fromEnv)
  const override =
    (getSettings().openclawHome || '').trim() ||
    (getSettings().pageEnvs?.['openclaw']?.OPENCLAW_HOME || '').trim()
  if (!override) return join(homedir(), '.openclaw')
  return expandHome(override)
}

/** Resolve one page-declared directory env var: process.env → user override → spec default.
    Returns '' when none is set so callers can omit the var entirely. `~` is expanded. */
export function resolvePageEnv(pageId: string, key: string, defaultPath?: string): string {
  const fromEnv = (process.env[key] || '').trim()
  if (fromEnv) return expandHome(fromEnv)
  const override = (getSettings().pageEnvs?.[pageId]?.[key] || '').trim()
  if (override) return expandHome(override)
  if (defaultPath && defaultPath.trim()) return expandHome(defaultPath.trim())
  return ''
}

export function isValidPort(port: unknown): port is number {
  return Number.isInteger(Number(port)) && Number(port) >= 1 && Number(port) <= 65535
}

/** User port override for a page; 0 means "not overridden, use container.json". */
export function resolvePagePort(pageId: string, declared: number): number {
  const override = getSettings().pagePorts?.[pageId]
  return isValidPort(override) ? Number(override) : declared
}
