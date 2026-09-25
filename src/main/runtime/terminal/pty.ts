import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import * as os from 'node:os'
import * as pty from 'node-pty'
import { getNodeExePath } from '../cli/node-runtime'
import { splitCommandArgs, quoteForCreateProcess, isJsLauncher } from './command-line'
import { pnpmBinDirs } from '../cli/dsh'
import { m } from '../../shell/i18n'
import type { PtyShellInfo } from '../../../shared/types'

export interface PtySessionInfo {
  id: string
  title: string
  cwd: string
}

/** A command line to run as the session's process instead of an interactive shell. */
export interface RunCommandSpec {
  command: string
  env?: Record<string, string>
}

/** One live shell. Emits `data` (bytes to render) and `exit` (process code). */
export class PtySession {
  readonly proc: pty.IPty
  private emitter = new EventEmitter()

  constructor(
    readonly id: string,
    readonly title: string,
    readonly cwd: string,
    shell: string,
    args: string[],
    env: NodeJS.ProcessEnv
  ) {
    this.proc = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: existsSync(cwd) ? cwd : os.homedir(),
      env: env as Record<string, string>,
      ...WINPTY_BACKEND
    })
    this.proc.onData((chunk) => this.emitter.emit('data', chunk))
    this.proc.onExit(({ exitCode }) => this.emitter.emit('exit', exitCode ?? 0))
  }

  on(event: 'data' | 'exit', cb: (payload: string | number) => void): () => void {
    this.emitter.on(event, cb)
    return () => this.emitter.off(event, cb)
  }

  write(data: string): void {
    try {
      this.proc.write(data)
    } catch {
      /* process already exited */
    }
  }

  resize(cols: number, rows: number): void {
    if (cols <= 0 || rows <= 0) return
    try {
      this.proc.resize(cols, rows)
    } catch {
      /* process already exited */
    }
  }

  kill(): void {
    try {
      this.proc.kill()
    } catch {
      /* already gone */
    }
  }
}

/** Expand a leading `~` in each whitespace-separated token so tilde paths work without a shell. */
export function expandTilde(cmd: string): string {
  return cmd.replace(/(^|\s)~(?=[/\\]|$)/g, (_m, pre: string) => pre + os.homedir())
}

/** Resolve a bare command against a PATH (Windows: honoring PATHEXT). npm-global CLIs
    ship as `.cmd` shims next to the *system* node dir, which the bundled-node prepend
    can otherwise shadow out of PATH. */
