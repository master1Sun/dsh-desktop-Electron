<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Position, Plus, Refresh } from '@element-plus/icons-vue'
import type { ExternalSite } from '../../../shared/types'
import { useSettingsStore } from '../stores/settings'

const emit = defineEmits<{ preview: [url: string] }>()

const settingsStore = useSettingsStore()

function normalizeUrl(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  return /^https?:\/\//i.test(v) ? v : `http://${v}`
}

function genId(): string {
  return `ext-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

const formVisible = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ name: '', url: '' })

function openAdd(): void {
  editingId.value = null
  form.name = ''
  form.url = ''
  formVisible.value = true
}

function openEdit(site: ExternalSite): void {
  editingId.value = site.id
  form.name = site.name
  form.url = site.url
  formVisible.value = true
}

async function save(list: ExternalSite[]): Promise<void> {
  await settingsStore.patch({ externalSites: list }).catch((err) => {
    ElMessage.error((err as Error).message)
    throw err
  })
}

async function submit(): Promise<void> {
  const url = normalizeUrl(form.url)
  if (!url) {
    ElMessage.warning('请输入外部地址')
    return
  }
  const name = form.name.trim() || new URL(url).host
  const list = [...settingsStore.settings.externalSites]
  if (editingId.value) {
    const idx = list.findIndex((s) => s.id === editingId.value)
    if (idx >= 0) list[idx] = { ...list[idx], name, url }
  } else {
    if (list.some((s) => s.url === url)) {
      ElMessage.info('该地址已在列表中')
      formVisible.value = false
      return
    }
    list.push({ id: genId(), name, url })
  }
  await save(list)
  ElMessage.success(editingId.value ? '已更新外部地址' : '已添加外部地址')
  formVisible.value = false
}

async function remove(site: ExternalSite): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `将从列表移除「${site.name}」，不影响已运行的进程。`,
      '删除外部地址',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }
  await save(settingsStore.settings.externalSites.filter((s) => s.id !== site.id))
  ElMessage.success('已删除')
}

function preview(site: ExternalSite): void {
  emit('preview', site.url)
}

/** Seed a saved address straight from the last-typed external URLs history. */
async function adopt(url: string): Promise<void> {
  const norm = normalizeUrl(url)
  if (!norm) return
  if (settingsStore.settings.externalSites.some((s) => s.url === norm)) {
    ElMessage.info('该地址已在列表中')
    return
  }
  const name = new URL(norm).host
  await save([...settingsStore.settings.externalSites, { id: genId(), name, url: norm }])
  ElMessage.success(`已保存 ${name}`)
}

async function removeRecent(url: string): Promise<void> {
  await settingsStore
    .patch({ lastExternalUrls: settingsStore.settings.lastExternalUrls.filter((u) => u !== url) })
    .catch((err) => ElMessage.error((err as Error).message))
}

async function clearRecent(): Promise<void> {
  if (!settingsStore.settings.lastExternalUrls.length) return
  try {
    await ElMessageBox.confirm('将清空「最近使用」列表，不影响已保存的固定地址。', '清理最近使用', {
      type: 'warning',
      confirmButtonText: '清空',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  await settingsStore.patch({ lastExternalUrls: [] }).catch((err) => {
    ElMessage.error((err as Error).message)
    throw err
  })
  ElMessage.success('已清空最近使用')
}
</script>

<template>
  <div class="ext-manager">
    <div class="head">
      <span class="title">外部地址（{{ settingsStore.settings.externalSites.length }}）</span>
      <el-button size="small" text @click="openAdd">
        <el-icon><Plus /></el-icon> 新增
      </el-button>
    </div>

    <div v-if="!settingsStore.settings.externalSites.length" class="empty">
      还没有保存的外部地址。点「新增」把常用 URL 存成带名称的条目，之后可在顶部切换器一键预览。
    </div>

    <div v-else class="list">
      <div v-for="site in settingsStore.settings.externalSites" :key="site.id" class="row">
        <div class="meta">
          <div class="name">{{ site.name }}</div>
          <div class="url">{{ site.url }}</div>
        </div>
        <div class="actions">
          <el-tooltip content="在内嵌视图预览" placement="top">
            <el-button circle size="small" text type="primary" @click="preview(site)">
              <el-icon><Position /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="重命名 / 改地址" placement="top">
            <el-button circle size="small" text @click="openEdit(site)">
              <el-icon><Edit /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="删除" placement="top">
            <el-button circle size="small" text type="danger" @click="remove(site)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </div>
    </div>

    <div v-if="settingsStore.settings.lastExternalUrls.length" class="recent">
      <div class="recent-head">
        <span>最近使用（点击保存为固定地址）</span>
        <el-button size="small" text type="danger" @click="clearRecent">
          <el-icon><Delete /></el-icon> 清空
        </el-button>
      </div>
      <div class="recent-list">
        <el-tag
          v-for="u in settingsStore.settings.lastExternalUrls"
          :key="u"
          class="recent-tag"
          size="small"
          effect="plain"
          round
          closable
          @click="adopt(u)"
          @close="removeRecent(u)"
        >
          {{ u }}
        </el-tag>
      </div>
    </div>

    <el-dialog
      v-model="formVisible"
      :title="editingId ? '编辑外部地址' : '新增外部地址'"
      width="480px"
    >
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="留空则用域名，如「内部门户」" clearable />
        </el-form-item>
        <el-form-item label="地址">
          <el-input
            v-model="form.url"
            placeholder="https://example.com 或 192.168.1.10:8080"
            clearable
          >
            <template #prefix
              ><el-icon><Refresh /></el-icon
            ></template>
          </el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.title {
  font-weight: 650;
  font-size: 13px;
}
.empty {
  color: var(--text-dim);
  font-size: 12.5px;
  line-height: 1.7;
  padding: 10px 2px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  transition: background 0.15s ease;
}
.row:hover {
  background: var(--surface-2);
}
.meta {
  flex: 1;
  min-width: 0;
}
.name {
  font-weight: 560;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.url {
  font-size: 12px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.actions {
  display: flex;
  opacity: 0.6;
  transition: opacity 0.15s ease;
}
.row:hover .actions {
  opacity: 1;
}
.recent {
  margin-top: 14px;
  border-top: 1px dashed var(--border);
  padding-top: 10px;
}
.recent-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 6px;
}
.recent-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.recent-tag {
  cursor: pointer;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.recent-tag:hover {
  color: var(--accent-strong);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
</style>
