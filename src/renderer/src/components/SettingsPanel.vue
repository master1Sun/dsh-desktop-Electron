<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { usePagesStore } from '../stores/pages'
import { useSettingsStore } from '../stores/settings'
import type { DefaultView } from '../stores/settings'
import type { EnvRootInfo } from '../../../shared/types'
import { t } from '../i18n'

const emit = defineEmits<{
  'apply-theme': [mode: 'auto' | 'light' | 'dark']
  'preview-site': [url: string]
}>()

const pagesStore = usePagesStore()
const settingsStore = useSettingsStore()

/* ---- dynamic per-page directory env config ----
   Pages declare configurable "home" dirs in container.json `envVars`; render one input each. */
interface EnvRow {
  key: string
  label: string
  defaultPath?: string
  description?: string
}
interface EnvSection {
  pageId: string
  pageName: string
  vars: EnvRow[]
}

const envSections = computed<EnvSection[]>(() =>
  pagesStore.pages
    // Only pages the generic AppManager really renders must be skipped here (one entry
    // point per setting). dsh/openclaw default to manageAsApp but live in their own
    // panels WITHOUT env inputs — exclude them and their 环境目录 disappears entirely.
    .filter(
      (p) =>
        !p.external &&
        p.envVars?.length &&
        (!p.manageAsApp || p.kind === 'dsh' || p.kind === 'openclaw')
    )
    .map((p) => ({
      pageId: p.id,
      pageName: p.name,
      vars: (p.envVars ?? []).map((v) => ({
        key: v.key,
        label: v.label || v.key,
        defaultPath: v.defaultPath,
        description: v.description
      }))
    }))
)

const envDrafts = reactive<Record<string, string>>({})
const draftKey = (pageId: string, key: string): string => `${pageId}::${key}`

// Keep drafts synced to persisted values (panel mounts after settings load). The
// getter must not touch envDrafts: tracking them would reset the input on every
// keystroke (draft ≠ stored → watcher writes stored back mid-typing).
watch(
  () => [settingsStore.settings.pageEnvs, envSections.value] as const,
  () => {
    const stored = settingsStore.settings.pageEnvs || {}
    for (const section of envSections.value) {
      for (const row of section.vars) {
        const k = draftKey(section.pageId, row.key)
        const val = stored[section.pageId]?.[row.key] || ''
        if (envDrafts[k] !== val) envDrafts[k] = val
      }
    }
  },
  { immediate: true }
)

/* ---- 环境目录 root ----
   Every runtime's home dir defaults into <envRoot>/<runtime>; the root itself follows
   the install dir unless the user pins one here. */
const envRootInfo = ref<EnvRootInfo | null>(null)
const envRootDraft = ref('')

async function loadEnvRoot(): Promise<void> {
  const res = await window.container.getEnvRoot().catch(() => null)
  if (!res?.ok) return
  envRootInfo.value = res.data as EnvRootInfo
  envRootDraft.value = (envRootInfo.value?.custom ? envRootInfo.value.envRoot : '') || ''
}

/** Show `{envRoot}` placeholders resolved so the user sees where data actually lands. */
function displayPath(p: string): string {
  if (!p) return ''
  return p.replace(
    /\{envRoot\}/g,
    envRootInfo.value?.envRoot || envRootInfo.value?.installDir || t('settings.envDir')
  )
}

async function saveEnvRoot(value: string): Promise<void> {
  await patch({ envRoot: value.trim() }, t('settings.envSavedRestart'))
  await loadEnvRoot()
}

async function browseEnvRoot(): Promise<void> {
  const res = await window.container.chooseDirectory(t('settings.chooseEnvDir')).catch(() => null)
  if (!res?.ok || !res.data) return
  envRootDraft.value = String(res.data)
  await saveEnvRoot(envRootDraft.value)
}

onMounted(loadEnvRoot)

async function savePageEnv(pageId: string, key: string, value: string): Promise<void> {
  const next: Record<string, Record<string, string>> = JSON.parse(
    JSON.stringify(settingsStore.settings.pageEnvs || {})
  )
  next[pageId] = { ...(next[pageId] || {}), [key]: value.trim() }
  await patch({ pageEnvs: next }, t('settings.pageEnvSaved'))
}

