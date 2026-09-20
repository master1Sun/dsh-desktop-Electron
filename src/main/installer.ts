import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { simpleGit } from 'simple-git'
import { readPageMeta, BUILTIN_PAGE_IDS, type ContainerManifest } from './pages'
import { getSettings, isValidPort, updateSettings } from './store'
import { normalizeRepoUrl, cloneWithAuthFallback } from './git-updates'
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

/** Imported projects that ship no container.json get a minimal one with the form-entered port,
    so the config lives with the project. Existing manifests are never rewritten.

    The description is seeded in *both* languages: the file is the user's own and nothing
    rewrites it afterwards, so a single-language snapshot would pin this page to whichever
    language happened to be active at import time. */
function seedContainerManifest(pagesDir: string, dirName: string, port?: number): void {
  if (!isValidPort(port)) return
  const metaFile = join(pagesDir, dirName, 'container.json')
  if (existsSync(metaFile)) return
  const manifest: ContainerManifest = {
    name: dirName,
    port: Number(port),
    description: {
      zh: msgIn('zh', 'install.importedDesc'),
      en: msgIn('en', 'install.importedDesc')
    }
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
  originUrl?: string
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
  // Deep clone (not --depth 1): a later divergent history needs real merge bases to update.
  await cloneWithAuthFallback(target, url)
  if (originUrl && normalizeRepoUrl(originUrl) !== normalizeRepoUrl(url)) {
    try {
      await simpleGit({ baseDir: target }).remote(['set-url', 'origin', originUrl.trim()])
    } catch {
      /* keep the cloned URL as origin */
    }
  }
  applyPortOverride(dirName, port) // before validation: an entered port stands in for a missing declared one
  try {
    readPageMeta(pagesDir, dirName)
  } catch (err) {
    rmSync(target, { recursive: true, force: true })
    const { [dirName]: _dropped, ...pagePorts } = getSettings().pagePorts ?? {}
    updateSettings({ pagePorts })
    throw new Error(m('install.clonedNoEntry', { err: (err as Error).message }))
  }
  seedContainerManifest(pagesDir, dirName, port)
  return dirName
}

export async function installFromLocalDir(
  pagesDir: string,
  srcDir: string,
  name?: string,
  port?: number,
  originUrl?: string
): Promise<string> {
  if (!existsSync(srcDir) || !existsSync(join(srcDir, '.')))
    throw new Error(m('install.srcMissing', { dir: srcDir }))
  let dirName = (name || '').trim().replace(/[^\w.-]/g, '')
  if (!dirName) dirName = srcDir.split(/[\\/]/).filter(Boolean).pop() || ''
  if (!dirName) throw new Error(m('install.dirNameFail'))
  const target = join(pagesDir, dirName)
  if (existsSync(target)) throw new Error(m('dsh.pageExists', { id: dirName }))
  cpSync(srcDir, target, {
    recursive: true,
    filter: (src) =>
      !src.includes(`${join('', 'node_modules')}`) && !/[\\/]\.git([\\/]|$)/.test(src)
  })
  applyPortOverride(dirName, port) // before validation: an entered port stands in for a missing declared one
  try {
    readPageMeta(pagesDir, dirName)
  } catch (err) {
    rmSync(target, { recursive: true, force: true })
    const { [dirName]: _dropped, ...pagePorts } = getSettings().pagePorts ?? {}
    updateSettings({ pagePorts })
    throw err
  }
  seedContainerManifest(pagesDir, dirName, port)
  const origin = (originUrl || '').trim()
  if (origin) {
    try {
      await adoptOrigin(target, origin)
    } catch (err) {
      // Import already succeeded — an origin that failed to attach only costs auto-updates.
      console.warn('[installer] adoptOrigin failed (ignored):', (err as Error).message)
    }
  }
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
