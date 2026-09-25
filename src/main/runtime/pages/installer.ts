import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { copyFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, sep, basename } from 'node:path'
import { simpleGit } from 'simple-git'
import { logPageLine } from '../../shell/logger'
import { readPageMeta, BUILTIN_PAGE_IDS, type ContainerManifest } from './pages'
import {
  classifyProject,
  probeRemoteTier,
  readPkgSafe,
  runtimeDepCount,
  type ProjectClass
} from './project-classify'
import { getSettings, isValidPort, updateSettings, applyNpmRegistryEnv } from '../../shell/store'
import { getNodeExePath, bundledEnv } from '../cli/node-runtime'
import { resolveMcpPkgEntry, buildCapabilityStartCommand } from '../mcp/mcp-packages'
import { normalizeRepoUrl, cloneWithAuthFallback, type CloneProgress } from '../../update/git-updates'
import { logEvent } from '../../shell/events'
import type { ImportOptions, InstallProgress } from '../../../shared/types'
import { m, msgIn } from '../../shell/i18n'

/** A local folder path the user meant instead of a URL (e.g. D:\GitProject\dsh-desktop-Electron). */
export function looksLikeLocalPath(s: string): boolean {
  return (
    /^[a-z]:[\\/]/i.test(s) ||
    s.startsWith('\\\\') ||
    s.startsWith('./') ||
    s.startsWith('../') ||
    s.startsWith('.\\') ||
    s.startsWith('..\\') ||
    s.startsWith('/')
  )
}

/**
 * Re-point a freshly cloned page at its source repo when it was copied without `.git`
 * (local-folder import of a git working tree): set origin to the canonical URL and
 * make a first commit so `git pull --ff-only` has a base to fast-forward onto.
 */
async function adoptOrigin(dir: string, originUrl: string): Promise<void> {
  const pageGit = simpleGit({ baseDir: dir })
  await pageGit.init(['-b', 'main'])
  await pageGit.add('.')
  // The user's global identity may be absent; pin it for this one commit instead of failing.
  await pageGit.commit('Imported into DSH container (origin tracked for updates)', [
    '--allow-empty',
    '--author',
    'DSH Container <container@local>',
    '--date',
    'now'
  ])
  await pageGit.remote(['add', 'origin', originUrl])
}

/** Record the chosen port as a per-page override instead of editing the project's container.json. */
function applyPortOverride(dirName: string, port?: number): void {
  if (!isValidPort(port)) return
  updateSettings({ pagePorts: { ...getSettings().pagePorts, [dirName]: Number(port) } })
}

/**
 * An imported project that ships no container.json gets a generated one, so the config lives
 * with the project and the Pages panel shows a concrete kind instead of a bare guess. The kind
 * and CLI start command come straight from {@link classifyProject} — the same verdict the import
 * gate used — so seeding and validation can never disagree. Existing manifests are never
 * rewritten, and the description is seeded in *both* languages so the page is not pinned to
 * whichever language happened to be active at import time. Returns the class it acted on so the
 * caller can decide whether a dependency install step is needed.
 */
