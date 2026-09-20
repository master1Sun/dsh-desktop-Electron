<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import EmptyState from './EmptyState.vue'
import { usePagesStore } from '../stores/pages'
import { useSettingsStore } from '../stores/settings'
import { useUpdatesStore } from '../stores/updates'
import type { UpdateCheckResult } from '../../../shared/types'
import { t } from '../i18n'

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

/* ---- declared envVars: one directory input each (settings.pageEnvs) ---- */
const envDrafts = reactive<Record<string, string>>({})

watch(
  () => [settingsStore.settings.pageEnvs, page.value?.envVars] as const,
  () => {
    const stored = settingsStore.settings.pageEnvs?.[props.pageId] || {}
    for (const v of page.value?.envVars ?? []) {
      const val = stored[v.key] || ''
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

async function browseEnv(key: string): Promise<void> {
  const res = await window.container.chooseDirectory().catch(() => null)
  if (!res?.ok || !res.data) return
  envDrafts[key] = String(res.data)
  await saveEnv(key)
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
        <span class="name">{{ page.name }}</span>
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
        <el-input v-model="envDrafts[v.key]" size="small" class="env-input" @change="saveEnv(v.key)">
          <template #append>
            <el-button size="small" @click="browseEnv(v.key)">{{ t('appmgr.browse') }}</el-button>
          </template>
        </el-input>
        <span v-if="v.description" class="hint">{{ v.description }}</span>
      </div>
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
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 5px;
  font-size: 11.5px;
}

.err-text {
  color: var(--err);
}
</style>
