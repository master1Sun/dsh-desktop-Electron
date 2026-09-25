import { app, BrowserWindow, dialog, ipcMain, nativeTheme, webContents } from 'electron'
import type { WebContents } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IPC, DEFAULT_KEYBINDINGS, type ExternalSite, type HotkeySignal, type IpcResult, type KeybindingAction } from '../../../shared/types'
import { matchesAccelerator } from '../../../shared/accel'
import type { PageRegistry } from '../../runtime/pages/pages'
import { getSettings } from '../store'
import { relaunchToApplyStaged } from '../../update/asar-updates'
import { rememberPopoutBounds, resolvePopoutBounds } from '../window-bounds'
import { appIconPath } from '../icon'
import { m } from '../i18n'
import { type IpcCtx } from './util'

/**
 * The saved 外部站点 behind an id, or null when the id is not one. A site is not a registry page —
 * it is a name + URL in settings — so this is the whole main-process side of the record: the
 * existence check behind the pop-out guard and the window caption. The detached window re-reads the
 * same list by id to know which address to host, so only the id travels in the query.
 */
export function savedSite(pageId: string): ExternalSite | null {
  return getSettings().externalSites?.find((s) => s.id === pageId) || null
}

/** Detached page windows, one per page id; opening the same page twice focuses the first. */
const popoutWindows = new Map<string, BrowserWindow>()
let popoutSaveTimer: NodeJS.Timeout | null = null
/** The app.on('web-contents-created') guest-key listener is process-wide, so wire it once. */
let guestKeysWired = false
/** Same for the guest dark-scheme listener. */
let guestSchemeWired = false
/** Per guest: the key of the CSS we injected, so a theme flip can take it back out. */
const guestSchemeCss = new WeakMap<WebContents, string>()

/**
 * The preload file for a shell window. electron-vite emits `.mjs` for the dev preload and the
 * packaged build can carry either name, so probe rather than assume (mirrors main/index.ts).
 */
function shellPreload(): string {
  const dir = join(__dirname, '../preload')
  for (const name of ['index.mjs', 'index.js']) {
    if (existsSync(join(dir, name))) return join(dir, name)
  }
  return join(dir, 'index.mjs')
}

/** Debounced geometry save for every live popout (a drag fires 'move' dozens of times a second). */
function schedulePopoutSave(): void {
  if (popoutSaveTimer) clearTimeout(popoutSaveTimer)
  popoutSaveTimer = setTimeout(() => {
    popoutSaveTimer = null
    flushPopoutBounds()
  }, 800)
  popoutSaveTimer.unref?.()
}

/** Write any pending popout geometry immediately (also called before the app quits). */
export function flushPopoutBounds(): void {
  if (popoutSaveTimer) {
    clearTimeout(popoutSaveTimer)
    popoutSaveTimer = null
  }
  for (const [id, win] of popoutWindows) {
    if (!win.isDestroyed()) rememberPopoutBounds(win, id)
  }
}

/**
 * Open — or focus — one page's own top-level window. It loads the same shell bundle with
 * `?popout=<pageId>`, which App.vue answers with a minimal layout (title strip + full-bleed
 * webview) instead of the workbench.
 *
 * The default session is shared on purpose: a page the user has already signed into in the
 * embedded view is signed in here too, with no second login and no cookie copy.
 */
export function openPageWindow(registry: PageRegistry, pageId: string): BrowserWindow {
  const existing = popoutWindows.get(pageId)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    return existing
  }
  const state = registry.get(pageId)
  const restored = resolvePopoutBounds(pageId, 720, 480)
  const win = new BrowserWindow({
    width: restored?.width ?? 1000,
    height: restored?.height ?? 700,
    x: restored?.x,
    y: restored?.y,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    title: state?.name || savedSite(pageId)?.name || pageId,
    backgroundColor: '#000000',
    // same frameless contract as the main shell: the renderer draws its own title strip
    frame: false,
    icon: appIconPath(),
    webPreferences: {
      preload: shellPreload(),
      // mirrors the main window: the popout hosts the page in a <webview> of its own
      sandbox: false,
      webviewTag: true
    }
  })
  popoutWindows.set(pageId, win)
  win.on('ready-to-show', () => {
    if (!win.isDestroyed()) win.show()
  })
  win.on('page-title-updated', (e) => {
    // The hosted page must not rename the OS title bar away from the page name.
    e.preventDefault()
  })
  win.on('resize', schedulePopoutSave)
  win.on('move', schedulePopoutSave)
  // Mirror the main shell's push (main/index.ts): the caption's maximize/restore icon and the
  // snap/drag paths both need the live state, and the popout renderer listens on the same IPC.
  const pushMaximized = (): void => {
    if (!win.isDestroyed()) win.webContents.send(IPC.OnMaximizedChanged, win.isMaximized())
  }
  win.on('maximize', () => {
    schedulePopoutSave()
    pushMaximized()
  })
  win.on('unmaximize', () => {
    schedulePopoutSave()
    pushMaximized()
  })
  win.on('closed', () => {
    popoutWindows.delete(pageId)
  })
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) win.loadURL(`${devUrl}?popout=${encodeURIComponent(pageId)}`)
  else win.loadFile(join(__dirname, '../renderer/index.html'), { query: { popout: pageId } })
  return win
}

