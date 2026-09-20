// Publish the compiled app as an over-the-air update: build → pack out/ into app.asar
// → commit it to the orphan `release` branch → push. Packaged clients fetch that branch
// (git protocol, so private repos ride on the user's existing git credentials) and swap
// their running asar via src/boot.cjs.
//
// Usage:  npm run publish:update [-- --skip-build]
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '../..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const skipBuild = process.argv.includes('--skip-build')

function run(cmd, args, opts = {}) {
  console.log(`[publish] $ ${cmd} ${args.join(' ')}`)
  return execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true, ...opts })
}

function git(args, cwd = root) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

if (!existsSync(join(root, 'out/main/index.js'))) {
  if (skipBuild) {
    console.error('[publish] --skip-build but out/ is missing — run npm run build first')
    process.exit(1)
  }
  run('npm', ['run', 'build'])
} else if (!skipBuild) {
  run('npm', ['run', 'build'])
}

// ---- publish to the orphan release branch WITHOUT a worktree or local branch ----
// A worktree checkout of `release` gets hijacked by editor VCS integrations (an AI-code
// tracker here rewrote HEAD~1 into an orphan commit mid-run). Instead: stage the artifacts
// in a throwaway index inside the main repo (objects are shared, so commit-tree -p <remote
// tip> works), then push the raw commit SHA — no local ref, nothing for a hook to touch.
const { createPackage } = await import('@electron/asar')
const branch = 'release'
const remoteRef = `refs/heads/${branch}`
const stage = join(root, 'dist-release/app-src')
const idx = join(root, '.git', 'dsh-release-index')
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
  if (!base) console.log('[publish] no release branch on origin yet — creating the first orphan commit')

  // Pack from a clean copy: createPackage() refuses to nest an asar inside its own
  // source dir, so the previous run's app.asar must not be present here.
  const packSrc = join(root, 'dist-release/app-pack')
  rmSync(packSrc, { recursive: true, force: true })
  mkdirSync(join(packSrc, 'out'), { recursive: true })
  for (const dir of ['main', 'preload', 'renderer']) {
    cpSync(join(root, 'out', dir), join(packSrc, 'out', dir), { recursive: true })
  }
  writeFileSync(
    join(packSrc, 'package.json'),
    JSON.stringify({ name: pkg.name, version: pkg.version, main: './out/main/index.js' }, null, 2)
  )
  const asarOut = join(stage, 'app.asar')
  // Wipe the staging dir. On Windows a previous run's app.asar may be locked by an
  // IDE indexer — rename it to a temp name first (rename is atomic on the same volume),
  // then remove the old dir without waiting for the lock to clear.
  try {
    rmSync(stage, { recursive: true, force: true })
  } catch {
    try {
      const tmpName = join(stage, `app.asar.${Date.now()}.tmp`)
      require('node:fs').renameSync(join(stage, 'app.asar'), tmpName)
    } catch {}
    try { rmSync(stage, { recursive: true, force: true }) } catch {}
  }
  mkdirSync(stage, { recursive: true })
  await createPackage(packSrc, asarOut)
  console.log(`[publish] packed app.asar (${Math.round(statSync(asarOut).size / 1024 / 1024)} MB)`)
  writeFileSync(join(stage, 'version.txt'), `${pkg.version}\n${git(['rev-parse', 'HEAD'])}\n`)

  rmSync(idx, { force: true })
  // GIT_QUARANTINE_PATH would make hooks reject the push; keep the env minimal and explicit.
  const env = { ...process.env, GIT_INDEX_FILE: idx, GIT_DIR: join(root, '.git'), GIT_WORK_TREE: stage }
  delete env.GIT_QUARANTINE_PATH
  const out = (args) => execFileSync('git', args, { cwd: stage, encoding: 'utf-8', env }).trim()
  // app.asar matches the global .gitignore *.asar rule — force-add the artifacts.
  out(['add', '-f', 'app.asar', 'version.txt'])
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
