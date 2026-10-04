import {
  GUEST_RESUME_TTL_MS,
  HOST_RESUME_TTL_MS,
  JOIN_RATE_LIMIT,
  JOIN_RATE_WINDOW_MS,
  LOG_RETENTION_MS,
  ROOM_CAPACITY,
  WAITING_ROOM_TTL_MS,
  sanitizeEvent
} from './contracts.js'

export function createRoomState(options) {
  const now = Number(options.now)
  return {
    version: 1,
    roomCode: options.roomCode,
    createdAt: now,
    waitingExpiresAt: now + WAITING_ROOM_TTL_MS,
    startedAt: null,
    closedAt: null,
    nextGuestNumber: 1,
    joinWindowStartedAt: now,
    joinAttempts: 0,
    turnWindowStartedAt: now,
    turnGrants: 0,
    participants: [{
      peerId: 'host', role: 'host', slot: 0,
      tokenHash: options.hostTokenHash,
      resumeHash: options.hostResumeHash,
      online: false, connectedAt: null, disconnectedAt: null
    }],
    events: [sanitizeEvent('room-created', { role: 'host' }, now)]
  }
}

export function appendEvent(state, type, details, now) {
  const cutoff = now - LOG_RETENTION_MS
  state.events = (state.events || []).filter((entry) => Date.parse(entry.timestamp) >= cutoff).slice(-199)
  state.events.push(sanitizeEvent(type, details, now))
}

export function cleanExpiredParticipants(state, now) {
  if (state.closedAt) return state
  const host = state.participants.find((participant) => participant.role === 'host')
  if (host?.disconnectedAt && now - host.disconnectedAt >= HOST_RESUME_TTL_MS) {
    state.closedAt = now
    appendEvent(state, 'room-closed', { reason: 'host-timeout' }, now)
    return state
  }
  const before = state.participants.length
  state.participants = state.participants.filter((participant) => {
    if (participant.role !== 'guest' || participant.online || !participant.disconnectedAt) return true
    return now - participant.disconnectedAt < GUEST_RESUME_TTL_MS
  })
  if (state.participants.length !== before) appendEvent(state, 'guest-slots-released', { count: before - state.participants.length }, now)
  if (!state.startedAt && now >= state.waitingExpiresAt) {
    state.closedAt = now
    appendEvent(state, 'room-closed', { reason: 'waiting-expired' }, now)
  }
  return state
}

function consumeJoinAttempt(state, now) {
  if (now - state.joinWindowStartedAt >= JOIN_RATE_WINDOW_MS) {
    state.joinWindowStartedAt = now
    state.joinAttempts = 0
  }
  state.joinAttempts += 1
  if (state.joinAttempts > JOIN_RATE_LIMIT) throw new Error('Join rate limit exceeded.')
}

export function addGuest(state, options) {
  const now = Number(options.now)
  cleanExpiredParticipants(state, now)
  consumeJoinAttempt(state, now)
  if (state.closedAt) throw new Error(now >= state.waitingExpiresAt && !state.startedAt ? 'Room has expired.' : 'Room is closed.')
  if (state.participants.length >= ROOM_CAPACITY) throw new Error('Room is full.')
  const guestNumber = state.nextGuestNumber++
  const participant = {
    peerId: `guest-${guestNumber}`,
    role: 'guest',
    slot: guestNumber,
    tokenHash: options.tokenHash,
    resumeHash: options.resumeHash,
    online: false,
    connectedAt: null,
    disconnectedAt: null
  }
  state.participants.push(participant)
  if (!state.startedAt) state.startedAt = now
  appendEvent(state, 'guest-issued', { peerId: participant.peerId, slot: participant.slot }, now)
  return participant
}

export function authenticateParticipant(state, options) {
  const now = Number(options.now)
  cleanExpiredParticipants(state, now)
  if (state.closedAt) throw new Error('Room is closed.')
  const participant = state.participants.find((entry) => entry.tokenHash === options.tokenHash)
  if (!participant || participant.resumeHash !== options.resumeHash) throw new Error('Authentication failed.')
  participant.resumeHash = options.nextResumeHash
  participant.online = true
  participant.connectedAt = now
  participant.disconnectedAt = null
  appendEvent(state, 'peer-authenticated', { peerId: participant.peerId, role: participant.role }, now)
  return participant
}

export function disconnectParticipant(state, peerId, now) {
  const participant = state.participants.find((entry) => entry.peerId === peerId)
  if (!participant) return null
  participant.online = false
  participant.disconnectedAt = now
  appendEvent(state, 'peer-disconnected', { peerId, role: participant.role }, now)
  return participant
}

export function listOnlinePeers(state, excludePeerId) {
  return state.participants.filter((entry) => entry.online && entry.peerId !== excludePeerId).map((entry) => ({
    peerId: entry.peerId,
    role: entry.role,
    slot: entry.slot
  }))
}

export function authorizeRelay(state, sourcePeerId, targetPeerId, type) {
  const source = state.participants.find((entry) => entry.peerId === sourcePeerId && entry.online)
  const target = state.participants.find((entry) => entry.peerId === targetPeerId && entry.online)
  if (!source || !target || source.peerId === target.peerId) throw new Error('Signaling message is not allowed for this peer.')
  if (source.role !== 'host' && target.role !== 'host') throw new Error('Signaling message is not allowed for this peer.')
  if (type === 'signal.offer' && source.role !== 'host') throw new Error('Signaling message is not allowed for this peer.')
  if (type === 'signal.answer' && source.role !== 'guest') throw new Error('Signaling message is not allowed for this peer.')
  if (!['signal.offer', 'signal.answer', 'signal.ice'].includes(type)) throw new Error('Signaling message is not allowed for this peer.')
  return { source, target }
}

export function grantTurnCredential(state, now, dailyLimit) {
  const day = 24 * 60 * 60 * 1000
  if (now - state.turnWindowStartedAt >= day) {
    state.turnWindowStartedAt = now
    state.turnGrants = 0
  }
  if (state.turnGrants >= dailyLimit) throw new Error('TURN credential budget guard is active.')
  state.turnGrants += 1
  appendEvent(state, 'turn-credential-granted', { count: state.turnGrants }, now)
  return state.turnGrants
}

export function nextAlarmAt(state, now) {
  if (state.closedAt) return null
  const deadlines = []
  if (!state.startedAt) deadlines.push(state.waitingExpiresAt)
  for (const participant of state.participants) {
    if (!participant.disconnectedAt) continue
    deadlines.push(participant.disconnectedAt + (participant.role === 'host' ? HOST_RESUME_TTL_MS : GUEST_RESUME_TTL_MS))
  }
  const future = deadlines.filter((value) => value > now)
  return future.length ? Math.min(...future) : null
}
