const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const scriptPath = path.resolve(__dirname, '..', 'scripts', 'entity-slice-cache.js')
const source = fs.readFileSync(scriptPath, 'utf8')
const handlers = {}
let canvasCreateCount = 0

function makeContext() {
	return {
		globalAlpha: 1,
		globalCompositeOperation: 'source-over',
		filter: 'none',
		imageSmoothingEnabled: true,
		imageSmoothingQuality: 'high',
		drawImage() {},
		getTransform() {
			return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
		}
	}
}

function makeCanvas() {
	canvasCreateCount++
	const context = makeContext()
	return {
		width: 0,
		height: 0,
		getContext(kind) {
			return kind === '2d' ? context : null
		}
	}
}

class FakeGame {
	constructor() {
		this.halt = false
		this.plane = null
		this.unit = 32
		this.zoom = 1
		this.pixelRatio = 1
		this.ctx = makeContext()
		this.stuff = []
		this.vanillaRenderCalls = 0
	}

	isVisible() {
		return true
	}

	uvToXY(position) {
		return [Number(position[0]) * 10, Number(position[1]) * 10]
	}

	renderEntities() {
		this.vanillaRenderCalls++
	}
}

const api = {
	config: {
		get() {
			return true
		}
	},
	on(name, handler) {
		if (!handlers[name]) handlers[name] = []
		handlers[name].push(handler)
	},
	patch(target, name, factory) {
		target[name] = factory(target[name])
	}
}

const sandbox = {
	console,
	Game: FakeGame,
	document: {
		createElement(name) {
			assert.strictEqual(name, 'canvas')
			return makeCanvas()
		}
	},
	ModLoader: {
		register(definition) {
			definition.init(api)
		}
	},
	addEventListener() {}
}
sandbox.window = sandbox

vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: scriptPath })
for (const handler of handlers.afterVanillaScripts || []) handler()

const debug = sandbox.CattailTweaksEntitySliceCache
assert(debug, 'slice cache debug API should be installed')

function makeSprite() {
	return {
		img: {
			complete: true,
			naturalWidth: 32,
			naturalHeight: 32,
			src: 'test://stable-sprite'
		},
		frames: [[0, 0, 32, 32]],
		origins: [[16, 16]],
		sequences: [[0]],
		currentSequence: 0,
		currentFrame: 0,
		scale: 1
	}
}

function makeCacheable(position) {
	return {
		name: 'mega1',
		position,
		sprite: makeSprite(),
		renderCount: 0,
		render() {
			this.renderCount++
		}
	}
}

function makeBlocker(position) {
	return {
		name: 'test-blocker',
		position,
		renderCount: 0,
		render() {
			this.renderCount++
		}
	}
}

function makeScene(sliceCount, offset = 0, pairGap = 1) {
	const entities = []
	for (let index = 0; index < sliceCount; index++) {
		const base = offset + index * (pairGap + 4)
		entities.push(makeCacheable([base, base]))
		entities.push(makeCacheable([base + pairGap, base + pairGap]))
		entities.push(makeBlocker([base + pairGap + 1, base + pairGap + 1]))
	}
	return entities
}

const game = new FakeGame()
game.stuff = makeScene(102)

game.renderEntities(0)
let first = debug.stats()
assert.strictEqual(first.cacheEntries, 96, 'first dense frame should fill the entry budget')
assert.strictEqual(first.cacheBuilds, 96, 'only admitted slices should build canvases')
assert.strictEqual(first.misses, 102, 'every first-frame lookup should be a miss')
assert.strictEqual(first.hits, 0)
assert.strictEqual(first.admissionRejects, 6, 'overflow slices should use original drawing')
assert.strictEqual(first.overflowSlices, 6)
assert.strictEqual(first.overflowEntities, 12)
assert.strictEqual(first.evictions, 0)
assert.strictEqual(first.clears, 0, 'capacity pressure must not clear the entire cache')
assert.strictEqual(canvasCreateCount, 96, 'overflow slices must not allocate throwaway canvases')
assert(first.cachePixels > 0 && first.cachePixels <= first.maxCacheTotalPixels)

game.renderEntities(0)
let second = debug.stats()
assert.strictEqual(second.cacheEntries, 96)
assert.strictEqual(second.cacheBuilds, 96, 'stable overflow must not rebuild cached canvases')
assert.strictEqual(second.hits, 96, 'the stable second frame should reuse all admitted slices')
assert.strictEqual(second.misses, 108, 'only the six uncached overflow slices should miss again')
assert.strictEqual(second.admissionRejects, 12)
assert.strictEqual(second.evictions, 0, 'current-frame hot entries must not be evicted')
assert.strictEqual(second.clears, 0)
assert.strictEqual(canvasCreateCount, 96)

game.stuff = makeScene(102, 10000)
game.renderEntities(0)
let moved = debug.stats()
assert.strictEqual(moved.cacheEntries, 96)
assert.strictEqual(moved.evictions, 96, 'a new view should progressively replace stale entries')
assert.strictEqual(moved.cacheBuilds, 192)
assert.strictEqual(moved.admissionRejects, 18)
assert.strictEqual(moved.clears, 0, 'view changes must not cause a global cache clear')
assert.strictEqual(canvasCreateCount, 192)
assert(moved.cachePixels > 0 && moved.cachePixels <= moved.maxCacheTotalPixels)

debug.clear()
game.stuff = makeScene(30, 20000, 120)
game.renderEntities(0)
const pixelLimited = debug.stats()
assert(pixelLimited.cacheEntries < 30, 'the total pixel budget should limit large cached slices')
assert(pixelLimited.admissionRejects > 0, 'large overflow slices should fall back safely')
assert(pixelLimited.cachePixels <= pixelLimited.maxCacheTotalPixels)
assert.strictEqual(pixelLimited.evictions, 0, 'same-frame hot slices should remain protected at the pixel limit')

console.log('entity-slice-cache regression checks passed')
