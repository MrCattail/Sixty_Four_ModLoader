'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const loaderPath = path.resolve(__dirname, '..', 'loader.js')
const mainProcessPath = path.resolve(__dirname, '..', 'main-process.js')
const source = fs.readFileSync(loaderPath, 'utf8')
const mainProcessSource = fs.readFileSync(mainProcessPath, 'utf8')
const calls = []
const ipcListeners = new Map()

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
	on(channel, listener) {
		ipcListeners.set(channel, listener)
	},
	emit(channel, payload) {
		ipcListeners.get(channel)?.({}, payload)
	},
	async invoke(channel, payload) {
		calls.push({ channel, payload })
		if (channel !== 'modloader:libraries:runtime') return { ok: false, error: { code: 'NOT_READY', message: 'Library storage is not ready.' } }
		const action = payload.action
		if (action === 'capabilities') {
			return {
				ok: true,
				value: {
					apiVersion: '1.0.0',
					available: true,
					libraryId: payload.libraryId,
					maxFileBytes: 16 * 1024 * 1024,
					maxTotalBytes: 2 * 1024 * 1024 * 1024,
					maxEntries: 5000,
					pathsExposed: false
				}
			}
		}
		if (action === 'list') return { ok: true, value: [] }
		if (action === 'write') {
			return {
				ok: true,
				value: {
					info: { name: payload.request.name, revision: 'a'.repeat(64), bytes: 5, area: 'active' },
					payloadType: typeof payload.request.data === 'string' ? 'utf8' : 'bytes',
					backup: null,
					pruned: []
				}
			}
		}
		if (action === 'read') {
			if (payload.request.name === 'missing.cattail-blueprint.json') return { ok: false, error: { code: 'NOT_FOUND', message: 'The library item was not found.' } }
			if (payload.request.encoding === 'utf8') return { ok: true, value: { info: { name: payload.request.name }, data: '{"ok":true}' } }
			return { ok: true, value: { info: { name: payload.request.name }, data: { type: 'Buffer', data: [0, 127, 255] } } }
		}
		if (action === 'watch') return { ok: true, value: { subscriptionId: 'watch-1' } }
		if (action === 'unwatch') return { ok: true, value: { subscriptionId: payload.request.subscriptionId, closed: true } }
		if (action === 'openFolder') return { ok: true, value: { opened: true, area: payload.request?.area || 'active' } }
		if (['rename', 'trash', 'restore', 'quarantine', 'remove'].includes(action)) return { ok: true, value: { action } }
		return { ok: false, error: { code: 'PATH_INVALID', message: 'Library path or name is invalid.' } }
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
	assert.equal(modLoader.version, '0.3.0')
	const modApi = modLoader.forMod('library-contract-mod')
	assert.equal(modApi.storage.version, '1.0.0')
	assert.equal(modApi.storage.libraries.version, '1.0.0')
	assert.equal(Object.isFrozen(modApi.storage), true)
	assert.equal(Object.isFrozen(modApi.storage.libraries), true)

	const library = modApi.storage.libraries.open('Blueprints')
	assert.equal(Object.isFrozen(library), true)
	assert.equal(library.id, 'blueprints')
	assert.equal(library.version, '1.0.0')
	assert.deepEqual(
		Object.keys(library).sort(),
		['capabilities', 'id', 'list', 'openFolder', 'quarantine', 'read', 'remove', 'rename', 'restore', 'trash', 'version', 'watch', 'write']
	)

	const capabilities = await library.capabilities()
	assert.equal(capabilities.apiVersion, '1.0.0')
	assert.equal(capabilities.pathsExposed, false)
	assert.equal(calls.at(-1).channel, 'modloader:libraries:runtime')
	assert.equal(calls.at(-1).payload.modId, 'library-contract-mod')
	assert.equal(calls.at(-1).payload.libraryId, 'blueprints')

	const written = await library.write({ name: 'example.cattail-blueprint.json', data: 'hello' })
	assert.equal(written.payloadType, 'utf8')
	assert.equal(written.info.revision, 'a'.repeat(64))
	assert.deepEqual(await library.list({ area: 'active' }), [])

	const textRecord = await library.read({ name: written.info.name, encoding: 'utf8' })
	assert.equal(textRecord.data, '{"ok":true}')
	const bytesRecord = await library.read({ name: written.info.name })
	assert.equal(Object.prototype.toString.call(bytesRecord.data), '[object Uint8Array]')
	assert.deepEqual(Array.from(bytesRecord.data), [0, 127, 255])

	assert.deepEqual(await library.rename({}), { action: 'rename' })
	assert.deepEqual(await library.trash({}), { action: 'trash' })
	assert.deepEqual(await library.restore({}), { action: 'restore' })
	assert.deepEqual(await library.quarantine({}), { action: 'quarantine' })
	assert.deepEqual(await library.remove({}), { action: 'remove' })
	assert.deepEqual(await library.openFolder({ area: 'trash' }), { opened: true, area: 'trash' })

	const watchEvents = []
	const watcher = await library.watch(event => watchEvents.push(event))
	assert.equal(watcher.subscriptionId, 'watch-1')
	assert.equal(Object.isFrozen(watcher), true)
	fakeIpcRenderer.emit('modloader:libraries:event', {
		subscriptionId: 'watch-1',
		event: { type: 'changed', names: ['external.cattail-blueprint.json'] }
	})
	assert.deepEqual(watchEvents, [{ type: 'changed', names: ['external.cattail-blueprint.json'] }])
	assert.deepEqual(await watcher.close(), { subscriptionId: 'watch-1', closed: true })

	await assert.rejects(
		library.read({ name: 'missing.cattail-blueprint.json' }),
		error => error?.name === 'ModLoaderLibraryError' && error.code === 'NOT_FOUND' && error.message === 'The library item was not found.'
	)
	await assert.rejects(
		library.watch(null),
		error => error?.name === 'ModLoaderLibraryError' && error.code === 'PATH_INVALID'
	)

	assert.match(mainProcessSource, /collectLibraryDeclarations\(\)/)
	assert.match(mainProcessSource, /new LibraryStore\(/)
	assert.match(mainProcessSource, /modloader:libraries:runtime/)
	assert.match(mainProcessSource, /libraryStore\.folder\(context, request\)/)
	assert.match(mainProcessSource, /shell\.openPath\(directory\)/)
	assert.doesNotMatch(source.slice(source.indexOf('const createLibraryHandle'), source.indexOf('const modloaderWindowApiState')), /require\(['"](?:fs|path)['"]\)/)
}

run().then(
	() => console.log('Library API v1 contract passed.'),
	error => {
		console.error(error)
		process.exitCode = 1
	}
)
