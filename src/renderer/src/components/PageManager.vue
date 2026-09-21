<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, FolderOpened } from '@element-plus/icons-vue'
import { usePagesStore, type PageState } from '../stores/pages'
import { useSettingsStore } from '../stores/settings'
import { useRuntimesStore } from '../stores/runtimes'
import { CONTAINER_REPO_URL } from '@shared/types'
import { t } from '../i18n'

/** Mirror of the main-process check: a filesystem path typed where a URL was expected. */
function looksLikeLocalPath(s: string): boolean {
  return (
    /^[a-z]:[\\/]/i.test(s) || s.startsWith('\\\\') || /^\.\.?[/\\]/.test(s) || s.startsWith('/')
  )
}

const pagesStore = usePagesStore()
const settingsStore = useSettingsStore()
const runtimes = useRuntimesStore()
const emit = defineEmits<{ close: [] }>()

/**
 * A hosted dsh/openclaw row can't start without its CLI runtime (both are provisioned on demand
 * into userData, never shipped in the slim installer). The verdict comes from the main process on
 * `PageState.runtimeMissing` — a synchronous probe it re-runs on every list — so the badge can't
 * lag the async install-status IPC or flicker during its round trip, and needs no `loaded` guard.
 */
function runtimeMissing(row: PageState): boolean {
  return row.runtimeMissing === true
}

/** terminal-kind rows open a system console instead of spawning a server */
async function runRow(row: PageState): Promise<void> {
  if (row.kind === 'terminal') {
    const res = await window.container
      .openTerminalPage(row.id)
      .catch((e) => ({ ok: false, error: String(e) }))
    if (!res.ok) ElMessage.error(res.error || t('pageMgr.msgTerminalStartFail'))
    else emit('close')
    return
  }
  await pagesStore.start(row.id).catch((err) => ElMessage.error((err as Error).message))
}

/** Same bounce App uses for a blocked page: send the user to the install guide, don't spawn. */
function guideForMissing(row: PageState): void {
  runtimes.requestGuide()
  ElMessage.warning(t('setup.runtimeMissingToast', { name: row.name }))
}

/**
 * Port-conflict recovery: a failed start that timed out on its port names the foreign
 * LISTENING process on `portHolder` — offer killing it and starting again in one click.
 */
const killing = ref<string | null>(null)
async function killHolderAndRetry(row: PageState): Promise<void> {
  const port = row.containerPort || row.port
  if (!port || killing.value) return
  killing.value = row.id
  try {
    const res = await window.container.killPortHolder(port)
    if (!res?.ok) throw new Error(res?.error || t('pageMgr.msgKillFail'))
    ElMessage.success(
      res.data
        ? t('pageMgr.msgKilled', { pid: (res.data as { pid: number }).pid })
        : t('pageMgr.msgHolderGone')
    )
    await pagesStore.start(row.id)
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    killing.value = null
  }
}

const gitForm = reactive({ url: '', name: '', port: '' })
const dirForm = reactive({ path: '', name: '', port: '' })
// The in-flight import lives in the store, not here, so closing/reopening the Pages panel
// while a clone or copy runs still shows the progress bar (component state would reset).
const installing = computed(() => pagesStore.installing)

/* Live import progress (git clone / local copy) streamed from the main process. The bar is
   indeterminate while a step has no computable percentage (connecting, validating). */
const installPct = computed(() => pagesStore.installProgress?.percent ?? 0)
const installIndeterminate = computed(
  () => !pagesStore.installProgress || pagesStore.installProgress.percent == null
)
const installPhaseText = computed(() => {
  const p = pagesStore.installProgress
  return p ? t(`pageMgr.installPhase.${p.phase}`) : t('pageMgr.installPhase.preparing')
})
const installDetail = computed(() => pagesStore.installProgress?.message || '')

