import { app, BrowserWindow, dialog, Menu, nativeImage, Tray, shell } from 'electron'
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { IPC } from '../shared/types'
import { PageRegistry } from './pages'
import { registerIpc } from './ipc'
import { ensureDefaultOpenclawPage, ensureBuiltinPages } from './openclaw'
import { getSettings, resolvePagesDir, resolveProjectDir } from './store'
import { getNodeRuntimeInfo } from './node-runtime'
import { m, onLocaleChanged, registerLocaleSource } from './i18n'
import icon from '../../resources/icon.png?asset'

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
        isQuitting = true
        app.quit()
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
