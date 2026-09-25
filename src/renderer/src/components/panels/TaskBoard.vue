<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Delete, ArrowRight, ArrowLeft, Check } from '@element-plus/icons-vue'
import { t } from '@renderer/i18n'
import { useSettingsStore } from '@renderer/stores/settings'
import { usePagesStore } from '@renderer/stores/pages'
import DependencyGraph from '@renderer/components/panels/DependencyGraph.vue'
import McpCallFeed from '@renderer/components/panels/McpCallFeed.vue'
import type { WorkspaceContext, WorkspaceInfo, WorkspaceTask, WorkspaceTaskStatus } from '@shared/types'

/**
 * The shared-context task board (the same queue agents drive through workspace_submit/claim/
 * complete). Lifted out of WorkspaceContext so it lives on the 看板 page beside the
 * MCP call feed. Self-contained: it reads the shared doc for the task queue on mount and writes
 * back ONLY the `tasks` field — the main process merges partials (runtime/workspace.ts), so the
 * current task / shared-memory notes stay untouched even though they are edited elsewhere.
 */

interface Result<T> {
  ok: boolean
  data?: T
  error?: string
}

const loading = ref(false)
const saving = ref(false)
const tasks = ref<WorkspaceTask[]>([])
const taskDraft = ref('')

/* Tabs follow the shell layout: the classic host passes no tabPosition → a left rail; the IM/效率
   host (MenuPanelContent via QQShell) forwards 'top' → a centred pill strip. Reuses the global
   `.v-tabs` skin so both orientations stay pixel-consistent with Settings / Pages / Help. */
const props = defineProps<{ tabPosition?: 'left' | 'top' }>()
const activeTab = ref('board')

/* #1 autopilot: the whole dispatch policy — master switch, executor page, concurrency and the
 * prompt template — lives at the top of the board so it can be armed right where the queue is
 * edited. Persisted through the settings store; main kicks a dispatch pass on the change. The
 * settings panel used to mirror these rows and no longer does. */
const settingsStore = useSettingsStore()
const pagesStore = usePagesStore()
const terminalPages = computed(() => pagesStore.pages.filter((p) => p.kind === 'terminal'))
const autopilotEnabled = computed(() => !!settingsStore.settings.autopilotEnabled)
const executorPage = computed(() => settingsStore.settings.autopilotExecutorPage ?? '')
const concurrency = computed(() => settingsStore.settings.autopilotConcurrency ?? 1)

/**
 * The prompt template is free text, so it edits a local draft and persists only on the field's own
 * `change` (blur) — a keystroke must not write the settings store. The watch hands a value changed
 * elsewhere (an agent-driven settings write) back to the draft.
 */
const promptDraft = ref(settingsStore.settings.autopilotPrompt ?? '')
watch(
  () => settingsStore.settings.autopilotPrompt,
  (v) => {
    promptDraft.value = v ?? ''
  }
)

