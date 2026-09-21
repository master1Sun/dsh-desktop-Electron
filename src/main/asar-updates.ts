import { spawn, spawnSync } from 'node:child_process'
import * as nodeFs from 'node:fs'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import {
  CONTAINER_REPO_URL,
  type UpdateProgress,
  type UpdateCheckResult,
  type UpdateOutcome
} from '../shared/types'
import { m } from './i18n'
import { isNewer } from './update-service'
import { extractZip } from './node-updater'
import { notifyEvent } from './notifications'

/**
 * Electron patches `fs` so every path carrying a `.asar` segment is routed through its archive
 * reader: statSync() on a REAL on-disk app.asar then reports the archive root (size 0, isFile
 * false). Verified in-probe: patched fs said size=0/isFile=false for a 129 MB file while
 * `original-fs` said 129173541/isFile=true. Every size verification of a staged asar therefore
 * has to go through original-fs, or the post-extract check aborts every perfectly good update
 * ("解压后未找到有效的 app.asar") and readStagedUpdate never recognises a staged download.
 * Under vitest (plain node) original-fs does not exist and node:fs is unpatched already.
 */
const ofs: typeof nodeFs = (() => {
  try {
    // original-fs has no ESM/type export and must bypass Electron's patched fs at runtime, so
    // a plain `require` is the only correct way in.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (typeof require === 'function') return require('original-fs') as typeof nodeFs
  } catch {
    /* plain node: nothing to bypass */
  }
  return nodeFs
})()

/**
 * Over-the-air asar updates. The publisher (scripts/publish-update.mjs) commits the
 * electron-builder artifacts (app.asar + the asarUnpack'd app.asar.unpacked native tree) as a
 * single app.zip, plus version.txt, to an orphan `release` branch; a packaged client fetches that
 * branch with its own git credentials, extracts the zip into
 * <installDir>/resources/updates/<commit>/ (yielding a literal `app.asar` and its sibling
 * `app.asar.unpacked`), and {@link relaunchToApplyStaged} copies it over `resources/` via a detached
 * helper when the app relaunches. Each release lives in
 * its own commit folder, so Electron's sibling `app.asar.unpacked` convention stays valid and a
 * newer update can stage a different file rather than overwrite the running (Windows-locked) asar.
 *
 * The artifact is large, so the download is streamed and reports progress rather than
 * slurping a 512 MB buffer through a blocking `spawnSync` (which froze the whole main
 * process). Extraction writes to a `.part` file that survives an interrupted attempt: a later
 * run resumes from its current size instead of rewriting from zero (断点续传), and only
 * renames onto `app.asar` once the byte count matches — so boot.cjs can never pick up a
 * truncated file.
 */

const RELEASE_BRANCH = 'release'

/** Progress is byte-accurate; throttle IPC emissions so a fast local disk doesn't flood it. */
const PROGRESS_INTERVAL_MS = 150

/** Same floor boot.cjs uses: anything smaller is a truncated download, never a bootable update. */
const MIN_ASAR_BYTES = 1024 * 1024

export interface StagedAsarUpdate {
  version: string
  commit: string
}

/**
 * Read update-meta.json and report a fully-staged (downloaded, size-verified) asar that
 * boot.cjs has not swapped in yet. When the pending file was deleted or truncated since
 * the meta was written, the stale pendingAsar entry is cleared so the row falls back to
 * a normal "有更新可下载" state instead of offering a restart into nothing.
 */
export function readStagedUpdate(): StagedAsarUpdate | null {
  const metaFile = join(updatesRoot(), 'update-meta.json')
  let meta: {
    pendingAsar?: string | null
    currentAsar?: string | null
    version?: string
    commit?: string
    broken?: boolean
  } | null = null
  try {
    meta = JSON.parse(readFileSync(metaFile, 'utf-8'))
  } catch {
    return null
  }
  if (!meta?.pendingAsar || meta.broken) return null
  const pending = join(updatesRoot(), meta.pendingAsar)
  let size = 0
  try {
    // original-fs: the patched fs would report the archive root (size 0) for a *.asar path.
    size = ofs.statSync(pending).size
  } catch {
    size = 0
  }
  if (size >= MIN_ASAR_BYTES) return { version: meta.version || '', commit: meta.commit || '' }
  try {
    writeFileSync(metaFile, JSON.stringify({ ...meta, pendingAsar: null }))
  } catch {
    /* best-effort; next check just repeats the detection */
  }
  return null
}

