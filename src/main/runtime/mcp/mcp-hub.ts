/**
 * MCP Client Hub: the container is the MCP *client* for a user-managed registry
 * of stdio MCP servers. Each registered server is spawned on demand as a child
 * process (via the official SDK's StdioClientTransport, which resolves `.cmd`
 * shims on Windows through cross-spawn); the hub keeps the connection, caches
 * the server's tool list, and proxies tool calls back over the same channel.
 *
 * Star topology by design: agents and the UI never talk to a server process
 * directly — everything goes through the hub so spawns are traceable, child
 * processes die with the container, and one aggregated tool catalog exists.
 *
 * Specs persist in their own electron-store file (`mcp-servers.json`, kept out
 * of container-settings so a settings snapshot/restore never clobbers the
 * registry). Live state never persists: every connection starts at 'stopped'.
 */
import { EventEmitter } from 'node:events'
import { homedir } from 'node:os'
import { parse as parsePath } from 'node:path'
import Store from 'electron-store'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { logEvent } from '../../shell/events'
import { m } from '../../shell/i18n'
import { resolveDownloadDir } from '../../shell/store'
import { getNodeExePath } from '../cli/node-runtime'
import { BUILTIN_MCP_PKG, RETIRED_MCP_PKG, resolveMcpPkgEntry } from './mcp-packages'
import { exportBridgeFiles } from './mcp-bridge'
import { WORKSPACE_MCP_ID, workspaceMcpSpec } from './workspace-mcp'
import type {
  McpCallToolArgs,
  McpCallToolResult,
  McpCallEvent,
  McpServerSpec,
  McpServerState,
  McpServerStatus,
  McpToolInfo
} from '../../../shared/types'

/** Handshake + listTools budget for one server; a hung spawn must not wedge the panel. */
const CONNECT_TIMEOUT_MS = 30_000
/** Default budget for one tool call; slow servers (browser automation…) can raise it per call. */
export const MCP_CALL_TOOL_TIMEOUT_MS = 60_000

/** One live hub row: the persisted spec plus everything the connection produced. */
interface HubEntry {
  spec: McpServerSpec
  status: McpServerStatus
  client?: Client
  transport?: StdioClientTransport
  serverInfo?: { name: string; version?: string }
  tools: McpToolInfo[]
  lastError?: string
}

/* ---- persistence ---- */

interface McpStoreShape {
  servers: McpServerSpec[]
  /** seeded default ids the user deleted — ensureSeeded never resurrects these */
  dismissed: string[]
}

let store: Store<McpStoreShape> | null = null
function mcpStore(): Store<McpStoreShape> {
  if (!store) {
    store = new Store<McpStoreShape>({
      name: 'mcp-servers',
      defaults: { servers: [], dismissed: [] } as McpStoreShape
    })
  }
  return store
}

/* ---- pure validation (exported for tests) ---- */

/** slug-safe id: letters/digits/dash/underscore, 1..40 chars — it namespaces tool keys. */
export function isValidMcpId(id: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,39}$/i.test(id)
}

/**
 * Normalize + validate a user-authored spec. Returns the cleaned spec or a list
 * of human-readable problems (empty = valid). Unknown fields are dropped, so a
 * hand-edited store file can't smuggle junk into the spawn args.
 */
export function sanitizeMcpSpec(raw: unknown): { spec?: McpServerSpec; errors: string[] } {
  const errors: string[] = []
  const r = (raw ?? {}) as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id.trim() : ''
  if (!id) errors.push(m('mcp.errNoId'))
  else if (!isValidMcpId(id)) errors.push(m('mcp.errBadId', { id }))
  const command = typeof r.command === 'string' ? r.command.trim() : ''
  if (!command) errors.push(m('mcp.errNoCommand'))
  const args = Array.isArray(r.args)
    ? r.args.filter((a): a is string => typeof a === 'string')
    : []
  const env: Record<string, string> = {}
  if (r.env && typeof r.env === 'object' && !Array.isArray(r.env)) {
    for (const [k, v] of Object.entries(r.env as Record<string, unknown>)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
        errors.push(m('mcp.errBadEnvKey', { key: k }))
        continue
      }
      if (v !== undefined && v !== null) env[k] = String(v)
    }
  }
  if (r.cwd !== undefined && typeof r.cwd !== 'string') errors.push(m('mcp.errBadCwd'))
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : id
  if (errors.length) return { errors }
  return {
    spec: {
      id,
      name,
      command,
      args,
      env: Object.keys(env).length ? env : undefined,
      cwd: typeof r.cwd === 'string' && r.cwd.trim() ? r.cwd.trim() : undefined,
      enabled: r.enabled !== false,
      autoStart: r.autoStart === true
    },
    errors: []
  }
}

