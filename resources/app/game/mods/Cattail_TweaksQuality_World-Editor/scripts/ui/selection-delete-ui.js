ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const MOD_ID = api.id
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
		const DELETE_KEY = Symbol.for('cattail.world-editor.selection-delete')
		const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
		const DIALOGS_KEY = Symbol.for('cattail.world-editor.dialogs')
		const SHARED_KEY = Symbol.for('cattail.world-editor.shared')
		const SHELL_ID = 'cattail-world-editor-shell'
		const DIALOG_ID = 'cattail-world-editor-selection-delete-dialog'
		const STATUS_ID = 'cattail-world-editor-selection-delete-status'
		const STYLE_ID = 'cattail-world-editor-selection-delete-style'
		const SUCCESS_MS = 3000
		const FAILURE_MS = 6000
		let refreshMountedText = null

		api.on('afterWords', function (words, game) {
			refreshMountedText?.(game)
		})

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const selection = globalThis[SELECTION_KEY]
			const transactions = globalThis[TRANSACTIONS_KEY]
			const deletion = globalThis[DELETE_KEY]
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
				typeof deletion.planSelections !== 'function' ||
				typeof deletion.execute !== 'function' ||
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
				console.warn('[Cattail World Editor] Selection deletion UI 4C-1a could not find its dependencies.')
				return
			}

			document.getElementById(STATUS_ID)?.remove()
			selectionGroup.querySelector('[data-world-editor-action="delete-selection-contents"]')?.remove()
			ensureStyle()
			const deleteButton = createDeleteButton()
			const status = createStatus()
			selectionGroup.append(deleteButton)
			layout.append(status)
			dispatchToolbarLayout('selection-delete-mounted')

			let currentRuntime = runtime.snapshot()
			let currentSelection = selection.snapshot()
			let currentTransactions = transactions.snapshot()
			let currentDeletion = deletion.snapshot()
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

			function markProbe(event, details) {
				try {
					deletion.markProbe?.(event, details)
				} catch (probeError) {}
			}

			function refreshText(languageGame) {
				if (disposed) return
				const source = languageGame || game
				const compactText = i18n.t(source, 'deleteSelectionContents')
				const cardText = i18n.t(source, 'toolbarCardDelete')
				deleteButton.title = compactText
				deleteButton.setAttribute('aria-label', compactText)
				deleteButton.querySelector('[data-world-editor-card-text]').textContent = cardText
				if (statusState) renderStatus(source)
				if (currentDialog && !currentDialog.closed && !currentDialog.busy) {
					currentDialog.close('language-changed', true)
					currentDialog = null
					void startDeletion('api')
				}
			}
			refreshMountedText = refreshText

			function renderButton() {
				const selectionAvailable = Number(currentSelection?.selectionCount) > 0
				const previewActive = !!currentSelection?.previewRange ||
					selection.hasPreview?.() ||
					selection.isMoving?.() ||
					selection.isResizing?.()
				const blocked = (
					!currentRuntime?.active ||
					!selectionAvailable ||
					previewActive ||
					uiBusy ||
					!!currentDialog ||
					currentDeletion?.planning ||
					currentDeletion?.busy ||
					currentTransactions?.busy ||
					!!currentTransactions?.terminalBlockedReason ||
					game.halt ||
					game.splash?.isShown
				)
				deleteButton.disabled = !!blocked
				deleteButton.dataset.worldEditorToolbarBusy = (
					uiBusy ||
					currentDeletion?.planning ||
					currentDeletion?.busy ||
					currentTransactions?.busy
				) ? 'true' : 'false'
				deleteButton.dataset.worldEditorLargeHidden = selectionAvailable ? 'false' : 'true'
				deleteButton.dataset.active = 'false'
				dispatchToolbarLayout('selection-delete-state')
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
					key: String(key || 'deleteFailed'),
					kind: String(kind || 'neutral'),
					detail: String(detail || ''),
					persistent: persistent === true
				}
				markProbe('status', {
					key: statusState.key,
					kind: statusState.kind,
					detail: statusState.detail,
					persistent: statusState.persistent
				})
				renderStatus(game)
				if (!statusState.persistent && Number(duration) > 0) {
					statusTimer = setTimeout(function () {
						statusTimer = 0
						clearStatus()
					}, Number(duration))
				}
			}

			function showErrorCode(code, detail) {
				const normalized = String(code || 'DELETION_FAILED').toUpperCase()
				if (normalized === 'NOTHING_SAFE' || normalized === 'NO_SELECTION') {
					showStatus('deleteNothing', 'neutral', FAILURE_MS, detail)
					return
				}
				if (normalized === 'TARGET_CHANGED' || normalized === 'EXTERNAL_CHANGE') {
					showStatus('deleteTargetChanged', 'warning', FAILURE_MS, detail)
					return
				}
				if (normalized === 'INSUFFICIENT_RESOURCES') {
					showStatus('deleteInsufficientResources', 'warning', FAILURE_MS, detail)
					return
				}
				if (normalized === 'ROLLBACK_FAILED') {
					showStatus('deleteReloadRequired', 'terminal', 0, detail, true)
					return
				}
				if (normalized === 'BUSY' || normalized === 'SELECTION_BUSY') {
					showStatus('deleteBusy', 'busy', FAILURE_MS, detail)
					return
				}
				showStatus('deleteFailed', 'error', FAILURE_MS, detail)
			}

			async function startDeletion(input) {
				markProbe('start-requested', {
					input,
					selectionCount: Number(currentSelection?.selectionCount) || 0,
					runtimeActive: !!currentRuntime?.active,
					gameHalt: !!game.halt,
					splashShown: !!game.splash?.isShown,
					openDialogCount: Number(dialogs.snapshot?.().openCount) || 0
				})
				if (disposed || uiBusy || currentDialog) return
				if (
					!currentRuntime?.active ||
					game.halt ||
					game.splash?.isShown ||
					shared.isModLoaderPanelBlocking?.() ||
					Number(dialogs.snapshot?.().openCount) > 0
				) return
				if (
					currentSelection?.previewRange ||
					selection.hasPreview?.() ||
					selection.isMoving?.() ||
					selection.isResizing?.()
				) return

				uiBusy = true
				renderButton()
				showStatus('deletePlanning', 'busy', 0)
				let plan
				try {
					plan = await deletion.planSelections()
					currentDeletion = deletion.snapshot()
					markProbe('plan-ready', {
						safeCount: Number(plan?.summary?.safeCount) || 0,
						protectedCount: Number(plan?.summary?.protectedCount) || 0,
						crossBoundaryCount: Number(plan?.summary?.crossBoundaryCount) || 0,
						creative: !!plan?.summary?.creative
					})
					if (!Number(plan?.summary?.safeCount)) {
						showStatus('deleteNothing', 'neutral', FAILURE_MS)
						return
					}
					clearStatus()
					openConfirmation(plan, input)
				} catch (planError) {
					markProbe('plan-failed', {
						code: planError?.code,
						message: planError?.message
					})
					showErrorCode(planError?.code, planError?.message)
				} finally {
					uiBusy = false
					renderButton()
				}
			}

			function openConfirmation(plan, input) {
				const summary = plan.summary
				markProbe('confirmation-opened', {
					input,
					safeCount: summary.safeCount,
					protectedCount: summary.protectedCount,
					crossBoundaryCount: summary.crossBoundaryCount,
					creative: summary.creative
				})
				const dialog = dialogs.create({
					id: DIALOG_ID,
					theme: game.plane ? 'void' : 'reality',
					kind: 'danger',
					title: text('deleteConfirmTitle'),
					message: text('deleteConfirmMessage', {
						safe: summary.safeCount,
						protected: summary.protectedCount,
						cross: summary.crossBoundaryCount
					}),
					closeOnBackdrop: true,
					fallbackFocus: deleteButton,
					onClose(reason, handle) {
						markProbe('confirmation-closed', {
							reason,
							busy: !!handle?.busy
						})
						if (currentDialog === handle) currentDialog = null
						renderButton()
					}
				})
				const economy = document.createElement('p')
				economy.className = 'cattail-world-editor-selection-delete__economy'
				economy.textContent = summary.creative
					? text('deleteCreativeNoEconomy')
					: formatResourceDelta(summary.resourceDelta)
				dialog.content.append(economy)

				const cancel = dialog.createButton(text('deleteCancel'))
				const confirm = dialog.createButton(text('deleteConfirmAction'), {
					primary: true,
					danger: true
				})
				cancel.addEventListener('click', function () {
					dialog.close('selection-delete-cancelled')
				})
				confirm.addEventListener('click', async function () {
					markProbe('confirmation-clicked', {
						dialogBusy: !!dialog.busy,
						uiBusy
					})
					if (dialog.busy || uiBusy) return
					uiBusy = true
					dialog.setBusy(true)
					renderButton()
					showStatus('deleteExecuting', 'busy', 0)
					let result = null
					try {
						markProbe('execute-called', {
							input,
							safeCount: summary.safeCount
						})
						result = await deletion.execute(plan, input)
						markProbe('execute-returned', {
							accepted: result?.accepted === true,
							executed: result?.executed === true,
							reason: result?.reason,
							errorCode: result?.error?.code,
							errorMessage: result?.error?.message,
							snapshotCreated: !!result?.snapshotId
						})
						currentDeletion = deletion.snapshot()
						currentTransactions = transactions.snapshot()
						dialog.close('selection-delete-finished', true)
						if (result?.executed === true) {
							if (currentDeletion?.refreshWarning) {
								showStatus(
									'deletePreviewRefreshFailed',
									'warning',
									FAILURE_MS,
									currentDeletion.refreshWarning.message
								)
							} else {
								showStatus('deleteSuccess', 'success', SUCCESS_MS)
							}
						} else if (result?.reason === 'rolled-back') {
							showStatus('deleteRolledBack', 'error', FAILURE_MS, result?.error?.message)
						} else {
							showErrorCode(result?.error?.code || result?.reason, result?.error?.message)
						}
					} catch (executionError) {
						markProbe('execute-threw', {
							code: executionError?.code,
							message: executionError?.message
						})
						dialog.close('selection-delete-threw', true)
						showErrorCode(executionError?.code, executionError?.message)
					} finally {
						uiBusy = false
						renderButton()
					}
				})
				dialog.actions.append(cancel, confirm)
				currentDialog = dialog
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
				void startDeletion(event?.detail === 0 ? 'keyboard' : 'mouse')
			}

			const handleKeydown = function (event) {
				const key = String(event?.key || '').toLowerCase()
				const isDelete = key === 'delete' || event?.keyCode === 46
				if (!isDelete || event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return
				if (
					!currentRuntime?.active ||
					game.halt ||
					game.splash?.isShown ||
					event.isComposing ||
					event.keyCode === 229 ||
					shared.isEditableEvent(event) ||
					shared.isModLoaderPanelBlocking?.() ||
					Number(dialogs.snapshot?.().openCount) > 0
				) return
				event.preventDefault()
				event.stopPropagation()
				event.stopImmediatePropagation?.()
				if (
					event.repeat ||
					shared.isWorldEditorInputBlocked?.() ||
					currentSelection?.previewRange ||
					selection.hasPreview?.() ||
					selection.isMoving?.() ||
					selection.isResizing?.()
				) return
				void startDeletion('keyboard')
			}

			deleteButton.addEventListener('click', handleClick)
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
				if (state?.refreshWarning && !uiBusy && !currentDialog) {
					showStatus('deletePreviewRefreshFailed', 'warning', FAILURE_MS, state.refreshWarning.message)
				}
				renderButton()
			})

			refreshText(game)
			renderButton()
			markProbe('mounted', {
				runtimeActive: !!currentRuntime?.active,
				selectionCount: Number(currentSelection?.selectionCount) || 0
			})
			runtime.addCleanup(function () {
				disposed = true
				if (refreshMountedText === refreshText) refreshMountedText = null
				if (statusTimer) clearTimeout(statusTimer)
				currentDialog?.close?.('runtime-disposed', true)
				deleteButton.removeEventListener('click', handleClick)
				window.removeEventListener('keydown', handleKeydown, true)
				stopRuntime?.()
				stopSelection?.()
				stopTransactions?.()
				stopDeletion?.()
				deleteButton.remove()
				status.remove()
				document.getElementById(STYLE_ID)?.remove()
				dispatchToolbarLayout('selection-delete-disposed')
			})

			console.info('[Cattail World Editor] Selection deletion controls 4C-1a ready.')

			function dispatchToolbarLayout(reason) {
				try {
					window.dispatchEvent(new CustomEvent('cattail:world-editor-toolbar-layout', {
						detail: {
							modId: MOD_ID,
							reason: String(reason || 'selection-delete')
						}
					}))
				} catch (error) {}
			}
		})

		function createDeleteButton() {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = 'cattail-world-editor-shell__tool cattail-world-editor-shell__tool--icon cattail-world-editor-selection-delete__button'
			button.dataset.worldEditorAction = 'delete-selection-contents'
			button.dataset.worldEditorToolbarCard = ''
			button.dataset.active = 'false'
			button.disabled = true

			const compactIcon = document.createElement('span')
			compactIcon.className = 'cattail-world-editor-shell__compact-icon'
			compactIcon.dataset.worldEditorToolbarIcon = 'pickaxe'
			compactIcon.setAttribute('aria-hidden', 'true')
			const cardIcon = document.createElement('span')
			cardIcon.className = 'cattail-world-editor-shell__card-icon'
			cardIcon.dataset.cardIcon = 'delete'
			cardIcon.dataset.worldEditorToolbarIcon = 'pickaxe'
			cardIcon.setAttribute('aria-hidden', 'true')
			const cardLabel = document.createElement('span')
			cardLabel.className = 'cattail-world-editor-shell__card-label'
			cardLabel.dataset.worldEditorCardText = 'delete'
			button.append(compactIcon, cardIcon, cardLabel)
			return button
		}

		function createStatus() {
			const status = document.createElement('div')
			status.id = STATUS_ID
			status.className = 'cattail-world-editor-selection-delete__status'
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
				.cattail-world-editor-selection-delete__status {
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
				.cattail-world-editor-selection-delete__status[data-active="true"] {
					display: flex;
				}
				.cattail-world-editor-selection-delete__status[data-kind="busy"] {
					color: #e3fd43;
				}
				.cattail-world-editor-selection-delete__status[data-kind="success"] {
					color: #7ee787;
				}
				.cattail-world-editor-selection-delete__status[data-kind="warning"] {
					color: #f2cc60;
				}
				.cattail-world-editor-selection-delete__status[data-kind="error"],
				.cattail-world-editor-selection-delete__status[data-kind="terminal"] {
					color: #ff7d72;
				}
				.cattail-world-editor-selection-delete__economy {
					margin: 0;
					color: var(--world-editor-dialog-muted);
					font: 600 13px/1.5 Montserrat, sans-serif;
					white-space: normal;
				}
			`
			document.head.append(style)
			return style
		}
	}
})
