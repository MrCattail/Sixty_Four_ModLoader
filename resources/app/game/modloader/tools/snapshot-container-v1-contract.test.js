'use strict'

const assert = require('node:assert/strict')
const {
	MAGIC,
	VERSION,
	SnapshotContainerError,
	encodeSnapshotContainer,
	decodeSnapshotContainer
} = require('../snapshot-container.js')

const payload = Buffer.from([0, 1, 2, 3, 127, 128, 254, 255])
const metadata = {
	snapshot: {
		id: '1700000000000-00000000-0000-4000-8000-000000000001',
		reason: 'contract-test'
	},
	integrity: {
		status: 'valid'
	}
}

const encoded = encodeSnapshotContainer({ metadata, payload })
assert.equal(encoded.subarray(0, 8).toString('ascii'), MAGIC)
const decoded = decodeSnapshotContainer(encoded)
assert.equal(decoded.metadata.containerVersion, VERSION)
assert.equal(decoded.metadata.snapshot.id, metadata.snapshot.id)
assert.equal(decoded.metadata.payloadBytes, payload.length)
assert.match(decoded.metadata.payloadSha256, /^[a-f0-9]{64}$/)
assert.deepEqual(decoded.payload, payload)
assert.match(decoded.checksum, /^[a-f0-9]{64}$/)

const corruptPayload = Buffer.from(encoded)
corruptPayload[corruptPayload.length - 33] ^= 0xff
assert.throws(
	() => decodeSnapshotContainer(corruptPayload),
	error => error instanceof SnapshotContainerError && error.code === 'CORRUPT'
)

const corruptMetadata = Buffer.from(encoded)
corruptMetadata[16] ^= 0x01
assert.throws(
	() => decodeSnapshotContainer(corruptMetadata),
	error => error instanceof SnapshotContainerError && error.code === 'CORRUPT'
)

assert.throws(
	() => decodeSnapshotContainer(Buffer.from('not-a-snapshot')),
	error => error instanceof SnapshotContainerError && error.code === 'INVALID_CONTAINER'
)

console.log('Snapshot container v1 contract passed.')
