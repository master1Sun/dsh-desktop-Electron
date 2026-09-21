import { app } from 'electron'
import { accessSync, existsSync, mkdirSync } from 'node:fs'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import Store from 'electron-store'
import type { ContainerSettings, DefaultView } from '../shared/types'

const DEFAULTS: ContainerSettings = {
  defaultView: { kind: 'none' },
  openExternalIn: 'embedded',
  minimizeToTray: true,
  // off by default: registering a login item is an OS-level change we never make unprompted
  launchAtStartup: false,
  // auto-run the bundled runtimes on launch: openclaw (gateway) + dsh-web (server)
  autoStartPages: ['openclaw', 'dsh-web'],
  lastExternalUrls: [],
  externalSites: [],
  theme: 'auto',
  // UI display language; defaults to Chinese
  locale: 'zh',
  // empty = follow the install directory (<installDir>/env); see resolveEnvRoot()
  envRoot: '',
  dshHome: '',
  openclawHome: '',
  pageEnvs: {},
  pagePorts: {},
  // a page that crashes after having run is relaunched automatically; off surfaces the error only
  crashAutoRestart: true
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

/** Directory holding the app executable — the install dir when packaged, the repo root in dev. */
export function resolveInstallDir(): string {
  if (app.isPackaged) {
    try {
      return dirname(app.getPath('exe'))
    } catch {
      /* fall through to the app path */
    }
  }
  return resolveProjectDir()
}

/** True when `dir` exists (or can be created) and is writable — runtime state needs both. */
function isWritableDir(dir: string): boolean {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    accessSync(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Root of the container's "环境目录": every runtime's config/state dir defaults into a
 * subdir of it (dsh → <root>/dsh, openclaw → <root>/openclaw).
 * Default follows the install directory so a self-contained install keeps its data next
 * to the app; when the install dir isn't writable (e.g. C:\Program Files) it falls back
 * to userData. A non-empty `settings.envRoot` always wins.
 */
export function resolveEnvRoot(): string {
  const override = (getSettings().envRoot || '').trim()
  if (override) return expandHome(override)
  if (app.isPackaged) {
    const candidate = join(resolveInstallDir(), 'env')
    if (isWritableDir(candidate)) return candidate
  }
  return join(app.getPath('userData'), 'env')
}

/** Expand the `{envRoot}` / `{userData}` placeholders used by container.json defaultPaths. */
export function expandEnvTemplate(p: string): string {
  if (!p) return p
  return expandHome(p)
    .replace(/\{envRoot\}/g, resolveEnvRoot())
    .replace(/\{userData\}/g, app.getPath('userData'))
}

/**
 * Pick between the new env-root default and a legacy home dir: moving an existing
 * install's data would silently orphan its profiles/plugins, so keep the old location
 * while it exists and only adopt the new default when nothing is there yet.
 */
function preferExisting(candidate: string, legacy: string): string {
  return existsSync(candidate) || !existsSync(legacy) ? candidate : legacy
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
  if (!override) {
    // dsh CLI's own native home: the container manages the same profiles as the terminal.
    return join(homedir(), '.dsh')
  }
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
  if (!override) {
    // openclaw CLI's own native home: the container manages the same config as the terminal.
    return join(homedir(), '.openclaw')
  }
  return expandHome(override)
}

/** Resolve one page-declared directory env var: process.env → user override → spec default.
    Returns '' when none is set so callers can omit the var entirely. `~` is expanded.
    `legacyPath` names the CLI's own pre-container home: while it exists it wins over the
    new default, so an existing install (login state, sessions, config) stays in use —
    same migration guard dsh/openclaw get. */
export function resolvePageEnv(
  pageId: string,
  key: string,
  defaultPath?: string,
  legacyPath?: string
): string {
  const fromEnv = (process.env[key] || '').trim()
  if (fromEnv) return expandHome(fromEnv)
  const override = (getSettings().pageEnvs?.[pageId]?.[key] || '').trim()
  if (override) return expandHome(override)
  // Declared defaults may use {envRoot} so they follow the install dir / user override.
  if (defaultPath && defaultPath.trim()) {
    const candidate = expandEnvTemplate(defaultPath.trim())
    const legacy = (legacyPath || '').trim()
    return legacy ? preferExisting(candidate, expandHome(legacy)) : candidate
  }
  return ''
}

export function isValidPort(port: unknown): port is number {
  return Number.isInteger(Number(port)) && Number(port) >= 1 && Number(port) <= 65535
}

/**
 * Register (or clear) the OS login item so the container starts at boot. When enabled we pass
 * `--autostart` as the launch argument: the main process sees it and boots straight into the tray
 * (window created hidden) instead of popping up over the user's desktop. `openAsHidden` only
 * applies on macOS, so the arg is what actually drives the minimize-to-tray on Windows.
 *
 * Dev is skipped on purpose — it would register `electron.exe` running this repo as a login item.
 */
export function applyLaunchAtStartup(enabled: boolean): void {
  if (!app.isPackaged) return
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: enabled,
      args: enabled ? ['--autostart'] : []
    })
  } catch (err) {
    console.warn('[container] setLoginItemSettings failed:', (err as Error).message)
  }
}

/** User port override for a page; 0 means "not overridden, use container.json". */
export function resolvePagePort(pageId: string, declared: number): number {
  const override = getSettings().pagePorts?.[pageId]
  return isValidPort(override) ? Number(override) : declared
}