/** Flatten MCP content blocks into display text; non-text blocks are JSON-inlined. */
export function flattenToolContent(content: unknown): string {
  if (!Array.isArray(content)) return typeof content === 'string' ? content : ''
  return content
    .map((block) => {
      if (block && typeof block === 'object' && (block as { type?: string }).type === 'text') {
        return String((block as { text?: unknown }).text ?? '')
      }
      return JSON.stringify(block)
    })
    .join('\n')
}

/* ---- hub ---- */

const entries = new Map<string, HubEntry>()
/** in-flight connect promises so a double-click on 连接 can't spawn two children. */
const connecting = new Map<string, Promise<void>>()
let shuttingDown = false

/** Emitted whenever any row's live state changed; ipc.ts broadcasts to all windows. */
export const hubEvents = new EventEmitter()

/* ---- call feed: a small ring of hub-forwarded tool calls, surfaced in the panel ----
 * Only calls made *through the hub* are observed (the panel's McpCallTool); an agent that
 * spawns its own third-party stdio server never routes here, so this is the container's own
 * call activity, not global MCP traffic. Ring bounded so memory is flat across a long session. */
const CALL_BUFFER_CAP = 200
const callEvents: McpCallEvent[] = []

function recordCall(evt: McpCallEvent): void {
  callEvents.push(evt)
  if (callEvents.length > CALL_BUFFER_CAP) callEvents.shift()
  hubEvents.emit('calls', getCalls())
}

/** Cold read of the buffered call feed, oldest→newest (a fresh window catches up in one shot). */
export function getCalls(): McpCallEvent[] {
  return [...callEvents]
}

function snapshot(): McpServerState[] {
  return [...entries.values()].map((e) => ({
    spec: e.spec,
    status: e.status,
    serverInfo: e.serverInfo,
    toolCount: e.tools.length,
    lastError: e.lastError
  }))
}

function emitChanged(): void {
  hubEvents.emit('changed', snapshot())
  scheduleBridgeExport()
}

/* ---- downstream bridge: re-export the agent-facing files after the chatter of a
       connect burst settles (one write per quiet period, not per state flip). ---- */
const BRIDGE_DEBOUNCE_MS = 400
let bridgeTimer: NodeJS.Timeout | null = null

function scheduleBridgeExport(): void {
  if (bridgeTimer) clearTimeout(bridgeTimer)
  bridgeTimer = setTimeout(() => {
    bridgeTimer = null
    try {
      exportBridgeFiles(effectiveServers(), listTools())
    } catch (err) {
      console.warn('[mcp-hub] bridge export failed:', (err as Error).message)
    }
  }, BRIDGE_DEBOUNCE_MS)
}

/**
 * #11: force a debounced re-export of the agent-facing bridge files. The container's own MCP
 * server calls this on start/stop so the appended HTTP row (its URL + bearer token) shows up in
 * — or is pruned from — every agent's config without waiting for the next hub state change.
 */
export function refreshBridge(): void {
  scheduleBridgeExport()
}

function loadSpecs(): McpServerSpec[] {
  const raw = mcpStore().get('servers')
  return Array.isArray(raw) ? raw : []
}

function persistSpecs(list: McpServerSpec[]): void {
  // Locked rows are owned by code, never the store: dropping them keeps the persisted file
  // free of entries a snapshot/restore could otherwise clobber or duplicate. Seeds DO persist
  // (they are ordinary user rows) — a dismissed tombstone keeps them seeding only once.
  mcpStore().set('servers', list.filter((s) => !isCodeOwnedId(s.id)) as never)
}

/* ---- curated servers: a small set of editable, deletable seeded defaults ---- */

/**
 * The container's curated MCP servers split in two:
 *  - LOCKED (none today): code-owned, never persisted, non-editable — kept as a mechanism for a
 *    future server whose invocation must never be widened by a stray edit.
 *  - SEED (`filesystem`, `playwright`): ordinary persisted rows — fully editable AND deletable.
 *    Deleting adds a tombstone so ensureSeeded never resurrects them; ids not yet seeded (a
 *    server added in a future update) still appear, so this list can grow.
 * Nothing is auto-started by default: every seed (except the code-owned shared-context row,
 * which always auto-connects) needs the user to switch 开机连接 on explicitly.
 * Every curated row launches its npm package. Once that package is downloaded to
 * userData/mcp the hub swaps the `npx -y` spec for a direct bundled-node launch at connect
 * time (effectiveSpawn) — so seeding keeps specs portable (no baked absolute paths) and any
 * user edit is honoured verbatim.
 */
