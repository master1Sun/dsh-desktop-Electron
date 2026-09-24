import { app } from 'electron'
import { promises as fs, type Dirent } from 'node:fs'
import { join } from 'node:path'
import type { DiskReport, DiskScope } from '../../shared/types'
import {
  resolveCapabilitiesDir,
  resolveDownloadDir,
  resolveEnvRoot,
  resolvePagesDir,
  resolveWorkspaceDir
} from '../shell/store'
import { logsDir } from '../shell/logger'
import { CACHE_DIRS, STORAGE_DIRS, clearWebData } from '../shell/webdata'
import { bridgeDir } from './mcp-bridge'

/**
 * #8: the container's own disk-usage dashboard, surfaced in Settings ▸ 存储.
 *
 * Where webdata.ts (#26) only measures the webviews' shared cache/storage, this walks the whole
 * footprint the container is responsible for — imported pages, the provisioned runtimes under the
 * env root, the MCP packages + bridge exports, logs, and the shared workspace — so a user who is
 * running out of room can see *which* bucket is heavy before deciding to clean it up.
 *
 * Two conventions carry over from webdata: a missing/locked path counts as 0 and the walk never
 * throws (a half-deleted dir must not fail the whole report), and sizes come from the on-disk
 * bytes rather than any quota API. Unlike webdata this scan is bounded — a dashboard that hangs
 * the settings panel is worse than one that slightly under-reports — so depth, file count and a
 * wall-clock deadline are all capped and the result flags itself as `truncated` when a cap hit.
 */

/** Hard caps on one scan; crossing any of them stops descending and marks the report truncated. */
const MAX_DEPTH = 8
const MAX_FILES = 250_000
const SOFT_TIMEOUT_MS = 4_000

/** Mutable budget threaded through one report's walks so the caps are global, not per-dir. */
interface ScanBudget {
  files: number
  deadline: number
  truncated: boolean
}

/**
 * Depth/count/time-bounded recursive byte size. Mirrors webdata's `dirBytes` tolerance (missing
 * or unreadable dirs and raced deletions count as 0, never throw) but stops early once a cap is
 * hit — the caller then shows a "partial" hint rather than a wrong total.
 */
async function scanDir(path: string, depth: number, budget: ScanBudget): Promise<number> {
  if (depth > MAX_DEPTH || budget.files >= MAX_FILES || Date.now() > budget.deadline) {
    budget.truncated = true
    return 0
  }
  let entries: Dirent[]
  try {
    entries = await fs.readdir(path, { withFileTypes: true })
  } catch {
    return 0
  }
  let total = 0
  for (const ent of entries) {
    if (budget.files >= MAX_FILES || Date.now() > budget.deadline) {
      budget.truncated = true
      break
    }
    const child = join(path, ent.name)
    // Never follow symlinks: a linked dir outside the scope (or a cycle) would blow up the walk.
    if (ent.isSymbolicLink()) continue
    if (ent.isDirectory()) {
      total += await scanDir(child, depth + 1, budget)
      continue
    }
    if (!ent.isFile()) continue
    budget.files += 1
    try {
      const st = await fs.stat(child)
      total += st.size
    } catch {
      /* raced with a deletion — skip it */
    }
  }
  return total
}

/** List the immediate sub-directories of `path` (sorted); [] when unreadable. */
async function subDirs(path: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory() && !e.isSymbolicLink())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

/** One scope for a directory that is simply named by its path's last segment (an env/pages child). */
async function dirScope(
  dir: string,
  id: string,
  labelKey: string,
  label: string | undefined,
  budget: ScanBudget,
  withChildren = false
): Promise<DiskScope> {
  const bytes = await scanDir(dir, 0, budget)
  const scope: DiskScope = { id, labelKey, label, bytes }
  if (withChildren) {
    const kids = await subDirs(dir)
    const children: DiskScope[] = []
    for (const name of kids) {
      const kidBytes = await scanDir(join(dir, name), 1, budget)
      children.push({ id: `${id}/${name}`, labelKey: 'diskMgr.entry', label: name, bytes: kidBytes })
    }
    if (children.length) scope.children = children
  }
  return scope
}

/** Free/total bytes of the volume hosting `path`, via statfs; nulls when the platform can't say. */
async function volumeBytes(path: string): Promise<{ free: number | null; total: number | null }> {
  try {
    const s = await fs.statfs(path)
    const total = s.bsize * s.blocks
    const free = s.bsize * s.bavail
    return { total: total > 0 ? total : null, free: Number.isFinite(free) ? free : null }
  } catch {
    return { free: null, total: null }
  }
}

/**
 * The webviews' own cache + storage dirs (the one clearly-labelled chunk of userData a user can
 * safely reclaim). Kept in sync with webdata by summing the same dir lists.
 */
