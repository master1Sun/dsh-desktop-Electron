<script setup lang="ts">
import { computed, markRaw, ref, watch, type Component } from 'vue'
import { ElMessage } from 'element-plus'
import {
  ArrowLeft,
  Search,
  Monitor,
  Key,
  Download,
  Connection,
  Lock,
  Coin,
  Promotion,
  Box,
  FolderOpened,
  Grid,
  Menu,
  Share,
  DataAnalysis,
  Tickets,
  Help,
  Document,
  TrendCharts,
  Cpu,
  Files,
  Link,
  Setting,
  Refresh
} from '@element-plus/icons-vue'
import MenuPanelContent from '@renderer/components/panels/MenuPanelContent.vue'
import { usePagesStore } from '@renderer/stores/pages'
import { appPanelKey } from '@shared/types'
import { t } from '@renderer/i18n'

/**
 * Unified console — the single surface that replaces the ten scattered classic-mode panels.
 *
 * A left grouped nav (search + 「返回应用」) drives which function shows on the right; the right
 * side embeds the existing `MenuPanelContent` verbatim, passing `pane` so a tabbed child (settings
 * / pages / dsh / board / help) hides its own rail and lands on the requested tab. Nothing here
 * re-implements panel logic — it is a shell that reuses the proven components and only adds the
 * navigation + Qoder-style chrome.
 */

const props = defineProps<{
  runtime: { version: string | null; ok: boolean; path: string; override?: boolean }
  runningCount: number
  totalCount: number
  /** Deep-link target (palette / notification): jump to this leaf when it changes. */
  initial?: { panel: string; tab?: string } | null
}>()

const emit = defineEmits<{
  'apply-theme': [mode: 'auto' | 'light' | 'dark']
  'preview-site': [url: string]
  'open-page': [id: string]
  'open-terminal': [id: string]
  'check-updates': []
  close: []
}>()

interface Leaf {
  /** Stable key: `panel` or `panel:tab`; also the active-selection identity. */
  id: string
  panel: string
  tab?: string
  /** i18n key for the label (static leaves). */
  labelKey?: string
  /** Literal label (dynamic agent-app leaves use the page name). */
  label?: string
  icon: Component
}
interface Group {
  titleKey: string
  items: Leaf[]
}

/* Static grouped nav — every classic panel + its sub-tabs flattened into leaves. Labels reuse the
   panels' own i18n keys so the wording never drifts from the source component. */
