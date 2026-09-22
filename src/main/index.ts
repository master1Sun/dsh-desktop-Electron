import { app, BrowserWindow, dialog, shell } from 'electron'
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { IPC } from '../shared/types'
import { PageRegistry } from './pages'
import { registerIpc } from './ipc'
import { ensureDefaultOpenclawPage, ensureBuiltinPages } from './openclaw'
import { pnpmBinDirs } from './dsh'
import { getSettings, resolvePagesDir, resolveProjectDir, applyLaunchAtStartup, applyNpmRegistryEnv } from './store'
import { getNodeRuntimeInfo } from './node-runtime'
import { m, onLocaleChanged, registerLocaleSource } from './i18n'
import { installFileLogger } from './logger'
import { registerDownloadHandling } from './downloads'
import { ensureAsciiUserData } from './user-data'
import { appIconPath } from './icon'
import { createTray, rebuildTrayMenu } from './tray'
import {
  flushWindowBounds,
  resolveBounds,
  unwatchWindowBounds,
  watchWindowBounds
} from './window-bounds'

// Why userData must be ASCII before any path-dependent init (logger, electron-store,
// node override): see user-data.ts. The call itself has to stay here, first thing.
ensureAsciiUserData()

// Mirror every console call into userData/logs BEFORE anything else logs: a packaged
// app has no stderr, and without this the uncaughtException guard below is write-only.
installFileLogger()

// Main-process strings (window title, tray, dialogs, IPC errors) follow the persisted locale.
// The value is memoized by i18n after the first read; a settings change invalidates it via
// notifyLocaleChanged (see ipc.ts), so mid-session switches still land everywhere.
registerLocaleSource(() => getSettings().locale)

// Surfaces that cache translated text rebuild themselves when the language changes.
onLocaleChanged(() => {
  mainWindow?.setTitle(m('app.title'))
  rebuildTrayMenu()
})

// mainWindow is nulled on 'closed' (see createWindow) so every `if (!mainWindow)`
// guard below means "really no window" and can safely rebuild one.
let mainWindow: BrowserWindow | null = null
let registry: PageRegistry | null = null
let isQuitting = false
// True when this run was kicked off by the OS login item (--autostart / wasOpenedAtLogin):
// the window is then created but kept hidden so the app settles straight into the tray.
let startHidden = false

// A throw inside a main-process event callback (e.g. node-pty's internal onData/exit pump,
// which isn't wrapped by an ipcMain.handle try/catch) would otherwise terminate Electron.
// Log and keep the app alive so one bad PTY frame can't take the whole container down.
// Exception: module / native-binding resolution failures mean every later feature re-throws
// too — a packaged app in that state is a hollow shell (broken asar switch, half-applied
// update), so surface a visible reason and exit instead of pretending to live. Dev is left
// alone: hot-reload can transiently throw these codes and a dialog there is pure nagging.
const FATAL_ERROR_CODES = new Set(['MODULE_NOT_FOUND', 'ERR_UNKNOWN_BUILTIN_MODULE', 'ERR_DLOPEN_FAILED'])
let fatalEscalated = false
process.on('uncaughtException', (err) => {
  console.error('[container] uncaught exception:', err)
  const code = (err as NodeJS.ErrnoException).code
  if (app.isPackaged && code && FATAL_ERROR_CODES.has(code) && !fatalEscalated) {
    fatalEscalated = true // only one dialog even if the broken pump keeps throwing
    const msg = m('err.fatal', { err: code })
    console.error(`[container] fatal: ${msg}`)
    dialog
      .showMessageBox({ type: 'error', title: m('dialog.title'), message: msg })
      .catch(() => undefined) // dialogs can fail this early — the exit below still runs
      .finally(() => app.exit(1))
  }
})
process.on('unhandledRejection', (reason) => {
  console.error('[container] unhandled rejection:', reason)
})

/**
 * Tell the bootstrapper (boot.cjs) this app path boots healthy, so its crash-guard
 * stops rolling back. The marker content is the full app path currently running — a
 * stale marker from an older update never matches and triggers another rollback.
 */
function markBootOk(): void {
  if (!app.isPackaged) return
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(join(app.getPath('userData'), 'dsh-boot-ok-marker'), app.getAppPath())
  } catch (err) {
    console.warn('[container] cannot write boot-ok marker:', (err as Error).message)
  }
}

/**
 * A failed OTA switch can leave the new asar unpacked-less (Electron only unpacks
 * native modules from the *bundled* asar at install time). node-pty then fails to
 * load; copying the bundled app.asar.unpacked next to the update fixes it. One-time,
 * best-effort: an existing destination is never touched.
 */
function ensureUnpackedForUpdate(): void {
  if (!app.isPackaged) return
  try {
    // The exe sits at <installDir>\<name>.exe; bundled app.asar(.unpacked) and our updates
    // folder both live one level down under <installDir>\resources (matches updatesRoot()).
    const resources = join(dirname(app.getPath('exe')), 'resources')
    const appPath = app.getAppPath()
    if (!appPath.startsWith(join(resources, 'updates'))) return
    const src = join(resources, 'app.asar.unpacked')
    const dst = join(dirname(appPath), 'app.asar.unpacked')
    if (existsSync(src) && !existsSync(dst)) cpSync(src, dst, { recursive: true })
  } catch (err) {
    console.warn('[container] unpacked-copy for update failed (ignored):', (err as Error).message)
  }
}

