<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, Hide, Refresh, View } from '@element-plus/icons-vue'
import { usePagesStore } from '../stores/pages'
import { useDshStore } from '../stores/dsh'
import EmptyState from './EmptyState.vue'
import type { DshPluginInfo, DshTokenResult } from '@shared/types'
import { t } from '../i18n'

const pagesStore = usePagesStore()
const dsh = useDshStore()

interface DshStatusInfo {
  installed: boolean
  version?: string
  binPath?: string
  profile: string
  profileDir: string
  pnpmFound: boolean
  error?: string
}

const status = ref<DshStatusInfo | null>(null)
const plugins = ref<DshPluginInfo[]>([])
const loading = ref(false)

/** the dsh web UI's auth token, read from the running page's launch URL (null while unavailable) */
const tokenState = ref<DshTokenResult | null>(null)
const tokenLoading = ref(false)
const tokenRevealed = ref(false)

const token = computed(() => (tokenState.value?.kind === 'ok' ? tokenState.value : null))

/** Why there is no token — a precise hint beats a generic "not generated yet". */
const tokenHint = computed(() => {
  const s = tokenState.value
  if (!s || s.kind === 'ok') return ''
  return s.kind === 'no-page'
    ? t('dshMgr.tokenNoPage', { profile: s.profile })
    : t('dshMgr.tokenStopped', { id: s.pageId })
})

/** Mask all but the first/last 4 chars — this token is a bearer credential. */
const maskedToken = computed(() => {
  const s = token.value?.token || ''
  if (s.length <= 8) return '•'.repeat(s.length) || '—'
  return `${s.slice(0, 4)}${'•'.repeat(Math.min(s.length - 8, 24))}${s.slice(-4)}`
})

/** profile being managed; dsh ships web/acp/headless/sdk templates */
const profile = ref('web')
const installForm = reactive({ spec: '' })

/* ---- operation progress: elapsed timer + label for install/update/uninstall ----
   `busy` / `startedAt` live in the dsh store so the strip survives a panel close/reopen; here
   we only tick a 1s clock and derive the elapsed seconds from the stored start time. */
const nowTick = ref(Date.now())
let opTimer: ReturnType<typeof setInterval> | null = null
function stopTicker(): void {
  if (opTimer) {
    clearInterval(opTimer)
    opTimer = null
  }
}
watch(
  () => dsh.busy,
  (val) => {
    stopTicker()
    if (!val) return
    nowTick.value = Date.now()
    opTimer = setInterval(() => (nowTick.value = Date.now()), 1000)
  },
  { immediate: true }
)
onBeforeUnmount(stopTicker)

/** Human-readable label for the current long-running operation, or empty. */
const opLabel = computed(() => {
  const b = dsh.busy
  if (!b) return ''
  if (b.startsWith('install:')) return t('dshMgr.opInstalling', { spec: b.slice(8) })
  if (b.startsWith('uninstall:')) return t('dshMgr.opUninstalling', { name: b.slice(10) })
  return ''
})
const opElapsed = computed(() =>
  dsh.busy && dsh.startedAt ? Math.max(0, Math.floor((nowTick.value - dsh.startedAt) / 1000)) : 0
)
const opElapsedText = computed(() =>
  opElapsed.value > 0 ? t('dshMgr.opElapsed', { n: opElapsed.value }) : ''
)

