import { spawn } from 'node:child_process'

/**
 * Orphan-process reclaim for the hosted runtimes, split out of pages.ts: dev-reload or
 * manually-launched dsh harnesses / openclaw gateways that no registry entry tracks any more.
 * Each function takes the set of pids the CALLER still owns (the registry builds it from its
 * live entries) and kills everything else that matches its kind.
 */

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

  /** Kill leftover bundled-node openclaw gateways this registry no longer tracks (dev hot-reload
      orphans holding the state-dir ownership lock → exit 78). Best-effort; never throws. */
export async function reclaimOpenclawOrphans(tracked: Set<number>): Promise<void> {
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
export async function reclaimDshHarnesses(profile: string, tracked: Set<number>): Promise<void> {
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
