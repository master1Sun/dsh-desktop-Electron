import { ipcMain, shell, BrowserWindow, webContents, nativeTheme, dialog, app } from 'electron'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  IPC,
  DEFAULT_KEYBINDINGS,
  type IpcResult,
  type BuiltinKind,
  type ContainerReleaseChannel,
  type DefaultView,
  type DshReleaseChannel,
  type DshTokenResult,
  type DshUpdateChannel,
  type HotkeySignal,
  type InstallProgress,
  type KeybindingAction,
  type ListEventsArgs,
  type OpenclawInitTokenResult,
  type PageProgress,
  type PortCheckResult,
  type ReadLogsArgs,
  type UpdateCheckResult,
  type UpdateProgress,
  type WebDataClearArgs
} from '../../shared/types'
import { matchesAccelerator } from '../../shared/accel'
import { getNodeRuntimeInfo } from '../runtime/node-runtime'
import { listNodeVersions, updateNodeRuntime, restoreBundledNode } from '../update/node-updater'
import {
  PageRegistry,
  expandStartCommand,
  buildPageEnv,
  resolveDshToken,
  BUILTIN_PAGE_IDS
} from '../runtime/pages'
import {
  getSettings,
  updateSettings,
  setDefaultView,
  syncAutoStartForDefaultView,
  resolvePagesDir,
  isValidPort,
  resolveProjectDir,
  resolveDshProfileDir,
  resolveDshHome,
  resolveOpenclawHome,
  resolveEnvRoot,
  resolveInstallDir,
  resolveDownloadDir,
  defaultDownloadDir,
  applyLaunchAtStartup,
  applyNpmRegistryEnv
} from './store'
import { installFromGit, installFromLocalDir, removePage } from '../runtime/installer'
import {
  checkUpdates,
  performUpdate,
  clearUpdateCache,
  provisionBuiltin
} from '../update/update-service'
import {
  relaunchToApplyStaged,
  canRollbackAsar,
  rollbackToPreviousAsar,
  getUpdateHistory,
  resetBranchProbe
} from '../update/asar-updates'
import { logsDir, listLogFiles, readLogTail, startLogStream } from './logger'
import { exportDiagnostics } from '../runtime/diagnostics'
import { exportSnapshot, importSnapshot } from '../runtime/snapshot'
import { runNetworkProbe, probeRegistries } from '../runtime/net-probe'
import { getWebDataReport, clearWebData } from './webdata'
import { getSystemInfo, getNetworkStats } from '../runtime/sysinfo'
import { collectPageMetrics, pruneMetricsBaseline, getMetricsHistory } from '../runtime/metrics'
import { killPortHolder, findPortHolder, probePortBind } from '../runtime/port-holder'
import { listEvents, logEvent, setEventBroadcaster } from './events'
import { setTrayUpdatePending, setTrayResourceWarn, rebuildTrayMenu } from './tray'
import {
  forgetWindowBounds,
  rememberPopoutBounds,
  resolvePopoutBounds
} from './window-bounds'
import { PtyManager } from '../runtime/pty'
import { appIconPath } from './icon'
import {
  getDshStatus,
  listDshPlugins,
  installDshPlugin,
  uninstallDshPlugin,
  updateDshPlugin,
  updateAllDshPlugins,
  checkDshPluginUpdates,
  createDshPage
} from '../runtime/dsh'
import {
  getOpenclawStatus,
  createOpenclawPage,
  getOpenclawGatewayToken,
  initializeOpenclawToken,
  ensureDefaultOpenclawPage,
  ensureBuiltinPages
} from '../runtime/openclaw'
import { m, notifyLocaleChanged, invalidateLocaleCache } from './i18n'

/** Periodic silent update-check timer; module-level so a dev-HMR re-register resets it instead of stacking. */
let surveyTimer: NodeJS.Timeout | null = null
/** How often the background survey re-probes every update source. Cheap on the LAN, network-bound otherwise. */
const UPDATE_SURVEY_MS = 30 * 60_000
/** #20: CPU/RAM sampling cadence for the live per-row resource badges. */
let metricsTimer: NodeJS.Timeout | null = null
const METRICS_POLL_MS = 5_000
/** #20 leak guard: a page already rebooted for its memory budget, so one leak costs one restart. */
const memRestarted = new Set<string>()
/** A page that has not been up this long is failing for some other reason — restarting it for a
 *  memory figure sampled at t+3s would just loop. */
const MEM_RESTART_MIN_UPTIME_MS = 10 * 60_000

/** Detached page windows, one per page id; opening the same page twice focuses the first. */
const popoutWindows = new Map<string, BrowserWindow>()
let popoutSaveTimer: NodeJS.Timeout | null = null
/** The app.on('web-contents-created') guest-key listener is process-wide, so wire it once. */
let guestKeysWired = false

/**
 * The preload file for a shell window. electron-vite emits `.mjs` for the dev preload and the
 * packaged build can carry either name, so probe rather than assume (mirrors main/index.ts).
 */
function shellPreload(): string {
  const dir = join(__dirname, '../preload')
  for (const name of ['index.mjs', 'index.js']) {
    if (existsSync(join(dir, name))) return join(dir, name)
  }
  return join(dir, 'index.mjs')
}

/** Debounced geometry save for every live popout (a drag fires 'move' dozens of times a second). */
function schedulePopoutSave(): void {
  if (popoutSaveTimer) clearTimeout(popoutSaveTimer)
  popoutSaveTimer = setTimeout(() => {
    popoutSaveTimer = null
    flushPopoutBounds()
  }, 800)
  popoutSaveTimer.unref?.()
}

/** Write any pending popout geometry immediately (also called before the app quits). */
export function flushPopoutBounds(): void {
  if (popoutSaveTimer) {
    clearTimeout(popoutSaveTimer)
    popoutSaveTimer = null
  }
  for (const [id, win] of popoutWindows) {
    if (!win.isDestroyed()) rememberPopoutBounds(win, id)
  }
}

