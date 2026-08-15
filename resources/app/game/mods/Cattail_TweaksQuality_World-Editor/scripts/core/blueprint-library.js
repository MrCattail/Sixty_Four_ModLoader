ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const LIBRARY_KEY = Symbol.for('cattail.world-editor.blueprint-library')
		const FORMAT_KEY = Symbol.for('cattail.world-editor.blueprint-library-format')
		const SESSION_KEY = Symbol.for('cattail.world-editor.blueprint')
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const THUMBNAIL_KEY = Symbol.for('cattail.world-editor.blueprint-thumbnail')
		const TRANSFORM_KEY = Symbol.for('cattail.world-editor.blueprint-transform')
		const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
		const previous = globalThis[LIBRARY_KEY]
		previous?.dispose?.('blueprint-library-replaced')

		api.on('afterGameInit', function (payload, game) {
			const format = globalThis[FORMAT_KEY]
			const session = globalThis[SESSION_KEY]
			const runtime = globalThis[RUNTIME_KEY]
			const transform = globalThis[TRANSFORM_KEY]
			const libraries = api.storage?.libraries
			if (!format || !session || typeof transform?.snapshot !== 'function' || typeof transform?.restore !== 'function' || libraries?.version !== '1.1.0' || typeof libraries.open !== 'function') {
				console.warn('[Cattail World Editor] Blueprint library requires Library API 1.1.0 and an active blueprint session.')
				return
			}

			const handle = libraries.open('blueprints')
			const controller = createController(game, handle, format, session, transform)
			Object.defineProperty(globalThis, LIBRARY_KEY, {
				value: controller,
				configurable: true,
				writable: true
			})
			runtime?.addCleanup?.(function () { controller.dispose('runtime-disposed') })
			void controller.initialize()
		})

		function createController(game, handle, format, session, transform) {
			const listeners = new Set()
			let disposed = false
			let ready = false
			let busy = false
			let available = true
			let watchAvailable = false
			let watcher = null
			let revision = 0
			let refreshToken = 0
			let lastReason = 'initialized'
			let error = null
			let capabilities = null
			let active = []
			let trash = []
			let quarantine = []
			let problems = []

			const controller = Object.freeze({
				version: '0.5.1',
				game,
				handle,
				snapshot,
				subscribe,
				initialize,
				refresh,
				saveCurrent,
				load,
				rename,
				duplicate,
				pickImport,
				prepareImportText,
				commitImport,
				exportItem,
				shareText,
				trash: trashEntry,
				restore,
				quarantine: quarantineEntry,
				remove: removeEntry,
				retry,
				openFolder(options) { return handle.openFolder(options || { area: 'active' }) },
				async thumbnail(entry) {
					const renderer = globalThis[THUMBNAIL_KEY]
					if (!entry?.envelope || typeof renderer?.get !== 'function') return null
					return renderer.get(handle, entry)
				},
				writeBlockedReason,
				dispose
			})

			function snapshot() {
				const blockedReason = writeBlockedReason()
				return Object.freeze({
					version: '0.5.1',
					ready,
					available,
					busy,
					watchAvailable,
					capabilities,
					active: Object.freeze(active.slice()),
					trash: Object.freeze(trash.slice()),
					quarantine: Object.freeze(quarantine.slice()),
					problems: Object.freeze(problems.slice()),
					lastReason,
					error,
					writeBlockedReason: blockedReason,
					revision,
					disposed
				})
			}

			function subscribe(listener) {
				if (typeof listener !== 'function') throw new TypeError('Blueprint library listener must be a function.')
				if (disposed) return function () {}
				listeners.add(listener)
				listener(snapshot())
				return function () { listeners.delete(listener) }
			}

			function notify(reason) {
				lastReason = String(reason || lastReason)
				revision += 1
				const state = snapshot()
				for (const listener of Array.from(listeners)) {
					try { listener(state) } catch (listenerError) {
						console.warn('[Cattail World Editor] Blueprint library listener failed.', listenerError)
					}
				}
			}

			async function initialize() {
				if (disposed) return snapshot()
				return run('initialize', async function () {
					capabilities = Object.freeze(await handle.capabilities())
					await refreshInternal('initialize-refresh')
					try {
						watcher = await handle.watch(function () {
							void refresh('external-change').catch(function (watchRefreshError) {
								if (watchRefreshError?.code !== 'BUSY') console.warn('[Cattail World Editor] Blueprint library watch refresh failed.', watchRefreshError)
							})
						})
						watchAvailable = true
					} catch (watchError) {
						watchAvailable = false
						if (watchError?.code !== 'WATCH_UNAVAILABLE') throw watchError
					}
					ready = true
					return snapshot()
				})
			}

			async function refresh(reason) {
				return run(reason || 'manual-refresh', function () { return refreshInternal(reason || 'manual-refresh') })
			}

			async function refreshInternal(reason) {
				const token = ++refreshToken
				const lists = await Promise.all([
					readArea('active', true),
					readArea('trash', true),
					readArea('quarantine', false)
				])
				if (disposed || token !== refreshToken) return snapshot()
				active = lists[0]
				trash = lists[1]
				quarantine = lists[2]
				problems = active.concat(trash).filter(function (entry) { return !!entry.error })
				notify(reason || 'refreshed')
				return snapshot()
			}

			async function readArea(area, parseFiles) {
				const infos = await handle.list({ area })
				const result = []
				for (const info of infos || []) {
					if (!parseFiles) {
						result.push(freezeEntry({ area, info, name: info.name, revision: info.revision }))
						continue
					}
					try {
						const record = await handle.read({ area, name: info.name, expectedRevision: info.revision, encoding: 'utf8' })
						const envelope = format.parse(record.data)
						result.push(freezeEntry({
							area,
							info: record.info,
							name: record.info.name,
							revision: record.info.revision,
							envelope,
							metadata: format.metadata(envelope)
						}))
					} catch (readError) {
						result.push(freezeEntry({
							area,
							info,
							name: info.name,
							revision: info.revision,
							error: publicError(readError)
						}))
					}
				}
				return result.sort(compareEntries)
			}

			async function saveCurrent(options) {
				assertWritable()
				const settings = options || {}
				const source = session.snapshot().sourceBlueprint
				if (!source) throw libraryError('BLUEPRINT_REQUIRED', 'There is no current blueprint to save.')
				return run(settings.replace ? 'replace-current' : 'save-current', async function () {
					const defaultTransform = currentDefaultTransform()
					let envelope
					let name
					let expectedRevision
					if (settings.replace) {
						const entry = resolveActiveEntry(settings.entry || session.snapshot().origin)
						if (!entry?.envelope) throw libraryError('NOT_FOUND', 'The blueprint selected for replacement is unavailable.')
						envelope = format.create({
							id: entry.envelope.id,
							displayName: settings.displayName || entry.envelope.displayName,
							createdAt: entry.envelope.createdAt,
							defaultTransform,
							blueprint: source
						})
						name = entry.name
						expectedRevision = entry.revision
					} else {
						envelope = format.create({ displayName: settings.displayName, defaultTransform, blueprint: source })
						name = format.fileName(envelope.displayName, envelope.id)
					}
					const written = await handle.write({ name, data: format.serialize(envelope), expectedRevision })
					const desiredName = format.fileName(envelope.displayName, envelope.id)
					const info = settings.replace && desiredName !== written.info.name
						? await handle.rename({ name: written.info.name, newName: desiredName, expectedRevision: written.info.revision })
						: written.info
					const savedOrigin = originFrom(envelope, info)
					session.markSaved(savedOrigin, settings.replace ? 'library-replaced' : 'library-saved')
					await refreshInternal('save-complete')
					return resolveActiveEntry(savedOrigin) || freezeEntry({
						area: 'active', info, name: info.name, revision: info.revision,
						envelope, metadata: format.metadata(envelope)
					})
				})
			}

			async function load(entryValue) {
				const entry = resolveActiveEntry(entryValue)
				if (!entry?.envelope) throw libraryError('NOT_FOUND', 'The blueprint is unavailable or has a problem.')
				return run('load', async function () {
					const record = await handle.read({
						area: 'active', name: entry.name, expectedRevision: entry.revision, encoding: 'utf8'
					})
					const envelope = format.parse(record.data)
					const origin = originFrom(envelope, record.info)
					session.loadSource(envelope.blueprint, origin, 'library-load')
					transform.restore(envelope.defaultTransform, 'library-load-default-transform')
					return envelope
				})
			}

			async function rename(entryValue, displayName) {
				assertWritable()
				const entry = resolveActiveEntry(entryValue)
				if (!entry?.envelope) throw libraryError('NOT_FOUND', 'The blueprint is unavailable.')
				return run('rename', async function () {
					const envelope = format.create({
						id: entry.envelope.id,
						displayName,
						createdAt: entry.envelope.createdAt,
						defaultTransform: entry.envelope.defaultTransform,
						blueprint: entry.envelope.blueprint
					})
					const written = await handle.write({
						name: entry.name,
						data: format.serialize(envelope),
						expectedRevision: entry.revision
					})
					const desiredName = format.fileName(envelope.displayName, envelope.id)
					const info = desiredName === written.info.name
						? written.info
						: await handle.rename({ name: written.info.name, newName: desiredName, expectedRevision: written.info.revision })
					const currentOrigin = session.snapshot().origin
					if (currentOrigin?.id === envelope.id) session.markSaved(originFrom(envelope, info), 'library-renamed')
					await refreshInternal('rename-complete')
					return resolveActiveEntry({ id: envelope.id })
				})
			}

			async function duplicate(entryValue, displayName) {
				assertWritable()
				const entry = resolveActiveEntry(entryValue)
				if (!entry?.envelope) throw libraryError('NOT_FOUND', 'The blueprint is unavailable.')
				return run('duplicate', async function () {
					const envelope = format.create({
						displayName: displayName || entry.envelope.displayName,
						defaultTransform: entry.envelope.defaultTransform,
						blueprint: entry.envelope.blueprint
					})
					const name = format.fileName(envelope.displayName, envelope.id)
					await handle.write({ name, data: format.serialize(envelope) })
					await refreshInternal('duplicate-complete')
					return resolveActiveEntry({ id: envelope.id })
				})
			}

			async function pickImport(options) {
				const settings = options || {}
				return run('pick-import', async function () {
					const picked = await handle.pickImport({
						encoding: 'utf8',
						title: settings.title
					})
					if (picked?.canceled) return Object.freeze({ canceled: true })
					return prepareImportCandidate(picked.data, {
						source: 'file',
						fileName: picked.fileName,
						bytes: picked.bytes
					})
				})
			}

			async function prepareImportText(text, options) {
				const settings = options || {}
				return run('prepare-import-text', function () {
					return prepareImportCandidate(text, {
						source: settings.source || 'clipboard',
						fileName: settings.fileName || '',
						bytes: format.utf8Length(text)
					})
				})
			}

			function prepareImportCandidate(text, source) {
				const data = String(text ?? '')
				const bytes = Number(source?.bytes)
				const actualBytes = Number.isFinite(bytes) && bytes >= 0 ? bytes : format.utf8Length(data)
				const maxBytes = Math.min(16 * 1024 * 1024, Number(capabilities?.maxFileBytes) || 16 * 1024 * 1024)
				if (actualBytes > maxBytes) throw libraryError('TOO_LARGE', 'The imported blueprint exceeds the library file size limit.')
				if (!data.trim()) throw libraryError('CORRUPT', 'The imported blueprint is empty.')
				const envelope = format.parse(data)
				const conflict = active.find(function (entry) { return entry.envelope?.id === envelope.id }) || null
				return Object.freeze({
					canceled: false,
					source: String(source?.source || 'text'),
					fileName: String(source?.fileName || ''),
					bytes: actualBytes,
					envelope,
					metadata: format.metadata(envelope),
					conflict: conflict ? importConflict(conflict) : null
				})
			}

			async function commitImport(candidate, resolution) {
				if (!candidate?.envelope) throw libraryError('CORRUPT', 'The imported blueprint candidate is unavailable.')
				const choice = String(resolution || (candidate.conflict ? 'copy' : 'import'))
				if (choice === 'cancel') return Object.freeze({ canceled: true })
				assertWritable()
				if (!['import', 'copy', 'replace'].includes(choice)) throw libraryError('PATH_INVALID', 'The import resolution is invalid.')
				return run('commit-import-' + choice, async function () {
					const source = candidate.envelope
					let envelope
					let name
					let expectedRevision
					let replaced = false
					if (choice === 'replace') {
						const expected = candidate.conflict
						const current = expected && active.find(function (entry) { return entry.envelope?.id === source.id })
						if (!current || current.name !== expected.name || current.revision !== expected.revision) {
							await refreshInternal('import-conflict-refresh')
							throw libraryError('REVISION_CONFLICT', 'The existing blueprint changed before replacement was confirmed.')
						}
						envelope = format.create({
							id: current.envelope.id,
							displayName: source.displayName,
							createdAt: current.envelope.createdAt,
							defaultTransform: source.defaultTransform,
							blueprint: source.blueprint
						})
						name = current.name
						expectedRevision = current.revision
						replaced = true
					} else if (choice === 'copy') {
						envelope = format.create({
							displayName: source.displayName,
							defaultTransform: source.defaultTransform,
							blueprint: source.blueprint
						})
						name = format.fileName(envelope.displayName, envelope.id)
					} else {
						if (active.some(function (entry) { return entry.envelope?.id === source.id })) {
							throw libraryError('REVISION_CONFLICT', 'The imported blueprint now conflicts with an active blueprint.')
						}
						envelope = format.create({
							id: source.id,
							displayName: source.displayName,
							createdAt: source.createdAt,
							modifiedAt: source.modifiedAt,
							defaultTransform: source.defaultTransform,
							blueprint: source.blueprint
						})
						name = format.fileName(envelope.displayName, envelope.id)
					}
					let written
					try {
						written = await handle.write({ name, data: format.serialize(envelope), expectedRevision })
					} catch (writeError) {
						if (writeError?.code === 'REVISION_CONFLICT' || writeError?.code === 'NOT_FOUND') await refreshInternal('import-write-conflict-refresh')
						throw writeError
					}
					const desiredName = format.fileName(envelope.displayName, envelope.id)
					const info = desiredName === written.info.name
						? written.info
						: await handle.rename({ name: written.info.name, newName: desiredName, expectedRevision: written.info.revision })
					await refreshInternal('import-complete')
					return Object.freeze({
						canceled: false,
						replaced,
						entry: resolveActiveEntry({ id: envelope.id }) || freezeEntry({
							area: 'active', info, name: info.name, revision: info.revision,
							envelope, metadata: format.metadata(envelope)
						})
					})
				})
			}

			async function exportItem(entryValue, options) {
				const entry = resolveActiveEntry(entryValue)
				if (!entry?.envelope) throw libraryError('NOT_FOUND', 'The blueprint is unavailable or cannot be exported.')
				const settings = options || {}
				return run('export-item', async function () {
					const current = await readCanonicalEntry(entry)
					const data = format.serialize(current.envelope)
					return handle.exportItem({
						area: 'active',
						name: current.info.name,
						expectedRevision: current.info.revision,
						suggestedName: format.fileName(current.envelope.displayName, current.envelope.id),
						title: settings.title,
						data
					})
				})
			}

			async function shareText(entryValue) {
				const entry = resolveActiveEntry(entryValue)
				if (!entry?.envelope) throw libraryError('NOT_FOUND', 'The blueprint is unavailable or cannot be shared.')
				return run('share-text', async function () {
					const current = await readCanonicalEntry(entry)
					return Object.freeze({
						text: format.serialize(current.envelope),
						bytes: format.utf8Length(format.serialize(current.envelope)),
						fileName: format.fileName(current.envelope.displayName, current.envelope.id),
						envelope: current.envelope
					})
				})
			}

			async function readCanonicalEntry(entry) {
				const record = await handle.read({
					area: 'active', name: entry.name, expectedRevision: entry.revision, encoding: 'utf8'
				})
				return Object.freeze({ info: record.info, envelope: format.parse(record.data) })
			}

			function importConflict(entry) {
				return Object.freeze({
					id: entry.envelope.id,
					name: entry.name,
					revision: entry.revision,
					info: entry.info,
					envelope: entry.envelope,
					metadata: entry.metadata
				})
			}

			async function trashEntry(entryValue) {
				assertWritable()
				const entry = resolveActiveEntry(entryValue)
				if (!entry) throw libraryError('NOT_FOUND', 'The blueprint is unavailable.')
				return mutateAndRefresh('trash', function () {
					return handle.trash({ name: entry.name, expectedRevision: entry.revision })
				})
			}

			async function restore(entryValue) {
				assertWritable()
				const entry = resolveEntry(trash, entryValue)
				if (!entry) throw libraryError('NOT_FOUND', 'The trashed blueprint is unavailable.')
				const newName = entry.name
				return mutateAndRefresh('restore', function () {
					return handle.restore({ name: entry.name, newName, expectedRevision: entry.revision })
				})
			}

			async function quarantineEntry(entryValue) {
				const entry = resolveActiveEntry(entryValue)
				if (!entry) throw libraryError('NOT_FOUND', 'The blueprint is unavailable.')
				return mutateAndRefresh('quarantine', function () {
					return handle.quarantine({ name: entry.name, expectedRevision: entry.revision })
				})
			}

			async function removeEntry(entryValue) {
				assertWritable()
				const entry = resolveEntry(trash.concat(quarantine), entryValue)
				if (!entry || entry.area === 'active') throw libraryError('NOT_FOUND', 'The removable blueprint is unavailable.')
				return mutateAndRefresh('remove', function () {
					return handle.remove({ area: entry.area, name: entry.name, expectedRevision: entry.revision })
				})
			}

			async function retry(entryValue) {
				const entry = resolveActiveEntry(entryValue)
				if (!entry) throw libraryError('NOT_FOUND', 'The blueprint is unavailable.')
				return refresh('problem-retry')
			}

			function mutateAndRefresh(reason, operation) {
				return run(reason, async function () {
					const result = await operation()
					await refreshInternal(reason + '-complete')
					return result
				})
			}

			function writeBlockedReason() {
				const transactions = globalThis[TRANSACTIONS_KEY]
				if (!transactions || transactions.game !== game) return null
				if (typeof transactions.writeBlockedReason === 'function') return transactions.writeBlockedReason()
				return transactions.snapshot?.().terminalBlockedReason || null
			}

			function assertWritable() {
				const reason = writeBlockedReason()
				if (reason) throw libraryError(reason, 'Reload is required before blueprint library changes can continue.')
			}

			async function run(reason, operation) {
				if (disposed) throw libraryError('DISPOSED', 'The blueprint library is closed.')
				if (busy) throw libraryError('BUSY', 'The blueprint library is busy.')
				busy = true
				error = null
				notify(reason + '-started')
				try {
					const result = await operation()
					available = true
					return result
				} catch (operationError) {
					error = publicError(operationError)
					if (operationError?.code === 'NOT_READY') available = false
					throw operationError
				} finally {
					busy = false
					notify(reason + '-finished')
				}
			}

			function resolveActiveEntry(value) { return resolveEntry(active, value) }

			function currentDefaultTransform() {
				const state = transform.snapshot()
				return {
					rotation: Number(state?.rotation) || 0,
					mirrorU: state?.mirrorU === true,
					mirrorV: state?.mirrorV === true
				}
			}

			function resolveEntry(entries, value) {
				if (!value) return null
				const name = String(value.name || value.fileName || '')
				const id = String(value.id || value.envelope?.id || '')
				return entries.find(function (entry) {
					return (name && entry.name === name) || (id && entry.envelope?.id === id)
				}) || null
			}

			function dispose(reason) {
				if (disposed) return false
				disposed = true
				refreshToken += 1
				try { void watcher?.close?.() } catch (closeError) {}
				listeners.clear()
				if (globalThis[LIBRARY_KEY] === controller) delete globalThis[LIBRARY_KEY]
				console.info('[Cattail World Editor] Blueprint library disposed (' + String(reason || 'disposed') + ').')
				return true
			}
			return controller
		}

		function originFrom(envelope, info) {
			return Object.freeze({
				id: envelope.id,
				displayName: envelope.displayName,
				name: info.name,
				revision: info.revision
			})
		}

		function freezeEntry(value) {
			return Object.freeze(value)
		}

		function compareEntries(left, right) {
			const leftTime = Date.parse(left.envelope?.modifiedAt || '') || Number(left.info?.modifiedAt) || 0
			const rightTime = Date.parse(right.envelope?.modifiedAt || '') || Number(right.info?.modifiedAt) || 0
			return rightTime - leftTime || String(left.name).localeCompare(String(right.name))
		}

		function publicError(error) {
			return Object.freeze({
				code: String(error?.code || 'IO_FAILED'),
				message: String(error?.message || 'Blueprint library operation failed.')
			})
		}

		function libraryError(code, message) {
			const error = new Error(message)
			error.name = 'WorldEditorBlueprintLibraryError'
			error.code = code
			return error
		}
	}
})
