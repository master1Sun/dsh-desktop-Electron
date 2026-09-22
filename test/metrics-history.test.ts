import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * B1: the per-page trend ring. Sampling itself is faked here — the PowerShell child process is
 * stubbed to replay `pid|workingSet|cpuSeconds` lines, and `Date.now` is pinned so the CPU *rate*
 * (a diff of two cumulative samples against wall clock) is exact instead of timing-dependent.
 * What these cases pin down is retention: one point per sample, 120 deep, per page, and dropped
 * when the process is gone.
 */

const sampled = vi.hoisted(() => ({ lines: [] as string[], fail: false }))

vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    spawn: () => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter()
      })
      // The caller wires its listeners synchronously after spawn(); flush on the microtask queue
      // so the data/close handlers exist by the time anything is emitted.
      queueMicrotask(() => {
        if (sampled.fail) {
          child.emit('close', 1)
          return
        }
        for (const line of sampled.lines) child.stdout.emit('data', `${line}\n`)
        child.emit('close', 0)
      })
      return child
    }
  }
})

// The Windows sampler is the interesting path (one batched PowerShell per tick); pin the platform
// so the case runs the same on a Linux CI host.
Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })

import { collectPageMetrics, getMetricsHistory, resetMetricsHistory } from '../src/main/runtime/metrics'
import type { PageMetrics } from '../src/shared/types'
import type { PageRegistry } from '../src/main/runtime/pages'

const MB = 1024 * 1024

function registryWith(...pages: Array<{ id: string; pid: number }>): PageRegistry {
  return { running: () => pages } as unknown as PageRegistry
}

/** One sample line: a root pid, its tree's working set, and cumulative CPU seconds. */
function line(pid: number, memMb: number, cpuSec: number): string {
  return `${pid}|${memMb * MB}|${cpuSec}`
}

/** Every case here samples exactly one or two pages; fail loudly instead of reading `[0]` off a blank. */
async function sampleOne(reg: PageRegistry, memWarnMb: number): Promise<PageMetrics> {
  const [row] = await collectPageMetrics(reg, memWarnMb)
  if (!row) throw new Error('expected one sample row')
  return row
}

function rowsOf(pageId: string): PageMetrics[] {
  const rows = getMetricsHistory()[pageId]
  if (!rows) throw new Error(`no history retained for ${pageId}`)
  return rows
}

let clock: { now: number }

beforeEach(() => {
  resetMetricsHistory()
  sampled.lines = []
  sampled.fail = false
  clock = { now: 1_000 }
  vi.spyOn(Date, 'now').mockImplementation(() => clock.now)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('metrics history', () => {
  it('stores one point per sample and diffs CPU into a percent', async () => {
    const reg = registryWith({ id: 'p1', pid: 4242 })
    sampled.lines = [line(4242, 200, 10)]
    const first = await sampleOne(reg, 500)
    expect(first).toMatchObject({ pageId: 'p1', pid: 4242, memMb: 200, overLimit: false })
    // No previous sample means no rate to report — 0, not a wild first-tick spike.
    expect(first.cpu).toBe(0)
    expect(first.ts).toBe(1_000)

    clock.now += 10_000
    sampled.lines = [line(4242, 210, 10.5)]
    const second = await sampleOne(reg, 500)
    // 0.5 CPU-seconds over 10 wall-seconds.
    expect(second.cpu).toBe(5)
    expect(second.ts).toBe(11_000)

    expect(rowsOf('p1').map((r) => r.memMb)).toEqual([200, 210])
  })

  it('flags a page that crossed its memory budget', async () => {
    const reg = registryWith({ id: 'p1', pid: 4242 })
    sampled.lines = [line(4242, 900, 1)]
    expect((await sampleOne(reg, 500)).overLimit).toBe(true)
    // A budget of 0 means "no limit configured", which must never read as "always over".
    sampled.lines = [line(4242, 900, 1)]
    expect((await sampleOne(reg, 0)).overLimit).toBe(false)
  })

  it('keeps the newest 120 points and drops the oldest', async () => {
    const reg = registryWith({ id: 'p1', pid: 4242 })
    for (let i = 0; i < 130; i++) {
      clock.now += 1_000
      sampled.lines = [line(4242, i, 1)]
      await collectPageMetrics(reg, 0)
    }
    const rows = rowsOf('p1')
    expect(rows).toHaveLength(120)
    expect(rows[0]?.memMb).toBe(10)
    expect(rows[rows.length - 1]?.memMb).toBe(129)
  })

  it('keeps a separate curve per page and forgets one that stopped', async () => {
    sampled.lines = [line(1, 10, 1), line(2, 20, 1)]
    await collectPageMetrics(registryWith({ id: 'p1', pid: 1 }, { id: 'p2', pid: 2 }), 0)
    expect(Object.keys(getMetricsHistory()).sort()).toEqual(['p1', 'p2'])

    // p2 exits: the next tick only reports p1, which is what tells the ring p2 is gone.
    sampled.lines = [line(1, 11, 1)]
    clock.now += 5_000
    await collectPageMetrics(registryWith({ id: 'p1', pid: 1 }), 0)
    const after = getMetricsHistory()
    expect(Object.keys(after)).toEqual(['p1'])
    expect(rowsOf('p1').map((r) => r.memMb)).toEqual([10, 11])
  })

  it('drops every curve once nothing is running, so a stopped page shows no stale trend', async () => {
    sampled.lines = [line(1, 10, 1)]
    await collectPageMetrics(registryWith({ id: 'p1', pid: 1 }), 0)
    expect(rowsOf('p1')).toHaveLength(1)

    await collectPageMetrics(registryWith(), 0)
    expect(getMetricsHistory()).toEqual({})
  })

  it('keeps the curve when the sampler itself fails', async () => {
    sampled.lines = [line(1, 10, 1)]
    await collectPageMetrics(registryWith({ id: 'p1', pid: 1 }), 0)

    // A broken PowerShell pass is a gap in the chart, not a reset — the panel would otherwise
    // lose ten minutes of history to one flaky probe.
    sampled.fail = true
    expect(await collectPageMetrics(registryWith({ id: 'p1', pid: 1 }), 0)).toEqual([])
    expect(rowsOf('p1')).toHaveLength(1)
  })

  it('hands out copies, so a reader cannot push into the ring', async () => {
    sampled.lines = [line(1, 10, 1)]
    await collectPageMetrics(registryWith({ id: 'p1', pid: 1 }), 0)
    const rows = rowsOf('p1')
    rows.push({ ...rows[rows.length - 1], memMb: 999 })
    expect(rowsOf('p1').map((r) => r.memMb)).toEqual([10])
  })
})