/** Empty means "keep whatever the project declares"; anything else must be a real port. */
function parsePort(raw: string): number | undefined {
  const s = raw.trim()
  if (!s) return undefined
  const n = Number(s)
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(t('pageMgr.msgPortRange'))
  return n
}

async function installGit(): Promise<void> {
  const url = gitForm.url.trim()
  if (!url) {
    ElMessage.warning(t('pageMgr.msgEnterRepo'))
    return
  }
  try {
    // A local folder pasted into the URL field: import it as a copy. Only the container
    // repo itself gets adopted for git updates — a blind origin would mislead the pull.
    if (looksLikeLocalPath(url)) {
      const isContainerRepo = /[/\\]DesktopContainer(\/|$)/i.test(url)
      const id = await pagesStore.installDir(
        url,
        gitForm.name.trim() || undefined,
        parsePort(gitForm.port),
        isContainerRepo ? CONTAINER_REPO_URL : undefined
      )
      ElMessage.success(t('pageMgr.msgCopiedDir', { id }))
    } else {
      const id = await pagesStore.installGit(
        url,
        gitForm.name.trim() || undefined,
        parsePort(gitForm.port)
      )
      ElMessage.success(t('pageMgr.msgInstalledGit', { id }))
    }
    gitForm.url = ''
    gitForm.name = ''
    gitForm.port = ''
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

async function installDir(): Promise<void> {
  if (!dirForm.path.trim()) {
    ElMessage.warning(t('pageMgr.msgEnterLocalPath'))
    return
  }
  try {
    const id = await pagesStore.installDir(
      dirForm.path.trim(),
      dirForm.name.trim() || undefined,
      parsePort(dirForm.port)
    )
    ElMessage.success(t('pageMgr.msgCopiedDir', { id }))
    dirForm.path = ''
    dirForm.name = ''
    dirForm.port = ''
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

/** Open the OS folder picker and drop the chosen absolute path into the install field. */
async function chooseDir(): Promise<void> {
  try {
    const res = await window.container.chooseDirectory()
    if (!res.ok) throw new Error(res.error || t('pageMgr.msgChooseDirFail'))
    if (res.data) dirForm.path = String(res.data)
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

async function remove(page: PageState): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('pageMgr.msgRemoveConfirm', { id: page.id }),
      t('pageMgr.msgRemoveTitle', { name: page.name }),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    return
  }
  try {
    await pagesStore.remove(page.id)
    ElMessage.success(t('pageMgr.msgRemoved'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

const logFor = ref<{ id: string; name: string; lines: string[] } | null>(null)
const logsVisible = ref(false)

/* ---- per-page config dialog: port override + the env dirs THIS project declares ---- */
const configFor = ref<PageState | null>(null)
const configVisible = ref(false)
const configDraft = reactive({ port: '', envs: {} as Record<string, string> })
const configSaving = ref(false)

const configEnvVars = computed(() => configFor.value?.envVars ?? [])

function openConfig(page: PageState): void {
  configFor.value = page
  configDraft.port = String(page.containerPort || page.port || '')
  const stored = settingsStore.settings.pageEnvs?.[page.id] || {}
  configDraft.envs = {}
  for (const v of page.envVars ?? []) configDraft.envs[v.key] = stored[v.key] || ''
  configVisible.value = true
}

async function saveConfig(): Promise<void> {
  const page = configFor.value
  if (!page) return
  let port: number | undefined
  const raw = configDraft.port.trim()
  if (raw) {
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      ElMessage.error(t('pageMgr.msgPortRange'))
      return
    }
    // 0/unset semantics: clearing the field reverts to the declared port
    port = n
  }
  configSaving.value = true
  try {
    if (port !== (page.containerPort || undefined)) await pagesStore.setPort(page.id, port || 0)
    const next: Record<string, Record<string, string>> = JSON.parse(
      JSON.stringify(settingsStore.settings.pageEnvs || {})
    )
    const vars: Record<string, string> = {}
    for (const [k, v] of Object.entries(configDraft.envs)) vars[k] = String(v).trim()
    if (Object.keys(vars).length) next[page.id] = vars
    else delete next[page.id]
    await settingsStore.patch({ pageEnvs: next })
    ElMessage.success(t('pageMgr.msgConfigSaved'))
    configVisible.value = false
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    configSaving.value = false
  }
}

async function openTerminal(page: PageState): Promise<void> {
  try {
    await pagesStore.openTerminal(page.id, page.name)
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

async function showLogs(page: PageState): Promise<void> {
  const lines = await pagesStore.logs(page.id)
  logFor.value = { id: page.id, name: page.name, lines }
  logsVisible.value = true
}

function refreshLogs(): void {
  if (logFor.value) pagesStore.logs(logFor.value.id).then((l) => (logFor.value!.lines = l))
}

/** the page state backing the open log dialog — exposes status / exitCode / lastError for the detail header */
const logPage = computed(() => pagesStore.pages.find((p) => p.id === logFor.value?.id))

let logTimer: number | undefined
watch(logsVisible, (open) => {
  window.clearInterval(logTimer)
  if (open) logTimer = window.setInterval(refreshLogs, 1500)
})
onBeforeUnmount(() => window.clearInterval(logTimer))

function statusText(s?: string): string {
  return (
    {
      running: t('pageMgr.statusRunning'),
      starting: t('pageMgr.statusStarting'),
      error: t('pageMgr.statusError'),
      stopped: t('pageMgr.statusStopped')
    }[s ?? ''] ??
    s ??
    t('pageMgr.unknown')
  )
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return String(ms)
  }
}
</script>

<template>
  <div class="page-manager">
    <el-tabs>
      <el-tab-pane :label="t('pageMgr.tabGit')">
        <p class="hint">{{ t('pageMgr.hintGit') }}</p>
        <el-form label-position="top" @submit.prevent="installGit">
          <el-form-item :label="t('pageMgr.labelRepo')">
            <el-input
              v-model="gitForm.url"
              placeholder="https://github.com/owner/deepseek-harness.git"
              clearable
            />
          </el-form-item>
          <el-form-item :label="t('pageMgr.labelCustomDir')">
            <el-input
              v-model="gitForm.name"
              :placeholder="t('pageMgr.placeholderDirName')"
              clearable
            />
          </el-form-item>
          <el-form-item :label="t('pageMgr.labelPort')">
            <el-input
              v-model="gitForm.port"
              :placeholder="t('pageMgr.placeholderPort')"
              clearable
            />
          </el-form-item>
          <el-button type="primary" :loading="installing === 'git'" @click="installGit">
            {{ t('pageMgr.btnClone') }}
          </el-button>
          <div v-if="installing" class="install-progress">
            <el-progress
              :percentage="installPct"
              :indeterminate="installIndeterminate"
              :duration="1.4"
              striped
              :show-text="!installIndeterminate"
              :stroke-width="12"
            />
            <div class="ip-line">
              <span>{{ installPhaseText }}</span>
              <span v-if="installDetail" class="ip-raw">{{ installDetail }}</span>
            </div>
          </div>
        </el-form>
      </el-tab-pane>

      <el-tab-pane :label="t('pageMgr.tabDir')">
        <p class="hint">{{ t('pageMgr.hintDir') }}</p>
        <el-form label-position="top" @submit.prevent="installDir">
          <el-form-item :label="t('pageMgr.labelLocalPath')">
            <el-input
              v-model="dirForm.path"
              :placeholder="t('pageMgr.placeholderLocalPath')"
              clearable
            >
              <template #prefix>
                <el-icon class="pick-dir" :title="t('common.browse')" @click="chooseDir"
                  ><FolderOpened
                /></el-icon>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item :label="t('pageMgr.labelTargetDir')">
            <el-input
              v-model="dirForm.name"
              :placeholder="t('pageMgr.placeholderTargetDir')"
              clearable
            />
          </el-form-item>
          <el-form-item :label="t('pageMgr.labelPort')">
            <el-input
              v-model="dirForm.port"
              :placeholder="t('pageMgr.placeholderPort')"
              clearable
            />
          </el-form-item>
          <el-button type="primary" :loading="installing === 'dir'" @click="installDir">
            {{ t('pageMgr.btnCopy') }}
          </el-button>
          <div v-if="installing" class="install-progress">
            <el-progress
              :percentage="installPct"
              :indeterminate="installIndeterminate"
              :duration="1.4"
              striped
              :show-text="!installIndeterminate"
              :stroke-width="12"
            />
            <div class="ip-line">
              <span>{{ installPhaseText }}</span>
              <span v-if="installDetail" class="ip-raw">{{ installDetail }}</span>
            </div>
          </div>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <div class="installed">
      <div class="installed-head neon">
        <span>{{ t('pageMgr.installed', { n: pagesStore.pages.length }) }}</span>
        <el-button size="small" text @click="pagesStore.refresh()">{{
          t('common.refresh')
        }}</el-button>
      </div>
      <el-table :data="pagesStore.pages" size="small" :empty-text="t('pageMgr.msgEmpty')">
        <el-table-column
          prop="name"
          :label="t('pageMgr.colName')"
          min-width="120"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <div class="cell-name">
              <!-- A missing runtime never "starts": keep the dot grey instead of implying
                   progress (the amber 启动中 dot used to spin forever on these rows). -->
              <span class="status-dot" :class="runtimeMissing(row) ? 'stopped' : row.status" />
              {{ row.name }}
            </div>
            <div class="cell-sub">{{ row.description || row.dir }}</div>
            <div v-if="runtimeMissing(row)" class="runtime-missing">
              <el-button size="small" text type="warning" @click="guideForMissing(row)">
                {{ t('setup.runtimeMissingTag') }} · {{ t('setup.installBtn') }}
              </el-button>
            </div>
            <div
              v-if="row.lastError"
              class="cell-sub err-text"
              style="cursor: pointer"
              :title="t('pageMgr.viewLogs')"
              @click="showLogs(row)"
            >
              {{ row.lastError }}
            </div>
            <el-button
              v-if="row.portHolder && !row.external"
              size="small"
              type="warning"
              plain
              round
              :loading="killing === row.id"
              @click="killHolderAndRetry(row)"
            >
              {{
                t('pageMgr.killPort', {
                  name: row.portHolder.name,
                  pid: row.portHolder.pid
                })
              }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column :label="t('pageMgr.colPort')" width="88" show-overflow-tooltip>
          <template #default="{ row }">
            <template v-if="row.external">
              <span class="cell-sub">{{ t('pageMgr.external') }}</span>
            </template>
            <template v-else-if="row.kind === 'terminal'">
              <span class="cell-sub">{{ t('pageMgr.terminalRunning') }}</span>
            </template>
            <template v-else-if="row.containerPort || row.port">
              <code>:{{ row.containerPort || row.port }}</code>
              <span v-if="row.containerPort && row.containerPort !== row.port" class="cell-sub">
                {{ t('pageMgr.custom') }}
              </span>
            </template>
            <span v-else class="err-text">{{ t('pageMgr.notSet') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('pageMgr.colStatus')" width="70">
          <template #default="{ row }">
            <!-- When the runtime isn't installed, 启动中/失败 is noise — the actionable fact is
                 未安装, so it owns the status cell (the name row links to the install guide). -->
            <el-tag v-if="runtimeMissing(row)" size="small" type="warning" effect="plain" round>
              {{ t('setup.missingTag') }}
            </el-tag>
            <el-tag
              v-else
              size="small"
              :type="
                row.status === 'running'
                  ? 'success'
                  : row.status === 'error'
                    ? 'danger'
                    : row.status === 'starting'
                      ? 'warning'
                      : 'info'
              "
              round
            >
              {{
                {
                  running: t('pageMgr.statusRunning'),
                  starting: t('pageMgr.statusStarting'),
                  error: t('pageMgr.statusError'),
                  stopped: t('pageMgr.statusStopped')
                }[row.status]
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('pageMgr.colAction')"
          width="300"
          align="right"
          class-name="col-actions"
        >
          <template #default="{ row }">
            <el-button
              v-if="!row.external && (row.kind === 'terminal' || row.containerPort || row.port)"
              size="small"
              text
              :loading="pagesStore.busy[row.id]"
              @click="
                row.status === 'running'
                  ? pagesStore.stop(row.id)
                  : runtimeMissing(row)
                    ? guideForMissing(row)
                    : runRow(row)
              "
            >
              {{ row.status === 'running' ? t('pageMgr.actionStop') : t('pageMgr.actionStart') }}
            </el-button>
            <el-button v-if="!row.external" size="small" text @click="openConfig(row)">
              {{ t('pageMgr.actionConfig') }}
            </el-button>
            <el-button size="small" text @click="openTerminal(row)">
              {{ t('pageMgr.actionTerminal') }}
            </el-button>
            <el-button size="small" text @click="showLogs(row)">{{
              t('pageMgr.actionLogs')
            }}</el-button>
            <span v-if="row.builtin" class="builtin-tag" :title="t('pageMgr.builtinTip')">{{
              t('pageMgr.builtin')
            }}</span>
            <el-button v-else size="small" text type="danger" @click="remove(row)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="logsVisible"
      :title="t('pageMgr.logTitle', { name: logFor?.name ?? '' })"
      width="720px"
      top="6vh"
      append-to-body
    >
      <div class="log-meta">
        <span
          >{{ t('pageMgr.logStatus') }}<b>{{ statusText(logPage?.status) }}</b></span
        >
        <span v-if="logPage?.exitCode != null"
          >{{ t('pageMgr.logExitCode') }}{{ logPage.exitCode }}</span
        >
        <span v-if="logPage?.startedAt"
          >{{ t('pageMgr.logStarted') }}{{ formatTime(logPage.startedAt) }}</span
        >
        <span v-if="logPage?.lastError" class="log-err"
          >{{ t('pageMgr.logError') }}{{ logPage.lastError }}</span
        >
      </div>
      <pre class="log-box">{{ logFor?.lines.join('\n') || t('pageMgr.logEmpty') }}</pre>
      <template #footer>
        <el-button @click="refreshLogs">{{ t('pageMgr.logRefresh') }}</el-button>
        <el-button type="primary" @click="logsVisible = false">{{
          t('pageMgr.logClose')
        }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="configVisible"
      :title="t('pageMgr.configTitle', { name: configFor?.name ?? '' })"
      width="560px"
      top="8vh"
      append-to-body
    >
      <el-form label-position="top" @submit.prevent="saveConfig">
        <el-form-item
          v-if="configFor && configFor.kind !== 'terminal'"
          :label="t('pageMgr.configPortLabel')"
        >
          <el-input
            v-model="configDraft.port"
            :placeholder="t('pageMgr.configPortPlaceholder')"
            clearable
          />
          <span v-if="configFor?.port" class="cfg-hint">
            {{ t('pageMgr.configDeclaredPort', { port: configFor.port }) }}
            <template v-if="configFor.containerPort && configFor.containerPort !== configFor.port">
              {{ t('pageMgr.configPortOverride', { port: configFor.containerPort }) }}</template
            >
          </span>
        </el-form-item>
        <el-form-item v-for="v in configEnvVars" :key="v.key" :label="v.label || v.key">
          <el-input
            v-model="configDraft.envs[v.key]"
            :placeholder="
              v.defaultPath
                ? t('pageMgr.configEnvPlaceholder', { path: v.defaultPath })
                : t('pageMgr.configEnvInputPlaceholder')
            "
            clearable
          />
          <span v-if="v.description" class="cfg-hint">{{ v.description }}</span>
        </el-form-item>
        <p v-if="configFor && !configEnvVars.length" class="cfg-hint">
          {{ t('pageMgr.configNoEnv') }}
        </p>
      </el-form>
      <template #footer>
        <el-button @click="configVisible = false">{{ t('pageMgr.configCancel') }}</el-button>
        <el-button type="primary" :loading="configSaving" @click="saveConfig">{{
          t('pageMgr.configSave')
        }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.builtin-tag {
  font-size: 11px;
  color: var(--text-dim);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 8px;
  margin-left: 6px;
}
.hint {
  color: var(--text-dim);
  font-size: 13px;
  margin: 4px 0 14px;
}
.hint code {
  background: var(--surface-2);
  border: 1px solid var(--border);
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 12px;
}
.pick-dir {
  cursor: pointer;
  color: var(--text-dim);
}
.pick-dir:hover {
  color: var(--accent-strong);
}
.install-progress {
  margin-top: 12px;
  max-width: 480px;
}
.install-progress .ip-line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-dim);
}
.install-progress .ip-raw {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
  font-family: var(--mono, ui-monospace, monospace);
}
/* The panel card is ~860px wide and `label-position="top"` lets the fields stretch the whole
   way across, which reads as a broken layout. Cap the install fields to a normal form width.
   (The ⚙ config dialog is a 560px teleport rendered on <body>, so scoped styles cannot — and
   should not — reach it.) */
.page-manager :deep(.el-form-item .el-input) {
  max-width: 440px;
}
.installed {
  margin-top: 16px;
  border-top: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  /* frosted glass card */
  background: color-mix(in srgb, var(--surface) 80%, transparent);
  -webkit-backdrop-filter: blur(18px) saturate(125%);
  backdrop-filter: blur(18px) saturate(125%);
  border-radius: var(--radius-md, 12px);
  padding: 14px 16px 4px;
}
.installed-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  margin-bottom: 8px;
}
.cell-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 550;
}
.cell-sub {
  font-size: 12px;
  color: var(--text-dim);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The 运行环境未安装 shortcut sits under the row name; keep it off .cell-sub's single-line
   ellipsis clipping so the button stays clickable across its full width. */
.runtime-missing {
  margin-top: 2px;
}
.runtime-missing :deep(.el-button) {
  height: auto;
  padding: 0;
  font-size: 12px;
}
.err-text {
  color: var(--err);
  font-size: 12px;
}
.cfg-hint {
  display: block;
  color: var(--text-dim);
  font-size: 12px;
  line-height: 1.6;
  margin-top: 4px;
}
.cfg-hint code {
  background: var(--surface-2);
  border: 1px solid var(--border);
  padding: 1px 5px;
  border-radius: 5px;
  font-size: 11.5px;
}
/* Five text buttons exceed 300px at wide fonts — keep them on one line. */
.installed :deep(.col-actions .cell) {
  white-space: nowrap;
}
.installed :deep(.el-table .el-button.is-text + .el-button.is-text) {
  margin-left: 2px;
}
.log-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  font-size: 12.5px;
  color: var(--text-dim);
  margin-bottom: 10px;
}
.log-meta b {
  color: var(--text);
}
.log-meta .log-err {
  color: var(--err);
  font-weight: 600;
}
.log-box {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  max-height: 56vh;
  overflow: auto;
  font-size: 12.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}
</style>

<style>
/* ElMessageBox renders on body, so scoped styles cannot reach it. */
.port-prompt .el-input__wrapper {
  background: var(--surface-2);
  box-shadow: 0 0 0 1px var(--border) inset;
}
.port-prompt .el-input__inner {
  color: var(--text);
}
</style>
