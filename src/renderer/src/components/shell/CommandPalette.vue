<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import EmptyState from '@renderer/components/base/EmptyState.vue'
import { t } from '@renderer/i18n'

/**
 * Ctrl+K command palette: a single fuzzy-searchable surface that unifies page
 * switching, panel entry, and quick window/view actions. It owns only presentation
 * and keyboard focus — the actual work is delegated back to the caller via each
 * command's `run`, so App.vue stays the single source of behavior.
 */
export interface Command {
  id: string
  title: string
  /** Secondary line: the port, a shortcut hint, the panel it opens… */
  hint?: string
  /** Free-text matched by the filter alongside the title (aliases, pinyin…). */
  keywords?: string
  group: string
  run: () => void
}

const props = defineProps<{
  commands: Command[]
  /**
   * Optional deep-search channel (#5): given the trimmed query, resolve extra commands (log
   * matches, MCP tools, settings rows) that are too costly to keep in the static list. Called
   * on a debounce; a stale response is dropped by an internal sequence guard. Empty query skips it.
   */
  asyncSearch?: (query: string) => Promise<Command[]>
}>()
const visible = defineModel<boolean>({ required: true })

const query = ref('')
const active = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)

/** Deep-search rows layered on top of the static commands for the current query. */
const asyncResults = ref<Command[]>([])
const searching = ref(false)
let searchSeq = 0
let searchTimer: ReturnType<typeof setTimeout> | null = null

/** Static + deep rows, deduped by id (a deep hit never replaces a real command). */
const allCommands = computed<Command[]>(() => {
  if (!asyncResults.value.length) return props.commands
  const seen = new Set(props.commands.map((c) => c.id))
  const extra = asyncResults.value.filter((c) => !seen.has(c.id))
  return extra.length ? [...props.commands, ...extra] : props.commands
})

/* ---- palette-only Ctrl+letter quick-open (操作 + 面板) ------------------------------
   A fast path that lives entirely inside the palette: while it is open, Ctrl+<letter> fires the
   matching command and the combo shows as a badge on the row. No global binding is added (a hosted
   page never loses the key), and the letter is assigned by walking the *static* command list in
   order, so a command keeps the same letter no matter what is typed. Only 操作 / 面板 rows take a
   slot (页面 rows are too numerous and change with what is installed, so they stay badge-free);
   the editing keys and the palette toggle stay out of the pool (Ctrl+A/C/V/X/Z + Ctrl+K), and any
   command past the last free letter simply shows no badge (graceful overflow). */
const RESERVED_KEYS = new Set(['a', 'c', 'v', 'x', 'z', 'k'])
const QUICK_KEY_POOL = 'abcdefghijklmnopqrstuvwxyz'.split('').filter((ch) => !RESERVED_KEYS.has(ch))

/** Only 操作 / 面板 items take a quick-open slot; 页面 items never do. */
function isQuickEligible(cmd: Command): boolean {
  return cmd.group === t('palette.groupActions') || cmd.group === t('palette.groupPanels')
}

/** Stable id → letter map over the static commands (deep-search rows never take a slot). */
const quickKeyById = computed<Map<string, string>>(() => {
  const map = new Map<string, string>()
  let i = 0
  for (const c of props.commands) {
    if (!isQuickEligible(c)) continue
    if (i >= QUICK_KEY_POOL.length) break
    map.set(c.id, QUICK_KEY_POOL[i++])
  }
  return map
})
/** Reverse: letter → the command it fires (only static commands carry a live `run`). */
const quickKeyCommands = computed<Map<string, Command>>(() => {
  const byId = new Map(props.commands.map((c) => [c.id, c]))
  const map = new Map<string, Command>()
  quickKeyById.value.forEach((letter, id) => {
    const c = byId.get(id)
    if (c) map.set(letter, c)
  })
  return map
})
function quickKeyOf(id: string): string | undefined {
  return quickKeyById.value.get(id)
}

/** Subsequence fuzzy match; earlier + tighter hits score lower (better). */
function score(cmd: Command, q: string): number | null {
  if (!q) return 0
  const hay = `${cmd.title} ${cmd.keywords ?? ''}`.toLowerCase()
  const needle = q.toLowerCase()
  const exact = hay.indexOf(needle)
  if (exact >= 0) return exact // substring beats a scattered subsequence
  let i = 0
  let first = -1
  for (let idx = 0; idx < hay.length && i < needle.length; idx++) {
    if (hay[idx] === needle[i]) {
      if (first < 0) first = idx
      i++
    }
  }
  return i === needle.length ? 100 + first : null // matched, penalize a late start
}

