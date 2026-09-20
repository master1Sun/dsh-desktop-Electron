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

/** Resolved "环境目录" info surfaced to the Settings panel. */
export interface EnvRootInfo {
  /** effective root every runtime's home dir defaults into */
  envRoot: string
  /** directory holding the app executable (the install dir when packaged) */
  installDir: string
  /** true when the user pinned a custom root instead of following the install dir */
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
  /** per-page directory env overrides: pageId -> (envVarKey -> path); empty value falls back to the spec defaultPath */
  pageEnvs: Record<string, Record<string, string>>
  /** per-page port overrides: pageId -> port; wins over container.json so imported projects need no editing */
  pagePorts: Record<string, number>
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
}

export interface UpdateOutcome {
  name: string
  ok: boolean
  updated: boolean
  error?: string
  message?: string
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
  CheckUpdates: 'container:check-updates',
  PerformUpdate: 'container:perform-update',
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
  OpenTerminalPage: 'container:open-terminal-page'
} as const
