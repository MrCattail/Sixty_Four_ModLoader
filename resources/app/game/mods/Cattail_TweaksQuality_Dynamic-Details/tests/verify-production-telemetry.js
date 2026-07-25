'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const CORE_PATH = path.join(MOD_ROOT, 'scripts', 'core.js')
const ENTRY_PATH = path.join(MOD_ROOT, 'scripts', 'production-telemetry.js')
const MOD_PATH = path.join(MOD_ROOT, 'mod.json')
const TELEMETRY_KEY = Symbol.for('cattail.dynamic-details.production-telemetry')

function createHarness() {
	let now = 0
	let listenerCount = 0
	const hooks = Object.create(null)

	class Converter32 {
		constructor(master) {
			this.master = master
			this.name = 'converter32'
			this.position = [0, 0]
			this.state = 2
			this.baseConversionSpeed = 0.001
			this.preheaters = []
			this.fuel = [1]
			this.outputOnce = [2]
		}

		getConversionOutput() {
			return this.outputOnce.slice()
		}

		harvest(resources = this.outputOnce) {
			return this.master.createResourceTransfer(resources, [999, 999], null, null, null, false)
		}
	}

	class Game {
		constructor() {
			this.resources = new Array(10).fill(100000)
			this.codex = {
				resources: Array.from({ length: 10 }, (_, index) => ({
					probabilities: index === 0
						? [{ point: 0, spread: 1, value: 1, span: 1 }]
						: []
				}))
			}
			this.stuff = []
			this.stuffMap = Object.create(null)
			this.hoveredCell = null
		}

		addEntity(name, position) {
			const entity = name === 'converter32'
				? new Converter32(this)
				: {
					master: this,
					name,
					state: 2,
					position: position.slice()
				}
			entity.position = position.slice()
			this.stuff.push(entity)
			this.stuffMap[cellKey(position)] = entity
			return entity
		}

		entityAtCoordinates(position) {
			return this.stuffMap[cellKey(position)]
		}

		createResourceTransfer() {
			return true
		}

		createLightning() {
			return true
		}

		createChasmTransfer() {
			return true
		}

		requestResources(resources) {
			for (let i = 0; i < this.resources.length; i++) {
				this.resources[i] -= Number(resources?.[i]) || 0
			}
			return true
		}

		askForResources(resources) {
			return this.requestResources(resources)
		}

		uvToXYUntranslated(position) {
			return position
		}
	}

	function cellKey(position) {
		return 'u' + position[0] + 'v' + position[1]
	}

	const api = {
		on(name, callback) {
			if (!hooks[name]) hooks[name] = []
			hooks[name].push(callback)
		},
		patch(target, methodName, wrapper) {
			const original = target?.[methodName]
			assert.equal(typeof original, 'function', 'missing patch target ' + methodName)
			const replacement = wrapper(original)
			target[methodName] = replacement
			return function restore() {
				if (target[methodName] === replacement) target[methodName] = original
			}
		},
		config: {
			get(key, fallback) {
				return fallback
			},
			set() {}
		}
	}

	const sandbox = {
		console,
		Game,
		Converter32,
		ModLoader: {
			register(definition) {
				definition.init(api)
			}
		},
		performance: {
			now() {
				return now
			}
		},
		addEventListener() {
			listenerCount++
		},
		removeEventListener() {},
		setTimeout,
		clearTimeout
	}
	sandbox.window = sandbox
	vm.createContext(sandbox)
	vm.runInContext(fs.readFileSync(CORE_PATH, 'utf8'), sandbox, { filename: CORE_PATH })
	vm.runInContext(fs.readFileSync(ENTRY_PATH, 'utf8'), sandbox, { filename: ENTRY_PATH })
	for (const callback of hooks.afterVanillaScripts || []) callback()
	const getGlobalTelemetry = function () {
		return vm.runInContext("globalThis[Symbol.for('cattail.dynamic-details.production-telemetry')]", sandbox)
	}

	return {
		sandbox,
		Game,
		Converter32,
		api: getGlobalTelemetry(),
		getGlobalTelemetry,
		setNow(value) {
			now = value
		},
		get listenerCount() {
			return listenerCount
		}
	}
}

function testManifestAndPublicContract() {
	const manifest = JSON.parse(fs.readFileSync(MOD_PATH, 'utf8'))
	assert.equal(manifest.version, '0.1.1')
	assert.equal(manifest.entries[0], 'scripts/core.js')
	assert.equal(manifest.entries[1], 'scripts/production-telemetry.js')

	const harness = createHarness()
	const telemetry = harness.api
	assert.ok(telemetry)
	assert.equal(Object.isFrozen(telemetry), true)
	assert.equal(telemetry.apiVersion, 1)
	assert.equal(telemetry.snapshotSchemaVersion, 1)
	assert.equal(telemetry.canonicalUnit, 'perSecond')
	assert.equal(telemetry.sampleWindowMs, 30000)
	assert.equal(telemetry.capabilities.aggregate, true)
	assert.equal(telemetry.capabilities.dataQuality, true)
	assert.equal(harness.listenerCount, 0)

	const status = telemetry.status()
	assert.equal(status.ready, true)
	assert.equal(status.disposed, false)
	assert.equal(status.quality, 'collecting')
	assert.equal(Object.isFrozen(status), true)
}

