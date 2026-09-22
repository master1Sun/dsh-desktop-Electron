import { screen } from 'electron'
import type { BrowserWindow, Rectangle } from 'electron'
import { clearWindowBounds, getSettings, updateSettings } from './store'
import type { WindowBounds } from '../../shared/types'

/**
 * #26: window geometry memory — persist the main window's size/position/maximized flag and put
 * them back on the next launch. Before this existed every start landed at a hardcoded 1280x860,
 * which is fine until you arrange the container beside other windows.
 *
 * Two guards matter here:
 *  - A restored rect must still intersect a connected display. Monitors get unplugged, and a
 *    window coming back at x=-32000 is unreachable (the OS won't drag it on-screen for you), so
 *    an unverifiable rect is dropped and we fall back to the platform default placement.
 *  - `getNormalBounds()` is what we store, never `getBounds()`: while maximized the latter is the
 *    monitor rect inflated by the invisible resize borders, and saving that as a "normal" size
 *    slowly grows the window across launches.
 */

/** A drag fires 'move' dozens of times a second; only the settled position is worth a disk write. */
const SAVE_DEBOUNCE_MS = 400
/** How much of the title bar area must land on some display for the rect to be considered reachable. */
const MIN_VISIBLE_PX = 60

let saveTimer: NodeJS.Timeout | null = null
let watched: BrowserWindow | null = null

function boundsEnabled(): boolean {
  return getSettings().rememberWindowBounds !== false
}

function isValid(b: WindowBounds | undefined): b is WindowBounds {
  if (!b) return false
  return [b.x, b.y, b.width, b.height].every((n) => Number.isFinite(n))
}

/** True when enough of the rect sits inside at least one connected display to be recoverable. */
function isOnSomeDisplay(rect: Rectangle): boolean {
  const probe: Rectangle = {
    x: rect.x,
    y: rect.y,
    width: Math.max(1, Math.min(rect.width, MIN_VISIBLE_PX)),
    height: Math.max(1, Math.min(rect.height, MIN_VISIBLE_PX))
  }
  return screen.getAllDisplays().some((d) => {
    const a = d.bounds
    const ix = Math.max(probe.x, a.x)
    const iy = Math.max(probe.y, a.y)
    const ix2 = Math.min(probe.x + probe.width, a.x + a.width)
    const iy2 = Math.min(probe.y + probe.height, a.y + a.height)
    return ix2 - ix > 0 && iy2 - iy > 0
  })
}

/**
 * The rect to construct the window with, or null to keep the caller's defaults. Clamped to the
 * display it restores onto, so a window remembered bigger than a now-connected screen still fits.
 */
export function resolveBounds(minWidth: number, minHeight: number): WindowBounds | null {
  if (!boundsEnabled()) return null
  const stored = getSettings().windowBounds
  if (!isValid(stored)) return null
  const rect: Rectangle = {
    x: stored.x,
    y: stored.y,
    width: Math.max(stored.width, minWidth),
    height: Math.max(stored.height, minHeight)
  }
  if (!isOnSomeDisplay(rect)) return null
  const display = screen.getDisplayMatching(rect)
  const wa = display.workAreaSize
  return {
    x: stored.x,
    y: stored.y,
    width: Math.min(rect.width, wa.width),
    height: Math.min(rect.height, wa.height),
    maximized: Boolean(stored.maximized)
  }
}

/** Schedule a debounced write of the window's current normal bounds + maximized flag. */
function scheduleSave(): void {
  if (!boundsEnabled()) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveWindowBounds()
  }, SAVE_DEBOUNCE_MS)
}

/** Write immediately (also called on quit so the last arrangement is never lost). */
export function saveWindowBounds(): void {
  if (!boundsEnabled()) return
  const win = watched
  if (!win || win.isDestroyed() || win.isMinimized()) return
  const n = win.getNormalBounds()
  const next: WindowBounds = {
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
    maximized: win.isMaximized()
  }
  const prev = getSettings().windowBounds
  // Skip the write when nothing moved: electron-store rewrites the whole file per set().
  if (
    prev &&
    prev.x === next.x &&
    prev.y === next.y &&
    prev.width === next.width &&
    prev.height === next.height &&
    prev.maximized === next.maximized
  )
    return
  updateSettings({ windowBounds: next })
}

/** Flush any pending debounced write (call before the window dies or the app quits). */
export function flushWindowBounds(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  saveWindowBounds()
}

/**
 * Drop the pending write and the stored geometry, so re-enabling 记住窗口大小和位置 starts from the
 * app's default size instead of resurrecting whatever was remembered before it was turned off.
 */
export function forgetWindowBounds(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  clearWindowBounds()
}

/**
 * Start tracking one window's geometry. Idempotent; re-attaching to a new window is safe.
 * Call this AFTER constructing the window with the restored bounds: attaching earlier would make
 * our own restore look like a user move and write the value straight back.
 */
export function watchWindowBounds(win: BrowserWindow): void {
  if (watched === win) return
  if (watched && !watched.isDestroyed()) {
    watched.off('resize', scheduleSave)
    watched.off('move', scheduleSave)
    watched.off('maximize', scheduleSave)
    watched.off('unmaximize', scheduleSave)
  }
  watched = win
  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('maximize', scheduleSave)
  win.on('unmaximize', scheduleSave)
}

/** Drop the tracked window (on 'closed'), so a later flush can't touch a destroyed object. */
export function unwatchWindowBounds(): void {
  flushWindowBounds()
  watched = null
}

/* ---- detached page windows -------------------------------------------------------------
 * Each popout gets its own slot in `settings.popoutBounds` rather than sharing the main
 * window's: two windows writing one rect would leave the last-dragged one restoring both.
 * Only the final geometry matters here, so the write happens once on 'closed' — a live
 * debounce would cost a store write per drag frame for a nicety nobody sees. */

function popoutSlot(pageId: string): WindowBounds | null {
  const b = getSettings().popoutBounds?.[pageId]
  return isValid(b) ? b : null
}

/** The rect to open one page's popout with, or null for the caller's default placement. */
export function resolvePopoutBounds(
  pageId: string,
  minWidth: number,
  minHeight: number
): WindowBounds | null {
  if (!boundsEnabled()) return null
  const stored = popoutSlot(pageId)
  if (!stored) return null
  const rect: Rectangle = {
    x: stored.x,
    y: stored.y,
    width: Math.max(stored.width, minWidth),
    height: Math.max(stored.height, minHeight)
  }
  // An unplugged monitor must not park a window off-screen — open it at the default instead.
  if (!isOnSomeDisplay(rect)) return null
  return { ...rect, maximized: Boolean(stored.maximized) }
}

/** Persist one popout's geometry on close (the window is still alive when 'closed' fires here). */
export function rememberPopoutBounds(win: BrowserWindow, pageId: string): void {
  if (!boundsEnabled()) return
  if (win.isMinimized()) return
  const n = win.getNormalBounds()
  const prev = popoutSlot(pageId)
  if (
    prev &&
    prev.x === n.x &&
    prev.y === n.y &&
    prev.width === n.width &&
    prev.height === n.height &&
    prev.maximized === win.isMaximized()
  )
    return
  updateSettings({ popoutBounds: { ...getSettings().popoutBounds, [pageId]: { ...n, maximized: win.isMaximized() } } })
}
