<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { Moon, Refresh, Sunny } from '@element-plus/icons-vue'
import whaleIcon from '../assets/whale.png'
import type { PageState } from '../stores/pages'
import type { ExternalSite } from '../../../shared/types'

export type PanelKind =
  'view' | 'pages' | 'external' | 'dsh' | 'openclaw' | 'updates' | 'about' | 'apps'

const props = defineProps<{
  current: PanelKind | null
  runningCount: number
  totalCount: number
  outdatedCount: number
  isDark: boolean
  themeMode: 'auto' | 'light' | 'dark'
  pages: PageState[]
  activePageId: string | null
  switcherTitle: string
  isMaximized: boolean
  canOperate: boolean
  terminalMode: boolean
  externalSites: ExternalSite[]
}>()

const emit = defineEmits<{
  open: [panel: PanelKind | null]
  'open-panel': [panel: PanelKind]
  'toggle-theme': []
  'select-page': [id: string]
  'open-terminal': [id: string]
  'preview-site': [id: string]
  manage: []
  reload: []
  inspect: []
  detach: []
  'restart-terminal': []
}>()

const themeLabel = computed(
  () => ({ auto: '跟随系统', light: '浅色', dark: '深色' })[props.themeMode]
)

/** A group entry either previews/starts something (acts immediately) or opens its panel. */
interface MenuItem {
  id: string
  title: string
  sub?: string
  kind?: 'status' | 'ok' | 'err' | 'warn'
  disabled?: boolean
  run?: () => void
  /** Set = the row opens that group's floating panel (used by the 应用 list). */
  panel?: PanelKind
}

interface MenuGroup {
  kind: PanelKind
  label: string
  badge?: string
  /** Quick-access rows shown in the dropdown (running pages, external sites…). */
  items: MenuItem[]
  /** Static command rows shown above the dynamic item list (e.g. view actions). */
  actions?: MenuItem[]
  /** Opens a divider before this group: starts the app section. */
  sepBefore?: 'runtime'
}

/** Traffic-light / status labels in Chinese for tooltips. */
const statusText = (s: string): string =>
  ({ running: '运行中', starting: '启动中', error: '启动失败', stopped: '已停止' })[s] || s

/** Terminal-kind pages start their own CLI in the full-surface terminal, not the webview. */
const pickPage =
  (p: PageState): (() => void) =>
  () =>
    p.kind === 'terminal' ? emit('open-terminal', p.id) : emit('select-page', p.id)

const groups = computed<MenuGroup[]>(() => {
  const running = props.pages.filter((p) => p.status === 'running' && !p.external)
  return [
    // ── 视图/页面内容 ──
    {
      kind: 'view',
      label: '视图',
      items: [],
      actions: [
        {
          id: 'reload',
          title: '刷新当前页',
          disabled: !props.canOperate,
          run: () => emit('reload')
        },
        {
          id: 'inspect',
          title: '调试当前页 (DevTools)',
          disabled: !props.canOperate,
          run: () => emit('inspect')
        }
      ]
    },
    {
      kind: 'pages',
      label: '页面',
      items: running.map((p) => ({
        id: p.id,
        title: p.name,
        sub: `${p.port}`,
        kind: 'ok' as const,
        run: pickPage(p)
      }))
    },
    {
      kind: 'apps',
      label: '应用',
      items: [
        ...props.externalSites.map((s) => ({
          id: s.id,
          title: s.name,
          run: () => emit('preview-site', s.id)
        })),
        { id: 'external', title: '外部地址…', panel: 'external' as const },
        { id: 'dsh', title: 'DSH', panel: 'dsh' as const },
        { id: 'openclaw', title: 'OpenClaw', panel: 'openclaw' as const }
      ]
    },
    // ── 应用 ──
    {
      kind: 'updates',
      label: '更新',
      badge: props.outdatedCount ? String(props.outdatedCount) : '',
      items: [],
      sepBefore: 'runtime'
    },
    { kind: 'about', label: '关于', items: [] }
  ]
})

/* ---- dropdowns (page switcher + group item lists). Only THESE dismiss on click-away;
       the floating panels carry a ✕ and Esc closes them too. ---- */
/** Groups whose drop list opens other groups' panels: highlight the parent while any child shows. */
const childKinds: Partial<Record<PanelKind, PanelKind[]>> = {
  apps: ['external', 'dsh', 'openclaw']
}

