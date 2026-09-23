<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { reduceMotion } from '../stores/settings'
import { usePagesStore } from '../stores/pages'
import type { IpcResult, SystemInfo } from '@shared/types'

/**
 * 默认工作台 = 内置插件市场静态页（原 pages/dsh-plugin-market 的 node server 版本已移除）。
 * 纯渲染层内容：不注册 page、不占端口、不随启动运行；顶部为工作台描述，下方是精选插件。
 */
const emit = defineEmits<{ 'install-pages': []; 'open-panel': [panel: string] }>()

interface MarketPlugin {
  id: string
  tag: string
  name: string
  desc: string
  cmd: string
  desktopCmd: string
  repo: string
  repoLabel: string
}

/** Copy resolves through t() so switching language repaints the cards live. */
const plugins = computed<MarketPlugin[]>(() => [
  {
    id: 'c1',
    tag: t('market.plugin1Tag'),
    name: 'dsh-prompt-library',
    desc: t('market.plugin1Desc'),
    cmd: 'dsh plugin --profile web add @sunjuntao/dsh-prompt-library',
    desktopCmd: '@sunjuntao/dsh-prompt-library',
    repo: 'https://github.com/master1Sun/dsh-prompt-library',
    repoLabel: 'github.com/master1Sun/dsh-prompt-library ↗'
  },
  {
    id: 'c2',
    tag: t('market.plugin2Tag'),
    name: 'dsh-file-workbench-lib',
    desc: t('market.plugin2Desc'),
    cmd: 'dsh plugin --profile web add @sunjuntao/dsh-file-workbench',
    desktopCmd: '@sunjuntao/dsh-file-workbench',
    repo: 'https://github.com/master1Sun/dsh-file-workbench-lib',
    repoLabel: 'github.com/master1Sun/dsh-file-workbench-lib ↗'
  },
  {
    id: 'c3',
    tag: t('market.plugin3Tag'),
    name: 'dsh-QQbot',
    desc: t('market.plugin3Desc'),
    cmd: 'dsh plugin --profile web add @sunjuntao/dsh-qqbot',
    desktopCmd: '@sunjuntao/dsh-qqbot',
    repo: 'https://github.com/master1Sun/dsh-QQbot',
    repoLabel: 'github.com/master1Sun/dsh-QQbot ↗'
  }
])

const copiedId = ref<string | null>(null)
let copyTimer: number | undefined

async function copyText(text: string, key: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Non-secure context (plain-browser dev): fall back to a temporary textarea.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
    } catch {
      /* clipboard unavailable — the command is still selectable/visible */
    }
    ta.remove()
  }
  copiedId.value = key
  window.clearTimeout(copyTimer)
  copyTimer = window.setTimeout(() => (copiedId.value = null), 1500)
}

function copyCommand(p: MarketPlugin): void {
  copyText(p.cmd, p.id)
}

function copyDesktopCommand(p: MarketPlugin): void {
  copyText(p.desktopCmd, p.id + '-desk')
}

/* ---- desktop-console feature panorama: deep links into the real config panels ---- */
interface ConsoleModule {
  kind: string
  icon: string
  title: string
  desc: string
}

/** Copy resolves through t() so switching language repaints the cards live. */
const consoleModules = computed<ConsoleModule[]>(() => [
  { kind: 'pages', icon: '📦', title: t('market.modPagesTitle'), desc: t('market.modPagesDesc') },
  {
    kind: 'external',
    icon: '🌐',
    title: t('market.modExternalTitle'),
    desc: t('market.modExternalDesc')
  },
  { kind: 'dsh', icon: '🧩', title: t('market.modDshTitle'), desc: t('market.modDshDesc') },
  {
    kind: 'openclaw',
    icon: '🐾',
    title: t('market.modOpenclawTitle'),
    desc: t('market.modOpenclawDesc')
  },
  {
    kind: 'settings',
    icon: '⚙️',
    title: t('market.modSettingsTitle'),
    desc: t('market.modSettingsDesc')
  },
  { kind: 'help', icon: '🛟', title: t('market.modHelpTitle'), desc: t('market.modHelpDesc') }
])

function openPanel(kind: string): void {
  emit('open-panel', kind)
}

