<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, Hide, Refresh, View } from '@element-plus/icons-vue'
import { usePagesStore } from '../stores/pages'
import type { DshPluginInfo, DshPluginUpdate, DshTokenResult } from '@shared/types'
import { t } from '../i18n'

const pagesStore = usePagesStore()

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
const busy = ref<string | null>(null)

/** per-plugin new-version hint (name → { available, latest, channel }); channel is which update path to take */
const updates = ref<
  Record<string, { available: boolean; latest?: string; channel?: 'npm' | 'git' }>
>({})
const checking = ref(false)

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
const installForm = reactive({ spec: '', gitUrl: '' })
const updateDialog = reactive({
  visible: false,
  name: '',
  channel: 'npm' as 'npm' | 'git',
  gitUrl: ''
})

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
      // non-blocking: fill in "new version" hints after the table is already visible
      void checkUpdates()
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

/** fetch per-plugin new-version hints (npm latest vs git HEAD) and index them by name */
async function checkUpdates(): Promise<void> {
  if (!status.value?.installed) return
  checking.value = true
  try {
    const res = await window.container.dshCheckUpdates(profile.value)
    if (res.ok) {
      const map: Record<string, { available: boolean; latest?: string; channel?: 'npm' | 'git' }> =
        {}
      for (const u of (res.data as DshPluginUpdate[]) || []) {
        map[u.name] = { available: u.updateAvailable, latest: u.latest, channel: u.channel }
      }
      updates.value = map
    }
  } catch {
    /* non-fatal: update hints simply stay empty */
  } finally {
    checking.value = false
  }
}

/** resolved update hint for a plugin row, or a safe "no update" default */
function updateInfo(name: string): {
  available: boolean
  latest?: string
  channel?: 'npm' | 'git'
} {
  return updates.value[name] || { available: false }
}

onMounted(load)

async function install(): Promise<void> {
  const spec = installForm.spec.trim()
  if (!spec) {
    ElMessage.warning(t('dshMgr.msgEnterPackage'))
    return
  }
  busy.value = `install:${spec}`
  try {
    const res = await window.container.dshInstallPlugin(spec, profile.value)
    if (!res.ok) throw new Error(res.error || t('dshMgr.msgInstallFail'))
    ElMessage.success(t('dshMgr.msgInstalled', { spec }))
    installForm.spec = ''
    await load()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    busy.value = null
  }
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
  busy.value = `uninstall:${p.name}`
  try {
    const res = await window.container.dshUninstallPlugin(p.name, profile.value)
    if (!res.ok) throw new Error(res.error || t('dshMgr.msgUninstallFail'))
    ElMessage.success(t('dshMgr.msgUninstalled', { name: p.name }))
    await load()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    busy.value = null
  }
}

