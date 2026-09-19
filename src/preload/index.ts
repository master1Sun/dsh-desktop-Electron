import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC, type UpdateCheckResult } from '../shared/types'

const api = {
  getNodeInfo: () => ipcRenderer.invoke(IPC.GetNodeInfo),
  listPages: () => ipcRenderer.invoke(IPC.ListPages),
  startPage: (id: string) => ipcRenderer.invoke(IPC.StartPage, id),
  stopPage: (id: string) => ipcRenderer.invoke(IPC.StopPage, id),
  restartPage: (id: string) => ipcRenderer.invoke(IPC.RestartPage, id),
  getPageLogs: (id: string) => ipcRenderer.invoke(IPC.GetPageLogs, id),
  installPageFromGit: (repoUrl: string, name?: string, port?: number) =>
    ipcRenderer.invoke(IPC.InstallPageFromGit, repoUrl, name, port),
  installPageFromDir: (srcDir: string, name?: string, port?: number) =>
    ipcRenderer.invoke(IPC.InstallPageFromDir, srcDir, name, port),
  chooseDirectory: () => ipcRenderer.invoke(IPC.ChooseDirectory),
  removePage: (id: string) => ipcRenderer.invoke(IPC.RemovePage, id),
  setPagePort: (id: string, port?: number) => ipcRenderer.invoke(IPC.SetPagePort, id, port),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.OpenPageExternal, url),
  getSettings: () => ipcRenderer.invoke(IPC.GetSettings),
  updateSettings: (partial: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC.UpdateSettings, partial),
  checkUpdates: (force?: boolean) => ipcRenderer.invoke(IPC.CheckUpdates, force),
  performUpdate: (target: UpdateCheckResult) => ipcRenderer.invoke(IPC.PerformUpdate, target),
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
  openclawStatus: () => ipcRenderer.invoke(IPC.OpenclawStatus),
  openclawToken: () => ipcRenderer.invoke(IPC.OpenclawToken),
  openclawCreatePage: (port?: number) => ipcRenderer.invoke(IPC.OpenclawCreatePage, port),
  pageRunSpec: (id: string) => ipcRenderer.invoke(IPC.PageRunSpec, id),
  openTerminalPage: (id: string) => ipcRenderer.invoke(IPC.OpenTerminalPage, id),
  onOpenTerminalPage: (cb: (id: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, id: string): void => cb(id)
    ipcRenderer.on(IPC.OpenTerminalPage, listener)
    return () => ipcRenderer.removeListener(IPC.OpenTerminalPage, listener)
  },
  ptyStart: (target: string, opts?: { command?: string; env?: Record<string, string> }) =>
    ipcRenderer.invoke(IPC.PtyStart, target, opts),
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
