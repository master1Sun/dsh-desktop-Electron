import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { simpleGit, type SimpleGitOptions } from 'simple-git'
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
