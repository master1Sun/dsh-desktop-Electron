// Bootstrapper: the packaged entry point. Electron resolves `main` from inside
// app.asar, so this file is the only piece that can redirect the app to an updated
// asar BEFORE any application code loads. In dev (`npm run dev`) electron-vite points
// at out/main/index.js directly and this file never runs — hence the no-op require.
//
// The marker lives in userData (NOT next to the exe): a NSIS reinstall wipes
// resources/ including our updates dir, while userData survives — after such a reinstall
// the stale marker must not let a broken update be retried forever.
// NOTE: main/index.ts ensureAsciiUserData() pins userData to the ASCII leaf
// 'dsh-desktop-container' (the Chinese name broke PowerShell/git tooling), so the
// *current* marker path is ASCII; '桌面控制台' stays in the candidate list only as a
// legacy fallback for machines migrated before a marker was ever written there.
const fs = require('node:fs')
const path = require('node:path')

function appDataDirs() {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  const leaves = ['dsh-desktop-container', '桌面控制台']
  const base =
    process.platform === 'win32'
      ? process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
      : process.platform === 'darwin'
        ? path.join(home, 'Library', 'Application Support')
        : process.env.XDG_CONFIG_HOME || path.join(home, '.config')
  return leaves.map((leaf) => path.join(base, leaf))
}

const APP_DIR = __dirname // <installDir>/resources when packaged (boot.cjs + app.asar live side by side)
const UPDATES_DIR = path.join(APP_DIR, 'updates')
const META_FILE = path.join(UPDATES_DIR, 'update-meta.json')
const MARKER_FILES = appDataDirs().map((dir) => path.join(dir, 'dsh-boot-ok-marker'))

function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'))
  } catch {
    return null
  }
}

function writeMeta(meta) {
  try {
    fs.mkdirSync(UPDATES_DIR, { recursive: true })
    fs.writeFileSync(META_FILE, JSON.stringify(meta))
  } catch (err) {
    console.error('[boot] cannot write update-meta.json:', err.message)
  }
}

/**
 * The asar to boot: a freshly downloaded pending one, otherwise the last promoted current one.
 * Falling back to currentAsar is what makes an applied update persist across later launches —
 * without it every boot after the first silently reverted to the bundled old asar.
 */
function resolveTargetApp(meta) {
  if (!meta) return null
  const name = meta.pendingAsar || meta.currentAsar
  if (!name) return null
  const target = path.join(UPDATES_DIR, name)
  try {
    if (fs.statSync(target).size < 1024 * 1024) return null // a truncated download must never boot
    return target
  } catch {
    return null
  }
}

/** Promote pending → current in the meta; the superseded asar file stays on disk for rollback. */
function promote(meta) {
  writeMeta({ ...meta, currentAsar: meta.pendingAsar, pendingAsar: null })
  return { ...meta, currentAsar: meta.pendingAsar, pendingAsar: null }
}

function loadIndex(dir) {
  // dir may be an .asar file or a directory; Electron's patched fs reads either.
  require(path.join(dir, 'out', 'main', 'index.js'))
}

/**
 * Roll back to the bundled app.asar. The previous version is normally the bundled one
 * (each installer ships fresh), so "broken" always means: stop loading updates, keep
 * the record for diagnostics.
 */
function rollBack(meta) {
  writeMeta({ ...meta, pendingAsar: null, broken: true, failedVersion: meta.currentAsar || null })
  console.error('[boot] updated app failed to start; rolled back to the bundled version')
}

/** True when a previous boot from this exact asar reached app.whenReady at least once. */
function markerMatches(currentAsar) {
  if (!currentAsar) return false
  const target = path.join(UPDATES_DIR, currentAsar)
  // Any candidate location holding the expected path counts — see appDataDirs().
  return MARKER_FILES.some((file) => {
    try {
      return fs.readFileSync(file, 'utf-8').trim() === target
    } catch {
      return false
    }
  })
}

/**
 * Crash guard: an update that booted but never confirmed healthy (marker missing or
 * stale). The first such launch is assumed to have died after ready — relaunch so it
 * gets another chance; a second consecutive failure marks the update broken and boots
 * the bundled app.asar. The marker written by index.ts makes this decision idempotent.
 */
function retryOrExit(meta) {
  if (process.argv.includes('--dsh-boot-retry')) {
    rollBack(meta)
    loadIndex(APP_DIR)
    return
  }
  require('node:child_process')
    .spawn(process.execPath, [...process.argv.slice(1), '--dsh-boot-retry'], {
      detached: true,
      stdio: 'ignore'
    })
    .unref()
  require('electron').app.exit(0)
}

function main() {
  const meta = readMeta()
  if (meta && meta.currentAsar && !meta.broken && !markerMatches(meta.currentAsar)) {
    retryOrExit(meta)
    return
  }
  const target = resolveTargetApp(meta)
  if (!target) {
    loadIndex(APP_DIR)
    return
  }
  if (meta.broken) {
    // A previous switch crashed before confirming — do not retry it, boot bundled.
    loadIndex(APP_DIR)
    return
  }
  const major = Number(process.versions.electron.split('.')[0])
  const { app } = require('electron')
  if (major >= 30 && typeof app.setAppPath === 'function') {
    // Electron ≥30: official in-process override; app.getAppPath() then reports the new asar.
    app.setAppPath(target)
    // Only a fresh pending advances current; loading the existing current is a no-op, and an
    // unconditional promote here would clear currentAsar (pendingAsar is null) and undo the update.
    if (meta.pendingAsar) promote(meta)
    loadIndex(target)
    return
  }
  // Older Electron fallback: relaunch once with --app-path. If the relaunched process
  // still lands here with the same pending file, the switch did not stick → broken.
  if (process.argv.includes('--dsh-asar-launched')) {
    rollBack(meta)
    loadIndex(APP_DIR)
    return
  }
  if (meta.pendingAsar) promote(meta)
  require('node:child_process')
    .spawn(process.execPath, [...process.argv.slice(1), '--app-path=' + target, '--dsh-asar-launched'], {
      detached: true,
      stdio: 'ignore'
    })
    .unref()
  app.exit(0)
}

main()
