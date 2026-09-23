export const NODE_VERSION_REQUIRED = 'v24.21.0'

/** Upstream git repo the desktop container itself updates from (self-update via git pull). */
export const CONTAINER_REPO_URL = 'https://github.com/master1Sun/dsh-desktop-Electron.git'

/**
 * Every human-facing timestamp — main-process log stamps, exported bundle fields, snapshot /
 * diagnostic file names, and UI time labels — renders in this zone so reports from different
 * machines read the same wall-clock. Single source so the main process and renderer never drift.
 */
export const DISPLAY_TIME_ZONE = 'Asia/Shanghai'

/**
 * Short suffix noting the zone on bare formatted times (which otherwise read ambiguous to a user
 * in another region). Kept separate from {@link DISPLAY_TIME_ZONE} because the IANA id is for
 * Intl, the label is for people.
 */
export const DISPLAY_TIME_ZONE_LABEL = 'UTC+8'

/**
 * #25: ceiling (px) for the frosted-glass blur the 毛玻璃效果 slider can reach. The slider
 * itself stays 0–100 (%); the settings value (`glassBlur`) is written straight to
 * `--glass-blur`, so both the preview and the persisted value are clamped to this range —
 * configs saved while the max was still 60 keep working, they just top out here.
 */
export const GLASS_BLUR_MAX_PX = 25

/**
 * UI ceiling of the 毛玻璃效果 slider, in frost percent. The frost scale stays 0–100
 * internally (blur px and surface opacity derive from it), but the slider stops at 40:
 * past that every glass surface smears into a smudge. Persisted settings from before the
 * cap keep their value on disk; renderers clamp to the derived ceilings below.
 */
export const GLASS_FROST_MAX_PCT = 40
/** Blur (px) the frost scale reaches at the slider ceiling (linear to GLASS_BLUR_MAX_PX). */
export const GLASS_FROST_MAX_BLUR_PX = Math.round((GLASS_BLUR_MAX_PX * GLASS_FROST_MAX_PCT) / 100)
/** Least opaque (max transparent) surface % the frost scale reaches at the slider ceiling
 *  (same 96→8 mapping the settings slider uses: frost f ⇒ 96 − f/100 × 88). */
export const GLASS_FROST_MIN_ALPHA_PCT = Math.round(96 - (GLASS_FROST_MAX_PCT / 100) * (96 - 8))

/**
 * #26: the npm registries the 网络镜像 panel can probe and switch between. First entry is the
 * built-in default (what the container used before the setting existed), so an empty
 * `npmRegistry` and picking this row are the same thing.
 */
export const REGISTRY_CANDIDATES: RegistryCandidate[] = [
  {
    id: 'npmmirror',
    url: 'https://registry.npmmirror.com',
    label: { zh: 'npmmirror（国内默认）', en: 'npmmirror (built-in default)' },
    builtin: true
  },
  { id: 'npm', url: 'https://registry.npmjs.org', label: { zh: 'npm 官方', en: 'npm official' } },
  {
    id: 'tencent',
    url: 'https://mirrors.cloud.tencent.com/npm',
    label: { zh: '腾讯云', en: 'Tencent Cloud' }
  },
  {
    id: 'huawei',
    url: 'https://repo.huaweicloud.com/repository/npm',
    label: { zh: '华为云', en: 'Huawei Cloud' }
  }
]

/** Built-in registry every install falls back to when the user picked none. */
export const NPM_REGISTRY_DEFAULT = REGISTRY_CANDIDATES[0].url

export type PageStatus = 'stopped' | 'starting' | 'running' | 'error'

/** 'terminal' = a CLI-only project: no HTTP port, runs inside the embedded terminal */
export type PageKind = 'page' | 'dsh' | 'openclaw' | 'terminal'

/** default port openclaw's gateway listens on (matches `openclaw gateway --port`) */
export const OPENCLAW_DEFAULT_PORT = 18789

/**
 * A text field in a page's `container.json`. A plain string is language-neutral and used
 * for every locale (all pre-existing manifests keep working unchanged); the object form
 * carries per-language variants. A locale that is not listed falls back to the other
 * variant, then to the caller's default — see `resolveText()` in the main process, which
 * resolves every field of this shape before the value travels over IPC.
 */
export type LocalizableText = string | { zh?: string; en?: string }

/** A configurable "home"/directory env var a page declares in its container.json `envVars` list.
    The container renders one settings input per entry and injects `<key>=<resolved path>` into
    that page's subprocess env at spawn (per-kind: only pages declaring the var receive it).

    `label` / `description` are *resolved* here (plain strings in the active language): the file
    may author them as {@link LocalizableText}, and the main process flattens them when it reads
    the manifest, so no consumer downstream of IPC has to know about locales. */
export interface EnvVarSpec {
  /** env var name to inject, e.g. DSH_HOME / OPENCLAW_STATE_DIR / MYAPP_HOME */
  key: string
  /** short label shown in the settings panel; falls back to the key */
  label?: string
  /** default directory used when the user leaves the override empty (supports ~); also shown as placeholder */
  defaultPath?: string
  /** A pre-existing directory the CLI used before the container managed it (e.g. ~/.codex).
      While it exists it keeps winning over `defaultPath`, so an install that already
      signed in / stored sessions there isn't silently orphaned by the move. */
  legacyPath?: string
  /** helper text under the input explaining what this directory holds */
  description?: string
  /**
   * Editor kind for the generated settings input. Absent/'dir' keeps the historical behaviour
   * (directory picker, value resolved through the home-dir precedence chain and auto-created).
   * 'text' turns the row into a free-form string the manifest author can default via
   * `defaultValue` — for feature flags / API base URLs that aren't paths.
   */
  type?: 'dir' | 'text'
  /** literal fallback for `type: 'text'` vars when the user set no override (no `~` expansion) */
  defaultValue?: string
}

export interface PageMeta {
  /** unique id, defaults to directory name */
  id: string
  /** display name */
  name: string
  /** relative or absolute dir under pages/ */
  dir: string
  /** port declared by the project itself (container.json) */
  port: number
  /** port the container actually binds/injects: the user override when set, else `port` */
  containerPort?: number
  /** start command executed with the bundled node, e.g. "node server.js" or "npm run start" */
  startCommand: string
  description?: string
  /** true when the project has no local http server and should be shown via external URL */
  external?: boolean
  /** url used when external=true */
  externalUrl?: string
  /** runtime kind: plain node page, dsh launcher profile, or managed openclaw gateway */
  kind?: PageKind
  /** shipped with the container (ensure-pages / repo pages/) — cannot be removed */
  builtin?: boolean
  /** dsh profile name when kind=dsh */
  dshProfile?: string
  /** directory env vars this page wants the user to configure (rendered dynamically in Settings) */
  envVars?: EnvVarSpec[]
  /**
   * Show this page in the top-bar 应用 menu with the generic AppManager panel (start/stop,
   * port, declared envVars, update state). container.json may declare it explicitly;
   * built-in agent kinds (dsh / openclaw) default to true so they always appear there.
   */
  manageAsApp?: boolean
  /**
   * Page ids that must be running before this page starts (container.json `dependsOn`).
   * `startWithDeps` boots them in order and refuses cycles; auto-start honours it too.
   */
  dependsOn?: string[]
  /**
   * Health endpoint polled after the port is LISTEN (and every 30s while running).
   * A full `http(s)://…` URL, or a path appended to `http://127.0.0.1:{port}`; `{port}`
   * inside the value is substituted. A hung-but-alive process is killed so the crash
   * guard's restart ladder takes over instead of the row silently lying.
   */
  healthUrl?: string
  /**
   * Manifest schema the project targets (container.json `schemaVersion`). Absent = the
   * pre-versioning shape. Only recorded and surfaced: the container reads every field it
   * knows regardless, so an *older* page never needs a bump to keep working.
   */
  schemaVersion?: number
  /** manifest author string, shown in the page config dialog */
  author?: string
  /** the page's own version (independent of any git/npm update signal) */
  version?: string
  /**
   * Ready-to-use icon for the row: a `data:` URL, or a path relative to the page directory.
   * The main process reads the file and inlines it, so the renderer never resolves paths
   * inside `pages/`. Undefined (or rejected for size) = the UI's letter/default glyph.
   */
  iconUrl?: string
  /**
   * Declared capabilities (container.json `permissions`), e.g. ['notify', 'downloads',
   * 'externalShell']. Declarative only — recorded and displayed so a third-party page can be
   * reviewed for what it *asks* for; nothing is gated on it yet.
   */
  permissions?: string[]
  /**
   * Non-fatal container.json problems found while reading the manifest (unknown keys, wrong
   * types). Surfaced in the page config dialog so an author sees typos instead of silently
   * having a field ignored.
   */
  manifestWarnings?: string[]
}

