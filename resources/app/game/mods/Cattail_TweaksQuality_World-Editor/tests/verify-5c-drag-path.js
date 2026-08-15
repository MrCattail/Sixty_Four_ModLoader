const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const SOURCE_PATH = path.join(MOD_ROOT, 'scripts/input/paint-cube-input.js')
const source = fs.readFileSync(SOURCE_PATH, 'utf8')

class Hub {
	constructor() { this.listeners = new Map() }
	addEventListener(name, listener) {
		if (!this.listeners.has(name)) this.listeners.set(name, [])
		this.listeners.get(name).push(listener)
	}
	removeEventListener(name, listener) {
		this.listeners.set(name, (this.listeners.get(name) || []).filter(value => value !== listener))
	}
	dispatch(name, event = {}) {
		for (const listener of (this.listeners.get(name) || []).slice()) listener(Object.assign({
			type: name,
			preventDefault() {},
			stopPropagation() {},
			stopImmediatePropagation() {}
		}, event))
	}
	dispatchEvent(event) { this.dispatch(event.type, event); return true }
}

function feed(initial) {
	let state = Object.assign({}, initial)
	const listeners = new Set()
	return {
		snapshot() { return Object.assign({}, state) },
		subscribe(listener) { listeners.add(listener); listener(this.snapshot()); return () => listeners.delete(listener) },
		emit(next) { state = Object.assign({}, state, next); for (const listener of listeners) listener(this.snapshot()) }
	}
}

function createEnvironment() {
	const definitions = []
	const hooks = new Map()
	const canvas = new Hub()
	const window = new Hub()
	const calls = []
	const runtimeFeed = feed({ active: true })
	const tool = feed({ mode: 'draw' })
	const paintUi = feed({ subtool: 'brush' })
	const game = {
		canvas,
		plane: 0,
		halt: false,
		splash: { isShown: false },
		mouse: { cursorVisible: true },
		hoveredCell: [0, 0],
		updateMouseData() {}
	}
	const runtime = Object.assign(runtimeFeed, {
		game,
		isActive() { return true },
		addCleanup() {}
	})
	paintUi.game = game
	const stroke = {
		game,
		maxCells: 512,
		inspectCell(cell, action) {
			return { cell: cell.slice(), action, known: true, eligible: true, occupied: false, painted: false, operation: 'paint', before: null }
		},
		executeStroke(request) {
			calls.push(JSON.parse(JSON.stringify(request)))
			return Promise.resolve({ accepted: true, executed: true, transaction: { summary: {} } })
		},
		beginLiveStroke(request) {
			const changes = []
			const visited = new Set()
			let closed = false
			return {
				ready: Promise.resolve({ begun: true }),
				sample(cell) {
					if (closed) return { ok: false, reason: 'CLOSED' }
					const key = cell[0] + ':' + cell[1]
					if (visited.has(key)) return { ok: true, duplicate: true }
					visited.add(key)
					const inspection = stroke.inspectCell(cell, request.action)
					const change = {
						cell: inspection.cell.slice(),
						operation: 'paint',
						before: null,
						after: { name: 'cube', position: inspection.cell.slice(), par: { marker: 'painted' } }
					}
					changes.push(change)
					return { ok: true, change: JSON.parse(JSON.stringify(change)) }
				},
				commit() {
					closed = true
					const targets = changes.map(change => ({ cell: change.cell.slice(), before: null }))
					calls.push(Object.assign(JSON.parse(JSON.stringify(request)), {
						targets,
						initialSkipped: 0,
						limitReached: false
					}))
					return Promise.resolve({ accepted: true, executed: true, transaction: { summary: {} } })
				},
				cancel() {
					closed = true
					return Promise.resolve(true)
				},
				snapshot() {
					return { ready: true, closed, changes: JSON.parse(JSON.stringify(changes)), skippedCount: 0, limitReached: false, error: null }
				}
			}
		}
	}
	class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail } }
	const sandbox = {
		Promise,
		CustomEvent,
		window,
		console: { info() {}, warn() {} },
		ModLoader: { register(definition) { definitions.push(definition) } }
	}
	vm.createContext(sandbox)
	vm.runInContext(source, sandbox, { filename: SOURCE_PATH })
	sandbox[Symbol.for('cattail.world-editor.runtime')] = runtime
	sandbox[Symbol.for('cattail.world-editor.shared')] = { isWorldEditorInputBlocked() { return false } }
	sandbox[Symbol.for('cattail.world-editor.tool')] = tool
	sandbox[Symbol.for('cattail.world-editor.paint-cube-ui')] = paintUi
	sandbox[Symbol.for('cattail.world-editor.paint-cube-stroke')] = stroke
	sandbox[Symbol.for('cattail.world-editor.blueprint-preview')] = { snapshot() { return { active: false } } }
	definitions[0].init({ on(name, listener) { hooks.set(name, listener) } })
	hooks.get('afterGameInit')({}, game)
	return { canvas, game, calls, service: sandbox[Symbol.for('cattail.world-editor.paint-cube-input')] }
}

