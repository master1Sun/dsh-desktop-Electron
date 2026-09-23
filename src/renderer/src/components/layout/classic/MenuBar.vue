<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import whaleIcon from '@renderer/assets/whale.png'
import PageSwitcher from '@renderer/components/shell/PageSwitcher.vue'
import WindowControls from '@renderer/components/shell/WindowControls.vue'
import TopProgressBar from '@renderer/components/shell/TopProgressBar.vue'
import NetIndicator from '@renderer/components/shell/NetIndicator.vue'
import { appPanelKey, parseAppPanel, type ExternalSite } from '@shared/types'
import type { PageState } from '@renderer/stores/pages'
import { useDualStore } from '@renderer/stores/dual'
import { t } from '@renderer/i18n'

export type PanelKind =
  | 'system'
  | 'pages'
  | 'external'
  | 'dsh'
  | 'openclaw'
  | 'mcp'
  | 'workspace'
  | 'settings'
  | 'help'
  | 'apps'
  | 'view'

const props = defineProps<{
  current: string | null
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
  /**
   * IM (QQ-like) layout: the menu bar collapses to a compact title bar. The group triggers and
   * the centered floating panel move out — the left rail + docked sidebar (QQShell) own them —
   * while brand, page switcher, dual controls and window chrome stay.
   */
  imMode?: boolean
}>()

