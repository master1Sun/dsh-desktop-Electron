import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { simpleGit } from 'simple-git'
import { checkOne, performUpdate as gitPull, normalizeRepoUrl } from './git-updates'
import { getNodeExePath } from './node-runtime'
import { getDshStatus, repairPnpmCmd } from './dsh'
import { openclawVersion } from './openclaw'
import { resolveInstallDir, resolveProjectDir } from './store'
import { m } from './i18n'
import { CONTAINER_REPO_URL, type PageMeta, type UpdateCheckResult, type UpdateOutcome } from '../shared/types'

const REGISTRY = process.env.npm_config_registry || 'https://registry.npmmirror.com/'
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
    REGISTRY
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

/** Where the container's own git checkout lives / should be created. */
function containerGitDir(): string {
  if (!app.isPackaged) return resolveProjectDir()
  const candidate = join(resolveInstallDir(), 'dsh-desktop-Electron')
  try {
    mkdirSync(candidate, { recursive: true })
    return candidate
  } catch {
    // Install dir not writable (Program Files): keep the update in userData.
    return join(app.getPath('userData'), 'container-src')
  }
}

/** Canonical remote URL of a checkout ('' when there is none). */
async function originOf(dir: string): Promise<string> {
  try {
    const remotes = await simpleGit({ baseDir: dir }).getRemotes(true)
    return remotes.find((r) => r.name === 'origin')?.refs.fetch || ''
  } catch {
    return ''
  }
}

async function computeAll(pages: PageMeta[]): Promise<UpdateCheckResult[]> {
  const dev = !app.isPackaged
  const projectDir = resolveProjectDir()
  // In dev the container row is the repo checkout itself; packaged installs point at a
  // git clone materialized next to the exe (or userData when that isn't writable).
  const dir = dev ? projectDir : containerGitDir()
  const container = { name: containerName(), dir }
  return Promise.all([
    (async (): Promise<UpdateCheckResult> => {
      const r = await checkOne(container.name, dir, true)
      if (r.ok) {
        // Only offer pull when the checkout actually tracks the upstream repo.
        const origin = await originOf(dir)
        const sameRepo =
          normalizeRepoUrl(origin).toLowerCase() ===
          normalizeRepoUrl(CONTAINER_REPO_URL).toLowerCase()
        return { ...r, source: 'git' as const, action: 'pull' as const, canAutoUpdate: sameRepo }
      }
      if (dev) return { ...r, source: 'git' as const, canAutoUpdate: false }
      // Packaged: "not a git repo" means the clone never happened — the update button
      // initializes it from the canonical URL instead.
      return { ...r, source: 'git' as const, action: 'pull' as const, canAutoUpdate: true }
    })(),
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

/** Candidate roots where openclaw is provisioned — mirrors openclaw.ts entry discovery. */
function openclawRoots(): string[] {
  return [
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
    throw new Error(`${res.stderr.slice(-500) || m('upd.npmExitCode', { code: res.code })}（${args.join(' ')}）`)
}

async function updateDshSelf(): Promise<UpdateOutcome> {
  const name = m('upd.dshName')
  // Upgrade target: the writable userData root (first candidate dsh.ts resolves),
  // so a packaged install — where resources/ is read-only — can still self-update.
  const root = join(app.getPath('userData'), 'dsh')
  const before = (await getDshStatus()).version
  try {
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, '.npmrc'), `registry=${REGISTRY}\n`)
    const node = getNodeExePath()
    const npmCli = bundledNpmCli()
    if (!existsSync(npmCli))
      throw new Error(m('upd.npmMissing', { npm: npmCli }))
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
    const hint = /EPERM|EACCES|EROFS|permission/i.test(msg)
      ? m('upd.dshDirNotWritable')
      : ''
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
    writeFileSync(join(root, '.npmrc'), `registry=${REGISTRY}\n`)
    const node = getNodeExePath()
    const npmCli = bundledNpmCli()
    if (!existsSync(npmCli))
      throw new Error(m('upd.npmMissing', { npm: npmCli }))
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
    const hint = /EPERM|EACCES|EROFS|permission/i.test(msg)
      ? m('upd.openclawDirNotWritable')
      : ''
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

export async function performUpdate(target: UpdateCheckResult): Promise<UpdateOutcome> {
  switch (target.action) {
    case 'pull':
      return gitPull({ name: target.name, dir: target.dir })
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