function isActive(g: MenuGroup): boolean {
  const cur = props.current
  return cur !== null && (cur === g.kind || (childKinds[g.kind]?.includes(cur) ?? false))
}

const openDropdown = ref<'switcher' | 'menu' | null>(null)
/** Which group's item list is currently shown (independent of the open panel). */
const listGroup = ref<PanelKind | null>(null)
const anchorEl = ref<HTMLElement | null>(null)

function toggleSwitcher(ev: MouseEvent): void {
  const el = ev.currentTarget as HTMLElement
  if (openDropdown.value === 'switcher') return closeDropdowns()
  openDropdown.value = 'switcher'
  anchorEl.value = el
  emit('open', null) // one floating surface at a time
}

function toggleMenu(group: MenuGroup, ev: MouseEvent): void {
  const el = ev.currentTarget as HTMLElement
  if (group.items.length || group.actions?.length) {
    // Panel and drop list are mutually exclusive: clicking a trigger whose panel is
    // up swaps to its quick-action list; otherwise the click shows the list ('apps',
    // which has no panel of its own) or opens the panel.
    const showsList =
      (props.current === group.kind && !listGroup.value) ||
      (group.kind === 'apps' && !listGroup.value)
    if (showsList) {
      openDropdown.value = 'menu'
      listGroup.value = group.kind
      anchorEl.value = el
      return
    }
    if (listGroup.value === group.kind) {
      // Re-click while the list shows: peel it (panel, if any, surfaces again).
      closeDropdowns()
      return
    }
    closeDropdowns()
    if (props.current === group.kind) emit('open', null)
    else if (group.kind !== 'apps') emit('open', group.kind) // 'apps' has no panel — click just shows the list
    return
  }
  if (props.current === group.kind) emit('open', null)
  else {
    openDropdown.value = null
    listGroup.value = null
    anchorEl.value = null
    emit('open', group.kind)
  }
}

function runItem(item: MenuItem): void {
  closeDropdowns()
  if (item.panel) emit('open-panel', item.panel)
  else item.run?.()
}

function closeDropdowns(): void {
  openDropdown.value = null
  listGroup.value = null
  anchorEl.value = null
}

/** Capture phase, so a trigger's own re-click toggles before this sees the mousedown. */
function onDocumentMousedown(ev: MouseEvent): void {
  if (!openDropdown.value) return
  const target = ev.target as Node
  if (anchorEl.value?.contains(target)) return
  if ((target as HTMLElement)?.closest?.('.dropdown')) return
  closeDropdowns()
}

/** Esc peels the topmost surface: drop list first; App.vue closes the panel. */
function onDocumentKeydown(ev: KeyboardEvent): void {
  if (ev.key === 'Escape' && openDropdown.value) closeDropdowns()
}

document.addEventListener('mousedown', onDocumentMousedown, true)
document.addEventListener('keydown', onDocumentKeydown)
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMousedown, true)
  document.removeEventListener('keydown', onDocumentKeydown)
})

async function minimize(): Promise<void> {
  await window.container.minimizeWindow().catch(() => undefined)
}
async function maximize(): Promise<void> {
  await window.container.toggleMaximize().catch(() => undefined)
}
async function close(): Promise<void> {
  await window.container.closeWindow().catch(() => undefined)
}
</script>

