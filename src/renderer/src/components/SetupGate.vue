<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { usePagesStore } from '../stores/pages'
import { useUpdatesStore } from '../stores/updates'
import { useTasksStore } from '../stores/tasks'
import { NODE_VERSION_REQUIRED, type IpcResult, type NodeVersionInfo } from '@shared/types'
import { t } from '../i18n'

/**
 * First-run dependency gate.
 *
 * The bundled Node is the only hard prerequisite: until it is present, DSH / OpenClaw cannot be
 * provisioned (their install shells out to the bundled npm), so those rows stay disabled. DSH /
 * OpenClaw are then *optional here* — the user can install them right away or dismiss and do it
 * later from 帮助 ▸ 关于与更新. A missing Node keeps the overlay up (no "later"): nothing works
 * without it. Progress for every action also surfaces in the persistent top bar (see stores/
 * tasks), so leaving this panel never hides an in-flight install.
 */
const pages = usePagesStore()
const updates = useUpdatesStore()
const tasks = useTasksStore()

const DISMISS_KEY = 'dsh.setupGate.dismissed'

const state = reactive({ checked: false, dshOk: false, openclawOk: false })
const nodeVersions = ref<NodeVersionInfo[]>([])
const nodeSel = ref('')
const nodeLoading = ref(false)
const nodeError = ref('')
const dismissed = ref(localStorage.getItem(DISMISS_KEY) === '1')

const nodeOk = computed(() => pages.nodeInfo.ok)
const anyMissing = computed(() => !nodeOk.value || !state.dshOk || !state.openclawOk)
/** Blocking = no Node: the overlay cannot be dismissed until it is installed. */
const blocking = computed(() => !nodeOk.value)
const visible = computed(() => state.checked && anyMissing.value && (blocking.value || !dismissed.value))
const allReady = computed(() => nodeOk.value && state.dshOk && state.openclawOk)

const nodeVersionLabel = (v: NodeVersionInfo): string =>
  v.lts ? `${v.version} · LTS ${typeof v.lts === 'string' ? v.lts : ''}`.trim() : v.version

async function loadNodeVersions(): Promise<void> {
  if (nodeLoading.value) return
  nodeLoading.value = true
  nodeError.value = ''
  try {
    const res = (await window.container.nodeListVersions?.()) as IpcResult | null
    if (res?.ok) {
      nodeVersions.value = (res.data as NodeVersionInfo[]) || []
      if (!nodeVersions.value.length) nodeError.value = t('panel.nodeVerEmpty')
      else
        nodeSel.value =
          nodeVersions.value.find((v) => v.version === NODE_VERSION_REQUIRED)?.version ||
          nodeVersions.value[0].version
    } else nodeError.value = res?.error || t('panel.nodeVerEmpty')
  } catch (err) {
    nodeError.value = (err as Error).message
  } finally {
    nodeLoading.value = false
  }
}

async function checkRuntimes(): Promise<void> {
  const [dsh, oc] = await Promise.all([
    window.container.dshStatus().catch(() => null),
    window.container.openclawStatus().catch(() => null)
  ])
  state.dshOk = Boolean(dsh?.ok && (dsh.data as { installed?: boolean })?.installed)
  state.openclawOk = Boolean(oc?.ok && (oc.data as { installed?: boolean })?.installed)
  state.checked = true
}

