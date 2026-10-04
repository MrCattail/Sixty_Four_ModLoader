import { createAlphaInviteToken, MAX_INVITE_ROOM_LIMIT, MAX_INVITE_TTL_SECONDS } from '../src/invite-token.js'

function argument(name, fallback) {
  const prefix = `--${name}=`
  const item = process.argv.slice(2).find((value) => value.startsWith(prefix))
  return item ? item.slice(prefix.length) : fallback
}

const secret = String(process.env.CATTAIL_P2P_ALPHA_SIGNING_SECRET || '')
if (secret.length < 32) {
  throw new Error('Set CATTAIL_P2P_ALPHA_SIGNING_SECRET to the same 32+ character value stored in the Worker secret before generating an invitation.')
}

const hours = Number(argument('hours', '24'))
const roomLimit = Number(argument('room-limit', '1'))
if (!Number.isFinite(hours) || hours < 1 || hours * 60 * 60 > MAX_INVITE_TTL_SECONDS) throw new Error('Invite hours must be between 1 and 168.')
if (!Number.isInteger(roomLimit) || roomLimit < 1 || roomLimit > MAX_INVITE_ROOM_LIMIT) throw new Error(`Room limit must be between 1 and ${MAX_INVITE_ROOM_LIMIT}.`)

const token = await createAlphaInviteToken(secret, { ttlSeconds: hours * 60 * 60, roomLimit })
process.stdout.write(`${token}\n`)
