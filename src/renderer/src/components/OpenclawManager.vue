<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Position, Refresh, View, Hide, CopyDocument } from '@element-plus/icons-vue'
import { usePagesStore } from '../stores/pages'

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
    if (!s.ok) throw new Error(s.error || '状态获取失败')
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
  const t = token.value?.token
  if (!t) return
  try {
    await navigator.clipboard.writeText(t)
    ElMessage.success('令牌已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动选中')
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
      <p>{{ status.error || '未找到 openclaw CLI' }}</p>
      <code>npm run setup:openclaw</code>
      <el-button size="small" text @click="load">
        <el-icon><Refresh /></el-icon> 重新检测
      </el-button>
    </div>

    <template v-else-if="status">
      <div class="head">
        <div class="ver">
          <span class="status-dot running" /> openclaw <b>v{{ status.version || '?' }}</b>
          <el-tag size="small" effect="plain" round>自带最新版</el-tag>
        </div>
        <div class="head-actions">
          <el-button size="small" text :loading="loading" @click="load">
            <el-icon><Refresh /></el-icon> 刷新
          </el-button>
        </div>
      </div>
      <div class="sub">
        CLI：<code>{{ status.binPath }}</code>
      </div>
      <div class="sub">
        配置目录（OpenClaw Home）：<code>{{ status.home }}</code>
      </div>

      <div v-if="token" class="sub token-row">
        Gateway 令牌
        <el-tag size="small" effect="plain" round>{{ token.source === 'env' ? '环境变量' : '配置文件' }}</el-tag>
        <code class="token-val">{{ tokenRevealed ? token.token : maskedToken }}</code>
        <el-button size="small" text :title="tokenRevealed ? '隐藏' : '显示'" @click="tokenRevealed = !tokenRevealed">
          <el-icon><component :is="tokenRevealed ? Hide : View" /></el-icon>
        </el-button>
        <el-button size="small" text title="复制到剪贴板" @click="copyToken">
          <el-icon><CopyDocument /></el-icon>
        </el-button>
        <el-button size="small" text :loading="tokenLoading" title="重新读取" @click="loadToken">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
      <div v-else class="sub token-hint">
        Gateway 令牌：<span class="muted">尚未生成</span>
        <el-button size="small" text :loading="tokenLoading" @click="loadToken">
          <el-icon><Refresh /></el-icon> 重试
        </el-button>
      </div>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="tip-alert"
        title="首次启动会自动就绪，无需手动配置鉴权"
      >
        容器会在 <code>~/.openclaw/openclaw.json</code> 缺失时写入最小
        <code>{gateway:{mode:"local"}}</code>；网关无 token 时自动生成运行时 token
        并配对本地设备，Control UI 根路径即可打开。频道 / 模型仍需在「终端」里跑
        <code>openclaw onboard</code> 自行配置。容器只负责启停 gateway 与内嵌打开页面。
      </el-alert>

      <div class="term-row">
        <el-button size="small" @click="openHomeTerminal">
          <el-icon><Position /></el-icon> 在 OpenClaw Home 打开终端
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