/**
 * Drop a pending asar record. boot.cjs boots `pendingAsar || currentAsar` unconditionally, so a
 * pending entry that is NOT newer than the running version would silently DOWNGRADE the app on
 * the next launch (e.g. local 0.1.5 with a leftover 0.1.4 download). Clearing it both stops the
 * downgrade and lets the OTA row fall back to a plain "已是最新" state.
 */
export function clearStagedUpdate(): void {
  const metaFile = join(updatesRoot(), 'update-meta.json')
  try {
    const meta = JSON.parse(readFileSync(metaFile, 'utf-8'))
    writeFileSync(metaFile, JSON.stringify({ ...meta, pendingAsar: null }))
  } catch {
    /* no meta / unreadable: nothing staged to clear */
  }
}

export type ProgressCb = (p: UpdateProgress) => void

export function updatesRoot(): string {
  // Same directory boot.cjs reads (relative to the exe): resources/ when packaged.
  return join(dirname(app.getPath('exe')), 'resources', 'updates')
}

function gitDir(): string {
  return join(updatesRoot(), 'release.git')
}

function runGit(args: string[]): string {
  const res = spawnSync('git', args, { encoding: 'utf-8', windowsHide: true })
  if (res.status !== 0)
    throw new Error((res.stderr || res.stdout || `git ${args[0]} failed`).trim())
  return res.stdout
}

/** Async `git` that resolves stdout — never blocks the event loop the way spawnSync did. */
function runGitAsync(args: string[], onStderr?: (chunk: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += String(d)))
    child.stderr.on('data', (d) => {
      const s = String(d)
      stderr += s
      onStderr?.(s)
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error((stderr || stdout || `git ${args[0]} failed`).trim()))
    )
  })
}

interface ReleaseTip {
  version: string
  commit: string
}

function ensureRepo(): void {
  if (!existsSync(join(gitDir(), 'HEAD'))) {
    mkdirSync(dirname(gitDir()), { recursive: true })
    runGit(['init', '--bare', gitDir()])
    runGit(['--git-dir', gitDir(), 'remote', 'add', 'origin', CONTAINER_REPO_URL])
  }
}

/** git's progress lines look like `Receiving objects:  42% (…)`; reuse the last percentage. */
function parseGitPercent(chunk: string): number | null {
  let last: number | null = null
  for (const hit of chunk.matchAll(/(\d+)%/g)) last = Number(hit[1])
  return last
}

async function fetchTip(name: string, onProgress?: ProgressCb): Promise<ReleaseTip> {
  ensureRepo()
  await runGitAsync(
    ['--git-dir', gitDir(), 'fetch', '--progress', '--depth', '1', 'origin', RELEASE_BRANCH],
    (chunk) => {
      if (!onProgress) return
      const percent = parseGitPercent(chunk) ?? undefined
      onProgress({
        name,
        phase: 'fetch',
        percent,
        message: m('git.asarFetching', { percent: percent === undefined ? '' : ` ${percent}%` })
      })
    }
  )
  const commit = runGit(['--git-dir', gitDir(), 'rev-parse', 'FETCH_HEAD']).trim()
  const version = runGit(['--git-dir', gitDir(), 'show', `${commit}:version.txt`])
    .split(/\r?\n/)[0]
    .trim()
  return { version, commit }
}

/**
 * Stream `git cat-file blob <rev>` into `partPath`. When `resumeFrom` > 0 the first that
 * many bytes are discarded from the stream and the file is opened in append mode, so an
 * interrupted download continues where it stopped. `received`/`total` drive the progress cb.
 */
