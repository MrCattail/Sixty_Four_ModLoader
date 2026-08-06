export const MOD_VERSION = '0.2.1'
export const PROTOCOL_VERSION = 2
export const ROOM_CODE_LENGTH = 8
export const ROOM_CAPACITY = 4
export const MAX_BODY_BYTES = 64 * 1024
export const WAITING_ROOM_TTL_MS = 15 * 60 * 1000
export const GUEST_RESUME_TTL_MS = 5 * 60 * 1000
export const HOST_RESUME_TTL_MS = 2 * 60 * 1000
export const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
export const JOIN_RATE_WINDOW_MS = 60 * 1000
export const JOIN_RATE_LIMIT = 20
export const ROOM_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const SIGNAL_TYPES = Object.freeze({
  AUTH: 'signal.auth',
  AUTH_OK: 'signal.authOk',
  PEER_JOINED: 'signal.peerJoined',
  PEER_LEFT: 'signal.peerLeft',
  OFFER: 'signal.offer',
  ANSWER: 'signal.answer',
  ICE: 'signal.ice',
  HEARTBEAT: 'signal.heartbeat',
  ERROR: 'signal.error'
})

const SIGNAL_TYPE_SET = new Set(Object.values(SIGNAL_TYPES))

export function normalizeRoomCode(value) {
  return String(value || '').toUpperCase().replace(/[ILOU\-\s]/g, '').replace(/[^0-9A-HJKMNP-TV-Z]/g, '').slice(0, ROOM_CODE_LENGTH)
}

export function validateRoomCode(value) {
  const code = normalizeRoomCode(value)
  if (code.length !== ROOM_CODE_LENGTH) throw new Error(`Room code must contain ${ROOM_CODE_LENGTH} characters.`)
  return code
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function randomRoomCode() {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH)
  crypto.getRandomValues(bytes)
  let code = ''
  for (const byte of bytes) code += ROOM_ALPHABET[byte % ROOM_ALPHABET.length]
  return code
}

export async function hashSecret(value) {
  const bytes = new TextEncoder().encode(String(value || ''))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function makeSignal(type, payload = null, requestId = crypto.randomUUID()) {
  if (!SIGNAL_TYPE_SET.has(type)) throw new Error(`Unsupported signaling type: ${type}`)
  const message = { protocolVersion: PROTOCOL_VERSION, type, requestId, sentAt: Date.now(), payload }
  if (new TextEncoder().encode(JSON.stringify(message)).byteLength > MAX_BODY_BYTES) throw new Error('Signaling message exceeds the size limit.')
  return message
}

export function validateSignal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Signaling message must be an object.')
  if (value.protocolVersion !== PROTOCOL_VERSION) throw new Error(`Protocol mismatch: ${value.protocolVersion}`)
  if (!SIGNAL_TYPE_SET.has(value.type)) throw new Error(`Unsupported signaling type: ${value.type}`)
  if (typeof value.requestId !== 'string' || !value.requestId || value.requestId.length > 160) throw new Error('Invalid request id.')
  if (!Number.isFinite(value.sentAt)) throw new Error('Invalid signaling timestamp.')
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BODY_BYTES) throw new Error('Signaling message exceeds the size limit.')
  return value
}

export async function readJson(request) {
  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > MAX_BODY_BYTES) throw new Error('Request body exceeds the size limit.')
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('Request body exceeds the size limit.')
  if (!text) return {}
  const value = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Request JSON must be an object.')
  return value
}

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  })
}

export function publicError(error, fallback = 'Request failed.') {
  const safe = new Set([
    'Room not found.', 'Room is closed.', 'Room is full.', 'Room has expired.', 'Join rate limit exceeded.',
    'Authentication failed.', 'Protocol version is unsupported.', 'Signaling message is not allowed for this peer.',
    'Alpha invitation is required.', 'Alpha invitation is invalid.', 'Alpha invitation has expired.',
    'Alpha invitation room limit reached.', 'Daily room budget exhausted.', 'Daily TURN budget exhausted.',
    'Service is temporarily disabled.', 'Service configuration is unavailable.'
  ])
  const message = error instanceof Error ? error.message : String(error || '')
  return safe.has(message) ? message : fallback
}

export function sanitizeEvent(type, details = {}, now = Date.now()) {
  const blocked = /(?:token|credential|secret|password|sdp|candidate|address|ip)/i
  const safeDetails = {}
  for (const [key, value] of Object.entries(details || {})) safeDetails[key] = blocked.test(key) ? '[redacted]' : value
  return { timestamp: new Date(now).toISOString(), type: String(type), details: safeDetails }
}
