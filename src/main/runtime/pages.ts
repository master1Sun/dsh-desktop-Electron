import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createConnection } from 'node:net'
import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { nativeTheme } from 'electron'
import { getNodeExePath, bundledEnv } from './node-runtime'
import { resolvePageEnv, resolvePageTextEnv, resolvePagePort, expandHome, isValidPort, getSettings, resolvePageCustomEnvs } from '../shell/store'
import { logPageLine } from '../shell/logger'
import { logEvent } from '../shell/events'
import { findPortHolder } from './port-holder'
import { notifyEvent } from '../shell/notifications'
// aliased: `m` is already a local identifier in this file (regex match / map callback)
import { m as msg, resolveText } from '../shell/i18n'
import {
  OPENCLAW_DEFAULT_PORT,
  type DshTokenResult,
  type LocalizableText,
  type PageMeta,
  type PageProgress,
  type PageState,
  type PageStatus
} from '../../shared/types'

const LOG_LIMIT = 1000
const START_TIMEOUT_MS = Number(process.env.DSH_PAGE_START_TIMEOUT_MS || 30_000)
/** openclaw's first boot self-installs provider plugins + runs state migrations, so it can take ~30s+ to bind; give it generous headroom. */
const OPENCLAW_READY_TIMEOUT_MS = Number(process.env.DSH_OPENCLAW_READY_TIMEOUT_MS || 120_000)
/** dsh's first boot initializes a profile (plugin bundle build + credential self-heal) and a cold
 *  machine/AV scan can stretch it well past 30s — same generous budget as openclaw. */
const DSH_READY_TIMEOUT_MS = Number(process.env.DSH_DSH_READY_TIMEOUT_MS || 120_000)
/** How long the declared-port fallback waits for dsh's token-bearing ready line before launching without it. */
const ANNOUNCE_GRACE_MS = 1500

/* ---- crash health-guard ----
 * A page that was up and then dies on its own (OOM, unhandled exception in the child,
 * a crashed gateway) is usually worth another attempt; a page that never booted is a
 * configuration problem and retrying only spams. Back off between attempts and give up
 * after the budget so a hard-broken page can't loop forever. Reaching `running` and
 * holding it for STABLE_RESET_MS refills the budget (a transient kill months later gets
 * the full retry set again). */
const CRASH_RETRY_DELAYS_MS = [2_000, 5_000, 15_000]
const STABLE_RESET_MS = 5 * 60_000
/** #18: exit-78 (resource busy) reclaim-and-retry is budget-free, but cap it to avoid a hot loop. */
const MAX_RECLAIM_RETRIES = 3

/* ---- health check (container.json `healthUrl`) ----
 * Port-LISTEN alone can't tell "booting" from "alive but hung": a server that binds
 * then stops answering keeps the green dot forever. When a page declares healthUrl we
 * require a 2xx/3xx before reporting running, then poll every HEALTH_POLL_MS; HEALTH_FAIL_LIMIT
 * consecutive failures mean the process is hung — we kill it so the crash guard's restart
 * ladder (backoff + budget) takes over through the normal close event. */
const HEALTH_READY_TIMEOUT_MS = 20_000
const HEALTH_POLL_MS = 30_000
const HEALTH_FAIL_LIMIT = 3

/** Resolve a declared healthUrl against the page's effective port; null when unset/unparseable. */
function healthTarget(meta: PageMeta, port: number): string | null {
  const raw = (meta.healthUrl || '').trim()
  if (!raw) return null
  const filled = raw.replace(/\{port\}/g, String(port))
  if (/^https?:\/\//i.test(filled)) return filled
  try {
    return new URL(filled.startsWith('/') ? filled : `/${filled}`, `http://127.0.0.1:${port}`).toString()
  } catch {
    return null
  }
}

/** One GET; true on any 2xx/3xx. Never throws — errors/timeouts read as "not healthy". */
function probeHealth(url: string, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? httpsGet : httpGet
      const req = lib(url, { timeout: timeoutMs }, (res) => {
        res.resume() // drain so the socket can close and the next poll isn't queued behind it
        const status = res.statusCode ?? 0
        resolve(status >= 200 && status < 400)
      })
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
    } catch {
      resolve(false)
    }
  })
}

/** Poll one probe until healthy or the deadline — absorbs a few seconds of post-bind warm-up. */
async function waitHealth(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await probeHealth(url)) return true
    if (Date.now() > deadline) return false
    await new Promise((r) => setTimeout(r, 700))
  }
}

/** Pages shipped with the container (repo `pages/`) — never removable. */
export const BUILTIN_PAGE_IDS = new Set(['dsh-web', 'openclaw'])

/** Run a short-lived CLI without blocking the main-process event loop (a frozen UI otherwise). */
function runCli(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, timeout: opts.timeoutMs })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => (stdout += String(d)))
    child.stderr?.on('data', (d) => (stderr += String(d)))
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: stderr || err.message }))
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}

interface RuntimeEntry {
  meta: PageMeta
  status: PageStatus
  proc?: ChildProcessWithoutNullStreams
  pid?: number
  startedAt?: number
  exitCode?: number | null
  lastError?: string
  /** actual bound port — may differ from meta.port when discovered from output */
  resolvedPort?: number
  /** full URL announced by the app at boot (includes auth params) */
  launchUrl?: string
  logs: string[]
  /** last time a progress event was streamed for this entry (throttles log-tail spam). */
  lastProgAt?: number
  /** abnormal exits counted since the last stable run (health-guard budget). */
  crashes: number
  /** pending scheduled auto-restart after a crash; cleared by stop/start/quit. */
  restartTimer?: NodeJS.Timeout
  /** when the running-streak is long enough to refill the crash budget. */
  stableTimer?: NodeJS.Timeout
  /** epoch ms of the pending auto-restart (surfaced to the renderer). */
  nextRestartAt?: number
  /** foreign LISTENING process found when this start timed out on its port (null/undefined = none). */
  portHolder?: { pid: number; name: string } | null
  /** interval polling the declared healthUrl while running; armed/cleared by setStatus. */
  healthTimer?: NodeJS.Timeout
  /** consecutive failed health probes (a pass resets it to 0). */
  healthFails: number
  /** last health probe outcome: undefined = not yet probed, true/false = pass/fail. */
  lastHealthOk?: boolean
  /** epoch ms of the last completed health probe (pass or fail). */
  lastHealthAt?: number
  /** #18: exit-78 reclaim-retries used this run without burning the crash budget (bounded). */
  reclaimRetries?: number
}

/**
 * #18: did the child die because a dependency declared an incompatible engine (npm's
 * EBADENGINE)? Restarting can't fix an engine mismatch, so the crash guard fails fast
 * instead of burning the backoff budget. Scan the recent log tail for the marker.
 */
function detectEngineMismatch(e: RuntimeEntry): boolean {
  return e.logs.some((l) => /EBADENGINE/i.test(l))
}

export interface PagesRoot {
  /** pages/ directory (installed projects) */
  pagesDir: string
  /** project root, used for the container self-entry */
  projectDir: string
}

export function defaultStartCommand(dir: string): string {
  if (existsSync(join(dir, 'server.js'))) return 'node server.js'
  if (existsSync(join(dir, 'index.js'))) return 'node index.js'
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
    if (pkg.scripts?.start) return 'npm run start'
  } catch {
    /* no package.json */
  }
  throw new Error(msg('page.noEntryCommand'))
}

function startCommandInferable(dir: string): boolean {
  return (
    existsSync(join(dir, 'server.js')) ||
    existsSync(join(dir, 'index.js')) ||
    existsSync(join(dir, 'package.json'))
  )
}

export type PageKind = 'page' | 'dsh' | 'openclaw' | 'terminal'

/** per-kind runtime config stored in container.json */
export interface DshConfig {
  profile?: string
  port?: number
}

export interface OpenclawConfig {
  port?: number
}

/**
 * The on-disk shape of a page's `container.json`, i.e. what a project author (or an import
 * seed) writes. Its text fields are {@link LocalizableText}: a plain string serves every
 * language, an object carries the per-language variants. Everything here is resolved into
 * plain strings by `readPageMeta` before it becomes a {@link PageMeta}, so no consumer —
 * the renderer, the tray, the update checker — has to deal with locales.
 */
