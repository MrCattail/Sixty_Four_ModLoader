const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const SHELL_PATH = path.join(MOD_ROOT, 'scripts/ui/editor-shell.js')
const source = fs.readFileSync(SHELL_PATH, 'utf8')

class Element {
	constructor(tagName) {
		this.tagName = String(tagName).toUpperCase()
		this.children = []
		this.dataset = {}
		this.attributes = {}
		this.className = ''
		this.hidden = false
		this.style = {}
		this.textContent = ''
		this.classList = {
			add: (...tokens) => {
				const names = new Set(String(this.className || '').split(/\s+/).filter(Boolean))
				for (const token of tokens) names.add(String(token))
				this.className = Array.from(names).join(' ')
			}
		}
	}
	append(...children) { this.children.push(...children) }
	setAttribute(name, value) { this.attributes[name] = String(value) }
}

function flatten(root) {
	const result = [root]
	for (const child of root.children || []) result.push(...flatten(child))
	return result
}

function createPanel() {
	const definitions = []
	const controls = []
	const scrollAttachments = []
	const settings = {
		version: 1,
		createControl(definition, options) {
			const element = new Element('div')
			element.className = 'modloader-settings-control-surface'
			const input = new Element(definition.type === 'number' ? 'input' : 'div')
			input.type = definition.type
			element.append(input)
			let value = options.value
			let disabled = false
			const handle = {
				definition,
				options,
				element,
				input,
				getValue() { return value },
				setValue(next) { value = next; return value },
				validate() { return { valid: true, value, error: null } },
				setDisabled(next) { disabled = !!next; input.disabled = disabled; return handle },
				destroy() {},
				get disabled() { return disabled }
			}
			controls.push(handle)
			return handle
		},
		scroll: {
			attach(element, options) {
				scrollAttachments.push({ element, options })
				return function () {}
			}
		}
	}
	const sandbox = {
		document: { createElement(tagName) { return new Element(tagName) } },
		console: { info() {}, warn() {} },
		ModLoader: { register(definition) { definitions.push(definition) } }
	}
	vm.createContext(sandbox)
	const exposed = source.replace(
		'function createPaintPalettePanel() {',
		'globalThis.__createPaintPalettePanel = function createPaintPalettePanel() {'
	)
	vm.runInContext(exposed, sandbox, { filename: SHELL_PATH })
	assert.equal(definitions.length, 1)
	definitions[0].init({ id: 'Cattail_TweaksQuality_World-Editor', on() {}, ui: { settings } })
	assert.equal(typeof sandbox.__createPaintPalettePanel, 'function')
	return { panel: sandbox.__createPaintPalettePanel(), controls, scrollAttachments }
}

