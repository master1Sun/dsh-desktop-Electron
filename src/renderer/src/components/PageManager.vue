<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Download, FolderOpened, Position, Refresh, Setting } from '@element-plus/icons-vue'
import { usePagesStore, type PageState } from '../stores/pages'
import { useSettingsStore } from '../stores/settings'

const pagesStore = usePagesStore()
const settingsStore = useSettingsStore()
const emit = defineEmits<{ close: [] }>()

/** terminal-kind rows open a system console instead of spawning a server */
async function runRow(row: PageState): Promise<void> {
  if (row.kind === 'terminal') {
    const res = await window.container
      .openTerminalPage(row.id)
      .catch((e) => ({ ok: false, error: String(e) }))
    if (!res.ok) ElMessage.error(res.error || '终端启动失败')
    else emit('close')
    return
  }
  await pagesStore.start(row.id).catch((err) => ElMessage.error((err as Error).message))
}

const gitForm = reactive({ url: '', name: '', port: '' })
const dirForm = reactive({ path: '', name: '', port: '' })
const installing = ref<'git' | 'dir' | null>(null)

/** Empty means "keep whatever the project declares"; anything else must be a real port. */
function parsePort(raw: string): number | undefined {
  const s = raw.trim()
  if (!s) return undefined
  const n = Number(s)
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('端口需为 1-65535 的整数')
  return n
}

async function installGit(): Promise<void> {
  if (!gitForm.url.trim()) {
    ElMessage.warning('请输入 git 仓库地址')
    return
  }
  installing.value = 'git'
  try {
    const id = await pagesStore.installGit(
      gitForm.url.trim(),
      gitForm.name.trim() || undefined,
      parsePort(gitForm.port)
    )
    ElMessage.success(`已安装到 pages/${id}`)
    gitForm.url = ''
    gitForm.name = ''
    gitForm.port = ''
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    installing.value = null
  }
}

async function installDir(): Promise<void> {
  if (!dirForm.path.trim()) {
    ElMessage.warning('请输入本地项目目录的绝对路径')
    return
  }
  installing.value = 'dir'
  try {
    const id = await pagesStore.installDir(
      dirForm.path.trim(),
      dirForm.name.trim() || undefined,
      parsePort(dirForm.port)
    )
    ElMessage.success(`已复制到 pages/${id}`)
    dirForm.path = ''
    dirForm.name = ''
    dirForm.port = ''
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    installing.value = null
  }
}

