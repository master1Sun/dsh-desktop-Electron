import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  BUILTIN_MCP_PKG,
  MCP_PKG_GROUP,
  resolveMcpPkgEntry,
  mcpPkgVersion,
  mcpPackagesStatus,
  mcpPackagesInstalled,
  setMcpPackagesRoot
} from '../src/main/runtime/mcp-packages'

/**
 * mcp-packages is electron-free (pure fs/path), so these tests drive it against a throwaway
 * temp root written straight to disk — mirroring the real userData/mcp layout the bundled npm
 * produces: <root>/node_modules/<pkg>/package.json + its `bin` launcher.
 */
let root: string

function seedPkg(pkgName: string, pkgJson: Record<string, unknown>, binFile?: string): string {
  const pkgDir = join(root, 'node_modules', ...pkgName.split('/'))
  mkdirSync(pkgDir, { recursive: true })
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify(pkgJson))
  if (binFile) {
    const binPath = join(pkgDir, binFile)
    mkdirSync(join(binPath, '..'), { recursive: true })
    writeFileSync(binPath, '// launcher\n')
  }
  return pkgDir
}

beforeEach(() => {
  root = join(tmpdir(), `dsh-mcp-pkgs-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(root, { recursive: true })
  setMcpPackagesRoot(root)
})

afterEach(() => {
  if (existsSync(root)) rmSync(root, { recursive: true, force: true })
})

describe('resolveMcpPkgEntry', () => {
  it('resolves a string bin to its absolute launcher path', () => {
    const pkg = '@modelcontextprotocol/server-memory'
    seedPkg(pkg, { version: '1.2.3', bin: 'index.js' }, 'index.js')
    expect(resolveMcpPkgEntry(pkg)).toBe(join(root, 'node_modules', ...pkg.split('/'), 'index.js'))
  })

  it('prefers the short-name key of an object bin map', () => {
    const pkg = '@modelcontextprotocol/server-filesystem'
    seedPkg(
      pkg,
      { version: '0.9.0', bin: { 'server-filesystem': 'dist/cli.js', other: 'dist/other.js' } },
      'dist/cli.js'
    )
    expect(resolveMcpPkgEntry(pkg)).toBe(
      join(root, 'node_modules', ...pkg.split('/'), 'dist/cli.js')
    )
  })

  it('falls back to the first string value when the short-name key is absent', () => {
    const pkg = '@modelcontextprotocol/server-everything'
    seedPkg(pkg, { version: '1.0.0', bin: { weird: 'dist/main.js' } }, 'dist/main.js')
    expect(resolveMcpPkgEntry(pkg)).toContain(join('dist', 'main.js'))
  })

  it('returns null when the package is not provisioned', () => {
    expect(resolveMcpPkgEntry('@modelcontextprotocol/server-memory')).toBeNull()
  })

  it('returns null when package.json declares no runnable bin', () => {
    const pkg = '@modelcontextprotocol/server-memory'
    seedPkg(pkg, { version: '1.0.0' })
    expect(resolveMcpPkgEntry(pkg)).toBeNull()
  })

  it('returns null when the bin target file is missing on disk', () => {
    const pkg = '@modelcontextprotocol/server-memory'
    seedPkg(pkg, { version: '1.0.0', bin: 'index.js' }) // no binFile → file not written
    expect(resolveMcpPkgEntry(pkg)).toBeNull()
  })

  it('strips a leading ./ from the bin path', () => {
    const pkg = '@modelcontextprotocol/server-memory'
    seedPkg(pkg, { version: '1.0.0', bin: './run.js' }, 'run.js')
    expect(resolveMcpPkgEntry(pkg)).toBe(join(root, 'node_modules', ...pkg.split('/'), 'run.js'))
  })

  it('is null when no root has been wired in', () => {
    setMcpPackagesRoot(null as unknown as string)
    expect(resolveMcpPkgEntry('@modelcontextprotocol/server-memory')).toBeNull()
  })
})

describe('mcpPkgVersion', () => {
  it('reads the installed version', () => {
    const pkg = '@modelcontextprotocol/server-memory'
    seedPkg(pkg, { version: '3.4.5', bin: 'index.js' }, 'index.js')
    expect(mcpPkgVersion(pkg)).toBe('3.4.5')
  })

  it('is undefined for a missing package', () => {
    expect(mcpPkgVersion('@modelcontextprotocol/server-memory')).toBeUndefined()
  })
})

describe('mcpPackagesStatus / mcpPackagesInstalled', () => {
  it('reports every built-in as not installed against an empty root', () => {
    const st = mcpPackagesStatus()
    expect(st).toHaveLength(Object.keys(BUILTIN_MCP_PKG).length)
    expect(st.every((s) => !s.installed)).toBe(true)
    expect(mcpPackagesInstalled()).toBe(false)
  })

  it('marks installed + version once packages land on disk', () => {
    for (const pkg of Object.values(BUILTIN_MCP_PKG)) {
      seedPkg(pkg, { version: '1.0.0', bin: 'index.js' }, 'index.js')
    }
    const st = mcpPackagesStatus()
    expect(st.every((s) => s.installed)).toBe(true)
    expect(st.every((s) => s.version === '1.0.0')).toBe(true)
    expect(mcpPackagesInstalled()).toBe(true)
  })

  it('is partial: installed flag is per-package, aggregate stays false until all land', () => {
    const [first, ...rest] = Object.entries(BUILTIN_MCP_PKG)
    seedPkg(first[1], { version: '2.0.0', bin: 'index.js' }, 'index.js')
    const st = mcpPackagesStatus()
    expect(st.find((s) => s.id === first[0])?.installed).toBe(true)
    expect(rest.every(([, pkg]) => st.find((s) => s.pkg === pkg)?.installed === false)).toBe(true)
    expect(mcpPackagesInstalled()).toBe(false)
  })
})

describe('MCP_PKG_GROUP', () => {
  it('is a synthetic marker under the @modelcontextprotocol scope the renderer matches on', () => {
    expect(MCP_PKG_GROUP.startsWith('@modelcontextprotocol/')).toBe(true)
  })
})
