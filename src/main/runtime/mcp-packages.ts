/**
 * The npm packages behind the container's built-in MCP servers, provisioned on demand
 * (no installer payload — same distribution model as dsh/openclaw: the bundled npm
 * downloads them into userData when the user asks). Keeps the id→package table and the
 * entry-point resolution here so mcp-hub (spawn specs) and update-service (check/row)
 * share one source of truth without importing each other.
 *
 * Layout: <root>/node_modules/@modelcontextprotocol/server-<id> where each package's own
 * `bin` field names its launcher JS. The root is injected by the main process at boot
 * (setMcpPackagesRoot) so this module stays electron-free and the path logic is testable
 * against a plain temp directory.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { McpPkgStatus } from '../../shared/types'

/** Built-in MCP row id → its npm package name. Order mirrors mcp-hub's curated defs. */
export const BUILTIN_MCP_PKG: Record<string, string> = {
  'sequential-thinking': '@modelcontextprotocol/server-sequential-thinking',
  memory: '@modelcontextprotocol/server-memory',
  everything: '@modelcontextprotocol/server-everything',
  filesystem: '@modelcontextprotocol/server-filesystem',
  context7: '@upstash/context7-mcp',
  playwright: '@playwright/mcp',
  github: '@modelcontextprotocol/server-github',
  'brave-search': '@modelcontextprotocol/server-brave-search'
}

/**
 * Synthetic package name carried by the update-check row so the panel can recognise the
 * group and route its install button (there is no real npm package under this name).
 */
export const MCP_PKG_GROUP = '@modelcontextprotocol/server-*'

let root: string | null = null

/** Wire the provisioning folder (userData/mcp) in from the main process at boot. */
export function setMcpPackagesRoot(dir: string): void {
  root = dir
}

export function mcpPackagesRoot(): string | null {
  return root
}

interface BinPkgJson {
  version?: unknown
  bin?: unknown
}

function readBinPkgJson(dir: string): BinPkgJson | null {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as BinPkgJson
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    /* not installed / unreadable */
  }
  return null
}

/**
 * Absolute path of a package's launcher JS, or null when the package is not provisioned.
 * Resolution mirrors installer.installFromNpm: string bin → use it; object bin → prefer
 * the entry keyed by the short name, else the first value.
 */
export function resolveMcpPkgEntry(pkgName: string, base = root): string | null {
  if (!base) return null
  const pkgDir = join(base, 'node_modules', ...pkgName.split('/'))
  const meta = readBinPkgJson(pkgDir)
  if (!meta) return null
  const short = pkgName.split('/').pop() as string
  let rel: string | null = null
  if (typeof meta.bin === 'string') rel = meta.bin
  else if (meta.bin && typeof meta.bin === 'object') {
    const map = meta.bin as Record<string, unknown>
    const pick = map[short] ?? Object.values(map).find((v) => typeof v === 'string')
    if (typeof pick === 'string') rel = pick
  }
  if (!rel) return null
  const entry = join(pkgDir, rel.replace(/^\.\//, ''))
  return existsSync(entry) ? entry : null
}

/** Installed version of one package (undefined when missing or package.json has none). */
export function mcpPkgVersion(pkgName: string, base = root): string | undefined {
  if (!base) return undefined
  const v = readBinPkgJson(join(base, 'node_modules', ...pkgName.split('/')))?.version
  return typeof v === 'string' && v ? v : undefined
}

/** Per-package provisioning state, keyed by built-in row id — panel + update row share it. */
export function mcpPackagesStatus(): McpPkgStatus[] {
  return Object.entries(BUILTIN_MCP_PKG).map(([id, pkg]) => ({
    id,
    pkg,
    installed: resolveMcpPkgEntry(pkg) !== null,
    version: mcpPkgVersion(pkg)
  }))
}

/** True only when every built-in server's launcher is on disk. */
export function mcpPackagesInstalled(): boolean {
  return Object.values(BUILTIN_MCP_PKG).every((pkg) => resolveMcpPkgEntry(pkg) !== null)
}