export interface ContainerManifest {
  name?: LocalizableText
  description?: LocalizableText
  port?: number
  startCommand?: string
  external?: boolean
  externalUrl?: string
  kind?: PageKind
  dsh?: DshConfig
  openclaw?: OpenclawConfig
  /** opt this page into the top-bar 应用 menu + generic AppManager panel */
  manageAsApp?: boolean
  /** page ids that must be running before this one starts (see startWithDeps) */
  dependsOn?: string[]
  /** health endpoint: full URL or path against the page's port; `{port}` is substituted */
  healthUrl?: string
  envVars?: Array<{
    key: string
    label?: LocalizableText
    description?: LocalizableText
    defaultPath?: string
    legacyPath?: string
    type?: string
    defaultValue?: string
  }>
  /* ---- manifest v1 additions (all optional; see pages/container.schema.json) ---- */
  /** schema this file targets; recorded, never enforced (an older page needs no bump) */
  schemaVersion?: number
  author?: string
  version?: string
  /** `data:` URL or a path relative to the page directory (png/svg/jpg/webp/ico, ≤64 KB) */
  icon?: string
  /** declared capabilities; recorded and displayed, not gated on yet */
  permissions?: string[]
}

/**
 * Every key {@link readPageMeta} understands — anything else is reported, not silently dropped.
 * `$schema` is on the list without being read: it is the editor directive that points a
 * `container.json` at `pages/container.schema.json`, so flagging it would punish exactly the
 * authors we want to opt into the schema.
 * Exported because that schema file is a hand-written mirror of this set and a test keeps them
 * from drifting apart.
 */
export const MANIFEST_KEYS = new Set([
  '$schema',
  'name',
  'description',
  'port',
  'startCommand',
  'external',
  'externalUrl',
  'kind',
  'dsh',
  'openclaw',
  'manageAsApp',
  'dependsOn',
  'healthUrl',
  'envVars',
  'schemaVersion',
  'author',
  'version',
  'icon',
  'permissions'
])

/** Capability ids the container knows about; unknown ones warn but are kept for display. */
const MANIFEST_PERMISSIONS = new Set(['notify', 'downloads', 'externalShell'])

/**
 * Cheap forward-compatibility check: an unknown key or a wrong-typed field means the author
 * typo'd or wrote for a newer container. Neither is fatal — the manifest keeps being read —
 * but both are surfaced in the page config dialog so the mistake is visible somewhere.
 */
function manifestWarnings(raw: ContainerManifest): string[] {
  const out: string[] = []
  for (const key of Object.keys(raw ?? {})) {
    if (!MANIFEST_KEYS.has(key)) out.push(msg('page.warnUnknownKey', { key }))
  }
  if (raw.port !== undefined && typeof raw.port !== 'number') {
    out.push(msg('page.warnBadType', { key: 'port', want: 'number' }))
  }
  if (raw.icon !== undefined && typeof raw.icon !== 'string') {
    out.push(msg('page.warnBadType', { key: 'icon', want: 'string' }))
  }
  if (raw.permissions !== undefined && !Array.isArray(raw.permissions)) {
    out.push(msg('page.warnBadType', { key: 'permissions', want: 'string[]' }))
  } else {
    for (const p of raw.permissions ?? []) {
      if (typeof p !== 'string' || !MANIFEST_PERMISSIONS.has(p)) {
        out.push(msg('page.warnUnknownPermission', { key: String(p) }))
      }
    }
  }
  if (Array.isArray(raw.envVars)) {
    for (const v of raw.envVars) {
      if (v?.type && v.type !== 'dir' && v.type !== 'text') {
        out.push(msg('page.warnBadType', { key: `envVars[${v.key}].type`, want: 'dir | text' }))
      }
    }
  }
  return out
}

/** Icon extensions we inline, mapped to the media type the `data:` URL needs. */
const ICON_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
}
const ICON_MAX_BYTES = 64 * 1024

/**
 * Turn a manifest `icon` (data URL or file relative to the page dir) into something the renderer
 * can put straight in `src`. Inlining in the main process keeps the renderer free of `pages/`
 * path resolution; an oversized or missing file simply yields undefined (the UI falls back to
 * its letter glyph) with a warning so the author sees why.
 */
function resolveIconUrl(dir: string, icon: unknown, warnings: string[]): string | undefined {
  const value = typeof icon === 'string' ? icon.trim() : ''
  if (!value) return undefined
  if (value.startsWith('data:')) {
    if (value.length > ICON_MAX_BYTES * 2) {
      warnings.push(msg('page.warnIconBig', { size: Math.round(value.length / 1024) }))
      return undefined
    }
    return value
  }
  const ext = value.toLowerCase().match(/\.[a-z]+$/)?.[0] || ''
  const mime = ICON_MIME[ext]
  if (!mime || value.includes('..') || /^[a-zA-Z]:[\\/]|^[\\/]/.test(value)) {
    warnings.push(msg('page.warnIconPath', { path: value }))
    return undefined
  }
  try {
    const buf = readFileSync(join(dir, value))
    if (buf.byteLength > ICON_MAX_BYTES) {
      warnings.push(msg('page.warnIconBig', { size: Math.round(buf.byteLength / 1024) }))
      return undefined
    }
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    // Unreadable (missing, locked, a directory): the warning names the path, the reason adds nothing.
    warnings.push(msg('page.warnIconMissing', { path: value }))
    return undefined
  }
}

/** Env var automatically exposed (and injected) for every plain imported page so its
    install directory is configurable from Settings without declaring container.json envVars. */
export const PAGE_DIR_ENV_KEY = 'APP_DIR'

