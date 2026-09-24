import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, dialog } from 'electron'
import { getSettings, updateSettings, resolvePagesDir, resolveExportPath, applyNpmRegistryEnv } from '../shell/store'
import { extractZip } from '../update/node-updater'
import { rebuildTrayMenu } from '../shell/tray'
import { m } from '../shell/i18n'
import { isoShanghai } from '../shell/time'
import type { PageRegistry } from './pages'
import type { ContainerSettings, SnapshotResult } from '../../shared/types'

/**
 * #15: config snapshot / migration package.
 *
 * Where the diagnostic bundle (#3) is a read-only report of *what is happening now*, this is a
 * round-trippable archive of *how the machine is configured* — the persisted settings plus every
 * hosted page's `container.json`. On a fresh install "import migration package" drops the same
 * config back in so ports, env dirs, autostart and per-page manifests are restored without the
 * user re-doing them. It deliberately does NOT ship project source (that lives in the user's own
 * repos / the pages they re-import); it moves the container's configuration layer only.
 *
 * Shape of the archive:
 *   manifest.json  { appVersion, createdAt, settings, pages:[{ id, name, kind, containerJson }] }
 *   container/<id>.json  (a convenience copy so the package is human-inspectable)
 */

interface SnapshotManifest {
  appVersion: string
  createdAt: number
  settings: Partial<ContainerSettings>
  pages: { id: string; name: string; kind?: string; containerJson: unknown }[]
}

/** Settings keys worth migrating — everything except volatile / machine-local runtime state. */
function captureSettings(): Partial<ContainerSettings> {
  const s = getSettings()
  return {
    defaultView: s.defaultView,
    openExternalIn: s.openExternalIn,
    minimizeToTray: s.minimizeToTray,
    autoStartPages: s.autoStartPages,
    autoStartManual: s.autoStartManual,
    externalSites: s.externalSites,
    theme: s.theme,
    locale: s.locale,
    envRoot: s.envRoot,
    dshHome: s.dshHome,
    openclawHome: s.openclawHome,
    downloadDir: s.downloadDir,
    pageEnvs: s.pageEnvs,
    pageCustomEnvs: s.pageCustomEnvs,
    pagePorts: s.pagePorts,
    pageDeps: s.pageDeps,
    crashAutoRestart: s.crashAutoRestart,
    systemNotifications: s.systemNotifications,
    accentColor: s.accentColor,
    glassBlur: s.glassBlur,
    glassAlpha: s.glassAlpha,
    memWarnMb: s.memWarnMb,
    memLimitAction: s.memLimitAction,
    terminalHeight: s.terminalHeight,
    // #26: preferences (the remembered `windowBounds` stays out on purpose — it is machine-local).
    rememberWindowBounds: s.rememberWindowBounds,
    reduceMotion: s.reduceMotion,
    npmRegistry: s.npmRegistry,
    trayPageEntries: s.trayPageEntries,
    trayBadge: s.trayBadge,
    // Update channels and rebound shortcuts are intent, not machine state, so they migrate too.
    dshChannel: s.dshChannel,
    containerChannel: s.containerChannel,
    keybindings: s.keybindings
  }
}

/**
 * Compress-Archive via -EncodedCommand — identical rationale to diagnostics.ts: a plain
 * `-Command` with a possibly non-ASCII path arrives at PowerShell in the OEM codepage and
 * silently mangles it; base64 UTF-16LE sidesteps the whole codepage trap.
 *
 * NOTE: `-LiteralPath 'src\*'` is a trap — the literal parameter never expands the `*`, so
 * Compress-Archive matches nothing and emits *no archive* while still exiting 0. We enumerate
 * the folder's real children and pass those literal paths instead: correct zip layout (files at
 * the archive root) that also survives a temp dir name carrying wildcard chars like `[` or `]`.
 */
function zipFolder(src: string, dest: string): Promise<void> {
  const srcLit = src.replace(/'/g, "''")
  const destLit = dest.replace(/'/g, "''")
  const ps =
    `$items = Get-ChildItem -LiteralPath '${srcLit}' | ForEach-Object { $_.FullName }; ` +
    `Compress-Archive -LiteralPath $items -DestinationPath '${destLit}' -Force -ErrorAction Stop`
  const encoded = Buffer.from(ps, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      {
        windowsHide: true,
        timeout: 60_000
      }
    )
    let err = ''
    child.stderr?.on('data', (d) => (err += String(d)))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`Compress-Archive failed (${code}): ${err.trim()}`))
      // Belt and braces: never proceed on a silent no-op — the caller copies this file next.
      if (!existsSync(dest)) return reject(new Error('Compress-Archive produced no archive'))
      resolve()
    })
  })
}

