const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const STATE_PATH = path.join(MOD_ROOT, 'scripts/core/paint-cube-state.js')
const FILL_PATH = path.join(MOD_ROOT, 'scripts/core/paint-cube-fill.js')
const STROKE_PATH = path.join(MOD_ROOT, 'scripts/core/paint-cube-stroke.js')
const UI_PATH = path.join(MOD_ROOT, 'scripts/ui/paint-cube-ui.js')
const INPUT_PATH = path.join(MOD_ROOT, 'scripts/input/paint-cube-input.js')
const SHELL_PATH = path.join(MOD_ROOT, 'scripts/ui/editor-shell.js')
const CURSOR_PATH = path.join(MOD_ROOT, 'scripts/render/paint-cube-cursor.js')
const I18N_PATH = path.join(MOD_ROOT, 'scripts/i18n/editor-text.js')
const MANIFEST_PATH = path.join(MOD_ROOT, 'mod.json')
const ICON_PATH = path.join(MOD_ROOT, 'assets/icons/paint-bucket.svg')

const stateSource = fs.readFileSync(STATE_PATH, 'utf8')
const fillSource = fs.readFileSync(FILL_PATH, 'utf8')
const strokeSource = fs.readFileSync(STROKE_PATH, 'utf8')
const uiSource = fs.readFileSync(UI_PATH, 'utf8')
const inputSource = fs.readFileSync(INPUT_PATH, 'utf8')
const shellSource = fs.readFileSync(SHELL_PATH, 'utf8')
const cursorSource = fs.readFileSync(CURSOR_PATH, 'utf8')
const i18nSource = fs.readFileSync(I18N_PATH, 'utf8')
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))

const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
const PAINT_KEY = Symbol.for('cattail.world-editor.paint-cube-state')
const STROKE_KEY = Symbol.for('cattail.world-editor.paint-cube-stroke')
const FILL_KEY = Symbol.for('cattail.world-editor.paint-cube-fill')