export function readPageMeta(pagesDir: string, id: string): PageMeta {
  const dir = join(pagesDir, id)
  let raw: ContainerManifest = {}
  const metaFile = join(dir, 'container.json')
  if (existsSync(metaFile)) {
    try {
      raw = JSON.parse(readFileSync(metaFile, 'utf-8'))
    } catch (err) {
      throw new Error(msg('page.metaParseFail', { err: (err as Error).message }))
    }
  }
  const kind: PageKind =
    raw.kind === 'dsh'
      ? 'dsh'
      : raw.kind === 'openclaw'
        ? 'openclaw'
        : raw.kind === 'terminal'
          ? 'terminal'
          : 'page'
  const external = Boolean(raw.external)
  // A user port override (Settings / import form) stands in for a missing declared port,
  // so importing a project without editing its own container.json can succeed.
  const override = getSettings().pagePorts?.[id]
  let port = Number(raw.port ?? 0) || (isValidPort(override) ? Number(override) : 0)
  let startCommand = raw.startCommand || ''
  if (kind === 'dsh') {
    port = Number(raw.dsh?.port ?? raw.port ?? 5173)
    startCommand = `dsh --profile ${raw.dsh?.profile || 'web'}`
  } else if (kind === 'openclaw') {
    port = Number(raw.openclaw?.port ?? raw.port ?? OPENCLAW_DEFAULT_PORT)
    startCommand = `openclaw gateway run --force --allow-unconfigured --port ${port}`
  } else if (kind === 'terminal') {
    // CLI-only project: no HTTP port; it runs inside the embedded terminal.
    if (!startCommand) throw new Error(msg('page.metaNoStart'))
  } else if (!external && !port && !startCommand) {
    // No declared port is fine when the project has an inferable entry point —
    // the listener picks its own port then. Only a dead end (neither) is rejected.
    if (startCommandInferable(dir)) startCommand = defaultStartCommand(dir)
    else throw new Error(msg('page.metaNoPort'))
  }
  if (kind === 'page' && !external && !startCommand) startCommand = defaultStartCommand(dir)
  const declared = Array.isArray(raw.envVars) ? raw.envVars : []
  // Non-fatal container.json problems (typos, fields from a newer schema) are collected once
  // here and travel with the meta so the config dialog can show them.
  const warnings = manifestWarnings(raw)
  // Flatten the per-language fields right here: every consumer downstream of this point
  // (Settings panel, env injection, the renderer's page list) deals in plain strings only.
  const declaredSpecs = declared
    .filter((v) => Boolean(v?.key))
    .map((v) => {
      const { label, description, type, ...rest } = v
      return {
        ...rest,
        label: resolveText(label) || undefined,
        description: resolveText(description) || undefined,
        // Only the two known editor kinds survive (anything else was already warned about),
        // so the panel never renders an input for a type it doesn't implement.
        ...(type === 'text' ? { type: 'text' as const } : type === 'dir' ? { type: 'dir' as const } : {})
      }
    })
  // Auto-expose the install directory for plain pages so importing alone yields a
  // configurable env var in Settings — no container.json envVars declaration needed.
  let envVars: PageMeta['envVars'] = declaredSpecs.length ? declaredSpecs : undefined
  if (kind === 'page' && !external && !declaredSpecs.some((v) => v.key === PAGE_DIR_ENV_KEY)) {
    envVars = [
      {
        key: PAGE_DIR_ENV_KEY,
        label: msg('page.dirEnvLabel'),
        defaultPath: dir,
        description: msg('page.dirEnvDesc')
      },
      ...declaredSpecs
    ]
  }
  return {
    id,
    name: resolveText(raw.name, id),
    dir,
    port,
    containerPort: resolvePagePort(id, port),
    startCommand,
    description: resolveText(raw.description) || undefined,
    external,
    externalUrl: raw.externalUrl,
    kind,
    builtin: BUILTIN_PAGE_IDS.has(id),
    dshProfile: raw.dsh?.profile || 'web',
    // Agent runtimes live in the 应用 menu by default; imported pages opt in via
    // container.json "manageAsApp": true.
    manageAsApp: raw.manageAsApp ?? (kind === 'dsh' || kind === 'openclaw'),
    // Deps keep only non-empty strings that aren't the page itself — self-imports would
    // deadlock ensureDeps behind an ancestry check that legitimately allows siblings.
    dependsOn: Array.isArray(raw.dependsOn)
      ? raw.dependsOn
          .filter((d): d is string => typeof d === 'string' && Boolean(d.trim()) && d.trim() !== id)
          .map((d) => d.trim())
      : undefined,
    healthUrl:
      !external && typeof raw.healthUrl === 'string' && raw.healthUrl.trim()
        ? raw.healthUrl.trim()
        : undefined,
    schemaVersion: Number.isFinite(Number(raw.schemaVersion)) ? Number(raw.schemaVersion) : undefined,
    author: typeof raw.author === 'string' ? raw.author.trim() || undefined : undefined,
    version: typeof raw.version === 'string' ? raw.version.trim() || undefined : undefined,
    iconUrl: resolveIconUrl(dir, raw.icon, warnings),
    permissions: Array.isArray(raw.permissions)
      ? raw.permissions.filter((p): p is string => typeof p === 'string')
      : undefined,
    manifestWarnings: warnings.length ? warnings : undefined,
    envVars
  }
}

/**
 * Manifest warnings already reported per page, keyed by their joined text. `scanInstalledPages`
 * runs on every refresh of the page list, so without this a single typo'd field would bury the
 * timeline; re-reporting only when the set actually changes keeps one row per real problem.
 */
const reportedManifestWarnings = new Map<string, string>()

export function scanInstalledPages(pagesDir: string): PageMeta[] {
  if (!existsSync(pagesDir)) return []
  const out: PageMeta[] = []
  for (const entry of readdirSync(pagesDir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue
    const full = join(pagesDir, entry)
    try {
      if (!statSync(full).isDirectory()) continue
      const meta = readPageMeta(pagesDir, entry)
      const warnings = meta.manifestWarnings ?? []
      const signature = warnings.join('\n')
      if (reportedManifestWarnings.get(entry) !== signature) {
        // Only a change (including a fix, which clears the row) is worth a timeline entry.
        if (warnings.length) {
          reportedManifestWarnings.set(entry, signature)
          logEvent({
            level: 'warn',
            kind: 'manifest.invalid',
            pageId: entry,
            detail: signature,
            meta: { count: warnings.length }
          })
        } else {
          reportedManifestWarnings.delete(entry)
        }
      }
      out.push(meta)
    } catch (err) {
      out.push({
        id: entry,
        name: msg('page.metaInvalid', { entry }),
        dir: full,
        port: 0,
        containerPort: resolvePagePort(entry, 0),
        startCommand: '',
        description: String((err as Error).message),
        external: false
      })
    }
  }
  return out
}

export class PortNotReadyError extends Error {
  constructor(
    readonly port: number,
    timeoutMs: number
  ) {
    super(msg('page.portNotReady', { port, sec: Math.round(timeoutMs / 1000) }))
  }
}

export function waitPortReady(port: number, timeoutMs = START_TIMEOUT_MS): Promise<number> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const attempt = (): void => {
      const sock = createConnection({ host: '127.0.0.1', port }, () => {
        sock.destroy()
        resolve(port)
      })
      sock.on('error', () => {
        sock.destroy()
        if (Date.now() > deadline) {
          reject(new PortNotReadyError(port, timeoutMs))
        } else {
          setTimeout(attempt, 400)
        }
      })
    }
    attempt()
  })
}

/**
 * Parse the app's own ready line — `dsh web: http://127.0.0.1:8899/?token=…`.
 * The URL carries the auth token the server demands, so it is the only address
 * the webview can open; a bare port would land on a 401.
 */
export function parseLaunchLine(text: string): { port: number; url: string } | null {
  const m = text.match(/^\s*dsh\s+\S+:\s+(https?:\/\/\S+)/)
  if (!m) return null
  const url = m[1].trim()
  const port = Number(new URL(url).port)
  if (!Number.isFinite(port) || port < 1024 || port > 65535) return null
  return { port, url }
}

/**
 * Pull the `?token=` auth param out of a page's launch URL — the same value the webview is
 * handed, so it is guaranteed to be the one the server actually accepts.
 *
 * A stopped page yields null rather than a bogus token: `toState()` substitutes a bare
 * origin (`http://127.0.0.1:8899`) once `launchUrl` has been cleared, and a bare origin has
 * no token param to read. `URLSearchParams` decodes percent-escapes, so callers get the raw
 * token the server compares against, not the escaped form shown in an address bar.
 */
export function tokenFromLaunchUrl(url: string | undefined): string | null {
  if (!url) return null
  try {
    const token = new URL(url).searchParams.get('token')
    return token && token.trim() ? token.trim() : null
  } catch {
    return null
  }
}

/**
 * Resolve a dsh profile's runtime token from the page list — the shape behind `IPC.DshToken`.
 *
 * Matching goes by `dshProfile` rather than the `dsh-<profile>` directory name, so a page the
 * user registered under a different folder still answers. A running page always wins: its
 * `launchUrl` carries the token dsh is enforcing right now, whereas a stopped entry only
 * reports a bare origin. Kept pure (pages in, verdict out) so the branch that actually matters
 * — "no page yet" vs "page not started" — is unit-testable without booting Electron.
 */
export function resolveDshToken(pages: PageState[], profile: string): DshTokenResult {
  const wanted = profile.trim() || 'web'
  const candidates = pages.filter((p) => p.kind === 'dsh' && (p.dshProfile || 'web') === wanted)
  for (const p of candidates) {
    const token = tokenFromLaunchUrl(p.launchUrl)
    if (token && p.launchUrl) return { kind: 'ok', token, pageId: p.id, url: p.launchUrl }
  }
  return candidates.length
    ? { kind: 'stopped', pageId: candidates[0].id }
    : { kind: 'no-page', profile: wanted }
}

/**
 * dsh's web UI honors a `?theme=` launch param. Since the container only knows
 * the OS theme (nativeTheme), we pass it through when dark and omit it for
 * light — so an OS-light user sees dsh's own default (light) unchanged.
 */
