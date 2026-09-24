<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Terminal } from '@xterm/xterm'
import { SearchAddon, type ISearchOptions } from '@xterm/addon-search'
import { ArrowDown, ArrowUp, Close } from '@element-plus/icons-vue'
import { t } from '@renderer/i18n'

/**
 * A single reusable search strip for an xterm surface. The owning view passes a `getTerm`
 * accessor (its terminal is created lazily and may be recreated), so the addon is (re)attached
 * on demand and only when the underlying instance actually changed. Ctrl/Cmd+F opens it while
 * the terminal has focus; Escape closes. Match count comes off `onDidChangeResults`, which in
 * @xterm/addon-search 0.16 only fires when a `decorations` option is supplied — so we always pass
 * a theme-neutral one (see opts()).
 */
const props = defineProps<{ getTerm: () => Terminal | null }>()

const visible = ref(false)
const query = ref('')
const caseSensitive = ref(false)
const resultIndex = ref(-1)
const resultCount = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)

let search: SearchAddon | null = null
let attachedTo: Terminal | null = null
let disposeResults: (() => void) | null = null

function ensureAddon(): SearchAddon | null {
  const term = props.getTerm()
  if (!term) return null
  // A SearchAddon binds to the terminal it is activated on. Splitting / switching groups
  // remounts TerminalPane (new xterm each time), so reusing one addon across recreated panes
  // leaves it pointed at a disposed terminal and search silently returns zero matches. Build a
  // fresh addon whenever the target terminal actually changes.
  if (attachedTo !== term) {
    disposeResults?.()
    search?.dispose()
    search = new SearchAddon()
    disposeResults = search.onDidChangeResults((e) => {
      resultIndex.value = e.resultIndex
      resultCount.value = e.resultCount
    }).dispose
    term.loadAddon(search)
    attachedTo = term
    resetCount()
  }
  return search
}

function opts(): ISearchOptions {
  // `decorations` MUST be present: in @xterm/addon-search 0.16 the addon only recomputes the full
  // match list AND fires `onDidChangeResults` when a decorations option is passed. Without it the
  // result count never updates and the bar is stuck on "no match". Colors are theme-neutral.
  return {
    caseSensitive: caseSensitive.value,
    decorations: {
      matchBackground: 'rgba(255, 200, 0, 0.35)',
      activeMatchBackground: 'rgba(255, 140, 0, 0.6)',
      matchOverviewRuler: '#e6a700',
      activeMatchColorOverviewRuler: '#ff8c00'
    }
  }
}

function resetCount(): void {
  resultIndex.value = -1
  resultCount.value = 0
}

function findNext(): void {
  try {
    const s = ensureAddon()
    if (!s || !query.value) return
    s.findNext(query.value, opts())
  } catch (err) {
    // The target terminal may have been torn down between attach and search; xterm's addon throws
    // "Cannot use addon until it has been loaded" once its terminal is disposed. Surface it instead
    // of silently showing "no match", and drop the stale attach so the next keystroke re-binds.
    console.warn('[terminal-search] findNext failed', err)
    attachedTo = null
    resetCount()
  }
}

function findPrevious(): void {
  try {
    const s = ensureAddon()
    if (!s || !query.value) return
    s.findPrevious(query.value, opts())
  } catch (err) {
    console.warn('[terminal-search] findPrevious failed', err)
    attachedTo = null
    resetCount()
  }
}

/** Live search while typing: an incremental findNext expands/keeps the current selection. */
function onQueryInput(): void {
  if (!query.value) {
    resetCount()
    return
  }
  try {
    const s = ensureAddon()
    if (!s) return
    s.findNext(query.value, { ...opts(), incremental: true })
  } catch (err) {
    console.warn('[terminal-search] live search failed', err)
    attachedTo = null
    resetCount()
  }
}

async function open(): Promise<void> {
  if (!props.getTerm()) return
  visible.value = true
  await nextTick()
  inputEl.value?.focus()
  inputEl.value?.select()
  if (query.value) findNext()
}

function close(): void {
  visible.value = false
  try {
    search?.clearDecorations()
    props.getTerm()?.focus()
  } catch {
    /* target terminal already gone; nothing to focus */
  }
}

