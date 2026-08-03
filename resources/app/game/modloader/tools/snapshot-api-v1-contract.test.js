'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const loaderPath = path.resolve(__dirname, '..', 'loader.js')
const source = fs.readFileSync(loaderPath, 'utf8')
const calls = []

function fakeClassList() {
	return {
		add() {},
		remove() {},
		toggle() { return false },
		contains() { return false }
	}
}

function fakeNode(tagName) {
	return {
		tagName: String(tagName || '').toUpperCase(),
		id: '',
		className: '',
		style: {},
		dataset: {},
		children: [],
		classList: fakeClassList(),
		appendChild(child) { this.children.push(child); child.parentNode = this; return child },
		append(...children) { for (const child of children) this.appendChild(child) },
		insertBefore(child) { return this.appendChild(child) },
		remove() {},
		setAttribute() {},
		addEventListener() {},
		removeEventListener() {},
		getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } }
	}
}

const fakeDocument = {
	body: fakeNode('body'),
	head: fakeNode('head'),
	addEventListener() {},
	removeEventListener() {},
	createElement: fakeNode,
	getElementById() { return null },
	querySelector() { return null }
}

const fakeIpcRenderer = {
	async invoke(channel, payload) {
		calls.push({ channel, payload })
		if (channel !== 'modloader:snapshots:runtime') return { ok: false, error: { code: 'UNAVAILABLE', message: 'Snapshot storage is unavailable.' } }
		if (payload.action === 'capabilities') {
			return {
				ok: true,
				value: {
					apiVersion: '1.0.0',
					available: true,
					activeSave: false,
					payloadTypes: ['utf8', 'bytes'],
					maxPayloadBytes: 16 * 1024 * 1024,
					maxSnapshotsPerNamespace: 10
				}
			}
		}
		if (payload.action === 'create') {
			return {
				ok: true,
				value: {
					id: '1700000000000-00000000-0000-4000-8000-000000000001',
					createdAt: 1700000000000,
					bytes: 5,
					sha256: 'a'.repeat(64),
					apiVersion: '1.0.0',
					payloadType: 'utf8',
					reason: payload.request.reason,
					tags: payload.request.tags
				}
			}
		}
		if (payload.action === 'list') return { ok: true, value: [] }
		if (payload.action === 'read') {
			if (payload.request.id === 'missing') return { ok: false, error: { code: 'NOT_FOUND', message: 'Snapshot was not found.' } }
			return {
				ok: true,
				value: {
					info: {
						id: payload.request.id,
						createdAt: 1700000000000,
						bytes: 3,
						sha256: 'b'.repeat(64),
						apiVersion: '1.0.0',
						payloadType: 'bytes',
						reason: 'binary'
					},
					data: { type: 'Buffer', data: [0, 127, 255] }
				}
			}
		}
		if (payload.action === 'remove') return { ok: true, value: { id: payload.request.id, removed: true } }
		if (payload.action === 'prune') return { ok: true, value: { removedIds: [], remainingCount: 0 } }
		return { ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Snapshot request is invalid.' } }
	}
}

const sandbox = {
	window: {
		addEventListener() {},
		removeEventListener() {},
		dispatchEvent() {},
		devicePixelRatio: 1,
		innerWidth: 1280,
		innerHeight: 720
	},
	document: fakeDocument,
	console: { log() {}, warn() {} },
	performance: { now() { return 0 } },
	setTimeout,
	clearTimeout,
	CustomEvent: function CustomEvent(type, options) { this.type = type; this.detail = options?.detail },
	require(id) {
		if (id === 'electron') return { ipcRenderer: fakeIpcRenderer }
		if (id === 'crypto') return crypto
		throw new Error(`Unexpected require: ${id}`)
	}
}
sandbox.window.window = sandbox.window

vm.runInNewContext(source, sandbox, { filename: loaderPath })

async function run() {
	const modLoader = sandbox.window.ModLoader
	assert.equal(modLoader.version, '0.3.1')
	const adminPageStart = source.indexOf('const snapshotAdminRequest')
	const adminPageEnd = source.indexOf('\n\tconst renderPanel = function', adminPageStart)
	assert.ok(adminPageStart > 0 && adminPageEnd > adminPageStart, 'snapshot management subpage is present')
	const adminPageSource = source.slice(adminPageStart, adminPageEnd)
	for (const action of ['list', 'validate', 'export', 'remove']) {
		assert.match(adminPageSource, new RegExp(`snapshotAdminRequest\\('${action}'`), `snapshot admin ${action} action is wired`)
	}
	assert.doesNotMatch(adminPageSource, /snapshotAdminRequest\('(import|restore)'/, 'snapshot management does not expose import or restore')
	assert.match(source, /createPanelActionButton\('snapshots'/, 'snapshot management toolbar entry is present')
	const modApi = modLoader.forMod('snapshot-contract-mod')
	assert.equal(modApi.storage.version, '1.0.0')
	assert.equal(Object.isFrozen(modApi.storage), true)
	assert.equal(Object.isFrozen(modApi.storage.snapshots), true)
	assert.deepEqual(
		Object.keys(modApi.storage.snapshots).sort(),
		['capabilities', 'create', 'list', 'prune', 'read', 'remove']
	)

	const capabilities = await modApi.storage.snapshots.capabilities()
	assert.equal(capabilities.apiVersion, '1.0.0')
	assert.equal(capabilities.maxPayloadBytes, 16 * 1024 * 1024)

	const created = await modApi.storage.snapshots.create({
		data: 'hello',
		reason: 'contract',
		tags: { source: 'test' }
	})
	assert.equal(created.reason, 'contract')
	assert.equal(calls.at(-1).payload.modId, 'snapshot-contract-mod')
	assert.equal(calls.at(-1).payload.action, 'create')
	assert.equal('saveId' in calls.at(-1).payload, false)

	assert.deepEqual(await modApi.storage.snapshots.list(), [])
	const read = await modApi.storage.snapshots.read({ id: created.id })
	assert.equal(read.info.payloadType, 'bytes')
	assert.equal(Object.prototype.toString.call(read.data), '[object Uint8Array]')
	assert.deepEqual(Array.from(read.data), [0, 127, 255])
	assert.deepEqual(await modApi.storage.snapshots.remove({ id: created.id }), { id: created.id, removed: true })
	assert.deepEqual(await modApi.storage.snapshots.prune(), { removedIds: [], remainingCount: 0 })

	await assert.rejects(
		modApi.storage.snapshots.read({ id: 'missing' }),
		error => error?.name === 'ModLoaderSnapshotError' && error.code === 'NOT_FOUND' && error.message === 'Snapshot was not found.'
	)

	const knownId = '11111111-1111-4111-8111-111111111111'
	const loaded = modLoader.applyLoadedSave({ modloader: { saveInstanceId: knownId } }, {})
	assert.equal(loaded.modloader.saveInstanceId, knownId)
	const owner = modLoader.forMod('identity-contract')
	owner.on('beforeSaveWrite', save => {
		save.modloader.saveInstanceId = 'forged'
		return save
	})
	const saved = modLoader.applySave({ stuff: [] }, {})
	assert.equal(saved.modloader.saveInstanceId, knownId)
}

run().then(
	() => console.log('Snapshot API v1 contract passed.'),
	error => {
		console.error(error)
		process.exitCode = 1
	}
)
