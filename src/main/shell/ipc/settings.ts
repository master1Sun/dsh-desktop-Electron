import { ipcMain } from 'electron'
import { IPC, type ContainerReleaseChannel, type DefaultView, type DshReleaseChannel, type IpcResult, type ToastLevel, type WebDataClearArgs } from '../../../shared/types'
import { probeRegistries } from '../../runtime/net-probe'
import { getWebDataReport, clearWebData } from '../webdata'
import { clearDiskScope, getDiskReport } from '../../runtime/disk-usage'
import { startContainerMcpServer, stopContainerMcpServer } from '../../runtime/container-mcp-server'
import { kickAutopilot } from '../../runtime/autopilot'
import { resetBranchProbe } from '../../update/asar-updates'
import { clearUpdateCache } from '../../update/update-service'
import { applyLaunchAtStartup, applyNpmRegistryEnv, getSettings, setDefaultView, syncAutoStartForDefaultView, updateSettings } from '../store'
import { rebuildTrayMenu } from '../tray'
import { forgetWindowBounds } from '../window-bounds'
import { notifyLocaleChanged, invalidateLocaleCache } from '../i18n'
import { notifyToast } from '../notifications'
import { runSurvey } from './updates'
import { resetMemGuard } from './logs'
import { type IpcCtx } from './util'

export function registerSettingsIpc(ctx: IpcCtx): void {
  const { registry, ok, fail } = ctx

  ipcMain.handle(IPC.GetSettings, (): IpcResult => ok(getSettings()))

  // A renderer toast forwarded to the OS notification center (systemNotifications on → the
  // renderer suppresses its corner toast and calls this). Resolves whether it actually showed,
  // so the renderer can fall back to the in-app toast when the platform can't notify.
  ipcMain.handle(IPC.ShowSystemToast, (_e, payload: { level: ToastLevel; text: string }): Promise<boolean> =>
    notifyToast(payload?.level, payload?.text || '')
  )

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

  // #8: the Settings ▸ 存储 dashboard — a bounded recursive scan of the container's footprint.
  ipcMain.handle(IPC.GetDiskReport, async (): Promise<IpcResult> => {
    try {
      return ok(await getDiskReport())
    } catch (err) {
      return fail(err)
    }
  })

  // Only 'webcache' and 'logs' are clearable here; anything else is real page/runtime data and is
  // rejected (the scope's own manager handles deleting it), so the allowlist lives in disk-usage.
  ipcMain.handle(IPC.ClearDiskScope, async (_e, scope: string): Promise<IpcResult> => {
    try {
      await clearDiskScope(scope)
      return ok(await getDiskReport())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(
    IPC.UpdateSettings,
    async (
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
        marqueeBorder?: boolean
        npmRegistry?: string
        trayPageEntries?: 'all' | 'running' | 'off'
        trayBadge?: 'all' | 'alert' | 'off'
        autoStartManual?: string[]
        pageCustomEnvs?: Record<string, Record<string, string>>
        dshChannel?: DshReleaseChannel
        containerChannel?: ContainerReleaseChannel
        memLimitAction?: 'notify' | 'restart'
        keybindings?: Record<string, string>
        containerMcpServer?: boolean
        autopilotEnabled?: boolean
        autopilotExecutorPage?: string
        autopilotConcurrency?: number
        autopilotPrompt?: string
      }
    ): Promise<IpcResult> => {
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
        if ('memLimitAction' in partial) resetMemGuard()
        // #11: the container's own MCP server is gated purely by this boolean — flipping it starts
        // or tears down the loopback listener and (via refreshBridge inside) re-exports the URL +
        // token to hosted agents. A failed bind reverts the flag so the store never lies about a
        // server that isn't actually listening.
        if (typeof partial.containerMcpServer === 'boolean') {
          try {
            if (partial.containerMcpServer) await startContainerMcpServer(() => registry)
            else await stopContainerMcpServer()
          } catch (err) {
            updateSettings({ containerMcpServer: false })
            throw err
          }
        }
        // #1: after any autopilot-related change, run a scheduling pass so a newly-enabled
        // dispatcher (or a newly-picked executor page) claims queued work without waiting for the
        // next fallback poll.
        if (
          'autopilotEnabled' in partial ||
          'autopilotExecutorPage' in partial ||
          'autopilotConcurrency' in partial
        ) {
          kickAutopilot()
        }
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
          // The update table's row names (container / DSH core / MCP group) are main-process
          // strings baked into the cached snapshot — page rows re-resolve via reconcile, but
          // these only refresh on the next check. Re-run the (forced) survey now so its
          // broadcast rewrites the renderer's cache in the new language.
          runSurvey()
        }
        return ok(getSettings())
      } catch (err) {
        return fail(err)
      }
    }
  )
}
