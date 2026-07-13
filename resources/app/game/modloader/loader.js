(function () {
	'use strict'

	const state = {
		version: '0.1.2',
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
		panelSettings: { theme: 'dark', hideMode: 'auto', autoHideSeconds: 3, hideMenuDetails: false, hideModFileDetails: false },
		panelSettingsOpen: false,
		panelStateLoaded: false,
		panelAutoHideTimer: null,
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
			close: 'Close', hideToEdge: 'Hide to edge', showFromEdge: 'Show ModLoader menu', menuSettings: 'Menu Settings', themeMode: 'Theme', darkMode: 'Dark', lightMode: 'Light', hideMode: 'Auto-hide mode', autoHide: 'Auto-hide', manualHide: 'Manual', sortMod: 'Sort mod', autoHideDelay: 'Auto-hide delay', secondsSuffix: 's', hideMenuDetails: 'Hide menu details', hideModFileDetails: 'Hide mod file details', show: 'Show', hide: 'Hide', installedMods: 'Installed mods', enabledEntries: 'Enabled entries', loadedMods: 'Loaded mods', issues: 'Issues', dataPatches: 'Data patches', wordPatches: 'Word patches', registeredLanguages: 'Registered languages', orphanEntities: 'Orphan entities', modManager: 'Mod Manager', selectAll: 'all', toggleNote: 'Toggle mods or edit config below.', changesRequireReload: 'Changes require reload.', configSaveNote: 'Config saved to localStorage; some mods need reload.', saveReload: 'Save & Reload', saveConfig: 'Save Config', insert: 'insert', folder: 'folder', deleteMod: 'Delete mod', config: 'Config', recentLog: 'Recent Log', noLogEntries: 'No log entries.', noModsFound: 'No mods with mod.json were found.', fileAccessUnavailable: 'File access is unavailable.', fileAccessLoadedOnly: 'File access is unavailable, so only loaded mods can be shown.', reloadHot: 'hot capable, reload now', reloadRestart: 'restart required', reloadRequired: 'reload required', idPrefix: 'id: {value}', uniquePrefix: 'unique: {value}', depsPrefix: 'deps: {value}', conflictsPrefix: 'conflicts: {value}', missingDependencies: 'Missing dependencies: {value}', conflictsEnabled: 'Conflicts enabled: {value}', savedReloading: 'Saved. Reloading...', saveFailed: 'Save failed: {value}', configSaved: 'Config saved.', noChanges: 'No changes to save.', changesCanceled: 'Canceled unsaved changes.', openFolderFailed: 'Could not open folder: {value}', deleteTitle: 'Delete Mod?', deleteMessage: 'Delete {name} from the mods folder? This cannot be undone.', deleteConfirm: 'Delete', cancel: 'Cancel', replaceTitle: 'Replace Mod?', replaceMessage: 'mods already contains {name}. Replace it with the imported mod?', replaceConfirm: 'Replace', deletedMod: 'Deleted {name}. Reload to unload already running code.', deleteFailed: 'Delete failed: {value}', importHint: 'Drop a file here or paste', importDetail: 'Drag a mod zip here, or copy a zip file and press paste. ModLoader will unpack it into the mods folder automatically.', importWaiting: 'Waiting for a zip file...', importNoZip: 'Drop or paste a .zip file.', importNoPath: 'Could not read the file path from the dropped file.', importing: 'Importing {name}...', importedMod: 'Imported {name}. Enable it and Save & Reload when ready.', importFailed: 'Import failed: {value}', importModeOff: 'Back to mod list', invalidZip: 'Only .zip mod packages can be imported.', zipNoMod: 'The zip does not contain a mod.json.', zipMultipleMods: 'The zip contains multiple mod folders; import one mod at a time.', zipExtractFailed: 'Could not extract zip: {value}', folderOpened: 'Opened mods folder.', replaceRenamedUniqueTitle: 'Update Renamed Mod?', replaceRenamedUniqueMessage: 'The new file has the same mod unique code as an installed mod. It is probably an update and rename.\n{oldName} -> {newName}\nReplace the old file?', replaceRenamedPreviousTitle: 'Mod Rename Detected', replaceRenamedPreviousMessage: 'This new file appears to be a rename of an installed file.\n{oldName} -> {newName}\nReplace the old file?', replaceOld: 'Replace', keepImported: 'Do not replace (add new file)', uniqueCodeEditTitle: 'Recommend changing mod unique code', uniqueCodeEditMessage: 'These two mods will share the same mod unique code. Change the imported mod unique code before adding it?', uniqueCodeLabel: 'Mod unique code', uniqueCodeConfirm: 'Confirm', uniqueCodeSkip: 'No', manifestReadFailed: 'Could not read mod.json: {value}', translationFile: 'translations', translationFileTitle: 'Open translation file', translationFileSynced: 'Translation file synced: {path}', translationFileFailed: 'Translation file failed: {value}'
		},
		sch: {
			close: '\u5173\u95ed', hideToEdge: '\u9690\u85cf\u5230\u8fb9\u7f18', showFromEdge: '\u663e\u793a ModLoader \u83dc\u5355', menuSettings: 'Mod \u83dc\u5355\u8bbe\u7f6e', themeMode: '\u4eae\u8272 / \u6697\u8272\u6a21\u5f0f', darkMode: '\u6697\u8272', lightMode: '\u4eae\u8272', hideMode: '\u81ea\u52a8\u9690\u85cf\u6a21\u5f0f', autoHide: '\u81ea\u52a8\u9690\u85cf', manualHide: '\u624b\u52a8\u9690\u85cf', sortMod: '\u6392\u5e8f mod', autoHideDelay: '\u81ea\u52a8\u9690\u85cf\u79d2\u6570', secondsSuffix: '\u79d2', hideMenuDetails: '\u9690\u85cf\u83dc\u5355\u8be6\u60c5', hideModFileDetails: '\u9690\u85cf mod \u6587\u4ef6\u8be6\u60c5', show: '\u663e\u793a', hide: '\u9690\u85cf', installedMods: '\u5df2\u5b89\u88c5 mod', enabledEntries: '\u542f\u7528\u6761\u76ee', loadedMods: '\u5df2\u52a0\u8f7d mod', issues: '\u95ee\u9898', dataPatches: '\u6570\u636e\u8865\u4e01', wordPatches: '\u6587\u672c\u8865\u4e01', registeredLanguages: '\u5df2\u6ce8\u518c\u8bed\u8a00', orphanEntities: '\u5b64\u7acb\u5b9e\u4f53', modManager: 'Mod \u7ba1\u7406', selectAll: '\u5168\u9009', toggleNote: '\u5728\u4e0b\u65b9\u5f00\u5173 mod \u6216\u7f16\u8f91\u914d\u7f6e\u3002', changesRequireReload: '\u6539\u52a8\u9700\u8981 reload\u3002', configSaveNote: '\u914d\u7f6e\u5df2\u4fdd\u5b58\u5230 localStorage\uff1b\u90e8\u5206 mod \u9700\u8981 reload \u751f\u6548\u3002', saveReload: '\u4fdd\u5b58\u5e76 Reload', saveConfig: '\u4fdd\u5b58\u914d\u7f6e', insert: '\u5bfc\u5165', folder: '\u6587\u4ef6\u5939', deleteMod: '\u5220\u9664 mod', config: '\u914d\u7f6e', recentLog: '\u6700\u8fd1\u65e5\u5fd7', noLogEntries: '\u6682\u65e0\u65e5\u5fd7\u3002', noModsFound: '\u6ca1\u6709\u627e\u5230\u5e26 mod.json \u7684 mod\u3002', fileAccessUnavailable: '\u6587\u4ef6\u8bbf\u95ee\u4e0d\u53ef\u7528\u3002', fileAccessLoadedOnly: '\u6587\u4ef6\u8bbf\u95ee\u4e0d\u53ef\u7528\uff0c\u6240\u4ee5\u53ea\u80fd\u663e\u793a\u5df2\u52a0\u8f7d\u7684 mod\u3002', reloadHot: '\u652f\u6301\u70ed\u5f00\u5173\uff0c\u5f53\u524d\u4ecd\u5efa\u8bae reload', reloadRestart: '\u9700\u8981\u91cd\u542f', reloadRequired: '\u9700\u8981 reload', idPrefix: 'id\uff1a{value}', uniquePrefix: '\u552f\u4e00\u7801\uff1a{value}', depsPrefix: '\u4f9d\u8d56\uff1a{value}', conflictsPrefix: '\u51b2\u7a81\uff1a{value}', missingDependencies: '\u7f3a\u5c11\u4f9d\u8d56\uff1a{value}', conflictsEnabled: '\u5df2\u542f\u7528\u51b2\u7a81\uff1a{value}', savedReloading: '\u5df2\u4fdd\u5b58\uff0c\u6b63\u5728 reload...', saveFailed: '\u4fdd\u5b58\u5931\u8d25\uff1a{value}', configSaved: '\u914d\u7f6e\u5df2\u4fdd\u5b58\u3002', noChanges: '\u6ca1\u6709\u9700\u8981\u4fdd\u5b58\u7684\u6539\u52a8\u3002', changesCanceled: '\u5df2\u53d6\u6d88\u672a\u4fdd\u5b58\u7684\u6539\u52a8\u3002', openFolderFailed: '\u65e0\u6cd5\u6253\u5f00\u6587\u4ef6\u5939\uff1a{value}', deleteTitle: '\u5220\u9664 Mod\uff1f', deleteMessage: '\u4ece mods \u6587\u4ef6\u5939\u5220\u9664 {name}\uff1f\u8fd9\u4e2a\u64cd\u4f5c\u4e0d\u80fd\u64a4\u9500\u3002', deleteConfirm: '\u5220\u9664', cancel: '\u53d6\u6d88', replaceTitle: '\u66ff\u6362 Mod\uff1f', replaceMessage: 'mods \u91cc\u5df2\u7ecf\u6709 {name}\u3002\u662f\u5426\u7528\u5bfc\u5165\u7684 mod \u66ff\u6362\u5b83\uff1f', replaceConfirm: '\u66ff\u6362', deletedMod: '\u5df2\u5220\u9664 {name}\u3002\u5df2\u7ecf\u8fd0\u884c\u7684\u4ee3\u7801\u9700\u8981 reload \u624d\u4f1a\u5378\u8f7d\u3002', deleteFailed: '\u5220\u9664\u5931\u8d25\uff1a{value}', importHint: '\u628a\u6587\u4ef6\u62d6\u5230\u8fd9\u91cc\u6216\u590d\u5236', importDetail: '\u53ef\u4ee5\u628a mod zip \u5305\u76f4\u63a5\u62d6\u5165\uff0c\u6216\u8005\u590d\u5236 zip \u5305\u540e\u5728\u8fd9\u91cc\u6309\u7c98\u8d34\u5feb\u6377\u952e\uff0cModLoader \u4f1a\u81ea\u52a8\u89e3\u5305\u5230 mods \u6587\u4ef6\u5939\u3002', importWaiting: '\u7b49\u5f85 zip \u6587\u4ef6...', importNoZip: '\u8bf7\u62d6\u5165\u6216\u7c98\u8d34 .zip \u6587\u4ef6\u3002', importNoPath: '\u65e0\u6cd5\u8bfb\u53d6\u8be5\u6587\u4ef6\u8def\u5f84\u3002', importing: '\u6b63\u5728\u5bfc\u5165 {name}...', importedMod: '\u5df2\u5bfc\u5165 {name}\u3002\u9700\u8981\u65f6\u52fe\u9009\u5b83\u5e76\u4fdd\u5b58 reload\u3002', importFailed: '\u5bfc\u5165\u5931\u8d25\uff1a{value}', importModeOff: '\u8fd4\u56de mod \u5217\u8868', invalidZip: '\u53ea\u80fd\u5bfc\u5165 .zip mod \u5305\u3002', zipNoMod: '\u8fd9\u4e2a zip \u5185\u6ca1\u6709 mod.json\u3002', zipMultipleMods: '\u8fd9\u4e2a zip \u5305\u542b\u591a\u4e2a mod \u6587\u4ef6\u5939\uff1b\u8bf7\u4e00\u6b21\u5bfc\u5165\u4e00\u4e2a mod\u3002', zipExtractFailed: '\u65e0\u6cd5\u89e3\u538b zip\uff1a{value}', folderOpened: '\u5df2\u6253\u5f00 mods \u6587\u4ef6\u5939\u3002', replaceRenamedUniqueTitle: '\u53d1\u73b0\u540c\u552f\u4e00\u7801 Mod', replaceRenamedUniqueMessage: '\u65b0\u6587\u4ef6\u8ddf\u5df2\u6709\u6587\u4ef6\u6709\u76f8\u540c\u7684 mod \u552f\u4e00\u7801\uff0c\u5b83\u5f88\u53ef\u80fd\u662f\u65e7\u6587\u4ef6\u7684\u66f4\u65b0\u548c\u6539\u540d\u3002\n{oldName} \u2192 {newName}\n\u662f\u5426\u8986\u76d6\u65e7\u6587\u4ef6\uff1f', replaceRenamedPreviousTitle: '\u53d1\u73b0 Mod \u6539\u540d', replaceRenamedPreviousMessage: '\u8fd9\u4e2a\u65b0\u6587\u4ef6\u662f\u5df2\u6709\u6587\u4ef6\u7684\u6539\u540d\u3002\n{oldName} \u2192 {newName}\n\u662f\u5426\u8986\u76d6\u65e7\u6587\u4ef6\uff1f', replaceOld: '\u8986\u76d6', keepImported: '\u4e0d\u8986\u76d6\uff08\u52a0\u5165\u65b0\u6587\u4ef6\uff09', uniqueCodeEditTitle: '\u63a8\u8350\u4fee\u6539 mod \u552f\u4e00\u7801', uniqueCodeEditMessage: '\u8fd9\u4e24\u4e2a mod \u4f1a\u5171\u7528\u540c\u4e00\u4e2a mod \u552f\u4e00\u7801\u3002\u662f\u5426\u5728\u52a0\u5165\u65b0\u6587\u4ef6\u524d\u4fee\u6539\u5bfc\u5165 mod \u7684\u552f\u4e00\u7801\uff1f', uniqueCodeLabel: 'mod \u552f\u4e00\u7801', uniqueCodeConfirm: '\u786e\u8ba4\u4fee\u6539', uniqueCodeSkip: '\u5426\uff08\u4e0d\u4fee\u6539\uff09', manifestReadFailed: '\u65e0\u6cd5\u8bfb\u53d6 mod.json\uff1a{value}', translationFile: '\u7ffb\u8bd1', translationFileTitle: '\u6253\u5f00\u7ffb\u8bd1\u6587\u4ef6', translationFileSynced: '\u7ffb\u8bd1\u6587\u4ef6\u5df2\u540c\u6b65\uff1a{path}', translationFileFailed: '\u7ffb\u8bd1\u6587\u4ef6\u5931\u8d25\uff1a{value}'
		}
	}
	PANEL_TEXT.modsch = PANEL_TEXT.sch
	PANEL_TEXT.tch = PANEL_TEXT.sch
	const TRANSLATION_CATALOG_FILE = 'translations.json'
	const TRANSLATION_CATALOG_VERSION = 1
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
			#modloader-panel { position: fixed; right: 16px; top: 16px; z-index: 2147483647; box-sizing: border-box; width: min(860px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; padding: 14px; border-radius: 8px; background: rgba(8, 10, 12, .94); color: rgba(255,255,255,.92); box-shadow: 0 12px 36px rgba(0,0,0,.35); font: 13px/1.45 Montserrat, Arial, sans-serif; transition: left .22s ease, top .22s ease, right .22s ease, background .16s ease, box-shadow .16s ease; }
			#modloader-panel.modloader-panel-modal-open > :not(.modloader-modal) { filter: blur(4px); opacity: .52; pointer-events: none; user-select: none; }
			#modloader-panel h2 { flex: 1 1 auto; min-width: 0; margin: 0; font-size: 16px; }
			#modloader-panel h3 { margin: 14px 0 6px; font-size: 13px; color: rgba(255,255,255,.72); }
			#modloader-panel button, #modloader-panel input, #modloader-panel textarea, #modloader-panel select { font: inherit; }
			#modloader-panel .modloader-panel-header { display: flex; align-items: center; gap: 10px; margin: -3px -3px 8px; padding: 3px; cursor: grab; user-select: none; touch-action: none; }
			#modloader-panel .modloader-panel-header:active { cursor: grabbing; }
			#modloader-panel .modloader-panel-controls { display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; }
			#modloader-panel .modloader-panel-close, #modloader-panel .modloader-panel-edge, #modloader-panel .modloader-panel-settings { position: relative; display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 5px; padding: 0; background: transparent; color: rgba(255,255,255,.8); cursor: pointer; }
			#modloader-panel .modloader-panel-close:before, #modloader-panel .modloader-panel-close:after { content: ''; position: absolute; left: 50%; top: 50%; width: 15px; height: 2px; border-radius: 999px; background: currentColor; transform-origin: center; }
			#modloader-panel .modloader-panel-close:before { transform: translate(-50%, -50%) rotate(45deg); }
			#modloader-panel .modloader-panel-close:after { transform: translate(-50%, -50%) rotate(-45deg); }
			#modloader-panel .modloader-panel-edge { font: 700 15px/1 Montserrat, Arial, sans-serif; letter-spacing: -1px; }
			#modloader-panel .modloader-panel-edge-icon { display: block; transform: translateY(-1px); }
			#modloader-panel .modloader-panel-settings:before { content: '\\2699'; display: block; font-size: 16px; line-height: 1; transform: translateY(1px); }
			#modloader-panel .modloader-panel-settings.active, #modloader-panel .modloader-panel-edge:hover:not(:disabled), #modloader-panel .modloader-panel-settings:hover, #modloader-panel .modloader-panel-close:hover { color: #fff; background: rgba(255,255,255,.08); }
			#modloader-panel .modloader-panel-edge:disabled { cursor: default; opacity: .34; }
			#modloader-panel.modloader-panel-dragging { transition: none; }
			#modloader-panel.modloader-panel-autohidden { width: 42px; height: 42px; max-height: 42px; overflow: visible; padding: 0; background: transparent; box-shadow: none; pointer-events: none; }
			#modloader-panel.modloader-panel-autohidden > :not(.modloader-panel-tab) { display: none; }
			#modloader-panel .modloader-panel-tab { position: absolute; inset: 0; display: none; place-items: center; width: 42px; height: 42px; border: 1px solid rgba(255,255,255,.14); border-radius: 8px; padding: 0; background: rgba(8,10,12,.9); color: inherit; box-shadow: 0 8px 22px rgba(0,0,0,.32); cursor: grab; pointer-events: auto; touch-action: none; }
			#modloader-panel .modloader-panel-tab:active { cursor: grabbing; }
			#modloader-panel.modloader-panel-autohidden .modloader-panel-tab { display: grid; }
			#modloader-panel.modloader-panel-hidden-left .modloader-panel-tab { border-radius: 0 8px 8px 0; }
			#modloader-panel.modloader-panel-hidden-right .modloader-panel-tab { border-radius: 8px 0 0 8px; }
			#modloader-panel.modloader-panel-hidden-top .modloader-panel-tab { border-radius: 0 0 8px 8px; }
			#modloader-panel.modloader-panel-hidden-bottom .modloader-panel-tab { border-radius: 8px 8px 0 0; }
			#modloader-panel .modloader-panel-tab-logo { width: 24px; height: 24px; border-radius: 5px; background: url('img/logo/sheet.png'); background-size: 400% 200%; box-shadow: inset 0 0 0 1px rgba(255,255,255,.14), 0 2px 8px rgba(0,0,0,.22); }
			#modloader-panel .modloader-panel-settings-page { display: none; gap: 9px; margin: 0 0 12px; padding: 10px 0 11px; border-top: 1px solid rgba(255,255,255,.09); border-bottom: 1px solid rgba(255,255,255,.09); }
			#modloader-panel .modloader-panel-settings-page.active { display: grid; }
			#modloader-panel .modloader-panel-settings-title { color: rgba(255,255,255,.86); font-weight: 600; }
			#modloader-panel .modloader-panel-settings-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: rgba(255,255,255,.72); }
			#modloader-panel .modloader-panel-settings-options { display: inline-flex; align-items: center; gap: 4px; padding: 2px; border-radius: 7px; background: rgba(255,255,255,.07); }
			#modloader-panel .modloader-panel-settings-option { border: 0; border-radius: 5px; padding: 5px 8px; background: transparent; color: rgba(255,255,255,.7); cursor: pointer; }
			#modloader-panel .modloader-panel-settings-option.active { background: rgba(255,255,255,.92); color: rgba(10,12,14,.92); }
			#modloader-panel .modloader-panel-settings-number-wrap { display: inline-flex; align-items: center; gap: 5px; color: rgba(255,255,255,.58); }
			#modloader-panel .modloader-panel-settings-number { box-sizing: border-box; width: 66px; border: 1px solid rgba(255,255,255,.14); border-radius: 5px; padding: 4px 6px; background: rgba(0,0,0,.2); color: rgba(255,255,255,.88); text-align: right; outline: none; }
			#modloader-panel .modloader-panel-settings-number:focus { border-color: rgba(207,233,255,.5); }
			#modloader-panel .modloader-panel-settings-unit { font-size: 12px; }
			#modloader-panel.modloader-panel-theme-light { background: rgba(248,248,246,.96); color: rgba(18,20,22,.94); box-shadow: 0 12px 36px rgba(0,0,0,.18); }
			#modloader-panel.modloader-panel-theme-light h3, #modloader-panel.modloader-panel-theme-light .modloader-panel-note, #modloader-panel.modloader-panel-theme-light .modloader-panel-label, #modloader-panel.modloader-panel-theme-light .modloader-panel-settings-row, #modloader-panel.modloader-panel-theme-light .modloader-select-all-control { color: rgba(30,32,34,.68); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-settings-title, #modloader-panel.modloader-panel-theme-light .modloader-panel-value, #modloader-panel.modloader-panel-theme-light .modloader-mod-path, #modloader-panel.modloader-panel-theme-light .modloader-mod-label, #modloader-panel.modloader-panel-theme-light .modloader-mod-config-title, #modloader-panel.modloader-panel-theme-light .modloader-config-label { color: rgba(18,20,22,.9); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-close, #modloader-panel.modloader-panel-theme-light .modloader-panel-edge, #modloader-panel.modloader-panel-theme-light .modloader-panel-settings { color: rgba(18,20,22,.72); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-settings.active, #modloader-panel.modloader-panel-theme-light .modloader-panel-edge:hover:not(:disabled), #modloader-panel.modloader-panel-theme-light .modloader-panel-settings:hover, #modloader-panel.modloader-panel-theme-light .modloader-panel-close:hover { color: #111; background: rgba(0,0,0,.08); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-settings-page { border-color: rgba(0,0,0,.1); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-settings-options { background: rgba(0,0,0,.06); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-settings-option { color: rgba(18,20,22,.66); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-settings-option.active { background: rgba(18,20,22,.9); color: #fff; }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-settings-number-wrap { color: rgba(18,20,22,.56); }
			#modloader-panel.modloader-panel-theme-light .modloader-mod-toolbar { background: rgba(248,248,246,.96); }
			#modloader-panel.modloader-panel-theme-light .modloader-mod-row, #modloader-panel.modloader-panel-theme-light .modloader-panel-log, #modloader-panel.modloader-panel-theme-light .modloader-import-zone { border-color: rgba(0,0,0,.1); background: rgba(0,0,0,.035); }
			#modloader-panel.modloader-panel-theme-light .modloader-import-zone.dragging { border-color: rgba(18,20,22,.28); background: rgba(18,20,22,.06); }
			#modloader-panel.modloader-panel-theme-light .modloader-import-copy { color: rgba(18,20,22,.62); }
			#modloader-panel.modloader-panel-theme-light .modloader-import-title { color: rgba(18,20,22,.88); }
			#modloader-panel.modloader-panel-theme-light .modloader-import-detail { color: rgba(18,20,22,.56); }
			#modloader-panel.modloader-panel-theme-light .modloader-import-status { color: rgba(18,20,22,.62); }
			#modloader-panel.modloader-panel-theme-light .modloader-mod-name, #modloader-panel.modloader-panel-theme-light .modloader-mod-version, #modloader-panel.modloader-panel-theme-light .modloader-mod-meta, #modloader-panel.modloader-panel-theme-light .modloader-config-meta { color: rgba(18,20,22,.58); }
			#modloader-panel.modloader-panel-theme-light input.modloader-config-input:not([type="checkbox"]), #modloader-panel.modloader-panel-theme-light textarea.modloader-config-input, #modloader-panel.modloader-panel-theme-light select.modloader-config-input, #modloader-panel.modloader-panel-theme-light .modloader-panel-settings-number, #modloader-panel.modloader-panel-theme-light .modloader-resource-color-text, #modloader-panel.modloader-panel-theme-light .modloader-color-text { background: rgba(0,0,0,.045); border-color: rgba(0,0,0,.14); color: rgba(18,20,22,.92); }
			#modloader-panel.modloader-panel-theme-light .modloader-config-slider-number { background: rgba(0,0,0,.045); border-color: rgba(0,0,0,.14); color: rgba(18,20,22,.92); }
			#modloader-panel.modloader-panel-theme-light .modloader-config-slider-labels, #modloader-panel.modloader-panel-theme-light .modloader-config-slider-value { color: rgba(18,20,22,.58); }
			#modloader-panel.modloader-panel-theme-light .modloader-config-slider-range::-webkit-slider-runnable-track { background: linear-gradient(90deg, rgba(18,20,22,.52) 0 var(--modloader-slider-fill, 0%), rgba(0,0,0,.12) var(--modloader-slider-fill, 0%) 100%); box-shadow: inset 0 1px 2px rgba(0,0,0,.18); }
			#modloader-panel.modloader-panel-theme-light .modloader-config-slider-range::-moz-range-track { background: rgba(0,0,0,.12); box-shadow: inset 0 1px 2px rgba(0,0,0,.18); }
			#modloader-panel.modloader-panel-theme-light .modloader-config-slider-range::-moz-range-progress { background: rgba(18,20,22,.52); }
			#modloader-panel.modloader-panel-theme-light .modloader-action-button, #modloader-panel.modloader-panel-theme-light .modloader-modal-button, #modloader-panel.modloader-panel-theme-light .modloader-resource-color-reset, #modloader-panel.modloader-panel-theme-light .modloader-resource-color-share-button, #modloader-panel.modloader-panel-theme-light .modloader-color-reset { background: rgba(0,0,0,.055); border-color: rgba(0,0,0,.12); color: rgba(18,20,22,.78); }
			#modloader-panel.modloader-panel-theme-light .modloader-resource-color-share-status { color: rgba(18,20,22,.54); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-tab { background: rgba(248,248,246,.95); border-color: rgba(0,0,0,.12); }
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
			#modloader-panel .modloader-toolbar-left { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
			#modloader-panel .modloader-select-all-control { display: inline-flex; align-items: center; gap: 7px; flex: 0 0 auto; color: rgba(255,255,255,.78); font-size: 12px; cursor: pointer; user-select: none; }
			#modloader-panel .modloader-select-all-text { transform: translateY(.5px); }
			#modloader-panel .modloader-panel-note { color: rgba(255,255,255,.7); }
			#modloader-panel .modloader-panel-reload-note { display: none; color: #ffe1a3; }
			#modloader-panel .modloader-panel-reload-note.active { display: inline; }
			#modloader-panel .modloader-panel-config-note { position: absolute; right: 2px; top: calc(100% + 2px); display: block; box-sizing: border-box; max-width: min(520px, calc(100% - 16px)); overflow: hidden; border-radius: 999px; padding: 3px 8px; background: rgba(8,10,12,.88); color: rgba(207,233,255,.88); box-shadow: 0 5px 14px rgba(0,0,0,.22); opacity: 0; pointer-events: none; text-overflow: ellipsis; white-space: nowrap; transform: translateY(-3px); transition: opacity .14s ease, transform .14s ease; }
			#modloader-panel .modloader-panel-config-note.active { opacity: 1; transform: translateY(0); }
			#modloader-panel.modloader-panel-theme-light .modloader-panel-config-note { border: 1px solid rgba(0,0,0,.08); background: rgba(248,248,246,.96); color: rgba(18,20,22,.58); box-shadow: 0 5px 14px rgba(0,0,0,.12); }
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
			#modloader-panel .modloader-action-icon-translation:before { content: 'Aa'; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -52%); font: 700 10px/1 Montserrat, Arial, sans-serif; letter-spacing: -.5px; }
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
			#modloader-panel .modloader-mod-row { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: flex-start; padding: 9px; border: 1px solid rgba(255,255,255,.1); border-radius: 7px; background: rgba(255,255,255,.045); transition: border-color .14s ease, background .14s ease, box-shadow .14s ease, opacity .14s ease; }
			#modloader-panel .modloader-mod-row-configurable { cursor: pointer; }
			#modloader-panel .modloader-mod-row-configurable:hover { border-color: rgba(207,233,255,.28); }
			#modloader-panel .modloader-mod-row-expanded { border-color: rgba(207,233,255,.5); box-shadow: 0 8px 22px rgba(0,0,0,.16); }
			#modloader-panel .modloader-mod-row-moving { z-index: 3; will-change: transform; }
			#modloader-panel .modloader-mod-row-dragging { z-index: 6; opacity: .96; box-shadow: 0 14px 34px rgba(0,0,0,.36); pointer-events: none; }
			#modloader-panel .modloader-mod-sort-placeholder { min-height: 24px; border: 1px dashed rgba(207,233,255,.34); border-radius: 7px; background: rgba(207,233,255,.055); box-sizing: border-box; transition: height .16s ease, min-height .16s ease, background .16s ease, border-color .16s ease; }
			#modloader-panel .modloader-mod-row-selected { border-color: rgba(174, 231, 160, .42); background: rgba(120, 190, 120, .08); }
			#modloader-panel .modloader-mod-row-problem { border-color: rgba(255, 196, 87, .48); }
			#modloader-panel .modloader-mod-check { margin-top: 2px; }
			#modloader-panel .modloader-mod-main { min-width: 0; }
			#modloader-panel .modloader-mod-actions { display: inline-flex; align-items: center; justify-content: flex-end; gap: 2px; padding-top: 0; }
			#modloader-panel .modloader-mod-index { min-width: 13px; border: 0; padding: 0; background: transparent; color: rgba(255,255,255,.5); text-align: right; font: 700 11px/1 Montserrat, Arial, sans-serif; pointer-events: none; }
			#modloader-panel .modloader-mod-delete, #modloader-panel .modloader-mod-sort { position: relative; width: 25px; height: 25px; border: 0; border-radius: 5px; background: transparent; color: rgba(255,255,255,.56); cursor: pointer; }
			#modloader-panel .modloader-mod-sort { cursor: grab; touch-action: none; }
			#modloader-panel .modloader-mod-sort:active { cursor: grabbing; }
			#modloader-panel .modloader-mod-sort:before { content: ''; position: absolute; left: 7px; top: 7px; width: 11px; height: 2px; border-radius: 999px; background: currentColor; box-shadow: 0 5px 0 currentColor, 0 10px 0 currentColor; }
			#modloader-panel .modloader-mod-delete:hover { color: #ffb0b0; background: rgba(255,96,96,.1); }
			#modloader-panel .modloader-mod-sort:hover { color: rgba(255,255,255,.86); background: rgba(255,255,255,.08); }
			#modloader-panel .modloader-mod-delete:before { content: ''; position: absolute; left: 8px; top: 9px; width: 9px; height: 10px; border: 2px solid currentColor; border-top: 0; border-radius: 1px 1px 3px 3px; box-sizing: border-box; }
			#modloader-panel .modloader-mod-delete:after { content: ''; position: absolute; left: 7px; top: 6px; width: 11px; height: 2px; border-radius: 999px; background: currentColor; box-shadow: 3px -3px 0 -1px currentColor; }
			#modloader-panel .modloader-mod-title { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
			#modloader-panel .modloader-mod-path { font-weight: 600; overflow-wrap: anywhere; }
			#modloader-panel .modloader-mod-version { color: rgba(255,255,255,.58); }
			#modloader-panel.modloader-panel-theme-light .modloader-mod-delete, #modloader-panel.modloader-panel-theme-light .modloader-mod-sort { color: rgba(18,20,22,.46); }
			#modloader-panel.modloader-panel-theme-light .modloader-mod-sort:hover { color: rgba(18,20,22,.76); background: rgba(0,0,0,.06); }
			#modloader-panel.modloader-panel-theme-light .modloader-mod-index { color: rgba(18,20,22,.46); }
			#modloader-panel .modloader-mod-name { color: rgba(255,255,255,.72); overflow-wrap: anywhere; }
			#modloader-panel .modloader-mod-meta { margin-top: 3px; color: rgba(255,255,255,.62); overflow-wrap: anywhere; }
			#modloader-panel .modloader-mod-warning { display: none; margin-top: 5px; color: #ffe1a3; overflow-wrap: anywhere; }
			#modloader-panel .modloader-mod-warning.active { display: block; }
			#modloader-panel .modloader-mod-config { max-height: 0; margin-top: 0; padding-top: 0; border-top: 1px solid transparent; opacity: 0; overflow: hidden; pointer-events: none; transform: translateY(-4px); transition: max-height .2s ease, margin-top .2s ease, padding-top .2s ease, border-top-color .2s ease, opacity .16s ease, transform .2s ease; }
			#modloader-panel .modloader-mod-row-expanded .modloader-mod-config { max-height: min(42vh, 380px); margin-top: 8px; padding-top: 8px; border-top-color: rgba(255,255,255,.09); opacity: 1; pointer-events: auto; transform: translateY(0); }
			#modloader-panel .modloader-mod-config-title { margin-bottom: 5px; color: rgba(255,255,255,.72); font-weight: 600; }
			#modloader-panel .modloader-mod-config-scroll { max-height: min(34vh, 310px); overflow-x: hidden; overflow-y: auto; padding-right: 5px; scrollbar-gutter: stable; scrollbar-width: thin; scrollbar-color: rgba(185,185,185,.48) transparent; }
			#modloader-panel .modloader-mod-config-scroll::-webkit-scrollbar { width: 4px; }
			#modloader-panel .modloader-mod-config-scroll::-webkit-scrollbar-track { background: transparent; }
			#modloader-panel .modloader-mod-config-scroll::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(185,185,185,.48); }
			#modloader-panel .modloader-mod-config-scroll::-webkit-scrollbar-thumb:hover { background: rgba(210,210,210,.62); }
			#modloader-panel .modloader-mod-config-scroll .modloader-config-field:first-child { margin-top: 0; }
			#modloader-panel .modloader-config-field { display: grid; grid-template-columns: minmax(130px, .8fr) minmax(170px, 1fr); gap: 4px 10px; align-items: center; margin-top: 6px; }
			#modloader-panel .modloader-config-field-disabled { opacity: .52; }
			#modloader-panel .modloader-config-text { min-width: 0; }
			#modloader-panel .modloader-config-label { display: block; color: rgba(255,255,255,.86); overflow-wrap: anywhere; }
			#modloader-panel .modloader-config-meta { display: block; font-size: 11px; color: rgba(255,255,255,.48); overflow-wrap: anywhere; }
			#modloader-panel input.modloader-config-input:not([type="checkbox"]), #modloader-panel textarea.modloader-config-input, #modloader-panel select.modloader-config-input { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid rgba(255,255,255,.16); border-radius: 5px; padding: 5px 6px; background: rgba(0,0,0,.22); color: rgba(255,255,255,.92); outline: none; }
			#modloader-panel .modloader-config-slider { display: grid; grid-template-columns: minmax(0, 1fr) 66px; gap: 4px 8px; align-items: center; width: 100%; min-width: 0; --modloader-slider-thumb-half: 14px; }
			#modloader-panel .modloader-config-slider-labeled { grid-template-columns: minmax(0, 1fr); }
			#modloader-panel .modloader-config-slider-range { appearance: none; -webkit-appearance: none; width: 100%; min-width: 0; height: 32px; margin: 0; background: transparent; cursor: grab; outline: none; }
			#modloader-panel .modloader-config-slider-range:active { cursor: grabbing; }
			#modloader-panel .modloader-config-slider-range::-webkit-slider-runnable-track { height: 6px; border-radius: 999px; background: linear-gradient(90deg, rgba(207,233,255,.82) 0 var(--modloader-slider-fill, 0%), rgba(255,255,255,.14) var(--modloader-slider-fill, 0%) 100%); box-shadow: inset 0 1px 3px rgba(0,0,0,.42); transition: background .14s ease, box-shadow .14s ease; }
			#modloader-panel .modloader-config-slider-range::-webkit-slider-thumb { -webkit-appearance: none; width: 28px; height: 31px; margin-top: -12px; border: 0; background: url('img/resources.png') -196px 0 / 280px 31px no-repeat; filter: drop-shadow(0 2px 3px rgba(0,0,0,.55)) drop-shadow(0 0 5px rgba(207,233,255,.22)); transition: filter .14s ease; }
			#modloader-panel .modloader-config-slider-range::-moz-range-track { height: 6px; border-radius: 999px; background: rgba(255,255,255,.14); box-shadow: inset 0 1px 3px rgba(0,0,0,.42); transition: background .14s ease, box-shadow .14s ease; }
			#modloader-panel .modloader-config-slider-range::-moz-range-progress { height: 6px; border-radius: 999px; background: rgba(207,233,255,.82); }
			#modloader-panel .modloader-config-slider-range::-moz-range-thumb { width: 28px; height: 31px; border: 0; background: url('img/resources.png') -196px 0 / 280px 31px no-repeat; filter: drop-shadow(0 2px 3px rgba(0,0,0,.55)) drop-shadow(0 0 5px rgba(207,233,255,.22)); transition: filter .14s ease; }
			#modloader-panel .modloader-config-slider-range:focus-visible::-webkit-slider-thumb { filter: drop-shadow(0 2px 3px rgba(0,0,0,.58)) drop-shadow(0 0 8px rgba(207,233,255,.52)); }
			#modloader-panel .modloader-config-slider-range:focus-visible::-moz-range-thumb { filter: drop-shadow(0 2px 3px rgba(0,0,0,.58)) drop-shadow(0 0 8px rgba(207,233,255,.52)); }
			#modloader-panel .modloader-config-slider-number { box-sizing: border-box; width: 66px; min-width: 0; border: 1px solid rgba(255,255,255,.16); border-radius: 5px; padding: 5px 6px; background: rgba(0,0,0,.22); color: rgba(255,255,255,.92); text-align: right; outline: none; }
			#modloader-panel .modloader-config-slider-number:focus { border-color: rgba(207, 233, 255, .5); }
			#modloader-panel .modloader-config-slider-labeled .modloader-config-slider-number { display: none; }
			#modloader-panel .modloader-config-slider-labels { position: relative; height: 13px; min-width: 0; margin: -9px var(--modloader-slider-thumb-half) 0; color: rgba(255,255,255,.48); font-size: 10px; }
			#modloader-panel .modloader-config-slider-labels span { position: absolute; top: 0; max-width: 74px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; transform: translateX(-50%); }
			#modloader-panel .modloader-config-slider-value { min-width: 0; text-align: center; color: rgba(255,255,255,.72); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
			#modloader-panel .modloader-config-slider[data-disabled=true] { opacity: .52; }
			#modloader-panel .modloader-config-slider-range:disabled, #modloader-panel .modloader-config-slider-number:disabled { cursor: default; }
			#modloader-panel .modloader-switch-input { appearance: none; -webkit-appearance: none; position: relative; width: 46px; height: 24px; margin: 0; border: 0; border-radius: 999px; background: rgba(18,21,24,.66); box-shadow: inset 0 2px 6px rgba(0,0,0,.48), inset 0 -1px 0 rgba(255,255,255,.06), inset 0 0 0 1px rgba(255,255,255,.08), 0 1px 2px rgba(255,255,255,.04); cursor: pointer; outline: none; transition: background .18s ease, box-shadow .18s ease, opacity .18s ease; vertical-align: middle; }
			#modloader-panel .modloader-switch-input:before { content: ''; position: absolute; left: 2px; top: 2px; width: 20px; height: 20px; border-radius: 50%; background: linear-gradient(145deg, rgba(255,255,255,.98), rgba(220,230,237,.96)); box-shadow: 0 3px 7px rgba(0,0,0,.34), 0 1px 1px rgba(0,0,0,.24), inset 0 1px 1px rgba(255,255,255,.92), inset 0 -1px 2px rgba(0,0,0,.12); transition: transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .18s ease; }
			#modloader-panel .modloader-switch-input:after { content: 'OFF'; position: absolute; right: 6px; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,.46); font: 700 9px/1 Montserrat, Arial, sans-serif; letter-spacing: .25px; text-shadow: 0 1px 2px rgba(0,0,0,.42); transition: left .18s ease, right .18s ease, color .18s ease, text-shadow .18s ease; }
			#modloader-panel .modloader-switch-input:checked { background: linear-gradient(135deg, rgba(227,253,67,.98), rgba(166,242,70,.96) 42%, rgba(76,185,107,.98)); box-shadow: inset 0 2px 5px rgba(0,0,0,.18), inset 0 -1px 0 rgba(255,255,255,.34), inset 0 0 0 1px rgba(255,255,255,.26), 0 0 10px rgba(227,253,67,.9), 0 0 24px rgba(166,242,70,.68), 0 0 46px rgba(166,242,70,.38), 0 0 72px rgba(76,185,107,.24); }
			#modloader-panel .modloader-switch-input:checked:before { transform: translateX(22px); box-shadow: 0 3px 8px rgba(0,0,0,.3), 0 0 12px rgba(255,255,255,.34), 0 0 18px rgba(227,253,67,.42), inset 0 1px 1px rgba(255,255,255,.96), inset 0 -1px 2px rgba(0,0,0,.1); }
			#modloader-panel .modloader-switch-input:checked:after { content: 'ON'; left: 7px; right: auto; color: #fff; text-shadow: 0 0 6px rgba(255,255,255,.62), 0 0 12px rgba(227,253,67,.56), 0 1px 2px rgba(0,0,0,.32); }
			#modloader-panel .modloader-switch-input:hover:not(:disabled):before { box-shadow: 0 4px 9px rgba(0,0,0,.38), 0 1px 1px rgba(0,0,0,.24), inset 0 1px 1px rgba(255,255,255,.95), inset 0 -1px 2px rgba(0,0,0,.12); }
			#modloader-panel .modloader-switch-input:checked:hover:not(:disabled) { box-shadow: inset 0 2px 5px rgba(0,0,0,.16), inset 0 -1px 0 rgba(255,255,255,.36), inset 0 0 0 1px rgba(255,255,255,.3), 0 0 14px rgba(227,253,67,1), 0 0 32px rgba(166,242,70,.78), 0 0 58px rgba(166,242,70,.44), 0 0 86px rgba(76,185,107,.28); }
			#modloader-panel .modloader-switch-input:focus-visible { box-shadow: inset 0 2px 6px rgba(0,0,0,.42), inset 0 0 0 1px rgba(255,255,255,.16), 0 0 0 2px rgba(124,238,153,.34), 0 0 14px rgba(124,238,153,.24); }
			#modloader-panel .modloader-switch-input:disabled { cursor: default; opacity: .45; }
			#modloader-panel textarea.modloader-config-input { min-height: 54px; resize: vertical; }
			#modloader-panel .modloader-config-input:focus { border-color: rgba(207, 233, 255, .5); }
			#modloader-panel .modloader-config-field-invalid .modloader-config-input { border-color: rgba(255, 96, 96, .72); }
			#modloader-panel .modloader-config-error { display: none; grid-column: 2; color: #ffb0b0; font-size: 11px; }
			#modloader-panel .modloader-config-error.active { display: block; }
			#modloader-panel .modloader-color-input { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 8px; align-items: center; min-width: 0; }
			#modloader-panel .modloader-color-picker { width: 30px; height: 28px; box-sizing: border-box; border: 1px solid rgba(255,255,255,.18); border-radius: 5px; padding: 0; background: transparent; color: inherit; cursor: pointer; }
			#modloader-panel .modloader-color-text { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid rgba(255,255,255,.16); border-radius: 5px; padding: 5px 6px; background: rgba(0,0,0,.22); color: rgba(255,255,255,.92); outline: none; }
			#modloader-panel .modloader-color-text:focus { border-color: rgba(207, 233, 255, .5); }
			#modloader-panel .modloader-color-reset { border: 1px solid rgba(255,255,255,.14); border-radius: 5px; padding: 5px 7px; background: rgba(255,255,255,.08); color: rgba(255,255,255,.78); cursor: pointer; }
			#modloader-panel .modloader-color-reset:hover { background: rgba(255,255,255,.14); color: rgba(255,255,255,.94); }
			#modloader-panel .modloader-resource-colors { display: grid; gap: 6px; min-width: 0; }
			#modloader-panel .modloader-resource-color-tools { display: flex; align-items: center; gap: 7px; min-width: 0; margin-bottom: 2px; }
			#modloader-panel .modloader-resource-color-share-button { border: 1px solid rgba(255,255,255,.14); border-radius: 5px; padding: 5px 7px; background: rgba(255,255,255,.08); color: rgba(255,255,255,.78); cursor: pointer; }
			#modloader-panel .modloader-resource-color-share-button:hover { background: rgba(255,255,255,.14); color: rgba(255,255,255,.94); }
			#modloader-panel .modloader-resource-color-share-button:disabled { cursor: default; opacity: .45; }
			#modloader-panel .modloader-resource-color-share-status { min-width: 0; color: rgba(255,255,255,.5); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
			#modloader-panel .modloader-resource-color-share-status[data-tone="ok"] { color: #cfe9ff; }
			#modloader-panel .modloader-resource-color-share-status[data-tone="error"] { color: #ffb0b0; }
			#modloader-panel .modloader-resource-color-row { display: grid; grid-template-columns: 38px 34px minmax(0, 1fr) auto; gap: 8px; align-items: center; min-width: 0; }
			#modloader-panel .modloader-resource-colors-no-icons .modloader-resource-color-row { grid-template-columns: 34px minmax(0, 1fr) auto; }
			#modloader-panel .modloader-resource-color-icon { display: block; width: 36px; height: 40px; background-image: url('img/resources.png'); background-size: 360px 40px; background-repeat: no-repeat; filter: drop-shadow(0 1px 2px rgba(255,255,255,.78)); }
			#modloader-panel .modloader-resource-colors-no-icons .modloader-resource-color-icon { display: none; }
			#modloader-panel .modloader-resource-color-picker { width: 30px; height: 28px; box-sizing: border-box; border: 1px solid rgba(255,255,255,.18); border-radius: 5px; padding: 0; background: transparent; color: inherit; cursor: pointer; }
			#modloader-panel .modloader-resource-color-text { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid rgba(255,255,255,.16); border-radius: 5px; padding: 5px 6px; background: rgba(0,0,0,.22); color: rgba(255,255,255,.92); outline: none; }
			#modloader-panel .modloader-resource-color-text:focus { border-color: rgba(207, 233, 255, .5); }
			#modloader-panel .modloader-resource-color-reset { border: 1px solid rgba(255,255,255,.14); border-radius: 5px; padding: 5px 7px; background: rgba(255,255,255,.08); color: rgba(255,255,255,.78); cursor: pointer; }
			#modloader-panel .modloader-resource-color-reset:hover { background: rgba(255,255,255,.14); color: rgba(255,255,255,.94); }
			#modloader-panel .modloader-modal { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; padding: 16px; background: rgba(8,10,12,.2); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
			#modloader-panel .modloader-modal-box { width: min(420px, 100%); border: 1px solid rgba(255,255,255,.12); border-radius: 8px; padding: 14px; background: rgba(10,12,14,.92); box-shadow: 0 14px 36px rgba(0,0,0,.36); }
			#modloader-panel .modloader-modal-title { margin: 0 0 8px; font-size: 14px; color: rgba(255,255,255,.94); }
			#modloader-panel .modloader-modal-message { color: rgba(255,255,255,.72); overflow-wrap: anywhere; white-space: pre-line; }
			#modloader-panel .modloader-modal-input { box-sizing: border-box; width: 100%; margin-top: 10px; border: 1px solid rgba(255,255,255,.16); border-radius: 6px; padding: 7px 8px; background: rgba(0,0,0,.24); color: rgba(255,255,255,.92); outline: none; }
			#modloader-panel .modloader-modal-input:focus { border-color: rgba(207,233,255,.5); }
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

	const applyTranslationCatalogToManifest = function (manifest, modId, modPath) {
		const catalog = state.translationCatalog
		if (!catalog || !isLocaleObject(catalog.languages) || !isLocaleObject(manifest)) return manifest
		for (const language in catalog.languages) {
			const patch = getCatalogModPatch(catalog.languages[language], modId || manifest.id, modPath)
			if (!isLocaleObject(patch)) continue
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
		return manifest
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
		const before = current ? JSON.stringify(current, null, 2) + '\n' : ''
		const after = JSON.stringify(merged, null, 2) + '\n'
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
	const isResourceColorsConfigType = function (type) {
		return type === 'resourcecolors' || type === 'resource-colors' || type === 'resource_glow_colors' || type === 'resourcecolorpalette' || type === 'resource-color-palette' || type === 'colorpalette' || type === 'color-palette'
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

	const isResourceColorsConfigItem = function (item, type) {
		const control = getConfigControl(item)
		return isResourceColorsConfigType(type) || item.resourceColors === true || control === 'resourcecolors' || control === 'resource-colors' || control === 'resource_glow_colors' || control === 'colorpalette' || control === 'color-palette'
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

	const formatConfigInputValue = function (value, type) {
		if (value === undefined || value === null) {
			if (type === 'array') return '[]'
			if (type === 'object') return '{}'
			return ''
		}
		if (type === 'array' || type === 'object') return JSON.stringify(value, null, 2)
		return String(value)
	}

	const shouldShowResourceColorSharing = function (item) {
		const value = item.importExport ?? item.exportImport ?? item.share ?? item.sharing ?? item.colorSharing
		return value !== false
	}

	const shouldShowResourceColorIcons = function (item) {
		const value = item.showIcons ?? item.showIcon ?? item.icons ?? item.resourceIcons
		return value !== false
	}

	const getResourceColorShareType = function (item) {
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

	const readResourceColorsFromInput = function (root, options) {
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

	const createResourceColorShareText = function (item, root) {
		return JSON.stringify({
			type: getResourceColorShareType(item),
			version: 1,
			key: item.key || '',
			colors: readResourceColorsFromInput(root, { includeDefaults: item.exportDefaults !== false })
		}, null, 2)
	}
	const normalizeResourceColorImportKey = function (key) {
		const text = String(key ?? '').trim()
		if (!text) return ''
		const resourceMatch = text.match(/^r(\d+)$/i)
		return resourceMatch ? String(Number(resourceMatch[1])) : text
	}

	const addResourceColorImportValue = function (out, key, value) {
		const id = normalizeResourceColorImportKey(key)
		const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value.color ?? value.value ?? value.hex) : value
		const color = normalizePanelHexColor(raw)
		if (!id && color) return
		if (id && !color) throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardInvalid))
		if (id && color) out[id] = color
	}

	const normalizeResourceColorImportData = function (data) {
		const source = data && (data.colors ?? data.resourceGlowColors ?? data.resourceColors ?? data.palette ?? data)
		const out = {}
		if (Array.isArray(source)) {
			source.forEach(function (value, index) {
				const key = value && typeof value === 'object' && !Array.isArray(value) ? (value.id ?? value.key ?? value.resource ?? index) : index
				addResourceColorImportValue(out, key, value)
			})
		} else if (source && typeof source === 'object') {
			Object.keys(source).forEach(function (key) { addResourceColorImportValue(out, key, source[key]) })
		} else {
			throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardInvalid))
		}
		if (!Object.keys(out).length) throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardInvalid))
		return out
	}

	const parseResourceColorLines = function (value) {
		const out = {}
		let nextId = 0
		String(value || '').split(/[\r\n,;]+/).map(function (part) { return part.trim() }).filter(Boolean).forEach(function (part) {
			const match = part.match(/^(?:(.+?)\s*[:=]\s*)?(#?[0-9a-f]{3}(?:[0-9a-f]{3})?)$/i)
			if (!match) throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardInvalid))
			const color = normalizePanelHexColor(match[2])
			if (!color) throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardInvalid))
			const id = match[1] !== undefined ? normalizeResourceColorImportKey(match[1]) : String(nextId++)
			if (!id) throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardInvalid))
			out[id] = color
		})
		if (!Object.keys(out).length) throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardEmpty))
		return out
	}

	const parseResourceColorShareText = function (value) {
		const source = String(value || '').trim()
		if (!source) throw new Error(getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardEmpty))
		if (/^[\[{]/.test(source)) {
			try {
				return normalizeResourceColorImportData(JSON.parse(source))
			} catch (error) {
				throw new Error(error.message || getInlineLocalizedText(CONFIG_INLINE_TEXT.colorClipboardInvalid))
			}
		}
		return parseResourceColorLines(source)
	}

	const applyResourceColorsToInput = function (root, colors) {
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
	const createResourceColorShareTools = function (item, root) {
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
				await writePanelClipboardText(createResourceColorShareText(item, root))
				setResourceColorShareStatus(status, getInlineLocalizedText(CONFIG_INLINE_TEXT.colorsCopied), 'ok')
			} catch (error) {
				setResourceColorShareStatus(status, error.message || getInlineLocalizedText(CONFIG_INLINE_TEXT.colorExportFailed), 'error')
			}
		})
		importButton.addEventListener('click', async function (event) {
			event.preventDefault()
			event.stopPropagation()
			try {
				const count = applyResourceColorsToInput(root, parseResourceColorShareText(await readPanelClipboardText()))
				setResourceColorShareStatus(status, getInlineLocalizedText(CONFIG_INLINE_TEXT.colorsImported, { count }), 'ok')
			} catch (error) {
				setResourceColorShareStatus(status, error.message || getInlineLocalizedText(CONFIG_INLINE_TEXT.colorImportFailed), 'error')
			}
		})
		tools.append(exportButton, importButton, status)
		return tools
	}
	const createResourceColorsInput = function (item, value) {
		const root = element('div', 'modloader-resource-colors modloader-config-input')
		root.dataset.modloaderResourceColors = 'true'
		root.dataset.cattailGlowSharing = 'true'
		const showIcons = shouldShowResourceColorIcons(item)
		if (!showIcons) root.classList.add('modloader-resource-colors-no-icons')
		if (shouldShowResourceColorSharing(item)) root.appendChild(createResourceColorShareTools(item, root))
		const resources = getResourceColorConfigRows(item, value)
		for (const resource of resources) {
			const row = element('div', 'modloader-resource-color-row')
			row.dataset.resourceId = String(resource.id)
			row.dataset.defaultColor = resource.defaultColor

			const icon = element('span', 'modloader-resource-color-icon')
			icon.style.backgroundPosition = '-' + (resource.iconIndex * 36) + 'px 0'
			icon.title = resource.name

			const picker = element('input', 'modloader-resource-color-picker')
			picker.type = 'color'
			picker.value = resource.color
			picker.title = resource.name

			const textInput = element('input', 'modloader-resource-color-text')
			textInput.type = 'text'
			textInput.spellcheck = false
			textInput.value = resource.color
			textInput.setAttribute('aria-label', getInlineLocalizedText(CONFIG_INLINE_TEXT.glowColorLabel, { name: resource.name }))

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

			if (showIcons) {
				if (resource.showIcon === false) icon.style.visibility = 'hidden'
				row.appendChild(icon)
			}
			row.append(picker, textInput, reset)
			root.appendChild(row)
		}

		root.readConfigValue = function () {
			return readResourceColorsFromInput(root, { includeDefaults: false })
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
	const getResourceColorConfigRows = function (item, value) {
		const overrides = isObject(value) ? value : {}
		const gameResources = state.game?.codex?.resources || []
		const manifestResources = Array.isArray(item.resources) ? item.resources : (Array.isArray(item.rows) ? item.rows : (Array.isArray(item.colors) ? item.colors : []))
		const count = Math.max(Number(item.count) || 0, gameResources.length, manifestResources.length, 10)
		const rows = []
		for (let i = 0; i < count; i++) {
			const manifestResource = manifestResources[i] || {}
			const explicitId = manifestResource.id ?? manifestResource.key
			const id = explicitId !== undefined ? String(explicitId) : String(i)
			let resourceIndex = getFiniteConfigNumber(manifestResource.resourceIndex ?? manifestResource.resourceId ?? manifestResource.resource ?? explicitId)
			if (resourceIndex === null) resourceIndex = i
			const resource = gameResources[resourceIndex] || gameResources[i] || {}
			let iconIndex = getFiniteConfigNumber(manifestResource.iconIndex ?? manifestResource.icon ?? resourceIndex)
			if (iconIndex === null) iconIndex = i
			const defaultColor = normalizePanelHexColor(manifestResource.defaultColor) || normalizePanelHexColor(resource?.triplet?.[2]) || normalizePanelHexColor(resource?.triplet?.[1]) || normalizePanelHexColor(resource?.triplet?.[0]) || normalizePanelHexColor(manifestResource.color) || '#FFFFFF'
			const override = overrides[id] ?? overrides[String(id)] ?? overrides[i] ?? overrides[String(i)] ?? overrides['r' + id] ?? overrides['r' + i]
			rows.push({
				id,
				name: pickLocalizedText(manifestResource.name || manifestResource.label, getLocaleCandidates()) || String(resource.name || manifestResource.name || manifestResource.label || ('Resource ' + (i + 1))),
				defaultColor,
				color: normalizePanelHexColor(override) || defaultColor,
				iconIndex: Math.max(0, iconIndex),
				showIcon: manifestResource.icon !== false && manifestResource.showIcon !== false
			})
		}
		return rows
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
				if (value) cancelSnapAnimation()
			}
		})

		if (hasValueLabels) {
			for (const labelValue of getSliderLabelValues(item, bounds)) {
				const label = element('span', '', getSliderValueLabel(item, labelValue) || formatSliderNumber(labelValue, bounds))
				label.style.left = getSliderPercent(labelValue, bounds).toFixed(4) + '%'
				labels.appendChild(label)
			}
			root.append(range, number, labels, valueLabel)
		} else {
			root.append(range, number)
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
		return normalizePanelHexColor(item?.defaultColor) || normalizePanelHexColor(item?.colorDefault) || normalizePanelHexColor(item?.default) || '#FFFFFF'
	}

	const createColorConfigInput = function (item, value) {
		const root = element('div', 'modloader-color-input modloader-config-input')
		const displayDefault = getColorConfigDisplayDefault(item)
		const allowAuto = item?.allowAuto === true
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
			setAuto()
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

		root.append(picker, textInput, reset)
		return root
	}
	const createConfigInput = function (item, value) {
		const type = getConfigType(item)
		if (isResourceColorsConfigItem(item, type)) return createResourceColorsInput(item, value)
		if (isColorConfigType(type)) return createColorConfigInput(item, value)
		if (isSliderConfigItem(item, type)) return createSliderConfigInput(item, value, type)
		const input = element(type === 'array' || type === 'object' ? 'textarea' : 'input', 'modloader-config-input')
		if (type === 'boolean') {
			input.type = 'checkbox'
			input.classList.add('modloader-switch-input')
			input.setAttribute('role', 'switch')
			input.checked = value === undefined ? !!item.default : !!value
		} else if (isNumberConfigType(type)) {
			input.type = 'number'
			input.value = formatConfigInputValue(value, type)
			input.step = getConfigNumberStep(item, type)
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
		if (isResourceColorsConfigItem(item, type)) return input.readConfigValue()
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

	const clampNumber = function (value, min, max) {
		return Math.min(Math.max(value, min), max)
	}

	const isValidPanelTheme = function (value) {
		return value === 'dark' || value === 'light'
	}

	const isValidPanelHideMode = function (value) {
		return value === 'auto' || value === 'manual'
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
			if (isObject(stored.settings)) {
				if (isValidPanelTheme(stored.settings.theme)) state.panelSettings.theme = stored.settings.theme
				if (isValidPanelHideMode(stored.settings.hideMode)) state.panelSettings.hideMode = stored.settings.hideMode
				state.panelSettings.autoHideSeconds = normalizePanelAutoHideSeconds(stored.settings.autoHideSeconds)
				state.panelSettings.hideMenuDetails = stored.settings.hideMenuDetails === true
				state.panelSettings.hideModFileDetails = stored.settings.hideModFileDetails === true
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

	const applyPanelSettings = function (panel) {
		panel.classList.toggle('modloader-panel-theme-light', state.panelSettings.theme === 'light')
		panel.classList.toggle('modloader-panel-settings-open', state.panelSettingsOpen)
		panel.classList.toggle('modloader-panel-manual-hide', !isPanelAutoHideEnabled())
		if (!isPanelAutoHideEnabled()) clearPanelAutoHideTimer()
	}

	const closePanelSettingsPage = function (panel) {
		if (!state.panelSettingsOpen) return
		state.panelSettingsOpen = false
		panel.classList.remove('modloader-panel-settings-open')
		const settingsButton = panel.querySelector('.modloader-panel-settings')
		const settingsPage = panel.querySelector('.modloader-panel-settings-page')
		if (settingsButton) settingsButton.classList.remove('active')
		if (settingsPage) settingsPage.classList.remove('active')
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
			state.panelSettingsOpen = !state.panelSettingsOpen
			renderPanel()
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
		const addSettingsButtonRow = function (label, buttonLabel, title) {
			const row = element('div', 'modloader-panel-settings-row')
			row.appendChild(element('span', '', label))
			const button = createPanelActionButton('translation', buttonLabel, title)
			button.disabled = !getModFileTools()
			button.onclick = async function (event) {
				event.preventDefault()
				try {
					const availableMods = readAvailableMods().mods
					const result = syncTranslationCatalogFile(availableMods)
					await openTranslationCatalogFile(result.path)
					state.panelMessage = t('translationFileSynced', { path: result.path })
				} catch (error) {
					state.panelMessage = t('translationFileFailed', { value: error.message })
				}
				renderPanel()
			}
			row.appendChild(button)
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
		addSettingsButtonRow(t('translationFile'), t('translationFile'), t('translationFileTitle'))
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
			summary.appendChild(panelRow(t('installedMods'), String(mods.length)))
			summary.appendChild(panelRow(t('enabledEntries'), String(state.enabledEntries.length)))
			summary.appendChild(panelRow(t('loadedMods'), String(state.mods.length)))
			summary.appendChild(panelRow(t('issues'), String(state.issues.length)))
			summary.appendChild(panelRow(t('dataPatches'), String(state.dataPatches.length)))
			summary.appendChild(panelRow(t('wordPatches'), String(state.wordPatches.length)))
			summary.appendChild(panelRow(t('registeredLanguages'), state.languages.join(', ') || '-'))
			summary.appendChild(panelRow(t('orphanEntities'), String(state.orphanEntities.length)))
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

		const finishSortDrag = function (rowModel, placeholder, moved) {
			const row = rowModel.container
			const beforeNode = placeholder.parentNode === list ? placeholder : null
			if (beforeNode) list.insertBefore(row, beforeNode)
			if (placeholder.parentNode) placeholder.remove()
			row.classList.remove('modloader-mod-row-dragging')
			row.style.position = ''
			row.style.left = ''
			row.style.top = ''
			row.style.width = ''
			row.style.height = ''
			row.style.transform = ''
			row.style.transition = ''
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
				placeholder.style.height = Math.max(24, Math.round(rect.height * .55)) + 'px'
				list.insertBefore(placeholder, row)
				row.classList.add('modloader-mod-row-dragging')
				row.style.position = 'fixed'
				row.style.left = Math.round(rect.left) + 'px'
				row.style.top = Math.round(rect.top) + 'px'
				row.style.width = Math.round(rect.width) + 'px'
				row.style.height = Math.round(rect.height) + 'px'
				event.preventDefault()
				event.stopPropagation()
				moveHandler = function (moveEvent) {
					moveEvent.preventDefault()
					const dx = moveEvent.clientX - startX
					const dy = moveEvent.clientY - startY
					if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
					row.style.left = Math.round(moveEvent.clientX - offsetX) + 'px'
					row.style.top = Math.round(moveEvent.clientY - offsetY) + 'px'
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
			const orderDirty = !sameStringList(state.panelModOrder, originalPanelModOrder)
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
			if (modConfig.schema.length && !mod.loadError) {
				row.classList.add('modloader-mod-row-configurable')
				const configBox = element('div', 'modloader-mod-config')
				configBox.appendChild(element('div', 'modloader-mod-config-title', t('config')))
				const configScroll = element('div', 'modloader-mod-config-scroll')
				configScroll.addEventListener('wheel', function (event) {
					event.stopPropagation()
				}, { passive: true })
				for (const item of modConfig.schema) {
					const type = getConfigType(item)
					const value = modConfig.values[item.key]
					const field = element('label', 'modloader-config-field')
					const text = element('span', 'modloader-config-text')
					const localizedConfigLabel = getLocalizedConfigText(mod.manifest, item, 'label', item.key)
					const localizedConfigDescription = getLocalizedConfigText(mod.manifest, item, 'description', '')
					const label = element('span', 'modloader-config-label', localizedConfigLabel || item.key)
					if (localizedConfigDescription) label.title = localizedConfigDescription
					text.appendChild(label)
					if (localizedConfigDescription) text.title = localizedConfigDescription
					const controlLabel = isSliderConfigItem(item, type) && !isSliderConfigType(type) ? ' | slider' : ''
					text.appendChild(element('span', 'modloader-config-meta', item.key + ' | ' + type + controlLabel))
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
					configScroll.appendChild(field)
					rowConfigModels.push(model)
					configModels.push(model)
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
			const rowModel = { mod, checkbox, container: row, warning, configModels: rowConfigModels, index }
			row.__modloaderRowModel = rowModel
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
				installLanguageBridge()
			}
			if (name === 'afterGameInit') {
				requestAnimationFrame(refreshOpenPanel)
				requestAnimationFrame(restorePanelAfterLoad)
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
