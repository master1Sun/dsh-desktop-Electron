<script setup lang="ts">
import { computed, onMounted, ref, toRaw } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Delete, Edit, Promotion } from '@element-plus/icons-vue'
import EmptyState from '@renderer/components/base/EmptyState.vue'
import { t } from '@renderer/i18n'
import { copyToClipboard } from '@renderer/askAi'
import { useSettingsStore } from '@renderer/stores/settings'
import { usePagesStore } from '@renderer/stores/pages'
import type { WorkspaceInfo, WorkspaceNote } from '@shared/types'

/**
 * Shared workspace / context panel: the human surface for the one container-owned context
 * every hosted agent reads and writes (runtime/workspace.ts). Editing here lands on disk
 * immediately, so the next agent turn — in any hosted page — sees the same task and memory.
 * This is the "①shared workspace" foundation: agents stop being side-by-side and invisible.
 */

interface Result<T> {
  ok: boolean
  data?: T
  error?: string
}

const loading = ref(false)
const saving = ref(false)
const broadcasting = ref(false)
const info = ref<WorkspaceInfo | null>(null)
const task = ref('')
const notes = ref<WorkspaceNote[]>([])
const draft = ref('')

const settingsStore = useSettingsStore()
const pagesStore = usePagesStore()
/** Master switch: undefined (an install predating the setting) reads as on. */
const memoryOn = computed(() => settingsStore.settings.sharedWorkspace !== false)
/** How many hosted agents are live right now — the audience of a broadcast. */
const runningCount = computed(() => pagesStore.runningPages.length)
const revision = computed(() => info.value?.context.revision ?? 0)
const broadcastAt = computed(() => info.value?.context.broadcastAt ?? '')

function emptyNote(text: string): WorkspaceNote {
  return {
    id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    author: 'container',
    text: text.trim(),
    ts: Date.now()
  }
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const r = (await window.container.workspaceGet?.()) as Result<WorkspaceInfo>
    if (!r?.ok || !r.data) throw new Error(r?.error || t('wsMgr.msgLoadFail'))
    info.value = r.data
    task.value = r.data.context.task
    notes.value = [...r.data.context.notes]
  } catch (err) {
    ElMessage.error((err as Error).message || t('wsMgr.msgLoadFail'))
  } finally {
    loading.value = false
  }
}

async function persist(nextTask: string, nextNotes: WorkspaceNote[]): Promise<boolean> {
  saving.value = true
  try {
    // contextBridge/IPC structured-clone cannot carry Vue reactive Proxies ("An object could not
    // be cloned"), so unwrap every note back to plain data at the boundary before sending.
    // The explicit [] guard also keeps a stray DOM event (from a native @click/@keyup.enter
    // listener passing itself as our argument) from ever reaching ipcRenderer.invoke.
    const source = Array.isArray(nextNotes) ? nextNotes : []
    const plainNotes = source.map((n) => ({ ...toRaw(n) }))
    const r = (await window.container.workspaceSave?.({
      task: nextTask,
      notes: plainNotes
    })) as Result<{
      task: string
      notes: WorkspaceNote[]
    }>
    if (!r?.ok || !r.data) throw new Error(r?.error || t('wsMgr.msgSaveFail'))
    task.value = r.data.task
    notes.value = [...r.data.notes]
    return true
  } catch (err) {
    ElMessage.error((err as Error).message || t('wsMgr.msgSaveFail'))
    return false
  } finally {
    saving.value = false
  }
}

async function saveTask(): Promise<void> {
  if (await persist(task.value, notes.value)) ElMessage.success(t('wsMgr.msgSaved'))
}

async function addNote(): Promise<void> {
  const text = draft.value.trim()
  if (!text) return
  if (await persist(task.value, [...notes.value, emptyNote(text)])) draft.value = ''
}

async function removeNote(id: string): Promise<void> {
  await persist(
    task.value,
    notes.value.filter((n) => n.id !== id)
  )
}

async function copyPath(file: string): Promise<void> {
  const err = await copyToClipboard(file)
  if (err) ElMessage.error(t('wsMgr.msgCopyFail'))
  else ElMessage.success(t('wsMgr.msgCopied'))
}

/**
 * Push the current task to running agents: the main process bumps the shared doc's revision and
 * mirrors the task into the memory log. The count is advisory — an agent only acts on it if it
 * tails DSH_WORKSPACE_FILE, which is the contract the panel's hint describes.
 */
async function broadcast(): Promise<void> {
  broadcasting.value = true
  try {
    const r = (await window.container.workspaceBroadcast?.()) as Result<WorkspaceInfo['context']>
    if (!r?.ok || !r.data) throw new Error(r?.error || t('wsMgr.msgBroadcastFail'))
    task.value = r.data.task
    notes.value = [...r.data.notes]
    if (info.value) info.value = { ...info.value, context: r.data }
    ElMessage.success(t('wsMgr.msgBroadcast', { n: runningCount.value }))
  } catch (err) {
    ElMessage.error((err as Error).message || t('wsMgr.msgBroadcastFail'))
  } finally {
    broadcasting.value = false
  }
}

