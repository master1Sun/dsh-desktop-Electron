<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import { useSettingsStore } from '@renderer/stores/settings'
import { t } from '@renderer/i18n'

/**
 * B2: editor for `settings.pageCustomEnvs[pageId]` — free-form KEY=VALUE injected verbatim into
 * one page's child process, deliberately separate from the directories a manifest declares.
 *
 * It owns the rows and their validation but not the write: the hosts commit through their own
 * save path (the Pages config dialog writes port + env + custom vars in one patch, the App panel
 * saves each block on its own), so `collect()` is the contract and `issues` drives the inline text.
 */
const props = defineProps<{ pageId: string }>()

const settingsStore = useSettingsStore()

interface Row {
  key: string
  value: string
}
const rows = ref<Row[]>([])
/** Seeded once per page — re-seeding on every settings write would wipe a half-typed value. */
const seededFor = ref<string | null>(null)

watch(
  () => [props.pageId, settingsStore.loaded] as const,
  ([id, loaded]) => {
    if (!loaded || seededFor.value === id) return
    const stored = settingsStore.settings.pageCustomEnvs?.[id] || {}
    rows.value = Object.entries(stored).map(([key, value]) => ({ key, value: String(value ?? '') }))
    seededFor.value = id
  },
  { immediate: true }
)

/**
 * Mirrors the main-process injection filter (`buildPageEnv`): a name that cannot be a POSIX
 * env var is dropped there, so saying so here is the difference between a typo and a mystery.
 */
function keyBad(key: string): boolean {
  const k = key.trim()
  return !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || k.startsWith('__')
}

const issues = computed(() => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of rows.value) {
    const k = row.key.trim()
    if (!k) continue
    if (keyBad(k)) out.push(t('pageMgr.customEnvKeyBad', { key: k }))
    else if (seen.has(k)) out.push(t('pageMgr.customEnvKeyDup', { key: k }))
    seen.add(k)
  }
  return out
})

interface CustomEnvDraft {
  ok: boolean
  /** the map to persist; empty means "this page has no custom variables" */
  envs: Record<string, string>
  /** first problem to surface when `ok` is false */
  message: string
}

/**
 * The draft to persist, validated. A row with an empty value is dropped, which is how a variable
 * gets deleted: writing `KEY: ''` would really inject an empty value into the child process.
 */
function collect(): CustomEnvDraft {
  if (issues.value.length) {
    return { ok: false, envs: {}, message: issues.value[0] }
  }
  const out: Record<string, string> = {}
  for (const row of rows.value) {
    const k = row.key.trim()
    if (!k || row.value === '') continue
    out[k] = row.value
  }
  return { ok: true, envs: out, message: '' }
}

defineExpose({ collect })
</script>

<template>
  <div class="custom-env">
    <div class="ce-head">
      <span>{{ t('pageMgr.customEnvTitle') }}</span>
      <el-button size="small" text @click="rows.push({ key: '', value: '' })">
        {{ t('pageMgr.customEnvAdd') }}
      </el-button>
    </div>
    <p class="ce-tip">{{ t('pageMgr.customEnvTip') }}</p>
    <div v-for="(row, i) in rows" :key="i" class="ce-row">
      <el-input
        v-model="row.key"
        class="ce-key"
        :class="{ 'is-bad': row.key.trim() && keyBad(row.key) }"
        :placeholder="t('pageMgr.customEnvKey')"
      />
      <el-input v-model="row.value" :placeholder="t('pageMgr.customEnvValue')" />
      <el-button size="small" text type="danger" @click="rows.splice(i, 1)">
        <el-icon><Delete /></el-icon>
      </el-button>
    </div>
    <p v-if="issues.length" class="ce-tip ce-err">{{ issues[0] }}</p>
  </div>
</template>

<style scoped>
.custom-env {
  margin: 6px 0 14px;
}
.ce-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.ce-tip {
  margin: 4px 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-dim);
}
.ce-err {
  color: var(--err);
}
.ce-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}
.ce-key {
  flex: 0 0 190px;
}
/* The `is-bad` class lands on ElInput's own root (fallthrough attrs carry the scope id), but its
   inner wrapper is that component's template — only :deep() reaches it. */
.custom-env :deep(.ce-key.is-bad .el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--err) inset;
}
</style>
