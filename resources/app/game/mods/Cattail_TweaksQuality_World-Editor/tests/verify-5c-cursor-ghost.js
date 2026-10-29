const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const SOURCE_PATH = path.join(MOD_ROOT, 'scripts/render/paint-cube-cursor.js')
const MANIFEST_PATH = path.join(MOD_ROOT, 'mod.json')
const source = fs.readFileSync(SOURCE_PATH, 'utf8')
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))

function clone(value) {
	return value == null ? value : JSON.parse(JSON.stringify(value))
}

function createFeed(initial) {
	let state = clone(initial)
	const listeners = new Set()
	return {
		snapshot() { return clone(state) },
		subscribe(listener) {
			listeners.add(listener)
			listener(clone(state))
			return function () { listeners.delete(listener) }
		},
		emit(next) {
			state = clone(next)
			for (const listener of Array.from(listeners)) listener(clone(state))
		},
		listenerCount() { return listeners.size }
	}
}

function createEventTarget() {
	const listeners = new Map()
	let hovered = true
	return {
		addEventListener(type, listener) {
			if (!listeners.has(type)) listeners.set(type, new Set())
			listeners.get(type).add(listener)
		},
		removeEventListener(type, listener) {
			listeners.get(type)?.delete(listener)
		},
		dispatch(type, event = {}) {
			for (const listener of Array.from(listeners.get(type) || [])) listener(event)
		},
		matches(selector) { return selector === ':hover' && hovered },
		setHovered(value) { hovered = value === true },
		listenerCount(type) { return listeners.get(type)?.size || 0 }
	}
}

function createContext() {
	const operations = []
	const stack = []
	const ctx = {
		operations,
		globalCompositeOperation: 'source-over',
		fillStyle: '#000',
		strokeStyle: '#000',
		lineWidth: 1,
		lineJoin: 'miter',
		lineCap: 'butt',
		save() {
			stack.push({
				globalCompositeOperation: this.globalCompositeOperation,
				fillStyle: this.fillStyle,
				strokeStyle: this.strokeStyle,
				lineWidth: this.lineWidth,
				lineJoin: this.lineJoin,
				lineCap: this.lineCap
			})
			operations.push(['save'])
		},
		restore() {
			Object.assign(this, stack.pop() || {})
			operations.push(['restore'])
		},
		setTransform(...args) { operations.push(['setTransform', ...args]) },
		translate(...args) { operations.push(['translate', ...args]) },
		beginPath() { operations.push(['beginPath']) },
		closePath() { operations.push(['closePath']) },
		moveTo(...args) { operations.push(['moveTo', ...args]) },
		lineTo(...args) { operations.push(['lineTo', ...args]) },
		arc(...args) { operations.push(['arc', ...args]) },
		fill() { operations.push(['fill', this.globalCompositeOperation, this.fillStyle]) },
		stroke() { operations.push(['stroke', this.strokeStyle, this.lineWidth]) }
	}
	return ctx
}

