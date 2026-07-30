const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const SHELL_PATH = path.join(MOD_ROOT, 'scripts/ui/editor-shell.js')
const I18N_PATH = path.join(MOD_ROOT, 'scripts/i18n/editor-text.js')
const README_PATH = path.join(MOD_ROOT, 'README.md')
const shellSource = fs.readFileSync(SHELL_PATH, 'utf8')
const i18nSource = fs.readFileSync(I18N_PATH, 'utf8')
const readme = fs.readFileSync(README_PATH, 'utf8')

const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
const SHARED_KEY = Symbol.for('cattail.world-editor.shared')
const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
const PREVIEW_KEY = Symbol.for('cattail.world-editor.blueprint-preview')
const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
const TOOL_KEY = Symbol.for('cattail.world-editor.tool')
const DIALOGS_KEY = Symbol.for('cattail.world-editor.dialogs')

function testSourceContracts() {
	assert.match(shellSource, /Symbol\.for\('cattail\.world-editor\.transactions'\)/)
	assert.match(shellSource, /Symbol\.for\('cattail\.world-editor\.blueprint-preview'\)/)
	assert.match(shellSource, /transactions\.snapshot\(\)/)
	assert.match(shellSource, /transactions\.subscribe\(function \(state\)/)
	assert.match(shellSource, /result\s*=\s*await transactions\[direction\]\(\{\s*input\s*\}\)/)
	assert.match(shellSource, /result\?\.executed\s*===\s*true/)
	assert.match(shellSource, /preview\.refreshNow\('transaction-'\s*\+\s*direction\s*\+\s*'-complete'\)/)
	assert.match(shellSource, /createHistoryButton\('undo',\s*'↶'\)/)
	assert.match(shellSource, /createHistoryButton\('redo',\s*'↷'\)/)
	assert.match(shellSource, /historyGroup\.append\(undoButton,\s*redoButton\)/)
	assert.match(shellSource, /actions\.append\(selectionGroup,\s*historyGroup,\s*blueprintGroup,\s*transformGroup,\s*creativeGroup\)/)
	assert.match(shellSource, /button\.disabled\s*=\s*false/)
	assert.match(shellSource, /definition\.button\.setAttribute\('aria-disabled',\s*reason\s*\?\s*'true'\s*:\s*'false'\)/)
	assert.match(shellSource, /worldEditorToolbarBusy\s*=\s*reason\s*===\s*'BUSY'/)
	assert.match(shellSource, /layout\.append\(statusBar,\s*toolbarBar\)/)
	assert.match(shellSource, /layout\.append\(historyStatus\)/)
	assert.match(shellSource, /historyStatus\.setAttribute\('role',\s*'status'\)/)
	assert.match(shellSource, /historyStatus\.setAttribute\('aria-live',\s*'polite'\)/)
	assert.match(shellSource, /HISTORY_SUCCESS_MS\s*=\s*3000/)
	assert.match(shellSource, /HISTORY_FAILURE_MS\s*=\s*6000/)
	assert.match(shellSource, /window\.addEventListener\('keydown',\s*handleHistoryKeydown,\s*true\)/)
	assert.match(shellSource, /window\.removeEventListener\('keydown',\s*handleHistoryKeydown,\s*true\)/)
	assert.match(shellSource, /event\?\.detail\s*===\s*0\s*\?\s*'keyboard'\s*:\s*'mouse'/)
	assert.match(shellSource, /key\s*===\s*'z'\s*&&\s*!event\.shiftKey/)
	assert.match(shellSource, /key\s*===\s*'y'\s*&&\s*!event\.shiftKey/)
	assert.match(shellSource, /key\s*===\s*'z'\s*&&\s*event\.shiftKey/)
	assert.match(shellSource, /event\.repeat/)
	assert.match(shellSource, /event\.isComposing/)
	assert.match(shellSource, /event\.keyCode\s*===\s*229/)
	assert.match(shellSource, /shared\.isEditableEvent\(event\)/)
	assert.match(shellSource, /shared\.isModLoaderPanelBlocking\(\)/)
	assert.match(shellSource, /shared\.isWorldEditorInputBlocked\?\.\(\)/)
	assert.match(shellSource, /Number\(dialogs\.snapshot\?\.\(\)\.openCount\)\s*>\s*0/)
	assert.match(shellSource, /event\.preventDefault\(\)/)
	assert.match(shellSource, /event\.stopImmediatePropagation\?\.\(\)/)
	assert.match(shellSource, /result\?\.reason\s*===\s*'rolled-back'/)
	assert.match(shellSource, /normalized\s*===\s*'ROLLBACK_FAILED'/)
	assert.match(shellSource, /if \(HISTORY_ERROR_CODES\.has\(normalized\)\) return 'historyFailed'\s*\n\s*return 'historyFailed'/)
	assert.match(shellSource, /HISTORY_WARNING_CODES/)
	assert.match(shellSource, /HISTORY_ERROR_CODES/)
	assert.doesNotMatch(shellSource, /globalThis\[BLUEPRINT_PREVIEW_KEY\]\s*=/)

	assert.match(readme, /## 4B-1b 撤销与重做控件/)
	assert.match(readme, /Ctrl\+Z/)
	assert.match(readme, /Ctrl\+Y/)
	assert.match(readme, /Ctrl\+Shift\+Z/)
	assert.match(readme, /result\.executed === true/)
	assert.match(readme, /transaction-undo-complete/)
	assert.match(readme, /transaction-redo-complete/)
	assert.match(readme, /20 种原版语言/)
}

function testLocalization() {
	const definitions = []
	const sandbox = {
		ModLoader: {
			register(definition) {
				definitions.push(definition)
			}
		}
	}
	vm.createContext(sandbox)
	vm.runInContext(i18nSource, sandbox, { filename: I18N_PATH })
	definitions[0].init({})
	const i18n = sandbox[I18N_KEY]
	const keys = [
		'historyUndo',
		'historyRedo',
		'toolbarCardUndo',
		'toolbarCardRedo',
		'historyNoUndo',
		'historyNoRedo',
		'historyBusy',
		'historyNotReady',
		'historyUnavailable',
		'historyPlaneChanged',
		'historySaveChanged',
		'historyExternalChange',
		'historyInsufficientResources',
		'historyFailed',
		'historyRolledBack',
		'historyReloadRequired',
		'historyUndoSuccess',
		'historyRedoSuccess',
		'historyPreviewRefreshFailed'
	]
	assert.equal(i18n.languages.length, 20)
	assert.ok(i18n.toolbarKeys.includes('toolbarCardUndo'))
	assert.ok(i18n.toolbarKeys.includes('toolbarCardRedo'))
	assert.equal(new Set(i18n.historyKeys).size, 17)
	for (const language of i18n.languages) {
		for (const key of keys) {
			const text = i18n.t(language, key)
			assert.notEqual(text, key, language + '.' + key)
			assert.ok(text.trim(), language + '.' + key)
		}
	}
}

function dataKey(name) {
	return name.replace(/^data-/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

function matches(element, selector) {
	const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/)
	if (attribute) {
		const [, name, expected] = attribute
		const value = name.startsWith('data-')
			? element.dataset[dataKey(name)]
			: element.getAttribute(name)
		return expected === undefined ? value !== undefined : String(value) === expected
	}
	if (/^[a-z]+$/i.test(selector)) return element.tagName === selector.toUpperCase()
	if (selector.startsWith('.')) return element.classList.contains(selector.slice(1))
	return false
}

class MiniElement {
	constructor(tagName, ownerDocument) {
		this.tagName = String(tagName).toUpperCase()
		this.ownerDocument = ownerDocument
		this.children = []
		this.parentNode = null
		this.dataset = {}
		this.attributes = {}
		this.className = ''
		this.id = ''
		this.textContent = ''
		this.title = ''
		this.disabled = false
		this.hidden = false
		this.scrollLeft = 0
		this.scrollWidth = 0
		this.clientWidth = 0
		this.listeners = new Map()
		this.style = {
			values: {},
			setProperty: (key, value) => {
				this.style.values[key] = String(value)
			},
			getPropertyValue: key => this.style.values[key] || '',
			removeProperty: key => {
				delete this.style.values[key]
			}
		}
		this.classList = {
			contains: value => String(this.className).split(/\s+/).includes(value),
			add: value => {
				const values = new Set(String(this.className).split(/\s+/).filter(Boolean))
				values.add(value)
				this.className = Array.from(values).join(' ')
			}
		}
	}

	get parentElement() {
		return this.parentNode
	}

	get isConnected() {
		let current = this
		while (current) {
			if (current === this.ownerDocument.body || current === this.ownerDocument.head) return true
			current = current.parentNode
		}
		return false
	}

	append(...nodes) {
		for (const node of nodes) {
			node.parentNode = this
			this.children.push(node)
		}
	}

	remove() {
		if (!this.parentNode) return
		const index = this.parentNode.children.indexOf(this)
		if (index >= 0) this.parentNode.children.splice(index, 1)
		this.parentNode = null
	}

	setAttribute(name, value) {
		this.attributes[name] = String(value)
	}

	getAttribute(name) {
		return this.attributes[name]
	}

	addEventListener(type, listener) {
		if (!this.listeners.has(type)) this.listeners.set(type, [])
		this.listeners.get(type).push(listener)
	}

	removeEventListener(type, listener) {
		const entries = this.listeners.get(type) || []
		this.listeners.set(type, entries.filter(entry => entry !== listener))
	}

	dispatch(type, event) {
		const value = Object.assign({
			target: this,
			currentTarget: this,
			preventDefault() {},
			stopPropagation() {},
			stopImmediatePropagation() {}
		}, event || {})
		for (const listener of (this.listeners.get(type) || []).slice()) listener(value)
		return value
	}

	querySelector(selector) {
		return this.find(element => matches(element, selector))
	}

	querySelectorAll(selector) {
		const selectors = String(selector).split(',').map(value => value.trim())
		const values = []
		this.walk(element => {
			if (selectors.some(value => matches(element, value))) values.push(element)
		})
		return values
	}

	find(predicate) {
		for (const child of this.children) {
			if (predicate(child)) return child
			const nested = child.find(predicate)
			if (nested) return nested
		}
		return null
	}

	walk(visitor) {
		for (const child of this.children) {
			visitor(child)
			child.walk(visitor)
		}
	}

	closest(selector) {
		let current = this
		while (current) {
			if (matches(current, selector)) return current
			current = current.parentNode
		}
		return null
	}

	focus() {
		this.ownerDocument.activeElement = this
	}
}

function createDocument() {
	const document = {}
	document.createElement = tagName => new MiniElement(tagName, document)
	document.body = document.createElement('body')
	document.head = document.createElement('head')
	document.documentElement = document.createElement('html')
	document.documentElement.clientWidth = 1600
	document.documentElement.clientHeight = 1000
	document.activeElement = document.body
	document.getElementById = id => {
		if (document.body.id === id) return document.body
		if (document.head.id === id) return document.head
		return document.body.find(node => node.id === id) || document.head.find(node => node.id === id)
	}
	return document
}

class EventHub {
	constructor() {
		this.listeners = new Map()
		this.innerWidth = 1600
		this.innerHeight = 1000
	}

	addEventListener(type, listener) {
		if (!this.listeners.has(type)) this.listeners.set(type, [])
		this.listeners.get(type).push(listener)
	}

	removeEventListener(type, listener) {
		const entries = this.listeners.get(type) || []
		this.listeners.set(type, entries.filter(entry => entry !== listener))
	}

	dispatch(type, event) {
		for (const listener of (this.listeners.get(type) || []).slice()) listener(event)
		return event
	}

	count(type) {
		return (this.listeners.get(type) || []).length
	}
}

function event(properties) {
	return Object.assign({
		key: '',
		keyCode: 0,
		ctrlKey: false,
		shiftKey: false,
		altKey: false,
		metaKey: false,
		repeat: false,
		isComposing: false,
		detail: 1,
		editable: false,
		prevented: false,
		stopped: false,
		immediate: false,
		preventDefault() { this.prevented = true },
		stopPropagation() { this.stopped = true },
		stopImmediatePropagation() { this.immediate = true }
	}, properties || {})
}

function createFeed(initial) {
	let state = Object.assign({}, initial)
	const listeners = new Set()
	return {
		snapshot() {
			return Object.freeze(Object.assign({}, state))
		},
		subscribe(listener) {
			listeners.add(listener)
			listener(this.snapshot())
			return () => listeners.delete(listener)
		},
		emit(patch) {
			state = Object.assign({}, state, patch)
			const next = this.snapshot()
			for (const listener of Array.from(listeners)) listener(next)
		}
	}
}

function createTransactionService(game) {
	let undoCount = 1
	let redoCount = 0
	let busy = false
	let terminalBlockedReason = null
	let gate = null
	let nextFailure = null
	const listeners = new Set()
	const calls = []

	function blocked(direction) {
		if (terminalBlockedReason) return terminalBlockedReason
		if (busy) return 'BUSY'
		if (direction === 'undo' && !undoCount) return 'NO_UNDO'
		if (direction === 'redo' && !redoCount) return 'NO_REDO'
		return null
	}

	function snapshot() {
		return Object.freeze({
			version: '1.0.0',
			ready: true,
			busy,
			phase: busy ? 'applying' : terminalBlockedReason ? 'blocked' : 'idle',
			direction: null,
			undoCount,
			redoCount,
			canUndo: blocked('undo') === null,
			canRedo: blocked('redo') === null,
			undoBlockedReason: blocked('undo'),
			redoBlockedReason: blocked('redo'),
			terminalBlockedReason,
			error: null,
			disposed: false
		})
	}

	function notify() {
		const state = snapshot()
		for (const listener of Array.from(listeners)) listener(state)
	}

	async function run(direction, options) {
		calls.push({ direction, input: options?.input })
		const reason = blocked(direction)
		if (reason) {
			return {
				accepted: false,
				executed: false,
				direction,
				reason: reason.toLowerCase(),
				error: { code: reason, message: reason }
			}
		}
		busy = true
		notify()
		if (gate) await gate
		busy = false
		if (nextFailure) {
			const failure = nextFailure
			nextFailure = null
			notify()
			return failure
		}
		if (direction === 'undo') {
			undoCount -= 1
			redoCount += 1
		} else {
			redoCount -= 1
			undoCount += 1
		}
		notify()
		return {
			accepted: true,
			executed: true,
			direction,
			reason: 'complete',
			transaction: { id: direction + '-transaction' },
			snapshotId: direction + '-snapshot',
			error: null
		}
	}

	return {
		version: '1.0.0',
		game,
		calls,
		snapshot,
		subscribe(listener) {
			listeners.add(listener)
			listener(snapshot())
			return () => listeners.delete(listener)
		},
		undo(options) {
			return run('undo', options)
		},
		redo(options) {
			return run('redo', options)
		},
		setGate(value) {
			gate = value
		},
		failNext(value) {
			nextFailure = value
		},
		setTerminal(value) {
			terminalBlockedReason = value
			notify()
		}
	}
}

function flush() {
	return new Promise(resolve => setImmediate(resolve))
}

async function testMountedBehavior() {
	const definitions = []
	const hooks = new Map()
	const cleanups = []
	const timers = new Map()
	let timerId = 0
	let panelBlocking = false
	let inputBlocked = false
	let dialogOpen = false
	const document = createDocument()
	const window = new EventHub()
	class Game {
		switchPlane() {}
	}
	const sandbox = {
		console: { info() {}, warn() {}, error() {} },
		document,
		window,
		Game,
		performance: { now: () => 1000 },
		setTimeout(callback, delay) {
			const id = ++timerId
			timers.set(id, { callback, delay })
			return id
		},
		clearTimeout(id) {
			timers.delete(id)
		},
		ModLoader: {
			register(definition) {
				definitions.push(definition)
			}
		}
	}
	vm.createContext(sandbox)
	vm.runInContext(i18nSource, sandbox, { filename: I18N_PATH })
	vm.runInContext(shellSource, sandbox, { filename: SHELL_PATH })

	const api = {
		id: 'Cattail_TweaksQuality_World-Editor',
		on(name, listener) {
			if (!hooks.has(name)) hooks.set(name, [])
			hooks.get(name).push(listener)
		},
		patch() {},
		config: {
			get() { return false },
			set() {}
		},
		ui: {
			hud: {
				isHidden() { return false },
				register() { return function () {} }
			},
			isVanillaGameHudHidden() { return false }
		}
	}
	for (const definition of definitions) definition.init(api)

	const game = new Game()
	game.language = 'en'
	game.plane = false
	game.halt = false
	game.splash = { isShown: false }
	const runtime = createFeed({ active: true })
	runtime.game = game
	runtime.addCleanup = callback => cleanups.push(callback)
	const selection = createFeed({
		selectionCount: 0,
		primaryId: null,
		previewRange: null,
		selectedRange: null
	})
	selection.game = game
	selection.hasPreview = () => false
	selection.removePrimary = () => false
	const tool = createFeed({ mode: 'select' })
	tool.setMode = () => true
	const transactions = createTransactionService(game)
	const shared = {
		isEditableEvent(value) { return value.editable === true },
		isModLoaderPanelBlocking() { return panelBlocking },
		isWorldEditorInputBlocked() { return inputBlocked }
	}
	const dialogs = {
		game,
		create() {
			throw new Error('dialog not expected in 4B-1b verification')
		},
		snapshot() {
			return { ready: true, openCount: dialogOpen ? 1 : 0, disposed: false }
		}
	}
	sandbox[RUNTIME_KEY] = runtime
	sandbox[SELECTION_KEY] = selection
	sandbox[TOOL_KEY] = tool
	sandbox[TRANSACTIONS_KEY] = transactions
	sandbox[SHARED_KEY] = shared
	sandbox[DIALOGS_KEY] = dialogs

	for (const listener of hooks.get('afterGameInit') || []) listener({}, game)
	const shell = document.getElementById('cattail-world-editor-shell')
	assert.ok(shell)
	const undo = shell.querySelector('[data-world-editor-action="undo"]')
	const redo = shell.querySelector('[data-world-editor-action="redo"]')
	const status = shell.querySelector('[data-world-editor-action="history-status"]')
	assert.ok(undo)
	assert.ok(redo)
	assert.ok(status)
	assert.equal(undo.disabled, false)
	assert.equal(redo.disabled, false)
	assert.equal(undo.getAttribute('aria-disabled'), 'false')
	assert.equal(redo.getAttribute('aria-disabled'), 'true')
	assert.equal(redo.dataset.historyBlockedReason, 'NO_REDO')
	assert.match(undo.title, /Undo \(Ctrl\+Z\)/)
	assert.match(redo.title, /Nothing to redo/)
	assert.equal(status.getAttribute('role'), 'status')
	assert.equal(status.getAttribute('aria-live'), 'polite')
	assert.equal(status.dataset.active, 'false')

	let releaseUndo
	transactions.setGate(new Promise(resolve => {
		releaseUndo = resolve
	}))
	let refreshCount = 0
	const refreshReasons = []
	sandbox[PREVIEW_KEY] = {
		snapshot() {
			return { active: true, pinned: true, temporaryPinned: false, target: [3, 4] }
		},
		async refreshNow(reason) {
			refreshCount += 1
			refreshReasons.push(reason)
			return { records: [] }
		}
	}
	undo.dispatch('click', event({ detail: 1 }))
	assert.deepEqual(transactions.calls[0], { direction: 'undo', input: 'mouse' })
	assert.equal(undo.getAttribute('aria-disabled'), 'true')
	assert.equal(redo.getAttribute('aria-disabled'), 'true')
	assert.equal(undo.dataset.worldEditorToolbarBusy, 'true')
	assert.equal(redo.dataset.worldEditorToolbarBusy, 'true')
	assert.equal(status.textContent, 'History operation in progress…')
	redo.dispatch('click', event({ detail: 1 }))
	assert.equal(transactions.calls.length, 1, 'busy input must not queue a second operation')
	releaseUndo()
	transactions.setGate(null)
	await flush()
	await flush()
	assert.equal(refreshCount, 1)
	assert.deepEqual(refreshReasons, ['transaction-undo-complete'])
	assert.equal(undo.getAttribute('aria-disabled'), 'true')
	assert.equal(redo.getAttribute('aria-disabled'), 'false')
	assert.equal(status.textContent, 'Change undone.')
	assert.equal(status.dataset.kind, 'success')
	assert.ok(Array.from(timers.values()).some(timer => timer.delay === 3000))

	const blockedUndo = event({ key: 'z', ctrlKey: true })
	window.dispatch('keydown', blockedUndo)
	assert.equal(blockedUndo.prevented, true)
	assert.equal(blockedUndo.immediate, true)
	assert.equal(transactions.calls.length, 1)
	assert.equal(status.textContent, 'Nothing to undo.')

	const keyboardRedo = event({ key: 'y', ctrlKey: true })
	window.dispatch('keydown', keyboardRedo)
	await flush()
	await flush()
	assert.equal(keyboardRedo.prevented, true)
	assert.equal(keyboardRedo.immediate, true)
	assert.deepEqual(transactions.calls[1], { direction: 'redo', input: 'keyboard' })
	assert.equal(refreshCount, 2)
	assert.equal(refreshReasons[1], 'transaction-redo-complete')
	assert.equal(status.textContent, 'Change redone.')

	for (const guarded of [
		event({ key: 'z', ctrlKey: true, repeat: true }),
		event({ key: 'z', ctrlKey: true, isComposing: true }),
		event({ key: 'z', ctrlKey: true, keyCode: 229 }),
		event({ key: 'z', ctrlKey: true, editable: true }),
		event({ key: 'z', ctrlKey: true, altKey: true }),
		event({ key: 'z', ctrlKey: true, metaKey: true })
	]) {
		window.dispatch('keydown', guarded)
		assert.equal(guarded.prevented, false)
	}
	dialogOpen = true
	const dialogGuard = event({ key: 'z', ctrlKey: true })
	window.dispatch('keydown', dialogGuard)
	assert.equal(dialogGuard.prevented, false)
	dialogOpen = false
	panelBlocking = true
	const panelGuard = event({ key: 'z', ctrlKey: true })
	window.dispatch('keydown', panelGuard)
	assert.equal(panelGuard.prevented, false)
	panelBlocking = false
	inputBlocked = true
	const inputGuard = event({ key: 'z', ctrlKey: true })
	window.dispatch('keydown', inputGuard)
	assert.equal(inputGuard.prevented, false)
	inputBlocked = false
	runtime.emit({ active: false })
	const inactiveGuard = event({ key: 'z', ctrlKey: true })
	window.dispatch('keydown', inactiveGuard)
	assert.equal(inactiveGuard.prevented, false)
	runtime.emit({ active: true })

	sandbox[PREVIEW_KEY].refreshNow = async function (reason) {
		refreshCount += 1
		refreshReasons.push(reason)
		return null
	}
	undo.dispatch('click', event({ detail: 0 }))
	await flush()
	await flush()
	assert.deepEqual(transactions.calls[2], { direction: 'undo', input: 'keyboard' })
	assert.equal(refreshCount, 3)
	assert.equal(status.textContent, 'The operation completed, but the blueprint preview could not refresh.')
	assert.equal(status.dataset.kind, 'warning')
	assert.ok(Array.from(timers.values()).some(timer => timer.delay === 6000))

	const refreshBeforeFailure = refreshCount
	transactions.failNext({
		accepted: true,
		executed: false,
		direction: 'redo',
		reason: 'rolled-back',
		transaction: null,
		snapshotId: 'rollback-snapshot',
		error: { code: 'APPLY_FAILED', message: 'apply failed' }
	})
	redo.dispatch('click', event({ detail: 1 }))
	await flush()
	await flush()
	assert.equal(refreshCount, refreshBeforeFailure, 'failed operations must not refresh the preview')
	assert.equal(status.textContent, 'The operation failed; the previous state was restored.')
	assert.equal(status.dataset.kind, 'error')

	sandbox[PREVIEW_KEY].snapshot = function () {
		throw new Error('preview snapshot failed')
	}
	redo.dispatch('click', event({ detail: 1 }))
	await flush()
	await flush()
	assert.equal(status.textContent, 'The operation completed, but the blueprint preview could not refresh.')
	assert.equal(status.dataset.kind, 'warning')
	assert.equal(refreshCount, refreshBeforeFailure)

	transactions.setTerminal('ROLLBACK_FAILED')
	assert.equal(undo.getAttribute('aria-disabled'), 'true')
	assert.equal(redo.getAttribute('aria-disabled'), 'true')
	assert.equal(undo.dataset.worldEditorToolbarBusy, 'false')
	assert.equal(status.textContent, 'Recovery failed. Reload the game before editing again.')
	assert.equal(status.dataset.kind, 'terminal')
	const callsBeforeTerminal = transactions.calls.length
	const terminalShortcut = event({ key: 'z', ctrlKey: true })
	window.dispatch('keydown', terminalShortcut)
	assert.equal(terminalShortcut.prevented, true)
	assert.equal(transactions.calls.length, callsBeforeTerminal)

	game.language = 'sch'
	for (const listener of hooks.get('afterWords') || []) listener({}, game)
	assert.match(undo.title, /撤销/)
	assert.equal(status.textContent, '恢复失败。请重新加载游戏后再编辑。')

	for (const cleanup of cleanups.splice(0)) cleanup()
	assert.equal(window.count('keydown'), 0)
	assert.equal(document.getElementById('cattail-world-editor-shell'), null)
}

async function main() {
	testSourceContracts()
	testLocalization()
	await testMountedBehavior()
	console.log('World Editor 4B-1b verification passed: history controls, shortcuts, guards, statuses, preview refresh, localization, and cleanup.')
}

main().catch(error => {
	console.error(error)
	process.exitCode = 1
})
