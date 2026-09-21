import { ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * App-wide install status for the two optional runtimes (DSH / OpenClaw).
 *
 * The slim installer no longer ships them, so a hosted `dsh` / `openclaw` page cannot run until
 * its runtime has been provisioned into userData. This store is the single source the page
 * switcher and App guard read to decide whether such a page is operable, and SetupGate writes
 * back into after an install. It is deliberately separate from the pages store (which owns the
 * process lifecycle) — this is about the *CLI/runtime*, not the page process.
 */
export const useRuntimesStore = defineStore('runtimes', () => {
  const dshInstalled = ref(false)
  const openclawInstalled = ref(false)
  /** True once `refresh()` has resolved at least once — `false` before that means "unknown". */
  const loaded = ref(false)
  /** Bumped to ask SetupGate to (re)open the install guide from anywhere (e.g. a blocked page). */
  const reopenSignal = ref(0)

  async function refresh(): Promise<void> {
    const [dsh, oc] = await Promise.all([
      window.container.dshStatus().catch(() => null),
      window.container.openclawStatus().catch(() => null)
    ])
    dshInstalled.value = Boolean(dsh?.ok && (dsh.data as { installed?: boolean })?.installed)
    openclawInstalled.value = Boolean(
      oc?.ok && (oc.data as { installed?: boolean })?.installed
    )
    loaded.value = true
  }

  /** Force the SetupGate welcome page open (used when a page needs a missing runtime). */
  function requestGuide(): void {
    reopenSignal.value++
  }

  return { dshInstalled, openclawInstalled, loaded, reopenSignal, refresh, requestGuide }
})