/** Open the OS folder picker and drop the chosen absolute path into the install field. */
async function chooseDir(): Promise<void> {
  try {
    const res = await window.container.chooseDirectory()
    if (!res.ok) throw new Error(res.error || '选择目录失败')
    if (res.data) dirForm.path = String(res.data)
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

async function remove(page: PageState): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `将删除 pages/${page.id} 目录（进程会先停止）。此操作不可恢复。`,
      `移除 ${page.name}`,
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  try {
    await pagesStore.remove(page.id)
    ElMessage.success('已移除')
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
      ElMessage.error('端口需为 1-65535 的整数')
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
    ElMessage.success('配置已保存，重启该页面后生效')
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
</script>

<template>
  <div class="page-manager">
    <el-tabs>
      <el-tab-pane label="从 Git 安装">
        <p class="hint">
          支持 https / git@ 仓库地址（deepseek-harness、codex、openclaw 等任意带 node http
          服务的项目，纯 CLI 项目可在 container.json 里写 <code>"kind": "terminal"</code> +
          startCommand）。克隆到 <code>pages/&lt;repo名&gt;</code>，需项目根目录含
          <code>container.json</code> 或可推断的启动入口。
        </p>
        <el-form label-position="top" @submit.prevent="installGit">
          <el-form-item label="仓库地址">
            <el-input
              v-model="gitForm.url"
              placeholder="https://github.com/owner/deepseek-harness.git"
              clearable
            />
          </el-form-item>
          <el-form-item label="自定义目录名（可选）">
            <el-input v-model="gitForm.name" placeholder="默认取仓库名" clearable />
          </el-form-item>
          <el-form-item label="端口（可选，留空用项目声明的端口）">
            <el-input v-model="gitForm.port" placeholder="如 3000" clearable />
          </el-form-item>
          <el-button type="primary" :loading="installing === 'git'" @click="installGit">
            <el-icon><Download /></el-icon> 克隆并安装
          </el-button>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="从本地目录安装">
        <p class="hint">复制现有项目目录（排除 node_modules/.git）到 pages/ 下托管。</p>
        <el-form label-position="top" @submit.prevent="installDir">
          <el-form-item label="本地绝对路径">
            <el-input v-model="dirForm.path" placeholder="D:\projects\my-node-web" clearable>
              <template #prefix>
                <el-icon class="pick-dir" title="浏览选择目录" @click="chooseDir"
                  ><FolderOpened
                /></el-icon>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item label="目标目录名（可选）">
            <el-input v-model="dirForm.name" placeholder="默认取源目录名" clearable />
          </el-form-item>
          <el-form-item label="端口（可选，留空用项目声明的端口）">
            <el-input v-model="dirForm.port" placeholder="如 3000" clearable />
          </el-form-item>
          <el-button type="primary" :loading="installing === 'dir'" @click="installDir">
            <el-icon><Download /></el-icon> 复制并安装
          </el-button>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <div class="installed">
      <div class="installed-head">
        <span>已安装（{{ pagesStore.pages.length }}）</span>
        <el-button size="small" text @click="pagesStore.refresh()"
          ><el-icon><Refresh /></el-icon> 刷新</el-button
        >
      </div>
      <el-table :data="pagesStore.pages" size="small" empty-text="还没有安装任何 page">
        <el-table-column prop="name" label="名称" min-width="150">
          <template #default="{ row }">
            <div class="cell-name">
              <span class="status-dot" :class="row.status" />
              {{ row.name }}
            </div>
            <div class="cell-sub">{{ row.description || row.dir }}</div>
          </template>
        </el-table-column>
        <el-table-column label="端口/地址" width="150">
          <template #default="{ row }">
            <template v-if="row.external">
              <span class="cell-sub">external</span>
            </template>
            <template v-else-if="row.kind === 'terminal'">
              <span class="cell-sub">终端运行（CLI）</span>
            </template>
            <template v-else-if="row.containerPort || row.port">
              <code>:{{ row.containerPort || row.port }}</code>
              <span v-if="row.containerPort && row.containerPort !== row.port" class="cell-sub">
                自定义
              </span>
            </template>
            <span v-else class="err-text">未设置</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag
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
                { running: '运行中', starting: '启动中', error: '异常', stopped: '停止' }[
                  row.status
                ]
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300" align="right" class-name="col-actions">
          <template #default="{ row }">
            <el-button
              v-if="!row.external && (row.kind === 'terminal' || row.containerPort || row.port)"
              size="small"
              text
              :loading="pagesStore.busy[row.id]"
              @click="row.status === 'running' ? pagesStore.stop(row.id) : runRow(row)"
            >
              {{ row.status === 'running' ? '停止' : '启动' }}
            </el-button>
            <el-button v-if="!row.external" size="small" text @click="openConfig(row)">
              <el-icon><Setting /></el-icon> 配置
            </el-button>
            <el-button size="small" text @click="openTerminal(row)">
              <el-icon><Position /></el-icon> 终端
            </el-button>
            <el-button size="small" text @click="showLogs(row)">日志</el-button>
            <span v-if="row.builtin" class="builtin-tag" title="容器内置页面，不可删除">内置</span>
            <el-button v-else size="small" text type="danger" @click="remove(row)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="logsVisible"
      :title="`${logFor?.name ?? ''} · 输出日志`"
      width="720px"
      top="6vh"
    >
      <pre class="log-box">{{ logFor?.lines.join('\n') || '（暂无输出）' }}</pre>
      <template #footer>
        <el-button @click="refreshLogs"
          ><el-icon><Refresh /></el-icon> 刷新</el-button
        >
        <el-button type="primary" @click="logsVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="configVisible"
      :title="`${configFor?.name ?? ''} · 配置`"
      width="560px"
      top="8vh"
    >
      <el-form label-position="top" @submit.prevent="saveConfig">
        <el-form-item
          v-if="configFor && configFor.kind !== 'terminal'"
          label="端口（留空 = 使用项目 container.json 声明的端口）"
        >
          <el-input v-model="configDraft.port" placeholder="如 3000" clearable />
          <span v-if="configFor?.port" class="cfg-hint">
            项目声明端口 :{{ configFor.port }}
            <template v-if="configFor.containerPort && configFor.containerPort !== configFor.port">
              ，当前覆盖为 :{{ configFor.containerPort }}</template
            >
          </span>
        </el-form-item>
        <el-form-item v-for="v in configEnvVars" :key="v.key" :label="v.label || v.key">
          <el-input
            v-model="configDraft.envs[v.key]"
            :placeholder="v.defaultPath ? `默认：${v.defaultPath}` : '输入目录路径'"
            clearable
          />
          <span v-if="v.description" class="cfg-hint">{{ v.description }}</span>
        </el-form-item>
        <p v-if="configFor && !configEnvVars.length" class="cfg-hint">
          该项目未声明可配置的环境目录；在它的 container.json 里加
          <code>"envVars": [{ "key": "MYAPP_HOME", "label": "数据目录" }]</code>
          后重新打开即可在此配置。
        </p>
      </el-form>
      <template #footer>
        <el-button @click="configVisible = false">取消</el-button>
        <el-button type="primary" :loading="configSaving" @click="saveConfig">保存</el-button>
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
.installed {
  margin-top: 18px;
  border-top: 1px dashed var(--border);
  padding-top: 14px;
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
