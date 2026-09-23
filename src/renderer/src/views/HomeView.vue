<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import MarketView from '../views/MarketView.vue'
import { t, locale } from '../i18n'
import { useDualStore, type DualPane } from '../stores/dual'
import whaleIcon from '../assets/whale.png'

const props = defineProps<{
  /** Every page opened this session, one mounted <webview> each. Switching only toggles
      visibility so a guest session (openclaw's one-time token, dsh terminals) survives.
      `hosted` distinguishes a container-managed page from an external preview. */
  sessions: { id: string; url: string; hosted?: boolean }[]
  /** Session currently on screen; null while the market / a CLI terminal owns the surface. */
  activeId: string | null
  loading: boolean
  /** Persistent-services mode: a hosted page can flip to running before its first composited
      frame lands (black until refresh), so the first DOM ready gets a one-shot reload. */
  repaintHostedFirst?: boolean
  startingText?: string
  /** Current boot phase label streamed from the main process (empty until the first event). */
  phaseText?: string
  /** Tail of the booting page's logs, shown behind an expand toggle. */
  logs?: string[]
  /** Boot has taken long enough to warrant a "first launch is slow" expectation-setter. */
  slow?: boolean
  /** Elapsed-time chip text (e.g. "已等待 12s"). */
  elapsedText?: string
  /** Show the market view as an overlay ON TOP of the webview — the embedded page
      stays mounted (its right-sidebar terminal survives), only hidden. */
  marketActive?: boolean
  /** The webview currently shows a loaded external address: keep its popups / new-window
      navigations in-place (browser-like) instead of bouncing to the system browser. */
  externalView?: boolean
  /** Pages the secondary pane can show (running web pages + external sites). */
  secondaryChoices?: { id: string; label: string; url: string }[]
}>()

const emit = defineEmits<{
  'guest-stop-loading': []
  'install-pages': []
  'cancel-start': []
  'open-panel': [panel: string]
  /** Webview history state, pushed to App so the top-bar back / forward buttons enable. */
  'nav-state': [state: { back: boolean; forward: boolean }]
}>()

/** Whether the boot log tail is expanded; resets naturally as the overlay unmounts. */
const showLogs = ref(false)

/* ---- Fun rotating tips during boot ---- */
const TIPS: Record<string, string[]> = {
  zh: [
    '🐋 鲸鱼正在游向目的地…',
    '🌊 深海探索需要一点时间…',
    '🚀 引擎预热中，马上就好…',
    '☕ 不妨先去倒杯咖啡…',
    '💡 首次启动较慢，之后就快了',
    '🎵 放首喜欢的歌听听？',
    '✨ 再稍等一下，胜利在望…',
    '🐬 海豚说：好的东西值得等待'
  ],
  en: [
    '🐋 Swimming to the destination…',
    '🌊 Deep-sea exploration takes a moment…',
    '🚀 Warming up the engines…',
    '☕ Maybe grab a coffee?',
    '💡 First boot is slower; subsequent ones are fast',
    '🎵 Put on a favorite tune?',
    '✨ Almost there, hang tight…',
    '🐬 Dolphins say: good things come to those who wait'
  ]
}
const tipIdx = ref(0)
const currentTip = computed(() => {
  const list = TIPS[locale.value] || TIPS.zh
  return list[tipIdx.value % list.length]
})
let tipTimer: ReturnType<typeof setInterval> | null = null
watch(
  () => props.startingText,
  (val) => {
    if (tipTimer) {
      clearInterval(tipTimer)
      tipTimer = null
    }
    if (val) {
      tipIdx.value = Math.floor(Math.random() * 8)
      tipTimer = setInterval(() => tipIdx.value++, 3500)
    }
  }
)
onBeforeUnmount(() => {
  if (tipTimer) clearInterval(tipTimer)
})

/** Per-page mounted <webview> elements, keyed by session id. */
const webviewEls = ref<Record<string, HTMLElement | null>>({})
function setWebviewRef(id: string, el: unknown): void {
  webviewEls.value[id] = (el as HTMLElement | null) || null
}

