import { reactive, ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { t } from '../i18n'

export interface TerminalSession {
  id: string
  target: string
  title: string
  cwd: string
  status: 'open' | 'exited'
  exitCode?: number
  /** Picker shell id this session was started with (undefined = the platform default). */
  shell?: string
  /** Raw bytes this session received; capped, used to repaint a pane when its group re-mounts. */
  buffer: string
}

/**
 * A terminal group's split tree. A leaf is one pane bound to a session; a split lays its children
 * out side-by-side ('h') or stacked ('v') with per-child percentage `sizes`. Splits nest, so a
 * child of a split is itself a node — that is what gives VSCode-style recursive tiling.
 */
export type SplitNode =
  | { kind: 'leaf'; id: string; sessionId: string }
  | { kind: 'split'; id: string; direction: 'h' | 'v'; children: SplitNode[]; sizes: number[] }

export interface TerminalGroup {
  id: string
  root: SplitNode
  activeSessionId: string | null
}

const MAX_BUFFER = 256 * 1024
/** Cap for sessions with no mounted pane (closed drawer / background group): enough replay to
    repaint usefully, without letting idle background shells accumulate at the full budget. */
const MAX_BUFFER_HIDDEN = 64 * 1024

async function unwrap<T>(p: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const res = await p
  if (!res.ok) throw new Error(res.error || t('common.terminalStartFail'))
  return res.data as T
}

let nodeSeq = 0
let groupSeq = 0
const newNodeId = (): string => `node-${Date.now().toString(36)}-${++nodeSeq}`
const newGroupId = (): string => `grp-${Date.now().toString(36)}-${++groupSeq}`
const evenSizes = (n: number): number[] => Array.from({ length: n }, () => 100 / n)
const makeLeaf = (sessionId: string): SplitNode => ({ kind: 'leaf', id: newNodeId(), sessionId })
const makeSplit = (direction: 'h' | 'v', children: SplitNode[]): SplitNode => ({
  kind: 'split',
  id: newNodeId(),
  direction,
  children,
  sizes: evenSizes(children.length)
})

/* ---- pure tree surgery (returns fresh nodes so the reactive tree updates cleanly) ---- */

/** Find the leaf bound to `sessionId`. */
function findLeaf(node: SplitNode, sessionId: string): SplitNode | null {
  if (node.kind === 'leaf') return node.sessionId === sessionId ? node : null
  for (const c of node.children) {
    const r = findLeaf(c, sessionId)
    if (r) return r
  }
  return null
}

/** Ordered session ids of every leaf (used for the list view and active-pane fallbacks). */
function collectLeaves(node: SplitNode): string[] {
  return node.kind === 'leaf' ? [node.sessionId] : node.children.flatMap(collectLeaves)
}

function firstLeafSession(node: SplitNode): string | null {
  return node.kind === 'leaf' ? node.sessionId : (node.children.map(firstLeafSession).find((x) => x !== null) ?? null)
}

/** Locate a split node by id (for divider-drag size writes). */
function findSplit(node: SplitNode, id: string): Extract<SplitNode, { kind: 'split' }> | null {
  if (node.kind === 'leaf') return null
  if (node.id === id) return node
  for (const c of node.children) {
    const r = findSplit(c, id)
    if (r) return r
  }
  return null
}

/**
 * Split the leaf for `target` into a group containing it plus `newLeaf`. If the leaf's parent split
 * already runs in `direction`, the new pane joins it as a sibling; otherwise the leaf is wrapped in
 * a new opposite-oriented split — which is how nested 2-D tiling emerges. Returns a new tree, or the
 * node unchanged when `target` isn't in it.
 */
function splitTree(
  node: SplitNode,
  target: string,
  newLeaf: SplitNode,
  direction: 'h' | 'v'
): SplitNode {
  if (node.kind === 'leaf') {
    return node.sessionId === target ? makeSplit(direction, [node, newLeaf]) : node
  }
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    if (child.kind === 'leaf' && child.sessionId === target) {
      const children = [...node.children]
      if (node.direction === direction) {
        children.splice(i + 1, 0, newLeaf)
        return { ...node, children, sizes: evenSizes(children.length) }
      }
      children[i] = makeSplit(direction, [child, newLeaf])
      return { ...node, children }
    }
    if (child.kind === 'split') {
      const replaced = splitTree(child, target, newLeaf, direction)
      if (replaced !== child) {
        const children = [...node.children]
        children[i] = replaced
        return { ...node, children }
      }
    }
  }
  return node
}

/** Remove a leaf, collapsing any split left with a single child; null when the subtree empties. */
function removeLeaf(node: SplitNode, sessionId: string): SplitNode | null {
  if (node.kind === 'leaf') return node.sessionId === sessionId ? null : node
  const children: SplitNode[] = []
  for (const c of node.children) {
    const r = removeLeaf(c, sessionId)
    if (r) children.push(r)
  }
  if (children.length === 0) return null
  if (children.length === 1) return children[0]
  return { ...node, children, sizes: evenSizes(children.length) }
}

/**
 * Owns terminal groups (tabs), each holding a split tree of sessions (one PTY per pane), plus the
 * drawer visibility. A single global OnPtyData subscription buffers every session (so background
 * groups keep their scrollback); mounted panes subscribe themselves to paint live output.
 *
 * Nothing is persisted across launches: every time the drawer is opened it starts from a clean set
 * of shells (per the product direction — a closed terminal is gone for good).
 */