export interface PageState extends PageMeta {
  status: PageStatus
  pid?: number
  startedAt?: number
  exitCode?: number | null
  lastError?: string
  url?: string
  /** url carrying any runtime auth/launch params (dsh web tokens); preferred by the webview */
  launchUrl?: string
  /** abnormal exits observed in the current crash-restart window (health guard counter) */
  crashes?: number
  /** epoch ms of the pending auto-restart when the health guard is retrying a crashed page */
  nextRestartAt?: number
  /**
   * Hosted dsh/openclaw pages can't run until their on-demand CLI runtime is provisioned into
   * userData (the slim installer ships none). The main process probes this synchronously on every
   * list and reports it here so the renderer's badges/guards and the default-view restore share
   * one race-free source instead of awaiting the async status IPC. Only ever `true` for a stopped
   * dsh/openclaw page; `undefined` otherwise (plain/terminal/external, or a running page).
   */
  runtimeMissing?: boolean
  /**
   * The user switched this built-in page (dsh-web / openclaw) off in the Pages panel:
   * it leaves the page switcher, never auto-starts, and refuses manual starts while set.
   * Only ever `true` for a built-in page; the flag lives in settings (`disabledPages`),
   * joined onto the state by the registry so every renderer surface shares one source.
   */
  disabled?: boolean
  /**
   * Set when a start failed because the declared port never came up and a *foreign*
   * process is LISTENING on it — the Pages panel offers a one-click kill-and-retry.
   */
  portHolder?: { pid: number; name: string } | null
  /**
   * #16 health-probe exposure: last probe outcome while running, and the consecutive-failure
   * count feeding the假死 kill. `unknown` before the first probe resolves.
   */
  health?: { status: 'ok' | 'fail' | 'unknown'; fails: number; lastAt?: number; url?: string }
}

export interface RunningPageInfo {
  id: string
  name: string
  port: number
  url: string
  status: PageStatus
  pid?: number
}

/** A named external URL the user saved for one-click embedded preview. */
export interface ExternalSite {
  id: string
  name: string
  url: string
}

/* Generic per-app panel key: `app:<pageId>` opens the top-bar AppManager panel for that
   page. Lives in the shared contract because `open`/`open-panel` payloads carry either a
   PanelKind or one of these strings. `<script setup>` SFCs cannot export runtime values,  so helpers belong here rather than in MenuBar.vue. */
export const APP_PANEL_PREFIX = 'app:'
export const appPanelKey = (id: string): string => APP_PANEL_PREFIX + id
export function parseAppPanel(panel: string | null | undefined): string | null {
  return panel && panel.startsWith(APP_PANEL_PREFIX) ? panel.slice(APP_PANEL_PREFIX.length) : null
}

/** Resolved "环境目录" info surfaced to the renderer's env-dir rows. */
export interface EnvRootInfo {
  /** effective (fixed) root every runtime's install-choice dir lands under: userData/env */
  envRoot: string
  /** directory holding the app executable (the install dir when packaged) */
  installDir: string
  /** os home — lets the renderer display `~/.tool` system-common paths verbatim */
  home: string
}

/** Resolved "下载目录" info surfaced to the Settings panel. */
export interface DownloadDirInfo {
  /** effective folder webview downloads save into (the override, or the OS default) */
  downloadDir: string
  /** the OS Downloads folder the empty override falls back to */
  defaultDir: string
  /** true when the user pinned a custom folder instead of following the OS default */
  custom: boolean
}

export type DefaultView =
  { kind: 'none' } | { kind: 'page'; pageId: string } | { kind: 'external'; url: string }

export type ExternalOpenMode = 'embedded' | 'system-browser'

export type Locale = 'zh' | 'en'