async function streamBlob(
  rev: string,
  partPath: string,
  resumeFrom: number,
  total: number,
  name: string,
  resumed: boolean,
  onProgress?: ProgressCb
): Promise<void> {
  const child = spawn('git', ['--git-dir', gitDir(), 'cat-file', 'blob', rev], {
    windowsHide: true
  })
  let stderr = ''
  child.stderr.on('data', (d) => (stderr += String(d)))

  let toSkip = resumeFrom
  let written = resumeFrom
  let lastEmit = 0
  const emit = (force = false): void => {
    const now = Date.now()
    if (!onProgress || (!force && now - lastEmit < PROGRESS_INTERVAL_MS)) return
    lastEmit = now
    const received = Math.min(written, total)
    const percent = total > 0 ? Math.floor((received / total) * 100) : 0
    onProgress({
      name,
      phase: 'extract',
      received,
      total,
      percent,
      resumed,
      message: m(resumed ? 'git.asarResuming' : 'git.asarExtracting', {
        percent: `${percent}%`
      })
    })
  }
  const gate = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      let data: Buffer = chunk
      if (toSkip > 0) {
        if (data.length <= toSkip) {
          toSkip -= data.length
          return cb()
        }
        data = data.subarray(toSkip)
        toSkip = 0
      }
      written += data.length
      emit()
      cb(null, data)
    }
  })
  const out = createWriteStream(partPath, { flags: resumeFrom > 0 ? 'a' : 'w' })
  // Resolve the exit code from listeners attached *before* draining stdout. `close` only
  // fires once every stdio pipe is fully closed, which has proven unreliable inside the
  // Electron main process (the download would stall at ~99% waiting on it); `exit` fires
  // as soon as the process terminates and is guaranteed. Whichever comes first settles it,
  // and byte-integrity is still verified by the size check in downloadAsar.
  const closed = new Promise<number>((resolve) => {
    let settled = false
    const settle = (code: number): void => {
      if (settled) return
      settled = true
      resolve(code)
    }
    child.on('close', (code) => settle(code ?? -1))
    child.on('exit', (code) => settle(code ?? -1))
    child.on('error', (err) => {
      stderr = err.message
      settle(-1)
    })
  })
  try {
    await pipeline(child.stdout, gate, out)
    const code = await closed
    if (code !== 0) throw new Error((stderr || `git cat-file failed (code ${code})`).trim())
    emit(true)
  } catch (err) {
    child.kill()
    out.destroy()
    throw err
  }
}

/** Best-effort sweep of superseded release folders, keeping the commit-named ones in `keep`. */
function pruneOldReleases(root: string, keep: Set<string>): void {
  try {
    for (const f of readdirSync(root)) {
      if (f === 'release.git' || keep.has(f)) continue
      const p = join(root, f)
      try {
        if (!statSync(p).isDirectory()) continue
      } catch {
        continue
      }
      try {
        rmSync(p, { recursive: true, force: true })
      } catch {
        /* running / Windows-locked — retried on the next successful update */
      }
    }
  } catch {
    /* best-effort cleanup */
  }
}

