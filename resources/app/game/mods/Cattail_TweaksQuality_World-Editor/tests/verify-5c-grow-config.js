const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const MOD_ROOT = path.resolve(__dirname, '..')
const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))
const activeTranslations = JSON.parse(fs.readFileSync(path.resolve(MOD_ROOT, '../../modloader/translations.json'), 'utf8'))
const paintUiSource = fs.readFileSync(path.join(MOD_ROOT, 'scripts/ui/paint-cube-ui.js'), 'utf8')
const inputSource = fs.readFileSync(path.join(MOD_ROOT, 'scripts/input/paint-cube-input.js'), 'utf8')
const shellSource = fs.readFileSync(path.join(MOD_ROOT, 'scripts/ui/editor-shell.js'), 'utf8')
const i18nSource = fs.readFileSync(path.join(MOD_ROOT, 'scripts/i18n/editor-text.js'), 'utf8')

assert.equal(manifest.version, '0.6.0')
assert.equal(manifest.loaderVersion, '>=0.4.0')
assert.deepEqual(manifest.config.growDurationSeconds, {
	type: 'slider',
	label: 'Grow Duration',
	default: 4,
	min: 1,
	max: 20,
	step: 0.5,
	description: 'Seconds for a Painted Cube to Grow from Empty to Stable, Including Its Final Reveal.',
	reloadPolicy: 'hot'
})
assert.equal(manifest.entry.length, 45)
const stateIndex = manifest.entry.indexOf('scripts/core/paint-cube-state.js')
const blueprintPaintedIndex = manifest.entry.indexOf('scripts/core/blueprint-painted.js')
const growthIndex = manifest.entry.indexOf('scripts/core/paint-cube-growth.js')
const strokeIndex = manifest.entry.indexOf('scripts/core/paint-cube-stroke.js')
assert.ok(stateIndex >= 0 && blueprintPaintedIndex === stateIndex + 1 && growthIndex === blueprintPaintedIndex + 1 && strokeIndex === growthIndex + 1)

assert.equal(manifest.languages.length, 20)
assert.equal(Object.keys(manifest.translations).length, 20)
assert.equal(Object.keys(activeTranslations.languages).length, 20)
for (const language of manifest.languages) {
	const localized = manifest.translations[language]
	assert.ok(localized?.name, language + ' name')
	assert.ok(localized?.description, language + ' description')
	assert.ok(localized?.config?.growDurationSeconds?.label, language + ' Grow label')
	assert.ok(localized?.config?.growDurationSeconds?.description, language + ' Grow description')
	assert.deepEqual(
		activeTranslations.languages[language]?.mods?.[manifest.id],
		localized,
		language + ' active translations.json World Editor entry'
	)
	for (const key of ['paintStable', 'paintGrow', 'toolbarCardPaintStable', 'toolbarCardPaintGrow']) {
		const pattern = new RegExp('\\b' + language + ': \\{[^\\n]*\\b' + key + ':')
		assert.match(i18nSource, pattern, language + ' ' + key)
	}
}

assert.match(paintUiSource, /GROW_DURATION_CONFIG_KEY\s*=\s*'growDurationSeconds'/)
assert.match(paintUiSource, /api\.config\.get\(GROW_DURATION_CONFIG_KEY, paintState\.defaultGrowDurationMs \/ 1000\)/)
assert.match(paintUiSource, /Math\.round\(seconds \* 1000\)/)
assert.equal(paintUiSource.includes('createControl('), false, 'Draw does not create a second duration control')
assert.match(inputSource, /const growDurationMs = cubeMode === 'grow' \? Number\(latestPaintUi\?\.growDurationMs\) : null/)
assert.match(inputSource, /activeStroke = \{[\s\S]*cubeMode,[\s\S]*growDurationMs,/)
assert.match(inputSource, /stroke\.beginLiveStroke\(\{[\s\S]*growDurationMs,[\s\S]*input: 'mouse'/)
assert.match(shellSource, /drawGroup\.append\(drawButton, brushButton, bucketButton, eraserButton, stableButton, growButton\)\s*\n\s*drawGroup\.append\(paletteButton\)/)
assert.match(shellSource, /paintUi\.setCubeMode\('stable', 'toolbar-stable'\)/)
assert.match(shellSource, /paintUi\.setCubeMode\('grow', 'toolbar-grow'\)/)
assert.match(shellSource, /growButton\.hidden = !showPaintSubtools \|\| !growAvailable/)
assert.match(shellSource, /growButton\.disabled = !showPaintSubtools \|\| !growAvailable/)
assert.equal(activeTranslations._meta.lastAction, 'codex-sync-world-editor-5c6-grow-translations')

console.log('World Editor 5C-6 Grow config verification passed: native hot 1-20s slider at 0.5s steps, frozen-stroke duration routing, Stable/Grow toolbar order, 42-entry runtime order, and exact 20-language manifest/active-catalog synchronization.')
