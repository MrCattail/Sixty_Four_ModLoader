import { DurableObject } from 'cloudflare:workers'
import {
  GUEST_RESUME_TTL_MS,
  HOST_RESUME_TTL_MS,
  LOG_RETENTION_MS,
  MOD_VERSION,
  PROTOCOL_VERSION,
  SIGNAL_TYPES,
  hashSecret,
  jsonResponse,
  makeSignal,
  normalizeRoomCode,
  publicError,
  randomRoomCode,
  randomToken,
  readJson,
  validateRoomCode,
  validateSignal
} from './contracts.js'
import { verifyAlphaInviteToken } from './invite-token.js'
import {
  admissionSnapshot,
  authorizeRoomAccess,
  claimCreatedRoom,
  grantAccountTurn,
  normalizeAdmissionState,
  releaseCreatedRoom
} from './admission-model.js'
import {
  addGuest,
  appendEvent,
  authenticateParticipant,
  authorizeRelay,
  cleanExpiredParticipants,
  createRoomState,
  disconnectParticipant,
  grantTurnCredential,
  listOnlinePeers,
  nextAlarmAt
} from './room-model.js'

const STUN_ONLY = Object.freeze([
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] }
])

function internalSecret(env) {
  const value = String(env.INTERNAL_AUTH || '')
  if (value.length >= 32) return value
  if (booleanEnv(env.ALLOW_INSECURE_LOCAL_INTERNAL_AUTH, false)) return 'phase2-local-internal-only'
  throw new Error('Service configuration is unavailable.')
}

function booleanEnv(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  return String(value).toLowerCase() === 'true'
}

function positiveInteger(value, fallback) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function serviceDisabled(env) {
  return booleanEnv(env.SERVICE_DISABLED, true)
}

function turnEnabled(env) {
  return !booleanEnv(env.TURN_DISABLED, true)
}

function alphaInviteRequired(env) {
  return booleanEnv(env.ALPHA_INVITE_REQUIRED, true)
}

function assertServiceConfiguration(env) {
  internalSecret(env)
  if (alphaInviteRequired(env) && String(env.ALPHA_INVITE_SIGNING_SECRET || '').length < 32) throw new Error('Service configuration is unavailable.')
  if (turnEnabled(env) && (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN)) throw new Error('Service configuration is unavailable.')
}

function serviceConfigurationReady(env) {
  try { assertServiceConfiguration(env); return true } catch (error) { return false }
}

async function alphaClaim(env, token) {
  if (!alphaInviteRequired(env)) {
    return Object.freeze({
      jti: 'local-alpha-bypass',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      roomLimit: positiveInteger(env.ROOM_CREATIONS_PER_DAY, 20),
      bypass: true
    })
  }
  return verifyAlphaInviteToken(token, env.ALPHA_INVITE_SIGNING_SECRET)
}

function inviteHeader(request) {
  return String(request.headers.get('x-p2p-alpha-invite') || '')
}

function internalHeaders(env) {
  return { 'content-type': 'application/json', 'x-p2p-internal': internalSecret(env) }
}

function assertInternal(request, env) {
  if (request.headers.get('x-p2p-internal') !== internalSecret(env)) throw new Error('Internal authorization failed.')
}

function allowedOrigin(request, env, allowMissing = false) {
  const origin = request.headers.get('origin')
  if (!origin) {
    if (allowMissing || booleanEnv(env.ALLOW_MISSING_ORIGIN, false)) return ''
    throw new Error('Origin is required.')
  }
  const allowed = String(env.ALLOWED_ORIGINS || 'null').split(',').map((value) => value.trim()).filter(Boolean)
  if (!allowed.includes(origin)) throw new Error('Origin is not allowed.')
  return origin
}

function corsHeaders(origin) {
  if (!origin) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, x-p2p-resume-token, x-p2p-alpha-invite',
    'access-control-max-age': '600',
    vary: 'Origin'
  }
}

function roomStub(env, roomCode) {
  return env.ROOMS.get(env.ROOMS.idFromName(validateRoomCode(roomCode)))
}

