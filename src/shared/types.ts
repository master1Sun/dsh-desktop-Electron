export const NODE_VERSION_REQUIRED = 'v24.21.0'

export type PageStatus = 'stopped' | 'starting' | 'running' | 'error'

/** 'terminal' = a CLI-only project (e.g. codex): no HTTP port, runs inside the embedded terminal */
export type PageKind = 'page' | 'dsh' | 'openclaw' | 'terminal'

/** default port openclaw's gateway listens on (matches `openclaw gateway --port`) */
export const OPENCLAW_DEFAULT_PORT = 18789

/** A configurable "home"/directory env var a page declares in its container.json `envVars` list.
    The container renders one settings input per entry and injects `<key>=<resolved path>` into
    that page's subprocess env at spawn (per-kind: only pages declaring the var receive it). */
export interface EnvVarSpec {
  /** env var name to inject, e.g. DSH_HOME / OPENCLAW_STATE_DIR / MYAPP_HOME */
  key: string
  /** short label shown in the settings panel; falls back to the key */
  label?: string
  /** default directory used when the user leaves the override empty (supports ~); also shown as placeholder */
  defaultPath?: string
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

export type DefaultView =
  { kind: 'none' } | { kind: 'page'; pageId: string } | { kind: 'external'; url: string }

export type ExternalOpenMode = 'embedded' | 'system-browser'

export interface ContainerSettings {
  defaultView: DefaultView
  openExternalIn: ExternalOpenMode
  minimizeToTray: boolean
  autoStartPages: string[]
  lastExternalUrls: string[]
  /** user-saved named external URLs, managed + previewable from the top bar */
  externalSites: ExternalSite[]
  theme: 'auto' | 'light' | 'dark'
  /** dsh home override; empty = dsh's own default ~/.dsh */
  dshHome: string
  /** openclaw config home override; empty = ~/.openclaw (matches the CLI's default) */
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
  action?: 'pull' | 'reprovision' | 'manual'
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
  CheckUpdates: 'container:check-updates',
  PerformUpdate: 'container:perform-update',
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
