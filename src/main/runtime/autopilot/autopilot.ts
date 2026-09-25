/**
 * #1 autopilot — the real wiring around the pure {@link TaskDispatcher}.
 *
 * This is the only autopilot file that touches electron / node-pty: it builds the headless
 * executor (spawn the CLI agent page's start command in its own PTY, mirror its output into the
 * page log, hand it the task prompt once it has booted), binds the dispatcher to the live store /
 * shared workspace / activity log, and drives it both event-driven (a queue write) and on a slow
 * fallback poll. Kept separate from task-dispatcher.ts so the state machine stays dependency-free
 * and unit-testable.
 */
import type { PageRegistry } from '../pages/pages'
import { buildPageEnv, expandStartCommand } from '../pages/pages'
import { PtyManager } from '../terminal/pty'
import { bridgeEnvVars } from '../mcp/mcp-bridge'
import { getSettings } from '../../shell/store'
import { normalizeTasks, readWorkspace, writeWorkspace, workspaceEnvVars, onWorkspaceTasksChanged } from '../mcp/workspace'
import { logEvent } from '../../shell/events'
import { logPageLine } from '../../shell/logger'
import { TaskDispatcher, type Executor, type TaskExecution } from './task-dispatcher'
import type { PageState, WorkspaceTask } from '../../../shared/types'

/** How long to let the agent CLI boot before typing the task prompt into its PTY. */
const BOOT_INJECT_MS = 3500
/** Fallback poll cadence; the event path (queue writes) usually fires far sooner. */
const POLL_MS = 15_000

/** Strip PTY control bytes to something worth persisting in the plain-text page log. */
function ptyTextForLog(chunk: string): string {
  return chunk
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    .replace(/\r\n?/g, '\n')
}

/**
 * Runs one task headlessly: a fresh PTY in the page's dir executing the page's start command with
 * the page + bridge + workspace env (so the agent reaches the shared `context.json` and the
 * workspace MCP exactly as it would interactively), the run mirrored into `logs/pages/<id>.log`.
 */
class HeadlessExecutor implements Executor {
  private readonly pty = new PtyManager()

  async run(page: PageState, task: WorkspaceTask, prompt: string): Promise<TaskExecution> {
    const env = { ...buildPageEnv(page), ...bridgeEnvVars(), ...workspaceEnvVars() }
    const info = await this.pty.start(page.dir, `autopilot:${task.id}`, {
      run: { command: expandStartCommand(page.startCommand), env }
    })
    const session = this.pty.get(info.id)
    if (!session) throw new Error('pty session vanished right after start')
    session.on('data', (chunk) => logPageLine(page.id, ptyTextForLog(String(chunk))))
    const exited = new Promise<number>((resolve) => {
      session.on('exit', (code) => resolve(Number(code)))
    })
    // Give the CLI a moment to reach its prompt before typing the task in. Best-effort: a session
    // that already died simply drops the write.
    setTimeout(() => {
      try {
        session.write(`\n${prompt}\n`)
      } catch {
        /* process already gone */
      }
    }, BOOT_INJECT_MS)
    return { exited }
  }
}

let dispatcher: TaskDispatcher | null = null
let offTasksChanged: (() => void) | null = null
let pollTimer: NodeJS.Timeout | null = null

/** Start autopilot. Idempotent. Safe to call before the registry exists (the tick no-ops). */
export function initAutopilot(getRegistry: () => PageRegistry | undefined): void {
  if (dispatcher) return
  dispatcher = new TaskDispatcher({
    getRegistry,
    executor: new HeadlessExecutor(),
    settings: () => {
      const s = getSettings()
      return {
        enabled: !!s.autopilotEnabled,
        executorPageId: s.autopilotExecutorPage,
        concurrency: s.autopilotConcurrency ?? 1,
        prompt: s.autopilotPrompt
      }
    },
    readTasks: () => normalizeTasks(readWorkspace().tasks),
    writeTasks: (tasks) => {
      writeWorkspace({ tasks })
    },
    log: (e) =>
      logEvent({
        level: e.level,
        kind: 'autopilot',
        pageId: e.pageId,
        detail: e.detail,
        ...(e.taskId ? { meta: { taskId: e.taskId } } : {})
      })
  })
  offTasksChanged = onWorkspaceTasksChanged(() => dispatcher?.tick())
  pollTimer = setInterval(() => dispatcher?.tick(), POLL_MS)
  dispatcher.tick()
}

/** Tear down subscriptions + timer (app quit). */
export function disposeAutopilot(): void {
  offTasksChanged?.()
  offTasksChanged = null
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  dispatcher = null
}

/** Force a scheduling pass now — call after a settings change or a UI-side task mutation. */
export function kickAutopilot(): void {
  dispatcher?.tick()
}
