import assert from 'node:assert/strict'
import test from 'node:test'
import { createAlphaInviteToken, verifyAlphaInviteToken } from '../src/invite-token.js'

const SECRET = 'test-only-alpha-signing-secret-0123456789'
const NOW = Date.UTC(2026, 7, 4, 12, 0, 0)

test('signed alpha invitation verifies without exposing its signing secret', async () => {
  const token = await createAlphaInviteToken(SECRET, { now: NOW, ttlSeconds: 3600, roomLimit: 1, jti: 'invite_test_0001' })
  const claim = await verifyAlphaInviteToken(token, SECRET, { now: NOW + 1000 })
  assert.deepEqual(claim, {
    jti: 'invite_test_0001',
    issuedAt: NOW,
    expiresAt: NOW + 3600 * 1000,
    roomLimit: 1,
    bypass: false
  })
  assert.doesNotMatch(token, new RegExp(SECRET))
})

test('missing tampered and expired invitations fail closed', async () => {
  const token = await createAlphaInviteToken(SECRET, { now: NOW, ttlSeconds: 60, roomLimit: 1, jti: 'invite_test_0002' })
  await assert.rejects(() => verifyAlphaInviteToken('', SECRET, { now: NOW }), /required/)
  await assert.rejects(() => verifyAlphaInviteToken(token.slice(0, -1) + 'A', SECRET, { now: NOW }), /invalid/)
  await assert.rejects(() => verifyAlphaInviteToken(token, SECRET, { now: NOW + 61 * 1000 }), /expired/)
})

test('weak signing secrets and excessive token lifetime are rejected', async () => {
  await assert.rejects(() => createAlphaInviteToken('weak', { now: NOW }), /configuration/)
  await assert.rejects(() => createAlphaInviteToken(SECRET, { now: NOW, ttlSeconds: 8 * 24 * 60 * 60 }), /invalid/)
  const token = await createAlphaInviteToken(SECRET, { now: NOW, ttlSeconds: 3600, roomLimit: 1, jti: 'invite_test_0003' })
  await assert.rejects(() => verifyAlphaInviteToken(token, 'different-but-long-test-signing-secret-0000', { now: NOW }), /invalid/)
})
