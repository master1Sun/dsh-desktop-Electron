import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { app } from 'electron'
import {
  getSettings,
  resolveOpenclawHome,
  resolvePagesDir,
  setDefaultView,
  updateSettings
} from './store'
import { getNodeExePath, bundledEnv } from './node-runtime'
import type { ContainerManifest } from './pages'
import { m, msgIn } from './i18n'
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
      error: m('openclaw.cliMissing')
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
        error: res.stderr.slice(-500) || m('openclaw.versionFail', { code: res.code })
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
      error: m('openclaw.unavailable', { err: (err as Error).message })
    }
  }
}

/**
 * Env vars declared by the managed gateway page. Older builds wrote the meta without
 * them, so the "环境目录" input for openclaw never appeared — ensureDefaultOpenclawPage
 * backfills this list into an existing container.json.
 *
 * Both languages are emitted so the labels follow the UI language; a single-language
 * snapshot would have frozen whichever language was active when the file was written.
 * A function, not a constant: the strings are produced per write, and module init runs
 * before the locale source is registered.
 */
function openclawEnvVars(): NonNullable<ContainerManifest['envVars']> {
  return [
    {
      key: 'OPENCLAW_HOME',
      label: {
        zh: msgIn('zh', 'openclaw.homeLabel'),
        en: msgIn('en', 'openclaw.homeLabel')
      },
      defaultPath: '~/.openclaw',
      description: {
        zh: msgIn('zh', 'openclaw.homeDesc'),
        en: msgIn('en', 'openclaw.homeDesc')
      }
    }
  ]
}

/** register the managed gateway as a pages/<id> entry by writing container.json (no file copying). */
export function createOpenclawPage(port = OPENCLAW_DEFAULT_PORT): string {
  const p = Number(port) > 0 ? Number(port) : OPENCLAW_DEFAULT_PORT
  const id = 'openclaw'
  const dir = join(resolvePagesDir(), id)
  mkdirSync(dir, { recursive: true })
  const manifest: ContainerManifest = {
    name: 'OpenClaw Gateway',
    description: {
      zh: msgIn('zh', 'openclaw.pageDesc'),
      en: msgIn('en', 'openclaw.pageDesc')
    },
    kind: 'openclaw',
    openclaw: { port: p },
    envVars: openclawEnvVars()
  }
  writeFileSync(join(dir, 'container.json'), JSON.stringify(manifest, null, 2))
  return id
}

/** ensure the default page exists once per install so "自带 openclaw" is visible without manual steps. */
export function ensureDefaultOpenclawPage(): void {
  const metaFile = join(resolvePagesDir(), 'openclaw', 'container.json')
  if (existsSync(metaFile)) {
    // Backfill: metas written before envVars existed hide the openclaw 环境目录 input;
    // metas with the old {envRoot} default also need refreshing (home now defaults to ~/.openclaw).
    try {
      const raw = JSON.parse(readFileSync(metaFile, 'utf-8')) as Record<string, unknown>
      const vars = Array.isArray(raw.envVars)
        ? (raw.envVars as Array<Record<string, unknown>>)
        : []
      const stale =
        !vars.length ||
        vars.some((v) => v?.key === 'OPENCLAW_HOME' && v?.defaultPath === '{envRoot}/openclaw')
      if (stale) {
        writeFileSync(metaFile, JSON.stringify({ ...raw, envVars: openclawEnvVars() }, null, 2))
      }
    } catch {
      /* unreadable meta: leave the user's file untouched */
    }
    return
  }
  try {
    createOpenclawPage(OPENCLAW_DEFAULT_PORT)
  } catch {
    /* best-effort; a writable pages/ dir may be absent in odd setups */
  }
}

/**
 * Seed the remaining builtin pages (dsh-web) so they exist before the registry scans.
 * Packaged builds copy from resources/pages into the writable userData/pages (installs
 * survive updates); dev reads/writes the repo's pages/ directly and only recreates a
 * deleted builtin dir from itself. openclaw is seeded by ensureDefaultOpenclawPage.
 */
export function ensureBuiltinPages(): void {
  removeLegacyBuiltinPages()
  const destRoot = resolvePagesDir()
  // Packaged builds seed from the bundled resources (userData survives updates);
  // dev reads/writes the repo's pages/ directly — a missing builtin still gets seeded.
  const srcRoot = app.isPackaged ? join(process.resourcesPath || '', 'pages') : destRoot
  for (const id of ['dsh-web']) {
    const src = join(srcRoot, id)
    const dest = join(destRoot, id)
    if (!existsSync(src)) continue
    if (existsSync(join(dest, 'container.json'))) continue
    try {
      mkdirSync(dest, { recursive: true })
      cpSync(src, dest, { recursive: true })
    } catch {
      /* best-effort: a missing builtin page simply won't appear until manually added */
    }
  }
  // A persisted default view / auto-start pointing at a page that no longer exists would
  // leave the shell on an empty market screen with no hint — drop the dead references.
  try {
    const s = getSettings()
    const alive = (pageId: string): boolean => existsSync(join(destRoot, pageId, 'container.json'))
    const dv = s.defaultView
    if (dv.kind === 'page' && !alive(dv.pageId)) setDefaultView({ kind: 'none' })
    const freshAuto = s.autoStartPages.filter(alive)
    if (freshAuto.length !== s.autoStartPages.length) updateSettings({ autoStartPages: freshAuto })
  } catch {
    /* settings cleanup is best-effort */
  }
}

