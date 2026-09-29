/**
 * The usage ledger: one JSONL row per token-usage fact the container can observe, so the
 * 用量 tab can answer "what did the agents burn this week, and roughly what did it cost".
 *
 * Three ingestion paths feed it, all funnelling through {@link recordUsage}:
 * - `parse`  — a known CLI printed a usage summary line (codex / qwen-code); {@link
 *   parseUsageLine} recognises the formats, called from the page-output hot path.
 * - `mcp`    — an agent self-reports through the container MCP `container_report_usage` tool.
 * - `manual` — the user backfills a row from the 用量 tab.
 *
 * Storage mirrors shell/events.ts on purpose (day-rotated JSONL under logs/, in-memory
 * fallback mirror, every write best-effort) but keeps a far longer window: usage is
 * history you budget against, not debugging trivia, so archives survive 90 days.
 *
 * A line that only reports a *combined* total lands as input-only — per-row totals stay
 * correct; a split-price cost estimate over such rows is approximate by design.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync
} from 'node:fs'
import { join } from 'node:path'
import { logsDir } from '../../shell/logger'
import { isoShanghai } from '../../shell/time'
import type {
  UsageDayTotal,
  UsagePageTotal,
  UsageRecord,
  UsageSummary
} from '../../../shared/types'

/** Day-rotated archives older than this are dropped (≈ one quarter of budgeting). */
const RETENTION_DAYS = 90
/** In-memory mirror of the newest rows so reads work even if the file is locked. */
const MEMORY_CAP = 2000
/** Above this the active file rolls over mid-day (a chatty parser can't grow it unbounded). */
const MAX_BYTES = 1024 * 1024
/** Rows one summary read ever walks; a 90-day firehose stays bounded. */
const READ_CAP = 20_000

let activeDay: string | null = null
const memory: UsageRecord[] = []

/** `YYYY-MM-DD` in the display zone — the same clock the event timeline rolls by. */
function displayDay(ts: number): string {
  return isoShanghai(new Date(ts)).slice(0, 10)
}

function activeFile(): string {
  return join(usageDir(), 'usage.jsonl')
}

function archiveDir(): string {
  return join(usageDir(), 'usage')
}

function usageDir(): string {
  const dir = logsDir()
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* logsDir() already swallows the failure; reads below tolerate a missing file */
  }
  return dir
}

/** Move the current file aside as `usage/usage-<day>.jsonl`, suffixed rather than clobbered. */
function archiveDay(day: string): void {
  const from = activeFile()
  if (!existsSync(from)) return
  try {
    mkdirSync(archiveDir(), { recursive: true })
    let to = join(archiveDir(), `usage-${day}.jsonl`)
    for (let i = 1; existsSync(to); i++) to = join(archiveDir(), `usage-${day}.${i}.jsonl`)
    renameSync(from, to)
  } catch {
    /* keep appending to the same file rather than dropping the write */
  }
}