async function patchAutopilot(partial: Parameters<typeof settingsStore.patch>[0]): Promise<void> {
  try {
    await settingsStore.patch(partial)
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

/** Typed so the template's v-for keeps the union for moveTask's argument. */
const BOARD_COLUMNS: Array<{ status: WorkspaceTaskStatus; label: string }> = [
  { status: 'todo', label: 'wsMgr.colTodo' },
  { status: 'doing', label: 'wsMgr.colDoing' },
  { status: 'done', label: 'wsMgr.colDone' }
]

function emptyTask(title: string): WorkspaceTask {
  return {
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    title: title.trim(),
    status: 'todo',
    at: Date.now()
  }
}

/* Board columns: the same queue agents drive through workspace_submit/claim/complete. */
function column(status: WorkspaceTaskStatus): WorkspaceTask[] {
  return tasks.value.filter((x) => x.status === status)
}
/** deps are stored as ids; render them as titles so the board reads without cross-referencing. */
function depTitles(x: WorkspaceTask): string {
  return (x.deps ?? [])
    .map((d) => tasks.value.find((y) => y.id === d)?.title || d)
    .join('、')
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const r = (await window.container.workspaceGet?.()) as Result<WorkspaceInfo>
    if (!r?.ok || !r.data) throw new Error(r?.error || t('wsMgr.msgLoadFail'))
    tasks.value = [...(r.data.context.tasks ?? [])]
  } catch (err) {
    ElMessage.error((err as Error).message || t('wsMgr.msgLoadFail'))
  } finally {
    loading.value = false
  }
}

/** Persist just the queue; unwrap Proxies (IPC can't clone them) and keep task/notes untouched. */
async function persist(next: WorkspaceTask[]): Promise<boolean> {
  saving.value = true
  try {
    const plainTasks = (Array.isArray(next) ? next : []).map((x) => ({ ...toRaw(x) }))
    const r = (await window.container.workspaceSave?.({ tasks: plainTasks })) as Result<
      WorkspaceContext
    >
    if (!r?.ok || !r.data) throw new Error(r?.error || t('wsMgr.msgSaveFail'))
    tasks.value = [...(r.data.tasks ?? [])]
    return true
  } catch (err) {
    ElMessage.error((err as Error).message || t('wsMgr.msgSaveFail'))
    return false
  } finally {
    saving.value = false
  }
}

async function addTask(): Promise<void> {
  const title = taskDraft.value.trim()
  if (!title) return
  if (await persist([...tasks.value, emptyTask(title)])) {
    taskDraft.value = ''
    ElMessage.success(t('wsMgr.msgTaskSaved'))
  }
}

async function moveTask(id: string, status: WorkspaceTaskStatus): Promise<void> {
  const next = tasks.value.map((x) => (x.id === id ? { ...x, status, at: Date.now() } : x))
  await persist(next)
}

async function deleteTask(id: string): Promise<void> {
  await persist(tasks.value.filter((x) => x.id !== id))
}

onMounted(() => {
  void load()
  if (!settingsStore.loaded) void settingsStore.load().catch(() => undefined)
  if (!pagesStore.pages.length) void pagesStore.refresh().catch(() => undefined)
})
</script>

<template>
  <div v-loading="loading && !tasks.length" class="task-board">
    <el-tabs v-model="activeTab" class="v-tabs" :tab-position="props.tabPosition || 'left'">
      <!-- Tab 1: the editable queue, with the #1 autopilot arming controls on top. -->
      <el-tab-pane name="board" :label="t('wsMgr.board')">
        <section class="autopilot-bar glass-soft">
          <div class="ap-row">
            <el-switch
              :model-value="autopilotEnabled"
              @update:model-value="patchAutopilot({ autopilotEnabled: $event as boolean })"
            />
            <span class="ap-label">{{ t('wsMgr.autopilot') }}</span>
            <el-tooltip
              :content="t('wsMgr.autopilotTip')"
              placement="top"
              :show-after="120"
              popper-class="dsh-tip-popper"
            >
              <span class="ap-help">?</span>
            </el-tooltip>
          </div>
          <div class="ap-row">
            <span class="ap-sub">{{ t('wsMgr.autopilotExecutor') }}</span>
            <el-select
              :model-value="executorPage"
              size="small"
              class="ap-exec"
              :placeholder="t('wsMgr.autopilotNoExecutor')"
              @update:model-value="patchAutopilot({ autopilotExecutorPage: $event as string })"
            >
              <el-option v-for="p in terminalPages" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
            <span class="ap-sub">{{ t('wsMgr.autopilotConcurrency') }}</span>
            <el-input-number
              :model-value="concurrency"
              size="small"
              :min="1"
              :max="4"
              controls-position="right"
              class="ap-conc"
              @update:model-value="patchAutopilot({ autopilotConcurrency: Number($event) || 1 })"
            />
          </div>
          <!-- The template handed to the executor; empty falls back to the built-in prompt. -->
          <div class="ap-row">
            <span class="ap-sub">{{ t('wsMgr.autopilotPrompt') }}</span>
            <el-tooltip
              :content="t('wsMgr.autopilotPromptTip')"
              placement="top"
              :show-after="120"
              popper-class="dsh-tip-popper"
            >
              <span class="ap-help">?</span>
            </el-tooltip>
            <el-input
              v-model="promptDraft"
              size="small"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 5 }"
              :placeholder="t('wsMgr.autopilotPromptPlaceholder')"
              class="ap-prompt"
              @change="patchAutopilot({ autopilotPrompt: promptDraft })"
            />
          </div>
          <div v-if="autopilotEnabled && !terminalPages.length" class="ap-warn">
            {{ t('wsMgr.autopilotNeedTerminal') }}
          </div>
        </section>

        <section class="block">
          <div class="board-hint">{{ t('wsMgr.boardHint') }}</div>
          <div class="board-cols">
            <div v-for="col in BOARD_COLUMNS" :key="col.status" class="board-col">
              <div class="col-head">
                <span>{{ t(col.label) }}</span>
                <el-tag size="small" effect="plain" round>{{ column(col.status).length }}</el-tag>
              </div>
              <div v-if="!column(col.status).length" class="col-empty">
                {{ t('wsMgr.boardEmpty') }}
              </div>
              <div v-for="x in column(col.status)" :key="x.id" class="task-card glass-soft">
                <div class="task-title">{{ x.title }}</div>
                <div v-if="x.owner" class="task-meta">
                  {{ t('wsMgr.ownerLabel') }}: {{ x.owner }}
                </div>
                <div v-if="x.deps?.length" class="task-meta">
                  {{ t('wsMgr.depsLabel', { deps: depTitles(x) }) }}
                </div>
                <div v-if="x.result" class="task-meta">
                  {{ t('wsMgr.resultLabel') }}: {{ x.result }}
                </div>
                <div class="task-actions">
                  <el-button
                    v-if="x.status === 'todo'"
                    size="small"
                    text
                    type="primary"
                    @click="moveTask(x.id, 'doing')"
                  >
                    <el-icon><ArrowRight /></el-icon>
                    {{ t('wsMgr.start') }}
                  </el-button>
                  <el-button
                    v-if="x.status === 'doing'"
                    size="small"
                    text
                    type="success"
                    @click="moveTask(x.id, 'done')"
                  >
                    <el-icon><Check /></el-icon>
                    {{ t('wsMgr.finish') }}
                  </el-button>
                  <el-button
                    v-if="x.status !== 'todo'"
                    size="small"
                    text
                    @click="moveTask(x.id, 'todo')"
                  >
                    <el-icon><ArrowLeft /></el-icon>
                    {{ t('wsMgr.reopen') }}
                  </el-button>
                  <span class="spacer" />
                  <el-tooltip
                    :content="t('wsMgr.deleteTask')"
                    placement="top"
                    popper-class="dsh-tip-popper"
                  >
                    <el-button
                      size="small"
                      text
                      :aria-label="t('wsMgr.deleteTask')"
                      @click="deleteTask(x.id)"
                    >
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </el-tooltip>
                </div>
              </div>
            </div>
          </div>
          <div class="note-add">
            <el-input
              v-model="taskDraft"
              size="small"
              :placeholder="t('wsMgr.taskTitlePlaceholder')"
              @keyup.enter="() => addTask()"
            />
            <el-button size="small" type="primary" :loading="saving" @click="() => addTask()">
              <el-icon><Plus /></el-icon>
              {{ t('wsMgr.addTask') }}
            </el-button>
          </div>
        </section>
      </el-tab-pane>

      <!-- Tab 2: #4 dependency topology (boot order for the same queue). -->
      <el-tab-pane name="deps" :label="t('depGraph.title')">
        <DependencyGraph :pages="pagesStore.pages" />
      </el-tab-pane>

      <!-- Tab 3: the MCP hub's live tool-call feed, same 看板 surface. -->
      <el-tab-pane name="calls" :label="t('mcpMgr.callsTitle')">
        <div class="feed-tab">
          <McpCallFeed />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.task-board .block {
  margin-bottom: 14px;
}
/* McpCallFeed ships a top divider for when it is stacked under the board; inside a tab pane the
   tab strip already separates it, so drop that chrome and the now-duplicated title (the tab label
   carries it) while keeping the live call-count / success-rate summary. */
