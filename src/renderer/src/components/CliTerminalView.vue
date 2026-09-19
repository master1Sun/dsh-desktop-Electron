<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Refresh } from '@element-plus/icons-vue'
import type { PageState } from '../stores/pages'

const props = defineProps<{ page: PageState | null }>()
const emit = defineEmits<{ exit: [] }>()

const containerEl = ref<HTMLElement | null>(null)
let term: Terminal | null = null
let fit: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let disposeData: (() => void) | null = null
let disposeExit: (() => void) | null = null

const ptyId = ref<string | null>(null)
const state = ref<'idle' | 'starting' | 'running' | 'exited'>('idle')
const exitCode = ref<number | null>(null)
const errorText = ref('')

/** CLI 全屏终端始终使用深色配色，不跟随应用主题（浅色主题下白底终端不可读）。 */
function themeColors(): { bg: string; fg: string } {
  return { bg: '#0f1420', fg: '#e6edf3' }
}

function ensureTerm(): void {
  if (term || !containerEl.value) return
  const c = themeColors()
  term = new Terminal({
    convertEol: true,
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
    window.container.ptyResize(ptyId.value, term.cols, term.rows).catch(() => undefined)
  } catch {
    /* container not laid out yet */
  }
}

async function run(page: PageState): Promise<void> {
  stopPty()
  state.value = 'starting'
  errorText.value = ''
  exitCode.value = null
  await nextTick()
  ensureTerm()
  term?.reset()
  try {
    const res = await window.container.pageRunSpec(page.id)
    if (!res.ok) throw new Error(res.error || '无法获取运行配置')
    const spec = res.data as { command: string; env?: Record<string, string> } | null
    if (!spec?.command) throw new Error(`${page.name} 缺少启动命令，无法在终端中运行`)
    const start = await window.container.ptyStart(page.id, spec)
    if (!start.ok) throw new Error(start.error || '终端启动失败')
    const info = start.data as { id: string }
    ptyId.value = info.id
    state.value = 'running'
    disposeData = window.container.onPtyData(({ id, data }) => {
      if (id === ptyId.value) term?.write(data)
    })
    disposeExit = window.container.onPtyExit(({ id, code }) => {
      if (id !== ptyId.value) return
      state.value = 'exited'
      exitCode.value = code
      cleanupListeners()
    })
    fitActive()
    term?.focus()
  } catch (err) {
    state.value = 'exited'
    errorText.value = (err as Error).message
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

onBeforeUnmount(stopPty)
</script>

<template>
  <div class="cli-term">
    <div ref="containerEl" class="cli-term-surface" />
    <div v-if="state === 'starting'" class="cli-term-overlay">
      <span class="status-dot starting" /> 正在于内置终端启动 {{ props.page?.name }}…
    </div>
    <div v-else-if="state === 'exited'" class="cli-term-overlay">
      <div class="cli-term-exited">
        <p>
          {{
            errorText ||
            `${props.page?.name ?? '进程'} 已退出${exitCode !== null ? `（code=${exitCode}）` : ''}`
          }}
        </p>
        <div class="cli-term-actions">
          <el-button
            type="primary"
            round
            :disabled="!props.page"
            @click="props.page && run(props.page)"
          >
            <el-icon><Refresh /></el-icon> 重新运行
          </el-button>
          <el-button round @click="leave">返回工作台</el-button>
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
  background: #0f1420;
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
  color: #8b949e;
  background: rgba(15, 20, 32, 0.88);
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
