import { ipcMain } from 'electron'
import { IPC, type DshTokenResult, type DshUpdateChannel, type IpcResult, type OpenclawInitTokenResult } from '../../../shared/types'
import { resolveDshToken } from '../../runtime/pages'
import { getDshStatus, listDshPlugins, installDshPlugin, uninstallDshPlugin, updateDshPlugin, updateAllDshPlugins, checkDshPluginUpdates, createDshPage } from '../../runtime/dsh'
import { getOpenclawStatus, createOpenclawPage, getOpenclawGatewayToken, initializeOpenclawToken } from '../../runtime/openclaw'
import { type IpcCtx } from './util'

export function registerAgentsIpc(ctx: IpcCtx): void {
  const { registry, ok, fail } = ctx

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