interface CuratedDef {
  id: string
  /** false → seeded disabled (needs a user-supplied credential before it is usable) */
  enabled?: boolean
  /** true → auto-connect at container boot (both this and `enabled` must hold) */
  autoStart?: boolean
}
const LOCKED_MCP_DEFS: CuratedDef[] = []
const SEED_MCP_DEFS: CuratedDef[] = [
  { id: 'filesystem' },
  { id: 'playwright' }
]
export const LOCKED_MCP_IDS = new Set(LOCKED_MCP_DEFS.map((d) => d.id))
export const SEED_MCP_IDS = new Set(SEED_MCP_DEFS.map((d) => d.id))
/** Every curated id (locked ∪ seed) — what the on-demand package download provisions. */
export const CURATED_MCP_IDS = new Set([...LOCKED_MCP_IDS, ...SEED_MCP_IDS])

/** filesystem is the one curated row that carries an allowed-root positional argument. */
const hasDirArg = (id: string): boolean => id === 'filesystem'

/**
 * Seed env baked per curated id — for servers that need a switch set just to speak the hub's
 * stdio transport. open-websearch otherwise boots an HTTP/SSE server and never answers the
 * handshake, so we pin MODE=stdio. (The hub merges spec.env into the spawned child.)
 */
const CURATED_ENV: Record<string, Record<string, string>> = {
  'open-websearch': { MODE: 'stdio' }
}

/**
 * Allowed roots seeded for the editable `filesystem` row. We aim for "the whole disk" without
 * probing drives that could hang startup (an offline mapped network drive blocks existsSync on
 * Windows): derive the distinct drive roots behind paths we already know exist (download dir,
 * home, cwd). POSIX gets `/`. The row is a persisted seed, so the user can edit this set later.
 */
function filesystemAllowedRoots(): string[] {
  if (process.platform !== 'win32') return ['/']
  const roots = new Set<string>()
  for (const p of [resolveDownloadDir(), homedir(), process.cwd()]) {
    try {
      const root = parsePath(p).root
      if (root) roots.add(root)
    } catch {
      /* skip an unparseable candidate */
    }
  }
  return roots.size ? [...roots] : ['C:\\']
}

/** Canonical npx spec for one curated id; filesystem's allowed roots are its only positionals. */
function curatedSpec(def: CuratedDef): McpServerSpec {
  const pkg = BUILTIN_MCP_PKG[def.id]
  return {
    id: def.id,
    name: m(`mcp.builtin.${def.id}.name`),
    command: 'npx',
    args: hasDirArg(def.id) ? ['-y', pkg, ...filesystemAllowedRoots()] : ['-y', pkg],
    enabled: def.enabled ?? true,
    autoStart: def.autoStart === true,
    builtin: LOCKED_MCP_IDS.has(def.id),
    env: CURATED_ENV[def.id]
  }
}

/** The locked, code-owned rows, rebuilt every reconcile (command/name follow the locale). */
export function lockedMcpSpecs(): McpServerSpec[] {
  return LOCKED_MCP_DEFS.map(curatedSpec)
}

/**
 * Ids the container owns in code and never persists or lets the user edit: the curated locked
 * rows plus the shared-context server. The workspace row is kept out of LOCKED_MCP_IDS on purpose
 * — that set drives the curated *npm* provisioning (CURATED_MCP_IDS), which a container script
 * must not join.
 */
function isCodeOwnedId(id: string): boolean {
  return LOCKED_MCP_IDS.has(id) || id === WORKSPACE_MCP_ID
}

/** Code-owned rows handed to the hub each reconcile: curated locked + the shared-context server. */
function codeOwnedSpecs(): McpServerSpec[] {
  const ws = workspaceMcpSpec()
  return ws ? [...lockedMcpSpecs(), ws] : lockedMcpSpecs()
}

/** Still the untouched curated invocation? (a user who edited command/args owns it outright). */
function isDefaultCurated(spec: McpServerSpec): boolean {
  const pkg = BUILTIN_MCP_PKG[spec.id]
  return !!pkg && spec.command === 'npx' && (spec.args ?? []).includes(pkg)
}

