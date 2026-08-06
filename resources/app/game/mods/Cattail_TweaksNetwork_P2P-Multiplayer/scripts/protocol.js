(function (root) {
	'use strict'

	const MOD_ID = 'cattail.p2p-multiplayer'
	const MOD_VERSION = '0.2.1'
	const PROTOCOL_VERSION = 2
	const CHANNEL_LABEL = 'cattail-p2p-v2'
	const ROOM_CODE_LENGTH = 8
	const MAX_ENVELOPE_BYTES = 256 * 1024
	const MAX_SIGNAL_BYTES = 64 * 1024
	const MAX_DIAGNOSTIC_EVENTS = 200

	const MESSAGE_TYPES = Object.freeze({
		HANDSHAKE: 'p2p.handshake',
		HANDSHAKE_ACK: 'p2p.handshakeAck',
		PROBE_ACK: 'p2p.probeAck',
		ERROR: 'p2p.error'
	})
	const MESSAGE_TYPE_SET = new Set(Object.values(MESSAGE_TYPES))

	const SIGNAL_TYPES = Object.freeze({
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

	function utf8Encode(value) {
		const text = String(value)
		if (typeof TextEncoder === 'function') return new TextEncoder().encode(text)
		if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(text, 'utf8'))
		const escaped = unescape(encodeURIComponent(text))
		const bytes = new Uint8Array(escaped.length)
		for (let index = 0; index < escaped.length; index++) bytes[index] = escaped.charCodeAt(index)
		return bytes
	}

	function jsonByteLength(value) {
		const json = typeof value === 'string' ? value : JSON.stringify(value)
		return utf8Encode(json).byteLength
	}

	function createId(prefix) {
		let id = ''
		try {
			if (root.crypto?.randomUUID) id = root.crypto.randomUUID()
		} catch (error) {}
		if (!id) id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
		return `${prefix || 'id'}-${id}`
	}

	function normalizeRole(role) {
		const value = String(role || '').toLowerCase()
		return value === 'host' || value === 'guest' ? value : 'none'
	}

	function normalizeRoomCode(value) {
		return String(value || '').toUpperCase().replace(/[ILOU\-\s]/g, '').replace(/[^0-9A-HJKMNP-TV-Z]/g, '').slice(0, ROOM_CODE_LENGTH)
	}

	function validateRoomCode(value) {
		const code = normalizeRoomCode(value)
		if (code.length !== ROOM_CODE_LENGTH) throw new Error(`Room code must contain ${ROOM_CODE_LENGTH} characters.`)
		return code
	}

	function normalizeModList(mods) {
		if (!Array.isArray(mods)) return []
		return mods.map(function (entry) {
			return { id: String(entry?.id || ''), version: String(entry?.version || '') }
		}).filter(function (entry) {
			return !!entry.id
		}).sort(function (left, right) {
			return left.id.localeCompare(right.id) || left.version.localeCompare(right.version)
		})
	}

	function makeEnvelope(type, payload, meta) {
		if (!MESSAGE_TYPE_SET.has(type)) throw new Error(`Unsupported Phase 2 message type: ${type}`)
		const envelope = {
			protocolVersion: PROTOCOL_VERSION,
			type,
			messageId: String(meta?.messageId || createId('msg')),
			sentAt: Number.isFinite(meta?.sentAt) ? meta.sentAt : Date.now(),
			payload: payload === undefined ? null : payload
		}
		if (jsonByteLength(envelope) > MAX_ENVELOPE_BYTES) throw new Error('Phase 2 message exceeds the size limit.')
		return envelope
	}

	function validateEnvelope(value) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Phase 2 message must be an object.')
		if (value.protocolVersion !== PROTOCOL_VERSION) throw new Error(`Unsupported protocol version: ${value.protocolVersion}`)
		if (!MESSAGE_TYPE_SET.has(value.type)) throw new Error(`Unsupported Phase 2 message type: ${value.type}`)
		if (typeof value.messageId !== 'string' || !value.messageId || value.messageId.length > 160) throw new Error('Invalid Phase 2 message id.')
		if (!Number.isFinite(value.sentAt)) throw new Error('Invalid Phase 2 message timestamp.')
		if (jsonByteLength(value) > MAX_ENVELOPE_BYTES) throw new Error('Phase 2 message exceeds the size limit.')
		return value
	}

	function makeSignalMessage(type, payload, meta) {
		if (!SIGNAL_TYPE_SET.has(type)) throw new Error(`Unsupported signaling message type: ${type}`)
		const message = {
			protocolVersion: PROTOCOL_VERSION,
			type,
			requestId: String(meta?.requestId || createId('req')),
			sentAt: Number.isFinite(meta?.sentAt) ? meta.sentAt : Date.now(),
			payload: payload === undefined ? null : payload
		}
		if (jsonByteLength(message) > MAX_SIGNAL_BYTES) throw new Error('Signaling message exceeds the size limit.')
		return message
	}

	function validateSignalMessage(value) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Signaling message must be an object.')
		if (value.protocolVersion !== PROTOCOL_VERSION) throw new Error(`Signaling protocol mismatch: ${value.protocolVersion}`)
		if (!SIGNAL_TYPE_SET.has(value.type)) throw new Error(`Unsupported signaling message type: ${value.type}`)
		if (typeof value.requestId !== 'string' || !value.requestId || value.requestId.length > 160) throw new Error('Invalid signaling request id.')
		if (!Number.isFinite(value.sentAt)) throw new Error('Invalid signaling timestamp.')
		if (jsonByteLength(value) > MAX_SIGNAL_BYTES) throw new Error('Signaling message exceeds the size limit.')
		return value
	}

	function buildHandshake(options) {
		return {
			modId: MOD_ID,
			modVersion: MOD_VERSION,
			protocolVersion: PROTOCOL_VERSION,
			role: normalizeRole(options?.role),
			peerId: String(options?.peerId || ''),
			roomCode: normalizeRoomCode(options?.roomCode),
			gameVersion: String(options?.gameVersion || 'unknown'),
			loaderVersion: String(options?.loaderVersion || 'unknown'),
			mods: normalizeModList(options?.mods),
			capabilities: ['ordered-reliable', 'arraybuffer', 'host-star', 'trickle-ice', 'reconnect', 'binary-probe']
		}
	}

	function validateHandshake(value, expected) {
		if (!value || typeof value !== 'object') throw new Error('Handshake payload is missing.')
		if (value.modId !== MOD_ID) throw new Error(`Unexpected remote mod id: ${value.modId}`)
		if (value.protocolVersion !== PROTOCOL_VERSION) throw new Error(`Protocol mismatch: ${value.protocolVersion}`)
		if (normalizeRole(value.role) === 'none') throw new Error('Remote role is invalid.')
		if (!value.peerId || typeof value.peerId !== 'string') throw new Error('Remote peer id is invalid.')
		if (expected?.roomCode && normalizeRoomCode(value.roomCode) !== normalizeRoomCode(expected.roomCode)) throw new Error('Remote room does not match.')
		if (expected?.localRole && normalizeRole(value.role) === normalizeRole(expected.localRole)) throw new Error('Remote role is incompatible with host-star topology.')
		if (expected?.peerId && value.peerId !== expected.peerId) throw new Error('Remote peer identity does not match signaling.')
		const foreignMods = normalizeModList(value.mods).filter(function (entry) { return entry.id !== MOD_ID })
		if (foreignMods.length) throw new Error(`Unsupported remote mods: ${foreignMods.map(function (entry) { return entry.id }).join(', ')}`)
		return value
	}

	function createBinaryProbe(size) {
		const length = Math.max(64, Math.min(65536, Number(size) || 4096))
		const bytes = new Uint8Array(length)
		bytes[0] = 0x43
		bytes[1] = 0x50
		bytes[2] = 0x32
		bytes[3] = 0x50
		for (let index = 4; index < bytes.length; index++) bytes[index] = (index * 31 + 17) & 255
		return bytes
	}

	function inspectBinaryProbe(value) {
		let bytes
		if (value instanceof Uint8Array) bytes = value
		else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value)
		else if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
		else throw new Error('Binary probe payload is not an ArrayBuffer.')
		if (bytes.byteLength < 64 || bytes[0] !== 0x43 || bytes[1] !== 0x50 || bytes[2] !== 0x32 || bytes[3] !== 0x50) throw new Error('Binary probe header is invalid.')
		let checksum = 0
		for (let index = 0; index < bytes.length; index++) checksum = (checksum + bytes[index]) >>> 0
		return { byteLength: bytes.byteLength, checksum }
	}

	function sanitizeDiagnostic(value) {
		const blockedKeys = /(?:token|credential|password|secret|sdp|candidate|address|ip|url|origin|hostname|roomCode)/i
		function clean(item, depth) {
			if (depth > 6) return '[depth-limit]'
			if (Array.isArray(item)) return item.slice(-MAX_DIAGNOSTIC_EVENTS).map(function (entry) { return clean(entry, depth + 1) })
			if (!item || typeof item !== 'object') return item
			const result = {}
			for (const key of Object.keys(item)) result[key] = blockedKeys.test(key) ? '[redacted]' : clean(item[key], depth + 1)
			return result
		}
		return clean(value, 0)
	}

	const api = Object.freeze({
		MOD_ID,
		MOD_VERSION,
		PROTOCOL_VERSION,
		CHANNEL_LABEL,
		ROOM_CODE_LENGTH,
		MAX_ENVELOPE_BYTES,
		MAX_SIGNAL_BYTES,
		MAX_DIAGNOSTIC_EVENTS,
		MESSAGE_TYPES,
		SIGNAL_TYPES,
		normalizeRole,
		normalizeRoomCode,
		validateRoomCode,
		normalizeModList,
		createId,
		makeEnvelope,
		validateEnvelope,
		makeSignalMessage,
		validateSignalMessage,
		buildHandshake,
		validateHandshake,
		createBinaryProbe,
		inspectBinaryProbe,
		jsonByteLength,
		sanitizeDiagnostic
	})

	root.CattailP2PProtocol = api
	if (typeof module === 'object' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