/** Extract app.asar of the tip commit into updates/<commit>/app.asar, staged as pending. */
async function downloadAsar(tip: ReleaseTip, name: string, onProgress?: ProgressCb): Promise<void> {
  const root = updatesRoot()
  mkdirSync(root, { recursive: true })
  const rev = `${tip.commit}:app.zip`
  const total = Number(runGit(['--git-dir', gitDir(), 'cat-file', '-s', rev]).trim())
  if (!Number.isFinite(total) || total <= 0) throw new Error(m('git.asarSizeUnknown'))

  // One folder per release; the partial lives inside it, so a stale partial from a different
  // release is never resumed into and a running asar is never overwritten in place.
  const dir = join(root, tip.commit)
  mkdirSync(dir, { recursive: true })
  const part = join(dir, 'app.zip.part')

  let resumeFrom = 0
  if (existsSync(part)) {
    const size = statSync(part).size
    if (size > 0 && size < total) resumeFrom = size
    else rmSync(part, { force: true }) // >= total is a corrupt/complete leftover: restart clean
  }

  await streamBlob(rev, part, resumeFrom, total, name, resumeFrom > 0, onProgress)

  if (statSync(part).size !== total)
    throw new Error(m('git.asarSizeMismatch', { want: total, got: statSync(part).size }))

  const zipPath = join(dir, 'app.zip')
  rmSync(zipPath, { force: true }) // same-commit re-download: replace the prior copy
  // Rename-after-complete: a half-written file can never be picked up as the pending update.
  renameSync(part, zipPath)

  // Unpack the release into <commit>/: this places app.asar *and* app.asar.unpacked (node-pty's
  // native binaries). It is the step that actually materialises app.asar, so a crash before it
  // leaves only the .zip on disk and boot.cjs can never see a half-extracted asar.
  onProgress?.({ name, phase: 'extract', percent: 100, message: m('git.zipUnpacking') })
  // Out-of-process Expand-Archive instead of in-process extract-zip: the yauzl/fd-slicer reader
  // was observed wedging forever on the packaged app (one DEP0005 warning, then silence — no
  // error, no files, the IPC handler never replied). A child PowerShell keeps the ~50 MB unpack
  // off the main event loop and its execFile timeout backstops a wedged shell.
  console.log(`[update] extracting ${zipPath} -> ${dir}`)
  await extractZip(zipPath, dir)
  console.log(`[update] extract finished: ${dir}`)
  const stagedAsar = join(dir, 'app.asar')
  // original-fs again: the patched fs stats a real app.asar as the archive root (size 0).
  if (!ofs.existsSync(stagedAsar) || ofs.statSync(stagedAsar).size < MIN_ASAR_BYTES)
    throw new Error(m('git.asarExtractFailed'))

  // Preserve the running currentAsar as a rollback record and clear any stale broken flag while
  // staging the new artifact under its commit-relative path (boot.cjs joins this onto updates/).
  const metaFile = join(root, 'update-meta.json')
  let prev: { currentAsar?: string | null } = {}
  try {
    prev = JSON.parse(readFileSync(metaFile, 'utf-8'))
  } catch {
    /* first update — nothing to preserve */
  }
  writeFileSync(
    metaFile,
    JSON.stringify({
      ...prev,
      broken: false,
      pendingAsar: join(tip.commit, 'app.asar'),
      version: tip.version,
      commit: tip.commit
    })
  )
  // Sweep older release folders we no longer reference; never touch the running/current one.
  const keep = new Set<string>([tip.commit])
  if (prev.currentAsar) keep.add(String(prev.currentAsar).split(/[\\/]/)[0])
  pruneOldReleases(root, keep)
  // A staged update sits idle until the user restarts — which a tray-resident app
  // never notices. Ping the notification center once the artifact is on disk.
  notifyEvent('notify.updateReadyTitle', 'notify.updateReadyBody', { version: tip.version })
  onProgress?.({ name, phase: 'done', received: total, total, percent: 100 })
}

/** The OTA row for the packaged container: compare release-branch version vs the running one. */
export async function checkAsarUpdate(name: string, dir: string): Promise<UpdateCheckResult> {
  const base: UpdateCheckResult = {
    name,
    dir,
    isContainer: true,
    ok: false,
    source: 'git',
    action: 'apply-asar',
    canAutoUpdate: true
  }
  try {
    const current = app.getVersion()
    // A completed download that no restart has consumed yet: surface "立即重启" and skip
    // the network round-trip entirely — unless the staged version is behind the tip, in
    // which case the fetch below re-points the row at the newer download.
    let staged = readStagedUpdate()
    if (staged && !isNewer(current, staged.version)) {
      // Staged but NOT newer than what's running (a leftover download of an older release,
      // or one already applied): offering a restart here would downgrade the app, so drop
      // the pending entry and let the row read as up-to-date instead.
      clearStagedUpdate()
      staged = null
    }
    if (staged) {
      const rb = canRollbackAsar()
      return {
        ...base,
        ok: true,
        branch: RELEASE_BRANCH,
        localHead: current,
        remoteHead: staged.commit.slice(0, 8),
        currentVersion: current,
        latestVersion: staged.version,
        hasUpdate: false,
        pendingRestart: true,
        canRollback: rb.available,
        rollbackVersion: rb.fromVersion
      }
    }
    const tip = await fetchTip(name)
    const rb = canRollbackAsar()
    return {
      ...base,
      ok: true,
      branch: RELEASE_BRANCH,
      localHead: current,
      remoteHead: tip.commit.slice(0, 8),
      currentVersion: current,
      latestVersion: tip.version,
      // local ahead of the release branch (e.g. a locally-built 0.1.5 vs server 0.1.4) is
      // simply up-to-date: hasUpdate stays false and no action is offered.
      hasUpdate: isNewer(current, tip.version),
      pendingRestart: false,
      canRollback: rb.available,
      rollbackVersion: rb.fromVersion
    }
  } catch (err) {
    return { ...base, error: (err as Error).message }
  }
}