/**
 * Builtin pages retired from the container: the codex CLI page and the plugin-market
 * server page (the market is now a renderer built-in view, MarketView.vue). Upgrades
 * may still carry their dirs plus persisted settings references — remove the dirs and
 * drop the stale settings so they don't linger as broken rows. Best-effort, never throws.
 */
function removeLegacyBuiltinPages(): void {
  const retired = ['codex', 'dsh-plugin-market']
  for (const id of retired) {
    const dir = join(resolvePagesDir(), id)
    if (!existsSync(dir)) continue
    try {
      rmSync(dir, { recursive: true, force: true })
      console.log(`[pages] removed retired builtin page: ${id}`)
    } catch (err) {
      console.warn(`[pages] failed to remove retired builtin ${id}:`, (err as Error).message)
    }
  }
  try {
    const s = getSettings()
    const dv = s.defaultView
    const staleAutoStart = s.autoStartPages.some((id) => retired.includes(id))
    const staleDefault = dv.kind === 'page' && retired.includes(dv.pageId)
    if (staleAutoStart)
      updateSettings({ autoStartPages: s.autoStartPages.filter((id) => !retired.includes(id)) })
    if (staleDefault) setDefaultView({ kind: 'none' })
  } catch {
    /* settings cleanup is best-effort */
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
  if (!resolved) throw new Error(m('openclaw.cliMissingShort'))
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
 * Path to the gateway config the container manages. Mirrors openclaw's own precedence
 * (`OPENCLAW_CONFIG_PATH` env → `<home>/openclaw.json`) so a token we write lands exactly
 * where `getOpenclawGatewayToken` (and the running gateway) will read it back.
 */
function openclawConfigPath(): string {
  return (
    (process.env.OPENCLAW_CONFIG_PATH || '').trim() ||
    join(resolveOpenclawHome(), 'openclaw.json')
  )
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
  const cfgPath = openclawConfigPath()
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
 * One-click token bootstrap. openclaw ships no CLI to *mint* a gateway token
 * (`gateway auth-token` only reveals an existing one, and a fresh local-mode gateway leaves
 * `gateway.auth` empty), so the panel could never show a durable credential and the Control
 * UI had nothing to authenticate the embedded page with. This generates a strong shared token
 * and merges it into openclaw.json under `gateway.auth.token` — never clobbering unrelated
 * keys (mode, port, channels, models). Writing the config is enough for `getOpenclawGatewayToken`
 * to reveal it immediately; a caller restarts a *running* gateway so it enforces the new value.
 *
 * Idempotent: with a token already present and `rotate` false it returns the existing one
 * untouched. `rotate` mints a fresh token and overwrites the old.
 */
export function initializeOpenclawToken(
  rotate = false
): { token: string; created: boolean } {
  const cfgPath = openclawConfigPath()
  let cfg: Record<string, unknown> = {}
  if (existsSync(cfgPath)) {
    try {
      const parsed = JSON.parse(readFileSync(cfgPath, 'utf-8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        cfg = parsed as Record<string, unknown>
      }
    } catch (err) {
      // Never overwrite a config we can't understand (e.g. JSON5/comments) — surface it instead.
      throw new Error(m('openclaw.configUnreadable', { path: cfgPath, err: (err as Error).message }))
    }
  }
  const gateway = (cfg.gateway && typeof cfg.gateway === 'object'
    ? cfg.gateway
    : {}) as Record<string, unknown>
  const auth = (gateway.auth && typeof gateway.auth === 'object'
    ? gateway.auth
    : {}) as Record<string, unknown>
  const existing = typeof auth.token === 'string' ? auth.token.trim() : ''
  if (existing && !rotate) return { token: existing, created: false }
  const token = randomBytes(32).toString('base64url')
  auth.token = token
  gateway.auth = auth
  // A gateway with no config at all still needs local mode to boot; leave an existing
  // mode/port untouched (they are already on `gateway` when present).
  if (!('mode' in gateway)) gateway.mode = 'local'
  cfg.gateway = gateway
  try {
    mkdirSync(dirname(cfgPath), { recursive: true })
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n')
  } catch (err) {
    throw new Error(m('openclaw.tokenWriteFail', { err: (err as Error).message }))
  }
  return { token, created: true }
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