const STATIC_GROUPS: Group[] = [
  {
    titleKey: 'console.groupPages',
    items: [
      {
        id: 'pages:install',
        panel: 'pages',
        tab: 'install',
        labelKey: 'pageMgr.tabImport',
        icon: markRaw(Promotion)
      },
      {
        id: 'pages:installed',
        panel: 'pages',
        tab: 'installed',
        labelKey: 'pageMgr.tabInstalled',
        icon: markRaw(Box)
      },
      {
        id: 'pages:switcher',
        panel: 'pages',
        tab: 'switcher',
        labelKey: 'pageMgr.tabSwitcher',
        icon: markRaw(Monitor)
      },
      {
        id: 'pages:env',
        panel: 'pages',
        tab: 'env',
        labelKey: 'settings.tabEnv',
        icon: markRaw(FolderOpened)
      },
      { id: 'external', panel: 'external', labelKey: 'menu.externalAddress', icon: markRaw(Link) }
    ]
  },
  {
    titleKey: 'console.groupRuntime',
    items: [
      /* DSH 概览 / 插件管理 各占一个 nav leaf，都带 tab → MenuPanelContent 传下 pane →
         DshManager 走单栏（隐藏自带 rail），左导航完整镜像两个子 tab。之前概览 leaf 不带 tab、
         靠 DshManager 内部 rail，与独立的插件管理 leaf 双入口互相打架，切换会停在错误 tab。 */
      {
        id: 'dsh:overview',
        panel: 'dsh',
        tab: 'overview',
        labelKey: 'dshMgr.tabOverview',
        icon: markRaw(Grid)
      },
      /* Deep link back into the merged module's 插件管理 tab: the console nav mirrors every
         MenuPanelContent sub-tab, so plugins keeps its own entry too. */
      {
        id: 'dsh:plugins',
        panel: 'dsh',
        tab: 'plugins',
        labelKey: 'dshMgr.tabPlugins',
        icon: markRaw(Menu)
      },
      { id: 'openclaw', panel: 'openclaw', labelKey: 'menu.appOpenclaw', icon: markRaw(Cpu) },
      { id: 'mcp', panel: 'mcp', labelKey: 'menu.appMcp', icon: markRaw(Connection) },
      { id: 'workspace', panel: 'workspace', labelKey: 'menu.workspace', icon: markRaw(Files) }
    ]
  },
  {
    titleKey: 'console.groupBoard',
    items: [
      {
        id: 'board:board',
        panel: 'board',
        tab: 'board',
        labelKey: 'wsMgr.board',
        icon: markRaw(Tickets)
      },
      {
        id: 'board:deps',
        panel: 'board',
        tab: 'deps',
        labelKey: 'depGraph.title',
        icon: markRaw(Share)
      },
      {
        id: 'board:calls',
        panel: 'board',
        tab: 'calls',
        labelKey: 'mcpMgr.callsTitle',
        icon: markRaw(DataAnalysis)
      },
      {
        id: 'board:usage',
        panel: 'board',
        tab: 'usage',
        labelKey: 'usageMgr.tab',
        icon: markRaw(Coin)
      }
    ]
  },
  {
    titleKey: 'console.groupSettings',
    items: [
      {
        id: 'settings:view',
        panel: 'settings',
        tab: 'view',
        labelKey: 'settings.tabView',
        icon: markRaw(Monitor)
      },
      {
        id: 'settings:keys',
        panel: 'settings',
        tab: 'keys',
        labelKey: 'settings.tabKeys',
        icon: markRaw(Key)
      },
      {
        id: 'settings:download',
        panel: 'settings',
        tab: 'download',
        labelKey: 'settings.tabDownload',
        icon: markRaw(Download)
      },
      {
        id: 'settings:network',
        panel: 'settings',
        tab: 'network',
        labelKey: 'settings.tabNetwork',
        icon: markRaw(Connection)
      },
      {
        id: 'settings:privacy',
        panel: 'settings',
        tab: 'privacy',
        labelKey: 'settings.tabPrivacy',
        icon: markRaw(Lock)
      },
      {
        id: 'settings:storage',
        panel: 'settings',
        tab: 'storage',
        labelKey: 'settings.tabStorage',
        icon: markRaw(Coin)
      }
    ]
  },
  {
    titleKey: 'console.groupHelp',
    items: [
      {
        id: 'help:about',
        panel: 'help',
        tab: 'about',
        labelKey: 'panel.tabAbout',
        icon: markRaw(Help)
      },
      {
        id: 'help:updates',
        panel: 'help',
        tab: 'updates',
        labelKey: 'panel.tabUpdates',
        icon: markRaw(Refresh)
      },
      {
        id: 'help:logs',
        panel: 'help',
        tab: 'logs',
        labelKey: 'panel.tabLogs',
        icon: markRaw(Document)
      },
      {
        id: 'help:trend',
        panel: 'help',
        tab: 'trend',
        labelKey: 'panel.tabTrend',
        icon: markRaw(TrendCharts)
      },
      {
        id: 'help:events',
        panel: 'help',
        tab: 'events',
        labelKey: 'panel.tabEvents',
        icon: markRaw(Tickets)
      },
      {
        id: 'help:ports',
        panel: 'help',
        tab: 'ports',
        labelKey: 'panel.tabPorts',
        icon: markRaw(Monitor)
      }
    ]
  }
]

const pagesStore = usePagesStore()

/** Dynamic agent-app leaves (container.json `manageAsApp`), mirroring MenuBar's visibility rule. */
const appLeaves = computed<Leaf[]>(() =>
  pagesStore.pages
    .filter((p) => p.manageAsApp && p.kind !== 'dsh' && p.kind !== 'openclaw')
    .map((p) => ({
      id: appPanelKey(p.id),
      panel: appPanelKey(p.id),
      label: p.name,
      icon: markRaw(Setting)
    }))
)