export interface ContainerSettings {
  defaultView: DefaultView
  openExternalIn: ExternalOpenMode
  minimizeToTray: boolean
  /** register the app as a Windows login item so it starts at boot (then minimizes to tray) */
  launchAtStartup: boolean
  autoStartPages: string[]
  /**
   * Pages whose auto-start the user turned on *explicitly* (via a switch), as opposed to
   * those pulled in implicitly by being the 默认打开 page. Sticky: when the default-open
   * selection later moves away, only the non-pinned page loses auto-start; a pinned one
   * keeps launching. Maintained by updateSettings (auto-start toggles) and never by the
   * default-open coupling, so an implicit add doesn't masquerade as a manual pin.
   */
  autoStartManual?: string[]
  /**
   * Built-in pages (dsh-web / openclaw) the user switched off. Unlike removal — impossible
   * for a builtin — this only hides the page from the switcher and stops it from ever being
   * (auto)started; the registry entry and its files stay intact and re-enable is one click.
   */
  disabledPages?: string[]
  lastExternalUrls: string[]
  /** user-saved named external URLs, managed + previewable from the top bar */
  externalSites: ExternalSite[]
  theme: 'auto' | 'light' | 'dark'
  /** UI display language; empty/default = Chinese */
  locale: Locale
  /**
   * Shell layout mode. 'classic' (default) = the top menu bar with centered floating panels;
   * 'im' = a QQ-like shell: a compact title bar, a left icon rail, and a docked sidebar that
   * hosts the same panels. Layout only — the frosted-glass surfaces are unchanged.
   */
  layoutMode?: 'classic' | 'im'
  /** legacy: the env root used to be a two-choice pick here; resolveEnvRoot() now always returns userData/env */
  envRoot: string
  /** dsh home choice; ''/'@install' (default) = container-owned <envRoot>/.dsh, '@system' = the tool's own ~/.dsh (legacy free paths read as default) */
  dshHome: string
  /** openclaw config home choice; ''/'@install' (default) = <envRoot>/.openclaw, '@system' = the tool's own ~/.openclaw (legacy free paths read as default) */
  openclawHome: string
  /**
   * Root of the container-owned *shared workspace* (working dir + context.json every hosted
   * agent reads/writes; see runtime/workspace.ts). Empty = userData/workspace; a set value
   * (`~`/`{envRoot}` expanded) lets the shared context live inside a real project repo.
   */
  workspaceRoot?: string
  /** where files downloaded inside an embedded page are saved; empty = the OS Downloads folder */
  downloadDir: string
  /** per-page directory env choices: pageId -> (envVarKey -> ''|'@install'|'@system'); default (empty/'@install') is the container dir, '@system' the tool's own home; legacy free paths read as default */
  pageEnvs: Record<string, Record<string, string>>
  /** per-page port overrides: pageId -> port; wins over container.json so imported projects need no editing */
  pagePorts: Record<string, number>
  /**
   * Free-form per-page environment variables (pageId -> KEY -> value) the user adds in the page
   * config dialog. Deliberately separate from `pageEnvs`: that map is directory-typed and fed to
   * the home-dir resolution chain, while these are injected verbatim into the child's env.
   * Restart-required, like `pageEnvs`. Values may carry secrets, so diagnostics masks them with
   * the same variable-name rule it applies everywhere.
   */
  pageCustomEnvs?: Record<string, Record<string, string>>
  /** restart a page whose process crashes after having been up; off = surface the error only */
  crashAutoRestart: boolean
  /** OS notifications for out-of-band events (guard gave up restarting, staged update ready) */
  systemNotifications: boolean
  /**
   * Custom accent color (#25). Empty/undefined keeps the CSS-defined default so light/dark
   * each retain their own; a set value overrides `--accent` at runtime in both modes.
   */
  accentColor?: string
  /**
   * Glass blur strength in px (#25) applied to `.glass`/`.glass-soft` backdrops. Undefined =
   * keep the stylesheet default; a number overrides `--glass-blur` at runtime, clamped to
   * `GLASS_BLUR_MAX_PX` so configs saved under an older, wider range never render past it.
   */
  glassBlur?: number
  /**
   * Background transparency (#25 follow-up): opacity percentage (0–100) of the frosted-glass
   * surfaces, overriding `--glass-tint-a` live. Independent of `glassBlur` (which only sets the
   * blur/saturate strength) so the two axes can be tuned separately. Undefined = keep the
   * blur-coupled stylesheet default.
   */
  glassAlpha?: number
  /** #20: RSS (MB) above which a running page is flagged as over-budget (tray/resource badge). */
  memWarnMb?: number
  /**
   * Height in px of the bottom-docked terminal panel the user dragged out; restored on the next
   * launch. Undefined = the stylesheet default (320), clamped to the window height at runtime.
   */
  terminalHeight?: number
  /** #26: remember the window size/position/maximized state and restore them on the next launch. */
  rememberWindowBounds?: boolean
  /**
   * #26: the last window geometry, written by the main process on move/resize. Not a user-facing
   * setting (never exported into a snapshot either) — it just lives in the same store file.
   */
  windowBounds?: WindowBounds
  /**
   * Same memory, one slot per detached page window (see `IPC.OpenPageWindow`), keyed by page id —
   * a popout the user arranged beside the container should not jump back to the centre.
   */
  popoutBounds?: Record<string, WindowBounds>
  /**
   * #26: motion preference. 'auto' (default) follows the OS `prefers-reduced-motion`; 'on'/'off'
   * force it for this app only. The renderer resolves all three down to one `.reduce-motion`
   * class on `<html>`, which is what every animation-damping rule keys off — so 'off' works even
   * when the OS asks for less motion.
   */
  reduceMotion?: 'auto' | 'on' | 'off'
  /**
   * #26: the npm registry every install / `npm view` the container runs goes through, also
   * injected into hosted pages as `npm_config_registry`. Empty = the built-in default mirror.
   */
  npmRegistry?: string
  /** #26: how far the tray context menu lists pages: all = running + stopped, running = only live ones, off = none */
  trayPageEntries?: 'all' | 'running' | 'off'
  /** #26: which tiers may light the tray badge: all = update/resource/alert, alert = a crashed page only, off = never */
  trayBadge?: 'all' | 'alert' | 'off'
  /**
   * Master switch for the shared workspace / context layer. On (default): every hosted agent is
   * pointed at the container-owned context at spawn. Off: the pointers are withheld, so newly
   * started agents neither see nor write the shared memory — a per-user opt out of multi-agent
   * context. Running agents keep whatever they were handed at launch until they restart.
   */
  sharedWorkspace?: boolean
  /**
   * Dist-tag the DSH CLI is (re)provisioned from. 'alpha' is what the container shipped with
   * (dsh publishes prereleases there), 'latest' tracks the stable release. Read at install and
   * update-check time, so switching only changes what the *next* reprovision pulls.
   */
  dshChannel?: DshReleaseChannel
  /**
   * Which OTA branch the container's own asar update follows: 'stable' = the `release` branch,
   * 'beta' = `release-beta` (falling back to `release` when the beta branch doesn't exist yet).
   */
  containerChannel?: ContainerReleaseChannel
  /**
   * What to do when a running page stays above `memWarnMb`: 'notify' only flags it (the
   * historical behaviour), 'restart' reboots a page that has been up long enough that a restart
   * is cheaper than a leak-induced OOM.
   */
  memLimitAction?: 'notify' | 'restart'
  /**
   * One-shot guard for the transitional cleanup of built-in pages retired from the container
   * (the old `codex` CLI page, `dsh-plugin-market`). Those dirs live in the SAME userData/pages
   * root a user's own imports land in, so re-pruning them on every launch would silently delete
   * an imported page that happens to share a retired id (e.g. importing an npm CLI into a folder
   * named `codex`). Prune once per install — before any import can collide — then never again.
   */
  legacyBuiltinPagesPruned?: boolean
  /**
   * Custom shortcut bindings: action id -> accelerator string ('Ctrl+K', 'F12',
   * 'Ctrl+Shift+Enter'). Absent key = the built-in default for that action, so this map only
   * ever holds the user's overrides and stays small.
   */
  keybindings?: Record<string, string>
}

/** Dist-tags {@link ContainerSettings.dshChannel} can pick between. */
export type DshReleaseChannel = 'alpha' | 'latest'

/** OTA branches {@link ContainerSettings.containerChannel} can pick between. */
export type ContainerReleaseChannel = 'stable' | 'beta'

/**
 * Every rebindable shortcut. The ids double as the i18n key suffix (`keybinding.<id>`), and the
 * set is closed on purpose: an action not listed here has no handler, so a free-form map key
 * from a hand-edited store would silently do nothing.
 */
export const KEYBINDING_ACTIONS = [
  'palette',
  'devtools',
  'terminal',
  'closePanel',
  'popoutCurrent',
  'eventsTimeline'
] as const
export type KeybindingAction = (typeof KEYBINDING_ACTIONS)[number]

/**
 * Shipped defaults, in Electron-accelerator spelling. `eventsTimeline` has none: it is a
 * palette command, and stealing a key from the hosted page would be a bad trade.
 */
export const DEFAULT_KEYBINDINGS: Record<KeybindingAction, string> = {
  palette: 'Ctrl+K',
  devtools: 'F12',
  terminal: 'Ctrl+`',
  closePanel: 'Esc',
  popoutCurrent: 'Ctrl+Shift+Enter',
  eventsTimeline: ''
}

/**
 * Severity of one entry in the activity timeline. Mirrors the log levels so a row can reuse
 * the log viewer's colour vocabulary: info = normal lifecycle, warn = recovered/degraded
 * (crash-restart, over-budget, manifest typo), error = something the user must act on.
 */
export type EventLevel = 'info' | 'warn' | 'error'

/**
 * One activity-timeline entry. `kind` is a stable machine id (`page.running`, `ota.apply` …)
 * that the renderer resolves to a localized template — the *event* is persisted, the sentence
 * is not, so switching language still reads the whole history in the new locale. `detail`/`meta`
 * carry the raw technical facts (exit code, port, version) that no translation should own.
 */
