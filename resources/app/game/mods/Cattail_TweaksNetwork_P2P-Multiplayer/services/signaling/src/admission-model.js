function utcDay(now) {
  return new Date(now).toISOString().slice(0, 10)
}

function safeLimit(value, fallback) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number > 0 ? number : fallback
}

export function normalizeAdmissionState(value, now = Date.now()) {
  const source = value && typeof value === 'object' ? value : {}
  const day = utcDay(now)
  const invitations = {}
  for (const [jti, entry] of Object.entries(source.invitations || {})) {
    if (!entry || Number(entry.expiresAt || 0) <= now) continue
    invitations[jti] = {
      expiresAt: Number(entry.expiresAt),
      rooms: Array.from(new Set(Array.isArray(entry.rooms) ? entry.rooms.map(String) : []))
    }
  }
  return {
    day,
    roomsCreated: source.day === day ? Math.max(0, Number(source.roomsCreated || 0)) : 0,
    turnGrants: source.day === day ? Math.max(0, Number(source.turnGrants || 0)) : 0,
    invitations
  }
}

function invitation(state, claim) {
  const jti = String(claim.jti || '')
  if (!jti) throw new Error('Alpha invitation is invalid.')
  const entry = state.invitations[jti] || { expiresAt: Number(claim.expiresAt), rooms: [] }
  entry.expiresAt = Math.max(Number(entry.expiresAt || 0), Number(claim.expiresAt || 0))
  state.invitations[jti] = entry
  return entry
}

function addRoom(entry, claim, roomCode) {
  const code = String(roomCode || '')
  if (entry.rooms.includes(code)) return false
  if (entry.rooms.length >= safeLimit(claim.roomLimit, 1)) throw new Error('Alpha invitation room limit reached.')
  entry.rooms.push(code)
  return true
}

export function claimCreatedRoom(state, options) {
  const entry = invitation(state, options.claim)
  if (entry.rooms.includes(String(options.roomCode))) return { repeated: true }
  if (state.roomsCreated >= safeLimit(options.globalLimit, 20)) throw new Error('Daily room budget exhausted.')
  addRoom(entry, options.claim, options.roomCode)
  state.roomsCreated += 1
  return { repeated: false }
}

export function releaseCreatedRoom(state, options) {
  const entry = state.invitations[String(options.jti || '')]
  if (!entry) return false
  const index = entry.rooms.indexOf(String(options.roomCode || ''))
  if (index < 0) return false
  entry.rooms.splice(index, 1)
  state.roomsCreated = Math.max(0, state.roomsCreated - 1)
  return true
}

export function authorizeRoomAccess(state, options) {
  const entry = invitation(state, options.claim)
  return { added: addRoom(entry, options.claim, options.roomCode) }
}

export function grantAccountTurn(state, options) {
  if (state.turnGrants >= safeLimit(options.globalLimit, 32)) throw new Error('Daily TURN budget exhausted.')
  state.turnGrants += 1
  return state.turnGrants
}

export function admissionSnapshot(state) {
  return { day: state.day, roomsCreated: state.roomsCreated, turnGrants: state.turnGrants }
}
