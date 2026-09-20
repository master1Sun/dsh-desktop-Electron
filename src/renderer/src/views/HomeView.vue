<script setup lang="ts">
import { onMounted, ref } from 'vue'
import MarketView from '../views/MarketView.vue'
import { t } from '../i18n'

const props = defineProps<{
  url: string
  loading: boolean
  startingText?: string
  /** Show the market view as an overlay ON TOP of the webview — the embedded page
      stays mounted (its right-sidebar terminal survives), only hidden. */
  marketActive?: boolean
}>()

const emit = defineEmits<{
  'guest-stop-loading': []
  'install-pages': []
}>()

/** App.vue's toolbar needs the guest element to open its DevTools. */
const webviewEl = ref<HTMLElement | null>(null)

function onStopLoading(): void {
  emit('guest-stop-loading')
}

/* The <webview> custom element is registered lazily by Electron; await it before
   touching instance methods or Vue would bind listeners to a plain HTMLElement. */
onMounted(async () => {
  // Plain-browser/dev-tools path has no <webview> wiring; whenDefined rejects there.
  await customElements.whenDefined('webview').catch(() => undefined)
  webviewEl.value?.addEventListener('new-window', (ev) => {
    ev.preventDefault()
    window.container
      .openExternal((ev as unknown as Event & { url: string }).url)
      .catch(() => undefined)
  })
})

defineExpose({ webviewEl })
</script>

<template>
  <div class="workbench card">
    <!-- A page configured as the default view but not up yet: full-surface boot animation. -->
    <div v-if="props.startingText" class="boot-screen">
      <span class="boot-spinner" />
      <span class="boot-text">{{ props.startingText }}</span>
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

/* Boot overlay for the configured default page: centered spinner + status text. */
.boot-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: var(--bg);
}

.boot-spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  animation: boot-spin 0.8s linear infinite;
}

.boot-text {
  font-size: 13px;
  color: var(--text-dim);
}

@keyframes boot-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