/**
 * How to actually spawn a row: a curated row in its default form whose package is downloaded
 * runs the local launcher under the bundled node (dropping the `-y`/package tokens, keeping
 * any positional like filesystem's root); everything else runs exactly as authored.
 */
function effectiveSpawn(spec: McpServerSpec): { command: string; args: string[] } {
  const pkg = BUILTIN_MCP_PKG[spec.id]
  const entry = pkg && isDefaultCurated(spec) ? resolveMcpPkgEntry(pkg) : null
  if (entry && pkg) {
    const positional = (spec.args ?? []).filter((a) => a !== '-y' && a !== pkg)
    return { command: getNodeExePath(), args: [entry, ...positional] }
  }
  return { command: spec.command, args: spec.args ?? [] }
}

/** Bridge snapshot: curated rows exported with their direct-launch command baked in. */
function effectiveServers(): McpServerState[] {
  return listServers().map((s) => {
    const eff = effectiveSpawn(s.spec)
    return { ...s, spec: { ...s.spec, command: eff.command, args: eff.args } }
  })
}

/* ---- seeding ---- */

function loadDismissed(): string[] {
  const raw = mcpStore().get('dismissed')
  return Array.isArray(raw) ? raw : []
}

/** Record that the user deleted a seeded row so ensureSeeded never re-adds it. */
function dismissSeed(id: string): void {
  const set = new Set(loadDismissed())
  set.add(id)
  mcpStore().set('dismissed', [...set] as never)
}

/** Idempotent: append any curated seed the store doesn't have yet (and wasn't dismissed). */
function ensureSeeded(): void {
  pruneRetiredSeeds()
  const specs = loadSpecs()
  const present = new Set(specs.map((s) => s.id))
  const dismissed = new Set(loadDismissed())
  let changed = false
  for (const def of SEED_MCP_DEFS) {
    if (present.has(def.id)) continue
    if (dismissed.has(def.id)) continue
    specs.push(curatedSpec(def))
    present.add(def.id)
    changed = true
  }
  if (changed) persistSpecs(specs)
}

/** Remove a dismissal so (re-)saving an id under user ownership isn't masked by a stale tombstone. */
function undismissSeed(id: string): void {
  const set = new Set(loadDismissed())
  if (!set.delete(id)) return
  mcpStore().set('dismissed', [...set] as never)
}

/**
 * Retire the curated seeds an older version injected that this one no longer ships: the panel
 * kept more built-ins than we now curate, so drop those store rows once. Only rows still in
 * their untouched seeded form (`npx -y <old package> …`) go — a row the user edited is an
 * ordinary server they own, whatever its id. No tombstone is written: retired ids are no
 * longer seeds, so nothing can resurrect them, and pruning on every reconcile would otherwise
 * wipe a hand-added row reusing one of those ids. Packages already downloaded under
 * userData/mcp simply stop being referenced (harmless leftovers).
 */
function pruneRetiredSeeds(): void {
  const isRetiredDefault = (s: McpServerSpec): boolean => {
    const pkg = RETIRED_MCP_PKG[s.id]
    return !!pkg && s.command === 'npx' && (s.args ?? []).includes(pkg)
  }
  const specs = loadSpecs()
  const kept = specs.filter((s) => !isRetiredDefault(s))
  if (kept.length === specs.length) return
  persistSpecs(kept)
}

/** Rebuild in-memory rows from the persisted registry (idempotent; keeps live rows intact). */
function reconcile(): void {
  ensureSeeded()
  // Locked rows lead and are authoritative; a user row sharing a locked id is masked (the
  // locked one wins). Seeds are ordinary persisted rows, so they ride in via loadSpecs().
  const specs = [
    ...codeOwnedSpecs(),
    ...loadSpecs().filter((s) => !isCodeOwnedId(s.id))
  ]
  const alive = new Set(specs.map((s) => s.id))
  for (const id of [...entries.keys()]) {
    if (!alive.has(id)) {
      // The spec is gone (e.g. the shared-workspace switch was turned off): drop the row entirely
      // so a stale stopped entry does not linger in the snapshot.
      void disconnect(id).catch(() => undefined)
      entries.delete(id)
    }
  }
  for (const spec of specs) {
    const existing = entries.get(spec.id)
    if (existing) existing.spec = spec
    else entries.set(spec.id, { spec, status: 'stopped', tools: [] })
  }
}

export function listServers(): McpServerState[] {
  reconcile()
  return snapshot()
}

