<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, View, Hide, CopyDocument, MagicStick } from '@element-plus/icons-vue'
import { usePagesStore } from '@renderer/stores/pages'
import EmptyState from '@renderer/components/base/EmptyState.vue'
import { t } from '@renderer/i18n'
import type { OpenclawInitTokenResult } from '@shared/types'

interface OpenclawStatusInfo {
  installed: boolean
  version?: string
  binPath?: string
  home: string
  port: number
  error?: string
}

interface TokenInfo {
  token: string
  source: 'config' | 'env'
}

const pagesStore = usePagesStore()
const status = ref<OpenclawStatusInfo | null>(null)
const loading = ref(false)
const token = ref<TokenInfo | null>(null)
const tokenLoading = ref(false)
const tokenRevealed = ref(false)
const initBusy = ref(false)

/**
 * One-click gateway token bootstrap. The container mints (or with `rotate`, re-mints) a durable
 * token into openclaw.json and restarts a running gateway so the embedded Control UI can
 * authenticate. After it returns we re-read the token so the row populates immediately.
 */
async function initToken(rotate = false): Promise<void> {
  initBusy.value = true
  try {
    const r = await window.container.openclawInitToken(rotate)
    if (!r.ok) throw new Error(r.error || t('openclawMgr.msgInitFail'))
    const res = r.data as OpenclawInitTokenResult
    await loadToken()
    if (res.restarted) ElMessage.success(t('openclawMgr.msgInitedRestart'))
    else if (res.created) ElMessage.success(t('openclawMgr.msgInited'))
    else ElMessage.info(t('openclawMgr.msgExists'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    initBusy.value = false
  }
}

const maskedToken = computed(() => {
  const t = token.value?.token || ''
  if (t.length <= 8) return '•'.repeat(t.length) || '—'
  return `${t.slice(0, 4)}${'•'.repeat(Math.min(t.length - 8, 24))}${t.slice(-4)}`
})

async function load(): Promise<void> {
  loading.value = true
  try {
    const s = await window.container.openclawStatus()
    if (!s.ok) throw new Error(s.error || t('common.statusFail'))
    status.value = s.data as OpenclawStatusInfo
    if (status.value?.installed) loadToken()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

async function loadToken(): Promise<void> {
  tokenLoading.value = true
  try {
    const r = await window.container.openclawToken()
    if (r.ok) token.value = (r.data as TokenInfo | null) ?? null
  } catch {
    /* best-effort; leave token null so the row hides */
  } finally {
    tokenLoading.value = false
  }
}

onMounted(load)

async function copyToken(): Promise<void> {
  const tokenValue = token.value?.token
  if (!tokenValue) return
  try {
    await navigator.clipboard.writeText(tokenValue)
    ElMessage.success(t('openclawMgr.msgTokenCopied'))
  } catch {
    ElMessage.error(t('openclawMgr.msgCopyFail'))
  }
}

async function openHomeTerminal(): Promise<void> {
  try {
    await pagesStore.openTerminal('openclaw', 'openclaw')
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}
</script>

<template>
  <div v-loading="loading && !status" class="openclaw-manager">
    <EmptyState
      v-if="status && !status.installed"
      :description="status.error || t('openclawMgr.emptyError')"
      hint="npm run setup:openclaw"
      :tone="status.error ? 'error' : 'muted'"
    >
      <el-button size="small" text @click="load">
        {{ t('openclawMgr.recheck') }}
      </el-button>
    </EmptyState>

    <template v-else-if="status">
      <div class="head neon">
        <div class="ver">
          <span class="status-dot running" /> openclaw <b>v{{ status.version || '?' }}</b>
          <el-tag size="small" effect="plain" round>{{ t('openclawMgr.verTag') }}</el-tag>
        </div>
        <div class="head-actions">
          <el-button size="small" text :loading="loading" @click="load">
            {{ t('common.refresh') }}
          </el-button>
        </div>
      </div>
      <div class="info-grid">
        <div class="info-row">
          <span class="info-label">{{ t('openclawMgr.infoCli') }}</span>
          <code class="info-val">{{ status.binPath || '—' }}</code>
        </div>
        <div class="info-row">
          <span class="info-label">{{ t('openclawMgr.infoHome') }}</span>
          <code class="info-val">{{ status.home }}</code>
        </div>
        <div class="info-row">
          <span class="info-label">{{ t('openclawMgr.infoPort') }}</span>
          <code class="info-val">{{ status.port || '—' }}</code>
        </div>
      </div>

      <div v-if="token" class="sub token-row">
        {{ t('openclawMgr.gatewayToken') }}
        <el-tag size="small" effect="plain" round>{{
          token.source === 'env' ? t('openclawMgr.tokenEnv') : t('openclawMgr.tokenConfig')
        }}</el-tag>
        <code class="token-val">{{ tokenRevealed ? token.token : maskedToken }}</code>
        <el-tooltip
          :content="tokenRevealed ? t('openclawMgr.hide') : t('openclawMgr.show')"
          placement="top"
          popper-class="dsh-tip-popper"
        >
          <el-button size="small" text @click="tokenRevealed = !tokenRevealed">
            <el-icon><component :is="tokenRevealed ? Hide : View" /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip
          :content="t('openclawMgr.copy')"
          placement="top"
          popper-class="dsh-tip-popper"
        >
          <el-button size="small" text @click="copyToken">
            <el-icon><CopyDocument /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip
          :content="t('openclawMgr.reread')"
          placement="top"
          popper-class="dsh-tip-popper"
        >
          <el-button size="small" text :loading="tokenLoading" @click="loadToken">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip
          :content="t('openclawMgr.regenerate')"
          placement="top"
          popper-class="dsh-tip-popper"
        >
          <el-button size="small" text type="warning" :loading="initBusy" @click="initToken(true)">
            {{ t('openclawMgr.regenerate') }}
          </el-button>
        </el-tooltip>
      </div>
      <div v-else class="sub token-hint">
        {{ t('openclawMgr.tokenNotGenerated') }}
        <el-button
          size="small"
          type="primary"
          :loading="initBusy"
          @click="initToken(false)"
        >
          <el-icon><MagicStick /></el-icon>
          {{ t('openclawMgr.initBtn') }}
        </el-button>
        <el-button size="small" text :loading="tokenLoading" @click="loadToken">
          {{ t('openclawMgr.retry') }}
        </el-button>
      </div>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="tip-alert"
        :title="t('openclawMgr.alertTitle')"
        :description="t('openclawMgr.alertDesc')"
      />

      <div class="term-row">
        <el-button size="small" @click="openHomeTerminal">
          {{ t('openclawMgr.openclawTerminal') }}
        </el-button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.openclaw-manager {
  min-height: 120px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.ver {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.sub {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.7;
  margin-bottom: 6px;
  word-break: break-all;
}
.sub code {
  background: var(--glass-chip);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 5px;
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0 10px;
}
.info-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.info-label {
  flex-shrink: 0;
  min-width: 84px;
  font-size: 12px;
  color: var(--text-dim);
}
.info-val {
  font-size: 12px;
  background: var(--glass-well);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 1px 6px;
  word-break: break-all;
  user-select: all;
}

.token-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.token-val {
  user-select: all;
  max-width: 340px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.token-hint .muted {
  color: var(--text-dim);
}

.tip-alert {
  margin: 10px 0;
}
.tip-alert code {
  background: var(--glass-chip);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 4px;
}

.term-row {
  margin-top: 10px;
}
</style>
