import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { checkOne, performUpdate as gitPull } from './git-updates'
import { applyAsarUpdate, checkAsarUpdate, type ProgressCb } from './asar-updates'
import { getNodeExePath } from '../runtime/node-runtime'
import { getDshStatus, repairPnpmCmd } from '../runtime/dsh'
import { openclawVersion } from '../runtime/openclaw'
import { resolveInstallDir, getSettings } from '../shell/store'
import {
  MCP_PKG_GROUP,
  mcpPackagesRoot,
  mcpPackagesStatus
} from '../runtime/mcp-packages'
import { m } from '../shell/i18n'
import { logEvent } from '../shell/events'
import {
  NPM_REGISTRY_DEFAULT,
  type BuiltinKind,
  type DshReleaseChannel,
  type PageMeta,
  type UpdateCheckResult,
  type UpdateOutcome
} from '../../shared/types'

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

/**
 * The dist-tag DSH is checked and installed from. dsh ships prereleases on `alpha`, so that is
 * the historical (and default) channel; `latest` follows stable. Read per call so switching the
 * setting needs no restart, and so the update-check row and the install can never disagree.
 */
export function dshChannel(): DshReleaseChannel {
  return getSettings().dshChannel === 'latest' ? 'latest' : 'alpha'
}
/** Translated at use time — this row's name is rendered in the Updates panel. */
const containerName = (): string => m('app.title')
const CACHE_TTL_MS = 5 * 60_1000

let cache: { at: number; results: UpdateCheckResult[] } | null = null

/** Fetch a package's published version for one dist-tag from the npm registry (npmmirror by default). */
export async function fetchNpmLatest(name: string, tag = 'latest'): Promise<string | null> {
  const url = new URL(
    encodeURIComponent(name).replace(/^%40/, '@') + `/${encodeURIComponent(tag)}`,
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

/** A built-in CLI row: installed version vs the registry version on its channel. */
async function checkBuiltin(
  name: string,
  dir: string,
  packageName: string,
  currentVersion: string | undefined,
  tag = 'latest'
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
  const latest = await fetchNpmLatest(packageName, tag)
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
      (await getDshStatus()).version,
      dshChannel()
    ),
    checkBuiltin('OpenClaw', openclawRoot() || '', OPENCLAW_PKG, openclawVersion()),
    checkMcpPackages()
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
  timeoutMs: number,
  onLine?: (line: string) => void
): Promise<void> {
  const res = await new Promise<{ code: number; stderr: string }>((resolve) => {
    // npm's default `notice` level stays silent for the whole install, which would leave a
    // streamed caller with nothing to show; `info` emits one line per registry fetch.
    const argv = onLine ? [...args, '--loglevel=info'] : args
    // stderr is piped (not ignored) so npm's own output both streams to the top-bar row
    // (`onLine`) and lands in the thrown message when the install fails.
    const child = spawn(cmd, argv, {
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
      shell: process.platform === 'win32' && cmd !== getNodeExePath(),
      timeout: timeoutMs
    })
    let stderr = ''
    child.stderr?.on('data', (d) => {
      const chunk = String(d)
      stderr += chunk
      if (onLine) {
        const line = chunk
          .split(/\r\n|\r|\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .pop()
        if (line) onLine(line)
      }
    })
    child.on('error', (err) => resolve({ code: -1, stderr: err.message }))
    child.on('close', (code) => resolve({ code: code ?? -1, stderr }))
  })
  if (res.code !== 0)
    throw new Error(
      `${res.stderr.slice(-500) || m('upd.npmExitCode', { code: res.code })}（${args.join(' ')}）`
    )
}

/**
 * A built-in runtime install has no byte progress to report — `npm install -g` only narrates
 * itself on stderr. So instead of a fake percentage, open an indeterminate row right away
 * (`phase:'fetch'`, no percent → the bar stripes and flows) and refresh its message with npm's
 * latest line, throttled so a chatty install can't flood IPC. The renderer supplies the localized
 * label/detail strings; the npm line is passed through verbatim as a technical tail.
 */
function npmWatcher(
  name: string,
  builtin: BuiltinKind,
  onProgress?: ProgressCb
): ((line: string) => void) | undefined {
  if (!onProgress) return undefined
  onProgress({ name, phase: 'fetch', builtin })
  let last = 0
  let lastLine = ''
  return (line: string): void => {
    if (line === lastLine) return
    const now = Date.now()
    if (now - last < 400) return
    last = now
    lastLine = line
    onProgress({ name, phase: 'fetch', builtin, message: line.slice(0, 160) })
  }
}

async function updateDshSelf(
  pinned?: string,
  onProgress?: ProgressCb,
  rowName?: string
): Promise<UpdateOutcome> {
  const name = m('upd.dshName')
  // Progress rows are keyed by the panel's own row name so its inline bar matches the stream.
  const watch = npmWatcher(rowName || name, 'dsh', onProgress)
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
        // An explicit version wins over the channel: "重装指定版本" is the escape hatch when a
        // channel's newest prerelease is the thing that broke.
        `${DSH_PKG}@${pinned || dshChannel()}`,
        '--config.minimumReleaseAge=0',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund'
      ],
      { ...process.env, npm_config_prefix: root },
      15 * 60_000,
      watch
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
        15 * 60_000,
        watch
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

async function reprovisionOpenclaw(
  pinned?: string,
  onProgress?: ProgressCb,
  rowName?: string
): Promise<UpdateOutcome> {
  const name = 'OpenClaw'
  const watch = npmWatcher(rowName || name, 'openclaw', onProgress)
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
        `${OPENCLAW_PKG}@${pinned || 'latest'}`,
        '--ignore-scripts',
        '--no-audit',
        '--no-fund'
      ],
      { ...process.env, npm_config_prefix: root },
      15 * 60_000,
      watch
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
 * One aggregated update row for the curated MCP server packages (userData/mcp). The panel
 * shows a single group row rather than one per package: they install together and the version
 * column reads "installed/total" while some are still missing (no real npm package backs
 * MCP_PKG_GROUP — it is a synthetic marker the renderer matches on to offer the group's install
 * button).
 */
async function checkMcpPackages(): Promise<UpdateCheckResult> {
  const name = m('upd.mcpName')
  const base: UpdateCheckResult = {
    name,
    dir: mcpPackagesRoot() || '',
    isContainer: false,
    ok: false,
    source: 'builtin',
    packageName: MCP_PKG_GROUP,
    action: 'reprovision',
    canAutoUpdate: true
  }
  const statuses = mcpPackagesStatus()
  const missing = statuses.filter((s) => !s.installed).length
  let registryDown = false
  let outdated: string | null = null
  for (const s of statuses) {
    if (!s.installed) continue
    const latest = await fetchNpmLatest(s.pkg)
    if (!latest) registryDown = true
    else if (s.version && isNewer(s.version, latest)) outdated = outdated || s.pkg
  }
  if (missing === 0 && registryDown)
    return { ...base, currentVersion: `${statuses.length}`, error: m('upd.registryUnreachable') }
  const currentVersion = missing ? `${statuses.length - missing}/${statuses.length}` : statuses[0]?.version
  return {
    ...base,
    ok: true,
    currentVersion,
    hasUpdate: missing > 0 || outdated !== null,
    latestVersion: missing ? m('upd.mcpMissingCount', { n: missing }) : outdated ? `${m('upd.mcpOutdatedPrefix')} ${outdated}` : undefined
  }
}

/**
 * Install/refresh every curated MCP server package into userData/mcp with the bundled npm
 * (registry routed like every other install; `--no-save` keeps the folder purely a store).
 * `pinned` applies one version to all of them — the coarse escape hatch after a bad upstream
 * release; a package without that version fails the whole install loudly, which is intended.
 */
async function installMcpPackages(
  pinned?: string,
  onProgress?: ProgressCb,
  rowName?: string
): Promise<UpdateOutcome> {
  const name = m('upd.mcpName')
  const root = mcpPackagesRoot()
  if (!root) return { name, ok: false, updated: false, error: m('upd.mcpRootMissing') }
  const watch = npmWatcher(rowName || name, 'mcp', onProgress)
  const before = mcpPackagesStatus()
    .filter((s) => s.installed)
    .map((s) => `${s.pkg}@${s.version}`)
    .join(',')
  try {
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, '.npmrc'), `registry=${registryUrl()}\n`)
    const node = getNodeExePath()
    const npmCli = bundledNpmCli()
    if (!existsSync(npmCli)) throw new Error(m('upd.npmMissing', { npm: npmCli }))
    const specs = mcpPackagesStatus().map((s) => `${s.pkg}@${pinned || 'latest'}`)
    await runNpm(
      node,
      [npmCli, 'install', '--global', '--no-save', '--prefix', root, ...specs, '--ignore-scripts', '--no-audit', '--no-fund'],
      { ...process.env, npm_config_prefix: root },
      15 * 60_000,
      watch
    )
  } catch (err) {
    return { name, ok: false, updated: false, error: (err as Error).message || String(err) }
  }
  const after = mcpPackagesStatus()
    .filter((s) => s.installed)
    .map((s) => `${s.pkg}@${s.version}`)
    .join(',')
  return {
    name,
    ok: true,
    updated: after !== before,
    message: after !== before ? m('upd.mcpReady') : m('upd.mcpAlreadyReady', { after: after || '?' })
  }
}

