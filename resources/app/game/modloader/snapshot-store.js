'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const API_VERSION = '1.0.0'
const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024
const MAX_SNAPSHOTS = 10
const MAX_REASON_CHARS = 128
const MAX_TAG_BYTES = 4 * 1024
const MAX_TAG_DEPTH = 4
const MAX_TAG_KEYS = 64
const QUARANTINE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const QUARANTINE_MAX_PER_NAMESPACE = 10
const QUARANTINE_MAX_BYTES = 256 * 1024 * 1024
const HASH_PATTERN = /^[a-f0-9]{64}$/
const SNAPSHOT_ID_PATTERN = /^[a-z0-9-]{20,96}$/
const FORBIDDEN_TAG_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/

class SnapshotStoreError extends Error {
	constructor(code, message, cause) {
		super(message)
		this.name = 'SnapshotStoreError'
		this.code = code
		if (cause) this.cause = cause
	}
}

function sha256(value) {
	return crypto.createHash('sha256').update(value).digest('hex')
}

function isPlainObject(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

function cloneAndValidateTags(value) {
	if (value === undefined) return undefined
	if (!isPlainObject(value)) {
		throw new SnapshotStoreError('INVALID_PAYLOAD', 'Snapshot tags must be a plain object.')
	}
	let keyCount = 0
	const visit = function (entry, depth) {
		if (depth > MAX_TAG_DEPTH) {
			throw new SnapshotStoreError('INVALID_PAYLOAD', 'Snapshot tags are too deeply nested.')
		}
		if (entry === null || typeof entry === 'boolean') return entry
		if (typeof entry === 'number') {
			if (!Number.isFinite(entry)) throw new SnapshotStoreError('INVALID_PAYLOAD', 'Snapshot tags contain an invalid number.')
			return entry
		}
		if (typeof entry === 'string') {
			if (CONTROL_CHAR_PATTERN.test(entry)) throw new SnapshotStoreError('INVALID_PAYLOAD', 'Snapshot tags contain control characters.')
			return entry
		}
		if (Array.isArray(entry)) return entry.map(item => visit(item, depth + 1))
		if (!isPlainObject(entry)) {
			throw new SnapshotStoreError('INVALID_PAYLOAD', 'Snapshot tags contain a non-JSON value.')
		}
		const output = {}
		for (const key of Object.keys(entry)) {
			keyCount++
			if (keyCount > MAX_TAG_KEYS) throw new SnapshotStoreError('INVALID_PAYLOAD', 'Snapshot tags contain too many keys.')
			if (!key || key.length > 128 || CONTROL_CHAR_PATTERN.test(key) || FORBIDDEN_TAG_KEYS.has(key)) {
				throw new SnapshotStoreError('INVALID_PAYLOAD', 'Snapshot tags contain an invalid key.')
			}
			output[key] = visit(entry[key], depth + 1)
		}
		return output
	}
	const cloned = visit(value, 0)
	let encoded
	try {
		encoded = JSON.stringify(cloned)
	} catch (error) {
		throw new SnapshotStoreError('INVALID_PAYLOAD', 'Snapshot tags are not JSON-safe.', error)
	}
	if (Buffer.byteLength(encoded, 'utf8') > MAX_TAG_BYTES) {
		throw new SnapshotStoreError('INVALID_PAYLOAD', 'Snapshot tags are too large.')
	}
	return cloned
}

function normalizeReason(value) {
	if (typeof value !== 'string') throw new SnapshotStoreError('INVALID_PAYLOAD', 'Snapshot reason is required.')
	const reason = value.trim()
	if (!reason || reason.length > MAX_REASON_CHARS || CONTROL_CHAR_PATTERN.test(reason)) {
		throw new SnapshotStoreError('INVALID_PAYLOAD', 'Snapshot reason is invalid.')
	}
	return reason
}

function normalizePayload(value) {
	if (typeof value === 'string') {
		const bytes = Buffer.from(value, 'utf8')
		if (bytes.length > MAX_PAYLOAD_BYTES) throw new SnapshotStoreError('TOO_LARGE', 'Snapshot payload exceeds 16 MiB.')
		return { bytes, payloadType: 'utf8' }
	}
	if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
		const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
		if (bytes.length > MAX_PAYLOAD_BYTES) throw new SnapshotStoreError('TOO_LARGE', 'Snapshot payload exceeds 16 MiB.')
		return { bytes: Buffer.from(bytes), payloadType: 'bytes' }
	}
	throw new SnapshotStoreError('INVALID_PAYLOAD', 'Snapshot data must be a string or Uint8Array.')
}