function createEnvironment() {
	let occupiedEntity = null
	let inputBlocked = false
	let blueprintActive = false
	let inputState = { active: false, action: 'paint', cells: [] }
	const cleanups = []
	const canvas = createEventTarget()
	const windowTarget = createEventTarget()
	const game = {
		canvas,
		halt: false,
		plane: 0,
		pixelRatio: 1,
		unit: 32,
		solidUnit: 32,
		zoom: 1,
		w: 800,
		h: 600,
		w2: 400,
		h2: 300,
		hoveredCell: [3, 4],
		mouse: { xy: [220, 160], cursorVisible: true },
		splash: { isShown: false },
		codex: { resources: [
			{ triplet: ['#ff0000', '#ff0000', '#ff0000'] },
			{ triplet: ['#0000ff', '#0000ff', '#0000ff'] },
			...Array.from({ length: 8 }, () => ({ triplet: ['#ffffff', '#ffffff', '#ffffff'] }))
		] },
		uvToXY(cell) {
			return [(cell[0] - cell[1]) * 12, (cell[0] + cell[1]) * 7]
		},
		entityAtCoordinates() { return occupiedEntity }
	}
	const runtimeFeed = createFeed({ active: true })
	const runtime = Object.assign(runtimeFeed, {
		game,
		isActive() { return runtime.snapshot().active },
		addCleanup(callback) { cleanups.push(callback) }
	})
	const tool = createFeed({ mode: 'draw' })
	const paintUi = createFeed({
		subtool: 'brush',
		paletteOpen: false,
		recipe: {
			version: 1,
			weights: [{ resource: 0, weight: 75 }, { resource: 1, weight: 25 }],
			totalWeight: 100
		}
	})
	paintUi.game = game
	const stroke = {
		game,
		inspectCell(cell, action) {
			const occupied = !!occupiedEntity
			const painted = occupiedEntity?.painted === true
			const eligible = action === 'erase' ? painted : !occupied || painted
			return {
				cell: cell.slice(), action, known: true, eligible, occupied, painted,
				operation: eligible ? action === 'erase' ? 'erase' : painted ? 'replace' : 'paint' : null,
				before: occupied ? { name: occupiedEntity.name || 'cube', position: cell.slice(), par: {} } : null
			}
		}
	}
	const callbacks = new Map()
	const stopped = new Set()
	const hooks = {}
	let definition = null
	const sandbox = {
		console: { info() {}, warn() {}, error() {} },
		window: windowTarget,
		ModLoader: {
			register(value) { definition = value }
		}
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(source, sandbox, { filename: SOURCE_PATH })
	assert.ok(definition)

	const api = {
		on(name, listener) { hooks[name] = listener },
		render: {
			onLayer(layer, callback, options) {
				callbacks.set(options.id, { layer, callback, options })
				return function () { stopped.add(options.id) }
			}
		}
	}
	sandbox[Symbol.for('cattail.world-editor.runtime')] = runtime
	sandbox[Symbol.for('cattail.world-editor.shared')] = {
		isWorldEditorInputBlocked() { return inputBlocked }
	}
	sandbox[Symbol.for('cattail.world-editor.tool')] = tool
	sandbox[Symbol.for('cattail.world-editor.paint-cube-ui')] = paintUi
	sandbox[Symbol.for('cattail.world-editor.paint-cube-stroke')] = stroke
	sandbox[Symbol.for('cattail.world-editor.paint-cube-input')] = { snapshot() { return clone(inputState) } }
	sandbox[Symbol.for('cattail.world-editor.blueprint-preview')] = {
		snapshot() { return { active: blueprintActive } }
	}

	definition.init(api)
	assert.equal(typeof hooks.afterGameInit, 'function')
	hooks.afterGameInit({}, game)
	const service = sandbox[Symbol.for('cattail.world-editor.paint-cube-cursor')]
	assert.ok(service)
	assert.equal(callbacks.size, 2)

	function renderEntry(id) {
		const entry = callbacks.get(id)
		assert.ok(entry)
		return entry
	}

	return {
		sandbox,
		game,
		canvas,
		window: windowTarget,
		runtime,
		tool,
		paintUi,
		service,
		stopped,
		setOccupied(value) { occupiedEntity = value },
		setInputState(value) { inputState = clone(value) },
		setInputBlocked(value) { inputBlocked = value === true },
		setBlueprintActive(value) { blueprintActive = value === true },
		enabled(id) {
			return renderEntry(id).options.enabled({ game })
		},
		draw(id, context = createContext()) {
			renderEntry(id).callback({ game, ctx: context, width: game.w, height: game.h })
			return context
		},
		entry(id) { return renderEntry(id) },
		cleanup() {
			while (cleanups.length) cleanups.pop()()
		}
	}
}

function testManifestAndReadOnlyBoundary() {
	assert.equal(manifest.version, '0.6.0')
	assert.equal(manifest.entry.length, 47)
	const selectionCursorIndex = manifest.entry.indexOf('scripts/render/selection-cursor.js')
	const paintCursorIndex = manifest.entry.indexOf('scripts/render/paint-cube-cursor.js')
	const thumbnailIndex = manifest.entry.indexOf('scripts/render/blueprint-thumbnail.js')
	assert.ok(paintCursorIndex > selectionCursorIndex)
	assert.ok(paintCursorIndex < thumbnailIndex)
	assert.equal(manifest.entry.includes('scripts/core/paint-cube-state.js'), true)
	assert.equal(manifest.entry.includes('scripts/core/paint-cube-stroke.js'), true)
	assert.equal(manifest.entry.includes('scripts/input/paint-cube-input.js'), true)
	assert.equal(manifest.entry.includes('scripts/ui/paint-cube-ui.js'), true)
	assert.doesNotMatch(source, /\baddEntity\s*\(|\bclearCell\s*\(|\bexecuteStroke\s*\(|worldEditorPaint|editor-transactions/)
	assert.doesNotMatch(source, /preventDefault|stopPropagation|stopImmediatePropagation/)
	assert.match(source, /currentTool\?\.mode !== 'draw'/)
	assert.match(source, /game\.plane/)
	assert.match(source, /rightButtonDown/)
	assert.match(source, /stroke\.inspectCell\(cell, action\)/)
	assert.match(source, /function recipeColors\(game, recipe\)/)
	assert.match(source, /currentPaintUi\?\.paletteOpen === true/)
	assert.match(source, /const BRUSH_COLOR = 'rgba\(117, 220, 255, \.96\)'/)
	assert.match(source, /const ERASER_COLOR = 'rgba\(255, 157, 86, \.98\)'/)
	assert.match(source, /const INVALID_COLOR = 'rgba\(255, 104, 112, \.96\)'/)
}

function testCurrentCellGhostAndCrosshair() {
	const env = createEnvironment()
	assert.equal(env.entry('world-editor-paint-cube-ghost').layer, 'interaction')
	assert.equal(env.entry('world-editor-paint-cube-ghost').options.order, 70)
	assert.equal(env.entry('world-editor-paint-cube-crosshair').layer, 'cursor')
	assert.equal(env.entry('world-editor-paint-cube-crosshair').options.order, 110)
	assert.equal(env.enabled('world-editor-paint-cube-ghost'), true)
	assert.equal(env.enabled('world-editor-paint-cube-crosshair'), true)
	let state = env.service.snapshot()
	assert.equal(state.visible, true)
	assert.equal(state.valid, true)
	assert.equal(state.occupied, false)
	assert.deepEqual(Array.from(state.cell), [3, 4])

	const ghostContext = env.draw('world-editor-paint-cube-ghost')
	assert.ok(ghostContext.operations.some(entry => entry[0] === 'fill' && String(entry[2]).includes('191, 0, 64')))
	assert.ok(ghostContext.operations.some(entry => entry[0] === 'stroke' && entry[1] === 'rgba(255, 0, 0, 0.96)'))
	const cursorContext = env.draw('world-editor-paint-cube-crosshair')
	assert.ok(cursorContext.operations.some(entry => entry[0] === 'arc'))
	assert.ok(cursorContext.operations.some(entry => entry[0] === 'fill' && entry[1] === 'destination-out'))
	assert.ok(cursorContext.operations.some(entry => entry[0] === 'stroke' && entry[1] === 'rgba(255, 0, 0, 0.96)'))

	env.game.hoveredCell = [8, 9]
	state = env.service.snapshot()
	assert.deepEqual(Array.from(state.cell), [8, 9])
	assert.deepEqual(Array.from(state.pendingCells), [])
	env.setInputState({
		active: true,
		action: 'paint',
		recipe: { version: 1, weights: [{ resource: 1, weight: 100 }], totalWeight: 100 },
		cells: [[8, 9], [9, 9], [10, 9]]
	})
	state = env.service.snapshot()
	assert.deepEqual(JSON.parse(JSON.stringify(state.pendingCells)), [[8, 9], [9, 9], [10, 9]])
	const trailContext = env.draw('world-editor-paint-cube-ghost')
	assert.equal(trailContext.operations.filter(entry => entry[0] === 'stroke' && entry[1] === 'rgba(0, 0, 255, 0.96)').length, 3)
	env.cleanup()
}

function testOccupiedAndVisibilityGuards() {
	const env = createEnvironment()
	env.setOccupied({ name: 'crate', painted: false })
	let state = env.service.snapshot()
	assert.equal(state.visible, true)
	assert.equal(state.valid, false)
	assert.equal(state.occupied, true)
	const invalidContext = env.draw('world-editor-paint-cube-ghost')
	assert.ok(invalidContext.operations.some(entry => entry[0] === 'stroke' && entry[1] === 'rgba(255, 104, 112, .96)'))
	env.setOccupied({ name: 'cube', painted: true })
	state = env.service.snapshot()
	assert.equal(state.valid, true)
	assert.equal(state.operation, 'replace')
	env.paintUi.emit({ subtool: 'eraser' })
	state = env.service.snapshot()
	assert.equal(state.action, 'erase')
	assert.equal(state.operation, 'erase')
	const eraserContext = env.draw('world-editor-paint-cube-ghost')
	assert.ok(eraserContext.operations.some(entry => entry[0] === 'stroke' && entry[1] === 'rgba(255, 157, 86, .98)'))
	env.paintUi.emit({
		subtool: 'brush',
		paletteOpen: true,
		recipe: { version: 1, weights: [{ resource: 0, weight: 100 }], totalWeight: 100 }
	})
	assert.equal(env.enabled('world-editor-paint-cube-ghost'), false, 'the palette hides both ghost and crosshair')
	env.paintUi.emit({
		subtool: 'brush',
		paletteOpen: false,
		recipe: { version: 1, weights: [{ resource: 0, weight: 100 }], totalWeight: 100 }
	})

	env.canvas.dispatch('mousedown', { button: 2, buttons: 2 })
	assert.equal(env.enabled('world-editor-paint-cube-ghost'), false)
	env.canvas.dispatch('mouseup', { button: 2, buttons: 0 })
	assert.equal(env.enabled('world-editor-paint-cube-ghost'), true)

	env.game.plane = 1
	assert.equal(env.enabled('world-editor-paint-cube-ghost'), false)
	env.game.plane = 0
	env.setInputBlocked(true)
	assert.equal(env.enabled('world-editor-paint-cube-ghost'), false)
	env.setInputBlocked(false)
	env.setBlueprintActive(true)
	assert.equal(env.enabled('world-editor-paint-cube-ghost'), false)
	env.setBlueprintActive(false)
	env.tool.emit({ mode: 'select' })
	assert.equal(env.enabled('world-editor-paint-cube-ghost'), false)
	env.tool.emit({ mode: 'draw' })
	env.runtime.emit({ active: false })
	assert.equal(env.enabled('world-editor-paint-cube-ghost'), false)
	env.runtime.emit({ active: true })
	env.canvas.dispatch('mouseleave')
	assert.equal(env.enabled('world-editor-paint-cube-ghost'), false)
	env.canvas.dispatch('mouseenter')
	assert.equal(env.enabled('world-editor-paint-cube-ghost'), true)

	env.cleanup()
	assert.equal(env.stopped.has('world-editor-paint-cube-ghost'), true)
	assert.equal(env.stopped.has('world-editor-paint-cube-crosshair'), true)
	assert.equal(env.sandbox[Symbol.for('cattail.world-editor.paint-cube-cursor')], undefined)
}

testManifestAndReadOnlyBoundary()
testCurrentCellGhostAndCrosshair()
testOccupiedAndVisibilityGuards()

console.log('World Editor 5C-5 cursor verification passed: weighted palette faces, dominant accents, frozen live-recipe trail, palette hiding, Brush/replace/Eraser feedback, cleanup, and cursor-only ownership.')
