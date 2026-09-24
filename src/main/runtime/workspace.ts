/**
 * Shared workspace / context layer.
 *
 * The container hosts several agents side by side — dsh-web, openclaw, any imported codex
 * page — that otherwise cannot see one another. This hands them a single thing to share: a
 * container-owned working directory plus one `context.json` (a current task + an append-only
 * shared-memory log). Every spawned agent discovers it the same way it discovers the MCP bridge
 * catalog — through pointer env vars (DSH_WORKSPACE_DIR / DSH_WORKSPACE_FILE) — so the
 * container never needs to know an agent's config format to give it a common context.
 *
 * This is deliberately the *foundation*, not an orchestrator: it is the shared substrate a
 * later router / task-queue / eval pass reads and writes, which is why it is a plain JSON
 * document on disk rather than a live connection. Any agent can read or edit it directly
 * (the container does not lock it); the container's own job is to make it exist, keep the
 * shape trustworthy, and surface it in the UI.
 *
 * The design mirrors runtime/mcp-bridge.ts on purpose: paths are always strings so the
 * contract never lies even when the doc is empty, and every write is best-effort so a
 * read-only root degrades to "agent starts without the shared file" instead of failing the
 * spawn.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSettings, resolveWorkspaceDir } from '../shell/store'
import type {
  WorkspaceContext,
  WorkspaceInfo,
  WorkspaceNote,
  WorkspaceTask,
  WorkspaceTaskStatus
} from '../../shared/types'

/* ---- paths ---- */

/** The shared working directory agents are pointed at; created on demand, never on read. */
export function workspaceDir(): string {
  return resolveWorkspaceDir()
}
/** The single shared context document inside the workspace directory. */
export function workspaceFile(): string {
  return join(workspaceDir(), 'context.json')
}

/**
 * Whether hosted agents are handed the shared context at all (the panel's master switch).
 * Undefined reads as on so an install predating the setting keeps the pre-setting behaviour.
 */
export function isSharedWorkspaceEnabled(): boolean {
  return getSettings().sharedWorkspace !== false
}

/* ---- pure: shape (exported for tests) ---- */

function emptyContext(): WorkspaceContext {
  return { version: 1, updatedAt: new Date().toISOString(), revision: 0, task: '', notes: [] }
}

