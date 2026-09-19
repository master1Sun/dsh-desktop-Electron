import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { resolveOpenclawHome, resolvePagesDir } from './store'
import { getNodeExePath, bundledEnv } from './node-runtime'
import { OPENCLAW_DEFAULT_PORT } from '../shared/types'

/** Run a CLI without blocking the main-process event loop (a frozen UI otherwise). */
function runCli(
  cmd: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: opts.env,
      windowsHide: true,
      shell: false,
      timeout: opts.timeoutMs
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => (stdout += String(d)))
    child.stderr?.on('data', (d) => (stderr += String(d)))
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: stderr || err.message }))
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}

export interface OpenclawStatus {
  installed: boolean
  version?: string
  binPath?: string
  home: string
  port: number
  error?: string
}

/** Candidate locations for openclaw's real CLI entry (`openclaw.mjs`) inside the bundled install. */
function openclawEntryCandidates(): string[] {
  // Mirror node-runtime's discovery: packaged copies resources/openclaw ->
  // <resourcesPath>/openclaw, but in dev `process.resourcesPath` points at
  // electron's own dist/resources (no openclaw), so also probe the project dir.
  const roots = [
    join(process.resourcesPath || '', 'openclaw'),
    join(app.getAppPath(), 'resources', 'openclaw'),
    join(process.cwd(), 'resources', 'openclaw')
  ].filter(Boolean)
  const entries = ['node_modules', join('lib', 'node_modules')]
  const out: string[] = []
  for (const root of roots)
    for (const e of entries) out.push(join(root, e, 'openclaw', 'openclaw.mjs'))
  return out
}

/**
 * Resolve the openclaw entry as [nodeExe, script]. We always launch it with the
 * bundled Node (openclaw needs >=24.16) rather than npm's `.cmd` shim, which
 * falls back to whatever `node.exe` is first on PATH — that could be an older
 * system node. No shell, so paths with spaces are safe.
 */
function resolveOpenclawCommand(): { cmd: string; script: string } | null {
  const script = openclawEntryCandidates().find((p) => existsSync(p))
  if (!script) return null
  return { cmd: getNodeExePath(), script }
}

/** env with the openclaw config home pointed at the resolved location. */
function openclawEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return bundledEnv({ OPENCLAW_STATE_DIR: resolveOpenclawHome(), ...extra })
}

/** Sync version read for the update table — the async CLI probe can't run there. */
export function openclawVersion(): string | undefined {
  const roots = [
    join(process.resourcesPath || '', 'openclaw'),
    join(app.getAppPath(), 'resources', 'openclaw'),
    join(process.cwd(), 'resources', 'openclaw')
  ].filter(Boolean)
  for (const root of roots)
    for (const e of ['node_modules', join('lib', 'node_modules')]) {
      try {
        return (
          JSON.parse(readFileSync(join(root, e, 'openclaw', 'package.json'), 'utf-8')).version ??
          undefined
        )
      } catch {
        /* try next candidate */
      }
    }
  return undefined
}

export async function getOpenclawStatus(): Promise<OpenclawStatus> {
  const home = resolveOpenclawHome()
  const base: OpenclawStatus = { installed: false, home, port: OPENCLAW_DEFAULT_PORT }
  const resolved = resolveOpenclawCommand()
  if (!resolved)
    return {
      ...base,
      error: '未找到 openclaw CLI，请先运行 npm run setup:openclaw（或全局安装 openclaw@latest）'
    }
  try {
    const res = await runCli(resolved.cmd, [resolved.script, '--version'], {
      env: openclawEnv(),
      timeoutMs: 30_000
    })
    const out = res.stdout.trim()
    if (res.code !== 0)
      return {
        ...base,
        binPath: resolved.script,
        error: res.stderr.slice(-500) || `openclaw --version 退出码 ${res.code}`
      }
    return {
      ...base,
      installed: true,
      binPath: resolved.script,
      version: out.replace(/^v/, '') || undefined
    }
  } catch (err) {
    return {
      ...base,
      binPath: resolved.script,
      error: `openclaw 不可用：${(err as Error).message}`
    }
  }
}

/** register the managed gateway as a pages/<id> entry by writing container.json (no file copying). */
export function createOpenclawPage(port = OPENCLAW_DEFAULT_PORT): string {
  const p = Number(port) > 0 ? Number(port) : OPENCLAW_DEFAULT_PORT
  const id = 'openclaw'
  const dir = join(resolvePagesDir(), id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'container.json'),
    JSON.stringify(
      {
        name: 'OpenClaw Gateway',
        description:
          '由容器管理的 openclaw gateway（自带最新版），主界面内嵌打开 Control UI；配置在 ~/.openclaw',
        kind: 'openclaw',
        openclaw: { port: p }
      },
      null,
      2
    )
  )
  return id
}

