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

/** Row leading glyph: tells a CLI page, an external site and a hosted web page apart at a glance. */
function rowKind(p: PageState): 'terminal' | 'external' | 'web' {
  if (p.external) return 'external'
  return p.kind === 'terminal' ? 'terminal' : 'web'
}

/** The page currently on screen (null while the workbench owns it) — drives the trigger's dot. */
const activePage = computed(() => props.pages.find((p) => p.id === props.activePageId) || null)
const activeDotClass = computed(() => {
  const p = activePage.value
  if (!p) return ''
  return p.runtimeMissing === true ? 'dot-stopped' : `dot-${p.status}`
})

/** Row tooltip: why a name is greyed, or what clicking it does (terminal = open the CLI). */
function rowTitle(p: PageState): string {
  if (blocked(p)) return t('setup.runtimeMissingTag')
  if (needsStart(p)) return t('menu.notRunningHint')
  const status = statusText(p)
  return p.kind === 'terminal' && p.status !== 'running'
    ? `${t('menu.openTerminalHint')} · ${status}`
    : status
}

/**
 * A hosted dsh/openclaw page whose runtime is not installed yet: the row is flagged so the user
 * is guided to install (the ▶ click is intercepted upstream and opens the setup guide) rather than
 * attempting a start that can only fail. The verdict is the main process's `PageState.runtimeMissing`
 * — a synchronous probe re-run on every list — so it never lags an async status IPC round trip; a
 * running page is reported unblocked by that same probe.
 */
function blocked(p: PageState): boolean {
  return p.runtimeMissing === true
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
    return
  }
  // ↑/↓ walk the switchable rows, desktop-list style; Enter then acts on the focused row.
  if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return
  ev.preventDefault()
  const rows = Array.from(
    (ev.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '.row-name:not(:disabled)'
    )
  )
  if (!rows.length) return
  let next: HTMLButtonElement | undefined
  const idx = rows.findIndex((r) => r === document.activeElement)
  if (ev.key === 'ArrowDown') next = idx === -1 ? rows[0] : rows[(idx + 1) % rows.length]
  else next = idx === -1 ? rows[rows.length - 1] : rows[(idx - 1 + rows.length) % rows.length]
  next?.focus()
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
      :title="activePage ? `${props.title} · ${statusText(activePage)}` : props.title"
      @click="toggle"
    >
      <!-- Live status of whatever is on screen, so the bar reads the state at a glance. -->
      <i v-if="activeDotClass" class="status-dot" :class="activeDotClass" aria-hidden="true" />
      <span class="switcher-title">{{ props.title }}</span>
      <svg class="caret" :class="{ open }" width="8" height="5" viewBox="0 0 8 5" aria-hidden="true">
        <path d="M1 1 L4 4 L7 1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
      </svg>
    </button>
    <Transition name="switcher-menu">
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
          <!-- Active page gets the accent check; everyone else a kind glyph (CLI / external / web). -->
          <svg
            v-if="p.id === props.activePageId"
            class="row-icon is-active"
            width="11"
            height="11"
            viewBox="0 0 11 11"
            aria-hidden="true"
            :title="t('menu.activePageHint')"
          >
            <path
              d="M1.5 5.8 L4.2 8.4 L9.5 2.4"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <svg
            v-else
            class="row-icon"
            width="11"
            height="11"
            viewBox="0 0 11 11"
            aria-hidden="true"
          >
            <!-- terminal: box + prompt; globe: external site; window: hosted web page -->
            <template v-if="rowKind(p) === 'terminal'">
              <path d="M1 1.8h9v7.6H1z" fill="none" stroke="currentColor" stroke-width="1" />
              <path
                d="M2.7 4l1.7 1.5-1.7 1.5M5.8 7.4h2.6"
                fill="none"
                stroke="currentColor"
                stroke-width="1"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </template>
            <template v-else-if="rowKind(p) === 'external'">
              <circle cx="5.5" cy="5.5" r="4.2" fill="none" stroke="currentColor" stroke-width="1" />
              <path
                d="M1.3 5.5h8.4M5.5 1.3c-2.6 2.8-2.6 5.6 0 8.4M5.5 1.3c2.6 2.8 2.6 5.6 0 8.4"
                fill="none"
                stroke="currentColor"
                stroke-width="0.9"
              />
            </template>
            <template v-else>
              <path d="M1 1.8h9v7.6H1z" fill="none" stroke="currentColor" stroke-width="1" />
              <path d="M1 4h9" stroke="currentColor" stroke-width="0.9" />
            </template>
          </svg>
          <button
            class="row-name"
            :class="{ 'is-blocked': blocked(p) }"
            :disabled="needsStart(p)"
            :title="rowTitle(p)"
            @click="pick(p)"
          >
            {{ p.name }}
          </button>
          <span v-if="blocked(p)" class="block-tag" :title="t('setup.runtimeMissingTag')">{{
            t('setup.missingTag')
          }}</span>
          <button
            v-if="needsStart(p)"
            :class="['row-start', { 'is-busy': props.busyPages?.[p.id] }]"
            :disabled="props.busyPages?.[p.id]"
            :title="props.busyPages?.[p.id] ? t('menu.startingTip') : `${t('menu.start')} ${p.name}`"
            @click="onStart(p)"
          >
            <span v-if="props.busyPages?.[p.id]" class="mini-spinner" aria-hidden="true" />
            <svg v-else width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
              <path d="M1.6 0.7 L8 4.5 L1.6 8.3 Z" fill="currentColor" />
            </svg>
          </button>
          <!-- Traffic light: running=green, error=red, starting=amber, stopped=grey.
               A page with no runtime installed never got that far — grey it, don't amber.
               CLI pages light up through the embedded terminal's PTY (registry.reportTerminal). -->
          <i
            class="status-dot"
            :class="blocked(p) ? 'dot-stopped' : `dot-${p.status}`"
            :title="rowTitle(p)"
          />
        </li>
        <li v-if="!hasPages" class="drop-empty" role="presentation">{{ t('menu.switcherEmpty') }}</li>
      </ul>
    </Transition>
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
  transition: border-color 0.15s ease, background 0.15s ease;
}