/**
 * Resolve the effective shortcut map: the built-in defaults, overridden per action by
 * `settings.keybindings`. An empty string unbinds an action outright.
 */
function activeKeybindings(): Record<KeybindingAction, string> {
  const stored = getSettings().keybindings || {}
  const out = { ...DEFAULT_KEYBINDINGS }
  for (const action of Object.keys(out) as KeybindingAction[]) {
    const v = stored[action]
    if (typeof v === 'string') out[action] = v
  }
  return out
}

/**
 * Shortcuts pressed *inside* a hosted page never reach the shell window's keydown listener — the
 * guest owns its own keyboard. These three actions are about the container rather than the page,
 * so the main process watches each webview's input and forwards them, exactly like the shell's
 * own listener would. Deliberately a tiny set: stealing more (Esc, F12, …) from an app the user
 * is working in is a bad trade.
 */
const GUEST_ACTIONS: KeybindingAction[] = ['palette', 'terminal', 'popoutCurrent']

function wireGuestShortcuts(registry: PageRegistry): void {
  if (guestKeysWired) return
  guestKeysWired = true
  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() !== 'webview') return
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const bindings = activeKeybindings()
      let fired: KeybindingAction | null = null
      for (const action of GUEST_ACTIONS) {
        if (
          matchesAccelerator(bindings[action], {
            key: input.key,
            code: input.code,
            ctrl: input.control,
            shift: input.shift,
            alt: input.alt,
            meta: input.meta
          })
        ) {
          fired = action
          break
        }
      }
      if (!fired) return
      event.preventDefault()
      const url = contents.getURL()
      const pageId = url
        ? registry.running().find((p) => p.url && url.startsWith(p.url))?.id
        : undefined
      const signal: HotkeySignal = { action: fired, ...(pageId ? { pageId } : {}) }
      // Only the window that hosts this guest owns the action (the main shell, or the popout
      // the page was pulled into) — broadcasting would open two palettes.
      const hostId = contents.hostWebContents?.id
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed() && win.webContents.id === hostId) {
          win.webContents.send(IPC.OnHotkey, signal)
          break
        }
      }
    })
  })
}

/**
 * A hosted page that paints itself dark but never declares `color-scheme` still gets Chromium's
 * LIGHT native scrollbar and form controls: `nativeTheme.themeSource` only drives the
 * `prefers-color-scheme` media query, which such a page never reads, and the shell cannot style a
 * guest document from outside. So after a guest loads we ask it whether its own canvas is dark and
 * its scheme is still `normal`, and if so inject the one declaration it forgot. A page that already
 * opted in, that paints no canvas, or that is simply light is left exactly as it is.
 */
const GUEST_DARK_PROBE = `(() => {
  const de = document.documentElement
  if (!de) return false
  const root = getComputedStyle(de)
  if ((root.colorScheme || 'normal').indexOf('dark') >= 0) return false
  const rgba = (c) => {
    const m = String(c).match(/rgba?\\(([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,\\s/]+([\\d.]+))?\\)/)
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null
  }
  const body = document.body ? rgba(getComputedStyle(document.body).backgroundColor) : null
  const bg = (body && body.a ? body : rgba(root.backgroundColor)) || null
  if (!bg || bg.a === 0) return false
  return 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b < 110
})()`
const GUEST_DARK_CSS = ':root{color-scheme:dark}'

