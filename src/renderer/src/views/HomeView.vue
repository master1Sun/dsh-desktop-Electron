<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import MarketView from '../views/MarketView.vue'
import { t, locale } from '../i18n'
import whaleIcon from '../assets/whale.png'

const props = defineProps<{
  url: string
  loading: boolean
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
}>()

const emit = defineEmits<{
  'guest-stop-loading': []
  'install-pages': []
  'cancel-start': []
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

/** App.vue's toolbar needs the guest element to open its DevTools / drive history nav. */
const webviewEl = ref<HTMLElement | null>(null)

/** Minimal slice of the Electron <webview> API used for in-page history navigation. */
interface WebviewNav {
  canGoBack?: boolean
  canGoForward?: boolean
  goBack?: () => void
  goForward?: () => void
  loadURL?: (url: string) => Promise<void>
}
const guest = (): WebviewNav | null => webviewEl.value as unknown as WebviewNav | null

/** Last pushed nav state, so syncNav only emits when it actually changes. */
const nav = ref({ back: false, forward: false })
function syncNav(): void {
  const el = guest()
  const next = { back: Boolean(el?.canGoBack), forward: Boolean(el?.canGoForward) }
  if (next.back !== nav.value.back || next.forward !== nav.value.forward) {
    nav.value = next
    emit('nav-state', next)
  }
}

/** Back / forward for the embedded webview, driven by the top-bar nav buttons. */
function goBack(): void {
  guest()?.goBack?.()
}
function goForward(): void {
  guest()?.goForward?.()
}

// A fresh src (page / external switch) starts a new history stack — reflect it at once.
watch(
  () => props.url,
  () => {
    nav.value = { back: false, forward: false }
    emit('nav-state', nav.value)
  }
)

function onStopLoading(): void {
  emit('guest-stop-loading')
}

/* The <webview> custom element is registered lazily by Electron; await it before
   touching instance methods or Vue would bind listeners to a plain HTMLElement. */
onMounted(async () => {
  // Plain-browser/dev-tools path has no <webview> wiring; whenDefined rejects there.
  await customElements.whenDefined('webview').catch(() => undefined)
  const el = webviewEl.value
  if (!el) return
  // The webview persists across src changes (v-show), so these listeners attach once.
  el.addEventListener('did-navigate', syncNav)
  el.addEventListener('did-navigate-in-page', syncNav)
  el.addEventListener('did-start-loading', syncNav)
  el.addEventListener('dom-ready', syncNav)
})

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

defineExpose({ webviewEl, goBack, goForward })
</script>

<template>
  <div class="workbench card">
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

    <div v-show="props.url" class="webview-wrap">
      <div v-if="props.loading" class="webview-loading">
        <span class="status-dot starting" /> {{ t('common.loading') }}
      </div>
      <!-- eslint-disable-next-line vue/html-self-closing -->
      <webview
        ref="webviewEl"
        :src="props.url"
        class="wv"
        allowpopups
        @did-stop-loading="onStopLoading"
        @dom-ready="onStopLoading"
        @new-window="onNewWindow"
      />
    </div>

    <!-- Default workbench: the built-in plugin market static view, overlaid so the
         webview below it never unmounts when the user switches to it. -->
    <MarketView
      v-if="!props.startingText && (props.marketActive || !props.url)"
      class="market-layer"
      @install-pages="emit('install-pages')"
    />
  </div>
</template>

<style scoped>
.workbench {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
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
  color: var(--text);
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
  border-radius: 6px;
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