function safePublicInfo(metadata) {
	return {
		id: metadata.id,
		createdAt: metadata.createdAt,
		bytes: metadata.bytes,
		sha256: metadata.sha256,
		apiVersion: metadata.apiVersion,
		payloadType: metadata.payloadType,
		reason: metadata.reason,
		tags: metadata.tags === undefined ? undefined : JSON.parse(JSON.stringify(metadata.tags))
	}
}

function safeMessageForCode(code) {
	const messages = {
		UNAVAILABLE: 'Snapshot storage is unavailable.',
		NO_ACTIVE_SAVE: 'No active save is available.',
		INVALID_PAYLOAD: 'Snapshot request is invalid.',
		TOO_LARGE: 'Snapshot payload exceeds the allowed size.',
		NOT_FOUND: 'Snapshot was not found.',
		CORRUPT: 'Snapshot integrity verification failed.',
		QUOTA: 'Snapshot storage quota was exceeded.',
		IO: 'Snapshot storage operation failed.'
	}
	return messages[code] || messages.IO
}

class SnapshotStore {
	constructor(options) {
		if (!options?.rootDir || !path.isAbsolute(options.rootDir)) {
			throw new SnapshotStoreError('UNAVAILABLE', 'Snapshot storage root must be absolute.')
		}
		this.rootDir = path.resolve(options.rootDir)
		this.versionRoot = path.join(this.rootDir, 'v1')
		this.quarantineRoot = path.join(this.rootDir, 'quarantine', 'v1')
		this.auditLogPath = path.join(this.rootDir, 'audit.log')
		this.now = typeof options.now === 'function' ? options.now : Date.now
		this.randomUUID = typeof options.randomUUID === 'function' ? options.randomUUID : crypto.randomUUID
		this.log = typeof options.log === 'function' ? options.log : function () {}
		this.queues = new Map()
		this.initialization = null
	}

	capabilities() {
		return Object.freeze({
			apiVersion: API_VERSION,
			available: true,
			payloadTypes: Object.freeze(['utf8', 'bytes']),
			maxPayloadBytes: MAX_PAYLOAD_BYTES,
			maxSnapshotsPerNamespace: MAX_SNAPSHOTS,
			atomicPublish: true,
			checksum: 'sha256',
			compression: false,
			encryption: false,
			streaming: false,
			exportContainerVersion: 1
		})
	}

	async initialize() {
		if (!this.initialization) {
			this.initialization = this._initialize().catch(error => {
				this.initialization = null
				throw this._publicError(error, 'UNAVAILABLE')
			})
		}
		return this.initialization
	}

	async _initialize() {
		await fs.promises.mkdir(this.versionRoot, { recursive: true })
		await fs.promises.mkdir(this.quarantineRoot, { recursive: true })
		await this._removeStaleTemps()
		await this._scanPublishedSnapshots()
		await this._pruneQuarantine()
	}

	_namespace(context) {
		const modId = String(context?.modId || '').trim()
		const saveInstanceId = String(context?.saveInstanceId || '').trim()
		const accountScope = String(context?.accountScope || '').trim()
		if (!modId || modId.length > 256 || CONTROL_CHAR_PATTERN.test(modId)) {
			throw new SnapshotStoreError('INVALID_PAYLOAD', 'Snapshot Mod identity is invalid.')
		}
		if (!saveInstanceId || saveInstanceId.length > 128 || CONTROL_CHAR_PATTERN.test(saveInstanceId)) {
			throw new SnapshotStoreError('NO_ACTIVE_SAVE', 'No active save is available.')
		}
		if (!accountScope || accountScope.length > 256 || CONTROL_CHAR_PATTERN.test(accountScope)) {
			throw new SnapshotStoreError('UNAVAILABLE', 'Snapshot account scope is unavailable.')
		}
		const modHash = sha256(`mod\u0000${modId}`)
		const saveHash = sha256(`save\u0000${accountScope}\u0000${saveInstanceId}`)
		const directory = this._inside(this.versionRoot, modHash, saveHash)
		return { modId, saveInstanceId, accountScope, modHash, saveHash, directory, key: `${modHash}/${saveHash}` }
	}