const allGroups = computed<Group[]>(() => {
  const groups = STATIC_GROUPS.map((g) => ({ ...g, items: [...g.items] }))
  if (appLeaves.value.length) {
    const target = groups.find((g) => g.titleKey === 'console.groupPages')
    if (target) target.items.push(...appLeaves.value)
  }
  return groups
})

const query = ref('')
function leafLabel(leaf: Leaf): string {
  return leaf.label ?? t(leaf.labelKey || '')
}
/** Search filter over resolved labels; a group with no match drops out entirely. */
const filteredGroups = computed<Group[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allGroups.value
  return allGroups.value
    .map((g) => ({ ...g, items: g.items.filter((it) => leafLabel(it).toLowerCase().includes(q)) }))
    .filter((g) => g.items.length > 0)
})

const flatLeaves = computed<Leaf[]>(() => allGroups.value.flatMap((g) => g.items))
const active = ref<Leaf | undefined>(flatLeaves.value[0])

function leafIdFor(panel: string, tab?: string): string {
  return tab ? `${panel}:${tab}` : panel
}
function select(leaf: Leaf): void {
  if (active.value?.id !== leaf.id) active.value = leaf
}
/**
 * 子面板内部发起的同面板跳转（关于 ▸ 待更新 → 更新列表）：左导航是这里的所有权，
 * 不能只等宿主传 `initial`，否则内容切了、导航选中项还停在旧 leaf。
 */
function gotoLeaf(panel: string, tab?: string): void {
  const hit = flatLeaves.value.find((l) => l.id === leafIdFor(panel, tab))
  if (hit) select(hit)
}
/** Apply a deep-link target: jump to the matching leaf whenever the host passes a new one. */
watch(
  () => props.initial,
  (tgt) => {
    if (!tgt) return
    const hit =
      flatLeaves.value.find((l) => l.id === leafIdFor(tgt.panel, tgt.tab)) ??
      // A deep link may still carry a per-tab target for a panel whose tabs were merged into one
      // module (e.g. dsh 概览/插件管理); fall back to the panel-only leaf so it still navigates.
      flatLeaves.value.find((l) => l.id === tgt.panel)
    if (hit) active.value = hit
  },
  { immediate: true, deep: true }
)

/* Keep the selection valid if the active leaf disappears (e.g. its agent app was removed). */
watch(flatLeaves, (leaves) => {
  const cur = active.value
  if (!cur || !leaves.some((l) => l.id === cur.id)) active.value = leaves[0]
})

const activeLabel = computed(() => (active.value ? leafLabel(active.value) : ''))

/* The console sheet runs edge-to-edge, so a lone toggle on a settings row would drift to the far
   right edge of a wide window. Narrow mode caps the settings / about panes (the captioned form-card
   language) to a comfortable reading measure. Data panels — page/port tables, resource trends, the
   board, MCP lists — keep the full width they need. */
const narrowMeasure = computed(() => {
  const a = active.value
  if (!a) return false
  if (a.panel === 'settings') return true
  return a.panel === 'help' && a.tab === 'about'
})

function onClose(): void {
  emit('close')
}

/* Surface a friendly guard if a leaf's panel fails to resolve (defensive; shouldn't happen). */
watch(active, (leaf) => {
  if (!leaf) ElMessage.warning(t('console.noSelection'))
})
</script>

