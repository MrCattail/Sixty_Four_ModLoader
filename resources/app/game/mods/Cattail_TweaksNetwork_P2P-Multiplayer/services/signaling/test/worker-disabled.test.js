import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

const DISABLED_ERROR = Object.freeze({ error: 'Service is temporarily disabled.' })

async function expectDisabled(response) {
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual(DISABLED_ERROR)
}

describe('Phase 2.1 production kill switch', () => {
  it('reports disabled and missing-secret configuration without revealing values', async () => {
    const response = await SELF.fetch('https://local.test/health')
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      ok: false,
      service: 'cattail-p2p-signaling',
      protocolVersion: 2,
      serviceEnabled: false,
      configurationReady: false,
      inviteRequired: true,
      turnEnabled: false
    })
  })

  it('permits the reviewed CORS preflight while disabled without a response body', async () => {
    const response = await SELF.fetch('https://local.test/v2/rooms', {
      method: 'OPTIONS',
      headers: {
        origin: 'null',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type'
      }
    })
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })

  it('rejects room creation before parsing credentials or allocating a room', async () => {
    const response = await SELF.fetch('https://local.test/v2/rooms', {
      method: 'POST',
      headers: { origin: 'null', 'content-type': 'application/json' },
      body: '{}'
    })
    await expectDisabled(response)
  })

  it('rejects WebSocket upgrades before room lookup or socket allocation', async () => {
    const response = await SELF.fetch('https://local.test/v2/rooms/AAAAAAAA/socket', {
      headers: { origin: 'file://', upgrade: 'websocket' }
    })
    await expectDisabled(response)
    expect(response.webSocket).toBeNull()
  })

  it('rejects TURN grants before room lookup or credential issuance', async () => {
    const response = await SELF.fetch('https://local.test/v2/rooms/AAAAAAAA/turn', {
      method: 'POST',
      headers: { origin: 'null', 'content-type': 'application/json' },
      body: '{}'
    })
    await expectDisabled(response)
  })
})
