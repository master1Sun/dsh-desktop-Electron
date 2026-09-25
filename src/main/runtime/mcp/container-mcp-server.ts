/**
 * #11: the container *itself* as an MCP server, so an external agent (codex, Claude, a script)
 * can drive the container over Streamable HTTP — list/start/stop hosted pages, read their logs,
 * read/write the shared workspace, and proxy a call to any hub-registered MCP tool.
 *
 * Why HTTP and not a stdio child like dsh-workspace: this server has to reach live main-process
 * objects (the PageRegistry, the MCP hub) that a detached stdio child never could. Running it
 * inside the main process means the @modelcontextprotocol/sdk (readable from asar on this side)
 * drives a real protocol server, and the tool handlers call the *same* functions the IPC handlers
 * do — one source of truth, no duplicated lifecycle logic.
 *
 * Gated off by default (`settings.containerMcpServer`). When off there is no listener, no token
 * file, and the bridge exports stay exactly as they were. When on it binds 127.0.0.1 only on an
 * ephemeral port, and every request must carry the bearer token written to
 * `userData/mcp-bridge/container-server.token`.
 */
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { PageRegistry } from '../pages/pages'
import { listTools as hubListTools, callTool as hubCallTool, refreshBridge } from './mcp-hub'
import { normalizeTasks, readWorkspace, writeWorkspace } from './workspace'
import { readLogTail } from '../../shell/logger'
import { bridgeDir } from './mcp-bridge'
import { logEvent } from '../../shell/events'
import { setContainerEndpoint, type ContainerEndpoint } from './container-endpoint'
import type { McpCallToolArgs } from '../../../shared/types'

/** Everything the panel + bridge need to know about a running server. */
export interface ContainerServerInfo {
  url: string
  port: number
  tokenFile: string
}

/** A tool is advertised as a JSON Schema (the low-level Server forwards it verbatim; we validate
 *  arguments by hand in the dispatcher, mirroring the dependency-free dsh-workspace server). */
interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** One text-block MCP result; `isError` marks a handled failure the agent should read. */
function textResult(text: unknown): { content: { type: 'text'; text: string }[]; isError: boolean } {
  const t = typeof text === 'string' ? text : JSON.stringify(text, null, 2)
  return { content: [{ type: 'text', text: t }], isError: false }
}
function errorResult(text: string): { content: { type: 'text'; text: string }[]; isError: boolean } {
  return { content: [{ type: 'text', text }], isError: true }
}

const TOOLS: ToolDef[] = [
  {
    name: 'container_list_pages',
    description: 'List every page the container hosts: id, name, kind, lifecycle status and port.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'container_get_logs',
    description: 'Read the tail of one hosted page’s captured output (logs/pages/<pageId>.log).',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The page id (see container_list_pages).' },
        tail: { type: 'number', description: 'How many trailing lines to return (default 200, max 5000).' }
      },
      required: ['pageId'],
      additionalProperties: false
    }
  },
  {
    name: 'container_workspace_read',
    description: 'Read the container-owned shared context: current task, shared-memory notes, and the task queue.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'container_workspace_submit',
    description: 'Submit a new task into the shared task queue (todo column), optionally listing dependency ids.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'One-line task title (non-empty).' },
        deps: { type: 'array', items: { type: 'string' }, description: 'Ids of tasks this one waits on (optional).' }
      },
      required: ['title'],
      additionalProperties: false
    }
  },
  {
    name: 'container_workspace_complete',
    description: 'Mark a task done and optionally record its outcome (mirrored into the shared-memory notes).',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task id to close.' },
        result: { type: 'string', description: 'Outcome summary (optional).' }
      },
      required: ['taskId'],
      additionalProperties: false
    }
  },
  {
    name: 'container_list_mcp_tools',
    description: 'List the tools of every MCP server connected in the container hub (optionally one server).',
    inputSchema: {
      type: 'object',
      properties: { serverId: { type: 'string', description: 'Restrict to one hub server id (optional).' } },
      additionalProperties: false
    }
  },
  {
    name: 'container_call_mcp_tool',
    description: 'Call one tool on an MCP server the container hub already connects to.',
    inputSchema: {
      type: 'object',
      properties: {
        serverId: { type: 'string', description: 'The hub server id (see container_list_mcp_tools).' },
        tool: { type: 'string', description: 'The tool name on that server.' },
        arguments: { type: 'object', description: 'Arguments object the tool expects.' }
      },
      required: ['serverId', 'tool'],
      additionalProperties: false
    }
  },
  {
    name: 'container_start_page',
    description: 'Start a hosted page by id. Dependencies (per the container manifest) are started first.',
    inputSchema: {
      type: 'object',
      properties: { pageId: { type: 'string', description: 'The page id to start.' } },
      required: ['pageId'],
      additionalProperties: false
    }
  },
  {
    name: 'container_stop_page',
    description: 'Stop a running hosted page by id.',
    inputSchema: {
      type: 'object',
      properties: { pageId: { type: 'string', description: 'The page id to stop.' } },
      required: ['pageId'],
      additionalProperties: false
    }
  },
  {
    name: 'container_restart_page',
    description: 'Restart a hosted page by id (its dependencies are started first if needed).',
    inputSchema: {
      type: 'object',
      properties: { pageId: { type: 'string', description: 'The page id to restart.' } },
      required: ['pageId'],
      additionalProperties: false
    }
  }
]

