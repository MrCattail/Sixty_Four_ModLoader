import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

function signal(type, payload) {
  return JSON.stringify({ protocolVersion: 2, type, requestId: crypto.randomUUID(), sentAt: Date.now(), payload })
}

function socketQueue(socket) {
  const pending = []
  const waiters = []
  socket.addEventListener('message', (event) => {
    const value = JSON.parse(event.data)
    const waiter = waiters.shift()
    if (waiter) waiter(value)
    else pending.push(value)
  })
  return {
    next() {
      if (pending.length) return Promise.resolve(pending.shift())
      return new Promise((resolve) => waiters.push(resolve))
    }
  }
}

async function roomSocket(roomCode, origin = 'null') {
  const response = await SELF.fetch(`https://local.test/v2/rooms/${roomCode}/socket`, {
    headers: { origin, upgrade: 'websocket' }
  })
  expect(response.status).toBe(101)
  const socket = response.webSocket
  socket.accept()
  return { socket, queue: socketQueue(socket) }
}

function jsonRequest(path, body) {
  return SELF.fetch(`https://local.test${path}`, {
    method: 'POST',
    headers: { origin: 'null', 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

describe('Phase 2 signaling Worker', () => {
  it('reports protocol health without enabling TURN secrets', async () => {
    const response = await SELF.fetch('https://local.test/health', { headers: { origin: 'null' } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expect.objectContaining({ ok: true, protocolVersion: 2, turnEnabled: false }))
  })

  it('creates a private room and issues three guest slots', async () => {
    const created = await jsonRequest('/v2/rooms', { protocolVersion: 2, modVersion: '0.2.1' })
    expect(created.status).toBe(201)
    const host = await created.json()
    expect(host.roomCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/)
    expect(host.participantToken).toBeTruthy()
    for (let slot = 1; slot <= 3; slot += 1) {
      const joined = await jsonRequest(`/v2/rooms/${host.roomCode}/join`, { protocolVersion: 2, modVersion: '0.2.1' })
      expect(joined.status).toBe(200)
      expect(await joined.json()).toEqual(expect.objectContaining({ role: 'guest', slot }))
    }
    const full = await jsonRequest(`/v2/rooms/${host.roomCode}/join`, { protocolVersion: 2, modVersion: '0.2.1' })
    expect(full.status).toBe(409)
    expect((await full.json()).error).toBe('Room is full.')
  })

  it('rejects an incompatible protocol before room allocation', async () => {
    const response = await jsonRequest('/v2/rooms', { protocolVersion: 1, modVersion: '0.1.0' })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Protocol version is unsupported.', protocolVersion: 2 })
  })

  it('accepts the Electron file origin for WebSocket upgrades', async () => {
    const host = await (await jsonRequest('/v2/rooms', { protocolVersion: 2, modVersion: '0.2.1' })).json()
    const hostChannel = await roomSocket(host.roomCode, 'file://')
    hostChannel.socket.send(signal('signal.auth', { participantToken: host.participantToken, resumeToken: host.resumeToken }))
    expect((await hostChannel.queue.next()).type).toBe('signal.authOk')
    hostChannel.socket.close(1000, 'test complete')
  })

  it('authenticates two hibernatable sockets and relays only host-star signaling', async () => {
    const host = await (await jsonRequest('/v2/rooms', { protocolVersion: 2, modVersion: '0.2.1' })).json()
    const guest = await (await jsonRequest(`/v2/rooms/${host.roomCode}/join`, { protocolVersion: 2, modVersion: '0.2.1' })).json()
    const hostChannel = await roomSocket(host.roomCode)
    hostChannel.socket.send(signal('signal.auth', { participantToken: host.participantToken, resumeToken: host.resumeToken }))
    expect((await hostChannel.queue.next()).type).toBe('signal.authOk')

    const guestChannel = await roomSocket(host.roomCode)
    guestChannel.socket.send(signal('signal.auth', { participantToken: guest.participantToken, resumeToken: guest.resumeToken }))
    expect((await guestChannel.queue.next()).type).toBe('signal.authOk')
    expect((await hostChannel.queue.next()).type).toBe('signal.peerJoined')

    hostChannel.socket.send(signal('signal.offer', {
      targetPeerId: guest.peerId,
      description: { type: 'offer', sdp: 'v=0\r\n' },
      retry: 0
    }))
    const offer = await guestChannel.queue.next()
    expect(offer.type).toBe('signal.offer')
    expect(offer.payload.sourcePeerId).toBe('host')
    expect(offer.payload).not.toHaveProperty('targetPeerId')

    guestChannel.socket.send(signal('signal.answer', {
      targetPeerId: 'host',
      description: { type: 'answer', sdp: 'v=0\r\n' },
      retry: 0
    }))
    const answer = await hostChannel.queue.next()
    expect(answer.type).toBe('signal.answer')
    expect(answer.payload.sourcePeerId).toBe(guest.peerId)
    hostChannel.socket.close(1000, 'test complete')
    guestChannel.socket.close(1000, 'test complete')
  })
})
