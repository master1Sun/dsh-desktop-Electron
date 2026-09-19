<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue'
import PageManager from './PageManager.vue'
import DshManager from './DshManager.vue'
import OpenclawManager from './OpenclawManager.vue'
import ExternalSitesManager from './ExternalSitesManager.vue'
import SettingsPanel from './SettingsPanel.vue'
import { useUpdatesStore } from '../stores/updates'

const props = defineProps<{
  panel: 'view' | 'pages' | 'external' | 'dsh' | 'openclaw' | 'updates' | 'about'
  runtime: { version: string | null; ok: boolean; path: string }
  runningCount: number
  totalCount: number
}>()

const emit = defineEmits<{
  devtools: []
  'check-updates': []
  'preview-site': [url: string]
  'apply-theme': [mode: 'auto' | 'light' | 'dark']
  close: []
}>()

const updates = useUpdatesStore()

const statusLabel = (r: { ok: boolean; hasUpdate?: boolean; error?: string }): string =>
  r.ok ? (r.hasUpdate ? '有更新' : '已是最新') : r.error || '检测失败'

const statusType = (r: { ok: boolean; hasUpdate?: boolean }): string =>
  !r.ok ? 'info' : r.hasUpdate ? 'warning' : 'success'

/** Short provenance tag for built-in rows so they read apart from git repos. */
const sourceTag = (r: { name: string; source?: string }): string | null =>
  r.source === 'builtin' ? (r.name.includes('DSH') ? 'DSH' : 'OpenClaw') : null

/** The middle column shows a branch for git rows, the registry latest for version rows. */
const refLabel = (r: { source?: string; branch?: string; latestVersion?: string }): string =>
  r.source && r.source !== 'git' ? r.latestVersion || '' : r.branch || ''

/** Subtitle under the name: dir for git, current→latest for npm/builtin. */
const subLabel = (r: {
  dir: string
  source?: string
  currentVersion?: string
  latestVersion?: string
}): string =>
  r.source && r.source !== 'git' ? `${r.currentVersion || '?'} → ${r.latestVersion || '?'}` : r.dir
</script>

<template>
  <div class="panel-content">
    <SettingsPanel v-if="props.panel === 'view'" @apply-theme="emit('apply-theme', $event)" />

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

    <section v-else-if="props.panel === 'updates'" class="sec">
      <div class="head">
        <span>版本更新检测</span>
        <el-button size="small" :loading="updates.checking" @click="emit('check-updates')">
          <el-icon><Refresh /></el-icon> 立即检测
        </el-button>
      </div>
      <el-table :data="updates.results" size="small" empty-text="点击右上角「立即检测」">
        <el-table-column label="名称" min-width="200">
          <template #default="{ row }">
            <span>{{ row.name }}</span>
            <el-tag
              v-if="row.isContainer"
              size="small"
              effect="plain"
              round
              style="margin-left: 8px"
              >容器</el-tag
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
          </template>
        </el-table-column>
        <el-table-column label="分支/最新版" width="120">
          <template #default="{ row }">
            <code v-if="refLabel(row)">{{ refLabel(row) }}</code>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag size="small" round :type="statusType(row)">{{ statusLabel(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="right">
          <template #default="{ row }">
            <el-button
              v-if="row.hasUpdate && row.canAutoUpdate"
              size="small"
              type="primary"
              round
              :loading="updates.updating === row.name"
              @click="updates.perform(row)"
            >
              更新
            </el-button>
            <el-tooltip
              v-else-if="row.hasUpdate"
              content="本地项目不支持自动更新：请在其仓库拉取新版后重装/复制"
              placement="top"
            >
              <el-button size="small" round disabled>手动</el-button>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
      <div class="tip">
        git 项目一键 <code>git pull --ff-only</code>（有未提交改动自动跳过）；npm 项目比对 registry
        最新版；DSH / OpenClaw 可直接升级（OpenClaw 重装后重启该页生效）。
      </div>
    </section>

    <section v-else class="sec about">
      <div class="kv">
        <span>内置 Node</span>
        <strong :class="props.runtime.ok ? 'ok-text' : 'err-text'">
          {{ props.runtime.version || '未检测到' }}
        </strong>
      </div>
      <div class="kv">
        <span>运行时路径</span>
        <code>{{ props.runtime.path || '-' }}</code>
      </div>
      <div class="kv">
        <span>Pages</span>
        <strong>{{ props.runningCount }} / {{ props.totalCount }} 运行中</strong>
      </div>
      <div class="line" />
      <p>
        开发者模式：<kbd>F12</kbd> 打开容器界面 DevTools；主界面工具条上的同名义按钮调试当前内嵌
        page。
      </p>
      <p>点 ✕ 关闭主窗口会隐藏到任务栏托盘继续运行，托盘菜单可恢复窗口、启停各 page 或彻底退出。</p>
      <p>内容区始终占满剩余空间；本栏每个菜单都是浮层，收起即回到内容。</p>
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

.kv span {
  color: var(--text-dim);
  flex: none;
  width: 78px;
}

.ok-text {
  color: var(--ok);
}
.err-text {
  color: var(--err);
}
</style>
