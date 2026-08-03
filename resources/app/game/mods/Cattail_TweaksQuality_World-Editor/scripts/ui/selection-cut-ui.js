ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const MOD_ID = api.id
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
		const DELETE_KEY = Symbol.for('cattail.world-editor.selection-delete')
		const CUT_KEY = Symbol.for('cattail.world-editor.selection-cut')
		const BLUEPRINT_KEY = Symbol.for('cattail.world-editor.blueprint')
		const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
		const DIALOGS_KEY = Symbol.for('cattail.world-editor.dialogs')
		const SHARED_KEY = Symbol.for('cattail.world-editor.shared')
		const SHELL_ID = 'cattail-world-editor-shell'
		const DIALOG_ID = 'cattail-world-editor-selection-cut-dialog'
		const STATUS_ID = 'cattail-world-editor-selection-cut-status'
		const STYLE_ID = 'cattail-world-editor-selection-cut-style'
		const SUCCESS_MS = 3000
		const FAILURE_MS = 7000
		let refreshMountedText = null

		api.on('afterWords', function (words, game) {
			refreshMountedText?.(game)
		})

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const selection = globalThis[SELECTION_KEY]
			const transactions = globalThis[TRANSACTIONS_KEY]
			const deletion = globalThis[DELETE_KEY]
			const cut = globalThis[CUT_KEY]
			const blueprint = globalThis[BLUEPRINT_KEY]
			const i18n = globalThis[I18N_KEY]
			const dialogs = globalThis[DIALOGS_KEY]
			const shared = globalThis[SHARED_KEY]
			const shell = document.getElementById(SHELL_ID)
			const selectionGroup = shell?.querySelector?.('[data-world-editor-toolbar-group="selection"]')
			const layout = shell?.querySelector?.('.cattail-world-editor-shell__layout')
			if (
				!runtime ||
				runtime.game !== game ||
				!selection ||
				selection.game !== game ||
				!transactions ||
				transactions.game !== game ||
				!deletion ||
				deletion.game !== game ||
				!cut ||
				cut.game !== game ||
				typeof cut.plan !== 'function' ||
				typeof cut.execute !== 'function' ||
				typeof cut.setDialogOpen !== 'function' ||
				!blueprint ||
				blueprint.game !== game ||
				!i18n ||
				typeof i18n.t !== 'function' ||
				!dialogs ||
				dialogs.game !== game ||
				typeof dialogs.create !== 'function' ||
				!shared ||
				typeof shared.isEditableEvent !== 'function' ||
				!selectionGroup ||
				!layout
			) {
				console.warn('[Cattail World Editor] Selection cut UI 4C-1b could not find its dependencies.')
				return
			}

			document.getElementById(STATUS_ID)?.remove()
			selectionGroup.querySelector('[data-world-editor-action="cut-selection-contents"]')?.remove()
			ensureStyle()
			const cutButton = createCutButton()
			const status = createStatus()
			selectionGroup.append(cutButton)
			layout.append(status)
			dispatchToolbarLayout('selection-cut-mounted')

			let currentRuntime = runtime.snapshot()
			let currentSelection = selection.snapshot()
			let currentTransactions = transactions.snapshot()
			let currentDeletion = deletion.snapshot()
			let currentCut = cut.snapshot()
			let currentBlueprint = blueprint.snapshot()
			let currentDialog = null
			let uiBusy = false
			let statusTimer = 0
			let statusState = null
			let disposed = false

			function text(key, replacements) {
				let value = String(i18n.t(game, key) || key)
				for (const name of Object.keys(replacements || {})) {
					value = value.replaceAll('{' + name + '}', String(replacements[name]))
				}
				return value
			}

			function refreshText(languageGame) {
				if (disposed) return
				const source = languageGame || game
				const compactText = i18n.t(source, 'cutSelectionContents')
				const cardText = i18n.t(source, 'toolbarCardCut')
				cutButton.title = compactText
				cutButton.setAttribute('aria-label', compactText)
				cutButton.querySelector('[data-world-editor-card-text]').textContent = cardText
				if (statusState) renderStatus(source)
				if (currentDialog && !currentDialog.closed && !currentDialog.busy) {
					currentDialog.close('language-changed', true)
					currentDialog = null
					void startCut('api')
				}
			}
			refreshMountedText = refreshText

			function selectionBusy() {
				return !!(
					currentSelection?.previewRange ||
					selection.hasPreview?.() ||
					selection.isMoving?.() ||
					selection.isResizing?.()
				)
			}

			function renderButton() {
				const blocked = (
					!currentRuntime?.active ||
					!Number(currentSelection?.selectionCount) ||
					selectionBusy() ||
					uiBusy ||
					!!currentDialog ||
					currentCut?.planning ||
					currentCut?.busy ||
					currentBlueprint?.capturing ||
					currentDeletion?.planning ||
					currentDeletion?.busy ||
					currentTransactions?.busy ||
					!!currentTransactions?.terminalBlockedReason ||
					game.halt ||
					game.splash?.isShown
				)
				cutButton.disabled = !!blocked
				cutButton.dataset.worldEditorToolbarBusy = (
					uiBusy ||
					currentCut?.planning ||
					currentCut?.busy ||
					currentDeletion?.planning ||
					currentDeletion?.busy ||
					currentTransactions?.busy
				) ? 'true' : 'false'
				cutButton.dataset.active = 'false'
				dispatchToolbarLayout('selection-cut-state')
			}

			function renderStatus(languageGame) {
				if (!statusState) return
				const source = languageGame || game
				const value = i18n.t(source, statusState.key)
				status.textContent = value
				status.title = statusState.detail || value
				status.dataset.active = 'true'
				status.dataset.kind = statusState.kind
				status.setAttribute('role', statusState.kind === 'error' || statusState.kind === 'terminal' ? 'alert' : 'status')
				status.setAttribute(
					'aria-live',
					statusState.kind === 'error' || statusState.kind === 'terminal' ? 'assertive' : 'polite'
				)
			}

			function clearStatus(force) {
				if (statusState?.persistent && !force) return false
				if (statusTimer) clearTimeout(statusTimer)
				statusTimer = 0
				statusState = null
				status.textContent = ''
				status.title = ''
				status.dataset.active = 'false'
				status.dataset.kind = 'neutral'
				return true
			}

			function showStatus(key, kind, duration, detail, persistent) {
				if (statusTimer) clearTimeout(statusTimer)
				statusTimer = 0
				statusState = {
					key: String(key || 'cutFailed'),
					kind: String(kind || 'neutral'),
					detail: String(detail || ''),
					persistent: persistent === true
				}
				renderStatus(game)
				if (!statusState.persistent && Number(duration) > 0) {
					statusTimer = setTimeout(function () {
						statusTimer = 0
						clearStatus()
					}, Number(duration))
				}
			}

			function showPlanError(code, detail) {
				const normalized = String(code || 'CUT_FAILED').toUpperCase()
				if (normalized === 'NOTHING_SAFE' || normalized === 'NO_SELECTION') {
					showStatus('cutNothing', 'neutral', FAILURE_MS, detail)
					return
				}
				if (normalized === 'TARGET_CHANGED' || normalized === 'EXTERNAL_CHANGE') {
					showStatus('cutTargetChanged', 'warning', FAILURE_MS, detail)
					return
				}
				if (normalized === 'BUSY' || normalized === 'SELECTION_BUSY') {
					showStatus('cutBusy', 'busy', FAILURE_MS, detail)
					return
				}
				showStatus('cutFailed', 'error', FAILURE_MS, detail)
			}

			function showExecutionResult(result) {
				if (result?.executed === true) {
					if (deletion.snapshot?.().refreshWarning) {
						showStatus(
							'cutPreviewRefreshFailed',
							'warning',
							FAILURE_MS,
							deletion.snapshot().refreshWarning.message
						)
					} else {
						showStatus('cutSuccess', 'success', SUCCESS_MS)
					}
					return
				}
				const code = String(result?.error?.code || '').toUpperCase()
				if (!result?.copied) {
					if (code === 'CLIPBOARD_FAILED' || result?.reason === 'clipboard-failed') {
						showStatus('cutClipboardFailed', 'error', FAILURE_MS, result?.error?.message)
					} else {
						showPlanError(code || result?.reason, result?.error?.message)
					}
					return
				}
				if (code === 'ROLLBACK_FAILED' || result?.reason === 'failed') {
					showStatus('cutReloadRequired', 'terminal', 0, result?.error?.message, true)
					return
				}
				if (code === 'TARGET_CHANGED' || code === 'EXTERNAL_CHANGE') {
					showStatus('cutTargetChangedCopied', 'warning', FAILURE_MS, result?.error?.message)
					return
				}
				showStatus('cutCopiedOnly', 'warning', FAILURE_MS, result?.error?.message)
			}

			async function startCut(input) {
				if (disposed || uiBusy || currentDialog) return
				if (
					!currentRuntime?.active ||
					game.halt ||
					game.splash?.isShown ||
					shared.isModLoaderPanelBlocking?.() ||
					Number(dialogs.snapshot?.().openCount) > 0 ||
					currentBlueprint?.capturing ||
					selectionBusy()
				) return

				uiBusy = true
				renderButton()
				showStatus('cutPlanning', 'busy', 0)
				let plan
				try {
					currentBlueprint = blueprint.snapshot()
					plan = await cut.plan()
					currentCut = cut.snapshot()
					if (!plan?.candidate) {
						showStatus('cutNothing', 'neutral', FAILURE_MS)
						return
					}
					openConfirmation(plan, input)
				} catch (planError) {
					showPlanError(planError?.code, planError?.message)
				} finally {
					uiBusy = false
					renderButton()
				}
			}

			function openConfirmation(plan, input) {
				const summary = plan.summary
				let removeCubes = false
				let removeSurges = false
				const dialog = dialogs.create({
					id: DIALOG_ID,
					theme: game.plane ? 'void' : 'reality',
					kind: 'danger',
					title: text('cutConfirmTitle'),
					message: text('cutConfirmMessage', {
						safe: summary.safeCount,
						protected: summary.protectedCount,
						cross: summary.crossBoundaryCount
					}),
					closeOnBackdrop: true,
					fallbackFocus: cutButton,
					onClose(reason, handle) {
						cut.setDialogOpen(false, 'selection-cut-dialog-closed')
						if (currentDialog === handle) currentDialog = null
						renderButton()
					}
				})
				if (plan.replacesBlueprint) {
					const replacement = document.createElement('p')
					replacement.className = 'cattail-world-editor-selection-cut__warning'
					replacement.textContent = text('cutReplaceWarning')
					dialog.content.append(replacement)
				}
				if (summary.creative && (summary.cubeCount || summary.surgeCount)) {
					const layerMessage = document.createElement('p')
					layerMessage.className = 'cattail-world-editor-selection-cut__layers-message'
					layerMessage.textContent = text('cutLayerMessage')
					const layerOptions = document.createElement('div')
					layerOptions.className = 'cattail-world-editor-selection-cut__layers'
					const cubes = dialog.createButton('', {})
					const surges = dialog.createButton('', {})
					cubes.classList.add('cattail-world-editor-selection-cut__layer-option')
					surges.classList.add('cattail-world-editor-selection-cut__layer-option')
					cubes.hidden = !summary.cubeCount
					surges.hidden = !summary.surgeCount
					const renderLayers = function () {
						cubes.textContent = text('cutCubeOption', { count: summary.cubeCount })
						surges.textContent = text('cutSurgeOption', { count: summary.surgeCount })
						for (const entry of [[cubes, removeCubes], [surges, removeSurges]]) {
							entry[0].dataset.active = entry[1] ? 'true' : 'false'
							entry[0].setAttribute('aria-pressed', entry[1] ? 'true' : 'false')
						}
					}
					cubes.addEventListener('click', function () { removeCubes = !removeCubes; renderLayers() })
					surges.addEventListener('click', function () { removeSurges = !removeSurges; renderLayers() })
					renderLayers()
					layerOptions.append(cubes, surges)
					dialog.content.append(layerMessage, layerOptions)
				}
				const economy = document.createElement('p')
				economy.className = 'cattail-world-editor-selection-cut__economy'
				economy.textContent = summary.creative
					? text('deleteCreativeNoEconomy')
					: formatResourceDelta(summary.resourceDelta)
				dialog.content.append(economy)

				const cancel = dialog.createButton(text('deleteCancel'))
				const confirm = dialog.createButton(text('cutConfirmAction'), {
					primary: true,
					danger: true
				})
				cancel.addEventListener('click', function () {
					dialog.close('selection-cut-cancelled')
				})
				confirm.addEventListener('click', async function () {
					if (dialog.busy || uiBusy) return
					uiBusy = true
					dialog.setBusy(true)
					renderButton()
					showStatus('cutCopying', 'busy', 0)
					try {
						const result = await cut.execute(plan, input, {
							removeCubes,
							removeSurges
						})
						currentCut = cut.snapshot()
						currentDeletion = deletion.snapshot()
						currentTransactions = transactions.snapshot()
						currentBlueprint = blueprint.snapshot()
						dialog.close('selection-cut-finished', true)
						showExecutionResult(result)
					} catch (executionError) {
						dialog.close('selection-cut-threw', true)
						showPlanError(executionError?.code, executionError?.message)
					} finally {
						uiBusy = false
						renderButton()
					}
				})
				dialog.actions.append(cancel, confirm)
				currentDialog = dialog
				cut.setDialogOpen(true, 'selection-cut-dialog-opened')
				dialog.mount(cancel)
				renderButton()
			}

			function formatResourceDelta(delta) {
				const values = Array.isArray(delta) ? delta : []
				const parts = []
				for (let index = 0; index < values.length; index += 1) {
					const value = Number(values[index]) || 0
					if (Math.abs(value) <= 1e-7) continue
					parts.push(localizedResourceName(index) + ' ' + (value > 0 ? '+' : '') + formatNumber(value))
				}
				return text('deleteResourceChanges', {
					changes: parts.length ? parts.join(', ') : text('deleteNoResourceChange')
				})
			}

			function localizedResourceName(index) {
				const resource = game.codex?.resources?.[index]
				const name = resource?.name || resource?.id || String(index + 1)
				try {
					const pronounced = game.pronounce?.('resources', name, 'name')
					if (pronounced && pronounced !== name) return String(pronounced)
				} catch (error) {}
				return String(name)
			}

			function formatNumber(value) {
				try {
					if (typeof game.makeReadable === 'function') return String(game.makeReadable(value))
				} catch (error) {}
				return String(Math.round((Number(value) || 0) * 100) / 100)
			}

			const handleClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				void startCut(event?.detail === 0 ? 'keyboard' : 'mouse')
			}

			const handleKeydown = function (event) {
				const key = String(event?.key || '').toLowerCase()
				const isCut = event?.code === 'KeyX' || key === 'x'
				if (
					!(event?.ctrlKey || event?.metaKey) ||
					event?.altKey ||
					event?.shiftKey ||
					!isCut ||
					event?.repeat ||
					event?.isComposing ||
					event?.keyCode === 229 ||
					shared.isEditableEvent(event) ||
					shared.isModLoaderPanelBlocking?.() ||
					!currentRuntime?.active ||
					game.halt ||
					game.splash?.isShown ||
					Number(dialogs.snapshot?.().openCount) > 0 ||
					selectionBusy()
				) return
				event.preventDefault()
				event.stopPropagation()
				event.stopImmediatePropagation?.()
				if (shared.isWorldEditorInputBlocked?.()) return
				void startCut('keyboard')
			}

			cutButton.addEventListener('click', handleClick)
			window.addEventListener('keydown', handleKeydown, true)
			const stopRuntime = runtime.subscribe(function (state) {
				currentRuntime = state
				if (!state?.active && currentDialog && !currentDialog.busy) {
					currentDialog.close('editor-inactive')
				}
				renderButton()
			})
			const stopSelection = selection.subscribe(function (state) {
				currentSelection = state
				renderButton()
			})
			const stopTransactions = transactions.subscribe(function (state) {
				currentTransactions = state
				renderButton()
			})
			const stopDeletion = deletion.subscribe(function (state) {
				currentDeletion = state
				renderButton()
			})
			const stopCut = cut.subscribe(function (state) {
				currentCut = state
				if (uiBusy && state?.busy && state.phase === 'deleting') {
					showStatus('cutDeleting', 'busy', 0)
				}
				renderButton()
			})
			const stopBlueprint = blueprint.subscribe(function (state) {
				currentBlueprint = state
				renderButton()
			})

			refreshText(game)
			renderButton()
			runtime.addCleanup(function () {
				disposed = true
				if (refreshMountedText === refreshText) refreshMountedText = null
				if (statusTimer) clearTimeout(statusTimer)
				currentDialog?.close?.('runtime-disposed', true)
				cutButton.removeEventListener('click', handleClick)
				window.removeEventListener('keydown', handleKeydown, true)
				stopRuntime?.()
				stopSelection?.()
				stopTransactions?.()
				stopDeletion?.()
				stopCut?.()
				stopBlueprint?.()
				cutButton.remove()
				status.remove()
				document.getElementById(STYLE_ID)?.remove()
				dispatchToolbarLayout('selection-cut-disposed')
			})

			console.info('[Cattail World Editor] Selection cut controls 4C-1b ready.')

			function dispatchToolbarLayout(reason) {
				try {
					window.dispatchEvent(new CustomEvent('cattail:world-editor-toolbar-layout', {
						detail: {
							modId: MOD_ID,
							reason: String(reason || 'selection-cut')
						}
					}))
				} catch (error) {}
			}
		})

		function createCutButton() {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = 'cattail-world-editor-shell__tool cattail-world-editor-shell__tool--icon cattail-world-editor-selection-cut__button'
			button.dataset.worldEditorAction = 'cut-selection-contents'
			button.dataset.worldEditorToolbarCard = ''
			button.dataset.active = 'false'
			button.disabled = true

			const compactIcon = document.createElement('span')
			compactIcon.className = 'cattail-world-editor-shell__compact-icon'
			compactIcon.setAttribute('aria-hidden', 'true')
			compactIcon.textContent = '✂'
			const cardIcon = document.createElement('span')
			cardIcon.className = 'cattail-world-editor-shell__card-icon'
			cardIcon.dataset.cardIcon = 'cut'
			cardIcon.setAttribute('aria-hidden', 'true')
			cardIcon.textContent = '✂'
			const cardLabel = document.createElement('span')
			cardLabel.className = 'cattail-world-editor-shell__card-label'
			cardLabel.dataset.worldEditorCardText = 'cut'
			button.append(compactIcon, cardIcon, cardLabel)
			return button
		}

		function createStatus() {
			const status = document.createElement('div')
			status.id = STATUS_ID
			status.className = 'cattail-world-editor-selection-cut__status'
			status.dataset.active = 'false'
			status.dataset.kind = 'neutral'
			status.setAttribute('role', 'status')
			status.setAttribute('aria-live', 'polite')
			status.setAttribute('aria-atomic', 'true')
			return status
		}

		function ensureStyle() {
			let style = document.getElementById(STYLE_ID)
			if (style) return style
			style = document.createElement('style')
			style.id = STYLE_ID
			style.textContent = `
				.cattail-world-editor-selection-cut__status {
					display: none;
					align-items: center;
					justify-content: center;
					min-height: 24px;
					padding: 3px 12px;
					border-top: 1px solid rgba(255, 255, 255, .08);
					color: var(--world-editor-shell-muted);
					font: 600 12px/1.35 Montserrat, sans-serif;
					text-align: center;
					pointer-events: none;
				}
				.cattail-world-editor-selection-cut__status[data-active="true"] {
					display: flex;
				}
				.cattail-world-editor-selection-cut__status[data-kind="busy"] {
					color: #e3fd43;
				}
				.cattail-world-editor-selection-cut__status[data-kind="success"] {
					color: #7ee787;
				}
				.cattail-world-editor-selection-cut__status[data-kind="warning"] {
					color: #f2cc60;
				}
				.cattail-world-editor-selection-cut__status[data-kind="error"],
				.cattail-world-editor-selection-cut__status[data-kind="terminal"] {
					color: #ff7d72;
				}
				.cattail-world-editor-selection-cut__economy,
				.cattail-world-editor-selection-cut__warning,
				.cattail-world-editor-selection-cut__layers-message {
					margin: 0;
					color: var(--world-editor-dialog-muted);
					font: 600 13px/1.5 Montserrat, sans-serif;
					white-space: normal;
				}
				.cattail-world-editor-selection-cut__warning {
					color: var(--world-editor-dialog-accent);
				}
				.cattail-world-editor-selection-cut__layers {
					display: grid;
					gap: 7px;
				}
				.cattail-world-editor-selection-cut__layer-option {
					white-space: normal;
					text-align: left;
				}
				.cattail-world-editor-selection-cut__layer-option[data-active="true"] {
					border-color: color-mix(in srgb, rgba(255, 255, 255, .88) 54%, var(--world-editor-hell-gem-1, #A6F246));
					background: var(--world-editor-hell-gem-glass);
					background-blend-mode: screen, screen, screen, normal;
					backdrop-filter: var(--world-editor-glass-backdrop);
					-webkit-backdrop-filter: var(--world-editor-glass-backdrop);
					box-shadow: var(--world-editor-hell-gem-glass-shadow);
					color: #17200c;
				}
				.cattail-world-editor-selection-cut__layer-option[data-active="true"]:hover:not(:disabled) {
					border-color: color-mix(in srgb, rgba(255, 255, 255, .96) 68%, var(--world-editor-hell-gem-1, #A6F246));
					background: var(--world-editor-hell-gem-glass-hover);
					box-shadow: var(--world-editor-hell-gem-glass-shadow-hover);
				}
				.cattail-world-editor-selection-cut__layer-option[data-active="true"]:active:not(:disabled) {
					transform: translateY(1px);
					box-shadow: var(--world-editor-hell-gem-glass-shadow-pressed);
				}
				.cattail-world-editor-selection-cut__layer-option[data-active="true"]:focus-visible {
					box-shadow: var(--world-editor-hell-gem-glass-shadow), 0 0 0 2px var(--world-editor-dialog-text);
				}
				.cattail-world-editor-selection-cut__layer-option[data-active="true"]:disabled {
					opacity: .38;
					box-shadow: none;
				}
			`
			document.head.append(style)
			return style
		}
	}
})
