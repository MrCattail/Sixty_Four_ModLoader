export const ALPHA_INVITE_AUDIENCE = 'cattail-p2p-alpha'
export const ALPHA_INVITE_PREFIX = 'p2pa1'
export const MAX_INVITE_TTL_SECONDS = 7 * 24 * 60 * 60
export const MAX_INVITE_ROOM_LIMIT = 4

function bytesToBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Alpha invitation is invalid.')
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  let binary
  try { binary = atob(padded) } catch (error) { throw new Error('Alpha invitation is invalid.') }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function assertSigningSecret(secret) {
  const value = String(secret || '')
  if (value.length < 32) throw new Error('Service configuration is unavailable.')
  return value
}

async function signature(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(assertSigningSecret(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))
}

function equalBytes(left, right) {
  if (left.byteLength !== right.byteLength) return false
  let different = 0
  for (let index = 0; index < left.byteLength; index += 1) different |= left[index] ^ right[index]
  return different === 0
}

function normalizePayload(payload, nowSeconds) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Alpha invitation is invalid.')
  const jti = String(payload.jti || '')
  const iat = Number(payload.iat)
  const exp = Number(payload.exp)
  const roomLimit = Number(payload.roomLimit)
  if (payload.v !== 1 || payload.aud !== ALPHA_INVITE_AUDIENCE) throw new Error('Alpha invitation is invalid.')
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(jti)) throw new Error('Alpha invitation is invalid.')
  if (!Number.isInteger(iat) || !Number.isInteger(exp) || exp <= iat || iat > nowSeconds + 60) throw new Error('Alpha invitation is invalid.')
  if (exp - iat > MAX_INVITE_TTL_SECONDS) throw new Error('Alpha invitation is invalid.')
  if (exp <= nowSeconds) throw new Error('Alpha invitation has expired.')
  if (!Number.isInteger(roomLimit) || roomLimit < 1 || roomLimit > MAX_INVITE_ROOM_LIMIT) throw new Error('Alpha invitation is invalid.')
  return Object.freeze({ jti, issuedAt: iat * 1000, expiresAt: exp * 1000, roomLimit, bypass: false })
}

export async function createAlphaInviteToken(secret, options = {}) {
  const nowMilliseconds = options.now === undefined ? Date.now() : Number(options.now)
  const ttlSeconds = options.ttlSeconds === undefined ? 24 * 60 * 60 : Number(options.ttlSeconds)
  const roomLimit = options.roomLimit === undefined ? 1 : Number(options.roomLimit)
  if (!Number.isFinite(nowMilliseconds)) throw new Error('Alpha invitation is invalid.')
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > MAX_INVITE_TTL_SECONDS) throw new Error('Alpha invitation is invalid.')
  if (!Number.isInteger(roomLimit) || roomLimit < 1 || roomLimit > MAX_INVITE_ROOM_LIMIT) throw new Error('Alpha invitation is invalid.')
  const nowSeconds = Math.floor(nowMilliseconds / 1000)
  const jti = String(options.jti || crypto.randomUUID().replace(/-/g, ''))
  const payload = { v: 1, aud: ALPHA_INVITE_AUDIENCE, jti, iat: nowSeconds, exp: nowSeconds + ttlSeconds, roomLimit }
  normalizePayload(payload, nowSeconds)
  const encodedPayload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const unsigned = `${ALPHA_INVITE_PREFIX}.${encodedPayload}`
  return `${unsigned}.${bytesToBase64Url(await signature(unsigned, secret))}`
}

export async function verifyAlphaInviteToken(token, secret, options = {}) {
  const value = String(token || '')
  if (!value) throw new Error('Alpha invitation is required.')
  if (value.length > 4096) throw new Error('Alpha invitation is invalid.')
  const parts = value.split('.')
  if (parts.length !== 3 || parts[0] !== ALPHA_INVITE_PREFIX) throw new Error('Alpha invitation is invalid.')
  const unsigned = `${parts[0]}.${parts[1]}`
  const supplied = base64UrlToBytes(parts[2])
  const expected = await signature(unsigned, secret)
  if (!equalBytes(supplied, expected)) throw new Error('Alpha invitation is invalid.')
  let payload
  try { payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1]))) } catch (error) { throw new Error('Alpha invitation is invalid.') }
  const nowMilliseconds = options.now === undefined ? Date.now() : Number(options.now)
  if (!Number.isFinite(nowMilliseconds)) throw new Error('Alpha invitation is invalid.')
  return normalizePayload(payload, Math.floor(nowMilliseconds / 1000))
}
