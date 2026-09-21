import { BrowserWindow, Notification, session, shell } from 'electron'
import { basename, dirname } from 'node:path'
import { IPC, type DownloadProgress } from '../shared/types'
import { resolveDownloadDir, uniquePath } from './store'
import { m } from './i18n'

/**
 * Downloads started inside an embedded <webview> (an external site like baidu.com, or a
 * hosted page's own links) get two things the raw Electron default doesn't give the user:
 *
 * 1. A live row in the window-level top progress bar — the app broadcasts a
 *    {@link DownloadProgress} over IPC on every byte update, so the download keeps counting
 *    even after the panel/view that started it scrolls out of sight.
 * 2. A system notification on completion that names the save location; clicking it reveals
 *    the file in the OS file manager.
 *
 * There is no native "Save As" prompt: files save straight into the folder chosen in
 * Settings ▸ 下载目录 (empty = the OS Downloads folder), so the destination — and a real
 * determinate percentage — are known from the first byte. A name collision gets a
 * " (1)", " (2)" … suffix rather than clobbering an earlier download.
 */

let sequence = 0

/** A stable, unique top-bar row id for one download. */
function nextId(): string {
  sequence += 1
  return `dl-${Date.now().toString(36)}-${sequence}`
}

function broadcast(payload: DownloadProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.OnDownloadProgress, payload)
  }
}

/** Percent 0..100 when the total size is known, else null (indeterminate bar). */
function computePercent(received: number, total: number): number | null {
  if (!total || total < 0) return null
  return Math.max(0, Math.min(100, Math.floor((received / total) * 100)))
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).host
  } catch {
    return undefined
  }
}

/** Pop the OS completion notice; clicking it reveals the saved file. */
function notifyDone(filename: string, savePath: string): void {
  try {
    if (!Notification.isSupported()) return
    const n = new Notification({
      title: m('download.doneTitle'),
      body: m('download.doneBody', { name: filename, dir: dirname(savePath) })
    })
    n.on('click', () => shell.showItemInFolder(savePath))
    n.show()
  } catch (err) {
    console.warn('[download] notification failed (ignored):', (err as Error).message)
  }
}

function wireItem(item: Electron.DownloadItem, host: string | undefined): void {
  const id = nextId()
  // The save path is set in will-download before we get here, so it is always known; fall back
  // to the server-suggested name only defensively.
  const label = (): string => basename(item.getSavePath()) || item.getFilename() || 'download'

  const snapshot = (state: DownloadProgress['state']): DownloadProgress => ({
    id,
    filename: label(),
    state,
    received: item.getReceivedBytes(),
    total: item.getTotalBytes(),
    percent: computePercent(item.getReceivedBytes(), item.getTotalBytes()),
    savePath: item.getSavePath() || undefined,
    host
  })

  // Progress streams on every byte update; the destination is fixed so `percent` is a real
  // determinate number (null only when the server sent no Content-Length, in which case the
  // bar animates as an indeterminate flow until 'done' lands). A mid-transfer 'interrupted'
  // (resumable) keeps the row alive rather than dropping it early.
  item.on('updated', (_e, state) => {
    if (state === 'progressing') broadcast(snapshot('progressing'))
    else if (state === 'interrupted') broadcast(snapshot('progressing'))
  })

  item.once('done', (_e, state) => {
    if (state === 'completed') {
      broadcast({ ...snapshot('completed'), received: item.getReceivedBytes(), percent: 100 })
      const savePath = item.getSavePath()
      if (savePath) notifyDone(basename(savePath), savePath)
    } else {
      // cancelled / interrupted-without-resume: tell the renderer to drop the row so the top
      // bar never leaves a bar stuck animating.
      broadcast({ ...snapshot('cancelled'), state: 'cancelled' })
    }
  })
}

/** Register once, after app is ready: catch every default-session download. */
export function registerDownloadHandling(): void {
  session.defaultSession.on('will-download', (_event, item, webContents) => {
    // Guest <webview> contents share the default session; the host URL is only a caption.
    const host = hostOf(webContents?.getURL?.())
    // Auto-save into the configured 下载目录 (no "Save As" dialog): setting a save path makes
    // Electron write straight there. We must NOT call event.preventDefault() — that would
    // cancel the download. The path is deduped against any existing file.
    item.setSavePath(uniquePath(resolveDownloadDir(), item.getFilename() || 'download'))
    wireItem(item, host)
  })
}
