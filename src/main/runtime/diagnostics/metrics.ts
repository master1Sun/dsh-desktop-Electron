import { spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { m } from '../../shell/i18n'
import type { PageMetrics } from '../../../shared/types'
import type { PageRegistry } from '../pages/pages'

/**
 * #20: resource sampling (CPU / RSS) for running pages, so the Pages panel can show what each
 * hosted process is actually costing — and flag one that has ballooned past its budget.
 *
 * No `systeminformation` dependency: on Windows we run ONE batched PowerShell that, for every
 * root pid, walks its descendant process tree (Win32_Process parent→child) and sums working-set
 * + total CPU seconds (Get-Process). CPU is a rate, so we diff two samples against wall-clock.
 * A POSIX `/proc` scan is the fallback for dev on non-Windows hosts.
 */

/** Prior sample per root pid, used to turn cumulative CPU seconds into a percent. */
const lastCpu = new Map<number, { cpu: number; at: number }>()

/**
 * Per-page trend history. 120 samples at the 5s poll cadence ≈ 10 minutes of curve — long
 * enough to see a leak climb, short enough that the retained rows are noise-free.
 * Keyed by pageId and dropped when a page stops, so a restart starts a fresh curve rather than
 * stitching two processes' numbers together.
 */
const HISTORY_CAP = 120
const history = new Map<string, PageMetrics[]>()

interface RawSample {
  ws: number
  cpu: number
}

/**
 * One PowerShell pass over the given root pids: each root's whole process tree is summed to
 * { workingSet bytes, cpu seconds }. Runs via -EncodedCommand (base64 UTF-16LE) for the same
 * codepage-safety reason as the zip helpers — though the pids are numeric, keeping the whole
 * invocation out of the console codepage avoids the continuation-prompt wedge.
 */
function sampleWindows(roots: number[]): Promise<Map<number, RawSample>> {
  return new Promise((resolve, reject) => {
    const list = roots.join(',')
    const script = [
      `$roots = @(${list})`,
      '$procs = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId',
      'function Get-Tree($root){',
      '  $acc = New-Object System.Collections.Generic.List[int]',
      '  $stack = New-Object System.Collections.Generic.Stack[int]',
      '  $stack.Push($root)',
      '  while($stack.Count -gt 0){',
      '    $cur = $stack.Pop(); $acc.Add($cur)',
      '    foreach($p in $procs){ if($p.ParentProcessId -eq $cur){ $stack.Push($p.ProcessId) } }',
      '  }',
      '  return $acc',
      '}',
      'foreach($root in $roots){',
      '  $ws = 0; $cpu = 0',
      '  foreach($id in (Get-Tree $root)){',
      '    $gp = Get-Process -Id $id -ErrorAction SilentlyContinue',
      '    if($gp){ $ws += $gp.WorkingSet64; try { $cpu += [double]$gp.CPU } catch {} }',
      '  }',
      '  Write-Output "$root|$ws|$cpu"',
      '}'
    ].join('\n')
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true,
      timeout: 15_000
    })
    let out = ''
    let err = ''
    child.stdout?.on('data', (d) => (out += String(d)))
    child.stderr?.on('data', (d) => (err += String(d)))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`powershell sample failed (${code}): ${err.trim() || m('dsh.exitCode', { code: String(code) })}`))
        return
      }
      const map = new Map<number, RawSample>()
      for (const line of out.split(/\r?\n/)) {
        const parts = line.trim().split('|')
        if (parts.length !== 3) continue
        const root = Number(parts[0])
        if (!Number.isFinite(root)) continue
        map.set(root, { ws: Number(parts[1]) || 0, cpu: Number(parts[2]) || 0 })
      }
      resolve(map)
    })
  })
}

/** POSIX fallback: read /proc for RSS (VmRSS) and CPU (utime+stime) across a pid's descendants. */
interface ProcInfo {
  pid: number
  ppid: number
  rssKb: number
  cpuTicks: number
}

