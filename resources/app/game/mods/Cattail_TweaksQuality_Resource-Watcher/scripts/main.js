ModLoader.register({
	id: 'Cattail_TweaksQuality_Resource-Watcher',
	init(api) {
		const styleId = 'cattail-resource-watcher-style'
		const toggleId = 'cattail-resource-watcher-toggle'
		const watcherKey = '__cattailResourceWatcherController'
		const dynamicDetailsModId = 'Cattail_TweaksQuality_Dynamic-Details'
		const dynamicSourceStateKey = '_cattailDynamicResourceSourceState'
		const dynamicSourceToggleKey = '_cattailDynamicResourceSourceToggle'
		const dynamicSourceLastResourceKey = '_cattailDynamicResourceSourceLastResource'
		const dynamicSourceLineChartStateKey = '_cattailDynamicResourceSourceLineChart'
		const dynamicSourceLineChartModeStorageKey = 'cattailDynamicResourceSourceLineChartMode'
		const dynamicSourceLineChartConfigStorageKey = 'modloader:Cattail_TweaksQuality_Dynamic-Details:config:enableResourceSourceLineChart'
		const dynamicSourceDetailsConfigStorageKey = 'modloader:Cattail_TweaksQuality_Dynamic-Details:config:enableResourceSourceDetails'
		const dynamicSourceLineChartWheelCooldownMs = 180
		const dynamicSourceToggleStorageKey = 'cattailDynamicResourceSourceToggle'
		const dynamicSourceLastResourceStorageKey = 'cattailDynamicResourceSourceLastResource'
		const rowHeight = 44
		const rowGap = 4
		const popupTopReserve = 86
		const popupBottomReserve = 12
		const iconWidth = 42
		const amountWidth = 154
		const columnGap = 10
		const compactWidth = iconWidth + amountWidth + columnGap * 2
		const infoWidth = 430
		const minHeight = 118
		const maxHeight = 620
		const minWindowWidth = 120
		const minWindowHeight = 80
		const minPopupScale = 0.5
		const maxPopupScale = 3
		const updateMs = 33
		const hoverClearDelayMs = 150

		const state = {
			active: false,
			game: null,
			controller: null,
			popupTools: null,
			popupScale: 1,
			hoveredResource: null,
			lastHoveredResource: null,
			resourceInfoLocked: false,
			lockedResource: null,
			updateTimer: null,
			hoverClearTimer: null,
			lastSignature: '',
			assetCache: new Map(),
			missingBridgeAlerted: false,
			lineChartLastWheel: 0
		}

		api.on('afterVanillaScripts', function () {
			if (typeof Game === 'undefined' || !Game.prototype) return
			installStyles()
			installGlobalBridge()
			installControllerVisibilitySync()
		})

		api.on('afterGameInit', function (payload, game) {
			installStyles()
			state.game = game
			ensureController(game)
			syncControllerVisibility(game)
		})

		function installGlobalBridge() {
			if (window.__cattailResourceWatcherBridgeInstalled) return
			window.__cattailResourceWatcherBridgeInstalled = true
			window.addEventListener('keydown', function (event) {
				if (!state.active || event.key !== 'Escape') return
				event.preventDefault()
				event.stopPropagation()
				exitWatcher()
			}, true)
			window.addEventListener('beforeunload', function () {
				if (state.popupTools) state.popupTools.exit()
			})
		}

		function installControllerVisibilitySync() {
			if (window.__cattailResourceWatcherVisibilitySyncInstalled) return
			window.__cattailResourceWatcherVisibilitySyncInstalled = true
			window.addEventListener('modloader:vanilla-game-hud', function (event) {
				syncControllerVisibility(event.detail?.game || state.game)
			})
		}

		function syncControllerVisibility(game, controller = state.controller || game?.[watcherKey]) {
			const toggle = controller?.toggle || game?.[watcherKey]?.toggle
			if (!toggle) return
			const hidden = isControllerHidden(game)
			toggle.style.display = ''
			toggle.disabled = hidden
			toggle.setAttribute('aria-hidden', hidden ? 'true' : 'false')
			if (hidden && state.active) exitWatcher()
		}

		function isControllerHidden(game) {
			const loaderHidden = api.ui?.isVanillaGameHudHidden?.(game)
			if (typeof loaderHidden === 'boolean') return loaderHidden
			const shopToggle = game?.shop?.shopToggle
			let vanillaHidden = false
			try {
				vanillaHidden = !!shopToggle && getComputedStyle(shopToggle).display === 'none'
			} catch (error) {}
			return !!(game?.pinhole || game?.credits || vanillaHidden)
		}

		function ensureController(game) {
			if (!document.body) return null
			const current = game?.[watcherKey]
			if (current?.toggle?.isConnected) {
				state.controller = current
				syncControllerVisibility(game, current)
				return current
			}

			document.getElementById(toggleId)?.remove()
			const toggle = document.createElement('button')
			toggle.type = 'button'
			toggle.id = toggleId
			toggle.className = 'cattail-resource-watcher-toggle'
			toggle.title = 'Watch resources'
			toggle.setAttribute('aria-label', 'Watch resources')
			toggle.tabIndex = -1
			toggle.innerHTML = '<svg class="cattail-resource-watcher-toggle-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path class="cattail-resource-watcher-face-fill" d="M12.22 20.5 29.7 30.8Q32 32.18 32 34.94L32 55.18Q32 57.94 29.61 56.56L12.31 46.35Q9.92 44.97 9.92 42.21L9.92 21.79Q9.92 19.12 12.22 20.5Z"></path><path class="cattail-resource-watcher-outline" d="M34.3 30.8 51.78 20.5Q54.08 19.12 54.08 21.79L54.08 42.21Q54.08 44.97 51.69 46.35L34.39 56.56Q32 57.94 32 55.18L32 34.94Q32 32.18 34.3 30.8Z"></path><path class="cattail-resource-watcher-outline" d="M12.31 17.74 29.61 7.53Q32 6.06 34.39 7.53L51.69 17.74Q54.08 19.12 51.78 20.5L34.3 30.8Q32 32.18 29.7 30.8L12.22 20.5Q9.92 19.12 12.31 17.74Z"></path><path class="cattail-resource-watcher-mini-fill" d="M38.62 35.68 43.5 38.53Q44.7 39.27 44.7 40.65L44.7 46.9Q44.7 48.28 43.5 47.55L38.62 44.7Q37.52 44.05 37.52 42.67L37.52 36.42Q37.52 35.04 38.62 35.68Z"></path><path class="cattail-resource-watcher-outline cattail-resource-watcher-mini-outline" d="M45.89 37.98 51.14 34.94Q52.24 34.3 52.24 35.59L52.24 42.4Q52.24 43.78 51.04 44.42L45.8 47.55Q44.7 48.28 44.7 46.9L44.7 40.65Q44.7 38.72 45.89 37.98Z"></path><path class="cattail-resource-watcher-outline cattail-resource-watcher-mini-outline" d="M38.62 34.21 43.96 31.08Q45.06 30.44 46.26 31.08L51.04 33.93Q52.24 34.58 51.14 34.94L45.89 37.98Q44.7 38.72 43.5 38.07L38.62 35.22Q37.52 34.58 38.62 34.21Z"></path></svg>'
			const releaseDock = api.ui?.registerCornerButton({ id: 'resource-watcher', element: toggle, anchor: 'game-bottom-right', order: 20, hideOnMobile: true })
			if (!toggle.isConnected) document.body.append(toggle)

			const controller = { toggle, releaseDock }
			bindController(game, controller)
			game[watcherKey] = controller
			state.controller = controller
			syncControllerVisibility(game, controller)
			return controller
		}

		function bindController(game, controller) {
			const stop = function (event) {
				event.preventDefault()
				event.stopPropagation()
			}
			controller.toggle.addEventListener('mousedown', stop, true)
			controller.toggle.addEventListener('click', function (event) {
				stop(event)
				if (!isControllerHidden(game)) enterWatcher(game)
			}, true)
		}

		function enterWatcher(game) {
			if (!game || state.active || isControllerHidden(game)) return
			state.game = game
			state.active = true
			state.hoveredResource = null
			state.lastHoveredResource = null
			state.resourceInfoLocked = false
			state.lockedResource = null
			clearHoverClearTimer()
			state.lastSignature = ''
			game.removeHint?.()

			state.popupTools = createPopupTools()
			if (!state.popupTools) {
				state.active = false
				return
			}

			if (!state.popupTools.enter(game)) {
				state.active = false
				state.popupTools = null
				return
			}
			startPopupTimer(game)
			updatePopup(game, true)
		}

		function exitWatcher() {
			const game = state.game
			state.active = false
			state.hoveredResource = null
			state.lastHoveredResource = null
			state.resourceInfoLocked = false
			state.lockedResource = null
			clearHoverClearTimer()
			state.lastSignature = ''
			if (game) game.hoveredResource = false
			clearWatcherModifiers(game)
			game?.removeHint?.()
			stopPopupTimer()
			state.popupTools?.exit()
			state.popupTools = null
		}

		function clearWatcherModifiers(game) {
			if (game) game.altActive = false
			document.body.classList.remove('altHolded')
		}

		function startPopupTimer(game) {
			stopPopupTimer()
			state.updateTimer = setInterval(function () {
				if (!state.active) return
				updatePopup(game)
			}, updateMs)
		}

		function stopPopupTimer() {
			if (state.updateTimer) clearInterval(state.updateTimer)
			state.updateTimer = null
		}

		function clearHoverClearTimer() {
			if (state.hoverClearTimer) clearTimeout(state.hoverClearTimer)
			state.hoverClearTimer = null
		}

		function scheduleHoverClear(game) {
			if (state.resourceInfoLocked) {
				clearHoverClearTimer()
				state.hoveredResource = null
				if (game) game.hoveredResource = false
				updatePopup(game, true)
				return
			}
			if (!Number.isInteger(state.hoveredResource)) {
				if (game) game.hoveredResource = false
				updatePopup(game, true)
				return
			}
			if (state.hoverClearTimer) return
			const resourceId = state.hoveredResource
			state.hoverClearTimer = setTimeout(function () {
				state.hoverClearTimer = null
				if (!state.active || state.resourceInfoLocked || state.hoveredResource !== resourceId) return
				state.hoveredResource = null
				if (state.game) state.game.hoveredResource = false
				updatePopup(state.game, true)
			}, hoverClearDelayMs)
		}

		function updatePopup(game, force = false) {
			if (!state.active || !state.popupTools || !game) return
			const ids = getVisibleResourceIds(game)
			if (Number.isInteger(state.hoveredResource) && ids.indexOf(state.hoveredResource) === -1) state.hoveredResource = null
			if (Number.isInteger(state.lastHoveredResource) && ids.indexOf(state.lastHoveredResource) === -1) state.lastHoveredResource = null
			if (Number.isInteger(state.lockedResource) && ids.indexOf(state.lockedResource) === -1) {
				state.resourceInfoLocked = false
				state.lockedResource = null
			}
			const activeResource = getPopupResourceId(game, ids)
			const activeInfo = Number.isInteger(activeResource) ? buildResourceInfo(game, activeResource) : null
			const hasInfo = !!activeInfo
			const rows = ids.map(function (id) {
				return {
					id,
					name: getResourceName(game, id),
					amount: formatResourceAmount(game, id),
					pop: normalizeResourcePop(game, id),
					info: id === activeResource ? activeInfo : null
				}
			})
			const logicalSize = calculatePopupSize(rows.length, hasInfo, activeInfo?.height || 0)
			const windowSize = calculateWindowSize(logicalSize)
			const scale = normalizePopupScale(state.popupScale)
			const payload = {
				rows,
				activeResource,
				hoveredResource: state.hoveredResource,
				hasInfo,
				infoWidth,
				iconWidth,
				amountWidth,
				columnGap,
				rowHeight,
				rowGap,
				popupTopReserve,
				listWidth: calculateListWidth(true),
				compactWindowWidth: compactWidth + 16,
				scale,
				baseWidth: logicalSize.width,
				baseHeight: logicalSize.height,
				width: logicalSize.width,
				height: logicalSize.height
			}
			const signature = JSON.stringify(payload) + '|' + getSizeSignature(windowSize)
			if (!force && signature === state.lastSignature) return
			state.lastSignature = signature
			state.popupTools.send(payload, windowSize)
		}
		function getPopupResourceId(game, ids) {
			if (Number.isInteger(state.hoveredResource)) return state.hoveredResource
			const locked = getLockedResourceId(game)
			return Number.isInteger(locked) && ids.indexOf(locked) !== -1 ? locked : null
		}

		function getLockedResourceId(game) {
			if (!state.resourceInfoLocked) return null
			if (Number.isInteger(state.lastHoveredResource)) return state.lastHoveredResource
			return Number.isInteger(state.lockedResource) ? state.lockedResource : null
		}

		function isDynamicDetailsEnabled() {
			return !!api.state?.modById?.[dynamicDetailsModId]
		}

		function rememberWatcherResource(game, resourceId) {
			if (!Number.isInteger(resourceId)) return null
			state.lastHoveredResource = resourceId
			if (state.resourceInfoLocked) state.lockedResource = resourceId
			if (game) {
				game._cattailResourceWatcherLastResource = resourceId
				if (state.resourceInfoLocked && isDynamicDetailsEnabled()) {
					game[dynamicSourceLastResourceKey] = resourceId
					localStorage.setItem(dynamicSourceLastResourceStorageKey, String(resourceId))
				}
			}
			return resourceId
		}

		function getWatcherSelectedResourceId(game) {
			if (Number.isInteger(state.hoveredResource)) return rememberWatcherResource(game, state.hoveredResource)
			if (Number.isInteger(state.lastHoveredResource)) return state.lastHoveredResource
			return Number.isInteger(game?._cattailResourceWatcherLastResource) ? game._cattailResourceWatcherLastResource : null
		}

		function getVisibleResourceIds(game) {
			const resources = game?.resources || []
			const ids = []
			for (let i = 0; i < resources.length; i++) {
				if (Number(resources[i]) > 0) ids.push(i)
			}
			return ids
		}

		function normalizeResourcePop(game, id) {
			const pop = Math.max(0, Number(game?.resourcePops?.[id]) || 0)
			return Math.round(pop * 1000) / 1000
		}

		function getResourceName(game, id) {
			try {
				return game.pronounce?.('resources', id) || ('Resource ' + id)
			} catch (error) {
				return 'Resource ' + id
			}
		}

		function formatResourceAmount(game, id) {
			if (!game) return ''
			if (game.entitiesInGame?.pinhole > 0) {
				const t = performance.now()
				if (Math.sin(t / 834) * .6 + Math.sin(t / 27) * .4 > 0) return Math.random().toString(36).slice(2, 5)
				const dict = ['U/D', 'C/S', 'T/B', 'E/E', 'u/uu', 'T/uT', 'G/g', 'Z/W', 'H', 'L/uL']
				return dict[id] || '?'
			}
			const value = Number(game.resources?.[id]) || 0
			if (game.isMobile && typeof game.makeReadableFloor === 'function') return game.makeReadableFloor(value)
			if (typeof game.makeReadable === 'function') return game.makeReadable(value)
			return String(Math.floor(value))
		}

		function buildResourceInfo(game, resourceId) {
			const resource = game?.codex?.resources?.[resourceId]
			const hasRates = !!(game?.entitiesInGame?.mega1 > 0 || game?.entitiesInGame?.mega1a > 0 || game?.entitiesInGame?.mega1b > 0)
			const gain = hasRates ? Number(game.analytics?.average?.[resourceId]?.[0]) || 0 : null
			const consume = hasRates ? Math.abs(Number(game.analytics?.average?.[resourceId]?.[1]) || 0) : null
			const sourceSummary = buildSourceSummary(game, resourceId)
			const graph = buildResourceGraph(game, resourceId)
			return {
				id: resourceId,
				name: getResourceName(game, resourceId),
				color: resource?.triplet?.[2] || '#111',
				gainText: hasRates ? '+\u2009' + formatInfoNumber(game, gain) + '\u2009/\u2009s' : '',
				consumeText: hasRates ? '\u2212\u2009' + formatInfoNumber(game, consume) + '\u2009/\u2009s' : '',
				graph,
				sourceSummary,
				height: estimateInfoHeight(graph, sourceSummary)
			}
		}

		function estimateInfoHeight(graph, sourceSummary) {
			let height = 54
			if (graph) height += 158
			const sourceRows = Math.max(sourceSummary?.gain?.length || 0, sourceSummary?.consume?.length || 0)
			if (sourceRows) height += 14 + sourceRows * 28
			return height
		}

		function buildResourceGraph(game, resourceId) {
			if (!game?.entitiesInGame?.mega1b) return null
			const lineGraph = buildDynamicLineChartGraph(game, resourceId)
			if (lineGraph) return lineGraph
			const graph = game.analytics?.graphs?.[resourceId]
			const data = Array.isArray(graph?.data) ? graph.data : []
			if (!data.length) return null
			return {
				type: 'bar',
				data: data.map(function (point) { return [Number(point?.[0]) || 0, Number(point?.[1]) || 0] }),
				frame: [Number(game.analytics?.frame?.[resourceId]?.[0]) || 0, Number(game.analytics?.frame?.[resourceId]?.[1]) || 0],
				measuringFrame: Number(game.analytics?.measuringFrame) || 1,
				frameTimer: Number(game.analytics?.frameTimer) || 0,
				gainColor: '#6ea56e',
				consumeColor: '#C38C75'
			}
		}

		function buildDynamicLineChartGraph(game, resourceId) {
			if (!isDynamicLineChartActive(game)) return null
			const state = game?.[dynamicSourceLineChartStateKey]
			const buckets = Array.isArray(state?.buckets) ? state.buckets : []
			if (buckets.length < 2) return null
			const mapped = buckets.map(function (bucket) {
				return {
					duration: Math.max(0.001, Number(bucket?.duration) || 1),
					value: Math.max(0, Number(bucket?.values?.[resourceId]) || 0)
				}
			}).filter(function (bucket) { return Number.isFinite(bucket.duration) && Number.isFinite(bucket.value) })
			if (mapped.length < 2) return null
			const average = game?.analytics?.average?.[resourceId]
			const latest = Math.max(0, Number(game?.resources?.[resourceId]) || 0)
			return {
				type: 'line',
				resourceId,
				buckets: mapped,
				latest,
				latestText: formatInfoNumber(game, latest),
				average: Array.isArray(average) ? [Number(average[0]) || 0, Number(average[1]) || 0] : null,
				gainColor: '#6ea56e',
				consumeColor: '#C38C75'
			}
		}

		function isDynamicLineChartFeatureEnabled(game) {
			return !!(isDynamicDetailsEnabled() && game?.entitiesInGame?.mega1b && readStoredBooleanDefaultTrue(dynamicSourceDetailsConfigStorageKey) && readStoredBooleanDefaultTrue(dynamicSourceLineChartConfigStorageKey))
		}

		function isDynamicLineChartActive(game) {
			return !!(isDynamicLineChartFeatureEnabled(game) && readStoredBooleanDefaultTrue(dynamicSourceLineChartModeStorageKey))
		}

		function readStoredBooleanDefaultTrue(key) {
			try {
				const value = localStorage.getItem(key)
				if (value === '0' || value === 'false') return false
				if (value === '1' || value === 'true') return true
			} catch (error) {}
			return true
		}

		function buildSourceSummary(game, resourceId) {
			if (!isDynamicResourceInfoActive(game)) return null
			const dynamicState = game?.[dynamicSourceStateKey]
			if (!dynamicState || !Array.isArray(dynamicState.events)) return null
			const gain = aggregateResourceSourceGroups(game, dynamicState, resourceId, 'gain').slice(0, 6).map(function (group) { return makeSourceInfoRow(game, group, 'gain') })
			const consume = aggregateResourceSourceGroups(game, dynamicState, resourceId, 'consume').slice(0, 6).map(function (group) { return makeSourceInfoRow(game, group, 'consume') })
			if (!gain.length && !consume.length) return null
			return { gain, consume }
		}

		function isDynamicResourceInfoActive(game) {
			return !!(isDynamicDetailsEnabled() && game && (game.altActive || state.resourceInfoLocked || game[dynamicSourceToggleKey]))
		}

		function aggregateResourceSourceGroups(game, state, resourceId, type) {
			const now = performance.now()
			const windowMs = 30000
			const minRate = 0.0001
			const cutoff = now - windowMs
			const seconds = Math.max(1, Math.min(windowMs, now - (state.startedAt || now)) / 1000)
			const groups = new Map()
			for (const event of state.events) {
				if (!event || event.type !== type || Number(event.resourceId) !== resourceId || Number(event.time) < cutoff) continue
				const source = event.source || { kind: 'unknown', groupKey: 'unknown', instanceKey: 'unknown' }
				const key = source.groupKey || source.kind || 'unknown'
				let group = groups.get(key)
				if (!group) {
					group = { key, source, sources: new Map(), amount: 0, rate: 0, count: 0 }
					groups.set(key, group)
				}
				group.amount += Number(event.amount) || 0
				group.sources.set(source.instanceKey || key, source)
			}
			return Array.from(groups.values()).map(function (group) {
				group.rate = group.amount / seconds
				group.count = Math.max(1, group.sources.size || 0)
				return group
			}).filter(function (group) {
				return group.rate >= minRate
			}).sort(function (a, b) {
				return b.rate - a.rate
			})
		}

		function makeSourceInfoRow(game, group, type) {
			return {
				type,
				label: getSourceLabel(game, group.source),
				count: group.count,
				rate: formatInfoNumber(game, group.rate) + '/s',
				icon: getSourceIconDescriptor(game, group.source)
			}
		}

		function getSourceIconDescriptor(game, source) {
			if (source?.kind === 'resource') return { kind: 'resource', id: Number(source.resourceId) || 0 }
			if (source?.kind === 'entity' && source.name) {
				return { kind: 'entity', name: source.name, src: getAssetDataUrl('img/shop/' + source.name + '.jpg', 'image/jpeg') }
			}
			return { kind: 'unknown' }
		}

		function getSourceLabel(game, source) {
			if (source?.kind === 'resource') return getResourceName(game, Number(source.resourceId))
			if (source?.kind === 'entity' && source.name) {
				return safeCall(function () { return game.pronounce?.('entities', source.name, 'name') }, source.name) || source.name
			}
			return 'unknown'
		}

		function getAssetDataUrl(relativePath, mime) {
			if (state.assetCache.has(relativePath)) return state.assetCache.get(relativePath)
			try {
				const fs = require('fs')
				const { fileURLToPath } = require('url')
				const file = fileURLToPath(new URL(relativePath, location.href))
				const data = fs.readFileSync(file).toString('base64')
				const url = 'data:' + mime + ';base64,' + data
				state.assetCache.set(relativePath, url)
				return url
			} catch (error) {
				state.assetCache.set(relativePath, '')
				return ''
			}
		}

		function formatInfoNumber(game, value) {
			const number = Number(value) || 0
			const abs = Math.abs(number)
			if (typeof game?.makeReadable === 'function' && abs >= 1000) return game.makeReadable(abs)
			if (abs === 0) return '0'
			if (abs < 0.001) return abs.toExponential(2)
			if (abs < 1) return trimInfoNumber(abs, 3)
			if (abs < 1000) return trimInfoNumber(abs, abs < 10 ? 2 : 1)
			return String(Math.round(abs))
		}

		function trimInfoNumber(value, digits) {
			return Number(value.toFixed(digits)).toString()
		}

		function calculatePopupSize(rowCount, hasInfo, infoHeight = 0) {
			const width = calculateListWidth(true) + 16
			const safeRows = Math.max(1, rowCount)
			const listHeight = popupTopReserve + safeRows * rowHeight + Math.max(0, safeRows - 1) * rowGap + popupBottomReserve
			const infoFitHeight = hasInfo ? popupTopReserve + Math.max(80, infoHeight) + popupBottomReserve : minHeight
			const height = clamp(Math.max(listHeight, infoFitHeight), minHeight, maxHeight)
			return { width, height }
		}

		function calculateListWidth(hasInfo) {
			return compactWidth + (hasInfo ? infoWidth : 0)
		}

		function normalizePopupScale(value) {
			const number = Number(value)
			return clamp(Number.isFinite(number) && number > 0 ? number : 1, minPopupScale, maxPopupScale)
		}

		function scalePopupSize(size, scale = state.popupScale) {
			const safeScale = normalizePopupScale(scale)
			return {
				width: Math.max(minWindowWidth, Math.round((size?.width || minWindowWidth) * safeScale)),
				height: Math.max(minWindowHeight, Math.round((size?.height || minWindowHeight) * safeScale))
			}
		}

		function calculateWindowSize(logicalSize) {
			return scalePopupSize(logicalSize)
		}


		function createPopupTools() {
			if (!api.windows?.isAvailable?.()) {
				notifyMissingBridge()
				return null
			}

			let opened = false
			let handle = null
			let lastSizeSignature = ''
			return {
				enter(game) {
					const initialLogicalSize = calculatePopupSize(getVisibleResourceIds(game).length, false)
					const initialSize = calculateWindowSize(initialLogicalSize)
					lastSizeSignature = getSizeSignature(initialSize)
					handle = api.windows.open({
						id: 'resource-watcher',
						html: buildWatcherHtml(),
						size: initialSize,
						payload: null,
						hideParent: true,
						anchor: 'bottom-right',
						margin: 12,
						minWidth: minWindowWidth,
						minHeight: minWindowHeight,
						globalModifierKeys: true,
						on: {
							hover(event) {
								if (!state.active) return
								const raw = event.payload
				const currentRaw = raw && typeof raw === 'object' ? raw.current : raw
				const lastRaw = raw && typeof raw === 'object' ? raw.last : undefined
				const next = currentRaw === null || currentRaw === undefined || currentRaw === '' ? null : Number(currentRaw)
				const last = lastRaw === null || lastRaw === undefined || lastRaw === '' ? null : Number(lastRaw)
				const nextResource = Number.isInteger(next) ? next : null
				if (Number.isInteger(nextResource)) {
					clearHoverClearTimer()
					state.hoveredResource = nextResource
					rememberWatcherResource(state.game, state.hoveredResource)
					if (state.game) state.game.hoveredResource = state.hoveredResource
					updatePopup(state.game, true)
				} else {
					if (Number.isInteger(last)) rememberWatcherResource(state.game, last)
					scheduleHoverClear(state.game)
				}
							},
							back() {
								if (state.active) exitWatcher()
							},
							resizeScale(event) {
								if (!state.active) return
								const payload = event.payload || {}
								state.popupScale = normalizePopupScale(typeof payload === 'number' ? payload : payload.scale)
								state.lastSignature = ''
								updatePopup(state.game, true)
							},
							lineChartWheel(event) {
								if (state.active) handleLineChartWheel(event.payload)
							},
							lineGraphDebug(event) {
								if (state.active) logLineGraphDebug(event.payload)
							},


							key(event) {
								if (state.active) forwardWatcherKey(event.payload)
							},
							closed() {
								if (!state.active) return
								clearWatcherModifiers(state.game)
								state.active = false
								state.hoveredResource = null
								state.lastHoveredResource = null
								state.resourceInfoLocked = false
								clearHoverClearTimer()
								state.lockedResource = null
								state.popupTools = null
								stopPopupTimer()
							}
						}
					})
					opened = !!handle
					if (!opened) notifyMissingBridge()
					return opened
				},
				send(payload, size) {
					if (!opened || !handle) return
					const nextSizeSignature = getSizeSignature(size)
					const nextSize = nextSizeSignature !== lastSizeSignature ? size : undefined
					if (nextSize) lastSizeSignature = nextSizeSignature
					handle.update(payload, nextSize)
				},
				exit() {
					if (!opened || !handle) return
					opened = false
					handle.close()
					handle = null
				}
			}
		}
		function logLineGraphDebug(payload) {
			try {
				const data = payload && typeof payload === 'object' ? payload : { message: String(payload) }
				const reason = data.reason || data.phase || 'debug'
				console.info('[Resource Watcher][LineGraph] ' + reason + ' ' + JSON.stringify(data))
			} catch (error) {
				console.info('[Resource Watcher][LineGraph] debug', payload)
			}
		}

		function getSizeSignature(size) {
			return Math.round(size?.width || 0) + 'x' + Math.round(size?.height || 0)
		}

		function forwardWatcherKey(payload) {
			if (!payload || (payload.eventType !== 'keydown' && payload.eventType !== 'keyup')) return
			try {
				const game = state.game
				if (!game) return
				const keyCode = Number(payload.keyCode) || 0
				const pressed = payload.eventType === 'keydown'
				const previousResource = Number.isInteger(state.lockedResource) ? state.lockedResource : null
				const selectedResource = getWatcherSelectedResourceId(game)
				if (keyCode === 18) {
					game.altActive = pressed
					document.body.classList.toggle('altHolded', pressed)
				}
				const detailToggle = !!(
					pressed &&
					!payload.repeat &&
					payload.altKey &&
					payload.ctrlKey &&
					(keyCode === 17 || keyCode === 18) &&
					Number.isInteger(selectedResource)
				)
				if (detailToggle) {
					const active = !state.resourceInfoLocked || (Number.isInteger(selectedResource) && selectedResource !== previousResource)
					state.resourceInfoLocked = active
					state.lockedResource = active ? selectedResource : null
					if (isDynamicDetailsEnabled()) {
						game[dynamicSourceToggleKey] = active
						if (active) {
							game[dynamicSourceLastResourceKey] = selectedResource
							localStorage.setItem(dynamicSourceLastResourceStorageKey, String(selectedResource))
						}
						localStorage.setItem(dynamicSourceToggleStorageKey, active ? '1' : '0')
					}
					console.info('[Resource Watcher] resource lock', active ? 'enabled' : 'disabled', selectedResource)
				}
				updatePopup(game, true)
			} catch (error) {}
		}

		function handleLineChartWheel(payload) {
			const game = state.game
			const resourceId = Number(payload?.resource)
			const delta = Number(payload?.deltaY) || Number(payload?.deltaX) || 0
			if (!game || !Number.isInteger(resourceId) || !delta || !isDynamicLineChartFeatureEnabled(game)) return
			if (getVisibleResourceIds(game).indexOf(resourceId) === -1) return
			const now = performance.now()
			if (now - state.lineChartLastWheel < dynamicSourceLineChartWheelCooldownMs) return
			state.lineChartLastWheel = now
			clearHoverClearTimer()
			state.hoveredResource = resourceId
			rememberWatcherResource(game, resourceId)
			game.hoveredResource = resourceId
			const previous = readStoredBooleanDefaultTrue(dynamicSourceLineChartModeStorageKey)
			if (!dispatchDynamicLineChartWheel(delta, previous)) saveDynamicLineChartMode(!previous)
			state.lastSignature = ''
			updatePopup(game, true)
		}

		function dispatchDynamicLineChartWheel(delta, previous) {
			try {
				const event = new WheelEvent('wheel', { deltaY: delta || 1, bubbles: true, cancelable: true })
				window.dispatchEvent(event)
			} catch (error) {}
			return readStoredBooleanDefaultTrue(dynamicSourceLineChartModeStorageKey) !== previous
		}

		function saveDynamicLineChartMode(active) {
			try {
				localStorage.setItem(dynamicSourceLineChartModeStorageKey, active ? '1' : '0')
			} catch (error) {}
		}
		function buildMontserratFontCss() {
			const regular = getAssetDataUrl('font/Montserrat-Regular.woff2', 'font/woff2')
			const semibold = getAssetDataUrl('font/Montserrat-SemiBold.woff2', 'font/woff2')
			const bold = getAssetDataUrl('font/Montserrat-Bold.woff2', 'font/woff2')
			let css = ''
			if (regular) css += "@font-face{font-family:'Montserrat';src:url('" + regular + "') format('woff2');font-style:normal;font-weight:400;}\n"
			if (semibold) css += "@font-face{font-family:'Montserrat';src:url('" + semibold + "') format('woff2');font-style:normal;font-weight:600;}\n"
			if (bold) css += "@font-face{font-family:'Montserrat';src:url('" + bold + "') format('woff2');font-style:normal;font-weight:800;}\n"
			return css
		}

		function buildWatcherHtml() {
			const resourceSpriteUrl = getAssetDataUrl('img/resources.png', 'image/png') || new URL('img/resources.png', location.href).href
			const fontCss = buildMontserratFontCss()
			return `<!doctype html><html data-side="right"><head><meta charset="utf-8"><style>
${fontCss}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;font-family:Montserrat,Arial,sans-serif;-webkit-user-select:none;user-select:none;}
body{cursor:default;}
#root{position:fixed;inset:0;box-sizing:border-box;background:transparent;color:#111;overflow:visible;}
#surface{position:absolute;right:0;bottom:0;width:var(--base-width,222px);height:var(--base-height,118px);box-sizing:border-box;display:flex;align-items:flex-end;justify-content:flex-end;padding:var(--popup-top-reserve,86px) 8px 8px 8px;transform:scale(var(--watcher-scale,1));transform-origin:right bottom;overflow:visible;}
html[data-side="left"] #surface{left:0;right:auto;transform-origin:left bottom;}
#back,#resize,#move{appearance:none;-webkit-appearance:none;position:absolute;top:6px;height:22px;box-sizing:border-box;border:1px solid rgba(0,0,0,.14);border-radius:4px;background:rgba(190,190,190,.3);color:rgba(0,0,0,.74);font:600 12px/1 Montserrat,Arial,sans-serif;transform:translateY(-4px);opacity:0;pointer-events:none;cursor:pointer;transition:opacity .14s ease,transform .14s ease,background .14s ease;}#back{right:calc(8px + var(--amount-width,154px) + var(--column-gap,10px) - 16px);min-width:52px;text-transform:lowercase;}#resize{right:calc(8px + var(--amount-width,154px) + var(--column-gap,10px) - 50px);width:28px;padding:0;display:grid;place-items:center;cursor:nwse-resize;}#move{right:calc(8px + var(--amount-width,154px) + var(--column-gap,10px) - 84px);width:28px;padding:0;display:grid;place-items:center;cursor:move;}#resize svg,#move svg{width:15px;height:15px;display:block;stroke:#111;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;fill:none;}
html[data-side="left"] #back{left:calc(8px + var(--amount-width,154px) + var(--column-gap,10px) - 16px);right:auto;}html[data-side="left"] #resize{left:calc(8px + var(--amount-width,154px) + var(--column-gap,10px) - 50px);right:auto;}html[data-side="left"] #move{left:calc(8px + var(--amount-width,154px) + var(--column-gap,10px) - 84px);right:auto;}
#root:hover #back,#root:hover #resize,#root:hover #move,#root:focus-within #back,#root:focus-within #resize,#root:focus-within #move{opacity:1;pointer-events:auto;transform:translateY(0);}#back:hover,#resize:hover,#move:hover{background:rgba(190,190,190,.52);}#back:focus,#resize:focus,#move:focus{outline:none;}#resize.resizing,#move.moving{opacity:1;pointer-events:auto;transform:translateY(0);background:rgba(190,190,190,.58);}
#list{display:grid;gap:var(--row-gap,4px);justify-items:stretch;width:var(--list-width,206px);overflow:visible;}
.row{position:relative;display:grid;grid-template-columns:var(--info-width,0px) var(--icon-width,42px) var(--amount-width,154px);align-items:center;gap:var(--column-gap,10px);height:var(--row-height,44px);white-space:nowrap;overflow:visible;}.row>.info,.row>.icon,.row>.amount{grid-row:1;align-self:center;}
html[data-side="left"] .row{grid-template-columns:var(--amount-width,154px) var(--icon-width,42px) var(--info-width,0px);}
html[data-side="left"] .amount{grid-column:1;text-align:right;}html[data-side="left"] .icon{grid-column:2;}html[data-side="left"] .info{grid-column:3;}
.info{position:relative;display:block;width:100%;height:100%;pointer-events:none;overflow:visible;}
.infoPanel{position:absolute;right:0;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:flex-end;gap:7px;width:var(--info-width,430px);max-width:var(--info-width,430px);text-align:right;pointer-events:none;}
html[data-side="left"] .infoPanel{left:0;right:auto;align-items:flex-start;text-align:left;}html[data-side="left"] .rateStack{align-items:flex-start;}html[data-side="left"] .ratePill{text-align:left;}
.rateStack{display:flex;flex-direction:column;align-items:flex-end;gap:3px;}
.ratePill{display:block;max-width:var(--info-width,430px);box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;text-align:right;border-radius:3px;background:rgba(255,255,255,.95);padding:2px 7px;color:var(--line-color,#111);font:600 16px/1.15 Montserrat,Arial,sans-serif;box-shadow:0 1px 2px rgba(0,0,0,.06);}
.ratePill.rate{font-size:14px;}
.graphCanvas{display:block;width:360px;height:150px;border-radius:5px;background:rgba(255,255,255,.96);box-shadow:0 1px 3px rgba(0,0,0,.08);}
.sourcePanel{display:grid;grid-template-columns:minmax(0,1fr) 1px minmax(0,1fr);align-items:start;gap:8px;max-width:var(--info-width,430px);box-sizing:border-box;border-radius:5px;background:rgba(255,255,255,.95);padding:6px 7px;box-shadow:0 1px 3px rgba(0,0,0,.08);}
.sourceDivider{width:1px;align-self:stretch;background:rgba(0,0,0,.13);}
.sourceCol{display:grid;gap:4px;min-width:0;}
.sourceCol.gain{justify-items:start;text-align:left;}.sourceCol.consume{justify-items:end;text-align:right;}
.sourceRow{display:grid;grid-template-columns:22px auto auto;align-items:center;gap:5px;max-width:190px;color:var(--source-color,#555);font:600 12px/1.1 Montserrat,Arial,sans-serif;}
.sourceCol.consume .sourceRow{grid-template-columns:auto auto 22px;}
.sourceLabel{overflow:hidden;text-overflow:ellipsis;min-width:0;max-width:86px;}.sourceRate{white-space:nowrap;color:var(--source-color,#555);}.sourceCount{color:#99a;}
.sourceIcon{display:block;width:20px;height:20px;border-radius:3px;background:#f8f8f8 center/contain no-repeat;box-shadow:0 0 0 1px rgba(0,0,0,.08);}
.sourceIcon.resource{width:18px;height:20px;border-radius:0;background-image:url('${resourceSpriteUrl}');background-size:180px 20px;box-shadow:none;filter:drop-shadow(0 1px 1px rgba(255,255,255,.7));}
.icon{display:block;justify-self:center;width:36px;height:40px;background-image:url('${resourceSpriteUrl}');background-size:360px 40px;background-repeat:no-repeat;background-position:0 0;filter:drop-shadow(0 1px 2px rgba(255,255,255,.92)) drop-shadow(0 0 3px rgba(255,255,255,.72));transform-origin:center center;transition:transform .04s linear;}
.amount{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;text-align:left;color:#111;font:600 24px/1.05 Montserrat,Arial,sans-serif;text-rendering:geometricPrecision;text-shadow:0 1px 2px rgba(255,255,255,.92),0 -1px 2px rgba(255,255,255,.82),1px 0 2px rgba(255,255,255,.82),-1px 0 2px rgba(255,255,255,.82);}
</style></head><body><div id="root"><div id="surface"><button id="move" type="button" tabindex="-1" aria-label="move"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2v14"></path><path d="M6 5l3-3 3 3"></path><path d="M6 13l3 3 3-3"></path><path d="M2 9h14"></path><path d="M5 6L2 9l3 3"></path><path d="M13 6l3 3-3 3"></path></svg></button><button id="resize" type="button" tabindex="-1" aria-label="resize"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M7 3H3v4"></path><path d="M3 3l5 5"></path><path d="M11 15h4v-4"></path><path d="M15 15l-5-5"></path></svg></button><button id="back" type="button" tabindex="-1">back</button><div id="list"></div></div></div><script>
const {ipcRenderer}=require('electron');const root=document.getElementById('root');const surface=document.getElementById('surface');const list=document.getElementById('list');const back=document.getElementById('back');const resize=document.getElementById('resize');const move=document.getElementById('move');let latestState=null;let resizeDrag=null;let moveDrag=null;const lineGraphDebugBuild='format-v2';let lineGraphDebugLastScaleKey='';let lineGraphDebugLastScaleAt=0;const lineGraphDebugLastAnomalyAt={};
function send(message){try{ipcRenderer.send('modloader:window:message',{type:message&&message.type||'message',payload:message&&message.payload})}catch(error){}}
function normalizeScale(value){const number=Number(value);return Math.max(.5,Math.min(3,Number.isFinite(number)&&number>0?number:1))}
function normalizeSide(value){return value==='left'?'left':'right'}
function applySide(value){const side=normalizeSide(value);document.documentElement.dataset.side=side;if(latestState)latestState.side=side;return side}
function applyWindowShape(){if(!latestState)return;const scale=getScale();const width=Math.max(1,window.innerWidth);const height=Math.max(1,window.innerHeight);const compact=Math.min(width,Math.max(1,Math.round((Number(latestState.compactWindowWidth)||232)*scale)));const full=!!latestState.hasInfo;const left=document.documentElement.dataset.side==='left';const rect=full?{x:0,y:0,width,height}:{x:left?0:width-compact,y:0,width:compact,height};try{ipcRenderer.send('modloader:window:shape',{rects:[rect]})}catch(error){}}
function getScale(){return normalizeScale(latestState&&latestState.scale||getComputedStyle(document.documentElement).getPropertyValue('--watcher-scale'))}
function applyScale(value){const scale=normalizeScale(value);document.documentElement.style.setProperty('--watcher-scale',String(scale));if(latestState)latestState.scale=scale;return scale}
function getDesignSize(){return {width:Math.max(1,Number(latestState&&(latestState.baseWidth||latestState.width))||window.innerWidth),height:Math.max(1,Number(latestState&&(latestState.baseHeight||latestState.height))||window.innerHeight)}}
function getWindowPosition(event){const x=Number(window.screenX);const y=Number(window.screenY);return {x:Number.isFinite(x)?x:event.screenX-event.clientX,y:Number.isFinite(y)?y:event.screenY-event.clientY}}
function sendMoveBounds(bounds,snap){try{ipcRenderer.send('modloader:window:move',{bounds,snap:snap!==false,animate:snap!==false})}catch(error){}}
function startResize(event){event.preventDefault();event.stopPropagation();const design=getDesignSize();resizeDrag={x:event.screenX,y:event.screenY,w:window.innerWidth,h:window.innerHeight,designWidth:design.width,designHeight:design.height};resize.classList.add('resizing');try{resize.setPointerCapture(event.pointerId)}catch(error){}}
function moveResize(event){if(!resizeDrag)return;event.preventDefault();const rawWidth=Math.max(120,Math.round(resizeDrag.w-(event.screenX-resizeDrag.x)));const rawHeight=Math.max(80,Math.round(resizeDrag.h-(event.screenY-resizeDrag.y)));const useWidth=Math.abs(rawWidth-resizeDrag.w)>=Math.abs(rawHeight-resizeDrag.h);const scale=applyScale(useWidth?rawWidth/resizeDrag.designWidth:rawHeight/resizeDrag.designHeight);const width=Math.max(120,Math.round(resizeDrag.designWidth*scale));const height=Math.max(80,Math.round(resizeDrag.designHeight*scale));try{ipcRenderer.send('modloader:window:resize',{size:{width,height}})}catch(error){}send({type:'resizeScale',payload:{scale,width,height}})}
function endResize(event){if(!resizeDrag)return;resizeDrag=null;resize.classList.remove('resizing');try{resize.releasePointerCapture(event.pointerId)}catch(error){}}
function getMoveBounds(event){const screenX=Number(event&&event.screenX);const screenY=Number(event&&event.screenY);return {x:Math.round(moveDrag.winX+((Number.isFinite(screenX)?screenX:moveDrag.x)-moveDrag.x)),y:Math.round(moveDrag.winY+((Number.isFinite(screenY)?screenY:moveDrag.y)-moveDrag.y)),width:moveDrag.width,height:moveDrag.height}}
function startMove(event){event.preventDefault();event.stopPropagation();const pos=getWindowPosition(event);moveDrag={x:event.screenX,y:event.screenY,winX:pos.x,winY:pos.y,width:window.innerWidth,height:window.innerHeight,lastBounds:null};move.classList.add('moving');try{move.setPointerCapture(event.pointerId)}catch(error){}}
function moveWindow(event){if(!moveDrag)return;event.preventDefault();moveDrag.lastBounds=getMoveBounds(event);sendMoveBounds(moveDrag.lastBounds,false)}
function endMove(event){if(!moveDrag)return;event.preventDefault();const bounds=getMoveBounds(event);sendMoveBounds(bounds,true);moveDrag=null;move.classList.remove('moving');try{move.releasePointerCapture(event.pointerId)}catch(error){}}
let hoveredIconId=null;
let lastHoveredIconId=null;
let lastPointer={inside:false,x:0,y:0,screenX:null,screenY:null};
function getIconIdFromPoint(x,y){const icons=list.querySelectorAll('.row .icon');for(const icon of icons){const rect=icon.getBoundingClientRect();if(x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom){const row=icon.closest('.row');const id=row?Number(row.dataset.id):null;return Number.isInteger(id)?id:null}}return null}
function getLastPointerClient(){const sx=Number(lastPointer.screenX);const sy=Number(lastPointer.screenY);const wx=Number(window.screenX);const wy=Number(window.screenY);if(Number.isFinite(sx)&&Number.isFinite(sy)&&Number.isFinite(wx)&&Number.isFinite(wy))return {x:sx-wx,y:sy-wy};return {x:lastPointer.x,y:lastPointer.y}}
function setHoveredIcon(value,force){const next=Number.isInteger(value)?value:null;if(Number.isInteger(next))lastHoveredIconId=next;if(next===hoveredIconId&&!force)return;hoveredIconId=next;send({type:'hover',payload:{current:next,last:lastHoveredIconId}})}
function updateHoveredIcon(event){lastPointer={inside:true,x:event.clientX,y:event.clientY,screenX:event.screenX,screenY:event.screenY};const point=getLastPointerClient();setHoveredIcon(getIconIdFromPoint(point.x,point.y))}
function syncHoveredIconFromPoint(){if(!lastPointer.inside||!Number.isInteger(hoveredIconId))return;const point=getLastPointerClient();if(getIconIdFromPoint(point.x,point.y)!==hoveredIconId)setHoveredIcon(null,true)}
function onIconWheel(event){const id=getIconIdFromPoint(event.clientX,event.clientY);if(!Number.isInteger(id))return;event.preventDefault();event.stopPropagation();setHoveredIcon(id);send({type:'lineChartWheel',payload:{resource:id,deltaX:event.deltaX||0,deltaY:event.deltaY||0}})}
function rowHtml(row,hovered){const active=hovered===row.id&&row.info;const offset=-(Number(row.id)||0)*36;const pop=Math.max(0,Number(row.pop)||0);const scale=Number((1+pop*.35).toFixed(3));return '<div class="row '+(active?'hovered':'')+'" data-id="'+row.id+'" title="'+escapeHtml(row.name)+'"><span class="info">'+(active?safeInfoHtml(row.info):'')+'</span><span class="icon" style="background-position:'+offset+'px 0;transform:scale('+scale+')"></span><span class="amount">'+escapeHtml(row.amount)+'</span></div>'}
function infoHtml(info){let html='<span class="infoPanel"><span class="rateStack"><span class="ratePill name" style="--line-color:'+normalizeColor(info.color)+'">'+escapeHtml(info.name)+'</span>';if(info.gainText)html+='<span class="ratePill rate" style="--line-color:#6ea56e">'+escapeHtml(info.gainText)+'</span>';if(info.consumeText)html+='<span class="ratePill rate" style="--line-color:#C38C75">'+escapeHtml(info.consumeText)+'</span>';html+='</span>';if(info.graph)html+='<canvas class="graphCanvas"></canvas>';if(info.sourceSummary)html+=sourcePanelHtml(info.sourceSummary);return html+'</span>'}
function safeInfoHtml(info){try{return infoHtml(info)}catch(error){console.error('[Resource Watcher popup] info render failed',error);return ''}}
function sourcePanelHtml(summary){return '<span class="sourcePanel"><span class="sourceCol gain">'+sourceRowsHtml(summary.gain||[],'gain')+'</span><span class="sourceDivider"></span><span class="sourceCol consume">'+sourceRowsHtml(summary.consume||[],'consume')+'</span></span>'}
function sourceRowsHtml(rows,type){if(!rows.length)return '<span class="sourceRow empty"></span>';return rows.map(function(row){return sourceRowHtml(row,type)}).join('')}
function sourceRowHtml(row,type){const color=type==='consume'?'#7a2b2b':'#6ea56e';const icon=sourceIconHtml(row.icon);const count=row.count>1?'<span class="sourceCount">'+escapeHtml(row.count)+'</span>':'<span class="sourceCount"></span>';const rate='<span class="sourceRate">'+(type==='consume'?'\\u2212':'+')+escapeHtml(row.rate)+'</span>';return '<span class="sourceRow '+type+'" style="--source-color:'+color+'">'+(type==='consume'?rate+count+icon:icon+count+rate)+'</span>'}function sourceIconHtml(icon){if(icon&&icon.kind==='resource'){const offset=-(Number(icon.id)||0)*18;return '<span class="sourceIcon resource" style="background-position:'+offset+'px 0"></span>'}if(icon&&icon.kind==='entity'&&icon.src){return '<span class="sourceIcon" style="background-image:url('+escapeCssUrl(icon.src)+')"></span>'}return '<span class="sourceIcon"></span>'}
function drawGraphs(){if(!latestState)return;const row=list.querySelector('.row.hovered');if(!row)return;const id=Number(row.dataset.id);const dataRow=(latestState.rows||[]).find(function(item){return item.id===id});const canvas=row.querySelector('.graphCanvas');if(canvas&&dataRow&&dataRow.info&&dataRow.info.graph)drawGraph(canvas,dataRow.info.graph)}
function drawGraph(canvas,graph){if(graph&&graph.type==='line')return drawLineGraph(canvas,graph);return drawBarGraph(canvas,graph)}
function prepareGraphCanvas(canvas,cssW,cssH){const ratio=Math.max(1,(window.devicePixelRatio||1)*getScale());canvas.width=Math.round(cssW*ratio);canvas.height=Math.round(cssH*ratio);const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,cssW,cssH);roundRect(ctx,0,0,cssW,cssH,5);ctx.fillStyle='rgba(255,255,255,.96)';ctx.fill();return ctx}
function drawBarGraph(canvas,graph){const cssW=360,cssH=150;const ctx=prepareGraphCanvas(canvas,cssW,cssH);const data=graph.data||[];const labelW=78;const shortW=cssW-labelW-16;const h=cssH/2;const dx=Math.max(1,Math.floor(shortW/Math.max(1,data.length+1)));const graphW=dx*(data.length+1);let max=0;for(const p of data){max=Math.max(max,Number(p[0])||0,Math.abs(Number(p[1])||0))}const frameMs=Math.max(1,(Number(graph.measuringFrame)||1)-(Number(graph.frameTimer)||0));const lastPlus=(Number(graph.frame&&graph.frame[0])||0)/frameMs*1000;const lastMinus=Math.abs((Number(graph.frame&&graph.frame[1])||0)/frameMs*1000);max=Math.max(max,lastPlus,lastMinus);if(max<=0)max=1;const order=String(Math.floor(max)).length;const delta=Math.pow(10,Math.max(0,order-1));max=delta*(Math.floor(max/delta)+1);for(let j=0;j<data.length;j++)drawGraphBar(ctx,j*dx,h,dx,data[j][0],data[j][1],max,graph.gainColor,graph.consumeColor);drawGraphBar(ctx,data.length*dx,h,dx,lastPlus,-lastMinus,max,graph.gainColor,graph.consumeColor);ctx.font='10px Montserrat,Arial,sans-serif';ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillStyle='#111';const firstDigit=Number(String(max)[0])||1;const sparse=firstDigit<2||firstDigit>5;for(let v=delta-max;v<max;v+=delta){const digit=Number(String(Math.abs(v))[0])||0;if(sparse&&(digit%2))continue;const y=h-(v/max)*h;ctx.globalAlpha=.12;ctx.fillRect(0,y,graphW,1);ctx.globalAlpha=1;ctx.fillText(formatGraphNumber(v)+'\u2009/\u2009s',graphW+8,y)}}
function drawLineGraph(canvas,graph){const cssW=360,cssH=150;const buckets=Array.isArray(graph.buckets)?graph.buckets:[];const ctx=prepareGraphCanvas(canvas,cssW,cssH);if(!buckets.length)return;const padding=16;const halfHeight=cssH/2;const fontSize=Math.max(7,halfHeight*.12);const plotLeft=Math.max(5,padding*.35);const plotRight=cssW-padding*3.1;const plotTop=Math.max(5,padding*.28);const plotBottom=cssH-padding*1.35;const plotWidth=Math.max(1,plotRight-plotLeft);const plotHeight=Math.max(1,plotBottom-plotTop);const totalDuration=Math.max(.001,buckets.reduce(function(total,bucket){return total+(Number(bucket.duration)||0)},0));const scale=getLineGraphScale(graph,buckets);debugLineGraphScale(graph,scale,totalDuration,buckets);ctx.font=fontSize+'px Montserrat,Arial,sans-serif';drawLineGraphGrid(ctx,plotLeft,plotRight,plotTop,plotBottom,plotWidth,plotHeight,scale,totalDuration,graph);drawLineGraphPath(ctx,buckets,graph,scale,totalDuration,plotLeft,plotBottom,plotWidth,plotHeight)}
function drawLineGraphGrid(ctx,plotLeft,plotRight,plotTop,plotBottom,plotWidth,plotHeight,scale,totalDuration,graph){ctx.fillStyle='#000';ctx.globalAlpha=.16;ctx.fillRect(plotLeft,plotBottom,plotWidth,1);ctx.fillRect(plotRight,plotTop,1,plotHeight);const firstOffset=Math.ceil((scale.min-scale.baseline)/scale.delta)*scale.delta;const lastOffset=Math.floor((scale.max-scale.baseline)/scale.delta)*scale.delta;const tickCount=Math.max(0,Math.floor((lastOffset-firstOffset)/scale.delta)+1);const skip=Math.max(1,Math.ceil(tickCount/7));let tickIndex=0;for(let offset=firstOffset;offset<=lastOffset;offset+=scale.delta){const shouldDraw=Math.abs(offset)<.5||tickIndex%skip===0;tickIndex++;if(!shouldDraw)continue;const value=scale.baseline+offset;const py=plotBottom-Math.max(0,Math.min(1,(value-scale.min)/scale.span))*plotHeight;ctx.globalAlpha=Math.abs(offset)<.5 ? .16 : .1;ctx.fillRect(plotLeft,py,plotWidth,1);ctx.globalAlpha=1;ctx.textAlign='left';ctx.textBaseline='middle';const rawLabel=formatLineGraphDelta(offset,scale.labelUnit,scale.baseline,graph);const label=normalizeLineGraphLabel(rawLabel,offset);debugLineGraphTick(graph,scale,offset,value,rawLabel,label);ctx.fillText(label,plotRight+4,py)}for(const age of getLineGraphTimeTicks(totalDuration)){const px=getLineGraphTimeXFromAge(age,totalDuration,plotLeft,plotWidth);ctx.globalAlpha=age>0&&age<totalDuration ? .1 : .16;ctx.fillRect(px,plotTop,1,plotHeight);ctx.globalAlpha=1;ctx.textAlign='center';ctx.textBaseline='top';ctx.fillText(formatLineGraphDuration(age),px,plotBottom+3)}ctx.globalAlpha=1}
function drawLineGraphPath(ctx,buckets,graph,scale,totalDuration,plotLeft,plotBottom,plotWidth,plotHeight){if(!buckets.length||!scale||scale.span<=0)return;const points=[];let elapsed=0;for(const bucket of buckets){const duration=Math.max(.001,Number(bucket.duration)||1);const value=Math.max(0,Number(bucket.value)||0);const px=getLineGraphTimeXFromElapsed(elapsed+duration/2,totalDuration,plotLeft,plotWidth);const py=plotBottom-Math.max(0,Math.min(1,(value-scale.min)/scale.span))*plotHeight;points.push({x:px,y:py,value});elapsed+=duration}if(points.length<2)return;ctx.save();ctx.lineWidth=1.35;ctx.lineJoin='round';ctx.lineCap='round';for(let i=1;i<points.length;i++){const previous=points[i-1];const current=points[i];ctx.strokeStyle=current.value>=previous.value?(graph.gainColor||'#6ea56e'):(graph.consumeColor||'#C38C75');ctx.beginPath();ctx.moveTo(previous.x,previous.y);ctx.lineTo(current.x,current.y);ctx.stroke()}ctx.restore()}
function getLineGraphTimeTicks(totalDuration){return [totalDuration,totalDuration*2/3,totalDuration/3,totalDuration/6,0]}
function getLineGraphTimeXFromAge(age,totalDuration,plotLeft,plotWidth){return getLineGraphTimeXFromElapsed(totalDuration-age,totalDuration,plotLeft,plotWidth)}
function getLineGraphTimeXFromElapsed(elapsed,totalDuration,plotLeft,plotWidth){const ratio=getLineGraphTimeRatio(elapsed,totalDuration);return plotLeft+ratio*plotWidth}
function getLineGraphTimeRatio(elapsed,totalDuration){const total=Math.max(.001,Number(totalDuration)||0);const normalized=Math.max(0,Math.min(1,(Number(elapsed)||0)/total));if(normalized<=2/3)return normalized/2;return 2*normalized-1}
function getLineGraphScale(graph,buckets){const latest=getLineGraphLatestValue(graph,buckets);const recentRange=getLineGraphRecentRange(buckets,latest);const speedSpan=getLineGraphRateMagnitude(graph,buckets);const lowerDeviation=Math.max(0,latest-recentRange.min);const upperDeviation=Math.max(0,recentRange.max-latest);const visibleHalfSpan=Math.max(lowerDeviation,upperDeviation,speedSpan*5,.5);const rounded=getLineGraphRoundedSpan(Math.max(1,visibleHalfSpan*2));const labelUnit=getLineGraphLabelUnit(speedSpan||rounded.delta);const halfSpan=rounded.max/2;let minValue=latest-halfSpan;let maxValue=latest+halfSpan;if(minValue<0){maxValue-=minValue;minValue=0}const span=Math.max(1,maxValue-minValue);return {min:minValue,max:maxValue,span,delta:rounded.delta,baseline:latest,labelUnit}}
function getLineGraphLatestValue(graph,buckets){for(let i=buckets.length-1;i>=0;i--){const value=Number(buckets[i]&&buckets[i].value);if(Number.isFinite(value))return Math.max(0,value)}return Math.max(0,Number(graph&&graph.latest)||0)}
function getLineGraphRecentRange(buckets,fallbackValue){const recentWindowSeconds=30;const fallback=Math.max(0,Number(fallbackValue)||0);let min=Infinity;let max=-Infinity;let elapsed=0;let sampled=false;for(let i=buckets.length-1;i>=0;i--){const bucket=buckets[i];const duration=Math.max(.001,Number(bucket&&bucket.duration)||1);if(duration>1&&sampled)break;if(duration>1&&!sampled)continue;const value=Number(bucket&&bucket.value);if(Number.isFinite(value)){const amount=Math.max(0,value);min=Math.min(min,amount);max=Math.max(max,amount);sampled=true}elapsed+=duration;if(elapsed>=recentWindowSeconds&&sampled)break}if(!Number.isFinite(min)||!Number.isFinite(max))return {min:fallback,max:fallback};return {min,max}}
function getLineGraphRoundedSpan(span){const safe=Math.max(1,Number(span)||0);const order=Math.max(1,String(Math.floor(safe)).length);const delta=Math.pow(10,order-1);return {max:delta*(Math.floor(safe/delta)+1),delta}}
function getLineGraphRateMagnitude(graph,buckets){const average=graph&&graph.average;let speed=0;if(Array.isArray(average)){speed=Math.max(speed,Math.abs(Number(average[0])||0),Math.abs(Number(average[1])||0));if(speed>0)return speed}let previous=null;for(const bucket of buckets){const duration=Math.max(.001,Number(bucket&&bucket.duration)||1);const value=Math.max(0,Number(bucket&&bucket.value)||0);if(previous&&duration<=1&&previous.duration<=1){const seconds=Math.max(.001,duration);speed=Math.max(speed,Math.abs(value-previous.value)/seconds)}previous={value,duration}}return speed}
function getLineGraphLabelUnit(value){const amount=Math.abs(Number(value)||0);if(amount>=1e15)return {value:1e15,suffix:'q'};if(amount>=1e12)return {value:1e12,suffix:'t'};if(amount>=1e9)return {value:1e9,suffix:'b'};if(amount>=1e6)return {value:1e6,suffix:'m'};if(amount>=1e3)return {value:1e3,suffix:'k'};return {value:1,suffix:''}}
function formatLineGraphAmount(value,unit){const amount=Math.abs(Number(value)||0);if(unit&&unit.value>1&&amount>=unit.value)return formatLineGraphAmountInUnit(amount,unit);return formatLineGraphReadable(amount)}
function formatLineGraphAmountInUnit(value,unit){const divisor=Math.abs(Number(unit&&unit.value)||1);const scaled=Math.abs(Number(value)||0)/divisor;const rounded=scaled>=100?Math.round(scaled):scaled>=10?Math.round(scaled*10)/10:Math.round(scaled*100)/100;return trimLineGraphAmountText(rounded)+(unit&&unit.suffix||'')}
function trimLineGraphAmountText(value){const number=Number(value);if(!Number.isFinite(number))return '0';let text=String(number);if(text.indexOf('.')===-1)return text;while(text.endsWith('0'))text=text.slice(0,-1);if(text.endsWith('.'))text=text.slice(0,-1);return text||'0'}
function isZeroUnitLabel(value){return /^0(?:\.0+)?[a-z]?$/.test(String(value||''))}
function formatLineGraphReadable(value){const amount=Math.abs(Number(value)||0);const unit=getLineGraphLabelUnit(amount);if(unit.value>1)return formatLineGraphAmountInUnit(amount,unit);return String(Math.round(amount))}
function formatLineGraphDelta(value,unit,baseline,graph){if(Math.abs(value)<.5)return graph&&graph.latestText?String(graph.latestText):formatLineGraphReadable(Math.max(0,Number(baseline)||0));const sign=value>0?'+':'-';return sign+formatLineGraphAmount(Math.abs(value),unit)}
function normalizeLineGraphLabel(label,value){const text=String(label==null?'':label);const match=text.trim().match(/^([+\-\u2212])\s*0(?:[.,]0+)?[kmbtq]$/i);if(!match)return text;const sign=match[1]==='+'?'+':'-';return sign+formatLineGraphReadable(Math.abs(Number(value)||0))}
function debugLineGraphScale(graph,scale,totalDuration,buckets){const now=Date.now();const resourceId=Number.isInteger(graph&&graph.resourceId)?graph.resourceId:null;const key=[resourceId,scale&&scale.baseline,scale&&scale.delta,scale&&scale.labelUnit&&scale.labelUnit.suffix,buckets.length].join('|');if(key===lineGraphDebugLastScaleKey&&now-lineGraphDebugLastScaleAt<1500)return;lineGraphDebugLastScaleKey=key;lineGraphDebugLastScaleAt=now;sendLineGraphDebug({phase:'scale',debugBuild:lineGraphDebugBuild,resourceId,bucketCount:buckets.length,totalDuration:roundLineGraphDebugNumber(totalDuration),latest:roundLineGraphDebugNumber(graph&&graph.latest),latestText:graph&&graph.latestText,average:graph&&graph.average,min:roundLineGraphDebugNumber(scale&&scale.min),max:roundLineGraphDebugNumber(scale&&scale.max),span:roundLineGraphDebugNumber(scale&&scale.span),delta:roundLineGraphDebugNumber(scale&&scale.delta),baseline:roundLineGraphDebugNumber(scale&&scale.baseline),labelUnit:lineGraphDebugUnit(scale&&scale.labelUnit)})}
function debugLineGraphTick(graph,scale,offset,value,rawLabel,label){const rawZero=isLineGraphZeroUnitDebugLabel(rawLabel);const finalZero=isLineGraphZeroUnitDebugLabel(label);if(!rawZero&&!finalZero)return;const now=Date.now();const resourceId=Number.isInteger(graph&&graph.resourceId)?graph.resourceId:null;const key=[resourceId,offset,rawLabel,label].join('|');if(now-(lineGraphDebugLastAnomalyAt[key]||0)<1000)return;lineGraphDebugLastAnomalyAt[key]=now;sendLineGraphDebug({reason:finalZero?'final-zero-unit':'raw-zero-unit',debugBuild:lineGraphDebugBuild,resourceId,offset:roundLineGraphDebugNumber(offset),absOffset:roundLineGraphDebugNumber(Math.abs(Number(offset)||0)),value:roundLineGraphDebugNumber(value),rawLabel:String(rawLabel),finalLabel:String(label),formatAmount:formatLineGraphAmount(Math.abs(Number(offset)||0),scale&&scale.labelUnit),readableAmount:formatLineGraphReadable(Math.abs(Number(offset)||0)),baseline:roundLineGraphDebugNumber(scale&&scale.baseline),min:roundLineGraphDebugNumber(scale&&scale.min),max:roundLineGraphDebugNumber(scale&&scale.max),delta:roundLineGraphDebugNumber(scale&&scale.delta),labelUnit:lineGraphDebugUnit(scale&&scale.labelUnit),latestText:graph&&graph.latestText,average:graph&&graph.average})}
function isLineGraphZeroUnitDebugLabel(label){return /^([+\-\u2212])\s*0(?:[.,]0+)?[kmbtq]$/i.test(String(label==null?'':label).trim())}
function sendLineGraphDebug(payload){try{send({type:'lineGraphDebug',payload})}catch(error){}}
function roundLineGraphDebugNumber(value){const number=Number(value);if(!Number.isFinite(number))return null;if(Math.abs(number)>=1000)return Number(number.toFixed(2));return Number(number.toFixed(6))}
function lineGraphDebugUnit(unit){return unit?{value:unit.value,suffix:unit.suffix}:null}
function formatLineGraphDuration(seconds){const value=Math.max(0,Number(seconds)||0);if(value<=0)return '0ms';if(value<1)return Math.max(1,Math.round(value*1000))+'ms';if(value<60)return Math.round(value)+'s';if(value<3600)return Math.round(value/60)+'m';const hours=value/3600;return (hours>=10?Math.round(hours):Math.round(hours*10)/10)+'h'}
function drawGraphBar(ctx,x,mid,dx,gain,consume,max,gainColor,consumeColor){const plus=Math.max(0,Number(gain)||0);const minus=Math.max(0,Math.abs(Number(consume)||0));const hp=Math.floor(plus/max*mid);const hm=Math.floor(minus/max*mid);ctx.globalAlpha=.42;ctx.fillStyle=consumeColor||'#C38C75';ctx.fillRect(x,mid,dx,hm);ctx.fillStyle=gainColor||'#6ea56e';ctx.fillRect(x,mid-hp,dx,hp);ctx.globalAlpha=1;ctx.fillStyle=consumeColor||'#C38C75';ctx.fillRect(x,mid+hm,Math.max(1,dx-1),1);ctx.fillStyle=gainColor||'#6ea56e';ctx.fillRect(x,mid-hp,Math.max(1,dx-1),1)}
function roundRect(ctx,x,y,w,h,r){if(ctx.roundRect){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.closePath();return}ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath()}
function formatGraphNumber(value){const n=Number(value)||0;const sign=n<0?'\u2212':'';const abs=Math.abs(n);if(abs<1e4)return sign+Math.floor(abs);if(abs<1e6)return sign+Number((Math.floor(abs/10)/100).toFixed(2)).toString()+'\u2009K';if(abs<1e9)return sign+Number((Math.floor(abs/10000)/100).toFixed(2)).toString()+'\u2009M';if(abs<1e12)return sign+Number((Math.floor(abs/10000000)/100).toFixed(2)).toString()+'\u2009B';if(abs<1e15)return sign+Number((Math.floor(abs/10000000000)/100).toFixed(2)).toString()+'\u2009T';if(abs<1e18)return sign+Number((Math.floor(abs/10000000000000)/100).toFixed(2)).toString()+'\u2009Q';return 'A lot'}
function normalizeColor(value){const color=String(value||'#111');return /^#[0-9a-fA-F]{3,8}$/.test(color)?color:'#111'}
function escapeCssUrl(value){return String(value||'').replace(/[)\\"']/g,'')}
function escapeHtml(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function escapeAttr(value){return escapeHtml(value)}
function px(name,value){document.documentElement.style.setProperty(name,(value||0)+'px')}
function placeInfoPanel(){const panel=list.querySelector('.row.hovered .infoPanel');if(!panel)return;const row=panel.closest('.row');panel.style.transform='none';const scale=getScale();const surfaceRect=surface.getBoundingClientRect();const rowRect=row.getBoundingClientRect();const panelRect=panel.getBoundingClientRect();let top=rowRect.top+rowRect.height/2-panelRect.height/2;top=Math.max(surfaceRect.top+30*scale,Math.min(top,surfaceRect.bottom-panelRect.height-4*scale));panel.style.top=((top-rowRect.top)/scale)+'px';drawGraphs()}
window.cattailResourceWatcherSetState=function(state){latestState=state||{};try{applyScale(latestState.scale||1);px('--base-width',latestState.baseWidth||latestState.width||206);px('--base-height',latestState.baseHeight||latestState.height||118);px('--popup-top-reserve',latestState.popupTopReserve||86);px('--list-width',latestState.listWidth||206);px('--info-width',latestState.infoWidth||0);px('--icon-width',latestState.iconWidth||42);px('--amount-width',latestState.amountWidth||154);px('--column-gap',latestState.columnGap||10);px('--row-height',latestState.rowHeight||44);px('--row-gap',latestState.rowGap||4);const activeResource=Number.isInteger(latestState.activeResource)?latestState.activeResource:latestState.hoveredResource;list.innerHTML=(latestState.rows||[]).map(function(row){return rowHtml(row,activeResource)}).join('')||'<div class="row"><span class="info"></span><span class="icon"></span><span class="amount">0</span></div>';requestAnimationFrame(function(){syncHoveredIconFromPoint();applyWindowShape();placeInfoPanel()})}catch(error){console.error('[Resource Watcher popup] state render failed',error);try{list.innerHTML=(latestState.rows||[]).map(function(row){const offset=-(Number(row.id)||0)*36;return '<div class="row" data-id="'+row.id+'"><span class="info"></span><span class="icon" style="background-position:'+offset+'px 0"></span><span class="amount">'+escapeHtml(row.amount)+'</span></div>'}).join('')}catch(fallbackError){}}};ipcRenderer.on('modloader:window:update',function(event,state){window.cattailResourceWatcherSetState(state)});ipcRenderer.on('modloader:window:geometry',function(event,geometry){if(geometry&&geometry.side){applySide(geometry.side);applyWindowShape()}});
document.addEventListener('pointermove',updateHoveredIcon,true);document.addEventListener('pointerover',updateHoveredIcon,true);document.addEventListener('wheel',onIconWheel,{capture:true,passive:false});root.addEventListener('pointerleave',function(){lastPointer.inside=false;setHoveredIcon(null,true)},true);back.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();send({type:'back'})},true);resize.addEventListener('pointerdown',startResize,true);resize.addEventListener('pointermove',moveResize,true);resize.addEventListener('pointerup',endResize,true);resize.addEventListener('pointercancel',endResize,true);move.addEventListener('pointerdown',startMove,true);move.addEventListener('pointermove',moveWindow,true);move.addEventListener('pointerup',endMove,true);move.addEventListener('pointercancel',endMove,true);document.addEventListener('keydown',function(event){if(event.key==='Escape')send({type:'back'})},true);
</script></body></html>`
		}
		function safeCall(fn, fallback) {
			try {
				const value = fn()
				return value === undefined ? fallback : value
			} catch (error) {
				return fallback
			}
		}

		function clamp(value, min, max) {
			return Math.max(min, Math.min(max, value))
		}

		function installStyles() {
			if (document.getElementById(styleId)) return
			const style = document.createElement('style')
			style.id = styleId
			style.textContent = `
.cattail-resource-watcher-toggle {
	appearance: none;
	-webkit-appearance: none;
	position: absolute;
	right: calc(var(--unit) * .5);
	bottom: calc(var(--unit) * 3.35);
	z-index: 1;
	width: calc(var(--unit) * 2.5);
	height: calc(var(--unit) * 2.5);
	margin: 0;
	padding: 0;
	border: 0;
	border-radius: 50%;
	background: #fff;
	box-shadow: 0 4px 8px #0001;
	cursor: pointer;
	transition: box-shadow .18s ease, transform .1s ease;
}
.cattail-resource-watcher-toggle:hover { box-shadow: 0 5px 10px #0002; }
.cattail-resource-watcher-toggle:active { transform: scale(.94); }
.cattail-resource-watcher-toggle:focus,
.cattail-resource-watcher-toggle:focus-visible { outline: none; }
.cattail-resource-watcher-toggle-icon {
	position: absolute;
	left: 13%;
	top: 11%;
	width: 78%;
	height: 80%;
	display: block;
	overflow: visible;
	pointer-events: none;
}
.cattail-resource-watcher-toggle-icon path { shape-rendering: geometricPrecision; }
.cattail-resource-watcher-face-fill {
	fill: #111;
	stroke: #111;
	stroke-width: 3.85;
	stroke-linecap: round;
	stroke-linejoin: round;
}
.cattail-resource-watcher-outline {
	fill: none;
	stroke: #111;
	stroke-width: 3.85;
	stroke-linecap: round;
	stroke-linejoin: round;
}
.cattail-resource-watcher-mini-fill,
.cattail-resource-watcher-mini-outline {
	stroke-width: 1.925;
}
.cattail-resource-watcher-mini-fill {
	fill: #111;
	stroke: #111;
	stroke-linecap: round;
	stroke-linejoin: round;
}
.mobile .cattail-resource-watcher-toggle { display: none !important; }
`
			document.head.append(style)
		}
	}
})