/**
 * Build the migration package and save it into the configured 下载目录 (the same folder webview
 * downloads use, collision-safe — no "Save As" prompt). Resolves the saved zip (with the captured
 * page ids). Throws only if staging fails.
 */
export async function exportSnapshot(registry: PageRegistry): Promise<SnapshotResult | null> {
  const pages = registry
    .list()
    .filter((p) => !p.external)
    .map((p) => {
      let containerJson: unknown = null
      try {
        const f = join(p.dir, 'container.json')
        if (existsSync(f)) containerJson = JSON.parse(readFileSync(f, 'utf-8'))
      } catch {
        containerJson = null
      }
      return { id: p.id, name: p.name, kind: p.kind, containerJson }
    })
    .filter((p) => p.containerJson !== null)

  if (pages.length === 0) throw new Error(m('snapshot.noPages'))

  const createdAt = Date.now()
  const ts = isoShanghai(new Date(createdAt)).replace(/[:.]/g, '-').slice(0, 19)
  const manifest: SnapshotManifest = {
    appVersion: app.getVersion(),
    createdAt,
    settings: captureSettings(),
    pages
  }

  const stage = join(app.getPath('temp'), `dsh-snapshot-${ts}`)
  const containerDir = join(stage, 'container')
  mkdirSync(containerDir, { recursive: true })
  try {
    writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
    for (const p of pages) {
      writeFileSync(
        join(containerDir, `${p.id}.json`),
        JSON.stringify(p.containerJson, null, 2),
        'utf8'
      )
    }
    const zipPath = join(app.getPath('temp'), `dsh-snapshot-${ts}.zip`)
    await zipFolder(stage, zipPath)

    // Drop into the configured 下载目录 instead of prompting, matching webview downloads.
    const filePath = resolveExportPath(`dsh-snapshot-${ts}.zip`)
    const { promises: fsp } = await import('node:fs')
    await fsp.copyFile(zipPath, filePath)
    return { path: filePath, pageIds: pages.map((p) => p.id), createdAt }
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

/**
 * Restore config from a user-chosen migration package: apply the settings layer, then drop each
 * captured `container.json` back under `<pagesDir>/<id>/` (creating the folder so the page
 * reappears in the list). Running pages are left untouched; a rescan adopts the new manifests.
 */
export async function importSnapshot(registry: PageRegistry): Promise<SnapshotResult> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: m('snapshot.importTitle'),
    properties: ['openFile'],
    filters: [{ name: m('snapshot.zipFilter'), extensions: ['zip'] }]
  })
  if (canceled || !filePaths[0]) throw new Error(m('snapshot.badArchive'))

  const zip = filePaths[0]
  const ts = isoShanghai().replace(/[:.]/g, '-').slice(0, 19)
  const extractTo = join(app.getPath('temp'), `dsh-snapshot-in-${ts}`)
  mkdirSync(extractTo, { recursive: true })
  try {
    await extractZip(zip, extractTo)
    const manifestFile = join(extractTo, 'manifest.json')
    if (!existsSync(manifestFile)) throw new Error(m('snapshot.badArchive'))
    let manifest: SnapshotManifest
    try {
      manifest = JSON.parse(readFileSync(manifestFile, 'utf-8'))
    } catch {
      throw new Error(m('snapshot.badArchive'))
    }

    // 1) settings layer — merge the migrated keys over the current store.
    if (manifest.settings && typeof manifest.settings === 'object') {
      // Bring the archived auto-start lists verbatim; the pin diff is for live user toggles only.
      updateSettings(manifest.settings, { syncAutoStartPin: false })
      // #26: a restored 镜像源 has to reach process.env too, or this run keeps using the old one.
      applyNpmRegistryEnv()
      // …and the tray menu/badge, which are rendered from trayPageEntries / trayBadge.
      rebuildTrayMenu()
    }

    // 2) per-page container.json under the live pages dir.
    const pagesDir = resolvePagesDir()
    mkdirSync(pagesDir, { recursive: true })
    const restored: string[] = []
    for (const p of manifest.pages ?? []) {
      if (!p?.id || p.containerJson == null) continue
      const safeId = String(p.id).replace(/[^\w.-]/g, '')
      if (!safeId) continue
      const dir = join(pagesDir, safeId)
      try {
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'container.json'), JSON.stringify(p.containerJson, null, 2), 'utf8')
        restored.push(safeId)
      } catch {
        /* a single unwritable page dir shouldn't abort the whole import */
      }
    }

    registry.reconcile()
    registry.emitChanged()
    return {
      path: zip,
      pageIds: restored,
      createdAt: manifest.createdAt ?? Date.now(),
      restoredPages: restored,
      appliedSettings: !!manifest.settings
    }
  } finally {
    rmSync(extractTo, { recursive: true, force: true })
  }
}