export interface ContainerEvent {
  /** epoch ms */
  ts: number
  level: EventLevel
  kind: string
  /** hosting page the row belongs to, when any (drives the filter dropdown + jump-to-log) */
  pageId?: string
  /** raw technical text (an error message, a git line) — shown as-is, never translated */
  detail?: string
  /** interpolation params for the `evt.<kind>` template (port, code, version …) */
  meta?: Record<string, string | number | boolean>
}

/** Args for `IPC.ListEvents`; every filter is optional, `limit` defaults to 200. */
export interface ListEventsArgs {
  limit?: number
  level?: EventLevel
  pageId?: string
  kind?: string
  /** only events at/after this epoch ms */
  since?: number
}

/** #26: persisted BrowserWindow geometry; `maximized` is restored on top of the bounds. */
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

/**
 * #26: one npm mirror the 网络镜像 panel can probe and apply. Lives here (not in the main
 * process) because both sides need it: the probe walks the list, the settings row renders it.
 */
export interface RegistryCandidate {
  id: string
  /** registry root, no trailing slash; `/-/ping` is appended for the probe */
  url: string
  /** display label per UI language; the renderer resolves it against the active locale */
  label: { zh: string; en: string }
  /** the registry the container falls back to when `npmRegistry` is empty */
  builtin?: boolean
}

/**
 * Result of `IPC.CheckPortFree`: whether 127.0.0.1:port is bindable, and when it isn't, which
 * foreign process is LISTENing (same lookup the start-failure path uses for its kill-and-retry).
 * `probeError` marks an inconclusive check (a platform whose port query failed) as opposed to a
 * definite conflict, so the UI only ever warns on `free === false`.
 */
export interface PortCheckResult {
  port: number
  free: boolean
  holder?: { pid: number; name: string }
  probeError?: boolean
}

/** #26: outcome of probing one registry's `/-/ping` endpoint. */
export interface RegistryProbe {
  id: string
  url: string
  ok: boolean
  /** round-trip latency in ms; only meaningful when `ok` */
  ms?: number
  status?: number
  error?: string
}

/** #26: what the embedded webviews hold right now, as shown by the 隐私数据 panel. */
export interface WebDataReport {
  /** bytes in the session's HTTP cache (`Cache/` + `Code Cache/` under userData) */
  cacheBytes: number
  /** session-wide storage bytes the storage layer reports (localStorage / IDB / …) */
  storageBytes: number
  /** cookies grouped by domain, most cookies first */
  cookieDomains: { domain: string; count: number }[]
  totalCookies: number
}

/** #26: what to wipe; `domain` narrows a cookie clear to one site. */
export interface WebDataClearArgs {
  scope: 'cache' | 'cookies' | 'storage' | 'all'
  domain?: string
}

export interface UpdateCheckResult {
  name: string
  dir: string
  isContainer: boolean
  ok: boolean
  hasUpdate?: boolean
  localHead?: string
  remoteHead?: string
  branch?: string
  error?: string
  /** where this entry's update signal comes from; defaults to 'git' for page/container rows */
  source?: 'git' | 'npm' | 'builtin'
  /** installed version (npm/builtin rows) */
  currentVersion?: string
  /** registry latest version (npm/builtin rows) */
  latestVersion?: string
  /** whether the app can run the update itself (vs. only surfacing a hint) */
  canAutoUpdate?: boolean
  /** how performUpdate should act on this row */
  action?: 'pull' | 'reprovision' | 'manual' | 'none' | 'apply-asar'
  /** npm package name backing an npm/builtin row */
  packageName?: string
  /** container row: the new asar is already downloaded/staged — only a restart is missing */
  pendingRestart?: boolean
  /** builtin-page row (action 'none'): the pages/<id> this row manages — reset entry key */
  pageId?: string
  /** container row: a pre-update app.asar.bak exists, so one-level 回退 is offered */
  canRollback?: boolean
  /** version the .bak copy belongs to (shown in the confirm dialog) */
  rollbackVersion?: string
}

export interface UpdateOutcome {
  name: string
  ok: boolean
  updated: boolean
  error?: string
  message?: string
}

/**
 * Streaming progress for a container self-update download (the packaged OTA path pulls a
 * large app.asar off the `release` git branch). Emitted over IPC while the update runs so
 * the Updates panel can show a live progress bar instead of a bare spinner.
 *
 * - `fetch`: the network phase — `git fetch` of the release tip. `percent` mirrors git's own
 *   "Receiving objects" percentage when it can be parsed, otherwise the bar is indeterminate.
 * - `extract`: writing the app.asar blob to a `.part` file. `received`/`total` are byte
 *   counts; `resumed` is true when an interrupted earlier attempt's partial file was kept and
 *   the write continued from its size (断点续传) rather than restarting from zero.
 * - `done`: the file is complete and staged as pending — the renderer clears the row.
 *
 * A built-in runtime row (dsh / openclaw) rides the same channel but has no byte counts: npm
 * installs report no percentage, so it streams `phase:'fetch'` with no `percent` (an
 * indeterminate bar) and puts npm's own latest stderr line in `message`. `builtin` names which
 * runtime it is so the top bar can label the row from the *UI* dictionary — `name` is a
 * main-process-translated row title and would not follow a mid-session language switch.
 */
export interface UpdateProgress {
  name: string
  /** which built-in runtime this row belongs to; absent for the container's own OTA download */
  builtin?: BuiltinKind
  phase: 'fetch' | 'extract' | 'done'
  /** bytes written so far (extract) */
  received?: number
  /** total bytes of the artifact (extract), or undefined when indeterminate (fetch) */
  total?: number
  /** 0..100, when computable */
  percent?: number
  /** true when an existing partial download was resumed rather than restarted */
  resumed?: boolean
  /** human line under the bar: main-process translated, except a built-in install's raw npm output */
  message?: string
}

/**
 * Streaming startup progress for a single page, emitted while `PageRegistry.start`
 * is still awaiting readiness. The renderer's boot overlay renders these instead of a
 * bare spinner: `phase` drives a localized status line, `logs` is a tail of the child's
 * own output so a slow first boot visibly *does something*. The phase enum is sent (not a
 * translated string) so the overlay follows the UI language without a round-trip.
 *
 * - spawning: about to launch the child process
 * - process:  the child process is up; now waiting for it to bind
 * - port:     polling the HTTP port / parsing the ready line
 * - url:      resolving the token-bearing launch URL (openclaw dashboard)
 * - retry:    a fast child exit triggered orphan-reclaim; starting a second attempt
 * - log:      no phase transition, just a refreshed log tail
 * - ready:    page is up (the overlay is torn down on the accompanying state change)
 */
export interface PageProgress {
  pageId: string
  phase: 'spawning' | 'process' | 'port' | 'url' | 'retry' | 'log' | 'ready'
  logs: string[]
}

/**
 * Streaming progress for an in-flight page import (git clone or local-folder copy),
 * emitted back to the requesting window while `installFromGit` / `installFromLocalDir`
 * run so the Pages panel can show a live bar instead of a bare spinner.
 *
 * The phase enum (not a translated string) is sent so the bar follows the UI language
 * without a main<->renderer round-trip; `percent` is 0..100 when computable and omitted
 * while the step is inherently indeterminate (git negotiating, project validation).
 *
 * - preparing:  git connecting / local dir being scanned to size the copy
 * - receiving:  bytes moving (clone percentage, or copied-vs-total for the local copy)
 * - validating: readPageMeta runs — the imported tree is checked for a runnable entry
 * - installing: an opted-in `npm install` of the imported project's dependencies is running
 *                (no byte progress, so the bar streams as an indeterminate `message` line)
 * - finalizing: seeding container.json / adopting a git origin
 * - done:       the import finished (the renderer still clears on the resolving promise)
 */