/** The session on screen; drives the loading overlay + the top-bar nav buttons. */
const activeUrl = computed(
  () => props.sessions.find((s) => s.id === props.activeId)?.url || ''
)

/** Minimal slice of the Electron <webview> API used for in-page history navigation. */
interface WebviewNav {
  canGoBack?: boolean
  canGoForward?: boolean
  goBack?: () => void
  goForward?: () => void
  reload?: () => void
  loadURL?: (url: string) => Promise<void>
  isLoading?: () => boolean
}
const guest = (id: string | null = props.activeId): WebviewNav | null =>
  (id && (webviewEls.value[id] as unknown as WebviewNav)) || null

/** Last pushed nav state, so syncNav only emits when it actually changes. */
const nav = ref({ back: false, forward: false })
/** The secondary pane's own history state — kept beside `nav` so the top-bar buttons can
    flip between panes (mouse-activated) without re-probing the webviews. */
const secNav = ref({ back: false, forward: false })
/** Emit whichever pane the dual store says is active (main outside dual mode). */
function emitActiveNav(): void {
  const next = dualStore.activePane === 'secondary' ? { ...secNav.value } : { ...nav.value }
  emit('nav-state', next)
}
function syncNav(id: string): void {
  if (id !== props.activeId) return
  const el = guest(id)
  const next = { back: Boolean(el?.canGoBack), forward: Boolean(el?.canGoForward) }
  if (next.back !== nav.value.back || next.forward !== nav.value.forward) {
    nav.value = next
  }
  if (dualStore.activePane === 'main') emit('nav-state', nav.value)
}
function syncSecNav(): void {
  const el = secWebviewEl.value as unknown as WebviewNav | null
  const next = { back: Boolean(el?.canGoBack), forward: Boolean(el?.canGoForward) }
  if (next.back !== secNav.value.back || next.forward !== secNav.value.forward) {
    secNav.value = next
  }
  if (dualStore.activePane === 'secondary') emit('nav-state', secNav.value)
}

// Moving the mouse into a pane re-aims the top-bar buttons — the watcher that pushes the
// newly-active pane's nav state lives in the dual section below (after `dualStore`).

/** Back / forward for the embedded webview, driven by the top-bar nav buttons.
 *  Only a MOUNTED secondary webview can hold the aim — when the pane is collapsed or has
 *  no url, fall back to the main guest instead of firing into null. */
function navTarget(): WebviewNav | null {
  if (dualStore.activePane === 'secondary' && secWebviewEl.value) {
    return secWebviewEl.value as unknown as WebviewNav
  }
  return guest()
}
function goBack(): void {
  navTarget()?.goBack?.()
}
function goForward(): void {
  navTarget()?.goForward?.()
}

/**
 * Top-bar reload: refresh the guest IN PLACE without touching its URL. Re-pointing src
 * (even by a `#…` hash) makes openclaw's Control UI see a different gateway address and
 * pop its "switch gateway?" confirm on every refresh.
 */
function reload(): boolean {
  const g = guest()
  if (!g?.reload) return false
  g.reload()
  return true
}

// A fresh src (page / external switch) starts a new history stack — reflect it at once.
watch(activeUrl, () => {
  nav.value = { back: false, forward: false }
  if (dualStore.activePane === 'main') emit('nav-state', nav.value)
})

function onStopLoading(id: string): void {
  if (id === props.activeId) emit('guest-stop-loading')
}

