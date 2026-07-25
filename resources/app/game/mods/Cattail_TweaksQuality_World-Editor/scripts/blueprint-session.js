ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const INTERACTION_KEY = Symbol.for('cattail.world-editor.selection-interaction')
		const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
		const BLUEPRINT_KEY = Symbol.for('cattail.world-editor.blueprint')
		const TRANSFORM_KEY = Symbol.for('cattail.world-editor.blueprint-transform')
		const PREVIEW_KEY = Symbol.for('cattail.world-editor.blueprint-preview')
		const SHELL_ID = 'cattail-world-editor-shell'
		const SELECTION_CARD_ID = 'cattail-world-editor-selection-card'
		const CARD_ID = 'cattail-world-editor-blueprint-card'
		const STYLE_ID = 'cattail-world-editor-blueprint-style'
		const TEMPORARY_VISIBLE_MS = 3000
		const SCAN_CHUNK_SIZE = 1024
		const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'
		const ICON_ASSETS = Object.freeze({})
		let refreshMountedText = null

		api.on('afterWords', function (words, game) {
			if (typeof refreshMountedText === 'function') refreshMountedText(game)
		})

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const selection = globalThis[SELECTION_KEY]
			const i18n = globalThis[I18N_KEY]
			const transform = globalThis[TRANSFORM_KEY]
			const transformAvailable = !!(
				transform &&
				typeof transform.bind === 'function' &&
				typeof transform.clear === 'function' &&
				typeof transform.rotateClockwise === 'function' &&
				typeof transform.rotateCounterclockwise === 'function' &&
				typeof transform.mirrorU === 'function' &&
				typeof transform.mirrorV === 'function' &&
				typeof transform.reset === 'function' &&
				typeof transform.subscribe === 'function' &&
				typeof transform.snapshot === 'function'
			)
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Blueprint 3A could not find the editor runtime.')
				return
			}
			if (!selection || selection.game !== game || typeof selection.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Blueprint 3A could not find the selection state.')
				return
			}
			if (!i18n || typeof i18n.t !== 'function') {
				console.warn('[Cattail World Editor] Blueprint 3A could not find the editor translations.')
				return
			}

			const previous = globalThis[BLUEPRINT_KEY]
			if (previous && typeof previous.dispose === 'function') previous.dispose('blueprint-replaced')

			const session = createBlueprintSession(game, selection)
			Object.defineProperty(globalThis, BLUEPRINT_KEY, {
				value: session,
				configurable: true,
				writable: true
			})

			let currentRuntime = runtime.snapshot()
			let currentSelection = selection.snapshot()
			let currentSession = session.snapshot()
			if (transformAvailable) transform.clear('session-initialized')
			let currentTransform = transformAvailable
				? transform.snapshot()
				: Object.freeze({ source: null, blueprint: null, identity: true, revision: 0 })
			let currentPreview = null
			let previewController = null
			let stopPreviewSubscription = null
			let projectedDisplayResult = null
			let projectedDisplayBlueprint = null
			let projectedDisplayValue = null
			let ui = null
			let stopRenderFrame = null
			let gameHudHidden = false
			let vanillaHudHidden = false

			if (canMountUi()) {
				gameHudHidden = !!api.ui?.hud?.isHidden?.()
				vanillaHudHidden = !!api.ui?.isVanillaGameHudHidden?.(game)
				ui = mountUi()
				if (ui && api.render?.onFrame) {
					stopRenderFrame = api.render.onFrame(function (context) {
						connectPreviewController()
						syncCardPosition(context?.game || game)
					})
				}
			}

			const stopRuntimeSubscription = runtime.subscribe(function (state) {
				currentRuntime = state
				if (!state.active) session.cancelCapture('editor-inactive')
				refreshUi()
			})
			const stopSelectionSubscription = selection.subscribe(function (state) {
				currentSelection = state
				refreshUi()
			})
			const stopSessionSubscription = session.subscribe(function (state) {
				const previousAttempt = currentSession?.attemptId || 0
				const wasCapturing = !!currentSession?.capturing
				const previousBlueprint = currentSession?.blueprint
				currentSession = state
				if (transformAvailable && state.blueprint !== previousBlueprint) {
					if (state.blueprint) transform.bind(state.blueprint, 'session-blueprint')
					else transform.clear('session-blueprint-cleared')
				}
				if (ui && state.attemptId > previousAttempt) restartTemporaryWindow()
				if (ui && wasCapturing && !state.capturing) resumeTemporaryTimer()
				if (ui && !state.blueprint && !state.lastResult) {
					ui.pinned = false
					clearTemporaryWindow()
				}
				refreshUi()
			})
			const stopTransformSubscription = transformAvailable ? transform.subscribe(function (state) {
				currentTransform = state
				refreshTransformUi()
			}) : null

			const handleKeydown = function (event) {
				const key = String(event?.key || '').toLowerCase()
				if (
					!(event?.ctrlKey || event?.metaKey) ||
					event?.altKey ||
					event?.shiftKey ||
					!(event?.code === 'KeyC' || key === 'c') ||
					event?.repeat ||
					event?.isComposing ||
					event?.keyCode === 229 ||
					isEditableEvent(event) ||
					!runtime.isActive() ||
					game.splash?.isShown ||
					isModLoaderPanelBlocking() ||
					!canCapture(currentSelection)
				) {
					return
				}
				consume(event)
				captureFromUi('hotkey-copy')
			}

			const handleGameHud = function (event) {
				if (event?.detail?.game && event.detail.game !== game) return
				gameHudHidden = !!event?.detail?.hidden
				refreshUi()
			}
			const handleVanillaGameHud = function (event) {
				if (event?.detail?.game && event.detail.game !== game) return
				vanillaHudHidden = !!event?.detail?.hidden
				refreshUi()
			}

			if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
				window.addEventListener('keydown', handleKeydown, true)
				window.addEventListener('modloader:game-hud', handleGameHud)
				window.addEventListener('modloader:vanilla-game-hud', handleVanillaGameHud)
			}

			refreshMountedText = function (languageGame) {
				if (!ui) return
				refreshText(languageGame || game)
				refreshUi()
			}
			refreshUi()

			runtime.addCleanup(function () {
				if (refreshMountedText) refreshMountedText = null
				if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
					window.removeEventListener('keydown', handleKeydown, true)
					window.removeEventListener('modloader:game-hud', handleGameHud)
					window.removeEventListener('modloader:vanilla-game-hud', handleVanillaGameHud)
				}
				if (typeof stopRuntimeSubscription === 'function') stopRuntimeSubscription()
				if (typeof stopSelectionSubscription === 'function') stopSelectionSubscription()
				if (typeof stopSessionSubscription === 'function') stopSessionSubscription()
				if (typeof stopTransformSubscription === 'function') stopTransformSubscription()
				if (typeof stopPreviewSubscription === 'function') stopPreviewSubscription()
				if (typeof stopRenderFrame === 'function') stopRenderFrame()
				if (ui) unmountUi()
				if (transformAvailable) transform.clear('runtime-disposed')
				session.dispose('runtime-disposed')
			})

			console.info('[Cattail World Editor] Read-only blueprint session 3A ready.')

			function connectPreviewController() {
				const next = globalThis[PREVIEW_KEY]
				if (next === previewController) return
				if (typeof stopPreviewSubscription === 'function') stopPreviewSubscription()
				stopPreviewSubscription = null
				previewController = next && typeof next.snapshot === 'function' ? next : null
				currentPreview = previewController ? previewController.snapshot() : null
				if (previewController && typeof previewController.subscribe === 'function') {
					stopPreviewSubscription = previewController.subscribe(function (state) {
						const previousState = currentPreview
						currentPreview = state
						if (
							!previousState ||
							previousState.active !== state.active ||
							previousState.pinned !== state.pinned ||
							previousState.paused !== state.paused ||
							previousState.blueprint !== state.blueprint
						) {
							refreshTransformUi()
							syncCardPassThrough()
						}
					})
				}
				refreshTransformUi()
				syncCardPassThrough()
			}

			function createBlueprintSession(sessionGame, selectionState) {
				let mode = 'structure'
				let includeBlocks = false
				let blueprint = null
				let lastResult = null
				let revision = 0
				let attemptId = 0
				let captureToken = 0
				let capturing = false
				let disposed = false
				const listeners = new Set()

				function snapshot() {
					return Object.freeze({
						version: '0.3.2',
						mode,
						includeBlocks: mode === 'full' && includeBlocks,
						blueprint,
						lastResult,
						capturing,
						attemptId,
						revision,
						disposed
					})
				}

				function notify() {
					const current = snapshot()
					for (const listener of Array.from(listeners)) {
						try {
							listener(current)
						} catch (error) {
							console.warn('[Cattail World Editor] Blueprint listener failed.', error)
						}
					}
				}

				function publishResult(result, reason) {
					if (disposed) return false
					lastResult = result ? deepFreeze(jsonClone(result)) : null
					revision += 1
					notify()
					if (reason) console.info('[Cattail World Editor] Blueprint ' + reason + '.')
					return true
				}

				async function capture(reason) {
					if (disposed) return Object.freeze({ status: 'disposed' })
					const selectionSnapshot = selectionState.snapshot()
					if (!canCapture(selectionSnapshot)) {
						return Object.freeze({ status: 'unavailable' })
					}

					captureToken += 1
					const token = captureToken
					attemptId += 1
					const currentAttempt = attemptId
					capturing = true
					const source = captureSource(selectionSnapshot)
					publishResult({
						attemptId: currentAttempt,
						status: 'capturing',
						clipboard: 'pending',
						mode,
						includeBlocks: mode === 'full' && includeBlocks,
						sourcePlane: source.sourcePlane,
						anchor: source.anchor,
						summary: emptySummary(selectionSnapshot.selections.length),
						capturedTypes: [],
						skippedTypes: []
					}, 'capture-started')

					let candidate
					try {
						candidate = await buildBlueprint(
							selectionSnapshot,
							source,
							mode,
							mode === 'full' && includeBlocks,
							function () {
								return disposed || token !== captureToken
							}
						)
					} catch (error) {
						if (token !== captureToken || disposed) return Object.freeze({ status: 'cancelled' })
						capturing = false
						const failed = resultFromError(currentAttempt, source, mode, includeBlocks, error)
						publishResult(failed, 'capture-failed')
						return failed
					}

					if (token !== captureToken || disposed) return Object.freeze({ status: 'cancelled' })
					capturing = false
					if (!candidate || !candidate.blueprint) {
						const empty = deepFreeze({
							attemptId: currentAttempt,
							status: 'empty',
							clipboard: 'unchanged',
							mode,
							includeBlocks: mode === 'full' && includeBlocks,
							sourcePlane: source.sourcePlane,
							anchor: source.anchor,
							summary: candidate?.summary || emptySummary(selectionSnapshot.selections.length),
							capturedTypes: candidate?.capturedTypes || [],
							skippedTypes: candidate?.skippedTypes || []
						})
						publishResult(empty, 'capture-empty')
						return empty
					}

					const normalized = deepFreeze(jsonClone(candidate.blueprint))
					blueprint = normalized
					const pending = deepFreeze({
						attemptId: currentAttempt,
						status: 'captured',
						clipboard: 'pending',
						mode: normalized.mode,
						includeBlocks: normalized.includeBlocks,
						sourcePlane: normalized.sourcePlane,
						anchor: normalized.anchor.position,
						summary: normalized.summary,
						capturedTypes: normalized.summary.capturedTypes,
						skippedTypes: normalized.summary.skippedTypes
					})
					publishResult(pending, 'captured')

					let clipboard = 'ready'
					try {
						await writeClipboardText(JSON.stringify(normalized, null, 2))
					} catch (error) {
						clipboard = 'failed'
						console.warn('[Cattail World Editor] Blueprint clipboard write failed.', error)
					}
					if (token !== captureToken || disposed) return Object.freeze({ status: 'cancelled' })

					const complete = deepFreeze(Object.assign({}, pending, { clipboard }))
					publishResult(complete, clipboard === 'ready' ? 'clipboard-ready' : 'clipboard-failed')
					return complete
				}

				function cancelCapture(reason) {
					if (!capturing) return false
					captureToken += 1
					capturing = false
					revision += 1
					notify()
					if (reason) console.info('[Cattail World Editor] Blueprint capture cancelled (' + reason + ').')
					return true
				}

				const session = Object.freeze({
					version: '0.3.2',
					game: sessionGame,
					schemaVersion: 2,
					snapshot,
					setMode(nextMode, reason) {
						if (disposed || (nextMode !== 'structure' && nextMode !== 'full') || nextMode === mode) return false
						mode = nextMode
						if (mode === 'structure') includeBlocks = false
						revision += 1
						notify()
						if (reason) console.info('[Cattail World Editor] Blueprint mode ' + mode + ' (' + reason + ').')
						return true
					},
					setIncludeBlocks(next, reason) {
						if (disposed || mode !== 'full') return false
						next = !!next
						if (includeBlocks === next) return false
						includeBlocks = next
						revision += 1
						notify()
						if (reason) console.info('[Cattail World Editor] Blueprint blocks ' + (next ? 'enabled' : 'disabled') + ' (' + reason + ').')
						return true
					},
					capture,
					cancelCapture,
					clear(reason) {
						if (disposed || (!blueprint && !lastResult && !capturing)) return false
						cancelCapture(reason || 'cleared')
						blueprint = null
						lastResult = null
						revision += 1
						notify()
						return true
					},
					exportJSON() {
						return blueprint ? JSON.stringify(blueprint, null, 2) : ''
					},
					subscribe(listener) {
						if (typeof listener !== 'function') throw new TypeError('World Editor blueprint listener must be a function.')
						if (disposed) return function () {}
						listeners.add(listener)
						try {
							listener(snapshot())
						} catch (error) {
							console.warn('[Cattail World Editor] Blueprint listener failed.', error)
						}
						return function () {
							listeners.delete(listener)
						}
					},
					dispose(reason) {
						if (disposed) return false
						cancelCapture(reason || 'disposed')
						disposed = true
						blueprint = null
						lastResult = null
						listeners.clear()
						if (globalThis[BLUEPRINT_KEY] === session) delete globalThis[BLUEPRINT_KEY]
						return true
					}
				})

				return session
			}

			async function buildBlueprint(selectionState, source, captureMode, captureBlocks, isCancelled) {
				const ranges = normalizeSelections(selectionState.selections, source.sourcePlane, source.anchor)
				const uniqueCells = new Set()
				const foundEntities = new Set()
				let processed = 0

				for (const selectionEntry of ranges.absolute) {
					const range = selectionEntry.range
					for (let v = range.minV; v <= range.maxV; v += 1) {
						for (let u = range.minU; u <= range.maxU; u += 1) {
							if (isCancelled()) throw new Error('capture-cancelled')
							const key = u + ':' + v
							if (!uniqueCells.has(key)) {
								uniqueCells.add(key)
								let entity = null
								try {
									entity = typeof game.entityAtCoordinates === 'function'
										? game.entityAtCoordinates([u, v])
										: game.stuffMap?.['u' + u + 'v' + v] || null
								} catch (error) {}
								if (entity) foundEntities.add(entity)
							}
							processed += 1
							if (processed % SCAN_CHUNK_SIZE === 0) await yieldFrame()
						}
					}
				}

				const entityRecords = []
				const blockRecords = []
				const skipped = new Map()
				let crossBoundaryCount = 0
				let contentBounds = null
				for (const entity of foundEntities) {
					if (isCancelled()) throw new Error('capture-cancelled')
					const name = safeEntityName(entity)
					if (!name) {
						addTypeCount(skipped, 'unknown', 'unknown')
						continue
					}
					if (name === 'cube') {
						if (captureMode !== 'full' || !captureBlocks) continue
						if (Number(entity.state) !== 2) {
							addTypeCount(skipped, name, 'unstable')
							continue
						}
						const position = normalizePosition(entity.position)
						if (!position) {
							addTypeCount(skipped, name, 'invalid-position')
							continue
						}
						let saved
						try {
							saved = cloneEntitySave(game.getEntityString(entity))
						} catch (error) {
							addTypeCount(skipped, name, 'unserializable')
							continue
						}
						if (!saved) {
							addTypeCount(skipped, name, 'unserializable')
							continue
						}
						const relativePosition = subtract(position, source.anchor)
						blockRecords.push({
							kind: 'cube',
							name,
							position: relativePosition,
							state: saved.par
						})
						contentBounds = includePoint(contentBounds, position)
						continue
					}

					if (isModEntity(name)) {
						addTypeCount(skipped, name, 'mod')
						continue
					}
					const definition = game.codex?.entities?.[name]
					if (!definition || definition.canPurchase !== true) {
						addTypeCount(skipped, name, 'unsupported')
						continue
					}
					const position = normalizePosition(entity.position)
					if (!position) {
						addTypeCount(skipped, name, 'invalid-position')
						continue
					}
					const footprint = entityFootprint(entity, position)
					const crossed = footprintCrossesSelection(footprint, ranges.absolute)

					const record = {
						kind: 'entity',
						name,
						position: subtract(position, source.anchor),
						footprint: {
							span: footprint.span,
							min: subtract([footprint.minU, footprint.minV], source.anchor),
							max: subtract([footprint.maxU, footprint.maxV], source.anchor)
						},
						restricted: {
							onlyOne: definition.onlyone === true
						},
						config: {}
					}
					if (captureMode === 'full') {
						let saved
						try {
							saved = cloneEntitySave(game.getEntityString(entity))
						} catch (error) {
							addTypeCount(skipped, name, 'unserializable')
							continue
						}
						if (!saved) {
							addTypeCount(skipped, name, 'unserializable')
							continue
						}
						record.state = saved.par
					}
					entityRecords.push(record)
					if (crossed) crossBoundaryCount += 1
					contentBounds = includeBounds(contentBounds, footprint)
				}

				sortRecords(entityRecords)
				sortRecords(blockRecords)
				if (!entityRecords.length && !blockRecords.length) {
					return {
						blueprint: null,
						summary: createSummary(
							ranges.relative.length,
							uniqueCells.size,
							entityRecords,
							blockRecords,
							crossBoundaryCount,
							skipped
						),
						capturedTypes: [],
						skippedTypes: typeCounts(skipped)
					}
				}

				const summary = createSummary(
					ranges.relative.length,
					uniqueCells.size,
					entityRecords,
					blockRecords,
					crossBoundaryCount,
					skipped
				)
				return {
					blueprint: {
						schemaVersion: 2,
						mode: captureMode,
						sourcePlane: source.sourcePlane,
						anchor: {
							position: source.anchor,
							selectionIds: source.selectionIds
						},
						selections: ranges.relative,
						contentBounds: relativeBounds(contentBounds, source.anchor),
						includeBlocks: captureMode === 'full' && captureBlocks,
						entities: entityRecords,
						blocks: blockRecords,
						summary
					},
					summary,
					capturedTypes: summary.capturedTypes,
					skippedTypes: summary.skippedTypes
				}
			}

			function mountUi() {
				const shell = document.getElementById(SHELL_ID)
				const actions = shell?.querySelector?.('[data-world-editor-slot="actions"]')
				if (!shell || !actions) {
					console.warn('[Cattail World Editor] Blueprint 3A could not find the toolbar action slot.')
					return null
				}
				document.getElementById(CARD_ID)?.remove()
				actions.querySelector?.('[data-world-editor-blueprint-controls]')?.remove()
				const style = ensureStyle()
				const controls = createControls()
				const card = createCard()
				actions.append(controls.root)
				document.body.append(card)

				const mounted = {
					style,
					controls,
					card,
					pinned: false,
					positionVisible: false,
					temporaryVisible: false,
					temporaryRemaining: TEMPORARY_VISIBLE_MS,
					temporaryDeadline: 0,
					temporaryTimer: null,
					pointerPaused: false,
					releaseHud: null
				}

				controls.structure.addEventListener('click', handleStructureMode)
				controls.full.addEventListener('click', handleFullMode)
				controls.blocks.addEventListener('click', handleBlocksToggle)
				controls.copy.addEventListener('click', handleCopy)
				controls.transforms.addEventListener('click', handleTransformAction)
				card.addEventListener('mouseenter', handleCardMouseEnter)
				card.addEventListener('mouseleave', handleCardMouseLeave)
				card.addEventListener('mousedown', stopCardPointerDown)
				card.addEventListener('click', toggleCardPinned)
				card.addEventListener('keydown', handleCardKeydown)
				card.querySelector('[data-world-editor-blueprint-action="clear"]').addEventListener('click', handleClear)
				card.querySelector('[data-world-editor-transform-controls="card"]').addEventListener('click', handleTransformAction)

				if (api.ui?.hud?.register) {
					mounted.releaseHud = api.ui.hud.register({
						id: 'world-editor-blueprint-card',
						element: card,
						side: 'top'
					})
				}
				ui = mounted
				refreshText(game)
				drawNeutralCube(controls.blocks.querySelector('canvas'))
				return mounted
			}

			function unmountUi() {
				if (!ui) return
				clearTemporaryTimer()
				ui.controls.structure.removeEventListener('click', handleStructureMode)
				ui.controls.full.removeEventListener('click', handleFullMode)
				ui.controls.blocks.removeEventListener('click', handleBlocksToggle)
				ui.controls.copy.removeEventListener('click', handleCopy)
				ui.controls.transforms.removeEventListener('click', handleTransformAction)
				ui.card.removeEventListener('mouseenter', handleCardMouseEnter)
				ui.card.removeEventListener('mouseleave', handleCardMouseLeave)
				ui.card.removeEventListener('mousedown', stopCardPointerDown)
				ui.card.removeEventListener('click', toggleCardPinned)
				ui.card.removeEventListener('keydown', handleCardKeydown)
				ui.card.querySelector('[data-world-editor-blueprint-action="clear"]')?.removeEventListener('click', handleClear)
				ui.card.querySelector('[data-world-editor-transform-controls="card"]')?.removeEventListener('click', handleTransformAction)
				if (typeof ui.releaseHud === 'function') ui.releaseHud()
				ui.controls.root.remove()
				ui.card.remove()
				if (ui.style.isConnected && !document.getElementById(CARD_ID)) ui.style.remove()
				ui = null
			}

			function createControls() {
				const root = document.createElement('span')
				root.className = 'cattail-world-editor-blueprint-controls'
				root.dataset.worldEditorBlueprintControls = ''

				const modes = document.createElement('span')
				modes.className = 'cattail-world-editor-blueprint-modes'
				modes.setAttribute('role', 'group')
				const structure = createModeButton('structure')
				const full = createModeButton('full')
				modes.append(structure, full)
				full.hidden = true
				full.setAttribute('aria-hidden', 'true')

				const blocks = document.createElement('button')
				blocks.type = 'button'
				blocks.className = 'cattail-world-editor-blueprint-icon-button'
				blocks.dataset.worldEditorBlueprintAction = 'blocks'
				blocks.setAttribute('aria-pressed', 'false')
				blocks.hidden = true
				blocks.setAttribute('aria-hidden', 'true')
				const cubeCanvas = document.createElement('canvas')
				cubeCanvas.width = 24
				cubeCanvas.height = 24
				cubeCanvas.setAttribute('aria-hidden', 'true')
				blocks.append(cubeCanvas)

				const copy = document.createElement('button')
				copy.type = 'button'
				copy.className = 'cattail-world-editor-blueprint-icon-button'
				copy.dataset.worldEditorBlueprintAction = 'copy'
				const copyIcon = document.createElement('span')
				copyIcon.className = 'cattail-world-editor-blueprint-copy-icon'
				copyIcon.setAttribute('aria-hidden', 'true')
				copyIcon.textContent = '⧉'
				copy.append(copyIcon)

				const transforms = createTransformControls('toolbar')
				root.append(modes, blocks, copy, transforms)
				return { root, modes, structure, full, blocks, copy, transforms }
			}

			function createModeButton(mode) {
				const button = document.createElement('button')
				button.type = 'button'
				button.className = 'cattail-world-editor-blueprint-mode'
				button.dataset.worldEditorBlueprintMode = mode
				button.setAttribute('aria-pressed', mode === 'structure' ? 'true' : 'false')
				return button
			}

			function createCard() {
				const card = document.createElement('section')
				card.id = CARD_ID
				card.className = 'cattail-world-editor-blueprint-card'
				card.dataset.visible = 'false'
				card.dataset.positionVisible = 'false'
				card.dataset.theme = 'reality'
				card.dataset.pinned = 'false'
				card.dataset.inputPassThrough = 'false'
				card.setAttribute('role', 'region')
				card.setAttribute('tabindex', '0')
				card.setAttribute('aria-live', 'polite')
				card.setAttribute('aria-atomic', 'true')
				card.setAttribute('aria-hidden', 'true')

				const header = document.createElement('div')
				header.className = 'cattail-world-editor-blueprint-card__header'
				const heading = document.createElement('span')
				heading.className = 'cattail-world-editor-blueprint-card__title'
				heading.dataset.worldEditorBlueprintText = 'title'
				const source = document.createElement('span')
				source.className = 'cattail-world-editor-blueprint-card__source'
				source.dataset.worldEditorBlueprintText = 'source'
				const clear = document.createElement('button')
				clear.type = 'button'
				clear.className = 'cattail-world-editor-blueprint-card__clear'
				clear.dataset.worldEditorBlueprintAction = 'clear'
				const clearIcon = document.createElement('span')
				clearIcon.setAttribute('aria-hidden', 'true')
				clearIcon.textContent = '×'
				clear.append(clearIcon)
				header.append(heading, source, clear)

				const meta = document.createElement('div')
				meta.className = 'cattail-world-editor-blueprint-card__meta'
				const mode = document.createElement('span')
				mode.dataset.worldEditorBlueprintText = 'mode'
				const selections = document.createElement('span')
				selections.dataset.worldEditorBlueprintText = 'selections'
				const crossing = document.createElement('span')
				crossing.dataset.worldEditorBlueprintText = 'crossing'
				meta.append(mode, selections, crossing)

				const status = document.createElement('div')
				status.className = 'cattail-world-editor-blueprint-card__status'
				status.dataset.worldEditorBlueprintText = 'status'

				const transformPanel = document.createElement('div')
				transformPanel.className = 'cattail-world-editor-blueprint-card__transform'
				transformPanel.dataset.worldEditorTransformPanel = ''
				transformPanel.hidden = true
				const transformState = document.createElement('span')
				transformState.className = 'cattail-world-editor-blueprint-card__transform-state'
				transformState.dataset.worldEditorBlueprintText = 'transform-state'
				transformPanel.append(transformState, createTransformControls('card'))

				const captured = createTypeSection('captured')
				const skipped = createTypeSection('skipped')
				const hint = document.createElement('div')
				hint.className = 'cattail-world-editor-blueprint-card__hint'
				hint.dataset.worldEditorBlueprintText = 'hint'
				card.append(header, meta, status, transformPanel, captured.section, skipped.section, hint)
				return card
			}

			function createTransformControls(location) {
				const root = document.createElement('span')
				root.className = 'cattail-world-editor-transform-controls'
				root.dataset.worldEditorTransformControls = location
				root.hidden = true
				root.setAttribute('role', 'group')
				for (const action of ['rotate-clockwise', 'rotate-counterclockwise', 'mirror-u', 'mirror-v', 'reset']) {
					const button = document.createElement('button')
					button.type = 'button'
					button.className = 'cattail-world-editor-transform-button'
					button.dataset.worldEditorTransformAction = action
					button.append(createTransformIcon(action))
					if (action === 'mirror-u' || action === 'mirror-v') button.setAttribute('aria-pressed', 'false')
					root.append(button)
				}
				return root
			}

			function createTransformIcon(kind) {
				const icon = document.createElement('span')
				icon.className = 'cattail-world-editor-transform-icon'
				icon.dataset.icon = kind
				icon.setAttribute('aria-hidden', 'true')
				const asset = ICON_ASSETS[kind]
				if (asset) {
					const image = document.createElement('img')
					image.alt = ''
					image.src = asset
					image.addEventListener('error', function () {
						image.remove()
						delete icon.dataset.asset
					}, { once: true })
					icon.dataset.asset = 'true'
					icon.append(image)
				}
				if (kind === 'mirror-u' || kind === 'mirror-v') {
					const first = document.createElement('span')
					const second = document.createElement('span')
					first.className = 'cattail-world-editor-transform-icon__half cattail-world-editor-transform-icon__half--first'
					second.className = 'cattail-world-editor-transform-icon__half cattail-world-editor-transform-icon__half--second'
					icon.append(first, second)
				}
				return icon
			}

			function createTypeSection(kind) {
				const section = document.createElement('div')
				section.className = 'cattail-world-editor-blueprint-card__section'
				section.dataset.worldEditorBlueprintSection = kind
				const title = document.createElement('div')
				title.className = 'cattail-world-editor-blueprint-card__section-title'
				title.dataset.worldEditorBlueprintText = kind + '-title'
				const list = document.createElement('div')
				list.className = 'cattail-world-editor-blueprint-card__types'
				list.dataset.worldEditorBlueprintTypes = kind
				section.append(title, list)
				return { section, title, list }
			}

			function refreshUi() {
				if (!ui) return
				refreshToolbar()
				refreshCard()
				syncCardPosition(game)
			}

			function refreshToolbar() {
				const state = currentSession
				const captureAvailable = canCapture(currentSelection) && !!currentRuntime.active && !state.capturing
				ui.controls.structure.dataset.active = 'true'
				ui.controls.full.dataset.active = 'false'
				ui.controls.structure.setAttribute('aria-pressed', 'true')
				ui.controls.full.setAttribute('aria-pressed', 'false')
				ui.controls.full.hidden = true
				ui.controls.blocks.hidden = true
				ui.controls.blocks.disabled = true
				ui.controls.blocks.dataset.active = state.includeBlocks ? 'true' : 'false'
				ui.controls.blocks.setAttribute('aria-pressed', state.includeBlocks ? 'true' : 'false')
				ui.controls.copy.disabled = !captureAvailable
				refreshTransformUi()
			}

			function refreshText(languageGame) {
				if (!ui) return
				const source = languageGame || game
				const structureText = i18n.t(source, 'blueprintModeStructure')
				const fullText = i18n.t(source, 'blueprintModeFull')
				const blocksText = i18n.t(source, 'blueprintIncludeBlocks')
				const copyText = i18n.t(source, 'blueprintCopy')
				ui.controls.structure.textContent = structureText
				ui.controls.full.textContent = fullText
				ui.controls.structure.title = structureText
				ui.controls.full.title = fullText
				ui.controls.blocks.title = blocksText
				ui.controls.blocks.setAttribute('aria-label', blocksText)
				ui.controls.copy.title = copyText
				ui.controls.copy.setAttribute('aria-label', copyText)
				refreshTransformText(source)
				const clear = ui.card.querySelector('[data-world-editor-blueprint-action="clear"]')
				const clearText = i18n.t(source, 'blueprintClear')
				clear.title = clearText
				clear.setAttribute('aria-label', clearText)
				refreshCard()
			}

			function refreshCard() {
				if (!ui) return
				const result = displayResult()
				const hasDisplay = !!result
				setCardText('title', i18n.t(game, 'blueprintCardTitle'))
				if (!hasDisplay) {
					renderTypeList('captured', [])
					renderTypeList('skipped', [])
					refreshCardVisibility()
					return
				}

				setCardText('source', i18n.t(game, result.sourcePlane ? 'blueprintSourceVoid' : 'blueprintSourceReality'))
				setCardText('mode', i18n.t(game, result.mode === 'full' ? 'blueprintModeFull' : 'blueprintModeStructure'))
				setCardText('selections', formatTemplate(i18n.t(game, 'blueprintSelectionCount'), {
					count: result.summary?.selectionCount || 0
				}))
				setCardText('crossing', formatTemplate(i18n.t(game, 'blueprintCrossBoundaryCount'), {
					count: result.summary?.crossBoundaryCount || 0
				}))
				setCardText('captured-title', i18n.t(game, 'blueprintCapturedTypes'))
				setCardText('skipped-title', i18n.t(game, 'blueprintSkippedTypes'))
				setCardText('hint', i18n.t(game, ui.pinned ? 'cardUnpinAction' : 'cardPinAction'))
				setCardText('status', resultStatusText(result))
				renderTypeList('captured', result.capturedTypes || [])
				renderTypeList('skipped', result.skippedTypes || [])
				ui.card.querySelector('[data-world-editor-blueprint-action="clear"]').disabled = !currentSession.blueprint
				ui.card.dataset.pinned = ui.pinned ? 'true' : 'false'
				ui.card.setAttribute('aria-label', cardAriaLabel(result))
				refreshTransformUi()
				refreshCardVisibility()
			}

			function displayResult() {
				const result = currentSession.lastResult
				if (!result || result.mode !== 'full') return result
				const projectedBlueprint = currentTransform?.source === currentSession.blueprint
					? currentTransform.blueprint
					: null
				if (!projectedBlueprint || projectedBlueprint.mode !== 'structure') return null
				if (
					result === projectedDisplayResult &&
					projectedBlueprint === projectedDisplayBlueprint
				) {
					return projectedDisplayValue
				}
				const summary = projectedBlueprint.summary || result.summary
				projectedDisplayResult = result
				projectedDisplayBlueprint = projectedBlueprint
				projectedDisplayValue = Object.assign({}, result, {
					mode: 'structure',
					includeBlocks: false,
					summary,
					capturedTypes: summary?.capturedTypes || [],
					skippedTypes: summary?.skippedTypes || []
				})
				return projectedDisplayValue
			}

			function refreshTransformText(languageGame) {
				if (!ui) return
				const source = languageGame || game
				const labels = {
					'rotate-clockwise': i18n.t(source, 'blueprintRotateClockwise'),
					'rotate-counterclockwise': i18n.t(source, 'blueprintRotateCounterclockwise'),
					'mirror-u': i18n.t(source, 'blueprintMirrorU'),
					'mirror-v': i18n.t(source, 'blueprintMirrorV'),
					reset: i18n.t(source, 'blueprintResetTransform')
				}
				for (const button of ui.controls.root.querySelectorAll('[data-world-editor-transform-action]')) {
					const label = labels[button.dataset.worldEditorTransformAction] || ''
					button.title = label
					button.setAttribute('aria-label', label)
				}
				for (const button of ui.card.querySelectorAll('[data-world-editor-transform-action]')) {
					const label = labels[button.dataset.worldEditorTransformAction] || ''
					button.title = label
					button.setAttribute('aria-label', label)
				}
				refreshTransformUi()
			}

			function refreshTransformUi() {
				if (!ui) return
				const previewState = previewSnapshot()
				const available = !!(
					transformAvailable &&
					currentTransform?.blueprint?.mode === 'structure' &&
					previewState?.active &&
					!previewState.paused
				)
				const roots = [
					ui.controls.transforms,
					ui.card.querySelector('[data-world-editor-transform-controls="card"]')
				].filter(Boolean)
				for (const root of roots) {
					root.hidden = !available
					for (const button of root.querySelectorAll('[data-world-editor-transform-action]')) {
						const action = button.dataset.worldEditorTransformAction
						const active = action === 'mirror-u'
							? !!currentTransform.mirrorU
							: action === 'mirror-v'
								? !!currentTransform.mirrorV
								: false
						button.dataset.active = active ? 'true' : 'false'
						if (action === 'mirror-u' || action === 'mirror-v') {
							button.setAttribute('aria-pressed', active ? 'true' : 'false')
						}
						button.disabled = !available || (action === 'reset' && !!currentTransform.identity)
					}
				}
				const panel = ui.card.querySelector('[data-world-editor-transform-panel]')
				if (panel) panel.hidden = !available
				setCardText('transform-state', transformStateText())
			}

			function transformStateText() {
				const mirror = currentTransform?.mirrorU && currentTransform?.mirrorV
					? 'U + V'
					: currentTransform?.mirrorU
						? 'U'
						: currentTransform?.mirrorV
							? 'V'
							: i18n.t(game, 'blueprintTransformNone')
				return formatTemplate(i18n.t(game, 'blueprintTransformState'), {
					degrees: Number(currentTransform?.rotation) || 0,
					mirror
				})
			}

			function previewSnapshot() {
				if (currentPreview) return currentPreview
				try {
					return globalThis[PREVIEW_KEY]?.snapshot?.() || null
				} catch (error) {
					return null
				}
			}

			function resultStatusText(result) {
				if (result.status === 'capturing') return i18n.t(game, 'blueprintCapturing')
				if (result.status === 'empty') return i18n.t(game, 'blueprintNothingCaptured')
				if (result.clipboard === 'failed') return i18n.t(game, 'blueprintClipboardFailed')
				if (result.clipboard === 'pending') return i18n.t(game, 'blueprintClipboardWriting')
				return i18n.t(game, 'blueprintClipboardReady')
			}

			function cardAriaLabel(result) {
				const captured = (result.capturedTypes || []).map(function (type) {
					return localizedEntityName(type.name) + ' ' + type.count
				})
				const skipped = (result.skippedTypes || []).map(function (type) {
					return localizedEntityName(type.name) + ' ' + type.count
				})
				return [
					i18n.t(game, 'blueprintCardTitle'),
					resultStatusText(result),
					i18n.t(game, result.mode === 'full' ? 'blueprintModeFull' : 'blueprintModeStructure'),
					captured.join(', '),
					skipped.length ? i18n.t(game, 'blueprintSkippedTypes') + ' ' + skipped.join(', ') : '',
					i18n.t(game, ui.pinned ? 'cardUnpinAction' : 'cardPinAction')
				].filter(Boolean).join('. ')
			}

			function renderTypeList(kind, types) {
				const section = ui.card.querySelector('[data-world-editor-blueprint-section="' + kind + '"]')
				const list = ui.card.querySelector('[data-world-editor-blueprint-types="' + kind + '"]')
				const grouped = groupTypeRows(types)
				list.replaceChildren()
				section.hidden = !grouped.length
				for (const type of grouped) list.append(createTypeRow(type))
			}

			function groupTypeRows(types) {
				const grouped = new Map()
				for (const type of types || []) {
					const name = String(type?.name || 'unknown')
					grouped.set(name, (grouped.get(name) || 0) + Math.max(0, Number(type?.count) || 0))
				}
				return Array.from(grouped, function (entry) {
					return { name: entry[0], count: entry[1] }
				})
			}

			function createTypeRow(type) {
				const row = document.createElement('div')
				row.className = 'cattail-world-editor-blueprint-card__type'
				const icon = document.createElement('span')
				icon.className = 'cattail-world-editor-blueprint-card__type-icon'
				if (type.name === 'cube') {
					const canvas = document.createElement('canvas')
					canvas.width = 32
					canvas.height = 32
					canvas.setAttribute('aria-hidden', 'true')
					const sample = currentSession.blueprint?.blocks?.find?.(function (block) {
						return block.name === 'cube'
					})
					drawCubeThumbnail(canvas, sample?.state?.resources)
					icon.append(canvas)
				} else {
					icon.append(createEntityIcon(type.name))
				}
				const name = document.createElement('span')
				name.className = 'cattail-world-editor-blueprint-card__type-name'
				name.textContent = localizedEntityName(type.name)
				const count = document.createElement('span')
				count.className = 'cattail-world-editor-blueprint-card__type-count'
				count.textContent = '×' + String(type.count)
				row.append(icon, name, count)
				return row
			}

			function createEntityIcon(name) {
				const shopItem = game.shop?.items?.find?.(function (item) {
					return item?.name === name
				})
				const source = shopItem?.html?.querySelector?.('.imageVessel img')
				const image = document.createElement('img')
				image.alt = ''
				image.src = source?.currentSrc || source?.src || source?.getAttribute?.('src') || resolveEntityIcon(name)
				image.addEventListener('error', function () {
					const canvas = document.createElement('canvas')
					canvas.width = 32
					canvas.height = 32
					canvas.setAttribute('aria-hidden', 'true')
					drawNeutralBuilding(canvas)
					image.replaceWith(canvas)
				}, { once: true })
				return image
			}

			function resolveEntityIcon(name) {
				const path = game.codex?.entities?.[name]?.shopImage || 'img/shop/' + name + '.jpg'
				try {
					return globalThis.ModLoader?.resolveAsset?.(path) || path
				} catch (error) {
					return path
				}
			}

			function localizedEntityName(name) {
				if (name === 'cube') return i18n.t(game, 'blueprintCube')
				try {
					const pronounced = game.pronounce?.('entities', name, 'name')
					if (pronounced && pronounced !== name) return String(pronounced)
				} catch (error) {}
				const shopItem = game.shop?.items?.find?.(function (item) {
					return item?.name === name
				})
				return String(shopItem?.html?.querySelector?.('.itemHeader')?.textContent || name || 'unknown')
			}

			function refreshCardVisibility() {
				if (!ui) return
				const result = displayResult()
				const onSourcePlane = !!result && Number(result.sourcePlane) === (game.plane ? 1 : 0)
				const displayWindow = ui.pinned || ui.temporaryVisible || currentSession.capturing
				const visible = (
					!!currentRuntime.active &&
					!!result &&
					onSourcePlane &&
					displayWindow &&
					!game.halt &&
					!game.splash?.isShown &&
					!vanillaHudHidden
				)
				ui.card.dataset.visible = visible ? 'true' : 'false'
				ui.card.dataset.positionVisible = ui.positionVisible ? 'true' : 'false'
				ui.card.setAttribute('aria-hidden', visible && ui.positionVisible && !gameHudHidden ? 'false' : 'true')
				syncCardPassThrough()
			}

			function syncCardPassThrough() {
				if (!ui) return
				let interacting = !!currentSelection?.previewRange
				try {
					const gestureType = globalThis[INTERACTION_KEY]?.snapshot?.().gestureType
					interacting = interacting || !!gestureType
				} catch (error) {}
				const previewState = previewSnapshot()
				interacting = interacting || !!(previewState?.active && !previewState.pinned)
				ui.card.dataset.inputPassThrough = interacting ? 'true' : 'false'
			}

			function syncCardPosition(frameGame) {
				if (!ui || (frameGame && frameGame !== game)) return
				syncCardPassThrough()
				ui.card.dataset.theme = game.plane ? 'void' : 'reality'
				if (typeof api.render?.isEnabled === 'function' && !api.render.isEnabled()) {
					ui.positionVisible = false
					refreshCardVisibility()
					return
				}
				const result = displayResult()
				const bounds = result?.anchor ? projectAnchorBounds(game, result.anchor) : null
				if (!bounds) {
					ui.positionVisible = false
					refreshCardVisibility()
					return
				}
				const viewportWidth = finiteOr(window.innerWidth, document.documentElement?.clientWidth || 0)
				const viewportHeight = finiteOr(window.innerHeight, document.documentElement?.clientHeight || 0)
				if (
					viewportWidth <= 0 ||
					viewportHeight <= 0 ||
					bounds.maxX < 0 ||
					bounds.minX > viewportWidth ||
					bounds.maxY < 0 ||
					bounds.minY > viewportHeight
				) {
					ui.positionVisible = false
					refreshCardVisibility()
					return
				}

				const margin = 10
				const gap = 28
				const cardRect = ui.card.getBoundingClientRect()
				const width = finitePositive(cardRect.width, finitePositive(ui.card.offsetWidth, 324))
				const height = finitePositive(cardRect.height, finitePositive(ui.card.offsetHeight, 280))
				const centerX = (bounds.minX + bounds.maxX) / 2
				const candidates = [
					{ left: centerX - width / 2, top: bounds.maxY + gap, placement: 'below' },
					{ left: centerX - width / 2, top: bounds.minY - gap - height, placement: 'above' },
					{ left: bounds.maxX + gap, top: (bounds.minY + bounds.maxY - height) / 2, placement: 'right' },
					{ left: bounds.minX - gap - width, top: (bounds.minY + bounds.maxY - height) / 2, placement: 'left' }
				]
				const selectionRect = visibleRect(document.getElementById(SELECTION_CARD_ID))
				let chosen = null
				for (const candidate of candidates) {
					const normalized = {
						left: clamp(candidate.left, margin, Math.max(margin, viewportWidth - margin - width)),
						top: clamp(candidate.top, margin, Math.max(margin, viewportHeight - margin - height)),
						width,
						height,
						placement: candidate.placement
					}
					if (!selectionRect || !rectanglesOverlap(normalized, selectionRect, 8)) {
						chosen = normalized
						break
					}
				}
				chosen = chosen || {
					left: clamp(candidates[0].left, margin, Math.max(margin, viewportWidth - margin - width)),
					top: clamp(candidates[0].top, margin, Math.max(margin, viewportHeight - margin - height)),
					width,
					height,
					placement: 'below'
				}
				ui.card.style.left = chosen.left + 'px'
				ui.card.style.top = chosen.top + 'px'
				ui.card.dataset.placement = chosen.placement
				ui.positionVisible = true
				refreshCardVisibility()
			}

			function handleStructureMode(event) {
				stopUiEvent(event)
				session.setMode('structure', 'toolbar')
			}

			function handleFullMode(event) {
				stopUiEvent(event)
				session.setMode('full', 'toolbar')
			}

			function handleBlocksToggle(event) {
				stopUiEvent(event)
				session.setIncludeBlocks(!currentSession.includeBlocks, 'toolbar')
			}

			function handleCopy(event) {
				stopUiEvent(event)
				if (!canCapture(currentSelection)) return
				captureFromUi('toolbar-copy')
			}

			function captureFromUi(reason) {
				if (currentSession.mode !== 'structure') session.setMode('structure', reason + '-structure')
				return session.capture(reason)
			}

			function handleTransformAction(event) {
				const button = event?.target?.closest?.('[data-world-editor-transform-action]')
				if (!button || button.disabled || !transformAvailable) return
				stopUiEvent(event)
				const action = button.dataset.worldEditorTransformAction
				if (action === 'rotate-clockwise') transform.rotateClockwise('ui-rotate-clockwise')
				else if (action === 'rotate-counterclockwise') transform.rotateCounterclockwise('ui-rotate-counterclockwise')
				else if (action === 'mirror-u') transform.mirrorU('ui-mirror-u')
				else if (action === 'mirror-v') transform.mirrorV('ui-mirror-v')
				else if (action === 'reset') transform.reset('ui-reset')
			}

			function handleClear(event) {
				stopUiEvent(event)
				ui.pinned = false
				session.clear('card-clear')
			}

			function handleCardMouseEnter() {
				if (!ui) return
				ui.pointerPaused = true
				pauseTemporaryTimer()
			}

			function handleCardMouseLeave() {
				if (!ui) return
				ui.pointerPaused = false
				resumeTemporaryTimer()
			}

			function toggleCardPinned(event) {
				if (!ui || event?.target?.closest?.('button')) return
				stopUiEvent(event)
				ui.pinned = !ui.pinned
				if (ui.pinned) pauseTemporaryTimer()
				else restartTemporaryWindow()
				refreshCard()
			}

			function handleCardKeydown(event) {
				if (event?.key !== 'Enter' && event?.key !== ' ') return
				toggleCardPinned(event)
			}

			function stopCardPointerDown(event) {
				event?.stopPropagation?.()
				event?.stopImmediatePropagation?.()
			}

			function restartTemporaryWindow() {
				if (!ui) return
				clearTemporaryTimer()
				ui.temporaryVisible = !!currentSession.lastResult
				ui.temporaryRemaining = TEMPORARY_VISIBLE_MS
				refreshCardVisibility()
				resumeTemporaryTimer()
			}

			function clearTemporaryWindow() {
				if (!ui) return
				clearTemporaryTimer()
				ui.temporaryVisible = false
				ui.temporaryRemaining = TEMPORARY_VISIBLE_MS
				refreshCardVisibility()
			}

			function clearTemporaryTimer() {
				if (!ui || ui.temporaryTimer === null) return
				globalThis.clearTimeout?.(ui.temporaryTimer)
				ui.temporaryTimer = null
				ui.temporaryDeadline = 0
			}

			function pauseTemporaryTimer() {
				if (!ui) return
				if (ui.temporaryTimer !== null && ui.temporaryDeadline > 0) {
					ui.temporaryRemaining = Math.max(0, ui.temporaryDeadline - Date.now())
				}
				clearTemporaryTimer()
			}

			function resumeTemporaryTimer() {
				if (
					!ui ||
					!ui.temporaryVisible ||
					ui.pinned ||
					ui.pointerPaused ||
					currentSession.capturing ||
					currentSelection?.previewRange
				) {
					return
				}
				clearTemporaryTimer()
				if (ui.temporaryRemaining <= 0) {
					ui.temporaryVisible = false
					refreshCardVisibility()
					return
				}
				ui.temporaryDeadline = Date.now() + ui.temporaryRemaining
				ui.temporaryTimer = globalThis.setTimeout?.(function () {
					if (!ui) return
					ui.temporaryTimer = null
					ui.temporaryDeadline = 0
					ui.temporaryRemaining = 0
					ui.temporaryVisible = false
					refreshCardVisibility()
				}, ui.temporaryRemaining) ?? null
			}

			function setCardText(key, value) {
				const element = ui?.card?.querySelector?.('[data-world-editor-blueprint-text="' + key + '"]')
				if (element) element.textContent = String(value ?? '')
			}

			function ensureStyle() {
				const existing = document.getElementById(STYLE_ID)
				if (existing) return existing
				const style = document.createElement('style')
				style.id = STYLE_ID
				style.textContent = `
					.cattail-world-editor-blueprint-controls {
						display: inline-flex;
						align-items: center;
						flex-wrap: nowrap;
						gap: 6px;
						font-family: Montserrat, Arial, sans-serif;
					}
					.cattail-world-editor-blueprint-controls [hidden],
					.cattail-world-editor-transform-controls[hidden],
					.cattail-world-editor-blueprint-card__transform[hidden] {
						display: none !important;
					}
					.cattail-world-editor-blueprint-modes {
						display: inline-grid;
						grid-template-columns: minmax(0, 1fr);
						height: 30px;
						border: 1px solid var(--world-editor-shell-border);
						border-radius: 6px;
						overflow: hidden;
					}
					.cattail-world-editor-blueprint-mode,
					.cattail-world-editor-blueprint-icon-button,
					.cattail-world-editor-transform-button {
						box-sizing: border-box;
						height: 30px;
						min-height: 30px;
						border: 0;
						background: var(--world-editor-shell-chip);
						color: var(--world-editor-shell-muted);
						font: 600 11px/1.2 Montserrat, Arial, sans-serif;
						cursor: pointer;
						transition: background .12s ease, color .12s ease, opacity .12s ease;
					}
					.cattail-world-editor-blueprint-mode {
						min-width: 54px;
						padding: 4px 8px;
						border-right: 1px solid var(--world-editor-shell-border);
					}
					.cattail-world-editor-blueprint-mode:last-child {
						border-right: 0;
					}
					.cattail-world-editor-blueprint-mode[data-active="true"],
					.cattail-world-editor-blueprint-icon-button[data-active="true"] {
						background: var(--world-editor-shell-active);
						color: var(--world-editor-shell-text);
					}
					.cattail-world-editor-blueprint-icon-button {
						display: inline-grid;
						width: 30px;
						min-width: 30px;
						place-items: center;
						border: 1px solid var(--world-editor-shell-border);
						border-radius: 6px;
					}
					.cattail-world-editor-blueprint-icon-button canvas {
						width: 24px;
						height: 24px;
					}
					.cattail-world-editor-blueprint-copy-icon {
						font-size: 20px;
						line-height: 1;
					}
					.cattail-world-editor-transform-controls {
						display: inline-flex;
						align-items: center;
						flex: none;
						flex-wrap: nowrap;
						gap: 4px;
					}
					.cattail-world-editor-transform-button {
						display: inline-grid;
						width: 30px;
						min-width: 30px;
						padding: 0;
						place-items: center;
						border: 1px solid var(--world-editor-shell-border);
						border-radius: 6px;
					}
					.cattail-world-editor-transform-button[data-active="true"] {
						border-color: var(--world-editor-shell-active-border);
						background: var(--world-editor-shell-active);
						color: var(--world-editor-shell-text);
					}
					.cattail-world-editor-transform-icon {
						position: relative;
						display: block;
						width: 18px;
						height: 18px;
						color: currentColor;
					}
					.cattail-world-editor-transform-icon img {
						display: block;
						width: 18px;
						height: 18px;
						object-fit: contain;
					}
					.cattail-world-editor-transform-icon[data-icon="rotate-clockwise"]::before,
					.cattail-world-editor-transform-icon[data-icon="rotate-counterclockwise"]::before,
					.cattail-world-editor-transform-icon[data-icon="reset"]::before {
						content: "";
						position: absolute;
						inset: 2px;
						box-sizing: border-box;
						border: 2px solid currentColor;
						border-left-color: transparent;
						border-radius: 50%;
					}
					.cattail-world-editor-transform-icon[data-icon="rotate-clockwise"]::after,
					.cattail-world-editor-transform-icon[data-icon="rotate-counterclockwise"]::after,
					.cattail-world-editor-transform-icon[data-icon="reset"]::after {
						content: "";
						position: absolute;
						right: 0;
						top: 1px;
						width: 0;
						height: 0;
						border-top: 4px solid transparent;
						border-bottom: 4px solid transparent;
						border-left: 5px solid currentColor;
						transform: rotate(-25deg);
					}
					.cattail-world-editor-transform-icon[data-icon="rotate-counterclockwise"] {
						transform: scaleX(-1);
					}
					.cattail-world-editor-transform-icon[data-icon="reset"]::before {
						inset: 3px;
						border-width: 2px;
					}
					.cattail-world-editor-transform-icon[data-icon="reset"]::after {
						right: 1px;
						top: 2px;
					}
					.cattail-world-editor-transform-icon[data-icon="mirror-u"]::before,
					.cattail-world-editor-transform-icon[data-icon="mirror-v"]::before {
						content: "";
						position: absolute;
						background: currentColor;
						opacity: .72;
					}
					.cattail-world-editor-transform-icon[data-icon="mirror-u"]::before {
						left: 1px;
						right: 1px;
						top: 8px;
						height: 2px;
					}
					.cattail-world-editor-transform-icon[data-icon="mirror-v"]::before {
						top: 1px;
						bottom: 1px;
						left: 8px;
						width: 2px;
					}
					.cattail-world-editor-transform-icon__half {
						position: absolute;
						box-sizing: border-box;
						width: 6px;
						height: 6px;
						border: solid currentColor;
					}
					.cattail-world-editor-transform-icon[data-icon="mirror-u"] .cattail-world-editor-transform-icon__half {
						left: 6px;
						border-width: 0 2px 2px 0;
					}
					.cattail-world-editor-transform-icon[data-icon="mirror-u"] .cattail-world-editor-transform-icon__half--first {
						top: 1px;
						transform: rotate(45deg);
					}
					.cattail-world-editor-transform-icon[data-icon="mirror-u"] .cattail-world-editor-transform-icon__half--second {
						bottom: 1px;
						transform: rotate(225deg);
					}
					.cattail-world-editor-transform-icon[data-icon="mirror-v"] .cattail-world-editor-transform-icon__half {
						top: 6px;
						border-width: 0 2px 2px 0;
					}
					.cattail-world-editor-transform-icon[data-icon="mirror-v"] .cattail-world-editor-transform-icon__half--first {
						left: 1px;
						transform: rotate(-45deg);
					}
					.cattail-world-editor-transform-icon[data-icon="mirror-v"] .cattail-world-editor-transform-icon__half--second {
						right: 1px;
						transform: rotate(135deg);
					}
					.cattail-world-editor-transform-icon[data-asset="true"]::before,
					.cattail-world-editor-transform-icon[data-asset="true"]::after,
					.cattail-world-editor-transform-icon[data-asset="true"] .cattail-world-editor-transform-icon__half {
						display: none;
					}
					.cattail-world-editor-blueprint-mode:hover:not(:disabled),
					.cattail-world-editor-blueprint-icon-button:hover:not(:disabled),
					.cattail-world-editor-transform-button:hover:not(:disabled) {
						color: var(--world-editor-shell-text);
					}
					.cattail-world-editor-blueprint-mode:focus-visible,
					.cattail-world-editor-blueprint-icon-button:focus-visible,
					.cattail-world-editor-transform-button:focus-visible {
						outline: 2px solid var(--world-editor-shell-active-border);
						outline-offset: 2px;
					}
					.cattail-world-editor-blueprint-mode:disabled,
					.cattail-world-editor-blueprint-icon-button:disabled,
					.cattail-world-editor-transform-button:disabled {
						opacity: .36;
						cursor: default;
					}
					.cattail-world-editor-blueprint-card {
						--blueprint-card-bg: rgba(248, 248, 246, .94);
						--blueprint-card-text: rgba(18, 20, 22, .94);
						--blueprint-card-muted: rgba(18, 20, 22, .58);
						--blueprint-card-border: rgba(92, 65, 132, .24);
						--blueprint-card-track: rgba(92, 65, 132, .09);
						--blueprint-card-accent: rgba(113, 79, 163, .88);
						position: fixed;
						z-index: 49;
						width: min(324px, calc(100vw - 20px));
						max-height: min(520px, calc(100vh - 20px));
						box-sizing: border-box;
						padding: 12px;
						overflow: hidden;
						border: 1px solid var(--blueprint-card-border);
						border-radius: 8px;
						background: var(--blueprint-card-bg);
						box-shadow: 0 10px 28px rgba(0, 0, 0, .22);
						backdrop-filter: blur(14px) saturate(1.1);
						-webkit-backdrop-filter: blur(14px) saturate(1.1);
						color: var(--blueprint-card-text);
						font: 400 12px/1.35 Montserrat, Arial, sans-serif;
						letter-spacing: 0;
						visibility: hidden;
						opacity: 0;
						transform: translateY(4px);
						pointer-events: none;
						transition: opacity .16s ease, transform .16s ease, visibility 0s linear .16s;
					}
					.cattail-world-editor-blueprint-card[data-theme="void"] {
						--blueprint-card-bg: rgba(8, 10, 12, .94);
						--blueprint-card-text: rgba(255, 255, 255, .92);
						--blueprint-card-muted: rgba(255, 255, 255, .62);
						--blueprint-card-border: rgba(210, 188, 250, .28);
						--blueprint-card-track: rgba(255, 255, 255, .08);
						--blueprint-card-accent: rgba(210, 188, 250, .9);
					}
					.cattail-world-editor-blueprint-card[data-visible="true"][data-position-visible="true"] {
						visibility: visible;
						opacity: 1;
						transform: translateY(0);
						pointer-events: auto;
						transition-delay: 0s;
					}
					.cattail-world-editor-blueprint-card[data-visible="true"][data-position-visible="true"][data-input-pass-through="true"] {
						pointer-events: none;
					}
					.cattail-world-editor-blueprint-card[data-pinned="true"] {
						border-color: rgba(166, 242, 70, .82);
						box-shadow: 0 10px 28px rgba(0, 0, 0, .24), 0 0 16px rgba(166, 242, 70, .36);
					}
					.cattail-world-editor-blueprint-card:focus-visible {
						outline: 2px solid var(--blueprint-card-accent);
						outline-offset: 3px;
					}
					.cattail-world-editor-blueprint-card__header {
						display: grid;
						grid-template-columns: minmax(0, 1fr) auto 24px;
						align-items: center;
						gap: 8px;
					}
					.cattail-world-editor-blueprint-card__title {
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
						font-size: 14px;
						font-weight: 700;
					}
					.cattail-world-editor-blueprint-card__source {
						color: var(--blueprint-card-muted);
						font-size: 10px;
						white-space: nowrap;
					}
					.cattail-world-editor-blueprint-card__clear {
						display: grid;
						width: 24px;
						height: 24px;
						padding: 0;
						place-items: center;
						border: 1px solid var(--blueprint-card-border);
						border-radius: 5px;
						background: var(--blueprint-card-track);
						color: var(--blueprint-card-muted);
						font: 600 18px/1 Montserrat, Arial, sans-serif;
						cursor: pointer;
					}
					.cattail-world-editor-blueprint-card__clear:disabled {
						opacity: .35;
						cursor: default;
					}
					.cattail-world-editor-blueprint-card__meta {
						display: grid;
						grid-template-columns: repeat(3, minmax(0, 1fr));
						gap: 5px;
						margin-top: 8px;
					}
					.cattail-world-editor-blueprint-card__meta span {
						min-width: 0;
						padding: 4px 5px;
						overflow: hidden;
						border-radius: 5px;
						background: var(--blueprint-card-track);
						text-align: center;
						text-overflow: ellipsis;
						white-space: nowrap;
						font-size: 10px;
						font-weight: 600;
					}
					.cattail-world-editor-blueprint-card__status {
						min-height: 16px;
						margin-top: 7px;
						color: var(--blueprint-card-muted);
						text-align: center;
						font-size: 10px;
					}
					.cattail-world-editor-blueprint-card__transform {
						display: flex;
						align-items: center;
						justify-content: space-between;
						gap: 8px;
						margin-top: 8px;
					}
					.cattail-world-editor-blueprint-card__transform-state {
						min-width: 0;
						color: var(--blueprint-card-muted);
						font-size: 10px;
						font-weight: 600;
						overflow-wrap: anywhere;
					}
					.cattail-world-editor-blueprint-card .cattail-world-editor-transform-button {
						border-color: var(--blueprint-card-border);
						background: var(--blueprint-card-track);
						color: var(--blueprint-card-muted);
					}
					.cattail-world-editor-blueprint-card .cattail-world-editor-transform-button[data-active="true"] {
						border-color: var(--blueprint-card-accent);
						color: var(--blueprint-card-text);
					}
					.cattail-world-editor-blueprint-card__section {
						margin-top: 8px;
					}
					.cattail-world-editor-blueprint-card__section[hidden] {
						display: none;
					}
					.cattail-world-editor-blueprint-card__section-title {
						margin-bottom: 4px;
						color: var(--blueprint-card-muted);
						font-size: 10px;
						font-weight: 700;
					}
					.cattail-world-editor-blueprint-card__types {
						max-height: 240px;
						overflow-x: hidden;
						overflow-y: auto;
						overscroll-behavior: contain;
						scrollbar-width: thin;
					}
					.cattail-world-editor-blueprint-card__type {
						display: grid;
						grid-template-columns: 32px minmax(0, 1fr) auto;
						align-items: center;
						min-height: 30px;
						gap: 7px;
						padding: 2px 4px;
						border-top: 1px solid var(--blueprint-card-track);
					}
					.cattail-world-editor-blueprint-card__type:first-child {
						border-top: 0;
					}
					.cattail-world-editor-blueprint-card__type-icon {
						display: grid;
						width: 32px;
						height: 28px;
						place-items: center;
						overflow: hidden;
					}
					.cattail-world-editor-blueprint-card__type-icon img,
					.cattail-world-editor-blueprint-card__type-icon canvas {
						display: block;
						width: 32px;
						height: 28px;
						object-fit: contain;
					}
					.cattail-world-editor-blueprint-card__type-name {
						min-width: 0;
						overflow-wrap: anywhere;
						font-size: 11px;
						font-weight: 600;
					}
					.cattail-world-editor-blueprint-card__type-count {
						color: var(--blueprint-card-muted);
						font-variant-numeric: tabular-nums;
						font-weight: 700;
					}
					.cattail-world-editor-blueprint-card__hint {
						margin-top: 7px;
						color: var(--blueprint-card-muted);
						text-align: center;
						font-size: 10px;
					}
					@media (max-width: 680px) {
						.cattail-world-editor-shell__bar {
							flex-wrap: wrap;
							justify-content: center;
						}
						.cattail-world-editor-blueprint-controls {
							order: 3;
						}
						.cattail-world-editor-blueprint-mode {
							min-width: 48px;
							padding-inline: 6px;
						}
					}
				`
				document.head.append(style)
				return style
			}

			function drawCubeThumbnail(canvas, resources) {
				const context = canvas?.getContext?.('2d')
				if (!context) return
				context.clearRect(0, 0, canvas.width, canvas.height)
				const colors = cubeColors(resources)
				drawIsometricCube(context, canvas.width, canvas.height, colors)
			}

			function drawNeutralCube(canvas) {
				const context = canvas?.getContext?.('2d')
				if (!context) return
				context.clearRect(0, 0, canvas.width, canvas.height)
				drawIsometricCube(context, canvas.width, canvas.height, ['#edf1f2', '#aebbc0', '#78898f'])
			}

			function drawNeutralBuilding(canvas) {
				const context = canvas?.getContext?.('2d')
				if (!context) return
				context.clearRect(0, 0, canvas.width, canvas.height)
				context.fillStyle = '#aebbc0'
				context.fillRect(7, 11, 18, 15)
				context.fillStyle = '#edf1f2'
				context.beginPath()
				context.moveTo(5, 12)
				context.lineTo(16, 4)
				context.lineTo(27, 12)
				context.closePath()
				context.fill()
				context.fillStyle = '#78898f'
				context.fillRect(14, 18, 5, 8)
			}

			function drawIsometricCube(context, width, height, colors) {
				const cx = width / 2
				const top = Math.max(2, height * .12)
				const middle = height * .42
				const bottom = height * .88
				const left = width * .16
				const right = width * .84
				context.strokeStyle = 'rgba(20, 24, 28, .32)'
				context.lineWidth = 1
				context.fillStyle = colors[0]
				context.beginPath()
				context.moveTo(cx, top)
				context.lineTo(right, middle)
				context.lineTo(cx, middle + (middle - top))
				context.lineTo(left, middle)
				context.closePath()
				context.fill()
				context.stroke()
				context.fillStyle = colors[1]
				context.beginPath()
				context.moveTo(left, middle)
				context.lineTo(cx, middle + (middle - top))
				context.lineTo(cx, bottom)
				context.lineTo(left, bottom - (middle - top))
				context.closePath()
				context.fill()
				context.stroke()
				context.fillStyle = colors[2]
				context.beginPath()
				context.moveTo(right, middle)
				context.lineTo(cx, middle + (middle - top))
				context.lineTo(cx, bottom)
				context.lineTo(right, bottom - (middle - top))
				context.closePath()
				context.fill()
				context.stroke()
			}

			function cubeColors(resources) {
				const counts = new Map()
				for (const resource of Array.isArray(resources) ? resources : []) {
					const id = Number(resource)
					if (!Number.isInteger(id)) continue
					counts.set(id, (counts.get(id) || 0) + 1)
				}
				const dominant = Array.from(counts.entries()).sort(function (left, right) {
					return right[1] - left[1] || left[0] - right[0]
				})[0]?.[0]
				const triplet = Number.isInteger(dominant) ? game.codex?.resources?.[dominant]?.triplet : null
				if (Array.isArray(triplet) && triplet.length >= 3) {
					return [String(triplet[2]), String(triplet[1]), String(triplet[0])]
				}
				return ['#edf1f2', '#aebbc0', '#78898f']
			}

			function captureSource(state) {
				const selections = Array.isArray(state?.selections) ? state.selections : []
				const primary = selections.find(function (entry) {
					return entry.id === state.primaryId
				}) || selections[selections.length - 1]
				if (!primary || !isRange(primary.range)) throw new Error('selection-unavailable')
				let bounds = null
				const selectionIds = []
				for (const entry of selections) {
					if (!isRange(entry?.range)) throw new Error('selection-unavailable')
					bounds = includeBounds(bounds, entry.range)
					selectionIds.push(Number(entry.id))
				}
				return {
					sourcePlane: primary.plane ? 1 : 0,
					anchor: visualRightAnchor(bounds),
					selectionIds: Array.from(new Set(selectionIds)).sort(function (left, right) {
						return left - right
					})
				}
			}

			function visualRightAnchor(bounds) {
				const fallback = [Number(bounds.maxU), Number(bounds.maxV)]
				if (typeof game.uvToXY !== 'function') return fallback
				const corners = [
					[Number(bounds.minU), Number(bounds.minV)],
					[Number(bounds.maxU), Number(bounds.minV)],
					[Number(bounds.maxU), Number(bounds.maxV)],
					[Number(bounds.minU), Number(bounds.maxV)]
				]
				const projectedCorners = []
				for (const position of corners) {
					let projected
					try {
						projected = game.uvToXY(position)
					} catch (error) {
						return fallback
					}
					const x = Number(projected?.[0])
					const y = Number(projected?.[1])
					if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback
					projectedCorners.push({ position, x, y })
				}
				const edges = [[0, 1], [1, 2], [2, 3], [3, 0]]
				let bestEdge = null
				for (const indices of edges) {
					const first = projectedCorners[indices[0]]
					const second = projectedCorners[indices[1]]
					const midpointX = (first.x + second.x) / 2
					const midpointY = (first.y + second.y) / 2
					if (
						!bestEdge ||
						midpointX > bestEdge.midpointX ||
						(midpointX === bestEdge.midpointX && midpointY > bestEdge.midpointY)
					) {
						bestEdge = { first, second, midpointX, midpointY }
					}
				}
				if (!bestEdge) return fallback
				const lower = (
					bestEdge.second.y > bestEdge.first.y ||
					(bestEdge.second.y === bestEdge.first.y && bestEdge.second.x > bestEdge.first.x)
				) ? bestEdge.second : bestEdge.first
				return lower.position.slice()
			}

			function normalizeSelections(selections, sourcePlane, anchor) {
				const absolute = []
				const relative = []
				for (const entry of selections || []) {
					if (!isRange(entry?.range) || Number(entry.plane ? 1 : 0) !== sourcePlane) {
						throw new Error('selection-plane-mismatch')
					}
					const range = cloneRange(entry.range)
					absolute.push({ id: Number(entry.id), primary: !!entry.primary, range })
					relative.push({
						id: Number(entry.id),
						primary: !!entry.primary,
						start: subtract(range.start, anchor),
						end: subtract(range.end, anchor),
						min: subtract([range.minU, range.minV], anchor),
						max: subtract([range.maxU, range.maxV], anchor),
						width: range.width,
						height: range.height
					})
				}
				return { absolute, relative }
			}

			function entityFootprint(entity, position) {
				const span = Number.isInteger(Number(entity?.entitySpan)) && Number(entity.entitySpan) > 0
					? Number(entity.entitySpan)
					: 0
				return {
					span,
					minU: position[0] - span,
					maxU: position[0] + span,
					minV: position[1] - span,
					maxV: position[1] + span
				}
			}

			function footprintCrossesSelection(footprint, selections) {
				for (let v = footprint.minV; v <= footprint.maxV; v += 1) {
					for (let u = footprint.minU; u <= footprint.maxU; u += 1) {
						if (!pointInSelections(u, v, selections)) return true
					}
				}
				return false
			}

			function pointInSelections(u, v, selections) {
				return selections.some(function (entry) {
					const range = entry.range
					return u >= range.minU && u <= range.maxU && v >= range.minV && v <= range.maxV
				})
			}

			function isModEntity(name) {
				return !!api.state?.entityPatches?.[name]
			}

			function safeEntityName(entity) {
				return typeof entity?.name === 'string' && entity.name.trim() ? entity.name.trim() : ''
			}

			function cloneEntitySave(save) {
				if (!save || typeof save !== 'object' || typeof save.name !== 'string') return null
				const cloned = jsonClone({
					name: save.name,
					position: save.position,
					par: save.par && typeof save.par === 'object' ? save.par : {}
				})
				return cloned && cloned.par && typeof cloned.par === 'object' ? cloned : null
			}

			function createSummary(selectionCount, selectedCellCount, entities, blocks, crossing, skipped) {
				const captured = new Map()
				for (const record of entities) addTypeCount(captured, record.name, 'captured')
				for (const record of blocks) addTypeCount(captured, record.name, 'captured')
				const skippedTypes = typeCounts(skipped)
				return {
					selectionCount,
					selectedCellCount,
					entityCount: entities.length,
					blockCount: blocks.length,
					crossBoundaryCount: crossing,
					skippedCount: skippedTypes.reduce(function (sum, entry) {
						return sum + entry.count
					}, 0),
					capturedTypes: typeCounts(captured),
					skippedTypes
				}
			}

			function emptySummary(selectionCount) {
				return {
					selectionCount: Number(selectionCount) || 0,
					selectedCellCount: 0,
					entityCount: 0,
					blockCount: 0,
					crossBoundaryCount: 0,
					skippedCount: 0,
					capturedTypes: [],
					skippedTypes: []
				}
			}

			function resultFromError(id, source, currentMode, blocks, error) {
				return deepFreeze({
					attemptId: id,
					status: String(error?.message || '') === 'capture-cancelled' ? 'cancelled' : 'empty',
					clipboard: 'unchanged',
					mode: currentMode,
					includeBlocks: currentMode === 'full' && !!blocks,
					sourcePlane: source.sourcePlane,
					anchor: source.anchor,
					summary: emptySummary(0),
					capturedTypes: [],
					skippedTypes: []
				})
			}

			function addTypeCount(map, name, reason) {
				const key = String(name || 'unknown') + ':' + String(reason || '')
				const entry = map.get(key)
				if (entry) {
					entry.count += 1
					return
				}
				map.set(key, {
					name: String(name || 'unknown'),
					reason: String(reason || ''),
					count: 1
				})
			}

			function typeCounts(map) {
				return Array.from(map.values()).map(function (entry) {
					return {
						name: entry.name,
						reason: entry.reason,
						count: entry.count
					}
				})
			}

			function includePoint(bounds, point) {
				return includeBounds(bounds, {
					minU: point[0],
					maxU: point[0],
					minV: point[1],
					maxV: point[1]
				})
			}

			function includeBounds(bounds, addition) {
				if (!bounds) {
					return {
						minU: addition.minU,
						maxU: addition.maxU,
						minV: addition.minV,
						maxV: addition.maxV
					}
				}
				return {
					minU: Math.min(bounds.minU, addition.minU),
					maxU: Math.max(bounds.maxU, addition.maxU),
					minV: Math.min(bounds.minV, addition.minV),
					maxV: Math.max(bounds.maxV, addition.maxV)
				}
			}

			function relativeBounds(bounds, anchor) {
				if (!bounds) return null
				return {
					min: subtract([bounds.minU, bounds.minV], anchor),
					max: subtract([bounds.maxU, bounds.maxV], anchor),
					width: bounds.maxU - bounds.minU + 1,
					height: bounds.maxV - bounds.minV + 1
				}
			}

			function sortRecords(records) {
				records.sort(function (left, right) {
					return (
						left.position[1] - right.position[1] ||
						left.position[0] - right.position[0] ||
						String(left.name).localeCompare(String(right.name))
					)
				})
			}

			function normalizePosition(position) {
				if (!Array.isArray(position) || position.length < 2) return null
				const u = Number(position[0])
				const v = Number(position[1])
				return Number.isInteger(u) && Number.isInteger(v) ? [u, v] : null
			}

			function subtract(point, anchor) {
				return [Number(point[0]) - Number(anchor[0]), Number(point[1]) - Number(anchor[1])]
			}

			function canCapture(state) {
				return !!(
					state &&
					!state.previewRange &&
					Array.isArray(state.selections) &&
					state.selections.length &&
					state.selections.every(function (entry) {
						return isRange(entry?.range)
					})
				)
			}

			function isRange(value) {
				return !!(
					value &&
					normalizePosition(value.start) &&
					normalizePosition(value.end) &&
					Number.isInteger(Number(value.minU)) &&
					Number.isInteger(Number(value.maxU)) &&
					Number.isInteger(Number(value.minV)) &&
					Number.isInteger(Number(value.maxV)) &&
					Number(value.width) > 0 &&
					Number(value.height) > 0
				)
			}

			function cloneRange(range) {
				return {
					start: [Number(range.start[0]), Number(range.start[1])],
					end: [Number(range.end[0]), Number(range.end[1])],
					minU: Number(range.minU),
					maxU: Number(range.maxU),
					minV: Number(range.minV),
					maxV: Number(range.maxV),
					width: Number(range.width),
					height: Number(range.height)
				}
			}

			function deepFreeze(value) {
				if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
				for (const key of Object.keys(value)) deepFreeze(value[key])
				return Object.freeze(value)
			}

			function jsonClone(value) {
				return JSON.parse(JSON.stringify(value))
			}

			async function writeClipboardText(text) {
				try {
					if (typeof window !== 'undefined' && window.navigator?.clipboard?.writeText) {
						await window.navigator.clipboard.writeText(text)
						return
					}
				} catch (error) {}
				const clipboard = getElectronClipboard()
				if (clipboard?.writeText) {
					clipboard.writeText(text)
					return
				}
				throw new Error('clipboard-unavailable')
			}

			function getElectronClipboard() {
				try {
					if (typeof require === 'function') return require('electron')?.clipboard || null
				} catch (error) {}
				return null
			}

			function yieldFrame() {
				return new Promise(function (resolve) {
					if (typeof globalThis.requestAnimationFrame === 'function') {
						globalThis.requestAnimationFrame(function () {
							resolve()
						})
						return
					}
					if (typeof globalThis.setTimeout === 'function') {
						globalThis.setTimeout(resolve, 0)
						return
					}
					resolve()
				})
			}

			function projectAnchorBounds(projectGame, anchor) {
				if (!projectGame?.canvas || typeof projectGame.uvToXY !== 'function' || !normalizePosition(anchor)) return null
				const range = {
					minU: anchor[0],
					maxU: anchor[0],
					minV: anchor[1],
					maxV: anchor[1]
				}
				const corners = [
					[range.minU - .5, range.minV - .5],
					[range.maxU + .5, range.minV - .5],
					[range.maxU + .5, range.maxV + .5],
					[range.minU - .5, range.maxV + .5]
				]
				const canvasRect = projectGame.canvas.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 }
				const internalWidth = finitePositive(projectGame.canvas.width, finitePositive(projectGame.w, 0))
				const internalHeight = finitePositive(projectGame.canvas.height, finitePositive(projectGame.h, 0))
				const pixelRatio = Math.max(1, finiteOr(projectGame.pixelRatio, finiteOr(globalThis.devicePixelRatio, 1)))
				const scaleX = finitePositive(canvasRect.width, 0) && internalWidth ? canvasRect.width / internalWidth : 1 / pixelRatio
				const scaleY = finitePositive(canvasRect.height, 0) && internalHeight ? canvasRect.height / internalHeight : 1 / pixelRatio
				const offsetX = finiteOr(projectGame.w2, internalWidth / 2)
				const offsetY = finiteOr(projectGame.h2, internalHeight / 2)
				const points = []
				try {
					for (const corner of corners) {
						const point = projectGame.uvToXY(corner)
						if (!Array.isArray(point) || point.length < 2) return null
						points.push([
							finiteOr(canvasRect.left, 0) + (offsetX + Number(point[0])) * scaleX,
							finiteOr(canvasRect.top, 0) + (offsetY + Number(point[1])) * scaleY
						])
					}
				} catch (error) {
					return null
				}
				return {
					minX: Math.min(...points.map(function (point) { return point[0] })),
					maxX: Math.max(...points.map(function (point) { return point[0] })),
					minY: Math.min(...points.map(function (point) { return point[1] })),
					maxY: Math.max(...points.map(function (point) { return point[1] }))
				}
			}

			function visibleRect(element) {
				if (!element || element.dataset?.visible !== 'true' || element.dataset?.positionVisible !== 'true') return null
				const rect = element.getBoundingClientRect?.()
				if (!rect || !finitePositive(rect.width, 0) || !finitePositive(rect.height, 0)) return null
				return {
					left: rect.left,
					top: rect.top,
					width: rect.width,
					height: rect.height
				}
			}

			function rectanglesOverlap(left, right, gap) {
				return !(
					left.left + left.width + gap <= right.left ||
					right.left + right.width + gap <= left.left ||
					left.top + left.height + gap <= right.top ||
					right.top + right.height + gap <= left.top
				)
			}

			function canMountUi() {
				return !!(
					typeof document !== 'undefined' &&
					document.body &&
					document.head &&
					typeof document.createElement === 'function'
				)
			}

			function isEditableEvent(event) {
				const nodes = typeof event?.composedPath === 'function' ? event.composedPath() : [event?.target]
				if (typeof document !== 'undefined') nodes.push(document.activeElement)
				return nodes.some(function (node) {
					return !!(node && node.nodeType === 1 && typeof node.closest === 'function' && node.closest(EDITABLE_SELECTOR))
				})
			}

			function isModLoaderPanelBlocking() {
				if (typeof document === 'undefined') return false
				const panel = document.getElementById('modloader-panel')
				return !!(panel && !panel.classList.contains('modloader-panel-autohidden'))
			}

			function consume(event) {
				event?.preventDefault?.()
				event?.stopImmediatePropagation?.()
			}

			function stopUiEvent(event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				event?.stopImmediatePropagation?.()
			}

			function formatTemplate(template, values) {
				return String(template || '').replace(/\{([a-z]+)\}/gi, function (match, key) {
					return values[key] === undefined ? match : String(values[key])
				})
			}

			function finiteOr(value, fallback) {
				const number = Number(value)
				return Number.isFinite(number) ? number : fallback
			}

			function finitePositive(value, fallback) {
				const number = Number(value)
				return Number.isFinite(number) && number > 0 ? number : fallback
			}

			function clamp(value, minimum, maximum) {
				return Math.min(maximum, Math.max(minimum, Number(value) || 0))
			}
		})
	}
})