async function backfillGuestScheme(contents: WebContents): Promise<void> {
  if (contents.isDestroyed()) return
  const prev = guestSchemeCss.get(contents)
  if (prev) {
    guestSchemeCss.delete(contents)
    await contents.removeInsertedCSS(prev).catch(() => undefined)
  }
  if (!nativeTheme.shouldUseDarkColors) return
  try {
    if ((await contents.executeJavaScript(GUEST_DARK_PROBE, false)) !== true) return
    guestSchemeCss.set(contents, await contents.insertCSS(GUEST_DARK_CSS, { cssOrigin: 'user' }))
  } catch {
    /* a guest that refuses the probe keeps its own scrollbar */
  }
}

function wireGuestScheme(): void {
  if (guestSchemeWired) return
  guestSchemeWired = true
  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() !== 'webview') return
    // insertCSS lives in the document, so a new load has to be probed again; an SPA route change
    // keeps the same document and needs nothing.
    contents.on('dom-ready', () => void backfillGuestScheme(contents))
    contents.once('destroyed', () => guestSchemeCss.delete(contents))
  })
  // A theme flip repaints the guests that are already open, not just the next navigation.
  nativeTheme.on('updated', () => {
    for (const c of webContents.getAllWebContents()) {
      if (!c.isDestroyed() && c.getType() === 'webview') void backfillGuestScheme(c)
    }
  })
}

export function registerWindowIpc(ctx: IpcCtx): void {
  const { registry, ok, fail } = ctx

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

  // Pull a page into its own window. Every kind qualifies now: a CLI page starts a second,
  // independent session there (PTY output only ever reaches the window that spawned it, so the two
  // runs cannot share a surface), and a saved 外部站点 is not a page at all — only its name and URL
  // matter, which the detached window resolves from settings itself.
    // Make container shortcuts work while focus is inside a hosted page; give dark-hosted
  // pages the color-scheme they forgot. (Was called inline in registerIpc.)
  wireGuestShortcuts(registry)
  wireGuestScheme()

  ipcMain.handle(IPC.OpenPageWindow, (_e, pageId: string): IpcResult => {
    try {
      if (!registry.get(pageId) && !savedSite(pageId)) {
        return fail(new Error(m('page.unknown', { id: pageId })))
      }
      openPageWindow(registry, pageId)
      return ok(true)
    } catch (err) {
      return fail(err)
    }
  })

  // The container updated its own source: relaunch so the new code runs. before-quit
  // still gets to shut the pages down; --dsh-relaunched bypasses the single-instance lock.
  ipcMain.handle(IPC.RelaunchApp, (): IpcResult => {
    // Dev landmine (black window): a bare app.relaunch spawns `electron .` as the PID exits, but
    // that exit also tears down the electron-vite parent — the renderer dev server dies with it,
    // and the orphaned relaunch loads a dead http://localhost URL into a black window (it also
    // carries --dsh-relaunched, so it sidesteps the single-instance lock and can coexist with the
    // next `npm run dev`). electron-vite already rebuilds/restarts main-process edits in dev, so
    // a self-relaunch buys nothing here — explain and stay alive instead.
    if (!app.isPackaged) {
      dialog
        .showMessageBox({ type: 'info', title: m('dialog.title'), message: m('update.relaunchDev') })
        .catch(() => undefined)
      return ok(false)
    }
    // A container asar update is staged under resources/updates/<commit>/: hand the swap to a
    // detached helper that replaces app.asar the moment this PID exits and then relaunches, so the
    // update is applied IN PLACE (the old boot.cjs next-launch hook is not on the launch path).
    // Nothing staged (a plain relaunch) falls through to the in-process app.relaunch below.
    if (relaunchToApplyStaged()) {
      // Exit only after a short grace so the OS fully materialises the orphaned swap helper before
      // Electron tears down its process tree; the helper itself waits for this PID to vanish.
      setTimeout(() => app.exit(0), 700)
      return ok(true)
    }
    // Drop --autostart: it marks a hidden login launch and would otherwise be inherited by
    // the relaunched process, leaving the user with a tray-only (seemingly vanished) app.
    const args = process.argv.slice(1).filter((a) => a !== '--autostart')
    app.relaunch({ args: [...args, '--dsh-relaunched'] })
    app.exit(0)
    return ok(true)
  })

  // Renderer confirms quit (after ElMessageBox) — initiate graceful shutdown.
  ipcMain.handle(IPC.QuitApp, (): IpcResult => {
    app.quit()
    return ok(true)
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
}