async function flush() {
	await Promise.resolve()
	await new Promise(resolve => setImmediate(resolve))
}

async function drag(points) {
	const env = createEnvironment()
	env.game.hoveredCell = points[0].slice()
	env.canvas.dispatch('mousedown', { button: 0, buttons: 1 })
	for (const point of points.slice(1)) {
		env.game.hoveredCell = point.slice()
		env.canvas.dispatch('mousemove', { button: 0, buttons: 1 })
	}
	const pending = env.service.snapshot()
	assert.equal(env.calls.length, 0)
	env.game.hoveredCell = points[points.length - 1].slice()
	env.canvas.dispatch('mouseup', { button: 0, buttons: 0 })
	await flush()
	return { pending, request: env.calls[0] }
}

function assertContinuous(cells) {
	for (let index = 1; index < cells.length; index += 1) {
		const du = Math.abs(cells[index][0] - cells[index - 1][0])
		const dv = Math.abs(cells[index][1] - cells[index - 1][1])
		assert.equal(du + dv, 1, 'path gap at index ' + index)
	}
}

async function testFastStraightAndDiagonalPaths() {
	const straight = await drag([[0, 0], [20, 0]])
	const straightCells = JSON.parse(JSON.stringify(straight.request.targets.map(target => target.cell)))
	assert.equal(straightCells.length, 21)
	assert.deepEqual(straightCells, Array.from({ length: 21 }, (_, index) => [index, 0]))
	assert.deepEqual(JSON.parse(JSON.stringify(straight.pending.cells)), straightCells)
	assertContinuous(straightCells)

	const diagonal = await drag([[0, 0], [5, 2]])
	const diagonalCells = JSON.parse(JSON.stringify(diagonal.request.targets.map(target => target.cell)))
	assert.deepEqual(diagonalCells, [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [4, 1], [4, 2], [5, 2]])
	assertContinuous(diagonalCells)

	const reverse = await drag([[5, 2], [0, 0]])
	assert.deepEqual(JSON.parse(JSON.stringify(reverse.request.targets.map(target => target.cell))), diagonalCells.slice().reverse())
}

async function testRevisitedCellsOnlyOnce() {
	const result = await drag([[0, 0], [6, 0], [2, 0], [6, 0]])
	const cells = JSON.parse(JSON.stringify(result.request.targets.map(target => target.cell)))
	assert.deepEqual(cells, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]])
	assert.equal(new Set(cells.map(cell => cell.join(':'))).size, cells.length)
	assert.equal(result.pending.visitedCount, 7)
}

async function run() {
	await testFastStraightAndDiagonalPaths()
	await testRevisitedCellsOnlyOnce()
	assert.match(source, /const decision = \(1 \+ 2 \* movedU\) \* dv - \(1 \+ 2 \* movedV\) \* du/)
	console.log('World Editor 5C-4 drag-path verification passed: fast straight/diagonal strokes fill deterministic adjacent cells, retain the full pending trail, and count revisits once.')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