export const useTerminalStore = defineStore('terminal', () => {
  const sessions = reactive<TerminalSession[]>([])
  const groups = reactive<TerminalGroup[]>([])
  const activeGroupId = ref<string | null>(null)
  const open = ref(false)

  const activeGroup = computed(() => groups.find((g) => g.id === activeGroupId.value) || null)
  const activeSession = computed(() => {
    const g = activeGroup.value
    return g ? sessions.find((s) => s.id === g.activeSessionId) || null : null
  })
  /** Back-compat getter for anything that still reads the focused session id. */
  const activeId = computed(() => activeGroup.value?.activeSessionId ?? null)

  function sessionById(id: string): TerminalSession | undefined {
    return sessions.find((s) => s.id === id)
  }
  function groupBySession(id: string): TerminalGroup | undefined {
    return groups.find((g) => !!findLeaf(g.root, id))
  }

  /** Accumulate output for every session — background groups have no mounted pane to buffer it. */
  function feed(id: string, data: string): void {
    const s = sessionById(id)
    if (!s) return
    // Only the active group's sessions have a pane on screen; the rest run at the trimmed cap.
    const cap = open.value && activeGroupId.value === groupBySession(id)?.id ? MAX_BUFFER : MAX_BUFFER_HIDDEN
    if (s.buffer.length > cap) s.buffer = s.buffer.slice(-(cap / 2))
    s.buffer += data
  }

  /** Spawn one PTY + register its session; does not touch groups/active. */
  async function spawnSession(
    target: string,
    title: string,
    shell?: string
  ): Promise<TerminalSession> {
    const info = await unwrap<{ id: string; title: string; cwd: string }>(
      window.container.ptyStart(target, shell ? { shell } : undefined)
    )
    const session: TerminalSession = {
      id: info.id,
      target,
      title: title || info.title,
      cwd: info.cwd,
      status: 'open',
      shell,
      buffer: ''
    }
    sessions.push(session)
    return session
  }

  /** Start a fresh group (tab) running one shell. */
  async function start(target: string, title: string, shell?: string): Promise<TerminalSession> {
    const session = await spawnSession(target, title, shell)
    const group: TerminalGroup = {
      id: newGroupId(),
      root: makeLeaf(session.id),
      activeSessionId: session.id
    }
    groups.push(group)
    activeGroupId.value = group.id
    open.value = true
    return session
  }

  /** Add a pane beside `sessionId` in its group, running the same target/shell by default. */
  async function split(
    sessionId: string,
    direction: 'h' | 'v' = 'h'
  ): Promise<TerminalSession | undefined> {
    const group = groupBySession(sessionId)
    if (!group) return
    const src = sessionById(sessionId)
    const session = await spawnSession(
      src?.target ?? 'container',
      src?.title ?? '',
      src?.shell
    )
    group.root = splitTree(group.root, sessionId, makeLeaf(session.id), direction)
    group.activeSessionId = session.id
    activeGroupId.value = group.id
    open.value = true
    return session
  }

  function focusSession(id: string): void {
    const g = groupBySession(id)
    if (!g) return
    g.activeSessionId = id
    activeGroupId.value = g.id
    open.value = true
  }
  function focus(id: string): void {
    focusSession(id)
  }
  function focusGroup(id: string): void {
    if (!groups.some((g) => g.id === id)) return
    activeGroupId.value = id
    open.value = true
  }

  /** Divider drag writes new child percentages onto a split node. */
  function resizeSplit(groupId: string, splitId: string, sizes: number[]): void {
    const g = groups.find((x) => x.id === groupId)
    if (!g) return
    const node = findSplit(g.root, splitId)
    if (node) node.sizes = sizes
  }

  function close(id: string): void {
    const group = groupBySession(id)
    window.container.ptyKill(id).catch(() => undefined)
    const sIdx = sessions.findIndex((s) => s.id === id)
    if (sIdx >= 0) sessions.splice(sIdx, 1)
    if (group) {
      const root = removeLeaf(group.root, id)
      if (root) {
        group.root = root
        if (group.activeSessionId === id) group.activeSessionId = firstLeafSession(root)
      } else {
        const gIdx = groups.findIndex((g) => g.id === group.id)
        if (gIdx >= 0) groups.splice(gIdx, 1)
      }
    }
    if (!sessions.length) {
      open.value = false
      activeGroupId.value = null
    } else if (!groups.some((g) => g.id === activeGroupId.value)) {
      activeGroupId.value = groups[0]?.id ?? null
    }
  }

  function toggle(): void {
    open.value = !open.value
  }

  /** Hide the panel and terminate every shell — used by the floating window's close button. */
  function closeAll(): void {
    for (const s of [...sessions]) window.container.ptyKill(s.id).catch(() => undefined)
    sessions.splice(0, sessions.length)
    groups.splice(0, groups.length)
    activeGroupId.value = null
    open.value = false
  }

  // Buffer every chunk once, app-wide, so background groups keep scrollback for repaint + preview.
  window.container?.onPtyData?.(({ id, data }) => feed(id, data))

  // Mark a session exited when its shell process ends; keep it for scrolling/review until closed.
  window.container?.onPtyExit?.(({ id, code }) => {
    const s = sessions.find((x) => x.id === id)
    if (s) {
      s.status = 'exited'
      s.exitCode = code
    }
  })

  return {
    sessions,
    groups,
    activeGroupId,
    activeGroup,
    activeSession,
    activeId,
    open,
    start,
    split,
    focus,
    focusSession,
    focusGroup,
    close,
    closeAll,
    toggle,
    feed,
    resizeSplit,
    sessionById,
    groupBySession,
    collectLeaves
  }
})
