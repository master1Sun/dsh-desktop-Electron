import { app } from 'electron'
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  statSync
} from 'node:fs'
import { join } from 'node:path'
import { m } from './i18n'
import type { LogFileInfo, LogReadResult } from '../shared/types'

/**
 * Dependency-free file logging for the packaged app.
 *
 * A packaged Electron app has no stderr: everything we `console.error` — the
 * uncaughtException guard, PTY pump failures, page spawn warnings — simply
 * disappears, which makes field bugs unanswerable. This module mirrors every
 * console call into `userData/logs/main.log` (plus per-page child output in
 * `logs/pages/<id>.log`) with size-capped rotation, and exposes the directory
 * so the About panel can offer "打开日志目录".
 *
 * Kept deliberately small (no electron-log): the volume here is a few lines
 * per boot plus page tails, and any new dependency must survive the asar OTA
 * update path, so fewer moving parts is a correctness feature.
 */

const MAX_BYTES = 5 * 1024 * 1024
const ROTATED_KEEP = 1 // main.log → main.log.1 (oldest dropped)

let logsRoot: string | null = null
let installed = false

/** `userData/logs`, created on demand. Falls back to a tmp dir if userData is unavailable. */
export function logsDir(): string {
  if (logsRoot) return logsRoot
  let base: string
  try {
    base = app.getPath('userData')
  } catch {
    base = app.getPath('temp')
  }
  logsRoot = join(base, 'logs')
  try {
    mkdirSync(logsRoot, { recursive: true })
  } catch {
    /* unreadable logs dir must never take the app down */
  }
  return logsRoot
}

function rotateIfNeeded(file: string): void {
  try {
    if (!existsSync(file) || statSync(file).size < MAX_BYTES) return
    for (let i = ROTATED_KEEP; i >= 1; i--) {
      const from = i === 1 ? file : `${file}.${i - 1}`
      const to = `${file}.${i}`
      if (existsSync(from)) {
        if (i > ROTATED_KEEP && existsSync(to)) continue // drop the oldest instead of stacking
        renameSync(from, to)
      }
    }
  } catch {
    /* rotation is best-effort */
  }
}

function append(file: string, line: string): void {
  try {
    rotateIfNeeded(file)
    appendFileSync(file, line, 'utf8')
  } catch {
    /* logging must never throw back into the caller */
  }
}

const stamp = (): string => new Date().toISOString()

/** One mirrored console line: `[2026-..] [level] ...args`. */
function writeLine(level: string, args: unknown[]): void {
  const parts = args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : safeStr(a)))
  append(join(logsDir(), 'main.log'), `[${stamp()}] [${level}] ${parts.join(' ')}\n`)
}

function safeStr(v: unknown): string {
  if (typeof v === 'string') return v
  try {
    return typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)
  } catch {
    return '[unserializable]'
  }
}

/** Wrap console.* so every existing call site lands on disk without per-file changes. */
export function installFileLogger(): void {
  if (installed) return
  installed = true
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]): void => {
      writeLine(level.toUpperCase(), args)
      original(...args)
    }
  }
}

/** Append a page child's raw output line to `logs/pages/<id>.log`. */
export function logPageLine(pageId: string, chunk: string): void {
  const safe = pageId.replace(/[^\w.-]/g, '_')
  const dir = join(logsDir(), 'pages')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    return
  }
  const file = join(dir, `${safe}.log`)
  rotateIfNeeded(file)
  const body = chunk
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => `[${stamp()}] ${l}\n`)
    .join('')
  if (body) append(file, body)
}

/* ---- in-app log viewer backing (IPC container:list-log-files / container:read-logs) ---- */

/** Resolve a viewer key ('main' | 'pages/<file>') to an on-disk path; null on anything
 *  else — the key comes from the renderer, so path traversal must not resolve. */
function resolveLogKey(key: string): string | null {
  if (key === 'main') return join(logsDir(), 'main.log')
  const mm = key.match(/^pages\/([\w.-]+)\.log$/)
  if (mm && !mm[1].includes('..')) return join(logsDir(), 'pages', `${mm[1]}.log`)
  return null
}

/** Every readable log file: the mirrored main log + one per hosted page child. */
export function listLogFiles(): LogFileInfo[] {
  const out: LogFileInfo[] = []
  const push = (key: string, label: string, file: string): void => {
    try {
      const st = statSync(file)
      if (st.isFile()) out.push({ key, label, bytes: st.size, mtimeMs: st.mtimeMs })
    } catch {
      /* missing/unreadable: simply not listed */
    }
  }
  push('main', m('log.mainLabel'), join(logsDir(), 'main.log'))
  const dir = join(logsDir(), 'pages')
  try {
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (f.endsWith('.log')) push(`pages/${f}`, f.replace(/\.log$/, ''), join(dir, f))
      }
    }
  } catch {
    /* pages dir may not exist before the first hosted boot */
  }
  return out
}

/** Tail cap: reading more than this for a "last N lines" view is pure IO waste. */
const TAIL_READ_CAP = 512 * 1024

/**
 * Read the tail of one log without slurping the whole (up-to-5MB, rotated) file: open,
 * readSync the last min(size, TAIL_READ_CAP) bytes, split lines, optional case-insensitive
 * filter, then keep the last `tail` lines. A mid-file split of the first (partial) line is
 * fine — the byte window starts wherever a line does, and dropping the leading fragment only
 * trims, never duplicates. Returns empty lines for a missing file rather than throwing.
 */
export function readLogTail(key: string, tail = 400, filter?: string): LogReadResult {
  const file = resolveLogKey(key)
  if (!file) return { lines: [], truncated: false, readBytes: 0, totalBytes: 0 }
  let total = 0
  try {
    total = statSync(file).size
  } catch {
    return { lines: [], truncated: false, readBytes: 0, totalBytes: 0 }
  }
  const readBytes = Math.min(total, TAIL_READ_CAP)
  const buf = Buffer.allocUnsafe(readBytes)
  let fd: number | undefined
  try {
    fd = openSync(file, 'r')
    readSync(fd, buf, 0, readBytes, total - readBytes)
  } catch {
    return { lines: [], truncated: false, readBytes: 0, totalBytes: total }
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
  let lines = buf.toString('utf8').split(/\r?\n/)
  if (readBytes < total) lines = lines.slice(1) // drop the window's partial first line
  const needle = (filter ?? '').trim().toLowerCase()
  if (needle) lines = lines.filter((l) => l.toLowerCase().includes(needle))
  const keep = Math.max(1, Math.min(tail || 400, 5000))
  return {
    lines: lines.slice(-keep),
    truncated: readBytes < total || lines.length > keep,
    readBytes,
    totalBytes: total
  }
}