export interface InstallProgress {
  op: 'git' | 'dir' | 'npm'
  phase: 'preparing' | 'receiving' | 'validating' | 'installing' | 'finalizing' | 'done'
  /** 0..100 when computable; undefined = indeterminate */
  percent?: number
  /** copied bytes so far (dir op) */
  received?: number
  /** total bytes to copy (dir op), or undefined while sizing */
  total?: number
  /** raw upstream progress line (git), shown as a detail caption */
  message?: string
  /** external source being downloaded (git repo URL or local source dir) — surfaced in the top bar */
  source?: string
  /** target folder name under pages/ once known — lets the top-bar row name the imported project */
  target?: string
}

/**
 * Options a caller passes to the git/dir import entry points. `autoInstall` triggers an
 * `npm install` of a yellow (has-unsatisfied-dependencies) project right after it lands, so the
 * page can be started without a manual step; it is a no-op for green projects (nothing to install)
 * and never fails the import (a failed install leaves the page installed and re-runnable).
 */
export interface ImportOptions {
  autoInstall?: boolean
}

/**
 * Result of `IPC.PreflightImport`: what {@link classifyProject}/{@link probeRemoteTier} concluded
 * about a not-yet-imported source, so the import dialog can restrict the 项目类型 choice and warn
 * (or block) before any download. `tier` is 'red' when the container cannot run it at all; a
 * git source that can't be judged remotely reports `tier: null` (unknown) rather than a false verdict.
 */
export interface ImportPreflight {
  tier: 'green' | 'yellow' | 'red' | null
  kind?: PageKind
  needsInstall?: boolean
  /** set only for a red verdict: a localized reason the project can't be hosted. */
  reason?: string
  /** red verdict for a well-known repo with a published npm CLI: the package to install instead. */
  suggestNpm?: string
}

/**
 * Live progress of a file download started inside an embedded <webview> (an external site
 * like baidu.com, or a hosted page). The main process owns the native DownloadItem and
 * broadcasts this over IPC so the window-level top progress bar can render a bar, while the
 * save location rides along (`savePath`) for the completion notification.
 *
 * - `progressing`: bytes moving; `percent` is null when the server sent no Content-Length
 *   (the bar animates as an indeterminate striped flow instead of a fake number).
 * - `completed`: the file is fully written to `savePath` — the renderer drops the row and the
 *   main process pops a system notification naming the location.
 * - `cancelled`: the user interrupted / it failed — row dropped, no success toast.
 */
export interface DownloadProgress {
  /** stable id for this download (top-bar row key), minted in the main process */
  id: string
  /** file name being saved (already deduped against an existing Downloads-folder file) */
  filename: string
  state: 'progressing' | 'completed' | 'cancelled'
  /** bytes written so far */
  received: number
  /** total bytes, or -1 when the size is unknown */
  total: number
  /** 0..100 when computable; null → indeterminate */
  percent: number | null
  /** absolute path the file is (being) written to — the "下载位置" */
  savePath?: string
  /** host of the embedded view that started it (e.g. "baidu.com"), for the row caption */
  host?: string
}

/* ---- MCP Client Hub ----
 * The container acts as the MCP *client* for a registry of stdio MCP servers:
 * it spawns each server as a child process, aggregates their tools, and can
 * invoke them. Specs are user-authored (panel / hand-edited store file), so
 * everything except `id`/`command` is optional and validated in the main
 * process before persistence. */

/** On-demand provisioning state of one built-in MCP server's npm package (userData/mcp). */
export interface McpPkgStatus {
  /** built-in row id ('memory', 'filesystem', …) */
  id: string
  /** full npm package name the row launches */
  pkg: string
  /** launcher JS present on disk */
  installed: boolean
  version?: string
}

/** One registered upstream MCP server (stdio transport). */
export interface McpServerSpec {
  /** stable slug id; also the tool-namespace prefix. Immutable once created. */
  id: string
  /** display name shown in the panel (defaults to id) */
  name: string
  /** executable to spawn, e.g. "npx" / "node" / "python" (`.cmd` resolves on Windows via cross-spawn) */
  command: string
  /** argv passed to the command */
  args?: string[]
  /** extra env merged over the SDK's safe default env for the child process */
  env?: Record<string, string>
  /** working directory for the child; empty = the container's cwd */
  cwd?: string
  /** false = listed but never connectable from the panel (default true) */
  enabled?: boolean
  /** connect automatically at container boot (implies nothing about `enabled` — both must be true) */
  autoStart?: boolean
  /**
   * Locked, code-owned row (see runtime/mcp-hub lockedMcpSpecs — currently only
   * `filesystem`): command/args/name are re-asserted on every reconcile, never persisted,
   * and the panel renders it read-only (no edit/delete) — only connect/disconnect. The other
   * curated servers are NOT built-in: they are seeded once into the store as ordinary rows
   * the user can edit/delete; direct-launch of their downloaded package is resolved at
   * connect time (mcp-hub.effectiveSpawn), not baked into the spec, for that reason.
   */
  builtin?: boolean
}

export type McpServerStatus = 'stopped' | 'connecting' | 'connected' | 'error'

/** Live hub state for one server row. */
export interface McpServerState {
  spec: McpServerSpec
  status: McpServerStatus
  /** server-declared identity after a successful initialize */
  serverInfo?: { name: string; version?: string }
  /** tool count after the last successful listTools (0 when never connected) */
  toolCount: number
  lastError?: string
}

/** One tool surfaced by a connected server, namespaced by its server id. */
export interface McpToolInfo {
  serverId: string
  /** the server's own tool name (what callTool must receive) */
  name: string
  title?: string
  description?: string
  /** JSON Schema for `arguments` — opaque to the container, shown raw in the panel */
  inputSchema?: Record<string, unknown>
}

/** Args for `IPC.McpCallTool`. */
export interface McpCallToolArgs {
  serverId: string
  tool: string
  arguments?: Record<string, unknown>
  /** per-call timeout in ms; default MCP_CALL_TOOL_TIMEOUT_MS in the hub */
  timeoutMs?: number
}

/** Result of one tool call — content blocks flattened to text by the hub. */
export interface McpCallToolResult {
  ok: boolean
  /** concatenated text content blocks (non-text blocks are JSON-inlined) */
  text: string
  isError: boolean
  error?: string
  durationMs: number
}

/** Qualified key a tool is addressed by inside the hub UI (`serverId/name`). */
export const mcpToolKey = (serverId: string, tool: string): string => `${serverId}/${tool}`

/** Where the hub's agent-facing bridge exports live (see runtime/mcp-bridge.ts). */
export interface McpBridgeInfo {
  /** userData/mcp-bridge — the export directory */
  dir: string
  /** full aggregated catalog (specs + connected tools with input schemas) */
  catalogFile: string
  /** `mcpServers` JSON, the shape `codex --mcp-config` (and friends) consume */
  configFile: string
  /** codex's resolved config file when a CODEX_HOME- declaring page exists */
  codexConfigFile?: string
}

/* ---- shared workspace / context layer (see runtime/workspace.ts) ---- */

/** One entry in the shared workspace's append-only memory log. */
export interface WorkspaceNote {
  id: string
  /** who wrote it — an agent name, the container UI, or 'agent' for an unattributed write */
  author: string
  text: string
  /** epoch ms; the panel orders and renders this in the display zone like every other timestamp */
  ts: number
}

