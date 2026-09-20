import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

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
