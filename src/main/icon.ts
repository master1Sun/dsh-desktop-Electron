import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import icon from '../../resources/icon.png?asset'

/**
 * Resolve the app icon at runtime. `?asset` points inside app.asar, but the
 * installer also unpacks resources/icon.png next to the exe — and on some builds the
 * asar copy is missing (electron-builder files filters). Probing both keeps the
 * taskbar/tray icon from silently coming up empty in a packaged install.
 */
export function appIconPath(): string {
  const candidates = [
    icon,
    join(process.resourcesPath || '', 'icon.png'),
    join(app.getAppPath(), 'resources', 'icon.png')
  ].filter(Boolean)
  return candidates.find((p) => existsSync(p)) || icon
}
