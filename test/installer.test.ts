import { describe, it, expect, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'

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

import {
  installFromLocalDir,
  installFromNpm,
  parseNpmSpec,
  removePage
} from '../src/main/runtime/pages/installer'
import type { InstallProgress } from '../src/shared/types'

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

  it('generates a page manifest even when the form port is left empty', async () => {
    const srcBase = mkdtempSync(join(tmpdir(), 'dsh-inst-src-'))
    const pagesDir = mkdtempSync(join(tmpdir(), 'dsh-inst-pages-'))
    try {
      mkdirSync(join(srcBase, 'app-c'))
      writeFileSync(join(srcBase, 'app-c', 'server.js'), '// stub\n')
      const id = await installFromLocalDir(pagesDir, join(srcBase, 'app-c'), 'app-c')
      const raw = JSON.parse(readFileSync(join(pagesDir, id, 'container.json'), 'utf-8'))
      expect(raw.kind).toBe('page')
      expect(raw.name).toBe('app-c')
      expect(raw.port).toBeUndefined() // no port given → left to the project's own listener
    } finally {
      rmSync(srcBase, { recursive: true, force: true })
      rmSync(pagesDir, { recursive: true, force: true })
    }
  })

  it('detects a bin-only CLI as a terminal page with a start command', async () => {
    const srcBase = mkdtempSync(join(tmpdir(), 'dsh-inst-src-'))
    const pagesDir = mkdtempSync(join(tmpdir(), 'dsh-inst-pages-'))
    try {
      mkdirSync(join(srcBase, 'cli-a'))
      writeFileSync(
        join(srcBase, 'cli-a', 'package.json'),
        JSON.stringify({ name: 'cli-a', bin: { 'cli-a': './cli.js' }, scripts: { start: 'node cli.js' } })
      )
      writeFileSync(join(srcBase, 'cli-a', 'cli.js'), '// cli stub\n')
      // No server.js / index.js: without terminal detection readPageMeta would reject it as an
      // unrunnable page and roll the import back — surviving here proves the CLI was detected.
      const id = await installFromLocalDir(pagesDir, join(srcBase, 'cli-a'), 'cli-a')
      const raw = JSON.parse(readFileSync(join(pagesDir, id, 'container.json'), 'utf-8'))
      expect(raw.kind).toBe('terminal')
      expect(raw.startCommand).toBe('npm run start')
    } finally {
      rmSync(srcBase, { recursive: true, force: true })
      rmSync(pagesDir, { recursive: true, force: true })
    }
  })

  it('falls back to the bin file when a CLI has no start script', async () => {
    const srcBase = mkdtempSync(join(tmpdir(), 'dsh-inst-src-'))
    const pagesDir = mkdtempSync(join(tmpdir(), 'dsh-inst-pages-'))
    try {
      mkdirSync(join(srcBase, 'cli-b'))
      writeFileSync(
        join(srcBase, 'cli-b', 'package.json'),
        JSON.stringify({ name: 'cli-b', bin: './run.js' })
      )
      writeFileSync(join(srcBase, 'cli-b', 'run.js'), '// cli stub\n')
      const id = await installFromLocalDir(pagesDir, join(srcBase, 'cli-b'), 'cli-b')
      const raw = JSON.parse(readFileSync(join(pagesDir, id, 'container.json'), 'utf-8'))
      expect(raw.kind).toBe('terminal')
      expect(raw.startCommand).toBe('node run.js')
    } finally {
      rmSync(srcBase, { recursive: true, force: true })
      rmSync(pagesDir, { recursive: true, force: true })
    }
  })

  it('keeps a bin package that also depends on a server framework as a page', async () => {
    const srcBase = mkdtempSync(join(tmpdir(), 'dsh-inst-src-'))
    const pagesDir = mkdtempSync(join(tmpdir(), 'dsh-inst-pages-'))
    try {
      mkdirSync(join(srcBase, 'srv-a'))
      writeFileSync(
        join(srcBase, 'srv-a', 'package.json'),
        JSON.stringify({ name: 'srv-a', bin: './server.js', dependencies: { express: '^4' } })
      )
      writeFileSync(join(srcBase, 'srv-a', 'server.js'), '// stub\n')
      const id = await installFromLocalDir(pagesDir, join(srcBase, 'srv-a'), 'srv-a', 4000)
      const raw = JSON.parse(readFileSync(join(pagesDir, id, 'container.json'), 'utf-8'))
      expect(raw.kind).toBe('page')
      expect(raw.port).toBe(4000)
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

  it('streams byte-weighted progress and skips node_modules/.git during a local copy', async () => {
    const srcBase = mkdtempSync(join(tmpdir(), 'dsh-inst-src-'))
    const pagesDir = mkdtempSync(join(tmpdir(), 'dsh-inst-pages-'))
    try {
      const app = join(srcBase, 'app-e')
      mkdirSync(join(app, 'src'), { recursive: true })
      mkdirSync(join(app, 'node_modules', 'dep'), { recursive: true })
      mkdirSync(join(app, '.git'), { recursive: true })
      writeFileSync(join(app, 'server.js'), '// entry\n')
      writeFileSync(join(app, 'src', 'a.ts'), 'export const a = 1\n')
      writeFileSync(join(app, 'node_modules', 'dep', 'x.js'), 'junk')
      writeFileSync(join(app, '.git', 'HEAD'), 'ref: refs/heads/main')
      const events: InstallProgress[] = []
      const id = await installFromLocalDir(pagesDir, app, 'app-e', 17701, undefined, (p) =>
        events.push(p)
      )
      // The copied tree lands; excluded dirs do not.
      expect(existsSync(join(pagesDir, id, 'server.js'))).toBe(true)
      expect(existsSync(join(pagesDir, id, 'src', 'a.ts'))).toBe(true)
      expect(existsSync(join(pagesDir, id, 'node_modules'))).toBe(false)
      expect(existsSync(join(pagesDir, id, '.git'))).toBe(false)
      // Progress contract: dir op, a receiving phase seen, monotonic percentage ending at 100.
      expect(events.every((e) => e.op === 'dir')).toBe(true)
      const phases = events.map((e) => e.phase)
      expect(phases).toContain('receiving')
      expect(phases[phases.length - 1]).toBe('done')
      const percents = events
        .filter((e) => typeof e.percent === 'number')
        .map((e) => e.percent as number)
      expect(percents.length).toBeGreaterThan(1)
      for (let i = 1; i < percents.length; i++) {
        expect(percents[i]).toBeGreaterThanOrEqual(percents[i - 1])
      }
      expect(percents[percents.length - 1]).toBe(100)
    } finally {
      rmSync(srcBase, { recursive: true, force: true })
      rmSync(pagesDir, { recursive: true, force: true })
    }
  })
})

describe('installFromLocalDir capability gate', () => {
  it('rejects a non-node (Rust) project before copying anything', async () => {
    const srcBase = mkdtempSync(join(tmpdir(), 'dsh-gate-src-'))
    const pagesDir = mkdtempSync(join(tmpdir(), 'dsh-gate-pages-'))
    try {
      mkdirSync(join(srcBase, 'rusty'))
      writeFileSync(join(srcBase, 'rusty', 'Cargo.toml'), '[package]\nname = "rusty"\n')
      writeFileSync(
        join(srcBase, 'rusty', 'package.json'),
        JSON.stringify({ name: 'rusty', private: true })
      )
      await expect(installFromLocalDir(pagesDir, join(srcBase, 'rusty'), 'rusty')).rejects.toThrow(
        /Rust/
      )
      // The gate runs first: no half-copied tree is left behind to re-trigger a copy.
      expect(existsSync(join(pagesDir, 'rusty'))).toBe(false)
    } finally {
      rmSync(srcBase, { recursive: true, force: true })
      rmSync(pagesDir, { recursive: true, force: true })
    }
  })

  it('accepts a zero-dependency page even with autoInstall on (no install step fires)', async () => {
    const srcBase = mkdtempSync(join(tmpdir(), 'dsh-gate-src-'))
    const pagesDir = mkdtempSync(join(tmpdir(), 'dsh-gate-pages-'))
    try {
      mkdirSync(join(srcBase, 'plain'))
      writeFileSync(join(srcBase, 'plain', 'server.js'), '// entry\n')
      const events: InstallProgress[] = []
      const id = await installFromLocalDir(pagesDir, join(srcBase, 'plain'), 'plain', 4321, undefined, (p) => events.push(p), { autoInstall: true })
      expect(existsSync(join(pagesDir, id, 'container.json'))).toBe(true)
      // A green project never enters the installing phase.
      expect(events.map((e) => e.phase)).not.toContain('installing')
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

  it('also deletes the capability dir an imported npm CLI recorded in its manifest', () => {
    const pagesDir = mkdtempSync(join(tmpdir(), 'dsh-inst-rm2-'))
    const capBase = mkdtempSync(join(tmpdir(), 'dsh-inst-cap-'))
    try {
      const page = join(pagesDir, 'codex')
      mkdirSync(page, { recursive: true })
      const capDir = join(capBase, 'codex')
      mkdirSync(join(capDir, 'node_modules', '@openai'), { recursive: true })
      writeFileSync(
        join(page, 'container.json'),
        JSON.stringify({
          name: 'codex',
          kind: 'terminal',
          startCommand: 'node "entry"',
          npmPackage: '@openai/codex',
          capabilityDir: capDir
        })
      )
      removePage(pagesDir, 'codex')
      expect(existsSync(page)).toBe(false)
      // The real files under userData/capabilities/<id> are uninstalled too, never orphaned.
      expect(existsSync(capDir)).toBe(false)
    } finally {
      rmSync(pagesDir, { recursive: true, force: true })
      rmSync(capBase, { recursive: true, force: true })
    }
  })
})

describe('parseNpmSpec', () => {
  it('splits name and version, scoped or plain', () => {
    expect(parseNpmSpec('@openai/codex@latest')).toEqual({
      pkg: '@openai/codex',
      version: 'latest'
    })
    expect(parseNpmSpec('express')).toEqual({ pkg: 'express', version: undefined })
    expect(parseNpmSpec('express@4.19.2')).toEqual({ pkg: 'express', version: '4.19.2' })
    expect(parseNpmSpec('  @scope/name  ')).toEqual({ pkg: '@scope/name', version: undefined })
  })

  it('refuses empty or malformed specs before touching the network', () => {
    expect(() => parseNpmSpec('')).toThrow(/请输入要安装的 npm 包名/)
    expect(() => parseNpmSpec('@openai/codex@')).toThrow(/无效的 npm 包名/)
    expect(() => parseNpmSpec('bad name!')).toThrow(/无效的 npm 包名/)
    expect(() => parseNpmSpec('@noSlash')).toThrow(/无效的 npm 包名/)
    expect(() => parseNpmSpec('foo@bar@baz')).toThrow(/无效的 npm 包名/)
  })
})

describe('installFromNpm local guards', () => {
  it('refuses a bad spec without creating anything', async () => {
    const pagesDir = mkdtempSync(join(tmpdir(), 'dsh-npm-pages-'))
    try {
      await expect(installFromNpm(pagesDir, ' ')).rejects.toThrow(/请输入要安装的 npm 包名/)
      await expect(installFromNpm(pagesDir, 'not a pkg!')).rejects.toThrow(/无效的 npm 包名/)
      expect(readdirSync(pagesDir)).toEqual([])
    } finally {
      rmSync(pagesDir, { recursive: true, force: true })
    }
  })

  it('refuses to shadow an existing page folder', async () => {
    const pagesDir = mkdtempSync(join(tmpdir(), 'dsh-npm-pages-'))
    try {
      mkdirSync(join(pagesDir, 'openai-codex'), { recursive: true })
      await expect(installFromNpm(pagesDir, '@openai/codex@latest')).rejects.toThrow(/已存在/)
      // The existing folder stays untouched (no wrapper package.json written into it).
      expect(readdirSync(join(pagesDir, 'openai-codex'))).toEqual([])
    } finally {
      rmSync(pagesDir, { recursive: true, force: true })
    }
  })
})
