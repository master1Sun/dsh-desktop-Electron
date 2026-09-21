/**
 * Bundled-Node runtime updater ("关于与更新" panel).
 *
 * Downloads an official Node win-x64 zip, verifies it, and installs it as a
 * userData override that the runtime scan in node-runtime.ts prefers over the
 * installer-shipped one. Override (not in-place replace) is deliberate:
 * - the running app's child pages keep node.exe open on Windows, so the bundled
 *   directory is frequently locked mid-session;
 *   Program Files installs are not writable at all.
 * "恢复内置" simply deletes the override — the next lookup falls back to the
 * shipped runtime, so a bad pick is always one click away from undone.
 */
import { execFile, execFileSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { get as httpsGet } from 'node:https'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { app, net } from 'electron'
import { m } from './i18n'
import { getNodeRuntimeInfo, invalidateNodeRuntimeCache, nodeVersionUsable, overrideNodeDir } from './node-runtime'
import type { NodeRuntimeInfo } from './node-runtime'
import type { NodeVersionInfo, UpdateProgress } from '../shared/types'

/** Version-index sources, tried in order (CN mirrors first, upstream last). */
const INDEX_URLS = [
  'https://npmmirror.com/mirrors/node/index.json',
  'https://nodejs.org/dist/index.json'
]
/** Zip download bases; %V% is replaced with the v-prefixed tag (e.g. v24.21.0). */
const DIST_BASES = [
  'https://npmmirror.com/mirrors/node/%V%/node-%V%-win-x64.zip',
  'https://cdn.npmmirror.com/binaries/node/%V%/node-%V%-win-x64.zip',
  'https://nodejs.org/dist/%V%/node-%V%-win-x64.zip'
]

/** Same cap the index is useful at in a dropdown; newest-first order is kept. */
const MAX_VERSIONS = 50

function isValidTag(v: string): boolean {
  return /^v\d+\.\d+\.\d+$/.test(v)
}

function get(url: string, timeoutMs = 20000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    // Fetch through Electron's `net` (Chromium) stack instead of raw node:https, so the
    // system proxy / OS cert store are honored. The version dropdown came back empty on
    // machines behind a proxy because node:https bypasses it and both mirror URLs threw.
    // net follows redirects automatically, so no manual 3xx handling is needed here.
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const done = (fn: () => void): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      fn()
    }
    const req = net.request({ url, method: 'GET' })
    req.setHeader('user-agent', 'DesktopContainer')
    timer = setTimeout(() => {
      done(() => {
        try {
          req.abort()
        } catch {
          /* already gone */
        }
        reject(new Error(`timeout fetching ${url}`))
      })
    }, timeoutMs)
    req.on('response', (res) => {
      if (res.statusCode !== 200) {
        res.on('error', () => undefined)
        done(() => reject(new Error(`HTTP ${res.statusCode}`)))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (d: Buffer) => chunks.push(Buffer.from(d)))
      res.on('end', () =>
        done(() => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf-8') }))
      )
      res.on('error', (e: Error) => done(() => reject(e)))
    })
    req.on('error', (e: Error) => done(() => reject(e)))
    req.end()
  })
}

/**
 * The official dist index, filtered to versions every hosted runtime accepts
 * (nodeVersionUsable) and offering a win-x64 zip. Newest first.
 */
export async function listNodeVersions(): Promise<NodeVersionInfo[]> {
  if (process.platform !== 'win32') throw new Error(m('node.notWin'))
  let lastErr = ''
  for (const url of INDEX_URLS) {
    try {
      const { body } = await get(url, 25000)
      const entries = JSON.parse(body) as Array<{
        version: string
        date: string
        lts: string | false
        files?: string[]
      }>
      const out: NodeVersionInfo[] = []
      for (const e of entries) {
        if (!isValidTag(e.version)) continue
        // We install the win-x64 ZIP. Older index entries tagged this platform with a bare
        // "win-x64" token; current nodejs.org/npmmirror entries use "win-x64-zip" instead —
        // matching only "win-x64" silently filtered out EVERY modern version, leaving an empty
        // dropdown. Accept either so both eras of index are usable.
        if (e.files && !e.files.includes('win-x64-zip') && !e.files.includes('win-x64')) continue
        if (!nodeVersionUsable(e.version)) continue
        out.push({ version: e.version, date: e.date, lts: e.lts })
        if (out.length >= MAX_VERSIONS) break
      }
      if (!out.length) throw new Error('no usable versions in index')
      return out
    } catch (err) {
      lastErr = (err as Error).message
    }
  }
  throw new Error(m('node.indexFail', { err: lastErr }))
}

/** Same throttle as asar-updates: byte progress is fine-grained, IPC emissions are not. */
const PROGRESS_INTERVAL_MS = 150

/** One streamed download with byte progress; follows redirects like setup-node.mjs. */
function download(
  url: string,
  target: string,
  version: string,
  onProgress: (p: UpdateProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = httpsGet(
      url,
      { headers: { 'user-agent': 'DesktopContainer' }, timeout: 60000 },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          download(new URL(res.headers.location, url).toString(), target, version, onProgress).then(
            resolve,
            reject
          )
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        const total = Number(res.headers['content-length'] || 0)
        let received = 0
        let lastEmit = 0
        const emit = (force: boolean): void => {
          const now = Date.now()
          if (!force && now - lastEmit < PROGRESS_INTERVAL_MS) return
          lastEmit = now
          const percent = total ? Math.min(100, Math.floor((received / total) * 100)) : undefined
          const mb = (received / 1024 / 1024).toFixed(1)
          onProgress({
            name: 'Node',
            phase: 'fetch',
            received,
            total: total || undefined,
            percent,
            message: m('node.downloadingPct', { v: version, p: percent ?? '--', mb })
          })
        }
        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          emit(received >= total)
        })
        // Paint the final 100% and settle the promise — omitting resolve() here left the
        // download hanging at 100% forever (updateNodeRuntime never advanced to extract).
        pipeline(res, createWriteStream(target)).then(
          () => {
            emit(true)
            resolve()
          },
          (err) => reject(err)
        )
      }
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error(`timeout fetching ${url}`)))
  })
}