/** A PageState trimmed to the fields an agent cares about (avoids shipping the whole record). */
function pageSummary(registry: PageRegistry, id: string): unknown {
  const p = registry.get(id)
  if (!p) return null
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    status: p.status,
    port: p.containerPort || p.port || undefined,
    external: p.external || undefined
  }
}

/**
 * Route one tool call to the live main-process functions. `getRegistry()` may return undefined
 * very early in boot; every write path guards on it. Nothing here throws to the transport — an
 * unexpected error is caught by the caller and returned as an isError text result.
 */
async function dispatch(
  getRegistry: () => PageRegistry | undefined,
  name: string,
  args: Record<string, unknown>
): Promise<{ content: { type: 'text'; text: string }[]; isError: boolean }> {
  const a = args && typeof args === 'object' ? args : {}
  switch (name) {
    case 'container_list_pages': {
      const registry = getRegistry()
      if (!registry) return errorResult('container registry not ready')
      return textResult(registry.list().map((p) => pageSummary(registry, p.id)))
    }
    case 'container_get_logs': {
      const pageId = typeof a.pageId === 'string' ? a.pageId.trim() : ''
      if (!pageId) return errorResult('container_get_logs needs a pageId')
      const tail = typeof a.tail === 'number' ? Math.max(1, Math.min(5000, a.tail)) : 200
      // Same sanitisation the log writer applies (logPageLine), so the key resolves.
      const safe = pageId.replace(/[^\w.-]/g, '_')
      const res = readLogTail(`pages/${safe}.log`, tail)
      return textResult(res.lines.join('\n') || '(no log output captured yet)')
    }
    case 'container_workspace_read':
      return textResult(readWorkspace())
    case 'container_workspace_submit': {
      const rawTitle = typeof a.title === 'string' ? a.title : ''
      const title = rawTitle.trim()
      if (!title) return errorResult('container_workspace_submit needs a title')
      // Reject control characters (newlines especially): the title is later interpolated into an
      // autopilot prompt written to a PTY, where an embedded newline would run as a separate
      // command against a bare-shell executor. buildPrompt neutralises this too as a backstop.
      if (/[\x00-\x1f\x7f]/.test(rawTitle))
        return errorResult(
          'container_workspace_submit title must not contain newlines or control characters'
        )
      const cur = readWorkspace()
      const tasks = normalizeTasks(cur.tasks)
      const deps = (Array.isArray(a.deps) ? a.deps : [])
        .filter((d): d is string => typeof d === 'string' && !!d.trim())
        .map((d) => d.trim())
      const id = `t${Date.now().toString(36)}${randomBytes(3).toString('hex')}`
      tasks.push({ id, title, status: 'todo', ...(deps.length ? { deps } : {}), at: Date.now() })
      const next = writeWorkspace({ tasks })
      return textResult({ ok: true, taskId: id, tasks: next.tasks })
    }
    case 'container_workspace_complete': {
      const taskId = typeof a.taskId === 'string' ? a.taskId.trim() : ''
      if (!taskId) return errorResult('container_workspace_complete needs a taskId')
      const cur = readWorkspace()
      const tasks = normalizeTasks(cur.tasks)
      const t = tasks.find((x) => x.id === taskId)
      if (!t) return errorResult(`no such task: ${taskId}`)
      if (t.status === 'done') return errorResult(`task ${taskId} already done`)
      t.status = 'done'
      const result = typeof a.result === 'string' ? a.result.trim() : ''
      if (result) t.result = result
      t.at = Date.now()
      const next = writeWorkspace({ tasks })
      return textResult({ ok: true, revision: next.revision, tasks: next.tasks })
    }
    case 'container_list_mcp_tools': {
      const serverId = typeof a.serverId === 'string' ? a.serverId : undefined
      return textResult(hubListTools(serverId))
    }
    case 'container_call_mcp_tool': {
      const serverId = typeof a.serverId === 'string' ? a.serverId : ''
      const tool = typeof a.tool === 'string' ? a.tool : ''
      if (!serverId || !tool) return errorResult('container_call_mcp_tool needs serverId and tool')
      const callArgs: McpCallToolArgs = {
        serverId,
        tool,
        ...(a.arguments && typeof a.arguments === 'object' ? { arguments: a.arguments as Record<string, unknown> } : {})
      }
      const r = await hubCallTool(callArgs)
      return r.isError ? errorResult(r.error || r.text || 'tool call failed') : textResult(r.text)
    }
    case 'container_start_page': {
      const registry = getRegistry()
      const pageId = typeof a.pageId === 'string' ? a.pageId.trim() : ''
      if (!registry || !pageId) return errorResult('container_start_page needs a pageId')
      const state = await registry.startWithDeps(pageId)
      logEvent({ level: 'info', kind: 'container-mcp', pageId, detail: 'start' })
      return textResult(pageSummary(registry, pageId) ?? { id: pageId, status: state.status })
    }
    case 'container_stop_page': {
      const registry = getRegistry()
      const pageId = typeof a.pageId === 'string' ? a.pageId.trim() : ''
      if (!registry || !pageId) return errorResult('container_stop_page needs a pageId')
      registry.stop(pageId)
      registry.emitChanged()
      logEvent({ level: 'info', kind: 'container-mcp', pageId, detail: 'stop' })
      return textResult(pageSummary(registry, pageId) ?? { id: pageId, status: 'stopped' })
    }
    case 'container_restart_page': {
      const registry = getRegistry()
      const pageId = typeof a.pageId === 'string' ? a.pageId.trim() : ''
      if (!registry || !pageId) return errorResult('container_restart_page needs a pageId')
      const state = await registry.restartWithDeps(pageId)
      logEvent({ level: 'info', kind: 'container-mcp', pageId, detail: 'restart' })
      return textResult(pageSummary(registry, pageId) ?? { id: pageId, status: state.status })
    }
    default:
      return errorResult(`unknown tool: ${name}`)
  }
}