export async function applyAsarUpdate(
  name: string,
  onProgress?: ProgressCb
): Promise<UpdateOutcome> {
  try {
    const tip = await fetchTip(name, onProgress)
    console.log(`[update] ${name}: release tip ${tip.version} (${tip.commit.slice(0, 8)})`)
    await downloadAsar(tip, name, onProgress)
    console.log(`[update] ${name}: staged ${tip.version}, restart to apply`)
    return {
      name,
      ok: true,
      updated: true,
      message: m('git.asarDownloaded', { version: tip.version })
    }
  } catch (err) {
    console.error(`[update] ${name}: apply failed:`, err)
    return { name, ok: false, updated: false, error: (err as Error).message }
  }
}

/** Escape a value for single-quoted PowerShell string literals ('' doubles the quote). */
function psStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

/**
 * Swap a fully-staged asar into `resources/` the instant this process exits, then relaunch — the
 * packaged update path, replacing the old boot.cjs "swap on next launch" hook.
 *
 * Two facts force this shape: (1) Windows locks the running `app.asar` and its `app.asar.unpacked`
 * natives, so the copy cannot happen in-process; it has to run after we quit. (2) boot.cjs is not
 * actually on the launch path — the packaged `main` resolves to `out/main/index.js` INSIDE app.asar
 * — which is why staged downloads used to sit in `updates/<commit>` forever and never take effect.
 * So we hand the swap to a detached PowerShell: wait for this PID to disappear, copy the staged
 * `app.asar` (backing up the current one) and mirror its `app.asar.unpacked` over `resources/`,
 * clear the pending marker, then relaunch the exe with `--dsh-relaunched` so it seizes the lock
 * the dying process may still briefly hold.
 *
 * Returns true when a relaunch was scheduled (a valid staged update exists). False means nothing is
 * staged — the caller should fall back to a plain `app.relaunch`.
 */
