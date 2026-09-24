<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { t } from '@renderer/i18n'

/**
 * Shared log timeline: renders raw log lines (given in the file's native oldest→newest order)
 * as nodes on a vertical rail — a level-coloured dot, an optional time/level column, then the
 * message body with level-keyword highlighting. Used by the Help-panel LogViewer (main.log /
 * page files) and the per-page log dialog in PageManager, so every log surface reads the same way.
 *
 * `newestFirst` reverses the render order (default on — when triaging you look at the top for
 * what just happened). The meta column collapses when no line carries a stamp/level, because raw
 * child output (a page's stdout) has neither, and an empty 92px gutter would just waste space.
 *
 * Error rows expose a "复制并问 AI" affordance and emit `ask` on right-click; the parent decides
 * what to do (LogViewer asks the AI; a host that ignores it simply gets no action).
 */
const props = withDefaults(
  defineProps<{
    /** raw log lines in the file's native order (oldest → newest) */
    lines: string[]
    /** render the newest line first (at the top); default on */
    newestFirst?: boolean
    /** max scroll height (any CSS length); falls back to the built-in 300px when empty */
    maxHeight?: string
  }>(),
  { newestFirst: true, maxHeight: '' }
)
const emit = defineEmits<{ ask: [line: string] }>()

const el = ref<HTMLElement | null>(null)

/* ---- per-line timeline parsing ----
   Every line the container writes carries a leading `[<isoStamp>]` (main.log adds a second
   `[LEVEL]`, a page child line does not). We peel those off into a time + severity column and
   lay the message out as one node on a vertical rail, so the log reads as a chronological
   timeline rather than a flat block of text. Only lines that fail to parse fall back to being
   shown whole. */
const ERROR_LINE_RE =
  /\b(error|err|exception|fail(ed|ure)?|warn|fatal|timeout|refused)\b|[错误异常失败超时]/i
const LEVEL_RE = /\b(ERROR|FATAL|CRITICAL|WARN(?:ING)?|DEBUG|TRACE|INFO)\b/i
// `[2026-09-22T10:30:00.123+08:00] [ERROR] rest` → stamp, level, body; the stamp never holds `]`.
const LINE_HEAD_RE =
  /^\[([^\]]+)\]\s*(?:\[(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL|CRITICAL)\]\s*)?(.*)$/

const escapeHtml = (s: string): string =>
  s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))

/** 日志内容永远只是被展示：全部先 escape 再注入固定的高亮 span（级别关键字着色）。 */
function highlight(line: string): string {
  let html = escapeHtml(line)
  html = html.replace(LEVEL_RE, (kw) => `<b class="lv-kw lv-kw-${kw.toLowerCase()}">${kw}</b>`)
  return html
}

/** `HH:MM:SS` from an ISO stamp; a stamp we can't parse is simply dropped from the column. */
function clockOf(stamp: string): string {
  const m = stamp.match(/\d{2}:\d{2}:\d{2}/)
  return m ? m[0] : ''
}

interface LogRow {
  raw: string
  time: string
  /** lowercase severity token for the rail dot, '' when the line carries none */
  level: string
  html: string
  err: boolean
}

/** Render order follows `newestFirst`; reversing a copy keeps `lines` (and the right-click
 *  fallback) in the file's native order. Precompute once per render — the regexes are per-line. */
const rows = computed<LogRow[]>(() => {
  const src = props.newestFirst ? [...props.lines].reverse() : props.lines
  return src.map((l) => {
    const m = LINE_HEAD_RE.exec(l)
    if (!m) return { raw: l, time: '', level: '', html: highlight(l), err: ERROR_LINE_RE.test(l) }
    const [, stamp, level, body] = m
    return {
      raw: l,
      time: clockOf(stamp),
      level: (level || '').toLowerCase(),
      html: highlight(body || ''),
      err: ERROR_LINE_RE.test(l)
    }
  })
})

/** Collapse the time/level gutter entirely when nothing on screen parsed a stamp or level. */
const hasMeta = computed(() => rows.value.some((r) => r.time || r.level))

// Oldest-first puts the live edge at the bottom, so follow it as lines stream in; newest-first
// keeps the newest at the top where the scroll origin already is, so no follow-scroll is needed.
watch(
  () => [props.lines.length, props.newestFirst] as const,
  () => {
    if (props.newestFirst) return
    void nextTick(() => {
      const e = el.value
      if (e) e.scrollTop = e.scrollHeight
    })
  }
)
</script>

