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
		modFileTools: undefined
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
			#modloader-status { position: fixed; left: 10px; bottom: 10px; z-index: 2147483647; display: inline-flex; align-items: center; gap: 7px; max-width: calc(100vw - 20px); box-sizing: border-box; padding: 6px 8px; border-radius: 7px; background: rgba(0, 0, 0, .62); color: rgba(255, 255, 255, .92); box-shadow: 0 6px 20px rgba(0,0,0,.18); font: 12px/1.35 Montserrat, Arial, sans-serif; pointer-events: auto; user-select: none; white-space: nowrap; }
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

	const ensurePanelStyle = function () {
		if (document.getElementById('modloader-panel-style')) return
		const style = document.createElement('style')
		style.id = 'modloader-panel-style'
		style.textContent = `
			#modloader-panel { position: fixed; right: 16px; top: 16px; z-index: 2147483647; width: min(860px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; padding: 14px; border-radius: 8px; background: rgba(8, 10, 12, .94); color: rgba(255,255,255,.92); box-shadow: 0 12px 36px rgba(0,0,0,.35); font: 13px/1.45 Montserrat, Arial, sans-serif; }
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
			#modloader-panel .modloader-panel-error { margin: 8px 0; padding: 8px; border-radius: 6px; background: rgba(255, 96, 96, .14); color: #ffb0b0; }
			#modloader-panel .modloader-mod-manager { display: grid; gap: 6px; }
			#modloader-panel .modloader-mod-row { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: flex-start; padding: 9px; border: 1px solid rgba(255,255,255,.1); border-radius: 7px; background: rgba(255,255,255,.045); }
			#modloader-panel .modloader-mod-row-selected { border-color: rgba(174, 231, 160, .42); background: rgba(120, 190, 120, .08); }
			#modloader-panel .modloader-mod-row-problem { border-color: rgba(255, 196, 87, .48); }
			#modloader-panel .modloader-mod-check { margin-top: 2px; }
			#modloader-panel .modloader-mod-main { min-width: 0; }
			#modloader-panel .modloader-mod-title { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
			#modloader-panel .modloader-mod-path { font-weight: 600; overflow-wrap: anywhere; }
			#modloader-panel .modloader-mod-version { color: rgba(255,255,255,.58); }
			#modloader-panel .modloader-mod-name { color: rgba(255,255,255,.72); overflow-wrap: anywhere; }
			#modloader-panel .modloader-mod-meta { margin-top: 3px; color: rgba(255,255,255,.62); overflow-wrap: anywhere; }
			#modloader-panel .modloader-mod-warning { display: none; margin-top: 5px; color: #ffe1a3; overflow-wrap: anywhere; }
			#modloader-panel .modloader-mod-warning.active { display: block; }
			#modloader-panel .modloader-mod-config { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.09); }
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
			const gameRoot = path.dirname(url.fileURLToPath(window.location.href))
			state.modFileTools = {
				fs,
				path,
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
			errorMessage = 'File access is unavailable, so only loaded mods can be shown.'
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
		if (policy === 'hot') return 'hot capable, reload now'
		if (policy === 'restart') return 'restart required'
		return 'reload required'
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
		if (!tools) throw new Error('File access is unavailable.')
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

		panel.innerHTML = ''
		const close = element('button', 'modloader-panel-close')
		close.title = 'Close'
		close.setAttribute('aria-label', 'Close')
		close.onclick = function () { panel.remove() }
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
		summary.appendChild(panelRow('Installed mods', String(mods.length)))
		summary.appendChild(panelRow('Enabled entries', String(state.enabledEntries.length)))
		summary.appendChild(panelRow('Loaded mods', String(state.mods.length)))
		summary.appendChild(panelRow('Issues', String(state.issues.length)))
		summary.appendChild(panelRow('Data patches', String(state.dataPatches.length)))
		summary.appendChild(panelRow('Word patches', String(state.wordPatches.length)))
		summary.appendChild(panelRow('Registered languages', state.languages.join(', ') || '-'))
		summary.appendChild(panelRow('Orphan entities', String(state.orphanEntities.length)))
		panel.appendChild(summary)

		panel.appendChild(element('h3', '', 'Mod Manager'))
		if (available.errorMessage) panel.appendChild(element('div', 'modloader-panel-error', available.errorMessage))

		const toolbar = element('div', 'modloader-mod-toolbar')
		const note = element('span', 'modloader-panel-note', 'Toggle mods or edit config below.')
		const reloadNote = element('span', 'modloader-panel-reload-note', 'Changes require reload.')
		const configNote = element('span', 'modloader-panel-config-note', 'Config saved to localStorage; some mods need reload.')
		const message = element('span', 'modloader-panel-note', '')
		const save = element('button', 'modloader-save-button', 'Save & Reload')
		save.disabled = true
		const left = element('span')
		left.append(note, document.createTextNode(' '), reloadNote, document.createTextNode(' '), configNote, document.createTextNode(' '), message)
		toolbar.append(left, save)
		panel.appendChild(toolbar)

		const list = element('div', 'modloader-mod-manager')
		panel.appendChild(list)

		const refreshRows = function (keepMessage) {
			const refs = new Set()
			for (const mod of mods) {
				if (!selected.has(mod.path)) continue
				refs.add(mod.path)
				refs.add(mod.id)
			}

			let configDirty = false
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
					if (!sameConfigValue(model.value, model.initial)) configDirty = true
				}
				const warnings = []
				if (mod.loadError) warnings.push(mod.loadError)
				if (checked) {
					const missing = resolveModRefs(mod.manifest.dependencies).filter(function (ref) { return !refs.has(ref) })
					const conflicts = resolveModRefs(mod.manifest.conflicts).filter(function (ref) { return refs.has(ref) })
					if (missing.length) warnings.push('Missing dependencies: ' + missing.join(', '))
					if (conflicts.length) warnings.push('Conflicts enabled: ' + conflicts.join(', '))
				}
				row.warning.textContent = warnings.join(' | ')
				row.warning.classList.toggle('active', warnings.length > 0)
				row.container.classList.toggle('modloader-mod-row-problem', warnings.length > 0)
			}

			const orderedSelected = getOrderedSelectedPaths(mods, selected)
			const enabledDirty = !sameStringList(orderedSelected, originalSelected)
			reloadNote.classList.toggle('active', enabledDirty)
			configNote.classList.toggle('active', configDirty)
			save.textContent = enabledDirty ? 'Save & Reload' : 'Save Config'
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
				'id: ' + (mod.id || mod.path),
				getModReloadLabel(mod.manifest)
			]
			if (deps.length) metaParts.push('deps: ' + deps.join(', '))
			if (conflicts.length) metaParts.push('conflicts: ' + conflicts.join(', '))
			main.appendChild(element('div', 'modloader-mod-meta', metaParts.join(' | ')))

			const warning = element('div', 'modloader-mod-warning')
			main.appendChild(warning)

			const modConfig = readConfigForPanel(mod)
			const rowConfigModels = []
			if (modConfig.schema.length && !mod.loadError) {
				const configBox = element('div', 'modloader-mod-config')
				configBox.appendChild(element('div', 'modloader-mod-config-title', 'Config'))
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

			row.append(checkbox, main)
			list.appendChild(row)
			rowModels.push({ mod, checkbox, container: row, warning, configModels: rowConfigModels })
		}

		if (!mods.length) list.appendChild(element('div', 'modloader-panel-note', 'No mods with mod.json were found.'))

		save.onclick = function () {
			const orderedSelected = getOrderedSelectedPaths(mods, selected)
			const enabledDirty = !sameStringList(orderedSelected, originalSelected)
			try {
				const configSaved = writeConfigChanges(configModels, selected)
				if (enabledDirty) {
					writeEnabledConfig(orderedSelected)
					message.textContent = 'Saved. Reloading...'
					location.reload()
				} else {
					message.textContent = configSaved ? 'Config saved.' : 'No changes to save.'
					refreshRows(true)
				}
			} catch (error) {
				message.textContent = 'Save failed: ' + error.message
			}
		}

		panel.appendChild(element('h3', '', 'Recent Log'))
		const lines = state.log.slice(-12).map(function (entry) {
			return `${entry.level}: ${entry.args.map(function (arg) { return arg instanceof Error ? arg.message : String(arg) }).join(' ')}`
		})
		panel.appendChild(element('pre', 'modloader-panel-log', lines.join('\n') || 'No log entries.'))

		refreshRows()
	}
	const togglePanel = function () {
		const panel = document.getElementById('modloader-panel')
		if (panel) panel.remove()
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

	const loadDeclaredJsonPatches = async function (mod) {
		const localeFiles = resolveList(mod.manifest.locale || mod.manifest.locales || mod.manifest.assets?.locale)
		for (const file of localeFiles) {
			const patch = await readJson(`${mod.basePath}${file}`)
			state.wordPatches.push({ modId: mod.id, patch })
		}

		const dataFiles = resolveList(mod.manifest.data || mod.manifest.dataPatches || mod.manifest.assets?.data)
		for (const file of dataFiles) {
			const patch = await readJson(`${mod.basePath}${file}`)
			state.dataPatches.push({ modId: mod.id, patch })
		}

		if (mod.manifest.words) state.wordPatches.push({ modId: mod.id, patch: clone(mod.manifest.words) })
		if (mod.manifest.patches?.words) state.wordPatches.push({ modId: mod.id, patch: clone(mod.manifest.patches.words) })
		if (mod.manifest.patches?.data) state.dataPatches.push({ modId: mod.id, patch: clone(mod.manifest.patches.data) })
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

	const api = {
		version: state.version,
		state,

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
				if (mod.loaded || !mod.manifest.entry) continue
				try {
					await loadScript(`${mod.basePath}${mod.manifest.entry}`)
					mod.loaded = true
				} catch (error) {
					warn(`Failed to load entry for ${mod.id}`, error)
				}
			}
			showStatus()
		},

		async stage(name, context, payload) {
			if (name === 'beforeVanillaScripts') await api.boot()
			if (name === 'afterVanillaScripts') await api.loadEntries()

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