function samplePosix(roots: number[]): Map<number, RawSample> {
  const map = new Map<number, RawSample>()
  const procs: ProcInfo[] = []
  let entries: string[] = []
  try {
    entries = readdirSync('/proc')
  } catch {
    return map
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue
    const pid = Number(entry)
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8')
      // comm may contain spaces/parens — split after the LAST ')'.
      const rparen = stat.lastIndexOf(')')
      const fields = stat.slice(rparen + 2).trim().split(/\s+/)
      const ppid = Number(fields[1])
      const utime = Number(fields[11])
      const stime = Number(fields[12])
      let rssKb = 0
      try {
        const status = readFileSync(`/proc/${pid}/status`, 'utf-8')
        const mm = status.match(/VmRSS:\s+(\d+)\s+kB/)
        if (mm) rssKb = Number(mm[1])
      } catch {
        /* gone */
      }
      procs.push({ pid, ppid, rssKb, cpuTicks: utime + stime })
    } catch {
      /* process vanished between readdir and read */
    }
  }
  for (const root of roots) {
    let ws = 0
    let cpuTicks = 0
    for (const p of descendantsOf(procs, root)) {
      ws += p.rssKb * 1024
      cpuTicks += p.cpuTicks
    }
    // 100 ticks/sec is the common USER_HZ; approximate seconds from ticks.
    map.set(root, { ws, cpu: cpuTicks / 100 })
  }
  return map
}

function descendantsOf(procs: ProcInfo[], root: number): ProcInfo[] {
  const out: ProcInfo[] = []
  const stack = [root]
  const seen = new Set<number>()
  while (stack.length) {
    const cur = stack.pop()!
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const p of procs) if (p.ppid === cur) { stack.push(p.pid); out.push(p) }
  }
  return out
}

/**
 * Sample every running page's process tree. `memWarnMb` marks rows over budget. CPU is
 * computed against the previous call (first call reports 0) so callers should sample on an
 * interval rather than once.
 */
export async function collectPageMetrics(
  registry: PageRegistry,
  memWarnMb: number
): Promise<PageMetrics[]> {
  const running = registry.running().filter((p) => p.pid)
  if (running.length === 0) {
    // Nothing alive to sample, and this is the one empty result that is authoritative: every curve
    // in the ring belongs to a process that has exited. A failed sample below returns early for
    // the opposite reason — a broken probe must not erase a page's history.
    history.clear()
    return []
  }
  const byPid = new Map<number, string>()
  for (const p of running) byPid.set(p.pid!, p.id)
  const roots = [...byPid.keys()]
  const now = Date.now()
  let samples: Map<number, RawSample>
  try {
    samples = process.platform === 'win32' ? await sampleWindows(roots) : samplePosix(roots)
  } catch {
    return []
  }
  const out: PageMetrics[] = []
  for (const [root, s] of samples) {
    const pageId = byPid.get(root)
    if (!pageId) continue
    const prev = lastCpu.get(root)
    let cpu = 0
    if (prev) {
      const wallSec = (now - prev.at) / 1000
      const cpuSec = s.cpu - prev.cpu
      if (wallSec > 0 && cpuSec >= 0) cpu = Math.round((cpuSec / wallSec) * 1000) / 10
    }
    lastCpu.set(root, { cpu: s.cpu, at: now })
    const memMb = Math.round(s.ws / 1024 / 1024)
    out.push({
      pageId,
      pid: root,
      cpu,
      memMb,
      ts: now,
      overLimit: memWarnMb > 0 && memMb > memWarnMb
    })
  }
  recordHistory(out)
  return out
}

/** Append this tick's samples to each page's trend buffer and forget pages that stopped. */
function recordHistory(out: PageMetrics[]): void {
  const live = new Set<string>()
  for (const m of out) {
    live.add(m.pageId)
    const arr = history.get(m.pageId) ?? []
    arr.push(m)
    if (arr.length > HISTORY_CAP) arr.splice(0, arr.length - HISTORY_CAP)
    history.set(m.pageId, arr)
  }
  // `out` only ever holds running pages, so a missing key means the process is gone.
  for (const id of [...history.keys()]) if (!live.has(id)) history.delete(id)
}

/**
 * Retained trend samples, one entry per currently-running page. Read by the Pages panel to
 * draw the sparkline / detail chart without keeping its own rolling buffer per window.
 */
export function getMetricsHistory(): Record<string, PageMetrics[]> {
  return Object.fromEntries([...history.entries()].map(([id, rows]) => [id, rows.slice()]))
}

/** Drop retained CPU baselines for pids that are gone so the map can't grow unbounded. */
export function pruneMetricsBaseline(livePids: number[]): void {
  const keep = new Set(livePids)
  for (const pid of [...lastCpu.keys()]) if (!keep.has(pid)) lastCpu.delete(pid)
}

/** Test hook: clear the retained trend buffers between cases. */
export function resetMetricsHistory(): void {
  history.clear()
  lastCpu.clear()
}
