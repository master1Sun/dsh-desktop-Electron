import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import * as os from 'node:os'
import { app } from 'electron'
import { resolveInstallDir } from '../../shell/store'
import type { NetworkStats, NetInterfaceInfo, SystemInfo } from '../../../shared/types'

/**
 * System + network snapshots for the Help panel's vertical tabs. Everything here is
 * best-effort: a value the platform can't provide is simply left off, and the byte-counter
 * probe (which shells out on Windows) degrades to `counters: null` on any failure so the
 * panel still lists interfaces. Nothing in this module throws to its caller.
 */

/** Flatten os.networkInterfaces() into one row per interface name (first IPv4 wins). */
function listInterfaces(): NetInterfaceInfo[] {
  const out: NetInterfaceInfo[] = []
  let ifaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {}
  try {
    ifaces = os.networkInterfaces()
  } catch {
    return out
  }
  for (const [name, addrs] of Object.entries(ifaces)) {
    const list = addrs ?? []
    const v4 = list.find((a) => String(a.family) === 'IPv4' || String(a.family) === '4')
    const info: NetInterfaceInfo = {
      name,
      family: v4 ? 'IPv4' : String(list[0]?.family ?? '') || '',
      internal: Boolean(v4?.internal ?? list[0]?.internal),
      address: v4?.address ?? undefined,
      netmask: v4?.netmask ?? undefined,
      mac: v4?.mac ?? undefined,
      cidr: v4?.cidr ?? undefined
    }
    out.push(info)
  }
  return out
}

/**
 * Cumulative rx/tx bytes across the physical adapters. Windows shells out to
 * `Get-NetAdapterStatistics` via -EncodedCommand (base64 UTF-16LE) for the same
 * codepage-safety reason as the other PowerShell helpers in this app — a plain -Command
 * with the cmdlets is fine, but keeping the whole invocation out of the console codepage
 * avoids the continuation-prompt wedge on non-ASCII systems. POSIX reads /proc/net/dev.
 */
function readCountersWindows(): Promise<{ rxBytes: number; txBytes: number } | null> {
  return new Promise((resolve) => {
    const script =
      "Get-NetAdapterStatistics | Where-Object { $_.Name -notmatch 'Loopback' } | " +
      'Measure-Object -Property ReceivedBytes,SentBytes -Sum | ' +
      "ForEach-Object { $_.Property + '|' + $_.Sum }"
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 8_000 }
    )
    let out = ''
    let settled = false
    const finish = (v: { rxBytes: number; txBytes: number } | null): void => {
      if (settled) return
      settled = true
      resolve(v)
    }
    child.stdout?.on('data', (d) => (out += String(d)))
    child.on('error', () => finish(null))
    child.on('close', () => {
      let rx = 0
      let tx = 0
      for (const line of out.split(/\r?\n/)) {
        const [prop, sum] = line.trim().split('|')
        const n = Number(sum)
        if (!Number.isFinite(n)) continue
        if (prop === 'ReceivedBytes') rx += n
        else if (prop === 'SentBytes') tx += n
      }
      finish(rx || tx ? { rxBytes: rx, txBytes: tx } : null)
    })
  })
}

function readCountersPosix(): { rxBytes: number; txBytes: number } | null {
  try {
    const text = readFileSync('/proc/net/dev', 'utf-8')
    let rx = 0
    let tx = 0
    for (const line of text.split('\n')) {
      const idx = line.indexOf(':')
      if (idx < 0) continue
      const name = line.slice(0, idx).trim()
      if (name === 'lo') continue
      const cols = line
        .slice(idx + 1)
        .trim()
        .split(/\s+/)
        .map(Number)
      // receive: bytes=col0  ...  transmit: bytes=col8
      if (Number.isFinite(cols[0])) rx += cols[0]
      if (Number.isFinite(cols[8])) tx += cols[8]
    }
    return rx || tx ? { rxBytes: rx, txBytes: tx } : null
  } catch {
    return null
  }
}

/** Snapshot the live network state: interfaces always, byte counters when the OS path works. */
export async function getNetworkStats(): Promise<NetworkStats> {
  const interfaces = listInterfaces()
  const counters = process.platform === 'win32' ? await readCountersWindows() : readCountersPosix()
  return { interfaces, counters, sampleAt: Date.now() }
}

/** Static-ish system + runtime overview; recomputed cheaply on every call. */
export function getSystemInfo(): SystemInfo {
  const cpus = os.cpus()
  let locale = ''
  let timezone = ''
  try {
    const dtf = Intl.DateTimeFormat().resolvedOptions()
    locale = dtf.locale || ''
    timezone = dtf.timeZone || ''
  } catch {
    /* Intl unavailable on a stripped runtime — the rows are simply dropped */
  }
  const interfaces = listInterfaces()
  return {
    osType: os.type(),
    osRelease: os.release(),
    platform: process.platform,
    arch: os.arch(),
    hostname: os.hostname(),
    cpuModel: cpus[0]?.model?.trim(),
    cpuCores: cpus.length,
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    osUptimeSec: os.uptime(),
    appUptimeSec: process.uptime(),
    locale,
    timezone,
    home: os.homedir(),
    appVersion: app.getVersion(),
    packaged: app.isPackaged,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    userData: app.getPath('userData'),
    interfaceCount: interfaces.filter((i) => !i.internal).length,
    installDir: resolveInstallDir()
  }
}
