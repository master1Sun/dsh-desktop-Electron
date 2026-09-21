<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageManager from './PageManager.vue'
import DshManager from './DshManager.vue'
import OpenclawManager from './OpenclawManager.vue'
import ExternalSitesManager from './ExternalSitesManager.vue'
import SettingsPanel from './SettingsPanel.vue'
import AppManager from './AppManager.vue'
import { usePagesStore } from '../stores/pages'
import { useUpdatesStore } from '../stores/updates'
import { useTasksStore } from '../stores/tasks'
import type {
  BuiltinKind,
  IpcResult,
  NodeVersionInfo,
  UpdateCheckResult,
  UpdateProgress
} from '@shared/types'
import { parseAppPanel } from '@shared/types'
import { t } from '../i18n'

const props = defineProps<{
  /** PanelKind or an `app:<id>` key (generic agent-app manager). */
  panel: string
  runtime: { version: string | null; ok: boolean; path: string; override?: boolean }
  runningCount: number
  totalCount: number
}>()

const emit = defineEmits<{
  devtools: []
  'check-updates': []
  'preview-site': [url: string]
  'apply-theme': [mode: 'auto' | 'light' | 'dark']
  'open-page': [id: string]
  'open-terminal': [id: string]
  close: []
}>()

const updates = useUpdatesStore()
const pagesStore = usePagesStore()
const tasks = useTasksStore()

/* Built-in agent runtimes (DSH 本体 / OpenClaw) surface as reprovision rows. When one is
   *missing* the row reads "检测失败 / 未检测到已安装版本"; here we turn it into an install
   entry so the same 关于与更新 panel is the "随后安装" home the first-run gate points to. */
const DSH_PKG = '@deepseek-ai/dsh'
function builtinKind(row: UpdateCheckResult): BuiltinKind | null {
  if (row.source !== 'builtin' || !row.packageName) return null
  return row.packageName === DSH_PKG ? 'dsh' : 'openclaw'
}
function notInstalledBuiltin(row: UpdateCheckResult): boolean {
  return builtinKind(row) !== null && !row.currentVersion
}
async function installBuiltinRow(row: UpdateCheckResult): Promise<void> {
  const kind = builtinKind(row)
  if (!kind) return
  const out = await tasks.installBuiltin(kind)
  if (out) emit('check-updates')
}

/**
 * The container asar is already staged (updates/<commit>/app.asar + update-meta.json). Relaunching
 * hands the swap to a detached helper that replaces resources/app.asar the moment this process
 * exits and then brings the app back — so the only action left here is the restart.
 */
async function relaunchNow(): Promise<void> {
  try {
    await ElMessageBox.confirm(t('updates.relaunchConfirm'), t('updates.relaunchTitle'), {
      type: 'warning',
      confirmButtonText: t('updates.relaunchNow'),
      cancelButtonText: t('common.cancel')
    })
  } catch {
    return // user deferred — the row keeps offering 立即重启 until they restart
  }
  await window.container.relaunchApp()
}

/* ---- builtin page reset (dsh-web / openclaw) ----
   Users can break the writable copy under pages/<id> (bad container.json, deleted files).
   Resetting re-seeds it from the bundled originals; destructive, so a warning confirm gates it. */
const resetting = ref<string | null>(null)
async function resetBuiltinRow(row: UpdateCheckResult): Promise<void> {
  if (!row.pageId || resetting.value) return
  try {
    await ElMessageBox.confirm(t('panel.resetConfirm', { name: row.name }), t('panel.resetTitle'), {
      type: 'warning',
      confirmButtonText: t('panel.resetBtn'),
      cancelButtonText: t('common.cancel')
    })
  } catch {
    return // user backed out
  }
  resetting.value = row.name
  try {
    const res = await window.container.resetBuiltinPage(row.pageId)
    if (!res.ok) throw new Error(res.error || t('common.unknownError'))
    ElMessage.success(t('panel.resetDone', { name: row.name }))
    // The page list (status/port/env declarations) and the table both describe the re-seeded
    // folder now — refresh both so no surface keeps showing the broken state.
    await pagesStore.refresh().catch(() => undefined)
    await updates.check(true).catch(() => undefined)
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    resetting.value = null
  }
}

/* ---- bundled-Node runtime upgrade (关于与更新) ----
   Dropdown over the official dist index (main-process fetched); installing swaps
   in a userData override, so running pages keep the old exe until they restart. */
