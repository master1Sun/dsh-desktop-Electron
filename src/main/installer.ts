import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'
import { readPageMeta, BUILTIN_PAGE_IDS, type ContainerManifest } from './pages'
import { getSettings, isValidPort, updateSettings } from './store'
import { m, msgIn } from './i18n'

const git: SimpleGit = simpleGit()

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
  port?: number
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
  await git.clone(url, target, ['--depth', '1'])
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

export function installFromLocalDir(
  pagesDir: string,
  srcDir: string,
  name?: string,
  port?: number
): string {
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