/* ---- live system + program status readout for the hero terminal ----
 * Pulls a real SystemInfo snapshot from the main process (re-polled on a timer so
 * uptime/memory stay current) and joins it with the shared pages store for the
 * running/total page counters. Degrades to a dimmed placeholder until the first
 * snapshot lands — and in plain-browser dev / unit tests where the bridge is absent. */
const pagesStore = usePagesStore()
const sysInfo = ref<SystemInfo | null>(null)
let sysTimer: number | undefined

async function loadSysInfo(): Promise<void> {
  try {
    // Optional-call chain: a missing/older bridge method short-circuits to undefined, never rejects.
    const res = (await window.container?.getSystemInfo?.()) as IpcResult<SystemInfo> | undefined
    if (res?.ok && res.data) sysInfo.value = res.data
  } catch {
    /* keep the last snapshot; a missing bridge just leaves the placeholder */
  }
}

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}
function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return `${d}d ${h}h ${m}m`
  if (h) return `${h}h ${m}m`
  return `${m}m ${s % 60}s`
}

interface StatusLine {
  label: string
  value: string
}
/* The container ships its own standalone Node (resources/node) that hosts every page —
 * distinct from the Node embedded in the Electron main process (SystemInfo.node). The
 * hero readout reports the *built-in* one, surfaced by the main process via getNodeInfo
 * and kept on the shared pages store. Falls back to an em dash until it resolves. */
const builtinNode = computed(() => {
  const v = pagesStore.nodeInfo.version
  return v ? v.replace(/^v/i, '') : '—'
})
const statusLines = computed<StatusLine[]>(() => {
  const si = sysInfo.value
  if (!si) return [{ label: '…', value: t('market.sysLoading') }]
  const used = Math.max(0, si.totalMem - si.freeMem)
  return [
    {
      label: t('market.sysLblOs'),
      value: t('market.sysOsVal', { type: si.osType, release: si.osRelease, arch: si.arch })
    },
    {
      label: t('market.sysLblHw'),
      value: t('market.sysHwVal', {
        cores: si.cpuCores,
        used: fmtBytes(used),
        total: fmtBytes(si.totalMem)
      })
    },
    {
      label: t('market.sysLblRt'),
      value: t('market.sysRtVal', {
        app: si.appVersion,
        electron: si.electron,
        node: builtinNode.value,
        chrome: si.chrome
      })
    },
    {
      label: t('market.sysLblConsole'),
      value: t('market.sysConsoleVal', {
        modules: consoleModules.value.length,
        running: pagesStore.runningPages.length,
        total: pagesStore.pages.length
      })
    },
    {
      label: t('market.sysLblUptime'),
      value: t('market.sysUptimeVal', {
        app: fmtDuration(si.appUptimeSec),
        os: fmtDuration(si.osUptimeSec)
      })
    }
  ]
})

onMounted(() => {
  void loadSysInfo()
  sysTimer = window.setInterval(() => void loadSysInfo(), 5000)
  // The built-in Node version rides on the pages store (refreshed at app boot). Land it here
  // too so the hero readout is correct even when this view mounts before that boot refresh.
  if (!pagesStore.nodeInfoLoaded) void pagesStore.refresh().catch(() => undefined)
})

/* ---- per-kind neon theme + live status for the console module cards ----
 * statusOf() is a placeholder mapping; wire it to real runtime config state
 * (e.g. pages installed / dsh & openclaw configured) when the host exposes it. */
interface ModuleTheme {
  c1: string
  c2: string
  glow: string
}
const moduleThemes: Record<string, ModuleTheme> = {
  pages: { c1: '#38bdf8', c2: '#22d3ee', glow: 'rgba(56,189,248,0.5)' },
  external: { c1: '#a855f7', c2: '#ec4899', glow: 'rgba(168,85,247,0.5)' },
  dsh: { c1: '#34d399', c2: '#10b981', glow: 'rgba(52,211,153,0.5)' },
  openclaw: { c1: '#fb923c', c2: '#f59e0b', glow: 'rgba(251,146,60,0.5)' },
  settings: { c1: '#6366f1', c2: '#818cf8', glow: 'rgba(99,102,241,0.5)' },
  help: { c1: '#f43f5e', c2: '#fb7185', glow: 'rgba(244,63,94,0.5)' }
}
const moduleStatus: Record<string, 'ready' | 'todo'> = {
  pages: 'ready',
  external: 'todo',
  dsh: 'ready',
  openclaw: 'todo',
  settings: 'ready',
  help: 'ready'
}
function themeOf(kind: string): ModuleTheme {
  return moduleThemes[kind] ?? moduleThemes.pages
}
function statusOf(kind: string): 'ready' | 'todo' {
  return moduleStatus[kind] ?? 'todo'
}

