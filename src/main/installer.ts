import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { copyFile, readdir, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { simpleGit } from 'simple-git'
import { readPageMeta, BUILTIN_PAGE_IDS, type ContainerManifest } from './pages'
import { getSettings, isValidPort, updateSettings } from './store'
import { normalizeRepoUrl, cloneWithAuthFallback, type CloneProgress } from './git-updates'
import type { InstallProgress } from '../shared/types'
import { m, msgIn } from './i18n'

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

/** Frameworks whose presence means “this project serves HTTP” → embed it as a `page`.
    A `bin`-only package without any of these is treated as a CLI (`terminal`). */
const SERVER_DEP_MARKERS = [
  'express',
  'koa',
  'fastify',
  '@nestjs',
  'hapi',
  'restify',
  'egg',
  'midway',
  'next',
  'nuxt',
  'astro',
  'remix',
  'hono',
  'polka',
  'socket.io',
  'strapi',
  'adonis',
  'feathers',
  'micro',
  'http-server',
  'graphql-yoga',
  'body-parser'
]

interface NpmPackage {
  bin?: string | Record<string, string>
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function readPkgSafe(dir: string): NpmPackage | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as NpmPackage
  } catch {
    return null
  }
}

/** Any server framework in dependencies/devDependencies marks the project as a web program. */
function hasServerDependency(pkg: NpmPackage | null): boolean {
  if (!pkg) return false
  const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
  return Object.keys(all).some((n) => {
    const k = n.toLowerCase()
    return SERVER_DEP_MARKERS.some((mk) => k === mk || k.startsWith(`${mk}/`) || k.includes(mk))
  })
}

/** A runnable command for a CLI project in the embedded terminal: prefer a `start` script,
    else invoke the declared `bin` entry directly. Returns null when neither is present. */
function cliStartCommand(dir: string, pkg: NpmPackage | null): string | null {
  if (pkg?.scripts?.start) return 'npm run start'
  const bin = pkg?.bin
  let rel: string | null = null
  if (typeof bin === 'string') rel = bin
  else if (bin && typeof bin === 'object') rel = Object.values(bin)[0] ?? null
  if (rel) {
    const clean = rel.replace(/^\.\//, '')
    if (existsSync(join(dir, clean))) return `node ${clean}`
  }
  return null
}

/**
 * An imported project that ships no container.json gets a generated one, so the config lives
 * with the project and the Pages panel shows a concrete kind instead of a bare guess. We infer
 * CLI vs web program from package.json:
 *   - a `bin`-only package with no HTTP-framework dependency is a command-line tool → run it in
 *     the embedded terminal (kind 'terminal' + a start command; no port to wait for);
 *   - anything else is treated as an embeddable web program (kind 'page'), carrying the form port.
 * The manifest is written BEFORE readPageMeta validates the clone, so a CLI (which has no server
 * entry to infer) is not mistaken for a broken page and rolled back. Existing manifests are
 * never rewritten, and the description is seeded in *both* languages so the page is not pinned to
 * whichever language happened to be active at import time.
 */
function seedContainerManifest(pagesDir: string, dirName: string, port?: number): void {
  const dir = join(pagesDir, dirName)
  const metaFile = join(dir, 'container.json')
  if (existsSync(metaFile)) return
  const pkg = readPkgSafe(dir)
  const manifest: ContainerManifest = {
    name: dirName,
    description: {
      zh: msgIn('zh', 'install.importedDesc'),
      en: msgIn('en', 'install.importedDesc')
    }
  }
  if (pkg?.bin && !hasServerDependency(pkg)) {
    const start = cliStartCommand(dir, pkg)
    if (start) {
      manifest.kind = 'terminal'
      manifest.startCommand = start
    } else {
      // A CLI we cannot derive a runnable command for: leave it a plain page so the usual
      // entry inference (server.js / index.js / start script) still has its chance.
      manifest.kind = 'page'
      if (isValidPort(port)) manifest.port = Number(port)
    }
  } else {
    manifest.kind = 'page'
    if (isValidPort(port)) manifest.port = Number(port)
  }
  writeFileSync(metaFile, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
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
  onProgress?: (p: InstallProgress) => void
): Promise<string> {
  const emit = (p: Partial<InstallProgress>): void =>
    onProgress?.({ op: 'git', phase: 'preparing', ...p } as InstallProgress)
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
  // Deep clone (not --depth 1): a later divergent history needs real merge bases to update.
  emit({ phase: 'preparing' })
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
  applyPortOverride(dirName, port) // before validation: an entered port stands in for a missing declared one
  // Generate the manifest BEFORE validation so a CLI (no inferable server entry) is recognised
  // as `terminal` here instead of being rolled back below as an apparently unrunnable page.
  seedContainerManifest(pagesDir, dirName, port)
  try {
    readPageMeta(pagesDir, dirName)
  } catch (err) {
    rmSync(target, { recursive: true, force: true })
    const { [dirName]: _dropped, ...pagePorts } = getSettings().pagePorts ?? {}
    updateSettings({ pagePorts })
    throw new Error(m('install.clonedNoEntry', { err: (err as Error).message }))
  }
  emit({ phase: 'finalizing' })
  emit({ phase: 'done', percent: 100 })
  return dirName
}

/** A compact one-line caption from a git progress tick ("receiving (560/1234) 45%"). */
function gitCaption(g: CloneProgress): string {
  const cnt = g.total ? ` (${g.processed ?? 0}/${g.total})` : ''
  return `${g.stage}${cnt} ${g.percent}%`
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
  onProgress?: (p: InstallProgress) => void
): Promise<string> {
  const emit = (p: Partial<InstallProgress>): void =>
    onProgress?.({ op: 'dir', phase: 'preparing', ...p } as InstallProgress)
  if (!existsSync(srcDir) || !existsSync(join(srcDir, '.')))
    throw new Error(m('install.srcMissing', { dir: srcDir }))
  let dirName = (name || '').trim().replace(/[^\w.-]/g, '')
  if (!dirName) dirName = srcDir.split(/[\\/]/).filter(Boolean).pop() || ''
  if (!dirName) throw new Error(m('install.dirNameFail'))
  const target = join(pagesDir, dirName)
  if (existsSync(target)) throw new Error(m('dsh.pageExists', { id: dirName }))
  emit({ phase: 'preparing' })
  await copyDirWithProgress(srcDir, target, emit)
  emit({ phase: 'validating' })
  applyPortOverride(dirName, port) // before validation: an entered port stands in for a missing declared one
  // Generate the manifest BEFORE validation so a CLI is detected as `terminal` and survives
  // the entry check below (a rolled-back import removes the whole dir, seeded manifest included).
  seedContainerManifest(pagesDir, dirName, port)
  try {
    readPageMeta(pagesDir, dirName)
  } catch (err) {
    rmSync(target, { recursive: true, force: true })
    const { [dirName]: _dropped, ...pagePorts } = getSettings().pagePorts ?? {}
    updateSettings({ pagePorts })
    throw err
  }
  emit({ phase: 'finalizing' })
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
  rmSync(target, { recursive: true, force: true })
  const { [id]: _dropped, ...pagePorts } = getSettings().pagePorts ?? {}
  updateSettings({ pagePorts })
}