function withThemeParam(url: string | undefined, kind?: PageKind): string | undefined {
  if (!url || kind !== 'dsh' || !nativeTheme.shouldUseDarkColors) return url
  try {
    const u = new URL(url)
    if (!u.searchParams.has('theme')) {
      u.searchParams.set('theme', 'dark')
      return u.toString()
    }
  } catch {
    /* leave a non-parseable URL untouched */
  }
  return url
}

/** Create a directory-typed env value before the runtime starts. Some CLIs abort on
    launch when their home dir does not exist yet, which shows up as a dead terminal
    that accepts no input. Best-effort: a failure here must not block the spawn (the
    CLI reports it itself). */
function ensureEnvDir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* read-only root or a file already there: let the CLI surface the problem */
  }
}

/** Build the per-page env extras from its declared envVars, resolving each override.
    Plain node pages only — dsh/openclaw kinds already pin their own homes. Also expands a
    leading `~` in the start command so tilde paths work without a shell. */
export function buildPageEnv(meta: PageMeta): Record<string, string> {
  const out: Record<string, string> = {}
  for (const spec of meta.envVars ?? []) {
    if (!spec?.key) continue
    if (spec.type === 'text') {
      // A free-form var: verbatim, no home dir to create. Empty everywhere in the chain means
      // the manifest declares an optional flag the user never set — omit it entirely.
      const v = resolvePageTextEnv(meta.id, spec.key, spec.defaultValue)
      if (v) out[spec.key] = v
      continue
    }
    const v = resolvePageEnv(meta.id, spec.key, spec.defaultPath, spec.legacyPath)
    if (!v) continue
    // A declared defaultPath means the var names a directory (CODEX_HOME, …); make it
    // exist so a first-launch runtime doesn't refuse to start.
    if (spec.defaultPath) ensureEnvDir(v)
    out[spec.key] = v
  }
  // The user's free-form KEY=VALUE rows win last: they are deliberate overrides, and a
  // declared dir var they clash with is exactly the case they exist for. Sanitizing lives in
  // store.ts so every consumer reads the same rule (see resolvePageCustomEnvs).
  return { ...out, ...resolvePageCustomEnvs(meta.id) }
}

export function expandStartCommand(cmd: string): string {
  return cmd.replace(/(^|\s)~(?=[/\\]|$)/g, (_m, pre: string) => pre + expandHome('~'))
}

export class PageRegistry extends EventEmitter {
  private entries = new Map<string, RuntimeEntry>()
  private quitting = false
  /**
   * Cached "is the on-demand CLI present" probe for the hosted runtimes, refreshed by
   * {@link refreshRuntimePresence} and read synchronously by {@link toState}. `loaded` is false
   * until the first probe, so an early read fails open (reports present) rather than mis-badging.
   */
  private runtimePresence = { dsh: false, openclaw: false, loaded: false }

  constructor(private root: PagesRoot) {
    super()
    this.reconcile()
  }

  /** container itself is always listed first so git-update covers it too */
  containerEntry(): PageMeta {
    return {
      id: '__container__',
      name: msg('app.title'),
      dir: this.root.projectDir,
      port: 0,
      startCommand: '',
      description: msg('page.containerDesc'),
      external: true
    }
  }

  reconcile(): PageMeta[] {
    const metas = scanInstalledPages(this.root.pagesDir)
    const alive = new Set(metas.map((m) => m.id))
    for (const id of [...this.entries.keys()]) {
      if (!alive.has(id)) {
        this.clearRestartTimers(this.entries.get(id)!)
        this.stop(id)
        this.entries.delete(id)
      }
    }
    for (const meta of metas) {
      const existing = this.entries.get(meta.id)
      if (existing) existing.meta = meta
      else
        this.entries.set(meta.id, {
          meta,
          status: 'stopped',
          logs: [],
          crashes: 0,
          healthFails: 0
        })
    }
    return metas
  }

  list(): PageState[] {
    return [...this.entries.values()].map((e) => this.toState(e))
  }

  get(id: string): PageState | undefined {
    const e = this.entries.get(id)
    return e && this.toState(e)
  }

  running(): PageState[] {
    return this.list().filter((s) => s.status === 'running')
  }

  private toState(e: RuntimeEntry): PageState {
    const port = e.resolvedPort ?? e.meta.containerPort ?? e.meta.port
    const url = e.meta.external ? e.meta.externalUrl : `http://127.0.0.1:${port}`
    return {
      ...e.meta,
      status: e.status,
      pid: e.pid,
      startedAt: e.startedAt,
      exitCode: e.exitCode,
      lastError: e.lastError,
      url,
      launchUrl: withThemeParam(e.launchUrl || url, e.meta.kind),
      runtimeMissing:
        (e.meta.kind === 'dsh' || e.meta.kind === 'openclaw') && e.status !== 'running'
          ? !this.hasRuntime(e.meta.kind)
          : undefined,
      portHolder: e.portHolder,
      crashes: e.crashes || undefined,
      nextRestartAt: e.nextRestartAt,
      // #16: only a page that declares a healthUrl has a meaningful probe outcome; others
      // leave it undefined so the panel skips the badge rather than showing a false "unknown".
      health: e.meta.healthUrl
        ? {
            status: e.lastHealthOk === undefined ? 'unknown' : e.lastHealthOk ? 'ok' : 'fail',
            fails: e.healthFails,
            lastAt: e.lastHealthAt,
            url: healthTarget(e.meta, port) ?? undefined
          }
        : undefined
    }
  }

  logs(id: string): string[] {
    return [...(this.entries.get(id)?.logs ?? [])]
  }

  async start(id: string, opts?: { fromCrashGuard?: boolean }): Promise<PageState> {
    const e = this.entries.get(id)
    if (!e) throw new Error(msg('page.unknown', { id }))
    // Read via a local so the early-return guard doesn't narrow `e.status` for the rest of
    // the method — the retry path below must re-read it as a full PageStatus after an await.
    const initialStatus: PageStatus = e.status
    if (initialStatus === 'running' || initialStatus === 'starting') return this.toState(e)
    // A manual start owns the page again: cancel any pending retry and refill the budget.
    // A guard-scheduled start must NOT reset the counter — that would make every crash
    // look like the first one and turn the backoff ladder into an endless 2s restart loop.
    if (!opts?.fromCrashGuard) {
      this.clearRestartTimers(e)
      e.crashes = 0
    }
    e.lastError = undefined
    // Orphan-reclaim is deliberately NOT on the happy path: the WMI enumeration it relies
    // on costs seconds on every start. Instead we spawn immediately, and only when the child
    // dies fast on its own (a stale harness squatting the port, or the gateway's state-dir
    // lock → exit 78) do we reclaim orphans and retry once. Pure timeouts aren't retried —
    // those mean "still booting", not "blocked by an orphan".
    try {
      return await this.startAttempt(e, id)
    } catch (err) {
      // A throw that never produced a child process — e.g. the runtime CLI is missing, so the
      // spawn spec can't even be built (`startAttempt` resolves it OUTSIDE its own try) — left
      // the row pinned at 启动中 forever: no close event ever fires to flip it, so the panel
      // spinner and the boot overlay both hang. Fail it here so the status reads honestly.
      if (e.status === 'starting') this.fail(e, (err as Error).message)
      const exitedEarly = e.exitCode !== undefined && e.exitCode !== null && e.exitCode !== 0
      const retriable = exitedEarly && (e.meta.kind === 'dsh' || e.meta.kind === 'openclaw')
      if (!retriable) throw err
      await this.reclaimOrphan(e, id)
      // A cancel (stop) during the reclaim flips status off 'starting'; don't resurrect it.
      const statusNow: PageStatus = e.status
      if (statusNow !== 'starting') return this.toState(e)
      e.logs.push(msg('page.logRetryAfterReclaim'))
      this.emitProgress(e, 'retry')
      return this.startAttempt(e, id)
    }
  }