<template>
  <header class="menubar">
    <div class="brand">
      <img class="logo" :src="whaleIcon" alt="" draggable="false" />
      <span class="title">Desktop Container</span>
      <span class="running-badge" :title="`${props.runningCount} / ${props.totalCount} 运行中`">
        {{ props.runningCount }}/{{ props.totalCount }}
      </span>
    </div>

    <div class="switcher-wrap">
      <button
        class="switcher"
        :class="{ open: openDropdown === 'switcher' }"
        @click="toggleSwitcher"
      >
        <span class="switcher-title">{{ props.switcherTitle }}</span>
        <span class="caret">▾</span>
      </button>
      <div v-if="openDropdown === 'switcher'" class="dropdown switcher-menu">
        <button
          v-for="p in props.pages"
          :key="p.id"
          class="drop-item"
          :class="{ active: p.id === props.activePageId }"
          @click="
            () => {
              closeDropdowns()
              pickPage(p)()
            }
          "
        >
          <span>{{ p.name }}</span>
          <!-- Traffic light: running=green, error=red, starting=amber, stopped=grey. -->
          <i class="status-dot" :class="`dot-${p.status}`" :title="statusText(p.status)" />
        </button>
        <div v-if="!props.pages.length" class="drop-empty">暂无页面，打开「页面」面板安装</div>
      </div>
    </div>

    <nav class="groups">
      <template v-for="g in groups" :key="g.kind">
        <span v-if="g.sepBefore" class="group-sep" />
        <div class="group-wrap">
          <button
            class="group-trigger"
            :class="{ active: isActive(g) }"
            @click="toggleMenu(g, $event)"
          >
            {{ g.label }}
            <span v-if="g.badge" class="badge">{{ g.badge }}</span>
          </button>
          <div
            v-if="
              openDropdown === 'menu' &&
              listGroup === g.kind &&
              (g.items.length || g.actions?.length)
            "
            class="dropdown drop-list"
          >
            <button
              v-for="a in g.actions || []"
              :key="a.id"
              class="drop-item"
              :disabled="a.disabled"
              @click="runItem(a)"
            >
              {{ a.title }}
            </button>
            <div v-if="g.actions?.length && g.items.length" class="drop-sep" />
            <button v-for="it in g.items" :key="it.id" class="drop-item" @click="runItem(it)">
              <span>{{ it.title }}</span>
              <small v-if="it.sub" :class="it.kind ? `st-${it.kind}` : ''">{{ it.sub }}</small>
            </button>
          </div>
        </div>
      </template>
    </nav>

    <div class="spacer" />

    <div v-if="props.terminalMode" class="webview-actions">
      <button class="act-btn" title="重启终端会话" @click="emit('restart-terminal')">
        <el-icon><Refresh /></el-icon>
      </button>
    </div>

    <div class="window-controls">
      <button v-if="props.canOperate" class="win-btn" title="刷新当前页" @click="emit('reload')">
        <el-icon><Refresh /></el-icon>
      </button>
      <button
        class="win-btn theme-toggle"
        :title="`主题：${themeLabel}（点击切换 白天/黑夜）`"
        @click="emit('toggle-theme')"
      >
        <el-icon><Sunny v-if="props.isDark" /><Moon v-else /></el-icon>
      </button>
      <button
        v-if="props.canOperate"
        class="win-btn"
        title="部分功能（弹窗、剪贴板、原生对话框等）在内嵌视图里受限，用系统浏览器打开当前页面"
        @click="emit('detach')"
      >
        <svg width="11" height="11" viewBox="0 0 11 11">
          <path
            d="M4.5 1.5 H1.5 V9.5 H9.5 V6.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
          />
          <path
            d="M6 1.5 H9.5 V5 M9.5 1.5 L5 6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
          />
        </svg>
      </button>
      <button class="win-btn" title="最小化" @click="minimize">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>
      <button class="win-btn" :title="props.isMaximized ? '还原' : '最大化'" @click="maximize">
        <svg v-if="!props.isMaximized" width="10" height="10" viewBox="0 0 10 10">
          <rect
            x="1.5"
            y="1.5"
            width="7"
            height="7"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
          />
        </svg>
        <svg v-else width="10" height="10" viewBox="0 0 10 10">
          <rect
            x="1"
            y="3"
            width="6"
            height="6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
          />
          <path d="M3 3 V1 H9 V7 H7" fill="none" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>
      <button class="win-btn close" title="关闭（隐藏到托盘）" @click="close">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>
    </div>

    <!-- Floating panels anchored under their trigger; they close via ✕ / Esc / re-click, never click-away. -->
    <div v-if="props.current && !listGroup" class="panel-anchor">
      <div class="panel-card">
        <div class="panel-head">
          <span class="panel-title">{{ groups.find((g) => g.kind === props.current)?.label }}</span>
          <button class="panel-close" title="关闭 (Esc)" @click="emit('open', null)">✕</button>
        </div>
        <div class="panel-body">
          <slot v-if="props.current === 'view'" name="view" />
          <slot v-else-if="props.current === 'pages'" name="pages" />
          <slot v-else-if="props.current === 'external'" name="external" />
          <slot v-else-if="props.current === 'dsh'" name="dsh" />
          <slot v-else-if="props.current === 'openclaw'" name="openclaw" />
          <slot v-else-if="props.current === 'updates'" name="updates" />
          <slot v-else-if="props.current === 'about'" name="about" />
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.menubar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  flex: none;
  padding: 0 4px 0 10px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
  user-select: none;
  z-index: 60;
}

