const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const UI_PATH = path.join(MOD_ROOT, 'scripts/ui/paint-cube-ui.js')
const SHELL_PATH = path.join(MOD_ROOT, 'scripts/ui/editor-shell.js')
const I18N_PATH = path.join(MOD_ROOT, 'scripts/i18n/editor-text.js')
const uiSource = fs.readFileSync(UI_PATH, 'utf8')
const shellSource = fs.readFileSync(SHELL_PATH, 'utf8')
const i18nSource = fs.readFileSync(I18N_PATH, 'utf8')
const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))
const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const PAINT_STATE_KEY = Symbol.for('cattail.world-editor.paint-cube-state')
const GROWTH_KEY = Symbol.for('cattail.world-editor.paint-cube-growth')
const UI_KEY = Symbol.for('cattail.world-editor.paint-cube-ui')

function plain(value) {
	return JSON.parse(JSON.stringify(value))
}

function canonicalRecipe(value) {
	const weights = Array.isArray(value?.weights) ? value.weights : []
	const normalized = weights.map(entry => ({ resource: Number(entry.resource), weight: Number(entry.weight) }))
		.filter(entry => Number.isInteger(entry.resource) && entry.resource >= 0 && entry.resource < 10 && Number.isInteger(entry.weight) && entry.weight > 0 && entry.weight <= 100)
		.sort((left, right) => left.resource - right.resource)
	if (!normalized.length) return null
	return { version: 1, weights: normalized, totalWeight: normalized.reduce((sum, entry) => sum + entry.weight, 0) }
}

function strictRecipe(value) {
	const canonical = canonicalRecipe(value)
	return canonical && JSON.stringify(canonical) === JSON.stringify(value) ? canonical : null
}

function createEnvironment(storedValue) {
	const definitions = []
	const hooks = new Map()
	const cleanups = []
	const config = new Map()
	const writes = []
	if (storedValue !== undefined) config.set('paintCubeRecipeV1', plain(storedValue))
	const game = {}
	const sandbox = {
		console: { info() {}, warn() {} },
		ModLoader: { register(definition) { definitions.push(definition) } }
	}
	vm.createContext(sandbox)
	vm.runInContext(uiSource, sandbox, { filename: UI_PATH })
	sandbox[RUNTIME_KEY] = { game, addCleanup(cleanup) { cleanups.push(cleanup) } }
	sandbox[PAINT_STATE_KEY] = {
		defaultGrowDurationMs: 4000,
		defaultRecipe() { return { version: 1, weights: [{ resource: 0, weight: 100 }], totalWeight: 100 } },
		normalizeRecipe: canonicalRecipe,
		validateRecipe: strictRecipe,
		normalizeGrowDurationMs(value) { return Number.isInteger(value) && value >= 1000 && value <= 20000 && (value - 1000) % 500 === 0 ? value : null }
	}
	sandbox[GROWTH_KEY] = { ready: true, isReady() { return true } }
	definitions[0].init({
		on(name, listener) { hooks.set(name, listener) },
		config: {
			get(key, fallback) { return config.has(key) ? plain(config.get(key)) : fallback },
			set(key, value) { config.set(key, plain(value)); writes.push({ key, value: plain(value) }); return true }
		}
	})
	function initialize() {
		hooks.get('afterGameInit')({}, game)
		return sandbox[UI_KEY]
	}
	return { sandbox, game, cleanups, writes, config, initialize }
}

