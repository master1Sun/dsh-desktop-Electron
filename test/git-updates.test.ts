import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { checkUpdates, performUpdate, clearUpdateCache, normalizeRepoUrl, recloneUrl } from '../src/main/update/git-updates'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
}

let root: string
let bare: string
let repo: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'dsh-git-test-'))
  bare = join(root, 'remote.git')
  repo = join(root, 'repo')
  git(root, ['init', '--bare', '-b', 'main', bare])
  git(root, ['clone', bare, repo])
  writeFileSync(join(repo, 'a.txt'), 'one')
  git(repo, ['add', '.'])
  git(repo, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'c1'])
  git(repo, ['push', '-u', 'origin', 'main'])
  // remote advances one commit ahead
  writeFileSync(join(bare, '..', 'seed.txt'), '')
  const work2 = join(root, 'work2')
  git(root, ['clone', bare, work2])
  writeFileSync(join(work2, 'b.txt'), 'two')
  git(work2, ['add', '.'])
  git(work2, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'c2'])
  git(work2, ['push', 'origin', 'main'])
})

describe('git update detection', () => {
  it('detects remote ahead of local', async () => {
    clearUpdateCache()
    const [res] = await checkUpdates([{ name: 'repo', dir: repo, isContainer: false }], true)
    expect(res.ok).toBe(true)
    expect(res.hasUpdate).toBe(true)
    expect(res.localHead).not.toBe(res.remoteHead)
  }, 30_000)

  it('performUpdate fast-forwards local to remote', async () => {
    const out = await performUpdate({ name: 'repo', dir: repo })
    expect(out.ok).toBe(true)
    expect(out.updated).toBe(true)
    clearUpdateCache()
    const [res] = await checkUpdates([{ name: 'repo', dir: repo, isContainer: false }], true)
    expect(res.hasUpdate).toBe(false)
  }, 30_000)

  it('reports non-git dirs gracefully', async () => {
    const plain = join(root, 'plain')
    mkdirSync(plain, { recursive: true })
    clearUpdateCache()
    const [res] = await checkUpdates([{ name: 'plain', dir: plain, isContainer: false }], true)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('不是 git 仓库')
  })

  it('skips dirty working tree on update', async () => {
    writeFileSync(join(repo, 'dirty.txt'), 'x')
    const out = await performUpdate({ name: 'repo', dir: repo })
    expect(out.ok).toBe(false)
    expect(out.error).toContain('未提交改动')
    rmSync(join(repo, 'dirty.txt'), { force: true })
  }, 30_000)
})

describe('repo URL helpers', () => {
  it('normalizes credentials and trailing slashes', () => {
    expect(normalizeRepoUrl('https://user:tok@github.com/a/b.git/')).toBe(
      'https://github.com/a/b.git'
    )
  })

  it('strips credentials from https clone URLs but keeps ssh forms', () => {
    expect(recloneUrl('https://user:x-oauth-basic@github.com/a/b.git')).toBe(
      'https://github.com/a/b.git'
    )
    expect(recloneUrl('git@github.com:a/b.git')).toBe('git@github.com:a/b.git')
  })
})
