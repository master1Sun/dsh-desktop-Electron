import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, basename, extname } from 'node:path'
import Store from 'electron-store'
import type { ContainerSettings, DefaultView } from '../../shared/types'
import { NPM_REGISTRY_DEFAULT } from '../../shared/types'
import { ENV_INSTALL, ENV_SYSTEM, envDirName } from '../../shared/envDir'

const DEFAULTS: ContainerSettings = {
  defaultView: { kind: 'none' },
  openExternalIn: 'embedded',
  minimizeToTray: true,
  // off by default: registering a login item is an OS-level change we never make unprompted
  launchAtStartup: false,
  // auto-run the bundled runtimes on launch: openclaw (gateway) + dsh-web (server)
  autoStartPages: ['openclaw', 'dsh-web'],
  // empty until the user pins a page's auto-start by hand; see ContainerSettings.autoStartManual
  autoStartManual: [],
  // built-in pages switched off from the Pages panel (hidden from the switcher, never started)
  disabledPages: [],
  lastExternalUrls: [],
  externalSites: [],
  theme: 'auto',
  // UI display language; defaults to Chinese
  locale: 'zh',
  // shell layout: 'classic' (top menu + floating panels) is the default; 'im' = rail + bubbles
  layoutMode: 'classic',
  // env root is no longer user-configurable: fixed at userData/env (the system-common spot).
  // The field only survives in old settings files; resolveEnvRoot() ignores it. '@system' was
  // also a persisted choice there and resolves to the same place, so nothing needs migrating.
  envRoot: '',
  dshHome: '',
  openclawHome: '',
  // empty = userData/workspace; the shared context every hosted agent reads/writes
  workspaceRoot: '',
  // empty = the OS Downloads folder; embedded-page downloads save there (see downloads.ts)
  downloadDir: '',
  pageEnvs: {},
  pagePorts: {},
  // #4: container-side per-page dependency overrides (pageId -> [depId…]); shadows container.json
  pageDeps: {},
  // free-form per-page KEY=VALUE overrides, kept apart from the directory-typed pageEnvs
  pageCustomEnvs: {},
  // DSH tracks the `alpha` dist-tag (where its prereleases are published); switchable in Settings.
  dshChannel: 'alpha',
  // container OTA follows the stable `release` branch unless the user opts into beta
  containerChannel: 'stable',
  // an over-budget page is only flagged; 'restart' opts it into a leak guard
  memLimitAction: 'notify',
  // only user-chosen shortcuts live here — every action has a built-in default
  keybindings: {},
  // a page that crashes after having run is relaunched automatically; off surfaces the error only
  crashAutoRestart: true,
  // rare user-action-needed events (guard gave up, staged update) go to the OS notification center
  systemNotifications: true,
  // #25: '' keeps each theme's CSS-defined accent; a hex overrides it live in both modes.
  accentColor: '',
  // #25: frosted-blur px; the slider overrides --glass-blur live, clamped to GLASS_BLUR_MAX_PX
  // (25) at apply time — this default sits at that ceiling, i.e. the heaviest frost.
  glassBlur: 30,
  // #25: frosted-surface opacity (%); slider overrides --glass-tint-a live (independent of blur).
  glassAlpha: 60,
  // #20: RSS (MB) over which a running page is flagged over-budget (tray resource badge).
  memWarnMb: 800,
  // bottom-docked terminal height the user dragged out; keep the default in sync with
  // TerminalDrawer's DEFAULT_H.
  terminalHeight: 320,
  // scrollback lines kept per terminal surface; clamped to TERMINAL_SCROLLBACK_MAX at create time.
  terminalScrollback: 8000,
  // how the terminal is shown: docked into the page area, or a floating overlay that can minimize.
  terminalMode: 'embedded',
  // #26: restore the last window geometry/maximized state. On by default: a container that
  // relaunches at 1280x860 every time is annoying once you've arranged it beside other windows.
  rememberWindowBounds: true,
  // #26: 'auto' keeps the previous behaviour of following the OS reduced-motion preference.
  reduceMotion: 'auto',
  // the dark-mode flowing-light border ring is on by default (decorative; switchable in Settings).
  marqueeBorder: true,
  // #26: '' = the built-in mirror (NPM_REGISTRY_DEFAULT), i.e. the pre-setting behaviour.
  npmRegistry: '',
  // #26: tray defaults mirror what the menu/badge did before they were configurable.
  trayPageEntries: 'all',
  trayBadge: 'all',
  // on by default: hosted agents get the shared workspace pointers at spawn (see runtime/workspace.ts)
  sharedWorkspace: true
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

export function updateSettings(
  partial: Partial<ContainerSettings>,
  opts: { syncAutoStartPin?: boolean } = {}
): ContainerSettings {
  const s = getStore()
  // An explicit auto-start-pages write only ever comes from a user flipping a page's switch
  // (AppManager / Pages config) — the default-open coupling uses syncAutoStartForDefaultView
  // and never routes through here. Diff old vs new so pages the user turned ON become sticky
  // pins and pages turned OFF lose the pin (and won't be re-added by a later default change).
  // A snapshot restore passes syncAutoStartPin:false: it brings its own autoStartManual, so
  // diffing against the pre-restore list would mis-pin the whole set.
  if (Array.isArray(partial.autoStartPages) && opts.syncAutoStartPin !== false) {
    const prev = new Set((s.get('autoStartPages') || []) as string[])
    const next = new Set(partial.autoStartPages)
    const manual = new Set((s.get('autoStartManual') || []) as string[])
    for (const id of next) if (!prev.has(id)) manual.add(id)
    for (const id of prev) if (!next.has(id)) manual.delete(id)
    s.set('autoStartManual', [...manual] as never)
  }
  for (const [k, v] of Object.entries(partial)) {
    if (v !== undefined) s.set(k as keyof ContainerSettings, v as never)
  }
  return getSettings()
}

/**
 * Keep the auto-start list in step with the 默认打开 selection, with a sticky manual override:
 * the new default page starts at boot (added), and the page it replaced stops auto-starting
 * *unless* the user had pinned it on by hand. Called by the UpdateSettings handler before it
 * persists the new default view; `null` id means "no page / non-startable (e.g. external)".
 */
export function syncAutoStartForDefaultView(
  prevPageId: string | null,
  nextPageId: string | null
): void {
  const s = getStore()
  const manual = new Set((s.get('autoStartManual') || []) as string[])
  const auto = new Set((s.get('autoStartPages') || []) as string[])
  if (prevPageId && prevPageId !== nextPageId && !manual.has(prevPageId)) auto.delete(prevPageId)
  if (nextPageId) auto.add(nextPageId)
  s.set('autoStartPages', [...auto] as never)
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

/**
 * Store for imported npm CLI *capabilities* (codex & friends): each gets its own
 * `<capabilities>/<id>` folder holding the package under `node_modules`, mirroring where the
 * dsh / openclaw / mcp runtimes are provisioned. Always under userData (never the repo) so a
 * globally-installed CLI survives packaged updates; the page under `pages/<id>` keeps only a thin
 * manifest that launches it.
 */
export function resolveCapabilitiesDir(): string {
  if (process.env.DSH_CAPABILITIES_DIR) return process.env.DSH_CAPABILITIES_DIR
  return join(app.getPath('userData'), 'capabilities')
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

/**
 * Root of the container's "环境目录": not user-configurable any more — always the
 * system-common userData location. Per-runtime rows still offer their own two choices
 * (the tool's system home vs a <envRoot>/<name> subdir), so '@install' keeps landing here.
 * The persisted settings.envRoot (incl. legacy free-form paths) is ignored; `<installDir>/env`
 * stays out of reach because a non-writable install dir made that choice unreliable anyway.
 */
export function resolveEnvRoot(): string {
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

/**
 * True when `dir` exists and holds at least one entry — a real prior install with data
 * (login, config, profiles), not merely the empty shell the spawn path `mkdir`s. The two-choice
 * DEFAULT uses this so a never-touched row keeps an existing system home instead of adopting the
 * independent container dir and stranding that data, which would boot dsh/openclaw against an
 * empty home and break startup. An explicit '@install' pick still forces the fresh container dir.
 */
function hasData(dir: string): boolean {
  if (!dir) return false
  try {
    return readdirSync(dir).length > 0
  } catch {
    return false
  }
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

/** dsh home: profiles live under <dshHome>/profiles/<name>. Two-choice setting:
 *  '@system' = dsh's own `~/.dsh` (shared with the CLI); '@install' = a container-owned `.dsh`
 *  subdir of the env root (userData/env), forced fresh. The DEFAULT (unset/''/legacy free path)
 *  is the independent subdir, but reuses an existing populated `~/.dsh` so a never-touched row
 *  never strands the terminal's login (which would break the page's boot). The dsh-web page's
 *  Settings row (pageEnvs DSH_HOME) feeds the same chain. */
export function resolveDshHome(): string {
  const fromEnv = (process.env.DSH_HOME || '').trim()
  if (fromEnv) return expandHome(fromEnv)
  const override =
    (getSettings().dshHome || '').trim() ||
    (getSettings().pageEnvs?.['dsh-web']?.DSH_HOME || '').trim()
  const systemHome = join(homedir(), '.dsh')
  if (override === ENV_SYSTEM) return systemHome
  const installHome = join(resolveEnvRoot(), envDirName('DSH_HOME', 'dsh-web'))
  if (override === ENV_INSTALL) return installHome
  // Unset / legacy: prefer the independent dir, but keep a populated system home in use.
  return hasData(systemHome) ? systemHome : installHome
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

/** openclaw config home: two-choice like dsh — '@system' = the CLI's own `~/.openclaw`
 *  (shared with the terminal); '@install' = a container-owned `.openclaw` subdir of the env root,
 *  forced fresh. The DEFAULT (unset/''/legacy) is the independent subdir, but reuses an existing
 *  populated `~/.openclaw` so a never-touched row keeps the config/token instead of booting an
 *  empty home. The openclaw page's Settings row (pageEnvs OPENCLAW_HOME) feeds the same chain. */
export function resolveOpenclawHome(): string {
  const fromEnv = (process.env.OPENCLAW_STATE_DIR || '').trim()
  if (fromEnv) return expandHome(fromEnv)
  const override =
    (getSettings().openclawHome || '').trim() ||
    (getSettings().pageEnvs?.['openclaw']?.OPENCLAW_HOME || '').trim()
  const systemHome = join(homedir(), '.openclaw')
  if (override === ENV_SYSTEM) return systemHome
  const installHome = join(resolveEnvRoot(), envDirName('OPENCLAW_HOME', 'openclaw'))
  if (override === ENV_INSTALL) return installHome
  // Unset / legacy: prefer the independent dir, but keep a populated system home in use.
  return hasData(systemHome) ? systemHome : installHome
}

/** Resolve one page-declared directory env var: process.env → two-choice setting → default.
 *  '@install' forces the container-owned <envRoot>/.<tool-name> subdir; '@system' selects the
 *  tool's own home — the declared `defaultPath` (e.g. `~/.dsh`), which is what the CLI uses
 *  ('' when none declared, so callers can omit the var). The DEFAULT (unset/''/a legacy free-form
 *  path) is the independent subdir, but reuses an existing populated system home (the declared
 *  default or `legacyPath`) so a never-touched row keeps its login/config instead of booting a
 *  runtime against an empty dir. `~` / `{envRoot}` are expanded. */
export function resolvePageEnv(
  pageId: string,
  key: string,
  defaultPath?: string,
  legacyPath?: string
): string {
  const fromEnv = (process.env[key] || '').trim()
  if (fromEnv) return expandHome(fromEnv)
  const override = (getSettings().pageEnvs?.[pageId]?.[key] || '').trim()
  const installDir = join(resolveEnvRoot(), envDirName(key, pageId))
  if (override === ENV_INSTALL) return installDir
  const declared = defaultPath && defaultPath.trim() ? expandEnvTemplate(defaultPath.trim()) : ''
  const legacy = (legacyPath || '').trim() ? expandHome((legacyPath || '').trim()) : ''
  if (override === ENV_SYSTEM) {
    // The tool's own home: declared default (legacy migration-guarded); '' when undeclared.
    if (!declared) return ''
    return legacy ? preferExisting(declared, legacy) : declared
  }
  // Unset / legacy: independent default, but keep a populated system home in use.
  if (hasData(declared)) return declared
  if (hasData(legacy)) return legacy
  return installDir
}

/**
 * Resolve one `type: 'text'` declared env var: process.env → user override → the manifest's
 * literal default. Nothing is expanded — unlike {@link resolvePageEnv} a text value is a verbatim
 * string (a feature flag, an API base URL), and `~` / `{envRoot}` are directory-only conventions.
 * Empty result means "inject nothing", which is how an unset optional flag stays unset.
 */
export function resolvePageTextEnv(
  pageId: string,
  key: string,
  defaultValue?: string
): string {
  return (
    (process.env[key] || '').trim() ||
    (getSettings().pageEnvs?.[pageId]?.[key] || '').trim() ||
    (defaultValue || '').trim()
  )
}

/** An env name a page may inject: a POSIX-ish identifier, and none of the container's own. */
const CUSTOM_ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * The user's free-form KEY=VALUE overrides for one page (Settings → 自定义变量), sanitized:
 * a malformed name or a reserved one (`PATH`, `NODE_OPTIONS`, …) is dropped rather than
 * trusted, because a bad value here can break every spawn or hand the child a spoofed registry.
 * Values pass through verbatim (no `~` expansion — that is a directory-env feature only).
 */
export function resolvePageCustomEnvs(pageId: string): Record<string, string> {
  const map = getSettings().pageCustomEnvs?.[pageId]
  if (!map) return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(map)) {
    if (!CUSTOM_ENV_KEY_RE.test(key)) continue
    if (RESERVED_PAGE_ENV_KEYS.has(key)) continue
    if (value === undefined || value === null) continue
    out[key] = String(value)
  }
  return out
}

/** Names the container/Node/npm own; a page override would silently corrupt its runtime. */
export const RESERVED_PAGE_ENV_KEYS = new Set([
  'PATH',
  'Path',
  'NODE_OPTIONS',
  'ELECTRON_RUN_AS_NODE',
  'npm_config_registry',
  'npm_config_prefix'
])

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

/** The OS Downloads folder, falling back to userData when the platform doesn't provide one. */
export function defaultDownloadDir(): string {
  try {
    const p = app.getPath('downloads')
    if (p) return p
  } catch {
    /* fall through */
  }
  return join(app.getPath('userData'), 'Downloads')
}

/** Effective webview download folder: the user override (`~` expanded) or the OS default. */
export function resolveDownloadDir(): string {
  const override = (getSettings().downloadDir || '').trim()
  return override ? expandHome(override) : defaultDownloadDir()
}

/**
 * Root of the container-owned *shared workspace*: a working directory plus `context.json`
 * every hosted agent discovers through DSH_WORKSPACE_DIR / DSH_WORKSPACE_FILE (see
 * runtime/workspace.ts). Defaults under userData so it survives updates; a non-empty
 * `settings.workspaceRoot` always wins, `~`/`{envRoot}`/`{userData}` expanded, so the shared
 * context can live inside a real project repo instead of an app-private folder.
 */
export function resolveWorkspaceDir(): string {
  const override = (getSettings().workspaceRoot || '').trim()
  if (override) return expandEnvTemplate(override)
  return join(app.getPath('userData'), 'workspace')
}

/**
 * #26: the npm registry every install the container drives goes through — `npm view`, dsh plugin
 * add/update, and the `npm_config_registry` injected into hosted pages. The user override wins
 * (trailing slashes stripped, since npm is picky about them); empty falls back to the built-in
 * mirror so an untouched install behaves exactly as it did before the setting existed.
 */
export function resolveNpmRegistry(): string {
  const override = (getSettings().npmRegistry || '').trim().replace(/\/+$/, '')
  return override || NPM_REGISTRY_DEFAULT
}

/**
 * npm's own default is `https://registry.npmjs.org/`, and it resolves package metadata by URL
 * joining — so both `npm_config_registry` and `--registry` get the trailing slash back. The bare
 * form ({@link resolveNpmRegistry}) is what the UI lists and compares against.
 */
export function npmRegistryWithSlash(): string {
  return `${resolveNpmRegistry()}/`
}

/**
 * #26: drop the remembered window geometry. `updateSettings` skips undefined values by design, so
 * forgetting a key has to go through the store's own delete.
 */
export function clearWindowBounds(): void {
  getStore().delete('windowBounds')
}

/**
 * Publish the resolved registry to the process environment as `npm_config_registry`.
 *
 * Why an env var instead of writing an `.npmrc`: the installed app lives under Program Files,
 * where the process has no write permission, and a user-level `~/.npmrc` is shared with their
 * own terminal — rewriting it would silently follow the container's setting everywhere. npm and
 * pnpm both rank `npm_config_*` above every `.npmrc` file, so one assignment here reaches
 * everything the container spawns: its own `npm view` probes, dsh plugin installs (via
 * {@link bundledEnv}/`envWithPATH`, which both spread `process.env`) and the hosted pages' builds.
 */
export function applyNpmRegistryEnv(): string {
  const url = npmRegistryWithSlash()
  process.env.npm_config_registry = url
  return url
}

/**
 * Pick a non-colliding path in `dir` for `filename`, appending " (1)", " (2)" … before the
 * extension, and ensure `dir` exists first. Shared by webview downloads and the app's own
 * exports (diagnostics / migration package) so every file the container writes follows the
 * same 下载目录 setting and never silently clobbers an earlier one.
 */
export function uniquePath(dir: string, filename: string): string {
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* a caller-facing write error surfaces if the dir really can't be made */
  }
  const ext = extname(filename)
  const stem = basename(filename, ext)
  for (let i = 0; i < 1000; i += 1) {
    const candidate = join(dir, i === 0 ? filename : `${stem} (${i})${ext}`)
    if (!existsSync(candidate)) return candidate
  }
  return join(dir, `${stem} (${Date.now()})${ext}`)
}

/** A collision-free path for one exported file inside the configured 下载目录. */
export function resolveExportPath(filename: string): string {
  return uniquePath(resolveDownloadDir(), filename)
}