function admissionStub(env) {
  return env.ADMISSION.get(env.ADMISSION.idFromName('global-v1'))
}

async function callRoom(env, roomCode, path, body, extraHeaders = {}, method = 'POST') {
  return roomStub(env, roomCode).fetch(`https://room.internal${path}`, {
    method,
    headers: { ...internalHeaders(env), ...extraHeaders },
    body: method === 'GET' ? undefined : JSON.stringify(body || {})
  })
}

async function callAdmission(env, path, body) {
  return admissionStub(env).fetch(`https://admission.internal${path}`, {
    method: 'POST',
    headers: internalHeaders(env),
    body: JSON.stringify(body || {})
  })
}

async function admissionResult(env, path, body) {
  const response = await callAdmission(env, path, body)
  const result = await response.json()
  if (!response.ok) {
    const error = new Error(result.error || 'Request failed.')
    error.status = response.status
    throw error
  }
  return result
}

function parseRoomPath(pathname) {
  const match = /^\/v2\/rooms\/([^/]+)(?:\/(join|socket|turn))?$/.exec(pathname)
  if (!match) return null
  return { roomCode: normalizeRoomCode(match[1]), action: match[2] || 'status' }
}

async function createRoom(request, env, origin) {
  const body = await readJson(request)
  if (body.protocolVersion !== PROTOCOL_VERSION) return jsonResponse({ error: 'Protocol version is unsupported.', protocolVersion: PROTOCOL_VERSION }, 409, corsHeaders(origin))
  const claim = await alphaClaim(env, inviteHeader(request))
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomCode = randomRoomCode()
    const hostToken = randomToken()
    const resumeToken = randomToken()
    await admissionResult(env, '/internal/claim-room', {
      claim,
      roomCode,
      globalLimit: positiveInteger(env.ROOM_CREATIONS_PER_DAY, 20)
    })
    const response = await callRoom(env, roomCode, '/internal/create', {
      roomCode,
      hostTokenHash: await hashSecret(hostToken),
      hostResumeHash: await hashSecret(resumeToken)
    })
    if (!response.ok) {
      await admissionResult(env, '/internal/release-room', { jti: claim.jti, roomCode })
      if (response.status === 409) continue
      throw new Error('Room creation failed.')
    }
    return jsonResponse({
      protocolVersion: PROTOCOL_VERSION,
      modVersion: MOD_VERSION,
      roomCode,
      role: 'host',
      peerId: 'host',
      participantToken: hostToken,
      resumeToken,
      iceServers: STUN_ONLY
    }, 201, corsHeaders(origin))
  }
  throw new Error('Could not allocate a unique room code.')
}

async function joinRoom(request, env, origin, roomCode) {
  const body = await readJson(request)
  if (body.protocolVersion !== PROTOCOL_VERSION) return jsonResponse({ error: 'Protocol version is unsupported.', protocolVersion: PROTOCOL_VERSION }, 409, corsHeaders(origin))
  const claim = await alphaClaim(env, inviteHeader(request))
  const statusResponse = await callRoom(env, roomCode, '/internal/status', null, {}, 'GET')
  const roomStatus = await statusResponse.json()
  if (!statusResponse.ok) return jsonResponse(roomStatus, statusResponse.status, corsHeaders(origin))
  await admissionResult(env, '/internal/authorize-room', { claim, roomCode })
  const participantToken = randomToken()
  const resumeToken = randomToken()
  const response = await callRoom(env, roomCode, '/internal/join', {
    tokenHash: await hashSecret(participantToken),
    resumeHash: await hashSecret(resumeToken)
  })
  const result = await response.json()
  if (!response.ok) return jsonResponse(result, response.status, corsHeaders(origin))
  return jsonResponse({
    protocolVersion: PROTOCOL_VERSION,
    modVersion: MOD_VERSION,
    roomCode,
    role: 'guest',
    peerId: result.peerId,
    slot: result.slot,
    participantToken,
    resumeToken,
    iceServers: STUN_ONLY
  }, 200, corsHeaders(origin))
}

