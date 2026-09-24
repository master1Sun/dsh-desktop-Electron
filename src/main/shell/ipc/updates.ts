import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC, type IpcResult, type UpdateCheckResult, type UpdateProgress } from '../../../shared/types'
import {
  checkUpdates,
  performUpdate,
  clearUpdateCache,
  listPackageVersions
} from '../../update/update-service'
import { canRollbackAsar, rollbackToPreviousAsar, getUpdateHistory } from '../../update/asar-updates'
import { setTrayUpdatePending } from '../tray'
import { m } from '../i18n'
import { type IpcCtx } from './util'

/** Periodic silent update-check timer; module-level so a dev-HMR re-register resets it instead of stacking. */
let surveyTimer: NodeJS.Timeout | null = null
/** How often the background survey re-probes every update source. Cheap on the LAN, network-bound otherwise. */
const UPDATE_SURVEY_MS = 30 * 60_000

/** The live survey closure registerUpdatesIpc armed; null before the first register. */
let runSurveyFn: (() => void) | null = null
/** Fire a background survey from another domain (UpdateSettings after a channel/locale change). */
export function runSurvey(): void {
  runSurveyFn?.()
}

export function registerUpdatesIpc(ctx: IpcCtx): void {
  const { registry, ok, fail } = ctx

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

  // #17 container OTA version history for the small table under the help-panel row.
  ipcMain.handle(IPC.GetUpdateHistory, (): IpcResult => {
    try {
      return ok(getUpdateHistory())
    } catch (err) {
      return fail(err)
    }
  })

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
  runSurveyFn = (): void => {
    checkUpdates(registry.list(), true)
      .then((results) => {
        setTrayUpdatePending(results.some((r) => r.ok && (r.hasUpdate || r.pendingRestart)))
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send(IPC.OnUpdateResults, results)
        }
      })
      .catch(() => undefined) // a survey failure keeps the last known badge state
  }
  setTimeout(() => runSurvey(), 45_000).unref?.()
  surveyTimer = setInterval(() => runSurvey(), UPDATE_SURVEY_MS)
  surveyTimer.unref?.()

  // The 指定版本 picker's source: every published version of one package, newest first. An empty
  // list means the registry could not be reached — the dialog then falls back to typing a version.
  ipcMain.handle(IPC.ListPkgVersions, async (_e, pkg: string): Promise<IpcResult> => {
    try {
      const name = String(pkg || '').trim()
      return ok(name ? await listPackageVersions(name) : [])
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(
    IPC.PerformUpdate,
    async (_e, target: UpdateCheckResult, pinned?: string): Promise<IpcResult> => {
      // Stream download progress back to the requesting window (see UpdateProgress).
      const sender = _e.sender
      const onProgress = (p: UpdateProgress): void => {
        if (!sender.isDestroyed()) sender.send(IPC.OnUpdateProgress, p)
      }
      const want = String(pinned || '').trim()
      try {
        // The version arrives from a dialog, but it is spliced into an `npm install <pkg>@<version>`
        // spec, so it is validated here rather than trusted.
        if (want && !/^[\w.+-]+$/.test(want))
          return fail(new Error(m('upd.badVersion', { v: want })))
        // A capability migration rewrites the page dir (manifest + old package files), so a running
        // page would have its launch files pulled out from under it — ask for a stop first.
        if (target.action === 'migrateCapability' && target.pageId) {
          const st = registry.get(target.pageId)?.status
          if (st === 'running' || st === 'starting') return fail(new Error(m('upd.migrateRunning')))
        }
        const res = await performUpdate(target, onProgress, want || undefined)
        // The migration changed startCommand/npmPackage on disk: re-read the manifests so the next
        // survey (and the page row itself) sees the capability layout immediately.
        if (res.ok && target.action === 'migrateCapability') registry.reconcile()
        clearUpdateCache()
        return ok(res)
      } catch (err) {
        return fail(err)
      } finally {
        // See UpdateNodeRuntime: guarantee a terminal event keyed by the same `name` the stream
        // used, so the persistent top-bar row is dropped even when the update failed.
        onProgress({ name: target.name, phase: 'done', percent: 100 })
      }
    }
  )
}
