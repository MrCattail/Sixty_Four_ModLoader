const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const DIAGNOSTICS_PATH = path.join(MOD_ROOT, 'scripts/render/paint-cube-render-diagnostics.js')
const source = fs.readFileSync(DIAGNOSTICS_PATH, 'utf8')
const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))

function createEnvironment() {
	const definitions = []
	const events = new Map()
	const patches = []
	const performanceEntries = []
	let clock = 1000
	const cacheStats = {
		draws: 10,
		hits: 9,
		activeDynamicAtlasEntries: 71,
		activeSharedAtlasEntries: 71,
		cacheHitRate: 0.9
	}

	function Game() {
		this.renderTime = { dt: 16.7 }
		this.stuff = []
		this.plane = 0
		this.zoom = 0.1452
		this.unit = 27.4428
		this.translation = [123, -456]
		this.__cattailDynamicCameraState = { enabled: true, mode: 'dynamic', scale: 1.5 }
	}
	Game.prototype.renderloop = function () {
		this.renderEntities(this.renderTime.dt)
		this.renderTime.dt += 1
	}
	Game.prototype.renderEntities = function (dt) {
		for (const entity of this.stuff) {
			if (entity.name !== 'conductor' && this.isVisible(entity)) entity.render(dt)
		}
	}
	Game.prototype.isVisible = function (entity) { return !entity.hidden }

	function Cube(master, marker) {
		this.master = master
		this.name = 'cube'
		if (marker) this.worldEditorPaint = marker
	}
	Cube.prototype.render = function () {
		this.drawResources()
	}
	Cube.prototype.drawResources = function () {
		this.master.resourceDraws += 1
		cacheStats.draws += 1
		cacheStats.hits += 1
	}

	function Pump(hidden = false) {
		this.name = 'pump'
		this.hidden = hidden
	}
	Pump.prototype.render = function () {}

	const sandbox = {
		Game,
		Cube,
		Pump,
		console: { info() {}, warn() {} },
		performance: {
			now() { clock += 0.5; return clock },
			mark(name) { performanceEntries.push({ type: 'mark', name }) },
			measure(name, start, end) { performanceEntries.push({ type: 'measure', name, start, end }) },
			clearMarks(name) {
				for (let i = performanceEntries.length - 1; i >= 0; i -= 1) {
					if (performanceEntries[i].type === 'mark' && (!name || performanceEntries[i].name === name)) performanceEntries.splice(i, 1)
				}
			},
			clearMeasures(name) {
				for (let i = performanceEntries.length - 1; i >= 0; i -= 1) {
					if (performanceEntries[i].type === 'measure' && (!name || performanceEntries[i].name === name)) performanceEntries.splice(i, 1)
				}
			}
		},
		ModLoader: { register(definition) { definitions.push(definition) } },
		CattailTweaksCubeResourceCache: {
			stats() { return Object.assign({}, cacheStats) }
		}
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(source, sandbox, { filename: DIAGNOSTICS_PATH })

	const originalGameRenderloop = sandbox.Game.prototype.renderloop
	const originalRenderEntities = sandbox.Game.prototype.renderEntities
	const originalIsVisible = sandbox.Game.prototype.isVisible
	const originalCubeRender = sandbox.Cube.prototype.render
	const originalDrawResources = sandbox.Cube.prototype.drawResources

	definitions[0].init({
		on(name, listener) {
			if (!events.has(name)) events.set(name, [])
			events.get(name).push(listener)
		},
		patch(target, name, wrap) {
			const original = target[name]
			const replacement = wrap(original)
			target[name] = replacement
			const restore = function () {
				if (target[name] === replacement) target[name] = original
			}
			patches.push(restore)
			return restore
		}
	})
	for (const listener of events.get('afterVanillaScripts') || []) listener()

	const game = new sandbox.Game()
	const paintedMarker = { kind: 'world-editor-painted-cube' }
	game.resourceDraws = 0
	game.stuff.push(new sandbox.Cube(game, paintedMarker))
	game.stuff.push(new sandbox.Cube(game, null))
	game.stuff.push(new sandbox.Pump())
	game.stuff.push(new sandbox.Pump(true))
	for (const listener of events.get('afterGameInit') || []) listener({}, game)

	return {
		sandbox,
		game,
		patches,
		performanceEntries,
		originalGameRenderloop,
		originalRenderEntities,
		originalIsVisible,
		originalCubeRender,
		originalDrawResources,
		service: sandbox.CattailWorldEditorPaintCubeRenderDiagnostics
	}
}

function testDiagnosticsAreManifestedAndQuiet() {
	assert.ok(manifest.entry.includes('scripts/render/paint-cube-render-diagnostics.js'))
	assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/, 'diagnostics must not spam the console')
	assert.match(source, /CattailWorldEditorPaintCubeRenderDiagnostics/)
	assert.match(source, /CattailTweaksCubeResourceCache/)
	assert.match(source, /diagnosticsVersion/)
}

