import { BrowserWindow } from 'electron'
import { createSocket } from 'node:dgram'
import { IPC, type NetSample, type OnlinePort, type NetInterfaceInfo } from '../../shared/types'
import { getNetworkStats } from './sysinfo'
import { probeUrl } from './net-probe'
import type { PageRegistry } from './pages'

/**
 * Top-bar live-network indicator feed: one main-process loop samples the same
 * cumulative byte counters the 网络与工具 tab shows, derives rx/tx rates from the
 * delta between consecutive ticks, and broadcasts a compact {@link NetSample} to
 * every window. Centralizing the loop here (rather than a per-window IPC poll)
 * keeps the Windows PowerShell counter probe single-flight no matter how many
 * shell/popout windows are open — and the help panel's own 2s poll stays valid
 * because `getNetworkStats` is stateless.
 *
 * Internet latency is probed at a slow cadence (every ~40 ticks ≈ 80s) against
 * npmmirror's `/-/ping` — a few-hundred-byte endpoint reachable from the app's
 * usual networks; the last good reading is cached and re-sent on every tick so
 * the tooltip always has a value (or shows 探测中 while the very first probe runs).
 */

const NET_BAR_POLL_MS = 2_000
/** Latency re-probe every N ticks (2s * 40 ≈ 80s) — a ping probe is not a 2s-grade measurement. */
const LATENCY_EVERY_TICKS = 40
const LATENCY_PROBE_TIMEOUT_MS = 5_000
const LATENCY_PROBE_URL = 'https://registry.npmmirror.com/-/ping'
/**
 * Default-route probe target. A UDP `connect` sends nothing — it only makes the OS pick the
 * egress interface/route, so `socket.address().address` reveals the IPv4 of the adapter the
 * machine would actually use to reach the internet (WiFi / NAT'd ethernet), not a virtual one.
 */
const EGRESS_PROBE_HOST = '223.5.5.5'
const EGRESS_PROBE_PORT = 53
/** The active adapter changes rarely; re-probe every N ticks (2s * 5 = 10s). */
const EGRESS_EVERY_TICKS = 5

let netBarTimer: NodeJS.Timeout | null = null
let lastCounters: { rxBytes: number; txBytes: number; at: number } | null = null
let lastRates = { rx: 0, tx: 0 }
let lastLatencyMs: number | null = null
let latencyInFlight = false
let tick = 0
/** Cached egress IPv4 of the adapter actually online, refreshed on a slow cadence. */
let activeEgressIp: string | null = null

/** Start (or restart, on dev-HMR re-registration) the top-bar network sample loop. */
export function startNetBarLoop(registry: PageRegistry): void {
  if (netBarTimer) clearInterval(netBarTimer)
  tick = 0
  activeEgressIp = null
  netBarTimer = setInterval(() => void sampleNetBar(registry), NET_BAR_POLL_MS)
  netBarTimer.unref?.()
  void sampleNetBar(registry)
}

/** Running pages that listen on a port — the tooltip's 在线网络端口 rows. */
function collectOnlinePorts(registry: PageRegistry): OnlinePort[] {
  return registry
    .running()
    .map((p) => ({ id: p.id, name: p.name, port: Number(p.containerPort || p.port) || 0 }))
    .filter((p) => p.port > 0)
    .sort((a, b) => a.port - b.port)
}

/** Coarse adapter kind from a (localized) interface name — WiFi wins, then ethernet, else other. */
function classifyInterface(name: string): 'wifi' | 'ethernet' | 'other' {
  // CJK tokens (无线 / 以太网) are case-invariant, so one lowercased haystack matches all.
  const n = name.toLowerCase()
  if (/wi-?fi|wlan|wireless|无线/.test(n)) return 'wifi'
  if (/ethernet|以太网|\beth\b|gigabit|gbe/.test(n)) return 'ethernet'
  return 'other'
}

/**
 * The IPv4 of the adapter the OS would route default-egress traffic through, or null when
 * offline. A UDP `connect` picks the route without sending a packet, then `address()` reads the
 * chosen source IP — this is what distinguishes the real WiFi/NAT link from virtual adapters.
 */
function detectEgressIPv4(): string | null {
  try {
    const socket = createSocket('udp4')
    socket.connect(EGRESS_PROBE_PORT, EGRESS_PROBE_HOST)
    const local = socket.address().address
    socket.close()
    return local || null
  } catch {
    return null
  }
}

/**
 * The interface to feature in the tooltip: the one whose IPv4 is the active egress address, so
 * the WiFi/NAT adapter currently online is shown. When offline or the probe misses (e.g. a
 * VPN holds the default route but its address isn't listed), fall back to the preferred-kind
 * non-internal adapter rather than an arbitrary first hit.
 */
function pickLocalInterface(
  interfaces: NetInterfaceInfo[],
  egressIp: string | null
): NetSample['localInterface'] {
  const usable = interfaces.filter((i) => !i.internal && i.address)
  if (!usable.length) return null
  const rank = (i: NetInterfaceInfo): number =>
    classifyInterface(i.name) === 'wifi' ? 0 : classifyInterface(i.name) === 'ethernet' ? 1 : 2
  const match = egressIp ? usable.find((i) => i.address === egressIp) : undefined
  const chosen = match ?? [...usable].sort((a, b) => rank(a) - rank(b))[0]
  return {
    name: chosen.name,
    address: chosen.address,
    kind: classifyInterface(chosen.name)
  }
}

async function sampleNetBar(registry: PageRegistry): Promise<void> {
  try {
    tick++
    if (tick % LATENCY_EVERY_TICKS === 1 && !latencyInFlight) {
      latencyInFlight = true
      probeUrl(LATENCY_PROBE_URL, LATENCY_PROBE_TIMEOUT_MS)
        .then((p) => {
          if (p.ok && p.ms != null) lastLatencyMs = p.ms
        })
        .catch(() => undefined)
        .finally(() => {
          latencyInFlight = false
        })
    }
    const stats = await getNetworkStats()
    let rxRate = 0
    let txRate = 0
    if (stats.counters) {
      const prev = lastCounters
      const dt = prev ? (stats.sampleAt - prev.at) / 1000 : 0
      if (prev && dt > 0) {
        // Counters are since-boot and can only rewind on an adapter reset — clamp negatives.
        rxRate = Math.max(0, (stats.counters.rxBytes - prev.rxBytes) / dt)
        txRate = Math.max(0, (stats.counters.txBytes - prev.txBytes) / dt)
      }
      lastCounters = { ...stats.counters, at: stats.sampleAt }
      lastRates = { rx: rxRate, tx: txRate }
    } else {
      // Counter probe failed this tick: keep the last reading on display rather than a false 0.
      rxRate = lastRates.rx
      txRate = lastRates.tx
    }
    // Refresh the active-egress adapter on a slow cadence (a UDP route probe, no packets sent).
    if (tick % EGRESS_EVERY_TICKS === 1) activeEgressIp = detectEgressIPv4()
    const local = pickLocalInterface(stats.interfaces, activeEgressIp)
    const sample: NetSample = {
      rxRateBps: rxRate,
      txRateBps: txRate,
      counters: stats.counters,
      localInterface: local,
      latencyMs: lastLatencyMs,
      onlinePorts: collectOnlinePorts(registry),
      sampleAt: stats.sampleAt
    }
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.OnNetSample, sample)
    }
  } catch {
    /* a failed tick is skipped — the next one retries */
  }
}
