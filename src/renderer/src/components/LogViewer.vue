<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { LogFileInfo, LogReadResult, LogLineEvent } from '@shared/types'
import { t } from '../i18n'
import { askAiWith } from '../askAi'

/**
 * In-app log tail for field debugging — a packaged app has no console and most users
 * won't navigate to userData/logs. Reads through container.readLogs (main-process
 * tails ≤512KB, so a 5MB rotated log costs nothing). Also hosts the one-click
 * diagnostics export, since "send me your logs + versions" is the same audience.
 */
const props = defineProps<{
  /**
   * Log key to focus (same spelling as {@link LogFileInfo.key}: 'main' | 'pages/<id>'). Lets
   * the activity timeline deep-link straight into the page it talks about; re-firing with the
   * same key re-reads, so clicking a second event of the same page still refreshes the view.
   */
  focusKey?: string
}>()

const files = ref<LogFileInfo[]>([])
const key = ref('main')
const filter = ref('')
const tail = ref(400)
const content = ref('')
const busy = ref(false)
const diagBusy = ref(false)

/* ---- #22 live stream ----
   The main process tails log files with fs.watch and pushes only newly-completed
   lines per file; we append those straight to the current view for millisecond-level
   following. This is the single auto-follow mechanism — the coarse 3s poll it replaced
   was redundant, so only the manual 刷新 button remains alongside it (for re-reading
   after a filter change or to catch up on anything written while the panel was closed). */
const live = ref(true)
/** 时间倒序:最新一行在顶部。默认开 —— 排障时先看的就是最近发生了什么。 */
const newestFirst = ref(true)
const preEl = ref<HTMLElement | null>(null)
let offLog: (() => void) | undefined

function scrollBottom(): void {
  void nextTick(() => {
    const el = preEl.value
    if (!el) return
    // Newest-on-top puts the live edge at scrollHeight=0; no follow-scroll needed there.
    if (!newestFirst.value) el.scrollTop = el.scrollHeight
  })
}

function matchesFilter(line: string): boolean {
  const f = filter.value.trim()
  return !f || line.toLowerCase().includes(f.toLowerCase())
}

function onLogEvent(ev: LogLineEvent): void {
  // A stream line for a file we never listed means a new log just appeared (an import,
  // a first CLI run): pull the file list so it becomes selectable without a panel reopen.
  if (!files.value.some((f) => f.key === ev.key)) void loadFiles()
  if (!live.value || ev.key !== key.value) return
  const fresh = (ev.lines || []).filter(matchesFilter)
  if (!fresh.length) return
  const merged = content.value ? `${content.value}\n${fresh.join('\n')}` : fresh.join('\n')
  // Keep the buffer bounded to the selected tail length so long sessions don't grow forever.
  const all = merged.split('\n')
  // Oldest end gets trimmed either way — it's what falls off the visible (newest) edge.
  content.value = all.slice(Math.max(0, all.length - tail.value)).join('\n')
  scrollBottom()
}

async function loadFiles(): Promise<void> {
  try {
    const res = await window.container.listLogFiles()
    if (res?.ok) files.value = (res.data as LogFileInfo[]) || []
  } catch {
    /* viewer simply shows an empty list */
  }
}

async function loadContent(): Promise<void> {
  if (!key.value) return
  busy.value = true
  try {
    const res = await window.container.readLogs({
      key: key.value,
      tail: tail.value,
      filter: filter.value || undefined
    })
    if (res?.ok) {
      const r = res.data as LogReadResult
      content.value = (r.lines || []).join('\n')
    } else {
      content.value = `Error: ${res?.error || t('common.unknownError')}`
    }
  } finally {
    busy.value = false
  }
  scrollBottom()
}

/** 刷新 = re-list files AND re-read content: new page logs join the dropdown too. */
async function refreshAll(): Promise<void> {
  await loadFiles()
  await loadContent()
}