/** Extract the repo portion of a git dependency spec (drops the #ref), so the update dialog can prefill it */
function gitRepoFromSpec(version: string): string {
  // the lookahead keeps the optional `.git` from letting the non-greedy repo name
  // stop early (`aegis` would otherwise match as `a` and yield a nonexistent repo)
  const gh = /^github:([\w.-]+\/[\w.-]+?)(?:\.git)?(?=$|#)/.exec(version)
  if (gh) return `github:${gh[1]}`
  const n = /^(?:git\+)?(https?:\/\/[^\s#]+\.git)/.exec(version)
  if (n) return n[1]
  return version
}

function openUpdate(p: DshPluginInfo): void {
  const info = updateInfo(p.name)
  updateDialog.visible = true
  updateDialog.name = p.name
  // route to the channel the new version was detected on
  updateDialog.channel = info.channel === 'git' ? 'git' : 'npm'
  // prefill the git URL (repo + latest tag) so a git update is one click
  updateDialog.gitUrl =
    info.channel === 'git'
      ? `${gitRepoFromSpec(p.version)}${info.latest ? '#' + info.latest : ''}`
      : ''
}

async function doUpdate(): Promise<void> {
  busy.value = `update:${updateDialog.name}`
  try {
    const res = await window.container.dshUpdatePlugin(
      updateDialog.name,
      updateDialog.channel,
      updateDialog.channel === 'git' ? updateDialog.gitUrl.trim() : undefined,
      profile.value
    )
    if (!res.ok) throw new Error(res.error || t('dshMgr.msgUpdateFail'))
    ElMessage.success(String(res.data || t('dshMgr.msgUpdated')))
    updateDialog.visible = false
    await load()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    busy.value = null
  }
}

async function updateAll(): Promise<void> {
  busy.value = 'update-all'
  try {
    const res = await window.container.dshUpdateAll(profile.value)
    if (!res.ok) throw new Error(res.error || t('dshMgr.msgUpdateAllFail'))
    ElMessage.success(t('dshMgr.msgUpdateAllDone'))
    await load()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    busy.value = null
  }
}

async function openTerminal(): Promise<void> {
  if (!status.value?.installed) return
  try {
    await pagesStore.openTerminal('dsh-root', t('dshMgr.dshRootName'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

const sourceTag = (s: DshPluginInfo['source']): 'primary' | 'info' =>
  s === 'bundle' ? 'info' : 'primary'
</script>

<template>
  <div class="dsh-manager" v-loading="loading && !status">
    <div v-if="status && !status.installed" class="empty">
      <p>{{ status.error || t('dshMgr.emptyError') }}</p>
      <code>npm install @deepseek-ai/dsh@0.1.6-alpha.2</code>
      <el-button size="small" text @click="load">{{ t('dshMgr.recheck') }}</el-button>
    </div>

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
          <el-button size="small" text :loading="busy === 'update-all'" @click="updateAll">
            {{ t('dshMgr.updateAll') }}
          </el-button>
          <el-button size="small" text @click="load">{{ t('common.refresh') }}</el-button>
          <span v-if="checking" class="foot-hint">{{ t('dshMgr.checking') }}</span>
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
              <el-button :loading="busy === `install:${installForm.spec.trim()}`" @click="install">
                {{ t('dshMgr.install') }}
              </el-button>
            </template>
          </el-input>
        </el-form-item>
      </el-form>

      <el-table :data="plugins" size="small" :empty-text="t('dshMgr.pluginsEmpty')">
        <el-table-column :label="t('dshMgr.colPlugin')" min-width="220">
          <template #default="{ row }">
            <div class="cell-name">{{ row.name }}</div>
            <div class="cell-sub">
              <span>{{ row.version }}</span>
              <el-tag
                v-if="updateInfo(row.name).available"
                class="upd-tag"
                size="small"
                type="warning"
                effect="dark"
                round
                :title="t('dshMgr.updatableTip')"
                @click="openUpdate(row)"
                >{{
                  t('dshMgr.updatableTag', { latest: updateInfo(row.name).latest ?? '' })
                }}</el-tag
              >
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
        <el-table-column :label="t('dshMgr.colActions')" width="240" align="right">
          <template #default="{ row }">
            <template v-if="row.source === 'profile'">
              <el-button
                size="small"
                text
                :type="updateInfo(row.name).available ? 'warning' : 'primary'"
                @click="openUpdate(row)"
              >
                {{ t('dshMgr.update') }}
              </el-button>
              <el-button
                size="small"
                text
                type="danger"
                :loading="busy === `uninstall:${row.name}`"
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

    <el-dialog v-model="updateDialog.visible" :title="t('dshMgr.updateDialogTitle')" width="460px">
      <div class="upd-name">{{ updateDialog.name }}</div>
      <el-radio-group v-model="updateDialog.channel" style="margin: 10px 0">
        <el-radio-button value="npm">{{ t('dshMgr.fromNpm') }}</el-radio-button>
        <el-radio-button value="git">{{ t('dshMgr.fromGit') }}</el-radio-button>
      </el-radio-group>
      <el-input
        v-if="updateDialog.channel === 'git'"
        v-model="updateDialog.gitUrl"
        :placeholder="t('dshMgr.gitUrlPlaceholder')"
      />
      <div v-else class="cell-sub">
        {{ t('dshMgr.npmUpdateDesc', { name: updateDialog.name }) }}
      </div>
      <template #footer>
        <el-button @click="updateDialog.visible = false">{{
          t('dshMgr.updateDialogCancel')
        }}</el-button>
        <el-button
          type="primary"
          :loading="busy === `update:${updateDialog.name}`"
          @click="doUpdate"
          >{{ t('dshMgr.updateDialogStart') }}</el-button
        >
      </template>
    </el-dialog>
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
.upd-tag {
  cursor: pointer;
  font-weight: 600;
  /* It is a button in all but name (it opens the update dialog), so it gets the same
     press response as one — the global .el-button rule cannot reach a tag. */
  transition:
    background-color 0.16s ease,
    transform 0.09s ease;
}
.upd-tag:active {
  transform: scale(0.94);
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
.empty {
  text-align: center;
  color: var(--text-dim);
  padding: 26px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}
.upd-name {
  font-weight: 600;
}
.dsh-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  margin-top: 6px;
}
</style>