.feed-tab :deep(.call-feed) {
  margin-top: 0;
  border-top: none;
  padding-top: 0;
}
.feed-tab :deep(.call-feed .cf-title) {
  display: none;
}
.autopilot-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.autopilot-bar .ap-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.autopilot-bar .ap-label {
  font-size: 13px;
  font-weight: 600;
}
.autopilot-bar .ap-sub {
  font-size: 12px;
  color: var(--text-dim);
}
.autopilot-bar .ap-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 1px solid var(--border);
  font-size: 10px;
  color: var(--text-dim);
  cursor: help;
}
.autopilot-bar .ap-exec {
  width: 180px;
}
.autopilot-bar .ap-conc {
  width: 96px;
}
/* The prompt takes whatever width its row has left: a free-text template reads better wide, and
   `flex: 1` keeps its left edge aligned with the pickers above (the label + help glyph are fixed). */
.autopilot-bar .ap-prompt {
  flex: 1;
  min-width: 240px;
}
.autopilot-bar .ap-warn {
  font-size: 11px;
  color: var(--el-color-warning);
}
.spacer {
  flex: 1;
}
.note-add {
  display: flex;
  gap: 8px;
  align-items: center;
}
.board-hint {
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-dim);
  margin-bottom: 8px;
}
.board-cols {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 8px;
}
.board-col {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  min-height: 90px;
  background: color-mix(in srgb, var(--el-fill-color) 40%, transparent);
}
.col-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
}
.col-empty {
  font-size: 11px;
  color: var(--text-dim);
  opacity: 0.8;
}
.task-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 8px;
  margin-bottom: 6px;
}
.task-title {
  font-size: 12px;
  font-weight: 600;
  word-break: break-word;
}
.task-meta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-dim);
  word-break: break-word;
}
.task-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 4px;
}
</style>
