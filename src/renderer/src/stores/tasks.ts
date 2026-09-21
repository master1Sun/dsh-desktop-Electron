import { computed, reactive } from 'vue'
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import type { BuiltinKind, UpdateOutcome, UpdateProgress } from '@shared/types'
import { t } from '../i18n'

/**
 * One row in the window-level progress surface. Percent is `null` for an inherently
 * indeterminate step (a git negotiate, a 15-min npm install) so the bar animates as a
 * striped flow instead of stalling at a fake number.
 */
export interface ProgressTask {
  id: string
  /** localized task name (the built-in runtime, the container, "导入项目"…) */
  label: string
  /** 0..100 when computable; null → indeterminate */
  percent: number | null
  /** already-localized detail line shown under the bar */
  message: string
}

/** Clamp a streamed UpdateProgress to a 0..100 integer, or null when not computable. */
function toPercent(p: UpdateProgress): number | null {
  const raw = p.percent ?? (p.total && p.received != null ? (p.received / p.total) * 100 : null)
  if (raw == null || Number.isNaN(raw)) return null
  return Math.max(0, Math.min(100, Math.floor(raw)))
}

/**
 * Aggregates every long-running install/update task that streams progress over IPC, plus the
 * non-streaming built-in runtime installs it brackets itself.
 *
 * It lives at the *window* lifetime (a Pinia store), not the panel that started a task, so a
 * download keeps counting up in the top bar after its panel is closed — the whole point of the
 * feature. Each source keeps its own inline bar inside its panel; this store is purely the
 * always-present roll-up, fed by the same IPC broadcasts, so there is no duplicated button
 * logic — panels stay the only place a task is *started*.
 */
export const useTasksStore = defineStore('tasks', () => {
  const tasks = reactive<Record<string, ProgressTask>>({})

  function upsert(id: string, patch: Omit<ProgressTask, 'id'>): void {
    tasks[id] = { id, ...patch }
  }
  function remove(id: string): void {
    delete tasks[id]
  }

  /* ---- passive subscriptions to the streaming sources (app lifetime, guarded for tests) ---- */

  // Bundled-Node update (帮助 ▸ 内置 Node / first-run gate): name is always 'Node'. The status
  // text is rendered here from the phase (not the main-process string) so it always matches the
  // live UI language, mirroring the import path below.
  window.container?.onNodeUpdateProgress?.((p) => {
    if (p.phase === 'done') remove('node')
    else
      upsert('node', {
        label: t('panel.aboutNode'),
        percent: toPercent(p),
        message: p.phase === 'extract' ? t('topbar.extracting') : t('topbar.downloading')
      })
  })

  // Container self-update: the row id keys off the streamed `name`, but the label is rendered
  // here via the UI dictionary (the only thing on this channel is the container itself) so it
  // follows the live language like every other top-bar string. Built-in dsh / openclaw installs
  // go through installBuiltin below (npm install has no byte progress).
  window.container?.onUpdateProgress?.((p) => {
    const id = 'update:' + p.name
    if (p.phase === 'done') remove(id)
    else
      upsert(id, {
        label: t('app.title'),
        percent: toPercent(p),
        message: p.phase === 'extract' ? t('topbar.writing') : t('topbar.downloading')
      })
  })

  // Page import (git clone / local copy). InstallProgress carries the op + phase enum (localized
  // here in the active UI language) plus the source address and target folder — so the top-bar
  // row names the project being downloaded (label) and where it comes from (message).
  window.container?.onInstallProgress?.((p) => {
    const id = 'import:' + p.op
    if (p.phase === 'done') {
      remove(id)
      return
    }
    const opLabel = p.op === 'git' ? t('topbar.importGit') : t('topbar.importDir')
    const phaseText = t(`pageMgr.installPhase.${p.phase}`)
    upsert(id, {
      label: p.target ? `${opLabel} · ${p.target}` : opLabel,
      percent: p.percent ?? null,
      message: p.source ? `${phaseText} ${p.source}` : phaseText
    })
  })

  const list = computed<ProgressTask[]>(() => Object.values(tasks))
  const active = computed(() => list.value.length > 0)
  /** True while a specific built-in runtime install is in flight — drives the button spinner. */
  const busyBuiltin = (kind: BuiltinKind): boolean => `builtin:${kind}` in tasks

  /**
   * Install/upgrade a built-in agent runtime through the main-process bundled-npm path.
   * Brackets an indeterminate top-bar task (npm has no byte progress) and surfaces the
   * outcome as a toast, so the first-run gate and the 关于与更新 panel share one entry
   * point. Returns the outcome, or `null` when it failed / was already running.
   */
  async function installBuiltin(kind: BuiltinKind): Promise<UpdateOutcome | null> {
    const id = 'builtin:' + kind
    if (tasks[id]) return null
    const label = kind === 'dsh' ? t('topbar.dsh') : t('topbar.openclaw')
    upsert(id, { label, percent: null, message: t('topbar.installing') })
    try {
      const res = await window.container.provisionBuiltin(kind)
      if (!res.ok) throw new Error(res.error || t('common.unknownError'))
      const out = res.data as UpdateOutcome
      if (!out.ok) ElMessage.warning(out.error || t('updates.incomplete', { name: label }))
      else if (out.message) ElMessage.success(out.message)
      else if (out.updated) ElMessage.success(t('updates.updated', { name: label }))
      return out
    } catch (err) {
      ElMessage.error((err as Error).message)
      return null
    } finally {
      remove(id)
    }
  }

  return { tasks, list, active, busyBuiltin, installBuiltin }
})
