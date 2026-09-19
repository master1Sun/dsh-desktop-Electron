<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { usePagesStore } from '../stores/pages'
import { useSettingsStore } from '../stores/settings'
import type { DefaultView } from '../stores/settings'
import ExternalSitesManager from './ExternalSitesManager.vue'

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
    .filter((p) => !p.external && p.envVars?.length)
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

async function savePageEnv(pageId: string, key: string, value: string): Promise<void> {
  const next: Record<string, Record<string, string>> = JSON.parse(
    JSON.stringify(settingsStore.settings.pageEnvs || {})
  )
  next[pageId] = { ...(next[pageId] || {}), [key]: value.trim() }
  await patch({ pageEnvs: next }, '环境目录已保存，重启该页面生效')
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
  set: (v: string) => void patch({ defaultView: decodeView(v) }, '默认视图已保存')
})

const viewOptions = computed(() => {
  type Option = { value: string; label: string; disabled?: boolean }
  const plain: Option[] = [
    { value: 'none', label: '不打开任何页面（显示欢迎页）' },
    ...pagesStore.pages.map<Option>((p) => ({
      value: `page:${p.id}`,
      label: `${p.name}${p.external ? '（外部）' : p.kind === 'dsh' ? '（DSH）' : p.kind === 'terminal' ? '（终端）' : p.containerPort || p.port ? ` :${p.containerPort || p.port}` : ''}`,
      disabled: !p.external && p.status !== 'running'
    }))
  ]
  const groups: { label: string; options: Option[] }[] = settingsStore.settings.lastExternalUrls
    .length
    ? [
        {
          label: '最近使用的外部地址',
          options: settingsStore.settings.lastExternalUrls.map((u) => ({
            value: `ext:${u}`,
            label: u
          }))
        }
      ]
    : []
  return { plain, groups }
})

async function patch(
  partial: Parameters<typeof settingsStore.patch>[0],
  msg = '已保存'
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
  patch({ theme: mode }, '主题已切换')
}
</script>

<template>
  <div class="settings-panel">
    <h3>界面与默认视图</h3>
    <el-form label-width="126px" label-position="left" size="small">
      <el-form-item label="默认打开页面">
        <el-select v-model="viewValue" style="width: 340px">
          <el-option
            v-for="opt in viewOptions.plain"
            :key="opt.value"
            :value="opt.value"
            :label="opt.label"
            :disabled="opt.disabled"
          />
          <el-option-group v-for="g in viewOptions.groups" :key="g.label" :label="g.label">
            <el-option
              v-for="sub in g.options"
              :key="sub.value"
              :value="sub.value"
              :label="sub.label"
            />
          </el-option-group>
        </el-select>
        <div class="tip">
          未运行的 DSH 页面会由容器按需自动启动，普通 page 请先在「Pages」菜单中运行。
        </div>
      </el-form-item>

      <el-form-item label="外部地址">
        <ExternalSitesManager class="ext-inline" @preview="emit('preview-site', $event)" />
      </el-form-item>

      <el-form-item label="外部地址打开方式">
        <el-radio-group
          :model-value="settingsStore.settings.openExternalIn"
          @update:model-value="patch({ openExternalIn: $event as 'embedded' | 'system-browser' })"
        >
          <el-radio-button value="embedded">容器内嵌显示</el-radio-button>
          <el-radio-button value="system-browser">系统默认浏览器</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="主题">
        <el-radio-group
          :model-value="settingsStore.settings.theme"
          @update:model-value="onThemeChange($event as 'auto' | 'light' | 'dark')"
        >
          <el-radio-button value="auto">跟随系统</el-radio-button>
          <el-radio-button value="light">亮色</el-radio-button>
          <el-radio-button value="dark">暗色</el-radio-button>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <h3>行为</h3>
    <el-form label-width="126px" label-position="left" size="small">
      <el-form-item label="最小化到任务栏">
        <el-switch
          :model-value="settingsStore.settings.minimizeToTray"
          @update:model-value="
            patch(
              { minimizeToTray: $event as boolean },
              $event ? '关闭主窗口将隐藏到任务栏托盘，node 进程继续运行' : '关闭主窗口即退出容器'
            )
          "
        />
        <div class="tip">
          开启后点 ✕ 不退出程序，托盘菜单可恢复窗口或彻底退出（退出会停止所有 node 进程）。
        </div>
      </el-form-item>
    </el-form>

    <h3>环境目录</h3>
    <template v-if="envSections.length">
      <div v-for="section in envSections" :key="section.pageId" class="env-section">
        <div class="env-page-name">{{ section.pageName }}</div>
        <el-form label-width="126px" label-position="left" size="small">
          <el-form-item v-for="row in section.vars" :key="row.key" :label="row.label">
            <el-input
              :model-value="envDrafts[draftKey(section.pageId, row.key)] || ''"
              :placeholder="
                row.defaultPath
                  ? `留空使用默认 ${row.defaultPath}；填任意路径切换（~ 会展开）`
                  : '留空则不注入该变量'
              "
              style="width: 340px"
              clearable
              @update:model-value="envDrafts[draftKey(section.pageId, row.key)] = String($event)"
              @change="savePageEnv(section.pageId, row.key, String($event))"
            />
            <div class="tip">
              <template v-if="row.description">{{ row.description }}</template>
              <template v-else>
                以环境变量 <code>{{ row.key }}</code> 注入该页面子进程{{
                  row.defaultPath ? `，默认 ${row.defaultPath}` : ''
                }}。改动后重启该页面生效。
              </template>
            </div>
          </el-form-item>
        </el-form>
      </div>
    </template>
    <div v-else class="env-empty">
      当前没有可配置的环境目录。导入一个 node
      项目后，它的安装目录会自动出现在这里成为可配置项；也可在
      <code>container.json</code> 里声明更多 <code>envVars</code>（如
      <code>{ "key": "MYAPP_HOME", "label": "数据目录", "defaultPath": "~/.myapp" }</code
      >）追加自定义目录。
    </div>
  </div>
</template>

<style scoped>
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