function seedContainerManifest(
  pagesDir: string,
  dirName: string,
  port: number | undefined,
  cls: ProjectClass
): ProjectClass {
  const dir = join(pagesDir, dirName)
  const metaFile = join(dir, 'container.json')
  if (!existsSync(metaFile)) {
    const manifest: ContainerManifest = {
      name: dirName,
      description: {
        zh: msgIn('zh', 'install.importedDesc'),
        en: msgIn('en', 'install.importedDesc')
      }
    }
    if (cls.kind === 'terminal') {
      manifest.kind = 'terminal'
      if (cls.startCommand) manifest.startCommand = cls.startCommand
    } else {
      manifest.kind = 'page'
      if (isValidPort(port)) manifest.port = Number(port)
    }
    writeFileSync(metaFile, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
  }
  return cls
}

/** Absolute path of the bundled npm CLI, launched under the bundled node (mirrors update-service). */
function bundledNpmCli(): string {
  return join(dirname(getNodeExePath()), 'node_modules', 'npm', 'bin', 'npm-cli.js')
}

/**
 * Install an imported project's runtime dependencies with the bundled Node + npm, routed through
 * the container's configured registry. `npm ci` when a lockfile is present (reproducible), else
 * `npm install`. Streams npm's latest output line to `onMessage` so the import bar shows motion
 * for a step that has no byte progress; throws with a log tail on a non-zero exit.
 */
export async function installDeps(dir: string, onMessage?: (line: string) => void): Promise<void> {
  const pkg = readPkgSafe(dir)
  const deps = runtimeDepCount(pkg)
  if (!deps) return
  const cli = bundledNpmCli()
  if (!existsSync(cli)) throw new Error(m('install.npmMissing'))
  applyNpmRegistryEnv()
  const args = existsSync(join(dir, 'package-lock.json')) ? ['ci'] : ['install']
  await runStream(
    getNodeExePath(),
    [cli, ...args, '--no-audit', '--no-fund'],
    dir,
    `npm ${args.join(' ')}`,
    onMessage,
    // the import target folder *is* the page id — mirror npm's output into its log file
    basename(dir)
  )
}

/** Spawn a long-running helper (npm install), tailing output to `onMessage` and failing on a non-zero exit.
    With `logTo` (a page id) every raw chunk also lands in `logs/pages/<id>.log` and the start/finish
    lines in main.log — without this an import (codex & friends) is invisible to the in-app log viewer. */
function runStream(
  cmd: string,
  args: string[],
  cwd: string,
  caption: string,
  onMessage?: (line: string) => void,
  logTo?: string,
  timeoutMs = 15 * 60_000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: bundledEnv(), windowsHide: true, shell: false })
    console.log(`[install] ${caption} started in ${cwd}`)
    let tail = ''
    const onData = (d: unknown): void => {
      const text = String(d)
      if (logTo) logPageLine(logTo, text)
      tail += text
      if (tail.length > 8000) tail = tail.slice(-8000)
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      if (lines.length) onMessage?.(lines[lines.length - 1].trim())
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      console.error(`[install] ${caption} timed out after ${Math.round(timeoutMs / 60000)}min`)
      reject(new Error(m('install.timeout', { cmd: caption })))
    }, timeoutMs)
    child.on('error', (err) => {
      clearTimeout(timer)
      console.error(`[install] ${caption} spawn failed:`, err)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        console.log(`[install] ${caption} finished`)
        resolve()
      } else {
        console.error(`[install] ${caption} failed (exit ${code}): ${tail.slice(-500)}`)
        reject(new Error(m('install.depsFail', { cmd: caption, tail: tail.slice(-500) })))
      }
    })
  })
}

