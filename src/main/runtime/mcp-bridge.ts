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
import { getContainerEndpoint } from './container-endpoint'
import type { McpServerSpec, McpToolInfo } from '../../shared/types'

/* ---- #11: the container's own HTTP MCP server, folded into every downstream export ----
   When the container MCP server is running, hosted agents should be able to drive the container
   back through it — so its loopback URL + bearer token are appended to the same bridge files the
   hub's stdio servers land in. Read through the container-endpoint leaf (no cycle); when the
   server is off this returns null and every export below is byte-for-byte the pre-#11 output. */
const CONTAINER_BRIDGE_ID = 'dsh-container'
function containerHttpEntry(): { id: string; url: string; headers: Record<string, string> } | null {
  const ep = getContainerEndpoint()
  if (!ep) return null
  return { id: CONTAINER_BRIDGE_ID, url: ep.url, headers: { authorization: `Bearer ${ep.bearerToken}` } }
}

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
 * Snapshot the hub into a standalone document. Every `enabled` spec travels to agents —
 * enabling a row is the user's statement that "this server is for agents to use", so an
 * enabled-but-not-auto-started row is injected too. `autoStart` now only governs whether the
 * hub proactively connects the row at boot (see mcp-hub.autoStartAll), not what agents see.
 * A stopped/disconnected row still contributes its command line (agents spawn their own
 * children). Tool lists ride only on connected rows — a catalog that handed out a stopped
 * server's tools would advertise calls that cannot land.
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

/** The `--mcp-config` JSON: hub id → command/args/env/cwd; plus the container's own HTTP row. */
export interface McpServersJsonEntry {
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  /** Streamable HTTP target (only the appended container row uses this shape). */
  url?: string
  headers?: Record<string, string>
}

export function buildMcpServersJson(
  servers: McpBridgeCatalog['servers']
): { mcpServers: Record<string, McpServersJsonEntry> } {
  const out: Record<string, McpServersJsonEntry> = {}
  for (const s of servers) {
    out[s.id] = {
      command: s.command,
      ...(s.args?.length ? { args: s.args } : {}),
      ...(s.env && Object.keys(s.env).length ? { env: s.env } : {}),
      ...(s.cwd ? { cwd: s.cwd } : {})
    }
  }
  const c = containerHttpEntry()
  if (c) out[c.id] = { url: c.url, headers: c.headers }
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
  // #11: the container's own Streamable-HTTP server, when it is running (codex reads `url`).
  const c = containerHttpEntry()
  if (c) {
    lines.push(`[mcp_servers.${c.id}]`)
    lines.push(`url = ${JSON.stringify(c.url)}`)
    lines.push(`[mcp_servers.${c.id}.headers]`)
    for (const [k, v] of Object.entries(c.headers)) lines.push(`${k} = ${JSON.stringify(v)}`)
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

/* ---- native adapter: openclaw (mcp.servers in openclaw.json) ---- */

/** openclaw reads a first-class MCP client registry from the top-level `mcp.servers`
    map in `openclaw.json`, and the embedded runtime connects them at boot. We write
    our generated entries under this namespace so a later sync can prune exactly the
    container-managed set and never touch the user's own `mcp.servers`. */
export const OPENCLAW_MCP_PREFIX = 'dsh__'

/** Collapse a hub id to a namespace-safe slug, dropping a redundant leading `dsh[-_]` so
    the shared-context server (id `dsh-workspace`) doesn't double-prefix into
    `dsh__dsh-workspace` (openclaw) / `dsh_dsh-workspace` (dsh). Shared by both adapters. */
function mcpNamespaceSlug(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^dsh[-_]+/i, '')
}

function openclawServerKey(id: string): string {
  return `${OPENCLAW_MCP_PREFIX}${mcpNamespaceSlug(id)}`
}

/** Merge the hub's stdio servers into an existing openclaw config object (pure, so the
    shadowing rules are unit-testable). Preserves every unrelated key and the user's own
    `mcp.servers`; replaces only the previously-written `dsh__*` entries. */
export function mergeOpenclawMcpConfig(
  cfg: Record<string, unknown>,
  servers: McpBridgeCatalog['servers']
): Record<string, unknown> {
  const mcp = (
    cfg.mcp && typeof cfg.mcp === 'object' && !Array.isArray(cfg.mcp)
      ? (cfg.mcp as Record<string, unknown>)
      : {}
  ) as Record<string, unknown>
  const cur = (
    mcp.servers && typeof mcp.servers === 'object' && !Array.isArray(mcp.servers)
      ? (mcp.servers as Record<string, unknown>)
      : {}
  ) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(cur)) if (!k.startsWith(OPENCLAW_MCP_PREFIX)) out[k] = v
  for (const s of servers) {
    out[openclawServerKey(s.id)] = {
      command: s.command,
      ...(s.args?.length ? { args: s.args } : {}),
      ...(s.cwd ? { cwd: s.cwd } : {}),
      ...(s.env && Object.keys(s.env).length ? { env: s.env } : {}),
      enabled: true
    }
  }
  // #11: the container's own HTTP server row (openclaw connects a `url` server directly).
  const c = containerHttpEntry()
  if (c) out[openclawServerKey(c.id)] = { url: c.url, headers: c.headers, enabled: true }
  return { ...cfg, mcp: { ...mcp, servers: out } }
}

