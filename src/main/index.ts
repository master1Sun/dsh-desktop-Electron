import { app, BrowserWindow, dialog, Menu, nativeImage, Tray, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { IPC } from '../shared/types'
import { PageRegistry } from './pages'
import { registerIpc } from './ipc'
import { ensureDefaultOpenclawPage } from './openclaw'
import { getSettings, resolvePagesDir, resolveProjectDir } from './store'
import { getNodeRuntimeInfo } from './node-runtime'
import icon from '../../resources/icon.png?asset'

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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Desktop Container',
    backgroundColor: '#0f1420',
    // frameless: MenuBar doubles as the OS title bar with custom window controls
    frame: false,
    // win + linux read this for the taskbar/window chrome; mac uses build/icon.icns
    icon,
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
    { label: '显示主界面', click: showWindow },
    { type: 'separator' },
    ...running.map((p): Electron.MenuItemConstructorOptions => ({
      label: `停止 ${p.name}`,
      click: () => registry?.stop(p.id)
    })),
    ...stopped.slice(0, 8).map((p): Electron.MenuItemConstructorOptions => ({
      label: `启动 ${p.name}`,
      click: () => {
        registry?.start(p.id).catch((err) => console.warn('[tray] start failed:', err.message))
      }
    })),
    { type: 'separator' },
    {
      label: '退出容器（将停止所有 node 进程）',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ]
  tray.setToolTip(`Desktop Container · ${running.length} 个 page 运行中`)
  tray.setContextMenu(Menu.buildFromTemplate(template))
}

function createTray(): void {
  if (tray) return
  const image = existsSync(icon) ? nativeImage.createFromPath(icon) : nativeImage.createEmpty()
  tray = new Tray(image.isEmpty() ? image : image.resize({ width: 16, height: 16 }))
  tray.on('click', showWindow)
  rebuildTrayMenu()
}

async function verifyNodeRuntime(): Promise<void> {
  const info = await getNodeRuntimeInfo()
  if (!info.ok) {
    const msg = info.version
      ? `内置 Node 版本异常：${info.version}（期望 v24.21.0）`
      : '未找到内置 Node 运行时，请先运行 npm run setup:node'
    console.error(`[container] ${msg}`)
    dialogWarn(msg)
  } else {
    console.log(`[container] bundled node OK: ${info.path} (${info.version})`)
  }
}

function dialogWarn(msg: string): void {
  dialog.showMessageBox({ type: 'warning', title: 'DSH 容器', message: msg }).catch(() => undefined)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.dsh.desktop-container')
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

    await verifyNodeRuntime()

    ensureDefaultOpenclawPage()
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
