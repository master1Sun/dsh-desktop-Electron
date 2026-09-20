import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createConnection } from 'node:net'
import { nativeTheme } from 'electron'
import { getNodeExePath, bundledEnv } from './node-runtime'
import { resolvePageEnv, resolvePagePort, expandHome, isValidPort, getSettings } from './store'
// aliased: `m` is already a local identifier in this file (regex match / map callback)
import { m as msg, resolveText } from './i18n'
import {
  OPENCLAW_DEFAULT_PORT,
  type DshTokenResult,
  type LocalizableText,
  type PageMeta,
  type PageState,
  type PageStatus
} from '../shared/types'

const LOG_LIMIT = 1000
const START_TIMEOUT_MS = Number(process.env.DSH_PAGE_START_TIMEOUT_MS || 30_000)
/** openclaw's first boot self-installs provider plugins + runs state migrations, so it can take ~30s+ to bind; give it generous headroom. */
const OPENCLAW_READY_TIMEOUT_MS = Number(process.env.DSH_OPENCLAW_READY_TIMEOUT_MS || 120_000)
/** How long the declared-port fallback waits for dsh's token-bearing ready line before launching without it. */
const ANNOUNCE_GRACE_MS = 1500

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
  envVars?: Array<{
    key: string
    label?: LocalizableText
    description?: LocalizableText
    defaultPath?: string
    legacyPath?: string
  }>
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
  // Flatten the per-language fields right here: every consumer downstream of this point
  // (Settings panel, env injection, the renderer's page list) deals in plain strings only.
  const declaredSpecs = declared
    .filter((v) => Boolean(v?.key))
    .map((v) => {
      const { label, description, ...rest } = v
      return {
        ...rest,
        label: resolveText(label) || undefined,
        description: resolveText(description) || undefined
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
    envVars
  }
}

export function scanInstalledPages(pagesDir: string): PageMeta[] {
  if (!existsSync(pagesDir)) return []
  const out: PageMeta[] = []
  for (const entry of readdirSync(pagesDir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue
    const full = join(pagesDir, entry)
    try {
      if (!statSync(full).isDirectory()) continue
      out.push(readPageMeta(pagesDir, entry))
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
          reject(new Error(msg('page.portNotReady', { port, sec: Math.round(timeoutMs / 1000) })))
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
    const v = resolvePageEnv(meta.id, spec.key, spec.defaultPath, spec.legacyPath)
    if (!v) continue
    // A declared defaultPath means the var names a directory (CODEX_HOME, …); make it
    // exist so a first-launch runtime doesn't refuse to start.
    if (spec.defaultPath) ensureEnvDir(v)
    out[spec.key] = v
  }
  return out
}

export function expandStartCommand(cmd: string): string {
  return cmd.replace(/(^|\s)~(?=[/\\]|$)/g, (_m, pre: string) => pre + expandHome('~'))
}

export class PageRegistry extends EventEmitter {
  private entries = new Map<string, RuntimeEntry>()
  private quitting = false

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
        this.stop(id)
        this.entries.delete(id)
      }
    }
    for (const meta of metas) {
      const existing = this.entries.get(meta.id)
      if (existing) existing.meta = meta
      else this.entries.set(meta.id, { meta, status: 'stopped', logs: [] })
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
      launchUrl: withThemeParam(e.launchUrl || url, e.meta.kind)
    }
  }

  logs(id: string): string[] {
    return [...(this.entries.get(id)?.logs ?? [])]
  }

  async start(id: string): Promise<PageState> {
    const e = this.entries.get(id)
    if (!e) throw new Error(msg('page.unknown', { id }))
    if (e.status === 'running' || e.status === 'starting') return this.toState(e)
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

    let proc: ChildProcessWithoutNullStreams
    if (isDsh) {
      // dynamic import avoids a cycle at module load (dsh.ts imports store only)
      const { dshSpawnCommand } = await import('./dsh')
      // A second live harness on the same --profile splits terminal-session and plugin-store
      // ownership (sessions report "already owned by an active write handle"). Reclaim orphans first.
      await this.reclaimOrphanDsh(e.meta.dshProfile || 'web', id)
      const spec = await dshSpawnCommand(e.meta.dshProfile || 'web', port)
      try {
        proc = spawn(spec.cmd, spec.args, {
          cwd: spec.cwd,
          env: spec.env,
          windowsHide: true,
          shell: false
        })
      } catch (err) {
        this.fail(e, msg('page.dshStartFail', { err: (err as Error).message }))
        throw new Error(e.lastError)
      }
    } else if (isOpenclaw) {
      const { openclawSpawnSpec } = await import('./openclaw')
      // A prior gateway we no longer track (dev reload/orphan) holds the state-dir ownership
      // lock → a fresh `gateway run` exits 78. Reclaim it first so start always succeeds.
      await this.reclaimOrphanOpenclaw(id)
      const spec = openclawSpawnSpec(port)
      try {
        proc = spawn(spec.cmd, spec.args, {
          cwd: spec.cwd,
          env: spec.env,
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
    proc.stdout.on('data', (d) => this.appendLog(e, d))
    proc.stderr.on('data', (d) => this.appendLog(e, d))
    proc.on('error', (err) => this.fail(e, err.message))
    proc.on('close', (code) => {
      if (e.status === 'starting' || e.status === 'running') {
        this.setStatus(e, code === 0 || this.quitting ? 'stopped' : 'error')
        e.exitCode = code
        if (code !== 0 && !this.quitting) {
          e.lastError = msg('page.processExited', { code: code ?? '' })
          e.logs.push(`[container] ${e.lastError}`)
        }
      }
      e.proc = undefined
      e.pid = undefined
      this.emitChanged()
    })

    try {
      const { port, url } = await this.waitReady(e, proc, isDsh, isOpenclaw, isTerminal)
      e.resolvedPort = port
      let launchUrl = url
      if (isOpenclaw) {
        // Self-pair the webview past the "gateway needs a token" screen by fetching a
        // one-time owner-bootstrap Control UI URL from the now-running gateway.
        const { resolveOpenclawLaunchUrl } = await import('./openclaw')
        launchUrl = (await resolveOpenclawLaunchUrl()) || url
      }
      e.launchUrl = launchUrl
      e.logs.push(msg('page.logReady', { port }))
      this.setStatus(e, 'running')
      this.emitChanged()
      return this.toState(e)
    } catch (err) {
      this.fail(e, (err as Error).message)
      if (e.proc) this.stop(id)
      throw new Error(e.lastError)
    }
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
    const timeoutMs = isOpenclaw ? OPENCLAW_READY_TIMEOUT_MS : START_TIMEOUT_MS
    const wantPort = e.meta.containerPort || e.meta.port
    if (!isDsh) return waitPortReady(wantPort, timeoutMs).then((port) => ({ port }))
    const deadline = Date.now() + timeoutMs
    return new Promise((resolve, reject) => {
      /**
       * dsh requires the token in its launch URL, and the port can come up *before* the
       * ready line reaches us. Whichever branch wins the race must therefore hand back the
       * announcement if we ever saw one — otherwise the webview lands on a bare origin and 401s.
       */
      let announced: { port: number; url: string } | null = null
      const failWith = (err: Error): void => reject(err)
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
                sec: Math.round(START_TIMEOUT_MS / 1000),
                port: wantPort
              })
            )
          )
        }
      }, 5000)
      const cleanup = (): void => {
        clearInterval(timer)
        proc.stdout.off('data', onChunk)
      }
      proc.stdout.on('data', onChunk)
      // fallback: the declared port may come up without a parsable announcement
      waitPortReady(wantPort, START_TIMEOUT_MS).then(
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

  /** auto-start configured pages; failures are logged, never thrown.
      Terminal-kind pages run in the embedded terminal and are opened by the renderer,
      so they are skipped here to avoid a spurious "run in terminal" error. Unknown ids
      (a retired builtin still listed in persisted settings) are skipped silently. */
  async autoStart(ids: string[]): Promise<void> {
    for (const id of ids) {
      const entry = this.entries.get(id)
      if (!entry) continue
      if (entry.meta.kind === 'terminal') continue
      try {
        await this.start(id)
      } catch (err) {
        console.warn(`[pages] auto-start ${id} failed:`, (err as Error).message)
      }
    }
  }

  shutdownAll(): void {
    this.quitting = true
    for (const id of [...this.entries.keys()]) this.stop(id)
  }

  private setStatus(e: RuntimeEntry, status: PageStatus): void {
    e.status = status
    this.emitChanged()
  }

  private fail(e: RuntimeEntry, message: string): void {
    e.lastError = message
    e.logs.push(`[container] ${message}`)
    this.setStatus(e, 'error')
  }

  private appendLog(e: RuntimeEntry, chunk: unknown): void {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue
      e.logs.push(line)
      if (e.logs.length > LOG_LIMIT) e.logs.shift()
    }
  }

  /** Ask every listener to re-read state. Out-of-band callers (e.g. a language change, which
      changes the strings resolved out of container.json) use this; `reconcile()` first if the
      manifests themselves need re-reading. */
  emitChanged(): void {
    this.emit('changed')
  }
}
