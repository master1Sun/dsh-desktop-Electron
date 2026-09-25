import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { DshUpdateChannel, IpcResult } from '@shared/types'

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
  /**
   * Live pnpm/dsh output lines for the in-flight install, streamed from main as `line` events.
   * Kept in the store (not the panel) so closing/reopening the DSH panel mid-install still shows
   * the accumulated log. Capped so a very chatty install cannot grow unbounded.
   */
  const installOutput = ref<string[]>([])
  const INSTALL_OUTPUT_CAP = 800
  /** the spec whose install we currently mirror output for; '' when none. */
  let trackingSpec = ''

  // Subscribe once for the store's lifetime: main broadcasts every plugin op to all windows, so
  // we filter to the tracked install and append its output line. Optional-chained for the test
  // environment where the preload bridge is absent.
  window.container?.onDshPluginOp?.((p): void => {
    if (!p.line || p.done) return
    if (trackingSpec && p.name === trackingSpec) {
      installOutput.value.push(p.line)
      if (installOutput.value.length > INSTALL_OUTPUT_CAP)
        installOutput.value.splice(0, installOutput.value.length - INSTALL_OUTPUT_CAP)
    }
  })

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

  const installPlugin = (spec: string, profile: string): Promise<IpcResult> => {
    installOutput.value = []
    trackingSpec = spec.trim()
    return run(`install:${spec}`, () => window.container.dshInstallPlugin(spec, profile)).finally(
      () => {
        trackingSpec = ''
      }
    )
  }

  const uninstallPlugin = (name: string, profile: string): Promise<IpcResult> =>
    run(`uninstall:${name}`, () => window.container.dshUninstallPlugin(name, profile))

  /** One pnpm pass updates every profile plugin; keyed so the progress strip can label it. */
  const updateAllPlugins = (profile: string): Promise<IpcResult> =>
    run('update:all', () => window.container.dshUpdateAll(profile))

  /**
   * Update a single plugin through the channel the check picked (npm/git, gitUrl = repo#tag).
   * Keyed by the bare plugin name — the same key `installPlugin` uses for a `name@version`
   * spec — so a git→npm flip (which re-installs that spec in main) still marks this row busy.
   */
  const updatePlugin = (
    name: string,
    channel: DshUpdateChannel,
    profile: string,
    gitUrl?: string
  ): Promise<IpcResult> =>
    run(name, () => window.container.dshUpdatePlugin(name, channel, gitUrl, profile))

  return {
    busy,
    startedAt,
    installOutput,
    installPlugin,
    uninstallPlugin,
    updatePlugin,
    updateAllPlugins
  }
})