function pruneArchives(today: string): void {
  const cutoff = new Date(`${today}T00:00:00Z`).getTime() - RETENTION_DAYS * 86_400_000
  let names: string[] = []
  try {
    names = readdirSync(archiveDir())
  } catch {
    return
  }
  for (const name of names) {
    const mm = name.match(/^usage-(\d{4}-\d{2}-\d{2})(\.\d+)?\.jsonl$/)
    if (!mm) continue
    if (new Date(`${mm[1]}T00:00:00Z`).getTime() < cutoff) {
      try {
        unlinkSync(join(archiveDir(), name))
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}

/**
 * Append one ledger row. Never throws — a usage line is a nice-to-have, not a lifecycle fact
 * worth failing a page-log write or an MCP tool call over.
 */
export function recordUsage(rec: UsageRecord): void {
  const today = displayDay(rec.ts)
  if (activeDay && activeDay !== today) {
    archiveDay(activeDay)
    pruneArchives(today)
  }
  activeDay = today
  try {
    const file = activeFile()
    if (existsSync(file) && statSync(file).size > MAX_BYTES) archiveDay(today)
    appendFileSync(
      file,
      JSON.stringify({ ...rec, iso: isoShanghai(new Date(rec.ts)) }) + '\n',
      'utf8'
    )
  } catch {
    /* the ledger is best-effort by contract */
  }
  memory.push(rec)
  if (memory.length > MEMORY_CAP) memory.splice(0, memory.length - MEMORY_CAP)
}

/* ---- parsing: known CLI usage-summary lines ---- */

/** One recognised shape. `prompt`/`completion` fill their side; a `total`-only hit lands as input. */
interface UsagePattern {
  re: RegExp
  field: 'pair' | 'prompt' | 'completion' | 'total'
}

const NUM = String.raw`([\d,]+)`
const USAGE_PATTERNS: UsagePattern[] = [
  // codex (single line): "tokens used: 12,345" / "tokens used 12,345" — a combined total.
  { re: new RegExp(`tokens used[:\\s]+${NUM}`, 'i'), field: 'total' },
  // one-line pair: "17,706 prompt; 508 completion" (also matches inside longer summaries).
  // The `prompt tokens` leg is optional so a gap like "prompt; " (letters + separator) fits too.
  {
    re: new RegExp(
      `${NUM}\\s*prompt(?:\\s+tokens)?[^\\d]{0,4}${NUM}\\s*(?:completion|candidates)`,
      'i'
    ),
    field: 'pair'
  },
  // qwen-code / gemini-CLI style, one stat per line:
  //   "Total prompt tokens: 12,345" / "Total completion tokens: 567" / "Total candidates tokens: 567"
  { re: new RegExp(`prompt\\s+tokens[:\\s]+${NUM}`, 'i'), field: 'prompt' },
  { re: new RegExp(`(?:completion|candidates)\\s+tokens[:\\s]+${NUM}`, 'i'), field: 'completion' }
]

function toInt(s: string): number {
  return Number(s.replace(/,/g, '')) || 0
}

/** The one cheap keyword gate every hot-path caller shares — covers the pair lines, which
 *  may spell out `completion` without ever saying `token`. */
export function looksLikeUsage(line: string): boolean {
  return /token|completion|candidates/i.test(line)
}

/**
 * Recognise one usage-summary line; null for anything else. Callers gate on the cheap
 * {@link looksLikeUsage} pre-filter before this runs — it sits on the page-output hot path.
 * Deliberately does NOT match a bare "Total tokens: N" line: for the split-format CLIs the
 * prompt/completion lines already cover it, and matching both would double-count.
 */
export function parseUsageLine(pageId: string, line: string): UsageRecord | null {
  if (!line || !looksLikeUsage(line)) return null
  for (const p of USAGE_PATTERNS) {
    const m = p.re.exec(line)
    if (!m) continue
    if (p.field === 'pair') {
      const input = toInt(m[1])
      const output = toInt(m[2])
      if (!input && !output) return null
      return { ts: Date.now(), pageId, source: 'parse', inputTokens: input, outputTokens: output }
    }
    const n = toInt(m[1])
    if (!n) return null
    if (p.field === 'completion')
      return { ts: Date.now(), pageId, source: 'parse', inputTokens: 0, outputTokens: n }
    // 'prompt' and 'total' both land on the input side; see the header note on approximation.
    return { ts: Date.now(), pageId, source: 'parse', inputTokens: n, outputTokens: 0 }
  }
  return null
}

/* ---- reads ---- */

function readJsonl(file: string): UsageRecord[] {
  let raw: string
  try {
    if (!existsSync(file)) return []
    raw = readFileSync(file, 'utf-8')
  } catch {
    return []
  }
  const out: UsageRecord[] = []
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed) as UsageRecord
      if (parsed && typeof parsed.ts === 'number' && typeof parsed.pageId === 'string')
        out.push(parsed)
    } catch {
      /* a torn trailing write after a hard kill: skip the line, keep the rest */
    }
  }
  return out
}

/** Live file first, then day archives newest-first — same walk order as events.ts. */
function usageFiles(): string[] {
  const files = [activeFile()]
  let names: string[] = []
  try {
    names = readdirSync(archiveDir())
  } catch {
    /* no archives yet */
  }
  for (const name of names
    .filter((n) => /^usage-\d{4}-\d{2}-\d{2}(\.\d+)?\.jsonl$/.test(n))
    .sort()
    .reverse()) {
    files.push(join(archiveDir(), name))
  }
  return files
}

/** Rows at/after `since`, newest-first, capped. Falls back to the mirror when files are unreadable. */
export function readUsageRows(since: number): UsageRecord[] {
  let rows: UsageRecord[] = []
  for (const file of usageFiles()) {
    rows = rows.concat(readJsonl(file))
    if (rows.length >= READ_CAP) break
  }
  if (!rows.length) rows = memory.slice()
  return rows
    .filter((r) => r.ts >= since)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, READ_CAP)
}

/** Roll raw rows up into the per-page table and the per-day chart series. */
export function getUsageSummary(args: { since?: number } = {}): UsageSummary {
  const since = args.since ?? Date.now() - 30 * 86_400_000
  const rows = readUsageRows(since)
  const byPage = new Map<string, UsagePageTotal>()
  const byDay = new Map<string, UsageDayTotal>()
  for (const r of rows) {
    const p = byPage.get(r.pageId) ?? {
      pageId: r.pageId,
      inputTokens: 0,
      outputTokens: 0,
      calls: 0
    }
    p.inputTokens += r.inputTokens || 0
    p.outputTokens += r.outputTokens || 0
    p.calls += 1
    byPage.set(r.pageId, p)
    const day = displayDay(r.ts)
    const d = byDay.get(day) ?? { day, inputTokens: 0, outputTokens: 0 }
    d.inputTokens += r.inputTokens || 0
    d.outputTokens += r.outputTokens || 0
    byDay.set(day, d)
  }
  return {
    rows,
    byPage: [...byPage.values()].sort(
      (a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens)
    ),
    byDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    since
  }
}

/** Drop the mirror + rollover marker — exposed for tests that repoint the logs dir. */
export function resetUsageState(): void {
  memory.length = 0
  activeDay = null
}