async function load(): Promise<void> {
  loading.value = true
  try {
    const s = await window.container.dshStatus(profile.value)
    if (!s.ok) throw new Error(s.error || t('common.statusFail'))
    status.value = s.data as DshStatusInfo
    if (status.value?.installed) {
      const p = await window.container.dshListPlugins(profile.value)
      if (p.ok) plugins.value = (p.data as DshPluginInfo[]) || []
      else ElMessage.warning(p.error || t('dshMgr.msgPluginListFail'))
    }
    // Independent of the CLI install state: the token lives on the running page, not in the package.
    void loadToken()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

/**
 * Re-read the dsh token. dsh mints it per launch, so a "not available" verdict is normal
 * while the page is stopped — the row then explains which case it is and offers a retry.
 */
async function loadToken(): Promise<void> {
  tokenLoading.value = true
  try {
    const r = await window.container.dshToken(profile.value)
    if (r.ok) tokenState.value = (r.data as DshTokenResult | null) ?? null
  } catch {
    /* best-effort; leave whatever we had so a transient failure does not blank the row */
  } finally {
    tokenLoading.value = false
  }
}

async function copyToken(): Promise<void> {
  const value = token.value?.token
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success(t('dshMgr.msgTokenCopied'))
  } catch {
    ElMessage.error(t('dshMgr.msgCopyFail'))
  }
}

onMounted(load)

async function install(): Promise<void> {
  const spec = installForm.spec.trim()
  if (!spec) {
    ElMessage.warning(t('dshMgr.msgEnterPackage'))
    return
  }
  const res = await dsh.installPlugin(spec, profile.value)
  if (!res.ok) {
    ElMessage.error(res.error || t('dshMgr.msgInstallFail'))
    return
  }
  ElMessage.success(t('dshMgr.msgInstalled', { spec }))
  installForm.spec = ''
  await load()
}

async function uninstall(p: DshPluginInfo): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('dshMgr.msgUninstallConfirm', { profile: status.value?.profile ?? '', name: p.name }),
      t('dshMgr.msgUninstallTitle'),
      {
        type: 'warning',
        confirmButtonText: t('dshMgr.msgUninstallConfirmBtn'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    return
  }
  const res = await dsh.uninstallPlugin(p.name, profile.value)
  if (!res.ok) {
    ElMessage.error(res.error || t('dshMgr.msgUninstallFail'))
    return
  }
  ElMessage.success(t('dshMgr.msgUninstalled', { name: p.name }))
  await load()
}

async function openTerminal(): Promise<void> {
  if (!status.value?.installed) return
  try {
    await pagesStore.openTerminal('dsh-root', `DSH（${profile.value}）`)
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

const sourceTag = (s: DshPluginInfo['source']): 'primary' | 'info' =>
  s === 'bundle' ? 'info' : 'primary'
</script>

<template>
  <div class="dsh-manager" v-loading="loading && !status">
    <EmptyState
      v-if="status && !status.installed"
      :description="status.error || t('dshMgr.emptyError')"
      hint="npm install @deepseek-ai/dsh@0.1.6-alpha.2"
      :tone="status.error ? 'error' : 'muted'"
    >
      <el-button size="small" text @click="load">{{ t('dshMgr.recheck') }}</el-button>
    </EmptyState>

    <template v-else-if="status">
      <el-alert
        v-if="!status.pnpmFound"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
        :title="t('dshMgr.alertNoPnpm')"
        :description="t('dshMgr.alertNoPnpmDesc')"
      />

      <div class="profile-row">
        <span class="foot-label">{{ t('dshMgr.profileLabel') }}</span>
        <el-input
          v-model="profile"
          size="small"
          style="width: 180px"
          :placeholder="t('dshMgr.profilePlaceholder')"
          @keyup.enter="load"
        />
        <el-button size="small" :loading="loading" @click="load">
          {{ t('dshMgr.switchRefresh') }}
        </el-button>
        <span class="foot-hint">{{ t('dshMgr.profileTemplatesHint') }}</span>
      </div>

      <div class="head">
        <div class="ver">
          <span class="status-dot running" /> @deepseek-ai/dsh <b>v{{ status.version }}</b>
          <el-tag size="small" effect="plain" round>{{
            t('dshMgr.verTag', { profile: status.profile })
          }}</el-tag>
        </div>
        <div class="head-actions">
          <el-button size="small" text @click="load">{{ t('common.refresh') }}</el-button>
        </div>
      </div>
      <div class="sub">{{ t('dshMgr.profileDir', { dir: status.profileDir }) }}</div>

      <div v-if="token" class="sub token-row">
        {{ t('dshMgr.launchToken') }}
        <el-tag size="small" effect="plain" round>{{
          t('dshMgr.tokenSourcePage', { id: token.pageId })
        }}</el-tag>
        <code class="token-val">{{ tokenRevealed ? token.token : maskedToken }}</code>
        <el-button
          size="small"
          text
          :title="tokenRevealed ? t('dshMgr.tokenHide') : t('dshMgr.tokenShow')"
          @click="tokenRevealed = !tokenRevealed"
        >
          <el-icon><component :is="tokenRevealed ? Hide : View" /></el-icon>
        </el-button>
        <el-button size="small" text :title="t('dshMgr.tokenCopy')" @click="copyToken">
          <el-icon><CopyDocument /></el-icon>
        </el-button>
        <el-button
          size="small"
          text
          :loading="tokenLoading"
          :title="t('dshMgr.tokenReread')"
          @click="loadToken"
        >
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
      <div v-else class="sub token-hint">
        {{ tokenHint }}
        <el-button size="small" text :loading="tokenLoading" @click="loadToken">
          {{ t('dshMgr.tokenRetry') }}
        </el-button>
      </div>

      <el-form class="install-row" @submit.prevent="install">
        <el-form-item style="margin-bottom: 8px">
          <el-input
            v-model="installForm.spec"
            :placeholder="t('dshMgr.installPlaceholder')"
            clearable
            @keyup.enter="install"
          >
            <template #append>
              <el-button :loading="dsh.busy === `install:${installForm.spec.trim()}`" @click="install">
                {{ t('dshMgr.install') }}
              </el-button>
            </template>
          </el-input>
        </el-form-item>
      </el-form>

      <!-- Operation progress strip: visible while any long-running CLI op is active -->
      <div v-if="opLabel" class="op-progress">
        <span class="op-spinner" />
        <span class="op-text">{{ opLabel }}</span>
        <span v-if="opElapsedText" class="op-elapsed">{{ opElapsedText }}</span>
      </div>

      <el-table :data="plugins" size="small" :empty-text="t('dshMgr.pluginsEmpty')">
        <el-table-column :label="t('dshMgr.colPlugin')" min-width="220">
          <template #default="{ row }">
            <div class="cell-name">{{ row.name }}</div>
            <div class="cell-sub">
              <span>{{ row.version }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('dshMgr.colSource')" width="90">
          <template #default="{ row }">
            <el-tag size="small" round :type="sourceTag(row.source)">{{
              row.source === 'bundle' ? t('dshMgr.sourceBundle') : t('dshMgr.sourceInstalled')
            }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('dshMgr.colActions')" width="120" align="right">
          <template #default="{ row }">
            <template v-if="row.source === 'profile'">
              <el-button
                size="small"
                text
                type="danger"
                :loading="dsh.busy === `uninstall:${row.name}`"
                @click="uninstall(row)"
              >
                {{ t('dshMgr.uninstall') }}
              </el-button>
            </template>
            <span v-else class="cell-sub">{{ t('dshMgr.bundleOnly') }}</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="dsh-footer">
        <el-button size="small" text :disabled="!status?.installed" @click="openTerminal">
          {{ t('dshMgr.dshTerminal') }}
        </el-button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.ver {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.sub {
  font-size: 12px;
  color: var(--text-dim);
  margin: 6px 0 14px;
}
.sub code,
.empty code {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 1px 6px;
}
/* Token row — deliberately mirrors OpenclawManager's so the two panels read the same way. */
.token-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin: 0 0 10px;
}
.token-val {
  user-select: all;
  max-width: 340px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.token-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin: 0 0 10px;
}
.install-row {
  margin-bottom: 10px;
}
.cell-name {
  font-weight: 550;
}
.cell-sub {
  font-size: 12px;
  color: var(--text-dim);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.foot-label {
  font-size: 12px;
  color: var(--text-dim);
}
.profile-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.foot-hint {
  font-size: 12px;
  color: var(--text-dim);
}
.upd-name {
  font-weight: 600;
}

/* Operation progress strip */
.op-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--text-dim);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.op-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  animation: op-spin 0.7s linear infinite;
  flex-shrink: 0;
}
.op-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.op-elapsed {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
@keyframes op-spin {
  to {
    transform: rotate(360deg);
  }
}
.dsh-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  margin-top: 6px;
}
</style>
