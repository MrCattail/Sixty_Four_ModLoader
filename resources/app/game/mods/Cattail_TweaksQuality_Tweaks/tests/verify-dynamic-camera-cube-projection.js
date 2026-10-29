const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const dynamicCameraPath = path.resolve(__dirname, '..', 'scripts', 'camera-angles.js')
const cubeCachePath = path.resolve(__dirname, '..', 'scripts', 'cube-resource-cache.js')
const dynamicCameraSource = fs.readFileSync(dynamicCameraPath, 'utf8')
const cubeCacheSource = fs.readFileSync(cubeCachePath, 'utf8')
const handlers = {}
const listeners = {}
const createdCanvases = []
const config = new Map([
	['enableCameraAngle', true],
	['cameraPitch', .5],
	['cameraYaw', 0],
	['enableStableCubeResourceCache', true],
	['enableDamagedCubeResourceCache', true]
])

function makeContext() {
	return {
		globalAlpha: 1,
		globalCompositeOperation: 'source-over',
		filter: 'none',
		imageSmoothingEnabled: true,
		imageSmoothingQuality: 'high',
		fillStyle: '#000',
		fills: [],
		drawImages: [],
		currentPath: [],
		save() {},
		restore() {},
		beginPath() {
			this.currentPath = []
		},
		moveTo(x, y) {
			this.currentPath.push([x, y])
		},
		lineTo(x, y) {
			this.currentPath.push([x, y])
		},
		closePath() {},
		fill() {
			this.fills.push({ color: this.fillStyle, points: this.currentPath.map(point => point.slice()) })
		},
		rect() {},
		clip() {},
		clearRect() {},
		drawImage(...args) {
			const atlasDraw = args.length === 9
			this.drawImages.push({
				canvas: args[0],
				x: atlasDraw ? args[5] : args[1],
				y: atlasDraw ? args[6] : args[2],
				args
			})
		},
		getTransform() {
			return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
		}
	}
}

function makeCanvas() {
	const context = makeContext()
	const canvas = {
		width: 0,
		height: 0,
		context,
		getContext(kind) {
			return kind === '2d' ? context : null
		}
	}
	createdCanvases.push(canvas)
	return canvas
}

function makeResourceSprite(index) {
	return {
		img: {
			src: 'resource-' + index + '.png',
			complete: true,
			naturalWidth: 32,
			naturalHeight: 32
		},
		sequences: [[0]],
		currentSequence: 0,
		currentFrame: 0,
		frames: [[0, 0, 32, 32]],
		origins: [[16, 16]],
		scale: 1
	}
}

class FakeGame {
	constructor() {
		this.unit = 100
		this.zoom = 1
		this.pixelRatio = 1
		this.translation = [0, 0]
		this.w = 800
		this.h = 600
		this.w2 = 400
		this.h2 = 300
		this.halt = false
		this.plane = 0
		this.ctx = makeContext()
		this.stuff = []
		this.codex = {
			resources: Array.from({ length: 10 }, (_, index) => ({
				triplet: [`#${index}11`, `#${index}22`, `#${index}33`]
			}))
		}
		this.resourcesSprites = Array.from({ length: 10 }, (_, index) => makeResourceSprite(index))
	}

	uvToXY(uv) {
		return [
			(uv[0] * .866 - uv[1] * .866) * this.unit,
			(uv[0] * .5 + uv[1] * .5) * this.unit
		]
	}

	xyToUV() {
		return [0, 0]
	}

	xyToUVUntranslated() {
		return [0, 0]
	}

	renderloop() {}
	renderAvailability() {}
	renderHoveredCell() {}
	renderSOI() {}
	drawPrism() {}
	isVisible() { return true }
}

