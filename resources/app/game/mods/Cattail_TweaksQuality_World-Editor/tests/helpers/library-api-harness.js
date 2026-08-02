const assert = require('node:assert/strict')

class MemoryLibraryHandle {
	constructor(options = {}) {
		this.extension = options.extension || '.cattail-blueprint.json'
		this.watchEnabled = options.watchEnabled !== false
		this.maxFileBytes = options.maxFileBytes || 1024 * 1024
		this.maxTotalBytes = options.maxTotalBytes || 8 * 1024 * 1024
		this.maxEntries = options.maxEntries || 512
		this.sequence = 0
		this.watchers = new Set()
		this.openFolderCalls = []
		this.operations = []
		this.areas = {
			active: new Map(),
			trash: new Map(),
			quarantine: new Map()
		}
	}

	async capabilities() {
		return {
			apiVersion: '1.0.0',
			libraryId: 'blueprints',
			maxFileBytes: this.maxFileBytes,
			maxTotalBytes: this.maxTotalBytes,
			maxEntries: this.maxEntries,
			cache: { maxBytes: 2 * 1024 * 1024 },
			watch: this.watchEnabled,
			pathsExposed: false
		}
	}

	async list(options = {}) {
		const area = this.area(options.area || 'active')
		return Array.from(area.values(), record => clone(record.info))
			.sort((left, right) => left.name.localeCompare(right.name))
	}

	async read(options = {}) {
		const record = this.requireRecord(options.area || 'active', options.name)
		this.requireRevision(record, options.expectedRevision)
		return {
			info: clone(record.info),
			data: options.encoding === 'utf8' ? String(record.data) : Uint8Array.from(Buffer.from(record.data))
		}
	}

	async write(options = {}) {
		if (options.area && options.area !== 'active') throw apiError('PERMISSION_DENIED', 'Only active writes are supported by this harness.')
		const name = this.validName(options.name)
		const data = typeof options.data === 'string' ? options.data : Buffer.from(options.data || []).toString()
		if (Buffer.byteLength(data) > this.maxFileBytes) throw apiError('TOO_LARGE', 'The file exceeds its quota.')
		const active = this.areas.active
		const existing = active.get(name)
		let backup = null
		if (existing) {
			if (options.expectedRevision === undefined) throw apiError('NAME_CONFLICT', 'The active name already exists.')
			this.requireRevision(existing, options.expectedRevision)
			const backupName = this.uniqueAreaName('trash', name.replace(this.extension, '') + '__backup' + this.extension)
			backup = this.moveRecord(existing, 'trash', backupName, false)
			active.delete(name)
		} else if (options.expectedRevision !== undefined) {
			throw apiError('NOT_FOUND', 'The expected active file does not exist.')
		}
		if (!existing && active.size >= this.maxEntries) throw apiError('QUOTA_EXCEEDED', 'The active entry quota is full.')
		const info = this.newInfo('active', name, data)
		active.set(name, { info, data })
		this.operations.push({ kind: existing ? 'replace' : 'write', name, revision: info.revision })
		this.emitWatch({ kind: existing ? 'change' : 'create', area: 'active', name })
		return { info: clone(info), backup: backup ? clone(backup) : null }
	}

	async rename(options = {}) {
		const record = this.requireRecord('active', options.name)
		this.requireRevision(record, options.expectedRevision)
		const newName = this.validName(options.newName)
		if (newName !== options.name && this.areas.active.has(newName)) throw apiError('NAME_CONFLICT', 'The destination name already exists.')
		this.areas.active.delete(options.name)
		const info = this.newInfo('active', newName, record.data)
		this.areas.active.set(newName, { info, data: record.data })
		this.operations.push({ kind: 'rename', name: options.name, newName })
		this.emitWatch({ kind: 'rename', area: 'active', name: newName })
		return clone(info)
	}

	async trash(options = {}) {
		return this.transfer('active', 'trash', options, options.name, 'trash')
	}

	async restore(options = {}) {
		return this.transfer('trash', 'active', options, options.newName || options.name, 'restore')
	}

	async quarantine(options = {}) {
		return this.transfer('active', 'quarantine', options, options.name, 'quarantine')
	}

