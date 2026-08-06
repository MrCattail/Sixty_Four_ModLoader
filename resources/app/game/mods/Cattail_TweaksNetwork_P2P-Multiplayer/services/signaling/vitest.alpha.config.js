import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.test-alpha.jsonc' } })],
  test: { include: ['test/worker-alpha.test.js'], testTimeout: 15000 }
})