/**
 * Install (or upgrade) a built-in agent runtime with the bundled npm.
 *
 * The same code path the 关于与更新 panel's reprovision row drives, surfaced as a
 * first-class action so a *missing* dsh/openclaw can be installed straight from the
 * first-run setup gate. Delegates to the private self-update helpers, which run
 * `npm install -g` (up to ~15min) and therefore give no fine-grained progress — the
 * renderer brackets the call with an indeterminate top-bar task instead (so no progress
 * callback is threaded here; the ProvisionBuiltin caller owns its own row).
 *
 * `pinned` installs one exact version instead of following the channel — the rollback hatch
 * for "the newest build is the one that broke".
 */
export async function provisionBuiltin(kind: BuiltinKind, pinned?: string): Promise<UpdateOutcome> {
  const version = (pinned || '').trim()
  if (kind === 'mcp') {
    const result = await installMcpPackages(version)
    logEvent(
      result.ok
        ? { level: 'info', kind: 'runtime.provision', detail: result.message, meta: { name: kind } }
        : { level: 'error', kind: 'runtime.provisionFail', detail: result.error, meta: { name: kind } }
    )
    return result
  }
  const result = kind === 'dsh' ? await updateDshSelf(version) : await reprovisionOpenclaw(version)
  logEvent(
    result.ok
      ? {
          level: 'info',
          kind: 'runtime.provision',
          detail: result.message,
          meta: { name: kind, version: version || (kind === 'dsh' ? dshChannel() : 'latest') }
        }
      : { level: 'error', kind: 'runtime.provisionFail', detail: result.error, meta: { name: kind } }
  )
  return result
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
      // Stream npm's own output as an indeterminate row, keyed by this row's name so both the
      // panel's inline bar and the window top bar light up for a built-in runtime update.
      return target.packageName === MCP_PKG_GROUP
        ? installMcpPackages(undefined, onProgress, target.name)
        : target.packageName === DSH_PKG
          ? updateDshSelf(undefined, onProgress, target.name)
          : reprovisionOpenclaw(undefined, onProgress, target.name)
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
