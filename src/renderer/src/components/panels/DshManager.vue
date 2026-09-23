<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, Hide, Refresh, View, Monitor, Operation } from '@element-plus/icons-vue'
import { usePagesStore } from '@renderer/stores/pages'
import { useDshStore } from '@renderer/stores/dsh'
import EmptyState from '@renderer/components/base/EmptyState.vue'
import type { DshPluginInfo, DshPluginUpdate, DshTokenResult } from '@shared/types'
import { t } from '@renderer/i18n'

const pagesStore = usePagesStore()
const dsh = useDshStore()

/* Optional single-pane mode for the IM sidebar: `pane` = 'overview' | 'plugins' shows just that tab
 * with the rail hidden. Absent (classic) = full two-tab card, unchanged. */
const props = defineProps<{ pane?: string; tabPosition?: 'left' | 'top' }>()

/** DSH 管理面板竖排分类 tab：概览 / 插件管理。 */
const activeTab = ref(props.pane || 'overview')
watch(
  () => props.pane,
  (p) => {
    if (p) activeTab.value = p
  }
)

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

/* Plugin update detection: main checks every profile plugin in one pass (npm view /
   git ls-remote) and returns a DshPluginUpdate per plugin. We keep it separate from the
   plain plugin list so the table renders immediately while the (network-bound) lookup
   resolves in the background; the "全部更新" button appears only once we know N>0. */
const pluginUpdates = ref<DshPluginUpdate[]>([])
const updatesLoading = ref(false)
const updatable = computed(() => pluginUpdates.value.filter((u) => u.updateAvailable))
/** name -> the winning update hint (latest version + channel/gitUrl to update through) */
const updateByName = computed(() => {
  const m: Record<string, DshPluginUpdate> = {}
  for (const u of pluginUpdates.value) if (u.updateAvailable) m[u.name] = u
  return m
})
/** map name -> latest version, for the per-row "可更新" tag */
const latestByName = computed(() => {
  const m: Record<string, string> = {}
  for (const [name, u] of Object.entries(updateByName.value))
    if (u.latest) m[name] = u.latest
  return m
})

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
  if (b === 'update:all') return t('dshMgr.opUpdatingAll')
  // a bare-name busy key is a single-plugin update (see the store's updatePlugin)
  if (updateByName.value[b]) return t('dshMgr.opUpdating', { name: b })
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
      // Kick off the (slower) update lookup without blocking the list render.
      void loadUpdates()
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
  await load()
  if (!res.ok) {
    ElMessage.error(res.error || t('dshMgr.msgInstallFail'))
    return
  }
  ElMessage.success(t('dshMgr.msgInstalled', { spec }))
  installForm.spec = ''
}

/**
 * Ask main which profile plugins have a newer version. Best-effort: a failed lookup just
 * leaves the list empty so the 全部更新 button stays hidden rather than raising an alarm.
 */
async function loadUpdates(): Promise<void> {
  updatesLoading.value = true
  try {
    const r = await window.container.dshCheckUpdates(profile.value)
    if (r.ok) pluginUpdates.value = (r.data as DshPluginUpdate[]) || []
    else pluginUpdates.value = []
  } catch {
    pluginUpdates.value = []
  } finally {
    updatesLoading.value = false
  }
}

/** Update every plugin the check flagged as behind — main walks the queue per-channel (npm/git,
 * incl. source flips) and broadcasts each step to the top bar. Then re-sync. */
async function updateAll(): Promise<void> {
  if (dsh.busy || !updatable.value.length) return
  const n = updatable.value.length
  const res = await dsh.updateAllPlugins(profile.value)
  // Re-sync on failure too: a rejected op usually means the table was stale, and only a fresh
  // read can tell the user what is actually left.
  await load()
  if (!res.ok) {
    ElMessage.error(res.error || t('dshMgr.msgUpdateAllFail'))
    return
  }
  ElMessage.success(t('dshMgr.msgUpdatedAll', { n }))
}

/**
 * Update ONE plugin through the channel the check picked (npm/git — the dual-source winner).
 * The store serialises ops via `busy`, and main broadcasts the in-flight name to the top bar.
 */