function decodeView(v: string): DefaultView {
  if (v.startsWith('page:')) return { kind: 'page', pageId: v.slice(5) }
  if (v.startsWith('ext:')) return { kind: 'external', url: v.slice(4) }
  return { kind: 'none' }
}

/** Pages and external URLs share one select, so the value carries its own kind. */
const viewValue = computed({
  get: () => {
    const dv = settingsStore.settings.defaultView
    if (dv.kind === 'page') return `page:${dv.pageId}`
    if (dv.kind === 'external') return `ext:${dv.url}`
    return 'none'
  },
  set: (v: string) => void patch({ defaultView: decodeView(v) }, t('settings.defaultViewSaved'))
})

const viewOptions = computed(() => {
  type Option = { value: string; label: string; disabled?: boolean }
  const plain: Option[] = [
    { value: 'none', label: t('settings.nonePage') },
    // Not gated on `status === 'running'` anymore: the container now auto-starts the
    // configured default page on launch, so any page can be picked.
    ...pagesStore.pages.map<Option>((p) => ({
      value: `page:${p.id}`,
      label: `${p.name}${p.external ? t('settings.tagExternal') : p.kind === 'dsh' ? t('settings.tagDsh') : p.kind === 'terminal' ? t('settings.tagTerminal') : p.containerPort || p.port ? ` :${p.containerPort || p.port}` : ''}`
    }))
  ]
  return { plain }
})

