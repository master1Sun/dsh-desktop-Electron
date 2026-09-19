import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'

/**
 * Provision a self-contained @deepseek-ai/dsh install into `resources/dsh/` using
 * the bundled Node runtime, so the container ships the CLI (and its plugin-manager
 * dependency pnpm) and works out of the box without touching the user's global npm.
 *
 * dsh publishes on the `alpha` dist-tag — `@latest` lags behind and is the version
 * line this app pins around (see README), so default to `@alpha`. The registry has
 * a minimumReleaseAge gate; we pass `--config.minimumReleaseAge=0` like every other
 * dsh install this app performs.
 */

const DSH_PKG = process.env.DSH_PKG_SPEC || '@deepseek-ai/dsh@alpha'
const PNPM_PKG = process.env.DSH_PNPM_SPEC || 'pnpm@latest'
/** Re-run even when already provisioned, to pull a newer version. */
const FORCE = process.argv.includes('--force') || process.env.DSH_DSH_FORCE === '1'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const nodeDir = join(projectRoot, 'resources', 'node')
const nodeExe = join(nodeDir, process.platform === 'win32' ? 'node.exe' : 'node')
const npmCli = join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js')
const destDir = join(projectRoot, 'resources', 'dsh')
const entry = join(destDir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

function install(pkg) {
  const env = { ...process.env, npm_config_prefix: destDir }
  console.log(`[setup-dsh] installing ${pkg} into ${destDir} ...`)
  execFileSync(
    nodeExe,
    [
      npmCli,
      'install',
      '-g',
      pkg,
      '--config.minimumReleaseAge=0',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund'
    ],
    { env, stdio: 'inherit', windowsHide: true }
  )
}

function main() {
  if (!existsSync(nodeExe)) {
    console.error('[setup-dsh] bundled node missing — run "npm run setup:node" first')
    process.exit(1)
  }
  if (!existsSync(npmCli)) {
    console.error(`[setup-dsh] bundled npm missing at ${npmCli}`)
    process.exit(1)
  }
  mkdirSync(destDir, { recursive: true })
  writeFileSync(join(destDir, '.npmrc'), 'registry=https://registry.npmmirror.com/\n')

  if (FORCE || !existsSync(entry)) {
    install(DSH_PKG)
  } else {
    console.log(`[setup-dsh] dsh already provisioned (use --force to refresh): ${entry}`)
  }

  // `dsh plugin` forwards to a bare `pnpm` on PATH; shipping one inside the prefix
  // dir means the container can manage plugins with zero host prerequisites.
  const pnpmMarker = join(destDir, process.platform === 'win32' ? 'pnpm.cmd' : 'bin/pnpm')
  if (FORCE || !existsSync(pnpmMarker)) install(PNPM_PKG)
  fixPnpmBinaries()
  fixPnpmShim()

  if (!existsSync(entry)) {
    console.warn('[setup-dsh] warning: dsh entry not found at', entry)
    return
  }
  console.log('[setup-dsh] done. entry:', entry)
}

/**
 * pnpm v12 ships extensionless Node placeholders that its (here skipped)
 * preinstall replaces with hard links to the native binary from the platform
 * `@pnpm/exe.<target>` package. Without that step npm's cmd shim — which calls
 * `<prefix>/node_modules/pnpm/pnpm` directly — hits a file CreateProcess cannot
 * resolve. Replicate the preinstall: copy the exe onto every placeholder name
 * and add the `.exe` twin.
 */
function fixPnpmBinaries() {
  if (process.platform !== 'win32') return
  const pkgDir = join(destDir, 'node_modules', 'pnpm')
  const manifest = join(pkgDir, 'package.json')
  if (!existsSync(manifest)) return
  let pkg
  try {
    pkg = JSON.parse(readFileSync(manifest, 'utf-8'))
  } catch {
    return
  }
  const opt = pkg.optionalDependencies ?? {}
  const target = Object.keys(opt).find((k) => k.startsWith('@pnpm/exe.'))
  if (!target) return
  const binFile = target.includes('win32-arm64') ? 'pnpm-arm64.exe' : 'pnpm.exe'
  const native = join(destDir, 'node_modules', ...target.split('/'), binFile)
  if (!existsSync(native)) return
  for (const name of ['pnpm', 'pn', 'pnpx', 'pnx']) {
    for (const suffix of ['', '.exe']) {
      const dest = join(pkgDir, name + suffix)
      if (name !== 'pnpm' && !suffix && !existsSync(dest)) continue
      writeFileSync(dest, readFileSync(native))
    }
  }
  console.log('[setup-dsh] linked native pnpm binary over placeholders from', target)
}

/**
 * npm's generated pnpm.cmd executes `<prefix>/node_modules/pnpm/pnpm`. With
 * --ignore-scripts that file is still pnpm v12's Node shebang placeholder —
 * harmless under a shell but unresolvable by CreateProcess (no PATHEXT match),
 * which is how `dsh plugin` died with "not recognized as an internal command".
 * fixPnpmBinaries hard-links the bundled native binary onto those paths first;
 * this .cmd rewrite is the belt-and-braces fallback for hosts where the link
 * step was skipped.
 */
function fixPnpmShim() {
  if (process.platform !== 'win32') return
  const mjs = join(destDir, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
  const cmd = join(destDir, 'pnpm.cmd')
  if (!existsSync(mjs) || !existsSync(cmd)) return
  const desired =
    '@ECHO off\r\nSETLOCAL\r\nIF EXIST "%~dp0node.exe" (\r\n  "%~dp0node.exe" "%~dp0node_modules\\pnpm\\bin\\pnpm.mjs" %*\r\n) ELSE (\r\n  node "%~dp0node_modules\\pnpm\\bin\\pnpm.mjs" %*\r\n)\r\nENDLOCAL\r\nEXIT /b %ERRORLEVEL%\r\n'
  if (readFileSync(cmd, 'utf-8') === desired) return
  writeFileSync(cmd, desired, { encoding: 'utf-8' })
  console.log('[setup-dsh] re-pointed pnpm.cmd at pnpm.mjs via node:', cmd)
}

try {
  main()
} catch (err) {
  console.error('[setup-dsh] failed:', err?.message || err)
  console.error(`  (dsh config home defaults to ${join(homedir(), '.dsh')})`)
  process.exit(1)
}
