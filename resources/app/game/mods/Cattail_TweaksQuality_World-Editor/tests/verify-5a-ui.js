const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const UI_SOURCE = 'scripts/ui/blueprint-library-ui.js'
const EDITOR_TEXT_SOURCE = 'scripts/i18n/editor-text.js'
const LIBRARY_SOURCE = 'scripts/core/blueprint-library.js'
const FORMAT_SOURCE = 'scripts/core/blueprint-library-format.js'
const THUMBNAIL_SOURCE = 'scripts/render/blueprint-thumbnail.js'
const SESSION_SOURCE = 'scripts/blueprint-session.js'
const CUT_UI_SOURCE = 'scripts/ui/selection-cut-ui.js'
const INPUT_SOURCE = 'scripts/core/input-controller.js'
const SHARED_SOURCE = 'scripts/core/shared.js'
const BETTER_UIS_SETTINGS_SOURCE = path.resolve(MOD_ROOT, '..', 'Cattail_TweaksQuality_Better-UIs', 'scripts', 'settings-page.js')
const UI_KEY = Symbol.for('cattail.world-editor.blueprint-library-ui')
const THUMBNAIL_KEY = Symbol.for('cattail.world-editor.blueprint-thumbnail')

function source(relativePath) {
	return fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8')
}

function testPageRegistrationAndLanguageFallback() {
	const definitions = []
	let page = null
	const preferences = new Map()
	const sandbox = {
		console: { info() {}, warn() {}, error() {} },
		ModLoader: { register(value) { definitions.push(value) } },
		Symbol,
		Object,
		Array,
		Map,
		Set,
		Promise,
		JSON,
		Math,
		Number,
		String,
		Boolean,
		Date,
		Error,
		TypeError,
		setTimeout,
		clearTimeout,
		localStorage: {
			getItem(key) { return preferences.get(key) || null },
			setItem(key, value) { preferences.set(key, String(value)) }
		}
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(source(EDITOR_TEXT_SOURCE), sandbox, { filename: EDITOR_TEXT_SOURCE })
	vm.runInContext(source(UI_SOURCE), sandbox, { filename: UI_SOURCE })
	assert.equal(definitions.length, 2)
	definitions[0].init()
	definitions[1].init({
		ui: {
			pages: {
				register(value) {
					page = value
					return { unregister() {} }
				}
			}
		},
		on() {}
	})
	assert.ok(page)
	assert.equal(page.id, 'blueprint-library')
	assert.equal(page.prefix, 'cattail-world-editor-blueprint-library-page')
	assert.equal(page.width, '1280px')
	assert.equal(page.contentHeight, '720px')
	assert.equal(page.mobileContentHeight, '700px')
	assert.equal(page.inertialScroll, false)
	assert.equal(page.renderBeforeContent, undefined)
	assert.equal(page.menuLabel({ language: 'en' }), 'Blueprint Library')
	assert.equal(page.menuLabel({ language: 'sch' }), '蓝图库')
	assert.equal(page.menuLabel({ language: 'modsch' }), '蓝图库')
	assert.equal(page.menuLabel({ language: 'tch' }), '蓝图库')
	assert.equal(page.menuLabel({ language: 'ru' }), 'Blueprint Library')
	assert.equal(sandbox[UI_KEY].version, '0.5.1')
	assert.equal(sandbox[UI_KEY].isInputBlocked(), false)
}

async function testThumbnailCacheReadAndDeduplication() {
	const definitions = []
	const sandbox = {
		console: { info() {}, warn() {}, error() {} },
		ModLoader: { register(value) { definitions.push(value) } },
		Symbol,
		Object,
		Array,
		Map,
		Set,
		Promise,
		JSON,
		Math,
		Number,
		String,
		Boolean,
		Date,
		Error,
		TypeError,
		Uint8Array,
		encodeURIComponent
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(source(THUMBNAIL_SOURCE), sandbox, { filename: THUMBNAIL_SOURCE })
	definitions[0].init()
	const thumbnail = sandbox[THUMBNAIL_KEY]
	let reads = 0
	const handle = {
		async read(options) {
			reads += 1
			assert.equal(options.area, 'cache')
			assert.equal(options.bucket, 'thumbnails')
			assert.match(options.name, /^v3__10000000-0000-4000-8000-000000000001__abcdef1234\.png$/)
			return { data: Uint8Array.from([137, 80, 78, 71]) }
		}
	}
	const entry = {
		revision: 'abcdef1234',
		envelope: {
			id: '10000000-0000-4000-8000-000000000001',
			blueprint: { entities: [], blocks: [], surges: [] }
		}
	}
	const [first, second] = await Promise.all([thumbnail.get(handle, entry), thumbnail.get(handle, entry)])
	assert.equal(reads, 1)
	assert.equal(first.cached, true)
	assert.equal(second.cached, true)
	assert.equal(first.placeholder, false)
	assert.match(thumbnail.placeholder, /^data:image\/svg\+xml/)
	assert.equal(thumbnail.peek(entry), first)
	assert.equal(await thumbnail.get(handle, entry), first)
	assert.equal(reads, 1, 'resolved thumbnail is returned without another disk read')
	const placeholderSvg = decodeURIComponent(thumbnail.placeholder.slice(thumbnail.placeholder.indexOf(',') + 1))
	assert.match(placeholderSvg, /M89 106l33-17 33 17-33 17z/)
	assert.match(placeholderSvg, /M145 106l33-17 33 17-33 17z/)
	assert.match(placeholderSvg, /M117 72l33-17 33 17-33 17z/)
	assert.doesNotMatch(placeholderSvg, /M72 92l88-44 88 44-88 44z/)
	assert.doesNotMatch(placeholderSvg, /<rect\b/, 'the placeholder keeps the thumbnail surface transparent')
	const overflowHandle = {
		async read() {
			reads += 1
			return { data: Uint8Array.from([137, 80, 78, 71]) }
		}
	}
	for (let index = 2; index <= 129; index += 1) {
		const hex = index.toString(16)
		await thumbnail.get(overflowHandle, {
			revision: 'abcdef' + hex.padStart(10, '0'),
			envelope: {
				id: hex.padStart(8, '0') + '-0000-4000-8000-' + hex.padStart(12, '0'),
				blueprint: { entities: [], blocks: [], surges: [] }
			}
		})
	}
	assert.equal(thumbnail.peek(entry), null, 'the 129th resolved thumbnail evicts the least recently used entry')
	const readsBeforeReload = reads
	await thumbnail.get(handle, entry)
	assert.equal(reads, readsBeforeReload + 1, 'an evicted entry returns to the disk-backed load path')
}

async function testBuildingThumbnailRenderingAndV3Cache() {
	const definitions = []
	const drawImages = []
	const pathMoves = []
	const fillRects = []
	const strokeRects = []
	const strokeTexts = []
	let afterGameInit = null
	let written = null
	const shopImage = { complete: true, naturalWidth: 256, naturalHeight: 256 }
	function context() {
		return {
			fillRect() { fillRects.push(Array.from(arguments)) },
			strokeRect() { strokeRects.push(Array.from(arguments)) },
			beginPath() {},
			moveTo() { pathMoves.push(Array.from(arguments)) },
			lineTo() {},
			closePath() {},
			fill() {},
			fillText() {},
			strokeText() { strokeTexts.push(Array.from(arguments)) },
			save() {},
			restore() {},
			clearRect() {},
			putImageData() {},
			getImageData() { return { data: new Uint8ClampedArray(96 * 96 * 4).fill(255) } },
			drawImage() { drawImages.push(Array.from(arguments)) }
		}
	}
	const document = {
		createElement(tagName) {
			if (tagName === 'img') {
				return {
					complete: false,
					naturalWidth: 0,
					addEventListener() {},
					set src(value) { this._src = value },
					get src() { return this._src }
				}
			}
			const canvasContext = context()
			return {
				width: 0,
				height: 0,
				getContext() { return canvasContext },
				toBlob(callback) {
					callback({ async arrayBuffer() { return Uint8Array.from([137, 80, 78, 71]).buffer } })
				}
			}
		}
	}
	class FakeBlob {
		constructor(parts, options) { this.parts = parts; this.type = options?.type }
	}
	class FakeFileReader {
		readAsDataURL() {
			this.result = 'data:image/png;base64,iVBORw0KGgo='
			this.onload?.()
		}
	}
	const sandbox = {
		console: { info() {}, warn() {}, error() {} },
		ModLoader: { register(value) { definitions.push(value) } },
		Symbol,
		Object,
		Array,
		Map,
		Set,
		Promise,
		JSON,
		Math,
		Number,
		String,
		Boolean,
		Date,
		Error,
		TypeError,
		Uint8Array,
		Uint8ClampedArray,
		encodeURIComponent,
		setTimeout,
		clearTimeout,
		document,
		Blob: FakeBlob,
		FileReader: FakeFileReader
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(source(THUMBNAIL_SOURCE), sandbox, { filename: THUMBNAIL_SOURCE })
	definitions[0].init({
		on(name, listener) { if (name === 'afterGameInit') afterGameInit = listener }
	})
	assert.equal(typeof afterGameInit, 'function')
	afterGameInit({}, {
		shop: {
			items: [{
				name: 'converter32',
				html: { querySelector() { return shopImage } }
			}]
		}
	})
	const handle = {
		async read() {
			const error = new Error('missing')
			error.code = 'NOT_FOUND'
			throw error
		},
		async write(options) { written = options }
	}
	const entry = {
		revision: 'abcdef1234',
		envelope: {
			id: '10000000-0000-4000-8000-000000000001',
			defaultTransform: { rotation: 90, mirrorU: false, mirrorV: false },
			blueprint: {
				contentBounds: { min: [0, 0], max: [2, 0] },
				entities: [
					{ name: 'converter32', position: [0, 0] },
					{ name: 'converter32', position: [2, 0] }
				],
				blocks: [],
				surges: []
			}
		}
	}
	const result = await sandbox[THUMBNAIL_KEY].get(handle, entry)
	assert.equal(result.cached, false)
	assert.equal(result.placeholder, false)
	assert.equal(written.area, 'cache')
	assert.equal(written.bucket, 'thumbnails')
	assert.equal(written.name, 'v3__10000000-0000-4000-8000-000000000001__abcdef1234.png')
	assert.ok(drawImages.some(function (args) { return args[0] === shopImage }), 'shop image is prepared')
	assert.ok(drawImages.some(function (args) { return args[0] !== shopImage }), 'prepared building icon is drawn into the final thumbnail')
	assert.ok(pathMoves[0][0] > pathMoves[1][0], '90-degree default transform changes the thumbnail layout before drawing')
	assert.equal(fillRects.length, 0, 'the final thumbnail does not paint an opaque background')
	assert.equal(strokeRects.length, 0, 'the final thumbnail does not paint a frame around the transparent canvas')
	assert.equal(strokeTexts.length, 1, 'summary text receives a dark outline for both light and void surfaces')
}

function testManifestAndStaticUiContracts() {
	const manifest = JSON.parse(source('mod.json'))
	assert.equal(manifest.version, '0.5.1')
	assert.equal(manifest.loaderVersion, '>=0.3.1')
	assert.deepEqual(manifest.libraries.blueprints, {
		directory: 'blueprints',
		extensions: ['.64schem', '.cattail-blueprint.json'],
		maxFileBytes: 16777216,
		maxTotalBytes: 2147483648,
		maxEntries: 5000,
		cache: {
			directories: ['thumbnails'],
			extensions: ['.png'],
			maxBytes: 536870912
		}
	})
	for (const relativePath of [FORMAT_SOURCE, LIBRARY_SOURCE, THUMBNAIL_SOURCE, UI_SOURCE]) {
		assert.ok(manifest.entry.includes(relativePath), relativePath)
	}
	assert.ok(manifest.entry.indexOf(FORMAT_SOURCE) < manifest.entry.indexOf(LIBRARY_SOURCE))
	assert.ok(manifest.entry.indexOf(LIBRARY_SOURCE) < manifest.entry.indexOf(UI_SOURCE))
	assert.ok(manifest.entry.indexOf(THUMBNAIL_SOURCE) < manifest.entry.indexOf(UI_SOURCE))

	const ui = source(UI_SOURCE)
	const library = source(LIBRARY_SOURCE)
	const format = source(FORMAT_SOURCE)
	const thumbnail = source(THUMBNAIL_SOURCE)
	const session = source(SESSION_SOURCE)
	const cutUi = source(CUT_UI_SOURCE)
	const input = source(INPUT_SOURCE)
	const shared = source(SHARED_SOURCE)
	const betterUisSettings = fs.readFileSync(BETTER_UIS_SETTINGS_SOURCE, 'utf8')

	assert.match(ui, /api\.ui\?\.pages\?\.register\?\.\(\{[\s\S]*id:\s*PAGE_ID/)
	assert.match(ui, /renderView\('page'/)
	assert.match(ui, /renderView\('modal'/)
	assert.match(ui, /data-world-editor-slot="blueprint"/)
	assert.match(ui, /worldEditorBlueprintLibrary/)
	assert.match(ui, /open\('toolbar'\)/)
	assert.match(ui, /isInputBlocked,/)
	assert.match(ui, /function isInputBlocked\(\) \{[\s\S]*?return !disposed && !!modal/)
	assert.match(ui, /const KEY_EVENT_TYPES = Object\.freeze\(\[[\s\S]*?'keydown',[\s\S]*?'keyup',[\s\S]*?'keypress'/)
	assert.match(ui, /releaseGameKeyboardState\(game\)[\s\S]*?for \(const type of KEY_EVENT_TYPES\) window\.addEventListener\(type, handleModalKeyEvent, true\)/)
	assert.match(ui, /for \(const type of KEY_EVENT_TYPES\) window\.removeEventListener\(type, handleModalKeyEvent, true\)/)
	assert.match(ui, /function handleModalKeyEvent\(event\) \{[\s\S]*?if \(!modal \|\| interactionDialog\) return[\s\S]*?event\.stopImmediatePropagation\(\)[\s\S]*?key === 'escape'[\s\S]*?close\('escape'\)/)
	assert.match(ui, /function trapModalFocus\(event\)/)
	assert.match(ui, /function releaseGameKeyboardState\(currentGame\) \{[\s\S]*?currentGame\.translationMap\[index\] = 0[\s\S]*?delete currentGame\.keyboardMovementHappening[\s\S]*?currentGame\.altActive = false/)
	assert.doesNotMatch(ui, /document\.(?:add|remove)EventListener\('keydown', handleEscape, true\)/)
	assert.match(ui, /for \(const area of \['active', 'problems', 'trash', 'quarantine'\]\)/)
	assert.match(ui, /for \(const view of \['list', 'grid'\]\)/)
	assert.match(ui, /list:\s*readPreference\('details-list', 'true'\)/)
	assert.match(ui, /grid:\s*readPreference\('details-grid', 'false'\)/)
	assert.match(ui, /writePreference\('details-' \+ model\.view/)
	assert.match(ui, /detailText\(entry\.metadata\)/)
	assert.match(ui, /metadata\.width[\s\S]*metadata\.entityCount[\s\S]*metadata\.blockCount[\s\S]*metadata\.surgeCount[\s\S]*metadata\.schemaVersion/)
	assert.match(ui, /metadata\.defaultTransform/)
	assert.match(ui, /' · R' \+ transform\.rotation \+ '°'/)
	assert.match(ui, /addEventListener\('click',[\s\S]*model\.selected = entryKey\(entry\)/)
	assert.match(ui, /addEventListener\('dblclick',[\s\S]*loadInteractive\(entry\)/)
	assert.match(ui, /controller\.thumbnail\(entry\)/)
	assert.match(ui, /const thumbnails = globalThis\[Symbol\.for\('cattail\.world-editor\.blueprint-thumbnail'\)\]/)
	assert.match(ui, /const resolvedThumbnail = entry\.envelope \? thumbnails\?\.peek\?\.\(entry\) : null/)
	assert.match(ui, /image\.src = resolvedThumbnail\?\.url \|\| thumbnails\?\.placeholder \|\| ''/)
	assert.match(ui, /if \(entry\.envelope && !resolvedThumbnail\?\.url\) \{[\s\S]*controller\.thumbnail\(entry\)/)
	assert.doesNotMatch(ui, /model\.view === 'grid' && entry\.envelope/)
	assert.match(ui, /controller\.duplicate\(entry\)/)
	assert.match(ui, /controller\.trash\(entry\)/)
	assert.match(ui, /controller\.restore\(entry\)/)
	assert.match(ui, /controller\.quarantine\(entry\)/)
	assert.match(ui, /controller\.remove\(entry\)/)
	assert.match(ui, /controller\.retry\(entry\)/)
	assert.match(ui, /controller\.openFolder\(\{ area:/)
	assert.match(ui, /controller\.pickImport\(\{ title: label\(game, 'importFileTitle'\) \}\)/)
	assert.match(ui, /controller\.prepareImportText\(text, \{ source: 'clipboard' \}\)/)
	assert.match(ui, /controller\.commitImport\(candidate, 'import'\)/)
	assert.match(ui, /controller\.commitImport\(candidate, resolution\)/)
	assert.match(ui, /controller\.exportItem\(entry, \{ title: label\(game, 'exportFileTitle'\) \}\)/)
	assert.match(ui, /controller\.shareText\(entry\)/)
	assert.match(ui, /globalThis\.navigator\.clipboard\.readText\(\)/)
	assert.match(ui, /globalThis\.navigator\.clipboard\.writeText\(shared\.text\)/)
	assert.match(ui, /dialog\.setBusy\(true\)/)
	assert.match(ui, /dialog\.mount\(copy\)/)
	assert.match(ui, /toolbarSaveButton\.dataset\.worldEditorBlueprintSave = 'toolbar'/)
	assert.match(ui, /cardSaveButton\.dataset\.worldEditorBlueprintSave = 'card'/)
	assert.match(ui, /slot\.append\(toolbarSaveButton, toolbarButton\)/)
	assert.match(ui, /placement\.prepend\(cardSaveButton\)/)
	assert.match(ui, /function refreshSaveButtons\(\)/)
	assert.match(ui, /const disabled = !session\?\.snapshot\?\.\(\)\.sourceBlueprint \|\| !libraryState\?\.ready \|\| libraryState\.busy/)
	assert.match(ui, /button\.disabled = !!disabled/)
	assert.match(ui, /void saveCurrentInteractive\(\)\.catch\(showError\)/)
	assert.match(ui, /controller\.saveCurrent\(\{ displayName: name \}\)/)
	assert.match(ui, /const DIALOG_KEY = Symbol\.for\('cattail\.world-editor\.dialogs'\)/)
	assert.match(ui, /function requestBlueprintName\(options\)/)
	assert.match(ui, /function requestConfirmation\(options\)/)
	assert.match(ui, /function showMessageDialog\(options\)/)
	assert.match(ui, /kind:\s*'blueprint-library-name'/)
	assert.match(ui, /kind:\s*'blueprint-library-confirm'/)
	assert.match(ui, /kind:\s*'blueprint-library-message'/)
	assert.match(ui, /input\.maxLength = 160/)
	assert.match(ui, /form\.addEventListener\('submit'/)
	assert.match(ui, /confirmName\.setAttribute\('form', form\.id\)/)
	assert.match(ui, /dialog\.mount\(input\)/)
	assert.match(ui, /const accepted = await requestConfirmation\(\{[\s\S]*title: label\(game, 'replaceTitle'\)[\s\S]*confirm: label\(game, 'replaceConfirm'\)/)
	assert.match(ui, /danger: true/)
	assert.match(ui, /showMessageDialog\(\{[\s\S]*title: label\(game, 'errorTitle'\)/)
	assert.doesNotMatch(ui, /\b(?:prompt|confirm|alert)\s*\(/)
	assert.match(ui, /font:\s*400 13px\/1\.45 Montserrat,\s*Arial,\s*sans-serif/)
	assert.match(ui, /font:\s*600 20px\/1\.3 Montserrat,\s*Arial,\s*sans-serif/)
	assert.match(ui, /font:\s*600 12px\/1\.35 Montserrat,\s*Arial,\s*sans-serif/)
	assert.doesNotMatch(ui, /font:14px\/1\.4 sans-serif/)
	assert.match(ui, /Save Slots \/ Settings Page minimalist surface/)
	assert.match(ui, /prefix:\s*'cattail-world-editor-blueprint-library-page'/)
	assert.match(ui, /\.cattail-world-editor-library-modal\s*\{[\s\S]*?--world-editor-library-bg:\s*rgba\(248, 248, 246, \.97\);[\s\S]*?--world-editor-library-text:\s*rgba\(18, 20, 22, \.94\);[\s\S]*?--world-editor-library-border:\s*rgba\(0, 0, 0, \.14\);/)
	assert.match(ui, /\.cattail-world-editor-library-modal\[data-theme="void"\]\s*\{[\s\S]*?--world-editor-library-bg:\s*rgba\(8, 10, 12, \.97\);[\s\S]*?--world-editor-library-text:\s*rgba\(255, 255, 255, \.94\);[\s\S]*?--world-editor-library-border:\s*rgba\(255, 255, 255, \.16\);/)
	assert.match(ui, /\.cattail-world-editor-library-modal__backdrop\s*\{[\s\S]*?background:\s*rgba\(8, 10, 12, \.36\);[\s\S]*?backdrop-filter:\s*blur\(10px\);/)
	assert.match(ui, /const MODAL_DESIGN_SIZE = Object\.freeze\(\{ width: 1280, height: 792, gutter: 32 \}\)/)
	assert.match(ui, /\.cattail-world-editor-library-modal__panel\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\);[\s\S]*?width:\s*1280px;[\s\S]*?height:\s*792px;[\s\S]*?box-sizing:\s*border-box;[\s\S]*?overflow:\s*hidden;[\s\S]*?border:\s*1px solid var\(--world-editor-library-border\);[\s\S]*?border-radius:\s*10px;[\s\S]*?background:\s*var\(--world-editor-library-bg\);[\s\S]*?box-shadow:\s*0 20px 70px rgba\(0, 0, 0, \.34\);[\s\S]*?transform:\s*scale\(var\(--world-editor-library-modal-scale, 1\)\);[\s\S]*?transform-origin:\s*center;/)
	assert.match(ui, /modal\.innerHTML = '[^']*data-library-close><span class="cattail-world-editor-library-modal__close-mark" aria-hidden="true"><\/span><\/button>/)
	assert.match(ui, /window\.addEventListener\('resize', refreshModalScale\)/)
	assert.match(ui, /window\.removeEventListener\('resize', refreshModalScale\)/)
	assert.match(ui, /function refreshModalScale\(\)[\s\S]*?availableWidth = Math\.max\(1, Number\(window\.innerWidth\) - MODAL_DESIGN_SIZE\.gutter\)[\s\S]*?availableHeight = Math\.max\(1, Number\(window\.innerHeight\) - MODAL_DESIGN_SIZE\.gutter\)[\s\S]*?Number\(window\.screen\?\.availWidth\) - MODAL_DESIGN_SIZE\.gutter[\s\S]*?Number\(window\.screen\?\.availHeight\) - MODAL_DESIGN_SIZE\.gutter[\s\S]*?const displayRatio = Math\.min\([\s\S]*?availableWidth \/ displayWidth,[\s\S]*?availableHeight \/ displayHeight[\s\S]*?const responsiveScale = \.5 \+ \.5 \* displayRatio[\s\S]*?availableWidth \/ MODAL_DESIGN_SIZE\.width,[\s\S]*?availableHeight \/ MODAL_DESIGN_SIZE\.height,[\s\S]*?responsiveScale[\s\S]*?modal\.style\.setProperty\('--world-editor-library-modal-scale', normalized\)/)
	assert.match(ui, /\.cattail-world-editor-library-modal__panel > header button\[data-library-close\]\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;[\s\S]*?border:\s*0 !important;[\s\S]*?background:\s*transparent !important;[\s\S]*?box-shadow:\s*none !important;/)
	assert.match(ui, /\.cattail-world-editor-library-modal__close-mark::before,[\s\S]*?width:\s*34px;[\s\S]*?height:\s*3px;[\s\S]*?background:\s*var\(--world-editor-library-text\);/)
	assert.match(ui, /\.cattail-world-editor-library-modal__close-mark::before\s*\{\s*transform:\s*rotate\(45deg\);/)
	assert.match(ui, /\.cattail-world-editor-library-modal__close-mark::after\s*\{\s*transform:\s*rotate\(-45deg\);/)
	assert.match(ui, /\.cattail-world-editor-library button,[\s\S]*?appearance:\s*none;[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?color:\s*#fff;/)
	assert.match(ui, /\.cattail-world-editor-library button:hover:not\(:disabled\),[\s\S]*?\.cattail-world-editor-library select:hover:not\(:disabled\),[\s\S]*?\.cattail-world-editor-library select:focus-visible,[\s\S]*?background:\s*rgba\(255, 255, 255, \.08\);[\s\S]*?color:\s*#b56b87;/)
	assert.match(ui, /\.cattail-world-editor-library-modal \.cattail-world-editor-library\[data-surface="modal"\] button,[\s\S]*?border:\s*1px solid var\(--world-editor-library-border\);[\s\S]*?border-radius:\s*6px;[\s\S]*?background:\s*var\(--world-editor-library-control\);[\s\S]*?color:\s*var\(--world-editor-library-text\);/)
	assert.match(ui, /\.cattail-world-editor-library-modal \.cattail-world-editor-library__item\[data-selected="true"\],[\s\S]*?background:\s*var\(--world-editor-library-active\) !important;[\s\S]*?box-shadow:\s*inset 0 0 0 1px var\(--world-editor-library-active-border\) !important;/)
	assert.match(ui, /\.cattail-world-editor-library select:focus\s*\{[\s\S]*?outline:\s*0 !important;[\s\S]*?box-shadow:\s*none !important;/)
	assert.match(ui, /\.cattail-world-editor-library\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-rows:\s*auto auto auto minmax\(0, 1fr\);[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/)
	assert.match(ui, /\[data-library-modal-body\]\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/)
	assert.match(ui, /\.cattail-world-editor-library\[data-surface="modal"\]\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/)
	assert.match(ui, /\.cattail-world-editor-library__toolbar button,[\s\S]*?min-height:\s*40px;[\s\S]*?padding:\s*8px 12px;[\s\S]*?font-size:\s*15px;/)
	assert.match(ui, /\.cattail-world-editor-library__toolbar button,[\s\S]*?border:\s*0 !important;[\s\S]*?border-radius:\s*0;[\s\S]*?background:\s*transparent !important;[\s\S]*?box-shadow:\s*none !important;/)
	assert.match(ui, /\.cattail-world-editor-library__toolbar button:hover:not\(:disabled\),[\s\S]*?\.cattail-world-editor-library__toolbar select:hover:not\(:disabled\)[\s\S]*?background:\s*transparent !important;[\s\S]*?color:\s*#b56b87 !important;/)
	assert.match(ui, /\.cattail-world-editor-library__toolbar button:focus-visible,[\s\S]*?\.cattail-world-editor-library__toolbar select:focus-visible[\s\S]*?box-shadow:\s*none !important;[\s\S]*?text-decoration:\s*underline;[\s\S]*?text-underline-offset:\s*4px;/)
	assert.match(ui, /\.cattail-world-editor-library__check\s*\{[\s\S]*?min-height:\s*40px;[\s\S]*?padding:\s*8px 12px;[\s\S]*?font-size:\s*15px;/)
	assert.match(ui, /\.cattail-world-editor-library__check input\s*\{[\s\S]*?width:\s*18px;[\s\S]*?height:\s*18px;/)
	assert.match(ui, /primaryActions\.className = 'cattail-world-editor-library__toolbar-group cattail-world-editor-library__toolbar-group--actions'/)
	assert.match(ui, /viewOptions\.className = 'cattail-world-editor-library__toolbar-group cattail-world-editor-library__toolbar-group--view'/)
	assert.match(ui, /preferences\.className = 'cattail-world-editor-library__toolbar-group cattail-world-editor-library__toolbar-group--preferences'/)
	assert.doesNotMatch(ui, /renderBeforeContent|renderPageRule|cattail-world-editor-library__page-rule/)
	assert.match(ui, /toolbarRule\.className = 'cattail-world-editor-library__toolbar-rule'/)
	assert.match(ui, /root\.append\(toolbar, toolbarRule, renderStatus\(\)\)[\s\S]*?const layout = document\.createElement\('div'\)/)
	assert.match(ui, /cattail-world-editor-library__status/)
	assert.match(ui, /setAttribute\('aria-live', statusMessage\?\.kind === 'error' \? 'assertive' : 'polite'\)/)
	assert.match(ui, /\.cattail-world-editor-library__toolbar-rule\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*1px;[\s\S]*?margin:\s*10px 0 8px;[\s\S]*?background:\s*rgba\(255, 255, 255, \.72\);/)
	assert.match(ui, /appendSeparated\(primaryActions, \[/)
	assert.match(ui, /appendSeparated\(viewOptions, \[areaSelect, viewSelect\]\)/)
	assert.match(ui, /appendSeparated\(toolbar, \[primaryActions, viewOptions, preferences\]\)/)
	assert.match(ui, /appendSeparated\(actions, \[/)
	assert.match(ui, /appendSeparated\(dialog\.actions, \[cancel, confirmName\]\)/)
	assert.match(ui, /appendSeparated\(dialog\.actions, \[cancel, confirmAction\]\)/)
	assert.doesNotMatch(ui, /dialog\.actions\.append/)
	assert.match(ui, /separator\.className = 'cattail-world-editor-library__separator'/)
	assert.match(ui, /separator\.setAttribute\('aria-hidden', 'true'\)/)
	assert.match(ui, /\.cattail-world-editor-library__separator\s*\{[\s\S]*?flex:\s*0 0 1px;[\s\S]*?width:\s*1px;[\s\S]*?height:\s*18px;[\s\S]*?margin:\s*0 12px;[\s\S]*?background:\s*rgba\(255, 255, 255, \.42\);/)
	assert.match(ui, /\.cattail-world-editor-library__toolbar > \.cattail-world-editor-library__separator,[\s\S]*?height:\s*24px;[\s\S]*?margin:\s*0 15px;/)
	assert.doesNotMatch(ui, /\.cattail-world-editor-library__toolbar-group \+ \.cattail-world-editor-library__toolbar-group::before/)
	assert.doesNotMatch(ui, /\.cattail-world-editor-dialog\[data-kind\^="blueprint-library-"\][^{]*::before/)
	assert.match(ui, /layoutRule\.className = 'cattail-world-editor-library__layout-rule'/)
	assert.match(ui, /layoutRule\.setAttribute\('aria-hidden', 'true'\)/)
	assert.match(ui, /const detailsPanel = renderDetails\(selected, refreshSurface\)/)
	assert.match(ui, /layout\.append\(collection, layoutRule, detailsPanel\)/)
	assert.match(ui, /installSurfaceScroll\(surface, \[collection, detailsPanel\]\)/)
	assert.match(ui, /pages\?\.installTransientScrollbar\?\.\(element, SCROLLBAR_VISIBLE_CLASS\)/)
	assert.match(ui, /pages\?\.installInertialScroll\?\.\(element, INERTIAL_SCROLL_OPTIONS\)/)
	assert.match(ui, /const INERTIAL_SCROLL_OPTIONS = Object\.freeze\(\{[\s\S]*?friction:\s*\.88,[\s\S]*?directInfluence:\s*\.30,[\s\S]*?tailInfluence:\s*\.13,[\s\S]*?maxVelocity:\s*34,[\s\S]*?stopThreshold:\s*\.35/)
	assert.match(ui, /onClose\(\) \{ stopSurfaceScroll\('page'\) \}/)
	assert.match(ui, /stopSurfaceScroll\('modal'\)[\s\S]*?closingModal\.remove\(\)/)
	assert.doesNotMatch(ui, /function installInertialScroll|requestAnimationFrame\(animate\)/)
	assert.match(ui, /\.cattail-world-editor-library__layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 1px 400px;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/)
	assert.match(ui, /\.cattail-world-editor-library__layout-rule\s*\{[\s\S]*?width:\s*1px;[\s\S]*?height:\s*100%;[\s\S]*?background:\s*rgba\(255, 255, 255, \.42\);/)
	assert.match(ui, /\.cattail-world-editor-library__collection\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;[\s\S]*?scrollbar-color:\s*transparent transparent;[\s\S]*?transition:\s*scrollbar-color \.28s ease;/)
	assert.match(ui, /\.cattail-world-editor-library\[data-view="grid"\] \.cattail-world-editor-library__collection\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fill, minmax\(220px, 1fr\)\);[\s\S]*?grid-auto-rows:\s*max-content;[\s\S]*?align-items:\s*start;[\s\S]*?gap:\s*12px;/)
	assert.match(ui, /\.cattail-world-editor-library\[data-view="grid"\] \.cattail-world-editor-library__item\s*\{[\s\S]*?display:\s*block !important;[\s\S]*?align-self:\s*start;[\s\S]*?height:\s*max-content;[\s\S]*?min-height:\s*max-content;/)
	assert.doesNotMatch(ui, /\.cattail-world-editor-library\[data-view="grid"\] \.cattail-world-editor-library__item\s*\{[^}]*overflow:\s*hidden/)
	assert.match(ui, /\.cattail-world-editor-library__collection:hover,[\s\S]*?\.cattail-world-editor-library__collection\.cattail-world-editor-library__scrollbar-visible\s*\{[\s\S]*?scrollbar-color:\s*#fffc #fff2;/)
	assert.match(ui, /\.cattail-world-editor-library__collection::-webkit-scrollbar-track,[\s\S]*?background:\s*transparent;[\s\S]*?transition:\s*background \.28s ease;/)
	assert.match(ui, /\.cattail-world-editor-library__collection:hover::-webkit-scrollbar-thumb,[\s\S]*?\.cattail-world-editor-library__details\.cattail-world-editor-library__scrollbar-visible::-webkit-scrollbar-thumb\s*\{[\s\S]*?background:\s*linear-gradient\(to right, transparent 4px, rgba\(255, 255, 255, \.78\) 4px, rgba\(255, 255, 255, \.78\) 6px, transparent 6px\);/)
	assert.doesNotMatch(ui, /\.cattail-world-editor-library__collection\s*\{[^}]*max-height:/)
	assert.match(ui, /\.cattail-world-editor-library__item\s*\{[\s\S]*?border:\s*0 !important;/)
	assert.doesNotMatch(ui, /\.cattail-world-editor-library(?:\[data-view="grid"\] )?\.cattail-world-editor-library__item::(?:before|after)/)
	assert.match(ui, /\.cattail-world-editor-library__item\[data-selected="true"\]\s*\{[\s\S]*?outline:\s*0;[\s\S]*?background:\s*rgba\(255, 255, 255, \.08\) !important;/)
	assert.doesNotMatch(ui, /box-shadow:\s*inset 2px 0/)
	assert.match(ui, /\.cattail-world-editor-library__item img\s*\{[\s\S]*?border:\s*0;/)
	assert.match(ui, /\.cattail-world-editor-library__details\s*\{[\s\S]*?max-height:\s*100%;[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;[\s\S]*?border:\s*0;[\s\S]*?border-radius:\s*0;[\s\S]*?padding:\s*16px;[\s\S]*?background:\s*transparent;[\s\S]*?color:\s*#fff;[\s\S]*?font-size:\s*14px;[\s\S]*?scrollbar-color:\s*transparent transparent;[\s\S]*?transition:\s*scrollbar-color \.28s ease;/)
	assert.match(ui, /\.cattail-world-editor-library__details h3\s*\{[\s\S]*?margin:\s*0 0 10px;[\s\S]*?font:\s*600 17px\/1\.35 Montserrat, Arial, sans-serif;/)
	assert.match(ui, /\.cattail-world-editor-library__details p\s*\{[\s\S]*?font-size:\s*14px;[\s\S]*?line-height:\s*1\.55;/)
	assert.match(ui, /\.cattail-world-editor-library__actions > button\s*\{[\s\S]*?min-height:\s*36px;[\s\S]*?padding:\s*7px 10px;[\s\S]*?font-size:\s*14px;/)
	assert.match(ui, /\.cattail-world-editor-library__actions > \.cattail-world-editor-library__separator\s*\{[\s\S]*?height:\s*20px;[\s\S]*?margin:\s*0 13px;/)
	assert.match(ui, /@media \(max-width: 760px\)[\s\S]*?\.cattail-world-editor-library\[data-surface="page"\] \.cattail-world-editor-library__layout\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\) 1px minmax\(140px, 220px\);[\s\S]*?\.cattail-world-editor-library\[data-surface="page"\] \.cattail-world-editor-library__layout-rule\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*1px;/)
	assert.doesNotMatch(ui, /@media \(max-width: 760px\)[\s\S]*?\.cattail-world-editor-library\[data-surface="modal"\][\s\S]*?\n\s*\}/)
	assert.match(ui, /\.cattail-world-editor-blueprint-card__save-library\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?color:\s*var\(--blueprint-card-text, rgba\(18, 20, 22, \.94\)\);/)
	assert.match(ui, /\.cattail-world-editor-blueprint-card__save-library::after\s*\{[\s\S]*?height:\s*1px;[\s\S]*?background:\s*var\(--blueprint-card-border, rgba\(0, 0, 0, \.14\)\);/)
	assert.match(ui, /#cattail-world-editor-blueprint-card \.cattail-world-editor-blueprint-card__place\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?color:\s*var\(--blueprint-card-text, rgba\(18, 20, 22, \.94\)\);/)
	assert.match(ui, /\.cattail-world-editor-shell \.cattail-world-editor-blueprint-library-button,[\s\S]*?border:\s*0 !important;[\s\S]*?color:\s*var\(--world-editor-shell-text, rgba\(18, 20, 22, \.94\)\) !important;/)
	assert.match(ui, /\.cattail-world-editor-shell\[data-toolbar-style="compact"\] \.cattail-world-editor-blueprint-library-button::before,[\s\S]*?width:\s*1px;[\s\S]*?background:\s*var\(--world-editor-shell-border, rgba\(0, 0, 0, \.14\)\);/)
	assert.match(ui, /\.cattail-world-editor-dialog\[data-kind\^="blueprint-library-"\]\s*\{\s*z-index:\s*100050;/)
	assert.match(ui, /\.cattail-world-editor-dialog\[data-kind\^="blueprint-library-"\] \.cattail-world-editor-library__separator\s*\{\s*display:\s*none;/)
	assert.doesNotMatch(ui, /\.cattail-world-editor-dialog\[data-kind\^="blueprint-library-"\]\s*\{[^}]*--world-editor-dialog-bg:/)
	assert.doesNotMatch(ui, /\.cattail-world-editor-dialog\[data-kind\^="blueprint-library-"\] \.cattail-world-editor-dialog__box\s*\{/)
	assert.doesNotMatch(ui, /\.cattail-world-editor-blueprint-library-page-button(?:::\w+)?\s*\{/)
	assert.match(ui, /\.cattail-world-editor-library-name-form__field input\s*\{[\s\S]*?border:\s*1px solid var\(--world-editor-dialog-border\);[\s\S]*?border-radius:\s*6px;[\s\S]*?background:\s*var\(--world-editor-dialog-control\);[\s\S]*?color:\s*var\(--world-editor-dialog-text\);/)
	assert.match(ui, /color:\s*#b56b87;/)
	assert.doesNotMatch(ui, /controller\.saveCurrent\([^)]*capture/)
	assert.match(ui, /controller\.load\(entry\)/)
	assert.doesNotMatch(ui, /confirmSessionReplacement|unsavedChoice|library-guard|Unsaved blueprint|蓝图尚未保存/)
	assert.match(ui, /cattail\.world-editor\.library\./)
	assert.doesNotMatch(ui, /sessionStorage/)

	assert.match(library, /api\.storage\?\.libraries/)
	assert.match(library, /libraries\.open\('blueprints'\)/)
	assert.match(library, /expectedRevision/)
	assert.match(library, /handle\.watch/)
	assert.match(library, /WATCH_UNAVAILABLE/)
	assert.match(library, /readArea\('trash'/)
	assert.match(library, /readArea\('quarantine'/)
	assert.doesNotMatch(library, /DIRTY_SESSION/)
	assert.match(format, /id\.replace\(\/-\/g, ''\)/)
	assert.match(format, /240 - utf8Length\(suffix\)/)
	assert.match(thumbnail, /area:\s*'cache',\s*bucket:\s*'thumbnails'/)
	assert.match(thumbnail, /handle\.write\(\{ area:\s*'cache',\s*bucket:\s*'thumbnails'/)
	assert.match(thumbnail, /const CACHE_VERSION = 'v3'/)
	assert.doesNotMatch(thumbnail, /context\.fillStyle = '#14161b'[\s\S]*?context\.fillRect\(0, 0, canvas\.width, canvas\.height\)/)
	assert.doesNotMatch(thumbnail, /context\.strokeRect\(\.5, \.5, canvas\.width - 1, canvas\.height - 1\)/)
	assert.match(thumbnail, /context\.clearRect\(0, 0, canvas\.width, canvas\.height\)/)
	assert.match(thumbnail, /context\.strokeText\(summary, 12, canvas\.height - 12\)/)
	assert.match(thumbnail, /renderBytes\(entry\.envelope\.blueprint, entry\.envelope\.defaultTransform\)/)
	assert.match(thumbnail, /function transformedGeometry\(blueprint, defaultTransform\)/)
	assert.match(thumbnail, /function defaultTransformMatrix\(value\)/)
	assert.match(thumbnail, /const RESOLVED_CACHE_LIMIT = 128/)
	assert.match(thumbnail, /const resolved = new Map\(\)/)
	assert.match(thumbnail, /peek\(entry\) \{[\s\S]*?resolved\.get\(key\)[\s\S]*?resolved\.set\(key, result\)/)
	assert.match(thumbnail, /function remember\(key, result\)[\s\S]*?while \(resolved\.size > RESOLVED_CACHE_LIMIT\)[\s\S]*?resolved\.delete\(resolved\.keys\(\)\.next\(\)\.value\)/)
	assert.match(thumbnail, /resolved\.clear\(\)/)
	assert.match(thumbnail, /api\?\.on\?\.\('afterGameInit'/)
	assert.match(thumbnail, /shared\?\.resolveEntityIcon\?\.\(game, name\)/)
	assert.match(thumbnail, /prepareEntityIcon\(shopImage\)/)
	assert.match(thumbnail, /context\.getImageData\(/)
	assert.match(thumbnail, /drawEntityIcon\(context, point, iconSize, icon\)/)
	assert.match(thumbnail, /600 12px Montserrat, Arial, sans-serif/)
	assert.match(thumbnail, /const blocks = \(blueprint\.blocks \|\| \[\]\)\.map/)
	assert.match(thumbnail, /const surges = \(blueprint\.surges \|\| \[\]\)\.map/)

	assert.doesNotMatch(session, /confirmSessionReplacement/)
	assert.doesNotMatch(input, /confirmSessionReplacement|guardedDeactivate|blueprintDirty/)
	assert.match(input, /if \(shared\.isWorldEditorInputBlocked\?\.\(\)\) return/)
	assert.match(shared, /const BLUEPRINT_LIBRARY_UI_KEY = Symbol\.for\('cattail\.world-editor\.blueprint-library-ui'\)/)
	assert.match(shared, /globalThis\[BLUEPRINT_LIBRARY_UI_KEY\]\?\.isInputBlocked\?\.\(\)/)
	assert.match(betterUisSettings, /function shouldHandleGameplayKey\(game, event\) \{[\s\S]*?document\.querySelector\?\.\('\[aria-modal="true"\]'\)[\s\S]*?return false/)
	const betterUisKeydown = betterUisSettings.slice(
		betterUisSettings.indexOf('function handleKeyDown(event)'),
		betterUisSettings.indexOf('function handleKeyUp(event)')
	)
	assert.ok(
		betterUisKeydown.indexOf('shouldHandleGameplayKey(game, event)') < betterUisKeydown.indexOf('const action = currentActionForCode(game, event.code)'),
		'Better UIs modal guard runs before bound gameplay actions'
	)
	assert.doesNotMatch(cutUi, /confirmSessionReplacement/)
	assert.match(cutUi, /let removeCubes = false/)
	assert.match(cutUi, /let removeSurges = false/)
	assert.match(session, /session\.setIncludeBlocks\(false, 'placement-finished-default'\)/)
	assert.match(session, /session\.setIncludeSurges\(false, 'placement-finished-default'\)/)
	assert.match(session, /placementCubeOption/)
	assert.match(session, /placementSurgeOption/)
}

async function run() {
	testPageRegistrationAndLanguageFallback()
	await testThumbnailCacheReadAndDeduplication()
	await testBuildingThumbnailRenderingAndV3Cache()
	testManifestAndStaticUiContracts()
	console.log('World Editor 5A UI verification passed: Pages API, toolbar and blueprint-card manual save entries, modal keyboard ownership and Escape/focus behavior, shared list/grid model with transparent v3 building thumbnails, game-native typography, details preferences, metadata with/without previews, CRUD/problem actions, non-blocking dialogs, overwrite-without-unsaved-guards, per-placement/per-cut layer defaults, and thumbnail cache contracts.')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