/* ---- scroll reveal + pointer tilt (ported from the original static page) ---- */
const rootEl = ref<HTMLElement | null>(null)
let io: IntersectionObserver | null = null
let tiltCleanups: (() => void)[] = []

onMounted(() => {
  const root = rootEl.value
  if (!root) return
  // jsdom (unit tests) and some plain-browser dev contexts lack these APIs —
  // the reveal/tilt effects are cosmetic, so skip them instead of crashing mount.
  if (typeof IntersectionObserver === 'undefined') return
  io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue
        const el = en.target as HTMLElement
        el.style.transitionDelay = (el.dataset.stagger || 0) + 'ms'
        el.classList.add('in')
        io?.unobserve(el)
      }
    },
    { threshold: 0.15 }
  )
  const reveals = [...root.querySelectorAll<HTMLElement>('.reveal')]
  reveals.forEach((el, i) => {
    if (el.closest('.grid')) el.dataset.stagger = String((i % 3) * 90)
  })
  reveals.forEach((el) => io?.observe(el))

  // Pointer-driven 3D tilt on plugin cards. Driven by the app-wide `reduceMotion` flag instead of
  // a raw matchMedia() probe, so the in-app tri-state setting can override the OS preference.
  watch(reduceMotion, (on) => (on ? detachTilt() : attachTilt()), { immediate: true })
})

function attachTilt(): void {
  const root = rootEl.value
  if (!root || tiltCleanups.length) return
  for (const card of root.querySelectorAll<HTMLElement>('.card, .module')) {
    const onMove = (e: PointerEvent): void => {
      const r = card.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      card.style.transform = `rotateY(${(x * 7).toFixed(2)}deg) rotateX(${(-y * 7).toFixed(
        2
      )}deg) translateY(-4px)`
    }
    const onLeave = (): void => {
      card.style.transform = ''
    }
    card.addEventListener('pointermove', onMove)
    card.addEventListener('pointerleave', onLeave)
    tiltCleanups.push(() => {
      card.removeEventListener('pointermove', onMove)
      card.removeEventListener('pointerleave', onLeave)
    })
  }
}

function detachTilt(): void {
  for (const fn of tiltCleanups) fn()
  tiltCleanups = []
}

onBeforeUnmount(() => {
  io?.disconnect()
  io = null
  detachTilt()
  window.clearTimeout(copyTimer)
  if (sysTimer) window.clearInterval(sysTimer)
})
</script>