/**
 * The container-owned shared context every hosted agent discovers through
 * DSH_WORKSPACE_DIR / DSH_WORKSPACE_FILE. A single document all agents read and write,
 * so "what are we working on" survives an agent swap.
 */
export interface WorkspaceContext {
  version: number
  /** ISO stamp of the last write; maintained by the container, ignored on ingest */
  updatedAt: string
  /**
   * Monotonic counter bumped on every broadcast. A polling agent diffs it against what it last
   * read to notice the container pushed a new task without it re-parsing the whole document.
   */
  revision: number
  /** ISO stamp of the last broadcast (container → running agents), if any */
  broadcastAt?: string
  /** the current shared task / goal, free text */
  task: string
  notes: WorkspaceNote[]
}

/** Where the shared workspace lives + its current contents, handed to the panel. */
export interface WorkspaceInfo {
  dir: string
  file: string
  context: WorkspaceContext
}

export interface IpcResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

/** a plugin inside the installed @deepseek-ai/dsh profile */
export interface DshPluginInfo {
  name: string
  version: string
  source: 'bundle' | 'profile'
  /**
   * Bundle layers only: false when the layer is named in `dsh.profile.bundles` but resolves
   * nowhere on disk. dsh registers the layer before pnpm runs, so an install that failed left a
   * ghost — pnpm has no dependency to remove, and the row must not read as "ships with dsh".
   */
  present?: boolean
}

/**
 * per-plugin new-version hint. Both the npm registry and the package's git repo (its
 * `repository` tag) are probed; the winner is whichever carries the newest semver, so
 * `latest` is that source's version and `channel` records where the update should come from.
 * When `channel` is 'git', `gitUrl` is the `repo#<tag>` spec to (re)install from — this also
 * covers flipping an npm-pinned plugin onto a newer git tag.
 */
export interface DshPluginUpdate {
  name: string
  updateAvailable: boolean
  latest?: string
  /** which channel the newest version came from, and therefore the update should go through */
  channel?: DshUpdateChannel
  /** repo(+ref) to install when `channel === 'git'`; the arg `updateDshPlugin` consumes */
  gitUrl?: string
}

export type DshUpdateChannel = 'npm' | 'git'

/**
 * Broadcast while a dsh plugin install/update runs in main, so the window-level top bar can
 * show live progress even with the DSH panel closed. `done:false` marks the op's start
 * (`name`, plus `index`/`total` = 1-based queue position when batch-updating), `done:true`
 * closes it out; the position lets the bar trend determinate across the queue.
 */
export interface DshPluginOpEvent {
  name: string
  done: boolean
  index?: number
  total?: number
  error?: string
}

/**
 * Outcome of asking for a dsh profile's runtime token.
 *
 * Unlike openclaw's gateway token — readable from a config file or env var while the gateway
 * is stopped — dsh mints its token per launch and prints it only in its ready line
 * (`dsh web: http://127.0.0.1:8899/?token=…`). The running page's `launchUrl` is therefore
 * the sole authoritative source, and "no token" has two distinct causes worth telling apart:
 * the profile has no registered page at all, or its page is registered but not running.
 */
export type DshTokenResult =
  | { kind: 'ok'; token: string; pageId: string; url: string }
  | { kind: 'stopped'; pageId: string }
  | { kind: 'no-page'; profile: string }

/**
 * Outcome of the openclaw one-click token bootstrap. `created` is false when a token already
 * existed and was returned untouched (idempotent re-read); `restarted` reports whether a running
 * gateway was relaunched so it picks up the (new) credential — a stopped page is left stopped.
 */
export interface OpenclawInitTokenResult {
  token: string
  created: boolean
  restarted: boolean
}

/** One selectable bundled-Node upgrade target, from the nodejs.org dist index. */
export interface NodeVersionInfo {
  /** exact tag, e.g. "v24.21.0" */
  version: string
  /** release date (ISO) */
  date: string
  /** LTS codename when the line is LTS, false otherwise */
  lts: string | false
  /** false only when "显示不兼容版本" pulled a release outside the hosted runtimes' engines
      range (would break page spawns); omitted/true means it satisfies those engines. */
  usable?: boolean
}

/**
 * The built-in components the container can (re)provision at runtime via the bundled npm.
 * Same channel the 关于与更新 panel's reprovision rows use, so a *missing* built-in gets an
 * "install" entry point (first-run setup) as well as an "update" one. 'mcp' is the group of
 * npm packages behind the built-in MCP servers (userData/mcp, see runtime/mcp-packages).
 */
export type BuiltinKind = 'dsh' | 'openclaw' | 'mcp'