/**
 * Open — or focus — one page's own top-level window. It loads the same shell bundle with
 * `?popout=<pageId>`, which App.vue answers with a minimal layout (title strip + full-bleed
 * webview) instead of the workbench.
 *
 * The default session is shared on purpose: a page the user has already signed into in the
 * embedded view is signed in here too, with no second login and no cookie copy.
 */
function openPageWindow(registry: PageRegistry, pageId: string): BrowserWindow {
  const existing = popoutWindows.get(pageId)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    return existing
  }
  const state = registry.get(pageId)
  const restored = resolvePopoutBounds(pageId, 720, 480)
  const win = new BrowserWindow({
    width: restored?.width ?? 1000,
    height: restored?.height ?? 700,
    x: restored?.x,
    y: restored?.y,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    title: state?.name || pageId,
    backgroundColor: '#000000',
    // same frameless contract as the main shell: the renderer draws its own title strip
    frame: false,
    icon: appIconPath(),
    webPreferences: {
      preload: shellPreload(),
      // mirrors the main window: the popout hosts the page in a <webview> of its own
      sandbox: false,
      webviewTag: true
    }
  })
  popoutWindows.set(pageId, win)
  win.on('ready-to-show', () => {
    if (!win.isDestroyed()) win.show()
  })
  win.on('page-title-updated', (e) => {
    // The hosted page must not rename the OS title bar away from the page name.
    e.preventDefault()
  })
  win.on('resize', schedulePopoutSave)
  win.on('move', schedulePopoutSave)
  // Mirror the main shell's push (main/index.ts): the caption's maximize/restore icon and the
  // snap/drag paths both need the live state, and the popout renderer listens on the same IPC.
  const pushMaximized = (): void => {
    if (!win.isDestroyed()) win.webContents.send(IPC.OnMaximizedChanged, win.isMaximized())
  }
  win.on('maximize', () => {
    schedulePopoutSave()
    pushMaximized()
  })
  win.on('unmaximize', () => {
    schedulePopoutSave()
    pushMaximized()
  })
  win.on('closed', () => {
    popoutWindows.delete(pageId)
  })
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) win.loadURL(`${devUrl}?popout=${encodeURIComponent(pageId)}`)
  else win.loadFile(join(__dirname, '../renderer/index.html'), { query: { popout: pageId } })
  return win
}

/**
 * Resolve the effective shortcut map: the built-in defaults, overridden per action by
 * `settings.keybindings`. An empty string unbinds an action outright.
 */
function activeKeybindings(): Record<KeybindingAction, string> {
  const stored = getSettings().keybindings || {}
  const out = { ...DEFAULT_KEYBINDINGS }
  for (const action of Object.keys(out) as KeybindingAction[]) {
    const v = stored[action]
    if (typeof v === 'string') out[action] = v
  }
  return out
}

/**
 * Shortcuts pressed *inside* a hosted page never reach the shell window's keydown listener — the
 * guest owns its own keyboard. These three actions are about the container rather than the page,
 * so the main process watches each webview's input and forwards them, exactly like the shell's
 * own listener would. Deliberately a tiny set: stealing more (Esc, F12, …) from an app the user
 * is working in is a bad trade.
 */
const GUEST_ACTIONS: KeybindingAction[] = ['palette', 'terminal', 'popoutCurrent']

function wireGuestShortcuts(registry: PageRegistry): void {
  if (guestKeysWired) return
  guestKeysWired = true
  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() !== 'webview') return
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const bindings = activeKeybindings()
      let fired: KeybindingAction | null = null
      for (const action of GUEST_ACTIONS) {
        if (
          matchesAccelerator(bindings[action], {
            key: input.key,
            code: input.code,
            ctrl: input.control,
            shift: input.shift,
            alt: input.alt,
            meta: input.meta
          })
        ) {
          fired = action
          break
        }
      }
      if (!fired) return
      event.preventDefault()
      const url = contents.getURL()
      const pageId = url
        ? registry.running().find((p) => p.url && url.startsWith(p.url))?.id
        : undefined
      const signal: HotkeySignal = { action: fired, ...(pageId ? { pageId } : {}) }
      // Only the window that hosts this guest owns the action (the main shell, or the popout
      // the page was pulled into) — broadcasting would open two palettes.
      const hostId = contents.hostWebContents?.id
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed() && win.webContents.id === hostId) {
          win.webContents.send(IPC.OnHotkey, signal)
          break
        }
      }
    })
  })
}

