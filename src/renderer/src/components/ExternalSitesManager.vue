<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Position, Refresh } from '@element-plus/icons-vue'
import type { ExternalSite } from '../../../shared/types'
import { useSettingsStore } from '../stores/settings'
import EmptyState from './EmptyState.vue'
import { t } from '../i18n'

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
  // settingsStore.state is a Vue reactive Proxy; ipcRenderer.invoke structured-clones
  // its arguments and throws "An object could not be cloned" on the nested site
  // Proxies. Deep-copy to plain data at this IPC boundary so every add/edit/delete
  // (which all route through here) survives the clone.
  const plain = JSON.parse(JSON.stringify(list)) as ExternalSite[]
  await settingsStore.patch({ externalSites: plain }).catch((err) => {
    ElMessage.error((err as Error).message)
    throw err
  })
}

async function submit(): Promise<void> {
  const url = normalizeUrl(form.url)
  if (!url) {
    ElMessage.warning(t('extMgr.msgEnterUrl'))
    return
  }
  const name = form.name.trim() || new URL(url).host
  const list = [...settingsStore.settings.externalSites]
  if (editingId.value) {
    const idx = list.findIndex((s) => s.id === editingId.value)
    if (idx >= 0) list[idx] = { ...list[idx], name, url }
  } else {
    if (list.some((s) => s.url === url)) {
      ElMessage.info(t('extMgr.msgDuplicate'))
      formVisible.value = false
      return
    }
    list.push({ id: genId(), name, url })
  }
  await save(list)
  ElMessage.success(editingId.value ? t('extMgr.msgUpdated') : t('extMgr.msgAdded'))
  formVisible.value = false
}

async function remove(site: ExternalSite): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('extMgr.msgRemoveConfirm', { name: site.name }),
      t('extMgr.msgRemoveTitle'),
      {
        type: 'warning',
        confirmButtonText: t('extMgr.msgRemoveConfirmBtn'),
        cancelButtonText: t('extMgr.cancel')
      }
    )
  } catch {
    return
  }
  await save(settingsStore.settings.externalSites.filter((s) => s.id !== site.id))
  ElMessage.success(t('extMgr.msgDeleted'))
}

function preview(site: ExternalSite): void {
  emit('preview', site.url)
}
</script>

<template>
  <div class="ext-manager">
    <div class="head">
      <span class="title neon">{{
        t('extMgr.title', { n: settingsStore.settings.externalSites.length })
      }}</span>
      <el-button size="small" text @click="openAdd">
        {{ t('extMgr.add') }}
      </el-button>
    </div>

    <EmptyState v-if="!settingsStore.settings.externalSites.length" :description="t('extMgr.empty')" />

    <div v-else class="list">
      <div v-for="site in settingsStore.settings.externalSites" :key="site.id" class="row">
        <div class="meta">
          <div class="name">{{ site.name }}</div>
          <div class="url">{{ site.url }}</div>
        </div>
        <div class="actions">
          <el-tooltip :content="t('extMgr.previewTip')" placement="top">
            <el-button circle size="small" text type="primary" @click="preview(site)">
              <el-icon><Position /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip :content="t('extMgr.editTip')" placement="top">
            <el-button circle size="small" text @click="openEdit(site)">
              <el-icon><Edit /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip :content="t('extMgr.deleteTip')" placement="top">
            <el-button circle size="small" text type="danger" @click="remove(site)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </div>
    </div>

    <!-- append-to-body: the menu panel card carries a backdrop-filter, which becomes the
         containing block of fixed-position descendants — an in-place dialog would be trapped
         (and clipped) inside the panel instead of covering the window. -->
    <el-dialog
      v-model="formVisible"
      :title="editingId ? t('extMgr.dialogTitleEdit') : t('extMgr.dialogTitleAdd')"
      width="480px"
      append-to-body
    >
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item :label="t('extMgr.labelName')">
          <el-input v-model="form.name" :placeholder="t('extMgr.namePlaceholder')" clearable />
        </el-form-item>
        <el-form-item :label="t('extMgr.labelUrl')">
          <el-input v-model="form.url" :placeholder="t('extMgr.urlPlaceholder')" clearable>
            <template #prefix
              ><el-icon><Refresh /></el-icon
            ></template>
          </el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">{{ t('extMgr.cancel') }}</el-button>
        <el-button type="primary" @click="submit">{{ t('extMgr.save') }}</el-button>
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
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border));
  border-radius: var(--radius-md);
  /* frosted glass row */
  background: color-mix(in srgb, var(--surface) 88%, transparent);
    -webkit-backdrop-filter: blur(14px) saturate(125%);
    backdrop-filter: blur(14px) saturate(125%);
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.18s ease;
}
.row:hover {
  /* Translucent accent wash + frosted glass: reads clearly in dark mode, stays glassy. */
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  -webkit-backdrop-filter: blur(10px) saturate(125%);
  backdrop-filter: blur(10px) saturate(125%);
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent) inset,
    0 0 16px color-mix(in srgb, var(--accent) 20%, transparent);
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
</style>
