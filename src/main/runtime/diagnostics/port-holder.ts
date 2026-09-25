import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

/**
 * Who is LISTENING on a TCP port — the answer to "port never came up" when the
 * holder is not a process this registry tracks (an unrelated dev server, an old
 * install). Used to turn a bare timeout into an actionable message plus a
 * one-click kill-and-retry, mirroring the dsh/openclaw orphan-reclaim flows in
 * pages.ts but for arbitrary foreign holders.
 */

export interface PortHolder {
  pid: number
  name: string
}

/** Short-lived CLI whose output we parse; resolves '' on any failure (never throws). */
function capture(cmd: string, args: string[], timeoutMs = 8000): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, timeout: timeoutMs })
    let out = ''
    child.stdout?.on('data', (d) => (out += String(d)))
    child.on('error', () => resolve(''))
    child.on('close', () => resolve(out))
  })
}

/** Windows: `netstat -ano` LISTENING rows for :port → up to two pids (v4 + v6). */
async function windowsHolders(port: number): Promise<number[]> {
  const out = await capture('netstat', ['-ano', '-p', 'tcp'])
  const pids = new Set<number>()
  const needle = `:${port}`
  for (const line of out.split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue
    const cols = line.trim().split(/\s+/)
    if (cols.length < 5) continue
    if (cols[1] !== needle && !cols[1].endsWith(needle)) continue
    const pid = Number(cols[cols.length - 1])
    if (Number.isFinite(pid) && pid > 0) pids.add(pid)
  }
  return [...pids]
}

async function posixHolders(port: number): Promise<number[]> {
  const out = await capture('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'])
  return out
    .split(/\r?\n/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

async function processName(pid: number): Promise<string> {
  if (process.platform === 'win32') {
    // CSV row: "image.exe","1234","Console",… — quote-anchored so a path with commas is safe.
    const out = await capture('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV'])
    return out.match(/^"([^"]+)"/)?.[1] || `PID ${pid}`
  }
  const out = await capture('ps', ['-p', String(pid), '-o', 'comm='])
  return out.trim() || `PID ${pid}`
}

/** First LISTENING holder on `port`, or null when nothing holds it (or probing failed). */
export async function findPortHolder(port: number): Promise<PortHolder | null> {
  try {
    const pids = process.platform === 'win32' ? await windowsHolders(port) : await posixHolders(port)
    if (!pids.length) return null
    return { pid: pids[0], name: await processName(pids[0]) }
  } catch (err) {
    console.warn('[port] holder probe failed (ignored):', (err as Error).message)
    return null
  }
}

/**
 * Ask the OS directly whether something can bind 127.0.0.1:port right now — the only check that
 * distinguishes "free" from "my netstat/lsof parse failed", which {@link findPortHolder}'s single
 * null conflates. `exclusive: true` matters: without it a wildcard listener from another user
 * session can make a genuinely taken port look bindable.
 *
 * 'error' means inconclusive (the listen callback never landed within the grace period), and
 * callers must treat it as "unknown", never as a conflict.
 */
export function probePortBind(port: number): Promise<'free' | 'busy' | 'error'> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (v: 'free' | 'busy' | 'error'): void => {
      if (settled) return
      settled = true
      resolve(v)
    }
    const srv = createServer()
    srv.unref()
    const timer = setTimeout(() => {
      srv.close()
      settle('error')
    }, 2500)
    timer.unref?.()
    srv.once('error', () => {
      clearTimeout(timer)
      settle('busy')
    })
    srv.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
      srv.close(() => {
        clearTimeout(timer)
        settle('free')
      })
    })
  })
}

/** Tree-kill the current holder(s) of `port`; resolves the first holder seen (null = none). */
export async function killPortHolder(port: number): Promise<PortHolder | null> {
  const pids =
    process.platform === 'win32' ? await windowsHolders(port) : await posixHolders(port)
  if (!pids.length) return null
  const first = { pid: pids[0], name: await processName(pids[0]) }
  for (const pid of pids) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
    } else {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        /* already gone */
      }
    }
  }
  // Give the OS a beat to release the listen socket so an immediate retry binds.
  await new Promise((r) => setTimeout(r, 700))
  return first
}