function plain(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function cellKey(cell) {
	return cell[0] + ':' + cell[1]
}

function range(start, end) {
	return {
		start: start.slice(),
		end: end.slice(),
		minU: Math.min(start[0], end[0]),
		maxU: Math.max(start[0], end[0]),
		minV: Math.min(start[1], end[1]),
		maxV: Math.max(start[1], end[1])
	}
}

function ordinarySave(cell, name = 'pump') {
	return { name, position: cell.slice(), par: { state: 1, fill: 0, broken: 0, resources: [] } }
}

function createEnvironment(options = {}) {
	const definitions = []
	const events = new Map()
	const cleanups = []
	const grid = new Map()
	const game = { plane: 0 }
	const selectionState = {
		revision: 1,
		selections: (options.selections || []).map(function (entry, index) {
			return { id: index + 1, plane: entry.plane ? 1 : 0, range: plain(entry.range), primary: index === 0 }
		})
	}
	let yields = 0
	const sandbox = {
		console: { info() {}, warn() {} },
		ModLoader: { register(definition) { definitions.push(definition) } },
		setTimeout(callback) {
			yields += 1
			callback()
			return yields
		},
		clearTimeout() {}
	}
	vm.createContext(sandbox)
	vm.runInContext(stateSource, sandbox, { filename: STATE_PATH })
	vm.runInContext(fillSource, sandbox, { filename: FILL_PATH })

	const runtime = { game, addCleanup(cleanup) { cleanups.push(cleanup) } }
	const selection = {
		game,
		snapshot() {
			return {
				version: '0.2.6',
				selections: plain(selectionState.selections),
				selectionCount: selectionState.selections.length,
				previewRange: null,
				revision: selectionState.revision
			}
		}
	}
	sandbox[RUNTIME_KEY] = runtime
	sandbox[SELECTION_KEY] = selection

	const api = {
		on(name, listener) {
			if (!events.has(name)) events.set(name, [])
			events.get(name).push(listener)
		}
	}
	for (const definition of definitions) definition.init(api)

	const paintState = sandbox[PAINT_KEY]
	const stroke = {
		game,
		inspectCell(cell) {
			const key = cellKey(cell)
			const hasEntry = grid.has(key)
			const before = hasEntry
				? grid.get(key)
				: options.defaultCell === 'empty' ? null : ordinarySave(cell)
			const painted = !!before && paintState.isPainted(before)
			return {
				cell: cell.slice(),
				action: 'paint',
				known: true,
				eligible: !before || painted,
				occupied: !!before,
				painted,
				operation: !before ? 'paint' : painted ? 'replace' : null,
				before: plain(before)
			}
		}
	}
	sandbox[STROKE_KEY] = stroke
	for (const listener of events.get('afterGameInit') || []) listener({}, game)
	const fill = sandbox[FILL_KEY]
	assert.ok(fill, 'paint bucket planner service must mount')

	return {
		fill,
		paintState,
		selectionState,
		set(cell, save) { grid.set(cellKey(cell), plain(save)) },
		stable(cell, recipe) { grid.set(cellKey(cell), plain(paintState.buildStableCubeSave(cell, recipe))) },
		grow(cell, recipe, durationMs, lineage) {
			grid.set(cellKey(cell), plain(paintState.buildGrowCubeSave(cell, recipe, durationMs, lineage)))
		},
		get yields() { return yields },
		cleanup() { while (cleanups.length) cleanups.pop()() }
	}
}

async function expectCode(code, action) {
	await assert.rejects(action, error => error?.code === code)
}

async function testSelectionMaskIsProfessionalBoundary() {
	const env = createEnvironment({
		defaultCell: 'empty',
		selections: [
			{ plane: 0, range: range([0, 0], [1, 1]) },
			{ plane: 0, range: range([10, 10], [10, 10]) }
		]
	})
	const result = await env.fill.plan({
		cell: [0, 0],
		cubeMode: 'stable',
		recipe: env.paintState.defaultRecipe()
	})
	assert.equal(result.masked, true)
	assert.equal(result.componentCount, 4)
	assert.equal(result.targetCount, 4)
	assert.deepEqual(plain(result.componentCells).sort(), [[0, 0], [0, 1], [1, 0], [1, 1]].sort())
	assert.equal(result.componentCells.some(cell => cell[0] === 10), false, 'disconnected selection islands cannot jump')
	assert.equal(result.guard.selectionRevision, 1)
	env.cleanup()
}

async function testGlobalEnclosureAndOpenLimit() {
	const enclosed = createEnvironment()
	for (const cell of [[5, 5], [6, 5], [6, 6]]) enclosed.set(cell, null)
	const result = await enclosed.fill.plan({
		cell: [5, 5],
		cubeMode: 'stable',
		recipe: enclosed.paintState.defaultRecipe()
	})
	assert.equal(result.masked, false)
	assert.equal(result.componentCount, 3)
	assert.equal(result.targetCount, 3)
	assert.ok(enclosed.yields > 0, 'planning yields instead of monopolizing the renderer')
	enclosed.cleanup()

	const open = createEnvironment({ defaultCell: 'empty' })
	await expectCode('OPEN_OR_TOO_LARGE', () => open.fill.plan({
		cell: [100, 100],
		cubeMode: 'stable',
		recipe: open.paintState.defaultRecipe()
	}))
	open.cleanup()
}

async function testPaintedSourceMatchingAndTargetNoOps() {
	const env = createEnvironment()
	const recipe = env.paintState.normalizeRecipe({ weights: [
		{ resource: 1, weight: 70 },
		{ resource: 4, weight: 30 }
	] })
	const otherRecipe = env.paintState.normalizeRecipe({ weights: [{ resource: 7, weight: 100 }] })
	env.grow([0, 0], recipe, 2000, 'grow-fill-a')
	env.grow([1, 0], recipe, 5000, 'grow-fill-b')
	env.stable([2, 0], recipe)
	env.grow([0, 1], otherRecipe, 2000, 'grow-fill-c')
	const repaint = await env.fill.plan({ cell: [0, 0], cubeMode: 'stable', recipe })
	assert.equal(repaint.componentCount, 2, 'Grow source matching ignores duration/progress but not type/recipe')
	assert.equal(repaint.targetCount, 2)

	const stable = createEnvironment()
	stable.stable([4, 4], recipe)
	await expectCode('NOTHING_TO_CHANGE', () => stable.fill.plan({ cell: [4, 4], cubeMode: 'stable', recipe }))
	stable.cleanup()

	const grow = createEnvironment()
	grow.grow([8, 8], recipe, 4000, 'grow-fill-d')
	grow.grow([9, 8], recipe, 5000, 'grow-fill-e')
	const durationChange = await grow.fill.plan({ cell: [8, 8], cubeMode: 'grow', growDurationMs: 4000, recipe })
	assert.equal(durationChange.componentCount, 2)
	assert.deepEqual(plain(durationChange.targets.map(target => target.cell)), [[9, 8]])
	grow.cleanup()
	env.cleanup()
}

async function testCancellationAndRevalidation() {
	const env = createEnvironment({
		defaultCell: 'empty',
		selections: [{ plane: 0, range: range([0, 0], [31, 31]) }]
	})
	let checks = 0
	await expectCode('CANCELLED', () => env.fill.plan({
		cell: [0, 0],
		cubeMode: 'stable',
		recipe: env.paintState.defaultRecipe(),
		isCancelled() { checks += 1; return checks > 20 }
	}))
	const result = await env.fill.plan({ cell: [0, 0], cubeMode: 'stable', recipe: env.paintState.defaultRecipe() })
	env.selectionState.revision += 1
	await expectCode('EXTERNAL_CHANGE', () => env.fill.validatePlan(result.guard))
	env.cleanup()
}

function testProductSurfaceAndWriteBoundary() {
	const fillIndex = manifest.entry.indexOf('scripts/core/paint-cube-fill.js')
	const strokeIndex = manifest.entry.indexOf('scripts/core/paint-cube-stroke.js')
	const uiIndex = manifest.entry.indexOf('scripts/ui/paint-cube-ui.js')
	assert.ok(fillIndex > strokeIndex && fillIndex < uiIndex)
	assert.match(fillSource, /const MAX_CELLS = 4096/)
	assert.doesNotMatch(fillSource, /\bgame\.(?:addEntity|clearCell)\b/)
	assert.match(strokeSource, /BUCKET_MAX_CELLS\s*=\s*4096/)
	assert.match(strokeSource, /strictTargets/)
	assert.match(uiSource, /\['brush',\s*'bucket',\s*'eraser'\]/)
	assert.match(inputSource, /Symbol\.for\('cattail\.world-editor\.paint-cube-fill'\)/)
	assert.match(inputSource, /currentSubtool === 'bucket'/)
	assert.match(shellSource, /paint-bucket/)
	assert.match(shellSource, /drawGroup\.append\(drawButton,\s*brushButton,\s*bucketButton,\s*eraserButton,\s*stableButton,\s*growButton\)/)
	assert.match(cursorSource, /bucket/i)
	for (const key of ['paintBucket', 'toolbarCardPaintBucket', 'paintBucketPlanning', 'paintBucketCancelled', 'paintBucketSummary', 'paintBucketOpenOrTooLarge']) {
		assert.match(i18nSource, new RegExp(key))
	}
	assert.equal(fs.existsSync(ICON_PATH), true)
	assert.match(fs.readFileSync(ICON_PATH, 'utf8'), /<svg[\s\S]*<path/)

	const definitions = []
	const sandbox = { ModLoader: { register(definition) { definitions.push(definition) } } }
	vm.createContext(sandbox)
	vm.runInContext(i18nSource, sandbox, { filename: I18N_PATH })
	definitions[0].init({})
	const i18n = sandbox[Symbol.for('cattail.world-editor.i18n')]
	assert.equal(i18n.languages.length, 20)
	assert.ok(i18n.keys.includes('paintBucket'))
	assert.ok(i18n.keys.includes('paintBucketPlanning'))
	assert.ok(i18n.keys.includes('paintBucketSummary'))
	assert.ok(i18n.toolbarKeys.includes('toolbarCardPaintBucket'))
	for (const language of manifest.languages) {
		for (const key of ['paintBucket', 'toolbarCardPaintBucket', 'paintBucketPlanning', 'paintBucketCancelled', 'paintBucketSummary', 'paintBucketOpenOrTooLarge']) {
			const value = i18n.t(language, key)
			assert.ok(value && value !== key, language + ' ' + key)
		}
	}
}

async function main() {
	await testSelectionMaskIsProfessionalBoundary()
	await testGlobalEnclosureAndOpenLimit()
	await testPaintedSourceMatchingAndTargetNoOps()
	await testCancellationAndRevalidation()
	testProductSurfaceAndWriteBoundary()
	console.log('World Editor 5C-9 verification passed: professional Bucket fill boundaries, 4096 cap, revalidation, atomic write ownership, and Draw UI contracts.')
}

main().catch(error => {
	console.error(error)
	process.exitCode = 1
})
