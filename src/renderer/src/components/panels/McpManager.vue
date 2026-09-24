<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Plus, Edit, Delete, Link, CircleClose, ArrowRight } from '@element-plus/icons-vue'
import EmptyState from '@renderer/components/base/EmptyState.vue'
import { t } from '@renderer/i18n'
import { useTasksStore } from '@renderer/stores/tasks'
import { mcpToolKey, type ContainerMcpInfo, type McpBridgeInfo, type McpPkgStatus, type McpServerSpec, type McpServerState, type McpToolInfo } from '@shared/types'
import { copyToClipboard } from '@renderer/askAi'

/**
 * MCP Client Hub panel: manages the registry of stdio MCP servers the container
 * connects to as a client. Rows show live hub state (pushed over OnMcpStateChanged,
 * so connect results from auto-start or another window land without a manual refresh);
 * expanding a connected row lists its tools and offers a raw JSON test call.
 */

interface McpResult<T> {
  ok: boolean
  data?: T
  error?: string
}

const servers = ref<McpServerState[]>([])
const loading = ref(false)
const busy = reactive<Record<string, boolean>>({})
const expanded = ref<string | null>(null)
const tools = ref<McpToolInfo[]>([])
const toolsLoading = ref(false)
// Where the main process mirrors the registry for hosted agents (mcp-bridge exports).
const bridge = ref<McpBridgeInfo | null>(null)
// #11: the container's OWN MCP server (reverse bridge) — live connection info for external agents.
const containerMcp = ref<ContainerMcpInfo | null>(null)

async function loadContainerMcp(): Promise<void> {
  try {
    const r = await window.container.getContainerMcpInfo?.()
    if (r?.ok) containerMcp.value = r.data ?? null
  } catch {
    /* a missing info read just hides the card */
  }
}

async function copyContainerMcp(kind: 'url' | 'token'): Promise<void> {
  const value = kind === 'url' ? containerMcp.value?.url : containerMcp.value?.tokenFile
  if (!value) return
  const err = await copyToClipboard(value)
  if (err) ElMessage.error(t('mcpMgr.msgCopyFail'))
  else ElMessage.success(t('mcpMgr.msgCopied'))
}

/* ---- curated package provisioning (userData/mcp, downloaded on demand) ----
   A curated row (locked `filesystem` or a seeded default) that still runs its stock
   `npx -y <pkg>` spec can't connect offline until its npm package is downloaded; the row
   then offers this in-panel download (same bundled-npm path as 帮助 ▸ 更新检测's group row).
   A row the user edited away from that spec is theirs — we no longer claim its package. */
const tasks = useTasksStore()
const pkgStatus = reactive<Record<string, McpPkgStatus>>({})
/** Untouched curated invocation? The stored spec still reads `npx ... <its package>`. */
const isCuratedDefault = (s: McpServerState): boolean => {
  const st = pkgStatus[s.spec.id]
  return !!st && s.spec.command === 'npx' && (s.spec.args ?? []).includes(st.pkg)
}
const pkgMissing = (s: McpServerState): boolean =>
  isCuratedDefault(s) && pkgStatus[s.spec.id]?.installed === false

async function loadPkgStatus(): Promise<void> {
  try {
    const r = (await window.container.mcpPackagesStatus?.()) as McpResult<McpPkgStatus[]>
    if (r?.ok) for (const s of r.data ?? []) pkgStatus[s.id] = s
  } catch {
    /* status is an affordance only — a failed probe just hides the download button */
  }
}

async function downloadPackages(): Promise<void> {
  const out = await tasks.installBuiltin('mcp')
  if (!out) return
  // The main process rebuilt the built-in rows after the download; re-pull state + status
  // so the rows switch from the npx fallback to the local launcher without a panel reopen.
  await Promise.all([loadPkgStatus(), load()])
}

async function copyBridgePath(): Promise<void> {
  if (!bridge.value) return
  const err = await copyToClipboard(bridge.value.configFile)
  if (err) ElMessage.error(t('mcpMgr.msgCopyFail'))
  else ElMessage.success(t('mcpMgr.msgCopied'))
}

