<script setup lang="ts">
import { Sunny, Moon, Refresh, ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { t } from '../i18n'

/**
 * Right-end chrome of the menu bar: view actions (reload / theme / detach) plus the
 * frameless-window traffic lights. Split out of MenuBar — these are leaf buttons whose
 * only logic is the window-control IPC, so they carry no shared state with the panels.
 */
const props = defineProps<{
  isDark: boolean
  themeLabel: string
  canOperate: boolean
  canGoBack: boolean
  canGoForward: boolean
  /** Only an embedded external address exposes in-page history nav in the top bar. */
  showNav: boolean
  isMaximized: boolean
}>()

const emit = defineEmits<{
  'toggle-theme': []
  reload: []
  'go-back': []
  'go-forward': []
  detach: []
}>()

async function minimize(): Promise<void> {
  await window.container.minimizeWindow().catch(() => undefined)
}
async function maximize(): Promise<void> {
  await window.container.toggleMaximize().catch(() => undefined)
}
async function close(): Promise<void> {
  await window.container.closeWindow().catch(() => undefined)
}
</script>

<template>
  <div class="window-controls">
    <button
      v-if="props.showNav"
      class="win-btn"
      :disabled="!props.canGoBack"
      :title="t('menu.goBack')"
      :aria-label="t('menu.goBack')"
      @click="emit('go-back')"
    >
      <el-icon><ArrowLeft /></el-icon>
    </button>
    <button
      v-if="props.showNav"
      class="win-btn"
      :disabled="!props.canGoForward"
      :title="t('menu.goForward')"
      :aria-label="t('menu.goForward')"
      @click="emit('go-forward')"
    >
      <el-icon><ArrowRight /></el-icon>
    </button>
    <button
      v-if="props.canOperate"
      class="win-btn"
      :title="t('menu.reloadCurrent')"
      :aria-label="t('menu.reloadCurrent')"
      @click="emit('reload')"
    >
      <el-icon><Refresh /></el-icon>
    </button>
    <button
      class="win-btn theme-toggle"
      :title="t('menu.themeToggle', { mode: props.themeLabel })"
      :aria-label="t('menu.themeToggle', { mode: props.themeLabel })"
      @click="emit('toggle-theme')"
    >
      <el-icon><Sunny v-if="props.isDark" /><Moon v-else /></el-icon>
    </button>
    <button
      v-if="props.canOperate"
      class="win-btn"
      :title="t('menu.detach')"
      :aria-label="t('menu.detach')"
      @click="emit('detach')"
    >
      <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
        <path
          d="M4.5 1.5 H1.5 V9.5 H9.5 V6.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
        />
        <path d="M6 1.5 H9.5 V5 M9.5 1.5 L5 6" fill="none" stroke="currentColor" stroke-width="1.2" />
      </svg>
    </button>
    <button class="win-btn" :title="t('menu.minimize')" :aria-label="t('menu.minimize')" @click="minimize">
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.2" />
      </svg>
    </button>
    <button
      class="win-btn"
      :title="props.isMaximized ? t('menu.restore') : t('menu.maximize')"
      :aria-label="props.isMaximized ? t('menu.restore') : t('menu.maximize')"
      @click="maximize"
    >
      <svg v-if="!props.isMaximized" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <rect
          x="1.5"
          y="1.5"
          width="7"
          height="7"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
        />
      </svg>
      <svg v-else width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <rect x="1" y="3" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.2" />
        <path d="M3 3 V1 H9 V7 H7" fill="none" stroke="currentColor" stroke-width="1.2" />
      </svg>
    </button>
    <button class="win-btn close" :title="t('menu.close')" :aria-label="t('menu.close')" @click="close">
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" stroke-width="1.2" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.window-controls {
  display: flex;
  align-items: stretch;
  height: 100%;
  margin-right: -4px;
  -webkit-app-region: no-drag;
}

.win-btn {
  width: 38px;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text);
  cursor: pointer;
  font-size: 13px;
}

.win-btn:hover {
  background: var(--surface-2);
}

.win-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.win-btn:disabled:hover {
  background: none;
}

.win-btn.close:hover {
  background: var(--err);
  color: #fff;
}
</style>