<template>
  <div class="console" :class="{ narrow: narrowMeasure }">
    <aside class="console-nav">
      <button class="console-back" :aria-label="t('console.back')" @click="onClose">
        <el-icon><ArrowLeft /></el-icon>
        <span>{{ t('console.back') }}</span>
      </button>
      <el-input
        v-model="query"
        class="console-search"
        :placeholder="t('console.search')"
        :prefix-icon="Search"
        clearable
      />
      <nav class="console-list">
        <div v-for="g in filteredGroups" :key="g.titleKey" class="nav-group">
          <div class="nav-group-title">{{ t(g.titleKey) }}</div>
          <button
            v-for="leaf in g.items"
            :key="leaf.id"
            class="nav-item"
            :class="{ active: active?.id === leaf.id }"
            :aria-current="active?.id === leaf.id ? 'true' : undefined"
            @click="select(leaf)"
          >
            <el-icon class="nav-icon"><component :is="leaf.icon" /></el-icon>
            <span class="nav-label">{{ leafLabel(leaf) }}</span>
          </button>
        </div>
        <div v-if="!filteredGroups.length" class="nav-empty">{{ t('console.noMatch') }}</div>
      </nav>
    </aside>

    <main class="console-body">
      <h2 class="console-title">{{ activeLabel }}</h2>
      <div class="console-content">
        <MenuPanelContent
          v-if="active"
          :panel="active.panel"
          :pane="active.tab"
          :tab-position="active.panel === 'dsh' ? 'top' : undefined"
          :runtime="props.runtime"
          :running-count="props.runningCount"
          :total-count="props.totalCount"
          @apply-theme="(m) => emit('apply-theme', m)"
          @preview-site="(u) => emit('preview-site', u)"
          @open-page="(id) => emit('open-page', id)"
          @open-terminal="(id) => emit('open-terminal', id)"
          @check-updates="emit('check-updates')"
          @pane-jump="gotoLeaf(active!.panel, $event)"
          @close="onClose"
        />
      </div>
    </main>
  </div>
</template>

<style scoped>
.console {
  --console-col-w: 900px;
  display: flex;
  align-items: stretch;
  gap: 16px;
  height: 100%;
  min-height: 0;
  padding: 4px;
}

/* ---- left nav ---------------------------------------------------------------
   Modern desktop-app sidebar (VS Code / Windows 11 设置): a fixed, slightly wider rail with
   comfortable rows, clear group captions and a soft active state. The column shares one measure
   with the content via `--console-col-w` so the nav + page body read as a single grid. */
.console-nav {
  width: 258px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding: 8px 10px 8px 6px;
  border-right: 1px solid color-mix(in srgb, var(--accent) 12%, var(--border));
}
.console-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--text-dim);
  background: none;
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;
}
.console-back:hover {
  color: var(--text);
  background: var(--dsh-wash-hover);
}
.console-search {
  width: 100%;
}
/* Mockup renders the search field as a pill; round the EP input wrapper to match the nav. */
.console-search :deep(.el-input__wrapper) {
  border-radius: 9999px;
}
.console-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  /* 不再预留 scrollbar-gutter：导航列表不常滚动，常预留槽位会在标签右侧留一条空白区域；
     真需要时滚动条临时出现即可（主文档已 overflow:hidden，不会牵动全局布局）。 */
  padding-right: 4px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.nav-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 18px;
}
.nav-group:last-child {
  margin-bottom: 4px;
}
/* Group caption: a quiet, tracked section header sitting above its rows — the desktop-app cue that
   separates clusters without drawing a box around them. */
.nav-group-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, var(--text-dim) 82%, transparent);
  padding: 6px 12px 6px;
  user-select: none;
}
.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 9px 12px;
  font-size: 13.5px;
  text-align: left;
  color: var(--text-dim);
  background: none;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;
}
.nav-item:hover {
  color: var(--text);
  background: var(--dsh-wash-hover);
}
.nav-icon {
  flex: none;
  font-size: 16px;
  opacity: 0.9;
}
.nav-item.active .nav-icon {
  opacity: 1;
}
.nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-item.active {
  color: var(--accent);
  font-weight: 600;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 24%;
  bottom: 24%;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
}
.nav-empty {
  padding: 16px 12px;
  font-size: 12.5px;
  color: var(--text-dim);
}

/* ---- right content ---------------------------------------------------------- */
.console-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  /* 内容列是控制台唯一的外层滚动容器：异步数据落位时滚动条出现/消失会带走 ~10px 宽，
     整列内容左右抖一下；恒预留槽位后宽度恒定。 */
  scrollbar-gutter: stable;
  padding: 8px 20px 12px 12px;
}
/* Page header: a moderate, grounded title over a hairline baseline instead of the old oversized
   28px block floating in whitespace. Capped to `--console-col-w` (shared with the nav) and kept
   flush-left so a wide window shows comfortable reading measure + margin, exactly like a desktop
   settings page — rows stop stretching edge-to-edge across the whole viewport. */
