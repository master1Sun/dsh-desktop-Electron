import { spawn } from 'node:child_process'
import { BrowserWindow } from 'electron'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { join, dirname } from 'node:path'
import { envWithPATH, resolveDshNodeExePath } from './node-runtime'
import { bridgeEnvVars } from './mcp-bridge'
import { workspaceEnvVars } from './workspace'
import {
  resolveDshProfileDir,
  resolveDshRuntimeDirs,
  npmRegistryWithSlash,
  resolvePagesDir
} from '../shell/store'
import { IPC } from '../../shared/types'
import type { DshPluginInfo, DshPluginUpdate, DshUpdateChannel } from '../../shared/types'
import type { ContainerManifest } from './pages'
// aliased: `m` is already a local identifier in this file (regex match results)
import { m as msg, msgIn } from '../shell/i18n'

const DEFAULT_PROFILE = 'web'
/** An empty writer lock older than this is a crashed holder, not a live writer mid-flush. */
const STALE_EMPTY_LOCK_MS = 15_000

/** Run a CLI without blocking the main-process event loop (a frozen UI otherwise).
 *  `onData`, when given, receives every raw stdout/stderr chunk as it arrives so a caller can
 *  stream long-running output (a plugin install's pnpm log) live instead of only at exit. */
function runCli(
  cmd: string,
  args: string[],
  opts: {
    env?: NodeJS.ProcessEnv
    timeoutMs?: number
    shell?: boolean
    onData?: (chunk: string) => void
  } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: opts.env,
      windowsHide: true,
      shell: opts.shell ?? false,
      timeout: opts.timeoutMs
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      const s = String(d)
      stdout += s
      opts.onData?.(s)
    })
    child.stderr?.on('data', (d) => {
      const s = String(d)
      stderr += s
      opts.onData?.(s)
    })
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: stderr || err.message }))
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}

export interface DshStatus {
  installed: boolean
  version?: string
  binPath?: string
  profile: string
  profileDir: string
  pnpmFound: boolean
  error?: string
}

/** Roots that may contain a provisioned @deepseek-ai/dsh install, preferred first. */
function dshRoots(): string[] {
  return resolveDshRuntimeDirs()
}

/** The real CLI entry (`lib/bin.js`) — npm's `.cmd` shim is not used for spawning. */
export function dshBinJs(): string | null {
  for (const root of dshRoots()) {
    const p = join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    if (existsSync(p)) return p
  }
  return null
}

function dshBinCandidates(): string[] {
  const out: string[] = []
  for (const root of dshRoots()) {
    // `npm install -g --prefix <root>` puts its shims in <root>/node_modules/.bin,
    // but with npm_config_prefix they land directly in <root> — probe both.
    const bin = join(root, 'node_modules', '.bin')
    if (process.platform === 'win32')
      out.push(join(bin, 'dsh.cmd'), join(bin, 'dsh'), join(root, 'dsh.cmd'), join(root, 'dsh'))
    else out.push(join(bin, 'dsh'), join(root, 'dsh'))
  }
  return out
}

/** Package dir of the winning dsh install (reads package.json / resolves bundles there). */
function dshPackageDir(): string | null {
  for (const root of dshRoots()) {
    const p = join(root, 'node_modules', '@deepseek-ai', 'dsh')
    if (existsSync(join(p, 'package.json'))) return p
  }
  return null
}

/**
 * `dsh plugin` forwards to a bare `pnpm` on PATH. The bundled node dir is prepended
 * ahead of the system PATH, so pnpm's own directory must be prepended as well.
 * Container-managed wins: setup:dsh provisions pnpm next to dsh inside the prefix.
 */
let pnpmDirsPromise: Promise<string[]> | undefined
export function pnpmBinDirs(): Promise<string[]> {
  return (pnpmDirsPromise ??= probePnpmBinDirs())
}

async function probePnpmBinDirs(): Promise<string[]> {
  const marker = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const dirs = dshRoots().filter((r) => existsSync(join(r, marker)))
  if (!dirs.length) {
    const res = await runCli('npm', ['prefix', '-g'], {
      timeoutMs: 60_000,
      shell: process.platform === 'win32'
    })
    const prefix = res.code === 0 ? res.stdout.trim() : ''
    const candidate = process.platform === 'win32' ? prefix : join(prefix, 'bin')
    if (candidate && existsSync(join(candidate, marker))) dirs.push(candidate)
  }
  return dirs
}