function testSessionSubtoolAndPersistentRecipe() {
	const storedRecipe = {
		version: 1,
		weights: [{ resource: 2, weight: 35 }, { resource: 8, weight: 65 }],
		totalWeight: 100
	}
	const env = createEnvironment({ version: 1, recipe: storedRecipe })
	const service = env.initialize()
	assert.equal(service.version, '0.6.0')
	assert.equal(service.configKey, 'paintCubeRecipeV1')
	assert.deepEqual(Array.from(service.subtools), ['brush', 'bucket', 'eraser'])
	assert.deepEqual(Array.from(service.cubeModes), ['stable', 'grow'])
	assert.equal(service.snapshot().subtool, 'brush')
	assert.equal(service.snapshot().cubeMode, 'stable')
	assert.equal(service.snapshot().growAvailable, true)
	assert.equal(service.snapshot().growDurationMs, 4000)
	assert.deepEqual(plain(service.snapshot().recipe), storedRecipe)
	assert.equal(service.snapshot().paletteOpen, false)
	const updates = []
	const stop = service.subscribe(state => updates.push({
		subtool: state.subtool,
		paletteOpen: state.paletteOpen,
		recipe: plain(state.recipe),
		reason: state.lastReason
	}))
	assert.equal(service.setPaletteOpen(true, 'test-open'), true)
	assert.equal(service.snapshot().paletteOpen, true)
	assert.equal(env.writes.length, 0, 'opening and editing a draft does not write config')
	assert.equal(service.setSubtool('eraser', 'test-choice'), true)
	assert.equal(service.setCubeMode('grow', 'test-grow'), true)
	assert.equal(service.snapshot().cubeMode, 'grow')
	const nextRecipe = { version: 1, weights: [{ resource: 4, weight: 100 }], totalWeight: 100 }
	assert.equal(service.setRecipe(nextRecipe, 'palette-apply'), true)
	assert.deepEqual(env.writes, [{
		key: 'paintCubeRecipeV1',
		value: { version: 1, recipe: nextRecipe }
	}])
	assert.deepEqual(plain(service.snapshot().recipe), nextRecipe)
	assert.equal(service.setPaletteOpen(false, 'test-close'), true)
	stop()

	const restarted = env.initialize()
	assert.notEqual(restarted, service)
	assert.equal(service.snapshot().disposed, true)
	assert.equal(restarted.snapshot().subtool, 'brush', 'a fresh game initialization defaults to Brush')
	assert.equal(restarted.snapshot().cubeMode, 'stable', 'a fresh game initialization defaults to Stable')
	assert.deepEqual(plain(restarted.snapshot().recipe), nextRecipe, 'the private ModLoader config persists across game sessions')
	assert.equal(restarted.snapshot().paletteOpen, false)
	assert.ok(updates.some(update => update.reason === 'test-open' && update.paletteOpen))
	assert.ok(updates.some(update => update.reason === 'palette-apply' && update.recipe.weights[0].resource === 4))
}

function testMalformedStoredRecipeFallsBackWithoutWriteback() {
	const env = createEnvironment({
		version: 1,
		recipe: { version: 1, weights: [{ resource: 11, weight: 100 }], totalWeight: 100 }
	})
	const service = env.initialize()
	assert.deepEqual(plain(service.snapshot().recipe), {
		version: 1, weights: [{ resource: 0, weight: 100 }], totalWeight: 100
	})
	assert.equal(env.writes.length, 0)
	assert.equal(service.setRecipe({ weights: [] }, 'invalid'), false)
	assert.equal(env.writes.length, 0)
}