export function registerIpc(registry: PageRegistry): void {
  const ok = <T>(data?: T): IpcResult<T> => ({ ok: true, data })
  // Generic so a handler annotated `IpcResult<Foo>` can still `return fail(err)` and keep its type.
  const fail = <T = unknown>(err: unknown): IpcResult<T> => ({
    ok: false,
    error: err instanceof Error ? err.message : String(err)
  })

  // idempotent: dev HMR restarts may re-run setup
  for (const channel of Object.values(IPC)) {
    ipcMain.removeHandler(channel)
  }

  registry.on('changed', () => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(
        IPC.OnStateChanged,
        registry.running().map((p) => ({
          id: p.id,
          name: p.name,
          port: p.containerPort || p.port,
          url: p.url || '',
          status: p.status,
          pid: p.pid
        }))
      )
    }
  })

  // Startup progress (phase + live log tail) for the boot overlay; separate from the coarse
  // 'changed' signal so a slow first boot can animate without a full page-list refetch.
  registry.on('progress', (p: PageProgress) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.OnPageProgress, p)
    }
  })

  // Activity timeline fan-out: every `logEvent` call in the main process lands here as well as in
  // logs/events.jsonl. Re-registered (not stacked) on a dev-HMR re-setup, so one broadcaster wins.
  setEventBroadcaster((ev) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.OnEvent, ev)
    }
  })
  // Make container shortcuts work while focus is inside a hosted page (see wireGuestShortcuts).
  wireGuestShortcuts(registry)

  // Electron's renderer matchMedia is unreliable on Windows, so the OS dark/light
  // state is sourced from nativeTheme here and pushed to every window.
  nativeTheme.on('updated', () => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.OnNativeTheme, nativeTheme.shouldUseDarkColors)
    }
  })

  ipcMain.handle(IPC.GetNativeTheme, (): IpcResult => ok(nativeTheme.shouldUseDarkColors))

  // Drive the OS-level dark/light so already-loaded webviews (the embedded DSH host)
  // repaint their prefers-color-scheme live; the workbench then follows via its observer.
  // 'auto' resets to the real OS scheme — passing a boolean here used to coerce auto→dark and
  // freeze themeSource, which broke "跟随系统" live tracking.
  ipcMain.handle(
    IPC.SetNativeTheme,
    (_e, source?: 'auto' | 'light' | 'dark' | boolean): IpcResult => {
      if (source === 'auto' || source === undefined || source === null)
        nativeTheme.themeSource = 'system'
      else if (typeof source === 'boolean') nativeTheme.themeSource = source ? 'dark' : 'light'
      else nativeTheme.themeSource = source
      return ok(true)
    }
  )

  // Frameless-window controls: operate on the sending window (the main shell).
  ipcMain.handle(IPC.MinimizeWindow, (e): IpcResult => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
    return ok(true)
  })
  ipcMain.handle(IPC.ToggleMaximize, (e): IpcResult => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return ok(false)
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return ok(win.isMaximized())
  })
  ipcMain.handle(IPC.CloseWindow, (e): IpcResult => {
    BrowserWindow.fromWebContents(e.sender)?.close()
    return ok(true)
  })
  ipcMain.handle(IPC.GetIsMaximized, (e): IpcResult =>
    ok(Boolean(BrowserWindow.fromWebContents(e.sender)?.isMaximized()))
  )

  ipcMain.handle(IPC.GetNodeInfo, async (): Promise<IpcResult> => {
    try {
      return ok(await getNodeRuntimeInfo())
    } catch (err) {
      return fail(err)
    }
  })

  // Bundled-Node runtime upgrade (关于与更新): list eligible versions, download+install
  // one as the userData override, or drop the override to fall back to the shipped one.
  ipcMain.handle(IPC.ListNodeVersions, async (_e, includeIncompatible?: boolean): Promise<IpcResult> => {
    try {
      return ok(await listNodeVersions(!!includeIncompatible))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.UpdateNodeRuntime, async (e, version: string): Promise<IpcResult> => {
    // Stream progress back to the requesting window only (mirrors PerformUpdate).
    const sender = e.sender
    const onProgress = (p: UpdateProgress): void => {
      if (!sender.isDestroyed()) sender.send(IPC.OnNodeUpdateProgress, p)
    }
    try {
      return ok(await updateNodeRuntime(version, onProgress))
    } catch (err) {
      return fail(err)
    } finally {
      // Guaranteed terminal event. updateNodeRuntime only emits 'done' on success, but the
      // window-level top progress bar (stores/tasks) is fed purely by these events — an error
      // or abort would otherwise leave its row stuck at the last percentage forever. The
      // panels clear their own inline bars via their awaited promise's finally, so this extra
      // 'done' is an idempotent cleanup that only drops the persistent top-bar row.
      onProgress({ name: 'Node', phase: 'done' })
    }
  })

  ipcMain.handle(IPC.RestoreBundledNode, async (): Promise<IpcResult> => {
    try {
      return ok(await restoreBundledNode())
    } catch (err) {
      return fail(err)
    }
  })

  // First-run / on-demand install of a built-in agent runtime (dsh / openclaw). Streams
  // nothing (a 15-min `npm install -g` has no byte progress), so the renderer tracks it as an
  // indeterminate top-bar task; clear the cache so the panel re-reads the now-present version.
  ipcMain.handle(
    IPC.ProvisionBuiltin,
    async (_e, kind: BuiltinKind, version?: string): Promise<IpcResult> => {
      try {
        const res = await provisionBuiltin(kind, version)
        clearUpdateCache()
        // Provisioning clears the `runtimeMissing` badge on the hosted page. Nudge every window to
        // re-list (onStateChanged -> pagesStore.refresh -> ListPages re-probes presence) so the row
        // becomes startable now, without the renderer having to await an install-status IPC itself.
        registry.emitChanged()
        return ok(res)
      } catch (err) {
        return fail(err)
      }
    }
  )

  ipcMain.handle(IPC.ListPages, async (): Promise<IpcResult> => {
    registry.reconcile()
    // Re-probe on-demand runtime presence (cheap existsSync) before listing, so each PageState's
    // `runtimeMissing` is current when the renderer draws its badges — an install clears the row
    // on the very next refresh without a dedicated signal.
    await registry.refreshRuntimePresence().catch(() => undefined)
    return ok(registry.list())
  })

  ipcMain.handle(IPC.StartPage, async (_e, id: string): Promise<IpcResult> => {
    try {
      // Deps-first: a page declaring `dependsOn` starts its chain (cycle-checked) before spawning.
      return ok(await registry.startWithDeps(id))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.StopPage, async (_e, id: string): Promise<IpcResult> => {
    registry.stop(id)
    return ok(registry.get(id))
  })

  ipcMain.handle(IPC.RestartPage, async (_e, id: string): Promise<IpcResult> => {
    try {
      return ok(await registry.restartWithDeps(id))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.GetPageLogs, (_e, id: string): IpcResult => ok(registry.logs(id)))

  // Activity timeline: read back the persisted history (already JSONL-parsed and filtered in
  // events.ts). Live rows reach the panel over OnEvent, so this is the cold-start read.
  ipcMain.handle(IPC.ListEvents, (_e, args: ListEventsArgs): IpcResult => {
    try {
      return ok(listEvents(args || {}))
    } catch (err) {
      return fail(err)
    }
  })

  // Trend charts need the samples the periodic broadcast already took; the renderer keeps no
  // rolling buffer of its own, so a panel reopened after a visit re-reads the retained history.
  ipcMain.handle(IPC.GetMetricsHistory, (): IpcResult => {
    try {
      return ok(getMetricsHistory())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(
    IPC.InstallPageFromGit,
    async (_e, repoUrl: string, name?: string, port?: number): Promise<IpcResult> => {
      // Stream import progress back to the requesting window (see InstallProgress).
      const sender = _e.sender
      const onProgress = (p: InstallProgress): void => {
        if (!sender.isDestroyed()) sender.send(IPC.OnInstallProgress, p)
      }
      try {
        const dirName = await installFromGit(
          resolvePagesDir(),
          repoUrl,
          name,
          port,
          undefined,
          onProgress
        )
        registry.reconcile()
        clearUpdateCache()
        return ok(dirName)
      } catch (err) {
        return fail(err)
      } finally {
        // See UpdateNodeRuntime: guarantee a terminal event so the top bar never sticks on error.
        onProgress({ op: 'git', phase: 'done', percent: 100 })
      }
    }
  )

  ipcMain.handle(
    IPC.InstallPageFromDir,
    async (
      _e,
      srcDir: string,
      name?: string,
      port?: number,
      originUrl?: string
    ): Promise<IpcResult> => {
      const sender = _e.sender
      const onProgress = (p: InstallProgress): void => {
        if (!sender.isDestroyed()) sender.send(IPC.OnInstallProgress, p)
      }
      try {
        const dirName = await installFromLocalDir(
          resolvePagesDir(),
          srcDir,
          name,
          port,
          originUrl,
          onProgress
        )
        registry.reconcile()
        clearUpdateCache()
        return ok(dirName)
      } catch (err) {
        return fail(err)
      } finally {
        // See UpdateNodeRuntime: guarantee a terminal event so the top bar never sticks on error.
        onProgress({ op: 'dir', phase: 'done', percent: 100 })
      }
    }
  )

  ipcMain.handle(IPC.ChooseDirectory, async (e, title?: string): Promise<IpcResult> => {
    try {
      const win = BrowserWindow.fromWebContents(e.sender)
      const opts: Electron.OpenDialogOptions = {
        properties: ['openDirectory', 'createDirectory'],
        title: title || m('dialog.chooseDir')
      }
      const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (res.canceled || !res.filePaths.length) return ok(null)
      return ok(res.filePaths[0])
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.RemovePage, (_e, id: string): IpcResult => {
    try {
      registry.stop(id)
      removePage(resolvePagesDir(), id)
      registry.reconcile()
      const s = getSettings()
      if (s.autoStartPages.includes(id))
        updateSettings({ autoStartPages: s.autoStartPages.filter((x) => x !== id) })
      if (s.defaultView.kind === 'page' && s.defaultView.pageId === id)
        setDefaultView({ kind: 'none' })
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  /**
   * Restore a builtin page (dsh-web / openclaw) the user broke in userData: stop it, drop the
   * whole pages/<id> folder and re-seed from the bundled originals (both ensure* are no-ops while
   * the dir exists, so calling them after the delete is exactly a factory re-install). Port and
   * env overrides live in settings, not in the page dir — they deliberately survive a reset.
   */
  ipcMain.handle(IPC.ResetBuiltinPage, (_e, id: string): IpcResult => {
    try {
      if (!BUILTIN_PAGE_IDS.has(id)) return fail(new Error(m('ipc.resetNotBuiltin')))
      const wasRunning = registry.get(id)?.status === 'running'
      registry.stop(id)
      rmSync(join(resolvePagesDir(), id), { recursive: true, force: true })
      ensureDefaultOpenclawPage()
      ensureBuiltinPages()
      registry.reconcile()
      // A reset of a RUNNING page should land back where the user left it, not in 已停止.
      if (wasRunning) {
        registry
          .start(id)
          .catch((err) => console.error(`[page:${id}] reset auto-start failed:`, err))
      }
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.SetPagePort, (_e, id: string, port?: number): IpcResult => {
    try {
      const clear = port === undefined || port === null || Number(port) === 0
      if (!clear && !isValidPort(port)) return { ok: false, error: m('ipc.portRange') }
      const pagePorts = { ...getSettings().pagePorts }
      if (clear) delete pagePorts[id]
      else pagePorts[id] = Number(port)
      updateSettings({ pagePorts })
      registry.reconcile()
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.OpenPageExternal, async (_e, url: string): Promise<IpcResult> => {
    try {
      await shell.openExternal(url)
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  // Pull a page into its own window. A terminal-kind page is refused: it has no URL to host,
  // its UI is the container's terminal drawer.
  ipcMain.handle(IPC.OpenPageWindow, (_e, pageId: string): IpcResult => {
    try {
      const state = registry.get(pageId)
      if (!state) return fail(new Error(m('page.unknown', { id: pageId })))
      if (state.kind === 'terminal') {
        return fail(new Error(m('page.cliNeedsTerminal', { name: state.name })))
      }
      openPageWindow(registry, pageId)
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.GetSettings, (): IpcResult => ok(getSettings()))

  // Field debugging: a packaged app has no console. Everything the main process logs
  // (and every page child's output) is mirrored under userData/logs — open it externally.
  ipcMain.handle(IPC.OpenLogsDir, async (): Promise<IpcResult> => {
    try {
      const err = await shell.openPath(logsDir())
      return err ? fail(new Error(err)) : ok(logsDir())
    } catch (e) {
      return fail(e)
    }
  })

  // In-app log viewer: list what exists, then tail one file (key-validated in logger.ts).
  ipcMain.handle(IPC.ListLogFiles, (): IpcResult => {
    try {
      return ok(listLogFiles())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.ReadLogs, (_e, args: ReadLogsArgs): IpcResult => {
    try {
      return ok(readLogTail(args?.key ?? '', args?.tail, args?.filter))
    } catch (err) {
      return fail(err)
    }
  })

  // One-click diagnostic bundle (versions / masked settings / log tails / git HEADs).
  ipcMain.handle(IPC.ExportDiagnostics, async (): Promise<IpcResult> => {
    try {
      // null = the user cancelled the save dialog — a success with no file, not an error.
      return ok(await exportDiagnostics(registry))
    } catch (err) {
      return fail(err)
    }
  })

  // Port-conflict recovery: the failed start named its holder (PageState.portHolder), so the
  // panel offers a one-click "kill it and retry" — kill returns whether anything was found.
  ipcMain.handle(IPC.KillPortHolder, async (_e, port: number): Promise<IpcResult> => {
    try {
      const n = Number(port)
      if (!Number.isFinite(n) || n < 1 || n > 65535) return fail(new Error(m('ipc.portRange')))
      return ok(await killPortHolder(n))
    } catch (err) {
      return fail(err)
    }
  })

  // Port pre-flight for the page config dialog: ask the OS whether the port can be bound before
  // the user starts the page. `pageId` is the page being edited — when that page is itself
  // running on the port, the listener is its own and there is no conflict to warn about.
  ipcMain.handle(
    IPC.CheckPortFree,
    async (_e, port: number, pageId?: string): Promise<IpcResult<PortCheckResult>> => {
      try {
        const n = Number(port)
        if (!isValidPort(n)) return fail(new Error(m('ipc.portRange')))
        const bind = await probePortBind(n)
        if (bind === 'free') return ok({ port: n, free: true })
        const holder = await findPortHolder(n)
        if (bind === 'error' && !holder) return ok({ port: n, free: false, probeError: true })
        if (holder && pageId && registry.get(pageId)?.pid === holder.pid) {
          return ok({ port: n, free: true })
        }
        return ok({ port: n, free: false, ...(holder ? { holder } : {}), ...(bind === 'error' ? { probeError: true } : {}) })
      } catch (err) {
        return fail(err)
      }
    }
  )

  // OTA rollback: schedule the .bak swap in a detached helper, then exit so it can run —
  // same "return then never come back" contract as RelaunchApp.
  ipcMain.handle(IPC.RollbackAsar, (): IpcResult => {
    try {
      if (!canRollbackAsar().available) return fail(new Error(m('update.noRollback')))
      if (!rollbackToPreviousAsar()) return fail(new Error(m('update.rollbackFailed')))
      setTimeout(() => app.exit(0), 700)
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  // #15 migration package: round-trippable config archive (settings + per-page container.json).
  ipcMain.handle(IPC.ExportSnapshot, async (): Promise<IpcResult> => {
    try {
      return ok(await exportSnapshot(registry)) // null = user cancelled the save dialog
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.ImportSnapshot, async (): Promise<IpcResult> => {
    try {
      return ok(await importSnapshot(registry))
    } catch (err) {
      return fail(err)
    }
  })

  // #21 one-shot network reachability probe (loopback / github / npm / mirror / proxy).
  ipcMain.handle(IPC.RunNetworkProbe, async (): Promise<IpcResult> => {
    try {
      return ok(await runNetworkProbe())
    } catch (err) {
      return fail(err)
    }
  })

  // #26: latency of every candidate npm mirror, in parallel, for 设置 ▸ 网络镜像's 一键选优.
  ipcMain.handle(IPC.ProbeRegistries, async (): Promise<IpcResult> => {
    try {
      return ok(await probeRegistries())
    } catch (err) {
      return fail(err)
    }
  })

  // #26: what the embedded webviews are holding on disk / in the shared cookie jar.
  ipcMain.handle(IPC.GetWebData, async (): Promise<IpcResult> => {
    try {
      return ok(await getWebDataReport())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.ClearWebData, async (_e, args: WebDataClearArgs): Promise<IpcResult> => {
    try {
      return ok(await clearWebData(args))
    } catch (err) {
      return fail(err)
    }
  })

  // #17 container OTA version history for the small table under the help-panel row.
  ipcMain.handle(IPC.GetUpdateHistory, (): IpcResult => {
    try {
      return ok(getUpdateHistory())
    } catch (err) {
      return fail(err)
    }
  })

  // #20 on-demand CPU/RAM sample (the periodic broadcast covers the live view; this backs a
  // refresh immediately after a start when the interval hasn't ticked yet).
  ipcMain.handle(IPC.GetPageMetrics, async (): Promise<IpcResult> => {
    try {
      return ok(await collectPageMetrics(registry, getSettings().memWarnMb ?? 0))
    } catch (err) {
      return fail(err)
    }
  })

  // Help panel: static-ish system/runtime overview (OS, CPU, memory, versions, paths).
  ipcMain.handle(IPC.GetSystemInfo, (): IpcResult => {
    try {
      return ok(getSystemInfo())
    } catch (err) {
      return fail(err)
    }
  })

  // Help panel: live network interfaces + cumulative byte counters (renderer diffs samples).
  ipcMain.handle(IPC.GetNetworkStats, async (): Promise<IpcResult> => {
    try {
      return ok(await getNetworkStats())
    } catch (err) {
      return fail(err)
    }
  })

  // #22 live log tail: push newly-appended lines to every window's OnLogLine channel. The
  // viewer keeps its 3s poll as a fallback, so this is pure latency win when a file changes.
  startLogStream((ev) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.OnLogLine, ev)
    }
  })

  // #20 resource sampling loop: broadcast CPU/RAM every few seconds so running rows show their
  // cost live, and light the tray's gold dot when any page crosses its memory budget. Idempotent
  // across dev-HMR re-registration (clear the old timer first) so the interval never stacks.
  if (metricsTimer) clearInterval(metricsTimer)
  metricsTimer = setInterval(async () => {
    try {
      const settings = getSettings()
      const metrics = await collectPageMetrics(registry, settings.memWarnMb ?? 0)
      pruneMetricsBaseline(
        registry
          .running()
          .map((p) => p.pid!)
          .filter(Boolean)
      )
      setTrayResourceWarn(metrics.some((mm) => mm.overLimit))
      // #20 follow-up: with the memory action set to 重启, an over-budget page that has been up
      // long enough to trust the reading gets exactly one reboot per run. A page still bloating
      // after that is left flagged — restarting it again would be the loop this guard exists to
      // prevent, and the crash budget belongs to real crashes.
      if (settings.memLimitAction === 'restart') {
        for (const mm of metrics) {
          if (!mm.overLimit || memRestarted.has(mm.pageId)) continue
          const st = registry.get(mm.pageId)
          if (!st?.startedAt || Date.now() - st.startedAt < MEM_RESTART_MIN_UPTIME_MS) continue
          memRestarted.add(mm.pageId)
          logEvent({
            level: 'warn',
            kind: 'mem.restart',
            pageId: mm.pageId,
            meta: { memMb: mm.memMb, limitMb: settings.memWarnMb ?? 0 }
          })
          registry.restart(mm.pageId).catch((err) =>
            console.warn('[metrics] memory restart failed:', (err as Error).message)
          )
        }
      }
      // A page that stopped (or dropped off the sample) may try the guard again next run.
      for (const id of [...memRestarted]) {
        if (!registry.running().some((p) => p.id === id)) memRestarted.delete(id)
      }
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.OnPageMetrics, metrics)
      }
    } catch {
      /* a failed sample tick is silently skipped — the next one retries */
    }
  }, METRICS_POLL_MS)
  metricsTimer.unref?.()

  ipcMain.handle(
    IPC.UpdateSettings,
    (
      _e,
      partial: {
        defaultView?: DefaultView
        openExternalIn?: 'embedded' | 'system-browser'
        minimizeToTray?: boolean
        launchAtStartup?: boolean
        autoStartPages?: string[]
        theme?: 'auto' | 'light' | 'dark'
        locale?: 'zh' | 'en'
        envRoot?: string
        dshHome?: string
        openclawHome?: string
        downloadDir?: string
        pageEnvs?: Record<string, Record<string, string>>
        pagePorts?: Record<string, number>
        crashAutoRestart?: boolean
        systemNotifications?: boolean
        accentColor?: string
        glassBlur?: number
        glassAlpha?: number
        memWarnMb?: number
        terminalHeight?: number
        rememberWindowBounds?: boolean
        reduceMotion?: 'auto' | 'on' | 'off'
        npmRegistry?: string
        trayPageEntries?: 'all' | 'running' | 'off'
        trayBadge?: 'all' | 'alert' | 'off'
        autoStartManual?: string[]
        pageCustomEnvs?: Record<string, Record<string, string>>
        dshChannel?: DshReleaseChannel
        containerChannel?: ContainerReleaseChannel
        memLimitAction?: 'notify' | 'restart'
        keybindings?: Record<string, string>
      }
    ): IpcResult => {
      try {
        if (partial.defaultView) {
          // Couple 默认打开 ⇄ 自启动: the new default page joins auto-start, the one it
          // replaces leaves (unless manually pinned). An external default is not startable,
          // so it neither adds nor pins — it only unloads the previous page's implicit auto-start.
          const prevDv = getSettings().defaultView
          const prevId = prevDv.kind === 'page' ? prevDv.pageId : null
          let nextId = partial.defaultView.kind === 'page' ? partial.defaultView.pageId : null
          if (nextId && registry.get(nextId)?.external) nextId = null
          syncAutoStartForDefaultView(prevId, nextId)
          setDefaultView(partial.defaultView)
        }
        const rest = { ...partial }
        delete rest.defaultView
        if (Object.keys(rest).length) updateSettings(rest)
        // Reflect an auto-start change into the OS login item right away, so the toggle takes
        // effect on the very next boot rather than only when the app next starts.
        if (typeof partial.launchAtStartup === 'boolean') {
          applyLaunchAtStartup(partial.launchAtStartup)
        }
        // #26: the registry is published as `npm_config_registry`, which every spawn helper already
        // spreads — so switching mirrors takes effect for the next install without a restart, and
        // no `.npmrc` outside the app gets rewritten.
        if ('npmRegistry' in partial) applyNpmRegistryEnv()
        // Either channel switch changes what the next probe should fetch *and* what "up to date"
        // means, so both caches have to go or the panel would keep showing the other track.
        if ('containerChannel' in partial || 'dshChannel' in partial) {
          resetBranchProbe()
          clearUpdateCache()
          void runSurvey()
        }
        // Turning the memory guard off must forget which pages it already spent, or re-enabling it
        // would consider those pages permanently handled for the rest of the session.
        if ('memLimitAction' in partial) memRestarted.clear()
        // Turning the memory off must also forget what was remembered, otherwise re-enabling it
        // later jumps straight back to geometry the user has since abandoned.
        if (partial.rememberWindowBounds === false) forgetWindowBounds()
        // The tray menu rows and the badge tier are rendered here, not in the window.
        if (partial.trayPageEntries || partial.trayBadge) rebuildTrayMenu()
        // The tray menu / window caption are rendered by the main process, so a language
        // change is fanned out to them explicitly (see main/index.ts). container.json text
        // is resolved in the *active* language when a manifest is read, so the cached metas
        // have to be re-read first and the windows told to refetch their page list.
        if (partial.locale) {
          // Drop the memoized locale BEFORE re-reading manifests: reconcile resolves
          // container.json text through currentLocale(), which now caches.
          invalidateLocaleCache()
          registry.reconcile()
          notifyLocaleChanged()
          registry.emitChanged()
        }
        return ok(getSettings())
      } catch (err) {
        return fail(err)
      }
    }
  )

  ipcMain.handle(IPC.EnvRoot, (): IpcResult =>
    ok({
      envRoot: resolveEnvRoot(),
      installDir: resolveInstallDir(),
      custom: Boolean((getSettings().envRoot || '').trim())
    })
  )

  // The effective webview download folder + the OS default an empty override falls back to,
  // so the Settings panel can show a real placeholder and a "reveal current" value.
  ipcMain.handle(IPC.DownloadDir, (): IpcResult =>
    ok({
      downloadDir: resolveDownloadDir(),
      defaultDir: defaultDownloadDir(),
      custom: Boolean((getSettings().downloadDir || '').trim())
    })
  )

  ipcMain.handle(IPC.CheckUpdates, async (_e, force?: boolean): Promise<IpcResult> => {
    try {
      const results = await checkUpdates(registry.list(), Boolean(force))
      setTrayUpdatePending(results.some((r) => r.ok && (r.hasUpdate || r.pendingRestart)))
      return ok(results)
    } catch (err) {
      return fail(err)
    }
  })

  /*
   * Silent background update survey: refresh the cached results on a timer and push them
   * to every window. The renderer only folds them into the badge/table — a background hit
   * must never pop a dialog or navigate the user anywhere (提醒收敛). The first pass runs
   * a beat after boot so it doesn't compete with page auto-start for the network.
   */
  if (surveyTimer) clearInterval(surveyTimer)
  const runSurvey = (): void => {
    checkUpdates(registry.list(), true)
      .then((results) => {
        setTrayUpdatePending(results.some((r) => r.ok && (r.hasUpdate || r.pendingRestart)))
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send(IPC.OnUpdateResults, results)
        }
      })
      .catch(() => undefined) // a survey failure keeps the last known badge state
  }
  setTimeout(runSurvey, 45_000).unref?.()
  surveyTimer = setInterval(runSurvey, UPDATE_SURVEY_MS)
  surveyTimer.unref?.()

  ipcMain.handle(IPC.PerformUpdate, async (_e, target: UpdateCheckResult): Promise<IpcResult> => {
    // Stream download progress back to the requesting window (see UpdateProgress).
    const sender = _e.sender
    const onProgress = (p: UpdateProgress): void => {
      if (!sender.isDestroyed()) sender.send(IPC.OnUpdateProgress, p)
    }
    try {
      const res = await performUpdate(target, onProgress)
      clearUpdateCache()
      return ok(res)
    } catch (err) {
      return fail(err)
    } finally {
      // See UpdateNodeRuntime: guarantee a terminal event keyed by the same `name` the stream
      // used, so the persistent top-bar row is dropped even when the update failed.
      onProgress({ name: target.name, phase: 'done', percent: 100 })
    }
  })

  // The container updated its own source: relaunch so the new code runs. before-quit
  // still gets to shut the pages down; --dsh-relaunched bypasses the single-instance lock.
  ipcMain.handle(IPC.RelaunchApp, (): IpcResult => {
    // A container asar update is staged under resources/updates/<commit>/: hand the swap to a
    // detached helper that replaces app.asar the moment this PID exits and then relaunches, so the
    // update is applied IN PLACE (the old boot.cjs next-launch hook is not on the launch path).
    // Nothing staged (a plain relaunch) falls through to the in-process app.relaunch below.
    if (relaunchToApplyStaged()) {
      // Exit only after a short grace so the OS fully materialises the orphaned swap helper before
      // Electron tears down its process tree; the helper itself waits for this PID to vanish.
      setTimeout(() => app.exit(0), 700)
      return ok(true)
    }
    // Drop --autostart: it marks a hidden login launch and would otherwise be inherited by
    // the relaunched process, leaving the user with a tray-only (seemingly vanished) app.
    const args = process.argv.slice(1).filter((a) => a !== '--autostart')
    app.relaunch({ args: [...args, '--dsh-relaunched'] })
    app.exit(0)
    return ok(true)
  })

  // Renderer confirms quit (after ElMessageBox) — initiate graceful shutdown.
  ipcMain.handle(IPC.QuitApp, (): IpcResult => {
    app.quit()
    return ok(true)
  })

  // ---- built-in terminal (embedded PTY) ----
  const ptyManager = new PtyManager()

  /** How a CLI page (no web surface) should run inside the embedded terminal. */
  ipcMain.handle(IPC.PageRunSpec, (_e, id: string): IpcResult => {
    try {
      const meta = registry.get(id)
      if (!meta || meta.external) return ok(null)
      if (meta.kind === 'dsh' || meta.kind === 'openclaw') return ok(null)
      const port = meta.containerPort || meta.port
      return ok({
        command: expandStartCommand(meta.startCommand),
        env: { ...(port ? { PORT: String(port) } : {}), ...buildPageEnv(meta) }
      })
    } catch (err) {
      return fail(err)
    }
  })

  /** Fired from the pages-manager dialog: tell every window to show this CLI page's
      full-surface terminal (only the main window renders one; others ignore it). */
  ipcMain.handle(IPC.OpenTerminalPage, (_e, id: string): IpcResult => {
    try {
      const meta = registry.get(id)
      if (!meta || meta.kind !== 'terminal') throw new Error(m('ipc.notTerminal', { id }))
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send(IPC.OpenTerminalPage, id)
      }
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  const terminalDirFor = (target: string): string => {
    if (target === 'container') return resolveProjectDir()
    if (target === 'openclaw') return resolveOpenclawHome()
    if (target === 'dsh-root') return resolveDshHome()
    if (target.startsWith('dsh:')) return resolveDshProfileDir(target.slice(4))
    const page = registry.get(target)
    if (!page) throw new Error(m('ipc.unknownTarget', { target }))
    return page.dir
  }

  ipcMain.handle(
    IPC.PtyStart,
    async (
      e,
      target: string,
      opts?: { command?: string; env?: Record<string, string> }
    ): Promise<IpcResult> => {
      try {
        const cwd = terminalDirFor(target)
        const title = target === 'container' ? m('ipc.containerRoot') : target
        const info = await ptyManager.start(
          cwd,
          title,
          opts?.command ? { command: opts.command, env: opts.env } : undefined
        )
        const session = ptyManager.get(info.id)
        if (session) {
          const sender = e.sender
          // Coalesce output before it crosses the process boundary. A full-screen TUI
          // repaints in hundreds of tiny chunks per second; sending each one as its own
          // IPC message floods the renderer's event loop until the window stops
          // responding. Flush at most once per frame (or when the buffer gets big).
          let buf = ''
          let timer: NodeJS.Timeout | null = null
          const FLUSH_MS = 16
          const FLUSH_MAX = 64 * 1024
          const flush = (): void => {
            if (timer) {
              clearTimeout(timer)
              timer = null
            }
            if (!buf) return
            const data = buf
            buf = ''
            if (!sender.isDestroyed()) sender.send(IPC.OnPtyData, { id: info.id, data })
          }
          session.on('data', (chunk) => {
            buf += String(chunk)
            if (buf.length >= FLUSH_MAX) flush()
            else if (!timer) timer = setTimeout(flush, FLUSH_MS)
          })
          session.on('exit', (code) => {
            flush()
            if (!sender.isDestroyed())
              sender.send(IPC.OnPtyExit, { id: info.id, code: Number(code) })
          })
        }
        return ok(info)
      } catch (err) {
        return fail(err)
      }
    }
  )

  ipcMain.handle(IPC.PtyWrite, (_e, id: string, data: string): IpcResult => {
    try {
      ptyManager.write(id, data)
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.PtyResize, (_e, id: string, cols: number, rows: number): IpcResult => {
    try {
      ptyManager.resize(id, cols, rows)
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.PtyKill, (_e, id: string): IpcResult => {
    try {
      ptyManager.kill(id)
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  // ---- developer mode (F12 equivalent) ----
  ipcMain.handle(IPC.ToggleDevTools, (e, guestId?: number): IpcResult => {
    try {
      const guest = typeof guestId === 'number' ? webContents.fromId(guestId) : undefined
      if (typeof guestId === 'number' && !guest) return fail(new Error(m('ipc.guestGone')))
      const target = guest ?? BrowserWindow.fromWebContents(e.sender)?.webContents ?? e.sender
      if (target.isDevToolsOpened()) target.closeDevTools()
      else target.openDevTools({ mode: 'detach' })
      return ok({ opened: target.isDevToolsOpened(), scope: guest ? 'webview' : 'window' })
    } catch (err) {
      return fail(err)
    }
  })

  // ---- dsh plugin management ----
  ipcMain.handle(IPC.DshStatus, async (_e, profile?: string): Promise<IpcResult> => {
    try {
      return ok(await getDshStatus(profile))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.DshListPlugins, (_e, profile?: string): IpcResult => {
    try {
      return ok(listDshPlugins(profile))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.DshPluginUpdates, async (_e, profile?: string): Promise<IpcResult> => {
    try {
      return ok(await checkDshPluginUpdates(profile))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(
    IPC.DshInstallPlugin,
    async (_e, spec: string, profile?: string): Promise<IpcResult> => {
      try {
        await installDshPlugin(spec, profile)
        return ok(true)
      } catch (err) {
        return fail(err)
      }
    }
  )

  ipcMain.handle(
    IPC.DshUninstallPlugin,
    async (_e, name: string, profile?: string): Promise<IpcResult> => {
      try {
        await uninstallDshPlugin(name, profile)
        return ok(true)
      } catch (err) {
        return fail(err)
      }
    }
  )

  ipcMain.handle(
    IPC.DshUpdatePlugin,
    async (
      _e,
      name: string,
      channel: DshUpdateChannel,
      gitUrl?: string,
      profile?: string
    ): Promise<IpcResult> => {
      try {
        return ok(await updateDshPlugin(name, channel, gitUrl, profile))
      } catch (err) {
        return fail(err)
      }
    }
  )

  ipcMain.handle(IPC.DshUpdateAll, async (_e, profile?: string): Promise<IpcResult> => {
    try {
      return ok(await updateAllDshPlugins(profile))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.DshCreatePage, (_e, profile: string, port?: number): IpcResult => {
    try {
      const id = createDshPage(profile, Number(port) || 5173)
      registry.reconcile()
      return ok(id)
    } catch (err) {
      return fail(err)
    }
  })

  /**
   * The dsh web UI's auth token, for the DSH panel's token row.
   *
   * dsh mints its token per launch, so the running page's `launchUrl` is the only place it
   * exists — there is no config file to fall back to while the page is stopped. `reconcile()`
   * runs first because the DSH panel can be opened without ever listing pages, and an
   * unreconciled registry would report "no page" for a profile that is in fact registered.
   */
  ipcMain.handle(IPC.DshToken, (_e, profile?: string): IpcResult<DshTokenResult> => {
    try {
      registry.reconcile()
      return ok(resolveDshToken(registry.list(), profile || ''))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.OpenclawStatus, async (): Promise<IpcResult> => {
    try {
      return ok(await getOpenclawStatus())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.OpenclawCreatePage, (_e, port?: number): IpcResult => {
    try {
      const id = createOpenclawPage(Number(port) || undefined)
      registry.reconcile()
      return ok(id)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.OpenclawToken, (): IpcResult => {
    try {
      return ok(getOpenclawGatewayToken())
    } catch (err) {
      return fail(err)
    }
  })

  /**
   * One-click openclaw token bootstrap: mint (or with `rotate`, re-mint) a durable gateway token
   * into openclaw.json. Writing the config is enough for the panel to reveal it immediately; when
   * the gateway page is already running we restart it fire-and-forget so it enforces the new
   * credential, without blocking this call on openclaw's slow (~2min) first-boot readiness.
   */
  ipcMain.handle(
    IPC.OpenclawInitToken,
    (_e, rotate?: boolean): IpcResult<OpenclawInitTokenResult> => {
      try {
        const { token, created } = initializeOpenclawToken(Boolean(rotate))
        let restarted = false
        const page = registry.get('openclaw')
        if (page && page.status === 'running') {
          restarted = true
          registry.restart('openclaw').catch((err) => {
            console.warn('[openclaw] token restart failed (ignored):', (err as Error).message)
          })
        }
        return ok({ token, created, restarted })
      } catch (err) {
        return fail(err)
      }
    }
  )
}