function testLowOverheadFrameMode() {
	const env = createEnvironment()
	const service = env.service
	assert.ok(service)
	assert.equal(typeof service.start, 'function')
	assert.equal(typeof service.report, 'function')

	env.game.renderloop()
	assert.equal(service.snapshot().frames, 0, 'inactive diagnostics do not count frames')

	service.start({ mode: 'frame', frames: 3 })
	env.game.renderloop()
	let running = service.snapshot()
	assert.equal(running.active, true)
	assert.equal(running.frames, 1)
	assert.equal(running.mode, 'frame')
	assert.equal(running.detailFrames, 0)
	assert.equal(running.cubeRenderCalls, 0, 'frame mode does not install per-Cube timing')
	assert.equal(running.isVisibleCalls, 0, 'frame mode does not install per-entity visibility timing')

	env.game.renderloop()
	env.game.renderloop()
	const report = service.report()
	assert.equal(report.diagnosticsVersion, 3)
	assert.equal(report.active, false)
	assert.equal(report.stopReason, 'frame-limit')
	assert.equal(report.frames, 3)
	assert.equal(report.detailFrames, 0)
	assert.equal(report.renderEntitiesCalls, 0)
	assert.equal(report.cubeRenderCalls, 0)
	assert.equal(report.drawResourcesCalls, 0)
	assert.equal(report.distributions.frameDt.count, 3)
	assert.equal(report.distributions.renderLoop.count, 3)
	assert.equal(report.distributions.interFrameGap.count, 2)
	assert.equal(report.distributions.outsideLoop.count, 2)
	assert.ok(report.distributions.frameDt.p50 > 0)
	assert.ok(report.distributions.frameDt.p95 >= report.distributions.frameDt.p50)
	assert.ok(report.distributions.frameDt.p99 >= report.distributions.frameDt.p95)
	assert.equal(report.sceneFingerprintStart.paintedCubes, 1)
	assert.equal(report.sceneFingerprintStart.ordinaryCubes, 1)
	assert.equal(report.sceneFingerprintStart.nonCubes, 2)
	assert.equal(report.sceneFingerprintStart.visiblePaintedCubes, 1)
	assert.equal(report.sceneFingerprintEnd.visibleNonCubes, 1)
	assert.deepEqual(Array.from(report.sceneFingerprintEnd.translation), [123, -456])
	assert.equal(report.cacheStatsDelta.draws, 6)
	assert.equal(report.cacheStatsDelta.hits, 6)
	assert.equal(report.cacheStatsStart.activeSharedAtlasEntries, 71)
	assert.equal(report.cacheStatsEnd.activeSharedAtlasEntries, 71)
	assert.match(report.performanceMarks.start, /-start$/)
	assert.match(report.performanceMarks.end, /-end$/)
	assert.match(report.performanceMarks.measure, /-measure$/)
	assert.ok(env.performanceEntries.some(entry => entry.type === 'measure'))
	assert.equal(env.sandbox.Cube.prototype.render, env.originalCubeRender)
	assert.equal(env.sandbox.Game.prototype.isVisible, env.originalIsVisible)

	service.dispose('test')
	assert.equal(env.sandbox.CattailWorldEditorPaintCubeRenderDiagnostics, undefined)
	assert.equal(env.sandbox.Game.prototype.renderloop, env.originalGameRenderloop)
}

function testModeDefaultsAndResetUnpatchesDetailTiming() {
	const env = createEnvironment()
	const service = env.service

	let report = service.start()
	assert.equal(report.mode, 'frame')
	assert.equal(report.frameLimit, 600)
	assert.equal(env.sandbox.Cube.prototype.render, env.originalCubeRender)
	service.reset()

	report = service.start({ mode: 'detail' })
	assert.equal(report.mode, 'detail')
	assert.equal(report.frameLimit, 120)
	assert.notEqual(env.sandbox.Cube.prototype.render, env.originalCubeRender)
	service.reset()
	assert.equal(env.sandbox.Cube.prototype.render, env.originalCubeRender, 'reset removes an unfinished detail patch')
	assert.equal(env.sandbox.Game.prototype.isVisible, env.originalIsVisible)

	service.dispose('test')
}