	async remove(options = {}) {
		if (options.area === 'active') throw apiError('PERMISSION_DENIED', 'Active files cannot be permanently removed.')
		const areaName = options.area === 'quarantine' ? 'quarantine' : 'trash'
		const record = this.requireRecord(areaName, options.name)
		this.requireRevision(record, options.expectedRevision)
		this.areas[areaName].delete(options.name)
		this.operations.push({ kind: 'remove', area: areaName, name: options.name })
		this.emitWatch({ kind: 'remove', area: areaName, name: options.name })
		return { removed: true, area: areaName, name: options.name }
	}

	async watch(listener) {
		if (!this.watchEnabled) throw apiError('WATCH_UNAVAILABLE', 'Watching is unavailable.')
		this.watchers.add(listener)
		let closed = false
		return {
			close: () => {
				if (closed) return false
				closed = true
				this.watchers.delete(listener)
				return true
			}
		}
	}

	async openFolder(options = {}) {
		this.openFolderCalls.push(clone(options))
		return { opened: true }
	}

	externalWrite(name, data) {
		name = this.validName(name)
		const current = this.areas.active.get(name)
		const info = this.newInfo('active', name, String(data))
		this.areas.active.set(name, { info, data: String(data) })
		this.operations.push({ kind: current ? 'external-change' : 'external-create', name })
		this.emitWatch({ kind: current ? 'change' : 'create', area: 'active', name, external: true })
		return clone(info)
	}

	record(areaName, name) {
		const record = this.areas[areaName]?.get(name)
		return record ? { info: clone(record.info), data: String(record.data) } : null
	}

	transfer(from, to, options, desiredName, kind) {
		const record = this.requireRecord(from, options.name)
		this.requireRevision(record, options.expectedRevision)
		const name = this.validName(desiredName)
		if (this.areas[to].has(name)) throw apiError('NAME_CONFLICT', 'The destination name already exists.')
		this.areas[from].delete(options.name)
		const info = this.newInfo(to, name, record.data)
		this.areas[to].set(name, { info, data: record.data })
		this.operations.push({ kind, name, from, to })
		this.emitWatch({ kind, area: to, name })
		return Promise.resolve(clone(info))
	}

	moveRecord(record, areaName, name, newRevision = true) {
		const info = newRevision
			? this.newInfo(areaName, name, record.data)
			: Object.assign({}, clone(record.info), { area: areaName, name })
		this.areas[areaName].set(name, { info, data: record.data })
		return info
	}

	newInfo(area, name, data) {
		this.sequence += 1
		return {
			area,
			name,
			revision: 'revision-' + this.sequence,
			size: Buffer.byteLength(String(data)),
			modifiedAt: Date.now() + this.sequence
		}
	}

	requireRecord(areaName, name) {
		const record = this.area(areaName).get(String(name || ''))
		if (!record) throw apiError('NOT_FOUND', 'The requested file does not exist.')
		return record
	}

	requireRevision(record, expectedRevision) {
		if (expectedRevision !== undefined && expectedRevision !== record.info.revision) {
			throw apiError('REVISION_CONFLICT', 'The file revision changed.')
		}
	}

	validName(value) {
		const name = String(value || '')
		if (!name.endsWith(this.extension) || /[\\/]/.test(name) || name.includes('..')) {
			throw apiError('PATH_INVALID', 'The managed name is invalid.')
		}
		return name
	}

	uniqueAreaName(areaName, preferred) {
		if (!this.areas[areaName].has(preferred)) return preferred
		this.sequence += 1
		return preferred.replace(this.extension, '__' + this.sequence + this.extension)
	}

	area(value) {
		const area = this.areas[String(value || '')]
		if (!area) throw apiError('AREA_INVALID', 'The managed area is invalid.')
		return area
	}

	emitWatch(event) {
		for (const listener of Array.from(this.watchers)) {
			queueMicrotask(() => listener(clone(event)))
		}
	}
}

function apiError(code, message) {
	const error = new Error(message)
	error.code = code
	return error
}

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

async function waitFor(predicate, message, timeoutMs = 1000) {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		const value = predicate()
		if (value) return value
		await new Promise(resolve => setTimeout(resolve, 0))
	}
	assert.fail(message || 'Timed out waiting for the library harness condition.')
}

module.exports = {
	MemoryLibraryHandle,
	apiError,
	clone,
	waitFor
}
