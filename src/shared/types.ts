export const NODE_VERSION_REQUIRED = 'v24.21.0'

/** Upstream git repo the desktop container itself updates from (self-update via git pull). */
export const CONTAINER_REPO_URL = 'https://github.com/master1Sun/dsh-desktop-Electron.git'

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

/** Resolved "环境目录" info surfaced to the Settings panel. */
export interface EnvRootInfo {
  /** effective root every runtime's home dir defaults into */
  envRoot: string
  /** directory holding the app executable (the install dir when packaged) */
  installDir: string
  /** true when the user pinned a custom root instead of following the install dir */
  custom: boolean
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
  lastExternalUrls: string[]
  /** user-saved named external URLs, managed + previewable from the top bar */
  externalSites: ExternalSite[]
  theme: 'auto' | 'light' | 'dark'
  /** UI display language; empty/default = Chinese */
  locale: Locale
  /** root for every runtime's config/state dir; empty = follow the install dir (<installDir>/env) */
  envRoot: string
  /** dsh home override; empty = <envRoot>/dsh (an existing ~/.dsh is kept as a migration fallback) */
  dshHome: string
  /** openclaw config home override; empty = <envRoot>/openclaw (existing ~/.openclaw kept as fallback) */
  openclawHome: string
  /** where files downloaded inside an embedded page are saved; empty = the OS Downloads folder */
  downloadDir: string
  /** per-page directory env overrides: pageId -> (envVarKey -> path); empty value falls back to the spec defaultPath */
  pageEnvs: Record<string, Record<string, string>>
  /** per-page port overrides: pageId -> port; wins over container.json so imported projects need no editing */
  pagePorts: Record<string, number>
  /** restart a page whose process crashes after having been up; off = surface the error only */
  crashAutoRestart: boolean
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
 */
export interface UpdateProgress {
  name: string
  phase: 'fetch' | 'extract' | 'done'
  /** bytes written so far (extract) */
  received?: number
  /** total bytes of the artifact (extract), or undefined when indeterminate (fetch) */
  total?: number
  /** 0..100, when computable */
  percent?: number
  /** true when an existing partial download was resumed rather than restarted */
  resumed?: boolean
  /** already-localized human line (built in the main process) */
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
 * - finalizing: seeding container.json / adopting a git origin
 * - done:       the import finished (the renderer still clears on the resolving promise)
 */
export interface InstallProgress {
  op: 'git' | 'dir'
  phase: 'preparing' | 'receiving' | 'validating' | 'finalizing' | 'done'
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
}

/** per-plugin new-version hint; latest is a newer npm version, or the remote latest semver tag for git deps */
export interface DshPluginUpdate {
  name: string
  updateAvailable: boolean
  latest?: string
  /** which channel the update should go through; derived from how the dep is pinned */
  channel?: DshUpdateChannel
}

export type DshUpdateChannel = 'npm' | 'git'

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
}

/**
 * The two agent runtimes the container can (re)provision at runtime via the bundled npm.
 * Same channel the 关于与更新 panel's reprovision rows use, so a *missing* built-in gets an
 * "install" entry point (first-run setup) as well as an "update" one.
 */
export type BuiltinKind = 'dsh' | 'openclaw'

export const IPC = {
  GetNodeInfo: 'container:get-node-info',
  ListPages: 'container:list-pages',
  StartPage: 'container:start-page',
  StopPage: 'container:stop-page',
  RestartPage: 'container:restart-page',
  GetPageLogs: 'container:get-page-logs',
  InstallPageFromGit: 'container:install-page-git',
  InstallPageFromDir: 'container:install-page-dir',
  ChooseDirectory: 'container:choose-directory',
  RemovePage: 'container:remove-page',
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
  OnStateChanged: 'container:state-changed',
  DshStatus: 'dsh:status',
  DshListPlugins: 'dsh:list-plugins',
  DshPluginUpdates: 'dsh:plugin-updates',
  DshInstallPlugin: 'dsh:install-plugin',
  DshUninstallPlugin: 'dsh:uninstall-plugin',
  DshUpdatePlugin: 'dsh:update-plugin',
  DshUpdateAll: 'dsh:update-all',
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
  OnDownloadProgress: 'container:download-progress'
} as const
