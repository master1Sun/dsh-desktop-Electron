<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, View, Hide, CopyDocument } from '@element-plus/icons-vue'
import { usePagesStore } from '../stores/pages'
import { t } from '../i18n'

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
    <div v-if="status && !status.installed" class="empty">
      <p>{{ status.error || t('openclawMgr.emptyError') }}</p>
      <code>npm run setup:openclaw</code>
      <el-button size="small" text @click="load">
        {{ t('openclawMgr.recheck') }}
      </el-button>
    </div>

    <template v-else-if="status">
      <div class="head">
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
      <div class="sub">{{ t('openclawMgr.cliPath', { path: status.binPath ?? '' }) }}</div>
      <div class="sub">{{ t('openclawMgr.homeDir', { dir: status.home }) }}</div>

      <div v-if="token" class="sub token-row">
        {{ t('openclawMgr.gatewayToken') }}
        <el-tag size="small" effect="plain" round>{{
          token.source === 'env' ? t('openclawMgr.tokenEnv') : t('openclawMgr.tokenConfig')
        }}</el-tag>
        <code class="token-val">{{ tokenRevealed ? token.token : maskedToken }}</code>
        <el-button
          size="small"
          text
          :title="tokenRevealed ? t('openclawMgr.hide') : t('openclawMgr.show')"
          @click="tokenRevealed = !tokenRevealed"
        >
          <el-icon><component :is="tokenRevealed ? Hide : View" /></el-icon>
        </el-button>
        <el-button size="small" text :title="t('openclawMgr.copy')" @click="copyToken">
          <el-icon><CopyDocument /></el-icon>
        </el-button>
        <el-button
          size="small"
          text
          :loading="tokenLoading"
          :title="t('openclawMgr.reread')"
          @click="loadToken"
        >
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
      <div v-else class="sub token-hint">
        {{ t('openclawMgr.tokenNotGenerated') }}
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

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 26px 10px;
  color: var(--text-dim);
  font-size: 13px;
  text-align: center;
}
.empty code {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 8px;
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
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 5px;
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
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 4px;
}

.term-row {
  margin-top: 10px;
}
</style>
