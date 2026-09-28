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

/** One LISTENING TCP socket keyed by port + address family, with every pid bound to it. */
export interface ListeningEntry {
  port: number
  /** the raw local address column, e.g. '0.0.0.0:3000', '[::]:3000', '127.0.0.1:3000' */
  address: string
  family: 4 | 6
  pids: number[]
}

/** Short-lived CLI whose output we parse; resolves '' on any failure (never throws). */
function capture(cmd: string, args: string[], timeoutMs = 8000): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, timeout: timeoutMs })
    let out = ''
    // Decode as UTF-8 through a StringDecoder: raw `String(chunk)` per data event mangles any
    // multi-byte char that spans a chunk boundary (a CJK path would show up as replacement glyphs).
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (d) => (out += d))
    child.on('error', () => resolve(''))
    child.on('close', () => resolve(out))
  })
}

/** A process command line, resolved best-effort (empty when the platform query fails). */
export async function processCmdline(pid: number): Promise<string> {
  if (process.platform === 'win32') {
    // CIM carries the full command line where `wmic` is deprecated/absent on recent Windows.
    // Force UTF-8 on the console: a zh-CN box emits GBK by default, which the UTF-8 decode above
    // turns into mojibake for any CJK path segment in the command line.
    const q = `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=${pid}" | Select-Object -ExpandProperty CommandLine`
    const out = await capture('powershell', ['-NoProfile', '-Command', q], 6000)
    return out.trim()
  }
  const out = await capture('ps', ['-p', String(pid), '-o', 'args='])
  return out.trim()
}

/** Windows: `netstat -ano` LISTENING rows for :port → up to two pids (v4 + v6). */
async function windowsHolders(port: number): Promise<number[]> {
  const rows = await windowsListenRows(port)
  return rows.flatMap((r) => r.pids)
}

/** Parse a full `netstat -ano -p tcp` dump into LISTENING rows; `onlyPort` filters to one port. */
export function parseNetstatListen(out: string, onlyPort?: number): ListeningEntry[] {
  const byPort = new Map<number, ListeningEntry>()
  for (const line of out.split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue
    const cols = line.trim().split(/\s+/)
    if (cols.length < 5) continue
    const pid = Number(cols[cols.length - 1])
    if (!Number.isFinite(pid) || pid <= 0) continue
    // proto, local addr, remote addr (always 0.0.0.0:0 for LISTEN), state, pid
    const local = cols[1]
    const port = portFromAddress(local)
    if (port === null) continue
    if (onlyPort !== undefined && port !== onlyPort) continue
    pushEntry(byPort, port, local, pid)
  }
  return [...byPort.values()]
}

/** Windows: LISTENING rows, optionally narrowed to one port (the historical single-port query). */
async function windowsListenRows(port?: number): Promise<ListeningEntry[]> {
  const out = await capture('netstat', ['-ano', '-p', 'tcp'])
  return parseNetstatListen(out, port)
}

async function posixHolders(port: number): Promise<number[]> {
  const out = await capture('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'])
  return out
    .split(/\r?\n/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

/**
 * Parse `lsof -nP -iTCP -sTCP:LISTEN` output (NAME column like `TCP *:3000 (LISTEN)` or
 * `TCP 127.0.0.1:3000 (LISTEN)`) into LISTENING entries; `onlyPort` narrows to one port.
 *
 * The address lives in the NAME column right after the `TCP` token, and ` (LISTEN)` is its own
 * whitespace-separated token — so reading the last column would grab "(LISTEN)". Anchor on the
 * `TCP <address> (LISTEN)` shape instead, and take the pid from the fixed second column.
 */
export function parseLsofList(out: string, onlyPort?: number): ListeningEntry[] {
  const byPort = new Map<number, ListeningEntry>()
  const lines = out.split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!/\(LISTEN\)/i.test(line)) continue
    // COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
    const pid = Number(line.trim().split(/\s+/)[1])
    if (!Number.isFinite(pid) || pid <= 0) continue
    const m = /\bTCP\s+(\S+)\s+\(LISTEN\)/i.exec(line)
    if (!m) continue
    const nameCol = m[1]
    const port = portFromAddress(nameCol)
    if (port === null) continue
    if (onlyPort !== undefined && port !== onlyPort) continue
    pushEntry(byPort, port, nameCol, pid)
  }
  return [...byPort.values()]
}

/** Pull the trailing `:port` off an address token; null when it doesn't carry one. */
function portFromAddress(local: string): number | null {
  const m = /:(\d+)$/.exec(local)
  if (!m) return null
  const port = Number(m[1])
  return Number.isFinite(port) && port > 0 && port <= 65535 ? port : null
}

/** Merge a pid into the per-port index, deriving family from the address shape. */
function pushEntry(byPort: Map<number, ListeningEntry>, port: number, address: string, pid: number): void {
  // IPv6 sockets are bracketed (`[::]:3000`) and always carry ≥2 colons; an IPv4 local addr
  // (`0.0.0.0:3000`, `127.0.0.1:3000`) has exactly one. A wildcard `*:3000` is treated as v4.
  const family: 4 | 6 = address.includes('[') || (address.match(/:/g) || []).length >= 2 ? 6 : 4
  let e = byPort.get(port)
  if (!e) {
    e = { port, address, family, pids: [] }
    byPort.set(port, e)
  }
  if (!e.pids.includes(pid)) e.pids.push(pid)
}

/** Every TCP socket in LISTEN on this host, grouped per port (v4 + v6 merged). */
export async function listListeningTcp(): Promise<ListeningEntry[]> {
  if (process.platform === 'win32') {
    const out = await capture('netstat', ['-ano', '-p', 'tcp'])
    return parseNetstatListen(out)
  }
  const out = await capture('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'])
  return parseLsofList(out)
}

export async function processName(pid: number): Promise<string> {
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

/**
 * Tree-kill one pid by the OS's own mechanism: `taskkill /T /F` on Windows (kills the whole
 * child tree, since a hosted page spawns node → its own children), SIGTERM elsewhere. Fire-and-
 * forget on the spawn (best-effort); returns whether the command could be launched.
 */
export async function killPidTree(pid: number): Promise<boolean> {
  if (process.platform === 'win32') {
    // taskkill prints a success line or "not found"; capture never throws, so the call always lands.
    await capture('taskkill', ['/pid', String(pid), '/T', '/F'], 6000)
    return true
  }
  try {
    process.kill(pid, 'SIGTERM')
    return true
  } catch {
    return false // already gone / no permission
  }
}

/** Tree-kill the current holder(s) of `port`; resolves the first holder seen (null = none). */
export async function killPortHolder(port: number): Promise<PortHolder | null> {
  const pids =
    process.platform === 'win32' ? await windowsHolders(port) : await posixHolders(port)
  if (!pids.length) return null
  const first = { pid: pids[0], name: await processName(pids[0]) }
  for (const pid of pids) await killPidTree(pid)
  // Give the OS a beat to release the listen socket so an immediate retry binds.
  await new Promise((r) => setTimeout(r, 700))
  return first
}
