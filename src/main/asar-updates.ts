import { spawn, spawnSync } from 'node:child_process'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
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

/**
 * Over-the-air asar updates. The publisher (scripts/publish-update.mjs) commits the
 * compiled app.asar + version.txt to an orphan `release` branch; a packaged client
 * fetches that branch with its own git credentials, extracts the artifacts into
 * <installDir>/resources/updates/, and boot.cjs swaps the running asar on next launch.
 *
 * The artifact is large, so the download is streamed and reports progress rather than
 * slurping a 512 MB buffer through a blocking `spawnSync` (which froze the whole main
 * process). Extraction writes to a commit-scoped `.part` file that survives an
 * interrupted attempt: a later run resumes from its current size instead of rewriting
 * from zero (断点续传), and only renames onto `app.asar.pending` once the byte count
 * matches — so boot.cjs can never pick up a truncated file.
 */

const RELEASE_BRANCH = 'release'

/** Progress is byte-accurate; throttle IPC emissions so a fast local disk doesn't flood it. */
const PROGRESS_INTERVAL_MS = 150

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

/** Drop partial files left by prior attempts against other commits, keeping only `keep`. */
function pruneStaleParts(root: string, keep: string): void {
  try {
    for (const f of readdirSync(root)) {
      if (f.startsWith('app.asar.') && f.endsWith('.part') && join(root, f) !== keep)
        rmSync(join(root, f), { force: true })
    }
  } catch {
    /* best-effort cleanup */
  }
}

/** Extract app.asar of the tip commit into updates/, staged as pending. Resumable + progress. */
async function downloadAsar(tip: ReleaseTip, name: string, onProgress?: ProgressCb): Promise<void> {
  const root = updatesRoot()
  mkdirSync(root, { recursive: true })
  const rev = `${tip.commit}:app.asar`
  const total = Number(runGit(['--git-dir', gitDir(), 'cat-file', '-s', rev]).trim())
  if (!Number.isFinite(total) || total <= 0) throw new Error(m('git.asarSizeUnknown'))

  // Commit-scoped so a stale partial from a different release is never resumed into.
  const part = join(root, `app.asar.${tip.commit}.part`)
  pruneStaleParts(root, part)

  let resumeFrom = 0
  if (existsSync(part)) {
    const size = statSync(part).size
    if (size > 0 && size < total) resumeFrom = size
    else rmSync(part, { force: true }) // >= total is a corrupt/complete leftover: restart clean
  }

  await streamBlob(rev, part, resumeFrom, total, name, resumeFrom > 0, onProgress)

  if (statSync(part).size !== total)
    throw new Error(m('git.asarSizeMismatch', { want: total, got: statSync(part).size }))

  const pending = join(root, 'app.asar.pending')
  rmSync(pending, { force: true })
  // Rename-after-complete: a half-written file can never be picked up as .pending.
  renameSync(part, pending)
  writeFileSync(
    join(root, 'update-meta.json'),
    JSON.stringify({ pendingAsar: 'app.asar.pending', version: tip.version, commit: tip.commit })
  )
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
    const tip = await fetchTip(name)
    return {
      ...base,
      ok: true,
      branch: RELEASE_BRANCH,
      localHead: current,
      remoteHead: tip.commit.slice(0, 8),
      currentVersion: current,
      latestVersion: tip.version,
      hasUpdate: isNewer(current, tip.version)
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