export function validateRepoUrl(url: string): string {
  const trimmed = url.trim()
  if (!/^(https?:\/\/|git@)[^\s]+\.git$/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error(m('install.repoUrlInvalid'))
  }
  if (/[\s;`$&|]/.test(trimmed)) throw new Error(m('dsh.illegalRepoChars'))
  return trimmed
}

export async function installFromGit(
  pagesDir: string,
  repoUrl: string,
  name?: string,
  port?: number,
  originUrl?: string,
  onProgress?: (p: InstallProgress) => void,
  opts?: ImportOptions
): Promise<string> {
  const url = validateRepoUrl(repoUrl)
  let dirName = (name || '').trim().replace(/[^\w.-]/g, '')
  if (!dirName) {
    const base = url.split('/').pop() || 'page'
    dirName = base.replace(/\.git$/i, '')
  }
  if (!dirName || dirName === '.' || dirName === '..') throw new Error(m('install.dirNameNeeded'))
  const target = join(pagesDir, dirName)
  if (existsSync(target)) throw new Error(m('dsh.pageExists', { id: dirName }))
  mkdirSync(pagesDir, { recursive: true })
  // Tag every tick with the external address (`source`) and target folder so the window-level
  // top progress bar can name the project and show where it is downloading from.
  const emit = (p: Partial<InstallProgress>): void =>
    onProgress?.({ op: 'git', phase: 'preparing', source: repoUrl, target: dirName, ...p } as InstallProgress)
  emit({ phase: 'preparing' })
  // Best-effort pre-flight: a conclusively-red repo (Rust/Go monorepo with no node entry, e.g.
  // openai/codex) is rejected from a few KB of raw-file probes *before* any clone, so a wrong
  // import never downloads a large tree nor re-downloads on every retry. Inconclusive falls through.
  const pre = await probeRemoteTier(url).catch(() => null)
  if (pre?.tier === 'red') {
    logEvent({ level: 'warn', kind: 'install.rejected', pageId: dirName, detail: pre.reason })
    throw new Error(m(pre.reason!, pre.reasonParams))
  }
  // Deep clone (not --depth 1): a later divergent history needs real merge bases to update.
  await cloneWithAuthFallback(target, url, (g) =>
    emit({ phase: 'receiving', percent: g.percent, message: gitCaption(g) })
  )
  if (originUrl && normalizeRepoUrl(originUrl) !== normalizeRepoUrl(url)) {
    try {
      await simpleGit({ baseDir: target }).remote(['set-url', 'origin', originUrl.trim()])
    } catch {
      /* keep the cloned URL as origin */
    }
  }
  emit({ phase: 'validating' })
  // Authoritative classify on the real tree: a repo the probe couldn't judge (non-GitHub host,
  // private, offline) is caught here. Deleting is correct for a genuine red — the message names
  // the unsupported stack, so the user won't retry expecting a different result.
  const cls = classifyProject(target)
  if (cls.tier === 'red') {
    rmSync(target, { recursive: true, force: true })
    logEvent({ level: 'warn', kind: 'install.rejected', pageId: dirName, detail: cls.reason })
    throw new Error(m(cls.reason!, cls.reasonParams))
  }
  applyPortOverride(dirName, port) // before validation: an entered port stands in for a missing declared one
  seedContainerManifest(pagesDir, dirName, port, cls)
  // A validate failure on a green/yellow tree is an anomaly, not a config problem worth a
  // re-download: keep the files so the row still appears (and can be fixed in the config dialog)
  // rather than rolling the clone back and forcing a full re-pull on retry.
  try {
    readPageMeta(pagesDir, dirName)
  } catch (err) {
    console.warn(`[installer] ${dirName}: seeded but readPageMeta failed (kept on disk):`, err)
    logEvent({
      level: 'warn',
      kind: 'install.needsConfig',
      pageId: dirName,
      detail: (err as Error).message
    })
  }
  await runInstallStep(target, cls, opts, emit)
  emit({ phase: 'done', percent: 100 })
  return dirName
}

/**
 * Run the optional dependency-install step shared by both import paths: a yellow project the user
 * opted into auto-installing gets `npm install` (streamed into the import bar's `install` phase);
 * a failure is surfaced as a warning and left non-fatal, so the page still lands in the list with
 * its files and a runnable manifest — the user can retry the install or start it later.
 */
async function runInstallStep(
  target: string,
  cls: ProjectClass,
  opts: ImportOptions | undefined,
  emit: (p: Partial<InstallProgress>) => void
): Promise<void> {
  if (!opts?.autoInstall || !cls.needsInstall) return
  emit({ phase: 'installing', message: 'npm install' })
  try {
    await installDeps(target, (line) => emit({ phase: 'installing', message: line }))
  } catch (err) {
    console.warn('[installer] dependency install failed (import kept):', (err as Error).message)
    logEvent({
      level: 'warn',
      kind: 'install.depsFailed',
      detail: (err as Error).message
    })
  }
}

/** A compact one-line caption from a git progress tick ("receiving (560/1234) 45%"). */
function gitCaption(g: CloneProgress): string {
  const cnt = g.total ? ` (${g.processed ?? 0}/${g.total})` : ''
  return `${g.stage}${cnt} ${g.percent}%`
}

/**
 * Split an npm package spec into name + version, handling `@scope/name@version` (the leading
 * `@` of a scoped name is not a version separator). Missing version means "latest". Throws on
 * anything that is not a plausible package name — the spec goes straight into an `npm install`
 * argument, so characters outside the npm name grammar are refused here, not by the shell.
 */
export function parseNpmSpec(spec: string): { pkg: string; version?: string } {
  const s = (spec || '').trim()
  if (!s) throw new Error(m('install.npmSpecNeeded'))
  const at = s.startsWith('@') ? s.indexOf('@', 1) : s.indexOf('@')
  const pkg = at === -1 ? s : s.slice(0, at)
  const version = at === -1 ? undefined : s.slice(at + 1)
  const validName = /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/[a-z0-9-._~]+|[a-z0-9-._~]+)$/i.test(pkg)
  const validVersion = version === undefined || /^[\w.+-]+$/.test(version)
  if (!pkg || !validName || !validVersion) {
    throw new Error(m('install.npmSpecInvalid', { spec: s }))
  }
  return { pkg, version }
}

/**
 * Import a published npm package as a *capability* — the cleanest way to host agent CLIs
 * (`@openai/codex`, `@anthropic-ai/claude-code`, …): the package's `bin` launcher runs under the
 * embedded terminal even when the tool itself is a native binary. The package installs under
 * `userData/capabilities/<id>` (a per-tool folder in the app-data dir, mirroring where dsh /
 * openclaw / mcp are provisioned), while `pages/<id>` keeps only a thin terminal manifest whose
 * `startCommand` launches the entry from that capability dir and which records `npmPackage` +
 * `capabilityDir` so 「帮助 ▸ 更新检测」 can compare the installed version against the registry and
 * re-provision it in place. A package that declares no runnable `bin` is rolled back.
 */
export async function installFromNpm(
  pagesDir: string,
  spec: string,
  name?: string,
  onProgress?: (p: InstallProgress) => void,
  capabilitiesDir = join(pagesDir, '..', 'capabilities')
): Promise<string> {
  const { pkg, version } = parseNpmSpec(spec)
  let dirName = (name || '').trim().replace(/[^\w.-]/g, '')
  if (!dirName) dirName = pkg.replace(/^@/, '').replace(/\//g, '-')
  if (!dirName || dirName === '.' || dirName === '..') throw new Error(m('install.dirNameNeeded'))
  const target = join(pagesDir, dirName)
  if (existsSync(target)) throw new Error(m('dsh.pageExists', { id: dirName }))
  // The capability's real files live in a sibling-of-pages store (userData/capabilities/<id>),
  // not in the page dir — the page keeps only its manifest.
  const capDir = join(capabilitiesDir, dirName)
  const specLabel = `${pkg}@${version || 'latest'}`
  // See installFromGit: expose the source spec + target folder to the top progress bar.
  const emit = (p: Partial<InstallProgress>): void =>
    onProgress?.({ op: 'npm', phase: 'preparing', source: specLabel, target: dirName, ...p } as InstallProgress)
  emit({ phase: 'preparing' })
  mkdirSync(capDir, { recursive: true })
  writeFileSync(
    join(capDir, 'package.json'),
    JSON.stringify({ name: dirName.toLowerCase(), version: '0.0.0', private: true }, null, 2) + '\n',
    'utf-8'
  )
  applyNpmRegistryEnv()
  const cli = bundledNpmCli()
  if (!existsSync(cli)) {
    rmSync(capDir, { recursive: true, force: true })
    throw new Error(m('install.npmMissing'))
  }
  // Indeterminate phase: npm has no byte progress, so stream its last output line as the caption.
  emit({ phase: 'installing', message: `npm install ${specLabel}` })
  try {
    await runStream(
      getNodeExePath(),
      [cli, 'install', specLabel, '--no-audit', '--no-fund'],
      capDir,
      `npm install ${specLabel}`,
      (line) => emit({ phase: 'installing', message: line }),
      // mirror the npm install into the new page's own log file, like a hosted page's output
      dirName
    )
  } catch (err) {
    // Nothing usable landed (bad name, unpublished version, registry offline) — remove the empty
    // capability store so a retry starts clean; the message already names the npm failure.
    rmSync(capDir, { recursive: true, force: true })
    throw err
  }
  emit({ phase: 'validating' })
  // Resolve the package's runnable bin inside the capability dir (shared with the MCP resolver:
  // string bin → use it; object bin → prefer the short-name key, else the first value).
  const entry = resolveMcpPkgEntry(pkg, capDir)
  if (!entry) {
    rmSync(capDir, { recursive: true, force: true })
    logEvent({ level: 'warn', kind: 'install.rejected', pageId: dirName, detail: 'install.npmNoBin' })
    throw new Error(m('install.npmNoBin', { pkg }))
  }
  // Thin terminal manifest in pages/<id>: no port, and the pty launches the resolved bin (quoted —
  // the capability dir may contain spaces): `node "<entry>"` for a JS launcher, the native binary
  // directly for a self-contained one like claude-code's claude.exe (see buildCapabilityStartCommand).
  // npmPackage/capabilityDir are what 更新检测 reads to offer a compare + re-provision against the registry.
  mkdirSync(target, { recursive: true })
  const manifest: ContainerManifest = {
    name: dirName,
    description: {
      zh: msgIn('zh', 'install.importedNpmDesc'),
      en: msgIn('en', 'install.importedNpmDesc')
    },
    kind: 'terminal',
    startCommand: buildCapabilityStartCommand(entry),
    npmPackage: pkg,
    capabilityDir: capDir
  }
  writeFileSync(join(target, 'container.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
  // Same non-fatal validation contract as the git/dir paths.
  try {
    readPageMeta(pagesDir, dirName)
  } catch (err) {
    console.warn(`[installer] ${dirName}: seeded but readPageMeta failed (kept on disk):`, err)
    logEvent({
      level: 'warn',
      kind: 'install.needsConfig',
      pageId: dirName,
      detail: (err as Error).message
    })
  }
  emit({ phase: 'done', percent: 100 })
  return dirName
}

interface CopyEntry {
  abs: string
  rel: string
  dir: boolean
  size: number
}

/**
 * Walk `root` collecting the files/dirs to copy and their total byte size, skipping
 * `node_modules` and `.git` at any depth — the same exclusions the old `cpSync` filter
 * applied. Sizes let the copy report a byte-weighted percentage.
 */
async function planCopy(root: string): Promise<{ entries: CopyEntry[]; totalBytes: number }> {
  const entries: CopyEntry[] = []
  let totalBytes = 0
  const walk = async (dir: string, relBase: string): Promise<void> => {
    const items = await readdir(dir, { withFileTypes: true })
    items.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const it of items) {
      if (it.name === 'node_modules' || it.name === '.git') continue
      const abs = join(dir, it.name)
      const rel = relBase ? `${relBase}/${it.name}` : it.name
      if (it.isDirectory()) {
        entries.push({ abs, rel, dir: true, size: 0 })
        await walk(abs, rel)
      } else if (it.isFile()) {
        const s = await stat(abs)
        entries.push({ abs, rel, dir: false, size: s.size })
        totalBytes += s.size
      }
    }
  }
  await walk(root, '')
  return { entries, totalBytes }
}

/** Copy `srcDir` into `target` file-by-file, emitting byte-weighted progress (throttled). */
async function copyDirWithProgress(
  srcDir: string,
  target: string,
  emit: (p: Partial<InstallProgress>) => void
): Promise<void> {
  const { entries, totalBytes } = await planCopy(srcDir)
  mkdirSync(target, { recursive: true })
  let received = 0
  let last = 0
  const report = (force = false): void => {
    const now = Date.now()
    if (!force && now - last < 100) return
    last = now
    emit({
      phase: 'receiving',
      percent: totalBytes ? Math.min(100, Math.floor((received / totalBytes) * 100)) : 100,
      received,
      total: totalBytes
    })
  }
  report(true)
  for (const e of entries) {
    const dest = join(target, e.rel)
    if (e.dir) {
      if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
      continue
    }
    await copyFile(e.abs, dest)
    received += e.size
    report()
  }
  report(true)
}

export async function installFromLocalDir(
  pagesDir: string,
  srcDir: string,
  name?: string,
  port?: number,
  originUrl?: string,
  onProgress?: (p: InstallProgress) => void,
  opts?: ImportOptions
): Promise<string> {
  if (!existsSync(srcDir) || !existsSync(join(srcDir, '.')))
    throw new Error(m('install.srcMissing', { dir: srcDir }))
  let dirName = (name || '').trim().replace(/[^\w.-]/g, '')
  if (!dirName) dirName = srcDir.split(/[\\/]/).filter(Boolean).pop() || ''
  if (!dirName) throw new Error(m('install.dirNameFail'))
  const target = join(pagesDir, dirName)
  if (existsSync(target)) throw new Error(m('dsh.pageExists', { id: dirName }))
  // See installFromGit: expose the source dir + target folder to the top progress bar.
  const emit = (p: Partial<InstallProgress>): void =>
    onProgress?.({ op: 'dir', phase: 'preparing', source: srcDir, target: dirName, ...p } as InstallProgress)
  emit({ phase: 'preparing' })
  // Gate *before* copying: a red project (Rust/Go/monorepo root, e.g. someone points the importer
  // at a local codex checkout) is rejected where the source lives, without duplicating a tree the
  // container can't run and then rolling it back.
  const cls = classifyProject(srcDir)
  if (cls.tier === 'red') {
    logEvent({ level: 'warn', kind: 'install.rejected', pageId: dirName, detail: cls.reason })
    throw new Error(m(cls.reason!, cls.reasonParams))
  }
  await copyDirWithProgress(srcDir, target, emit)
  emit({ phase: 'validating' })
  applyPortOverride(dirName, port) // before validation: an entered port stands in for a missing declared one
  // Generate the manifest BEFORE validation so a CLI is detected as `terminal` and survives
  // the entry check below (kind/startCommand come from the same classify verdict as the gate).
  seedContainerManifest(pagesDir, dirName, port, cls)
  // Like installFromGit: a validate failure on a green/yellow copy stays non-fatal and keeps the
  // files — the row appears in the list and can be fixed via the config dialog.
  try {
    readPageMeta(pagesDir, dirName)
  } catch (err) {
    console.warn(`[installer] ${dirName}: seeded but readPageMeta failed (kept on disk):`, err)
    logEvent({
      level: 'warn',
      kind: 'install.needsConfig',
      pageId: dirName,
      detail: (err as Error).message
    })
  }
  emit({ phase: 'finalizing' })
  await runInstallStep(target, cls, opts, emit)
  const origin = (originUrl || '').trim()
  if (origin) {
    try {
      await adoptOrigin(target, origin)
    } catch (err) {
      // Import already succeeded — an origin that failed to attach only costs auto-updates.
      console.warn('[installer] adoptOrigin failed (ignored):', (err as Error).message)
    }
  }
  emit({ phase: 'done', percent: 100 })
  return dirName
}

export function removePage(pagesDir: string, id: string): void {
  if (id === '__container__') throw new Error(m('install.cannotRemoveContainer'))
  if (BUILTIN_PAGE_IDS.has(id)) throw new Error(m('install.builtinUndeletable', { id }))
  const target = join(pagesDir, id)
  if (!target.startsWith(pagesDir + sep)) throw new Error(m('install.illegalPageId'))
  // An imported npm CLI keeps its real files in userData/capabilities/<id> (see installFromNpm) —
  // drop that store too so removing the page never orphans a globally-provisioned package.
  let capabilityDir: string | undefined
  try {
    const raw = JSON.parse(readFileSync(join(target, 'container.json'), 'utf-8')) as ContainerManifest
    if (typeof raw.capabilityDir === 'string' && raw.capabilityDir.trim()) capabilityDir = raw.capabilityDir.trim()
  } catch {
    /* no manifest / unreadable — only the page dir gets removed */
  }
  rmSync(target, { recursive: true, force: true })
  if (capabilityDir) rmSync(capabilityDir, { recursive: true, force: true })
  const { [id]: _dropped, ...pagePorts } = getSettings().pagePorts ?? {}
  // #4: drop the removed page's own dep override and any surviving reference to it, so a
  // deleted page can't linger as a dangling dep that would wedge another page's startWithDeps.
  const { [id]: _depDropped, ...pageDepsRest } = getSettings().pageDeps ?? {}
  const pageDeps: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(pageDepsRest)) {
    const kept = (v ?? []).filter((d) => d !== id)
    if (kept.length) pageDeps[k] = kept
  }
  updateSettings({ pagePorts, pageDeps })
}
