import { BrowserWindow, ipcMain } from 'electron'
import { IPC, type PageProgress } from '../../shared/types'
import type { PageRegistry } from '../runtime/pages'
import { setEventBroadcaster } from './events'
import { ok, fail, type IpcCtx } from './ipc/util'
import { registerWindowIpc } from './ipc/window'
import { registerRuntimeIpc } from './ipc/runtime'
import { registerPagesIpc } from './ipc/pages'
import { registerSettingsIpc } from './ipc/settings'
import { registerLogsIpc } from './ipc/logs'
import { registerUpdatesIpc } from './ipc/updates'
import { registerTerminalIpc } from './ipc/terminal'
import { registerAgentsIpc } from './ipc/agents'
import { registerMcpIpc } from './ipc/mcp'

// Popout geometry flush (the window domain owns it) — main/index.ts keeps importing from here.
export { flushPopoutBounds } from './ipc/window'

/**
 * IPC facade: builds the shared ctx (registry + ok/fail) and fans out to the per-domain
 * registrars under ./ipc/. Only the process-wide wiring stays inline here: the idempotent
 * handler wipe (dev-HMR), the registry change/progress broadcast and the event broadcaster.
 */
export function registerIpc(registry: PageRegistry): void {
  const ctx: IpcCtx = { registry, ok, fail }

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

  registerWindowIpc(ctx)
  registerRuntimeIpc(ctx)
  registerPagesIpc(ctx)
  registerSettingsIpc(ctx)
  registerLogsIpc(ctx)
  registerUpdatesIpc(ctx)
  registerTerminalIpc(ctx)
  registerAgentsIpc(ctx)
  registerMcpIpc(ctx)
}
