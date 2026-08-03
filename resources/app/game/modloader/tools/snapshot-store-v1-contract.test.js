'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
	API_VERSION,
	MAX_PAYLOAD_BYTES,
	MAX_SNAPSHOTS,
	SnapshotStore,
	SnapshotStoreError
} = require('../snapshot-store.js')

let serial = 1
let clock = 1700000000000
function randomUUID() {
	return `00000000-0000-4000-8000-${String(serial++).padStart(12, '0')}`
}
function now() {
	return clock++
}

async function run() {
	const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cattail-snapshot-store-'))
	try {
		const store = new SnapshotStore({ rootDir: tempRoot, randomUUID, now })
		await store.initialize()
		assert.deepEqual(store.capabilities().payloadTypes, ['utf8', 'bytes'])
		assert.equal(store.capabilities().apiVersion, API_VERSION)
		assert.equal(store.capabilities().maxSnapshotsPerNamespace, MAX_SNAPSHOTS)

		const context = {
			modId: 'contract.mod',
			saveInstanceId: '11111111-1111-4111-8111-111111111111',
			accountScope: 'steam:42'
		}
		const otherContext = {
			modId: 'other.mod',
			saveInstanceId: context.saveInstanceId,
			accountScope: context.accountScope
		}

		const first = await store.create(context, {
			data: 'hello 世界',
			reason: 'before-world-write',
			tags: { transaction: 1, source: ['contract', true] }
		})
		assert.equal(first.payloadType, 'utf8')
		assert.equal(first.reason, 'before-world-write')
		assert.equal(first.tags.transaction, 1)
		assert.match(first.sha256, /^[a-f0-9]{64}$/)

		const firstRead = await store.read(context, { id: first.id })
		assert.equal(firstRead.payload.toString('utf8'), 'hello 世界')
		assert.equal(firstRead.info.id, first.id)
		assert.deepEqual(await store.list(otherContext), [])

		const bytes = Uint8Array.from([0, 1, 127, 128, 255])
		const second = await store.create(context, { data: bytes, reason: 'binary-contract' })
		const secondRead = await store.read(context, { id: second.id })
		assert.deepEqual(secondRead.payload, Buffer.from(bytes))
		assert.equal(secondRead.info.payloadType, 'bytes')

		await assert.rejects(
			store.create(context, { data: 'x', reason: '' }),
			error => error instanceof SnapshotStoreError && error.code === 'INVALID_PAYLOAD' && !error.message.includes(tempRoot)
		)
		await assert.rejects(
			store.create(context, { data: Buffer.alloc(MAX_PAYLOAD_BYTES + 1), reason: 'too-large' }),
			error => error instanceof SnapshotStoreError && error.code === 'TOO_LARGE'
		)
		await assert.rejects(
			store.create(context, { data: 'x', reason: 'bad-tags', tags: Object.create({ inherited: true }) }),
			error => error instanceof SnapshotStoreError && error.code === 'INVALID_PAYLOAD'
		)

		await Promise.all(Array.from({ length: 12 }, (_, index) => store.create(context, {
			data: `queued-${index}`,
			reason: 'queue-contract',
			tags: { index }
		})))
		const rotated = await store.list(context)
		assert.equal(rotated.length, MAX_SNAPSHOTS)
		assert.ok(rotated.every((item, index) => index === 0 || rotated[index - 1].createdAt >= item.createdAt))
		assert.ok(!rotated.some(item => item.id === first.id))

		const pruneResult = await store.prune(context)
		assert.equal(pruneResult.remainingCount, MAX_SNAPSHOTS)
		assert.deepEqual(pruneResult.removedIds, [])

		const corrupt = rotated[0]
		const adminBefore = await store.adminList()
		const corruptAdmin = adminBefore.find(item => item.id === corrupt.id && item.status === 'ready')
		assert.ok(corruptAdmin)
		const corruptDirectory = path.join(
			tempRoot,
			'v1',
			corruptAdmin.locator.modHash,
			corruptAdmin.locator.saveHash,
			corruptAdmin.locator.id
		)
		await fs.promises.appendFile(path.join(corruptDirectory, 'payload.bin'), Buffer.from([0xff]))
		await assert.rejects(
			store.read(context, { id: corrupt.id }),
			error => error instanceof SnapshotStoreError && error.code === 'CORRUPT'
		)
		const adminAfter = await store.adminList()
		const quarantined = adminAfter.find(item => item.id === corrupt.id && item.status === 'quarantined')
		assert.ok(quarantined)
		const validation = await store.adminValidate(quarantined.locator)
		assert.equal(validation.valid, false)
		assert.equal(validation.status, 'quarantined')
		const forensic = await store.adminExportData(quarantined.locator)
		assert.equal(forensic.status, 'quarantined')
		assert.equal(forensic.integrity.status, 'corrupt')
		assert.notEqual(forensic.integrity.expectedSha256, forensic.integrity.actualSha256)
		const removedQuarantine = await store.adminRemove(quarantined.locator)
		assert.equal(removedQuarantine.removed, true)

		const remaining = await store.list(context)
		const removed = await store.remove(context, { id: remaining[0].id })
		assert.equal(removed.removed, true)
		await assert.rejects(
			store.read(context, { id: remaining[0].id }),
			error => error instanceof SnapshotStoreError && error.code === 'NOT_FOUND'
		)

		const staleRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cattail-snapshot-stale-'))
		try {
			const modHash = 'a'.repeat(64)
			const saveHash = 'b'.repeat(64)
			const staleDirectory = path.join(staleRoot, 'v1', modHash, saveHash, '.tmp-stale-contract')
			await fs.promises.mkdir(staleDirectory, { recursive: true })
			await fs.promises.writeFile(path.join(staleDirectory, 'payload.bin'), 'partial')
			const recoveringStore = new SnapshotStore({ rootDir: staleRoot, randomUUID, now })
			await recoveringStore.initialize()
			assert.equal(fs.existsSync(staleDirectory), false)
		} finally {
			await fs.promises.rm(staleRoot, { recursive: true, force: true })
		}
	} finally {
		await fs.promises.rm(tempRoot, { recursive: true, force: true })
	}
}

run().then(
	() => console.log('Snapshot store v1 contract passed.'),
	error => {
		console.error(error)
		process.exitCode = 1
	}
)