.console-title {
  margin: 0;
  padding: 4px 2px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  font-size: 21px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--text);
  flex: none;
  width: 100%;
}
.console-content {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}
/* Narrow (settings / about): ground the title and card column to one measure, flush-left, so rows
   stop stretching across the whole viewport. Data panels leave this off and run full width. */
.console.narrow .console-title,
.console.narrow .console-content {
  max-width: var(--console-col-w);
}
/* The embedded panel owns its own scroll on a single-pane; drop the rail (already hidden via
   `pane`) and let the content fill the console body without a nested scroll container. */
.console-content :deep(.v-tabs > .el-tabs__header),
.console-content :deep(.help-tabs > .el-tabs__header) {
  display: none;
}
.console-content :deep(.settings-tabs),
.console-content :deep(.v-tabs),
.console-content :deep(.help-tabs) {
  min-height: 0;
}
.console-content :deep(.el-tabs__content) {
  overflow: visible;
}

/* ---- content: 界面视图-style captioned card + hairline rows ---------------------
   Every embedded settings tab is re-skinned from here to match 界面视图: one rounded card,
   rows that read "two-line label (bold title + dim desc) left · control right", split by a
   hairline. The embedded panel keeps its own el-form markup, so we restyle the shared Element
   Plus primitives via scoped `:deep` (no other surface is touched). The console card is
   full-width, so even wide rows (registry list, path input + browse) keep their natural width
   and just sit flush to the right edge — nothing wraps. */
.console-content :deep(.el-form) {
  padding: 0;
  background: color-mix(in srgb, var(--text) 5%, var(--surface));
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
}
.console-content :deep(.el-form-item) {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 24px;
  padding: 16px 22px !important;
  margin: 0 !important;
  border: none !important;
  border-radius: 0 !important;
  background: none !important;
  box-shadow: none !important;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent) !important;
  transition: none;
}
.console-content :deep(.el-form-item:last-child) {
  border-bottom: none !important;
}
/* A section heading owns no control: keep it as a group label, not a bordered row. */
.console-content :deep(.el-form-item.section-item) {
  padding: 14px 22px 0 !important;
  border-bottom: none !important;
}
/* Neutralize the child panel's hover wash/band so the flat hairline list stays clean. */
.console-content :deep(.el-form-item:hover) {
  background: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
/* Label = bold title (15px) over the dim `.row-desc` the InfoTip now renders. Stack the two,
   left-align, cap the width so a long description wraps instead of shoving the control off-edge,
   and let `space-between` push the control column to the right. `width:auto` overrides the base
   panel's fixed 166px label column (which was tuned for a single-line ⓘ label). */
.console-content :deep(.el-form-item__label) {
  flex: 0 1 auto !important;
  align-self: center !important;
  width: auto !important;
  max-width: 46%;
  display: flex !important;
  flex-direction: column;
  align-items: flex-start !important;
  justify-content: center;
  gap: 4px;
  text-align: left !important;
  padding: 0 !important;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text) !important;
}
.console-content :deep(.el-form-item__content) {
  /* Fill the leftover width (label is capped at 46%) so the wide privacy / network / download rows
     — whose `.act-row` / `.reg-list` / `.env-root-row` are sized `calc(100% - 16px)` — resolve
     against a definite parent instead of collapsing to min-content. `justify-content: flex-end`
     still parks small controls (switches, segmented pills) on the right edge. */
  flex: 1 1 auto;
  min-width: 0;
  justify-content: flex-end;
  margin-left: 0 !important;
}
/* The base panel sizes its wide rows `calc(100% - 16px)` to clear the old row padding; the console
   rows carry no inner padding, so drop the inset and let them run to the same right edge as the
   small controls. */
.console-content :deep(.settings-panel) {
  --settings-row-w: 100%;
}
.console-content :deep(.el-form-item.section-item .section-title) {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-dim);
}

