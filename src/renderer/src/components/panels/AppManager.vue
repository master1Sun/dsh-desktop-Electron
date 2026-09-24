<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import EmptyState from '@renderer/components/base/EmptyState.vue'
import CustomEnvEditor from '@renderer/components/env/CustomEnvEditor.vue'
import EnvDirChoice from '@renderer/components/env/EnvDirChoice.vue'
import { usePagesStore } from '@renderer/stores/pages'
import { useSettingsStore } from '@renderer/stores/settings'
import { useUpdatesStore } from '@renderer/stores/updates'
import { useEnvDirs } from '@renderer/composables/useEnvDirs'
import type { EnvVarSpec, UpdateCheckResult } from '@shared/types'
import { t } from '@renderer/i18n'

/**
 * Generic management panel for agent apps imported into the container
 * (pages declaring `manageAsApp` in container.json). DSH / OpenClaw keep their
 * dedicated panels; everything else lands here: lifecycle, port, the envVars the
 * manifest declares, and the app's own update row.
 */
const props = defineProps<{ pageId: string }>()

const emit = defineEmits<{
  'open-page': [id: string]
  'open-terminal': [id: string]
}>()

const pagesStore = usePagesStore()
const settingsStore = useSettingsStore()
const updates = useUpdatesStore()

const page = computed(() => pagesStore.pages.find((p) => p.id === props.pageId) || null)
const busy = computed(() => Boolean(pagesStore.busy[props.pageId]))

/* ---- lifecycle ---- */
function toggleRun(): void {
  const p = page.value
  if (!p) return
  const run = p.status === 'running' ? pagesStore.stop(p.id) : pagesStore.start(p.id)
  run.catch((err) => ElMessage.error((err as Error).message))
}

function restart(): void {
  const p = page.value
  if (!p) return
  pagesStore.restart(p.id).catch((err) => ElMessage.error((err as Error).message))
}

/* ---- auto-start at boot (settings.autoStartPages) ---- */
const autoStart = computed({
  get: () => (settingsStore.settings.autoStartPages || []).includes(props.pageId),
  set: (on: boolean) => {
    const cur = settingsStore.settings.autoStartPages || []
    const next = on ? [...cur, props.pageId] : cur.filter((x) => x !== props.pageId)
    settingsStore.patch({ autoStartPages: next }).catch(() => undefined)
  }
})

/* ---- port override (settings.pagePorts via IPC; effective on next start) ---- */
const portDraft = ref('')
watch(
  () => [page.value?.containerPort, page.value?.port] as const,
  ([cp, port]) => {
    portDraft.value = String(cp ?? port ?? '')
  },
  { immediate: true }
)

