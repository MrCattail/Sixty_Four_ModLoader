const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const CREATIVE_SOURCE = 'scripts/core/creative-mode.js'
const I18N_SOURCE = 'scripts/i18n/editor-text.js'
const SHELL_SOURCE = 'scripts/ui/editor-shell.js'
const DIALOG_SOURCE = 'scripts/ui/dialog.js'
const SHARED_SOURCE = 'scripts/core/shared.js'
const INPUT_SOURCE = 'scripts/core/input-controller.js'
const SESSION_SOURCE = 'scripts/blueprint-session.js'
const PREVIEW_SOURCE = 'scripts/blueprint-preview.js'
const CREATIVE_KEY = Symbol.for('cattail.world-editor.creative-mode')
const SAVE_SLOTS_KEY = Symbol.for('cattail.better-uis.save-slots')
const I18N_KEY = Symbol.for('cattail.world-editor.i18n')

function source(relativePath) {
	return fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8')
}

function encode(value) {
	return Buffer.from(JSON.stringify(value), 'binary').toString('base64')
}

function decode(value) {
	try {
		return JSON.parse(Buffer.from(String(value || ''), 'base64').toString('binary'))
	} catch (error) {
		return 0
	}
}

function createStorage(seed) {
	const values = new Map(Object.entries(seed || {}))
	return {
		values,
		api: {
			getItem(key) {
				return values.has(String(key)) ? values.get(String(key)) : null
			},
			setItem(key, value) {
				values.set(String(key), String(value))
			},
			removeItem(key) {
				values.delete(String(key))
			}
		}
	}
}

function loadCreative(storage, saveSlots) {
	let definition = null
	const hooks = new Map()
	const sandbox = {
		console: { info() {}, warn() {} },
		Symbol,
		Object,
		Array,
		Map,
		Set,
		WeakMap,
		Promise,
		JSON,
		Date,
		Math,
		Error,
		TypeError,
		Number,
		String,
		Boolean,
		RegExp,
		localStorage: storage.api,
		ModLoader: {
			register(value) {
				definition = value
			}
		}
	}
	sandbox.globalThis = sandbox
	if (saveSlots) sandbox[SAVE_SLOTS_KEY] = saveSlots
	vm.createContext(sandbox)
	vm.runInContext(source(CREATIVE_SOURCE), sandbox, { filename: CREATIVE_SOURCE })
	assert.ok(definition)
	definition.init({
		on(name, listener) {
			if (!hooks.has(name)) hooks.set(name, [])
			hooks.get(name).push(listener)
		}
	})
	return {
		sandbox,
		hooks,
		runSync(name, payload, game) {
			let value = payload
			for (const listener of hooks.get(name) || []) {
				const next = listener(value, game)
				if (next !== undefined) value = next
			}
			return value
		},
		async runAsync(name, payload, game) {
			let value = payload
			for (const listener of hooks.get(name) || []) {
				const next = await listener(value, game)
				if (next !== undefined) value = next
			}
			return value
		}
	}
}

function createGame(runtime, storage, steamId) {
	const key = 'abstractv03' + steamId
	const sends = []
	const game = {
		steamId,
		preventSaving: false,
		preventCloud: false,
		decodeSave: decode,
		encodeSave(string) {
			return Buffer.from(String(string), 'binary').toString('base64')
		},
		spaceport: {
			send(type, data) {
				sends.push({ type, data })
			}
		},
		assembleSave() {
			const current = decode(storage.api.getItem(key))
			current.timestamp = Number(current.timestamp || 0) + 1
			const prepared = runtime.runSync('beforeSaveWrite', current, game)
			return encode(prepared)
		},
		saveGame() {
			const data = game.assembleSave()
			storage.api.setItem(key, data)
			game.spaceport.send('save', data)
		},
		sends
	}
	return game
}

