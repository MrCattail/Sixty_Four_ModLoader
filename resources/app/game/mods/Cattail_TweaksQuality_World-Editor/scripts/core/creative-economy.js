ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const MOD_ID = api.id
		const ECONOMY_KEY = Symbol.for('cattail.world-editor.creative-economy')
		const CREATIVE_KEY = Symbol.for('cattail.world-editor.creative-mode')
		const SAVE_ADAPTER_KEY = Symbol.for('cattail.world-editor.save-adapter')
		const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
		const CONFIG_KEY = 'showCreativePurchaseCosts'
		const COUNTDOWN_SELECTOR = '.cattail-build-countdown'
		const COUNTDOWN_PRICE_CLASS = 'cattail-has-active-build-countdown'
		const TARGET_UNAVAILABLE = Symbol('creative-target-unavailable')
		const guardedControls = new WeakSet()
		const DISPLAY_TIMES = Object.freeze({
			success: 1500,
			cancelled: 3000,
			failed: 5000
		})
		const REASONS = Object.freeze({
			build: 'creative-shop-before-build',
			upgrade: 'creative-shop-before-upgrade',
			erase: 'creative-shop-before-erase',
			relocate: 'creative-shop-before-relocate'
		})
		let patchesInstalled = false
		let currentInputSource = 'mouse'
		let currentExecution = null
		let qualificationGame = null
		let qualificationDepth = 0
		let referenceGame = null
		let referenceDepth = 0

		api.on('afterVanillaScripts', installPatches)

		api.on('afterGameInit', function (payload, game) {
			const previous = globalThis[ECONOMY_KEY]
			previous?.dispose?.('creative-economy-runtime-replaced')
			const creative = globalThis[CREATIVE_KEY]
			const service = createService(game, creative)
			Object.defineProperty(globalThis, ECONOMY_KEY, {
				value: service,
				configurable: true,
				writable: true
			})
			console.info('[Cattail World Editor] Creative economy 4A-2b ready.')
		})

		function installPatches() {
			if (patchesInstalled || typeof Game === 'undefined' || !Game.prototype) return
			patchesInstalled = true

			patchGameMethod('getRealPrice', function (original) {
				return function () {
					const price = original.apply(this, arguments)
					const service = serviceFor(this)
					if (
						!service?.isCreativeActive?.() ||
						isReferencePriceScope(this) ||
						!isShopEconomicName(this, arguments[0]) ||
						!(
							(qualificationDepth > 0 && qualificationGame === this) ||
							currentExecution?.service === service
						)
					) {
						return price
					}
					return zeroPrice(price)
				}
			})

			patchGameMethod('canAfford', function (original) {
				return function (name) {
					const service = serviceFor(this)
					if (service?.isCreativeActive?.() && isShopEconomicName(this, name)) {
						const game = this
						const args = Array.from(arguments)
						return withQualificationPrices(game, function () {
							return original.apply(game, args)
						})
					}
					return original.apply(this, arguments)
				}
			})

			patchGameMethod('pickupItem', function (original) {
				return function () {
					const game = this
					const args = Array.from(arguments)
					const service = serviceFor(game)
					if (isNative(game) && service) {
						if (service.isInputBlocked()) return undefined
						if (service.isCreativeActive() && !canBypassUnlock(game, args[0])) {
							service.reportDeferred()
							return undefined
						}
					}
					const result = withReferencePrices(game, function () {
						return original.apply(game, args)
					})
					service?.rememberCreativePickup?.(args[0])
					service?.applyHeldPricePresentation?.()
					return result
				}
			})

			patchGameMethod('requestResources', function (original) {
				return function (resources) {
					if (
						currentExecution?.game === this &&
						currentExecution.intent?.operation === 'relocate' &&
						isRelocationCost(resources)
					) {
						return true
					}
					return original.apply(this, arguments)
				}
			})

			patchGameMethod('createResourceTransfer', function (original) {
				return function (resources) {
					if (currentExecution?.game === this && isZeroResourceArray(resources)) return undefined
					return original.apply(this, arguments)
				}
			})

			patchGameMethod('processE', function (original) {
				return function () {
					const game = this
					const args = Array.from(arguments)
					const service = serviceFor(game)
					if (isNative(game) && service && (service.isCreativeActive() || service.isInputBlocked())) {
						if (service.isInputBlocked()) return undefined
						if (nativeTools(game)) return nativeTools(game).start('relocate')
						service.reportDeferred()
						return undefined
					}
					if (!service?.isCreativeActive?.()) return original.apply(game, args)
					if (service.isWriteBlocked()) return undefined
					return withRelocationCredit(game, function () {
						return original.apply(game, args)
					})
				}
			})

			patchGameMethod('processClick', function (original) {
				return function () {
					const service = serviceFor(this)
					if (isNative(this) && service && (service.isCreativeActive() || service.isInputBlocked())) {
						if (!service.isInputBlocked() && currentInputSource === 'gamepad' && this.interactionMode === 'build') {
							const moved = this.mouse.positionChanged
							this.mouse.positionChanged = false
							this.mouse.state = 1
							try { return this.processUp() } finally { this.mouse.positionChanged = moved; this.mouse.state = 0 }
						}
						// 1.3 mouse release owns the purchase. Do not execute the legacy click again.
						if (this.itemInHand || this.interactionMode || service.isInputBlocked()) return undefined
					}
					const creativeActive = service?.isCreativeActive?.()
					const intent = creativeActive
						? captureIntent(this, currentInputSource, null)
						: null
					if (!intent) {
						if (creativeActive && isShopWriteCandidate(this)) return undefined
						return original.apply(this, arguments)
					}
					const game = this
					const args = Array.from(arguments)
					service.requestOperation(intent, function () {
						return runCreativeExecution(service, intent, function () {
							if (intent.operation === 'relocate') {
								return withRelocationCredit(game, function () {
									return original.apply(game, args)
								})
							}
							return original.apply(game, args)
						})
					}).catch(function (error) {
						logUnexpected('processClick', error)
					})
					return undefined
				}
			})

			patchGameMethod('updateGamepad', function (original) {
				return function () {
					const game = this
					const args = Array.from(arguments)
					return withInputSource('gamepad', function () {
						return original.apply(game, args)
					})
				}
			})

			patchListenerRegistration('setListeners', false)
			patchListenerRegistration('setListenersTouch', true)
			installNativePatches()

			if (typeof Shop !== 'undefined' && Shop.prototype) {
				api.patch(Shop.prototype, 'check', function (original) {
					return function () {
						const service = serviceFor(this.master)
						if (!service?.isCreativeActive?.()) return original.apply(this, arguments)
						const shop = this
						const args = Array.from(arguments)
						const result = withQualificationPrices(this.master, function () {
							return original.apply(shop, args)
						})
						service.applyShopPresentation(shop)
						return result
					}
				})

				api.patch(Shop.prototype, 'updatePrice', function (original) {
					return function (item) {
						const shop = this
						const args = Array.from(arguments)
						const result = withReferencePrices(this.master, function () {
							return original.apply(shop, args)
						})
						serviceFor(this.master)?.applyItemPricePresentation?.(shop, item)
						return result
					}
				})
			}

			if (typeof Entity !== 'undefined' && Entity.prototype?.getSellHint) {
				api.patch(Entity.prototype, 'getSellHint', function (original) {
					return function () {
						const service = serviceFor(this.master)
						if (
							service?.isCreativeActive?.() &&
							this.master?.itemInHand?.eraser
						) {
							return service.getCreativeEraserHint(this)
						}
						return original.apply(this, arguments)
					}
				})
			}

			if (typeof Cloud !== 'undefined' && Cloud.prototype?.addQEString) {
				api.patch(Cloud.prototype, 'addQEString', function (original) {
					return function (q, e, entity) {
						const result = original.apply(this, arguments)
						const relocateControl = Array.isArray(result) ? result[1] : null
						if (!relocateControl?.addEventListener) return result
						const cloud = this
						relocateControl.addEventListener('touchstart', function (event) {
							const game = cloud.master
							const service = serviceFor(game)
							if (
								!service?.isCreativeActive?.() ||
								service.isWriteBlocked() ||
								!Array.isArray(game?.resources) ||
								Number(game.resources[4]) >= 1 ||
								!canStartRelocation(game, entity)
							) {
								return
							}
							event?.preventDefault?.()
							event?.stopImmediatePropagation?.()
							game.transportedEntity = entity
							game.itemInHand = new game.codex.entities[entity.name].class(game)
							cloud.touchMode = 2
							delete game.itemInHandPriceTag
							delete game.itemInHandPriceAndRefundTag
						}, true)
						return result
					}
				})
			}
		}

		function nativeTools(game) {
			const service = globalThis[Symbol.for('cattail.world-editor.native-tools')]
			return service?.game === game && service.active() ? service : null
		}

		function isNative(game) {
			return globalThis[SAVE_ADAPTER_KEY]?.isNative(game) === true
		}

		function installNativePatches() {
			for (const name of ['pickupEraser', 'finalizeErase', 'massRelocate', 'pickupEntitiesForRelocation', 'confirmMassRelocation', 'confirmMassClone']) {
				patchGameMethod(name, function (original) {
					return function () {
						const service = serviceFor(this)
						if (isNative(this) && service && (service.isCreativeActive() || service.isInputBlocked())) {
							if (service.isInputBlocked()) return undefined
							const tools = nativeTools(this)
							if (tools && ['pickupEraser', 'finalizeErase', 'massRelocate', 'pickupEntitiesForRelocation'].includes(name)) return tools.handle(name, Array.from(arguments), original)
							service.reportDeferred()
							return undefined
						}
						return original.apply(this, arguments)
					}
				})
			}
			for (const name of ['processDown', 'processMove']) {
				patchGameMethod(name, function (original) {
					return function () {
						const service = serviceFor(this)
						if (isNative(this) && service) {
							if (service.isInputBlocked()) return undefined
							if (service.isCreativeActive() && !nativeTools(this) && ['erase', 'relocate'].includes(this.interactionMode)) {
								cancelNativeDeferred(this, service)
								return undefined
							}
						}
						return original.apply(this, arguments)
					}
				})
			}
			patchGameMethod('processUp', function (original) {
				return function () {
					const game = this
					const service = serviceFor(game)
					if (!isNative(game) || !service) return original.apply(game, arguments)
					if (service.isInputBlocked()) {
						resetNativePointer(game)
						return undefined
					}
					if (!service.isCreativeActive()) return original.apply(game, arguments)
					if (game.mouse?.state === 2 || game.mouse?.state === 3) return original.apply(game, arguments)
					if (nativeTools(game) && ['erase', 'relocate'].includes(game.interactionMode)) {
						try { return nativeTools(game).release(original, Array.from(arguments)) } finally { resetNativePointer(game) }
					}
					if (['erase', 'relocate'].includes(game.interactionMode) || game.cloneList?.length) {
						cancelNativeDeferred(game, service)
						return undefined
					}
					if (game.interactionMode !== 'build' || game.mouse?.positionChanged) return original.apply(game, arguments)
					const intent = captureIntent(game, currentInputSource, null)
					const args = Array.from(arguments)
					resetNativePointer(game)
					if (!intent) return undefined
					return service.requestOperation(intent, function () {
						const pointer = game.mouse && { state: game.mouse.state, positionChanged: game.mouse.positionChanged }
						if (game.mouse) { game.mouse.state = 1; game.mouse.positionChanged = false }
						try {
							return runCreativeExecution(service, intent, function () { return original.apply(game, args) })
						} finally {
							if (game.mouse && pointer) Object.assign(game.mouse, pointer)
						}
					})
				}
			})
			if (typeof Store !== 'undefined' && Store.prototype?.compositionUpdate) {
				api.patch(Store.prototype, 'compositionUpdate', function (original) {
					return function () {
						const store = this
						const args = arguments
						const result = withReferencePrices(store.master, function () { return original.apply(store, args) })
						serviceFor(store.master)?.applyNativeStorePresentation(store)
						return result
					}
				})
			}
			if (typeof DesktopStoreVersion !== 'undefined' && DesktopStoreVersion.prototype?.visibilityUpdate) {
				api.patch(DesktopStoreVersion.prototype, 'visibilityUpdate', function (original) {
					return function () {
						const service = serviceFor(this.master)
						const store = this
						const args = arguments
						service?.resetNativeStoreUnlocks(store)
						const result = service?.isCreativeActive()
							? withQualificationPrices(this.master, function () { return original.apply(store, args) })
							: original.apply(store, args)
						service?.applyNativeStorePresentation(store)
						return result
					}
				})
			}
		}

		function resetNativePointer(game) {
			if (game.mouse) { game.mouse.state = 0; game.mouse.timer = game.mouse.maxTimer }
			game.selectedEntity = false
		}

		function cancelNativeDeferred(game, service) {
			delete game.interactionMode
			delete game.itemInHand
			delete game.transportedEntity
			game.cleanupErase?.()
			game.cleanupRelocation?.()
			// Native cleanupClone still dereferences the removed legacy Shop controls.
			for (const key of ['cloneOrigin', 'cloneTarget', 'cloneList', 'totalCloneCost', 'cloneHint', 'cloneAreaSelected', 'cloneAreaOrigin', 'cloneEntitiesList', 'cloneEntitiesPositionsList']) delete game[key]
			resetNativePointer(game)
			service.reportDeferred()
		}

		function patchGameMethod(name, wrapper) {
			if (typeof Game.prototype[name] !== 'function') return
			api.patch(Game.prototype, name, wrapper)
		}

		function patchListenerRegistration(methodName, mobileActions) {
			if (typeof Game.prototype[methodName] !== 'function') return
			api.patch(Game.prototype, methodName, function (original) {
				return function () {
					const canvas = this.canvas
					if (!canvas || typeof canvas.addEventListener !== 'function') {
						return original.apply(this, arguments)
					}
					const game = this
					const originalAddEventListener = canvas.addEventListener
					canvas.addEventListener = function (type, listener, options) {
						let wrapped = listener
						if (typeof listener === 'function' && (type === 'touchstart' || type === 'touchend')) {
							if (mobileActions && type === 'touchend') {
								wrapped = createMobileTouchEndListener(game, listener)
							} else {
								wrapped = function () {
									const args = arguments
									return withInputSource('touch', function () {
										if (
											mobileActions &&
											type === 'touchstart' &&
											serviceFor(game)?.isCreativeActive?.() &&
											(game.touchMode === 2 || game.transportedEntity)
										) {
											return withRelocationCredit(game, function () {
												return listener.apply(this, args)
											}.bind(this))
										}
										return listener.apply(this, args)
									}.bind(this))
								}
							}
						}
						return originalAddEventListener.call(this, type, wrapped, options)
					}
					try {
						return original.apply(this, arguments)
					} finally {
						if (canvas.addEventListener !== originalAddEventListener) {
							delete canvas.addEventListener
						}
					}
				}
			})
		}

		function createMobileTouchEndListener(game, originalListener) {
			return function (event) {
				if (event?.target === game.canvas) event.preventDefault?.()
				const service = serviceFor(game)
				const creativeActive = service?.isCreativeActive?.()
				const touchAction = game.mouse?.currentAction
				const intent = creativeActive
					? captureIntent(game, 'touch', touchAction)
					: null
				if (!intent) {
					if (creativeActive && isShopWriteCandidate(game, touchAction)) {
						cleanupInterceptedTouch(game)
						return undefined
					}
					return withInputSource('touch', function () {
						return originalListener.call(this, event)
					}.bind(this))
				}
				if (game.mouse) game.mouse.state = 0
				service.requestOperation(intent, function () {
					return runCreativeExecution(service, intent, function () {
						const invoke = function () {
							return withInputSource('touch', function () {
								return originalListener.call(this, event)
							}.bind(this))
						}.bind(this)
						return intent.operation === 'relocate'
							? withRelocationCredit(game, invoke)
							: invoke()
					}.bind(this))
				}.bind(this)).then(function (result) {
					if (!result?.executed) cleanupInterceptedTouch(game)
				}).catch(function (error) {
					cleanupInterceptedTouch(game)
					logUnexpected('touchend', error)
				})
				return undefined
			}
		}

		function createService(game, creative) {
			let disposed = false
			let busy = false
			let phase = 'idle'
			let operation = null
			let input = null
			let revision = 0
			let lastReason = 'initialized'
			let lastSnapshotId = null
			let error = null
			let terminalBlockedReason = null
			let transactionToken = 0
			let displayTimer = 0
			let previewPurchaseCosts = null
			let eraserHintCache = null
			let nativeClassicView = null
			let creativeHeldName = null
			const temporaryStoreCards = new Map()
			const listeners = new Set()
			const snapshots = api.storage?.snapshots

			const controller = creative?.game === game && typeof creative.snapshot === 'function'
				? creative
				: null
			const stopClassicSubscription = globalThis[Symbol.for('cattail.better-uis.classic-shop')]?.subscribe(function (view) {
				if (view?.master === game) nativeClassicView = view
			})

			const handleConfigPreview = function (event) {
				const detail = event?.detail
				if (detail?.modId !== MOD_ID || detail?.key !== CONFIG_KEY) return
				previewPurchaseCosts = detail.value === true
				? true
				: detail.value === false
					? false
					: null
				eraserHintCache = null
				refreshPricePresentation()
				notify('creative-price-preview')
			}
			window.addEventListener('modloader:config-preview', handleConfigPreview)

			const stopCreativeSubscription = controller?.subscribe?.(function (state) {
				if (disposed) return
				if (busy && (!state?.ready || !state?.creativeMode || state?.disposed)) {
					invalidateTransaction('creative-state-changed')
				}
				eraserHintCache = null
				if (!state?.ready || !state?.creativeMode) clearCreativePickup()
				refreshPricePresentation()
				notify('creative-state-updated')
			})

			function snapshot() {
				const writeBlockedReason = readWriteBlockedReason()
				return Object.freeze({
					version: '1.0.0',
					ready: !disposed && !!controller && typeof snapshots?.create === 'function',
					active: isCreativeActive(),
					busy: !disposed && busy,
					phase: disposed ? 'idle' : phase,
					operation: disposed ? null : operation,
					input: disposed ? null : input,
					revision,
					lastReason,
					lastSnapshotId,
					error: publicError(error),
					writeBlockedReason,
					disposed
				})
			}

			function notify(reason) {
				if (disposed) return
				if (reason) lastReason = String(reason)
				revision += 1
				const current = snapshot()
				for (const listener of Array.from(listeners)) {
					try {
						listener(current)
					} catch (listenerError) {
						console.warn('[Cattail World Editor] Creative economy listener failed.', listenerError)
					}
				}
			}

			function isCreativeActive() {
				const state = controller?.snapshot?.()
				return !!(
					!disposed &&
					!isEnding(game) &&
					state?.ready &&
					state?.creativeMode &&
					!state?.disposed
				)
			}

			function showPurchaseCosts() {
				if (previewPurchaseCosts !== null) return previewPurchaseCosts
				return api.config.get(CONFIG_KEY, false) === true
			}

			function readWriteBlockedReason() {
				if (terminalBlockedReason) return terminalBlockedReason
				const modeReason = controller?.writeBlockedReason?.()
				if (modeReason) return modeReason
				const transactions = globalThis[TRANSACTIONS_KEY]
				if (!transactions || transactions.game !== game) return null
				if (typeof transactions.writeBlockedReason === 'function') {
					return transactions.writeBlockedReason()
				}
				return transactions.snapshot?.().terminalBlockedReason || null
			}

			function isWriteBlocked() {
				return !!readWriteBlockedReason()
			}

			function transactionBusy() {
				const cut = globalThis[Symbol.for('cattail.world-editor.selection-cut')]
				if (cut?.game === game && cut.isInputBlocked?.()) return true
				const transactions = globalThis[TRANSACTIONS_KEY]
				return transactions?.game === game && transactions.isBusy?.() === true
			}

			async function requestPinhole(intent, execute) {
				const adapter = globalThis[SAVE_ADAPTER_KEY]
				const token = ++transactionToken
				let context = null
				let executionStarted = false
				clearDisplayTimer()
				busy = true
				phase = 'checkpointing'
				operation = 'pinhole'
				input = intent.input
				error = null
				lastSnapshotId = null
				notify('creative-pinhole-checkpointing')
				function assertLive() {
					adapter.assertCurrent(game, context)
					if (!isCurrentToken(token) || !isFrozenIntentStillValid(game, intent) || isWriteBlocked() ||
						controller?.isInputBlocked?.() || transactionBusy()) {
						throw createError('PINHOLE_TARGET_CHANGED', 'The Pinhole target or active editor operation changed. Select Chasm again.')
					}
				}
				try {
					context = adapter.capture(game)
					await adapter.withSaveLock(game, context, async function (save) {
						assertLive()
						await adapter.readVerified(game, context)
						assertLive()
						// Observe the exact native checkpoint at its write boundary. Reading
						// only the identity could accept an older record from the same world.
						let checkpoint = null
						const descriptor = Object.getOwnPropertyDescriptor(game, 'writeToSlot')
						const write = game.writeToSlot
						Object.defineProperty(game, 'writeToSlot', { configurable: true, writable: true, value: function (slot, slotId) {
							if (slot === context.slot && slotId === context.slotId) checkpoint = JSON.stringify(slot.stack[0])
							return write.apply(this, arguments)
						} })
						try { await save() } finally {
							if (descriptor) Object.defineProperty(game, 'writeToSlot', descriptor)
							else delete game.writeToSlot
						}
						const stored = await adapter.readVerified(game, context)
						assertLive()
						if (!checkpoint || JSON.stringify(stored) !== checkpoint || stored.state.modloader?.worldEditor?.creativeMode !== true) {
							throw createError('PINHOLE_CHECKPOINT_FAILED', 'The pre-ending native save could not be verified. Pinhole was not placed.')
						}
						// Native assembled stats/resources share live objects. Detach the
						// verified record before the ending mutates them and reset rewrites history.
						context.slot.stack[0] = JSON.parse(checkpoint)
						phase = 'executing'
						notify('creative-pinhole-executing')
						assertLive()
						const runtime = globalThis[Symbol.for('cattail.world-editor.runtime')]
						if (runtime?.game === game) runtime.deactivate?.('pinhole-ending')
						assertLive()
						executionStarted = true
						withFrozenIntentTarget(game, intent, execute)
						if (!game.pinhole || !game.preventSaving) throw createError('PINHOLE_EXECUTION_FAILED', 'The native Pinhole ending did not start.')
					})
					complete('success', 'creative-pinhole-complete')
					return Object.freeze({ accepted: true, executed: true, reason: 'complete', snapshotId: null })
				} catch (operationError) {
					if (executionStarted) {
						terminalBlockedReason = 'PINHOLE_EXECUTION_FAILED'
						adapter.blockSaving(game, context)
					}
					if (!isCurrentToken(token)) return Object.freeze({ accepted: true, executed: false, reason: 'invalidated' })
					error = createError(executionStarted ? 'PINHOLE_EXECUTION_FAILED' : 'PINHOLE_CHECKPOINT_FAILED',
						String(operationError?.message || 'The pre-ending native save could not be verified.'))
					complete('failed', 'creative-pinhole-failed')
					return Object.freeze({ accepted: true, executed: false, reason: 'failed', error: publicError(error) })
				}
			}

			async function requestOperation(intent, execute) {
				const writeBlockedReason = readWriteBlockedReason()
				if (writeBlockedReason) {
					return Object.freeze({
						accepted: false,
						executed: false,
						reason: writeBlockedReason,
						error: publicError(createError(writeBlockedReason, 'Reload is required before world changes can continue.'))
					})
				}
				if (
					disposed ||
					busy ||
					controller?.isInputBlocked?.() ||
					transactionBusy() ||
					!isCreativeActive() ||
					typeof execute !== 'function' ||
					!intent ||
					!isIntentStillValid(game, intent)
				) {
					return Object.freeze({ accepted: false, executed: false, reason: busy ? 'busy' : 'invalid' })
				}

				if (isNative(game) && intent.entityName === 'pinhole') return requestPinhole(intent, execute)

				const token = ++transactionToken
				let created = null
				let executed = false
				let executionStarted = false
				clearDisplayTimer()
				busy = true
				phase = 'snapshotting'
				operation = intent.operation
				input = intent.input
				error = null
				notify('creative-shop-' + intent.operation + '-snapshotting')

				try {
					if (typeof snapshots?.create !== 'function') {
						throw createError('SNAPSHOT_UNAVAILABLE', 'Snapshot storage is unavailable.')
					}
					if (typeof game?.assembleSave !== 'function') {
						throw createError('SAVE_UNAVAILABLE', 'The current save cannot be encoded.')
					}
					const adapter = globalThis[SAVE_ADAPTER_KEY]
					const nativeContext = isNative(game) ? adapter.capture(game) : null
					if (nativeContext) await adapter.readVerified(game, nativeContext)
					if (!isCurrentToken(token)) return Object.freeze({ accepted: true, executed: false, reason: 'invalidated' })
					const data = nativeContext ? adapter.encodeSnapshot(game, nativeContext) : game.assembleSave(true)
					const saveIdentity = nativeContext ? nativeContext.saveId : readSaveIdentity(game, data)
					if (typeof data !== 'string' && !(data instanceof Uint8Array)) {
						throw createError('SAVE_UNAVAILABLE', 'The current save payload is invalid.')
					}
					if (!saveIdentity) {
						throw createError('SAVE_IDENTITY_UNAVAILABLE', 'The active save identity is unavailable.')
					}
					created = await snapshots.create({
						data,
						reason: REASONS[intent.operation],
						tags: createSnapshotTags(intent)
					})
					if (!created || typeof created.id !== 'string' || !created.id) {
						throw createError('SNAPSHOT_FAILED', 'Snapshot storage did not return a recovery point.')
					}

					if (!isCurrentToken(token)) {
						await removeUnusedSnapshot(created, 'transaction-invalidated')
						return Object.freeze({ accepted: true, executed: false, reason: 'invalidated' })
					}

					phase = 'revalidating'
					notify('creative-shop-' + intent.operation + '-revalidating')
					if (nativeContext) adapter.assertCurrent(game, nativeContext)
					const currentIdentity = nativeContext ? adapter.capture(game).saveId : readCurrentSaveIdentity(game)
					if (
						currentIdentity !== saveIdentity ||
						!isFrozenIntentStillValid(game, intent) ||
						!isCreativeActive() ||
						isWriteBlocked()
					) {
						await removeUnusedSnapshot(created, 'target-changed')
						complete('cancelled', 'creative-shop-target-changed')
						return Object.freeze({ accepted: true, executed: false, reason: 'target-changed' })
					}

					if (!isCurrentToken(token)) {
						await removeUnusedSnapshot(created, 'transaction-invalidated')
						return Object.freeze({ accepted: true, executed: false, reason: 'invalidated' })
					}

					phase = 'executing'
					notify('creative-shop-' + intent.operation + '-executing')
					if (!isFrozenIntentStillValid(game, intent) || !isCreativeActive() || isWriteBlocked()) {
						await removeUnusedSnapshot(created, 'target-changed')
						complete('cancelled', 'creative-shop-target-changed')
						return Object.freeze({ accepted: true, executed: false, reason: 'target-changed' })
					}
					executionStarted = true
					try {
						withFrozenIntentTarget(game, intent, execute)
					} catch (executionError) {
						throw createError(
							'EXECUTION_FAILED',
							String(executionError?.message || 'The creative action failed during execution.')
						)
					}
					executed = true
					lastSnapshotId = typeof created?.id === 'string' ? created.id : null
					complete('success', 'creative-shop-' + intent.operation + '-complete')
					refreshPricePresentation()
					return Object.freeze({
						accepted: true,
						executed: true,
						reason: 'complete',
						snapshotId: lastSnapshotId
					})
				} catch (operationError) {
					if (executionStarted && isNative(game)) {
						terminalBlockedReason = 'EXECUTION_FAILED'
						lastSnapshotId = typeof created?.id === 'string' ? created.id : null
					}
					if (created && !executionStarted) await removeUnusedSnapshot(created, 'operation-failed')
					if (!isCurrentToken(token)) {
						return Object.freeze({ accepted: true, executed: false, reason: 'invalidated' })
					}
					error = normalizeError(operationError, 'SNAPSHOT_FAILED')
					console.error(
						'[Cattail World Editor] Creative shop transaction failed.',
						{
							code: error.code,
							operation: intent.operation,
							input: intent.input,
							target: intent.target
						},
						operationError
					)
					complete('failed', 'creative-shop-' + intent.operation + '-failed')
					return Object.freeze({ accepted: true, executed: false, reason: 'failed', error: publicError(error) })
				}
			}

			function complete(nextPhase, reason) {
				if (disposed) return
				busy = false
				phase = nextPhase
				notify(reason)
				const delay = DISPLAY_TIMES[nextPhase]
				if (!delay) return
				displayTimer = setTimeout(function () {
					displayTimer = 0
					if (disposed || busy || phase !== nextPhase) return
					phase = 'idle'
					operation = null
					input = null
					if (nextPhase !== 'failed') error = null
					notify('creative-shop-status-idle')
				}, delay)
			}

			function invalidateTransaction(reason) {
				if (disposed || !busy) return false
				transactionToken += 1
				busy = false
				phase = 'cancelled'
				error = null
				notify(reason || 'creative-shop-invalidated')
				clearDisplayTimer()
				displayTimer = setTimeout(function () {
					displayTimer = 0
					if (disposed || busy || phase !== 'cancelled') return
					phase = 'idle'
					operation = null
					input = null
					notify('creative-shop-status-idle')
				}, DISPLAY_TIMES.cancelled)
				return true
			}

			function isCurrentToken(token) {
				return !disposed && transactionToken === token && controller === globalThis[CREATIVE_KEY] && game === controller?.game
			}

			async function removeUnusedSnapshot(created, reason) {
				const id = typeof created?.id === 'string' ? created.id : ''
				if (!id || typeof snapshots?.remove !== 'function') return false
				try {
					await snapshots.remove({ id })
					return true
				} catch (cleanupError) {
					console.warn(
						'[Cattail World Editor] Unused creative snapshot cleanup failed.',
						{ id, reason, code: cleanupError?.code || 'CLEANUP_FAILED' },
						cleanupError
					)
					return false
				}
			}

			function applyItemPricePresentation(shop, item) {
				if (!isCreativeActive() || !item?.priceHtml) return
				clearCountdown(item.priceHtml)
				if (!showPurchaseCosts()) {
					item.priceHtml.replaceChildren?.()
					if (!item.priceHtml.replaceChildren) item.priceHtml.innerHTML = ''
					item.priceElements = []
				}
			}

			function applyShopPresentation(shop) {
				if (!isCreativeActive() || !shop) return
				for (const item of Array.from(shop.items || [])) {
					applyItemPricePresentation(shop, item)
				}
				syncCompressedShopPrices(shop)
			}

			function reportDeferred() {
				if (disposed || busy || isWriteBlocked()) return false
				error = createError('NATIVE_CREATIVE_DEFERRED', 'This action is awaiting 1.3 creative-mode support.')
				complete('failed', 'creative-native-deferred')
				return false
			}

			function clearCreativePickup() {
				const name = creativeHeldName
				creativeHeldName = null
				if (!name || game.itemInHand?.name !== name || game.unlockedEntities?.[name]) return
				if (game.codex?.entities?.[name]?.shouldUnlock?.(game)) return
				delete game.itemInHand
				delete game.itemInHandPriceTag
				delete game.itemInHandPriceAndRefundTag
				if (game.interactionMode === 'build') delete game.interactionMode
				resetNativePointer(game)
			}

			function resetNativeStoreUnlocks(store) {
				for (const [name, card] of temporaryStoreCards) {
					if (store?.html?.items?.[name] === card && !game.unlockedEntities?.[name]) card.classList.add('hidden')
				}
				temporaryStoreCards.clear()
			}

			function applyNativeStorePresentation(store) {
				if (!store?.html || !isNative(game)) return
				const active = isCreativeActive()
				if (!active) resetNativeStoreUnlocks(store)
				if (active) {
					for (const [name, card] of Object.entries(store.html.items || {})) {
						if (!canBypassUnlock(game, name) || game.unlockedEntities?.[name]) continue
						const definition = game.codex.entities[name]
						const type = definition.type || 'default'
						const local = (type === 'dark' || definition.isDark === true) === (Number(game.plane) === 1)
						const available = local && !game.onlyones?.[name] && !(definition.onlyone && Number(game.entitiesInGame?.[name]) > 0)
						card.classList.toggle('hidden', !available)
						card.classList.toggle('disabled', !available)
						temporaryStoreCards.set(name, card)
						const tab = store.html.types?.[type]
						if (available && tab) {
							tab.button.classList.remove('hidden', 'dim')
						}
					}
				}
				const text = globalThis[Symbol.for('cattail.world-editor.i18n')]?.t(game, 'creativeNativeDeferred') || 'Awaiting 1.3 creative-mode support.'
				for (const control of [store.html.eraser, store.html.relocator]) {
					if (!control) continue
					if (!guardedControls.has(control) && control.addEventListener) {
						guardedControls.add(control)
						for (const type of ['mousedown', 'click', 'touchstart']) control.addEventListener(type, function (event) {
							const current = serviceFor(store.master)
							if (!current || (!current.isCreativeActive() && !current.isInputBlocked())) return
							event.preventDefault()
							event.stopImmediatePropagation()
							const tools = nativeTools(store.master)
							if (tools && control !== store.html.items?.pinhole && !current.isInputBlocked()) {
								if (type === 'mousedown') tools.start(control === store.html.eraser ? 'erase' : 'relocate', { pickHovered: false })
								return
							}
							current.reportDeferred()
						}, true)
					}
					if (active && nativeTools(game) && control !== store.html.items?.pinhole) {
						control.classList.toggle('hidden', !!game.plane || !!game.entitiesInGame?.pinhole)
						control.classList.remove('disabled')
						control.removeAttribute?.('aria-disabled')
						if (control.hasAttribute?.('data-world-editor-title')) {
							control.setAttribute('title', control.getAttribute('data-world-editor-title'))
							control.removeAttribute('data-world-editor-title')
						}
					} else if (active) {
						if (!control.hasAttribute?.('data-world-editor-title')) control.setAttribute?.('data-world-editor-title', control.getAttribute?.('title') || '')
						control.classList.add('disabled')
						control.setAttribute?.('aria-disabled', 'true')
						control.setAttribute?.('title', text)
					} else if (control.hasAttribute?.('data-world-editor-title')) {
						control.setAttribute('title', control.getAttribute('data-world-editor-title'))
						control.removeAttribute('data-world-editor-title')
						control.removeAttribute('aria-disabled')
						if (control !== store.html.items?.pinhole) control.classList.remove('disabled')
					}
				}
				if (!active) { nativeClassicView?.sync(); return }
				for (const [name, container] of Object.entries(store.html.priceContainers || {})) {
					clearCountdown(container)
					if (!showPurchaseCosts()) container.innerHTML = ''
					for (const element of store.html.priceElements?.[name] || []) element?.classList?.add('available')
				}
				// Classic rows share these cards; categorized rows copy their current HTML.
				if (game.shop?.items) applyShopPresentation(game.shop)
				nativeClassicView?.sync()
			}

			function applyHeldPricePresentation() {
				if (!isCreativeActive()) return
				eraserHintCache = null
				if (!game.itemInHand || game.itemInHand.eraser) {
					delete game.itemInHandPriceTag
					delete game.itemInHandPriceAndRefundTag
					return
				}
				if (!showPurchaseCosts()) {
					delete game.itemInHandPriceTag
					delete game.itemInHandPriceAndRefundTag
					return
				}
				if (game.codex?.entities?.[game.itemInHand.name]?.isUpgradeTo) {
					game.itemInHandPriceAndRefundTag = game.itemInHandPriceTag
				}
			}

			function getCreativeEraserHint() {
				if (!isCreativeActive() || !showPurchaseCosts() || typeof Cloud === 'undefined') return false
				const eraserName = game.itemInHand?.name
				if (!/^eraser(?:2|3)?$/.test(String(eraserName || ''))) return false
				const price = withReferencePrices(game, function () {
					return game.getRealPrice(eraserName)
				})
				const signature = eraserName + ':' + JSON.stringify(price || [])
				if (eraserHintCache?.signature === signature) return eraserHintCache.hint
				const hint = new Cloud(isNative(game) ? { master: game } : game)
				hint.addResourceList(price || [])
				eraserHintCache = { signature, hint }
				return hint
			}

			function refreshPricePresentation() {
				if (disposed || !game) return
				const shop = game.shop
				try {
					if (isNative(game) && game.store) {
						game.store.compositionUpdate?.()
						game.store.visibilityUpdate?.()
						for (const tab of Object.values(game.store.html?.types || {})) {
							if (!tab.button.classList.contains('closed')) game.store.adjustWrap?.(tab.wrap)
						}
					}
					if (shop && typeof shop.updateElements === 'function') {
						shop.updateElements()
					} else if (shop && typeof shop.updatePrice === 'function') {
						for (const item of Array.from(shop.items || [])) shop.updatePrice(item)
					}
					if (shop && typeof shop.check === 'function') shop.check()
					if (isCreativeActive()) applyShopPresentation(shop)
					rebuildHeldPriceHints(game)
					applyHeldPricePresentation()
				} catch (refreshError) {
					console.warn('[Cattail World Editor] Creative price presentation refresh failed.', refreshError)
				}
			}

			function rebuildHeldPriceHints(targetGame) {
				if (!isCreativeActive() || !targetGame.itemInHand || targetGame.itemInHand.eraser || typeof Cloud === 'undefined') {
					return
				}
				if (!showPurchaseCosts()) return
				const name = targetGame.itemInHand.name
				const price = withReferencePrices(targetGame, function () {
					return targetGame.getRealPrice(name)
				})
				const hint = new Cloud(isNative(targetGame) ? { master: targetGame } : targetGame)
				hint.addResourceList(price || [])
				targetGame.itemInHandPriceTag = hint
				targetGame.itemInHandPriceAndRefundTag = hint
			}

			function syncCompressedShopPrices(shop) {
				const panel = shop?.vessel?.querySelector?.('.cattail-shop-category-panel:not(.cattail-shop-category-panel-hidden)')
				if (!panel) return
				for (const item of Array.from(shop.items || [])) {
					if (!item?.name) continue
					const selector = '[data-shop-item="' + cssEscape(item.name) + '"]'
					for (const row of Array.from(panel.querySelectorAll?.(selector) || [])) {
						const target = row.querySelector?.('.cattail-shop-category-item-meta .itemPrice')
						if (!target) continue
						target.replaceChildren?.()
						if (!target.replaceChildren) target.innerHTML = ''
						if (showPurchaseCosts() && item.priceHtml) {
							for (const child of Array.from(item.priceHtml.childNodes || [])) {
								target.appendChild(child.cloneNode(true))
							}
						}
						clearCountdown(target)
					}
				}
			}

			function clearDisplayTimer() {
				if (!displayTimer) return
				clearTimeout(displayTimer)
				displayTimer = 0
			}

			const service = Object.freeze({
				version: '1.0.0',
				game,
				snapshot,
				subscribe(listener) {
					if (typeof listener !== 'function') throw new TypeError('Creative economy listener must be a function.')
					if (disposed) return function () {}
					listeners.add(listener)
					listener(snapshot())
					return function () {
						listeners.delete(listener)
					}
				},
				isInputBlocked() {
					return !disposed && !isEnding(game) && (busy || isWriteBlocked() || (isNative(game) && (transactionBusy() || controller?.isInputBlocked?.())))
				},
				isWriteBlocked,
				isCreativeActive,
				showPurchaseCosts,
				requestOperation,
				applyItemPricePresentation,
				applyShopPresentation,
				applyNativeStorePresentation,
				resetNativeStoreUnlocks,
				rememberCreativePickup(name) {
					creativeHeldName = isNative(game) && isCreativeActive() && canBypassUnlock(game, name) ? name : null
				},
				reportDeferred,
				reportToolResult(result) {
					if (disposed || busy) return
					clearDisplayTimer()
					error = result?.executed ? null : result?.error || createError('NATIVE_TOOL_FAILED', 'The native tool operation failed.')
					lastSnapshotId = result?.snapshotId || null
					complete(result?.executed ? 'success' : 'failed', 'native-tool-result')
				},
				applyHeldPricePresentation,
				getCreativeEraserHint,
				refreshPricePresentation,
				invalidate(reason) {
					return invalidateTransaction(reason || 'creative-shop-invalidated')
				},
				dispose(reason) {
					if (disposed) return false
					clearCreativePickup()
					resetNativeStoreUnlocks(game.store)
					transactionToken += 1
					disposed = true
					busy = false
					phase = 'idle'
					operation = null
					input = null
					clearDisplayTimer()
					window.removeEventListener('modloader:config-preview', handleConfigPreview)
					if (typeof stopCreativeSubscription === 'function') stopCreativeSubscription()
					if (typeof stopClassicSubscription === 'function') stopClassicSubscription()
					listeners.clear()
					lastReason = String(reason || 'disposed')
					if (globalThis[ECONOMY_KEY] === service) delete globalThis[ECONOMY_KEY]
					return true
				}
			})
			setTimeout(refreshPricePresentation, 0)
			return service
		}

		function serviceFor(game) {
			const service = globalThis[ECONOMY_KEY]
			return service?.game === game ? service : null
		}

		function captureIntent(game, input, touchAction) {
			if (!game || !isSupportedCreativePlane(game.plane)) return null
			if (touchAction && touchAction !== 'erase' && game.mouse?.positionChanged) return null
			const cell = normalizeCell(game.hoveredCell)
			if (!cell) return null
			const operation = classifyOperation(game, touchAction)
			if (!operation) return null
			const item = game.itemInHand || null
			const hovered = game.hoveredEntity || null
			const transported = game.transportedEntity || null
			const entityName = intentEntityName(operation, item, hovered, transported)
			return Object.freeze({
				operation,
				input: normalizeInput(input),
				plane: Number(game.plane) || 0,
				target: Object.freeze({ u: cell[0], v: cell[1] }),
				entityName: String(entityName || 'unknown'),
				item,
				hovered,
				transported,
				canPlace: game.canPlace === true,
				touchAction: touchAction || null
			})
		}

		function isEnding(game) {
			return !!(game?.pinhole || game?.credits || game?.stats?.gameIsFinished)
		}

		function canBypassUnlock(game, name) {
			const creative = globalThis[CREATIVE_KEY]
			return creative?.game === game && creative.canBypassUnlock?.(name) === true
		}

		function classifyOperation(game, touchAction) {
			if (!game || !isSupportedCreativePlane(game.plane) || !normalizeCell(game.hoveredCell)) return null
			if (isNative(game)) {
				const item = game.itemInHand
				const definition = game.codex?.entities?.[item?.name]
				if (game.interactionMode !== 'build' || game.transportedEntity || game.cloneList?.length ||
					!definition?.canPurchase || item.eraser || game.onlyones?.[item.name]) return null
				if (!canBypassUnlock(game, item.name)) return null
				const dark = definition.type === 'dark' || definition.isDark === true
				if (dark !== (Number(game.plane) === 1)) return null
				if (!game.canPlaceEntityHere(item, game.hoveredCell)) return null
				const occupant = game.entityAtCoordinates(game.hoveredCell) || null
				if (occupant !== (game.hoveredEntity || null)) return null
				const upgrade = occupant && definition.isUpgradeTo === occupant.name
				if (item.name === 'pinhole' && (Number(game.plane) !== 0 || !upgrade || occupant.name !== 'chasm' ||
					!game.stuff?.includes(occupant) || game.entitiesInGame?.pinhole > 0 || isEnding(game))) return null
				// Check every footprint cell, including cells after an occupied upgrade cell.
				const span = item.entitySpan || 0
				for (let u = -span; u <= span; u += 1) {
					for (let v = -span; v <= span; v += 1) {
						const cell = [game.hoveredCell[0] + u, game.hoveredCell[1] + v]
						const entity = game.entityAtCoordinates(cell)
						if (game.isWithinMemoryComplex(cell) || (entity && (!upgrade || entity !== occupant))) return null
					}
				}
				return upgrade ? 'upgrade' : 'build'
			}
			if (touchAction && !['erase', 'build', 'relocate'].includes(touchAction)) return null

			if ((!touchAction || touchAction === 'relocate') && game.transportedEntity && game.itemInHand) {
				return canDropRelocation(game, game.transportedEntity, game.hoveredCell) ? 'relocate' : null
			}

			const item = game.itemInHand
			if (!item?.name) return null
			const definition = game.codex?.entities?.[item.name]
			if (!definition && !item.eraser) return null
			if (game.onlyones?.[item.name]) return null
			if (typeof game.canAfford === 'function' && !game.canAfford(item.name)) return null

			if ((!touchAction || touchAction === 'erase') && item.eraser && game.hoveredEntity) {
				return canEraseStructurally(game, game.hoveredEntity) ? 'erase' : null
			}

			if (touchAction === 'erase' || item.eraser) return null
			if (definition?.canPurchase === false) return null
			if (Number(game.plane) === 1) {
				if (touchAction && touchAction !== 'build') return null
				if (game.hoveredEntity || definition?.isDark !== true) return null
				return 'build'
			}

			if ((!touchAction || touchAction === 'build') && !game.hoveredEntity) {
				const upgradeTarget = definition?.isUpgradeTo
				if (upgradeTarget && game.codex?.entities?.[upgradeTarget]?.onlyone) return null
				if (
					upgradeTarget &&
					(item.name === 'flower' || item.name === 'fruit' || item.name === 'gradient_rem')
				) {
					return null
				}
				return 'build'
			}

			if (
				(!touchAction || touchAction === 'build') &&
				game.hoveredEntity &&
				definition?.isUpgradeTo === game.hoveredEntity.name
			) {
				return 'upgrade'
			}
			return null
		}

		function isShopWriteCandidate(game, touchAction) {
			if (!game) return false
			if (touchAction && !['erase', 'build', 'relocate'].includes(touchAction)) return false
			if (game.transportedEntity && game.itemInHand && game.hoveredCell) return true
			const item = game.itemInHand
			if (!item?.name || !game.hoveredCell) return false
			if (item.eraser) return !!game.hoveredEntity
			if (!game.hoveredEntity) return true
			return game.codex?.entities?.[item.name]?.isUpgradeTo === game.hoveredEntity.name
		}

		function isIntentStillValid(game, intent) {
			if (!game || !intent || Number(game.plane) !== intent.plane) return false
			const service = serviceFor(game)
			if (!service?.isCreativeActive?.()) return false
			const cell = normalizeCell(game.hoveredCell)
			if (!cell || cell[0] !== intent.target.u || cell[1] !== intent.target.v) return false
			const operation = classifyOperation(game, intent.touchAction)
			if (operation !== intent.operation) return false
			if (game.itemInHand !== intent.item) return false
			if ((game.hoveredEntity || null) !== intent.hovered) return false
			if ((game.transportedEntity || null) !== intent.transported) return false
			if (
				intentEntityName(
					operation,
					game.itemInHand || null,
					game.hoveredEntity || null,
					game.transportedEntity || null
				) !== intent.entityName
			) {
				return false
			}
			return true
		}

		function isFrozenIntentStillValid(game, intent) {
			if (!game || !intent || Number(game.plane) !== intent.plane) return false
			const service = serviceFor(game)
			if (!service?.isCreativeActive?.()) return false
			if (game.itemInHand !== intent.item) return false
			if ((game.transportedEntity || null) !== intent.transported) return false
			const targetEntity = readIntentTargetEntity(game, intent)
			if (targetEntity === TARGET_UNAVAILABLE || targetEntity !== intent.hovered) return false
			return withIntentTargetContext(game, intent, targetEntity, function () {
				const operation = classifyOperation(game, intent.touchAction)
				if (operation !== intent.operation) return false
				return intentEntityName(
					operation,
					game.itemInHand || null,
					game.hoveredEntity || null,
					game.transportedEntity || null
				) === intent.entityName
			}, true)
		}

		function readIntentTargetEntity(game, intent) {
			const target = [intent.target.u, intent.target.v]
			try {
				if (typeof game.entityAtCoordinates === 'function') {
					return game.entityAtCoordinates(target) || null
				}
				const current = normalizeCell(game.hoveredCell)
				if (current && current[0] === target[0] && current[1] === target[1]) {
					return game.hoveredEntity || null
				}
			} catch (error) {}
			return TARGET_UNAVAILABLE
		}

		function withFrozenIntentTarget(game, intent, callback) {
			const targetEntity = readIntentTargetEntity(game, intent)
			if (targetEntity === TARGET_UNAVAILABLE || targetEntity !== intent.hovered) {
				throw createError('TARGET_CHANGED', 'The frozen creative target changed before execution.')
			}
			return withIntentTargetContext(game, intent, targetEntity, callback, false, true)
		}

		function withIntentTargetContext(game, intent, targetEntity, callback, freezeCanPlace, refreshAfter) {
			const previousCell = game.hoveredCell
			const previousEntity = game.hoveredEntity
			const previousCanPlace = game.canPlace
			game.hoveredCell = [intent.target.u, intent.target.v]
			game.hoveredEntity = targetEntity || null
			if (freezeCanPlace) game.canPlace = intent.canPlace === true
			try {
				return callback()
			} finally {
				game.hoveredCell = previousCell
				game.hoveredEntity = previousEntity
				game.canPlace = previousCanPlace
				const refreshPointer = isNative(game) ? game.processMove : game.processMousemove2
				if (refreshAfter && typeof refreshPointer === 'function') {
					try {
						if (isNative(game) && previousCell) game.hoveredEntity = game.entityAtCoordinates(previousCell) || null
						refreshPointer.call(game)
					} catch (error) {
						game.hoveredCell = previousCell
						game.hoveredEntity = previousEntity
						game.canPlace = previousCanPlace
					}
				}
			}
		}

		function intentEntityName(operation, item, hovered, transported) {
			const name = operation === 'erase'
				? hovered?.name
				: operation === 'relocate'
					? transported?.name
					: item?.name
			return String(name || 'unknown')
		}

		function canEraseStructurally(game, entity) {
			if (!entity || entity.indestructible || entity.name === 'cube') return false
			if (
				(entity.name === 'pump' || entity.name === 'pump2' || entity.name === 'gradient') &&
				(
					Number(game.entitiesInGame?.pump || 0) +
					Number(game.entitiesInGame?.pump2 || 0) +
					Number(game.entitiesInGame?.gradient || 0)
				) < 2
			) {
				return false
			}
			return true
		}

		function canDropRelocation(game, transported, cell) {
			if (!transported || !cell || typeof game.canRelocate !== 'function' || !game.canRelocate(transported)) return false
			if (game.canPlace === true) return true
			const target = typeof game.entityAtCoordinates === 'function'
				? game.entityAtCoordinates(cell)
				: game.hoveredEntity
			if (target && target !== transported && (target.span || !game.canRelocate(target))) return false
			return true
		}

		function canStartRelocation(game, entity) {
			return !!(
				game &&
				entity &&
				Number(game.entitiesInGame?.mega3 || 0) > 0 &&
				typeof game.canRelocate === 'function' &&
				game.canRelocate(entity) &&
				!game.plane &&
				!game.entitiesInGame?.pinhole
			)
		}

		function runCreativeExecution(service, intent, callback) {
			const previous = currentExecution
			currentExecution = { service, game: service.game, intent }
			try {
				return withQualificationPrices(service.game, callback)
			} finally {
				currentExecution = previous
			}
		}

		function withQualificationPrices(game, callback) {
			const previousGame = qualificationGame
			const descriptor = Object.getOwnPropertyDescriptor(game, 'getRealPrice')
			const priceMethod = game.getRealPrice
			qualificationGame = game
			qualificationDepth += 1
			// Apply the exemption after every price mod, regardless of patch load order.
			Object.defineProperty(game, 'getRealPrice', {
				configurable: true, writable: true,
				value: function (name) {
					const value = priceMethod.apply(this, arguments)
					const refund = currentExecution?.game === game && currentExecution.intent.operation === 'upgrade' && name === currentExecution.intent.hovered?.name
					return !isReferencePriceScope(game) && (isShopEconomicName(game, name) || refund) ? zeroPrice(value) : value
				}
			})
			try {
				return callback()
			} finally {
				if (descriptor) Object.defineProperty(game, 'getRealPrice', descriptor)
				else delete game.getRealPrice
				qualificationDepth -= 1
				qualificationGame = previousGame
			}
		}

		function withReferencePrices(game, callback) {
			const previousGame = referenceGame
			referenceGame = game
			referenceDepth += 1
			try {
				return callback()
			} finally {
				referenceDepth -= 1
				referenceGame = previousGame
			}
		}

		function isReferencePriceScope(game) {
			return referenceDepth > 0 && referenceGame === game
		}

		function withInputSource(source, callback) {
			const previous = currentInputSource
			currentInputSource = normalizeInput(source)
			try {
				return callback()
			} finally {
				currentInputSource = previous
			}
		}

		function withRelocationCredit(game, callback) {
			if (!Array.isArray(game?.resources) || Number(game.resources[4]) >= 1) return callback()
			const previous = game.resources[4]
			game.resources[4] = 1
			try {
				return callback()
			} finally {
				game.resources[4] = previous
			}
		}

		function cleanupInterceptedTouch(game) {
			if (!game) return
			if (game.mouse) {
				game.mouse.state = 0
				game.mouse.timer = game.mouse.maxTimer
				delete game.mouse.currentAction
			}
			game.selectedEntity = false
			if (game.itemInHand?.eraser) delete game.itemInHand
			try {
				game.ctx?.closePath?.()
				game.ctx?.fill?.()
			} catch (error) {}
		}

		function isShopEconomicName(game, name) {
			const id = String(name || '')
			if (!id) return false
			if (/^eraser(?:2|3)?$/.test(id)) return true
			if (Array.isArray(game?.shop?.items) && game.shop.items.some(function (item) { return item?.name === id })) {
				return true
			}
			return game?.codex?.entities?.[id]?.canPurchase === true
		}

		function zeroPrice(value) {
			if (!Array.isArray(value)) return value
			return value.map(function () { return 0 })
		}

		function isRelocationCost(value) {
			if (!Array.isArray(value) || (Number(value[4]) || 0) !== 1) return false
			for (let index = 0; index < value.length; index += 1) {
				const amount = Number(value[index]) || 0
				if (index === 4) {
					if (amount !== 1) return false
				} else if (amount !== 0) {
					return false
				}
			}
			return true
		}

		function isZeroResourceArray(value) {
			return Array.isArray(value) && value.every(function (amount) {
				return (Number(amount) || 0) === 0
			})
		}

		function normalizeCell(value) {
			if (!Array.isArray(value) || value.length < 2) return null
			const u = Number(value[0])
			const v = Number(value[1])
			return Number.isFinite(u) && Number.isFinite(v) ? [u, v] : null
		}

		function isSupportedCreativePlane(value) {
			const plane = Number(value) || 0
			return plane === 0 || plane === 1
		}

		function normalizeInput(value) {
			return ['mouse', 'keyboard', 'gamepad', 'touch'].includes(value) ? value : 'mouse'
		}

		function createSnapshotTags(intent) {
			return {
				schema: 1,
				feature: 'creative-shop',
				operation: intent.operation,
				input: intent.input,
				plane: intent.plane === 1 ? 'void' : 'reality',
				entity: intent.entityName,
				target: {
					u: intent.target.u,
					v: intent.target.v
				}
			}
		}

		function readCurrentSaveIdentity(game) {
			if (typeof game?.assembleSave !== 'function') return null
			try {
				return readSaveIdentity(game, game.assembleSave(true))
			} catch (error) {
				return null
			}
		}

		function readSaveIdentity(game, data) {
			if (typeof game?.decodeSave !== 'function') return null
			try {
				const decoded = game.decodeSave(data)
				const id = String(decoded?.modloader?.saveInstanceId || '').trim().toLowerCase()
				return id || null
			} catch (error) {
				return null
			}
		}

		function clearCountdown(container) {
			if (!container) return
			for (const node of Array.from(container.querySelectorAll?.(COUNTDOWN_SELECTOR) || [])) node.remove?.()
			container.classList?.remove?.(COUNTDOWN_PRICE_CLASS)
		}

		function cssEscape(value) {
			const string = String(value || '')
			if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(string)
			return string.replace(/["\\]/g, '\\$&')
		}

		function createError(code, message) {
			const error = new Error(message)
			error.code = code
			return error
		}

		function normalizeError(value, fallbackCode) {
			if (value instanceof Error) {
				if (!value.code) value.code = fallbackCode
				return value
			}
			return createError(fallbackCode, String(value || 'Creative shop transaction failed.'))
		}

		function publicError(value) {
			if (!value) return null
			return Object.freeze({
				code: String(value.code || 'UNKNOWN'),
				message: String(value.message || value)
			})
		}

		function logUnexpected(stage, error) {
			console.error('[Cattail World Editor] Unexpected creative economy error (' + stage + ').', error)
		}
	}
})
