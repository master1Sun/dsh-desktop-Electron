import type { Component } from 'vue'
import {
  Box,
  Connection,
  Cpu,
  DataBoard,
  Grid,
  MagicStick,
  Monitor,
  Position,
  QuestionFilled,
  Setting
} from '@element-plus/icons-vue'
import { parseAppPanel } from '@shared/types'
import type { PageState } from '@renderer/stores/pages'

/**
 * Navigation model for the IM (QQ-like) sidebar. The classic layout reaches a feature through a
 * group trigger + in-panel tabs (MenuPanelContent / SettingsPanel / PageManager / DshManager). The
 * IM layout has no tabs: every former tab becomes its own leaf, and the two-level nav column lists
 * the groups and their leaves directly. A group with a single leaf renders as one row (no expand).
 *
 * Route keys mirror the classic `panel` keys so App.vue can keep owning only the *top-level* group
 * (`activePanel`): grouped leaves are prefixed `group/leaf` (e.g. `settings/view`); single-view
 * panels use the bare key (`mcp`, `external`, ...); a hosted agent app is `app:<id>` (see
 * `appPanelKey`). `groupOf(route)` recovers the classic key App still tracks.
 */
export interface QQLeaf {
  /** Unique selection key, e.g. `pages/install`, `mcp`, `app:<id>`. */
  route: string
  /** i18n key for the row label (reused from the classic tab / panel labels). */
  labelKey: string
}

export interface QQGroup {
  /** Classic panel key this group maps to (App.activePanel). */
  group: string
  labelKey: string
  icon: Component
  leaves: QQLeaf[]
  /** Pending-update count drives the 帮助 badge; set only on that group. */
  badgeFromOutdated?: boolean
}

/** Default leaf opened when a group is entered from the palette / menu (its first leaf). */
export function defaultLeaf(group: QQGroup): string {
  return group.leaves[0].route
}

/** The classic panel key a route belongs to (`settings/view` -> `settings`, `mcp` -> `mcp`). */
export function groupOf(route: string): string {
  const slash = route.indexOf('/')
  return slash === -1 ? route : route.slice(0, slash)
}

/** A group is expandable only when it has more than one leaf. */
export function isExpandable(g: QQGroup): boolean {
  return g.leaves.length > 1
}

/**
 * Rail order = functional weight, not menu order. Core runtime/page management sits at the top,
 * the hosted agent apps follow, then the lighter utilities, and 帮助 / 设置 are pushed to the very
 * bottom (设置 last — the catch-all users reach for least often). The `leaves` array is only kept so
 * the classic panel key mapping stays intact; the rail itself renders one icon per group.
 */
const CORE_GROUPS: QQGroup[] = [
  {
    group: 'pages',
    labelKey: 'palette.panelPages',
    icon: Grid,
    leaves: [
      { route: 'pages/install', labelKey: 'pageMgr.tabImport' },
      { route: 'pages/list', labelKey: 'pageMgr.tabInstalled' },
      { route: 'pages/env', labelKey: 'settings.tabEnv' }
    ]
  },
  {
    group: 'dsh',
    labelKey: 'palette.panelDsh',
    icon: Cpu,
    leaves: [
      { route: 'dsh/overview', labelKey: 'dshMgr.tabOverview' },
      { route: 'dsh/plugins', labelKey: 'dshMgr.tabPlugins' }
    ]
  },
  {
    group: 'openclaw',
    labelKey: 'palette.panelOpenclaw',
    icon: MagicStick,
    leaves: [{ route: 'openclaw', labelKey: 'palette.panelOpenclaw' }]
  }
]

/** Secondary managers, shown after the hosted apps but before the help / settings tail. */
const UTILITY_GROUPS: QQGroup[] = [
  {
    group: 'external',
    labelKey: 'palette.panelExternal',
    icon: Position,
    leaves: [{ route: 'external', labelKey: 'palette.panelExternal' }]
  },
  {
    group: 'workspace',
    labelKey: 'palette.panelWorkspace',
    icon: Box,
    leaves: [{ route: 'workspace', labelKey: 'palette.panelWorkspace' }]
  },
  {
    group: 'board',
    labelKey: 'palette.panelBoard',
    icon: DataBoard,
    leaves: [{ route: 'board', labelKey: 'palette.panelBoard' }]
  },
  {
    group: 'mcp',
    labelKey: 'palette.panelMcp',
    icon: Connection,
    leaves: [{ route: 'mcp', labelKey: 'palette.panelMcp' }]
  }
]

// Exported so the rail can pin 设置 to its own bottom slot (below the command palette) instead of
// leaving it in the scrolling group list.
export const SETTINGS_GROUP: QQGroup = {
  group: 'settings',
  labelKey: 'palette.panelSettings',
  icon: Setting,
  leaves: [
    { route: 'settings/view', labelKey: 'settings.tabView' },
    { route: 'settings/behavior', labelKey: 'settings.tabBehavior' },
    { route: 'settings/alerts', labelKey: 'settings.tabAlerts' },
    { route: 'settings/keys', labelKey: 'settings.tabKeys' },
    { route: 'settings/download', labelKey: 'settings.tabDownload' },
    { route: 'settings/network', labelKey: 'settings.tabNetwork' },
    { route: 'settings/privacy', labelKey: 'settings.tabPrivacy' }
  ]
}

// Exported so the rail can pin 帮助 to the fixed bottom slot, just above 设置, instead of
// leaving it at the tail of the scrolling group list.
export const HELP_GROUP: QQGroup = {
  group: 'help',
  labelKey: 'palette.panelHelp',
  icon: QuestionFilled,
  badgeFromOutdated: true,
  leaves: [
    { route: 'help/about', labelKey: 'panel.tabAbout' },
    { route: 'help/updates', labelKey: 'panel.tabUpdates' },
    { route: 'help/diagnose', labelKey: 'panel.tabDiagnose' },
    { route: 'help/logs', labelKey: 'panel.tabLogs' },
    { route: 'help/trend', labelKey: 'panel.tabTrend' },
    { route: 'help/events', labelKey: 'panel.tabEvents' }
  ]
}

/**
 * The scrolling nav tree for the current pages, ordered by functional weight: core managers, then
 * one group per hosted agent app (`manageAsApp`, excluding the dsh/openclaw built-ins that already
 * own a group), then the utility panels. 帮助 and 设置 are intentionally *not* here — the rail pins
 * them to a fixed bottom slot (帮助 above 设置). Agent apps are single-leaf rows whose route is the
 * classic `app:<id>` key.
 */
export function buildNav(pages: PageState[]): QQGroup[] {
  const appGroups: QQGroup[] = pages
    .filter((p) => p.manageAsApp && p.kind !== 'dsh' && p.kind !== 'openclaw')
    .map((p) => ({
      group: `app:${p.id}`,
      labelKey: '',
      icon: Monitor,
      // App rows carry a live name, not an i18n key; QQShell special-cases `app:*` labels.
      leaves: [{ route: `app:${p.id}`, labelKey: p.name }]
    }))
  return [...CORE_GROUPS, ...appGroups, ...UTILITY_GROUPS]
}

/** Whether a route is a hosted agent-app row (so the label / body can special-case it). */
export function isAppRoute(route: string): boolean {
  return parseAppPanel(route) !== null
}
