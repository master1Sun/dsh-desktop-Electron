import { createServer, createConnection } from 'node:net'
import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { m } from '../shell/i18n'
import { REGISTRY_CANDIDATES, type NetProbeResult, type NetProbeStep, type RegistryProbe } from '../../shared/types'

/**
 * #21: one-shot network diagnostic wizard. npm/git/page-installs all hinge on the network, and
 * when one fails the user can't tell whether the repo host is down, a proxy is misconfigured, or
 * only the mirror is unreachable. This fires a handful of lightweight probes in order and reports
 * each hop so the panel can point at exactly which step broke.
 *
 * Every probe is best-effort with a hard timeout; a step never rejects — it just comes back
 * `ok:false` with the error in `detail`.
 */

interface HttpProbe {
  ok: boolean
  ms?: number
  status?: number
  error?: string
}

/** GET a URL, resolving on the first response head (never downloads the body). */
function probeUrl(url: string, timeoutMs = 8000): Promise<HttpProbe> {
  return new Promise((resolve) => {
    const start = Date.now()
    const getter = url.startsWith('https:') ? httpsGet : httpGet
    let settled = false
    const req = getter(url, (res) => {
      if (settled) return
      settled = true
      const ms = Date.now() - start
      const status = res.statusCode ?? 0
      res.destroy()
      // Any HTTP answer means the host is reachable end-to-end; only transport failure is "down".
      resolve({ ok: status > 0, ms, status })
    })
    req.on('error', (err) => {
      if (settled) return
      settled = true
      resolve({ ok: false, error: (err as Error).message })
    })
    req.setTimeout(timeoutMs, () => {
      if (settled) return
      settled = true
      req.destroy()
      resolve({ ok: false, error: `timeout ${timeoutMs}ms` })
    })
  })
}

/** Prove the loopback stack works by binding an ephemeral 127.0.0.1 listener and dialing it. */
function probeLoopback(): Promise<HttpProbe> {
  return new Promise((resolve) => {
    const start = Date.now()
    const server = createServer((sock) => {
      sock.end('ok')
    })
    server.on('error', (err) => resolve({ ok: false, error: (err as Error).message }))
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        server.close()
        resolve({ ok: false, error: 'no address' })
        return
      }
      const client = createConnection({ host: '127.0.0.1', port: addr.port })
      client.on('connect', () => {
        const ms = Date.now() - start
        client.destroy()
        server.close()
        resolve({ ok: true, ms })
      })
      client.on('error', (err) => {
        client.destroy()
        server.close()
        resolve({ ok: false, error: (err as Error).message })
      })
    })
  })
}

function reachStep(id: string, p: HttpProbe): NetProbeStep {
  if (p.ok) return { id, ok: true, ms: p.ms, detail: m('net.reachable', { ms: p.ms ?? 0 }) }
  return { id, ok: false, detail: m('net.unreachable', { err: p.error || `HTTP ${p.status ?? '?'}` }) }
}

/**
 * Run the whole probe suite. `npmRegistry` optionally overrides the official registry URL so the
 * caller can point the check at whatever mirror the project actually uses.
 */
export async function runNetworkProbe(npmRegistry?: string): Promise<NetProbeResult> {
  const proxy = {
    http: process.env.HTTP_PROXY || process.env.http_proxy || '',
    https: process.env.HTTPS_PROXY || process.env.https_proxy || '',
    no: process.env.NO_PROXY || process.env.no_proxy || ''
  }
  const proxyStep: NetProbeStep = {
    id: 'proxy',
    ok: true, // informational — presence isn't a failure
    detail: proxy.http || proxy.https ? proxy.http || proxy.https : m('net.proxyNone')
  }

  const [gateway, github, npm, mirror] = await Promise.all([
    probeLoopback(),
    probeUrl('https://github.com'),
    probeUrl(npmRegistry || 'https://registry.npmjs.org/-/ping'),
    probeUrl('https://registry.npmmirror.com/-/ping')
  ])

  const steps: NetProbeStep[] = [
    reachStep('gateway', gateway),
    reachStep('github', github),
    reachStep('npm', npm),
    reachStep('npmmirror', mirror),
    proxyStep
  ]
  // Healthy when the real connectivity hops pass; the proxy row is informational, and a single
  // dead mirror doesn't condemn the whole network (the official registry may still be fine).
  const healthy = gateway.ok && github.ok && (npm.ok || mirror.ok)
  return { steps, proxy, healthy }
}

/**
 * #26: probe every candidate npm mirror at once, for the 网络镜像 panel's 一键选优.
 *
 * `/-/ping` is the one endpoint both npmjs.org and every mirror clone implement, and it answers
 * in a few hundred bytes — no package metadata downloaded. Candidates run in parallel (the whole
 * point is comparing latency, so a serial walk would bias every result after the first).
 */
export async function probeRegistries(timeoutMs = 6000): Promise<RegistryProbe[]> {
  const results = await Promise.all(
    REGISTRY_CANDIDATES.map(async (c): Promise<RegistryProbe> => {
      const p = await probeUrl(`${c.url.replace(/\/+$/, '')}/-/ping`, timeoutMs)
      return { id: c.id, url: c.url, ok: p.ok, ms: p.ms, status: p.status, error: p.error }
    })
  )
  return results
}
