ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const MOD_ID = api.id
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const TOOL_KEY = Symbol.for('cattail.world-editor.tool')
		const CREATIVE_KEY = Symbol.for('cattail.world-editor.creative-mode')
		const CREATIVE_ECONOMY_KEY = Symbol.for('cattail.world-editor.creative-economy')
		const DIALOGS_KEY = Symbol.for('cattail.world-editor.dialogs')
		const TOOLBAR_SCROLL_PROBE_KEY = Symbol.for('cattail.world-editor.toolbar-scroll-probe')
		const SAVE_SLOTS_KEY = Symbol.for('cattail.better-uis.save-slots')
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
		const LARGE_TOOLBAR_CONFIG_KEY = 'largeToolbarCards'
		const LARGE_TOOLBAR_SCROLL_RESIDUAL_PROPERTY = '--world-editor-large-toolbar-scroll-residual'
		const LARGE_TOOLBAR_CARD_WIDTH = 120
		const LARGE_TOOLBAR_VISIBLE_LIMIT = 8
		const LARGE_TOOLBAR_SNAP_MS = 400
		const LARGE_TOOLBAR_DECAY_PER_FRAME = .94
		const LARGE_TOOLBAR_STOP_VELOCITY = .01
		let refreshMountedText = null
		let refreshMountedTheme = null

		api.on('afterVanillaScripts', function () {
			if (typeof Game === 'undefined' || !Game.prototype || typeof Game.prototype.switchPlane !== 'function') return
			api.patch(Game.prototype, 'switchPlane', function (original) {
				return function (...args) {
					const result = original.apply(this, args)
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
			const selection = globalThis[SELECTION_KEY]
			const tool = globalThis[TOOL_KEY]
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
				!selection ||
				selection.game !== game ||
				typeof selection.subscribe !== 'function'
			) {
				console.warn('[Cattail World Editor] Toolbar 2G could not find the selection state.')
				return
			}
			if (!tool || typeof tool.subscribe !== 'function' || typeof tool.setMode !== 'function') {
				console.warn('[Cattail World Editor] Toolbar 2E could not find the tool state.')
				return
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

			document.getElementById(SHELL_ID)?.remove()
			document.getElementById(ECONOMY_STATUS_ID)?.remove()
			const style = ensureStyle()
			const shell = createShell()
			const economyStatus = createEconomyStatus()
			document.body.append(shell, economyStatus)
			const rootStyle = document.documentElement?.style
			const previousScale = readStyleProperty(rootStyle, '--world-editor-ui-scale')
			const previousToolbarWidth = readStyleProperty(rootStyle, '--world-editor-toolbar-layout-width')

			let currentState = runtime.snapshot()
			let currentSelection = selection.snapshot()
			let currentTool = tool.snapshot()
			let currentCreative = creative.snapshot()
			let currentCreativeEconomy = creativeEconomy.snapshot()
			let gameHudHidden = api.ui.hud.isHidden()
			let vanillaHudHidden = api.ui.isVanillaGameHudHidden(game)
			let creativeDialog = null
			const selectButton = shell.querySelector('[data-world-editor-action="select"]')
			const removeButton = shell.querySelector('[data-world-editor-action="remove-selection"]')
			const creativeButton = shell.querySelector('[data-world-editor-action="creative-mode"]')
			const actions = (selectButton.parentElement || selectButton.parentNode)?.parentElement ||
				(selectButton.parentElement || selectButton.parentNode)?.parentNode
			const toolbarBar = actions?.parentElement || actions?.parentNode
			const compactStyleButton = shell.querySelector('[data-world-editor-action="toolbar-style-compact"]')
			const largeStyleButton = shell.querySelector('[data-world-editor-action="toolbar-style-cards"]')
			const toolbarScroller = createLargeToolbarScroller(shell, toolbarBar, actions)
			const previousToolbarScrollProbe = globalThis[TOOLBAR_SCROLL_PROBE_KEY]
			globalThis[TOOLBAR_SCROLL_PROBE_KEY] = toolbarScroller.probe
			let largeToolbarCards = api.config?.get?.(LARGE_TOOLBAR_CONFIG_KEY, false) === true
			const accessibleText = {
				brand: '',
				mode: '',
				count: '',
				remove: '',
				creative: '',
				exitHint: ''
			}

			const refreshAccessibility = function () {
				shell.setAttribute('aria-label', [
					accessibleText.brand,
					accessibleText.mode,
					accessibleText.count,
					accessibleText.remove,
					accessibleText.creative,
					accessibleText.exitHint
				].filter(Boolean).join('. ') + '.')
			}

			const refreshText = function (languageGame) {
				const source = languageGame || game
				const brand = i18n.t(source, 'brand')
				shell.querySelector('[data-world-editor-text="brand"]').textContent = brand
				const selectText = i18n.t(source, 'toolSelect')
				shell.querySelector('[data-world-editor-text="tool-select"]').textContent = selectText
				selectButton.title = selectText
				selectButton.setAttribute('aria-label', selectText)
				const removeText = i18n.t(source, 'removeSelection')
				removeButton.title = removeText
				removeButton.setAttribute('aria-label', removeText)
				setCardText(selectButton, i18n.t(source, 'toolbarCardSelect'))
				setCardText(removeButton, i18n.t(source, 'toolbarCardRemove'))
				setCardText(creativeButton, i18n.t(source, 'toolbarCardCreative'))
				const compactStyleText = i18n.t(source, 'toolbarStyleCompact')
				const largeStyleText = i18n.t(source, 'toolbarStyleLargeCards')
				compactStyleButton.title = compactStyleText
				compactStyleButton.setAttribute('aria-label', compactStyleText)
				largeStyleButton.title = largeStyleText
				largeStyleButton.setAttribute('aria-label', largeStyleText)
				accessibleText.brand = brand
				accessibleText.remove = removeText
				refreshCreative(source)
				refreshEconomyStatus(source)
				refreshTool(source)
				refreshHint(source)
				refreshSelectionCount(source)
				refreshAccessibility()
			}

			const refreshTool = function (languageGame) {
				const source = languageGame || game
				const mode = i18n.t(source, 'toolbarModeArea')
				shell.dataset.mode = 'select'
				shell.querySelector('[data-world-editor-text="mode"]').textContent = mode
				selectButton.setAttribute('aria-pressed', 'true')
				selectButton.dataset.active = 'true'
				accessibleText.mode = mode
				refreshAccessibility()
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
				const removeAvailable = (
					typeof selection.removePrimary === 'function' &&
					Number.isInteger(currentSelection?.primaryId)
				)
				removeButton.disabled = !removeAvailable || isRange(currentSelection?.previewRange)
				removeButton.dataset.worldEditorLargeHidden = removeAvailable ? 'false' : 'true'
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
				creativeButton.title = currentCreative?.error?.message || label
				creativeButton.setAttribute('aria-label', label)
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
				const text = key ? i18n.t(source, key) : ''
				economyStatus.dataset.phase = phase
				economyStatus.dataset.active = key ? 'true' : 'false'
				economyStatus.textContent = text
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
				writeStyleProperty(rootStyle, '--world-editor-ui-scale', String(roundedScale))
				writeStyleProperty(
					rootStyle,
					'--world-editor-toolbar-layout-width',
					Math.max(0, (viewportWidth - 24) / scale) + 'px'
				)
				shell.dataset.uiScale = String(roundedScale)
				toolbarScroller.refresh('ui-scale')
			}

			const stopStateSubscription = runtime.subscribe(function (state) {
				currentState = state
				if (!state.active && creativeDialog && !currentCreative?.busy) closeCreativeDialog('editor-inactive')
				refreshVisibility()
			})

			const stopSelectionSubscription = selection.subscribe(function (state) {
				currentSelection = state
				refreshSelectionCount(game)
				refreshTool(game)
			})

			const stopToolSubscription = tool.subscribe(function (state) {
				currentTool = state
				refreshTool(game)
			})
			const stopCreativeSubscription = creative.subscribe(function (state) {
				currentCreative = state
				refreshCreative(game)
			})
			const stopCreativeEconomySubscription = creativeEconomy.subscribe(function (state) {
				currentCreativeEconomy = state
				refreshCreative(game)
				refreshEconomyStatus(game)
			})

			const handleSelectClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				if (selection.hasPreview()) selection.cancelPreview('toolbar-select')
				tool.setMode('select', 'toolbar-select')
			}

			const handleRemoveClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				if (selection.hasPreview()) return
				if (typeof selection.removePrimary === 'function') {
					selection.removePrimary('toolbar-remove-primary')
				}
			}

			const handleCreativeClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				if (!currentCreative?.ready || currentCreative.busy || currentCreativeEconomy?.busy) return
				if (currentCreative.creativeMode) openDisableCreativeDialog()
				else openEnableCreativeDialog()
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
			}

			function openEnableCreativeDialog() {
				closeCreativeDialog('replace-dialog', true)
				creative.setDialogOpen(true, 'enable-dialog-opened')
				const dialog = createCreativeDialog('enable')
				const enableCurrent = createDialogButton(dialog, 'creativeEnableCurrent', true)
				const createCopy = createDialogButton(dialog, 'creativeCreateCopy', true)
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
					if (dialog.busy) return
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
					} else if (Number(slotsState.emptyCount) < 2) {
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
						message: 'creativeEnableMessage'
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

			function createDialogButton(dialog, textKey, primary) {
				const button = dialog.createButton('', { primary })
				button.dataset.creativeText = textKey
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
				dialog.showError(operationError?.message || i18n.t(game, 'creativeOperationFailed'))
			}

			function closeCreativeDialog(reason, force) {
				const dialog = creativeDialog
				if (!dialog || (dialog.busy && !force)) return false
				return dialog.close(reason || 'dialog-closed', force)
			}

			selectButton.addEventListener('click', handleSelectClick)
			removeButton.addEventListener('click', handleRemoveClick)
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
			window.addEventListener('resize', refreshUiScale)
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

			runtime.addCleanup(function () {
				if (refreshMountedText === refreshText) refreshMountedText = null
				if (refreshMountedTheme === refreshTheme) refreshMountedTheme = null
				if (creativeDialog) closeCreativeDialog('shell-cleanup', true)
				window.removeEventListener('modloader:game-hud', handleGameHud)
				window.removeEventListener('modloader:vanilla-game-hud', handleVanillaGameHud)
				window.removeEventListener('modloader:config-preview', handleToolbarConfigPreview)
				window.removeEventListener('cattail:world-editor-toolbar-layout', handleToolbarLayoutChange)
				window.removeEventListener('resize', refreshUiScale)
				uiScaleObserver?.disconnect?.()
				toolbarScroller.dispose()
				if (globalThis[TOOLBAR_SCROLL_PROBE_KEY] === toolbarScroller.probe) {
					if (previousToolbarScrollProbe === undefined) delete globalThis[TOOLBAR_SCROLL_PROBE_KEY]
					else globalThis[TOOLBAR_SCROLL_PROBE_KEY] = previousToolbarScrollProbe
				}
				if (typeof stopStateSubscription === 'function') stopStateSubscription()
				if (typeof stopSelectionSubscription === 'function') stopSelectionSubscription()
				if (typeof stopToolSubscription === 'function') stopToolSubscription()
				if (typeof stopCreativeSubscription === 'function') stopCreativeSubscription()
				if (typeof stopCreativeEconomySubscription === 'function') stopCreativeEconomySubscription()
				selectButton.removeEventListener('click', handleSelectClick)
				removeButton.removeEventListener('click', handleRemoveClick)
				creativeButton.removeEventListener('click', handleCreativeClick)
				compactStyleButton.removeEventListener('click', handleCompactStyleClick)
				largeStyleButton.removeEventListener('click', handleLargeStyleClick)
				if (typeof releaseHud === 'function') releaseHud()
				if (typeof releaseEconomyHud === 'function') releaseEconomyHud()
				writeStyleProperty(rootStyle, '--world-editor-ui-scale', previousScale)
				writeStyleProperty(rootStyle, '--world-editor-toolbar-layout-width', previousToolbarWidth)
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
			const selectButton = createToolButton('select', 'tool-select', 'select', '⌗')
			const removeButton = createIconButton('remove-selection', '×', 'remove', '×')
			const creativeButton = createToolButton('creative-mode', 'creative-mode', 'creative', '✦')
			creativeButton.className += ' cattail-world-editor-shell__tool--creative'
			creativeButton.dataset.active = 'false'
			creativeButton.dataset.creative = 'false'

			const selectionGroup = createToolbarGroup('selection')
			const historyGroup = createToolbarGroup('history')
			const blueprintGroup = createToolbarGroup('blueprint')
			const transformGroup = createToolbarGroup('transform')
			const creativeGroup = createToolbarGroup('creative')
			historyGroup.dataset.worldEditorSlot = 'history'
			blueprintGroup.dataset.worldEditorSlot = 'blueprint'
			transformGroup.dataset.worldEditorSlot = 'transform'
			selectionGroup.append(selectButton, removeButton)
			creativeGroup.append(creativeButton)
			actions.append(selectionGroup, historyGroup, blueprintGroup, transformGroup, creativeGroup)

			const hint = document.createElement('span')
			hint.className = 'cattail-world-editor-shell__hint'
			hint.dataset.worldEditorText = 'hint'

			const toolbarStyleSwitch = document.createElement('span')
			toolbarStyleSwitch.className = 'cattail-world-editor-shell__style-switch'
			toolbarStyleSwitch.setAttribute('role', 'group')
			const compactStyleButton = createToolbarStyleButton('compact', '≡')
			const largeStyleButton = createToolbarStyleButton('cards', '▦')
			toolbarStyleSwitch.append(compactStyleButton, largeStyleButton)

			statusBar.append(identity, divider, status, hint)
			statusBar.append(toolbarStyleSwitch)
			toolbarBar.append(actions)
			layout.append(statusBar, toolbarBar)
			shell.append(layout)
			return shell
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
			button.dataset.active = action === 'select' ? 'true' : 'false'
			button.setAttribute('aria-pressed', action === 'select' ? 'true' : 'false')
			const label = document.createElement('span')
			label.className = 'cattail-world-editor-shell__compact-label'
			label.dataset.worldEditorText = textKey
			button.append(label)
			appendCardDecoration(button, cardKey, cardIcon)
			return button
		}

		function createIconButton(action, symbol, cardKey, cardIcon) {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = 'cattail-world-editor-shell__tool cattail-world-editor-shell__tool--icon'
			button.dataset.worldEditorAction = action
			button.dataset.worldEditorToolbarCard = ''
			button.disabled = true
			const icon = document.createElement('span')
			icon.className = 'cattail-world-editor-shell__compact-icon'
			icon.setAttribute('aria-hidden', 'true')
			icon.textContent = symbol
			button.append(icon)
			appendCardDecoration(button, cardKey, cardIcon)
			return button
		}

		function appendCardDecoration(button, cardKey, symbol) {
			const icon = document.createElement('span')
			icon.className = 'cattail-world-editor-shell__card-icon'
			icon.dataset.cardIcon = cardKey
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
				.cattail-world-editor-shell {
					--world-editor-shell-bg: rgba(248, 248, 246, .88);
					--world-editor-shell-text: rgba(18, 20, 22, .94);
					--world-editor-shell-muted: rgba(18, 20, 22, .58);
					--world-editor-shell-border: rgba(0, 0, 0, .12);
					--world-editor-shell-dot: rgba(18, 20, 22, .82);
					--world-editor-shell-chip: rgba(18, 20, 22, .07);
					--world-editor-shell-group: rgba(18, 20, 22, .035);
					--world-editor-shell-active: rgba(113, 79, 163, .16);
					--world-editor-shell-active-border: rgba(113, 79, 163, .34);
					--world-editor-shell-creative: rgba(166, 242, 70, .2);
					--world-editor-shell-creative-border: rgba(166, 242, 70, .62);
					--world-editor-shell-creative-text: rgb(91, 128, 25);
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
					--world-editor-shell-shadow: 0 10px 28px rgba(0, 0, 0, .3);
				}
				.cattail-world-editor-shell[data-visible="true"] {
					visibility: visible;
					opacity: 1;
					transform: translateY(0);
					transition-delay: 0s;
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
					transition: background .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease;
				}
				.cattail-world-editor-shell__status-bar {
					display: flex;
					align-items: center;
					gap: 14px;
					width: max-content;
					max-width: 100%;
					min-width: 0;
					padding: 10px 14px;
				}
				.cattail-world-editor-shell__toolbar-bar {
					display: flex;
					width: max-content;
					max-width: 100%;
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
				.cattail-world-editor-shell__style-button:hover,
				.cattail-world-editor-shell__style-button[data-active="true"] {
					background: var(--world-editor-shell-active);
					color: var(--world-editor-shell-text);
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
					transition: background .12s ease, border-color .12s ease, color .12s ease, opacity .12s ease;
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
				.cattail-world-editor-shell__tool:hover:not(:disabled) {
					color: var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell__tool[data-active="true"] {
					border-color: var(--world-editor-shell-active-border);
					background: var(--world-editor-shell-active);
					color: var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell__tool--creative[data-creative="true"] {
					border-color: var(--world-editor-shell-creative-border);
					background: var(--world-editor-shell-creative);
					color: var(--world-editor-shell-creative-text);
				}
				.cattail-world-editor-shell__tool:disabled {
					opacity: .38;
					cursor: default;
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
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-shell__actions {
					gap: 0;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-shell__group {
					position: relative;
					gap: 0;
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
					gap: 0;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-modes {
					border: 0;
					border-radius: 0;
					overflow: visible;
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
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-shell__tool:hover:not(:disabled),
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-mode:hover:not(:disabled),
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-icon-button:hover:not(:disabled),
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-transform-button:hover:not(:disabled) {
					border-radius: 5px;
					background: var(--world-editor-shell-chip) !important;
					color: var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-shell__tool[data-active="true"],
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-mode[data-active="true"],
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-icon-button[data-active="true"],
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-transform-button[data-active="true"] {
					border-radius: 5px;
					background: var(--world-editor-shell-active) !important;
					color: var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-shell__tool--creative[data-creative="true"] {
					border-radius: 5px;
					background: var(--world-editor-shell-creative) !important;
					color: var(--world-editor-shell-creative-text);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__toolbar-bar {
					position: relative;
					box-sizing: content-box;
					width: var(--world-editor-large-toolbar-width, 120px);
					max-width: calc(var(--world-editor-toolbar-layout-width, calc(100vw - 24px)) - 14px);
					padding: 6px;
					border-radius: 12px;
					overflow: visible;
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
					transform: translate3d(var(--world-editor-large-toolbar-scroll-residual, 0px), 0, 0);
					will-change: transform;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__group[data-large-empty="true"] {
					display: none;
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
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card]:hover:not(:disabled) {
					background: transparent;
					color: var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card]:hover:not(:disabled)::after {
					background: var(--world-editor-shell-chip);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__toolbar-bar[data-scrolling="true"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([data-active="true"]) {
					color: var(--world-editor-shell-muted);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__toolbar-bar[data-scrolling="true"] [data-world-editor-toolbar-card]:hover:not(:disabled):not([data-active="true"])::after {
					background: transparent;
					transition: none;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card][data-active="true"] {
					background: transparent;
					color: var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card][data-active="true"]::after {
					background: var(--world-editor-shell-active);
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__tool--creative[data-creative="true"] {
					background: transparent;
					color: var(--world-editor-shell-creative-text);
					box-shadow: none;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__tool--creative[data-creative="true"]::after {
					background: var(--world-editor-shell-creative);
					box-shadow: inset 0 0 0 1px var(--world-editor-shell-creative-border);
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
					display: none !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card][hidden] {
					display: none !important;
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
