import { BrowserWindow, ipcMain, shell } from 'electron'
import { IPC, type IpcResult, type ListEventsArgs, type ReadLogsArgs } from '../../../shared/types'
import { listEvents, logEvent } from '../events'
import { logsDir, listLogFiles, readLogTail, startLogStream } from '../logger'
import { exportDiagnostics } from '../../runtime/diagnostics'
import { exportSnapshot, importSnapshot } from '../../runtime/snapshot'
import { runNetworkProbe } from '../../runtime/net-probe'
import { startNetBarLoop } from '../../runtime/network-bar'
import { getSystemInfo, getNetworkStats } from '../../runtime/sysinfo'
import { collectPageMetrics, pruneMetricsBaseline, getMetricsHistory } from '../../runtime/metrics'
import { getSettings } from '../store'
import { setTrayResourceWarn } from '../tray'
import { type IpcCtx } from './util'

/** #20: CPU/RAM sampling cadence for the live per-row resource badges. */
let metricsTimer: NodeJS.Timeout | null = null
const METRICS_POLL_MS = 5_000
/** #20 leak guard: a page already rebooted for its memory budget, so one leak costs one restart. */
const memRestarted = new Set<string>()
/** A page that has not been up this long is failing for some other reason — restarting it for a
 *  memory figure sampled at t+3s would just loop. */
const MEM_RESTART_MIN_UPTIME_MS = 10 * 60_000

/** UpdateSettings hands the memory guard's per-run spine when the action is switched off. */
export function resetMemGuard(): void {
  memRestarted.clear()
}

export function registerLogsIpc(ctx: IpcCtx): void {
  const { registry, ok, fail } = ctx

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

  // Top-bar network indicator: one shared 2s sample loop in main (rates + latency + online
  // ports) broadcast to every window — see network-bar.ts. Idempotent across dev-HMR.
  startNetBarLoop(registry)
}