export function relaunchToApplyStaged(): boolean {
  // Dev (`npm run dev`) boots from out/, not a packaged resources/ layout — nothing to swap.
  if (!app.isPackaged) return false
  const metaFile = join(updatesRoot(), 'update-meta.json')
  let meta: { pendingAsar?: string | null } | null = null
  try {
    meta = JSON.parse(readFileSync(metaFile, 'utf-8'))
  } catch {
    meta = null
  }
  const pending = meta?.pendingAsar
  if (!pending) return false

  const stagedAsar = join(updatesRoot(), pending)
  let size = 0
  try {
    // original-fs: Electron's patched fs stats a real *.asar as the archive root (size 0).
    size = ofs.statSync(stagedAsar).size
  } catch {
    size = 0
  }
  if (size < MIN_ASAR_BYTES) return false // truncated / missing — never swap in garbage

  const stagedDir = dirname(stagedAsar)
  const resourcesDir = dirname(updatesRoot()) // <install>/resources (updates is its child)
  const targetAsar = join(resourcesDir, 'app.asar')
  const stagedUnpacked = join(stagedDir, 'app.asar.unpacked')
  const targetUnpacked = join(resourcesDir, 'app.asar.unpacked')
  const exe = app.getPath('exe')
  // Record which version we are replacing, so canRollbackAsar knows the swap actually
  // produced a restorable .bak (a crashed/interrupted apply leaves none) and the UI can
  // name the version being rolled back to. Write it back before handing off to the helper.
  try {
    const withOrigin: Record<string, unknown> = { ...meta!, rollbackFromVersion: app.getVersion() }
    writeFileSync(metaFile, JSON.stringify(withOrigin))
    meta = withOrigin as typeof meta
  } catch {
    /* meta write failed: rollback simply reports unavailable later */
  }
  // Re-launch flags the dying process may carry; strip them so the fresh instance starts clean,
  // then add the one that lets it take over the single-instance lock.
  const noise = new Set([
    '--autostart',
    '--dsh-relaunched',
    '--dsh-boot-retry',
    '--dsh-asar-launched'
  ])
  const relaunchArgs = process.argv
    .slice(1)
    .filter((a) => !noise.has(a) && !a.startsWith('--app-path='))
    .concat('--dsh-relaunched')

  const ps1 = join(updatesRoot(), 'apply-update.ps1')
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$appPid = ${process.pid}`,
    `$exe = ${psStr(exe)}`,
    `$relaunchArgs = @(${relaunchArgs.map(psStr).join(', ')})`,
    `$srcAsar = ${psStr(stagedAsar)}`,
    `$dstAsar = ${psStr(targetAsar)}`,
    `$srcUnpacked = ${psStr(stagedUnpacked)}`,
    `$dstUnpacked = ${psStr(targetUnpacked)}`,
    `$metaFile = ${psStr(metaFile)}`,
    // Wait for the app to actually exit (this PID gone), then a short grace for the OS to free
    // the asar / native handles.
    'while (Get-Process -Id $appPid -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 200 }',
    'Start-Sleep -Milliseconds 800',
    // Keep a single rollback copy of the version we are replacing — asar AND natives, so a
    // rollback can restore a consistent pair (a mismatched unpacked tree breaks node-pty).
    'if (Test-Path $dstAsar) { Copy-Item $dstAsar "$dstAsar.bak" -Force }',
    'if (Test-Path $dstUnpacked) { robocopy $dstUnpacked "$dstUnpacked.bak" /MIR /NFL /NDL /NJH /NJS /NP /R:5 /W:1 | Out-Null }',
    // Retry the copy while a lingering AV/defender handle releases (up to ~10s).
    'for ($i = 0; $i -lt 20; $i++) { try { Copy-Item $srcAsar $dstAsar -Force -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 500 } }',
    // node-pty's natives live beside the asar; mirror them too (robocopy /MIR returns 0-7 on ok).
    'if (Test-Path $srcUnpacked) { robocopy $srcUnpacked $dstUnpacked /MIR /NFL /NDL /NJH /NJS /NP /R:5 /W:1 | Out-Null }',
    // Clear pending so a later plain launch does not re-apply; record what is now current.
    // WriteAllText (not Set-Content -Encoding UTF8) so PowerShell 5.1 emits no BOM — the main
    // process JSON.parses this file and a leading \uFEFF would make it throw and mis-report "none".
    'try { $m = Get-Content $metaFile -Raw | ConvertFrom-Json; $m.currentAsar = $m.pendingAsar; $m.pendingAsar = $null; [IO.File]::WriteAllText($metaFile, ($m | ConvertTo-Json -Compress)) } catch {}',
    'Start-Process -FilePath $exe -ArgumentList $relaunchArgs'
  ].join('\r\n')
  try {
    mkdirSync(updatesRoot(), { recursive: true })
    writeFileSync(ps1, script, 'utf-8')
    // Detach hard enough to survive a subsequent synchronous `app.exit()`. Empirically a plain
    // `spawn(powershell, ..., {detached:true})` still died with the app before reaching the swap:
    // Electron tears down its whole process tree on a hard exit, and the OS had not finished
    // materialising the child. `cmd /c start "" /min ...` reparents the PowerShell helper away from
    // cmd (which returns immediately), orphaning it - the Windows idiom for outliving the launcher.
    const helper = spawn(
      'cmd.exe',
      [
        '/c',
        'start',
        '',
        '/min',
        'powershell.exe',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        ps1
      ],
      { detached: true, stdio: 'ignore', windowsHide: true }
    )
    helper.on('error', (err) => console.error('[update] swap helper spawn failed:', err))
    helper.unref()
    console.log(`[update] scheduled in-place swap of ${pending} into ${targetAsar}`)
    return true
  } catch (err) {
    console.error('[update] failed to schedule staged asar swap:', err)
    return false
  }
}

/** Shape of update-meta.json shared by every writer/reader in this file. */
interface UpdateMeta {
  pendingAsar?: string | null
  currentAsar?: string | null
  version?: string
  commit?: string
  broken?: boolean
  /** version that was running when the last staged swap replaced it (rollback target) */
  rollbackFromVersion?: string | null
}

function readMeta(): UpdateMeta | null {
  try {
    return JSON.parse(readFileSync(join(updatesRoot(), 'update-meta.json'), 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Is a previous version restorable? Both halves of the backup must exist — the asar and its
 * unpacked natives (written together by relaunchToApplyStaged's script) — plus the meta record
 * naming the version we'd go back to. A half-backed-up tree is worse than none, so we require
 * both. Dev builds and a first-ever install answer "no".
 */
export function canRollbackAsar(): { available: boolean; fromVersion?: string } {
  if (!app.isPackaged) return { available: false }
  const resourcesDir = dirname(updatesRoot())
  const bakAsar = join(resourcesDir, 'app.asar.bak')
  let size = 0
  try {
    size = ofs.statSync(bakAsar).size
  } catch {
    size = 0
  }
  if (size < MIN_ASAR_BYTES) return { available: false }
  const meta = readMeta()
  const from = meta?.rollbackFromVersion
  // rollbackFromVersion is only set by relaunchToApplyStaged — the same event that produced
  // the .bak — so it doubles as the authenticity check for the backup pair.
  return from ? { available: true, fromVersion: from } : { available: false }
}

/**
 * Restore `app.asar.bak` (+ `app.asar.unpacked.bak`) over the running pair and relaunch —
 * the OTA "回退到上一版本" path. Mirrors relaunchToApplyStaged's detached-helper shape for the
 * same reason: Windows locks both live files, so the swap must happen after this process exits.
 * The .bak is copied to a `.rbk` staging name and size-checked before the move, so an
 * interrupted run can never boot a truncated restore. Meta keeps `rollbackFromVersion` nulled
 * afterwards (one-way door: after a rollback there is no newer backup to go back to).
 */
export function rollbackToPreviousAsar(): boolean {
  if (!canRollbackAsar().available) return false
  const resourcesDir = dirname(updatesRoot())
  const targetAsar = join(resourcesDir, 'app.asar')
  const bakAsar = `${targetAsar}.bak`
  const targetUnpacked = join(resourcesDir, 'app.asar.unpacked')
  const bakUnpacked = `${targetUnpacked}.bak`
  const metaFile = join(updatesRoot(), 'update-meta.json')
  const exe = app.getPath('exe')
  const noise = new Set(['--autostart', '--dsh-relaunched', '--dsh-boot-retry', '--dsh-asar-launched'])
  const relaunchArgs = process.argv
    .slice(1)
    .filter((a) => !noise.has(a) && !a.startsWith('--app-path='))
    .concat('--dsh-relaunched')

  const ps1 = join(updatesRoot(), 'rollback-update.ps1')
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$appPid = ${process.pid}`,
    `$exe = ${psStr(exe)}`,
    `$relaunchArgs = @(${relaunchArgs.map(psStr).join(', ')})`,
    `$bakAsar = ${psStr(bakAsar)}`,
    `$dstAsar = ${psStr(targetAsar)}`,
    `$bakUnpacked = ${psStr(bakUnpacked)}`,
    `$dstUnpacked = ${psStr(targetUnpacked)}`,
    `$metaFile = ${psStr(metaFile)}`,
    'while (Get-Process -Id $appPid -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 200 }',
    'Start-Sleep -Milliseconds 800',
    // Stage a verified copy first: moving a corrupt .bak over the live asar would brick boot.
    'for ($i = 0; $i -lt 20; $i++) { try { Copy-Item $bakAsar "$dstAsar.rbk" -Force -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 500 } }',
    'if ((Get-Item "$dstAsar.rbk" -ErrorAction SilentlyContinue).Length -lt ' + MIN_ASAR_BYTES + ') { exit 1 }',
    'Move-Item -Force "$dstAsar.rbk" $dstAsar',
    // Restore the matching natives tree, then drop both backups (rollback is one-way).
    'if (Test-Path $bakUnpacked) { robocopy $bakUnpacked $dstUnpacked /MIR /NFL /NDL /NJH /NJS /NP /R:5 /W:1 | Out-Null }',
    'Remove-Item "$bakAsar","$bakUnpacked" -Recurse -Force -ErrorAction SilentlyContinue',
    // Consume the rollback record + any pending marker so boot/OTA read the restored state.
    'try { $m = Get-Content $metaFile -Raw | ConvertFrom-Json; $m.pendingAsar = $null; $m.rollbackFromVersion = $null; [IO.File]::WriteAllText($metaFile, ($m | ConvertTo-Json -Compress)) } catch {}',
    'Start-Process -FilePath $exe -ArgumentList $relaunchArgs'
  ].join('\r\n')
  try {
    writeFileSync(ps1, script, 'utf-8')
    const helper = spawn(
      'cmd.exe',
      [
        '/c',
        'start',
        '',
        '/min',
        'powershell.exe',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        ps1
      ],
      { detached: true, stdio: 'ignore', windowsHide: true }
    )
    helper.on('error', (err) => console.error('[update] rollback helper spawn failed:', err))
    helper.unref()
    console.log('[update] scheduled asar rollback swap')
    return true
  } catch (err) {
    console.error('[update] failed to schedule asar rollback:', err)
    return false
  }
}
