<script setup lang="ts">
import { computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import { t } from '@renderer/i18n'
import type { PortRow } from '@shared/types'

/**
 * Port / process manager table (帮助 → 端口与进程). Presentational and scoped to this container's
 * own processes: the parent tab owns the header, the filters and the poll (same watch [panel, tab]
 * lifecycle as trend/events) and hands us a fresh snapshot plus the current search / only-issues
 * state; we render the filtered table and bubble up the two actions — jump to an owning page,
 * tree-kill a holder.
 *
 * The kill path is deliberately double-confirmed here and re-guarded in the main process (a row's own
 * pid is refused there too), so a stray "self" row can never drop the container from this table.
 */

const props = defineProps<{
  rows: PortRow[]
  onlyIssues?: boolean
  keyword?: string
}>()

const emit = defineEmits<{
  kill: [row: PortRow]
  'open-page': [pageId: string]
}>()

/** Rows that carry a page link (a running owner, or a declared page behind a conflict/orphan). */
function linkedPage(r: PortRow): string | undefined {
  return r.pageId || r.declaredPageId
}

/** A one-word ownership tag + a hover tip explaining *why*; conflict/orphan are the ones to act on. */
function ownerTag(r: PortRow): {
  text: string
  type: 'success' | 'danger' | 'warning' | 'info'
  tip: string
} {
  if (r.conflict)
    return {
      text: t('ports.conflict'),
      type: 'danger',
      tip: t('ports.tipConflict', { name: r.declaredPageName || '' })
    }
  if (r.orphan) return { text: t('ports.orphan'), type: 'warning', tip: t('ports.tipOrphan') }
  if (r.self) return { text: t('ports.self'), type: 'info', tip: t('ports.tipSelf') }
  if (r.pageId)
    return {
      text: r.pageName || r.pageId,
      type: 'success',
      tip: t('ports.tipPage', { name: r.pageName || r.pageId })
    }
  return { text: t('ports.foreign'), type: 'info', tip: t('ports.tipForeign') }
}

const filtered = computed(() => {
  // Always scoped to the container's own world (hosted pages / self / orphan / conflict / project
  // dir); foreign machine-wide listeners are out of scope for this panel.
  let list = props.rows.filter((r) => r.project)
  if (props.onlyIssues) list = list.filter((r) => r.conflict || r.orphan)
  const k = (props.keyword || '').trim().toLowerCase()
  if (k) {
    list = list.filter(
      (r) =>
        String(r.port).includes(k) ||
        r.address.toLowerCase().includes(k) ||
        r.name.toLowerCase().includes(k) ||
        (r.cmdline || '').toLowerCase().includes(k) ||
        (r.pageName || '').toLowerCase().includes(k) ||
        (r.declaredPageName || '').toLowerCase().includes(k)
    )
  }
  return list
})

function rowClass({ row }: { row: PortRow }): string {
  if (row.conflict) return 'pt-row-conflict'
  if (row.orphan) return 'pt-row-orphan'
  return ''
}

async function askKill(r: PortRow): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('ports.killConfirm', { name: r.name, pid: r.pid, port: r.port }),
      t('ports.killTitle'),
      {
        type: 'warning',
        confirmButtonText: t('ports.killYes'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    return // dismissed
  }
  emit('kill', r)
}
</script>

<template>
  <el-table
    :data="filtered"
    size="small"
    border
    max-height="360"
    class="pt-table"
    :row-class-name="rowClass"
  >
    <el-table-column :label="t('ports.colPort')" width="150">
      <template #default="{ row }">
        <div class="pt-portline">
          <span class="pt-port">{{ row.port }}</span>
          <span class="pt-fam">v{{ row.family }}</span>
        </div>
        <span class="pt-addr">{{ row.address }}</span>
      </template>
    </el-table-column>
    <el-table-column :label="t('ports.colProcess')" min-width="230">
      <template #default="{ row }">
        <div class="pt-proc">
          <span class="pt-name">{{ row.name }}</span>
          <span class="pt-pid">PID {{ row.pid }}</span>
        </div>
        <el-tooltip
          v-if="row.cmdline"
          :content="row.cmdline"
          placement="top"
          :show-after="120"
          popper-class="dsh-tip-popper dsh-cell-tip"
        >
          <div class="pt-cmd">{{ row.cmdline }}</div>
        </el-tooltip>
      </template>
    </el-table-column>
    <el-table-column :label="t('ports.colOwner')" width="140">
      <template #default="{ row }">
        <el-tooltip
          :content="ownerTag(row).tip"
          placement="top"
          :show-after="120"
          popper-class="dsh-tip-popper"
        >
          <el-tag :type="ownerTag(row).type" size="small" effect="light" round>
            {{ ownerTag(row).text }}
          </el-tag>
        </el-tooltip>
        <div v-if="row.conflict && row.declaredPageName" class="pt-decl">
          {{ t('ports.declaredFor', { name: row.declaredPageName }) }}
        </div>
      </template>
    </el-table-column>
    <el-table-column :label="t('ports.colAction')" width="190" align="right">
      <template #default="{ row }">
        <div class="pt-acts">
          <el-button
            v-if="linkedPage(row)"
            size="small"
            text
            type="primary"
            @click="emit('open-page', linkedPage(row) as string)"
          >
            {{ t('ports.openPage') }}
          </el-button>
          <el-button v-if="!row.self" size="small" text type="danger" @click="askKill(row)">
            {{ t('ports.kill') }}
          </el-button>
        </div>
      </template>
    </el-table-column>
    <template #empty>
      <div class="pt-empty">{{ t('ports.empty') }}</div>
    </template>
  </el-table>
</template>

<style scoped>
/* The table sits in the same contained well as the sibling tabs' lists (border + radius + glass
   well), so 端口与进程 reads as one block instead of a bare grid floating in the panel. */
.pt-table {
  overflow: hidden;
  background: var(--glass-well);
  border: 1px solid var(--border);
  border-radius: 8px;
}
/* Port cell: the number is the hero, the family a dim superscript, the raw address a sub-line. */
.pt-portline {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.pt-port {
  font-weight: 650;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.pt-fam {
  font-size: 10px;
  color: var(--text-dim);
}
.pt-addr {
  display: block;
  font-size: 11px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
/* Process cell: name prominent, pid a compact chip, the command line a monospace sub-line. */
.pt-proc {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pt-name {
  overflow: hidden;
  font-weight: 550;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pt-pid {
  flex: none;
  padding: 0 6px;
  font-size: 10.5px;
  color: var(--text-dim);
  background: var(--glass-chip);
  border: 1px solid var(--border);
  border-radius: 6px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.pt-cmd {
  margin-top: 3px;
  overflow: hidden;
  max-width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--text-dim);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pt-decl {
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-dim);
}
.pt-empty {
  padding: 18px 0;
  font-size: 12px;
  color: var(--text-dim);
}
/* Row actions stay on one line: a nowrap flex pair, EP's default inter-button margin reset so the
   gap comes from `gap`. Restyled as quiet pills (same round + --glass-chip skin as the pid chip and
   the round owner tags above) instead of bare text, with the label colour still carrying the intent
   (primary = open, danger = kill). Hover lifts only the wash, from the shared --dsh-wash-hover token. */
.pt-acts {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  white-space: nowrap;
}
.pt-acts :deep(.el-button) {
  margin-left: 0;
  padding: 2px 10px;
  background: var(--glass-chip);
  border: 1px solid var(--border);
  border-radius: 999px;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}
.pt-acts :deep(.el-button:not(.is-disabled)):hover {
  background: var(--dsh-wash-hover);
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
}
/* Actionable rows carry a faint tint (kept on --el-table-tr-bg-color so row hover still wins) plus a
   left accent rail in the same family as the owner tag — pops without a loud full-row fill. */
:deep(.pt-row-conflict) {
  --el-table-tr-bg-color: color-mix(in srgb, var(--err) 8%, transparent);
}
:deep(.pt-row-orphan) {
  --el-table-tr-bg-color: color-mix(in srgb, var(--warn) 10%, transparent);
}
:deep(.pt-row-conflict) td.el-table__cell:first-child {
  box-shadow: inset 3px 0 0 var(--err);
}
:deep(.pt-row-orphan) td.el-table__cell:first-child {
  box-shadow: inset 3px 0 0 var(--warn);
}
</style>