function toggle(): void {
  if (visible.value) close()
  else void open()
}

function onCaseToggle(): void {
  caseSensitive.value = !caseSensitive.value
  if (query.value) findNext()
}

const summary = computed(() => {
  if (!query.value) return ''
  if (resultCount.value === 0) return t('terminal.searchNoMatch')
  return t('terminal.searchCount', { index: resultIndex.value + 1, total: resultCount.value })
})

function onKey(e: KeyboardEvent): void {
  const term = props.getTerm()
  const root = term?.element ?? null
  const active = document.activeElement
  const focusedHere = !!root && (root === active || root.contains(active))
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
    // Only claim Ctrl+F when this terminal owns focus — several surfaces may be mounted at once.
    if (focusedHere) {
      e.preventDefault()
      void open()
    }
    return
  }
  if (e.key === 'Escape' && visible.value) {
    e.preventDefault()
    close()
  }
}

onMounted(() => document.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey, true)
  disposeResults?.()
  search?.dispose()
  search = null
  attachedTo = null
})

defineExpose({ open, close, toggle })
</script>

<template>
  <Transition name="ts">
    <div v-if="visible" class="term-search">
      <input
        ref="inputEl"
        v-model="query"
        class="ts-input"
        type="text"
        spellcheck="false"
        :placeholder="t('terminal.searchPlaceholder')"
        @input="onQueryInput"
        @keydown.enter.exact.prevent="findNext"
        @keydown.shift.enter.prevent="findPrevious"
      />
      <span class="ts-count">{{ summary }}</span>
      <el-tooltip
        :content="t('terminal.caseSensitive')"
        placement="top"
        popper-class="dsh-tip-popper"
      >
        <button class="ts-btn" :class="{ on: caseSensitive }" @click="onCaseToggle">
          Aa
        </button>
      </el-tooltip>
      <el-tooltip :content="t('terminal.prevMatch')" placement="top" popper-class="dsh-tip-popper">
        <button class="ts-btn" @click="findPrevious">
          <el-icon size="13"><ArrowUp /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip :content="t('terminal.nextMatch')" placement="top" popper-class="dsh-tip-popper">
        <button class="ts-btn" @click="findNext">
          <el-icon size="13"><ArrowDown /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip :content="t('terminal.closeSearch')" placement="top" popper-class="dsh-tip-popper">
        <button class="ts-btn" @click="close">
          <el-icon size="13"><Close /></el-icon>
        </button>
      </el-tooltip>
    </div>
  </Transition>
</template>

<style scoped>
.term-search {
  display: flex;
  align-items: center;
  gap: 4px;
  /* Match the header buttons' height so toggling the pill never changes the bar height. */
  height: 24px;
  box-sizing: border-box;
  padding: 0 4px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: 8px;
  background: var(--surface);
  /* Clip the children while the pill animates its width open/closed. */
  overflow: hidden;
  white-space: nowrap;
}

/* Keep children at natural size so the width transition reveals them instead of squeezing. */
.ts-input,
.ts-count,
.ts-btn {
  flex: none;
}

.ts-input {
  width: 160px;
  height: 20px;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  padding: 0 6px;
  outline: none;
}
.ts-input:focus {
  border-color: var(--accent);
}

.ts-count {
  min-width: 48px;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-dim);
  white-space: nowrap;
}

.ts-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.ts-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}
.ts-btn.on {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--accent);
  font-weight: 700;
}

/* Horizontal expand/collapse: grow max-width from a 0 point next to the buttons. */
.ts-enter-active,
.ts-leave-active {
  transition:
    max-width 0.2s ease,
    opacity 0.2s ease,
    padding 0.2s ease,
    border-width 0.2s ease;
}
.ts-enter-from,
.ts-leave-to {
  max-width: 0;
  opacity: 0;
  padding-left: 0;
  padding-right: 0;
  border-left-width: 0;
  border-right-width: 0;
}
.ts-enter-to,
.ts-leave-from {
  max-width: 340px;
  opacity: 1;
}
</style>
