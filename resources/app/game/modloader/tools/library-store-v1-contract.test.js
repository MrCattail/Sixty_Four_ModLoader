'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
	API_VERSION,
	LibraryStore,
	normalizeLibraryDeclaration,
	normalizeManifestLibraries
} = require('../library-store.js')

function declaration(overrides) {
	return Object.assign({
		modId: 'library-contract-mod',
		libraryId: 'blueprints',
		directory: 'blueprints',
		extensions: ['.cattail-blueprint.json'],
		maxFileBytes: 64,
		maxTotalBytes: 512,
		maxEntries: 12,
		cache: {
			extensions: ['.png'],
			directories: ['thumbnails'],
			maxBytes: 20
		}
	}, overrides || {})
}

function context() {
	return { modId: 'library-contract-mod', libraryId: 'blueprints' }
}

async function rejectsCode(operation, code) {
	await assert.rejects(operation, error => error?.name === 'LibraryStoreError' && error.code === code)
}

async function run() {
	assert.equal(API_VERSION, '1.0.0')
	assert.equal(normalizeLibraryDeclaration(declaration()).directory, 'blueprints')
	assert.equal(normalizeManifestLibraries('owner', { blueprints: declaration({ modId: undefined, libraryId: undefined }) })[0].libraryId, 'blueprints')
	assert.throws(() => normalizeLibraryDeclaration(declaration({ directory: '../outside' })), error => error?.code === 'PATH_INVALID')
	assert.throws(() => normalizeLibraryDeclaration(declaration({ directory: 'resources' })), error => error?.code === 'PATH_INVALID')

	const temporaryRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'modloader-library-v1-'))
	const duplicateStore = new LibraryStore({
		installationRoot: temporaryRoot,
		declarations: [declaration(), declaration()]
	})
	await rejectsCode(duplicateStore.capabilities(context()), 'PERMISSION_DENIED')
	duplicateStore.dispose()
	const ownershipConflictStore = new LibraryStore({
		installationRoot: temporaryRoot,
		declarations: [
			declaration(),
			declaration({ modId: 'second-owner', libraryId: 'other-library' })
		]
	})
	await rejectsCode(ownershipConflictStore.capabilities(context()), 'PERMISSION_DENIED')
	await rejectsCode(ownershipConflictStore.capabilities({ modId: 'second-owner', libraryId: 'other-library' }), 'PERMISSION_DENIED')
	ownershipConflictStore.dispose()
	const quotaStore = new LibraryStore({
		installationRoot: temporaryRoot,
		declarations: [declaration({
			libraryId: 'small',
			directory: 'small-library',
			maxFileBytes: 8,
			maxTotalBytes: 10,
			maxEntries: 2,
			cache: {}
		})]
	})
	const smallContext = { modId: 'library-contract-mod', libraryId: 'small' }
	assert.equal((await quotaStore.capabilities(smallContext)).areas.includes('cache'), false)
	await quotaStore.write(smallContext, { name: 'one.cattail-blueprint.json', data: '123456' })
	await rejectsCode(quotaStore.write(smallContext, { name: 'two.cattail-blueprint.json', data: '12345' }), 'QUOTA_EXCEEDED')
	quotaStore.dispose()
	const linkStore = new LibraryStore({
		installationRoot: temporaryRoot,
		declarations: [declaration({ libraryId: 'links', directory: 'link-library', cache: {} })]
	})
	const linkContext = { modId: 'library-contract-mod', libraryId: 'links' }
	await linkStore.capabilities(linkContext)
	const trashDirectory = path.join(temporaryRoot, 'link-library', '.trash')
	const linkTarget = path.join(temporaryRoot, 'link-target')
	await fs.promises.mkdir(linkTarget)
	await fs.promises.rm(trashDirectory, { recursive: true, force: true })
	try {
		await fs.promises.symlink(linkTarget, trashDirectory, 'junction')
		await rejectsCode(linkStore.list(linkContext, { area: 'active' }), 'PATH_INVALID')
	} catch (error) {
		if (!['EPERM', 'EACCES'].includes(error?.code)) throw error
	}
	linkStore.dispose()
	let watcherCallback = null
	let watcherClosed = false
	const fakeWatcher = {
		on() { return this },
		close() { watcherClosed = true }
	}
	const store = new LibraryStore({
		installationRoot: temporaryRoot,
		declarations: [declaration()],
		debounceMs: 1,
		stableDelayMs: 1,
		reconcileMs: 60 * 1000,
		watchFactory(root, options, callback) {
			assert.equal(path.basename(root), 'blueprints')
			assert.equal(options.recursive, true)
			watcherCallback = callback
			return fakeWatcher
		}
	})

	try {
		const capabilities = await store.capabilities(context())
		assert.equal(capabilities.apiVersion, '1.0.0')
		assert.equal(capabilities.maxFileBytes, 64)
		assert.equal(capabilities.maxTotalBytes, 512)
		assert.deepEqual(capabilities.cache.directories, ['thumbnails'])
		assert.equal(capabilities.atomicPublish, true)
		assert.equal(capabilities.optimisticConcurrency, true)
		assert.equal(capabilities.pathsExposed, false)
		assert.equal('directory' in capabilities, false)

		await rejectsCode(store.list({ modId: 'other-mod', libraryId: 'blueprints' }), 'PERMISSION_DENIED')
		await rejectsCode(store.write(context(), { name: '../escape.cattail-blueprint.json', data: '{}' }), 'PATH_INVALID')
		await rejectsCode(store.write(context(), { name: 'large.cattail-blueprint.json', data: 'x'.repeat(65) }), 'TOO_LARGE')

		const created = await store.write(context(), {
			name: 'alpha.cattail-blueprint.json',
			data: '{"schemaVersion":6}'
		})
		assert.equal(created.info.name, 'alpha.cattail-blueprint.json')
		assert.match(created.info.revision, /^[a-f0-9]{64}$/)
		assert.equal(created.backup, null)
		assert.equal((await store.list(context(), { area: 'active' })).length, 1)

		const readText = await store.read(context(), {
			name: created.info.name,
			expectedRevision: created.info.revision,
			encoding: 'utf8'
		})
		assert.equal(readText.payload.toString('utf8'), '{"schemaVersion":6}')
		assert.equal(readText.payloadType, 'utf8')
		await rejectsCode(store.write(context(), { name: created.info.name, data: '{}' }), 'NAME_CONFLICT')
		await rejectsCode(store.rename(context(), { name: created.info.name, newName: 'beta.cattail-blueprint.json', expectedRevision: '0'.repeat(64) }), 'REVISION_CONFLICT')

		const renamed = await store.rename(context(), {
			name: created.info.name,
			newName: 'beta.cattail-blueprint.json',
			expectedRevision: created.info.revision
		})
		assert.equal(renamed.name, 'beta.cattail-blueprint.json')

		const replaced = await store.write(context(), {
			name: renamed.name,
			data: '{"schemaVersion":6,"new":true}',
			expectedRevision: renamed.revision
		})
		assert.equal(replaced.backup.originalName, renamed.name)
		assert.equal((await store.list(context(), { area: 'trash' })).length, 1)
		await rejectsCode(store.restore(context(), {
			name: replaced.backup.name,
			expectedRevision: replaced.backup.revision
		}), 'NAME_CONFLICT')

		const restoredBackup = await store.restore(context(), {
			name: replaced.backup.name,
			newName: 'alpha-restored.cattail-blueprint.json',
			expectedRevision: replaced.backup.revision
		})
		assert.equal(restoredBackup.name, 'alpha-restored.cattail-blueprint.json')

		const trashed = await store.trash(context(), {
			name: replaced.info.name,
			expectedRevision: replaced.info.revision
		})
		assert.equal(trashed.originalName, replaced.info.name)
		const restored = await store.restore(context(), {
			name: trashed.name,
			expectedRevision: trashed.revision
		})
		assert.equal(restored.area, 'active')

		const quarantined = await store.quarantine(context(), {
			name: restoredBackup.name,
			expectedRevision: restoredBackup.revision
		})
		assert.equal(quarantined.area, 'quarantine')
		assert.deepEqual(await store.remove(context(), {
			area: 'quarantine',
			name: quarantined.name,
			expectedRevision: quarantined.revision
		}), { name: quarantined.name, area: 'quarantine', bucket: undefined, removed: true })
		await rejectsCode(store.remove(context(), {
			area: 'active',
			name: restored.name,
			expectedRevision: restored.revision
		}), 'PERMISSION_DENIED')

		const cacheOne = await store.write(context(), {
			area: 'cache',
			bucket: 'thumbnails',
			name: 'one.png',
			data: Uint8Array.from({ length: 12 }, (_, index) => index)
		})
		assert.equal(cacheOne.pruned.length, 0)
		const cacheTwo = await store.write(context(), {
			area: 'cache',
			bucket: 'thumbnails',
			name: 'two.png',
			data: Uint8Array.from({ length: 12 }, (_, index) => 20 + index)
		})
		assert.deepEqual(cacheTwo.pruned, [{ name: 'one.png', bucket: 'thumbnails' }])
		assert.deepEqual((await store.list(context(), { area: 'cache', bucket: 'thumbnails' })).map(item => item.name), ['two.png'])

		const events = []
		let resolveNotification
		const notification = new Promise(resolve => { resolveNotification = resolve })
		const watch = await store.watch(context(), event => {
			events.push(event)
			resolveNotification()
		})
		assert.ok(watcherCallback)
		watcherCallback('change', '.cache\\thumbnails\\two.png')
		watcherCallback('change', restored.name)
		// Wait for delivery rather than assuming filesystem checks finish in 30ms.
		// Keep a hard failure if the watcher never delivers the notification.
		let notificationTimeout
		try {
			await Promise.race([
				notification,
				new Promise((resolve, reject) => {
					notificationTimeout = setTimeout(() => reject(new Error('Library watch notification timed out after 5000ms')), 5000)
				})
			])
		} finally {
			clearTimeout(notificationTimeout)
		}
		assert.equal(events.length, 1)
		assert.deepEqual(events[0].names, [restored.name])
		watch.close()
		assert.equal(watcherClosed, true)

		await fs.promises.writeFile(path.join(temporaryRoot, 'blueprints', restored.name), '{"external":true}', 'utf8')
		await rejectsCode(store.rename(context(), {
			name: restored.name,
			newName: 'external.cattail-blueprint.json',
			expectedRevision: restored.revision
		}), 'REVISION_CONFLICT')

		const unavailable = new LibraryStore({
			installationRoot: temporaryRoot,
			declarations: [declaration()],
			watchFactory() { throw new Error('watch unavailable') }
		})
		await rejectsCode(unavailable.watch(context(), () => {}), 'WATCH_UNAVAILABLE')
		unavailable.dispose()
	} finally {
		store.dispose()
		const resolved = path.resolve(temporaryRoot)
		assert.equal(resolved.startsWith(path.resolve(os.tmpdir())), true)
		await fs.promises.rm(resolved, { recursive: true, force: true })
	}
}

run().then(
	() => console.log('Library store v1 contract passed.'),
	error => {
		console.error(error)
		process.exitCode = 1
	}
)
