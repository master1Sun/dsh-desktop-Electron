<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import whaleIcon from '../assets/whale.png'
import PageSwitcher from './PageSwitcher.vue'
import WindowControls from './WindowControls.vue'
import TopProgressBar from './TopProgressBar.vue'
import { appPanelKey, parseAppPanel, type ExternalSite } from '../../../shared/types'
import type { PageState } from '../stores/pages'
import { t } from '../i18n'

export type PanelKind =
  | 'system'
  | 'pages'
  | 'external'
  | 'dsh'
  | 'openclaw'
  | 'settings'
  | 'help'
  | 'apps'
  | 'view'

const props = defineProps<{
  current: string | null
  runningCount: number
  totalCount: number
  outdatedCount: number
  isDark: boolean
  themeMode: 'auto' | 'light' | 'dark'
  pages: PageState[]
  activePageId: string | null
  /** pageId -> a start/stop call is in flight (drives the switcher's spinner) */
  busyPages?: Record<string, boolean>
  switcherTitle: string
  isMaximized: boolean
  canOperate: boolean
  /** Webview history availability for the top-bar back / forward buttons. */
  canGoBack: boolean
  canGoForward: boolean
  /** Whether the top-bar back / forward buttons should be shown (external address only). */
  showNav: boolean
  terminalMode: boolean
  externalSites: ExternalSite[]
}>()

const emit = defineEmits<{
  open: [panel: string | null]
  'open-panel': [panel: string]
  'toggle-theme': []
  'select-page': [id: string]
  'start-page': [id: string]
  'open-terminal': [id: string]
  'preview-site': [id: string]
  reload: []
  'go-back': []
  'go-forward': []
  detach: []
  inspect: []
  'open-logs': []
  'restart-terminal': []
  'restart-app': []
}>()

const themeLabel = computed(
  () =>
    ({
      auto: t('settings.themeAuto'),
      light: t('settings.themeLight'),
      dark: t('settings.themeDark')
    })[props.themeMode]
)

/**
 * MenuBar owns the group triggers, their dropdown lists, and the centered floating
 * panel. The page switcher and the window controls live in their own components
 * (PageSwitcher / WindowControls); "one floating surface at a time" is coordinated
 * via the `opening` event (switcher → us) and `switcherRef.close()` (us → switcher).
 */