/**
 * Rebuild the built-in rows after their packages changed on disk (a fresh download) so the
 * specs pick up the local launcher entries, and re-export the agent bridge catalogs — the
 * codex config.toml / mcp-servers.json must show the direct command, not the npx fallback.
 */
export function refreshBuiltinPackages(): void {
  reconcile()
  emitChanged()
}

/** Add or update one spec. An update to a *live* server reconnects so the edit takes effect. */
export async function saveServer(raw: unknown): Promise<McpServerState[]> {
  const { spec, errors } = sanitizeMcpSpec(raw)
  if (!spec) throw new Error(errors.join('; '))
  if (isCodeOwnedId(spec.id)) throw new Error(m('mcp.errBuiltinEdit'))
  const specs = loadSpecs()
  const idx = specs.findIndex((s) => s.id === spec.id)
  if (idx >= 0) specs[idx] = spec
  else specs.push(spec)
  persistSpecs(specs)
  // The user now owns this row: drop any earlier dismissal so a later delete re-tombstones
  // against *this* spec's seeding status instead of masking a hand-re-added row.
  undismissSeed(spec.id)
  reconcile()
  const entry = entries.get(spec.id)
  if (entry && entry.status === 'connected') {
    await disconnect(spec.id).catch(() => undefined)
    void connect(spec.id).catch(() => undefined) // reconnect async; the panel follows via events
  }
  return snapshot()
}

export async function removeServer(id: string): Promise<McpServerState[]> {
  if (isCodeOwnedId(id)) throw new Error(m('mcp.errBuiltinRemove'))
  await disconnect(id).catch(() => undefined)
  entries.delete(id)
  persistSpecs(loadSpecs().filter((s) => s.id !== id))
  // Deleting a seeded default is permanent: tombstone it so reconcile's ensureSeeded skips it.
  if (SEED_MCP_IDS.has(id)) dismissSeed(id)
  emitChanged()
  return snapshot()
}

/** Open the stdio connection: spawn → initialize → listTools. Safe to await twice (deduped). */
export function connect(id: string): Promise<void> {
  const inflight = connecting.get(id)
  if (inflight) return inflight
  const run = doConnect(id).finally(() => connecting.delete(id))
  connecting.set(id, run)
  return run
}

async function doConnect(id: string): Promise<void> {
  const e = entries.get(id) ?? reconcileAndFind(id)
  if (!e) throw new Error(m('mcp.errUnknown', { id }))
  if (e.spec.enabled === false) throw new Error(m('mcp.errDisabled', { id }))
  if (e.status === 'connected') return
  if (e.status === 'connecting') return connecting.get(id) ?? Promise.resolve()
  e.status = 'connecting'
  e.lastError = undefined
  emitChanged()
  const startedAt = Date.now()
  try {
    const spawn = effectiveSpawn(e.spec)
    const transport = new StdioClientTransport({
      command: spawn.command,
      args: spawn.args,
      cwd: e.spec.cwd,
      env: { ...(getDefaultEnvironment() as Record<string, string>), ...(e.spec.env ?? {}) }
    })
    const client = new Client(
      { name: 'dsh-desktop-container', version: '1.0.0' },
      { capabilities: {} } // hub is a pure client: it offers no server-side capabilities back
    )
    // The child is already spawned by connect(); bound the handshake so a server
    // that never answers initialize can't leave the row stuck on 连接中.
    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, m('mcp.errHandshakeTimeout'))
    const listed = await withTimeout(client.listTools(), CONNECT_TIMEOUT_MS, m('mcp.errListToolsTimeout'))
    e.client = client
    e.transport = transport
    const meta = client.getServerVersion?.()
    if (meta?.name) e.serverInfo = { name: meta.name, version: meta.version }
    e.tools = (listed?.tools ?? []).map((t) => ({
      serverId: id,
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown> | undefined
    }))
    e.status = 'connected'
    // The child dying outside our disconnect() (crash, kill) must flip the row —
    // otherwise the badge lies green while the pipes are dead.
    transport.onclose = () => {
      if (e.status === 'connected' && !shuttingDown) {
        e.status = 'error'
        e.lastError = m('mcp.errClosed')
        e.tools = []
        emitChanged()
        logEvent({ level: 'warn', kind: 'mcp.lost', pageId: id })
      }
    }
    logEvent({
      level: 'info',
      kind: 'mcp.connected',
      pageId: id,
      meta: { tools: e.tools.length, ms: Date.now() - startedAt }
    })
  } catch (err) {
    e.status = 'error'
    // A curated row in its default npx form whose package isn't provisioned yet: name the
    // real fix (download the component) instead of a bare spawn ENOENT the user can't act on.
    e.lastError =
      isDefaultCurated(e.spec) && !resolveMcpPkgEntry(BUILTIN_MCP_PKG[e.spec.id])
        ? m('mcp.errPkgMissing', { name: e.spec.name })
        : (err as Error).message
    e.tools = []
    logEvent({ level: 'error', kind: 'mcp.failed', pageId: id, detail: e.lastError })
    throw err
  } finally {
    emitChanged()
  }
}

