import { app, BrowserWindow, dialog, Menu, nativeImage, Tray, shell } from 'electron'
import { cpSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { IPC } from '../shared/types'
import { PageRegistry } from './pages'
import { registerIpc } from './ipc'
import { ensureDefaultOpenclawPage, ensureBuiltinPages } from './openclaw'
import { pnpmBinDirs } from './dsh'
import { getSettings, resolvePagesDir, resolveProjectDir } from './store'
import { getNodeRuntimeInfo } from './node-runtime'
import { m, onLocaleChanged, registerLocaleSource } from './i18n'
import { installFileLogger } from './logger'
import icon from '../../resources/icon.png?asset'

/**
 * The packaged `productName` is Chinese (桌面控制台), so Electron's default userData folder is
 * `%APPDATA%\桌面控制台`. A non-ASCII install path breaks the PowerShell Expand-Archive call in
 * the bundled-Node updater (the mangled `-Command` string can hang it at 0%) and trips other
 * native / git tooling the container shells out to. Pin userData — and therefore every install
 * path (pages, env root, node-update staging) — to an ASCII folder BEFORE any path-dependent
 * init runs (logger, electron-store, node override). The Chinese name stays everywhere it is
 * user-visible (window title, shortcuts); existing data is renamed across so settings survive.
 */
function ensureAsciiUserData(): void {
  const asciiLeaf = 'dsh-desktop-container'
  try {
    const current = app.getPath('userData')
    // Non-ASCII = control/extended chars outside printable 7-bit ASCII.
    if (!/[^\x20-\x7e]/.test(current)) return // already ASCII (e.g. dev) — leave it untouched
    const target = join(app.getPath('appData'), asciiLeaf)
    if (/[^\x20-\x7e]/.test(target)) {
      console.warn('[container] no ASCII userData path available (Chinese username?):', target)
      return
    }
    if (existsSync(target)) {
      app.setPath('userData', target)
      return
    }
    if (!existsSync(current)) {
      app.setPath('userData', target) // fresh install — nothing to migrate
      return
    }
    try {
      renameSync(current, target)
      app.setPath('userData', target)
    } catch (err) {
      console.error('[container] userData migration to ASCII path failed; keeping current:', err)
    }
  } catch (err) {
    console.error('[container] ensureAsciiUserData error:', err)
  }
}
ensureAsciiUserData()

// Mirror every console call into userData/logs BEFORE anything else logs: a packaged
// app has no stderr, and without this the uncaughtException guard below is write-only.
installFileLogger()

// Main-process strings (window title, tray, dialogs, IPC errors) follow the persisted locale.
// Reading it lazily keeps a mid-session language switch reflected without extra plumbing.
registerLocaleSource(() => getSettings().locale)

// Surfaces that cache translated text rebuild themselves when the language changes.
onLocaleChanged(() => {
  mainWindow?.setTitle(m('app.title'))
  rebuildTrayMenu()
})

/**
 * Resolve the app icon at runtime. `?asset` points inside app.asar, but the
 * installer also unpacks resources/icon.png next to the exe — and on some builds the
 * asar copy is missing (electron-builder files filters). Probing both keeps the
 * taskbar/tray icon from silently coming up empty in a packaged install.
 */
function appIconPath(): string {
  const candidates = [
    icon,
    join(process.resourcesPath || '', 'icon.png'),
    join(app.getAppPath(), 'resources', 'icon.png')
  ].filter(Boolean)
  return candidates.find((p) => existsSync(p)) || icon
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let registry: PageRegistry | null = null
let isQuitting = false

// A throw inside a main-process event callback (e.g. node-pty's internal onData/exit pump,
// which isn't wrapped by an ipcMain.handle try/catch) would otherwise terminate Electron.
// Log and keep the app alive so one bad PTY frame can't take the whole container down.
process.on('uncaughtException', (err) => {
  console.error('[container] uncaught exception:', err)
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
    const resources = dirname(app.getPath('exe')) // <installDir>/resources
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
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
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
      sandbox: false,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

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

  // close button -> hide to tray unless really quitting
  mainWindow.on('close', (e) => {
    if (!isQuitting && getSettings().minimizeToTray) {
      e.preventDefault()
      mainWindow?.hide()
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

function rebuildTrayMenu(): void {
  if (!tray || !registry) return
  const running = registry.running()
  const stopped = registry.list().filter((p) => p.status !== 'running' && !p.external)
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: m('tray.show'), click: showWindow },
    { type: 'separator' },
    ...running.map((p): Electron.MenuItemConstructorOptions => ({
      label: m('tray.stop', { name: p.name }),
      click: () => registry?.stop(p.id)
    })),
    ...stopped.slice(0, 8).map((p): Electron.MenuItemConstructorOptions => ({
      label: m('tray.start', { name: p.name }),
      click: () => {
        registry?.start(p.id).catch((err) => console.warn('[tray] start failed:', err.message))
      }
    })),
    { type: 'separator' },
    {
      label: m('tray.quit'),
      click: () => {
        // Quitting kills every hosted node process — worth one native confirmation,
        // and the tray is the only path that does this without closing a window.
        const running = registry?.running().length ?? 0
        dialog
          .showMessageBox({
            type: 'warning',
            title: m('tray.quitConfirmTitle'),
            message: m('tray.quitConfirm'),
            detail: running ? `Running pages: ${running}` : undefined,
            buttons: [m('tray.quitYes'), m('tray.quitNo')],
            defaultId: 1, // Enter lands on Cancel — quitting is the destructive branch
            cancelId: 1
          })
          .then(({ response }) => {
            if (response !== 0) return
            isQuitting = true
            app.quit()
          })
          .catch(() => undefined)
      }
    }
  ]
  tray.setToolTip(m('tray.tooltip', { n: running.length }))
  tray.setContextMenu(Menu.buildFromTemplate(template))
}

function createTray(): void {
  if (tray) return
  const path = appIconPath()
  const image = existsSync(path) ? nativeImage.createFromPath(path) : nativeImage.createEmpty()
  tray = new Tray(image.isEmpty() ? image : image.resize({ width: 16, height: 16 }))
  tray.on('click', showWindow)
  rebuildTrayMenu()
}

async function verifyNodeRuntime(): Promise<void> {
  const info = await getNodeRuntimeInfo()
  if (!info.ok) {
    const msg = info.version
      ? m('err.nodeVersion', { version: info.version })
      : m('err.nodeMissing')
    console.error(`[container] ${msg}`)
    dialogWarn(msg)
  } else {
    console.log(`[container] bundled node OK: ${info.path} (${info.version})`)
  }
}

function dialogWarn(msg: string): void {
  dialog.showMessageBox({ type: 'warning', title: m('dialog.title'), message: msg }).catch(() => undefined)
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
    setTimeout(() => app.requestSingleInstanceLock(), 1000)
  }
  app.on('second-instance', showWindow)

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.dsh.desktop-container')
    ensureUnpackedForUpdate()
    markBootOk()
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

    await verifyNodeRuntime()

    ensureDefaultOpenclawPage()
    ensureBuiltinPages()
    registry = new PageRegistry({ pagesDir: resolvePagesDir(), projectDir: resolveProjectDir() })
    registerIpc(registry)
    registry.on('changed', rebuildTrayMenu)

    createWindow()
    createTray()

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
  app.on('before-quit', (e) => {
    isQuitting = true
    if (registry && !shutdownDone) {
      shutdownDone = true
      e.preventDefault()
      registry.shutdownAll()
      // give taskkill a moment then finish quitting
      setTimeout(() => {
        shutdownDone = false
        app.exit(0)
      }, 800)
    }
  })
}
