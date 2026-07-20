ModLoader.register({
	id: 'Cattail_TweaksQuality_Dynamic-Details',
	init(api) {
		const detailKey = '_cattailDynamicDetails'
		const cubeHintKey = '_cattailDynamicCubeHint'
		const cubeProbeKey = '_cattailDynamicCubeProbe'
		const scanProbeKey = '_cattailDynamicScanProbe'
		const scanHintKey = '_cattailDynamicScanHint'
		const cubeMemoryKey = '_cattailDynamicCubeMemory'
		const detailToggleKey = '_cattailDynamicDetailsToggle'
		const coordinateToggleKey = '_cattailDynamicCoordinateToggle'
		const directionPointerToggleKey = '_cattailDynamicDirectionPointerToggle'
		const coordinateRenderLayerId = 'cursor'
		const coordinateRenderCallbackId = 'dynamic-details-coordinate-overlay'
		const widthStateKey = '_cattailDynamicWidthState'
		const cubeMemoryTtl = 15000
		const stableWidthTtl = 10000
		const rateWindow = 30000
		const opacityStorageKey = 'cattailDynamicDetailsHintOpacity'
		const opacityInfoStorageKey = 'cattailDynamicDetailsHintOpaqueInfo'
		const opacityMin = 0.25
		const opacityMax = 1
		const opacityStep = 0.1
		const coordinateDirectionTargetIds = ['chasm', 'voidsculpture', 'cookie', 'strange2', 'strange1', 'strange3']
		const resourceSourceStateKey = '_cattailDynamicResourceSourceState'
		const resourceSourceLastResourceKey = '_cattailDynamicResourceSourceLastResource'
		const resourceSourceToggleKey = '_cattailDynamicResourceSourceToggle'
		const resourceSourceLineLockKey = '_cattailDynamicResourceSourceLineLock'
		const resourceSourceLineResourceKey = '_cattailDynamicResourceSourceLineResource'
		const resourceSourceGpuLineModeKey = '_cattailDynamicResourceSourceGpuLineMode'
		const resourceSourceGpuRendererKey = '_cattailDynamicResourceSourceGpuRenderer'
		const resourceSourceLineRendererConfigKey = 'resourceSourceLineRenderer'
		const resourceSourceLineChartConfigKey = 'enableResourceSourceLineChart'
		const resourceSourceLineChartStateKey = '_cattailDynamicResourceSourceLineChart'
		const resourceSourceLineRendererCanvas = 0
		const resourceSourceLineRendererWebgl = 1
		const resourceSourceRenderLayerId = 'resource-links'
		const resourceSourceRenderCallbackId = 'dynamic-details-resource-source-links'
		const resourceSourceUiDemandCallbackId = 'dynamic-details-resource-source-ui-demand'
		const resourceSourceGpuLineDefaultOrder = 1
		const resourceSourceGpuLineStackOrder = 45
		const resourceSourceGpuCanvasLayoutSyncIntervalMs = 250
		const resourceSourceWarmupKey = '_cattailDynamicResourceSourceWarmup'
		const resourceSourceSuppressTransferKey = '_cattailDynamicResourceSourceSuppressTransfer'
		const resourceSourceActiveCubeKey = '_cattailDynamicResourceSourceActiveCube'
		const resourceSourceProducerKey = '_cattailDynamicResourceSourceProducer'
		const resourceSourcePrefsLoadedKey = '_cattailDynamicResourceSourcePrefsLoaded'
		const cubeResourceSourcePumpKey = '_cattailDynamicCubeSourcePump'
		const resourceSourceToggleStorageKey = 'cattailDynamicResourceSourceToggle'
		const resourceSourceLastResourceStorageKey = 'cattailDynamicResourceSourceLastResource'
		const resourceSourceLineLockStorageKey = 'cattailDynamicResourceSourceLineLock'
		const resourceSourceLineResourceStorageKey = 'cattailDynamicResourceSourceLineResource'
		const resourceSourceGpuLineModeStorageKey = 'cattailDynamicResourceSourceGpuLineMode'
		const resourceSourceLineChartModeStorageKey = 'cattailDynamicResourceSourceLineChartMode'
		const resourceSourceWindowMs = 30000
		const pumpSurgeDisplayMs = 2000
		const resourceSourceMinAmount = 0.0001
		const resourceSourceSummaryCacheMs = 350
		const resourceSourceEventBucketMs = 250
		const resourceSourceMaxEvents = 12000
		const resourceSourceMaxLinks = Number.POSITIVE_INFINITY
		const resourceSourceGpuCurveSegments = 72
		const resourceSourceConsumeColor = '#7a2b2b'
		const resourceSourceChartGainColor = '#6ea56e'
		const resourceSourceChartConsumeColor = '#C38C75'
		const resourceSourceLineChartStages = [
			{ from: 1, count: 60, to: 10 },
			{ from: 10, count: 12, to: 30 },
			{ from: 30, count: 40, to: 60 },
			{ from: 60, count: 60, to: 600 },
			{ from: 600, count: 12, to: 1800 },
			{ from: 1800, count: 8, to: 3600 }
		]
		const resourceSourceLineChartMaxBuckets = 256
		const resourceSourceLineChartWheelCooldownMs = 180
		const resourceSourceProfilerStorageKey = 'cattailDynamicResourceSourceProfiler'
		const resourceSourceProfilerSlowMs = 8
		const resourceSourceProfilerVerySlowMs = 25
		const resourceSourceProfilerThrottleMs = 1000
		const resourceSourceFrameStallMs = 120
		const resourceSourceFrameStallCooldownMs = 1000
		const resourceSourceLongTaskMinMs = 50
		const resourceSourceProfilerSampleLimit = 12
		const resourceSourceProfilerTraceLimit = 48
		const resourceSourceProfilerMethodDefaultSampleLimit = 240
		const resourceSourceImageCache = new Map()
		const resourceSourceProfilerStats = new Map()
		const resourceSourceProfilerMethodRecords = new Map()
		const resourceSourceProfilerSamples = []
		const resourceSourceProfilerTrace = []
		const resourceSourceProfilerActiveStack = []
		const resourceSourceImageDecodeQueue = []
		let resourceSourceImageDecodeActive = false
		let resourceSourceLineRendererConfigMigrated = false
		let resourceSourceFrameProbeStarted = false
		let resourceSourceLongTaskObserverStarted = false
		let resourceSourceLongTaskObserver = null
		let resourceSourceFrameLastTime = 0
		let resourceSourceFrameLastLog = 0
		let resourceSourceLineChartMode = true
		let resourceSourceLineChartModeLoaded = false
		let resourceSourceLineChartLastWheel = 0
		const buildCountdownStateKey = '_cattailShopBuildCountdownState'
		const buildCountdownElementKey = '_cattailShopBuildCountdownElement'
		const buildCountdownNextRefreshKey = '_cattailShopBuildCountdownNextRefresh'
		const buildCountdownLastAffordableKey = '_cattailShopBuildCountdownAffordable'
		const buildCountdownLastTextKey = '_cattailShopBuildCountdownText'
		const buildCountdownClass = 'cattail-build-countdown'
		const buildCountdownActivePriceClass = 'cattail-has-active-build-countdown'
		const buildCountdownStyleId = 'cattail-dynamic-build-countdown-style'
		const buildCountdownSampleWindowMs = 30000
		const buildCountdownEventBucketMs = 250
		const buildCountdownMaxResourceEvents = 160
		const buildCountdownSampleMinAgeMs = 2000
		const buildCountdownRateCacheMs = 500
		const buildCountdownRefreshMs = 1000
		const buildCountdownSnapshotSampleMs = 1000
		const buildCountdownRateSmoothRise = 0.45
		const buildCountdownRateSmoothFall = 0.2
		const rates = new WeakMap()
		const events = new WeakMap()
		let lastGame = null
		let coordinateTeleportPanel = null
		let zPressed = false
		let hintOpacity = 1
		let hintInfoOpaque = false
		let coordinateRenderApiRegistered = false
		let resourceSourceRenderApiRegistered = false
		let resourceSourceProfilerEnabled = false
		let resourceSourceProfilerMethodSampleLimit = resourceSourceProfilerMethodDefaultSampleLimit
		let resourceSourceProfilerRenderCycles = 0

		const namespace = window.CattailDynamicDetails = window.CattailDynamicDetails || {}

		namespace.installBuildingDetails = function () {
			if (namespace.buildingDetailsInstalled) return
			if (typeof Cloud === 'undefined' || typeof Entity === 'undefined') return
			namespace.buildingDetailsInstalled = true
			installStyles()
			patchShortcutHints()
			patchCloudUpdate()
			patchHintProducers()
			patchMeasuredOutputs()
			installDetailToggle()
			installOpacityControls()
			patchTransientCubeHints()
		}

		namespace.installResourceSources = function () {
			if (namespace.resourceSourcesInstalled) return
			if (typeof Game === 'undefined') return
			namespace.resourceSourcesInstalled = true
			installDetailToggle()
			installOpacityControls()
			patchTransientCubeHints()
			registerResourceSourceRenderApiLayers()
			installResourceSourceTracking()
		}

		namespace.installCoordinateOverlay = function () {
			if (namespace.coordinateOverlayInstalled) return
			if (typeof Game === 'undefined') return
			namespace.coordinateOverlayInstalled = true
			installStyles()
			installCoordinateToggle()
			installCoordinateTeleportPanel()
			registerCoordinateRenderApiOverlay()
			patchTransientCubeHints()
		}

		namespace.installDirectionPointers = function () {
			if (namespace.directionPointersInstalled) return
			if (typeof Game === 'undefined') return
			namespace.directionPointersInstalled = true
			installDirectionPointerToggle()
			registerCoordinateRenderApiOverlay()
			patchTransientCubeHints()
		}

		namespace.installShopBuildCountdown = function () {
			if (namespace.shopBuildCountdownInstalled) return
			if (typeof Shop === 'undefined') return
			namespace.shopBuildCountdownInstalled = true
			installBuildCountdown()
		}

		namespace.isReady = true

		function patchCloudUpdate() {
			api.patch(Cloud.prototype, 'update', function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					updateDetailPanel(this)
					return result
				}
			})
		}

		function patchHintProducers() {
			patchHintProducer(Entity.prototype, 'getHint')
			patchOwnHint(typeof Pump !== 'undefined' ? Pump : null)
			patchOwnHint(typeof Gradient !== 'undefined' ? Gradient : null)
			patchOwnHint(typeof Conductor !== 'undefined' ? Conductor : null)
			patchOwnHint(typeof Hollow !== 'undefined' ? Hollow : null)
			patchOwnHint(typeof Strange !== 'undefined' ? Strange : null)
			patchOwnHint(typeof Strange1 !== 'undefined' ? Strange1 : null)
			patchOwnHint(typeof Strange2 !== 'undefined' ? Strange2 : null)
			patchOwnHint(typeof Strange3 !== 'undefined' ? Strange3 : null)
			patchOwnHint(typeof Surge !== 'undefined' ? Surge : null)
			patchOwnHint(typeof Stabilizer !== 'undefined' ? Stabilizer : null)
			patchOwnHint(typeof Stabilizer2 !== 'undefined' ? Stabilizer2 : null)
			patchOwnHint(typeof Stabilizer3 !== 'undefined' ? Stabilizer3 : null)
			patchOwnHint(typeof Puncture !== 'undefined' ? Puncture : null)
			patchOwnHint(typeof Scan !== 'undefined' ? Scan : null)

			if (typeof Cube !== 'undefined') {
				api.patch(Cube.prototype, 'getHint', function (original) {
					return function (...args) {
						const hint = original.apply(this, args)
						if (hint) return hint
						if (!isDetailActive(this.master)) return hint
						return getCubeHint(this)
					}
				})

				api.patch(Cube.prototype, 'init', function (original) {
					return function (...args) {
						const result = original.apply(this, args)
						rememberCubeSnapshot(this)
						return result
					}
				})

				api.patch(Cube.prototype, 'onmousedown', function (original) {
					return function (...args) {
						const result = original.apply(this, args)
						rememberCubeSnapshot(this)
						return result
					}
				})

				api.patch(Cube.prototype, 'onDelete', function (original) {
					return function (...args) {
						rememberCubeSnapshot(this)
						return original.apply(this, args)
					}
				})
			}
		}

		function patchOwnHint(klass) {
			if (!klass?.prototype) return
			if (!Object.prototype.hasOwnProperty.call(klass.prototype, 'getHint')) return
			patchHintProducer(klass.prototype, 'getHint')
		}

		function patchHintProducer(target, methodName) {
			api.patch(target, methodName, function (original) {
				return function (...args) {
					const hint = original.apply(this, args)
					if (hint) ensureDetailPanel(hint, this)
					return hint
				}
			})
		}

		function patchMeasuredOutputs() {
			if (typeof Consumer !== 'undefined') {
				api.patch(Consumer.prototype, 'release', function (original) {
					return function (...args) {
						const output = (this.resources || []).map((value) => Math.floor(value * (1 + (this.multiplicator * this.bonus))))
						const result = original.apply(this, args)
						recordOutput(this, output)
						return result
					}
				})
			}

			if (typeof Annihilator !== 'undefined') {
				api.patch(Annihilator.prototype, 'tap', function (original) {
					return function (...args) {
						const result = original.apply(this, args)
						if (result) recordOutput(this, [0, 0, 0, 0, 0, 0, 0, 0, 1])
						return result
					}
				})
			}

			if (typeof Entropic3 !== 'undefined') {
				api.patch(Entropic3.prototype, 'tap', function (original) {
					return function (...args) {
						const result = original.apply(this, args)
						recordEvent(this)
						return result
					}
				})
			}
		}

		function patchShortcutHints() {
			if (typeof Cloud === 'undefined') return
			api.patch(Cloud.prototype, 'addQEString', function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					ensureOpacityShortcutHint(this.element)
					return result
				}
			})
		}

		function ensureOpacityShortcutHint(hintElement) {
			const qe = hintElement?.querySelector?.('.hintQE')
			if (!qe || qe.querySelector('.cattail-dynamic-z-wheel')) return
			if (qe.querySelector('.q_mobile, .e_mobile')) return
			const hint = document.createElement('div')
			hint.className = 'cattail-dynamic-z-wheel'
			qe.append(hint)
		}

		function getCubeHint(entity) {
			const language = entity.master?.language || 'en'
			const cached = entity[cubeHintKey]
			if (cached?.language === language) {
				ensureDetailPanel(cached.hint, entity)
				return cached.hint
			}

			const hint = new Cloud(entity.master)
			const description = '<b>' + entity.master.pronounce('entities', entity.name, 'name') + '</b><br/>' + entity.master.pronounce('entities', entity.name, 'description')
			hint.addDescription(description)
			ensureDetailPanel(hint, entity)
			entity[cubeHintKey] = { language, hint }
			return hint
		}

		function ensureDetailPanel(hint, entity) {
			if (!hint?.element || !entity?.master) return

			ensureOpacityShortcutHint(hint.element)
			const widthKey = getWidthStateKey(entity)
			const current = hint[detailKey]
			if (current?.entity === entity && current.widthKey === widthKey) return

			if (current?.topFlow) current.topFlow.remove()
			if (current?.line) current.line.remove()
			if (current?.body) current.body.remove()

			const line = document.createElement('div')
			line.className = 'hintLine cattail-dynamic-detail-line'
			const body = document.createElement('div')
			body.className = 'cattail-dynamic-detail'

			const description = hint.element.querySelector('.hintDescription')
			if (description?.parentNode) {
				description.insertAdjacentElement('afterend', line)
				line.insertAdjacentElement('afterend', body)
			} else {
				hint.element.append(line, body)
			}

			hint[detailKey] = {
				entity,
				widthKey,
				hintElement: hint.element,
				topFlow: null,
				line,
				body,
				lastSignature: '',
				nextRefresh: 0,
				widthState: getWidthState(entity, widthKey)
			}
		}

		function updateDetailPanel(hint) {
			const panel = hint?.[detailKey]
			const entity = panel?.entity
			const game = entity?.master
			if (!panel || !entity || !game) return

			const active = isDetailActive(game)
			panel.line.classList.toggle('active', active)
			panel.body.classList.toggle('active', active)
			if (!active) {
				renderTopFlow(panel, game, null)
				clearStableWidths(panel)
				return
			}

			const details = describeEntity(entity)
			const now = performance.now()
			const signature = details.signature + '|lang:' + (game.language || 'en')
			if (signature === panel.lastSignature && now < panel.nextRefresh) return

			panel.lastSignature = signature
			panel.nextRefresh = now + (details.refreshMs || 500)
			renderTopFlow(panel, game, details.topFlow)
			renderDetails(panel.body, entity, details.rows)
			stabilizeDetailWidths(panel)
		}

		function isDetailActive(game) {
			return !!(isBuildingDetailsFeatureEnabled() && (isDetailToggleActive(game) || (game?.altActive && game?.shiftPressed)))
		}

		function isScannedVoidCellDetailActive(game) {
			return !!(isBuildingDetailsFeatureEnabled() && (isDetailToggleActive(game) || game?.altActive))
		}

		function installDetailToggle() {
			if (window._cattailDynamicDetailsToggleInstalled) return
			window._cattailDynamicDetailsToggleInstalled = true
			addEventListener('keydown', function (event) {
				if (!isDetailToggleEvent(event) || event.repeat) return
				const game = lastGame
				if (!game) return
				if (isResourceSourceFeatureEnabled() && isResourceSourceContext(game)) {
					const wasActive = isResourceSourceToggleActive(game)
					const previousResource = Number.isInteger(game[resourceSourceLastResourceKey]) ? game[resourceSourceLastResourceKey] : null
					const selectedResource = getResourceSourceSelectedResourceId(game)
					setResourceSourceToggle(game, !wasActive || (Number.isInteger(selectedResource) && selectedResource !== previousResource))
				} else if (isBuildingDetailsFeatureEnabled() && isBuildingDetailContext(game)) {
					setDetailToggle(game, !isDetailToggleActive(game))
				} else {
					return
				}
				event.preventDefault()
				event.stopImmediatePropagation()
			}, true)
		}

		function isDetailToggleEvent(event) {
			return !!(
				event?.altKey &&
				event?.ctrlKey &&
				(event.keyCode === 17 || event.keyCode === 18 || event.key === 'Control' || event.key === 'Alt')
			)
		}

		function isDetailToggleActive(game) {
			return !!game?.[detailToggleKey]
		}

		function isResourceSourceToggleActive(game) {
			if (!isResourceSourceFeatureEnabled()) return false
			initializeResourceSourcePreferences(game)
			return !!game?.[resourceSourceToggleKey]
		}

		function isResourceSourceContext(game) {
			return !!(isResourceSourceFeatureEnabled() && Number.isInteger(game?.hoveredResource))
		}

		function isBuildingDetailContext(game) {
			return !!(isBuildingDetailsFeatureEnabled() && (game?.hoveredEntity || shouldUseTransientCubeHint(game) || isScannedVoidCellContext(game)))
		}

		function installCoordinateToggle() {
			if (window._cattailDynamicCoordinateToggleInstalled) return
			window._cattailDynamicCoordinateToggleInstalled = true
			addEventListener('keydown', function (event) {
				const game = lastGame
				if (!game || !isCoordinateToggleEvent(event, game) || event.repeat) return
				setCoordinateToggle(game, !isCoordinateToggleActive(game))
				event.preventDefault()
				event.stopImmediatePropagation()
			}, true)
		}

		function isCoordinateToggleEvent(event, game) {
			const key = String(event?.key || '').toLowerCase()
			const altC = !!(event?.altKey && !event?.shiftKey && (key === 'c' || event?.code === 'KeyC' || event?.keyCode === 67))
			return altC
		}
		function isCoordinateToggleActive(game) {
			return !!game?.[coordinateToggleKey]
		}

		function setCoordinateToggle(game, active) {
			if (game) game[coordinateToggleKey] = !!active
		}

		function installCoordinateTeleportPanel() {
			if (window._cattailDynamicCoordinateTeleportInstalled) return
			window._cattailDynamicCoordinateTeleportInstalled = true
			addEventListener('keydown', function (event) {
				const game = lastGame
				if (isCoordinateTeleportPanelEvent(event)) {
					if (event.key === 'Escape') {
						hideCoordinateTeleportPanel()
						event.preventDefault()
					} else if (event.key === 'Enter') {
						teleportCoordinatePanelTarget(game)
						event.preventDefault()
					}
					event.stopImmediatePropagation()
					return
				}
				if (!game || !isCoordinateTeleportToggleEvent(event, game) || event.repeat) return
				showCoordinateTeleportPanel(game)
				event.preventDefault()
				event.stopImmediatePropagation()
			}, true)
			addEventListener('mousedown', function (event) {
				if (!coordinateTeleportPanel?.element || !coordinateTeleportPanel.visible) return
				if (coordinateTeleportPanel.element.contains(event.target)) return
				hideCoordinateTeleportPanel()
			}, true)
		}

		function isCoordinateTeleportToggleEvent(event, game) {
			const key = String(event?.key || '').toLowerCase()
			return !!(
				event?.altKey &&
				event?.shiftKey &&
				!event?.ctrlKey &&
				(key === 'c' || event?.code === 'KeyC' || event?.keyCode === 67) &&
				isCoordinateEmptyCellContext(game)
			)
		}

		function isCoordinateTeleportPanelEvent(event) {
			return !!(coordinateTeleportPanel?.element && event?.target && coordinateTeleportPanel.element.contains(event.target))
		}

		function showCoordinateTeleportPanel(game) {
			if (!game || !Array.isArray(game.hoveredCell)) return
			const panel = getCoordinateTeleportPanel()
			panel.u.value = String(game.hoveredCell[0])
			panel.v.value = String(game.hoveredCell[1])
			panel.game = game
			panel.visible = true
			panel.element.classList.add('visible')
			positionCoordinateTeleportPanel(game, panel)
			requestAnimationFrame(() => {
				positionCoordinateTeleportPanel(game, panel)
				panel.u.focus()
				panel.u.select()
			})
		}

		function hideCoordinateTeleportPanel() {
			if (!coordinateTeleportPanel) return
			coordinateTeleportPanel.visible = false
			coordinateTeleportPanel.element.classList.remove('visible')
		}

		function getCoordinateTeleportPanel() {
			if (coordinateTeleportPanel?.element) return coordinateTeleportPanel
			const element = document.createElement('div')
			element.className = 'cattail-coordinate-teleport'

			const u = document.createElement('input')
			u.type = 'number'
			u.step = '1'
			u.inputMode = 'numeric'
			u.placeholder = 'u'
			u.setAttribute('aria-label', 'u')

			const v = document.createElement('input')
			v.type = 'number'
			v.step = '1'
			v.inputMode = 'numeric'
			v.placeholder = 'v'
			v.setAttribute('aria-label', 'v')

			const button = document.createElement('button')
			button.type = 'button'
			button.textContent = String.fromCharCode(8593)
			button.setAttribute('aria-label', 'teleport')

			element.append(u, v, button)
			element.addEventListener('mousedown', function (event) { event.stopPropagation() })
			element.addEventListener('mouseup', function (event) { event.stopPropagation() })
			element.addEventListener('click', function (event) { event.stopPropagation() })
			button.addEventListener('click', function (event) {
				teleportCoordinatePanelTarget(coordinateTeleportPanel?.game || lastGame)
				event.preventDefault()
				event.stopPropagation()
			})

			document.body.append(element)
			coordinateTeleportPanel = { element, u, v, button, visible: false, game: null }
			return coordinateTeleportPanel
		}

		function positionCoordinateTeleportPanel(game, panel = coordinateTeleportPanel) {
			if (!game || !panel?.element) return
			const canvasRect = game.canvas?.getBoundingClientRect?.()
			const baseX = (canvasRect?.left || 0) + (game.mouse?.offsetxy?.[0] || 0)
			const baseY = (canvasRect?.top || 0) + (game.mouse?.offsetxy?.[1] || 0)
			panel.element.style.left = baseX + 'px'
			panel.element.style.top = baseY + 'px'
			const rect = panel.element.getBoundingClientRect?.()
			if (!rect) return
			const margin = 8
			const wantedX = Math.min(Math.max(baseX + 24, margin), Math.max(margin, innerWidth - rect.width - margin))
			const wantedY = Math.min(Math.max(baseY - rect.height * 0.5, margin), Math.max(margin, innerHeight - rect.height - margin))
			panel.element.style.left = wantedX + 'px'
			panel.element.style.top = wantedY + 'px'
		}

		function teleportCoordinatePanelTarget(game) {
			const panel = coordinateTeleportPanel
			if (!game || !panel) return
			const u = parseCoordinateTeleportValue(panel.u.value)
			const v = parseCoordinateTeleportValue(panel.v.value)
			if (!Number.isFinite(u) || !Number.isFinite(v)) return
			teleportToCoordinate(game, [u, v])
			hideCoordinateTeleportPanel()
		}

		function parseCoordinateTeleportValue(value) {
			const number = Number(String(value).trim())
			return Number.isFinite(number) ? Math.round(number) : NaN
		}

		function teleportToCoordinate(game, position) {
			if (!game || !Array.isArray(position) || !Array.isArray(game.translation) || typeof game.uvToXY !== 'function') return
			const projected = game.uvToXY(position)
			const zoom = Number(game.zoom) || 1
			if (!Array.isArray(projected)) return
			const ratio = Number(game.pixelRatio) || 1
			const mouse = Array.isArray(game.mouse?.offsetxy) ? game.mouse.offsetxy : [0, 0]
			const desired = [
				(Number(mouse[0]) || 0) * ratio - (Number(game.w2) || (Number(game.w) || 0) / 2),
				(Number(mouse[1]) || 0) * ratio - (Number(game.h2) || (Number(game.h) || 0) / 2)
			]
			game.translation[0] += (projected[0] - desired[0]) / zoom
			game.translation[1] += (projected[1] - desired[1]) / zoom
			game.updateMouseData?.()
		}
		function installDirectionPointerToggle() {
			if (window._cattailDynamicDirectionPointerToggleInstalled) return
			window._cattailDynamicDirectionPointerToggleInstalled = true
			addEventListener('keydown', function (event) {
				const game = lastGame
				if (!game || !isDirectionPointerToggleEvent(event, game) || event.repeat) return
				setDirectionPointerToggle(game, !isDirectionPointerToggleActive(game))
				event.preventDefault()
				event.stopImmediatePropagation()
			}, true)
		}

		function isDirectionPointerToggleEvent(event, game) {
			const key = String(event?.key || '').toLowerCase()
			return !!(
				event?.altKey &&
				event?.ctrlKey &&
				(event.keyCode === 17 || event.keyCode === 18 || key === 'control' || key === 'alt') &&
				isCoordinateEmptyCellContext(game)
			)
		}

		function isDirectionPointerToggleActive(game) {
			return !!game?.[directionPointerToggleKey]
		}

		function setDirectionPointerToggle(game, active) {
			if (game) game[directionPointerToggleKey] = !!active
		}

		function setDetailToggle(game, active) {
			game[detailToggleKey] = !!active
			document.body.classList.toggle('cattail-dynamic-details-locked', !!active)
			if (!active && !game.altActive) game.removeHint?.()
		}

		function setResourceSourceToggle(game, active) {
			if (!game) return
			initializeResourceSourcePreferences(game)
			game[resourceSourceToggleKey] = !!active
			if (active) {
				const selectedResource = getResourceSourceSelectedResourceId(game)
				if (Number.isInteger(selectedResource)) rememberResourceSourceResource(game, selectedResource)
			}
			saveStoredBoolean(resourceSourceToggleStorageKey, !!active)
		}

		function initializeResourceSourcePreferences(game) {
			if (!game) return
			migrateResourceSourceLineRendererConfig()
			if (!game[resourceSourcePrefsLoadedKey]) {
				game[resourceSourcePrefsLoadedKey] = true
				game[resourceSourceToggleKey] = loadStoredBoolean(resourceSourceToggleStorageKey, false)
				game[resourceSourceLineLockKey] = loadStoredBoolean(resourceSourceLineLockStorageKey, false)
			}
			game[resourceSourceGpuLineModeKey] = getConfiguredResourceSourceGpuLineMode()
			const lastResource = loadStoredInteger(resourceSourceLastResourceStorageKey)
			const lineResource = loadStoredInteger(resourceSourceLineResourceStorageKey)
			if (Number.isInteger(lastResource)) game[resourceSourceLastResourceKey] = lastResource
			if (Number.isInteger(lineResource)) game[resourceSourceLineResourceKey] = lineResource
			if (!Number.isInteger(game[resourceSourceLastResourceKey]) && Number.isInteger(lineResource)) game[resourceSourceLastResourceKey] = lineResource
			if (game[resourceSourceLineLockKey] && !Number.isInteger(game[resourceSourceLineResourceKey]) && Number.isInteger(lastResource)) game[resourceSourceLineResourceKey] = lastResource
		}

		function migrateResourceSourceLineRendererConfig() {
			if (resourceSourceLineRendererConfigMigrated) return
			resourceSourceLineRendererConfigMigrated = true
			try {
				const configKey = getModConfigStorageKey(resourceSourceLineRendererConfigKey)
				if (localStorage.getItem(configKey) !== null) return
				const legacy = localStorage.getItem(resourceSourceGpuLineModeStorageKey)
				if (legacy === null) return
				api.config.set(resourceSourceLineRendererConfigKey, legacy === '0' ? resourceSourceLineRendererCanvas : resourceSourceLineRendererWebgl)
			} catch (error) {}
		}

		function getConfiguredResourceSourceGpuLineMode() {
			return normalizeResourceSourceLineRendererValue(api.config.get(resourceSourceLineRendererConfigKey, resourceSourceLineRendererWebgl)) === resourceSourceLineRendererWebgl
		}

		function setConfiguredResourceSourceGpuLineMode(active) {
			const mode = active ? resourceSourceLineRendererWebgl : resourceSourceLineRendererCanvas
			api.config.set(resourceSourceLineRendererConfigKey, mode)
			return mode
		}

		function normalizeResourceSourceLineRendererValue(value) {
			const text = String(value ?? '').trim().toLowerCase()
			if (text === '0' || text === 'canvas' || text === 'canvas2d' || text === 'canvas 2d') return resourceSourceLineRendererCanvas
			if (text === '1' || text === 'webgl' || text === 'gpu') return resourceSourceLineRendererWebgl
			const number = Number(value)
			return Number.isFinite(number) && number <= 0 ? resourceSourceLineRendererCanvas : resourceSourceLineRendererWebgl
		}

		function getModConfigStorageKey(key) {
			return 'modloader:' + api.id + ':config:' + key
		}

		function isFeatureEnabled(key, fallback = true) {
			return api.config.get(key, fallback) !== false
		}

		function isBuildingDetailsFeatureEnabled() {
			return isFeatureEnabled('enableBuildingDetails')
		}

		function isResourceSourceFeatureEnabled() {
			return isFeatureEnabled('enableResourceSourceDetails')
		}

		function isResourceSourceLineChartEnabled() {
			return isResourceSourceFeatureEnabled() && isFeatureEnabled(resourceSourceLineChartConfigKey)
		}

		function isResourceSourceLineChartModeActive() {
			loadResourceSourceLineChartMode()
			return resourceSourceLineChartMode
		}

		function loadResourceSourceLineChartMode() {
			if (resourceSourceLineChartModeLoaded) return
			resourceSourceLineChartModeLoaded = true
			resourceSourceLineChartMode = loadStoredBoolean(resourceSourceLineChartModeStorageKey, true)
		}

		function setResourceSourceLineChartMode(active) {
			resourceSourceLineChartMode = !!active
			resourceSourceLineChartModeLoaded = true
			saveStoredBoolean(resourceSourceLineChartModeStorageKey, resourceSourceLineChartMode)
		}

		function isCoordinateOverlayFeatureEnabled() {
			return isFeatureEnabled('enableCoordinateOverlay')
		}

		function isDirectionPointersFeatureEnabled() {
			return isFeatureEnabled('enableDirectionPointers')
		}
		function installOpacityControls() {
			if (window._cattailDynamicDetailsOpacityInstalled) return
			window._cattailDynamicDetailsOpacityInstalled = true
			hintOpacity = loadHintOpacity()
			hintInfoOpaque = loadHintInfoOpaque()
			applyHintOpacity(hintOpacity)
			applyHintInfoOpacityMode(hintInfoOpaque)

			addEventListener('keydown', function (event) {
				if (isOpacityKey(event)) zPressed = true
			}, true)
			addEventListener('mousedown', function (event) {
				if (isResourceSourceLineLockToggleMouseEvent(event, lastGame)) {
					toggleResourceSourceLineLock(lastGame)
					event.preventDefault()
					event.stopImmediatePropagation()
					return
				}
				if (!isOpacityInfoToggleMouseEvent(event) || !lastGame || !isBuildingDetailContext(lastGame)) return
				setHintInfoOpaque(!hintInfoOpaque)
				event.preventDefault()
				event.stopImmediatePropagation()
			}, true)
			addEventListener('auxclick', function (event) {
				const game = lastGame
				const handlesResourceLines = isResourceSourceLineLockToggleMouseEvent(event, game)
				const handlesOpacityMode = isOpacityInfoToggleMouseEvent(event) && game && isBuildingDetailContext(game)
				if (!handlesResourceLines && !handlesOpacityMode) return
				event.preventDefault()
				event.stopImmediatePropagation()
			}, true)
			addEventListener('keyup', function (event) {
				if (isOpacityKey(event)) zPressed = false
			}, true)
			addEventListener('blur', function () {
				zPressed = false
			}, true)
			addEventListener('wheel', function (event) {
				const game = lastGame
				if (!game || !zPressed || !isOpacityWheelActive(game, event)) return
				const delta = event.deltaY || event.deltaX || 0
				event.preventDefault()
				event.stopImmediatePropagation()
				if (!delta) return
				const direction = delta < 0 ? 1 : -1
				const next = clampOpacity(hintOpacity + direction * opacityStep)
				if (next === hintOpacity) return
				hintOpacity = next
				saveHintOpacity(hintOpacity)
				applyHintOpacity(hintOpacity)
			}, { capture: true, passive: false })
		}

		function isOpacityKey(event) {
			const key = String(event?.key || '').toLowerCase()
			return key === 'z' || event?.code === 'KeyZ' || event?.keyCode === 90
		}

		function isOpacityInfoToggleMouseEvent(event) {
			return event?.button === 1
		}

		function isResourceSourceLineLockToggleMouseEvent(event, game) {
			return !!(
				game &&
				event?.button === 1 &&
				isResourceSourceContext(game) &&
				Number.isInteger(game.hoveredResource)
			)
		}

		function isResourceSourceControlContext(game) {
			return !!(isResourceSourceContext(game) || (isResourceSourceToggleActive(game) && !isBuildingDetailContext(game)))
		}

		function isOpacityWheelActive(game, event) {
			return !!(!isResourceSourceControlContext(game) && (isDetailToggleActive(game) || event?.altKey || game?.altActive))
		}

		function loadHintOpacity() {
			try {
				const value = Number(localStorage.getItem(opacityStorageKey))
				if (Number.isFinite(value)) return clampOpacity(value)
			} catch (error) {}
			return opacityMax
		}

		function saveHintOpacity(value) {
			try {
				localStorage.setItem(opacityStorageKey, String(value))
			} catch (error) {}
		}

		function loadHintInfoOpaque() {
			try {
				return localStorage.getItem(opacityInfoStorageKey) === '1'
			} catch (error) {}
			return false
		}

		function saveHintInfoOpaque(value) {
			try {
				localStorage.setItem(opacityInfoStorageKey, value ? '1' : '0')
			} catch (error) {}
		}

		function loadStoredBoolean(key, fallback = false) {
			try {
				const value = localStorage.getItem(key)
				if (value === '1') return true
				if (value === '0') return false
			} catch (error) {}
			return fallback
		}

		function saveStoredBoolean(key, value) {
			try {
				localStorage.setItem(key, value ? '1' : '0')
			} catch (error) {}
		}

		function loadStoredInteger(key) {
			try {
				const stored = localStorage.getItem(key)
				if (stored === null || stored === '') return null
				const value = Number(stored)
				if (Number.isInteger(value)) return value
			} catch (error) {}
			return null
		}

		function saveStoredInteger(key, value) {
			try {
				if (Number.isInteger(value)) localStorage.setItem(key, String(value))
				else localStorage.removeItem(key)
			} catch (error) {}
		}
		function setHintInfoOpaque(active) {
			hintInfoOpaque = !!active
			saveHintInfoOpaque(hintInfoOpaque)
			applyHintInfoOpacityMode(hintInfoOpaque)
		}

		function applyHintInfoOpacityMode(active) {
			document.documentElement.classList.toggle('cattail-dynamic-info-opaque', !!active)
		}

		function applyHintOpacity(value) {
			const opacity = clampOpacity(value)
			const shellOpacity = Math.max(0, Math.min(1, (opacity - opacityMin) / (opacityMax - opacityMin)))
			document.documentElement.style.setProperty('--cattail-dynamic-hint-opacity', String(opacity))
			document.documentElement.style.setProperty('--cattail-dynamic-hint-shell-opacity', String(round(shellOpacity)))
			document.documentElement.style.setProperty('--cattail-dynamic-hint-shadow-opacity', String(round(shellOpacity * 0.12)))
		}

		function clampOpacity(value) {
			return Math.max(opacityMin, Math.min(opacityMax, Math.round(Number(value) * 100) / 100))
		}

		function registerCoordinateRenderApiOverlay() {
			if (coordinateRenderApiRegistered || !api.render || typeof api.render.onLayer !== 'function') return
			api.render.onLayer(coordinateRenderLayerId, function ({ game, ctx }) {
				renderCoordinateOverlay(game, ctx)
			}, {
				id: coordinateRenderCallbackId,
				order: 20,
				space: 'screen',
				enabled({ game }) { return shouldDemandCoordinateRenderApiOverlay(game) }
			})
			coordinateRenderApiRegistered = true
		}

		function shouldUseCoordinateRenderApiOverlay() {
			if (!coordinateRenderApiRegistered || !api.render) return false
			if (typeof api.render.isEnabled === 'function') return api.render.isEnabled() !== false
			return true
		}

		function registerResourceSourceRenderApiLayers() {
			if (resourceSourceRenderApiRegistered || !api.render || typeof api.render.onLayer !== 'function') return
			if (typeof api.render.registerLayer === 'function') {
				api.render.registerLayer(resourceSourceRenderLayerId, { order: 45, zIndex: 45, clearEachFrame: true })
			}
			if (typeof api.render.demandLayer === 'function') {
				api.render.demandLayer('ui', {
					id: resourceSourceUiDemandCallbackId,
					enabled({ game }) { return shouldDemandResourceSourceRenderApiLinks(game) }
				})
			} else {
				api.render.onLayer('ui', function () {}, {
					id: resourceSourceUiDemandCallbackId,
					order: -1000,
					copyTransform: false,
					copyState: false,
					enabled({ game }) { return shouldDemandResourceSourceRenderApiLinks(game) }
				})
			}
			api.render.onLayer(resourceSourceRenderLayerId, function ({ game, ctx }) {
				if (!shouldUseResourceSourceRenderApiLinks(game)) {
					clearResourceSourceGpuLines(game)
					return
				}
				renderResourceSourceLinks(game, ctx)
			}, {
				id: resourceSourceRenderCallbackId,
				order: 20,
				space: 'screen',
				enabled({ game }) { return shouldDemandResourceSourceRenderApiLinks(game) }
			})
			resourceSourceRenderApiRegistered = true
		}

		function shouldUseResourceSourceRenderApiLinks(game) {
			if (!game || !resourceSourceRenderApiRegistered || !api.render || !isResourceSourceFeatureEnabled()) return false
			if (isResourceSourceOverlayInactive(game)) return false
			if (typeof api.render.isEnabled === 'function') return api.render.isEnabled() !== false
			return true
		}

		function shouldDemandResourceSourceRenderApiLinks(game) {
			return !!(
				shouldUseResourceSourceRenderApiLinks(game) &&
				(isResourceSourceLinkActive(game) || isResourceSourceGpuLineCanvasVisible(game))
			)
		}

		function isResourceSourceGpuLineCanvasVisible(game) {
			const canvas = game?.[resourceSourceGpuRendererKey]?.canvas
			return !!(canvas && canvas.style.display !== 'none')
		}

		function patchTransientCubeHints() {
			if (typeof Game === 'undefined') return
			if (window._cattailDynamicCursorOverlayInstalled) return
			window._cattailDynamicCursorOverlayInstalled = true
			api.patch(Game.prototype, 'renderCursor', function (original) {
				return function (...args) {
					lastGame = this
					const locked = isBuildingDetailsFeatureEnabled() && isDetailToggleActive(this)
					const previousAlt = this.altActive
					const previousShift = this.shiftPressed
					const previousHovered = this.hoveredEntity
					let probe = null
					let scanProbe = null

					if (locked) {
						this.altActive = true
						this.shiftPressed = true
					}

					let result
					try {
						if (shouldUseTransientCubeHint(this)) {
							probe = getTransientCubeProbe(this)
							if (probe) this.hoveredEntity = probe
						}
						if (!probe && shouldUseScannedVoidCellHint(this)) {
							scanProbe = getScannedVoidCellProbe(this)
							if (scanProbe) this.hoveredEntity = scanProbe
						}
						result = original.apply(this, args)
					} finally {
						if (scanProbe && this.hoveredEntity === scanProbe) this.hoveredEntity = previousHovered
						if (probe && this.hoveredEntity === probe) this.hoveredEntity = previousHovered
						if (locked) {
							this.altActive = previousAlt
							this.shiftPressed = previousShift
						}
					}
					if (!shouldUseCoordinateRenderApiOverlay()) renderCoordinateOverlay(this)
					return result
				}
			})
		}

		function renderCoordinateOverlay(game, ctx = game?.ctx) {
			if (!shouldShowCoordinateOverlay(game)) {
				renderCoordinateDirectionIndicators(game, ctx)
				return
			}
			if (!ctx) return
			const cell = game.hoveredCell
			const text = 'X: ' + cell[0] + ' Y: ' + cell[1]
			const pixelRatio = game.pixelRatio || 1
			const unit = game.screenUnit || game.unit || 1
			const fontSize = Math.max(9 * pixelRatio, unit * 0.105)
			const gap = Math.max(8 * pixelRatio, fontSize * 0.85)
			const margin = Math.max(4 * pixelRatio, fontSize * 0.35)
			const hintRect = getCurrentHintCanvasRect(game)
			const withHintCard = !!hintRect

			ctx.save()
			ctx.font = '400 ' + fontSize + 'px Montserrat, Arial, sans-serif'
			ctx.textBaseline = 'top'
			ctx.textAlign = 'left'
			const textWidth = ctx.measureText(text).width
			const textHeight = fontSize * 1.18
			const paddingX = withHintCard ? Math.max(6 * pixelRatio, fontSize * 0.58) : 0
			const paddingY = withHintCard ? Math.max(4 * pixelRatio, fontSize * 0.34) : 0
			const width = textWidth + paddingX * 2
			const height = textHeight + paddingY * 2
			const point = getCoordinateOverlayPosition(game, width, height, gap, margin, hintRect)

			if (withHintCard) {
				const shellOpacity = Math.max(0, Math.min(1, (hintOpacity - opacityMin) / (opacityMax - opacityMin)))
				const backgroundOpacity = hintInfoOpaque ? round(shellOpacity) : 1
				const sharedOpacity = hintInfoOpaque ? 1 : hintOpacity
				ctx.globalAlpha = sharedOpacity
				ctx.shadowColor = 'rgba(0, 0, 0, ' + round((hintInfoOpaque ? shellOpacity : 1) * 0.12) + ')'
				ctx.shadowBlur = Math.max(2 * pixelRatio, fontSize * 0.42)
				ctx.shadowOffsetY = Math.max(1 * pixelRatio, fontSize * 0.12)
				ctx.fillStyle = 'rgba(255, 255, 255, ' + backgroundOpacity + ')'
				fillCoordinateRoundRect(ctx, point.x, point.y, width, height, Math.max(2 * pixelRatio, fontSize * 0.22))

				ctx.shadowColor = 'rgba(0, 0, 0, 0)'
				ctx.shadowBlur = 0
				ctx.shadowOffsetY = 0
				ctx.globalAlpha = sharedOpacity
				ctx.fillStyle = '#2d3440'
				ctx.fillText(text, point.x + paddingX, point.y + paddingY)
			} else {
				ctx.shadowColor = 'rgba(255, 255, 255, 0.72)'
				ctx.shadowBlur = Math.max(1, pixelRatio * 1.6)
				ctx.fillStyle = 'rgba(45, 52, 64, 0.82)'
				ctx.fillText(text, point.x, point.y)
			}
			ctx.restore()
			renderCoordinateDirectionIndicators(game, ctx)
		}

		function getCoordinateOverlayPosition(game, width, height, gap, margin, hintRect = getCurrentHintCanvasRect(game)) {
			if (hintRect) {
				const x = clampNumber(hintRect.x + hintRect.width / 2 - width / 2, margin, Math.max(margin, game.w - width - margin))
				let y = hintRect.y - height - gap
				if (y < margin) y = hintRect.y + hintRect.height + gap
				y = clampNumber(y, margin, Math.max(margin, game.h - height - margin))
				return { x, y }
			}

			const mouse = game.mouse?.xy || [0, 0]
			const offsetX = Math.max(10 * (game.pixelRatio || 1), width * 0.12)
			const offsetY = Math.max(12 * (game.pixelRatio || 1), height * 1.05)
			return {
				x: clampNumber(mouse[0] + offsetX, margin, Math.max(margin, game.w - width - margin)),
				y: clampNumber(mouse[1] - offsetY - height, margin, Math.max(margin, game.h - height - margin))
			}
		}

		function fillCoordinateRoundRect(ctx, x, y, width, height, radius) {
			const r = Math.max(0, Math.min(radius, width / 2, height / 2))
			ctx.beginPath()
			if (ctx.roundRect) {
				ctx.roundRect(x, y, width, height, r)
			} else {
				ctx.moveTo(x + r, y)
				ctx.lineTo(x + width - r, y)
				ctx.quadraticCurveTo(x + width, y, x + width, y + r)
				ctx.lineTo(x + width, y + height - r)
				ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
				ctx.lineTo(x + r, y + height)
				ctx.quadraticCurveTo(x, y + height, x, y + height - r)
				ctx.lineTo(x, y + r)
				ctx.quadraticCurveTo(x, y, x + r, y)
			}
			ctx.closePath()
			ctx.fill()
		}

		function renderCoordinateDirectionIndicators(game, ctx = game?.ctx) {
			if (!shouldShowCoordinateDirectionIndicators(game)) return
			const targets = collectCoordinateDirectionTargets(game)
			if (!targets.length) return
			if (!ctx) return
			const pixelRatio = game.pixelRatio || 1
			const unit = game.screenUnit || game.unit || 1
			const iconSize = Math.max(21 * pixelRatio, Math.min(34 * pixelRatio, unit * 0.26))
			const arrowSize = Math.max(5 * pixelRatio, iconSize * 0.24)
			const baseRadius = Math.max(52 * pixelRatio, iconSize * 2.55)
			const spacing = iconSize * 1.15
			const margin = Math.max(3 * pixelRatio, iconSize * 0.25)
			const mouse = game.mouse?.xy || [game.w / 2, game.h / 2]
			const originPoint = mouse
			const placed = []

			ctx.save()
			ctx.globalAlpha = hintInfoOpaque ? 1 : hintOpacity
			for (const target of targets) {
				const targetPoint = game.uvToXYUntranslated(target.position)
				let dx = targetPoint[0] - originPoint[0]
				let dy = targetPoint[1] - originPoint[1]
				if (Math.abs(dx) + Math.abs(dy) < 0.001) {
					dx = 0
					dy = -1
				}
				const angle = Math.atan2(dy, dx)
				const directionX = Math.cos(angle)
				const directionY = Math.sin(angle)
				let radius = baseRadius
				let x = mouse[0]
				let y = mouse[1]
				for (let attempt = 0; attempt < 5; attempt++) {
					x = clampNumber(mouse[0] + directionX * radius, margin + iconSize / 2, Math.max(margin + iconSize / 2, game.w - margin - iconSize / 2))
					y = clampNumber(mouse[1] + directionY * radius, margin + iconSize / 2, Math.max(margin + iconSize / 2, game.h - margin - iconSize / 2))
					if (!placed.some((point) => Math.hypot(point[0] - x, point[1] - y) < spacing)) break
					radius += spacing * 0.85
				}
				drawCoordinateDirectionIcon(game, target, x, y, iconSize)
				drawCoordinateDirectionArrow(ctx, x + directionX * iconSize * 0.74, y + directionY * iconSize * 0.74, angle, arrowSize)
				placed.push([x, y])
			}
			ctx.restore()
		}

		function shouldShowCoordinateDirectionIndicators(game) {
			return !!(
				isDirectionPointersFeatureEnabled() &&
				isCoordinateEmptyCellContext(game) &&
				((game.altActive && game.shiftPressed) || isDirectionPointerToggleActive(game))
			)
		}

		function shouldDemandCoordinateRenderApiOverlay(game) {
			return !!(shouldShowCoordinateOverlay(game) || shouldShowCoordinateDirectionIndicators(game))
		}

		function collectCoordinateDirectionTargets(game) {
			const targets = []
			for (const id of coordinateDirectionTargetIds) {
				if (!shouldIncludeCoordinateDirectionTarget(game, id)) continue
				const entity = findCoordinateDirectionEntity(game, id)
				if (entity) targets.push({ id, entity, position: entity.position })
			}
			targets.push({ id: 'origin', position: [0, 0] })
			return targets
		}

		function shouldIncludeCoordinateDirectionTarget(game, id) {
			return id !== 'cookie' || isCookieDirectionUnlocked(game)
		}

		function isCookieDirectionUnlocked(game) {
			return !!(
				hasCookieDirectionPassword() ||
				game?.cookie ||
				isAchievementUnlocked(game, 'COOKIECLICKER')
			)
		}

		function hasCookieDirectionPassword() {
			return String(api.config.get('cookieDirectionPassword', '') || '').trim().toLowerCase() === 'cookie'
		}

		function isAchievementUnlocked(game, steamid) {
			const achievements = game?.codex?.achievements
			const fired = game?.achiever?.fired
			if (!Array.isArray(achievements) || !Array.isArray(fired)) return false
			const index = achievements.findIndex((achievement) => achievement?.steamid === steamid)
			return index >= 0 && !!fired[index]
		}

		function findCoordinateDirectionEntity(game, id) {
			if (!Array.isArray(game?.stuff)) return null
			return game.stuff.find((entity) => entity?.name === id && Array.isArray(entity.position)) || null
		}

		function drawCoordinateDirectionIcon(game, target, x, y, size) {
			if (target.id === 'origin') {
				drawCoordinateOriginIcon(game, x, y, size)
				return
			}
			drawResourceSourceIcon(game, { kind: 'entity', name: target.id, entity: target.entity }, x, y, size)
		}

		function drawCoordinateOriginIcon(game, x, y, size) {
			const ctx = game.ctx
			ctx.save()
			ctx.fillStyle = '#fff'
			ctx.strokeStyle = 'rgba(17, 17, 22, 0.52)'
			ctx.lineWidth = Math.max(1, size * 0.08)
			fillCoordinateRoundRect(ctx, x - size / 2, y - size / 2, size, size, Math.max(2, size * 0.18))
			ctx.strokeRect(x - size * 0.24, y - size * 0.24, size * 0.48, size * 0.48)
			ctx.beginPath()
			ctx.moveTo(x, y - size * 0.35)
			ctx.lineTo(x, y + size * 0.35)
			ctx.moveTo(x - size * 0.35, y)
			ctx.lineTo(x + size * 0.35, y)
			ctx.stroke()
			ctx.restore()
		}

		function drawCoordinateDirectionArrow(ctx, x, y, angle, size) {
			ctx.save()
			ctx.translate(x, y)
			ctx.rotate(angle)
			ctx.fillStyle = 'rgba(17, 17, 22, 0.92)'
			ctx.beginPath()
			ctx.moveTo(size, 0)
			ctx.lineTo(-size * 0.5, -size * 0.866)
			ctx.lineTo(-size * 0.5, size * 0.866)
			ctx.closePath()
			ctx.fill()
			ctx.restore()
		}

		function getCurrentHintCanvasRect(game) {
			const element = game?.currentHint?.element
			if (!element || !document.body.contains(element)) return null
			if (Array.isArray(game.mouse?.offsetxy)) {
				element.style.left = game.mouse.offsetxy[0] + 'px'
				element.style.top = game.mouse.offsetxy[1] + 'px'
			}
			const rect = element.getBoundingClientRect?.()
			if (!rect || !rect.width || !rect.height) return null
			const canvasRect = game.canvas?.getBoundingClientRect?.()
			const canvasLeft = canvasRect?.left || 0
			const canvasTop = canvasRect?.top || 0
			const scaleX = canvasRect?.width ? game.w / canvasRect.width : (game.pixelRatio || 1)
			const scaleY = canvasRect?.height ? game.h / canvasRect.height : (game.pixelRatio || 1)
			return {
				x: (rect.left - canvasLeft) * scaleX,
				y: (rect.top - canvasTop) * scaleY,
				width: rect.width * scaleX,
				height: rect.height * scaleY
			}
		}

		function shouldShowCoordinateOverlay(game) {
			return !!(
				isCoordinateOverlayFeatureEnabled() &&
				game &&
				(game.mouse?.cursorVisible !== false) &&
				Array.isArray(game.hoveredCell) &&
				(game.altActive || isCoordinateToggleActive(game))
			)
		}

		function isCoordinateEmptyCellContext(game) {
			return !!(
				game &&
				!game.itemInHand &&
				!game.hoveredEntity &&
				Array.isArray(game.hoveredCell) &&
				!game.entityAtCoordinates?.(game.hoveredCell)
			)
		}
		function isScannedVoidCellContext(game) {
			return !!(
				game &&
				game.plane === 1 &&
				!game.itemInHand &&
				!game.hoveredEntity &&
				Array.isArray(game.hoveredCell) &&
				!game.entityAtCoordinates?.(game.hoveredCell) &&
				findScannedVoidCell(game, game.hoveredCell)
			)
		}

		function shouldUseScannedVoidCellHint(game) {
			return !!(isScannedVoidCellDetailActive(game) && isScannedVoidCellContext(game))
		}

		function shouldUseTransientCubeHint(game) {
			return !!(
				isBuildingDetailsFeatureEnabled() &&
				game &&
				isDetailActive(game) &&
				!game.plane &&
				!game.itemInHand &&
				!game.hoveredEntity &&
				Array.isArray(game.hoveredCell) &&
				!game.entityAtCoordinates?.(game.hoveredCell)
			)
		}

		function getTransientCubeProbe(game) {
			const position = game.hoveredCell
			const sourcePump = findCubeGeneratingPump(game, position)
			if (!sourcePump) return null

			const memory = getRememberedCube(game, position)
			const counts = memory?.counts?.slice() || estimatePumpResourceCounts(sourcePump)
			let probe = game[cubeProbeKey]
			if (!probe) {
				probe = {
					name: 'cube',
					isTransientCubeProbe: true,
					baseBreakPower: 0.08,
					soi: defaultSoi(),
					canHit() { return false },
					canDarkHit() { return false },
					getHint() { return getCubeHint(this) },
					getDarkHint() { return false }
				}
				game[cubeProbeKey] = probe
			}

			probe.master = game
			probe.position = position.slice()
			probe.pump = sourcePump
			probe.state = memory?.state === 3 ? 2 : (memory?.state ?? 2)
			probe.broken = memory?.state === 3 ? 0 : (memory?.broken || 0)
			probe.resourceCounts = normalizeResourceCounts(game, counts)
			probe.resources = memory?.resources?.slice() || []
			probe.composition = countsToComposition(game, probe.resourceCounts)
			probe.consumers = []
			probe.destabilizers = []
			return probe
		}

		function getScannedVoidCellProbe(game) {
			const position = game?.hoveredCell
			const scanCell = findScannedVoidCell(game, position)
			if (!scanCell) return null

			let probe = game[scanProbeKey]
			if (!probe) {
				probe = {
					name: 'scan',
					isScannedVoidCellProbe: true,
					canHit() { return false },
					canDarkHit() { return false },
					getHint() { return false },
					getDarkHint() { return getScannedVoidCellHint(this.master, this.position, this.scanCell) }
				}
				game[scanProbeKey] = probe
			}

			probe.master = game
			probe.position = position.slice()
			probe.scanCell = scanCell
			return probe
		}

		function findScannedVoidCell(game, position) {
			if (!game || !Array.isArray(position)) return null
			const effects = Array.isArray(game.vfx) ? game.vfx : []
			for (let i = effects.length - 1; i >= 0; i--) {
				const effect = effects[i]
				if (!effect || effect.terminate || !Array.isArray(effect.cells)) continue
				const isScanner = effect.constructor?.name === 'ScannerMap' || (Array.isArray(effect.source) && Number.isFinite(effect.maxEndTime))
				if (!isScanner) continue
				for (const cell of effect.cells) {
					if (cell?.p?.[0] === position[0] && cell?.p?.[1] === position[1]) return cell
				}
			}
			return null
		}

		function getScannedVoidCellHint(game, position, scanCell) {
			if (!game || !Array.isArray(position) || !scanCell) return false
			const values = Array.isArray(scanCell.values) ? scanCell.values : game.getResourceNodeValues?.(position[0], position[1])
			if (!Array.isArray(values) || !values.length) return false
			const signature = position[0] + ',' + position[1] + '|' + values.map((entry) => entry?.rid + ':' + round(Number(entry?.v) || 0)).join(',')
			const cached = game[scanHintKey]
			if (cached?.signature === signature) return cached.hint

			const hint = new Cloud(game)
			hint.setDarkMode?.()
			const probs = []
			for (const entry of values) {
				const rid = Number(entry?.rid)
				if (!Number.isInteger(rid)) continue
				probs[rid] = (Number(entry?.v) || 0) * 2
			}
			hint.addResourcePercentageList(probs)
			game[scanHintKey] = { signature, hint }
			return hint
		}

		function findCubeGeneratingPump(game, position) {
			if (!game || !Array.isArray(position) || game.entityAtCoordinates?.(position)) return null

			let winner = null
			let winnerFlow = 0
			for (const pump of getPumps(game)) {
				if (!pump || (pump.name !== 'pump' && pump.name !== 'pump2')) continue
				if (!pumpCoversCell(pump, position)) continue

				const flow = getPumpFlow(pump)
				if (flow.actualResourcesPerSecond <= 0) continue
				if (flow.actualResourcesPerSecond > winnerFlow) {
					winner = pump
					winnerFlow = flow.actualResourcesPerSecond
				}
			}
			return winner
		}

		function getPumps(game) {
			if (game?.pumps && typeof game.pumps[Symbol.iterator] === 'function') return Array.from(game.pumps)
			return (game?.stuff || []).filter((entity) => entity?.name === 'pump' || entity?.name === 'pump2')
		}

		function pumpCoversCell(pump, position) {
			const offsets = getPumpRangeOffsets(pump)
			for (const offset of offsets) {
				if (pump.position[0] + offset[0] === position[0] && pump.position[1] + offset[1] === position[1]) return true
			}
			return false
		}

		function estimatePumpResourceCounts(pump) {
			return normalizeResourceCounts(pump.master, getPumpDistribution(pump).map((value) => value * 64))
		}

		function rememberCubeSnapshot(entity, counts) {
			if (!entity?.master || !Array.isArray(entity.position) || entity.isTransientCubeProbe) return
			const game = entity.master
			if (!game[cubeMemoryKey]) game[cubeMemoryKey] = Object.create(null)
			const normalized = normalizeResourceCounts(game, counts || getCubeResourceCounts(entity))
			game[cubeMemoryKey][cellKey(entity.position)] = {
				time: typeof performance !== 'undefined' ? performance.now() : Date.now(),
				counts: normalized,
				resources: Array.isArray(entity.resources) ? entity.resources.slice() : [],
				composition: Array.isArray(entity.composition) ? entity.composition.slice() : undefined,
				broken: entity.broken || 0,
				state: entity.state
			}
		}

		function getRememberedCube(game, position) {
			const memory = game?.[cubeMemoryKey]?.[cellKey(position)]
			if (!memory) return null
			const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
			if (now - memory.time > cubeMemoryTtl) {
				delete game[cubeMemoryKey][cellKey(position)]
				return null
			}
			return memory
		}

		function cellKey(position) {
			return 'u' + position[0] + 'v' + position[1]
		}

		function defaultSoi() {
			return [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]
		}

		function describeEntity(entity) {
			if (!entity?.name) return details([], 500)
			if (entity.name === 'pump' || entity.name === 'pump2') return describePump(entity)
			if (entity.name === 'gradient') return describeGradient(entity)
			if (entity.name === 'cube') return describeCube(entity)
			if (isEntropic(entity)) return describeEntropic(entity)
			if (isConverter(entity)) return describeConverter(entity)
			if (entity.name === 'annihilator') return describeAnnihilator(entity)
			if (entity.name === 'consumer') return describeConsumer(entity)
			if (entity.name === 'conductor') return describeConductor(entity)
			if (entity.name === 'preheater') return describePreheater(entity)
			if (isStabilizer(entity)) return describeStabilizer(entity)
			if (isPumpSupport(entity)) return describePumpSupport(entity)
			if (isDestabilizer(entity)) return describeDestabilizer(entity)
			if (entity.name === 'silo' || entity.name === 'silo2') return describeSilo(entity)
			if (entity.name === 'vessel' || entity.name === 'vessel2' || entity.name === 'vault') return describeStorage(entity)
			if (entity.name === 'injector') return describeInjector(entity)
			if (entity.name === 'reflector') return describeReflector(entity)
			if (entity.name === 'chasm' || entity.name === 'waypoint2' || entity.name === 'generaldecay') return describeNetworkNode(entity)
			return describeGeneric(entity)
		}

		function details(rows, refreshMs, signature, topFlow) {
			return { rows, refreshMs, topFlow, signature: signature || rows.map((row) => row.signature || row.label + ':' + row.value).join('|') }
		}

		function describePump(entity) {
			const game = entity.master
			const flow = getPumpFlow(entity)
			const distribution = getPumpDistribution(entity)
			const theoreticalResources = distribution.map((value) => value * flow.theoreticalResourcesPerSecond)
			const miningResources = distribution.map((value) => value * flow.miningResourcesPerSecond)
			const incomeResources = getRecentEntityResourceSourceRate(entity, 'gain')
			const rows = [
				resourceRow(text(game, 'theoreticalProduction'), theoreticalResources, '/s'),
				resourceRow(text(game, 'miningProduction'), miningResources, '/s'),
				resourceRow(text(game, 'incomeProduction'), incomeResources, '/s'),
				textRow(text(game, 'depthSpeed'), formatNumber(game, flow.depthMetersPerSecond) + ' m/s'),
				textRow(text(game, 'coolerBonus'), '+' + formatPercent(flow.coolerBonus) + ' (' + formatNumber(game, flow.coolerUnitsPerSecond) + '/s)'),
				textRow(text(game, 'auxBonus'), '+' + formatPercent(flow.auxBonus) + ' (' + formatNumber(game, flow.auxUnitsPerSecond) + '/s)'),
				textRow(text(game, 'surgeBonus'), '+' + formatPercent(flow.surgeBonus)),
				textRow(text(game, 'spool'), formatPercent(entity.spoolup || 0))
			]
			return details(rows, 500, [
				entity.name,
				entity.active,
				round(entity.depth),
				round(entity.spoolup),
				round(entity.surgeBoost),
				flow.signature,
				resourceSignature(incomeResources),
				nearbySignature(entity)
			].join('|'))
		}

		function describeGradient(entity) {
			const game = entity.master
			const flow = getGradientFlow(entity)
			const resources = typeof entity.getDiscrete === 'function' ? entity.getDiscrete(flow.periodicPowerPerSecond) : []
			const rows = [
				resourceRow(text(game, 'production'), resources, '/s'),
				textRow(text(game, 'force'), formatNumber(game, flow.periodicPowerPerSecond) + '/s'),
				textRow(text(game, 'speedBonus'), '+' + formatPercent(flow.destabilizerBonus)),
				textRow(text(game, 'connection'), entity.isConnected?.() ? text(game, 'connected') : text(game, 'disconnected'))
			]
			if (flow.triggerPower) rows.push(textRow(text(game, 'triggerPower'), formatNumber(game, flow.triggerPower)))
			return details(rows, 500, [
				entity.name,
				entity.isConnected?.(),
				round(flow.periodicPowerPerSecond),
				round(flow.destabilizerBonus),
				round(flow.triggerPower),
				nearbySignature(entity)
			].join('|'))
		}

		function describeCube(entity) {
			const game = entity.master
			const counts = getCubeResourceCounts(entity)
			if (!entity.isTransientCubeProbe) rememberCubeSnapshot(entity, counts)
			const force = getCubeForce(entity)
			const rows = [
				resourceRow(text(game, 'resources'), counts, ''),
				textRow(text(game, 'speedBonus'), '+' + formatPercent(force.destabilizerBonus)),
				textRow(text(game, 'power'), formatNumber(game, force.hitPower)),
				textRow(text(game, 'entropicPower'), formatNumber(game, force.entropicPowerPerSecond) + '/s'),
				textRow(text(game, 'breakProgress'), formatPercent(entity.broken || 0)),
				textRow(text(game, 'consumerBonus'), force.consumerCount ? '+' + force.consumerCount : text(game, 'none'))
			]
			if (force.triggerPower) rows.push(textRow(text(game, 'triggerPower'), formatNumber(game, force.triggerPower)))
			return details(rows, 500, [
				entity.name,
				entity.state,
				round(entity.broken),
				round(force.hitPower),
				round(force.entropicPowerPerSecond),
				round(force.triggerPower),
				nearbySignature(entity),
				resourceSignature(counts)
			].join('|'))
		}

		function describeEntropic(entity) {
			const game = entity.master
			const info = getEntropicInfo(entity)
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				textRow(text(game, 'power'), formatNumber(game, entity.power || 0)),
				textRow(text(game, 'frequency'), info.frequencyText),
				textRow(text(game, 'targets'), String(countAdjacentTargets(entity, true))),
				textRow(text(game, 'fill'), entity.fill !== undefined ? formatPercent(entity.fill) : text(game, 'none'))
			]
			return details(rows, 500, [
				entity.name,
				entity.state,
				round(entity.fill),
				round(entity.power),
				info.signature,
				nearbySignature(entity)
			].join('|'))
		}

		function describeConverter(entity) {
			const game = entity.master
			const info = getConverterInfo(entity)
			const flow = conversionFlowRow(entity.fuel || [], info.outputOnce, 'conversionFlow')
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity), 'status'),
				resourceRow(text(game, 'output'), info.outputPerSecond, '/s', 'outputPerSecond'),
				textRow(text(game, 'efficiency'), formatNumber(game, info.progressPerSecond * 100) + '%/s'),
				textRow(text(game, 'speedBonus'), '+' + formatPercent(info.multiplier - 1)),
				textRow(text(game, 'progress'), formatPercent(entity.conversion || 0))
			]
			if (entity.name === 'converter64') {
				rows.push(textRow(text(game, 'reflectors'), String(entity.reflectorCount || 0)))
				rows.push(textRow(text(game, 'connection'), entity.alone === false ? text(game, 'blocked') : text(game, 'ready')))
			}
			return details(rows, 2000, [
				entity.name,
				entity.state,
				round(entity.conversion),
				round(entity.fill),
				round(info.multiplier),
				round(info.progressPerSecond),
				resourceSignature(info.outputOnce),
				entity.reflectorCount,
				entity.alone,
				nearbySignature(entity)
			].join('|'), entity.state === 2 ? flow : undefined)
		}

		function describeAnnihilator(entity) {
			const game = entity.master
			const output = [0, 0, 0, 0, 0, 0, 0, 0, 1]
			const flow = conversionFlowRow(entity.fuel || [], output, 'conversionFlow')
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity), 'status'),
				resourceRow(text(game, 'releaseRate'), getRecentRate(entity), '/s', 'releaseRate'),
				textRow(text(game, 'charges'), formatNumber(game, Math.floor((entity.fill || 0) / 0.03125)), 'charges'),
				textRow(text(game, 'fill'), formatPercent(entity.fill || 0), 'fill')
			]
			return details(rows, 500, [
				entity.name,
				entity.state,
				round(entity.fill),
				rateSignature(entity)
			].join('|'), entity.state === 2 ? flow : undefined)
		}

		function describeConsumer(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				resourceRow(text(game, 'stored'), entity.resources || [], ''),
				textRow(text(game, 'storage'), formatNumber(game, entity.resourceCount || 0) + ' / ' + formatNumber(game, entity.maxResourceCount || 0)),
				resourceRow(text(game, 'releaseRate'), getRecentRate(entity), '/s'),
				textRow(text(game, 'releaseBonus'), '+' + formatPercent((entity.multiplicator || 0) * (entity.bonus || 0))),
				textRow(text(game, 'resetTimer'), formatSeconds(entity.timer || 0))
			]
			return details(rows, 500, [
				entity.name,
				entity.state,
				round(entity.fill),
				round(entity.resourceCount),
				round(entity.multiplicator),
				resourceSignature(entity.resources || []),
				rateSignature(entity)
			].join('|'))
		}

		function describeConductor(entity) {
			const game = entity.master
			const transferResources = getConductorTransfers(entity)
			const rows = [
				textRow(text(game, 'connection'), entity.isConnected?.() ? text(game, 'connected') : text(game, 'disconnected')),
				textRow(text(game, 'network'), entity.chasmNetwork || text(game, 'none')),
				resourceRow(text(game, 'transporting'), transferResources, ''),
				textRow(text(game, 'nearby'), String(countNetworkNeighbours(entity)))
			]
			return details(rows, 500, [
				entity.name,
				entity.chasmNetwork,
				resourceSignature(transferResources),
				nearbySignature(entity)
			].join('|'))
		}

		function describePreheater(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				textRow(text(game, 'efficiency'), '+' + formatPercent((entity.multiplicator || 1) - 1)),
				textRow(text(game, 'targets'), String(entity.convertersNearby || 0)),
				textRow(text(game, 'fill'), formatPercent(entity.fill || 0)),
				resourceRow(text(game, 'input'), entity.fuel || [], '')
			]
			return details(rows, 2000, [
				entity.name,
				entity.state,
				round(entity.fill),
				round(entity.multiplicator),
				entity.convertersNearby,
				nearbySignature(entity)
			].join('|'))
		}

		function describeStabilizer(entity) {
			const game = entity.master
			const surge = entity.surge
			const rows = [
				textRow(text(game, 'surgeResource'), surge ? pronounceResource(game, surge.type) : text(game, 'none'), 'surgeResource'),
				textRow(text(game, 'surgeEffect'), surge ? pronounceRandom(game, 'surge' + surge.type) : text(game, 'none'), 'surgeEffect', { wrap: true }),
				textRow(text(game, 'energyRemaining'), surge ? formatStabilizedSurgeTime(game, entity, surge.lifeTimer || 0) + ' / ' + formatStabilizedSurgeTime(game, entity, surge.maxLifeTimer || 0) : text(game, 'none'), 'energyRemaining')
			]
			return details(rows, 500, [
				entity.name,
				surge ? surge.type : 'none',
				surge ? surge.grade : 'none',
				round(surge?.lifeTimer),
				round(surge?.maxLifeTimer),
				round(entity.power?.timer),
				nearbySignature(entity)
			].join('|'))
		}

		function describePumpSupport(entity) {
			const game = entity.master
			const bonus = entity.name === 'doublechannel' ? 1 : entity.name === 'doublechannel2' ? 3 : entity.name === 'auxpump' ? 0.25 : entity.name === 'auxpump2' ? 1 : 0
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				textRow(text(game, 'speedBonus'), '+' + formatPercent(bonus)),
				textRow(text(game, 'targets'), String(countAdjacentNames(entity, ['pump', 'pump2']))),
				textRow(text(game, 'fill'), entity.fill !== undefined ? formatPercent(entity.fill) : text(game, 'alwaysOn')),
				resourceRow(text(game, 'input'), entity.fuel || [], '')
			]
			return details(rows, 2000, [
				entity.name,
				entity.state,
				round(entity.fill),
				nearbySignature(entity)
			].join('|'))
		}

		function describeDestabilizer(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				textRow(text(game, 'power'), formatNumber(game, getDestabilizerValue(entity))),
				textRow(text(game, 'targets'), String(countAdjacentTargets(entity, false))),
				textRow(text(game, 'fill'), formatPercent(entity.fill || 0)),
				resourceRow(text(game, 'input'), entity.fuel || [], '')
			]
			return details(rows, 500, [
				entity.name,
				entity.state,
				round(entity.fill),
				nearbySignature(entity)
			].join('|'))
		}

		function describeSilo(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				textRow(text(game, 'charges'), formatNumber(game, Math.floor((entity.fill || 0) / 0.0625))),
				textRow(text(game, 'connection'), entity.isConnected?.() ? text(game, 'connected') : text(game, 'disconnected')),
				textRow(text(game, 'fill'), formatPercent(entity.fill || 0)),
				resourceRow(text(game, 'input'), entity.fuel || [], '')
			]
			return details(rows, 500, [
				entity.name,
				entity.state,
				round(entity.fill),
				entity.chasmNetwork,
				nearbySignature(entity)
			].join('|'))
		}

		function describeStorage(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				textRow(text(game, 'capacity'), formatNumber(game, entity.capacity || (entity.name === 'vault' ? 1024 : 0))),
				textRow(text(game, 'fill'), entity.fill !== undefined ? formatPercent(entity.fill) : text(game, 'none')),
				resourceRow(text(game, 'input'), entity.fuel || [], '')
			]
			return details(rows, 2000, [
				entity.name,
				entity.state,
				round(entity.fill),
				entity.capacity,
				nearbySignature(entity)
			].join('|'))
		}

		function describeInjector(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				resourceRow(text(game, 'conversion'), [0, 0, 0, 0, 1], ''),
				textRow(text(game, 'charges'), formatNumber(game, Math.floor((entity.fill || 0) / 0.03125))),
				textRow(text(game, 'targets'), String(countAdjacentNames(entity, ['cube']))),
				resourceRow(text(game, 'input'), entity.fuel || [], '')
			]
			return details(rows, 500, [
				entity.name,
				entity.state,
				round(entity.fill),
				nearbySignature(entity)
			].join('|'))
		}

		function describeReflector(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'speedBonus'), '+12.5%'),
				textRow(text(game, 'targets'), String(countAdjacentNames(entity, ['converter64']))),
				textRow(text(game, 'nearby'), String(countNeighbours(entity)))
			]
			return details(rows, 2000, [entity.name, nearbySignature(entity)].join('|'))
		}

		function describeNetworkNode(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'connection'), entity.isConnected?.() ? text(game, 'connected') : text(game, 'disconnected')),
				textRow(text(game, 'network'), entity.chasmNetwork || text(game, 'none')),
				textRow(text(game, 'nearby'), String(countNetworkNeighbours(entity)))
			]
			return details(rows, 2000, [entity.name, entity.chasmNetwork, nearbySignature(entity)].join('|'))
		}

		function describeGeneric(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				textRow(text(game, 'siloSupply'), entity.isNextToSilo ? text(game, 'yes') : text(game, 'no'))
			]
			if (entity.fill !== undefined) rows.push(textRow(text(game, 'fill'), formatPercent(entity.fill)))
			if (entity.power !== undefined) rows.push(textRow(text(game, 'power'), formatNumber(game, entity.power)))
			if (entity.fuel) rows.push(resourceRow(text(game, 'input'), entity.fuel, ''))
			return details(rows, 1000, [
				entity.name,
				entity.state,
				round(entity.fill),
				round(entity.power),
				entity.isNextToSilo,
				nearbySignature(entity)
			].join('|'))
		}

		function getPumpFlow(entity) {
			const basePumpSpeed = entity.basePumpSpeed || 0
			const pumpSpeed = entity.pumpSpeed || basePumpSpeed
			const coolerBonus = pumpSpeed && basePumpSpeed ? (pumpSpeed / basePumpSpeed) - 1 : (entity.doublechannel || 0)
			const auxBonus = entity.active ? 0 : getActiveAuxBonus(entity)
			const realSurgeBonus = entity.surgeBoost || 0
			const displaySurgeBonus = getPumpDisplaySurgeBonus(entity)
			const stableUnitsPerMs = (entity.active ? pumpSpeed : 0) + auxBonus * pumpSpeed
			const displayUnitsPerMs = stableUnitsPerMs + displaySurgeBonus * pumpSpeed
			const spooledUnitsPerMs = (entity.spoolup || 0) >= 1 ? displayUnitsPerMs : 0
			const workState = getPumpWorkState(entity)
			const miningUnitsPerMs = workState.canWork ? spooledUnitsPerMs : 0
			const theoreticalResourcesPerSecond = stableUnitsPerMs * 1000
			const spooledResourcesPerSecond = spooledUnitsPerMs * 1000
			const miningResourcesPerSecond = miningUnitsPerMs * 1000
			const depthMetersPerSecond = entity.digSpeed ? entity.digSpeed * miningUnitsPerMs * 1000 * 10 / (1 + (entity.depth || 0) ** 0.7) : 0
			return {
				coolerBonus,
				auxBonus,
				surgeBonus: displaySurgeBonus,
				realSurgeBonus,
				theoreticalResourcesPerSecond,
				spooledResourcesPerSecond,
				miningResourcesPerSecond,
				actualResourcesPerSecond: miningResourcesPerSecond,
				depthMetersPerSecond,
				coolerUnitsPerSecond: basePumpSpeed * coolerBonus * 1000,
				auxUnitsPerSecond: pumpSpeed * auxBonus * 1000,
				workState,
				signature: [
					round(stableUnitsPerMs),
					round(displayUnitsPerMs),
					round(spooledUnitsPerMs),
					round(miningUnitsPerMs),
					round(coolerBonus),
					round(auxBonus),
					round(realSurgeBonus),
					round(displaySurgeBonus),
					workState.signature
				].join(':')
			}
		}

		function getPumpDisplaySurgeBonus(entity) {
			const timer = Number(entity?.surgeTimer) || 0
			const maxTime = Number(entity?.surgeMaxTime) || 0
			if (timer <= 0 || maxTime <= 0) return 0

			// UI-only shortening: vanilla surge still lasts its full duration in game logic.
			const displayDuration = Math.max(1, Math.min(maxTime, pumpSurgeDisplayMs))
			const elapsed = Math.max(0, maxTime - timer)
			if (elapsed >= displayDuration) return 0
			const remaining = (displayDuration - elapsed) / displayDuration
			return remaining * remaining * 8
		}

		function getActiveAuxBonus(entity) {
			let bonus = 0
			const auxes = entity.auxes || []
			for (const aux of auxes) {
				if (aux?.state !== 2) continue
				if (aux.name === 'auxpump2') bonus = Math.max(bonus, 1)
				else if (aux.name === 'auxpump') bonus = Math.max(bonus, 0.25)
			}
			return bonus
		}

		function getPumpWorkState(entity) {
			const state = {
				canWork: false,
				hasGrowingCube: false,
				hasEmptySpot: false,
				growingCubes: 0,
				emptySpots: 0,
				signature: '0:0'
			}
			const game = entity?.master
			if (!game || !Array.isArray(entity?.position)) return state

			for (const offset of getPumpRangeOffsets(entity)) {
				if (!Array.isArray(offset)) continue
				const position = [entity.position[0] + offset[0], entity.position[1] + offset[1]]
				const cell = game.entityAtCoordinates?.(position)
				if (cell?.name === 'cube' && cell.state === 0 && cell.pump === entity) {
					state.hasGrowingCube = true
					state.growingCubes++
				} else if (!cell && !isPumpSpotHeldByCursor(game, position)) {
					state.hasEmptySpot = true
					state.emptySpots++
				}
			}

			state.canWork = !!(state.hasGrowingCube || state.hasEmptySpot)
			state.signature = state.growingCubes + ':' + state.emptySpots
			return state
		}

		function getPumpRangeOffsets(entity) {
			if (entity?.name === 'pump2' && Array.isArray(entity.soe)) return entity.soe
			return Array.isArray(entity?.soi) ? entity.soi : []
		}

		function isPumpSpotHeldByCursor(game, position) {
			return !!(
				game?.itemInHand &&
				Array.isArray(game.hoveredCell) &&
				game.hoveredCell[0] === position[0] &&
				game.hoveredCell[1] === position[1]
			)
		}

		function getPumpDistribution(entity) {
			const resources = entity.master?.codex?.resources || []
			const raw = []
			let sum = 0
			for (let i = 0; i < resources.length; i++) {
				const probs = resources[i]?.probabilities
				let value = 0
				if (probs) {
					for (const probability of probs) {
						value = Math.max(value, entity.getProbability(probability.point, probability.spread, probability.value, probability.span))
					}
				}
				raw[i] = value
				sum += value
			}
			return raw.map((value) => sum ? value / sum : 0)
		}

		function getGradientFlow(entity) {
			const periodic = getAdjacentEntropicPower(entity, false)
			const trigger = getAdjacentEntropicPower(entity, true)
			const destab = getDestabilizerBonus(entity, { includeIndustrial: false })
			return {
				periodicPowerPerSecond: periodic * (1 + destab),
				triggerPower: trigger * (1 + destab),
				destabilizerBonus: destab
			}
		}

		function getCubeForce(entity) {
			const hellgem = !!getCubeResourceCounts(entity)[4]
			const destab = getDestabilizerBonus(entity, { includeIndustrial: true, hellgem })
			const hardMultiplier = hellgem ? 0.03 : 1
			const hitPower = (entity.baseBreakPower || 0) * (1 + destab) * hardMultiplier
			const consumerCount = getNeighbours(entity).filter((neighbour) => neighbour?.name === 'consumer' && neighbour.state === 2).length
			return {
				destabilizerBonus: destab,
				hitPower,
				entropicPowerPerSecond: getAdjacentEntropicPower(entity, false),
				triggerPower: getAdjacentEntropicPower(entity, true),
				consumerCount
			}
		}

		function getAdjacentEntropicPower(entity, triggerOnly) {
			let value = 0
			for (const neighbour of getNeighbours(entity)) {
				if (!neighbour || !isEntropic(neighbour) || neighbour.state !== 2) continue
				if (neighbour.name === 'entropic3') {
					if (triggerOnly) value += neighbour.power || 0
				} else if (neighbour.name === 'entropic2a') {
					if (triggerOnly) value += neighbour.power || 0
				} else if (!triggerOnly) {
					value += (neighbour.power || 0) * (1000 / (neighbour.interval || 1000))
				}
			}
			return value
		}

		function getDestabilizerBonus(entity, options = {}) {
			let value = 0
			const hellgem = !!options.hellgem
			for (const neighbour of getNeighbours(entity)) {
				if (!neighbour || !isDestabilizer(neighbour) || neighbour.state !== 2) continue
				if (neighbour.name === 'destabilizer2a' && !options.includeIndustrial) continue
				if (neighbour.name === 'destabilizer2a' && !hellgem) continue
				value += getDestabilizerValue(neighbour)
			}
			return value
		}

		function getDestabilizerValue(entity) {
			if (entity.name === 'destabilizer2a') return 625
			if (entity.name === 'destabilizer2') return 2
			if (entity.name === 'destabilizer') return 1
			return 0
		}

		function getCubeResourceCounts(entity) {
			if (Array.isArray(entity.resourceCounts)) return normalizeResourceCounts(entity.master, entity.resourceCounts)
			const counts = new Array(resourceCountSize(entity.master)).fill(0)
			if (entity.composition) {
				for (let i = 0; i < entity.composition.length; i++) counts[i] = Math.round((entity.composition[i] || 0) * 64)
				return counts
			}
			for (const id of entity.resources || []) counts[id] = (counts[id] || 0) + 1
			return counts
		}

		function normalizeResourceCounts(game, resources) {
			const counts = new Array(resourceCountSize(game, resources?.length)).fill(0)
			for (let i = 0; i < (resources || []).length && i < counts.length; i++) counts[i] = Number(resources[i]) || 0
			return counts
		}

		function resourceCountSize(game, fallback) {
			return game?.resources?.length || game?.codex?.resources?.length || fallback || 10
		}

		function countsToComposition(game, counts) {
			return normalizeResourceCounts(game, counts).map((value) => value / 64)
		}

		function getEntropicInfo(entity) {
			if (entity.name === 'entropic2a') return { frequencyText: text(entity.master, 'oncePerCube'), signature: 'oncePerCube' }
			if (entity.name === 'entropic3') {
				const frequency = getRecentEventFrequency(entity)
				return {
					frequencyText: formatNumber(entity.master, frequency) + '/s',
					signature: eventRateSignature(entity)
				}
			}
			return {
				frequencyText: formatNumber(entity.master, 1000 / (entity.interval || 1000)) + '/s',
				signature: entity.interval
			}
		}

		function getConverterInfo(entity) {
			let multiplier = 1
			for (const preheater of entity.preheaters || []) {
				if (preheater?.state === 2) multiplier += preheater.multiplicator || 0
			}
			if (entity.name === 'converter64') multiplier *= (1 + (entity.reflectorCount || 0) / 8)
			const blocked = entity.name === 'converter64' && entity.alone === false
			const progressPerSecond = blocked ? 0 : (entity.baseConversionSpeed || 0) * 1000 * multiplier
			const output = typeof entity.getConversionOutput === 'function' ? entity.getConversionOutput() : []
			return {
				multiplier,
				progressPerSecond,
				outputOnce: output,
				outputPerSecond: output.map((value) => value * progressPerSecond)
			}
		}

		function getConductorTransfers(entity) {
			const out = new Array(entity.master?.resources?.length || 10).fill(0)
			const position = entity.position || []
			for (const transfer of entity.master?.chasmVfx || []) {
				if (!Array.isArray(transfer?.path) || !pathContains(transfer.path, position)) continue
				for (let i = 0; i < (transfer.resources || []).length; i++) out[i] += transfer.resources[i] || 0
			}
			return out
		}

		function pathContains(path, position) {
			return path.some((point) => point && point[0] === position[0] && point[1] === position[1])
		}

		function countAdjacentTargets(entity, includeGradient) {
			let count = 0
			for (const neighbour of getNeighbours(entity)) {
				if (!neighbour) continue
				if (neighbour.name === 'cube') count++
				if (includeGradient && neighbour.name === 'gradient') count++
			}
			return count
		}

		function countAdjacentNames(entity, names) {
			const wanted = new Set(names)
			return getNeighbours(entity).filter((neighbour) => neighbour?.name && wanted.has(neighbour.name)).length
		}

		function countNetworkNeighbours(entity) {
			const names = ['conductor', 'silo2', 'gradient', 'chasm', 'generaldecay', 'waypoint2']
			return countAdjacentNames(entity, names)
		}

		function countNeighbours(entity) {
			return getNeighbours(entity).filter(Boolean).length
		}

		function getNeighbours(entity) {
			const out = []
			const game = entity.master
			const soi = entity.soi || []
			for (const offset of soi) {
				out.push(game?.entityAtCoordinates?.([entity.position[0] + offset[0], entity.position[1] + offset[1]]))
			}
			return out
		}

		function isEntropic(entity) {
			return entity?.name === 'entropic' || entity?.name === 'entropic2' || entity?.name === 'entropic2a' || entity?.name === 'entropic3'
		}

		function isConverter(entity) {
			return entity?.name === 'converter32' || entity?.name === 'converter13' || entity?.name === 'converter41' || entity?.name === 'converter76' || entity?.name === 'converter64'
		}

		function isDestabilizer(entity) {
			return entity?.name === 'destabilizer' || entity?.name === 'destabilizer2' || entity?.name === 'destabilizer2a'
		}

		function isStabilizer(entity) {
			return entity?.name === 'stabilizer' || entity?.name === 'stabilizer2' || entity?.name === 'stabilizer3'
		}

		function isPumpSupport(entity) {
			return entity?.name === 'doublechannel' || entity?.name === 'doublechannel2' || entity?.name === 'auxpump' || entity?.name === 'auxpump2' || entity?.name === 'valve'
		}

		function recordOutput(entity, resources) {
			if (!entity || !Array.isArray(resources)) return
			const now = performance.now()
			let entry = rates.get(entity)
			if (!entry) {
				entry = []
				rates.set(entity, entry)
			}
			entry.push({ time: now, resources: resources.slice() })
			trimRateEntry(entry, now)
		}

		function recordEvent(entity) {
			if (!entity) return
			const now = performance.now()
			let entry = events.get(entity)
			if (!entry) {
				entry = []
				events.set(entity, entry)
			}
			entry.push({ time: now })
			trimRateEntry(entry, now)
		}

		function getRecentRate(entity) {
			const out = new Array(entity.master?.resources?.length || 10).fill(0)
			const now = performance.now()
			const entry = rates.get(entity) || []
			trimRateEntry(entry, now)
			if (!entry.length) return out
			let first = now
			for (const sample of entry) {
				first = Math.min(first, sample.time)
				for (let i = 0; i < sample.resources.length; i++) out[i] += sample.resources[i] || 0
			}
			const seconds = Math.max(1, (now - first) / 1000)
			return out.map((value) => value / seconds)
		}

		function getRecentEventFrequency(entity) {
			const now = performance.now()
			const entry = events.get(entity) || []
			trimRateEntry(entry, now)
			if (!entry.length) return 0
			let first = now
			for (const sample of entry) first = Math.min(first, sample.time)
			const seconds = Math.max(1, (now - first) / 1000)
			return entry.length / seconds
		}

		function trimRateEntry(entry, now) {
			while (entry.length && now - entry[0].time > rateWindow) entry.shift()
		}

		function rateSignature(entity) {
			const entry = rates.get(entity) || []
			return entry.length + ':' + resourceSignature(getRecentRate(entity))
		}

		function eventRateSignature(entity) {
			const entry = events.get(entity) || []
			return entry.length + ':' + round(getRecentEventFrequency(entity))
		}

		function nearbySignature(entity) {
			return getNeighbours(entity).map((neighbour) => {
				if (!neighbour) return '-'
				return [neighbour.name, neighbour.state, round(neighbour.fill), round(neighbour.power), round(neighbour.multiplicator)].join(':')
			}).join(',')
		}

		function resourceSignature(resources) {
			return (resources || []).map((value) => round(value)).join(',')
		}

		function renderTopFlow(panel, game, flow) {
			if (!panel?.hintElement) return
			if (!flow) {
				if (panel.topFlow) {
					panel.topFlow.remove()
					panel.topFlow = null
				}
				return
			}

			if (!panel.topFlow) {
				panel.topFlow = document.createElement('div')
				panel.topFlow.className = 'cattail-dynamic-top-flow active'
				panel.hintElement.insertBefore(panel.topFlow, panel.hintElement.firstChild)
			}
			panel.topFlow.classList.add('active')
			panel.topFlow.innerHTML = ''
			if (!appendConversionFlow(panel.topFlow, game, flow.input || [], flow.output || [], flow.key || 'conversionFlow')) {
				panel.topFlow.remove()
				panel.topFlow = null
			}
		}

		function renderDetails(body, entity, rows) {
			body.innerHTML = ''
			for (const item of rows) {
				if (!item) continue

				if (item.flow) {
					const row = document.createElement('div')
					row.className = 'cattail-dynamic-detail-flow-row'
					row.dataset.stableWidthBucket = 'values'
					row.dataset.stableWidthKey = 'flow:' + (item.key || '')
					row.dataset.stableHeightBucket = 'rows'
					row.dataset.stableHeightKey = 'flow:' + (item.key || '')
					if (appendConversionFlow(row, entity.master, item.input || [], item.output || [], item.key || '')) body.append(row)
					continue
				}

				const row = document.createElement('div')
				const rowKey = item.key || item.label || ''
				row.className = 'cattail-dynamic-detail-row'
				row.dataset.stableHeightBucket = 'rows'
				row.dataset.stableHeightKey = 'row:' + rowKey

				const label = document.createElement('div')
				label.className = 'cattail-dynamic-detail-label'
				label.textContent = item.label
				const value = document.createElement('div')
				value.className = 'cattail-dynamic-detail-value'
				if (item.wrap) value.classList.add('cattail-dynamic-detail-value-wrap')
				value.dataset.stableWidthBucket = 'values'
				value.dataset.stableWidthKey = 'row:' + rowKey + ':' + (item.suffix || '')

				if (item.resources) appendResourceList(value, entity.master, item.resources, item.suffix || '', rowKey)
				else value.textContent = item.value === undefined ? '' : String(item.value)

				row.append(label, value)
				body.append(row)
			}
		}

		function appendConversionFlow(parent, game, input, output, rowKey) {
			const original = createOriginalConversionFlow(game, input, output)
			if (original) {
				parent.append(original)
				return true
			}

			if (!hasAnyResource(input)) return false
			const vessel = document.createElement('div')
			vessel.className = 'converterOutputVessel'
			const inputWrap = document.createElement('div')
			inputWrap.className = 'converterInput'
			const outputWrap = document.createElement('div')
			outputWrap.className = 'converterOutput'
			appendResourceChunks(inputWrap, game, input, '', 'flow:' + rowKey + ':input')
			appendResourceChunks(outputWrap, game, output, '', 'flow:' + rowKey + ':output')
			vessel.append(inputWrap, outputWrap)
			parent.append(vessel)
			return true
		}

		function createOriginalConversionFlow(game, input, output) {
			if (typeof Cloud === 'undefined' || typeof Cloud.prototype.addConvertersOutput !== 'function') return null
			const cloud = new Cloud(game)
			cloud.addConvertersOutput(input, function () { return output })
			cloud.update?.()
			const vessel = cloud.element.querySelector('.converterOutputVessel')
			if (!vessel) return null
			vessel.remove()
			return vessel
		}

		function appendResourceList(parent, game, resources, suffix, rowKey) {
			if (!appendResourceChunks(parent, game, resources, suffix, rowKey, 'span')) parent.textContent = text(game, 'none')
		}

		function hasAnyResource(resources) {
			return (resources || []).some((value) => Math.abs(value || 0) >= 0.0001)
		}

		function appendResourceChunks(parent, game, resources, suffix, rowKey, tagName = 'div') {
			let hasAny = false
			for (let i = 0; i < resources.length; i++) {
				const amount = resources[i] || 0
				if (Math.abs(amount) < 0.0001) continue
				hasAny = true
				const chunk = document.createElement(tagName)
				chunk.className = tagName === 'span' ? 'cattail-dynamic-resource' : 'hintResourceChunk'
				const icon = document.createElement(tagName)
				icon.className = 'hintResourceIcon r' + i
				const textEl = document.createElement(tagName)
				textEl.className = tagName === 'span' ? 'cattail-dynamic-resource-amount' : 'hintResourceString cattail-dynamic-resource-amount'
				textEl.dataset.stableWidthBucket = 'amounts'
				textEl.dataset.stableWidthKey = 'resource:' + rowKey + ':' + i + ':' + suffix
				textEl.textContent = formatNumber(game, amount) + suffix
				chunk.append(icon, textEl)
				parent.append(chunk)
			}
			return hasAny
		}

		function getWidthStateKey(entity) {
			if (entity?.name === 'cube' && Array.isArray(entity.position)) return 'cube:' + cellKey(entity.position)
			return ''
		}

		function getWidthState(entity, key = getWidthStateKey(entity)) {
			if (!key || !entity?.master) return createWidthState()
			const store = entity.master[widthStateKey] || (entity.master[widthStateKey] = Object.create(null))
			return store[key] || (store[key] = createWidthState())
		}

		function createWidthState() {
			return {
				values: Object.create(null),
				amounts: Object.create(null),
				rows: Object.create(null),
				heights: Object.create(null)
			}
		}

		function clearStableWidths(panel) {
			for (const element of panel?.body?.querySelectorAll?.('[data-stable-width-key]') || []) element.style.minWidth = ''
			for (const element of panel?.body?.querySelectorAll?.('[data-stable-height-key]') || []) element.style.minHeight = ''
			if (panel?.body) panel.body.style.minHeight = ''
		}

		function stabilizeDetailWidths(panel) {
			if (!panel?.body) return
			if (!panel.body.isConnected) {
				if (!panel.widthMeasureQueued && typeof requestAnimationFrame === 'function') {
					panel.widthMeasureQueued = true
					requestAnimationFrame(function () {
						panel.widthMeasureQueued = false
						stabilizeDetailWidths(panel)
					})
				}
				return
			}

			const now = performance.now()
			const state = panel.widthState || (panel.widthState = createWidthState())
			for (const element of panel.body.querySelectorAll('[data-stable-width-key]')) {
				const bucketName = element.dataset.stableWidthBucket || 'values'
				const bucket = state[bucketName] || (state[bucketName] = Object.create(null))
				syncStableWidth(element, element.dataset.stableWidthKey, bucket, now)
			}
			for (const element of panel.body.querySelectorAll('[data-stable-height-key]')) {
				const bucketName = element.dataset.stableHeightBucket || 'rows'
				const bucket = state[bucketName] || (state[bucketName] = Object.create(null))
				syncStableHeight(element, element.dataset.stableHeightKey, bucket, now)
			}
			stabilizeDetailHeight(panel, state, now)
		}

		function syncStableWidth(element, key, bucket, now) {
			if (!element || !key) return
			const entry = bucket[key]
			const active = !!(entry && now - entry.time <= stableWidthTtl)
			element.style.minWidth = active ? Math.ceil(entry.width) + 'px' : ''

			const naturalWidth = measureNaturalWidth(element)
			if (!naturalWidth) return

			if (!entry || !active || naturalWidth >= entry.width - 0.5) {
				const width = active ? Math.max(entry.width, naturalWidth) : naturalWidth
				bucket[key] = { width, time: now }
				element.style.minWidth = Math.ceil(width) + 'px'
				return
			}

			element.style.minWidth = Math.ceil(entry.width) + 'px'
		}

		function syncStableHeight(element, key, bucket, now) {
			if (!element || !key) return
			const entry = bucket[key]
			const active = !!(entry && now - entry.time <= stableWidthTtl)
			element.style.minHeight = active ? Math.ceil(entry.height) + 'px' : ''

			const naturalHeight = measureNaturalHeight(element)
			if (!naturalHeight) return

			if (!entry || !active || naturalHeight >= entry.height - 0.5) {
				const height = active ? Math.max(entry.height, naturalHeight) : naturalHeight
				bucket[key] = { height, time: now }
				element.style.minHeight = Math.ceil(height) + 'px'
				return
			}

			element.style.minHeight = Math.ceil(entry.height) + 'px'
		}

		function stabilizeDetailHeight(panel, state, now) {
			if (!panel?.body) return
			const bucket = state.heights || (state.heights = Object.create(null))
			const key = 'detail'
			const entry = bucket[key]
			const active = !!(entry && now - entry.time <= stableWidthTtl)
			const topHeight = measureElementHeight(panel.topFlow)
			const naturalBodyHeight = measureNaturalHeight(panel.body)
			const naturalTotalHeight = naturalBodyHeight + topHeight
			if (!naturalTotalHeight) return

			let targetTotalHeight = naturalTotalHeight
			if (!entry || !active || naturalTotalHeight >= entry.height - 0.5) {
				targetTotalHeight = active ? Math.max(entry.height, naturalTotalHeight) : naturalTotalHeight
				bucket[key] = { height: targetTotalHeight, time: now }
			} else {
				targetTotalHeight = entry.height
			}

			const bodyHeight = Math.max(naturalBodyHeight, targetTotalHeight - topHeight)
			panel.body.style.minHeight = Math.ceil(bodyHeight) + 'px'
		}

		function measureNaturalWidth(element) {
			const previous = element.style.minWidth
			element.style.minWidth = ''
			const rect = element.getBoundingClientRect?.()
			const width = Math.max(rect?.width || 0, element.scrollWidth || 0)
			element.style.minWidth = previous
			return Math.ceil(width)
		}

		function measureNaturalHeight(element) {
			const previous = element.style.minHeight
			element.style.minHeight = ''
			const rect = element.getBoundingClientRect?.()
			const height = Math.max(rect?.height || 0, element.scrollHeight || 0)
			element.style.minHeight = previous
			return Math.ceil(height)
		}

		function measureElementHeight(element) {
			if (!element) return 0
			const rect = element.getBoundingClientRect?.()
			return Math.ceil(Math.max(rect?.height || 0, element.scrollHeight || 0))
		}

		function conversionFlowRow(input, output, key) {
			return { flow: true, input, output, key, signature: 'flow:' + resourceSignature(input) + '>' + resourceSignature(output) }
		}

		function textRow(label, value, key, options) {
			return { label, value, key, ...(options || {}), signature: label + ':' + value }
		}

		function resourceRow(label, resources, suffix, key) {
			return { label, resources, suffix, key, signature: label + ':' + resourceSignature(resources) + ':' + suffix }
		}

		function statusText(game, entity) {
			if (entity.active) return text(game, 'active')
			if (entity.state === 0) return text(game, 'idle')
			if (entity.state === 1) return text(game, 'starting')
			if (entity.state === 2) return text(game, 'active')
			if (entity.state === 3) return text(game, 'transition')
			if (entity.state === 4) return text(game, 'cooldown')
			return text(game, 'ready')
		}

		function text(game, key) {
			const value = game?.pronounce?.('cattailDynamicDetails', key)
			return typeof value === 'string' ? value : key
		}

		function pronounceResource(game, id) {
			const value = game?.pronounce?.('resources', id)
			return typeof value === 'string' ? value : String(id)
		}

		function pronounceRandom(game, key) {
			const value = game?.pronounce?.('random', key)
			return typeof value === 'string' ? value : key
		}

		function formatNumber(game, value) {
			const number = Number(value) || 0
			const sign = number < 0 ? '-' : ''
			const abs = Math.abs(number)
			if (abs === 0) return '0'
			if (abs < 0.001) return sign + abs.toExponential(2)
			if (abs < 1) return sign + trimNumber(abs, 3)
			if (abs < 1000) return sign + trimNumber(abs, abs < 10 ? 2 : 1)
			if (typeof game?.makeReadable === 'function') return String(game.makeReadable(number))
			return sign + Math.round(abs).toString()
		}

		function formatPercent(value) {
			const percent = (Number(value) || 0) * 100
			return trimNumber(percent, Math.abs(percent) < 10 ? 1 : 0) + '%'
		}

		function formatSeconds(ms) {
			return trimNumber((Number(ms) || 0) / 1000, 1) + 's'
		}

		function formatStabilizedSurgeTime(game, entity, ms) {
			const stabilization = Number(entity?.stabilization)
			if (!Number.isFinite(stabilization) || stabilization <= 0) return text(game, 'alwaysOn')
			return formatDuration((Number(ms) || 0) / stabilization)
		}

		function formatDuration(ms) {
			const seconds = Math.max(0, (Number(ms) || 0) / 1000)
			if (seconds < 90) return trimNumber(seconds, seconds < 10 ? 1 : 0) + 's'
			const minutes = Math.floor(seconds / 60)
			const restSeconds = Math.floor(seconds % 60)
			if (minutes < 60) return minutes + 'm ' + restSeconds + 's'
			return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm'
		}

		function trimNumber(value, digits) {
			return Number(value).toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
		}

		function round(value) {
			const number = Number(value)
			if (!Number.isFinite(number)) return 0
			return Math.round(number * 10000) / 10000
		}


		function installResourceSourceTracking() {
			if (typeof Game === 'undefined' || !Game.prototype) return

			installResourceSourceGpuLineToggle()
			installResourceSourceLineChartWheelToggle()
			installResourceSourceProfilerToggle()
			patchCubeResourceSourceAttribution()
			patchMinedCubeResourceSourceAttribution()
			patchGeneralDecayResourceSourceAttribution()
			patchResourceSourceProducerContexts()

			if (typeof Splash !== 'undefined' && Splash.prototype && !Splash.prototype._cattailDynamicResourceSourceShowPatched) {
				Splash.prototype._cattailDynamicResourceSourceShowPatched = true
				api.patch(Splash.prototype, 'show', function (original) {
					return function (...args) {
						clearResourceSourceGpuLines(this.master)
						return original.apply(this, args)
					}
				})
			}

			api.patch(Game.prototype, 'switchPlane', function (original) {
				return function (...args) {
					clearResourceSourceGpuLines(this)
					const result = original.apply(this, args)
					clearResourceSourceGpuLines(this)
					return result
				}
			})

			api.patch(Game.prototype, 'watchCredits', function (original) {
				return function (...args) {
					clearResourceSourceGpuLines(this)
					return original.apply(this, args)
				}
			})

			api.patch(Game.prototype, 'addEntity', function (original) {
				return function (name, ...args) {
					if (name === 'pinhole') clearResourceSourceGpuLines(this)
					const result = original.apply(this, arguments)
					if (name === 'pinhole') clearResourceSourceGpuLines(this)
					return result
				}
			})

			api.patch(Game.prototype, 'createResourceTransfer', function (original) {
				return function (resources, source, destination, onfinish, visibility, skip) {
					const result = original.apply(this, arguments)
					if (!skip && !onfinish && hasAnyTrackedResource(resources) && !shouldSuppressResourceSourceTransferFromScreen(this, source)) {
						recordResourceSourceEvent(this, 'gain', resources, identifyResourceSourceForGain(this, resources, source, visibility))
					}
					return result
				}
			})

			api.patch(Game.prototype, 'createLightning', function (original) {
				return function (resources, source, destination, onfinish, visibility, color) {
					const result = original.apply(this, arguments)
					if (!onfinish && hasAnyTrackedResource(resources)) {
						recordResourceSourceEvent(this, 'gain', resources, identifyResourceSourceForGain(this, resources, source, visibility))
					}
					return result
				}
			})

			api.patch(Game.prototype, 'createChasmTransfer', function (original) {
				return function (resources, path, onfinish, visibility, skipIndex) {
					const result = original.apply(this, arguments)
					if (!onfinish && hasAnyTrackedResource(resources) && Array.isArray(path) && path.length) {
						const source = Array.isArray(path[0]) ? this.uvToXYUntranslated(path[0]) : null
						if (!shouldSuppressResourceSourceTransferFromScreen(this, source)) {
							recordResourceSourceEvent(this, 'gain', resources, identifyResourceSourceForGain(this, resources, source, visibility))
						}
					}
					return result
				}
			})

			api.patch(Game.prototype, 'requestResources', function (original) {
				return function (resources, destination, onfinish, skip) {
					const before = normalizeResourceArray(this.resources || [], (this.resources || []).length)
					const result = original.apply(this, arguments)
					if (result && !skip) {
						recordResourceSourceEvent(this, 'consume', diffConsumedResources(before, this.resources || []), identifyResourceSourceFromCell(this, destination))
					}
					return result
				}
			})

			api.patch(Game.prototype, 'askForResources', function (original) {
				return function (resources, destination, onfinish, skip) {
					const before = normalizeResourceArray(this.resources || [], (this.resources || []).length)
					const result = original.apply(this, arguments)
					if (result && !skip) {
						recordResourceSourceEvent(this, 'consume', diffConsumedResources(before, this.resources || []), identifyResourceSourceFromCell(this, destination))
					}
					return result
				}
			})

			api.patch(Game.prototype, 'updateAnalytics', function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					recordResourceSourceLineChartSample(this, args[0])
					return result
				}
			})

			api.patch(Game.prototype, 'renderResources', function (original) {
				return function (...args) {
					if (resourceSourceProfilerEnabled) resourceSourceProfilerRenderCycles++
					profileResourceSource('resource.warmup.schedule', () => scheduleResourceSourceWarmup(this), () => getResourceSourceProfileDetail(this, getResourceSourceFocusResourceId(this)))
					profileResourceSource('resource.events.trim.render', () => trimResourceSourceEvents(getResourceSourceState(this), performance.now()), () => getResourceSourceProfileDetail(this, getResourceSourceFocusResourceId(this)))
					if (isResourceSourceOverlayInactive(this)) {
						clearResourceSourceGpuLines(this)
						return original.apply(this, args)
					}
					const previousHoveredResource = this.hoveredResource
					if (Number.isInteger(previousHoveredResource)) rememberResourceSourceResource(this, previousHoveredResource)
					const virtualHoveredResource = getResourceSourceVirtualHoveredResourceId(this)
					const useVirtualHover = Number.isInteger(virtualHoveredResource) && !Number.isInteger(previousHoveredResource)
					if (useVirtualHover) this.hoveredResource = virtualHoveredResource
					try {
						profileResourceSource(
							'resource.links.total',
							() => { if (!shouldUseResourceSourceRenderApiLinks(this)) renderResourceSourceLinks(this, this.ctx, { compositeGpuToCanvas: true }) },
							() => getResourceSourceProfileDetail(this, getResourceSourceFocusResourceId(this))
						)
						const result = profileResourceSource(
							'resource.vanilla.renderResources',
							() => original.apply(this, args),
							() => getResourceSourceProfileDetail(this, getResourceSourceFocusResourceId(this))
						)
						profileResourceSource(
							'resource.lineChart.render',
							() => renderResourceSourceLineChart(this),
							() => getResourceSourceProfileDetail(this, getResourceSourceFocusResourceId(this))
						)
						profileResourceSource(
							'resource.panel.phase',
							() => renderResourceSourcePanels(this),
							() => getResourceSourceProfileDetail(this, getResourceSourceFocusResourceId(this))
						)
						return result
					} finally {
						if (useVirtualHover) this.hoveredResource = previousHoveredResource
					}
				}
			})

			api.patch(Game.prototype, 'renderDarkResources', function (original) {
				return function (...args) {
					clearResourceSourceGpuLines(this)
					return original.apply(this, args)
				}
			})
		}

		function installResourceSourceLineChartWheelToggle() {
			if (window._cattailDynamicResourceSourceLineChartWheelInstalled) return
			window._cattailDynamicResourceSourceLineChartWheelInstalled = true
			addEventListener('wheel', function (event) {
				const game = lastGame
				if (!isResourceSourceLineChartWheelEvent(event, game)) return
				event.preventDefault()
				event.stopImmediatePropagation()
				const now = performance.now()
				if (now - resourceSourceLineChartLastWheel < resourceSourceLineChartWheelCooldownMs) return
				resourceSourceLineChartLastWheel = now
				setResourceSourceLineChartMode(!isResourceSourceLineChartModeActive())
			}, { capture: true, passive: false })
		}

		function isResourceSourceLineChartWheelEvent(event, game) {
			return !!(
				isResourceSourceLineChartEnabled() &&
				game &&
				game.entitiesInGame?.mega1b &&
				Number.isInteger(game.hoveredResource) &&
				((event?.deltaY || 0) || (event?.deltaX || 0))
			)
		}

		function installResourceSourceGpuLineToggle() {
			if (window._cattailDynamicResourceSourceGpuLineToggleInstalled) return
			window._cattailDynamicResourceSourceGpuLineToggleInstalled = true
			addEventListener('keydown', function (event) {
				if (!isResourceSourceGpuLineToggleEvent(event) || event.repeat) return
				const game = lastGame
				if (!game) return
				setResourceSourceGpuLineMode(game, !isResourceSourceGpuLineModeActive(game))
				event.preventDefault()
				event.stopImmediatePropagation()
			}, true)
		}

		function installResourceSourceProfilerToggle() {
			if (window._cattailDynamicResourceSourceProfilerInstalled) return
			window._cattailDynamicResourceSourceProfilerInstalled = true
			resourceSourceProfilerEnabled = loadStoredBoolean(resourceSourceProfilerStorageKey, false)
			startResourceSourceFrameStallDetector()
			startResourceSourceLongTaskObserver()
			if (resourceSourceProfilerEnabled) console.info('[Cattail Dynamic Details] Resource source profiler enabled. Press F8 to toggle.')
			window.cattailResourceSourceProfiler = {
				enable(options = {}) {
					resourceSourceProfilerMethodSampleLimit = normalizeResourceSourceProfilerSampleLimit(options.samples || options.sampleLimit || resourceSourceProfilerMethodSampleLimit)
					clearResourceSourceProfilerTables()
					setResourceSourceProfilerEnabled(true)
					return getResourceSourceProfilerSummary()
				},
				disable() {
					setResourceSourceProfilerEnabled(false)
					return getResourceSourceProfilerSummary()
				},
				clear() {
					clearResourceSourceProfilerTables()
					return getResourceSourceProfilerSummary()
				},
				isEnabled() { return resourceSourceProfilerEnabled },
				summary() { return getResourceSourceProfilerSummary() },
				renderApi(game = lastGame) { return getResourceSourceRenderApiStatus(game) },
				methods(options = {}) { return listResourceSourceProfilerMethods(options) }
			}
			addEventListener('keydown', function (event) {
				if (!isResourceSourceProfilerToggleEvent(event) || event.repeat) return
				setResourceSourceProfilerEnabled(!resourceSourceProfilerEnabled)
				event.preventDefault()
				event.stopImmediatePropagation()
			}, true)
		}

		function isResourceSourceProfilerToggleEvent(event) {
			return event?.key === 'F8' || event?.code === 'F8' || event?.keyCode === 119
		}

		function setResourceSourceProfilerEnabled(active) {
			resourceSourceProfilerEnabled = !!active
			saveStoredBoolean(resourceSourceProfilerStorageKey, resourceSourceProfilerEnabled)
			console.info('[Cattail Dynamic Details] Resource source profiler ' + (resourceSourceProfilerEnabled ? 'enabled' : 'disabled') + '. Press F8 to toggle.')
		}

		function startResourceSourceFrameStallDetector() {
			if (resourceSourceFrameProbeStarted) return
			resourceSourceFrameProbeStarted = true
			const step = (now) => {
				if (resourceSourceFrameLastTime && resourceSourceProfilerEnabled) {
					const gap = now - resourceSourceFrameLastTime
					if (gap >= resourceSourceFrameStallMs && now - resourceSourceFrameLastLog >= resourceSourceFrameStallCooldownMs) {
						resourceSourceFrameLastLog = now
						console.warn('[Cattail Dynamic Details][ResourceSource] frame.stall ' + gap.toFixed(2) + 'ms' + formatResourceSourceLogDetail(getResourceSourceFrameStallDetail(gap)))
					}
				}
				resourceSourceFrameLastTime = now
				requestAnimationFrame(step)
			}
			requestAnimationFrame(step)
		}

		function startResourceSourceLongTaskObserver() {
			if (resourceSourceLongTaskObserverStarted) return
			resourceSourceLongTaskObserverStarted = true
			if (typeof PerformanceObserver !== 'function') return
			try {
				const observer = new PerformanceObserver((list) => {
					if (!resourceSourceProfilerEnabled) return
					for (const entry of list.getEntries()) {
						if (!entry || entry.duration < resourceSourceLongTaskMinMs) continue
						console.warn('[Cattail Dynamic Details][ResourceSource] longtask ' + entry.duration.toFixed(2) + 'ms' + formatResourceSourceLogDetail(getResourceSourceLongTaskDetail(entry)))
					}
				})
				resourceSourceLongTaskObserver = observer
				observer.observe({ type: 'longtask', buffered: true })
			} catch (error) {
				if (resourceSourceProfilerEnabled) {
					console.info('[Cattail Dynamic Details][ResourceSource]', 'longtask unsupported', String(error?.message || error))
				}
			}
		}

		function formatResourceSourceLogDetail(detail) {
			if (!detail) return ''
			try {
				const seen = new WeakSet()
				return String.fromCharCode(10) + JSON.stringify(detail, (key, value) => {
					if (typeof value === 'function') return '[function]'
					if (typeof value === 'number' && !Number.isFinite(value)) return String(value)
					if (value && typeof value === 'object') {
						if (seen.has(value)) return '[circular]'
						seen.add(value)
						if (typeof HTMLImageElement !== 'undefined' && value instanceof HTMLImageElement) {
							return {
								src: value.src,
								complete: value.complete,
								naturalWidth: value.naturalWidth,
								naturalHeight: value.naturalHeight
							}
						}
						if (typeof Element !== 'undefined' && value instanceof Element) return '[element ' + value.tagName + ']'
					}
					return value
				}, 2)
			} catch (error) {
				return String.fromCharCode(10) + String(error?.message || error)
			}
		}
		function getResourceSourceFrameStallDetail(gap) {
			const game = lastGame
			const state = game?.[resourceSourceStateKey]
			const buildState = game?.[buildCountdownStateKey]
			let focusResource = null
			try {
				focusResource = getResourceSourceFocusResourceId(game)
			} catch (error) {}
			return {
				gap: Math.round(gap * 100) / 100,
				resourceId: focusResource,
				hoveredResource: Number.isInteger(game?.hoveredResource) ? game.hoveredResource : null,
				lineLocked: !!game?.[resourceSourceLineLockKey],
				lineResource: Number.isInteger(game?.[resourceSourceLineResourceKey]) ? game[resourceSourceLineResourceKey] : null,
				panelActive: isResourceSourcePanelActive(game),
				linkActive: isResourceSourceLinkActive(game),
				gpu: !!game?.[resourceSourceGpuLineModeKey],
				events: Array.isArray(state?.events) ? state.events.length : 0,
				images: resourceSourceImageCache.size,
				buildEvents: Array.isArray(buildState?.resourceEvents) ? buildState.resourceEvents.length : 0,
				buildSnapshots: Array.isArray(buildState?.snapshots) ? buildState.snapshots.length : 0,
				decodeQueue: resourceSourceImageDecodeQueue.length,
				decodeActive: resourceSourceImageDecodeActive,
				plane: game?.plane || 0,
				alt: !!game?.altActive,
				shift: !!game?.shiftPressed,
				lastSamples: resourceSourceProfilerSamples.slice(-resourceSourceProfilerSampleLimit),
				activeStack: resourceSourceProfilerActiveStack.slice(),
				lastTrace: resourceSourceProfilerTrace.slice(-16)
			}
		}

		function getResourceSourceLongTaskDetail(entry) {
			const game = lastGame
			const state = game?.[resourceSourceStateKey]
			const buildState = game?.[buildCountdownStateKey]
			let focusResource = null
			try {
				focusResource = getResourceSourceFocusResourceId(game)
			} catch (error) {}
			return {
				duration: Math.round(entry.duration * 100) / 100,
				startTime: Math.round(entry.startTime),
				name: entry.name || '',
				resourceId: focusResource,
				hoveredResource: Number.isInteger(game?.hoveredResource) ? game.hoveredResource : null,
				lineLocked: !!game?.[resourceSourceLineLockKey],
				lineResource: Number.isInteger(game?.[resourceSourceLineResourceKey]) ? game[resourceSourceLineResourceKey] : null,
				panelActive: isResourceSourcePanelActive(game),
				linkActive: isResourceSourceLinkActive(game),
				gpu: !!game?.[resourceSourceGpuLineModeKey],
				events: Array.isArray(state?.events) ? state.events.length : 0,
				images: resourceSourceImageCache.size,
				buildEvents: Array.isArray(buildState?.resourceEvents) ? buildState.resourceEvents.length : 0,
				buildSnapshots: Array.isArray(buildState?.snapshots) ? buildState.snapshots.length : 0,
				decodeQueue: resourceSourceImageDecodeQueue.length,
				decodeActive: resourceSourceImageDecodeActive,
				plane: game?.plane || 0,
				alt: !!game?.altActive,
				shift: !!game?.shiftPressed,
				attribution: Array.from(entry.attribution || []).map((item) => ({
					name: item.name,
					entryType: item.entryType,
					containerType: item.containerType,
					containerName: item.containerName,
					containerSrc: item.containerSrc
				})),
				lastSamples: resourceSourceProfilerSamples.slice(-resourceSourceProfilerSampleLimit),
				activeStack: resourceSourceProfilerActiveStack.slice(),
				lastTrace: resourceSourceProfilerTrace.slice(-16)
			}
		}
		function rememberResourceSourceProfileTrace(label, phase, detail) {
			if (!resourceSourceProfilerEnabled) return
			resourceSourceProfilerTrace.push({
				label,
				phase,
				time: Math.round(performance.now()),
				detail
			})
			while (resourceSourceProfilerTrace.length > resourceSourceProfilerTraceLimit) resourceSourceProfilerTrace.shift()
		}

		function rememberResourceSourceProfileSample(label, duration, detail) {
			resourceSourceProfilerSamples.push({
				label,
				duration: Math.round(duration * 100) / 100,
				time: Math.round(performance.now()),
				detail
			})
			while (resourceSourceProfilerSamples.length > resourceSourceProfilerSampleLimit) resourceSourceProfilerSamples.shift()
		}
		function profileResourceSource(label, callback, detail) {
			if (!resourceSourceProfilerEnabled) return callback()
			const start = performance.now()
			const stackIndex = resourceSourceProfilerActiveStack.length
			resourceSourceProfilerActiveStack.push(label)
			rememberResourceSourceProfileTrace(label, 'start')
			try {
				return callback()
			} finally {
				const duration = performance.now() - start
				resourceSourceProfilerActiveStack.length = stackIndex
				recordResourceSourceProfileMethod(label, duration)
				rememberResourceSourceProfileTrace(label, 'end', { duration: Math.round(duration * 100) / 100 })
				logResourceSourceProfile(label, duration, detail)
			}
		}

		function recordResourceSourceProfileMethod(label, duration) {
			const key = String(label || 'unknown')
			let record = resourceSourceProfilerMethodRecords.get(key)
			if (!record) {
				record = { method: key, calls: 0, totalMs: 0, samples: [], lastMs: 0 }
				resourceSourceProfilerMethodRecords.set(key, record)
			}
			const elapsed = Math.max(0, Number(duration) || 0)
			record.calls++
			record.totalMs += elapsed
			record.samples.push(elapsed)
			record.lastMs = elapsed
			while (record.samples.length > resourceSourceProfilerMethodSampleLimit) record.totalMs -= record.samples.shift() || 0
		}

		function listResourceSourceProfilerMethods(options = {}) {
			const rows = Array.from(resourceSourceProfilerMethodRecords.values()).map(describeResourceSourceProfilerMethod)
			const sort = options.sort || 'perRender'
			rows.sort(function (a, b) {
				if (sort === 'avg') return (b.avgMs - a.avgMs) || String(a.method).localeCompare(String(b.method))
				if (sort === 'total') return (b.totalMs - a.totalMs) || String(a.method).localeCompare(String(b.method))
				if (sort === 'calls') return (b.calls - a.calls) || String(a.method).localeCompare(String(b.method))
				return (b.avgPerRenderMs - a.avgPerRenderMs) || String(a.method).localeCompare(String(b.method))
			})
			return rows
		}

		function describeResourceSourceProfilerMethod(record) {
			const samples = record.samples || []
			let min = Infinity
			let max = 0
			for (const value of samples) {
				if (value < min) min = value
				if (value > max) max = value
			}
			const sampleCount = samples.length
			const avgMs = sampleCount ? record.totalMs / sampleCount : 0
			const callsPerRender = record.calls / Math.max(1, resourceSourceProfilerRenderCycles)
			return {
				method: record.method,
				calls: record.calls,
				callsPerRender: roundResourceSourceProfilerNumber(callsPerRender, 3),
				sampleCount,
				avgMs: roundResourceSourceProfilerMs(avgMs),
				avgPerRenderMs: roundResourceSourceProfilerMs(avgMs * callsPerRender),
				lastMs: roundResourceSourceProfilerMs(record.lastMs || 0),
				maxMs: sampleCount ? roundResourceSourceProfilerMs(max) : 0,
				minMs: sampleCount ? roundResourceSourceProfilerMs(min) : 0,
				totalMs: roundResourceSourceProfilerMs(record.totalMs || 0)
			}
		}

		function getResourceSourceProfilerSummary() {
			return {
				enabled: resourceSourceProfilerEnabled,
				sampleLimit: resourceSourceProfilerMethodSampleLimit,
				renderCycles: resourceSourceProfilerRenderCycles,
				top: listResourceSourceProfilerMethods().slice(0, 8),
				renderApi: getResourceSourceRenderApiStatus(lastGame),
				lastSamples: resourceSourceProfilerSamples.slice(-resourceSourceProfilerSampleLimit),
				lastTrace: resourceSourceProfilerTrace.slice(-16)
			}
		}

		function clearResourceSourceProfilerTables() {
			resourceSourceProfilerMethodRecords.clear()
			resourceSourceProfilerStats.clear()
			resourceSourceProfilerSamples.length = 0
			resourceSourceProfilerTrace.length = 0
			resourceSourceProfilerActiveStack.length = 0
			resourceSourceProfilerRenderCycles = 0
		}
		function getResourceSourceRenderApiStatus(game = lastGame) {
			const apiAvailable = !!(api.render && typeof api.render === 'object')
			const apiEnabled = apiAvailable && (typeof api.render.isEnabled !== 'function' || api.render.isEnabled() !== false)
			let featureEnabled = false
			let overlayInactive = false
			let shouldUse = false
			let shouldDemand = false
			let linkActive = false
			let lineLocked = false
			let toggleActive = false
			let gpuCanvasVisible = false
			let focusResource = null
			let selectedResource = null
			let lineResource = null
			try { featureEnabled = isResourceSourceFeatureEnabled() } catch (error) {}
			try { overlayInactive = isResourceSourceOverlayInactive(game) } catch (error) {}
			try { shouldUse = shouldUseResourceSourceRenderApiLinks(game) } catch (error) {}
			try { shouldDemand = shouldDemandResourceSourceRenderApiLinks(game) } catch (error) {}
			try { linkActive = isResourceSourceLinkActive(game) } catch (error) {}
			try { lineLocked = isResourceSourceLineLockActive(game) } catch (error) {}
			try { toggleActive = isResourceSourceToggleActive(game) } catch (error) {}
			try { gpuCanvasVisible = isResourceSourceGpuLineCanvasVisible(game) } catch (error) {}
			try { focusResource = getResourceSourceFocusResourceId(game) } catch (error) {}
			try { selectedResource = getResourceSourceSelectedResourceId(game) } catch (error) {}
			try { lineResource = getResourceSourceLineResourceId(game) } catch (error) {}
			return {
				apiAvailable,
				apiEnabled,
				registered: !!resourceSourceRenderApiRegistered,
				featureEnabled,
				overlayInactive,
				shouldUse,
				shouldDemand,
				linkActive,
				lineLocked,
				toggleActive,
				gpuCanvasVisible,
				hoveredResource: Number.isInteger(game?.hoveredResource) ? game.hoveredResource : null,
				lastResource: Number.isInteger(game?.[resourceSourceLastResourceKey]) ? game[resourceSourceLastResourceKey] : null,
				lineResource: Number.isInteger(lineResource) ? lineResource : null,
				selectedResource: Number.isInteger(selectedResource) ? selectedResource : null,
				focusResource: Number.isInteger(focusResource) ? focusResource : null,
				layer: api.render?.describeLayer?.(resourceSourceRenderLayerId)
			}
		}

		function normalizeResourceSourceProfilerSampleLimit(value) {
			const parsed = Number(value)
			if (!Number.isFinite(parsed)) return resourceSourceProfilerMethodDefaultSampleLimit
			return Math.max(1, Math.min(5000, Math.floor(parsed)))
		}

		function roundResourceSourceProfilerMs(value) {
			return Math.round((Number(value) || 0) * 1000) / 1000
		}

		function roundResourceSourceProfilerNumber(value, digits) {
			const number = Number(value)
			if (!Number.isFinite(number)) return 0
			const scale = Math.pow(10, digits)
			return Math.round(number * scale) / scale
		}

		function logResourceSourceProfile(label, duration, detail) {
			if (!resourceSourceProfilerEnabled || duration < resourceSourceProfilerSlowMs) return
			let resolvedDetail = detail
			if (typeof detail === 'function') {
				try {
					resolvedDetail = detail()
				} catch (error) {
					resolvedDetail = { detailError: String(error?.message || error) }
				}
			}
			rememberResourceSourceProfileSample(label, duration, resolvedDetail)
			if (duration >= resourceSourceProfilerVerySlowMs) {
				console.warn('[Cattail Dynamic Details][ResourceSource] ' + label + ' ' + duration.toFixed(2) + 'ms' + formatResourceSourceLogDetail(resolvedDetail))
				return
			}
			logResourceSourceProfileThrottled(label, duration, resolvedDetail)
		}

		function logResourceSourceProfileThrottled(label, duration, detail) {
			const now = performance.now()
			let stat = resourceSourceProfilerStats.get(label)
			if (!stat) {
				stat = { count: 0, total: 0, max: 0, last: 0, detail: null }
				resourceSourceProfilerStats.set(label, stat)
			}
			stat.count++
			stat.total += duration
			if (duration >= stat.max) {
				stat.max = duration
				stat.detail = detail
			}
			if (now - stat.last < resourceSourceProfilerThrottleMs) return
			stat.last = now
			const average = stat.total / Math.max(1, stat.count)
			console.info('[Cattail Dynamic Details][ResourceSource] ' + label + ' avg ' + average.toFixed(2) + 'ms max ' + stat.max.toFixed(2) + 'ms x' + stat.count + formatResourceSourceLogDetail(stat.detail))
			stat.count = 0
			stat.total = 0
			stat.max = 0
			stat.detail = null
		}

		function logResourceSourceAsyncProfile(label, duration, detail) {
			if (!resourceSourceProfilerEnabled || duration < resourceSourceProfilerSlowMs) return
			const resolvedDetail = Object.assign({ asyncElapsed: true }, detail || {})
			rememberResourceSourceProfileSample(label, duration, resolvedDetail)
			logResourceSourceProfileThrottled(label, duration, resolvedDetail)
		}
		function getResourceSourceProfileDetail(game, resourceId, extra = {}) {
			const state = game?.[resourceSourceStateKey]
			return Object.assign({
				resourceId,
				events: Array.isArray(state?.events) ? state.events.length : 0,
				gpu: !!game?.[resourceSourceGpuLineModeKey]
			}, extra)
		}
		function isResourceSourceGpuLineToggleEvent(event) {
			const key = String(event?.key || '').toLowerCase()
			return key === 'o' || event?.code === 'KeyO' || event?.keyCode === 79
		}

		function isResourceSourceGpuLineModeActive(game) {
			initializeResourceSourcePreferences(game)
			return !!game?.[resourceSourceGpuLineModeKey]
		}

		function setResourceSourceGpuLineMode(game, active) {
			if (!game) return
			initializeResourceSourcePreferences(game)
			setConfiguredResourceSourceGpuLineMode(active)
			game[resourceSourceGpuLineModeKey] = !!active
			saveStoredBoolean(resourceSourceGpuLineModeStorageKey, !!active)
			if (!active) clearResourceSourceGpuLines(game)
		}

		function getResourceSourceVirtualHoveredResourceId(game) {
			if (!isResourceSourceToggleActive(game)) return null
			const resourceId = getResourceSourceFocusResourceId(game)
			return Number.isInteger(resourceId) ? resourceId : null
		}

		function hasAnyTrackedResource(resources) {
			return Array.isArray(resources) && resources.some((value) => Math.abs(Number(value) || 0) >= resourceSourceMinAmount)
		}

		function diffConsumedResources(before, after) {
			const length = Math.max(before?.length || 0, after?.length || 0)
			const result = new Array(length).fill(0)
			for (let i = 0; i < length; i++) {
				const delta = (Number(before?.[i]) || 0) - (Number(after?.[i]) || 0)
				if (delta > resourceSourceMinAmount) result[i] = delta
			}
			return result
		}

		function getResourceSourceState(game) {
			if (!game) return { events: [], startedAt: performance.now(), eventBuckets: new Map() }
			initializeResourceSourcePreferences(game)
			if (!game[resourceSourceStateKey]) {
				Object.defineProperty(game, resourceSourceStateKey, {
					configurable: true,
					value: { events: [], startedAt: performance.now(), summaryCache: Object.create(null), eventBuckets: new Map() }
				})
			}
			const state = game[resourceSourceStateKey]
			if (!Array.isArray(state.events)) state.events = []
			if (!state.startedAt) state.startedAt = performance.now()
			if (!state.summaryCache) state.summaryCache = Object.create(null)
			if (!(state.eventBuckets instanceof Map)) state.eventBuckets = new Map()
			return state
		}

		function recordResourceSourceEvent(game, type, resources, source, now = performance.now()) {
			if (!game || !hasAnyTrackedResource(resources)) return
			const state = getResourceSourceState(game)
			trimResourceSourceEvents(state, now)
			const normalizedSource = normalizeResourceSource(game, source)
			if (type === 'gain' && normalizedSource.kind === 'unknown') return

			for (let i = 0; i < resources.length; i++) {
				const amount = Math.abs(Number(resources[i]) || 0)
				if (amount < resourceSourceMinAmount) continue
				appendResourceSourceEvent(state, type, i, amount, normalizedSource, now)
			}
		}

		function appendResourceSourceEvent(state, type, resourceId, amount, source, now) {
			const bucketTime = Math.floor(now / resourceSourceEventBucketMs) * resourceSourceEventBucketMs
			const sourceKey = source.instanceKey || source.groupKey || source.kind || 'unknown'
			const bucketKey = bucketTime + '|' + type + '|' + resourceId + '|' + sourceKey
			const existing = state.eventBuckets.get(bucketKey)
			if (existing) {
				existing.amount += amount
				return
			}
			const event = {
				time: bucketTime,
				bucketKey,
				type,
				resourceId,
				amount,
				source
			}
			state.events.push(event)
			state.eventBuckets.set(bucketKey, event)
		}

		function trimResourceSourceEvents(state, now) {
			if (!state || !Array.isArray(state.events)) return
			const cutoff = now - resourceSourceWindowMs
			let removeCount = 0
			while (removeCount < state.events.length && state.events[removeCount].time < cutoff) removeCount++
			if (removeCount) removeResourceSourceEvents(state, removeCount)
			const overflow = state.events.length - resourceSourceMaxEvents
			if (overflow > 0) removeResourceSourceEvents(state, overflow)
		}

		function removeResourceSourceEvents(state, count) {
			const removed = state.events.splice(0, count)
			if (state.eventBuckets instanceof Map) {
				for (const event of removed) {
					if (event?.bucketKey) state.eventBuckets.delete(event.bucketKey)
				}
			}
		}

		function patchCubeResourceSourceAttribution() {
			if (typeof Pump === 'undefined' || !Pump.prototype?.pumpTo || Pump.prototype._cattailDynamicCubeSourcePatched) return
			Pump.prototype._cattailDynamicCubeSourcePatched = true
			api.patch(Pump.prototype, 'pumpTo', function (original) {
				return function (cube, ...args) {
					if (cube?.name === 'cube') cube[cubeResourceSourcePumpKey] = this
					return original.call(this, cube, ...args)
				}
			})
		}

		function patchMinedCubeResourceSourceAttribution() {
			if (typeof Cube === 'undefined' || !Cube.prototype?.onmousedown || Cube.prototype._cattailDynamicResourceSourcePatched) return
			Cube.prototype._cattailDynamicResourceSourcePatched = true
			api.patch(Cube.prototype, 'onmousedown', function (original) {
				return function (...args) {
					const game = this.master
					const previous = game?.[resourceSourceActiveCubeKey]
					if (game && this.state === 2) game[resourceSourceActiveCubeKey] = this
					try {
						return original.apply(this, args)
					} finally {
						if (game) {
							if (previous) game[resourceSourceActiveCubeKey] = previous
							else delete game[resourceSourceActiveCubeKey]
						}
					}
				}
			})
		}

		function patchGeneralDecayResourceSourceAttribution() {
			if (typeof Generaldecay === 'undefined' || !Generaldecay.prototype?.consume || Generaldecay.prototype._cattailDynamicResourceSourcePatched) return
			Generaldecay.prototype._cattailDynamicResourceSourcePatched = true
			api.patch(Generaldecay.prototype, 'consume', function (original) {
				return function (resources, ...args) {
					if (Array.isArray(resources)) recordResourceSourceEvent(this.master, 'gain', resources, { kind: 'resource', resourceId: 5 })
					const game = this.master
					const previousSuppress = game?.[resourceSourceSuppressTransferKey]
					if (game) game[resourceSourceSuppressTransferKey] = true
					try {
						return original.call(this, resources, ...args)
					} finally {
						if (game) {
							if (previousSuppress) game[resourceSourceSuppressTransferKey] = previousSuppress
							else delete game[resourceSourceSuppressTransferKey]
						}
					}
				}
			})
		}

		function patchResourceSourceProducerContexts() {
			patchEntityResourceSourceProducer(typeof Consumer !== 'undefined' ? Consumer : null, 'release')
			patchEntityResourceSourceProducer(typeof Converter32 !== 'undefined' ? Converter32 : null, 'harvest')
			patchEntityResourceSourceProducer(typeof Converter13 !== 'undefined' ? Converter13 : null, 'harvest')
			patchEntityResourceSourceProducer(typeof Converter41 !== 'undefined' ? Converter41 : null, 'harvest')
			patchEntityResourceSourceProducer(typeof Converter76 !== 'undefined' ? Converter76 : null, 'harvest')
			patchEntityResourceSourceProducer(typeof Converter64 !== 'undefined' ? Converter64 : null, 'update')
			patchEntityResourceSourceProducer(typeof Gradient !== 'undefined' ? Gradient : null, 'tap')
			patchEntityResourceSourceProducer(typeof Annihilator !== 'undefined' ? Annihilator : null, 'tap')
			patchEntityResourceSourceProducer(typeof Hollow !== 'undefined' ? Hollow : null, 'onmousedown')
			patchEntityResourceSourceProducer(typeof Fruit !== 'undefined' ? Fruit : null, 'update')
			patchEntityResourceSourceProducer(typeof Fruit !== 'undefined' ? Fruit : null, 'onmousedown')
		}

		function patchEntityResourceSourceProducer(ClassRef, methodName) {
			const proto = ClassRef?.prototype
			if (!proto || typeof proto[methodName] !== 'function') return
			const marker = '_cattailDynamicResourceSourceProducerPatched_' + methodName
			if (proto[marker]) return
			proto[marker] = true
			api.patch(proto, methodName, function (original) {
				return function (...args) {
					return withResourceSourceProducer(this?.master, { kind: 'entity', entity: this }, () => original.apply(this, args))
				}
			})
		}

		function withResourceSourceProducer(game, source, callback) {
			if (!game) return callback()
			const previous = game[resourceSourceProducerKey]
			game[resourceSourceProducerKey] = source
			try {
				return callback()
			} finally {
				if (previous !== undefined) game[resourceSourceProducerKey] = previous
				else delete game[resourceSourceProducerKey]
			}
		}

		function getActiveResourceSourceProducer(game) {
			const source = game?.[resourceSourceProducerKey]
			if (!source) return null
			if (source.kind === 'entity' && source.entity?.name) return source
			if (source.kind === 'resource' && Number.isInteger(Number(source.resourceId))) return source
			if (source.name) return source
			return null
		}
		function shouldSuppressResourceSourceTransferFromScreen(game, point) {
			return !!game?.[resourceSourceSuppressTransferKey]
		}

		function identifyResourceSourceForGain(game, resources, source, visibility) {
			if (isRealitySoulCollection(game, resources, visibility)) return { kind: 'entity', entity: game.voidsculpture }
			const producer = getActiveResourceSourceProducer(game)
			if (producer) return producer
			const minedCube = getActiveMinedCubeResourceSource(game)
			if (minedCube) return minedCube
			const resourceId = findResourceHomeAtPoint(game, source)
			if (resourceId !== null) return { kind: 'resource', resourceId }
			return { kind: 'unknown' }
		}

		function getActiveMinedCubeResourceSource(game) {
			const cube = game?.[resourceSourceActiveCubeKey]
			return cube?.name === 'cube' ? { kind: 'entity', entity: cube } : null
		}

		function isRealitySoulCollection(game, resources, visibility) {
			if (!game?.voidsculpture || !Array.isArray(resources) || !Array.isArray(visibility)) return false
			if (visibility[0] !== 0 || visibility[1] !== 1) return false
			if ((Number(resources[9]) || 0) <= 0) return false
			for (let i = 0; i < resources.length; i++) {
				if (i !== 9 && Math.abs(Number(resources[i]) || 0) >= resourceSourceMinAmount) return false
			}
			return true
		}

		function normalizeResourceSource(game, source) {
			if (source?.kind === 'resource') {
				const resourceId = Number(source.resourceId)
				return {
					kind: 'resource',
					resourceId,
					groupKey: 'resource:' + resourceId,
					instanceKey: 'resource:' + resourceId
				}
			}

			const entity = getResourceSourceAttributionEntity(game, source?.entity)
			if (entity?.name) {
				const position = Array.isArray(entity.position) ? entity.position.slice() : (Array.isArray(source.position) ? source.position.slice() : null)
				return {
					kind: 'entity',
					name: entity.name,
					position,
					groupKey: 'entity:' + entity.name,
					instanceKey: 'entity:' + entity.name + ':' + (position ? cellKey(position) : 'unknown')
				}
			}

			if (source?.name) {
				const position = Array.isArray(source.position) ? source.position.slice() : null
				return {
					kind: 'entity',
					name: source.name,
					position,
					groupKey: 'entity:' + source.name,
					instanceKey: 'entity:' + source.name + ':' + (position ? cellKey(position) : 'unknown')
				}
			}

			return {
				kind: 'unknown',
				groupKey: 'unknown',
				instanceKey: 'unknown'
			}
		}

		function identifyResourceSourceFromScreen(game, point) {
			if (!game || !Array.isArray(point)) return null
			const resourceId = findResourceHomeAtPoint(game, point)
			if (resourceId !== null) return { kind: 'resource', resourceId }
			const entity = getResourceSourceAttributionEntity(game, findEntityNearScreenPoint(game, point))
			return entity ? { kind: 'entity', entity } : { kind: 'unknown' }
		}

		function identifyResourceSourceFromCell(game, cell) {
			if (!game || !Array.isArray(cell)) return null
			const entity = getResourceSourceAttributionEntity(game, game.entityAtCoordinates?.([Math.floor(cell[0]), Math.floor(cell[1])]))
			if (entity) return { kind: 'entity', entity }
			return { kind: 'unknown', position: cell.slice() }
		}

		function getResourceSourceAttributionEntity(game, entity) {
			if (!entity || entity.name !== 'cube') return entity
			return getCubeResourceSourcePump(game, entity) || entity
		}

		function getCubeResourceSourcePump(game, cube) {
			if (!cube || cube.name !== 'cube') return null
			if (isResourceSourcePumpEntity(cube[cubeResourceSourcePumpKey])) return cube[cubeResourceSourcePumpKey]
			if (isResourceSourcePumpEntity(cube.pump)) {
				cube[cubeResourceSourcePumpKey] = cube.pump
				return cube.pump
			}
			if (!Array.isArray(cube.position) || !Array.isArray(game?.stuff)) return null
			for (const entity of game.stuff) {
				if (!isResourceSourcePumpEntity(entity) || !Array.isArray(entity.position)) continue
				if (!isCellInPumpRange(entity, cube.position)) continue
				cube[cubeResourceSourcePumpKey] = entity
				return entity
			}
			return null
		}

		function isResourceSourcePumpEntity(entity) {
			return entity?.name === 'pump' || entity?.name === 'pump2'
		}

		function isCellInPumpRange(pump, cell) {
			const ranges = []
			if (Array.isArray(pump.soi)) ranges.push(pump.soi)
			if (Array.isArray(pump.soe)) ranges.push(pump.soe)
			for (const range of ranges) {
				for (const offset of range) {
					if (!Array.isArray(offset)) continue
					if (pump.position[0] + offset[0] === cell[0] && pump.position[1] + offset[1] === cell[1]) return true
				}
			}
			return false
		}

		function findResourceHomeAtPoint(game, point) {
			if (!Array.isArray(game?.resourceHomes)) return null
			const threshold = Math.max(6 * (game.pixelRatio || 1), (game.screenUnit || game.unit || 1) * 0.26)
			let best = null
			let bestDistance = threshold * threshold
			for (let i = 0; i < game.resourceHomes.length; i++) {
				const home = game.resourceHomes[i]
				if (!Array.isArray(home)) continue
				const dx = home[0] - point[0]
				const dy = home[1] - point[1]
				const distance = dx * dx + dy * dy
				if (distance <= bestDistance) {
					best = i
					bestDistance = distance
				}
			}
			return best
		}

		function findEntityNearScreenPoint(game, point) {
			const direct = findEntityAtScreenPoint(game, point)
			if (direct) return direct
			return findCubeNearScreenPoint(game, point)
		}

		function findEntityAtScreenPoint(game, point) {
			if (!game || !Array.isArray(point) || typeof game.xyToUV !== 'function') return null
			const ratio = game.pixelRatio || 1
			const uv = game.xyToUV([point[0] / ratio, point[1] / ratio])
			const cell = [Math.floor(uv[0]), Math.floor(uv[1])]
			return game.entityAtCoordinates?.(cell) || null
		}

		function findCubeNearScreenPoint(game, point) {
			if (!Array.isArray(game?.stuff)) return null
			const threshold = Math.max((game.unit || 1) * 1.25, (game.screenUnit || 1) * 0.7)
			let best = null
			let bestDistance = threshold * threshold
			for (const entity of game.stuff) {
				if (entity?.name !== 'cube' || !entity.position) continue
				const xy = game.uvToXYUntranslated(entity.position)
				const dx = xy[0] - point[0]
				const dy = xy[1] - point[1]
				const distance = dx * dx + dy * dy
				if (distance <= bestDistance) {
					best = entity
					bestDistance = distance
				}
			}
			return best
		}

		function isResourceSourcePanelActive(game) {
			return !!(game && (game.altActive || isResourceSourceToggleActive(game)))
		}

		function isResourceSourceLinkActive(game) {
			if (!game) return false
			if (isResourceSourceLineLockActive(game)) return Number.isInteger(getResourceSourceLineResourceId(game))
			return !!(
				game.shiftPressed &&
				(game.altActive || isResourceSourceToggleActive(game)) &&
				Number.isInteger(getResourceSourceFocusResourceId(game))
			)
		}

		function rememberResourceSourceResource(game, resourceId) {
			if (!game || !Number.isInteger(resourceId)) return
			if (game[resourceSourceLastResourceKey] === resourceId) return
			game[resourceSourceLastResourceKey] = resourceId
			saveStoredInteger(resourceSourceLastResourceStorageKey, resourceId)
		}
		function getResourceSourceSelectedResourceId(game) {
			if (!game) return null
			if (Number.isInteger(game.hoveredResource)) {
				rememberResourceSourceResource(game, game.hoveredResource)
				return game.hoveredResource
			}
			return Number.isInteger(game[resourceSourceLastResourceKey]) ? game[resourceSourceLastResourceKey] : null
		}

		function getResourceSourceFocusResourceId(game) {
			if (!game) return null
			if (Number.isInteger(game.hoveredResource)) {
				rememberResourceSourceResource(game, game.hoveredResource)
				return game.hoveredResource
			}
			if (isResourceSourceToggleActive(game) && Number.isInteger(game[resourceSourceLastResourceKey])) return game[resourceSourceLastResourceKey]
			return null
		}

		function isResourceSourceLineLockActive(game) {
			initializeResourceSourcePreferences(game)
			return !!game?.[resourceSourceLineLockKey]
		}

		function getResourceSourceLineResourceId(game) {
			if (!game) return null
			if (Number.isInteger(game[resourceSourceLineResourceKey])) return game[resourceSourceLineResourceKey]
			return getResourceSourceSelectedResourceId(game)
		}

		function toggleResourceSourceLineLock(game) {
			if (!game) return
			initializeResourceSourcePreferences(game)
			const selected = getResourceSourceSelectedResourceId(game)
			if (!Number.isInteger(selected)) return
			const sameResourceLocked = isResourceSourceLineLockActive(game) && game[resourceSourceLineResourceKey] === selected
			const active = !sameResourceLocked
			game[resourceSourceLineLockKey] = active
			game[resourceSourceLineResourceKey] = selected
			saveStoredBoolean(resourceSourceLineLockStorageKey, active)
			saveStoredInteger(resourceSourceLineResourceStorageKey, selected)
			saveStoredInteger(resourceSourceLastResourceStorageKey, selected)
		}

		function scheduleResourceSourceWarmup(game) {
			if (!game || game[resourceSourceWarmupKey]) return
			game[resourceSourceWarmupKey] = true
			scheduleResourceSourceIdle(() => {
				if (isResourceSourceGpuLineModeActive(game)) {
					const renderer = profileResourceSource('resource.warmup.webgl.renderer', () => getResourceSourceGpuRenderer(game), () => getResourceSourceProfileDetail(game, getResourceSourceFocusResourceId(game)))
					if (renderer) profileResourceSource('resource.warmup.webgl.clear', () => clearResourceSourceGpuLines(game), () => getResourceSourceProfileDetail(game, getResourceSourceFocusResourceId(game)))
				}
			}, 2000)
		}

		function scheduleResourceSourceIdle(callback, timeout = 1000) {
			if (typeof requestIdleCallback === 'function') {
				requestIdleCallback(callback, { timeout })
			} else {
				setTimeout(() => callback(null), 80)
			}
		}

		function hasResourceSourceIdleBudget(deadline, start) {
			if (deadline && typeof deadline.timeRemaining === 'function') return deadline.timeRemaining() > 3
			return performance.now() - start < 6
		}
		function renderResourceSourceLinks(game, ctx = game?.ctx, options = {}) {
			if (isResourceSourceOverlayInactive(game)) {
				clearResourceSourceGpuLines(game)
				return
			}
			if (!isResourceSourceLinkActive(game)) {
				clearResourceSourceGpuLines(game)
				return
			}
			const resourceId = isResourceSourceLineLockActive(game) ? getResourceSourceLineResourceId(game) : getResourceSourceFocusResourceId(game)
			if (!Number.isInteger(resourceId)) {
				clearResourceSourceGpuLines(game)
				return
			}

			const segments = profileResourceSource(
				'resource.links.collect',
				() => collectResourceSourceLinkSegmentsForResource(game, resourceId),
				() => getResourceSourceProfileDetail(game, resourceId)
			)
			const compositeGpuToCanvas = options.compositeGpuToCanvas === true && !!ctx
			if (isResourceSourceGpuLineModeActive(game)) {
				profileResourceSource(
					'resource.links.webgl.render',
					() => renderResourceSourceGpuLines(game, segments, compositeGpuToCanvas ? { compositeCtx: ctx } : null),
					() => getResourceSourceProfileDetail(game, resourceId, { segments: segments.length })
				)
				return
			}

			clearResourceSourceGpuLines(game)
			if (!ctx) return
			profileResourceSource(
				'resource.links.canvas.render',
				() => drawResourceSourceLinkSegments(game, segments, ctx),
				() => getResourceSourceProfileDetail(game, resourceId, { segments: segments.length })
			)
		}

		function collectResourceSourceLinkSegmentsForResource(game, resourceId) {
			const summary = getResourceSourceSummary(game, resourceId)
			const target = game.resourceHomes?.[resourceId]
			if ((!summary.gain.length && !summary.consume.length) || !Array.isArray(target)) return []

			const segments = []
			const budget = { remaining: resourceSourceMaxLinks }
			const gainColor = game.codex?.resources?.[resourceId]?.triplet?.[2] || game.codex?.resources?.[resourceId]?.triplet?.[0] || '#778'
			collectResourceSourceGroupLinkSegments(game, summary.gain, target, gainColor, budget, segments)
			collectResourceSourceGroupLinkSegments(game, summary.consume, target, resourceSourceConsumeColor, budget, segments)
			return segments
		}

		function collectResourceSourceGroupLinkSegments(game, groups, target, color, budget, segments) {
			for (const group of groups) {
				if (budget.remaining <= 0) return
				for (const source of group.sources) {
					if (budget.remaining <= 0) return
					const sourcePoint = getResourceSourceScreenPoint(game, source)
					if (!sourcePoint) continue
					segments.push({ source: sourcePoint, target, color })
					budget.remaining--
				}
			}
		}

		function drawResourceSourceLinkSegments(game, segments, ctx = game?.ctx) {
			if (!ctx) return
			for (const segment of segments) drawResourceSourceLink(game, segment.source, segment.target, segment.color, ctx)
		}

		function drawResourceSourceLink(game, source, target, color, ctx = game?.ctx) {
			if (!ctx) return
			const bend = Math.max(game.unit || 1, Math.abs(target[1] - source[1]) * 0.28)
			ctx.save()
			ctx.globalAlpha = 0.72
			ctx.strokeStyle = color
			ctx.lineWidth = Math.max(1, (game.unit || 1) * 0.025)
			ctx.lineCap = 'round'
			ctx.beginPath()
			ctx.moveTo(source[0], source[1])
			ctx.bezierCurveTo(source[0], source[1] - bend, target[0], target[1] + bend, target[0], target[1])
			ctx.stroke()
			ctx.fillStyle = color
			ctx.beginPath()
			ctx.arc(source[0], source[1], Math.max(2, (game.unit || 1) * 0.045), 0, Math.PI * 2)
			ctx.fill()
			ctx.restore()
		}

		function renderResourceSourceGpuLines(game, segments, options = null) {
			const compositeCtx = options?.compositeCtx || null
			const renderer = profileResourceSource('resource.links.webgl.renderer', () => getResourceSourceGpuRenderer(game), () => ({ segments: segments.length }))
			if (!renderer) {
				drawResourceSourceLinkSegments(game, segments, compositeCtx || game?.ctx)
				return
			}
			profileResourceSource('resource.links.webgl.sync', () => syncResourceSourceGpuCanvas(renderer, game, { visible: !compositeCtx }), () => ({ segments: segments.length }))
			if (!segments.length) {
				clearResourceSourceGpuRenderer(renderer)
				renderer.canvas.style.display = 'none'
				return
			}

			const signature = profileResourceSource('resource.links.webgl.signature', () => getResourceSourceGpuRenderSignature(game, renderer, segments), () => ({ segments: segments.length }))
			if (renderer._cattailResourceSourceGpuSignature === signature && renderer._cattailResourceSourceGpuHasContent) {
				if (compositeCtx) profileResourceSource('resource.links.webgl.composite', () => compositeResourceSourceGpuCanvas(renderer, compositeCtx), () => ({ segments: segments.length, cached: true }))
				return
			}

			const gl = renderer.gl
			gl.viewport(0, 0, renderer.canvas.width, renderer.canvas.height)
			gl.clearColor(0, 0, 0, 0)
			gl.clear(gl.COLOR_BUFFER_BIT)

			const lineData = profileResourceSource('resource.links.webgl.data', () => buildResourceSourceGpuLineData(game, segments), () => ({ segments: segments.length }))
			gl.bindBuffer(gl.ARRAY_BUFFER, renderer.lineBuffer)
			gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.DYNAMIC_DRAW)

			gl.enable(gl.BLEND)
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
			gl.useProgram(renderer.lineProgram)
			gl.uniform2f(renderer.lineUniforms.resolution, renderer.canvas.width, renderer.canvas.height)
			gl.uniform1f(renderer.lineUniforms.unit, game.unit || 1)
			bindResourceSourceGpuLineAttributes(gl, renderer.lineProgram, renderer.lineBuffer)
			gl.drawArraysInstanced(gl.TRIANGLES, 0, resourceSourceGpuCurveSegments * 6, segments.length)

			gl.useProgram(renderer.pointProgram)
			gl.uniform2f(renderer.pointUniforms.resolution, renderer.canvas.width, renderer.canvas.height)
			gl.uniform1f(renderer.pointUniforms.size, Math.max(4, (game.unit || 1) * 0.09))
			bindResourceSourceGpuPointAttributes(gl, renderer.pointProgram, renderer.lineBuffer)
			gl.drawArraysInstanced(gl.POINTS, 0, 1, segments.length)
			renderer._cattailResourceSourceGpuSignature = signature
			renderer._cattailResourceSourceGpuHasContent = true
			renderer._cattailResourceSourceGpuNeedsFlush = true
			renderer._cattailResourceSourceGpuCompositeBounds = getResourceSourceGpuCompositeBounds(game, renderer, segments)
			renderer._cattailResourceSourceGpuCompositeCacheReady = false
			if (compositeCtx) profileResourceSource('resource.links.webgl.composite', () => compositeResourceSourceGpuCanvas(renderer, compositeCtx), () => ({ segments: segments.length, cached: false }))
		}

		function getResourceSourceGpuRenderSignature(game, renderer, segments) {
			const parts = [renderer.canvas.width, renderer.canvas.height, roundResourceSourceGpuSignatureNumber(game?.unit || 1), segments.length]
			for (const segment of segments) {
				parts.push(
					roundResourceSourceGpuSignatureNumber(segment.source?.[0]),
					roundResourceSourceGpuSignatureNumber(segment.source?.[1]),
					roundResourceSourceGpuSignatureNumber(segment.target?.[0]),
					roundResourceSourceGpuSignatureNumber(segment.target?.[1]),
					String(segment.color || '')
				)
			}
			return parts.join('|')
		}

		function roundResourceSourceGpuSignatureNumber(value) {
			return Math.round((Number(value) || 0) * 100) / 100
		}
		function getResourceSourceGpuCompositeBounds(game, renderer, segments) {
			if (!renderer?.canvas || !Array.isArray(segments) || !segments.length) return null
			const unit = Number(game?.unit) || 1
			const pad = Math.ceil(Math.max(8, unit * 0.18))
			let minX = Infinity
			let minY = Infinity
			let maxX = -Infinity
			let maxY = -Infinity
			for (const segment of segments) {
				const source = segment?.source
				const target = segment?.target
				if (!Array.isArray(source) || !Array.isArray(target)) continue
				const sx = Number(source[0]) || 0
				const sy = Number(source[1]) || 0
				const tx = Number(target[0]) || 0
				const ty = Number(target[1]) || 0
				const bend = Math.max(unit, Math.abs(ty - sy) * 0.28)
				minX = Math.min(minX, sx, tx)
				maxX = Math.max(maxX, sx, tx)
				minY = Math.min(minY, sy, sy - bend, ty, ty + bend)
				maxY = Math.max(maxY, sy, sy - bend, ty, ty + bend)
			}
			if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null
			const canvasWidth = renderer.canvas.width || 0
			const canvasHeight = renderer.canvas.height || 0
			const x = Math.max(0, Math.floor(minX - pad))
			const y = Math.max(0, Math.floor(minY - pad))
			const right = Math.min(canvasWidth, Math.ceil(maxX + pad))
			const bottom = Math.min(canvasHeight, Math.ceil(maxY + pad))
			const width = Math.max(0, right - x)
			const height = Math.max(0, bottom - y)
			return width > 0 && height > 0 ? { x, y, width, height } : null
		}

		function buildResourceSourceGpuLineData(game, segments) {
			const lineWidth = Math.max(1, (game.unit || 1) * 0.025)
			const data = new Float32Array(segments.length * 9)
			for (let i = 0; i < segments.length; i++) {
				const segment = segments[i]
				const color = parseResourceSourceColor(segment.color, 0.72)
				const offset = i * 9
				data[offset] = segment.source[0]
				data[offset + 1] = segment.source[1]
				data[offset + 2] = segment.target[0]
				data[offset + 3] = segment.target[1]
				data[offset + 4] = color[0]
				data[offset + 5] = color[1]
				data[offset + 6] = color[2]
				data[offset + 7] = color[3]
				data[offset + 8] = lineWidth
			}
			return data
		}

		function getResourceSourceGpuRenderer(game) {
			if (!game) return null
			if (game[resourceSourceGpuRendererKey]?.gl) return game[resourceSourceGpuRendererKey]
			const canvas = document.createElement('canvas')
			canvas.className = 'cattail-resource-source-gpu-lines'
			const renderOrder = getResourceSourceGpuLineRenderOrder(game)
			canvas.dataset.modloaderRenderOrder = String(renderOrder)
			canvas.style.position = 'fixed'
			canvas.style.pointerEvents = 'none'
			canvas.style.zIndex = String(renderOrder)
			canvas.style.display = 'none'
			const gl = profileResourceSource('resource.links.webgl.context', () => canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: true }), () => getResourceSourceProfileDetail(game, getResourceSourceFocusResourceId(game)))
			if (!gl) {
				setResourceSourceGpuLineMode(game, false)
				return null
			}
			try {
				const lineProgram = profileResourceSource('resource.links.webgl.lineProgram', () => createResourceSourceGpuProgram(gl, getResourceSourceGpuLineVertexShader(), getResourceSourceGpuLineFragmentShader()), () => getResourceSourceProfileDetail(game, getResourceSourceFocusResourceId(game)))
				const pointProgram = profileResourceSource('resource.links.webgl.pointProgram', () => createResourceSourceGpuProgram(gl, getResourceSourceGpuPointVertexShader(), getResourceSourceGpuPointFragmentShader()), () => getResourceSourceProfileDetail(game, getResourceSourceFocusResourceId(game)))
				const renderer = {
					canvas,
					gl,
					lineBuffer: gl.createBuffer(),
					lineProgram,
					pointProgram,
					lineUniforms: {},
					pointUniforms: {}
				}
				renderer.lineUniforms.resolution = gl.getUniformLocation(renderer.lineProgram, 'u_resolution')
				renderer.lineUniforms.unit = gl.getUniformLocation(renderer.lineProgram, 'u_unit')
				renderer.pointUniforms.resolution = gl.getUniformLocation(renderer.pointProgram, 'u_resolution')
				renderer.pointUniforms.size = gl.getUniformLocation(renderer.pointProgram, 'u_size')
				game.canvas?.insertAdjacentElement?.('afterend', canvas)
				game[resourceSourceGpuRendererKey] = renderer
				return renderer
			} catch (error) {
				canvas.remove()
				setResourceSourceGpuLineMode(game, false)
				return null
			}
		}

		function syncResourceSourceGpuCanvas(renderer, game, options = {}) {
			const visible = options.visible !== false
			const canvas = renderer.canvas
			let layoutDirty = options.forceLayout === true
			const width = Math.max(0, Number(game?.w) || 0)
			const height = Math.max(0, Number(game?.h) || 0)
			if (canvas.width !== width) {
				canvas.width = width
				layoutDirty = true
			}
			if (canvas.height !== height) {
				canvas.height = height
				layoutDirty = true
			}
			const renderOrder = getResourceSourceGpuLineRenderOrder(game)
			if (renderer._cattailResourceSourceGpuRenderOrder !== renderOrder) {
				canvas.dataset.modloaderRenderOrder = String(renderOrder)
				canvas.style.zIndex = String(renderOrder)
				renderer._cattailResourceSourceGpuRenderOrder = renderOrder
				layoutDirty = true
			}
			const display = visible ? 'block' : 'none'
			if (canvas.style.display !== display) {
				canvas.style.display = display
				layoutDirty = true
			}
			if (!visible) return

			const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0
			const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0
			if (renderer._cattailResourceSourceGpuViewportWidth !== viewportWidth || renderer._cattailResourceSourceGpuViewportHeight !== viewportHeight) {
				renderer._cattailResourceSourceGpuViewportWidth = viewportWidth
				renderer._cattailResourceSourceGpuViewportHeight = viewportHeight
				layoutDirty = true
			}
			const now = performance.now()
			if (!layoutDirty && renderer._cattailResourceSourceGpuNextLayoutSyncAt > now) return
			const rect = game.canvas.getBoundingClientRect()
			setResourceSourceGpuCanvasStyleIfChanged(canvas, 'left', rect.left + 'px')
			setResourceSourceGpuCanvasStyleIfChanged(canvas, 'top', rect.top + 'px')
			setResourceSourceGpuCanvasStyleIfChanged(canvas, 'width', rect.width + 'px')
			setResourceSourceGpuCanvasStyleIfChanged(canvas, 'height', rect.height + 'px')
			renderer._cattailResourceSourceGpuNextLayoutSyncAt = now + resourceSourceGpuCanvasLayoutSyncIntervalMs
		}

		function setResourceSourceGpuCanvasStyleIfChanged(canvas, name, value) {
			if (canvas.style[name] !== value) canvas.style[name] = value
		}

		function compositeResourceSourceGpuCanvas(renderer, ctx) {
			if (!renderer?.canvas || !ctx) return
			const cached = !renderer._cattailResourceSourceGpuNeedsFlush
			if (renderer._cattailResourceSourceGpuNeedsFlush && renderer.gl?.flush) {
				profileResourceSource('resource.links.webgl.flush', () => renderer.gl.flush(), () => ({ cached: false }))
			}
			renderer._cattailResourceSourceGpuNeedsFlush = false
			const cache = profileResourceSource('resource.links.webgl.composite.cache', () => getResourceSourceGpuCompositeCache(renderer), () => ({ cached }))
			profileResourceSource('resource.links.webgl.composite.drawImage', () => {
				ctx.save()
				ctx.globalAlpha = 1
				if (cache?.canvas && cache.bounds) {
					ctx.drawImage(cache.canvas, cache.bounds.x, cache.bounds.y)
				} else {
					ctx.drawImage(renderer.canvas, 0, 0)
				}
				ctx.restore()
			}, () => ({ cached, cropped: !!cache?.canvas }))
			renderer.canvas.style.display = 'none'
		}

		function getResourceSourceGpuCompositeCache(renderer) {
			const bounds = renderer?._cattailResourceSourceGpuCompositeBounds
			if (!renderer?.canvas || !bounds || bounds.width <= 0 || bounds.height <= 0) return null
			if (renderer._cattailResourceSourceGpuCompositeCacheReady && renderer._cattailResourceSourceGpuCompositeCanvas) {
				return { canvas: renderer._cattailResourceSourceGpuCompositeCanvas, bounds }
			}
			const canvas = renderer._cattailResourceSourceGpuCompositeCanvas || document.createElement('canvas')
			if (canvas.width !== bounds.width) canvas.width = bounds.width
			if (canvas.height !== bounds.height) canvas.height = bounds.height
			const ctx = canvas.getContext('2d')
			if (!ctx) return null
			ctx.clearRect(0, 0, bounds.width, bounds.height)
			ctx.drawImage(renderer.canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height)
			renderer._cattailResourceSourceGpuCompositeCanvas = canvas
			renderer._cattailResourceSourceGpuCompositeCacheReady = true
			return { canvas, bounds }
		}

		function getResourceSourceGpuLineRenderOrder(game) {
			return game?.canvas?.parentNode?.id === 'modloader-render-stack' ? resourceSourceGpuLineStackOrder : resourceSourceGpuLineDefaultOrder
		}

		function clearResourceSourceGpuLines(game) {
			const renderer = game?.[resourceSourceGpuRendererKey]
			if (!renderer?.gl) return
			if (renderer._cattailResourceSourceGpuHasContent || renderer.canvas.style.display !== 'none') clearResourceSourceGpuRenderer(renderer)
			renderer.canvas.style.display = 'none'
		}

		function clearResourceSourceGpuRenderer(renderer) {
			if (!renderer?.gl) return
			renderer.gl.viewport(0, 0, renderer.canvas.width, renderer.canvas.height)
			renderer.gl.clearColor(0, 0, 0, 0)
			renderer.gl.clear(renderer.gl.COLOR_BUFFER_BIT)
			renderer._cattailResourceSourceGpuSignature = ''
			renderer._cattailResourceSourceGpuHasContent = false
			renderer._cattailResourceSourceGpuNeedsFlush = false
			renderer._cattailResourceSourceGpuCompositeBounds = null
			renderer._cattailResourceSourceGpuCompositeCacheReady = false
		}

		function isResourceSourceEndingActive(game) {
			return !!(game && (game.splash?.isShown || game.credits || game.pinhole || game.entitiesInGame?.pinhole > 0))
		}

		function isResourceSourceOverlayInactive(game) {
			return !!(isResourceSourceEndingActive(game) || game?.plane)
		}

		function bindResourceSourceGpuLineAttributes(gl, program, buffer) {
			const stride = 9 * 4
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
			bindResourceSourceGpuAttribute(gl, program, 'a_source', 2, stride, 0)
			bindResourceSourceGpuAttribute(gl, program, 'a_target', 2, stride, 2 * 4)
			bindResourceSourceGpuAttribute(gl, program, 'a_color', 4, stride, 4 * 4)
			bindResourceSourceGpuAttribute(gl, program, 'a_width', 1, stride, 8 * 4)
		}

		function bindResourceSourceGpuPointAttributes(gl, program, buffer) {
			const stride = 9 * 4
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
			bindResourceSourceGpuAttribute(gl, program, 'a_source', 2, stride, 0)
			bindResourceSourceGpuAttribute(gl, program, 'a_color', 4, stride, 4 * 4)
		}

		function bindResourceSourceGpuAttribute(gl, program, name, size, stride, offset) {
			const location = gl.getAttribLocation(program, name)
			if (location < 0) return
			gl.enableVertexAttribArray(location)
			gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset)
			gl.vertexAttribDivisor(location, 1)
		}

		function createResourceSourceGpuProgram(gl, vertexSource, fragmentSource) {
			const vertex = createResourceSourceGpuShader(gl, gl.VERTEX_SHADER, vertexSource)
			const fragment = createResourceSourceGpuShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
			const program = gl.createProgram()
			gl.attachShader(program, vertex)
			gl.attachShader(program, fragment)
			gl.linkProgram(program)
			if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Resource source WebGL link failed')
			return program
		}

		function createResourceSourceGpuShader(gl, type, source) {
			const shader = gl.createShader(type)
			gl.shaderSource(shader, source)
			gl.compileShader(shader)
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Resource source WebGL compile failed')
			return shader
		}

		function getResourceSourceGpuLineVertexShader() {
			return `#version 300 es
			in vec2 a_source;
			in vec2 a_target;
			in vec4 a_color;
			in float a_width;
			uniform vec2 u_resolution;
			uniform float u_unit;
			out vec4 v_color;
			const int SEGMENTS = ${resourceSourceGpuCurveSegments};
			vec2 cubicPoint(float t) {
				float bend = max(u_unit, abs(a_target.y - a_source.y) * 0.28);
				vec2 p0 = a_source;
				vec2 p1 = a_source + vec2(0.0, -bend);
				vec2 p2 = a_target + vec2(0.0, bend);
				vec2 p3 = a_target;
				float nt = 1.0 - t;
				return nt * nt * nt * p0 + 3.0 * nt * nt * t * p1 + 3.0 * nt * t * t * p2 + t * t * t * p3;
			}
			vec2 cubicDerivative(float t) {
				float bend = max(u_unit, abs(a_target.y - a_source.y) * 0.28);
				vec2 p0 = a_source;
				vec2 p1 = a_source + vec2(0.0, -bend);
				vec2 p2 = a_target + vec2(0.0, bend);
				vec2 p3 = a_target;
				float nt = 1.0 - t;
				return 3.0 * nt * nt * (p1 - p0) + 6.0 * nt * t * (p2 - p1) + 3.0 * t * t * (p3 - p2);
			}
			void main() {
				int localVertex = gl_VertexID % 6;
				int segmentId = gl_VertexID / 6;
				float t0 = float(segmentId) / float(SEGMENTS);
				float t1 = float(segmentId + 1) / float(SEGMENTS);
				float t = (localVertex == 0 || localVertex == 1 || localVertex == 4) ? t0 : t1;
				float side = (localVertex == 0 || localVertex == 2 || localVertex == 3) ? -1.0 : 1.0;
				vec2 tangent = normalize(cubicDerivative(t));
				vec2 normal = vec2(-tangent.y, tangent.x);
				vec2 point = cubicPoint(t) + normal * side * a_width * 0.5;
				vec2 clip = point / u_resolution * 2.0 - 1.0;
				gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
				v_color = a_color;
			}`
		}

		function getResourceSourceGpuLineFragmentShader() {
			return `#version 300 es
			precision mediump float;
			in vec4 v_color;
			out vec4 outColor;
			void main() {
				outColor = v_color;
			}`
		}

		function getResourceSourceGpuPointVertexShader() {
			return `#version 300 es
			in vec2 a_source;
			in vec4 a_color;
			uniform vec2 u_resolution;
			uniform float u_size;
			out vec4 v_color;
			void main() {
				vec2 clip = a_source / u_resolution * 2.0 - 1.0;
				gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
				gl_PointSize = u_size;
				v_color = a_color;
			}`
		}

		function getResourceSourceGpuPointFragmentShader() {
			return `#version 300 es
			precision mediump float;
			in vec4 v_color;
			out vec4 outColor;
			void main() {
				vec2 delta = gl_PointCoord - vec2(0.5);
				float distance = length(delta);
				if (distance > 0.5) discard;
				outColor = v_color;
			}`
		}

		function parseResourceSourceColor(color, alpha = 1) {
			const textValue = String(color || '').trim()
			const hex = textValue[0] === '#' ? textValue.slice(1) : textValue
			if (hex.length === 3 || hex.length === 4) {
				const r = parseInt(hex[0] + hex[0], 16)
				const g = parseInt(hex[1] + hex[1], 16)
				const b = parseInt(hex[2] + hex[2], 16)
				const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : alpha
				return [r / 255, g / 255, b / 255, a]
			}
			if (hex.length === 6 || hex.length === 8) {
				const r = parseInt(hex.slice(0, 2), 16)
				const g = parseInt(hex.slice(2, 4), 16)
				const b = parseInt(hex.slice(4, 6), 16)
				const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : alpha
				return [r / 255, g / 255, b / 255, a]
			}
			return [0.47, 0.47, 0.53, alpha]
		}

		function getResourceSourceLineChartState(game) {
			if (!game) return null
			if (!game[resourceSourceLineChartStateKey]) {
				Object.defineProperty(game, resourceSourceLineChartStateKey, {
					configurable: true,
					value: { buckets: [] }
				})
			}
			const state = game[resourceSourceLineChartStateKey]
			if (!Array.isArray(state.buckets)) state.buckets = []
			return state
		}

		function recordResourceSourceLineChartSample(game, elapsedMs) {
			if (!isResourceSourceLineChartEnabled()) return
			const state = getResourceSourceLineChartState(game)
			if (!state) return
			const duration = getResourceSourceLineChartSampleDuration(elapsedMs)
			if (duration <= 0) return
			state.buckets.push(createResourceSourceLineChartBucket(game, duration))
			compressResourceSourceLineChartSubsecondBuckets(state.buckets)
			compressResourceSourceLineChartBuckets(state.buckets)
			trimResourceSourceLineChartBuckets(state.buckets)
		}

		function getResourceSourceLineChartSampleDuration(elapsedMs) {
			const ms = Number(elapsedMs)
			if (!Number.isFinite(ms) || ms <= 0) return 0
			return Math.max(0.001, Math.min(1, ms / 1000))
		}

		function createResourceSourceLineChartBucket(game, duration) {
			const analytics = game?.analytics
			const count = resourceCountSize(game, Math.max(analytics?.instant?.length || 0, game?.resources?.length || 0))
			const values = new Array(count).fill(0)
			for (let i = 0; i < count; i++) values[i] = Math.max(0, Number(game?.resources?.[i]) || 0)
			return { duration, values }
		}

		function compressResourceSourceLineChartSubsecondBuckets(buckets) {
			let changed = true
			while (changed) {
				changed = false
				let start = -1
				let total = 0
				for (let i = 0; i < buckets.length; i++) {
					const duration = Number(buckets[i]?.duration) || 0
					if (duration > 0 && duration < 1) {
						if (start < 0) start = i
						total += duration
						if (total >= 1) {
							const group = buckets.slice(start, i + 1)
							const replacement = [mergeResourceSourceLineChartBuckets(group, 1)]
							const overflow = total - 1
							if (overflow > 0.001) replacement.push(cloneResourceSourceLineChartBucket(group[group.length - 1], overflow))
							buckets.splice(start, group.length, ...replacement)
							changed = true
							break
						}
					} else {
						start = -1
						total = 0
					}
				}
			}
		}

		function cloneResourceSourceLineChartBucket(bucket, duration) {
			return { duration, values: Array.isArray(bucket?.values) ? bucket.values.slice() : [] }
		}

		function compressResourceSourceLineChartBuckets(buckets) {
			let changed = true
			while (changed) {
				changed = false
				for (const stage of resourceSourceLineChartStages) {
					const index = findResourceSourceLineChartCompressIndex(buckets, stage.from, stage.count)
					if (index < 0) continue
					const merged = mergeResourceSourceLineChartStageBuckets(buckets.slice(index, index + stage.count), stage.from, stage.to)
					buckets.splice(index, stage.count, ...merged)
					changed = true
					break
				}
			}
		}

		function findResourceSourceLineChartCompressIndex(buckets, duration, count) {
			for (let i = 0; i <= buckets.length - count; i++) {
				let matches = true
				for (let j = 0; j < count; j++) {
					if (buckets[i + j]?.duration !== duration) {
						matches = false
						break
					}
				}
				if (matches) return i
			}
			return -1
		}

		function mergeResourceSourceLineChartStageBuckets(group, fromDuration, toDuration) {
			const chunkSize = Math.max(1, Math.round(toDuration / fromDuration))
			const merged = []
			for (let i = 0; i < group.length; i += chunkSize) {
				const chunk = group.slice(i, i + chunkSize)
				const duration = chunk.length === chunkSize ? toDuration : chunk.reduce((total, bucket) => total + (Number(bucket?.duration) || 0), 0)
				merged.push(mergeResourceSourceLineChartBuckets(chunk, duration))
			}
			return merged
		}

		function mergeResourceSourceLineChartBuckets(group, duration) {
			const last = group[group.length - 1] || {}
			const count = Math.max(...group.map((bucket) => bucket?.values?.length || 0), 10)
			const values = new Array(count).fill(0)
			for (let i = 0; i < count; i++) values[i] = Math.max(0, Number(last.values?.[i]) || 0)
			return { duration, values }
		}

		function trimResourceSourceLineChartBuckets(buckets) {
			while (countResourceSourceLineChartWholeBuckets(buckets) > resourceSourceLineChartMaxBuckets) {
				const index = buckets.findIndex((bucket) => (Number(bucket?.duration) || 0) >= 1)
				if (index < 0) break
				buckets.splice(index, 1)
			}
		}

		function countResourceSourceLineChartWholeBuckets(buckets) {
			let count = 0
			for (const bucket of buckets) if ((Number(bucket?.duration) || 0) >= 1) count++
			return count
		}

		function renderResourceSourceLineChart(game) {
			if (!isResourceSourceLineChartEnabled() || !isResourceSourceLineChartModeActive()) return
			if (!game?.entitiesInGame?.mega1b) return
			const resourceId = Number.isInteger(game.hoveredResource) ? game.hoveredResource : null
			if (!Number.isInteger(resourceId)) return
			const graph = game.analytics?.graphs?.[resourceId]
			if (!graph?.canvas) return
			const state = getResourceSourceLineChartState(game)
			const buckets = state?.buckets || []
			if (!buckets.length) return
			const home = game.resourceHomes?.[resourceId]
			if (!Array.isArray(home)) return
			const firstHome = game.resourceHomes?.[0] || home
			const width = graph.canvas.width
			const height = graph.canvas.height
			const x = Math.max(firstHome[0] / 2, home[0] - width / 2)
			const y = firstHome[1] * 2
			drawResourceSourceLineChart(game, resourceId, buckets, x, y, width, height)
		}

		function drawResourceSourceLineChart(game, resourceId, buckets, x, y, width, height) {
			const ctx = game.ctx
			const pixelRatio = game.pixelRatio || 1
			const padding = pixelRatio * 16
			const halfHeight = height / 2
			const fontSize = Math.max(7 * pixelRatio, halfHeight * 0.12)
			const plotLeft = x + Math.max(pixelRatio * 5, padding * 0.35)
			const plotRight = x + width - padding * 3.1
			const plotTop = y + Math.max(pixelRatio * 5, padding * 0.28)
			const plotBottom = y + height - padding * 1.35
			const plotWidth = Math.max(pixelRatio, plotRight - plotLeft)
			const plotHeight = Math.max(pixelRatio, plotBottom - plotTop)
			const totalDuration = Math.max(0.001, buckets.reduce((total, bucket) => total + (Number(bucket.duration) || 0), 0))
			const scale = getResourceSourceLineChartScale(game, buckets, resourceId)

			ctx.save()
			ctx.fillStyle = '#FFFFFFF6'
			if (ctx.roundRect) {
				ctx.beginPath()
				ctx.roundRect(x, y, width, height, pixelRatio * 4)
				ctx.closePath()
				ctx.fill()
			} else {
				ctx.fillRect(x, y, width, height)
			}

			ctx.font = fontSize + 'px Montserrat, sans-serif'
			drawResourceSourceLineChartGrid(game, ctx, plotLeft, plotRight, plotTop, plotBottom, plotWidth, plotHeight, scale, totalDuration, pixelRatio)
			drawResourceSourceLineChartPath(ctx, buckets, resourceId, scale, totalDuration, plotLeft, plotRight, plotBottom, plotWidth, plotHeight, pixelRatio)
			ctx.restore()
		}

		function drawResourceSourceLineChartGrid(game, ctx, plotLeft, plotRight, plotTop, plotBottom, plotWidth, plotHeight, scale, totalDuration, pixelRatio) {
			ctx.fillStyle = '#000'
			ctx.globalAlpha = 0.16
			ctx.fillRect(plotLeft, plotBottom, plotWidth, pixelRatio)
			ctx.fillRect(plotRight, plotTop, pixelRatio, plotHeight)

			const firstOffset = Math.ceil((scale.min - scale.baseline) / scale.delta) * scale.delta
			const lastOffset = Math.floor((scale.max - scale.baseline) / scale.delta) * scale.delta
			const tickCount = Math.max(0, Math.floor((lastOffset - firstOffset) / scale.delta) + 1)
			const skip = Math.max(1, Math.ceil(tickCount / 7))
			let tickIndex = 0
			for (let offset = firstOffset; offset <= lastOffset; offset += scale.delta) {
				const shouldDraw = Math.abs(offset) < 0.5 || tickIndex % skip === 0
				tickIndex++
				if (!shouldDraw) continue
				const value = scale.baseline + offset
				const py = plotBottom - Math.max(0, Math.min(1, (value - scale.min) / scale.span)) * plotHeight
				ctx.globalAlpha = Math.abs(offset) < 0.5 ? 0.16 : 0.1
				ctx.fillRect(plotLeft, py, plotWidth, pixelRatio)
				ctx.globalAlpha = 1
				ctx.textAlign = 'left'
				ctx.textBaseline = 'middle'
				ctx.fillText(formatResourceSourceLineChartDelta(game, offset, scale.labelUnit, scale.baseline), plotRight + pixelRatio * 4, py)
			}

			for (const age of getResourceSourceLineChartTimeTicks(totalDuration)) {
				const px = getResourceSourceLineChartTimeXFromAge(age, totalDuration, plotLeft, plotWidth)
				ctx.globalAlpha = age > 0 && age < totalDuration ? 0.1 : 0.16
				ctx.fillRect(px, plotTop, pixelRatio, plotHeight)
				ctx.globalAlpha = 1
				ctx.textAlign = 'center'
				ctx.textBaseline = 'top'
				ctx.fillText(formatResourceSourceLineChartDuration(age), px, plotBottom + pixelRatio * 3)
			}
			ctx.globalAlpha = 1
		}

		function drawResourceSourceLineChartPath(ctx, buckets, resourceId, scale, totalDuration, plotLeft, plotRight, plotBottom, plotWidth, plotHeight, pixelRatio) {
			if (!buckets.length || !scale || scale.span <= 0) return
			const points = []
			let elapsed = 0
			for (const bucket of buckets) {
				const duration = Math.max(0.001, Number(bucket.duration) || 1)
				const value = Math.max(0, Number(bucket?.values?.[resourceId]) || 0)
				const px = getResourceSourceLineChartTimeXFromElapsed(elapsed + duration / 2, totalDuration, plotLeft, plotWidth)
				const py = plotBottom - Math.max(0, Math.min(1, (value - scale.min) / scale.span)) * plotHeight
				points.push({ x: px, y: py, value })
				elapsed += duration
			}
			if (points.length < 2) return
			ctx.save()
			ctx.lineWidth = Math.max(pixelRatio, pixelRatio * 1.35)
			ctx.lineJoin = 'round'
			ctx.lineCap = 'round'
			for (let i = 1; i < points.length; i++) {
				const previous = points[i - 1]
				const current = points[i]
				ctx.strokeStyle = current.value >= previous.value ? resourceSourceChartGainColor : resourceSourceChartConsumeColor
				ctx.beginPath()
				ctx.moveTo(previous.x, previous.y)
				ctx.lineTo(current.x, current.y)
				ctx.stroke()
			}
			ctx.restore()
		}

		function getResourceSourceLineChartTimeTicks(totalDuration) {
			return [totalDuration, totalDuration * 2 / 3, totalDuration / 3, totalDuration / 6, 0]
		}

		function getResourceSourceLineChartTimeXFromAge(age, totalDuration, plotLeft, plotWidth) {
			return getResourceSourceLineChartTimeXFromElapsed(totalDuration - age, totalDuration, plotLeft, plotWidth)
		}

		function getResourceSourceLineChartTimeXFromElapsed(elapsed, totalDuration, plotLeft, plotWidth) {
			const ratio = getResourceSourceLineChartTimeRatio(elapsed, totalDuration)
			return plotLeft + ratio * plotWidth
		}

		function getResourceSourceLineChartTimeRatio(elapsed, totalDuration) {
			const total = Math.max(0.001, Number(totalDuration) || 0)
			const normalized = Math.max(0, Math.min(1, (Number(elapsed) || 0) / total))
			if (normalized <= 2 / 3) return normalized / 2
			return 2 * normalized - 1
		}

		function getResourceSourceLineChartScale(game, buckets, resourceId) {
			const latest = getResourceSourceLineChartLatestValue(game, buckets, resourceId)
			const recentRange = getResourceSourceLineChartRecentRange(buckets, resourceId, latest)
			const speedSpan = getResourceSourceLineChartRateMagnitude(game, buckets, resourceId)
			const lowerDeviation = Math.max(0, latest - recentRange.min)
			const upperDeviation = Math.max(0, recentRange.max - latest)
			const visibleHalfSpan = Math.max(lowerDeviation, upperDeviation, speedSpan * 5, 0.5)
			const rounded = getResourceSourceLineChartRoundedSpan(Math.max(1, visibleHalfSpan * 2))
			const labelUnit = getResourceSourceLineChartLabelUnit(speedSpan || rounded.delta)
			const halfSpan = rounded.max / 2
			let minValue = latest - halfSpan
			let maxValue = latest + halfSpan
			if (minValue < 0) {
				maxValue -= minValue
				minValue = 0
			}
			const span = Math.max(1, maxValue - minValue)
			return { min: minValue, max: maxValue, span, delta: rounded.delta, baseline: latest, labelUnit }
		}

		function getResourceSourceLineChartLatestValue(game, buckets, resourceId) {
			for (let i = buckets.length - 1; i >= 0; i--) {
				const value = Number(buckets[i]?.values?.[resourceId])
				if (Number.isFinite(value)) return Math.max(0, value)
			}
			return Math.max(0, Number(game?.resources?.[resourceId]) || 0)
		}

		function getResourceSourceLineChartRecentRange(buckets, resourceId, fallbackValue) {
			const recentWindowSeconds = 30
			const fallback = Math.max(0, Number(fallbackValue) || 0)
			let min = Infinity
			let max = -Infinity
			let elapsed = 0
			let sampled = false
			for (let i = buckets.length - 1; i >= 0; i--) {
				const bucket = buckets[i]
				const duration = Math.max(0.001, Number(bucket?.duration) || 1)
				if (duration > 1 && sampled) break
				if (duration > 1 && !sampled) continue
				const value = Number(bucket?.values?.[resourceId])
				if (Number.isFinite(value)) {
					const amount = Math.max(0, value)
					min = Math.min(min, amount)
					max = Math.max(max, amount)
					sampled = true
				}
				elapsed += duration
				if (elapsed >= recentWindowSeconds && sampled) break
			}
			if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: fallback, max: fallback }
			return { min, max }
		}

		function getResourceSourceLineChartRoundedSpan(span) {
			const safe = Math.max(1, Number(span) || 0)
			const order = Math.max(1, String(Math.floor(safe)).length)
			const delta = 10 ** (order - 1)
			return { max: delta * (Math.floor(safe / delta) + 1), delta }
		}

		function getResourceSourceLineChartRateMagnitude(game, buckets, resourceId) {
			const average = game?.analytics?.average?.[resourceId]
			let speed = 0
			if (Array.isArray(average)) {
				speed = Math.max(speed, Math.abs(Number(average[0]) || 0), Math.abs(Number(average[1]) || 0))
				if (speed > 0) return speed
			}
			let previous = null
			for (const bucket of buckets) {
				const duration = Math.max(0.001, Number(bucket?.duration) || 1)
				const value = Math.max(0, Number(bucket?.values?.[resourceId]) || 0)
				if (previous && duration <= 1 && previous.duration <= 1) {
					const seconds = Math.max(0.001, duration)
					speed = Math.max(speed, Math.abs(value - previous.value) / seconds)
				}
				previous = { value, duration }
			}
			return speed
		}

		function getResourceSourceLineChartLabelUnit(value) {
			const amount = Math.abs(Number(value) || 0)
			if (amount >= 1e15) return { value: 1e15, suffix: 'q' }
			if (amount >= 1e12) return { value: 1e12, suffix: 't' }
			if (amount >= 1e9) return { value: 1e9, suffix: 'b' }
			if (amount >= 1e6) return { value: 1e6, suffix: 'm' }
			if (amount >= 1e3) return { value: 1e3, suffix: 'k' }
			return { value: 1, suffix: '' }
		}

		function formatResourceSourceLineChartAmount(game, value, unit) {
			if (unit && unit.value > 1) return formatResourceSourceLineChartAmountInUnit(value, unit)
			if (game && typeof game.makeReadable === 'function') return game.makeReadable(value)
			if (Math.abs(value) >= 1000000) return Math.round(value / 1000000) + 'm'
			if (Math.abs(value) >= 1000) return Math.round(value / 1000) + 'k'
			return String(Math.round(value))
		}

		function formatResourceSourceLineChartAmountInUnit(value, unit) {
			const scaled = Math.abs(Number(value) || 0) / unit.value
			const rounded = scaled >= 100 ? Math.round(scaled) : scaled >= 10 ? Math.round(scaled * 10) / 10 : Math.round(scaled * 100) / 100
			return String(rounded).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1') + unit.suffix
		}

		function formatResourceSourceLineChartDelta(game, value, unit, baseline) {
			if (Math.abs(value) < 0.5) return formatResourceSourceLineChartAmount(game, Math.max(0, Number(baseline) || 0))
			const sign = value > 0 ? '+' : '-'
			return sign + formatResourceSourceLineChartAmount(game, Math.abs(value), unit)
		}

		function formatResourceSourceLineChartDuration(seconds) {
			const value = Math.max(0, Number(seconds) || 0)
			if (value <= 0) return '0ms'
			if (value < 1) return Math.max(1, Math.round(value * 1000)) + 'ms'
			if (value < 60) return Math.round(value) + 's'
			if (value < 3600) return Math.round(value / 60) + 'm'
			const hours = value / 3600
			return (hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10) + 'h'
		}

		function renderResourceSourcePanels(game) {
			if (!isResourceSourcePanelActive(game)) return
			const resourceId = getResourceSourceFocusResourceId(game)
			if (!Number.isInteger(resourceId)) return
			profileResourceSource(
				'resource.panel.total',
				() => renderResourceSourcePanel(game, resourceId),
				() => getResourceSourceProfileDetail(game, resourceId)
			)
		}

		function renderResourceSourcePanel(game, resourceId) {
			const summary = getResourceSourceSummary(game, resourceId)
			const gainRows = summary.gain.map((group) => ({ type: 'gain', group }))
			const consumeRows = summary.consume.map((group) => ({ type: 'consume', group }))
			if (!gainRows.length && !consumeRows.length) return

			const ctx = game.ctx
			const pixelRatio = game.pixelRatio || 1
			const unit = game.screenUnit || game.unit || 1
			const fontSize = Math.max(10 * pixelRatio, unit * 0.15)
			const countFontSize = Math.max(9 * pixelRatio, fontSize * 0.86)
			const rowHeight = Math.max(16 * pixelRatio, unit * 0.28)
			const iconSize = Math.max(12 * pixelRatio, unit * 0.2)
			const padX = Math.max(5 * pixelRatio, unit * 0.08)
			const padY = Math.max(4 * pixelRatio, unit * 0.06)
			const gap = Math.max(4 * pixelRatio, unit * 0.055)
			const columnGap = Math.max(12 * pixelRatio, unit * 0.18)

			ctx.save()
			const gainWidth = profileResourceSource('resource.panel.measure.gain', () => measureResourceSourceRows(ctx, game, gainRows, iconSize, gap, fontSize, countFontSize), () => getResourceSourceProfileDetail(game, resourceId, { rows: gainRows.length }))
			const consumeWidth = profileResourceSource('resource.panel.measure.consume', () => measureResourceSourceRows(ctx, game, consumeRows, iconSize, gap, fontSize, countFontSize), () => getResourceSourceProfileDetail(game, resourceId, { rows: consumeRows.length }))
			const hasBothColumns = gainRows.length && consumeRows.length
			const contentWidth = hasBothColumns ? gainWidth + columnGap + consumeWidth : Math.max(gainWidth, consumeWidth)
			const rowCount = Math.max(gainRows.length, consumeRows.length)
			const width = contentWidth + padX * 2
			const height = padY * 2 + rowCount * rowHeight
			const home = game.resourceHomes?.[resourceId]
			if (!Array.isArray(home)) {
				ctx.restore()
				return
			}

			const x = clampNumber(home[0] - width / 2, 4 * pixelRatio, game.w - width - 4 * pixelRatio)
			const y = getResourceSourcePanelY(game, resourceId, height)
			drawResourceSourcePanelBack(ctx, x, y, width, height, pixelRatio)

			if (hasBothColumns) {
				const gainX = x + padX
				const consumeX = gainX + gainWidth + columnGap
				drawResourceSourceRows(game, gainRows, resourceId, gainX, y + padY, rowHeight, iconSize, gap, fontSize, countFontSize)
				drawResourceSourceRows(game, consumeRows, resourceId, consumeX, y + padY, rowHeight, iconSize, gap, fontSize, countFontSize)
				drawResourceSourceColumnDivider(ctx, gainX + gainWidth + columnGap / 2, y + padY, height - padY * 2, pixelRatio)
			} else {
				const rows = gainRows.length ? gainRows : consumeRows
				const columnWidth = gainRows.length ? gainWidth : consumeWidth
				const columnX = x + padX + Math.max(0, contentWidth - columnWidth) / 2
				drawResourceSourceRows(game, rows, resourceId, columnX, y + padY, rowHeight, iconSize, gap, fontSize, countFontSize)
			}
			ctx.restore()
		}

		function measureResourceSourceRows(ctx, game, rows, iconSize, gap, fontSize, countFontSize) {
			let width = 0
			for (const row of rows) {
				ctx.font = '500 ' + countFontSize + 'px Montserrat, Arial, sans-serif'
				const countWidth = ctx.measureText(String(row.group.count)).width
				ctx.font = '500 ' + fontSize + 'px Montserrat, Arial, sans-serif'
				const rateWidth = ctx.measureText(formatResourceSourceRate(game, row)).width
				width = Math.max(width, iconSize + gap + countWidth + gap + rateWidth)
			}
			return width
		}

		function drawResourceSourceRows(game, rows, resourceId, x, y, rowHeight, iconSize, gap, fontSize, countFontSize) {
			for (let i = 0; i < rows.length; i++) {
				drawResourceSourceRow(game, rows[i], resourceId, x, y + i * rowHeight + rowHeight / 2, iconSize, gap, fontSize, countFontSize)
			}
		}

		function drawResourceSourceRow(game, row, resourceId, x, centerY, iconSize, gap, fontSize, countFontSize) {
			const ctx = game.ctx
			drawResourceSourceIcon(game, row.group.source, x + iconSize / 2, centerY, iconSize)
			ctx.textBaseline = 'middle'
			ctx.textAlign = 'left'
			ctx.font = '500 ' + countFontSize + 'px Montserrat, Arial, sans-serif'
			ctx.fillStyle = '#99a'
			const countX = x + iconSize + gap
			ctx.fillText(String(row.group.count), countX, centerY)
			const countWidth = ctx.measureText(String(row.group.count)).width
			ctx.font = '500 ' + fontSize + 'px Montserrat, Arial, sans-serif'
			ctx.fillStyle = row.type === 'consume' ? resourceSourceConsumeColor : (game.codex?.resources?.[resourceId]?.triplet?.[2] || '#4f8f5f')
			ctx.fillText(formatResourceSourceRate(game, row), countX + countWidth + gap, centerY)
		}

		function drawResourceSourceColumnDivider(ctx, x, y, height, pixelRatio) {
			ctx.strokeStyle = '#dde'
			ctx.lineWidth = Math.max(1, pixelRatio)
			ctx.beginPath()
			ctx.moveTo(x, y)
			ctx.lineTo(x, y + height)
			ctx.stroke()
		}
		function drawResourceSourcePanelBack(ctx, x, y, width, height, pixelRatio) {
			ctx.fillStyle = '#fffffff4'
			if (ctx.roundRect) {
				ctx.beginPath()
				ctx.roundRect(x, y, width, height, Math.max(2, pixelRatio * 3))
				ctx.closePath()
				ctx.fill()
			} else {
				ctx.fillRect(x, y, width, height)
			}
		}

		function getResourceSourcePanelY(game, resourceId, height) {
			const unit = game.screenUnit || game.unit || 1
			const home = game.resourceHomes?.[resourceId] || [0, unit]
			let y = home[1] + unit * ((game.entitiesInGame?.mega1 || game.entitiesInGame?.mega1a || game.entitiesInGame?.mega1b) ? 1.02 : 0.68)
			if (game.entitiesInGame?.mega1b && game.analytics?.graphs?.[resourceId]?.canvas) {
				y = Math.max(y, (game.resourceHomes?.[0]?.[1] || home[1]) * 2 + game.analytics.graphs[resourceId].canvas.height + unit * 0.18)
			}
			return clampNumber(y, 2, Math.max(2, game.h - height - 2))
		}

		function getResourceSourceSeconds(state, now = performance.now()) {
			return Math.max(1, Math.min(resourceSourceWindowMs, now - (state?.startedAt || now)) / 1000)
		}

		function getRecentEntityResourceSourceRate(entity, type = 'gain') {
			const game = entity?.master
			const resources = new Array(resourceCountSize(game)).fill(0)
			if (!game || !entity?.name) return resources

			const state = getResourceSourceState(game)
			const now = performance.now()
			trimResourceSourceEvents(state, now)
			const seconds = getResourceSourceSeconds(state, now)
			const source = normalizeResourceSource(game, { kind: 'entity', entity })
			if (!source?.instanceKey) return resources

			for (const event of state.events) {
				if (!event || event.type !== type || event.source?.instanceKey !== source.instanceKey) continue
				const resourceId = Number(event.resourceId)
				if (!Number.isInteger(resourceId) || resourceId < 0 || resourceId >= resources.length) continue
				resources[resourceId] += Number(event.amount) || 0
			}

			return resources.map((amount) => amount / seconds)
		}

		function getResourceSourceSummary(game, resourceId) {
			const now = performance.now()
			const state = getResourceSourceState(game)
			profileResourceSource('resource.events.trim.summary', () => trimResourceSourceEvents(state, now), () => getResourceSourceProfileDetail(game, resourceId))
			const cacheKey = String(resourceId)
			const cached = state.summaryCache?.[cacheKey]
			if (cached && now - cached.time < resourceSourceSummaryCacheMs) return cached.summary

			const seconds = getResourceSourceSeconds(state, now)
			const summary = {
				gain: profileResourceSource(
					'resource.summary.aggregate.gain',
					() => aggregateResourceSourceEvents(game, state.events, resourceId, 'gain', seconds),
					() => getResourceSourceProfileDetail(game, resourceId, { seconds: Math.round(seconds * 100) / 100 })
				),
				consume: profileResourceSource(
					'resource.summary.aggregate.consume',
					() => aggregateResourceSourceEvents(game, state.events, resourceId, 'consume', seconds),
					() => getResourceSourceProfileDetail(game, resourceId, { seconds: Math.round(seconds * 100) / 100 })
				)
			}
			state.summaryCache[cacheKey] = { time: now, summary }
			return summary
		}

		function aggregateResourceSourceEvents(game, events, resourceId, type, seconds) {
			const groups = new Map()
			for (const event of events) {
				if (!event || event.resourceId !== resourceId || event.type !== type) continue
				const source = event.source || { kind: 'unknown', groupKey: 'unknown', instanceKey: 'unknown' }
				const key = source.groupKey || source.kind || 'unknown'
				let group = groups.get(key)
				if (!group) {
					group = { key, source, sources: new Map(), amount: 0, count: 0, rate: 0 }
					groups.set(key, group)
				}
				group.amount += Number(event.amount) || 0
				group.sources.set(source.instanceKey || key, source)
			}

			return Array.from(groups.values()).map((group) => {
				group.sources = Array.from(group.sources.values())
				group.count = getResourceSourceGroupWorkingCount(game, group)
				group.rate = group.amount / seconds
				return group
			}).filter((group) => group.rate >= resourceSourceMinAmount).sort((a, b) => b.rate - a.rate)
		}

		function getResourceSourceGroupWorkingCount(game, group) {
			const source = group?.source
			if (source?.kind === 'resource') return 1
			if (source?.kind === 'entity' && source.name) return countWorkingEntitiesByName(game, source.name)
			return Math.max(1, group?.sources?.length || 0)
		}

		function countWorkingEntitiesByName(game, name) {
			let count = 0
			for (const entity of game?.stuff || []) {
				if (entity?.name === name && isResourceSourceEntityWorking(entity)) count++
			}
			return count
		}

		function isResourceSourceEntityWorking(entity) {
			if (!entity?.name) return false
			if (entity.name === 'pump' || entity.name === 'pump2') return getPumpFlow(entity).miningResourcesPerSecond >= resourceSourceMinAmount
			if (entity.name === 'gradient') {
				const flow = getGradientFlow(entity)
				return flow.periodicPowerPerSecond >= resourceSourceMinAmount || flow.triggerPower >= resourceSourceMinAmount
			}
			if (entity.name === 'consumer') return entity.state === 2 || (entity.resourceCount || 0) > 0
			if (entity.name === 'annihilator') return entity.state === 2 && (entity.fill || 0) > 0
			if (isConverter(entity)) return entity.state === 2 && entity.alone !== false
			if (entity.state === 2) return true
			if ('active' in entity) return !!entity.active
			if (!('state' in entity)) return true
			return false
		}

		function formatResourceSourceRate(game, row) {
			const sign = row.type === 'consume' ? '-' : '+'
			return sign + formatNumber(game, row.group.rate) + '/s'
		}

		function drawResourceSourceIcon(game, source, x, y, size) {
			if (source?.kind === 'resource') {
				drawResourceSourceResourceIcon(game, source.resourceId, x, y, size)
				return
			}

			if (source?.kind === 'entity' && source.name) {
				if (drawResourceSourceShopIcon(game, source.name, x, y, size)) return
				const entity = getResourceSourceEntityForIcon(game, source)
				if (entity?.sprite) {
					game.ctx.save()
					clipIconRect(game.ctx, x, y, size)
					profileResourceSource('resource.icon.entitySprite.render', () => entity.sprite.renderXY([x, y + size * 0.22], 0, false, Math.max(0.12, size / Math.max(1, (game.unit || 1) * 1.65))), () => ({ name: source.name, size: Math.round(size * 100) / 100 }))
					game.ctx.restore()
					return
				}
			}

			drawResourceSourcePlaceholder(game, x, y, size)
		}

		function getResourceSourceEntityForIcon(game, source) {
			if (source?.entity?.sprite) return source.entity
			if (!game || !source?.name || !Array.isArray(source.position)) return null
			const cell = [Math.floor(source.position[0]), Math.floor(source.position[1])]
			const entity = game.entityAtCoordinates?.(cell)
			return entity?.name === source.name ? entity : null
		}

		function drawResourceSourceResourceIcon(game, resourceId, x, y, size) {
			const sprite = game.resourcesSprites?.[resourceId]
			if (!sprite) {
				drawResourceSourcePlaceholder(game, x, y, size)
				return
			}
			const drawSize = size * 0.74
			game.ctx.save()
			clipIconRect(game.ctx, x, y, size)
			profileResourceSource('resource.icon.resourceSprite.render', () => sprite.renderXY([x, y], 0, false, Math.max(0.08, drawSize / Math.max(1, (game.unit || 1) * 1.65))), () => ({ resourceId, size: Math.round(size * 100) / 100 }))
			game.ctx.restore()
		}

		function drawResourceSourceShopIcon(game, name, x, y, size) {
			const img = getResourceSourceShopImage(game, name)
			if (!isResourceSourceImageReady(img)) return false
			const ctx = game.ctx
			ctx.save()
			clipIconRect(ctx, x, y, size)
			profileResourceSource('resource.icon.drawImage', () => ctx.drawImage(img, x - size / 2, y - size / 2, size, size), () => ({ name, size: Math.round(size * 100) / 100, src: img.src }))
			ctx.restore()
			return true
		}

		function getResourceSourceShopImage(game, name) {
			const entityData = game?.codex?.entities?.[name]
			const src = getResourceSourceShopImageSrc(entityData, name)
			const resolved = window.ModLoader?.resolveAsset(src) || src
			let img = resourceSourceImageCache.get(resolved)
			if (!img) {
				img = new Image()
				img.decoding = 'async'
				img._cattailResourceSourceReady = false
				img._cattailResourceSourceDecoding = false
				img._cattailResourceSourceFailed = false
				img.onload = () => markResourceSourceImageLoaded(img)
				img.onerror = () => {
					img._cattailResourceSourceFailed = true
				}
				img.src = resolved
				resourceSourceImageCache.set(resolved, img)
			}
			markResourceSourceImageLoaded(img)
			return img
		}

		function getResourceSourceShopImageSrc(entityData, name) {
			if (entityData?.shopImage) return entityData.shopImage
			if (name === 'cookie') return 'img/cookie.png'
			return 'img/shop/' + name + '.jpg'
		}

		function markResourceSourceImageLoaded(img) {
			if (!img || img._cattailResourceSourceReady || img._cattailResourceSourceFailed) return
			if (!img.complete) return
			if (!img.naturalWidth) {
				img._cattailResourceSourceFailed = true
				return
			}
			img._cattailResourceSourceReady = true
		}

		function isResourceSourceImageReady(img) {
			return !!(img && img._cattailResourceSourceReady && img.complete && img.naturalWidth)
		}

		function drawResourceSourcePlaceholder(game, x, y, size) {
			const ctx = game.ctx
			ctx.save()
			ctx.fillStyle = '#ccd'
			ctx.beginPath()
			ctx.arc(x, y, size * 0.32, 0, Math.PI * 2)
			ctx.fill()
			ctx.restore()
		}

		function clipIconRect(ctx, x, y, size) {
			ctx.beginPath()
			if (ctx.roundRect) ctx.roundRect(x - size / 2, y - size / 2, size, size, Math.max(2, size * 0.18))
			else ctx.rect(x - size / 2, y - size / 2, size, size)
			ctx.clip()
		}

		function getResourceSourceScreenPoint(game, source) {
			if (source?.kind === 'resource' && Array.isArray(game.resourceHomes?.[source.resourceId])) return game.resourceHomes[source.resourceId]
			if (source?.entity?.position) return game.uvToXYUntranslated(source.entity.position)
			if (Array.isArray(source?.position)) return game.uvToXYUntranslated(source.position)
			return null
		}


		function clampNumber(value, min, max) {
			return Math.max(min, Math.min(max, value))
		}
		function installBuildCountdown() {
			if (typeof Shop === 'undefined') return

			installBuildCountdownStyles()
			installBuildCountdownResourceEvents()
			api.patch(Shop.prototype, 'updatePrice', function (original) {
			  return function (item) {
			    const result = original.call(this, item)
			    ensureCountdownElement(item)
			    updateCountdown(this, item, true)
			    return result
			  }
			})

			api.patch(Shop.prototype, 'updateElements', function (original) {
			  return function () {
			    const result = original.apply(this, arguments)
			    sampleResourceSnapshot(this.master)
			    updateShopCountdowns(this, true)
			    return result
			  }
			})

			api.patch(Shop.prototype, 'check', function (original) {
			  return function () {
			    prepareCompressedCountdownSignature(this)
			    const result = original.apply(this, arguments)
			    sampleResourceSnapshot(this.master)
			    updateShopCountdowns(this, false)
			    return result
			  }
			})
		}

		function installBuildCountdownResourceEvents() {
			if (typeof Game === 'undefined' || !Game.prototype) return
			patchBuildCountdownResourceEventMethod('addResourcesFromArray')
			patchBuildCountdownResourceEventMethod('substractResourcesFromArray')
		}

		function patchBuildCountdownResourceEventMethod(methodName) {
			if (typeof Game.prototype[methodName] !== 'function') return
			api.patch(Game.prototype, methodName, function (original) {
				return function (resourceDelta, skipAnalytics) {
					if (skipAnalytics || !Array.isArray(resourceDelta) || !Array.isArray(this.resources)) {
						return original.apply(this, arguments)
					}

					const before = normalizeResourceArray(this.resources, this.resources.length)
					const result = original.apply(this, arguments)
					recordBuildCountdownResourceDelta(this, before, this.resources)
					return result
				}
			})
		}

		function installBuildCountdownStyles() {
		  if (document.getElementById(buildCountdownStyleId)) return
		  const style = document.createElement('style')
		  style.id = buildCountdownStyleId
		  style.textContent = `
		    .shop .shopItem .itemPrice .${buildCountdownClass} {
		      display: none;
		      clear: both;
		      width: 100%;
		      margin-top: calc(var(--unit) * 0.32);
		      text-align: center;
		      color: rgba(120, 120, 130, 0.95);
		      font-size: calc(var(--unit) * 0.6);
		      font-weight: 500;
		      line-height: 1.25;
		      white-space: nowrap;
		    }
		    .shop .shopItem .itemPrice .${buildCountdownClass}.active {
		      display: block;
		    }
		    .shop.darkShop .shopItem .itemPrice .${buildCountdownClass} {
		      color: rgba(205, 205, 214, 0.9);
		    }
		    .shop .shopItem.disabled .itemPrice .${buildCountdownClass} {
		      opacity: 0.95;
		    }
		    .shop.minimized .shopItem .itemPrice .${buildCountdownClass} {
		      display: none;
		    }
		    .shop.minimized .shopItem.newItem .itemPrice .${buildCountdownClass}.active {
		      display: block;
		    }
		    .shop.mobile .shopItem .itemPrice .${buildCountdownClass} {
		      margin-top: calc(var(--munit) * 0.24);
		      font-size: calc(var(--munit) * 0.95);
		    }
		    .cattail-shop-category-item-meta .itemPrice.${buildCountdownActivePriceClass} {
		      width: 100%;
		    }
		    .cattail-shop-category-item-meta .itemPrice.${buildCountdownActivePriceClass} .${buildCountdownClass} {
		      width: 100%;
		      margin-top: calc(var(--unit) * 0.18);
		      text-align: center;
		      font-size: calc(var(--unit) * 0.6);
		      font-weight: 500;
		    }
		    .shop.minimized .cattail-shop-category-item-meta .${buildCountdownClass} {
		      display: none;
		    }
		  `
		  document.head.appendChild(style)
		}

		function updateShopCountdowns(shop, force) {
		  if (!shop || !shop.items) return
		  for (const item of shop.items) {
		    updateCountdown(shop, item, force)
		  }
		}

		function updateCountdown(shop, item, force) {
		  if (!shop || !shop.master || !item || !item.name || !item.priceHtml) return
		  const element = ensureCountdownElement(item)
		  if (!element) return

		  const now = performance.now()
		  const affordable = isAffordable(shop.master, item)
		  if (!force && item[buildCountdownNextRefreshKey] && now < item[buildCountdownNextRefreshKey] && item[buildCountdownLastAffordableKey] === affordable) {
		    syncCountdownText(shop, item, element, item[buildCountdownLastTextKey] || '')
		    return
		  }
		  item[buildCountdownNextRefreshKey] = now + buildCountdownRefreshMs
		  item[buildCountdownLastAffordableKey] = affordable

		  const seconds = affordable ? 0 : getCountdownSeconds(shop.master, item)
		  if (affordable) {
		    setCountdownText(shop, item, element, '')
		    return
		  }

		  const label = translate(shop.master, 'buildableIn')
		  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
		    setCountdownText(shop, item, element, label + ': --')
		    return
		  }

		  setCountdownText(shop, item, element, label + ': ' + formatBuildCountdownDuration(seconds))
		}

		function ensureCountdownElement(item) {
		  if (!item || !item.priceHtml) return null
		  let element = item[buildCountdownElementKey]
		  if (!element || element.parentNode !== item.priceHtml) {
		    element = item.priceHtml.querySelector('.' + buildCountdownClass)
		  }
		  if (!element) {
		    element = document.createElement('div')
		    element.className = buildCountdownClass
		    item.priceHtml.appendChild(element)
		  }
		  item[buildCountdownElementKey] = element
		  return element
		}

		function setCountdownText(shop, item, element, text) {
		  const nextText = text || ''
		  item[buildCountdownLastTextKey] = nextText
		  syncCountdownText(shop, item, element, nextText)
		}

		function syncCountdownText(shop, item, element, text) {
		  const nextText = text || ''
		  if (isShopCategoriesCompressed(shop)) {
		    clearOriginalCountdownElement(item, element)
		    syncCategoryCountdownText(shop, item, nextText)
		    return
		  }

		  if (element.textContent !== nextText) element.textContent = nextText
		  element.classList.toggle('active', Boolean(nextText))
		  if (item.priceHtml) {
		    item.priceHtml.classList.toggle(buildCountdownActivePriceClass, Boolean(nextText))
		  }
		}

		function prepareCompressedCountdownSignature(shop) {
		  if (!isShopCategoriesCompressed(shop) || !Array.isArray(shop.items)) return
		  for (const item of shop.items) {
		    const element = item?.priceHtml?.querySelector?.('.' + buildCountdownClass)
		    clearOriginalCountdownElement(item, element)
		  }
		}

		function clearOriginalCountdownElement(item, element) {
		  if (element) {
		    if (element.textContent) element.textContent = ''
		    element.classList.remove('active')
		  }
		  item?.priceHtml?.classList?.remove(buildCountdownActivePriceClass)
		}

		function syncCategoryCountdownText(shop, item, text) {
		  const panel = getShopCategoryPanel(shop)
		  if (!panel || !item?.name) return
		  const selector = '[data-shop-item="' + buildCountdownCssEscape(item.name) + '"]'
		  for (const row of panel.querySelectorAll(selector)) {
		    const price = row.querySelector('.cattail-shop-category-item-meta .itemPrice')
		    if (!price) continue
		    let element = price.querySelector('.' + buildCountdownClass)
		    if (!element && text) {
		      element = document.createElement('div')
		      element.className = buildCountdownClass
		      price.appendChild(element)
		    }
		    if (!element) {
		      price.classList.remove(buildCountdownActivePriceClass)
		      continue
		    }
		    if (element.textContent !== text) element.textContent = text
		    element.classList.toggle('active', Boolean(text))
		    price.classList.toggle(buildCountdownActivePriceClass, Boolean(text))
		  }
		}

		function getShopCategoryPanel(shop) {
		  return shop?.vessel?.querySelector?.('.cattail-shop-category-panel:not(.cattail-shop-category-panel-hidden)') || null
		}

		function isShopCategoriesCompressed(shop) {
		  return !!shop?.vessel?.classList?.contains('cattail-shop-compressed')
		}

		function buildCountdownCssEscape(value) {
		  const stringValue = String(value || '')
		  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(stringValue)
		  return stringValue.replace(/["\\]/g, '\\$&')
		}

		function isAffordable(game, item) {
		  if (!game || !item || !item.name || typeof game.getRealPrice !== 'function') return true
		  const price = game.getRealPrice(item.name) || []
		  const resources = game.resources || []
		  for (let i = 0; i < price.length; i++) {
		    if ((Number(price[i]) || 0) > (Number(resources[i]) || 0)) return false
		  }
		  return true
		}

		function getCountdownSeconds(game, item) {
		  const price = game.getRealPrice(item.name) || []
		  const resources = game.resources || []
		  const rates = getRates(game, price.length)
		  let longest = 0
		  let hasMissingResource = false

		  for (let i = 0; i < price.length; i++) {
		    const needed = Number(price[i]) || 0
		    const stored = Number(resources[i]) || 0
		    if (needed <= stored) continue

		    hasMissingResource = true
		    const rate = Number(rates[i]) || 0
		    if (rate <= 0.000001) return null
		    longest = Math.max(longest, (needed - stored) / rate)
		  }

		  return hasMissingResource ? Math.max(1, longest) : 0
		}

		function getState(game) {
		  if (!game[buildCountdownStateKey]) {
		    Object.defineProperty(game, buildCountdownStateKey, {
		      configurable: true,
		      value: {
		        snapshots: [],
		        resourceEvents: [],
		        eventStartedAt: performance.now(),
		        lastSnapshotAt: 0,
		        cachedRates: [],
		        cachedRateAt: 0,
		        cachedRateLength: 0,
		        smoothedRates: [],
		        smoothedRateAt: 0
		      }
		    })
		  }

		  const state = game[buildCountdownStateKey]
		  if (!Array.isArray(state.snapshots)) state.snapshots = []
		  if (!Array.isArray(state.resourceEvents)) state.resourceEvents = []
		  if (!state.eventStartedAt) state.eventStartedAt = performance.now()
		  if (!Array.isArray(state.smoothedRates)) state.smoothedRates = []
		  return state
		}

		function sampleResourceSnapshot(game, now = performance.now(), force = false) {
		  if (!game || !game.resources) return
		  const state = getState(game)
		  if (!force && state.lastSnapshotAt && now - state.lastSnapshotAt < buildCountdownSnapshotSampleMs) return

		  const current = normalizeResourceArray(game.resources, game.resources.length)
		  state.snapshots.push({ time: now, resources: current })
		  state.lastSnapshotAt = now
		  trimBuildCountdownSnapshots(state, now)
		  state.cachedRateAt = 0
		}

		function getRates(game, length) {
		  const now = performance.now()
		  const state = getState(game)
		  sampleResourceSnapshot(game, now)
		  trimBuildCountdownSnapshots(state, now)
		  trimBuildCountdownResourceEvents(state, now)

		  if (state.cachedRates && state.cachedRateLength >= length && now - state.cachedRateAt < buildCountdownRateCacheMs) {
		    return state.cachedRates
		  }

		  const snapshotRates = calculateNetSnapshotRates(game, state.snapshots, length)
		  const eventRates = calculateEventRates(game, state, length, now)
		  const rawRates = eventRates.ready ? eventRates.rates : snapshotRates.slice()
		  if (eventRates.ready) {
		    for (let i = 0; i < length; i++) {
		      if (!eventRates.touched[i] && Math.abs(snapshotRates[i] || 0) > 0.000001) rawRates[i] = snapshotRates[i]
		    }
		  }

		  const rates = smoothBuildCountdownRates(state, rawRates, length, now)
		  state.cachedRates = rates
		  state.cachedRateAt = now
		  state.cachedRateLength = length
		  return rates
		}

		function recordBuildCountdownResourceDelta(game, before, after, now = performance.now()) {
		  if (!game || !Array.isArray(before) || !Array.isArray(after)) return
		  const state = getState(game)
		  const length = Math.max(before.length, after.length)
		  const resources = new Array(length).fill(0)
		  let hasDelta = false

		  for (let i = 0; i < length; i++) {
		    const delta = (Number(after[i]) || 0) - (Number(before[i]) || 0)
		    if (Math.abs(delta) <= 0.0000001) continue
		    resources[i] = delta
		    hasDelta = true
		  }

		  if (!hasDelta) return
		  appendBuildCountdownResourceEvent(state, now, resources)
		  trimBuildCountdownResourceEvents(state, now)
		  state.cachedRateAt = 0
		}

		function appendBuildCountdownResourceEvent(state, now, resources) {
		  const bucketTime = Math.floor(now / buildCountdownEventBucketMs) * buildCountdownEventBucketMs
		  const last = state.resourceEvents[state.resourceEvents.length - 1]
		  if (last && last.time === bucketTime && Array.isArray(last.resources)) {
		    const length = Math.max(last.resources.length, resources.length)
		    for (let i = 0; i < length; i++) {
		      last.resources[i] = (Number(last.resources[i]) || 0) + (Number(resources[i]) || 0)
		    }
		    return
		  }
		  state.resourceEvents.push({ time: bucketTime, resources })
		}
		function calculateEventRates(game, state, length, now) {
		  const rates = new Array(length).fill(0)
		  const touched = new Array(length).fill(false)
		  const ageMs = Math.min(buildCountdownSampleWindowMs, Math.max(0, now - (state.eventStartedAt || now)))
		  if (ageMs < buildCountdownSampleMinAgeMs) return { rates, touched, ready: false }

		  const cutoff = now - buildCountdownSampleWindowMs
		  for (const event of state.resourceEvents || []) {
		    if (!event || event.time < cutoff) continue
		    const resources = event.resources || []
		    for (let i = 0; i < length; i++) {
		      const delta = Number(resources[i]) || 0
		      if (!delta) continue
		      rates[i] += delta
		      touched[i] = true
		    }
		  }

		  const seconds = ageMs / 1000
		  for (let i = 0; i < length; i++) {
		    const rate = rates[i] / seconds
		    rates[i] = isStorageBoundOscillation(game, state.snapshots, i, rate) ? 0 : rate
		  }

		  return { rates, touched, ready: true }
		}

		function smoothBuildCountdownRates(state, rates, length, now) {
		  if (!Array.isArray(state.smoothedRates) || state.smoothedRates.length < length || !state.smoothedRateAt) {
		    state.smoothedRates = copyRateArray(rates, length)
		    state.smoothedRateAt = now
		    return state.smoothedRates
		  }

		  const smoothed = new Array(length).fill(0)
		  for (let i = 0; i < length; i++) {
		    const previous = Number(state.smoothedRates[i]) || 0
		    const next = Number(rates[i]) || 0
		    const alpha = (next <= 0 && previous > 0) || Math.abs(next) > Math.abs(previous) ? buildCountdownRateSmoothRise : buildCountdownRateSmoothFall
		    const value = previous + (next - previous) * alpha
		    smoothed[i] = Math.abs(value) <= 0.000001 ? 0 : value
		  }

		  state.smoothedRates = smoothed
		  state.smoothedRateAt = now
		  return smoothed
		}

		function copyRateArray(values, length) {
		  const result = new Array(length).fill(0)
		  for (let i = 0; i < length; i++) result[i] = Number(values?.[i]) || 0
		  return result
		}

		function calculateNetSnapshotRates(game, snapshots, length) {
		  const rates = new Array(length).fill(0)
		  if (!snapshots || snapshots.length < 2) return rates

		  const oldest = snapshots[0]
		  const newest = snapshots[snapshots.length - 1]
		  const ageMs = newest.time - oldest.time
		  if (ageMs < buildCountdownSampleMinAgeMs) return rates

		  const seconds = ageMs / 1000
		  for (let i = 0; i < length; i++) {
		    const rate = ((Number(newest.resources[i]) || 0) - (Number(oldest.resources[i]) || 0)) / seconds
		    rates[i] = isStorageBoundOscillation(game, snapshots, i, rate) ? 0 : rate
		  }
		  return rates
		}

		function isStorageBoundOscillation(game, snapshots, resourceId, rate) {
		  const cap = getProtectedResourceCapacity(game, snapshots, resourceId)
		  if (cap === null) return false

		  const values = snapshots.map((snapshot) => Number(snapshot.resources[resourceId]) || 0)
		  const min = Math.min(...values)
		  const max = Math.max(...values)
		  const margin = getProtectedOscillationMargin(game, resourceId, cap, max - min)
		  const touchesProtectedCap = max >= cap - margin
		  const escapesProtectedCap = max > cap + margin

		  return touchesProtectedCap && !escapesProtectedCap
		}

		function getProtectedResourceCapacity(game, snapshots, resourceId) {
		  if (resourceId === 4) {
		    const hasFoam = snapshots.some((snapshot) => (Number(snapshot.resources[6]) || 0) > 0) || (Number(game?.resources?.[6]) || 0) > 0
		    if (!hasFoam) return null
		    return (game?.vaults?.size || 0) * 1024
		  }

		  if (resourceId === 5) {
		    const capacity = getChromalitProtectedCapacity(game)
		    return capacity > 0 ? capacity : null
		  }

		  return null
		}

		function getChromalitProtectedCapacity(game) {
		  let capacity = 0
		  for (const entity of game?.stuff || []) {
		    if (!entity || (entity.name !== 'vessel' && entity.name !== 'vessel2')) continue
		    if (entity.state !== 2) continue
		    capacity += Number(entity.capacity) || 0
		  }
		  return capacity
		}

		function getProtectedResourceMargin(game, resourceId, cap) {
		  if (resourceId === 4) return Math.max(1, Number(game?.hellgemChunk) || 64, cap * 0.01)
		  if (resourceId === 5) return Math.max(1, 32, cap * 0.02)
		  return 1
		}

		function getProtectedOscillationMargin(game, resourceId, cap, range) {
		  const base = getProtectedResourceMargin(game, resourceId, cap)
		  const capLimit = Math.max(base, cap * (resourceId === 4 ? 0.2 : 0.15))
		  const rangeMargin = Math.max(base, (Number(range) || 0) * 0.25)
		  return Math.min(capLimit, rangeMargin)
		}

		function trimBuildCountdownSnapshots(state, now) {
		  const snapshots = state.snapshots
		  const cutoff = now - buildCountdownSampleWindowMs
		  let removeCount = 0
		  while (snapshots.length - removeCount > 2 && snapshots[removeCount + 1].time < cutoff) removeCount++
		  if (removeCount > 0) snapshots.splice(0, removeCount)
		}

		function trimBuildCountdownResourceEvents(state, now) {
		  const events = state.resourceEvents
		  if (!Array.isArray(events)) return
		  const cutoff = now - buildCountdownSampleWindowMs
		  let removeCount = 0
		  while (removeCount < events.length && events[removeCount].time < cutoff) removeCount++
		  if (removeCount > 0) events.splice(0, removeCount)
		  const overflow = events.length - buildCountdownMaxResourceEvents
		  if (overflow > 0) events.splice(0, overflow)
		}

		function normalizeResourceArray(resources, length) {
		  const result = new Array(length || 0).fill(0)
		  for (let i = 0; i < result.length; i++) {
		    result[i] = Math.max(0, Number(resources[i]) || 0)
		  }
		  return result
		}

		function formatBuildCountdownDuration(rawSeconds) {
		  const total = Math.max(1, Math.ceil(rawSeconds))
		  const hours = Math.floor(total / 3600)
		  const minutes = Math.floor((total % 3600) / 60)
		  const seconds = total % 60
		  const parts = []

		  if (hours > 0) parts.push(hours + ' h')
		  if (hours > 0 || minutes > 0) parts.push(minutes + ' m')
		  parts.push(seconds + ' s')
		  return parts.join(' ')
		}

		function translate(game, key) {
		  if (game && typeof game.pronounce === 'function') {
		    const translated = game.pronounce('cattailBuildCountdown', key)
		    if (translated && translated !== key) return translated
		  }
		  const fallback = {
		    buildableIn: 'Buildable'
		  }
		  return fallback[key] || key
		}
		function installStyles() {
			if (document.getElementById('cattail-dynamic-details-style')) return
			const style = document.createElement('style')
			style.id = 'cattail-dynamic-details-style'
			style.textContent = `
.cattail-coordinate-teleport {
	position: absolute;
	z-index: 10000;
	display: none;
	grid-template-columns: 48px 48px 26px;
	align-items: center;
	cursor: default;
	gap: 6px;
	padding: 6px;
	background: #fff;
	box-shadow: 0px 8px 36px #0002;
	border-radius: 4px;
	line-height: 0;
	pointer-events: auto;
	user-select: none;
}
.cattail-coordinate-teleport.visible {
	display: grid;
}
.cattail-coordinate-teleport input {
	box-sizing: border-box;
	width: 48px;
	height: 24px;
	padding: 0 4px;
	border: 1px solid #dde;
	border-radius: 3px;
	background: #f8f8fb;
	color: #667;
	font: 500 12px Montserrat, Arial, sans-serif;
	text-align: center;
	outline: none;
}
.cattail-coordinate-teleport input:focus {
	border-color: #bbc;
	background: #fff;
}
.cattail-coordinate-teleport input::-webkit-outer-spin-button,
.cattail-coordinate-teleport input::-webkit-inner-spin-button {
	-webkit-appearance: none;
	margin: 0;
}
.cattail-coordinate-teleport button {
	box-sizing: border-box;
	width: 26px;
	height: 24px;
	padding: 0;
	border: 1px solid #dde;
	border-radius: 3px;
	background: #eee;
	color: #778;
	font: 600 15px/22px Montserrat, Arial, sans-serif;
	text-align: center;
	outline: none;
}
.cattail-coordinate-teleport button:hover,
.cattail-coordinate-teleport button:focus {
	background: #e5e5ee;
	color: #556;
}
.hintBubble {
	opacity: var(--cattail-dynamic-hint-opacity, 1);
}
.cattail-dynamic-info-opaque .hintBubble {
	opacity: 1;
	background: rgba(255, 255, 255, var(--cattail-dynamic-hint-shell-opacity, 1));
	box-shadow: 0px 8px 36px rgba(0, 0, 0, var(--cattail-dynamic-hint-shadow-opacity, .12));
}
.cattail-dynamic-info-opaque .hintBubble.dark {
	background: rgba(0, 0, 0, var(--cattail-dynamic-hint-shell-opacity, 1));
}
.cattail-dynamic-info-opaque .hintBubble .entityName,
.cattail-dynamic-info-opaque .hintBubble .hintProgressBarBack {
	background: rgba(238, 238, 238, var(--cattail-dynamic-hint-shell-opacity, 1));
}
.cattail-dynamic-info-opaque .hintBubble .hintLine,
.cattail-dynamic-info-opaque .hintBubble .cattail-dynamic-detail-line {
	background: rgba(221, 221, 238, var(--cattail-dynamic-hint-shell-opacity, 1));
}
.cattail-dynamic-info-opaque .hintBubble .hintDescription {
	border-top-color: rgba(221, 221, 238, var(--cattail-dynamic-hint-shell-opacity, 1));
}
.hintBubble .cattail-dynamic-detail-line,
.hintBubble .cattail-dynamic-detail {
	display: none;
}
.hintBubble .cattail-dynamic-detail-line.active {
	display: block;
}
.hintBubble .cattail-dynamic-top-flow {
	display: none;
	justify-content: center;
	margin-bottom: calc(var(--unit) * .28);
}
.hintBubble .cattail-dynamic-top-flow.active {
	display: flex;
}
.hintBubble .converterOutputVessel {
	justify-content: center;
}
.hintBubble .hintQE .cattail-dynamic-z-wheel {
	height: 16px;
	width: 21px;
	background: url('mods/Cattail_TweaksQuality_Dynamic-Details/img/zopacityhint.svg') no-repeat;
	background-size: auto 100%;
	display: none;
	vertical-align: top;
}
.altHolded .hintBubble .hintQE .cattail-dynamic-z-wheel {
	display: inline-block;
}
.hintBubble .cattail-dynamic-detail.active {
	display: grid;
	gap: calc(var(--unit) * .22);
	margin-top: calc(var(--unit) * .35);
	color: #8f8f98;
	font: 500 calc(var(--unit) * .64)/1.35 Montserrat, Arial, sans-serif;
	min-width: calc(var(--unit) * 12);
}
.hintBubble .cattail-dynamic-detail-row {
	display: grid;
	grid-template-columns: minmax(calc(var(--unit) * 4.8), auto) minmax(calc(var(--unit) * 5.5), 1fr);
	align-items: center;
	gap: calc(var(--unit) * .48);
}
.hintBubble .cattail-dynamic-detail-flow-row {
	display: flex;
	justify-content: flex-end;
	min-width: 0;
}

.hintBubble .cattail-dynamic-detail-label {
	color: #a7a7ae;
	white-space: nowrap;
}
.hintBubble .cattail-dynamic-detail-value {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	flex-wrap: wrap;
	gap: calc(var(--unit) * .22) calc(var(--unit) * .45);
	min-width: 0;
	color: #52525a;
	text-align: right;
}
.hintBubble .cattail-dynamic-detail-value-wrap {
	display: block;
	justify-self: end;
	max-width: calc(var(--unit) * 20);
	white-space: normal;
	text-align: right;
	overflow-wrap: break-word;
}
.hintBubble.dark .cattail-dynamic-detail-value {
	color: #d7d7dd;
}
.hintBubble.dark .cattail-dynamic-detail,
.hintBubble.dark .cattail-dynamic-detail-label {
	color: #b9b9c2;
}
.hintBubble .cattail-dynamic-resource {
	display: inline-flex;
	align-items: center;
	gap: calc(var(--unit) * .14);
	white-space: nowrap;
}
.hintBubble .cattail-dynamic-resource .hintResourceIcon {
	flex: 0 0 auto;
}
.hintBubble .cattail-dynamic-resource-amount {
	display: inline-block;
	min-width: calc(var(--unit) * 1.7);
	text-align: left;
}
`
			document.head.append(style)
		}
	}
})