async function webCacheBytes(budget: ScanBudget): Promise<number> {
  const root = app.getPath('userData')
  let total = 0
  for (const name of [...CACHE_DIRS, ...STORAGE_DIRS]) {
    total += await scanDir(join(root, name), 0, budget)
  }
  return total
}

/** Build the full disk-usage report: per-scope breakdown + the hosting volume's totals. */
export async function getDiskReport(): Promise<DiskReport> {
  const budget: ScanBudget = { files: 0, deadline: Date.now() + SOFT_TIMEOUT_MS, truncated: false }
  const userData = app.getPath('userData')

  const scopes: DiskScope[] = []

  // webcache first (clearable), then the container-managed buckets, each expanded one level.
  scopes.push({
    id: 'webcache',
    labelKey: 'diskMgr.webcache',
    bytes: await webCacheBytes(budget)
  })

  // pages/: a hosted dir per installed page (packaged under userData; dev under the repo).
  scopes.push(
    await dirScope(resolvePagesDir(), 'pages', 'diskMgr.pages', undefined, budget, true)
  )

  // env/: provisioned runtimes (node / dsh / openclaw / per-tool homes).
  scopes.push(await dirScope(resolveEnvRoot(), 'env', 'diskMgr.env', undefined, budget, true))

  // capabilities/: imported npm CLI packages (codex & friends) live outside pages/.
  scopes.push(
    await dirScope(
      resolveCapabilitiesDir(),
      'capabilities',
      'diskMgr.capabilities',
      undefined,
      budget
    )
  )

  // mcp/: hub-provisioned MCP packages, and mcp-bridge/: the exported agent configs.
  scopes.push(
    await dirScope(join(userData, 'mcp'), 'mcp', 'diskMgr.mcp', undefined, budget)
  )
  scopes.push(
    await dirScope(bridgeDir(), 'mcp-bridge', 'diskMgr.mcpBridge', undefined, budget)
  )

  // logs/: main + rotated page logs + the events timeline (clearable).
  scopes.push(await dirScope(logsDir(), 'logs', 'diskMgr.logs', undefined, budget))

  // workspace/: the shared context every hosted agent reads/writes.
  scopes.push(
    await dirScope(resolveWorkspaceDir(), 'workspace', 'diskMgr.workspace', undefined, budget)
  )

  // downloads/: the webview download folder (usually the OS Downloads dir, outside userData).
  scopes.push(
    await dirScope(resolveDownloadDir(), 'downloads', 'diskMgr.downloads', undefined, budget)
  )

  const usedBytes = scopes.reduce((a, s) => a + s.bytes, 0)
  const { free, total } = await volumeBytes(userData)

  const report: DiskReport = {
    usedBytes,
    freeBytes: free,
    totalBytes: total,
    scopes,
    generatedAt: Date.now()
  }
  // Surface truncation through a synthetic marker id the renderer can check for; kept off the
  // typed shape, so piggyback on a zero-byte scope only when the caps were actually hit.
  if (budget.truncated) {
    report.scopes.push({
      id: '__truncated__',
      labelKey: 'diskMgr.truncated',
      bytes: 0
    })
  }
  return report
}

/** Delete rotated `*.log.N` siblings and truncate the active logs in place (best-effort). */
async function clearLogs(): Promise<void> {
  const root = logsDir()
  const pagesDir = join(root, 'pages')
  const wipe = async (dir: string): Promise<void> => {
    let entries: Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (!ent.isFile()) continue
      const file = join(dir, ent.name)
      // A rotated sibling (main.log.1, pages/x.log.3) can go entirely…
      if (/\.(log|jsonl)\.\d+$/.test(ent.name)) {
        try {
          await fs.unlink(file)
        } catch {
          /* raced — ignore */
        }
        continue
      }
      // …but the active file is only truncated: the writer (and the live-stream watcher's
      // offset reset) expects the handle/path to survive.
      if (/\.(log|jsonl)$/.test(ent.name)) {
        try {
          await fs.writeFile(file, '')
        } catch {
          /* locked — ignore */
        }
      }
    }
  }
  await wipe(root)
  await wipe(pagesDir)
}

/**
 * Wipe one allowlisted disk scope. Only `webcache` (routes to the existing webdata clear) and
 * `logs` are ever clearable from here — every other scope is real page/runtime/workspace data
 * that must be removed from its own manager, so requesting it is rejected rather than guessed at.
 */
export async function clearDiskScope(id: string): Promise<void> {
  if (id === 'webcache') {
    // Free both classes webdata measures (the HTTP cache + the leveldb storage); cookies are
    // deliberately left alone so this never silently logs a hosted service out.
    await clearWebData({ scope: 'cache' })
    await clearWebData({ scope: 'storage' })
    return
  }
  if (id === 'logs') {
    await clearLogs()
    return
  }
  throw new Error(`scope not clearable: ${id}`)
}
