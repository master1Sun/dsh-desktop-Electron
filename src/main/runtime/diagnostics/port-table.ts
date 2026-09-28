import { app } from 'electron'
import { listListeningTcp, processName, processCmdline } from './port-holder'
import {
  resolveProjectDir,
  resolvePagesDir,
  resolveCapabilitiesDir,
  resolveEnvRoot,
  resolveWorkspaceDir,
  resolveInstallDir
} from '../../shell/store'
import type { PageState, PortRow, PortTableResult } from '../../../shared/types'

/**
 * The port / process manager backing table: a full snapshot of every LISTENing TCP socket on this
 * host, enriched with its owning process and annotated against the container's OWN page registry
 * so the operator can see, at a glance, which listener is a hosted page, which is a leftover
 * (orphan) the reclaim path couldn't reap, and which is squatting on a port a stopped page reserved
 * (conflict) — the same class of "port never came up" failure the start path names, but surveyed
 * across the whole machine rather than one port at a time.
 *
 * Never throws: every OS lookup is best-effort (see port-holder), and a page whose pid doesn't match
 * its listener (a wrapper spawn) simply reads as an untagged foreign row rather than a false
 * conflict — the conflict/orphan flags are gated on the declaring page NOT being running.
 */

/** The slice of the registry this module needs; kept structural so it never imports pages.ts. */
interface PageLister {
  list(): PageState[]
}

/** Sort weight: a conflict or an orphan is actionable, so it floats to the top; then by port. */
function rowPriority(r: PortRow): number {
  if (r.conflict) return 3
  if (r.orphan) return 2
  if (r.pageId) return 1
  return 0
}

/**
 * The container's own directories, normalized to lowercase forward slashes. A holder whose command
 * line runs out of any of them (a hosted page under pages/, the built-in node under env/, a CLI in
 * capabilities/, the shared workspace, the install/repo itself) is "ours" — this is what lets the
 * panel separate a project third-party (a node/python/npm the container spawned) from a machine
 * listener it has nothing to do with (system RPC on 135, an unrelated dev server, a browser).
 */
function projectRoots(): string[] {
  const raw = [
    app.getPath('userData'),
    resolveProjectDir(),
    resolvePagesDir(),
    resolveCapabilitiesDir(),
    resolveEnvRoot(),
    resolveWorkspaceDir(),
    resolveInstallDir()
  ]
  const out = new Set<string>()
  for (const p of raw) {
    const n = (p || '').replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
    if (n.length > 2) out.add(n)
  }
  return [...out]
}

/** Whether a command line is rooted in one of the container's own directories. */
function cmdlineInProject(cmdline: string, roots: string[]): boolean {
  if (!cmdline) return false
  const c = cmdline.replace(/\\/g, '/').toLowerCase()
  return roots.some((r) => c.includes(r))
}

/** Build the annotated LISTENing table for the port/process panel. */
export async function listPortTable(registry: PageLister): Promise<PortTableResult> {
  const entries = await listListeningTcp()
  const pages = registry.list()

  // A page's currently-running child pid → its row, so a listener we own gets tagged with the page.
  const pidToRunning = new Map<number, PageState>()
  for (const p of pages) if (p.status === 'running' && p.pid) pidToRunning.set(p.pid, p)

  // The effective port each non-external page reserves (override else declared) → the page, so a
  // foreign holder of that port reads as a conflict and a stray node listener as an orphan.
  const portToDeclaring = new Map<number, PageState>()
  for (const p of pages) {
    if (p.external) continue
    const port = p.containerPort ?? p.port
    if (Number.isFinite(port) && port > 0) portToDeclaring.set(port, p)
  }

  const appPid = process.pid
  const roots = projectRoots()
  const rows: PortRow[] = []
  for (const e of entries) {
    const declaring = portToDeclaring.get(e.port)
    // A running page that declares this very port owns it, even when the listener's pid is a child
    // the recorded page pid doesn't name (a hosted page often spawns node which holds the socket).
    const declaringRunning = declaring && declaring.status === 'running'
    for (const pid of e.pids) {
      // Prefer the direct pid match; fall back to the running page declaring this port so a live
      // hosted listener is never demoted to a hidden foreign row just because its pid differs.
      const running = pidToRunning.get(pid) || (declaringRunning ? declaring : undefined)
      const isSelf = pid === appPid
      const name = await processName(pid)
      const cmdline = await processCmdline(pid)
      // An orphan: the port is reserved by a page that is NOT running, and the holder is a bare
      // node runtime — the signature of a child the reclaim/quit path left behind.
      const orphan =
        !running && !!declaring && declaring.status !== 'running' && /node(\.exe)?$/i.test(name)
      // A conflict: a stopped/absent page's reserved port is held by something that isn't that page.
      const conflict =
        !running &&
        !!declaring &&
        !declaringRunning &&
        declaring.pid !== pid
      // "Ours": any annotated relation, or a command line rooted in a container directory.
      const project =
        !!running || isSelf || orphan || conflict || cmdlineInProject(cmdline, roots)
      rows.push({
        port: e.port,
        address: e.address,
        family: e.family,
        pid,
        name,
        cmdline,
        project,
        ...(running ? { pageId: running.id, pageName: running.name } : {}),
        ...(isSelf ? { self: true } : {}),
        ...(orphan ? { orphan: true } : {}),
        ...(conflict && declaring
          ? { conflict: true, declaredPageId: declaring.id, declaredPageName: declaring.name }
          : {})
      })
    }
  }

  rows.sort(
    (a, b) => rowPriority(b) - rowPriority(a) || a.port - b.port || a.pid - b.pid
  )
  return { rows, appPid, generatedAt: Date.now() }
}
