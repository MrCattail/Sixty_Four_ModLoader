ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const MOD_ID = api.id
		const ECONOMY_KEY = Symbol.for('cattail.world-editor.creative-economy')
		const CREATIVE_KEY = Symbol.for('cattail.world-editor.creative-mode')
		const CONFIG_KEY = 'showCreativePurchaseCosts'
		const COUNTDOWN_SELECTOR = '.cattail-build-countdown'
		const COUNTDOWN_PRICE_CLASS = 'cattail-has-active-build-countdown'
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
					const result = withReferencePrices(game, function () {
						return original.apply(game, args)
					})
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
					if (!service?.isCreativeActive?.()) return original.apply(game, args)
					return withRelocationCredit(game, function () {
						return original.apply(game, args)
					})
				}
			})

			patchGameMethod('processClick', function (original) {
				return function () {
					const service = serviceFor(this)
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
			let transactionToken = 0
			let displayTimer = 0
			let previewPurchaseCosts = null
			let eraserHintCache = null
			const listeners = new Set()
			const snapshots = api.storage?.snapshots

			const controller = creative?.game === game && typeof creative.snapshot === 'function'
				? creative
				: null

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
				refreshPricePresentation()
				notify('creative-state-updated')
			})

			function snapshot() {
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
					state?.ready &&
					state?.creativeMode &&
					!state?.disposed
				)
			}

			function showPurchaseCosts() {
				if (previewPurchaseCosts !== null) return previewPurchaseCosts
				return api.config.get(CONFIG_KEY, false) === true
			}

			async function requestOperation(intent, execute) {
				if (
					disposed ||
					busy ||
					!isCreativeActive() ||
					typeof execute !== 'function' ||
					!intent ||
					!isIntentStillValid(game, intent)
				) {
					return Object.freeze({ accepted: false, executed: false, reason: busy ? 'busy' : 'invalid' })
				}

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
					const data = game.assembleSave(true)
					const saveIdentity = readSaveIdentity(game, data)
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

					if (!isCurrentToken(token)) {
						await removeUnusedSnapshot(created, 'transaction-invalidated')
						return Object.freeze({ accepted: true, executed: false, reason: 'invalidated' })
					}

					phase = 'revalidating'
					notify('creative-shop-' + intent.operation + '-revalidating')
					const currentIdentity = readCurrentSaveIdentity(game)
					if (
						currentIdentity !== saveIdentity ||
						!isIntentStillValid(game, intent) ||
						!isCreativeActive()
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
					if (!isIntentStillValid(game, intent) || !isCreativeActive()) {
						await removeUnusedSnapshot(created, 'target-changed')
						complete('cancelled', 'creative-shop-target-changed')
						return Object.freeze({ accepted: true, executed: false, reason: 'target-changed' })
					}
					executionStarted = true
					try {
						execute()
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
				const hint = new Cloud(game)
				hint.addResourceList(price || [])
				eraserHintCache = { signature, hint }
				return hint
			}

			function refreshPricePresentation() {
				if (disposed || !game) return
				const shop = game.shop
				try {
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
				const hint = new Cloud(targetGame)
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
					return !disposed && busy
				},
				isCreativeActive,
				showPurchaseCosts,
				requestOperation,
				applyItemPricePresentation,
				applyShopPresentation,
				applyHeldPricePresentation,
				getCreativeEraserHint,
				refreshPricePresentation,
				invalidate(reason) {
					return invalidateTransaction(reason || 'creative-shop-invalidated')
				},
				dispose(reason) {
					if (disposed) return false
					transactionToken += 1
					disposed = true
					busy = false
					phase = 'idle'
					operation = null
					input = null
					clearDisplayTimer()
					window.removeEventListener('modloader:config-preview', handleConfigPreview)
					if (typeof stopCreativeSubscription === 'function') stopCreativeSubscription()
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
			if (!game || game.plane) return null
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
				touchAction: touchAction || null
			})
		}

		function classifyOperation(game, touchAction) {
			if (!game || game.plane || !normalizeCell(game.hoveredCell)) return null
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
			qualificationGame = game
			qualificationDepth += 1
			try {
				return callback()
			} finally {
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