/** A group entry either previews/starts something (acts immediately) or opens its panel. */
interface MenuItem {
  id: string
  title: string
  sub?: string
  kind?: 'status' | 'ok' | 'err' | 'warn' | 'dim'
  /** Renders as a colored pill (e.g. the pending-update count) on the row's right end. */
  count?: string
  disabled?: boolean
  /** Highlights the row while its panel is the open one. */
  active?: boolean
  run?: () => void
  /** Set = the row opens that panel (a PanelKind or an `app:<id>` key). */
  panel?: string
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


const groups = computed<MenuGroup[]>(() => {
  return [
    {
      kind: 'view',
      label: t('menu.view'),
      items: [],
      // App managers (built-in + dynamic `manageAsApp`). View chrome like reload /
      // detach / theme lives as icon buttons in the right-end chrome instead.
      actions: [
        { id: 'dsh', title: t('menu.appDsh'), panel: 'dsh' as string },
        { id: 'openclaw', title: t('menu.appOpenclaw'), panel: 'openclaw' as string },
        { id: 'external', title: t('menu.externalAddress'), panel: 'external' as string },
        // Dynamic agent apps (container.json `manageAsApp`) — one settings row each.
        ...props.pages
          .filter((p) => p.manageAsApp && p.kind !== 'dsh' && p.kind !== 'openclaw')
          .map((p) => ({
            id: `appcfg-${p.id}`,
            title: `${p.name} · ${t('menu.appSettings')}`,
            panel: appPanelKey(p.id)
          }))
      ]
    },
    {
      // 页面 + 设置 merged into one 系统 entry: the trigger always drops a list with
      // one row per panel (desktop-menu semantics — the trigger never opens a panel).
      kind: 'system',
      label: t('menu.system'),
      items: [],
      actions: [
        { id: 'sys-settings', title: t('menu.settings'), panel: 'settings' as string },
        { id: 'sys-pages', title: t('menu.pages'), panel: 'pages' as string }
      ]
    },
    {
      kind: 'help',
      label: t('menu.help'),
      items: [],
      actions: [
        // The row IS the merged about/updates panel; opening it must not require a
        // second click on the panel's own 检查更新 button. The pending-update count
        // lives here (as the row's trailing hint) instead of on the 帮助 trigger badge.
        {
          id: 'about',
          title: t('menu.helpAboutUpdates'),
          panel: 'help' as const,
          count: props.outdatedCount ? String(props.outdatedCount) : undefined
        },
        { id: 'logs', title: t('menu.openLogsDir'), run: () => emit('open-logs') },
        {
          id: 'inspect',
          title: t('menu.debugDevtools'),
          disabled: !props.canOperate,
          run: () => emit('inspect')
        },
        {
          id: 'restart-app',
          title: t('menu.restartApp'),
          run: () => emit('restart-app')
        }
      ]
    }
  ]
})

/** Floating-panel a11y: the panel is a named dialog; focus can be moved into it. */
const pagesById = (id: string): PageState | undefined => props.pages.find((p) => p.id === id)
/** Panels opened from a 视图 row (not a top-level group) still need a header title. */
const childPanelLabels = computed<Record<string, string>>(() => ({
  dsh: t('menu.appDsh'),
  openclaw: t('menu.appOpenclaw'),
  external: t('menu.externalAddress'),
  // Reached through the 系统 drop list, so these panels are "children" too.
  settings: t('menu.settings'),
  pages: t('menu.pages')
}))
const panelLabel = computed(() => {
  const appId = parseAppPanel(props.current)
  if (appId) return pagesById(appId)?.name || t('menu.apps')
  const g = groups.value.find((gr) => gr.kind === props.current)
  if (g) return g.label
  return (props.current && childPanelLabels.value[props.current]) || ''
})

/**
 * The page switcher also lists saved external sites, so a newly added address is
 * switchable/displayable from 「选择页面」 like any hosted page (embedded in the webview).
 */
const switcherPages = computed<PageState[]>(() => [
  ...props.pages,
  ...props.externalSites.map((s) => ({
    id: s.id,
    name: s.name,
    dir: '',
    port: 0,
    startCommand: '',
    external: true,
    externalUrl: s.url,
    status: 'running' as const
  }))
])

/* ---- group dropdown lists. Only THESE dismiss on click-away; the floating panels
       carry a ✕ and Esc closes them too. The page switcher owns its own open state. ---- */
/** Groups whose dropdown opens another panel: highlight the parent while any child shows. */
const childKinds: Partial<Record<PanelKind, string[]>> = {
  view: ['external', 'dsh', 'openclaw'],
  system: ['settings', 'pages'],
  help: ['help']
}

function isActive(g: MenuGroup): boolean {
  // Mutually exclusive: an open dropdown list owns the highlight and hides the
  // panel surface (`props.current && !listGroup` in the template), so while
  // `listGroup` is set no other group may light up. Otherwise the open panel —
  // or the group owning it via `childKinds` / the `app:` prefix — is the single
  // active trigger.
  if (listGroup.value) return listGroup.value === g.kind
  const cur = props.current
  if (!cur) return false
  if (g.kind === 'view' && parseAppPanel(cur)) return true
  return cur === g.kind || (childKinds[g.kind]?.includes(cur) ?? false)
}

const switcherRef = ref<InstanceType<typeof PageSwitcher> | null>(null)
/** Which group's list is currently shown (independent of the open panel). */
const listGroup = ref<PanelKind | null>(null)
const anchorEl = ref<HTMLElement | null>(null)
/** Set when a list switch already happened on mousedown, so the follow-up click of the
    same trigger must not toggle it back closed. Consumed (cleared) by `toggleMenu`. */
const switchViaMousedown = ref<PanelKind | null>(null)

function toggleMenu(group: MenuGroup, ev: MouseEvent): void {
  const el = ev.currentTarget as HTMLElement
  if (group.items.length || group.actions?.length) {
    // The list was just switched to this group on mousedown — keep it open, swallow the
    // click so it doesn't read as a re-click-to-close.
    if (switchViaMousedown.value === group.kind) {
      switchViaMousedown.value = null
      return
    }
    // Desktop-menu semantics: triggers with a list always toggle the drop list;
    // their panels are reached from a row inside it (never opened by the trigger).
    if (listGroup.value === group.kind) {
      // The list is showing: peel it (a panel underneath resurfaces).
      closeDropdowns()
      return
    }
    closeDropdowns()
    switcherRef.value?.close() // one floating surface at a time
    listGroup.value = group.kind
    anchorEl.value = el
    return
  }
  if (props.current === group.kind) emit('open', null)
  else {
    closeDropdowns()
    switcherRef.value?.close()
    emit('open', group.kind)
  }
}

function runItem(item: MenuItem): void {
  closeDropdowns()
  if (item.panel) emit('open-panel', item.panel)
  else item.run?.()
}

function closeDropdowns(): void {
  listGroup.value = null
  anchorEl.value = null
  // Drop any pending switch so a click that never landed can't linger and swallow the
  // next toggle-close.
  switchViaMousedown.value = null
}

/** Capture phase, so a trigger's own re-click toggles before this sees the mousedown. */
function onDocumentMousedown(ev: MouseEvent): void {
  if (!listGroup.value) return
  const target = ev.target as Node
  if ((target as HTMLElement)?.closest?.('.dropdown')) return
  // Pressing another top-menu trigger: switch the open list to it here, atomically. This
  // keeps `listGroup` non-null across the mousedown→click gap, so `isActive` never falls
  // back to `props.current` (which flashed whichever trigger owned the open panel) and the
  // old list closes in the same tick instead of lingering through the button press.
  const trig = (target as HTMLElement)?.closest?.('.group-trigger') as HTMLElement | null
  if (trig) {
    const kind = trig.dataset.group as PanelKind | undefined
    if (kind && kind !== listGroup.value) {
      listGroup.value = kind
      anchorEl.value = trig
      switchViaMousedown.value = kind
    }
    // Re-pressing the already-open trigger: leave it; the click toggles it closed.
    return
  }
  closeDropdowns()
}

/** Esc peels the topmost surface: drop list first; App.vue closes the panel. */
function onDocumentKeydown(ev: KeyboardEvent): void {
  if (ev.key === 'Escape' && listGroup.value) closeDropdowns()
}

document.addEventListener('mousedown', onDocumentMousedown, true)
document.addEventListener('keydown', onDocumentKeydown)
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMousedown, true)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <header class="menubar">
    <div class="brand">
      <img class="logo" :src="whaleIcon" alt="" draggable="false" />
      <span class="title">{{ t('app.title') }}</span>
      <span
        class="running-badge"
        :title="t('menu.runningBadge', { running: props.runningCount, total: props.totalCount })"
      >
        {{ props.runningCount }}/{{ props.totalCount }}
      </span>
    </div>

    <PageSwitcher
      ref="switcherRef"
      :pages="switcherPages"
      :active-page-id="props.activePageId"
      :busy-pages="props.busyPages"
      :title="props.switcherTitle"
      @opening="
        () => {
          closeDropdowns()
          emit('open', null) // one floating surface at a time
        }
      "
      @select-page="(id) => emit('select-page', id)"
      @start-page="(id) => emit('start-page', id)"
      @open-terminal="(id) => emit('open-terminal', id)"
    />

    <nav class="groups">
      <template v-for="g in groups" :key="g.kind">
        <span v-if="g.sepBefore" class="group-sep" />
        <div class="group-wrap">
          <button
            class="group-trigger"
            :data-group="g.kind"
            :class="{ active: isActive(g) }"
            :aria-haspopup="'menu'"
            :aria-expanded="isActive(g)"
            @click="toggleMenu(g, $event)"
          >
            {{ g.label }}
            <span v-if="g.badge" class="badge">{{ g.badge }}</span>
          </button>
          <div
            v-if="listGroup === g.kind && (g.items.length || g.actions?.length)"
            class="dropdown drop-list"
            role="menu"
            :aria-label="g.label"
          >
            <button
              v-for="a in g.actions || []"
              :key="a.id"
              class="drop-item"
              :class="{ active: a.panel ? a.panel === props.current : false }"
              role="menuitem"
              :disabled="a.disabled"
              @click="runItem(a)"
            >
              <span>{{ a.title }}</span>
              <span v-if="a.count" class="badge drop-badge">{{ a.count }}</span>
              <small v-if="a.sub" :class="a.kind ? `st-${a.kind}` : ''">{{ a.sub }}</small>
            </button>
            <div v-if="g.actions?.length && g.items.length" class="drop-sep" />
            <button
              v-for="it in g.items"
              :key="it.id"
              class="drop-item"
              :class="{ active: it.panel ? it.panel === props.current : false }"
              role="menuitem"
              @click="runItem(it)"
            >
              <span>{{ it.title }}</span>
              <small v-if="it.sub" :class="it.kind ? `st-${it.kind}` : ''">{{ it.sub }}</small>
            </button>
          </div>
        </div>
      </template>
    </nav>

    <div class="spacer" />

    <!-- Persistent install/update progress, docked on the right of the menu row (just left of
         the window chrome). Width-capped; several tasks fold into a hover dropdown. -->
    <TopProgressBar />

    <div v-if="props.terminalMode" class="webview-actions">
      <button
        class="act-btn"
        :title="t('menu.restartTerminal')"
        :aria-label="t('menu.restartTerminal')"
        @click="emit('restart-terminal')"
      >
        <el-icon><Refresh /></el-icon>
      </button>
    </div>

    <WindowControls
      :is-dark="props.isDark"
      :theme-label="themeLabel"
      :can-operate="props.canOperate"
      :can-go-back="props.canGoBack"
      :can-go-forward="props.canGoForward"
      :show-nav="props.showNav"
      :is-maximized="props.isMaximized"
      @toggle-theme="emit('toggle-theme')"
      @reload="emit('reload')"
      @go-back="emit('go-back')"
      @go-forward="emit('go-forward')"
      @detach="emit('detach')"
    />

    <!-- Centered floating panels; they close via ✕ / Esc / re-click, never click-away. -->
    <div v-if="props.current && !listGroup" class="panel-anchor">
      <div class="panel-card" role="dialog" aria-modal="false" :aria-label="panelLabel">
        <div class="panel-head">
          <span class="panel-title">{{ panelLabel }}</span>
          <button
            class="panel-close"
            :title="t('menu.closeEsc')"
            :aria-label="t('menu.closeEsc')"
            @click="emit('open', null)"
          >
            ✕
          </button>
        </div>
        <div class="panel-body">
          <template v-if="parseAppPanel(props.current)">
            <slot name="app" :page-id="parseAppPanel(props.current)" />
          </template>
          <slot v-else-if="props.current === 'pages'" name="pages" />
          <slot v-else-if="props.current === 'external'" name="external" />
          <slot v-else-if="props.current === 'dsh'" name="dsh" />
          <slot v-else-if="props.current === 'openclaw'" name="openclaw" />
          <slot v-else-if="props.current === 'settings'" name="settings" />
          <slot v-else-if="props.current === 'help'" name="help" />
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

.group-wrap {
  position: relative;
}

.group-trigger.active {
  border-color: var(--accent);
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

.group-trigger.active {
  background: var(--surface-2);
  color: var(--accent);
  font-weight: 600;
}

.badge {
  margin-left: 4px;
  font-size: 10.5px;
  background: var(--warn);
  color: #1b1400;
  border-radius: 999px;
  padding: 0 5px;
  line-height: 12px;
}

/* The pending-update count on the 关于与更新 row: keep the pill at the row's right end. */
.drop-badge {
  margin-left: auto;
  padding: 1px 7px;
  line-height: 14px;
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
