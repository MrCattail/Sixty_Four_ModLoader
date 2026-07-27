'use strict'

const crypto = require('crypto')

const MAGIC = Buffer.from('CMLSNAP1', 'ascii')
const HEADER_BYTES = 16
const CHECKSUM_BYTES = 32
const MAX_METADATA_BYTES = 64 * 1024
const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024

class SnapshotContainerError extends Error {
	constructor(code, message) {
		super(message)
		this.name = 'SnapshotContainerError'
		this.code = code
	}
}

function asBuffer(value) {
	if (Buffer.isBuffer(value)) return Buffer.from(value)
	if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
	throw new SnapshotContainerError('INVALID_CONTAINER', 'Snapshot container data must be bytes.')
}

function safeMetadata(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new SnapshotContainerError('INVALID_CONTAINER', 'Snapshot container metadata must be an object.')
	}
	let text
	try {
		text = JSON.stringify(value)
	} catch (error) {
		throw new SnapshotContainerError('INVALID_CONTAINER', 'Snapshot container metadata is not JSON-safe.')
	}
	const bytes = Buffer.from(text, 'utf8')
	if (!bytes.length || bytes.length > MAX_METADATA_BYTES) {
		throw new SnapshotContainerError('INVALID_CONTAINER', 'Snapshot container metadata is too large.')
	}
	return bytes
}

function sha256Hex(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex')
}

function encodeSnapshotContainer(options) {
	const metadata = Object.assign({}, options?.metadata || {}, {
		containerVersion: 1
	})
	const payload = asBuffer(options?.payload)
	if (payload.length > MAX_PAYLOAD_BYTES) {
		throw new SnapshotContainerError('INVALID_CONTAINER', 'Snapshot container payload is too large.')
	}
	metadata.payloadBytes = payload.length
	metadata.payloadSha256 = sha256Hex(payload)
	const metadataBytes = safeMetadata(metadata)
	const header = Buffer.alloc(HEADER_BYTES)
	MAGIC.copy(header, 0)
	header.writeUInt32LE(metadataBytes.length, 8)
	header.writeUInt32LE(payload.length, 12)
	const body = Buffer.concat([header, metadataBytes, payload])
	const checksum = crypto.createHash('sha256').update(body).digest()
	return Buffer.concat([body, checksum])
}

function decodeSnapshotContainer(value) {
	const bytes = asBuffer(value)
	if (bytes.length < HEADER_BYTES + CHECKSUM_BYTES) {
		throw new SnapshotContainerError('INVALID_CONTAINER', 'Snapshot container is truncated.')
	}
	if (!bytes.subarray(0, MAGIC.length).equals(MAGIC)) {
		throw new SnapshotContainerError('INVALID_CONTAINER', 'Snapshot container header is invalid.')
	}
	const metadataLength = bytes.readUInt32LE(8)
	const payloadLength = bytes.readUInt32LE(12)
	if (!metadataLength || metadataLength > MAX_METADATA_BYTES || payloadLength > MAX_PAYLOAD_BYTES) {
		throw new SnapshotContainerError('INVALID_CONTAINER', 'Snapshot container lengths are invalid.')
	}
	const expectedLength = HEADER_BYTES + metadataLength + payloadLength + CHECKSUM_BYTES
	if (bytes.length !== expectedLength) {
		throw new SnapshotContainerError('INVALID_CONTAINER', 'Snapshot container length does not match its header.')
	}
	const body = bytes.subarray(0, expectedLength - CHECKSUM_BYTES)
	const expectedChecksum = bytes.subarray(expectedLength - CHECKSUM_BYTES)
	const actualChecksum = crypto.createHash('sha256').update(body).digest()
	if (!crypto.timingSafeEqual(expectedChecksum, actualChecksum)) {
		throw new SnapshotContainerError('CORRUPT', 'Snapshot container checksum verification failed.')
	}
	let metadata
	try {
		metadata = JSON.parse(bytes.subarray(HEADER_BYTES, HEADER_BYTES + metadataLength).toString('utf8'))
	} catch (error) {
		throw new SnapshotContainerError('INVALID_CONTAINER', 'Snapshot container metadata is invalid.')
	}
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || metadata.containerVersion !== 1) {
		throw new SnapshotContainerError('INVALID_CONTAINER', 'Snapshot container version is unsupported.')
	}
	const payload = Buffer.from(bytes.subarray(HEADER_BYTES + metadataLength, body.length))
	const payloadSha256 = sha256Hex(payload)
	if (metadata.payloadBytes !== payload.length || metadata.payloadSha256 !== payloadSha256) {
		throw new SnapshotContainerError('CORRUPT', 'Snapshot container payload verification failed.')
	}
	return {
		metadata,
		payload,
		checksum: actualChecksum.toString('hex')
	}
}

module.exports = {
	MAGIC: MAGIC.toString('ascii'),
	VERSION: 1,
	MAX_METADATA_BYTES,
	MAX_PAYLOAD_BYTES,
	SnapshotContainerError,
	encodeSnapshotContainer,
	decodeSnapshotContainer
}