/* ---- first-open repaint (persistent-services black screen) ----
   Only the app's FIRST launch of a hosted page blacks out: in persistent mode (and, since adopt now
   really survives a quit on Windows, on every reopen too) the row flips to `running` the instant the
   port answers, so the <webview> navigates before the guest has produced a visible frame. The DOM
   ends up fully there (Elements populated, the token URL correct) yet the surface reads black until a
   manual refresh; page switching can't recover it (it only flips v-show) and a size nudge is ignored,
   so the ONE proven lever is a reload of the SAME URL — it never re-navigates away, so an openclaw
   one-time token / a live dsh session survive. Two triggers, because adopt has two failure shapes:
   (1) did-STOP-loading (the whole doc + subresources settled — closest to when a human presses F5;
   did-finish-load fires too early for the SPA to have painted), and (2) an active-session fallback for
   the fast adopt where navigation finishes BEFORE Vue binds the @did-* listeners, so no load event
   reaches us at all. Both are once-per-session (the reload re-fires the events, the Set stops the
   loop) and scoped to container-hosted pages in persistent mode via the repaintHostedFirst prop. */
const repaintedHosted = new Set<string>()

function onDomReady(id: string): void {
  syncNav(id)
  onStopLoading(id)
}

/** Force the fresh frame the exact way the user's manual F5 does — reload the SAME url, so an
    openclaw one-time token / a live dsh session survive (the URL never changes). At most once per
    session; the reload itself re-fires the load events, and the Set is what stops it looping. */
function maybeRepaintHosted(id: string): void {
  if (!props.repaintHostedFirst || repaintedHosted.has(id)) return
  if (!props.sessions.find((s) => s.id === id)?.hosted) return
  repaintedHosted.add(id)
  setTimeout(() => guest(id)?.reload?.(), 120)
}

/** did-stop-loading = the settled state a user would refresh from; the primary repaint trigger. */
function onDidStopLoading(id: string): void {
  onStopLoading(id)
  maybeRepaintHosted(id)
}

// Active-session fallback for the adopt fast path (see block comment). Give the real load a beat, then
// if the guest already reports "not loading" it navigated in the listener-binding gap — force the same
// one-shot reload. A still-booting page correctly reports isLoading()===true and is left to did-stop.
watch(
  () => props.activeId,
  (id) => {
    if (!id) return
    void nextTick(() =>
      setTimeout(() => {
        if (repaintedHosted.has(id)) return
        const g = guest(id)
        if (g && g.isLoading?.() === false) maybeRepaintHosted(id)
      }, 600)
    )
  },
  { immediate: true }
)

/**
 * Keep window.open / target=_blank inside the SAME embedded page — never pop a window or
 * hand off to the system browser. The main process also installs this on the guest's
 * webContents (authoritative); this renderer handler is the fallback when the event still
 * reaches the <webview> element.
 */
function onNewWindow(ev: Event): void {
  ev.preventDefault()
  const url = (ev as unknown as Event & { url: string }).url
  if (url) void guest()?.loadURL?.(url)?.catch(() => undefined)
}

/* ---- 双屏模式 (split view) ----
   State lives in the shared `dual` store so the menu-bar controls and these panes stay in
   sync. The main pane keeps the active page mounted (a booted guest is never reloaded); the
   secondary pane is one independent <webview> pointed at any running page / external site.
   A draggable divider resizes the split; either pane can collapse to a lone full-width screen. */
const dualStore = useDualStore()
const dragging = ref(false)
/** The secondary pane's lone <webview>; the nav helpers above aim at it when it holds focus. */
const secWebviewEl = ref<HTMLElement | null>(null)

// Push the runtime inputs the store's picker needs: candidate pages + the URL on the main pane.
watch(
  () => props.secondaryChoices,
  (v) => {
    dualStore.choices = v || []
  },
  { immediate: true, deep: true }
)
watch(activeUrl, (v) => (dualStore.mainUrl = v), { immediate: true })

// A new secondary URL is a fresh history stack — drop the stale buttons before the guest
// reloads, then re-sync once the webview fires its own navigation events.
watch(
  () => dualStore.secondaryUrl,
  () => {
    secNav.value = { back: false, forward: false }
    if (dualStore.activePane === 'secondary') emit('nav-state', secNav.value)
  }
)

// Mouse moved into another pane: push that pane's nav state to the top-bar buttons at once.
watch(() => dualStore.activePane, emitActiveNav)