async function toggleMemory(v: boolean): Promise<void> {
  try {
    await settingsStore.patch({ sharedWorkspace: v })
    ElMessage.success(v ? t('wsMgr.msgMemOn') : t('wsMgr.msgMemOff'))
  } catch (err) {
    ElMessage.error((err as Error).message || t('wsMgr.msgSaveFail'))
  }
}

function when(ts: number): string {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ''
  }
}

onMounted(() => {
  void load()
  // Make the running-agent count + the master switch reflect live state even if the panel opens
  // before App's boot refresh lands; both stores are idempotent and already reactive.
  if (!settingsStore.loaded) void settingsStore.load().catch(() => undefined)
  void pagesStore.refresh().catch(() => undefined)
})
</script>

<template>
  <div v-loading="loading && !info" class="ws-manager">
    <div class="ws-top">
      <div class="head neon">
        <div class="ver">
          <b>{{ t('wsMgr.title') }}</b>
          <el-tag size="small" effect="plain" round>{{ t('wsMgr.tag') }}</el-tag>
        </div>
        <div class="head-actions">
          <el-switch
            :model-value="memoryOn"
            size="small"
            :active-text="t('wsMgr.memoryOn')"
            @update:model-value="(v: boolean) => toggleMemory(v)"
          />
          <el-button size="small" text :loading="loading" @click="load">{{
            t('common.refresh')
          }}</el-button>
        </div>
      </div>

      <div v-if="!memoryOn" class="mem-off">{{ t('wsMgr.memoryOffHint') }}</div>

      <div class="ws-hint">{{ t('wsMgr.hint') }}</div>

      <div v-if="info" class="bridge-hint">
        <span>{{ t('wsMgr.dirLabel') }}</span>
        <code>{{ info.dir }}</code>
        <el-button size="small" text type="primary" @click="copyPath(info.file)">
          {{ t('wsMgr.copyPath') }}
        </el-button>
      </div>
    </div>

    <div class="ws-body">
      <section class="block glass-soft">
        <div class="block-title">{{ t('wsMgr.fTask') }}</div>
        <el-input
          v-model="task"
          type="textarea"
          :rows="3"
          :placeholder="t('wsMgr.taskPlaceholder')"
          @blur="() => saveTask()"
        />
        <div class="row-actions">
          <span v-if="revision" class="rev-info">
            {{ t('wsMgr.revision', { n: revision }) }}
            <template v-if="broadcastAt"> · {{ when(Date.parse(broadcastAt)) }}</template>
          </span>
          <el-button size="small" @click="() => saveTask()">
            <el-icon><Edit /></el-icon>
            {{ t('common.save') }}
          </el-button>
          <el-tooltip
            :content="t('wsMgr.broadcastDisabledTip')"
            :disabled="memoryOn && runningCount > 0 && !!task.trim()"
            placement="top"
          >
            <span>
              <el-button
                size="small"
                type="primary"
                :loading="broadcasting"
                :disabled="!memoryOn || runningCount === 0 || !task.trim()"
                @click="broadcast"
              >
                <el-icon><Promotion /></el-icon>
                {{ t('wsMgr.broadcast', { n: runningCount }) }}
              </el-button>
            </span>
          </el-tooltip>
        </div>
      </section>

      <section class="block">
        <div class="block-title">{{ t('wsMgr.notes') }}</div>
        <EmptyState v-if="!notes.length" :description="t('wsMgr.notesEmpty')" tone="muted" />
        <div v-else class="note-list">
          <div v-for="n in notes" :key="n.id" class="note-row glass-soft">
            <div class="note-main">
              <span class="note-author">{{ n.author }}</span>
              <span class="note-ts">{{ when(n.ts) }}</span>
              <span class="spacer" />
              <el-button size="small" text :title="t('wsMgr.delete')" @click="removeNote(n.id)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <div class="note-text">{{ n.text }}</div>
          </div>
        </div>
        <div class="note-add">
          <el-input
            v-model="draft"
            size="small"
            :placeholder="t('wsMgr.notePlaceholder')"
            @keyup.enter="() => addNote()"
          />
          <el-button size="small" type="primary" :loading="saving" @click="() => addNote()">
            <el-icon><Plus /></el-icon>
            {{ t('wsMgr.addNote') }}
          </el-button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ws-manager {
  min-height: 120px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.ver {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.ws-hint {
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.8;
  margin-bottom: 8px;
}
.bridge-hint {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  opacity: 0.85;
  margin-bottom: 12px;
}
.bridge-hint code {
  font-size: 11px;
  word-break: break-all;
}
.block {
  margin-bottom: 14px;
}
.block.glass-soft {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
}
.block-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 6px;
}
.row-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.mem-off {
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-color-warning);
  background: color-mix(in srgb, var(--el-color-warning) 12%, transparent);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  margin-bottom: 8px;
}
.rev-info {
  flex: 1;
  font-size: 11px;
  color: var(--text-dim);
}
.note-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}
.note-row {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
}
.note-main {
  display: flex;
  align-items: center;
  gap: 8px;
}
.note-author {
  font-size: 12px;
  font-weight: 600;
}
.note-ts {
  font-size: 11px;
  color: var(--text-dim);
}
.note-text {
  margin-top: 4px;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}
.spacer {
  flex: 1;
}
.note-add {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