export const IPC = {
  GetNodeInfo: 'container:get-node-info',
  ListPages: 'container:list-pages',
  StartPage: 'container:start-page',
  StopPage: 'container:stop-page',
  RestartPage: 'container:restart-page',
  GetPageLogs: 'container:get-page-logs',
  InstallPageFromGit: 'container:install-page-git',
  InstallPageFromDir: 'container:install-page-dir',
  /** install a published npm CLI package (with a bin) as a terminal page */
  InstallPageFromNpm: 'container:install-page-npm',
  /** judge an import source before downloading (ImportPreflight) to gate the import UI */
  PreflightImport: 'container:import-preflight',
  ChooseDirectory: 'container:choose-directory',
  RemovePage: 'container:remove-page',
  /** switch a built-in dsh/openclaw page off/on (disabled = hidden from switcher, never starts) */
  SetPageDisabled: 'container:set-page-disabled',
  /** restore a builtin page's userData copy from the bundled seed (user broke its files) */
  ResetBuiltinPage: 'container:reset-builtin-page',
  SetPagePort: 'container:set-page-port',
  OpenPageExternal: 'container:open-page-external',
  GetSettings: 'container:get-settings',
  UpdateSettings: 'container:update-settings',
  EnvRoot: 'container:env-root',
  /** resolved webview download folder + the OS default it falls back to (DownloadDirInfo) */
  DownloadDir: 'container:download-dir',
  CheckUpdates: 'container:check-updates',
  PerformUpdate: 'container:perform-update',
  /** list Node versions eligible to replace the bundled runtime (NodeVersionInfo[]) */
  ListNodeVersions: 'container:list-node-versions',
  /** download + install one Node runtime over the bundled one; streams OnNodeUpdateProgress */
  UpdateNodeRuntime: 'container:update-node-runtime',
  /** drop the updated runtime and fall back to the installer-shipped bundled one */
  RestoreBundledNode: 'container:restore-bundled-node',
  /** install/upgrade a built-in agent runtime (dsh / openclaw) with the bundled npm (BuiltinKind) */
  ProvisionBuiltin: 'container:provision-builtin',
  /** stream: live progress of an in-flight bundled-Node update (UpdateProgress) */
  OnNodeUpdateProgress: 'container:node-update-progress',
  /** broadcast: live progress of an in-flight update download (UpdateProgress) */
  OnUpdateProgress: 'container:update-progress',
  /** broadcast: per-page startup progress while a page is 'starting' (PageProgress) */
  OnPageProgress: 'container:page-progress',
  /** stream: import progress (git clone / local copy) back to the requesting window (InstallProgress) */
  OnInstallProgress: 'container:install-progress',
  /** broadcast: silent background update-check results (UpdateCheckResult[]) — badge-only, never a popup */
  OnUpdateResults: 'container:update-results',
  /** open userData/logs in the OS file manager (field debugging: packaged apps have no stderr) */
  OpenLogsDir: 'container:open-logs-dir',
  /** relaunch the app after the container updated its own source from git */
  RelaunchApp: 'container:relaunch-app',
  ShowWindow: 'container:show-window',
  QuitApp: 'container:quit-app',
  /** push: main asks the renderer to show a horizontal quit-confirm dialog */
  OnQuitConfirm: 'container:quit-confirm',
  OnStateChanged: 'container:state-changed',
  DshStatus: 'dsh:status',
  DshListPlugins: 'dsh:list-plugins',
  DshPluginUpdates: 'dsh:plugin-updates',
  DshInstallPlugin: 'dsh:install-plugin',
  DshUninstallPlugin: 'dsh:uninstall-plugin',
  DshUpdatePlugin: 'dsh:update-plugin',
  DshUpdateAll: 'dsh:update-all',
  /** broadcast: in-flight dsh plugin ops (DshPluginOpEvent) → window top progress bar */
  OnDshPluginOp: 'dsh:plugin-op',
  DshCreatePage: 'dsh:create-page',
  DshToken: 'dsh:token',
  OpenclawStatus: 'openclaw:status',
  OpenclawCreatePage: 'openclaw:create-page',
  OpenclawToken: 'openclaw:token',
  /** one-click: generate & persist a gateway token (rotate when the arg is true) */
  OpenclawInitToken: 'openclaw:init-token',
  ToggleDevTools: 'container:toggle-devtools',
  GetNativeTheme: 'container:get-native-theme',
  OnNativeTheme: 'container:native-theme',
  SetNativeTheme: 'container:set-native-theme',
  MinimizeWindow: 'container:minimize-window',
  ToggleMaximize: 'container:toggle-maximize',
  CloseWindow: 'container:close-window',
  GetIsMaximized: 'container:get-is-maximized',
  OnMaximizedChanged: 'container:maximized-changed',
  PtyStart: 'container:pty-start',
  PageRunSpec: 'container:page-run-spec',
  PtyWrite: 'container:pty-write',
  PtyResize: 'container:pty-resize',
  PtyKill: 'container:pty-kill',
  OnPtyData: 'container:pty-data',
  OnPtyExit: 'container:pty-exit',
  /** broadcast: a secondary window asks every window to switch to that CLI page's terminal */
  OpenTerminalPage: 'container:open-terminal-page',
  /** broadcast: live progress of a file download inside an embedded webview (DownloadProgress) */
  OnDownloadProgress: 'container:download-progress',
  /** list readable log files (main + per-page tails) for the in-app viewer (LogFileInfo[]) */
  ListLogFiles: 'container:list-log-files',
  /** read the tail of one log file, optionally filtered (ReadLogsArgs → LogReadResult) */
  ReadLogs: 'container:read-logs',
  /** collect versions/settings/logs summary into a zip via a save dialog; resolves the path */
  ExportDiagnostics: 'container:export-diagnostics',
  /** taskkill the foreign process LISTENING on that port (port-conflict quick fix) */
  KillPortHolder: 'container:kill-port-holder',
  /** swap the pre-update app.asar.bak back in and relaunch (one-level OTA rollback) */
  RollbackAsar: 'container:rollback-asar',
  /** #15: bundle pages manifest + per-page container.json + settings into an importable zip */
  ExportSnapshot: 'container:export-snapshot',
  /** #15: restore from a snapshot zip chosen via open dialog */
  ImportSnapshot: 'container:import-snapshot',
  /** #21: one-shot network reachability probe (connectivity / proxy / registry mirrors) */
  RunNetworkProbe: 'container:run-network-probe',
  /** #17: read the OTA update-meta history for the container row */
  GetUpdateHistory: 'container:get-update-history',
  /** #20: on-demand CPU/RAM sample for currently running pages (PageMetrics[]) */
  GetPageMetrics: 'container:get-page-metrics',
  /** system + runtime overview for the help panel's 关于与运行 tab (SystemInfo) */
  GetSystemInfo: 'container:get-system-info',
  /** live network interfaces + cumulative byte counters for the help panel (NetworkStats) */
  GetNetworkStats: 'container:get-network-stats',
  /** broadcast: #20 periodic CPU/RAM sample for running pages (PageMetrics[]) */
  OnPageMetrics: 'container:page-metrics',
  /** broadcast: top-bar live network sample (NetSample) — rates + latency + online ports */
  OnNetSample: 'container:net-sample',
  /** broadcast: #22 tailed lines appended to a log file since the last tick (LogLineEvent) */
  OnLogLine: 'container:log-line',
  /** #26: probe every candidate npm registry in parallel → RegistryProbe[] */
  ProbeRegistries: 'container:probe-registries',
  /** #26: what the embedded webviews hold (cookies per domain, cache + storage bytes) → WebDataReport */
  GetWebData: 'container:get-web-data',
  /** #26: wipe cache / cookies (optionally one domain) / storage / everything (WebDataClearArgs) */
  ClearWebData: 'container:clear-web-data',
  /** activity timeline: read filtered events from logs/events.jsonl (ListEventsArgs → ContainerEvent[]) */
  ListEvents: 'container:list-events',
  /** broadcast: one new activity-timeline event (ContainerEvent) */
  OnEvent: 'container:event',
  /** #20 follow-up: retained CPU/RAM history per running page → Record<pageId, PageMetrics[]> */
  GetMetricsHistory: 'container:get-metrics-history',
  /** open a hosted page in its own top-level window (pageId) — shares the embedded-page session */
  OpenPageWindow: 'container:open-page-window',
  /** is a TCP port free on 127.0.0.1? → { free, holder? } so the config dialog can warn up front */
  CheckPortFree: 'container:check-port-free',
  /** broadcast: a rebindable shortcut was pressed *inside* a hosted webview, so the shell window
   *  that owns the action runs it (HotkeySignal). The guest consumed nothing back. */
  OnHotkey: 'container:hotkey',
  /** MCP hub: live state of every registered server → McpServerState[] */
  McpListServers: 'container:mcp-list-servers',
  /** MCP hub: add or update one spec (id wins over an existing row) → McpServerState[] */
  McpSaveServer: 'container:mcp-save-server',
  /** MCP hub: disconnect (when live) and drop one server spec */
  McpRemoveServer: 'container:mcp-remove-server',
  /** MCP hub: open the stdio connection for one server */
  McpConnect: 'container:mcp-connect',
  /** MCP hub: close the stdio connection for one server */
  McpDisconnect: 'container:mcp-disconnect',
  /** MCP hub: aggregated tool catalog, optionally for one server → McpToolInfo[] */
  McpListTools: 'container:mcp-list-tools',
  /** MCP hub: invoke one tool and await its result (McpCallToolArgs → McpCallToolResult) */
  McpCallTool: 'container:mcp-call-tool',
  /** broadcast: hub server states changed (McpServerState[]) */
  OnMcpStateChanged: 'container:mcp-state-changed',
  /** MCP bridge: where the agent-facing catalog/config exports live → McpBridgeInfo */
  McpBridgeInfo: 'container:mcp-bridge-info',
  /** MCP built-in packages: on-disk provisioning state of userData/mcp → McpPkgStatus[] */
  McpPackagesStatus: 'container:mcp-packages-status',
  /** shared workspace: read the container-owned context + its locations → WorkspaceInfo */
  WorkspaceGet: 'container:workspace-get',
  /** shared workspace: persist a partial edit ({ task?, notes? }) → WorkspaceContext */
  WorkspaceSave: 'container:workspace-save',
  /** shared workspace: push the current task to running agents (bump revision + log a note) → WorkspaceContext */
  WorkspaceBroadcast: 'container:workspace-broadcast'
} as const

