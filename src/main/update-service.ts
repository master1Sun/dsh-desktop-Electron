import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { checkOne, performUpdate as gitPull } from './git-updates'
import { applyAsarUpdate, checkAsarUpdate, type ProgressCb } from './asar-updates'
import { getNodeExePath } from './node-runtime'
import { getDshStatus, repairPnpmCmd } from './dsh'
import { openclawVersion } from './openclaw'
import { resolveInstallDir, getSettings } from './store'
import { m } from './i18n'
import {
  NPM_REGISTRY_DEFAULT,
  type BuiltinKind,
  type PageMeta,
  type UpdateCheckResult,
  type UpdateOutcome
} from '../shared/types'

/**
 * #26: the npm registry published metadata is read from / written into a generated `.npmrc`.
 * Resolved per call so switching 镜像源 in Settings takes effect immediately; the picked value wins,
 * a launch-time `npm_config_registry` (how this worked before the setting existed) is the fallback.
 * The trailing slash is restored because both `new URL(spec, base)` and npm's `registry=` key need it.
 */
function registryUrl(): string {
  const picked = (getSettings().npmRegistry || '').trim()
  const base = picked || process.env.npm_config_registry || NPM_REGISTRY_DEFAULT
  return `${base.replace(/\/+$/, '')}/`
}

const DSH_PKG = '@deepseek-ai/dsh'
const OPENCLAW_PKG = 'openclaw'
/** Translated at use time — this row's name is rendered in the Updates panel. */
const containerName = (): string => m('app.title')
const CACHE_TTL_MS = 5 * 60_1000

let cache: { at: number; results: UpdateCheckResult[] } | null = null

/** Fetch a package's published `latest` version from the npm registry (npmmirror by default). */
export async function fetchNpmLatest(name: string): Promise<string | null> {
  const url = new URL(
    encodeURIComponent(name).replace(/^%40/, '@') + '/latest',
    registryUrl()
  ).toString()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    const json = (await res.json()) as { version?: string }
    return json.version || null
  } catch {
    return null
  }
}

/** Numeric semver tuple; ignores prerelease tags for a coarse "is a newer release out?" answer. */
function semverTuple(v: string): number[] {
  return (v.replace(/^v/, '').split(/[-+]/)[0].match(/\d+/g) || []).map(Number)
}

/** true when `latest` is strictly newer than `current` (component-wise, padded). */
export function isNewer(current: string, latest: string): boolean {
  const a = semverTuple(current)
  const b = semverTuple(latest)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0)
    if (d > 0) return true
    if (d < 0) return false
  }
  return false
}

interface NpmPkgInfo {
  name: string
  version: string
}

function readPkgJson(dir: string): NpmPkgInfo | null {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
    if (pkg?.name && pkg?.version) return { name: String(pkg.name), version: String(pkg.version) }
  } catch {
    /* not an npm package */
  }
  return null
}

/** A page row: git repo → pull; otherwise an npm package → registry compare (manual update). */
async function checkPage(p: PageMeta): Promise<UpdateCheckResult> {
  // Container-shipped pages are just manifests here — the runtime they launch is a
  // built-in row (DSH 本体 / OpenClaw) that updates via npm, so no git/npm signal applies.
  if (p.builtin) {
    return {
      name: p.name,
      dir: p.dir,
      isContainer: false,
      ok: true,
      hasUpdate: false,
      source: 'builtin',
      action: 'none',
      canAutoUpdate: false,
      // lets the panel offer 重置 (re-seed pages/<id> from the bundled original)
      pageId: p.id
    }
  }
  const gitRes = await checkOne(p.name, p.dir, false)
  if (gitRes.ok) return { ...gitRes, source: 'git', action: 'pull', canAutoUpdate: true }
  const pkg = readPkgJson(p.dir)
  if (!pkg) return { ...gitRes, source: 'git', canAutoUpdate: false }
  const latest = await fetchNpmLatest(pkg.name)
  if (!latest)
    return {
      name: p.name,
      dir: p.dir,
      isContainer: false,
      ok: false,
      source: 'npm',
      currentVersion: pkg.version,
      error: m('upd.registryUnreachable')
    }
  return {
    name: p.name,
    dir: p.dir,
    isContainer: false,
    ok: true,
    source: 'npm',
    packageName: pkg.name,
    currentVersion: pkg.version,
    latestVersion: latest,
    hasUpdate: isNewer(pkg.version, latest),
    canAutoUpdate: false,
    action: 'manual'
  }
}

