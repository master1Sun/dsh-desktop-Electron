import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// update-service → pages → node-runtime all reach for `app`, and pages.ts imports
// nativeTheme; the whole chain only needs the stubs below to be importable here.
vi.mock('electron', () => {
  const stub = {
    app: {
      getAppPath: () => join(__dirname, '..'),
      getPath: () => join(tmpdir(), 'dsh-container-channel-test'),
      getVersion: () => '0.0.0-test',
      isPackaged: false
    },
    nativeTheme: { shouldUseDarkColors: false },
    ipcMain: { on: () => undefined },
    shell: { openPath: () => Promise.resolve('') }
  }
  return { ...stub, default: stub }
})

// Settings must be writable per case without touching the user's store.
vi.mock('electron-store', () => ({
  default: class MemoryStore {
    private data = new Map<string, unknown>()
    constructor(opts?: { defaults?: Record<string, unknown> }) {
      for (const [k, v] of Object.entries(opts?.defaults ?? {})) this.data.set(k, v)
    }
    get(key: string): unknown {
      return this.data.get(key)
    }
    set(key: string, value: unknown): void {
      this.data.set(key, value)
    }
    get store(): Record<string, unknown> {
      return Object.fromEntries(this.data)
    }
  }
}))

import { updateSettings } from '../src/main/shell/store'
import {
  dshChannel,
  fetchNpmLatest,
  isNewer,
  listPackageVersions,
  sortVersionsDesc
} from '../src/main/update/update-service'
import {
  RELEASE_BRANCH_BETA,
  effectiveReleaseBranch,
  resetBranchProbe
} from '../src/main/update/asar-updates'

/**
 * A2: the two update channels. Both sides of the feature are covered here — the *setting*
 * resolving to a dist-tag / a git branch, and the version comparison that decides whether what
 * the channel advertised counts as an update. The actual fetch and `git fetch` are not.
 */

describe('dsh release channel', () => {
  it('follows alpha unless the setting says latest', () => {
    updateSettings({ dshChannel: 'alpha' })
    expect(dshChannel()).toBe('alpha')
    updateSettings({ dshChannel: 'latest' })
    expect(dshChannel()).toBe('latest')
  })

  it('treats an unusable value as the default channel', () => {
    // An older snapshot / a hand-edited store must not end up installing `@undefined`.
    updateSettings({ dshChannel: 'nightly' as 'alpha' })
    expect(dshChannel()).toBe('alpha')
    updateSettings({ dshChannel: undefined })
    expect(dshChannel()).toBe('alpha')
  })

  it('asks the registry for the tag it just resolved', async () => {
    const urls: string[] = []
    const real = globalThis.fetch
    globalThis.fetch = ((input: unknown) => {
      urls.push(String(input))
      return Promise.resolve({ ok: false } as Response)
    }) as typeof fetch
    try {
      updateSettings({ dshChannel: 'alpha' })
      expect(await fetchNpmLatest('@deepseek-ai/dsh', dshChannel())).toBeNull()
      updateSettings({ dshChannel: 'latest' })
      expect(await fetchNpmLatest('@deepseek-ai/dsh', dshChannel())).toBeNull()
    } finally {
      globalThis.fetch = real
    }
    // The scoped name keeps its leading @ (npm's tag endpoint wants it) while the slash is
    // escaped, and the last path segment is the dist-tag — the historical `@alpha` install spec
    // became this URL suffix, so both halves have to agree.
    expect(urls[0]).toMatch(/@deepseek-ai%2Fdsh\/alpha$/)
    expect(urls[1]).toMatch(/@deepseek-ai%2Fdsh\/latest$/)
  })
})

