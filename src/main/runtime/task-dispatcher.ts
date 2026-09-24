/**
 * #1 autopilot — task auto-dispatch, kept deliberately pure and dependency-injected.
 *
 * A todo task whose dependencies are all done is claimed and run headlessly inside a chosen
 * `kind:'terminal'` CLI agent page: the container writes an owner, spawns the agent's start
 * command in its own PTY, injects a prompt naming the task, then reconciles when the PTY exits —
 * trusting an agent that backfilled `workspace_complete`, falling back to a container-recorded
 * done on a clean exit, and reverting to todo on a crash (bounded by MAX_ATTEMPTS so a
 * crash-looping executor can't spin forever).
 *
 * This module imports NO electron and touches no globals: every side effect (settings, the task
 * queue, the executor that really spawns a PTY, the activity log) arrives through `DispatcherDeps`
 * / `Executor`, so the selection logic and the whole state machine are unit-testable with fakes.
 * The real wiring that binds this to the store / workspace / node-pty lives in `autopilot.ts`.
 */
import type { PageState, WorkspaceTask } from '../../shared/types'

/** A task at/over this many dispatch attempts stops being auto-picked (crash-loop guard). */
export const MAX_ATTEMPTS = 2
/** owner prefix marking a task the container claimed on an agent's behalf. */
export const OWNER_PREFIX = 'autopilot:'

/** Settings the dispatcher reads each tick (already defaulted by the wiring layer). */
export interface DispatcherSettings {
  enabled: boolean
  executorPageId?: string
  concurrency: number
  /** optional prompt template with {title}/{id}/{deps}; empty = the built-in default. */
  prompt?: string
}

/** One running dispatch: resolves with the executor process's exit code when it ends. */
export interface TaskExecution {
  readonly exited: Promise<number>
}

/** Launches one task inside an agent page and reports when its process exits. */
export interface Executor {
  run(page: PageState, task: WorkspaceTask, prompt: string): Promise<TaskExecution>
}

/** A minimal registry view the dispatcher needs (real one is PageRegistry). */
export interface RegistryView {
  get(id: string): PageState | undefined
}

export interface DispatcherLogEntry {
  level: 'info' | 'warn' | 'error'
  detail: string
  taskId?: string
  pageId?: string
}

export interface DispatcherDeps {
  /** undefined very early in boot; the dispatcher no-ops until the registry exists. */
  getRegistry(): RegistryView | undefined
  executor: Executor
  settings(): DispatcherSettings
  /** current task queue (already normalized); the single source the tick reasons over. */
  readTasks(): WorkspaceTask[]
  /** persist a whole replacement queue (bumps the shared revision via the wiring layer). */
  writeTasks(tasks: WorkspaceTask[]): void
  log(entry: DispatcherLogEntry): void
  /** injectable clock so tests can pin `at` ordering. */
  now?(): number
}

/** Are all of a task's dependencies reported done? A dep id missing from the queue is not-done. */
function depsSatisfied(task: WorkspaceTask, done: Set<string>): boolean {
  return (task.deps ?? []).every((d) => done.has(d))
}

/**
 * The next todo task eligible to run: unclaimed, dependency-complete, under the attempt cap, and
 * not already in flight. Oldest (`at`) wins so an earlier submit dispatched ahead of a later one.
 */
export function pickNextTask(tasks: WorkspaceTask[], busy: Set<string>): WorkspaceTask | null {
  const done = new Set(tasks.filter((t) => t.status === 'done').map((t) => t.id))
  let best: WorkspaceTask | null = null
  for (const t of tasks) {
    if (t.status !== 'todo') continue
    if (t.owner) continue
    if (busy.has(t.id)) continue
    if ((t.attempts ?? 0) >= MAX_ATTEMPTS) continue
    if (!depsSatisfied(t, done)) continue
    if (!best || t.at < best.at) best = t
  }
  return best
}

/** Render the prompt handed to the executor, from a template or the built-in default. */
export function buildPrompt(task: WorkspaceTask, template?: string): string {
  const deps = (task.deps ?? []).join(', ') || '无'
  if (template && template.trim()) {
    return template
      .replace(/\{title\}/g, task.title)
      .replace(/\{id\}/g, task.id)
      .replace(/\{deps\}/g, deps)
  }
  return (
    `请完成以下任务：\n` +
    `标题：${task.title}\n` +
    `编号：${task.id}\n` +
    `依赖：${deps}\n` +
    `完成后，务必调用 dsh-workspace 的 workspace_complete（taskId="${task.id}"）回填你的结果。`
  )
}

