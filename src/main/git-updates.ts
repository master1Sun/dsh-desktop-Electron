import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { simpleGit, type SimpleGitOptions, type SimpleGitProgressEvent } from 'simple-git'
import type { UpdateCheckResult, UpdateOutcome } from '../shared/types'
import { m } from './i18n'

const CACHE_TTL_MS = 5 * 60_1000

interface CacheEntry {
  at: number
  results: UpdateCheckResult[]
}

let cache: CacheEntry | null = null

function makeGit(dir: string): ReturnType<typeof simpleGit> {
  const options: Partial<SimpleGitOptions> = { baseDir: dir, maxConcurrentProcesses: 4 }
  return simpleGit(options)
}

/** Strip credentials (https://user:token@…) and a trailing slash so two URLs point at one repo. */
export function normalizeRepoUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/^(https?:\/\/)[^@/\s]+@/i, '$1')
}

/** True when the remote URL is an SSH (`git@host:path`) or `ssh://` form. */
export function isSshRemote(url: string): boolean {
  return /^ssh:\/\//i.test(url) || /^[^@\s/]+@[^:\s]+:/.test(url.trim())
}

/**
 * A credential-embedded https URL fails auth against GitHub ("support for password
 * authentication was removed" — the username hints at it). Re-clone without the
 * credentials: public repos fetch anonymously, private ones need a working helper.
 */
export function recloneUrl(url: string): string {
  return isSshRemote(url) ? url : normalizeRepoUrl(url).replace(/^(https?:\/\/)[^@/\s]+@/i, '$1')
}

/** A normalized git progress tick: the stage label plus a 0..100 percentage. */
export interface CloneProgress {
  stage: string
  percent: number
  processed?: number
  total?: number
}

/**
 * Clone `url` into `dir`, retrying once with the credential-stripped URL.
 * The caller's own git config (e.g. an insteadOf rewrite to SSH) still applies.
 * When `onProgress` is given it is wired through simple-git's `progress` option, which
 * auto-appends `--progress` and parses git's stderr counters — so the caller sees real
 * download percentages without us re-implementing the parsing.
 */
export async function cloneWithAuthFallback(
  dir: string,
  url: string,
  onProgress?: (p: CloneProgress) => void
): Promise<void> {
  const makeGit = (): ReturnType<typeof simpleGit> =>
    onProgress
      ? simpleGit({
          baseDir: process.cwd(),
          progress: (ev: SimpleGitProgressEvent): void => {
            onProgress({
              stage: String(ev.stage),
              percent: Number(ev.progress) || 0,
              processed: ev.processed,
              total: ev.total
            })
          }
        })
      : simpleGit({ baseDir: process.cwd() })
  try {
    await makeGit().clone(url, dir)
  } catch (err) {
    const fallback = recloneUrl(url)
    if (fallback === normalizeRepoUrl(url)) throw err
    await makeGit().clone(fallback, dir)
  }
}

export async function checkUpdates(
  targets: { name: string; dir: string; isContainer: boolean }[],
  force = false
): Promise<UpdateCheckResult[]> {
  if (cache && !force && Date.now() - cache.at < CACHE_TTL_MS) return cache.results
  const results: UpdateCheckResult[] = []
  for (const t of targets) {
    results.push(await checkOne(t.name, t.dir, t.isContainer))
  }
  cache = { at: Date.now(), results }
  return results
}

export async function checkOne(
  name: string,
  dir: string,
  isContainer: boolean
): Promise<UpdateCheckResult> {
  const base: UpdateCheckResult = { name, dir, isContainer, ok: false }
  try {
    if (!existsSync(join(dir, '.git'))) {
      return { ...base, error: m('git.notRepo') }
    }
    const git = makeGit(dir)
    const branch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim()
    const localHead = (await git.revparse(['HEAD'])).trim()
    const remotes = await git.getRemotes(true)
    const origin = remotes.find((r) => r.name === 'origin')
    if (!origin?.refs.fetch) return { ...base, branch, localHead, error: m('git.noOrigin') }
    const ls = await git.listRemote([origin.refs.fetch])
    const headLine =
      ls.split('\n').find((l) => l.includes(`refs/heads/${branch}`)) ||
      ls.split('\n').find((l) => l.includes('HEAD'))
    if (!headLine) return { ...base, branch, localHead, error: m('git.branchMissing', { branch }) }
    const remoteHead = headLine.split(/\s+/)[0]
    return {
      ...base,
      ok: true,
      branch,
      localHead,
      remoteHead,
      hasUpdate: remoteHead !== localHead
    }
  } catch (err) {
    return { ...base, error: (err as Error).message }
  }
}

export async function performUpdate(target: { name: string; dir: string }): Promise<UpdateOutcome> {
  try {
    const git = makeGit(target.dir)
    const status = await git.status()
    if (!status.isClean()) {
      return {
        name: target.name,
        ok: false,
        updated: false,
        error: m('git.dirtySkipped')
      }
    }
    const before = (await git.revparse(['HEAD'])).trim()
    await git.pull(['--ff-only'])
    const after = (await git.revparse(['HEAD'])).trim()
    return { name: target.name, ok: true, updated: before !== after }
  } catch (err) {
    return { name: target.name, ok: false, updated: false, error: (err as Error).message }
  }
}

export function clearUpdateCache(): void {
  cache = null
}