async function doNodeInstall(): Promise<void> {
  if (!nodeSel.value || updates.nodeBusy) return
  try {
    await updates.updateNode(nodeSel.value)
    await pages.refresh().catch(() => undefined)
    ElMessage.success(t('panel.nodeUpdated', { v: nodeSel.value }))
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

async function doInstallBuiltin(kind: 'dsh' | 'openclaw'): Promise<void> {
  const out = await tasks.installBuiltin(kind)
  if (out?.updated) await checkRuntimes()
}

function dismiss(): void {
  localStorage.setItem(DISMISS_KEY, '1')
  dismissed.value = true
}

// Side effects are deferred until Node's state is actually known (the store's initial
// `ok:false` just means "not loaded yet"). A dismissed gate with a healthy Node never
// renders, so it must not spend the dsh/openclaw status IPCs nor the network-hungry
// Node version-index fetch on every launch.
watch(
  () => [pages.nodeInfoLoaded, dismissed.value] as const,
  ([loaded, dis]) => {
    if (!loaded) return
    if (dis && pages.nodeInfo.ok) {
      state.checked = true // nothing left to gate — never show the overlay
      return
    }
    if (!state.checked) void checkRuntimes()
    if (!nodeOk.value && !nodeVersions.value.length) void loadNodeVersions()
  },
  { immediate: true }
)

// Once a Node install lands, nodeInfo.ok flips — re-probe the agent runtimes to refresh the tags.
watch(
  () => pages.nodeInfo.ok,
  (ok) => {
    if (ok) void checkRuntimes()
  }
)

const nodeProgress = computed(() => updates.nodeProgress)
</script>

<template>
  <div v-if="visible" class="setup-gate">
    <div class="sg-card" role="dialog" aria-modal="true" :aria-label="t('setup.title')">
      <div class="sg-head">
        <h2>{{ t('setup.title') }}</h2>
        <p class="sg-intro">{{ t('setup.intro') }}</p>
      </div>

      <!-- 1. Built-in Node — the only hard prerequisite. -->
      <section class="sg-row">
        <div class="sg-row-head">
          <span class="sg-step">1</span>
          <span class="sg-name">{{ t('panel.aboutNode') }}</span>
          <el-tag v-if="nodeOk" size="small" type="success" effect="plain" round>
            {{ pages.nodeInfo.version || t('setup.installedTag') }}
          </el-tag>
          <el-tag v-else size="small" type="danger" effect="plain" round>
            {{ t('setup.missingTag') }}
          </el-tag>
        </div>
        <div v-if="!nodeOk" class="sg-actions">
          <el-select
            v-model="nodeSel"
            size="small"
            :placeholder="t('panel.nodeVersionPick')"
            :loading="nodeLoading"
            :disabled="updates.nodeBusy"
            style="width: 210px"
          >
            <el-option
              v-for="v in nodeVersions"
              :key="v.version"
              :label="nodeVersionLabel(v)"
              :value="v.version"
            />
          </el-select>
          <el-button
            size="small"
            type="primary"
            :disabled="!nodeSel"
            :loading="updates.nodeBusy"
            @click="doNodeInstall"
          >
            {{ t('panel.installBtn') }}
          </el-button>
          <el-button v-if="nodeError" size="small" text :loading="nodeLoading" @click="loadNodeVersions">
            {{ t('panel.retry') }}
          </el-button>
        </div>
        <p v-if="!nodeOk && nodeError" class="sg-err">{{ nodeError }}</p>
        <div v-if="nodeProgress" class="sg-prog">
          <el-progress
            :percentage="nodeProgress.percent ?? 0"
            :stroke-width="6"
            :show-text="false"
            :indeterminate="nodeProgress.phase === 'extract' || (nodeProgress.percent ?? 0) === 0"
            striped
            :striped-flow="true"
          />
          <span class="sg-prog-msg">{{ nodeProgress.message }}</span>
        </div>
      </section>

      <p v-if="!nodeOk" class="sg-note">{{ t('setup.nodeRequired') }}</p>
      <el-divider v-else />

      <!-- 2/3. DSH & OpenClaw — optional here, installable any time from 关于与更新. -->
      <section class="sg-row" :class="{ 'is-locked': !nodeOk }">
        <div class="sg-row-head">
          <span class="sg-step">2</span>
          <span class="sg-name">{{ t('topbar.dsh') }}</span>
          <el-tag v-if="state.dshOk" size="small" type="success" effect="plain" round>
            {{ t('setup.installedTag') }}
          </el-tag>
          <el-tag v-else size="small" type="info" effect="plain" round>
            {{ t('setup.missingTag') }}
          </el-tag>
        </div>
        <div class="sg-actions">
          <el-button
            size="small"
            :disabled="!nodeOk"
            :loading="tasks.busyBuiltin('dsh')"
            @click="doInstallBuiltin('dsh')"
          >
            {{ t('setup.installBtn') }}
          </el-button>
        </div>
      </section>

      <section class="sg-row" :class="{ 'is-locked': !nodeOk }">
        <div class="sg-row-head">
          <span class="sg-step">3</span>
          <span class="sg-name">{{ t('topbar.openclaw') }}</span>
          <el-tag v-if="state.openclawOk" size="small" type="success" effect="plain" round>
            {{ t('setup.installedTag') }}
          </el-tag>
          <el-tag v-else size="small" type="info" effect="plain" round>
            {{ t('setup.missingTag') }}
          </el-tag>
        </div>
        <div class="sg-actions">
          <el-button
            size="small"
            :disabled="!nodeOk"
            :loading="tasks.busyBuiltin('openclaw')"
            @click="doInstallBuiltin('openclaw')"
          >
            {{ t('setup.installBtn') }}
          </el-button>
        </div>
      </section>

      <div class="sg-foot">
        <span class="sg-hint">{{ t('setup.laterHint') }}</span>
        <el-button v-if="!blocking" type="primary" size="small" @click="dismiss">
          {{ allReady ? t('setup.enter') : t('setup.later') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.setup-gate {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
}

.sg-card {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow);
  padding: 18px 20px 16px;
}

.sg-head h2 {
  margin: 0 0 6px;
  font-size: 16px;
}
.sg-intro {
  margin: 0 0 12px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-dim);
}

.sg-row {
  margin: 10px 0;
}
.sg-row.is-locked {
  opacity: 0.6;
}
.sg-row-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sg-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-dim);
  flex: none;
}
.sg-name {
  font-weight: 655;
  font-size: 13px;
}
.sg-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 0 26px;
}
.sg-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--warn);
}
.sg-err {
  margin: 6px 0 0 26px;
  font-size: 12px;
  color: var(--err);
}
.sg-prog {
  margin: 8px 0 0 26px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.sg-prog-msg {
  font-size: 12px;
  color: var(--text-dim);
}
.sg-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.sg-hint {
  font-size: 12px;
  color: var(--text-dim);
}
</style>
