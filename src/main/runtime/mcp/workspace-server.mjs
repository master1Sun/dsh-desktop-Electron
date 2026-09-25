#!/usr/bin/env node
/**
 * dsh-workspace MCP server — the container's shared-context layer, exposed as MCP tools.
 *
 * Why this exists: the container hands every hosted agent a pointer to one shared document
 * (DSH_WORKSPACE_FILE) via env, but a bare path is only useful to an agent that happens to be
 * written to read it. Registering this server in the bridge (mcp-servers.json / codex
 * config.toml) means any MCP-speaking agent can `workspace_read` the current task + shared
 * memory and `workspace_append` a finding back into it — a real read/write channel, not just a
 * path. The agent spawns its own copy of this process (stdio), exactly like it does for the
 * curated npm servers; the container never proxies the calls.
 *
 * Dependency-free on purpose: it runs under the bundled node.exe from userData, where app.asar
 * — and therefore @modelcontextprotocol/sdk — is not readable. The only external piece is the
 * MCP stdio wire format: newline-delimited JSON-RPC 2.0. It reads/writes the same context.json
 * the container's UI edits, tolerating anything a hand-edit or a peer agent may have written.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import readline from 'node:readline'

/** Absolute path to the shared context.json, injected by the bridge spec's env. */
const FILE = process.env.DSH_WORKSPACE_FILE || ''
/** Fallback when the client does not negotiate a version; clients accept an equal/older one. */
const PROTOCOL = '2024-11-05'

function emptyDoc() {
  return { version: 1, updatedAt: new Date().toISOString(), revision: 0, task: '', notes: [] }
}

function newId() {
  return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function newTaskId() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

const TASK_STATUSES = ['todo', 'doing', 'done']

/** Coerce unknown JSON into a trustworthy task queue (mirrors the container's normalizeTasks). */
function normalizeTasks(raw) {
  const seen = new Set()
  return (Array.isArray(raw) ? raw : [])
    .map((t) => {
      if (!t || typeof t !== 'object') return null
      const title = typeof t.title === 'string' ? t.title : ''
      if (!title.trim()) return null
      const id = typeof t.id === 'string' && t.id ? t.id : newTaskId()
      if (seen.has(id)) return null
      seen.add(id)
      const deps = (Array.isArray(t.deps) ? t.deps : []).filter((d) => typeof d === 'string' && d)
      return {
        id,
        title,
        status: TASK_STATUSES.includes(t.status) ? t.status : 'todo',
        ...(typeof t.owner === 'string' && t.owner ? { owner: t.owner } : {}),
        ...(deps.length ? { deps } : {}),
        ...(typeof t.result === 'string' && t.result ? { result: t.result } : {}),
        at: typeof t.at === 'number' ? t.at : Date.now()
      }
    })
    .filter(Boolean)
}

/** Coerce unknown JSON into a trustworthy doc without ever throwing (mirrors the container). */
function normalize(raw) {
  if (!raw || typeof raw !== 'object') return emptyDoc()
  const notes = (Array.isArray(raw.notes) ? raw.notes : [])
    .map((n) => {
      if (!n || typeof n !== 'object') return null
      const text = typeof n.text === 'string' ? n.text : ''
      if (!text.trim()) return null
      return {
        id: typeof n.id === 'string' && n.id ? n.id : newId(),
        author: typeof n.author === 'string' && n.author ? n.author : 'agent',
        text,
        ts: typeof n.ts === 'number' ? n.ts : Date.now()
      }
    })
    .filter(Boolean)
  return {
    version: 1,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    revision: typeof raw.revision === 'number' && raw.revision >= 0 ? raw.revision : 0,
    ...(typeof raw.broadcastAt === 'string' ? { broadcastAt: raw.broadcastAt } : {}),
    task: typeof raw.task === 'string' ? raw.task : '',
    notes,
    // Absent stays absent so a pre-queue document round-trips unchanged on disk.
    ...(Array.isArray(raw.tasks) ? { tasks: normalizeTasks(raw.tasks) } : {})
  }
}

function readDoc() {
  try {
    if (!FILE || !existsSync(FILE)) return emptyDoc()
    return normalize(JSON.parse(readFileSync(FILE, 'utf8')))
  } catch {
    return emptyDoc()
  }
}

/** Best-effort write: a read-only root surfaces through the tool result, never kills the child. */
function writeDoc(doc) {
  if (!FILE) return false
  try {
    mkdirSync(dirname(FILE), { recursive: true })
    writeFileSync(FILE, JSON.stringify(doc, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}

const TOOLS = [
  {
    name: 'workspace_read',
    description:
      'Read the container-owned shared context: the current task, the append-only shared-memory log (notes), and the broadcast revision. Call this to load cross-agent context.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'workspace_append',
    description:
      'Append one entry to the shared-memory log so other hosted agents can see it. Use for findings or decisions worth sharing across agents.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The note to share (non-empty).' },
        author: { type: 'string', description: 'Who is writing (defaults to your agent name).' }
      },
      required: ['text'],
      additionalProperties: false
    }
  },
  {
    name: 'workspace_set_task',
    description: 'Set the single current shared task/goal that all hosted agents work toward.',
    inputSchema: {
      type: 'object',
      properties: { task: { type: 'string', description: 'The current task text.' } },
      required: ['task'],
      additionalProperties: false
    }
  },
  {
    name: 'workspace_submit',
    description:
      'Submit a new task into the shared task queue (todo column). Other agents can then claim it. Use for decomposed work items, not the overall goal (that is workspace_set_task).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'One-line task title (non-empty).' },
        deps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ids of tasks this one waits on (advisory, optional).'
        }
      },
      required: ['title'],
      additionalProperties: false
    }
  },
  {
    name: 'workspace_claim',
    description:
      'Claim a queued task for yourself: sets the owner and moves it to doing. Fails if it is already claimed or done.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task id returned by workspace_submit/read.' },
        owner: { type: 'string', description: 'Your agent name (non-empty).' }
      },
      required: ['taskId', 'owner'],
      additionalProperties: false
    }
  },
  {
    name: 'workspace_complete',
    description:
      'Mark a claimed task as done and optionally record its outcome. The result is mirrored into the shared-memory notes so every agent sees the outcome.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task id to close.' },
        result: { type: 'string', description: 'Outcome summary (optional but recommended).' }
      },
      required: ['taskId'],
      additionalProperties: false
    }
  }
]