  /** One spawn + readiness wait. `start` may call this twice (see the reclaim-on-failure retry). */
  private async startAttempt(e: RuntimeEntry, id: string): Promise<PageState> {
    if (e.meta.external) throw new Error(msg('page.externalNoStart', { name: e.meta.name }))

    const isDsh = e.meta.kind === 'dsh'
    const isOpenclaw = e.meta.kind === 'openclaw'
    const isTerminal = e.meta.kind === 'terminal'
    /** the user port override wins over container.json for every kind */
    const port = e.meta.containerPort || e.meta.port
    if (!isDsh && !isOpenclaw && !isTerminal && (!port || !e.meta.startCommand)) {
      throw new Error(msg('page.invalidConfig', { name: e.meta.name }))
    }
    if (isTerminal && !e.meta.startCommand) {
      throw new Error(msg('page.noStartCommand', { name: e.meta.name }))
    }

    this.setStatus(e, 'starting')
    e.logs = [msg('page.logStarting', { name: e.meta.name, port })]
    e.lastError = undefined
    e.exitCode = undefined
    e.resolvedPort = undefined
    e.launchUrl = undefined
    e.portHolder = null
    this.emitProgress(e, 'spawning')

    let proc: ChildProcessWithoutNullStreams
    if (isDsh) {
      // dynamic import avoids a cycle at module load (dsh.ts imports store only)
      const { dshSpawnCommand } = await import('./dsh')
      const spec = await dshSpawnCommand(e.meta.dshProfile || 'web', port)
      try {
        proc = spawn(spec.cmd, spec.args, {
          cwd: spec.cwd,
          env: { ...spec.env, ...resolvePageCustomEnvs(e.meta.id) },
          windowsHide: true,
          shell: false
        })
      } catch (err) {
        this.fail(e, msg('page.dshStartFail', { err: (err as Error).message }))
        throw new Error(e.lastError)
      }
    } else if (isOpenclaw) {
      const { openclawSpawnSpec } = await import('./openclaw')
      const spec = openclawSpawnSpec(port)
      try {
        proc = spawn(spec.cmd, spec.args, {
          cwd: spec.cwd,
          env: { ...spec.env, ...resolvePageCustomEnvs(e.meta.id) },
          windowsHide: true,
          shell: false
        })
      } catch (err) {
        this.fail(e, msg('page.openclawStartFail', { err: (err as Error).message }))
        throw new Error(e.lastError)
      }
    } else {
      // Terminal kinds are interactive CLIs that need a PTY; a detached spawn exits
      // at once without one and would masquerade as an error. They run in the
      // embedded terminal (CliTerminalView / PtyManager), never via start().
      if (isTerminal) {
        this.setStatus(e, 'stopped')
        throw new Error(msg('page.cliNeedsTerminal', { name: e.meta.name }))
      }
      const [cmd, ...args] = expandStartCommand(e.meta.startCommand).split(/\s+/)
      const executable = cmd === 'node' ? getNodeExePath() : cmd
      try {
        proc = spawn(executable, args, {
          cwd: e.meta.dir,
          env: bundledEnv({ PORT: String(port), ...buildPageEnv(e.meta) }),
          windowsHide: true,
          shell: false
        })
      } catch (err) {
        this.fail(e, msg('page.spawnFail', { err: (err as Error).message }))
        throw new Error(e.lastError)
      }
    }

    e.proc = proc
    e.pid = proc.pid
    e.startedAt = Date.now()
    proc.on('spawn', () => this.emitProgress(e, 'process'))
    proc.stdout.on('data', (d) => this.appendLog(e, d))
    proc.stderr.on('data', (d) => this.appendLog(e, d))
    proc.on('error', (err) => this.fail(e, err.message))
    proc.on('close', (code) => {
      const wasRunning = e.status === 'running'
      if (e.status === 'starting' || e.status === 'running') {
        this.setStatus(e, code === 0 || this.quitting ? 'stopped' : 'error')
        e.exitCode = code
        if (code !== 0 && !this.quitting) {
          e.lastError = msg('page.processExited', { code: code ?? '' })
          e.logs.push(`[container] ${e.lastError}`)
        }
      }
      // Health guard: only a process that had *reached running* and then died on its
      // own counts as a crash — startup failures are config problems the user retries.
      if (
        wasRunning &&
        code !== 0 &&
        !this.quitting &&
        e.meta.kind !== 'terminal' &&
        getSettings().crashAutoRestart !== false
      ) {
        // #18 tier the exit so a doomed restart doesn't burn the budget or spam the toast:
        // - EBADENGINE (dependency needs a different Node): restarting can't help — fail fast.
        // - exit 78 (EX_CONFIG / resource busy, e.g. a lost state-dir lock): reclaim the
        //   orphan and retry immediately WITHOUT consuming a crash rung.
        // - anything else: the normal backoff ladder.
        if (detectEngineMismatch(e)) {
          e.lastError = msg('page.logEngineMismatch')
          e.logs.push(`[container] ${e.lastError}`)
          console.warn(`[pages] ${e.meta.id}: EBADENGINE — not restarting (engine mismatch)`)
          logEvent({ level: 'error', kind: 'page.engineMismatch', pageId: e.meta.id })
        } else if (code === 78 && (e.reclaimRetries ?? 0) < MAX_RECLAIM_RETRIES) {
          e.reclaimRetries = (e.reclaimRetries ?? 0) + 1
          e.logs.push(`[container] ${msg('page.logReclaimRetry')}`)
          logEvent({
            level: 'warn',
            kind: 'page.reclaim',
            pageId: e.meta.id,
            meta: { attempt: e.reclaimRetries }
          })
          this.scheduleReclaimRestart(e)
        } else {
          e.crashes++
          logEvent({
            level: 'warn',
            kind: 'page.crash',
            pageId: e.meta.id,
            meta: { code: code ?? 'n/a', attempt: e.crashes }
          })
          this.scheduleCrashRestart(e, code)
        }
      }
      e.proc = undefined
      e.pid = undefined
      this.emitChanged()
    })

    try {
      this.emitProgress(e, 'port')
      const { port, url } = await this.waitReady(e, proc, isDsh, isOpenclaw, isTerminal)
      e.resolvedPort = port
      // A declared healthUrl must answer before we call the page running — a port that
      // binds but never serves is exactly the false-green this catches (see below).
      if (e.meta.healthUrl) {
        const target = healthTarget(e.meta, port)
        if (target && !(await waitHealth(target, HEALTH_READY_TIMEOUT_MS))) {
          throw new Error(msg('page.healthFail', { url: target }))
        }
        // Initial probe passed — seed the health badge so it reads green immediately
        // rather than "unknown" until the first 30s poll lands.
        e.lastHealthOk = true
        e.lastHealthAt = Date.now()
      }
      let launchUrl = url
      if (isOpenclaw) {
        // Self-pair the webview past the "gateway needs a token" screen by fetching a
        // one-time owner-bootstrap Control UI URL from the now-running gateway.
        this.emitProgress(e, 'url')
        const { resolveOpenclawLaunchUrl } = await import('./openclaw')
        launchUrl = (await resolveOpenclawLaunchUrl()) || url
      }
      e.launchUrl = launchUrl
      e.logs.push(msg('page.logReady', { port }))
      this.setStatus(e, 'running')
      // Timeline entry per successful boot — the anchor the crash rows are read against.
      logEvent({
        level: 'info',
        kind: 'page.running',
        pageId: e.meta.id,
        meta: { port, ms: e.startedAt ? Date.now() - e.startedAt : 0 }
      })
      // Refill the crash budget once the page has stayed up; re-arm per run so a page
      // that survives its first minutes isn't throttled by weeks-old crashes.
      clearTimeout(e.stableTimer)
      e.stableTimer = setTimeout(() => {
        e.stableTimer = undefined
        if (e.status === 'running') {
          e.crashes = 0
          e.reclaimRetries = 0
        }
      }, STABLE_RESET_MS)
      e.stableTimer.unref?.()
      this.emitProgress(e, 'ready')
      this.emitChanged()
      return this.toState(e)
    } catch (err) {
      let failure = err as Error
      // Port never came up AND a process we don't track owns it: name the holder (pid +
      // image) and stash it on the state so the panel can offer a kill-and-retry instead
      // of a bare timeout the user can't act on. Our own just-died child doesn't count.
      if (failure instanceof PortNotReadyError) {
        const holder = await findPortHolder(failure.port)
        if (holder && holder.pid !== e.pid) {
          e.portHolder = holder
          logEvent({
            level: 'warn',
            kind: 'page.portBusy',
            pageId: e.meta.id,
            detail: `${holder.name} (${holder.pid})`,
            meta: { port: failure.port }
          })
          failure = new Error(
            msg('page.portOwner', { port: failure.port, pid: holder.pid, name: holder.name })
          )
        }
      }
      this.fail(e, failure.message)
      if (e.proc) this.stop(id)
      throw failure
    }
  }