/**
 * The dispatch state machine. `tick()` is idempotent and cheap; it fills any free concurrency
 * slots with eligible tasks. Each dispatch claims the task (owner/status/attempts), runs the
 * executor, then reconciles on exit. Re-entrancy (a reconcile calling tick) is safe because an
 * in-flight task id sits in `busy` for the whole window.
 */
export class TaskDispatcher {
  private readonly deps: DispatcherDeps
  private readonly inFlight = new Set<string>()

  constructor(deps: DispatcherDeps) {
    this.deps = deps
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  /** Number of tasks currently dispatched and awaiting their executor's exit. */
  get busyCount(): number {
    return this.inFlight.size
  }

  tick(): void {
    const s = this.deps.settings()
    if (!s.enabled) return
    const registry = this.deps.getRegistry()
    if (!registry || !s.executorPageId) return
    const page = registry.get(s.executorPageId)
    if (!page || page.kind !== 'terminal') return
    const concurrency = Math.max(1, s.concurrency || 1)
    // Re-snapshot once; a claim mutates on-disk state but `busy` already excludes in-flight ids,
    // so picking from this snapshot across the loop can't double-dispatch the same task.
    const tasks = this.deps.readTasks()
    while (this.inFlight.size < concurrency) {
      const next = pickNextTask(tasks, this.inFlight)
      if (!next) break
      this.inFlight.add(next.id) // reserve synchronously before the async claim
      void this.dispatch(next, page, s)
    }
  }

  private async dispatch(task: WorkspaceTask, page: PageState, s: DispatcherSettings): Promise<void> {
    const at = this.now()
    const fresh = this.deps.readTasks()
    const t = fresh.find((x) => x.id === task.id)
    if (!t) {
      this.inFlight.delete(task.id)
      return
    }
    t.status = 'doing'
    t.owner = `${OWNER_PREFIX}${page.id}`
    t.dispatchedAt = at
    t.attempts = (t.attempts ?? 0) + 1
    t.at = at
    this.deps.writeTasks(fresh)
    this.deps.log({ level: 'info', detail: `派发给执行页`, taskId: task.id, pageId: page.id })

    const prompt = buildPrompt(task, s.prompt)
    try {
      const exec = await this.deps.executor.run(page, task, prompt)
      const code = await exec.exited
      this.reconcile(task.id, code)
    } catch (err) {
      this.deps.log({
        level: 'error',
        detail: `执行器启动失败：${(err as Error)?.message ?? String(err)}`,
        taskId: task.id,
        pageId: page.id
      })
      this.reconcile(task.id, -1)
    }
  }

  /** Reconcile one finished dispatch against the shared queue's truth, then look for more work. */
  private reconcile(taskId: string, code: number): void {
    this.inFlight.delete(taskId)
    const tasks = this.deps.readTasks()
    const t = tasks.find((x) => x.id === taskId)
    if (!t) {
      this.deps.log({ level: 'warn', detail: `任务已不存在，跳过收尾`, taskId })
      this.tick()
      return
    }
    if (t.status === 'done') {
      // The agent backfilled `workspace_complete` itself — the source of truth, nothing to add.
      this.deps.log({ level: 'info', detail: `由 agent 回填完成`, taskId })
    } else if (code === 0) {
      t.status = 'done'
      t.at = this.now()
      if (!t.result) t.result = '容器代记：执行器正常退出，但 agent 未回填结果'
      this.deps.writeTasks(tasks)
      this.deps.log({ level: 'info', detail: `执行器退出(0)，容器代为记为完成`, taskId })
    } else {
      // Abnormal exit (or a spawn failure, code -1): hand it back so it may be retried until the
      // attempt cap, clearing the claim so it becomes eligible again.
      t.status = 'todo'
      delete t.owner
      delete t.dispatchedAt
      this.deps.writeTasks(tasks)
      this.deps.log({
        level: 'warn',
        detail: `执行器异常退出(${code})，退回待办（已试 ${t.attempts ?? 0} 次）`,
        taskId
      })
    }
    this.tick()
  }
}
