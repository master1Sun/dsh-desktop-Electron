import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'

/**
 * Provision a self-contained OpenAI Codex CLI into `resources/codex/` using the
 * bundled Node runtime, so the container ships codex and can launch it in the
 * embedded terminal without depending on the user having a global `codex` install.
 *
 * codex is invoked as a bare `codex` command from the embedded terminal; the container
 * prepends this prefix's bin dirs to PATH (see src/main/pty.ts) so it resolves first.
 */

const CODEX_PKG = process.env.DSH_CODEX_PKG || '@openai/codex@latest'
/** Re-run even when already provisioned, to pull a newer version. */
const FORCE = process.argv.includes('--force') || process.env.DSH_CODEX_FORCE === '1'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const nodeDir = join(projectRoot, 'resources', 'node')
const nodeExe = join(nodeDir, process.platform === 'win32' ? 'node.exe' : 'node')
const npmCli = join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js')
const destDir = join(projectRoot, 'resources', 'codex')
/**
 * npm's global-bin shim location inside a prefix. On Windows npm writes `codex.cmd`
 * / `codex.ps1` / `codex` directly into the prefix root; on POSIX they land in
 * `<prefix>/bin`. `node_modules/.bin` is checked too because some npm versions
 * (or a local-style install) place them there instead.
 */
const entryCandidates =
  process.platform === 'win32'
    ? [join(destDir, 'codex.cmd'), join(destDir, 'node_modules', '.bin', 'codex.cmd')]
    : [join(destDir, 'bin', 'codex'), join(destDir, 'node_modules', '.bin', 'codex')]
const entry = entryCandidates[0]
const entryExists = () => entryCandidates.some((p) => existsSync(p))

function main() {
  if (!existsSync(nodeExe)) {
    console.error('[setup-codex] bundled node missing — run "npm run setup:node" first')
    process.exit(1)
  }
  if (!existsSync(npmCli)) {
    console.error(`[setup-codex] bundled npm missing at ${npmCli}`)
    process.exit(1)
  }
  if (!FORCE && entryExists()) {
    console.log(`[setup-codex] already provisioned, skipping (use --force to refresh): ${entry}`)
    return
  }
  mkdirSync(destDir, { recursive: true })
  writeFileSync(join(destDir, '.npmrc'), 'registry=https://registry.npmmirror.com/\n')

  const env = { ...process.env, npm_config_prefix: destDir }
  console.log(`[setup-codex] installing ${CODEX_PKG} into ${destDir} ...`)
  execFileSync(
    nodeExe,
    [npmCli, 'install', '-g', CODEX_PKG, '--ignore-scripts', '--no-audit', '--no-fund'],
    { env, stdio: 'inherit', windowsHide: true }
  )

  if (!entryExists()) {
    console.warn('[setup-codex] warning: codex entry not found at any of', entryCandidates)
    return
  }
  console.log('[setup-codex] done. entry:', entry)
}

try {
  main()
} catch (err) {
  console.error('[setup-codex] failed:', err?.message || err)
  console.error(`  (codex config home defaults to ${join(homedir(), '.codex')})`)
  process.exit(1)
}