function testActualTheoreticalSamplingAndImmutability() {
	const harness = createHarness()
	const game = new harness.Game()
	harness.setNow(5000)
	const converter = game.addEntity('converter32', [4, 7])
	converter.fuel = [1]
	converter.outputOnce = [2]
	converter.baseConversionSpeed = 0.001

	harness.setNow(15000)
	converter.harvest([20])
	converter.harvest([5])
	game.requestResources([5], converter.position, null, false)

	const snapshot = harness.api.snapshotEntities([converter, converter, null])
	assert.equal(snapshot.ready, true)
	assert.equal(snapshot.schemaVersion, 1)
	assert.equal(snapshot.quality, 'collecting')
	assert.equal(snapshot.metrics.theoretical, true)
	assert.equal(snapshot.metrics.actual, true)
	assert.equal(snapshot.metrics.supplemental, true)
	assert.equal(snapshot.sampleDuration.minMs, 10000)
	assert.equal(snapshot.sampleDuration.maxMs, 10000)
	assert.equal(snapshot.sampleDuration.collectingEntities, 1)
	assert.equal(snapshot.entities.requested, 3)
	assert.equal(snapshot.entities.included, 1)
	assert.equal(snapshot.entities.duplicates, 1)
	assert.equal(snapshot.entities.invalid, 1)
	assert.equal(snapshot.entities.stale, 0)
	assert.equal(snapshot.entities.unsupported.theoretical, 0)
	assert.equal(snapshot.entities.unsupported.actualOutput, 0)
	assert.equal(snapshot.entities.unsupported.actualConsume, 0)
	assert.equal(snapshot.events.scanned, 2)
	assert.equal(snapshot.events.matched, 2)

	assert.equal(snapshot.totals.theoretical.output[0], 2)
	assert.equal(snapshot.totals.theoretical.consume[0], 1)
	assert.equal(snapshot.totals.theoretical.net[0], 1)
	assert.equal(snapshot.totals.actual.output[0], 2.5)
	assert.equal(snapshot.totals.actual.consume[0], 0.5)
	assert.equal(snapshot.totals.actual.net[0], 2)
	assert.equal(snapshot.byType.length, 1)
	assert.equal(snapshot.byType[0].name, 'converter32')
	assert.equal(snapshot.byType[0].support.theoretical.supported, true)
	assert.equal(snapshot.byType[0].support.actualOutput.supported, true)
	assert.equal(Object.isFrozen(snapshot), true)
	assert.equal(Object.isFrozen(snapshot.totals.actual.output), true)
	assert.throws(() => {
		snapshot.totals.actual.output[0] = 999
	}, TypeError)

	harness.setNow(35000)
	const complete = harness.api.snapshotEntity(converter)
	assert.equal(complete.quality, 'complete')
	assert.equal(complete.sampleDuration.minMs, 30000)
	assert.equal(complete.totals.actual.output[0], 25 / 30)

	const actualOnly = harness.api.snapshotEntity(converter, { theoretical: false, supplemental: false })
	assert.equal(actualOnly.metrics.theoretical, false)
	assert.equal(actualOnly.metrics.supplemental, false)
	assert.equal(actualOnly.entities.unsupported.theoretical, 0)
	assert.equal(actualOnly.totals.theoretical.output[0], 0)
	assert.deepEqual(Array.from(actualOnly.byType[0].support.theoretical.reasons), ['not-requested'])

	harness.setNow(46001)
	const expired = harness.api.snapshotEntity(converter, { theoretical: false, supplemental: false })
	assert.equal(expired.events.scanned, 0)
	assert.equal(expired.events.matched, 0)
	assert.equal(expired.totals.actual.output[0], 0)
	assert.equal(expired.totals.actual.consume[0], 0)

	const fresh = game.addEntity('consumer', [8, 8])
	const mixed = harness.api.snapshotEntities([converter, fresh])
	assert.equal(mixed.quality, 'collecting')
	assert.equal(mixed.sampleDuration.minMs, 0)
	assert.equal(mixed.sampleDuration.maxMs, 30000)
	assert.equal(mixed.entities.unsupported.theoretical, 1)

	game.stuff = game.stuff.filter((entity) => entity !== fresh)
	delete game.stuffMap[cellKey(fresh.position)]
	const stale = harness.api.snapshotEntity(fresh)
	assert.equal(stale.entities.included, 0)
	assert.equal(stale.entities.stale, 1)

	assert.equal(harness.api.dispose('test-complete'), true)
	assert.equal(harness.api.dispose('again'), false)
	assert.equal(harness.getGlobalTelemetry(), undefined)
	assert.equal(harness.api.status().disposed, true)
	assert.equal(harness.api.snapshotEntity(converter).ready, false)
}