/** A fresh low-level Server per request (stateless transport): capabilities + the two handlers. */
function buildMcpServer(getRegistry: () => PageRegistry | undefined): Server {
  const server = new Server(
    { name: 'dsh-container', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const p = (request?.params ?? {}) as { name?: string; arguments?: Record<string, unknown> }
    try {
      return await dispatch(getRegistry, String(p.name ?? ''), p.arguments ?? {})
    } catch (err) {
      return errorResult(`tool failed: ${(err as Error)?.message ?? String(err)}`)
    }
  })
  return server
}

/** Collect a request body (capped) and JSON-parse it; resolve null on an empty/oversized body. */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > 4 * 1024 * 1024) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) return resolve(null)
      try {
        resolve(JSON.parse(raw))
      } catch (err) {
        reject(err as Error)
      }
    })
    req.on('error', reject)
  })
}

let httpServer: HttpServer | null = null
let currentInfo: ContainerServerInfo | null = null
let currentToken = ''
/** In-flight {@link listen} so concurrent starts share one bring-up (see startContainerMcpServer). */
let starting: Promise<ContainerServerInfo> | null = null

function writeToken(token: string): string {
  const file = join(bridgeDir(), 'container-server.token')
  mkdirSync(bridgeDir(), { recursive: true })
  // 0600: the token grants control over every hosted page — keep it owner-readable.
  writeFileSync(file, token, { encoding: 'utf8', mode: 0o600 })
  return file
}