function testDetailModeInstallsAndRemovesCallTiming() {
	const env = createEnvironment()
	const service = env.service
	service.start({ mode: 'detail', frames: 2 })
	assert.notEqual(env.sandbox.Cube.prototype.render, env.originalCubeRender)
	assert.notEqual(env.sandbox.Game.prototype.isVisible, env.originalIsVisible)

	env.game.renderloop()
	env.game.renderloop()
	const report = service.report()
	assert.equal(report.mode, 'detail')
	assert.equal(report.frames, 2)
	assert.equal(report.detailFrames, 2)
	assert.equal(report.renderEntitiesCalls, 2)
	assert.equal(report.cubeRenderCalls, 4)
	assert.equal(report.paintedCubeRenderCalls, 2)
	assert.equal(report.ordinaryCubeRenderCalls, 2)
	assert.equal(report.drawResourcesCalls, 4)
	assert.equal(report.paintedDrawResourcesCalls, 2)
	assert.equal(report.ordinaryDrawResourcesCalls, 2)
	assert.ok(report.ordinaryCubeRenderMsTotal > 0)
	assert.ok(report.ordinaryDrawResourcesMsTotal > 0)
	assert.equal(report.isVisibleCalls, 8)
	assert.equal(report.isVisibleTrue, 6)
	assert.equal(report.isVisibleFalse, 2)
	assert.equal(report.cubeIsVisibleCalls, 4)
	assert.equal(report.cubeIsVisibleTrue, 4)
	assert.equal(report.paintedCubeIsVisibleCalls, 2)
	assert.equal(report.paintedCubeIsVisibleTrue, 2)
	assert.equal(report.nonCubeIsVisibleCalls, 4)
	assert.equal(report.nonCubeIsVisibleTrue, 2)
	assert.ok(report.isVisibleMsTotal > 0)
	assert.ok(report.renderEntitiesCubeMsTotal > 0)
	assert.ok(report.renderEntitiesIsVisibleMsTotal > 0)
	assert.ok(report.renderEntitiesResidualMsTotal >= 0)
	assert.ok(report.averageOrdinaryCubeRenderMs > 0)
	assert.ok(report.averageOrdinaryDrawResourcesMs > 0)
	assert.ok(report.averageRenderEntitiesResidualMs >= 0)
	assert.equal(report.paintedEntitiesInStuff, 1)
	assert.equal(report.cubeEntitiesInStuff, 2)
	assert.equal(report.totalStuff, 4)
	assert.equal(report.cubeCacheStats.activeDynamicAtlasEntries, 71)
	assert.equal(report.dynamicCamera.enabled, true)
	assert.deepEqual(Array.from(report.dynamicCamera.translation), [123, -456])
	assert.ok(report.renderLoopMsTotal > 0)
	assert.ok(report.renderEntitiesMsTotal > 0)
	assert.ok(report.paintedDrawResourcesMsTotal > 0)
	assert.equal(report.distributions.frameDt.count, 2)
	assert.equal(report.cacheStatsDelta.draws, 4)
	assert.equal(env.sandbox.Cube.prototype.render, env.originalCubeRender, 'detail Cube patch is removed when the run stops')
	assert.equal(env.sandbox.Cube.prototype.drawResources, env.originalDrawResources, 'detail resource patch is removed when the run stops')
	assert.equal(env.sandbox.Game.prototype.renderEntities, env.originalRenderEntities, 'detail entity patch is removed when the run stops')
	assert.equal(env.sandbox.Game.prototype.isVisible, env.originalIsVisible, 'detail visibility patch is removed when the run stops')

	service.dispose('test')
	assert.equal(env.sandbox.CattailWorldEditorPaintCubeRenderDiagnostics, undefined)
}

testDiagnosticsAreManifestedAndQuiet()
testLowOverheadFrameMode()
testModeDefaultsAndResetUnpatchesDetailTiming()
testDetailModeInstallsAndRemovesCallTiming()

console.log('World Editor 5C render diagnostics v3 verification passed: low-overhead frame mode, temporary detail timing, distributions, scene/cache fingerprints, performance marks, and clean unpatching.')
