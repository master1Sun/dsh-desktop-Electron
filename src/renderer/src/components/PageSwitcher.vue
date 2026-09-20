<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { PageState } from '../stores/pages'
import { t } from '../i18n'

/**
 * The page-switcher (trigger + dropdown), split out of MenuBar so the menu bar keeps
 * only the group/panel orchestration. It owns its own open state, but coordinates with
 * the parent through `opening` / `close()` so the app keeps the "one floating surface
 * at a time" rule.
 */
const props = defineProps<{
  pages: PageState[]
  activePageId: string | null
  /** pageId -> a start/stop call is in flight (drives the row's spinner) */
  busyPages?: Record<string, boolean>
  title: string
}>()

const emit = defineEmits<{
  opening: []
  'select-page': [id: string]
  'start-page': [id: string]
  'open-terminal': [id: string]
}>()

const open = ref(false)
const anchorEl = ref<HTMLElement | null>(null)

function toggle(ev: MouseEvent): void {
  if (open.value) return close()
  open.value = true
  anchorEl.value = ev.currentTarget as HTMLElement
  emit('opening') // parent closes its own drop list / panel
}

function close(): void {
  open.value = false
  anchorEl.value = null
}

/** Terminal-kind pages run in the full-surface terminal, not the webview. */
function pick(p: PageState): void {
  close()
  if (p.kind === 'terminal') emit('open-terminal', p.id)
  else emit('select-page', p.id)
}

function onStart(p: PageState): void {
  if (props.busyPages?.[p.id]) return
  emit('start-page', p.id)
}

/**
 * A page is only switchable once it actually runs — web/server pages must be started
 * first (the row then offers a ▶ button). Terminal pages have no port to wait for and
 * external pages open in the OS browser, so neither needs a start step.
 */
function needsStart(p: PageState): boolean {
  return !p.external && p.kind !== 'terminal' && p.status !== 'running'
}

/** Traffic-light / status labels for tooltips, in the active language. */
function statusText(p: PageState): string {
  const base =
    {
      running: t('menu.running'),
      starting: t('menu.starting'),
      error: t('menu.failed'),
      stopped: t('menu.stopped')
    }[p.status] || p.status
  // The health guard appended its own context where it matters to the user.
  if (p.nextRestartAt) return `${base} · ${t('menu.autoRestartPending')}`
  if (p.crashes) return `${base} · ${t('menu.crashCount', { n: p.crashes })}`
  return base
}

/** Capture phase, so the trigger's own re-click toggles before this sees the mousedown. */
function onDocumentMousedown(ev: MouseEvent): void {
  if (!open.value) return
  const target = ev.target as Node
  if (anchorEl.value?.contains(target)) return
  if ((target as HTMLElement)?.closest?.('.dropdown')) return
  close()
}

function onListKeydown(ev: KeyboardEvent): void {
  if (ev.key === 'Escape') {
    close()
    ev.stopPropagation()
  }
}

document.addEventListener('mousedown', onDocumentMousedown, true)
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMousedown, true)
})

const listId = 'page-switcher-list'
const hasPages = computed(() => props.pages.length > 0)

defineExpose({ close })
</script>

<template>
  <div class="switcher-wrap">
    <button
      class="switcher"
      :class="{ open }"
      :aria-haspopup="'listbox'"
      :aria-expanded="open"
      :aria-controls="open ? listId : undefined"
      @click="toggle"
    >
      <span class="switcher-title">{{ props.title }}</span>
      <span class="caret" aria-hidden="true">▾</span>
    </button>
    <ul
      v-if="open"
      :id="listId"
      class="dropdown switcher-menu"
      role="listbox"
      :aria-label="t('menu.selectPage')"
      @keydown="onListKeydown"
    >
      <li
        v-for="p in props.pages"
        :key="p.id"
        class="drop-item switcher-item"
        :class="{ active: p.id === props.activePageId }"
        role="option"
        :aria-selected="p.id === props.activePageId"
      >
        <button
          class="row-name"
          :disabled="needsStart(p)"
          :title="needsStart(p) ? t('menu.notRunningHint') : statusText(p)"
          @click="pick(p)"
        >
          {{ p.name }}
        </button>
        <button
          v-if="needsStart(p)"
          class="row-start"
          :title="props.busyPages?.[p.id] ? t('menu.startingTip') : `${t('menu.start')} ${p.name}`"
          @click="onStart(p)"
        >
          <span v-if="props.busyPages?.[p.id]" class="mini-spinner" aria-hidden="true" />
          <svg v-else width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
            <path d="M1.6 0.7 L8 4.5 L1.6 8.3 Z" fill="currentColor" />
          </svg>
        </button>
        <!-- Traffic light: running=green, error=red, starting=amber, stopped=grey. -->
        <i class="status-dot" :class="`dot-${p.status}`" :title="statusText(p)" />
      </li>
      <li v-if="!hasPages" class="drop-empty" role="presentation">{{ t('menu.switcherEmpty') }}</li>
    </ul>
  </div>
</template>

<style scoped>
.switcher-wrap {
  position: relative;
  -webkit-app-region: no-drag;
}

.switcher {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 12.5px;
  padding: 3px 10px;
  cursor: pointer;
}

.switcher.open {
  border-color: var(--accent);
}

.switcher-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.caret {
  font-size: 10px;
  color: var(--text-dim);
}

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 180px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  padding: 4px;
  margin: 0;
  list-style: none;
  z-index: 80;
}

.drop-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: none;
  border: none;
  border-radius: 7px;
  color: var(--text);
  font-size: 12.5px;
  text-align: left;
  padding: 5px 9px;
  cursor: pointer;
}

.drop-item:hover {
  background: var(--surface-2);
}

.drop-item.active {
  color: var(--accent);
}

/* Switcher rows: name (switch) + ▶ (start) + traffic light. */
.switcher-item {
  gap: 8px;
}

.row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: none;
  border: none;
  color: inherit;
  font-size: 12.5px;
  text-align: left;
  padding: 0;
  cursor: pointer;
}

.row-name:disabled {
  color: var(--text-dim);
  cursor: not-allowed;
}

.row-start {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex: none;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface-2);
  color: var(--accent);
  cursor: pointer;
}

.row-start:hover {
  border-color: var(--accent);
}

.mini-spinner {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  border-top-color: var(--accent);
  animation: mini-spin 0.7s linear infinite;
}

@keyframes mini-spin {
  to {
    transform: rotate(360deg);
  }
}

.drop-empty {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-dim);
}

.status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
  background: var(--text-dim);
}
.dot-running {
  background: var(--ok);
  box-shadow: 0 0 6px var(--ok);
}
.dot-error {
  background: var(--err);
  box-shadow: 0 0 6px var(--err);
}
.dot-starting {
  background: var(--warn);
  animation: dot-blink 1s ease-in-out infinite;
}
@keyframes dot-blink {
  50% {
    opacity: 0.3;
  }
}
</style>