async function openSocket(request, env, roomCode) {
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return jsonResponse({ error: 'WebSocket upgrade required.' }, 426)
  const headers = new Headers(request.headers)
  headers.set('x-p2p-internal', internalSecret(env))
  return roomStub(env, roomCode).fetch('https://room.internal/internal/socket', { method: 'GET', headers })
}

async function issueTurn(request, env, origin, roomCode) {
  const claim = await alphaClaim(env, inviteHeader(request))
  const participantToken = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const resumeToken = String(request.headers.get('x-p2p-resume-token') || '')
  if (!participantToken || !resumeToken) return jsonResponse({ error: 'Authentication failed.' }, 401, corsHeaders(origin))
  const authorization = await callRoom(env, roomCode, '/internal/turn-authorize', {
    tokenHash: await hashSecret(participantToken),
    resumeHash: await hashSecret(resumeToken),
    dailyLimit: positiveInteger(env.TURN_GRANTS_PER_ROOM_PER_DAY, 16),
    consume: false
  })
  const authorizationResult = await authorization.json()
  if (!authorization.ok) return jsonResponse(authorizationResult, authorization.status, corsHeaders(origin))

  await admissionResult(env, '/internal/authorize-room', { claim, roomCode })
  const ttlSeconds = Math.max(600, Math.min(7200, positiveInteger(env.TURN_TTL_SECONDS, 900)))
  const refreshAfterMs = Math.max(5 * 60 * 1000, Math.min(ttlSeconds * 1000 - 60 * 1000, positiveInteger(env.TURN_REFRESH_AFTER_SECONDS, 600) * 1000))
  if (!turnEnabled(env)) {
    return jsonResponse({ mode: 'stun-only', iceServers: STUN_ONLY, ttlSeconds, refreshAfterMs }, 200, corsHeaders(origin))
  }

  await admissionResult(env, '/internal/grant-turn', {
    claim,
    globalLimit: positiveInteger(env.TURN_GRANTS_PER_DAY, 32)
  })
  const consumption = await callRoom(env, roomCode, '/internal/turn-authorize', {
    tokenHash: await hashSecret(participantToken),
    resumeHash: await hashSecret(resumeToken),
    dailyLimit: positiveInteger(env.TURN_GRANTS_PER_ROOM_PER_DAY, 16),
    consume: true
  })
  if (!consumption.ok) return jsonResponse(await consumption.json(), consumption.status, corsHeaders(origin))

  const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl: ttlSeconds })
  })
  if (!response.ok) return jsonResponse({ error: 'TURN credential service is unavailable.' }, 503, corsHeaders(origin))
  const result = await response.json()
  return jsonResponse({ mode: 'stun-turn', iceServers: result.iceServers, ttlSeconds, refreshAfterMs }, 200, corsHeaders(origin))
}

export default {
  async fetch(request, env) {
    let origin = ''
    try {
      const url = new URL(request.url)
      origin = allowedOrigin(request, env, request.method === 'GET' && url.pathname === '/health')
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
      if (request.method === 'GET' && url.pathname === '/health') {
        const enabled = !serviceDisabled(env)
        const configurationReady = serviceConfigurationReady(env)
        return jsonResponse({
          ok: enabled && configurationReady,
          service: 'cattail-p2p-signaling',
          protocolVersion: PROTOCOL_VERSION,
          serviceEnabled: enabled,
          configurationReady,
          inviteRequired: alphaInviteRequired(env),
          turnEnabled: turnEnabled(env)
        }, enabled && configurationReady ? 200 : 503, corsHeaders(origin))
      }
      if (serviceDisabled(env)) return jsonResponse({ error: 'Service is temporarily disabled.' }, 503, corsHeaders(origin))
      assertServiceConfiguration(env)
      if (request.method === 'POST' && url.pathname === '/v2/rooms') return await createRoom(request, env, origin)
      const route = parseRoomPath(url.pathname)
      if (!route?.roomCode) return jsonResponse({ error: 'Not found.' }, 404, corsHeaders(origin))
      if (request.method === 'POST' && route.action === 'join') return await joinRoom(request, env, origin, route.roomCode)
      if (request.method === 'GET' && route.action === 'socket') return await openSocket(request, env, route.roomCode)
      if (request.method === 'POST' && route.action === 'turn') return await issueTurn(request, env, origin, route.roomCode)
      return jsonResponse({ error: 'Not found.' }, 404, corsHeaders(origin))
    } catch (error) {
      const status = Number(error.status) ||
        (/temporarily disabled|configuration is unavailable/.test(error.message) ? 503 :
          /invitation is required/.test(error.message) ? 401 :
            /Origin|invitation is invalid|invitation has expired|invitation room limit/.test(error.message) ? 403 :
              /budget exhausted/.test(error.message) ? 429 :
                /JSON|body|code/.test(error.message) ? 400 : 500)
      return jsonResponse({ error: publicError(error) }, status, corsHeaders(origin))
    }
  }
}

