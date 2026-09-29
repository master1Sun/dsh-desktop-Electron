import { describe, it, expect } from 'vitest'
import {
  MAX_ATTEMPTS,
  OWNER_PREFIX,
  TaskDispatcher,
  buildPrompt,
  pickNextTask,
  sweepOrphanTasks,
  type DispatcherNotify,
  type DispatcherSettings,
  type Executor,
  type RegistryView,
  type TaskExecution
} from '../src/main/runtime/autopilot/task-dispatcher'
import type { PageState, WorkspaceTask } from '../src/shared/types'

const EXEC_PAGE = {
  id: 'exec',
  kind: 'terminal',
  dir: '/tmp/exec',
  startCommand: 'codex',
  name: 'Executor'
} as unknown as PageState

function task(over: Partial<WorkspaceTask> & { id: string }): WorkspaceTask {
  return { title: over.id, status: 'todo', at: Date.now(), ...over }
}

describe('pickNextTask', () => {
  it('returns null when nothing is todo', () => {
    expect(pickNextTask([task({ id: 'a', status: 'done' })], new Set())).toBeNull()
  })

  it('skips owned, busy, and dependency-unmet todos', () => {
    const tasks = [
      task({ id: 'owned', owner: 'agent' }),
      task({ id: 'busy' }),
      task({ id: 'waiting', deps: ['never'] }),
      task({ id: 'ready' })
    ]
    expect(pickNextTask(tasks, new Set(['busy']))?.id).toBe('ready')
  })

  it('waits until every dependency is done', () => {
    const blocked = [task({ id: 'dep', status: 'doing' }), task({ id: 'x', deps: ['dep'] })]
    expect(pickNextTask(blocked, new Set())).toBeNull()
    const unblocked = [task({ id: 'dep', status: 'done' }), task({ id: 'x', deps: ['dep'] })]
    expect(pickNextTask(unblocked, new Set())?.id).toBe('x')
  })

  it('honours the attempt cap', () => {
    const capped = task({ id: 'c', attempts: MAX_ATTEMPTS })
    expect(pickNextTask([capped], new Set())).toBeNull()
    expect(pickNextTask([task({ id: 'c', attempts: MAX_ATTEMPTS - 1 })], new Set())?.id).toBe('c')
  })

  it('picks the oldest eligible task', () => {
    const tasks = [
      task({ id: 'new', at: 2000 }),
      task({ id: 'old', at: 1000 }),
      task({ id: 'mid', at: 1500 })
    ]
    expect(pickNextTask(tasks, new Set())?.id).toBe('old')
  })
})

describe('buildPrompt', () => {
  it('substitutes template placeholders', () => {
    const p = buildPrompt(
      task({ id: 't9', title: 'Ship it', deps: ['a', 'b'] }),
      '{title}|{id}|{deps}'
    )
    expect(p).toBe('Ship it|t9|a, b')
  })

  it('default prompt names the id and asks the agent to backfill', () => {
    const p = buildPrompt(task({ id: 't9', title: 'Ship it' }))
    expect(p).toContain('t9')
    expect(p).toContain('workspace_complete')
  })

  it('M1 backstop: neutralises newlines/control chars smuggled into a title', () => {
    // A bare-shell executor runs each newline as its own command — the value must not carry any.
    const evil = 'Fix bug\nrm -rf /\r\t\u0000end'
    const p = buildPrompt(task({ id: 't9', title: evil }))
    // Only the template's own structural LF (\x0a) may remain; CR/tab/NUL and the injected LF are gone.
    expect(/[\x00-\x09\x0b-\x1f\x7f]/.test(p)).toBe(false)
    // The injected newline can no longer spawn a second command: exactly the template's 5 lines.
    const lines = p.split('\n')
    expect(lines).toHaveLength(5)
    // The sanitised title sits entirely on its own line (text kept, but neutralised — not its own cmd).
    const titleLine = lines.find((l) => l.startsWith('标题：'))!
    expect(titleLine).toContain('Fix bug')
    expect(titleLine).toContain('rm -rf')
  })

  it('M1 backstop: inserts $-sequences verbatim instead of re-interpreting them', () => {
    const p = buildPrompt(task({ id: 't9', title: 'pay $&100' }), '{title}')
    expect(p).toBe('pay $&100')
  })
})

