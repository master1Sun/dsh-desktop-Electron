import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  closeSync,
  rmSync,
  statSync,
  writeFileSync,
  promises as fsp
} from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import * as os from 'node:os'
import { logsDir } from './logger'
import { getSettings, resolveExportPath } from './store'
import type { PageRegistry } from './pages'

/**
 * One-click diagnostic bundle for field bugs ("it doesn't start on my machine").
 * Collects everything that distinguishes the user's machine from ours — versions,
 * resolved settings (secrets masked), per-page container.json + status, log tails,
 * per-project git HEAD — into a folder, zips it, and saves it into the configured 下载目录.
 *
 * Everything here is best-effort by design: a missing file or a failed `git` call
 * downgrades that one section to a note inside the bundle; the export itself only
 * fails if the staging dir can't be written at all.
 */

/** Read the last `cap` bytes of a file as text (logs rotate at 5 MB; tails suffice). */
function readTailText(file: string, cap: number): string {
  try {
    const total = statSync(file).size
    const len = Math.min(total, cap)
    const buf = Buffer.allocUnsafe(len)
    const fd = openSync(file, 'r')
    try {
      readSync(fd, buf, 0, len, total - len)
    } finally {
      closeSync(fd)
    }
    return buf.toString('utf8')
  } catch {
    return `(unavailable: ${file})\n`
  }
}

/** Short-lived CLI capture that never rejects (git absence reads as a note, not a crash). */
function capture(cmd: string, args: string[], cwd: string, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true, timeout: timeoutMs })
    let out = ''
    child.stdout?.on('data', (d) => (out += String(d)))
    child.on('error', () => resolve(''))
    child.on('close', () => resolve(out.trim()))
  })
}

/** Values that smell like credentials get masked by key name — the bundle leaves the machine. */
const SECRET_KEY_RE = /token|key|secret|password|pwd|auth|cookie/i
function maskSettings(): Record<string, unknown> {
  const s = getSettings() as unknown as Record<string, unknown>
  const out: Record<string, unknown> = { ...s }
  // pageEnvs: { <pageId>: { <VAR>: <value> } } — mask per variable name.
  const envs = s.pageEnvs as Record<string, Record<string, string>> | undefined
  if (envs) {
    out.pageEnvs = Object.fromEntries(
      Object.entries(envs).map(([page, vars]) => [
        page,
        Object.fromEntries(
          Object.entries(vars ?? {}).map(([k, v]) => [
            k,
            SECRET_KEY_RE.test(k) && v ? '***' : v
          ])
        )
      ])
    )
  }
  return out
}

/**
 * Build the bundle and save it into the configured 下载目录 (same folder webview downloads
 * use, with a collision-safe name — no "Save As" prompt). Resolves the saved .zip path.
 * Throws only if staging itself fails.
 */