const emit = defineEmits<{
  open: [panel: string | null]
  'open-panel': [panel: string]
  'toggle-theme': []
  'select-page': [id: string]
  'start-page': [id: string]
  'open-terminal': [id: string]
  'popout-page': [id: string]
  'preview-site': [id: string]
  reload: []
  'go-back': []
  'go-forward': []
  detach: []
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

/** 双屏模式 controls live on this menu row; the panes they drive live in HomeView, so both
    read/write the shared dual store rather than prop-drilling through App. */
const dualStore = useDualStore()

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
      // MCP 服务 / 共享上下文 are reached from here too (their panels stay mounted via the
      // slots below); the Ctrl+K palette offers the same two.
      actions: [
        { id: 'dsh', title: t('menu.appDsh'), panel: 'dsh' as string },
        { id: 'openclaw', title: t('menu.appOpenclaw'), panel: 'openclaw' as string },
        { id: 'external', title: t('menu.externalAddress'), panel: 'external' as string },
        { id: 'mcp', title: t('menu.appMcp'), panel: 'mcp' as string },
        { id: 'workspace', title: t('menu.workspace'), panel: 'workspace' as string },
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
  mcp: t('menu.appMcp'),
  workspace: t('menu.workspace'),
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
 * Disabled built-ins (dsh-web / openclaw switched off in the Pages panel) drop out entirely —
 * the Pages panel stays the only surface that can bring them back.
 */
const switcherPages = computed<PageState[]>(() => [
  ...props.pages.filter((p) => !p.disabled),
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

/**
 * Top-left badge counts what the dropdown actually shows, not just the hosted-page total:
 * numerator = rows lit green (running AND not runtime-missing — the exact rule PageSwitcher
 * uses for its dot), denominator = every row listed (hosted pages + always-green external
 * sites). So the number tracks the lights the user can see when they open the switcher.
 */
const switcherGreenCount = computed(
  () =>
    switcherPages.value.filter((p) => p.status === 'running' && p.runtimeMissing !== true).length
)
const switcherTotalCount = computed(() => switcherPages.value.length)

/**
 * C2: the page the 独立窗口 button detaches — whatever is on screen. The lookup is the switcher's
 * list rather than the registry pages alone because a saved 外部站点 only lives there; a CLI page is
 * detachable too and gets a second, independent run of its command. It used to sit on every
 * switcher row; since it always acted on the page on screen, it shares the bar with the other view
 * controls (双屏) instead of repeating per row. A stopped page still qualifies: its own window
 * offers the start button.
 */
const popoutTarget = computed<PageState | null>(
  () => switcherPages.value.find((x) => x.id === props.activePageId) || null
)

/* ---- group dropdown lists. Only THESE dismiss on click-away; the floating panels
       carry a ✕ and Esc closes them too. The page switcher owns its own open state. ---- */
/** Groups whose dropdown opens another panel: highlight the parent while any child shows. */
const childKinds: Partial<Record<PanelKind, string[]>> = {
  view: ['external', 'dsh', 'openclaw', 'mcp', 'workspace'],
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
        :title="t('menu.runningBadge', { running: switcherGreenCount, total: switcherTotalCount })"
      >
        {{ switcherGreenCount }}/{{ switcherTotalCount }}
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

    <nav v-if="!props.imMode" class="groups">
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

    <!-- Live ↓/↑ network rates with a hover detail card (local link, latency, totals,
         online ports), fed by the main process's shared sample loop. -->
    <NetIndicator />

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

    <!-- 双屏模式 controls: docked on the menu row, just left of the window chrome, so they
         never overlay the guest content. -->
    <div class="dual-actions">
      <!-- C2: pop the page on screen out into its own window (shared session). Hidden when nothing
           is on screen, and disabled in 双屏模式 — the panes already are the split, and pulling one
           out of a layout the user just assembled is not what the button should mean there. -->
      <button
        v-if="popoutTarget"
        class="dual-btn"
        type="button"
        :disabled="dualStore.on"
        :title="
          dualStore.on
            ? t('pageMgr.popoutInDual')
            : t('palette.cmdPopoutPage', { name: popoutTarget.name })
        "
        :aria-label="t('palette.cmdPopoutPage', { name: popoutTarget.name })"
        @click="emit('popout-page', popoutTarget.id)"
      >
        <!-- A window in front of the one it came away from: the detach glyph from the switcher rows. -->
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M2.5 5.5 h6.5 v7.5 H2.5 Z M9 2.5 h4.5 v6.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        class="dual-btn"
        type="button"
        :class="{ 'is-active': dualStore.on }"
        :title="dualStore.on ? t('dual.exit') : t('dual.enter')"
        :aria-label="dualStore.on ? t('dual.exit') : t('dual.enter')"
        @click="dualStore.toggle()"
      >
        <!-- off: split-pane frame (enter 双屏) -->
        <svg v-if="!dualStore.on" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
          <rect
            x="2"
            y="3"
            width="12"
            height="10"
            rx="1.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
          />
          <line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" stroke-width="1.2" />
        </svg>
        <!-- on: exit / logout (arrow leaving a panel) -->
        <svg v-else width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M9 2.5 H3.5 A1 1 0 0 0 2.5 3.5 V12.5 A1 1 0 0 0 3.5 13.5 H9"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M11.5 8 H6 M9.5 5.5 L12 8 L9.5 10.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <template v-if="dualStore.on">
        <button
          v-if="dualStore.collapsed === 'none'"
          class="dual-btn"
          type="button"
          :title="t('dual.hideMain')"
          :aria-label="t('dual.hideMain')"
          @click="dualStore.collapse('main')"
        >
          <!-- collapse main (left pane folds left) -->
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
            <rect
              x="2"
              y="3"
              width="12"
              height="10"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
            />
            <line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" stroke-width="1.2" />
            <path
              d="M6 6 L4 8 L6 10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          v-else-if="dualStore.collapsed === 'main'"
          class="dual-btn"
          type="button"
          :title="t('dual.restoreMain')"
          :aria-label="t('dual.restoreMain')"
          @click="dualStore.collapse('main')"
        >
          <!-- restore main (left pane unfolds right) -->
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
            <rect
              x="2"
              y="3"
              width="12"
              height="10"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
            />
            <line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" stroke-width="1.2" />
            <path
              d="M4 6 L6 8 L4 10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          v-if="dualStore.collapsed === 'none'"
          class="dual-btn"
          type="button"
          :title="t('dual.hideSecondary')"
          :aria-label="t('dual.hideSecondary')"
          @click="dualStore.collapse('secondary')"
        >
          <!-- collapse secondary (right pane folds right) -->
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
            <rect
              x="2"
              y="3"
              width="12"
              height="10"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
            />
            <line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" stroke-width="1.2" />
            <path
              d="M10 6 L12 8 L10 10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          v-else-if="dualStore.collapsed === 'secondary'"
          class="dual-btn"
          type="button"
          :title="t('dual.restoreSecondary')"
          :aria-label="t('dual.restoreSecondary')"
          @click="dualStore.collapse('secondary')"
        >
          <!-- restore secondary (right pane unfolds left) -->
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
            <rect
              x="2"
              y="3"
              width="12"
              height="10"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
            />
            <line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" stroke-width="1.2" />
            <path
              d="M12 6 L10 8 L12 10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <el-select
          v-if="dualStore.showSecondary"
          v-model="dualStore.secId"
          size="small"
          filterable
          :reserve-keyword="false"
          class="dual-picker"
          popper-class="dual-picker-popper"
          :placeholder="t('dual.pickPage')"
        >
          <el-option v-for="c in dualStore.secOptions" :key="c.id" :label="c.label" :value="c.id" />
        </el-select>
      </template>
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

    <!-- Centered floating panels; they close via ✕ / Esc / re-click, never click-away.
         In IM layout the same panel docks into the left sidebar (QQShell) instead, so skip it here. -->
    <div v-if="props.current && !listGroup && !props.imMode" class="panel-anchor">
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
          <slot v-else-if="props.current === 'mcp'" name="mcp" />
          <slot v-else-if="props.current === 'workspace'" name="workspace" />
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
  /* Frosted top bar: lets the ambient aurora bleed through instead of a flat fill.
     Opacity is driven by --glass-tint-a (settings ▸ 背景不透明度); blur/saturate stay on --glass-blur. */
  background: rgb(var(--glass-tint-rgb) / var(--glass-tint-a, 0.82));
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  -webkit-backdrop-filter: blur(var(--glass-blur, 30px))
    saturate(calc(1.2 + var(--glass-blur-n, 30) / 80));
  backdrop-filter: blur(var(--glass-blur, 30px)) saturate(calc(1.2 + var(--glass-blur-n, 30) / 80));
  -webkit-app-region: drag;
  user-select: none;
  z-index: 60;
}

.menubar button,
.menubar .dual-actions,
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
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  -webkit-backdrop-filter: blur(6px) saturate(125%);
  backdrop-filter: blur(6px) saturate(125%);
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
  border-radius: 9999px;
  color: var(--text);
  cursor: pointer;
  font-size: 13px;
}

.act-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  -webkit-backdrop-filter: blur(6px) saturate(125%);
  backdrop-filter: blur(6px) saturate(125%);
}

.act-btn:disabled {
  color: var(--text-dim);
  opacity: 0.55;
  cursor: not-allowed;
}

.dual-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 6px;
  flex: none;
}

.dual-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  font-size: 12px;
  color: var(--text);
  background: none;
  border: 1px solid var(--border);
  border-radius: 9999px;
  padding: 0;
  cursor: pointer;
  white-space: nowrap;
}