/** Whether a request carries the expected bearer token (constant-time-ish length+char compare). */
function authorized(req: IncomingMessage): boolean {
  const header = req.headers['authorization'] || ''
  const value = Array.isArray(header) ? header[0] : header
  return value === `Bearer ${currentToken}`
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

/**
 * Start the container MCP server. Idempotent: a second call while running returns the live info.
 * Binds 127.0.0.1 on an ephemeral port; writes the bearer token; publishes the endpoint so the
 * bridge can export it to agents. Returns the resolved connection info.
 */
export async function startContainerMcpServer(
  getRegistry: () => PageRegistry | undefined
): Promise<ContainerServerInfo> {
  // Dedupe concurrent starts: while a listener is coming up `httpServer`/`currentInfo` are still
  // null, so a second caller (double-toggle, or cold-start racing an IPC start) would otherwise
  // spawn a second server and overwrite the bearer token already handed to agents. Everyone joins
  // the one in-flight promise instead.
  if (httpServer && currentInfo) return currentInfo
  if (!starting) starting = listen(getRegistry).finally(() => (starting = null))
  return starting
}

/** Actual bring-up: mint the token, bind the loopback listener, publish the endpoint. Runs at most
 *  once concurrently — {@link startContainerMcpServer} memoises the returned promise. */
async function listen(getRegistry: () => PageRegistry | undefined): Promise<ContainerServerInfo> {
  const token = randomBytes(24).toString('hex')
  const tokenFile = writeToken(token)
  currentToken = token

  const server = createServer(async (req, res) => {
    if (!req.url) return sendJson(res, 400, { error: 'bad request' })
    if (!authorized(req)) return sendJson(res, 401, { error: 'unauthorized' })
    const [path] = req.url.split('?')
    if (path !== '/mcp') return sendJson(res, 404, { error: 'not found' })
    // Only the Streamable HTTP POST message lane is served (stateless); SSE stream / session
    // teardown are not needed for request/response tool use and stay 405.
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST', 'content-type': 'application/json' })
      return res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }))
    }
    let body: unknown
    try {
      body = await readJsonBody(req)
    } catch {
      return sendJson(res, 400, { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null })
    }
    const mcp = buildMcpServer(getRegistry)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      void transport.close()
      void mcp.close()
    })
    try {
      await mcp.connect(transport)
      await transport.handleRequest(req, res, body as never)
    } catch (err) {
      console.warn('[container-mcp] request failed:', (err as Error)?.message ?? err)
      sendJson(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null })
    }
  })

  server.listen(0, '127.0.0.1')
  try {
    await once(server, 'listening')
  } catch (err) {
    // Never leave a half-published token behind a listener that failed to bind.
    currentToken = ''
    server.close()
    throw err
  }
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const url = `http://127.0.0.1:${port}/mcp`
  httpServer = server
  currentInfo = { url, port, tokenFile }

  const endpoint: ContainerEndpoint = { url, port, tokenFile, bearerToken: token }
  setContainerEndpoint(endpoint)
  logEvent({ level: 'info', kind: 'container-mcp', detail: 'server started', meta: { url } })
  // Re-export the agent bridge now so the running URL + token reach hosted agents' configs.
  refreshBridge()
  return currentInfo
}

/** Stop the server and clear its token file + published endpoint. Safe to call when not running. */
export async function stopContainerMcpServer(): Promise<void> {
  // If a start is mid-flight, let it finish binding first so we close the real listener instead of
  // racing it (which would otherwise leave a live server behind a `containerMcpServer=false` store).
  if (starting) {
    try {
      await starting
    } catch {
      /* start failed; nothing to tear down beyond the best-effort cleanup below */
    }
  }
  setContainerEndpoint(null)
  const server = httpServer
  httpServer = null
  currentInfo = null
  currentToken = ''
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  try {
    rmSync(join(bridgeDir(), 'container-server.token'), { force: true })
  } catch {
    /* a token file we can't delete is not worth failing quit over */
  }
  logEvent({ level: 'info', kind: 'container-mcp', detail: 'server stopped' })
  // The endpoint is cleared above, so this re-export prunes the container row from every file.
  refreshBridge()
}

export function isContainerMcpServerRunning(): boolean {
  return !!httpServer
}

export function getContainerMcpServerInfo(): ContainerServerInfo | null {
  return currentInfo
}
