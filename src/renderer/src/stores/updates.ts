import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UpdateCheckResult, UpdateOutcome, UpdateProgress } from '@shared/types'
import { t } from '../i18n'

async function unwrap<T>(p: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const res = await p
  if (!res.ok) throw new Error(res.error || t('common.unknownError'))
  return res.data as T
}

export const useUpdatesStore = defineStore('updates', () => {
  const results = reactive<UpdateCheckResult[]>([])
  const checking = ref(false)
  /** 正在更新的行名集合：支持多行并发更新，每行各自流式进度。 */
  const updating = reactive(new Set<string>())
  const isUpdating = (name: string): boolean => updating.has(name)
  const lastCheckedAt = ref<number | null>(null)
  /** live download progress keyed by row name; only present while an update runs */
  const progress = reactive<Record<string, UpdateProgress>>({})
  /** 批量「全部更新」汇总：running 时展示总进度条，done/total 记录已完成行。 */
  const batch = reactive({ running: false, total: 0, done: 0 })

  /* ---- bundled-Node runtime upgrade ----
     Kept here (not in the panel component) so closing/reopening the Help panel mid-update
     still shows the running download instead of a blank row. */
  const nodeBusy = ref(false)
  const nodeProgress = ref<UpdateProgress | null>(null)

  // Subscribe once: the main process streams progress for the running update back here.
  // Guarded so the store still constructs where the preload bridge is absent (tests).
  window.container?.onUpdateProgress?.((p) => {
    if (p.phase === 'done') delete progress[p.name]
    else progress[p.name] = p
  })

  // Node-runtime download/extract progress arrives on its own channel; subscribing here
  // (store setup = app lifetime) keeps the bar alive across Help panel open/close.
  window.container?.onNodeUpdateProgress?.((p) => {
    nodeProgress.value = p.phase === 'done' ? null : p
  })

  const outdated = ref<UpdateCheckResult[]>([])

  /** Fold a fresh result set into state; shared by manual check and the silent survey. */
  function apply(list: UpdateCheckResult[]): void {
    results.splice(0, results.length, ...list)
    outdated.value = list.filter((r) => r.hasUpdate)
    lastCheckedAt.value = Date.now()
  }

  // The background survey (startup + every 30min) pushes results here; we refresh the
  // badge only — never flip `checking` or toast, since it must stay silent.
  window.container?.onUpdateResults?.((list) => {
    if (Array.isArray(list)) apply(list)
  })

  async function check(force = false): Promise<void> {
    checking.value = true
    try {
      const list = await unwrap<UpdateCheckResult[]>(window.container.checkUpdates(force))
      apply(list)
    } finally {
      checking.value = false
    }
  }

  /** 并发更新时把「各自刷新」合并成一次：短延时去抖，减少 checkUpdates 抖动。 */
  let checkTimer: ReturnType<typeof setTimeout> | undefined
  function scheduleCheck(delay = 600): void {
    if (checkTimer !== undefined) clearTimeout(checkTimer)
    checkTimer = setTimeout(() => {
      checkTimer = undefined
      void check(true).catch(() => undefined)
    }, delay)
  }

  /** Run one row's update; `pinned` installs an exact npm version over the channel latest.
      Concurrency-safe: keyed by row name in the `updating` Set, so several rows can run at once,
      each streaming its own progress. */
  async function perform(target: UpdateCheckResult, pinned?: string): Promise<void> {
    if (updating.has(target.name)) return
    updating.add(target.name)
    delete progress[target.name]
    try {
      // Strip Vue reactive proxy before IPC — structuredClone can't serialize proxies.
      const plain = JSON.parse(JSON.stringify(target)) as UpdateCheckResult
      const res = await unwrap<UpdateOutcome>(window.container.performUpdate(plain, pinned))
      if (res.message) ElMessage.success(res.message)
      else if (!res.ok)
        ElMessage.warning(res.error || t('updates.incomplete', { name: target.name }))
      else if (res.updated) ElMessage.success(t('updates.updated', { name: target.name }))
      if (res.ok && res.updated && target.isContainer) {
        // Staged on disk right now — re-check first so the whole table reflects the new state,
        // then force the container row to read 立即重启 even if that check raced or lagged, so
        // deferring the dialog can never strand the row on a stale 有更新 (a later re-check agrees).
        await check(true).catch(() => undefined)
        const row = results.find((r) => r.isContainer)
        if (row) {
          row.pendingRestart = true
          row.hasUpdate = false
        }
        try {
          await ElMessageBox.confirm(t('updates.relaunchConfirm'), t('updates.relaunchTitle'), {
            type: 'warning',
            confirmButtonText: t('updates.relaunchNow'),
            cancelButtonText: t('common.cancel')
          })
          await window.container.relaunchApp()
        } catch {
          /* user deferred the restart */
        }
        return
      }
      // Debounced re-check: during a batch, many rows finish around the same time and each
      // would otherwise fire its own checkUpdates; the short debounce collapses them.
      scheduleCheck()
    } catch (err) {
      ElMessage.error((err as Error).message)
    } finally {
      updating.delete(target.name)
      delete progress[target.name]
    }
  }

  /** 批量「全部更新」：并发跑所有「有更新」的行，batch 状态驱动总进度条。 */
  async function performAll(): Promise<void> {
    const targets = results.filter((r) => r.hasUpdate && r.canAutoUpdate && !updating.has(r.name))
    if (!targets.length) return
    batch.running = true
    batch.total = targets.length
    batch.done = 0
    try {
      await Promise.all(
        targets.map(async (r) => {
          try {
            await perform(r)
          } finally {
            batch.done += 1
          }
        })
      )
    } finally {
      batch.running = false
      batch.total = 0
      batch.done = 0
      await check(true).catch(() => undefined)
    }
  }

  /** Install a bundled-Node version override; throws on failure so the caller can toast. */
  async function updateNode(version: string): Promise<void> {
    if (nodeBusy.value) return
    nodeBusy.value = true
    nodeProgress.value = null
    try {
      const res = await window.container.nodeUpdate(version)
      if (!res.ok) throw new Error(res.error || 'update failed')
    } finally {
      nodeBusy.value = false
      nodeProgress.value = null
    }
  }

  /** Revert to the Node that shipped with the installer. */
  async function restoreNode(): Promise<void> {
    if (nodeBusy.value) return
    nodeBusy.value = true
    try {
      const res = await window.container.nodeRestoreBundled()
      if (!res.ok) throw new Error(res.error || 'restore failed')
    } finally {
      nodeBusy.value = false
    }
  }

  return {
    results,
    outdated,
    checking,
    updating,
    isUpdating,
    lastCheckedAt,
    progress,
    batch,
    nodeBusy,
    nodeProgress,
    check,
    perform,
    performAll,
    updateNode,
    restoreNode
  }
})
