<script setup lang="ts">
import { Sunny, Moon, Refresh, ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { t } from '@renderer/i18n'

/**
 * Right-end chrome of the menu bar: view actions (reload / theme / detach) plus the
 * frameless-window traffic lights. Split out of MenuBar — these are leaf buttons whose
 * only logic is the window-control IPC, so they carry no shared state with the panels.
 *
 * The view actions are styled as bordered pills that mirror the 双屏 `.dual-btn` group
 * (same 28×26 footprint, 15px glyph, stroke 1.2) so the whole top-bar action strip reads
 * as one symmetric row around the page picker; the traffic lights stay flush full-height.
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
  /** IM layout hides the theme toggle here (the left rail carries its own). */
  hideTheme?: boolean
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
      class="win-btn view"
      :disabled="!props.canGoBack"
      :title="t('menu.goBack')"
      :aria-label="t('menu.goBack')"
      @click="emit('go-back')"
    >
      <el-icon><ArrowLeft /></el-icon>
    </button>
    <button
      v-if="props.showNav"
      class="win-btn view"
      :disabled="!props.canGoForward"
      :title="t('menu.goForward')"
      :aria-label="t('menu.goForward')"
      @click="emit('go-forward')"
    >
      <el-icon><ArrowRight /></el-icon>
    </button>
    <button
      v-if="props.canOperate"
      class="win-btn view"
      :title="t('menu.reloadCurrent')"
      :aria-label="t('menu.reloadCurrent')"
      @click="emit('reload')"
    >
      <el-icon><Refresh /></el-icon>
    </button>
    <button
      v-if="!props.hideTheme"
      class="win-btn view theme-toggle"
      :title="t('menu.themeToggle', { mode: props.themeLabel })"
      :aria-label="t('menu.themeToggle', { mode: props.themeLabel })"
      @click="emit('toggle-theme')"
    >
      <el-icon><Sunny v-if="props.isDark" /><Moon v-else /></el-icon>
    </button>
    <button
      v-if="props.canOperate"
      class="win-btn view"
      :title="t('menu.detach')"
      :aria-label="t('menu.detach')"
      @click="emit('detach')"
    >
      <!-- External-link glyph redrawn on the shared 16-box / stroke-1.2 grid so it
           matches the 双屏 pills in both size and line weight. -->
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M10.5 2.5 H13.5 V5.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M13.5 2.5 L7.5 8.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M11.5 10 V12.5 A1 1 0 0 1 10.5 13.5 H3.5 A1 1 0 0 1 2.5 12.5 V5.5 A1 1 0 0 1 3.5 4.5 H6"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
    <button
      class="win-btn"
      :title="t('menu.minimize')"
      :aria-label="t('menu.minimize')"
      @click="minimize"
    >
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
        <rect
          x="1"
          y="3"
          width="6"
          height="6"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
        />
        <path d="M3 3 V1 H9 V7 H7" fill="none" stroke="currentColor" stroke-width="1.2" />
      </svg>
    </button>
    <button
      class="win-btn close"
      :title="t('menu.close')"
      :aria-label="t('menu.close')"
      @click="close"
    >
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

/* View actions (back / forward / reload / theme / detach): bordered pills that mirror the
   双屏 `.dual-btn` group in MenuBar — same 28×26 footprint, 1px border, full radius, 15px
   glyph — so the action strip is symmetric. They self-center in the 38px bar and carry a
   3px side margin for the gap the flat traffic lights don't need. */
.win-btn.view {
  width: 28px;
  height: 26px;
  align-self: center;
  margin: 0 3px;
  font-size: 15px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 9999px;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.win-btn.view:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border-color: var(--accent);
  color: var(--accent);
}

.win-btn.view:disabled {
  background: none;
  border-color: var(--border);
  color: var(--text-dim);
  opacity: 0.5;
}
</style>
