<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import EmptyState from './EmptyState.vue'
import { t } from '../i18n'

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

const props = defineProps<{ commands: Command[] }>()
const visible = defineModel<boolean>({ required: true })

const query = ref('')
const active = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)

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
  const scored = props.commands
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

const emptyText = computed(() => (props.commands.length ? t('palette.noMatch') : t('palette.none')))
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
                <span v-if="row.cmd.hint" class="item-hint">{{ row.cmd.hint }}</span>
              </button>
            </div>
          </template>
        </div>

        <div class="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> {{ t('palette.nav') }}</span>
          <span><kbd>Enter</kbd> {{ t('palette.run') }}</span>
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
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
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
  background: var(--surface-2);
  color: var(--accent);
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
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 5px;
  padding: 2px 5px;
}
</style>
