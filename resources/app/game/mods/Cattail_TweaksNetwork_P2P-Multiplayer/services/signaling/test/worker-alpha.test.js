import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createAlphaInviteToken } from '../src/invite-token.js'

const SECRET = 'test-only-alpha-signing-secret-0123456789'

async function invitation(jti, roomLimit = 1) {
  return createAlphaInviteToken(SECRET, { jti, roomLimit, ttlSeconds: 3600 })
}

function createRequest(token) {
  const headers = { origin: 'null', 'content-type': 'application/json' }
  if (token) headers['x-p2p-alpha-invite'] = token
  return SELF.fetch('https://local.test/v2/rooms', {
    method: 'POST',
    headers,
    body: JSON.stringify({ protocolVersion: 2, modVersion: '0.2.1' })
  })
}

function signal(payload) {
  return JSON.stringify({ protocolVersion: 2, type: 'signal.auth', requestId: crypto.randomUUID(), sentAt: Date.now(), payload })
}

async function openSocket(roomCode) {
  const response = await SELF.fetch(`https://local.test/v2/rooms/${roomCode}/socket`, {
    headers: { origin: 'file://', upgrade: 'websocket' }
  })
  expect(response.status).toBe(101)
  const socket = response.webSocket
  socket.accept()
  return socket
}

function nextMessage(socket) {
  return new Promise((resolve) => socket.addEventListener('message', (event) => resolve(JSON.parse(event.data)), { once: true }))
}

describe('Phase 2.1 private-alpha admission', () => {
  it('fails closed when the alpha invitation is missing or invalid', async () => {
    const missing = await createRequest('')
    expect(missing.status).toBe(401)
    expect((await missing.json()).error).toBe('Alpha invitation is required.')
    const invalid = await createRequest('not-a-valid-token')
    expect(invalid.status).toBe(403)
    expect((await invalid.json()).error).toBe('Alpha invitation is invalid.')
  })

  it('enforces one-room invitation scope and the account-wide daily cap', async () => {
    const token = await invitation('worker_invite_0001')
    const created = await createRequest(token)
    expect(created.status).toBe(201)
    const host = await created.json()

    const missingInviteSocket = await openSocket(host.roomCode)
    const missingMessage = nextMessage(missingInviteSocket)
    missingInviteSocket.send(signal({ participantToken: host.participantToken, resumeToken: host.resumeToken }))
    expect((await missingMessage).payload.message).toBe('Alpha invitation is required.')

    const authorizedSocket = await openSocket(host.roomCode)
    const authorizedMessage = nextMessage(authorizedSocket)
    authorizedSocket.send(signal({ participantToken: host.participantToken, resumeToken: host.resumeToken, alphaInviteToken: token }))
    expect((await authorizedMessage).type).toBe('signal.authOk')
    authorizedSocket.close(1000, 'test complete')

    const second = await createRequest(token)
    expect(second.status).toBe(429)
    expect((await second.json()).error).toBe('Alpha invitation room limit reached.')
    expect((await createRequest(await invitation('worker_invite_0002'))).status).toBe(201)
    const capped = await createRequest(await invitation('worker_invite_0003'))
    expect(capped.status).toBe(429)
    expect((await capped.json()).error).toBe('Daily room budget exhausted.')
  })
})