  /** Dispatch orphan reclaim by kind, so `start` doesn't import both code paths. */
  private async reclaimOrphan(e: RuntimeEntry, selfId: string): Promise<void> {
    if (e.meta.kind === 'dsh') await this.reclaimOrphanDsh(e.meta.dshProfile || 'web', selfId)
    else if (e.meta.kind === 'openclaw') await this.reclaimOrphanOpenclaw(selfId)
  }

  /** Stream a startup phase + log tail to the renderer's boot overlay. */
  private emitProgress(e: RuntimeEntry, phase: PageProgress['phase']): void {
    if (phase === 'log') {
      // Throttle the pure-log-tail refresh; phase transitions always pass through.
      const now = Date.now()
      if (e.lastProgAt && now - e.lastProgAt < 250) return
      e.lastProgAt = now
    }
    this.emit('progress', {
      pageId: e.meta.id,
      phase,
      logs: e.logs.slice(-12)
    } satisfies PageProgress)
  }

  /** plain pages: poll the effective port; dsh: also parse the app's own ready line for the bound URL;
      terminal kinds: ready as soon as the process is alive (no HTTP surface to wait for). */
  private waitReady(
    e: RuntimeEntry,
    proc: ChildProcessWithoutNullStreams,
    isDsh: boolean,
    isOpenclaw = false,
    isTerminal = false
  ): Promise<{ port: number; url?: string }> {
    if (isTerminal) return Promise.resolve({ port: 0 })
    const timeoutMs = isOpenclaw
      ? OPENCLAW_READY_TIMEOUT_MS
      : isDsh
        ? DSH_READY_TIMEOUT_MS
        : START_TIMEOUT_MS
    const wantPort = e.meta.containerPort || e.meta.port
    if (!isDsh) {
      // Fail the moment the child exits non-zero (a gateway lock / EADDRINUSE) instead of
      // polling the dead port to the deadline — this is what makes reclaim-on-failure fast.
      return new Promise<{ port: number }>((resolve, reject) => {
        const onClose = (code: number | null): void => {
          // A non-zero exit always fails. For a foreground openclaw gateway, *any* exit
          // (incl. a clean/cancelled one) means it will never bind — fail fast either way.
          if (code || isOpenclaw) reject(new Error(msg('page.processExited', { code: code ?? '' })))
        }
        proc.once('close', onClose)
        waitPortReady(wantPort, timeoutMs).then(
          (port) => {
            proc.off('close', onClose)
            resolve({ port })
          },
          (err: Error) => {
            proc.off('close', onClose)
            reject(err)
          }
        )
      })
    }
    const deadline = Date.now() + timeoutMs
    return new Promise((resolve, reject) => {
      /**
       * dsh requires the token in its launch URL, and the port can come up *before* the
       * ready line reaches us. Whichever branch wins the race must therefore hand back the
       * announcement if we ever saw one — otherwise the webview lands on a bare origin and 401s.
       */
      let announced: { port: number; url: string } | null = null
      const failWith = (err: Error): void => reject(err)
      const onExit = (code: number | null): void => {
        if (code) {
          cleanup()
          failWith(new Error(msg('page.processExited', { code })))
        }
      }
      const onChunk = (chunk: unknown): void => {
        for (const line of String(chunk).split(/\r?\n/)) {
          const found = parseLaunchLine(line)
          if (!found) continue
          announced = found
          cleanup()
          waitPortReady(found.port, Math.max(2000, deadline - Date.now())).then(
            () => resolve({ port: found.port, url: found.url }),
            failWith
          )
          return
        }
      }
      const timer = setInterval(() => {
        if (Date.now() > deadline) {
          cleanup()
          failWith(
            new Error(
              msg('page.dshProfileNotReady', {
                sec: Math.round(timeoutMs / 1000),
                port: wantPort
              })
            )
          )
        }
      }, 5000)
      const cleanup = (): void => {
        clearInterval(timer)
        proc.stdout.off('data', onChunk)
        proc.off('close', onExit)
      }
      proc.stdout.on('data', onChunk)
      proc.once('close', onExit)
      // fallback: the declared port may come up without a parsable announcement
      waitPortReady(wantPort, timeoutMs).then(
        (port) =>
          setTimeout(() => {
            cleanup()
            resolve({ port, url: announced?.url })
          }, ANNOUNCE_GRACE_MS),
        failWith
      )
    })
  }

