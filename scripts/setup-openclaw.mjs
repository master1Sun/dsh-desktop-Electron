import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'

/**
 * Provision a self-contained openclaw CLI into `resources/openclaw/` using the
 * bundled Node runtime, so the container ships the latest published version and
 * can spawn its gateway without depending on the user's global npm state.
 *
 * openclaw declares `engines.node >=24.16 <25 || >=26.1`, which the system node
 * (often older) may not satisfy — running it with `resources/node/node.exe`
 * sidesteps that. A local `.npmrc` pins the registry to npmmirror for offline-
 * friendly installs.
 */

const OPENCLAW_PKG = process.env.DSH_OPENCLAW_PKG || 'openclaw@latest'
/** Re-run even when already provisioned, to pull a newer version. */
const FORCE = process.argv.includes('--force') || process.env.DSH_OPENCLAW_FORCE === '1'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const nodeDir = join(projectRoot, 'resources', 'node')
const nodeExe = join(nodeDir, process.platform === 'win32' ? 'node.exe' : 'node')
const npmCli = join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js')
const destDir = join(projectRoot, 'resources', 'openclaw')
const entry = join(destDir, 'node_modules', 'openclaw', 'openclaw.mjs')

function main() {
  if (!existsSync(nodeExe)) {
    console.error('[setup-openclaw] bundled node missing — run "npm run setup:node" first')
    process.exit(1)
  }
  if (!existsSync(npmCli)) {
    console.error(`[setup-openclaw] bundled npm missing at ${npmCli}`)
    process.exit(1)
  }
  if (!FORCE && existsSync(entry)) {
    console.log(`[setup-openclaw] already provisioned, skipping (use --force to refresh): ${entry}`)
    return
  }
  mkdirSync(destDir, { recursive: true })
  writeFileSync(join(destDir, '.npmrc'), 'registry=https://registry.npmmirror.com/\n')

  const env = { ...process.env, npm_config_prefix: destDir }
  console.log(`[setup-openclaw] installing ${OPENCLAW_PKG} into ${destDir} ...`)
  execFileSync(
    nodeExe,
    [npmCli, 'install', '-g', OPENCLAW_PKG, '--ignore-scripts', '--no-audit', '--no-fund'],
    { env, stdio: 'inherit', windowsHide: true }
  )

  if (!existsSync(entry)) {
    console.warn('[setup-openclaw] warning: openclaw entry not found at', entry)
    return
  }
  console.log('[setup-openclaw] done. entry:', entry)
}

try {
  main()
} catch (err) {
  console.error('[setup-openclaw] failed:', err?.message || err)
  // surface the resolved home so users can see where config will live
  console.error(`  (openclaw config home defaults to ${join(homedir(), '.openclaw')})`)
  process.exit(1)
}
