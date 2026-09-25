import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import {
  classifyProject,
  detectNonNodeStack,
  hasServerDependency,
  readPkgSafe,
  npmSuggestionFor,
  runtimeDepCount
} from '../src/main/runtime/pages/project-classify'

/** Create a throwaway project dir, run `body`, then clean it up. */
function withProject(body: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-classify-'))
  try {
    body(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('classifyProject tiers', () => {
  it('greens a zero-dependency server page (server.js, no package.json)', () => {
    withProject((dir) => {
      writeFileSync(join(dir, 'server.js'), '// entry\n')
      const c = classifyProject(dir)
      expect(c.tier).toBe('green')
      expect(c.kind).toBe('page')
      expect(c.needsInstall).toBe(false)
    })
  })

  it('yellows a page that declares runtime dependencies', () => {
    withProject((dir) => {
      writeFileSync(join(dir, 'server.js'), '// entry\n')
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'x', dependencies: { express: '^4' } })
      )
      const c = classifyProject(dir)
      expect(c.tier).toBe('yellow')
      expect(c.kind).toBe('page')
      expect(c.needsInstall).toBe(true)
    })
  })

  it('keeps a bin-only CLI as a terminal, capturing its start command', () => {
    withProject((dir) => {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'cli', bin: { cli: './cli.js' }, scripts: { start: 'node cli.js' } })
      )
      writeFileSync(join(dir, 'cli.js'), '// cli\n')
      const c = classifyProject(dir)
      expect(c.tier).toBe('green')
      expect(c.kind).toBe('terminal')
      expect(c.startCommand).toBe('npm run start')
    })
  })

  it('reds a Rust project that has no node entry (openai/codex shape)', () => {
    withProject((dir) => {
      writeFileSync(join(dir, 'Cargo.toml'), '[package]\nname = "codex"\n')
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'codex', private: true }))
      const c = classifyProject(dir)
      expect(c.tier).toBe('red')
      expect(c.kind).toBeUndefined()
      expect(c.reason).toBe('install.rejectNonNode')
      expect(c.reasonParams?.stack).toBe('Rust')
    })
  })

  it('reds a Go module', () => {
    withProject((dir) => {
      writeFileSync(join(dir, 'go.mod'), 'module example.com/x\n')
      const c = classifyProject(dir)
      expect(c.tier).toBe('red')
      expect(c.reason).toBe('install.rejectNonNode')
    })
  })

  it('reds a monorepo root (private + workspaces, no run entry)', () => {
    withProject((dir) => {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'root', private: true, workspaces: ['packages/*'] })
      )
      const c = classifyProject(dir)
      expect(c.tier).toBe('red')
      expect(c.reason).toBe('install.rejectMonorepoRoot')
    })
  })

  it('reds an empty folder with no inferable entry', () => {
    withProject((dir) => {
      mkdirSync(join(dir, 'src'))
      writeFileSync(join(dir, 'README.md'), '# nothing runnable\n')
      const c = classifyProject(dir)
      expect(c.tier).toBe('red')
      expect(c.reason).toBe('install.rejectNoEntry')
    })
  })

  it('a runnable node entry wins over a stray non-node marker', () => {
    withProject((dir) => {
      // A JS server that also happens to carry a Python helper file is still a page.
      writeFileSync(join(dir, 'requirements.txt'), 'flask\n')
      writeFileSync(join(dir, 'server.js'), '// entry\n')
      const c = classifyProject(dir)
      expect(c.tier).toBe('green')
      expect(c.kind).toBe('page')
    })
  })
})

describe('helpers', () => {
  it('detectNonNodeStack names the stack, incl. .NET solution files', () => {
    withProject((dir) => {
      writeFileSync(join(dir, 'App.csproj'), '<Project/>')
      expect(detectNonNodeStack(dir)).toBe('.NET / C++')
    })
  })

  it('hasServerDependency reads both deps and devDeps', () => {
    expect(hasServerDependency({ devDependencies: { express: '^4' } })).toBe(true)
    expect(hasServerDependency({ dependencies: { lodash: '^4' } })).toBe(false)
    expect(hasServerDependency(null)).toBe(false)
  })

  it('readPkgSafe returns null for a missing/invalid package.json', () => {
    withProject((dir) => {
      expect(readPkgSafe(dir)).toBeNull()
      writeFileSync(join(dir, 'package.json'), '{ not json')
      expect(readPkgSafe(dir)).toBeNull()
    })
  })

  it('npmSuggestionFor maps known repos (url / short / local path) to their published CLI', () => {
    expect(npmSuggestionFor('https://github.com/openai/codex.git')).toBe('@openai/codex')
    expect(npmSuggestionFor('openai/codex')).toBe('@openai/codex')
    expect(npmSuggestionFor('D:\\GitProject\\codex')).toBe('@openai/codex')
    expect(npmSuggestionFor('git@github.com:anthropics/claude-code.git')).toBe(
      '@anthropic-ai/claude-code'
    )
    // Unknown sources get no suggestion rather than a wrong guess.
    expect(npmSuggestionFor('https://github.com/somebody/nothing')).toBeNull()
    expect(npmSuggestionFor('')).toBeNull()
  })

  it('runtimeDepCount includes optionalDependencies (CLI dists ship their binary there)', () => {
    expect(
      runtimeDepCount({
        dependencies: { a: '1' },
        optionalDependencies: { 'pkg-win32-x64': '1' }
      })
    ).toBe(2)
    // @openai/codex itself: zero deps, only optional platform packages → must count as 6.
    expect(
      runtimeDepCount({
        optionalDependencies: {
          '@openai/codex-linux-x64': 'x',
          '@openai/codex-linux-arm64': 'x',
          '@openai/codex-darwin-x64': 'x',
          '@openai/codex-darwin-arm64': 'x',
          '@openai/codex-win32-x64': 'x',
          '@openai/codex-win32-arm64': 'x'
        }
      })
    ).toBe(6)
    expect(runtimeDepCount({ devDependencies: { only: '1' } })).toBe(0)
    expect(runtimeDepCount(null)).toBe(0)
    // Such a package is yellow, not green: without the optional payload the launcher dies.
    withProject((dir) => {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'cli-dist', bin: './cli.js', optionalDependencies: { 'cli-win32-x64': '1' } })
      )
      writeFileSync(join(dir, 'cli.js'), '#!/usr/bin/env node\n')
      const c = classifyProject(dir)
      expect(c.tier).toBe('yellow')
      expect(c.kind).toBe('terminal')
      expect(c.needsInstall).toBe(true)
    })
  })
})
