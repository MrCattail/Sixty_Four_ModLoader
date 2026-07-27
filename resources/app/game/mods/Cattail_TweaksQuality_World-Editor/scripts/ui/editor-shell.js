ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const TOOL_KEY = Symbol.for('cattail.world-editor.tool')
		const CREATIVE_KEY = Symbol.for('cattail.world-editor.creative-mode')
		const CREATIVE_ECONOMY_KEY = Symbol.for('cattail.world-editor.creative-economy')
		const SAVE_SLOTS_KEY = Symbol.for('cattail.better-uis.save-slots')
		const SHELL_ID = 'cattail-world-editor-shell'
		const ECONOMY_STATUS_ID = 'cattail-world-editor-economy-status'
		const STYLE_ID = 'cattail-world-editor-shell-style'
		const DIALOG_ID = 'cattail-world-editor-creative-dialog'
		const UI_SCALE_BASE_WIDTH = 1600
		const UI_SCALE_BASE_HEIGHT = 1000
		const UI_SCALE_MIN = .5
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
				shell.querySelector('[data-world-editor-text="tool-select"]').textContent = i18n.t(source, 'toolSelect')
				const removeText = i18n.t(source, 'removeSelection')
				removeButton.title = removeText
				removeButton.setAttribute('aria-label', removeText)
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
				removeButton.disabled = (
					typeof selection.removePrimary !== 'function' ||
					!Number.isInteger(currentSelection?.primaryId) ||
					isRange(currentSelection?.previewRange)
				)
				accessibleText.count = countText
				refreshAccessibility()
			}

			const refreshTheme = function (themeGame) {
				if (themeGame && themeGame !== game) return
				shell.dataset.theme = game.plane ? 'void' : 'reality'
				economyStatus.dataset.theme = shell.dataset.theme
				if (creativeDialog?.element) creativeDialog.element.dataset.theme = shell.dataset.theme
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
				creativeButton.title = currentCreative?.error?.message || label
				creativeButton.setAttribute('aria-label', label)
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

			function openEnableCreativeDialog() {
				closeCreativeDialog('replace-dialog', true)
				creative.setDialogOpen(true, 'enable-dialog-opened')
				const dialog = createCreativeDialog('enable')
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

				const enableCurrent = createDialogButton('creativeEnableCurrent', true)
				const createCopy = createDialogButton('creativeCreateCopy', true)
				const cancel = createDialogButton('creativeCancel', false)
				dialog.actions.append(enableCurrent, createCopy, cancel)
				dialog.input = input
				dialog.preview = preview
				dialog.copyStatus = copyStatus
				dialog.enableCurrent = enableCurrent
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
						: i18n.t(game, 'creativeNameRequired')
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
				enableCurrent.addEventListener('click', async function () {
					if (dialog.busy) return
					setCreativeDialogBusy(dialog, true)
					try {
						await creative.enableInPlace('creative-dialog-current')
						closeCreativeDialog('enable-current-complete', true)
					} catch (operationError) {
						showCreativeDialogError(dialog, operationError)
						setCreativeDialogBusy(dialog, false)
						validateCopy()
					}
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
					closeCreativeDialog('enable-dialog-cancelled')
				})
				finishCreativeDialogMount(dialog)
				validateCopy()
				setTimeout(function () { input.focus(); input.select() }, 0)
			}

			function openDisableCreativeDialog() {
				closeCreativeDialog('replace-dialog', true)
				creative.setDialogOpen(true, 'disable-dialog-opened')
				const dialog = createCreativeDialog('disable')
				const confirm = createDialogButton('creativeDisableConfirm', true)
				const cancel = createDialogButton('creativeCancel', false)
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
				const element = document.createElement('div')
				element.id = DIALOG_ID
				element.className = 'cattail-world-editor-creative-dialog'
				element.dataset.theme = shell.dataset.theme
				element.dataset.kind = kind
				element.setAttribute('role', 'dialog')
				element.setAttribute('aria-modal', 'true')
				const box = document.createElement('div')
				box.className = 'cattail-world-editor-creative-dialog__box'
				const title = document.createElement('h2')
				title.className = 'cattail-world-editor-creative-dialog__title'
				title.id = DIALOG_ID + '-title'
				title.dataset.creativeText = kind === 'enable' ? 'creativeEnableTitle' : 'creativeDisableTitle'
				const message = document.createElement('p')
				message.className = 'cattail-world-editor-creative-dialog__message'
				message.dataset.creativeText = kind === 'enable' ? 'creativeEnableMessage' : 'creativeDisableMessage'
				const content = document.createElement('div')
				content.className = 'cattail-world-editor-creative-dialog__content'
				const errorNode = document.createElement('div')
				errorNode.className = 'cattail-world-editor-creative-dialog__error'
				errorNode.hidden = true
				errorNode.setAttribute('role', 'alert')
				const actions = document.createElement('div')
				actions.className = 'cattail-world-editor-creative-dialog__actions'
				box.append(title, message, content, errorNode, actions)
				element.append(box)
				element.setAttribute('aria-labelledby', title.id)
				return {
					element,
					box,
					title,
					message,
					content,
					errorNode,
					actions,
					kind,
					busy: false,
					previousFocus: document.activeElement,
					handleKeydown: null
				}
			}

			function createDialogButton(textKey, primary) {
				const button = document.createElement('button')
				button.type = 'button'
				button.className = 'cattail-world-editor-creative-dialog__button'
				if (primary) button.className += ' cattail-world-editor-creative-dialog__button--primary'
				button.dataset.creativeText = textKey
				return button
			}

			function finishCreativeDialogMount(dialog) {
				dialog.handleKeydown = function (event) {
					if (event.key === 'Escape') {
						event.preventDefault()
						event.stopImmediatePropagation()
						if (!dialog.busy) closeCreativeDialog('dialog-escape')
						return
					}
					if (event.key !== 'Tab') return
					const focusable = Array.from(dialog.element.querySelectorAll('button:not(:disabled), input:not(:disabled)'))
					if (!focusable.length) return
					const first = focusable[0]
					const last = focusable[focusable.length - 1]
					if (event.shiftKey && document.activeElement === first) {
						event.preventDefault()
						last.focus()
					} else if (!event.shiftKey && document.activeElement === last) {
						event.preventDefault()
						first.focus()
					}
				}
				dialog.element.addEventListener('keydown', dialog.handleKeydown, true)
				for (const type of ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'wheel']) {
					dialog.element.addEventListener(type, function (event) { event.stopPropagation() })
				}
				document.body.append(dialog.element)
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
				dialog.busy = !!busy
				dialog.element.dataset.busy = dialog.busy ? 'true' : 'false'
				for (const control of dialog.element.querySelectorAll('button, input')) control.disabled = dialog.busy
			}

			function showCreativeDialogError(dialog, operationError) {
				dialog.errorNode.hidden = false
				dialog.errorNode.textContent = String(operationError?.message || i18n.t(game, 'creativeOperationFailed'))
			}

			function closeCreativeDialog(reason, force) {
				const dialog = creativeDialog
				if (!dialog || (dialog.busy && !force)) return false
				creativeDialog = null
				dialog.element.removeEventListener('keydown', dialog.handleKeydown, true)
				dialog.element.remove()
				creative.setDialogOpen(false, reason || 'dialog-closed')
				const focusTarget = dialog.previousFocus
				if (focusTarget?.isConnected && typeof focusTarget.focus === 'function') focusTarget.focus()
				else creativeButton.focus()
				return true
			}

			selectButton.addEventListener('click', handleSelectClick)
			removeButton.addEventListener('click', handleRemoveClick)
			creativeButton.addEventListener('click', handleCreativeClick)

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
				window.removeEventListener('resize', refreshUiScale)
				uiScaleObserver?.disconnect?.()
				if (typeof stopStateSubscription === 'function') stopStateSubscription()
				if (typeof stopSelectionSubscription === 'function') stopSelectionSubscription()
				if (typeof stopToolSubscription === 'function') stopToolSubscription()
				if (typeof stopCreativeSubscription === 'function') stopCreativeSubscription()
				if (typeof stopCreativeEconomySubscription === 'function') stopCreativeEconomySubscription()
				selectButton.removeEventListener('click', handleSelectClick)
				removeButton.removeEventListener('click', handleRemoveClick)
				creativeButton.removeEventListener('click', handleCreativeClick)
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
			shell.setAttribute('role', 'toolbar')
			shell.setAttribute('aria-hidden', 'true')

			const bar = document.createElement('div')
			bar.className = 'cattail-world-editor-shell__bar'

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
			actions.dataset.worldEditorSlot = 'actions'
			const selectButton = createToolButton('select', 'tool-select')
			const removeButton = createIconButton('remove-selection', '×')
			const creativeButton = createToolButton('creative-mode', 'creative-mode')
			creativeButton.className += ' cattail-world-editor-shell__tool--creative'
			creativeButton.dataset.active = 'false'
			creativeButton.dataset.creative = 'false'
			actions.append(selectButton, removeButton, creativeButton)

			const hint = document.createElement('span')
			hint.className = 'cattail-world-editor-shell__hint'
			hint.dataset.worldEditorText = 'hint'

			bar.append(identity, divider, status, actions, hint)
			shell.append(bar)
			return shell
		}

		function createToolButton(action, textKey) {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = 'cattail-world-editor-shell__tool'
			button.dataset.worldEditorAction = action
			button.dataset.active = action === 'select' ? 'true' : 'false'
			button.setAttribute('aria-pressed', action === 'select' ? 'true' : 'false')
			const label = document.createElement('span')
			label.dataset.worldEditorText = textKey
			button.append(label)
			return button
		}

		function createIconButton(action, symbol) {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = 'cattail-world-editor-shell__tool cattail-world-editor-shell__tool--icon'
			button.dataset.worldEditorAction = action
			button.disabled = true
			const icon = document.createElement('span')
			icon.setAttribute('aria-hidden', 'true')
			icon.textContent = symbol
			button.append(icon)
			return button
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
					--world-editor-shell-active: rgba(113, 79, 163, .16);
					--world-editor-shell-active-border: rgba(113, 79, 163, .34);
					--world-editor-shell-creative: rgba(181, 125, 34, .18);
					--world-editor-shell-creative-border: rgba(181, 125, 34, .48);
					--world-editor-shell-creative-text: rgb(125, 77, 9);
					--world-editor-shell-shadow: 0 12px 36px rgba(0, 0, 0, .18);
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
					--world-editor-shell-active: rgba(210, 188, 250, .16);
					--world-editor-shell-active-border: rgba(210, 188, 250, .34);
					--world-editor-shell-creative: rgba(240, 201, 106, .18);
					--world-editor-shell-creative-border: rgba(240, 201, 106, .52);
					--world-editor-shell-creative-text: rgb(255, 220, 138);
					--world-editor-shell-shadow: 0 12px 36px rgba(0, 0, 0, .35);
				}
				.cattail-world-editor-shell[data-visible="true"] {
					visibility: visible;
					opacity: 1;
					transform: translateY(0);
					transition-delay: 0s;
				}
				.cattail-world-editor-shell__bar {
					display: flex;
					align-items: center;
					flex-wrap: wrap;
					gap: 14px;
					max-width: var(--world-editor-toolbar-layout-width, calc(100vw - 24px));
					min-height: 54px;
					box-sizing: border-box;
					padding: 10px 16px;
					border: 1px solid var(--world-editor-shell-border);
					border-radius: 8px;
					background: var(--world-editor-shell-bg);
					box-shadow: var(--world-editor-shell-shadow);
					backdrop-filter: blur(14px) saturate(1.12);
					-webkit-backdrop-filter: blur(14px) saturate(1.12);
					color: var(--world-editor-shell-text);
					font: 400 14px/1.4 Montserrat, Arial, sans-serif;
					-webkit-font-smoothing: antialiased;
					white-space: nowrap;
					transform: scale(var(--world-editor-ui-scale, 1));
					transform-origin: top center;
					transition: background .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease;
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
				.cattail-world-editor-shell__actions {
					display: inline-flex;
					align-items: center;
					flex-wrap: wrap;
					gap: 6px;
					pointer-events: auto;
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
				.cattail-world-editor-shell__hint {
					margin-left: auto;
					padding-left: 14px;
					border-left: 1px solid var(--world-editor-shell-border);
					color: var(--world-editor-shell-muted);
					font-size: 13px;
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
				.cattail-world-editor-creative-dialog {
					--world-editor-dialog-bg: rgba(248, 248, 246, .97);
					--world-editor-dialog-text: rgba(18, 20, 22, .94);
					--world-editor-dialog-muted: rgba(18, 20, 22, .66);
					--world-editor-dialog-border: rgba(0, 0, 0, .16);
					--world-editor-dialog-control: rgba(18, 20, 22, .06);
					position: fixed;
					inset: 0;
					z-index: 80;
					display: grid;
					place-items: center;
					box-sizing: border-box;
					padding: 20px;
					background: rgba(8, 10, 12, .36);
					backdrop-filter: blur(10px);
					-webkit-backdrop-filter: blur(10px);
					color: var(--world-editor-dialog-text);
					font-family: Montserrat, Arial, sans-serif;
					pointer-events: auto;
				}
				.cattail-world-editor-creative-dialog[data-theme="void"] {
					--world-editor-dialog-bg: rgba(8, 10, 12, .97);
					--world-editor-dialog-text: rgba(255, 255, 255, .94);
					--world-editor-dialog-muted: rgba(255, 255, 255, .66);
					--world-editor-dialog-border: rgba(255, 255, 255, .18);
					--world-editor-dialog-control: rgba(255, 255, 255, .08);
				}
				.cattail-world-editor-creative-dialog__box {
					width: min(620px, calc(100vw - 32px));
					max-height: calc(100vh - 40px);
					overflow: auto;
					box-sizing: border-box;
					padding: 24px;
					border: 1px solid var(--world-editor-dialog-border);
					border-radius: 10px;
					background: var(--world-editor-dialog-bg);
					box-shadow: 0 20px 70px rgba(0, 0, 0, .34);
				}
				.cattail-world-editor-creative-dialog__title {
					margin: 0 0 10px;
					font-size: 22px;
					line-height: 1.3;
				}
				.cattail-world-editor-creative-dialog__message {
					margin: 0 0 18px;
					color: var(--world-editor-dialog-muted);
					font-size: 14px;
					line-height: 1.55;
					white-space: pre-line;
				}
				.cattail-world-editor-creative-dialog__content {
					display: grid;
					gap: 10px;
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
					border-color: var(--world-editor-shell-creative-border);
				}
				.cattail-world-editor-creative-dialog__preview,
				.cattail-world-editor-creative-dialog__status {
					color: var(--world-editor-dialog-muted);
					font-size: 13px;
					line-height: 1.45;
					overflow-wrap: anywhere;
				}
				.cattail-world-editor-creative-dialog__error {
					margin-top: 12px;
					color: #c14b45;
					font-size: 13px;
					line-height: 1.45;
				}
				.cattail-world-editor-creative-dialog__actions {
					display: flex;
					justify-content: flex-end;
					flex-wrap: wrap;
					gap: 8px;
					margin-top: 20px;
				}
				.cattail-world-editor-creative-dialog__button {
					min-height: 38px;
					border: 1px solid var(--world-editor-dialog-border);
					border-radius: 6px;
					padding: 8px 12px;
					background: var(--world-editor-dialog-control);
					color: var(--world-editor-dialog-text);
					font: 600 13px/1.2 Montserrat, Arial, sans-serif;
					cursor: pointer;
				}
				.cattail-world-editor-creative-dialog__button--primary {
					border-color: var(--world-editor-shell-creative-border);
					background: var(--world-editor-shell-creative);
					color: var(--world-editor-shell-creative-text);
				}
				.cattail-world-editor-creative-dialog__button:disabled {
					cursor: default;
					opacity: .38;
				}
				.cattail-world-editor-creative-dialog[data-busy="true"] {
					cursor: progress;
				}
				@media (max-width: 900px) {
					.cattail-world-editor-shell__bar {
						justify-content: center;
						gap: 8px;
						padding: 8px 10px;
					}
					.cattail-world-editor-shell__actions {
						justify-content: center;
					}
					.cattail-world-editor-shell__hint {
						margin-left: 0;
						padding-left: 0;
						border-left: 0;
					}
				}
				@media (max-width: 520px) {
					.cattail-world-editor-shell__bar { gap: 7px; }
					.cattail-world-editor-shell__brand,
					.cattail-world-editor-shell__divider { display: none; }
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
