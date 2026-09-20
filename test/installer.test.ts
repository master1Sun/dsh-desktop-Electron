import { describe, it, expect, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'

vi.mock('electron', () => {
  const stub = {
    app: {
      getAppPath: () => join(__dirname, '..'),
      getPath: () => join(tmpdir(), 'dsh-container-installer-test'),
      getVersion: () => '0.0.0-test',
      isPackaged: false
    },
    ipcMain: { on: () => undefined },
    shell: { openPath: () => Promise.resolve('') }
  }
  return { ...stub, default: stub }
})

vi.mock('electron-store', () => {
  return {
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
  }
})

import { installFromLocalDir, removePage } from '../src/main/installer'

describe('installFromLocalDir container.json seeding', () => {
  it('writes a generated manifest with the form port when the project ships none', async () => {
    const srcBase = mkdtempSync(join(tmpdir(), 'dsh-inst-src-'))
    const pagesDir = mkdtempSync(join(tmpdir(), 'dsh-inst-pages-'))
    try {
      mkdirSync(join(srcBase, 'app-a'))
      writeFileSync(join(srcBase, 'app-a', 'server.js'), '// stub\n')
      const id = await installFromLocalDir(pagesDir, join(srcBase, 'app-a'), 'app-a', 17699)
      const metaFile = join(pagesDir, id, 'container.json')
      expect(existsSync(metaFile)).toBe(true)
      const raw = JSON.parse(readFileSync(metaFile, 'utf-8'))
      expect(raw.port).toBe(17699)
      expect(raw.name).toBe('app-a')
    } finally {
      rmSync(srcBase, { recursive: true, force: true })
      rmSync(pagesDir, { recursive: true, force: true })
    }
  })

  it('never rewrites an existing container.json', async () => {
    const srcBase = mkdtempSync(join(tmpdir(), 'dsh-inst-src-'))
    const pagesDir = mkdtempSync(join(tmpdir(), 'dsh-inst-pages-'))
    try {
      mkdirSync(join(srcBase, 'app-b'))
      writeFileSync(join(srcBase, 'app-b', 'server.js'), '// stub\n')
      writeFileSync(
        join(srcBase, 'app-b', 'container.json'),
        JSON.stringify({ name: 'keep-me', port: 3000 })
      )
      const id = await installFromLocalDir(pagesDir, join(srcBase, 'app-b'), 'app-b', 17699)
      const raw = JSON.parse(readFileSync(join(pagesDir, id, 'container.json'), 'utf-8'))
      expect(raw.name).toBe('keep-me')
      expect(raw.port).toBe(3000) // override lives in pagePorts, not the manifest
    } finally {
      rmSync(srcBase, { recursive: true, force: true })
      rmSync(pagesDir, { recursive: true, force: true })
    }
  })

  it('generates nothing when the form port is left empty', async () => {
    const srcBase = mkdtempSync(join(tmpdir(), 'dsh-inst-src-'))
    const pagesDir = mkdtempSync(join(tmpdir(), 'dsh-inst-pages-'))
    try {
      mkdirSync(join(srcBase, 'app-c'))
      writeFileSync(join(srcBase, 'app-c', 'server.js'), '// stub\n')
      const id = await installFromLocalDir(pagesDir, join(srcBase, 'app-c'), 'app-c')
      expect(existsSync(join(pagesDir, id, 'container.json'))).toBe(false)
    } finally {
      rmSync(srcBase, { recursive: true, force: true })
      rmSync(pagesDir, { recursive: true, force: true })
    }
  })

  it('adopts a git origin so a local copy keeps receiving updates', async () => {
    const srcBase = mkdtempSync(join(tmpdir(), 'dsh-inst-src-'))
    const pagesDir = mkdtempSync(join(tmpdir(), 'dsh-inst-pages-'))
    try {
      mkdirSync(join(srcBase, 'app-d'))
      writeFileSync(join(srcBase, 'app-d', 'server.js'), '// stub\n')
      const id = await installFromLocalDir(
        pagesDir,
        join(srcBase, 'app-d'),
        'app-d',
        undefined,
        'https://github.com/master1Sun/dsh-desktop-Electron.git'
      )
      const { simpleGit } = await import('simple-git')
      const git = simpleGit({ baseDir: join(pagesDir, id) })
      expect(await git.checkIsRepo()).toBe(true)
      const remotes = await git.getRemotes(true)
      expect(remotes.find((r) => r.name === 'origin')?.refs.fetch).toBe(
        'https://github.com/master1Sun/dsh-desktop-Electron.git'
      )
      expect((await git.revparse(['HEAD'])).trim()).toMatch(/^[0-9a-f]{40}$/)
    } finally {
      rmSync(srcBase, { recursive: true, force: true })
      rmSync(pagesDir, { recursive: true, force: true })
    }
  })
})

describe('removePage built-in protection', () => {
  it('refuses to delete container-shipped pages and keeps their dirs', () => {
    const pagesDir = mkdtempSync(join(tmpdir(), 'dsh-inst-builtin-'))
    try {
      for (const id of ['dsh-web', 'openclaw']) {
        mkdirSync(join(pagesDir, id), { recursive: true })
        expect(() => removePage(pagesDir, id)).toThrow(/内置页面，不可删除/)
        expect(existsSync(join(pagesDir, id))).toBe(true)
      }
    } finally {
      rmSync(pagesDir, { recursive: true, force: true })
    }
  })

  it('still removes a regular imported page', () => {
    const pagesDir = mkdtempSync(join(tmpdir(), 'dsh-inst-rm-'))
    try {
      mkdirSync(join(pagesDir, 'my-app'), { recursive: true })
      removePage(pagesDir, 'my-app')
      expect(existsSync(join(pagesDir, 'my-app'))).toBe(false)
    } finally {
      rmSync(pagesDir, { recursive: true, force: true })
    }
  })
})
