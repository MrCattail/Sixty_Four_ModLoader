(function () {
	'use strict'

	const state = {
		version: '0.1.4',
		booted: false,
		mods: [],
		modById: {},
		hooks: {},
		entityPatches: {},
		dataPatches: [],
		wordPatches: [],
		languages: [],
		log: [],
		orphanEntities: [],
		enabledConfig: { mods: [] },
		enabledEntries: [],
		issues: [],
		configs: {},
		assetReplacements: {},
		sounds: {},
		music: {},
		statusLogoIndex: -1,
		statusLogoTimer: null,
		statusDragging: false,
		modFileTools: undefined,
		translationCatalog: null,
		translationCatalogMtimeMs: -1,
		translationCatalogWatcher: null,
		translationCatalogWatchTimer: null,
		translationCatalogReadFailed: false,
		game: null,
		languagePatched: false,
		panelMessage: '',
		panelPosition: null,
		panelHidden: false,
		panelHiddenSide: 'right',
		panelTabPosition: null,
		panelTabPositions: { left: null, right: null, top: null, bottom: null },
		panelPreferredHideEdge: null,
		panelModOrder: [],
		panelConfigSectionOrder: {},
		panelSettings: { theme: 'dark', hideMode: 'auto', autoHideSeconds: 3, hideMenuDetails: false, hideModFileDetails: false, sortConfigSections: true, renderApiEnabled: true },
		panelSettingsOpen: false,
		panelStateLoaded: false,
		panelAutoHideTimer: null,
		uiButtons: {},
		uiDocks: {},
		uiProceduralIconRenderers: {},
		gameHudHidden: false,
		gameHudSnapshot: null,
		gameHudItems: {},
		gameHudInstalled: false,
		gameHudRenderPatched: false,
		gameHudAnimation: null,
		vanillaGameHudHidden: false,
		vanillaGameHudSyncInstalled: false,
		renderLayerManager: null,
		renderLayerDefinitions: {},
		renderLayerDefinitionOwners: {},
		renderLayerDefinitionRegistrations: {},
		renderCallbacks: {},
		renderEventListeners: { ready: [], frameStart: [], frame: [] },
		renderLayerDemandCallbacks: {},
		renderPatchedMethods: {},
		renderMethodRouteOwners: {},
		renderMethodRouteRegistrations: {},
		renderConflicts: [],
		renderConflictSerial: 1,
		renderLayerDemands: {},
		renderActiveLayerDemands: {},
		renderLastActiveLayerDemands: {},
		renderLayerDirtyMarks: {},
		renderLayerFrameState: {},
		renderCallbackSerial: 1,
		renderLayerDemandSerial: 1,
		renderFrame: 0,
		renderInstalled: false,
		renderTouchModeOverlayStyle: 'gradient',
		renderTimingEnabled: false,
		renderTimingEntitiesEnabled: false,
		renderTimingVfxEnabled: false,
		renderTimingSampleLimit: 240,
		renderTimingFrame: 0,
		renderTimingRecords: {},
		renderTimingEntityRecords: {},
		renderTimingContextStack: [],
		renderTimingEntityDepth: 0,
		renderTimingEntityDetailMethods: [],
		renderTimingPatchedEntityMethods: [],
		renderTimingEntityPrototypeMarks: null
	}

	const addIssue = function (level, code, message, details) {
		state.issues.push({ level, code, message, details })
	}

	const warn = function (...args) {
		console.warn('[ModLoader]', ...args)
		state.log.push({ level: 'warn', args })
	}

	const info = function (...args) {
		console.log('[ModLoader]', ...args)
		state.log.push({ level: 'info', args })
	}

	const ensureStatusStyle = function () {
		if (document.getElementById('modloader-status-style')) return
		const style = document.createElement('style')
		style.id = 'modloader-status-style'
		style.textContent = `
			#modloader-status { position: fixed; left: 10px; bottom: 10px; z-index: 2147483647; display: inline-flex; align-items: center; gap: 7px; max-width: calc(100vw - 20px); box-sizing: border-box; padding: 6px 8px; border-radius: 7px; background: rgba(0, 0, 0, .62); color: rgba(255, 255, 255, .92); box-shadow: 0 6px 20px rgba(0,0,0,.18); font: 12px/1.35 Montserrat, Arial, sans-serif; pointer-events: auto; user-select: none; white-space: nowrap; cursor: grab; touch-action: none; transition: left .16s ease, right .16s ease, top .16s ease, bottom .16s ease; }
			#modloader-status.modloader-status-dragging { cursor: grabbing; transition: none; }
			#modloader-status .modloader-status-logo { width: 18px; height: 18px; flex: 0 0 auto; border-radius: 4px; background: url('img/logo/sheet.png'); background-size: 400% 200%; box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); opacity: 1; transition: opacity .32s ease, filter .32s ease; }
			#modloader-status .modloader-status-logo-changing { opacity: .2; filter: saturate(.7); }
			#modloader-status .modloader-status-title { font-weight: 600; }
			#modloader-status .modloader-status-version { color: rgba(255,255,255,.68); }
			#modloader-status .modloader-status-separator { color: rgba(255,255,255,.36); }
			#modloader-status .modloader-status-hotkey { color: rgba(255,255,255,.8); }
			#modloader-status .modloader-status-mods { position: relative; display: inline-flex; align-items: center; min-width: 18px; max-width: 18px; overflow: hidden; color: rgba(255,255,255,.78); transition: max-width .14s ease-in; }
			#modloader-status .modloader-status-mod-names { display: block; max-width: min(58vw, 720px); overflow: hidden; text-overflow: ellipsis; opacity: 0; transform: translateX(-14px); transition: opacity .11s ease-in, transform .14s ease-in; }
			#modloader-status .modloader-status-dots { position: absolute; right: 5px; top: 50%; display: inline-flex; flex-direction: column; gap: 2px; transform: translateY(-50%); opacity: 1; transition: opacity .1s ease-in, transform .14s ease-in; }
			#modloader-status .modloader-status-dot { width: 3px; height: 3px; border-radius: 50%; background: rgba(190,190,190,.72); }
			#modloader-status:hover .modloader-status-mods { max-width: min(58vw, 720px); transition: max-width .2s ease-out; }
			#modloader-status:hover .modloader-status-mod-names { opacity: 1; transform: translateX(0); transition: opacity .14s ease-out .04s, transform .18s ease-out; }
			#modloader-status:hover .modloader-status-dots { opacity: 0; transform: translate(8px, -50%); }
		`
		document.head.appendChild(style)
	}

	const STATUS_CORNER_KEY = 'modloader.statusCorner'
	const STATUS_MARGIN = 10
	const VALID_STATUS_CORNERS = new Set([ 'top-left', 'top-right', 'bottom-left', 'bottom-right' ])

	const readStatusCorner = function () {
		try {
			const value = localStorage.getItem(STATUS_CORNER_KEY)
			if (VALID_STATUS_CORNERS.has(value)) return value
		} catch (error) {}
		return 'bottom-left'
	}

	const writeStatusCorner = function (corner) {
		try { localStorage.setItem(STATUS_CORNER_KEY, corner) } catch (error) {}
	}

	const applyStatusCorner = function (el, corner) {
		const vertical = corner.startsWith('top') ? 'top' : 'bottom'
		const horizontal = corner.endsWith('left') ? 'left' : 'right'
		el.style.left = horizontal === 'left' ? `${STATUS_MARGIN}px` : 'auto'
		el.style.right = horizontal === 'right' ? `${STATUS_MARGIN}px` : 'auto'
		el.style.top = vertical === 'top' ? `${STATUS_MARGIN}px` : 'auto'
		el.style.bottom = vertical === 'bottom' ? `${STATUS_MARGIN}px` : 'auto'
	}

	const nearestStatusCorner = function (el) {
		const rect = el.getBoundingClientRect()
		const horizontal = rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right'
		const vertical = rect.top + rect.height / 2 < window.innerHeight / 2 ? 'top' : 'bottom'
		return `${vertical}-${horizontal}`
	}

	const installStatusDrag = function (el) {
		if (el.__modloaderStatusDrag) return
		el.__modloaderStatusDrag = true
		let drag = null
		const clamp = function (value, min, max) { return Math.min(Math.max(value, min), max) }
		const finish = function () {
			if (!drag) return
			drag = null
			state.statusDragging = false
			el.classList.remove('modloader-status-dragging')
			const corner = nearestStatusCorner(el)
			writeStatusCorner(corner)
			applyStatusCorner(el, corner)
		}
		el.addEventListener('pointerdown', function (event) {
			if (event.button !== undefined && event.button !== 0) return
			const rect = el.getBoundingClientRect()
			drag = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top }
			state.statusDragging = true
			el.classList.add('modloader-status-dragging')
			el.setPointerCapture?.(event.pointerId)
			event.preventDefault()
			event.stopPropagation()
		})
		el.addEventListener('pointermove', function (event) {
			if (!drag) return
			const maxLeft = Math.max(STATUS_MARGIN, window.innerWidth - el.offsetWidth - STATUS_MARGIN)
			const maxTop = Math.max(STATUS_MARGIN, window.innerHeight - el.offsetHeight - STATUS_MARGIN)
			el.style.left = `${clamp(event.clientX - drag.offsetX, STATUS_MARGIN, maxLeft)}px`
			el.style.top = `${clamp(event.clientY - drag.offsetY, STATUS_MARGIN, maxTop)}px`
			el.style.right = 'auto'
			el.style.bottom = 'auto'
			event.preventDefault()
			event.stopPropagation()
		})
		el.addEventListener('pointerup', finish)
		el.addEventListener('pointercancel', finish)
		window.addEventListener('resize', function () {
			if (!state.statusDragging) applyStatusCorner(el, readStatusCorner())
		})
	}

	const appendStatusText = function (parent, className, text) {
		const span = document.createElement('span')
		if (className) span.className = className
		span.textContent = text
		parent.appendChild(span)
		return span
	}

	const chooseStatusLogoFrame = function () {
		const frameCount = 8
		let next = Math.floor(Math.random() * frameCount)
		if (frameCount > 1 && next === state.statusLogoIndex) next = (next + 1) % frameCount
		state.statusLogoIndex = next
		return next
	}

	const setStatusLogoFrame = function (logo, index) {
		const x = index % 4
		const y = Math.floor(index / 4)
		logo.style.backgroundPosition = `${100 / 3 * x}% ${100 * y}%`
	}

	const rotateStatusLogo = function (animated) {
		const logo = document.querySelector('#modloader-status .modloader-status-logo')
		if (!logo) return
		const next = chooseStatusLogoFrame()
		if (!animated) {
			setStatusLogoFrame(logo, next)
			return
		}
		logo.classList.add('modloader-status-logo-changing')
		setTimeout(function () {
			setStatusLogoFrame(logo, next)
			requestAnimationFrame(function () {
				logo.classList.remove('modloader-status-logo-changing')
			})
		}, 320)
	}

	const ensureStatusLogoTimer = function () {
		if (state.statusLogoTimer) return
		state.statusLogoTimer = setInterval(function () {
			rotateStatusLogo(true)
		}, 60000)
	}

	const showStatus = function () {
		if (!document.body) return
		ensureStatusStyle()

		let el = document.getElementById('modloader-status')
		if (!el) {
			el = document.createElement('div')
			el.id = 'modloader-status'
			document.body.appendChild(el)
		}

		const names = state.mods.map(function (mod) { return getLocalizedModName(mod) || mod.path || mod.id }).join(', ') || 'No mods'
		el.title = `Cattail's ModLoader ${state.version} | mod: ${state.mods.length} | Ctrl+M | ${names}`
		installStatusDrag(el)
		if (!state.statusDragging) applyStatusCorner(el, readStatusCorner())
		el.innerHTML = ''

		const logo = document.createElement('span')
		logo.className = 'modloader-status-logo'
		logo.setAttribute('aria-hidden', 'true')
		if (state.statusLogoIndex < 0) chooseStatusLogoFrame()
		setStatusLogoFrame(logo, state.statusLogoIndex)
		el.appendChild(logo)
		ensureStatusLogoTimer()

		appendStatusText(el, 'modloader-status-title', "Cattail's ModLoader")
		appendStatusText(el, 'modloader-status-version', state.version)
		appendStatusText(el, 'modloader-status-separator', '|')
		appendStatusText(el, 'modloader-status-count', `mod: ${state.mods.length}`)
		appendStatusText(el, 'modloader-status-separator', '|')
		appendStatusText(el, 'modloader-status-hotkey', 'Ctrl+M')
		appendStatusText(el, 'modloader-status-separator', '|')

		const mods = document.createElement('span')
		mods.className = 'modloader-status-mods'
		appendStatusText(mods, 'modloader-status-mod-names', names)
		const dots = document.createElement('span')
		dots.className = 'modloader-status-dots'
		for (let i = 0; i < 3; i++) {
			const dot = document.createElement('span')
			dot.className = 'modloader-status-dot'
			dots.appendChild(dot)
		}
		mods.appendChild(dots)
		el.appendChild(mods)
	}

	const UI_DOCK_NAMES = new Set([ 'game-bottom-right', 'game-top-right', 'splash-bottom-right', 'splash-top-right' ])

	const normalizeUiDockName = function (value) {
		const name = String(value || 'game-bottom-right').toLowerCase()
		if (name === 'bottom-right') return 'game-bottom-right'
		if (name === 'top-right') return 'game-top-right'
		if (name === 'shop-bottom-right') return 'game-bottom-right'
		return UI_DOCK_NAMES.has(name) ? name : 'game-bottom-right'
	}

	const ensureUiDockStyle = function () {
		if (document.getElementById('modloader-ui-dock-style')) return
		const style = document.createElement('style')
		style.id = 'modloader-ui-dock-style'
		style.textContent = `
			.modloader-ui-dock { position: absolute; z-index: 2; display: inline-flex; align-items: center; gap: calc(var(--unit) * .35); pointer-events: none; }
			.modloader-ui-dock-empty { display: none; }
			.modloader-ui-dock > .modloader-ui-dock-button { position: relative !important; left: auto !important; right: auto !important; top: auto !important; bottom: auto !important; flex: 0 0 auto; margin: 0 !important; pointer-events: auto; }
			.modloader-ui-dock-game-bottom-right { right: calc(var(--unit) * 3.35); bottom: calc(var(--unit) * .5); flex-direction: row-reverse; }
			.modloader-ui-dock-game-top-right { right: calc(var(--unit) * .5); top: calc(var(--unit) * 3.35); flex-direction: column; }
			.modloader-ui-dock-splash-bottom-right { right: 72px; bottom: 15px; flex-direction: row-reverse; }
			.modloader-ui-dock-splash-top-right { right: 72px; top: 15px; flex-direction: row-reverse; }
			.modloader-ui-dock-vanilla-hidden { display: none !important; }
			.mobile .modloader-ui-hide-mobile { display: none !important; }
		`
		document.head.appendChild(style)
	}

	const ensureUiDock = function (dockName) {
		if (!document.body) return null
		ensureUiDockStyle()
		let dock = state.uiDocks[dockName]
		if (dock?.isConnected) return dock
		dock = document.getElementById(`modloader-ui-dock-${dockName}`)
		if (!dock) {
			dock = document.createElement('div')
			dock.id = `modloader-ui-dock-${dockName}`
			dock.className = `modloader-ui-dock modloader-ui-dock-${dockName}`
			dock.setAttribute('aria-hidden', 'false')
			document.body.appendChild(dock)
		}
		state.uiDocks[dockName] = dock
		return dock
	}

	const uiButtonKey = function (modId, id) {
		return `${modId || 'anonymous'}:${id || 'button'}`
	}

	const isVanillaGameHudHidden = function (game = state.game) {
		const shopToggle = game?.shop?.shopToggle
		let vanillaHidden = false
		try {
			vanillaHidden = !!shopToggle && getComputedStyle(shopToggle).display === 'none'
		} catch (error) {}
		return !!(game?.pinhole || game?.credits || vanillaHidden)
	}

	const applyVanillaGameHudVisibilityToDock = function (dockName, dock = state.uiDocks[dockName]) {
		if (!dock) return
		const hidden = isGameHudDock(dockName) && state.vanillaGameHudHidden
		dock.classList.toggle('modloader-ui-dock-vanilla-hidden', hidden)
		dock.setAttribute('aria-hidden', hidden ? 'true' : 'false')
	}

	const applyVanillaGameHudVisibilityToDocks = function () {
		for (const dockName in state.uiDocks) applyVanillaGameHudVisibilityToDock(dockName)
	}

	const syncVanillaGameHudVisibility = function (game = state.game) {
		if (game) state.game = game
		const hidden = isVanillaGameHudHidden(game)
		const changed = state.vanillaGameHudHidden !== hidden
		state.vanillaGameHudHidden = hidden
		applyVanillaGameHudVisibilityToDocks()
		if (changed && typeof window !== 'undefined') {
			window.dispatchEvent(new CustomEvent('modloader:vanilla-game-hud', { detail: { hidden, game } }))
		}
		return hidden
	}

	const syncUiDock = function (dockName) {
		const dock = ensureUiDock(dockName)
		if (!dock) return
		const entries = Object.keys(state.uiButtons).map(function (key) { return state.uiButtons[key] }).filter(function (entry) {
			return entry.dock === dockName && entry.element
		}).sort(function (a, b) {
			return (a.order - b.order) || String(a.id).localeCompare(String(b.id))
		})
		for (const entry of entries) {
			entry.element.classList.add('modloader-ui-dock-button')
			entry.element.classList.toggle('modloader-ui-hide-mobile', !!entry.hideOnMobile)
			if (entry.element.parentNode !== dock) dock.appendChild(entry.element)
		}
		dock.classList.toggle('modloader-ui-dock-empty', entries.length === 0)
		applyVanillaGameHudVisibilityToDock(dockName, dock)
	}

	const syncUiDocks = function () {
		const names = new Set(Object.keys(state.uiDocks))
		for (const key in state.uiButtons) names.add(state.uiButtons[key].dock)
		for (const name of names) syncUiDock(name)
	}

	const unregisterUiButton = function (modId, id, element) {
		const key = uiButtonKey(modId, id)
		const entry = state.uiButtons[key]
		if (!entry || (element && entry.element !== element)) return
		delete state.uiButtons[key]
		unregisterGameHudItem(modId, 'ui-button:' + id, entry.element)
		entry.element?.classList.remove('modloader-ui-dock-button', 'modloader-ui-hide-mobile')
		if (entry.element?.parentNode?.classList?.contains('modloader-ui-dock')) entry.element.remove()
		syncUiDock(entry.dock)
	}

	const registerUiButton = function (modId, options) {
		if (!options || !options.element) {
			warn(`Ignoring UI button registration from ${modId || 'anonymous'} without an element.`)
			return function () {}
		}
		const id = options.id || options.element.id || 'button'
		const key = uiButtonKey(modId, id)
		const dock = normalizeUiDockName(options.dock || options.anchor || options.position)
		const previous = state.uiButtons[key]
		if (previous?.element && previous.element !== options.element) {
			unregisterGameHudItem(modId, 'ui-button:' + id, previous.element)
			previous.element.classList.remove('modloader-ui-dock-button', 'modloader-ui-hide-mobile')
		}
		const gameHud = options.gameHud ?? options.hud ?? isGameHudDock(dock)
		state.uiButtons[key] = {
			id,
			key,
			modId: modId || 'anonymous',
			element: options.element,
			dock,
			order: Number.isFinite(Number(options.order)) ? Number(options.order) : 100,
			hideOnMobile: options.hideOnMobile !== false,
			gameHud: gameHud !== false
		}
		if (state.uiButtons[key].gameHud) {
			registerGameHudItem(modId, { id: 'ui-button:' + id, element: options.element, side: options.hudSide || getGameHudSideForDock(dock), managed: true })
		} else {
			unregisterGameHudItem(modId, 'ui-button:' + id, options.element)
		}
		syncUiDock(dock)
		return function () { unregisterUiButton(modId, id, options.element) }
	}


	const RENDER_API_VERSION = '1.0.0'
	const RENDER_API_OWNER = 'ModLoader'
	const RENDER_API_CONFLICT_LIMIT = 100
	const RENDER_API_CAPABILITIES = Object.freeze({
		canvas2dLayers: true,
		customLayers: true,
		layerDemand: true,
		cachedLayers: true,
		methodRouting: true,
		scopedCleanup: true,
		lifecycleEvents: true,
		diagnostics: true,
		conflictDiagnostics: true,
		callbackErrorIsolation: true,
		renderTiming: true,
		webgl2Layers: false,
		methodEmitters: false
	})

	const getRenderApiCapabilities = function () {
		return Object.assign({}, RENDER_API_CAPABILITIES)
	}

	const supportsRenderCapability = function (name) {
		return RENDER_API_CAPABILITIES[String(name || '')] === true
	}

	const getRenderApiContract = function () {
		return {
			name: 'Sixty Four ModLoader Render API',
			version: RENDER_API_VERSION,
			major: 1,
			stability: 'stable',
			versioning: 'semver',
			backend: 'canvas2d',
			layerContextTypes: [ '2d' ],
			conflictResolution: 'last-registration-wins',
			capabilities: getRenderApiCapabilities()
		}
	}

	const RENDER_LAYER_DEFS = {
		background: { id: 'background', order: 0, zIndex: 0, clearEachFrame: true },
		buildings: { id: 'buildings', order: 10, zIndex: 10, clearEachFrame: true },
		effects: { id: 'effects', order: 30, zIndex: 30, clearEachFrame: true },
		interaction: { id: 'interaction', order: 40, zIndex: 40, clearEachFrame: true },
		ui: { id: 'ui', order: 50, zIndex: 50, clearEachFrame: true },
		'screen-effects': { id: 'screen-effects', order: 55, zIndex: 55, clearEachFrame: true },
		cursor: { id: 'cursor', order: 60, zIndex: 60, clearEachFrame: true },
		'reduced-flashes': { id: 'reduced-flashes', order: 65, zIndex: 65, clearEachFrame: true },
		'top-effects': { id: 'top-effects', order: 70, zIndex: 70, clearEachFrame: true }
	}

	const MAIN_RENDER_LAYER_ORDER = 20
	const MAIN_RENDER_LAYER_Z_INDEX = 20

	const RENDER_METHOD_LAYERS = {
		renderConductors: 'buildings',
		renderChasmVFX: 'buildings',
		renderEntities: 'buildings',
		renderVFX: 'effects',
		renderAvailability: 'interaction',
		renderSOI: 'interaction',
		renderHoveredCell: 'interaction',
		renderAffected: 'interaction',
		renderGrid: 'interaction',
		renderResources: 'ui',
		renderDarkResources: 'ui',
		renderHollowEvents: 'screen-effects',
		renderDarkHollowEvents: 'screen-effects',
		renderSlowdown: 'screen-effects',
		renderCursor: 'cursor'
	}

	const DEFAULT_RENDER_METHOD_LAYERS = Object.assign({}, RENDER_METHOD_LAYERS)

	const normalizeRenderOwner = function (owner) {
		if (owner === undefined || owner === null || owner === '') return null
		return String(owner)
	}

	const copyRenderConflictValue = function (value) {
		if (!value || typeof value !== 'object') return value
		return Object.assign({}, value)
	}

	const copyRenderConflict = function (entry) {
		return {
			id: entry.id,
			type: entry.type,
			key: entry.key,
			existingOwner: entry.existingOwner,
			incomingOwner: entry.incomingOwner,
			previous: copyRenderConflictValue(entry.previous),
			incoming: copyRenderConflictValue(entry.incoming),
			resolution: entry.resolution,
			frame: entry.frame
		}
	}

	const recordRenderConflict = function (type, key, existingOwner, incomingOwner, previous, incoming) {
		const entry = {
			id: state.renderConflictSerial++,
			type,
			key,
			existingOwner,
			incomingOwner,
			previous: copyRenderConflictValue(previous),
			incoming: copyRenderConflictValue(incoming),
			resolution: 'last-registration-wins',
			frame: state.renderFrame
		}
		state.renderConflicts.push(entry)
		if (state.renderConflicts.length > RENDER_API_CONFLICT_LIMIT) state.renderConflicts.splice(0, state.renderConflicts.length - RENDER_API_CONFLICT_LIMIT)
		warn('Render API ' + type + ' conflict for ' + key + ': ' + existingOwner + ' -> ' + incomingOwner + '; last registration wins.')
		return copyRenderConflict(entry)
	}

	const listRenderConflicts = function (options = {}) {
		options = options || {}
		const type = String(options.type || '').trim()
		const key = String(options.key || options.id || '').trim()
		const owner = String(options.owner || options.modId || '').trim()
		let entries = state.renderConflicts.filter(function (entry) {
			if (type && entry.type !== type) return false
			if (key && entry.key !== key) return false
			if (owner && entry.existingOwner !== owner && entry.incomingOwner !== owner) return false
			return true
		})
		const limit = Number(options.limit)
		if (Number.isFinite(limit) && limit >= 0) entries = entries.slice(Math.max(0, entries.length - Math.floor(limit)))
		return entries.map(copyRenderConflict)
	}

	const clearRenderConflicts = function () {
		const count = state.renderConflicts.length
		state.renderConflicts = []
		return count
	}

	const RENDER_CONTEXT_PROPS = [
		'globalAlpha', 'globalCompositeOperation', 'imageSmoothingEnabled',
		'fillStyle', 'strokeStyle', 'font', 'textAlign', 'textBaseline', 'direction',
		'lineWidth', 'lineCap', 'lineJoin', 'miterLimit', 'shadowBlur', 'shadowColor',
		'shadowOffsetX', 'shadowOffsetY', 'filter'
	]

	const normalizeRenderLayerId = function (id) {
		return String(id || 'ui').trim().toLowerCase().replace(/[^a-z0-9_.:-]/g, '-') || 'ui'
	}

	const normalizeRenderMethodName = function (methodName) {
		const name = String(methodName || '').trim()
		return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : ''
	}

	const normalizeRenderSpace = function (space) {
		const value = String(space || '').trim().toLowerCase().replace(/[ _-]+/g, '-')
		if (value === 'screen' || value === 'screen-space' || value === 'identity' || value === 'ui') return 'screen'
		if (value === 'world' || value === 'game' || value === 'canvas' || value === 'inherit') return 'world'
		return ''
	}

	const resolveRenderDrawOptions = function (options = {}) {
		const resolved = Object.assign({}, options || {})
		const space = normalizeRenderSpace(resolved.space || resolved.coordinateSpace)
		if (space) resolved.space = space
		if (space === 'screen') {
			if (!Object.prototype.hasOwnProperty.call(resolved, 'copyTransform')) resolved.copyTransform = false
			if (!Object.prototype.hasOwnProperty.call(resolved, 'copyState')) resolved.copyState = false
		}
		return resolved
	}

	const shouldPersistRenderLayerDemand = function (options = {}) {
		return !(options.persistent === false || options.persist === false)
	}

	const markRenderLayerDemanded = function (id, options = {}) {
		const normalized = normalizeRenderLayerId(id)
		if (shouldPersistRenderLayerDemand(options)) state.renderLayerDemands[normalized] = true
		state.renderActiveLayerDemands[normalized] = true
		return normalized
	}

	const markActiveRenderLayerDemanded = function (id) {
		const normalized = normalizeRenderLayerId(id)
		state.renderActiveLayerDemands[normalized] = true
		return normalized
	}

	const shouldReleaseCurrentRenderLayerDemand = function (options = {}) {
		return options.currentFrame === true || options.current === true || options.active === true || options.now === true
	}

	const releaseRenderLayerDemand = function (id, options = {}) {
		const normalized = normalizeRenderLayerId(id)
		const hadPersistentDemand = state.renderLayerDemands[normalized] === true
		const hadActiveDemand = state.renderActiveLayerDemands[normalized] === true
		const releaseCurrentFrame = shouldReleaseCurrentRenderLayerDemand(options)
		delete state.renderLayerDemands[normalized]
		if (releaseCurrentFrame) delete state.renderActiveLayerDemands[normalized]
		const manager = getExistingRenderLayerManager(options.game)
		if (manager) applyRenderLayerVisibility(manager)
		return hadPersistentDemand || (releaseCurrentFrame && hadActiveDemand)
	}

	const resetActiveRenderLayerDemands = function () {
		state.renderActiveLayerDemands = {}
		for (const id of Object.keys(state.renderLayerDemands)) {
			if (state.renderLayerDemands[id] === true) state.renderActiveLayerDemands[id] = true
		}
	}

	const copyRenderLayerDemandMap = function (map) {
		const copy = {}
		for (const id of Object.keys(map || {})) if (map[id] === true) copy[id] = true
		return copy
	}

	const hasRenderLayerDemand = function (id) {
		return !!(isRenderApiEnabled() && state.renderActiveLayerDemands[normalizeRenderLayerId(id)] === true)
	}

	const listRenderLayerDemands = function () {
		if (!isRenderApiEnabled()) return []
		return Object.keys(state.renderActiveLayerDemands).filter(function (id) {
			return state.renderActiveLayerDemands[id] === true
		}).sort()
	}

	const getRenderMethodLayer = function (methodName) {
		return RENDER_METHOD_LAYERS[normalizeRenderMethodName(methodName)] || null
	}

	const isRenderMethodRouted = function (methodName) {
		const layerId = getRenderMethodLayer(methodName)
		return !!(isRenderApiEnabled() && layerId && hasRenderLayerDemand(layerId))
	}

	const listRenderMethodRoutes = function (options = {}) {
		options = options || {}
		const includeInactive = options.all === true || options.includeInactive === true
		const enabled = isRenderApiEnabled()
		return Object.keys(RENDER_METHOD_LAYERS).sort().map(function (methodName) {
			const layerId = RENDER_METHOD_LAYERS[methodName]
			const demanded = hasRenderLayerDemand(layerId)
			const routed = enabled && demanded
			const owner = state.renderMethodRouteOwners[methodName] || (Object.prototype.hasOwnProperty.call(DEFAULT_RENDER_METHOD_LAYERS, methodName) ? RENDER_API_OWNER : null)
			if (!includeInactive && !routed) return null
			return {
				method: methodName,
				layer: layerId,
				owner,
				demanded,
				routed,
				builtIn: DEFAULT_RENDER_METHOD_LAYERS[methodName] === layerId,
				custom: DEFAULT_RENDER_METHOD_LAYERS[methodName] !== layerId,
				patched: state.renderPatchedMethods[methodName] === true
			}
		}).filter(Boolean)
	}

	const getRenderTimingNow = function () {
		return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
	}

	const roundRenderTimingMs = function (value) {
		return Math.round((Number(value) || 0) * 1000) / 1000
	}

	const normalizeRenderTimingSampleLimit = function (value) {
		const parsed = Number(value)
		if (!Number.isFinite(parsed)) return state.renderTimingSampleLimit
		return Math.max(1, Math.min(2000, Math.floor(parsed)))
	}

	const normalizeRenderTimingEntityDetailMethods = function (value) {
		const source = Array.isArray(value) ? value : (value === undefined || value === null || value === false ? [] : [value])
		const methods = []
		const seen = {}
		for (const entry of source) {
			const methodName = String(entry || '').trim()
			if (!methodName || methodName === 'render' || methodName === 'darkrender') continue
			if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(methodName) || seen[methodName]) continue
			seen[methodName] = true
			methods.push(methodName)
			if (methods.length >= 16) break
		}
		return methods
	}

	const sameRenderTimingEntityDetailMethods = function (a, b) {
		const left = Array.isArray(a) ? a : []
		const right = Array.isArray(b) ? b : []
		return left.length === right.length && left.every(function (methodName, index) { return methodName === right[index] })
	}

	const isRenderTimingEntityDetailMethod = function (methodName) {
		return state.renderTimingEntityDetailMethods.indexOf(String(methodName || '')) >= 0
	}

	const getRenderTimingFrame = function () {
		return Number(state.renderTimingFrame) || Number(state.renderFrame) || 0
	}

	const getCurrentRenderTimingContext = function () {
		const stack = state.renderTimingContextStack || []
		return stack.length ? stack[stack.length - 1] : null
	}

	const getRenderTimingRecord = function (name) {
		const method = String(name || 'unknown')
		if (!state.renderTimingRecords[method]) {
			state.renderTimingRecords[method] = { method, calls: 0, totalMs: 0, samples: [], lastMs: 0, lastFrame: 0 }
		}
		return state.renderTimingRecords[method]
	}

	const pushRenderTimingSample = function (record, elapsedMs) {
		const elapsed = Math.max(0, Number(elapsedMs) || 0)
		record.calls += 1
		record.totalMs += elapsed
		record.samples.push(elapsed)
		record.lastMs = elapsed
		record.lastFrame = getRenderTimingFrame()
		const limit = normalizeRenderTimingSampleLimit(state.renderTimingSampleLimit)
		while (record.samples.length > limit) {
			record.totalMs -= record.samples.shift() || 0
		}
		return record
	}

	const recordRenderTiming = function (name, elapsedMs) {
		if (!state.renderTimingEnabled) return null
		return pushRenderTimingSample(getRenderTimingRecord(name), elapsedMs)
	}

	const measureRenderTiming = function (name, fn) {
		if (!state.renderTimingEnabled) return fn()
		const method = String(name || 'unknown')
		if (method === 'renderloop') state.renderTimingFrame += 1
		const startedAt = getRenderTimingNow()
		state.renderTimingContextStack.push(method)
		try {
			return fn()
		} finally {
			state.renderTimingContextStack.pop()
			recordRenderTiming(method, getRenderTimingNow() - startedAt)
		}
	}

	const describeRenderTimingRecord = function (record) {
		const samples = record?.samples || []
		let min = Infinity
		let max = 0
		for (const value of samples) {
			if (value < min) min = value
			if (value > max) max = value
		}
		const sampleCount = samples.length
		const totalMs = Number(record?.totalMs) || 0
		return {
			method: record?.method || 'unknown',
			calls: Number(record?.calls) || 0,
			sampleCount,
			avgMs: sampleCount ? roundRenderTimingMs(totalMs / sampleCount) : 0,
			lastMs: roundRenderTimingMs(record?.lastMs || 0),
			maxMs: sampleCount ? roundRenderTimingMs(max) : 0,
			minMs: sampleCount ? roundRenderTimingMs(min) : 0,
			totalMs: roundRenderTimingMs(totalMs),
			lastFrame: Number(record?.lastFrame) || 0
		}
	}

	const listRenderTimingMethods = function (options = {}) {
		const entries = Object.keys(state.renderTimingRecords).map(function (name) {
			return describeRenderTimingRecord(state.renderTimingRecords[name])
		})
		const sort = options.sort || 'avg'
		entries.sort(function (a, b) {
			if (sort === 'name') return String(a.method).localeCompare(String(b.method))
			if (sort === 'last') return (b.lastMs - a.lastMs) || String(a.method).localeCompare(String(b.method))
			if (sort === 'total') return (b.totalMs - a.totalMs) || String(a.method).localeCompare(String(b.method))
			return (b.avgMs - a.avgMs) || String(a.method).localeCompare(String(b.method))
		})
		return entries
	}

	const getRenderTimingEntityRecord = function (entityName, constructorName, renderMethod, context) {
		const entity = String(entityName || constructorName || 'unknown')
		const ctor = String(constructorName || entity || 'unknown')
		const method = String(renderMethod || 'render')
		const parent = String(context || 'renderEntities')
		const key = parent + ':' + method + ':' + entity
		if (!state.renderTimingEntityRecords[key]) {
			state.renderTimingEntityRecords[key] = { key, entity, constructor: ctor, context: parent, renderMethod: method, calls: 0, totalMs: 0, allTotalMs: 0, samples: [], lastMs: 0, lastFrame: 0 }
		}
		return state.renderTimingEntityRecords[key]
	}

	const getRenderTimingEntityName = function (entity) {
		if (!entity) return 'unknown'
		return String(entity.name || entity.id || entity.constructor?.name || 'unknown')
	}

	const getRenderTimingConstructorName = function (entity) {
		return String(entity?.constructor?.name || getRenderTimingEntityName(entity))
	}

	const isRenderTimingEntityContext = function (context) {
		return context === 'renderEntities' || context === 'renderConductors'
	}

	const isRenderTimingVfxContext = function (context) {
		return context === 'renderVFX' || context === 'renderChasmVFX'
	}

	const shouldRecordRenderEntityTiming = function (context) {
		if (!state.renderTimingEnabled) return false
		if (state.renderTimingEntitiesEnabled && isRenderTimingEntityContext(context)) return true
		return !!(state.renderTimingVfxEnabled && isRenderTimingVfxContext(context))
	}

	const recordRenderEntityTiming = function (entity, renderMethod, context, elapsedMs) {
		if (!shouldRecordRenderEntityTiming(context)) return null
		const elapsed = Math.max(0, Number(elapsedMs) || 0)
		const record = getRenderTimingEntityRecord(getRenderTimingEntityName(entity), getRenderTimingConstructorName(entity), renderMethod, context)
		record.allTotalMs += elapsed
		return pushRenderTimingSample(record, elapsed)
	}

	const describeRenderTimingEntityRecord = function (record) {
		const samples = record?.samples || []
		let min = Infinity
		let max = 0
		for (const value of samples) {
			if (value < min) min = value
			if (value > max) max = value
		}
		const sampleCount = samples.length
		const totalMs = Number(record?.totalMs) || 0
		const frameCount = Math.max(1, getRenderTimingFrame())
		return {
			entity: record?.entity || 'unknown',
			constructor: record?.constructor || 'unknown',
			context: record?.context || 'renderEntities',
			renderMethod: record?.renderMethod || 'render',
			calls: Number(record?.calls) || 0,
			callsPerFrame: roundRenderTimingMs((Number(record?.calls) || 0) / frameCount),
			sampleCount,
			avgMs: sampleCount ? roundRenderTimingMs(totalMs / sampleCount) : 0,
			avgPerFrameMs: roundRenderTimingMs((Number(record?.allTotalMs) || 0) / frameCount),
			lastMs: roundRenderTimingMs(record?.lastMs || 0),
			maxMs: sampleCount ? roundRenderTimingMs(max) : 0,
			minMs: sampleCount ? roundRenderTimingMs(min) : 0,
			totalMs: roundRenderTimingMs(totalMs),
			allTotalMs: roundRenderTimingMs(record?.allTotalMs || 0),
			lastFrame: Number(record?.lastFrame) || 0
		}
	}

	const listRenderTimingEntities = function (options = {}) {
		const entries = Object.keys(state.renderTimingEntityRecords).map(function (key) {
			return describeRenderTimingEntityRecord(state.renderTimingEntityRecords[key])
		}).filter(function (entry) {
			if (options.context && entry.context !== options.context) return false
			if (!options.context && options.includeVfx !== true && !isRenderTimingEntityContext(entry.context)) return false
			if (options.renderMethod && entry.renderMethod !== options.renderMethod) return false
			return true
		})
		const sort = options.sort || 'frame'
		entries.sort(function (a, b) {
			if (sort === 'name' || sort === 'entity') return String(a.entity).localeCompare(String(b.entity)) || String(a.context).localeCompare(String(b.context))
			if (sort === 'avg') return (b.avgMs - a.avgMs) || String(a.entity).localeCompare(String(b.entity))
			if (sort === 'last') return (b.lastMs - a.lastMs) || String(a.entity).localeCompare(String(b.entity))
			if (sort === 'calls') return (b.callsPerFrame - a.callsPerFrame) || String(a.entity).localeCompare(String(b.entity))
			if (sort === 'total') return (b.allTotalMs - a.allTotalMs) || String(a.entity).localeCompare(String(b.entity))
			return (b.avgPerFrameMs - a.avgPerFrameMs) || String(a.entity).localeCompare(String(b.entity))
		})
		return entries
	}

	const listRenderTimingVfx = function (options = {}) {
		return listRenderTimingEntities(Object.assign({}, options, { includeVfx: true })).filter(function (entry) {
			return isRenderTimingVfxContext(entry.context)
		}).map(function (entry) {
			const row = { effect: entry.entity }
			for (const key of Object.keys(entry)) if (key !== 'entity') row[key] = entry[key]
			return row
		})
	}

	const getRenderTimingSummary = function (options = {}) {
		const methods = listRenderTimingMethods(options)
		const entities = listRenderTimingEntities(options)
		const vfx = listRenderTimingVfx(options)
		const renderloop = methods.find(function (entry) { return entry.method === 'renderloop' }) || null
		return {
			enabled: !!state.renderTimingEnabled,
			entitiesEnabled: !!state.renderTimingEntitiesEnabled,
			vfxEnabled: !!state.renderTimingVfxEnabled,
			entityDetailMethods: state.renderTimingEntityDetailMethods.slice(),
			frame: getRenderTimingFrame(),
			sampleLimit: normalizeRenderTimingSampleLimit(state.renderTimingSampleLimit),
			renderloop,
			topMethods: methods.filter(function (entry) { return entry.method !== 'renderloop' }).slice(0, Number(options.top || 8) || 8),
			topEntities: entities.slice(0, Number(options.topEntities || options.top || 8) || 8),
			topVfx: vfx.slice(0, Number(options.topVfx || options.top || 8) || 8),
			methods,
			entities,
			vfx
		}
	}

	const clearRenderTiming = function () {
		state.renderTimingRecords = {}
		state.renderTimingEntityRecords = {}
		state.renderTimingFrame = 0
		return getRenderTimingSummary()
	}

	const resetRenderTimingEntityPrototypeMarks = function () {
		state.renderTimingEntityPrototypeMarks = typeof WeakSet !== 'undefined' ? new WeakSet() : []
	}

	const hasRenderTimingEntityPrototypeMark = function (proto) {
		if (!state.renderTimingEntityPrototypeMarks) resetRenderTimingEntityPrototypeMarks()
		if (typeof WeakSet !== 'undefined' && state.renderTimingEntityPrototypeMarks instanceof WeakSet) return state.renderTimingEntityPrototypeMarks.has(proto)
		return state.renderTimingEntityPrototypeMarks.indexOf(proto) >= 0
	}

	const markRenderTimingEntityPrototype = function (proto) {
		if (!state.renderTimingEntityPrototypeMarks) resetRenderTimingEntityPrototypeMarks()
		if (typeof WeakSet !== 'undefined' && state.renderTimingEntityPrototypeMarks instanceof WeakSet) state.renderTimingEntityPrototypeMarks.add(proto)
		else if (state.renderTimingEntityPrototypeMarks.indexOf(proto) < 0) state.renderTimingEntityPrototypeMarks.push(proto)
	}

	const restoreRenderEntityTimingPatches = function () {
		for (const patch of state.renderTimingPatchedEntityMethods.slice().reverse()) {
			try {
				if (patch.owner && patch.owner[patch.methodName] === patch.wrapper) {
					Object.defineProperty(patch.owner, patch.methodName, patch.descriptor)
				}
			} catch (error) {
				warn('Failed to restore render timing entity patch', patch.methodName, error)
			}
		}
		state.renderTimingPatchedEntityMethods = []
		resetRenderTimingEntityPrototypeMarks()
	}

	const hasRenderEntityTimingPatch = function (owner, methodName) {
		return state.renderTimingPatchedEntityMethods.some(function (patch) { return patch.owner === owner && patch.methodName === methodName })
	}

	const patchRenderEntityTimingMethod = function (owner, methodName) {
		if (!owner || hasRenderEntityTimingPatch(owner, methodName)) return false
		const descriptor = Object.getOwnPropertyDescriptor(owner, methodName)
		const original = descriptor?.value
		if (!descriptor || typeof original !== 'function') return false
		if (original.__modloaderRenderTimingWrapper === true) return false
		const wrapper = function (...args) {
			const context = getCurrentRenderTimingContext()
			const detailMethod = isRenderTimingEntityDetailMethod(methodName)
			if (!shouldRecordRenderEntityTiming(context) || (state.renderTimingEntityDepth > 0 && !detailMethod)) return original.apply(this, args)
			const startedAt = getRenderTimingNow()
			state.renderTimingEntityDepth += 1
			try {
				return original.apply(this, args)
			} finally {
				state.renderTimingEntityDepth -= 1
				recordRenderEntityTiming(this, methodName, context, getRenderTimingNow() - startedAt)
			}
		}
		try {
			Object.defineProperty(wrapper, '__modloaderRenderTimingWrapper', { value: true })
			Object.defineProperty(wrapper, '__modloaderRenderTimingOriginal', { value: original })
			const nextDescriptor = Object.assign({}, descriptor, { value: wrapper })
			Object.defineProperty(owner, methodName, nextDescriptor)
			state.renderTimingPatchedEntityMethods.push({ owner, methodName, original, wrapper, descriptor })
			return true
		} catch (error) {
			warn('Failed to install render timing entity patch', methodName, error)
			return false
		}
	}

	const installRenderEntityTimingForEntity = function (entity) {
		if (!entity) return
		let proto = Object.getPrototypeOf(entity)
		while (proto && proto !== Object.prototype) {
			if (!hasRenderTimingEntityPrototypeMark(proto)) {
				patchRenderEntityTimingMethod(proto, 'render')
				patchRenderEntityTimingMethod(proto, 'darkrender')
				for (const methodName of state.renderTimingEntityDetailMethods) patchRenderEntityTimingMethod(proto, methodName)
				markRenderTimingEntityPrototype(proto)
			}
			proto = Object.getPrototypeOf(proto)
		}
	}

	const installRenderEntityTiming = function (game) {
		if (!state.renderTimingEnabled || !game) return
		if (state.renderTimingEntitiesEnabled) {
			for (const entity of game.stuff || []) installRenderEntityTimingForEntity(entity)
			for (const entity of game.conductors || []) installRenderEntityTimingForEntity(entity)
		}
		if (state.renderTimingVfxEnabled) {
			for (const effect of game.vfx || []) installRenderEntityTimingForEntity(effect)
			for (const effect of game.chasmVfx || []) installRenderEntityTimingForEntity(effect)
		}
	}

	const setRenderTimingEnabled = function (enabled = true, options = {}) {
		if (typeof enabled === 'object') {
			options = enabled || {}
			enabled = options.enabled !== false
		}
		options = options || {}
		if (Object.prototype.hasOwnProperty.call(options, 'samples') || Object.prototype.hasOwnProperty.call(options, 'sampleLimit')) {
			state.renderTimingSampleLimit = normalizeRenderTimingSampleLimit(options.samples || options.sampleLimit)
		}
		const detailMethodKeys = ['entityDetailMethods', 'detailMethods', 'entitySubMethods']
		for (const key of detailMethodKeys) {
			if (!Object.prototype.hasOwnProperty.call(options, key)) continue
			const nextMethods = normalizeRenderTimingEntityDetailMethods(options[key])
			if (!sameRenderTimingEntityDetailMethods(state.renderTimingEntityDetailMethods, nextMethods)) {
				restoreRenderEntityTimingPatches()
				state.renderTimingEntityDetailMethods = nextMethods
			}
			break
		}
		state.renderTimingEnabled = enabled !== false
		state.renderTimingEntitiesEnabled = state.renderTimingEnabled && options.entities !== false && options.entity !== false
		state.renderTimingVfxEnabled = state.renderTimingEnabled && (options.vfx === true || options.effects === true || options.visualEffects === true)
		if (options.clear === true) clearRenderTiming()
		if (state.renderTimingEnabled) installRenderEntityTiming(getRenderGame(options.game))
		else restoreRenderEntityTimingPatches()
		return getRenderTimingSummary()
	}

	const enableRenderTiming = function (options = {}) {
		return setRenderTimingEnabled(true, Object.assign({ clear: true }, options || {}))
	}

	const disableRenderTiming = function (options = {}) {
		return setRenderTimingEnabled(false, options || {})
	}
	const getRenderGame = function (game) {
		return game || state.game || uiPagesCurrentGame || window.game || null
	}

	const getRenderLayerDef = function (id) {
		const normalized = normalizeRenderLayerId(id)
		return Object.assign({ id: normalized, order: 45, zIndex: 45, clearEachFrame: true }, RENDER_LAYER_DEFS[normalized] || {}, state.renderLayerDefinitions[normalized] || {})
	}

	const getRenderLayerZIndex = function (def) {
		const zIndex = Number(def?.zIndex)
		if (Number.isFinite(zIndex)) return zIndex
		const order = Number(def?.order)
		return Number.isFinite(order) ? order : 45
	}

	const isRenderLayerBelowMain = function (idOrDef) {
		const def = typeof idOrDef === 'string' ? getRenderLayerDef(idOrDef) : (idOrDef || {})
		return getRenderLayerZIndex(def) < MAIN_RENDER_LAYER_Z_INDEX
	}

	const listDemandedRenderLayersBelowMain = function (options = {}) {
		if (!isRenderApiEnabled()) return []
		const includeBackground = options.includeBackground === true
		return Object.keys(state.renderActiveLayerDemands).filter(function (id) {
			return state.renderActiveLayerDemands[id] === true && (includeBackground || id !== 'background') && isRenderLayerBelowMain(id)
		}).sort()
	}

	const markBackgroundDemandForUnderMainLayers = function () {
		if (hasRenderLayerDemand('background')) return false
		if (!listDemandedRenderLayersBelowMain().length) return false
		markActiveRenderLayerDemanded('background')
		return true
	}

	const markCursorDemandForAboveMainLayers = function () {
		if (hasRenderLayerDemand('cursor')) return false
		const cursorZIndex = getRenderLayerZIndex(getRenderLayerDef('cursor'))
		const needsCursorLayer = Object.keys(state.renderActiveLayerDemands).some(function (id) {
			if (state.renderActiveLayerDemands[id] !== true || id === 'cursor') return false
			const zIndex = getRenderLayerZIndex(getRenderLayerDef(id))
			return zIndex > MAIN_RENDER_LAYER_Z_INDEX && zIndex < cursorZIndex
		})
		if (!needsCursorLayer) return false
		markActiveRenderLayerDemanded('cursor')
		return true
	}

	const getExistingRenderLayerManager = function (game) {
		game = getRenderGame(game)
		if (game && game.__modloaderRenderLayerManager?.sourceCanvas === game.canvas) return game.__modloaderRenderLayerManager
		return state.renderLayerManager || null
	}

	const isRenderLayerCached = function (defOrId) {
		const def = typeof defOrId === 'string' ? getRenderLayerDef(defOrId) : (defOrId || {})
		return def.cache === true || def.cached === true || def.redrawWhenDirty === true || def.redrawOnDirty === true
	}

	const getRenderLayerDefinitionSignature = function (defOrId) {
		const def = typeof defOrId === 'string' ? getRenderLayerDef(defOrId) : (defOrId || {})
		const order = Number(def.order)
		const zIndex = Number(def.zIndex)
		return {
			order: Number.isFinite(order) ? order : 45,
			zIndex: Number.isFinite(zIndex) ? zIndex : (Number.isFinite(order) ? order : 45),
			clearEachFrame: def.clearEachFrame !== false,
			cached: isRenderLayerCached(def)
		}
	}

	const sameRenderLayerDefinition = function (a, b) {
		const left = getRenderLayerDefinitionSignature(a)
		const right = getRenderLayerDefinitionSignature(b)
		return left.order === right.order && left.zIndex === right.zIndex && left.clearEachFrame === right.clearEachFrame && left.cached === right.cached
	}

	const getRenderLayerDirtyGame = function (gameOrOptions) {
		if (gameOrOptions && !gameOrOptions.canvas && !gameOrOptions.ctx && Object.prototype.hasOwnProperty.call(gameOrOptions, 'game')) return gameOrOptions.game
		return gameOrOptions
	}

	const setRenderLayerDirtyState = function (layer, dirty = true) {
		if (!layer || layer.isMain) return false
		const value = dirty !== false
		layer.dirty = value
		state.renderLayerDirtyMarks[layer.id] = value
		if (value) layer.lastDirtyFrame = state.renderFrame
		else layer.lastDrawFrame = state.renderFrame
		return true
	}

	const markRenderLayerDirty = function (id, dirty = true, gameOrOptions) {
		const normalized = normalizeRenderLayerId(id)
		const value = dirty !== false
		state.renderLayerDirtyMarks[normalized] = value
		const manager = getExistingRenderLayerManager(getRenderLayerDirtyGame(gameOrOptions))
		const layer = manager?.layers?.[normalized]
		if (layer) setRenderLayerDirtyState(layer, value)
		return !!layer || value
	}

	const isRenderLayerDirty = function (id, gameOrOptions) {
		const normalized = normalizeRenderLayerId(id)
		const manager = getExistingRenderLayerManager(getRenderLayerDirtyGame(gameOrOptions))
		const layer = manager?.layers?.[normalized]
		if (layer) return isRenderLayerCached(layer) ? layer.dirty !== false : !!layer.dirty
		if (Object.prototype.hasOwnProperty.call(state.renderLayerDirtyMarks, normalized)) return state.renderLayerDirtyMarks[normalized] !== false
		return isRenderLayerCached(normalized)
	}

	const getRenderLayerFrameState = function (layerId, manager) {
		const normalized = normalizeRenderLayerId(layerId)
		const existing = state.renderLayerFrameState[normalized]
		if (existing?.frame === state.renderFrame) return existing
		const cached = isRenderLayerCached(normalized)
		const dirty = isRenderLayerDirty(normalized, manager?.game)
		const frameState = { id: normalized, frame: state.renderFrame, cached, dirty, shouldDraw: !cached || dirty, drew: false, failed: false }
		state.renderLayerFrameState[normalized] = frameState
		return frameState
	}

	const finishCachedRenderLayerFrame = function (manager) {
		if (!manager) return
		for (const id in state.renderLayerFrameState) {
			const frameState = state.renderLayerFrameState[id]
			if (frameState?.frame !== state.renderFrame || !frameState.cached || !frameState.drew || frameState.failed) continue
			const layer = manager.layers?.[id]
			if (layer) setRenderLayerDirtyState(layer, false)
		}
	}

	const describeRenderLayer = function (id, manager) {
		const normalized = normalizeRenderLayerId(id)
		const def = getRenderLayerDef(normalized)
		const layer = manager?.layers?.[normalized] || null
		const canvas = layer?.canvas || null
		const cached = isRenderLayerCached(def)
		const owner = state.renderLayerDefinitionOwners[normalized] || (RENDER_LAYER_DEFS[normalized] ? RENDER_API_OWNER : null)
		return {
			id: normalized,
			owner,
			definitionOwner: owner,
			order: Number(def.order) || 0,
			zIndex: Number(def.zIndex) || Number(def.order) || 0,
			clearEachFrame: def.clearEachFrame !== false,
			cached,
			cache: cached,
			belowMain: isRenderLayerBelowMain(def),
			requiresBackgroundFill: normalized !== 'background' && isRenderLayerBelowMain(def),
			builtIn: !!RENDER_LAYER_DEFS[normalized],
			custom: !!state.renderLayerDefinitions[normalized],
			active: hasRenderLayerDemand(normalized),
			persistentDemand: state.renderLayerDemands[normalized] === true,
			created: !!layer,
			dirty: isRenderLayerDirty(normalized, manager?.game),
			lastDirtyFrame: Number(layer?.lastDirtyFrame) || 0,
			lastDrawFrame: Number(layer?.lastDrawFrame) || 0,
			visible: !!(isRenderApiEnabled() && layer?.visible !== false && canvas && canvas.style.display !== 'none'),
			width: Number(canvas?.width) || 0,
			height: Number(canvas?.height) || 0
		}
	}

	const getRenderDiagnosticGame = function (gameOrOptions) {
		if (gameOrOptions && !gameOrOptions.canvas && !gameOrOptions.ctx && Object.prototype.hasOwnProperty.call(gameOrOptions, 'game')) return gameOrOptions.game
		return gameOrOptions
	}

	const describeRenderLayerInfo = function (id, gameOrOptions) {
		const manager = getExistingRenderLayerManager(getRenderDiagnosticGame(gameOrOptions))
		return describeRenderLayer(id, manager)
	}

	const listRenderLayerDefinitions = function (options = {}) {
		const manager = getExistingRenderLayerManager(getRenderDiagnosticGame(options))
		const ids = new Set(Object.keys(RENDER_LAYER_DEFS))
		for (const id of Object.keys(state.renderLayerDefinitions)) ids.add(id)
		for (const id of Object.keys(state.renderLayerDemands)) ids.add(id)
		for (const id of Object.keys(state.renderActiveLayerDemands)) ids.add(id)
		if (manager?.layers) for (const id of Object.keys(manager.layers)) ids.add(id)
		return Array.from(ids).map(function (id) { return describeRenderLayer(id, manager) }).sort(function (a, b) {
			return (a.order - b.order) || String(a.id).localeCompare(String(b.id))
		})
	}

	const listCreatedRenderLayers = function (game) {
		const manager = getExistingRenderLayerManager(game)
		if (!manager?.layers) return []
		return Object.keys(manager.layers).map(function (id) { return describeRenderLayer(id, manager) }).sort(function (a, b) {
			return (a.order - b.order) || String(a.id).localeCompare(String(b.id))
		})
	}

	const createRenderEventContext = function (type, game, manager) {
		game = getRenderGame(game)
		manager = manager || getExistingRenderLayerManager(game)
		return {
			type,
			game,
			manager,
			frame: state.renderFrame,
			demandedLayers: listRenderLayerDemands(),
			createdLayers: listCreatedRenderLayers(game).map(function (layer) { return layer.id }),
			routedMethods: listRenderMethodRoutes()
		}
	}

	const addRenderEventListener = function (type, fn, modId) {
		if (typeof fn !== 'function') return function () {}
		const listeners = state.renderEventListeners[type]
		if (!listeners) return function () {}
		const entry = { modId: modId || 'anonymous', fn }
		listeners.push(entry)
		return function () {
			const index = listeners.indexOf(entry)
			if (index >= 0) listeners.splice(index, 1)
		}
	}

	const emitRenderEvent = function (type, game, manager, windowEventName) {
		const listeners = state.renderEventListeners[type] || []
		const shouldDispatchWindowEvent = !!windowEventName
		if (!listeners.length && !shouldDispatchWindowEvent) return null
		const detail = listeners.length ? createRenderEventContext(type, game, manager) : { game: getRenderGame(game), frame: state.renderFrame, manager: manager || getExistingRenderLayerManager(game) }
		for (const entry of listeners.slice()) {
			try { entry.fn(detail) }
			catch (error) { warn('Render event listener failed', entry.modId, type, error) }
		}
		if (shouldDispatchWindowEvent) {
			try { window.dispatchEvent(new CustomEvent(windowEventName, { detail })) }
			catch (error) {}
		}
		return detail
	}

	const isRenderApiEnabled = function () {
		loadPanelState()
		return state.panelSettings.renderApiEnabled !== false
	}

	const ensureRenderLayerStyle = function () {
		if (document.getElementById('modloader-render-layer-style')) return
		const style = document.createElement('style')
		style.id = 'modloader-render-layer-style'
		style.textContent = [
			'#modloader-render-stack { position: fixed; inset: 0; z-index: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none; }',
			'#modloader-render-stack > canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; margin: 0; padding: 0; border: 0; user-select: none; }',
			'#modloader-render-stack > .modloader-render-main-canvas { pointer-events: auto; cursor: none; }',
			'#modloader-render-stack > .modloader-render-layer { pointer-events: none; }'
		].join('\n')
		document.head.appendChild(style)
	}

	const insertRenderLayerCanvas = function (manager, layer) {
		const canvas = layer.canvas
		canvas.dataset.modloaderRenderOrder = String(layer.order)
		canvas.style.zIndex = String(layer.zIndex)
		const children = Array.from(manager.container.children)
		let before = null
		for (const child of children) {
			const order = Number(child.dataset?.modloaderRenderOrder)
			if (Number.isFinite(order) && order > layer.order) {
				before = child
				break
			}
		}
		manager.container.insertBefore(canvas, before)
	}

	const applyRenderLayerDefinition = function (manager, layer) {
		if (!manager || !layer || layer.isMain) return
		const def = getRenderLayerDef(layer.id)
		layer.order = def.order
		layer.zIndex = def.zIndex
		layer.clearEachFrame = def.clearEachFrame
		layer.cached = isRenderLayerCached(def)
		layer.cache = layer.cached
		if (layer.canvas) insertRenderLayerCanvas(manager, layer)
	}

	const syncRenderLayerCanvas = function (manager, layer) {
		if (!manager?.sourceCanvas || !layer?.canvas || layer.isMain) return false
		const source = manager.sourceCanvas
		const game = manager.game
		const ratio = Math.max(1, Number(game?.pixelRatio) || Number(window.devicePixelRatio) || 1)
		let width = Number(game?.w) || source.width || 0
		let height = Number(game?.h) || source.height || 0
		if (!width || !height) {
			const rect = source.getBoundingClientRect()
			width = width || rect.width * ratio || window.innerWidth * ratio
			height = height || rect.height * ratio || window.innerHeight * ratio
		}
		width = Math.max(1, Math.round(width))
		height = Math.max(1, Math.round(height))
		let resized = false
		if (layer.canvas.width !== width) {
			layer.canvas.width = width
			resized = true
		}
		if (layer.canvas.height !== height) {
			layer.canvas.height = height
			resized = true
		}
		if (resized) setRenderLayerDirtyState(layer, true)
		return true
	}

	const syncRenderLayers = function (manager, options = {}) {
		if (!manager?.sourceCanvas) return false
		const source = manager.sourceCanvas
		if (!source.isConnected) return false
		if (manager.container && source.parentNode !== manager.container) {
			manager.container.appendChild(source)
		}
		const activeOnly = options.activeOnly === true
		for (const id in manager.layers) {
			if (!activeOnly || hasRenderLayerDemand(id)) syncRenderLayerCanvas(manager, manager.layers[id])
		}
		applyRenderLayerVisibility(manager)
		return true
	}

	const ensureRenderLayer = function (manager, id, options = {}, owner) {
		if (!manager) return null
		const normalized = normalizeRenderLayerId(id)
		if (normalized === 'main' || normalized === 'world' || normalized === 'vanilla') {
			return { id: 'main', order: MAIN_RENDER_LAYER_ORDER, zIndex: MAIN_RENDER_LAYER_Z_INDEX, canvas: manager.sourceCanvas, ctx: manager.game?.ctx, isMain: true, clearEachFrame: false }
		}
		if (options && Object.keys(options).length) registerRenderLayerDefinition(normalized, options, owner)
		if (manager.layers[normalized]) {
			applyRenderLayerDefinition(manager, manager.layers[normalized])
			return manager.layers[normalized]
		}
		const def = getRenderLayerDef(normalized)
		const canvas = document.createElement('canvas')
		canvas.className = 'modloader-render-layer modloader-render-layer-' + normalized
		canvas.dataset.modloaderLayer = normalized
		canvas.setAttribute('aria-hidden', 'true')
		canvas.style.zIndex = String(def.zIndex)
		const ctx = canvas.getContext('2d')
		const cached = isRenderLayerCached(def)
		const pendingDirty = state.renderLayerDirtyMarks[normalized]
		const layer = Object.assign({}, def, { canvas, ctx, visible: true, cached, cache: cached, dirty: pendingDirty !== false, lastDirtyFrame: state.renderFrame, lastDrawFrame: 0 })
		manager.layers[normalized] = layer
		insertRenderLayerCanvas(manager, layer)
		syncRenderLayerCanvas(manager, layer)
		applyRenderLayerVisibility(manager)
		return layer
	}

	const ensureRenderLayerManager = function (game) {
		game = getRenderGame(game)
		if (!game?.canvas || !document.body) return null
		if (game.__modloaderRenderLayerManager?.sourceCanvas === game.canvas) {
			state.renderLayerManager = game.__modloaderRenderLayerManager
			state.renderLayerManager.game = game
			return state.renderLayerManager
		}
		ensureRenderLayerStyle()
		const source = game.canvas
		let container = source.parentNode?.id === 'modloader-render-stack' ? source.parentNode : null
		if (!container) {
			container = document.createElement('div')
			container.id = 'modloader-render-stack'
			container.setAttribute('aria-hidden', 'true')
			const parent = source.parentNode || document.body
			parent.insertBefore(container, source)
			container.appendChild(source)
		}
		source.classList.add('modloader-render-main-canvas')
		source.dataset.modloaderRenderOrder = String(MAIN_RENDER_LAYER_ORDER)
		source.style.zIndex = String(MAIN_RENDER_LAYER_Z_INDEX)
		const manager = { game, sourceCanvas: source, container, layers: {} }
		game.__modloaderRenderLayerManager = manager
		state.renderLayerManager = manager
		syncRenderLayers(manager)
		emitRenderEvent('ready', game, manager, 'modloader:render-layers-ready')
		return manager
	}

	const clearRenderLayer = function (layer, options = {}) {
		if (!layer?.ctx || !layer?.canvas || layer.isMain) return
		const ctx = layer.ctx
		ctx.save()
		try {
			ctx.setTransform(1, 0, 0, 1, 0, 0)
			ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height)
		} finally {
			ctx.restore()
		}
		if (options.markDirty === true || (options.markDirty !== false && isRenderLayerCached(layer))) setRenderLayerDirtyState(layer, true)
	}

	const clearRenderLayers = function (manager, options = {}) {
		if (!manager) return
		const activeOnly = options.activeOnly === true
		for (const id in manager.layers) {
			const layer = manager.layers[id]
			if (activeOnly && !hasRenderLayerDemand(id)) continue
			if (layer.clearEachFrame !== false) clearRenderLayer(layer)
		}
	}

	const clearInactiveRenderLayers = function (manager, previousDemands) {
		if (!manager) return
		for (const id in manager.layers) {
			if (previousDemands?.[id] !== true || hasRenderLayerDemand(id)) continue
			const layer = manager.layers[id]
			if (layer.clearEachFrame !== false) clearRenderLayer(layer)
		}
	}

	const applyRenderLayerVisibility = function (manager) {
		if (!manager) return
		const enabled = isRenderApiEnabled()
		for (const id in manager.layers) {
			const layer = manager.layers[id]
			if (layer?.canvas) layer.canvas.style.display = enabled && layer.visible !== false && hasRenderLayerDemand(id) ? '' : 'none'
		}
	}

	const setRenderApiEnabled = function (enabled) {
		state.panelSettings.renderApiEnabled = enabled !== false
		const manager = state.renderLayerManager
		if (manager) {
			if (!isRenderApiEnabled()) {
				state.renderActiveLayerDemands = {}
				state.renderLastActiveLayerDemands = {}
				if (manager.container) manager.container.style.backgroundColor = ''
				clearRenderLayers(manager)
			}
			applyRenderLayerVisibility(manager)
		}
		if (isRenderApiEnabled()) installRenderApi(getRenderGame())
		return isRenderApiEnabled()
	}

	const copyRenderContextState = function (from, to, options = {}) {
		if (!from || !to) return
		options = resolveRenderDrawOptions(options)
		try {
			if (options.copyTransform !== false && typeof from.getTransform === 'function' && typeof to.setTransform === 'function') to.setTransform(from.getTransform())
			else if (typeof to.setTransform === 'function') to.setTransform(1, 0, 0, 1, 0, 0)
		} catch (error) {}
		if (options.copyState === false) return
		for (const prop of RENDER_CONTEXT_PROPS) {
			try { to[prop] = from[prop] } catch (error) {}
		}
		try {
			if (typeof from.getLineDash === 'function' && typeof to.setLineDash === 'function') to.setLineDash(from.getLineDash())
		} catch (error) {}
		try { to.lineDashOffset = from.lineDashOffset } catch (error) {}
	}

	const withRenderLayer = function (game, layerId, fn, options = {}, owner) {
		game = getRenderGame(game)
		if (!game || typeof fn !== 'function') return undefined
		const drawOptions = resolveRenderDrawOptions(options)
		if (!isRenderApiEnabled()) return drawOptions.allowWhenDisabled ? fn(game.ctx, game, null) : undefined
		const manager = ensureRenderLayerManager(game)
		if (!manager) return fn(game.ctx, game, null)
		const layer = ensureRenderLayer(manager, layerId, drawOptions.layerOptions, owner)
		if (!layer?.ctx || layer.isMain) return fn(game.ctx, game, layer)
		if (layer.visible === false) return undefined
		syncRenderLayerCanvas(manager, layer)
		const previousCtx = game.ctx
		const nextCtx = layer.ctx
		if (previousCtx === nextCtx) return fn(nextCtx, game, layer)
		nextCtx.save()
		try {
			copyRenderContextState(previousCtx, nextCtx, drawOptions)
			game.ctx = nextCtx
			return fn(nextCtx, game, layer)
		} finally {
			game.ctx = previousCtx
			nextCtx.restore()
		}
	}

	const registerRenderLayerDefinition = function (id, options = {}, owner) {
		options = options || {}
		const normalized = normalizeRenderLayerId(id)
		const previousEffectiveDefinition = getRenderLayerDef(normalized)
		const previousRegisteredOwner = state.renderLayerDefinitionOwners[normalized] || null
		const incomingOwner = normalizeRenderOwner(owner)
		const current = state.renderLayerDefinitions[normalized] || {}
		const order = Number(options.order ?? options.zIndex ?? current.order)
		const zIndex = Number(options.zIndex ?? options.order ?? current.zIndex)
		const next = Object.assign({}, current, options, { id: normalized })
		const cacheOption = options.cache ?? options.cached ?? options.redrawWhenDirty ?? options.redrawOnDirty ?? current.cache ?? current.cached ?? current.redrawWhenDirty ?? current.redrawOnDirty
		if (cacheOption !== undefined) {
			const cached = cacheOption === true
			next.cache = cached
			next.cached = cached
			next.redrawWhenDirty = cached
		}
		if (Number.isFinite(order)) next.order = order
		else delete next.order
		if (Number.isFinite(zIndex)) next.zIndex = zIndex
		else delete next.zIndex
		if (options.clearEachFrame !== undefined || options.clear !== undefined) next.clearEachFrame = options.clearEachFrame ?? options.clear
		else if (isRenderLayerCached(next)) next.clearEachFrame = false
		else if (current.clearEachFrame !== undefined) next.clearEachFrame = current.clearEachFrame
		else delete next.clearEachFrame
		const nextEffectiveDefinition = Object.assign({ id: normalized, order: 45, zIndex: 45, clearEachFrame: true }, RENDER_LAYER_DEFS[normalized] || {}, next)
		if (incomingOwner && previousRegisteredOwner && incomingOwner !== previousRegisteredOwner && !sameRenderLayerDefinition(previousEffectiveDefinition, nextEffectiveDefinition)) {
			recordRenderConflict('layer-definition', normalized, previousRegisteredOwner, incomingOwner, getRenderLayerDefinitionSignature(previousEffectiveDefinition), getRenderLayerDefinitionSignature(nextEffectiveDefinition))
		}
		state.renderLayerDefinitions[normalized] = next
		if (incomingOwner) state.renderLayerDefinitionOwners[normalized] = incomingOwner
		state.renderLayerDefinitionRegistrations[normalized] = { owner: incomingOwner, definition: next }
		const manager = state.renderLayerManager
		if (manager?.layers?.[normalized]) {
			applyRenderLayerDefinition(manager, manager.layers[normalized])
			setRenderLayerDirtyState(manager.layers[normalized], true)
		}
		return state.renderLayerDefinitions[normalized]
	}

	const registerScopedRenderLayerDefinition = function (modId, id, options = {}) {
		const normalized = normalizeRenderLayerId(id)
		const hadDefinition = Object.prototype.hasOwnProperty.call(state.renderLayerDefinitions, normalized)
		const previousDefinition = hadDefinition ? state.renderLayerDefinitions[normalized] : null
		const hadOwner = Object.prototype.hasOwnProperty.call(state.renderLayerDefinitionOwners, normalized)
		const previousOwner = hadOwner ? state.renderLayerDefinitionOwners[normalized] : null
		const previousRegistration = state.renderLayerDefinitionRegistrations[normalized] || null
		registerRenderLayerDefinition(normalized, options || {}, modId)
		const registeredRegistration = state.renderLayerDefinitionRegistrations[normalized]
		return function () {
			if (state.renderLayerDefinitionRegistrations[normalized] !== registeredRegistration) return
			if (hadDefinition) state.renderLayerDefinitions[normalized] = previousDefinition
			else delete state.renderLayerDefinitions[normalized]
			if (hadOwner) state.renderLayerDefinitionOwners[normalized] = previousOwner
			else delete state.renderLayerDefinitionOwners[normalized]
			if (previousRegistration) state.renderLayerDefinitionRegistrations[normalized] = previousRegistration
			else delete state.renderLayerDefinitionRegistrations[normalized]
			const manager = state.renderLayerManager
			if (manager?.layers?.[normalized]) {
				applyRenderLayerDefinition(manager, manager.layers[normalized])
				setRenderLayerDirtyState(manager.layers[normalized], true)
			}
		}
	}

	const publicRenderLayer = function (layer) {
		if (!layer) return null
		return {
			id: layer.id,
			name: layer.id,
			canvas: layer.canvas,
			ctx: layer.ctx,
			context: layer.ctx,
			isMain: !!layer.isMain,
			get visible() { return layer.visible !== false },
			set visible(value) {
				layer.visible = value !== false
				const manager = getExistingRenderLayerManager()
				if (manager) applyRenderLayerVisibility(manager)
			},
			get cached() { return isRenderLayerCached(getRenderLayerDef(layer.id)) },
			get cache() { return isRenderLayerCached(getRenderLayerDef(layer.id)) },
			get dirty() { return isRenderLayerDirty(layer.id) },
			set dirty(value) { markRenderLayerDirty(layer.id, value !== false) },
			markDirty() { markRenderLayerDirty(layer.id, true); return this },
			markClean() { markRenderLayerDirty(layer.id, false); return this },
			isDirty() { return isRenderLayerDirty(layer.id) },
			clear() { clearRenderLayer(layer); return this },
			sync(game) {
				const manager = ensureRenderLayerManager(game)
				if (manager) syncRenderLayerCanvas(manager, layer)
				return this
			}
		}
	}

	const getPublicRenderLayer = function (id, game, options, owner) {
		const layerId = markRenderLayerDemanded(id, options || {})
		if (!isRenderApiEnabled()) return null
		const manager = ensureRenderLayerManager(game)
		return publicRenderLayer(manager ? ensureRenderLayer(manager, layerId, options, owner) : null)
	}

	const renderCallbackKey = function (modId, id) {
		return (modId || 'anonymous') + ':' + (id || ('render-' + state.renderCallbackSerial++))
	}

	const renderLayerDemandKey = function (modId, id) {
		return (modId || 'anonymous') + ':' + (id || ('demand-' + state.renderLayerDemandSerial++))
	}

	const createRenderCallbackContext = function (entry, game, layer) {
		const frameState = state.renderLayerFrameState[entry.layerId] || getRenderLayerFrameState(entry.layerId, getExistingRenderLayerManager(game))
		return {
			id: entry.id,
			modId: entry.modId,
			layer: layer.id,
			layerId: layer.id,
			space: entry.space || 'world',
			game,
			ctx: layer.ctx,
			context: layer.ctx,
			canvas: layer.canvas,
			width: layer.canvas?.width || 0,
			height: layer.canvas?.height || 0,
			pixelRatio: Number(game?.pixelRatio) || Number(window.devicePixelRatio) || 1,
			frame: state.renderFrame,
			cached: !!frameState.cached,
			cache: !!frameState.cached,
			dirty: !!frameState.dirty,
			redraw: !!frameState.shouldDraw
		}
	}

	const createRenderCallbackEnabledContext = function (entry, game) {
		const cached = isRenderLayerCached(entry.layerId)
		return {
			id: entry.id,
			modId: entry.modId,
			layer: entry.layerId,
			layerId: entry.layerId,
			space: entry.space || 'world',
			game,
			pixelRatio: Number(game?.pixelRatio) || Number(window.devicePixelRatio) || 1,
			frame: state.renderFrame,
			cached,
			cache: cached,
			dirty: isRenderLayerDirty(entry.layerId, game)
		}
	}

	const isRenderCallbackEnabled = function (entry, game) {
		if (!entry || entry.enabled === false) return false
		if (typeof entry.enabled !== 'function') return true
		try {
			return entry.enabled(createRenderCallbackEnabledContext(entry, game)) !== false
		} catch (error) {
			warn('Render callback enabled check from ' + entry.modId + ' failed', error)
			return false
		}
	}

	const registerRenderCallback = function (modId, layerId, fn, options = {}) {
		if (typeof layerId === 'object' && !fn) {
			options = layerId || {}
			layerId = options.layer || options.layerId || options.name || 'ui'
			fn = options.render || options.fn || options.callback
		}
		if (typeof fn !== 'function') {
			warn('Ignoring render callback from ' + (modId || 'anonymous') + ' without a function.')
			return function () {}
		}
		const id = String(options.id || options.name || '') || undefined
		const key = renderCallbackKey(modId, id)
		const normalizedLayerId = normalizeRenderLayerId(layerId)
		const drawOptions = resolveRenderDrawOptions(options)
		state.renderCallbacks[key] = {
			id: id || key,
			key,
			modId: modId || 'anonymous',
			layerId: normalizedLayerId,
			fn,
			order: Number.isFinite(Number(options.order)) ? Number(options.order) : 100,
			enabled: options.enabled,
			space: drawOptions.space,
			copyState: drawOptions.copyState,
			copyTransform: drawOptions.copyTransform
		}
		return function () { delete state.renderCallbacks[key] }
	}

	const createRenderLayerDemandContext = function (entry, game) {
		return {
			id: entry.id,
			modId: entry.modId,
			layer: entry.layerId,
			layerId: entry.layerId,
			game,
			pixelRatio: Number(game?.pixelRatio) || Number(window.devicePixelRatio) || 1,
			frame: state.renderFrame
		}
	}

	const isRenderLayerDemandEnabled = function (entry, game) {
		if (!entry || entry.enabled === false) return false
		if (typeof entry.enabled !== 'function') return true
		try {
			return entry.enabled(createRenderLayerDemandContext(entry, game)) !== false
		} catch (error) {
			warn('Render layer demand check from ' + entry.modId + ' failed', error)
			return false
		}
	}

	const registerRenderLayerDemand = function (modId, layerId, options = {}) {
		if (typeof layerId === 'object') {
			options = layerId || {}
			layerId = options.layer || options.layerId || options.name || 'ui'
		}
		options = options || {}
		const normalizedLayerId = normalizeRenderLayerId(layerId)
		if (options.layerOptions && typeof options.layerOptions === 'object') registerRenderLayerDefinition(normalizedLayerId, options.layerOptions, modId)
		const id = String(options.id || options.name || '') || undefined
		const key = renderLayerDemandKey(modId, id)
		state.renderLayerDemandCallbacks[key] = {
			id: id || key,
			key,
			modId: modId || 'anonymous',
			layerId: normalizedLayerId,
			order: Number.isFinite(Number(options.order)) ? Number(options.order) : 100,
			enabled: options.enabled
		}
		return function () { delete state.renderLayerDemandCallbacks[key] }
	}

	const listEnabledRenderLayerDemandCallbacks = function (game) {
		return Object.keys(state.renderLayerDemandCallbacks).map(function (key) { return state.renderLayerDemandCallbacks[key] }).filter(function (entry) { return isRenderLayerDemandEnabled(entry, game) })
	}

	const describeRenderLayerDemandCallback = function (entry, game) {
		const enabled = isRenderLayerDemandEnabled(entry, game)
		return {
			id: entry.id,
			key: entry.key,
			modId: entry.modId,
			layer: entry.layerId,
			layerId: entry.layerId,
			order: Number(entry.order) || 0,
			enabled,
			active: !!(enabled && hasRenderLayerDemand(entry.layerId))
		}
	}

	const listRenderLayerDemandCallbacks = function (options = {}) {
		const game = getRenderGame(options.game)
		return Object.keys(state.renderLayerDemandCallbacks).map(function (key) {
			return describeRenderLayerDemandCallback(state.renderLayerDemandCallbacks[key], game)
		}).filter(function (entry) {
			return options.enabledOnly === true ? entry.enabled : true
		}).sort(function (a, b) {
			const ao = getRenderLayerDef(a.layerId).order
			const bo = getRenderLayerDef(b.layerId).order
			return (ao - bo) || (a.order - b.order) || String(a.key).localeCompare(String(b.key))
		})
	}

	const listEnabledRenderCallbacks = function (game) {
		return Object.keys(state.renderCallbacks).map(function (key) { return state.renderCallbacks[key] }).filter(function (entry) { return isRenderCallbackEnabled(entry, game) })
	}

	const describeRenderCallback = function (entry, game) {
		const enabled = isRenderCallbackEnabled(entry, game)
		return {
			id: entry.id,
			key: entry.key,
			modId: entry.modId,
			layer: entry.layerId,
			layerId: entry.layerId,
			space: entry.space || 'world',
			order: Number(entry.order) || 0,
			enabled,
			active: !!(enabled && hasRenderLayerDemand(entry.layerId)),
			copyState: entry.copyState !== false,
			copyTransform: entry.copyTransform !== false
		}
	}

	const listRenderCallbacks = function (options = {}) {
		const game = getRenderGame(options.game)
		return Object.keys(state.renderCallbacks).map(function (key) {
			return describeRenderCallback(state.renderCallbacks[key], game)
		}).filter(function (entry) {
			return options.enabledOnly === true ? entry.enabled : true
		}).sort(function (a, b) {
			const ao = getRenderLayerDef(a.layerId).order
			const bo = getRenderLayerDef(b.layerId).order
			return (ao - bo) || (a.order - b.order) || String(a.key).localeCompare(String(b.key))
		})
	}

	const getRenderDiagnosticsSummary = function (game) {
		game = getRenderGame(game)
		const createdLayers = listCreatedRenderLayers(game)
		const callbacks = listRenderCallbacks({ game })
		const layerDemanders = listRenderLayerDemandCallbacks({ game })
		const conflicts = listRenderConflicts()
		return {
			version: RENDER_API_VERSION,
			apiVersion: RENDER_API_VERSION,
			stability: 'stable',
			capabilities: getRenderApiCapabilities(),
			enabled: isRenderApiEnabled(),
			frame: state.renderFrame,
			demandedLayers: listRenderLayerDemands(),
			createdLayers: createdLayers.map(function (layer) { return layer.id }),
			definedLayers: listRenderLayerDefinitions({ game }).map(function (layer) { return layer.id }),
			routedMethods: listRenderMethodRoutes(),
			callbacks: callbacks.length,
			activeCallbacks: callbacks.filter(function (entry) { return entry.active }).map(function (entry) { return entry.key }),
			layerDemanders: layerDemanders.length,
			activeLayerDemanders: layerDemanders.filter(function (entry) { return entry.active }).map(function (entry) { return entry.key }),
			conflicts: conflicts.length,
			conflictCount: conflicts.length,
			timing: getRenderTimingSummary()
		}
	}

	const markRenderCallbackLayerDemands = function (game) {
		for (const entry of listEnabledRenderLayerDemandCallbacks(game)) markActiveRenderLayerDemanded(entry.layerId)
		for (const entry of listEnabledRenderCallbacks(game)) markActiveRenderLayerDemanded(entry.layerId)
	}

	const runRenderCallbacks = function (game) {
		const entries = listEnabledRenderCallbacks(game)
		const manager = ensureRenderLayerManager(game)
		entries.sort(function (a, b) {
			const ao = getRenderLayerDef(a.layerId).order
			const bo = getRenderLayerDef(b.layerId).order
			return (ao - bo) || (a.order - b.order) || String(a.key).localeCompare(String(b.key))
		})
		for (const entry of entries) {
			const frameState = getRenderLayerFrameState(entry.layerId, manager)
			if (!frameState.shouldDraw) continue
			try {
				withRenderLayer(game, entry.layerId, function (ctx, activeGame, layer) {
					measureRenderTiming('callback:' + entry.layerId + ':' + entry.id, function () {
						entry.fn(createRenderCallbackContext(entry, activeGame, layer))
					})
				}, { space: entry.space, copyState: entry.copyState, copyTransform: entry.copyTransform })
				frameState.drew = true
			} catch (error) {
				frameState.failed = true
				warn('Render callback from ' + entry.modId + ' failed', error)
			}
		}
	}

	const markBuiltInRenderLayerDemands = function (game) {
		if (!isRenderApiEnabled() || !game) return
		if (game.touchMode === 1 || game.touchMode === 2) markActiveRenderLayerDemanded('screen-effects')
		if (game.photofobia && game.flashlight && !game.plane) markActiveRenderLayerDemanded('reduced-flashes')
	}

	const beginRenderFrame = function (game) {
		if (game) state.game = game
		installRenderEntityTiming(game)
		state.renderLayerFrameState = {}
		const previousDemands = copyRenderLayerDemandMap(state.renderLastActiveLayerDemands)
		resetActiveRenderLayerDemands()
		if (!isRenderApiEnabled()) {
			state.renderActiveLayerDemands = {}
			state.renderLastActiveLayerDemands = {}
			state.renderLayerFrameState = {}
			const manager = state.renderLayerManager
			if (manager) applyRenderLayerVisibility(manager)
			return
		}
		state.renderFrame += 1
		markBuiltInRenderLayerDemands(game)
		markRenderCallbackLayerDemands(game)
		markCursorDemandForAboveMainLayers()
		markBackgroundDemandForUnderMainLayers()
		const manager = ensureRenderLayerManager(game)
		if (!manager) {
			state.renderLastActiveLayerDemands = copyRenderLayerDemandMap(state.renderActiveLayerDemands)
			return
		}
		clearInactiveRenderLayers(manager, previousDemands)
		applyRenderStackBackground(manager, game)
		syncRenderLayers(manager, { activeOnly: true })
		clearRenderLayers(manager, { activeOnly: true })
		state.renderLastActiveLayerDemands = copyRenderLayerDemandMap(state.renderActiveLayerDemands)
		emitRenderEvent('frameStart', game, manager)
	}

	const detectTouchModeOverlayStyle = function (renderloop) {
		const source = typeof renderloop === 'function' ? Function.prototype.toString.call(renderloop) : ''
		if (/createLinearGradient\s*\(\s*0\s*,\s*0\s*,\s*0\s*,\s*this\.h\s*\)/.test(source)) return 'gradient'
		if (/strokeRect\s*\(\s*0\s*,\s*0\s*,\s*this\.w\s*,\s*this\.h\s*\)/.test(source)) return 'border'
		return 'gradient'
	}

	const renderTouchModeOverlay = function (game) {
		if (!game || (game.touchMode !== 1 && game.touchMode !== 2)) return
		withRenderLayer(game, 'screen-effects', function (ctx) {
			if (state.renderTouchModeOverlayStyle === 'border') {
				const weight = (Number(game.unit) || 0) / 8
				ctx.save()
				try {
					ctx.setTransform(1, 0, 0, 1, 0, 0)
					ctx.strokeStyle = ctx.fillStyle = game.touchMode === 1 ? '#FB1A38' : '#5E78E2'
					ctx.lineWidth = weight * 2
					ctx.strokeRect(0, 0, game.w, game.h)
				} finally {
					ctx.restore()
				}
				return
			}
			const fill = ctx.createLinearGradient(0, 0, 0, game.h)
			if (game.touchMode === 1) {
				fill.addColorStop(0, '#FF241CFF')
				fill.addColorStop(1, '#FFB97F00')
			} else {
				fill.addColorStop(0, '#30F1FFFF')
				fill.addColorStop(1, '#CEFFB400')
			}
			ctx.save()
			try {
				ctx.setTransform(1, 0, 0, 1, 0, 0)
				ctx.globalCompositeOperation = 'multiply'
				ctx.fillStyle = fill
				ctx.fillRect(0, 0, game.w, game.h)
			} finally {
				ctx.restore()
			}
		}, { space: 'screen' })
	}

	const shouldRouteTouchModeOverlay = function (game) {
		return !!(isRenderApiEnabled() && (game?.touchMode === 1 || game?.touchMode === 2) && game.canvas && game.ctx)
	}

	const shouldRouteReducedFlashesOverlay = function (game) {
		return !!(isRenderApiEnabled() && game?.photofobia && game.flashlight && !game.plane && game.canvas && game.ctx)
	}

	const isFullFrameBackgroundFill = function (game, args) {
		const x = Number(args?.[0])
		const y = Number(args?.[1])
		const width = Number(args?.[2])
		const height = Number(args?.[3])
		const gameWidth = Number(game?.w) || 0
		const gameHeight = Number(game?.h) || 0
		return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width) && Number.isFinite(height) && gameWidth > 0 && gameHeight > 0 && Math.abs(x) < 0.001 && Math.abs(y) < 0.001 && Math.abs(width - gameWidth) < 0.001 && Math.abs(height - gameHeight) < 0.001
	}

	const shouldRouteFrameBackgroundFill = function (game) {
		return !!(isRenderApiEnabled() && game?.canvas && game.ctx && hasRenderLayerDemand('background'))
	}

	const getFrameBackgroundFillColor = function (game, ctx) {
		const fill = ctx?.fillStyle
		if (typeof fill === 'string' && fill) return fill
		return game?.plane === 1 ? '#000' : '#fff'
	}

	const getFrameBackgroundFillSignature = function (game, color, args) {
		return [String(color || ''), Number(args?.[2]) || Number(game?.w) || 0, Number(args?.[3]) || Number(game?.h) || 0, Number(game?.plane) || 0].join('|')
	}

	const applyRenderStackBackground = function (manager, game, color) {
		if (!manager?.container) return
		if (isRenderApiEnabled() && hasRenderLayerDemand('background')) manager.container.style.backgroundColor = color || (game?.plane === 1 ? '#000' : '#fff')
		else manager.container.style.backgroundColor = ''
	}

	const clearMainRenderCanvas = function (ctx, width, height, originalClearRect) {
		if (!ctx || typeof originalClearRect !== 'function') return
		ctx.save()
		try {
			if (typeof ctx.setTransform === 'function') ctx.setTransform(1, 0, 0, 1, 0, 0)
			originalClearRect.call(ctx, 0, 0, width, height)
		} finally {
			ctx.restore()
		}
	}

	const routeFrameBackgroundFill = function (game, ctx, args, originalClearRect) {
		const manager = ensureRenderLayerManager(game)
		const layer = manager ? ensureRenderLayer(manager, 'background') : null
		if (!layer?.ctx || layer.isMain) return false
		syncRenderLayerCanvas(manager, layer)
		const backgroundColor = getFrameBackgroundFillColor(game, ctx)
		applyRenderStackBackground(manager, game, backgroundColor)
		const frameState = getRenderLayerFrameState('background', manager)
		const signature = getFrameBackgroundFillSignature(game, backgroundColor, args)
		if (layer.frameBackgroundFillSignature !== signature) {
			layer.frameBackgroundFillSignature = signature
			setRenderLayerDirtyState(layer, true)
			frameState.dirty = true
			frameState.shouldDraw = true
		}
		clearMainRenderCanvas(ctx, Number(game?.w) || Number(args?.[2]) || 0, Number(game?.h) || Number(args?.[3]) || 0, originalClearRect)
		if (!frameState.shouldDraw) return true
		const layerCtx = layer.ctx
		layerCtx.save()
		try {
			if (typeof layerCtx.setTransform === 'function') layerCtx.setTransform(1, 0, 0, 1, 0, 0)
			layerCtx.globalAlpha = 1
			layerCtx.globalCompositeOperation = 'source-over'
			layerCtx.fillStyle = backgroundColor
			layerCtx.fillRect(Number(args[0]) || 0, Number(args[1]) || 0, Number(args[2]) || 0, Number(args[3]) || 0)
			frameState.drew = true
		} catch (error) {
			frameState.failed = true
			throw error
		} finally {
			layerCtx.restore()
		}
		return true
	}

	const beginFrameBackgroundFillRoute = function (game) {
		const ctx = game?.ctx
		if (!ctx || typeof ctx.fillRect !== 'function' || typeof ctx.clearRect !== 'function') return null
		const originalFillRect = ctx.fillRect
		const originalClearRect = ctx.clearRect
		let routed = false
		const patchedFillRect = function (...args) {
			if (!routed && isFullFrameBackgroundFill(game, args)) {
				routed = true
				if (routeFrameBackgroundFill(game, ctx, args, originalClearRect)) return undefined
			}
			return originalFillRect.apply(this, args)
		}
		try {
			ctx.fillRect = patchedFillRect
		} catch (error) {
			return null
		}
		return function () {
			try {
				if (ctx.fillRect === patchedFillRect) ctx.fillRect = originalFillRect
			} catch (error) {}
		}
	}

	const renderReducedFlashesOverlay = function (game) {
		if (!shouldRouteReducedFlashesOverlay(game)) return
		withRenderLayer(game, 'reduced-flashes', function (ctx) {
			const width = Number(game.w) || 0
			const height = Number(game.h) || 0
			if (!width || !height) return
			const centerX = Number(game.w2) || width / 2
			const centerY = Number(game.h2) || height / 2
			const fill = ctx.createRadialGradient(centerX, centerY, height / 4, centerX, centerY, centerX)
			fill.addColorStop(0, '#1120')
			fill.addColorStop(1, '#1129')
			ctx.save()
			try {
				ctx.setTransform(1, 0, 0, 1, 0, 0)
				ctx.fillStyle = fill
				ctx.fillRect(0, 0, width, height)
			} finally {
				ctx.restore()
			}
		}, { space: 'screen' })
	}

	const renderBuiltInFrameOverlays = function (game) {
		renderTouchModeOverlay(game)
		renderReducedFlashesOverlay(game)
	}

	const endRenderFrame = function (game) {
		if (!isRenderApiEnabled()) return
		const manager = ensureRenderLayerManager(game)
		if (!manager) return
		measureRenderTiming('renderCallbacks', function () { runRenderCallbacks(game) })
		measureRenderTiming('renderBuiltInOverlays', function () { renderBuiltInFrameOverlays(game) })
		finishCachedRenderLayerFrame(manager)
		emitRenderEvent('frame', game, manager, 'modloader:render-frame')
	}

	const registerRenderMethodRoute = function (modId, methodName, layerId, options = {}) {
		if (typeof methodName === 'object') {
			options = methodName || {}
			methodName = options.method || options.methodName || options.name
			layerId = options.layer || options.layerId
		} else if (typeof layerId === 'object') {
			options = layerId || {}
			layerId = options.layer || options.layerId
		}
		options = options || {}
		const normalizedMethodName = normalizeRenderMethodName(methodName)
		if (!normalizedMethodName) {
			warn('Ignoring render method route from ' + (modId || 'anonymous') + ' without a valid method name.')
			return function () {}
		}
		const normalizedLayerId = normalizeRenderLayerId(layerId)
		if (options.layerOptions && typeof options.layerOptions === 'object') registerRenderLayerDefinition(normalizedLayerId, options.layerOptions, modId)
		const previousLayerId = RENDER_METHOD_LAYERS[normalizedMethodName] || null
		const previousRegistration = state.renderMethodRouteRegistrations[normalizedMethodName] || null
		const previousOwner = state.renderMethodRouteOwners[normalizedMethodName] || null
		const incomingOwner = normalizeRenderOwner(modId) || 'anonymous'
		if (previousLayerId && previousOwner && incomingOwner !== previousOwner && previousLayerId !== normalizedLayerId) {
			recordRenderConflict('method-route', normalizedMethodName, previousOwner, incomingOwner, previousLayerId, normalizedLayerId)
		}
		const registration = { owner: incomingOwner, layerId: normalizedLayerId }
		RENDER_METHOD_LAYERS[normalizedMethodName] = normalizedLayerId
		state.renderMethodRouteOwners[normalizedMethodName] = incomingOwner
		state.renderMethodRouteRegistrations[normalizedMethodName] = registration
		patchRenderLayerMethod(normalizedMethodName)
		return function () {
			if (state.renderMethodRouteRegistrations[normalizedMethodName] !== registration) return
			if (previousLayerId) RENDER_METHOD_LAYERS[normalizedMethodName] = previousLayerId
			else delete RENDER_METHOD_LAYERS[normalizedMethodName]
			if (previousRegistration) state.renderMethodRouteRegistrations[normalizedMethodName] = previousRegistration
			else delete state.renderMethodRouteRegistrations[normalizedMethodName]
			if (previousRegistration && previousOwner) state.renderMethodRouteOwners[normalizedMethodName] = previousOwner
			else delete state.renderMethodRouteOwners[normalizedMethodName]
		}
	}

	const createRenderScope = function (modId) {
		const cleanupFns = []
		let disposed = false
		const addCleanup = function (cleanup) {
			if (typeof cleanup !== 'function') return cleanup
			if (disposed) {
				try { cleanup() } catch (error) { warn('Render scope cleanup failed for ' + (modId || 'anonymous'), error) }
				return cleanup
			}
			cleanupFns.push(cleanup)
			return cleanup
		}
		const dispose = function () {
			if (disposed) return false
			disposed = true
			while (cleanupFns.length) {
				try { cleanupFns.pop()() }
				catch (error) { warn('Render scope cleanup failed for ' + (modId || 'anonymous'), error) }
			}
			return true
		}
		return {
			get disposed() { return disposed },
			add: addCleanup,
			dispose,
			cleanup: dispose,
			stop: dispose,
			onReady(fn) { return addCleanup(addRenderEventListener('ready', fn, modId)) },
			onFrameStart(fn) { return addCleanup(addRenderEventListener('frameStart', fn, modId)) },
			onBeforeFrame(fn) { return addCleanup(addRenderEventListener('frameStart', fn, modId)) },
			onFrame(fn) { return addCleanup(addRenderEventListener('frame', fn, modId)) },
			onAfterFrame(fn) { return addCleanup(addRenderEventListener('frame', fn, modId)) },
			onLayer(id, fn, options) { return addCleanup(registerRenderCallback(modId, id, fn, options || {})) },
			on(id, fn, options) { return addCleanup(registerRenderCallback(modId, id, fn, options || {})) },
			register(options) { return addCleanup(registerRenderCallback(modId, options || {})) },
			registerLayer(id, options) { return addCleanup(registerScopedRenderLayerDefinition(modId, id, options || {})) },
			defineLayer(id, options) { return addCleanup(registerScopedRenderLayerDefinition(modId, id, options || {})) },
			demandLayer(id, options) { return addCleanup(registerRenderLayerDemand(modId, id, options || {})) },
			demand(id, options) { return addCleanup(registerRenderLayerDemand(modId, id, options || {})) },
			requireLayer(id, options) { return addCleanup(registerRenderLayerDemand(modId, id, options || {})) },
			routeMethod(methodName, layerId, options) { return addCleanup(registerRenderMethodRoute(modId, methodName, layerId, options || {})) },
			registerMethodRoute(methodName, layerId, options) { return addCleanup(registerRenderMethodRoute(modId, methodName, layerId, options || {})) },
			events: {
				ready(fn) { return addCleanup(addRenderEventListener('ready', fn, modId)) },
				frameStart(fn) { return addCleanup(addRenderEventListener('frameStart', fn, modId)) },
				beforeFrame(fn) { return addCleanup(addRenderEventListener('frameStart', fn, modId)) },
				frame(fn) { return addCleanup(addRenderEventListener('frame', fn, modId)) },
				afterFrame(fn) { return addCleanup(addRenderEventListener('frame', fn, modId)) }
			},
			layers: {
				register(id, options) { return addCleanup(registerScopedRenderLayerDefinition(modId, id, options || {})) },
				define(id, options) { return addCleanup(registerScopedRenderLayerDefinition(modId, id, options || {})) },
				demand(id, options) { return addCleanup(registerRenderLayerDemand(modId, id, options || {})) },
				require(id, options) { return addCleanup(registerRenderLayerDemand(modId, id, options || {})) }
			},
			routes: {
				register(methodName, layerId, options) { return addCleanup(registerRenderMethodRoute(modId, methodName, layerId, options || {})) },
				route(methodName, layerId, options) { return addCleanup(registerRenderMethodRoute(modId, methodName, layerId, options || {})) }
			}
		}
	}

	const patchRenderLayerMethod = function (methodName) {
		methodName = normalizeRenderMethodName(methodName)
		if (!methodName || state.renderPatchedMethods[methodName] === true) return false
		if (typeof Game === 'undefined' || !Game.prototype || typeof Game.prototype[methodName] !== 'function') return false
		state.renderPatchedMethods[methodName] = true
		api.patch(Game.prototype, methodName, function (original) {
			return function (...args) {
				const game = this
				return measureRenderTiming(methodName, function () {
					const layerId = getRenderMethodLayer(methodName)
					if (!isRenderApiEnabled() || !layerId || !hasRenderLayerDemand(layerId)) return original.apply(game, args)
					const manager = ensureRenderLayerManager(game)
					const frameState = getRenderLayerFrameState(layerId, manager)
					if (!frameState.shouldDraw) return undefined
					try {
						const result = withRenderLayer(game, layerId, function () {
							return original.apply(game, args)
						})
						frameState.drew = true
						return result
					} catch (error) {
						frameState.failed = true
						throw error
					}
				})
			}
		})
		return true
	}

	const installRenderApi = function (game) {
		if (game) state.game = game
		if (typeof Game === 'undefined' || !Game.prototype) return
		if (!state.renderInstalled) {
			state.renderInstalled = true
			state.renderTouchModeOverlayStyle = detectTouchModeOverlayStyle(Game.prototype.renderloop)
			api.patch(Game.prototype, 'renderloop', function (original) {
				return function (...args) {
					const game = this
					return measureRenderTiming('renderloop', function () {
						beginRenderFrame(game)
						const renderLayerManager = isRenderApiEnabled() ? ensureRenderLayerManager(game) : null
						const routeTouchModeOverlay = shouldRouteTouchModeOverlay(game) && !!renderLayerManager
						const routeReducedFlashesOverlay = shouldRouteReducedFlashesOverlay(game) && !!renderLayerManager
						const restoreFrameBackgroundFillRoute = shouldRouteFrameBackgroundFill(game) && !!renderLayerManager ? beginFrameBackgroundFillRoute(game) : null
						const previousTouchMode = game.touchMode
						const previousPhotofobia = game.photofobia
						if (routeTouchModeOverlay) game.touchMode = 0
						if (routeReducedFlashesOverlay) game.photofobia = false
						try {
							return original.apply(game, args)
						} finally {
							if (restoreFrameBackgroundFillRoute) restoreFrameBackgroundFillRoute()
							if (routeTouchModeOverlay) game.touchMode = previousTouchMode
							if (routeReducedFlashesOverlay) game.photofobia = previousPhotofobia
							endRenderFrame(game)
						}
					})
				}
			})
			api.patch(Game.prototype, 'initScreenSize', function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					if (isRenderApiEnabled()) {
						const manager = ensureRenderLayerManager(this)
						if (manager) syncRenderLayers(manager)
					}
					return result
				}
			})
			api.patch(Game.prototype, 'initScreenSizeMobile', function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					if (isRenderApiEnabled()) {
						const manager = ensureRenderLayerManager(this)
						if (manager) syncRenderLayers(manager)
					}
					return result
				}
			})
			for (const methodName in RENDER_METHOD_LAYERS) patchRenderLayerMethod(methodName)
		}
		if (isRenderApiEnabled() && game?.canvas) ensureRenderLayerManager(game)
	}

	const createRenderApi = function (modId) {
		return {
			version: RENDER_API_VERSION,
			apiVersion: RENDER_API_VERSION,
			stability: 'stable',
			capabilities: RENDER_API_CAPABILITIES,
			supports: supportsRenderCapability,
			getCapabilities: getRenderApiCapabilities,
			contract: getRenderApiContract,
			conflicts: listRenderConflicts,
			clearConflicts: clearRenderConflicts,
			install(game) {
				installRenderApi(game)
				return state.renderLayerManager
			},
			isEnabled: isRenderApiEnabled,
			setEnabled(value) { return setRenderApiEnabled(value) },
			createScope() { return createRenderScope(modId) },
			scope() { return createRenderScope(modId) },
			isAvailable(game) { return isRenderApiEnabled() && !!ensureRenderLayerManager(game) },
			getLayer(id, game, options) { return getPublicRenderLayer(id, game, options, modId) },
			layer(id, game, options) { return getPublicRenderLayer(id, game, options, modId) },
			context(id, game, options) { return getPublicRenderLayer(id, game, options, modId)?.ctx || null },
			demandedLayers: listRenderLayerDemands,
			isLayerDemanded(id) { return hasRenderLayerDemand(id) },
			describeLayer: describeRenderLayerInfo,
			layerInfo: describeRenderLayerInfo,
			getLayerInfo: describeRenderLayerInfo,
			layerDemanders: listRenderLayerDemandCallbacks,
			definedLayers: listRenderLayerDefinitions,
			createdLayers(game) { return listCreatedRenderLayers(game) },
			callbacks: listRenderCallbacks,
			summary(game) { return getRenderDiagnosticsSummary(game) },
			enableTiming(options) { return enableRenderTiming(options || {}) },
			disableTiming(options) { return disableRenderTiming(options || {}) },
			clearTiming: clearRenderTiming,
			renderTimings: listRenderTimingMethods,
			timing: {
				isEnabled() { return !!state.renderTimingEnabled },
				areEntitiesEnabled() { return !!state.renderTimingEntitiesEnabled },
				areVfxEnabled() { return !!state.renderTimingVfxEnabled },
				detailMethods() { return state.renderTimingEntityDetailMethods.slice() },
				enable(options) { return enableRenderTiming(options || {}) },
				disable(options) { return disableRenderTiming(options || {}) },
				setEnabled(value, options) { return setRenderTimingEnabled(value, options || {}) },
				clear: clearRenderTiming,
				summary: getRenderTimingSummary,
				methods: listRenderTimingMethods,
				entities: listRenderTimingEntities,
				entityMethods: listRenderTimingEntities,
				vfx: listRenderTimingVfx,
				effects: listRenderTimingVfx,
				list: listRenderTimingMethods
			},
			onReady(fn) { return addRenderEventListener('ready', fn, modId) },
			onFrameStart(fn) { return addRenderEventListener('frameStart', fn, modId) },
			onBeforeFrame(fn) { return addRenderEventListener('frameStart', fn, modId) },
			onFrame(fn) { return addRenderEventListener('frame', fn, modId) },
			onAfterFrame(fn) { return addRenderEventListener('frame', fn, modId) },
			demandLayer(id, options) { return registerRenderLayerDemand(modId, id, options || {}) },
			demand(id, options) { return registerRenderLayerDemand(modId, id, options || {}) },
			requireLayer(id, options) { return registerRenderLayerDemand(modId, id, options || {}) },
			releaseLayer(id, options) { return releaseRenderLayerDemand(id, options || {}) },
			releaseDemand(id, options) { return releaseRenderLayerDemand(id, options || {}) },
			releaseLayerDemand(id, options) { return releaseRenderLayerDemand(id, options || {}) },
			routeMethod(methodName, layerId, options) { return registerRenderMethodRoute(modId, methodName, layerId, options || {}) },
			registerMethodRoute(methodName, layerId, options) { return registerRenderMethodRoute(modId, methodName, layerId, options || {}) },
			routedMethods: listRenderMethodRoutes,
			methodRoutes: listRenderMethodRoutes,
			getMethodLayer(methodName) { return getRenderMethodLayer(methodName) },
			isMethodRouted(methodName) { return isRenderMethodRouted(methodName) },
			withLayer(id, fn, options = {}) {
				const layerId = markRenderLayerDemanded(id, options)
				const game = getRenderGame(options.game)
				return withRenderLayer(game, layerId, function (ctx, activeGame, layer) {
					return fn(ctx, activeGame, publicRenderLayer(layer))
				}, options, modId)
			},
			onLayer(id, fn, options) { return registerRenderCallback(modId, id, fn, options || {}) },
			on(id, fn, options) { return registerRenderCallback(modId, id, fn, options || {}) },
			register(options) { return registerRenderCallback(modId, options || {}) },
			registerLayer(id, options) { return registerRenderLayerDefinition(id, options || {}, modId) },
			defineLayer(id, options) { return registerRenderLayerDefinition(id, options || {}, modId) },
			clear(id, game) {
				const layer = getPublicRenderLayer(id, game)
				if (layer) layer.clear()
			},
			sync(game) {
				if (!isRenderApiEnabled()) return null
				const manager = ensureRenderLayerManager(game)
				if (manager) syncRenderLayers(manager)
				return manager
			},
			markDirty(id, game) { return markRenderLayerDirty(id, true, game) },
			markClean(id, game) { return markRenderLayerDirty(id, false, game) },
			isDirty(id, game) { return isRenderLayerDirty(id, game) },
			layers: {
				demands: listRenderLayerDemands,
				demanded: listRenderLayerDemands,
				defined: listRenderLayerDefinitions,
				describe: describeRenderLayerInfo,
				info: describeRenderLayerInfo,
				created(game) { return listCreatedRenderLayers(game) },
				demanders: listRenderLayerDemandCallbacks,
				isDemanded(id) { return hasRenderLayerDemand(id) },
				isDirty(id, game) { return isRenderLayerDirty(id, game) },
				markDirty(id, game) { return markRenderLayerDirty(id, true, game) },
				markClean(id, game) { return markRenderLayerDirty(id, false, game) },
				register(id, options) { return registerRenderLayerDefinition(id, options || {}, modId) },
				define(id, options) { return registerRenderLayerDefinition(id, options || {}, modId) },
				demand(id, options) { return registerRenderLayerDemand(modId, id, options || {}) },
				require(id, options) { return registerRenderLayerDemand(modId, id, options || {}) },
				release(id, options) { return releaseRenderLayerDemand(id, options || {}) },
				releaseDemand(id, options) { return releaseRenderLayerDemand(id, options || {}) },
				list(game) {
					if (!isRenderApiEnabled()) return []
					const manager = ensureRenderLayerManager(game)
					if (!manager) return []
					return Object.keys(manager.layers).map(function (id) { return publicRenderLayer(manager.layers[id]) })
				},
				get(id, game, options) { return getPublicRenderLayer(id, game, options, modId) },
				ensure(id, options, game) { return getPublicRenderLayer(id, game, options, modId) },
				clear(id, game) {
					const layer = getPublicRenderLayer(id, game)
					if (layer) layer.clear()
				},
				with(id, fn, options = {}) {
					const layerId = markRenderLayerDemanded(id, options)
					return withRenderLayer(getRenderGame(options.game), layerId, function (ctx, activeGame, layer) {
						return fn(ctx, activeGame, publicRenderLayer(layer))
					}, options, modId)
				}
			},
			events: {
				ready(fn) { return addRenderEventListener('ready', fn, modId) },
				frameStart(fn) { return addRenderEventListener('frameStart', fn, modId) },
				beforeFrame(fn) { return addRenderEventListener('frameStart', fn, modId) },
				frame(fn) { return addRenderEventListener('frame', fn, modId) },
				afterFrame(fn) { return addRenderEventListener('frame', fn, modId) }
			},
			routes: {
				list: listRenderMethodRoutes,
				register(methodName, layerId, options) { return registerRenderMethodRoute(modId, methodName, layerId, options || {}) },
				route(methodName, layerId, options) { return registerRenderMethodRoute(modId, methodName, layerId, options || {}) },
				get(methodName) { return getRenderMethodLayer(methodName) },
				isRouted(methodName) { return isRenderMethodRouted(methodName) }
			},
			diagnostics: {
				summary(game) { return getRenderDiagnosticsSummary(game) },
				conflicts: listRenderConflicts,
				clearConflicts: clearRenderConflicts,
				contract: getRenderApiContract
			}
		}
	}


	const GAME_HUD_ANIMATION_MS = 260

	const isGameHudDock = function (dock) {
		return typeof dock === 'string' && dock.indexOf('game-') === 0
	}

	const getGameHudSideForDock = function (dock) {
		const name = String(dock || '')
		if (name.indexOf('top') >= 0) return 'top'
		if (name.indexOf('bottom') >= 0) return 'bottom'
		if (name.indexOf('left') >= 0) return 'left'
		return 'right'
	}

	const normalizeGameHudSide = function (side) {
		const value = String(side || '').toLowerCase()
		if (value.indexOf('top') >= 0) return 'top'
		if (value.indexOf('bottom') >= 0) return 'bottom'
		if (value.indexOf('left') >= 0) return 'left'
		if (value.indexOf('right') >= 0) return 'right'
		return 'right'
	}

	const gameHudKey = function (modId, id) {
		return (modId || 'anonymous') + ':' + (id || 'hud')
	}

	const ensureGameHudStyle = function () {
		if (document.getElementById('modloader-game-hud-style')) return
		const style = document.createElement('style')
		style.id = 'modloader-game-hud-style'
		style.textContent = [
			'body.modloader-game-hud-ready .shop,',
			'body.modloader-game-hud-ready .shopToggle,',
			'body.modloader-game-hud-ready .chatIcon,',
			'body.modloader-game-hud-ready .messenger,',
			'body.modloader-game-hud-ready .hintBubble,',
			'body.modloader-game-hud-ready .explainer,',
			'body.modloader-game-hud-ready .shopGamepadHint,',
			'body.modloader-game-hud-ready .mobileToggle,',
			'body.modloader-game-hud-ready .mobileEraser,',
			'body.modloader-game-hud-ready .mobileRelocator,',
			'body.modloader-game-hud-ready .mobileChat,',
			'body.modloader-game-hud-ready .mobileMenu,',
			'body.modloader-game-hud-ready .modloader-ui-dock-game-bottom-right,',
			'body.modloader-game-hud-ready .modloader-ui-dock-game-top-right,',
			'body.modloader-game-hud-ready .modloader-game-hud-item { transition: transform .26s cubic-bezier(.2,.8,.2,1), opacity .18s ease, filter .26s ease; will-change: transform, opacity; }',
			'body.modloader-game-hud-hidden .shop { transform: translateX(calc(100% + 32px)); opacity: 0; pointer-events: none; }',
			'body.modloader-game-hud-hidden .shopToggle,',
			'body.modloader-game-hud-hidden .chatIcon,',
			'body.modloader-game-hud-hidden .explainer,',
			'body.modloader-game-hud-hidden .modloader-ui-dock-game-bottom-right { transform: translateY(calc(100% + 32px)); opacity: 0; pointer-events: none; }',
			'body.modloader-game-hud-hidden .messenger { transform: translateX(calc(-100% - 32px)); opacity: 0; pointer-events: none; }',
			'body.modloader-game-hud-hidden .hintBubble { transform: translateX(calc(100vw + 32px)); opacity: 0; pointer-events: none; }',
			'body.modloader-game-hud-hidden .shopGamepadHint,',
			'body.modloader-game-hud-hidden .modloader-ui-dock-game-top-right { transform: translateY(calc(-100% - 32px)); opacity: 0; pointer-events: none; }',
			'body.modloader-game-hud-hidden .mobileToggle,',
			'body.modloader-game-hud-hidden .mobileEraser,',
			'body.modloader-game-hud-hidden .mobileRelocator,',
			'body.modloader-game-hud-hidden .mobileChat,',
			'body.modloader-game-hud-hidden .mobileMenu { transform: translate(-50%, calc(100% + 40px)) !important; opacity: 0; pointer-events: none; }',
			'body.modloader-game-hud-hidden .modloader-game-hud-side-left { transform: translateX(calc(-100vw - 32px)) !important; opacity: 0; pointer-events: none; }',
			'body.modloader-game-hud-hidden .modloader-game-hud-side-right { transform: translateX(calc(100vw + 32px)) !important; opacity: 0; pointer-events: none; }',
			'body.modloader-game-hud-hidden .modloader-game-hud-side-top { transform: translateY(calc(-100vh - 32px)) !important; opacity: 0; pointer-events: none; }',
			'body.modloader-game-hud-hidden .modloader-game-hud-side-bottom { transform: translateY(calc(100vh + 32px)) !important; opacity: 0; pointer-events: none; }'
		].join('\n')
		document.head.appendChild(style)
	}

	const applyGameHudBodyClass = function () {
		if (!document.body) return
		document.body.classList.add('modloader-game-hud-ready')
		document.body.classList.toggle('modloader-game-hud-hidden', !!state.gameHudHidden)
	}

	const getGameHudGame = function (game) {
		return game || state.game || uiPagesCurrentGame || null
	}

	const isEditableGameHudTarget = function (target) {
		if (!target) return false
		if (target.isContentEditable) return true
		const tag = String(target.tagName || '').toLowerCase()
		return tag === 'input' || tag === 'textarea' || tag === 'select'
	}

	const handleGameHudHotkey = function (event) {
		if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return
		if (isEditableGameHudTarget(event.target)) return
		const key = String(event.key || '').toLowerCase()
		if (key !== 'h' && event.keyCode !== 72) return
		event.preventDefault()
		event.stopImmediatePropagation()
		toggleGameHudHidden()
	}

	const getGameHudVisibilityProgress = function () {
		const animation = state.gameHudAnimation
		if (!animation) return state.gameHudHidden ? 0 : 1
		const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
		const t = Math.min(1, Math.max(0, (now - animation.startedAt) / animation.duration))
		const eased = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
		const value = animation.from + (animation.to - animation.from) * eased
		if (t >= 1) state.gameHudAnimation = null
		return value
	}

	const patchGameHudRendering = function () {
		if (state.gameHudRenderPatched || typeof Game === 'undefined' || !Game.prototype) return
		state.gameHudRenderPatched = true
		const patchRender = function (methodName) {
			api.patch(Game.prototype, methodName, function (original) {
				return function (...args) {
					const progress = getGameHudVisibilityProgress()
					if (progress <= .001) return undefined
					if (progress >= .999) return original.apply(this, args)
					this.ctx.save()
					try {
						this.ctx.globalAlpha *= progress
						this.ctx.translate(0, -(1 - progress) * this.screenUnit * 2.4)
						return original.apply(this, args)
					} finally {
						this.ctx.restore()
					}
				}
			})
		}
		patchRender('renderResources')
		patchRender('renderDarkResources')
	}

	const captureVanillaGameHudState = function (game) {
		const messenger = game?.messenger
		const shop = game?.shop
		const vessel = shop?.vessel
		return {
			messengerShown: messenger?.messagesShown === 1,
			messengerScrollTop: messenger?.element?.scrollTop || 0,
			shopScrollTop: vessel?.scrollTop || 0,
			shopMinimized: !!vessel?.classList?.contains('minimized'),
			shopToggleToggled: !!shop?.shopToggle?.classList?.contains('toggled'),
			shopSelected: !!shop?.selected,
			shopSelectedId: Number.isFinite(shop?.selectedId) ? shop.selectedId : 0,
			mobileShopVisible: !!vessel?.classList?.contains('visible'),
			mobileToggleActive: !!shop?.mobileToggle?.classList?.contains('active'),
			hoveredResource: game?.hoveredResource
		}
	}

	const closeVanillaGameHudBeforeHide = function (game) {
		if (!game) return
		if (game.messenger?.messagesShown === 1) game.messenger.hideMessages?.()
		game.removeHint?.()
		game.hoveredResource = false
		game.hoveredLabel = false
		const shop = game.shop
		if (shop?.vessel?.classList?.contains('visible')) shop.vessel.classList.remove('visible')
		shop?.mobileToggle?.classList?.remove('active')
	}

	const restoreVanillaGameHudState = function (game, snapshot) {
		if (!game || !snapshot) return
		const messenger = game.messenger
		const shop = game.shop
		const vessel = shop?.vessel
		if (vessel) {
			vessel.classList.toggle('minimized', !!snapshot.shopMinimized)
			vessel.classList.toggle('visible', !!snapshot.mobileShopVisible)
			vessel.scrollTop = snapshot.shopScrollTop || 0
		}
		shop?.shopToggle?.classList?.toggle('toggled', !!snapshot.shopToggleToggled)
		shop?.mobileToggle?.classList?.toggle('active', !!snapshot.mobileToggleActive)
		if (shop?.items?.length) {
			for (const item of shop.items) item?.html?.classList?.remove('selected')
			shop.selectedId = Math.min(Math.max(0, snapshot.shopSelectedId || 0), shop.items.length - 1)
			shop.selected = !!snapshot.shopSelected
			if (shop.selected) shop.items[shop.selectedId]?.html?.classList?.add('selected')
		}
		if (messenger) {
			if (snapshot.messengerShown) messenger.showMessages?.()
			else messenger.hideMessages?.()
		}
		if (snapshot.hoveredResource !== undefined) game.hoveredResource = snapshot.hoveredResource
		const restoreScroll = function () {
			if (vessel) vessel.scrollTop = snapshot.shopScrollTop || 0
			if (messenger?.element) messenger.element.scrollTop = snapshot.messengerScrollTop || 0
		}
		requestAnimationFrame(restoreScroll)
		setTimeout(restoreScroll, 140)
	}

	const getGameHudEntryElements = function (entry) {
		const out = []
		const add = function (value) {
			if (!value) return
			if (typeof value === 'string') {
				document.querySelectorAll(value).forEach(function (el) { out.push(el) })
				return
			}
			if (value instanceof Element) {
				out.push(value)
				return
			}
			if (typeof value[Symbol.iterator] === 'function') {
				for (const item of value) add(item)
			}
		}
		try {
			add(entry.element)
			add(entry.elements)
			if (entry.selector) add(entry.selector)
			if (typeof entry.getElement === 'function') add(entry.getElement())
			if (typeof entry.getElements === 'function') add(entry.getElements())
		} catch (error) {
			warn('HUD element lookup from ' + entry.modId + ' failed', error)
		}
		return Array.from(new Set(out)).filter(function (el) { return el && el.nodeType === 1 })
	}

	const clearGameHudElementClasses = function (element) {
		element.classList.remove('modloader-game-hud-item', 'modloader-game-hud-item-hidden', 'modloader-game-hud-side-left', 'modloader-game-hud-side-right', 'modloader-game-hud-side-top', 'modloader-game-hud-side-bottom')
	}

	const syncGameHudEntry = function (entry) {
		const elements = getGameHudEntryElements(entry)
		for (const previous of entry.lastElements || []) {
			if (elements.indexOf(previous) === -1) clearGameHudElementClasses(previous)
		}
		entry.lastElements = elements
		if (entry.managed === false) return
		for (const element of elements) {
			element.classList.add('modloader-game-hud-item', 'modloader-game-hud-side-' + entry.side)
			element.classList.toggle('modloader-game-hud-item-hidden', !!state.gameHudHidden)
		}
	}

	const syncGameHudEntries = function () {
		for (const key in state.gameHudItems) syncGameHudEntry(state.gameHudItems[key])
	}

	const createGameHudEntryContext = function (entry, game) {
		return { id: entry.id, key: entry.key, modId: entry.modId, hidden: !!state.gameHudHidden, game, state: entry.savedState, elements: getGameHudEntryElements(entry) }
	}

	const callGameHudEntry = function (entry, name, game, extra) {
		const fn = entry[name]
		if (typeof fn !== 'function') return undefined
		try {
			return fn(Object.assign(createGameHudEntryContext(entry, game), extra || {}))
		} catch (error) {
			warn('HUD ' + name + ' from ' + entry.modId + ' failed', error)
			return undefined
		}
	}

	const captureGameHudEntries = function (game) {
		for (const key in state.gameHudItems) {
			const entry = state.gameHudItems[key]
			const ctx = createGameHudEntryContext(entry, game)
			try {
				if (typeof entry.capture === 'function') entry.savedState = entry.capture(ctx)
				else if (typeof entry.getState === 'function') entry.savedState = entry.getState(ctx)
			} catch (error) {
				warn('HUD state capture from ' + entry.modId + ' failed', error)
			}
			callGameHudEntry(entry, 'beforeHide', game)
			callGameHudEntry(entry, 'onHide', game)
		}
	}

	const restoreGameHudEntries = function (game) {
		for (const key in state.gameHudItems) {
			const entry = state.gameHudItems[key]
			callGameHudEntry(entry, 'beforeShow', game)
			try {
				const ctx = createGameHudEntryContext(entry, game)
				if (typeof entry.restore === 'function') entry.restore(entry.savedState, ctx)
				else if (typeof entry.restoreState === 'function') entry.restoreState(entry.savedState, ctx)
			} catch (error) {
				warn('HUD state restore from ' + entry.modId + ' failed', error)
			}
			callGameHudEntry(entry, 'onShow', game)
		}
	}

	const setGameHudAnimation = function (hidden) {
		const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
		state.gameHudAnimation = {
			from: getGameHudVisibilityProgress(),
			to: hidden ? 0 : 1,
			startedAt: now,
			duration: GAME_HUD_ANIMATION_MS
		}
	}

	const setGameHudHidden = function (hidden, options = {}) {
		hidden = !!hidden
		installGameHud(options.game)
		if (state.gameHudHidden === hidden && !options.force) return state.gameHudHidden
		const game = getGameHudGame(options.game)
		setGameHudAnimation(hidden)
		if (hidden) {
			state.gameHudSnapshot = captureVanillaGameHudState(game)
			captureGameHudEntries(game)
			closeVanillaGameHudBeforeHide(game)
		} else {
			restoreVanillaGameHudState(game, state.gameHudSnapshot)
			restoreGameHudEntries(game)
		}
		state.gameHudHidden = hidden
		applyGameHudBodyClass()
		syncGameHudEntries()
		window.dispatchEvent(new CustomEvent('modloader:game-hud', { detail: { hidden, game } }))
		return state.gameHudHidden
	}

	const toggleGameHudHidden = function (options = {}) {
		return setGameHudHidden(!state.gameHudHidden, options)
	}

	const registerGameHudItem = function (modId, options) {
		options = options || {}
		const id = options.id || options.name || 'hud'
		const key = gameHudKey(modId, id)
		if (!options.element && !options.elements && !options.selector && !options.getElement && !options.getElements && !options.capture && !options.getState && !options.restore && !options.restoreState) {
			warn('Ignoring HUD registration from ' + (modId || 'anonymous') + ' without an element or callback.')
			return function () {}
		}
		if (state.gameHudItems[key]?.lastElements) {
			for (const element of state.gameHudItems[key].lastElements) clearGameHudElementClasses(element)
		}
		const entry = {
			id,
			key,
			modId: modId || 'anonymous',
			element: options.element,
			elements: options.elements,
			selector: options.selector,
			getElement: options.getElement,
			getElements: options.getElements,
			side: normalizeGameHudSide(options.side || options.edge || options.anchor),
			managed: options.managed !== false,
			capture: options.capture,
			getState: options.getState,
			restore: options.restore,
			restoreState: options.restoreState,
			beforeHide: options.beforeHide,
			onHide: options.onHide,
			beforeShow: options.beforeShow,
			onShow: options.onShow,
			savedState: undefined,
			lastElements: []
		}
		state.gameHudItems[key] = entry
		syncGameHudEntry(entry)
		return function () { unregisterGameHudItem(modId, id, options.element) }
	}

	const unregisterGameHudItem = function (modId, id, element) {
		const key = gameHudKey(modId, id)
		const entry = state.gameHudItems[key]
		if (!entry || (element && entry.element && entry.element !== element)) return
		for (const item of entry.lastElements || []) clearGameHudElementClasses(item)
		delete state.gameHudItems[key]
	}

	const createUiHudApi = function (modId) {
		return {
			register(options) { return registerGameHudItem(modId, options) },
			unregister(id) { return unregisterGameHudItem(modId, id) },
			hide(options) { return setGameHudHidden(true, options) },
			show(options) { return setGameHudHidden(false, options) },
			toggle(options) { return toggleGameHudHidden(options) },
			isHidden() { return !!state.gameHudHidden },
			refresh() { syncGameHudEntries() }
		}
	}

	const patchVanillaGameHudSyncMethod = function (target, methodName, gameFromThis) {
		if (!target || typeof target[methodName] !== 'function') return
		api.patch(target, methodName, function (original) {
			return function (...args) {
				const result = original.apply(this, args)
				syncVanillaGameHudVisibility(gameFromThis ? gameFromThis(this) : this)
				return result
			}
		})
	}

	const installVanillaGameHudSync = function (game) {
		if (game) state.game = game
		if (!state.vanillaGameHudSyncInstalled) {
			state.vanillaGameHudSyncInstalled = true
			if (typeof Shop !== 'undefined' && Shop.prototype) {
				patchVanillaGameHudSyncMethod(Shop.prototype, 'init', function (shop) { return shop.master })
				patchVanillaGameHudSyncMethod(Shop.prototype, 'check', function (shop) { return shop.master })
			}
			if (typeof Pinhole !== 'undefined' && Pinhole.prototype) {
				patchVanillaGameHudSyncMethod(Pinhole.prototype, 'init', function (pinhole) { return pinhole.master })
			}
			if (typeof Game !== 'undefined' && Game.prototype) {
				patchVanillaGameHudSyncMethod(Game.prototype, 'watchCredits')
				patchVanillaGameHudSyncMethod(Game.prototype, 'closeCredits')
			}
		}
		syncVanillaGameHudVisibility(game)
	}

	const installGameHud = function (game) {
		if (game) state.game = game
		if (!document.body) return
		ensureGameHudStyle()
		applyGameHudBodyClass()
		if (!state.gameHudInstalled) {
			state.gameHudInstalled = true
			document.addEventListener('keydown', handleGameHudHotkey, true)
		}
		patchGameHudRendering()
		syncGameHudEntries()
	}

	const uiPages = []
	let uiPagesInstalled = false
	let uiPagesCurrentGame = null
	let uiPagesActivePage = null
	let uiPagesActiveSplash = null

	const uiPageKey = function (modId, id) {
		return `${modId || 'anonymous'}:${id || 'page'}`
	}

	const createUiPagesApi = function (modId) {
		return {
			register(options) { return registerUiPage(modId, options) },
			open(id, splash) { return openUiPage(modId, id, splash) },
			close(id) { return closeUiPage(modId, id) },
			refresh(id) { return refreshUiPage(modId, id) },
			isActive(id) { return isUiPageActive(modId, id) },
			currentGame() { return uiPagesActiveSplash?.master || uiPagesCurrentGame },
			installHorizontalWheel,
			installTransientScrollbar,
			installInertialScroll,
			originalBackLabel,
			normalizeGameText,
			resetViewportScroll,
			createRule
		}
	}

	const registerUiPage = function (modId, options) {
		const page = normalizeUiPage(modId, options)
		const index = uiPages.findIndex(function (item) { return item.key === page.key })
		if (index >= 0) uiPages[index] = page
		else uiPages.push(page)
		ensureUiPagesInstalled()
		if (uiPagesInstalled && uiPagesCurrentGame?.splash) attachUiPageButton(uiPagesCurrentGame.splash, page)
		return {
			open(splash) { openUiPage(modId, page.id, splash) },
			close() { closeUiPage(modId, page.id) },
			refresh() { refreshUiPage(modId, page.id) },
			isActive() { return isUiPageActive(modId, page.id) }
		}
	}

	const normalizeUiPage = function (modId, options) {
		if (!options?.id) throw new Error('ModLoader UI page registration requires an id.')
		const id = String(options.id)
		const prefix = options.prefix || `modloader-ui-${saveSafeText(modId || 'anonymous')}-${saveSafeText(id)}`
		return Object.assign({
			id,
			key: uiPageKey(modId, id),
			modId: modId || 'anonymous',
			prefix,
			activeClass: prefix + '-active',
			buttonClass: prefix + '-button',
			pageClass: prefix + '-page',
			contentClass: prefix + '-content',
			scrollbarVisibleClass: prefix + '-scrollbar-visible',
			brandClass: prefix + '-brand',
			logoClass: prefix + '-logo',
			logoMarkClass: prefix + '-logo-mark',
			subtitleClass: prefix + '-subtitle',
			backClass: prefix + '-back',
			width: '760px',
			contentHeight: '560px',
			mobileContentHeight: '610px',
			contentOffset: '335px',
			mobileContentOffset: '310px',
			inertialScroll: false
		}, options)
	}

	const ensureUiPagesInstalled = function () {
		if (uiPagesInstalled || typeof Splash === 'undefined' || typeof Game === 'undefined') return
		uiPagesInstalled = true
		installUiPageStyles()
		patchUiPageSplash('init')
		patchUiPageSplash('initMobile')
		window.addEventListener('keydown', handleUiPageEscape, true)
		api.patch(Game.prototype, 'changeLanguage', function (original) {
			return function (id) {
				const openPageKey = uiPagesActivePage?.key
				const scrollTop = uiPagesActiveSplash?.element?.querySelector('.modloader-ui-page-content')?.scrollTop || 0
				const result = original.call(this, id)
				uiPagesCurrentGame = this
				uiPagesActivePage = null
				uiPagesActiveSplash = null
				if (openPageKey) {
					const page = findUiPageByKey(openPageKey)
					if (page) showUiPage(page, this.splash, { scrollTop })
				} else attachAllUiPages(this.splash)
				return result
			}
		})
	}

	const patchUiPageSplash = function (methodName) {
		api.patch(Splash.prototype, methodName, function (original) {
			return function (...args) {
				const result = original.apply(this, args)
				uiPagesCurrentGame = this.master
				attachAllUiPages(this)
				return result
			}
		})
	}

	const attachAllUiPages = function (splash) {
		if (!splash?.element) return
		for (const page of uiPages) attachUiPageButton(splash, page)
	}

	const attachUiPageButton = function (splash, page) {
		if (page.enabled && page.enabled(createUiPageContext(page, splash)) === false) return
		const menu = splash.element.querySelector('.menu')
		let button = page.findButton ? page.findButton(splash, menu) : splash.element.querySelector('.' + page.buttonClass)
		if (!button) {
			if (!menu) return
			button = document.createElement('div')
			button.classList.add('menuItem')
			const anchor = page.insertBefore ? page.insertBefore(splash, menu) : menu.querySelector('.resetProgressbar')?.closest('.menuItem')
			if (anchor) menu.insertBefore(button, anchor)
			else menu.append(button)
			if (Array.isArray(splash.items)) {
				const anchorIndex = anchor ? splash.items.indexOf(anchor) : -1
				if (anchorIndex >= 0) splash.items.splice(anchorIndex, 0, button)
				else splash.items.push(button)
			}
		}
		button.classList.add(page.buttonClass)
		updateUiPageButton(button, page, splash)
		if (button.dataset.modloaderUiPageKey === page.key) return
		button.dataset.modloaderUiPageKey = page.key
		const openPage = function (event) {
			event?.preventDefault()
			event?.stopPropagation()
			showUiPage(page, splash)
		}
		button.onclick = openPage
		button.ontouchstart = openPage
	}

	const updateUiPageButton = function (button, page, splash) {
		const ctx = createUiPageContext(page, splash)
		if (page.updateButton) {
			page.updateButton(button, ctx)
			return
		}
		button.textContent = resolveUiPageLabel(page.menuLabel, splash.master, page.id)
	}

	const openUiPage = function (modId, id, splash) {
		const page = findUiPage(modId, id)
		if (page) showUiPage(page, splash || uiPagesCurrentGame?.splash)
	}

	const closeUiPage = function (modId, id) {
		if (!uiPagesActivePage || (id && uiPagesActivePage.key !== uiPageKey(modId, id))) return
		hideUiPage(uiPagesActivePage, uiPagesActiveSplash)
	}

	const refreshUiPage = function (modId, id) {
		const key = id ? uiPageKey(modId, id) : null
		if (uiPagesActivePage && (!key || uiPagesActivePage.key === key)) {
			renderUiPage(uiPagesActivePage, uiPagesActiveSplash, uiPagesActiveSplash?.element?.querySelector('.' + uiPagesActivePage.pageClass))
			return
		}
		if (uiPagesCurrentGame?.splash) attachAllUiPages(uiPagesCurrentGame.splash)
	}

	const isUiPageActive = function (modId, id) {
		return !!uiPagesActivePage && uiPagesActivePage.key === uiPageKey(modId, id)
	}

	const showUiPage = function (page, splash, options = {}) {
		if (!splash?.element) return
		if (uiPagesActivePage && (uiPagesActivePage.key !== page.key || uiPagesActiveSplash !== splash)) hideUiPage(uiPagesActivePage, uiPagesActiveSplash)
		let pageElement = splash.element.querySelector('.' + page.pageClass)
		if (!pageElement) {
			pageElement = document.createElement('div')
			pageElement.className = classNames('modloader-ui-page', page.pageClass)
			splash.element.append(pageElement)
		}
		uiPagesActivePage = page
		uiPagesActiveSplash = splash
		uiPagesCurrentGame = splash.master
		splash.element.classList.add('modloader-ui-page-active', page.activeClass)
		splash.selected = false
		page.onOpen?.(createUiPageContext(page, splash, pageElement, null, options))
		renderUiPage(page, splash, pageElement, options)
	}

	const hideUiPage = function (page, splash) {
		page?.onClose?.(createUiPageContext(page, splash))
		if (splash?.element) {
			splash.element.classList.remove('modloader-ui-page-active', page.activeClass)
			splash.element.querySelector('.' + page.pageClass)?.remove()
		}
		if (uiPagesActivePage?.key === page?.key) {
			uiPagesActivePage = null
			uiPagesActiveSplash = null
		}
	}

	const renderUiPage = function (page, splash, pageElement, options = {}) {
		if (!pageElement || !splash) return
		const previousScrollTop = options.scrollTop ?? pageElement.querySelector('.modloader-ui-page-content')?.scrollTop ?? 0
		setUiPageVariables(page, pageElement)
		pageElement.innerHTML = ''
		pageElement.append(renderUiPageBrand(page, splash))
		const subtitle = document.createElement('div')
		subtitle.className = classNames('modloader-ui-page-subtitle', page.subtitleClass)
		subtitle.textContent = resolveUiPageLabel(page.title, splash.master, page.id)
		pageElement.append(subtitle)
		appendUiPageNodes(pageElement, page.renderBeforeContent?.(createUiPageContext(page, splash, pageElement, null, options)))
		const content = document.createElement('div')
		content.className = classNames('modloader-ui-page-content', page.contentClass)
		installTransientScrollbar(content, page.scrollbarVisibleClass)
		if (page.inertialScroll) installInertialScroll(content, page.inertialScroll)
		const ctx = createUiPageContext(page, splash, pageElement, content, options)
		appendUiPageNodes(content, page.renderContent?.(ctx))
		pageElement.append(content)
		if (previousScrollTop > 0) content.scrollTop = previousScrollTop
		const back = document.createElement('button')
		back.type = 'button'
		back.className = classNames('modloader-ui-page-back', page.backClass)
		back.textContent = resolveUiPageLabel(page.backLabel, splash.master, originalBackLabel(splash.master) || 'BACK')
		back.onclick = function (event) {
			event.preventDefault()
			event.stopPropagation()
			hideUiPage(page, splash)
		}
		back.ontouchstart = back.onclick
		pageElement.append(back)
		page.onAfterRender?.(ctx)
	}

	const renderUiPageBrand = function (page, splash) {
		const brand = document.createElement('div')
		brand.className = classNames('modloader-ui-page-brand', page.brandClass)
		const left = document.createElement('div')
		left.className = classNames('modloader-ui-page-logo', page.logoClass)
		left.textContent = 'SIXTY'
		const mark = document.createElement('div')
		mark.className = classNames('modloader-ui-page-logo-mark', page.logoMarkClass)
		mark.style.backgroundPosition = splash.sf?.style.backgroundPosition || '0 0'
		const right = document.createElement('div')
		right.className = classNames('modloader-ui-page-logo', page.logoClass)
		right.textContent = 'FOUR'
		brand.append(left, mark, right)
		return brand
	}

	const setUiPageVariables = function (page, pageElement) {
		pageElement.style.setProperty('--modloader-ui-page-width', page.width)
		pageElement.style.setProperty('--modloader-ui-page-content-height', page.contentHeight)
		pageElement.style.setProperty('--modloader-ui-page-mobile-content-height', page.mobileContentHeight)
		pageElement.style.setProperty('--modloader-ui-page-content-offset', page.contentOffset)
		pageElement.style.setProperty('--modloader-ui-page-mobile-content-offset', page.mobileContentOffset)
	}

	const createUiPageContext = function (page, splash, pageElement, content, options = {}) {
		return {
			id: page.id,
			key: page.key,
			modId: page.modId,
			splash,
			game: splash?.master || uiPagesCurrentGame,
			page: pageElement,
			pageElement,
			content,
			options,
			shell: createUiPagesApi(page.modId),
			refresh() { refreshUiPage(page.modId, page.id) },
			close() { closeUiPage(page.modId, page.id) }
		}
	}

	const handleUiPageEscape = function (event) {
		if (!uiPagesActivePage || (event.key !== 'Escape' && event.keyCode !== 27)) return
		const ctx = createUiPageContext(uiPagesActivePage, uiPagesActiveSplash, uiPagesActiveSplash?.element?.querySelector('.' + uiPagesActivePage.pageClass))
		if (uiPagesActivePage.canCloseOnEscape?.(ctx, event) === false) return
		event.preventDefault()
		event.stopImmediatePropagation()
		hideUiPage(uiPagesActivePage, uiPagesActiveSplash)
	}

	const findUiPage = function (modId, id) {
		return findUiPageByKey(uiPageKey(modId, id))
	}

	const findUiPageByKey = function (key) {
		return uiPages.find(function (page) { return page.key === key })
	}

	const resolveUiPageLabel = function (value, game, fallback) {
		try {
			if (typeof value === 'function') return value(game) || fallback
			return value || fallback
		} catch (error) {
			warn('UI page label failed.', error)
			return fallback
		}
	}

	const appendUiPageNodes = function (parent, value) {
		if (!value) return
		if (Array.isArray(value)) {
			for (const item of value) appendUiPageNodes(parent, item)
			return
		}
		if (value instanceof Node) parent.append(value)
	}

	const classNames = function (...items) {
		return items.filter(Boolean).join(' ')
	}

	const installHorizontalWheel = function (element) {
		element.addEventListener('wheel', function (event) {
			if (!event.cancelable) return
			const amount = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
			if (!amount) return
			event.preventDefault()
			element.scrollLeft += amount
		}, { passive: false })
	}

	const installTransientScrollbar = function (list, visibleClass) {
		let timer
		const reveal = function () {
			list.classList.add('modloader-ui-page-scrollbar-visible')
			if (visibleClass) list.classList.add(visibleClass)
			clearTimeout(timer)
			timer = setTimeout(function () {
				list.classList.remove('modloader-ui-page-scrollbar-visible')
				if (visibleClass) list.classList.remove(visibleClass)
			}, 900)
		}
		list.onwheel = reveal
		list.onscroll = reveal
		list.onpointerdown = reveal
	}

	const installInertialScroll = function (list, options = {}) {
		if (!list) return function () {}
		if (list.__modloaderUiPageInertialScrollStop) list.__modloaderUiPageInertialScrollStop()
		const settings = options === true ? {} : options || {}
		let velocity = 0
		let frame = 0
		const friction = numericSetting(settings.friction, .88)
		const directInfluence = numericSetting(settings.directInfluence, .30)
		const tailInfluence = numericSetting(settings.tailInfluence, .13)
		const maxVelocity = numericSetting(settings.maxVelocity, 34)
		const stopThreshold = numericSetting(settings.stopThreshold, .35)
		const clamp = function (value) {
			const max = Math.max(0, list.scrollHeight - list.clientHeight)
			return Math.min(max, Math.max(0, value))
		}
		const clampVelocity = function (value) {
			return Math.min(maxVelocity, Math.max(-maxVelocity, value))
		}
		const stop = function () {
			velocity = 0
			if (frame) cancelAnimationFrame(frame)
			frame = 0
		}
		const animate = function () {
			frame = 0
			if (Math.abs(velocity) < stopThreshold) {
				velocity = 0
				return
			}
			const before = list.scrollTop
			list.scrollTop = clamp(before + velocity)
			if (list.scrollTop === before) {
				velocity = 0
				return
			}
			velocity *= friction
			frame = requestAnimationFrame(animate)
		}
		const onWheel = function (event) {
			if (!event.cancelable || event.ctrlKey) return
			const delta = normalizeWheelDelta(event, list)
			if (!delta) return
			event.preventDefault()
			const before = list.scrollTop
			list.scrollTop = clamp(before + delta * directInfluence)
			if (list.scrollTop === before) {
				velocity = 0
				return
			}
			velocity = clampVelocity(velocity + delta * tailInfluence)
			if (!frame) frame = requestAnimationFrame(animate)
		}
		list.addEventListener('wheel', onWheel, { passive: false })
		list.addEventListener('pointerdown', stop, true)
		const cleanup = function () {
			stop()
			list.removeEventListener('wheel', onWheel)
			list.removeEventListener('pointerdown', stop, true)
			if (list.__modloaderUiPageInertialScrollStop === cleanup) delete list.__modloaderUiPageInertialScrollStop
		}
		list.__modloaderUiPageInertialScrollStop = cleanup
		return cleanup
	}

	const normalizeWheelDelta = function (event, list) {
		if (event.deltaMode === 1) return event.deltaY * 32
		if (event.deltaMode === 2) return event.deltaY * list.clientHeight
		return event.deltaY
	}

	const numericSetting = function (value, fallback) {
		return Number.isFinite(value) ? value : fallback
	}

	const originalBackLabel = function (game) {
		try {
			return normalizeGameText(game?.pronounce?.('splash', 'deglory'))
		} catch (error) {
			return ''
		}
	}

	const normalizeGameText = function (value) {
		const raw = String(value || '').trim()
		if (!raw) return ''
		const box = document.createElement('div')
		box.innerHTML = raw
		return (box.textContent || box.innerText || raw).trim()
	}

	const resetViewportScroll = function () {
		if (document?.documentElement) document.documentElement.scrollTop = 0
		if (document?.body) document.body.scrollTop = 0
		if (typeof window?.scrollTo === 'function') window.scrollTo(0, 0)
	}

	const createRule = function (options = {}) {
		const rule = document.createElement('div')
		rule.className = options.className || (options.strong ? 'modloader-ui-page-rule-strong' : 'modloader-ui-page-rule')
		return rule
	}

	const installUiPageStyles = function () {
		if (document.getElementById('modloader-ui-page-style')) return
		const style = document.createElement('style')
		style.id = 'modloader-ui-page-style'
		style.textContent = `
			.splash.modloader-ui-page-active { background:#000000F9; color:#fff; }
			.splash.modloader-ui-page-active .menu,
			.splash.modloader-ui-page-active .credit,
			.splash.modloader-ui-page-active .publisher,
			.splash.modloader-ui-page-active .flashlight,
			.splash.modloader-ui-page-active .chill,
			.splash.modloader-ui-page-active .fullscreen,
			.splash.modloader-ui-page-active .discord,
			.splash.modloader-ui-page-active .backupVessel,
			.splash.modloader-ui-page-active .gloryButton,
			.splash.modloader-ui-page-active > .headerBox,
			.splash.modloader-ui-page-active > .sixtyFour { display:none !important; }
			.modloader-ui-page { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; box-sizing:border-box; padding:clamp(16px,3vh,36px) max(36px,5vw) 18px; color:#fff; background:transparent; font-family:Montserrat,Arial,sans-serif; overflow:hidden; }
			.modloader-ui-page-brand { display:flex; align-items:center; justify-content:center; gap:32px; margin:0 auto 14px; }
			.modloader-ui-page-logo-mark { flex:0 0 auto; width:92px; height:92px; margin:0; background:url('img/logo/sheet.png'); background-size:400% 200%; }
			.modloader-ui-page-logo { text-align:center; font:54px Montserrat,Arial,sans-serif; letter-spacing:16px; white-space:nowrap; }
			.modloader-ui-page-subtitle { margin:0 auto 20px; text-align:center; font:23px Montserrat,Arial,sans-serif; letter-spacing:9px; color:#fffc; text-transform:uppercase; }
			.modloader-ui-page-content { box-sizing:border-box; width:min(var(--modloader-ui-page-width,760px),100%); height:min(var(--modloader-ui-page-content-height,560px),calc(100vh - var(--modloader-ui-page-content-offset,335px))); margin:0 auto; padding:10px 24px 14px 0; overflow-x:hidden; overflow-y:auto; scrollbar-width:thin; scrollbar-color:transparent transparent; transition:scrollbar-color .28s ease; outline:none; }
			.modloader-ui-page-content:hover, .modloader-ui-page-content:active, .modloader-ui-page-content.modloader-ui-page-scrollbar-visible { scrollbar-color:#fffc #fff2; }
			.modloader-ui-page-content::-webkit-scrollbar { width:10px; }
			.modloader-ui-page-content::-webkit-scrollbar-track { background:transparent; transition:background .28s ease; }
			.modloader-ui-page-content::-webkit-scrollbar-thumb { border:0; border-radius:0; background:transparent; transition:background .28s ease; }
			.modloader-ui-page-content:hover::-webkit-scrollbar-track, .modloader-ui-page-content:active::-webkit-scrollbar-track, .modloader-ui-page-content.modloader-ui-page-scrollbar-visible::-webkit-scrollbar-track { background:linear-gradient(to right, transparent 4px, rgba(255,255,255,.16) 4px, rgba(255,255,255,.16) 6px, transparent 6px); }
			.modloader-ui-page-content:hover::-webkit-scrollbar-thumb, .modloader-ui-page-content:active::-webkit-scrollbar-thumb, .modloader-ui-page-content.modloader-ui-page-scrollbar-visible::-webkit-scrollbar-thumb { background:linear-gradient(to right, transparent 4px, rgba(255,255,255,.78) 4px, rgba(255,255,255,.78) 6px, transparent 6px); }
			.modloader-ui-page-back { appearance:none; display:block; box-sizing:border-box; width:min(var(--modloader-ui-page-width,760px),100%); margin:22px auto 0; padding:0; border:0; background:transparent; color:inherit; text-align:right; font:23px Montserrat,Arial,sans-serif; letter-spacing:6px; cursor:pointer; transition:color .18s ease; }
			.modloader-ui-page-back:hover { color:#b56b87; }
			.modloader-ui-page-rule { width:min(var(--modloader-ui-page-width,760px),100%); height:1px; margin:0 auto; background:rgba(255,255,255,.72); }
			.modloader-ui-page-rule-strong { height:4px; width:calc(100% - 4px); margin:0 0 2px; background:rgba(255,255,255,.9); }
			.splash.mobile .modloader-ui-page { padding:5vh 5vw 24px; }
			.splash.mobile .modloader-ui-page-brand { gap:4vw; }
			.splash.mobile .modloader-ui-page-logo-mark { width:16vw; height:16vw; max-width:74px; max-height:74px; }
			.splash.mobile .modloader-ui-page-logo { font-size:min(8vw,34px); letter-spacing:min(2.2vw,9px); }
			.splash.mobile .modloader-ui-page-subtitle { font-size:min(5vw,18px); letter-spacing:min(2vw,6px); }
			.splash.mobile .modloader-ui-page-content { height:min(var(--modloader-ui-page-mobile-content-height,610px),calc(100vh - var(--modloader-ui-page-mobile-content-offset,310px))); padding-right:14px; }
			.splash.mobile .modloader-ui-page-back { font-size:min(5vw,20px); }
			@media (max-width:860px) { .modloader-ui-page { padding-left:5vw; padding-right:5vw; } .modloader-ui-page-logo { font-size:34px; letter-spacing:10px; } }
		`
		document.head.append(style)
	}
	const createUiApi = function (modId) {
		return {
			registerCornerButton(options) { return registerUiButton(modId, options) },
			registerButton(options) { return registerUiButton(modId, options) },
			unregisterCornerButton(id) { return unregisterUiButton(modId, id) },
			unregisterButton(id) { return unregisterUiButton(modId, id) },
			refreshCornerButtons: syncUiDocks,
			refreshButtons: syncUiDocks,
			isVanillaGameHudHidden(game) { return isVanillaGameHudHidden(game) },
			refreshVanillaGameHud(game) { return syncVanillaGameHudVisibility(game) },
			registerHud(options) { return registerGameHudItem(modId, options) },
			registerGameHud(options) { return registerGameHudItem(modId, options) },
			hud: createUiHudApi(modId),
			icons: createUiIconsApi(modId),
			theme: createUiThemeApi(),
			pages: createUiPagesApi(modId)
		}
	}
	const element = function (tag, className, text) {
		const el = document.createElement(tag)
		if (className) el.className = className
		if (text !== undefined) el.textContent = text
		return el
	}

	const panelRow = function (label, value) {
		const row = element('div', 'modloader-panel-row')
		row.appendChild(element('span', 'modloader-panel-label', label))
		row.appendChild(element('span', 'modloader-panel-value', value))
		return row
	}
	const PANEL_TEXT = {
		en: {
			close: 'Close', hideToEdge: 'Hide to edge', showFromEdge: 'Show ModLoader menu', menuSettings: 'Menu Settings', themeMode: 'Theme', darkMode: 'Dark', lightMode: 'Light', hideMode: 'Auto-hide mode', autoHide: 'Auto-hide', manualHide: 'Manual', sortMod: 'Sort mod', sortConfigSection: 'Sort section', configSectionSorting: 'Config section sorting', configSectionSortingOn: 'On', configSectionSortingOff: 'Off', renderApi: 'Render API', renderApiOn: 'On', renderApiOff: 'Off', renderApiLayerDemands: 'Layer demands', renderApiCreatedLayers: 'Created layers', renderApiCallbacks: 'Callbacks active/total', renderApiLayerDemanders: 'Demanders active/total', renderApiMethodRoutes: 'Method routes', renderApiTiming: 'Timing', autoHideDelay: 'Auto-hide delay', secondsSuffix: 's', hideMenuDetails: 'Hide menu details', hideModFileDetails: 'Hide mod file details', show: 'Show', hide: 'Hide', installedMods: 'Installed mods', enabledEntries: 'Enabled entries', loadedMods: 'Loaded mods', issues: 'Issues', dataPatches: 'Data patches', wordPatches: 'Word patches', registeredLanguages: 'Registered languages', orphanEntities: 'Orphan entities', modManager: 'Mod Manager', selectAll: 'all', toggleNote: 'Toggle mods or edit config below.', changesRequireReload: 'Changes require reload.', configSaveNote: 'Config saved to localStorage; some mods need reload.', saveReload: 'Save & Reload', saveConfig: 'Save Config', insert: 'insert', folder: 'folder', deleteMod: 'Delete mod', config: 'Config', recentLog: 'Recent Log', noLogEntries: 'No log entries.', noModsFound: 'No mods with mod.json were found.', fileAccessUnavailable: 'File access is unavailable.', fileAccessLoadedOnly: 'File access is unavailable, so only loaded mods can be shown.', reloadHot: 'hot capable, reload now', reloadRestart: 'restart required', reloadRequired: 'reload required', idPrefix: 'id: {value}', uniquePrefix: 'unique: {value}', depsPrefix: 'deps: {value}', conflictsPrefix: 'conflicts: {value}', missingDependencies: 'Missing dependencies: {value}', conflictsEnabled: 'Conflicts enabled: {value}', savedReloading: 'Saved. Reloading...', saveFailed: 'Save failed: {value}', configSaved: 'Config saved.', noChanges: 'No changes to save.', changesCanceled: 'Canceled unsaved changes.', openFolderFailed: 'Could not open folder: {value}', deleteTitle: 'Delete Mod?', deleteMessage: 'Delete {name} from the mods folder? This cannot be undone.', deleteConfirm: 'Delete', cancel: 'Cancel', replaceTitle: 'Replace Mod?', replaceMessage: 'mods already contains {name}. Replace it with the imported mod?', replaceConfirm: 'Replace', deletedMod: 'Deleted {name}. Reload to unload already running code.', deleteFailed: 'Delete failed: {value}', importHint: 'Drop a file here or paste', importDetail: 'Drag a mod zip here, or copy a zip file and press paste. ModLoader will unpack it into the mods folder automatically.', importWaiting: 'Waiting for a zip file...', importNoZip: 'Drop or paste a .zip file.', importNoPath: 'Could not read the file path from the dropped file.', importing: 'Importing {name}...', importedMod: 'Imported {name}. Enable it and Save & Reload when ready.', importFailed: 'Import failed: {value}', importModeOff: 'Back to mod list', invalidZip: 'Only .zip mod packages can be imported.', zipNoMod: 'The zip does not contain a mod.json.', zipMultipleMods: 'The zip contains multiple mod folders; import one mod at a time.', zipExtractFailed: 'Could not extract zip: {value}', folderOpened: 'Opened mods folder.', replaceRenamedUniqueTitle: 'Update Renamed Mod?', replaceRenamedUniqueMessage: 'The new file has the same mod unique code as an installed mod. It is probably an update and rename.\n{oldName} -> {newName}\nReplace the old file?', replaceRenamedPreviousTitle: 'Mod Rename Detected', replaceRenamedPreviousMessage: 'This new file appears to be a rename of an installed file.\n{oldName} -> {newName}\nReplace the old file?', replaceOld: 'Replace', keepImported: 'Do not replace (add new file)', uniqueCodeEditTitle: 'Recommend changing mod unique code', uniqueCodeEditMessage: 'These two mods will share the same mod unique code. Change the imported mod unique code before adding it?', uniqueCodeLabel: 'Mod unique code', uniqueCodeConfirm: 'Confirm', uniqueCodeSkip: 'No', manifestReadFailed: 'Could not read mod.json: {value}', translationFile: 'translations', translationFileTitle: 'Open translation file', translationFileSynced: 'Translation file synced: {path}', translationFileFailed: 'Translation file failed: {value}', translationExport: 'Export', translationExportTitle: 'Export translations backup', translationExported: 'Translation backup exported: {path}', translationImport: 'Import', translationImportTitle: 'Import translations file', translationImported: 'Imported translations from {source} and saved to {path}', translationImportInvalid: 'Selected file is not a ModLoader translations file.', translationExportOverwriteTitle: 'Overwrite translation backup?', translationExportOverwriteMessage: 'Target file already exists.\nEdit time: {editedAt}\n{path}\nOverwrite it?', translationOverwriteConfirm: 'Overwrite', translationDialogUnavailable: 'File dialog is unavailable.'
		},
		sch: {
			close: '\u5173\u95ed', hideToEdge: '\u9690\u85cf\u5230\u8fb9\u7f18', showFromEdge: '\u663e\u793a ModLoader \u83dc\u5355', menuSettings: 'Mod \u83dc\u5355\u8bbe\u7f6e', themeMode: '\u4eae\u8272 / \u6697\u8272\u6a21\u5f0f', darkMode: '\u6697\u8272', lightMode: '\u4eae\u8272', hideMode: '\u81ea\u52a8\u9690\u85cf\u6a21\u5f0f', autoHide: '\u81ea\u52a8\u9690\u85cf', manualHide: '\u624b\u52a8\u9690\u85cf', sortMod: '\u6392\u5e8f mod', sortConfigSection: '\u6392\u5e8f\u5b50\u529f\u80fd', configSectionSorting: '\u5b50\u529f\u80fd\u624b\u52a8\u6392\u5e8f', configSectionSortingOn: '\u5f00\u542f', configSectionSortingOff: '\u5173\u95ed', renderApi: '\u6e32\u67d3 API', renderApiOn: '\u5f00\u542f', renderApiOff: '\u5173\u95ed', renderApiLayerDemands: '\u5df2\u9700\u6c42\u56fe\u5c42', renderApiCreatedLayers: '\u5df2\u521b\u5efa\u56fe\u5c42', renderApiCallbacks: '\u56de\u8c03 \u6d3b\u8dc3/\u603b\u6570', renderApiLayerDemanders: '\u9700\u6c42\u5668 \u6d3b\u8dc3/\u603b\u6570', renderApiMethodRoutes: '\u5df2\u8def\u7531\u65b9\u6cd5', renderApiTiming: '\u8017\u65f6', autoHideDelay: '\u81ea\u52a8\u9690\u85cf\u79d2\u6570', secondsSuffix: '\u79d2', hideMenuDetails: '\u9690\u85cf\u83dc\u5355\u8be6\u60c5', hideModFileDetails: '\u9690\u85cf mod \u6587\u4ef6\u8be6\u60c5', show: '\u663e\u793a', hide: '\u9690\u85cf', installedMods: '\u5df2\u5b89\u88c5 mod', enabledEntries: '\u542f\u7528\u6761\u76ee', loadedMods: '\u5df2\u52a0\u8f7d mod', issues: '\u95ee\u9898', dataPatches: '\u6570\u636e\u8865\u4e01', wordPatches: '\u6587\u672c\u8865\u4e01', registeredLanguages: '\u5df2\u6ce8\u518c\u8bed\u8a00', orphanEntities: '\u5b64\u7acb\u5b9e\u4f53', modManager: 'Mod \u7ba1\u7406', selectAll: '\u5168\u9009', toggleNote: '\u5728\u4e0b\u65b9\u5f00\u5173 mod \u6216\u7f16\u8f91\u914d\u7f6e\u3002', changesRequireReload: '\u6539\u52a8\u9700\u8981 reload\u3002', configSaveNote: '\u914d\u7f6e\u5df2\u4fdd\u5b58\u5230 localStorage\uff1b\u90e8\u5206 mod \u9700\u8981 reload \u751f\u6548\u3002', saveReload: '\u4fdd\u5b58\u5e76 Reload', saveConfig: '\u4fdd\u5b58\u914d\u7f6e', insert: '\u5bfc\u5165', folder: '\u6587\u4ef6\u5939', deleteMod: '\u5220\u9664 mod', config: '\u914d\u7f6e', recentLog: '\u6700\u8fd1\u65e5\u5fd7', noLogEntries: '\u6682\u65e0\u65e5\u5fd7\u3002', noModsFound: '\u6ca1\u6709\u627e\u5230\u5e26 mod.json \u7684 mod\u3002', fileAccessUnavailable: '\u6587\u4ef6\u8bbf\u95ee\u4e0d\u53ef\u7528\u3002', fileAccessLoadedOnly: '\u6587\u4ef6\u8bbf\u95ee\u4e0d\u53ef\u7528\uff0c\u6240\u4ee5\u53ea\u80fd\u663e\u793a\u5df2\u52a0\u8f7d\u7684 mod\u3002', reloadHot: '\u652f\u6301\u70ed\u5f00\u5173\uff0c\u5f53\u524d\u4ecd\u5efa\u8bae reload', reloadRestart: '\u9700\u8981\u91cd\u542f', reloadRequired: '\u9700\u8981 reload', idPrefix: 'id\uff1a{value}', uniquePrefix: '\u552f\u4e00\u7801\uff1a{value}', depsPrefix: '\u4f9d\u8d56\uff1a{value}', conflictsPrefix: '\u51b2\u7a81\uff1a{value}', missingDependencies: '\u7f3a\u5c11\u4f9d\u8d56\uff1a{value}', conflictsEnabled: '\u5df2\u542f\u7528\u51b2\u7a81\uff1a{value}', savedReloading: '\u5df2\u4fdd\u5b58\uff0c\u6b63\u5728 reload...', saveFailed: '\u4fdd\u5b58\u5931\u8d25\uff1a{value}', configSaved: '\u914d\u7f6e\u5df2\u4fdd\u5b58\u3002', noChanges: '\u6ca1\u6709\u9700\u8981\u4fdd\u5b58\u7684\u6539\u52a8\u3002', changesCanceled: '\u5df2\u53d6\u6d88\u672a\u4fdd\u5b58\u7684\u6539\u52a8\u3002', openFolderFailed: '\u65e0\u6cd5\u6253\u5f00\u6587\u4ef6\u5939\uff1a{value}', deleteTitle: '\u5220\u9664 Mod\uff1f', deleteMessage: '\u4ece mods \u6587\u4ef6\u5939\u5220\u9664 {name}\uff1f\u8fd9\u4e2a\u64cd\u4f5c\u4e0d\u80fd\u64a4\u9500\u3002', deleteConfirm: '\u5220\u9664', cancel: '\u53d6\u6d88', replaceTitle: '\u66ff\u6362 Mod\uff1f', replaceMessage: 'mods \u91cc\u5df2\u7ecf\u6709 {name}\u3002\u662f\u5426\u7528\u5bfc\u5165\u7684 mod \u66ff\u6362\u5b83\uff1f', replaceConfirm: '\u66ff\u6362', deletedMod: '\u5df2\u5220\u9664 {name}\u3002\u5df2\u7ecf\u8fd0\u884c\u7684\u4ee3\u7801\u9700\u8981 reload \u624d\u4f1a\u5378\u8f7d\u3002', deleteFailed: '\u5220\u9664\u5931\u8d25\uff1a{value}', importHint: '\u628a\u6587\u4ef6\u62d6\u5230\u8fd9\u91cc\u6216\u590d\u5236', importDetail: '\u53ef\u4ee5\u628a mod zip \u5305\u76f4\u63a5\u62d6\u5165\uff0c\u6216\u8005\u590d\u5236 zip \u5305\u540e\u5728\u8fd9\u91cc\u6309\u7c98\u8d34\u5feb\u6377\u952e\uff0cModLoader \u4f1a\u81ea\u52a8\u89e3\u5305\u5230 mods \u6587\u4ef6\u5939\u3002', importWaiting: '\u7b49\u5f85 zip \u6587\u4ef6...', importNoZip: '\u8bf7\u62d6\u5165\u6216\u7c98\u8d34 .zip \u6587\u4ef6\u3002', importNoPath: '\u65e0\u6cd5\u8bfb\u53d6\u8be5\u6587\u4ef6\u8def\u5f84\u3002', importing: '\u6b63\u5728\u5bfc\u5165 {name}...', importedMod: '\u5df2\u5bfc\u5165 {name}\u3002\u9700\u8981\u65f6\u52fe\u9009\u5b83\u5e76\u4fdd\u5b58 reload\u3002', importFailed: '\u5bfc\u5165\u5931\u8d25\uff1a{value}', importModeOff: '\u8fd4\u56de mod \u5217\u8868', invalidZip: '\u53ea\u80fd\u5bfc\u5165 .zip mod \u5305\u3002', zipNoMod: '\u8fd9\u4e2a zip \u5185\u6ca1\u6709 mod.json\u3002', zipMultipleMods: '\u8fd9\u4e2a zip \u5305\u542b\u591a\u4e2a mod \u6587\u4ef6\u5939\uff1b\u8bf7\u4e00\u6b21\u5bfc\u5165\u4e00\u4e2a mod\u3002', zipExtractFailed: '\u65e0\u6cd5\u89e3\u538b zip\uff1a{value}', folderOpened: '\u5df2\u6253\u5f00 mods \u6587\u4ef6\u5939\u3002', replaceRenamedUniqueTitle: '\u53d1\u73b0\u540c\u552f\u4e00\u7801 Mod', replaceRenamedUniqueMessage: '\u65b0\u6587\u4ef6\u8ddf\u5df2\u6709\u6587\u4ef6\u6709\u76f8\u540c\u7684 mod \u552f\u4e00\u7801\uff0c\u5b83\u5f88\u53ef\u80fd\u662f\u65e7\u6587\u4ef6\u7684\u66f4\u65b0\u548c\u6539\u540d\u3002\n{oldName} \u2192 {newName}\n\u662f\u5426\u8986\u76d6\u65e7\u6587\u4ef6\uff1f', replaceRenamedPreviousTitle: '\u53d1\u73b0 Mod \u6539\u540d', replaceRenamedPreviousMessage: '\u8fd9\u4e2a\u65b0\u6587\u4ef6\u662f\u5df2\u6709\u6587\u4ef6\u7684\u6539\u540d\u3002\n{oldName} \u2192 {newName}\n\u662f\u5426\u8986\u76d6\u65e7\u6587\u4ef6\uff1f', replaceOld: '\u8986\u76d6', keepImported: '\u4e0d\u8986\u76d6\uff08\u52a0\u5165\u65b0\u6587\u4ef6\uff09', uniqueCodeEditTitle: '\u63a8\u8350\u4fee\u6539 mod \u552f\u4e00\u7801', uniqueCodeEditMessage: '\u8fd9\u4e24\u4e2a mod \u4f1a\u5171\u7528\u540c\u4e00\u4e2a mod \u552f\u4e00\u7801\u3002\u662f\u5426\u5728\u52a0\u5165\u65b0\u6587\u4ef6\u524d\u4fee\u6539\u5bfc\u5165 mod \u7684\u552f\u4e00\u7801\uff1f', uniqueCodeLabel: 'mod \u552f\u4e00\u7801', uniqueCodeConfirm: '\u786e\u8ba4\u4fee\u6539', uniqueCodeSkip: '\u5426\uff08\u4e0d\u4fee\u6539\uff09', manifestReadFailed: '\u65e0\u6cd5\u8bfb\u53d6 mod.json\uff1a{value}', translationFile: '\u7ffb\u8bd1', translationFileTitle: '\u6253\u5f00\u7ffb\u8bd1\u6587\u4ef6', translationFileSynced: '\u7ffb\u8bd1\u6587\u4ef6\u5df2\u540c\u6b65\uff1a{path}', translationFileFailed: '\u7ffb\u8bd1\u6587\u4ef6\u5931\u8d25\uff1a{value}'
		}
	}
	Object.assign(PANEL_TEXT.en, {
		translationImportWriteModsTitle: 'Write translations to mod.json?',
		translationImportWriteModsMessage: 'The imported file will replace ModLoader translations.json either way. Do you also want to write matching mod translation fields into installed mod.json files? This overwrites existing matching translation fields.',
		translationImportWriteModsConfirm: 'Write to mod',
		translationImportSkipMods: 'Do not write',
		translationImportWriteModsResult: 'Mod write-back: {written} written, {unchanged} already current, {failed} failed.',
		translationImportNoMatchingMods: 'No installed mod.json matched the imported mod entries.',
		translationImportModFailures: 'Failures: {failures}'
	})
	Object.assign(PANEL_TEXT.sch, {
		translationExport: '\u5bfc\u51fa',
		translationExportTitle: '\u5bfc\u51fa\u7ffb\u8bd1\u5907\u4efd',
		translationExported: '\u7ffb\u8bd1\u5907\u4efd\u5df2\u5bfc\u51fa\uff1a{path}',
		translationImport: '\u5bfc\u5165',
		translationImportTitle: '\u5bfc\u5165\u7ffb\u8bd1\u6587\u4ef6',
		translationImported: '\u5df2\u4ece {source} \u5bfc\u5165\u7ffb\u8bd1\uff0c\u5e76\u4fdd\u5b58\u5230 {path}',
		translationImportInvalid: '\u9009\u62e9\u7684\u6587\u4ef6\u4e0d\u662f ModLoader \u7ffb\u8bd1\u6587\u4ef6\u3002',
		translationExportOverwriteTitle: '\u8986\u76d6\u7ffb\u8bd1\u5907\u4efd\uff1f',
		translationExportOverwriteMessage: '\u76ee\u6807\u6587\u4ef6\u5df2\u5b58\u5728\u3002\n\u7f16\u8f91\u65f6\u95f4\uff1a{editedAt}\n{path}\n\u662f\u5426\u8986\u76d6\uff1f',
		translationOverwriteConfirm: '\u8986\u76d6',
		translationDialogUnavailable: '\u6587\u4ef6\u9009\u62e9\u5668\u4e0d\u53ef\u7528\u3002',
		translationImportWriteModsTitle: '\u5199\u5165 mod.json\uff1f',
		translationImportWriteModsMessage: '\u65e0\u8bba\u5982\u4f55\uff0c\u5bfc\u5165\u6587\u4ef6\u90fd\u4f1a\u8986\u76d6 ModLoader \u7684 translations.json\u3002\u662f\u5426\u4e5f\u5c06\u5339\u914d\u7684 mod \u7ffb\u8bd1\u5b57\u6bb5\u5199\u5165\u5df2\u5b89\u88c5\u7684 mod.json\uff1f\u8fd9\u4f1a\u8986\u76d6\u5df2\u6709\u7684\u5339\u914d\u7ffb\u8bd1\u5b57\u6bb5\u3002',
		translationImportWriteModsConfirm: '\u5199\u5165 mod',
		translationImportSkipMods: '\u4e0d\u5199\u5165 mod',
		translationImportWriteModsResult: 'mod \u5199\u56de\uff1a\u5df2\u5199\u5165 {written}\uff0c\u5df2\u662f\u6700\u65b0 {unchanged}\uff0c\u5931\u8d25 {failed}\u3002',
		translationImportNoMatchingMods: '\u6ca1\u6709\u5df2\u5b89\u88c5\u7684 mod.json \u5339\u914d\u5bfc\u5165\u6587\u4ef6\u4e2d\u7684 mod \u6761\u76ee\u3002',
		translationImportModFailures: '\u5931\u8d25\uff1a{failures}'
	})
	PANEL_TEXT.modsch = PANEL_TEXT.sch
	PANEL_TEXT.tch = PANEL_TEXT.sch
	const TRANSLATION_CATALOG_FILE = 'translations.json'
	const TRANSLATION_CATALOG_VERSION = 1
	const TRANSLATION_CATALOG_KIND = 'sixty-four.modloader.translations'
	const TRANSLATION_CATALOG_FORMAT_VERSION = 1
	const TRANSLATION_CATALOG_META_KEY = '_meta'
	const getPanelLanguage = function () {
		const language = state.game?.language || ''
		if (language === 'sch' || language === 'modsch') return 'sch'
		if (language === 'tch') return 'tch'
		return 'en'
	}

	const getCatalogLanguageGroup = function (language) {
		const languages = state.translationCatalog?.languages
		if (!languages || typeof languages !== 'object' || Array.isArray(languages)) return null
		const raw = String(state.game?.language || '').trim().toLowerCase()
		if (raw && languages[raw]) return languages[raw]
		if (languages[language]) return languages[language]
		if (language === 'sch') return languages.modsch || languages['zh-cn'] || languages.zh || null
		if (language === 'tch') return languages['zh-tw'] || languages.sch || null
		return null
	}

	const getCatalogPanelText = function (language, key) {
		const group = getCatalogLanguageGroup(language)
		const value = group?.modloader?.[key]
		return typeof value === 'string' ? value : ''
	}

	const t = function (key, values) {
		const language = getPanelLanguage()
		const source = getCatalogPanelText(language, key) || PANEL_TEXT[language]?.[key] || PANEL_TEXT.en[key] || key
		return source.replace(/\{(\w+)\}/g, function (match, name) {
			return values && values[name] !== undefined ? String(values[name]) : match
		})
	}

	const isLocaleObject = function (value) {
		return value && typeof value === 'object' && !Array.isArray(value)
	}

	const addUniqueLocaleCandidate = function (out, value) {
		const text = String(value || '').trim().toLowerCase()
		if (text && out.indexOf(text) === -1) out.push(text)
	}

	const getLocaleCandidates = function () {
		const raw = String(state.game?.language || '').trim().toLowerCase()
		const panel = getPanelLanguage()
		const out = []
		addUniqueLocaleCandidate(out, raw)
		addUniqueLocaleCandidate(out, panel)
		if (raw === 'modsch' || panel === 'sch') {
			addUniqueLocaleCandidate(out, 'modsch')
			addUniqueLocaleCandidate(out, 'sch')
			addUniqueLocaleCandidate(out, 'zh-cn')
			addUniqueLocaleCandidate(out, 'zh')
		}
		if (panel === 'tch') {
			addUniqueLocaleCandidate(out, 'tch')
			addUniqueLocaleCandidate(out, 'zh-tw')
			addUniqueLocaleCandidate(out, 'sch')
		}
		addUniqueLocaleCandidate(out, 'en')
		return out
	}

	const pickLocalizedText = function (value, candidates) {
		if (typeof value === 'string') return value
		if (!isLocaleObject(value)) return ''
		for (const language of candidates) {
			if (typeof value[language] === 'string') return value[language]
		}
		return typeof value.en === 'string' ? value.en : ''
	}

	const getManifestTranslationRoot = function (manifest) {
		for (const key of [ 'translations', 'i18n', 'uiTranslations', 'uiText' ]) {
			if (isLocaleObject(manifest?.[key])) return manifest[key]
		}
		return null
	}

	const getLocalizedManifestText = function (manifest, key, fallback) {
		const candidates = getLocaleCandidates()
		const translations = getManifestTranslationRoot(manifest)
		if (translations) {
			for (const language of candidates) {
				const group = translations[language]
				const value = pickLocalizedText(group?.[key], [ language, 'en' ])
				if (value) return value
			}
		}
		return pickLocalizedText(manifest?.[key], candidates) || fallback || ''
	}

	const getLocalizedConfigText = function (manifest, item, key, fallback) {
		const candidates = getLocaleCandidates()
		const translations = getManifestTranslationRoot(manifest)
		if (translations && item?.key) {
			for (const language of candidates) {
				const group = translations[language]
				const configGroup = group?.config || group?.configs
				const value = pickLocalizedText(configGroup?.[item.key]?.[key], [ language, 'en' ])
				if (value) return value
			}
		}
		const direct = pickLocalizedText(item?.translations?.[key], candidates) || pickLocalizedText(item?.[key], candidates)
		return direct || fallback || ''
	}

	const getLocalizedConfigValueLabels = function (manifest, item) {
		const candidates = getLocaleCandidates()
		const translations = getManifestTranslationRoot(manifest)
		if (!translations || !item?.key) return null
		for (const language of candidates) {
			const group = translations[language]
			const configGroup = group?.config || group?.configs
			const value = configGroup?.[item.key]?.valueLabels || configGroup?.[item.key]?.sliderLabels
			if (Array.isArray(value) || isLocaleObject(value)) return value
		}
		return null
	}

	const getLocalizedModName = function (mod) {
		return getLocalizedManifestText(mod?.manifest, 'name', mod?.path || mod?.id || '')
	}

	const getLocalizedModDescription = function (mod) {
		return getLocalizedManifestText(mod?.manifest, 'description', '')
	}

	const getInlineLocalizedText = function (value, values) {
		let text = pickLocalizedText(value, getLocaleCandidates())
		if (!values) return text
		for (const key in values) text = text.replace(new RegExp('\\{' + key + '\\}', 'g'), values[key])
		return text
	}

	const CONFIG_INLINE_TEXT = {
	"glowColorLabel": {
		"en": "{name} glow color",
		"ru": "Свечение ресурса {name}",
		"de": "{name}-Leuchtfarbe",
		"ptbr": "Brilho de {name}",
		"it": "Colore bagliore {name}",
		"es": "Color de brillo de {name}",
		"fr": "Couleur de halo de {name}",
		"nl": "Gloedkleur van {name}",
		"cz": "Barva záře {name}",
		"pl": "Kolor poświaty {name}",
		"jp": "{name}の光輪色",
		"kr": "{name} 발광 색상",
		"sch": "{name} 光圈颜色",
		"tch": "{name} 光圈顏色",
		"thai": "สีเรืองแสง {name}",
		"hu": "{name} fényének színe",
		"lv": "{name} spīduma krāsa",
		"ro": "Culoare halou {name}",
		"no": "Glødefarge for {name}",
		"modsch": "{name} 光圈颜色"
	},
	"reset": {
		"en": "Reset",
		"ru": "Сброс",
		"de": "Zurücksetzen",
		"ptbr": "Redefinir",
		"it": "Ripristina",
		"es": "Restablecer",
		"fr": "Réinitialiser",
		"nl": "Resetten",
		"cz": "Resetovat",
		"pl": "Resetuj",
		"jp": "リセット",
		"kr": "초기화",
		"sch": "重置",
		"tch": "重置",
		"thai": "รีเซ็ต",
		"hu": "Visszaállítás",
		"lv": "Atiestatīt",
		"ro": "Resetare",
		"no": "Tilbakestill",
		"modsch": "重置"
	},
	"resetTitle": {
		"en": "Reset to resource color",
		"ru": "Сбросить к цвету ресурса",
		"de": "Auf Ressourcenfarbe zurücksetzen",
		"ptbr": "Redefinir para a cor do recurso",
		"it": "Ripristina al colore risorsa",
		"es": "Restablecer al color del recurso",
		"fr": "Réinitialiser à la couleur de ressource",
		"nl": "Terugzetten naar grondstofkleur",
		"cz": "Resetovat na barvu suroviny",
		"pl": "Resetuj do koloru zasobu",
		"jp": "資源色にリセット",
		"kr": "자원 색상으로 초기화",
		"sch": "重置为资源默认颜色",
		"tch": "重置為資源預設顏色",
		"thai": "รีเซ็ตเป็นสีทรัพยากร",
		"hu": "Visszaállítás az erőforrás színére",
		"lv": "Atiestatīt uz resursa krāsu",
		"ro": "Resetează la culoarea resursei",
		"no": "Tilbakestill til ressursfarge",
		"modsch": "重置为资源默认颜色"
	},
	"exportColors": { "en": "Export colors", "sch": "导出颜色", "modsch": "导出颜色", "tch": "匯出顏色" },
	"exportColorsTitle": { "en": "Copy these colors to the clipboard", "sch": "复制这些颜色到剪贴板", "modsch": "复制这些颜色到剪贴板", "tch": "複製這些顏色到剪貼簿" },
	"importColors": { "en": "Import colors", "sch": "导入颜色", "modsch": "导入颜色", "tch": "匯入顏色" },
	"importColorsTitle": { "en": "Import colors from the clipboard", "sch": "从剪贴板导入颜色", "modsch": "从剪贴板导入颜色", "tch": "從剪貼簿匯入顏色" },
	"colorsCopied": { "en": "Copied colors.", "sch": "已复制颜色。", "modsch": "已复制颜色。", "tch": "已複製顏色。" },
	"colorsImported": { "en": "Imported {count} colors.", "sch": "已导入 {count} 个颜色。", "modsch": "已导入 {count} 个颜色。", "tch": "已匯入 {count} 個顏色。" },
	"colorExportFailed": { "en": "Export failed.", "sch": "导出失败。", "modsch": "导出失败。", "tch": "匯出失敗。" },
	"colorImportFailed": { "en": "Import failed.", "sch": "导入失败。", "modsch": "导入失败。", "tch": "匯入失敗。" },
	"colorClipboardEmpty": { "en": "Clipboard is empty.", "sch": "剪贴板是空的。", "modsch": "剪贴板是空的。", "tch": "剪貼簿是空的。" },
	"colorClipboardInvalid": { "en": "Clipboard does not contain valid color data.", "sch": "剪贴板里没有有效的颜色数据。", "modsch": "剪贴板里没有有效的颜色数据。", "tch": "剪貼簿裡沒有有效的顏色資料。" },
	"colorClipboardUnavailable": { "en": "Clipboard is not available.", "sch": "剪贴板不可用。", "modsch": "剪贴板不可用。", "tch": "剪貼簿不可用。" },
	"colorNoMatches": { "en": "No matching color rows were found.", "sch": "没有找到匹配的颜色行。", "modsch": "没有找到匹配的颜色行。", "tch": "沒有找到匹配的顏色列。" },
	"colorInvalidHex": { "en": "Enter colors as #RRGGBB.", "sch": "请输入 #RRGGBB 格式的颜色。", "modsch": "请输入 #RRGGBB 格式的颜色。", "tch": "請輸入 #RRGGBB 格式的顏色。" }
}

	const ensurePanelStyle = function () {
		if (document.getElementById('modloader-panel-style')) return
		const style = document.createElement('style')
		style.id = 'modloader-panel-style'
		style.textContent = `
			#modloader-panel { --modloader-panel-bg: rgba(8, 10, 12, .94); --modloader-panel-text: rgba(255,255,255,.92); --modloader-text-strong: rgba(255,255,255,.9); --modloader-text: rgba(255,255,255,.74); --modloader-text-muted: rgba(255,255,255,.62); --modloader-text-subtle: rgba(255,255,255,.48); --modloader-border: rgba(255,255,255,.1); --modloader-border-strong: rgba(255,255,255,.16); --modloader-surface: rgba(255,255,255,.045); --modloader-surface-hover: rgba(255,255,255,.08); --modloader-surface-active: rgba(255,255,255,.14); --modloader-control-bg: rgba(255,255,255,.08); --modloader-control-bg-hover: rgba(255,255,255,.14); --modloader-control-border: rgba(255,255,255,.14); --modloader-control-border-hover: rgba(207,233,255,.3); --modloader-control-text: rgba(255,255,255,.78); --modloader-control-text-hover: rgba(255,255,255,.94); --modloader-input-bg: rgba(0,0,0,.22); --modloader-input-border: rgba(255,255,255,.16); --modloader-input-text: rgba(255,255,255,.92); --modloader-focus-border: rgba(207,233,255,.5); --modloader-panel-shadow: 0 12px 36px rgba(0,0,0,.35); --modloader-primary-bg: #f2f2ed; --modloader-primary-text: #111; --modloader-danger-bg: rgba(255,96,96,.2); --modloader-danger-border: rgba(255,96,96,.28); --modloader-danger-text: #ffd4d4; --modloader-warning-text: #ffe1a3; --modloader-error-text: #ffb0b0; --modloader-ok-text: #cfe9ff; --modloader-slider-fill-color: rgba(207,233,255,.82); --modloader-slider-track-color: rgba(255,255,255,.14); --modloader-slider-track-shadow: inset 0 1px 3px rgba(0,0,0,.42); position: fixed; right: 16px; top: 16px; z-index: 2147483647; box-sizing: border-box; width: min(860px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; padding: 14px; border-radius: 8px; background: var(--modloader-panel-bg); color: var(--modloader-panel-text); box-shadow: var(--modloader-panel-shadow); font: 13px/1.45 Montserrat, Arial, sans-serif; transition: left .22s ease, top .22s ease, right .22s ease, background .16s ease, box-shadow .16s ease; }
			#modloader-panel.modloader-panel-modal-open > :not(.modloader-modal) { filter: blur(4px); opacity: .52; pointer-events: none; user-select: none; }
			#modloader-panel h2 { flex: 1 1 auto; min-width: 0; margin: 0; font-size: 16px; }
			#modloader-panel h3 { margin: 14px 0 6px; font-size: 13px; color: var(--modloader-text); }
			#modloader-panel button, #modloader-panel input, #modloader-panel textarea, #modloader-panel select { font: inherit; }
			#modloader-panel .modloader-panel-header { display: flex; align-items: center; gap: 10px; margin: -3px -3px 8px; padding: 3px; cursor: grab; user-select: none; touch-action: none; }
			#modloader-panel .modloader-panel-header:active { cursor: grabbing; }
			#modloader-panel .modloader-panel-controls { display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; }
			#modloader-panel .modloader-panel-close, #modloader-panel .modloader-panel-edge, #modloader-panel .modloader-panel-settings { position: relative; display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 5px; padding: 0; background: transparent; color: var(--modloader-control-text); cursor: pointer; }
			#modloader-panel .modloader-panel-close:before, #modloader-panel .modloader-panel-close:after { content: ''; position: absolute; left: 50%; top: 50%; width: 15px; height: 2px; border-radius: 999px; background: currentColor; transform-origin: center; }
			#modloader-panel .modloader-panel-close:before { transform: translate(-50%, -50%) rotate(45deg); }
			#modloader-panel .modloader-panel-close:after { transform: translate(-50%, -50%) rotate(-45deg); }
			#modloader-panel .modloader-panel-edge { font: 700 15px/1 Montserrat, Arial, sans-serif; letter-spacing: -1px; }
			#modloader-panel .modloader-panel-edge-icon { display: block; transform: translateY(-1px); }
			#modloader-panel .modloader-panel-settings:before { content: '\\2699'; display: block; font-size: 16px; line-height: 1; transform: translateY(1px); }
			#modloader-panel .modloader-panel-settings.active, #modloader-panel .modloader-panel-edge:hover:not(:disabled), #modloader-panel .modloader-panel-settings:hover, #modloader-panel .modloader-panel-close:hover { color: var(--modloader-control-text-hover); background: var(--modloader-surface-hover); }
			#modloader-panel .modloader-panel-edge:disabled { cursor: default; opacity: .34; }
			#modloader-panel.modloader-panel-dragging { transition: none; }
			#modloader-panel.modloader-panel-autohidden { width: 42px; height: 42px; max-height: 42px; overflow: visible; padding: 0; background: transparent; box-shadow: none; pointer-events: none; }
			#modloader-panel.modloader-panel-autohidden > :not(.modloader-panel-tab) { display: none; }
			#modloader-panel .modloader-panel-tab { position: absolute; inset: 0; display: none; place-items: center; width: 42px; height: 42px; border: 1px solid var(--modloader-control-border); border-radius: 8px; padding: 0; background: var(--modloader-panel-bg); color: inherit; box-shadow: var(--modloader-panel-shadow); cursor: grab; pointer-events: auto; touch-action: none; }
			#modloader-panel .modloader-panel-tab:active { cursor: grabbing; }
			#modloader-panel.modloader-panel-autohidden .modloader-panel-tab { display: grid; }
			#modloader-panel.modloader-panel-hidden-left .modloader-panel-tab { border-radius: 0 8px 8px 0; }
			#modloader-panel.modloader-panel-hidden-right .modloader-panel-tab { border-radius: 8px 0 0 8px; }
			#modloader-panel.modloader-panel-hidden-top .modloader-panel-tab { border-radius: 0 0 8px 8px; }
			#modloader-panel.modloader-panel-hidden-bottom .modloader-panel-tab { border-radius: 8px 8px 0 0; }
			#modloader-panel .modloader-panel-tab-logo { width: 24px; height: 24px; border-radius: 5px; background: url('img/logo/sheet.png'); background-size: 400% 200%; box-shadow: inset 0 0 0 1px rgba(255,255,255,.14), 0 2px 8px rgba(0,0,0,.22); }
			#modloader-panel .modloader-panel-settings-page { display: grid; gap: 9px; max-height: 0; margin: 0; padding: 0; border-top: 1px solid transparent; border-bottom: 1px solid transparent; opacity: 0; overflow: hidden; pointer-events: none; transform: translateY(-5px); transition: max-height .28s cubic-bezier(.18, .86, .2, 1), margin-bottom .28s cubic-bezier(.18, .86, .2, 1), padding-top .28s cubic-bezier(.18, .86, .2, 1), padding-bottom .28s cubic-bezier(.18, .86, .2, 1), border-color .24s ease, opacity .2s ease, transform .28s cubic-bezier(.18, .86, .2, 1); }
			#modloader-panel .modloader-panel-settings-page.active { max-height: min(42vh, 420px); margin-bottom: 12px; padding: 10px 0 11px; border-color: var(--modloader-border); opacity: 1; pointer-events: auto; transform: translateY(0); }
			#modloader-panel .modloader-panel-settings-title { color: var(--modloader-text-strong); font-weight: 600; }
			#modloader-panel .modloader-panel-settings-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--modloader-text); }
			#modloader-panel .modloader-panel-settings-actions { display: inline-flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
			#modloader-panel .modloader-panel-settings-options { display: inline-flex; align-items: center; gap: 4px; padding: 2px; border-radius: 7px; background: var(--modloader-surface-hover); }
			#modloader-panel .modloader-panel-settings-option { border: 0; border-radius: 5px; padding: 5px 8px; background: transparent; color: var(--modloader-control-text); cursor: pointer; }
			#modloader-panel .modloader-panel-settings-option.active { background: var(--modloader-primary-bg); color: var(--modloader-primary-text); }
			#modloader-panel .modloader-panel-settings-number-wrap { display: inline-flex; align-items: center; gap: 5px; color: var(--modloader-text-muted); }
			#modloader-panel .modloader-panel-settings-number { box-sizing: border-box; width: 66px; border: 1px solid var(--modloader-input-border); border-radius: 5px; padding: 4px 6px; background: var(--modloader-input-bg); color: var(--modloader-input-text); text-align: right; outline: none; }
			#modloader-panel .modloader-panel-settings-number:focus { border-color: var(--modloader-focus-border); }
			#modloader-panel .modloader-panel-settings-unit { font-size: 12px; }
			#modloader-panel.modloader-panel-theme-light { --modloader-panel-bg: rgba(248,248,246,.96); --modloader-panel-text: rgba(18,20,22,.94); --modloader-text-strong: rgba(18,20,22,.9); --modloader-text: rgba(30,32,34,.68); --modloader-text-muted: rgba(18,20,22,.58); --modloader-text-subtle: rgba(18,20,22,.46); --modloader-border: rgba(0,0,0,.1); --modloader-border-strong: rgba(0,0,0,.14); --modloader-surface: rgba(0,0,0,.035); --modloader-surface-hover: rgba(0,0,0,.06); --modloader-surface-active: rgba(0,0,0,.09); --modloader-control-bg: rgba(0,0,0,.055); --modloader-control-bg-hover: rgba(0,0,0,.09); --modloader-control-border: rgba(0,0,0,.12); --modloader-control-border-hover: rgba(0,0,0,.18); --modloader-control-text: rgba(18,20,22,.78); --modloader-control-text-hover: rgba(18,20,22,.92); --modloader-input-bg: rgba(0,0,0,.045); --modloader-input-border: rgba(0,0,0,.14); --modloader-input-text: rgba(18,20,22,.92); --modloader-focus-border: rgba(18,20,22,.32); --modloader-panel-shadow: 0 12px 36px rgba(0,0,0,.18); --modloader-primary-bg: rgba(18,20,22,.9); --modloader-primary-text: #fff; --modloader-danger-bg: rgba(155,31,45,.1); --modloader-danger-border: rgba(155,31,45,.24); --modloader-danger-text: #9b1f2d; --modloader-warning-text: rgba(120,78,0,.9); --modloader-error-text: #9b1f2d; --modloader-ok-text: rgba(18,20,22,.62); --modloader-slider-fill-color: rgba(18,20,22,.52); --modloader-slider-track-color: rgba(0,0,0,.12); --modloader-slider-track-shadow: inset 0 1px 2px rgba(0,0,0,.18); }
			#modloader-panel.modloader-panel-theme-light h3, #modloader-panel.modloader-panel-theme-light .modloader-panel-note, #modloader-panel.modloader-panel-theme-light .modloader-panel-label, #modloader-panel.modloader-panel-theme-light .modloader-panel-settings-row, #modloader-panel.modloader-panel-theme-light .modloader-select-all-control { color: var(--modloader-text); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-settings-title, #modloader-panel.modloader-panel-theme-light .modloader-panel-value, #modloader-panel.modloader-panel-theme-light .modloader-mod-path, #modloader-panel.modloader-panel-theme-light .modloader-mod-label, #modloader-panel.modloader-panel-theme-light .modloader-mod-config-title, #modloader-panel.modloader-panel-theme-light .modloader-config-label { color: var(--modloader-text-strong); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-close, #modloader-panel.modloader-panel-theme-light .modloader-panel-edge, #modloader-panel.modloader-panel-theme-light .modloader-panel-settings { color: var(--modloader-control-text); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-settings.active, #modloader-panel.modloader-panel-theme-light .modloader-panel-edge:hover:not(:disabled), #modloader-panel.modloader-panel-theme-light .modloader-panel-settings:hover, #modloader-panel.modloader-panel-theme-light .modloader-panel-close:hover { color: var(--modloader-control-text-hover); background: var(--modloader-surface-hover); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-settings-page.active { border-color: var(--modloader-border); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-settings-options { background: var(--modloader-surface-hover); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-settings-option { color: var(--modloader-control-text); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-settings-option.active { background: var(--modloader-primary-bg); color: var(--modloader-primary-text); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-settings-number-wrap { color: var(--modloader-text-muted); }
			#modloader-panel.modloader-panel-theme-light .modloader-mod-toolbar { background: var(--modloader-panel-bg); }
			#modloader-panel.modloader-panel-theme-light .modloader-mod-row, #modloader-panel.modloader-panel-theme-light .modloader-panel-log, #modloader-panel.modloader-panel-theme-light .modloader-import-zone { border-color: var(--modloader-border); background: var(--modloader-surface); }
			#modloader-panel.modloader-panel-theme-light .modloader-import-zone.dragging { border-color: var(--modloader-focus-border); background: var(--modloader-surface-active); }
			#modloader-panel.modloader-panel-theme-light .modloader-import-copy { color: var(--modloader-text); }
			#modloader-panel.modloader-panel-theme-light .modloader-import-title { color: var(--modloader-text-strong); }
			#modloader-panel.modloader-panel-theme-light .modloader-import-detail { color: var(--modloader-text-muted); }
			#modloader-panel.modloader-panel-theme-light .modloader-import-status { color: var(--modloader-ok-text); }
			#modloader-panel.modloader-panel-theme-light .modloader-mod-name, #modloader-panel.modloader-panel-theme-light .modloader-mod-version, #modloader-panel.modloader-panel-theme-light .modloader-mod-meta, #modloader-panel.modloader-panel-theme-light .modloader-config-meta { color: var(--modloader-text-muted); }
			#modloader-panel.modloader-panel-theme-light input.modloader-config-input:not([type="checkbox"]), #modloader-panel.modloader-panel-theme-light textarea.modloader-config-input, #modloader-panel.modloader-panel-theme-light select.modloader-config-input, #modloader-panel.modloader-panel-theme-light .modloader-panel-settings-number, #modloader-panel.modloader-panel-theme-light .modloader-resource-color-text, #modloader-panel.modloader-panel-theme-light .modloader-color-text { background: var(--modloader-input-bg); border-color: var(--modloader-input-border); color: var(--modloader-input-text); }
			#modloader-panel.modloader-panel-theme-light .modloader-config-slider-number { background: var(--modloader-input-bg); border-color: var(--modloader-input-border); color: var(--modloader-input-text); }
			#modloader-panel.modloader-panel-theme-light .modloader-config-slider-labels, #modloader-panel.modloader-panel-theme-light .modloader-config-slider-value { color: var(--modloader-text-muted); }
			#modloader-panel.modloader-panel-theme-light .modloader-config-slider-range::-webkit-slider-runnable-track { background: linear-gradient(90deg, var(--modloader-slider-fill-color) 0 var(--modloader-slider-fill, 0%), var(--modloader-slider-track-color) var(--modloader-slider-fill, 0%) 100%); box-shadow: var(--modloader-slider-track-shadow); }
			#modloader-panel.modloader-panel-theme-light .modloader-config-slider-range::-moz-range-track { background: var(--modloader-slider-track-color); box-shadow: var(--modloader-slider-track-shadow); }
			#modloader-panel.modloader-panel-theme-light .modloader-config-slider-range::-moz-range-progress { background: var(--modloader-slider-fill-color); }
			#modloader-panel.modloader-panel-theme-light .modloader-action-button, #modloader-panel.modloader-panel-theme-light .modloader-modal-button, #modloader-panel.modloader-panel-theme-light .modloader-resource-color-reset, #modloader-panel.modloader-panel-theme-light .modloader-resource-color-share-button, #modloader-panel.modloader-panel-theme-light .modloader-color-reset, #modloader-panel.modloader-panel-theme-light .modloader-config-number-reset, #modloader-panel.modloader-panel-theme-light .modloader-config-slider-reset { background: var(--modloader-control-bg); border-color: var(--modloader-control-border); color: var(--modloader-control-text); }
			#modloader-panel.modloader-panel-theme-light .modloader-resource-color-reset:hover:not(:disabled), #modloader-panel.modloader-panel-theme-light .modloader-resource-color-share-button:hover:not(:disabled), #modloader-panel.modloader-panel-theme-light .modloader-color-reset:hover:not(:disabled), #modloader-panel.modloader-panel-theme-light .modloader-config-number-reset:hover:not(:disabled), #modloader-panel.modloader-panel-theme-light .modloader-config-slider-reset:hover:not(:disabled) { background: var(--modloader-control-bg-hover); border-color: var(--modloader-control-border-hover); color: var(--modloader-control-text-hover); }
			#modloader-panel.modloader-panel-theme-light .modloader-resource-color-share-status { color: var(--modloader-text-subtle); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-tab { background: var(--modloader-panel-bg); border-color: var(--modloader-control-border); }
			#modloader-panel .modloader-panel-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px 12px; margin: 8px 0 12px; }
			#modloader-panel .modloader-panel-row { display: flex; gap: 12px; justify-content: space-between; border-top: 1px solid var(--modloader-border); padding: 5px 0; }
			#modloader-panel .modloader-panel-row-wide { grid-column: 1 / -1; }
			#modloader-panel .modloader-panel-label { color: var(--modloader-text-muted); }
			#modloader-panel .modloader-panel-value { min-width: 0; text-align: right; overflow-wrap: anywhere; }
			#modloader-panel .modloader-panel-list { margin: 0; padding-left: 18px; }
			#modloader-panel .modloader-panel-log { margin: 0; padding: 8px; border-radius: 6px; background: var(--modloader-surface-hover); white-space: pre-wrap; overflow-wrap: anywhere; }
			#modloader-panel .modloader-panel-issues { margin: 8px 0 0; padding: 8px 8px 8px 24px; border-radius: 6px; background: rgba(255, 196, 87, .12); color: rgba(255,255,255,.92); }
			#modloader-panel .modloader-panel-issue-error { color: var(--modloader-error-text); }
			#modloader-panel .modloader-panel-issue-warn { color: var(--modloader-warning-text); }
			#modloader-panel .modloader-mod-toolbar { position: sticky; top: -14px; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px -2px 10px; padding: 8px 2px; background: var(--modloader-panel-bg); }
			#modloader-panel .modloader-toolbar-left { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
			#modloader-panel .modloader-select-all-control { display: inline-flex; align-items: center; gap: 7px; flex: 0 0 auto; color: var(--modloader-control-text); font-size: 12px; cursor: pointer; user-select: none; }
			#modloader-panel .modloader-select-all-text { transform: translateY(.5px); }
			#modloader-panel .modloader-panel-note { color: var(--modloader-text); }
			#modloader-panel .modloader-panel-reload-note { display: none; color: var(--modloader-warning-text); }
			#modloader-panel .modloader-panel-reload-note.active { display: inline; }
			#modloader-panel .modloader-panel-config-note { position: absolute; right: 2px; top: calc(100% + 2px); display: block; box-sizing: border-box; max-width: min(520px, calc(100% - 16px)); overflow: hidden; border: 1px solid var(--modloader-border); border-radius: 999px; padding: 3px 8px; background: var(--modloader-panel-bg); color: var(--modloader-ok-text); box-shadow: 0 5px 14px rgba(0,0,0,.22); opacity: 0; pointer-events: none; text-overflow: ellipsis; white-space: nowrap; transform: translateY(-3px); transition: opacity .14s ease, transform .14s ease; }
			#modloader-panel .modloader-panel-config-note.active { opacity: 1; transform: translateY(0); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-config-note { border-color: var(--modloader-border); background: var(--modloader-panel-bg); color: var(--modloader-ok-text); box-shadow: 0 5px 14px rgba(0,0,0,.12); }
			#modloader-panel .modloader-save-button { border: 0; border-radius: 6px; padding: 7px 10px; background: var(--modloader-primary-bg); color: var(--modloader-primary-text); cursor: pointer; }
			#modloader-panel .modloader-save-button:disabled { cursor: default; opacity: .45; }
			#modloader-panel .modloader-toolbar-actions { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; }
			#modloader-panel .modloader-action-button { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--modloader-control-border); border-radius: 6px; padding: 7px 9px; background: var(--modloader-control-bg); color: var(--modloader-control-text); cursor: pointer; }
			#modloader-panel .modloader-action-button:hover:not(:disabled), #modloader-panel .modloader-action-button.active { background: var(--modloader-control-bg-hover); border-color: var(--modloader-control-border-hover); color: var(--modloader-control-text-hover); }
			#modloader-panel .modloader-action-button:disabled { cursor: default; opacity: .45; }
			#modloader-panel .modloader-action-icon { position: relative; display: inline-block; width: 15px; height: 15px; flex: 0 0 auto; color: currentColor; }
			#modloader-panel .modloader-action-icon-plus:before, #modloader-panel .modloader-action-icon-plus:after { content: ''; position: absolute; left: 50%; top: 50%; width: 13px; height: 2px; border-radius: 999px; background: currentColor; transform: translate(-50%, -50%); }
			#modloader-panel .modloader-action-icon-plus:after { transform: translate(-50%, -50%) rotate(90deg); }
			#modloader-panel .modloader-action-icon-folder { width: 16px; height: 12px; margin-top: 3px; border-radius: 3px; background: currentColor; }
			#modloader-panel .modloader-action-icon-folder:before { content: ''; position: absolute; left: 2px; top: -2px; width: 6px; height: 3px; border-radius: 2px 2px 0 0; background: currentColor; }
			#modloader-panel .modloader-action-icon-translation:before { content: 'Aa'; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -52%); font: 700 10px/1 Montserrat, Arial, sans-serif; letter-spacing: -.5px; }
			#modloader-panel .modloader-action-icon-export:before, #modloader-panel .modloader-action-icon-import:before { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -55%); font: 700 13px/1 Montserrat, Arial, sans-serif; }
			#modloader-panel .modloader-action-icon-export:before { content: '\\2191'; }
			#modloader-panel .modloader-action-icon-import:before { content: '\\2193'; }
			#modloader-panel .modloader-panel-error { margin: 8px 0; padding: 8px; border-radius: 6px; background: rgba(255, 96, 96, .14); color: var(--modloader-error-text); }
			#modloader-panel .modloader-import-zone { display: grid; place-items: center; min-height: 0; max-height: 0; opacity: 0; overflow: hidden; border: 1px solid transparent; border-radius: 7px; background: var(--modloader-surface); box-shadow: inset 0 1px 18px rgba(0,0,0,.28); transform: translateY(-8px); transition: max-height .22s ease, min-height .22s ease, opacity .16s ease, transform .22s ease, border-color .16s ease; }
			#modloader-panel .modloader-import-zone.active { min-height: 220px; max-height: 320px; opacity: 1; transform: translateY(0); border-color: var(--modloader-border); }
			#modloader-panel .modloader-import-zone.dragging { border-color: var(--modloader-focus-border); background: var(--modloader-surface-active); }
			#modloader-panel .modloader-import-copy { text-align: center; padding: 18px; color: var(--modloader-text); }
			#modloader-panel .modloader-import-title { font-weight: 600; color: var(--modloader-text-strong); }
			#modloader-panel .modloader-import-detail { margin-top: 8px; max-width: 520px; color: var(--modloader-text-muted); }
			#modloader-panel .modloader-import-status { margin-top: 12px; color: var(--modloader-ok-text); }
			#modloader-panel .modloader-mod-manager { display: grid; gap: 6px; max-height: min(48vh, 460px); overflow-x: hidden; overflow-y: auto; padding-right: 5px; scrollbar-gutter: stable; scrollbar-width: thin; scrollbar-color: rgba(185,185,185,.48) transparent; opacity: 1; transform: translateY(0); transition: opacity .16s ease, transform .18s ease, max-height .22s ease; }
			#modloader-panel .modloader-mod-manager.modloader-mod-manager-importing { max-height: 0; opacity: 0; pointer-events: none; transform: translateY(8px); }
			#modloader-panel .modloader-mod-manager::-webkit-scrollbar { width: 4px; }
			#modloader-panel .modloader-mod-manager::-webkit-scrollbar-track { background: transparent; }
			#modloader-panel .modloader-mod-manager::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(185,185,185,.48); }
			#modloader-panel .modloader-mod-manager::-webkit-scrollbar-thumb:hover { background: rgba(210,210,210,.62); }
			#modloader-panel .modloader-mod-row { --modloader-row-gap: 10px; --modloader-row-padding: 9px; --modloader-row-radius: 7px; --modloader-row-font-size: 13px; --modloader-row-check-offset: 2px; --modloader-row-actions-gap: 2px; --modloader-row-index-width: 13px; --modloader-row-index-size: 11px; --modloader-row-action-size: 25px; --modloader-row-action-radius: 5px; --modloader-row-sort-x: 7px; --modloader-row-sort-y: 7px; --modloader-row-sort-width: 11px; --modloader-row-sort-height: 2px; --modloader-row-sort-shadow-1: 5px; --modloader-row-sort-shadow-2: 10px; --modloader-row-delete-body-x: 8px; --modloader-row-delete-body-y: 9px; --modloader-row-delete-body-width: 9px; --modloader-row-delete-body-height: 10px; --modloader-row-delete-border: 2px; --modloader-row-delete-radius-small: 1px; --modloader-row-delete-radius-large: 3px; --modloader-row-delete-lid-x: 7px; --modloader-row-delete-lid-y: 6px; --modloader-row-delete-lid-width: 11px; --modloader-row-delete-lid-height: 2px; --modloader-row-delete-lid-shadow-x: 3px; --modloader-row-delete-lid-shadow-y: -3px; --modloader-row-delete-lid-shadow-spread: -1px; --modloader-row-title-gap: 8px; --modloader-row-meta-gap: 3px; --modloader-row-warning-gap: 5px; --modloader-row-switch-width: 46px; --modloader-row-switch-height: 24px; --modloader-row-switch-knob: 20px; --modloader-row-switch-pad: 2px; --modloader-row-switch-slide: 22px; --modloader-row-switch-label-off: 6px; --modloader-row-switch-label-on: 7px; --modloader-row-switch-label-size: 9px; --modloader-row-switch-letter-spacing: .25px; position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--modloader-row-gap); align-items: flex-start; padding: var(--modloader-row-padding); border: 1px solid var(--modloader-border); border-radius: var(--modloader-row-radius); background: var(--modloader-surface); font-size: var(--modloader-row-font-size); line-height: 1.45; transition: border-color .14s ease, background .14s ease, box-shadow .14s ease, opacity .14s ease; }
			#modloader-panel .modloader-mod-row-configurable { cursor: pointer; }
			#modloader-panel .modloader-mod-row-configurable:hover { border-color: var(--modloader-control-border-hover); }
			#modloader-panel .modloader-mod-row-expanded { border-color: var(--modloader-focus-border); box-shadow: 0 8px 22px rgba(0,0,0,.16); }
			#modloader-panel .modloader-mod-row-moving { z-index: 3; will-change: transform; }
			#modloader-panel .modloader-mod-row-dropping { z-index: 5; pointer-events: none; will-change: transform; }
			#modloader-panel .modloader-mod-row-dragging { --modloader-row-gap: 11px; --modloader-row-padding: 9.9px; --modloader-row-radius: 7.7px; --modloader-row-font-size: 14.3px; --modloader-row-check-offset: 2.2px; --modloader-row-actions-gap: 2.2px; --modloader-row-index-width: 14.3px; --modloader-row-index-size: 12.1px; --modloader-row-action-size: 27.5px; --modloader-row-action-radius: 5.5px; --modloader-row-sort-x: 7.7px; --modloader-row-sort-y: 7.7px; --modloader-row-sort-width: 12.1px; --modloader-row-sort-height: 2.2px; --modloader-row-sort-shadow-1: 5.5px; --modloader-row-sort-shadow-2: 11px; --modloader-row-delete-body-x: 8.8px; --modloader-row-delete-body-y: 9.9px; --modloader-row-delete-body-width: 9.9px; --modloader-row-delete-body-height: 11px; --modloader-row-delete-border: 2.2px; --modloader-row-delete-radius-small: 1.1px; --modloader-row-delete-radius-large: 3.3px; --modloader-row-delete-lid-x: 7.7px; --modloader-row-delete-lid-y: 6.6px; --modloader-row-delete-lid-width: 12.1px; --modloader-row-delete-lid-height: 2.2px; --modloader-row-delete-lid-shadow-x: 3.3px; --modloader-row-delete-lid-shadow-y: -3.3px; --modloader-row-delete-lid-shadow-spread: -1.1px; --modloader-row-title-gap: 8.8px; --modloader-row-meta-gap: 3.3px; --modloader-row-warning-gap: 5.5px; --modloader-row-switch-width: 50.6px; --modloader-row-switch-height: 26.4px; --modloader-row-switch-knob: 22px; --modloader-row-switch-pad: 2.2px; --modloader-row-switch-slide: 24.2px; --modloader-row-switch-label-off: 6.6px; --modloader-row-switch-label-on: 7.7px; --modloader-row-switch-label-size: 9.9px; --modloader-row-switch-letter-spacing: .275px; z-index: 6; opacity: 1; border-color: rgba(207,233,255,.48); background: rgba(16,22,28,.82); box-shadow: 0 22px 48px rgba(0,0,0,.52), 0 0 0 1px rgba(207,233,255,.13), inset 0 1px 0 rgba(255,255,255,.1); backdrop-filter: blur(14px) saturate(1.18); -webkit-backdrop-filter: blur(14px) saturate(1.18); pointer-events: none; will-change: left, top; }
			#modloader-panel.modloader-panel-theme-light .modloader-mod-row-dragging { border-color: rgba(18,20,22,.22); background: rgba(250,250,247,.86); box-shadow: 0 20px 42px rgba(0,0,0,.22), 0 0 0 1px rgba(18,20,22,.08), inset 0 1px 0 rgba(255,255,255,.7); }
			#modloader-panel .modloader-mod-sort-placeholder { min-height: 24px; border: 1px solid transparent; border-radius: 7px; background: transparent; box-sizing: border-box; transition: height .16s ease, min-height .16s ease; }
			#modloader-panel .modloader-mod-row-selected { border-color: rgba(174, 231, 160, .42); background: rgba(120, 190, 120, .08); }
			#modloader-panel .modloader-mod-row-problem { border-color: rgba(255, 196, 87, .48); }
			#modloader-panel .modloader-mod-check { margin-top: var(--modloader-row-check-offset); }
			#modloader-panel .modloader-mod-main { min-width: 0; }
			#modloader-panel .modloader-mod-actions { display: inline-flex; align-items: center; justify-content: flex-end; gap: var(--modloader-row-actions-gap); padding-top: 0; }
			#modloader-panel .modloader-mod-index { min-width: var(--modloader-row-index-width); border: 0; padding: 0; background: transparent; color: var(--modloader-text-subtle); text-align: right; font-weight: 700; font-size: var(--modloader-row-index-size); line-height: 1; font-family: Montserrat, Arial, sans-serif; pointer-events: none; }
			#modloader-panel .modloader-mod-delete, #modloader-panel .modloader-mod-sort { position: relative; width: var(--modloader-row-action-size); height: var(--modloader-row-action-size); border: 0; border-radius: var(--modloader-row-action-radius); background: transparent; color: var(--modloader-text-muted); cursor: pointer; }
			#modloader-panel .modloader-mod-sort { cursor: grab; touch-action: none; }
			#modloader-panel .modloader-mod-sort:active { cursor: grabbing; }
			#modloader-panel .modloader-mod-sort:before { content: ''; position: absolute; left: var(--modloader-row-sort-x); top: var(--modloader-row-sort-y); width: var(--modloader-row-sort-width); height: var(--modloader-row-sort-height); border-radius: 999px; background: currentColor; box-shadow: 0 var(--modloader-row-sort-shadow-1) 0 currentColor, 0 var(--modloader-row-sort-shadow-2) 0 currentColor; }
			#modloader-panel .modloader-mod-delete:hover { color: #ffb0b0; background: rgba(255,96,96,.1); }
			#modloader-panel .modloader-mod-sort:hover { color: var(--modloader-control-text-hover); background: var(--modloader-surface-hover); }
			#modloader-panel .modloader-mod-delete:before { content: ''; position: absolute; left: var(--modloader-row-delete-body-x); top: var(--modloader-row-delete-body-y); width: var(--modloader-row-delete-body-width); height: var(--modloader-row-delete-body-height); border: var(--modloader-row-delete-border) solid currentColor; border-top: 0; border-radius: var(--modloader-row-delete-radius-small) var(--modloader-row-delete-radius-small) var(--modloader-row-delete-radius-large) var(--modloader-row-delete-radius-large); box-sizing: border-box; }
			#modloader-panel .modloader-mod-delete:after { content: ''; position: absolute; left: var(--modloader-row-delete-lid-x); top: var(--modloader-row-delete-lid-y); width: var(--modloader-row-delete-lid-width); height: var(--modloader-row-delete-lid-height); border-radius: 999px; background: currentColor; box-shadow: var(--modloader-row-delete-lid-shadow-x) var(--modloader-row-delete-lid-shadow-y) 0 var(--modloader-row-delete-lid-shadow-spread) currentColor; }
			#modloader-panel .modloader-mod-title { display: flex; flex-wrap: wrap; gap: var(--modloader-row-title-gap); align-items: baseline; }
			#modloader-panel .modloader-mod-path { font-weight: 600; overflow-wrap: anywhere; }
			#modloader-panel .modloader-mod-version { color: var(--modloader-text-muted); }
			#modloader-panel.modloader-panel-theme-light .modloader-mod-delete, #modloader-panel.modloader-panel-theme-light .modloader-mod-sort { color: var(--modloader-text-subtle); }
			#modloader-panel.modloader-panel-theme-light .modloader-mod-sort:hover { color: var(--modloader-control-text-hover); background: var(--modloader-surface-hover); }
			#modloader-panel.modloader-panel-theme-light .modloader-mod-index { color: var(--modloader-text-subtle); }
			#modloader-panel .modloader-mod-name { color: var(--modloader-text); overflow-wrap: anywhere; }
			#modloader-panel .modloader-mod-meta { margin-top: var(--modloader-row-meta-gap); color: var(--modloader-text-muted); overflow-wrap: anywhere; }
			#modloader-panel .modloader-mod-warning { display: none; margin-top: var(--modloader-row-warning-gap); color: var(--modloader-warning-text); overflow-wrap: anywhere; }
			#modloader-panel .modloader-mod-warning.active { display: block; }
			#modloader-panel .modloader-mod-config { max-height: 0; margin-top: 0; padding-top: 0; border-top: 1px solid transparent; opacity: 0; overflow: hidden; pointer-events: none; transform: translateY(-4px); transition: max-height .32s cubic-bezier(.18, .86, .2, 1), margin-top .32s cubic-bezier(.18, .86, .2, 1), padding-top .32s cubic-bezier(.18, .86, .2, 1), border-top-color .24s ease, opacity .22s ease, transform .32s cubic-bezier(.18, .86, .2, 1); }
			#modloader-panel .modloader-mod-row-expanded .modloader-mod-config { max-height: min(42vh, 380px); margin-top: 8px; padding-top: 8px; border-top-color: var(--modloader-border); opacity: 1; pointer-events: auto; transform: translateY(0); }
			#modloader-panel .modloader-mod-config-title { margin-bottom: 5px; color: var(--modloader-text); font-weight: 600; }
			#modloader-panel .modloader-mod-config-scroll { max-height: min(34vh, 310px); overflow-x: hidden; overflow-y: auto; padding-right: 5px; scrollbar-gutter: stable; scrollbar-width: thin; scrollbar-color: rgba(185,185,185,.48) transparent; }
			#modloader-panel .modloader-mod-config-scroll::-webkit-scrollbar { width: 4px; }
			#modloader-panel .modloader-mod-config-scroll::-webkit-scrollbar-track { background: transparent; }
			#modloader-panel .modloader-mod-config-scroll::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(185,185,185,.48); }
			#modloader-panel .modloader-mod-config-scroll::-webkit-scrollbar-thumb:hover { background: rgba(210,210,210,.62); }
			#modloader-panel .modloader-config-section { position: relative; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--modloader-border); }
			#modloader-panel .modloader-config-section:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
			#modloader-panel .modloader-config-section-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 22px; margin-bottom: 6px; color: var(--modloader-text); }
			#modloader-panel .modloader-config-section-title { flex: 1 1 auto; min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
			#modloader-panel .modloader-config-section-sort { position: relative; flex: 0 0 auto; width: 22px; height: 22px; border: 0; border-radius: 5px; background: transparent; color: var(--modloader-text-muted); cursor: grab; touch-action: none; }
			#modloader-panel .modloader-config-section-sort-floating { position: absolute; right: 0; top: 0; z-index: 2; opacity: .58; }
			#modloader-panel .modloader-config-section-sort-floating:hover { opacity: 1; }
			#modloader-panel .modloader-config-section-sort:active { cursor: grabbing; }
			#modloader-panel .modloader-config-section-sort:before { content: ''; position: absolute; left: 6px; top: 6px; width: 10px; height: 2px; border-radius: 999px; background: currentColor; box-shadow: 0 5px 0 currentColor, 0 10px 0 currentColor; }
			#modloader-panel .modloader-config-section-sort:hover { color: var(--modloader-control-text-hover); background: var(--modloader-surface-hover); }
			#modloader-panel .modloader-config-section-moving { z-index: 3; will-change: transform; }
			#modloader-panel .modloader-config-section-dragging { z-index: 7; opacity: 1; margin-top: 0; border: 1px solid rgba(207,233,255,.34); border-radius: 7px; padding: 8px; background: rgba(16,22,28,.82); box-shadow: 0 18px 38px rgba(0,0,0,.46), 0 0 0 1px rgba(207,233,255,.12), inset 0 1px 0 rgba(255,255,255,.08); backdrop-filter: blur(14px) saturate(1.18); -webkit-backdrop-filter: blur(14px) saturate(1.18); pointer-events: none; will-change: left, top; }
			#modloader-panel .modloader-config-section-placeholder { min-height: 20px; border: 1px solid transparent; border-radius: 6px; background: transparent; box-sizing: border-box; transition: height .16s ease, min-height .16s ease; }
			#modloader-panel .modloader-mod-config-scroll > .modloader-config-field:first-child, #modloader-panel .modloader-config-section-body .modloader-config-field:first-child { margin-top: 0; }
			#modloader-panel .modloader-config-field { display: grid; grid-template-columns: minmax(130px, .8fr) minmax(170px, 1fr); gap: 4px 10px; align-items: center; margin-top: 6px; }
			#modloader-panel .modloader-config-section-start { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--modloader-border); }
			#modloader-panel.modloader-panel-theme-light .modloader-config-section, #modloader-panel.modloader-panel-theme-light .modloader-config-section-start { border-top-color: var(--modloader-border); }
			#modloader-panel.modloader-panel-theme-light .modloader-config-section-title { color: var(--modloader-text); }
			#modloader-panel.modloader-panel-theme-light .modloader-config-section-sort { color: var(--modloader-text-subtle); }
			#modloader-panel.modloader-panel-theme-light .modloader-config-section-sort:hover { color: var(--modloader-control-text-hover); background: var(--modloader-surface-hover); }
			#modloader-panel.modloader-panel-theme-light .modloader-config-section-dragging { border-color: rgba(18,20,22,.16); background: rgba(250,250,247,.86); box-shadow: 0 16px 34px rgba(0,0,0,.2), 0 0 0 1px rgba(18,20,22,.08), inset 0 1px 0 rgba(255,255,255,.7); }
			#modloader-panel .modloader-config-field-disabled { opacity: .52; }
			#modloader-panel .modloader-config-text { min-width: 0; }
			#modloader-panel .modloader-config-label { display: block; color: var(--modloader-text-strong); overflow-wrap: anywhere; }
			#modloader-panel .modloader-config-meta { display: block; font-size: 11px; color: var(--modloader-text-subtle); overflow-wrap: anywhere; }
			#modloader-panel input.modloader-config-input:not([type="checkbox"]), #modloader-panel textarea.modloader-config-input, #modloader-panel select.modloader-config-input { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid var(--modloader-input-border); border-radius: 5px; padding: 5px 6px; background: var(--modloader-input-bg); color: var(--modloader-input-text); outline: none; }
			#modloader-panel .modloader-config-number { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 5px; align-items: center; min-width: 0; }
			#modloader-panel .modloader-config-number-reset, #modloader-panel .modloader-config-slider-reset { border: 1px solid var(--modloader-control-border); border-radius: 5px; padding: 5px 7px; background: var(--modloader-control-bg); color: var(--modloader-control-text); cursor: pointer; }
			#modloader-panel .modloader-config-number-reset:hover:not(:disabled), #modloader-panel .modloader-config-slider-reset:hover:not(:disabled) { background: var(--modloader-control-bg-hover); border-color: var(--modloader-control-border-hover); color: var(--modloader-control-text-hover); }
			#modloader-panel .modloader-config-number-reset:disabled, #modloader-panel .modloader-config-slider-reset:disabled { cursor: default; opacity: .45; }
			#modloader-panel .modloader-config-slider { display: grid; grid-template-columns: minmax(0, 1fr) 66px auto; gap: 4px 8px; align-items: center; width: 100%; min-width: 0; --modloader-slider-thumb-half: 14px; }
			#modloader-panel .modloader-config-slider-labeled { grid-template-columns: minmax(0, 1fr) auto; }
			#modloader-panel .modloader-config-slider-range { appearance: none; -webkit-appearance: none; width: 100%; min-width: 0; height: 32px; margin: 0; background: transparent; cursor: grab; outline: none; }
			#modloader-panel .modloader-config-slider-range:active { cursor: grabbing; }
			#modloader-panel .modloader-config-slider-range::-webkit-slider-runnable-track { height: 6px; border-radius: 999px; background: linear-gradient(90deg, var(--modloader-slider-fill-color) 0 var(--modloader-slider-fill, 0%), var(--modloader-slider-track-color) var(--modloader-slider-fill, 0%) 100%); box-shadow: var(--modloader-slider-track-shadow); transition: background .14s ease, box-shadow .14s ease; }
			#modloader-panel .modloader-config-slider-range::-webkit-slider-thumb { -webkit-appearance: none; width: 28px; height: 31px; margin-top: -12px; border: 0; background: url('img/resources.png') -196px 0 / 280px 31px no-repeat; filter: drop-shadow(0 2px 3px rgba(0,0,0,.55)) drop-shadow(0 0 5px rgba(207,233,255,.22)); transition: filter .14s ease; }
			#modloader-panel .modloader-config-slider-range::-moz-range-track { height: 6px; border-radius: 999px; background: var(--modloader-slider-track-color); box-shadow: var(--modloader-slider-track-shadow); transition: background .14s ease, box-shadow .14s ease; }
			#modloader-panel .modloader-config-slider-range::-moz-range-progress { height: 6px; border-radius: 999px; background: var(--modloader-slider-fill-color); }
			#modloader-panel .modloader-config-slider-range::-moz-range-thumb { width: 28px; height: 31px; border: 0; background: url('img/resources.png') -196px 0 / 280px 31px no-repeat; filter: drop-shadow(0 2px 3px rgba(0,0,0,.55)) drop-shadow(0 0 5px rgba(207,233,255,.22)); transition: filter .14s ease; }
			#modloader-panel .modloader-config-slider-range:focus-visible::-webkit-slider-thumb { filter: drop-shadow(0 2px 3px rgba(0,0,0,.58)) drop-shadow(0 0 8px rgba(207,233,255,.52)); }
			#modloader-panel .modloader-config-slider-range:focus-visible::-moz-range-thumb { filter: drop-shadow(0 2px 3px rgba(0,0,0,.58)) drop-shadow(0 0 8px rgba(207,233,255,.52)); }
			#modloader-panel .modloader-config-slider-number { box-sizing: border-box; width: 66px; min-width: 0; border: 1px solid var(--modloader-input-border); border-radius: 5px; padding: 5px 6px; background: var(--modloader-input-bg); color: var(--modloader-input-text); text-align: right; outline: none; }
			#modloader-panel .modloader-config-slider-number:focus { border-color: var(--modloader-focus-border); }
			#modloader-panel .modloader-config-slider-labeled .modloader-config-slider-number { display: none; }
			#modloader-panel .modloader-config-slider-labels { grid-column: 1; position: relative; height: 13px; min-width: 0; margin: -9px var(--modloader-slider-thumb-half) 0; color: var(--modloader-text-subtle); font-size: 10px; }
			#modloader-panel .modloader-config-slider-labels span { position: absolute; top: 0; max-width: 74px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; transform: translateX(-50%); }
			#modloader-panel .modloader-config-slider-value { grid-column: 1; min-width: 0; text-align: center; color: var(--modloader-text); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
			#modloader-panel .modloader-config-slider[data-disabled=true] { opacity: .52; }
			#modloader-panel .modloader-config-slider-range:disabled, #modloader-panel .modloader-config-slider-number:disabled, #modloader-panel .modloader-config-slider-reset:disabled { cursor: default; }
			#modloader-panel .modloader-switch-input { appearance: none; -webkit-appearance: none; position: relative; width: 46px; height: 24px; margin: 0; border: 0; border-radius: 999px; background: rgba(18,21,24,.66); box-shadow: inset 0 2px 6px rgba(0,0,0,.48), inset 0 -1px 0 rgba(255,255,255,.06), inset 0 0 0 1px rgba(255,255,255,.08), 0 1px 2px rgba(255,255,255,.04); cursor: pointer; outline: none; transition: background .18s ease, box-shadow .18s ease, opacity .18s ease; vertical-align: middle; }
			#modloader-panel .modloader-switch-input:before { content: ''; position: absolute; z-index: 2; left: 2px; top: 2px; width: 20px; height: 20px; border-radius: 50%; background: linear-gradient(145deg, rgba(255,255,255,.98), rgba(220,230,237,.96)); box-shadow: 0 3px 7px rgba(0,0,0,.34), 0 1px 1px rgba(0,0,0,.24), inset 0 1px 1px rgba(255,255,255,.92), inset 0 -1px 2px rgba(0,0,0,.12); transition: transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .18s ease; }
			#modloader-panel .modloader-switch-input:after { content: 'OFF'; position: absolute; z-index: 1; right: 6px; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,.46); font: 700 9px/1 Montserrat, Arial, sans-serif; letter-spacing: .25px; text-shadow: 0 1px 2px rgba(0,0,0,.42); pointer-events: none; transition: left .18s ease, right .18s ease, color .18s ease, text-shadow .18s ease; }
			#modloader-panel .modloader-switch-input:checked { background: linear-gradient(135deg, rgba(227,253,67,.98), rgba(166,242,70,.96) 42%, rgba(76,185,107,.98)); box-shadow: inset 0 2px 5px rgba(0,0,0,.18), inset 0 -1px 0 rgba(255,255,255,.34), inset 0 0 0 1px rgba(255,255,255,.26), 0 0 10px rgba(227,253,67,.9), 0 0 24px rgba(166,242,70,.68), 0 0 46px rgba(166,242,70,.38), 0 0 72px rgba(76,185,107,.24); }
			#modloader-panel .modloader-switch-input:checked:before { transform: translateX(22px); box-shadow: 0 3px 8px rgba(0,0,0,.3), 0 0 12px rgba(255,255,255,.34), 0 0 18px rgba(227,253,67,.42), inset 0 1px 1px rgba(255,255,255,.96), inset 0 -1px 2px rgba(0,0,0,.1); }
			#modloader-panel .modloader-switch-input:checked:after { content: 'ON'; left: 7px; right: auto; color: #fff; text-shadow: 0 0 6px rgba(255,255,255,.62), 0 0 12px rgba(227,253,67,.56), 0 1px 2px rgba(0,0,0,.32); }
			#modloader-panel .modloader-switch-input:hover:not(:disabled):before { box-shadow: 0 4px 9px rgba(0,0,0,.38), 0 1px 1px rgba(0,0,0,.24), inset 0 1px 1px rgba(255,255,255,.95), inset 0 -1px 2px rgba(0,0,0,.12); }
			#modloader-panel .modloader-switch-input:checked:hover:not(:disabled) { box-shadow: inset 0 2px 5px rgba(0,0,0,.16), inset 0 -1px 0 rgba(255,255,255,.36), inset 0 0 0 1px rgba(255,255,255,.3), 0 0 14px rgba(227,253,67,1), 0 0 32px rgba(166,242,70,.78), 0 0 58px rgba(166,242,70,.44), 0 0 86px rgba(76,185,107,.28); }
			#modloader-panel .modloader-switch-input:focus-visible { box-shadow: inset 0 2px 6px rgba(0,0,0,.42), inset 0 0 0 1px rgba(255,255,255,.16), 0 0 0 2px rgba(124,238,153,.34), 0 0 14px rgba(124,238,153,.24); }
			#modloader-panel .modloader-switch-input:disabled { cursor: default; opacity: .45; }
			#modloader-panel .modloader-mod-row .modloader-switch-input { width: var(--modloader-row-switch-width); height: var(--modloader-row-switch-height); }
			#modloader-panel .modloader-mod-row .modloader-switch-input:before { left: var(--modloader-row-switch-pad); top: var(--modloader-row-switch-pad); width: var(--modloader-row-switch-knob); height: var(--modloader-row-switch-knob); }
			#modloader-panel .modloader-mod-row .modloader-switch-input:after { right: var(--modloader-row-switch-label-off); font-size: var(--modloader-row-switch-label-size); letter-spacing: var(--modloader-row-switch-letter-spacing); }
			#modloader-panel .modloader-mod-row .modloader-switch-input:checked:before { transform: translateX(var(--modloader-row-switch-slide)); }
			#modloader-panel .modloader-mod-row .modloader-switch-input:checked:after { left: var(--modloader-row-switch-label-on); right: auto; }
			#modloader-panel textarea.modloader-config-input { min-height: 54px; resize: vertical; }
			#modloader-panel .modloader-config-input:focus { border-color: var(--modloader-focus-border); }
			#modloader-panel .modloader-config-field-invalid .modloader-config-input { border-color: rgba(255, 96, 96, .72); }
			#modloader-panel .modloader-config-error { display: none; grid-column: 2; color: var(--modloader-error-text); font-size: 11px; }
			#modloader-panel .modloader-config-error.active { display: block; }
			#modloader-panel .modloader-color-input { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 8px; align-items: center; min-width: 0; }
			#modloader-panel .modloader-color-input.modloader-color-with-icon { grid-template-columns: 38px 34px minmax(0, 1fr) auto; }
			#modloader-panel .modloader-color-icon { display: block; width: 36px; height: 40px; background-repeat: no-repeat; background-position: center; background-size: contain; filter: drop-shadow(0 1px 2px rgba(255,255,255,.78)); }
			#modloader-panel canvas.modloader-color-icon { background: transparent; }
			#modloader-panel .modloader-color-picker { width: 30px; height: 28px; box-sizing: border-box; border: 1px solid var(--modloader-border-strong); border-radius: 5px; padding: 0; background: transparent; color: inherit; cursor: pointer; }
			#modloader-panel .modloader-color-text { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid var(--modloader-input-border); border-radius: 5px; padding: 5px 6px; background: var(--modloader-input-bg); color: var(--modloader-input-text); outline: none; }
			#modloader-panel .modloader-color-text:focus { border-color: var(--modloader-focus-border); }
			#modloader-panel .modloader-color-reset { border: 1px solid var(--modloader-control-border); border-radius: 5px; padding: 5px 7px; background: var(--modloader-control-bg); color: var(--modloader-control-text); cursor: pointer; }
			#modloader-panel .modloader-color-reset:hover:not(:disabled) { background: var(--modloader-control-bg-hover); border-color: var(--modloader-control-border-hover); color: var(--modloader-control-text-hover); }
			#modloader-panel .modloader-color-reset:disabled { cursor: default; opacity: .45; }
			#modloader-panel .modloader-color-icon-resource, #modloader-panel .modloader-resource-color-icon { background-image: url('img/resources.png'); background-size: 360px 40px; background-position-y: 0; }
			#modloader-panel .modloader-color-palette, #modloader-panel .modloader-resource-colors { display: grid; gap: 6px; min-width: 0; }
			#modloader-panel .modloader-resource-color-tools { display: flex; align-items: center; gap: 7px; min-width: 0; margin-bottom: 2px; }
			#modloader-panel .modloader-resource-color-share-button { border: 1px solid var(--modloader-control-border); border-radius: 5px; padding: 5px 7px; background: var(--modloader-control-bg); color: var(--modloader-control-text); cursor: pointer; }
			#modloader-panel .modloader-resource-color-share-button:hover:not(:disabled) { background: var(--modloader-control-bg-hover); border-color: var(--modloader-control-border-hover); color: var(--modloader-control-text-hover); }
			#modloader-panel .modloader-resource-color-share-button:disabled { cursor: default; opacity: .45; }
			#modloader-panel .modloader-resource-color-share-status { min-width: 0; color: var(--modloader-text-subtle); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
			#modloader-panel .modloader-resource-color-share-status[data-tone="ok"] { color: var(--modloader-ok-text); }
			#modloader-panel .modloader-resource-color-share-status[data-tone="error"] { color: var(--modloader-error-text); }
			#modloader-panel .modloader-resource-color-row { display: grid; grid-template-columns: 38px 34px minmax(0, 1fr) auto; gap: 8px; align-items: center; min-width: 0; }
			#modloader-panel .modloader-resource-colors-no-icons .modloader-resource-color-row, #modloader-panel .modloader-color-palette-no-icons .modloader-resource-color-row { grid-template-columns: 34px minmax(0, 1fr) auto; }
			#modloader-panel .modloader-resource-color-icon { display: block; width: 36px; height: 40px; background-repeat: no-repeat; filter: drop-shadow(0 1px 2px rgba(255,255,255,.78)); }
			#modloader-panel .modloader-resource-colors-no-icons .modloader-resource-color-icon { display: none; }
			#modloader-panel .modloader-resource-color-picker { width: 30px; height: 28px; box-sizing: border-box; border: 1px solid var(--modloader-border-strong); border-radius: 5px; padding: 0; background: transparent; color: inherit; cursor: pointer; }
			#modloader-panel .modloader-resource-color-text { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid var(--modloader-input-border); border-radius: 5px; padding: 5px 6px; background: var(--modloader-input-bg); color: var(--modloader-input-text); outline: none; }
			#modloader-panel .modloader-resource-color-text:focus { border-color: var(--modloader-focus-border); }
			#modloader-panel .modloader-resource-color-reset { border: 1px solid var(--modloader-control-border); border-radius: 5px; padding: 5px 7px; background: var(--modloader-control-bg); color: var(--modloader-control-text); cursor: pointer; }
			#modloader-panel .modloader-resource-color-reset:hover:not(:disabled) { background: var(--modloader-control-bg-hover); border-color: var(--modloader-control-border-hover); color: var(--modloader-control-text-hover); }
			#modloader-panel .modloader-resource-color-reset:disabled { cursor: default; opacity: .45; }
			#modloader-panel .modloader-modal { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; padding: 16px; background: rgba(8,10,12,.2); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
			#modloader-panel .modloader-modal-box { width: min(420px, 100%); border: 1px solid var(--modloader-border-strong); border-radius: 8px; padding: 14px; background: var(--modloader-panel-bg); box-shadow: var(--modloader-panel-shadow); }
			#modloader-panel .modloader-modal-title { margin: 0 0 8px; font-size: 14px; color: var(--modloader-text-strong); }
			#modloader-panel .modloader-modal-message { color: var(--modloader-text); overflow-wrap: anywhere; white-space: pre-line; }
			#modloader-panel .modloader-modal-input { box-sizing: border-box; width: 100%; margin-top: 10px; border: 1px solid var(--modloader-input-border); border-radius: 6px; padding: 7px 8px; background: var(--modloader-input-bg); color: var(--modloader-input-text); outline: none; }
			#modloader-panel .modloader-modal-input:focus { border-color: var(--modloader-focus-border); }
			#modloader-panel .modloader-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
			#modloader-panel .modloader-modal-button { border: 1px solid var(--modloader-control-border); border-radius: 6px; padding: 7px 10px; background: var(--modloader-control-bg); color: var(--modloader-control-text); cursor: pointer; }
			#modloader-panel .modloader-modal-button:hover:not(:disabled) { background: var(--modloader-control-bg-hover); border-color: var(--modloader-control-border-hover); color: var(--modloader-control-text-hover); }
			#modloader-panel .modloader-modal-button:disabled { cursor: default; opacity: .45; }
			#modloader-panel .modloader-modal-button-primary { background: var(--modloader-primary-bg); color: var(--modloader-primary-text); border-color: transparent; }
			#modloader-panel .modloader-modal-button-danger { background: var(--modloader-danger-bg); color: var(--modloader-danger-text); border-color: var(--modloader-danger-border); }
			@media (max-width: 640px) {
				#modloader-panel .modloader-panel-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
				#modloader-panel .modloader-config-field { grid-template-columns: 1fr; }
				#modloader-panel .modloader-config-error { grid-column: auto; }
			}
		`
		document.head.appendChild(style)
	}

	const getModFileTools = function () {
		if (state.modFileTools !== undefined) return state.modFileTools
		try {
			if (typeof require !== 'function') {
				state.modFileTools = null
				return null
			}
			const fs = require('fs')
			const path = require('path')
			const url = require('url')
			const os = require('os')
			const childProcess = require('child_process')
			let shell = null
			let clipboard = null
			let ipcRenderer = null
			let dialog = null
			try {
				const electron = require('electron')
				shell = electron?.shell || null
				clipboard = electron?.clipboard || null
				ipcRenderer = electron?.ipcRenderer || null
				dialog = electron?.dialog || electron?.remote?.dialog || null
			} catch (error) {}
			const gameRoot = path.dirname(url.fileURLToPath(window.location.href))
			state.modFileTools = {
				fs,
				path,
				url,
				os,
				childProcess,
				shell,
				clipboard,
				ipcRenderer,
				dialog,
				gameRoot,
				modsDir: path.join(gameRoot, 'mods'),
				enabledPath: path.join(gameRoot, 'mods', 'enabled.json')
			}
		} catch (error) {
			warn('Mod file tools unavailable.', error)
			state.modFileTools = null
		}
		return state.modFileTools
	}

	const getTranslationCatalogPath = function () {
		const tools = getModFileTools()
		if (!tools) throw new Error(t('fileAccessUnavailable'))
		return tools.path.join(tools.gameRoot, 'modloader', TRANSLATION_CATALOG_FILE)
	}

	const isLanguageSupportDeclared = function (manifest) {
		const value = manifest?.languageSupport ?? manifest?.localizationSupport ?? manifest?.i18nSupport
		if (typeof value === 'boolean') return value
		if (isLocaleObject(value)) {
			for (const key of [ 'gameLanguage', 'gameLanguages', 'modMenu', 'manifest', 'translations', 'enabled' ]) {
				if (value[key] !== undefined) return value[key] !== false
			}
		}
		return null
	}

	const modSupportsGameLanguage = function (manifest) {
		const declared = isLanguageSupportDeclared(manifest)
		if (declared !== null) return declared
		return !!(getManifestTranslationRoot(manifest) || isLocaleObject(manifest?.words) || Array.isArray(manifest?.locale) || Array.isArray(manifest?.languages))
	}

	const padTranslationDatePart = function (value) {
		return String(value).padStart(2, '0')
	}

	const formatTranslationCatalogFileTimestamp = function (date) {
		const value = date instanceof Date ? date : new Date()
		return [
			value.getFullYear(),
			padTranslationDatePart(value.getMonth() + 1),
			padTranslationDatePart(value.getDate())
		].join('') + '-' + [
			padTranslationDatePart(value.getHours()),
			padTranslationDatePart(value.getMinutes()),
			padTranslationDatePart(value.getSeconds())
		].join('')
	}

	const createTranslationCatalogExportName = function (date) {
		return 'Translations-' + formatTranslationCatalogFileTimestamp(date) + '.json'
	}

	const stringifyTranslationCatalog = function (catalog) {
		return JSON.stringify(catalog, null, 2) + '\n'
	}

	const ensureTranslationCatalogMetadata = function (catalog) {
		if (!isLocaleObject(catalog)) return null
		if (!isLocaleObject(catalog[TRANSLATION_CATALOG_META_KEY])) catalog[TRANSLATION_CATALOG_META_KEY] = {}
		const meta = catalog[TRANSLATION_CATALOG_META_KEY]
		meta.kind = TRANSLATION_CATALOG_KIND
		meta.formatVersion = TRANSLATION_CATALOG_FORMAT_VERSION
		meta.generator = 'Sixty Four ModLoader'
		return meta
	}

	const markTranslationCatalogEdited = function (catalog, action, options) {
		const meta = ensureTranslationCatalogMetadata(catalog)
		if (!meta) return catalog
		const now = options?.now instanceof Date ? options.now : new Date()
		meta.editedAt = now.toISOString()
		if (action) meta.lastAction = action
		if (options?.sourceName) meta.sourceName = options.sourceName
		if (options?.exportedAt) meta.exportedAt = options.exportedAt
		return catalog
	}

	const isTaggedTranslationCatalog = function (value) {
		const meta = value?.[TRANSLATION_CATALOG_META_KEY]
		if (!isLocaleObject(meta)) return false
		return meta.kind === TRANSLATION_CATALOG_KIND || meta.type === TRANSLATION_CATALOG_KIND || meta.schema === TRANSLATION_CATALOG_KIND
	}

	const looksLikeTranslationCatalog = function (value) {
		return isLocaleObject(value) && isLocaleObject(value.languages)
	}

	const normalizeImportedTranslationCatalog = function (value, sourceName) {
		if (!isTaggedTranslationCatalog(value) && !looksLikeTranslationCatalog(value)) throw new Error(t('translationImportInvalid'))
		const catalog = normalizeTranslationCatalog(clone(value))
		markTranslationCatalogEdited(catalog, 'import', { sourceName })
		return catalog
	}

	const normalizeTranslationCatalog = function (value) {
		const catalog = isLocaleObject(value) ? value : {}
		if (!Number.isFinite(Number(catalog.version))) catalog.version = TRANSLATION_CATALOG_VERSION
		if (!isLocaleObject(catalog.languages)) catalog.languages = {}
		return catalog
	}

	const mergeMissingCatalogDefaults = function (target, defaults) {
		if (Array.isArray(defaults)) {
			if (!Array.isArray(target)) return defaults.slice()
			const out = target.slice()
			defaults.forEach(function (value, index) {
				if (out[index] === undefined) out[index] = clone(value)
				else out[index] = mergeMissingCatalogDefaults(out[index], value)
			})
			return out
		}
		if (isLocaleObject(defaults)) {
			const out = isLocaleObject(target) ? target : {}
			for (const key in defaults) out[key] = mergeMissingCatalogDefaults(out[key], defaults[key])
			return out
		}
		return target === undefined ? defaults : target
	}

	const ensureCatalogLanguage = function (catalog, language) {
		const key = String(language || '').trim()
		if (!key) return null
		if (!isLocaleObject(catalog.languages[key])) catalog.languages[key] = { modloader: {}, mods: {} }
		if (!isLocaleObject(catalog.languages[key].modloader)) catalog.languages[key].modloader = {}
		if (!isLocaleObject(catalog.languages[key].mods)) catalog.languages[key].mods = {}
		return catalog.languages[key]
	}

	const ensureCatalogMod = function (catalog, language, modId) {
		const group = ensureCatalogLanguage(catalog, language)
		if (!group) return null
		const key = String(modId || '').trim()
		if (!key) return null
		if (!isLocaleObject(group.mods[key])) group.mods[key] = {}
		return group.mods[key]
	}

	const setCatalogModText = function (catalog, language, modId, key, value) {
		if (typeof value !== 'string' || value === '') return
		const mod = ensureCatalogMod(catalog, language, modId)
		if (mod && mod[key] === undefined) mod[key] = value
	}

	const setCatalogConfigText = function (catalog, language, modId, configKey, key, value) {
		if (typeof value !== 'string' || value === '') return
		const mod = ensureCatalogMod(catalog, language, modId)
		if (!mod) return
		if (!isLocaleObject(mod.config)) mod.config = {}
		if (!isLocaleObject(mod.config[configKey])) mod.config[configKey] = {}
		if (mod.config[configKey][key] === undefined) mod.config[configKey][key] = value
	}

	const setCatalogConfigValueLabels = function (catalog, language, modId, configKey, labels) {
		if (!Array.isArray(labels) && !isLocaleObject(labels)) return
		const mod = ensureCatalogMod(catalog, language, modId)
		if (!mod) return
		if (!isLocaleObject(mod.config)) mod.config = {}
		if (!isLocaleObject(mod.config[configKey])) mod.config[configKey] = {}
		mod.config[configKey].valueLabels = mergeMissingCatalogDefaults(mod.config[configKey].valueLabels, labels)
	}

	const collectLocalizedField = function (catalog, modId, field, key, fallbackLanguage) {
		if (typeof field === 'string') setCatalogModText(catalog, fallbackLanguage || 'en', modId, key, field)
		else if (isLocaleObject(field)) for (const language in field) setCatalogModText(catalog, language, modId, key, field[language])
	}

	const collectLocalizedConfigField = function (catalog, modId, configKey, field, key, fallbackLanguage) {
		if (typeof field === 'string') setCatalogConfigText(catalog, fallbackLanguage || 'en', modId, configKey, key, field)
		else if (isLocaleObject(field)) for (const language in field) setCatalogConfigText(catalog, language, modId, configKey, key, field[language])
	}

	const collectLocalizedValueLabels = function (catalog, modId, configKey, source, fallbackLanguage) {
		if (Array.isArray(source)) {
			const byLanguage = {}
			source.forEach(function (entry, index) {
				if (typeof entry === 'string') {
					byLanguage[fallbackLanguage || 'en'] = byLanguage[fallbackLanguage || 'en'] || []
					byLanguage[fallbackLanguage || 'en'][index] = entry
				} else if (isLocaleObject(entry)) {
					for (const language in entry) {
						byLanguage[language] = byLanguage[language] || []
						byLanguage[language][index] = entry[language]
					}
				}
			})
			for (const language in byLanguage) setCatalogConfigValueLabels(catalog, language, modId, configKey, byLanguage[language])
		} else if (isLocaleObject(source)) {
			for (const valueKey in source) {
				const entry = source[valueKey]
				if (typeof entry === 'string') {
					const labels = {}
					labels[valueKey] = entry
					setCatalogConfigValueLabels(catalog, fallbackLanguage || 'en', modId, configKey, labels)
				} else if (isLocaleObject(entry)) {
					for (const language in entry) {
						const labels = {}
						labels[valueKey] = entry[language]
						setCatalogConfigValueLabels(catalog, language, modId, configKey, labels)
					}
				}
			}
		}
	}

	const addModManifestToTranslationCatalog = function (catalog, mod) {
		const manifest = mod?.manifest || {}
		const modId = String(manifest.id || mod?.id || mod?.path || '').trim()
		if (!modId || !modSupportsGameLanguage(manifest)) return
		collectLocalizedField(catalog, modId, manifest.name, 'name', 'en')
		collectLocalizedField(catalog, modId, manifest.description, 'description', 'en')
		const translations = getManifestTranslationRoot(manifest)
		if (translations) {
			for (const language in translations) {
				const group = translations[language]
				if (!isLocaleObject(group)) continue
				setCatalogModText(catalog, language, modId, 'name', group.name)
				setCatalogModText(catalog, language, modId, 'description', group.description)
				const configGroup = group.config || group.configs
				if (isLocaleObject(configGroup)) {
					for (const configKey in configGroup) {
						const configText = configGroup[configKey]
						if (!isLocaleObject(configText)) continue
						setCatalogConfigText(catalog, language, modId, configKey, 'label', configText.label)
						setCatalogConfigText(catalog, language, modId, configKey, 'description', configText.description)
						setCatalogConfigValueLabels(catalog, language, modId, configKey, configText.valueLabels || configText.sliderLabels)
					}
				}
			}
		}
		for (const item of normalizeConfigSchema(manifest.config)) {
			collectLocalizedConfigField(catalog, modId, item.key, item.label, 'label', 'en')
			collectLocalizedConfigField(catalog, modId, item.key, item.description, 'description', 'en')
			collectLocalizedConfigField(catalog, modId, item.key, item.translations?.label, 'label', '')
			collectLocalizedConfigField(catalog, modId, item.key, item.translations?.description, 'description', '')
			collectLocalizedValueLabels(catalog, modId, item.key, item.valueLabels || item.sliderLabels, 'en')
		}
	}

	const createTranslationCatalogSnapshot = function (mods) {
		const catalog = {
			version: TRANSLATION_CATALOG_VERSION,
			description: 'Edit this file to override ModLoader menu text and mod manifest/config translations. The structure is language -> modloader/mods -> text.',
			languages: {}
		}
		ensureTranslationCatalogMetadata(catalog)
		for (const language of Object.keys(PANEL_TEXT)) {
			const group = ensureCatalogLanguage(catalog, language)
			Object.assign(group.modloader, clone(PANEL_TEXT[language]))
		}
		for (const mod of mods || []) addModManifestToTranslationCatalog(catalog, mod)
		return catalog
	}

	const getCatalogModPatch = function (languageGroup, modId, modPath) {
		const mods = languageGroup?.mods
		if (!isLocaleObject(mods)) return null
		return mods[modId] || mods[modPath] || null
	}

	const catalogModPatchHasWritableFields = function (patch) {
		if (!isLocaleObject(patch)) return false
		if (typeof patch.name === 'string') return true
		if (typeof patch.description === 'string') return true
		if (isLocaleObject(patch.config)) {
			for (const configKey in patch.config) {
				const source = patch.config[configKey]
				if (!isLocaleObject(source)) continue
				if (typeof source.label === 'string') return true
				if (typeof source.description === 'string') return true
				if (Array.isArray(source.valueLabels) || isLocaleObject(source.valueLabels)) return true
			}
		}
		return false
	}

	const catalogHasModEntry = function (catalog, modKey) {
		const key = String(modKey || '')
		if (!key || !catalog || !isLocaleObject(catalog.languages)) return false
		for (const language in catalog.languages) {
			const mods = catalog.languages[language]?.mods
			if (isLocaleObject(mods) && Object.prototype.hasOwnProperty.call(mods, key)) return true
		}
		return false
	}

	const applyTranslationCatalogValueToManifest = function (catalog, manifest, modId, modPath) {
		let matched = false
		if (!catalog || !isLocaleObject(catalog.languages) || !isLocaleObject(manifest)) return manifest
		for (const language in catalog.languages) {
			const patch = getCatalogModPatch(catalog.languages[language], modId || manifest.id, modPath)
			if (!catalogModPatchHasWritableFields(patch)) continue
			matched = true
			if (!isLocaleObject(manifest.translations)) manifest.translations = {}
			if (!isLocaleObject(manifest.translations[language])) manifest.translations[language] = {}
			const target = manifest.translations[language]
			if (typeof patch.name === 'string') target.name = patch.name
			if (typeof patch.description === 'string') target.description = patch.description
			if (isLocaleObject(patch.config)) {
				if (!isLocaleObject(target.config)) target.config = {}
				for (const configKey in patch.config) {
					const source = patch.config[configKey]
					if (!isLocaleObject(source)) continue
					if (!isLocaleObject(target.config[configKey])) target.config[configKey] = {}
					if (typeof source.label === 'string') target.config[configKey].label = source.label
					if (typeof source.description === 'string') target.config[configKey].description = source.description
					if (Array.isArray(source.valueLabels) || isLocaleObject(source.valueLabels)) target.config[configKey].valueLabels = clone(source.valueLabels)
				}
			}
		}
		manifest.__modloaderTranslationCatalogMatched = matched
		return manifest
	}

	const applyTranslationCatalogToManifest = function (manifest, modId, modPath) {
		const catalog = state.translationCatalog
		const patched = applyTranslationCatalogValueToManifest(catalog, manifest, modId, modPath)
		if (patched && typeof patched === 'object') delete patched.__modloaderTranslationCatalogMatched
		return patched
	}

	const writeTranslationCatalogToModManifests = function (catalog) {
		const tools = getModFileTools()
		if (!tools) throw new Error(t('fileAccessUnavailable'))
		const result = { matched: 0, written: 0, unchanged: 0, failed: 0, failures: [] }
		if (!catalog || !isLocaleObject(catalog.languages)) return result
		let entries = []
		try {
			entries = tools.fs.readdirSync(tools.modsDir, { withFileTypes: true })
				.filter(function (entry) { return entry.isDirectory() })
				.map(function (entry) { return entry.name })
				.sort(function (a, b) { return a.localeCompare(b) })
		} catch (error) {
			result.failed++
			result.failures.push('mods: ' + error.message)
			return result
		}
		for (const name of entries) {
			const manifestPath = tools.path.join(tools.modsDir, name, 'mod.json')
			if (!tools.fs.existsSync(manifestPath)) continue
			try {
				let manifest = null
				try {
					manifest = JSON.parse(tools.fs.readFileSync(manifestPath, 'utf8'))
				} catch (error) {
					if (catalogHasModEntry(catalog, name)) throw error
					continue
				}
				const modId = manifest.id || name
				const next = applyTranslationCatalogValueToManifest(catalog, clone(manifest), modId, name)
				const matched = !!next.__modloaderTranslationCatalogMatched
				delete next.__modloaderTranslationCatalogMatched
				if (!matched) continue
				result.matched++
				if (JSON.stringify(manifest) === JSON.stringify(next)) {
					result.unchanged++
					continue
				}
				tools.fs.writeFileSync(manifestPath, JSON.stringify(next, null, 2) + '\n', 'utf8')
				result.written++
			} catch (error) {
				result.failed++
				result.failures.push(name + ': ' + error.message)
			}
		}
		return result
	}

	const confirmTranslationImportModWrite = function (panel) {
		return showPanelChoice(panel, {
			title: t('translationImportWriteModsTitle'),
			message: t('translationImportWriteModsMessage'),
			choices: [
				{ value: true, text: t('translationImportWriteModsConfirm'), primary: true, danger: true },
				{ value: false, text: t('translationImportSkipMods'), focus: true }
			]
		})
	}

	const summarizeTranslationImportModFailures = function (failures) {
		const list = Array.isArray(failures) ? failures : []
		const shown = list.slice(0, 3).join('; ')
		const remaining = list.length - 3
		return remaining > 0 ? shown + '; +' + remaining : shown
	}

	const formatTranslationImportResultMessage = function (result) {
		if (!result) return ''
		let message = t('translationImported', { source: result.source, path: result.path })
		const write = result.modWrite
		if (write) {
			message += '\n' + t('translationImportWriteModsResult', {
				written: write.written || 0,
				unchanged: write.unchanged || 0,
				failed: write.failed || 0
			})
			if ((write.matched || 0) === 0 && (write.failed || 0) === 0) message += '\n' + t('translationImportNoMatchingMods')
			if (write.failures?.length) message += '\n' + t('translationImportModFailures', { failures: summarizeTranslationImportModFailures(write.failures) })
		}
		return message
	}

	const applyTranslationCatalogToLoadedMods = function () {
		for (const mod of state.mods) {
			if (!mod?.baseManifest) continue
			mod.manifest = applyTranslationCatalogToManifest(clone(mod.baseManifest), mod.id, mod.path)
		}
	}

	const readTranslationCatalogFromDisk = function (options) {
		const config = options || {}
		const tools = getModFileTools()
		if (!tools) return null
		const catalogPath = getTranslationCatalogPath()
		try {
			if (!tools.fs.existsSync(catalogPath)) {
				if (state.translationCatalog) {
					state.translationCatalog = null
					state.translationCatalogMtimeMs = -1
					applyTranslationCatalogToLoadedMods()
				}
				return null
			}
			const stat = tools.fs.statSync(catalogPath)
			if (!config.force && state.translationCatalog && state.translationCatalogMtimeMs === stat.mtimeMs) return state.translationCatalog
			const catalog = normalizeTranslationCatalog(JSON.parse(tools.fs.readFileSync(catalogPath, 'utf8')))
			state.translationCatalog = catalog
			state.translationCatalogMtimeMs = stat.mtimeMs
			state.translationCatalogReadFailed = false
			applyTranslationCatalogToLoadedMods()
			return catalog
		} catch (error) {
			if (!config.silent) throw error
			if (!state.translationCatalogReadFailed) addIssue('warn', 'translation-catalog-read-failed', 'failed to read modloader/translations.json', error.message)
			state.translationCatalogReadFailed = true
			return state.translationCatalog
		}
	}

	const ensureTranslationCatalogWatcher = function () {
		const tools = getModFileTools()
		if (!tools || state.translationCatalogWatcher) return
		let catalogPath = ''
		try {
			catalogPath = getTranslationCatalogPath()
			if (!tools.fs.existsSync(catalogPath)) return
			state.translationCatalogWatcher = tools.fs.watch(catalogPath, { persistent: false }, function () {
				if (state.translationCatalogWatchTimer) clearTimeout(state.translationCatalogWatchTimer)
				state.translationCatalogWatchTimer = setTimeout(function () {
					state.translationCatalogWatchTimer = null
					readTranslationCatalogFromDisk({ force: true, silent: true })
					requestAnimationFrame(refreshOpenPanel)
				}, 160)
			})
		} catch (error) {
			warn('Failed to watch translation catalog.', error)
		}
	}

	const syncTranslationCatalogFile = function (mods) {
		const tools = getModFileTools()
		if (!tools) throw new Error(t('fileAccessUnavailable'))
		const catalogPath = getTranslationCatalogPath()
		tools.fs.mkdirSync(tools.path.dirname(catalogPath), { recursive: true })
		let current = null
		if (tools.fs.existsSync(catalogPath)) current = normalizeTranslationCatalog(JSON.parse(tools.fs.readFileSync(catalogPath, 'utf8')))
		const snapshot = createTranslationCatalogSnapshot(mods || [])
		const merged = mergeMissingCatalogDefaults(current || {}, snapshot)
		ensureTranslationCatalogMetadata(merged)
		const before = current ? stringifyTranslationCatalog(current) : ''
		let after = stringifyTranslationCatalog(merged)
		if (before !== after) {
			markTranslationCatalogEdited(merged, 'sync')
			after = stringifyTranslationCatalog(merged)
		}
		if (before !== after) tools.fs.writeFileSync(catalogPath, after, 'utf8')
		state.translationCatalog = merged
		try { state.translationCatalogMtimeMs = tools.fs.statSync(catalogPath).mtimeMs } catch (error) { state.translationCatalogMtimeMs = -1 }
		state.translationCatalogReadFailed = false
		applyTranslationCatalogToLoadedMods()
		ensureTranslationCatalogWatcher()
		return { path: catalogPath, created: !current, updated: before !== after }
	}

	const openTranslationCatalogFile = async function (catalogPath) {
		const tools = getModFileTools()
		if (!tools) throw new Error(t('fileAccessUnavailable'))
		if (tools.shell?.openPath) {
			const result = await tools.shell.openPath(catalogPath)
			if (result) throw new Error(result)
			return
		}
		tools.childProcess.spawn('explorer.exe', [catalogPath], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
	}

	const showTranslationSaveDialog = async function (options) {
		const tools = getModFileTools()
		if (!tools) throw new Error(t('fileAccessUnavailable'))
		if (tools.ipcRenderer?.invoke) return tools.ipcRenderer.invoke('modloader:dialog:save', options || {})
		if (tools.dialog?.showSaveDialog) return tools.dialog.showSaveDialog(options || {})
		throw new Error(t('translationDialogUnavailable'))
	}

	const showTranslationOpenDialog = async function (options) {
		const tools = getModFileTools()
		if (!tools) throw new Error(t('fileAccessUnavailable'))
		if (tools.ipcRenderer?.invoke) return tools.ipcRenderer.invoke('modloader:dialog:open', options || {})
		if (tools.dialog?.showOpenDialog) return tools.dialog.showOpenDialog(options || {})
		throw new Error(t('translationDialogUnavailable'))
	}

	const getDefaultTranslationExportPath = function () {
		const tools = getModFileTools()
		if (!tools) throw new Error(t('fileAccessUnavailable'))
		const documents = tools.path.join(tools.os.homedir(), 'Documents')
		const base = tools.fs.existsSync(documents) ? documents : tools.gameRoot
		return tools.path.join(base, createTranslationCatalogExportName(new Date()))
	}

	const getTranslationCatalogDisplayTime = function (value) {
		if (!value) return ''
		try {
			const date = value instanceof Date ? value : new Date(value)
			if (!Number.isFinite(date.getTime())) return String(value)
			return date.toLocaleString()
		} catch (error) {
			return String(value)
		}
	}

	const getTranslationFileEditTime = function (filePath) {
		const tools = getModFileTools()
		if (!tools || !filePath) return ''
		try {
			const data = JSON.parse(tools.fs.readFileSync(filePath, 'utf8'))
			const meta = data?.[TRANSLATION_CATALOG_META_KEY]
			const time = meta?.editedAt || meta?.exportedAt || meta?.importedAt
			if (time) return getTranslationCatalogDisplayTime(time)
		} catch (error) {}
		try {
			return getTranslationCatalogDisplayTime(tools.fs.statSync(filePath).mtime)
		} catch (error) {
			return ''
		}
	}

	const getCurrentTranslationCatalogForExport = function () {
		const tools = getModFileTools()
		if (!tools) throw new Error(t('fileAccessUnavailable'))
		let catalog = readTranslationCatalogFromDisk({ force: true, silent: true })
		if (!catalog) {
			const availableMods = readAvailableMods().mods
			syncTranslationCatalogFile(availableMods)
			catalog = state.translationCatalog
		}
		catalog = normalizeTranslationCatalog(clone(catalog || {}))
		const meta = ensureTranslationCatalogMetadata(catalog)
		const now = new Date()
		if (!meta.editedAt) {
			try { meta.editedAt = tools.fs.statSync(getTranslationCatalogPath()).mtime.toISOString() } catch (error) { meta.editedAt = now.toISOString() }
		}
		meta.exportedAt = now.toISOString()
		meta.lastAction = 'export'
		return catalog
	}

	const exportTranslationCatalogFile = async function (panel) {
		const tools = getModFileTools()
		if (!tools) throw new Error(t('fileAccessUnavailable'))
		const catalog = getCurrentTranslationCatalogForExport()
		const result = await showTranslationSaveDialog({
			title: t('translationExportTitle'),
			defaultPath: getDefaultTranslationExportPath(),
			filters: [
				{ name: 'Translations JSON', extensions: [ 'json' ] },
				{ name: 'All Files', extensions: [ '*' ] }
			]
		})
		const targetPath = result?.filePath || ''
		if (result?.canceled || !targetPath) return null
		if (tools.fs.existsSync(targetPath)) {
			const editedAt = getTranslationFileEditTime(targetPath) || '-'
			const confirmed = await showPanelConfirm(panel, {
				title: t('translationExportOverwriteTitle'),
				message: t('translationExportOverwriteMessage', { editedAt, path: targetPath }),
				confirmText: t('translationOverwriteConfirm'),
				danger: true
			})
			if (!confirmed) return null
		}
		tools.fs.writeFileSync(targetPath, stringifyTranslationCatalog(catalog), 'utf8')
		return { path: targetPath }
	}

	const importTranslationCatalogFile = async function (panel) {
		const tools = getModFileTools()
		if (!tools) throw new Error(t('fileAccessUnavailable'))
		const result = await showTranslationOpenDialog({
			title: t('translationImportTitle'),
			filters: [
				{ name: 'Translations JSON', extensions: [ 'json' ] },
				{ name: 'All Files', extensions: [ '*' ] }
			],
			properties: [ 'openFile' ]
		})
		const sourcePath = result?.filePaths?.[0] || ''
		if (result?.canceled || !sourcePath) return null
		const source = JSON.parse(tools.fs.readFileSync(sourcePath, 'utf8'))
		const catalog = normalizeImportedTranslationCatalog(source, tools.path.basename(sourcePath))
		const writeMods = panel ? await confirmTranslationImportModWrite(panel) : false
		const catalogPath = getTranslationCatalogPath()
		tools.fs.mkdirSync(tools.path.dirname(catalogPath), { recursive: true })
		tools.fs.writeFileSync(catalogPath, stringifyTranslationCatalog(catalog), 'utf8')
		const modWrite = writeMods ? writeTranslationCatalogToModManifests(catalog) : null
		state.translationCatalog = catalog
		try { state.translationCatalogMtimeMs = tools.fs.statSync(catalogPath).mtimeMs } catch (error) { state.translationCatalogMtimeMs = -1 }
		state.translationCatalogReadFailed = false
		applyTranslationCatalogToLoadedMods()
		ensureTranslationCatalogWatcher()
		return { path: catalogPath, source: sourcePath, modWrite }
	}

	const getEnabledPathSet = function () {
		const selected = new Set()
		for (const entry of state.enabledEntries) selected.add(entry.path)
		return selected
	}

	const readAvailableMods = function () {
		const tools = getModFileTools()
		const enabled = getEnabledPathSet()
		const mods = []
		const byPath = {}
		let errorMessage = ''

		if (tools) {
			try {
				const entries = tools.fs.readdirSync(tools.modsDir, { withFileTypes: true })
					.filter(function (entry) { return entry.isDirectory() })
					.map(function (entry) { return entry.name })
					.sort(function (a, b) { return a.localeCompare(b) })

				for (const name of entries) {
					const manifestPath = tools.path.join(tools.modsDir, name, 'mod.json')
					if (!tools.fs.existsSync(manifestPath)) continue
					let manifest = {}
					let loadError = ''
					try {
						manifest = JSON.parse(tools.fs.readFileSync(manifestPath, 'utf8'))
					} catch (error) {
						loadError = error.message
					}
					const modId = manifest.id || name
					manifest = applyTranslationCatalogToManifest(manifest, modId, name)
					const mod = {
						path: name,
						id: modId,
						manifest,
						enabled: enabled.has(name),
						loadError
					}
					mods.push(mod)
					byPath[name] = mod
				}
			} catch (error) {
				errorMessage = error.message
			}
		} else {
			for (const mod of state.mods) {
				const item = Object.assign({}, mod, { enabled: true, loadError: '' })
				mods.push(item)
				byPath[item.path] = item
			}
			errorMessage = t('fileAccessLoadedOnly')
		}

		for (const entry of state.enabledEntries) {
			if (byPath[entry.path]) continue
			mods.push({
				path: entry.path,
				id: entry.id || entry.path,
				manifest: { id: entry.id || entry.path },
				enabled: true,
				loadError: 'Enabled entry is missing mods/' + entry.path + '/mod.json.'
			})
		}

		return { mods, errorMessage }
	}

	const getModReloadPolicy = function (manifest) {
		if (manifest.reloadPolicy) return String(manifest.reloadPolicy)
		if (manifest.hotReload === true) return 'hot'
		return 'reload'
	}

	const getModReloadLabel = function (manifest) {
		const policy = getModReloadPolicy(manifest)
		if (policy === 'hot') return t('reloadHot')
		if (policy === 'restart') return t('reloadRestart')
		return t('reloadRequired')
	}

	const getConfigReloadPolicy = function (manifest, item) {
		if (item?.reloadPolicy) return String(item.reloadPolicy)
		if (item?.reloadOnChange === true || item?.requiresReload === true) return 'reload'
		if (manifest?.configReloadPolicy) return String(manifest.configReloadPolicy)
		if (manifest?.reloadOnConfigChange === true) return 'reload'
		return 'hot'
	}

	const configChangeRequiresReload = function (model) {
		if (!model || sameConfigValue(model.value, model.initial)) return false
		const policy = getConfigReloadPolicy(model.mod?.manifest || {}, model.item || {})
		return policy !== 'hot'
	}

	const hasReloadingConfigChanges = function (models, selected) {
		for (const model of models) {
			if (!selected.has(model.mod.path)) continue
			if (model.invalid) continue
			if (configChangeRequiresReload(model)) return true
		}
		return false
	}

	const getOrderedSelectedPaths = function (mods, selected, useModOrder) {
		const out = []
		const seen = new Set()
		const available = new Set(mods.map(function (mod) { return mod.path }))
		if (!useModOrder) {
			for (const entry of state.enabledEntries) {
				if (!selected.has(entry.path) || seen.has(entry.path)) continue
				out.push(entry.path)
				seen.add(entry.path)
			}
		}
		for (const mod of mods) {
			if (!available.has(mod.path) || !selected.has(mod.path) || seen.has(mod.path)) continue
			out.push(mod.path)
			seen.add(mod.path)
		}
		return out
	}

	const sameStringList = function (a, b) {
		if (a.length !== b.length) return false
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false
		}
		return true
	}

	const writeEnabledConfig = function (paths) {
		const tools = getModFileTools()
		if (!tools) throw new Error(t('fileAccessUnavailable'))
		const payload = JSON.stringify({ mods: paths }, null, 2) + '\n'
		tools.fs.writeFileSync(tools.enabledPath, payload, 'utf8')
	}

	const UNIQUE_CODE_KEYS = [ 'uniqueId', 'modUniqueId', 'uniqueCode', 'modCode', 'uid' ]

	const getModUniqueCode = function (manifest) {
		for (const key of UNIQUE_CODE_KEYS) {
			const value = manifest?.[key]
			if (value === undefined || value === null) continue
			const text = String(value).trim()
			if (text) return text
		}
		return ''
	}

	const setModUniqueCode = function (manifest, value) {
		const key = UNIQUE_CODE_KEYS.find(function (name) { return manifest && manifest[name] !== undefined }) || 'uniqueId'
		manifest[key] = String(value ?? '').trim()
		return manifest
	}

	const getModIdentity = function (manifest) {
		return {
			name: String(manifest?.name || manifest?.id || '').trim(),
			version: String(manifest?.version || '').trim()
		}
	}

	const normalizeModIdentity = function (value) {
		if (!value) return null
		if (Array.isArray(value)) return value.map(normalizeModIdentity).filter(Boolean)
		if (isObject(value)) {
			const identity = {
				name: String(value.name || value.id || value.title || '').trim(),
				version: String(value.version || value.modVersion || value.versionName || '').trim()
			}
			return identity.name && identity.version ? identity : null
		}
		return null
	}

	const getPreviousVersionIdentities = function (manifest) {
		const out = []
		const seen = new Set()
		const add = function (value) {
			const normalized = normalizeModIdentity(value)
			const items = Array.isArray(normalized) ? normalized : [ normalized ]
			for (const item of items) {
				if (!item) continue
				const key = item.name + '\u0000' + item.version
				if (seen.has(key)) continue
				seen.add(key)
				out.push(item)
			}
		}
		add(manifest?.previousVersion)
		add(manifest?.previousVersions)
		add(manifest?.previousIdentity)
		add(manifest?.previousIdentities)
		add(manifest?.lastVersion)
		add(manifest?.lastVersions)
		add(manifest?.lastIdentity)
		add(manifest?.lastIdentities)
		if (manifest?.previousName || manifest?.lastVersionName) {
			add({
				name: manifest.previousName || manifest.lastVersionName,
				version: manifest.previousVersionNumber || manifest.lastVersionVersion || manifest.previousModVersion || manifest.lastModVersion || (typeof manifest.previousVersion === 'string' ? manifest.previousVersion : '')
			})
		}
		return out
	}

	const sameModIdentity = function (a, b) {
		return !!a && !!b && !!a.name && !!a.version && a.name === b.name && a.version === b.version
	}

	const findImportIdentityMatch = function (importManifest, folderName, installedMods) {
		const candidates = installedMods.filter(function (mod) { return mod && !mod.loadError && mod.path !== folderName })
			.sort(function (a, b) { return (b.enabled === true) - (a.enabled === true) || a.path.localeCompare(b.path) })
		const uniqueCode = getModUniqueCode(importManifest)
		if (uniqueCode) {
			for (const mod of candidates) {
				if (getModUniqueCode(mod.manifest) === uniqueCode) return { type: 'unique', mod, uniqueCode }
			}
		}
		const previousIdentities = getPreviousVersionIdentities(importManifest)
		for (const previous of previousIdentities) {
			for (const mod of candidates) {
				if (getModUniqueCode(mod.manifest)) continue
				if (sameModIdentity(previous, getModIdentity(mod.manifest))) return { type: 'previous', mod, previous }
			}
		}
		return null
	}

	const readManifestFromDirectory = function (directory) {
		const tools = getModFileTools()
		try {
			return JSON.parse(tools.fs.readFileSync(tools.path.join(directory, 'mod.json'), 'utf8'))
		} catch (error) {
			throw new Error(t('manifestReadFailed', { value: error.message }))
		}
	}

	const writeManifestToDirectory = function (directory, manifest) {
		const tools = getModFileTools()
		const manifestPath = tools.path.join(directory, 'mod.json')
		tools.fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
	}

	const replaceEnabledEntryPath = function (oldPath, newPath) {
		if (!oldPath || !newPath || oldPath === newPath) return false
		let changed = false
		const seen = new Set()
		const next = []
		for (const entry of state.enabledEntries) {
			const updated = Object.assign({}, entry)
			if (updated.path === oldPath) {
				updated.path = newPath
				changed = true
			}
			if (seen.has(updated.path)) continue
			seen.add(updated.path)
			next.push(updated)
		}
		if (!changed) return false
		state.enabledEntries = next
		writeEnabledConfig(next.map(function (entry) { return entry.path }))
		return true
	}

	const getConfigType = function (item) {
		return String(item.type || inferConfigType(item.default) || 'string').toLowerCase()
	}
	const isColorPaletteConfigType = function (type) {
		return type === 'colorpalette' || type === 'color-palette'
	}

	const isColorConfigType = function (type) {
		return type === 'color' || type === 'colour' || type === 'hexcolor' || type === 'hex-color'
	}

	const isNumberConfigType = function (type) {
		return type === 'number' || type === 'float' || type === 'integer' || type === 'int'
	}

	const isSliderConfigType = function (type) {
		return type === 'slider' || type === 'range'
	}

	const getConfigControl = function (item) {
		return String(item.control || item.input || item.ui || item.widget || item.display || '').toLowerCase()
	}

	const isColorPaletteConfigItem = function (item, type) {
		const control = getConfigControl(item)
		return isColorPaletteConfigType(type) || item.colorPalette === true || control === 'colorpalette' || control === 'color-palette'
	}

	const isSliderConfigItem = function (item, type) {
		const control = getConfigControl(item)
		return isSliderConfigType(type) || item.slider === true || control === 'slider' || control === 'range'
	}

	const getNumberConfigType = function (item, type) {
		const valueType = String(item.valueType || item.numberType || item.numericType || '').toLowerCase()
		if (isNumberConfigType(valueType)) return valueType
		if (isNumberConfigType(type)) return type
		return item.integer === true ? 'integer' : 'number'
	}

	const getConfigNumberStep = function (item, type) {
		if (item.step !== undefined) return String(item.step)
		return getNumberConfigType(item, type) === 'integer' || getNumberConfigType(item, type) === 'int' ? '1' : 'any'
	}

	const getFiniteConfigNumber = function (value) {
		if (value === undefined || value === null || value === '') return null
		const number = Number(value)
		return Number.isFinite(number) ? number : null
	}

	const readNumberConfigValue = function (item, rawValue, type, options) {
		const text = String(rawValue).trim()
		if (text === '') throw new Error('Enter a number.')
		const value = Number(text)
		if (!Number.isFinite(value)) throw new Error('Enter a valid number.')
		const numberType = getNumberConfigType(item, type)
		if ((numberType === 'integer' || numberType === 'int') && Math.floor(value) !== value) throw new Error('Enter a whole number.')
		if (options?.enforceRange) {
			const min = getFiniteConfigNumber(options.min)
			const max = getFiniteConfigNumber(options.max)
			if (min !== null && value < min) throw new Error('Enter a number greater than or equal to ' + min + '.')
			if (max !== null && value > max) throw new Error('Enter a number less than or equal to ' + max + '.')
		}
		return value
	}

	const cloneConfigValue = function (value) {
		return (isObject(value) || Array.isArray(value)) ? clone(value) : value
	}

	const sameConfigValue = function (a, b) {
		return JSON.stringify(a) === JSON.stringify(b)
	}
	const dispatchConfigPreview = function (model) {
		if (!model || model.invalid) return
		try {
			window.dispatchEvent(new CustomEvent('modloader:config-preview', {
				detail: {
					modId: model.mod?.id || '',
					path: model.mod?.path || '',
					key: model.item?.key || '',
					value: cloneConfigValue(model.value)
				}
			}))
		} catch (error) {}
	}

	const readConfigForPanel = function (mod) {
		const schema = normalizeConfigSchema(mod.manifest.config).map(function (item) {
			item = clone(item)
			const localizedValueLabels = getLocalizedConfigValueLabels(mod.manifest, item)
			if (localizedValueLabels) item.valueLabels = clone(localizedValueLabels)
			item.type = getConfigType(item)
			return item
		})
		const values = {}
		for (const item of schema) {
			values[item.key] = parseStoredConfig(localStorage.getItem(storageKey(mod.id, item.key)), item.default)
		}
		return { schema, values }
	}

	const getConfigSectionId = function (item) {
		const raw = item?.section ?? item?.group ?? item?.feature ?? item?.configGroup ?? item?.category
		if (raw === undefined || raw === null || raw === false) return ''
		if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
		if (isObject(raw)) return String(raw.id || raw.key || raw.name || raw.en || raw.sch || raw.modsch || '')
		return ''
	}

	const getConfigSectionLabel = function (mod, item) {
		const raw = item?.sectionLabel ?? item?.groupLabel ?? item?.featureLabel ?? item?.configGroupLabel ?? item?.categoryLabel
		const localized = pickLocalizedText(raw, getLocaleCandidates())
		if (localized) return localized
		if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
		if (isObject(raw)) return String(raw.name || raw.id || raw.key || '')
		return ''
	}

	const makeUniqueConfigSectionKey = function (baseKey, usedKeys) {
		const base = String(baseKey || 'section')
		const count = (usedKeys[base] || 0) + 1
		usedKeys[base] = count
		return count === 1 ? base : base + '#' + count
	}

	const applyPanelConfigSectionOrder = function (mod, groups) {
		const key = getPanelConfigSectionOrderKey(mod)
		const stored = state.panelConfigSectionOrder[key] || []
		if (!stored.length) return groups
		const order = new Map()
		stored.forEach(function (sectionKey, index) {
			if (!order.has(sectionKey)) order.set(sectionKey, index)
		})
		return groups.slice().sort(function (a, b) {
			const ai = order.has(a.key) ? order.get(a.key) : Number.MAX_SAFE_INTEGER
			const bi = order.has(b.key) ? order.get(b.key) : Number.MAX_SAFE_INTEGER
			return (ai - bi) || (a.originalIndex - b.originalIndex)
		})
	}

	const buildConfigSectionGroups = function (mod, schema) {
		const groups = []
		const usedKeys = {}
		let current = null
		for (let index = 0; index < schema.length; index++) {
			const item = schema[index]
			const sectionId = getConfigSectionId(item)
			if (!current || item.dividerBefore || item.separatorBefore || current.sectionId !== sectionId) {
				const baseKey = sectionId ? 'section:' + sectionId : 'default:' + String(item.key || index)
				current = {
					key: makeUniqueConfigSectionKey(baseKey, usedKeys),
					sectionId,
					label: getConfigSectionLabel(mod, item),
					items: [],
					originalIndex: groups.length
				}
				groups.push(current)
			}
			current.items.push(item)
		}
		return applyPanelConfigSectionOrder(mod, groups)
	}

	const syncPanelConfigSectionOrderForMod = function (mod, sectionModels) {
		const key = getPanelConfigSectionOrderKey(mod)
		if (!key) return
		const order = sectionModels.map(function (section) { return section.key }).filter(Boolean)
		if (order.length > 1) state.panelConfigSectionOrder[key] = order
		else delete state.panelConfigSectionOrder[key]
	}
	const formatConfigInputValue = function (value, type) {
		if (value === undefined || value === null) {
			if (type === 'array') return '[]'
			if (type === 'object') return '{}'
			return ''
		}
		if (type === 'array' || type === 'object') return JSON.stringify(value, null, 2)
		return String(value)
	}

	const shouldShowColorPaletteSharing = function (item) {
		const value = item.importExport ?? item.exportImport ?? item.share ?? item.sharing ?? item.colorSharing
		if (value && typeof value === 'object') return value.enabled === true || value.show === true
		return value === true || value === 'true' || value === 1 || value === '1'
	}

	const shouldShowColorPaletteIcons = function (item) {
		const value = item.showIcons ?? item.showIcon ?? item.icons ?? item.resourceIcons
		return value !== false
	}

	const getColorIconModel = function (source, fallbackResourceIndex) {
		if (!source || source.icon === false || source.showIcon === false) return null
		const raw = source.icon ?? source.leadingIcon ?? source.resourceIcon ?? source.resourceIndex ?? source.resource
		if (raw === undefined || raw === null || raw === true) return null
		const icon = isObject(raw) ? raw : { type: 'resource', index: raw }
		const type = String(icon.type || icon.kind || '').trim().toLowerCase()
		if (type === 'procedural' || type === 'canvas' || type === 'dynamic') {
			return {
				type: 'procedural',
				renderer: String(icon.renderer || icon.name || icon.effect || '').trim(),
				fill: icon.fill ?? icon.color ?? icon.value ?? 'currentColor',
				stroke: icon.stroke,
				background: icon.background,
				width: getFiniteConfigNumber(icon.width),
				height: getFiniteConfigNumber(icon.height),
				title: pickLocalizedText(icon.title || source.name || source.label, getLocaleCandidates())
			}
		}
		const resourceSource = icon.index ?? icon.resourceIndex ?? icon.resourceId ?? icon.resource ?? icon.id ?? source.resourceIcon ?? fallbackResourceIndex
		if (type === 'resource' || type === 'resources' || resourceSource !== undefined) {
			const index = getFiniteConfigNumber(resourceSource)
			if (index === null) return null
			return {
				type: 'resource',
				index: Math.max(0, Math.floor(index)),
				title: pickLocalizedText(icon.title || source.name || source.label, getLocaleCandidates())
			}
		}
		const image = icon.url || icon.src || icon.image
		if (image) {
			return {
				type: 'image',
				url: String(image),
				title: pickLocalizedText(icon.title || source.name || source.label, getLocaleCandidates())
			}
		}
		return null
	}

	const normalizeProceduralIconRendererName = function (value) {
		return String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
	}

	const registerProceduralColorIconRenderer = function (modId, name, renderer) {
		const key = normalizeProceduralIconRendererName(name)
		if (!key || typeof renderer !== 'function') {
			warn('Ignoring procedural UI icon renderer registration with an invalid name or renderer.', { modId, name })
			return function () {}
		}
		const registration = {
			modId: modId || 'anonymous',
			name: String(name),
			renderer
		}
		state.uiProceduralIconRenderers[key] = registration
		return function () {
			if (state.uiProceduralIconRenderers[key] === registration) delete state.uiProceduralIconRenderers[key]
		}
	}

	const unregisterProceduralColorIconRenderer = function (modId, name) {
		const key = normalizeProceduralIconRendererName(name)
		const registration = key ? state.uiProceduralIconRenderers[key] : null
		if (!registration || registration.modId !== (modId || 'anonymous')) return false
		delete state.uiProceduralIconRenderers[key]
		return true
	}

	const getProceduralColorIconRenderer = function (name) {
		const key = normalizeProceduralIconRendererName(name)
		return key ? (state.uiProceduralIconRenderers[key] || null) : null
	}

	const createUiIconsApi = function (modId) {
		return {
			registerProcedural(name, renderer) { return registerProceduralColorIconRenderer(modId, name, renderer) },
			registerCanvas(name, renderer) { return registerProceduralColorIconRenderer(modId, name, renderer) },
			register(name, renderer) { return registerProceduralColorIconRenderer(modId, name, renderer) },
			unregisterProcedural(name) { return unregisterProceduralColorIconRenderer(modId, name) },
			unregisterCanvas(name) { return unregisterProceduralColorIconRenderer(modId, name) },
			unregister(name) { return unregisterProceduralColorIconRenderer(modId, name) },
			hasProcedural(name) { return !!getProceduralColorIconRenderer(name) }
		}
	}

	const getProceduralColorIconColor = function (value, options, fallback) {
		const text = String(value ?? '').trim()
		if (!text || text.toLowerCase() === 'currentcolor') {
			const current = typeof options?.getColor === 'function' ? options.getColor() : ''
			return normalizePanelHexColor(current) || normalizePanelHexColor(fallback) || '#FFFFFF'
		}
		return normalizePanelHexColor(text) || normalizePanelHexColor(fallback) || '#FFFFFF'
	}

	const resizeProceduralColorIconCanvas = function (canvas, width, height) {
		const dpr = Math.max(1, Math.min(3, typeof window !== 'undefined' ? (Number(window.devicePixelRatio) || 1) : 1))
		const pixelWidth = Math.max(1, Math.round(width * dpr))
		const pixelHeight = Math.max(1, Math.round(height * dpr))
		if (canvas.width !== pixelWidth) canvas.width = pixelWidth
		if (canvas.height !== pixelHeight) canvas.height = pixelHeight
		canvas.style.width = width + 'px'
		canvas.style.height = height + 'px'
		const ctx = canvas.getContext('2d')
		if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		return ctx
	}

	const renderProceduralColorIcon = function (canvas, iconModel, options) {
		const width = Math.max(8, iconModel.width || 36)
		const height = Math.max(8, iconModel.height || 40)
		const ctx = resizeProceduralColorIconCanvas(canvas, width, height)
		if (!ctx) return
		ctx.clearRect(0, 0, width, height)
		const registration = getProceduralColorIconRenderer(iconModel.renderer)
		if (!registration || typeof registration.renderer !== 'function') return
		const now = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
		const timeMs = Number(options?.time) || now
		const fill = getProceduralColorIconColor(iconModel.fill, options, '#FFFFFF')
		const stroke = getProceduralColorIconColor(iconModel.stroke, options, fill)
		const background = normalizePanelHexColor(iconModel.background)
		try {
			registration.renderer({
				canvas,
				ctx,
				width,
				height,
				time: timeMs / 1000,
				timeMs,
				color: fill,
				fill,
				stroke,
				background,
				icon: iconModel,
				item: options?.item || null,
				entry: options?.entry || null,
				key: options?.key ?? options?.entry?.id ?? options?.item?.key,
				value: typeof options?.getColor === 'function' ? options.getColor() : undefined
			})
			delete canvas.dataset.modloaderProceduralIconError
		} catch (error) {
			if (canvas.dataset.modloaderProceduralIconError !== registration.name) {
				canvas.dataset.modloaderProceduralIconError = registration.name
				warn(`Procedural UI icon renderer ${registration.name} from ${registration.modId} failed.`, error)
			}
		}
	}

	const startProceduralColorIconAnimation = function (canvas, iconModel, options) {
		let frame = 0
		let stopped = false
		let hasConnected = false
		const stop = function () {
			stopped = true
			if (frame && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame)
			frame = 0
		}
		const tick = function () {
			if (stopped) return
			if (canvas.isConnected) hasConnected = true
			else if (hasConnected) {
				stop()
				return
			}
			const now = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
			renderProceduralColorIcon(canvas, iconModel, Object.assign({}, options, { time: now }))
			if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') frame = window.requestAnimationFrame(tick)
		}
		tick()
		return stop
	}

	const createColorIconElement = function (iconModel, className, options) {
		if (iconModel?.type === 'procedural') {
			const canvas = element('canvas', className || 'modloader-color-icon')
			canvas.classList.add('modloader-color-icon-procedural')
			canvas.setAttribute('aria-hidden', 'true')
			if (iconModel.title) canvas.title = iconModel.title
			const stop = startProceduralColorIconAnimation(canvas, iconModel, options || {})
			if (typeof options?.addCleanup === 'function') options.addCleanup(stop)
			else canvas.__modloaderCleanup = stop
			return canvas
		}
		const icon = element('span', className || 'modloader-color-icon')
		if (!iconModel) {
			icon.style.visibility = 'hidden'
			return icon
		}
		if (iconModel.title) icon.title = iconModel.title
		if (iconModel.type === 'resource') {
			icon.classList.add('modloader-color-icon-resource')
			icon.style.backgroundPosition = '-' + (iconModel.index * 36) + 'px 0'
		} else if (iconModel.type === 'image') {
			icon.style.backgroundImage = 'url("' + String(iconModel.url).replace(/"/g, '\\"') + '")'
			icon.style.backgroundPosition = 'center'
			icon.style.backgroundSize = 'contain'
		}
		return icon
	}

	const getColorPaletteShareType = function (item) {
		return String(item.shareType || item.exportType || item.clipboardType || (item.key === 'resourceGlowColors' ? 'CattailResourceGlowColors' : 'ModLoaderColorPalette'))
	}

	const readPanelClipboardText = async function () {
		try {
			if (window.navigator?.clipboard?.readText) {
				const text = await window.navigator.clipboard.readText()
				if (text !== undefined && text !== null) return String(text)
			}
		} catch (error) {}
		const clipboard = getModFileTools()?.clipboard
		if (clipboard?.readText) return String(clipboard.readText() || '')
		throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardUnavailable))
	}

	const writePanelClipboardText = async function (value) {
		try {
			if (window.navigator?.clipboard?.writeText) {
				await window.navigator.clipboard.writeText(value)
				return
			}
		} catch (error) {}
		const clipboard = getModFileTools()?.clipboard
		if (clipboard?.writeText) {
			clipboard.writeText(value)
			return
		}
		throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardUnavailable))
	}

	const setResourceColorShareStatus = function (status, message, tone) {
		if (!status) return
		status.textContent = message || ''
		status.dataset.tone = tone || ''
		if (status.__modloaderTimer) clearTimeout(status.__modloaderTimer)
		status.__modloaderTimer = null
		if (!message) return
		status.__modloaderTimer = setTimeout(function () {
			status.textContent = ''
			status.dataset.tone = ''
			status.__modloaderTimer = null
		}, 2400)
	}

	const readColorPaletteFromInput = function (root, options) {
		const includeDefaults = !!options?.includeDefaults
		const out = {}
		const rows = root.querySelectorAll('.modloader-resource-color-row')
		for (const row of rows) {
			const textInput = row.querySelector('.modloader-resource-color-text')
			const color = normalizePanelHexColor(textInput?.value)
			if (!color) throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorInvalidHex))
			if (includeDefaults || color !== row.dataset.defaultColor) out[row.dataset.resourceId] = color
		}
		return out
	}

	const createColorPaletteShareText = function (item, root) {
		return JSON.stringify({
			type: getColorPaletteShareType(item),
			version: 1,
			key: item.key || '',
			colors: readColorPaletteFromInput(root, { includeDefaults: item.exportDefaults !== false })
		}, null, 2)
	}
	const normalizeColorPaletteImportKey = function (key) {
		const text = String(key ?? '').trim()
		if (!text) return ''
		const resourceMatch = text.match(/^r(\d+)$/i)
		return resourceMatch ? String(Number(resourceMatch[1])) : text
	}

	const addColorPaletteImportValue = function (out, key, value) {
		const id = normalizeColorPaletteImportKey(key)
		const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value.color ?? value.value ?? value.hex) : value
		const color = normalizePanelHexColor(raw)
		if (!id && color) return
		if (id && !color) throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardInvalid))
		if (id && color) out[id] = color
	}

	const normalizeColorPaletteImportData = function (data) {
		const source = data && (data.colors ?? data.colorPalette ?? data.palette ?? data.resourceGlowColors ?? data)
		const out = {}
		if (Array.isArray(source)) {
			source.forEach(function (value, index) {
				const key = value && typeof value === 'object' && !Array.isArray(value) ? (value.id ?? value.key ?? value.resource ?? index) : index
				addColorPaletteImportValue(out, key, value)
			})
		} else if (source && typeof source === 'object') {
			Object.keys(source).forEach(function (key) { addColorPaletteImportValue(out, key, source[key]) })
		} else {
			throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardInvalid))
		}
		if (!Object.keys(out).length) throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardInvalid))
		return out
	}

	const parseColorPaletteLines = function (value) {
		const out = {}
		let nextId = 0
		String(value || '').split(/[\r\n,;]+/).map(function (part) { return part.trim() }).filter(Boolean).forEach(function (part) {
			const match = part.match(/^(?:(.+?)\s*[:=]\s*)?(#?[0-9a-f]{3}(?:[0-9a-f]{3})?)$/i)
			if (!match) throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardInvalid))
			const color = normalizePanelHexColor(match[2])
			if (!color) throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardInvalid))
			const id = match[1] !== undefined ? normalizeColorPaletteImportKey(match[1]) : String(nextId++)
			if (!id) throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardInvalid))
			out[id] = color
		})
		if (!Object.keys(out).length) throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardEmpty))
		return out
	}

	const parseColorPaletteShareText = function (value) {
		const source = String(value || '').trim()
		if (!source) throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardEmpty))
		if (/^[\[{]/.test(source)) {
			try {
				return normalizeColorPaletteImportData(JSON.parse(source))
			} catch (error) {
				throw new Error(error.message || getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardInvalid))
			}
		}
		return parseColorPaletteLines(source)
	}

	const applyColorPaletteToInput = function (root, colors) {
		let applied = 0
		root.querySelectorAll('.modloader-resource-color-row').forEach(function (row) {
			const id = row.dataset.resourceId
			const color = colors[id] ?? colors[String(id)] ?? colors['r' + id]
			if (color === undefined) return
			const normalized = normalizePanelHexColor(color)
			if (!normalized) throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardInvalid))
			const picker = row.querySelector('.modloader-resource-color-picker')
			const textInput = row.querySelector('.modloader-resource-color-text')
			if (picker) picker.value = normalized
			if (textInput) textInput.value = normalized
			applied++
		})
		if (!applied) throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorNoMatches))
		root.dispatchEvent(new Event('input', { bubbles: true }))
		return applied
	}
	const createColorPaletteShareTools = function (item, root) {
		const tools = element('div', 'modloader-resource-color-tools')
		const exportButton = element('button', 'modloader-resource-color-share-button', getInlineLocalizedText(CONFIG_INLINE_TEXT.exportColors))
		exportButton.type = 'button'
		exportButton.title = getInlineLocalizedText(CONFIG_INLINE_TEXT.exportColorsTitle)
		const importButton = element('button', 'modloader-resource-color-share-button', getInlineLocalizedText(CONFIG_INLINE_TEXT.importColors))
		importButton.type = 'button'
		importButton.title = getInlineLocalizedText(CONFIG_INLINE_TEXT.importColorsTitle)
		const status = element('span', 'modloader-resource-color-share-status')
		exportButton.addEventListener('click', async function (event) {
			event.preventDefault()
			event.stopPropagation()
			try {
				await writePanelClipboardText(createColorPaletteShareText(item, root))
				setResourceColorShareStatus(status, getInlineLocalizedText(CONFIG_INLINE_TEXT.colorsCopied), 'ok')
			} catch (error) {
				setResourceColorShareStatus(status, error.message || getInlineLocalizedText(CONFIG_INLINE_TEXT.colorExportFailed), 'error')
			}
		})
		importButton.addEventListener('click', async function (event) {
			event.preventDefault()
			event.stopPropagation()
			try {
				const count = applyColorPaletteToInput(root, parseColorPaletteShareText(await readPanelClipboardText()))
				setResourceColorShareStatus(status, getInlineLocalizedText(CONFIG_INLINE_TEXT.colorsImported, { count }), 'ok')
			} catch (error) {
				setResourceColorShareStatus(status, error.message || getInlineLocalizedText(CONFIG_INLINE_TEXT.colorImportFailed), 'error')
			}
		})
		tools.append(exportButton, importButton, status)
		return tools
	}
	const createColorPaletteConfigInput = function (item, value, options) {
		const root = element('div', 'modloader-color-palette modloader-resource-colors modloader-config-input')
		root.dataset.modloaderColorPalette = 'true'
		root.dataset.modloaderResourceColors = 'true'
		root.dataset.cattailGlowSharing = 'true'
		if (shouldShowColorPaletteSharing(item)) root.appendChild(createColorPaletteShareTools(item, root))
		const resources = getColorPaletteConfigRows(item, value)
		const showIcons = shouldShowColorPaletteIcons(item) && resources.some(function (resource) { return !!resource.iconModel })
		if (!showIcons) root.classList.add('modloader-resource-colors-no-icons', 'modloader-color-palette-no-icons')
		for (const resource of resources) {
			const row = element('div', 'modloader-resource-color-row')
			row.dataset.resourceId = String(resource.id)
			row.dataset.paletteKey = String(resource.id)
			row.dataset.defaultColor = resource.defaultColor

			const picker = element('input', 'modloader-resource-color-picker')
			picker.type = 'color'
			picker.value = resource.color
			picker.title = resource.name

			const textInput = element('input', 'modloader-resource-color-text')
			textInput.type = 'text'
			textInput.spellcheck = false
			textInput.value = resource.color
			textInput.setAttribute('aria-label', getInlineLocalizedText(CONFIG_INLINE_TEXT.glowColorLabel, { name: resource.name }))

			const icon = createColorIconElement(resource.iconModel, 'modloader-resource-color-icon', Object.assign({}, options, {
				item,
				entry: resource.entry || resource,
				key: resource.id,
				getColor() { return normalizePanelHexColor(textInput.value) || row.dataset.defaultColor || resource.defaultColor }
			}))

			const reset = element('button', 'modloader-resource-color-reset', getInlineLocalizedText(CONFIG_INLINE_TEXT.reset))
			reset.type = 'button'
			reset.title = getInlineLocalizedText(CONFIG_INLINE_TEXT.resetTitle)

			picker.addEventListener('input', function () {
				textInput.value = picker.value.toUpperCase()
				root.dispatchEvent(new Event('input', { bubbles: true }))
			})
			textInput.addEventListener('input', function () {
				const color = normalizePanelHexColor(textInput.value)
				if (color) picker.value = color
			})
			reset.addEventListener('click', function (event) {
				event.preventDefault()
				picker.value = row.dataset.defaultColor || '#FFFFFF'
				textInput.value = picker.value
				root.dispatchEvent(new Event('input', { bubbles: true }))
			})

			if (showIcons) row.appendChild(icon)
			row.append(picker, textInput, reset)
			root.appendChild(row)
		}

		root.readConfigValue = function () {
			return readColorPaletteFromInput(root, { includeDefaults: false })
		}

		Object.defineProperty(root, 'disabled', {
			get() { return root.dataset.disabled === 'true' },
			set(value) {
				root.dataset.disabled = value ? 'true' : 'false'
				root.querySelectorAll('input, button').forEach(function (input) { input.disabled = !!value })
			}
		})
		return root
	}
	const getColorPaletteConfigRows = function (item, value) {
		const overrides = isObject(value) ? value : {}
		const defaultOverrides = isObject(item?.default) ? item.default : {}
		const gameResources = state.game?.codex?.resources || []
		const manifestResources = Array.isArray(item.entries) ? item.entries : (Array.isArray(item.rows) ? item.rows : (Array.isArray(item.colors) ? item.colors : (Array.isArray(item.resources) ? item.resources : [])))
		const keyedEntries = []
		const seenKeys = new Set()
		const addKey = function (key) {
			if (key === undefined || key === null) return
			const text = String(key)
			if (seenKeys.has(text)) return
			seenKeys.add(text)
			keyedEntries.push({ key: text })
		}
		for (const entry of manifestResources) addKey(entry?.key ?? entry?.id)
		Object.keys(defaultOverrides).forEach(addKey)
		Object.keys(overrides).forEach(addKey)
		const count = Math.max(Number(item.count) || 0, manifestResources.length, keyedEntries.length)
		const rows = []
		for (let i = 0; i < count; i++) {
			const manifestResource = manifestResources[i] || keyedEntries[i] || {}
			const explicitId = manifestResource.id ?? manifestResource.key
			const id = explicitId !== undefined ? String(explicitId) : String(i)
			let resourceIndex = getFiniteConfigNumber(manifestResource.resourceIndex ?? manifestResource.resourceId ?? manifestResource.resource ?? manifestResource.resourceIcon ?? explicitId)
			if (resourceIndex === null) resourceIndex = i
			const resource = gameResources[resourceIndex] || gameResources[i] || {}
			const nativeDefaultColor = normalizePanelHexColor(manifestResource.default) || normalizePanelHexColor(manifestResource.defaultColor) || normalizePanelHexColor(resource?.triplet?.[2]) || normalizePanelHexColor(resource?.triplet?.[1]) || normalizePanelHexColor(resource?.triplet?.[0]) || normalizePanelHexColor(manifestResource.color) || '#FFFFFF'
			const defaultOverride = getColorPaletteConfigValue(defaultOverrides, id, i)
			const defaultColor = normalizePanelHexColor(defaultOverride) || nativeDefaultColor
			const override = getColorPaletteConfigValue(overrides, id, i)
			rows.push({
				id,
				name: pickLocalizedText(manifestResource.name || manifestResource.label, getLocaleCandidates()) || String(resource.name || manifestResource.name || manifestResource.label || ('Resource ' + (i + 1))),
				defaultColor,
				color: normalizePanelHexColor(override) || defaultColor,
				entry: manifestResource,
				resourceIndex,
				iconModel: getColorIconModel(manifestResource, undefined)
			})
		}
		return rows
	}
	const getColorPaletteConfigValue = function (source, id, index) {
		if (!isObject(source)) return undefined
		return source[id] ?? source[String(id)] ?? source[index] ?? source[String(index)] ?? source['r' + id] ?? source['r' + index]
	}
	const getSliderAliasNumber = function (item, value) {
		const aliases = item?.valueAliases || item?.sliderAliases
		if (!aliases || typeof aliases !== 'object') return null
		const direct = aliases[String(value)]
		const normalized = aliases[String(value ?? '').trim().toLowerCase()]
		return getFiniteConfigNumber(direct ?? normalized)
	}

	const getSliderBounds = function (item, value, type) {
		let stored = getFiniteConfigNumber(value)
		if (stored === null) stored = getSliderAliasNumber(item, value)
		let fallback = getFiniteConfigNumber(item.default)
		if (fallback === null) fallback = getSliderAliasNumber(item, item.default)
		let min = getFiniteConfigNumber(item.min)
		let max = getFiniteConfigNumber(item.max)
		const base = stored !== null ? stored : (fallback !== null ? fallback : 0)
		if (min === null) min = Math.min(0, base)
		if (max === null) max = Math.max(100, min + 1, base)
		if (max <= min) max = min + 1
		const current = clampNumber(base, min, max)
		return { min, max, value: current, step: getConfigNumberStep(item, type) }
	}

	const setSliderFill = function (range, min, max) {
		const value = Number(range.value)
		const percent = max > min ? clampNumber((value - min) / (max - min), 0, 1) * 100 : 0
		range.style.setProperty('--modloader-slider-fill', percent.toFixed(2) + '%')
	}

	const getSliderLabelSource = function (item) {
		const source = item?.valueLabels || item?.sliderLabels
		if (!source || typeof source !== 'object') return null
		return Array.isArray(source) || isLocaleObject(source) ? source : null
	}

	const getSliderValueLabel = function (item, value) {
		const source = getSliderLabelSource(item)
		if (!source) return ''
		if (Array.isArray(source)) {
			const index = Math.max(0, Math.min(source.length - 1, Math.round(Number(value))))
			return pickLocalizedText(source[index], getLocaleCandidates()) || String(source[index] ?? '')
		}
		const exact = source[String(value)]
		const numeric = source[String(Number(value))]
		return pickLocalizedText(exact ?? numeric, getLocaleCandidates())
	}

	const getSliderLabelValues = function (item, bounds) {
		const source = getSliderLabelSource(item)
		if (!source) return []
		if (Array.isArray(source)) {
			return source.map(function (entry, index) { return index }).filter(function (index) { return index >= bounds.min && index <= bounds.max })
		}
		const values = Object.keys(source)
			.map(function (key) { return Number(key) })
			.filter(function (value) { return Number.isFinite(value) && value >= bounds.min && value <= bounds.max })
			.sort(function (a, b) { return a - b })
		if (values.length > 0 && values.length <= 8) return values
		return [ bounds.min, bounds.max ]
	}

	const getSliderStepNumber = function (bounds) {
		const step = getFiniteConfigNumber(bounds?.step)
		return step !== null && step > 0 ? step : null
	}

	const getSliderPrecision = function (bounds) {
		const step = getSliderStepNumber(bounds)
		const values = [ bounds?.min, bounds?.max, step ].filter(function (value) { return value !== null && value !== undefined })
		let precision = 0
		for (const value of values) {
			const text = String(value)
			const exponent = text.match(/e-(\d+)$/i)
			if (exponent) {
				precision = Math.max(precision, Number(exponent[1]) || 0)
				continue
			}
			const decimal = text.split('.')[1]
			if (decimal) precision = Math.max(precision, decimal.length)
		}
		return Math.min(8, precision)
	}

	const formatSliderNumber = function (value, bounds) {
		const number = getFiniteConfigNumber(value)
		if (number === null) return ''
		const basePrecision = getSliderPrecision(bounds)
		const precision = getSliderStepNumber(bounds) === null ? Math.min(8, Math.max(4, basePrecision)) : basePrecision
		if (precision <= 0) return String(Math.round(number))
		return Number(number.toFixed(precision)).toString()
	}

	const snapSliderValue = function (value, bounds) {
		const current = getFiniteConfigNumber(value)
		const fallback = getFiniteConfigNumber(bounds?.value)
		let snapped = clampNumber(current !== null ? current : (fallback !== null ? fallback : 0), bounds.min, bounds.max)
		const step = getSliderStepNumber(bounds)
		if (step === null) return snapped
		const stepCount = Math.round((snapped - bounds.min) / step)
		snapped = bounds.min + stepCount * step
		return clampNumber(Number(snapped.toFixed(getSliderPrecision(bounds))), bounds.min, bounds.max)
	}

	const getSliderResetValue = function (item, bounds) {
		let value = getFiniteConfigNumber(item?.default)
		if (value === null) value = getSliderAliasNumber(item, item?.default)
		if (value === null) value = getFiniteConfigNumber(item?.min)
		if (value === null) value = 0
		return snapSliderValue(value, bounds)
	}

	const getSliderPercent = function (value, bounds) {
		const number = getFiniteConfigNumber(value)
		if (number === null || bounds.max <= bounds.min) return 0
		return clampNumber((number - bounds.min) / (bounds.max - bounds.min), 0, 1) * 100
	}

	const createSliderConfigInput = function (item, value, type) {
		const bounds = getSliderBounds(item, value, type)
		const hasValueLabels = !!getSliderLabelSource(item)
		const root = element('div', 'modloader-config-slider modloader-config-input' + (hasValueLabels ? ' modloader-config-slider-labeled' : ''))
		const range = element('input', 'modloader-config-slider-range')
		range.type = 'range'
		range.min = String(bounds.min)
		range.max = String(bounds.max)
		range.step = 'any'
		range.value = String(bounds.value)

		const number = element('input', 'modloader-config-slider-number')
		number.type = 'number'
		number.min = String(bounds.min)
		number.max = String(bounds.max)
		number.step = bounds.step
		number.value = formatSliderNumber(bounds.value, bounds)
		number.spellcheck = false

		const reset = element('button', 'modloader-config-slider-reset', getInlineLocalizedText(CONFIG_INLINE_TEXT.reset))
		reset.type = 'button'
		reset.title = getInlineLocalizedText(CONFIG_INLINE_TEXT.reset)
		reset.setAttribute('aria-label', getInlineLocalizedText(CONFIG_INLINE_TEXT.reset))

		const labels = element('div', 'modloader-config-slider-labels')
		const valueLabel = element('span', 'modloader-config-slider-value')
		let snapAnimationFrame = 0

		const cancelSnapAnimation = function () {
			if (!snapAnimationFrame || typeof window === 'undefined' || typeof window.cancelAnimationFrame !== 'function') return
			window.cancelAnimationFrame(snapAnimationFrame)
			snapAnimationFrame = 0
		}

		const syncValueLabel = function (displayValue) {
			if (!hasValueLabels) return
			valueLabel.textContent = getSliderValueLabel(item, displayValue) || formatSliderNumber(displayValue, bounds)
		}

		const updateVisualValue = function (displayValue) {
			range.value = String(displayValue)
			setSliderFill(range, bounds.min, bounds.max)
			syncValueLabel(displayValue)
		}

		const setSliderValue = function (nextValue, options) {
			cancelSnapAnimation()
			const config = options || {}
			const parsed = getFiniteConfigNumber(nextValue)
			const fallback = getFiniteConfigNumber(range.value)
			const rawValue = parsed !== null ? parsed : (fallback !== null ? fallback : bounds.value)
			const displayValue = config.snap ? snapSliderValue(rawValue, bounds) : clampNumber(rawValue, bounds.min, bounds.max)
			updateVisualValue(displayValue)
			if (config.updateNumber !== false) number.value = formatSliderNumber(displayValue, bounds)
			return displayValue
		}

		const animateSliderTo = function (targetValue) {
			cancelSnapAnimation()
			const startValue = getFiniteConfigNumber(range.value) ?? targetValue
			const delta = targetValue - startValue
			if (Math.abs(delta) < 0.00001 || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
				updateVisualValue(targetValue)
				return
			}
			const getTime = function () { return (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now() }
			const startTime = getTime()
			const duration = 140
			const tick = function () {
				const elapsed = getTime() - startTime
				const progress = clampNumber(elapsed / duration, 0, 1)
				const eased = 1 - Math.pow(1 - progress, 3)
				updateVisualValue(startValue + delta * eased)
				if (progress < 1) {
					snapAnimationFrame = window.requestAnimationFrame(tick)
				} else {
					snapAnimationFrame = 0
					updateVisualValue(targetValue)
				}
			}
			snapAnimationFrame = window.requestAnimationFrame(tick)
		}

		const commitSliderValue = function (nextValue) {
			const snapped = snapSliderValue(nextValue, bounds)
			number.value = formatSliderNumber(snapped, bounds)
			syncValueLabel(snapped)
			animateSliderTo(snapped)
			return snapped
		}

		range.addEventListener('input', function () {
			setSliderValue(range.value, { snap: false })
		})
		range.addEventListener('change', function () {
			commitSliderValue(range.value)
		})
		number.addEventListener('input', function () {
			setSliderValue(number.value, { snap: false, updateNumber: false })
		})
		number.addEventListener('change', function () {
			commitSliderValue(number.value)
		})
		reset.addEventListener('click', function (event) {
			event.preventDefault()
			event.stopPropagation()
			commitSliderValue(getSliderResetValue(item, bounds))
			root.dispatchEvent(new Event('input', { bubbles: true }))
		})
		setSliderValue(bounds.value, { snap: true })

		root.readConfigValue = function () {
			const current = getFiniteConfigNumber(number.value)
			if (current === null) return readNumberConfigValue(item, number.value, type, { enforceRange: true, min: bounds.min, max: bounds.max })
			const snapped = snapSliderValue(current, bounds)
			return readNumberConfigValue(item, formatSliderNumber(snapped, bounds), type, { enforceRange: true, min: bounds.min, max: bounds.max })
		}

		Object.defineProperty(root, 'disabled', {
			get() { return root.dataset.disabled === 'true' },
			set(value) {
				root.dataset.disabled = value ? 'true' : 'false'
				range.disabled = !!value
				number.disabled = !!value
				reset.disabled = !!value
				if (value) cancelSnapAnimation()
			}
		})

		if (hasValueLabels) {
			for (const labelValue of getSliderLabelValues(item, bounds)) {
				const label = element('span', '', getSliderValueLabel(item, labelValue) || formatSliderNumber(labelValue, bounds))
				label.style.left = getSliderPercent(labelValue, bounds).toFixed(4) + '%'
				labels.appendChild(label)
			}
			root.append(range, number, reset, labels, valueLabel)
		} else {
			root.append(range, number, reset)
		}
		return root
	}
	const normalizePanelHexColor = function (value) {
		if (value === undefined || value === null) return ''
		const text = String(value).trim()
		const shortMatch = text.match(/^#?([0-9a-f]{3})$/i)
		if (shortMatch) return '#' + shortMatch[1].split('').map(function (part) { return part + part }).join('').toUpperCase()
		const fullMatch = text.match(/^#?([0-9a-f]{6})$/i)
		return fullMatch ? '#' + fullMatch[1].toUpperCase() : ''
	}

	const getColorConfigDisplayDefault = function (item) {
		return normalizePanelHexColor(item?.default) || normalizePanelHexColor(item?.defaultColor) || normalizePanelHexColor(item?.colorDefault) || '#FFFFFF'
	}

	const createColorConfigInput = function (item, value, options) {
		const root = element('div', 'modloader-color-input modloader-config-input')
		const displayDefault = getColorConfigDisplayDefault(item)
		const allowAuto = item?.allowAuto === true
		const iconModel = getColorIconModel(item)
		if (iconModel) root.classList.add('modloader-color-with-icon')
		let auto = allowAuto && !normalizePanelHexColor(value)
		const picker = element('input', 'modloader-color-picker')
		picker.type = 'color'
		picker.value = normalizePanelHexColor(value) || displayDefault

		const textInput = element('input', 'modloader-color-text')
		textInput.type = 'text'
		textInput.spellcheck = false
		textInput.value = auto ? '' : (normalizePanelHexColor(value) || displayDefault)

		const reset = element('button', 'modloader-color-reset', getInlineLocalizedText(CONFIG_INLINE_TEXT.reset))
		reset.type = 'button'
		reset.title = getInlineLocalizedText(CONFIG_INLINE_TEXT.resetTitle)

		const getAutoPlaceholder = function () {
			return pickLocalizedText(item?.autoLabel, getLocaleCandidates()) || displayDefault
		}
		const syncAutoPlaceholder = function () {
			textInput.placeholder = auto ? getAutoPlaceholder() : ''
		}
		const setAuto = function () {
			auto = allowAuto
			picker.value = displayDefault
			textInput.value = auto ? '' : displayDefault
			syncAutoPlaceholder()
		}
		const setDefault = function () {
			const defaultColor = normalizePanelHexColor(item?.default)
			if (allowAuto && !defaultColor) {
				setAuto()
				return
			}
			auto = false
			picker.value = defaultColor || displayDefault
			textInput.value = picker.value
			syncAutoPlaceholder()
		}
		const markManual = function () {
			auto = false
			syncAutoPlaceholder()
		}

		syncAutoPlaceholder()
		picker.addEventListener('input', function () {
			markManual()
			textInput.value = picker.value.toUpperCase()
			root.dispatchEvent(new Event('input', { bubbles: true }))
		})
		textInput.addEventListener('input', function () {
			if (allowAuto && String(textInput.value || '').trim() === '') {
				setAuto()
				root.dispatchEvent(new Event('input', { bubbles: true }))
				return
			}
			markManual()
			const color = normalizePanelHexColor(textInput.value)
			if (color) picker.value = color
			root.dispatchEvent(new Event('input', { bubbles: true }))
		})
		reset.addEventListener('click', function (event) {
			event.preventDefault()
			setDefault()
			root.dispatchEvent(new Event('input', { bubbles: true }))
		})

		root.readConfigValue = function () {
			if (auto) return ''
			const color = normalizePanelHexColor(textInput.value)
			if (!color) throw new Error('Enter colors as #RRGGBB.')
			return color
		}

		Object.defineProperty(root, 'disabled', {
			get() { return root.dataset.disabled === 'true' },
			set(value) {
				root.dataset.disabled = value ? 'true' : 'false'
				picker.disabled = !!value
				textInput.disabled = !!value
				reset.disabled = !!value
			}
		})

		const getIconColor = function () {
			const explicit = normalizePanelHexColor(textInput.value)
			if (explicit) return explicit
			if (auto) return normalizePanelHexColor(item?.defaultColor) || displayDefault
			return displayDefault
		}
		if (iconModel) root.appendChild(createColorIconElement(iconModel, 'modloader-color-icon', Object.assign({}, options, {
			item,
			key: item?.key,
			getColor: getIconColor
		})))
		root.append(picker, textInput, reset)
		return root
	}

	const getNumberConfigResetValue = function (item, type) {
		let value = getFiniteConfigNumber(item.default)
		if (value === null) value = getFiniteConfigNumber(item.min)
		if (value === null) value = 0
		if (getNumberConfigType(item, type) === 'integer' || getNumberConfigType(item, type) === 'int') value = Math.round(value)
		return value
	}

	const createNumberConfigInput = function (item, value, type) {
		const root = element('div', 'modloader-config-number')
		const input = element('input', 'modloader-config-input')
		input.type = 'number'
		input.value = formatConfigInputValue(value, type)
		input.step = getConfigNumberStep(item, type)
		if (item.min !== undefined) input.min = String(item.min)
		if (item.max !== undefined) input.max = String(item.max)

		const reset = element('button', 'modloader-config-number-reset', getInlineLocalizedText(CONFIG_INLINE_TEXT.reset))
		reset.type = 'button'
		reset.title = getInlineLocalizedText(CONFIG_INLINE_TEXT.resetTitle)
		reset.setAttribute('aria-label', getInlineLocalizedText(CONFIG_INLINE_TEXT.resetTitle))
		reset.addEventListener('click', function (event) {
			event.preventDefault()
			event.stopPropagation()
			input.value = formatConfigInputValue(getNumberConfigResetValue(item, type), type)
			input.dispatchEvent(new Event('input', { bubbles: true }))
		})

		Object.defineProperty(root, 'value', {
			get() { return input.value },
			set(nextValue) { input.value = nextValue }
		})
		Object.defineProperty(root, 'disabled', {
			get() { return input.disabled },
			set(nextValue) {
				input.disabled = !!nextValue
				reset.disabled = !!nextValue
			}
		})

		root.append(input, reset)
		return root
	}

	const createConfigInput = function (item, value, options) {
		const type = getConfigType(item)
		if (isColorPaletteConfigItem(item, type)) return createColorPaletteConfigInput(item, value, options)
		if (isColorConfigType(type)) return createColorConfigInput(item, value, options)
		if (isSliderConfigItem(item, type)) return createSliderConfigInput(item, value, type)
		const input = element(type === 'array' || type === 'object' ? 'textarea' : 'input', 'modloader-config-input')
		if (type === 'boolean') {
			input.type = 'checkbox'
			input.classList.add('modloader-switch-input')
			input.setAttribute('role', 'switch')
			input.checked = value === undefined ? !!item.default : !!value
		} else if (isNumberConfigType(type)) {
			return createNumberConfigInput(item, value, type)
		} else if (type === 'array' || type === 'object') {
			input.spellcheck = false
			input.value = formatConfigInputValue(value, type)
		} else {
			input.type = 'text'
			input.value = formatConfigInputValue(value, type)
		}
		return input
	}

	const readConfigInputValue = function (item, input) {
		const type = getConfigType(item)
		if (isColorPaletteConfigItem(item, type)) return input.readConfigValue()
		if (isColorConfigType(type)) return input.readConfigValue()
		if (isSliderConfigItem(item, type)) return input.readConfigValue()
		if (type === 'boolean') return !!input.checked
		if (isNumberConfigType(type)) return readNumberConfigValue(item, input.value, type)
		if (type === 'array' || type === 'object') {
			const value = JSON.parse(input.value || (type === 'array' ? '[]' : '{}'))
			if (type === 'array' && !Array.isArray(value)) throw new Error('Enter a JSON array.')
			if (type === 'object' && !isObject(value)) throw new Error('Enter a JSON object.')
			return value
		}
		return input.value
	}

	const writeConfigChanges = function (models, selected) {
		let count = 0
		for (const model of models) {
			if (!selected.has(model.mod.path)) continue
			if (model.invalid) throw new Error('Fix invalid config values.')
			if (sameConfigValue(model.value, model.initial)) continue
			setConfigValue(model.mod.id, model.item.key, model.value)
			model.initial = cloneConfigValue(model.value)
			count++
		}
		return count
	}

	const createPanelActionButton = function (icon, label, title) {
		const button = element('button', 'modloader-action-button')
		button.type = 'button'
		button.title = title || label
		button.setAttribute('aria-label', title || label)
		button.appendChild(element('span', 'modloader-action-icon modloader-action-icon-' + icon))
		button.appendChild(element('span', '', label))
		return button
	}

	const showPanelChoice = function (panel, options) {
		return new Promise(function (resolve) {
			const modal = element('div', 'modloader-modal')
			const box = element('div', 'modloader-modal-box')
			box.appendChild(element('h3', 'modloader-modal-title', options.title || ''))
			box.appendChild(element('div', 'modloader-modal-message', options.message || ''))
			const actions = element('div', 'modloader-modal-actions')
			const close = function (value) {
				panel.classList.remove('modloader-panel-modal-open')
				modal.remove()
				resolve(value)
			}
			let focusButton = null
			for (const choice of options.choices || []) {
				const classes = 'modloader-modal-button' + (choice.primary ? ' modloader-modal-button-primary' : '') + (choice.danger ? ' modloader-modal-button-danger' : '')
				const button = element('button', classes, choice.text || '')
				button.type = 'button'
				button.onclick = function () { close(choice.value) }
				actions.appendChild(button)
				if (!focusButton || choice.focus) focusButton = button
			}
			box.appendChild(actions)
			modal.appendChild(box)
			panel.classList.add('modloader-panel-modal-open')
			panel.appendChild(modal)
			focusButton?.focus()
		})
	}

	const showPanelConfirm = function (panel, options) {
		return showPanelChoice(panel, {
			title: options.title,
			message: options.message,
			choices: [
				{ value: false, text: options.cancelText || t('cancel') },
				{ value: true, text: options.confirmText || 'OK', primary: true, danger: options.danger, focus: true }
			]
		})
	}

	const showPanelTextPrompt = function (panel, options) {
		return new Promise(function (resolve) {
			const modal = element('div', 'modloader-modal')
			const box = element('div', 'modloader-modal-box')
			box.appendChild(element('h3', 'modloader-modal-title', options.title || ''))
			box.appendChild(element('div', 'modloader-modal-message', options.message || ''))
			const input = element('input', 'modloader-modal-input')
			input.type = 'text'
			input.value = options.value || ''
			input.setAttribute('aria-label', options.label || '')
			box.appendChild(input)
			const actions = element('div', 'modloader-modal-actions')
			const skip = element('button', 'modloader-modal-button', options.skipText || t('cancel'))
			const confirm = element('button', 'modloader-modal-button modloader-modal-button-primary', options.confirmText || 'OK')
			const close = function (value) {
				panel.classList.remove('modloader-panel-modal-open')
				modal.remove()
				resolve(value)
			}
			skip.onclick = function () { close(null) }
			confirm.onclick = function () { close(input.value) }
			input.onkeydown = function (event) {
				if (event.key === 'Enter') close(input.value)
				if (event.key === 'Escape') close(null)
			}
			actions.append(skip, confirm)
			box.appendChild(actions)
			modal.appendChild(box)
			panel.classList.add('modloader-panel-modal-open')
			panel.appendChild(modal)
			input.focus()
			input.select()
		})
	}

	const isPathInside = function (parent, child) {
		const tools = getModFileTools()
		if (!tools) return false
		const parentPath = tools.path.resolve(parent)
		const childPath = tools.path.resolve(child)
		const relative = tools.path.relative(parentPath, childPath)
		return relative === '' || (!!relative && !relative.startsWith('..') && !tools.path.isAbsolute(relative))
	}

	const safeModDirectory = function (modPath) {
		const tools = getModFileTools()
		if (!tools) throw new Error(t('fileAccessUnavailable'))
		const directory = tools.path.resolve(tools.modsDir, modPath)
		if (!isPathInside(tools.modsDir, directory)) throw new Error('Invalid mod path.')
		return directory
	}

	const removeEnabledEntry = function (modPath) {
		state.enabledEntries = state.enabledEntries.filter(function (entry) { return entry.path !== modPath })
		writeEnabledConfig(state.enabledEntries.map(function (entry) { return entry.path }))
	}

	const deleteModFolder = function (mod) {
		const tools = getModFileTools()
		if (!tools) throw new Error(t('fileAccessUnavailable'))
		const directory = safeModDirectory(mod.path)
		if (tools.fs.existsSync(directory)) tools.fs.rmSync(directory, { recursive: true, force: true })
		removeEnabledEntry(mod.path)
	}

	const openModsFolder = async function () {
		const tools = getModFileTools()
		if (!tools) throw new Error(t('fileAccessUnavailable'))
		if (tools.shell?.openPath) {
			const result = await tools.shell.openPath(tools.modsDir)
			if (result) throw new Error(result)
			return
		}
		tools.childProcess.spawn('explorer.exe', [tools.modsDir], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
	}

	const sanitizeModFolderName = function (name) {
		return String(name || 'imported-mod').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').trim() || 'imported-mod'
	}

	const getZipPathFromText = function (text) {
		const tools = getModFileTools()
		for (const raw of String(text || '').split(/\r?\n/)) {
			let value = raw.trim()
			if (!value || value.startsWith('#')) continue
			if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
			if (/^file:/i.test(value)) {
				try { value = tools?.url.fileURLToPath(value) || value } catch (error) {}
			}
			if (/\.zip$/i.test(value)) return value
		}
		return ''
	}

	const getZipPathFromFiles = function (files) {
		for (const file of Array.from(files || [])) {
			const name = file.path || file.name || ''
			if (/\.zip$/i.test(name)) return file.path || ''
		}
		return ''
	}

	const getZipPathFromClipboardEvent = function (event) {
		const fromFiles = getZipPathFromFiles(event?.clipboardData?.files)
		if (fromFiles) return fromFiles
		const eventText = event?.clipboardData?.getData?.('text/uri-list') || event?.clipboardData?.getData?.('text/plain') || event?.clipboardData?.getData?.('text') || ''
		const fromEventText = getZipPathFromText(eventText)
		if (fromEventText) return fromEventText

		const tools = getModFileTools()
		const clipboard = tools?.clipboard
		if (!clipboard) return ''
		const fromClipboardText = getZipPathFromText(clipboard.readText?.() || '')
		if (fromClipboardText) return fromClipboardText

		const formats = new Set([ 'FileNameW', 'FileName', 'text/uri-list', 'text/plain' ])
		try {
			for (const format of clipboard.availableFormats?.() || []) formats.add(format)
		} catch (error) {}
		for (const format of formats) {
			try {
				const buffer = clipboard.readBuffer?.(format)
				if (!buffer?.length) continue
				const utf16Path = getZipPathFromText(buffer.toString('utf16le').replace(/\0+/g, '\n'))
				if (utf16Path) return utf16Path
				const utf8Path = getZipPathFromText(buffer.toString('utf8').replace(/\0+/g, '\n'))
				if (utf8Path) return utf8Path
			} catch (error) {}
		}
		return ''
	}

	const collectModRoots = function (directory, depth, out) {
		const tools = getModFileTools()
		if (tools.fs.existsSync(tools.path.join(directory, 'mod.json'))) {
			out.push(directory)
			return
		}
		if (depth >= 3) return
		for (const entry of tools.fs.readdirSync(directory, { withFileTypes: true })) {
			if (entry.isDirectory()) collectModRoots(tools.path.join(directory, entry.name), depth + 1, out)
		}
	}

	const prepareZipImport = function (zipPath) {
		const tools = getModFileTools()
		if (!tools) throw new Error(t('fileAccessUnavailable'))
		if (!zipPath || !/\.zip$/i.test(zipPath)) throw new Error(t('invalidZip'))
		const importRoot = tools.path.join(tools.gameRoot, 'modloader', 'state', 'imports')
		tools.fs.mkdirSync(importRoot, { recursive: true })
		const tempDir = tools.fs.mkdtempSync(tools.path.join(importRoot, 'zip-'))
		const extractDir = tools.path.join(tempDir, 'contents')
		tools.fs.mkdirSync(extractDir, { recursive: true })
		const scriptPath = tools.path.join(tempDir, 'extract.ps1')
		tools.fs.writeFileSync(scriptPath, [
			'param(',
			'  [Parameter(Mandatory=$true)][string]$ZipPath,',
			'  [Parameter(Mandatory=$true)][string]$DestinationPath',
			')',
			"$ErrorActionPreference = 'Stop'",
			'[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()',
			'Expand-Archive -LiteralPath $ZipPath -DestinationPath $DestinationPath -Force'
		].join(tools.os.EOL), 'utf8')
		const result = tools.childProcess.spawnSync('powershell.exe', [
			'-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
			scriptPath, '-ZipPath', zipPath, '-DestinationPath', extractDir
		], { encoding: 'utf8', windowsHide: true })
		if (result.error || result.status) {
			const message = [ result.error?.message, result.stderr, result.stdout, result.status ? String(result.status) : '' ].filter(Boolean).join('\n')
			tools.fs.rmSync(tempDir, { recursive: true, force: true })
			throw new Error(t('zipExtractFailed', { value: message.trim() }))
		}
		const roots = []
		collectModRoots(extractDir, 0, roots)
		if (!roots.length) {
			tools.fs.rmSync(tempDir, { recursive: true, force: true })
			throw new Error(t('zipNoMod'))
		}
		if (roots.length > 1) {
			tools.fs.rmSync(tempDir, { recursive: true, force: true })
			throw new Error(t('zipMultipleMods'))
		}
		const sourceDir = roots[0]
		const rootIsTemp = tools.path.resolve(sourceDir) === tools.path.resolve(extractDir)
		const folderName = sanitizeModFolderName(rootIsTemp ? tools.path.basename(zipPath, tools.path.extname(zipPath)) : tools.path.basename(sourceDir))
		const destDir = safeModDirectory(folderName)
		const manifest = readManifestFromDirectory(sourceDir)
		return { tempDir, sourceDir, folderName, destDir, manifest }
	}

	const completeZipImport = function (plan, options) {
		const tools = getModFileTools()
		if (!tools) throw new Error(t('fileAccessUnavailable'))
		const replace = typeof options === 'object' ? !!options.replace : !!options
		const replacePath = typeof options === 'object' ? options.replacePath || '' : ''
		try {
			if (replacePath) {
				const replaceDir = safeModDirectory(replacePath)
				if (tools.fs.existsSync(replaceDir)) tools.fs.rmSync(replaceDir, { recursive: true, force: true })
			}
			if (tools.fs.existsSync(plan.destDir)) {
				if (!replace) return false
				tools.fs.rmSync(plan.destDir, { recursive: true, force: true })
			}
			tools.fs.cpSync(plan.sourceDir, plan.destDir, { recursive: true })
			if (replacePath && replacePath !== plan.folderName) replaceEnabledEntryPath(replacePath, plan.folderName)
			return true
		} finally {
			tools.fs.rmSync(plan.tempDir, { recursive: true, force: true })
		}
	}

	const refreshOpenPanel = function () {
		if (document.getElementById('modloader-panel')) renderPanel()
	}

	const installLanguageBridge = function () {
		if (state.languagePatched || typeof Game === 'undefined') return
		state.languagePatched = true
		api.patch(Game.prototype, 'changeLanguage', function (original) {
			return function () {
				const result = original.apply(this, arguments)
				state.game = this
				showStatus()
				requestAnimationFrame(refreshOpenPanel)
				return result
			}
		}, 'modloader')
	}

	const PANEL_EDGE_MARGIN = 16
	const PANEL_TAB_SIZE = 42
	const PANEL_EDGES = [ 'left', 'right', 'top', 'bottom' ]
	const PANEL_AUTO_HIDE_SECONDS_DEFAULT = 3
	const PANEL_AUTO_HIDE_SECONDS_MIN = 0.5
	const PANEL_AUTO_HIDE_SECONDS_MAX = 60
	const PANEL_STATE_STORAGE_KEY = 'modloader:panelState'
	const PANEL_THEME_TOKEN_NAMES = Object.freeze([
		'--modloader-panel-bg',
		'--modloader-panel-text',
		'--modloader-text-strong',
		'--modloader-text',
		'--modloader-text-muted',
		'--modloader-text-subtle',
		'--modloader-border',
		'--modloader-border-strong',
		'--modloader-surface',
		'--modloader-surface-hover',
		'--modloader-surface-active',
		'--modloader-control-bg',
		'--modloader-control-bg-hover',
		'--modloader-control-border',
		'--modloader-control-border-hover',
		'--modloader-control-text',
		'--modloader-control-text-hover',
		'--modloader-input-bg',
		'--modloader-input-border',
		'--modloader-input-text',
		'--modloader-focus-border',
		'--modloader-panel-shadow',
		'--modloader-primary-bg',
		'--modloader-primary-text',
		'--modloader-danger-bg',
		'--modloader-danger-border',
		'--modloader-danger-text',
		'--modloader-warning-text',
		'--modloader-error-text',
		'--modloader-ok-text',
		'--modloader-slider-fill-color',
		'--modloader-slider-track-color',
		'--modloader-slider-track-shadow'
	])

	const clampNumber = function (value, min, max) {
		return Math.min(Math.max(value, min), max)
	}

	const isValidPanelTheme = function (value) {
		return value === 'dark' || value === 'light'
	}

	const isValidPanelHideMode = function (value) {
		return value === 'auto' || value === 'manual'
	}

	const normalizePanelThemeTokenName = function (name) {
		const text = String(name || '').trim()
		if (!text) return ''
		if (text.indexOf('--') === 0) return text
		const kebab = text
			.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
			.replace(/[_\s]+/g, '-')
			.toLowerCase()
			.replace(/^-+/, '')
		return '--modloader-' + kebab.replace(/^modloader-/, '')
	}

	const getPanelThemeMode = function () {
		return isValidPanelTheme(state.panelSettings.theme) ? state.panelSettings.theme : 'dark'
	}

	const getPanelThemeTokenValue = function (name, fallback) {
		const token = normalizePanelThemeTokenName(name)
		if (!token) return fallback === undefined ? '' : fallback
		const panel = document.getElementById('modloader-panel')
		if (!panel || typeof window.getComputedStyle !== 'function') return fallback === undefined ? '' : fallback
		const value = window.getComputedStyle(panel).getPropertyValue(token).trim()
		return value || (fallback === undefined ? '' : fallback)
	}

	const createUiThemeApi = function () {
		return {
			mode: getPanelThemeMode,
			current: getPanelThemeMode,
			tokens() { return PANEL_THEME_TOKEN_NAMES.slice() },
			token: normalizePanelThemeTokenName,
			value: getPanelThemeTokenValue,
			applyToken(target, property, name, fallback) {
				if (!target?.style || !property) return target
				const token = normalizePanelThemeTokenName(name)
				if (!token) return target
				target.style.setProperty(String(property), fallback === undefined ? `var(${token})` : `var(${token}, ${fallback})`)
				return target
			}
		}
	}

	const normalizePanelAutoHideSeconds = function (value) {
		const number = Number(value)
		if (!Number.isFinite(number)) return PANEL_AUTO_HIDE_SECONDS_DEFAULT
		return Math.round(clampNumber(number, PANEL_AUTO_HIDE_SECONDS_MIN, PANEL_AUTO_HIDE_SECONDS_MAX) * 10) / 10
	}

	const getPanelAutoHideDelayMs = function () {
		return Math.round(normalizePanelAutoHideSeconds(state.panelSettings.autoHideSeconds) * 1000)
	}

	const isValidPanelEdge = function (value) {
		return value === 'left' || value === 'right' || value === 'top' || value === 'bottom'
	}

	const normalizePanelTabPosition = function (value) {
		if (!isObject(value) || !isValidPanelEdge(value.edge)) return null
		return {
			edge: value.edge,
			offset: clampPanelTabOffset(value.edge, Number(value.offset) || 0)
		}
	}

	const createPanelTabPositionMap = function () {
		return { left: null, right: null, top: null, bottom: null }
	}

	const readPanelTabPositionMap = function (source) {
		const result = createPanelTabPositionMap()
		if (!isObject(source)) return result
		for (const edge of PANEL_EDGES) {
			const tab = normalizePanelTabPosition(source[edge])
			if (tab) result[edge] = { edge, offset: clampPanelTabOffset(edge, tab.offset) }
		}
		return result
	}

	const readPanelConfigSectionOrder = function (source) {
		const result = {}
		if (!source || typeof source !== 'object' || Array.isArray(source)) return result
		for (const modKey in source) {
			if (!Array.isArray(source[modKey])) continue
			const order = source[modKey].map(function (key) { return String(key || '') }).filter(Boolean)
			if (order.length) result[String(modKey)] = order
		}
		return result
	}

	const clonePanelConfigSectionOrder = function (source) {
		return readPanelConfigSectionOrder(source)
	}

	const samePanelConfigSectionOrder = function (a, b) {
		const left = readPanelConfigSectionOrder(a)
		const right = readPanelConfigSectionOrder(b)
		const leftKeys = Object.keys(left).sort()
		const rightKeys = Object.keys(right).sort()
		if (!sameStringList(leftKeys, rightKeys)) return false
		for (const key of leftKeys) {
			if (!sameStringList(left[key], right[key])) return false
		}
		return true
	}

	const getPanelConfigSectionOrderKey = function (mod) {
		return String(mod?.path || mod?.id || '')
	}

	const loadPanelState = function () {
		if (state.panelStateLoaded) return
		state.panelStateLoaded = true
		try {
			const stored = JSON.parse(localStorage.getItem(PANEL_STATE_STORAGE_KEY) || '{}')
			if (isObject(stored.position)) state.panelPosition = {
				x: Number(stored.position.x) || PANEL_EDGE_MARGIN,
				y: Number(stored.position.y) || PANEL_EDGE_MARGIN
			}
			const hasStoredTabPositions = isObject(stored.tabPositions)
			state.panelTabPositions = readPanelTabPositionMap(stored.tabPositions)
			const activeTab = normalizePanelTabPosition(stored.tabPosition)
			if (activeTab) {
				state.panelTabPosition = activeTab
				if (!hasStoredTabPositions) state.panelTabPositions[activeTab.edge] = activeTab
			}
			if (Array.isArray(stored.modOrder)) {
				state.panelModOrder = stored.modOrder.map(function (path) { return String(path || '') }).filter(Boolean)
			}
			state.panelConfigSectionOrder = readPanelConfigSectionOrder(stored.configSectionOrder)
			if (isObject(stored.settings)) {
				if (isValidPanelTheme(stored.settings.theme)) state.panelSettings.theme = stored.settings.theme
				if (isValidPanelHideMode(stored.settings.hideMode)) state.panelSettings.hideMode = stored.settings.hideMode
				state.panelSettings.autoHideSeconds = normalizePanelAutoHideSeconds(stored.settings.autoHideSeconds)
				state.panelSettings.hideMenuDetails = stored.settings.hideMenuDetails === true
				state.panelSettings.hideModFileDetails = stored.settings.hideModFileDetails === true
				state.panelSettings.sortConfigSections = stored.settings.sortConfigSections !== false
				state.panelSettings.renderApiEnabled = stored.settings.renderApiEnabled !== false
			}
			if (isValidPanelEdge(stored.hiddenSide)) state.panelHiddenSide = stored.hiddenSide
			else if (activeTab) state.panelHiddenSide = activeTab.edge
			state.panelHidden = (stored.hidden === true || stored.restoreAsTab === true) && state.panelSettings.hideMode !== 'manual'
			if (state.panelSettings.hideMode === 'manual') state.panelHidden = false
		} catch (error) {}
	}

	const savePanelState = function (options) {
		try {
			const hasRestoreOverride = options && Object.prototype.hasOwnProperty.call(options, 'restoreAsTab')
			const restoreAsTab = hasRestoreOverride
				? options.restoreAsTab === true
				: state.panelHidden || (isPanelAutoHideEnabled() && !!document.getElementById('modloader-panel'))
			localStorage.setItem(PANEL_STATE_STORAGE_KEY, JSON.stringify({
				position: state.panelPosition,
				hidden: state.panelHidden,
				restoreAsTab,
				hiddenSide: state.panelHiddenSide,
				tabPosition: state.panelTabPosition,
				tabPositions: state.panelTabPositions,
				modOrder: state.panelModOrder,
				configSectionOrder: state.panelConfigSectionOrder,
				settings: state.panelSettings
			}))
		} catch (error) {}
	}

	const applyPanelModOrder = function (mods) {
		if (!state.panelModOrder.length) return
		const order = new Map()
		state.panelModOrder.forEach(function (path, index) {
			if (!order.has(path)) order.set(path, index)
		})
		mods.sort(function (a, b) {
			const ai = order.has(a.path) ? order.get(a.path) : Number.MAX_SAFE_INTEGER
			const bi = order.has(b.path) ? order.get(b.path) : Number.MAX_SAFE_INTEGER
			return ai - bi
		})
	}

	const isPanelAutoHideEnabled = function () {
		return state.panelSettings.hideMode !== 'manual'
	}

	const clearPanelAutoHideTimer = function () {
		if (!state.panelAutoHideTimer) return
		clearTimeout(state.panelAutoHideTimer)
		state.panelAutoHideTimer = null
	}

	const getPanelSize = function (panel) {
		const rect = panel.getBoundingClientRect()
		return {
			width: rect.width || panel.offsetWidth || 860,
			height: rect.height || panel.offsetHeight || 420
		}
	}

	const clampPanelX = function (panel, value) {
		const size = getPanelSize(panel)
		const max = Math.max(PANEL_EDGE_MARGIN, window.innerWidth - size.width - PANEL_EDGE_MARGIN)
		return Math.round(clampNumber(value, PANEL_EDGE_MARGIN, max))
	}

	const clampPanelY = function (panel, value) {
		const size = getPanelSize(panel)
		const max = Math.max(PANEL_EDGE_MARGIN, window.innerHeight - size.height - PANEL_EDGE_MARGIN)
		return Math.round(clampNumber(value, PANEL_EDGE_MARGIN, max))
	}

	const clampPanelTabOffset = function (edge, offset) {
		const max = (edge === 'left' || edge === 'right') ? window.innerHeight - PANEL_TAB_SIZE : window.innerWidth - PANEL_TAB_SIZE
		return Math.round(clampNumber(offset, 0, Math.max(0, max)))
	}

	const setPanelVisiblePosition = function (panel, x, y, persist) {
		const nextX = clampPanelX(panel, x)
		const nextY = clampPanelY(panel, y)
		panel.style.right = 'auto'
		panel.style.left = nextX + 'px'
		panel.style.top = nextY + 'px'
		state.panelPosition = { x: nextX, y: nextY }
		if (persist) {
			rememberVisiblePanelRestoreTab(panel)
			savePanelState()
		}
		return state.panelPosition
	}

	const getNearestPanelEdge = function (panel) {
		const rect = panel.getBoundingClientRect()
		const distances = {
			left: Math.max(0, rect.left),
			right: Math.max(0, window.innerWidth - rect.right),
			top: Math.max(0, rect.top),
			bottom: Math.max(0, window.innerHeight - rect.bottom)
		}
		return Object.keys(distances).sort(function (a, b) { return distances[a] - distances[b] })[0] || 'right'
	}

	const getStoredPanelTabPosition = function (edge) {
		if (!isValidPanelEdge(edge)) return null
		return normalizePanelTabPosition(state.panelTabPositions?.[edge])
	}

	const rememberPanelTabPosition = function (tab) {
		const normalized = normalizePanelTabPosition(tab)
		if (!normalized) return null
		state.panelHiddenSide = normalized.edge
		state.panelTabPosition = normalized
		state.panelTabPositions[normalized.edge] = normalized
		return normalized
	}

	const resetPanelTabPositionMemory = function (edge) {
		if (isValidPanelEdge(edge)) state.panelTabPositions[edge] = null
	}

	const getPanelTabPositionForEdge = function (panel, edge, useStoredMemory) {
		if (!isValidPanelEdge(edge)) return null
		const stored = useStoredMemory ? getStoredPanelTabPosition(edge) : null
		if (stored) return stored
		const rect = panel.getBoundingClientRect()
		const offset = (edge === 'left' || edge === 'right')
			? rect.top + rect.height / 2 - PANEL_TAB_SIZE / 2
			: rect.left + rect.width / 2 - PANEL_TAB_SIZE / 2
		return { edge, offset: clampPanelTabOffset(edge, offset) }
	}

	const getPanelTabPositionFromPanel = function (panel, useStoredMemory) {
		return getPanelTabPositionForEdge(panel, getNearestPanelEdge(panel), useStoredMemory)
	}

	const getActivePanelTabPosition = function (panel) {
		const active = normalizePanelTabPosition(state.panelTabPosition)
		if (active) return active
		return getPanelTabPositionFromPanel(panel, true)
	}

	const getPanelRestoreTabFromVisiblePanel = function (panel) {
		const active = normalizePanelTabPosition(state.panelTabPosition)
		const preferredEdge = isValidPanelEdge(state.panelPreferredHideEdge) ? state.panelPreferredHideEdge : null
		if (preferredEdge && active?.edge === preferredEdge) return active
		if (preferredEdge) return getPanelTabPositionForEdge(panel, preferredEdge, false)
		return getPanelTabPositionFromPanel(panel, false)
	}

	const rememberVisiblePanelRestoreTab = function (panel) {
		if (!panel || state.panelHidden || !isPanelAutoHideEnabled()) return
		const tab = getPanelRestoreTabFromVisiblePanel(panel)
		if (!tab) return
		rememberPanelTabPosition(tab)
		state.panelPreferredHideEdge = tab.edge
	}

	const getPanelTabPositionFromPointer = function (clientX, clientY) {
		const distances = {
			left: clientX,
			right: window.innerWidth - clientX,
			top: clientY,
			bottom: window.innerHeight - clientY
		}
		const edge = Object.keys(distances).sort(function (a, b) { return distances[a] - distances[b] })[0] || 'right'
		const offset = (edge === 'left' || edge === 'right') ? clientY - PANEL_TAB_SIZE / 2 : clientX - PANEL_TAB_SIZE / 2
		return { edge, offset: clampPanelTabOffset(edge, offset) }
	}

	const getPanelTabCoordinates = function (tab) {
		if (tab.edge === 'left') return { x: 0, y: tab.offset }
		if (tab.edge === 'right') return { x: window.innerWidth - PANEL_TAB_SIZE, y: tab.offset }
		if (tab.edge === 'top') return { x: tab.offset, y: 0 }
		return { x: tab.offset, y: window.innerHeight - PANEL_TAB_SIZE }
	}

	const setPanelHiddenTabPosition = function (panel, tab) {
		const normalized = normalizePanelTabPosition(tab) || getActivePanelTabPosition(panel)
		state.panelHiddenSide = normalized.edge
		state.panelTabPosition = normalized
		const position = getPanelTabCoordinates(normalized)
		panel.style.right = 'auto'
		panel.style.left = Math.round(position.x) + 'px'
		panel.style.top = Math.round(position.y) + 'px'
		setPanelHiddenClasses(panel, normalized.edge)
	}

	const setPanelHiddenClasses = function (panel, edge) {
		panel.classList.toggle('modloader-panel-autohidden', state.panelHidden)
		for (const item of [ 'left', 'right', 'top', 'bottom' ]) {
			panel.classList.toggle('modloader-panel-hidden-' + item, state.panelHidden && edge === item)
		}
	}

	const syncPanelSettingsPageState = function (panel) {
		if (!panel) return
		panel.classList.toggle('modloader-panel-settings-open', state.panelSettingsOpen)
		const settingsButton = panel.querySelector('.modloader-panel-settings')
		const settingsPage = panel.querySelector('.modloader-panel-settings-page')
		if (settingsButton) {
			settingsButton.classList.toggle('active', state.panelSettingsOpen)
			settingsButton.setAttribute('aria-expanded', state.panelSettingsOpen ? 'true' : 'false')
		}
		if (settingsPage) {
			settingsPage.classList.toggle('active', state.panelSettingsOpen)
			settingsPage.setAttribute('aria-hidden', state.panelSettingsOpen ? 'false' : 'true')
			settingsPage.inert = !state.panelSettingsOpen
		}
	}

	const applyPanelSettings = function (panel) {
		panel.classList.toggle('modloader-panel-theme-light', state.panelSettings.theme === 'light')
		panel.classList.toggle('modloader-panel-manual-hide', !isPanelAutoHideEnabled())
		syncPanelSettingsPageState(panel)
		if (!isPanelAutoHideEnabled()) clearPanelAutoHideTimer()
	}

	const togglePanelSettingsPage = function (panel) {
		state.panelSettingsOpen = !state.panelSettingsOpen
		syncPanelSettingsPageState(panel)
		savePanelState()
	}

	const closePanelSettingsPage = function (panel) {
		if (!state.panelSettingsOpen) return
		state.panelSettingsOpen = false
		syncPanelSettingsPageState(panel)
	}

	const applyPanelHiddenPosition = function (panel) {
		if (!isPanelAutoHideEnabled()) {
			state.panelHidden = false
			setPanelHiddenClasses(panel, state.panelHiddenSide || 'right')
			return
		}
		setPanelHiddenTabPosition(panel, getActivePanelTabPosition(panel))
	}

	const showPanelFromEdge = function (panel) {
		clearPanelAutoHideTimer()
		const tab = getActivePanelTabPosition(panel)
		state.panelPreferredHideEdge = tab.edge
		state.panelHidden = false
		setPanelHiddenClasses(panel, tab.edge)
		const size = getPanelSize(panel)
		let x = state.panelPosition?.x ?? PANEL_EDGE_MARGIN
		let y = state.panelPosition?.y ?? PANEL_EDGE_MARGIN
		if (tab.edge === 'left') {
			x = PANEL_EDGE_MARGIN
			y = tab.offset
		} else if (tab.edge === 'right') {
			x = window.innerWidth - size.width - PANEL_EDGE_MARGIN
			y = tab.offset
		} else if (tab.edge === 'top') {
			x = tab.offset
			y = PANEL_EDGE_MARGIN
		} else if (tab.edge === 'bottom') {
			x = tab.offset
			y = window.innerHeight - size.height - PANEL_EDGE_MARGIN
		}
		setPanelVisiblePosition(panel, x, y, true)
	}

	const hidePanelToEdge = function (panel, useStoredTab) {
		if (!isPanelAutoHideEnabled()) return
		closePanelSettingsPage(panel)
		const rect = panel.getBoundingClientRect()
		const activeTab = normalizePanelTabPosition(state.panelTabPosition)
		const preferredEdge = useStoredTab && isValidPanelEdge(state.panelPreferredHideEdge) ? state.panelPreferredHideEdge : null
		const preferredTab = preferredEdge && activeTab?.edge === preferredEdge ? activeTab : getPanelTabPositionForEdge(panel, preferredEdge, true)
		const tab = preferredTab || getPanelTabPositionFromPanel(panel, useStoredTab)
		panel.scrollTop = 0
		panel.style.right = 'auto'
		panel.style.left = Math.round(rect.left) + 'px'
		panel.style.top = Math.round(rect.top) + 'px'
		panel.getBoundingClientRect()
		state.panelHidden = true
		state.panelHiddenSide = tab.edge
		state.panelTabPosition = tab
		state.panelPreferredHideEdge = tab.edge
		state.panelPosition = { x: clampPanelX(panel, rect.left), y: clampPanelY(panel, rect.top) }
		savePanelState()
		setPanelHiddenClasses(panel, tab.edge)
		requestAnimationFrame(function () { setPanelHiddenTabPosition(panel, tab) })
	}

	const schedulePanelAutoHide = function (panel) {
		clearPanelAutoHideTimer()
		if (!isPanelAutoHideEnabled() || state.panelHidden) return
		state.panelAutoHideTimer = setTimeout(function () {
			state.panelAutoHideTimer = null
			if (!document.body.contains(panel) || state.panelHidden || panel.matches(':hover')) return
			hidePanelToEdge(panel, true)
		}, getPanelAutoHideDelayMs())
	}

	const applyPanelStoredPosition = function (panel) {
		applyPanelSettings(panel)
		if (state.statusLogoIndex < 0) chooseStatusLogoFrame()
		const tabLogo = panel.querySelector('.modloader-panel-tab-logo')
		if (tabLogo) setStatusLogoFrame(tabLogo, state.statusLogoIndex)
		if (state.panelHidden) {
			applyPanelHiddenPosition(panel)
			return
		}
		setPanelHiddenClasses(panel, state.panelHiddenSide)
		if (state.panelPosition) setPanelVisiblePosition(panel, state.panelPosition.x, state.panelPosition.y)
	}

	const installPanelDrag = function (panel, handle, addCleanup) {
		let moveHandler = null
		let upHandler = null
		const clearDrag = function () {
			panel.classList.remove('modloader-panel-dragging')
			if (moveHandler) document.removeEventListener('pointermove', moveHandler, true)
			if (upHandler) document.removeEventListener('pointerup', upHandler, true)
			moveHandler = null
			upHandler = null
		}
		handle.addEventListener('pointerdown', function (event) {
			if (event.button !== undefined && event.button !== 0) return
			if (event.target?.closest?.('button, input, textarea, select, label, a')) return
			if (state.panelHidden) return
			clearPanelAutoHideTimer()
			const rect = panel.getBoundingClientRect()
			const startX = event.clientX
			const startY = event.clientY
			const startLeft = rect.left
			const startTop = rect.top
			panel.classList.add('modloader-panel-dragging')
			state.panelPreferredHideEdge = null
			event.preventDefault()
			moveHandler = function (moveEvent) {
				moveEvent.preventDefault()
				setPanelVisiblePosition(panel, startLeft + moveEvent.clientX - startX, startTop + moveEvent.clientY - startY)
			}
			upHandler = function () {
				const current = panel.getBoundingClientRect()
				setPanelVisiblePosition(panel, current.left, current.top, true)
				clearDrag()
			}
			document.addEventListener('pointermove', moveHandler, true)
			document.addEventListener('pointerup', upHandler, true)
		}, true)
		addCleanup(clearDrag)
	}

	const installPanelTabDrag = function (panel, tab, addCleanup) {
		let moveHandler = null
		let upHandler = null
		let moved = false
		let startEdge = null
		const clearDrag = function () {
			panel.classList.remove('modloader-panel-dragging')
			if (moveHandler) document.removeEventListener('pointermove', moveHandler, true)
			if (upHandler) document.removeEventListener('pointerup', upHandler, true)
			moveHandler = null
			upHandler = null
		}
		tab.addEventListener('pointerdown', function (event) {
			if (event.button !== undefined && event.button !== 0) return
			if (!state.panelHidden) return
			clearPanelAutoHideTimer()
			state.panelPreferredHideEdge = null
			const startX = event.clientX
			const startY = event.clientY
			const active = getActivePanelTabPosition(panel)
			startEdge = active.edge
			moved = false
			panel.classList.add('modloader-panel-dragging')
			event.preventDefault()
			event.stopPropagation()
			moveHandler = function (moveEvent) {
				moveEvent.preventDefault()
				if (Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) > 3) moved = true
				const next = getPanelTabPositionFromPointer(moveEvent.clientX, moveEvent.clientY)
				setPanelHiddenTabPosition(panel, next)
			}
			upHandler = function () {
				if (moved) {
					const finalTab = getActivePanelTabPosition(panel)
					if (startEdge && finalTab.edge !== startEdge) resetPanelTabPositionMemory(startEdge)
					rememberPanelTabPosition(finalTab)
					savePanelState()
					tab.__modloaderSuppressClick = true
					setTimeout(function () { tab.__modloaderSuppressClick = false }, 0)
				}
				clearDrag()
			}
			document.addEventListener('pointermove', moveHandler, true)
			document.addEventListener('pointerup', upHandler, true)
		}, true)
		addCleanup(clearDrag)
	}
	const renderPanel = function () {
		if (!document.body) return
		loadPanelState()
		ensurePanelStyle()
		readTranslationCatalogFromDisk({ silent: true })
		ensureTranslationCatalogWatcher()

		const available = readAvailableMods()
		const mods = available.mods
		applyPanelModOrder(mods)
		const originalSelected = getOrderedSelectedPaths(mods, getEnabledPathSet())
		const selected = new Set(originalSelected)
		const originalPanelModOrder = state.panelModOrder.slice()
		const originalPanelConfigSectionOrder = clonePanelConfigSectionOrder(state.panelConfigSectionOrder)
		const rowModels = []
		const configModels = []

		let panel = document.getElementById('modloader-panel')
		if (!panel) {
			panel = element('div')
			panel.id = 'modloader-panel'
			document.body.appendChild(panel)
		}

		if (panel.__modloaderCleanup) panel.__modloaderCleanup()
		panel.innerHTML = ''
		const cleanupFns = []
		const addCleanup = function (fn) { cleanupFns.push(fn) }
		panel.__modloaderCleanup = function () {
			while (cleanupFns.length) {
				try { cleanupFns.pop()() } catch (error) {}
			}
			panel.__modloaderCleanup = null
		}

		const tab = element('button', 'modloader-panel-tab')
		tab.type = 'button'
		tab.title = t('showFromEdge')
		tab.setAttribute('aria-label', t('showFromEdge'))
		const tabLogo = element('span', 'modloader-panel-tab-logo')
		tabLogo.setAttribute('aria-hidden', 'true')
		tab.appendChild(tabLogo)
		tab.onclick = function () {
			if (tab.__modloaderSuppressClick) return
			showPanelFromEdge(panel)
		}
		panel.appendChild(tab)
		installPanelTabDrag(panel, tab, addCleanup)

		const header = element('div', 'modloader-panel-header')
		const title = element('h2', '', `Cattail's ModLoader ${state.version}`)
		const controls = element('div', 'modloader-panel-controls')
		const settings = element('button', 'modloader-panel-settings')
		settings.type = 'button'
		settings.title = t('menuSettings')
		settings.setAttribute('aria-label', t('menuSettings'))
		settings.classList.toggle('active', state.panelSettingsOpen)
		settings.onclick = function (event) {
			event.preventDefault()
			event.stopPropagation()
			togglePanelSettingsPage(panel)
		}
		const hide = element('button', 'modloader-panel-edge')
		hide.type = 'button'
		hide.title = t('hideToEdge')
		hide.setAttribute('aria-label', t('hideToEdge'))
		hide.disabled = !isPanelAutoHideEnabled()
		hide.appendChild(element('span', 'modloader-panel-edge-icon', '\u2192|'))
		hide.onclick = function (event) {
			event.preventDefault()
			event.stopPropagation()
			if (!isPanelAutoHideEnabled()) return
			hidePanelToEdge(panel, true)
		}
		const close = element('button', 'modloader-panel-close')
		close.type = 'button'
		close.title = t('close')
		close.setAttribute('aria-label', t('close'))
		close.onclick = function () {
			state.panelHidden = false
			state.panelSettingsOpen = false
			savePanelState({ restoreAsTab: false })
			if (panel.__modloaderCleanup) panel.__modloaderCleanup()
			panel.remove()
		}
		controls.append(settings, hide, close)
		header.append(title, controls)
		panel.appendChild(header)
		installPanelDrag(panel, header, addCleanup)
		const resizePanel = function () { applyPanelStoredPosition(panel) }
		window.addEventListener('resize', resizePanel)
		addCleanup(function () { window.removeEventListener('resize', resizePanel) })

		const settingsPage = element('div', 'modloader-panel-settings-page' + (state.panelSettingsOpen ? ' active' : ''))
		settingsPage.appendChild(element('div', 'modloader-panel-settings-title', t('menuSettings')))
		const addSettingsRow = function (label, options, current, apply) {
			const row = element('div', 'modloader-panel-settings-row')
			row.appendChild(element('span', '', label))
			const group = element('span', 'modloader-panel-settings-options')
			for (const option of options) {
				const button = element('button', 'modloader-panel-settings-option' + (option.value === current ? ' active' : ''), option.label)
				button.type = 'button'
				button.onclick = function (event) {
					event.preventDefault()
					apply(option.value)
					savePanelState()
					renderPanel()
				}
				group.appendChild(button)
			}
			row.appendChild(group)
			settingsPage.appendChild(row)
		}
		const addSettingsNumberRow = function (label, current, apply) {
			const row = element('div', 'modloader-panel-settings-row')
			row.appendChild(element('span', '', label))
			const wrap = element('label', 'modloader-panel-settings-number-wrap')
			const input = element('input', 'modloader-panel-settings-number')
			input.type = 'number'
			input.min = String(PANEL_AUTO_HIDE_SECONDS_MIN)
			input.max = String(PANEL_AUTO_HIDE_SECONDS_MAX)
			input.step = '0.5'
			input.value = String(normalizePanelAutoHideSeconds(current))
			const commit = function () {
				const value = normalizePanelAutoHideSeconds(input.value)
				input.value = String(value)
				apply(value)
				savePanelState()
			}
			input.onchange = commit
			input.onblur = commit
			input.onkeydown = function (event) {
				if (event.key !== 'Enter') return
				event.preventDefault()
				commit()
				input.blur()
			}
			wrap.append(input, element('span', 'modloader-panel-settings-unit', t('secondsSuffix')))
			row.appendChild(wrap)
			settingsPage.appendChild(row)
		}
		addSettingsRow(t('themeMode'), [
			{ value: 'dark', label: t('darkMode') },
			{ value: 'light', label: t('lightMode') }
		], state.panelSettings.theme, function (value) { state.panelSettings.theme = value })
		addSettingsRow(t('hideMode'), [
			{ value: 'auto', label: t('autoHide') },
			{ value: 'manual', label: t('manualHide') }
		], state.panelSettings.hideMode, function (value) {
			state.panelSettings.hideMode = value
			if (value === 'manual') {
				state.panelHidden = false
				clearPanelAutoHideTimer()
			}
		})
		const addSettingsButtonRow = function (label, buttons) {
			const row = element('div', 'modloader-panel-settings-row')
			row.appendChild(element('span', '', label))
			const actions = element('span', 'modloader-panel-settings-actions')
			for (const options of buttons || []) {
				const button = createPanelActionButton(options.icon || 'translation', options.label, options.title)
				button.disabled = !getModFileTools()
				button.onclick = async function (event) {
					event.preventDefault()
					try {
						const result = await options.action()
						if (result?.message) state.panelMessage = result.message
					} catch (error) {
						state.panelMessage = t('translationFileFailed', { value: error.message })
					}
					renderPanel()
				}
				actions.appendChild(button)
			}
			row.appendChild(actions)
			settingsPage.appendChild(row)
		}
		addSettingsNumberRow(t('autoHideDelay'), state.panelSettings.autoHideSeconds, function (value) {
			state.panelSettings.autoHideSeconds = value
		})
		addSettingsRow(t('hideMenuDetails'), [
			{ value: false, label: t('show') },
			{ value: true, label: t('hide') }
		], state.panelSettings.hideMenuDetails, function (value) { state.panelSettings.hideMenuDetails = value })
		addSettingsRow(t('hideModFileDetails'), [
			{ value: false, label: t('show') },
			{ value: true, label: t('hide') }
		], state.panelSettings.hideModFileDetails, function (value) { state.panelSettings.hideModFileDetails = value })
		addSettingsRow(t('configSectionSorting'), [
			{ value: true, label: t('configSectionSortingOn') },
			{ value: false, label: t('configSectionSortingOff') }
		], state.panelSettings.sortConfigSections !== false, function (value) { state.panelSettings.sortConfigSections = value !== false })
		addSettingsRow(t('renderApi'), [
			{ value: true, label: t('renderApiOn') },
			{ value: false, label: t('renderApiOff') }
		], isRenderApiEnabled(), function (value) { setRenderApiEnabled(value !== false) })
		addSettingsButtonRow(t('translationFile'), [
			{
				icon: 'translation',
				label: t('translationFile'),
				title: t('translationFileTitle'),
				async action() {
					const availableMods = readAvailableMods().mods
					const result = syncTranslationCatalogFile(availableMods)
					await openTranslationCatalogFile(result.path)
					return { message: t('translationFileSynced', { path: result.path }) }
				}
			},
			{
				icon: 'export',
				label: t('translationExport'),
				title: t('translationExportTitle'),
				async action() {
					const result = await exportTranslationCatalogFile(panel)
					return result ? { message: t('translationExported', { path: result.path }) } : null
				}
			},
			{
				icon: 'import',
				label: t('translationImport'),
				title: t('translationImportTitle'),
				async action() {
					const result = await importTranslationCatalogFile(panel)
					return result ? { message: formatTranslationImportResultMessage(result) } : null
				}
			}
		])
		panel.appendChild(settingsPage)

		const panelMouseEnter = function () { clearPanelAutoHideTimer() }
		const panelMouseLeave = function () { schedulePanelAutoHide(panel) }
		panel.addEventListener('mouseenter', panelMouseEnter)
		panel.addEventListener('mouseleave', panelMouseLeave)
		addCleanup(function () {
			panel.removeEventListener('mouseenter', panelMouseEnter)
			panel.removeEventListener('mouseleave', panelMouseLeave)
			clearPanelAutoHideTimer()
		})

		if (state.issues.length) {
			const issues = element('ul', 'modloader-panel-issues')
			for (const issue of state.issues) {
				issues.appendChild(element('li', `modloader-panel-issue-${issue.level}`, `${issue.level.toUpperCase()} ${issue.code}: ${issue.message}`))
			}
			panel.appendChild(issues)
		}

		if (!state.panelSettings.hideMenuDetails) {
			const summary = element('div', 'modloader-panel-summary')
			const renderApiDemands = listRenderLayerDemands()
			const renderApiRoutes = listRenderMethodRoutes()
			const renderApiCreatedLayers = listCreatedRenderLayers().map(function (layer) { return layer.id })
			const renderApiCallbacks = listRenderCallbacks()
			const renderApiLayerDemanders = listRenderLayerDemandCallbacks()
			const demandRow = panelRow(t('renderApiLayerDemands'), renderApiDemands.join(', ') || '-')
			const createdLayersRow = panelRow(t('renderApiCreatedLayers'), renderApiCreatedLayers.join(', ') || '-')
			const callbacksRow = panelRow(t('renderApiCallbacks'), renderApiCallbacks.filter(function (entry) { return entry.active }).length + ' / ' + renderApiCallbacks.length)
			const demandersRow = panelRow(t('renderApiLayerDemanders'), renderApiLayerDemanders.filter(function (entry) { return entry.active }).length + ' / ' + renderApiLayerDemanders.length)
			const routesRow = panelRow(t('renderApiMethodRoutes'), renderApiRoutes.map(function (route) { return route.method + ' -> ' + route.layer }).join(', ') || '-')
			const renderApiTiming = getRenderTimingSummary()
			const renderApiTimingParts = []
			if (renderApiTiming.renderloop) renderApiTimingParts.push('renderloop ' + renderApiTiming.renderloop.avgMs + 'ms')
			for (const entry of renderApiTiming.topMethods.slice(0, 3)) renderApiTimingParts.push(entry.method + ' ' + entry.avgMs + 'ms')
			const timingRow = panelRow(t('renderApiTiming'), renderApiTiming.enabled ? (renderApiTimingParts.join(', ') || '-') : t('renderApiOff'))
			demandRow.classList.add('modloader-panel-row-wide')
			createdLayersRow.classList.add('modloader-panel-row-wide')
			routesRow.classList.add('modloader-panel-row-wide')
			timingRow.classList.add('modloader-panel-row-wide')
			summary.appendChild(panelRow(t('installedMods'), String(mods.length)))
			summary.appendChild(panelRow(t('enabledEntries'), String(state.enabledEntries.length)))
			summary.appendChild(panelRow(t('loadedMods'), String(state.mods.length)))
			summary.appendChild(panelRow(t('issues'), String(state.issues.length)))
			summary.appendChild(panelRow(t('dataPatches'), String(state.dataPatches.length)))
			summary.appendChild(panelRow(t('wordPatches'), String(state.wordPatches.length)))
			summary.appendChild(panelRow(t('registeredLanguages'), state.languages.join(', ') || '-'))
			summary.appendChild(panelRow(t('orphanEntities'), String(state.orphanEntities.length)))
			summary.appendChild(panelRow(t('renderApi'), isRenderApiEnabled() ? t('renderApiOn') : t('renderApiOff')))
			summary.appendChild(demandRow)
			summary.appendChild(createdLayersRow)
			summary.appendChild(callbacksRow)
			summary.appendChild(demandersRow)
			summary.appendChild(routesRow)
			summary.appendChild(timingRow)
			panel.appendChild(summary)
		}

		panel.appendChild(element('h3', '', t('modManager')))
		if (available.errorMessage) panel.appendChild(element('div', 'modloader-panel-error', available.errorMessage))

		const toolbar = element('div', 'modloader-mod-toolbar')
		const note = element('span', 'modloader-panel-note', t('toggleNote'))
		const reloadNote = element('span', 'modloader-panel-reload-note', t('changesRequireReload'))
		const configNote = element('span', 'modloader-panel-config-note', t('configSaveNote'))
		const message = element('span', 'modloader-panel-note', '')
		const save = element('button', 'modloader-save-button', t('saveReload'))
		const cancelChanges = element('button', 'modloader-action-button modloader-cancel-button', t('cancel'))
		cancelChanges.type = 'button'
		cancelChanges.title = t('cancel')
		cancelChanges.setAttribute('aria-label', t('cancel'))
		const insert = createPanelActionButton('plus', t('insert'), t('insert'))
		const folder = createPanelActionButton('folder', t('folder'), t('folder'))
		save.disabled = true
		cancelChanges.disabled = true
		insert.disabled = !getModFileTools()
		folder.disabled = !getModFileTools()
		const left = element('span', 'modloader-toolbar-left')
		const actions = element('span', 'modloader-toolbar-actions')
		const selectAllWrap = element('label', 'modloader-select-all-control')
		const selectAll = element('input', 'modloader-select-all modloader-switch-input')
		selectAll.type = 'checkbox'
		selectAll.setAttribute('role', 'switch')
		selectAll.setAttribute('aria-label', t('selectAll'))
		selectAllWrap.append(selectAll, element('span', 'modloader-select-all-text', t('selectAll')))
		left.append(selectAllWrap, note, document.createTextNode(' '), reloadNote, document.createTextNode(' '), configNote, document.createTextNode(' '), message)
		actions.append(cancelChanges, insert, folder, save)
		toolbar.append(left, actions)
		panel.appendChild(toolbar)

		const list = element('div', 'modloader-mod-manager')
		panel.appendChild(list)
		const importZone = element('div', 'modloader-import-zone')
		importZone.tabIndex = 0
		const importCopy = element('div', 'modloader-import-copy')
		importCopy.appendChild(element('div', 'modloader-import-title', t('importHint')))
		importCopy.appendChild(element('div', 'modloader-import-detail', t('importDetail')))
		const importStatus = element('div', 'modloader-import-status', t('importWaiting'))
		importCopy.appendChild(importStatus)
		importZone.appendChild(importCopy)
		panel.appendChild(importZone)

		let expandedRow = null
		let configAnimating = false
		let configAnimationTimer = null
		let importMode = false
		let listOrderDirty = !sameStringList(getOrderedSelectedPaths(mods, selected, true), originalSelected)

		const isModRowToggleTarget = function (target) {
			return target?.closest && !target.closest('input, textarea, select, button, .modloader-mod-config')
		}

		const restoreRowPosition = function (rowModel) {
			const index = rowModels.indexOf(rowModel)
			let before = null
			for (let i = index + 1; i < rowModels.length; i++) {
				if (rowModels[i].container.parentNode === list) {
					before = rowModels[i].container
					break
				}
			}
			list.insertBefore(rowModel.container, before)
		}

		const animateRowMove = function (row, mutate, done) {
			const first = row.getBoundingClientRect()
			mutate()
			const last = row.getBoundingClientRect()
			const dx = first.left - last.left
			const dy = first.top - last.top
			if (!dx && !dy) {
				if (done) done()
				return
			}
			row.classList.add('modloader-mod-row-moving')
			row.style.transition = 'none'
			row.style.transform = `translate(${dx}px, ${dy}px)`
			row.getBoundingClientRect()
			row.style.transition = 'transform .34s cubic-bezier(.16, .88, .2, 1)'
			row.style.transform = ''
			let finished = false
			let fallbackTimer = null
			const cleanup = function (event) {
				if (event && event.target !== row) return
				if (finished) return
				finished = true
				if (fallbackTimer) clearTimeout(fallbackTimer)
				row.removeEventListener('transitionend', cleanup)
				row.classList.remove('modloader-mod-row-moving')
				row.style.transition = ''
				row.style.transform = ''
				if (done) done()
			}
			row.addEventListener('transitionend', cleanup)
			fallbackTimer = setTimeout(cleanup, 430)
		}

		const collapseConfigRow = function (rowModel, moveBack) {
			if (!rowModel || !rowModel.configModels.length || configAnimating) return
			if (configAnimationTimer) clearTimeout(configAnimationTimer)
			rowModel.container.classList.remove('modloader-mod-row-expanded')
			expandedRow = expandedRow === rowModel ? null : expandedRow
			if (!moveBack) {
				restoreRowPosition(rowModel)
				return
			}
			configAnimating = true
			configAnimationTimer = setTimeout(function () {
				configAnimationTimer = null
				animateRowMove(rowModel.container, function () {
					restoreRowPosition(rowModel)
					list.scrollTop = rowModel.configScrollTop || 0
				}, function () { configAnimating = false })
			}, 340)
		}

		const expandConfigRow = function (rowModel) {
			if (!rowModel || !rowModel.configModels.length || configAnimating) return
			if (expandedRow && expandedRow !== rowModel) collapseConfigRow(expandedRow, false)
			expandedRow = rowModel
			rowModel.configScrollTop = list.scrollTop
			configAnimating = true
			animateRowMove(rowModel.container, function () {
				list.insertBefore(rowModel.container, list.firstChild)
				list.scrollTop = 0
			}, function () {
				rowModel.container.classList.add('modloader-mod-row-expanded')
				configAnimating = false
			})
		}

		const toggleConfigRow = function (rowModel) {
			if (configAnimating) return
			if (expandedRow === rowModel) collapseConfigRow(rowModel, true)
			else expandConfigRow(rowModel)
		}

		const getCurrentSelectedPaths = function () {
			return getOrderedSelectedPaths(mods, selected, listOrderDirty)
		}

		const syncModOrderFromRows = function () {
			mods.length = 0
			state.panelModOrder = []
			for (let i = 0; i < rowModels.length; i++) {
				const rowModel = rowModels[i]
				mods.push(rowModel.mod)
				state.panelModOrder.push(rowModel.mod.path)
				if (rowModel.index) rowModel.index.textContent = String(i + 1)
			}
		}

		const resetConfigModels = function () {
			for (const model of configModels) {
				model.value = cloneConfigValue(model.initial)
				model.invalid = false
				if (model.error) {
					model.error.textContent = ''
					model.error.classList.remove('active')
				}
				if (model.container) model.container.classList.remove('modloader-config-field-invalid')
				dispatchConfigPreview(model)
			}
		}

		const resetUnsavedChanges = function () {
			if (configAnimationTimer) {
				clearTimeout(configAnimationTimer)
				configAnimationTimer = null
			}
			configAnimating = false
			if (expandedRow) collapseConfigRow(expandedRow, false)
			if (importMode) setImportMode(false)
			selected.clear()
			for (const path of originalSelected) selected.add(path)
			resetConfigModels()
			state.panelModOrder = originalPanelModOrder.slice()
			state.panelConfigSectionOrder = clonePanelConfigSectionOrder(originalPanelConfigSectionOrder)
			listOrderDirty = !sameStringList(getOrderedSelectedPaths(mods, selected, true), originalSelected)
			state.panelMessage = t('changesCanceled')
			savePanelState()
			renderPanel()
		}

		const captureSortRects = function (draggedRow) {
			const rects = new Map()
			for (const rowModel of rowModels) {
				const row = rowModel.container
				if (row === draggedRow || row.parentNode !== list) continue
				rects.set(row, row.getBoundingClientRect())
			}
			return rects
		}

		const animateSortRowsFromRects = function (firstRects) {
			for (const rowModel of rowModels) {
				const row = rowModel.container
				const first = firstRects.get(row)
				if (!first || row.parentNode !== list) continue
				const last = row.getBoundingClientRect()
				const dx = first.left - last.left
				const dy = first.top - last.top
				if (!dx && !dy) continue
				row.classList.add('modloader-mod-row-moving')
				row.style.transition = 'none'
				row.style.transform = `translate(${dx}px, ${dy}px)`
				row.getBoundingClientRect()
				row.style.transition = 'transform .18s cubic-bezier(.2, .8, .2, 1)'
				row.style.transform = ''
				setTimeout(function () {
					row.classList.remove('modloader-mod-row-moving')
					row.style.transition = ''
					row.style.transform = ''
				}, 220)
			}
		}

		const getSortBeforeNode = function (clientY, draggedRow, placeholder) {
			const rows = rowModels.map(function (rowModel) { return rowModel.container }).filter(function (row) {
				return row.parentNode === list && row !== draggedRow && row !== placeholder
			})
			for (const row of rows) {
				const rect = row.getBoundingClientRect()
				if (clientY < rect.top + rect.height / 2) return row
			}
			return null
		}

		const updateSortPlaceholder = function (placeholder, beforeNode, draggedRow) {
			if (beforeNode === placeholder.nextSibling) return
			const firstRects = captureSortRects(draggedRow)
			list.insertBefore(placeholder, beforeNode)
			animateSortRowsFromRects(firstRects)
		}

		const animateSortDrop = function (row, floatingRect) {
			const finalRect = row.getBoundingClientRect()
			if (!finalRect.width || !finalRect.height) return
			const floatingCenterX = floatingRect.left + floatingRect.width / 2
			const floatingCenterY = floatingRect.top + floatingRect.height / 2
			const finalCenterX = finalRect.left + finalRect.width / 2
			const finalCenterY = finalRect.top + finalRect.height / 2
			const dx = floatingCenterX - finalCenterX
			const dy = floatingCenterY - finalCenterY
			const scaleX = Math.max(.01, floatingRect.width / finalRect.width)
			const scaleY = Math.max(.01, floatingRect.height / finalRect.height)
			row.classList.add('modloader-mod-row-dropping')
			row.style.transition = 'none'
			row.style.transformOrigin = 'center center'
			row.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})`
			row.getBoundingClientRect()
			row.style.transition = 'transform .22s cubic-bezier(.18, .86, .2, 1)'
			row.style.transform = ''
			let finished = false
			let fallbackTimer = null
			const cleanup = function (event) {
				if (event && event.target !== row) return
				if (finished) return
				finished = true
				if (fallbackTimer) clearTimeout(fallbackTimer)
				row.removeEventListener('transitionend', cleanup)
				row.classList.remove('modloader-mod-row-dropping')
				row.style.transition = ''
				row.style.transform = ''
				row.style.transformOrigin = ''
			}
			row.addEventListener('transitionend', cleanup)
			fallbackTimer = setTimeout(cleanup, 300)
		}


		const finishSortDrag = function (rowModel, placeholder, moved) {
			const row = rowModel.container
			const floatingRect = row.getBoundingClientRect()
			const firstRects = captureSortRects(row)
			const beforeNode = placeholder.parentNode === list ? placeholder : null
			if (beforeNode) list.insertBefore(row, beforeNode)
			if (placeholder.parentNode) placeholder.remove()
			row.classList.remove('modloader-mod-row-dragging', 'modloader-mod-row-lifting')
			row.style.position = ''
			row.style.left = ''
			row.style.top = ''
			row.style.width = ''
			row.style.height = ''
			row.style.transform = ''
			row.style.transition = ''
			animateSortDrop(row, floatingRect)
			animateSortRowsFromRects(firstRects)
			if (!moved) return
			const ordered = []
			for (const child of Array.from(list.children)) {
				if (child.__modloaderRowModel) ordered.push(child.__modloaderRowModel)
			}
			if (ordered.length === rowModels.length) {
				rowModels.length = 0
				rowModels.push(...ordered)
				syncModOrderFromRows()
				listOrderDirty = true
				savePanelState()
				refreshRows()
			}
		}

		const installSortDrag = function (rowModel, handle) {
			let moveHandler = null
			let upHandler = null
			let placeholder = null
			let moved = false
			let startX = 0
			let startY = 0
			let offsetX = 0
			let offsetY = 0
			const clearDrag = function () {
				if (moveHandler) document.removeEventListener('pointermove', moveHandler, true)
				if (upHandler) document.removeEventListener('pointerup', upHandler, true)
				moveHandler = null
				upHandler = null
			}
			handle.addEventListener('pointerdown', function (event) {
				if (event.button !== undefined && event.button !== 0) return
				if (configAnimating || importMode) return
				if (expandedRow) collapseConfigRow(expandedRow, false)
				const row = rowModel.container
				const rect = row.getBoundingClientRect()
				startX = event.clientX
				startY = event.clientY
				offsetX = event.clientX - rect.left
				offsetY = event.clientY - rect.top
				moved = false
				placeholder = element('div', 'modloader-mod-sort-placeholder')
				const targetPlaceholderHeight = Math.max(24, Math.round(rect.height * .55))
				placeholder.style.height = Math.round(rect.height) + 'px'
				list.insertBefore(placeholder, row)
				requestAnimationFrame(function () {
					if (placeholder?.parentNode) placeholder.style.height = targetPlaceholderHeight + 'px'
				})
				row.classList.remove('modloader-mod-row-dropping', 'modloader-mod-row-lifting')
				row.classList.add('modloader-mod-row-dragging')
				row.style.position = 'fixed'
				const dragScale = 1.1
				const scaledWidth = rect.width * dragScale
				const scaledHeight = rect.height * dragScale
				const dragCenterOffsetY = event.clientY - (rect.top + rect.height / 2)
				const updateDraggedRowPosition = function (clientY) {
					const centerY = clientY - dragCenterOffsetY
					row.style.top = Math.round(centerY - scaledHeight / 2) + 'px'
				}
				const rowStyle = window.getComputedStyle(row)
				const horizontalFrame = parseFloat(rowStyle.paddingLeft) + parseFloat(rowStyle.paddingRight) + parseFloat(rowStyle.borderLeftWidth) + parseFloat(rowStyle.borderRightWidth)
				const verticalFrame = parseFloat(rowStyle.paddingTop) + parseFloat(rowStyle.paddingBottom) + parseFloat(rowStyle.borderTopWidth) + parseFloat(rowStyle.borderBottomWidth)
				row.style.left = Math.round(rect.left - (scaledWidth - rect.width) / 2) + 'px'
				row.style.width = Math.max(0, Math.round(scaledWidth - horizontalFrame)) + 'px'
				row.style.height = Math.max(0, Math.round(scaledHeight - verticalFrame)) + 'px'
				row.style.transformOrigin = 'center center'
				row.style.transition = 'none'
				row.style.transform = `scale(${(1 / dragScale).toFixed(4)})`
				panel.appendChild(row)
				updateDraggedRowPosition(event.clientY)
				row.getBoundingClientRect()
				row.style.transition = 'transform .18s cubic-bezier(.16, .86, .22, 1)'
				row.style.transform = ''
				event.preventDefault()
				event.stopPropagation()
				moveHandler = function (moveEvent) {
					moveEvent.preventDefault()
					const dx = moveEvent.clientX - startX
					const dy = moveEvent.clientY - startY
					if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
					updateDraggedRowPosition(moveEvent.clientY)
					const listRect = list.getBoundingClientRect()
					if (moveEvent.clientY < listRect.top + 28) list.scrollTop -= 12
					else if (moveEvent.clientY > listRect.bottom - 28) list.scrollTop += 12
					updateSortPlaceholder(placeholder, getSortBeforeNode(moveEvent.clientY, row, placeholder), row)
				}
				upHandler = function () {
					finishSortDrag(rowModel, placeholder, moved)
					clearDrag()
				}
				document.addEventListener('pointermove', moveHandler, true)
				document.addEventListener('pointerup', upHandler, true)
			}, true)
			addCleanup(function () {
				if (placeholder?.parentNode) finishSortDrag(rowModel, placeholder, false)
				clearDrag()
			})
		}

		const captureConfigSectionRects = function (rowModel, draggedSection) {
			const rects = new Map()
			for (const sectionModel of rowModel.sectionModels || []) {
				const section = sectionModel.container
				if (section === draggedSection || section.parentNode !== rowModel.configScroll) continue
				rects.set(section, section.getBoundingClientRect())
			}
			return rects
		}

		const animateConfigSectionsFromRects = function (rowModel, firstRects) {
			for (const sectionModel of rowModel.sectionModels || []) {
				const section = sectionModel.container
				const first = firstRects.get(section)
				if (!first || section.parentNode !== rowModel.configScroll) continue
				const last = section.getBoundingClientRect()
				const dx = first.left - last.left
				const dy = first.top - last.top
				if (!dx && !dy) continue
				section.classList.add('modloader-config-section-moving')
				section.style.transition = 'none'
				section.style.transform = `translate(${dx}px, ${dy}px)`
				section.getBoundingClientRect()
				section.style.transition = 'transform .18s cubic-bezier(.2, .8, .2, 1)'
				section.style.transform = ''
				setTimeout(function () {
					section.classList.remove('modloader-config-section-moving')
					section.style.transition = ''
					section.style.transform = ''
				}, 220)
			}
		}

		const getConfigSectionBeforeNode = function (rowModel, clientY, draggedSection, placeholder) {
			const sections = (rowModel.sectionModels || []).map(function (sectionModel) { return sectionModel.container }).filter(function (section) {
				return section.parentNode === rowModel.configScroll && section !== draggedSection && section !== placeholder
			})
			for (const section of sections) {
				const rect = section.getBoundingClientRect()
				if (clientY < rect.top + rect.height / 2) return section
			}
			return null
		}

		const updateConfigSectionPlaceholder = function (rowModel, placeholder, beforeNode, draggedSection) {
			if (beforeNode === placeholder.nextSibling) return
			const firstRects = captureConfigSectionRects(rowModel, draggedSection)
			rowModel.configScroll.insertBefore(placeholder, beforeNode)
			animateConfigSectionsFromRects(rowModel, firstRects)
		}

		const finishConfigSectionSortDrag = function (rowModel, sectionModel, placeholder, moved) {
			const section = sectionModel.container
			const beforeNode = placeholder.parentNode === rowModel.configScroll ? placeholder : null
			if (beforeNode) rowModel.configScroll.insertBefore(section, beforeNode)
			if (placeholder.parentNode) placeholder.remove()
			section.classList.remove('modloader-config-section-dragging')
			section.style.position = ''
			section.style.left = ''
			section.style.top = ''
			section.style.width = ''
			section.style.height = ''
			section.style.transform = ''
			section.style.transition = ''
			if (!moved) return
			const ordered = []
			for (const child of Array.from(rowModel.configScroll.children)) {
				if (child.__modloaderConfigSectionModel) ordered.push(child.__modloaderConfigSectionModel)
			}
			if (ordered.length === rowModel.sectionModels.length) {
				rowModel.sectionModels.length = 0
				rowModel.sectionModels.push(...ordered)
				syncPanelConfigSectionOrderForMod(rowModel.mod, rowModel.sectionModels)
				savePanelState()
				refreshRows(true)
			}
		}

		const installConfigSectionSortDrag = function (rowModel, sectionModel, handle) {
			if (!handle) return
			let moveHandler = null
			let upHandler = null
			let placeholder = null
			let moved = false
			let startX = 0
			let startY = 0
			let offsetY = 0
			const clearDrag = function () {
				if (moveHandler) document.removeEventListener('pointermove', moveHandler, true)
				if (upHandler) document.removeEventListener('pointerup', upHandler, true)
				moveHandler = null
				upHandler = null
			}
			handle.addEventListener('pointerdown', function (event) {
				if (event.button !== undefined && event.button !== 0) return
				if (configAnimating || importMode) return
				const section = sectionModel.container
				const rect = section.getBoundingClientRect()
				startX = event.clientX
				startY = event.clientY
				offsetY = event.clientY - rect.top
				moved = false
				placeholder = element('div', 'modloader-config-section-placeholder')
				placeholder.style.height = Math.max(20, Math.round(rect.height * .55)) + 'px'
				rowModel.configScroll.insertBefore(placeholder, section)
				section.classList.add('modloader-config-section-dragging')
				section.style.position = 'fixed'
				const updateDraggedSectionPosition = function (clientY) {
					section.style.top = Math.round(clientY - offsetY) + 'px'
				}
				const sectionStyle = window.getComputedStyle(section)
				const horizontalFrame = parseFloat(sectionStyle.paddingLeft) + parseFloat(sectionStyle.paddingRight) + parseFloat(sectionStyle.borderLeftWidth) + parseFloat(sectionStyle.borderRightWidth)
				section.style.left = Math.round(rect.left) + 'px'
				section.style.width = Math.max(0, Math.round(rect.width - horizontalFrame)) + 'px'
				panel.appendChild(section)
				updateDraggedSectionPosition(event.clientY)
				event.preventDefault()
				event.stopPropagation()
				moveHandler = function (moveEvent) {
					moveEvent.preventDefault()
					const dx = moveEvent.clientX - startX
					const dy = moveEvent.clientY - startY
					if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
					updateDraggedSectionPosition(moveEvent.clientY)
					const scrollRect = rowModel.configScroll.getBoundingClientRect()
					if (moveEvent.clientY < scrollRect.top + 24) rowModel.configScroll.scrollTop -= 10
					else if (moveEvent.clientY > scrollRect.bottom - 24) rowModel.configScroll.scrollTop += 10
					updateConfigSectionPlaceholder(rowModel, placeholder, getConfigSectionBeforeNode(rowModel, moveEvent.clientY, section, placeholder), section)
				}
				upHandler = function () {
					finishConfigSectionSortDrag(rowModel, sectionModel, placeholder, moved)
					clearDrag()
				}
				document.addEventListener('pointermove', moveHandler, true)
				document.addEventListener('pointerup', upHandler, true)
			}, true)
			addCleanup(function () {
				if (placeholder?.parentNode) finishConfigSectionSortDrag(rowModel, sectionModel, placeholder, false)
				clearDrag()
			})
		}

		const getSelectableMods = function () {
			return mods.filter(function (mod) { return !mod.loadError || selected.has(mod.path) })
		}

		const syncSelectAllSwitch = function () {
			const selectable = getSelectableMods()
			const checked = !!selectable.length && selectable.every(function (mod) { return selected.has(mod.path) })
			selectAll.disabled = !selectable.length
			selectAll.checked = checked
			selectAll.setAttribute('aria-checked', checked ? 'true' : 'false')
		}

		selectAll.onchange = function () {
			if (selectAll.checked) {
				for (const mod of getSelectableMods()) selected.add(mod.path)
			} else {
				for (const mod of mods) selected.delete(mod.path)
			}
			refreshRows()
		}

		const setImportMode = function (active) {
			importMode = active
			list.classList.toggle('modloader-mod-manager-importing', active)
			importZone.classList.toggle('active', active)
			insert.classList.toggle('active', active)
			insert.title = active ? t('importModeOff') : t('insert')
			if (active) {
				importStatus.textContent = t('importWaiting')
				importZone.focus()
			}
		}


		const importZipPath = async function (zipPath) {
			if (!zipPath) {
				importStatus.textContent = t('importNoPath')
				return
			}
			let plan = null
			try {
				importStatus.textContent = t('importing', { name: zipPath.split(/[\\/]/).pop() || zipPath })
				plan = prepareZipImport(zipPath)
				let replace = false
				let replacePath = ''
				const tools = getModFileTools()
				if (tools.fs.existsSync(plan.destDir)) {
					replace = await showPanelConfirm(panel, {
						title: t('replaceTitle'),
						message: t('replaceMessage', { name: plan.folderName }),
						confirmText: t('replaceConfirm'),
						cancelText: t('cancel'),
						danger: true
					})
					if (!replace) {
						tools.fs.rmSync(plan.tempDir, { recursive: true, force: true })
						importStatus.textContent = t('importWaiting')
						return
					}
				} else {
					const identityMatch = findImportIdentityMatch(plan.manifest, plan.folderName, mods)
					if (identityMatch) {
						const choice = await showPanelChoice(panel, {
							title: identityMatch.type === 'unique' ? t('replaceRenamedUniqueTitle') : t('replaceRenamedPreviousTitle'),
							message: t(identityMatch.type === 'unique' ? 'replaceRenamedUniqueMessage' : 'replaceRenamedPreviousMessage', {
								oldName: identityMatch.mod.path,
								newName: plan.folderName
							}),
							choices: [
								{ value: 'replace', text: t('replaceOld'), primary: true, danger: true, focus: true },
								{ value: 'keep', text: t('keepImported') },
								{ value: 'cancel', text: t('cancel') }
							]
						})
						if (choice === 'cancel') {
							tools.fs.rmSync(plan.tempDir, { recursive: true, force: true })
							importStatus.textContent = t('importWaiting')
							return
						}
						if (choice === 'replace') {
							replace = true
							replacePath = identityMatch.mod.path
						} else if (identityMatch.type === 'unique') {
							const updatedCode = await showPanelTextPrompt(panel, {
								title: t('uniqueCodeEditTitle'),
								message: t('uniqueCodeEditMessage'),
								label: t('uniqueCodeLabel'),
								value: getModUniqueCode(plan.manifest),
								confirmText: t('uniqueCodeConfirm'),
								skipText: t('uniqueCodeSkip')
							})
							if (updatedCode !== null) {
								setModUniqueCode(plan.manifest, updatedCode)
								writeManifestToDirectory(plan.sourceDir, plan.manifest)
							}
						}
					}
				}
				const imported = completeZipImport(plan, { replace, replacePath })
				if (replace && imported) {
					importStatus.textContent = t('savedReloading')
					location.reload()
					return
				}
				state.panelMessage = t('importedMod', { name: plan.folderName })
				renderPanel()
			} catch (error) {
				try {
					const tools = getModFileTools()
					if (plan?.tempDir && tools?.fs.existsSync(plan.tempDir)) tools.fs.rmSync(plan.tempDir, { recursive: true, force: true })
				} catch (cleanupError) {}
				importStatus.textContent = t('importFailed', { value: error.message })
			}
		}

		const refreshRows = function (keepMessage) {
			const refs = new Set()
			for (const mod of mods) {
				if (!selected.has(mod.path)) continue
				refs.add(mod.path)
				refs.add(mod.id)
			}

			let configDirty = false
			let configReloadDirty = false
			let configInvalid = false
			for (const row of rowModels) {
				const mod = row.mod
				const checked = selected.has(mod.path)
				row.checkbox.checked = checked
				row.container.classList.toggle('modloader-mod-row-selected', checked)
				for (const model of row.configModels) {
					const disabled = !checked || !!mod.loadError
					model.input.disabled = disabled
					model.container.classList.toggle('modloader-config-field-disabled', disabled)
					if (disabled) continue
					if (model.invalid) configInvalid = true
					if (!sameConfigValue(model.value, model.initial)) {
						configDirty = true
						if (configChangeRequiresReload(model)) configReloadDirty = true
					}
				}
				const warnings = []
				if (mod.loadError) warnings.push(mod.loadError)
				if (checked) {
					const missing = resolveModRefs(mod.manifest.dependencies).filter(function (ref) { return !refs.has(ref) })
					const conflicts = resolveModRefs(mod.manifest.conflicts).filter(function (ref) { return refs.has(ref) })
					if (missing.length) warnings.push(t('missingDependencies', { value: missing.join(', ') }))
					if (conflicts.length) warnings.push(t('conflictsEnabled', { value: conflicts.join(', ') }))
				}
				row.warning.textContent = warnings.join(' | ')
				row.warning.classList.toggle('active', warnings.length > 0)
				row.container.classList.toggle('modloader-mod-row-problem', warnings.length > 0)
			}

			syncSelectAllSwitch()

			const orderedSelected = getCurrentSelectedPaths()
			const enabledDirty = !sameStringList(orderedSelected, originalSelected)
			const modOrderDirty = !sameStringList(state.panelModOrder, originalPanelModOrder)
			const sectionOrderDirty = state.panelSettings.sortConfigSections !== false && !samePanelConfigSectionOrder(state.panelConfigSectionOrder, originalPanelConfigSectionOrder)
			const orderDirty = modOrderDirty || sectionOrderDirty
			const reloadDirty = enabledDirty || configReloadDirty
			reloadNote.classList.toggle('active', reloadDirty)
			configNote.classList.toggle('active', configDirty && !configReloadDirty)
			save.textContent = reloadDirty ? t('saveReload') : t('saveConfig')
			save.disabled = (!enabledDirty && !configDirty) || configInvalid || (enabledDirty && !getModFileTools())
			cancelChanges.disabled = !enabledDirty && !configDirty && !configInvalid && !orderDirty && !importMode
			if (!keepMessage) message.textContent = ''
		}

		let modOrdinal = 0
		for (const mod of mods) {
			modOrdinal++
			const row = element('div', 'modloader-mod-row')
			const checkbox = element('input', 'modloader-mod-check modloader-switch-input')
			checkbox.type = 'checkbox'
			checkbox.setAttribute('role', 'switch')
			const localizedModName = getLocalizedModName(mod) || mod.path
			const localizedModDescription = getLocalizedModDescription(mod)
			checkbox.setAttribute('aria-label', 'Enable ' + localizedModName)
			checkbox.checked = selected.has(mod.path)
			checkbox.disabled = !!mod.loadError && !checkbox.checked
			checkbox.onchange = function () {
				if (checkbox.checked) selected.add(mod.path)
				else selected.delete(mod.path)
				refreshRows()
			}

			const main = element('div', 'modloader-mod-main')
			const title = element('div', 'modloader-mod-title')
			title.appendChild(element('span', 'modloader-mod-path', localizedModName))
			if (localizedModDescription) title.title = localizedModDescription
			if (mod.manifest.version) title.appendChild(element('span', 'modloader-mod-version', 'v' + mod.manifest.version))
			if (localizedModName !== mod.path) title.appendChild(element('span', 'modloader-mod-name', mod.path))
			main.appendChild(title)

			const deps = resolveModRefs(mod.manifest.dependencies)
			const conflicts = resolveModRefs(mod.manifest.conflicts)
			const metaParts = [
				t('idPrefix', { value: mod.id || mod.path }),
				getModReloadLabel(mod.manifest)
			]
			const uniqueCode = getModUniqueCode(mod.manifest)
			if (uniqueCode) metaParts.push(t('uniquePrefix', { value: uniqueCode }))
			if (deps.length) metaParts.push(t('depsPrefix', { value: deps.join(', ') }))
			if (conflicts.length) metaParts.push(t('conflictsPrefix', { value: conflicts.join(', ') }))
			if (!state.panelSettings.hideModFileDetails) main.appendChild(element('div', 'modloader-mod-meta', metaParts.join(' | ')))

			const warning = element('div', 'modloader-mod-warning')
			main.appendChild(warning)

			const modConfig = readConfigForPanel(mod)
			const rowConfigModels = []
			const rowSectionModels = []
			let configScroll = null
			if (modConfig.schema.length && !mod.loadError) {
				row.classList.add('modloader-mod-row-configurable')
				const configBox = element('div', 'modloader-mod-config')
				configBox.appendChild(element('div', 'modloader-mod-config-title', t('config')))
				configScroll = element('div', 'modloader-mod-config-scroll')
				configScroll.addEventListener('wheel', function (event) {
					event.stopPropagation()
				}, { passive: true })
				const createConfigField = function (item, target) {
					const type = getConfigType(item)
					const value = modConfig.values[item.key]
					const field = element(type === 'boolean' || isColorPaletteConfigItem(item, type) ? 'div' : 'label', 'modloader-config-field')
					const text = element('span', 'modloader-config-text')
					const localizedConfigLabel = getLocalizedConfigText(mod.manifest, item, 'label', item.key)
					const localizedConfigDescription = getLocalizedConfigText(mod.manifest, item, 'description', '')
					const label = element('span', 'modloader-config-label', localizedConfigLabel || item.key)
					if (localizedConfigDescription) label.title = localizedConfigDescription
					text.appendChild(label)
					if (localizedConfigDescription) text.title = localizedConfigDescription
					const controlLabel = isSliderConfigItem(item, type) && !isSliderConfigType(type) ? ' | slider' : ''
					text.appendChild(element('span', 'modloader-config-meta', item.key + ' | ' + type + controlLabel))
					const input = createConfigInput(item, value, { addCleanup, mod, item, key: item.key })
					const error = element('span', 'modloader-config-error')
					const model = {
						mod,
						item,
						input,
						container: field,
						error,
						initial: cloneConfigValue(value),
						value: cloneConfigValue(value),
						invalid: false
					}
					const updateConfig = function () {
						try {
							model.value = readConfigInputValue(item, input)
							model.invalid = false
							error.textContent = ''
							error.classList.remove('active')
							field.classList.remove('modloader-config-field-invalid')
							dispatchConfigPreview(model)
						} catch (errorValue) {
							model.invalid = true
							error.textContent = errorValue.message
							error.classList.add('active')
							field.classList.add('modloader-config-field-invalid')
						}
						refreshRows()
					}
					input.oninput = updateConfig
					input.onchange = updateConfig
					field.append(text, input, error)
					target.appendChild(field)
					rowConfigModels.push(model)
					configModels.push(model)
					return field
				}
				if (state.panelSettings.sortConfigSections === false) {
					let previousConfigSection = ''
					for (const item of modConfig.schema) {
						const field = createConfigField(item, configScroll)
						const configSection = getConfigSectionId(item)
						if (item.dividerBefore || item.separatorBefore || (configSection && previousConfigSection && configSection !== previousConfigSection)) field.classList.add('modloader-config-section-start')
						previousConfigSection = configSection || ''
					}
				} else {
					const configGroups = buildConfigSectionGroups(mod, modConfig.schema)
					const canSortConfigSections = configGroups.length > 1
					for (const group of configGroups) {
						const section = element('div', 'modloader-config-section')
						const sectionModel = { mod, key: group.key, container: section, handle: null }
						section.__modloaderConfigSectionModel = sectionModel
						if (group.label) {
							const sectionHeader = element('div', 'modloader-config-section-header')
							sectionHeader.appendChild(element('span', 'modloader-config-section-title', group.label))
							if (canSortConfigSections) {
								const sectionSort = element('button', 'modloader-config-section-sort')
								sectionSort.type = 'button'
								sectionSort.title = t('sortConfigSection')
								sectionSort.setAttribute('aria-label', t('sortConfigSection'))
								sectionModel.handle = sectionSort
								sectionHeader.appendChild(sectionSort)
							}
							section.appendChild(sectionHeader)
						} else if (canSortConfigSections) {
							const sectionSort = element('button', 'modloader-config-section-sort modloader-config-section-sort-floating')
							sectionSort.type = 'button'
							sectionSort.title = t('sortConfigSection')
							sectionSort.setAttribute('aria-label', t('sortConfigSection'))
							sectionModel.handle = sectionSort
							section.appendChild(sectionSort)
						}
						const sectionBody = element('div', 'modloader-config-section-body')
						for (const item of group.items) createConfigField(item, sectionBody)
						section.appendChild(sectionBody)
						configScroll.appendChild(section)
						rowSectionModels.push(sectionModel)
					}
				}
				configBox.appendChild(configScroll)
				main.appendChild(configBox)
			}

			const deleteButton = element('button', 'modloader-mod-delete')
			deleteButton.type = 'button'
			deleteButton.title = t('deleteMod')
			deleteButton.setAttribute('aria-label', t('deleteMod'))
			deleteButton.onclick = async function (event) {
				event.preventDefault()
				event.stopPropagation()
				const confirmed = await showPanelConfirm(panel, {
					title: t('deleteTitle'),
					message: t('deleteMessage', { name: mod.path }),
					confirmText: t('deleteConfirm'),
					cancelText: t('cancel'),
					danger: true
				})
				if (!confirmed) return
				try {
					deleteModFolder(mod)
					state.panelMessage = t('deletedMod', { name: mod.path })
					renderPanel()
				} catch (error) {
					message.textContent = t('deleteFailed', { value: error.message })
				}
			}
			const sortButton = element('button', 'modloader-mod-sort')
			sortButton.type = 'button'
			sortButton.title = t('sortMod')
			sortButton.setAttribute('aria-label', t('sortMod'))
			const index = element('span', 'modloader-mod-index', String(modOrdinal))
			const rowActions = element('div', 'modloader-mod-actions')
			rowActions.append(deleteButton, sortButton, index)
			const rowModel = { mod, checkbox, container: row, warning, configModels: rowConfigModels, sectionModels: rowSectionModels, configScroll, index }
			row.__modloaderRowModel = rowModel
			for (const sectionModel of rowSectionModels) {
				sectionModel.rowModel = rowModel
				installConfigSectionSortDrag(rowModel, sectionModel, sectionModel.handle)
			}
			installSortDrag(rowModel, sortButton)
			row.onclick = function (event) {
				if (!rowConfigModels.length || !isModRowToggleTarget(event.target)) return
				toggleConfigRow(rowModel)
			}
			row.append(checkbox, main, rowActions)
			list.appendChild(row)
			rowModels.push(rowModel)
		}

		if (!mods.length) list.appendChild(element('div', 'modloader-panel-note', t('noModsFound')))

		cancelChanges.onclick = function () { resetUnsavedChanges() }
		insert.onclick = function () {
			setImportMode(!importMode)
			refreshRows(true)
		}
		folder.onclick = async function () {
			try {
				await openModsFolder()
				message.textContent = t('folderOpened')
			} catch (error) {
				message.textContent = t('openFolderFailed', { value: error.message })
			}
		}
		importZone.ondragover = function (event) {
			event.preventDefault()
			importZone.classList.add('dragging')
		}
		importZone.ondragleave = function () { importZone.classList.remove('dragging') }
		importZone.ondrop = function (event) {
			event.preventDefault()
			importZone.classList.remove('dragging')
			const zipPath = getZipPathFromFiles(event.dataTransfer?.files)
			if (!zipPath) {
				importStatus.textContent = t('importNoZip')
				return
			}
			importZipPath(zipPath)
		}
		importZone.onpaste = function (event) {
			const zipPath = getZipPathFromClipboardEvent(event)
			if (!zipPath) {
				importStatus.textContent = t('importNoZip')
				return
			}
			event.preventDefault()
			importZipPath(zipPath)
		}
		const importClipboardZip = function (event) {
			const zipPath = getZipPathFromClipboardEvent(event)
			if (!zipPath) {
				importStatus.textContent = t('importNoZip')
				return
			}
			event?.preventDefault?.()
			event?.stopPropagation?.()
			importZipPath(zipPath)
		}
		const documentPasteHandler = function (event) {
			if (!importMode || !document.getElementById('modloader-panel')) return
			importClipboardZip(event)
		}
		const documentKeyHandler = function (event) {
			if (!importMode || !document.getElementById('modloader-panel')) return
			if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'v') return
			importClipboardZip(event)
		}
		document.addEventListener('paste', documentPasteHandler, true)
		document.addEventListener('keydown', documentKeyHandler, true)
		addCleanup(function () {
			document.removeEventListener('paste', documentPasteHandler, true)
			document.removeEventListener('keydown', documentKeyHandler, true)
		})

		save.onclick = function () {
			syncSelectAllSwitch()

			const orderedSelected = getCurrentSelectedPaths()
			const enabledDirty = !sameStringList(orderedSelected, originalSelected)
			const configReloadDirty = hasReloadingConfigChanges(configModels, selected)
			try {
				const configSaved = writeConfigChanges(configModels, selected)
				if (enabledDirty) writeEnabledConfig(orderedSelected)
				if (enabledDirty || configReloadDirty) {
					message.textContent = t('savedReloading')
					location.reload()
				} else {
					message.textContent = configSaved ? t('configSaved') : t('noChanges')
					refreshRows(true)
				}
			} catch (error) {
				message.textContent = t('saveFailed', { value: error.message })
			}
		}

		panel.appendChild(element('h3', '', t('recentLog')))
		const lines = state.log.slice(-12).map(function (entry) {
			return `${entry.level}: ${entry.args.map(function (arg) { return arg instanceof Error ? arg.message : String(arg) }).join(' ')}`
		})
		panel.appendChild(element('pre', 'modloader-panel-log', lines.join('\n') || t('noLogEntries')))

		refreshRows()
		if (state.panelMessage) {
			message.textContent = state.panelMessage
			state.panelMessage = ''
		}
		applyPanelStoredPosition(panel)
		rememberVisiblePanelRestoreTab(panel)
		savePanelState()
	}

	const restorePanelAfterLoad = function () {
		loadPanelState()
		if (!state.panelHidden || !isPanelAutoHideEnabled()) return
		if (!document.body || document.getElementById('modloader-panel')) return
		renderPanel()
	}

	const togglePanel = function () {
		const panel = document.getElementById('modloader-panel')
		if (panel) {
			state.panelHidden = false
			state.panelSettingsOpen = false
			savePanelState({ restoreAsTab: false })
			if (panel.__modloaderCleanup) panel.__modloaderCleanup()
			panel.remove()
		}
		else renderPanel()
	}

	document.addEventListener('keydown', function (event) {
		if (event.key === 'Tab' || event.keyCode === 9) event.preventDefault()
	}, true)

	document.addEventListener('keydown', function (event) {
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'm') {
			event.preventDefault()
			togglePanel()
		}
	})

	const isObject = function (value) {
		return value && typeof value === 'object' && !Array.isArray(value)
	}

	const clone = function (value) {
		if (!isObject(value) && !Array.isArray(value)) return value
		return JSON.parse(JSON.stringify(value))
	}

	const saveSafeText = function (value) {
		return String(value).replace(/[^\x20-\x7e]/g, function (char) {
			return char.split('').map(function (part) { return '\\u' + part.charCodeAt(0).toString(16).padStart(4, '0') }).join('')
		})
	}

	const deepMerge = function (target, patch) {
		if (!isObject(patch)) return target
		for (const key in patch) {
			const value = patch[key]
			if (isObject(value)) {
				if (!isObject(target[key])) target[key] = {}
				deepMerge(target[key], value)
			} else if (Array.isArray(value)) {
				target[key] = value.slice()
			} else {
				target[key] = value
			}
		}
		return target
	}

	const readTextWithXhr = function (url) {
		return new Promise(function (resolve, reject) {
			const request = new XMLHttpRequest()
			request.open('GET', url, true)
			request.onload = function () {
				if (request.status === 0 || (request.status >= 200 && request.status < 300)) resolve(request.responseText)
				else reject(new Error(`${request.status} ${request.statusText}`))
			}
			request.onerror = function () {
				reject(new Error(`Failed to read ${url}`))
			}
			request.send()
		})
	}

	const readText = async function (url) {
		if (window.fetch) {
			try {
				const response = await fetch(url, { cache: 'no-store' })
				if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
				return response.text()
			} catch (error) {
				return readTextWithXhr(url)
			}
		}
		return readTextWithXhr(url)
	}

	const readJson = async function (url, fallback) {
		try {
			const text = await readText(url)
			return JSON.parse(text)
		} catch (error) {
			if (fallback !== undefined) return fallback
			throw error
		}
	}

	const loadScript = function (url) {
		return new Promise(function (resolve, reject) {
			const script = document.createElement('script')
			script.type = 'text/javascript'
			script.src = url
			script.onload = resolve
			script.onerror = function () {
				reject(new Error(`Failed to load script: ${url}`))
			}
			document.head.appendChild(script)
		})
	}

	const normalizeEnabled = function (enabled) {
		const list = Array.isArray(enabled) ? enabled : enabled.mods || []
		return list.map(function (entry) {
			if (typeof entry === 'string') return { path: entry, enabled: true }
			return {
				path: entry.path || entry.id,
				id: entry.id,
				enabled: entry.enabled !== false
			}
		}).filter(function (entry) {
			return entry.enabled && entry.path
		})
	}

	const storageKey = function (modId, key) {
		return `modloader:${modId}:config:${key}`
	}

	const normalizeConfigSchema = function (schema) {
		if (!schema) return []
		if (Array.isArray(schema)) return schema.filter(function (item) { return item && item.key })
		if (isObject(schema)) {
			return Object.keys(schema).map(function (key) {
				const item = isObject(schema[key]) ? clone(schema[key]) : { default: schema[key] }
				item.key = item.key || key
				return item
			})
		}
		return []
	}

	const inferConfigType = function (value) {
		if (Array.isArray(value)) return 'array'
		if (value === null) return 'string'
		return typeof value
	}

	const parseStoredConfig = function (stored, fallback) {
		if (stored === null) return fallback
		try {
			return JSON.parse(stored)
		} catch (error) {
			return stored
		}
	}

	const loadModConfig = function (mod) {
		const schema = normalizeConfigSchema(mod.manifest.config)
		const values = {}
		for (const item of schema) {
			const fallback = item.default
			values[item.key] = parseStoredConfig(localStorage.getItem(storageKey(mod.id, item.key)), fallback)
			item.type = item.type || inferConfigType(fallback)
		}
		state.configs[mod.id] = { schema, values }
	}

	const getConfigValue = function (modId, key, fallback) {
		const config = state.configs[modId]
		if (!config) return fallback
		return config.values[key] === undefined ? fallback : config.values[key]
	}

	const setConfigValue = function (modId, key, value) {
		if (!state.configs[modId]) state.configs[modId] = { schema: [], values: {} }
		state.configs[modId].values[key] = value
		localStorage.setItem(storageKey(modId, key), JSON.stringify(value))
		showStatus()
		return value
	}

	const resolveModRefs = function (value) {
		if (!value) return []
		const list = Array.isArray(value) ? value : [value]
		return list.map(function (entry) {
			if (typeof entry === 'string') return entry
			return entry.id || entry.path || entry.mod || entry.name
		}).filter(Boolean)
	}

	const validateMods = function () {
		const seen = {}
		for (const entry of state.enabledEntries) {
			seen[entry.path] = (seen[entry.path] || 0) + 1
			if (seen[entry.path] > 1) addIssue('warn', 'duplicate-entry', `enabled.json lists ${entry.path} more than once`, entry)
		}

		const seenIds = {}
		for (const mod of state.mods) {
			seenIds[mod.id] = (seenIds[mod.id] || 0) + 1
			if (seenIds[mod.id] > 1) addIssue('error', 'duplicate-mod-id', `multiple enabled mods use id ${mod.id}`, mod.path)
		}

		const hasModRef = function (ref) {
			return !!state.modById[ref] || state.mods.some(function (mod) { return mod.path === ref })
		}

		for (const mod of state.mods) {
			for (const dep of resolveModRefs(mod.manifest.dependencies)) {
				if (!hasModRef(dep)) addIssue('error', 'missing-dependency', `${mod.id} requires ${dep}`, mod.id)
			}
			for (const conflict of resolveModRefs(mod.manifest.conflicts)) {
				if (hasModRef(conflict)) addIssue('error', 'conflict', `${mod.id} conflicts with ${conflict}`, mod.id)
			}
		}
	}

	const resolveList = function (value) {
		if (!value) return []
		if (typeof value === 'string') return [value]
		if (Array.isArray(value)) return value
		if (isObject(value)) return Object.keys(value).map(function (key) { return value[key] })
		return []
	}

	const resolveFileList = function (value) {
		return resolveList(value).filter(function (file) { return typeof file === 'string' && file })
	}

	const getModEntryFiles = function (manifest) {
		const out = []
		for (const value of [ manifest.entry, manifest.entries, manifest.scripts ]) {
			for (const file of resolveFileList(value)) out.push(file)
		}
		return out
	}

	const isJsonEntryFile = function (file) {
		return /\.json$/i.test(file)
	}

	const pushInlinePatch = function (mod, type, patch) {
		if (!isObject(patch)) return false
		const item = { modId: mod.id, patch: clone(patch) }
		if (type === 'data') state.dataPatches.push(item)
		else state.wordPatches.push(item)
		return true
	}

	const applyInlineJsonPatches = function (mod, manifest) {
		if (manifest.words) pushInlinePatch(mod, 'words', manifest.words)
		if (manifest.patches?.words) pushInlinePatch(mod, 'words', manifest.patches.words)
		if (manifest.patches?.data) pushInlinePatch(mod, 'data', manifest.patches.data)
	}

	const loadDeclaredJsonPatches = async function (mod) {
		const localeFiles = resolveFileList(mod.manifest.locale || mod.manifest.locales || mod.manifest.assets?.locale)
		for (const file of localeFiles) {
			const patch = await readJson(`${mod.basePath}${file}`)
			state.wordPatches.push({ modId: mod.id, patch })
		}

		const dataFiles = resolveFileList(mod.manifest.data || mod.manifest.dataPatches || mod.manifest.assets?.data)
		for (const file of dataFiles) {
			const patch = await readJson(`${mod.basePath}${file}`)
			state.dataPatches.push({ modId: mod.id, patch })
		}

		applyInlineJsonPatches(mod, mod.manifest)
	}

	const loadJsonEntry = async function (mod, file) {
		const manifest = await readJson(`${mod.basePath}${file}`)
		if (Array.isArray(manifest.languages)) {
			for (const language of manifest.languages) api.registerLanguage(language)
		}
		const type = String(manifest.type || manifest.kind || '').toLowerCase()
		if ((type === 'data' || type === 'words' || type === 'locale') && pushInlinePatch(mod, type === 'data' ? 'data' : 'words', manifest.patch || manifest.patches?.[type] || manifest.words || manifest.data)) return
		await loadDeclaredJsonPatches({ ...mod, manifest })
	}

	const loadDeclaredJsonEntries = async function (mod) {
		for (const file of getModEntryFiles(mod.manifest).filter(isJsonEntryFile)) {
			try {
				await loadJsonEntry(mod, file)
			} catch (error) {
				addIssue('error', 'json-entry-load-failed', `failed to load ${mod.path}/${file}`, error.message)
				warn(`Failed to load JSON entry for ${mod.id}: ${file}`, error)
			}
		}
	}

	const runHookSync = function (name, payload, context) {
		const hooks = state.hooks[name] || []
		let current = payload
		for (const hook of hooks) {
			try {
				const result = hook.fn(current, context)
				if (result !== undefined) current = result
			} catch (error) {
				warn(`Hook ${name} from ${hook.modId} failed`, error)
			}
		}
		return current
	}

	const modloaderWindowApiState = {
		ipcRenderer: undefined,
		listenerInstalled: false,
		listeners: {}
	}

	const getWindowIpcRenderer = function () {
		if (modloaderWindowApiState.ipcRenderer !== undefined) return modloaderWindowApiState.ipcRenderer
		try {
			if (typeof require !== 'function') {
				modloaderWindowApiState.ipcRenderer = null
				return null
			}
			modloaderWindowApiState.ipcRenderer = require('electron')?.ipcRenderer || null
		} catch (error) {
			modloaderWindowApiState.ipcRenderer = null
		}
		return modloaderWindowApiState.ipcRenderer
	}

	const isWindowApiAvailable = function () {
		const ipcRenderer = getWindowIpcRenderer()
		if (!ipcRenderer) return false
		try {
			return ipcRenderer.sendSync('modloader:window:ping') === 'ok'
		} catch (error) {
			return false
		}
	}

	const normalizeWindowId = function (modId, id) {
		const prefix = String(modId || 'anonymous') + ':'
		let local = String(id || 'window')
		if (local.indexOf(prefix) === 0) local = local.slice(prefix.length)
		local = local.replace(/[^a-zA-Z0-9_.:-]/g, '-').replace(/^-+|-+$/g, '') || 'window'
		return prefix + local
	}

	const ensureWindowApiListener = function () {
		const ipcRenderer = getWindowIpcRenderer()
		if (!ipcRenderer || modloaderWindowApiState.listenerInstalled) return ipcRenderer
		modloaderWindowApiState.listenerInstalled = true
		ipcRenderer.on('modloader:window:message', function (event, message) {
			dispatchWindowEvent(message?.id, message?.type || 'message', message?.payload)
		})
		ipcRenderer.on('modloader:window:closed', function (event, message) {
			dispatchWindowEvent(message?.id, 'closed', null)
			if (message?.id) delete modloaderWindowApiState.listeners[message.id]
		})
		return ipcRenderer
	}

	const addWindowListener = function (id, type, fn) {
		if (!id || typeof fn !== 'function') return function () {}
		const eventType = type || 'message'
		const byId = modloaderWindowApiState.listeners[id] = modloaderWindowApiState.listeners[id] || {}
		const list = byId[eventType] = byId[eventType] || []
		list.push(fn)
		return function () {
			const index = list.indexOf(fn)
			if (index !== -1) list.splice(index, 1)
		}
	}

	const dispatchWindowEvent = function (id, type, payload) {
		if (!id) return
		const byId = modloaderWindowApiState.listeners[id]
		if (!byId) return
		const event = { id, type, payload }
		const lists = []
		if (byId[type]) lists.push(byId[type].slice())
		if (byId['*']) lists.push(byId['*'].slice())
		for (const list of lists) {
			for (const fn of list) {
				try { fn(event) } catch (error) { warn(`Window event ${type} failed for ${id}.`, error) }
			}
		}
	}

	const normalizeWindowOptions = function (options) {
		return {
			anchor: options?.anchor,
			margin: options?.margin,
			hideParent: !!options?.hideParent,
			transparent: options?.transparent,
			frame: options?.frame,
			resizable: options?.resizable,
			movable: options?.movable,
			globalModifierKeys: !!options?.globalModifierKeys,
			alwaysOnTop: options?.alwaysOnTop,
			skipTaskbar: options?.skipTaskbar,
			showInactive: options?.showInactive,
			visibleOnAllWorkspaces: options?.visibleOnAllWorkspaces,
			backgroundColor: options?.backgroundColor,
			minWidth: options?.minWidth,
			minHeight: options?.minHeight
		}
	}

	const createWindowHandle = function (modId, id) {
		return {
			id,
			localId: id.slice((String(modId || 'anonymous') + ':').length),
			on(type, fn) { return addWindowListener(id, type, fn) },
			update(payload, size) {
				const ipcRenderer = getWindowIpcRenderer()
				if (!ipcRenderer) return false
				const envelope = { id }
				if (payload !== undefined) envelope.payload = payload
				if (size !== undefined) envelope.size = size
				ipcRenderer.send('modloader:window:update', envelope)
				return true
			},
			close() {
				const ipcRenderer = getWindowIpcRenderer()
				if (!ipcRenderer) return false
				ipcRenderer.send('modloader:window:close', { id })
				return true
			}
		}
	}

	const createWindowApi = function (modId) {
		return {
			isAvailable: isWindowApiAvailable,
			id(id) { return normalizeWindowId(modId, id) },
			open(options) {
				options = options || {}
				const ipcRenderer = ensureWindowApiListener()
				if (!ipcRenderer || !isWindowApiAvailable()) {
					warn(`Window API is unavailable for ${modId}.`)
					return null
				}
				const id = normalizeWindowId(modId, options.id)
				const handle = createWindowHandle(modId, id)
				if (typeof options.onMessage === 'function') handle.on('message', options.onMessage)
				if (typeof options.onClosed === 'function') handle.on('closed', options.onClosed)
				if (options.on && typeof options.on === 'object') {
					for (const type in options.on) handle.on(type, options.on[type])
				}
				ipcRenderer.send('modloader:window:open', {
					id,
					html: String(options.html || '<!doctype html><body></body>'),
					size: options.size || null,
					payload: options.payload,
					options: normalizeWindowOptions(options)
				})
				return handle
			}
		}
	}
	const api = {
		version: state.version,
		state,
		windows: createWindowApi('ModLoader'),
		ui: createUiApi('ModLoader'),
		render: createRenderApi('ModLoader'),

		async boot() {
			if (state.booted) return state
			state.booted = true

			readTranslationCatalogFromDisk({ silent: true })
			ensureTranslationCatalogWatcher()
			state.enabledConfig = await readJson('mods/enabled.json', { mods: [] })
			state.enabledEntries = normalizeEnabled(state.enabledConfig)
			for (const entry of state.enabledEntries) {
				try {
					const basePath = `mods/${entry.path}/`
					const baseManifest = await readJson(`${basePath}mod.json`)
					const id = baseManifest.id || entry.id || entry.path
					const manifest = applyTranslationCatalogToManifest(clone(baseManifest), id, entry.path)
					const mod = { id, path: entry.path, basePath, manifest, baseManifest: clone(baseManifest), loaded: false }
					state.mods.push(mod)
					if (state.modById[id]) addIssue('error', 'duplicate-mod-id', `multiple enabled mods use id ${id}`, entry.path)
					state.modById[id] = mod
					loadModConfig(mod)
					if (Array.isArray(manifest.languages)) {
						for (const language of manifest.languages) api.registerLanguage(language)
					}
					await loadDeclaredJsonPatches(mod)
					await loadDeclaredJsonEntries(mod)
				} catch (error) {
					addIssue('error', 'manifest-load-failed', `failed to load ${entry.path}/mod.json`, error.message)
					warn(`Failed to load mod at ${entry.path}`, error)
				}
			}
			validateMods()

			info(`Loaded ${state.mods.length} enabled mod manifest(s).`)
			showStatus()
			requestAnimationFrame(restorePanelAfterLoad)
			return state
		},

		async loadEntries() {
			await api.boot()
			for (const mod of state.mods) {
				const scriptEntries = getModEntryFiles(mod.manifest).filter(function (file) { return !isJsonEntryFile(file) })
				if (mod.loaded || !scriptEntries.length) continue
				let failed = false
				try {
					for (const file of scriptEntries) await loadScript(`${mod.basePath}${file}`)
				} catch (error) {
					failed = true
					warn(`Failed to load entry for ${mod.id}`, error)
				}
				mod.loaded = !failed
			}
			showStatus()
		},

		async stage(name, context, payload) {
			if (context?.language) state.game = context
			if (name === 'beforeVanillaScripts') await api.boot()
			if (name === 'afterVanillaScripts') {
				await api.loadEntries()
				if (uiPages.length) ensureUiPagesInstalled()
				installLanguageBridge()
				installGameHud(context)
				installVanillaGameHudSync(context)
			}
			if (name === 'afterGameInit') {
				installGameHud(context)
				installVanillaGameHudSync(context)
				requestAnimationFrame(refreshOpenPanel)
				requestAnimationFrame(restorePanelAfterLoad)
				requestAnimationFrame(syncUiDocks)
				requestAnimationFrame(syncGameHudEntries)
				requestAnimationFrame(function () { syncVanillaGameHudVisibility(context) })
			}

			const hooks = state.hooks[name] || []
			let current = payload
			for (const hook of hooks) {
				try {
					const result = await hook.fn(current, context)
					if (result !== undefined) current = result
				} catch (error) {
					warn(`Hook ${name} from ${hook.modId} failed`, error)
				}
			}
			if (name === 'afterVanillaScripts' || name === 'afterGameInit') installRenderApi(context)
			return current
		},

		on(name, fn, modId) {
			if (!state.hooks[name]) state.hooks[name] = []
			state.hooks[name].push({ modId: modId || 'anonymous', fn })
		},

		register(mod) {
			if (!mod || !mod.id) {
				warn('Ignoring registered mod without an id.')
				return
			}
			if (mod.hooks) {
				for (const name in mod.hooks) api.on(name, mod.hooks[name], mod.id)
			}
			if (typeof mod.init === 'function') mod.init(api.forMod(mod.id))
		},

		forMod(modId) {
			return {
				id: modId,
				on(name, fn) { api.on(name, fn, modId) },
				registerEntity(id, klass, dataEntry) { api.registerEntity(id, klass, dataEntry, modId) },
				registerLanguage(id) { api.registerLanguage(id) },
				patch(target, methodName, wrapper) { return api.patch(target, methodName, wrapper, modId) },
				windows: createWindowApi(modId),
				ui: createUiApi(modId),
				render: createRenderApi(modId),
				asset(path) { return api.asset(modId, path) },
				replaceAsset(from, to) { return api.replaceAsset(from, api.asset(modId, to), modId) },
				registerSound(name, src, options) { return api.registerSound(name, api.asset(modId, src), options, modId) },
				registerMusic(name, src, options) { return api.registerMusic(name, api.asset(modId, src), options, modId) },
				config: {
					get(key, fallback) { return getConfigValue(modId, key, fallback) },
					set(key, value) { return setConfigValue(modId, key, value) },
					all() { return clone(state.configs[modId]?.values || {}) },
					schema() { return clone(state.configs[modId]?.schema || []) }
				},
				deepMerge,
				state
			}
		},

		registerEntity(id, klass, dataEntry, modId) {
			state.entityPatches[id] = { klass, dataEntry: dataEntry || {}, modId: modId || 'anonymous' }
		},

		registerLanguage(id) {
			if (id && state.languages.indexOf(id) === -1) state.languages.push(id)
		},

		applyLanguages(languages) {
			const out = languages.slice()
			for (const id of state.languages) {
				if (out.indexOf(id) === -1) out.push(id)
			}
			return out
		},

		applyData(data, game) {
			for (const item of state.dataPatches) deepMerge(data, item.patch)
			for (const id in state.entityPatches) {
				const entity = state.entityPatches[id]
				data.entities[id] = data.entities[id] || {}
				deepMerge(data.entities[id], entity.dataEntry)
				data.entities[id].class = entity.klass
			}
			return runHookSync('afterData', data, game)
		},

		applyWords(words, game) {
			for (const item of state.wordPatches) deepMerge(words, item.patch)
			return runHookSync('afterWords', words, game)
		},

		applyLoadedSave(save, game) {
			state.orphanEntities = Array.isArray(save?.modloader?.orphanEntities) ? save.modloader.orphanEntities.slice() : []
			return runHookSync('beforeSaveLoad', save, game)
		},

		canLoadEntity(name, game) {
			return !!game?.['co' + 'dex']?.entities?.[name]
		},

		rememberOrphanEntity(entitySave) {
			if (entitySave) state.orphanEntities.push(clone(entitySave))
		},

		applyEntitySave(entitySave, entity, game) {
			return runHookSync('entitySave', entitySave, { entity, game })
		},

		applySave(save, game) {
			save.modloader = save.modloader || {}
			save.modloader.version = state.version
			save.modloader.enabledMods = {}
			for (const mod of state.mods) save.modloader.enabledMods[saveSafeText(mod.id)] = saveSafeText(mod.manifest.version || true)
			if (state.orphanEntities.length) save.modloader.orphanEntities = state.orphanEntities.slice()
			return runHookSync('beforeSaveWrite', save, game)
		},

		showStatus,
		renderPanel,
		togglePanel,
		hideGameHud(options) { return setGameHudHidden(true, options) },
		showGameHud(options) { return setGameHudHidden(false, options) },
		toggleGameHud(options) { return toggleGameHudHidden(options) },
		isGameHudHidden() { return !!state.gameHudHidden },
		getConfigValue,
		setConfigValue,

		asset(modId, path) {
			const mod = state.modById[modId]
			if (!mod) return path
			return `${mod.basePath}${path}`
		},

		replaceAsset(from, to, modId) {
			state.assetReplacements[from] = { to, modId: modId || 'anonymous' }
			return to
		},

		resolveAsset(path) {
			return state.assetReplacements[path]?.to || path
		},

		registerSound(name, src, options, modId) {
			state.sounds[name] = Object.assign({}, options || {}, { name, src, modId: modId || 'anonymous' })
			return state.sounds[name]
		},

		registerMusic(name, src, options, modId) {
			state.music[name] = Object.assign({}, options || {}, { name, src, modId: modId || 'anonymous' })
			return state.music[name]
		},

		applyPreloadList(list) {
			const out = list.map(function (path) { return api.resolveAsset(path) })
			for (const from in state.assetReplacements) {
				if (out.indexOf(state.assetReplacements[from].to) === -1) out.push(state.assetReplacements[from].to)
			}
			return out
		},

		applySoundList(samples) {
			const byName = {}
			for (const sample of samples) byName[sample.name] = Object.assign({}, sample, { src: api.resolveAsset(sample.src) })
			for (const name in state.sounds) byName[name] = Object.assign({}, state.sounds[name])
			return Object.keys(byName).map(function (name) { return byName[name] })
		},

		resolveMusic(name) {
			return state.music[name]?.src || api.resolveAsset(`sfx/${name}.mp3`)
		},

		patch(target, methodName, wrapper, modId) {
			const original = target?.[methodName]
			if (typeof original !== 'function') {
				warn(`Cannot patch ${methodName}; target method is missing.`)
				return function () {}
			}
			const replacement = wrapper(original)
			target[methodName] = replacement
			return function () {
				if (target[methodName] === replacement) target[methodName] = original
			}
		}
	}

	window.ModLoader = api
})()
