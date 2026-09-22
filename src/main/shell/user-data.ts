import { app } from 'electron'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { isoShanghai } from './time'

// Written into the ASCII folder right after a successful rename so support can tell a
// migrated install from a fresh one at a glance (provenance trail, nothing reads it).
const MIGRATION_MARKER = '.ascii-userdata-migrated'

/**
 * Copy entries that `dst` is missing from `src`, recursively, never overwriting.
 *
 * Deliberately hand-rolled on readdirSync/copyFileSync: `fs.cpSync(current, target,
 * { recursive: true, force: false })` was the obvious one-liner here, but it HARD-CRASHES
 * the whole process (un catchable, zero output, node exits mid-call) against the real
 * %APPDATA% trees on this platform — and running at module-load time that killed every
 * launch, dev included. The plain per-file path never reproduced it. Symlinks/reparse
 * points are skipped: half of a link's data is worse than no merge.
 */
function copyMissing(src: string, dst: string): number {
  let copied = 0
  const walk = (s: string, d: string): void => {
    for (const ent of readdirSync(s, { withFileTypes: true })) {
      const sp = join(s, ent.name)
      const dp = join(d, ent.name)
      if (ent.isDirectory()) {
        if (!existsSync(dp)) mkdirSync(dp)
        walk(sp, dp)
      } else if (ent.isFile() && !existsSync(dp)) {
        copyFileSync(sp, dp)
        copied++
      }
    }
  }
  walk(src, dst)
  return copied
}

/**
 * The packaged `productName` is Chinese (桌面控制台), so Electron's default userData folder is
 * `%APPDATA%\桌面控制台`. A non-ASCII install path breaks the PowerShell Expand-Archive call in
 * the bundled-Node updater (the mangled `-Command` string can hang it at 0%) and trips other
 * native / git tooling the container shells out to. Pin userData — and therefore every install
 * path (pages, env root, node-update staging) — to an ASCII folder BEFORE any path-dependent
 * init runs (logger, electron-store, node override). The Chinese name stays everywhere it is
 * user-visible (window title, shortcuts); existing data is renamed across so settings survive.
 */
export function ensureAsciiUserData(): void {
  const asciiLeaf = 'DesktopContainer'
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
      // The usual post-migration start: only the ASCII folder exists — pin it. But if BOTH
      // exist, a previous rename died half-way (AV/OneDrive lock after a partial move), and
      // blindly pinning target would silently strand settings that only live under the
      // Chinese path. Merge files that target is missing — never overwrite, so the newer
      // data already in target always wins — before pinning.
      if (existsSync(current)) {
        try {
          const n = copyMissing(current, target)
          console.warn(
            `[container] both userData folders existed; merged ${n} file(s) from the Chinese path into ASCII (no overwrite)`
          )
        } catch (err) {
          console.warn('[container] userData merge incomplete (continuing with ASCII):', err)
        }
      }
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
      try {
        writeFileSync(join(target, MIGRATION_MARKER), `migrated from ${current} at ${isoShanghai()}`)
      } catch {
        /* provenance only — never worth failing the boot over */
      }
    } catch (err) {
      console.error('[container] userData migration to ASCII path failed; keeping current:', err)
    }
  } catch (err) {
    console.error('[container] ensureAsciiUserData error:', err)
  }
}