export class P2PRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.ctx = ctx
    this.env = env
  }

  async loadState() {
    return this.ctx.storage.get('room')
  }

  async saveState(state) {
    await this.ctx.storage.put('room', state)
    await this.scheduleAlarm(state)
  }

  async scheduleAlarm(state) {
    const now = Date.now()
    let deadline = nextAlarmAt(state, now)
    if (state?.closedAt) deadline = state.closedAt + LOG_RETENTION_MS
    if (deadline) await this.ctx.storage.setAlarm(deadline)
    else await this.ctx.storage.deleteAlarm()
  }

  async fetch(request) {
    try {
      assertInternal(request, this.env)
      const url = new URL(request.url)
      if (request.method === 'POST' && url.pathname === '/internal/create') return await this.create(await request.json())
      if (request.method === 'GET' && url.pathname === '/internal/status') return await this.status()
      if (request.method === 'POST' && url.pathname === '/internal/join') return await this.join(await request.json())
      if (request.method === 'POST' && url.pathname === '/internal/turn-authorize') return await this.authorizeTurn(await request.json())
      if (request.method === 'GET' && url.pathname === '/internal/socket') return this.openSocket(request)
      return jsonResponse({ error: 'Not found.' }, 404)
    } catch (error) {
      return jsonResponse({ error: publicError(error) }, /authorization/i.test(error.message) ? 403 : 400)
    }
  }

  async create(body) {
    if (await this.loadState()) return jsonResponse({ error: 'Room already exists.' }, 409)
    const state = createRoomState({ now: Date.now(), ...body })
    await this.saveState(state)
    return jsonResponse({ ok: true }, 201)
  }

  async status() {
    const state = await this.loadState()
    if (!state) return jsonResponse({ error: 'Room not found.' }, 404)
    cleanExpiredParticipants(state, Date.now())
    if (state.closedAt) return jsonResponse({ error: 'Room is closed.' }, 410)
    return jsonResponse({ ok: true })
  }

  async join(body) {
    const state = await this.loadState()
    if (!state) return jsonResponse({ error: 'Room not found.' }, 404)
    try {
      const participant = addGuest(state, { now: Date.now(), tokenHash: body.tokenHash, resumeHash: body.resumeHash })
      await this.saveState(state)
      return jsonResponse({ peerId: participant.peerId, slot: participant.slot })
    } catch (error) {
      await this.saveState(state)
      const status = /rate limit/.test(error.message) ? 429 : /full/.test(error.message) ? 409 : 410
      return jsonResponse({ error: publicError(error) }, status)
    }
  }

  async authorizeTurn(body) {
    const state = await this.loadState()
    if (!state) return jsonResponse({ error: 'Room not found.' }, 404)
    cleanExpiredParticipants(state, Date.now())
    const participant = state.participants.find((entry) => entry.tokenHash === body.tokenHash && entry.resumeHash === body.resumeHash)
    if (!participant || state.closedAt) return jsonResponse({ error: 'Authentication failed.' }, 401)
    try {
      if (body.consume) {
        grantTurnCredential(state, Date.now(), positiveInteger(body.dailyLimit, 16))
        await this.saveState(state)
      }
      return jsonResponse({ ok: true, peerId: participant.peerId })
    } catch (error) {
      await this.saveState(state)
      return jsonResponse({ error: publicError(error, error.message) }, 429)
    }
  }

  openSocket(request) {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return jsonResponse({ error: 'WebSocket upgrade required.' }, 426)
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server, ['pending'])
    server.serializeAttachment({ authenticated: false, openedAt: Date.now() })
    return new Response(null, { status: 101, webSocket: client })
  }

  send(socket, type, payload, requestId) {
    socket.send(JSON.stringify(makeSignal(type, payload, requestId)))
  }

  sendError(socket, requestId, message) {
    try { this.send(socket, SIGNAL_TYPES.ERROR, { message }, requestId) } catch (error) {}
  }

  findSocket(peerId, exclude) {
    return this.ctx.getWebSockets().find((socket) => {
      if (socket === exclude) return false
      const attachment = socket.deserializeAttachment()
      return attachment?.authenticated && attachment.peerId === peerId
    })
  }

  broadcast(type, payload, exclude) {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === exclude) continue
      const attachment = socket.deserializeAttachment()
      if (attachment?.authenticated) this.send(socket, type, payload)
    }
  }

  async webSocketMessage(socket, rawMessage) {
    let message
    try {
      if (serviceDisabled(this.env)) {
        socket.close(4013, 'Service disabled')
        return
      }
      const raw = typeof rawMessage === 'string' ? rawMessage : new TextDecoder().decode(rawMessage)
      message = validateSignal(JSON.parse(raw))
      const attachment = socket.deserializeAttachment() || { authenticated: false }
      if (!attachment.authenticated) {
        if (message.type !== SIGNAL_TYPES.AUTH) throw new Error('Authentication failed.')
        await this.authenticateSocket(socket, message)
        return
      }
      if (message.type === SIGNAL_TYPES.HEARTBEAT) {
        this.send(socket, SIGNAL_TYPES.HEARTBEAT, { ok: true }, message.requestId)
        return
      }
      await this.relay(socket, attachment, message)
    } catch (error) {
      this.sendError(socket, message?.requestId, publicError(error))
      if (!socket.deserializeAttachment()?.authenticated) socket.close(4003, 'Authentication failed')
    }
  }

  async authenticateSocket(socket, message) {
    const payload = message.payload || {}
    const claim = await alphaClaim(this.env, payload.alphaInviteToken)
    const state = await this.loadState()
    if (!state) throw new Error('Room not found.')
    const tokenHash = await hashSecret(payload.participantToken)
    const resumeHash = await hashSecret(payload.resumeToken)
    const current = state.participants.find((entry) => entry.tokenHash === tokenHash && entry.resumeHash === resumeHash)
    if (!current || state.closedAt) throw new Error('Authentication failed.')
    await admissionResult(this.env, '/internal/authorize-room', { claim, roomCode: state.roomCode })
    const nextResumeToken = randomToken()
    const participant = authenticateParticipant(state, {
      now: Date.now(),
      tokenHash,
      resumeHash,
      nextResumeHash: await hashSecret(nextResumeToken)
    })
    const previous = this.findSocket(participant.peerId, socket)
    if (previous) previous.close(4001, 'Replaced by reconnect')
    socket.serializeAttachment({ authenticated: true, peerId: participant.peerId, role: participant.role, slot: participant.slot })
    await this.saveState(state)
    this.send(socket, SIGNAL_TYPES.AUTH_OK, {
      peerId: participant.peerId,
      role: participant.role,
      slot: participant.slot,
      roomCode: state.roomCode,
      resumeToken: nextResumeToken,
      peers: listOnlinePeers(state, participant.peerId)
    }, message.requestId)
    this.broadcast(SIGNAL_TYPES.PEER_JOINED, { peerId: participant.peerId, role: participant.role, slot: participant.slot }, socket)
  }

  async relay(socket, attachment, message) {
    if (![SIGNAL_TYPES.OFFER, SIGNAL_TYPES.ANSWER, SIGNAL_TYPES.ICE].includes(message.type)) throw new Error('Signaling message is not allowed for this peer.')
    const state = await this.loadState()
    if (!state) throw new Error('Room not found.')
    const targetPeerId = String(message.payload?.targetPeerId || '')
    authorizeRelay(state, attachment.peerId, targetPeerId, message.type)
    const target = this.findSocket(targetPeerId)
    if (!target) throw new Error('Signaling message is not allowed for this peer.')
    const relayPayload = { sourcePeerId: attachment.peerId }
    if (message.type === SIGNAL_TYPES.ICE) {
      if (!message.payload?.candidate || typeof message.payload.candidate !== 'object') throw new Error('Signaling message is not allowed for this peer.')
      relayPayload.candidate = message.payload.candidate
    } else {
      const description = message.payload?.description
      const expected = message.type === SIGNAL_TYPES.OFFER ? 'offer' : 'answer'
      if (description?.type !== expected || typeof description.sdp !== 'string') throw new Error('Signaling message is not allowed for this peer.')
      relayPayload.description = { type: description.type, sdp: description.sdp }
      relayPayload.retry = Math.max(0, Math.min(1, Number(message.payload.retry || 0)))
    }
    this.send(target, message.type, relayPayload, message.requestId)
    appendEvent(state, 'signal-relayed', { type: message.type, sourcePeerId: attachment.peerId, targetPeerId }, Date.now())
    await this.saveState(state)
  }

  async webSocketClose(socket) {
    const attachment = socket.deserializeAttachment()
    if (!attachment?.authenticated || this.findSocket(attachment.peerId, socket)) return
    const state = await this.loadState()
    if (!state) return
    disconnectParticipant(state, attachment.peerId, Date.now())
    await this.saveState(state)
    this.broadcast(SIGNAL_TYPES.PEER_LEFT, {
      peerId: attachment.peerId,
      role: attachment.role,
      reconnectUntil: Date.now() + (attachment.role === 'host' ? HOST_RESUME_TTL_MS : GUEST_RESUME_TTL_MS)
    }, socket)
  }

  async webSocketError(socket) {
    await this.webSocketClose(socket)
  }

  async alarm() {
    const state = await this.loadState()
    if (!state) return
    const now = Date.now()
    if (state.closedAt && now >= state.closedAt + LOG_RETENTION_MS) {
      for (const socket of this.ctx.getWebSockets()) socket.close(4000, 'Room expired')
      await this.ctx.storage.deleteAll()
      return
    }
    cleanExpiredParticipants(state, now)
    if (state.closedAt) for (const socket of this.ctx.getWebSockets()) socket.close(4000, 'Room closed')
    await this.saveState(state)
  }
}

export class P2PAdmission extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.ctx = ctx
    this.env = env
  }

  async fetch(request) {
    try {
      assertInternal(request, this.env)
      const url = new URL(request.url)
      const body = await request.json()
      const state = normalizeAdmissionState(await this.ctx.storage.get('admission'), Date.now())
      let result
      if (request.method === 'POST' && url.pathname === '/internal/claim-room') {
        result = claimCreatedRoom(state, body)
      } else if (request.method === 'POST' && url.pathname === '/internal/release-room') {
        result = { released: releaseCreatedRoom(state, body) }
      } else if (request.method === 'POST' && url.pathname === '/internal/authorize-room') {
        result = authorizeRoomAccess(state, body)
      } else if (request.method === 'POST' && url.pathname === '/internal/grant-turn') {
        result = { grant: grantAccountTurn(state, body) }
      } else {
        return jsonResponse({ error: 'Not found.' }, 404)
      }
      await this.ctx.storage.put('admission', state)
      return jsonResponse({ ok: true, ...result, budget: admissionSnapshot(state) })
    } catch (error) {
      const status = /authorization/i.test(error.message) ? 403 : /limit|budget/.test(error.message) ? 429 : 400
      return jsonResponse({ error: publicError(error) }, status)
    }
  }
}
