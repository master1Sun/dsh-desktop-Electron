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
  const updating = ref<string | null>(null)
  const lastCheckedAt = ref<number | null>(null)
  /** live download progress keyed by row name; only present while an update runs */
  const progress = reactive<Record<string, UpdateProgress>>({})

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

  async function perform(target: UpdateCheckResult): Promise<void> {
    updating.value = target.name
    delete progress[target.name]
    try {
      // Strip Vue reactive proxy before IPC — structuredClone can't serialize proxies.
      const plain = JSON.parse(JSON.stringify(target)) as UpdateCheckResult
      const res = await unwrap<UpdateOutcome>(window.container.performUpdate(plain))
      if (res.message) ElMessage.success(res.message)
      else if (!res.ok)
        ElMessage.warning(res.error || t('updates.incomplete', { name: target.name }))
      else if (res.updated) ElMessage.success(t('updates.updated', { name: target.name }))
      if (res.ok && res.updated && target.isContainer) {
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
      await check(true)
    } catch (err) {
      ElMessage.error((err as Error).message)
    } finally {
      updating.value = null
      delete progress[target.name]
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
    lastCheckedAt,
    progress,
    nodeBusy,
    nodeProgress,
    check,
    perform,
    updateNode,
    restoreNode
  }
})
