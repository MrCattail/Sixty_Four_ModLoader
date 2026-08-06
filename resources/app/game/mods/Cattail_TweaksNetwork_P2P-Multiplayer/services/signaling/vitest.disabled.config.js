import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.alpha.jsonc' } })],
  test: { include: ['test/worker-disabled.test.js'], testTimeout: 15000 }
})