function onKeyChange(): void {
  void loadContent()
}

/** Deep-link from the activity timeline: adopt the requested file and re-read it. */
watch(
  () => props.focusKey,
  (k) => {
    if (!k) return
    key.value = k
    void loadContent().then(scrollBottom)
  }
)

/* ---- per-line view with a "复制并问 AI" affordance ----
   One row per line so an individual entry can be handed to the agent without also pasting the
   surrounding noise. Only the lines that read as failures get the button — a green tail does not
   need a question. Right-clicking any row copies it too, for the cases the heuristic misses. */
const lines = computed(() => (content.value ? content.value.split('\n') : []))
/** Render order follows the 最新在前 toggle; reversing a copy keeps `lines` (and its
    right-click fallback) in the file's native order. */
const viewLines = computed(() => (newestFirst.value ? [...lines.value].reverse() : lines.value))
const ERROR_LINE_RE = /\b(error|err|exception|fail(ed|ure)?|warn|fatal|timeout|refused)\b|[错误异常失败超时]/i

/* ---- 特殊语法高亮 ----
   日志内容永远只是被展示，全部先 escape 再注入固定的高亮 span：级别关键字着色、
   行首时间戳弱化，整行错误再另加 is-error 背景。 */
const LEVEL_RE = /\b(ERROR|FATAL|CRITICAL|WARN(?:ING)?|DEBUG|TRACE|INFO)\b/i
const TS_RE = /^(\s*\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})?)/

const escapeHtml = (s: string): string =>
  s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))

function highlight(line: string): string {
  let html = escapeHtml(line)
  html = html.replace(LEVEL_RE, (kw) => `<b class="lv-kw lv-kw-${kw.toLowerCase()}">${kw}</b>`)
  html = html.replace(TS_RE, (_m, ts: string) => `<span class="lv-ts">${ts}</span>`)
  return html
}

/** 预计算每行的着色 HTML + 错误判定；模板里对 2000 行重复跑正则太浪费。 */
const rows = computed(() =>
  viewLines.value.map((l) => ({ html: highlight(l), err: ERROR_LINE_RE.test(l) }))
)

async function askAbout(line: string): Promise<void> {
  const text = (line || '').trim()
  if (!text) return
  await askAiWith(`[${key.value}] ${text}`)
}

function onFilesChange(): void {
  if (!files.value.some((f) => f.key === key.value)) key.value = files.value[0]?.key || ''
}