/** A built-in CLI row: installed version vs registry latest; auto-updatable via its own path. */
async function checkBuiltin(
  name: string,
  dir: string,
  packageName: string,
  currentVersion: string | undefined
): Promise<UpdateCheckResult> {
  const base: UpdateCheckResult = {
    name,
    dir,
    isContainer: false,
    ok: false,
    source: 'builtin',
    packageName,
    action: 'reprovision',
    canAutoUpdate: true
  }
  if (!currentVersion) return { ...base, error: m('upd.versionNotDetected') }
  const latest = await fetchNpmLatest(packageName)
  if (!latest) return { ...base, currentVersion, error: m('upd.registryUnreachable') }
  return {
    ...base,
    ok: true,
    currentVersion,
    latestVersion: latest,
    hasUpdate: isNewer(currentVersion, latest)
  }
}

/** The unified, cached set of update rows: container self-update, imported pages, dsh, openclaw. */
async function computeAll(pages: PageMeta[]): Promise<UpdateCheckResult[]> {
  const name = containerName()
  return Promise.all([
    // Both packaged and dev detect the container's own update the same way: compare the
    // running version against the `release` branch tip (over-the-air app.asar channel).
    // On relaunch, relaunchToApplyStaged swaps a staged asar into resources/ in place
    // (packaged only — a dev checkout just stages the download, since out/ isn't the running asar).
    checkAsarUpdate(name, resolveInstallDir()),
    ...pages.filter((p) => !p.id.startsWith('__')).map(checkPage),
    checkBuiltin(
      m('upd.dshName'),
      join(app.getPath('userData'), 'dsh'),
      DSH_PKG,
      (await getDshStatus()).version
    ),
    checkBuiltin('OpenClaw', openclawRoot() || '', OPENCLAW_PKG, openclawVersion())
  ])
}

/** Cached, unified update check across the container repo, imported pages, dsh and openclaw. */
export async function checkUpdates(pages: PageMeta[], force = false): Promise<UpdateCheckResult[]> {
  if (cache && !force && Date.now() - cache.at < CACHE_TTL_MS) return cache.results
  const results = await computeAll(pages)
  cache = { at: Date.now(), results }
  return results
}

export function clearUpdateCache(): void {
  cache = null
}

// ---- update execution ----

/** Candidate roots where openclaw is provisioned — mirrors openclaw.ts entry discovery.
    userData first so a fresh (unbundled) install provisions into a writable dir, exactly
    like dsh (userData/dsh) and the Node override. */
function openclawRoots(): string[] {
  return [
    join(app.getPath('userData'), 'openclaw'),
    join(process.resourcesPath || '', 'openclaw'),
    join(app.getAppPath(), 'resources', 'openclaw'),
    join(process.cwd(), 'resources', 'openclaw')
  ].filter(Boolean)
}

/** The root that already holds a provisioned openclaw install (so we refresh in place). */
function openclawRoot(): string | null {
  return (
    openclawRoots().find((r) => existsSync(join(r, 'node_modules', 'openclaw'))) ||
    openclawRoots()[0] ||
    null
  )
}

function bundledNpmCli(): string {
  return join(dirname(getNodeExePath()), 'node_modules', 'npm', 'bin', 'npm-cli.js')
}

/** Install a package globally with the bundled npm — async so a 15-min install never freezes the window. */
async function runNpm(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number
): Promise<void> {
  const res = await new Promise<{ code: number; stderr: string }>((resolve) => {
    const child = spawn(cmd, args, {
      env,
      stdio: 'ignore',
      windowsHide: true,
      shell: process.platform === 'win32' && cmd !== getNodeExePath(),
      timeout: timeoutMs
    })
    let stderr = ''
    child.stderr?.on('data', (d) => (stderr += String(d)))
    child.on('error', (err) => resolve({ code: -1, stderr: err.message }))
    child.on('close', (code) => resolve({ code: code ?? -1, stderr }))
  })
  if (res.code !== 0)
    throw new Error(
      `${res.stderr.slice(-500) || m('upd.npmExitCode', { code: res.code })}（${args.join(' ')}）`
    )
}

async function updateDshSelf(): Promise<UpdateOutcome> {
  const name = m('upd.dshName')
  // Upgrade target: the writable userData root (first candidate dsh.ts resolves),
  // so a packaged install — where resources/ is read-only — can still self-update.
  const root = join(app.getPath('userData'), 'dsh')
  const before = (await getDshStatus()).version
  try {
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, '.npmrc'), `registry=${registryUrl()}\n`)
    const node = getNodeExePath()
    const npmCli = bundledNpmCli()
    if (!existsSync(npmCli)) throw new Error(m('upd.npmMissing', { npm: npmCli }))
    await runNpm(
      node,
      [
        npmCli,
        'install',
        '-g',
        `${DSH_PKG}@alpha`,
        '--config.minimumReleaseAge=0',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund'
      ],
      { ...process.env, npm_config_prefix: root },
      15 * 60_000
    )
    // npm rewrites pnpm.cmd on every global install — keep the plugin forwarder alive
    if (!existsSync(join(root, 'pnpm.cmd')))
      await runNpm(
        node,
        [
          npmCli,
          'install',
          '-g',
          'pnpm@latest',
          '--config.minimumReleaseAge=0',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund'
        ],
        { ...process.env, npm_config_prefix: root },
        15 * 60_000
      )
    repairPnpmCmd(root)
  } catch (err) {
    const msg = (err as Error).message || String(err)
    const hint = /EPERM|EACCES|EROFS|permission/i.test(msg) ? m('upd.dshDirNotWritable') : ''
    return { name, ok: false, updated: false, error: msg + hint }
  }
  const after = (await getDshStatus()).version
  return {
    name,
    ok: true,
    updated: Boolean(after && after !== before),
    message:
      after && after !== before
        ? m('upd.dshUpgraded', { after })
        : m('upd.dshUpToDate', { after: after || '?' })
  }
}