  stop(id: string): void {
    const e = this.entries.get(id)
    if (!e) return
    // An explicit stop owns the page again: drop any scheduled crash-retry so a
    // stopped page stays stopped even when the guard had a retry queued.
    this.clearRestartTimers(e)
    if (!e?.proc) return
    const proc = e.proc
    e.logs.push(msg('page.logStopping'))
    // mark intentional kill so the close handler doesn't flip to 'error'
    e.exitCode = undefined
    if (process.platform === 'win32') {
      // kill the whole tree so npm/node grandchildren die with it
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true })
    } else {
      proc.kill('SIGTERM')
    }
    e.proc = undefined
    e.pid = undefined
    this.setStatus(e, 'stopped')
    this.emitChanged()
  }

  /** Like `stop` but resolves once the child's exit callback has fired — on Windows the
      taskkill tree-kill is async, so callers that delete/reuse the cwd need this signal. */
  stopAndWait(id: string, timeoutMs = 8000): Promise<void> {
    const e = this.entries.get(id)
    const proc = e?.proc
    if (!proc) return Promise.resolve()
    this.stop(id)
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(done, timeoutMs)
      proc.once('close', done)
    })
  }

  /** Kill leftover bundled-node openclaw gateways this registry no longer tracks (dev hot-reload
      orphans holding the state-dir ownership lock → exit 78). Best-effort; never throws. */
  private async reclaimOrphanOpenclaw(selfId: string): Promise<void> {
    const tracked = new Set<number>()
    for (const [id, e] of this.entries) {
      if (id !== selfId && e.meta.kind === 'openclaw' && e.proc?.pid) tracked.add(e.proc.pid)
    }
    try {
      const victims: number[] = []
      if (process.platform === 'win32') {
        const ps =
          "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { $_.ProcessId.ToString() + '|' + $_.CommandLine }"
        const res = await runCli('powershell.exe', ['-NoProfile', '-Command', ps], {
          timeoutMs: 15_000
        })
        for (const line of res.stdout.split(/\r?\n/)) {
          const bar = line.indexOf('|')
          if (bar < 0) continue
          const pid = Number(line.slice(0, bar))
          const cmd = line.slice(bar + 1)
          if (!Number.isFinite(pid) || pid <= 0) continue
          if (/openclaw[/\\]+openclaw\.mjs/.test(cmd) && !tracked.has(pid)) victims.push(pid)
        }
        for (const pid of victims) {
          spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
        }
      } else {
        const res = await runCli('pgrep', ['-f', 'openclaw/openclaw.mjs'], { timeoutMs: 15_000 })
        for (const tok of res.stdout.split(/\r?\n/)) {
          const pid = Number(tok.trim())
          if (Number.isFinite(pid) && pid > 0 && !tracked.has(pid)) victims.push(pid)
        }
        for (const pid of victims) {
          try {
            process.kill(pid, 'SIGTERM')
          } catch {
            /* already gone */
          }
        }
      }
      if (victims.length) {
        console.warn(
          `[pages] reclaimed ${victims.length} orphan openclaw gateway(s): ${victims.join(', ')}`
        )
        await new Promise((r) => setTimeout(r, 700))
      }
    } catch (err) {
      console.warn('[pages] openclaw orphan reclaim failed (ignored):', (err as Error).message)
    }
  }

  /** Kill dsh harnesses this registry no longer tracks (dev-reload orphans or a manually
      launched `dsh --profile <p>`) before spawning our own — two harnesses on one profile
      break terminal session ownership. Best-effort; never throws. */
  private async reclaimOrphanDsh(profile: string, selfId: string): Promise<void> {
    const tracked = new Set<number>()
    for (const [id, e] of this.entries) {
      if (
        id !== selfId &&
        e.meta.kind === 'dsh' &&
        (e.meta.dshProfile || 'web') === profile &&
        e.proc?.pid
      ) {
        tracked.add(e.proc.pid)
      }
    }
    try {
      const victims: number[] = []
      // harness forms: ".../lib/bin.js --profile web ..." (container) or ".../lib/bin.js web"
      // (manual CLI). Subcommand forwarders like "bin.js plugin --profile web ..." must NOT match.
      const esc = profile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const harnessRe = new RegExp(`bin\\.js (?:--profile ${esc}(?:\\s|$)|${esc}(?:\\s|$))`, 'i')
      if (process.platform === 'win32') {
        const ps =
          "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { $_.ProcessId.ToString() + '|' + $_.CommandLine }"
        const res = await runCli('powershell.exe', ['-NoProfile', '-Command', ps], {
          timeoutMs: 15_000
        })
        for (const line of res.stdout.split(/\r?\n/)) {
          const bar = line.indexOf('|')
          if (bar < 0) continue
          const pid = Number(line.slice(0, bar))
          const cmd = line.slice(bar + 1)
          if (!Number.isFinite(pid) || pid <= 0) continue
          if (harnessRe.test(cmd) && !tracked.has(pid)) victims.push(pid)
        }
        for (const pid of victims) {
          spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
        }
      } else {
        const res = await runCli('pgrep', ['-f', `bin.js --profile ${profile}`], {
          timeoutMs: 15_000
        })
        for (const tok of res.stdout.split(/\r?\n/)) {
          const pid = Number(tok.trim())
          if (Number.isFinite(pid) && pid > 0 && !tracked.has(pid)) victims.push(pid)
        }
        for (const pid of victims) {
          try {
            process.kill(pid, 'SIGTERM')
          } catch {
            /* already gone */
          }
        }
      }
      if (victims.length) {
        console.warn(
          `[pages] reclaimed ${victims.length} orphan dsh harness(es) on profile "${profile}": ${victims.join(', ')}`
        )
        await new Promise((r) => setTimeout(r, 700))
      }
    } catch (err) {
      console.warn('[pages] dsh orphan reclaim failed (ignored):', (err as Error).message)
    }
  }

  async restart(id: string): Promise<PageState> {
    // Await the real exit: taskkill is async, and starting while the old harness still lives
    // would leave two owners on the same profile (terminal sessions then fail).
    await this.stopAndWait(id)
    return this.start(id)
  }

  /** Start a page after everything it `dependsOn` is up. The deps chain is walked depth-first
   *  with an ancestry trail, so a cycle in user-authored container.jsons surfaces as an error
   *  naming the loop instead of two pages waitLooping on each other. */
  async startWithDeps(id: string): Promise<PageState> {
    await this.ensureDeps(id, [])
    return this.start(id)
  }

  async restartWithDeps(id: string): Promise<PageState> {
    await this.stopAndWait(id)
    return this.startWithDeps(id)
  }

  /** Recursively make every declared dep `running` (starting it if stopped), before the
   *  dependent is allowed to spawn. Deps that aren't known pages are ignored — an imported
   *  project may declare a dep on an optional builtin the user never installed. */
  private async ensureDeps(id: string, ancestry: string[]): Promise<void> {
    const e = this.entries.get(id)
    const deps = e?.meta.dependsOn ?? []
    if (!deps.length) return
    if (ancestry.includes(id)) {
      throw new Error(msg('page.depsCycle', { chain: [...ancestry, id].join(' → ') }))
    }
    for (const dep of deps) {
      const d = this.entries.get(dep)
      // Unknown, external, and terminal-kind deps can't be started by us — skip them.
      if (!d || d.meta.external || d.meta.kind === 'terminal') continue
      if (d.status === 'running') continue
      if (d.status === 'starting') {
        await this.waitDepReady(dep)
        continue
      }
      try {
        await this.ensureDeps(dep, [...ancestry, id])
        await this.start(dep)
      } catch (err) {
        throw new Error(msg('page.depsFail', { dep, err: (err as Error).message }))
      }
    }
  }

  /** Wait for a dep that's already mid-boot (someone else called start) to settle.
   *  No cycle re-check here: the dep is in flight, this method never spawns anything, so
   *  the worst case is the boot timeout firing — a plain depsFail, not a deadlock. */
  private waitDepReady(id: string): Promise<void> {
    const deadline = Date.now() + DSH_READY_TIMEOUT_MS
    return new Promise((resolve, reject) => {
      const tick = (): void => {
        const d = this.entries.get(id)
        if (!d) return resolve()
        if (d.status === 'running') return resolve()
        if (d.status !== 'starting') {
          return reject(new Error(msg('page.depsFail', { dep: id, err: d.lastError || d.status })))
        }
        if (Date.now() > deadline) {
          return reject(new Error(msg('page.depsFail', { dep: id, err: 'timeout' })))
        }
        setTimeout(tick, 400)
      }
      tick()
    })
  }

  /**
   * Re-run the two on-demand CLI presence probes (pure `existsSync` over candidate paths) and
   * cache them for {@link toState}. The slim installer ships neither dsh nor openclaw — both are
   * provisioned into userData on demand — so a hosted page whose runtime is absent can never
   * start. Caching keeps that verdict on `PageState` (a synchronous read), so the list badges,
   * the switcher and the default-view restore share one race-free source instead of each awaiting
   * the async status IPC and guessing around an "unknown" window. Dynamic imports keep the module
   * graph as lean as `startAttempt` already has.
   */
  async refreshRuntimePresence(): Promise<void> {
    const [{ isDshInstalled }, { isOpenclawInstalled }] = await Promise.all([
      import('./dsh'),
      import('./openclaw')
    ])
    this.runtimePresence.dsh = isDshInstalled()
    this.runtimePresence.openclaw = isOpenclawInstalled()
    this.runtimePresence.loaded = true
  }

  /** Sync read of the last probe. Non-hosted kinds are never gated; an unwarmed cache reports
   *  "present" so callers fail open (attempt the start) rather than block on unknown. */
  private hasRuntime(kind?: PageKind): boolean {
    if (kind !== 'dsh' && kind !== 'openclaw') return true
    if (!this.runtimePresence.loaded) return true
    return kind === 'dsh' ? this.runtimePresence.dsh : this.runtimePresence.openclaw
  }

  /** auto-start configured pages; failures are logged, never thrown.
      Terminal-kind pages run in the embedded terminal and are opened by the renderer,
      so they are skipped here to avoid a spurious "run in terminal" error. Unknown ids
      (a retired builtin still listed in persisted settings) are skipped silently. */
  async autoStart(ids: string[]): Promise<void> {
    // Fresh probe before the spawn loop: a missing runtime is skipped below, and the same cache
    // backs `toState`'s `runtimeMissing`, so warming here keeps the skip decision and the badge
    // the renderer draws in lockstep. Best-effort — on probe failure `hasRuntime` fails open.
    await this.refreshRuntimePresence().catch(() => undefined)
    // Concurrent: each page boots its own child, so serializing just stacks their
    // (already slow) first-boot latencies. start() is self-guarding against a duplicate
    // in-flight call, and per-page failures are logged rather than aborting the batch.
    await Promise.all(
      ids.map(async (id): Promise<void> => {
        const entry = this.entries.get(id)
        if (!entry || entry.meta.kind === 'terminal') return
        // Skip quietly: the Pages list and the switcher already badge 未安装 and route the
        // user to the install guide, so a spawn attempt adds noise without informing anyone.
        if (!this.hasRuntime(entry.meta.kind)) {
          console.log(`[pages] auto-start ${id} skipped: ${entry.meta.kind} runtime not installed`)
          return
        }
        try {
          await this.startWithDeps(id)
        } catch (err) {
          console.warn(`[pages] auto-start ${id} failed:`, (err as Error).message)
        }
      })
    )
  }

  /** Stop every tracked page and resolve once all children have actually exited (or
   * their per-process timeouts fired). On Windows the taskkill tree-kill is async, so
   * quit paths that don't await this can orphan grandchildren on slow machines. */
  async shutdownAll(): Promise<void> {
    this.quitting = true
    await Promise.all([...this.entries.keys()].map((id) => this.stopAndWait(id)))
  }

  private setStatus(e: RuntimeEntry, status: PageStatus): void {
    e.status = status
    // The health watchdog only makes sense against a live, running server; every other
    // transition (including 'starting' on a restart) disarms it and resets the fail streak.
    if (status === 'running') this.startHealthMonitor(e)
    else this.stopHealthMonitor(e)
    this.emitChanged()
  }

  /** Periodically probe the declared healthUrl while running. Consecutive failures past
   *  HEALTH_FAIL_LIMIT mean "bound but hung" — kill the child so the crash guard's normal
   *  close-event path (backoff + budget) restarts it instead of us inventing a second path. */
  private startHealthMonitor(e: RuntimeEntry): void {
    this.stopHealthMonitor(e)
    if (!e.meta.healthUrl) return
    const probe = (): void => {
      if (e.status !== 'running' || !e.proc || this.quitting) return
      const target = healthTarget(e.meta, e.resolvedPort ?? e.meta.containerPort ?? e.meta.port)
      if (!target) return
      void probeHealth(target).then((alive) => {
        // Re-check after the async probe — a stop/restart may have landed meanwhile.
        if (e.status !== 'running' || !e.proc) return
        e.lastHealthAt = Date.now()
        if (alive) {
          e.lastHealthOk = true
          e.healthFails = 0
          return
        }
        e.lastHealthOk = false
        e.healthFails++
        if (e.healthFails < HEALTH_FAIL_LIMIT) {
          this.emitChanged()
          return
        }
        e.healthFails = 0
        e.logs.push(`[container] ${msg('page.logHealthKill', { n: HEALTH_FAIL_LIMIT })}`)
        console.warn(`[pages] ${e.meta.id}: ${HEALTH_FAIL_LIMIT} failed health probes — restarting`)
        logEvent({
          level: 'warn',
          kind: 'page.hung',
          pageId: e.meta.id,
          meta: { n: HEALTH_FAIL_LIMIT, url: target }
        })
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(e.proc.pid), '/T', '/F'], { windowsHide: true })
        } else {
          e.proc.kill('SIGTERM')
        }
      })
    }
    // Probe once shortly after going green (so the badge isn't stuck on "unknown" for a
    // full poll interval), then settle into the steady 30s cadence.
    setTimeout(probe, 1500).unref?.()
    e.healthTimer = setInterval(probe, HEALTH_POLL_MS)
    e.healthTimer.unref?.()
  }

  private stopHealthMonitor(e: RuntimeEntry): void {
    if (e.healthTimer) clearInterval(e.healthTimer)
    e.healthTimer = undefined
    e.healthFails = 0
    e.lastHealthOk = undefined
    e.lastHealthAt = undefined
  }

  /** Cancel the guard's pending auto-restart / budget-refill timers for one entry. */
  private clearRestartTimers(e: RuntimeEntry): void {
    if (e.restartTimer) clearTimeout(e.restartTimer)
    if (e.stableTimer) clearTimeout(e.stableTimer)
    e.restartTimer = undefined
    e.stableTimer = undefined
    e.nextRestartAt = undefined
  }

  /**
   * One backoff rung of the crash health-guard. `crashes` is already incremented by the
   * caller; when the budget is spent the entry just stays in 'error' with a lastError
   * that says so — the user keeps the restart/logs affordances, we stop spawning.
   */
  private scheduleCrashRestart(e: RuntimeEntry, code: number | null): void {
    this.clearRestartTimers(e)
    const max = CRASH_RETRY_DELAYS_MS.length
    if (e.crashes > max) {
      e.crashes = max
      e.lastError = msg('page.crashGiveUp', { max })
      e.logs.push(`[container] ${e.lastError}`)
      console.warn(`[pages] ${e.meta.id}: crash budget spent (${max}), auto-restart stopped`)
      logEvent({ level: 'error', kind: 'page.giveUp', pageId: e.meta.id, meta: { max } })
      // A tray-resident app misses this silently — the page just sits red. Ping the
      // notification center so the user knows the guard stopped before they check.
      notifyEvent('notify.giveUpTitle', 'notify.giveUpBody', {
        name: e.meta.name,
        max
      })
      return
    }
    const delay = CRASH_RETRY_DELAYS_MS[e.crashes - 1]
    const line = msg('page.logCrashRestart', {
      code: code ?? '',
      sec: Math.round(delay / 1000),
      n: e.crashes,
      max
    })
    e.logs.push(`[container] ${line}`)
    e.nextRestartAt = Date.now() + delay
    console.warn(`[pages] ${e.meta.id} crashed (code=${code}) — ${line}`)
    e.restartTimer = setTimeout(() => {
      e.restartTimer = undefined
      e.nextRestartAt = undefined
      if (this.quitting || e.proc) return
      this.start(e.meta.id, { fromCrashGuard: true }).catch((err) => {
        // A failed retry already flipped the entry to 'error'; the next close event
        // schedules the next rung, so nothing extra to do but keep it off the console.
        console.warn(`[pages] crash-restart ${e.meta.id} failed:`, (err as Error).message)
      })
    }, delay)
    e.restartTimer.unref?.()
  }

  /**
   * #18: exit-78 (resource busy) reclaim-and-retry. Mirrors scheduleCrashRestart's shape
   * but does NOT consume the crash budget — it reclaims the orphan holding the resource and
   * restarts on the shortest rung. Bounded by MAX_RECLAIM_RETRIES (checked by the caller) so
   * a page that keeps hitting 78 can't hot-loop; once the cap is spent the caller falls back
   * to the normal budgeted ladder.
   */
  private scheduleReclaimRestart(e: RuntimeEntry): void {
    this.clearRestartTimers(e)
    const delay = CRASH_RETRY_DELAYS_MS[0]
    e.nextRestartAt = Date.now() + delay
    this.emitChanged()
    e.restartTimer = setTimeout(() => {
      e.restartTimer = undefined
      e.nextRestartAt = undefined
      if (this.quitting || e.proc) return
      void this.reclaimOrphan(e, e.meta.id)
        .catch((err) => console.warn(`[pages] ${e.meta.id} reclaim failed:`, (err as Error).message))
        .finally(() => {
          if (this.quitting || e.proc) return
          this.start(e.meta.id, { fromCrashGuard: true }).catch((err) => {
            console.warn(`[pages] reclaim-restart ${e.meta.id} failed:`, (err as Error).message)
          })
        })
    }, delay)
    e.restartTimer.unref?.()
  }

  private fail(e: RuntimeEntry, message: string): void {
    e.lastError = message
    e.logs.push(`[container] ${message}`)
    logEvent({ level: 'error', kind: 'page.failed', pageId: e.meta.id, detail: message })
    this.setStatus(e, 'error')
  }

  private appendLog(e: RuntimeEntry, chunk: unknown): void {
    const text = String(chunk)
    // Mirror the child's raw output to userData/logs/pages/<id>.log — the in-memory
    // ring buffer is only the last 1000 lines and dies with the main process.
    logPageLine(e.meta.id, text)
    let added = false
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue
      e.logs.push(line)
      added = true
      if (e.logs.length > LOG_LIMIT) e.logs.shift()
    }
    // Surface live output while booting so the overlay shows progress, not a frozen spinner.
    if (added && e.status === 'starting') this.emitProgress(e, 'log')
  }

  /** Ask every listener to re-read state. Out-of-band callers (e.g. a language change, which
      changes the strings resolved out of container.json) use this; `reconcile()` first if the
      manifests themselves need re-reading. */
  emitChanged(): void {
    this.emit('changed')
  }
}
