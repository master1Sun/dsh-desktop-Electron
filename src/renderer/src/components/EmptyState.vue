<script setup lang="ts">
/**
 * One empty/error state for every manager panel, so "nothing here" and "this broke"
 * look the same everywhere. `tone=error` renders dim-red copy; the default muted tone
 * is for plain empties. The default slot carries optional actions (recheck, add…).
 */
const props = defineProps<{
  description: string
  hint?: string
  tone?: 'muted' | 'error'
}>()
</script>

<template>
  <div class="empty-state" :class="`tone-${props.tone || 'muted'}`" role="status">
    <p class="desc">{{ props.description }}</p>
    <code v-if="props.hint" class="hint">{{ props.hint }}</code>
    <div v-if="$slots.default" class="actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px 16px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-dim);
  /* frosted glass chip */
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 12px);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
}
.tone-error .desc {
  color: var(--err);
  opacity: 0.9;
}
.hint {
  font-size: 11.5px;
  color: var(--text-dim);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 8px;
  user-select: all;
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