async function verifyInPlaceAndFork() {
	const steamId = 'creative-player'
	const key = 'abstractv03' + steamId
	const saveId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
	const initial = {
		timestamp: 10,
		stuff: [],
		resources: [],
		modloader: {
			saveInstanceId: saveId,
			worldEditor: { schema: 1, creativeMode: false, entryMode: null, createdAt: 0 }
		}
	}
	const storage = createStorage({ [key]: encode(initial) })
	let transactionOptions = null
	const slotsState = {
		version: 1,
		settle: async function () {},
		snapshot() {
			return {
				ready: true,
				emptyCount: 10,
				slots: [],
				source: { index: 0, name: '主存档' }
			}
		},
		async createAndActivate(options) {
			transactionOptions = options
			return { activated: true, reloadScheduled: true, activeIndex: 1 }
		}
	}
	const runtime = loadCreative(storage, slotsState)
	const game = createGame(runtime, storage, steamId)
	runtime.runSync('beforeSaveLoad', decode(storage.api.getItem(key)), game)
	await runtime.runAsync('afterGameInit', null, game)
	const creative = runtime.sandbox[CREATIVE_KEY]
	assert.ok(creative)
	assert.equal(creative.snapshot().ready, true)
	assert.equal(creative.snapshot().creativeMode, false)

	creative.setDialogOpen(true, 'test-dialog')
	assert.equal(creative.isInputBlocked(), true)
	creative.setDialogOpen(false, 'test-dialog-close')
	assert.equal(creative.isInputBlocked(), false)

	await creative.enableInPlace('test-enable')
	let active = decode(storage.api.getItem(key))
	assert.equal(active.modloader.worldEditor.creativeMode, true)
	assert.equal(active.modloader.worldEditor.entryMode, 'in-place')
	assert.equal(active.modloader.saveInstanceId, saveId)
	assert.equal(creative.snapshot().creativeMode, true)

	await creative.disable('test-disable')
	active = decode(storage.api.getItem(key))
	assert.equal(active.modloader.worldEditor.creativeMode, false)
	assert.equal(active.modloader.saveInstanceId, saveId)

	await creative.createFork({ originalName: '主存档' })
	assert.ok(transactionOptions)
	assert.equal(transactionOptions.activateEntry, 1)
	assert.equal(transactionOptions.entries[0].name, '主存档')
	assert.equal(transactionOptions.entries[1].name, '主存档创造模式')
	assert.equal(decode(transactionOptions.entries[0].data).modloader.saveInstanceId, saveId)
	const forked = decode(transactionOptions.entries[1].data)
	assert.equal(forked.modloader.saveInstanceId, undefined)
	assert.equal(forked.modloader.worldEditor.creativeMode, true)
	assert.equal(forked.modloader.worldEditor.entryMode, 'forked')
	assert.equal(JSON.stringify(forked).includes('主存档'), false)
	assert.equal(JSON.stringify(forked).includes('创造模式'), false)
	assert.equal(creative.snapshot().busy, true)
}

async function verifyFinalizationFailureBlocksCreativeReadiness() {
	const steamId = 'failed-player'
	const key = 'abstractv03' + steamId
	const storage = createStorage({
		[key]: encode({
			timestamp: 1,
			stuff: [],
			resources: [],
			modloader: {
				saveInstanceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
				worldEditor: { schema: 1, creativeMode: true, entryMode: 'forked', createdAt: 1 }
			}
		})
	})
	const runtime = loadCreative(storage, {
		version: 1,
		async settle() {
			const error = new Error('finalization failed')
			error.code = 'VERIFY_FAILED'
			throw error
		}
	})
	const game = createGame(runtime, storage, steamId)
	runtime.runSync('beforeSaveLoad', decode(storage.api.getItem(key)), game)
	await runtime.runAsync('afterGameInit', null, game)
	const state = runtime.sandbox[CREATIVE_KEY].snapshot()
	assert.equal(state.ready, false)
	assert.equal(state.creativeMode, false)
	assert.equal(state.pendingForkFinalization, true)
	assert.equal(state.error.code, 'VERIFY_FAILED')
}

