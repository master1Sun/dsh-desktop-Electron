import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs'

// disk-usage pulls in electron (app.getPath) and the store/logger/bridge path chain at module
// level, so the whole report is computed from real helpers pointed at one throwaway userData.
// Same electron + electron-store stubs mcp-bridge.test.ts uses, plus a getPath that maps every
// named dir under our temp base.
const base = mkdtempSync(join(tmpdir(), 'dsh-disk-'))
const P = {
  userData: join(base, 'userData'),
  pages: join(base, 'userData', 'pages'),
  env: join(base, 'userData', 'env'),
  capabilities: join(base, 'userData', 'capabilities'),
  mcp: join(base, 'userData', 'mcp'),
  bridge: join(base, 'userData', 'mcp-bridge'),
  logs: join(base, 'userData', 'logs'),
  workspace: join(base, 'userData', 'workspace'),
  downloads: join(base, 'userData', 'downloads')
}

vi.mock('electron', () => {
  const stub = {
    app: {
      getAppPath: () => join(__dirname, '..'),
      getPath: (name: string) => {
        const ud = process.env.DSH_TEST_USERDATA as string
        if (name === 'userData') return ud
        return join(ud, name)
      },
      getVersion: () => '0.0.0-test',
      isPackaged: false
    },
    ipcMain: { on: () => undefined, handle: () => undefined },
    shell: { openPath: () => Promise.resolve('') },
    session: {
      defaultSession: {
        cookies: { get: async () => [] },
        clearCache: async () => undefined,
        clearStorageData: async () => undefined
      }
    }
  }
  return { ...stub, default: stub }
})

vi.mock('electron-store', () => ({
  default: class MemoryStore {
    private data = new Map<string, unknown>()
    get(): unknown {
      return undefined
    }
    set(): void {
      /* not exercised here */
    }
    get store(): Record<string, unknown> {
      return {}
    }
  }
}))

// Set the userData pointer the electron mock reads before any module resolves a path.
process.env.DSH_TEST_USERDATA = P.userData
// resolvePagesDir() honours this env var; without it the real (repo) pages dir would be scanned.
process.env.DSH_PAGES_DIR = P.pages

import { clearDiskScope, getDiskReport } from '../src/main/runtime/diagnostics/disk-usage'

function writeBytes(path: string, n: number): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, Buffer.alloc(n))
}

beforeAll(() => {
  mkdirSync(P.userData, { recursive: true })
  // pages/ — two hosted dirs, each one file, so the per-page children are checkable.
  writeBytes(join(P.pages, 'alpha', 'app.txt'), 1000)
  writeBytes(join(P.pages, 'beta', 'x.bin'), 2000)
  // env/ — one provisioned runtime dir.
  writeBytes(join(P.env, 'node', 'node.exe'), 500)
  writeBytes(join(P.env, 'dsh', 'cli.js'), 100)
  // Other buckets.
  writeBytes(join(P.capabilities, 'pkg'), 20)
  writeBytes(join(P.mcp, 'blob'), 7)
  writeBytes(join(P.bridge, 'mcp-servers.json'), 5)
  writeBytes(join(P.workspace, 'context.json'), 40)
  writeBytes(join(P.downloads, 'file.zip'), 10)
  // logs/: an active main.log + a page log with a rotated sibling.
  writeBytes(join(P.logs, 'main.log'), 300)
  writeBytes(join(P.logs, 'pages', 'alpha.log'), 250)
  writeBytes(join(P.logs, 'pages', 'alpha.log.1'), 999)
})

afterAll(() => {
  rmSync(base, { recursive: true, force: true })
})

let report!: Awaited<ReturnType<typeof getDiskReport>>
function scopeById(id: string): DiskScopeLike | undefined {
  return report.scopes.find((s) => s.id === id)
}
type DiskScopeLike = Awaited<ReturnType<typeof getDiskReport>>['scopes'][number]

describe('getDiskReport', () => {
  it('aggregates each scope and nests per-page / per-runtime children', async () => {
    report = await getDiskReport()
    const ids = report.scopes.map((s) => s.id)
    for (const want of ['webcache', 'pages', 'env', 'capabilities', 'mcp', 'mcp-bridge', 'logs', 'workspace', 'downloads']) {
      expect(ids).toContain(want)
    }
    const pages = scopeById('pages')!
    expect(pages.bytes).toBe(3000)
    expect(pages.children?.map((c) => [c.label, c.bytes])).toEqual([
      ['alpha', 1000],
      ['beta', 2000]
    ])
    const env = scopeById('env')!
    expect(env.bytes).toBe(600)
    expect(env.children?.find((c) => c.label === 'node')?.bytes).toBe(500)
    // usedBytes is the sum of the real data scopes (the truncation marker is zero-byte anyway).
    expect(report.usedBytes).toBe(
      report.scopes.filter((s) => s.id !== '__truncated__').reduce((a, s) => a + s.bytes, 0)
    )
    expect(report.usedBytes).toBe(3000 + 600 + 20 + 7 + 5 + 1549 + 40 + 10)
  })

  it('counts a missing / empty scope as 0 and never throws', async () => {
    report = await getDiskReport()
    // No Chromium cache dirs were created under the temp userData → webcache is 0.
    expect(scopeById('webcache')!.bytes).toBe(0)
  })
})

describe('clearDiskScope', () => {
  it('rejects every non-allowlisted scope without touching it', async () => {
    await expect(clearDiskScope('pages')).rejects.toThrow(/not clearable/)
    await expect(clearDiskScope('env')).rejects.toThrow(/not clearable/)
    await expect(clearDiskScope('workspace')).rejects.toThrow(/not clearable/)
    // and the data is untouched
    expect(statSync(join(P.pages, 'alpha', 'app.txt')).size).toBe(1000)
  })

  it('truncates active logs and deletes rotated siblings', async () => {
    await clearDiskScope('logs')
    // active files survive but are emptied (the writer + stream watcher expect the path to remain)
    expect(existsSync(join(P.logs, 'main.log'))).toBe(true)
    expect(statSync(join(P.logs, 'main.log')).size).toBe(0)
    expect(statSync(join(P.logs, 'pages', 'alpha.log')).size).toBe(0)
    // the rotated sibling is gone entirely
    expect(existsSync(join(P.logs, 'pages', 'alpha.log.1'))).toBe(false)
    // the events timeline (if present) is truncated too — the whole dir is emptied of log bytes
    report = await getDiskReport()
    expect(scopeById('logs')!.bytes).toBe(0)
  })

  it('routes webcache through the webdata clear without error', async () => {
    await expect(clearDiskScope('webcache')).resolves.toBeUndefined()
  })
})
