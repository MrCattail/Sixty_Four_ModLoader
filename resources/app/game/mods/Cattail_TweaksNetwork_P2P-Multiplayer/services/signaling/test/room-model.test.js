import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GUEST_RESUME_TTL_MS,
  HOST_RESUME_TTL_MS,
  JOIN_RATE_LIMIT,
  WAITING_ROOM_TTL_MS
} from '../src/contracts.js'
import {
  addGuest,
  authenticateParticipant,
  authorizeRelay,
  cleanExpiredParticipants,
  createRoomState,
  disconnectParticipant,
  grantTurnCredential,
  listOnlinePeers,
  nextAlarmAt
} from '../src/room-model.js'

function room(now = 1000) {
  return createRoomState({ now, roomCode: 'ABCDEFGH', hostTokenHash: 'host-token', hostResumeHash: 'host-resume' })
}

test('room creates host and expires after fifteen minutes if never joined', () => {
  const state = room()
  assert.equal(state.participants.length, 1)
  assert.equal(nextAlarmAt(state, 1000), 1000 + WAITING_ROOM_TTL_MS)
  cleanExpiredParticipants(state, 1000 + WAITING_ROOM_TTL_MS)
  assert.ok(state.closedAt)
})

test('room accepts three guests and rejects a fifth participant', () => {
  const state = room()
  for (let index = 1; index <= 3; index++) addGuest(state, { now: 1100 + index, tokenHash: `t${index}`, resumeHash: `r${index}` })
  assert.equal(state.participants.length, 4)
  assert.throws(() => addGuest(state, { now: 1200, tokenHash: 't4', resumeHash: 'r4' }), /full/)
})

test('authentication rotates resume token and lists online peers', () => {
  const state = room()
  const guest = addGuest(state, { now: 1100, tokenHash: 'guest-token', resumeHash: 'guest-resume' })
  authenticateParticipant(state, { now: 1200, tokenHash: 'host-token', resumeHash: 'host-resume', nextResumeHash: 'host-next' })
  authenticateParticipant(state, { now: 1201, tokenHash: 'guest-token', resumeHash: 'guest-resume', nextResumeHash: 'guest-next' })
  assert.deepEqual(listOnlinePeers(state, guest.peerId), [{ peerId: 'host', role: 'host', slot: 0 }])
  assert.throws(() => authenticateParticipant(state, { now: 1202, tokenHash: 'guest-token', resumeHash: 'guest-resume', nextResumeHash: 'x' }), /Authentication/)
})

test('host-star routing permits offer answer and ICE only in valid directions', () => {
  const state = room()
  const guest1 = addGuest(state, { now: 1100, tokenHash: 't1', resumeHash: 'r1' })
  const guest2 = addGuest(state, { now: 1101, tokenHash: 't2', resumeHash: 'r2' })
  authenticateParticipant(state, { now: 1200, tokenHash: 'host-token', resumeHash: 'host-resume', nextResumeHash: 'hr2' })
  authenticateParticipant(state, { now: 1201, tokenHash: 't1', resumeHash: 'r1', nextResumeHash: 'r1x' })
  authenticateParticipant(state, { now: 1202, tokenHash: 't2', resumeHash: 'r2', nextResumeHash: 'r2x' })
  assert.equal(authorizeRelay(state, 'host', guest1.peerId, 'signal.offer').target.peerId, guest1.peerId)
  assert.equal(authorizeRelay(state, guest1.peerId, 'host', 'signal.answer').source.peerId, guest1.peerId)
  assert.throws(() => authorizeRelay(state, guest1.peerId, guest2.peerId, 'signal.ice'), /not allowed/)
  assert.throws(() => authorizeRelay(state, guest1.peerId, 'host', 'signal.offer'), /not allowed/)
})

test('guest slot and host room use separate reconnect grace periods', () => {
  const state = room()
  const guest = addGuest(state, { now: 1100, tokenHash: 't1', resumeHash: 'r1' })
  disconnectParticipant(state, guest.peerId, 2000)
  cleanExpiredParticipants(state, 2000 + GUEST_RESUME_TTL_MS)
  assert.equal(state.participants.some((entry) => entry.peerId === guest.peerId), false)
  disconnectParticipant(state, 'host', 3000)
  cleanExpiredParticipants(state, 3000 + HOST_RESUME_TTL_MS)
  assert.ok(state.closedAt)
})

test('join attempts and TURN grants have explicit limits', () => {
  const state = room()
  for (let index = 0; index < JOIN_RATE_LIMIT; index++) {
    try { addGuest(state, { now: 1100, tokenHash: `t${index}`, resumeHash: `r${index}` }) } catch (error) {
      assert.match(error.message, /full/)
    }
  }
  assert.throws(() => addGuest(state, { now: 1100, tokenHash: 'overflow', resumeHash: 'overflow' }), /rate limit/)
  assert.equal(grantTurnCredential(state, 1200, 2), 1)
  assert.equal(grantTurnCredential(state, 1201, 2), 2)
  assert.throws(() => grantTurnCredential(state, 1202, 2), /budget guard/)
})
