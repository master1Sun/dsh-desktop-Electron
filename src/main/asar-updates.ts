import { spawn, spawnSync } from 'node:child_process'
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
import extract from 'extract-zip'
import {
  CONTAINER_REPO_URL,
  type UpdateProgress,
  type UpdateCheckResult,
  type UpdateOutcome
} from '../shared/types'
import { m } from './i18n'
import { isNewer } from './update-service'

/**
 * Over-the-air asar updates. The publisher (scripts/publish-update.mjs) commits the
 * electron-builder artifacts (app.asar + the asarUnpack'd app.asar.unpacked native tree) as a
 * single app.zip, plus version.txt, to an orphan `release` branch; a packaged client fetches that
 * branch with its own git credentials, extracts the zip into
 * <installDir>/resources/updates/<commit>/ (yielding a literal `app.asar` and its sibling
 * `app.asar.unpacked`), and boot.cjs swaps the running asar on next launch. Each release lives in
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
    size = statSync(pending).size
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
  await extract(zipPath, { dir })
  const stagedAsar = join(dir, 'app.asar')
  if (!existsSync(stagedAsar) || statSync(stagedAsar).size < MIN_ASAR_BYTES)
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
      return {
        ...base,
        ok: true,
        branch: RELEASE_BRANCH,
        localHead: current,
        remoteHead: staged.commit.slice(0, 8),
        currentVersion: current,
        latestVersion: staged.version,
        hasUpdate: false,
        pendingRestart: true
      }
    }
    const tip = await fetchTip(name)
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
      pendingRestart: false
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
    await downloadAsar(tip, name, onProgress)
    return {
      name,
      ok: true,
      updated: true,
      message: m('git.asarDownloaded', { version: tip.version })
    }
  } catch (err) {
    return { name, ok: false, updated: false, error: (err as Error).message }
  }
}
