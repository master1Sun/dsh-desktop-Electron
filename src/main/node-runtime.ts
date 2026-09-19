import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { app } from 'electron'
import { NODE_VERSION_REQUIRED } from '../shared/types'

export interface NodeRuntimeInfo {
  path: string
  version: string | null
  dir: string
  ok: boolean
}

let cached: NodeRuntimeInfo | null = null

function candidateDirs(): string[] {
  const dirs: string[] = []
  if (process.env.DSH_NODE_DIR) dirs.push(process.env.DSH_NODE_DIR)
  // packaged: extraResources copies resources/node -> <resourcesPath>/node
  dirs.push(join(process.resourcesPath || '', 'node'))
  // dev / unpacked smoke test: project resources/node
  dirs.push(join(app.getAppPath(), 'resources', 'node'))
  dirs.push(join(process.cwd(), 'resources', 'node'))
  return dirs.filter(Boolean)
}

export function getNodeExePath(): string {
  const exe = process.platform === 'win32' ? 'node.exe' : 'node'
  // An external pin wins; one pointing back at our own candidates (we set it for
  // child shells) falls through to the scan below, which keeps it in sync with them.
  if (process.env.DSH_NODE_PATH && !candidateDirs().some((d) => existsSync(join(d, exe))))
    return process.env.DSH_NODE_PATH
  for (const dir of candidateDirs()) {
    const p = join(dir, exe)
    if (existsSync(p)) return p
  }
  throw new Error(
    `Bundled Node runtime not found. Run "npm run setup:node" first. Searched: ${candidateDirs().join(', ')}`
  )
}

/**
 * Node interpreter for running the dsh CLI itself. dsh's terminal feature spawns
 * shells through node-pty, whose N-API binaries are built against plain Node —
 * under Electron's ABI the win32 backend fails to load, so every terminal open
 * dies with "PTY shell exited during startup". Prefer a system node (the same
 * one `dsh` uses when launched from a normal terminal); fall back to the
 * bundled runtime only when PATH has none.
 */
export function resolveDshNodeExePath(): string {
  const pinned = (process.env.DSH_NODE_PATH || '').trim()
  if (pinned && !candidateDirs().some((d) => existsSync(join(d, exeName())))) return pinned
  const sys = whichOnPATH(exeName())
  if (sys) return sys
  return getNodeExePath()
}

function exeName(): string {
  return process.platform === 'win32' ? 'node.exe' : 'node'
}

/** Resolve a bare command against the current PATH (Windows: honoring PATHEXT). */
function whichOnPATH(cmd: string): string | null {
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.CMD;.EXE;.BAT;.COM').split(';').map((e) => e.toLowerCase())
      : ['']
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (!dir) continue
    for (const ext of exts) {
      const candidate = join(dir, cmd + ext)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

export async function getNodeRuntimeInfo(refresh = false): Promise<NodeRuntimeInfo> {
  if (cached && !refresh) return cached
  let path = ''
  try {
    path = getNodeExePath()
  } catch {
    cached = { path: '', version: null, dir: '', ok: false }
    return cached
  }
  const version = await readNodeVersion(path)
  cached = {
    path,
    version,
    dir: join(path, '..'),
    ok: version === NODE_VERSION_REQUIRED
  }
  return cached
}

function readNodeVersion(nodePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(nodePath, ['--version'], { windowsHide: true })
    let out = ''
    child.stdout.on('data', (d) => (out += d.toString()))
    child.on('error', () => resolve(null))
    child.on('close', () => resolve(out.trim() || null))
  })
}

/** env with the bundled node dir prepended to PATH so pages resolve node/npm to the bundled one */
export function bundledEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const dir = join(getNodeExePath(), '..')
  return { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH || ''}`, ...extra }
}

/**
 * PATH with additional dirs prepended (e.g. an npm global bin holding pnpm).
 * Unlike {@link bundledEnv} this never throws when the bundled runtime is absent,
 * so tooling and tests outside the Electron app still get a usable environment.
 */
export function envWithPATH(dirs: string[], extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  let base: NodeJS.ProcessEnv = { ...process.env }
  try {
    base = bundledEnv(extra)
  } catch {
    base = { ...base, ...extra }
  }
  const prepend = dirs.filter((d) => existsSync(d))
  if (!prepend.length) return base
  return { ...base, PATH: `${prepend.join(delimiter)}${delimiter}${base.PATH}` }
}
