import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

/**
 * Shared state for 双屏模式 (split view). The control buttons live in the top menu bar
 * (MenuBar) while the panes they drive live in HomeView, so the state is lifted here —
 * the two components read/write the same store instead of prop-drilling through App.
 *
 * Only the durable part (on / collapsed / split / secId) is persisted to localStorage;
 * the runtime inputs (candidate pages + the URL currently on the main pane) are pushed in
 * by HomeView every render and never saved.
 */
export type CollapseSide = 'none' | 'main' | 'secondary'
/** Which pane the mouse last touched; the top-bar nav buttons act on this one. */
export type DualPane = 'main' | 'secondary'
export interface DualChoice {
  id: string
  label: string
  url: string
}

const LS_KEY = 'dsh.dualMode'

export const useDualStore = defineStore('dual', () => {
  interface Persist {
    on: boolean
    collapsed: CollapseSide
    split: number
    secId: string
  }
  const base: Persist = { on: false, collapsed: 'none', split: 50, secId: '' }
  let saved: Partial<Persist> = {}
  try {
    saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}') as Partial<Persist>
  } catch {
    /* private-mode / corrupt value: fall back to defaults */
  }
  const init = { ...base, ...saved }

  const on = ref(init.on)
  const collapsed = ref<CollapseSide>(init.collapsed)
  const split = ref(Math.min(85, Math.max(15, init.split)))
  const secId = ref(init.secId)

  /** Runtime inputs (not persisted): pages the secondary pane may show + the main URL. */
  const choices = ref<DualChoice[]>([])
  const mainUrl = ref('')
  /** Runtime-only (not persisted): the mouse-activated pane, always meaningful in dual mode. */
  const focusPane = ref<DualPane>('main')

  /** The pane nav/reload actions target; 'main' outside dual mode keeps single-screen semantics. */
  const activePane = computed<DualPane>(() => (on.value ? focusPane.value : 'main'))

  watch([on, collapsed, split, secId], () => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ on: on.value, collapsed: collapsed.value, split: split.value, secId: secId.value })
      )
    } catch {
      /* quota errors are non-fatal */
    }
  })

  /** `collapsed` names the side that is hidden — main hidden means collapsed === 'main'. */
  const showMain = computed(() => !on.value || collapsed.value !== 'main')
  const showSecondary = computed(() => on.value && collapsed.value !== 'secondary')
  const bothVisible = computed(() => on.value && collapsed.value === 'none')
  /** The page already on the main pane is excluded so the two panes never host it twice. */
  const secOptions = computed(() => choices.value.filter((c) => c.url !== mainUrl.value))
  const secondaryUrl = computed(
    () => choices.value.find((c) => c.id === secId.value)?.url || ''
  )

  function toggle(): void {
    on.value = !on.value
    if (on.value) collapsed.value = 'none'
  }
  function collapse(side: Exclude<CollapseSide, 'none'>): void {
    collapsed.value = collapsed.value === side ? 'none' : side
  }
  function setFocusPane(p: DualPane): void {
    focusPane.value = p
  }

  // A hidden pane can never hold the focus: collapsing / exiting dual mode pulls it back to main
  // so the top-bar buttons never aim at an unmounted webview.
  watch([on, showMain, showSecondary], () => {
    if (activePane.value === 'secondary' && (!on.value || !showSecondary.value)) {
      focusPane.value = 'main'
    } else if (!on.value) {
      focusPane.value = 'main'
    } else if (!showMain.value && focusPane.value === 'main') {
      focusPane.value = 'secondary'
    }
  })

  return {
    on,
    collapsed,
    split,
    secId,
    choices,
    mainUrl,
    focusPane,
    activePane,
    showMain,
    showSecondary,
    bothVisible,
    secOptions,
    secondaryUrl,
    toggle,
    collapse,
    setFocusPane
  }
})
