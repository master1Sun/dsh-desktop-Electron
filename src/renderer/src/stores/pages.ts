import { reactive, computed } from 'vue'
import { defineStore } from 'pinia'
import { useTerminalStore } from './terminal'
import type { EnvVarSpec } from '../../../shared/types'
import { t } from '../i18n'

export interface PageState {
  id: string
  name: string
  dir: string
  port: number
  /** effective port: the user override when set, else `port` */
  containerPort?: number
  startCommand: string
  description?: string
  external?: boolean
  externalUrl?: string
  kind?: 'page' | 'dsh' | 'openclaw' | 'terminal'
  dshProfile?: string
  envVars?: EnvVarSpec[]
  status: 'stopped' | 'starting' | 'running' | 'error'
  pid?: number
  startedAt?: number
  exitCode?: number | null
  lastError?: string
  url?: string
  launchUrl?: string
}

async function unwrap<T>(p: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const res = await p
  if (!res.ok) throw new Error(res.error || t('common.unknownError'))
  return res.data as T
}

export const usePagesStore = defineStore('pages', () => {
  const pages = reactive<PageState[]>([])
  const nodeInfo = reactive({ path: '', version: null as string | null, ok: false })
  const busy = reactive<Record<string, boolean>>({})

  const runningPages = computed(() => pages.filter((p) => p.status === 'running'))
  const installablePages = computed(() => pages.filter((p) => !p.external))

  async function refresh(): Promise<void> {
    const list = await unwrap<PageState[]>(window.container.listPages())
    pages.splice(0, pages.length, ...list)
    try {
      Object.assign(
        nodeInfo,
        await unwrap<{ path: string; version: string | null; ok: boolean }>(
          window.container.getNodeInfo()
        )
      )
    } catch {
      /* keep last */
    }
  }

  async function start(id: string): Promise<void> {
    busy[id] = true
    try {
      await unwrap(window.container.startPage(id))
    } finally {
      delete busy[id]
      await refresh()
    }
  }

  async function stop(id: string): Promise<void> {
    busy[id] = true
    try {
      await unwrap(window.container.stopPage(id))
    } finally {
      delete busy[id]
      await refresh()
    }
  }

  async function restart(id: string): Promise<void> {
    busy[id] = true
    try {
      await unwrap(window.container.restartPage(id))
    } finally {
      delete busy[id]
      await refresh()
    }
  }

  async function logs(id: string): Promise<string[]> {
    return unwrap<string[]>(window.container.getPageLogs(id))
  }

  async function installGit(url: string, name?: string, port?: number): Promise<string> {
    const dirName = await unwrap<string>(window.container.installPageFromGit(url, name, port))
    await refresh()
    return dirName
  }

  async function installDir(dir: string, name?: string, port?: number): Promise<string> {
    const dirName = await unwrap<string>(window.container.installPageFromDir(dir, name, port))
    await refresh()
    return dirName
  }

  /** Change (or clear with 0) a page's port; takes effect on its next start. */
  async function setPort(id: string, port?: number): Promise<void> {
    await unwrap(window.container.setPagePort(id, port))
    await refresh()
  }

  async function remove(id: string): Promise<void> {
    await unwrap(window.container.removePage(id))
    await refresh()
  }

  async function openTerminal(target: string, title?: string): Promise<void> {
    await useTerminalStore().start(target, title || target)
  }

  window.container?.onStateChanged?.(() => {
    refresh().catch(() => undefined)
  })

  return {
    pages,
    nodeInfo,
    busy,
    runningPages,
    installablePages,
    refresh,
    start,
    stop,
    restart,
    logs,
    installGit,
    installDir,
    setPort,
    remove,
    openTerminal
  }
})