	_inside(root, ...parts) {
		const target = path.resolve(root, ...parts)
		const relative = path.relative(path.resolve(root), target)
		if (relative.startsWith('..') || path.isAbsolute(relative)) {
			throw new SnapshotStoreError('IO', 'Snapshot storage path validation failed.')
		}
		return target
	}

	_snapshotPath(namespace, id) {
		if (!SNAPSHOT_ID_PATTERN.test(String(id || ''))) {
			throw new SnapshotStoreError('NOT_FOUND', 'Snapshot was not found.')
		}
		return this._inside(namespace.directory, id)
	}

	_enqueue(key, task) {
		const previous = this.queues.get(key) || Promise.resolve()
		const operation = previous.catch(() => {}).then(task)
		const settled = operation.catch(() => {})
		this.queues.set(key, settled)
		settled.finally(() => {
			if (this.queues.get(key) === settled) this.queues.delete(key)
		})
		return operation
	}

	async _waitForQueue(key) {
		const pending = this.queues.get(key)
		if (pending) await pending.catch(() => {})
	}

	async create(context, request) {
		await this.initialize()
		const namespace = this._namespace(context)
		const payload = normalizePayload(request?.data)
		const reason = normalizeReason(request?.reason)
		const tags = cloneAndValidateTags(request?.tags)
		return this._enqueue(namespace.key, async () => {
			await fs.promises.mkdir(namespace.directory, { recursive: true })
			const createdAt = Number(this.now())
			const id = `${String(createdAt).padStart(13, '0')}-${this.randomUUID().toLowerCase()}`
			const finalDirectory = this._snapshotPath(namespace, id)
			const tempName = `.tmp-${id}-${this.randomUUID().toLowerCase()}`
			const tempDirectory = this._inside(namespace.directory, tempName)
			const checksum = sha256(payload.bytes)
			const metadata = {
				schemaVersion: 1,
				id,
				createdAt,
				modId: namespace.modId,
				saveInstanceId: namespace.saveInstanceId,
				accountScope: namespace.accountScope,
				modHash: namespace.modHash,
				saveHash: namespace.saveHash,
				bytes: payload.bytes.length,
				sha256: checksum,
				apiVersion: API_VERSION,
				payloadType: payload.payloadType,
				reason,
				tags
			}
			try {
				await fs.promises.mkdir(tempDirectory)
				await this._writeDurable(path.join(tempDirectory, 'payload.bin'), payload.bytes)
				await this._writeDurable(path.join(tempDirectory, 'metadata.json'), Buffer.from(JSON.stringify(metadata, null, 2), 'utf8'))
				await this._verifyDirectory(tempDirectory, { namespace, expectedId: id })
				await fs.promises.rename(tempDirectory, finalDirectory)
				await this._audit('snapshot-created', { modHash: namespace.modHash, saveHash: namespace.saveHash, id, bytes: payload.bytes.length })
			} catch (error) {
				await fs.promises.rm(tempDirectory, { recursive: true, force: true }).catch(() => {})
				throw this._publicError(error)
			}
			try {
				await this._pruneNamespace(namespace)
			} catch (error) {
				await this._audit('snapshot-prune-failed', { modHash: namespace.modHash, saveHash: namespace.saveHash, id, code: error?.code || 'IO' })
				this.log('snapshotPruneFailed', { modHash: namespace.modHash, saveHash: namespace.saveHash, id, error: error?.message })
			}
			return safePublicInfo(metadata)
		})
	}

	async list(context) {
		await this.initialize()
		const namespace = this._namespace(context)
		await this._waitForQueue(namespace.key)
		const records = await this._listNamespace(namespace)
		return records.map(record => safePublicInfo(record.metadata))
	}

	async read(context, request) {
		await this.initialize()
		const namespace = this._namespace(context)
		await this._waitForQueue(namespace.key)
		const id = String(request?.id || '')
		const directory = this._snapshotPath(namespace, id)
		try {
			const record = await this._verifyDirectory(directory, { namespace, expectedId: id })
			return {
				info: safePublicInfo(record.metadata),
				payload: record.payload
			}
		} catch (error) {
			if (error?.code === 'CORRUPT') await this._quarantineSnapshot(namespace.modHash, namespace.saveHash, directory, id, error.message)
			throw this._publicError(error)
		}
	}