const nodeVersions = ref<NodeVersionInfo[]>([])
const nodeSel = ref('')
/** Distinct from `!nodeVersions.length`: the select's spinner + an explicit error caption,
    so a failed/empty fetch never masquerades as an endless loading state. */
const nodeLoading = ref(false)
const nodeError = ref('')

async function loadNodeVersions(): Promise<void> {
  if (nodeLoading.value) return
  nodeLoading.value = true
  nodeError.value = ''
  try {
    // Optional-call: older test mocks / non-Windows builds may not expose this at all.
    const res = (await window.container.nodeListVersions?.()) as IpcResult | null
    if (res?.ok) {
      nodeVersions.value = (res.data as NodeVersionInfo[]) || []
      if (!nodeVersions.value.length) nodeError.value = t('panel.nodeVerEmpty')
    } else {
      // The main process fetches the index over raw node https (bypassing the system proxy),
      // so a proxy/offline/cert issue surfaces here — show it instead of an empty spinner.
      nodeError.value = res?.error || t('panel.nodeVerEmpty')
    }
  } catch (err) {
    nodeError.value = (err as Error).message
  } finally {
    nodeLoading.value = false
  }
}

const nodeVersionLabel = (v: NodeVersionInfo): string =>
  v.lts ? `${v.version} · LTS ${typeof v.lts === 'string' ? v.lts : ''}`.trim() : v.version