function testPumpTheoryAndSupplementalChannel() {
	const harness = createHarness()
	const game = new harness.Game()
	const pump = game.addEntity('pump', [0, 0])
	pump.basePumpSpeed = 0.002
	pump.pumpSpeed = 0.002
	pump.active = true
	pump.spoolup = 1
	pump.soi = [[1, 0]]
	pump.soe = []
	pump.auxes = []
	pump.getProbability = function (point, spread, value) {
		return value
	}

	harness.setNow(30000)
	const snapshot = harness.api.snapshotEntity(pump)
	assert.equal(snapshot.totals.theoretical.output[0], 2)
	assert.equal(snapshot.byType[0].supplemental.length, 1)
	assert.equal(snapshot.byType[0].supplemental[0].id, 'pumpMining')
	assert.equal(snapshot.byType[0].supplemental[0].basis, 'instantaneous')
	assert.equal(snapshot.byType[0].supplemental[0].resources[0], 2)
	assert.equal(snapshot.totals.actual.output[0], 0)
}

function testOverflowQualityAndLinearBenchmark() {
	const harness = createHarness()
	const game = new harness.Game()
	const entities = []
	for (let index = 0; index < 256; index++) {
		const entity = game.addEntity('converter32', [index, index + 1])
		entity.fuel = [1]
		entity.outputOnce = [2]
		entities.push(entity)
	}

	const allResources = new Array(10).fill(1)
	for (let bucket = 0; bucket < 5; bucket++) {
		harness.setNow(bucket * 250)
		for (const entity of entities) entity.harvest(allResources)
	}
	harness.setNow(1000)

	const overflow = harness.api.snapshotEntities(entities)
	assert.equal(overflow.quality, 'truncated')
	assert.equal(overflow.events.truncated, true)
	assert.ok(overflow.events.dropped > 0)
	assert.ok(overflow.events.scanned <= 12000)
	assert.equal(overflow.totals.actual.output.reduce((sum, value) => sum + value, 0), 12000)
	assert.equal(overflow.entities.included, 256)
	assert.equal(overflow.byType[0].count, 256)

	reportBenchmark(harness.api, entities.slice(0, 32), overflow.events.scanned, undefined, 'full')
	reportBenchmark(harness.api, entities, overflow.events.scanned, undefined, 'full')
	reportBenchmark(harness.api, entities, overflow.events.scanned, { theoretical: false, supplemental: true }, 'actual')
}

function reportBenchmark(api, entities, eventCount, options, mode) {
	const timings = []
	for (let iteration = 0; iteration < 20; iteration++) {
		const start = process.hrtime.bigint()
		api.snapshotEntities(entities, options)
		timings.push(Number(process.hrtime.bigint() - start) / 1e6)
	}
	const average = timings.reduce((sum, value) => sum + value, 0) / timings.length
	const maximum = Math.max(...timings)
	console.log('Production telemetry benchmark: mode=' + mode + ' entities=' + entities.length + ' events=' + eventCount + ' averageMs=' + average.toFixed(3) + ' maxMs=' + maximum.toFixed(3))
}

function testSourceBoundaries() {
	const source = fs.readFileSync(CORE_PATH, 'utf8')
	const start = source.indexOf('function getProductionTelemetryStatus(')
	const end = source.indexOf('function getResourceSourceSummary(', start)
	assert.ok(start >= 0 && end > start)
	const contract = source.slice(start, end)
	assert.match(contract, /const selectedAmounts = new Map\(\)/)
	assert.match(contract, /state\?\.productionTotals\?\.get\(record\.instanceKey\)/)
	assert.match(contract, /for \(const record of collected\.records\)/)
	assert.doesNotMatch(contract, /for \(const event of sourceEvents\)/)
	assert.doesNotMatch(contract, /setInterval|requestAnimationFrame/)
	assert.doesNotMatch(contract, /\b(?:addEntity|clearCell|deleteEntity|removeEntity|placeEntity)\s*\(/)
	assert.doesNotMatch(contract, /innerHTML|createElement|appendChild/)
}

function cellKey(position) {
	return 'u' + position[0] + 'v' + position[1]
}

testManifestAndPublicContract()
testActualTheoreticalSamplingAndImmutability()
testPumpTheoryAndSupplementalChannel()
testOverflowQualityAndLinearBenchmark()
testSourceBoundaries()
console.log('Dynamic Details production telemetry verification passed.')
