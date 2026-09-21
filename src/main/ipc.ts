import { ipcMain, shell, BrowserWindow, webContents, nativeTheme, dialog, app } from 'electron'
import {
  IPC,
  type IpcResult,
  type BuiltinKind,
  type DefaultView,
  type DshTokenResult,
  type DshUpdateChannel,
  type OpenclawInitTokenResult,
  type PageProgress,
  type InstallProgress,
  type UpdateCheckResult,
  type UpdateProgress
} from '../shared/types'
import { getNodeRuntimeInfo } from './node-runtime'
import { listNodeVersions, updateNodeRuntime, restoreBundledNode } from './node-updater'
import { PageRegistry, expandStartCommand, buildPageEnv, resolveDshToken } from './pages'
import {
  getSettings,
  updateSettings,
  setDefaultView,
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
  applyLaunchAtStartup
} from './store'
import { installFromGit, installFromLocalDir, removePage } from './installer'
import { checkUpdates, performUpdate, clearUpdateCache, provisionBuiltin } from './update-service'
import { logsDir } from './logger'
import { PtyManager } from './pty'
import {
  getDshStatus,
  listDshPlugins,
  installDshPlugin,
  uninstallDshPlugin,
  updateDshPlugin,
  updateAllDshPlugins,
  checkDshPluginUpdates,
  createDshPage
} from './dsh'
import {
  getOpenclawStatus,
  createOpenclawPage,
  getOpenclawGatewayToken,
  initializeOpenclawToken
} from './openclaw'
import { m, notifyLocaleChanged } from './i18n'

/** Periodic silent update-check timer; module-level so a dev-HMR re-register resets it instead of stacking. */
let surveyTimer: NodeJS.Timeout | null = null
/** How often the background survey re-probes every update source. Cheap on the LAN, network-bound otherwise. */
const UPDATE_SURVEY_MS = 30 * 60_000

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
  ipcMain.handle(IPC.ListNodeVersions, async (): Promise<IpcResult> => {
    try {
      return ok(await listNodeVersions())
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
  ipcMain.handle(IPC.ProvisionBuiltin, async (_e, kind: BuiltinKind): Promise<IpcResult> => {
    try {
      const res = await provisionBuiltin(kind)
      clearUpdateCache()
      return ok(res)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.ListPages, async (): Promise<IpcResult> => {
    registry.reconcile()
    return ok(registry.list())
  })

  ipcMain.handle(IPC.StartPage, async (_e, id: string): Promise<IpcResult> => {
    try {
      return ok(await registry.start(id))
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
      return ok(await registry.restart(id))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.GetPageLogs, (_e, id: string): IpcResult => ok(registry.logs(id)))

  ipcMain.handle(
    IPC.InstallPageFromGit,
    async (_e, repoUrl: string, name?: string, port?: number): Promise<IpcResult> => {
      // Stream import progress back to the requesting window (see InstallProgress).
      const sender = _e.sender
      const onProgress = (p: InstallProgress): void => {
        if (!sender.isDestroyed()) sender.send(IPC.OnInstallProgress, p)
      }
      try {
        const dirName = await installFromGit(resolvePagesDir(), repoUrl, name, port, undefined, onProgress)
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
      }
    ): IpcResult => {
      try {
        if (partial.defaultView) setDefaultView(partial.defaultView)
        const rest = { ...partial }
        delete rest.defaultView
        if (Object.keys(rest).length) updateSettings(rest)
        // Reflect an auto-start change into the OS login item right away, so the toggle takes
        // effect on the very next boot rather than only when the app next starts.
        if (typeof partial.launchAtStartup === 'boolean') {
          applyLaunchAtStartup(partial.launchAtStartup)
        }
        // The tray menu / window caption are rendered by the main process, so a language
        // change is fanned out to them explicitly (see main/index.ts). container.json text
        // is resolved in the *active* language when a manifest is read, so the cached metas
        // have to be re-read first and the windows told to refetch their page list.
        if (partial.locale) {
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
      return ok(await checkUpdates(registry.list(), Boolean(force)))
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
    // Drop --autostart: it marks a hidden login launch and would otherwise be inherited by
    // the relaunched process, leaving the user with a tray-only (seemingly vanished) app.
    const args = process.argv.slice(1).filter((a) => a !== '--autostart')
    app.relaunch({ args: [...args, '--dsh-relaunched'] })
    app.exit(0)
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
  ipcMain.handle(IPC.OpenclawInitToken, (_e, rotate?: boolean): IpcResult<OpenclawInitTokenResult> => {
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
  })
}