function createWindow(): void {
  // #26: restore the last arrangement when allowed; null means "use the shipped defaults".
  // Passing them to the constructor (instead of setBounds afterwards) avoids a visible resize
  // flash on every launch.
  const restored = resolveBounds(940, 600)
  mainWindow = new BrowserWindow({
    width: restored?.width ?? 1280,
    height: restored?.height ?? 860,
    x: restored?.x,
    y: restored?.y,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: m('app.title'),
    backgroundColor: '#000000',
    // frameless: MenuBar doubles as the OS title bar with custom window controls
    frame: false,
    // win + linux read this for the taskbar/window chrome; mac uses build/icon.icns
    icon: appIconPath(),
    webPreferences: {
      preload: resolvePreload(),
      // Deliberate trade-off (container host): sandbox:false so the preload can expose node
      // helpers; webviewTag:true so managed pages run embedded. The blast radius is kept in
      // check by the authoritative web-contents-created handler below — every webview guest
      // gets window.open denied and navigated in place, so no guest escapes to a popup or
      // the system browser. Don't remove either without re-checking that handler.
      sandbox: false,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    // A login-item launch stays in the tray; the user opens it from there when wanted.
    if (!startHidden) mainWindow?.show()
  })

  // The window can still die out from under us (OS session end, a crash we survived).
  // Drop the reference so showWindow()/activate correctly build a fresh one instead of
  // calling show() on a destroyed object.
  mainWindow.on('closed', () => {
    unwatchWindowBounds()
    mainWindow = null
  })

  // #26: start persisting geometry AFTER the constructor applied the restored rect, so the
  // restore itself is never mistaken for a user move; come back maximized when that was the state.
  watchWindowBounds(mainWindow)
  if (restored?.maximized) mainWindow.maximize()

  // push OS-maximize state (incl. snap/drag) so the custom title bar updates its icon
  const pushMaximized = (): void => {
    mainWindow?.webContents.send(IPC.OnMaximizedChanged, mainWindow.isMaximized())
  }
  mainWindow.on('maximize', pushMaximized)
  mainWindow.on('unmaximize', pushMaximized)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // close button -> hide to tray or confirm quit depending on settings
  mainWindow.on('close', (e) => {
    if (isQuitting) return // allow the real quit through
    if (getSettings().minimizeToTray) {
      e.preventDefault()
      mainWindow?.hide()
    } else {
      // Not minimizing to tray: treat X as an exit request — ask first.
      e.preventDefault()
      confirmAndQuit()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function resolvePreload(): string {
  const dir = join(__dirname, '../preload')
  for (const name of ['index.mjs', 'index.js']) {
    if (existsSync(join(dir, name))) return join(dir, name)
  }
  return join(dir, 'index.mjs')
}

function showWindow(): void {
  if (!mainWindow) createWindow()
  else {
    mainWindow.show()
    mainWindow.focus()
  }
}

/** Ask the renderer to show a horizontal quit-confirm dialog (ElMessageBox). */
function confirmAndQuit(): void {
  if (!mainWindow) {
    // No window at all (edge case) — just quit.
    isQuitting = true
    app.quit()
    return
  }
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.webContents.send(IPC.OnQuitConfirm)
}

async function verifyNodeRuntime(): Promise<void> {
  const info = await getNodeRuntimeInfo()
  if (!info.ok) {
    // A missing bundled Node is the expected state on a slim install: the first-run
    // SetupGate overlay already blocks the UI and drives the on-demand download, so a
    // native warning dialog here is just a redundant nag. Log it for developers only.
    // A present-but-wrong version is an anomaly the gate can't catch — still surface it.
    if (info.version) {
      const msg = m('err.nodeVersion', { version: info.version })
      console.error(`[container] ${msg}`)
      dialogWarn(msg)
    } else {
      console.error(`[container] ${m('err.nodeMissing')}`)
    }
  } else {
    console.log(`[container] bundled node OK: ${info.path} (${info.version})`)
  }
}

function dialogWarn(msg: string): void {
  dialog
    .showMessageBox({ type: 'warning', title: m('dialog.title'), message: msg })
    .catch(() => undefined)
}

/**
 * After a self-update relaunch the outgoing process may still hold the single-instance
 * lock while it tears down (the fixed 1s gamble lost it on slow machines, so the next
 * launch — without --dsh-relaunched — couldn't dedupe and two instances coexisted).
 * Retry every 500ms until the lock frees; booting continues meanwhile. If it's still
 * taken after the budget a live instance really owns it — surface that instead of
 * silently running doubled-up.
 */
function reacquireSingleInstanceLock(): void {
  const RETRY_MS = 500
  const MAX_ATTEMPTS = 10 // ~5s total grace for the predecessor to exit
  const attempt = (n: number): void => {
    if (app.requestSingleInstanceLock()) {
      console.log(`[container] relaunched instance took over the single-instance lock (attempt ${n})`)
      return
    }
    if (n >= MAX_ATTEMPTS) {
      const msg = m('err.dualInstance')
      console.error(`[container] ${msg} (lock still held after ${n} attempts)`)
      dialogWarn(msg)
      return
    }
    setTimeout(() => attempt(n + 1), RETRY_MS)
  }
  attempt(1)
}

// A relaunch right after a container self-update must not be treated as a second instance:
// the old process is mid-exit (app.exit) and may still hold the lock for a moment.
const relaunched = process.argv.includes('--dsh-relaunched')
const gotLock = relaunched || app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  if (relaunched) {
    // Take over the lock so the next launch (even without the flag) dedupes normally.
    reacquireSingleInstanceLock()
  }
  app.on('second-instance', showWindow)

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.dsh.desktop-container')
    ensureUnpackedForUpdate()
    markBootOk()

    // Detect a boot-triggered launch before the window is created so it can come up hidden,
    // and re-assert the OS registration so it always matches the persisted setting (a manual
    // registry edit or an update that reset the login item self-heals on the next start).
    startHidden =
      process.argv.includes('--autostart') || app.getLoginItemSettings().wasOpenedAtLogin
    applyLaunchAtStartup(getSettings().launchAtStartup)
    // #26: one env var decides which npm registry every child install uses — set it before any
    // page can start so the very first install already goes through the picked mirror.
    applyNpmRegistryEnv()
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

    // Embedded <webview> guests: keep window.open / target=_blank inside the SAME view
    // (navigate in place) instead of popping a new window or handing off to the system
    // browser. This main-process handler is authoritative and takes precedence over the
    // renderer `new-window` event, so nothing can slip out to an external window.
    app.on('web-contents-created', (_e, contents) => {
      if (contents.getType() === 'webview') {
        contents.setWindowOpenHandler(({ url }) => {
          contents.loadURL(url).catch(() => undefined)
          return { action: 'deny' }
        })
      }
    })

    // Files a user grabs inside an embedded page / external site stream into the top progress
    // bar and pop a completion notice naming the save location (see downloads.ts).
    registerDownloadHandling()

    // Get the window/tray in front of the user first: the renderer only needs IPC handlers,
    // which registerIpc() below installs in this same synchronous tick — long before any page
    // script can invoke them — so creating the window here can't race the handlers.
    createWindow()
    // Registry-less by design at this point: the tray re-reads it through the injected
    // getter on every rebuild, so it can come up before the registry exists.
    createTray({
      getRegistry: () => registry,
      onShowWindow: showWindow,
      onQuitRequest: confirmAndQuit
    })

    // Node probing may spawn a process (seconds on cold starts) — never await it on the
    // first-frame path. A missing Node is already handled by the renderer SetupGate; the
    // dialog inside only fires for the version-anomaly case SetupGate can't catch.
    verifyNodeRuntime().catch((err) =>
      console.error('[container] node runtime verification failed:', err)
    )

    ensureDefaultOpenclawPage()
    ensureBuiltinPages()
    registry = new PageRegistry({ pagesDir: resolvePagesDir(), projectDir: resolveProjectDir() })
    registerIpc(registry)
    registry.on('changed', rebuildTrayMenu)
    // Tray came up before the registry existed (empty page list) — populate it now.
    rebuildTrayMenu()

    const settings = getSettings()
    if (settings.autoStartPages.length) {
      registry
        .autoStart(settings.autoStartPages)
        .catch((err) => console.warn('[container] auto-start failed', err))
    }

    // Warm the pnpm-location probe (a cold `npm prefix -g` costs seconds) off the critical
    // path of the *first* dsh start; it's cached process-wide via pnpmBinDirs().
    void pnpmBinDirs().catch(() => undefined)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else showWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !getSettings().minimizeToTray) {
      isQuitting = true
      app.quit()
    }
  })

  let shutdownDone = false
  // Hard cap on the exit flush: children are given up to this long to die for real
  // (shutdownAll awaits each process 'close'); a wedged one must not block quit forever.
  const QUIT_FLUSH_MS = 3000
  app.on('before-quit', (e) => {
    isQuitting = true
    // #26: a quit can arrive before the move/resize debounce fires — write the final geometry now.
    flushWindowBounds()
    if (registry && !shutdownDone) {
      shutdownDone = true // one-shot: never reset, re-entrant quits fall through to Electron
      e.preventDefault()
      const grace = new Promise<void>((resolve) => setTimeout(resolve, QUIT_FLUSH_MS))
      Promise.race([registry.shutdownAll(), grace]).then(
        () => app.exit(0),
        (err) => {
          // A throw here means the kill path itself broke — don't loop in the
          // uncaughtException handler, log once and force the exit.
          console.error('[container] shutdownAll failed, forcing exit:', err)
          app.exit(0)
        }
      )
    }
  })
}
