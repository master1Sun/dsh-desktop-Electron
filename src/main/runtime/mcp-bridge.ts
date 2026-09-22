/**
 * MCP downstream bridge: hands the hub's registry to the *hosted agents* instead
 * of leaving it usable only from the container UI.
 *
 * Two channels, because "the agent" is not one thing:
 *  - Shared exports (always on): every hub change rewrites two files under
 *    `userData/mcp-bridge/` — `mcp-catalog.json` (specs + the live tool catalog with
 *    input schemas) and `mcp-servers.json` (the `mcpServers` shape `codex --mcp-config`
 *    and kin consume). Each spawned page learns both paths through DSH_MCP_BRIDGE_DIR /
 *    DSH_MCP_CATALOG / DSH_MCP_CONFIG_JSON, so any agent can discover the catalog
 *    without the container knowing its config format.
 *  - Native adapters (per detected agent): a codex page gets its `CODEX_HOME/config.toml`
 *    synced right before launch — the hub's servers land inside a marker-delimited
 *    `[mcp_servers.*]` block so user-authored TOML outside (and inside!) the block is
 *    preserved, minus entries the block would shadow.
 *
 * Deliberately *not* a proxy: agents spawn their own stdio children from the same
 * specs rather than sharing the hub's live connections. One process per consumer is
 * how the MCP ecosystem itself works (each client owns its servers); the hub stays
 * the human-curated registry, the bridge its compiler.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import { expandHome } from '../shell/store'
import type { McpServerSpec, McpToolInfo } from '../../shared/types'

/* ---- paths ---- */

/** Export directory under userData; created on first write, never on read. */
export function bridgeDir(): string {
  return join(app.getPath('userData'), 'mcp-bridge')
}
/** Full machine-readable catalog: specs + connected tools (schemas included). */
export function bridgeCatalogFile(): string {
  return join(bridgeDir(), 'mcp-catalog.json')
}
/** `{"mcpServers": …}` — the `codex --mcp-config <file>` shape. */
export function bridgeConfigFile(): string {
  return join(bridgeDir(), 'mcp-servers.json')
}

/* ---- pure: catalog building (exported for tests) ---- */

export interface McpBridgeCatalog {
  version: number
  generatedAt: string
  servers: Array<
    McpServerSpec & {
      status: string
      tools: Array<{ name: string; title?: string; description?: string; inputSchema?: unknown }>
    }
  >
}

/**
 * Snapshot the hub into a standalone document. Only enabled specs travel: a
 * disabled row is the user saying "not this one", and a stopped server still
 * contributes its command line (agents spawn their own children). Tool lists ride
 * only on connected rows — a catalog that handed out a stopped server's tools
 * would advertise calls that cannot land.
 */
export function buildCatalog(
  servers: Array<{ spec: McpServerSpec; status: string }>,
  tools: McpToolInfo[]
): McpBridgeCatalog {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    servers: servers
      .filter((s) => s.spec.enabled !== false)
      .map((s) => ({
        ...s.spec,
        status: s.status,
        tools: (s.status === 'connected' ? tools : [])
          .filter((t) => t.serverId === s.spec.id)
          .map((t) => ({
            name: t.name,
            ...(t.title ? { title: t.title } : {}),
            ...(t.description ? { description: t.description } : {}),
            ...(t.inputSchema ? { inputSchema: t.inputSchema } : {})
          }))
      }))
  }
}

/** The `--mcp-config` JSON: hub id → command/args/env/cwd, nothing else. */
export function buildMcpServersJson(
  servers: McpBridgeCatalog['servers']
): { mcpServers: Record<string, { command: string; args?: string[]; env?: Record<string, string>; cwd?: string }> } {
  const out: Record<string, { command: string; args?: string[]; env?: Record<string, string>; cwd?: string }> = {}
  for (const s of servers) {
    out[s.id] = {
      command: s.command,
      ...(s.args?.length ? { args: s.args } : {}),
      ...(s.env && Object.keys(s.env).length ? { env: s.env } : {}),
      ...(s.cwd ? { cwd: s.cwd } : {})
    }
  }
  return { mcpServers: out }
}

/* ---- pure: codex config.toml adapter ---- */

const BRIDGE_BEGIN = '# >>> dsh-mcp-bridge >>> (managed by 桌面控制台 MCP hub; edit above/below, never between)'
const BRIDGE_END = '# <<< dsh-mcp-bridge <<<'

