import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/ui/**'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000
  }
})