/* ---- edit dialog ---- */
interface SpecForm {
  id: string
  name: string
  command: string
  argsText: string
  envText: string
  cwd: string
  enabled: boolean
  autoStart: boolean
}
const dialogVisible = ref(false)
const editingOriginalId = ref<string | null>(null)
const form = ref<SpecForm>(emptyForm())
const saving = ref(false)

/* Curated servers that are inert without a user secret (seeded disabled): id → the env var
   they read and where to mint one. Drives the edit dialog's placeholder + hint so the user
   knows exactly which KEY to fill — the value is still theirs to paste into the env box. */
const CRED_ENV_HINT: Record<string, { key: string; url: string }> = {
  github: { key: 'GITHUB_PERSONAL_ACCESS_TOKEN', url: 'https://github.com/settings/tokens' },
  'brave-search': { key: 'BRAVE_API_KEY', url: 'https://api-dashboard.search.brave.com/app/keys' }
}
const credHint = computed(() => CRED_ENV_HINT[form.value.id.trim()])
function openKeyLink(url: string): void {
  void window.container.openExternal?.(url)
}

function emptyForm(): SpecForm {
  return { id: '', name: '', command: '', argsText: '', envText: '', cwd: '', enabled: true, autoStart: false }
}

/** args: shell-ish single line, quoted segments allowed (":path with space:"). */
function parseArgsText(text: string): string[] {
  return (
    text.match(/"[^"]*"|'[^']*'|\S+/g)?.map((s) => s.replace(/^["']|["']$/g, '')) ?? []
  ).filter((s) => s.length)
}

function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const mm = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (mm) out[mm[1]] = mm[2]
  }
  return out
}

function openCreate(): void {
  editingOriginalId.value = null
  form.value = emptyForm()
  dialogVisible.value = true
}

