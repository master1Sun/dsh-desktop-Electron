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
  OnStateChanged: "container:state-changed",
  DshStatus: "dsh:status",
  DshListPlugins: "dsh:list-plugins",
  DshPluginUpdates: "dsh:plugin-updates",
  DshInstallPlugin: "dsh:install-plugin",
  DshUninstallPlugin: "dsh:uninstall-plugin",
  DshUpdatePlugin: "dsh:update-plugin",
  DshUpdateAll: "dsh:update-all",
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
  OnDownloadProgress: "container:download-progress"
};
const api = {
  getNodeInfo: () => ipcRenderer.invoke(IPC.GetNodeInfo),
  nodeListVersions: () => ipcRenderer.invoke(IPC.ListNodeVersions),
  nodeUpdate: (version) => ipcRenderer.invoke(IPC.UpdateNodeRuntime, version),
  nodeRestoreBundled: () => ipcRenderer.invoke(IPC.RestoreBundledNode),
  provisionBuiltin: (kind) => ipcRenderer.invoke(IPC.ProvisionBuiltin, kind),
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
  setPagePort: (id, port) => ipcRenderer.invoke(IPC.SetPagePort, id, port),
  openExternal: (url) => ipcRenderer.invoke(IPC.OpenPageExternal, url),
  getSettings: () => ipcRenderer.invoke(IPC.GetSettings),
  updateSettings: (partial) => ipcRenderer.invoke(IPC.UpdateSettings, partial),
  getEnvRoot: () => ipcRenderer.invoke(IPC.EnvRoot),
  getDownloadDir: () => ipcRenderer.invoke(IPC.DownloadDir),
  checkUpdates: (force) => ipcRenderer.invoke(IPC.CheckUpdates, force),
  performUpdate: (target) => ipcRenderer.invoke(IPC.PerformUpdate, target),
  openLogsDir: () => ipcRenderer.invoke(IPC.OpenLogsDir),
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
  dshStatus: (profile) => ipcRenderer.invoke(IPC.DshStatus, profile),
  dshListPlugins: (profile) => ipcRenderer.invoke(IPC.DshListPlugins, profile),
  dshCheckUpdates: (profile) => ipcRenderer.invoke(IPC.DshPluginUpdates, profile),
  dshInstallPlugin: (spec, profile) => ipcRenderer.invoke(IPC.DshInstallPlugin, spec, profile),
  dshUninstallPlugin: (name, profile) => ipcRenderer.invoke(IPC.DshUninstallPlugin, name, profile),
  dshUpdatePlugin: (name, channel, gitUrl, profile) => ipcRenderer.invoke(IPC.DshUpdatePlugin, name, channel, gitUrl, profile),
  dshUpdateAll: (profile) => ipcRenderer.invoke(IPC.DshUpdateAll, profile),
  dshCreatePage: (profile, port) => ipcRenderer.invoke(IPC.DshCreatePage, profile, port),
  dshToken: (profile) => ipcRenderer.invoke(IPC.DshToken, profile),
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
