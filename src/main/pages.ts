import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createConnection } from 'node:net'
import { nativeTheme } from 'electron'
import { getNodeExePath, bundledEnv } from './node-runtime'
import { resolvePageEnv, resolvePagePort, expandHome, isValidPort, getSettings } from './store'
import {
  OPENCLAW_DEFAULT_PORT,
  type PageMeta,
  type PageState,
  type PageStatus
} from '../shared/types'

const LOG_LIMIT = 200
const START_TIMEOUT_MS = Number(process.env.DSH_PAGE_START_TIMEOUT_MS || 30_000)
/** openclaw's first boot self-installs provider plugins + runs state migrations, so it can take ~30s+ to bind; give it generous headroom. */
const OPENCLAW_READY_TIMEOUT_MS = Number(process.env.DSH_OPENCLAW_READY_TIMEOUT_MS || 120_000)
/** How long the declared-port fallback waits for dsh's token-bearing ready line before launching without it. */
const ANNOUNCE_GRACE_MS = 1500

/** Pages shipped with the container (ensure-pages.mjs / repo `pages/`) — never removable. */
export const BUILTIN_PAGE_IDS = new Set(['dsh-web', 'codex', 'openclaw', 'dsh-plugin-market'])

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
  throw new Error(`无法推断启动命令：目录缺少 server.js / index.js / package.json(start script)`)
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

/** Env var automatically exposed (and injected) for every plain imported page so its
    install directory is configurable from Settings without declaring container.json envVars. */
export const PAGE_DIR_ENV_KEY = 'APP_DIR'

export function readPageMeta(pagesDir: string, id: string): PageMeta {
  const dir = join(pagesDir, id)
  let raw: Partial<PageMeta> & {
    port?: number
    startCommand?: string
    kind?: PageKind
    dsh?: DshConfig
    openclaw?: OpenclawConfig
  } = {}
  const metaFile = join(dir, 'container.json')
  if (existsSync(metaFile)) {
    try {
      raw = JSON.parse(readFileSync(metaFile, 'utf-8'))
    } catch (err) {
      throw new Error(`container.json 解析失败: ${(err as Error).message}`)
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
    if (!startCommand) throw new Error(`container.json 缺少 startCommand（terminal 类型必填）`)
  } else if (!external && !port && !startCommand) {
    // No declared port is fine when the project has an inferable entry point —
    // the listener picks its own port then. Only a dead end (neither) is rejected.
    if (startCommandInferable(dir)) startCommand = defaultStartCommand(dir)
    else
      throw new Error(
        `container.json 缺少 port（或设置 external=true / kind=terminal，或项目自带可推断的启动入口）`
      )
  }
  if (kind === 'page' && !external && !startCommand) startCommand = defaultStartCommand(dir)
  const declared = Array.isArray(raw.envVars) ? raw.envVars : []
  // Auto-expose the install directory for plain pages so importing alone yields a
  // configurable env var in Settings — no container.json envVars declaration needed.
  let envVars: PageMeta['envVars'] = declared.length ? declared : undefined
  if (kind === 'page' && !external && !declared.some((v) => v?.key === PAGE_DIR_ENV_KEY)) {
    envVars = [
      {
        key: PAGE_DIR_ENV_KEY,
        label: '页面目录',
        defaultPath: dir,
        description: '自动生成的应用安装目录，以环境变量注入该页面子进程。留空即用导入时的目录。'
      },
      ...declared
    ]
  }
  return {
    id,
    name: raw.name || id,
    dir,
    port,
    containerPort: resolvePagePort(id, port),
    startCommand,
    description: raw.description,
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
        name: `${entry} (配置无效)`,
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
          reject(new Error(`端口 ${port} 在 ${Math.round(timeoutMs / 1000)}s 内未就绪`))
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

/** Build the per-page env extras from its declared envVars, resolving each override.
    Plain node pages only — dsh/openclaw kinds already pin their own homes. Also expands a
    leading `~` in the start command so tilde paths work without a shell. */
export function buildPageEnv(meta: PageMeta): Record<string, string> {
  const out: Record<string, string> = {}
  for (const spec of meta.envVars ?? []) {
    if (!spec?.key) continue
    const v = resolvePageEnv(meta.id, spec.key, spec.defaultPath)
    if (v) out[spec.key] = v
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
      name: 'Desktop Container',
      dir: this.root.projectDir,
      port: 0,
      startCommand: '',
      description: '容器主程序（git 更新检测对象）',
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
    if (!e) throw new Error(`未知 page: ${id}`)
    if (e.status === 'running' || e.status === 'starting') return this.toState(e)
    if (e.meta.external) throw new Error(`${e.meta.name} 是外部地址项目，无需启动进程`)

    const isDsh = e.meta.kind === 'dsh'
    const isOpenclaw = e.meta.kind === 'openclaw'
    const isTerminal = e.meta.kind === 'terminal'
    /** the user port override wins over container.json for every kind */
    const port = e.meta.containerPort || e.meta.port
    if (!isDsh && !isOpenclaw && !isTerminal && (!port || !e.meta.startCommand)) {
      throw new Error(`${e.meta.name} 配置无效，无法启动（请先设置端口）`)
    }
    if (isTerminal && !e.meta.startCommand) {
      throw new Error(`${e.meta.name} 缺少启动命令，无法在终端中运行`)
    }

    this.setStatus(e, 'starting')
    e.logs = []
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
        this.fail(e, `dsh 启动失败: ${(err as Error).message}`)
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
        this.fail(e, `openclaw 启动失败: ${(err as Error).message}`)
        throw new Error(e.lastError)
      }
    } else {
      // Terminal kinds are interactive CLIs (codex…) that need a PTY; a detached
      // spawn exits at once without one and would masquerade as an error. They run
      // in the embedded terminal (CliTerminalView / PtyManager), never via start().
      if (isTerminal) {
        this.setStatus(e, 'stopped')
        throw new Error(`${e.meta.name} 是命令行项目，请点击「终端」在内置终端中运行`)
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
        this.fail(e, `spawn 失败: ${(err as Error).message}`)
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
        if (code !== 0 && !this.quitting) e.lastError = `进程退出，code=${code}`
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
              `dsh profile 在 ${Math.round(START_TIMEOUT_MS / 1000)}s 内未就绪（端口 ${wantPort}）`
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
      Terminal-kind pages (e.g. codex) run in the embedded terminal and are opened by the
      renderer, so they are skipped here to avoid a spurious "run in terminal" error. */
  async autoStart(ids: string[]): Promise<void> {
    for (const id of ids) {
      const entry = this.entries.get(id)
      if (entry?.meta.kind === 'terminal') continue
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

  private emitChanged(): void {
    this.emit('changed')
  }
}
