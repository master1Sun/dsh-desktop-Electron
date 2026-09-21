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
  /**
   * Pages whose auto-start the user turned on *explicitly* (via a switch), as opposed to
   * those pulled in implicitly by being the 默认打开 page. Sticky: when the default-open
   * selection later moves away, only the non-pinned page loses auto-start; a pinned one
   * keeps launching. Maintained by updateSettings (auto-start toggles) and never by the
   * default-open coupling, so an implicit add doesn't masquerade as a manual pin.
   */
  autoStartManual?: string[]
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
  /** OS notifications for out-of-band events (guard gave up restarting, staged update ready) */
  systemNotifications: boolean
  /**
   * Custom accent color (#25). Empty/undefined keeps the CSS-defined default so light/dark
   * each retain their own; a set value overrides `--accent` at runtime in both modes.
   */
  accentColor?: string
  /**
   * Glass blur strength in px (#25) applied to `.glass`/`.glass-soft` backdrops. Undefined =
   * keep the stylesheet default (30px); a number overrides `--glass-blur` at runtime.
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
  /** broadcast: #22 tailed lines appended to a log file since the last tick (LogLineEvent) */
  OnLogLine: 'container:log-line'
} as const

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