function textResult(text) {
  return { content: [{ type: 'text', text: String(text) }], isError: false }
}
function errorResult(text) {
  return { content: [{ type: 'text', text: String(text) }], isError: true }
}

/**
 * Any task-queue mutation bumps `revision`: a polling agent diffs the counter, sees the move,
 * and re-reads the queue. Notes stay untouched except workspace_complete's explicit mirror.
 */
function saveTasks(doc, tasks, note) {
  doc.tasks = tasks
  doc.revision = (typeof doc.revision === 'number' ? doc.revision : 0) + 1
  doc.updatedAt = new Date().toISOString()
  if (note) doc.notes.push({ id: newId(), ...note, ts: Date.now() })
  return writeDoc(doc)
    ? textResult(JSON.stringify({ ok: true, revision: doc.revision, tasks: doc.tasks }, null, 2))
    : errorResult('Failed to write the shared context (read-only path?).')
}

function callTool(name, args) {
  const a = args && typeof args === 'object' ? args : {}
  if (name === 'workspace_read') return textResult(JSON.stringify(readDoc(), null, 2))
  if (name === 'workspace_append') {
    const text = typeof a.text === 'string' ? a.text.trim() : ''
    if (!text) return errorResult('workspace_append needs a non-empty "text".')
    const doc = readDoc()
    doc.notes.push({
      id: newId(),
      author: (typeof a.author === 'string' && a.author.trim()) || 'agent',
      text,
      ts: Date.now()
    })
    doc.updatedAt = new Date().toISOString()
    if (!writeDoc(doc)) return errorResult('Failed to write the shared context (read-only path?).')
    return textResult(
      'Appended shared-memory note; the context now has ' + doc.notes.length + ' note(s).'
    )
  }
  if (name === 'workspace_set_task') {
    const doc = readDoc()
    doc.task = typeof a.task === 'string' ? a.task : ''
    doc.updatedAt = new Date().toISOString()
    if (!writeDoc(doc)) return errorResult('Failed to write the shared context (read-only path?).')
    return textResult('Current shared task set.')
  }
  if (name === 'workspace_submit') {
    const title = typeof a.title === 'string' ? a.title.trim() : ''
    if (!title) return errorResult('workspace_submit needs a non-empty "title".')
    const doc = readDoc()
    const tasks = normalizeTasks(doc.tasks)
    const deps = (Array.isArray(a.deps) ? a.deps : [])
      .filter((d) => typeof d === 'string' && d.trim())
      .map((d) => d.trim())
    tasks.push({
      id: newTaskId(),
      title,
      status: 'todo',
      ...(deps.length ? { deps } : {}),
      at: Date.now()
    })
    return saveTasks(doc, tasks)
  }
  if (name === 'workspace_claim') {
    const owner = typeof a.owner === 'string' ? a.owner.trim() : ''
    if (!owner) return errorResult('workspace_claim needs a non-empty "owner".')
    const doc = readDoc()
    const tasks = normalizeTasks(doc.tasks)
    const t = tasks.find((x) => x.id === a.taskId)
    if (!t) return errorResult('No such task: ' + String(a.taskId) + ' (see workspace_read).')
    if (t.status === 'done') return errorResult(`Task ${t.id} is already done.`)
    if (t.status === 'doing' && t.owner && t.owner !== owner)
      return errorResult(`Task ${t.id} is already claimed by ${t.owner}.`)
    t.status = 'doing'
    t.owner = owner
    t.at = Date.now()
    return saveTasks(doc, tasks)
  }
  if (name === 'workspace_complete') {
    const doc = readDoc()
    const tasks = normalizeTasks(doc.tasks)
    const t = tasks.find((x) => x.id === a.taskId)
    if (!t) return errorResult('No such task: ' + String(a.taskId) + ' (see workspace_read).')
    if (t.status === 'done') return errorResult(`Task ${t.id} is already done.`)
    t.status = 'done'
    const result = typeof a.result === 'string' ? a.result.trim() : ''
    if (result) t.result = result
    t.at = Date.now()
    // Mirror the outcome into the shared memory — the plan's "done ⇒ visible to everyone".
    const note = {
      author: t.owner || 'agent',
      text: `【任务完成】${t.title}${result ? ' — ' + result : ''}`
    }
    return saveTasks(doc, tasks, note)
  }
  return errorResult('Unknown tool: ' + name)
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}
function reply(id, result) {
  send({ jsonrpc: '2.0', id, result })
}
function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

