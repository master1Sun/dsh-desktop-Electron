import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
const IPC = {
  GetNodeInfo: "container:get-node-info",
  ListPages: "container:list-pages",
  StartPage: "container:start-page",
  StopPage: "container:stop-page",
  RestartPage: "container:restart-page",
  GetPageLogs: "container:get-page-logs",
  InstallPageFromGit: "container:install-page-git",
  InstallPageFromDir: "container:install-page-dir",
  ChooseDirectory: "container:choose-directory",
  RemovePage: "container:remove-page",
  /** restore a builtin page's userData copy from the bundled seed (user broke its files) */
  ResetBuiltinPage: "container:reset-builtin-page",
  SetPagePort: "container:set-page-port",
  OpenPageExternal: "container:open-page-external",
  GetSettings: "container:get-settings",
  UpdateSettings: "container:update-settings",
  EnvRoot: "container:env-root",
  /** resolved webview download folder + the OS default it falls back to (DownloadDirInfo) */
  DownloadDir: "container:download-dir",
  CheckUpdates: "container:check-updates",
  PerformUpdate: "container:perform-update",
  /** list Node versions eligible to replace the bundled runtime (NodeVersionInfo[]) */
  ListNodeVersions: "container:list-node-versions",
  /** download + install one Node runtime over the bundled one; streams OnNodeUpdateProgress */
  UpdateNodeRuntime: "container:update-node-runtime",
  /** drop the updated runtime and fall back to the installer-shipped bundled one */
  RestoreBundledNode: "container:restore-bundled-node",
  /** install/upgrade a built-in agent runtime (dsh / openclaw) with the bundled npm (BuiltinKind) */
  ProvisionBuiltin: "container:provision-builtin",
  /** stream: live progress of an in-flight bundled-Node update (UpdateProgress) */
  OnNodeUpdateProgress: "container:node-update-progress",
  /** broadcast: live progress of an in-flight update download (UpdateProgress) */
  OnUpdateProgress: "container:update-progress",
  /** broadcast: per-page startup progress while a page is 'starting' (PageProgress) */
  OnPageProgress: "container:page-progress",
  /** stream: import progress (git clone / local copy) back to the requesting window (InstallProgress) */
  OnInstallProgress: "container:install-progress",
  /** broadcast: silent background update-check results (UpdateCheckResult[]) — badge-only, never a popup */
  OnUpdateResults: "container:update-results",
  /** open userData/logs in the OS file manager (field debugging: packaged apps have no stderr) */
  OpenLogsDir: "container:open-logs-dir",
  /** relaunch the app after the container updated its own source from git */
  RelaunchApp: "container:relaunch-app",
  QuitApp: "container:quit-app",
  /** push: main asks the renderer to show a horizontal quit-confirm dialog */
  OnQuitConfirm: "container:quit-confirm",
  OnStateChanged: "container:state-changed",
  DshStatus: "dsh:status",
  DshListPlugins: "dsh:list-plugins",
  DshPluginUpdates: "dsh:plugin-updates",
  DshInstallPlugin: "dsh:install-plugin",
  DshUninstallPlugin: "dsh:uninstall-plugin",
  DshUpdatePlugin: "dsh:update-plugin",
  DshUpdateAll: "dsh:update-all",
  /** broadcast: in-flight dsh plugin ops (DshPluginOpEvent) → window top progress bar */
  OnDshPluginOp: "dsh:plugin-op",
  DshCreatePage: "dsh:create-page",
  DshToken: "dsh:token",
  OpenclawStatus: "openclaw:status",
  OpenclawCreatePage: "openclaw:create-page",
  OpenclawToken: "openclaw:token",
  /** one-click: generate & persist a gateway token (rotate when the arg is true) */
  OpenclawInitToken: "openclaw:init-token",
  ToggleDevTools: "container:toggle-devtools",
  GetNativeTheme: "container:get-native-theme",
  OnNativeTheme: "container:native-theme",
  SetNativeTheme: "container:set-native-theme",
  MinimizeWindow: "container:minimize-window",
  ToggleMaximize: "container:toggle-maximize",
  CloseWindow: "container:close-window",
  GetIsMaximized: "container:get-is-maximized",
  OnMaximizedChanged: "container:maximized-changed",
  PtyStart: "container:pty-start",
  PageRunSpec: "container:page-run-spec",
  PtyWrite: "container:pty-write",
  PtyResize: "container:pty-resize",
  PtyKill: "container:pty-kill",
  OnPtyData: "container:pty-data",
  OnPtyExit: "container:pty-exit",
  /** broadcast: a secondary window asks every window to switch to that CLI page's terminal */
  OpenTerminalPage: "container:open-terminal-page",
  /** broadcast: live progress of a file download inside an embedded webview (DownloadProgress) */
  OnDownloadProgress: "container:download-progress",
  /** list readable log files (main + per-page tails) for the in-app viewer (LogFileInfo[]) */
  ListLogFiles: "container:list-log-files",
  /** read the tail of one log file, optionally filtered (ReadLogsArgs → LogReadResult) */
  ReadLogs: "container:read-logs",
  /** collect versions/settings/logs summary into a zip via a save dialog; resolves the path */
  ExportDiagnostics: "container:export-diagnostics",
  /** taskkill the foreign process LISTENING on that port (port-conflict quick fix) */
  KillPortHolder: "container:kill-port-holder",
  /** swap the pre-update app.asar.bak back in and relaunch (one-level OTA rollback) */
  RollbackAsar: "container:rollback-asar",
  /** #15: bundle pages manifest + per-page container.json + settings into an importable zip */
  ExportSnapshot: "container:export-snapshot",
  /** #15: restore from a snapshot zip chosen via open dialog */
  ImportSnapshot: "container:import-snapshot",
  /** #21: one-shot network reachability probe (connectivity / proxy / registry mirrors) */
  RunNetworkProbe: "container:run-network-probe",
  /** #17: read the OTA update-meta history for the container row */
  GetUpdateHistory: "container:get-update-history",
  /** #20: on-demand CPU/RAM sample for currently running pages (PageMetrics[]) */
  GetPageMetrics: "container:get-page-metrics",
  /** system + runtime overview for the help panel's 关于与运行 tab (SystemInfo) */
  GetSystemInfo: "container:get-system-info",
  /** live network interfaces + cumulative byte counters for the help panel (NetworkStats) */
  GetNetworkStats: "container:get-network-stats",
  /** broadcast: #20 periodic CPU/RAM sample for running pages (PageMetrics[]) */
  OnPageMetrics: "container:page-metrics",
  /** broadcast: #22 tailed lines appended to a log file since the last tick (LogLineEvent) */
  OnLogLine: "container:log-line",
  /** #26: probe every candidate npm registry in parallel → RegistryProbe[] */
  ProbeRegistries: "container:probe-registries",
  /** #26: what the embedded webviews hold (cookies per domain, cache + storage bytes) → WebDataReport */
  GetWebData: "container:get-web-data",
  /** #26: wipe cache / cookies (optionally one domain) / storage / everything (WebDataClearArgs) */
  ClearWebData: "container:clear-web-data",
  /** activity timeline: read filtered events from logs/events.jsonl (ListEventsArgs → ContainerEvent[]) */
  ListEvents: "container:list-events",
  /** broadcast: one new activity-timeline event (ContainerEvent) */
  OnEvent: "container:event",
  /** #20 follow-up: retained CPU/RAM history per running page → Record<pageId, PageMetrics[]> */
  GetMetricsHistory: "container:get-metrics-history",
  /** open a hosted page in its own top-level window (pageId) — shares the embedded-page session */
  OpenPageWindow: "container:open-page-window",
  /** is a TCP port free on 127.0.0.1? → { free, holder? } so the config dialog can warn up front */
  CheckPortFree: "container:check-port-free",
  /** broadcast: a rebindable shortcut was pressed *inside* a hosted webview, so the shell window
   *  that owns the action runs it (HotkeySignal). The guest consumed nothing back. */
  OnHotkey: "container:hotkey"
};
const api = {
  getNodeInfo: () => ipcRenderer.invoke(IPC.GetNodeInfo),
  nodeListVersions: (includeIncompatible) => ipcRenderer.invoke(IPC.ListNodeVersions, includeIncompatible),
  nodeUpdate: (version) => ipcRenderer.invoke(IPC.UpdateNodeRuntime, version),
  nodeRestoreBundled: () => ipcRenderer.invoke(IPC.RestoreBundledNode),
  provisionBuiltin: (kind, version) => ipcRenderer.invoke(IPC.ProvisionBuiltin, kind, version),
  onNodeUpdateProgress: (cb) => {
    const listener = (_e, p) => cb(p);
    ipcRenderer.on(IPC.OnNodeUpdateProgress, listener);
    return () => ipcRenderer.removeListener(IPC.OnNodeUpdateProgress, listener);
  },
  listPages: () => ipcRenderer.invoke(IPC.ListPages),
  startPage: (id) => ipcRenderer.invoke(IPC.StartPage, id),
  stopPage: (id) => ipcRenderer.invoke(IPC.StopPage, id),
  restartPage: (id) => ipcRenderer.invoke(IPC.RestartPage, id),
  getPageLogs: (id) => ipcRenderer.invoke(IPC.GetPageLogs, id),
  installPageFromGit: (repoUrl, name, port) => ipcRenderer.invoke(IPC.InstallPageFromGit, repoUrl, name, port),
  installPageFromDir: (srcDir, name, port, originUrl) => ipcRenderer.invoke(IPC.InstallPageFromDir, srcDir, name, port, originUrl),
  chooseDirectory: (title) => ipcRenderer.invoke(IPC.ChooseDirectory, title),
  removePage: (id) => ipcRenderer.invoke(IPC.RemovePage, id),
  resetBuiltinPage: (id) => ipcRenderer.invoke(IPC.ResetBuiltinPage, id),
  setPagePort: (id, port) => ipcRenderer.invoke(IPC.SetPagePort, id, port),
  openExternal: (url) => ipcRenderer.invoke(IPC.OpenPageExternal, url),
  getSettings: () => ipcRenderer.invoke(IPC.GetSettings),
  updateSettings: (partial) => ipcRenderer.invoke(IPC.UpdateSettings, partial),
  getEnvRoot: () => ipcRenderer.invoke(IPC.EnvRoot),
  getDownloadDir: () => ipcRenderer.invoke(IPC.DownloadDir),
  checkUpdates: (force) => ipcRenderer.invoke(IPC.CheckUpdates, force),
  performUpdate: (target) => ipcRenderer.invoke(IPC.PerformUpdate, target),
  openLogsDir: () => ipcRenderer.invoke(IPC.OpenLogsDir),
  listLogFiles: () => ipcRenderer.invoke(IPC.ListLogFiles),
  readLogs: (args) => ipcRenderer.invoke(IPC.ReadLogs, args),
  exportDiagnostics: () => ipcRenderer.invoke(IPC.ExportDiagnostics),
  exportSnapshot: () => ipcRenderer.invoke(IPC.ExportSnapshot),
  importSnapshot: () => ipcRenderer.invoke(IPC.ImportSnapshot),
  runNetworkProbe: () => ipcRenderer.invoke(IPC.RunNetworkProbe),
  // #26: latency/reachability of every candidate npm registry, for the 网络镜像 panel.
  probeRegistries: () => ipcRenderer.invoke(IPC.ProbeRegistries),
  // #26: embedded-webview data (cookies per domain + cache/storage bytes) and its wipe buttons.
  getWebData: () => ipcRenderer.invoke(IPC.GetWebData),
  clearWebData: (args) => ipcRenderer.invoke(IPC.ClearWebData, args),
  getSystemInfo: () => ipcRenderer.invoke(IPC.GetSystemInfo),
  getNetworkStats: () => ipcRenderer.invoke(IPC.GetNetworkStats),
  getUpdateHistory: () => ipcRenderer.invoke(IPC.GetUpdateHistory),
  getPageMetrics: () => ipcRenderer.invoke(IPC.GetPageMetrics),
  killPortHolder: (port) => ipcRenderer.invoke(IPC.KillPortHolder, port),
  // port pre-flight for the page config dialog; `pageId` lets the main process ignore the page's
  // own listener when it is the one being edited
  checkPortFree: (port, pageId) => ipcRenderer.invoke(IPC.CheckPortFree, port, pageId),
  // activity timeline (帮助 → 事件动态): cold read + live rows
  listEvents: (args) => ipcRenderer.invoke(IPC.ListEvents, args),
  onEvent: (cb) => {
    const listener = (_e, ev) => cb(ev);
    ipcRenderer.on(IPC.OnEvent, listener);
    return () => ipcRenderer.removeListener(IPC.OnEvent, listener);
  },
  // retained CPU/RAM trend samples per running page, for the sparkline and the config chart
  getMetricsHistory: () => ipcRenderer.invoke(IPC.GetMetricsHistory),
  // open a page in its own window (the renderer's minimal `?popout=` layout)
  openPageWindow: (pageId) => ipcRenderer.invoke(IPC.OpenPageWindow, pageId),
  // a container shortcut pressed inside a hosted page, forwarded by the main process
  onHotkey: (cb) => {
    const listener = (_e, sig) => cb(sig);
    ipcRenderer.on(IPC.OnHotkey, listener);
    return () => ipcRenderer.removeListener(IPC.OnHotkey, listener);
  },
  rollbackAsar: () => ipcRenderer.invoke(IPC.RollbackAsar),
  onUpdateResults: (cb) => {
    const listener = (_e, results) => cb(results);
    ipcRenderer.on(IPC.OnUpdateResults, listener);
    return () => ipcRenderer.removeListener(IPC.OnUpdateResults, listener);
  },
  onUpdateProgress: (cb) => {
    const listener = (_e, p) => cb(p);
    ipcRenderer.on(IPC.OnUpdateProgress, listener);
    return () => ipcRenderer.removeListener(IPC.OnUpdateProgress, listener);
  },
  onPageProgress: (cb) => {
    const listener = (_e, p) => cb(p);
    ipcRenderer.on(IPC.OnPageProgress, listener);
    return () => ipcRenderer.removeListener(IPC.OnPageProgress, listener);
  },
  onInstallProgress: (cb) => {
    const listener = (_e, p) => cb(p);
    ipcRenderer.on(IPC.OnInstallProgress, listener);
    return () => ipcRenderer.removeListener(IPC.OnInstallProgress, listener);
  },
  onDownloadProgress: (cb) => {
    const listener = (_e, p) => cb(p);
    ipcRenderer.on(IPC.OnDownloadProgress, listener);
    return () => ipcRenderer.removeListener(IPC.OnDownloadProgress, listener);
  },
  relaunchApp: () => ipcRenderer.invoke(IPC.RelaunchApp),
  quitApp: () => ipcRenderer.invoke(IPC.QuitApp),
  onQuitConfirm: (cb) => {
    const listener = () => cb();
    ipcRenderer.on(IPC.OnQuitConfirm, listener);
    return () => ipcRenderer.removeListener(IPC.OnQuitConfirm, listener);
  },
  dshStatus: (profile) => ipcRenderer.invoke(IPC.DshStatus, profile),
  dshListPlugins: (profile) => ipcRenderer.invoke(IPC.DshListPlugins, profile),
  dshCheckUpdates: (profile) => ipcRenderer.invoke(IPC.DshPluginUpdates, profile),
  dshInstallPlugin: (spec, profile) => ipcRenderer.invoke(IPC.DshInstallPlugin, spec, profile),
  dshUninstallPlugin: (name, profile) => ipcRenderer.invoke(IPC.DshUninstallPlugin, name, profile),
  dshUpdatePlugin: (name, channel, gitUrl, profile) => ipcRenderer.invoke(IPC.DshUpdatePlugin, name, channel, gitUrl, profile),
  dshUpdateAll: (profile) => ipcRenderer.invoke(IPC.DshUpdateAll, profile),
  dshCreatePage: (profile, port) => ipcRenderer.invoke(IPC.DshCreatePage, profile, port),
  dshToken: (profile) => ipcRenderer.invoke(IPC.DshToken, profile),
  onDshPluginOp: (cb) => {
    const listener = (_e, p) => cb(p);
    ipcRenderer.on(IPC.OnDshPluginOp, listener);
    return () => ipcRenderer.removeListener(IPC.OnDshPluginOp, listener);
  },
  openclawStatus: () => ipcRenderer.invoke(IPC.OpenclawStatus),
  openclawToken: () => ipcRenderer.invoke(IPC.OpenclawToken),
  openclawInitToken: (rotate) => ipcRenderer.invoke(IPC.OpenclawInitToken, rotate),
  openclawCreatePage: (port) => ipcRenderer.invoke(IPC.OpenclawCreatePage, port),
  pageRunSpec: (id) => ipcRenderer.invoke(IPC.PageRunSpec, id),
  openTerminalPage: (id) => ipcRenderer.invoke(IPC.OpenTerminalPage, id),
  onOpenTerminalPage: (cb) => {
    const listener = (_e, id) => cb(id);
    ipcRenderer.on(IPC.OpenTerminalPage, listener);
    return () => ipcRenderer.removeListener(IPC.OpenTerminalPage, listener);
  },
  ptyStart: (target, opts) => ipcRenderer.invoke(IPC.PtyStart, target, opts),
  ptyWrite: (id, data) => ipcRenderer.invoke(IPC.PtyWrite, id, data),
  ptyResize: (id, cols, rows) => ipcRenderer.invoke(IPC.PtyResize, id, cols, rows),
  ptyKill: (id) => ipcRenderer.invoke(IPC.PtyKill, id),
  onPtyData: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on(IPC.OnPtyData, listener);
    return () => ipcRenderer.removeListener(IPC.OnPtyData, listener);
  },
  onPtyExit: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on(IPC.OnPtyExit, listener);
    return () => ipcRenderer.removeListener(IPC.OnPtyExit, listener);
  },
  toggleDevTools: (guestId) => ipcRenderer.invoke(IPC.ToggleDevTools, guestId),
  getNativeTheme: () => ipcRenderer.invoke(IPC.GetNativeTheme),
  setNativeTheme: (source) => ipcRenderer.invoke(IPC.SetNativeTheme, source),
  onNativeTheme: (cb) => {
    const listener = (_e, isDark) => cb(isDark);
    ipcRenderer.on(IPC.OnNativeTheme, listener);
    return () => ipcRenderer.removeListener(IPC.OnNativeTheme, listener);
  },
  minimizeWindow: () => ipcRenderer.invoke(IPC.MinimizeWindow),
  toggleMaximize: () => ipcRenderer.invoke(IPC.ToggleMaximize),
  closeWindow: () => ipcRenderer.invoke(IPC.CloseWindow),
  getIsMaximized: () => ipcRenderer.invoke(IPC.GetIsMaximized),
  onMaximizedChanged: (cb) => {
    const listener = (_e, isMaximized) => cb(isMaximized);
    ipcRenderer.on(IPC.OnMaximizedChanged, listener);
    return () => ipcRenderer.removeListener(IPC.OnMaximizedChanged, listener);
  },
  onStateChanged: (cb) => {
    const listener = (_e, running) => cb(running);
    ipcRenderer.on(IPC.OnStateChanged, listener);
    return () => ipcRenderer.removeListener(IPC.OnStateChanged, listener);
  },
  // #22 live log stream: tailed lines appended to one file since the last push.
  onLogLine: (cb) => {
    const listener = (_e, ev) => cb(ev);
    ipcRenderer.on(IPC.OnLogLine, listener);
    return () => ipcRenderer.removeListener(IPC.OnLogLine, listener);
  },
  // #20 periodic CPU/RAM sample for running pages.
  onPageMetrics: (cb) => {
    const listener = (_e, metrics) => cb(metrics);
    ipcRenderer.on(IPC.OnPageMetrics, listener);
    return () => ipcRenderer.removeListener(IPC.OnPageMetrics, listener);
  }
};
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("container", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = electronAPI;
  window.container = api;
}
