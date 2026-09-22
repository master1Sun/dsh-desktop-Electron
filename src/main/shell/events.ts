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
import { logsDir } from './logger'
import { isoShanghai } from './time'
import type { ContainerEvent, ListEventsArgs } from '../../shared/types'

/**
 * The activity timeline: one structured line per lifecycle event the user (or a maintainer)
 * may later want to reconstruct — a page that crashed and was auto-restarted, a port that was
 * already taken, an OTA that got staged, a runtime that failed to provision.
 *
 * The plain-text logs under `logs/` answer "what did the process print"; this answers "what
 * happened, in order, across the whole app". Records are appended as JSONL to
 * `logs/events.jsonl` (day-rotated, {@link RETENTION_DAYS} days kept) so the history survives
 * restarts and can be shipped in a diagnostics bundle.
 *
 * Only the *fact* is persisted — `kind` plus machine params in `meta`. The sentence is built in
 * the renderer from the `evt.<kind>` template, so switching the UI language re-labels the whole
 * history, exactly like the page-progress phases already do.
 *
 * Every write is best-effort: a timeline that can throw back into a page-spawn path would turn
 * a diagnostic into an outage.
 */

/** Day-rotated archives older than this are dropped; enough to cover a weekend of debugging. */
const RETENTION_DAYS = 7
/** In-memory mirror of the newest rows, so the panel opens instantly and reads work if the file is locked. */
const MEMORY_CAP = 500
/** Above this the active file is rolled over mid-day (a chatty crash loop can't grow the log unbounded). */
const MAX_BYTES = 1024 * 1024

let activeDay: string | null = null
const memory: ContainerEvent[] = []
let broadcaster: ((ev: ContainerEvent) => void) | null = null

/** `YYYY-MM-DD` in the display zone — the same clock every log stamp uses. */
function displayDay(ts = Date.now()): string {
  return isoShanghai(new Date(ts)).slice(0, 10)
}

function activeFile(): string {
  return join(eventsDir(), 'events.jsonl')
}

/** `logs/events` holds the day archives; the live file stays directly in `logs/` next to main.log. */
function archiveDir(): string {
  return join(eventsDir(), 'events')
}

function eventsDir(): string {
  const dir = logsDir()
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* logsDir() already swallows the failure; every read below tolerates a missing file */
  }
  return dir
}

/** Move the current file aside as `events/<day>.jsonl`, suffixed rather than clobbered. */
function archiveDay(day: string): void {
  const from = activeFile()
  if (!existsSync(from)) return
  try {
    mkdirSync(archiveDir(), { recursive: true })
    let to = join(archiveDir(), `events-${day}.jsonl`)
    for (let i = 1; existsSync(to); i++) to = join(archiveDir(), `events-${day}.${i}.jsonl`)
    renameSync(from, to)
  } catch {
    /* keep appending to the same file rather than dropping the write */
  }
}

/** Delete archives past the retention window; the live file is never touched. */
function pruneArchives(today: string): void {
  const cutoff = new Date(`${today}T00:00:00Z`).getTime() - RETENTION_DAYS * 86_400_000
  let names: string[] = []
  try {
    names = readdirSync(archiveDir())
  } catch {
    return
  }
  for (const name of names) {
    const mm = name.match(/^events-(\d{4}-\d{2}-\d{2})(\.\d+)?\.jsonl$/)
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

/** Read one JSONL file's rows, newest-last; empty when the file is missing or half-written. */
function readJsonl(file: string): ContainerEvent[] {
  let raw: string
  try {
    if (!existsSync(file)) return []
    raw = readFileSync(file, 'utf-8')
  } catch {
    return []
  }
  const out: ContainerEvent[] = []
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed) as ContainerEvent
      if (parsed && typeof parsed.kind === 'string' && typeof parsed.ts === 'number') out.push(parsed)
    } catch {
      /* a torn trailing write is expected after a hard kill — skip the line, keep the rest */
    }
  }
  return out
}