	async remove(context, request) {
		await this.initialize()
		const namespace = this._namespace(context)
		const id = String(request?.id || '')
		return this._enqueue(namespace.key, async () => {
			const directory = this._snapshotPath(namespace, id)
			if (!await this._exists(directory)) throw new SnapshotStoreError('NOT_FOUND', 'Snapshot was not found.')
			try {
				await fs.promises.rm(directory, { recursive: true, force: false })
				await this._audit('snapshot-removed', { modHash: namespace.modHash, saveHash: namespace.saveHash, id })
				return { id, removed: true }
			} catch (error) {
				throw this._publicError(error)
			}
		})
	}

	async prune(context) {
		await this.initialize()
		const namespace = this._namespace(context)
		return this._enqueue(namespace.key, () => this._pruneNamespace(namespace))
	}

	async _pruneNamespace(namespace) {
		const records = await this._listNamespace(namespace)
		const removedIds = []
		for (const record of records.slice(MAX_SNAPSHOTS)) {
			await fs.promises.rm(record.directory, { recursive: true, force: false })
			removedIds.push(record.metadata.id)
			await this._audit('snapshot-pruned', { modHash: namespace.modHash, saveHash: namespace.saveHash, id: record.metadata.id })
		}
		return { removedIds, remainingCount: records.length - removedIds.length }
	}

