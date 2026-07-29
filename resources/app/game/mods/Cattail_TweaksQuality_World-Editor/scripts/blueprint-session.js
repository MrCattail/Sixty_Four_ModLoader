ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const INTERACTION_KEY = Symbol.for('cattail.world-editor.selection-interaction')
		const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
		const BLUEPRINT_KEY = Symbol.for('cattail.world-editor.blueprint')
		const PRODUCTION_KEY = Symbol.for('cattail.world-editor.production')
		const TRANSFORM_KEY = Symbol.for('cattail.world-editor.blueprint-transform')
		const PREVIEW_KEY = Symbol.for('cattail.world-editor.blueprint-preview')
		const PLACEMENT_KEY = Symbol.for('cattail.world-editor.blueprint-placement')
		const DIALOGS_KEY = Symbol.for('cattail.world-editor.dialogs')
		const CARD_OPACITY_KEY = Symbol.for('cattail.world-editor.card-opacity')
		const SHARED_KEY = Symbol.for('cattail.world-editor.shared')
		const CREATIVE_KEY = Symbol.for('cattail.world-editor.creative-mode')
		const SHELL_ID = 'cattail-world-editor-shell'
		const SELECTION_CARD_ID = 'cattail-world-editor-selection-card'
		const CARD_ID = 'cattail-world-editor-blueprint-card'
		const BLUEPRINT_PRODUCTION_CARD_ID = 'cattail-world-editor-blueprint-production-card'
		const STYLE_ID = 'cattail-world-editor-blueprint-style'
		const TEMPORARY_VISIBLE_MS = 3000
		const AUTO_HIDE_TRANSITION_MS = 160
		const SCAN_CHUNK_SIZE = 1024
		const ICON_ASSETS = Object.freeze({})
		let refreshMountedText = null

		function unavailableCreativeController(game) {
			const state = Object.freeze({
				version: '1.0.0',
				ready: false,
				creativeMode: false,
				busy: false,
				pendingForkFinalization: false
			})
			return Object.freeze({
				game,
				snapshot() { return state },
				subscribe(listener) {
					listener(state)
					return function () {}
				},
				setDialogOpen() { return false }
			})
		}

		function unavailablePlacementController(game) {
			const state = Object.freeze({
				version: '1.0.0',
				ready: false,
				busy: false,
				phase: 'idle',
				error: null,
				terminalBlockedReason: null
			})
			return Object.freeze({
				game,
				snapshot() { return state },
				subscribe(listener) {
					listener(state)
					return function () {}
				},
				isInputBlocked() { return false }
			})
		}

		api.on('afterWords', function (words, game) {
			if (typeof refreshMountedText === 'function') refreshMountedText(game)
		})

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const selection = globalThis[SELECTION_KEY]
			const i18n = globalThis[I18N_KEY]
			const transform = globalThis[TRANSFORM_KEY]
			const shared = globalThis[SHARED_KEY]
			const dialogs = globalThis[DIALOGS_KEY]
			let creative = globalThis[CREATIVE_KEY]
			let placement = globalThis[PLACEMENT_KEY]
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
			if (!creative || creative.game !== game || typeof creative.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Blueprint 4A-2a could not find creative mode state.')
				creative = unavailableCreativeController(game)
			}
			if (!placement || placement.game !== game || typeof placement.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Blueprint 4B-1a could not find the placement service.')
				placement = unavailablePlacementController(game)
			}
			if (
				!shared ||
				typeof shared.isEditableEvent !== 'function' ||
				typeof shared.isModLoaderPanelBlocking !== 'function' ||
				typeof shared.isCardControlEvent !== 'function' ||
				typeof shared.visibleCardRect !== 'function' ||
				typeof shared.cardCandidateFits !== 'function' ||
				typeof shared.rectanglesOverlap !== 'function' ||
				typeof shared.rectangleOverlapArea !== 'function' ||
				typeof shared.resolveEntityIcon !== 'function' ||
				typeof shared.createDisclosureController !== 'function' ||
				typeof shared.registerWorldDragCard !== 'function'
			) {
				console.warn('[Cattail World Editor] Blueprint 3E could not find shared card services.')
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
			let currentCreative = creative.snapshot()
			let currentPlacement = placement.snapshot()
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
				if (!state.active) {
					resetCardDisplayState('editor-inactive')
					session.cancelCapture('editor-inactive')
				}
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
			const stopCreativeSubscription = creative.subscribe(function (state) {
				currentCreative = state
				if ((!state.ready || !state.creativeMode) && currentSession.mode !== 'structure') {
					session.setMode('structure', 'creative-mode-unavailable')
				}
				if ((!state.ready || !state.creativeMode) && currentSession.includeBlocks) {
					session.setIncludeBlocks(false, 'creative-mode-unavailable')
				}
				refreshUi()
			})
			const stopPlacementSubscription = placement.subscribe(function (state) {
				currentPlacement = state
				refreshCard()
			})
			const stopTransformSubscription = transformAvailable ? transform.subscribe(function (state) {
				const previousState = currentTransform
				currentTransform = state
				if (
					ui &&
					previousState &&
					previousState.revision !== state.revision &&
					[
						'rotate-clockwise',
						'rotate-counterclockwise',
						'mirror-u',
						'mirror-v',
						'reset'
					].includes(state.lastCommand)
				) {
					restartTemporaryWindow()
				}
				refreshTransformUi()
			}) : null

			const handleKeydown = function (event) {
				if (shared.isWorldEditorInputBlocked?.() || placement.isInputBlocked?.()) return
				if (event?.key === 'Escape' && cancelAllSectionResizes('escape', true)) {
					consume(event)
					return
				}
				const key = String(event?.key || '').toLowerCase()
				const controlKey = !!(event?.ctrlKey || event?.metaKey)
				const pasteKey = event?.code === 'KeyV' || key === 'v'
				if (
					controlKey &&
					!event?.shiftKey &&
					pasteKey &&
					!event?.repeat &&
					!event?.isComposing &&
					event?.keyCode !== 229 &&
					!shared.isEditableEvent(event) &&
					runtime.isActive() &&
					!game.splash?.isShown &&
					!shared.isModLoaderPanelBlocking()
				) {
					connectPreviewController()
					const target = normalizePosition(game.hoveredCell)
					const state = previewSnapshot()
					if (
						target &&
						state?.active &&
						!state.paused &&
						currentTransform?.blueprint?.mode === 'structure' &&
						typeof previewController?.lockCommandTarget === 'function'
					) {
						consume(event)
						placeFromHotkey(target)
					}
					return
				}
				if (
					!controlKey ||
					event?.altKey ||
					event?.shiftKey ||
					!(event?.code === 'KeyC' || key === 'c') ||
					event?.repeat ||
					event?.isComposing ||
					event?.keyCode === 229 ||
					shared.isEditableEvent(event) ||
					!runtime.isActive() ||
					game.splash?.isShown ||
					shared.isModLoaderPanelBlocking() ||
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
			const handleWindowBlur = function () {
				previewController?.setTransformGuide?.(null, 'window-blur')
			}
			const handleWindowResize = function () {
				if (!ui) return
				refreshAllSectionControllers()
				syncCardPosition(game)
			}

			if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
				window.addEventListener('keydown', handleKeydown, true)
				window.addEventListener('blur', handleWindowBlur, true)
				window.addEventListener('resize', handleWindowResize)
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
					window.removeEventListener('blur', handleWindowBlur, true)
					window.removeEventListener('resize', handleWindowResize)
					window.removeEventListener('modloader:game-hud', handleGameHud)
					window.removeEventListener('modloader:vanilla-game-hud', handleVanillaGameHud)
				}
				if (typeof stopRuntimeSubscription === 'function') stopRuntimeSubscription()
				if (typeof stopSelectionSubscription === 'function') stopSelectionSubscription()
				if (typeof stopSessionSubscription === 'function') stopSessionSubscription()
				if (typeof stopCreativeSubscription === 'function') stopCreativeSubscription()
				if (typeof stopPlacementSubscription === 'function') stopPlacementSubscription()
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
						syncTemporaryWindowFromPreview(previousState, state)
						const interactionChanged = (
							!previousState ||
							previousState.active !== state.active ||
							previousState.pinned !== state.pinned ||
							previousState.temporaryPinned !== state.temporaryPinned ||
							previousState.paused !== state.paused ||
							previousState.blueprint !== state.blueprint
						)
						if (interactionChanged) {
							refreshTransformUi()
							syncCardPassThrough()
						}
						if (
							interactionChanged ||
							!previousState ||
							previousState.plan !== state.plan ||
							previousState.calculating !== state.calculating ||
							previousState.warning !== state.warning ||
							previousState.renderFallbackCount !== state.renderFallbackCount
						) {
							refreshCard()
						}
					})
				}
				refreshTransformUi()
				syncCardPassThrough()
				refreshCard()
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
						version: '0.4.1',
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
					version: '0.4.1',
					game: sessionGame,
					schemaVersion: 3,
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
				const capturedEntities = []
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
					capturedEntities.push(entity)
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
				const productionState = globalThis[PRODUCTION_KEY]
				const production = typeof productionState?.captureEntities === 'function'
					? productionState.captureEntities(capturedEntities)
					: null
				return {
					blueprint: {
						schemaVersion: 3,
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
						production,
						summary
					},
					summary,
					capturedTypes: summary.capturedTypes,
					skippedTypes: summary.skippedTypes
				}
			}

			function mountUi() {
				const shell = document.getElementById(SHELL_ID)
				const blueprintSlot = shell?.querySelector?.('[data-world-editor-slot="blueprint"]')
				const transformSlot = shell?.querySelector?.('[data-world-editor-slot="transform"]')
				if (!shell || !blueprintSlot || !transformSlot) {
					console.warn('[Cattail World Editor] Blueprint 3A could not find the grouped toolbar slots.')
					return null
				}
				document.getElementById(CARD_ID)?.remove()
				blueprintSlot.querySelector?.('[data-world-editor-blueprint-controls]')?.remove()
				transformSlot.querySelector?.('[data-world-editor-transform-controls="toolbar"]')?.remove()
				const style = ensureStyle()
				const controls = createControls()
				const card = createCard()
				blueprintSlot.append(controls.root)
				transformSlot.append(controls.transforms)
				document.body.append(card)

				const mounted = {
					style,
					controls,
					card,
					pinned: false,
					positionVisible: false,
					positionPreviewTarget: null,
					positionPreviewWorldBounds: null,
					positionPreviewScreenBounds: null,
					positionPreviewViewportWidth: 0,
					positionPreviewViewportHeight: 0,
					temporaryVisible: false,
					temporaryRemaining: TEMPORARY_VISIBLE_MS,
					temporaryDeadline: 0,
					temporaryTimer: null,
					pointerPaused: false,
					autoHiding: false,
					autoHideTimer: null,
					capturedTypesSource: null,
					capturedTypeCosts: null,
					skippedTypesSource: null,
					renderedCost: null,
					sectionStates: {
						costs: { expanded: true, preferredHeight: null, minHeight: 44, maxViewportRatio: .35 },
						captured: { expanded: true, preferredHeight: null, minHeight: 60, maxViewportRatio: .45 }
					},
					sectionControllers: {},
					opacityControls: null,
					releaseHud: null,
					worldDragControls: null
				}

				controls.structure.addEventListener('click', handleStructureMode)
				controls.full.addEventListener('click', handleFullMode)
				controls.blocks.addEventListener('click', handleBlocksToggle)
				controls.copy.addEventListener('click', handleCopy)
				controls.transforms.addEventListener('click', handleTransformAction)
				controls.transforms.addEventListener('pointerover', handleTransformGuidePointerOver)
				controls.transforms.addEventListener('pointerout', handleTransformGuidePointerOut)
				controls.transforms.addEventListener('focusin', handleTransformGuideFocusIn)
				controls.transforms.addEventListener('focusout', handleTransformGuideFocusOut)
				card.addEventListener('mouseenter', handleCardMouseEnter)
				card.addEventListener('mouseleave', handleCardMouseLeave)
				card.addEventListener('mousedown', stopCardPointerDown)
				card.addEventListener('click', toggleCardPinned)
				card.addEventListener('keydown', handleCardKeydown)
				card.querySelector('[data-world-editor-blueprint-action="clear"]').addEventListener('click', handleClear)
				card.querySelector('[data-world-editor-blueprint-action="place"]').addEventListener('click', handlePlace)
				const cardTransforms = card.querySelector('[data-world-editor-transform-controls="card"]')
				cardTransforms.addEventListener('click', handleTransformAction)
				cardTransforms.addEventListener('pointerover', handleTransformGuidePointerOver)
				cardTransforms.addEventListener('pointerout', handleTransformGuidePointerOut)
				cardTransforms.addEventListener('focusin', handleTransformGuideFocusIn)
				cardTransforms.addEventListener('focusout', handleTransformGuideFocusOut)

				if (api.ui?.hud?.register) {
					mounted.releaseHud = api.ui.hud.register({
						id: 'world-editor-blueprint-card',
						element: card,
						side: 'top'
					})
				}
				ui = mounted
				for (const kind of ['costs', 'captured']) {
					const state = mounted.sectionStates[kind]
					const section = card.querySelector('[data-world-editor-blueprint-section="' + kind + '"]')
					const toggle = card.querySelector('[data-world-editor-section-toggle="' + kind + '"]')
					const body = card.querySelector('[data-world-editor-section-body="' + kind + '"]')
					mounted.sectionControllers[kind] = shared.createDisclosureController({
						section,
						toggle,
						body,
						state,
						minHeight: state.minHeight,
						maxViewportRatio: state.maxViewportRatio,
						heightProperty: '--blueprint-section-max-height',
						resizeOverflow: 'children',
						canInteract: cardInteractionEnabled,
						onChange() {
							refreshSectionText(game)
							syncCardPosition(game)
						}
					})
				}
				mounted.worldDragControls = shared.registerWorldDragCard(game, card)
				mounted.opacityControls = globalThis[CARD_OPACITY_KEY]?.register?.({
					id: 'blueprint',
					group: 'blueprint-production',
					element: card,
					hint: card.querySelector('.cattail-world-editor-card-opacity-hint'),
					priority: 48,
					getText(state) {
						return {
							instruction: i18n.t(game, 'cardOpacityControls'),
							mode: i18n.t(game, state.contentIndependent ? 'cardOpacityContentIndependent' : 'cardOpacityContentLinked')
						}
					},
					onChange() {
						refreshCard()
					}
				}) || null
				refreshAllSectionControllers()
				refreshText(game)
				drawNeutralCube(controls.blocks.querySelector('canvas'))
				return mounted
			}

			function unmountUi() {
				if (!ui) return
				for (const controller of Object.values(ui.sectionControllers || {})) controller?.release?.()
				clearTemporaryTimer()
				cancelCardAutoHide()
				ui.controls.structure.removeEventListener('click', handleStructureMode)
				ui.controls.full.removeEventListener('click', handleFullMode)
				ui.controls.blocks.removeEventListener('click', handleBlocksToggle)
				ui.controls.copy.removeEventListener('click', handleCopy)
				ui.controls.transforms.removeEventListener('click', handleTransformAction)
				ui.controls.transforms.removeEventListener('pointerover', handleTransformGuidePointerOver)
				ui.controls.transforms.removeEventListener('pointerout', handleTransformGuidePointerOut)
				ui.controls.transforms.removeEventListener('focusin', handleTransformGuideFocusIn)
				ui.controls.transforms.removeEventListener('focusout', handleTransformGuideFocusOut)
				ui.card.removeEventListener('mouseenter', handleCardMouseEnter)
				ui.card.removeEventListener('mouseleave', handleCardMouseLeave)
				ui.card.removeEventListener('mousedown', stopCardPointerDown)
				ui.card.removeEventListener('click', toggleCardPinned)
				ui.card.removeEventListener('keydown', handleCardKeydown)
				ui.card.querySelector('[data-world-editor-blueprint-action="clear"]')?.removeEventListener('click', handleClear)
				ui.card.querySelector('[data-world-editor-blueprint-action="place"]')?.removeEventListener('click', handlePlace)
				const cardTransforms = ui.card.querySelector('[data-world-editor-transform-controls="card"]')
				cardTransforms?.removeEventListener('click', handleTransformAction)
				cardTransforms?.removeEventListener('pointerover', handleTransformGuidePointerOver)
				cardTransforms?.removeEventListener('pointerout', handleTransformGuidePointerOut)
				cardTransforms?.removeEventListener('focusin', handleTransformGuideFocusIn)
				cardTransforms?.removeEventListener('focusout', handleTransformGuideFocusOut)
				ui.opacityControls?.release?.()
				ui.worldDragControls?.release?.()
				if (typeof ui.releaseHud === 'function') ui.releaseHud()
				ui.controls.root.remove()
				ui.controls.transforms.remove()
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
				modes.dataset.columns = '1'
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
				root.append(modes, blocks, copy)
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
				card.dataset.worldEditorPinnable = 'true'
				card.dataset.worldEditorScrollbar = ''
				card.dataset.inputPassThrough = 'false'
				card.dataset.autoHiding = 'false'
				card.setAttribute('role', 'region')
				card.setAttribute('tabindex', '0')
				card.setAttribute('aria-live', 'polite')
				card.setAttribute('aria-atomic', 'true')
				card.setAttribute('aria-hidden', 'true')

				const header = document.createElement('div')
				header.className = 'cattail-world-editor-blueprint-card__header'
				const headerPrimary = document.createElement('div')
				headerPrimary.className = 'cattail-world-editor-blueprint-card__header-primary'
				const heading = document.createElement('span')
				heading.className = 'cattail-world-editor-blueprint-card__title'
				heading.dataset.worldEditorBlueprintText = 'title'
				const mode = document.createElement('span')
				mode.className = 'cattail-world-editor-blueprint-card__chip'
				mode.dataset.worldEditorBlueprintText = 'mode'
				const selections = document.createElement('span')
				selections.className = 'cattail-world-editor-blueprint-card__chip'
				selections.dataset.worldEditorBlueprintText = 'selections'
				const opacityHint = document.createElement('span')
				opacityHint.className = 'cattail-world-editor-card-opacity-hint'
				opacityHint.setAttribute('role', 'img')
				headerPrimary.append(heading, mode, selections, opacityHint)
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
				header.append(headerPrimary, source, clear)

				const status = document.createElement('div')
				status.className = 'cattail-world-editor-blueprint-card__status'
				status.dataset.worldEditorBlueprintText = 'status'

				const previewState = document.createElement('div')
				previewState.className = 'cattail-world-editor-blueprint-card__preview-state'
				previewState.dataset.worldEditorBlueprintText = 'preview-state'
				const previewWarning = document.createElement('div')
				previewWarning.className = 'cattail-world-editor-blueprint-card__preview-warning'
				previewWarning.dataset.worldEditorBlueprintText = 'preview-warning'
				previewWarning.hidden = true

				const transformPanel = document.createElement('div')
				transformPanel.className = 'cattail-world-editor-blueprint-card__transform'
				transformPanel.dataset.worldEditorTransformPanel = ''
				transformPanel.hidden = true
				const transformState = document.createElement('span')
				transformState.className = 'cattail-world-editor-blueprint-card__transform-state'
				transformState.dataset.worldEditorBlueprintText = 'transform-state'
				transformPanel.append(transformState, createTransformControls('card'))

				const previewStatuses = document.createElement('div')
				previewStatuses.className = 'cattail-world-editor-blueprint-card__preview-statuses'
				previewStatuses.dataset.worldEditorPreviewStatuses = ''
				for (const previewStatus of ['buildable', 'satisfied', 'conflict', 'blocked']) {
					const item = document.createElement('div')
					item.className = 'cattail-world-editor-blueprint-card__preview-status'
					item.dataset.status = previewStatus
					const symbol = document.createElement('span')
					symbol.className = 'cattail-world-editor-blueprint-card__preview-symbol'
					symbol.textContent = previewStatusSymbol(previewStatus)
					const label = document.createElement('span')
					label.dataset.worldEditorPreviewStatusLabel = previewStatus
					const count = document.createElement('strong')
					count.dataset.worldEditorPreviewStatusCount = previewStatus
					item.append(symbol, label, count)
					previewStatuses.append(item)
				}
				const crossing = document.createElement('div')
				crossing.className = 'cattail-world-editor-blueprint-card__preview-status'
				crossing.dataset.status = 'cross-boundary'
				const crossingSymbol = document.createElement('span')
				crossingSymbol.className = 'cattail-world-editor-blueprint-card__preview-symbol'
				crossingSymbol.textContent = '↔'
				const crossingLabel = document.createElement('span')
				crossingLabel.dataset.worldEditorBlueprintText = 'crossing-label'
				const crossingCount = document.createElement('strong')
				crossingCount.dataset.worldEditorBlueprintText = 'crossing-count'
				crossing.append(crossingSymbol, crossingLabel, crossingCount)
				previewStatuses.append(crossing)

				const placementActions = document.createElement('div')
				placementActions.className = 'cattail-world-editor-blueprint-card__placement'
				const placeButton = document.createElement('button')
				placeButton.type = 'button'
				placeButton.className = 'cattail-world-editor-blueprint-card__place'
				placeButton.dataset.worldEditorBlueprintAction = 'place'
				const placementState = document.createElement('div')
				placementState.className = 'cattail-world-editor-blueprint-card__placement-state'
				placementState.dataset.worldEditorBlueprintText = 'placement-state'
				placementState.hidden = true
				placementActions.append(placeButton, placementState)

				const costs = createAdjustableSection('costs')
				costs.section.classList.add('cattail-world-editor-blueprint-card__costs')
				costs.section.dataset.worldEditorPreviewCosts = ''
				const resourceList = document.createElement('div')
				resourceList.className = 'cattail-world-editor-blueprint-card__resources'
				resourceList.dataset.worldEditorPreviewResources = ''
				resourceList.dataset.worldEditorScrollbar = ''
				costs.body.append(resourceList)

				const captured = createTypeSection('captured')
				const skipped = createTypeSection('skipped')
				const hint = document.createElement('div')
				hint.className = 'cattail-world-editor-blueprint-card__hint'
				hint.dataset.worldEditorBlueprintText = 'hint'
				card.append(
					header,
					status,
					previewState,
					previewWarning,
					transformPanel,
					previewStatuses,
					placementActions,
					costs.section,
					captured.section,
					skipped.section,
					hint
				)
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
				if (kind === 'captured') {
					const adjustable = createAdjustableSection(kind)
					const list = document.createElement('div')
					list.className = 'cattail-world-editor-blueprint-card__types'
					list.dataset.worldEditorBlueprintTypes = kind
					list.dataset.worldEditorScrollbar = ''
					adjustable.body.append(list)
					return { section: adjustable.section, title: adjustable.title, list }
				}
				const section = document.createElement('div')
				section.className = 'cattail-world-editor-blueprint-card__section'
				section.dataset.worldEditorBlueprintSection = kind
				const title = document.createElement('div')
				title.className = 'cattail-world-editor-blueprint-card__section-title'
				title.dataset.worldEditorBlueprintText = kind + '-title'
				const list = document.createElement('div')
				list.className = 'cattail-world-editor-blueprint-card__types'
				list.dataset.worldEditorBlueprintTypes = kind
				list.dataset.worldEditorScrollbar = ''
				section.append(title, list)
				return { section, title, list }
			}

			function createAdjustableSection(kind) {
				const section = document.createElement('div')
				section.className = 'cattail-world-editor-blueprint-card__section cattail-world-editor-blueprint-card__section--adjustable'
				section.dataset.worldEditorBlueprintSection = kind
				section.dataset.expanded = 'true'

				const title = document.createElement('button')
				title.type = 'button'
				title.className = 'cattail-world-editor-blueprint-card__section-title cattail-world-editor-blueprint-card__section-toggle'
				title.dataset.worldEditorSectionToggle = kind
				title.setAttribute('aria-expanded', 'true')
				const titleText = document.createElement('span')
				titleText.dataset.worldEditorBlueprintText = kind + '-title'
				const chevron = document.createElement('span')
				chevron.className = 'cattail-world-editor-blueprint-card__section-chevron'
				chevron.setAttribute('aria-hidden', 'true')
				title.append(titleText, chevron)

				const body = document.createElement('div')
				body.id = CARD_ID + '-' + kind + '-body'
				body.className = 'cattail-world-editor-blueprint-card__section-body'
				body.dataset.worldEditorSectionBody = kind
				title.setAttribute('aria-controls', body.id)

				section.append(title, body)
				return { section, title, body }
			}

			function refreshUi() {
				if (!ui) return
				refreshToolbar()
				refreshCard()
				syncCardPosition(game)
			}

			function refreshToolbar() {
				const state = currentSession
				const creativeAvailable = !!currentCreative?.ready && !!currentCreative?.creativeMode
				const captureAvailable = canCapture(currentSelection) && !!currentRuntime.active && !state.capturing
				ui.controls.structure.dataset.active = state.mode === 'structure' ? 'true' : 'false'
				ui.controls.full.dataset.active = state.mode === 'full' ? 'true' : 'false'
				ui.controls.structure.setAttribute('aria-pressed', state.mode === 'structure' ? 'true' : 'false')
				ui.controls.full.setAttribute('aria-pressed', state.mode === 'full' ? 'true' : 'false')
				ui.controls.full.hidden = !creativeAvailable
				ui.controls.full.setAttribute('aria-hidden', creativeAvailable ? 'false' : 'true')
				ui.controls.modes.dataset.columns = creativeAvailable ? '2' : '1'
				ui.controls.blocks.hidden = !creativeAvailable || state.mode !== 'full'
				ui.controls.blocks.setAttribute('aria-hidden', !creativeAvailable || state.mode !== 'full' ? 'true' : 'false')
				ui.controls.blocks.disabled = !creativeAvailable || state.mode !== 'full'
				ui.controls.blocks.dataset.active = state.includeBlocks ? 'true' : 'false'
				ui.controls.blocks.setAttribute('aria-pressed', state.includeBlocks ? 'true' : 'false')
				ui.controls.copy.disabled = !captureAvailable
				refreshTransformUi()
			}

			function refreshText(languageGame) {
				if (!ui) return
				const source = languageGame || game
				ui.opacityControls?.refresh?.()
				ui.capturedTypesSource = null
				ui.capturedTypeCosts = null
				ui.skippedTypesSource = null
				ui.renderedCost = null
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
				const place = ui.card.querySelector('[data-world-editor-blueprint-action="place"]')
				const placeText = i18n.t(source, 'blueprintPlace')
				place.textContent = placeText
				place.title = placeText
				place.setAttribute('aria-label', placeText)
				refreshSectionText(source)
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
					renderPreviewDetails()
					refreshCardVisibility()
					return
				}

				setCardText('source', i18n.t(game, result.sourcePlane ? 'blueprintSourceVoid' : 'blueprintSourceReality'))
				setCardText('mode', i18n.t(game, result.mode === 'full' ? 'blueprintModeFull' : 'blueprintModeStructure'))
				setCardText('selections', formatTemplate(i18n.t(game, 'blueprintSelectionCount'), {
					count: result.summary?.selectionCount || 0
				}))
				setCardText('crossing-label', i18n.t(game, 'blueprintCrossBoundary'))
				setCardText('crossing-count', result.summary?.crossBoundaryCount || 0)
				setCardText('captured-title', i18n.t(game, 'blueprintCapturedTypes'))
				setCardText('skipped-title', i18n.t(game, 'blueprintSkippedTypes'))
				setCardText('status', resultStatusText(result))
				renderPreviewDetails()
				renderTypeList('captured', result.capturedTypes || [], currentPreview?.plan?.cost?.byType)
				renderTypeList('skipped', result.skippedTypes || [])
				ui.card.querySelector('[data-world-editor-blueprint-action="clear"]').disabled = !currentSession.blueprint
				ui.card.dataset.pinned = cardPinnedState() ? 'true' : 'false'
				ui.card.dataset.targetPinned = previewSnapshot()?.effectivePinned ? 'true' : 'false'
				setCardText('hint', cardHintText())
				ui.card.setAttribute('aria-label', cardAriaLabel(result))
				refreshTransformUi()
				refreshAllSectionControllers()
				refreshCardVisibility()
			}

			function refreshSectionText(languageGame) {
				if (!ui) return
				const source = languageGame || game
				for (const kind of ['costs', 'captured']) {
					const state = ui.sectionControllers[kind]?.state
					const toggle = ui.card.querySelector('[data-world-editor-section-toggle="' + kind + '"]')
					if (!state || !toggle) continue
					const action = i18n.t(source, state.expanded ? 'blueprintCollapseSection' : 'blueprintExpandSection')
					toggle.title = action
					toggle.setAttribute('aria-label', action)
				}
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

			function renderPreviewDetails() {
				if (!ui) return
				const state = previewSnapshot()
				const previewState = ui.card.querySelector('[data-world-editor-blueprint-text="preview-state"]')
				const previewWarning = ui.card.querySelector('[data-world-editor-blueprint-text="preview-warning"]')
				const statuses = ui.card.querySelector('[data-world-editor-preview-statuses]')
				const costs = ui.card.querySelector('[data-world-editor-preview-costs]')
				const activePreview = !!state?.active
				const warningCode = state?.warning
				const warningText = warningCode === 'full-unavailable'
					? i18n.t(game, 'previewFullUnavailable')
					: warningCode === 'plan-failed'
						? i18n.t(game, 'previewPlanFailed')
						: ''
				const stateText = state?.calculating
					? i18n.t(game, 'previewCalculating')
					: activePreview
						? state.effectivePinned
							? i18n.t(game, 'previewPinned')
							: state.target
								? i18n.t(game, 'previewFollowing')
								: i18n.t(game, 'previewWaitingTarget')
						: warningText
				if (previewState) {
					previewState.textContent = stateText
					previewState.hidden = !stateText
				}
				if (previewWarning) {
					previewWarning.textContent = warningText
					previewWarning.hidden = !warningText
				}
				const counts = state?.plan?.statusCounts || {}
				for (const status of ['buildable', 'satisfied', 'conflict', 'blocked']) {
					const item = ui.card.querySelector('[data-status="' + status + '"]')
					const label = ui.card.querySelector('[data-world-editor-preview-status-label="' + status + '"]')
					const count = ui.card.querySelector('[data-world-editor-preview-status-count="' + status + '"]')
					if (item) item.hidden = !state?.plan
					if (label) label.textContent = i18n.t(game, previewStatusTextKey(status))
					if (count) count.textContent = String(Math.max(0, Number(counts[status]) || 0))
				}
				if (statuses) statuses.hidden = !displayResult()
				if (costs) costs.hidden = !state?.plan
				setCardText('costs-title', i18n.t(game, 'previewBuildPlan'))
				renderPreviewResources(state?.plan?.cost || null)
				renderPlacementDetails(state)
			}

			function renderPlacementDetails(previewState) {
				if (!ui) return
				const button = ui.card.querySelector('[data-world-editor-blueprint-action="place"]')
				const status = ui.card.querySelector('[data-world-editor-blueprint-text="placement-state"]')
				const counts = previewState?.plan?.statusCounts || {}
				const possibleBuilds = (
					Math.max(0, Number(counts.buildable) || 0) +
					Math.max(0, Number(counts.conflict) || 0)
				)
				const terminal = currentPlacement?.terminalBlockedReason
				const available = !!(
					currentPlacement?.ready &&
					!currentPlacement.busy &&
					!terminal &&
					previewState?.active &&
					previewState.effectivePinned &&
					!previewState.commandLocked &&
					!previewState.paused &&
					!previewState.calculating &&
					previewState.plan &&
					currentTransform?.blueprint?.mode === 'structure' &&
					possibleBuilds > 0
				)
				if (button) button.disabled = !available
				let text = ''
				if (terminal) text = i18n.t(game, 'placementBlocked')
				else if (currentPlacement?.busy) text = i18n.t(game, 'placementPlacing')
				else if (currentPlacement?.phase === 'success') text = i18n.t(game, 'placementSuccess')
				else if (currentPlacement?.error?.code === 'NOTHING_TO_BUILD') {
					text = i18n.t(game, 'placementNothingToBuild')
				} else if (currentPlacement?.phase === 'failed' && currentPlacement?.error) {
					text = formatTemplate(i18n.t(game, 'placementFailed'), {
						reason: currentPlacement.error.message || currentPlacement.error.code
					})
				}
				if (status) {
					status.textContent = text
					status.hidden = !text
				}
			}

			function renderPreviewResources(cost) {
				if (!ui || ui.renderedCost === cost) return
				ui.renderedCost = cost
				const list = ui.card.querySelector('[data-world-editor-preview-resources]')
				if (!list) return
				list.replaceChildren()
				if (!cost) return
				const length = Math.max(
					cost.required?.length || 0,
					cost.owned?.length || 0,
					cost.shortfall?.length || 0
				)
				let rows = 0
				for (let index = 0; index < length; index += 1) {
					const required = finiteOr(cost.required?.[index], 0)
					const owned = finiteOr(cost.owned?.[index], 0)
					const shortfall = finiteOr(cost.shortfall?.[index], 0)
					if (!required && !shortfall) continue
					const row = document.createElement('div')
					row.className = 'cattail-world-editor-blueprint-card__resource'
					if (shortfall) row.dataset.shortfall = 'true'
					row.append(createResourceIcon(index, 18, 20))
					const name = document.createElement('span')
					name.className = 'cattail-world-editor-blueprint-card__resource-name'
					name.textContent = localizedResourceName(index)
					const values = document.createElement('span')
					values.className = 'cattail-world-editor-blueprint-card__resource-values'
					values.textContent = formatNumber(required) + '/' + formatNumber(owned) +
						(shortfall ? ' -' + formatNumber(shortfall) : '')
					row.setAttribute('aria-label', [
						name.textContent,
						i18n.t(game, 'previewRequired') + ' ' + formatNumber(required),
						i18n.t(game, 'previewOwned') + ' ' + formatNumber(owned),
						shortfall ? i18n.t(game, 'previewShortfall') + ' ' + formatNumber(shortfall) : ''
					].filter(Boolean).join('. '))
					row.append(name, values)
					list.append(row)
					rows += 1
				}
				if (!rows) {
					const empty = document.createElement('div')
					empty.className = 'cattail-world-editor-blueprint-card__empty'
					empty.textContent = i18n.t(game, 'previewNoCost')
					list.append(empty)
				}
			}

			function cardPinnedState() {
				return !!ui?.pinned
			}

			function cardInteractionEnabled() {
				const state = previewSnapshot()
				return state?.active ? !!state.effectivePinned : !!ui?.pinned
			}

			function cardHintText() {
				const state = previewSnapshot()
				const hints = []
				if (state?.renderFallbackCount) hints.push(i18n.t(game, 'previewRenderFallback'))
				if (state?.plan?.cost && !state.plan.cost.complete) hints.push(i18n.t(game, 'previewCostIncomplete'))
				if (state?.active) {
					hints.push(i18n.t(game, 'previewExitHint'))
					if (!state.pinned) hints.push(i18n.t(game, 'previewTemporaryPinHint'))
					hints.push(i18n.t(game, 'placementCtrlVHint'))
				}
				hints.push(i18n.t(game, cardPinnedState() ? 'cardUnpinAction' : 'cardPinAction'))
				return hints.join(' · ')
			}

			function previewStatusTextKey(status) {
				return status === 'buildable'
					? 'previewBuildable'
					: status === 'satisfied'
						? 'previewSatisfied'
						: status === 'conflict'
							? 'previewConflict'
							: 'previewBlocked'
			}

			function previewStatusSymbol(status) {
				return status === 'buildable' ? '✓' : status === 'satisfied' ? '=' : status === 'conflict' ? '!' : '×'
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
					i18n.t(game, cardPinnedState() ? 'cardUnpinAction' : 'cardPinAction'),
					i18n.t(game, 'cardOpacityControls'),
					i18n.t(game, ui?.opacityControls?.snapshot?.().contentIndependent
						? 'cardOpacityContentIndependent'
						: 'cardOpacityContentLinked')
				].filter(Boolean).join('. ')
			}

			function renderTypeList(kind, types, typeCosts) {
				const section = ui.card.querySelector('[data-world-editor-blueprint-section="' + kind + '"]')
				const list = ui.card.querySelector('[data-world-editor-blueprint-types="' + kind + '"]')
				if (kind === 'captured') {
					if (ui.capturedTypesSource === types && ui.capturedTypeCosts === typeCosts) return
					ui.capturedTypesSource = types
					ui.capturedTypeCosts = typeCosts || null
				} else {
					if (ui.skippedTypesSource === types) return
					ui.skippedTypesSource = types
				}
				const grouped = groupTypeRows(types)
				list.replaceChildren()
				section.hidden = !grouped.length
				const costs = new Map((typeCosts || []).map(function (entry) {
					return [String(entry?.name || ''), entry]
				}))
				const statuses = plannedTypeStatuses()
				for (const type of grouped) list.append(createTypeRow(type, kind, costs.get(type.name), statuses.get(type.name)))
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

			function createTypeRow(type, kind, typeCost, typeStatuses) {
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
				const content = document.createElement('span')
				content.className = 'cattail-world-editor-blueprint-card__type-content'
				content.append(name)
				if (kind === 'captured' && currentPreview?.plan) {
					const detail = document.createElement('span')
					detail.className = 'cattail-world-editor-blueprint-card__type-detail'
					const buildCount = Math.max(0, Number(typeCost?.buildCount) || 0)
					const satisfiedCount = Math.max(0, Number(typeStatuses?.satisfied) || 0)
					detail.textContent = buildCount
						? i18n.t(game, 'previewBuildable') + ' ×' + buildCount
						: satisfiedCount
							? i18n.t(game, 'previewSatisfied') + ' · ' + i18n.t(game, 'previewNoCost')
							: i18n.t(game, 'previewNoCost')
					content.append(detail)
					if (buildCount && Array.isArray(typeCost?.demand)) {
						const resources = document.createElement('span')
						resources.className = 'cattail-world-editor-blueprint-card__type-resources'
						let resourceCount = 0
						for (let index = 0; index < typeCost.demand.length; index += 1) {
							const value = finiteOr(typeCost.demand[index], 0)
							if (!value) continue
							const item = document.createElement('span')
							item.className = 'cattail-world-editor-blueprint-card__type-resource'
							item.append(createResourceIcon(index, 12, 14))
							const amount = document.createElement('span')
							amount.textContent = formatNumber(value)
							item.append(amount)
							item.setAttribute('aria-label', localizedResourceName(index) + ' ' + formatNumber(value))
							resources.append(item)
							resourceCount += 1
						}
						if (resourceCount) content.append(resources)
					}
				}
				const count = document.createElement('span')
				count.className = 'cattail-world-editor-blueprint-card__type-count'
				count.textContent = '×' + String(type.count)
				row.append(icon, content, count)
				return row
			}

			function plannedTypeStatuses() {
				const grouped = new Map()
				for (const record of currentPreview?.plan?.records || []) {
					const name = String(record?.name || '')
					if (!grouped.has(name)) grouped.set(name, { buildable: 0, satisfied: 0, conflict: 0, blocked: 0 })
					const entry = grouped.get(name)
					if (Object.prototype.hasOwnProperty.call(entry, record?.status)) entry[record.status] += 1
				}
				return grouped
			}

			function createEntityIcon(name) {
				const shopItem = game.shop?.items?.find?.(function (item) {
					return item?.name === name
				})
				const source = shopItem?.html?.querySelector?.('.imageVessel img')
				const imageSource = source?.currentSrc ||
					source?.src ||
					source?.getAttribute?.('src') ||
					shared.resolveEntityIcon(game, name)
				if (!imageSource) return createNeutralEntityIcon()
				const image = document.createElement('img')
				image.alt = ''
				image.src = imageSource
				image.addEventListener('error', function () {
					image.replaceWith(createNeutralEntityIcon())
				}, { once: true })
				return image
			}

			function createNeutralEntityIcon() {
				const canvas = document.createElement('canvas')
				canvas.width = 32
				canvas.height = 32
				canvas.setAttribute('aria-hidden', 'true')
				drawNeutralBuilding(canvas)
				return canvas
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

			function createResourceIcon(index, width, height) {
				const canvas = document.createElement('canvas')
				canvas.className = 'cattail-world-editor-blueprint-card__resource-icon'
				canvas.width = Math.max(1, Number(width) || 18)
				canvas.height = Math.max(1, Number(height) || 20)
				canvas.setAttribute('aria-hidden', 'true')
				if (drawResourceSprite(canvas, index)) return canvas
				const fallback = document.createElement('span')
				fallback.className = 'cattail-world-editor-blueprint-card__resource-fallback'
				fallback.style.background = resourceColor(index)
				fallback.setAttribute('aria-hidden', 'true')
				return fallback
			}

			function drawResourceSprite(canvas, index) {
				const context = canvas?.getContext?.('2d')
				const sprite = game.resourcesSprites?.[index]
				const image = sprite?.img
				if (!context || !sprite || !image) return false
				const sequence = sprite.sequences?.[sprite.currentSequence]
				const frameId = Array.isArray(sequence)
					? sequence[sprite.currentFrame] ?? sequence[0]
					: 0
				const mask = sprite.frames?.[frameId] || [index * 108, 0, 104, 120]
				if (!Array.isArray(mask) || mask.length < 4) return false
				try {
					context.clearRect(0, 0, canvas.width, canvas.height)
					context.drawImage(
						image,
						finiteOr(mask[0], index * 108),
						finiteOr(mask[1], 0),
						Math.max(1, finiteOr(mask[2], 104)),
						Math.max(1, finiteOr(mask[3], 120)),
						0,
						0,
						canvas.width,
						canvas.height
					)
					return true
				} catch (error) {
					return false
				}
			}

			function localizedResourceName(index) {
				const resource = game.codex?.resources?.[index]
				const name = resource?.name || resource?.id || String(index)
				try {
					const pronounced = game.pronounce?.('resources', name, 'name')
					if (pronounced && pronounced !== name) return String(pronounced)
				} catch (error) {}
				return String(name)
			}

			function resourceColor(index) {
				const triplet = game.codex?.resources?.[index]?.triplet
				return Array.isArray(triplet) && triplet.length ? String(triplet[1] || triplet[0]) : '#8a96a3'
			}

			function formatNumber(value) {
				try {
					if (typeof game.makeReadable === 'function') return String(game.makeReadable(value))
				} catch (error) {}
				return String(Math.round(finiteOr(value, 0) * 100) / 100)
			}

			function refreshCardVisibility() {
				if (!ui) return
				const result = displayResult()
				const onSourcePlane = !!result && Number(result.sourcePlane) === (game.plane ? 1 : 0)
				const previewState = previewSnapshot()
				const previewTemporaryPinnedVisible = !!(
					previewState?.active &&
					!previewState.paused &&
					previewState.temporaryPinned
				)
				const displayWindow = (
					ui.pinned ||
					ui.temporaryVisible ||
					currentSession.capturing ||
					previewTemporaryPinnedVisible
				)
				const visible = (
					!!currentRuntime.active &&
					!!result &&
					onSourcePlane &&
					displayWindow &&
					!game.halt &&
					!game.splash?.isShown &&
					!vanillaHudHidden &&
					!gameHudHidden
				)
				const immediateHidden = !visible && (
					!currentRuntime.active ||
					!result ||
					!onSourcePlane ||
					!!game.halt ||
					!!game.splash?.isShown ||
					vanillaHudHidden ||
					gameHudHidden ||
					!ui.positionVisible
				)
				if (ui.autoHiding && immediateHidden) cancelCardAutoHide()
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
				interacting = interacting || !!(previewState?.active && !previewState.effectivePinned)
				ui.card.dataset.inputPassThrough = interacting ? 'true' : 'false'
			}

			function syncCardPosition(frameGame) {
				if (!ui || (frameGame && frameGame !== game)) return
				syncCardPassThrough()
				ui.card.dataset.theme = game.plane ? 'void' : 'reality'
				if (!currentRuntime.active) {
					resetPreviewCardPosition()
					ui.positionVisible = false
					refreshCardVisibility()
					return
				}
				if (typeof api.render?.isEnabled === 'function' && !api.render.isEnabled()) {
					resetPreviewCardPosition()
					ui.positionVisible = false
					refreshCardVisibility()
					return
				}
				if (ui.autoHiding) {
					refreshCardVisibility()
					return
				}
				const result = displayResult()
				const previewState = previewSnapshot()
				const previewGeometry = previewState?.active && !previewState.paused
					? previewCardPositionGeometry(previewState)
					: null
				const previewBounds = previewGeometry?.bounds || null
				if (!previewGeometry) resetPreviewCardPosition()
				const bounds = previewBounds
					? projectWorldBounds(game, previewBounds)
					: result?.anchor
						? projectAnchorBounds(game, result.anchor)
						: null
				if (!bounds) {
					ui.positionVisible = false
					refreshCardVisibility()
					return
				}
				const viewportWidth = finiteOr(window.innerWidth, document.documentElement?.clientWidth || 0)
				const viewportHeight = finiteOr(window.innerHeight, document.documentElement?.clientHeight || 0)
				if (previewGeometry) {
					const projectionChanged = !screenBoundsEqual(ui.positionPreviewScreenBounds, bounds)
					const viewportChanged = (
						ui.positionPreviewViewportWidth !== viewportWidth ||
						ui.positionPreviewViewportHeight !== viewportHeight
					)
					if (!previewGeometry.snapshotChanged && !projectionChanged && !viewportChanged) {
						refreshCardVisibility()
						return
					}
					ui.positionPreviewScreenBounds = copyScreenBounds(bounds)
					ui.positionPreviewViewportWidth = viewportWidth
					ui.positionPreviewViewportHeight = viewportHeight
				}
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
				const centerY = (bounds.minY + bounds.maxY) / 2
				const candidates = [
					{ left: bounds.maxX + gap, top: centerY - height / 2, width, height, placement: 'right' },
					{ left: bounds.minX - gap - width, top: centerY - height / 2, width, height, placement: 'left' },
					{ left: centerX - width / 2, top: bounds.maxY + gap, width, height, placement: 'below' },
					{ left: centerX - width / 2, top: bounds.minY - gap - height, width, height, placement: 'above' }
				]
				const selectionRect = shared.visibleCardRect(document.getElementById(SELECTION_CARD_ID))
				const chosen = chooseCardCandidate(candidates, {
					margin,
					viewportWidth,
					viewportHeight,
					selectionRect,
					previewRect: {
						left: bounds.minX,
						top: bounds.minY,
						width: bounds.maxX - bounds.minX,
						height: bounds.maxY - bounds.minY
					}
				})
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
				if (!currentCreative?.ready || !currentCreative?.creativeMode) return
				session.setMode('full', 'toolbar')
			}

			function handleBlocksToggle(event) {
				stopUiEvent(event)
				if (!currentCreative?.ready || !currentCreative?.creativeMode || currentSession.mode !== 'full') return
				session.setIncludeBlocks(!currentSession.includeBlocks, 'toolbar')
			}

			function handleCopy(event) {
				stopUiEvent(event)
				if (!canCapture(currentSelection)) return
				captureFromUi('toolbar-copy')
			}

			function captureFromUi(reason) {
				if ((!currentCreative?.ready || !currentCreative?.creativeMode) && currentSession.mode !== 'structure') {
					session.setMode('structure', reason + '-structure')
				}
				return session.capture(reason)
			}

			function handlePlace(event) {
				const button = event?.target?.closest?.('[data-world-editor-blueprint-action="place"]')
				if (!button || button.disabled) return
				stopUiEvent(event)
				connectPreviewController()
				const state = previewSnapshot()
				const target = normalizePosition(state?.target)
				if (!target || !state?.effectivePinned || state.commandLocked) return
				placeAtTarget('mouse', target)
			}

			async function placeFromHotkey(target) {
				connectPreviewController()
				const controller = previewController || globalThis[PREVIEW_KEY]
				if (
					!controller ||
					typeof controller.lockCommandTarget !== 'function' ||
					typeof controller.releaseCommandTarget !== 'function'
				) {
					return false
				}
				const token = await controller.lockCommandTarget(target, 'ctrl-v-target')
				if (!token) return false
				try {
					await placeAtTarget('keyboard', target)
					return true
				} finally {
					await controller.releaseCommandTarget(token, 'ctrl-v-complete')
				}
			}

			async function placeAtTarget(input, target) {
				if (
					placement.isInputBlocked?.() ||
					!currentPlacement?.ready ||
					currentPlacement.terminalBlockedReason
				) {
					return null
				}
				const blueprint = currentTransform?.blueprint
				const controller = previewController || globalThis[PREVIEW_KEY]
				if (!blueprint || blueprint.mode !== 'structure' || !normalizePosition(target)) return null
				const plan = controller?.snapshot?.().plan || null
				if (!plan) return null
				const conflictCount = Math.max(0, Number(plan?.statusCounts?.conflict) || 0)
				let replaceConflicts = false
				if (conflictCount) {
					const choice = await confirmConflictChoice(conflictCount)
					if (!choice) {
						await controller?.refreshNow?.('placement-cancelled')
						refreshCard()
						return null
					}
					replaceConflicts = choice === 'replace'
				}
				creative.setDialogOpen?.(true, 'blueprint-placement-running')
				let result
				try {
					result = await placement.place({
						blueprint,
						target,
						input,
						replaceConflicts
					})
				} finally {
					creative.setDialogOpen?.(false, 'blueprint-placement-finished')
				}
				await controller?.refreshNow?.(
					result?.executed ? 'placement-complete' : 'placement-recoverable-failure'
				)
				refreshCard()
				return result
			}

			function confirmConflictChoice(count) {
				if (!dialogs || dialogs.game !== game || typeof dialogs.create !== 'function') {
					return Promise.resolve(null)
				}
				creative.setDialogOpen?.(true, 'blueprint-conflict-dialog-opened')
				return new Promise(function (resolve) {
					let settled = false
					const finish = function (choice, dialog, reason) {
						if (settled) return
						settled = true
						resolve(choice)
						dialog.close(reason || 'blueprint-conflict-choice', true)
					}
					const dialog = dialogs.create({
						id: 'cattail-world-editor-blueprint-conflict-dialog',
						theme: game.plane ? 'void' : 'reality',
						kind: 'blueprint-conflict',
						onClose() {
							creative.setDialogOpen?.(false, 'blueprint-conflict-dialog-closed')
							if (!settled) {
								settled = true
								resolve(null)
							}
						}
					})
					dialog.title.textContent = i18n.t(game, 'placementConflictTitle')
					dialog.message.textContent = formatTemplate(i18n.t(game, 'placementConflictMessage'), {
						count
					})
					const skip = dialog.createButton(i18n.t(game, 'placementSkipConflicts'), { primary: true })
					const replace = dialog.createButton(i18n.t(game, 'placementReplaceConflicts'), {
						primary: true,
						danger: true
					})
					const cancel = dialog.createButton(i18n.t(game, 'placementCancel'))
					skip.addEventListener('click', function () {
						finish('skip', dialog, 'blueprint-conflicts-skipped')
					})
					replace.addEventListener('click', function () {
						finish('replace', dialog, 'blueprint-conflicts-replaced')
					})
					cancel.addEventListener('click', function () {
						finish(null, dialog, 'blueprint-placement-cancelled')
					})
					dialog.actions.append(skip, replace, cancel)
					dialog.mount(skip)
				})
			}

			function handleTransformAction(event) {
				const button = event?.target?.closest?.('[data-world-editor-transform-action]')
				if (!button || button.disabled || !transformAvailable) return
				stopUiEvent(event)
				const action = button.dataset.worldEditorTransformAction
				previewController?.setTransformGuide?.(null, 'ui-transform-click')
				if (action === 'rotate-clockwise') transform.rotateClockwise('ui-rotate-clockwise')
				else if (action === 'rotate-counterclockwise') transform.rotateCounterclockwise('ui-rotate-counterclockwise')
				else if (action === 'mirror-u') transform.mirrorU('ui-mirror-u')
				else if (action === 'mirror-v') transform.mirrorV('ui-mirror-v')
				else if (action === 'reset') transform.reset('ui-reset')
			}

			function handleTransformGuidePointerOver(event) {
				const button = event?.target?.closest?.('[data-world-editor-transform-action]')
				if (!button || button.disabled) return
				previewController?.setTransformGuide?.(button.dataset.worldEditorTransformAction, 'ui-pointer-hover')
			}

			function handleTransformGuidePointerOut(event) {
				const button = event?.target?.closest?.('[data-world-editor-transform-action]')
				if (!button) return
				if (event?.relatedTarget && button.contains?.(event.relatedTarget)) return
				previewController?.setTransformGuide?.(null, 'ui-pointer-leave')
			}

			function handleTransformGuideFocusIn(event) {
				const button = event?.target?.closest?.('[data-world-editor-transform-action]')
				if (!button || button.disabled) return
				previewController?.setTransformGuide?.(button.dataset.worldEditorTransformAction, 'ui-keyboard-focus')
			}

			function handleTransformGuideFocusOut(event) {
				const button = event?.target?.closest?.('[data-world-editor-transform-action]')
				if (!button) return
				if (event?.relatedTarget && button.contains?.(event.relatedTarget)) return
				previewController?.setTransformGuide?.(null, 'ui-keyboard-blur')
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
				if (
					!ui ||
					shared.isCardControlEvent(event, '[data-world-editor-disclosure-resize]')
				) {
					return
				}
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

			function refreshAllSectionControllers() {
				if (!ui) return
				for (const controller of Object.values(ui.sectionControllers || {})) {
					controller?.refresh?.('blueprint-refresh')
				}
				refreshSectionText(game)
			}

			function cancelAllSectionResizes(reason, restore) {
				if (!ui) return false
				let cancelled = false
				for (const controller of Object.values(ui.sectionControllers || {})) {
					if (controller?.cancelResize?.(reason, restore)) cancelled = true
				}
				return cancelled
			}

			function restartTemporaryWindow() {
				if (!ui) return
				clearTemporaryTimer()
				cancelCardAutoHide()
				ui.temporaryVisible = !!currentSession.lastResult
				ui.temporaryRemaining = TEMPORARY_VISIBLE_MS
				refreshCardVisibility()
				resumeTemporaryTimer()
			}

			function syncTemporaryWindowFromPreview(previousState, state) {
				if (!ui || !state) return
				const exited = !!previousState?.active && !state.active
				if (exited) {
					resetCardDisplayState('preview-exited')
					return
				}
				if (state.temporaryPinned) {
					pauseTemporaryTimer()
					return
				}
				const entered = !!state.active && !previousState?.active
				const resumed = !!state.active && !!previousState?.paused && !state.paused
				const permanentPinned = !!state.active && !previousState?.pinned && !!state.pinned
				const permanentReleased = !!state.active && !!previousState?.pinned && !state.pinned
				const temporaryReleased = !!state.active && !!previousState?.temporaryPinned
				const warningAppeared = !!state.warning && state.warning !== previousState?.warning
				const fallbackChanged = (
					Number(state.renderFallbackCount) > 0 &&
					state.renderFallbackCount !== previousState?.renderFallbackCount
				)
				if (
					entered ||
					resumed ||
					permanentPinned ||
					permanentReleased ||
					temporaryReleased ||
					warningAppeared ||
					fallbackChanged
				) {
					restartTemporaryWindow()
				}
			}

			function resetCardDisplayState(reason) {
				if (!ui) return false
				const animate = reason === 'preview-exited' && cardCurrentlyVisible()
				cancelAllSectionResizes(reason || 'card-display-reset', true)
				clearTemporaryTimer()
				ui.pinned = false
				ui.pointerPaused = false
				ui.temporaryVisible = false
				ui.temporaryRemaining = TEMPORARY_VISIBLE_MS
				ui.temporaryDeadline = 0
				ui.card.dataset.pinned = 'false'
				if (animate) {
					startCardAutoHide(function () {
						resetPreviewCardPosition()
						ui.positionVisible = false
						ui.card.dataset.positionVisible = 'false'
						ui.card.setAttribute('aria-hidden', 'true')
					})
					ui.card.blur?.()
					return true
				}
				cancelCardAutoHide()
				resetPreviewCardPosition()
				ui.positionVisible = false
				ui.card.dataset.visible = 'false'
				ui.card.dataset.positionVisible = 'false'
				ui.card.setAttribute('aria-hidden', 'true')
				ui.card.blur?.()
				return true
			}

			function clearTemporaryWindow() {
				if (!ui) return
				clearTemporaryTimer()
				cancelCardAutoHide()
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

			function cardCurrentlyVisible() {
				return !!(
					ui?.card?.dataset?.visible === 'true' &&
					ui?.card?.dataset?.positionVisible === 'true' &&
					ui?.card?.getAttribute?.('aria-hidden') !== 'true'
				)
			}

			function setCardAutoHiding(active) {
				if (!ui) return
				ui.autoHiding = !!active
				ui.card.dataset.autoHiding = ui.autoHiding ? 'true' : 'false'
				const companion = document.getElementById(BLUEPRINT_PRODUCTION_CARD_ID)
				if (companion) {
					companion.dataset.autoHiding = ui.autoHiding ? 'true' : 'false'
					if (ui.autoHiding) {
						companion.dataset.visible = 'false'
						companion.setAttribute('aria-hidden', 'true')
					}
				}
			}

			function cancelCardAutoHide() {
				if (!ui) return
				if (ui.autoHideTimer !== null) {
					globalThis.clearTimeout?.(ui.autoHideTimer)
					ui.autoHideTimer = null
				}
				setCardAutoHiding(false)
			}

			function startCardAutoHide(onComplete) {
				if (!ui) return
				cancelCardAutoHide()
				if (!cardCurrentlyVisible()) {
					onComplete?.()
					refreshCardVisibility()
					return
				}
				setCardAutoHiding(true)
				refreshCardVisibility()
				ui.autoHideTimer = globalThis.setTimeout?.(function () {
					if (!ui) return
					ui.autoHideTimer = null
					setCardAutoHiding(false)
					onComplete?.()
					refreshCardVisibility()
				}, AUTO_HIDE_TRANSITION_MS) ?? null
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
					previewSnapshot()?.temporaryPinned ||
					ui.pointerPaused ||
					currentSession.capturing ||
					currentSelection?.previewRange
				) {
					return
				}
				clearTemporaryTimer()
				if (ui.temporaryRemaining <= 0) {
					ui.temporaryVisible = false
					startCardAutoHide()
					return
				}
				ui.temporaryDeadline = Date.now() + ui.temporaryRemaining
				ui.temporaryTimer = globalThis.setTimeout?.(function () {
					if (!ui) return
					ui.temporaryTimer = null
					ui.temporaryDeadline = 0
					ui.temporaryRemaining = 0
					ui.temporaryVisible = false
					startCardAutoHide()
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
						flex: none;
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
					.cattail-world-editor-blueprint-modes[data-columns="2"] {
						grid-template-columns: repeat(2, minmax(0, 1fr));
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
						left: 0;
						bottom: 1px;
						width: 0;
						height: 0;
						border-top: 4px solid transparent;
						border-bottom: 4px solid transparent;
						border-right: 5px solid currentColor;
						transform: rotate(25deg);
					}
					.cattail-world-editor-transform-icon[data-icon="rotate-counterclockwise"] {
						transform: scaleX(-1);
					}
					.cattail-world-editor-transform-icon[data-icon="mirror-u"],
					.cattail-world-editor-transform-icon[data-icon="mirror-v"] {
						transform: rotate(45deg);
					}
					.cattail-world-editor-transform-icon[data-icon="reset"]::before {
						inset: 3px;
						border-width: 2px;
					}
					.cattail-world-editor-transform-icon[data-icon="reset"]::after {
						left: 1px;
						bottom: 2px;
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
					.cattail-world-editor-blueprint-mode:disabled,
					.cattail-world-editor-blueprint-icon-button:disabled,
					.cattail-world-editor-transform-button:disabled {
						opacity: .36;
						cursor: default;
					}
					.cattail-world-editor-blueprint-card {
						--world-editor-card-opacity: 1;
						--world-editor-card-shell-opacity: 1;
						--world-editor-card-shell-percent: 100%;
						--world-editor-card-shell-blur-14: 14px;
						--world-editor-card-shell-saturate: 1.1;
						--blueprint-card-bg: color-mix(in srgb, rgba(248, 248, 246, .94) var(--world-editor-card-shell-percent), transparent);
						--blueprint-card-text: rgba(18, 20, 22, .94);
						--blueprint-card-muted: rgba(18, 20, 22, .58);
						--blueprint-card-border: color-mix(in srgb, rgba(92, 65, 132, .24) var(--world-editor-card-shell-percent), transparent);
						--blueprint-card-track: color-mix(in srgb, rgba(92, 65, 132, .09) var(--world-editor-card-shell-percent), transparent);
						--blueprint-card-accent: color-mix(in srgb, rgba(113, 79, 163, .88) var(--world-editor-card-shell-percent), transparent);
						position: fixed;
						z-index: 49;
						width: min(clamp(270px, 34vw, 372px), calc(100vw - 20px));
						max-height: min(68vh, calc(100vh - 20px));
						box-sizing: border-box;
						padding: 12px;
						overflow-x: hidden;
						overflow-y: auto;
						overscroll-behavior: contain;
						border: 1px solid var(--blueprint-card-border);
						border-radius: 8px;
						background: var(--blueprint-card-bg);
						box-shadow: 0 10px 28px color-mix(in srgb, rgba(0, 0, 0, .22) var(--world-editor-card-shell-percent), transparent);
						backdrop-filter: blur(var(--world-editor-card-shell-blur-14)) saturate(var(--world-editor-card-shell-saturate));
						-webkit-backdrop-filter: blur(var(--world-editor-card-shell-blur-14)) saturate(var(--world-editor-card-shell-saturate));
						color: var(--blueprint-card-text);
						font: 400 12px/1.35 Montserrat, Arial, sans-serif;
						letter-spacing: 0;
						visibility: hidden;
						opacity: 0;
						transform: translateY(4px) scale(var(--world-editor-ui-scale, 1));
						transform-origin: top left;
						pointer-events: none;
						transition: opacity .16s ease, transform .16s ease, visibility 0s linear .16s;
					}
					.cattail-world-editor-blueprint-card[data-theme="void"] {
						--blueprint-card-bg: color-mix(in srgb, rgba(8, 10, 12, .94) var(--world-editor-card-shell-percent), transparent);
						--blueprint-card-text: rgba(255, 255, 255, .92);
						--blueprint-card-muted: rgba(255, 255, 255, .62);
						--blueprint-card-border: color-mix(in srgb, rgba(210, 188, 250, .28) var(--world-editor-card-shell-percent), transparent);
						--blueprint-card-track: color-mix(in srgb, rgba(255, 255, 255, .08) var(--world-editor-card-shell-percent), transparent);
						--blueprint-card-accent: color-mix(in srgb, rgba(210, 188, 250, .9) var(--world-editor-card-shell-percent), transparent);
					}
					.cattail-world-editor-blueprint-card[data-visible="true"][data-position-visible="true"] {
						visibility: visible;
						opacity: var(--world-editor-card-opacity);
						transform: translateY(0) scale(var(--world-editor-ui-scale, 1));
						pointer-events: auto;
						transition-delay: 0s;
					}
					.cattail-world-editor-blueprint-card[data-visible="true"][data-position-visible="true"][data-opacity-content-independent="true"] {
						opacity: 1;
					}
					.cattail-world-editor-blueprint-card[data-visible="false"][data-auto-hiding="false"],
					.cattail-world-editor-blueprint-card[data-position-visible="false"][data-auto-hiding="false"] {
						transition: none;
					}
					.cattail-world-editor-blueprint-card[data-visible="false"][data-auto-hiding="true"] {
						visibility: visible;
						opacity: 0;
						transform: translateY(4px) scale(var(--world-editor-ui-scale, 1));
						pointer-events: none;
						transition: opacity .16s ease-out, transform .16s ease-out;
					}
					.cattail-world-editor-blueprint-card[data-visible="true"][data-position-visible="true"][data-input-pass-through="true"] {
						pointer-events: none;
					}
					.cattail-world-editor-blueprint-card__header {
						display: grid;
						grid-template-columns: minmax(0, 1fr) auto 24px 24px;
						align-items: center;
						gap: 8px;
					}
					.cattail-world-editor-blueprint-card__header-primary {
						display: flex;
						align-items: center;
						min-width: 0;
						gap: 5px;
					}
					.cattail-world-editor-blueprint-card__header-primary .cattail-world-editor-card-opacity-hint {
						margin-left: auto;
					}
					.cattail-world-editor-blueprint-card__title {
						flex: 0 1 auto;
						min-width: 0;
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
						font-size: 14px;
						font-weight: 700;
					}
					.cattail-world-editor-blueprint-card__chip {
						flex: 0 1 auto;
						min-width: 0;
						padding: 3px 5px;
						overflow: hidden;
						border-radius: 5px;
						background: var(--blueprint-card-track);
						text-overflow: ellipsis;
						white-space: nowrap;
						font-size: 10px;
						font-weight: 600;
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
					.cattail-world-editor-blueprint-card__status {
						min-height: 16px;
						margin-top: 7px;
						color: var(--blueprint-card-muted);
						text-align: center;
						font-size: 10px;
					}
					.cattail-world-editor-blueprint-card__preview-state {
						min-height: 15px;
						margin-top: 5px;
						color: var(--blueprint-card-muted);
						text-align: center;
						font-size: 10px;
						font-weight: 600;
					}
					.cattail-world-editor-blueprint-card__preview-state[hidden],
					.cattail-world-editor-blueprint-card__preview-warning[hidden],
					.cattail-world-editor-blueprint-card__preview-statuses[hidden],
					.cattail-world-editor-blueprint-card__costs[hidden] {
						display: none;
					}
					.cattail-world-editor-blueprint-card__preview-warning {
						margin-top: 6px;
						padding: 6px 7px;
						border-left: 3px solid #9b6cff;
						background: color-mix(in srgb, rgba(155, 108, 255, .10) var(--world-editor-card-shell-percent), transparent);
						color: var(--blueprint-card-text);
						font-size: 10px;
					}
					.cattail-world-editor-blueprint-card__preview-statuses {
						display: grid;
						grid-template-columns: repeat(2, minmax(0, 1fr));
						gap: 4px 10px;
						margin-top: 8px;
					}
					.cattail-world-editor-blueprint-card__preview-status {
						display: grid;
						grid-template-columns: 15px minmax(0, 1fr) auto;
						align-items: center;
						gap: 4px;
						min-width: 0;
						font-size: 10px;
					}
					.cattail-world-editor-blueprint-card__preview-status[hidden] {
						display: none;
					}
					.cattail-world-editor-blueprint-card__preview-status strong {
						font-weight: 400;
					}
					.cattail-world-editor-blueprint-card__preview-symbol {
						font-size: 13px;
						font-weight: 700;
						text-align: center;
					}
					.cattail-world-editor-blueprint-card__preview-status[data-status="buildable"] .cattail-world-editor-blueprint-card__preview-symbol { color: #09a943; }
					.cattail-world-editor-blueprint-card__preview-status[data-status="satisfied"] .cattail-world-editor-blueprint-card__preview-symbol { color: #bd8c00; }
					.cattail-world-editor-blueprint-card__preview-status[data-status="conflict"] .cattail-world-editor-blueprint-card__preview-symbol { color: #d63d3d; }
					.cattail-world-editor-blueprint-card__preview-status[data-status="blocked"] .cattail-world-editor-blueprint-card__preview-symbol { color: #8554e8; }
					.cattail-world-editor-blueprint-card__preview-status[data-status="cross-boundary"] .cattail-world-editor-blueprint-card__preview-symbol { color: #889; }
					.cattail-world-editor-blueprint-card__placement {
						display: grid;
						gap: 5px;
						margin-top: 9px;
					}
					.cattail-world-editor-blueprint-card__place {
						min-height: 34px;
						border: 1px solid color-mix(in srgb, #09a943 62%, var(--blueprint-card-border));
						border-radius: 6px;
						padding: 7px 10px;
						background: color-mix(in srgb, rgba(9, 169, 67, .20) var(--world-editor-card-shell-percent), transparent);
						color: var(--blueprint-card-text);
						font: 700 11px/1.25 Montserrat, Arial, sans-serif;
						cursor: pointer;
						outline: none;
					}
					.cattail-world-editor-blueprint-card__place:disabled {
						opacity: .36;
						cursor: default;
					}
					.cattail-world-editor-blueprint-card__placement-state {
						color: var(--blueprint-card-muted);
						text-align: center;
						font-size: 10px;
						line-height: 1.4;
						overflow-wrap: anywhere;
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
						position: relative;
						margin-top: 8px;
					}
					.cattail-world-editor-blueprint-card__section[hidden] {
						display: none;
					}
					.cattail-world-editor-blueprint-card__section-title:not([data-world-editor-disclosure-toggle]) {
						margin-bottom: 4px;
						color: var(--blueprint-card-muted);
						font-size: 10px;
						font-weight: 700;
					}
					.cattail-world-editor-blueprint-card__section-body {
						max-height: var(--blueprint-section-max-height, 35vh);
						overflow: hidden;
						opacity: 1;
						transition: max-height .16s ease-out, opacity .16s ease-out;
					}
					.cattail-world-editor-blueprint-card__section-body[data-sized="true"] > .cattail-world-editor-blueprint-card__types,
					.cattail-world-editor-blueprint-card__section-body[data-sized="true"] > .cattail-world-editor-blueprint-card__resources {
						height: 100%;
						max-height: none;
						box-sizing: border-box;
					}
					.cattail-world-editor-blueprint-card__types {
						max-height: min(200px, 30vh);
						overflow-x: hidden;
						overflow-y: auto;
						overscroll-behavior: contain;
						padding-right: 5px;
						scrollbar-gutter: stable;
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
					.cattail-world-editor-blueprint-card__type-content {
						display: flex;
						min-width: 0;
						flex-direction: column;
						gap: 2px;
					}
					.cattail-world-editor-blueprint-card__type-detail {
						color: var(--blueprint-card-muted);
						font-size: 9px;
						font-weight: 600;
					}
					.cattail-world-editor-blueprint-card__type-resources {
						display: flex;
						align-items: center;
						flex-wrap: wrap;
						gap: 3px 7px;
					}
					.cattail-world-editor-blueprint-card__type-resource {
						display: inline-flex;
						align-items: center;
						gap: 2px;
						color: var(--blueprint-card-muted);
						font-size: 9px;
						font-variant-numeric: tabular-nums;
						font-weight: 400;
					}
					.cattail-world-editor-blueprint-card__type-count {
						color: var(--blueprint-card-muted);
						font-variant-numeric: tabular-nums;
						font-weight: 700;
					}
					.cattail-world-editor-blueprint-card__resources {
						display: grid;
						gap: 4px;
						max-height: min(132px, 22vh);
						overflow-x: hidden;
						overflow-y: auto;
						overscroll-behavior: contain;
						padding-right: 5px;
						scrollbar-gutter: stable;
					}
					.cattail-world-editor-blueprint-card__resource {
						display: grid;
						grid-template-columns: 20px minmax(74px, auto) minmax(0, 1fr);
						align-items: center;
						gap: 5px;
						min-width: 0;
						font-size: 10px;
					}
					.cattail-world-editor-blueprint-card__resource[data-shortfall="true"] {
						color: #cf3838;
					}
					.cattail-world-editor-blueprint-card__resource-icon {
						display: block;
						object-fit: contain;
					}
					.cattail-world-editor-blueprint-card__type-resource .cattail-world-editor-blueprint-card__resource-icon {
						width: 12px;
						height: 14px;
					}
					.cattail-world-editor-blueprint-card__resource-fallback {
						display: block;
						width: 10px;
						height: 10px;
						border: 1px solid rgba(20, 26, 32, .35);
						border-radius: 2px;
					}
					.cattail-world-editor-blueprint-card__resource-name {
						overflow: hidden;
						font-weight: 600;
						text-overflow: ellipsis;
						white-space: nowrap;
					}
					.cattail-world-editor-blueprint-card__resource-values {
						min-width: 0;
						color: var(--blueprint-card-muted);
						text-align: right;
						overflow-wrap: anywhere;
						font-variant-numeric: tabular-nums;
						font-weight: 400;
					}
					.cattail-world-editor-blueprint-card__empty {
						color: var(--blueprint-card-muted);
						font-size: 10px;
					}
					.cattail-world-editor-blueprint-card__hint {
						margin-top: 7px;
						color: var(--blueprint-card-muted);
						text-align: center;
						font-size: 10px;
					}
					@media (max-width: 680px) {
						.cattail-world-editor-blueprint-controls {
							justify-content: center;
						}
						.cattail-world-editor-blueprint-mode {
							min-width: 48px;
							padding-inline: 6px;
						}
					}
					@media (max-width: 520px) {
						.cattail-world-editor-blueprint-card__header {
							grid-template-columns: minmax(0, 1fr) 24px;
						}
						.cattail-world-editor-blueprint-card__header-primary {
							grid-column: 1;
							grid-row: 1;
						}
						.cattail-world-editor-blueprint-card__source {
							grid-column: 1;
							grid-row: 2;
						}
						.cattail-world-editor-blueprint-card__clear {
							grid-column: 2;
							grid-row: 1 / span 2;
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
				return projectWorldBounds(projectGame, {
					minU: anchor[0],
					maxU: anchor[0],
					minV: anchor[1],
					maxV: anchor[1]
				})
			}

			function previewWorldBounds(state) {
				const target = normalizePosition(state?.target)
				const planTarget = normalizePosition(state?.plan?.target)
				const bounds = state?.plan?.bounds
				if (bounds && target && planTarget) {
					const du = target[0] - planTarget[0]
					const dv = target[1] - planTarget[1]
					return {
						minU: finiteOr(bounds.minU, target[0]) + du,
						maxU: finiteOr(bounds.maxU, target[0]) + du,
						minV: finiteOr(bounds.minV, target[1]) + dv,
						maxV: finiteOr(bounds.maxV, target[1]) + dv
					}
				}
				return target ? { minU: target[0], maxU: target[0], minV: target[1], maxV: target[1] } : null
			}

			function previewCardPositionGeometry(state) {
				if (!ui) return null
				const target = normalizePosition(state?.target)
				if (!target) {
					resetPreviewCardPosition()
					return null
				}
				const snapshotChanged = (
					!samePosition(target, ui.positionPreviewTarget) ||
					!ui.positionPreviewWorldBounds
				)
				if (snapshotChanged) {
					const contentMin = normalizePosition(state?.blueprint?.contentBounds?.min)
					const contentMax = normalizePosition(state?.blueprint?.contentBounds?.max)
					ui.positionPreviewTarget = target.slice()
					ui.positionPreviewWorldBounds = contentMin && contentMax
						? {
							minU: target[0] + Math.min(contentMin[0], contentMax[0]),
							maxU: target[0] + Math.max(contentMin[0], contentMax[0]),
							minV: target[1] + Math.min(contentMin[1], contentMax[1]),
							maxV: target[1] + Math.max(contentMin[1], contentMax[1])
						}
						: previewWorldBounds(state)
				}
				return ui.positionPreviewWorldBounds
					? { bounds: ui.positionPreviewWorldBounds, snapshotChanged }
					: null
			}

			function resetPreviewCardPosition() {
				if (!ui) return
				ui.positionPreviewTarget = null
				ui.positionPreviewWorldBounds = null
				ui.positionPreviewScreenBounds = null
				ui.positionPreviewViewportWidth = 0
				ui.positionPreviewViewportHeight = 0
			}

			function samePosition(left, right) {
				return !!(
					Array.isArray(left) &&
					Array.isArray(right) &&
					left[0] === right[0] &&
					left[1] === right[1]
				)
			}

			function screenBoundsEqual(left, right) {
				if (!left || !right) return false
				const tolerance = .25
				return (
					Math.abs(left.minX - right.minX) <= tolerance &&
					Math.abs(left.maxX - right.maxX) <= tolerance &&
					Math.abs(left.minY - right.minY) <= tolerance &&
					Math.abs(left.maxY - right.maxY) <= tolerance
				)
			}

			function copyScreenBounds(bounds) {
				return bounds ? {
					minX: bounds.minX,
					maxX: bounds.maxX,
					minY: bounds.minY,
					maxY: bounds.maxY
				} : null
			}

			function projectWorldBounds(projectGame, range) {
				if (
					!projectGame?.canvas ||
					typeof projectGame.uvToXY !== 'function' ||
					!range ||
					![range.minU, range.maxU, range.minV, range.maxV].every(Number.isFinite)
				) {
					return null
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

			function chooseCardCandidate(candidates, options) {
				const settings = options || {}
				const fitting = candidates.filter(function (candidate) {
					return shared.cardCandidateFits(candidate, settings)
				})
				const clear = fitting.find(function (candidate) {
					return !settings.selectionRect || !shared.rectanglesOverlap(candidate, settings.selectionRect, 8)
				})
				if (clear) return clear
				if (fitting.length) return fitting[0]
				const normalized = candidates.map(function (candidate) {
					return {
						left: clamp(
							candidate.left,
							settings.margin,
							Math.max(settings.margin, settings.viewportWidth - settings.margin - candidate.width)
						),
						top: clamp(
							candidate.top,
							settings.margin,
							Math.max(settings.margin, settings.viewportHeight - settings.margin - candidate.height)
						),
						width: candidate.width,
						height: candidate.height,
						placement: candidate.placement
					}
				})
				return normalized.reduce(function (best, candidate, index) {
					const score = (
						shared.rectangleOverlapArea(candidate, settings.previewRect) * 4 +
						shared.rectangleOverlapArea(candidate, settings.selectionRect) * 2 +
						index / 1000
					)
					return !best || score < best.score ? { candidate, score } : best
				}, null).candidate
			}

			function canMountUi() {
				return !!(
					typeof document !== 'undefined' &&
					document.body &&
					document.head &&
					typeof document.createElement === 'function'
				)
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