/** ensure the default page exists once per install so "自带 openclaw" is visible without manual steps. */
export function ensureDefaultOpenclawPage(): void {
  const metaFile = join(resolvePagesDir(), 'openclaw', 'container.json')
  if (existsSync(metaFile)) return
  try {
    createOpenclawPage(OPENCLAW_DEFAULT_PORT)
  } catch {
    /* best-effort; a writable pages/ dir may be absent in odd setups */
  }
}

/**
 * Spawn spec for pages.ts when kind=openclaw: run the bundled openclaw entry's
 * `gateway` subcommand on the given port under the bundled Node. The Control UI
 * then serves on http://127.0.0.1:<port>. Auth may be required — see README.
 */
export function openclawSpawnSpec(port: number): {
  cmd: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
} {
  const resolved = resolveOpenclawCommand()
  if (!resolved) throw new Error('未找到 openclaw CLI，请先运行 npm run setup:openclaw')
  const home = resolveOpenclawHome()
  mkdirSync(home, { recursive: true })
  const p = Number(port) > 0 ? Number(port) : OPENCLAW_DEFAULT_PORT
  ensureOpenclawConfig(home, p)
  return {
    cmd: resolved.cmd,
    // `gateway` is a command group; the foreground runner is `gateway run`. Bare
    // `gateway --port` only prints help and never binds. --force clears any stale
    // listener on the port so a restart doesn't hang waiting on the old process.
    // --allow-unconfigured is a safety net: even if ensureOpenclawConfig's seed write
    // fails (AV/permission/home mismatch), openclaw won't exit 78 on "Missing config".
    args: [
      resolved.script,
      'gateway',
      'run',
      '--force',
      '--allow-unconfigured',
      '--port',
      String(p)
    ],
    cwd: home,
    env: openclawEnv()
  }
}

/**
 * Ask the running gateway for a Control UI URL that carries a short-lived, one-time
 * owner-bootstrap token in its fragment (`openclaw dashboard --json`). Opening it in
 * the webview lets the signed browser self-pair to a durable admin device credential,
 * so the embedded page skips the "this gateway needs a token" screen. Returns null on
 * any failure — callers then fall back to the plain (token-gated) URL.
 */
export async function resolveOpenclawLaunchUrl(): Promise<string | null> {
  const resolved = resolveOpenclawCommand()
  if (!resolved) return null
  try {
    const res = await runCli(resolved.cmd, [resolved.script, 'dashboard', '--json'], {
      env: openclawEnv(),
      timeoutMs: 30_000
    })
    const out = res.stdout
    const obj = JSON.parse(out.slice(out.indexOf('{'))) as {
      ok?: boolean
      browserUrl?: string
      url?: string
    }
    return obj.ok && obj.browserUrl ? obj.browserUrl : null
  } catch {
    return null
  }
}

/**
 * Reveal the gateway's shared auth token so the UI can show/copy it (the Control UI's
 * one-time bootstrap link expires in ~10min, so a durable token is handy as a fallback).
 * Mirrors openclaw's own precedence (`gateway.auth.token` config-first → `OPENCLAW_GATEWAY_TOKEN`
 * env) without shelling out to `openclaw gateway auth-token --show`, which refuses to print
 * outside an interactive TTY. Returns null when no token is configured yet (a fresh gateway
 * only persists one after its first boot).
 */
export function getOpenclawGatewayToken(): { token: string; source: 'config' | 'env' } | null {
  const envToken = (process.env.OPENCLAW_GATEWAY_TOKEN || '').trim()
  const cfgPath =
    (process.env.OPENCLAW_CONFIG_PATH || '').trim() || join(resolveOpenclawHome(), 'openclaw.json')
  let configToken = ''
  try {
    if (existsSync(cfgPath)) {
      const parsed = JSON.parse(readFileSync(cfgPath, 'utf-8')) as {
        gateway?: { auth?: { token?: unknown } }
      }
      const t = parsed?.gateway?.auth?.token
      if (typeof t === 'string') configToken = t.trim()
    }
  } catch {
    /* Non-strict (JSON5) user config or unreadable — fall back to env token below. */
  }
  // Config-first, matching resolveGatewayAuth({ tokenPrecedence: 'config-first' }).
  if (configToken) return { token: configToken, source: 'config' }
  if (envToken) return { token: envToken, source: 'env' }
  return null
}

/**
 * openclaw refuses to start a gateway with no config ("Missing config. Run
 * `openclaw setup` or set gateway.mode=local"). For out-of-the-box hosting we
 * seed a minimal local-mode config only when none exists — never overwriting a
 * user's own file. Auth stays on (openclaw generates a runtime token), so the
 * Control UI root still serves; channel/model setup remains the user's call via
 * `openclaw onboard`.
 */
function ensureOpenclawConfig(home: string, port: number): void {
  const cfgPath = join(home, 'openclaw.json')
  if (existsSync(cfgPath)) return
  try {
    writeFileSync(cfgPath, JSON.stringify({ gateway: { mode: 'local', port } }, null, 2) + '\n')
  } catch {
    /* best-effort; a read-only home surfaces as a gateway boot error instead */
  }
}
