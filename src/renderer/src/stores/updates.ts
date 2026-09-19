import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import type { UpdateCheckResult, UpdateOutcome } from '@shared/types'

async function unwrap<T>(p: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const res = await p
  if (!res.ok) throw new Error(res.error || '未知错误')
  return res.data as T
}

export const useUpdatesStore = defineStore('updates', () => {
  const results = reactive<UpdateCheckResult[]>([])
  const checking = ref(false)
  const updating = ref<string | null>(null)
  const lastCheckedAt = ref<number | null>(null)

  const outdated = ref<UpdateCheckResult[]>([])

  async function check(force = false): Promise<void> {
    checking.value = true
    try {
      const list = await unwrap<UpdateCheckResult[]>(window.container.checkUpdates(force))
      results.splice(0, results.length, ...list)
      outdated.value = list.filter((r) => r.hasUpdate)
      lastCheckedAt.value = Date.now()
    } finally {
      checking.value = false
    }
  }

  async function perform(target: UpdateCheckResult): Promise<void> {
    updating.value = target.name
    try {
      const res = await unwrap<UpdateOutcome>(window.container.performUpdate(target))
      if (res.message) ElMessage.success(res.message)
      else if (!res.ok) ElMessage.warning(res.error || `${target.name} 更新未完成`)
      else if (res.updated) ElMessage.success(`${target.name} 已更新`)
      await check(true)
    } catch (err) {
      ElMessage.error((err as Error).message)
    } finally {
      updating.value = null
    }
  }

  return { results, outdated, checking, updating, lastCheckedAt, check, perform }
})