/* ---- 环境目录 tab opts out of the row skin -------------------------------------------
   PageManager's 环境目录 uses top-labelled rows whose control is a pair of full-width directory
   cards (EnvDirChoice). The space-between row skin above would squeeze those cards into the right
   column and force the label into a 46% two-line column, so reset the skin inside `.env-list`:
   block rows, full-width top label, control on its own line, and restore the hover wash the
   generic skin kills. Higher specificity + `!important` so it beats the skin above. */
.console-content :deep(.env-list .el-form) {
  padding: 0;
  background: none;
  border: none;
  border-radius: 0;
  overflow: visible;
}
.console-content :deep(.env-list .el-form-item) {
  display: block !important;
  align-items: initial !important;
  justify-content: initial !important;
  gap: 0 !important;
  padding: 8px 10px !important;
  margin: 0 0 12px !important;
  border: 1px solid transparent !important;
  border-radius: 10px !important;
  background: none !important;
  box-shadow: none !important;
}
.console-content :deep(.env-list .el-form-item:last-child) {
  border-bottom: 1px solid transparent !important;
}
.console-content :deep(.env-list .el-form-item:hover) {
  background: var(--dsh-wash-soft) !important;
  border-color: color-mix(in srgb, var(--accent) 22%, var(--border)) !important;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 14%, transparent) inset !important;
}
.console-content :deep(.env-list .el-form-item__label) {
  flex: none !important;
  align-self: auto !important;
  width: auto !important;
  max-width: none !important;
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap;
  align-items: center !important;
  text-align: left !important;
  padding: 0 0 4px !important;
  font-size: 13px;
  font-weight: 600;
  color: var(--text) !important;
}
.console-content :deep(.env-list .el-form-item__content) {
  flex: none !important;
  width: 100% !important;
  justify-content: flex-start !important;
  margin-left: 0 !important;
}

/* ---- segmented controls → design mockup pills -----------------------------------------
   The mockup renders 主题 / 语言 / 布局 as detached rounded-rectangle pills — a neutral well
   when idle, the accent fill + a soft outer glow when selected — instead of Element Plus's
   joined radio-button strip. Re-skinned from here (`:deep`) so only the console context changes;
   the standalone panel / IM surfaces keep EP's default look. */
.console-content :deep(.el-radio-group) {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.console-content :deep(.el-radio-button__inner) {
  /* EP pins a fixed height on the small radio inner; with our extra vertical padding + line-height
     the inline-block text box then overflows downward and the label reads as sitting low. Center it
     with flex and let the symmetric padding define the height instead. */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: auto !important;
  border: 1px solid var(--border) !important;
  border-radius: 10px !important;
  padding: 7px 18px !important;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  color: var(--text-dim) !important;
  background: color-mix(in srgb, var(--text) 6%, transparent) !important;
  box-shadow: none !important;
  transition:
    background-color 0.16s ease,
    color 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}
.console-content :deep(.el-radio-button__inner:hover) {
  color: var(--text) !important;
  background: color-mix(in srgb, var(--text) 12%, transparent) !important;
}
.console-content :deep(.el-radio-button.is-active .el-radio-button__inner),
.console-content :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  /* `--on-accent` tracks the accent's luminance (App.vue), so a light 主题色 gets dark ink
     instead of unreadable white. Falls back to white for the built-in blue accents. */
  color: var(--on-accent, #fff) !important;
  background: var(--accent) !important;
  border-color: var(--accent) !important;
  box-shadow: 0 3px 12px color-mix(in srgb, var(--accent) 42%, transparent) !important;
}
/* Selects read as rounded rectangles too, so a row's right-hand control matches the pills. */
.console-content :deep(.el-select__wrapper) {
  border-radius: 10px !important;
}
/* The accent-color trigger is a round swatch inside a thin ring in the mockup, not EP's default
   square box — round the outer trigger and the inner swatch together so the gap reads as a ring. */
.console-content :deep(.el-color-picker__trigger) {
  width: 30px;
  height: 30px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: color-mix(in srgb, var(--text) 6%, transparent);
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}
.console-content :deep(.el-color-picker__color),
.console-content :deep(.el-color-picker__color-inner) {
  border: none;
  border-radius: 50%;
}
.console-content :deep(.el-color-picker__trigger:hover) {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}
</style>
