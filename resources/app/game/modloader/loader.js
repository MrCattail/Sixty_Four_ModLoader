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
		statusLogoTimer: null
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
			#modloader-panel { position: fixed; right: 16px; top: 16px; z-index: 2147483647; width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; padding: 14px; border-radius: 8px; background: rgba(8, 10, 12, .92); color: rgba(255,255,255,.92); box-shadow: 0 12px 36px rgba(0,0,0,.35); font: 13px/1.45 Montserrat, Arial, sans-serif; }
			#modloader-panel h2 { margin: 0 0 8px; font-size: 16px; }
			#modloader-panel h3 { margin: 14px 0 6px; font-size: 13px; color: rgba(255,255,255,.72); }
			#modloader-panel .modloader-panel-close { position: absolute; right: 10px; top: 8px; border: 0; background: transparent; color: rgba(255,255,255,.8); font: 18px/1 Arial, sans-serif; cursor: pointer; }
			#modloader-panel .modloader-panel-row { display: flex; gap: 12px; justify-content: space-between; border-top: 1px solid rgba(255,255,255,.1); padding: 5px 0; }
			#modloader-panel .modloader-panel-label { color: rgba(255,255,255,.62); }
			#modloader-panel .modloader-panel-value { text-align: right; overflow-wrap: anywhere; }
			#modloader-panel .modloader-panel-list { margin: 0; padding-left: 18px; }
			#modloader-panel .modloader-panel-log { margin: 0; padding: 8px; border-radius: 6px; background: rgba(255,255,255,.08); white-space: pre-wrap; overflow-wrap: anywhere; }
			#modloader-panel .modloader-panel-issues { margin: 8px 0 0; padding: 8px 8px 8px 24px; border-radius: 6px; background: rgba(255, 196, 87, .12); color: rgba(255,255,255,.92); }
			#modloader-panel .modloader-panel-issue-error { color: #ffb0b0; }
			#modloader-panel .modloader-panel-issue-warn { color: #ffe1a3; }
		`
		document.head.appendChild(style)
	}

	const renderPanel = function () {
		if (!document.body) return
		ensurePanelStyle()

		let panel = document.getElementById('modloader-panel')
		if (!panel) {
			panel = element('div')
			panel.id = 'modloader-panel'
			document.body.appendChild(panel)
		}

		panel.innerHTML = ''
		const close = element('button', 'modloader-panel-close', 'x')
		close.title = 'Close'
		close.onclick = function () { panel.remove() }
		panel.appendChild(close)
		panel.appendChild(element('h2', '', `ModLoader ${state.version}`))
		if (state.issues.length) {
			const issues = element('ul', 'modloader-panel-issues')
			for (const issue of state.issues) {
				issues.appendChild(element('li', `modloader-panel-issue-${issue.level}`, `${issue.level.toUpperCase()} ${issue.code}: ${issue.message}`))
			}
			panel.appendChild(issues)
		}
		panel.appendChild(panelRow('Enabled entries', String(state.enabledEntries.length)))
		panel.appendChild(panelRow('Loaded mods', String(state.mods.length)))
		panel.appendChild(panelRow('Issues', String(state.issues.length)))
		panel.appendChild(panelRow('Data patches', String(state.dataPatches.length)))
		panel.appendChild(panelRow('Word patches', String(state.wordPatches.length)))
		panel.appendChild(panelRow('Registered languages', state.languages.join(', ') || '-'))
		panel.appendChild(panelRow('Orphan entities', String(state.orphanEntities.length)))
		panel.appendChild(panelRow('Hook stages', Object.keys(state.hooks).map(function (name) { return `${name}(${state.hooks[name].length})` }).join(', ') || '-'))
		panel.appendChild(panelRow('Asset replacements', String(Object.keys(state.assetReplacements).length)))
		panel.appendChild(panelRow('Registered sounds', Object.keys(state.sounds).join(', ') || '-'))
		panel.appendChild(panelRow('Registered music', Object.keys(state.music).join(', ') || '-'))

		panel.appendChild(element('h3', '', 'Mod Config'))
		const configList = element('ul', 'modloader-panel-list')
		let hasConfig = false
		for (const modId in state.configs) {
			const config = state.configs[modId]
			if (!config.schema.length) continue
			hasConfig = true
			const values = config.schema.map(function (item) {
				const label = item.label || item.key
				return `${label} (${item.key}, ${item.type || 'value'})=${JSON.stringify(config.values[item.key])}`
			}).join(', ')
			configList.appendChild(element('li', '', `${modId}: ${values}`))
		}
		if (!hasConfig) configList.appendChild(element('li', '', 'No declared config.'))
		panel.appendChild(configList)

		panel.appendChild(element('h3', '', 'Enabled Config'))
		const enabledList = element('ul', 'modloader-panel-list')
		for (const entry of state.enabledEntries) {
			enabledList.appendChild(element('li', '', `${entry.path}${entry.id && entry.id !== entry.path ? ' | id hint: ' + entry.id : ''}`))
		}
		if (!state.enabledEntries.length) enabledList.appendChild(element('li', '', 'No enabled entries.'))
		panel.appendChild(enabledList)

		panel.appendChild(element('h3', '', 'Mods'))
		const list = element('ul', 'modloader-panel-list')
		for (const mod of state.mods) {
			const deps = resolveModRefs(mod.manifest.dependencies).join(', ')
			const conflicts = resolveModRefs(mod.manifest.conflicts).join(', ')
			list.appendChild(element('li', '', `${mod.id} ${mod.manifest.version || ''}${mod.loaded ? ' | entry loaded' : mod.manifest.entry ? ' | entry pending' : ''}${deps ? ' | deps: ' + deps : ''}${conflicts ? ' | conflicts: ' + conflicts : ''}`))
		}
		if (!state.mods.length) list.appendChild(element('li', '', 'No loaded mods.'))
		panel.appendChild(list)

		panel.appendChild(element('h3', '', 'Recent Log'))
		const lines = state.log.slice(-12).map(function (entry) {
			return `${entry.level}: ${entry.args.map(function (arg) { return arg instanceof Error ? arg.message : String(arg) }).join(' ')}`
		})
		panel.appendChild(element('pre', 'modloader-panel-log', lines.join('\n') || 'No log entries.'))
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