async function updateOne(p: DshPluginInfo): Promise<void> {
  const u = updateByName.value[p.name]
  if (!u || dsh.busy) return
  const res = await dsh.updatePlugin(p.name, u.channel || 'npm', profile.value, u.gitUrl)
  await load()
  if (!res.ok) {
    ElMessage.error(res.error || t('dshMgr.msgUpdateFail'))
    return
  }
  ElMessage.success(t('dshMgr.msgUpdated'))
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
  // Reload before reporting the outcome. A failure here is typically a stale row — dsh keeps a
  // layer in its bundle stack after it stopped being a pnpm dependency, so `remove` can never
  // succeed and the retry would fail identically. Re-reading turns the row into the truth
  // (bundle-only, or gone) instead of inviting the same dead-end click again.
  await load()
  if (!res.ok) {
    ElMessage.error(res.error || t('dshMgr.msgUninstallFail'))
    return
  }
  ElMessage.success(t('dshMgr.msgUninstalled', { name: p.name }))
}

async function openTerminal(): Promise<void> {
  if (!status.value?.installed) return
  try {
    await pagesStore.openTerminal('dsh-root', `DSH（${profile.value}）`)
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

const sourceTag = (p: DshPluginInfo): 'primary' | 'info' | 'warning' =>
  p.source === 'profile' ? 'primary' : p.present === false ? 'warning' : 'info'
const sourceLabel = (p: DshPluginInfo): string =>
  p.source === 'profile'
    ? t('dshMgr.sourceInstalled')
    : p.present === false
      ? t('dshMgr.sourceGhost')
      : t('dshMgr.sourceBundle')
/** A ghost layer resolved to nothing on disk, so it has no version to print. */
const versionLabel = (p: DshPluginInfo): string =>
  p.present === false ? t('dshMgr.versionMissing') : p.version

/* Cap the plugin table so a long list scrolls inside the table body (fixed header + install/toolbar
   above) instead of pushing the whole pane. The IM bubble sizes to a shorter box, so cap it tighter
   there to keep the table (not the tab pane) as the single scroll host. */
const pluginsTableMax = computed(() => (props.tabPosition === 'top' ? '240px' : '360px'))
</script>

<template>
  <div class="dsh-manager" :class="{ 'single-pane': !!pane }" v-loading="loading && !status">
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

      <el-tabs v-model="activeTab" class="v-tabs" :tab-position="props.tabPosition || 'left'">
        <el-tab-pane name="overview">
          <template #label>
            <span class="tab-label"
              ><el-icon><Monitor /></el-icon>{{ t('dshMgr.tabOverview') }}</span
            >
          </template>
          <div class="head neon">
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
          <div class="info-grid">
            <div class="info-row">
              <span class="info-label">{{ t('dshMgr.infoRunPath') }}</span>
              <code class="info-val">{{ status.binPath || '—' }}</code>
            </div>
            <div class="info-row">
              <span class="info-label">{{ t('dshMgr.infoProfileDir') }}</span>
              <code class="info-val">{{ status.profileDir }}</code>
            </div>
          </div>
          <div class="info-note">{{ t('dshMgr.profileNote') }}</div>

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

          <div class="dsh-footer">
            <el-button size="small" text :disabled="!status?.installed" @click="openTerminal">
              {{ t('dshMgr.dshTerminal') }}
            </el-button>
          </div>
        </el-tab-pane>

        <el-tab-pane name="plugins">
          <template #label>
            <span class="tab-label"
              ><el-icon><Operation /></el-icon>{{ t('dshMgr.tabPlugins') }}</span
            >
          </template>
          <el-form class="install-row" @submit.prevent="install">
            <el-form-item style="margin-bottom: 8px">
              <el-input
                v-model="installForm.spec"
                :placeholder="t('dshMgr.installPlaceholder')"
                clearable
                @keyup.enter="install"
              >
                <template #append>
                  <el-button
                    :loading="dsh.busy === `install:${installForm.spec.trim()}`"
                    @click="install"
                  >
                    {{ t('dshMgr.install') }}
                  </el-button>
                </template>
              </el-input>
            </el-form-item>
          </el-form>

          <!-- Plugin update toolbar: re-check on demand; 全部更新 only when N>0 updates are known -->
          <div class="plugin-tools">
            <el-button
              size="small"
              text
              :loading="updatesLoading"
              :title="t('dshMgr.recheckUpdate')"
              @click="loadUpdates"
            >
              {{ t('dshMgr.recheckUpdate') }}
            </el-button>
            <span v-if="!updatesLoading && !updatable.length" class="uptodate">
              {{ t('dshMgr.allUpToDate') }}
            </span>
            <el-button
              v-if="updatable.length"
              size="small"
              type="primary"
              :loading="dsh.busy === 'update:all'"
              :disabled="!!dsh.busy && dsh.busy !== 'update:all'"
              @click="updateAll"
            >
              {{ t('dshMgr.updateAll') }}<span class="ua-count">（{{ updatable.length }}）</span>
            </el-button>
          </div>

          <!-- Operation progress strip: visible while any long-running CLI op is active.
               npm/pnpm report no byte progress, so this is the striped indeterminate bar (see
               main.css) rather than a fake percentage; the elapsed counter is the real signal. -->
          <div v-if="opLabel" class="op-progress">
            <div class="op-line">
              <span class="op-text">{{ opLabel }}</span>
              <span v-if="opElapsedText" class="op-elapsed">{{ opElapsedText }}</span>
            </div>
            <el-progress
              :percentage="0"
              :stroke-width="6"
              :show-text="false"
              indeterminate
              striped
              :striped-flow="true"
            />
          </div>

          <el-table :data="plugins" size="small" :max-height="pluginsTableMax" :empty-text="t('dshMgr.pluginsEmpty')">
            <el-table-column :label="t('dshMgr.colPlugin')" min-width="220">
              <template #default="{ row }">
                <div class="cell-name">{{ row.name }}</div>
                <div class="cell-sub">
                  <span>{{ versionLabel(row) }}</span>
                  <el-tag
                    v-if="latestByName[row.name]"
                    size="small"
                    type="warning"
                    effect="light"
                    round
                    class="upd-tag"
                  >
                    {{ t('dshMgr.updatableTag', { latest: latestByName[row.name] }) }}
                  </el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column :label="t('dshMgr.colSource')" width="90">
              <template #default="{ row }">
                <el-tag size="small" round :type="sourceTag(row)">{{ sourceLabel(row) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('dshMgr.colActions')" width="150" align="right">
              <template #default="{ row }">
                <template v-if="row.source === 'profile'">
                  <el-button
                    v-if="updateByName[row.name]"
                    size="small"
                    text
                    type="primary"
                    :loading="dsh.busy === row.name"
                    :disabled="!!dsh.busy && dsh.busy !== row.name"
                    :title="t('dshMgr.updatableTip')"
                    @click="updateOne(row)"
                  >
                    {{ t('dshMgr.update') }}
                  </el-button>
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
                <span v-else class="cell-sub">{{
                  row.present === false ? t('dshMgr.ghostOnly') : t('dshMgr.bundleOnly')
                }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </template>
  </div>
</template>

<style scoped>
/* Single-pane (IM sidebar): hide the tab rail so the shown pane fills the column. */
.dsh-manager.single-pane :deep(.v-tabs > .el-tabs__header) {
  display: none;
}
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
  background: var(--glass-chip);
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
.plugin-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.plugin-tools .uptodate {
  font-size: 12px;
  color: var(--text-dim);
}
.ua-count {
  margin-left: 2px;
  font-variant-numeric: tabular-nums;
}
.upd-tag {
  margin-left: 2px;
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
.info-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0 6px;
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
.info-note {
  font-size: 12px;
  color: var(--text-dim);
  margin: 0 0 14px;
  line-height: 1.6;
}
/* The install form rows and the plugin list read on hover with a
   glassy accent wash instead of an opaque block — mirrors the other panels. */
.dsh-manager :deep(.el-form-item):hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border-radius: 8px;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent) inset;
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease;
}
.dsh-manager :deep(.el-table__body tr:hover > td) {
  background: color-mix(in srgb, var(--accent) 14%, transparent) !important;
  -webkit-backdrop-filter: blur(4px) saturate(125%);
  backdrop-filter: blur(4px) saturate(125%);
}
.upd-name {
  font-weight: 600;
}

/* Operation progress strip: caption row on top, the indeterminate bar filling the width below */
.op-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 10px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--text-dim);
  background: var(--glass-well);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.op-line {
  display: flex;
  align-items: center;
  gap: 8px;
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
.dsh-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  margin-top: 6px;
}
</style>
