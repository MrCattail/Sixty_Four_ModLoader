import assert from 'node:assert/strict'
import test from 'node:test'
import {
  authorizeRoomAccess,
  claimCreatedRoom,
  grantAccountTurn,
  normalizeAdmissionState,
  releaseCreatedRoom
} from '../src/admission-model.js'

const NOW = Date.UTC(2026, 7, 4, 12, 0, 0)

function claim(jti, roomLimit = 1) {
  return { jti, roomLimit, expiresAt: NOW + 24 * 60 * 60 * 1000 }
}

test('global daily room cap cannot be bypassed with more invitation tokens', () => {
  const state = normalizeAdmissionState(null, NOW)
  claimCreatedRoom(state, { claim: claim('invite_0001'), roomCode: 'ABCDEFGH', globalLimit: 2 })
  claimCreatedRoom(state, { claim: claim('invite_0002'), roomCode: 'BCDEFGHJ', globalLimit: 2 })
  assert.throws(() => claimCreatedRoom(state, { claim: claim('invite_0003'), roomCode: 'CDEFGHJK', globalLimit: 2 }), /Daily room budget/)
  assert.equal(state.roomsCreated, 2)
})

test('one-room invitation can reconnect to one room but cannot cross rooms', () => {
  const state = normalizeAdmissionState(null, NOW)
  assert.equal(authorizeRoomAccess(state, { claim: claim('invite_0004'), roomCode: 'ABCDEFGH' }).added, true)
  assert.equal(authorizeRoomAccess(state, { claim: claim('invite_0004'), roomCode: 'ABCDEFGH' }).added, false)
  assert.throws(() => authorizeRoomAccess(state, { claim: claim('invite_0004'), roomCode: 'BCDEFGHJ' }), /room limit/)
})

test('room reservation rollback restores the daily room budget', () => {
  const state = normalizeAdmissionState(null, NOW)
  claimCreatedRoom(state, { claim: claim('invite_0005'), roomCode: 'ABCDEFGH', globalLimit: 1 })
  assert.equal(releaseCreatedRoom(state, { jti: 'invite_0005', roomCode: 'ABCDEFGH' }), true)
  claimCreatedRoom(state, { claim: claim('invite_0006'), roomCode: 'BCDEFGHJ', globalLimit: 1 })
  assert.equal(state.roomsCreated, 1)
})

test('TURN cap resets on a new UTC day', () => {
  let state = normalizeAdmissionState(null, NOW)
  assert.equal(grantAccountTurn(state, { globalLimit: 2 }), 1)
  assert.equal(grantAccountTurn(state, { globalLimit: 2 }), 2)
  assert.throws(() => grantAccountTurn(state, { globalLimit: 2 }), /TURN budget/)
  state = normalizeAdmissionState(state, NOW + 24 * 60 * 60 * 1000)
  assert.equal(grantAccountTurn(state, { globalLimit: 2 }), 1)
})