<template>
  <div ref="rootEl" class="market-page">
    <div class="aurora">
      <div class="blob b1" />
      <div class="blob b2" />
      <div class="blob b3" />
    </div>
    <div class="noise" />

    <div class="scroll">
      <div class="wrap">
        <header class="hero">
          <span class="whale">&#128051;</span>
          <h1 class="title">{{ t('market.title') }}</h1>
          <p class="tagline">{{ t('market.tagline') }}</p>
          <div class="hero-actions">
            <el-button type="primary" round size="large" @click="emit('install-pages')">{{
              t('market.installBtn')
            }}</el-button>
          </div>
          <div class="terminal">
            <div class="term-bar">
              <i class="dot d-r" /><i class="dot d-y" /><i class="dot d-g" />
              <span class="term-name">{{ t('market.termName') }}</span>
            </div>
            <div class="term-body">
              <div>
                <span class="prompt">$</span>
                <span class="typed">{{ t('market.termCmd') }}</span>
                <span class="caret" />
              </div>
              <div class="status-readout">
                <div v-for="line in statusLines" :key="line.label" class="status-row">
                  <span class="s-label">{{ line.label }}</span>
                  <span class="s-value">{{ line.value }}</span>
                </div>
              </div>
              <span class="ok-badge">&#10003; {{ t('market.okBadge') }}</span>
            </div>
          </div>
        </header>

        <section class="console">
          <div class="console-head">
            <span class="kicker reveal">{{ t('market.consoleKicker') }}</span>
            <h2 class="section reveal">&#128421;&#65039; {{ t('market.consoleHeading') }}</h2>
            <p class="section-sub reveal">{{ t('market.consoleSub') }}</p>
          </div>
          <div class="grid-console">
            <button
              v-for="m in consoleModules"
              :key="m.kind"
              class="module reveal"
              type="button"
              :style="{
                '--c1': themeOf(m.kind).c1,
                '--c2': themeOf(m.kind).c2,
                '--cg': themeOf(m.kind).glow
              }"
              @click="openPanel(m.kind)"
            >
              <span class="mod-status" :class="statusOf(m.kind)">
                <i class="sdot" />{{
                  statusOf(m.kind) === 'ready' ? t('market.modReady') : t('market.modTodo')
                }}
              </span>
              <span class="mod-icon">{{ m.icon }}</span>
              <span class="mod-body">
                <span class="mod-title">{{ m.title }}</span>
                <span class="mod-desc">{{ m.desc }}</span>
              </span>
              <span class="mod-enter">{{ t('market.enterLabel') }} <i class="arrow">→</i></span>
            </button>
          </div>
        </section>

        <section class="features">
          <div class="feat reveal">
            <b>&#9889; {{ t('market.feat1Title') }}</b>
            <span>{{ t('market.feat1Desc') }}</span>
          </div>
          <div class="feat reveal">
            <b>&#128268; {{ t('market.feat2Title') }}</b>
            <span>{{ t('market.feat2Desc') }}</span>
          </div>
          <div class="feat reveal">
            <b>&#128736;&#65039; {{ t('market.feat3Title') }}</b>
            <span>{{ t('market.feat3Desc') }}</span>
          </div>
        </section>

        <h2 class="section reveal">&#128230; {{ t('market.featuredHeading') }}</h2>
        <p class="section-sub reveal">{{ t('market.featuredSub') }}</p>
        <div class="grid">
          <section v-for="(p, i) in plugins" :key="p.id" class="card reveal">
            <span class="idx">{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="tag">{{ p.tag }}</span>
            <h3 class="name">{{ p.name }}</h3>
            <p class="desc">{{ p.desc }}</p>
            <div class="cmd">
              <code>{{ p.cmd }}</code>
              <button class="copy" :class="{ ok: copiedId === p.id }" @click="copyCommand(p)">
                {{ copiedId === p.id ? t('market.copied') : t('market.copy') }}
              </button>
            </div>
            <div class="cmd">
              <code>{{ p.desktopCmd }}</code>
              <button
                class="copy desktop"
                :class="{ ok: copiedId === p.id + '-desk' }"
                @click="copyDesktopCommand(p)"
              >
                {{ copiedId === p.id + '-desk' ? t('market.copied') : t('market.desktopCopy') }}
              </button>
            </div>
            <a class="repo" :href="p.repo" target="_blank" rel="noreferrer">{{ p.repoLabel }}</a>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 欢迎页配色全部走 --mp-* 令牌：默认即原深色配色，html.light（顶栏切到白天）时整页翻浅。 */
html.light .market-page {
  color-scheme: light;
  --mp-bg: #eef1f8;
  --mp-fg: #1b2434;
  --mp-tagline: #5b667a;
  --mp-muted: #64748b;
  --mp-desc: #475569;
  --mp-strong: #334155;
  --mp-card-border: #d5deee;
  --mp-code-bg: #ffffff;
  --mp-link: #2563eb;
  --mp-term-shadow: rgba(15, 23, 42, 0.14);
  --mp-glow-blue: rgba(37, 99, 235, 0.3);
  --mp-glow-purple: rgba(124, 58, 237, 0.3);
  --mp-accent-text: #0369a1;
  --mp-ok-text: #15803d;
  --mp-ok-border: rgba(34, 197, 94, 0.4);
  --mp-ok-bg: rgba(220, 252, 231, 0.6);
  --mp-whale-bg: linear-gradient(140deg, #dbeafe, #ede9fe);
  --mp-whale-border: #bfdbfe;
  --mp-title-grad: linear-gradient(100deg, #1d4ed8 10%, #7c3aed 45%, #0891b2 85%);
  --mp-blob-filter: blur(90px) saturate(110%);
  --mp-blob-opacity: 0.3;
  --mp-b1: rgba(59, 130, 246, 0.35);
  --mp-b2: rgba(139, 92, 246, 0.3);
  --mp-b3: rgba(14, 165, 233, 0.3);
  --mp-noise-image: repeating-conic-gradient(#64748b 0 0.0001%, transparent 0 0.0002%);
  --mp-noise-opacity: 0.04;
  --mp-terminal-bg: rgba(255, 255, 255, 0.92);
  --mp-term-bar: #f1f5f9;
  --mp-feat-bg: rgba(255, 255, 255, 0.75);
  --mp-card-bg: linear-gradient(165deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.94));
  --mp-card-shadow: 0 18px 50px rgba(15, 23, 42, 0.1);
  --mp-card-shadow-hover: 0 26px 70px rgba(15, 23, 42, 0.16);
  --mp-ring-a: rgba(59, 130, 246, 0.45);
  --mp-ring-b: rgba(168, 85, 247, 0.45);
  --mp-idx-color: rgba(27, 36, 52, 0.05);
  --mp-copy-bg: rgba(37, 99, 235, 0.08);
  --mp-copy-border: rgba(37, 99, 235, 0.3);
  --mp-copy-hover-bg: rgba(37, 99, 235, 0.16);
}

.market-page {
  position: relative;
  flex: 1;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  isolation: isolate;
  color-scheme: dark;
  font-family:
    system-ui,
    -apple-system,
    'Segoe UI',
    'Microsoft YaHei UI',
    sans-serif;
  --mp-bg: #070b16;
  --mp-fg: #e2e8f0;
  --mp-tagline: #9fb0cc;
  --mp-muted: #64748b;
  --mp-desc: #a5b2cc;
  --mp-strong: #cbd5e1;
  --mp-card-border: #273354;
  --mp-code-bg: #0a0f1e;
  --mp-link: #93c5fd;
  --mp-term-shadow: rgba(0, 0, 0, 0.65);
  --mp-glow-blue: rgba(37, 99, 235, 0.27);
  --mp-glow-purple: rgba(124, 58, 237, 0.27);
  --mp-accent-text: #7dd3fc;
  --mp-ok-text: #86efac;
  --mp-ok-border: rgba(34, 197, 94, 0.33);
  --mp-ok-bg: rgba(20, 83, 45, 0.27);
  --mp-whale-bg: linear-gradient(140deg, #1d4ed855, #7c3aed44);
  --mp-whale-border: #3b82f655;
  --mp-title-grad: linear-gradient(100deg, #93c5fd 10%, #e9d5ff 45%, #67e8f9 85%);
  --mp-blob-filter: blur(90px) saturate(140%);
  --mp-blob-opacity: 0.55;
  --mp-b1: #2563eb;
  --mp-b2: #7c3aed;
  --mp-b3: #0ea5e9;
  --mp-noise-image: repeating-conic-gradient(#fff 0 0.0001%, transparent 0 0.0002%);
  --mp-noise-opacity: 0.05;
  --mp-terminal-bg: #0a0f1eee;
  --mp-term-bar: #111a30;
  --mp-feat-bg: #0d1526aa;
  --mp-card-bg: linear-gradient(165deg, #131c33ee, #0d1424ee);
  --mp-card-shadow: 0 18px 50px #0008;
  --mp-card-shadow-hover: 0 26px 70px #000b;
  --mp-ring-a: #3b82f6aa;
  --mp-ring-b: #a855f7aa;
  --mp-idx-color: #ffffff08;
  --mp-copy-bg: #1d4ed833;
  --mp-copy-border: #3b82f666;
  --mp-copy-hover-bg: #1d4ed866;
  background: var(--mp-bg);
  color: var(--mp-fg);
}

.scroll {
  position: relative;
  height: 100%;
  overflow-y: auto;
  overflow-x: clip;
  scroll-behavior: smooth;
  z-index: 1;
}

/* ── aurora backdrop ─────────────────────────────── */
.aurora {
  position: absolute;
  inset: -20%;
  z-index: 0;
  filter: var(--mp-blob-filter);
  opacity: var(--mp-blob-opacity);
  pointer-events: none;
}
.blob {
  position: absolute;
  width: 46vmax;
  height: 46vmax;
  border-radius: 50%;
  mix-blend-mode: screen;
}
.b1 {
  background: var(--mp-b1);
  top: -12%;
  left: -8%;
  animation: drift1 26s ease-in-out infinite alternate;
}
.b2 {
  background: var(--mp-b2);
  bottom: -18%;
  right: -10%;
  animation: drift2 32s ease-in-out infinite alternate;
}
.b3 {
  background: var(--mp-b3);
  top: 30%;
  left: 45%;
  width: 32vmax;
  height: 32vmax;
  animation: drift1 38s ease-in-out infinite alternate-reverse;
}
@keyframes drift1 {
  to {
    transform: translate(9vw, 7vh) scale(1.15);
  }
}
@keyframes drift2 {
  to {
    transform: translate(-8vw, -6vh) scale(0.9);
  }
}
.noise {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: var(--mp-noise-opacity);
  pointer-events: none;
  background-image: var(--mp-noise-image);
  background-size: 3px 3px;
}
.wrap {
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 24px 90px;
}
/* ── hero ─────────────────────────────────────────── */
header.hero {
  padding: 84px 0 70px;
  text-align: center;
  position: relative;
}
.whale {
  display: inline-grid;
  place-items: center;
  width: 74px;
  height: 74px;
  font-size: 38px;
  border-radius: 22px;
  background: var(--mp-whale-bg);
  border: 1px solid var(--mp-whale-border);
  box-shadow: 0 18px 50px var(--mp-glow-blue);
  animation: float 5s ease-in-out infinite;
}
@keyframes float {
  50% {
    transform: translateY(-9px) rotate(-2deg);
  }
}
h1.title {
  font-size: clamp(38px, 6vw, 62px);
  line-height: 1.12;
  margin: 26px 0 0;
  font-weight: 800;
  letter-spacing: 1px;
  background: var(--mp-title-grad);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.tagline {
  margin: 18px auto 0;
  max-width: 620px;
  color: var(--mp-tagline);
  font-size: 15.5px;
  line-height: 1.9;
}
.hero-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin: 26px 0 0;
}
/* ── terminal window ─────────────────────────────── */
.terminal {
  max-width: 780px;
  margin: 52px auto 0;
  border-radius: 14px;
  text-align: left;
  background: var(--mp-terminal-bg);
  border: 1px solid var(--mp-card-border);
  box-shadow: 0 30px 80px var(--mp-term-shadow);
  overflow: hidden;
  transform: perspective(1200px) rotateX(2.5deg);
  transition: transform 0.3s ease;
}
.terminal:hover {
  transform: perspective(1200px) rotateX(0deg);
}
.term-bar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 11px 14px;
  background: var(--mp-term-bar);
  border-bottom: 1px solid var(--mp-card-border);
}
.dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
}
.d-r {
  background: #ef4444;
}
.d-y {
  background: #f59e0b;
}
.d-g {
  background: #22c55e;
}
.term-name {
  margin-left: 8px;
  font-size: 11.5px;
  color: var(--mp-muted);
  font-family: Consolas, monospace;
}
.term-body {
  padding: 20px 22px 24px;
  font-family: Consolas, Menlo, 'Cascadia Code', monospace;
  font-size: 13.5px;
  line-height: 2.05;
}
.prompt {
  color: #22c55e;
}
.typed {
  color: var(--mp-accent-text);
  white-space: nowrap;
  overflow: hidden;
  display: inline-block;
  vertical-align: bottom;
  max-width: 0;
  animation: type 2.6s steps(46) 1s forwards;
}
.caret {
  display: inline-block;
  width: 8px;
  height: 15px;
  margin-left: 3px;
  vertical-align: -2px;
  background: var(--mp-accent-text);
  animation: blink 1s step-end infinite;
}
@keyframes type {
  to {
    max-width: 100%;
  }
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
.out-line {
  color: var(--mp-muted);
}
/* ── live status readout (system + program) ──────── */
.status-readout {
  margin: 6px 0 2px;
  display: grid;
  gap: 3px;
}
.status-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.s-label {
  flex: 0 0 auto;
  min-width: 5em;
  color: var(--mp-accent-text);
}
.s-label::after {
  content: ':';
  color: var(--mp-muted);
}
.s-value {
  color: var(--mp-tagline);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ok-badge {
  display: inline-block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--mp-ok-text);
  border: 1px solid var(--mp-ok-border);
  background: var(--mp-ok-bg);
  border-radius: 8px;
  padding: 3px 12px;
  opacity: 0;
  animation: pop 0.5s ease 3.6s forwards;
}
@keyframes pop {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.9);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
/* ── feature strip ───────────────────────────────── */
.features {
  margin: 84px 0 0;
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
}
.feat {
  padding: 18px 20px;
  border-radius: 14px;
  background: var(--mp-feat-bg);
  border: 1px solid var(--mp-card-border);
}
.feat b {
  display: block;
  font-size: 14px;
  margin-bottom: 6px;
  color: var(--mp-strong);
}
.feat span {
  font-size: 12.5px;
  color: var(--mp-tagline);
  line-height: 1.7;
}
.feat em {
  font-style: normal;
  color: var(--mp-accent-text);
}
/* ── plugin cards ────────────────────────────────── */
h2.section {
  margin: 96px 0 8px;
  font-size: 26px;
  font-weight: 750;
  letter-spacing: 0.5px;
}
.section-sub {
  color: var(--mp-tagline);
  font-size: 13.5px;
  margin: 0 0 30px;
}
.grid {
  display: grid;
  gap: 22px;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  perspective: 1000px;
}
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 26px 24px 22px;
  border-radius: 20px;
  background: var(--mp-card-bg);
  border: 1px solid var(--mp-card-border);
  box-shadow: var(--mp-card-shadow);
  transform-style: preserve-3d;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
  overflow: hidden;
}
.card::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 20px;
  padding: 1px;
  pointer-events: none;
  background: conic-gradient(
    from var(--a, 0deg),
    transparent 0 55%,
    var(--mp-ring-a) 70%,
    var(--mp-ring-b) 80%,
    transparent 90%
  );
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.card:hover {
  border-color: transparent;
  box-shadow: var(--mp-card-shadow-hover);
}
.card:hover::before {
  opacity: 1;
  animation: sweep 3.2s linear infinite;
}
@keyframes sweep {
  to {
    --a: 360deg;
  }
}
@property --a {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}
.idx {
  position: absolute;
  top: 10px;
  right: 18px;
  font-size: 52px;
  font-weight: 800;
  line-height: 1;
  color: var(--mp-idx-color);
  user-select: none;
}
.tag {
  align-self: flex-start;
  font-size: 11.5px;
  padding: 3px 11px;
  border-radius: 999px;
  background: var(--mp-copy-bg);
  color: var(--mp-link);
  border: 1px solid var(--mp-copy-border);
}
h3.name {
  margin: 0;
  font-size: 18.5px;
  font-weight: 700;
}
.desc {
  margin: 0;
  color: var(--mp-desc);
  font-size: 13.5px;
  line-height: 1.8;
  flex: 1;
}
.cmd {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cmd code {
  flex: 1;
  background: var(--mp-code-bg);
  border: 1px solid var(--mp-card-border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 11.5px;
  color: var(--mp-accent-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: Consolas, monospace;
}
button.copy {
  border: 1px solid var(--mp-copy-border);
  background: var(--mp-copy-bg);
  color: var(--mp-link);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}
button.copy:hover {
  background: var(--mp-copy-hover-bg);
  transform: translateY(-1px);
}
button.copy.ok {
  border-color: var(--mp-ok-border);
  background: var(--mp-ok-bg);
  color: var(--mp-ok-text);
}
a.repo {
  color: var(--mp-link);
  font-size: 12.5px;
  text-decoration: none;
  word-break: break-all;
}
a.repo:hover {
  text-decoration: underline;
}
/* ── console feature panorama ───────────────────── */
.console {
  margin-top: 112px;
}
.console-head {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 30px;
  padding-left: 20px;
}
.console-head::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 4px;
  border-radius: 4px;
  background: linear-gradient(180deg, var(--mp-glow-blue), var(--mp-glow-purple));
  box-shadow: 0 0 16px var(--mp-glow-blue);
}
.console-head .section {
  margin: 0;
}
.console-head .section-sub {
  margin: 0;
}
.kicker {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: var(--mp-link);
}
.grid-console {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(3, 1fr);
  perspective: 1000px;
}
@media (max-width: 880px) {
  .grid-console {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 560px) {
  .grid-console {
    grid-template-columns: 1fr;
  }
}
.module {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  min-height: 188px;
  padding: 24px 22px;
  border-radius: 18px;
  background: var(--mp-card-bg);
  border: 1px solid var(--mp-card-border);
  border-top: 2px solid var(--c1);
  box-shadow: var(--mp-card-shadow);
  text-align: left;
  color: var(--mp-fg);
  font: inherit;
  cursor: pointer;
  transform-style: preserve-3d;
  isolation: isolate;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
  overflow: hidden;
}
/* perpetual faint rainbow edge — brightens + sweeps on hover */
.module::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 18px;
  padding: 1px;
  pointer-events: none;
  background: conic-gradient(
    from var(--a, 0deg),
    transparent 0 55%,
    var(--c1) 70%,
    var(--c2) 80%,
    transparent 90%
  );
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0.22;
  transition: opacity 0.3s ease;
  z-index: 2;
}
/* theme glow that blooms from the top-right corner on hover */
.module::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 18px;
  background: radial-gradient(130% 95% at 100% -10%, var(--cg), transparent 55%);
  opacity: 0;
  transition: opacity 0.35s ease;
  pointer-events: none;
  z-index: 0;
}
.module:hover {
  border-color: transparent;
  box-shadow: var(--mp-card-shadow-hover), 0 0 34px var(--cg);
}
.module:hover::before {
  opacity: 1;
  animation: sweep 3.2s linear infinite;
}
.module:hover::after {
  opacity: 1;
}
.mod-icon,
.mod-body,
.mod-enter,
.mod-status {
  position: relative;
  z-index: 1;
}
.mod-icon {
  flex: 0 0 auto;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  font-size: 25px;
  border-radius: 15px;
  background: linear-gradient(140deg, var(--c1), var(--c2));
  border: 1px solid var(--mp-copy-border);
  box-shadow: 0 10px 30px var(--cg);
  animation: float 5s ease-in-out infinite;
  isolation: isolate;
}
/* spinning neon halo behind the icon on hover */
.mod-icon::after {
  content: '';
  position: absolute;
  inset: -5px;
  border-radius: 16px;
  background: conic-gradient(from 0deg, var(--c1), var(--c2), var(--c1));
  filter: blur(9px);
  opacity: 0;
  z-index: -1;
  transition: opacity 0.35s ease;
  animation: spin 5s linear infinite;
}
.module:hover .mod-icon::after {
  opacity: 0.75;
}
.mod-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.mod-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--mp-strong);
}
.mod-desc {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--mp-tagline);
}
.mod-enter {
  margin-top: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--mp-link);
  white-space: nowrap;
}
.mod-enter .arrow {
  font-style: normal;
  transition: transform 0.2s ease;
}
.module:hover .mod-enter .arrow {
  transform: translateX(5px);
}
/* ── live status chip (top-right) ── */
.mod-status {
  position: absolute;
  top: 14px;
  right: 14px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  padding: 3px 9px 3px 8px;
  border-radius: 999px;
}
.mod-status .sdot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  animation: pulse 1.8s ease-in-out infinite;
}
.mod-status.ready {
  color: #34d399;
  background: rgba(16, 185, 129, 0.14);
  border: 1px solid rgba(16, 185, 129, 0.4);
}
.mod-status.ready .sdot {
  background: #34d399;
  box-shadow: 0 0 8px #34d399;
}
.mod-status.todo {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.38);
}
.mod-status.todo .sdot {
  background: #fbbf24;
  box-shadow: 0 0 8px #fbbf24;
}
.module:focus-visible {
  outline: 2px solid var(--mp-link);
  outline-offset: 2px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.5);
    opacity: 0.55;
  }
}

/* ── scroll reveal ───────────────────────────────── */
.reveal {
  opacity: 0;
  transform: translateY(26px);
  transition:
    opacity 0.7s ease,
    transform 0.7s ease;
}
.reveal.in {
  opacity: 1;
  transform: none;
}
/* Damped when 减少动效 is in effect (see stores/settings.applyReduceMotion). */
html.reduce-motion .blob,
html.reduce-motion .whale,
html.reduce-motion .typed,
html.reduce-motion .ok-badge,
html.reduce-motion .mod-icon,
html.reduce-motion .mod-icon::after,
html.reduce-motion .mod-status .sdot {
  animation: none !important;
}
html.reduce-motion .typed {
  max-width: 100%;
}
html.reduce-motion .ok-badge {
  opacity: 1;
}
html.reduce-motion .reveal {
  opacity: 1;
  transform: none;
  transition: none;
}
</style>
