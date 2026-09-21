<script setup lang="ts">
import { onBeforeUnmount, onMounted, nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { LogFileInfo, LogReadResult, LogLineEvent } from '@shared/types'
import { t } from '../i18n'

/**
 * In-app log tail for field debugging — a packaged app has no console and most users
 * won't navigate to userData/logs. Reads through container.readLogs (main-process
 * tails ≤512KB, so a 5MB rotated log costs nothing). Also hosts the one-click
 * diagnostics export, since "send me your logs + versions" is the same audience.
 */
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
const preEl = ref<HTMLElement | null>(null)
let offLog: (() => void) | undefined

function scrollBottom(): void {
  void nextTick(() => {
    const el = preEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function matchesFilter(line: string): boolean {
  const f = filter.value.trim()
  return !f || line.toLowerCase().includes(f.toLowerCase())
}

function onLogEvent(ev: LogLineEvent): void {
  if (!live.value || ev.key !== key.value) return
  const fresh = (ev.lines || []).filter(matchesFilter)
  if (!fresh.length) return
  const merged = content.value ? `${content.value}\n${fresh.join('\n')}` : fresh.join('\n')
  // Keep the buffer bounded to the selected tail length so long sessions don't grow forever.
  const all = merged.split('\n')
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
}

function onKeyChange(): void {
  void loadContent()
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
      <el-button size="small" :loading="busy" @click="loadContent">{{
        t('panel.logRefresh')
      }}</el-button>
      <span class="lv-spacer" />
      <el-button size="small" :loading="diagBusy" @click="doExport">{{
        t('panel.exportDiagBtn')
      }}</el-button>
    </div>
    <pre ref="preEl" class="lv-pre">{{ content || t('panel.logEmpty') }}</pre>
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
</style>