async function savePort(): Promise<void> {
  const p = page.value
  if (!p) return
  const v = portDraft.value.trim()
  const port = v === '' ? 0 : Number(v)
  if (port === (p.containerPort || 0)) return
  if (v !== '' && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    ElMessage.error(t('pageMgr.msgPortRange'))
    return
  }
  try {
    await pagesStore.setPort(p.id, port)
    ElMessage.success(t('pageMgr.msgConfigSaved'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

/* ---- declared envVars: directory rows are the same click-to-toggle two-choice pill the
   Settings env tab uses (system-common vs <envRoot>/<name>); text rows stay free inputs ---- */
const { refreshEnvRoot, displayPath, installPathFor, choiceValue } = useEnvDirs()
onMounted(refreshEnvRoot)

const envDrafts = reactive<Record<string, string>>({})

watch(
  () => [settingsStore.settings.pageEnvs, page.value?.envVars] as const,
  () => {
    const stored = settingsStore.settings.pageEnvs?.[props.pageId] || {}
    for (const v of page.value?.envVars ?? []) {
      const raw = stored[v.key] || ''
      const val = v.type === 'text' ? raw : choiceValue(raw)
      if (envDrafts[v.key] !== val) envDrafts[v.key] = val
    }
  },
  { immediate: true, deep: true }
)

async function saveEnv(key: string): Promise<void> {
  const p = page.value
  if (!p) return
  const next: Record<string, Record<string, string>> = JSON.parse(
    JSON.stringify(settingsStore.settings.pageEnvs || {})
  )
  next[p.id] = { ...(next[p.id] || {}), [key]: (envDrafts[key] || '').trim() }
  try {
    await settingsStore.patch({ pageEnvs: next })
    ElMessage.success(t('settings.pageEnvSaved'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

/** Resolved paths the EnvDirChoice pill prints for each side of the toggle. */
function systemPathFor(v: EnvVarSpec): string {
  return v.defaultPath ? displayPath(v.defaultPath) : ''
}

/** What a free-form `text` var falls back to — the literal default, or nothing at all
    (buildPageEnv then omits it), which is the only honest reading for an unset flag. */
function envPlaceholder(v: EnvVarSpec): string {
  return v.defaultValue
    ? t('pageMgr.envTextDefault', { v: v.defaultValue })
    : t('pageMgr.envTextPlaceholder')
}

/* ---- B2: the page's free-form KEY=VALUE rows (shared editor, its own save button) ----
   Unlike the dir vars above there is no discrete change event to commit on — a row is only
   finished when the user says so — hence an explicit save instead of @change. */
const customEnvRef = ref<InstanceType<typeof CustomEnvEditor> | null>(null)

async function saveCustomEnv(): Promise<void> {
  const p = page.value
  const editor = customEnvRef.value
  if (!p || !editor) return
  const draft = editor.collect()
  if (!draft.ok) {
    ElMessage.error(draft.message)
    return
  }
  const next: Record<string, Record<string, string>> = JSON.parse(
    JSON.stringify(settingsStore.settings.pageCustomEnvs || {})
  )
  // An emptied row deletes that variable: `KEY: ''` would really inject an empty value.
  if (Object.keys(draft.envs).length) next[p.id] = draft.envs
  else delete next[p.id]
  try {
    await settingsStore.patch({ pageCustomEnvs: next })
    ElMessage.success(t('pageMgr.msgConfigSaved'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

/* ---- update row (from the shared update survey, matched by install dir) ---- */
const updateRow = computed<UpdateCheckResult | null>(
  () => updates.results.find((r) => r.dir === page.value?.dir) ?? null
)
const checking = ref(false)
async function checkUpdate(): Promise<void> {
  checking.value = true
  try {
    await updates.check(true)
  } finally {
    checking.value = false
  }
}

const statusText = computed(() => {
  const p = page.value
  if (!p) return ''
  if (p.status === 'running') return t('menu.running')
  if (p.status === 'starting') return t('menu.starting')
  if (p.status === 'error') return t('menu.failed')
  return t('menu.stopped')
})
const statusClass = computed(() => `st-${page.value?.status || 'stopped'}`)

/* ---- C2: the same page in its own window ---- */
function popout(): void {
  const p = page.value
  if (!p) return
  window.container
    .openPageWindow?.(p.id)
    .then((res) => {
      if (res && !res.ok) ElMessage.error(res.error || t('common.unknownError'))
    })
    .catch((err) => ElMessage.error((err as Error).message))
}

// The survey may not have run yet when the panel first opens — nudge a cached check.
onMounted(() => {
  if (!updates.results.length) updates.check().catch(() => undefined)
})
</script>

<template>
  <div v-if="!page" class="appmgr">
    <EmptyState :description="t('appmgr.notFound')" />
  </div>
  <div v-else class="appmgr">
    <header class="head">
      <div class="head-main">
        <img v-if="page.iconUrl" class="head-icon" :src="page.iconUrl" alt="" />
        <span class="name neon">{{ page.name }}</span>
        <span class="status" :class="statusClass">{{ statusText }}</span>
        <el-tag v-if="(page.crashes || 0) > 0" size="small" type="danger" effect="plain" round>
          {{ t('menu.crashCount', { n: page.crashes || 0 }) }}
        </el-tag>
      </div>
      <p v-if="page.description" class="desc">{{ page.description }}</p>
      <p v-if="page.lastError && page.status === 'error'" class="err-text">{{ page.lastError }}</p>
    </header>

    <section class="blk">
      <div class="blk-title">{{ t('appmgr.secControl') }}</div>
      <div class="btn-row">
        <el-button
          size="small"
          type="primary"
          :disabled="page.status !== 'running'"
          @click="emit('open-page', page.id)"
        >
          {{ t('appmgr.openBtn') }}
        </el-button>
        <el-button
          size="small"
          :loading="busy"
          :type="page.status === 'running' ? 'danger' : 'primary'"
          plain
          @click="toggleRun"
        >
          {{ page.status === 'running' ? t('pageMgr.actionStop') : t('pageMgr.actionStart') }}
        </el-button>
        <el-button size="small" :disabled="busy || page.status !== 'running'" @click="restart">
          {{ t('pageMgr.logRefresh') }}
        </el-button>
        <el-button
          v-if="page.kind === 'terminal' || page.startCommand"
          size="small"
          @click="emit('open-terminal', page.id)"
        >
          {{ t('pageMgr.actionTerminal') }}
        </el-button>
        <!-- C2: the page in its own window; a CLI page starts a second, independent session there. -->
        <el-tooltip
          :content="t('pageMgr.popoutTip')"
          placement="top"
          popper-class="dsh-tip-popper"
        >
          <el-button size="small" @click="popout">
            {{ t('pageMgr.actionPopout') }}
          </el-button>
        </el-tooltip>
      </div>
      <label class="row-switch">
        <el-switch v-model="autoStart" size="small" />
        <span>{{ t('appmgr.autoStart') }}</span>
      </label>
    </section>

    <section v-if="!page.external && page.kind !== 'terminal'" class="blk">
      <div class="blk-title">{{ t('appmgr.secConfig') }}</div>
      <div class="field">
        <span class="label">{{ t('appmgr.portLabel') }}</span>
        <el-input
          v-model="portDraft"
          size="small"
          class="port-input"
          :placeholder="String(page.port || '')"
          @change="savePort"
        />
        <span class="hint">{{ t('appmgr.portHint') }}</span>
      </div>
      <div v-for="v in page.envVars || []" :key="v.key" class="field env">
        <span class="label" :title="v.key">{{ v.label || v.key }}</span>
        <!-- Two choices only, shown as a pair of selectable cards (mirrors the
             Settings env tab and the page config dialog). -->
        <EnvDirChoice
          v-if="v.type !== 'text'"
          v-model="envDrafts[v.key]"
          class="env-input"
          :system-path="systemPathFor(v)"
          :install-path="installPathFor(v.key, pageId)"
          @update:model-value="saveEnv(v.key)"
        />
        <el-input
          v-else
          v-model="envDrafts[v.key]"
          size="small"
          class="env-input"
          :placeholder="envPlaceholder(v)"
          @change="saveEnv(v.key)"
        />
        <span v-if="v.description" class="hint">{{ v.description }}</span>
      </div>
      <CustomEnvEditor ref="customEnvRef" :page-id="pageId" />
      <el-button size="small" @click="saveCustomEnv">{{ t('common.save') }}</el-button>
    </section>

    <section class="blk">
      <div class="blk-title">{{ t('appmgr.secUpdate') }}</div>
      <div v-if="updateRow" class="upd">
        <span class="upd-state" :class="updateRow.ok ? '' : 'err-text'">
          {{
            !updateRow.ok
              ? updateRow.error || t('panel.statusFailed')
              : updateRow.hasUpdate
                ? t('panel.statusHasUpdate')
                : t('panel.statusUpToDate')
          }}
        </span>
        <code v-if="updateRow.currentVersion || updateRow.branch">
          {{ updateRow.branch || `${updateRow.currentVersion} → ${updateRow.latestVersion || '?'}` }}
        </code>
        <el-button size="small" :loading="checking" @click="checkUpdate">
          {{ t('panel.checkUpdates') }}
        </el-button>
        <el-button
          v-if="updateRow.hasUpdate && updateRow.canAutoUpdate"
          size="small"
          type="primary"
          :loading="updates.updating === updateRow.name"
          @click="updates.perform(updateRow)"
        >
          {{ t('panel.updateBtn') }}
        </el-button>
      </div>
      <div v-else class="upd">
        <span class="hint">{{ t('appmgr.updateNoRow') }}</span>
        <el-button size="small" :loading="checking" @click="checkUpdate">
          {{ t('panel.checkUpdates') }}
        </el-button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.appmgr {
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 12.5px;
}

.head .name {
  font-size: 14px;
  font-weight: 650;
}

/* D1: the manifest's own icon when it ships one; the row text needs no shift for it. */
.head-icon {
  width: 22px;
  height: 22px;
  margin-right: 6px;
  vertical-align: -5px;
  object-fit: contain;
  border-radius: 5px;
}

.head .status {
  margin-left: 8px;
  font-size: 11.5px;
}

.head .desc {
  margin: 4px 0 0;
  color: var(--text-dim);
  line-height: 1.6;
}

.head .err-text {
  margin: 4px 0 0;
  color: var(--err);
}

.st-running {
  color: var(--ok);
}
.st-starting {
  color: var(--accent);
}
.st-error {
  color: var(--err);
}
.st-stopped {
  color: var(--text-dim);
}

.blk-title {
  font-weight: 650;
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 8px;
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.row-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-dim);
  cursor: pointer;
}

.field {
  display: grid;
  grid-template-columns: 130px minmax(220px, 1fr);
  align-items: center;
  gap: 4px 10px;
  margin-bottom: 8px;
}

.field.env {
  align-items: start;
}

.field .label {
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.port-input {
  max-width: 140px;
}

.field .hint {
  grid-column: 2;
  font-size: 11.5px;
  color: var(--text-dim);
}

.upd {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.upd code {
  background: var(--glass-chip);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 5px;
  font-size: 11.5px;
}

.err-text {
  color: var(--err);
}

/* Frosted sub-cards for each management section. */
.appmgr .blk {
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 12px);
  -webkit-backdrop-filter: blur(18px) saturate(130%);
  backdrop-filter: blur(18px) saturate(130%);
  padding: 12px 14px;
}
</style>
