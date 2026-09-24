// Publish the compiled app as an over-the-air update: run electron-builder --dir, then ship
// its authoritative `app.asar` + the asarUnpack'd `app.asar.unpacked` native tree as a single
// app.zip → commit it to the orphan `release` branch → push. Packaged clients fetch that branch
// (git protocol, so private repos ride on the user's existing git credentials), unzip it into
// <installDir>/resources/updates/<commit>/ and boot.cjs swaps the running asar via src/boot.cjs.
//
// We deliberately reuse electron-builder's output instead of hand-packing out/: a hand-packed
// asar silently omitted every runtime dependency (the ~59 MB of node_modules) and node-pty's
// native binaries, so the resulting small asar booted straight into a missing-module crash.
//
// Usage:  npm run publish:update [-- --skip-build] [--channel beta]
//
// --channel beta publishes to the orphan `release-beta` branch instead, which is what a client
// with 更新通道 = beta follows. One push writes exactly one branch: a beta release never touches
// what stable users get, and the two branches can hold different versions at the same time.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '../..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const skipBuild = process.argv.includes('--skip-build')
const argValue = (name) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const channel = argValue('--channel') || 'stable'
if (channel !== 'stable' && channel !== 'beta') {
  console.error(`[publish] --channel must be 'stable' or 'beta' (got ${channel})`)
  process.exit(1)
}

function run(cmd, args, opts = {}) {
  console.log(`[publish] $ ${cmd} ${args.join(' ')}`)
  return execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true, ...opts })
}

function git(args, cwd = root) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

// The OTA artifact must equal what the installer ships, so we reuse electron-builder's own
// output (app.asar + the asarUnpack'd app.asar.unpacked native tree). Hand-packing out/ was
// the original bug: it omitted every runtime dependency and node-pty's binaries.
function findBuilderResources() {
  const dist = join(root, 'dist')
  if (!existsSync(dist)) return null
  for (const name of readdirSync(dist)) {
    if (!name.endsWith('-unpacked')) continue
    const r = join(dist, name, 'resources')
    if (existsSync(join(r, 'app.asar'))) return r
  }
  return null
}

let resources = findBuilderResources()
if (skipBuild) {
  if (!resources) {
    console.error('[publish] --skip-build but no dist/*-unpacked/resources/app.asar found — run npm run build:unpack first')
    process.exit(1)
  }
} else {
  run('npm', ['run', 'build:unpack'])
  resources = findBuilderResources()
  if (!resources) {
    console.error('[publish] electron-builder --dir produced no dist/*-unpacked/resources/app.asar')
    process.exit(1)
  }
}

// ---- publish to the orphan release branch WITHOUT a worktree or local branch ----
// A worktree checkout of `release` gets hijacked by editor VCS integrations (an AI-code
// tracker here rewrote HEAD~1 into an orphan commit mid-run). Instead: stage the artifacts
// in a throwaway index inside the main repo (objects are shared, so commit-tree -p <remote
// tip> works), then push the raw commit SHA — no local ref, nothing for a hook to touch.
const branch = channel === 'beta' ? 'release-beta' : 'release'
const remoteRef = `refs/heads/${branch}`
const stage = join(root, 'dist-release', branch, 'app-src')
const idx = join(root, '.git', `dsh-${branch}-index`)
try {
  // Resolve the current remote tip; a transient network failure must not be mistaken
  // for "first publish" (that would silently create an orphan the push then rejects).
  let base = null
  for (let attempt = 0; attempt < 3 && base === null; attempt++) {
    try {
      base = git(['ls-remote', '--heads', 'origin', branch]).split('\n')[0].trim().split(/\s+/)[0] || null
    } catch {
      if (attempt === 2) throw new Error('[publish] cannot reach origin — refusing to guess whether this is the first publish')
      execFileSync('sleep', ['3'])
    }
  }
  if (!base) console.log(`[publish] no ${branch} branch on origin yet — creating the first orphan commit`)

  // Stage the payload as a single zip: app.asar + (when present) the asarUnpack'd
  // app.asar.unpacked native tree. One blob keeps the client's single-git-blob streaming/resume
  // path intact; unzipping into <commit>/ yields app.asar with its sibling app.asar.unpacked,
  // exactly matching the installer layout boot.cjs relies on.
  // Wipe the staging dir. On Windows a previous run's app.zip may be locked by an
  // IDE indexer — rename it to a temp name first (rename is atomic on the same volume),
  // then remove the old dir without waiting for the lock to clear.
  try {
    rmSync(stage, { recursive: true, force: true })
  } catch {
    try {
      renameSync(join(stage, 'app.zip'), join(stage, `app.zip.${Date.now()}.tmp`))
    } catch {}
    try { rmSync(stage, { recursive: true, force: true }) } catch {}
  }
  mkdirSync(stage, { recursive: true })
  const zipOut = join(stage, 'app.zip')
  const entries = ['app.asar']
  if (existsSync(join(resources, 'app.asar.unpacked'))) entries.push('app.asar.unpacked')
  // bsdtar (shipped with Windows 10+/macOS/Linux) picks the zip format from the .zip suffix via -a.
  run('tar', ['-a', '-c', '-f', zipOut, '-C', resources, ...entries])
  console.log(`[publish] packed app.zip (${Math.round(statSync(zipOut).size / 1024 / 1024)} MB)`)
  writeFileSync(join(stage, 'version.txt'), `${pkg.version}\n${git(['rev-parse', 'HEAD'])}\n`)
  // Content integrity: clients stream-verify app.zip against this hash before staging (a missing
  // file on an old release falls back to the size-only check — see asar-updates.ts downloadAsar).
  const zipHash = createHash('sha512').update(readFileSync(zipOut)).digest('hex')
  writeFileSync(join(stage, 'sha512.txt'), `${zipHash}\n`)
  console.log(`[publish] sha512(app.zip) = ${zipHash.slice(0, 16)}…`)

  rmSync(idx, { force: true })
  // GIT_QUARANTINE_PATH would make hooks reject the push; keep the env minimal and explicit.
  const env = { ...process.env, GIT_INDEX_FILE: idx, GIT_DIR: join(root, '.git'), GIT_WORK_TREE: stage }
  delete env.GIT_QUARANTINE_PATH
  const out = (args) => execFileSync('git', args, { cwd: stage, encoding: 'utf-8', env }).trim()
  // app.zip + version.txt + sha512.txt live under the git-ignored dist-release/ — force-add them.
  out(['add', '-f', 'app.zip', 'version.txt', 'sha512.txt'])
  const tree = out(['write-tree'])
  const baseTree = base ? git(['rev-parse', `${base}^{tree}`]) : null
  if (base && tree === baseTree) {
    console.log('[publish] nothing changed vs the last release, skipping push')
  } else {
    const commit = out(base ? ['commit-tree', tree, '-p', base, '-m', `release ${pkg.version}`] : ['commit-tree', tree, '-m', `release ${pkg.version}`])
    // Explicit fast-forward push (no leading +): rejected if the remote moved meanwhile.
    git(['push', 'origin', `${commit}:${remoteRef}`])
    console.log(`[publish] pushed ${branch} @ v${pkg.version}`)
  }
} finally {
  rmSync(idx, { force: true })
}
