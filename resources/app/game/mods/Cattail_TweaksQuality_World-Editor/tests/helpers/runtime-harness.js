const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function createModuleLoader(modRoot) {
	return function loadModules(relativePaths, extras = {}) {
		const definitions = []
		const sandbox = Object.assign({
			console: {
				info() {},
				warn() {},
				error() {}
			},
			ModLoader: {
				register(definition) {
					definitions.push(definition)
				}
			}
		}, extras)
		vm.createContext(sandbox)
		for (const relativePath of relativePaths) {
			const filename = path.join(modRoot, relativePath)
			vm.runInContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename })
		}
		return { definitions, sandbox }
	}
}

function createRuntime(game) {
	const listeners = new Set()
	const cleanups = []
	let active = true
	return {
		game,
		snapshot() {
			return { active }
		},
		isActive() {
			return active
		},
		isEnabled() {
			return true
		},
		toggle() {
			active = !active
			for (const listener of listeners) listener({ active })
		},
		deactivate(reason) {
			if (!active) return false
			active = false
			for (const listener of listeners) listener({ active, lastReason: reason })
			return true
		},
		subscribe(listener) {
			listeners.add(listener)
			listener({ active })
			return () => listeners.delete(listener)
		},
		addCleanup(cleanup) {
			cleanups.push(cleanup)
		},
		runCleanups() {
			while (cleanups.length) cleanups.pop()()
		}
	}
}

class EventHub {
	constructor() {
		this.listeners = new Map()
	}

	addEventListener(type, listener, options = false) {
		if (!this.listeners.has(type)) this.listeners.set(type, [])
		this.listeners.get(type).push({ listener, capture: captureValue(options) })
	}

	removeEventListener(type, listener, options = false) {
		const capture = captureValue(options)
		const entries = this.listeners.get(type) || []
		this.listeners.set(type, entries.filter(entry => entry.listener !== listener || entry.capture !== capture))
	}

	dispatch(type, event = {}) {
		event.type = type
		for (const entry of (this.listeners.get(type) || []).slice()) {
			entry.listener(event)
			if (event.immediatePropagationStopped) break
		}
		return event
	}

	count(type) {
		return (this.listeners.get(type) || []).length
	}
}

function createTimers() {
	let now = 0
	let nextId = 1
	const tasks = new Map()
	return {
		setTimeout(callback, delay) {
			const id = nextId++
			tasks.set(id, { callback, at: now + Math.max(0, Number(delay) || 0) })
			return id
		},
		clearTimeout(id) {
			tasks.delete(id)
		},
		advance(milliseconds) {
			now += milliseconds
			let progressed = true
			while (progressed) {
				progressed = false
				for (const [id, task] of Array.from(tasks)) {
					if (task.at > now) continue
					tasks.delete(id)
					task.callback()
					progressed = true
				}
			}
		},
		get size() {
			return tasks.size
		}
	}
}

function plain(value) {
	return JSON.parse(JSON.stringify(value))
}

function range(start, end) {
	const minU = Math.min(start[0], end[0])
	const maxU = Math.max(start[0], end[0])
	const minV = Math.min(start[1], end[1])
	const maxV = Math.max(start[1], end[1])
	return {
		start,
		end,
		minU,
		maxU,
		minV,
		maxV,
		width: maxU - minU + 1,
		height: maxV - minV + 1
	}
}

function captureValue(value) {
	return typeof value === 'object' && value !== null ? !!value.capture : !!value
}

module.exports = {
	createModuleLoader,
	createRuntime,
	EventHub,
	createTimers,
	plain,
	range
}
