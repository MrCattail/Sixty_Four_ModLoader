import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('Phase 2.1 production kill switch', () => {
  it('reports disabled and missing-secret configuration without revealing values', async () => {
    const response = await SELF.fetch('https://local.test/health')
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual(expect.objectContaining({
      ok: false,
      serviceEnabled: false,
      configurationReady: false,
      inviteRequired: true,
      turnEnabled: false
    }))
  })

  it('rejects room creation before parsing credentials or allocating a room', async () => {
    const response = await SELF.fetch('https://local.test/v2/rooms', {
      method: 'POST',
      headers: { origin: 'null', 'content-type': 'application/json' },
      body: JSON.stringify({ protocolVersion: 2, modVersion: '0.2.1' })
    })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Service is temporarily disabled.' })
  })
})
