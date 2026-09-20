<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { t } from '../i18n'

/**
 * 默认工作台 = 内置插件市场静态页（原 pages/dsh-plugin-market 的 node server 版本已移除）。
 * 纯渲染层内容：不注册 page、不占端口、不随启动运行；顶部为工作台描述，下方是精选插件。
 */
const emit = defineEmits<{ 'install-pages': [] }>()

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

  // Pointer-driven 3D tilt on plugin cards (skipped when the OS asks for less motion).
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  for (const card of root.querySelectorAll<HTMLElement>('.card')) {
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
})

onBeforeUnmount(() => {
  io?.disconnect()
  io = null
  for (const fn of tiltCleanups) fn()
  tiltCleanups = []
  window.clearTimeout(copyTimer)
})
</script>

<template>
  <div ref="rootEl" class="market-page">
    <div class="aurora"><div class="blob b1" /><div class="blob b2" /><div class="blob b3" /></div>
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
              <span class="term-name">bash — ~/.dsh/fileworkbench</span>
            </div>
            <div class="term-body">
              <div>
                <span class="prompt">$</span>
                <span class="typed">dsh plugin --profile web add &lt;package&gt;</span>
                <span class="caret" />
              </div>
              <div class="out-line">added 1 package in 3s · cordis discover &#10003;</div>
              <span class="ok-badge">&#10003; {{ t('market.okBadge') }}</span>
            </div>
          </div>
        </header>

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
                {{
                  copiedId === p.id + '-desk' ? t('market.copied') : t('market.desktopCopy')
                }}
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
  font-family: system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei UI', sans-serif;
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
@media (prefers-reduced-motion: reduce) {
  .blob,
  .whale,
  .typed,
  .ok-badge {
    animation: none !important;
  }
  .typed {
    max-width: 100%;
  }
  .ok-badge {
    opacity: 1;
  }
  .reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
