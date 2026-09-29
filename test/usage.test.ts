import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// usage.ts → logger.ts → electron `app.getPath('userData')` — the same scratch-dir mock the
// events tests use: the ledger writes under `logs/`, so every case shares one repointed dir.
const scratch = join(tmpdir(), `dsh-container-usage-test-${process.pid}`)
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
  getUsageSummary,
  parseUsageLine,
  recordUsage,
  resetUsageState
} from '../src/main/runtime/diagnostics/usage'

const ACTIVE = join(scratch, 'logs', 'usage.jsonl')
const ARCHIVE = join(scratch, 'logs', 'usage')

/* ---- parseUsageLine: the recognised CLI usage-summary shapes ---- */

describe('parseUsageLine', () => {
  it('reads a codex-style combined total onto the input side', () => {
    const r = parseUsageLine('p1', 'tokens used: 12,345')
    expect(r).toMatchObject({ pageId: 'p1', source: 'parse', inputTokens: 12345, outputTokens: 0 })
    // no colon, bare number — both shapes print in the wild
    expect(parseUsageLine('p1', 'tokens used 980')?.inputTokens).toBe(980)
  })

  it('reads a one-line prompt/completion pair', () => {
    const r = parseUsageLine('p1', 'session total: 17,706 prompt; 508 completion')
    expect(r).toMatchObject({ inputTokens: 17706, outputTokens: 508 })
  })

  it("reads qwen/gemini's split lines (prompt / completion / candidates)", () => {
    expect(parseUsageLine('p1', 'Total prompt tokens: 12,345')).toMatchObject({
      inputTokens: 12345,
      outputTokens: 0
    })
    expect(parseUsageLine('p1', 'Total completion tokens: 567')).toMatchObject({
      inputTokens: 0,
      outputTokens: 567
    })
    expect(parseUsageLine('p1', 'Total candidates tokens: 567')).toMatchObject({
      inputTokens: 0,
      outputTokens: 567
    })
  })

  it('stays silent on anything it does not know — the ledger prefers missing rows to wrong ones', () => {
    expect(parseUsageLine('p1', 'no numbers here at all')).toBeNull()
    expect(parseUsageLine('p1', 'token bucket refill scheduled')).toBeNull()
    // A bare combined total is deliberately NOT matched: the split lines already cover those CLIs.
    expect(parseUsageLine('p1', 'Total tokens: 999')).toBeNull()
    expect(parseUsageLine('p1', 'tokens used: 0')).toBeNull()
  })
})

/* ---- the ledger: durable rows, aggregations, day rollover ---- */

describe('usage ledger', () => {
  beforeEach(() => {
    rmSync(join(scratch, 'logs'), { recursive: true, force: true })
    resetUsageState()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('appends one JSONL row per record, with a human stamp alongside the epoch', () => {
    recordUsage({
      ts: Date.now(),
      pageId: 'p1',
      source: 'manual',
      inputTokens: 10,
      outputTokens: 4
    })
    const lines = readFileSync(ACTIVE, 'utf-8').trim().split(/\r?\n/)
    expect(lines).toHaveLength(1)
    const row = JSON.parse(lines[0])
    expect(row).toMatchObject({ pageId: 'p1', source: 'manual', inputTokens: 10, outputTokens: 4 })
    expect(row.iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('rolls the file over when the day changes and reads both parts back', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-03-03T02:00:00Z'))
    recordUsage({
      ts: Date.now(),
      pageId: 'p1',
      source: 'parse',
      inputTokens: 100,
      outputTokens: 0
    })

    vi.setSystemTime(new Date('2025-03-04T02:00:00Z'))
    recordUsage({ ts: Date.now(), pageId: 'p1', source: 'parse', inputTokens: 0, outputTokens: 50 })

    expect(readdirSync(ARCHIVE)).toEqual(['usage-2025-03-03.jsonl'])
    const s = getUsageSummary({ since: 0 })
    // both days are still queryable — the tab budgets against history, not since-last-launch
    expect(s.rows).toHaveLength(2)
    expect(s.byPage[0]).toMatchObject({
      pageId: 'p1',
      inputTokens: 100,
      outputTokens: 50,
      calls: 2
    })
    expect(s.byDay.map((d) => d.day)).toEqual(['2025-03-03', '2025-03-04'])
  })

  it('falls back to the mirror around a torn file and skips schema-invalid rows', () => {
    recordUsage({ ts: Date.now(), pageId: 'p1', source: 'manual', inputTokens: 1, outputTokens: 1 })
    // Leave only a torn trailing write in the file (the shape a hard kill mid-append produces).
    writeFileSync(ACTIVE, '{"ts":123,"pageId":"p1",sou', 'utf-8')
    // The torn line is skipped, not fatal; with no valid file rows the mirror answers the read.
    expect(getUsageSummary({ since: 0 }).rows).toHaveLength(1)
    // A well-formed row that is not a ledger record (no pageId) never lands either.
    writeFileSync(ACTIVE, '{"ts":1,"level":"info"}\n', 'utf-8')
    const rows = getUsageSummary({ since: 0 }).rows
    expect(rows.every((r) => typeof r.pageId === 'string' && r.pageId !== 'undefined')).toBe(true)
  })

  it('aggregates per page newest-first and honours the since window', () => {
    const now = Date.now()
    recordUsage({ ts: now, pageId: 'big', source: 'mcp', inputTokens: 500, outputTokens: 10 })
    recordUsage({ ts: now - 1, pageId: 'small', source: 'mcp', inputTokens: 1, outputTokens: 1 })
    recordUsage({
      ts: now - 40 * 86_400_000,
      pageId: 'old',
      source: 'mcp',
      inputTokens: 999,
      outputTokens: 0
    })
    const s = getUsageSummary({ since: now - 30 * 86_400_000 })
    expect(s.byPage.map((p) => p.pageId)).toEqual(['big', 'small'])
    expect(s.rows.map((r) => r.pageId)).toEqual(['big', 'small'])
    expect(s.since).toBe(now - 30 * 86_400_000)
    // The default window (no arg) is 30 days, so the 40-day-old row stays out of it too.
    expect(getUsageSummary().byPage.some((p) => p.pageId === 'old')).toBe(false)
  })

  it('is best-effort: an unwritable ledger never throws back into the caller', () => {
    // Replace the active file with a directory: every append against it fails on ENOSUMBER-like
    // errors, which the writer must swallow (a usage line can't take a page-log write down).
    rmSync(join(scratch, 'logs'), { recursive: true, force: true })
    mkdirSync(join(scratch, 'logs'), { recursive: true })
    mkdirSync(ACTIVE)
    expect(() =>
      recordUsage({
        ts: Date.now(),
        pageId: 'p1',
        source: 'parse',
        inputTokens: 3,
        outputTokens: 3
      })
    ).not.toThrow()
    expect(existsSync(ACTIVE)).toBe(true)
    // …and the mirror still answers the read, which is exactly why it exists.
    rmSync(ACTIVE, { recursive: true, force: true })
    expect(getUsageSummary({ since: 0 }).rows).toHaveLength(1)
  })
})