async function patch(
  partial: Parameters<typeof settingsStore.patch>[0],
  msg = t('settings.saved')
): Promise<void> {
  try {
    await settingsStore.patch(partial)
    ElMessage.success(msg)
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

function onThemeChange(mode: 'auto' | 'light' | 'dark'): void {
  emit('apply-theme', mode)
  patch({ theme: mode }, t('settings.themeSwitched'))
}

/**
 * Switching language persists the choice; App.vue's watcher applies it reactively. No toast on
 * purpose: the whole panel re-renders immediately (self-evident feedback), and a toast raised
 * here would still carry the *previous* language's "saved" text.
 */
function onLocaleChange(next: 'zh' | 'en'): void {
  settingsStore.patch({ locale: next }).catch((err) => ElMessage.error((err as Error).message))
}
</script>

<template>
  <div class="settings-panel">
    <h3>{{ t('settings.interfaceTitle') }}</h3>
    <el-form label-position="left" size="small">
      <el-form-item :label="t('settings.defaultPage')">
        <el-select v-model="viewValue" style="width: 340px">
          <el-option
            v-for="opt in viewOptions.plain"
            :key="opt.value"
            :value="opt.value"
            :label="opt.label"
            :disabled="opt.disabled"
          />
        </el-select>
        <div class="tip">{{ t('settings.defaultPageTip') }}</div>
      </el-form-item>

      <el-form-item :label="t('settings.theme')">
        <el-radio-group
          :model-value="settingsStore.settings.theme"
          @update:model-value="onThemeChange($event as 'auto' | 'light' | 'dark')"
        >
          <el-radio-button value="auto">{{ t('settings.themeAuto') }}</el-radio-button>
          <el-radio-button value="light">{{ t('settings.themeLight') }}</el-radio-button>
          <el-radio-button value="dark">{{ t('settings.themeDark') }}</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item :label="t('settings.language')">
        <el-radio-group
          :model-value="settingsStore.settings.locale"
          @update:model-value="onLocaleChange($event as 'zh' | 'en')"
        >
          <el-radio-button value="zh">{{ t('settings.langZh') }}</el-radio-button>
          <el-radio-button value="en">{{ t('settings.langEn') }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <h3>{{ t('settings.behavior') }}</h3>
    <el-form label-position="left" size="small">
      <el-form-item :label="t('settings.minimizeToTray')">
        <el-switch
          :model-value="settingsStore.settings.minimizeToTray"
          @update:model-value="
            patch(
              { minimizeToTray: $event as boolean },
              $event ? t('settings.minimizeOn') : t('settings.minimizeOff')
            )
          "
        />
        <div class="tip">{{ t('settings.minimizeTip') }}</div>
      </el-form-item>

      <el-form-item :label="t('settings.crashAutoRestart')">
        <el-switch
          :model-value="settingsStore.settings.crashAutoRestart"
          @update:model-value="patch({ crashAutoRestart: $event as boolean })"
        />
        <div class="tip">{{ t('settings.crashAutoRestartTip') }}</div>
      </el-form-item>
    </el-form>

    <h3>{{ t('settings.envDir') }}</h3>
    <el-form label-position="left" size="small">
      <el-form-item :label="t('settings.envRoot')">
        <div class="env-root-row">
          <el-input
            v-model="envRootDraft"
            :placeholder="
              envRootInfo
                ? `${t('settings.envRootFollow')}（${envRootInfo.installDir}/env）`
                : t('settings.envRootFollow')
            "
            style="width: 340px"
            clearable
            @change="saveEnvRoot(String($event || ''))"
          />
          <el-button size="small" @click="browseEnvRoot">{{ t('common.browse') }}</el-button>
        </div>
        <div class="tip">
          {{
            t('settings.envRootTip', {
              root: envRootInfo?.envRoot || t('settings.envRootLoaded'),
              envRoot: '{envRoot}'
            })
          }}
        </div>
      </el-form-item>
    </el-form>

    <template v-if="envSections.length">
      <div v-for="section in envSections" :key="section.pageId" class="env-section">
        <div class="env-page-name">{{ section.pageName }}</div>
        <el-form label-position="left" size="small">
          <el-form-item v-for="row in section.vars" :key="row.key" :label="row.label">
            <el-input
              :model-value="envDrafts[draftKey(section.pageId, row.key)] || ''"
              :placeholder="
                row.defaultPath
                  ? t('settings.envInputPlaceholderDefault', { path: displayPath(row.defaultPath) })
                  : t('settings.envInputPlaceholderEmpty')
              "
              style="width: 340px"
              clearable
              @update:model-value="envDrafts[draftKey(section.pageId, row.key)] = String($event)"
              @change="savePageEnv(section.pageId, row.key, String($event))"
            />
            <div class="tip">
              <template v-if="row.description">{{ row.description }}</template>
              <template v-else>
                {{ t('settings.envInjectPrefix') }} <code>{{ row.key }}</code>
                {{
                  t('settings.envInjectSuffix', {
                    def: row.defaultPath
                      ? t('settings.envInjectDefault', { path: row.defaultPath })
                      : ''
                  })
                }}
              </template>
            </div>
          </el-form-item>
        </el-form>
      </div>
    </template>
    <div v-else class="env-empty">{{ t('settings.envSectionEmpty') }}</div>
  </div>
</template>

<style scoped>
/* One label column shared by every form in this panel. Element Plus only computes
   `label-width="auto"` per <el-form> instance, and this panel has four of them, so
   `auto` would give each section a different width and break the cross-section
   alignment. The column is set here instead, once, as a custom property.

   The value is the old 126px + 40px: 126px was tuned to the Chinese labels, while
   English needs ~162px for the longest one ("External address open mode"); i.e. the
   label must fit on one line, or it would wrap out of its 24px box. */
.settings-panel {
  --settings-label-w: 166px;
}

.settings-panel :deep(.el-form-item__label) {
  width: var(--settings-label-w);
  /* `size="small"` pins the label box to 24px with `line-height:24px`; a longer label
     wraps and drops its second line *outside* that box, on top of the next row's label.
     Letting the box grow keeps such a label readable instead. `align-self` overrides
     Element Plus's default `stretch`, which would stretch the auto-height box to the
     whole row (and centre the text) whenever a multi-line tip makes the row tall. */
  align-self: flex-start;
  height: auto;
  min-height: 24px;
  align-items: center;
  /* A container.json label is user-authored and can be arbitrarily long, so it may still
     have to wrap inside the fixed column; wrapping (and growing the box, above) keeps it
     fully readable instead of letting it run under the input. */
  white-space: normal;
  word-break: break-word;
}

.settings-panel h3 {
  margin: 16px 0 10px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--text-dim);
  letter-spacing: 0.3px;
}

.settings-panel h3:first-child {
  margin-top: 0;
}

.ext-inline {
  width: 100%;
  max-width: 460px;
}

.tip {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.6;
  width: 100%;
}

.tip code {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 5px;
}

.env-section {
  margin-bottom: 6px;
}
.env-root-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.env-page-name {
  font-size: 12.5px;
  font-weight: 650;
  color: var(--text);
  margin: 4px 0 8px;
}
.env-empty {
  font-size: 12.5px;
  color: var(--text-dim);
  line-height: 1.7;
}
.env-empty code {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 5px;
}
</style>