/** Every event file newest-last: the live file first, then day archives, newest day first. */
function eventFiles(): string[] {
  const files = [activeFile()]
  let names: string[] = []
  try {
    names = readdirSync(archiveDir())
  } catch {
    /* no archives yet */
  }
  for (const name of names.filter((n) => /^events-\d{4}-\d{2}-\d{2}(\.\d+)?\.jsonl$/.test(n)).sort().reverse()) {
    files.push(join(archiveDir(), name))
  }
  return files
}

/** Register the window broadcaster once, at IPC setup. */
export function setEventBroadcaster(fn: ((ev: ContainerEvent) => void) | null): void {
  broadcaster = fn
}

/**
 * Append one timeline entry. Returns the stored record so a caller can show or forward it
 * without re-reading the log. Never throws.
 */
export function logEvent(input: {
  level: ContainerEvent['level']
  kind: string
  pageId?: string
  detail?: string
  meta?: Record<string, string | number | boolean | undefined>
}): ContainerEvent {
  // Drop undefined-valued params so an optional fact (a port we never resolved) never reaches
  // the renderer as the literal "undefined" through the i18n interpolation.
  const meta: Record<string, string | number | boolean> | undefined = input.meta
    ? (Object.fromEntries(
        Object.entries(input.meta).filter(([, v]) => v !== undefined)
      ) as Record<string, string | number | boolean>)
    : undefined
  const ev: ContainerEvent = {
    ts: Date.now(),
    level: input.level,
    kind: input.kind,
    ...(input.pageId ? { pageId: input.pageId } : {}),
    ...(input.detail ? { detail: input.detail } : {}),
    ...(meta ? { meta } : {})
  }
  const today = displayDay(ev.ts)
  if (activeDay && activeDay !== today) {
    archiveDay(activeDay)
    pruneArchives(today)
  }
  activeDay = today
  try {
    // Roll a runaway same-day file too (a crash loop pushing one event per retry).
    const file = activeFile()
    if (existsSync(file) && statSync(file).size > MAX_BYTES) archiveDay(today)
    appendFileSync(file, JSON.stringify({ ...ev, iso: isoShanghai(new Date(ev.ts)) }) + '\n', 'utf8')
  } catch {
    /* the timeline is never worth an exception in a spawn path */
  }
  memory.push(ev)
  if (memory.length > MEMORY_CAP) memory.splice(0, memory.length - MEMORY_CAP)
  try {
    broadcaster?.(ev)
  } catch {
    /* a dead window must not stop the next event */
  }
  return ev
}

/** Newest-first, filtered. Falls back to the in-memory mirror when nothing could be read. */
export function listEvents(args: ListEventsArgs = {}): ContainerEvent[] {
  const limit = Math.max(1, Math.min(2000, args.limit ?? 200))
  let rows: ContainerEvent[] = []
  for (const file of eventFiles()) {
    rows = rows.concat(readJsonl(file))
    if (rows.length >= limit * 2) break
  }
  if (!rows.length) rows = memory.slice()
  const order = new Map<ContainerEvent, number>()
  rows.forEach((r, i) => order.set(r, i))
  const filtered = rows.filter(
    (r) =>
      (!args.level || r.level === args.level) &&
      (!args.pageId || r.pageId === args.pageId) &&
      (!args.kind || r.kind === args.kind) &&
      (!args.since || r.ts >= args.since)
  )
  // Rows arrive in append order within each file, so a plain `ts` compare leaves same-millisecond
  // rows in write order — `Array#sort` is stable — and a crash loop logs several events per tick.
  // The recorded position breaks those ties newest-first; a tie *between* files would need two
  // same-ms stamps on different days, which the day rollover makes unreachable.
  filtered.sort((a, b) => b.ts - a.ts || (order.get(b) ?? 0) - (order.get(a) ?? 0))
  return filtered.slice(0, limit)
}

/** Drop the mirror and the rollover marker — exposed for tests that repoint the logs dir. */
export function resetEventState(): void {
  memory.length = 0
  activeDay = null
}