.menubar button,
.menubar .dropdown,
.menubar .panel-anchor {
  -webkit-app-region: no-drag;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.group-sep {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 6px;
  flex: none;
}

.logo {
  width: 16px;
  height: 16px;
  object-fit: contain;
  flex: none;
  user-select: none;
}

.title {
  font-size: 12.5px;
  font-weight: 650;
  color: var(--text-dim);
  white-space: nowrap;
}

.running-badge {
  font-size: 11px;
  color: var(--text-dim);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0 8px;
  line-height: 17px;
}

.switcher-wrap,
.group-wrap {
  position: relative;
}

.switcher {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 12.5px;
  padding: 3px 10px;
  cursor: pointer;
}

.switcher.open,
.group-trigger.active {
  border-color: var(--accent);
}

.switcher-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.caret {
  font-size: 10px;
  color: var(--text-dim);
}

.groups {
  display: flex;
  align-items: center;
  gap: 2px;
}

.group-trigger {
  position: relative;
  background: none;
  border: 1px solid transparent;
  border-radius: 7px;
  color: var(--text);
  font-size: 12.5px;
  padding: 3px 10px;
  cursor: pointer;
}

.group-trigger:hover {
  background: var(--surface-2);
}

.badge {
  margin-left: 4px;
  font-size: 10.5px;
  background: var(--warn);
  color: #1b1400;
  border-radius: 999px;
  padding: 0 5px;
  line-height: 15px;
}

.spacer {
  flex: 1;
}

.webview-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-right: 6px;
}

.act-btn {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid transparent;
  border-radius: 7px;
  color: var(--text);
  cursor: pointer;
  font-size: 13px;
}

.act-btn:hover:not(:disabled) {
  background: var(--surface-2);
}

.act-btn:disabled {
  color: var(--text-dim);
  opacity: 0.55;
  cursor: not-allowed;
}

.window-controls {
  display: flex;
  align-items: stretch;
  height: 100%;
  margin-right: -4px;
}

.win-btn {
  width: 38px;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text);
  cursor: pointer;
  font-size: 13px;
}

.win-btn:hover {
  background: var(--surface-2);
}

.win-btn.close:hover {
  background: var(--err);
  color: #fff;
}

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 180px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  padding: 4px;
  z-index: 80;
}

.drop-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: none;
  border: none;
  border-radius: 7px;
  color: var(--text);
  font-size: 12.5px;
  text-align: left;
  padding: 5px 9px;
  cursor: pointer;
}

.drop-item:hover {
  background: var(--surface-2);
}

.drop-item:disabled {
  color: var(--text-dim);
  opacity: 0.55;
  cursor: not-allowed;
}

.drop-item.active {
  color: var(--accent);
}

.drop-item small {
  color: var(--text-dim);
  font-size: 11px;
}

.drop-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--border);
}

.drop-empty {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-dim);
}

.st-ok,
.st-running {
  color: var(--ok);
}
.st-err,
.st-error {
  color: var(--err);
}
.st-warn {
  color: var(--warn);
}
.st-status {
  color: var(--accent);
}

.status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
  background: var(--text-dim);
}
.dot-running {
  background: var(--ok);
  box-shadow: 0 0 6px var(--ok);
}
.dot-error {
  background: var(--err);
  box-shadow: 0 0 6px var(--err);
}
.dot-starting {
  background: var(--warn);
  animation: dot-blink 1s ease-in-out infinite;
}
@keyframes dot-blink {
  50% {
    opacity: 0.3;
  }
}

.panel-anchor {
  position: absolute; /* out of flow — a fixed-height child would otherwise stretch the flex line */
  top: 100%;
  left: 0;
  right: 0;
  z-index: 70;
}

.panel-card {
  margin: 4px auto 0;
  width: min(860px, calc(100vw - 24px));
  max-height: calc(100vh - 52px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px 6px;
  border-bottom: 1px solid var(--border);
  flex: none;
}

.panel-title {
  font-size: 12.5px;
  font-weight: 650;
  color: var(--text-dim);
}

.panel-close {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 13px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}

.panel-close:hover {
  background: var(--surface-2);
  color: var(--text);
}

.panel-body {
  overflow-y: auto;
  padding: 10px 12px 12px;
}
</style>
