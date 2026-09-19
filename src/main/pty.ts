import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as os from 'node:os'
import * as pty from 'node-pty'
import { getNodeExePath } from './node-runtime'
import { pnpmBinDirs } from './dsh'

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
    like `codex` ship as `codex.cmd` next to the *system* node dir, which the bundled-node
    prepend can otherwise shadow out of PATH. */
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

/** Prepend the bundled node + pnpm bin so an interactive shell resolves them first. */
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

function defaultShell(): { shell: string; args: string[] } {
  // Windows PowerShell always ships and reads the startup PATH cleanly via ConPTY.
  if (process.platform === 'win32') return { shell: 'powershell.exe', args: ['-NoLogo'] }
  return { shell: process.env.SHELL || '/bin/bash', args: ['-l'] }
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
      With `run`, the session executes that command line instead of an interactive shell. */
  async start(cwd: string, title: string, run?: RunCommandSpec): Promise<PtySessionInfo> {
    const id = `pty-${Date.now().toString(36)}-${++counter}`
    let shell: string
    let args: string[]
    let env = await terminalEnv()
    if (run?.command.trim()) {
      const [cmd, ...rest] = expandTilde(run.command.trim()).split(/\s+/)
      env = { ...env, ...(run.env || {}) }
      shell = cmd === 'node' ? getNodeExePath() : (whichOnPath(cmd, env) ?? cmd)
      args = rest
    } else {
      ;({ shell, args } = defaultShell())
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