function handle(msg) {
  if (!msg || typeof msg !== 'object') return
  const id = msg.id
  const method = msg.method
  const params = msg.params
  const isRequest = id !== undefined && id !== null
  switch (method) {
    case 'initialize': {
      const clientProto = params && params.protocolVersion
      reply(id, {
        // Echo the client's requested version when present so older/newer clients both handshake.
        protocolVersion: typeof clientProto === 'string' ? clientProto : PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: 'dsh-workspace', version: '1.0.0' }
      })
      return
    }
    case 'ping':
      if (isRequest) reply(id, {})
      return
    case 'notifications/initialized':
    case 'initialized':
    case 'notifications/cancelled':
      return // notifications: no response
    case 'tools/list':
      reply(id, { tools: TOOLS })
      return
    case 'tools/call': {
      const p = params || {}
      reply(id, callTool(p.name, p.arguments))
      return
    }
    // Declare only `tools`, but answer these cheaply in case a client probes them anyway.
    case 'resources/list':
      reply(id, { resources: [] })
      return
    case 'prompts/list':
      reply(id, { prompts: [] })
      return
    default:
      if (isRequest) replyError(id, -32601, 'Method not found: ' + method)
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false })
rl.on('line', (line) => {
  const s = line.trim()
  if (!s) return
  let msg
  try {
    msg = JSON.parse(s)
  } catch {
    return // a non-JSON line is not a protocol message; ignore rather than crash
  }
  try {
    handle(msg)
  } catch (err) {
    if (msg && msg.id !== undefined) replyError(msg.id, -32603, String((err && err.message) || err))
  }
})
rl.on('close', () => process.exit(0))