/** Download the zip with byte-level progress; throws when every mirror failed. */
async function downloadZip(
  urls: string[],
  target: string,
  version: string,
  onProgress: (p: UpdateProgress) => void
): Promise<void> {
  let lastErr = ''
  for (const url of urls) {
    try {
      await download(url, target, version, onProgress)
      const size = existsSync(target) ? statSync(target).size : 0
      if (size < 10 * 1024 * 1024) throw new Error(m('node.tooSmall', { n: size }))
      return
    } catch (err) {
      lastErr = (err as Error).message
      rmSync(target, { force: true })
    }
  }
  throw new Error(m('node.downloadFail', { err: lastErr }))
}

/** Shared by the Node-runtime updater and the OTA asar update: out-of-process Expand-Archive. */
export function extractZip(zip: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Single-quote the paths (PowerShell treats '...' literally, so Windows-path backslashes
    // stay intact) and hand the whole script to PowerShell via -EncodedCommand as base64
    // UTF-16LE. A raw `-Command` argument is re-encoded through the console codepage, which
    // mangles non-ASCII paths (e.g. a Chinese %APPDATA% leaf) and can leave PowerShell parked
    // at a continuation prompt — the "stuck at 0%" hang. EncodedCommand avoids that path.
    const q = (p: string): string => `'${p.replace(/'/g, "''")}'`
    const script = `Expand-Archive -LiteralPath ${q(zip)} -DestinationPath ${q(dest)} -Force`
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      // Backstop so a wedged PowerShell can never hang the update forever (5 min is generous
      // for a ~30 MB Node zip on a slow disk).
      { windowsHide: true, timeout: 300000 },
      (err) => (err ? reject(new Error(m('node.extractFail', { err: err.message }))) : resolve())
    )
  })
}

/** Run the freshly extracted exe; must print exactly the requested tag. */
function verifyRuntime(nodeExe: string, want: string): void {
  let out = ''
  try {
    out = execFileSync(nodeExe, ['--version'], { windowsHide: true }).toString().trim()
  } catch {
    /* missing/broken exe → treat as empty below */
  }
  if (out !== want) throw new Error(m('node.verifyFail'))
}

/**
 * Install `version` (e.g. "v24.22.0") as the effective bundled runtime.
 * Streams UpdateProgress {name:'Node'}; resolves with the refreshed runtime info.
 */
export async function updateNodeRuntime(
  version: string,
  onProgress: (p: UpdateProgress) => void
): Promise<NodeRuntimeInfo> {
  if (process.platform !== 'win32') throw new Error(m('node.notWin'))
  const want = version.startsWith('v') ? version : `v${version}`
  if (!isValidTag(want)) throw new Error(m('node.badVersion', { v: version }))

  const work = join(app.getPath('userData'), 'node-update')
  const staging = join(work, `runtime-${want}`)
  const zip = join(work, `node-${want}-win-x64.zip`)
  const extracted = join(work, `extract-${want}`)
  rmSync(zip, { force: true })
  rmSync(staging, { recursive: true, force: true })
  rmSync(extracted, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })

  onProgress({ name: 'Node', phase: 'fetch', percent: 0, message: m('node.downloading', { v: want }) })
  await downloadZip(
    DIST_BASES.map((b) => b.split('%V%').join(want)),
    zip,
    want,
    onProgress
  )

  onProgress({ name: 'Node', phase: 'extract', message: m('node.extracting') })
  await extractZip(zip, extracted)

  // Flatten node-<ver>-win-x64/* into the staging dir (same step setup-node.mjs does).
  const nested = readdirSync(extracted).find((d) => d.startsWith(`node-${want}-win-x64`))
  const srcRoot = nested ? join(extracted, nested) : extracted
  mkdirSync(staging, { recursive: true })
  for (const entry of readdirSync(srcRoot)) {
    renameSync(join(srcRoot, entry), join(staging, entry))
  }
  verifyRuntime(join(staging, 'node.exe'), want)

  // Swap: the previous override (if any) is parked as <dir>.old — renaming beats
  // deleting when a page's process still holds handles inside it.
  const dir = overrideNodeDir()
  const old = `${dir}.old`
  if (existsSync(dir)) {
    rmSync(old, { recursive: true, force: true })
    try {
      renameSync(dir, old)
    } catch (err) {
      throw new Error(m('node.locked', { err: (err as Error).message }))
    }
  }
  renameSync(staging, dir)

  invalidateNodeRuntimeCache()
  rmSync(zip, { force: true })
  rmSync(extracted, { recursive: true, force: true })
  rmSync(old, { recursive: true, force: true }) // best effort — may still be locked
  onProgress({ name: 'Node', phase: 'done', message: m('node.done', { v: want }) })
  return getNodeRuntimeInfo(true)
}

/** Remove the override so the installer-shipped bundled runtime wins again. */
export async function restoreBundledNode(): Promise<NodeRuntimeInfo> {
  const dir = overrideNodeDir()
  if (existsSync(dir)) {
    const old = `${dir}.old`
    rmSync(old, { recursive: true, force: true })
    try {
      renameSync(dir, old)
      rmSync(old, { recursive: true, force: true })
    } catch (err) {
      throw new Error(m('node.locked', { err: (err as Error).message }))
    }
  }
  invalidateNodeRuntimeCache()
  return getNodeRuntimeInfo(true)
}