/** One `[mcp_servers.<id>]` block per enabled spec; TOML strings via JSON escaping. */
export function renderCodexBlock(servers: McpBridgeCatalog['servers']): string {
  const lines: string[] = [BRIDGE_BEGIN]
  for (const s of servers) {
    lines.push(`[mcp_servers.${s.id}]`)
    lines.push(`command = ${JSON.stringify(s.command)}`)
    if (s.args?.length) {
      lines.push(`args = [${s.args.map((a) => JSON.stringify(a)).join(', ')}]`)
    }
    if (s.cwd) lines.push(`cwd = ${JSON.stringify(s.cwd)}`)
    if (s.env && Object.keys(s.env).length) {
      lines.push(`[mcp_servers.${s.id}.env]`)
      for (const [k, v] of Object.entries(s.env)) lines.push(`${k} = ${JSON.stringify(v)}`)
    }
    lines.push('')
  }
  lines.push(BRIDGE_END)
  return lines.join('\n')
}

/** Does a *user* copy of one of these tables live outside the managed block? */
function hasUserTomlTable(outside: string, id: string): boolean {
  return new RegExp(`^\\s*\\[\\s*mcp_servers\\s*\\.\\s*${id.replace(/-/g, '\\-')}\\s*\\]`, 'm').test(outside)
}

/**
 * Merge the fresh block into an existing config.toml. No markers → append. A user
 * re-typed the marker pair by hand → the outermost pair wins (deterministic). A
 * user `[mcp_servers.x]` outside the block shadows the generated entry (codex reads
 * a table by name, last definition wins is *not* a TOML promise), so the generated
 * twin is dropped rather than duplicated.
 */
export function mergeCodexToml(existing: string, servers: McpBridgeCatalog['servers']): string {
  const begin = existing.indexOf(BRIDGE_BEGIN)
  const end = existing.lastIndexOf(BRIDGE_END)
  const hasBlock = begin >= 0 && end > begin
  const head = hasBlock ? existing.slice(0, begin) : existing
  const tail = hasBlock ? existing.slice(end + BRIDGE_END.length) : ''
  const kept = servers.filter((s) => !hasUserTomlTable(head + tail, s.id))
  if (!hasBlock && !kept.length) return existing // nothing to add and nothing to replace: touch no markers
  const block = renderCodexBlock(kept)
  const glue = (part: string): string => (part && !part.endsWith('\n') ? `${part}\n` : part)
  return `${glue(head)}${block}\n${tail.replace(/^\n/, '')}`
}

/* ---- pure: env injection ---- */

/** The three pointer vars every spawned agent receives. Paths are strings, so the
    catalog can be empty without the contract lying. */
export function bridgeEnvVars(): Record<string, string> {
  return {
    DSH_MCP_BRIDGE_DIR: bridgeDir(),
    DSH_MCP_CATALOG: bridgeCatalogFile(),
    DSH_MCP_CONFIG_JSON: bridgeConfigFile()
  }
}

/* ---- detection ---- */

/** Which native adapter (today: only codex) drives this start command? */
export function detectMcpAgent(startCommand: string): 'codex' | null {
  return /codex(\b|\.)/i.test(startCommand || '') ? 'codex' : null
}

/* ---- IO ---- */

function writeText(file: string, text: string): void {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, text, 'utf8')
}

/** Rewrite the shared exports; called on every hub change (debounced by the hub). */
export function exportBridgeFiles(
  servers: Array<{ spec: McpServerSpec; status: string }>,
  tools: McpToolInfo[]
): void {
  const catalog = buildCatalog(servers, tools)
  writeText(bridgeCatalogFile(), JSON.stringify(catalog, null, 2))
  writeText(bridgeConfigFile(), JSON.stringify(buildMcpServersJson(catalog.servers), null, 2))
}

/**
 * Codex-only: compile the hub into CODEX_HOME/config.toml right before the page
 * spawns. `home` honors the page's resolved CODEX_HOME (else codex's own
 * `~/.codex` default). Best-effort: a read-only home must not fail the launch —
 * codex simply starts without the bridged servers.
 */
export function syncCodexConfig(servers: McpBridgeCatalog['servers'], home?: string): string {
  const dir = home
    ? expandHome(home)
    : process.env.CODEX_HOME
      ? expandHome(process.env.CODEX_HOME)
      : join(homedir(), '.codex')
  const file = join(dir, 'config.toml')
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : ''
  writeText(file, mergeCodexToml(existing, servers))
  return file
}
