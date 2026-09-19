import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  plugins: [
    vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'webview' } } }),
    AutoImport({ resolvers: [ElementPlusResolver()] }),
    Components({ resolvers: [ElementPlusResolver()] })
  ],
  test: {
    include: ['test/ui/**/*.test.ts'],
    environment: 'jsdom',
    globals: true,
    css: true,
    server: { deps: { inline: ['element-plus'] } },
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
})
