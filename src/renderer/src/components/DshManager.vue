<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Download, Refresh, Top } from '@element-plus/icons-vue'
import type { DshPluginInfo, DshPluginUpdate } from '@shared/types'

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
const updates = ref<Record<string, { available: boolean; latest?: string; channel?: 'npm' | 'git' }>>({})
const checking = ref(false)

/** profile being managed; dsh ships web/acp/headless/sdk templates */
const profile = ref('web')
const installForm = reactive({ spec: '', gitUrl: '' })
const updateDialog = reactive({ visible: false, name: '', channel: 'npm' as 'npm' | 'git', gitUrl: '' })

async function load(): Promise<void> {
  loading.value = true
  try {
    const s = await window.container.dshStatus(profile.value)
    if (!s.ok) throw new Error(s.error || '状态获取失败')
    status.value = s.data as DshStatusInfo
    if (status.value?.installed) {
      const p = await window.container.dshListPlugins(profile.value)
      if (p.ok) plugins.value = (p.data as DshPluginInfo[]) || []
      else ElMessage.warning(p.error || '插件列表读取失败')
      // non-blocking: fill in "new version" hints after the table is already visible
      void checkUpdates()
    }
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

/** fetch per-plugin new-version hints (npm latest vs git HEAD) and index them by name */
async function checkUpdates(): Promise<void> {
  if (!status.value?.installed) return
  checking.value = true
  try {
    const res = await window.container.dshCheckUpdates(profile.value)
    if (res.ok) {
      const map: Record<string, { available: boolean; latest?: string; channel?: 'npm' | 'git' }> = {}
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
function updateInfo(name: string): { available: boolean; latest?: string; channel?: 'npm' | 'git' } {
  return updates.value[name] || { available: false }
}

onMounted(load)

async function install(): Promise<void> {
  const spec = installForm.spec.trim()
  if (!spec) {
    ElMessage.warning('输入 npm 包名（可带版本）或 git URL')
    return
  }
  busy.value = `install:${spec}`
  try {
    const res = await window.container.dshInstallPlugin(spec, profile.value)
    if (!res.ok) throw new Error(res.error || '安装失败')
    ElMessage.success(`已安装 ${spec}`)
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
      `从 dsh profile「${status.value?.profile}」卸载插件 ${p.name}？`,
      '卸载插件',
      { type: 'warning', confirmButtonText: '卸载', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  busy.value = `uninstall:${p.name}`
  try {
    const res = await window.container.dshUninstallPlugin(p.name, profile.value)
    if (!res.ok) throw new Error(res.error || '卸载失败')
    ElMessage.success(`已卸载 ${p.name}`)
    await load()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    busy.value = null
  }
}

/** Extract the repo portion of a git dependency spec (drops the #ref), so the update dialog can prefill it */
function gitRepoFromSpec(version: string): string {
  const gh = /^github:([\w.-]+\/[\w.-]+?)(?:\.git)?/.exec(version)
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
    info.channel === 'git' ? `${gitRepoFromSpec(p.version)}${info.latest ? '#' + info.latest : ''}` : ''
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
    if (!res.ok) throw new Error(res.error || '更新失败')
    ElMessage.success(String(res.data || '已更新'))
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
    if (!res.ok) throw new Error(res.error || '批量更新失败')
    ElMessage.success('已通过 npm 批量更新')
    await load()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    busy.value = null
  }
}

const sourceTag = (s: DshPluginInfo['source']): 'primary' | 'info' => (s === 'bundle' ? 'info' : 'primary')
</script>

<template>
  <div class="dsh-manager" v-loading="loading && !status">
    <div v-if="status && !status.installed" class="empty">
      <p>{{ status.error || '未安装 @deepseek-ai/dsh' }}</p>
      <code>npm install @deepseek-ai/dsh@0.1.6-alpha.2</code>
      <el-button size="small" text @click="load"><el-icon><Refresh /></el-icon> 重新检测</el-button>
    </div>

    <template v-else-if="status">
      <el-alert
        v-if="!status.pnpmFound"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
        title="未找到 pnpm"
        description="dsh 的插件安装/卸载/更新都通过 pnpm 执行，请先执行 npm install -g pnpm 后点击「刷新」。"
      />

      <div class="profile-row">
        <span class="foot-label">profile</span>
        <el-input v-model="profile" size="small" style="width: 180px" placeholder="web" @keyup.enter="load" />
        <el-button size="small" :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon> 切换 / 刷新
        </el-button>
        <span class="foot-hint">dsh 自带模板：web / acp / headless / sdk；首次使用由 dsh 自动初始化</span>
      </div>

      <div class="head">
        <div class="ver">
          <span class="status-dot running" /> @deepseek-ai/dsh <b>v{{ status.version }}</b>
          <el-tag size="small" effect="plain" round>profile: {{ status.profile }}</el-tag>
        </div>
        <div class="head-actions">
          <el-button size="small" text :loading="busy === 'update-all'" @click="updateAll">
            <el-icon><Top /></el-icon> npm 全部更新
          </el-button>
          <el-button size="small" text @click="load"><el-icon><Refresh /></el-icon> 刷新</el-button>
          <span v-if="checking" class="foot-hint">检查更新中…</span>
        </div>
      </div>
      <div class="sub">profile 目录：{{ status.profileDir }} · 插件管理经 <code>dsh plugin</code>（pnpm）执行</div>

      <el-form class="install-row" @submit.prevent="install">
        <el-form-item style="margin-bottom: 8px">
          <el-input v-model="installForm.spec" placeholder="npm 包名（如 some-dsh-plugin@^1）或 git URL（https://….git）" clearable @keyup.enter="install">
            <template #append>
              <el-button :loading="busy === `install:${installForm.spec.trim()}`" @click="install">
                <el-icon><Download /></el-icon> 安装
              </el-button>
            </template>
          </el-input>
        </el-form-item>
      </el-form>

      <el-table :data="plugins" size="small" empty-text="profile 中暂无插件">
        <el-table-column label="插件" min-width="220">
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
                title="点击更新到新版本"
                @click="openUpdate(row)"
              >可更新 {{ updateInfo(row.name).latest }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="90">
          <template #default="{ row }">
            <el-tag size="small" round :type="sourceTag(row.source)">{{ row.source === 'bundle' ? '内置组合包' : '已安装' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" align="right">
          <template #default="{ row }">
            <template v-if="row.source === 'profile'">
              <el-button
                size="small"
                text
                :type="updateInfo(row.name).available ? 'warning' : 'primary'"
                @click="openUpdate(row)"
              >
                <el-icon><Refresh /></el-icon> 更新
              </el-button>
              <el-button size="small" text type="danger" :loading="busy === `uninstall:${row.name}`" @click="uninstall(row)">
                <el-icon><Delete /></el-icon> 卸载
              </el-button>
            </template>
            <span v-else class="cell-sub">随 dsh 发行，不可单独卸载</span>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <el-dialog v-model="updateDialog.visible" title="更新插件" width="460px">
      <div class="upd-name">{{ updateDialog.name }}</div>
      <el-radio-group v-model="updateDialog.channel" style="margin: 10px 0">
        <el-radio-button value="npm">从 npm 更新</el-radio-button>
        <el-radio-button value="git">从 git 更新</el-radio-button>
      </el-radio-group>
      <el-input
        v-if="updateDialog.channel === 'git'"
        v-model="updateDialog.gitUrl"
        placeholder="git 仓库地址（如 github:user/repo#v1.2.3，将以 url#ref 重装到最新 tag）"
      />
      <div v-else class="cell-sub">执行 pnpm update {{ updateDialog.name }}（registry 走 npmmirror）</div>
      <template #footer>
        <el-button @click="updateDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="busy === `update:${updateDialog.name}`" @click="doUpdate">开始更新</el-button>
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
</style>