function reconcileAndFind(id: string): HubEntry | undefined {
  reconcile()
  return entries.get(id)
}

export async function disconnect(id: string): Promise<void> {
  const e = entries.get(id)
  if (!e) return
  const client = e.client
  e.client = undefined
  e.transport = undefined
  e.tools = []
  e.serverInfo = undefined
  try {
    await withTimeout(client?.close() ?? Promise.resolve(), 5_000, 'close timeout')
  } catch {
    /* a wedged child close must not block removal/quit; close force-kills the stdio pipe */
  }
  if (e.status !== 'error') e.status = 'stopped'
  e.lastError = undefined
  emitChanged()
}

/** Aggregated catalog across all connected servers, or one server when `serverId` is given. */
export function listTools(serverId?: string): McpToolInfo[] {
  const all = [...entries.values()].flatMap((e) => e.tools)
  return serverId ? all.filter((t) => t.serverId === serverId) : all
}

export async function callTool(args: McpCallToolArgs): Promise<McpCallToolResult> {
  const startedAt = Date.now()
  const finish = (r: McpCallToolResult): McpCallToolResult => {
    // Record every hub-forwarded call — success or failure — so the panel's feed + success
    // rate reflect the real distribution, not just the happy path.
    recordCall({
      serverId: args.serverId,
      tool: args.tool,
      ms: r.durationMs,
      ok: r.ok,
      ...(r.error ? { err: r.error } : {}),
      at: Date.now()
    })
    return r
  }
  const e = entries.get(args.serverId)
  if (!e)
    return finish({ ok: false, text: '', isError: true, error: m('mcp.errUnknown', { id: args.serverId }), durationMs: 0 })
  if (!e.client || e.status !== 'connected') {
    return finish({ ok: false, text: '', isError: true, error: m('mcp.errNotConnected', { id: e.spec.id }), durationMs: 0 })
  }
  try {
    const res = await withTimeout(
      e.client.callTool(
        { name: args.tool, arguments: args.arguments ?? {} },
        undefined,
        { timeout: args.timeoutMs ?? MCP_CALL_TOOL_TIMEOUT_MS }
      ),
      (args.timeoutMs ?? MCP_CALL_TOOL_TIMEOUT_MS) + 2_000, // SDK's own timeout should fire first; this is the safety net
      m('mcp.errCallTimeout')
    )
    const text = flattenToolContent((res as { content?: unknown }).content)
    const isError = Boolean((res as { isError?: boolean }).isError)
    return finish({ ok: !isError, text, isError, durationMs: Date.now() - startedAt })
  } catch (err) {
    return finish({ ok: false, text: '', isError: true, error: (err as Error).message, durationMs: Date.now() - startedAt })
  }
}

/** Connect every `autoStart && enabled` row; failures are per-row and never reject. */
export async function autoStartAll(): Promise<void> {
  reconcile()
  const wanted = [...entries.values()].filter(
    (e) => e.spec.enabled !== false && e.spec.autoStart === true && e.status === 'stopped'
  )
  await Promise.allSettled(
    wanted.map((e) =>
      connect(e.spec.id).catch((err) => {
        console.warn(`[mcp-hub] auto-start ${e.spec.id} failed:`, (err as Error).message)
      })
    )
  )
}

/** Close all children — wire into before-quit so no orphan MCP process survives. */
export async function shutdownAll(): Promise<void> {
  shuttingDown = true
  // Flush the bridge exports now: the disconnects below re-debounce, and the process
  // may exit before that timer fires — the on-disk catalog must match the last registry.
  if (bridgeTimer) {
    clearTimeout(bridgeTimer)
    bridgeTimer = null
  }
  try {
    exportBridgeFiles(listServers(), listTools())
  } catch {
    /* a wedged userData dir must not block quit */
  }
  await Promise.allSettled([...entries.keys()].map((id) => disconnect(id)))
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}
