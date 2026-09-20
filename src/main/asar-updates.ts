import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { CONTAINER_REPO_URL } from '../shared/types'
import { m } from './i18n'
import { isNewer } from './update-service'
import type { UpdateCheckResult, UpdateOutcome } from '../shared/types'

/**
 * Over-the-air asar updates. The publisher (scripts/publish-update.mjs) commits the
 * compiled app.asar + version.txt to an orphan `release` branch; a packaged client
 * fetches that branch with its own git credentials, extracts the artifacts into
 * <installDir>/resources/updates/, and boot.cjs swaps the running asar on next launch.
 */

const RELEASE_BRANCH = 'release'

export function updatesRoot(): string {
  // Same directory boot.cjs reads (relative to the exe): resources/ when packaged.
  return join(dirname(app.getPath('exe')), 'resources', 'updates')
}

function gitDir(): string {
  return join(updatesRoot(), 'release.git')
}

function runGit(args: string[]): string {
  const res = spawnSync('git', args, { encoding: 'utf-8', windowsHide: true })
  if (res.status !== 0) throw new Error((res.stderr || res.stdout || `git ${args[0]} failed`).trim())
  return res.stdout
}

/** Like runGit but keeps stdout as a raw Buffer (for `git show :app.asar`). */
function runGitBinary(args: string[]): Buffer {
  const res = spawnSync('git', args, { windowsHide: true, maxBuffer: 512 * 1024 * 1024 })
  if (res.status !== 0) throw new Error(String(res.stderr || 'git show failed').trim())
  return res.stdout
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

function fetchTip(): ReleaseTip {
  ensureRepo()
  runGit(['--git-dir', gitDir(), 'fetch', '--depth', '1', 'origin', RELEASE_BRANCH])
  const commit = runGit(['--git-dir', gitDir(), 'rev-parse', 'FETCH_HEAD']).trim()
  const version = runGit(['--git-dir', gitDir(), 'show', `${commit}:version.txt`])
    .split(/\r?\n/)[0]
    .trim()
  return { version, commit }
}

/** Extract app.asar + metadata of the tip commit into updates/, staged as pending. */
function downloadAsar(tip: ReleaseTip): void {
  const root = updatesRoot()
  mkdirSync(root, { recursive: true })
  const data = runGitBinary(['--git-dir', gitDir(), 'show', `${tip.commit}:app.asar`])
  const tmp = join(root, 'app.asar.tmp')
  const pending = join(root, 'app.asar.pending')
  writeFileSync(tmp, data)
  rmSync(pending, { force: true })
  // Rename-after-write: a half-written file can never be picked up as .pending.
  writeFileSync(pending, readFileSync(tmp))
  rmSync(tmp, { force: true })
  writeFileSync(
    join(root, 'update-meta.json'),
    JSON.stringify({ pendingAsar: 'app.asar.pending', version: tip.version, commit: tip.commit })
  )
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
    const tip = fetchTip()
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

export async function applyAsarUpdate(name: string): Promise<UpdateOutcome> {
  try {
    const tip = fetchTip()
    downloadAsar(tip)
    return { name, ok: true, updated: true, message: m('git.asarDownloaded', { version: tip.version }) }
  } catch (err) {
    return { name, ok: false, updated: false, error: (err as Error).message }
  }
}