/* ---- 鼠标激活分页 (pane aim) ----
   The top-bar nav buttons act on the pane the mouse last visited. Template `mouseenter`
   alone proved unreliable (fast sweeps between panes can skip it), so each pane ALSO gets
   a capture-phase `pointerenter`/`pointermove` pair: those fire no matter which child (incl.
   overlay layers) the pointer actually hits, and re-assert on every move. The webview
   `activate` event (guest regains focus without a host-side pointer event) re-aims too —
   that is the authoritative Electron event for "the mouse clicked INTO the guest". */
function setPaneAim(el: HTMLElement | null, pane: DualPane): void {
  if (!el) return
  const aim = (): void => dualStore.setFocusPane(pane)
  el.addEventListener('pointerenter', aim, true)
  el.addEventListener('pointermove', aim, true)
}
const mainPaneEl = ref<HTMLElement | null>(null)
const secPaneEl = ref<HTMLElement | null>(null)
watch(mainPaneEl, (el) => setPaneAim(el, 'main'))
watch(secPaneEl, (el) => setPaneAim(el, 'secondary'))

const mainStyle = computed(() =>
  dualStore.bothVisible ? { flex: `0 0 ${dualStore.split}%` } : { flex: '1 1 auto' }
)

const workbenchEl = ref<HTMLElement | null>(null)
function onDragStart(ev: PointerEvent): void {
  if (!dualStore.bothVisible) return
  const handle = ev.currentTarget as HTMLElement
  const host = workbenchEl.value
  if (!host) return
  dragging.value = true
  handle.setPointerCapture?.(ev.pointerId)
  const move = (e: PointerEvent): void => {
    const rect = host.getBoundingClientRect()
    if (rect.width <= 0) return
    const pct = ((e.clientX - rect.left) / rect.width) * 100
    dualStore.split = Math.min(85, Math.max(15, pct))
  }
  const up = (e: PointerEvent): void => {
    dragging.value = false
    handle.releasePointerCapture?.(e.pointerId)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

defineExpose({
  /** The on-screen guest element, for App's DevTools / history toolbar. */
  webviewEl: computed(() => (guest(props.activeId) as unknown as HTMLElement | null) || null),
  goBack,
  goForward,
  reload
})
</script>

<template>
  <div ref="workbenchEl" class="workbench card" :class="{ 'is-dragging': dragging }">
    <!-- MAIN pane: the active page, mounted exactly as before (webviews stay mounted so a
         booted guest is never reloaded by entering/leaving split view). -->
    <div
      v-show="dualStore.showMain"
      ref="mainPaneEl"
      class="pane pane-main"
      :style="mainStyle"
      @mouseenter="dualStore.setFocusPane('main')"
    >
      <!-- A page configured as the default view but not up yet: full-surface boot animation
           with live phase + elapsed, a first-boot expectation-setter, and a cancel escape hatch. -->
      <div v-if="props.startingText" class="boot-screen">
        <!-- Animated whale + bubbles -->
        <div class="boot-scene">
          <img :src="whaleIcon" class="boot-whale" alt="" />
          <span class="bubble b1" />
          <span class="bubble b2" />
          <span class="bubble b3" />
          <span class="bubble b4" />
        </div>

        <!-- Rotating fun tip -->
        <Transition name="tip-fade" mode="out-in">
          <p class="boot-tip" :key="tipIdx">{{ currentTip }}</p>
        </Transition>

        <!-- Status line -->
        <div class="boot-status">
          <span class="boot-text">{{ props.startingText }}</span>
          <span v-if="props.phaseText || props.elapsedText" class="boot-phase">
            <span v-if="props.phaseText">{{ props.phaseText }}</span>
            <span v-if="props.phaseText && props.elapsedText" class="boot-dot">·</span>
            <span v-if="props.elapsedText">{{ props.elapsedText }}</span>
          </span>
        </div>

        <p v-if="props.slow" class="boot-slow">{{ t('boot.firstBootHint') }}</p>

        <div class="boot-actions">
          <button
            v-if="props.logs && props.logs.length"
            class="boot-btn"
            type="button"
            @click="showLogs = !showLogs"
          >
            {{ showLogs ? t('boot.hideLogs') : t('boot.viewLogs') }}
          </button>
          <button class="boot-btn boot-btn-cancel" type="button" @click="emit('cancel-start')">
            {{ t('boot.cancelStart') }}
          </button>
        </div>

        <pre v-if="showLogs && props.logs && props.logs.length" class="boot-logs">{{
          props.logs.join('\n')
        }}</pre>
      </div>

      <div v-show="activeUrl" class="webview-wrap">
        <div v-if="props.loading" class="webview-loading">
          <span class="status-dot starting" /> {{ t('common.loading') }}
        </div>
        <!-- One <webview> per opened page: switching only flips v-show, so a guest that is
             already up (openclaw token, dsh terminal sessions) is never reloaded. -->
        <!-- eslint-disable-next-line vue/html-self-closing -->
        <webview
          v-for="s in props.sessions"
          :key="s.id"
          :ref="(el) => setWebviewRef(s.id, el)"
          v-show="s.id === props.activeId"
          :src="s.url"
          class="wv"
          allowpopups
          @activate="dualStore.setFocusPane('main')"
          @did-stop-loading="onDidStopLoading(s.id)"
          @dom-ready="onDomReady(s.id)"
          @did-navigate="syncNav(s.id)"
          @did-navigate-in-page="syncNav(s.id)"
          @did-start-loading="syncNav(s.id)"
          @new-window="onNewWindow"
        />
      </div>

      <!-- Default workbench: the built-in plugin market static view, overlaid so the
           webview below it never unmounts when the user switches to it. -->
      <MarketView
        v-if="!props.startingText && (props.marketActive || !activeUrl)"
        class="market-layer"
        @install-pages="emit('install-pages')"
        @open-panel="(k: string) => emit('open-panel', k)"
      />
    </div>

    <!-- Draggable divider: resizes the split while both panes are visible. -->
    <div v-if="dualStore.bothVisible" class="split-divider" @pointerdown="onDragStart" />

    <!-- SECONDARY pane: one independent webview, pointed via the picker in the menu bar.
         Hover AND guest focus both hand it the nav-button aim (same rule as the main pane). -->
    <div
      v-if="dualStore.showSecondary"
      ref="secPaneEl"
      class="pane pane-secondary"
      @mouseenter="dualStore.setFocusPane('secondary')"
    >
      <!-- eslint-disable-next-line vue/html-self-closing -->
      <webview
        v-if="dualStore.secondaryUrl"
        ref="secWebviewEl"
        :src="dualStore.secondaryUrl"
        class="wv sec-wv"
        allowpopups
        @activate="dualStore.setFocusPane('secondary')"
        @dom-ready="syncSecNav"
        @did-navigate="syncSecNav"
        @did-navigate-in-page="syncSecNav"
        @did-start-loading="syncSecNav"
      />
      <div v-else class="sec-empty">{{ t('dual.empty') }}</div>
    </div>
  </div>
</template>

<style scoped>
.workbench {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
}

/* ---- Split view (双屏) ---- */
.pane {
  display: flex;
  min-width: 0;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background: var(--bg);
}

/* width comes from :style (mainStyle); pane-main owns the active page's webview stack. */
.pane-secondary {
  flex: 1 1 auto;
  flex-direction: column;
  border-left: 1px solid var(--border);
}

.split-divider {
  flex: none;
  width: 6px;
  cursor: col-resize;
  background: var(--border);
  transition: background 0.15s ease;
}
.split-divider:hover,
.workbench.is-dragging .split-divider {
  background: var(--accent);
}

/* While dragging, guests must not eat the pointer or the divider stalls mid-pane. */
.workbench.is-dragging :deep(webview) {
  pointer-events: none;
}

.sec-wv {
  flex: 1;
  min-height: 0;
  border: none;
}
.sec-empty {
  flex: 1;
  display: grid;
  place-content: center;
  color: var(--text-dim);
  font-size: 13px;
  padding: 0 24px;
  text-align: center;
}

.webview-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  background: var(--bg);
}

/* Market overlay: covers the (still-mounted) webview when 「工作台」is active. */
.market-layer {
  position: absolute;
  inset: 0;
  z-index: 10;
}

.wv {
  width: 100%;
  height: 100%;
  border: none;
}

.webview-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 10px;
  grid-auto-flow: column;
  color: var(--text-dim);
  background: var(--bg);
  z-index: 5;
}

