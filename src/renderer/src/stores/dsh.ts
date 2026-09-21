import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { IpcResult } from '@shared/types'

/**
 * Transient state for the long-running dsh CLI operations (plugin install / uninstall).
 *
 * It lives in a store rather than in DshManager so that closing or switching away from the
 * DSH panel mid-operation doesn't drop the progress strip: the awaited IPC keeps running in
 * the main process, and this store's `busy` / `startedAt` survive the component unmount, so
 * reopening the panel still shows the in-flight op and its elapsed time.
 */
export const useDshStore = defineStore('dsh', () => {
  /** which op is in flight (`install:<spec>` / `uninstall:<name>`); null when idle. */
  const busy = ref<string | null>(null)
  /** epoch ms the current op started, so the elapsed timer can be recomputed after a remount. */
  const startedAt = ref(0)

  async function run(key: string, fn: () => Promise<IpcResult>): Promise<IpcResult> {
    if (busy.value) return { ok: false, error: '' }
    busy.value = key
    startedAt.value = Date.now()
    try {
      return await fn()
    } finally {
      busy.value = null
      startedAt.value = 0
    }
  }

  const installPlugin = (spec: string, profile: string): Promise<IpcResult> =>
    run(`install:${spec}`, () => window.container.dshInstallPlugin(spec, profile))

  const uninstallPlugin = (name: string, profile: string): Promise<IpcResult> =>
    run(`uninstall:${name}`, () => window.container.dshUninstallPlugin(name, profile))

  /** One pnpm pass updates every profile plugin; keyed so the progress strip can label it. */
  const updateAllPlugins = (profile: string): Promise<IpcResult> =>
    run('update:all', () => window.container.dshUpdateAll(profile))

  return { busy, startedAt, installPlugin, uninstallPlugin, updateAllPlugins }
})