describe('container OTA branch', () => {
  beforeEach(() => {
    // A "the beta branch isn't published" verdict is cached in the module; each case starts fresh.
    resetBranchProbe()
  })

  it('follows release on the stable channel', () => {
    updateSettings({ containerChannel: 'stable' })
    expect(effectiveReleaseBranch()).toBe('release')
  })

  it('follows the beta branch on the beta channel', () => {
    updateSettings({ containerChannel: 'beta' })
    expect(effectiveReleaseBranch()).toBe(RELEASE_BRANCH_BETA)
    expect(RELEASE_BRANCH_BETA).not.toBe('release')
  })

  it('goes back to release when the channel is switched off', () => {
    updateSettings({ containerChannel: 'beta' })
    updateSettings({ containerChannel: 'stable' })
    expect(effectiveReleaseBranch()).toBe('release')
  })
})

describe('isNewer across a prerelease channel', () => {
  it('compares numeric components, padded', () => {
    expect(isNewer('0.1.11', '0.1.12')).toBe(true)
    expect(isNewer('0.1.11', '0.1.11')).toBe(false)
    expect(isNewer('0.1.12', '0.1.9')).toBe(false)
    expect(isNewer('0.1', '0.1.1')).toBe(true)
    expect(isNewer('v1.2.3', '1.3.0')).toBe(true)
  })

  it('ignores prerelease tags, which is why the channel setting exists', () => {
    // `1.0.0-alpha.2` of a release already installed is NOT an update: only the channel decides
    // which tag's version gets compared, so flipping to `latest` can't "upgrade" to a prerelease.
    expect(isNewer('1.0.0', '1.0.0-alpha.2')).toBe(false)
    expect(isNewer('1.0.0-alpha.1', '1.0.0')).toBe(false)
    expect(isNewer('1.0.0-alpha.1', '1.0.1-beta.9')).toBe(true)
  })
})

describe('指定版本 picker (published version list)', () => {
  it('orders newest-first and drops non-semver noise', () => {
    // 0.10.0 > 0.9.0 needs a numeric compare, not the string one a naive sort would use.
    expect(sortVersionsDesc(['0.9.0', '0.10.0', '0.10.1', '', 'latest'])).toEqual([
      '0.10.1',
      '0.10.0',
      '0.9.0'
    ])
  })

  it('ranks a plain release above its own prerelease build, then cuts to the cap', () => {
    const list = sortVersionsDesc(
      ['0.156.1', '0.156.1-win32-x64', '0.157.0-beta.1', '0.155.1', '0.9.9'],
      4
    )
    expect(list).toEqual(['0.157.0-beta.1', '0.156.1', '0.156.1-win32-x64', '0.155.1'])
  })

  it('falls back to the full packument when the abbreviated form is refused', async () => {
    const accepts: string[] = []
    const real = globalThis.fetch
    globalThis.fetch = ((input: unknown, init?: RequestInit) => {
      const accept = String((init?.headers as Record<string, string> | undefined)?.Accept || '')
      accepts.push(accept)
      if (accept === 'application/vnd.npm.install-v1+json')
        return Promise.resolve({ ok: false } as Response)
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            versions: { '1.0.0': {}, '1.1.0': {}, '1.1.0-linux-x64': {}, '1.1.0-win32-arm64': {} }
          })
      } as Response) as Promise<Response>
    }) as typeof fetch
    try {
      // The per-platform alias builds are dropped: they are optionalDependency targets, and a CLI
      // that ships six of them per release would otherwise bury every real version in the picker.
      expect(await listPackageVersions('@openai/codex')).toEqual(['1.1.0', '1.0.0'])
    } finally {
      globalThis.fetch = real
    }
    expect(accepts).toHaveLength(2)
  })

  it('reads an empty list rather than throwing when the registry is unreachable', async () => {
    const real = globalThis.fetch
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch
    try {
      // A distinct package name: the previous case cached its list under the module's cache, and a
      // dead registry must not look like it succeeded through that entry.
      expect(await listPackageVersions('@openai/unreachable')).toEqual([])
    } finally {
      globalThis.fetch = real
    }
  })
})
