import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// events.ts → logger.ts → electron `app.getPath('userData')`. The logger memoizes the directory
// on first read, so every case in this file shares one scratch dir — that is exactly what the
// rotation checks below want to inspect from disk.
const scratch = join(tmpdir(), `dsh-container-events-test-${process.pid}`)
vi.mock('electron', () => {
  const stub = {
    app: {
      getPath: (name: string) => (name === 'userData' ? scratch : scratch),
      getVersion: () => '0.0.0-test',
      isPackaged: false
    },
    ipcMain: { on: () => undefined }
  }
  return { ...stub, default: stub }
})

import {
  listEvents,
  logEvent,
  resetEventState,
  setEventBroadcaster
} from '../src/main/shell/events'

const ACTIVE = join(scratch, 'logs', 'events.jsonl')
const ARCHIVE = join(scratch, 'logs', 'events')

/**
 * A1: the activity timeline. What matters here is that the store is durable (JSONL on disk,
 * day-rotated), bounded (memory mirror + size/day rollover), and that a read filters and orders
 * without assuming the writer's order — the panel subscribes live and also re-reads on open.
 */

describe('event timeline storage', () => {
  beforeEach(() => {
    rmSync(join(scratch, 'logs'), { recursive: true, force: true })
    resetEventState()
    setEventBroadcaster(null)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('appends one JSONL row per event and returns the stored record', () => {
    const ev = logEvent({ level: 'warn', kind: 'page.crash', pageId: 'p1', meta: { code: 1 } })
    const lines = readFileSync(ACTIVE, 'utf-8').trim().split(/\r?\n/)
    expect(lines).toHaveLength(1)
    const row = JSON.parse(lines[0])
    expect(row).toMatchObject({ level: 'warn', kind: 'page.crash', pageId: 'p1', meta: { code: 1 } })
    // A human-readable stamp is written alongside the epoch so the file can be read as-is.
    expect(row.iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(ev.ts).toBeGreaterThan(0)
  })

  it('drops undefined-valued params instead of storing "undefined"', () => {
    logEvent({ level: 'info', kind: 'ota.done', meta: { version: '1.2.3', missing: undefined } })
    const [row] = listEvents()
    expect(row.meta).toEqual({ version: '1.2.3' })
  })

  it('keeps the newest 500 rows in the in-memory mirror', () => {
    // Remove the file after writing: the read then has to come from the mirror, which is the
    // only way the cap is observable — and the case a locked/unreadable log degrades to.
    for (let i = 0; i < 520; i++) {
      logEvent({ level: 'info', kind: `tick.${i}`, meta: { i } })
    }
    rmSync(ACTIVE, { force: true })
    const rows = listEvents({ limit: 2000 })
    expect(rows).toHaveLength(500)
    // Newest first, and the 520 writes leave the 20 oldest dropped.
    expect(rows[0].kind).toBe('tick.519')
    expect(rows[rows.length - 1].kind).toBe('tick.20')
  })

  it('rolls the file over when the day changes and reads both parts back', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-03T02:00:00Z'))
    logEvent({ level: 'info', kind: 'day.one' })

    vi.setSystemTime(new Date('2025-03-04T02:00:00Z'))
    logEvent({ level: 'info', kind: 'day.two' })

    expect(existsSync(ACTIVE)).toBe(true)
    const archives = readdirSync(ARCHIVE).filter((n) => n.endsWith('.jsonl'))
    expect(archives).toHaveLength(1)
    expect(archives[0]).toBe('events-2025-03-03.jsonl')
    // The archived day is still queryable — the panel shows a week, not "since this launch".
    const kinds = listEvents({ limit: 50 }).map((r) => r.kind)
    expect(kinds).toContain('day.one')
    expect(kinds).toContain('day.two')
    expect(kinds[0]).toBe('day.two')
  })

  it('prunes archives past the retention window and keeps the live file', () => {
    mkdirSync(ARCHIVE, { recursive: true })
    writeFileSync(join(ARCHIVE, 'events-2025-01-01.jsonl'), '{"ts":1,"level":"info","kind":"old"}\n')
    writeFileSync(join(ARCHIVE, 'events-2025-03-02.jsonl'), '{"ts":2,"level":"info","kind":"recent"}\n')
    vi.useFakeTimers()
    // Pruning rides on the rollover: it happens when the day changes, not on every write.
    vi.setSystemTime(new Date('2025-03-06T02:00:00Z'))
    logEvent({ level: 'info', kind: 'now' })
    vi.setSystemTime(new Date('2025-03-07T02:00:00Z'))
    logEvent({ level: 'info', kind: 'tomorrow' })

    expect(existsSync(join(ARCHIVE, 'events-2025-01-01.jsonl'))).toBe(false)
    expect(existsSync(join(ARCHIVE, 'events-2025-03-02.jsonl'))).toBe(true)
    // The cutoff is the archive file's day, so a 1970 row inside a recent file survives — the
    // timeline is trimmed per day of history, never per row.
    expect(listEvents().map((r) => r.kind)).toContain('recent')
    expect(existsSync(ACTIVE)).toBe(true)
  })

  it('skips a torn trailing line instead of failing the whole read', () => {
    logEvent({ level: 'info', kind: 'good' })
    appendFileSync(ACTIVE, '{"ts":123,"level":"inf', 'utf-8')
    const rows = listEvents()
    expect(rows.map((r) => r.kind)).toEqual(['good'])
  })
})

describe('event timeline queries', () => {
  beforeEach(() => {
    rmSync(join(scratch, 'logs'), { recursive: true, force: true })
    resetEventState()
    // Give every seeded row its own millisecond: the "lower time bound" case below slices by
    // ts, and two rows written in the same ms make the boundary include one extra row (flake).
    const logSpaced = (ev: Parameters<typeof logEvent>[0]): void => {
      const t = Date.now()
      logEvent(ev)
      while (Date.now() <= t) {
        /* spin until the clock moves so the next row gets a strictly newer ts */
      }
    }
    logSpaced({ level: 'info', kind: 'page.start', pageId: 'a' })
    logSpaced({ level: 'warn', kind: 'page.crash', pageId: 'a', meta: { n: 1 } })
    logSpaced({ level: 'error', kind: 'page.giveUp', pageId: 'b' })
    logSpaced({ level: 'info', kind: 'download.done', pageId: 'b' })
  })

  it('returns the newest first', () => {
    expect(listEvents().map((r) => r.kind)).toEqual([
      'download.done',
      'page.giveUp',
      'page.crash',
      'page.start'
    ])
  })

  it('filters by level, page and kind independently', () => {
    expect(listEvents({ level: 'warn' }).map((r) => r.kind)).toEqual(['page.crash'])
    expect(listEvents({ pageId: 'a' }).map((r) => r.kind)).toEqual(['page.crash', 'page.start'])
    expect(listEvents({ kind: 'download.done' })).toHaveLength(1)
    expect(listEvents({ level: 'info', pageId: 'b' }).map((r) => r.kind)).toEqual([
      'download.done'
    ])
  })

  it('honours a lower time bound and the row cap', () => {
    const all = listEvents()
    const since = all[1].ts
    expect(listEvents({ since }).map((r) => r.kind)).toEqual(['download.done', 'page.giveUp'])
    expect(listEvents({ limit: 2 })).toHaveLength(2)
    // A cap below 1 is still a real request for at least the newest row.
    expect(listEvents({ limit: 0 })).toHaveLength(1)
  })

  it('hands each live row to the registered broadcaster once', () => {
    const seen: string[] = []
    setEventBroadcaster((ev) => seen.push(ev.kind))
    logEvent({ level: 'info', kind: 'port.conflict', pageId: 'a' })
    setEventBroadcaster(null)
    logEvent({ level: 'info', kind: 'after.unregister' })
    expect(seen).toEqual(['port.conflict'])
  })

  it('never lets a throwing broadcaster reach the caller', () => {
    setEventBroadcaster(() => {
      throw new Error('window gone')
    })
    expect(() => logEvent({ level: 'info', kind: 'survivor' })).not.toThrow()
    expect(listEvents({ kind: 'survivor' })).toHaveLength(1)
    setEventBroadcaster(null)
  })
})
