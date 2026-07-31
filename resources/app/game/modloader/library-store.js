'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const API_VERSION = '1.0.0'
const DEFAULT_MAX_FILE_BYTES = 16 * 1024 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024
const DEFAULT_MAX_ENTRIES = 5000
const DEFAULT_MAX_CACHE_BYTES = 512 * 1024 * 1024
const DEFAULT_DEBOUNCE_MS = 300
const DEFAULT_STABLE_DELAY_MS = 100
const DEFAULT_RECONCILE_MS = 30 * 1000
const TEMP_MAX_AGE_MS = 60 * 60 * 1000
const REVISION_PATTERN = /^[a-f0-9]{64}$/
const LIBRARY_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/
const DIRECTORY_PATTERN = /^[a-z0-9][a-z0-9._ -]{0,63}$/i
const CACHE_BUCKET_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i
const EXTENSION_PATTERN = /^\.[a-z0-9][a-z0-9._-]{0,63}$/i
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/
const INVALID_NAME_PATTERN = /[<>:"/\\|?*]/
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i
const RESERVED_ROOT_NAMES = new Set([
	'.git', 'locales', 'resources', 'swiftshader', 'vk_swiftshader'
])
const AREAS = new Set(['active', 'trash', 'quarantine', 'cache'])

class LibraryStoreError extends Error {
	constructor(code, message, cause) {
		super(message)
		this.name = 'LibraryStoreError'
		this.code = code
		if (cause) this.cause = cause
	}
}

function safeMessageForCode(code) {
	const messages = {
		NOT_READY: 'Library storage is not ready.',
		PERMISSION_DENIED: 'Library storage permission was denied.',
		PATH_INVALID: 'Library path or name is invalid.',
		NAME_CONFLICT: 'A library item with that name already exists.',
		REVISION_CONFLICT: 'The library item changed since it was loaded.',
		TOO_LARGE: 'The library item exceeds the allowed size.',
		QUOTA_EXCEEDED: 'The library storage quota was exceeded.',
		CORRUPT: 'Library item integrity verification failed.',
		NOT_FOUND: 'The library item was not found.',
		IO_FAILED: 'Library storage operation failed.',
		WATCH_UNAVAILABLE: 'Library change monitoring is unavailable.'
	}
	return messages[code] || messages.IO_FAILED
}

function sha256(value) {
	return crypto.createHash('sha256').update(value).digest('hex')
}

function sleep(milliseconds) {
	return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function positiveInteger(value, fallback, maximum, field) {
	const result = value === undefined ? fallback : Number(value)
	if (!Number.isSafeInteger(result) || result <= 0 || result > maximum) {
		throw new LibraryStoreError('PATH_INVALID', `Library declaration ${field} is invalid.`)
	}
	return result
}

function normalizeStringList(value, pattern, field, allowEmpty) {
	const input = value === undefined ? [] : value
	if (!Array.isArray(input) || (!allowEmpty && !input.length) || input.length > 32) {
		throw new LibraryStoreError('PATH_INVALID', `Library declaration ${field} is invalid.`)
	}
	const output = []
	const seen = new Set()
	for (const item of input) {
		const normalized = String(item || '').trim().toLowerCase()
		if (!pattern.test(normalized) || seen.has(normalized)) {
			throw new LibraryStoreError('PATH_INVALID', `Library declaration ${field} is invalid.`)
		}
		seen.add(normalized)
		output.push(normalized)
	}
	return output
}

function normalizeLibraryDeclaration(value) {
	const modId = String(value?.modId || '').trim()
	const libraryId = String(value?.libraryId || value?.id || '').trim().toLowerCase()
	const directory = String(value?.directory || '').trim()
	if (!modId || modId.length > 256 || CONTROL_CHAR_PATTERN.test(modId)) {
		throw new LibraryStoreError('PATH_INVALID', 'Library declaration Mod identity is invalid.')
	}
	if (!LIBRARY_ID_PATTERN.test(libraryId)) {
		throw new LibraryStoreError('PATH_INVALID', 'Library declaration id is invalid.')
	}
	if (!DIRECTORY_PATTERN.test(directory) || directory === '.' || directory === '..' || directory.endsWith('.') || directory.endsWith(' ') || RESERVED_ROOT_NAMES.has(directory.toLowerCase())) {
		throw new LibraryStoreError('PATH_INVALID', 'Library declaration directory is invalid.')
	}
	const extensions = normalizeStringList(value?.extensions, EXTENSION_PATTERN, 'extensions', false)
	const cacheValue = value?.cache && typeof value.cache === 'object' ? value.cache : {}
	const cacheExtensions = normalizeStringList(cacheValue.extensions, EXTENSION_PATTERN, 'cache.extensions', true)
	const cacheDirectories = normalizeStringList(cacheValue.directories, CACHE_BUCKET_PATTERN, 'cache.directories', true)
	if ((cacheExtensions.length === 0) !== (cacheDirectories.length === 0)) {
		throw new LibraryStoreError('PATH_INVALID', 'Library cache extensions and directories must be declared together.')
	}
	return Object.freeze({
		modId,
		libraryId,
		directory,
		directoryKey: directory.toLowerCase(),
		extensions: Object.freeze(extensions),
		maxFileBytes: positiveInteger(value?.maxFileBytes, DEFAULT_MAX_FILE_BYTES, DEFAULT_MAX_FILE_BYTES, 'maxFileBytes'),
		maxTotalBytes: positiveInteger(value?.maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES, DEFAULT_MAX_TOTAL_BYTES, 'maxTotalBytes'),
		maxEntries: positiveInteger(value?.maxEntries, DEFAULT_MAX_ENTRIES, DEFAULT_MAX_ENTRIES, 'maxEntries'),
		cache: Object.freeze({
			extensions: Object.freeze(cacheExtensions),
			directories: Object.freeze(cacheDirectories),
			maxBytes: positiveInteger(cacheValue.maxBytes, DEFAULT_MAX_CACHE_BYTES, DEFAULT_MAX_CACHE_BYTES, 'cache.maxBytes')
		})
	})
}

function normalizeManifestLibraries(modId, libraries) {
	const records = []
	if (Array.isArray(libraries)) {
		for (const item of libraries) records.push(Object.assign({}, item, { modId, libraryId: item?.id }))
	} else if (libraries && typeof libraries === 'object') {
		for (const libraryId of Object.keys(libraries)) {
			const item = libraries[libraryId]
			if (item && typeof item === 'object') records.push(Object.assign({}, item, { modId, libraryId }))
		}
	}
	return records
}

function normalizePayload(value, maxBytes) {
	let bytes
	let payloadType
	if (typeof value === 'string') {
		bytes = Buffer.from(value, 'utf8')
		payloadType = 'utf8'
	} else if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
		bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
		bytes = Buffer.from(bytes)
		payloadType = 'bytes'
	} else if (value?.type === 'Buffer' && Array.isArray(value.data)) {
		bytes = Buffer.from(value.data)
		payloadType = 'bytes'
	} else {
		throw new LibraryStoreError('PATH_INVALID', 'Library data must be a string or Uint8Array.')
	}
	if (bytes.length > maxBytes) throw new LibraryStoreError('TOO_LARGE', safeMessageForCode('TOO_LARGE'))
	return { bytes, payloadType }
}

function normalizeExpectedRevision(value, required) {
	if (value === undefined || value === null || value === '') {
		if (required) throw new LibraryStoreError('REVISION_CONFLICT', safeMessageForCode('REVISION_CONFLICT'))
		return ''
	}
	const revision = String(value).trim().toLowerCase()
	if (!REVISION_PATTERN.test(revision)) throw new LibraryStoreError('REVISION_CONFLICT', safeMessageForCode('REVISION_CONFLICT'))
	return revision
}

function normalizeArea(value) {
	const area = String(value || 'active').trim().toLowerCase()
	if (!AREAS.has(area)) throw new LibraryStoreError('PATH_INVALID', safeMessageForCode('PATH_INVALID'))
	return area
}

class LibraryStore {
	constructor(options) {
		if (!options?.installationRoot || !path.isAbsolute(options.installationRoot)) {
			throw new LibraryStoreError('NOT_READY', 'Library installation root must be absolute.')
		}
		this.installationRoot = path.resolve(options.installationRoot)
		this.now = typeof options.now === 'function' ? options.now : Date.now
		this.randomUUID = typeof options.randomUUID === 'function' ? options.randomUUID : crypto.randomUUID
		this.log = typeof options.log === 'function' ? options.log : function () {}
		this.watchFactory = typeof options.watchFactory === 'function' ? options.watchFactory : fs.watch
		this.debounceMs = Number.isFinite(options.debounceMs) ? Math.max(0, options.debounceMs) : DEFAULT_DEBOUNCE_MS
		this.stableDelayMs = Number.isFinite(options.stableDelayMs) ? Math.max(0, options.stableDelayMs) : DEFAULT_STABLE_DELAY_MS
		this.reconcileMs = Number.isFinite(options.reconcileMs) ? Math.max(1000, options.reconcileMs) : DEFAULT_RECONCILE_MS
		this.declarations = new Map()
		this.initializations = new Map()
		this.queues = new Map()
		this.infoCache = new Map()
		this.watchStates = new Map()
		this._registerDeclarations(options.declarations || [])
	}

	_registerDeclarations(values) {
		const normalized = []
		for (const value of values) {
			try {
				normalized.push(normalizeLibraryDeclaration(value))
			} catch (error) {
				this.log('libraryDeclarationRejected', { modId: value?.modId || '', libraryId: value?.libraryId || value?.id || '', code: error?.code || 'PATH_INVALID' })
			}
		}
		const directoryOwners = new Map()
		const contextCounts = new Map()
		const conflictedDirectories = new Set()
		for (const declaration of normalized) {
			const contextKey = this._contextKey(declaration.modId, declaration.libraryId)
			contextCounts.set(contextKey, (contextCounts.get(contextKey) || 0) + 1)
			const owners = directoryOwners.get(declaration.directoryKey) || new Set()
			owners.add(contextKey)
			directoryOwners.set(declaration.directoryKey, owners)
			if (owners.size > 1) conflictedDirectories.add(declaration.directoryKey)
		}
		for (const declaration of normalized) {
			const key = this._contextKey(declaration.modId, declaration.libraryId)
			if (contextCounts.get(key) > 1) {
				this.log('libraryDeclarationConflict', { modId: declaration.modId, libraryId: declaration.libraryId })
				continue
			}
			if (conflictedDirectories.has(declaration.directoryKey)) {
				this.log('libraryDirectoryConflict', { directory: declaration.directory, modId: declaration.modId, libraryId: declaration.libraryId })
				continue
			}
			this.declarations.set(key, declaration)
		}
	}

	_contextKey(modId, libraryId) {
		return `${String(modId || '').trim()}\u0000${String(libraryId || '').trim().toLowerCase()}`
	}

	_declaration(context) {
		const declaration = this.declarations.get(this._contextKey(context?.modId, context?.libraryId))
		if (!declaration) throw new LibraryStoreError('PERMISSION_DENIED', safeMessageForCode('PERMISSION_DENIED'))
		return declaration
	}

	_inside(root, ...parts) {
		const resolvedRoot = path.resolve(root)
		const target = path.resolve(resolvedRoot, ...parts)
		const relative = path.relative(resolvedRoot, target)
		if (!relative || relative === '.') return target
		if (relative.startsWith('..') || path.isAbsolute(relative)) throw new LibraryStoreError('PATH_INVALID', safeMessageForCode('PATH_INVALID'))
		return target
	}

	_root(declaration) {
		return this._inside(this.installationRoot, declaration.directory)
	}

	async _ensureDirectorySafe(directory, parentRealPath) {
		let stat = null
		try { stat = await fs.promises.lstat(directory) } catch (error) { if (error?.code !== 'ENOENT') throw error }
		if (stat?.isSymbolicLink() || (stat && !stat.isDirectory())) throw new LibraryStoreError('PATH_INVALID', safeMessageForCode('PATH_INVALID'))
		if (!stat) await fs.promises.mkdir(directory, { recursive: true })
		const real = await fs.promises.realpath(directory)
		const relative = path.relative(parentRealPath, real)
		if (relative.startsWith('..') || path.isAbsolute(relative)) throw new LibraryStoreError('PATH_INVALID', safeMessageForCode('PATH_INVALID'))
		return real
	}

	async _initialize(declaration) {
		const key = declaration.directoryKey
		if (!this.initializations.has(key)) {
			const operation = (async () => {
				const installationReal = await fs.promises.realpath(this.installationRoot)
				const root = this._root(declaration)
				const rootReal = await this._ensureDirectorySafe(root, installationReal)
				for (const child of ['.trash', '.quarantine', '.cache']) {
					await this._ensureDirectorySafe(this._inside(root, child), rootReal)
				}
				const cacheRootReal = await fs.promises.realpath(this._inside(root, '.cache'))
				for (const bucket of declaration.cache.directories) {
					await this._ensureDirectorySafe(this._inside(root, '.cache', bucket), cacheRootReal)
				}
				await this._cleanupStaleTemps(declaration)
			})().catch(error => {
				this.initializations.delete(key)
				throw this._publicError(error, 'NOT_READY')
			})
			this.initializations.set(key, operation)
		}
		await this.initializations.get(key)
	}

	async _validateManagedDirectories(declaration) {
		const installationReal = await fs.promises.realpath(this.installationRoot)
		const root = this._root(declaration)
		const rootStat = await fs.promises.lstat(root)
		if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new LibraryStoreError('PATH_INVALID', safeMessageForCode('PATH_INVALID'))
		const rootReal = await fs.promises.realpath(root)
		const rootRelative = path.relative(installationReal, rootReal)
		if (rootRelative.startsWith('..') || path.isAbsolute(rootRelative)) throw new LibraryStoreError('PATH_INVALID', safeMessageForCode('PATH_INVALID'))
		const managed = ['.trash', '.quarantine', '.cache', ...declaration.cache.directories.map(bucket => path.join('.cache', bucket))]
		for (const relativeName of managed) {
			const directory = this._inside(root, relativeName)
			const stat = await fs.promises.lstat(directory)
			if (stat.isSymbolicLink() || !stat.isDirectory()) throw new LibraryStoreError('PATH_INVALID', safeMessageForCode('PATH_INVALID'))
			const real = await fs.promises.realpath(directory)
			const relative = path.relative(rootReal, real)
			if (relative.startsWith('..') || path.isAbsolute(relative)) throw new LibraryStoreError('PATH_INVALID', safeMessageForCode('PATH_INVALID'))
		}
	}

	async _ready(declaration) {
		await this._initialize(declaration)
		await this._validateManagedDirectories(declaration)
	}

	_location(declaration, request) {
		const area = normalizeArea(request?.area)
		const root = this._root(declaration)
		if (area === 'active') return { area, directory: root, extensions: declaration.extensions, bucket: '' }
		if (area === 'trash') return { area, directory: this._inside(root, '.trash'), extensions: declaration.extensions, bucket: '' }
		if (area === 'quarantine') return { area, directory: this._inside(root, '.quarantine'), extensions: declaration.extensions, bucket: '' }
		const bucket = String(request?.bucket || '').trim().toLowerCase()
		if (!declaration.cache.directories.includes(bucket)) throw new LibraryStoreError('PERMISSION_DENIED', safeMessageForCode('PERMISSION_DENIED'))
		return { area, directory: this._inside(root, '.cache', bucket), extensions: declaration.cache.extensions, bucket }
	}

	_extensionFor(name, extensions) {
		const lower = name.toLowerCase()
		return extensions.slice().sort((a, b) => b.length - a.length).find(extension => lower.endsWith(extension)) || ''
	}

	_name(value, extensions) {
		const name = String(value || '')
		if (!name || name !== name.trim() || Buffer.byteLength(name, 'utf8') > 240 || CONTROL_CHAR_PATTERN.test(name) || INVALID_NAME_PATTERN.test(name) || name === '.' || name === '..' || name.endsWith('.') || name.endsWith(' ') || RESERVED_WINDOWS_NAMES.test(name) || path.basename(name) !== name || name.toLowerCase().startsWith('.tmp-')) {
			throw new LibraryStoreError('PATH_INVALID', safeMessageForCode('PATH_INVALID'))
		}
		if (!this._extensionFor(name, extensions)) throw new LibraryStoreError('PATH_INVALID', safeMessageForCode('PATH_INVALID'))
		return name
	}

	_filePath(location, name) {
		return this._inside(location.directory, this._name(name, location.extensions))
	}

	_cacheKey(location, name) {
		return `${path.resolve(location.directory).toLowerCase()}\u0000${name.toLowerCase()}`
	}

	async _fileInfo(location, name, forceHash) {
		const fileName = this._name(name, location.extensions)
		const filePath = this._filePath(location, fileName)
		let stat
		try { stat = await fs.promises.lstat(filePath) } catch (error) { if (error?.code === 'ENOENT') throw new LibraryStoreError('NOT_FOUND', safeMessageForCode('NOT_FOUND')); throw error }
		if (stat.isSymbolicLink() || !stat.isFile()) throw new LibraryStoreError('PATH_INVALID', safeMessageForCode('PATH_INVALID'))
		const signature = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`
		const cacheKey = this._cacheKey(location, fileName)
		let revision = !forceHash && this.infoCache.get(cacheKey)?.signature === signature ? this.infoCache.get(cacheKey).revision : ''
		if (!revision) revision = sha256(await fs.promises.readFile(filePath))
		this.infoCache.set(cacheKey, { signature, revision })
		return {
			name: fileName,
			area: location.area,
			bucket: location.bucket || undefined,
			bytes: Number(stat.size),
			createdAt: Number(stat.birthtimeMs || stat.ctimeMs),
			modifiedAt: Number(stat.mtimeMs),
			revision,
			sha256: revision
		}
	}

	async _maybeInfo(location, name, forceHash) {
		try { return await this._fileInfo(location, name, forceHash) } catch (error) { if (error?.code === 'NOT_FOUND') return null; throw error }
	}

	async _fileNames(location) {
		const entries = await fs.promises.readdir(location.directory, { withFileTypes: true })
		return entries
			.filter(entry => entry.isFile() && !entry.isSymbolicLink() && !entry.name.toLowerCase().startsWith('.tmp-') && !!this._extensionFor(entry.name, location.extensions))
			.map(entry => entry.name)
			.sort((a, b) => a.localeCompare(b))
	}

	_enqueue(declaration, task) {
		const key = declaration.directoryKey
		const previous = this.queues.get(key) || Promise.resolve()
		const operation = previous.catch(() => {}).then(task)
		const settled = operation.catch(() => {})
		this.queues.set(key, settled)
		settled.finally(() => { if (this.queues.get(key) === settled) this.queues.delete(key) })
		return operation
	}

	async _waitForQueue(declaration) {
		const pending = this.queues.get(declaration.directoryKey)
		if (pending) await pending.catch(() => {})
	}

	async capabilities(context) {
		const declaration = this._declaration(context)
		await this._ready(declaration)
		const areas = ['active', 'trash', 'quarantine']
		if (declaration.cache.directories.length) areas.push('cache')
		return {
			apiVersion: API_VERSION,
			available: true,
			libraryId: declaration.libraryId,
			payloadTypes: ['utf8', 'bytes'],
			areas,
			extensions: declaration.extensions.slice(),
			maxFileBytes: declaration.maxFileBytes,
			maxTotalBytes: declaration.maxTotalBytes,
			maxEntries: declaration.maxEntries,
			cache: {
				directories: declaration.cache.directories.slice(),
				extensions: declaration.cache.extensions.slice(),
				maxBytes: declaration.cache.maxBytes,
				autoPrune: true
			},
			atomicPublish: true,
			checksum: 'sha256',
			optimisticConcurrency: true,
			watch: true,
			pathsExposed: false
		}
	}

	async list(context, request) {
		const declaration = this._declaration(context)
		await this._ready(declaration)
		await this._waitForQueue(declaration)
		const location = this._location(declaration, request)
		const result = []
		for (const name of await this._fileNames(location)) result.push(await this._fileInfo(location, name, false))
		return result.sort((a, b) => b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name))
	}

	async read(context, request) {
		const declaration = this._declaration(context)
		await this._ready(declaration)
		await this._waitForQueue(declaration)
		const location = this._location(declaration, request)
		const name = this._name(request?.name, location.extensions)
		const filePath = this._filePath(location, name)
		const expectedRevision = normalizeExpectedRevision(request?.expectedRevision, false)
		let stat
		try { stat = await fs.promises.lstat(filePath) } catch (error) { if (error?.code === 'ENOENT') throw new LibraryStoreError('NOT_FOUND', safeMessageForCode('NOT_FOUND')); throw error }
		if (stat.isSymbolicLink() || !stat.isFile()) throw new LibraryStoreError('PATH_INVALID', safeMessageForCode('PATH_INVALID'))
		const payload = await fs.promises.readFile(filePath)
		const revision = sha256(payload)
		if (expectedRevision && revision !== expectedRevision) throw new LibraryStoreError('REVISION_CONFLICT', safeMessageForCode('REVISION_CONFLICT'))
		const after = await fs.promises.lstat(filePath)
		if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new LibraryStoreError('REVISION_CONFLICT', safeMessageForCode('REVISION_CONFLICT'))
		const info = await this._fileInfo(location, name, true)
		if (info.revision !== revision) throw new LibraryStoreError('CORRUPT', safeMessageForCode('CORRUPT'))
		return { info, payload, payloadType: request?.encoding === 'utf8' ? 'utf8' : 'bytes' }
	}

	async _usage(declaration) {
		let bytes = 0
		let entries = 0
		for (const area of ['active', 'trash']) {
			const location = this._location(declaration, { area })
			for (const name of await this._fileNames(location)) {
				const stat = await fs.promises.lstat(this._filePath(location, name))
				if (!stat.isSymbolicLink() && stat.isFile()) {
					bytes += Number(stat.size)
					entries++
				}
			}
		}
		return { bytes, entries }
	}

	async _cacheEntries(declaration) {
		const entries = []
		for (const bucket of declaration.cache.directories) {
			const location = this._location(declaration, { area: 'cache', bucket })
			for (const name of await this._fileNames(location)) {
				const filePath = this._filePath(location, name)
				const stat = await fs.promises.lstat(filePath)
				if (!stat.isSymbolicLink() && stat.isFile()) entries.push({ location, name, filePath, bytes: Number(stat.size), usedAt: Number(stat.atimeMs || stat.mtimeMs) })
			}
		}
		return entries
	}

	async _pruneCacheForWrite(declaration, location, name, bytes, existingBytes) {
		const entries = await this._cacheEntries(declaration)
		let total = entries.reduce((sum, entry) => sum + entry.bytes, 0) - existingBytes + bytes
		if (bytes > declaration.cache.maxBytes) throw new LibraryStoreError('QUOTA_EXCEEDED', safeMessageForCode('QUOTA_EXCEEDED'))
		const removed = []
		for (const entry of entries.sort((a, b) => a.usedAt - b.usedAt)) {
			if (total <= declaration.cache.maxBytes) break
			if (entry.location.directory === location.directory && entry.name.toLowerCase() === name.toLowerCase()) continue
			await fs.promises.unlink(entry.filePath)
			this.infoCache.delete(this._cacheKey(entry.location, entry.name))
			total -= entry.bytes
			removed.push({ name: entry.name, bucket: entry.location.bucket })
		}
		if (total > declaration.cache.maxBytes) throw new LibraryStoreError('QUOTA_EXCEEDED', safeMessageForCode('QUOTA_EXCEEDED'))
		return removed
	}

	async _durableTemp(location, payload) {
		const tempName = `.tmp-${process.pid}-${Number(this.now())}-${this.randomUUID().toLowerCase()}`
		const tempPath = this._inside(location.directory, tempName)
		let handle
		try {
			handle = await fs.promises.open(tempPath, 'wx')
			await handle.writeFile(payload)
			await handle.sync()
			await handle.close()
			handle = null
			const verified = await fs.promises.readFile(tempPath)
			if (verified.length !== payload.length || sha256(verified) !== sha256(payload)) {
				throw new LibraryStoreError('CORRUPT', safeMessageForCode('CORRUPT'))
			}
			return tempPath
		} catch (error) {
			if (handle) await handle.close().catch(() => {})
			await fs.promises.rm(tempPath, { force: true }).catch(() => {})
			throw error
		}
	}

	async _syncDirectory(directory) {
		let handle
		try {
			handle = await fs.promises.open(directory, 'r')
			await handle.sync()
		} catch (error) {
			if (process.platform !== 'win32') throw error
		} finally {
			if (handle) await handle.close().catch(() => {})
		}
	}

	async _uniqueTrashName(declaration, name, reason) {
		const location = this._location(declaration, { area: 'trash' })
		if (!(await this._maybeInfo(location, name, false))) return name
		const extension = this._extensionFor(name, declaration.extensions)
		const stem = name.slice(0, -extension.length)
		for (let attempt = 0; attempt < 10; attempt++) {
			const suffix = `${reason}-${Number(this.now())}-${this.randomUUID().slice(0, 8).toLowerCase()}`
			const candidate = this._name(`${stem}.${suffix}${extension}`, declaration.extensions)
			if (!(await this._maybeInfo(location, candidate, false))) return candidate
		}
		throw new LibraryStoreError('NAME_CONFLICT', safeMessageForCode('NAME_CONFLICT'))
	}

	async write(context, request) {
		const declaration = this._declaration(context)
		await this._ready(declaration)
		return this._enqueue(declaration, async () => {
			const location = this._location(declaration, request)
			if (location.area !== 'active' && location.area !== 'cache') throw new LibraryStoreError('PERMISSION_DENIED', safeMessageForCode('PERMISSION_DENIED'))
			const name = this._name(request?.name, location.extensions)
			const payload = normalizePayload(request?.data, declaration.maxFileBytes)
			const finalPath = this._filePath(location, name)
			const current = await this._maybeInfo(location, name, true)
			const expectedRevision = normalizeExpectedRevision(request?.expectedRevision, false)
			if (current && !expectedRevision) throw new LibraryStoreError('NAME_CONFLICT', safeMessageForCode('NAME_CONFLICT'))
			if (current && current.revision !== expectedRevision) throw new LibraryStoreError('REVISION_CONFLICT', safeMessageForCode('REVISION_CONFLICT'))
			if (!current && expectedRevision) throw new LibraryStoreError('REVISION_CONFLICT', safeMessageForCode('REVISION_CONFLICT'))
			let pruned = []
			if (location.area === 'active') {
				const usage = await this._usage(declaration)
				const projectedBytes = usage.bytes + payload.bytes.length
				const projectedEntries = usage.entries + 1
				if (projectedBytes > declaration.maxTotalBytes || projectedEntries > declaration.maxEntries) throw new LibraryStoreError('QUOTA_EXCEEDED', safeMessageForCode('QUOTA_EXCEEDED'))
			} else {
				pruned = await this._pruneCacheForWrite(declaration, location, name, payload.bytes.length, current?.bytes || 0)
			}
			const tempPath = await this._durableTemp(location, payload.bytes)
			let backup = null
			let backupPath = ''
			let displacedPath = ''
			try {
				if (current && location.area === 'active') {
					const backupName = await this._uniqueTrashName(declaration, name, 'replaced')
					const trashLocation = this._location(declaration, { area: 'trash' })
					backupPath = this._filePath(trashLocation, backupName)
					await fs.promises.rename(finalPath, backupPath)
					backup = { name: backupName, originalName: name, area: 'trash', revision: current.revision, bytes: current.bytes }
				} else if (current) {
					displacedPath = this._inside(location.directory, `.tmp-displaced-${process.pid}-${Number(this.now())}-${this.randomUUID().toLowerCase()}`)
					await fs.promises.rename(finalPath, displacedPath)
				}
				await fs.promises.rename(tempPath, finalPath)
				await this._syncDirectory(location.directory)
				if (displacedPath) await fs.promises.rm(displacedPath, { force: true })
			} catch (error) {
				await fs.promises.rm(tempPath, { force: true }).catch(() => {})
				if (backupPath && !(await this._exists(finalPath))) await fs.promises.rename(backupPath, finalPath).catch(() => {})
				if (displacedPath && !(await this._exists(finalPath))) await fs.promises.rename(displacedPath, finalPath).catch(() => {})
				throw error
			}
			this.infoCache.delete(this._cacheKey(location, name))
			const info = await this._fileInfo(location, name, true)
			if (info.revision !== sha256(payload.bytes)) throw new LibraryStoreError('CORRUPT', safeMessageForCode('CORRUPT'))
			this.log('libraryWrite', { modId: declaration.modId, libraryId: declaration.libraryId, area: location.area, name, bytes: info.bytes, replaced: !!current })
			return { info, payloadType: payload.payloadType, backup, pruned }
		})
	}

	async rename(context, request) {
		const declaration = this._declaration(context)
		await this._ready(declaration)
		return this._enqueue(declaration, async () => {
			const location = this._location(declaration, request)
			const name = this._name(request?.name, location.extensions)
			const newName = this._name(request?.newName, location.extensions)
			const expectedRevision = normalizeExpectedRevision(request?.expectedRevision, true)
			const current = await this._fileInfo(location, name, true)
			if (current.revision !== expectedRevision) throw new LibraryStoreError('REVISION_CONFLICT', safeMessageForCode('REVISION_CONFLICT'))
			if (name.toLowerCase() !== newName.toLowerCase() && await this._maybeInfo(location, newName, false)) throw new LibraryStoreError('NAME_CONFLICT', safeMessageForCode('NAME_CONFLICT'))
			const source = this._filePath(location, name)
			const target = this._filePath(location, newName)
			if (source !== target) await fs.promises.rename(source, target)
			this.infoCache.delete(this._cacheKey(location, name))
			return this._fileInfo(location, newName, true)
		})
	}

	async trash(context, request) {
		const declaration = this._declaration(context)
		await this._ready(declaration)
		return this._enqueue(declaration, async () => {
			const active = this._location(declaration, { area: 'active' })
			const trash = this._location(declaration, { area: 'trash' })
			const name = this._name(request?.name, active.extensions)
			const expectedRevision = normalizeExpectedRevision(request?.expectedRevision, true)
			const current = await this._fileInfo(active, name, true)
			if (current.revision !== expectedRevision) throw new LibraryStoreError('REVISION_CONFLICT', safeMessageForCode('REVISION_CONFLICT'))
			const trashName = await this._uniqueTrashName(declaration, name, 'deleted')
			await fs.promises.rename(this._filePath(active, name), this._filePath(trash, trashName))
			this.infoCache.delete(this._cacheKey(active, name))
			return Object.assign(await this._fileInfo(trash, trashName, true), { originalName: name })
		})
	}

	async restore(context, request) {
		const declaration = this._declaration(context)
		await this._ready(declaration)
		return this._enqueue(declaration, async () => {
			const trash = this._location(declaration, { area: 'trash' })
			const active = this._location(declaration, { area: 'active' })
			const name = this._name(request?.name, trash.extensions)
			const newName = this._name(request?.newName || name, active.extensions)
			const expectedRevision = normalizeExpectedRevision(request?.expectedRevision, true)
			const current = await this._fileInfo(trash, name, true)
			if (current.revision !== expectedRevision) throw new LibraryStoreError('REVISION_CONFLICT', safeMessageForCode('REVISION_CONFLICT'))
			if (await this._maybeInfo(active, newName, false)) throw new LibraryStoreError('NAME_CONFLICT', safeMessageForCode('NAME_CONFLICT'))
			await fs.promises.rename(this._filePath(trash, name), this._filePath(active, newName))
			this.infoCache.delete(this._cacheKey(trash, name))
			return this._fileInfo(active, newName, true)
		})
	}

	async quarantine(context, request) {
		const declaration = this._declaration(context)
		await this._ready(declaration)
		return this._enqueue(declaration, async () => {
			const active = this._location(declaration, { area: 'active' })
			const quarantine = this._location(declaration, { area: 'quarantine' })
			const name = this._name(request?.name, active.extensions)
			const expectedRevision = normalizeExpectedRevision(request?.expectedRevision, true)
			const current = await this._fileInfo(active, name, true)
			if (current.revision !== expectedRevision) throw new LibraryStoreError('REVISION_CONFLICT', safeMessageForCode('REVISION_CONFLICT'))
			if (await this._maybeInfo(quarantine, name, false)) throw new LibraryStoreError('NAME_CONFLICT', safeMessageForCode('NAME_CONFLICT'))
			await fs.promises.rename(this._filePath(active, name), this._filePath(quarantine, name))
			this.infoCache.delete(this._cacheKey(active, name))
			return this._fileInfo(quarantine, name, true)
		})
	}

	async remove(context, request) {
		const declaration = this._declaration(context)
		await this._ready(declaration)
		return this._enqueue(declaration, async () => {
			const location = this._location(declaration, request)
			if (location.area === 'active') throw new LibraryStoreError('PERMISSION_DENIED', safeMessageForCode('PERMISSION_DENIED'))
			const name = this._name(request?.name, location.extensions)
			const expectedRevision = normalizeExpectedRevision(request?.expectedRevision, true)
			const current = await this._fileInfo(location, name, true)
			if (current.revision !== expectedRevision) throw new LibraryStoreError('REVISION_CONFLICT', safeMessageForCode('REVISION_CONFLICT'))
			await fs.promises.unlink(this._filePath(location, name))
			this.infoCache.delete(this._cacheKey(location, name))
			return { name, area: location.area, bucket: location.bucket || undefined, removed: true }
		})
	}

	async folder(context, request) {
		const declaration = this._declaration(context)
		await this._ready(declaration)
		return this._location(declaration, request).directory
	}

	async _stableFingerprint(filePath) {
		try {
			const stat = await fs.promises.lstat(filePath)
			if (stat.isSymbolicLink() || !stat.isFile()) return 'invalid'
			return `${stat.size}:${stat.mtimeMs}`
		} catch (error) {
			if (error?.code === 'ENOENT') return 'missing'
			throw error
		}
	}

	_watchIgnored(relativeName) {
		const normalized = String(relativeName || '').replace(/\\/g, '/').replace(/^\.\//, '')
		if (!normalized) return false
		const first = normalized.split('/')[0].toLowerCase()
		return first === '.trash' || first === '.quarantine' || first === '.cache' || first.startsWith('.tmp-')
	}

	async _deliverWatchChanges(state) {
		const names = Array.from(state.pending)
		state.pending.clear()
		const stable = []
		let full = false
		for (const relativeName of names) {
			if (!relativeName) { full = true; continue }
			if (this._watchIgnored(relativeName)) continue
			const name = String(relativeName).replace(/\\/g, '/')
			if (name.includes('/')) continue
			if (!this._extensionFor(name, state.declaration.extensions)) continue
			const filePath = this._inside(this._root(state.declaration), name)
			const first = await this._stableFingerprint(filePath)
			await sleep(this.stableDelayMs)
			const second = await this._stableFingerprint(filePath)
			if (first === second) stable.push(name)
			else state.pending.add(relativeName)
		}
		if (state.pending.size) this._scheduleWatch(state)
		if (full || stable.length) this._emitWatch(state, { type: 'changed', reason: 'filesystem', names: stable, full, at: Number(this.now()) })
	}

	_scheduleWatch(state) {
		if (state.timer) clearTimeout(state.timer)
		state.timer = setTimeout(() => {
			state.timer = null
			this._deliverWatchChanges(state).catch(error => this._emitWatch(state, { type: 'warning', code: 'WATCH_UNAVAILABLE', message: safeMessageForCode('WATCH_UNAVAILABLE'), at: Number(this.now()) }))
		}, this.debounceMs)
	}

	_emitWatch(state, event) {
		for (const listener of state.listeners.values()) {
			try { listener(Object.assign({ libraryId: state.declaration.libraryId }, event)) } catch (error) { this.log('libraryWatchListenerFailed', { message: error?.message || String(error) }) }
		}
	}

	async _watchSignature(declaration) {
		const items = await this.list({ modId: declaration.modId, libraryId: declaration.libraryId }, { area: 'active' })
		return items.map(item => `${item.name}\u0000${item.bytes}\u0000${item.modifiedAt}`).sort().join('\u0001')
	}

	async _reconcileWatch(state) {
		const signature = await this._watchSignature(state.declaration)
		if (state.signature !== null && signature !== state.signature) this._emitWatch(state, { type: 'changed', reason: 'reconcile', names: [], full: true, at: Number(this.now()) })
		state.signature = signature
	}

	async watch(context, listener) {
		if (typeof listener !== 'function') throw new LibraryStoreError('PATH_INVALID', safeMessageForCode('PATH_INVALID'))
		const declaration = this._declaration(context)
		await this._ready(declaration)
		let state = this.watchStates.get(declaration.directoryKey)
		if (!state) {
			state = { declaration, watcher: null, listeners: new Map(), pending: new Set(), timer: null, reconcileTimer: null, signature: null }
			try {
				state.signature = await this._watchSignature(declaration)
				state.watcher = this.watchFactory(this._root(declaration), { recursive: true }, (eventType, fileName) => {
					state.pending.add(fileName === null || fileName === undefined ? '' : String(fileName))
					this._scheduleWatch(state)
				})
				if (!state.watcher || typeof state.watcher.close !== 'function') throw new Error('Watcher handle is unavailable.')
				if (typeof state.watcher.on === 'function') state.watcher.on('error', error => this._emitWatch(state, { type: 'warning', code: 'WATCH_UNAVAILABLE', message: safeMessageForCode('WATCH_UNAVAILABLE'), at: Number(this.now()) }))
				state.reconcileTimer = setInterval(() => this._reconcileWatch(state).catch(error => this._emitWatch(state, { type: 'warning', code: 'WATCH_UNAVAILABLE', message: safeMessageForCode('WATCH_UNAVAILABLE'), at: Number(this.now()) })), this.reconcileMs)
				state.reconcileTimer.unref?.()
				this.watchStates.set(declaration.directoryKey, state)
			} catch (error) {
				try { state.watcher?.close() } catch (closeError) {}
				throw new LibraryStoreError('WATCH_UNAVAILABLE', safeMessageForCode('WATCH_UNAVAILABLE'), error)
			}
		}
		const id = this.randomUUID().toLowerCase()
		state.listeners.set(id, listener)
		return {
			id,
			close: () => {
				const active = this.watchStates.get(declaration.directoryKey)
				if (!active) return
				active.listeners.delete(id)
				if (active.listeners.size) return
				if (active.timer) clearTimeout(active.timer)
				if (active.reconcileTimer) clearInterval(active.reconcileTimer)
				try { active.watcher?.close() } catch (error) {}
				this.watchStates.delete(declaration.directoryKey)
			}
		}
	}

	async _cleanupStaleTemps(declaration) {
		const directories = [
			this._root(declaration),
			this._inside(this._root(declaration), '.trash'),
			this._inside(this._root(declaration), '.quarantine'),
			...declaration.cache.directories.map(bucket => this._inside(this._root(declaration), '.cache', bucket))
		]
		const cutoff = Number(this.now()) - TEMP_MAX_AGE_MS
		for (const directory of directories) {
			for (const entry of await fs.promises.readdir(directory, { withFileTypes: true }).catch(() => [])) {
				if (!entry.isFile() || !entry.name.toLowerCase().startsWith('.tmp-')) continue
				const target = this._inside(directory, entry.name)
				const stat = await fs.promises.lstat(target).catch(() => null)
				if (stat && stat.mtimeMs < cutoff) await fs.promises.rm(target, { force: true })
			}
		}
	}

	async _exists(target) {
		try { await fs.promises.access(target); return true } catch (error) { return false }
	}

	dispose() {
		for (const state of this.watchStates.values()) {
			if (state.timer) clearTimeout(state.timer)
			if (state.reconcileTimer) clearInterval(state.reconcileTimer)
			try { state.watcher?.close() } catch (error) {}
		}
		this.watchStates.clear()
	}

	_publicError(error, fallbackCode) {
		if (error instanceof LibraryStoreError) return error
		let code = fallbackCode || 'IO_FAILED'
		if (error?.code === 'EACCES' || error?.code === 'EPERM' || error?.code === 'EROFS') code = 'PERMISSION_DENIED'
		else if (error?.code === 'ENOSPC' || error?.code === 'EDQUOT') code = 'QUOTA_EXCEEDED'
		else if (error?.code === 'ENOENT') code = 'NOT_FOUND'
		else if (error?.code === 'EEXIST') code = 'NAME_CONFLICT'
		this.log('libraryStoreError', { code, systemCode: error?.code || '', message: error?.message || String(error) })
		return new LibraryStoreError(code, safeMessageForCode(code), error)
	}
}

for (const method of ['capabilities', 'list', 'read', 'write', 'rename', 'trash', 'restore', 'quarantine', 'remove', 'folder', 'watch']) {
	const original = LibraryStore.prototype[method]
	LibraryStore.prototype[method] = async function (...args) {
		try { return await original.apply(this, args) } catch (error) { throw this._publicError(error) }
	}
}

module.exports = {
	API_VERSION,
	DEFAULT_MAX_FILE_BYTES,
	DEFAULT_MAX_TOTAL_BYTES,
	DEFAULT_MAX_ENTRIES,
	DEFAULT_MAX_CACHE_BYTES,
	DEFAULT_DEBOUNCE_MS,
	DEFAULT_STABLE_DELAY_MS,
	DEFAULT_RECONCILE_MS,
	TEMP_MAX_AGE_MS,
	LibraryStore,
	LibraryStoreError,
	normalizeLibraryDeclaration,
	normalizeManifestLibraries,
	safeMessageForCode
}
