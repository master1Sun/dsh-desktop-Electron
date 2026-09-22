import { describe, it, expect } from 'vitest'
import { detectSourceKind, expandGitSource, isGitHubShort, looksLikeLocalPath } from '../src/shared/smartSource'

describe('detectSourceKind', () => {
  it('recognises git sources by scheme or .git suffix', () => {
    expect(detectSourceKind('https://github.com/openai/codex.git')).toBe('git')
    expect(detectSourceKind('http://gitee.com/a/b')).toBe('git')
    expect(detectSourceKind('git@github.com:openai/codex.git')).toBe('git')
    expect(detectSourceKind('ssh://git@host/a/b.git')).toBe('git')
  })

  it('recognises the owner/repo shorthand as git', () => {
    expect(detectSourceKind('openai/codex')).toBe('git')
    expect(isGitHubShort('openai/codex')).toBe(true)
    // A scoped npm name is not a repo short form.
    expect(isGitHubShort('@openai/codex')).toBe(false)
  })

  it('recognises local filesystem paths', () => {
    expect(detectSourceKind('D:\\GitProject\\codex')).toBe('dir')
    expect(detectSourceKind('D:/GitProject/codex')).toBe('dir')
    expect(detectSourceKind('\\\\nas\\share\\app')).toBe('dir')
    expect(detectSourceKind('./local-app')).toBe('dir')
    expect(detectSourceKind('../sibling')).toBe('dir')
    expect(detectSourceKind('/home/user/app')).toBe('dir')
    // A Windows path with spaces is still a path — recognized before the whitespace ban.
    expect(detectSourceKind('C:\\Program Files\\app')).toBe('dir')
    expect(looksLikeLocalPath('C:\\x')).toBe(true)
  })

  it('recognises npm specs, scoped or plain, with or without a version', () => {
    expect(detectSourceKind('express')).toBe('npm')
    expect(detectSourceKind('express@4.19.2')).toBe('npm')
    expect(detectSourceKind('@openai/codex')).toBe('npm')
    expect(detectSourceKind('@openai/codex@latest')).toBe('npm')
  })

  it('returns null for anything ambiguous or empty (no guessing)', () => {
    expect(detectSourceKind('')).toBeNull()
    expect(detectSourceKind('   ')).toBeNull()
    expect(detectSourceKind('has space')).toBeNull()
    expect(detectSourceKind('a/b/c/d.txt')).toBeNull()
    expect(detectSourceKind('!!')).toBeNull()
  })
})

describe('expandGitSource', () => {
  it('expands only the shorthand', () => {
    expect(expandGitSource('openai/codex')).toBe('https://github.com/openai/codex.git')
    expect(expandGitSource('https://github.com/openai/codex.git')).toBe(
      'https://github.com/openai/codex.git'
    )
    expect(expandGitSource('D:\\x\\codex')).toBe('D:\\x\\codex')
  })
})
