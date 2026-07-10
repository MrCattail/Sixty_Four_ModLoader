(function () {
	'use strict'

	const state = {
		version: '0.1.0',
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
		game: null,
		languagePatched: false,
		panelMessage: '',
		uiButtons: {},
		uiDocks: {}
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

		const names = state.mods.map(function (mod) { return mod.path || mod.id }).join(', ') || 'No mods'
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
		if (state.uiButtons[key]?.element && state.uiButtons[key].element !== options.element) {
			state.uiButtons[key].element.classList.remove('modloader-ui-dock-button', 'modloader-ui-hide-mobile')
		}
		state.uiButtons[key] = {
			id,
			key,
			modId: modId || 'anonymous',
			element: options.element,
			dock,
			order: Number.isFinite(Number(options.order)) ? Number(options.order) : 100,
			hideOnMobile: options.hideOnMobile !== false
		}
		syncUiDock(dock)
		return function () { unregisterUiButton(modId, id, options.element) }
	}

	const createUiApi = function (modId) {
		return {
			registerCornerButton(options) { return registerUiButton(modId, options) },
			registerButton(options) { return registerUiButton(modId, options) },
			unregisterCornerButton(id) { return unregisterUiButton(modId, id) },
			unregisterButton(id) { return unregisterUiButton(modId, id) },
			refreshCornerButtons: syncUiDocks,
			refreshButtons: syncUiDocks
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
			close: 'Close', installedMods: 'Installed mods', enabledEntries: 'Enabled entries', loadedMods: 'Loaded mods', issues: 'Issues', dataPatches: 'Data patches', wordPatches: 'Word patches', registeredLanguages: 'Registered languages', orphanEntities: 'Orphan entities', modManager: 'Mod Manager', toggleNote: 'Toggle mods or edit config below.', changesRequireReload: 'Changes require reload.', configSaveNote: 'Config saved to localStorage; some mods need reload.', saveReload: 'Save & Reload', saveConfig: 'Save Config', insert: 'insert', folder: 'folder', deleteMod: 'Delete mod', config: 'Config', recentLog: 'Recent Log', noLogEntries: 'No log entries.', noModsFound: 'No mods with mod.json were found.', fileAccessUnavailable: 'File access is unavailable.', fileAccessLoadedOnly: 'File access is unavailable, so only loaded mods can be shown.', reloadHot: 'hot capable, reload now', reloadRestart: 'restart required', reloadRequired: 'reload required', idPrefix: 'id: {value}', depsPrefix: 'deps: {value}', conflictsPrefix: 'conflicts: {value}', missingDependencies: 'Missing dependencies: {value}', conflictsEnabled: 'Conflicts enabled: {value}', savedReloading: 'Saved. Reloading...', saveFailed: 'Save failed: {value}', configSaved: 'Config saved.', noChanges: 'No changes to save.', openFolderFailed: 'Could not open folder: {value}', deleteTitle: 'Delete Mod?', deleteMessage: 'Delete {name} from the mods folder? This cannot be undone.', deleteConfirm: 'Delete', cancel: 'Cancel', replaceTitle: 'Replace Mod?', replaceMessage: 'mods already contains {name}. Replace it with the imported mod?', replaceConfirm: 'Replace', deletedMod: 'Deleted {name}. Reload to unload already running code.', deleteFailed: 'Delete failed: {value}', importHint: 'Drop a file here or paste', importDetail: 'Drag a mod zip here, or copy a zip file and press paste. ModLoader will unpack it into the mods folder automatically.', importWaiting: 'Waiting for a zip file...', importNoZip: 'Drop or paste a .zip file.', importNoPath: 'Could not read the file path from the dropped file.', importing: 'Importing {name}...', importedMod: 'Imported {name}. Enable it and Save & Reload when ready.', importFailed: 'Import failed: {value}', importModeOff: 'Back to mod list', invalidZip: 'Only .zip mod packages can be imported.', zipNoMod: 'The zip does not contain a mod.json.', zipMultipleMods: 'The zip contains multiple mod folders; import one mod at a time.', zipExtractFailed: 'Could not extract zip: {value}', folderOpened: 'Opened mods folder.'
		},
		sch: {
			close: '\u5173\u95ed', installedMods: '\u5df2\u5b89\u88c5 mod', enabledEntries: '\u542f\u7528\u6761\u76ee', loadedMods: '\u5df2\u52a0\u8f7d mod', issues: '\u95ee\u9898', dataPatches: '\u6570\u636e\u8865\u4e01', wordPatches: '\u6587\u672c\u8865\u4e01', registeredLanguages: '\u5df2\u6ce8\u518c\u8bed\u8a00', orphanEntities: '\u5b64\u7acb\u5b9e\u4f53', modManager: 'Mod \u7ba1\u7406', toggleNote: '\u5728\u4e0b\u65b9\u5f00\u5173 mod \u6216\u7f16\u8f91\u914d\u7f6e\u3002', changesRequireReload: '\u6539\u52a8\u9700\u8981 reload\u3002', configSaveNote: '\u914d\u7f6e\u5df2\u4fdd\u5b58\u5230 localStorage\uff1b\u90e8\u5206 mod \u9700\u8981 reload \u751f\u6548\u3002', saveReload: '\u4fdd\u5b58\u5e76 Reload', saveConfig: '\u4fdd\u5b58\u914d\u7f6e', insert: '\u5bfc\u5165', folder: '\u6587\u4ef6\u5939', deleteMod: '\u5220\u9664 mod', config: '\u914d\u7f6e', recentLog: '\u6700\u8fd1\u65e5\u5fd7', noLogEntries: '\u6682\u65e0\u65e5\u5fd7\u3002', noModsFound: '\u6ca1\u6709\u627e\u5230\u5e26 mod.json \u7684 mod\u3002', fileAccessUnavailable: '\u6587\u4ef6\u8bbf\u95ee\u4e0d\u53ef\u7528\u3002', fileAccessLoadedOnly: '\u6587\u4ef6\u8bbf\u95ee\u4e0d\u53ef\u7528\uff0c\u6240\u4ee5\u53ea\u80fd\u663e\u793a\u5df2\u52a0\u8f7d\u7684 mod\u3002', reloadHot: '\u652f\u6301\u70ed\u5f00\u5173\uff0c\u5f53\u524d\u4ecd\u5efa\u8bae reload', reloadRestart: '\u9700\u8981\u91cd\u542f', reloadRequired: '\u9700\u8981 reload', idPrefix: 'id\uff1a{value}', depsPrefix: '\u4f9d\u8d56\uff1a{value}', conflictsPrefix: '\u51b2\u7a81\uff1a{value}', missingDependencies: '\u7f3a\u5c11\u4f9d\u8d56\uff1a{value}', conflictsEnabled: '\u5df2\u542f\u7528\u51b2\u7a81\uff1a{value}', savedReloading: '\u5df2\u4fdd\u5b58\uff0c\u6b63\u5728 reload...', saveFailed: '\u4fdd\u5b58\u5931\u8d25\uff1a{value}', configSaved: '\u914d\u7f6e\u5df2\u4fdd\u5b58\u3002', noChanges: '\u6ca1\u6709\u9700\u8981\u4fdd\u5b58\u7684\u6539\u52a8\u3002', openFolderFailed: '\u65e0\u6cd5\u6253\u5f00\u6587\u4ef6\u5939\uff1a{value}', deleteTitle: '\u5220\u9664 Mod\uff1f', deleteMessage: '\u4ece mods \u6587\u4ef6\u5939\u5220\u9664 {name}\uff1f\u8fd9\u4e2a\u64cd\u4f5c\u4e0d\u80fd\u64a4\u9500\u3002', deleteConfirm: '\u5220\u9664', cancel: '\u53d6\u6d88', replaceTitle: '\u66ff\u6362 Mod\uff1f', replaceMessage: 'mods \u91cc\u5df2\u7ecf\u6709 {name}\u3002\u662f\u5426\u7528\u5bfc\u5165\u7684 mod \u66ff\u6362\u5b83\uff1f', replaceConfirm: '\u66ff\u6362', deletedMod: '\u5df2\u5220\u9664 {name}\u3002\u5df2\u7ecf\u8fd0\u884c\u7684\u4ee3\u7801\u9700\u8981 reload \u624d\u4f1a\u5378\u8f7d\u3002', deleteFailed: '\u5220\u9664\u5931\u8d25\uff1a{value}', importHint: '\u628a\u6587\u4ef6\u62d6\u5230\u8fd9\u91cc\u6216\u590d\u5236', importDetail: '\u53ef\u4ee5\u628a mod zip \u5305\u76f4\u63a5\u62d6\u5165\uff0c\u6216\u8005\u590d\u5236 zip \u5305\u540e\u5728\u8fd9\u91cc\u6309\u7c98\u8d34\u5feb\u6377\u952e\uff0cModLoader \u4f1a\u81ea\u52a8\u89e3\u5305\u5230 mods \u6587\u4ef6\u5939\u3002', importWaiting: '\u7b49\u5f85 zip \u6587\u4ef6...', importNoZip: '\u8bf7\u62d6\u5165\u6216\u7c98\u8d34 .zip \u6587\u4ef6\u3002', importNoPath: '\u65e0\u6cd5\u8bfb\u53d6\u8be5\u6587\u4ef6\u8def\u5f84\u3002', importing: '\u6b63\u5728\u5bfc\u5165 {name}...', importedMod: '\u5df2\u5bfc\u5165 {name}\u3002\u9700\u8981\u65f6\u52fe\u9009\u5b83\u5e76\u4fdd\u5b58 reload\u3002', importFailed: '\u5bfc\u5165\u5931\u8d25\uff1a{value}', importModeOff: '\u8fd4\u56de mod \u5217\u8868', invalidZip: '\u53ea\u80fd\u5bfc\u5165 .zip mod \u5305\u3002', zipNoMod: '\u8fd9\u4e2a zip \u5185\u6ca1\u6709 mod.json\u3002', zipMultipleMods: '\u8fd9\u4e2a zip \u5305\u542b\u591a\u4e2a mod \u6587\u4ef6\u5939\uff1b\u8bf7\u4e00\u6b21\u5bfc\u5165\u4e00\u4e2a mod\u3002', zipExtractFailed: '\u65e0\u6cd5\u89e3\u538b zip\uff1a{value}', folderOpened: '\u5df2\u6253\u5f00 mods \u6587\u4ef6\u5939\u3002'
		}
	}
	PANEL_TEXT.modsch = PANEL_TEXT.sch
	PANEL_TEXT.tch = PANEL_TEXT.sch
	const getPanelLanguage = function () {
		const language = state.game?.language || ''
		if (language === 'sch' || language === 'modsch') return 'sch'
		if (language === 'tch') return 'tch'
		return 'en'
	}

	const t = function (key, values) {
		const language = getPanelLanguage()
		const source = PANEL_TEXT[language]?.[key] || PANEL_TEXT.en[key] || key
		return source.replace(/\{(\w+)\}/g, function (match, name) {
			return values && values[name] !== undefined ? String(values[name]) : match
		})
	}

	const ensurePanelStyle = function () {
		if (document.getElementById('modloader-panel-style')) return
		const style = document.createElement('style')
		style.id = 'modloader-panel-style'
		style.textContent = `
			#modloader-panel { position: fixed; right: 16px; top: 16px; z-index: 2147483647; width: min(860px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; padding: 14px; border-radius: 8px; background: rgba(8, 10, 12, .94); color: rgba(255,255,255,.92); box-shadow: 0 12px 36px rgba(0,0,0,.35); font: 13px/1.45 Montserrat, Arial, sans-serif; }
			#modloader-panel.modloader-panel-modal-open > :not(.modloader-modal) { filter: blur(4px); opacity: .52; pointer-events: none; user-select: none; }
			#modloader-panel h2 { margin: 0 0 8px; font-size: 16px; }
			#modloader-panel h3 { margin: 14px 0 6px; font-size: 13px; color: rgba(255,255,255,.72); }
			#modloader-panel button, #modloader-panel input, #modloader-panel textarea, #modloader-panel select { font: inherit; }
			#modloader-panel .modloader-panel-close { position: absolute; right: 9px; top: 8px; width: 24px; height: 24px; border: 0; background: transparent; color: rgba(255,255,255,.8); cursor: pointer; }
			#modloader-panel .modloader-panel-close:before, #modloader-panel .modloader-panel-close:after { content: ''; position: absolute; left: 50%; top: 50%; width: 15px; height: 2px; border-radius: 999px; background: currentColor; transform-origin: center; }
			#modloader-panel .modloader-panel-close:before { transform: translate(-50%, -50%) rotate(45deg); }
			#modloader-panel .modloader-panel-close:after { transform: translate(-50%, -50%) rotate(-45deg); }
			#modloader-panel .modloader-panel-close:hover { color: #fff; }
			#modloader-panel .modloader-panel-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px 12px; margin: 8px 0 12px; }
			#modloader-panel .modloader-panel-row { display: flex; gap: 12px; justify-content: space-between; border-top: 1px solid rgba(255,255,255,.1); padding: 5px 0; }
			#modloader-panel .modloader-panel-label { color: rgba(255,255,255,.62); }
			#modloader-panel .modloader-panel-value { text-align: right; overflow-wrap: anywhere; }
			#modloader-panel .modloader-panel-list { margin: 0; padding-left: 18px; }
			#modloader-panel .modloader-panel-log { margin: 0; padding: 8px; border-radius: 6px; background: rgba(255,255,255,.08); white-space: pre-wrap; overflow-wrap: anywhere; }
			#modloader-panel .modloader-panel-issues { margin: 8px 0 0; padding: 8px 8px 8px 24px; border-radius: 6px; background: rgba(255, 196, 87, .12); color: rgba(255,255,255,.92); }
			#modloader-panel .modloader-panel-issue-error { color: #ffb0b0; }
			#modloader-panel .modloader-panel-issue-warn { color: #ffe1a3; }
			#modloader-panel .modloader-mod-toolbar { position: sticky; top: -14px; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px -2px 10px; padding: 8px 2px; background: rgba(8, 10, 12, .96); }
			#modloader-panel .modloader-panel-note { color: rgba(255,255,255,.7); }
			#modloader-panel .modloader-panel-reload-note { display: none; color: #ffe1a3; }
			#modloader-panel .modloader-panel-reload-note.active { display: inline; }
			#modloader-panel .modloader-panel-config-note { display: none; color: #cfe9ff; }
			#modloader-panel .modloader-panel-config-note.active { display: inline; }
			#modloader-panel .modloader-save-button { border: 0; border-radius: 6px; padding: 7px 10px; background: #f2f2ed; color: #111; cursor: pointer; }
			#modloader-panel .modloader-save-button:disabled { cursor: default; opacity: .45; }
			#modloader-panel .modloader-toolbar-actions { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; }
			#modloader-panel .modloader-action-button { display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(255,255,255,.12); border-radius: 6px; padding: 7px 9px; background: rgba(255,255,255,.08); color: rgba(255,255,255,.88); cursor: pointer; }
			#modloader-panel .modloader-action-button:hover, #modloader-panel .modloader-action-button.active { background: rgba(255,255,255,.14); border-color: rgba(207,233,255,.3); }
			#modloader-panel .modloader-action-button:disabled { cursor: default; opacity: .45; }
			#modloader-panel .modloader-action-icon { position: relative; display: inline-block; width: 15px; height: 15px; flex: 0 0 auto; color: currentColor; }
			#modloader-panel .modloader-action-icon-plus:before, #modloader-panel .modloader-action-icon-plus:after { content: ''; position: absolute; left: 50%; top: 50%; width: 13px; height: 2px; border-radius: 999px; background: currentColor; transform: translate(-50%, -50%); }
			#modloader-panel .modloader-action-icon-plus:after { transform: translate(-50%, -50%) rotate(90deg); }
			#modloader-panel .modloader-action-icon-folder { width: 16px; height: 12px; margin-top: 3px; border-radius: 3px; background: currentColor; }
			#modloader-panel .modloader-action-icon-folder:before { content: ''; position: absolute; left: 2px; top: -2px; width: 6px; height: 3px; border-radius: 2px 2px 0 0; background: currentColor; }
			#modloader-panel .modloader-panel-error { margin: 8px 0; padding: 8px; border-radius: 6px; background: rgba(255, 96, 96, .14); color: #ffb0b0; }
			#modloader-panel .modloader-import-zone { display: grid; place-items: center; min-height: 0; max-height: 0; opacity: 0; overflow: hidden; border: 1px solid transparent; border-radius: 7px; background: rgba(0,0,0,.16); box-shadow: inset 0 1px 18px rgba(0,0,0,.28); transform: translateY(-8px); transition: max-height .22s ease, min-height .22s ease, opacity .16s ease, transform .22s ease, border-color .16s ease; }
			#modloader-panel .modloader-import-zone.active { min-height: 220px; max-height: 320px; opacity: 1; transform: translateY(0); border-color: rgba(255,255,255,.09); }
			#modloader-panel .modloader-import-zone.dragging { border-color: rgba(207,233,255,.5); background: rgba(207,233,255,.08); }
			#modloader-panel .modloader-import-copy { text-align: center; padding: 18px; color: rgba(255,255,255,.72); }
			#modloader-panel .modloader-import-title { font-weight: 600; color: rgba(255,255,255,.9); }
			#modloader-panel .modloader-import-detail { margin-top: 8px; max-width: 520px; color: rgba(255,255,255,.58); }
			#modloader-panel .modloader-import-status { margin-top: 12px; color: #cfe9ff; }
			#modloader-panel .modloader-mod-manager { display: grid; gap: 6px; max-height: min(48vh, 460px); overflow-x: hidden; overflow-y: auto; padding-right: 5px; scrollbar-gutter: stable; scrollbar-width: thin; scrollbar-color: rgba(185,185,185,.48) transparent; opacity: 1; transform: translateY(0); transition: opacity .16s ease, transform .18s ease, max-height .22s ease; }
			#modloader-panel .modloader-mod-manager.modloader-mod-manager-importing { max-height: 0; opacity: 0; pointer-events: none; transform: translateY(8px); }
			#modloader-panel .modloader-mod-manager::-webkit-scrollbar { width: 4px; }
			#modloader-panel .modloader-mod-manager::-webkit-scrollbar-track { background: transparent; }
			#modloader-panel .modloader-mod-manager::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(185,185,185,.48); }
			#modloader-panel .modloader-mod-manager::-webkit-scrollbar-thumb:hover { background: rgba(210,210,210,.62); }
			#modloader-panel .modloader-mod-row { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: flex-start; padding: 9px; border: 1px solid rgba(255,255,255,.1); border-radius: 7px; background: rgba(255,255,255,.045); transition: border-color .14s ease, background .14s ease, box-shadow .14s ease; }
			#modloader-panel .modloader-mod-row-configurable { cursor: pointer; }
			#modloader-panel .modloader-mod-row-configurable:hover { border-color: rgba(207,233,255,.28); }
			#modloader-panel .modloader-mod-row-expanded { border-color: rgba(207,233,255,.5); box-shadow: 0 8px 22px rgba(0,0,0,.16); }
			#modloader-panel .modloader-mod-row-moving { z-index: 3; will-change: transform; }
			#modloader-panel .modloader-mod-row-selected { border-color: rgba(174, 231, 160, .42); background: rgba(120, 190, 120, .08); }
			#modloader-panel .modloader-mod-row-problem { border-color: rgba(255, 196, 87, .48); }
			#modloader-panel .modloader-mod-check { margin-top: 2px; }
			#modloader-panel .modloader-mod-main { min-width: 0; }
			#modloader-panel .modloader-mod-delete { position: relative; width: 25px; height: 25px; border: 0; border-radius: 5px; background: transparent; color: rgba(255,255,255,.56); cursor: pointer; }
			#modloader-panel .modloader-mod-delete:hover { color: #ffb0b0; background: rgba(255,96,96,.1); }
			#modloader-panel .modloader-mod-delete:before { content: ''; position: absolute; left: 8px; top: 9px; width: 9px; height: 10px; border: 2px solid currentColor; border-top: 0; border-radius: 1px 1px 3px 3px; box-sizing: border-box; }
			#modloader-panel .modloader-mod-delete:after { content: ''; position: absolute; left: 7px; top: 6px; width: 11px; height: 2px; border-radius: 999px; background: currentColor; box-shadow: 3px -3px 0 -1px currentColor; }
			#modloader-panel .modloader-mod-title { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
			#modloader-panel .modloader-mod-path { font-weight: 600; overflow-wrap: anywhere; }
			#modloader-panel .modloader-mod-version { color: rgba(255,255,255,.58); }
			#modloader-panel .modloader-mod-name { color: rgba(255,255,255,.72); overflow-wrap: anywhere; }
			#modloader-panel .modloader-mod-meta { margin-top: 3px; color: rgba(255,255,255,.62); overflow-wrap: anywhere; }
			#modloader-panel .modloader-mod-warning { display: none; margin-top: 5px; color: #ffe1a3; overflow-wrap: anywhere; }
			#modloader-panel .modloader-mod-warning.active { display: block; }
			#modloader-panel .modloader-mod-config { max-height: 0; margin-top: 0; padding-top: 0; border-top: 1px solid transparent; opacity: 0; overflow: hidden; pointer-events: none; transform: translateY(-4px); transition: max-height .2s ease, margin-top .2s ease, padding-top .2s ease, border-top-color .2s ease, opacity .16s ease, transform .2s ease; }
			#modloader-panel .modloader-mod-row-expanded .modloader-mod-config { max-height: 640px; margin-top: 8px; padding-top: 8px; border-top-color: rgba(255,255,255,.09); opacity: 1; pointer-events: auto; transform: translateY(0); }
			#modloader-panel .modloader-mod-config-title { margin-bottom: 5px; color: rgba(255,255,255,.72); font-weight: 600; }
			#modloader-panel .modloader-config-field { display: grid; grid-template-columns: minmax(130px, .8fr) minmax(170px, 1fr); gap: 4px 10px; align-items: center; margin-top: 6px; }
			#modloader-panel .modloader-config-field-disabled { opacity: .52; }
			#modloader-panel .modloader-config-text { min-width: 0; }
			#modloader-panel .modloader-config-label { display: block; color: rgba(255,255,255,.86); overflow-wrap: anywhere; }
			#modloader-panel .modloader-config-meta { display: block; font-size: 11px; color: rgba(255,255,255,.48); overflow-wrap: anywhere; }
			#modloader-panel input.modloader-config-input:not([type="checkbox"]), #modloader-panel textarea.modloader-config-input, #modloader-panel select.modloader-config-input { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid rgba(255,255,255,.16); border-radius: 5px; padding: 5px 6px; background: rgba(0,0,0,.22); color: rgba(255,255,255,.92); outline: none; }
			#modloader-panel input.modloader-config-input[type="checkbox"] { width: 16px; height: 16px; margin: 0; }
			#modloader-panel textarea.modloader-config-input { min-height: 54px; resize: vertical; }
			#modloader-panel .modloader-config-input:focus { border-color: rgba(207, 233, 255, .5); }
			#modloader-panel .modloader-config-field-invalid .modloader-config-input { border-color: rgba(255, 96, 96, .72); }
			#modloader-panel .modloader-config-error { display: none; grid-column: 2; color: #ffb0b0; font-size: 11px; }
			#modloader-panel .modloader-config-error.active { display: block; }
			#modloader-panel .modloader-modal { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; padding: 16px; background: rgba(8,10,12,.2); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
			#modloader-panel .modloader-modal-box { width: min(420px, 100%); border: 1px solid rgba(255,255,255,.12); border-radius: 8px; padding: 14px; background: rgba(10,12,14,.92); box-shadow: 0 14px 36px rgba(0,0,0,.36); }
			#modloader-panel .modloader-modal-title { margin: 0 0 8px; font-size: 14px; color: rgba(255,255,255,.94); }
			#modloader-panel .modloader-modal-message { color: rgba(255,255,255,.72); overflow-wrap: anywhere; }
			#modloader-panel .modloader-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
			#modloader-panel .modloader-modal-button { border: 1px solid rgba(255,255,255,.14); border-radius: 6px; padding: 7px 10px; background: rgba(255,255,255,.08); color: rgba(255,255,255,.9); cursor: pointer; }
			#modloader-panel .modloader-modal-button:hover { background: rgba(255,255,255,.14); }
			#modloader-panel .modloader-modal-button-primary { background: #f2f2ed; color: #111; border-color: transparent; }
			#modloader-panel .modloader-modal-button-danger { background: rgba(255,96,96,.2); color: #ffd4d4; border-color: rgba(255,96,96,.28); }
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
			try {
				const electron = require('electron')
				shell = electron?.shell || null
				clipboard = electron?.clipboard || null
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
					const mod = {
						path: name,
						id: manifest.id || name,
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

	const getOrderedSelectedPaths = function (mods, selected) {
		const out = []
		const seen = new Set()
		const available = new Set(mods.map(function (mod) { return mod.path }))
		for (const entry of state.enabledEntries) {
			if (!selected.has(entry.path) || seen.has(entry.path)) continue
			out.push(entry.path)
			seen.add(entry.path)
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

	const getConfigType = function (item) {
		return String(item.type || inferConfigType(item.default) || 'string').toLowerCase()
	}

	const cloneConfigValue = function (value) {
		return (isObject(value) || Array.isArray(value)) ? clone(value) : value
	}

	const sameConfigValue = function (a, b) {
		return JSON.stringify(a) === JSON.stringify(b)
	}

	const readConfigForPanel = function (mod) {
		const schema = normalizeConfigSchema(mod.manifest.config).map(function (item) {
			item = clone(item)
			item.type = getConfigType(item)
			return item
		})
		const values = {}
		for (const item of schema) {
			values[item.key] = parseStoredConfig(localStorage.getItem(storageKey(mod.id, item.key)), item.default)
		}
		return { schema, values }
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

	const createConfigInput = function (item, value) {
		const type = getConfigType(item)
		const input = element(type === 'array' || type === 'object' ? 'textarea' : 'input', 'modloader-config-input')
		if (type === 'boolean') {
			input.type = 'checkbox'
			input.checked = value === undefined ? !!item.default : !!value
		} else if (type === 'number' || type === 'float' || type === 'integer' || type === 'int') {
			input.type = 'number'
			input.value = formatConfigInputValue(value, type)
			input.step = item.step !== undefined ? String(item.step) : (type === 'integer' || type === 'int' ? '1' : 'any')
			if (item.min !== undefined) input.min = String(item.min)
			if (item.max !== undefined) input.max = String(item.max)
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
		if (type === 'boolean') return !!input.checked
		if (type === 'number' || type === 'float' || type === 'integer' || type === 'int') {
			if (String(input.value).trim() === '') throw new Error('Enter a number.')
			const value = Number(input.value)
			if (!Number.isFinite(value)) throw new Error('Enter a valid number.')
			if ((type === 'integer' || type === 'int') && Math.floor(value) !== value) throw new Error('Enter a whole number.')
			return value
		}
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

	const showPanelConfirm = function (panel, options) {
		return new Promise(function (resolve) {
			const modal = element('div', 'modloader-modal')
			const box = element('div', 'modloader-modal-box')
			box.appendChild(element('h3', 'modloader-modal-title', options.title || ''))
			box.appendChild(element('div', 'modloader-modal-message', options.message || ''))
			const actions = element('div', 'modloader-modal-actions')
			const cancel = element('button', 'modloader-modal-button', options.cancelText || t('cancel'))
			const confirm = element('button', 'modloader-modal-button modloader-modal-button-primary' + (options.danger ? ' modloader-modal-button-danger' : ''), options.confirmText || 'OK')
			const close = function (value) {
				panel.classList.remove('modloader-panel-modal-open')
				modal.remove()
				resolve(value)
			}
			cancel.onclick = function () { close(false) }
			confirm.onclick = function () { close(true) }
			actions.append(cancel, confirm)
			box.appendChild(actions)
			modal.appendChild(box)
			panel.classList.add('modloader-panel-modal-open')
			panel.appendChild(modal)
			confirm.focus()
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
		return { tempDir, sourceDir, folderName, destDir }
	}

	const completeZipImport = function (plan, replace) {
		const tools = getModFileTools()
		if (!tools) throw new Error(t('fileAccessUnavailable'))
		try {
			if (tools.fs.existsSync(plan.destDir)) {
				if (!replace) return false
				tools.fs.rmSync(plan.destDir, { recursive: true, force: true })
			}
			tools.fs.cpSync(plan.sourceDir, plan.destDir, { recursive: true })
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

	const renderPanel = function () {
		if (!document.body) return
		ensurePanelStyle()

		const available = readAvailableMods()
		const mods = available.mods
		const originalSelected = getOrderedSelectedPaths(mods, getEnabledPathSet())
		const selected = new Set(originalSelected)
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
		const close = element('button', 'modloader-panel-close')
		close.title = t('close')
		close.setAttribute('aria-label', t('close'))
		close.onclick = function () {
			if (panel.__modloaderCleanup) panel.__modloaderCleanup()
			panel.remove()
		}
		panel.appendChild(close)
		panel.appendChild(element('h2', '', `Cattail's ModLoader ${state.version}`))

		if (state.issues.length) {
			const issues = element('ul', 'modloader-panel-issues')
			for (const issue of state.issues) {
				issues.appendChild(element('li', `modloader-panel-issue-${issue.level}`, `${issue.level.toUpperCase()} ${issue.code}: ${issue.message}`))
			}
			panel.appendChild(issues)
		}

		const summary = element('div', 'modloader-panel-summary')
		summary.appendChild(panelRow(t('installedMods'), String(mods.length)))
		summary.appendChild(panelRow(t('enabledEntries'), String(state.enabledEntries.length)))
		summary.appendChild(panelRow(t('loadedMods'), String(state.mods.length)))
		summary.appendChild(panelRow(t('issues'), String(state.issues.length)))
		summary.appendChild(panelRow(t('dataPatches'), String(state.dataPatches.length)))
		summary.appendChild(panelRow(t('wordPatches'), String(state.wordPatches.length)))
		summary.appendChild(panelRow(t('registeredLanguages'), state.languages.join(', ') || '-'))
		summary.appendChild(panelRow(t('orphanEntities'), String(state.orphanEntities.length)))
		panel.appendChild(summary)

		panel.appendChild(element('h3', '', t('modManager')))
		if (available.errorMessage) panel.appendChild(element('div', 'modloader-panel-error', available.errorMessage))

		const toolbar = element('div', 'modloader-mod-toolbar')
		const note = element('span', 'modloader-panel-note', t('toggleNote'))
		const reloadNote = element('span', 'modloader-panel-reload-note', t('changesRequireReload'))
		const configNote = element('span', 'modloader-panel-config-note', t('configSaveNote'))
		const message = element('span', 'modloader-panel-note', '')
		const save = element('button', 'modloader-save-button', t('saveReload'))
		const insert = createPanelActionButton('plus', t('insert'), t('insert'))
		const folder = createPanelActionButton('folder', t('folder'), t('folder'))
		save.disabled = true
		insert.disabled = !getModFileTools()
		folder.disabled = !getModFileTools()
		const left = element('span')
		const actions = element('span', 'modloader-toolbar-actions')
		left.append(note, document.createTextNode(' '), reloadNote, document.createTextNode(' '), configNote, document.createTextNode(' '), message)
		actions.append(insert, folder, save)
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
			row.style.transition = 'transform .22s cubic-bezier(.2, .8, .2, 1)'
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
			fallbackTimer = setTimeout(cleanup, 280)
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
			}, 170)
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
				}
				completeZipImport(plan, replace)
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

			const orderedSelected = getOrderedSelectedPaths(mods, selected)
			const enabledDirty = !sameStringList(orderedSelected, originalSelected)
			const reloadDirty = enabledDirty || configReloadDirty
			reloadNote.classList.toggle('active', reloadDirty)
			configNote.classList.toggle('active', configDirty && !configReloadDirty)
			save.textContent = reloadDirty ? t('saveReload') : t('saveConfig')
			save.disabled = (!enabledDirty && !configDirty) || configInvalid || (enabledDirty && !getModFileTools())
			if (!keepMessage) message.textContent = ''
		}

		for (const mod of mods) {
			const row = element('div', 'modloader-mod-row')
			const checkbox = element('input', 'modloader-mod-check')
			checkbox.type = 'checkbox'
			checkbox.checked = selected.has(mod.path)
			checkbox.disabled = !!mod.loadError && !checkbox.checked
			checkbox.onchange = function () {
				if (checkbox.checked) selected.add(mod.path)
				else selected.delete(mod.path)
				refreshRows()
			}

			const main = element('div', 'modloader-mod-main')
			const title = element('div', 'modloader-mod-title')
			title.appendChild(element('span', 'modloader-mod-path', mod.path))
			if (mod.manifest.version) title.appendChild(element('span', 'modloader-mod-version', 'v' + mod.manifest.version))
			if (mod.manifest.name && mod.manifest.name !== mod.path) title.appendChild(element('span', 'modloader-mod-name', mod.manifest.name))
			main.appendChild(title)

			const deps = resolveModRefs(mod.manifest.dependencies)
			const conflicts = resolveModRefs(mod.manifest.conflicts)
			const metaParts = [
				t('idPrefix', { value: mod.id || mod.path }),
				getModReloadLabel(mod.manifest)
			]
			if (deps.length) metaParts.push(t('depsPrefix', { value: deps.join(', ') }))
			if (conflicts.length) metaParts.push(t('conflictsPrefix', { value: conflicts.join(', ') }))
			main.appendChild(element('div', 'modloader-mod-meta', metaParts.join(' | ')))

			const warning = element('div', 'modloader-mod-warning')
			main.appendChild(warning)

			const modConfig = readConfigForPanel(mod)
			const rowConfigModels = []
			if (modConfig.schema.length && !mod.loadError) {
				row.classList.add('modloader-mod-row-configurable')
				const configBox = element('div', 'modloader-mod-config')
				configBox.appendChild(element('div', 'modloader-mod-config-title', t('config')))
				for (const item of modConfig.schema) {
					const type = getConfigType(item)
					const value = modConfig.values[item.key]
					const field = element('label', 'modloader-config-field')
					const text = element('span', 'modloader-config-text')
					text.appendChild(element('span', 'modloader-config-label', item.label || item.key))
					text.appendChild(element('span', 'modloader-config-meta', item.key + ' | ' + type))
					const input = createConfigInput(item, value)
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
					configBox.appendChild(field)
					rowConfigModels.push(model)
					configModels.push(model)
				}
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
			const rowModel = { mod, checkbox, container: row, warning, configModels: rowConfigModels }
			row.onclick = function (event) {
				if (!rowConfigModels.length || !isModRowToggleTarget(event.target)) return
				toggleConfigRow(rowModel)
			}
			row.append(checkbox, main, deleteButton)
			list.appendChild(row)
			rowModels.push(rowModel)
		}

		if (!mods.length) list.appendChild(element('div', 'modloader-panel-note', t('noModsFound')))

		insert.onclick = function () { setImportMode(!importMode) }
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
		panel.__modloaderCleanup = function () {
			document.removeEventListener('paste', documentPasteHandler, true)
			document.removeEventListener('keydown', documentKeyHandler, true)
			panel.__modloaderCleanup = null
		}

		save.onclick = function () {
			const orderedSelected = getOrderedSelectedPaths(mods, selected)
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
	}
	const togglePanel = function () {
		const panel = document.getElementById('modloader-panel')
		if (panel) {
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

		async boot() {
			if (state.booted) return state
			state.booted = true

			state.enabledConfig = await readJson('mods/enabled.json', { mods: [] })
			state.enabledEntries = normalizeEnabled(state.enabledConfig)
			for (const entry of state.enabledEntries) {
				try {
					const basePath = `mods/${entry.path}/`
					const manifest = await readJson(`${basePath}mod.json`)
					const id = manifest.id || entry.id || entry.path
					const mod = { id, path: entry.path, basePath, manifest, loaded: false }
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
				installLanguageBridge()
			}
			if (name === 'afterGameInit') {
				requestAnimationFrame(refreshOpenPanel)
				requestAnimationFrame(syncUiDocks)
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
