import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  IPC,
  type BuiltinKind,
  type ContainerEvent,
  type DownloadProgress,
  type DshPluginOpEvent,
  type HotkeySignal,
  type ImportOptions,
  type InstallProgress,
  type ListEventsArgs,
  type McpCallToolArgs,
  type McpServerSpec,
  type PageProgress,
  type ReadLogsArgs,
  type ToastLevel,
  type UpdateCheckResult,
  type UpdateProgress,
  type LogLineEvent,
  type NetSample,
  type PageMetrics,
  type WebDataClearArgs,
  type WorkspaceNote,
  type WorkspaceTask
} from '../shared/types'

const api = {
  getNodeInfo: () => ipcRenderer.invoke(IPC.GetNodeInfo),
  nodeListVersions: (includeIncompatible?: boolean) =>
    ipcRenderer.invoke(IPC.ListNodeVersions, includeIncompatible),
  nodeUpdate: (version: string) => ipcRenderer.invoke(IPC.UpdateNodeRuntime, version),
  nodeRestoreBundled: () => ipcRenderer.invoke(IPC.RestoreBundledNode),
  provisionBuiltin: (kind: BuiltinKind, version?: string) =>
    ipcRenderer.invoke(IPC.ProvisionBuiltin, kind, version),
  onNodeUpdateProgress: (cb: (p: UpdateProgress) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: UpdateProgress): void => cb(p)
    ipcRenderer.on(IPC.OnNodeUpdateProgress, listener)
    return () => ipcRenderer.removeListener(IPC.OnNodeUpdateProgress, listener)
  },
  listPages: () => ipcRenderer.invoke(IPC.ListPages),
  startPage: (id: string) => ipcRenderer.invoke(IPC.StartPage, id),
  stopPage: (id: string) => ipcRenderer.invoke(IPC.StopPage, id),
  restartPage: (id: string) => ipcRenderer.invoke(IPC.RestartPage, id),
  getPageLogs: (id: string) => ipcRenderer.invoke(IPC.GetPageLogs, id),
  installPageFromGit: (repoUrl: string, name?: string, port?: number, opts?: ImportOptions) =>
    ipcRenderer.invoke(IPC.InstallPageFromGit, repoUrl, name, port, opts),
  installPageFromDir: (
    srcDir: string,
    name?: string,
    port?: number,
    originUrl?: string,
    opts?: ImportOptions
  ) => ipcRenderer.invoke(IPC.InstallPageFromDir, srcDir, name, port, originUrl, opts),
  installPageFromNpm: (spec: string, name?: string) =>
    ipcRenderer.invoke(IPC.InstallPageFromNpm, spec, name),
  // judge an import source before downloading: IpcResult<ImportPreflight> (tier null = unknown)
  preflightImport: (source: string, isDir: boolean) =>
    ipcRenderer.invoke(IPC.PreflightImport, source, isDir),
  chooseDirectory: (title?: string) => ipcRenderer.invoke(IPC.ChooseDirectory, title),
  removePage: (id: string) => ipcRenderer.invoke(IPC.RemovePage, id),
  setPageDisabled: (id: string, disabled: boolean) =>
    ipcRenderer.invoke(IPC.SetPageDisabled, id, disabled),
  resetBuiltinPage: (id: string) => ipcRenderer.invoke(IPC.ResetBuiltinPage, id),
  setPagePort: (id: string, port?: number) => ipcRenderer.invoke(IPC.SetPagePort, id, port),
  // #4: override a page's dependency list (container-side, keeps its container.json untouched)
  setPageDeps: (id: string, deps?: string[]) => ipcRenderer.invoke(IPC.SetPageDeps, id, deps),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.OpenPageExternal, url),
  getSettings: () => ipcRenderer.invoke(IPC.GetSettings),
  // forward one renderer toast to the OS notification center; resolves whether it showed,
  // so the caller can fall back to the in-app corner toast when notifications are unavailable
  showSystemToast: (level: ToastLevel, text: string) =>
    ipcRenderer.invoke(IPC.ShowSystemToast, { level, text } as { level: ToastLevel; text: string }),
  updateSettings: (partial: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC.UpdateSettings, partial),
  getEnvRoot: () => ipcRenderer.invoke(IPC.EnvRoot),
  getDownloadDir: () => ipcRenderer.invoke(IPC.DownloadDir),
  checkUpdates: (force?: boolean) => ipcRenderer.invoke(IPC.CheckUpdates, force),
  performUpdate: (target: UpdateCheckResult) => ipcRenderer.invoke(IPC.PerformUpdate, target),
  openLogsDir: () => ipcRenderer.invoke(IPC.OpenLogsDir),
  listLogFiles: () => ipcRenderer.invoke(IPC.ListLogFiles),
  readLogs: (args: ReadLogsArgs) => ipcRenderer.invoke(IPC.ReadLogs, args),
  exportDiagnostics: () => ipcRenderer.invoke(IPC.ExportDiagnostics),
  exportSnapshot: () => ipcRenderer.invoke(IPC.ExportSnapshot),
  importSnapshot: () => ipcRenderer.invoke(IPC.ImportSnapshot),
  runNetworkProbe: () => ipcRenderer.invoke(IPC.RunNetworkProbe),
  // #26: latency/reachability of every candidate npm registry, for the 网络镜像 panel.
  probeRegistries: () => ipcRenderer.invoke(IPC.ProbeRegistries),
  // #26: embedded-webview data (cookies per domain + cache/storage bytes) and its wipe buttons.
  getWebData: () => ipcRenderer.invoke(IPC.GetWebData),
  clearWebData: (args: WebDataClearArgs) => ipcRenderer.invoke(IPC.ClearWebData, args),
  // #8: disk-usage dashboard (Settings ▸ 存储) + its two allowlisted wipe scopes.
  getDiskReport: () => ipcRenderer.invoke(IPC.GetDiskReport),
  clearDiskScope: (scope: string) => ipcRenderer.invoke(IPC.ClearDiskScope, scope),
  getSystemInfo: () => ipcRenderer.invoke(IPC.GetSystemInfo),
  getNetworkStats: () => ipcRenderer.invoke(IPC.GetNetworkStats),
  getUpdateHistory: () => ipcRenderer.invoke(IPC.GetUpdateHistory),
  getPageMetrics: () => ipcRenderer.invoke(IPC.GetPageMetrics),
  killPortHolder: (port: number) => ipcRenderer.invoke(IPC.KillPortHolder, port),
  // port pre-flight for the page config dialog; `pageId` lets the main process ignore the page's
  // own listener when it is the one being edited
  checkPortFree: (port: number, pageId?: string) =>
    ipcRenderer.invoke(IPC.CheckPortFree, port, pageId),
  // activity timeline (帮助 → 事件动态): cold read + live rows
  listEvents: (args: ListEventsArgs) => ipcRenderer.invoke(IPC.ListEvents, args),
  onEvent: (cb: (ev: ContainerEvent) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, ev: ContainerEvent): void => cb(ev)
    ipcRenderer.on(IPC.OnEvent, listener)
    return () => ipcRenderer.removeListener(IPC.OnEvent, listener)
  },
  // retained CPU/RAM trend samples per running page, for the sparkline and the config chart
  getMetricsHistory: () => ipcRenderer.invoke(IPC.GetMetricsHistory),
  // open a page in its own window (the renderer's minimal `?popout=` layout)
  openPageWindow: (pageId: string) => ipcRenderer.invoke(IPC.OpenPageWindow, pageId),
  // a container shortcut pressed inside a hosted page, forwarded by the main process
  onHotkey: (cb: (sig: HotkeySignal) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, sig: HotkeySignal): void => cb(sig)
    ipcRenderer.on(IPC.OnHotkey, listener)
    return () => ipcRenderer.removeListener(IPC.OnHotkey, listener)
  },
  rollbackAsar: () => ipcRenderer.invoke(IPC.RollbackAsar),
  onUpdateResults: (cb: (results: UpdateCheckResult[]) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, results: UpdateCheckResult[]): void =>
      cb(results)
    ipcRenderer.on(IPC.OnUpdateResults, listener)
    return () => ipcRenderer.removeListener(IPC.OnUpdateResults, listener)
  },
  onUpdateProgress: (cb: (p: UpdateProgress) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: UpdateProgress): void => cb(p)
    ipcRenderer.on(IPC.OnUpdateProgress, listener)
    return () => ipcRenderer.removeListener(IPC.OnUpdateProgress, listener)
  },
  onPageProgress: (cb: (p: PageProgress) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: PageProgress): void => cb(p)
    ipcRenderer.on(IPC.OnPageProgress, listener)
    return () => ipcRenderer.removeListener(IPC.OnPageProgress, listener)
  },
  onInstallProgress: (cb: (p: InstallProgress) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: InstallProgress): void => cb(p)
    ipcRenderer.on(IPC.OnInstallProgress, listener)
    return () => ipcRenderer.removeListener(IPC.OnInstallProgress, listener)
  },
  onDownloadProgress: (cb: (p: DownloadProgress) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: DownloadProgress): void => cb(p)
    ipcRenderer.on(IPC.OnDownloadProgress, listener)
    return () => ipcRenderer.removeListener(IPC.OnDownloadProgress, listener)
  },
  relaunchApp: () => ipcRenderer.invoke(IPC.RelaunchApp),
  quitApp: () => ipcRenderer.invoke(IPC.QuitApp),
  onQuitConfirm: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.OnQuitConfirm, listener)
    return () => ipcRenderer.removeListener(IPC.OnQuitConfirm, listener)
  },
  dshStatus: (profile?: string) => ipcRenderer.invoke(IPC.DshStatus, profile),
  dshListPlugins: (profile?: string) => ipcRenderer.invoke(IPC.DshListPlugins, profile),
  dshCheckUpdates: (profile?: string) => ipcRenderer.invoke(IPC.DshPluginUpdates, profile),
  dshInstallPlugin: (spec: string, profile?: string) =>
    ipcRenderer.invoke(IPC.DshInstallPlugin, spec, profile),
  dshUninstallPlugin: (name: string, profile?: string) =>
    ipcRenderer.invoke(IPC.DshUninstallPlugin, name, profile),
  dshUpdatePlugin: (name: string, channel: 'npm' | 'git', gitUrl?: string, profile?: string) =>
    ipcRenderer.invoke(IPC.DshUpdatePlugin, name, channel, gitUrl, profile),
  dshUpdateAll: (profile?: string) => ipcRenderer.invoke(IPC.DshUpdateAll, profile),
  dshCreatePage: (profile: string, port?: number) =>
    ipcRenderer.invoke(IPC.DshCreatePage, profile, port),
  dshToken: (profile?: string) => ipcRenderer.invoke(IPC.DshToken, profile),
  onDshPluginOp: (cb: (p: DshPluginOpEvent) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: DshPluginOpEvent): void => cb(p)
    ipcRenderer.on(IPC.OnDshPluginOp, listener)
    return () => ipcRenderer.removeListener(IPC.OnDshPluginOp, listener)
  },
  openclawStatus: () => ipcRenderer.invoke(IPC.OpenclawStatus),
  openclawToken: () => ipcRenderer.invoke(IPC.OpenclawToken),
  openclawInitToken: (rotate?: boolean) => ipcRenderer.invoke(IPC.OpenclawInitToken, rotate),
  openclawCreatePage: (port?: number) => ipcRenderer.invoke(IPC.OpenclawCreatePage, port),
  pageRunSpec: (id: string) => ipcRenderer.invoke(IPC.PageRunSpec, id),
  openTerminalPage: (id: string) => ipcRenderer.invoke(IPC.OpenTerminalPage, id),
  onOpenTerminalPage: (cb: (id: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, id: string): void => cb(id)
    ipcRenderer.on(IPC.OpenTerminalPage, listener)
    return () => ipcRenderer.removeListener(IPC.OpenTerminalPage, listener)
  },
  ptyStart: (
    target: string,
    opts?: { command?: string; env?: Record<string, string>; shell?: string }
  ) => ipcRenderer.invoke(IPC.PtyStart, target, opts),
  ptyShells: () => ipcRenderer.invoke(IPC.PtyShells),
  ptyWrite: (id: string, data: string) => ipcRenderer.invoke(IPC.PtyWrite, id, data),
  ptyResize: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke(IPC.PtyResize, id, cols, rows),
  ptyKill: (id: string) => ipcRenderer.invoke(IPC.PtyKill, id),
  onPtyData: (cb: (payload: { id: string; data: string }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { id: string; data: string }): void =>
      cb(payload)
    ipcRenderer.on(IPC.OnPtyData, listener)
    return () => ipcRenderer.removeListener(IPC.OnPtyData, listener)
  },
  onPtyExit: (cb: (payload: { id: string; code: number }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { id: string; code: number }): void =>
      cb(payload)
    ipcRenderer.on(IPC.OnPtyExit, listener)
    return () => ipcRenderer.removeListener(IPC.OnPtyExit, listener)
  },
  toggleDevTools: (guestId?: number) => ipcRenderer.invoke(IPC.ToggleDevTools, guestId),
  getNativeTheme: () => ipcRenderer.invoke(IPC.GetNativeTheme),
  setNativeTheme: (source: 'auto' | 'light' | 'dark' | boolean) =>
    ipcRenderer.invoke(IPC.SetNativeTheme, source),
  onNativeTheme: (cb: (isDark: boolean) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, isDark: boolean): void => cb(isDark)
    ipcRenderer.on(IPC.OnNativeTheme, listener)
    return () => ipcRenderer.removeListener(IPC.OnNativeTheme, listener)
  },
  minimizeWindow: () => ipcRenderer.invoke(IPC.MinimizeWindow),
  toggleMaximize: () => ipcRenderer.invoke(IPC.ToggleMaximize),
  closeWindow: () => ipcRenderer.invoke(IPC.CloseWindow),
  getIsMaximized: () => ipcRenderer.invoke(IPC.GetIsMaximized),
  onMaximizedChanged: (cb: (isMaximized: boolean) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, isMaximized: boolean): void => cb(isMaximized)
    ipcRenderer.on(IPC.OnMaximizedChanged, listener)
    return () => ipcRenderer.removeListener(IPC.OnMaximizedChanged, listener)
  },
  onStateChanged: (cb: (running: unknown[]) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, running: unknown[]): void => cb(running)
    ipcRenderer.on(IPC.OnStateChanged, listener)
    return () => ipcRenderer.removeListener(IPC.OnStateChanged, listener)
  },
  // #22 live log stream: tailed lines appended to one file since the last push.
  onLogLine: (cb: (ev: LogLineEvent) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, ev: LogLineEvent): void => cb(ev)
    ipcRenderer.on(IPC.OnLogLine, listener)
    return () => ipcRenderer.removeListener(IPC.OnLogLine, listener)
  },
  // #20 periodic CPU/RAM sample for running pages.
  onPageMetrics: (cb: (metrics: PageMetrics[]) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, metrics: PageMetrics[]): void => cb(metrics)
    ipcRenderer.on(IPC.OnPageMetrics, listener)
    return () => ipcRenderer.removeListener(IPC.OnPageMetrics, listener)
  },
  // top-bar network indicator: shared live sample (rates + latency + online ports) from main.
  onNetSample: (cb: (sample: NetSample) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, sample: NetSample): void => cb(sample)
    ipcRenderer.on(IPC.OnNetSample, listener)
    return () => ipcRenderer.removeListener(IPC.OnNetSample, listener)
  },
  // MCP Client Hub: registry CRUD + connect lifecycle + tool catalog/calls.
  mcpListServers: () => ipcRenderer.invoke(IPC.McpListServers),
  mcpSaveServer: (spec: McpServerSpec) => ipcRenderer.invoke(IPC.McpSaveServer, spec),
  mcpRemoveServer: (id: string) => ipcRenderer.invoke(IPC.McpRemoveServer, id),
  mcpConnect: (id: string) => ipcRenderer.invoke(IPC.McpConnect, id),
  mcpDisconnect: (id: string) => ipcRenderer.invoke(IPC.McpDisconnect, id),
  mcpListTools: (serverId?: string) => ipcRenderer.invoke(IPC.McpListTools, serverId),
  mcpCallTool: (args: McpCallToolArgs) => ipcRenderer.invoke(IPC.McpCallTool, args),
  getMcpCalls: () => ipcRenderer.invoke(IPC.GetMcpCalls),
  mcpBridgeInfo: () => ipcRenderer.invoke(IPC.McpBridgeInfo),
  // #11: state + connection info of the container's OWN MCP server (gated, default off)
  getContainerMcpInfo: () => ipcRenderer.invoke(IPC.GetContainerMcpInfo),
  mcpPackagesStatus: () => ipcRenderer.invoke(IPC.McpPackagesStatus),
  // shared workspace: the one container-owned context every hosted agent reads/writes
  workspaceGet: () => ipcRenderer.invoke(IPC.WorkspaceGet),
  workspaceSave: (patch: { task?: string; notes?: WorkspaceNote[]; tasks?: WorkspaceTask[] }) =>
    ipcRenderer.invoke(IPC.WorkspaceSave, patch),
  workspaceBroadcast: () => ipcRenderer.invoke(IPC.WorkspaceBroadcast),
  onMcpStateChanged: (cb: (states: unknown[]) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, states: unknown[]): void => cb(states)
    ipcRenderer.on(IPC.OnMcpStateChanged, listener)
    return () => ipcRenderer.removeListener(IPC.OnMcpStateChanged, listener)
  },
  onMcpCalls: (cb: (calls: unknown[]) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, calls: unknown[]): void => cb(calls)
    ipcRenderer.on(IPC.OnMcpCalls, listener)
    return () => ipcRenderer.removeListener(IPC.OnMcpCalls, listener)
  }
}

export type ContainerApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('container', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.container = api
}