/** Payload of {@link IPC.OnHotkey}: which action fired and for which page, if any. */
export interface HotkeySignal {
  action: KeybindingAction
  /** the hosted page whose webview received the keypress */
  pageId?: string
}

/** One row of `IPC.ListLogFiles`. `key` is 'main' or a `pages/<file>` basename. */
export interface LogFileInfo {
  key: string
  /** display label (already localized in the main process) */
  label: string
  bytes: number
  mtimeMs: number
}

/** Args for `IPC.ReadLogs`; tail defaults to 400 lines, filter is a case-insensitive substring. */
export interface ReadLogsArgs {
  key: string
  tail?: number
  filter?: string
}

export interface LogReadResult {
  lines: string[]
  /** true when only the last slice of the file could be read */
  truncated: boolean
  /** bytes actually read from the tail of the file */
  readBytes: number
  /** total size of the file on disk */
  totalBytes: number
}

/**
 * #22: tailed lines appended to one log file since the previous push. `key` mirrors
 * `LogFileInfo.key` ('main' or a `pages/<file>` basename) so the viewer only appends when
 * the currently-open file matches.
 */
export interface LogLineEvent {
  key: string
  lines: string[]
}

/**
 * #20: one CPU/RAM sample for a running page's process tree. `cpu` is a percent of one core
 * (delta between two wall-clock samples); `memMb` is working-set RSS summed over the pid and
 * its children. `overLimit` marks it above the configured memory warning threshold.
 */
export interface PageMetrics {
  pageId: string
  pid?: number
  /** CPU percent (0..~100*nCores), from the delta of two process-time samples */
  cpu: number
  /** resident set size in MB summed over the process tree */
  memMb: number
  overLimit?: boolean
  /** epoch ms of this sample — the trend chart's x-axis */
  ts?: number
}

/**
 * #21: one step of the network diagnostic wizard. The wizard runs several steps and reports
 * them in order so the user can see exactly which hop broke (`which step断了`).
 */
export interface NetProbeStep {
  /** stable id (renderer maps to a label): 'gateway' | 'github' | 'npm' | 'npmmirror' | 'proxy' */
  id: string
  ok: boolean
  /** round-trip time in ms when reachable */
  ms?: number
  /** short human detail (HTTP status, resolved proxy URL, or error message) */
  detail?: string
}

/** #21: aggregate result of `IPC.RunNetworkProbe`. */
export interface NetProbeResult {
  steps: NetProbeStep[]
  /** proxy env vars detected in the main process environment (HTTP(S)_PROXY / NO_PROXY) */
  proxy?: { http?: string; https?: string; no?: string }
  /** true when every non-proxy step passed */
  healthy: boolean
}

/**
 * #17: container OTA version history read from update-meta.json. Only versions with an
 * on-disk artifact are reported; `current` is what the running app was built from.
 */
export interface UpdateHistory {
  /** app.getVersion() — the version now running */
  running: string
  /** version the staged (pending) asar belongs to, applied on next restart */
  current?: string | null
  /** pre-update app.asar.bak version, offered for one-level rollback */
  backup?: string | null
  /** version we most recently rolled back from, when applicable */
  rollbackFrom?: string | null
  /** true when a restart would apply a pending update */
  pendingRestart?: boolean
}

/**
 * #15: result of exporting/importing a migration package. `path` is the chosen zip; the
 * id lists let the UI summarize what moved without parsing the archive in the renderer.
 */
export interface SnapshotResult {
  path: string
  /** page ids captured in the snapshot (manifest entries with a container.json) */
  pageIds: string[]
  createdAt: number
  /** on import: pages restored and settings keys applied */
  restoredPages?: string[]
  appliedSettings?: boolean
}

/**
 * System + runtime overview for the help panel's 关于与运行 tab. Every field is best-effort:
 * a value the platform can't provide is left undefined and the row is simply dropped, so an
 * older Electron or a stripped-down OS never breaks the panel.
 */
export interface SystemInfo {
  /** OS family string: 'Windows_NT' | 'Linux' | 'Darwin' … (os.type()) */
  osType: string
  /** OS release version string (os.release()) */
  osRelease: string
  /** node platform id: 'win32' | 'linux' | 'darwin' … */
  platform: string
  /** CPU architecture: 'x64' | 'arm64' … */
  arch: string
  hostname: string
  /** first CPU's model name (trimmed); many CPUs report a single representative model */
  cpuModel?: string
  /** logical CPU count */
  cpuCores: number
  /** total system memory in bytes */
  totalMem: number
  /** free system memory in bytes */
  freeMem: number
  /** OS uptime in seconds */
  osUptimeSec: number
  /** this app process uptime in seconds */
  appUptimeSec: number
  /** BCP-47 locale resolved from the runtime Intl settings */
  locale: string
  /** IANA timezone name */
  timezone: string
  /** user home directory */
  home: string
  /** container app version (app.getVersion()) */
  appVersion: string
  /** true when running from a packaged build (not the dev tree) */
  packaged: boolean
  electron: string
  chrome: string
  node: string
  /** userData directory */
  userData: string
  /** install (executable) directory the container runs from */
  installDir: string
  /** number of network interfaces reported as non-internal (informational count) */
  interfaceCount: number
}

/** One network interface for the live-network view. */
export interface NetInterfaceInfo {
  name: string
  /** first non-internal IPv4 address, when present */
  address?: string
  netmask?: string
  mac?: string
  /** address family label the renderer shows raw ('IPv4' etc. is derived from cidr) */
  family: string
  /** loopback / internal interfaces are marked so the UI can dim them */
  internal: boolean
  /** CIDR notation of the primary address, when available */
  cidr?: string
}

/**
 * Live network snapshot for the help panel. `counters` are cumulative bytes since boot summed
 * over the non-internal adapters; the renderer diffs two consecutive samples against
 * `sampleAt` to derive a real-time rate. `counters` is null where the OS path failed.
 */
export interface NetworkStats {
  interfaces: NetInterfaceInfo[]
  counters: { rxBytes: number; txBytes: number } | null
  /** epoch ms of this sample, used as the delta baseline by the renderer */
  sampleAt: number
}

/** One online (running, port-bound) page for the top-bar network tooltip. */
export interface OnlinePort {
  id: string
  name: string
  /** the effective listening port (containerPort || port) */
  port: number
}

/**
 * Broadcast the main process pushes to every window for the top-bar network indicator.
 * The byte counters are cumulative-since-boot (null where the OS probe failed); the
 * rx/tx rates are the main process's delta between two consecutive samples, and
 * `latencyMs` is a slow-cadence internet-RTT probe cached between probes.
 */
export interface NetSample {
  /** current down/up rate in bytes/sec */
  rxRateBps: number
  txRateBps: number
  counters: { rxBytes: number; txBytes: number } | null
  /** the interface the machine is actually online through right now (default-route probe):
   *  WiFi/NAT/以太网优先，否则回退到首张非回环网卡; null when none has an address */
  localInterface: {
    name: string
    address?: string
    /** coarse adapter kind derived from the interface name */
    kind: 'wifi' | 'ethernet' | 'other'
  } | null
  /** last measured internet latency in ms; null = never succeeded (or still probing) */
  latencyMs: number | null
  /** running pages that listen on a port, sorted by port */
  onlinePorts: OnlinePort[]
  sampleAt: number
}
