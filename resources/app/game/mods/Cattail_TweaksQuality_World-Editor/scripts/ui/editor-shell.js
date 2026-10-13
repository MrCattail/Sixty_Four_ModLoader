ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const MOD_ID = api.id
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
		const SHARED_KEY = Symbol.for('cattail.world-editor.shared')
		const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
		const BLUEPRINT_PREVIEW_KEY = Symbol.for('cattail.world-editor.blueprint-preview')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const TOOL_KEY = Symbol.for('cattail.world-editor.tool')
		const PAINT_STATE_KEY = Symbol.for('cattail.world-editor.paint-cube-state')
		const PAINT_UI_KEY = Symbol.for('cattail.world-editor.paint-cube-ui')
		const CREATIVE_KEY = Symbol.for('cattail.world-editor.creative-mode')
		const CREATIVE_ECONOMY_KEY = Symbol.for('cattail.world-editor.creative-economy')
		const DIALOGS_KEY = Symbol.for('cattail.world-editor.dialogs')
		const TOOLBAR_SCROLL_PROBE_KEY = Symbol.for('cattail.world-editor.toolbar-scroll-probe')
		const RESOURCE_HUD_PROBE_KEY = Symbol.for('cattail.world-editor.resource-hud-probe')
		const SAVE_SLOTS_KEY = Symbol.for('cattail.better-uis.save-slots')
		const PALETTE_ROW_CONTROLS_KEY = Symbol('cattail.world-editor.palette-row-controls')
		const PALETTE_LIFECYCLE_KEY = Symbol('cattail.world-editor.palette-lifecycle')
		const SHELL_ID = 'cattail-world-editor-shell'
		const ECONOMY_STATUS_ID = 'cattail-world-editor-economy-status'
		const STYLE_ID = 'cattail-world-editor-shell-style'
		const DIALOG_ID = 'cattail-world-editor-creative-dialog'
		const COPY_DIALOG_RETURN_REASONS = new Set([
			'copy-dialog-cancelled',
			'dialog-escape',
			'dialog-backdrop'
		])
		const UI_SCALE_BASE_WIDTH = 1600
		const UI_SCALE_BASE_HEIGHT = 1000
		const UI_SCALE_MIN = .5
		const TOOLBAR_CHROME_SCALE = 1.08
		const LARGE_TOOLBAR_CONFIG_KEY = 'largeToolbarCards'
		const LARGE_TOOLBAR_SCROLL_RESIDUAL_PROPERTY = '--world-editor-large-toolbar-scroll-residual'
		const LARGE_TOOLBAR_CARD_WIDTH = 120
		const LARGE_TOOLBAR_VISIBLE_LIMIT = 8
		const LARGE_TOOLBAR_SNAP_MS = 400
		const LARGE_TOOLBAR_DECAY_PER_FRAME = .94
		const LARGE_TOOLBAR_STOP_VELOCITY = .01
		const HISTORY_SUCCESS_MS = 3000
		const HISTORY_FAILURE_MS = 6000
		const PAINT_STATUS_EVENT = 'cattail:world-editor-paint-status'
		const PAINT_STATUS_KEYS = new Set([
			'paintCellOccupied',
			'paintStrokeSummary',
			'paintStrokeCancelled',
			'paintStrokeLimit',
			'paintNoChanges',
			'paintBucketPlanning',
			'paintBucketCancelled',
			'paintBucketSummary',
			'paintBucketOpenOrTooLarge',
			'paintGrowSaveFailed',
			'historyBusy',
			'historyNotReady',
			'historyUnavailable',
			'historyPlaneChanged',
			'historySaveChanged',
			'historyExternalChange',
			'historyRolledBack',
			'historyReloadRequired',
			'historyFailed'
		])
		const PAINT_STATUS_KINDS = new Set(['neutral', 'warning', 'error', 'busy', 'terminal'])
		const RESOURCE_HUD_ANIMATION_MS = 180
		const RESOURCE_HUD_MIN_SCALE = .48
		const RESOURCE_HUD_MAX_SCALE = .64
		const RESOURCE_HUD_LEFT_MARGIN_CSS = 20
		const RESOURCE_HUD_TOP_MARGIN_CSS = 16
		const HISTORY_WARNING_CODES = new Set([
			'PLANE_CHANGED',
			'SAVE_CHANGED',
			'SAVE_IDENTITY_UNAVAILABLE',
			'EXTERNAL_CHANGE',
			'ADAPTER_UNAVAILABLE',
			'NOT_READY',
			'INSUFFICIENT_RESOURCES',
			'ECONOMY_MODE_CHANGED',
			'PRICE_CHANGED',
			'PRICE_UNAVAILABLE'
		])
		const HISTORY_ERROR_CODES = new Set([
			'SNAPSHOT_FAILED',
			'SNAPSHOT_UNAVAILABLE',
			'PREFLIGHT_FAILED',
			'APPLY_FAILED',
			'VERIFY_FAILED',
			'INVALIDATED'
		])
		let refreshMountedText = null
		let refreshMountedTheme = null
		let closeMountedPalette = null

		api.on('afterVanillaScripts', function () {
			if (typeof Game === 'undefined' || !Game.prototype || typeof Game.prototype.switchPlane !== 'function') return
			api.patch(Game.prototype, 'switchPlane', function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					if (typeof closeMountedPalette === 'function') closeMountedPalette(this, 'plane-changed')
					if (typeof refreshMountedTheme === 'function') refreshMountedTheme(this)
					return result
				}
			})
		})

		api.on('afterWords', function (words, game) {
			if (typeof refreshMountedText === 'function') refreshMountedText(game)
		})

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const i18n = globalThis[I18N_KEY]
			let shared = globalThis[SHARED_KEY]
			let transactions = globalThis[TRANSACTIONS_KEY]
			const selection = globalThis[SELECTION_KEY]
			const tool = globalThis[TOOL_KEY]
			let paintState = globalThis[PAINT_STATE_KEY]
			let paintUi = globalThis[PAINT_UI_KEY]
			const dialogs = globalThis[DIALOGS_KEY]
			let creative = globalThis[CREATIVE_KEY]
			let creativeEconomy = globalThis[CREATIVE_ECONOMY_KEY]
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Toolbar 2G could not find the editor runtime.')
				return
			}
			if (!i18n || typeof i18n.t !== 'function') {
				console.warn('[Cattail World Editor] Toolbar 2G could not find the editor translations.')
				return
			}
			if (
				!shared ||
				typeof shared.isEditableEvent !== 'function' ||
				typeof shared.isModLoaderPanelBlocking !== 'function'
			) {
				console.warn('[Cattail World Editor] Toolbar 4B-1b could not find shared input guards.')
				shared = unavailableSharedGuards()
			}
			if (
				!transactions ||
				transactions.game !== game ||
				typeof transactions.snapshot !== 'function' ||
				typeof transactions.subscribe !== 'function' ||
				typeof transactions.undo !== 'function' ||
				typeof transactions.redo !== 'function'
			) {
				console.warn('[Cattail World Editor] Toolbar 4B-1b could not find transaction history.')
				transactions = unavailableTransactions(game)
			}
			if (
				!selection ||
				selection.game !== game ||
				typeof selection.subscribe !== 'function'
			) {
				console.warn('[Cattail World Editor] Toolbar 2G could not find the selection state.')
				return
			}
			if (
				!tool ||
				typeof tool.snapshot !== 'function' ||
				typeof tool.subscribe !== 'function' ||
				typeof tool.setMode !== 'function'
			) {
				console.warn('[Cattail World Editor] Toolbar 5C-1 could not find draw-mode state.')
				return
			}
			if (
				!paintState ||
				typeof paintState.defaultRecipe !== 'function' ||
				typeof paintState.normalizeRecipe !== 'function' ||
				typeof paintState.allocateSlots !== 'function'
			) {
				console.warn('[Cattail World Editor] Toolbar 5C-5 could not find paint palette calculations.')
				paintState = unavailablePaintState()
			}
			if (
				!paintUi ||
				paintUi.game !== game ||
				typeof paintUi.snapshot !== 'function' ||
				typeof paintUi.subscribe !== 'function' ||
				typeof paintUi.setSubtool !== 'function' ||
				typeof paintUi.setCubeMode !== 'function' ||
				typeof paintUi.setRecipe !== 'function' ||
				typeof paintUi.setPaletteOpen !== 'function'
			) {
				console.warn('[Cattail World Editor] Toolbar 5C-4 could not find Brush/Eraser state.')
				paintUi = unavailablePaintUi(game)
			}
			if (!dialogs || dialogs.game !== game || typeof dialogs.create !== 'function') {
				console.warn('[Cattail World Editor] Toolbar 4B-1a could not find the shared dialog service.')
				return
			}
			if (!creative || creative.game !== game || typeof creative.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Toolbar 4A-2a could not find creative mode state.')
				creative = unavailableCreativeController(game)
			}
			if (!creativeEconomy || creativeEconomy.game !== game || typeof creativeEconomy.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Toolbar 4A-2b could not find creative economy state.')
				creativeEconomy = unavailableCreativeEconomy(game)
			}
			if (!api.ui?.hud || typeof api.ui.hud.register !== 'function') {
				console.warn('[Cattail World Editor] Toolbar 2E requires the ModLoader game HUD API.')
				return
			}
			if (
				api.ui?.settings?.version !== 1 ||
				typeof api.ui.settings.createControl !== 'function' ||
				typeof api.ui.settings.scroll?.attach !== 'function'
			) {
				console.warn('[Cattail World Editor] Palette 5C-5 requires the ModLoader Settings UI API v1.')
				return
			}

			document.getElementById(SHELL_ID)?.remove()
			document.getElementById(ECONOMY_STATUS_ID)?.remove()
			const style = ensureStyle()
			const shell = createShell()
			const economyStatus = createEconomyStatus()
			document.body.append(shell, economyStatus)
			const tooltips = shared.createTooltipScope?.()
			const rootStyle = document.documentElement?.style
			const previousScale = readStyleProperty(rootStyle, '--world-editor-ui-scale')
			const previousToolbarWidth = readStyleProperty(rootStyle, '--world-editor-toolbar-layout-width')
			const previousToolbarChromeScale = readStyleProperty(rootStyle, '--world-editor-toolbar-chrome-scale')
			const previousToolbarChromeWidth = readStyleProperty(rootStyle, '--world-editor-toolbar-chrome-layout-width')
			const resourceThemeProperties = createResourceThemeProperties(game)
			const previousResourceThemeProperties = new Map()
			for (const [property, value] of Object.entries(resourceThemeProperties)) {
				previousResourceThemeProperties.set(property, readStyleProperty(rootStyle, property))
				writeStyleProperty(rootStyle, property, value)
			}

			let currentState = runtime.snapshot()
			let currentSelection = selection.snapshot()
			let currentTool = tool.snapshot()
			let currentPaintUi = paintUi.snapshot()
			let currentBlueprintPreview = null
			let currentCreative = creative.snapshot()
			let currentCreativeEconomy = creativeEconomy.snapshot()
			let currentTransactions = transactions.snapshot()
			let gameHudHidden = api.ui.hud.isHidden()
			let vanillaHudHidden = api.ui.isVanillaGameHudHidden(game)
			let creativeDialog = null
			let historyUiBusy = false
			let historyStatusTimer = 0
			let historyStatusState = null
			let blueprintPreview = null
			let stopBlueprintPreviewSubscription = null
			let blueprintPreviewAttachTimer = null
			const removeButton = shell.querySelector('[data-world-editor-action="remove-selection"]')
			const undoButton = shell.querySelector('[data-world-editor-action="undo"]')
			const redoButton = shell.querySelector('[data-world-editor-action="redo"]')
			const historyStatus = shell.querySelector('[data-world-editor-action="history-status"]')
			const creativeButton = shell.querySelector('[data-world-editor-action="creative-mode"]')
			const drawButton = shell.querySelector('[data-world-editor-action="draw-mode"]')
			const brushButton = shell.querySelector('[data-world-editor-action="paint-brush"]')
			const bucketButton = shell.querySelector('[data-world-editor-action="paint-bucket"]')
			const eraserButton = shell.querySelector('[data-world-editor-action="paint-eraser"]')
			const stableButton = shell.querySelector('[data-world-editor-action="paint-stable"]')
			const growButton = shell.querySelector('[data-world-editor-action="paint-grow"]')
			const paletteButton = shell.querySelector('[data-world-editor-action="paint-palette"]') || unavailablePaletteElement()
			const palettePanel = shell.querySelector('[data-world-editor-palette]') || unavailablePaletteElement()
			const paletteLifecycle = palettePanel[PALETTE_LIFECYCLE_KEY]
			const paletteApply = shell.querySelector('[data-world-editor-action="paint-palette-apply"]') || unavailablePaletteElement()
			const paletteCancel = shell.querySelector('[data-world-editor-action="paint-palette-cancel"]') || unavailablePaletteElement()
			const paletteRows = []
			for (let resource = 0; resource < 10; resource += 1) {
				const row = shell.querySelector('[data-world-editor-palette-resource="' + resource + '"]')
				if (row) paletteRows.push(row)
			}
			const actions = (removeButton.parentElement || removeButton.parentNode)?.parentElement ||
				(removeButton.parentElement || removeButton.parentNode)?.parentNode
			const toolbarBar = actions?.parentElement || actions?.parentNode
			const compactStyleButton = shell.querySelector('[data-world-editor-action="toolbar-style-compact"]')
			const largeStyleButton = shell.querySelector('[data-world-editor-action="toolbar-style-cards"]')
			const toolbarScroller = createLargeToolbarScroller(shell, toolbarBar, actions)
			const shellPassThrough = createShellPassThroughController(game, shell)
			const resourceHud = createResourceHudController(game)
			const previousToolbarScrollProbe = globalThis[TOOLBAR_SCROLL_PROBE_KEY]
			globalThis[TOOLBAR_SCROLL_PROBE_KEY] = toolbarScroller.probe
			const previousResourceHudProbe = globalThis[RESOURCE_HUD_PROBE_KEY]
			globalThis[RESOURCE_HUD_PROBE_KEY] = resourceHud.probe
			let largeToolbarCards = api.config?.get?.(LARGE_TOOLBAR_CONFIG_KEY, false) === true
			let paletteDraft = null
			const accessibleText = {
				brand: '',
				mode: '',
				count: '',
				remove: '',
				undo: '',
				redo: '',
				draw: '',
				paintSubtool: '',
				paintCubeMode: '',
				paintPalette: '',
				creative: '',
				exitHint: ''
			}

			const refreshAccessibility = function () {
				shell.setAttribute('aria-label', [
					accessibleText.brand,
					accessibleText.mode,
					accessibleText.count,
					accessibleText.remove,
					accessibleText.undo,
					accessibleText.redo,
					accessibleText.draw,
					accessibleText.paintSubtool,
					accessibleText.paintCubeMode,
					accessibleText.paintPalette,
					accessibleText.creative,
					accessibleText.exitHint
				].filter(Boolean).join('. ') + '.')
			}

			const historyBlockedReason = function (direction) {
				if (historyUiBusy) return 'BUSY'
				const key = direction === 'undo' ? 'undoBlockedReason' : 'redoBlockedReason'
				return String(currentTransactions?.[key] || '') || null
			}

			const historyTextKey = function (code, direction) {
				const normalized = String(code || '').toUpperCase()
				if (normalized === 'NO_UNDO') return 'historyNoUndo'
				if (normalized === 'NO_REDO') return 'historyNoRedo'
				if (normalized === 'BUSY') return 'historyBusy'
				if (normalized === 'NOT_READY') return 'historyNotReady'
				if (normalized === 'ADAPTER_UNAVAILABLE') return 'historyUnavailable'
				if (normalized === 'PLANE_CHANGED') return 'historyPlaneChanged'
				if (normalized === 'SAVE_CHANGED' || normalized === 'SAVE_IDENTITY_UNAVAILABLE') return 'historySaveChanged'
				if (
					normalized === 'EXTERNAL_CHANGE' ||
					normalized === 'ECONOMY_MODE_CHANGED' ||
					normalized === 'PRICE_CHANGED' ||
					normalized === 'PRICE_UNAVAILABLE'
				) return 'historyExternalChange'
				if (normalized === 'INSUFFICIENT_RESOURCES') return 'historyInsufficientResources'
				if (normalized === 'ROLLBACK_FAILED') return 'historyReloadRequired'
				if (HISTORY_ERROR_CODES.has(normalized)) return 'historyFailed'
				return 'historyFailed'
			}

			const historyStatusKind = function (code) {
				const normalized = String(code || '').toUpperCase()
				if (normalized === 'NO_UNDO' || normalized === 'NO_REDO') return 'neutral'
				if (normalized === 'BUSY') return 'busy'
				if (normalized === 'ROLLBACK_FAILED' || currentTransactions?.terminalBlockedReason) return 'terminal'
				if (HISTORY_WARNING_CODES.has(normalized)) return 'warning'
				return 'error'
			}

			const renderHistoryStatus = function (languageGame) {
				if (!historyStatusState) return
				const text = formatStatusText(
					i18n.t(languageGame || game, historyStatusState.key),
					historyStatusState.values
				)
				historyStatus.textContent = text
				historyStatus.title = text
				historyStatus.dataset.active = 'true'
				historyStatus.dataset.kind = historyStatusState.kind
			}

			const clearHistoryStatus = function (force) {
				if (historyStatusState?.persistent && !force) return false
				if (historyStatusTimer) clearTimeout(historyStatusTimer)
				historyStatusTimer = 0
				historyStatusState = null
				historyStatus.textContent = ''
				historyStatus.title = ''
				historyStatus.dataset.active = 'false'
				historyStatus.dataset.kind = 'neutral'
				return true
			}

			const showHistoryStatus = function (key, kind, duration, persistent, values) {
				if (historyStatusTimer) clearTimeout(historyStatusTimer)
				historyStatusTimer = 0
				historyStatusState = {
					key: String(key || 'historyFailed'),
					kind: String(kind || 'neutral'),
					persistent: persistent === true,
					values: normalizeStatusValues(values)
				}
				renderHistoryStatus(game)
				if (!historyStatusState.persistent && Number(duration) > 0) {
					historyStatusTimer = setTimeout(function () {
						historyStatusTimer = 0
						clearHistoryStatus()
					}, Number(duration))
				}
			}

			const handlePaintStatus = function (event) {
				const detail = event?.detail
				const key = String(detail?.key || '')
				const kind = String(detail?.kind || '')
				if (!PAINT_STATUS_KEYS.has(key) || !PAINT_STATUS_KINDS.has(kind)) return
				const persistent = detail?.persistent === true && (key === 'historyReloadRequired' || key === 'paintGrowSaveFailed')
				const duration = persistent ? 0 : Math.min(60000, Math.max(0, Number(detail?.duration) || 0))
				showHistoryStatus(key, kind, duration, persistent, detail?.values)
			}

			const normalizeStatusValues = function (value) {
				if (!value || typeof value !== 'object') return Object.freeze({})
				const result = {}
				for (const key of ['painted', 'replaced', 'erased', 'skipped', 'limit', 'count', 'region']) {
					const number = Number(value[key])
					result[key] = Number.isInteger(number) && number >= 0 ? Math.min(1000000, number) : 0
				}
				result.cell = String(value.cell || '?').replace(/[\u0000-\u001f]/g, '').slice(0, 80) || '?'
				result.code = String(value.code || '').replace(/[^A-Z0-9_-]/gi, '').slice(0, 48)
				return Object.freeze(result)
			}

			const formatStatusText = function (value, replacements) {
				const source = String(value || '')
				const safe = replacements && typeof replacements === 'object' ? replacements : {}
				return source.replace(/\{(painted|replaced|erased|skipped|limit|count|region|cell|code)\}/g, function (match, key) {
					return ['cell', 'code'].includes(key)
						? String(safe[key] || (key === 'cell' ? '?' : ''))
						: String(Number.isInteger(safe[key]) ? safe[key] : 0)
				})
			}

			const showHistoryCode = function (code, direction) {
				const kind = historyStatusKind(code)
				showHistoryStatus(
					historyTextKey(code, direction),
					kind,
					kind === 'busy' || kind === 'terminal' ? 0 : HISTORY_FAILURE_MS,
					kind === 'terminal'
				)
			}

			const refreshHistory = function (languageGame) {
				const source = languageGame || game
				const definitions = [
					{
						button: undoButton,
						direction: 'undo',
						labelKey: 'historyUndo',
						cardKey: 'toolbarCardUndo',
						shortcut: 'Ctrl+Z'
					},
					{
						button: redoButton,
						direction: 'redo',
						labelKey: 'historyRedo',
						cardKey: 'toolbarCardRedo',
						shortcut: 'Ctrl+Y / Ctrl+Shift+Z'
					}
				]
				for (const definition of definitions) {
					const label = i18n.t(source, definition.labelKey)
					const reason = historyBlockedReason(definition.direction)
					const reasonText = reason ? i18n.t(source, historyTextKey(reason, definition.direction)) : ''
					const accessibleLabel = label + ' (' + definition.shortcut + ')' + (reasonText ? ' — ' + reasonText : '')
					definition.button.disabled = false
					definition.button.setAttribute('aria-disabled', reason ? 'true' : 'false')
					definition.button.dataset.worldEditorToolbarBusy = reason === 'BUSY' ? 'true' : 'false'
					definition.button.dataset.historyBlockedReason = reason || ''
					definition.button.setAttribute('aria-label', accessibleLabel)
					tooltips?.set(definition.button, accessibleLabel)
					setCardText(definition.button, i18n.t(source, definition.cardKey))
					accessibleText[definition.direction] = accessibleLabel
				}
				toolbarScroller.refresh('history')
				refreshAccessibility()
			}

			const recipeWeights = function (recipe) {
				const values = new Array(Number(paintState.resourceCount) || 10).fill(0)
				for (const entry of recipe?.weights || []) {
					const resource = Number(entry?.resource)
					const weight = Number(entry?.weight)
					if (Number.isInteger(resource) && resource >= 0 && resource < values.length && Number.isInteger(weight)) {
						values[resource] = Math.min(100, Math.max(0, weight))
					}
				}
				return values
			}

			const draftRecipe = function () {
				if (!Array.isArray(paletteDraft)) return null
				return paintState.normalizeRecipe(paletteDraft.map(function (weight, resource) {
					return { resource, weight }
				}))
			}

			const resourceName = function (index) {
				try {
					const pronounced = game.pronounce?.('resources', index)
					if (pronounced && String(pronounced) !== String(index)) return String(pronounced)
				} catch (error) {}
				return String(game.codex?.resources?.[index]?.name || ('Resource ' + (index + 1)))
			}

			const resourceSwatch = function (index) {
				const triplet = game.codex?.resources?.[index]?.triplet
				return Array.isArray(triplet) && triplet.length
					? 'linear-gradient(135deg, ' + triplet.join(', ') + ')'
					: 'rgba(255, 255, 255, .2)'
			}

			const formatRecipePercent = function (weight, total) {
				if (!total) return '0%'
				const value = weight * 100 / total
				return (Math.round(value * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 }) + '%'
			}

			const renderPaintPalette = function (languageGame, activeWeightResource) {
				const source = languageGame || game
				const values = Array.isArray(paletteDraft)
					? paletteDraft
					: recipeWeights(currentPaintUi?.recipe || paintState.defaultRecipe())
				const recipe = paintState.normalizeRecipe(values.map(function (weight, resource) {
					return { resource, weight }
				}))
				const total = values.reduce(function (sum, weight) { return sum + weight }, 0)
				const slots = recipe ? paintState.allocateSlots(recipe) : new Array(values.length).fill(0)
				for (const row of paletteRows) {
					const resource = Number(row.dataset.worldEditorPaletteResource)
					const weight = values[resource] || 0
					const controls = row[PALETTE_ROW_CONTROLS_KEY]
					const swatch = row.querySelector('[data-world-editor-palette-swatch]')
					const name = row.querySelector('[data-world-editor-palette-name]')
					const normalized = row.querySelector('[data-world-editor-palette-normalized]')
					const slotValue = row.querySelector('[data-world-editor-palette-slots]')
					if (swatch) swatch.style.background = resourceSwatch(resource)
					const localizedResourceName = resourceName(resource)
					if (name) name.textContent = localizedResourceName
					if (resource !== activeWeightResource) controls?.weight?.setValue?.(weight)
					controls?.weight?.input?.setAttribute?.('aria-label', localizedResourceName + ' ' + i18n.t(source, 'paintPaletteWeight'))
					if (normalized) normalized.textContent = formatRecipePercent(weight, total)
					if (slotValue) {
						const slotText = String(slots?.[resource] || 0) + '/64'
						slotValue.textContent = slotText
						slotValue.setAttribute('aria-label', localizedResourceName + ' ' + i18n.t(source, 'paintPaletteSlots') + ': ' + slotText)
					}
				}
				paletteApply.disabled = !recipe
			}

			const closePaintPalette = function (reason) {
				const wasOpen = palettePanel.hidden === false || currentPaintUi?.paletteOpen === true
				palettePanel.hidden = true
				palettePanel.dataset.open = 'false'
				paletteButton.dataset.active = 'false'
				paletteButton.setAttribute('aria-pressed', 'false')
				paletteButton.setAttribute('aria-expanded', 'false')
				paletteDraft = null
				if (currentPaintUi?.paletteOpen === true) paintUi.setPaletteOpen(false, reason || 'palette-cancelled')
				return wasOpen
			}

			const openPaintPalette = function () {
				if (paletteButton.hidden || paletteButton.disabled || currentPaintUi?.ready === false) return false
				paletteDraft = recipeWeights(currentPaintUi?.recipe || paintState.defaultRecipe())
				paintUi.setPaletteOpen(true, 'toolbar-palette-open')
				palettePanel.hidden = false
				palettePanel.dataset.open = 'true'
				paletteButton.dataset.active = 'true'
				paletteButton.setAttribute('aria-pressed', 'true')
				paletteButton.setAttribute('aria-expanded', 'true')
				renderPaintPalette(game)
				palettePanel.querySelector('[data-world-editor-palette-weight] .modloader-config-slider-number')?.focus?.()
				return true
			}

			const applyPaintPalette = function () {
				const recipe = draftRecipe()
				if (!recipe || !paintUi.setRecipe(recipe, 'palette-apply')) return false
				closePaintPalette('palette-applied')
				return true
			}

			const refreshPaintPaletteText = function (languageGame) {
				const source = languageGame || game
				palettePanel.querySelector('[data-world-editor-palette-title]').textContent = i18n.t(source, 'paintPaletteTitle')
				for (const key of ['resource', 'weight', 'normalized', 'slots']) {
					const node = palettePanel.querySelector('[data-world-editor-palette-heading="' + key + '"]')
					if (node) node.textContent = i18n.t(source, 'paintPalette' + key[0].toUpperCase() + key.slice(1))
				}
				paletteApply.textContent = i18n.t(source, 'paintPaletteApply')
				paletteCancel.textContent = i18n.t(source, 'paintPaletteCancel')
				renderPaintPalette(source)
			}

			const mountedPaletteCloser = function (changedGame, reason) {
				if (changedGame === game) closePaintPalette(reason || 'external-change')
			}
			closeMountedPalette = mountedPaletteCloser

			const refreshText = function (languageGame) {
				const source = languageGame || game
				const brand = i18n.t(source, 'brand')
				shell.querySelector('[data-world-editor-text="brand"]').textContent = brand
				const removeText = i18n.t(source, 'removeSelection')
				removeButton.setAttribute('aria-label', removeText)
				tooltips?.set(removeButton, removeText)
				setCardText(removeButton, i18n.t(source, 'toolbarCardRemove'))
				const drawText = i18n.t(source, 'drawMode')
				drawButton.querySelector('[data-world-editor-text="draw-mode"]').textContent = drawText
				drawButton.setAttribute('aria-label', drawText)
				tooltips?.set(drawButton, drawText)
				setCardText(drawButton, i18n.t(source, 'toolbarCardDraw'))
				const brushText = i18n.t(source, 'paintBrush')
				brushButton.setAttribute('aria-label', brushText)
				tooltips?.set(brushButton, brushText)
				setCardText(brushButton, i18n.t(source, 'toolbarCardPaintBrush'))
				const bucketText = i18n.t(source, 'paintBucket')
				bucketButton.setAttribute('aria-label', bucketText)
				tooltips?.set(bucketButton, bucketText)
				setCardText(bucketButton, i18n.t(source, 'toolbarCardPaintBucket'))
				const eraserText = i18n.t(source, 'paintEraser')
				eraserButton.setAttribute('aria-label', eraserText)
				tooltips?.set(eraserButton, eraserText)
				setCardText(eraserButton, i18n.t(source, 'toolbarCardPaintEraser'))
				const stableText = i18n.t(source, 'paintStable')
				stableButton.setAttribute('aria-label', stableText)
				tooltips?.set(stableButton, stableText)
				setCardText(stableButton, i18n.t(source, 'toolbarCardPaintStable'))
				const growText = i18n.t(source, 'paintGrow')
				growButton.setAttribute('aria-label', growText)
				tooltips?.set(growButton, growText)
				setCardText(growButton, i18n.t(source, 'toolbarCardPaintGrow'))
				const paletteText = i18n.t(source, 'paintPalette')
				paletteButton.setAttribute('aria-label', paletteText)
				tooltips?.set(paletteButton, paletteText)
				setCardText(paletteButton, i18n.t(source, 'toolbarCardPaintPalette'))
				refreshPaintPaletteText(source)
				setCardText(creativeButton, i18n.t(source, 'toolbarCardCreative'))
				const compactStyleText = i18n.t(source, 'toolbarStyleCompact')
				const largeStyleText = i18n.t(source, 'toolbarStyleLargeCards')
				compactStyleButton.setAttribute('aria-label', compactStyleText)
				tooltips?.set(compactStyleButton, compactStyleText)
				largeStyleButton.setAttribute('aria-label', largeStyleText)
				tooltips?.set(largeStyleButton, largeStyleText)
				accessibleText.brand = brand
				accessibleText.remove = removeText
				accessibleText.draw = drawText
				accessibleText.paintPalette = paletteText
				refreshHistory(source)
				renderHistoryStatus(source)
				refreshCreative(source)
				refreshEconomyStatus(source)
				refreshTool(source)
				refreshHint(source)
				refreshSelectionCount(source)
				refreshAccessibility()
				resourceHud.refreshLayout('text')
			}

			const refreshTool = function (languageGame) {
				const source = languageGame || game
				const hasVisibleBlueprintPreview = !!(
					currentBlueprintPreview?.active &&
					!currentBlueprintPreview?.paused &&
					currentBlueprintPreview?.target &&
					currentBlueprintPreview?.blueprint
				)
				const blueprintMode = currentBlueprintPreview?.blueprint?.mode === 'full' ? 'full' : 'structure'
				if (hasVisibleBlueprintPreview && currentTool?.mode === 'draw') {
					tool.setMode('select', 'blueprint-preview-active')
					currentTool = tool.snapshot()
				}
				const modeKey = hasVisibleBlueprintPreview
					? blueprintMode === 'full' ? 'blueprintModeFull' : 'blueprintModeStructure'
					: currentTool?.mode === 'draw' ? 'drawMode' : 'toolbarModeArea'
				const mode = i18n.t(source, modeKey)
				const modeElement = shell.querySelector('[data-world-editor-text="mode"]')
				shell.dataset.mode = hasVisibleBlueprintPreview ? 'blueprint-' + blueprintMode : currentTool?.mode === 'draw' ? 'draw' : 'select'
				modeElement.textContent = mode
				modeElement.dataset.creative = currentCreative?.ready && currentCreative?.creativeMode ? 'true' : 'false'
				accessibleText.mode = mode
				const drawActive = !hasVisibleBlueprintPreview && currentTool?.mode === 'draw'
				drawButton.dataset.active = drawActive ? 'true' : 'false'
				drawButton.setAttribute('aria-pressed', drawActive ? 'true' : 'false')
				drawButton.disabled = hasVisibleBlueprintPreview || !currentState?.active
				const showPaintSubtools = drawActive && !game.plane && !!currentState?.active && currentPaintUi?.ready !== false
				const activeSubtool = currentPaintUi?.subtool === 'eraser'
					? 'eraser'
					: currentPaintUi?.subtool === 'bucket' ? 'bucket' : 'brush'
				const activeCubeMode = currentPaintUi?.cubeMode === 'grow' ? 'grow' : 'stable'
				const growAvailable = currentPaintUi?.growAvailable === true
				if (!showPaintSubtools && currentPaintUi?.paletteOpen === true) closePaintPalette('draw-unavailable')
				brushButton.hidden = !showPaintSubtools
				bucketButton.hidden = !showPaintSubtools
				eraserButton.hidden = !showPaintSubtools
				stableButton.hidden = !showPaintSubtools
				growButton.hidden = !showPaintSubtools || !growAvailable
				paletteButton.hidden = !showPaintSubtools
				brushButton.disabled = !showPaintSubtools
				bucketButton.disabled = !showPaintSubtools
				eraserButton.disabled = !showPaintSubtools
				stableButton.disabled = !showPaintSubtools
				growButton.disabled = !showPaintSubtools || !growAvailable
				paletteButton.disabled = !showPaintSubtools
				brushButton.dataset.active = showPaintSubtools && activeSubtool === 'brush' ? 'true' : 'false'
				bucketButton.dataset.active = showPaintSubtools && activeSubtool === 'bucket' ? 'true' : 'false'
				eraserButton.dataset.active = showPaintSubtools && activeSubtool === 'eraser' ? 'true' : 'false'
				stableButton.dataset.active = showPaintSubtools && activeCubeMode === 'stable' ? 'true' : 'false'
				growButton.dataset.active = showPaintSubtools && growAvailable && activeCubeMode === 'grow' ? 'true' : 'false'
				paletteButton.dataset.active = showPaintSubtools && currentPaintUi?.paletteOpen === true ? 'true' : 'false'
				brushButton.setAttribute('aria-pressed', brushButton.dataset.active)
				bucketButton.setAttribute('aria-pressed', bucketButton.dataset.active)
				eraserButton.setAttribute('aria-pressed', eraserButton.dataset.active)
				stableButton.setAttribute('aria-pressed', stableButton.dataset.active)
				growButton.setAttribute('aria-pressed', growButton.dataset.active)
				paletteButton.setAttribute('aria-pressed', paletteButton.dataset.active)
				paletteButton.setAttribute('aria-expanded', paletteButton.dataset.active)
				brushButton.setAttribute('aria-hidden', showPaintSubtools ? 'false' : 'true')
				bucketButton.setAttribute('aria-hidden', showPaintSubtools ? 'false' : 'true')
				eraserButton.setAttribute('aria-hidden', showPaintSubtools ? 'false' : 'true')
				stableButton.setAttribute('aria-hidden', showPaintSubtools ? 'false' : 'true')
				growButton.setAttribute('aria-hidden', showPaintSubtools && growAvailable ? 'false' : 'true')
				paletteButton.setAttribute('aria-hidden', showPaintSubtools ? 'false' : 'true')
				accessibleText.paintSubtool = showPaintSubtools
					? i18n.t(source, activeSubtool === 'eraser' ? 'paintEraser' : activeSubtool === 'bucket' ? 'paintBucket' : 'paintBrush')
					: ''
				accessibleText.paintCubeMode = showPaintSubtools
					? i18n.t(source, activeCubeMode === 'grow' ? 'paintGrow' : 'paintStable')
					: ''
				toolbarScroller.refresh('draw-mode')
				refreshAccessibility()
			}

			const attachBlueprintPreview = function () {
				blueprintPreviewAttachTimer = null
				const next = globalThis[BLUEPRINT_PREVIEW_KEY]
				if (next === blueprintPreview) return
				if (typeof stopBlueprintPreviewSubscription === 'function') stopBlueprintPreviewSubscription()
				stopBlueprintPreviewSubscription = null
				blueprintPreview = next && typeof next.snapshot === 'function' && typeof next.subscribe === 'function'
					? next
					: null
				currentBlueprintPreview = blueprintPreview ? blueprintPreview.snapshot() : null
				if (blueprintPreview) {
					stopBlueprintPreviewSubscription = blueprintPreview.subscribe(function (state) {
						currentBlueprintPreview = state
						refreshTool(game)
					})
				}
				refreshTool(game)
			}

			const refreshHint = function (languageGame) {
				const source = languageGame || game
				const hint = i18n.t(source, 'exitHint')
				shell.querySelector('[data-world-editor-text="hint"]').textContent = hint
				accessibleText.exitHint = hint
				refreshAccessibility()
			}

			const refreshSelectionCount = function (languageGame) {
				const source = languageGame || game
				const count = Number.isInteger(Number(currentSelection?.selectionCount))
					? Math.max(0, Number(currentSelection.selectionCount))
					: isRange(currentSelection?.previewRange) || isRange(currentSelection?.selectedRange) ? 1 : 0
				const countText = formatCount(i18n.t(source, 'selectionCount'), count)
				shell.querySelector('[data-world-editor-text="selection-count"]').textContent = countText
				const clearAvailable = typeof selection.clear === 'function' && count > 0
				removeButton.disabled = !clearAvailable || isRange(currentSelection?.previewRange)
				removeButton.dataset.worldEditorLargeHidden = clearAvailable ? 'false' : 'true'
				toolbarScroller.refresh('selection')
				accessibleText.count = countText
				refreshAccessibility()
			}

			const refreshTheme = function (themeGame) {
				if (themeGame && themeGame !== game) return
				shell.dataset.theme = game.plane ? 'void' : 'reality'
				economyStatus.dataset.theme = shell.dataset.theme
				creativeDialog?.setTheme?.(shell.dataset.theme)
			}

			const refreshCreative = function (languageGame) {
				const source = languageGame || game
				const active = !!currentCreative?.ready && !!currentCreative?.creativeMode
				const busy = (
					!!currentCreative?.busy ||
					!!currentCreative?.pendingForkFinalization ||
					!!currentCreativeEconomy?.busy
				)
				const label = i18n.t(source, active ? 'creativeModeOn' : 'creativeModeOff')
				creativeButton.querySelector('[data-world-editor-text="creative-mode"]').textContent = label
				creativeButton.dataset.active = active ? 'true' : 'false'
				creativeButton.dataset.creative = active ? 'true' : 'false'
				creativeButton.setAttribute('aria-pressed', active ? 'true' : 'false')
				creativeButton.disabled = !currentCreative?.ready || busy
				creativeButton.dataset.worldEditorToolbarBusy = busy ? 'true' : 'false'
				creativeButton.dataset.worldEditorLargeHidden = !currentCreative?.ready && !busy ? 'true' : 'false'
				creativeButton.setAttribute('aria-label', label)
				tooltips?.set(creativeButton, currentCreative?.error?.message || label)
				toolbarScroller.refresh('creative')
				accessibleText.creative = label
				refreshCreativeDialogText(source)
				refreshAccessibility()
			}

			const refreshEconomyStatus = function (languageGame) {
				const source = languageGame || game
				const phase = String(currentCreativeEconomy?.phase || 'idle')
				let key = {
					snapshotting: 'creativeEconomySnapshotting',
					revalidating: 'creativeEconomyRevalidating',
					executing: 'creativeEconomyExecuting',
					success: 'creativeEconomySuccess',
					cancelled: 'creativeEconomyCancelled',
					failed: 'creativeEconomyFailed'
				}[phase]
				if (phase === 'failed' && currentCreativeEconomy?.error?.code === 'EXECUTION_FAILED') {
					key = 'creativeEconomyExecutionFailed'
				}
				if (currentCreativeEconomy?.writeBlockedReason) key = 'creativeNativeReloadRequired'
				else if (phase === 'failed' && currentCreativeEconomy?.error?.code === 'NATIVE_CREATIVE_DEFERRED') key = 'creativeNativeDeferred'
				const text = key ? i18n.t(source, key) : ''
				economyStatus.dataset.phase = phase
				economyStatus.dataset.active = key ? 'true' : 'false'
				economyStatus.textContent = currentCreativeEconomy?.lastReason === 'native-tool-result' && currentCreativeEconomy?.error?.message
					? text + ' ' + currentCreativeEconomy.error.message : text
				economyStatus.title = currentCreativeEconomy?.error?.message || text
				economyStatus.setAttribute('role', phase === 'failed' ? 'alert' : 'status')
				economyStatus.setAttribute('aria-live', phase === 'failed' ? 'assertive' : 'polite')
				refreshVisibility()
			}

			const refreshVisibility = function () {
				const editorVisible = !!currentState.active && !game.halt && !game.splash?.isShown && !vanillaHudHidden
				const economyVisible = (
					economyStatus.dataset.active === 'true' &&
					!game.halt &&
					!game.splash?.isShown &&
					!vanillaHudHidden
				)
				shell.dataset.visible = editorVisible ? 'true' : 'false'
				shell.setAttribute('aria-hidden', editorVisible && !gameHudHidden ? 'false' : 'true')
				economyStatus.dataset.visible = economyVisible ? 'true' : 'false'
				economyStatus.setAttribute('aria-hidden', economyVisible && !gameHudHidden ? 'false' : 'true')
			}

			const refreshUiScale = function () {
				const viewport = responsiveViewport(game)
				const viewportWidth = viewport.width
				const viewportHeight = viewport.height
				const scale = Math.min(
					1,
					Math.max(
						UI_SCALE_MIN,
						Math.min(viewportWidth / UI_SCALE_BASE_WIDTH, viewportHeight / UI_SCALE_BASE_HEIGHT)
					)
				)
				const roundedScale = Math.round(scale * 1000) / 1000
				const toolbarChromeScale = roundedScale * TOOLBAR_CHROME_SCALE
				writeStyleProperty(rootStyle, '--world-editor-ui-scale', String(roundedScale))
				writeStyleProperty(rootStyle, '--world-editor-toolbar-chrome-scale', String(TOOLBAR_CHROME_SCALE))
				writeStyleProperty(
					rootStyle,
					'--world-editor-toolbar-layout-width',
					Math.max(0, (viewportWidth - 24) / scale) + 'px'
				)
				writeStyleProperty(
					rootStyle,
					'--world-editor-toolbar-chrome-layout-width',
					Math.max(0, (viewportWidth - 24) / toolbarChromeScale) + 'px'
				)
				shell.dataset.uiScale = String(roundedScale)
				toolbarScroller.refresh('ui-scale')
				resourceHud.refreshLayout('ui-scale')
			}

			const stopStateSubscription = runtime.subscribe(function (state) {
				currentState = state
				if (!state.active) closePaintPalette('editor-inactive')
				if (!state.active && creativeDialog && !currentCreative?.busy) closeCreativeDialog('editor-inactive')
				refreshVisibility()
				refreshTool(game)
				resourceHud.setActive(!!state.active, 'editor-state')
			})

			const stopSelectionSubscription = selection.subscribe(function (state) {
				currentSelection = state
				refreshSelectionCount(game)
				refreshTool(game)
			})
			const stopToolSubscription = tool.subscribe(function (state) {
				currentTool = state
				if (state?.mode !== 'draw') closePaintPalette('draw-mode-left')
				refreshTool(game)
			})
			const stopPaintUiSubscription = paintUi.subscribe(function (state) {
				const previousPaintUi = currentPaintUi
				currentPaintUi = state
				if (state?.paletteOpen === true && previousPaintUi?.subtool !== state?.subtool) {
					closePaintPalette('subtool-changed')
					return
				}
				refreshTool(game)
				if (state?.paletteOpen === true && paletteDraft) renderPaintPalette(game)
			})

			const stopCreativeSubscription = creative.subscribe(function (state) {
				currentCreative = state
				refreshCreative(game)
				refreshTool(game)
			})
			const stopCreativeEconomySubscription = creativeEconomy.subscribe(function (state) {
				currentCreativeEconomy = state
				refreshCreative(game)
				refreshEconomyStatus(game)
			})
			const stopTransactionSubscription = transactions.subscribe(function (state) {
				currentTransactions = state
				refreshHistory(game)
				if (state?.terminalBlockedReason) {
					showHistoryCode(state.terminalBlockedReason)
				} else if (state?.busy && !historyUiBusy) {
					showHistoryCode('BUSY')
				} else if (
					!state?.busy &&
					!historyUiBusy &&
					historyStatusState?.key === 'historyBusy'
				) {
					clearHistoryStatus(true)
				}
			})
			const runHistory = async function (direction, input) {
				const blocked = historyBlockedReason(direction)
				if (blocked) {
					showHistoryCode(blocked, direction)
					return Object.freeze({
						accepted: false,
						executed: false,
						direction,
						reason: blocked
					})
				}
				historyUiBusy = true
				refreshHistory(game)
				showHistoryCode('BUSY', direction)
				let status = null
				let result = null
				try {
					result = await transactions[direction]({ input })
					if (result?.executed === true) {
						let previewRefreshFailed = false
						const preview = globalThis[BLUEPRINT_PREVIEW_KEY]
						try {
							const previewState = typeof preview?.snapshot === 'function' ? preview.snapshot() : null
							if (previewState?.active && typeof preview?.refreshNow === 'function') {
								const refreshedPlan = await preview.refreshNow('transaction-' + direction + '-complete')
								previewRefreshFailed = (
									!refreshedPlan ||
									refreshedPlan?.ok === false ||
									refreshedPlan?.success === false ||
									!!refreshedPlan?.error
								)
							}
						} catch (previewError) {
							previewRefreshFailed = true
							console.warn('[Cattail World Editor] History preview refresh failed.', previewError)
						}
						status = previewRefreshFailed
							? { key: 'historyPreviewRefreshFailed', kind: 'warning', duration: HISTORY_FAILURE_MS }
							: {
								key: direction === 'undo' ? 'historyUndoSuccess' : 'historyRedoSuccess',
								kind: 'success',
								duration: HISTORY_SUCCESS_MS
							}
					} else if (result?.reason === 'rolled-back') {
						status = { key: 'historyRolledBack', kind: 'error', duration: HISTORY_FAILURE_MS }
						console.warn(
							'[Cattail World Editor] History operation rolled back.',
							result?.error?.code || 'UNKNOWN',
							result?.error?.message || ''
						)
					} else {
						const code = String(result?.error?.code || result?.reason || 'UNKNOWN').toUpperCase()
						const kind = historyStatusKind(code)
						status = {
							key: historyTextKey(code, direction),
							kind,
							duration: kind === 'terminal' ? 0 : HISTORY_FAILURE_MS,
							persistent: kind === 'terminal'
						}
						console.warn(
							'[Cattail World Editor] History operation failed.',
							code,
							result?.error?.message || ''
						)
					}
				} catch (operationError) {
					status = { key: 'historyFailed', kind: 'error', duration: HISTORY_FAILURE_MS }
					console.warn(
						'[Cattail World Editor] History operation threw.',
						operationError?.code || 'UNKNOWN',
						operationError?.message || ''
					)
				} finally {
					historyUiBusy = false
					currentTransactions = transactions.snapshot()
					refreshHistory(game)
				}
				if (status) {
					showHistoryStatus(status.key, status.kind, status.duration, status.persistent)
				}
				return result
			}

			const handleUndoClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				void runHistory('undo', event?.detail === 0 ? 'keyboard' : 'mouse')
			}

			const handleRedoClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				void runHistory('redo', event?.detail === 0 ? 'keyboard' : 'mouse')
			}

			const historyShortcutDirection = function (event) {
				if (!event?.ctrlKey || event.altKey || event.metaKey) return null
				const key = String(event.key || '').toLowerCase()
				if (key === 'z' && !event.shiftKey) return 'undo'
				if (key === 'y' && !event.shiftKey) return 'redo'
				if (key === 'z' && event.shiftKey) return 'redo'
				return null
			}

			const handleHistoryKeydown = function (event) {
				const direction = historyShortcutDirection(event)
				if (!direction) return
				if (
					!currentState?.active ||
					game.halt ||
					game.splash?.isShown ||
					event.repeat ||
					event.isComposing ||
					event.keyCode === 229 ||
					shared.isEditableEvent(event) ||
					shared.isModLoaderPanelBlocking() ||
					shared.isWorldEditorInputBlocked?.() ||
					Number(dialogs.snapshot?.().openCount) > 0
				) return
				event.preventDefault()
				event.stopPropagation()
				event.stopImmediatePropagation?.()
				void runHistory(direction, 'keyboard')
			}

			const handleRemoveClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				if (selection.hasPreview()) return
				if (typeof selection.clear === 'function') {
					selection.clear('toolbar-clear-selections')
				}
			}

			const handleCreativeClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				if (!currentCreative?.ready || currentCreative.busy || currentCreativeEconomy?.busy) return
				if (currentCreative.creativeMode) openDisableCreativeDialog()
				else openEnableCreativeDialog()
			}

			const handleDrawClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				if (!currentState?.active || game.halt || game.splash?.isShown || drawButton.disabled) return
				closePaintPalette('draw-mode-toggled')
				const nextMode = currentTool?.mode === 'draw' ? 'select' : 'draw'
				tool.setMode(nextMode, 'toolbar-draw-mode')
			}

			const handleBrushClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				if (brushButton.hidden || brushButton.disabled) return
				closePaintPalette('toolbar-brush')
				paintUi.setSubtool('brush', 'toolbar-brush')
			}

			const handleBucketClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				if (bucketButton.hidden || bucketButton.disabled) return
				closePaintPalette('toolbar-bucket')
				paintUi.setSubtool('bucket', 'toolbar-bucket')
			}

			const handleEraserClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				if (eraserButton.hidden || eraserButton.disabled) return
				closePaintPalette('toolbar-eraser')
				paintUi.setSubtool('eraser', 'toolbar-eraser')
			}

			const handleStableClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				if (stableButton.hidden || stableButton.disabled) return
				closePaintPalette('toolbar-stable')
				paintUi.setCubeMode('stable', 'toolbar-stable')
			}

			const handleGrowClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				if (growButton.hidden || growButton.disabled) return
				closePaintPalette('toolbar-grow')
				paintUi.setCubeMode('grow', 'toolbar-grow')
			}

			const handlePaletteClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				if (paletteButton.hidden || paletteButton.disabled) return
				if (currentPaintUi?.paletteOpen === true) closePaintPalette('toolbar-palette-toggle')
				else openPaintPalette()
			}

			const handlePaletteInput = function (event) {
				const surface = event?.target?.closest?.('[data-world-editor-palette-weight]')
				const row = surface?.closest?.('[data-world-editor-palette-resource]')
				const resource = Number(row?.dataset?.worldEditorPaletteResource)
				const control = row?.[PALETTE_ROW_CONTROLS_KEY]?.weight
				if (!surface || !control || !Array.isArray(paletteDraft) || !Number.isInteger(resource)) return
				const validation = control.validate?.()
				if (!validation?.valid) return
				const value = Math.min(100, Math.max(0, Math.round(Number(validation.value) || 0)))
				paletteDraft[resource] = value
				renderPaintPalette(game, resource)
			}

			const handlePaletteApply = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				applyPaintPalette()
			}

			const handlePaletteCancel = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				closePaintPalette('palette-cancel')
			}

			const handlePaletteEscape = function (event) {
				if (currentPaintUi?.paletteOpen !== true || String(event?.key || '') !== 'Escape') return
				event.preventDefault()
				event.stopPropagation()
				event.stopImmediatePropagation?.()
				closePaintPalette('palette-escape')
			}

			const handlePaletteOutside = function (event) {
				if (currentPaintUi?.paletteOpen !== true) return
				const target = event?.target
				if (palettePanel.contains(target) || paletteButton.contains(target)) return
				const canvasClick = target === game.canvas
				closePaintPalette('palette-outside')
				if (canvasClick) {
					event.preventDefault()
					event.stopPropagation()
					event.stopImmediatePropagation?.()
				}
			}

			const applyToolbarStyle = function (large, reason) {
				largeToolbarCards = large === true
				shell.dataset.toolbarStyle = largeToolbarCards ? 'cards' : 'compact'
				compactStyleButton.dataset.active = largeToolbarCards ? 'false' : 'true'
				largeStyleButton.dataset.active = largeToolbarCards ? 'true' : 'false'
				compactStyleButton.setAttribute('aria-pressed', largeToolbarCards ? 'false' : 'true')
				largeStyleButton.setAttribute('aria-pressed', largeToolbarCards ? 'true' : 'false')
				toolbarScroller.cancel(reason || 'toolbar-style')
				actions.scrollLeft = 0
				toolbarScroller.refresh(reason || 'toolbar-style')
				resourceHud.refreshLayout(reason || 'toolbar-style')
			}

			const setToolbarStyle = function (large, reason) {
				const value = large === true
				try {
					if (typeof api.config?.set === 'function') api.config.set(LARGE_TOOLBAR_CONFIG_KEY, value)
				} catch (error) {
					console.warn('[Cattail World Editor] Could not save toolbar style.', error)
				}
				applyToolbarStyle(value, reason)
			}

			const handleCompactStyleClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				setToolbarStyle(false, 'toolbar-style-compact')
			}

			const handleLargeStyleClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				setToolbarStyle(true, 'toolbar-style-cards')
			}

			const handleToolbarConfigPreview = function (event) {
				const detail = event?.detail
				if (detail?.modId !== MOD_ID || detail?.key !== LARGE_TOOLBAR_CONFIG_KEY) return
				applyToolbarStyle(detail.value === true, 'config-preview')
			}

			const handleToolbarLayoutChange = function (event) {
				if (event?.detail?.modId && event.detail.modId !== MOD_ID) return
				toolbarScroller.refresh(event?.detail?.reason || 'toolbar-content')
				resourceHud.refreshLayout(event?.detail?.reason || 'toolbar-content')
			}

			function openEnableCreativeDialog() {
				closeCreativeDialog('replace-dialog', true)
				creative.setDialogOpen(true, 'enable-dialog-opened')
				const dialog = createCreativeDialog('enable')
				const enableCurrent = createDialogButton(dialog, 'creativeEnableCurrent', true, 'elmerine')
				const createCopy = createDialogButton(dialog, 'creativeCreateCopy', true)
				if (Array.isArray(game.saveSlots)) {
					createCopy.disabled = true
					const notice = document.createElement('div')
					notice.id = 'world-editor-native-copy-notice'
					createCopy.setAttribute('aria-describedby', notice.id)
					notice.dataset.creativeText = 'creativeNativeCopyDeferred'
					dialog.content.append(notice)
				}
				const cancel = createDialogButton(dialog, 'creativeCancel', false)
				dialog.actions.append(enableCurrent, createCopy, cancel)
				dialog.enableCurrent = enableCurrent
				dialog.createCopy = createCopy
				dialog.cancel = cancel
				creativeDialog = dialog
				enableCurrent.addEventListener('click', async function () {
					if (dialog.busy) return
					setCreativeDialogBusy(dialog, true)
					try {
						await creative.enableInPlace('creative-dialog-current')
						closeCreativeDialog('enable-current-complete', true)
					} catch (operationError) {
						showCreativeDialogError(dialog, operationError)
						setCreativeDialogBusy(dialog, false)
					}
				})
				createCopy.addEventListener('click', function () {
					if (dialog.busy || createCopy.disabled) return
					openCreateCopyDialog()
				})
				cancel.addEventListener('click', function () {
					closeCreativeDialog('enable-dialog-cancelled')
				})
				finishCreativeDialogMount(dialog, enableCurrent)
			}

			function openCreateCopyDialog() {
				closeCreativeDialog('copy-dialog-opened', true)
				creative.setDialogOpen(true, 'copy-dialog-opened')
				const dialog = createCreativeDialog('copy')
				const saveSlots = globalThis[SAVE_SLOTS_KEY]
				let slotsState = saveSlots?.version === 1 && typeof saveSlots.snapshot === 'function'
					? saveSlots.snapshot()
					: null
				const input = document.createElement('input')
				input.type = 'text'
				input.maxLength = 60
				input.className = 'cattail-world-editor-creative-dialog__input'
				input.value = String(slotsState?.source?.name || '').slice(0, 60)
				input.autocomplete = 'off'
				input.spellcheck = false
				input.setAttribute('data-creative-name', '')
				const inputLabel = document.createElement('label')
				inputLabel.className = 'cattail-world-editor-creative-dialog__field'
				const inputLabelText = document.createElement('span')
				inputLabelText.dataset.creativeText = 'creativeOriginalName'
				inputLabel.append(inputLabelText, input)
				const preview = document.createElement('div')
				preview.className = 'cattail-world-editor-creative-dialog__preview'
				const copyStatus = document.createElement('div')
				copyStatus.className = 'cattail-world-editor-creative-dialog__status'
				dialog.content.append(inputLabel, preview, copyStatus)

				const createCopy = createDialogButton(dialog, 'creativeCreateCopy', true)
				const cancel = createDialogButton(dialog, 'creativeCancel', false)
				dialog.actions.append(createCopy, cancel)
				dialog.input = input
				dialog.preview = preview
				dialog.copyStatus = copyStatus
				dialog.createCopy = createCopy
				dialog.cancel = cancel
				creativeDialog = dialog

				const validateCopy = function () {
					if (saveSlots?.version === 1 && typeof saveSlots.snapshot === 'function') {
						slotsState = saveSlots.snapshot()
					}
					const originalName = input.value.trim()
					const creativeName = originalName + '创造模式'
					preview.textContent = originalName
						? formatTemplate(i18n.t(game, 'creativeCopyNamePreview'), { name: creativeName })
						: ''
					let statusKey = 'creativeCopyReady'
					let available = true
					if (!originalName || originalName.length > 60 || /[\u0000-\u001f\u007f]/.test(originalName)) {
						statusKey = 'creativeNameRequired'
						available = false
					} else if (!slotsState?.ready || typeof saveSlots?.createAndActivate !== 'function') {
						statusKey = 'creativeCopyUnavailable'
						available = false
					} else if (Number(slotsState.emptyCount) < 1) {
						copyStatus.textContent = formatTemplate(i18n.t(game, 'creativeCopyNeedsSlots'), {
							count: Number(slotsState.emptyCount) || 0
						})
						createCopy.disabled = true
						return
					} else if (slotsState.slots?.some?.(function (slot) {
						return slot?.occupied && slot.name === creativeName
					})) {
						statusKey = 'creativeCopyNameConflict'
						available = false
					}
					copyStatus.textContent = i18n.t(game, statusKey)
					createCopy.disabled = !available || dialog.busy
				}

				const scheduleCopyValidation = function () {
					setTimeout(function () {
						if (creativeDialog === dialog && !dialog.busy) validateCopy()
					}, 0)
				}
				for (const type of ['input', 'change', 'keyup', 'compositionend']) {
					input.addEventListener(type, validateCopy)
				}
				for (const type of ['keydown', 'paste', 'cut']) {
					input.addEventListener(type, scheduleCopyValidation)
				}
				input.addEventListener('keydown', function (event) {
					if (event.key === 'Enter') event.preventDefault()
				})
				createCopy.addEventListener('click', async function () {
					if (dialog.busy || createCopy.disabled) return
					setCreativeDialogBusy(dialog, true)
					try {
						await creative.createFork({
							originalName: input.value,
							reason: 'creative-dialog-copy'
						})
						copyStatus.textContent = i18n.t(game, 'creativeCopyReloading')
					} catch (operationError) {
						showCreativeDialogError(dialog, operationError)
						setCreativeDialogBusy(dialog, false)
						validateCopy()
					}
				})
				cancel.addEventListener('click', function () {
					closeCreativeDialog('copy-dialog-cancelled')
				})
				finishCreativeDialogMount(dialog, input)
				validateCopy()
				setTimeout(function () { input.focus(); input.select() }, 0)
			}

			function openDisableCreativeDialog() {
				closeCreativeDialog('replace-dialog', true)
				creative.setDialogOpen(true, 'disable-dialog-opened')
				const dialog = createCreativeDialog('disable')
				const confirm = createDialogButton(dialog, 'creativeDisableConfirm', true)
				const cancel = createDialogButton(dialog, 'creativeCancel', false)
				dialog.actions.append(confirm, cancel)
				dialog.confirm = confirm
				dialog.cancel = cancel
				creativeDialog = dialog
				confirm.addEventListener('click', async function () {
					if (dialog.busy) return
					setCreativeDialogBusy(dialog, true)
					try {
						await creative.disable('creative-dialog-disable')
						closeCreativeDialog('disable-complete', true)
					} catch (operationError) {
						showCreativeDialogError(dialog, operationError)
						setCreativeDialogBusy(dialog, false)
					}
				})
				cancel.addEventListener('click', function () {
					closeCreativeDialog('disable-dialog-cancelled')
				})
				finishCreativeDialogMount(dialog)
				setTimeout(function () { cancel.focus() }, 0)
			}

			function createCreativeDialog(kind) {
				const textKeys = {
					enable: {
						title: 'creativeEnableTitle',
						message: Array.isArray(game.saveSlots) ? 'creativeNativeEnableMessage' : 'creativeEnableMessage'
					},
					copy: {
						title: 'creativeCreateCopy',
						message: null
					},
					disable: {
						title: 'creativeDisableTitle',
						message: 'creativeDisableMessage'
					}
				}[kind] || {
					title: 'creativeEnableTitle',
					message: 'creativeEnableMessage'
				}
				const dialog = dialogs.create({
					id: DIALOG_ID,
					theme: shell.dataset.theme,
					kind: 'creative-' + kind,
					fallbackFocus: creativeButton,
					onClose(reason, closedDialog) {
						const closeReason = String(reason || 'dialog-closed')
						const returnToEnable = kind === 'copy' && COPY_DIALOG_RETURN_REASONS.has(closeReason)
						if (creativeDialog === closedDialog) creativeDialog = null
						creative.setDialogOpen(false, closeReason)
						if (returnToEnable) openEnableCreativeDialog()
					}
				})
				dialog.element.classList.add('cattail-world-editor-creative-dialog')
				const title = dialog.title
				title.dataset.creativeText = textKeys.title
				const message = dialog.message
				if (textKeys.message) message.dataset.creativeText = textKeys.message
				else message.hidden = true
				dialog.kind = kind
				return dialog
			}

			function createDialogButton(dialog, textKey, primary, glassTheme) {
				const button = dialog.createButton('', { primary })
				button.dataset.creativeText = textKey
				if (glassTheme) button.dataset.glassTheme = glassTheme
				return button
			}

			function finishCreativeDialogMount(dialog, focusTarget) {
				dialog.mount(focusTarget)
				refreshCreativeDialogText(game)
			}

			function refreshCreativeDialogText(languageGame) {
				if (!creativeDialog?.element) return
				const source = languageGame || game
				for (const node of creativeDialog.element.querySelectorAll('[data-creative-text]')) {
					node.textContent = i18n.t(source, node.dataset.creativeText)
				}
			}

			function setCreativeDialogBusy(dialog, busy) {
				dialog.setBusy(busy)
			}

			function showCreativeDialogError(dialog, operationError) {
				const key = ['ROLLBACK_FAILED', 'SAVE_CONTEXT_CHANGED'].includes(operationError?.code)
					? 'creativeNativeReloadRequired'
					: operationError?.code === 'NATIVE_CREATIVE_DEFERRED' ? 'creativeNativeCopyDeferred' : null
				dialog.showError(key ? i18n.t(game, key) : operationError?.message || i18n.t(game, 'creativeOperationFailed'))
			}

			function closeCreativeDialog(reason, force) {
				const dialog = creativeDialog
				if (!dialog || (dialog.busy && !force)) return false
				return dialog.close(reason || 'dialog-closed', force)
			}

			removeButton.addEventListener('click', handleRemoveClick)
			undoButton.addEventListener('click', handleUndoClick)
			redoButton.addEventListener('click', handleRedoClick)
			drawButton.addEventListener('click', handleDrawClick)
			brushButton.addEventListener('click', handleBrushClick)
			bucketButton.addEventListener('click', handleBucketClick)
			eraserButton.addEventListener('click', handleEraserClick)
			stableButton.addEventListener('click', handleStableClick)
			growButton.addEventListener('click', handleGrowClick)
			paletteButton.addEventListener('click', handlePaletteClick)
			palettePanel.addEventListener('input', handlePaletteInput)
			palettePanel.addEventListener('change', handlePaletteInput)
			paletteApply.addEventListener('click', handlePaletteApply)
			paletteCancel.addEventListener('click', handlePaletteCancel)
			creativeButton.addEventListener('click', handleCreativeClick)
			compactStyleButton.addEventListener('click', handleCompactStyleClick)
			largeStyleButton.addEventListener('click', handleLargeStyleClick)

			const handleGameHud = function (event) {
				if (event?.detail?.game && event.detail.game !== game) return
				gameHudHidden = !!event?.detail?.hidden
				refreshVisibility()
			}

			const handleVanillaGameHud = function (event) {
				if (event?.detail?.game && event.detail.game !== game) return
				vanillaHudHidden = !!event?.detail?.hidden
				refreshVisibility()
			}

			window.addEventListener('modloader:game-hud', handleGameHud)
			window.addEventListener('modloader:vanilla-game-hud', handleVanillaGameHud)
			window.addEventListener('modloader:config-preview', handleToolbarConfigPreview)
			window.addEventListener('cattail:world-editor-toolbar-layout', handleToolbarLayoutChange)
			window.addEventListener(PAINT_STATUS_EVENT, handlePaintStatus)
			window.addEventListener('keydown', handleHistoryKeydown, true)
			window.addEventListener('keydown', handlePaletteEscape, true)
			window.addEventListener('mousedown', handlePaletteOutside, true)
			window.addEventListener('resize', refreshUiScale)
			blueprintPreviewAttachTimer = globalThis.setTimeout?.(attachBlueprintPreview, 0) ?? null
			const uiScaleObserver = createUiScaleObserver(game, refreshUiScale)
			const releaseHud = api.ui.hud.register({
				id: 'world-editor-shell',
				element: shell,
				side: 'top'
			})
			const releaseEconomyHud = api.ui.hud.register({
				id: 'world-editor-creative-economy-status',
				element: economyStatus,
				side: 'top'
			})

			refreshMountedText = refreshText
			refreshMountedTheme = refreshTheme
			applyToolbarStyle(largeToolbarCards, 'initial-config')
			refreshText(game)
			refreshSelectionCount(game)
			refreshTheme(game)
			refreshUiScale()
			refreshVisibility()
			resourceHud.setActive(!!currentState.active, 'initial-state')

			runtime.addCleanup(function () {
				tooltips?.dispose()
				if (refreshMountedText === refreshText) refreshMountedText = null
				if (refreshMountedTheme === refreshTheme) refreshMountedTheme = null
				closePaintPalette('shell-cleanup')
				if (closeMountedPalette === mountedPaletteCloser) closeMountedPalette = null
				if (creativeDialog) closeCreativeDialog('shell-cleanup', true)
				window.removeEventListener('modloader:game-hud', handleGameHud)
				window.removeEventListener('modloader:vanilla-game-hud', handleVanillaGameHud)
				window.removeEventListener('modloader:config-preview', handleToolbarConfigPreview)
				window.removeEventListener('cattail:world-editor-toolbar-layout', handleToolbarLayoutChange)
				window.removeEventListener(PAINT_STATUS_EVENT, handlePaintStatus)
				window.removeEventListener('keydown', handleHistoryKeydown, true)
				window.removeEventListener('keydown', handlePaletteEscape, true)
				window.removeEventListener('mousedown', handlePaletteOutside, true)
				window.removeEventListener('resize', refreshUiScale)
				if (historyStatusTimer) clearTimeout(historyStatusTimer)
				historyStatusTimer = 0
				if (blueprintPreviewAttachTimer !== null) globalThis.clearTimeout?.(blueprintPreviewAttachTimer)
				blueprintPreviewAttachTimer = null
				if (typeof stopBlueprintPreviewSubscription === 'function') stopBlueprintPreviewSubscription()
				stopBlueprintPreviewSubscription = null
				blueprintPreview = null
				currentBlueprintPreview = null
				uiScaleObserver?.disconnect?.()
				shellPassThrough.dispose()
				resourceHud.dispose()
				toolbarScroller.dispose()
				if (globalThis[TOOLBAR_SCROLL_PROBE_KEY] === toolbarScroller.probe) {
					if (previousToolbarScrollProbe === undefined) delete globalThis[TOOLBAR_SCROLL_PROBE_KEY]
					else globalThis[TOOLBAR_SCROLL_PROBE_KEY] = previousToolbarScrollProbe
				}
				if (globalThis[RESOURCE_HUD_PROBE_KEY] === resourceHud.probe) {
					if (previousResourceHudProbe === undefined) delete globalThis[RESOURCE_HUD_PROBE_KEY]
					else globalThis[RESOURCE_HUD_PROBE_KEY] = previousResourceHudProbe
				}
				if (typeof stopStateSubscription === 'function') stopStateSubscription()
				if (typeof stopSelectionSubscription === 'function') stopSelectionSubscription()
				if (typeof stopToolSubscription === 'function') stopToolSubscription()
				if (typeof stopPaintUiSubscription === 'function') stopPaintUiSubscription()
				if (typeof stopCreativeSubscription === 'function') stopCreativeSubscription()
				if (typeof stopCreativeEconomySubscription === 'function') stopCreativeEconomySubscription()
				if (typeof stopTransactionSubscription === 'function') stopTransactionSubscription()
				removeButton.removeEventListener('click', handleRemoveClick)
				undoButton.removeEventListener('click', handleUndoClick)
				redoButton.removeEventListener('click', handleRedoClick)
				drawButton.removeEventListener('click', handleDrawClick)
				brushButton.removeEventListener('click', handleBrushClick)
				bucketButton.removeEventListener('click', handleBucketClick)
				eraserButton.removeEventListener('click', handleEraserClick)
				stableButton.removeEventListener('click', handleStableClick)
				growButton.removeEventListener('click', handleGrowClick)
				paletteButton.removeEventListener('click', handlePaletteClick)
				palettePanel.removeEventListener('input', handlePaletteInput)
				palettePanel.removeEventListener('change', handlePaletteInput)
				paletteApply.removeEventListener('click', handlePaletteApply)
				paletteCancel.removeEventListener('click', handlePaletteCancel)
				paletteLifecycle?.destroy?.()
				creativeButton.removeEventListener('click', handleCreativeClick)
				compactStyleButton.removeEventListener('click', handleCompactStyleClick)
				largeStyleButton.removeEventListener('click', handleLargeStyleClick)
				if (typeof releaseHud === 'function') releaseHud()
				if (typeof releaseEconomyHud === 'function') releaseEconomyHud()
				writeStyleProperty(rootStyle, '--world-editor-ui-scale', previousScale)
				writeStyleProperty(rootStyle, '--world-editor-toolbar-layout-width', previousToolbarWidth)
				writeStyleProperty(rootStyle, '--world-editor-toolbar-chrome-scale', previousToolbarChromeScale)
				writeStyleProperty(rootStyle, '--world-editor-toolbar-chrome-layout-width', previousToolbarChromeWidth)
				for (const [property, value] of previousResourceThemeProperties) {
					writeStyleProperty(rootStyle, property, value)
				}
				shell.remove()
				economyStatus.remove()
				if (style.isConnected && !document.getElementById(SHELL_ID)) style.remove()
			})

			console.info('[Cattail World Editor] Unified toolbar 2G ready.')
		})

		function createShell() {
			const shell = document.createElement('div')
			shell.id = SHELL_ID
			shell.className = 'cattail-world-editor-shell'
			shell.dataset.visible = 'false'
			shell.dataset.theme = 'reality'
			shell.dataset.mode = 'select'
			shell.dataset.toolbarStyle = 'compact'
			shell.setAttribute('role', 'toolbar')
			shell.setAttribute('aria-hidden', 'true')

			const layout = document.createElement('div')
			layout.className = 'cattail-world-editor-shell__layout'
			const statusBar = document.createElement('div')
			statusBar.className = 'cattail-world-editor-shell__status-bar'
			const toolbarBar = document.createElement('div')
			toolbarBar.className = 'cattail-world-editor-shell__toolbar-bar'

			const identity = document.createElement('span')
			identity.className = 'cattail-world-editor-shell__identity'
			const dot = document.createElement('span')
			dot.className = 'cattail-world-editor-shell__dot'
			dot.setAttribute('aria-hidden', 'true')
			const brand = document.createElement('span')
			brand.className = 'cattail-world-editor-shell__brand'
			brand.dataset.worldEditorText = 'brand'
			identity.append(dot, brand)

			const divider = document.createElement('span')
			divider.className = 'cattail-world-editor-shell__divider'
			divider.setAttribute('aria-hidden', 'true')

			const mode = document.createElement('span')
			mode.className = 'cattail-world-editor-shell__mode'
			mode.dataset.worldEditorText = 'mode'

			const count = document.createElement('span')
			count.className = 'cattail-world-editor-shell__count'
			count.dataset.worldEditorText = 'selection-count'

			const status = document.createElement('span')
			status.className = 'cattail-world-editor-shell__status'
			status.append(mode, count)

			const actions = document.createElement('span')
			actions.className = 'cattail-world-editor-shell__actions'
			const removeButton = createIconButton('remove-selection', '', 'remove', '', 'eraser')
			const undoButton = createHistoryButton('undo', '↶')
			const redoButton = createHistoryButton('redo', '↷')
			const drawButton = createToolButton('draw-mode', 'draw-mode', 'draw', '✎')
			drawButton.className += ' cattail-world-editor-shell__tool--draw'
			const brushButton = createIconButton('paint-brush', '', 'paint-brush', '', 'brush')
			const bucketButton = createIconButton('paint-bucket', '', 'paint-bucket', '', 'bucket')
			const eraserButton = createIconButton('paint-eraser', '', 'paint-eraser', '', 'eraser')
			const stableButton = createIconButton('paint-stable', '', 'paint-stable', '', 'stable')
			const growButton = createIconButton('paint-grow', '', 'paint-grow', '', 'grow')
			const paletteButton = createIconButton('paint-palette', '', 'paint-palette', '', 'palette')
			brushButton.dataset.worldEditorDrawSubtool = 'brush'
			bucketButton.dataset.worldEditorDrawSubtool = 'bucket'
			eraserButton.dataset.worldEditorDrawSubtool = 'eraser'
			stableButton.dataset.worldEditorDrawCubeMode = 'stable'
			growButton.dataset.worldEditorDrawCubeMode = 'grow'
			brushButton.dataset.active = 'false'
			bucketButton.dataset.active = 'false'
			eraserButton.dataset.active = 'false'
			brushButton.setAttribute('aria-pressed', 'false')
			bucketButton.setAttribute('aria-pressed', 'false')
			eraserButton.setAttribute('aria-pressed', 'false')
			stableButton.dataset.active = 'true'
			growButton.dataset.active = 'false'
			stableButton.setAttribute('aria-pressed', 'true')
			growButton.setAttribute('aria-pressed', 'false')
			paletteButton.dataset.active = 'false'
			paletteButton.setAttribute('aria-pressed', 'false')
			paletteButton.setAttribute('aria-haspopup', 'dialog')
			paletteButton.setAttribute('aria-expanded', 'false')
			brushButton.hidden = true
			bucketButton.hidden = true
			eraserButton.hidden = true
			stableButton.hidden = true
			growButton.hidden = true
			paletteButton.hidden = true
			const creativeButton = createToolButton('creative-mode', 'creative-mode', 'creative', '✦')
			creativeButton.className += ' cattail-world-editor-shell__tool--creative'
			creativeButton.dataset.active = 'false'
			creativeButton.dataset.creative = 'false'

			const selectionGroup = createToolbarGroup('selection')
			const historyGroup = createToolbarGroup('history')
			const blueprintGroup = createToolbarGroup('blueprint')
			const blueprintLibraryGroup = createToolbarGroup('blueprint-library')
			const transformGroup = createToolbarGroup('transform')
			const drawGroup = createToolbarGroup('draw')
			const creativeGroup = createToolbarGroup('creative')
			historyGroup.dataset.worldEditorSlot = 'history'
			blueprintGroup.dataset.worldEditorSlot = 'blueprint'
			blueprintLibraryGroup.dataset.worldEditorSlot = 'blueprint-library'
			transformGroup.dataset.worldEditorSlot = 'transform'
			drawGroup.dataset.worldEditorSlot = 'draw'
			selectionGroup.append(removeButton)
			historyGroup.append(undoButton, redoButton)
			drawGroup.append(drawButton, brushButton, bucketButton, eraserButton, stableButton, growButton)
			drawGroup.append(paletteButton)
			creativeGroup.append(creativeButton)
			actions.append(selectionGroup, historyGroup, blueprintGroup, blueprintLibraryGroup, transformGroup, drawGroup, creativeGroup)

			const hint = document.createElement('span')
			hint.className = 'cattail-world-editor-shell__hint'
			hint.dataset.worldEditorText = 'hint'

			const toolbarStyleSwitch = document.createElement('span')
			toolbarStyleSwitch.className = 'cattail-world-editor-shell__style-switch'
			toolbarStyleSwitch.setAttribute('role', 'group')
			const compactStyleButton = createToolbarStyleButton('compact', '≡')
			const largeStyleButton = createToolbarStyleButton('cards', '▦')
			toolbarStyleSwitch.append(compactStyleButton, largeStyleButton)

			const historyStatus = document.createElement('div')
			historyStatus.className = 'cattail-world-editor-shell__history-status'
			historyStatus.dataset.worldEditorHistoryStatus = ''
			historyStatus.dataset.worldEditorAction = 'history-status'
			historyStatus.dataset.active = 'false'
			historyStatus.dataset.kind = 'neutral'
			historyStatus.setAttribute('role', 'status')
			historyStatus.setAttribute('aria-live', 'polite')
			historyStatus.setAttribute('aria-atomic', 'true')
			const palettePanel = createPaintPalettePanel()

			statusBar.append(identity, divider, status, hint)
			statusBar.append(toolbarStyleSwitch)
			toolbarBar.append(actions)
			layout.append(statusBar, toolbarBar)
			layout.append(palettePanel)
			layout.append(historyStatus)
			shell.append(layout)
			return shell
		}

		function createPaintPalettePanel() {
			const panel = document.createElement('section')
			panel.className = 'cattail-world-editor-shell__paint-palette'
			panel.dataset.worldEditorPalette = ''
			panel.dataset.open = 'false'
			panel.hidden = true
			panel.setAttribute('role', 'dialog')
			panel.setAttribute('aria-modal', 'false')
			const title = document.createElement('h2')
			title.className = 'cattail-world-editor-shell__paint-palette-title'
			title.dataset.worldEditorPaletteTitle = ''
			panel.setAttribute('aria-labelledby', 'cattail-world-editor-paint-palette-title')
			title.id = 'cattail-world-editor-paint-palette-title'

			const headings = document.createElement('div')
			headings.className = 'cattail-world-editor-shell__paint-palette-headings'
			for (const key of ['resource', 'weight', 'normalized', 'slots']) {
				const heading = document.createElement('span')
				heading.dataset.worldEditorPaletteHeading = key
				headings.append(heading)
			}
			const rows = document.createElement('div')
			rows.className = 'cattail-world-editor-shell__paint-palette-rows'
			const settingsControls = []
			for (let resource = 0; resource < 10; resource += 1) {
				const row = document.createElement('div')
				row.className = 'cattail-world-editor-shell__paint-palette-row'
				row.dataset.worldEditorPaletteResource = String(resource)
				const swatch = document.createElement('span')
				swatch.className = 'cattail-world-editor-shell__paint-palette-swatch'
				swatch.dataset.worldEditorPaletteSwatch = ''
				swatch.setAttribute('aria-hidden', 'true')
				const name = document.createElement('span')
				name.className = 'cattail-world-editor-shell__paint-palette-name'
				name.dataset.worldEditorPaletteName = ''
				const defaultWeight = resource === 0 ? 100 : 0
				const weightControl = api.ui.settings.createControl({
					key: 'paintPaletteWeight' + resource,
					type: 'slider',
					label: 'Paint palette weight',
					default: defaultWeight,
					min: 0,
					max: 100,
					step: 1,
					integer: true
				}, { theme: 'auto', value: defaultWeight })
				weightControl.element.className += ' cattail-world-editor-shell__paint-palette-weight-control'
				weightControl.element.dataset.worldEditorPaletteWeight = ''
				const normalized = document.createElement('span')
				normalized.className = 'cattail-world-editor-shell__paint-palette-value'
				normalized.dataset.worldEditorPaletteNormalized = ''
				const slotValue = document.createElement('span')
				slotValue.className = 'cattail-world-editor-shell__paint-palette-value'
				slotValue.dataset.worldEditorPaletteSlots = ''
				slotValue.textContent = (resource === 0 ? '64' : '0') + '/64'
				row[PALETTE_ROW_CONTROLS_KEY] = Object.freeze({ weight: weightControl })
				settingsControls.push(weightControl)
				row.append(swatch, name, weightControl.element, normalized, slotValue)
				rows.append(row)
			}
			const detachScroll = api.ui.settings.scroll.attach(rows, {
				axis: 'y',
				maxHeight: 'min(360px, calc(100vh - 270px))',
				theme: 'auto',
				inertia: true,
				transient: true
			})

			const actions = document.createElement('div')
			actions.className = 'cattail-world-editor-shell__paint-palette-actions'
			const cancel = document.createElement('button')
			cancel.type = 'button'
			cancel.className = 'cattail-world-editor-shell__paint-palette-action'
			cancel.dataset.worldEditorAction = 'paint-palette-cancel'
			const apply = document.createElement('button')
			apply.type = 'button'
			apply.className = 'cattail-world-editor-shell__paint-palette-action cattail-world-editor-shell__paint-palette-action--primary'
			apply.dataset.worldEditorAction = 'paint-palette-apply'
			actions.append(cancel, apply)
			panel.append(title, headings, rows, actions)
			let destroyed = false
			panel[PALETTE_LIFECYCLE_KEY] = Object.freeze({
				destroy() {
					if (destroyed) return
					destroyed = true
					detachScroll()
					for (const control of settingsControls) control.destroy()
				}
			})
			return panel
		}

		function createToolbarGroup(kind) {
			const group = document.createElement('span')
			group.className = 'cattail-world-editor-shell__group cattail-world-editor-shell__group--' + kind
			group.dataset.worldEditorToolbarGroup = kind
			return group
		}

		function createToolButton(action, textKey, cardKey, cardIcon) {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = 'cattail-world-editor-shell__tool'
			button.dataset.worldEditorAction = action
			button.dataset.worldEditorToolbarCard = ''
			button.dataset.active = 'false'
			button.setAttribute('aria-pressed', 'false')
			const label = document.createElement('span')
			label.className = 'cattail-world-editor-shell__compact-label'
			label.dataset.worldEditorText = textKey
			button.append(label)
			appendCardDecoration(button, cardKey, cardIcon)
			return button
		}

		function createIconButton(action, symbol, cardKey, cardIcon, iconKind) {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = 'cattail-world-editor-shell__tool cattail-world-editor-shell__tool--icon'
			button.dataset.worldEditorAction = action
			button.dataset.worldEditorToolbarCard = ''
			button.disabled = true
			const icon = document.createElement('span')
			icon.className = 'cattail-world-editor-shell__compact-icon'
			if (iconKind) icon.dataset.worldEditorToolbarIcon = iconKind
			icon.setAttribute('aria-hidden', 'true')
			icon.textContent = symbol
			button.append(icon)
			appendCardDecoration(button, cardKey, cardIcon, iconKind)
			return button
		}

		function createHistoryButton(action, symbol) {
			const button = createIconButton(action, symbol, action, symbol)
			button.disabled = false
			button.setAttribute('aria-disabled', 'true')
			button.dataset.historyBlockedReason = action === 'undo' ? 'NO_UNDO' : 'NO_REDO'
			return button
		}

		function appendCardDecoration(button, cardKey, symbol, iconKind) {
			const icon = document.createElement('span')
			icon.className = 'cattail-world-editor-shell__card-icon'
			icon.dataset.cardIcon = cardKey
			if (iconKind) icon.dataset.worldEditorToolbarIcon = iconKind
			icon.setAttribute('aria-hidden', 'true')
			icon.textContent = symbol
			const label = document.createElement('span')
			label.className = 'cattail-world-editor-shell__card-label'
			label.dataset.worldEditorCardText = cardKey
			button.append(icon, label)
		}

		function createToolbarStyleButton(style, symbol) {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = 'cattail-world-editor-shell__style-button'
			button.dataset.worldEditorToolbarStyleAction = style
			button.dataset.worldEditorAction = 'toolbar-style-' + style
			button.dataset.active = style === 'compact' ? 'true' : 'false'
			button.setAttribute('aria-pressed', style === 'compact' ? 'true' : 'false')
			const icon = document.createElement('span')
			icon.setAttribute('aria-hidden', 'true')
			icon.textContent = symbol
			button.append(icon)
			return button
		}

		function setCardText(button, text) {
			const label = button?.querySelector?.('[data-world-editor-card-text]')
			if (label) label.textContent = String(text || '')
		}

		function createLargeToolbarScroller(shell, toolbarBar, actions) {
			const unavailableProbe = Object.freeze({
				version: '2',
				enabled() { return false },
				setEnabled() { return false },
				clear() { return false },
				snapshot() { return Object.freeze([]) },
				analyze() {
					return Object.freeze({
						sampleCount: 0,
						refreshInterruptions: Object.freeze([]),
						nativeDrifts: Object.freeze([]),
						directionReversals: Object.freeze([]),
						hoverChanges: Object.freeze([]),
						suspectedCause: 'scroller-unavailable'
					})
				},
				report() { return this.analyze() }
			})
			if (
				!toolbarBar ||
				!actions ||
				typeof actions.addEventListener !== 'function' ||
				typeof actions.querySelectorAll !== 'function'
			) {
				return Object.freeze({
					probe: unavailableProbe,
					cancel() {},
					refresh() {},
					dispose() { return true }
				})
			}
			let frame = 0
			let velocity = 0
			let lastFrameAt = 0
			let lastInputAt = 0
			let snapStartedAt = 0
			let snapFrom = 0
			let snapTarget = 0
			let disposed = false
			let layoutSignature = ''
			let smoothingReversal = false
			let lastMotionDirection = 0
			let probeEnabled = true
			let probeSequence = 0
			let logicalPosition = Number(actions.scrollLeft) || 0
			let visualResidual = 0
			let lastRequestedPosition = Number(actions.scrollLeft) || 0
			let hoveredCard = ''
			const probeEntries = []
			const PROBE_LIMIT = 480

			function now() {
				return globalThis.performance?.now?.() || Date.now()
			}

			function motionActive() {
				return !!frame || !!snapStartedAt || Math.abs(velocity) > LARGE_TOOLBAR_STOP_VELOCITY
			}

			function motionPhase() {
				if (snapStartedAt) return 'snap'
				if (Math.abs(velocity) > LARGE_TOOLBAR_STOP_VELOCITY) return 'glide'
				if (frame) return 'waiting'
				return 'idle'
			}

			function recordProbe(event, details) {
				if (!probeEnabled) return null
				const entry = Object.freeze(Object.assign({
					sequence: ++probeSequence,
					at: now(),
					event: String(event || 'unknown'),
					phase: motionPhase(),
					position: Number(actions.scrollLeft) || 0,
					logicalPosition,
					visualPosition: logicalPosition,
					visualResidual,
					velocity,
					snapFrom,
					snapTarget,
					maxScroll: maxScroll()
				}, details || {}))
				probeEntries.push(entry)
				if (probeEntries.length > PROBE_LIMIT) {
					probeEntries.splice(0, probeEntries.length - PROBE_LIMIT)
				}
				return entry
			}

			function analyzeProbe() {
				const entries = probeEntries.slice()
				const refreshInterruptions = entries.filter(function (entry) {
					return entry.event === 'refresh' && entry.interrupted === true
				})
				const nativeDrifts = entries.filter(function (entry) {
					return entry.event === 'scroll-event' && Math.abs(Number(entry.drift) || 0) > .5
				})
				const hoverChanges = entries.filter(function (entry) {
					return entry.event === 'hover-change'
				})
				const directionReversals = []
				let previousPosition = null
				for (const entry of entries) {
					if (
						entry.event === 'wheel-input' ||
						entry.event === 'snap-start' ||
						entry.event === 'refresh'
					) {
						previousPosition = null
						continue
					}
					if (
						entry.event !== 'position' ||
						!entry.delta ||
						!['glide-frame', 'snap-frame'].includes(entry.source)
					) continue
					const direction = Math.sign(entry.delta)
					if (
						previousPosition &&
						previousPosition.phase === entry.phase &&
						previousPosition.direction !== direction
					) {
						directionReversals.push(Object.freeze({
							before: previousPosition.entry,
							after: entry
						}))
					}
					previousPosition = { direction, phase: entry.phase, entry }
				}
				const suspectedCause = refreshInterruptions.length
					? 'refresh-interrupted-motion'
					: nativeDrifts.length
						? 'native-scroll-position-drift'
						: directionReversals.length
							? 'same-phase-direction-reversal'
							: 'no-anomaly-captured'
				return Object.freeze({
					sampleCount: entries.length,
					refreshInterruptions: Object.freeze(refreshInterruptions),
					nativeDrifts: Object.freeze(nativeDrifts),
					directionReversals: Object.freeze(directionReversals),
					hoverChanges: Object.freeze(hoverChanges),
					suspectedCause,
					lastEntry: entries.length ? entries[entries.length - 1] : null
				})
			}

			const probe = Object.freeze({
				version: '2',
				enabled() { return probeEnabled },
				setEnabled(value) {
					probeEnabled = value !== false
					if (probeEnabled) recordProbe('probe-enabled')
					return probeEnabled
				},
				clear() {
					probeEntries.length = 0
					probeSequence = 0
					return true
				},
				snapshot() {
					return Object.freeze(probeEntries.slice())
				},
				analyze: analyzeProbe,
				report() {
					const summary = analyzeProbe()
					console.info('[Cattail World Editor] Toolbar scroll probe:', summary)
					if (typeof console.table === 'function') console.table(probeEntries)
					return summary
				}
			})

			function requestFrame(callback) {
				return globalThis.requestAnimationFrame?.(callback) || globalThis.setTimeout?.(function () {
					callback(now())
				}, 16) || 0
			}

			function cancelFrame(handle) {
				if (!handle) return
				if (typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(handle)
				else globalThis.clearTimeout?.(handle)
			}

			function maxScroll() {
				return Math.max(0, (Number(actions.scrollWidth) || 0) - (Number(actions.clientWidth) || 0))
			}

			function clampScroll(value) {
				return Math.min(maxScroll(), Math.max(0, Number(value) || 0))
			}

			function nearestCardBoundary(value) {
				return clampScroll(Math.round((Number(value) || 0) / LARGE_TOOLBAR_CARD_WIDTH) * LARGE_TOOLBAR_CARD_WIDTH)
			}

			function applyScrollResidual(value) {
				const numeric = Number(value) || 0
				visualResidual = Math.abs(numeric) <= .0001 ? 0 : numeric
				actions.style?.setProperty?.(LARGE_TOOLBAR_SCROLL_RESIDUAL_PROPERTY, visualResidual + 'px')
				return visualResidual
			}

			function syncLogicalPositionFromNative() {
				const current = clampScroll(actions.scrollLeft)
				logicalPosition = current
				lastRequestedPosition = current
				applyScrollResidual(0)
				return current
			}

			function writePosition(value, source, details) {
				const before = Number(actions.scrollLeft) || 0
				const logicalBefore = logicalPosition
				const next = clampScroll(value)
				logicalPosition = next
				lastRequestedPosition = next
				actions.scrollLeft = next
				const applied = Number(actions.scrollLeft) || 0
				lastRequestedPosition = applied
				const residual = applyScrollResidual(applied - next)
				recordProbe('position', Object.assign({
					source: String(source || 'unknown'),
					before,
					requested: next,
					after: applied,
					delta: applied - before,
					quantization: applied - next,
					logicalBefore,
					logicalDelta: next - logicalBefore,
					residual
				}, details || {}))
				return applied
			}

			function updateIndicators() {
				const maximum = maxScroll()
				const current = clampScroll(logicalPosition)
				toolbarBar.dataset.scrollBefore = current > .5 ? 'true' : 'false'
				toolbarBar.dataset.scrollAfter = current < maximum - .5 ? 'true' : 'false'
			}

			function cardAvailable(card) {
				if (!card || card.dataset.worldEditorLargeHidden === 'true') return false
				if (
					card.getAttribute('aria-disabled') === 'true' &&
					card.dataset.worldEditorToolbarBusy !== 'true'
				) return false
				for (let node = card; node && node !== actions; node = node.parentElement) {
					if (node.hidden) return false
				}
				return true
			}

			function cancel(reason) {
				const active = motionActive()
				if (active) {
					recordProbe('cancel', {
						reason: String(reason || 'cancelled'),
						active
					})
				}
				cancelFrame(frame)
				frame = 0
				velocity = 0
				lastFrameAt = 0
				snapStartedAt = 0
				smoothingReversal = false
				lastMotionDirection = 0
				toolbarBar.dataset.scrolling = 'false'
				syncLogicalPositionFromNative()
			}

			function animate(timestamp) {
				frame = 0
				if (disposed || shell.dataset.toolbarStyle !== 'cards') {
					cancel('inactive-style')
					return
				}
				const currentAt = Number(timestamp) || now()
				const deltaTime = Math.min(34, Math.max(1, currentAt - (lastFrameAt || currentAt - 16)))
				lastFrameAt = currentAt
				if (!snapStartedAt && Math.abs(velocity) > LARGE_TOOLBAR_STOP_VELOCITY) {
					const before = logicalPosition
					const next = clampScroll(before + velocity * deltaTime)
					writePosition(next, 'glide-frame', { frameAt: currentAt, deltaTime })
					if (next === 0 || next === maxScroll()) velocity = 0
					else {
						velocity *= Math.pow(LARGE_TOOLBAR_DECAY_PER_FRAME, deltaTime / 16.667)
						if (Math.abs(velocity) <= LARGE_TOOLBAR_STOP_VELOCITY) velocity = 0
					}
					if (!velocity) recordProbe('velocity-zero', { frameAt: currentAt })
					updateIndicators()
					frame = requestFrame(animate)
					return
				}
				if (!snapStartedAt) {
					velocity = 0
					snapStartedAt = currentAt
					snapFrom = clampScroll(logicalPosition)
					snapTarget = nearestCardBoundary(snapFrom)
					recordProbe('snap-start', { frameAt: currentAt })
					if (snapTarget === snapFrom) {
						cancel('already-aligned')
						updateIndicators()
						return
					}
				}
				const progress = Math.min(1, Math.max(0, (currentAt - snapStartedAt) / LARGE_TOOLBAR_SNAP_MS))
				const eased = Math.pow(progress, 3)
				writePosition(
					snapFrom + (snapTarget - snapFrom) * eased,
					'snap-frame',
					{ frameAt: currentAt, progress, eased }
				)
				updateIndicators()
				if (progress < 1) {
					frame = requestFrame(animate)
					return
				}
				cancel('settled')
				updateIndicators()
			}

			function scheduleAnimation() {
				if (!frame) frame = requestFrame(animate)
			}

			function handleWheel(event) {
				if (shell.dataset.toolbarStyle !== 'cards' || maxScroll() <= .5) return
				if (!motionActive()) syncLogicalPositionFromNative()
				const rawDelta = Math.abs(Number(event?.deltaX) || 0) > Math.abs(Number(event?.deltaY) || 0)
					? Number(event?.deltaX) || 0
					: Number(event?.deltaY) || 0
				if (!rawDelta) return
				const unit = event?.deltaMode === 1
					? 16
					: event?.deltaMode === 2
						? Math.max(1, Number(actions.clientWidth) || LARGE_TOOLBAR_CARD_WIDTH)
						: 1
				const delta = rawDelta * unit
				event?.preventDefault?.()
				event?.stopPropagation?.()
				event?.stopImmediatePropagation?.()
				const currentAt = now()
				const inputGap = currentAt - lastInputAt
				const inputDirection = Math.sign(delta)
				const velocityBefore = velocity
				const motionDirection = snapStartedAt
					? Math.sign(snapTarget - snapFrom)
					: Math.sign(velocity) || (frame ? lastMotionDirection : 0)
				const reversing = !!inputDirection && !!motionDirection && inputDirection !== motionDirection
				if (reversing) {
					velocity = 0
					smoothingReversal = true
				} else if (inputGap > 90 && !smoothingReversal) {
					velocity = 0
				}
				toolbarBar.dataset.scrolling = 'true'
				recordProbe('wheel-input', {
					rawDelta,
					unit,
					delta,
					inputAt: currentAt,
					inputGap,
					inputDirection,
					motionDirection,
					reversing,
					reversalSmoothing: smoothingReversal,
					directPositionApplied: false,
					velocityBefore
				})
				lastInputAt = currentAt
				lastFrameAt = currentAt
				snapStartedAt = 0
				lastMotionDirection = inputDirection
				velocity = Math.min(2.4, Math.max(-2.4, velocity + delta * .006))
				updateIndicators()
				scheduleAnimation()
			}

			function refresh(reason) {
				if (disposed) return
				const refreshReason = String(reason || 'refresh')
				const active = motionActive()
				const cards = Array.from(actions.querySelectorAll('[data-world-editor-toolbar-card]'))
				const availability = cards.map(function (card) {
					return cardAvailable(card) ? '1' : '0'
				}).join('')
				for (const group of actions.querySelectorAll('[data-world-editor-toolbar-group]')) {
					const available = Array.from(group.querySelectorAll('[data-world-editor-toolbar-card]')).some(cardAvailable)
					group.dataset.largeEmpty = available ? 'false' : 'true'
				}
				const visibleCount = cards.filter(cardAvailable).length
				const viewportCount = Math.min(LARGE_TOOLBAR_VISIBLE_LIMIT, visibleCount)
				const width = viewportCount * LARGE_TOOLBAR_CARD_WIDTH
				toolbarBar.style.setProperty('--world-editor-large-toolbar-width', width + 'px')
				toolbarBar.dataset.visibleCards = String(visibleCount)
				const nextLayoutSignature = [
					String(shell.dataset.toolbarStyle || ''),
					availability,
					String(width),
					String(Number(actions.clientWidth) || 0),
					String(Number(actions.scrollWidth) || 0),
					String(maxScroll())
				].join('|')
				const layoutChanged = nextLayoutSignature !== layoutSignature
				layoutSignature = nextLayoutSignature
				const alignmentTarget = shell.dataset.toolbarStyle === 'cards'
					? nearestCardBoundary(logicalPosition)
					: 0
				recordProbe('refresh', {
					reason: refreshReason,
					active,
					layoutChanged,
					interrupted: active && layoutChanged,
					nearestBoundary: alignmentTarget
				})
				if (layoutChanged) {
					cancel('refresh:' + refreshReason)
					writePosition(alignmentTarget, 'refresh:' + refreshReason)
				}
				updateIndicators()
			}

			function handleScroll() {
				const current = Number(actions.scrollLeft) || 0
				recordProbe('scroll-event', {
					requested: lastRequestedPosition,
					drift: current - lastRequestedPosition
				})
				updateIndicators()
			}

			function cardProbeId(target) {
				const card = target?.closest?.('[data-world-editor-toolbar-card]')
				if (!card) return ''
				return String(
					card.dataset?.worldEditorAction ||
					card.dataset?.cardIcon ||
					card.getAttribute?.('aria-label') ||
					'toolbar-card'
				)
			}

			function handlePointerOver(event) {
				const next = cardProbeId(event?.target)
				if (!next || next === hoveredCard) return
				const previous = hoveredCard
				hoveredCard = next
				recordProbe('hover-change', { previous, next, kind: 'pointerover' })
			}

			function handlePointerOut(event) {
				const next = cardProbeId(event?.relatedTarget)
				if (next === hoveredCard) return
				const previous = hoveredCard
				hoveredCard = next
				recordProbe('hover-change', { previous, next, kind: 'pointerout' })
			}

			actions.addEventListener('wheel', handleWheel, { passive: false })
			actions.addEventListener('scroll', handleScroll)
			actions.addEventListener('pointerover', handlePointerOver)
			actions.addEventListener('pointerout', handlePointerOut)
			refresh('created')

			return Object.freeze({
				probe,
				cancel,
				refresh,
				dispose() {
					if (disposed) return false
					disposed = true
					cancel()
					actions.removeEventListener('wheel', handleWheel, { passive: false })
					actions.removeEventListener('scroll', handleScroll)
					actions.removeEventListener('pointerover', handlePointerOver)
					actions.removeEventListener('pointerout', handlePointerOut)
					return true
				}
			})
		}

		function createEconomyStatus() {
			const status = document.createElement('div')
			status.id = ECONOMY_STATUS_ID
			status.className = 'cattail-world-editor-economy-status'
			status.dataset.theme = 'reality'
			status.dataset.phase = 'idle'
			status.dataset.active = 'false'
			status.dataset.visible = 'false'
			status.setAttribute('role', 'status')
			status.setAttribute('aria-live', 'polite')
			status.setAttribute('aria-atomic', 'true')
			status.setAttribute('aria-hidden', 'true')
			return status
		}

		function createResourceThemeProperties(game) {
			const elmerine = resourceTriplet(game, 1, ['#FFC759', '#FFE86F', '#FF8F60'])
			const betaPylene = resourceTriplet(game, 3, ['#F26F67', '#FFB68C', '#C02E63'])
			const hellGem = resourceTriplet(game, 4, ['#A6F246', '#E3FD43', '#4CB96B'])
			return Object.freeze({
				'--world-editor-elmerine-1': elmerine[0],
				'--world-editor-elmerine-2': elmerine[1],
				'--world-editor-elmerine-3': elmerine[2],
				'--world-editor-beta-pylene-1': betaPylene[0],
				'--world-editor-beta-pylene-2': betaPylene[1],
				'--world-editor-beta-pylene-3': betaPylene[2],
				'--world-editor-hell-gem-1': hellGem[0],
				'--world-editor-hell-gem-2': hellGem[1],
				'--world-editor-hell-gem-3': hellGem[2]
			})
		}

		function resourceTriplet(game, index, fallback) {
			const source = game?.codex?.resources?.[index]?.triplet
			return fallback.map(function (value, colorIndex) {
				const candidate = source?.[colorIndex]
				return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : value
			})
		}

		function createShellPassThroughController(game, shell) {
			let disposed = false
			let rightDragFromCanvas = false
			let previewFollowing = false
			let previewAttachTimer = null
			let stopPreviewSubscription = null

			function refresh(reason) {
				if (disposed) return false
				const active = rightDragFromCanvas || previewFollowing
				const wasActive = shell.dataset.inputPassThrough === 'true'
				shell.dataset.inputPassThrough = active ? 'true' : 'false'
				shell.dataset.passThroughReason = active
					? rightDragFromCanvas && previewFollowing
						? 'world-drag+blueprint-follow'
						: rightDragFromCanvas ? 'world-drag' : 'blueprint-follow'
					: String(reason || 'inactive')
				if (active && !wasActive) {
					const focused = document.activeElement
					if (focused && shell.contains?.(focused)) focused.blur?.()
				}
				return active
			}

			function handleRightMouseDown(event) {
				if (event?.button !== 2) return
				rightDragFromCanvas = event.target === game?.canvas
				refresh('right-mousedown')
			}

			function handleRightMouseUp(event) {
				if (event?.button !== 2) return
				rightDragFromCanvas = false
				refresh('right-mouseup')
			}

			function handleWindowBlur() {
				rightDragFromCanvas = false
				refresh('window-blur')
			}

			function attachPreview() {
				previewAttachTimer = null
				if (disposed) return
				const preview = globalThis[BLUEPRINT_PREVIEW_KEY]
				if (preview?.game !== game || typeof preview.subscribe !== 'function') return
				stopPreviewSubscription = preview.subscribe(function (state) {
					previewFollowing = !!state?.active && !state.effectivePinned
					refresh('blueprint-preview')
				})
			}

			window.addEventListener('mousedown', handleRightMouseDown, true)
			window.addEventListener('mouseup', handleRightMouseUp, true)
			window.addEventListener('blur', handleWindowBlur, true)
			previewAttachTimer = globalThis.setTimeout?.(attachPreview, 0) ?? null
			refresh('created')

			return Object.freeze({
				dispose() {
					if (disposed) return false
					disposed = true
					window.removeEventListener('mousedown', handleRightMouseDown, true)
					window.removeEventListener('mouseup', handleRightMouseUp, true)
					window.removeEventListener('blur', handleWindowBlur, true)
					if (previewAttachTimer !== null) globalThis.clearTimeout?.(previewAttachTimer)
					previewAttachTimer = null
					if (typeof stopPreviewSubscription === 'function') stopPreviewSubscription()
					stopPreviewSubscription = null
					rightDragFromCanvas = false
					previewFollowing = false
					delete shell.dataset.inputPassThrough
					delete shell.dataset.passThroughReason
					return true
				}
			})
		}

		function createResourceHudController(game) {
			const methodNames = [
				'setResourceHomes',
				'setResourceHomesMobile',
				'renderResources',
				'renderDarkResources',
				'updateMouseData',
				'processMousemove2'
			]
			const methodBackups = new Map()
			const originalHomesDescriptor = Object.getOwnPropertyDescriptor(game, 'resourceHomes')
			let baseHomes = cloneResourceHomes(game?.resourceHomes)
			const visualHomes = cloneResourceHomes(baseHomes)
			let disposed = false
			let active = false
			let belowShell = false
			let animationHandle = null
			let animationHandleKind = ''
			let animationStartTime = 0
			let animationStart = identityResourceTransform()
			let currentTransform = identityResourceTransform()
			let targetTransform = identityResourceTransform()
			let lastReason = 'created'

			function setResourceHomesValue(value) {
				try {
					game.resourceHomes = value
				} catch (error) {
					console.warn('[Cattail World Editor] Resource HUD could not update resource homes.', error)
				}
			}

			function captureBaseHomes(value) {
				baseHomes = cloneResourceHomes(value)
				while (visualHomes.length > baseHomes.length) visualHomes.pop()
				while (visualHomes.length < baseHomes.length) visualHomes.push([0, 0])
			}

			function applyVisualHomes() {
				for (let index = 0; index < baseHomes.length; index += 1) {
					const base = baseHomes[index]
					const home = visualHomes[index] || (visualHomes[index] = [0, 0])
					home[0] = currentTransform.offsetX + base[0] * currentTransform.scale
					home[1] = currentTransform.offsetY + base[1] * currentTransform.scale
				}
				setResourceHomesValue(visualHomes)
			}

			function installMethod(name) {
				const original = game?.[name]
				if (typeof original !== 'function') return
				const descriptor = Object.getOwnPropertyDescriptor(game, name)
				const wrapper = name === 'setResourceHomes' || name === 'setResourceHomesMobile'
					? function (...args) {
						if (this !== game || disposed) return original.apply(this, args)
						const result = original.apply(this, args)
						captureBaseHomes(this.resourceHomes)
						recomputeTarget(name)
						return result
					}
					: name === 'renderResources' || name === 'renderDarkResources'
						? function (...args) {
							if (this !== game || disposed || isIdentityResourceTransform(currentTransform)) {
								return original.apply(this, args)
							}
							const context = this.ctx
							let saved = false
							setResourceHomesValue(baseHomes)
							try {
								if (context?.save && context?.translate && context?.scale) {
									context.save()
									saved = true
									context.translate(currentTransform.offsetX, currentTransform.offsetY)
									context.scale(currentTransform.scale, currentTransform.scale)
								}
								return original.apply(this, args)
							} finally {
								if (saved) context.restore?.()
								setResourceHomesValue(visualHomes)
							}
						}
						: function (...args) {
							const result = original.apply(this, args)
							if (this === game && !disposed) reconcileHoveredResource()
							return result
						}
				try {
					Object.defineProperty(game, name, {
						value: wrapper,
						configurable: true,
						enumerable: descriptor?.enumerable === true,
						writable: true
					})
					methodBackups.set(name, { descriptor })
				} catch (error) {
					console.warn('[Cattail World Editor] Resource HUD skipped method wrapper: ' + name + '.', error)
				}
			}

			function reconcileHoveredResource() {
				if (!Array.isArray(game?.mouse?.xy)) return
				game.hoveredResource = false
				const delta = finitePositive(game.screenUnit, 0) * .3 * currentTransform.scale
				for (let index = 0; index < visualHomes.length; index += 1) {
					const home = visualHomes[index]
					if (
						game.mouse.xy[0] > home[0] - delta &&
						game.mouse.xy[0] < home[0] + delta &&
						game.mouse.xy[1] > home[1] - delta &&
						game.mouse.xy[1] < home[1] + delta
					) {
						game.hoveredResource = index
						break
					}
				}
			}

			function computeTarget() {
				if (!active || !baseHomes.length) {
					belowShell = false
					return identityResourceTransform()
				}
				const viewport = resourceHudViewport(game)
				const xValues = baseHomes.map(function (home) { return home[0] })
				const minX = Math.min(...xValues)
				const maxX = Math.max(...xValues)
				const unit = finitePositive(game.screenUnit, Math.max(1, maxX - minX) / Math.max(1, baseHomes.length - 1))
				const radius = unit * .4
				const groupWidth = Math.max(unit * .8, maxX - minX + radius * 2)
				const leftMargin = RESOURCE_HUD_LEFT_MARGIN_CSS * viewport.scaleX
				const topMargin = RESOURCE_HUD_TOP_MARGIN_CSS * viewport.scaleY
				const leftEdge = leftMargin
				const available = Math.max(1, viewport.width - leftMargin * 2)
				belowShell = false
				const scale = Math.min(
					RESOURCE_HUD_MAX_SCALE,
					Math.max(RESOURCE_HUD_MIN_SCALE, available / groupWidth)
				)
				const centerY = topMargin + radius * scale
				return {
					scale,
					offsetX: leftEdge - (minX - radius) * scale,
					offsetY: centerY - baseHomes[0][1] * scale
				}
			}

			function recomputeTarget(reason) {
				if (disposed) return false
				lastReason = String(reason || 'layout')
				animateTo(computeTarget())
				return true
			}

			function animateTo(next) {
				const now = resourceAnimationNow()
				updateAnimation(now)
				if (resourceTransformsClose(targetTransform, next) && animationHandle !== null) return
				animationStart = cloneResourceTransform(currentTransform)
				targetTransform = cloneResourceTransform(next)
				animationStartTime = now
				if (resourceTransformsClose(animationStart, targetTransform)) {
					currentTransform = cloneResourceTransform(targetTransform)
					cancelAnimation()
					applyVisualHomes()
					return
				}
				cancelAnimation()
				scheduleAnimation()
			}

			function scheduleAnimation() {
				if (disposed || animationHandle !== null) return
				if (typeof globalThis.requestAnimationFrame === 'function') {
					animationHandleKind = 'frame'
					animationHandle = globalThis.requestAnimationFrame(handleAnimationFrame)
				} else {
					animationHandleKind = 'timer'
					animationHandle = globalThis.setTimeout?.(function () {
						handleAnimationFrame(resourceAnimationNow())
					}, 16) ?? null
				}
			}

			function handleAnimationFrame(timestamp) {
				animationHandle = null
				animationHandleKind = ''
				if (disposed) return
				const done = updateAnimation(Number.isFinite(Number(timestamp)) ? Number(timestamp) : resourceAnimationNow())
				if (!done) scheduleAnimation()
			}

			function updateAnimation(now) {
				if (resourceTransformsClose(currentTransform, targetTransform) && animationHandle === null) return true
				const progress = Math.min(1, Math.max(0, (now - animationStartTime) / RESOURCE_HUD_ANIMATION_MS))
				const eased = 1 - Math.pow(1 - progress, 3)
				currentTransform = {
					scale: interpolateNumber(animationStart.scale, targetTransform.scale, eased),
					offsetX: interpolateNumber(animationStart.offsetX, targetTransform.offsetX, eased),
					offsetY: interpolateNumber(animationStart.offsetY, targetTransform.offsetY, eased)
				}
				applyVisualHomes()
				return progress >= 1
			}

			function cancelAnimation() {
				if (animationHandle === null) return
				if (animationHandleKind === 'frame' && typeof globalThis.cancelAnimationFrame === 'function') {
					globalThis.cancelAnimationFrame(animationHandle)
				} else {
					globalThis.clearTimeout?.(animationHandle)
				}
				animationHandle = null
				animationHandleKind = ''
			}

			function snapshot() {
				return Object.freeze({
					active,
					belowShell,
					animationMs: RESOURCE_HUD_ANIMATION_MS,
					minScale: RESOURCE_HUD_MIN_SCALE,
					maxScale: RESOURCE_HUD_MAX_SCALE,
					current: Object.freeze(cloneResourceTransform(currentTransform)),
					target: Object.freeze(cloneResourceTransform(targetTransform)),
					baseHomes: Object.freeze(cloneResourceHomes(baseHomes).map(Object.freeze)),
					visualHomes: Object.freeze(cloneResourceHomes(visualHomes).map(Object.freeze)),
					lastReason,
					disposed
				})
			}

			function restoreMethodsAndHomes() {
				for (const name of methodNames.slice().reverse()) {
					const backup = methodBackups.get(name)
					if (!backup) continue
					try {
						if (backup.descriptor) Object.defineProperty(game, name, backup.descriptor)
						else delete game[name]
					} catch (error) {
						console.warn('[Cattail World Editor] Resource HUD could not restore method: ' + name + '.', error)
					}
				}
				const restoredHomes = cloneResourceHomes(baseHomes)
				try {
					if (originalHomesDescriptor) {
						const descriptor = Object.assign({}, originalHomesDescriptor)
						if (Object.hasOwn(descriptor, 'value')) descriptor.value = restoredHomes
						Object.defineProperty(game, 'resourceHomes', descriptor)
					} else {
						delete game.resourceHomes
						if (restoredHomes.length) game.resourceHomes = restoredHomes
					}
				} catch (error) {
					console.warn('[Cattail World Editor] Resource HUD could not restore resource homes.', error)
				}
			}

			for (const name of methodNames) installMethod(name)
			applyVisualHomes()

			const probe = Object.freeze({ snapshot })
			return Object.freeze({
				probe,
				setActive(next, reason) {
					if (disposed) return false
					const value = next === true
					if (active === value) {
						if (value) recomputeTarget(reason || 'active-refresh')
						return false
					}
					active = value
					recomputeTarget(reason || (active ? 'entered' : 'exited'))
					return true
				},
				refreshLayout(reason) {
					if (!active || disposed) return false
					return recomputeTarget(reason || 'layout')
				},
				dispose() {
					if (disposed) return false
					disposed = true
					cancelAnimation()
					currentTransform = identityResourceTransform()
					targetTransform = identityResourceTransform()
					restoreMethodsAndHomes()
					return true
				}
			})
		}

		function resourceHudViewport(game) {
			const canvas = game?.canvas
			const rect = canvas?.getBoundingClientRect?.()
			const width = finitePositive(game?.w, finitePositive(canvas?.width, rect?.width || UI_SCALE_BASE_WIDTH))
			const height = finitePositive(game?.h, finitePositive(canvas?.height, rect?.height || UI_SCALE_BASE_HEIGHT))
			const cssWidth = finitePositive(rect?.width, typeof window !== 'undefined' ? window.innerWidth : width)
			const cssHeight = finitePositive(rect?.height, typeof window !== 'undefined' ? window.innerHeight : height)
			return {
				width,
				height,
				scaleX: width / cssWidth,
				scaleY: height / cssHeight,
				canvasLeft: Number(rect?.left) || 0,
				canvasTop: Number(rect?.top) || 0
			}
		}

		function cloneResourceHomes(value) {
			if (!Array.isArray(value)) return []
			return value.map(function (home) {
				return [Number(home?.[0]) || 0, Number(home?.[1]) || 0]
			})
		}

		function identityResourceTransform() {
			return { scale: 1, offsetX: 0, offsetY: 0 }
		}

		function cloneResourceTransform(value) {
			return {
				scale: Number(value?.scale) || 1,
				offsetX: Number(value?.offsetX) || 0,
				offsetY: Number(value?.offsetY) || 0
			}
		}

		function isIdentityResourceTransform(value) {
			return resourceTransformsClose(value, identityResourceTransform())
		}

		function resourceTransformsClose(left, right) {
			return Math.abs((Number(left?.scale) || 0) - (Number(right?.scale) || 0)) < .000001 &&
				Math.abs((Number(left?.offsetX) || 0) - (Number(right?.offsetX) || 0)) < .001 &&
				Math.abs((Number(left?.offsetY) || 0) - (Number(right?.offsetY) || 0)) < .001
		}

		function interpolateNumber(start, end, progress) {
			return start + (end - start) * progress
		}

		function resourceAnimationNow() {
			const value = Number(globalThis.performance?.now?.())
			return Number.isFinite(value) ? value : Date.now()
		}

		function unavailableSharedGuards() {
			return Object.freeze({
				isEditableEvent() { return false },
				isModLoaderPanelBlocking() { return false },
				isWorldEditorInputBlocked() { return false }
			})
		}

		function unavailablePaletteElement() {
			const element = {
				hidden: true,
				disabled: true,
				dataset: {},
				style: {},
				textContent: '',
				value: '',
				addEventListener() {},
				removeEventListener() {},
				setAttribute() {},
				contains() { return false },
				focus() {},
				querySelector() { return element }
			}
			return element
		}

		function unavailablePaintUi(game) {
			const recipe = Object.freeze({
				version: 1,
				weights: Object.freeze([Object.freeze({ resource: 0, weight: 100 })]),
				totalWeight: 100
			})
			const state = Object.freeze({
				version: '0.6.0',
				subtool: 'brush',
				cubeMode: 'stable',
				growAvailable: false,
				growDurationMs: 4000,
				recipe,
				paletteOpen: false,
				revision: 0,
				lastReason: 'not-ready',
				ready: false,
				disposed: false
			})
			return Object.freeze({
				game,
				snapshot() { return state },
				subscribe(listener) {
					listener(state)
					return function () {}
				},
				setSubtool() { return false },
				setCubeMode() { return false },
				setRecipe() { return false },
				setPaletteOpen() { return false }
			})
		}

		function unavailablePaintState() {
			const defaultRecipe = function () {
				return { version: 1, weights: [{ resource: 0, weight: 100 }], totalWeight: 100 }
			}
			return Object.freeze({
				resourceCount: 10,
				defaultRecipe,
				normalizeRecipe(value) {
					const weights = Array.isArray(value) ? value : value?.weights
					if (!Array.isArray(weights)) return null
					const normalized = weights.filter(function (entry) {
						return Number.isInteger(Number(entry?.resource)) && Number(entry?.weight) > 0
					}).map(function (entry) {
						return { resource: Number(entry.resource), weight: Math.min(100, Math.round(Number(entry.weight))) }
					})
					if (!normalized.length) return null
					return {
						version: 1,
						weights: normalized,
						totalWeight: normalized.reduce(function (sum, entry) { return sum + entry.weight }, 0)
					}
				},
				allocateSlots(recipe) {
					const counts = new Array(10).fill(0)
					if (recipe?.weights?.[0]) counts[recipe.weights[0].resource] = 64
					return counts
				}
			})
		}

		function unavailableTransactions(game) {
			const state = Object.freeze({
				version: '1.0.0',
				ready: false,
				busy: false,
				phase: 'idle',
				direction: null,
				undoCount: 0,
				redoCount: 0,
				canUndo: false,
				canRedo: false,
				undoBlockedReason: 'NOT_READY',
				redoBlockedReason: 'NOT_READY',
				terminalBlockedReason: null,
				error: Object.freeze({
					code: 'NOT_READY',
					message: 'Transaction history is unavailable.'
				}),
				disposed: false
			})
			const reject = function (direction) {
				return Promise.resolve(Object.freeze({
					accepted: false,
					executed: false,
					direction,
					reason: 'not-ready',
					transaction: null,
					snapshotId: null,
					error: state.error
				}))
			}
			return Object.freeze({
				game,
				snapshot() { return state },
				subscribe(listener) {
					listener(state)
					return function () {}
				},
				undo() { return reject('undo') },
				redo() { return reject('redo') }
			})
		}

		function unavailableCreativeController(game) {
			const state = Object.freeze({
				version: '1.0.0',
				ready: false,
				creativeMode: false,
				entryMode: null,
				createdAt: 0,
				busy: false,
				dialogOpen: false,
				pendingForkFinalization: false,
				revision: 0,
				lastReason: 'creative-service-unavailable',
				error: Object.freeze({ code: 'NOT_READY', message: 'Creative mode is unavailable.' }),
				disposed: false
			})
			return Object.freeze({
				game,
				snapshot() { return state },
				subscribe(listener) {
					listener(state)
					return function () {}
				},
				setDialogOpen() { return false },
				isInputBlocked() { return false }
			})
		}

		function unavailableCreativeEconomy(game) {
			const state = Object.freeze({
				version: '1.0.0',
				ready: false,
				active: false,
				busy: false,
				phase: 'idle',
				operation: null,
				input: null,
				revision: 0,
				lastReason: 'creative-economy-unavailable',
				lastSnapshotId: null,
				error: Object.freeze({ code: 'NOT_READY', message: 'Creative economy is unavailable.' }),
				disposed: false
			})
			return Object.freeze({
				game,
				snapshot() { return state },
				subscribe(listener) {
					listener(state)
					return function () {}
				},
				isInputBlocked() { return false }
			})
		}

		function ensureStyle() {
			const existing = document.getElementById(STYLE_ID)
			if (existing) return existing

			const style = document.createElement('style')
			style.id = STYLE_ID
			style.textContent = `
				:root {
					--world-editor-elmerine-1: #FFC759;
					--world-editor-elmerine-2: #FFE86F;
					--world-editor-elmerine-3: #FF8F60;
					--world-editor-hell-gem-1: #A6F246;
					--world-editor-hell-gem-2: #E3FD43;
					--world-editor-hell-gem-3: #4CB96B;
					--world-editor-draw-pink-1: #F58BB7;
					--world-editor-draw-pink-2: #FFD1E2;
					--world-editor-draw-pink-3: #B9478D;
					--world-editor-glass-backdrop: blur(10px) saturate(1.2) brightness(1.05);
					--world-editor-elmerine-glass:
						radial-gradient(ellipse 92% 72% at 50% -18%, rgba(255, 255, 255, .72) 0%, rgba(255, 255, 255, .22) 46%, transparent 72%),
						linear-gradient(180deg, rgba(255, 255, 255, .28) 0%, rgba(255, 255, 255, .06) 34%, rgba(255, 255, 255, .03) 60%, rgba(255, 255, 255, .3) 100%),
						linear-gradient(112deg, transparent 8%, rgba(255, 255, 255, .46) 24%, rgba(255, 255, 255, .09) 43%, transparent 59%),
						linear-gradient(145deg, color-mix(in srgb, var(--world-editor-elmerine-2) 24%, transparent), color-mix(in srgb, var(--world-editor-elmerine-1) 16%, transparent) 54%, color-mix(in srgb, var(--world-editor-elmerine-3) 22%, transparent));
					--world-editor-elmerine-glass-hover:
						radial-gradient(ellipse 96% 78% at 50% -18%, rgba(255, 255, 255, .84) 0%, rgba(255, 255, 255, .32) 48%, transparent 74%),
						linear-gradient(180deg, rgba(255, 255, 255, .36) 0%, rgba(255, 255, 255, .08) 34%, rgba(255, 255, 255, .05) 60%, rgba(255, 255, 255, .42) 100%),
						linear-gradient(108deg, transparent 6%, rgba(255, 255, 255, .58) 24%, rgba(255, 255, 255, .14) 44%, transparent 61%),
						linear-gradient(145deg, color-mix(in srgb, var(--world-editor-elmerine-2) 30%, transparent), color-mix(in srgb, var(--world-editor-elmerine-1) 22%, transparent) 54%, color-mix(in srgb, var(--world-editor-elmerine-3) 28%, transparent));
					--world-editor-hell-gem-glass:
						radial-gradient(ellipse 92% 72% at 50% -18%, rgba(255, 255, 255, .72) 0%, rgba(255, 255, 255, .22) 46%, transparent 72%),
						linear-gradient(180deg, rgba(255, 255, 255, .28) 0%, rgba(255, 255, 255, .06) 34%, rgba(255, 255, 255, .03) 60%, rgba(255, 255, 255, .3) 100%),
						linear-gradient(112deg, transparent 8%, rgba(255, 255, 255, .46) 24%, rgba(255, 255, 255, .09) 43%, transparent 59%),
						linear-gradient(145deg, color-mix(in srgb, var(--world-editor-hell-gem-2) 24%, transparent), color-mix(in srgb, var(--world-editor-hell-gem-1) 16%, transparent) 54%, color-mix(in srgb, var(--world-editor-hell-gem-3) 22%, transparent));
					--world-editor-hell-gem-glass-hover:
						radial-gradient(ellipse 96% 78% at 50% -18%, rgba(255, 255, 255, .84) 0%, rgba(255, 255, 255, .32) 48%, transparent 74%),
						linear-gradient(180deg, rgba(255, 255, 255, .36) 0%, rgba(255, 255, 255, .08) 34%, rgba(255, 255, 255, .05) 60%, rgba(255, 255, 255, .42) 100%),
						linear-gradient(108deg, transparent 6%, rgba(255, 255, 255, .58) 24%, rgba(255, 255, 255, .14) 44%, transparent 61%),
						linear-gradient(145deg, color-mix(in srgb, var(--world-editor-hell-gem-2) 30%, transparent), color-mix(in srgb, var(--world-editor-hell-gem-1) 22%, transparent) 54%, color-mix(in srgb, var(--world-editor-hell-gem-3) 28%, transparent));
					--world-editor-hell-gem-glass-shadow:
						inset 0 0 0 1px rgba(255, 255, 255, .62),
						inset 0 1px 1px rgba(255, 255, 255, .92),
						inset 0 -1px 1px rgba(255, 255, 255, .68),
						inset 1px 0 1px rgba(255, 255, 255, .38),
						inset -1px 0 1px color-mix(in srgb, var(--world-editor-hell-gem-2) 34%, transparent),
						inset 0 -6px 12px color-mix(in srgb, var(--world-editor-hell-gem-3) 18%, transparent),
						0 5px 12px rgba(10, 16, 24, .16),
						0 0 12px color-mix(in srgb, var(--world-editor-hell-gem-1) 42%, transparent),
						0 0 26px color-mix(in srgb, var(--world-editor-hell-gem-2) 22%, transparent);
					--world-editor-hell-gem-glass-shadow-hover:
						inset 0 0 0 1px rgba(255, 255, 255, .76),
						inset 0 1px 1px rgba(255, 255, 255, .98),
						inset 0 -2px 2px rgba(255, 255, 255, .78),
						inset 1px 0 1px rgba(255, 255, 255, .5),
						inset -1px 0 1px color-mix(in srgb, var(--world-editor-hell-gem-2) 42%, transparent),
						inset 0 -7px 14px color-mix(in srgb, var(--world-editor-hell-gem-3) 22%, transparent),
						0 6px 14px rgba(10, 16, 24, .18),
						0 0 16px color-mix(in srgb, var(--world-editor-hell-gem-1) 54%, transparent),
						0 0 32px color-mix(in srgb, var(--world-editor-hell-gem-2) 30%, transparent);
					--world-editor-hell-gem-glass-shadow-pressed:
						inset 0 0 0 1px rgba(255, 255, 255, .58),
						inset 0 1px 1px rgba(255, 255, 255, .74),
						inset 0 4px 9px color-mix(in srgb, var(--world-editor-hell-gem-3) 24%, transparent),
						inset 0 -1px 1px rgba(255, 255, 255, .54),
						0 2px 7px rgba(10, 16, 24, .16),
						0 0 10px color-mix(in srgb, var(--world-editor-hell-gem-1) 38%, transparent),
						0 0 20px color-mix(in srgb, var(--world-editor-hell-gem-2) 20%, transparent);
					--world-editor-draw-pink-glass:
						radial-gradient(ellipse 92% 72% at 50% -18%, rgba(255, 255, 255, .76) 0%, rgba(255, 255, 255, .24) 46%, transparent 72%),
						linear-gradient(180deg, rgba(255, 255, 255, .3) 0%, rgba(255, 255, 255, .07) 34%, rgba(255, 255, 255, .04) 60%, rgba(255, 255, 255, .34) 100%),
						linear-gradient(112deg, transparent 8%, rgba(255, 255, 255, .5) 24%, rgba(255, 255, 255, .1) 43%, transparent 59%),
						linear-gradient(145deg, color-mix(in srgb, var(--world-editor-draw-pink-2) 24%, transparent), color-mix(in srgb, var(--world-editor-draw-pink-1) 18%, transparent) 54%, color-mix(in srgb, var(--world-editor-draw-pink-3) 22%, transparent));
					--world-editor-draw-pink-glass-hover:
						radial-gradient(ellipse 96% 78% at 50% -18%, rgba(255, 255, 255, .86) 0%, rgba(255, 255, 255, .34) 48%, transparent 74%),
						linear-gradient(180deg, rgba(255, 255, 255, .38) 0%, rgba(255, 255, 255, .09) 34%, rgba(255, 255, 255, .05) 60%, rgba(255, 255, 255, .44) 100%),
						linear-gradient(108deg, transparent 6%, rgba(255, 255, 255, .6) 24%, rgba(255, 255, 255, .15) 44%, transparent 61%),
						linear-gradient(145deg, color-mix(in srgb, var(--world-editor-draw-pink-2) 31%, transparent), color-mix(in srgb, var(--world-editor-draw-pink-1) 24%, transparent) 54%, color-mix(in srgb, var(--world-editor-draw-pink-3) 29%, transparent));
					--world-editor-draw-pink-glass-shadow:
						inset 0 0 0 1px rgba(255, 255, 255, .64),
						inset 0 1px 1px rgba(255, 255, 255, .94),
						inset 0 -1px 1px rgba(255, 255, 255, .7),
						inset 1px 0 1px rgba(255, 255, 255, .4),
						inset -1px 0 1px color-mix(in srgb, var(--world-editor-draw-pink-2) 36%, transparent),
						inset 0 -6px 12px color-mix(in srgb, var(--world-editor-draw-pink-3) 20%, transparent),
						0 5px 12px rgba(10, 16, 24, .16),
						0 0 12px color-mix(in srgb, var(--world-editor-draw-pink-1) 44%, transparent),
						0 0 26px color-mix(in srgb, var(--world-editor-draw-pink-2) 24%, transparent);
					--world-editor-draw-pink-glass-shadow-hover:
						inset 0 0 0 1px rgba(255, 255, 255, .78),
						inset 0 1px 1px rgba(255, 255, 255, .98),
						inset 0 -2px 2px rgba(255, 255, 255, .8),
						inset 1px 0 1px rgba(255, 255, 255, .52),
						inset -1px 0 1px color-mix(in srgb, var(--world-editor-draw-pink-2) 44%, transparent),
						inset 0 -7px 14px color-mix(in srgb, var(--world-editor-draw-pink-3) 24%, transparent),
						0 6px 14px rgba(10, 16, 24, .18),
						0 0 16px color-mix(in srgb, var(--world-editor-draw-pink-1) 56%, transparent),
						0 0 32px color-mix(in srgb, var(--world-editor-draw-pink-2) 32%, transparent);
					--world-editor-draw-pink-glass-shadow-pressed:
						inset 0 0 0 1px rgba(255, 255, 255, .6),
						inset 0 1px 1px rgba(255, 255, 255, .76),
						inset 0 4px 9px color-mix(in srgb, var(--world-editor-draw-pink-3) 26%, transparent),
						inset 0 -1px 1px rgba(255, 255, 255, .56),
						0 2px 7px rgba(10, 16, 24, .16),
						0 0 10px color-mix(in srgb, var(--world-editor-draw-pink-1) 40%, transparent),
						0 0 20px color-mix(in srgb, var(--world-editor-draw-pink-2) 22%, transparent);
				}
				.cattail-world-editor-shell {
					--world-editor-shell-bg: rgba(248, 248, 246, .88);
					--world-editor-shell-text: rgba(18, 20, 22, .94);
					--world-editor-shell-muted: rgba(18, 20, 22, .58);
					--world-editor-shell-border: rgba(0, 0, 0, .12);
					--world-editor-shell-dot: rgba(18, 20, 22, .82);
					--world-editor-shell-chip: rgba(18, 20, 22, .07);
					--world-editor-shell-hover-bg: rgba(150, 154, 160, .18);
					--world-editor-shell-hover-color: #b56b87;
					--world-editor-shell-hover-filter: brightness(0) saturate(100%) invert(48%) sepia(19%) saturate(1118%) hue-rotate(286deg) brightness(94%) contrast(87%);
					--world-editor-shell-group: rgba(18, 20, 22, .035);
					--world-editor-shell-active: rgba(113, 79, 163, .16);
					--world-editor-shell-active-border: rgba(113, 79, 163, .34);
					--world-editor-shell-creative: rgba(166, 242, 70, .2);
					--world-editor-shell-creative-border: rgba(166, 242, 70, .62);
					--world-editor-shell-creative-text: rgb(91, 128, 25);
					--world-editor-history-success: rgba(76, 185, 107, .72);
					--world-editor-history-warning: rgba(205, 142, 44, .72);
					--world-editor-history-error: rgba(198, 71, 71, .76);
					--world-editor-history-busy: rgba(113, 79, 163, .62);
					--world-editor-shell-shadow: 0 10px 28px rgba(0, 0, 0, .16);
					position: fixed;
					top: max(12px, env(safe-area-inset-top));
					left: 0;
					right: 0;
					z-index: 48;
					display: flex;
					justify-content: center;
					box-sizing: border-box;
					padding: 0 12px;
					visibility: hidden;
					opacity: 0;
					transform: translateY(-8px);
					pointer-events: none;
					transition: opacity .16s ease, transform .16s ease, visibility 0s linear .16s;
				}
				.cattail-world-editor-shell[data-theme="void"] {
					--world-editor-shell-bg: rgba(8, 10, 12, .88);
					--world-editor-shell-text: rgba(255, 255, 255, .92);
					--world-editor-shell-muted: rgba(255, 255, 255, .62);
					--world-editor-shell-border: rgba(255, 255, 255, .14);
					--world-editor-shell-dot: rgba(242, 242, 237, .94);
					--world-editor-shell-chip: rgba(255, 255, 255, .09);
					--world-editor-shell-group: rgba(255, 255, 255, .055);
					--world-editor-shell-active: rgba(210, 188, 250, .16);
					--world-editor-shell-active-border: rgba(210, 188, 250, .34);
					--world-editor-shell-creative: rgba(227, 253, 67, .18);
					--world-editor-shell-creative-border: rgba(227, 253, 67, .64);
					--world-editor-shell-creative-text: rgb(227, 253, 67);
					--world-editor-history-success: rgba(151, 224, 120, .76);
					--world-editor-history-warning: rgba(240, 201, 106, .76);
					--world-editor-history-error: rgba(245, 115, 115, .8);
					--world-editor-history-busy: rgba(210, 188, 250, .7);
					--world-editor-shell-shadow: 0 10px 28px rgba(0, 0, 0, .3);
				}
				.cattail-world-editor-shell[data-visible="true"] {
					visibility: visible;
					opacity: 1;
					transform: translateY(0);
					transition-delay: 0s;
				}
				.cattail-world-editor-shell[data-input-pass-through="true"],
				.cattail-world-editor-shell[data-input-pass-through="true"] * {
					pointer-events: none !important;
				}
				.cattail-world-editor-shell__layout {
					display: flex;
					flex-direction: column;
					align-items: center;
					gap: 8px;
					width: max-content;
					max-width: var(--world-editor-toolbar-layout-width, calc(100vw - 24px));
					color: var(--world-editor-shell-text);
					font: 400 14px/1.4 Montserrat, Arial, sans-serif;
					-webkit-font-smoothing: antialiased;
					white-space: nowrap;
					transform: scale(var(--world-editor-ui-scale, 1));
					transform-origin: top center;
				}
				.cattail-world-editor-shell__status-bar,
				.cattail-world-editor-shell__toolbar-bar {
					box-sizing: border-box;
					border: 1px solid var(--world-editor-shell-border);
					border-radius: 10px;
					background: var(--world-editor-shell-bg);
					box-shadow: var(--world-editor-shell-shadow);
					backdrop-filter: blur(14px) saturate(1.12);
					-webkit-backdrop-filter: blur(14px) saturate(1.12);
					zoom: var(--world-editor-toolbar-chrome-scale, 1.08);
					transition: background .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease;
				}
				.cattail-world-editor-shell[data-theme="reality"] .cattail-world-editor-shell__status-bar,
				.cattail-world-editor-shell[data-theme="reality"] .cattail-world-editor-shell__toolbar-bar {
					--world-editor-shell-bg: #FFFFFF;
					background: #FFFFFF;
					backdrop-filter: none;
					-webkit-backdrop-filter: none;
				}
				.cattail-world-editor-shell__status-bar {
					display: flex;
					align-items: center;
					gap: 14px;
					width: max-content;
					max-width: min(100%, var(--world-editor-toolbar-chrome-layout-width, 100%));
					min-width: 0;
					padding: 10px 14px;
				}
				.cattail-world-editor-shell__toolbar-bar {
					display: flex;
					width: max-content;
					max-width: min(100%, var(--world-editor-toolbar-chrome-layout-width, 100%));
					padding: 8px 10px;
				}
				.cattail-world-editor-shell__identity {
					display: inline-flex;
					align-items: center;
					gap: 8px;
					min-width: 0;
				}
				.cattail-world-editor-shell__dot {
					width: 8px;
					height: 8px;
					flex: 0 0 auto;
					border-radius: 50%;
					background: var(--world-editor-shell-dot);
				}
				.cattail-world-editor-shell__brand {
					overflow: hidden;
					text-overflow: ellipsis;
					font-weight: 600;
				}
				.cattail-world-editor-shell__divider {
					width: 1px;
					height: 20px;
					background: var(--world-editor-shell-border);
				}
				.cattail-world-editor-shell__mode {
					color: var(--world-editor-shell-text);
					font-size: 18px;
					font-weight: 600;
					text-shadow: none;
					transition: color .18s ease, text-shadow .18s ease;
				}
				.cattail-world-editor-shell__mode[data-creative="true"] {
					color: var(--world-editor-hell-gem-3, #4CB96B);
					text-shadow:
						0 0 5px color-mix(in srgb, var(--world-editor-hell-gem-1, #A6F246) 78%, transparent),
						0 0 12px color-mix(in srgb, var(--world-editor-hell-gem-2, #E3FD43) 64%, transparent),
						0 0 22px color-mix(in srgb, var(--world-editor-hell-gem-3, #4CB96B) 52%, transparent);
				}
				.cattail-world-editor-shell__status {
					display: inline-flex;
					align-items: center;
					gap: 10px;
				}
				.cattail-world-editor-shell__count {
					padding: 4px 8px;
					border: 1px solid var(--world-editor-shell-border);
					border-radius: 999px;
					background: var(--world-editor-shell-chip);
					color: var(--world-editor-shell-muted);
					font-size: 12px;
					font-variant-numeric: tabular-nums;
					font-weight: 600;
				}
				.cattail-world-editor-shell__style-switch {
					display: inline-flex;
					flex: none;
					overflow: hidden;
					border: 1px solid var(--world-editor-shell-border);
					border-radius: 6px;
					background: var(--world-editor-shell-chip);
					pointer-events: auto;
				}
				.cattail-world-editor-shell__style-button {
					display: inline-grid;
					width: 27px;
					height: 26px;
					box-sizing: border-box;
					padding: 0;
					place-items: center;
					border: 0;
					border-right: 1px solid var(--world-editor-shell-border);
					background: transparent;
					color: var(--world-editor-shell-muted);
					font: 700 17px/1 Montserrat, Arial, sans-serif;
					cursor: pointer;
				}
				.cattail-world-editor-shell__style-button:last-child { border-right: 0; }
				.cattail-world-editor-shell__style-button:hover {
					background: var(--world-editor-shell-hover-bg);
					color: var(--world-editor-shell-hover-color);
				}
				.cattail-world-editor-shell__style-button[data-active="true"] {
					background: var(--world-editor-shell-active);
					color: var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell__style-button[data-active="true"]:hover {
					background: var(--world-editor-shell-hover-bg);
					color: var(--world-editor-shell-hover-color);
				}
				.cattail-world-editor-shell__actions {
					display: flex;
					align-items: center;
					flex-wrap: wrap;
					justify-content: center;
					gap: 8px;
					width: max-content;
					max-width: 100%;
					pointer-events: auto;
				}
				.cattail-world-editor-shell__group {
					display: inline-flex;
					align-items: center;
					flex: none;
					flex-wrap: nowrap;
					gap: 6px;
					min-height: 36px;
					box-sizing: border-box;
					padding: 3px 6px;
					border: 1px solid var(--world-editor-shell-border);
					border-radius: 8px;
					background: var(--world-editor-shell-group);
				}
				.cattail-world-editor-shell__group:empty {
					display: none;
				}
				.cattail-world-editor-shell__tool {
					min-height: 30px;
					box-sizing: border-box;
					padding: 5px 10px;
					border: 1px solid var(--world-editor-shell-border);
					border-radius: 6px;
					background: var(--world-editor-shell-chip);
					color: var(--world-editor-shell-muted);
					font: 600 12px/1.2 Montserrat, Arial, sans-serif;
					cursor: pointer;
					transition: background .12s ease, border-color .12s ease, box-shadow .12s ease, color .12s ease, opacity .12s ease, transform .08s ease;
				}
				.cattail-world-editor-shell__tool--icon {
					width: 30px;
					min-width: 30px;
					height: 30px;
					min-height: 30px;
					padding: 0;
					font-size: 20px;
					line-height: 1;
				}
				[data-world-editor-toolbar-icon] {
					position: relative;
					display: inline-block;
					width: 1em;
					height: 1em;
					font-size: 20px;
					line-height: 1;
					pointer-events: none;
				}
				[data-world-editor-toolbar-icon]::before,
				[data-world-editor-toolbar-icon]::after {
					position: absolute;
					box-sizing: border-box;
					content: '';
				}
				[data-world-editor-toolbar-icon="brush"]::before {
					left: .45em;
					top: .05em;
					width: .16em;
					height: .68em;
					border-radius: .09em;
					background: currentColor;
					transform: rotate(42deg);
					transform-origin: 50% 85%;
				}
				[data-world-editor-toolbar-icon="brush"]::after {
					left: .12em;
					top: .55em;
					width: .46em;
					height: .32em;
					border-radius: .08em .08em .2em .1em;
					background: currentColor;
					clip-path: polygon(14% 0, 100% 0, 85% 67%, 62% 100%, 42% 79%, 0 100%, 11% 55%);
					transform: rotate(-5deg);
				}
				[data-world-editor-toolbar-icon="bucket"]::before {
					inset: .05em;
					background: currentColor;
					-webkit-mask: url('mods/Cattail_TweaksQuality_World-Editor/assets/icons/paint-bucket.svg') center / contain no-repeat;
					mask: url('mods/Cattail_TweaksQuality_World-Editor/assets/icons/paint-bucket.svg') center / contain no-repeat;
				}
				[data-world-editor-toolbar-icon="eraser"]::before {
					left: .16em;
					top: .29em;
					width: .68em;
					height: .38em;
					border: .075em solid currentColor;
					border-radius: .07em;
					background: linear-gradient(90deg, currentColor 0 38%, transparent 38% 100%);
					transform: rotate(-38deg);
				}
				[data-world-editor-toolbar-icon="eraser"]::after {
					left: .19em;
					bottom: .12em;
					width: .62em;
					height: .065em;
					border-radius: 999px;
					background: currentColor;
					opacity: .5;
				}
				[data-world-editor-toolbar-icon="palette"]::before {
					left: .09em;
					top: .13em;
					width: .82em;
					height: .72em;
					border: .075em solid currentColor;
					border-radius: 52% 48% 48% 42%;
					background:
						radial-gradient(circle at 27% 31%, currentColor 0 .07em, transparent .075em),
						radial-gradient(circle at 56% 23%, currentColor 0 .07em, transparent .075em),
						radial-gradient(circle at 72% 48%, currentColor 0 .07em, transparent .075em),
						radial-gradient(circle at 39% 67%, currentColor 0 .07em, transparent .075em);
					transform: rotate(-9deg);
				}
				[data-world-editor-toolbar-icon="palette"]::after {
					right: .08em;
					bottom: .08em;
					width: .3em;
					height: .3em;
					border-radius: 50%;
					background: var(--world-editor-shell-bg);
					box-shadow: inset 0 0 0 .07em currentColor;
				}
				[data-world-editor-toolbar-icon="stable"]::before {
					left: .17em;
					top: .17em;
					width: .66em;
					height: .66em;
					border: .09em solid currentColor;
					border-radius: .08em;
					transform: rotate(45deg) scale(.82);
				}
				[data-world-editor-toolbar-icon="stable"]::after {
					left: .46em;
					top: .22em;
					width: .09em;
					height: .56em;
					background: currentColor;
					box-shadow: -.2em .2em 0 -.025em currentColor, .2em .2em 0 -.025em currentColor;
				}
				[data-world-editor-toolbar-icon="grow"]::before {
					left: .16em;
					bottom: .12em;
					width: .68em;
					height: .34em;
					border: .09em solid currentColor;
					clip-path: polygon(18% 0, 82% 0, 100% 34%, 100% 100%, 0 100%, 0 34%);
				}
				[data-world-editor-toolbar-icon="grow"]::after {
					left: .455em;
					top: .08em;
					width: .09em;
					height: .51em;
					background: currentColor;
					clip-path: polygon(0 26%, 50% 0, 100% 26%, 72% 26%, 72% 100%, 28% 100%, 28% 26%);
				}
				[data-world-editor-toolbar-icon="pickaxe"]::before {
					left: .455em;
					top: .24em;
					width: .11em;
					height: .68em;
					border-radius: .055em;
					background: currentColor;
					transform: rotate(28deg);
					transform-origin: 50% 8%;
				}
				[data-world-editor-toolbar-icon="pickaxe"]::after {
					left: .07em;
					top: .1em;
					width: .86em;
					height: .34em;
					background: currentColor;
					clip-path: polygon(0 58%, 9% 29%, 34% 8%, 59% 7%, 82% 27%, 100% 67%, 91% 63%, 77% 43%, 58% 31%, 35% 32%, 12% 50%);
				}
				.cattail-world-editor-shell__tool:hover:not(:disabled) {
					color: var(--world-editor-shell-hover-color);
				}
				.cattail-world-editor-shell__tool[data-active="true"] {
					border-color: var(--world-editor-shell-active-border);
					background: var(--world-editor-shell-active);
					color: var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell__tool--creative[data-creative="true"] {
					border-color: color-mix(in srgb, rgba(255, 255, 255, .88) 54%, var(--world-editor-hell-gem-1));
					background: var(--world-editor-hell-gem-glass);
					background-blend-mode: screen, screen, screen, normal;
					backdrop-filter: var(--world-editor-glass-backdrop);
					-webkit-backdrop-filter: var(--world-editor-glass-backdrop);
					box-shadow: var(--world-editor-hell-gem-glass-shadow);
					color: #17200c;
				}
				.cattail-world-editor-shell__tool--creative[data-creative="true"]:hover:not(:disabled):not([aria-disabled="true"]) {
					border-color: color-mix(in srgb, rgba(255, 255, 255, .96) 68%, var(--world-editor-hell-gem-1));
					background: var(--world-editor-hell-gem-glass-hover);
					box-shadow: var(--world-editor-hell-gem-glass-shadow-hover);
					color: #17200c;
				}
				.cattail-world-editor-shell__tool--creative[data-creative="true"]:active:not(:disabled):not([aria-disabled="true"]) {
					transform: translateY(1px);
					box-shadow: var(--world-editor-hell-gem-glass-shadow-pressed);
				}
				.cattail-world-editor-shell__tool--creative[data-creative="true"]:focus-visible:not(:disabled) {
					box-shadow: var(--world-editor-hell-gem-glass-shadow), 0 0 0 2px var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell__tool--draw[data-active="true"] {
					border-color: color-mix(in srgb, rgba(255, 255, 255, .88) 54%, var(--world-editor-draw-pink-1));
					background: var(--world-editor-draw-pink-glass);
					background-blend-mode: screen, screen, screen, normal;
					backdrop-filter: var(--world-editor-glass-backdrop);
					-webkit-backdrop-filter: var(--world-editor-glass-backdrop);
					box-shadow: var(--world-editor-draw-pink-glass-shadow);
					color: #2c1321;
				}
				.cattail-world-editor-shell__tool--draw[data-active="true"]:hover:not(:disabled):not([aria-disabled="true"]) {
					border-color: color-mix(in srgb, rgba(255, 255, 255, .96) 68%, var(--world-editor-draw-pink-1));
					background: var(--world-editor-draw-pink-glass-hover);
					box-shadow: var(--world-editor-draw-pink-glass-shadow-hover);
					color: #2c1321;
				}
				.cattail-world-editor-shell__tool--draw[data-active="true"]:active:not(:disabled):not([aria-disabled="true"]) {
					transform: translateY(1px);
					box-shadow: var(--world-editor-draw-pink-glass-shadow-pressed);
				}
				.cattail-world-editor-shell__tool--draw[data-active="true"]:focus-visible:not(:disabled) {
					box-shadow: var(--world-editor-draw-pink-glass-shadow), 0 0 0 2px var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell__tool:disabled {
					opacity: .38;
					cursor: default;
				}
				.cattail-world-editor-shell__tool--creative[data-creative="true"]:disabled,
				.cattail-world-editor-shell__tool--creative[data-creative="true"][aria-disabled="true"] {
					box-shadow: none;
				}
				.cattail-world-editor-shell__tool[aria-disabled="true"] {
					opacity: .38;
					cursor: default;
				}
				.cattail-world-editor-shell__tool[aria-disabled="true"]:hover {
					color: var(--world-editor-shell-muted);
				}
				.cattail-world-editor-shell__card-icon,
				.cattail-world-editor-shell__card-label,
				.cattail-world-editor-blueprint-card-icon,
				.cattail-world-editor-toolbar-card-label {
					display: none;
				}
				.cattail-world-editor-shell__hint {
					margin-left: auto;
					padding-left: 14px;
					border-left: 1px solid var(--world-editor-shell-border);
					color: var(--world-editor-shell-muted);
					font-size: 13px;
				}
				.cattail-world-editor-shell__history-status {
					display: none;
					max-width: min(520px, calc(var(--world-editor-toolbar-layout-width, calc(100vw - 24px)) - 28px));
					box-sizing: border-box;
					padding: 7px 12px;
					border: 1px solid var(--world-editor-shell-border);
					border-radius: 999px;
					background: var(--world-editor-shell-bg);
					box-shadow: var(--world-editor-shell-shadow);
					backdrop-filter: blur(12px) saturate(1.08);
					-webkit-backdrop-filter: blur(12px) saturate(1.08);
					color: var(--world-editor-shell-text);
					font: 600 12px/1.35 Montserrat, Arial, sans-serif;
					text-align: center;
					white-space: normal;
					pointer-events: none;
				}
				.cattail-world-editor-shell__history-status[data-active="true"] {
					display: block;
				}
				.cattail-world-editor-shell__history-status[data-kind="busy"] {
					border-color: var(--world-editor-history-busy);
				}
				.cattail-world-editor-shell__history-status[data-kind="success"] {
					border-color: var(--world-editor-history-success);
				}
				.cattail-world-editor-shell__history-status[data-kind="warning"] {
					border-color: var(--world-editor-history-warning);
				}
				.cattail-world-editor-shell__history-status[data-kind="error"],
				.cattail-world-editor-shell__history-status[data-kind="terminal"] {
					border-color: var(--world-editor-history-error);
				}
				.cattail-world-editor-shell__paint-palette {
					width: min(760px, var(--world-editor-toolbar-layout-width, calc(100vw - 24px)));
					max-height: min(520px, calc(100vh - 170px));
					box-sizing: border-box;
					overflow: hidden;
					padding: 14px;
					border: 1px solid var(--world-editor-shell-active-border);
					border-radius: 12px;
					background: var(--world-editor-shell-bg);
					box-shadow: var(--world-editor-shell-shadow);
					backdrop-filter: blur(16px) saturate(1.14);
					-webkit-backdrop-filter: blur(16px) saturate(1.14);
					color: var(--world-editor-shell-text);
					font: 600 12px/1.3 Montserrat, Arial, sans-serif;
					white-space: normal;
					pointer-events: auto;
				}
				.cattail-world-editor-shell__paint-palette[hidden] { display: none !important; }
				.cattail-world-editor-shell__paint-palette-title {
					margin: 0 0 10px;
					font: 700 15px/1.3 Montserrat, Arial, sans-serif;
					text-align: left;
				}
				.cattail-world-editor-shell__paint-palette-headings,
				.cattail-world-editor-shell__paint-palette-row {
					display: grid;
					grid-template-columns: 25px minmax(112px, 1fr) minmax(250px, 2fr) 72px 64px;
					gap: 8px;
					align-items: center;
				}
				.cattail-world-editor-shell__paint-palette-headings {
					padding: 0 8px 6px;
					color: var(--world-editor-shell-muted);
					font-size: 12px;
					font-weight: 700;
					letter-spacing: .04em;
					text-transform: uppercase;
				}
				.cattail-world-editor-shell__paint-palette-headings [data-world-editor-palette-heading="resource"] { grid-column: 1 / 3; }
				.cattail-world-editor-shell__paint-palette-headings [data-world-editor-palette-heading="weight"] { grid-column: 3; }
				.cattail-world-editor-shell__paint-palette-headings [data-world-editor-palette-heading="normalized"] { grid-column: 4; }
				.cattail-world-editor-shell__paint-palette-headings [data-world-editor-palette-heading="slots"] { grid-column: 5; }
				.cattail-world-editor-shell__paint-palette-rows {
					display: grid;
					gap: 4px;
					padding: 2px 4px 2px 0;
				}
				.cattail-world-editor-shell__paint-palette-row {
					min-height: 34px;
					padding: 4px 8px;
					border-radius: 7px;
					background: var(--world-editor-shell-group);
				}
				.cattail-world-editor-shell__paint-palette-swatch {
					width: 25px;
					height: 25px;
					box-sizing: border-box;
					border: 1px solid var(--world-editor-shell-border);
					border-radius: 5px;
					box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .36);
				}
				.cattail-world-editor-shell__paint-palette-name {
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}
				.cattail-world-editor-shell__paint-palette-weight-control { min-width: 0; }
				.cattail-world-editor-shell__paint-palette .cattail-world-editor-shell__paint-palette-weight-control .modloader-config-slider {
					grid-template-columns: minmax(0, 1fr) 66px;
				}
				.cattail-world-editor-shell__paint-palette .cattail-world-editor-shell__paint-palette-weight-control .modloader-config-slider-reset {
					display: none !important;
				}
				.cattail-world-editor-shell__paint-palette-value {
					color: var(--world-editor-shell-muted);
					font-variant-numeric: tabular-nums;
					text-align: right;
				}
				.cattail-world-editor-shell__paint-palette-action {
					min-height: 28px;
					box-sizing: border-box;
					padding: 5px 9px;
					border: 1px solid var(--world-editor-shell-border);
					border-radius: 6px;
					background: var(--world-editor-shell-chip);
					color: var(--world-editor-shell-text);
					font: 600 11px/1.2 Montserrat, Arial, sans-serif;
					cursor: pointer;
					outline: none;
					transition: background .12s ease, border-color .12s ease, box-shadow .12s ease, color .12s ease, opacity .12s ease, transform .08s ease;
				}
				.cattail-world-editor-shell__paint-palette-action:hover:not(:disabled) { background: var(--world-editor-shell-hover-bg); }
				.cattail-world-editor-shell__paint-palette-actions {
					display: flex;
					justify-content: flex-end;
					gap: 8px;
					padding-top: 10px;
				}
				.cattail-world-editor-shell__paint-palette-action--primary:not(:disabled) {
					border-color: color-mix(in srgb, rgba(255, 255, 255, .88) 54%, var(--world-editor-hell-gem-1));
					background: var(--world-editor-hell-gem-glass);
					background-blend-mode: screen, screen, screen, normal;
					backdrop-filter: var(--world-editor-glass-backdrop);
					-webkit-backdrop-filter: var(--world-editor-glass-backdrop);
					box-shadow: var(--world-editor-hell-gem-glass-shadow);
					color: #17200c;
				}
				.cattail-world-editor-shell__paint-palette-action--primary:hover:not(:disabled) {
					border-color: color-mix(in srgb, rgba(255, 255, 255, .96) 68%, var(--world-editor-hell-gem-1));
					background: var(--world-editor-hell-gem-glass-hover);
					box-shadow: var(--world-editor-hell-gem-glass-shadow-hover);
					color: #17200c;
				}
				.cattail-world-editor-shell__paint-palette-action--primary:active:not(:disabled) {
					transform: translateY(1px);
					box-shadow: var(--world-editor-hell-gem-glass-shadow-pressed);
				}
				.cattail-world-editor-shell__paint-palette-action--primary:focus-visible:not(:disabled) {
					box-shadow: var(--world-editor-hell-gem-glass-shadow), 0 0 0 2px var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell__paint-palette-action:disabled { opacity: .38; cursor: default; }
				.cattail-world-editor-shell__paint-palette-action--primary:disabled { box-shadow: none; }
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-shell__actions {
					gap: 0;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-shell__group {
					position: relative;
					gap: 4px;
					padding: 3px 4px;
					border: 0;
					border-radius: 0;
					background: transparent;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-shell__group:not([data-world-editor-toolbar-group="selection"])::before {
					content: "";
					position: absolute;
					left: 0;
					top: 5px;
					bottom: 5px;
					width: 1px;
					background: var(--world-editor-shell-border);
					pointer-events: none;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-controls,
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-transform-controls[data-world-editor-transform-controls="toolbar"] {
					gap: 4px;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-modes {
					gap: 4px;
					border: 0;
					border-radius: 0;
					overflow: visible;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-mode {
					display: inline-grid;
					width: 30px;
					min-width: 30px !important;
					padding: 0 !important;
					place-items: center;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-mode .cattail-world-editor-blueprint-compact-label {
					display: none;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-mode .cattail-world-editor-blueprint-card-icon {
					position: relative;
					z-index: 1;
					display: inline-block;
					width: auto;
					height: auto;
					color: var(--world-editor-shell-muted);
					font: 700 20px/1 Montserrat, Arial, sans-serif;
					pointer-events: none;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-shell__tool,
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-mode,
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-icon-button,
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-transform-button {
					position: relative;
					border: 0 !important;
					border-radius: 0;
					background: transparent !important;
					box-shadow: none !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-shell__tool:hover:not(:disabled):not([aria-disabled="true"]),
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-mode:hover:not(:disabled),
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-icon-button:hover:not(:disabled),
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-transform-button:hover:not(:disabled) {
					border-radius: 5px;
					border: 0 !important;
					background: var(--world-editor-shell-hover-bg) !important;
					box-shadow: none !important;
					color: var(--world-editor-shell-hover-color) !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([aria-disabled="true"]) .cattail-world-editor-blueprint-card-icon {
					color: var(--world-editor-shell-hover-color) !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([aria-disabled="true"]) canvas,
				.cattail-world-editor-shell[data-toolbar-style="compact"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([aria-disabled="true"]) .cattail-world-editor-transform-icon[data-asset="true"] img {
					filter: var(--world-editor-shell-hover-filter);
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-shell__tool[data-active="true"],
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-mode[data-active="true"],
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-icon-button[data-active="true"],
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-transform-button[data-active="true"] {
					border-radius: 5px;
					background: var(--world-editor-shell-active) !important;
					color: var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-mode[data-active="true"] {
					background: transparent !important;
					box-shadow: inset 0 -3px 0 var(--world-editor-hell-gem-3, #4CB96B) !important;
					color: var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-mode[data-active="true"]:hover:not(:disabled) {
					background: var(--world-editor-shell-hover-bg) !important;
					box-shadow: inset 0 -3px 0 var(--world-editor-hell-gem-3, #4CB96B) !important;
					color: var(--world-editor-shell-hover-color) !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] [data-world-editor-toolbar-group="draw"] .cattail-world-editor-shell__tool[data-active="true"]:not(.cattail-world-editor-shell__tool--draw) {
					background: transparent !important;
					box-shadow: inset 0 -3px 0 var(--world-editor-hell-gem-3, #4CB96B) !important;
					color: var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] [data-world-editor-toolbar-group="draw"] .cattail-world-editor-shell__tool[data-active="true"]:not(.cattail-world-editor-shell__tool--draw):hover:not(:disabled):not([aria-disabled="true"]) {
					background: var(--world-editor-shell-hover-bg) !important;
					box-shadow: inset 0 -3px 0 var(--world-editor-hell-gem-3, #4CB96B) !important;
					color: var(--world-editor-shell-hover-color) !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-shell__tool--draw[data-active="true"] {
					border-radius: 5px;
					border: 1px solid color-mix(in srgb, rgba(255, 255, 255, .88) 54%, var(--world-editor-draw-pink-1)) !important;
					background: var(--world-editor-draw-pink-glass) !important;
					background-blend-mode: screen, screen, screen, normal !important;
					backdrop-filter: var(--world-editor-glass-backdrop) !important;
					-webkit-backdrop-filter: var(--world-editor-glass-backdrop) !important;
					box-shadow: var(--world-editor-draw-pink-glass-shadow) !important;
					color: #2c1321;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-shell__tool--draw[data-active="true"]:hover:not(:disabled):not([aria-disabled="true"]) {
					border: 1px solid color-mix(in srgb, rgba(255, 255, 255, .96) 68%, var(--world-editor-draw-pink-1)) !important;
					background: var(--world-editor-draw-pink-glass-hover) !important;
					background-blend-mode: screen, screen, screen, normal !important;
					backdrop-filter: var(--world-editor-glass-backdrop) !important;
					-webkit-backdrop-filter: var(--world-editor-glass-backdrop) !important;
					box-shadow: var(--world-editor-draw-pink-glass-shadow-hover) !important;
					color: #2c1321 !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-shell__tool--draw[data-active="true"]:focus-visible:not(:disabled):not([aria-disabled="true"]) {
					box-shadow: var(--world-editor-draw-pink-glass-shadow), 0 0 0 2px var(--world-editor-shell-text) !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-shell__tool--creative[data-creative="true"] {
					border-radius: 5px;
					border: 1px solid color-mix(in srgb, rgba(255, 255, 255, .88) 54%, var(--world-editor-hell-gem-1)) !important;
					background: var(--world-editor-hell-gem-glass) !important;
					background-blend-mode: screen, screen, screen, normal !important;
					backdrop-filter: var(--world-editor-glass-backdrop) !important;
					-webkit-backdrop-filter: var(--world-editor-glass-backdrop) !important;
					box-shadow: var(--world-editor-hell-gem-glass-shadow) !important;
					color: #17200c;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-shell__tool--creative[data-creative="true"]:hover:not(:disabled):not([aria-disabled="true"]) {
					border: 1px solid color-mix(in srgb, rgba(255, 255, 255, .96) 68%, var(--world-editor-hell-gem-1)) !important;
					background: var(--world-editor-hell-gem-glass-hover) !important;
					background-blend-mode: screen, screen, screen, normal !important;
					backdrop-filter: var(--world-editor-glass-backdrop) !important;
					-webkit-backdrop-filter: var(--world-editor-glass-backdrop) !important;
					box-shadow: var(--world-editor-hell-gem-glass-shadow-hover) !important;
					color: #17200c !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-shell__tool--creative[data-creative="true"]:focus-visible:not(:disabled):not([aria-disabled="true"]) {
					box-shadow: var(--world-editor-hell-gem-glass-shadow), 0 0 0 2px var(--world-editor-shell-text) !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__toolbar-bar {
					position: relative;
					box-sizing: content-box;
					width: var(--world-editor-large-toolbar-width, 120px);
					max-width: calc(var(--world-editor-toolbar-chrome-layout-width, var(--world-editor-toolbar-layout-width, calc(100vw - 24px))) - 14px);
					padding: 6px;
					border-radius: 12px;
					overflow: visible;
					transition:
						width .22s cubic-bezier(.22, .75, .24, 1),
						background .18s ease,
						border-color .18s ease,
						color .18s ease,
						box-shadow .18s ease;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__toolbar-bar::before,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__toolbar-bar::after {
					position: absolute;
					top: 6px;
					bottom: 6px;
					z-index: 6;
					display: grid;
					width: 34px;
					place-items: center;
					color: var(--world-editor-shell-text);
					font: 700 24px/1 Montserrat, Arial, sans-serif;
					opacity: 0;
					pointer-events: none;
					transition: opacity .14s ease;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__toolbar-bar::before {
					left: 6px;
					content: "‹";
					background: linear-gradient(90deg, var(--world-editor-shell-bg) 20%, transparent);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__toolbar-bar::after {
					right: 6px;
					content: "›";
					background: linear-gradient(270deg, var(--world-editor-shell-bg) 20%, transparent);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__toolbar-bar[data-scroll-before="true"]::before,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__toolbar-bar[data-scroll-after="true"]::after {
					opacity: .72;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__actions {
					width: 100%;
					max-width: none;
					flex-wrap: nowrap;
					justify-content: flex-start;
					gap: 0;
					overflow-x: hidden;
					overflow-y: hidden;
					border-radius: 11px;
					overscroll-behavior: contain;
					scrollbar-width: none;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__actions::-webkit-scrollbar {
					display: none;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__group {
					position: relative;
					gap: 0;
					min-height: 112px;
					padding: 0;
					border: 0;
					border-radius: 0;
					background: transparent;
					opacity: 1;
					transform: translate3d(var(--world-editor-large-toolbar-scroll-residual, 0px), 0, 0);
					visibility: visible;
					will-change: transform;
					transition: opacity .16s ease, visibility 0s linear 0s;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__group[data-large-empty="true"] {
					opacity: 0;
					visibility: hidden;
					pointer-events: none;
					transition: opacity .16s ease, visibility 0s linear .22s;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__group:not([data-world-editor-toolbar-group="selection"])::before {
					content: "";
					position: absolute;
					left: 0;
					top: 8px;
					bottom: 8px;
					z-index: 4;
					width: 1px;
					background: rgba(50, 54, 60, .25);
					pointer-events: none;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-controls,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-modes,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-transform-controls[data-world-editor-transform-controls="toolbar"] {
					display: inline-flex;
					align-items: stretch;
					flex: none;
					flex-wrap: nowrap;
					gap: 0;
					height: 112px;
					border: 0;
					border-radius: 0;
					overflow: visible;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card] {
					position: relative;
					display: inline-grid !important;
					flex: 0 0 120px;
					width: 120px !important;
					min-width: 120px !important;
					max-width: 120px;
					height: 112px !important;
					min-height: 112px !important;
					box-sizing: border-box;
					padding: 14px 12px !important;
					place-items: center;
					overflow: hidden;
					border: 0 !important;
					border-left: 0 !important;
					border-radius: 0 !important;
					background: transparent;
					color: var(--world-editor-shell-muted);
					font: 650 15px/1.25 Montserrat, Arial, sans-serif;
					text-align: center;
					white-space: normal;
					opacity: 1;
					transform: translateY(0) scale(1);
					visibility: visible;
					transition:
						flex-basis .22s cubic-bezier(.22, .75, .24, 1),
						width .22s cubic-bezier(.22, .75, .24, 1),
						min-width .22s cubic-bezier(.22, .75, .24, 1),
						max-width .22s cubic-bezier(.22, .75, .24, 1),
						padding .22s cubic-bezier(.22, .75, .24, 1),
						opacity .16s ease,
						transform .22s cubic-bezier(.22, .75, .24, 1),
						visibility 0s linear 0s;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card]::after {
					content: "";
					position: absolute;
					inset: 6px 4px;
					z-index: 0;
					border-radius: 8px;
					background: transparent;
					pointer-events: none;
					transition: background .12s ease, box-shadow .12s ease;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__group > :first-child,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-controls > :first-child,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-modes > :first-child {
					border-left: 0 !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card]:not(:first-child)::before {
					content: "";
					position: absolute;
					left: 0;
					top: 16px;
					bottom: 16px;
					z-index: 4;
					width: 2px;
					background: var(--world-editor-shell-border);
					clip-path: polygon(50% 0, 100% 34%, 100% 66%, 50% 100%, 0 66%, 0 34%);
					pointer-events: none;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-group="blueprint-library"] > [data-world-editor-toolbar-card]::before {
					display: none;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([aria-disabled="true"]) {
					background: transparent;
					color: var(--world-editor-shell-hover-color) !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([aria-disabled="true"])::after {
					background: var(--world-editor-shell-hover-bg) !important;
					background-blend-mode: normal !important;
					backdrop-filter: none !important;
					-webkit-backdrop-filter: none !important;
					box-shadow: none !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([aria-disabled="true"]) .cattail-world-editor-shell__card-icon,
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([aria-disabled="true"]) .cattail-world-editor-blueprint-card-icon,
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([aria-disabled="true"]) .cattail-world-editor-blueprint-copy-icon,
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([aria-disabled="true"]) .cattail-world-editor-blueprint-clear-icon,
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([aria-disabled="true"]) .cattail-world-editor-blueprint-surge-icon,
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([aria-disabled="true"]) .cattail-world-editor-blueprint-sync-empty-icon,
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([aria-disabled="true"]) .cattail-world-editor-transform-icon {
					color: var(--world-editor-shell-hover-color) !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([aria-disabled="true"]) canvas,
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([aria-disabled="true"]) .cattail-world-editor-transform-icon[data-asset="true"] img {
					filter: var(--world-editor-shell-hover-filter);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__toolbar-bar[data-scrolling="true"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([aria-disabled="true"]):not([data-active="true"]) {
					color: var(--world-editor-shell-muted) !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__toolbar-bar[data-scrolling="true"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([aria-disabled="true"]):not([data-active="true"])::after {
					background: transparent !important;
					box-shadow: none !important;
					transition: none;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card][data-active="true"] {
					background: transparent;
					color: var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card][data-active="true"]::after {
					background: var(--world-editor-shell-active);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-mode[data-active="true"]::after {
					background: transparent;
					box-shadow: inset 0 -3px 0 var(--world-editor-hell-gem-3, #4CB96B);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-mode[data-active="true"]:hover:not(:disabled)::after {
					background: var(--world-editor-shell-hover-bg) !important;
					box-shadow: inset 0 -3px 0 var(--world-editor-hell-gem-3, #4CB96B) !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-group="draw"] .cattail-world-editor-shell__tool[data-active="true"]:not(.cattail-world-editor-shell__tool--draw)::after {
					background: transparent;
					box-shadow: inset 0 -3px 0 var(--world-editor-hell-gem-3, #4CB96B);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-group="draw"] .cattail-world-editor-shell__tool[data-active="true"]:not(.cattail-world-editor-shell__tool--draw):hover:not(:disabled):not([aria-disabled="true"])::after {
					background: var(--world-editor-shell-hover-bg) !important;
					box-shadow: inset 0 -3px 0 var(--world-editor-hell-gem-3, #4CB96B) !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__tool--draw[data-active="true"] {
					background: transparent;
					color: #2c1321;
					box-shadow: none;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__tool--draw[data-active="true"]::after {
					background: var(--world-editor-draw-pink-glass);
					background-blend-mode: screen, screen, screen, normal;
					backdrop-filter: var(--world-editor-glass-backdrop);
					-webkit-backdrop-filter: var(--world-editor-glass-backdrop);
					box-shadow: var(--world-editor-draw-pink-glass-shadow);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__tool--draw[data-active="true"]:hover:not(:disabled):not([aria-disabled="true"]),
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__tool--draw[data-active="true"]:hover:not(:disabled):not([aria-disabled="true"]) .cattail-world-editor-shell__card-icon {
					color: #2c1321 !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__tool--draw[data-active="true"]:hover:not(:disabled):not([aria-disabled="true"])::after {
					background: var(--world-editor-draw-pink-glass-hover) !important;
					background-blend-mode: screen, screen, screen, normal !important;
					backdrop-filter: var(--world-editor-glass-backdrop) !important;
					-webkit-backdrop-filter: var(--world-editor-glass-backdrop) !important;
					box-shadow: var(--world-editor-draw-pink-glass-shadow-hover) !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__tool--draw[data-active="true"]:focus-visible:not(:disabled):not([aria-disabled="true"])::after {
					box-shadow: var(--world-editor-draw-pink-glass-shadow), 0 0 0 2px var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__tool--creative[data-creative="true"] {
					background: transparent;
					color: #17200c;
					box-shadow: none;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__tool--creative[data-creative="true"]::after {
					background: var(--world-editor-hell-gem-glass);
					background-blend-mode: screen, screen, screen, normal;
					backdrop-filter: var(--world-editor-glass-backdrop);
					-webkit-backdrop-filter: var(--world-editor-glass-backdrop);
					box-shadow: var(--world-editor-hell-gem-glass-shadow);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__tool--creative[data-creative="true"]:hover:not(:disabled):not([aria-disabled="true"]),
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__tool--creative[data-creative="true"]:hover:not(:disabled):not([aria-disabled="true"]) .cattail-world-editor-shell__card-icon {
					color: #17200c !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__tool--creative[data-creative="true"]:hover:not(:disabled):not([aria-disabled="true"])::after {
					background: var(--world-editor-hell-gem-glass-hover) !important;
					background-blend-mode: screen, screen, screen, normal !important;
					backdrop-filter: var(--world-editor-glass-backdrop) !important;
					-webkit-backdrop-filter: var(--world-editor-glass-backdrop) !important;
					box-shadow: var(--world-editor-hell-gem-glass-shadow-hover) !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__tool--creative[data-creative="true"]:disabled::after,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__tool--creative[data-creative="true"][aria-disabled="true"]::after {
					box-shadow: none;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__tool--creative[data-creative="true"]:focus-visible:not(:disabled):not([aria-disabled="true"])::after {
					box-shadow: var(--world-editor-hell-gem-glass-shadow), 0 0 0 2px var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__compact-label,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__compact-icon,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-compact-label {
					display: none;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__card-label,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-toolbar-card-label {
					position: relative;
					z-index: 2;
					display: -webkit-box;
					max-width: 88px;
					overflow: hidden;
					-webkit-box-orient: vertical;
					-webkit-line-clamp: 2;
					line-clamp: 2;
					text-wrap: balance;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__card-icon,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-card-icon,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-copy-icon,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-clear-icon,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-surge-icon,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-sync-empty-icon,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-transform-icon,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-icon-button canvas {
					position: absolute;
					left: 50%;
					top: 50%;
					z-index: 1;
					display: block;
					width: 48px;
					height: 48px;
					color: rgb(150, 154, 160) !important;
					font-size: 48px;
					line-height: 48px;
					opacity: .12 !important;
					transform: translate(-50%, -50%);
					pointer-events: none;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-sync-empty-icon::before {
					inset: 10px 0;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-transform-icon[data-icon="rotate-counterclockwise"] {
					transform: translate(-50%, -50%) scaleX(-1);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-transform-icon[data-icon="mirror-u"],
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-transform-icon[data-icon="mirror-v"] {
					transform: translate(-50%, -50%) rotate(45deg);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card]:disabled {
					opacity: .42;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-large-hidden="true"],
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card][aria-disabled="true"]:not([data-world-editor-toolbar-busy="true"]) {
					display: inline-grid !important;
					flex: 0 0 0;
					width: 0 !important;
					min-width: 0 !important;
					max-width: 0;
					padding-left: 0 !important;
					padding-right: 0 !important;
					opacity: 0;
					transform: translateY(-8px) scale(.9);
					visibility: hidden;
					pointer-events: none;
					transition:
						flex-basis .22s cubic-bezier(.22, .75, .24, 1),
						width .22s cubic-bezier(.22, .75, .24, 1),
						min-width .22s cubic-bezier(.22, .75, .24, 1),
						max-width .22s cubic-bezier(.22, .75, .24, 1),
						padding .22s cubic-bezier(.22, .75, .24, 1),
						opacity .16s ease,
						transform .22s cubic-bezier(.22, .75, .24, 1),
						visibility 0s linear .22s;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card][hidden] {
					display: inline-grid !important;
					flex: 0 0 0;
					width: 0 !important;
					min-width: 0 !important;
					max-width: 0;
					padding-left: 0 !important;
					padding-right: 0 !important;
					opacity: 0;
					transform: translateY(-8px) scale(.9);
					visibility: hidden;
					pointer-events: none;
					transition:
						flex-basis .22s cubic-bezier(.22, .75, .24, 1),
						width .22s cubic-bezier(.22, .75, .24, 1),
						min-width .22s cubic-bezier(.22, .75, .24, 1),
						max-width .22s cubic-bezier(.22, .75, .24, 1),
						padding .22s cubic-bezier(.22, .75, .24, 1),
						opacity .16s ease,
						transform .22s cubic-bezier(.22, .75, .24, 1),
						visibility 0s linear .22s;
				}
				@media (prefers-reduced-motion: reduce) {
					.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__toolbar-bar,
					.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__group,
					.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card] {
						transition: none !important;
					}
				}
				.cattail-world-editor-economy-status {
					--world-editor-economy-bg: rgba(248, 248, 246, .94);
					--world-editor-economy-text: rgba(18, 20, 22, .92);
					--world-editor-economy-border: rgba(181, 125, 34, .5);
					position: fixed;
					top: max(70px, calc(env(safe-area-inset-top) + 58px));
					left: 50%;
					z-index: 49;
					max-width: min(520px, calc(100vw - 24px));
					box-sizing: border-box;
					padding: 8px 13px;
					border: 1px solid var(--world-editor-economy-border);
					border-radius: 999px;
					background: var(--world-editor-economy-bg);
					box-shadow: 0 10px 28px rgba(0, 0, 0, .2);
					backdrop-filter: blur(12px) saturate(1.08);
					-webkit-backdrop-filter: blur(12px) saturate(1.08);
					color: var(--world-editor-economy-text);
					font: 600 12px/1.35 Montserrat, Arial, sans-serif;
					text-align: center;
					white-space: normal;
					visibility: hidden;
					opacity: 0;
					transform: translate(-50%, -6px);
					pointer-events: none;
					transition: opacity .16s ease-out, transform .16s ease-out, visibility 0s linear .16s;
				}
				.cattail-world-editor-economy-status[data-theme="void"] {
					--world-editor-economy-bg: rgba(8, 10, 12, .94);
					--world-editor-economy-text: rgba(255, 255, 255, .94);
					--world-editor-economy-border: rgba(240, 201, 106, .58);
					box-shadow: 0 10px 30px rgba(0, 0, 0, .42);
				}
				.cattail-world-editor-economy-status[data-phase="success"] {
					--world-editor-economy-border: rgba(91, 170, 91, .62);
				}
				.cattail-world-editor-economy-status[data-phase="cancelled"] {
					--world-editor-economy-border: rgba(205, 142, 44, .68);
				}
				.cattail-world-editor-economy-status[data-phase="failed"] {
					--world-editor-economy-border: rgba(198, 71, 71, .72);
				}
				.cattail-world-editor-economy-status[data-visible="true"] {
					visibility: visible;
					opacity: 1;
					transform: translate(-50%, 0);
					transition-delay: 0s;
				}
				.cattail-world-editor-creative-dialog__field {
					display: grid;
					gap: 7px;
					color: var(--world-editor-dialog-muted);
					font-size: 13px;
					font-weight: 600;
				}
				.cattail-world-editor-creative-dialog__input {
					box-sizing: border-box;
					width: 100%;
					min-height: 40px;
					border: 1px solid var(--world-editor-dialog-border);
					border-radius: 6px;
					padding: 8px 10px;
					background: var(--world-editor-dialog-control);
					color: var(--world-editor-dialog-text);
					font: 500 14px/1.3 Montserrat, Arial, sans-serif;
					outline: none;
					user-select: text !important;
					-webkit-user-select: text !important;
				}
				.cattail-world-editor-creative-dialog__input:focus {
					border-color: var(--world-editor-dialog-accent);
					box-shadow: 0 0 0 2px color-mix(in srgb, var(--world-editor-dialog-accent) 24%, transparent);
				}
				.cattail-world-editor-creative-dialog__preview,
				.cattail-world-editor-creative-dialog__status {
					color: var(--world-editor-dialog-muted);
					font-size: 13px;
					line-height: 1.45;
					overflow-wrap: anywhere;
				}
				@media (max-width: 900px) {
					.cattail-world-editor-shell__status-bar {
						gap: 10px;
						padding: 8px 10px;
					}
					.cattail-world-editor-shell__toolbar-bar { padding: 7px 8px; }
					.cattail-world-editor-shell__actions {
						justify-content: center;
						gap: 7px;
					}
					.cattail-world-editor-shell__group { padding-inline: 5px; }
				}
				@media (max-width: 520px) {
					.cattail-world-editor-shell__identity,
					.cattail-world-editor-shell__divider,
					.cattail-world-editor-shell__hint { display: none; }
					.cattail-world-editor-shell__status-bar { justify-content: center; }
					.cattail-world-editor-shell__mode { font-size: 16px; }
					.cattail-world-editor-shell__tool { padding-inline: 8px; }
				}
			`
			document.head.append(style)
			return style
		}

		function finitePositive(value, fallback) {
			const number = Number(value)
			return Number.isFinite(number) && number > 0 ? number : Number(fallback) || 0
		}

		function responsiveViewport(game) {
			const fallbackWidth = finitePositive(
				typeof window !== 'undefined' ? window.innerWidth : 0,
				document.documentElement?.clientWidth || UI_SCALE_BASE_WIDTH
			)
			const fallbackHeight = finitePositive(
				typeof window !== 'undefined' ? window.innerHeight : 0,
				document.documentElement?.clientHeight || UI_SCALE_BASE_HEIGHT
			)
			const widths = [fallbackWidth]
			const heights = [fallbackHeight]
			for (const element of uiScaleTargets(game)) {
				const rect = element?.getBoundingClientRect?.()
				const width = finitePositive(rect?.width, 0)
				const height = finitePositive(rect?.height, 0)
				if (width) widths.push(width)
				if (height) heights.push(height)
			}
			return {
				width: Math.min(...widths),
				height: Math.min(...heights)
			}
		}

		function uiScaleTargets(game) {
			const canvas = game?.canvas
			const host = canvas?.parentElement
			return Array.from(new Set([canvas, host])).filter(function (element) {
				return !!(
					element &&
					element !== document.body &&
					element !== document.documentElement &&
					typeof element.getBoundingClientRect === 'function'
				)
			})
		}

		function createUiScaleObserver(game, refresh) {
			const Observer = globalThis.ResizeObserver
			if (typeof Observer !== 'function') return null
			const observer = new Observer(function () {
				refresh()
			})
			for (const target of uiScaleTargets(game)) {
				try {
					observer.observe(target)
				} catch (error) {
					console.warn('[Cattail World Editor] UI scale observer skipped an unsupported target.', error)
				}
			}
			return observer
		}

		function readStyleProperty(style, property) {
			if (!style) return ''
			if (typeof style.getPropertyValue === 'function') return style.getPropertyValue(property)
			return String(style[property] || '')
		}

		function writeStyleProperty(style, property, value) {
			if (!style) return
			if (value) {
				if (typeof style.setProperty === 'function') style.setProperty(property, value)
				else style[property] = value
				return
			}
			if (typeof style.removeProperty === 'function') style.removeProperty(property)
			else delete style[property]
		}

		function isRange(value) {
			return !!(
				value &&
				Array.isArray(value.start) &&
				Array.isArray(value.end) &&
				value.start.length >= 2 &&
				value.end.length >= 2 &&
				Number.isInteger(Number(value.start[0])) &&
				Number.isInteger(Number(value.start[1])) &&
				Number.isInteger(Number(value.end[0])) &&
				Number.isInteger(Number(value.end[1])) &&
				Number.isInteger(Number(value.width)) &&
				Number.isInteger(Number(value.height)) &&
				Number(value.width) > 0 &&
				Number(value.height) > 0
			)
		}

		function formatCount(template, count) {
			return String(template || '').replace(/\{count\}/g, String(count))
		}

		function formatTemplate(template, values) {
			return String(template || '').replace(/\{(\w+)\}/g, function (match, key) {
				return Object.hasOwn(values || {}, key) ? String(values[key]) : match
			})
		}
	}
})