/**
 * openclaw-only: compile the hub into the page's openclaw.json right before it spawns.
 * Best-effort and non-destructive: a config we can't parse (hand-edited JSON5) is left
 * untouched so openclaw keeps its own servers — mirroring the token seeder's discipline.
 */
export function syncOpenclawMcpConfig(
  servers: McpBridgeCatalog['servers'],
  cfgPath: string
): string {
  let cfg: Record<string, unknown> = {}
  if (existsSync(cfgPath)) {
    try {
      const parsed = JSON.parse(readFileSync(cfgPath, 'utf8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        cfg = parsed as Record<string, unknown>
      }
    } catch {
      return cfgPath // unparseable (comments/JSON5): never clobber the user's file
    }
  }
  writeText(cfgPath, JSON.stringify(mergeOpenclawMcpConfig(cfg, servers), null, 2) + '\n')
  return cfgPath
}

/* ---- native adapter: dsh (Cordis --patch overlay of dsh-mcp-client entries) ---- */

/** dsh is not a JSON-config MCP client: it is a Cordis plugin host, and MCP servers are
    contributed by the `@deepseek-ai/dsh-mcp-client` plugin — one patch entry per server,
    delivered as a non-destructive `--patch <file>` overlay (never the user's own
    cordis.patch.yml). The overlay is emitted as a JSON array, which is also valid YAML,
    so the plugin's YAML loader parses it without a YAML serializer dependency. */
export function dshMcpPatchFile(): string {
  return join(bridgeDir(), 'dsh-mcp.patch.json')
}

/** dsh requires `[A-Za-z0-9_-]{1,32}`, unique per scope; the derived name is also the
    tool namespace (`mcp__<serverName>__<tool>`). */
function dshServerName(id: string): string {
  return `dsh_${mcpNamespaceSlug(id)}`.slice(0, 32)
}

/**
 * One `dsh-mcp-client` plugin definition per enabled hub server (pure, testable).
 *
 * Shape matters: dsh's patch engine (`app-boot applyPatches`) reads a top-level array as
 * a list of *patches*, each matched to an existing node by `id` — so a bare
 * `[{id,name,config}]` fails every entry with "patch: entry <id> not found". To ADD new
 * plugin nodes we emit a single `insert` patch (no top-level id → `data.push(...insert)`
 * at the tree root). The document is a JSON array, which is also valid YAML.
 */
export function renderDshMcpPatch(servers: McpBridgeCatalog['servers']): unknown[] {
  const entries: unknown[] = servers.map((s) => ({
    id: `dsh-mcp-${mcpNamespaceSlug(s.id)}`,
    name: '@deepseek-ai/dsh-mcp-client',
    config: {
      serverName: dshServerName(s.id),
      transport: 'stdio',
      command: s.command,
      ...(s.args?.length ? { args: s.args } : {}),
      ...(s.cwd ? { cwd: s.cwd } : {}),
      ...(s.env && Object.keys(s.env).length ? { env: s.env } : {})
    }
  }))
  // #11: an http-transport row for the container's own server, when it is running.
  const c = containerHttpEntry()
  if (c) {
    entries.push({
      id: `dsh-mcp-${mcpNamespaceSlug(c.id)}`,
      name: '@deepseek-ai/dsh-mcp-client',
      config: { serverName: dshServerName(c.id), transport: 'http', url: c.url, headers: c.headers }
    })
  }
  return entries.length ? [{ insert: entries }] : []
}

/** Write the overlay file and return its path, or null when there is nothing to bridge
    (an empty patch would still make dsh load the plugin, so we skip the `--patch` flag). */
export function syncDshMcpPatch(servers: McpBridgeCatalog['servers']): string | null {
  const entries = renderDshMcpPatch(servers)
  if (!entries.length) return null
  writeText(dshMcpPatchFile(), JSON.stringify(entries, null, 2))
  return dshMcpPatchFile()
}
