import { reactive, ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useTerminalStore } from './terminal'
import type { EnvVarSpec, InstallProgress, PageProgress } from '../../../shared/types'
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
  /** appears in the top-bar 应用 menu with the generic AppManager panel */
  manageAsApp?: boolean
  envVars?: EnvVarSpec[]
  status: 'stopped' | 'starting' | 'running' | 'error'
  pid?: number
  startedAt?: number
  exitCode?: number | null
  lastError?: string
  /** crash-guard: abnormal exits since the last stable run (reset after 5 min healthy) */
  crashes?: number
  /** crash-guard: epoch ms of the scheduled auto-restart, 0/undefined when none pending */
  nextRestartAt?: number
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
  const nodeInfo = reactive({ path: '', version: null as string | null, ok: false, override: false })
  const busy = reactive<Record<string, boolean>>({})
  /** Latest startup progress per page (phase + live log tail); cleared once it is up. */
  const progress = reactive<Record<string, PageProgress>>({})
  /** Live progress of the current page import (git clone / local copy); null when idle. */
  const installProgress = ref<InstallProgress | null>(null)
  /** Which import is in flight (survives the Pages panel closing/reopening, unlike component-local state). */
  const installing = ref<'git' | 'dir' | null>(null)

  const runningPages = computed(() => pages.filter((p) => p.status === 'running'))
  const installablePages = computed(() => pages.filter((p) => !p.external))

  async function refresh(): Promise<void> {
    const list = await unwrap<PageState[]>(window.container.listPages())
    pages.splice(0, pages.length, ...list)
    try {
      Object.assign(
        nodeInfo,
        await unwrap<{ path: string; version: string | null; ok: boolean; override: boolean }>(
          window.container.getNodeInfo()
        )
      )
    } catch {
      /* keep last */
    }
  }

  async function start(id: string): Promise<void> {
    busy[id] = true
    delete progress[id]
    try {
      await unwrap(window.container.startPage(id))
    } finally {
      delete busy[id]
      delete progress[id]
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

  /** Ask the main process to stop a page that is still booting, and drop its progress
      immediately so the boot overlay can clear without waiting on the port timeout. */
  async function cancel(id: string): Promise<void> {
    delete progress[id]
    delete busy[id]
    try {
      await unwrap(window.container.stopPage(id))
    } finally {
      await refresh()
    }
  }

  async function logs(id: string): Promise<string[]> {
    return unwrap<string[]>(window.container.getPageLogs(id))
  }

  async function installGit(url: string, name?: string, port?: number): Promise<string> {
    installing.value = 'git'
    installProgress.value = { op: 'git', phase: 'preparing' }
    try {
      const dirName = await unwrap<string>(window.container.installPageFromGit(url, name, port))
      await refresh()
      return dirName
    } finally {
      installing.value = null
      installProgress.value = null
    }
  }

  async function installDir(
    dir: string,
    name?: string,
    port?: number,
    originUrl?: string
  ): Promise<string> {
    installing.value = 'dir'
    installProgress.value = { op: 'dir', phase: 'preparing' }
    try {
      const dirName = await unwrap<string>(
        window.container.installPageFromDir(dir, name, port, originUrl)
      )
      await refresh()
      return dirName
    } finally {
      installing.value = null
      installProgress.value = null
    }
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

  window.container?.onPageProgress?.((p: PageProgress) => {
    if (p.phase === 'ready') delete progress[p.pageId]
    else progress[p.pageId] = p
  })

  window.container?.onInstallProgress?.((p: InstallProgress) => {
    // Ignore a stale 'done' if the op already finished (finally cleared it) so a late event
    // cannot re-show a completed bar after the panel is reopened.
    if (p.phase === 'done') {
      installProgress.value = null
      installing.value = null
      return
    }
    if (installing.value === null) return
    installProgress.value = p
  })

  return {
    pages,
    nodeInfo,
    busy,
    progress,
    installProgress,
    installing,
    runningPages,
    installablePages,
    refresh,
    start,
    stop,
    cancel,
    restart,
    logs,
    installGit,
    installDir,
    setPort,
    remove,
    openTerminal
  }
})
