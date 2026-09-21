import { Menu, nativeImage, Tray } from 'electron'
import type { NativeImage } from 'electron'
import { existsSync } from 'node:fs'
import type { PageRegistry } from './pages'
import { m } from './i18n'
import { appIconPath } from './icon'

/**
 * System tray: icon plus the show / per-page start-stop / quit context menu built from
 * the live page registry. Extracted from index.ts to keep the entry file about
 * bootstrapping only. The tray holds no authority of its own — the registry and the
 * window/quit actions are reached through injected hooks, so this module never imports
 * index.ts back (no `tray → index → tray` cycle) and tolerates the registry not existing
 * yet at creation time (the injected getter is re-read on every rebuild).
 *
 * The icon also carries a tiny status badge — a tray-resident app is otherwise blind:
 * red dot = a hosted page sits in 'error' (crash guard died or gave up), orange = an
 * OTA update is available/staged. Computed in rebuildTrayMenu (alert, from the registry)
 * and pushed from ipc.ts (update), merged here with alert winning.
 */

let tray: Tray | null = null
/** resized 16px base icon, kept for badge composition (toBitmap → paint → createFromBitmap) */
let trayImage: NativeImage | null = null
let updatePending = false

// 0 = idle, 1 = update (orange), 2 = alert (red); higher wins so a crash outranks an update.
const BADGE_COLORS: Record<1 | 2, [number, number, number]> = {
  1: [0xf5, 0x9e, 0x0b],
  2: [0xef, 0x44, 0x44]
}

/** Overlay a colored dot on the icon's bottom-right corner; falls back to the bare image. */
function composeImage(level: 0 | 1 | 2): NativeImage | null {
  if (!trayImage || level === 0) return trayImage
  try {
    const { width, height } = trayImage.getSize()
    if (!width || !height) return trayImage
    const bmp = trayImage.toBitmap() // a fresh Buffer copy — safe to mutate in place
    const [r, g, b] = BADGE_COLORS[level]
    const rad = Math.max(3, Math.round(width * 0.28))
    const cx = width - rad - 1
    const cy = height - rad - 1
    for (let y = Math.max(0, cy - rad); y < Math.min(height, cy + rad + 1); y++) {
      for (let x = Math.max(0, cx - rad); x < Math.min(width, cx + rad + 1); x++) {
        const dx = x - cx
        const dy = y - cy
        const d2 = dx * dx + dy * dy
        if (d2 > rad * rad) continue
        const i = (y * width + x) * 4 // BGRA pre-multiplied; alpha 255 (opaque dot)
        const edge = d2 > (rad - 1) * (rad - 1)
        bmp[i] = edge ? 0xff : b
        bmp[i + 1] = edge ? 0xff : g
        bmp[i + 2] = edge ? 0xff : r
        bmp[i + 3] = 255
      }
    }
    return nativeImage.createFromBitmap(bmp, { width, height })
  } catch (err) {
    console.warn('[tray] badge compose failed, using bare icon:', (err as Error).message)
    return trayImage
  }
}

// Injected at createTray() time; identity getters so late assignment (registry is born
// after the tray on the fast first-frame path) and window rebuilds are both visible.
let hooks: {
  getRegistry: () => PageRegistry | null
  onShowWindow: () => void
  onQuitRequest: () => void
} = {
  getRegistry: () => null,
  onShowWindow: () => undefined,
  onQuitRequest: () => undefined
}

// Cap on stopped-page entries in the tray context menu: a long tail makes the
// start/stop hot items hard to reach; full management lives in the app window.
const TRAY_STOPPED_LIMIT = 8

export function rebuildTrayMenu(): void {
  const registry = hooks.getRegistry()
  if (!tray || !registry) return
  const running = registry.running()
  const stopped = registry.list().filter((p) => p.status !== 'running' && !p.external)
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: m('tray.show'), click: () => hooks.onShowWindow() },
    { type: 'separator' },
    ...running.map((p): Electron.MenuItemConstructorOptions => ({
      label: m('tray.stop', { name: p.name }),
      click: () => registry.stop(p.id)
    })),
    ...stopped.slice(0, TRAY_STOPPED_LIMIT).map((p): Electron.MenuItemConstructorOptions => ({
      label: m('tray.start', { name: p.name }),
      click: () => {
        registry.start(p.id).catch((err) => console.warn('[tray] start failed:', err.message))
      }
    })),
    { type: 'separator' },
    {
      label: m('tray.quit'),
      click: () => hooks.onQuitRequest()
    }
  ]
  const alert = stopped.some((p) => p.status === 'error')
  tray.setToolTip(alert ? m('tray.tooltipAlert') : m('tray.tooltip', { n: running.length }))
  tray.setContextMenu(Menu.buildFromTemplate(template))
  const img = composeImage(alert ? 2 : updatePending ? 1 : 0)
  if (img) tray.setImage(img)
}

/** Orange dot: an OTA update is available or staged (alert still outranks it). */
export function setTrayUpdatePending(v: boolean): void {
  if (updatePending === v) return
  updatePending = v
  const registry = hooks.getRegistry()
  const alert = registry ? registry.list().some((p) => p.status === 'error' && !p.external) : false
  const img = composeImage(alert ? 2 : v ? 1 : 0)
  if (tray && img) tray.setImage(img)
}

export function createTray(injected: typeof hooks): void {
  if (tray) return
  hooks = injected
  const path = appIconPath()
  const image = existsSync(path) ? nativeImage.createFromPath(path) : nativeImage.createEmpty()
  // 16px matches the Windows small-icon grid; an empty image is kept as-is because
  // resizing it still renders nothing and only hides the problem.
  trayImage = image.isEmpty() ? image : image.resize({ width: 16, height: 16 })
  tray = new Tray(trayImage)
  tray.on('click', () => hooks.onShowWindow())
  rebuildTrayMenu()
}