const filtered = computed(() => {
  const q = query.value.trim()
  const scored = allCommands.value
    .map((c) => ({ c, s: score(c, q) }))
    .filter((x): x is { c: Command; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s)
  return scored.map((x) => x.c)
})

/**
 * Bucket by group (first-appearance order) so a header never repeats, then flatten
 * back into `ordered`: that array IS the visual top-to-bottom order, so the `active`
 * index for keyboard nav lines up with what the user sees (score sort can interleave). */
const grouped = computed(() => {
  const order: string[] = []
  const byGroup = new Map<string, Command[]>()
  filtered.value.forEach((cmd) => {
    let bucket = byGroup.get(cmd.group)
    if (!bucket) {
      bucket = []
      byGroup.set(cmd.group, bucket)
      order.push(cmd.group)
    }
    bucket.push(cmd)
  })
  let flat = 0
  return order.map((group) => ({
    group,
    items: byGroup.get(group)!.map((cmd) => ({ cmd, flat: flat++ }))
  }))
})

/** Visual top-to-bottom command order; `active` indexes here. */
const ordered = computed(() => grouped.value.flatMap((sec) => sec.items.map((i) => i.cmd)))

watch(ordered, () => {
  active.value = 0
})
watch(query, () => {
  active.value = 0
})

// #5: debounce the deep search so a fast typist fires one query, not one per keystroke; a
// response from a since-superseded query is dropped via the sequence guard.
watch(query, (q) => {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  const trimmed = q.trim()
  if (!props.asyncSearch || !trimmed) {
    asyncResults.value = []
    searching.value = false
    return
  }
  searching.value = true
  const seq = ++searchSeq
  searchTimer = setTimeout(() => {
    searchTimer = null
    props
      .asyncSearch!(trimmed)
      .then((cmds) => {
        if (seq !== searchSeq) return
        asyncResults.value = cmds
      })
      .catch(() => {
        if (seq === searchSeq) asyncResults.value = []
      })
      .finally(() => {
        if (seq === searchSeq) searching.value = false
      })
  }, 180)
})

watch(visible, async (v) => {
  if (v) {
    query.value = ''
    active.value = 0
    await nextTick()
    inputEl.value?.focus()
  }
})

function clampActive(): void {
  const n = ordered.value.length
  if (n === 0) active.value = 0
  else if (active.value >= n) active.value = n - 1
  else if (active.value < 0) active.value = 0
}

function scrollActiveIntoView(): void {
  listEl.value
    ?.querySelector<HTMLElement>('[data-active="true"]')
    ?.scrollIntoView({ block: 'nearest' })
}

function move(delta: number): void {
  active.value += delta
  clampActive()
  nextTick(scrollActiveIntoView)
}

function run(cmd: Command): void {
  close()
  // Defer so the palette is gone before a command that opens a panel/dialog runs.
  nextTick(() => cmd.run())
}

function close(): void {
  visible.value = false
}

function onListKeydown(ev: KeyboardEvent): void {
  // Ctrl+letter quick-open wins over the arrow/enter nav and never reaches the global handler
  // (stopPropagation), so a hosted page or the window menu can't also act on the same combo.
  if (ev.ctrlKey && !ev.altKey && !ev.metaKey && !ev.shiftKey) {
    const letter = (ev.key || '').toLowerCase()
    if (/^[a-z]$/.test(letter)) {
      const cmd = quickKeyCommands.value.get(letter)
      if (cmd) {
        ev.preventDefault()
        ev.stopPropagation()
        run(cmd)
        return
      }
    }
  }
  switch (ev.key) {
    case 'ArrowDown':
      ev.preventDefault()
      move(1)
      break
    case 'ArrowUp':
      ev.preventDefault()
      move(-1)
      break
    case 'Enter': {
      ev.preventDefault()
      const cmd = ordered.value[active.value]
      if (cmd) run(cmd)
      break
    }
    case 'Escape':
      ev.preventDefault()
      ev.stopPropagation()
      close()
      break
  }
}

// Capture so Esc/Ctrl+K close wins over the webview and other surfaces.
function onDocumentKeydown(ev: KeyboardEvent): void {
  if (!visible.value) return
  if (ev.key === 'Escape') {
    ev.stopPropagation()
    close()
  }
}

document.addEventListener('keydown', onDocumentKeydown, true)
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown, true)
})