.switcher:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}

.switcher.open {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface-2));
}

.switcher-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.caret {
  font-size: 10px;
  color: var(--text-dim);
  flex: none;
  transition: transform 0.18s ease, color 0.15s ease;
}

.caret.open {
  color: var(--accent);
  transform: rotate(180deg);
}

/* 打开/关闭动效：从触发器下方“抽开”，而不是突兀出现。 */
.switcher-menu-enter-active,
.switcher-menu-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.switcher-menu-enter-from,
.switcher-menu-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 210px;
  max-height: min(420px, 70vh);
  overflow: auto;
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
  transition: background 0.15s ease, color 0.15s ease;
}

.drop-item:hover {
  /* Translucent accent wash + frosted glass, so the hover reads in dark mode
     without turning into an opaque block. */
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  -webkit-backdrop-filter: blur(8px) saturate(125%);
  backdrop-filter: blur(8px) saturate(125%);
  color: var(--accent);
}

.drop-item.active {
  /* The on-screen page keeps a faint accent wash + its row leading check, so 「当前」
     survives hovering other rows. */
  background: color-mix(in srgb, var(--accent) 9%, transparent);
  color: var(--accent);
}

/* Row leading slot: kind glyph, or the accent check on the active page. */
.row-icon {
  flex: none;
  width: 11px;
  height: 11px;
  color: var(--text-dim);
  opacity: 0.8;
}

.row-icon.is-active {
  color: var(--accent);
  opacity: 1;
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

/* ↑/↓ 键盘导航时的焦点环；hover 已有底色，焦点只需要一个轮廓提示。 */
.row-name:focus-visible {
  outline: 1.5px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}

.row-name.is-blocked {
  color: var(--text-dim);
}

.block-tag {
  flex: none;
  font-size: 10px;
  line-height: 14px;
  padding: 0 5px;
  border-radius: 999px;
  color: var(--warn);
  border: 1px solid var(--warn);
}

.row-start {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex: none;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  border-radius: 5px;
  /* Frosted accent-tinted button: visible in both light and dark. */
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
  color: var(--accent);
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.18s ease, background 0.15s ease;
}

.row-start:hover {
  border-color: var(--accent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 38%, transparent);
}

.row-start.is-busy {
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 30%, transparent);
}
.row-start:disabled {
  cursor: default;
}

/* Neon spinner: glowing arc on a faint ring, eased rotation for a smoother feel. */
.mini-spinner {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--accent) 20%, transparent);
  border-top-color: var(--accent);
  border-right-color: color-mix(in srgb, var(--accent) 55%, transparent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 45%, transparent);
  animation: mini-spin 0.8s cubic-bezier(0.45, 0.05, 0.3, 0.95) infinite;
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
  position: relative;
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
/* Starting: breathing glow + an expanding ripple ring for a clearer "spinning up" feel. */
.dot-starting {
  background: var(--warn);
  box-shadow: 0 0 6px var(--warn);
  animation: dot-pulse 1.3s ease-in-out infinite;
}
.dot-starting::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, var(--warn) 75%, transparent);
  animation: dot-ripple 1.3s ease-out infinite;
}
@keyframes dot-pulse {
  0%,
  100% {
    box-shadow: 0 0 4px var(--warn);
  }
  50% {
    box-shadow: 0 0 12px color-mix(in srgb, var(--warn) 85%, transparent);
  }
}
@keyframes dot-ripple {
  0% {
    opacity: 0.85;
    transform: scale(0.6);
  }
  100% {
    opacity: 0;
    transform: scale(2.4);
  }
}

/* Damped when 减少动效 is in effect (see stores/settings.applyReduceMotion). */
html.reduce-motion .mini-spinner {
  animation-duration: 1.6s;
}
html.reduce-motion .dot-starting,
html.reduce-motion .dot-starting::after {
  animation: none;
}
html.reduce-motion .dot-starting {
  opacity: 0.7;
  box-shadow: 0 0 6px var(--warn);
}
</style>