/* ---- state machine over a controllable fake executor ---- */

interface Harness {
  store: WorkspaceTask[]
  setStore(next: WorkspaceTask[]): void
  runs: { task: WorkspaceTask; prompt: string; resolve: (code: number) => void }[]
  logs: { level: string; detail: string; taskId?: string }[]
  notifies: DispatcherNotify[]
  settings: DispatcherSettings
  dispatchTick: () => void
  lastRun: () =>
    { task: WorkspaceTask; prompt: string; resolve: (code: number) => void } | undefined
}

function harness(initial: WorkspaceTask[], settings?: Partial<DispatcherSettings>): Harness {
  let store = initial.map((t) => ({ ...t }))
  const runs: Harness['runs'] = []
  const logs: Harness['logs'] = []
  const notifies: Harness['notifies'] = []
  const cfg: DispatcherSettings = {
    enabled: true,
    executorPageId: 'exec',
    concurrency: 1,
    ...settings
  }
  const registry: RegistryView = { get: (id) => (id === 'exec' ? EXEC_PAGE : undefined) }
  const executor: Executor = {
    async run(_page, task, prompt): Promise<TaskExecution> {
      let resolve!: (code: number) => void
      const exited = new Promise<number>((r) => (resolve = r))
      runs.push({ task: { ...task }, prompt, resolve })
      return { exited }
    }
  }
  const dispatcher = new TaskDispatcher({
    getRegistry: () => registry,
    executor,
    settings: () => cfg,
    readTasks: () => store.map((t) => ({ ...t })),
    writeTasks: (tasks) => {
      store = tasks.map((t) => ({ ...t }))
    },
    log: (e) => logs.push({ level: e.level, detail: e.detail, taskId: e.taskId }),
    notify: (entry) => notifies.push(entry),
    now: () => 12345
  })
  return {
    get store() {
      return store
    },
    setStore(next) {
      store = next.map((t) => ({ ...t }))
    },
    runs,
    logs,
    notifies,
    settings: cfg,
    dispatchTick: () => dispatcher.tick(),
    lastRun: () => runs[runs.length - 1]
  }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
function byId(store: WorkspaceTask[], id: string): WorkspaceTask {
  return store.find((t) => t.id === id)!
}

describe('TaskDispatcher', () => {
  it('does nothing when disabled or with no executor page', async () => {
    const h = harness([task({ id: 'a', at: 1 })], { enabled: false })
    h.dispatchTick()
    expect(h.runs).toHaveLength(0)
    expect(byId(h.store, 'a').status).toBe('todo')

    const h2 = harness([task({ id: 'a', at: 1 })], { executorPageId: undefined })
    h2.dispatchTick()
    expect(h2.runs).toHaveLength(0)
  })

  it('claims the eligible task (owner/status/attempts/dispatchedAt) and hands it the prompt', () => {
    const h = harness([task({ id: 'a', title: 'Do A', at: 1 })])
    h.dispatchTick()
    expect(h.runs).toHaveLength(1)
    expect(h.lastRun()!.prompt).toContain('Do A')
    const a = byId(h.store, 'a')
    expect(a.status).toBe('doing')
    expect(a.owner).toBe(`${OWNER_PREFIX}exec`)
    expect(a.attempts).toBe(1)
    expect(a.dispatchedAt).toBe(12345)
  })

  it('leaves the queue alone when the agent already backfilled done', async () => {
    const h = harness([task({ id: 'a', at: 1 })])
    h.dispatchTick()
    // the agent completes it while the PTY is still running
    h.setStore([{ ...byId(h.store, 'a'), status: 'done', result: 'agent said done' }])
    h.lastRun()!.resolve(0)
    await flush()
    const a = byId(h.store, 'a')
    expect(a.status).toBe('done')
    expect(a.result).toBe('agent said done')
    expect(h.logs.some((l) => l.detail.includes('agent'))).toBe(true)
    // A2: the terminal done outcome fires exactly one notification, carrying the agent's result.
    expect(h.notifies).toHaveLength(1)
    expect(h.notifies[0].outcome).toBe('done')
    expect(h.notifies[0].task.result).toBe('agent said done')
  })

  it('records a container-side done on a clean exit the agent did not backfill', async () => {
    const h = harness([task({ id: 'a', at: 1 })])
    h.dispatchTick()
    h.lastRun()!.resolve(0)
    await flush()
    const a = byId(h.store, 'a')
    expect(a.status).toBe('done')
    expect(a.result).toContain('容器代记')
    expect(h.notifies).toHaveLength(1)
    expect(h.notifies[0].outcome).toBe('done')
  })

  it('reverts to todo on an abnormal exit and retries until the attempt cap', async () => {
    const h = harness([task({ id: 'a', at: 1 })])
    // attempt 1 dispatched
    h.dispatchTick()
    expect(h.runs).toHaveLength(1)
    // crash → container reverts to todo and the reconcile pass re-dispatches synchronously (attempt 2)
    h.lastRun()!.resolve(1)
    await flush()
    expect(h.runs).toHaveLength(2)
    let a = byId(h.store, 'a')
    expect(a.status).toBe('doing')
    expect(a.attempts).toBe(MAX_ATTEMPTS)
    // A2: the intermediate retry stays silent — no toast per crash before the cap is spent.
    expect(h.notifies).toHaveLength(0)
    // crash again → revert, and the cap stops a third dispatch
    h.lastRun()!.resolve(1)
    await flush()
    a = byId(h.store, 'a')
    expect(a.status).toBe('todo')
    expect(a.owner).toBeUndefined()
    expect(a.attempts).toBe(MAX_ATTEMPTS)
    expect(h.runs).toHaveLength(2)
    h.dispatchTick()
    expect(h.runs).toHaveLength(2)
    // …and exactly one failed notification once the cap is spent.
    expect(h.notifies).toHaveLength(1)
    expect(h.notifies[0].outcome).toBe('failed')
    expect(h.notifies[0].code).toBe(1)
  })

  it('respects concurrency: one at a time, chaining as each finishes', async () => {
    const h = harness([task({ id: 'a', at: 1 }), task({ id: 'b', at: 2 })], { concurrency: 1 })
    h.dispatchTick()
    expect(h.runs).toHaveLength(1)
    expect(h.lastRun()!.task.id).toBe('a')
    // finishing 'a' schedules 'b'
    h.lastRun()!.resolve(0)
    await flush()
    expect(h.runs).toHaveLength(2)
    expect(h.lastRun()!.task.id).toBe('b')
  })

  it('dispatches up to `concurrency` tasks in a single pass', () => {
    const h = harness([task({ id: 'a', at: 1 }), task({ id: 'b', at: 2 })], { concurrency: 2 })
    h.dispatchTick()
    expect(h.runs).toHaveLength(2)
    expect(new Set(h.runs.map((r) => r.task.id))).toEqual(new Set(['a', 'b']))
  })
})

describe('sweepOrphanTasks', () => {
  /* A3: the startup reclaim, kept pure — everything a previous run claimed but never reconciled. */
  it('returns an autopilot-claimed doing task to todo, clearing the claim but keeping attempts', () => {
    const now = 999
    const { tasks, swept } = sweepOrphanTasks(
      [
        task({
          id: 'orphan',
          status: 'doing',
          owner: `${OWNER_PREFIX}exec`,
          dispatchedAt: 1,
          attempts: 1,
          at: 5
        }),
        task({ id: 'agent-claim', status: 'doing', owner: 'some-agent', at: 5 }),
        task({ id: 'todo', at: 5 }),
        task({ id: 'done', status: 'done', owner: `${OWNER_PREFIX}exec`, at: 5 })
      ],
      now
    )
    expect(swept).toEqual(['orphan'])
    const o = byId(tasks, 'orphan')
    expect(o.status).toBe('todo')
    expect(o.owner).toBeUndefined()
    expect(o.dispatchedAt).toBeUndefined()
    // attempts survives so the crash cap keeps bounding a task that keeps orphaning.
    expect(o.attempts).toBe(1)
    expect(o.at).toBe(now)
    // untouched rows keep identity (no needless rewrites / revision churn for them).
    expect(byId(tasks, 'agent-claim')).toBe(tasks[1])
    expect(byId(tasks, 'todo')).toBe(tasks[2])
    expect(byId(tasks, 'done').status).toBe('done')
  })

  it('sweeps nothing for a clean queue', () => {
    const { tasks, swept } = sweepOrphanTasks([task({ id: 'a' })])
    expect(swept).toEqual([])
    expect(tasks).toHaveLength(1)
  })
})