function testPanelStructureAndAccessibility() {
	const { panel, controls, scrollAttachments } = createPanel()
	const nodes = flatten(panel)
	assert.equal(panel.tagName, 'SECTION')
	assert.equal(panel.hidden, true)
	assert.equal(panel.dataset.open, 'false')
	assert.equal(panel.attributes.role, 'dialog')
	assert.equal(panel.attributes['aria-modal'], 'false')
	assert.equal(panel.attributes['aria-labelledby'], 'cattail-world-editor-paint-palette-title')
	const rows = nodes.filter(node => Object.prototype.hasOwnProperty.call(node.dataset, 'worldEditorPaletteResource'))
	assert.equal(rows.length, 10)
	assert.deepEqual(rows.map(row => row.dataset.worldEditorPaletteResource), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
	assert.equal(controls.length, 10)
	for (let resource = 0; resource < rows.length; resource += 1) {
		const row = rows[resource]
		const rowNodes = flatten(row)
		const weightSurfaces = rowNodes.filter(node => Object.prototype.hasOwnProperty.call(node.dataset, 'worldEditorPaletteWeight'))
		const slotSurfaces = rowNodes.filter(node => Object.prototype.hasOwnProperty.call(node.dataset, 'worldEditorPaletteSlots'))
		assert.equal(weightSurfaces.length, 1)
		assert.equal(slotSurfaces.length, 1)
		const weight = controls[resource]
		assert.equal(weight.definition.key, 'paintPaletteWeight' + resource)
		assert.equal(weight.definition.type, 'slider')
		assert.equal(weight.definition.default, resource === 0 ? 100 : 0)
		assert.equal(weight.definition.min, 0)
		assert.equal(weight.definition.max, 100)
		assert.equal(weight.definition.step, 1)
		assert.equal(weight.definition.integer, true)
		assert.equal(weight.options.theme, 'auto')
		assert.equal(slotSurfaces[0].tagName, 'SPAN')
		assert.ok(slotSurfaces[0].className.includes('cattail-world-editor-shell__paint-palette-value'))
		assert.equal(slotSurfaces[0].textContent, (resource === 0 ? '64' : '0') + '/64')
		assert.equal(rowNodes.filter(node => Object.prototype.hasOwnProperty.call(node.dataset, 'worldEditorPaletteNormalized')).length, 1)
		assert.equal(rowNodes.filter(node => Object.prototype.hasOwnProperty.call(node.dataset, 'worldEditorPaletteSingle')).length, 0)
	}
	assert.equal(scrollAttachments.length, 1)
	assert.equal(scrollAttachments[0].options.axis, 'y')
	assert.equal(scrollAttachments[0].options.maxHeight, 'min(360px, calc(100vh - 270px))')
	assert.equal(scrollAttachments[0].options.theme, 'auto')
	assert.equal(scrollAttachments[0].options.inertia, true)
	assert.equal(scrollAttachments[0].options.transient, true)
	assert.equal(nodes.filter(node => node.dataset.worldEditorAction === 'paint-palette-apply').length, 1)
	assert.equal(nodes.filter(node => node.dataset.worldEditorAction === 'paint-palette-cancel').length, 1)
}

function testDraftAndInteractionContracts() {
	assert.match(source, /paletteDraft = recipeWeights\(currentPaintUi\?\.recipe \|\| paintState\.defaultRecipe\(\)\)/)
	assert.match(source, /const recipe = draftRecipe\(\)/)
	assert.match(source, /if \(!recipe \|\| !paintUi\.setRecipe\(recipe, 'palette-apply'\)\) return false/)
	assert.match(source, /paintUi\.setPaletteOpen\(true, 'toolbar-palette-open'\)/)
	assert.match(source, /if \(currentPaintUi\?\.paletteOpen === true\) paintUi\.setPaletteOpen\(false,/)
	assert.match(source, /paletteApply\.disabled = !recipe/)
	assert.match(source, /paintState\.allocateSlots\(recipe\)/)
	assert.match(source, /controls\?\.weight\?\.setValue\?\.\(weight\)/)
	assert.match(source, /const slotText = String\(slots\?\.\[resource\] \|\| 0\) \+ '\/64'/)
	assert.match(source, /slotValue\.textContent = slotText/)
	assert.match(source, /const validation = control\.validate\?\.\(\)/)
	assert.match(source, /if \(!validation\?\.valid\) return/)
	assert.match(source, /renderPaintPalette\(game, resource\)/)
	assert.doesNotMatch(source, /paintPaletteSingle|worldEditorPaletteSingle|handlePalettePanelClick/)
	assert.doesNotMatch(source, /paletteDraft\.fill\(0\)|paletteDraft\[resource\] = 100/)
	assert.match(source, /if \(canvasClick\) \{[\s\S]*event\.stopImmediatePropagation\?\.\(\)/)
	assert.match(source, /closePaintPalette\('draw-mode-left'\)/)
	assert.match(source, /closePaintPalette\('plane-changed'\)|closeMountedPalette\(this, 'plane-changed'\)/)
	assert.match(source, /closePaintPalette\('editor-inactive'\)/)
	assert.match(source, /max-height: min\(520px,/)
	assert.match(source, /api\.ui\.settings\.scroll\.attach\(rows, \{[\s\S]*axis: 'y',[\s\S]*inertia: true,[\s\S]*transient: true/)
	assert.match(source, /paletteLifecycle\?\.destroy\?\.\(\)/)
	assert.match(source, /paint-palette-weight-control \.modloader-config-slider\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 66px;/)
	assert.match(source, /paint-palette-weight-control \.modloader-config-slider-reset\s*\{[\s\S]*display: none !important;/)
	assert.doesNotMatch(source, /slotControl|paint-palette-slot-control|modloader-config-number|type: 'number'/)
	assert.match(source, /grid-template-columns: 25px minmax\(112px, 1fr\) minmax\(250px, 2fr\) 72px 64px;/)
	assert.match(source, /paint-palette-swatch\s*\{[\s\S]*width: 25px;[\s\S]*height: 25px;[\s\S]*border-radius: 5px;[\s\S]*box-shadow: inset 0 0 0 1px rgba\(255, 255, 255, \.36\);/)
	assert.doesNotMatch(source, /paint-palette-swatch\s*\{[^}]*border-radius: 50%;/)
	assert.match(source, /paint-palette-headings\s*\{[\s\S]*font-size: 12px;[\s\S]*font-weight: 700;/)
	assert.match(source, /paint-palette-action--primary:not\(:disabled\)\s*\{[\s\S]*background: var\(--world-editor-hell-gem-glass\);[\s\S]*box-shadow: var\(--world-editor-hell-gem-glass-shadow\);/)
	assert.match(source, /paint-palette-action--primary:hover:not\(:disabled\)\s*\{[\s\S]*background: var\(--world-editor-hell-gem-glass-hover\);[\s\S]*box-shadow: var\(--world-editor-hell-gem-glass-shadow-hover\);/)
	assert.match(source, /paint-palette-action--primary:active:not\(:disabled\)\s*\{[\s\S]*box-shadow: var\(--world-editor-hell-gem-glass-shadow-pressed\);/)
	assert.match(source, /paint-palette-action--primary:focus-visible:not\(:disabled\)\s*\{[\s\S]*box-shadow: var\(--world-editor-hell-gem-glass-shadow\), 0 0 0 2px var\(--world-editor-shell-text\);/)
	assert.doesNotMatch(source, /paint-palette-rows\s*\{[^}]*overflow:\s*auto;/)
	assert.doesNotMatch(source, /paintPalette.*(?:addEntity|clearCell|executeStroke)/)
}

testPanelStructureAndAccessibility()
testDraftAndInteractionContracts()

console.log('World Editor 5C-5 palette-panel verification passed: ModLoader slider weights without per-row Reset or shortcut, plain n/64 slot text, normalized 64-slot allocation, Apply/Cancel, lifecycle cleanup, and ModLoader inertial scrolling.')