function openEdit(s: McpServerState): void {
  editingOriginalId.value = s.spec.id
  form.value = {
    id: s.spec.id,
    name: s.spec.name,
    command: s.spec.command,
    argsText: (s.spec.args ?? []).join(' '),
    envText: Object.entries(s.spec.env ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
    cwd: s.spec.cwd ?? '',
    enabled: s.spec.enabled !== false,
    autoStart: s.spec.autoStart === true
  }
  dialogVisible.value = true
}

async function saveForm(): Promise<void> {
  const f = form.value
  const spec: McpServerSpec = {
    id: f.id.trim(),
    name: f.name.trim() || f.id.trim(),
    command: f.command.trim(),
    args: parseArgsText(f.argsText),
    env: parseEnvText(f.envText),
    cwd: f.cwd.trim(),
    enabled: f.enabled,
    autoStart: f.autoStart
  }
  if (!spec.id || !spec.command) {
    ElMessage.warning(t('mcpMgr.msgNeedIdCommand'))
    return
  }
  // Editing the immutable key of a live row would orphan its connection: require remove+add.
  if (editingOriginalId.value && editingOriginalId.value !== spec.id) {
    ElMessage.warning(t('mcpMgr.msgIdImmutable'))
    return
  }
  saving.value = true
  try {
    const r = await window.container.mcpSaveServer(spec)
    if (!r.ok) throw new Error(r.error || t('common.unknownError'))
    servers.value = (r.data ?? []) as McpServerState[]
    dialogVisible.value = false
    ElMessage.success(t('mcpMgr.msgSaved'))
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    saving.value = false
  }
}

async function removeServer(s: McpServerState): Promise<void> {
  try {
    await ElMessageBox.confirm(t('mcpMgr.removeConfirm', { name: s.spec.name }), t('mcpMgr.removeTitle'), {
      type: 'warning',
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel')
    })
  } catch {
    return
  }
  const r = await window.container.mcpRemoveServer(s.spec.id)
  if (!r.ok) ElMessage.error(r.error || t('common.unknownError'))
  else {
    servers.value = (r.data ?? []) as McpServerState[]
    if (expanded.value === s.spec.id) expanded.value = null
  }
}

async function toggleConnect(s: McpServerState): Promise<void> {
  busy[s.spec.id] = true
  try {
    const r =
      s.status === 'connected'
        ? await window.container.mcpDisconnect(s.spec.id)
        : await window.container.mcpConnect(s.spec.id)
    if (!r.ok) ElMessage.error(r.error || t('mcpMgr.msgOpFail'))
    // success arrives via the state broadcast; a refresh keeps the row tool counts fresh
    await load()
  } finally {
    busy[s.spec.id] = false
  }
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const r = (await window.container.mcpListServers()) as McpResult<McpServerState[]>
    if (!r.ok) throw new Error(r.error || t('common.statusFail'))
    servers.value = r.data ?? []
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

async function toggleExpand(s: McpServerState): Promise<void> {
  if (expanded.value === s.spec.id) {
    expanded.value = null
    return
  }
  expanded.value = s.spec.id
  tools.value = []
  if (s.status !== 'connected') return
  toolsLoading.value = true
  try {
    const r = (await window.container.mcpListTools(s.spec.id)) as McpResult<McpToolInfo[]>
    tools.value = r.ok ? r.data ?? [] : []
  } finally {
    toolsLoading.value = false
  }
}

/* ---- test call dialog ---- */
const callVisible = ref(false)
const callTool = ref<McpToolInfo | null>(null)
const callArgs = ref('{}')
const callBusy = ref(false)
const callResult = ref<string | null>(null)

/** One JSON-schema property → a type-correct skeleton value, so the first 测试调用 has a
    fighting chance of passing server-side validation: a '' in a boolean/integer field never
    does (sequential-thinking rejects `""` with -32602). Honors `default`, `enum` and
    `examples` when the schema carries them; numbers start at `minimum` (that tool wants ≥1). */
function seedValue(prop: unknown): unknown {
  if (!prop || typeof prop !== 'object') return ''
  const p = prop as Record<string, unknown>
  if ('default' in p) return p.default
  if (Array.isArray(p.enum) && p.enum.length) return p.enum[0]
  if (Array.isArray(p.examples) && p.examples.length) return p.examples[0]
  // `type` may be a union (e.g. ["string","null"]): the first non-null member wins.
  const type = Array.isArray(p.type) ? p.type.find((t) => t !== 'null') : p.type
  switch (type) {
    case 'boolean':
      return false
    case 'number':
    case 'integer':
      return typeof p.minimum === 'number' ? p.minimum : 0
    case 'array':
      return []
    case 'object':
      return {}
    default:
      return ''
  }
}

function openCall(tool: McpToolInfo): void {
  callTool.value = tool
  // Seed a skeleton from the schema so one click gets a valid request shape: every required
  // prop plus any optional one the schema hints at (default/enum/examples). Optional props
  // without a hint stay out — a prefilled `isRevision: false` is still a value the server
  // sees, and guessing semantics is worse than leaving the field for the user to add.
  const schema = (tool.inputSchema ?? {}) as {
    properties?: Record<string, unknown>
    required?: unknown
  }
  const props = schema.properties ?? {}
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.map((k) => String(k)) : []
  )
  const skeleton: Record<string, unknown> = {}
  for (const [key, prop] of Object.entries(props)) {
    const p = (prop ?? {}) as Record<string, unknown>
    const hinted = 'default' in p || Array.isArray(p.examples) || Array.isArray(p.enum)
    if (required.has(key) || hinted) skeleton[key] = seedValue(prop)
  }
  callArgs.value = JSON.stringify(skeleton, null, 2)
  callResult.value = null
  callVisible.value = true
}

async function runCall(): Promise<void> {
  const tool = callTool.value
  if (!tool) return
  let args: Record<string, unknown>
  try {
    args = JSON.parse(callArgs.value || '{}')
  } catch {
    ElMessage.error(t('mcpMgr.msgBadJson'))
    return
  }
  callBusy.value = true
  try {
    const r = (await window.container.mcpCallTool({
      serverId: tool.serverId,
      tool: tool.name,
      arguments: args
    })) as McpResult<{ text: string; isError: boolean; durationMs: number }>
    if (!r.ok) callResult.value = t('mcpMgr.callFailed', { err: r.error || t('common.unknownError') })
    else if (r.data)
      callResult.value =
        (r.data.isError ? t('mcpMgr.callIsError') : t('mcpMgr.callOk', { ms: r.data.durationMs })) +
        '\n' +
        r.data.text
  } finally {
    callBusy.value = false
  }
}

/* ---- status vocabulary ---- */
const dotClass = computed(() => (s: McpServerState['status']): string => `dot-${s}`)

let unsubscribe: (() => void) | null = null
onMounted(async () => {
  await load()
  void loadPkgStatus()
  void loadContainerMcp()
  window.container
    .mcpBridgeInfo?.()
    .then((r: McpResult<McpBridgeInfo>) => {
      if (r?.ok) bridge.value = r.data ?? null
    })
    .catch(() => undefined)
  unsubscribe = window.container.onMcpStateChanged((states) => {
    servers.value = states as McpServerState[]
  })
})
onBeforeUnmount(() => {
  unsubscribe?.()
})
</script>

<template>
  <div v-loading="loading && !servers.length" class="mcp-manager">
    <div class="head neon">
      <div class="ver">
        <b>{{ t('mcpMgr.title') }}</b>
        <el-tag size="small" effect="plain" round>{{ t('mcpMgr.stdioOnly') }}</el-tag>
      </div>
      <div class="head-actions">
        <el-button size="small" text :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>
        </el-button>
        <el-button size="small" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>
          {{ t('mcpMgr.add') }}
        </el-button>
      </div>
    </div>

    <div class="bridge-hint">
      <span>{{ t('mcpMgr.bridgeHint') }}</span>
      <code v-if="bridge">{{ bridge.configFile }}</code>
      <el-button v-if="bridge" size="small" text type="primary" @click="copyBridgePath">
        {{ t('mcpMgr.copyPath') }}
      </el-button>
    </div>

    <!-- #11: the container's own reverse MCP server — show how an external agent reaches it. -->
    <div v-if="containerMcp?.running" class="container-mcp-card">
      <div class="cm-head">
        <span class="cm-title">{{ t('mcpMgr.containerMcpTitle') }}</span>
        <el-tag size="small" type="success" effect="dark" round>{{ t('mcpMgr.containerMcpRunning') }}</el-tag>
      </div>
      <div class="cm-row">
        <span class="cm-label">{{ t('mcpMgr.containerMcpUrl') }}</span>
        <code>{{ containerMcp.url }}</code>
        <el-button size="small" text type="primary" @click="copyContainerMcp('url')">
          {{ t('mcpMgr.copyPath') }}
        </el-button>
      </div>
      <div class="cm-row">
        <span class="cm-label">{{ t('mcpMgr.containerMcpToken') }}</span>
        <code class="cm-token">{{ containerMcp.tokenFile }}</code>
        <el-button size="small" text type="primary" @click="copyContainerMcp('token')">
          {{ t('mcpMgr.copyPath') }}
        </el-button>
      </div>
      <div class="cm-hint">{{ t('mcpMgr.containerMcpHint') }}</div>
    </div>

    <EmptyState
      v-if="!loading && !servers.length"
      :description="t('mcpMgr.empty')"
      :hint="t('mcpMgr.emptyHint')"
      tone="muted"
    />

    <div v-else class="server-list">
      <div v-for="s in servers" :key="s.spec.id" class="server-row glass-soft">
        <div class="row-main" @click="toggleExpand(s)">
          <span class="status-dot" :class="dotClass(s.status)" />
          <span class="sname">{{ s.spec.name }}</span>
          <code class="scmd">{{ s.spec.command }}{{ (s.spec.args || []).join(' ') ? ' …' : '' }}</code>
          <el-tag v-if="s.spec.autoStart" size="small" effect="plain" round>{{ t('mcpMgr.autoStart') }}</el-tag>
          <el-tag v-if="s.spec.builtin" size="small" effect="plain" round class="builtin-tag" :title="t('mcpMgr.builtinTip')">
            {{ t('mcpMgr.builtinTag') }}
          </el-tag>
          <el-tag v-if="s.spec.enabled === false" size="small" type="info" round>{{ t('mcpMgr.disabled') }}</el-tag>
          <span v-if="s.toolCount" class="tool-count">{{ t('mcpMgr.toolsN', { n: s.toolCount }) }}</span>
          <span class="spacer" />
          <el-tooltip
            :content="s.status === 'connected' ? t('mcpMgr.disconnect') : t('mcpMgr.connect')"
            placement="top"
            popper-class="dsh-tip-popper"
          >
            <el-button
              size="small"
              text
              :loading="busy[s.spec.id]"
              :disabled="s.spec.enabled === false"
              @click.stop="toggleConnect(s)"
            >
              <el-icon><component :is="s.status === 'connected' ? CircleClose : Link" /></el-icon>
            </el-button>
          </el-tooltip>
          <!-- Built-in rows are code-owned: no edit/delete affordance at all (the main
               process guards both paths too), leaving connect + tool browsing. -->
          <el-tooltip
            v-if="!s.spec.builtin"
            :content="t('mcpMgr.edit')"
            placement="top"
            popper-class="dsh-tip-popper"
          >
            <el-button size="small" text @click.stop="openEdit(s)">
              <el-icon><Edit /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip
            v-if="!s.spec.builtin"
            :content="t('common.delete')"
            placement="top"
            popper-class="dsh-tip-popper"
          >
            <el-button size="small" text @click.stop="removeServer(s)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </el-tooltip>
          <el-icon class="caret" :class="{ open: expanded === s.spec.id }"><ArrowRight /></el-icon>
        </div>
        <div v-if="s.lastError" class="row-error">{{ s.lastError }}</div>
        <!-- Package not downloaded yet (offline machine, fresh install): offer the fix here —
             same bundled-npm provisioning as the update-check row, no need to leave the panel. -->
        <div v-if="pkgMissing(s) && s.status !== 'connected'" class="row-pkg">
          <span>{{ t('mcpMgr.pkgMissing') }}</span>
          <el-button
            size="small"
            type="primary"
            text
            :loading="tasks.busyBuiltin('mcp')"
            @click.stop="downloadPackages"
          >
            {{ t('mcpMgr.pkgDownload') }}
          </el-button>
        </div>
        <div v-if="expanded === s.spec.id" v-loading="toolsLoading" class="row-tools">
          <div v-if="s.status !== 'connected'" class="tools-hint">{{ t('mcpMgr.toolsNeedConnect') }}</div>
          <template v-else>
            <div v-for="tool in tools" :key="mcpToolKey(tool.serverId, tool.name)" class="tool-row">
              <div class="tool-name">
                <b>{{ tool.title || tool.name }}</b>
                <code v-if="tool.title">{{ tool.name }}</code>
              </div>
              <div class="tool-desc">{{ tool.description || '—' }}</div>
              <el-button size="small" text type="primary" @click="openCall(tool)">
                {{ t('mcpMgr.testCall') }}
              </el-button>
            </div>
            <div v-if="!tools.length && !toolsLoading" class="tools-hint">{{ t('mcpMgr.toolsEmpty') }}</div>
          </template>
        </div>
      </div>
    </div>

    <!-- add / edit spec -->
    <el-dialog v-model="dialogVisible" :title="t('mcpMgr.dialogTitle')" width="520px" append-to-body>
      <el-form label-position="top" size="small">
        <div class="form-cols">
          <el-form-item :label="t('mcpMgr.fId')">
            <el-input v-model="form.id" :disabled="!!editingOriginalId" placeholder="filesystem" />
          </el-form-item>
          <el-form-item :label="t('mcpMgr.fName')">
            <el-input v-model="form.name" :placeholder="form.id || 'Filesystem'" />
          </el-form-item>
        </div>
        <el-form-item :label="t('mcpMgr.fCommand')">
          <el-input v-model="form.command" placeholder="npx / node / python" />
        </el-form-item>
        <el-form-item :label="t('mcpMgr.fArgs')">
          <el-input v-model="form.argsText" placeholder="-y @modelcontextprotocol/server-filesystem D:\shared" />
        </el-form-item>
        <el-form-item :label="t('mcpMgr.fEnv')">
          <el-input
            v-model="form.envText"
            type="textarea"
            :rows="3"
            :placeholder="credHint ? `${credHint.key}=` : 'KEY=value'"
          />
          <div v-if="credHint" class="env-hint">
            <span>{{ t('mcpMgr.envKeyHint', { key: credHint.key }) }}</span>
            <el-button size="small" text type="primary" @click="openKeyLink(credHint.url)">
              {{ t('mcpMgr.envKeyGet') }}
            </el-button>
          </div>
        </el-form-item>
        <el-form-item :label="t('mcpMgr.fCwd')">
          <el-input v-model="form.cwd" />
        </el-form-item>
        <div class="form-cols">
          <el-form-item>
            <el-switch v-model="form.enabled" :active-text="t('mcpMgr.fEnabled')" />
          </el-form-item>
          <el-form-item>
            <el-switch v-model="form.autoStart" :active-text="t('mcpMgr.fAutoStart')" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button size="small" @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="saveForm">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- raw test call -->
    <el-dialog
      v-model="callVisible"
      :title="t('mcpMgr.callTitle', { tool: callTool?.title || callTool?.name || '' })"
      width="560px"
      append-to-body
    >
      <div class="sub">{{ t('mcpMgr.callArgs') }}</div>
      <el-input v-model="callArgs" type="textarea" :rows="6" class="call-args" />
      <template v-if="callResult !== null">
        <div class="sub">{{ t('mcpMgr.callResult') }}</div>
        <pre class="call-result">{{ callResult }}</pre>
      </template>
      <template #footer>
        <el-button size="small" @click="callVisible = false">{{ t('common.close') }}</el-button>
        <el-button size="small" type="primary" :loading="callBusy" @click="runCall">
          {{ t('mcpMgr.testCall') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.mcp-manager {
  min-height: 120px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.ver {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.server-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bridge-hint {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  opacity: 0.8;
  margin-bottom: 10px;
}

.bridge-hint code {
  font-size: 11px;
  word-break: break-all;
}

.container-mcp-card {
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.container-mcp-card .cm-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.container-mcp-card .cm-title {
  font-weight: 600;
}
.container-mcp-card .cm-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.container-mcp-card .cm-label {
  min-width: 92px;
  opacity: 0.75;
}
.container-mcp-card code {
  font-size: 11px;
  word-break: break-all;
}
.container-mcp-card .cm-token {
  opacity: 0.85;
}
.container-mcp-card .cm-hint {
  opacity: 0.7;
  line-height: 1.5;
}

.builtin-tag {
  flex-shrink: 0;
}

.server-row {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
}

.row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  min-width: 0;
}

.sname {
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.scmd {
  font-size: 11px;
  color: var(--text-dim);
  background: var(--glass-chip);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 5px;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-count {
  font-size: 11px;
  color: var(--text-dim);
}

.spacer {
  flex: 1;
}

.caret {
  transition: transform 0.15s ease;
  color: var(--text-dim);
}
.caret.open {
  transform: rotate(90deg);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--text-dim);
}
.dot-connected {
  background: var(--el-color-success);
  box-shadow: 0 0 6px var(--el-color-success);
}
.dot-connecting {
  background: var(--el-color-warning);
  animation: pulse 1s infinite;
}
.dot-error {
  background: var(--el-color-danger);
}
.dot-stopped {
  opacity: 0.4;
}
@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}

.row-error {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-color-danger);
  word-break: break-all;
}

.row-pkg {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-color-warning);
}

.env-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--el-color-warning);
}

.row-tools {
  margin-top: 8px;
  border-top: 1px dashed var(--border);
  padding-top: 6px;
  min-height: 30px;
}

.tools-hint {
  font-size: 12px;
  color: var(--text-dim);
}

.tool-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 3px 0;
  font-size: 12px;
}
.tool-row + .tool-row {
  border-top: 1px solid var(--border);
}
.tool-name {
  flex-shrink: 0;
  min-width: 160px;
}
.tool-name code {
  margin-left: 6px;
  font-size: 10px;
  color: var(--text-dim);
}
.tool-desc {
  flex: 1;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form-cols {
  display: flex;
  gap: 12px;
}
.form-cols > * {
  flex: 1;
}

.sub {
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 4px;
}

.call-result {
  margin-top: 8px;
  max-height: 220px;
  overflow: auto;
  background: var(--glass-well);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
