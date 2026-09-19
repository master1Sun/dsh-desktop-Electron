import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'
import { readPageMeta, BUILTIN_PAGE_IDS } from './pages'
import { getSettings, isValidPort, updateSettings } from './store'

const git: SimpleGit = simpleGit()

/** Record the chosen port as a per-page override instead of editing the project's container.json. */
function applyPortOverride(dirName: string, port?: number): void {
  if (!isValidPort(port)) return
  updateSettings({ pagePorts: { ...getSettings().pagePorts, [dirName]: Number(port) } })
}

/** Imported projects that ship no container.json get a minimal one with the form-entered port,
    so the config lives with the project. Existing manifests are never rewritten. */
function seedContainerManifest(pagesDir: string, dirName: string, port?: number): void {
  if (!isValidPort(port)) return
  const metaFile = join(pagesDir, dirName, 'container.json')
  if (existsSync(metaFile)) return
  writeFileSync(
    metaFile,
    JSON.stringify(
      { name: dirName, port: Number(port), description: '导入时由容器生成' },
      null,
      2
    ) + '\n',
    'utf-8'
  )
}

export function validateRepoUrl(url: string): string {
  const trimmed = url.trim()
  if (!/^(https?:\/\/|git@)[^\s]+\.git$/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error('仓库地址需为 https 或 git@ 形式的 git URL')
  }
  if (/[\s;`$&|]/.test(trimmed)) throw new Error('仓库地址包含非法字符')
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
  if (!dirName || dirName === '.' || dirName === '..')
    throw new Error('无法推导目录名，请指定 name')
  const target = join(pagesDir, dirName)
  if (existsSync(target)) throw new Error(`pages/${dirName} 已存在`)
  mkdirSync(pagesDir, { recursive: true })
  await git.clone(url, target, ['--depth', '1'])
  applyPortOverride(dirName, port) // before validation: an entered port stands in for a missing declared one
  try {
    readPageMeta(pagesDir, dirName)
  } catch (err) {
    rmSync(target, { recursive: true, force: true })
    const { [dirName]: _dropped, ...pagePorts } = getSettings().pagePorts ?? {}
    updateSettings({ pagePorts })
    throw new Error(
      `克隆成功但缺少 container.json / 无法推断启动命令：${(err as Error).message}。请在设置页编辑该项目的 container.json。`
    )
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
    throw new Error(`目录不存在: ${srcDir}`)
  let dirName = (name || '').trim().replace(/[^\w.-]/g, '')
  if (!dirName) dirName = srcDir.split(/[\\/]/).filter(Boolean).pop() || ''
  if (!dirName) throw new Error('无法推导目录名')
  const target = join(pagesDir, dirName)
  if (existsSync(target)) throw new Error(`pages/${dirName} 已存在`)
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
  if (id === '__container__') throw new Error('不能移除容器本身')
  if (BUILTIN_PAGE_IDS.has(id)) throw new Error(`${id} 是容器内置页面，不可删除`)
  const target = join(pagesDir, id)
  if (!target.startsWith(pagesDir + sep)) throw new Error('非法 page id')
  rmSync(target, { recursive: true, force: true })
  const { [id]: _dropped, ...pagePorts } = getSettings().pagePorts ?? {}
  updateSettings({ pagePorts })
}