function verifyIntegrationSources() {
	const manifest = JSON.parse(source('mod.json'))
	assert.equal(manifest.version, '0.4.3')
	assert.equal(manifest.loaderVersion, '>=0.2.0')
	assert.ok(manifest.entry.indexOf(CREATIVE_SOURCE) > manifest.entry.indexOf('scripts/core/editor-state.js'))
	assert.ok(manifest.entry.indexOf(CREATIVE_SOURCE) < manifest.entry.indexOf('scripts/blueprint-session.js'))

	const shell = source(SHELL_SOURCE)
	const dialog = source(DIALOG_SOURCE)
	const shared = source(SHARED_SOURCE)
	const input = source(INPUT_SOURCE)
	const session = source(SESSION_SOURCE)
	const preview = source(PREVIEW_SOURCE)
	assert.match(shell, /data-world-editor-action="creative-mode"/)
	assert.match(dialog, /setAttribute\('role', 'dialog'\)/)
	assert.match(dialog, /KEY_EVENT_TYPES/)
	assert.match(dialog, /window\.addEventListener\(type, handleWindowKeyEvent, true\)/)
	assert.match(dialog, /event\.stopImmediatePropagation\(\)/)
	assert.match(dialog, /event\.target === element/)
	assert.match(dialog, /handle\.close\('dialog-backdrop'\)/)
	assert.match(dialog, /releaseGameKeyboardState\(game\)/)
	assert.match(dialog, /data-kind\^="creative-"/)
	assert.match(dialog, /--world-editor-dialog-accent: #a6f246/)
	assert.match(dialog, /--world-editor-dialog-accent: #e3fd43/)
	assert.match(shell, /createFork\(/)
	assert.match(shell, /createDialogButton\(dialog, 'creativeCreateCopy', true\)/)
	assert.match(shell, /\['input', 'change', 'keyup', 'compositionend'\]/)
	assert.match(shell, /\['keydown', 'paste', 'cut'\]/)
	assert.match(shell, /creativeDialog === dialog && !dialog\.busy/)
	assert.match(shell, /formatTemplate\(i18n\.t\(game, 'creativeCopyNamePreview'\), \{ name: creativeName \}\)/)
	assert.match(shell, /formatTemplate\(i18n\.t\(game, 'creativeCopyNeedsSlots'\), \{/)
	const enableDialogStart = shell.indexOf('function openEnableCreativeDialog()')
	const copyDialogStart = shell.indexOf('function openCreateCopyDialog()')
	const disableDialogStart = shell.indexOf('function openDisableCreativeDialog()')
	assert.ok(enableDialogStart >= 0 && copyDialogStart > enableDialogStart)
	assert.ok(disableDialogStart > copyDialogStart)
	const enableDialogSource = shell.slice(enableDialogStart, copyDialogStart)
	const copyDialogSource = shell.slice(copyDialogStart, disableDialogStart)
	assert.doesNotMatch(enableDialogSource, /document\.createElement\('input'\)/)
	assert.match(enableDialogSource, /openCreateCopyDialog\(\)/)
	assert.match(copyDialogSource, /document\.createElement\('input'\)/)
	assert.match(copyDialogSource, /await creative\.createFork\(/)
	assert.match(copyDialogSource, /preview\.textContent = originalName[\s\S]*:\s*''/)
	assert.match(shell, /copy:\s*\{[\s\S]*message: null/)
	assert.match(shell, /else message\.hidden = true/)
	assert.match(shell, /COPY_DIALOG_RETURN_REASONS = new Set\(\[[\s\S]*'copy-dialog-cancelled'[\s\S]*'dialog-escape'[\s\S]*'dialog-backdrop'/)
	assert.match(shell, /kind === 'copy' && COPY_DIALOG_RETURN_REASONS\.has\(closeReason\)/)
	assert.match(shell, /if \(returnToEnable\) openEnableCreativeDialog\(\)/)
	assert.match(shell, /--world-editor-shell-creative: rgba\(166, 242, 70, \.2\)/)
	assert.match(shell, /--world-editor-shell-creative-border: rgba\(166, 242, 70, \.62\)/)
	assert.match(shell, /--world-editor-shell-creative: rgba\(227, 253, 67, \.18\)/)
	assert.match(shell, /box-shadow: 0 0 0 2px color-mix\(in srgb, var\(--world-editor-dialog-accent\) 24%, transparent\)/)
	assert.doesNotMatch(shell, /pollCopyValidation|copyValidationFrame/)
	assert.match(shared, /isWorldEditorInputBlocked/)
	assert.match(input, /shared\.isWorldEditorInputBlocked/)
	assert.match(session, /creativeAvailable/)
	assert.match(session, /modes\.dataset\.columns = creativeAvailable \? '2' : '1'/)
	assert.match(session, /blueprint-modes\[data-columns="2"\]/)
	assert.match(session, /creative-mode-unavailable/)
	assert.match(session, /currentCreative\?\.creativeMode/)
	assert.match(preview, /shared\.isWorldEditorInputBlocked/)
}

function verifyShellTemplateFormatting() {
	const shell = source(SHELL_SOURCE)
	const functionMatch = shell.match(/\n\t\tfunction formatTemplate\(template, values\) \{[\s\S]*?\n\t\t\}/)
	assert.ok(functionMatch, 'editor-shell.js must define its local formatTemplate helper')
	const formatTemplate = vm.runInNewContext('(' + functionMatch[0].trim() + ')', { Object, String })
	assert.equal(
		formatTemplate('将创建：{name}', { name: '测试档创造模式' }),
		'将创建：测试档创造模式'
	)
	assert.equal(
		formatTemplate('至少需要两个空槽；当前有 {count} 个。', { count: 4 }),
		'至少需要两个空槽；当前有 4 个。'
	)
	assert.equal(formatTemplate('保留 {unknown}', {}), '保留 {unknown}')
}

function verifyTranslationContract() {
	const creativeKeys = [
		'creativeModeOn',
		'creativeModeOff',
		'creativeEnableTitle',
		'creativeEnableMessage',
		'creativeOriginalName',
		'creativeCopyNamePreview',
		'creativeNameRequired',
		'creativeCopyUnavailable',
		'creativeCopyNeedsSlots',
		'creativeCopyNameConflict',
		'creativeCopyReady',
		'creativeEnableCurrent',
		'creativeCreateCopy',
		'creativeCopyReloading',
		'creativeCancel',
		'creativeDisableTitle',
		'creativeDisableMessage',
		'creativeDisableConfirm',
		'creativeOperationFailed'
	]
	const i18nSource = source(I18N_SOURCE)
	for (const key of creativeKeys) {
		assert.equal((i18nSource.match(new RegExp('\\b' + key + '\\s*:', 'g')) || []).length, 20)
	}
	let definition = null
	const sandbox = {
		Symbol,
		Object,
		Array,
		Map,
		Set,
		JSON,
		ModLoader: { register(value) { definition = value } }
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(i18nSource, sandbox, { filename: I18N_SOURCE })
	definition.init()
	const i18n = sandbox[I18N_KEY]
	assert.equal(i18n.languages.length, 20)
	for (const language of i18n.languages) {
		for (const key of creativeKeys) {
			assert.notEqual(i18n.t(language, key), key)
		}
	}
	assert.equal(i18n.t('sch', 'creativeModeOn'), '创造模式：开启')
}

Promise.resolve()
	.then(verifyInPlaceAndFork)
	.then(verifyFinalizationFailureBlocksCreativeReadiness)
	.then(verifyIntegrationSources)
	.then(verifyShellTemplateFormatting)
	.then(verifyTranslationContract)
	.then(function () {
		console.log('World Editor 4A-2a verification passed.')
	})
	.catch(function (error) {
		console.error(error)
		process.exitCode = 1
	})