/* Boot overlay: whale swimming scene + rotating fun tips + progress info. */
.boot-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--bg);
  padding: 0 24px;
  overflow: hidden;
}

/* ---- Whale scene ---- */
.boot-scene {
  position: relative;
  width: 120px;
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.boot-whale {
  width: 64px;
  height: 64px;
  object-fit: contain;
  animation: whale-swim 2.6s ease-in-out infinite;
}

@keyframes whale-swim {
  0%,
  100% {
    transform: translateY(0) rotate(-3deg);
  }
  30% {
    transform: translateY(-12px) rotate(2deg);
  }
  60% {
    transform: translateY(-4px) rotate(-2deg);
  }
}

/* ---- Bubbles ---- */
.bubble {
  position: absolute;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.25;
  animation: bubble-rise 2.4s ease-in infinite;
}
.b1 {
  width: 8px;
  height: 8px;
  left: 28%;
  bottom: 20%;
  animation-delay: 0s;
}
.b2 {
  width: 5px;
  height: 5px;
  left: 55%;
  bottom: 15%;
  animation-delay: 0.6s;
}
.b3 {
  width: 6px;
  height: 6px;
  left: 70%;
  bottom: 25%;
  animation-delay: 1.2s;
}
.b4 {
  width: 4px;
  height: 4px;
  left: 40%;
  bottom: 10%;
  animation-delay: 1.8s;
}

@keyframes bubble-rise {
  0% {
    transform: translateY(0) scale(1);
    opacity: 0.3;
  }
  100% {
    transform: translateY(-70px) scale(0.5);
    opacity: 0;
  }
}

/* ---- Tip text ---- */
.boot-tip {
  font-size: 13px;
  color: var(--text-dim);
  text-align: center;
  min-height: 20px;
  margin: 0;
}

.tip-fade-enter-active,
.tip-fade-leave-active {
  transition: opacity 0.4s ease;
}
.tip-fade-enter-from,
.tip-fade-leave-to {
  opacity: 0;
}

/* ---- Status ---- */
.boot-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.boot-text {
  font-size: 13px;
  color: var(--accent);
  text-shadow: 0 0 10px color-mix(in srgb, var(--accent) 40%, transparent);
}

.boot-phase {
  font-size: 12px;
  color: var(--text-dim);
}

.boot-dot {
  margin: 0 6px;
}

.boot-slow {
  margin: 0;
  font-size: 12px;
  color: var(--text-dim);
  text-align: center;
  max-width: 420px;
}

.boot-actions {
  display: flex;
  gap: 10px;
}

.boot-btn {
  font-size: 12px;
  color: var(--text-dim);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 9999px;
  padding: 4px 12px;
  cursor: pointer;
}

.boot-btn:hover {
  color: var(--text);
  border-color: var(--accent);
}

.boot-btn-cancel:hover {
  color: var(--danger, #e5484d);
  border-color: var(--danger, #e5484d);
}

.boot-logs {
  width: min(560px, 90%);
  max-height: 220px;
  overflow: auto;
  margin: 0;
  padding: 10px 12px;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  text-align: left;
  color: var(--text-dim);
  background: var(--panel, rgba(0, 0, 0, 0.04));
  border: 1px solid var(--border);
  border-radius: 8px;
}
</style>