.dual-btn:hover {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border-color: var(--accent);
  color: var(--accent);
}

.dual-btn.is-active {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.dual-btn:disabled {
  color: var(--text-dim);
  opacity: 0.5;
  cursor: not-allowed;
}

.dual-btn:disabled:hover {
  background: none;
  border-color: var(--border);
  color: var(--text-dim);
}

.dual-picker {
  /* Narrow on purpose: it sits in the busy top strip, and the full page name is in the
     dropdown list / tooltip rather than the closed control. */
  width: 116px;
}

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 180px;
  background: color-mix(in srgb, var(--surface) 90%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
  border-radius: 10px;
  box-shadow:
    var(--shadow),
    0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent) inset;
  -webkit-backdrop-filter: blur(26px) saturate(140%);
  backdrop-filter: blur(26px) saturate(140%);
  padding: 4px;
  z-index: 80;
  animation: reveal-up 0.4s ease both;
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
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  -webkit-backdrop-filter: blur(8px) saturate(125%);
  backdrop-filter: blur(8px) saturate(125%);
  color: var(--text);
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
  /* Frosted floating surface with a faint top glow so it reads as lit; the tint
     thins and the saturation rises with --glass-blur (see the glass layer). */
  background:
    radial-gradient(
      120% 70% at 50% -12%,
      color-mix(in srgb, var(--accent) 14%, transparent),
      transparent 60%
    ),
    rgb(var(--glass-tint-rgb) / var(--glass-tint-a, 0.72));
  border: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border));
  border-radius: 14px;
  -webkit-backdrop-filter: blur(var(--glass-blur, 30px))
    saturate(calc(1.2 + var(--glass-blur-n, 30) / 70));
  backdrop-filter: blur(var(--glass-blur, 30px)) saturate(calc(1.2 + var(--glass-blur-n, 30) / 70));
  box-shadow:
    var(--shadow),
    0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent) inset,
    0 18px 60px color-mix(in srgb, var(--accent) 16%, transparent);
  animation: reveal-up 0.5s cubic-bezier(0.22, 0.61, 0.36, 1) both;
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
  font-weight: 700;
  letter-spacing: 0.2px;
  color: var(--accent);
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

<!--
  The dual picker's trigger is intentionally narrow (it shares the busy top strip), but its
  option list still has to be readable. Element Plus teleports the popper to <body>, so a
  scoped rule can't reach it — this global rule targets only the class we hand it above.
-->
<style>
.dual-picker-popper.el-popper {
  min-width: 240px;
}
</style>