class FakeCube {
	constructor(master) {
		this.master = master
		this.name = 'cube'
		this.position = [10, 20]
		this.state = 2
		this.broken = 0
		this.shakePower = .04
		this.originalDraws = 0
		this.resources = Array.from({ length: 64 }, (_, index) => index % 7)
		this.resourceCoordinates = []
		this.resourceShifts3d = []
		for (let index = 0; index < 64; index++) {
			const dx = -.385 + .25 * (index % 4)
			const dy = -.385 + .25 * (Math.floor(index / 4) % 4)
			const dz = .25 * Math.floor(index / 16)
			this.resourceCoordinates.push([this.position[0] + dx - dz, this.position[1] + dy - dz])
			this.resourceShifts3d.push([0, 0, 0])
		}
	}

	drawResources() {
		this.originalDraws++
	}

	swapRandomResource() {}
	onmousedown() {}
	onDelete() {}
}

const api = {
	config: {
		get(key, fallback) {
			return config.has(key) ? config.get(key) : fallback
		},
		set(key, value) {
			config.set(key, value)
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

const storage = new Map()
const sandboxMath = Object.create(Math)
let randomValues = []
sandboxMath.random = function () {
	return randomValues.length ? randomValues.shift() : .5
}

const sandbox = {
	console,
	Cube: FakeCube,
	Game: FakeGame,
	Math: sandboxMath,
	performance: { now: () => 1000 },
	localStorage: {
		getItem(key) {
			return storage.has(key) ? storage.get(key) : null
		},
		setItem(key, value) {
			storage.set(key, String(value))
		}
	},
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
	addEventListener(name, handler) {
		if (!listeners[name]) listeners[name] = []
		listeners[name].push(handler)
	}
}
sandbox.window = sandbox

vm.createContext(sandbox)
vm.runInContext(dynamicCameraSource, sandbox, { filename: dynamicCameraPath })
assert.strictEqual(handlers.afterVanillaScripts.length, 1)
handlers.afterVanillaScripts[0]()

const game = new sandbox.Game()
const cube = new sandbox.Cube(game)
game.stuff = [cube]

cube.drawResources()
assert.strictEqual(cube.originalDraws, 1, 'the exact vanilla camera must keep the original sprite renderer')
assert.strictEqual(game.ctx.fills.length, 0, 'the vanilla camera must not draw procedural voxel faces')

game.__cattailTweaksCameraAngleState = { pitch: .5, yaw: Math.PI / 4 }
cube.drawResources()
assert.strictEqual(cube.originalDraws, 1, 'a rotated camera should use the projection-aware renderer')
assert(game.ctx.fills.length > 100, 'the projection-aware renderer should draw the visible voxel faces')

const projection = sandbox.__cattailDynamicCameraCubeProjectionV1
assert(projection && projection.version === 1, 'the cache bridge should be available')
const positiveYawSlots = projection.getVisibleSlots(cube)
assert.strictEqual(positiveYawSlots.length, 37, 'a projected cube should retain 37 visible surface voxels')
assert.strictEqual(new Set(positiveYawSlots).size, 37, 'visible voxel slots must be unique')

const bounds = projection.getBounds(cube)
assert(bounds.maxX > bounds.minX && bounds.maxY > bounds.minY, 'projected bounds should be finite and non-empty')
assert.strictEqual(bounds.cacheMode, 'shared-atlas', 'projected Cube resources should opt into the shared atlas')
assert(bounds.maxX - bounds.minX < game.unit * 2.2, 'rotated voxel layers should remain a compact cube horizontally')
assert(bounds.maxY - bounds.minY < game.unit * 2.5, 'rotated voxel layers should remain a compact cube vertically')

for (const pitch of [.18, .5, 1.15]) {
	for (let step = -8; step <= 8; step++) {
		game.__cattailTweaksCameraAngleState = { pitch, yaw: step * Math.PI / 8 }
		const slots = projection.getVisibleSlots(cube)
		const cameraBounds = projection.getBounds(cube)
		assert.strictEqual(slots.length, 37, 'every supported camera angle should expose 37 surface voxels')
		assert.strictEqual(new Set(slots).size, 37, 'camera rotation must not duplicate visible voxel slots')
		if (pitch === .5 && step === 0) {
			assert.strictEqual(cameraBounds, null, 'the exact vanilla camera should leave projected bounds disabled')
			continue
		}
		assert(cameraBounds.maxX > cameraBounds.minX && cameraBounds.maxY > cameraBounds.minY)
		assert(cameraBounds.maxX - cameraBounds.minX < game.unit * 4, 'projected width should remain bounded')
		assert(cameraBounds.maxY - cameraBounds.minY < game.unit * 4, 'projected height should remain bounded')
	}
}

game.__cattailTweaksCameraAngleState = { pitch: .5, yaw: -Math.PI / 4 }
const negativeYawSlots = projection.getVisibleSlots(cube)
assert.notDeepStrictEqual(negativeYawSlots, positiveYawSlots, 'the visible cube sides should follow camera rotation')

vm.runInContext(cubeCacheSource, sandbox, { filename: cubeCachePath })
assert.strictEqual(handlers.afterVanillaScripts.length, 2)
handlers.afterVanillaScripts[1]()
const cache = sandbox.CattailTweaksCubeResourceCache
assert(cache, 'cube cache debug API should be installed')
cache.resetStats()

game.ctx.drawImages.length = 0
cube.drawResources()
let stats = cache.stats()
assert.strictEqual(stats.misses, 1, 'the first projected draw should build one cache')
assert.strictEqual(stats.fallbacks, 0, 'projected geometry should not fall back to the sprite path')
assert.strictEqual(game.ctx.drawImages.length, 1)
assert.strictEqual(game.ctx.drawImages[0].args.length, 9, 'projected caches should draw an atlas sub-rectangle')
assert.strictEqual(stats.activeDynamicAtlasPages, 1, 'the first projected cache should allocate one shared atlas page')
assert.strictEqual(stats.activeDynamicAtlasEntries, 1)
assert.strictEqual(stats.dynamicAtlasBuilds, 1)
assert.strictEqual(stats.privateCanvasBuilds, 0)

const secondCube = new sandbox.Cube(game)
secondCube.position = [12, 20]
for (let index = 0; index < 64; index++) {
	secondCube.resourceCoordinates[index][0] += 2
}
game.stuff.push(secondCube)
secondCube.drawResources()
stats = cache.stats()
assert.strictEqual(stats.misses, 2, 'a second projected Cube should build a second atlas entry')
assert.strictEqual(stats.activeDynamicAtlasPages, 1, 'same-projection Cube entries should share one atlas page')
assert.strictEqual(stats.activeDynamicAtlasEntries, 2)
assert.strictEqual(game.ctx.drawImages[0].canvas, game.ctx.drawImages.at(-1).canvas, 'projected Cubes should draw from the same source canvas')
assert.strictEqual(createdCanvases.length, 1, 'two projected Cube caches should allocate only one canvas')

cube.drawResources()
stats = cache.stats()
assert.strictEqual(stats.hits, 1, 'the second projected draw should reuse the cache')
assert.strictEqual(stats.fallbacks, 0)

const canvasCountBeforeReuse = createdCanvases.length
secondCube.swapRandomResource()
assert.strictEqual(cache.stats().activeDynamicAtlasEntries, 1, 'invalidating a Cube should release its atlas entry')
secondCube.drawResources()
stats = cache.stats()
assert.strictEqual(stats.activeDynamicAtlasEntries, 2, 'an invalidated Cube should reclaim a shared atlas entry')
assert.strictEqual(createdCanvases.length, canvasCountBeforeReuse, 'rebuilding a same-size Cube should reuse the atlas page')

game.__cattailTweaksCameraAngleState.yaw = Math.PI / 3
cube.drawResources()
stats = cache.stats()
assert.strictEqual(stats.misses, 4, 'camera rotation should rebuild projection-dependent cube geometry')
assert.strictEqual(stats.activeDynamicAtlasPages, 1, 'camera rotation should replace the old atlas instead of retaining stale pages')
assert.strictEqual(stats.activeDynamicAtlasEntries, 1)

cache.clear()
cache.resetStats()
cube.broken = .5
randomValues = [.5, .5, .5]
game.ctx.drawImages.length = 0
cube.drawResources()
const centeredJitter = game.ctx.drawImages.at(-1)
assert(centeredJitter)

randomValues = [.5, .5, 1]
cube.drawResources()
const verticalJitter = game.ctx.drawImages.at(-1)
assert(Math.abs(verticalJitter.x - centeredJitter.x) < 1e-9, 'damaged-cache height jitter must not drift sideways')
assert(verticalJitter.y < centeredJitter.y, 'positive damaged-cache height jitter should move upward on screen')
assert.strictEqual(cache.stats().hits, 1, 'damaged projected cubes should retain the cache fast path')

cache.clear()
game.unit = 45.677519967556
game.zoom = .24167999982833863
game.pixelRatio = 1.5
game.__cattailTweaksCameraAngleState = { pitch: .87, yaw: -2.321287905152458 }
const denseCubes = Array.from({ length: 71 }, () => new sandbox.Cube(game))
game.stuff = denseCubes
const denseCanvasStart = createdCanvases.length
const denseDrawStart = game.ctx.drawImages.length
for (const denseCube of denseCubes) denseCube.drawResources()
stats = cache.stats()
const denseSources = new Set(game.ctx.drawImages.slice(denseDrawStart).map(draw => draw.canvas))
assert.strictEqual(stats.activeDynamicAtlasEntries, 71, 'the reported problem view should admit all 71 visible Cube entries')
assert.strictEqual(stats.activeDynamicAtlasPages, 1, 'the reported problem view should fit 71 Cube entries on one atlas page')
assert.strictEqual(stats.dynamicAtlasBuilds, 71)
assert.strictEqual(stats.privateCanvasBuilds, 0)
assert.strictEqual(createdCanvases.length - denseCanvasStart, 1, 'the 71-Cube problem view should create one shared source canvas')
assert.strictEqual(denseSources.size, 1, 'the 71-Cube problem view should draw from one shared source canvas')

cache.clear()
cache.resetStats()
config.set('enableCameraAngle', false)
game.unit = 27.4428
game.zoom = .1452
game.pixelRatio = 1
game.__cattailTweaksCameraAngleState = { pitch: .5, yaw: 0 }
const vanillaCube = new sandbox.Cube(game)
const secondVanillaCube = new sandbox.Cube(game)
secondVanillaCube.position = [12, 20]
for (let index = 0; index < 64; index++) secondVanillaCube.resourceCoordinates[index][0] += 2
game.stuff = [vanillaCube, secondVanillaCube]
const vanillaCanvasStart = createdCanvases.length
const vanillaDrawStart = game.ctx.drawImages.length

vanillaCube.drawResources()
secondVanillaCube.drawResources()
stats = cache.stats()
const vanillaDraws = game.ctx.drawImages.slice(vanillaDrawStart)
assert.strictEqual(stats.activeDynamicAtlasPages, 1, 'vanilla Cube caches should allocate a shared atlas page')
assert.strictEqual(stats.activeDynamicAtlasEntries, 2, 'two vanilla Cubes should retain two atlas entries')
assert.strictEqual(stats.activeSharedAtlasPages, 1, 'the generic shared-atlas aliases should report vanilla pages')
assert.strictEqual(stats.activeSharedAtlasEntries, 2, 'the generic shared-atlas aliases should report vanilla entries')
assert.strictEqual(stats.sharedAtlasBuilds, 2)
assert.strictEqual(stats.dynamicAtlasBuilds, 2)
assert.strictEqual(stats.privateCanvasBuilds, 0, 'vanilla Cube caches should avoid private source canvases')
assert.strictEqual(stats.lastCacheKind, 'shared-atlas')
assert.strictEqual(createdCanvases.length - vanillaCanvasStart, 1, 'two vanilla Cube caches should allocate one shared source canvas')
assert.strictEqual(vanillaDraws.length, 2)
assert(vanillaDraws.every(draw => draw.args.length === 9), 'vanilla atlas draws should use source sub-rectangles')
assert.strictEqual(vanillaDraws[0].canvas, vanillaDraws[1].canvas, 'vanilla Cube caches should share one source canvas')

const vanillaOriginalDraws = vanillaCube.originalDraws
vanillaCube.drawResources()
stats = cache.stats()
assert.strictEqual(vanillaCube.originalDraws, vanillaOriginalDraws, 'a vanilla cache hit should not redraw resources')
assert.strictEqual(stats.hits, 1)
assert.strictEqual(stats.dynamicAtlasDraws, 3)
assert.strictEqual(stats.sharedAtlasDraws, 3)

cache.resetStats()
config.set('enableCameraAngle', true)
game.__cattailTweaksCameraAngleState = { pitch: .5, yaw: Math.PI / 4 }
vanillaCube.drawResources()
stats = cache.stats()
assert.strictEqual(stats.clears, 1, 'switching from vanilla to dynamic projection should replace stale atlas pages')
assert.strictEqual(stats.activeSharedAtlasPages, 1)
assert.strictEqual(stats.activeSharedAtlasEntries, 1)
assert.strictEqual(stats.privateCanvasBuilds, 0)

config.set('enableCameraAngle', false)
game.__cattailTweaksCameraAngleState = { pitch: .5, yaw: 0 }
vanillaCube.drawResources()
stats = cache.stats()
assert.strictEqual(stats.clears, 2, 'switching back to vanilla projection should replace stale atlas pages')
assert.strictEqual(stats.activeSharedAtlasPages, 1)
assert.strictEqual(stats.activeSharedAtlasEntries, 1)
assert.strictEqual(stats.privateCanvasBuilds, 0)

cache.clear()
cache.resetStats()
const denseVanillaCubes = Array.from({ length: 254 }, () => new sandbox.Cube(game))
game.stuff = denseVanillaCubes
const denseVanillaCanvasStart = createdCanvases.length
const denseVanillaDrawStart = game.ctx.drawImages.length
for (const denseVanillaCube of denseVanillaCubes) denseVanillaCube.drawResources()
stats = cache.stats()
const denseVanillaSources = new Set(game.ctx.drawImages.slice(denseVanillaDrawStart).map(draw => draw.canvas))
assert.strictEqual(stats.activeSharedAtlasEntries, 254, 'the reported vanilla view should admit all 254 painted Cube entries')
assert(stats.activeSharedAtlasPages > 0 && stats.activeSharedAtlasPages <= 8, '254 vanilla Cube entries should remain within the bounded atlas')
assert.strictEqual(stats.dynamicAtlasBuilds, 254)
assert.strictEqual(stats.privateCanvasBuilds, 0, 'the reported vanilla view should not need private source canvases')
assert.strictEqual(stats.dynamicAtlasFallbacks, 0)
assert.strictEqual(createdCanvases.length - denseVanillaCanvasStart, stats.activeSharedAtlasPages)
assert.strictEqual(denseVanillaSources.size, stats.activeSharedAtlasPages, 'vanilla draws should use only the bounded atlas pages')

cache.clear()
cache.resetStats()
game.unit = 180
const oversizedPageCubes = Array.from({ length: 9 }, () => new sandbox.Cube(game))
game.stuff = oversizedPageCubes
for (const oversizedPageCube of oversizedPageCubes) oversizedPageCube.drawResources()
stats = cache.stats()
assert.strictEqual(stats.activeSharedAtlasPages, 8, 'shared Cube caches should retain the eight-page limit')
assert.strictEqual(stats.activeSharedAtlasEntries, 8)
assert.strictEqual(stats.dynamicAtlasFallbacks, 1, 'the ninth page-sized entry should fall back without discarding the atlas')
assert.strictEqual(stats.privateCanvasBuilds, 1, 'only the overflow entry should use a private canvas')

console.log('dynamic-camera and vanilla cube atlas checks passed')