async function reprovisionOpenclaw(): Promise<UpdateOutcome> {
  const name = 'OpenClaw'
  const root = openclawRoot()
  if (!root) return { name, ok: false, updated: false, error: m('upd.openclawDirMissing') }
  const before = openclawVersion()
  try {
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, '.npmrc'), `registry=${registryUrl()}\n`)
    const node = getNodeExePath()
    const npmCli = bundledNpmCli()
    if (!existsSync(npmCli)) throw new Error(m('upd.npmMissing', { npm: npmCli }))
    await runNpm(
      node,
      [
        npmCli,
        'install',
        '-g',
        `${OPENCLAW_PKG}@latest`,
        '--ignore-scripts',
        '--no-audit',
        '--no-fund'
      ],
      { ...process.env, npm_config_prefix: root },
      15 * 60_000
    )
  } catch (err) {
    const msg = (err as Error).message || String(err)
    const hint = /EPERM|EACCES|EROFS|permission/i.test(msg) ? m('upd.openclawDirNotWritable') : ''
    return { name, ok: false, updated: false, error: msg + hint }
  }
  const after = openclawVersion()
  return {
    name,
    ok: true,
    updated: Boolean(after && after !== before),
    message:
      after && after !== before
        ? m('upd.openclawUpgraded', { after })
        : m('upd.openclawUpToDate', { after: after || '?' })
  }
}

/**
 * Install (or upgrade) a built-in agent runtime with the bundled npm.
 *
 * The same code path the 关于与更新 panel's reprovision row drives, surfaced as a
 * first-class action so a *missing* dsh/openclaw can be installed straight from the
 * first-run setup gate. Delegates to the private self-update helpers, which run
 * `npm install -g` (up to ~15min) and therefore give no fine-grained progress — the
 * renderer brackets the call with an indeterminate top-bar task instead.
 */
export async function provisionBuiltin(kind: BuiltinKind): Promise<UpdateOutcome> {
  return kind === 'dsh' ? updateDshSelf() : reprovisionOpenclaw()
}

/**
 * One update per row at a time. Overlapping invokes (a retry while an earlier attempt still
 * awaits, a double click, a stale row re-clicked after relaunch) would download and extract
 * into the same commit folder twice — wasteful at best, and with two pipelines interleaving
 * their rmSync/extract steps on one directory, outright hazardous. Later callers join the
 * in-flight promise and share its outcome instead of starting a second pipeline. (The bogus
 * "解压后未找到有效的 app.asar" aborts users hit were caused separately by Electron's
 * asar-patched fs mis-stating the staged file — see ofs in asar-updates.ts.)
 */
const inFlightUpdates = new Map<string, Promise<UpdateOutcome>>()

export function performUpdate(
  target: UpdateCheckResult,
  onProgress?: ProgressCb
): Promise<UpdateOutcome> {
  const running = inFlightUpdates.get(target.name)
  if (running) {
    console.log(`[update] ${target.name}: update already in flight, joining`)
    return running
  }
  const done = runUpdate(target, onProgress).finally(() => {
    inFlightUpdates.delete(target.name)
  })
  inFlightUpdates.set(target.name, done)
  return done
}

async function runUpdate(
  target: UpdateCheckResult,
  onProgress?: ProgressCb
): Promise<UpdateOutcome> {
  switch (target.action) {
    case 'pull':
      return gitPull({ name: target.name, dir: target.dir })
    case 'apply-asar':
      return applyAsarUpdate(target.name, onProgress)
    case 'reprovision':
      return target.packageName === DSH_PKG ? updateDshSelf() : reprovisionOpenclaw()
    case 'manual':
      return {
        name: target.name,
        ok: false,
        updated: false,
        error: m('upd.localNoAuto')
      }
    default:
      return { name: target.name, ok: false, updated: false, error: m('upd.unknownChannel') }
  }
}