const sizeOf = (n: number): string =>
  n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`

async function doExport(): Promise<void> {
  if (diagBusy.value) return
  diagBusy.value = true
  try {
    const res = await window.container.exportDiagnostics()
    if (res?.ok) {
      // data === null means the user dismissed the save dialog — no message then.
      if (res.data) ElMessage.success(t('panel.exportDiagDone', { path: String(res.data) }))
    } else {
      ElMessage.error(res?.error || t('panel.exportDiagFailed'))
    }
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    diagBusy.value = false
  }
}

onMounted(() => {
  void loadFiles().then(() => {
    // Adopt a deep-linked file on first mount too — the watcher below only sees *changes*,
    // and the panel mounts the viewer the first time the logs tab is opened.
    if (props.focusKey && files.value.some((f) => f.key === props.focusKey)) key.value = props.focusKey
    onFilesChange()
    return loadContent().then(scrollBottom)
  })
  offLog = window.container.onLogLine?.(onLogEvent)
})
onBeforeUnmount(() => {
  offLog?.()
})
</script>

<template>
  <div class="log-viewer">
    <div class="lv-bar">
      <el-select v-model="key" size="small" style="width: 160px" @change="onKeyChange">
        <el-option
          v-for="f in files"
          :key="f.key"
          :label="`${f.label} (${sizeOf(f.bytes)})`"
          :value="f.key"
        />
      </el-select>
      <el-input
        v-model="filter"
        size="small"
        :placeholder="t('panel.logFilter')"
        clearable
        style="width: 150px"
        @keyup.enter="loadContent"
        @clear="loadContent"
      />
      <el-select v-model="tail" size="small" style="width: 110px" @change="loadContent">
        <el-option
          v-for="n in [200, 400, 800, 2000]"
          :key="n"
          :label="`${n} ${t('panel.logTail')}`"
          :value="n"
        />
      </el-select>
      <el-switch v-model="live" size="small" :active-text="t('panel.logLive')" />
      <el-switch
        v-model="newestFirst"
        size="small"
        :active-text="t('panel.logNewestFirst')"
        @change="scrollBottom"
      />
      <el-button size="small" :loading="busy" @click="refreshAll">{{
        t('panel.logRefresh')
      }}</el-button>
      <span class="lv-spacer" />
      <el-button size="small" :loading="diagBusy" @click="doExport">{{
        t('panel.exportDiagBtn')
      }}</el-button>
    </div>
    <!-- 行列表用 div 容器而不是 <pre>：Vue 对 <pre> 内的元素间换行会原样保留，
         每行之间会多出空白行；改 div + v-html 既紧凑又不丢行内缩进（.lv-text 仍 pre-wrap）。 -->
    <div v-if="lines.length" ref="preEl" class="lv-pre" @contextmenu.prevent="askAbout(viewLines[0] ?? '')">
      <span
        v-for="(r, i) in rows"
        :key="i"
        class="lv-line"
        :class="{ 'is-error': r.err }"
        @contextmenu.prevent="askAbout(viewLines[i])"
      >
      <!-- eslint-disable-next-line vue/no-v-html -- html is escapeHtml()'d before markup is added -->
        <span class="lv-text" v-html="r.html" /><button
          v-if="r.err"
          class="lv-ask"
          :title="t('app.askAiBtn')"
          @click.stop="askAbout(viewLines[i])"
        >
          {{ t('app.askAiBtn') }}
        </button>
      </span>
    </div>
    <pre v-else ref="preEl" class="lv-pre">{{ content || t('panel.logEmpty') }}</pre>
  </div>
</template>

<style scoped>
.log-viewer {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lv-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.lv-spacer {
  flex: 1;
}

.lv-pre {
  margin: 0;
  max-height: 260px;
  overflow: auto;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 11.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-dim);
  user-select: text;
}

/* Rows are block divs; the ask button only shows on the row under the cursor so the log
   stays scannable. */
.lv-line {
  display: block;
}

.lv-text {
  white-space: pre-wrap;
}

.lv-line.is-error {
  color: var(--err);
  /* 错误行另给一条淡红底带，方便扫读时一眼定位。 */
  background: color-mix(in srgb, var(--err) 8%, transparent);
  border-radius: 4px;
}

/* ---- 语法高亮（注入在 v-html 里，故用 :deep 穿透 scoped）: 级别关键字加粗着色，
   行首时间戳弱化。---- */
.lv-pre :deep(.lv-ts) {
  color: var(--text-dim);
  opacity: 0.7;
}

.lv-pre :deep(.lv-kw) {
  font-weight: 700;
}

.lv-pre :deep(.lv-kw-error),
.lv-pre :deep(.lv-kw-fatal),
.lv-pre :deep(.lv-kw-critical) {
  color: var(--err);
}

.lv-pre :deep(.lv-kw-warn),
.lv-pre :deep(.lv-kw-warning) {
  color: #d97706;
}

.lv-pre :deep(.lv-kw-info) {
  color: var(--accent);
}

.lv-pre :deep(.lv-kw-debug),
.lv-pre :deep(.lv-kw-trace) {
  color: var(--text-dim);
}

.lv-ask {
  display: none;
  margin-left: 6px;
  padding: 0 6px;
  font: inherit;
  font-size: 10.5px;
  color: var(--text-dim);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}

.lv-line:hover .lv-ask {
  display: inline-block;
}
</style>