async function doNodeUpdate(): Promise<void> {
  if (!nodeSel.value || updates.nodeBusy) return
  try {
    await updates.updateNode(nodeSel.value)
    await pagesStore.refresh().catch(() => undefined)
    ElMessage.success(t('panel.nodeUpdated', { v: nodeSel.value }))
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

async function doNodeRestore(): Promise<void> {
  try {
    await updates.restoreNode()
    await pagesStore.refresh().catch(() => undefined)
    ElMessage.success(t('panel.nodeRestored'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

onMounted(() => {
  if (props.panel !== 'help') return
  void loadNodeVersions()
})

/** `app:<id>` → the page id for the generic AppManager, else null. */
const appId = computed(() => parseAppPanel(props.panel))

const statusLabel = (r: UpdateCheckResult): string =>
  notInstalledBuiltin(r)
    ? t('setup.missingTag')
    : r.pendingRestart
      ? t('panel.statusPendingRestart')
      : r.ok
        ? r.hasUpdate
          ? t('panel.statusHasUpdate')
          : t('panel.statusUpToDate')
        : r.error || t('panel.statusFailed')

const statusType = (r: { ok: boolean; hasUpdate?: boolean }): string =>
  !r.ok ? 'info' : r.hasUpdate ? 'warning' : 'success'

/** Short provenance tag for built-in rows so they read apart from git repos. */
const sourceTag = (r: { name: string; source?: string; action?: string }): string | null =>
  r.source === 'builtin'
    ? r.action === 'none'
      ? t('panel.tagBuiltin')
      : r.name.includes('DSH')
        ? 'DSH'
        : 'OpenClaw'
    : null

/** The middle column shows a branch for git rows, the registry latest for version rows. */
const refLabel = (r: { source?: string; branch?: string; latestVersion?: string }): string =>
  r.source && r.source !== 'git' ? r.latestVersion || '' : r.branch || ''

/**
 * Subtitle under the name: a labelled version pair as soon as a row carries any version —
 * npm/built-in rows always do, and so does the container's own OTA row, which downloads
 * the new app.asar from a git *release branch* and so used to fall through to its install
 * dir under the old git-vs-npm test. A plain local git checkout has no versions at all and
 * still reads as its folder.
 */
const subLabel = (r: {
  dir: string
  source?: string
  action?: string
  currentVersion?: string
  latestVersion?: string
}): string =>
  r.currentVersion || r.latestVersion || (r.source && r.source !== 'git' && r.action !== 'none')
    ? t('panel.verLocalLatest', {
        current: r.currentVersion || '?',
        latest: r.latestVersion || '?'
      })
    : r.dir

/** The container self-update streams a large app.asar: surface live download progress. */
const progressOf = (row: { name: string }): UpdateProgress | undefined =>
  updates.updating === row.name ? updates.progress[row.name] : undefined
const progressPercent = (p: UpdateProgress): number =>
  p.percent ?? (p.total && p.received ? Math.floor((p.received / p.total) * 100) : 0)
/** Indeterminate only while fetching release objects before the artifact size is known. */
const progressIndeterminate = (p: UpdateProgress): boolean =>
  p.phase === 'fetch' && p.percent === undefined
</script>

<template>
  <div class="panel-content">
    <SettingsPanel
      v-if="props.panel === 'settings'"
      @apply-theme="emit('apply-theme', $event)"
      @preview-site="emit('preview-site', $event)"
    />

    <AppManager
      v-else-if="appId"
      :page-id="appId"
      @open-page="emit('open-page', $event)"
      @open-terminal="emit('open-terminal', $event)"
    />

    <section v-else-if="props.panel === 'pages'" class="sec">
      <PageManager @close="emit('close')" />
    </section>

    <section v-else-if="props.panel === 'external'" class="sec">
      <ExternalSitesManager @preview="emit('preview-site', $event)" />
    </section>

    <section v-else-if="props.panel === 'dsh'" class="sec">
      <DshManager />
    </section>

    <section v-else-if="props.panel === 'openclaw'" class="sec">
      <OpenclawManager />
    </section>

    <!-- Help: 关于 + 更新 merged into one panel (desktop convention). -->
    <section v-else-if="props.panel === 'help'" class="sec help">
      <div class="kv">
        <span>{{ t('panel.aboutNode') }}</span>
        <strong :class="props.runtime.ok ? 'ok-text' : 'err-text'">
          {{ props.runtime.version || t('panel.notDetected') }}
        </strong>
        <el-tag v-if="props.runtime.override" size="small" effect="plain" round type="warning">
          {{ t('panel.nodeTagUpdated') }}
        </el-tag>
        <span class="node-update-ctl">
          <el-select
            v-model="nodeSel"
            size="small"
            :placeholder="t('panel.nodeVersionPick')"
            :loading="nodeLoading"
            :disabled="updates.nodeBusy"
            style="width: 190px"
          >
            <el-option
              v-for="v in nodeVersions"
              :key="v.version"
              :label="nodeVersionLabel(v)"
              :value="v.version"
              :disabled="v.version === props.runtime.version"
            />
          </el-select>
          <el-button
            size="small"
            type="primary"
            :disabled="!nodeSel || nodeSel === props.runtime.version"
            :loading="updates.nodeBusy"
            @click="doNodeUpdate"
          >
            {{ props.runtime.ok ? t('panel.nodeUpdateBtn') : t('panel.installBtn') }}
          </el-button>
          <el-button
            v-if="props.runtime.override"
            size="small"
            text
            :disabled="updates.nodeBusy"
            @click="doNodeRestore"
          >
            {{ t('panel.nodeRestoreBtn') }}
          </el-button>
        </span>
      </div>
      <div v-if="nodeError" class="node-load-err">
        <span class="cell-sub err-text">{{ nodeError }}</span>
        <el-button size="small" text :loading="nodeLoading" @click="loadNodeVersions">
          {{ t('panel.retry') }}
        </el-button>
      </div>
      <div v-if="updates.nodeProgress" class="upd-progress node-prog">
        <el-progress
          class="node-prog-bar"
          :percentage="updates.nodeProgress.percent ?? progressPercent(updates.nodeProgress)"
          :stroke-width="6"
          :indeterminate="
            updates.nodeProgress.phase === 'extract' ||
            (updates.nodeProgress.percent ?? progressPercent(updates.nodeProgress)) === 0
          "
          striped
          :striped-flow="updates.nodeProgress.phase === 'extract'"
        />
        <span class="cell-sub">{{ updates.nodeProgress.message }}</span>
      </div>
      <div class="kv">
        <span>{{ t('panel.aboutRuntimePath') }}</span>
        <code>{{ props.runtime.path || '-' }}</code>
      </div>
      <div class="kv">
        <span>Pages</span>
        <strong>{{
          t('panel.aboutPagesRunning', { running: props.runningCount, total: props.totalCount })
        }}</strong>
      </div>
      <div class="line" />
      <div class="head neon">
        <span>{{ t('panel.updatesTitle') }}</span>
        <el-button size="small" :loading="updates.checking" @click="emit('check-updates')">
          {{ t('panel.checkUpdates') }}
        </el-button>
      </div>
      <el-table :data="updates.results" size="small" :empty-text="t('panel.updatesEmpty')">
        <el-table-column :label="t('panel.colName')" min-width="200">
          <template #default="{ row }">
            <span>{{ row.name }}</span>
            <el-tag
              v-if="row.isContainer"
              size="small"
              effect="plain"
              round
              style="margin-left: 8px"
              >{{ t('panel.tagContainer') }}</el-tag
            >
            <el-tag
              v-else-if="sourceTag(row)"
              size="small"
              effect="plain"
              round
              type="warning"
              style="margin-left: 8px"
              >{{ sourceTag(row) }}</el-tag
            >
            <div class="cell-sub">{{ subLabel(row) }}</div>
            <div v-if="progressOf(row)" class="upd-progress">
              <el-progress
                :percentage="progressPercent(progressOf(row)!)"
                :stroke-width="6"
                :show-text="false"
                :indeterminate="progressIndeterminate(progressOf(row)!)"
                striped
                :striped-flow="progressIndeterminate(progressOf(row)!)"
              />
              <span class="cell-sub">{{ progressOf(row)?.message }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('panel.colBranch')" width="120">
          <template #default="{ row }">
            <code v-if="refLabel(row)">{{ refLabel(row) }}</code>
          </template>
        </el-table-column>
        <el-table-column :label="t('panel.colStatus')" width="120">
          <template #default="{ row }">
            <el-tag size="small" round :type="statusType(row)">{{ statusLabel(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('panel.colAction')" width="90" align="right">
          <template #default="{ row }">
            <el-button
              v-if="row.pendingRestart"
              size="small"
              type="primary"
              round
              @click="relaunchNow"
            >
              {{ t('panel.restartNowBtn') }}
            </el-button>
            <el-button
              v-else-if="notInstalledBuiltin(row)"
              size="small"
              type="primary"
              round
              :loading="tasks.busyBuiltin(builtinKind(row) || 'dsh')"
              @click="installBuiltinRow(row)"
            >
              {{ t('panel.installBtn') }}
            </el-button>
            <el-button
              v-else-if="row.hasUpdate && row.canAutoUpdate"
              size="small"
              type="primary"
              round
              :loading="updates.updating === row.name"
              @click="updates.perform(row)"
            >
              {{ t('panel.updateBtn') }}
            </el-button>
            <el-tooltip v-else-if="row.hasUpdate" :content="t('panel.manualTip')" placement="top">
              <el-button size="small" round disabled>{{ t('panel.manualBtn') }}</el-button>
            </el-tooltip>
            <el-button
              v-else-if="row.pageId"
              size="small"
              round
              :loading="resetting === row.name"
              @click="resetBuiltinRow(row)"
            >
              {{ t('panel.resetBtn') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<style scoped>
.sec {
  padding: 2px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-weight: 650;
  font-size: 13px;
}

.tip {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.6;
  margin-top: 8px;
}

.tip code,
.about code {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 5px;
}

.cell-sub {
  font-size: 12px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upd-progress {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  min-width: 160px;
}

.about p {
  font-size: 12.5px;
  color: var(--text-dim);
  line-height: 1.7;
  margin: 8px 0;
}

.about kbd {
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 4px;
  padding: 0 5px;
  font-size: 11px;
  color: var(--text);
  background: var(--surface-2);
}

.line {
  height: 1px;
  background: var(--border);
  margin: 10px 0;
}

.kv {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 12.5px;
  margin-bottom: 6px;
}
/* Update-list rows (关于与更新) get a glassy accent wash on hover, like the other lists. */
.help :deep(.el-table__body tr:hover > td) {
  background: color-mix(in srgb, var(--accent) 14%, transparent) !important;
  -webkit-backdrop-filter: blur(4px) saturate(125%);
  backdrop-filter: blur(4px) saturate(125%);
}

.kv span {
  color: var(--text-dim);
  flex: none;
  width: 78px;
}

/* Bundled-Node upgrade controls ride the right end of the 内置 Node row. */
.kv .node-update-ctl {
  display: flex;
  align-items: center;
  gap: 6px;
  width: auto;
  margin-left: auto;
  color: inherit;
}

.node-prog {
  margin: 0 0 8px;
}

/* Percentage text sits inline right of the 6px bar; keep it on one quiet line. */
.node-prog .node-prog-bar :deep(.el-progress__text) {
  font-size: 12px !important;
  color: var(--text-dim);
  min-width: 40px;
}

.ok-text {
  color: var(--ok);
}
.err-text {
  color: var(--err);
}
</style>