function newNoteId(): string {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

const TASK_STATUSES: WorkspaceTaskStatus[] = ['todo', 'doing', 'done']

/**
 * Coerce unknown JSON into a trustworthy task queue without ever throwing — the same contract
 * notes have, because any agent (or hand edit) may have written anything into `tasks`. Blank
 * titles and duplicate ids are dropped; an unknown status collapses to 'todo'.
 */
export function normalizeTasks(raw: unknown): WorkspaceTask[] {
  const seen = new Set<string>()
  return (Array.isArray(raw) ? raw : [])
    .map((t): WorkspaceTask | null => {
      if (!t || typeof t !== 'object') return null
      const r = t as Record<string, unknown>
      const title = typeof r.title === 'string' ? r.title : ''
      if (!title.trim()) return null
      const id = typeof r.id === 'string' && r.id ? r.id : newTaskId()
      if (seen.has(id)) return null
      seen.add(id)
      const deps = (Array.isArray(r.deps) ? r.deps : []).filter(
        (d): d is string => typeof d === 'string' && !!d
      )
      return {
        id,
        title,
        status: TASK_STATUSES.includes(r.status as WorkspaceTaskStatus)
          ? (r.status as WorkspaceTaskStatus)
          : 'todo',
        ...(typeof r.owner === 'string' && r.owner ? { owner: r.owner } : {}),
        ...(deps.length ? { deps } : {}),
        ...(typeof r.result === 'string' && r.result ? { result: r.result } : {}),
        at: typeof r.at === 'number' ? r.at : Date.now(),
        // #1 autopilot bookkeeping must survive every normalize, or a task would forget it was
        // already dispatched / how many tries it spent and get re-run in a loop.
        ...(typeof r.dispatchedAt === 'number' ? { dispatchedAt: r.dispatchedAt } : {}),
        ...(typeof r.attempts === 'number' ? { attempts: r.attempts } : {})
      }
    })
    .filter((t): t is WorkspaceTask => t !== null)
}

function newTaskId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Coerce unknown JSON into a trustworthy context without ever throwing: an agent (or a hand
 * edit) may have written anything into `context.json`, and a spawn path must not die on it.
 * Empty notes are dropped rather than kept as blank rows.
 */
export function normalizeContext(raw: unknown): WorkspaceContext {
  if (!raw || typeof raw !== 'object') return emptyContext()
  const o = raw as Record<string, unknown>
  const notes: WorkspaceNote[] = (Array.isArray(o.notes) ? o.notes : [])
    .map((n): WorkspaceNote | null => {
      if (!n || typeof n !== 'object') return null
      const r = n as Record<string, unknown>
      const text = typeof r.text === 'string' ? r.text : ''
      if (!text.trim()) return null
      return {
        id: typeof r.id === 'string' && r.id ? r.id : newNoteId(),
        author: typeof r.author === 'string' && r.author ? r.author : 'agent',
        text,
        ts: typeof r.ts === 'number' ? r.ts : Date.now()
      }
    })
    .filter((n): n is WorkspaceNote => n !== null)
  return {
    version: 1,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
    revision: typeof o.revision === 'number' && o.revision >= 0 ? o.revision : 0,
    ...(typeof o.broadcastAt === 'string' ? { broadcastAt: o.broadcastAt } : {}),
    task: typeof o.task === 'string' ? o.task : '',
    notes,
    // Absent stays absent so a pre-queue document round-trips unchanged on disk.
    ...(Array.isArray(o.tasks) ? { tasks: normalizeTasks(o.tasks) } : {})
  }
}

/* ---- IO ---- */

/**
 * #1 autopilot: listeners notified whenever a *write* actually changed the task queue. The
 * dispatcher subscribes here to react to a fresh submit/complete immediately (event-driven) rather
 * than only on its fallback poll. Kept inside workspace so the dependency stays one-way
 * (dispatcher → workspace); workspace never imports the dispatcher.
 */
const taskListeners = new Set<(ctx: WorkspaceContext) => void>()
export function onWorkspaceTasksChanged(fn: (ctx: WorkspaceContext) => void): () => void {
  taskListeners.add(fn)
  return () => taskListeners.delete(fn)
}
function notifyTasksChanged(ctx: WorkspaceContext): void {
  for (const fn of [...taskListeners]) {
    try {
      fn(ctx)
    } catch {
      /* one bad listener must not break the write or the others */
    }
  }
}

/** Read the on-disk context, degrading to an empty one when it is missing or unparseable. */
export function readWorkspace(): WorkspaceContext {
  try {
    const file = workspaceFile()
    if (!existsSync(file)) return emptyContext()
    return normalizeContext(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return emptyContext()
  }
}

/**
 * Make the workspace directory + a starter context file exist, then return the current
 * contents. Called on every spawn and every panel open, so a first-read agent never hits a
 * missing path. Best-effort: a read-only root leaves the pointers valid but the file absent.
 */
export function ensureWorkspace(): WorkspaceContext {
  try {
    mkdirSync(workspaceDir(), { recursive: true })
  } catch {
    /* a read-only root surfaces through the write below / the agent's own writes */
  }
  const file = workspaceFile()
  if (!existsSync(file)) {
    const seed = emptyContext()
    try {
      writeFileSync(file, JSON.stringify(seed, null, 2), 'utf8')
    } catch {
      /* the pointers still name the intended path; the agent can retry its own write */
    }
    return seed
  }
  return readWorkspace()
}

/**
 * Merge a partial edit into the live context and persist it, stamping a fresh `updatedAt`.
 * A note list coming from the UI is re-normalized so a bad row cannot poison the shared doc.
 * A *changed* task queue bumps `revision` too — task transitions are exactly what a polling
 * agent watches the counter for; a plain task/notes edit still only moves `updatedAt`.
 * Returns the stored document so the caller reflects exactly what landed on disk.
 */
export function writeWorkspace(
  patch: { task?: string; notes?: WorkspaceNote[]; tasks?: WorkspaceTask[] }
): WorkspaceContext {
  const cur = ensureWorkspace()
  const nextTasks = patch.tasks !== undefined ? normalizeTasks(patch.tasks) : cur.tasks
  const tasksChanged = JSON.stringify(nextTasks ?? null) !== JSON.stringify(cur.tasks ?? null)
  const next: WorkspaceContext = {
    version: 1,
    updatedAt: new Date().toISOString(),
    // A plain edit keeps the broadcast signal; broadcasts and task changes move it forward.
    revision: cur.revision + (tasksChanged ? 1 : 0),
    ...(cur.broadcastAt ? { broadcastAt: cur.broadcastAt } : {}),
    task: patch.task !== undefined ? patch.task : cur.task,
    notes: patch.notes !== undefined ? normalizeContext({ notes: patch.notes }).notes : cur.notes,
    ...(nextTasks !== undefined ? { tasks: nextTasks } : {})
  }
  try {
    writeFileSync(workspaceFile(), JSON.stringify(next, null, 2), 'utf8')
  } catch {
    /* keep returning the intended doc so the UI stays coherent; the next read re-syncs */
  }
  // #1: a real queue transition wakes the autopilot dispatcher immediately, not just on its poll.
  if (tasksChanged) notifyTasksChanged(next)
  return next
}

/**
 * Push the current task to running agents: bump `revision`, stamp `broadcastAt`, and mirror the
 * task into the shared-memory log as one clearly-marked entry so an agent that only tail-reads the
 * notes still sees it. This is the container's honest broadcast channel — it owns the file agents
 * poll, not the agents themselves; a watcher detects the move by the revision changing.
 */
export function broadcastWorkspace(): WorkspaceContext {
  const cur = ensureWorkspace()
  const now = new Date()
  const task = cur.task.trim()
  const notes: WorkspaceNote[] = task
    ? [...cur.notes, { id: newNoteId(), author: 'container', text: `【广播】${task}`, ts: now.getTime() }]
    : cur.notes
  const next: WorkspaceContext = {
    version: 1,
    updatedAt: now.toISOString(),
    revision: (Number.isFinite(cur.revision) ? cur.revision : 0) + 1,
    broadcastAt: now.toISOString(),
    task: cur.task,
    notes,
    ...(cur.tasks !== undefined ? { tasks: cur.tasks } : {})
  }
  try {
    writeFileSync(workspaceFile(), JSON.stringify(next, null, 2), 'utf8')
  } catch {
    /* same best-effort contract as writeWorkspace */
  }
  return next
}

/** Append one shared-memory entry without the caller having to read-modify-write. */
export function appendWorkspaceNote(note: { author?: string; text: string }): WorkspaceContext {
  const trimmed = (note.text || '').trim()
  if (!trimmed) return ensureWorkspace()
  const cur = ensureWorkspace()
  const entry: WorkspaceNote = {
    id: newNoteId(),
    author: (note.author || 'container').trim() || 'container',
    text: trimmed,
    ts: Date.now()
  }
  return writeWorkspace({ notes: [...cur.notes, entry] })
}

/** Locations + the live context, for the panel. */
export function workspaceInfo(): WorkspaceInfo {
  return { dir: workspaceDir(), file: workspaceFile(), context: ensureWorkspace() }
}

/* ---- env injection ---- */

/**
 * The pointer vars every spawned agent receives — same contract shape as the MCP bridge.
 * Ensuring the workspace first means an agent that writes into the dir or reads the doc on
 * its very first turn finds both already there.
 */
export function workspaceEnvVars(): Record<string, string> {
  // The master switch: when off, hosted agents are never handed the pointers, so they neither
  // see nor write the shared context. Reading the setting keeps this pure-ish (no spawn-time IO).
  if (!isSharedWorkspaceEnabled()) return {}
  ensureWorkspace()
  return {
    DSH_WORKSPACE_DIR: workspaceDir(),
    DSH_WORKSPACE_FILE: workspaceFile()
  }
}
