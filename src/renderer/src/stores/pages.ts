import { reactive, ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useTerminalStore } from './terminal'
import type { ImportOptions, InstallProgress, PageProgress, PageState } from '../../../shared/types'
import { t } from '../i18n'

/**
 * The one page-row shape, straight from `src/shared`: the main process is the only writer (every
 * field arrives on the `ListPages` payload), so restating it here could only drift — and it did,
 * silently dropping each newly added manifest field from every typed consumer in the renderer.
 */
export type { PageState }

async function unwrap<T>(p: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const res = await p
  if (!res.ok) throw new Error(res.error || t('common.unknownError'))
  return res.data as T
}

export const usePagesStore = defineStore('pages', () => {
  const pages = reactive<PageState[]>([])
  const nodeInfo = reactive({
    path: '',
    version: null as string | null,
    ok: false,
    override: false
  })
  /** True once the first refresh() has actually reported Node; `ok:false` before that just means "unknown". */
  const nodeInfoLoaded = ref(false)
  const busy = reactive<Record<string, boolean>>({})
  /** Latest startup progress per page (phase + live log tail); cleared once it is up. */
  const progress = reactive<Record<string, PageProgress>>({})
  /** Live progress of the current page import (git clone / local copy); null when idle. */
  const installProgress = ref<InstallProgress | null>(null)
  /** Which import is in flight (survives the Pages panel closing/reopening, unlike component-local state). */
  const installing = ref<'git' | 'dir' | 'npm' | null>(null)

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
      nodeInfoLoaded.value = true
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

  async function installGit(
    url: string,
    name?: string,
    port?: number,
    opts?: ImportOptions
  ): Promise<string> {
    installing.value = 'git'
    installProgress.value = { op: 'git', phase: 'preparing' }
    try {
      const dirName = await unwrap<string>(
        window.container.installPageFromGit(url, name, port, opts)
      )
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
    originUrl?: string,
    opts?: ImportOptions
  ): Promise<string> {
    installing.value = 'dir'
    installProgress.value = { op: 'dir', phase: 'preparing' }
    try {
      const dirName = await unwrap<string>(
        window.container.installPageFromDir(dir, name, port, originUrl, opts)
      )
      await refresh()
      return dirName
    } finally {
      installing.value = null
      installProgress.value = null
    }
  }

  /** Install a published npm CLI package (needs a bin) as a terminal page. */
  async function installNpm(spec: string, name?: string): Promise<string> {
    installing.value = 'npm'
    installProgress.value = { op: 'npm', phase: 'preparing' }
    try {
      const dirName = await unwrap<string>(window.container.installPageFromNpm(spec, name))
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
    nodeInfoLoaded,
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
    installNpm,
    setPort,
    remove,
    openTerminal
  }
})
