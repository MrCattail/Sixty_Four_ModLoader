const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const TOOL_PATH = path.join(MOD_ROOT, 'scripts/core/tool-state.js')
const SELECTION_INPUT_PATH = path.join(MOD_ROOT, 'scripts/input/selection-controller.js')
const SHELL_PATH = path.join(MOD_ROOT, 'scripts/ui/editor-shell.js')
const I18N_PATH = path.join(MOD_ROOT, 'scripts/i18n/editor-text.js')
const MANIFEST_PATH = path.join(MOD_ROOT, 'mod.json')

const toolSource = fs.readFileSync(TOOL_PATH, 'utf8')
const selectionInputSource = fs.readFileSync(SELECTION_INPUT_PATH, 'utf8')
const shellSource = fs.readFileSync(SHELL_PATH, 'utf8')
const i18nSource = fs.readFileSync(I18N_PATH, 'utf8')
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))

function loadDefinition(source, filename) {
	const definitions = []
	const sandbox = {
		console: { info() {}, warn() {} },
		ModLoader: {
			register(definition) {
				definitions.push(definition)
			}
		}
	}
	vm.createContext(sandbox)
	vm.runInContext(source, sandbox, { filename })
	assert.equal(definitions.length, 1)
	return { definition: definitions[0], sandbox }
}

function testManifestBoundary() {
	const expectedLanguages = [
		'en', 'sch', 'modsch', 'ru', 'de', 'ptbr', 'it', 'es', 'fr', 'nl',
		'cz', 'pl', 'jp', 'kr', 'tch', 'thai', 'hu', 'lv', 'ro', 'no'
	]
	assert.equal(manifest.version, '0.6.0')
	assert.deepEqual(manifest.languages, expectedLanguages)
	assert.equal(manifest.entry.length, 45)
	assert.equal(manifest.entry.includes('scripts/render/paint-cube-cursor.js'), true)
	assert.equal(manifest.entry.includes('scripts/core/paint-cube-state.js'), true)
	assert.equal(manifest.entry.includes('scripts/core/paint-cube-growth.js'), true)
	assert.equal(manifest.entry.includes('scripts/core/paint-cube-stroke.js'), true)
	assert.equal(manifest.entry.includes('scripts/core/paint-cube-fill.js'), true)
	assert.equal(manifest.entry.includes('scripts/input/paint-cube-input.js'), true)
	assert.equal(manifest.entry.includes('scripts/ui/paint-cube-ui.js'), true)
}

function testToolState() {
	const { definition, sandbox } = loadDefinition(toolSource, TOOL_PATH)
	const events = new Map()
	const cleanups = []
	let runtimeListener = null
	const game = {}
	const runtime = {
		game,
		addCleanup(cleanup) {
			cleanups.push(cleanup)
		},
		subscribe(listener) {
			runtimeListener = listener
			listener({ active: true })
			return function () {
				runtimeListener = null
			}
		}
	}
	const selection = {
		game,
		subscribe() {
			return function () {}
		}
	}
	sandbox[Symbol.for('cattail.world-editor.runtime')] = runtime
	sandbox[Symbol.for('cattail.world-editor.selection')] = selection
	definition.init({
		on(name, listener) {
			events.set(name, listener)
		}
	})
	events.get('afterGameInit')({}, game)
	const tool = sandbox[Symbol.for('cattail.world-editor.tool')]
	assert.equal(tool.version, '0.6.0')
	assert.deepEqual(Array.from(tool.modes), ['select', 'draw'])
	assert.equal(tool.snapshot().mode, 'select')
	assert.equal(tool.setMode('draw', 'test'), true)
	assert.equal(tool.snapshot().mode, 'draw')
	assert.equal(tool.setMode('paint', 'obsolete-mode'), false)
	runtimeListener({ active: false })
	assert.equal(tool.snapshot().mode, 'select')
	for (const cleanup of cleanups) cleanup()
}

