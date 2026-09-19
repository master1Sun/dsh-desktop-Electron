<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = defineProps<{ url: string; loading: boolean }>()

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
    <div v-if="props.url" class="webview-wrap">
      <div v-if="props.loading" class="webview-loading">
        <span class="status-dot starting" /> 加载中…
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

    <div v-else class="hero">
      <div class="hero-glow" />
      <h1>Desktop Container</h1>
      <p>内置 Node v24.21.0 的桌面端多页容器。用顶部「选择页面」下拉切换运行中的 page，或：</p>
      <div class="hero-actions">
        <el-button type="primary" round size="large" @click="emit('install-pages')"
          >安装并管理 Pages</el-button
        >
      </div>
      <ul class="hero-tips">
        <li><span class="status-dot running" /> pages/ 下的项目由内置 node 托管启停</li>
        <li><span class="status-dot starting" /> 关闭主窗口会最小化到任务栏继续运行</li>
        <li><span class="status-dot" /> 顶部「视图」菜单可切换默认视图、外部地址与主题</li>
      </ul>
    </div>
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

.hero {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  position: relative;
  overflow: hidden;
  padding: 32px;
}

.hero-glow {
  position: absolute;
  width: 480px;
  height: 480px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--accent) 22%, transparent),
    transparent 65%
  );
  top: -180px;
  right: -140px;
  pointer-events: none;
}

.hero h1 {
  font-size: 30px;
  font-weight: 700;
  margin: 0 0 10px;
  background: linear-gradient(120deg, var(--text), var(--accent-strong));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero p {
  color: var(--text-dim);
  max-width: 460px;
}

.hero-actions {
  display: flex;
  gap: 12px;
  margin: 22px 0 30px;
}

.hero-tips {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--text-dim);
  font-size: 13px;
}

.hero-tips li {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
