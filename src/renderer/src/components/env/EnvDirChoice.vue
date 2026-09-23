<script setup lang="ts">
import { computed } from 'vue'
import { CircleCheck, SuccessFilled } from '@element-plus/icons-vue'
import { ENV_INSTALL, ENV_SYSTEM } from '@shared/envDir'
import { t } from '@renderer/i18n'

/**
 * One directory row of the two-choice 环境目录 model, rendered as two side-by-side
 * cards instead of a select: 独立目录 (value '@install', its <envRoot>/.<name> subdir — the
 * DEFAULT) and 系统通用目录 (value '@system', the tool's own `~/.name` home). Each card names
 * its choice and prints the concrete path it resolves to; the active card is highlighted
 * (accent border + filled check). Anything other than an explicit '@system' — including a bare
 * '' default — reads as the install choice, so a never-touched row shows 独立目录 selected.
 */
const props = defineProps<{
  /** ENV_INSTALL (default) or ENV_SYSTEM — the persisted sentinel */
  modelValue: string
  /** display path of the system-common choice */
  systemPath: string
  /** display path of the '@install' choice */
  installPath: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const isSystem = computed(() => props.modelValue === ENV_SYSTEM)

interface Card {
  value: string
  label: string
  path: string
}
const cards = computed<Card[]>(() => [
  { value: ENV_INSTALL, label: t('settings.envChoiceInstall'), path: props.installPath },
  { value: ENV_SYSTEM, label: t('settings.envChoiceSystem'), path: props.systemPath }
])

/** The install card owns every non-'@system' value (incl. ''), so it is selected unless system is. */
function isSelected(c: Card): boolean {
  return c.value === ENV_SYSTEM ? isSystem.value : !isSystem.value
}

function select(value: string): void {
  const next = value === ENV_SYSTEM ? ENV_SYSTEM : ENV_INSTALL
  if (next !== props.modelValue) emit('update:modelValue', next)
}
</script>

<template>
  <div class="env-cards">
    <div
      v-for="c in cards"
      :key="c.value"
      class="env-card"
      :class="{ on: isSelected(c) }"
      role="button"
      tabindex="0"
      :aria-pressed="isSelected(c)"
      :title="c.path"
      @click="select(c.value)"
      @keydown.enter.prevent="select(c.value)"
      @keydown.space.prevent="select(c.value)"
    >
      <div class="ec-head">
        <el-icon class="ec-check">
          <SuccessFilled v-if="isSelected(c)" />
          <CircleCheck v-else class="ec-off" />
        </el-icon>
        <span class="ec-label">{{ c.label }}</span>
      </div>
      <div class="ec-path">{{ c.path || '—' }}</div>
    </div>
  </div>
</template>

<style scoped>
/* Two equal-width cards fill the control track; they wrap to a stacked pair when the
   column narrows so long paths never clip. Selected card borrows the settings accent
   language (tinted fill + accent border) so the pick reads at a glance. */
.env-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}
.env-card {
  flex: 1 1 150px;
  min-width: 0;
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--glass-well);
  cursor: pointer;
  user-select: none;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}
.env-card:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
.env-card.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.ec-head {
  display: flex;
  align-items: center;
  gap: 5px;
}
.ec-check {
  font-size: 14px;
  color: var(--accent);
  flex-shrink: 0;
}
.ec-check .ec-off {
  color: var(--text-dim);
}
.ec-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
}
.ec-path {
  margin-top: 3px;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--text-dim);
  word-break: break-all;
}
</style>