function testInputOwnershipAndShell() {
	assert.match(selectionInputSource, /function selectionInputEnabled\(\)/)
	assert.match(selectionInputSource, /function blockUnimplementedDrawInput\(event, buttonField\)/)
	assert.match(selectionInputSource, /tool\?\.snapshot\?\.\(\)\.mode !== 'draw'/)
	assert.match(selectionInputSource, /consume\(event\)/)
	assert.match(selectionInputSource, /tool\?\.snapshot\?\.\(\)\.mode === 'select'/)
	assert.match(selectionInputSource, /cancelInteraction\('selection-tool-inactive'\)/)
	assert.ok((selectionInputSource.match(/!selectionInputEnabled\(\)/g) || []).length >= 8)

	assert.match(shellSource, /Symbol\.for\('cattail\.world-editor\.tool'\)/)
	assert.match(shellSource, /createToolButton\('draw-mode',\s*'draw-mode',\s*'draw',\s*'✎'\)/)
	assert.match(shellSource, /drawButton\.className \+= ' cattail-world-editor-shell__tool--draw'/)
	assert.match(shellSource, /tool\.setMode\(nextMode,\s*'toolbar-draw-mode'\)/)
	assert.match(shellSource, /tool\.setMode\('select',\s*'blueprint-preview-active'\)/)
	assert.match(shellSource, /shell\.dataset\.mode\s*=\s*hasVisibleBlueprintPreview[\s\S]*currentTool\?\.mode === 'draw' \? 'draw' : 'select'/)
	assert.match(shellSource, /actions\.append\(selectionGroup,\s*historyGroup,\s*blueprintGroup,\s*blueprintLibraryGroup,\s*transformGroup,\s*drawGroup,\s*creativeGroup\)/)
	assert.match(shellSource, /drawGroup\.append\(drawButton,\s*brushButton,\s*bucketButton,\s*eraserButton,\s*stableButton,\s*growButton\)/)
	assert.match(shellSource, /paintUi\.setSubtool\('brush',\s*'toolbar-brush'\)/)
	assert.match(shellSource, /paintUi\.setSubtool\('bucket',\s*'toolbar-bucket'\)/)
	assert.match(shellSource, /paintUi\.setSubtool\('eraser',\s*'toolbar-eraser'\)/)
	assert.match(shellSource, /paintUi\.setCubeMode\('stable',\s*'toolbar-stable'\)/)
	assert.match(shellSource, /paintUi\.setCubeMode\('grow',\s*'toolbar-grow'\)/)
	assert.match(shellSource, /const showPaintSubtools = drawActive && !game\.plane && !!currentState\?\.active && currentPaintUi\?\.ready !== false/)
	assert.match(shellSource, /cattail:world-editor-paint-status/)
	assert.doesNotMatch(shellSource, /worldEditorPaint|executeStroke|game\.addEntity\(['"]cube['"]|game\.clearCell/)
}

function testLocalizedStageText() {
	const { definition, sandbox } = loadDefinition(i18nSource, I18N_PATH)
	definition.init({})
	const i18n = sandbox[Symbol.for('cattail.world-editor.i18n')]
	assert.equal(i18n.version, '0.6.0')
	assert.equal(i18n.languages.length, 20)
	assert.ok(i18n.keys.includes('drawMode'))
	assert.ok(i18n.keys.includes('paintBrush'))
	assert.ok(i18n.keys.includes('paintEraser'))
	assert.ok(i18n.keys.includes('paintStable'))
	assert.ok(i18n.keys.includes('paintGrow'))
	assert.ok(i18n.toolbarKeys.includes('toolbarCardDraw'))
	assert.ok(i18n.toolbarKeys.includes('toolbarCardPaintBrush'))
	assert.ok(i18n.toolbarKeys.includes('toolbarCardPaintEraser'))
	for (const language of manifest.languages) {
		assert.ok(i18n.t(language, 'drawMode').trim(), language + ' drawMode')
		assert.ok(i18n.t(language, 'toolbarCardDraw').trim(), language + ' toolbarCardDraw')
		assert.ok(i18n.t(language, 'paintBrush').trim(), language + ' paintBrush')
		assert.ok(i18n.t(language, 'paintEraser').trim(), language + ' paintEraser')
	}
	assert.equal(i18n.t('sch', 'drawMode'), '绘制模式')
	assert.equal(i18n.t('tch', 'toolbarCardDraw'), '繪製')
	assert.equal(i18n.t('jp', 'drawMode'), '描画モード')
}

function testNarrowWorldWriteAndNoSchemaExpansion() {
	const allowedWorldWriters = new Set([
		'scripts/core/blueprint-placement.js',
		'scripts/core/selection-delete.js',
		'scripts/core/paint-cube-stroke.js'
	])
	const schemaSevenFiles = new Set([
		'scripts/core/blueprint-painted.js',
		'scripts/core/blueprint-state.js',
		'scripts/core/blueprint-library-format.js',
		'scripts/core/blueprint-transform.js',
		'scripts/core/blueprint-preview-plan.js',
		'scripts/core/blueprint-placement.js',
		'scripts/blueprint-session.js'
	])
	for (const relativePath of manifest.entry) {
		const source = fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8')
		if (!schemaSevenFiles.has(relativePath)) {
			assert.doesNotMatch(source, /schemaVersion\s*===\s*7|schemaVersion\s*!==\s*7/, relativePath)
		}
		if (!allowedWorldWriters.has(relativePath)) {
			assert.doesNotMatch(source, /\bgame\.(?:addEntity|clearCell)\b/, relativePath)
		}
	}
}

testManifestBoundary()
testToolState()
testInputOwnershipAndShell()
testLocalizedStageText()
testNarrowWorldWriteAndNoSchemaExpansion()

console.log('World Editor 5C-1 verification passed: 0.6.0 draw-mode shell, selection ownership, 20-language registration, and no world-write/schema expansion.')