/**
 * `npm install -g pnpm --ignore-scripts` skips pnpm v12's preinstall, which links
 * the native `@pnpm/exe.<target>` binary onto the extensionless placeholder bins;
 * npm's root `pnpm.cmd` then execs `<root>/node_modules/pnpm/pnpm`, a file
 * CreateProcess cannot resolve — "not recognized as an internal command".
 * Re-run that linking here (setup-dsh.mjs does the same at build time), and as a
 * fallback for hosts without the optional platform package, re-point pnpm.cmd at
 * pnpm's JS entry through node. Runtime self-updates re-install into userData/dsh,
 * so this must be idempotent and callable after every install.
 */
export function repairPnpmCmd(root: string): void {
  if (process.platform !== 'win32') return
  linkNativePnpm(root)
  const mjs = join(root, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
  const cmd = join(root, 'pnpm.cmd')
  if (!existsSync(mjs) || !existsSync(cmd)) return
  const desired =
    '@ECHO off\r\nSETLOCAL\r\nIF EXIST "%~dp0node.exe" (\r\n  "%~dp0node.exe" "%~dp0node_modules\\pnpm\\bin\\pnpm.mjs" %*\r\n) ELSE (\r\n  node "%~dp0node_modules\\pnpm\\bin\\pnpm.mjs" %*\r\n)\r\nENDLOCAL\r\nEXIT /b %ERRORLEVEL%\r\n'
  try {
    if (readFileSync(cmd, 'utf-8') === desired) return
    writeFileSync(cmd, desired, 'utf-8')
    pnpmDirsPromise = undefined
  } catch {
    /* read-only root: probes fall back to other candidates */
  }
}

/** Copy the optional-deps native pnpm.exe over the placeholder bins (pnpm/pn/pnpx/pnx). */
function linkNativePnpm(root: string): void {
  const pkgDir = join(root, 'node_modules', 'pnpm')
  const manifest = join(pkgDir, 'package.json')
  if (!existsSync(manifest)) return
  let pkg: { optionalDependencies?: Record<string, string> }
  try {
    pkg = JSON.parse(readFileSync(manifest, 'utf-8'))
  } catch {
    return
  }
  const target = Object.keys(pkg.optionalDependencies ?? {}).find((k) => k.startsWith('@pnpm/exe.'))
  if (!target) return
  const binFile = target.includes('win32-arm64') ? 'pnpm-arm64.exe' : 'pnpm.exe'
  const native = join(root, 'node_modules', ...target.split('/'), binFile)
  if (!existsSync(native)) return
  try {
    const buf = readFileSync(native)
    for (const name of ['pnpm', 'pn', 'pnpx', 'pnx']) {
      for (const suffix of ['', '.exe']) {
        const dest = join(pkgDir, name + suffix)
        if (name !== 'pnpm' && !suffix && !existsSync(dest)) continue
        writeFileSync(dest, buf)
      }
    }
  } catch {
    /* EPERM on a running exe: the .cmd rewrite below still restores forwarding */
  }
}

function pnpmMissingError(): Error {
  return new Error(msg('dsh.pnpmMissing'))
}

async function dshEnv(profileDir: string): Promise<NodeJS.ProcessEnv> {
  // With npm_config_prefix installs the shims sit directly in each root (pnpm.cmd)
  // and node_modules/.bin may not exist at all — put the roots on PATH too.
  const nodeExe = resolveDshNodeExePath()
  const dirs = [
    dirname(nodeExe),
    ...(await pnpmBinDirs()),
    ...dshRoots().flatMap((r) => [r, join(r, 'node_modules', '.bin')])
  ]
  // The child (and every shell it spawns) must see the same plain-Node runtime
  // that hosts dsh's node-pty; never let bundled/Electron node leak into it.
  return envWithPATH(dirs, {
    DSH_HOME: join(profileDir, '..', '..'),
    DSH_NODE_PATH: nodeExe,
    // MCP hub catalog pointers: dsh's terminals inherit them to every plugin process
    ...bridgeEnvVars(),
    // shared workspace pointers: dsh's terminals inherit them to every plugin process too
    ...workspaceEnvVars()
  })
}

/** dsh rejects these outright; "desktop" belongs to the Electron app */
function validateProfileName(profile: string): string {
  const p = profile.trim() || DEFAULT_PROFILE
  if (!/^[\w.-]+$/.test(p) || p === '.' || p === '..' || p === 'node_modules') {
    throw new Error(msg('dsh.invalidProfile', { profile }))
  }
  if (p.toLowerCase() === 'desktop') throw new Error(msg('dsh.reservedProfile'))
  return p
}

/**
 * Cheap synchronous "is the dsh CLI provisioned" check — the same first test `getDshStatus`
 * makes, minus the async pnpm probe and the version read. Page auto-start uses it to skip a
 * spawn that can only fail (`dshSpawnCommand` throws when no bin candidate exists).
 */
export function isDshInstalled(): boolean {
  return dshBinCandidates().some((p) => existsSync(p))
}

export async function getDshStatus(profile = DEFAULT_PROFILE): Promise<DshStatus> {
  const safe = validateProfileName(profile)
  const profileDir = resolveDshProfileDir(safe)
  const base: DshStatus = {
    installed: false,
    profile: safe,
    profileDir,
    pnpmFound: (await pnpmBinDirs()).length > 0
  }
  const bin = dshBinCandidates().find((p) => existsSync(p))
  if (!bin)
    return {
      ...base,
      error: msg('dsh.notInstalled')
    }
  const pkgDir = dshPackageDir()
  if (!pkgDir) return { ...base, binPath: bin, error: msg('dsh.pkgNoManifest') }
  try {
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'))
    return { ...base, installed: true, version: pkg.version, binPath: bin }
  } catch (err) {
    return { ...base, binPath: bin, error: msg('dsh.pkgBroken', { err: (err as Error).message }) }
  }
}

/** run the dsh launcher with args; returns stdout or throws with stderr */
async function runDsh(
  args: string[],
  opts: { timeoutMs?: number; profile?: string; onData?: (chunk: string) => void } = {}
): Promise<string> {
  const status = await getDshStatus(opts.profile)
  if (!status.binPath) throw new Error(status.error || msg('dsh.unavailable'))
  // bin.js carries a `#!/usr/bin/env node` shebang cmd.exe can't execute (silent exit 0),
  // so anything that isn't a .cmd/.bat shim runs as `node <bin.js> …` via plain Node
  // (resolveDshNodeExePath — dsh's node-pty terminals cannot load under Electron's ABI).
  const viaNode = !/\.(cmd|bat)$/i.test(status.binPath)
  const res = await runCli(
    viaNode ? resolveDshNodeExePath() : status.binPath,
    viaNode ? [status.binPath, ...args] : args,
    {
      env: await dshEnv(status.profileDir),
      shell: process.platform === 'win32' && !viaNode,
      timeoutMs: opts.timeoutMs ?? 10 * 60_000,
      onData: opts.onData
    }
  )
  // First boot of a profile prints an informational "initialized profile …" notice
  // on stderr while exiting 0 — success, not an error (code is what counts).
  if (res.code !== 0)
    throw new Error(
      res.stderr.slice(-2000) || res.stdout.slice(-2000) || msg('dsh.exitCode', { code: res.code })
    )
  return res.stdout
}

/** forward to pnpm inside the profile dir via `dsh plugin --profile <name> ...` */
export async function dshPluginForward(
  pnpmArgs: string[],
  profile = DEFAULT_PROFILE,
  onData?: (chunk: string) => void
): Promise<string> {
  if (!(await pnpmBinDirs()).length) throw pnpmMissingError()
  return runDsh(['plugin', '--profile', profile, ...pnpmArgs], {
    timeoutMs: 15 * 60_000,
    profile,
    onData
  })
}

interface ProfileManifest {
  bundles: string[]
  dependencies: Record<string, string>
}

/**
 * Read a profile's layer list + dependency map. dsh writes the bundle stack to
 * `package.json` under `dsh.profile.bundles` after each reconcile, so that is the
 * authoritative source once the profile exists; `dsh.profile` (top level) is only
 * present in scaffolds we wrote ourselves.
 */
function readProfileManifest(profileDir: string): ProfileManifest {
  let pkg: Record<string, unknown> = {}
  try {
    pkg = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf-8'))
  } catch {
    return { bundles: [], dependencies: {} }
  }
  const dependencies = Object.assign({}, (pkg.dependencies as Record<string, string>) || {})
  const dshSection = (pkg.dsh || {}) as Record<string, unknown>
  const profileSection = (dshSection.profile || {}) as Record<string, unknown>
  let bundles: string[] = []
  if (Array.isArray(profileSection.bundles)) bundles = profileSection.bundles.map(String)
  else if (Array.isArray(dshSection.bundles))
    bundles = (dshSection.bundles as unknown[]).map(String)
  else {
    try {
      const raw = JSON.parse(readFileSync(join(profileDir, 'dsh.profile'), 'utf-8'))
      if (Array.isArray(raw.bundles)) bundles = raw.bundles.map(String)
    } catch {
      /* no manifest yet */
    }
  }
  return { bundles, dependencies }
}

export function listDshPlugins(profile = DEFAULT_PROFILE): DshPluginInfo[] {
  const profileDir = resolveDshProfileDir(profile)
  const { bundles, dependencies } = readProfileManifest(profileDir)
  const out: DshPluginInfo[] = []
  const seen = new Set<string>()
  for (const [name, range] of Object.entries(dependencies)) {
    if (name.startsWith('@deepseek-ai/dsh-base')) continue
    out.push({ name, version: String(range), source: 'profile' })
    seen.add(name)
  }
  for (const b of bundles) {
    if (seen.has(b)) continue
    const version = installedBundleVersion(b, profileDir)
    // A layer resolving neither in the profile nor in any dsh root is a ghost: dsh appends to
    // `bundles` before pnpm runs, so a failed install leaves the name with nothing to uninstall.
    out.push(
      version
        ? { name: b, version, source: 'bundle', present: true }
        : { name: b, version: '', source: 'bundle', present: false }
    )
  }
  return out
}

/** version of a bundle resolved from the profile install or the dsh installation, when present */
function installedBundleVersion(name: string, profileDir: string): string | null {
  const parts = name.split('/')
  for (const dir of bundleSearchDirs(profileDir)) {
    try {
      const manifest = join(dir, ...parts, 'package.json')
      return JSON.parse(readFileSync(manifest, 'utf-8')).version
    } catch {
      /* try the next root */
    }
  }
  return null
}

/**
 * node_modules dirs a bundle layer can resolve from: the profile's own (pnpm-installed plugins),
 * then each dsh root's top level *and* the nested tree dsh ships its built-in layers in —
 * `@deepseek-ai/dsh-base` & friends live under `@deepseek-ai/dsh/node_modules`, so omitting it
 * would report every shipped layer as missing.
 */
function bundleSearchDirs(profileDir: string): string[] {
  const dirs = [join(profileDir, 'node_modules')]
  for (const root of dshRoots()) {
    const nm = join(root, 'node_modules')
    dirs.push(nm, join(nm, '@deepseek-ai', 'dsh', 'node_modules'))
  }
  return dirs
}

/** register the launcher profile as a pages/<id> entry by writing container.json (no file copying) */
export function createDshPage(profile: string, port: number): string {
  const safe = validateProfileName(profile)
  const id = `dsh-${safe}`
  const dir = join(resolvePagesDir(), id)
  if (existsSync(join(dir, 'container.json'))) throw new Error(msg('dsh.pageExists', { id }))
  mkdirSync(dir, { recursive: true })
  // Both languages go into the file: it is user-owned and never rewritten afterwards, so a
  // single-language snapshot would pin this page to the language active at creation time.
  const manifest: ContainerManifest = {
    name: `DSH (${safe})`,
    description: {
      zh: msgIn('zh', 'dsh.profilePageDesc', { profile: safe }),
      en: msgIn('en', 'dsh.profilePageDesc', { profile: safe })
    },
    kind: 'dsh',
    dsh: { profile: safe, port }
  }
  writeFileSync(join(dir, 'container.json'), JSON.stringify(manifest, null, 2))
  return id
}

function validateNpmSpec(spec: string): string {
  const s = spec.trim()
  if (
    !/^(@[\w.-]+\/)?[\w.-]+(@([\d.x^~*|-]+|tag|alpha|beta|next|\*))?$/i.test(s) &&
    !/^https?:\/\//i.test(s) &&
    !/^git[@+]/i.test(s) &&
    !/\.git(#.+)?$/.test(s)
  ) {
    throw new Error(msg('dsh.invalidSpec', { spec: s }))
  }
  return s
}

export async function installDshPlugin(spec: string, profile = DEFAULT_PROFILE): Promise<void> {
  const s = validateNpmSpec(spec)
  broadcastPluginOp({ name: s, done: false })
  const tee = pluginOutputTee(`plugin add ${s}`)
  try {
    await dshPluginForward(['add', s], profile, tee.onData)
    broadcastPluginOp({ name: s, done: true })
  } catch (err) {
    broadcastPluginOp({ name: s, done: true, error: (err as Error).message })
    throw err
  } finally {
    tee.flush()
  }
}

/**
 * pnpm's "not one of my dependencies" verdict. dsh keeps a layer in `dsh.profile.bundles` even
 * after the package stops being a dependency, so such a row can never be `remove`d — translate
 * the multi-line diagnostic (and its log path) into one actionable sentence.
 */
const NOT_A_DEPENDENCY = /ERR_PNPM_CANNOT_REMOVE_MISSING_DEPS|no such dependency found/i

export async function uninstallDshPlugin(name: string, profile = DEFAULT_PROFILE): Promise<void> {
  const s = validateNpmSpec(name)
  const tee = pluginOutputTee(`plugin remove ${s}`)
  try {
    await dshPluginForward(['remove', s], profile, tee.onData)
  } catch (err) {
    const raw = (err as Error).message
    if (NOT_A_DEPENDENCY.test(raw)) throw new Error(msg('dsh.notADependency', { name: s }))
    throw err
  } finally {
    tee.flush()
  }
}

/**
 * Line-buffered tee for a plugin CLI run: every complete stdout/stderr line is mirrored to
 * main.log under a `[dsh]` tag (console is mirrored to disk by installFileLogger), so the
 * in-app 运行日志 shows the pnpm detail an install/update/uninstall prints — the top-bar
 * progress strip alone only says "which plugin", not "what it did". `flush` emits any tail
 * left after the last newline so a final line without a trailing break is not dropped.
 */
function pluginOutputTee(label: string): {
  onData: (chunk: string) => void
  flush: () => void
} {
  let buf = ''
  const emit = (line: string): void => {
    const trimmed = line.replace(/\x1b\[[0-9;]*m/g, '').trim()
    if (trimmed) console.log(`[dsh] ${trimmed}`)
  }
  console.log(`[dsh] ${label} started`)
  return {
    onData(chunk: string): void {
      buf += chunk
      const lines = buf.split(/\r?\n/)
      buf = lines.pop() ?? ''
      for (const line of lines) emit(line)
    },
    flush(): void {
      if (buf) emit(buf)
      buf = ''
    }
  }
}

/** Snapshot of one in-flight plugin op, broadcast to the windows' top progress bars. */
function broadcastPluginOp(p: {
  name: string
  done: boolean
  index?: number
  total?: number
  error?: string
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.OnDshPluginOp, p)
  }
}

/** update one plugin: npm → pnpm update <name>; git → re-add <url>#<ref|sha> with the ref resolved to its commit */
export async function updateDshPlugin(
  name: string,
  channel: DshUpdateChannel,
  gitUrl?: string,
  profile = DEFAULT_PROFILE
): Promise<string> {
  try {
    const result = await applyPluginUpdate(name, channel, gitUrl, profile)
    broadcastPluginOp({ name, done: true })
    return result
  } catch (err) {
    broadcastPluginOp({ name, done: true, error: (err as Error).message })
    throw err
  }
}

async function applyPluginUpdate(
  name: string,
  channel: DshUpdateChannel,
  gitUrl?: string,
  profile = DEFAULT_PROFILE
): Promise<string> {
  if (channel === 'git') {
    if (!gitUrl) throw new Error(msg('dsh.gitNeedsUrl'))
    const parsed = parseGitSpec(gitUrl)
    const repo = parsed ? parsed.repo : gitUrl
    const ref = parsed?.ref
    // a pinned tag/sha installs that exact ref; a bare repo resolves the remote HEAD
    const installSpec = ref
      ? `${repo}#${ref}`
      : `${repo}#${(await remoteHeadSha(repo)).slice(0, 8)}`
    const tee = pluginOutputTee(`plugin update ${name} (git ${installSpec})`)
    try {
      await dshPluginForward(['add', installSpec], profile, tee.onData)
    } finally {
      tee.flush()
    }
    return msg('dsh.updatedTo', { spec: installSpec })
  }
  const s = validateNpmSpec(name)
  const tee = pluginOutputTee(`plugin update ${s}`)
  try {
    await dshPluginForward(['update', s, '--latest'], profile, tee.onData)
  } finally {
    tee.flush()
  }
  return msg('dsh.npmUpdated', { spec: s })
}

/**
 * Update every plugin the check flagged as behind, each through the channel the check picked
 * (npm → `pnpm update <name> --latest`; git → re-add the winning `repo#<tag>`, which also
 * covers flipping an npm dep onto a newer git tag). Sequential on purpose: dsh/pnpm reconcile the
 * same profile dir and must not run concurrently. Surfaces per-plugin failures in the log tail.
 */
export async function updateAllDshPlugins(profile = DEFAULT_PROFILE): Promise<string> {
  const current = new Map(listDshPlugins(profile).map((p) => [p.name, p.version]))
  const targets = (await checkDshPluginUpdates(profile)).filter((u) => u.updateAvailable)
  if (!targets.length) return ''
  const done: string[] = []
  const failed: string[] = []
  const total = targets.length
  let index = 0
  for (const u of targets) {
    index++
    broadcastPluginOp({ name: u.name, done: false, index, total })
    try {
      // Newest is on npm but the dep is currently git-pinned: `pnpm update` won't drop the git
      // source, so replace it with the registry version instead (the mirror of an npm→git flip).
      const pinnedToGit = !!parseGitSpec(current.get(u.name) || '')
      if (u.channel === 'npm' && pinnedToGit && u.latest) {
        const spec = `${u.name}@${u.latest}`
        await installDshPlugin(spec, profile)
        done.push(msg('dsh.npmUpdated', { spec }))
      } else {
        done.push(await applyPluginUpdate(u.name, u.channel || 'npm', u.gitUrl, profile))
      }
    } catch (err) {
      failed.push(`${u.name}: ${(err as Error).message}`)
    }
    broadcastPluginOp({ name: u.name, done: true })
  }
  if (!done.length) throw new Error(failed.join('\n') || msg('dsh.unavailable'))
  return [...done, ...failed].join('\n').slice(-2000)
}

/**
 * git dependency specs, e.g. github:user/repo#<sha> / github:user/repo#v1.2.3 /
 * git+https://….git#<sha>. Captures the raw ref after `#` and whether it is a commit sha,
 * so callers can compare a pinned tag against the remote's latest tag (not just HEAD shas).
 */
function parseGitSpec(version: string): { repo: string; ref?: string; isSha: boolean } | null {
  const from = (repo: string, ref?: string): { repo: string; ref?: string; isSha: boolean } => ({
    repo,
    ref,
    isSha: !!ref && /^[0-9a-f]{7,40}$/i.test(ref)
  })
  const m = /^github:([\w.-]+\/[\w.-]+?)(?:\.git)?(?:#(.+))?$/i.exec(version)
  if (m) return from(`https://github.com/${m[1]}.git`, m[2])
  const n = /^(?:git\+)?(https?:\/\/[^\s#]+\.git)(?:#(.+))?$/i.exec(version)
  if (n) return from(n[1], n[2])
  return null
}

/**
 * Highest semver tag of a remote git repo, with its commit sha (resolved from the
 * annotated-tag deref line). Lets git-pinned dsh plugins surface a real version number
 * instead of a bare short sha. Returns null when the repo publishes no semver tags.
 */
async function latestGitTag(repo: string): Promise<{ version: string; sha: string } | null> {
  if (/[\s;`$&|]/.test(repo)) return null
  const res = await runCli('git', ['ls-remote', '--tags', repo], { timeoutMs: 60_000 })
  if (res.code !== 0) return null
  const tagSha = new Map<string, string>()
  const commitSha = new Map<string, string>()
  for (const line of res.stdout.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 2) continue
    const [sha, ref] = parts
    const deref = /^refs\/tags\/(.+)\^\{\}$/.exec(ref)
    if (deref) {
      commitSha.set(deref[1], sha)
      continue
    }
    const m = /^refs\/tags\/(.+)$/.exec(ref)
    if (m) tagSha.set(m[1], sha)
  }
  let bestName: string | null = null
  let bestVer: string | null = null
  for (const name of tagSha.keys()) {
    const ver = name.replace(/^v/i, '')
    if (!/^\d+\.\d+\.\d+/.test(ver)) continue
    if (!bestVer || isNewerVersion(bestVer, ver)) {
      bestVer = ver
      bestName = name
    }
  }
  if (!bestName) return null
  const sha = commitSha.get(bestName) || tagSha.get(bestName) || ''
  // return the original tag name (keeps the `v` prefix so it doubles as a git ref)
  return { version: bestName, sha }
}

function isNewerVersion(installed: string, latest: string): boolean {
  // strip leading range operators (^ ~ >= < = * v) so a caret range like "^1.2.3"
  // isn't misread as major version 0 (which would flag every ranged plugin as outdated)
  const clean = (s: string): string => s.replace(/^[\^~>=<*v]+/i, '').trim()
  if (!/^\d/.test(clean(installed)) || !/^\d/.test(clean(latest))) return false
  const seg = (s: string): number[] =>
    clean(s)
      .split(/[.+-]/)
      .map((x) => parseInt(x, 10) || 0)
  const a = seg(installed)
  const b = seg(latest)
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (b[i] || 0) > (a[i] || 0)
  }
  return false
}

async function npmLatestVersion(name: string): Promise<string> {
  // #26: the user-picked registry, resolved per call (not a module constant) so switching 镜像源
  // takes effect without a restart.
  const res = await runCli('npm', ['view', name, 'version', '--registry', npmRegistryWithSlash()], {
    timeoutMs: 30_000,
    shell: process.platform === 'win32'
  })
  return res.code === 0 ? res.stdout.trim().replace(/^v/, '') : ''
}

/** Strip npm range operators / a leading `v` so a `^1.2.3` range reads as `1.2.3`. */
function cleanVersion(s: string): string {
  return s.replace(/^[\^~>=<*v]+/i, '').trim()
}

function isSemver(s: string): boolean {
  return /^\d+\.\d+\.\d+/.test(s)
}

/** A git-resolvable repo URL from an npm `repository.url`, or null when unrecognised. */
function normalizeRepoUrl(raw: string): string | null {
  const s = (raw || '').trim().replace(/^git\+/i, '')
  if (!s) return null
  const gh = /^(?:github[:/]|https?:\/\/github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(s)
  if (gh) return `https://github.com/${gh[1]}.git`
  if (/^(?:https?|ssh|git):\/\//i.test(s) || /^[\w.-]+@[\w.-]+:/i.test(s)) return s
  return null
}

/** `npm view <name> repository.url` — the git repo behind an npm package ('' when absent). */
async function npmRepositoryUrl(name: string): Promise<string> {
  const res = await runCli(
    'npm',
    ['view', name, 'repository.url', '--registry', npmRegistryWithSlash()],
    { timeoutMs: 30_000, shell: process.platform === 'win32' }
  )
  return res.code === 0 ? res.stdout.trim().replace(/^["']|["']$/g, '') : ''
}

/** Semver currently installed per the profile, or null when pinned to a sha / branch. */
function installedSemverOf(raw: string, git: { ref?: string } | null): string | null {
  const v = cleanVersion(git ? git.ref || '' : raw)
  return isSemver(v) ? v : null
}

/**
 * Newest-version hint for ONE plugin, weighing both sources: the npm mirror's latest and the
 * backing git repo's newest semver tag. The higher version wins and sets `channel` (npm preferred
 * on an exact tie); `gitUrl` carries the `repo#<tag>` spec so the update — including flipping an
 * npm-pinned plugin onto a newer git tag — knows where to install from. sha-/branch-pinned git
 * deps keep the prior "did the newest tag move?" signal rather than a cross-source comparison,
 * since a bare sha/branch has no semver to weigh against npm. Any failed lookup omits that
 * source rather than erroring, so one unreachable host never blanks the whole hint.
 */
async function describePluginUpdate(p: DshPluginInfo): Promise<DshPluginUpdate> {
  const gitDep = parseGitSpec(p.version)
  const installedSem = installedSemverOf(p.version, gitDep)
  const repo = gitDep?.repo || normalizeRepoUrl(await npmRepositoryUrl(p.name))
  const [npmRaw, tag] = await Promise.all([
    npmLatestVersion(p.name),
    repo ? latestGitTag(repo) : Promise.resolve(null)
  ])
  const npmSem = isSemver(cleanVersion(npmRaw)) ? cleanVersion(npmRaw) : null
  const gitSem = tag && isSemver(cleanVersion(tag.version)) ? cleanVersion(tag.version) : null

  // sha- or branch-pinned git dep: only report whether the repo's newest tag differs.
  if (gitDep && !installedSem && tag && repo) {
    const moved = (gitDep.ref || '').toLowerCase() !== tag.sha.toLowerCase()
    return moved
      ? {
          name: p.name,
          updateAvailable: true,
          latest: tag.version,
          channel: 'git',
          gitUrl: `${repo}#${tag.version}`
        }
      : { name: p.name, updateAvailable: false, channel: 'git' }
  }

  let best: { ver: string; channel: DshUpdateChannel; gitUrl?: string } | null = null
  if (npmSem) best = { ver: npmSem, channel: 'npm' }
  if (gitSem && (!best || isNewerVersion(best.ver, gitSem)))
    best = {
      ver: gitSem,
      channel: 'git',
      gitUrl: repo && tag ? `${repo}#${tag.version}` : undefined
    }
  if (!best) return { name: p.name, updateAvailable: false, channel: gitDep ? 'git' : 'npm' }

  const updateAvailable = installedSem ? isNewerVersion(installedSem, best.ver) : false
  if (!updateAvailable) return { name: p.name, updateAvailable: false, channel: best.channel }
  return {
    name: p.name,
    updateAvailable: true,
    latest: best.channel === 'git' && tag ? tag.version : best.ver,
    channel: best.channel,
    gitUrl: best.gitUrl
  }
}

/**
 * New-version hints for every profile plugin, each comparing npm and git together and keeping the
 * newest (see describePluginUpdate). The `channel`/`gitUrl` fields route "可更新" to the winning
 * source so 全部更新 installs exactly what the check advertised.
 */
export async function checkDshPluginUpdates(profile = DEFAULT_PROFILE): Promise<DshPluginUpdate[]> {
  const plugins = listDshPlugins(profile).filter((p) => p.source === 'profile')
  return Promise.all(
    plugins.map(
      (p): Promise<DshPluginUpdate> =>
        describePluginUpdate(p).catch(() => ({ name: p.name, updateAvailable: false }))
    )
  )
}

async function remoteHeadSha(repoUrl: string): Promise<string> {
  if (/[\s;`$&|]/.test(repoUrl)) throw new Error(msg('dsh.illegalRepoChars'))
  const res = await runCli('git', ['ls-remote', repoUrl, 'HEAD'], { timeoutMs: 60_000 })
  if (res.code !== 0) throw new Error(res.stderr.slice(-500) || msg('dsh.lsRemoteFail'))
  const sha = res.stdout.split(/\s+/)[0]
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(msg('dsh.remoteHeadFail'))
  return sha
}

/**
 * dsh's atomic-write writer locks (`<home>/*.lock`) record the holder's PID but are never
 * reclaimed when that holder dies without releasing (crash, `taskkill /T`), so the next boot
 * waits out the whole timeout and the page exits code 1 — surfacing as a dead webview / 404.
 * Drop every lock whose recorded PID is no longer running right before spawning; a lock held
 * by a LIVE process (a dsh the user runs in a terminal) is left strictly alone.
 */
export function clearStaleDshLocks(homeDir: string): string[] {
  let names: string[] = []
  try {
    names = readdirSync(homeDir).filter((n) => n.endsWith('.lock'))
  } catch {
    return [] // home not created yet: nothing to reclaim
  }
  const removed: string[] = []
  for (const name of names) {
    const file = join(homeDir, name)
    let raw = ''
    let mtimeMs = 0
    try {
      raw = readFileSync(file, 'utf-8').trim()
      mtimeMs = statSync(file).mtimeMs
    } catch {
      continue
    }
    let stale: boolean
    if (!raw) {
      // Empty lock = a holder that died between creating the file and writing its pid (the
      // common crash shape). Only reclaim once it is clearly not a live writer mid-flush.
      stale = Date.now() - mtimeMs > STALE_EMPTY_LOCK_MS
    } else {
      const pid = parseInt(raw, 10)
      // An unparseable non-empty lock is NOT touched: we cannot prove it stale, and deleting
      // a live holder's lock would corrupt its in-flight write.
      if (!Number.isFinite(pid) || pid <= 0) continue
      stale = !isProcessAlive(pid)
    }
    if (!stale) continue
    try {
      unlinkSync(file)
      removed.push(file)
    } catch {
      /* open handle elsewhere: leave it and let dsh report it */
    }
  }
  if (removed.length) console.warn(`[dsh] reclaimed stale writer lock(s): ${removed.join(', ')}`)
  return removed
}

/** Signal-0 probe: ESRCH = gone, EPERM = alive but owned by someone else. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Spawn spec for pages.ts when kind=dsh: `node <dsh lib/bin.js> --profile <name> --host … --port …`.
 * The trailing flags belong to the profile's app (parsed by @deepseek-ai/dsh-web-app),
 * and `--no-open` keeps the container's webview as the only surface.
 */
export async function dshSpawnCommand(
  profile: string,
  port: number,
  mcpPatchFile?: string | null
): Promise<{ cmd: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }> {
  const status = await getDshStatus(profile)
  if (!status.installed) throw new Error(status.error || msg('dsh.unavailable'))
  const binJs = dshBinJs()
  if (!binJs) throw new Error(msg('dsh.binMissing'))
  mkdirSync(status.profileDir, { recursive: true })
  // Self-heal dead credentials/plugin locks left by a crashed harness, or this spawn would
  // block on withFileLock until timeout and die (see clearStaleDshLocks).
  clearStaleDshLocks(join(status.profileDir, '..', '..'))
  // `--patch` is a launcher flag (it stops parsing at the first app arg), so it goes right
  // after `--profile`, before the web app's `--host`/`--port`/`--no-open`. The overlay is a
  // non-destructive Cordis layer contributing one `dsh-mcp-client` entry per bridged server.
  const patchArgs = mcpPatchFile ? ['--patch', mcpPatchFile] : []
  return {
    cmd: resolveDshNodeExePath(),
    args: [
      binJs,
      '--profile',
      profile,
      ...patchArgs,
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--no-open'
    ],
    cwd: status.profileDir,
    env: await dshEnv(status.profileDir)
  }
}