function whichOnPath(cmd: string, env: NodeJS.ProcessEnv): string | null {
  if (cmd.includes('/') || cmd.includes('\\')) return null
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH'
  const exts =
    process.platform === 'win32'
      ? (env.PATHEXT || '.CMD;.EXE;.BAT;.COM').split(';').map((e) => e.toLowerCase())
      : ['']
  for (const dir of (env[pathKey] || '').split(process.platform === 'win32' ? ';' : ':')) {
    if (!dir) continue
    for (const ext of exts) {
      const candidate = join(dir, cmd + ext)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

/** Prepend the bundled node + pnpm bins so an interactive shell resolves them first. */
async function terminalEnv(): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = { ...process.env, TERM: 'xterm-256color' }
  let nodeDir = ''
  try {
    nodeDir = dirname(getNodeExePath())
  } catch {
    nodeDir = dirname(process.execPath)
  }
  const dirs = [nodeDir, ...(await pnpmBinDirs())].filter(Boolean) as string[]
  if (dirs.length) {
    const sep = process.platform === 'win32' ? ';' : ':'
    const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH'
    env[key] = [...dirs, env[key] || ''].join(sep)
  }
  return env
}

/* ---- shell registry: what the picker offers + how to launch each ----
   Detection is cheap (a handful of existsSync/PATH probes) and memoized: installed shells don't
   change while the app runs. Probing is best-effort — a shell we can't find simply isn't offered,
   so a missing Git Bash / WSL never surfaces as a broken terminal entry. */
let shellCache: PtyShellInfo[] | null = null

function detectShells(): PtyShellInfo[] {
  if (shellCache) return shellCache
  const out: PtyShellInfo[] = []
  if (process.platform === 'win32') {
    const sysRoot = process.env.SystemRoot || 'C:\\Windows'
    // PowerShell 5.1 and cmd.exe always ship with Windows.
    out.push({ id: 'powershell', label: 'PowerShell', path: 'powershell.exe', args: ['-NoLogo'] })
    out.push({ id: 'cmd', label: 'Command Prompt', path: 'cmd.exe', args: [] })
    const pwsh = whichOnPath('pwsh.exe', process.env)
    if (pwsh) out.push({ id: 'pwsh', label: 'PowerShell 7', path: pwsh, args: ['-NoLogo'] })
    // Git Bash: probe the usual install roots, then fall back to deriving from git.exe's location
    // (<Git>\cmd\git.exe -> <Git>\bin\bash.exe).
    const bases = [
      process.env['ProgramFiles'],
      process.env['ProgramFiles(x86)'],
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs') : ''
    ].filter(Boolean) as string[]
    let bash = ''
    for (const base of bases) {
      const c = join(base, 'Git', 'bin', 'bash.exe')
      if (existsSync(c)) {
        bash = c
        break
      }
    }
    if (!bash) {
      const git = whichOnPath('git.exe', process.env)
      if (git) {
        const c = join(dirname(dirname(dirname(git))), 'bin', 'bash.exe')
        if (existsSync(c)) bash = c
      }
    }
    if (bash) out.push({ id: 'gitbash', label: 'Git Bash', path: bash, args: ['-l'] })
    const wsl = join(sysRoot, 'System32', 'wsl.exe')
    if (existsSync(wsl)) out.push({ id: 'wsl', label: 'Ubuntu (WSL)', path: wsl, args: [] })
  } else {
    const seen = new Set<string>()
    const add = (id: string, label: string, path: string | undefined): void => {
      if (path && existsSync(path) && !seen.has(path)) {
        seen.add(path)
        out.push({ id, label, path, args: ['-l'] })
      }
    }
    const shell = process.env.SHELL
    add('login', shell ? basename(shell) : 'Shell', shell)
    add('bash', 'bash', '/bin/bash')
    add('zsh', 'zsh', '/bin/zsh')
  }
  shellCache = out
  return out
}

/** The id used when the renderer doesn't pick one: PowerShell on Windows, the login shell else. */
function defaultShellId(): string {
  if (process.platform === 'win32') return 'powershell'
  return detectShells().some((s) => s.id === 'login') ? 'login' : 'bash'
}

/** Available shells for the picker, the default one first. */
export function listShells(): PtyShellInfo[] {
  const def = defaultShellId()
  return [...detectShells()].sort((a, b) => (a.id === def ? -1 : b.id === def ? 1 : 0))
}

/** Resolve a picker id (or the default) to a launch command; an unknown id falls back to default. */
function resolveShell(id?: string): { shell: string; args: string[] } {
  const list = detectShells()
  const hit =
    (id && list.find((s) => s.id === id)) ||
    list.find((s) => s.id === defaultShellId()) ||
    list[0]
  return hit
    ? { shell: hit.path, args: hit.args }
    : { shell: 'powershell.exe', args: ['-NoLogo'] }
}

let counter = 0
const sessions = new Map<string, PtySession>()

// On this machine node-pty's default ConPTY backend deadlocks the Electron main
// process inside its synchronous native connect() — the whole window freezes and
// not even an uncaughtException log fires (the event loop is stuck). Forcing the
// legacy winpty backend avoids that path; node-pty already ships winpty.dll +
// winpty-agent.exe in its prebuilds, so no extra binary is required.
const WINPTY_BACKEND: { useConpty?: false } =
  process.platform === 'win32' ? { useConpty: false } : {}

/** Registry of embedded shells shared by every window. */
export class PtyManager {
  /** Start a shell rooted at `cwd`, titled `title`; returns its session descriptor.
      With `run`, the session executes that command line instead of an interactive shell; else it
      launches the picker's `shell` id (or the default when unset). */
  async start(
    cwd: string,
    title: string,
    opts?: { run?: RunCommandSpec; shell?: string }
  ): Promise<PtySessionInfo> {
    const id = `pty-${Date.now().toString(36)}-${++counter}`
    let shell: string
    let args: string[]
    let env = await terminalEnv()
    const run = opts?.run
    if (run?.command.trim()) {
      // Quote-aware split: a capability page launches `node "<entry path>"`, and a bare
      // whitespace split would hand node the quotes as part of the filename (MODULE_NOT_FOUND).
      let [cmd, ...rest] = splitCommandArgs(expandTilde(run.command.trim()))
      env = { ...env, ...(run.env || {}) }
      // Stale-manifest guard: an older importer wrote `node "<entry>"` even for a native binary
      // (claude-code's bin/claude.exe), which node can't load — ERR_UNKNOWN_FILE_EXTENSION, now a
      // bare code=1. When the single "script" arg isn't a JS module, drop node and exec the binary
      // directly. Scoped to the exact `node "<one non-js path>"` shape so `node --flag x.js` etc.
      // are never touched.
      if (cmd === 'node' && rest.length === 1 && !rest[0].startsWith('-') && !isJsLauncher(rest[0])) {
        cmd = rest[0]
        rest = []
      }
      shell = cmd === 'node' ? getNodeExePath() : (whichOnPath(cmd, env) ?? cmd)
      // Re-quote spaced args: node-pty joins them into a CreateProcess command line unquoted.
      args = quoteForCreateProcess(rest)
      // node-pty hands the command straight to CreateProcess, which needs a real
      // file: a bare name (or a PATH miss) fails with "CreateProcess failed" and
      // surfaces as a dead terminal. Say which command is missing instead.
      if (cmd !== 'node' && !existsSync(shell)) {
        throw new Error(m('pty.commandNotFound', { cmd }))
      }
    } else {
      ;({ shell, args } = resolveShell(opts?.shell))
    }
    const session = new PtySession(id, title, cwd, shell, args, env)
    session.on('exit', () => sessions.delete(id))
    sessions.set(id, session)
    return { id, title, cwd: session.cwd }
  }

  get(id: string): PtySession | undefined {
    return sessions.get(id)
  }

  write(id: string, data: string): void {
    sessions.get(id)?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    sessions.get(id)?.resize(cols, rows)
  }

  kill(id: string): void {
    const s = sessions.get(id)
    if (!s) return
    s.kill()
    sessions.delete(id)
  }

  killAll(): void {
    for (const s of [...sessions.values()]) s.kill()
    sessions.clear()
  }
}