export async function exportDiagnostics(registry: PageRegistry): Promise<string | null> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const stage = join(app.getPath('temp'), `dsh-diag-${ts}`)
  mkdirSync(stage, { recursive: true })
  try {
    // ---- versions.json: what is running, on what runtime stack ----
    let nodeRuntime: unknown = null
    try {
      nodeRuntime = await import('./node-runtime').then((r) => r.getNodeRuntimeInfo())
    } catch {
      /* dev-tree probing can fail; the rest of the bundle still stands */
    }
    let runtimes: unknown = {}
    try {
      const [{ isDshInstalled }, { isOpenclawInstalled }] = await Promise.all([
        import('./dsh'),
        import('./openclaw')
      ])
      runtimes = { dshInstalled: isDshInstalled(), openclawInstalled: isOpenclawInstalled() }
    } catch {
      /* same */
    }
    writeFileSync(
      join(stage, 'versions.json'),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          appVersion: app.getVersion(),
          packaged: app.isPackaged,
          exePath: app.getPath('exe'),
          userData: app.getPath('userData'),
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          node: process.versions.node,
          bundledNode: nodeRuntime,
          onDemandRuntimes: runtimes
        },
        null,
        2
      ),
      'utf8'
    )

    // ---- settings.json (secrets masked) ----
    writeFileSync(join(stage, 'settings.json'), JSON.stringify(maskSettings(), null, 2), 'utf8')

    // ---- pages.json: live status + each project's own container.json ----
    const pages = registry.list().map((p) => {
      let manifest: string | null = null
      try {
        const f = join(p.dir, 'container.json')
        manifest = existsSync(f) ? JSON.parse(readFileSyncSafe(f)) : null
      } catch {
        manifest = '(unreadable)'
      }
      return {
        id: p.id,
        name: p.name,
        kind: p.kind,
        status: p.status,
        pid: p.pid,
        port: p.containerPort ?? p.port,
        external: p.external,
        lastError: p.lastError,
        crashes: p.crashes,
        dependsOn: p.dependsOn,
        healthUrl: p.healthUrl,
        containerJson: manifest
      }
    })
    writeFileSync(join(stage, 'pages.json'), JSON.stringify(pages, null, 2), 'utf8')

    // ---- system.txt ----
    writeFileSync(
      join(stage, 'system.txt'),
      [
        `os: ${os.type()} ${os.release()} (${os.arch()})`,
        `hostname: ${os.hostname()}`,
        `cpus: ${os.cpus().length} x ${os.cpus()[0]?.model ?? '?'}`,
        `totalMemory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`,
        `freeMemory: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(1)} GB`,
        `home: ${os.homedir()}`,
        `locale: ${Intl.DateTimeFormat().resolvedOptions().locale} / TZ ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
        `env.proxy: ${process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? '(none)'}`
      ].join('\n'),
      'utf8'
    )

    // ---- logs/: mirrored main log + one tail per page log ----
    mkdirSync(join(stage, 'logs'), { recursive: true })
    writeFileSync(join(stage, 'logs', 'main.log'), readTailText(join(logsDir(), 'main.log'), 1024 * 1024), 'utf8')
    for (const f of safePageLogFiles()) {
      writeFileSync(
        join(stage, 'logs', f.name),
        readTailText(join(logsDir(), 'pages', f.name), 256 * 1024),
        'utf8'
      )
    }

    // ---- git.txt: which commit does each hosted project actually sit on ----
    const gitLines: string[] = []
    for (const p of [{ id: '__container__', dir: registry.containerEntry().dir }, ...pages.map((p) => ({ id: p.id as string, dir: (registry.get(p.id)?.dir ?? '') }))]) {
      if (!p.dir || !existsSync(join(p.dir, '.git'))) {
        gitLines.push(`${p.id}: (no .git)`)
        continue
      }
      const head = await capture('git', ['rev-parse', '--short', 'HEAD'], p.dir)
      const branch = await capture('git', ['branch', '--show-current'], p.dir)
      gitLines.push(`${p.id}: ${branch || '?'} @ ${head || '?'}`)
    }
    writeFileSync(join(stage, 'git.txt'), gitLines.join('\n'), 'utf8')

    // ---- zip, then drop into the configured 下载目录 (follows webview downloads) ----
    const zipPath = join(app.getPath('temp'), `dsh-diag-${ts}.zip`)
    await zipFolder(stage, zipPath)
    const dest = resolveExportPath(`dsh-diag-${ts}.zip`)
    await fsp.copyFile(zipPath, dest)
    return dest
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

function readFileSyncSafe(file: string): string {
  // JSON round-trip normalizes formatting and throws on garbage (caller catches).
  return JSON.stringify(JSON.parse(readFileSync(file, 'utf-8')))
}

function safePageLogFiles(): { name: string }[] {
  try {
    const dir = join(logsDir(), 'pages')
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((f) => f.endsWith('.log'))
      .map((name) => ({ name }))
  } catch {
    return []
  }
}

/**
 * Compress-Archive through -EncodedCommand: a plain `-Command` with our (possibly
 * Chinese-path) arguments arrives at PowerShell in the OEM codepage and silently
 * mangles them; base64 UTF-16LE sidesteps the whole codepage mess.
 *
 * NOTE: `-LiteralPath 'src\*'` never expands the `*` — Compress-Archive then matches nothing
 * and emits *no archive* while still exiting 0, so the downstream copy silently fails. Enumerate
 * the folder's real children and pass those literal paths instead (correct root-level layout that
 * also survives a temp dir name carrying wildcard chars like `[` or `]`).
 */
function zipFolder(src: string, dest: string): Promise<void> {
  const srcLit = src.replace(/'/g, "''")
  const destLit = dest.replace(/'/g, "''")
  const ps =
    `$items = Get-ChildItem -LiteralPath '${srcLit}' | ForEach-Object { $_.FullName }; ` +
    `Compress-Archive -LiteralPath $items -DestinationPath '${destLit}' -Force -ErrorAction Stop`
  const encoded = Buffer.from(ps, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-EncodedCommand', encoded], {
      windowsHide: true,
      timeout: 60_000
    })
    let err = ''
    child.stderr?.on('data', (d) => (err += String(d)))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`Compress-Archive failed (${code}): ${err.trim()}`))
      if (!existsSync(dest)) return reject(new Error('Compress-Archive produced no archive'))
      resolve()
    })
  })
}