function testSameToolbarAndPaletteContracts() {
	assert.equal(manifest.version, '0.6.0')
	assert.equal(manifest.loaderVersion, '>=0.4.0')
	assert.equal(manifest.entry.length, 45)
	const stateIndex = manifest.entry.indexOf('scripts/core/paint-cube-state.js')
	const blueprintPaintedIndex = manifest.entry.indexOf('scripts/core/blueprint-painted.js')
	const growthIndex = manifest.entry.indexOf('scripts/core/paint-cube-growth.js')
	const strokeIndex = manifest.entry.indexOf('scripts/core/paint-cube-stroke.js')
	const fillIndex = manifest.entry.indexOf('scripts/core/paint-cube-fill.js')
	const uiIndex = manifest.entry.indexOf('scripts/ui/paint-cube-ui.js')
	const inputIndex = manifest.entry.indexOf('scripts/input/paint-cube-input.js')
	assert.equal(blueprintPaintedIndex, stateIndex + 1)
	assert.equal(growthIndex, blueprintPaintedIndex + 1)
	assert.equal(strokeIndex, growthIndex + 1)
	assert.equal(fillIndex, strokeIndex + 1)
	assert.equal(uiIndex, fillIndex + 1)
	assert.ok(uiIndex < inputIndex)
	assert.match(shellSource, /const drawGroup = createToolbarGroup\('draw'\)/)
	assert.match(shellSource, /drawGroup\.append\(drawButton, brushButton, bucketButton, eraserButton, stableButton, growButton\)/)
	assert.match(shellSource, /drawGroup\.append\(paletteButton\)/)
	assert.equal((shellSource.match(/createToolbarGroup\('draw'\)/g) || []).length, 1)
	assert.match(shellSource, /createIconButton\('paint-palette', '', 'paint-palette', '', 'palette'\)/)
	assert.match(shellSource, /\[data-world-editor-toolbar-icon="palette"\]::before/)
	assert.match(shellSource, /\[data-world-editor-toolbar-icon="palette"\]::after/)
	assert.match(shellSource, /paletteButton\.hidden = !showPaintSubtools/)
	assert.match(shellSource, /paintUi\.setPaletteOpen\(true, 'toolbar-palette-open'\)/)
	assert.match(shellSource, /paintUi\.setRecipe\(recipe, 'palette-apply'\)/)
	assert.doesNotMatch(shellSource, /paletteDraft\.fill\(0\)|paletteDraft\[resource\] = 100|worldEditorPaletteSingle|paintPaletteSingle/)
	assert.match(shellSource, /type: 'slider'/)
	assert.match(shellSource, /weightControl\.element\.dataset\.worldEditorPaletteWeight = ''/)
	assert.match(shellSource, /slotValue\.dataset\.worldEditorPaletteSlots = ''/)
	assert.match(shellSource, /slotValue\.textContent = \(resource === 0 \? '64' : '0'\) \+ '\/64'/)
	assert.doesNotMatch(shellSource, /slotControl|paint-palette-slot-control|modloader-config-number|type: 'number'/)
	assert.match(shellSource, /api\.ui\.settings\.scroll\.attach\(rows,/)
	assert.match(shellSource, /data-world-editor-palette-normalized/)
	assert.match(shellSource, /closePaintPalette\('palette-escape'\)/)
	assert.match(shellSource, /closePaintPalette\('palette-outside'\)/)
	assert.match(shellSource, /closePaintPalette\('toolbar-brush'\)/)
	assert.match(shellSource, /closePaintPalette\('toolbar-eraser'\)/)
	assert.match(shellSource, /setCardText\(paletteButton, i18n\.t\(source, 'toolbarCardPaintPalette'\)\)/)
	assert.match(uiSource, /const CONFIG_KEY = 'paintCubeRecipeV1'/)
	assert.match(uiSource, /api\.config\.get\(CONFIG_KEY, null\)/)
	assert.match(uiSource, /api\.config\.set\(CONFIG_KEY, \{ version: CONFIG_VERSION, recipe:/)
	assert.doesNotMatch(uiSource, /localStorage|api\.storage|addEntity|clearCell/)
	assert.doesNotMatch(manifest.settings ? JSON.stringify(manifest.settings) : '', /paintCubeRecipeV1/)
}

function testTwentyLanguageLabels() {
	const definitions = []
	const sandbox = { ModLoader: { register(definition) { definitions.push(definition) } } }
	vm.createContext(sandbox)
	vm.runInContext(i18nSource, sandbox, { filename: I18N_PATH })
	definitions[0].init({})
	const i18n = sandbox[Symbol.for('cattail.world-editor.i18n')]
	const keys = [
		'paintBrush', 'paintEraser', 'paintPalette', 'toolbarCardPaintPalette', 'paintPaletteTitle',
		'paintPaletteResource', 'paintPaletteWeight', 'paintPaletteNormalized', 'paintPaletteSlots',
		'paintPaletteApply', 'paintPaletteCancel'
		, 'paintStable', 'paintGrow', 'toolbarCardPaintStable', 'toolbarCardPaintGrow'
	]
	for (const language of manifest.languages) {
		for (const key of keys) {
			const value = i18n.t(language, key)
			assert.notEqual(value, key, language + ' ' + key)
			assert.ok(value.trim(), language + ' ' + key)
		}
	}
	assert.doesNotMatch(i18nSource, /paintPaletteSingle/)
	assert.equal(i18n.t('sch', 'paintPaletteTitle'), '绘制矿方体调色板')
	assert.equal(i18n.t('tch', 'paintPaletteApply'), '套用')
	assert.equal(i18n.t('jp', 'paintPaletteCancel'), 'キャンセル')
}

testSessionSubtoolAndPersistentRecipe()
testMalformedStoredRecipeFallsBackWithoutWriteback()
testSameToolbarAndPaletteContracts()
testTwentyLanguageLabels()

console.log('World Editor 5C-5 palette UI verification passed: one Draw toolbar group, compact/card palette icons, draft Apply/Cancel boundary, private global config, restart behavior, and 20-language text.')