	async _listNamespace(namespace) {
		let entries
		try {
			entries = await fs.promises.readdir(namespace.directory, { withFileTypes: true })
		} catch (error) {
			if (error?.code === 'ENOENT') return []
			throw this._publicError(error)
		}
		const records = []
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name.startsWith('.tmp-')) continue
			const directory = this._inside(namespace.directory, entry.name)
			try {
				records.push(await this._verifyDirectory(directory, { namespace, expectedId: entry.name }))
			} catch (error) {
				if (error?.code === 'CORRUPT') {
					await this._quarantineSnapshot(namespace.modHash, namespace.saveHash, directory, entry.name, error.message)
					continue
				}
				throw this._publicError(error)
			}
		}
		records.sort((a, b) => b.metadata.createdAt - a.metadata.createdAt || b.metadata.id.localeCompare(a.metadata.id))
		return records
	}

	async _verifyDirectory(directory, options) {
		let metadata
		let payload
		try {
			const metadataText = await fs.promises.readFile(path.join(directory, 'metadata.json'), 'utf8')
			metadata = JSON.parse(metadataText)
			payload = await fs.promises.readFile(path.join(directory, 'payload.bin'))
		} catch (error) {
			if (error?.code === 'ENOENT' && !await this._exists(directory)) {
				throw new SnapshotStoreError('NOT_FOUND', 'Snapshot was not found.', error)
			}
			throw new SnapshotStoreError('CORRUPT', 'Snapshot files are missing or invalid.', error)
		}
		if (!metadata || typeof metadata !== 'object' || metadata.schemaVersion !== 1) {
			throw new SnapshotStoreError('CORRUPT', 'Snapshot metadata version is invalid.')
		}
		if (!SNAPSHOT_ID_PATTERN.test(metadata.id) || metadata.id !== options.expectedId) {
			throw new SnapshotStoreError('CORRUPT', 'Snapshot identity is invalid.')
		}
		if (!Number.isFinite(metadata.createdAt) || metadata.createdAt <= 0 || metadata.bytes !== payload.length || payload.length > MAX_PAYLOAD_BYTES) {
			throw new SnapshotStoreError('CORRUPT', 'Snapshot size metadata is invalid.')
		}
		if (metadata.apiVersion !== API_VERSION || !['utf8', 'bytes'].includes(metadata.payloadType)) {
			throw new SnapshotStoreError('CORRUPT', 'Snapshot API metadata is invalid.')
		}
		if (metadata.sha256 !== sha256(payload)) {
			throw new SnapshotStoreError('CORRUPT', 'Snapshot checksum verification failed.')
		}
		try {
			normalizeReason(metadata.reason)
			cloneAndValidateTags(metadata.tags)
		} catch (error) {
			throw new SnapshotStoreError('CORRUPT', 'Snapshot caller metadata is invalid.', error)
		}
		const expectedModHash = sha256(`mod\u0000${String(metadata.modId || '')}`)
		const expectedSaveHash = sha256(`save\u0000${String(metadata.accountScope || '')}\u0000${String(metadata.saveInstanceId || '')}`)
		if (metadata.modHash !== expectedModHash || metadata.saveHash !== expectedSaveHash) {
			throw new SnapshotStoreError('CORRUPT', 'Snapshot namespace metadata is invalid.')
		}
		if (options.namespace && (
			metadata.modHash !== options.namespace.modHash ||
			metadata.saveHash !== options.namespace.saveHash ||
			metadata.modId !== options.namespace.modId ||
			metadata.saveInstanceId !== options.namespace.saveInstanceId ||
			metadata.accountScope !== options.namespace.accountScope
		)) {
			throw new SnapshotStoreError('CORRUPT', 'Snapshot namespace does not match the active save.')
		}
		return { directory, metadata, payload }
	}

	async _writeDurable(filePath, bytes) {
		const handle = await fs.promises.open(filePath, 'wx')
		try {
			await handle.writeFile(bytes)
			await handle.sync()
		} finally {
			await handle.close()
		}
	}

	async _removeStaleTemps() {
		for (const modEntry of await this._safeDirectories(this.versionRoot)) {
			if (!HASH_PATTERN.test(modEntry.name)) continue
			const modDirectory = this._inside(this.versionRoot, modEntry.name)
			for (const saveEntry of await this._safeDirectories(modDirectory)) {
				if (!HASH_PATTERN.test(saveEntry.name)) continue
				const saveDirectory = this._inside(modDirectory, saveEntry.name)
				for (const entry of await this._safeDirectories(saveDirectory)) {
					if (!entry.name.startsWith('.tmp-')) continue
					await fs.promises.rm(this._inside(saveDirectory, entry.name), { recursive: true, force: true })
					await this._audit('snapshot-temp-removed', { modHash: modEntry.name, saveHash: saveEntry.name, name: entry.name })
				}
			}
		}
	}

	async _scanPublishedSnapshots() {
		for (const modEntry of await this._safeDirectories(this.versionRoot)) {
			if (!HASH_PATTERN.test(modEntry.name)) continue
			const modDirectory = this._inside(this.versionRoot, modEntry.name)
			for (const saveEntry of await this._safeDirectories(modDirectory)) {
				if (!HASH_PATTERN.test(saveEntry.name)) continue
				const saveDirectory = this._inside(modDirectory, saveEntry.name)
				for (const snapshotEntry of await this._safeDirectories(saveDirectory)) {
					if (snapshotEntry.name.startsWith('.tmp-')) continue
					const directory = this._inside(saveDirectory, snapshotEntry.name)
					try {
						await this._verifyDirectory(directory, { expectedId: snapshotEntry.name })
					} catch (error) {
						if (error?.code === 'CORRUPT') {
							await this._quarantineSnapshot(modEntry.name, saveEntry.name, directory, snapshotEntry.name, error.message)
						} else {
							this.log('snapshotStartupScanFailed', { modHash: modEntry.name, saveHash: saveEntry.name, id: snapshotEntry.name, error: error?.message })
						}
					}
				}
			}
		}
	}

	async _quarantineSnapshot(modHash, saveHash, sourceDirectory, originalId, detectedReason) {
		if (!HASH_PATTERN.test(modHash) || !HASH_PATTERN.test(saveHash)) return false
		if (!await this._exists(sourceDirectory)) return false
		const namespaceDirectory = this._inside(this.quarantineRoot, modHash, saveHash)
		await fs.promises.mkdir(namespaceDirectory, { recursive: true })
		const quarantineId = `${String(this.now()).padStart(13, '0')}-${this.randomUUID().toLowerCase()}`
		const destination = this._inside(namespaceDirectory, quarantineId)
		try {
			await fs.promises.rename(sourceDirectory, destination)
			const audit = {
				schemaVersion: 1,
				quarantineId,
				originalId: String(originalId || ''),
				quarantinedAt: Number(this.now()),
				detectedReason: String(detectedReason || 'Snapshot integrity verification failed.').slice(0, 512),
				modHash,
				saveHash
			}
			await fs.promises.writeFile(path.join(destination, 'quarantine.json'), JSON.stringify(audit, null, 2), 'utf8')
			await this._audit('snapshot-quarantined', { modHash, saveHash, originalId, quarantineId, detectedReason: audit.detectedReason })
			try {
				await this._pruneQuarantine()
			} catch (error) {
				this.log('snapshotQuarantinePruneFailed', { error: error?.message })
			}
			return true
		} catch (error) {
			this.log('snapshotQuarantineFailed', { modHash, saveHash, originalId, error: error?.message })
			await this._audit('snapshot-quarantine-failed', { modHash, saveHash, originalId, code: error?.code || 'IO' })
			return false
		}
	}

	async adminList() {
		await this.initialize()
		await Promise.all(Array.from(this.queues.values()).map(operation => operation.catch(() => {})))
		const items = []
		for (const modEntry of await this._safeDirectories(this.versionRoot)) {
			if (!HASH_PATTERN.test(modEntry.name)) continue
			const modDirectory = this._inside(this.versionRoot, modEntry.name)
			for (const saveEntry of await this._safeDirectories(modDirectory)) {
				if (!HASH_PATTERN.test(saveEntry.name)) continue
				const saveDirectory = this._inside(modDirectory, saveEntry.name)
				for (const snapshotEntry of await this._safeDirectories(saveDirectory)) {
					if (snapshotEntry.name.startsWith('.tmp-')) continue
					const directory = this._inside(saveDirectory, snapshotEntry.name)
					try {
						const record = await this._verifyDirectory(directory, { expectedId: snapshotEntry.name })
						items.push(this._adminItem('ready', modEntry.name, saveEntry.name, snapshotEntry.name, record.metadata))
					} catch (error) {
						if (error?.code === 'CORRUPT') await this._quarantineSnapshot(modEntry.name, saveEntry.name, directory, snapshotEntry.name, error.message)
					}
				}
			}
		}
		for (const modEntry of await this._safeDirectories(this.quarantineRoot)) {
			if (!HASH_PATTERN.test(modEntry.name)) continue
			const modDirectory = this._inside(this.quarantineRoot, modEntry.name)
			for (const saveEntry of await this._safeDirectories(modDirectory)) {
				if (!HASH_PATTERN.test(saveEntry.name)) continue
				const saveDirectory = this._inside(modDirectory, saveEntry.name)
				for (const quarantineEntry of await this._safeDirectories(saveDirectory)) {
					const directory = this._inside(saveDirectory, quarantineEntry.name)
					const audit = await this._readJson(path.join(directory, 'quarantine.json'), {})
					const metadata = await this._readJson(path.join(directory, 'metadata.json'), {})
					items.push(this._adminItem('quarantined', modEntry.name, saveEntry.name, quarantineEntry.name, metadata, audit))
				}
			}
		}
		items.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
		return items
	}

	_adminItem(status, modHash, saveHash, id, metadata, audit) {
		return {
			locator: { status, modHash, saveHash, id },
			status,
			id: status === 'ready' ? String(metadata?.id || id) : String(audit?.originalId || metadata?.id || id),
			createdAt: Number(metadata?.createdAt || audit?.quarantinedAt || 0),
			quarantinedAt: status === 'quarantined' ? Number(audit?.quarantinedAt || 0) : undefined,
			modId: typeof metadata?.modId === 'string' ? metadata.modId : 'unknown',
			namespace: saveHash.slice(0, 12),
			bytes: Number(metadata?.bytes || 0),
			sha256: typeof metadata?.sha256 === 'string' ? metadata.sha256 : '',
			payloadType: metadata?.payloadType === 'utf8' ? 'utf8' : 'bytes',
			reason: typeof metadata?.reason === 'string' ? metadata.reason : '',
			tags: isPlainObject(metadata?.tags) ? JSON.parse(JSON.stringify(metadata.tags)) : undefined,
			detectedReason: status === 'quarantined' ? String(audit?.detectedReason || 'Snapshot integrity verification failed.') : undefined
		}
	}

	_adminDirectory(locator) {
		const status = locator?.status
		const modHash = String(locator?.modHash || '')
		const saveHash = String(locator?.saveHash || '')
		const id = String(locator?.id || '')
		if (!['ready', 'quarantined'].includes(status) || !HASH_PATTERN.test(modHash) || !HASH_PATTERN.test(saveHash) || !SNAPSHOT_ID_PATTERN.test(id)) {
			throw new SnapshotStoreError('NOT_FOUND', 'Snapshot was not found.')
		}
		const root = status === 'ready' ? this.versionRoot : this.quarantineRoot
		const key = status === 'ready' ? `${modHash}/${saveHash}` : `quarantine/${modHash}/${saveHash}`
		return { status, modHash, saveHash, id, directory: this._inside(root, modHash, saveHash, id), key }
	}

	async adminValidate(locator) {
		await this.initialize()
		const target = this._adminDirectory(locator)
		await this._waitForQueue(target.key)
		if (target.status === 'ready') {
			try {
				const record = await this._verifyDirectory(target.directory, { expectedId: target.id })
				return { valid: true, status: 'ready', info: this._adminItem('ready', target.modHash, target.saveHash, target.id, record.metadata) }
			} catch (error) {
				if (error?.code === 'CORRUPT') {
					await this._quarantineSnapshot(target.modHash, target.saveHash, target.directory, target.id, error.message)
					return { valid: false, status: 'quarantined', reason: safeMessageForCode('CORRUPT') }
				}
				throw this._publicError(error)
			}
		}
		const record = await this._readQuarantined(target)
		return {
			valid: false,
			status: 'quarantined',
			reason: record.audit.detectedReason || safeMessageForCode('CORRUPT'),
			expectedSha256: typeof record.metadata.sha256 === 'string' ? record.metadata.sha256 : '',
			actualSha256: sha256(record.payload)
		}
	}

	async adminExportData(locator) {
		await this.initialize()
		const target = this._adminDirectory(locator)
		await this._waitForQueue(target.key)
		if (target.status === 'ready') {
			try {
				const record = await this._verifyDirectory(target.directory, { expectedId: target.id })
				return {
					status: 'ready',
					item: this._adminItem('ready', target.modHash, target.saveHash, target.id, record.metadata),
					metadata: record.metadata,
					payload: record.payload,
					integrity: { status: 'valid', expectedSha256: record.metadata.sha256, actualSha256: record.metadata.sha256 }
				}
			} catch (error) {
				if (error?.code === 'CORRUPT') await this._quarantineSnapshot(target.modHash, target.saveHash, target.directory, target.id, error.message)
				throw this._publicError(error)
			}
		}
		const record = await this._readQuarantined(target)
		const actualSha256 = sha256(record.payload)
		return {
			status: 'quarantined',
			item: this._adminItem('quarantined', target.modHash, target.saveHash, target.id, record.metadata, record.audit),
			metadata: record.metadata,
			payload: record.payload,
			integrity: {
				status: 'corrupt',
				expectedSha256: typeof record.metadata.sha256 === 'string' ? record.metadata.sha256 : '',
				actualSha256,
				detectedReason: record.audit.detectedReason || safeMessageForCode('CORRUPT')
			}
		}
	}

	async _readQuarantined(target) {
		try {
			const payload = await fs.promises.readFile(path.join(target.directory, 'payload.bin'))
			if (payload.length > MAX_PAYLOAD_BYTES) throw new SnapshotStoreError('CORRUPT', 'Quarantined payload is too large.')
			const metadata = await this._readJson(path.join(target.directory, 'metadata.json'), {})
			const audit = await this._readJson(path.join(target.directory, 'quarantine.json'), {})
			return { payload, metadata, audit }
		} catch (error) {
			if (error instanceof SnapshotStoreError) throw error
			if (error?.code === 'ENOENT') throw new SnapshotStoreError('NOT_FOUND', 'Snapshot was not found.', error)
			throw this._publicError(error)
		}
	}

	async adminRemove(locator) {
		await this.initialize()
		const target = this._adminDirectory(locator)
		return this._enqueue(target.key, async () => {
			if (!await this._exists(target.directory)) throw new SnapshotStoreError('NOT_FOUND', 'Snapshot was not found.')
			try {
				await fs.promises.rm(target.directory, { recursive: true, force: false })
				await this._audit('snapshot-admin-removed', { status: target.status, modHash: target.modHash, saveHash: target.saveHash, id: target.id })
				return { id: target.id, removed: true }
			} catch (error) {
				throw this._publicError(error)
			}
		})
	}

	async _pruneQuarantine() {
		const records = []
		for (const modEntry of await this._safeDirectories(this.quarantineRoot)) {
			if (!HASH_PATTERN.test(modEntry.name)) continue
			const modDirectory = this._inside(this.quarantineRoot, modEntry.name)
			for (const saveEntry of await this._safeDirectories(modDirectory)) {
				if (!HASH_PATTERN.test(saveEntry.name)) continue
				const saveDirectory = this._inside(modDirectory, saveEntry.name)
				for (const entry of await this._safeDirectories(saveDirectory)) {
					const directory = this._inside(saveDirectory, entry.name)
					const audit = await this._readJson(path.join(directory, 'quarantine.json'), {})
					records.push({
						directory,
						modHash: modEntry.name,
						saveHash: saveEntry.name,
						id: entry.name,
						createdAt: Number(audit.quarantinedAt || (await fs.promises.stat(directory)).mtimeMs || 0),
						bytes: await this._directoryBytes(directory)
					})
				}
			}
		}
		const remove = new Set()
		const now = Number(this.now())
		for (const record of records) {
			if (now - record.createdAt > QUARANTINE_MAX_AGE_MS) remove.add(record)
		}
		const groups = new Map()
		for (const record of records) {
			const key = `${record.modHash}/${record.saveHash}`
			if (!groups.has(key)) groups.set(key, [])
			groups.get(key).push(record)
		}
		for (const group of groups.values()) {
			group.sort((a, b) => b.createdAt - a.createdAt)
			for (const record of group.slice(QUARANTINE_MAX_PER_NAMESPACE)) remove.add(record)
		}
		const newestFirst = records.filter(record => !remove.has(record)).sort((a, b) => b.createdAt - a.createdAt)
		let keptBytes = 0
		for (const record of newestFirst) {
			keptBytes += record.bytes
			if (keptBytes > QUARANTINE_MAX_BYTES) remove.add(record)
		}
		for (const record of Array.from(remove).sort((a, b) => a.createdAt - b.createdAt)) {
			await fs.promises.rm(record.directory, { recursive: true, force: true })
			await this._audit('snapshot-quarantine-pruned', {
				modHash: record.modHash,
				saveHash: record.saveHash,
				id: record.id,
				bytes: record.bytes
			})
		}
	}

	async _safeDirectories(directory) {
		try {
			const entries = await fs.promises.readdir(directory, { withFileTypes: true })
			return entries.filter(entry => entry.isDirectory())
		} catch (error) {
			if (error?.code === 'ENOENT') return []
			throw error
		}
	}

	async _readJson(filePath, fallback) {
		try {
			return JSON.parse(await fs.promises.readFile(filePath, 'utf8'))
		} catch (error) {
			return fallback
		}
	}

	async _directoryBytes(directory) {
		let total = 0
		for (const entry of await fs.promises.readdir(directory, { withFileTypes: true }).catch(() => [])) {
			const target = this._inside(directory, entry.name)
			if (entry.isDirectory()) total += await this._directoryBytes(target)
			else if (entry.isFile()) total += Number((await fs.promises.stat(target)).size || 0)
		}
		return total
	}

	async _exists(target) {
		try {
			await fs.promises.access(target)
			return true
		} catch (error) {
			return false
		}
	}

	async _audit(event, details) {
		const entry = { at: Number(this.now()), event, details }
		try {
			await fs.promises.mkdir(this.rootDir, { recursive: true })
			await fs.promises.appendFile(this.auditLogPath, JSON.stringify(entry) + '\n', 'utf8')
		} catch (error) {
			this.log('snapshotAuditFailed', { event, error: error?.message })
		}
	}

	_publicError(error, fallbackCode) {
		if (error instanceof SnapshotStoreError) return error
		const code = fallbackCode || (error?.code === 'ENOSPC' ? 'QUOTA' : 'IO')
		this.log('snapshotStoreError', { code, systemCode: error?.code || '', message: error?.message || String(error) })
		return new SnapshotStoreError(code, safeMessageForCode(code), error)
	}
}

module.exports = {
	API_VERSION,
	MAX_PAYLOAD_BYTES,
	MAX_SNAPSHOTS,
	MAX_REASON_CHARS,
	MAX_TAG_BYTES,
	MAX_TAG_DEPTH,
	MAX_TAG_KEYS,
	QUARANTINE_MAX_AGE_MS,
	QUARANTINE_MAX_PER_NAMESPACE,
	QUARANTINE_MAX_BYTES,
	SnapshotStore,
	SnapshotStoreError,
	normalizePayload,
	normalizeReason,
	cloneAndValidateTags,
	safePublicInfo,
	safeMessageForCode
}
