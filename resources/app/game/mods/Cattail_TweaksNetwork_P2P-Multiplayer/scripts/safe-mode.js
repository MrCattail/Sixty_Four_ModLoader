(function (root) {
	'use strict'

	const BLOCKED_IPC_CHANNELS = Object.freeze([
		'save',
		'updateAccumulatedPlaytime',
		'updateStat',
		'achieve',
		'reset'
	])
	const BLOCKED_IPC_SET = new Set(BLOCKED_IPC_CHANNELS)
	const BLOCKED_GAME_METHODS = Object.freeze([
		'saveLoop',
		'saveGame',
		'backupLoop',
		'importSave',
		'restoreBackup',
		'loadSaveFromClipboard'
	])

	function parseArgument(argv, name) {
		const prefix = `--${name}=`
		const item = (Array.isArray(argv) ? argv : []).find(function (value) {
			return String(value).startsWith(prefix)
		})
		return item ? String(item).slice(prefix.length) : ''
	}

	function readLaunchConfig(argv, env) {
		const args = Array.isArray(argv) ? argv.map(String) : []
		const sourceEnv = env || {}
		const roleValue = (parseArgument(args, 'p2p-role') || sourceEnv.CATTAIL_P2P_ROLE || '').toLowerCase()
		const role = roleValue === 'host' || roleValue === 'guest' ? roleValue : 'none'
		const envSafeTest = String(sourceEnv.CATTAIL_P2P_SAFE_TEST || '').toLowerCase()
		return Object.freeze({
			safeTest: args.includes('--p2p-safe-test') || envSafeTest === '1' || envSafeTest === 'true',
			role,
			sessionId: parseArgument(args, 'p2p-session') || String(sourceEnv.CATTAIL_P2P_SESSION || 'phase2-local'),
			signalingUrl: parseArgument(args, 'p2p-signaling-url') || String(sourceEnv.CATTAIL_P2P_SIGNALING_URL || 'http://127.0.0.1:8787'),
			alphaInviteToken: parseArgument(args, 'p2p-alpha-invite') || String(sourceEnv.CATTAIL_P2P_ALPHA_INVITE || ''),
			testRoot: parseArgument(args, 'p2p-test-root') || String(sourceEnv.CATTAIL_P2P_TEST_ROOT || ''),
			auditPath: parseArgument(args, 'p2p-audit-path') || String(sourceEnv.CATTAIL_P2P_AUDIT_PATH || ''),
			appData: parseArgument(args, 'p2p-appdata') || String(sourceEnv.APPDATA || '')
		})
	}

	function isWithin(basePath, candidatePath, pathModule) {
		if (!basePath || !candidatePath) return false
		const base = pathModule.resolve(basePath)
		const candidate = pathModule.resolve(candidatePath)
		return candidate === base || candidate.startsWith(base + pathModule.sep)
	}

	function resolveAuditPath(config, dependencies) {
		if (!config?.safeTest) return ''
		const pathModule = dependencies?.path || (typeof require === 'function' ? require('path') : null)
		if (!pathModule) return ''
		const allowedRoots = [config.testRoot, config.appData].filter(Boolean)
		if (config.auditPath && allowedRoots.some(function (base) { return isWithin(base, config.auditPath, pathModule) })) {
			return pathModule.resolve(config.auditPath)
		}
		if (!config.appData) return ''
		return pathModule.join(pathModule.resolve(config.appData), 'sixtyfour', 'p2p-test', `${config.role || 'none'}-phase2-audit.jsonl`)
	}

	function createAudit(config, dependencies) {
		const entries = []
		const listeners = new Set()
		const maxEntries = 500
		let fsModule = dependencies?.fs || null
		let pathModule = dependencies?.path || null
		try {
			if (!fsModule && typeof require === 'function') fsModule = require('fs')
			if (!pathModule && typeof require === 'function') pathModule = require('path')
		} catch (error) {}
		const auditPath = resolveAuditPath(config, { path: pathModule })

		function appendFile(entry) {
			if (!auditPath || !fsModule || !pathModule) return
			try {
				fsModule.mkdirSync(pathModule.dirname(auditPath), { recursive: true })
				fsModule.appendFileSync(auditPath, JSON.stringify(entry) + '\n', 'utf8')
			} catch (error) {
				try { console.warn('[P2P Phase 2] Could not append audit log.', error) } catch (ignored) {}
			}
		}

		function record(type, details) {
			const entry = Object.freeze({
				timestamp: new Date().toISOString(),
				type: String(type || 'event'),
				role: String(config?.role || 'none'),
				details: details && typeof details === 'object' ? Object.assign({}, details) : { value: String(details || '') }
			})
			entries.push(entry)
			if (entries.length > maxEntries) entries.splice(0, entries.length - maxEntries)
			appendFile(entry)
			for (const listener of listeners) {
				try { listener(entry) } catch (error) {}
			}
			return entry
		}

		return Object.freeze({
			path: auditPath,
			record,
			entries() { return entries.slice() },
			subscribe(listener) {
				if (typeof listener !== 'function') return function () {}
				listeners.add(listener)
				return function () { listeners.delete(listener) }
			}
		})
	}

	function installIpcGuard(ipcRenderer, config, audit) {
		if (!config?.safeTest) return { installed: false, restore() {} }
		if (!ipcRenderer || typeof ipcRenderer.send !== 'function') throw new Error('Safe test mode requires Electron ipcRenderer.send.')
		const original = ipcRenderer.send
		const guarded = function (channel) {
			const name = String(channel || '')
			if (BLOCKED_IPC_SET.has(name)) {
				audit?.record('ipc-blocked', { channel: name, argumentCount: Math.max(0, arguments.length - 1) })
				return false
			}
			return original.apply(this, arguments)
		}
		ipcRenderer.send = guarded
		audit?.record('ipc-guard-installed', { channels: BLOCKED_IPC_CHANNELS.slice() })
		return {
			installed: ipcRenderer.send === guarded,
			restore() {
				if (ipcRenderer.send === guarded) ipcRenderer.send = original
			}
		}
	}

	function installGameGuards(api, GameClass, config, audit) {
		const disposers = []
		const installed = []
		if (!config?.safeTest) return { installed, dispose() {} }
		if (!api?.patch || !GameClass?.prototype) throw new Error('Safe test mode requires ModLoader api.patch and Game.prototype.')

		for (const methodName of BLOCKED_GAME_METHODS) {
			if (typeof GameClass.prototype[methodName] !== 'function') continue
			const dispose = api.patch(GameClass.prototype, methodName, function (original) {
				return function () {
					audit?.record('game-write-blocked', { method: methodName, argumentCount: arguments.length })
					return false
				}
			})
			disposers.push(dispose)
			installed.push(methodName)
		}

		if (config.role === 'guest' && typeof GameClass.prototype.exportSave === 'function') {
			const dispose = api.patch(GameClass.prototype, 'exportSave', function (original) {
				return function () {
					audit?.record('guest-export-blocked', { method: 'exportSave' })
					return false
				}
			})
			disposers.push(dispose)
			installed.push('exportSave:guest')
		}

		audit?.record('game-guards-installed', { methods: installed.slice() })
		return {
			installed: installed.slice(),
			dispose() {
				for (let i = disposers.length - 1; i >= 0; i--) {
					try { disposers[i]?.() } catch (error) {}
				}
			}
		}
	}

	function install(options) {
		const config = options?.config || readLaunchConfig([], {})
		const audit = options?.audit || createAudit(config)
		if (!config.safeTest) {
			audit.record('safe-mode-inactive', { reason: 'missing --p2p-safe-test' })
			return Object.freeze({ config, audit, ipc: { installed: false }, game: { installed: [] }, dispose() {} })
		}
		const ipc = installIpcGuard(options?.ipcRenderer, config, audit)
		const game = installGameGuards(options?.api, options?.GameClass, config, audit)
		audit.record('safe-mode-installed', { role: config.role, sessionId: config.sessionId, auditPath: audit.path })
		return Object.freeze({
			config,
			audit,
			ipc,
			game,
			dispose() {
				game.dispose?.()
				ipc.restore?.()
			}
		})
	}

	const api = Object.freeze({
		BLOCKED_IPC_CHANNELS,
		BLOCKED_GAME_METHODS,
		readLaunchConfig,
		resolveAuditPath,
		createAudit,
		installIpcGuard,
		installGameGuards,
		install
	})

	root.CattailP2PSafeMode = api
	if (typeof module === 'object' && module.exports) module.exports = api
})(typeof window !== 'undefined' ? window : globalThis)