const emptyText = computed(() =>
  searching.value
    ? t('palette.searching')
    : allCommands.value.length
      ? t('palette.noMatch')
      : t('palette.none')
)
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="palette-overlay" @mousedown.self="close">
      <div class="palette" role="dialog" :aria-label="t('palette.title')" @keydown="onListKeydown">
        <div class="palette-input-row">
          <span class="search-glyph" aria-hidden="true">⌕</span>
          <input
            ref="inputEl"
            v-model="query"
            class="palette-input"
            type="text"
            :placeholder="t('palette.placeholder')"
            :aria-label="t('palette.placeholder')"
            autocomplete="off"
            spellcheck="false"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
          />
          <span v-if="searching" class="search-spin" :aria-label="t('palette.searching')"
            >⋯</span
          >
          <kbd class="esc-hint">Esc</kbd>
        </div>

        <div id="palette-results" ref="listEl" class="palette-list" role="listbox">
          <EmptyState v-if="!ordered.length" :description="emptyText" />
          <template v-else>
            <div v-for="sec in grouped" :key="sec.group" class="palette-group">
              <div class="group-label">{{ sec.group }}</div>
              <button
                v-for="row in sec.items"
                :key="row.cmd.id"
                class="palette-item"
                :class="{ active: row.flat === active }"
                :data-active="row.flat === active"
                role="option"
                :aria-selected="row.flat === active"
                @mouseenter="active = row.flat"
                @click="run(row.cmd)"
              >
                <span class="item-title">{{ row.cmd.title }}</span>
                <span class="item-right">
                  <span v-if="row.cmd.hint" class="item-hint">{{ row.cmd.hint }}</span>
                  <kbd v-if="quickKeyOf(row.cmd.id)" class="item-key">Ctrl+{{ quickKeyOf(row.cmd.id) }}</kbd>
                </span>
              </button>
            </div>
          </template>
        </div>

        <div class="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> {{ t('palette.nav') }}</span>
          <span><kbd>Enter</kbd> {{ t('palette.run') }}</span>
          <span><kbd>Ctrl</kbd>+<kbd>A</kbd> {{ t('palette.quickOpen') }}</span>
          <span><kbd>Esc</kbd> {{ t('palette.close') }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.palette-overlay {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  background: rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(1px);
}

.palette {
  width: min(560px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(120% 50% at 50% -8%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%),
    color-mix(in srgb, var(--surface) 90%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
  border-radius: 14px;
  -webkit-backdrop-filter: blur(34px) saturate(150%);
  backdrop-filter: blur(34px) saturate(150%);
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.45),
    0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent) inset,
    0 18px 60px color-mix(in srgb, var(--accent) 14%, transparent);
  overflow: hidden;
}

.palette-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.search-glyph {
  color: var(--text-dim);
  font-size: 16px;
  line-height: 1;
}

.palette-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: none;
  color: var(--text);
  font-size: 15px;
  font-family: inherit;
}

.palette-input::placeholder {
  color: var(--text-dim);
}

.esc-hint {
  flex: none;
}
.search-spin {
  flex: none;
  color: var(--accent);
  font-size: 15px;
  line-height: 1;
  animation: palette-spin 1s steps(6, end) infinite;
}
@keyframes palette-spin {
  to {
    opacity: 0.4;
  }
}

.palette-list {
  max-height: min(52vh, 420px);
  overflow-y: auto;
  padding: 6px;
}

.palette-group + .palette-group {
  margin-top: 4px;
}

.group-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding: 8px 10px 4px;
}

.palette-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  background: none;
  border: none;
  border-radius: 8px;
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
  text-align: left;
  padding: 8px 10px;
  cursor: pointer;
}

.palette-item.active {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
  color: var(--accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent) inset;
}

.item-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-hint {
  flex: none;
  font-size: 11.5px;
  color: var(--text-dim);
}
.item-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.item-key {
  flex: none;
}

.palette-foot {
  display: flex;
  gap: 16px;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  font-size: 11.5px;
  color: var(--text-dim);
}

.palette-foot span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

kbd {
  font-family: inherit;
  font-size: 10.5px;
  line-height: 1;
  color: var(--text-dim);
  background: var(--glass-chip);
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 5px;
  padding: 2px 5px;
}
</style>
