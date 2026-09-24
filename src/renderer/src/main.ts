import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import 'element-plus/dist/index.css'
// EP's dark palette: only `index.css` ships the light-theme values, so components kept
// light-mode hover/active tints (near-white flashes) in the dark shell. Imported BEFORE
// main.css so our html.dark overrides still win.
import 'element-plus/theme-chalk/dark/css-vars.css'
import './assets/main.css'
// Global glass + neon theme layer: reusable .glass / .neon-title / .reveal / .aurora
// utilities shared by every panel and manager so the whole app reads consistently.
import './styles/glass.css'
// Wrap ElMessage once, before the app mounts, so every toast honours the system-notification
// routing (see toast.ts); the enabled flag is pushed in by App.vue once settings load.
import { installToastRouting } from './toast'
installToastRouting()

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
