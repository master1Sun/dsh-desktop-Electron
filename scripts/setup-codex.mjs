import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'

/**
 * Provision a self-contained @openai/codex CLI into `resources/codex/` using the
 * bundled Node runtime, mirroring setup-openclaw.mjs: the container ships the
 * latest published codex and can spawn it without depending on the user's global
 * npm state.
 *
 * codex resolves its native binary through the bin/codex.js launcher (platform
 * @openai/codex-<target> optional deps), so running it with
 * `resources/node/node.exe` keeps it independent of any system node. A local
 * `.npmrc` pins the registry to npmmirror for offline-friendly installs.
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
const entry = join(destDir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js')

function main() {
  if (!existsSync(nodeExe)) {
    console.error('[setup-codex] bundled node missing — run "npm run setup:node" first')
    process.exit(1)
  }
  if (!existsSync(npmCli)) {
    console.error(`[setup-codex] bundled npm missing at ${npmCli}`)
    process.exit(1)
  }
  if (!FORCE && existsSync(entry)) {
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

  if (!existsSync(entry)) {
    console.warn('[setup-codex] warning: codex entry not found at', entry)
    return
  }
  console.log('[setup-codex] done. entry:', entry)
}

try {
  main()
} catch (err) {
  console.error('[setup-codex] failed:', err?.message || err)
  // surface the resolved home so users can see where config will live
  console.error(`  (codex config home defaults to ${join(homedir(), '.codex')})`)
  process.exit(1)
}