<template>
  <div
    ref="el"
    class="lv-timeline"
    :class="{ 'no-meta': !hasMeta }"
    :style="maxHeight ? { maxHeight } : undefined"
  >
    <div
      v-for="(r, i) in rows"
      :key="i"
      class="lv-node"
      :class="{ 'is-error': r.err, ['lv-lv-' + r.level]: !!r.level }"
      @contextmenu.prevent="emit('ask', r.raw)"
    >
      <span class="lv-dot" />
      <span v-if="hasMeta" class="lv-meta">
        <span class="lv-time">{{ r.time }}</span>
        <span v-if="r.level" class="lv-level">{{ r.level }}</span>
      </span>
      <span class="lv-body">
        <!-- eslint-disable-next-line vue/no-v-html -- html is escapeHtml()'d before markup is added -->
        <span class="lv-text" v-html="r.html" /><el-tooltip
          v-if="r.err"
          :content="t('app.askAiBtn')"
          placement="top"
          popper-class="dsh-tip-popper"
        >
          <button class="lv-ask" @click.stop="emit('ask', r.raw)">
            {{ t('app.askAiBtn') }}
          </button>
        </el-tooltip>
      </span>
    </div>
  </div>
</template>

<style scoped>
/* ---- 时间轴布局 ---- */
.lv-timeline {
  position: relative;
  max-height: 300px;
  overflow: auto;
  background: var(--glass-well);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-dim);
  user-select: text;
}
/* One node per line: a dot sitting on the rail, a time/level column, then the body. */
.lv-node {
  position: relative;
  display: grid;
  grid-template-columns: 14px 92px 1fr;
  align-items: start;
  gap: 8px;
  padding: 2px 4px;
}
/* Raw child output carries no stamp/level: drop the empty gutter so the body reclaims the width. */
.lv-timeline.no-meta .lv-node {
  grid-template-columns: 14px 1fr;
}
/* Vertical rail, drawn per node so consecutive rows join into one continuous spine; the dot
   column centre within a node sits at x≈11px (node pad 4 + half the 14px dot column). */
.lv-node::before {
  content: '';
  position: absolute;
  left: 10px;
  top: 0;
  bottom: 0;
  width: 2px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--accent) 30%, var(--border));
}
/* Endpoint cap: the spine starts at the first dot and ends at the last dot instead of overshooting
   the list edges (a dot centre sits ~11px into its node). */
.lv-node:first-child::before {
  top: 11px;
}
.lv-node:last-child::before {
  bottom: auto;
  height: 11px;
}
.lv-node:only-child::before {
  display: none;
}
/* Horizontal connector tick from the dot toward the message (classic timeline look); drawn under the
   dot's opaque ring so it reads as emanating from behind the node. */
.lv-node::after {
  content: '';
  position: absolute;
  left: 11px;
  top: 10px;
  width: 15px;
  height: 2px;
  background: color-mix(in srgb, var(--accent) 22%, var(--border));
}

.lv-dot {
  position: relative;
  z-index: 1;
  width: 9px;
  height: 9px;
  margin-top: 4px;
  justify-self: center;
  border-radius: 50%;
  background: var(--text-dim);
  /* opaque ring so the rail reads as passing *behind* the dot, not through it */
  box-shadow: 0 0 0 3px var(--surface-2);
}
.lv-lv-info .lv-dot {
  background: var(--accent);
}
.lv-lv-warn .lv-dot,
.lv-lv-warning .lv-dot {
  background: #d97706;
}
.lv-lv-error .lv-dot,
.lv-lv-fatal .lv-dot,
.lv-lv-critical .lv-dot {
  background: var(--err);
}

.lv-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
  opacity: 0.85;
}
.lv-time {
  white-space: nowrap;
}
.lv-level {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  opacity: 0.8;
}

.lv-body {
  min-width: 0;
}
.lv-text {
  white-space: pre-wrap;
  word-break: break-all;
}

.lv-node.is-error .lv-body {
  color: var(--err);
  /* 错误正文另给一条淡红底带，只罩住正文列，不遮挡时间轴竖线。 */
  background: color-mix(in srgb, var(--err) 10%, transparent);
  border-radius: 4px;
}

/* ---- 语法高亮（注入在 v-html 里，故用 :deep 穿透 scoped）: 级别关键字加粗着色。---- */
.lv-timeline :deep(.lv-kw) {
  font-weight: 700;
}

.lv-timeline :deep(.lv-kw-error),
.lv-timeline :deep(.lv-kw-fatal),
.lv-timeline :deep(.lv-kw-critical) {
  color: var(--err);
}

.lv-timeline :deep(.lv-kw-warn),
.lv-timeline :deep(.lv-kw-warning) {
  color: #d97706;
}

.lv-timeline :deep(.lv-kw-info) {
  color: var(--accent);
}

.lv-timeline :deep(.lv-kw-debug),
.lv-timeline :deep(.lv-kw-trace) {
  color: var(--text-dim);
}

.lv-ask {
  display: none;
  margin-left: 6px;
  padding: 0 6px;
  font: inherit;
  font-size: 10.5px;
  color: var(--text-dim);
  background: var(--glass-chip);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}

.lv-node:hover .lv-ask {
  display: inline-block;
}
</style>
