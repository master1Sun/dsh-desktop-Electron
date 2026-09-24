<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { t } from '@renderer/i18n'
import type { McpCallEvent, McpServerState } from '@shared/types'

/**
 * The MCP hub's recent tool-call feed (see runtime/mcp-bridge.ts ring buffer). Lifted out of
 * McpManager so it can live on the 看板 page alongside the task board. Self-contained:
 * it cold-reads the buffer + the server list (only for friendly names) on mount, then live-appends
 * over OnMcpCalls / OnMcpStateChanged. Only hub-forwarded calls appear here — an agent's own
 * third-party stdio server never routes through the container, so it can't show up.
 */

interface McpResult<T> {
  ok: boolean
  data?: T
  error?: string
}

const calls = ref<McpCallEvent[]>([])
// Newest-first for the feed display; the buffer arrives oldest→newest.
const recentCalls = computed(() => [...calls.value].reverse().slice(0, 30))
const callSummary = computed(() => {
  const n = calls.value.length
  const okCount = calls.value.filter((c) => c.ok).length
  return { n, okRate: n ? Math.round((okCount / n) * 100) : 100 }
})

// Server names come from the registry; fall back to the raw id when a call names an unknown server.
const servers = ref<McpServerState[]>([])
function callServerName(id: string): string {
  return servers.value.find((s) => s.spec.id === id)?.spec.name || id
}
function fmtCallTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString()
  } catch {
    return ''
  }
}

async function loadCalls(): Promise<void> {
  try {
    const r = (await window.container.getMcpCalls?.()) as McpResult<McpCallEvent[]>
    if (r?.ok) calls.value = r.data ?? []
  } catch {
    /* the feed is an affordance; a failed cold-read just starts it empty */
  }
}
async function loadServers(): Promise<void> {
  try {
    const r = (await window.container.mcpListServers()) as McpResult<McpServerState[]>
    if (r?.ok) servers.value = r.data ?? []
  } catch {
    /* names are cosmetic — an unreadable registry just shows raw server ids */
  }
}

let unsubscribeState: (() => void) | null = null
let unsubscribeCalls: (() => void) | null = null
onMounted(() => {
  void loadServers()
  void loadCalls()
  unsubscribeState = window.container.onMcpStateChanged((states) => {
    servers.value = states as McpServerState[]
  })
  unsubscribeCalls = window.container.onMcpCalls((next) => {
    calls.value = next as McpCallEvent[]
  })
})
onBeforeUnmount(() => {
  unsubscribeState?.()
  unsubscribeCalls?.()
})
</script>

<template>
  <div class="call-feed">
    <div class="call-feed-head">
      <span class="cf-title">{{ t('mcpMgr.callsTitle') }}</span>
      <span v-if="callSummary.n" class="cf-summary">
        {{ t('mcpMgr.callsSummary', { n: callSummary.n, rate: callSummary.okRate }) }}
      </span>
    </div>
    <div v-if="!recentCalls.length" class="cf-empty">{{ t('mcpMgr.callsEmpty') }}</div>
    <div v-else class="cf-list">
      <div v-for="(c, i) in recentCalls" :key="`${c.at}-${i}`" class="cf-row">
        <span class="cf-time">{{ fmtCallTime(c.at) }}</span>
        <span class="cf-server">{{ callServerName(c.serverId) }}</span>
        <code class="cf-tool">{{ c.tool }}</code>
        <span class="cf-ms">{{ c.ms }}ms</span>
        <el-tag size="small" :type="c.ok ? 'success' : 'danger'" effect="plain" round>
          {{ c.ok ? t('mcpMgr.callOkBadge') : t('mcpMgr.callFailBadge') }}
        </el-tag>
        <span v-if="c.err" class="cf-err" :title="c.err">{{ c.err }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.call-feed {
  margin-top: 14px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
.call-feed-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.cf-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
}
.cf-summary {
  font-size: 11px;
  color: var(--text-dim);
}
.cf-empty {
  font-size: 12px;
  opacity: 0.7;
}
.cf-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
}
.cf-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 3px 6px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--el-fill-color) 40%, transparent);
}
.cf-time {
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.cf-server {
  font-weight: 600;
  flex-shrink: 0;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cf-tool {
  font-size: 11px;
  opacity: 0.85;
}
.cf-ms {
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.cf-err {
  color: var(--el-color-danger);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
</style>
