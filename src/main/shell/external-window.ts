/**
 * Browser-like windows for links a hosted page wants to open elsewhere.
 *
 * A managed dsh/openclaw page owns a long-lived in-page scene (open terminal tabs, a paired
 * Control UI session). Pointing that same <webview> at an unrelated address replaces the scene
 * with no way back, so those pages spill outbound links into an independent window instead.
 * The default session is shared on purpose: a page the user already signed into inside the
 * embedded view is signed in here too, with no second login and no cookie copy.
 */
import { BrowserWindow, shell } from 'electron'
import type { BrowserWindowConstructorOptions } from 'electron'
import { appIconPath } from './icon'

/** A normal reading window — large enough for a desktop app, never tiny enough to clip one. */
const DEFAULT_WIDTH = 1100
const DEFAULT_HEIGHT = 800

/** Shared chrome/preference contract for every standalone outbound window. */
export function externalWindowOptions(): BrowserWindowConstructorOptions {
  return {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: 640,
    minHeight: 480,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    icon: appIconPath(),
    // These windows host arbitrary remote pages: no container preload, no Node, no nested
    // webviews. They are plain browsers, not another shell.
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  }
}

function protocolOf(url: string): string {
  try {
    return new URL(url).protocol
  } catch {
    return ''
  }
}

/**
 * Open `url` in a standalone window and return it, or null when the scheme cannot live in a
 * browser window (mailto/tel go to the OS handler). Used for cross-origin top-level navigation,
 * where the hosted page must stay exactly where it is.
 */
export function openExternalWindow(url: string): BrowserWindow | null {
  const protocol = protocolOf(url)
  if (protocol === 'mailto:' || protocol === 'tel:') {
    void shell.openExternal(url).catch(() => undefined)
    return null
  }
  if (protocol !== 'http:' && protocol !== 'https:') return null
  const win = new BrowserWindow({ ...externalWindowOptions(), show: false })
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show()
  })
  // Links opened from this window follow the same contract instead of silently replacing it.
  win.webContents.setWindowOpenHandler(({ url: next }) => {
    if (/^https?:/i.test(next)) {
      openExternalWindow(next)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })
  win.loadURL(url).catch(() => {
    if (!win.isDestroyed()) win.close()
  })
  return win
}
