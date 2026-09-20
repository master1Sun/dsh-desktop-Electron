<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { PageState } from '../stores/pages'
import { t } from '../i18n'

const props = defineProps<{ page: PageState | null }>()
const emit = defineEmits<{ exit: [] }>()

const containerEl = ref<HTMLElement | null>(null)
let term: Terminal | null = null
let fit: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let disposeData: (() => void) | null = null
let disposeExit: (() => void) | null = null
/** Last grid size pushed to the PTY — see fitActive(). */
let lastCols = -1
let lastRows = -1

const ptyId = ref<string | null>(null)
const state = ref<'idle' | 'starting' | 'running' | 'exited'>('idle')
const exitCode = ref<number | null>(null)
const errorText = ref('')

/** Overlay copy for the `exited` state: an explicit error wins, else the localized exit notice. */
const exitedText = computed(() => {
  if (errorText.value) return errorText.value
  const name = props.page?.name || t('cliView.process')
  const code = exitCode.value
  return t('cliView.exited', { name }) + (code !== null ? t('cliView.exitCode', { code }) : '')
})

/** Bytes waiting to be painted. A full-screen TUI repaints in many small chunks;
    writing each one synchronously makes xterm re-render dozens of times per frame,
    which shows up as flicker and eventually wedges the renderer. Batch them into one
    write per animation frame instead. */
let pendingWrite = ''
let writeScheduled = false

function flushWrite(): void {
  writeScheduled = false
  if (!pendingWrite || !term) return
  const data = pendingWrite
  pendingWrite = ''
  term.write(data)
}

function queueWrite(data: string): void {
  if (!term) return
  pendingWrite += data
  if (writeScheduled) return
  writeScheduled = true
  requestAnimationFrame(flushWrite)
}

/** 终端配色跟随应用白天/黑夜主题（与内嵌终端抽屉一致）。 */
function themeColors(): { bg: string; fg: string } {
  const light = document.documentElement.classList.contains('light')
  return light ? { bg: '#ffffff', fg: '#1f2328' } : { bg: '#000000', fg: '#e8ecf3' }
}

function ensureTerm(): void {
  if (term || !containerEl.value) return
  const c = themeColors()
  term = new Terminal({
    // Full-screen TUIs position the cursor themselves. Translating every bare \n
    // into \r\n makes each repaint land one line lower, so the screen scrolls/
    // flickers continuously until the renderer stalls.
    convertEol: false,
    cursorBlink: true,
    fontFamily: 'Consolas, Menlo, "Cascadia Code", monospace',
    fontSize: 13,
    scrollback: 8000,
    theme: { background: c.bg, foreground: c.fg }
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(containerEl.value)
  term.onData((data) => {
    if (ptyId.value) window.container.ptyWrite(ptyId.value, data).catch(() => undefined)
  })
  resizeObserver = new ResizeObserver(() => fitActive())
  resizeObserver.observe(containerEl.value)
}

function fitActive(): void {
  if (!term || !fit || !ptyId.value) return
  try {
    fit.fit()
    // Only push a resize when the grid actually changed: a TUI repaints on every
    // SIGWINCH, so redundant resizes turn into an endless repaint loop.
    if (term.cols === lastCols && term.rows === lastRows) return
    lastCols = term.cols
    lastRows = term.rows
    window.container.ptyResize(ptyId.value, term.cols, term.rows).catch(() => undefined)
  } catch {
    /* container not laid out yet */
  }
}

/** Guards against overlapping runs: a page refresh while one is starting would
    otherwise spawn a second PTY and reset the surface mid-paint (flicker). */
let runInFlight = false

async function run(page: PageState): Promise<void> {
  if (runInFlight) return
  runInFlight = true
  try {
    stopPty()
    state.value = 'starting'
    errorText.value = ''
    exitCode.value = null
    await nextTick()
    ensureTerm()
    term?.reset()
    lastCols = -1
    lastRows = -1
    const res = await window.container.pageRunSpec(page.id)
    if (!res.ok) throw new Error(res.error || t('cliView.noConfig'))
    const spec = res.data as { command: string; env?: Record<string, string> } | null
    if (!spec?.command) throw new Error(t('cliView.missingCommand', { name: page.name }))
    const start = await window.container.ptyStart(page.id, spec)
    if (!start.ok) throw new Error(start.error || t('common.terminalStartFail'))
    const info = start.data as { id: string }
    ptyId.value = info.id
    state.value = 'running'
    disposeData = window.container.onPtyData(({ id, data }) => {
      if (id === ptyId.value) queueWrite(data)
    })
    disposeExit = window.container.onPtyExit(({ id, code }) => {
      if (id !== ptyId.value) return
      // Paint whatever arrived with the exit before covering the surface.
      flushWrite()
      state.value = 'exited'
      exitCode.value = code
      cleanupListeners()
    })
    fitActive()
    term?.focus()
  } catch (err) {
    state.value = 'exited'
    errorText.value = (err as Error).message
  } finally {
    runInFlight = false
  }
}

function cleanupListeners(): void {
  disposeData?.()
  disposeExit?.()
  disposeData = null
  disposeExit = null
}

function stopPty(): void {
  cleanupListeners()
  pendingWrite = ''
  if (ptyId.value) window.container.ptyKill(ptyId.value).catch(() => undefined)
  ptyId.value = null
}

/** Leave the CLI terminal and give the user back the normal workbench. */
function leave(): void {
  stopPty()
  state.value = 'idle'
  emit('exit')
}

defineExpose({ restart: () => props.page && run(props.page) })

watch(
  () => props.page?.id,
  (id) => {
    if (id && props.page) run(props.page)
    else stopPty()
  },
  { immediate: true }
)

watch(
  () => document.documentElement.className,
  () => {
    if (!term) return
    const c = themeColors()
    term.options.theme = { ...term.options.theme, background: c.bg, foreground: c.fg }
  }
)

onBeforeUnmount(stopPty)
</script>

<template>
  <div class="cli-term">
    <div ref="containerEl" class="cli-term-surface" />
    <div v-if="state === 'starting'" class="cli-term-overlay">
      <span class="status-dot starting" />
      {{ t('cliView.launching', { name: props.page?.name || t('cliView.process') }) }}
    </div>
    <div v-else-if="state === 'exited'" class="cli-term-overlay">
      <div class="cli-term-exited">
        <p>{{ exitedText }}</p>
        <div class="cli-term-actions">
          <el-button
            type="primary"
            round
            :disabled="!props.page"
            @click="props.page && run(props.page)"
          >
            {{ t('cliView.rerun') }}
          </el-button>
          <el-button round @click="leave">{{ t('cliView.backToWorkbench') }}</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cli-term {
  position: relative;
  flex: 1;
  /* .content 是块级容器，必须显式撑满高度，否则塌缩到 xterm 初始行数、下方露出页面底色 */
  height: 100%;
  min-height: 0;
  display: flex;
  background: var(--surface);
}

.cli-term-surface {
  flex: 1;
  min-width: 0;
  padding: 6px 4px 6px 10px;
}

.cli-term-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 12px;
  color: var(--text-dim);
  /* Kept translucent: when a CLI aborts (bad config, missing dir) its own error is
     the only clue, and it is printed on the terminal underneath this overlay. */
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  z-index: 5;
}

.cli-term-exited {
  display: grid;
  justify-items: center;
  gap: 4px;
  text-align: center;
  font-size: 14px;
}

.cli-term-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
</style>
