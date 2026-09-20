// Bootstrapper: the packaged entry point. Electron resolves `main` from inside
// app.asar, so this file is the only piece that can redirect the app to an updated
// asar BEFORE any application code loads. In dev (`npm run dev`) electron-vite points
// at out/main/index.js directly and this file never runs — hence the no-op require.
//
// The boot-ok marker lives in userData (NOT next to the exe): a NSIS reinstall wipes
// resources/ including our updates dir, while userData survives — after such a reinstall
// the stale marker must not let a broken update be retried forever.
const fs = require('node:fs')
const path = require('node:path')

function appDataDir() {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  return process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Desktop Container')
    : process.platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support', 'Desktop Container')
      : path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Desktop Container')
}

const APP_DIR = path.dirname(__dirname) // <...>/resources when packaged (app.asar + app.asar.unpacked)
const UPDATES_DIR = path.join(APP_DIR, 'updates')
const META_FILE = path.join(UPDATES_DIR, 'update-meta.json')
const MARKER_FILE = path.join(appDataDir(), 'dsh-boot-ok-marker')

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

function resolveTargetApp(meta) {
  if (!meta || !meta.pendingAsar) return null
  const pending = path.join(UPDATES_DIR, meta.pendingAsar)
  try {
    if (fs.statSync(pending).size < 1024 * 1024) return null // a truncated download must never boot
    return pending
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
  try {
    return fs.readFileSync(MARKER_FILE, 'utf-8').trim() === path.join(UPDATES_DIR, currentAsar)
  } catch {
    return false
  }
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
    promote(meta)
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
  promote(meta)
  require('node:child_process')
    .spawn(process.execPath, [...process.argv.slice(1), '--app-path=' + target, '--dsh-asar-launched'], {
      detached: true,
      stdio: 'ignore'
    })
    .unref()
  app.exit(0)
}

main()
