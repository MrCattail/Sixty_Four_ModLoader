ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const UI_KEY = Symbol.for('cattail.world-editor.blueprint-library-ui')
		const LIBRARY_KEY = Symbol.for('cattail.world-editor.blueprint-library')
		const SESSION_KEY = Symbol.for('cattail.world-editor.blueprint')
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const DIALOG_KEY = Symbol.for('cattail.world-editor.dialogs')
		const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
		const SHELL_ID = 'cattail-world-editor-shell'
		const CARD_ID = 'cattail-world-editor-blueprint-card'
		const STYLE_ID = 'cattail-world-editor-blueprint-library-style'
		const PAGE_ID = 'blueprint-library'
		const LIBRARY_TEXT_KEYS = Object.freeze({
			library: 'blueprintLibraryTitle', close: 'blueprintLibraryClose', save: 'blueprintLibrarySave', refresh: 'blueprintLibraryRefresh', folder: 'blueprintLibraryFolder', import: 'blueprintLibraryImport',
			active: 'blueprintLibraryActive', problems: 'blueprintLibraryProblems', trash: 'blueprintLibraryTrash', quarantine: 'blueprintLibraryQuarantine', list: 'blueprintLibraryList', grid: 'blueprintLibraryGrid', details: 'blueprintLibraryDetails',
			unavailable: 'blueprintLibraryUnavailable', empty: 'blueprintLibraryEmpty', select: 'blueprintLibrarySelect', load: 'blueprintLibraryLoad', rename: 'blueprintLibraryRename', duplicate: 'blueprintLibraryDuplicate', trashAction: 'blueprintLibraryTrashAction', retry: 'blueprintLibraryRetry', quarantineAction: 'blueprintLibraryQuarantineAction', restore: 'blueprintLibraryRestore', remove: 'blueprintLibraryRemove',
			confirmTrash: 'blueprintLibraryConfirmTrash', confirmRemove: 'blueprintLibraryConfirmRemove', confirmReplace: 'blueprintLibraryConfirmReplace', saveTitle: 'blueprintLibrarySaveTitle', renameTitle: 'blueprintLibraryRenameTitle', trashTitle: 'blueprintLibraryTrashTitle', removeTitle: 'blueprintLibraryRemoveTitle', replaceTitle: 'blueprintLibraryReplaceTitle', errorTitle: 'blueprintLibraryErrorTitle', nameMessage: 'blueprintLibraryNameMessage', nameLabel: 'blueprintLibraryNameLabel', saveConfirm: 'blueprintLibrarySaveConfirm', renameConfirm: 'blueprintLibraryRenameConfirm', replaceConfirm: 'blueprintLibraryReplaceConfirm', cancel: 'blueprintLibraryCancel', dialogUnavailable: 'blueprintLibraryDialogUnavailable', blueprint: 'blueprintLibraryBlueprint',
			exportFile: 'blueprintLibraryExportFile', copyShareText: 'blueprintLibraryCopyShareText', importTitle: 'blueprintLibraryImportTitle', chooseFile: 'blueprintLibraryChooseFile', pasteShareText: 'blueprintLibraryPasteShareText', importFileTitle: 'blueprintLibraryImportFileTitle', exportFileTitle: 'blueprintLibraryExportFileTitle', conflictTitle: 'blueprintLibraryConflictTitle', conflictMessage: 'blueprintLibraryConflictMessage', sourceHeading: 'blueprintLibrarySourceHeading', existingHeading: 'blueprintLibraryExistingHeading', mode: 'blueprintLibraryMode', dimensions: 'blueprintLibraryDimensions', modified: 'blueprintLibraryModified', bytes: 'blueprintLibraryBytes', importAsCopy: 'blueprintLibraryImportAsCopy', importReplace: 'blueprintLibraryImportReplace', importSuccess: 'blueprintLibraryImportSuccess', replaceSuccess: 'blueprintLibraryReplaceSuccess', exportSuccess: 'blueprintLibraryExportSuccess', shareSuccess: 'blueprintLibraryShareSuccess', clipboardReadFailed: 'blueprintLibraryClipboardReadFailed', clipboardWriteFailed: 'blueprintLibraryClipboardWriteFailed', statusDismiss: 'blueprintLibraryStatusDismiss'
		})
		const SCROLLBAR_VISIBLE_CLASS = 'cattail-world-editor-library__scrollbar-visible'
		const MODAL_DESIGN_SIZE = Object.freeze({ width: 1280, height: 792, gutter: 32 })
		const SURFACE_EVENT_TYPES = Object.freeze([
			'mousedown',
			'mouseup',
			'click',
			'dblclick',
			'contextmenu',
			'pointerdown',
			'pointerup',
			'touchstart',
			'touchend',
			'wheel'
		])
		const KEY_EVENT_TYPES = Object.freeze([
			'keydown',
			'keyup',
			'keypress'
		])
		const FOCUSABLE_SELECTOR = [
			'button:not(:disabled)',
			'input:not(:disabled)',
			'select:not(:disabled)',
			'textarea:not(:disabled)',
			'summary',
			'[href]',
			'[tabindex]:not([tabindex="-1"])'
		].join(', ')
		const INERTIAL_SCROLL_OPTIONS = Object.freeze({
			friction: .88,
			directInfluence: .30,
			tailInfluence: .13,
			maxVelocity: 34,
			stopThreshold: .35
		})
		const previous = globalThis[UI_KEY]
		previous?.dispose?.('blueprint-library-ui-replaced')
		const model = {
			area: 'active',
			view: readPreference('view', 'list') === 'grid' ? 'grid' : 'list',
			details: {
				list: readPreference('details-list', 'true') !== 'false',
				grid: readPreference('details-grid', 'false') === 'true'
			},
			selected: null
		}
		let disposed = false
		let game = null
		let controller = null
		let session = null
		let modal = null
		let modalPreviousFocus = null
		let toolbarButton = null
		let toolbarSaveButton = null
		let cardSaveButton = null
		let interactionDialog = null
		let statusMessage = null
		let statusToken = 0
		let statusTimer = null
		let stopLibrary = null
		let stopRuntime = null
		let stopSession = null
		const surfaceScroll = { page: null, modal: null }

		installStyle()
		const pageHandle = api.ui?.pages?.register?.({
			id: PAGE_ID,
			prefix: 'cattail-world-editor-blueprint-library-page',
			menuLabel: function (pageGame) { return label(pageGame, 'library') },
			title: function (pageGame) { return label(pageGame, 'library') },
			width: '1280px',
			contentHeight: '720px',
			mobileContentHeight: '700px',
			inertialScroll: false,
			renderContent(context) {
				game = context.game || game
				return renderView('page', context.refresh)
			},
			onOpen() { void controller?.refresh?.('menu-page-open').catch(showError) },
			onClose() { stopSurfaceScroll('page') }
		})

		const service = Object.freeze({
			version: '0.5.1',
			open,
			close,
			isInputBlocked,
			saveCurrentInteractive,
			dispose
		})
		Object.defineProperty(globalThis, UI_KEY, { value: service, configurable: true, writable: true })

		api.on('afterWords', function (words, currentGame) {
			game = currentGame || game
			refreshActionText()
			if (modal) renderModalBody()
			if (api.ui?.pages?.isActive?.(PAGE_ID)) api.ui.pages.refresh(PAGE_ID)
		})

		api.on('afterGameInit', function (payload, currentGame) {
			game = currentGame
			controller = globalThis[LIBRARY_KEY]
			session = globalThis[SESSION_KEY]
			if (!controller || !session) {
				console.warn('[Cattail World Editor] Blueprint library UI could not find its controller and session.')
				return
			}
			mountToolbar()
			mountCardSave()
			stopLibrary = controller.subscribe(function () {
				refreshSaveButtons()
				if (modal) renderModalBody()
				if (api.ui?.pages?.isActive?.(PAGE_ID)) api.ui.pages.refresh(PAGE_ID)
			})
			stopSession = session.subscribe(function () { refreshSaveButtons() })
			stopRuntime = globalThis[RUNTIME_KEY]?.subscribe?.(function (state) {
				if (!state.active) {
					interactionDialog?.close?.('editor-inactive', true)
					close('editor-inactive')
				}
				if (toolbarButton) toolbarButton.hidden = !state.active
				if (toolbarSaveButton) toolbarSaveButton.hidden = !state.active
			})
			globalThis[RUNTIME_KEY]?.addCleanup?.(function () { service.dispose('runtime-disposed') })
		})

		function mountToolbar() {
			const slot = document.getElementById(SHELL_ID)?.querySelector?.('[data-world-editor-slot="blueprint-library"]')
			if (!slot || toolbarButton) return
			toolbarButton = document.createElement('button')
			toolbarButton.type = 'button'
			toolbarButton.className = 'cattail-world-editor-blueprint-icon-button cattail-world-editor-blueprint-library-button'
			toolbarButton.dataset.worldEditorToolbarCard = ''
			toolbarButton.dataset.worldEditorBlueprintLibrary = ''
			toolbarButton.innerHTML = '<span aria-hidden="true">▣</span><span class="cattail-world-editor-toolbar-card-label"></span>'
			toolbarButton.addEventListener('click', function (event) {
				event.preventDefault()
				event.stopPropagation()
				open('toolbar')
			})
			toolbarSaveButton = document.createElement('button')
			toolbarSaveButton.type = 'button'
			toolbarSaveButton.className = 'cattail-world-editor-blueprint-icon-button cattail-world-editor-blueprint-save-button'
			toolbarSaveButton.dataset.worldEditorToolbarCard = ''
			toolbarSaveButton.dataset.worldEditorBlueprintSave = 'toolbar'
			toolbarSaveButton.innerHTML = '<span aria-hidden="true">⇩</span><span class="cattail-world-editor-toolbar-card-label"></span>'
			toolbarSaveButton.addEventListener('click', handleDirectSave)
			slot.append(toolbarSaveButton, toolbarButton)
			refreshActionText()
			refreshSaveButtons()
			notifyToolbarLayout('library-mounted')
		}

		function mountCardSave() {
			const placement = document.getElementById(CARD_ID)?.querySelector?.('.cattail-world-editor-blueprint-card__placement')
			if (!placement || cardSaveButton) return
			cardSaveButton = document.createElement('button')
			cardSaveButton.type = 'button'
			cardSaveButton.className = 'cattail-world-editor-blueprint-card__save-library'
			cardSaveButton.dataset.worldEditorBlueprintSave = 'card'
			cardSaveButton.addEventListener('click', handleDirectSave)
			placement.prepend(cardSaveButton)
			refreshActionText()
			refreshSaveButtons()
		}

		function handleDirectSave(event) {
			event?.preventDefault?.()
			event?.stopPropagation?.()
			if (event?.currentTarget?.disabled) return
			void saveCurrentInteractive().catch(showError)
		}

		function refreshActionText() {
			const libraryText = label(game, 'library')
			const saveText = label(game, 'save')
			if (toolbarButton) {
				toolbarButton.title = libraryText
				toolbarButton.setAttribute('aria-label', libraryText)
				toolbarButton.querySelector('.cattail-world-editor-toolbar-card-label').textContent = libraryText
			}
			if (toolbarSaveButton) {
				toolbarSaveButton.title = saveText
				toolbarSaveButton.setAttribute('aria-label', saveText)
				toolbarSaveButton.querySelector('.cattail-world-editor-toolbar-card-label').textContent = saveText
			}
			if (cardSaveButton) {
				cardSaveButton.textContent = saveText
				cardSaveButton.title = saveText
				cardSaveButton.setAttribute('aria-label', saveText)
			}
		}

		function refreshSaveButtons() {
			const libraryState = controller?.snapshot?.()
			const disabled = !session?.snapshot?.().sourceBlueprint || !libraryState?.ready || libraryState.busy
			for (const button of [toolbarSaveButton, cardSaveButton]) {
				if (!button) continue
				button.disabled = !!disabled
				button.setAttribute('aria-disabled', disabled ? 'true' : 'false')
			}
		}

		function open(reason) {
			if (disposed || modal || typeof document === 'undefined') return false
			modalPreviousFocus = document.activeElement
			modal = document.createElement('div')
			modal.className = 'cattail-world-editor-library-modal'
			modal.dataset.theme = game?.plane ? 'void' : 'reality'
			modal.innerHTML = '<div class="cattail-world-editor-library-modal__backdrop"></div><section class="cattail-world-editor-library-modal__panel" role="dialog" aria-modal="true"><header><h2></h2><button type="button" data-library-close><span class="cattail-world-editor-library-modal__close-mark" aria-hidden="true"></span></button></header><div data-library-modal-body></div></section>'
			modal.querySelector('h2').textContent = label(game, 'library')
			modal.querySelector('[data-library-close]').setAttribute('aria-label', label(game, 'close'))
			modal.querySelector('[data-library-close]').addEventListener('click', function () { close('button') })
			modal.querySelector('.cattail-world-editor-library-modal__backdrop').addEventListener('click', function () { close('backdrop') })
			releaseGameKeyboardState(game)
			for (const type of KEY_EVENT_TYPES) window.addEventListener(type, handleModalKeyEvent, true)
			window.addEventListener('resize', refreshModalScale)
			for (const type of SURFACE_EVENT_TYPES) modal.addEventListener(type, handleModalSurfaceEvent)
			document.body.append(modal)
			refreshModalScale()
			renderModalBody()
			void controller?.refresh?.(reason || 'modal-open').catch(showError)
			const openedModal = modal
			const closeButton = modal.querySelector('[data-library-close]')
			setTimeout(function () {
				if (modal === openedModal && closeButton?.isConnected) closeButton.focus?.()
			}, 0)
			return true
		}

		function close() {
			if (!modal) return false
			const closingModal = modal
			const previousFocus = modalPreviousFocus
			modal = null
			modalPreviousFocus = null
			stopSurfaceScroll('modal')
			window.removeEventListener('resize', refreshModalScale)
			for (const type of KEY_EVENT_TYPES) window.removeEventListener(type, handleModalKeyEvent, true)
			for (const type of SURFACE_EVENT_TYPES) closingModal.removeEventListener(type, handleModalSurfaceEvent)
			closingModal.remove()
			releaseGameKeyboardState(game)
			if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus()
			return true
		}

		function refreshModalScale() {
			if (!modal || typeof window === 'undefined') return
			const availableWidth = Math.max(1, Number(window.innerWidth) - MODAL_DESIGN_SIZE.gutter)
			const availableHeight = Math.max(1, Number(window.innerHeight) - MODAL_DESIGN_SIZE.gutter)
			const displayWidth = Math.max(
				availableWidth,
				Math.max(1, Number(window.screen?.availWidth) - MODAL_DESIGN_SIZE.gutter)
			)
			const displayHeight = Math.max(
				availableHeight,
				Math.max(1, Number(window.screen?.availHeight) - MODAL_DESIGN_SIZE.gutter)
			)
			const displayRatio = Math.min(
				1,
				availableWidth / displayWidth,
				availableHeight / displayHeight
			)
			const responsiveScale = .5 + .5 * displayRatio
			const scale = Math.min(
				1,
				availableWidth / MODAL_DESIGN_SIZE.width,
				availableHeight / MODAL_DESIGN_SIZE.height,
				responsiveScale
			)
			const normalized = String(Math.round(scale * 1000000) / 1000000)
			modal.style.setProperty('--world-editor-library-modal-scale', normalized)
			modal.dataset.scale = normalized
		}

		function isInputBlocked() {
			return !disposed && !!modal
		}

		function handleModalSurfaceEvent(event) {
			event.stopPropagation()
		}

		function handleModalKeyEvent(event) {
			if (!modal || interactionDialog) return
			event.stopImmediatePropagation()
			if (event.type !== 'keydown') return
			const key = String(event.key || '').toLowerCase()
			if (key === 'escape' || event.keyCode === 27) {
				event.preventDefault()
				const openMenu = modal.querySelector?.('[data-library-menu][open]')
				if (openMenu) {
					openMenu.open = false
					openMenu.querySelector?.('summary')?.focus?.()
					return
				}
				close('escape')
				return
			}
			if (key === 'tab' || event.keyCode === 9) trapModalFocus(event)
		}

		function trapModalFocus(event) {
			const focusable = Array.from(modal?.querySelectorAll?.(FOCUSABLE_SELECTOR) || []).filter(function (element) {
				return !element.hidden && Number(element.getClientRects?.().length || 0) > 0
			})
			if (!focusable.length) {
				event.preventDefault()
				return
			}
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

		function releaseGameKeyboardState(currentGame) {
			if (Array.isArray(currentGame?.translationMap)) {
				for (let index = 0; index < currentGame.translationMap.length; index += 1) {
					currentGame.translationMap[index] = 0
				}
			}
			if (currentGame) {
				delete currentGame.keyboardMovementHappening
				currentGame.altActive = false
			}
			document.body?.classList?.remove?.('altHolded')
		}

		function renderModalBody() {
			const target = modal?.querySelector?.('[data-library-modal-body]')
			if (!target) return
			target.replaceChildren(renderView('modal', renderModalBody))
		}

		function renderView(surface, refreshSurface) {
			stopSurfaceScroll(surface)
			const state = controller?.snapshot?.()
			const root = document.createElement('div')
			root.className = 'cattail-world-editor-library'
			root.dataset.surface = surface
			root.dataset.view = model.view

			const toolbar = document.createElement('div')
			toolbar.className = 'cattail-world-editor-library__toolbar'
			const primaryActions = document.createElement('div')
			primaryActions.className = 'cattail-world-editor-library__toolbar-group cattail-world-editor-library__toolbar-group--actions'
			appendSeparated(primaryActions, [
				actionButton(label(game, 'save'), function () { void saveCurrentInteractive().catch(showError) }, !session?.snapshot?.().sourceBlueprint || !state?.ready || state.busy),
				actionButton(label(game, 'import'), function () { void importInteractive().catch(showError) }, !state?.ready || state.busy),
				actionButton(label(game, 'refresh'), function () { void controller.refresh('ui-refresh').catch(showError) }),
				actionButton(label(game, 'folder'), function () { void controller.openFolder({ area: model.area === 'problems' ? 'active' : model.area }).catch(showError) })
			])
			const viewOptions = document.createElement('div')
			viewOptions.className = 'cattail-world-editor-library__toolbar-group cattail-world-editor-library__toolbar-group--view'
			const areaMenu = createMenuSelect('area', ['active', 'problems', 'trash', 'quarantine'], model.area, function (area) {
				model.area = area
				model.selected = null
				refreshSurface()
			})
			const viewMenu = createMenuSelect('view', ['list', 'grid'], model.view, function (view) {
				model.view = view
				writePreference('view', model.view)
				refreshSurface()
			})
			appendSeparated(viewOptions, [areaMenu, viewMenu])
			const preferences = document.createElement('div')
			preferences.className = 'cattail-world-editor-library__toolbar-group cattail-world-editor-library__toolbar-group--preferences'
			const details = document.createElement('label')
			details.className = 'cattail-world-editor-library__check'
			const detailsInput = document.createElement('input')
			detailsInput.type = 'checkbox'
			detailsInput.checked = model.details[model.view]
			detailsInput.addEventListener('change', function () {
				model.details[model.view] = detailsInput.checked
				writePreference('details-' + model.view, detailsInput.checked ? 'true' : 'false')
				refreshSurface()
			})
			details.append(detailsInput, document.createTextNode(label(game, 'details')))
			preferences.append(details)
			appendSeparated(toolbar, [primaryActions, viewOptions, preferences])
			const toolbarRule = document.createElement('div')
			toolbarRule.className = 'cattail-world-editor-library__toolbar-rule'
			root.append(toolbar, toolbarRule, renderStatus())

			const layout = document.createElement('div')
			layout.className = 'cattail-world-editor-library__layout'
			const collection = document.createElement('div')
			collection.className = 'cattail-world-editor-library__collection'
			const entries = state ? entriesFor(state) : []
			if (!entries.length) {
				const empty = document.createElement('div')
				empty.className = 'cattail-world-editor-library__empty'
				empty.textContent = label(game, 'empty')
				collection.append(empty)
			}
			for (const entry of entries) collection.append(renderEntry(entry, refreshSurface))
			const selected = entries.find(function (entry) { return entryKey(entry) === model.selected }) || null
			const layoutRule = document.createElement('div')
			layoutRule.className = 'cattail-world-editor-library__layout-rule'
			layoutRule.setAttribute('aria-hidden', 'true')
			const detailsPanel = renderDetails(selected, refreshSurface)
			layout.append(collection, layoutRule, detailsPanel)
			root.append(layout)
			installSurfaceScroll(surface, [collection, detailsPanel])
			return root
		}

		function installSurfaceScroll(surface, elements) {
			const pages = api.ui?.pages
			const record = { elements: [], stops: [] }
			for (const element of elements || []) {
				if (!element) continue
				pages?.installTransientScrollbar?.(element, SCROLLBAR_VISIBLE_CLASS)
				const stop = pages?.installInertialScroll?.(element, INERTIAL_SCROLL_OPTIONS)
				record.elements.push(element)
				if (typeof stop === 'function') record.stops.push(stop)
			}
			surfaceScroll[surface] = record
		}

		function stopSurfaceScroll(surface) {
			const record = surfaceScroll[surface]
			if (!record) return
			for (const stop of record.stops || []) {
				try { stop() } catch (error) {}
			}
			for (const element of record.elements || []) {
				element.onwheel = null
				element.onscroll = null
				element.onpointerdown = null
				element.classList.remove('modloader-ui-page-scrollbar-visible', SCROLLBAR_VISIBLE_CLASS)
			}
			surfaceScroll[surface] = null
		}

		function renderEntry(entry, refreshSurface) {
			const item = document.createElement('button')
			item.type = 'button'
			item.className = 'cattail-world-editor-library__item'
			item.dataset.selected = entryKey(entry) === model.selected ? 'true' : 'false'
			if (item.dataset.selected === 'true') item.dataset.librarySelectedEntry = ''
			const image = document.createElement('img')
			image.alt = ''
			const thumbnails = globalThis[Symbol.for('cattail.world-editor.blueprint-thumbnail')]
			const resolvedThumbnail = entry.envelope ? thumbnails?.peek?.(entry) : null
			image.src = resolvedThumbnail?.url || thumbnails?.placeholder || ''
			if (entry.envelope && !resolvedThumbnail?.url) {
				void controller.thumbnail(entry).then(function (result) { if (image.isConnected && result?.url) image.src = result.url })
			}
			const text = document.createElement('span')
			text.className = 'cattail-world-editor-library__item-text'
			const name = document.createElement('strong')
			name.textContent = entry.envelope?.displayName || entry.name
			text.append(name)
			if (entry.error) {
				const error = document.createElement('small')
				error.textContent = entry.error.code + ': ' + entry.error.message
				text.append(error)
			} else if (model.details[model.view]) {
				const detail = document.createElement('small')
				detail.textContent = entryDetailText(entry.metadata)
				text.append(detail)
			}
			item.append(image, text)
			item.addEventListener('click', function () { model.selected = entryKey(entry); refreshSurface() })
			item.addEventListener('dblclick', function () { if (entry.area === 'active' && !entry.error) void loadInteractive(entry).catch(showError) })
			return item
		}

		function renderDetails(entry, refreshSurface) {
			const panel = document.createElement('aside')
			panel.className = 'cattail-world-editor-library__details'
			if (!entry) {
				panel.textContent = label(game, 'select')
				return panel
			}
			const title = document.createElement('h3')
			title.textContent = entry.envelope?.displayName || entry.name
			const description = document.createElement('p')
			description.textContent = entry.error ? entry.error.message : detailText(entry.metadata)
			panel.append(title, description)
			const actions = document.createElement('div')
			actions.className = 'cattail-world-editor-library__actions'
			if (entry.area === 'active' && !entry.error) {
				appendSeparated(actions, [
					actionButton(label(game, 'load'), function () { void loadInteractive(entry).catch(showError) }),
					actionButton(label(game, 'rename'), function () { void renameInteractive(entry).catch(showError) }),
					actionButton(label(game, 'duplicate'), function () { void controller.duplicate(entry).catch(showError) }),
					actionButton(label(game, 'trashAction'), function () { void trashInteractive(entry).catch(showError) }),
					actionButton(label(game, 'exportFile'), function () { void exportInteractive(entry).catch(showError) }),
					actionButton(label(game, 'copyShareText'), function () { void copyShareInteractive(entry).catch(showError) })
				])
			} else if (entry.area === 'active') {
				appendSeparated(actions, [
					actionButton(label(game, 'retry'), function () { void controller.retry(entry).catch(showError) }),
					actionButton(label(game, 'quarantineAction'), function () { void controller.quarantine(entry).catch(showError) }),
					actionButton(label(game, 'trashAction'), function () { void trashInteractive(entry).catch(showError) })
				])
			} else if (entry.area === 'trash') {
				appendSeparated(actions, [
					actionButton(label(game, 'restore'), function () { void controller.restore(entry).catch(showError) }),
					actionButton(label(game, 'remove'), function () { void removeInteractive(entry).catch(showError) })
				])
			} else {
				appendSeparated(actions, [actionButton(label(game, 'remove'), function () { void removeInteractive(entry).catch(showError) })])
			}
			panel.append(actions)
			return panel
		}

		function renderStatus() {
			const region = document.createElement('div')
			region.className = 'cattail-world-editor-library__status'
			region.setAttribute('aria-live', statusMessage?.kind === 'error' ? 'assertive' : 'polite')
			region.setAttribute('aria-atomic', 'true')
			region.setAttribute('role', statusMessage?.kind === 'error' ? 'alert' : 'status')
			region.hidden = !statusMessage
			if (!statusMessage) return region
			region.dataset.kind = statusMessage.kind
			const text = document.createElement('span')
			text.textContent = statusMessage.text
			region.append(text)
			if (statusMessage.kind === 'error') {
				const dismiss = actionButton('×', function () { clearStatus(true) })
				dismiss.className = 'cattail-world-editor-library__status-dismiss'
				dismiss.title = label(game, 'statusDismiss')
				dismiss.setAttribute('aria-label', label(game, 'statusDismiss'))
				region.append(dismiss)
			}
			return region
		}

		async function importInteractive() {
			beginStatusOperation()
			const source = await requestImportSource()
			if (!source) return false
			let candidate
			if (source === 'file') {
				candidate = await controller.pickImport({ title: label(game, 'importFileTitle') })
				if (candidate?.canceled) return false
			} else {
				let text
				try {
					if (typeof globalThis.navigator?.clipboard?.readText !== 'function') throw new Error(label(game, 'clipboardReadFailed'))
					text = await globalThis.navigator.clipboard.readText()
				} catch (clipboardError) {
					throw libraryUiError('CLIPBOARD_READ_FAILED', label(game, 'clipboardReadFailed'))
				}
				candidate = await controller.prepareImportText(text, { source: 'clipboard' })
			}
			const result = candidate.conflict
				? await resolveImportConflict(candidate)
				: await controller.commitImport(candidate, 'import')
			if (!result || result.canceled) return false
			selectImportedEntry(result.entry)
			setStatus('success', formatLabel(result.replaced ? 'replaceSuccess' : 'importSuccess', {
				name: result.entry?.envelope?.displayName || candidate.envelope.displayName
			}), true)
			return true
		}

		async function exportInteractive(entry) {
			beginStatusOperation()
			const result = await controller.exportItem(entry, { title: label(game, 'exportFileTitle') })
			if (result?.canceled) return false
			setStatus('success', formatLabel('exportSuccess', { name: result?.fileName || entry.envelope.displayName }), true)
			return true
		}

		async function copyShareInteractive(entry) {
			beginStatusOperation()
			const shared = await controller.shareText(entry)
			try {
				if (typeof globalThis.navigator?.clipboard?.writeText !== 'function') throw new Error(label(game, 'clipboardWriteFailed'))
				await globalThis.navigator.clipboard.writeText(shared.text)
			} catch (clipboardError) {
				throw libraryUiError('CLIPBOARD_WRITE_FAILED', label(game, 'clipboardWriteFailed'))
			}
			setStatus('success', formatLabel('shareSuccess', { name: shared.envelope.displayName }), true)
			return true
		}

		function requestImportSource() {
			const dialogs = globalThis[DIALOG_KEY]
			if (!dialogs || typeof dialogs.create !== 'function') return Promise.reject(new Error(label(game, 'dialogUnavailable')))
			interactionDialog?.close?.('blueprint-import-source-replaced', true)
			return new Promise(function (resolve) {
				let settled = false
				const finish = function (value, reason) {
					if (settled) return
					settled = true
					resolve(value)
					dialog.close(reason, true)
				}
				const dialog = dialogs.create({
					id: 'cattail-world-editor-blueprint-import-source-dialog',
					theme: game?.plane ? 'void' : 'reality',
					kind: 'blueprint-library-import-source',
					title: label(game, 'importTitle'),
					onClose() {
						if (interactionDialog === dialog) interactionDialog = null
						if (!settled) { settled = true; resolve(null) }
					}
				})
				interactionDialog = dialog
				const file = dialog.createButton(label(game, 'chooseFile'), { primary: true })
				const paste = dialog.createButton(label(game, 'pasteShareText'))
				const cancel = dialog.createButton(label(game, 'cancel'))
				file.addEventListener('click', function () { finish('file', 'blueprint-import-file-selected') })
				paste.addEventListener('click', function () { finish('clipboard', 'blueprint-import-paste-selected') })
				cancel.addEventListener('click', function () { finish(null, 'blueprint-import-cancelled') })
				appendSeparated(dialog.actions, [file, paste, cancel])
				dialog.mount(file)
			})
		}

		function resolveImportConflict(candidate) {
			const dialogs = globalThis[DIALOG_KEY]
			if (!dialogs || typeof dialogs.create !== 'function') return Promise.reject(new Error(label(game, 'dialogUnavailable')))
			interactionDialog?.close?.('blueprint-import-conflict-replaced', true)
			return new Promise(function (resolve) {
				let settled = false
				const finish = function (value, reason) {
					if (settled) return
					settled = true
					resolve(value)
					dialog.close(reason, true)
				}
				const dialog = dialogs.create({
					id: 'cattail-world-editor-blueprint-import-conflict-dialog',
					theme: game?.plane ? 'void' : 'reality',
					kind: 'blueprint-library-import-conflict',
					title: label(game, 'conflictTitle'),
					message: label(game, 'conflictMessage'),
					onClose() {
						if (interactionDialog === dialog) interactionDialog = null
						if (!settled) { settled = true; resolve(null) }
					}
				})
				interactionDialog = dialog
				dialog.content.append(
					renderImportSummary(label(game, 'sourceHeading'), candidate.envelope, candidate.metadata, candidate.bytes),
					renderImportSummary(label(game, 'existingHeading'), candidate.conflict.envelope, candidate.conflict.metadata, candidate.conflict.info?.size)
				)
				const copy = dialog.createButton(label(game, 'importAsCopy'), { primary: true })
				const replace = dialog.createButton(label(game, 'importReplace'), { danger: true })
				const cancel = dialog.createButton(label(game, 'cancel'))
				const commit = async function (resolution) {
					dialog.setBusy(true)
					dialog.clearError()
					try {
						finish(await controller.commitImport(candidate, resolution), 'blueprint-import-conflict-resolved')
					} catch (error) {
						dialog.setBusy(false)
						dialog.showError(error)
						setStatus('error', String(error?.message || label(game, 'unavailable')))
					}
				}
				copy.addEventListener('click', function () { void commit('copy') })
				replace.addEventListener('click', function () { void commit('replace') })
				cancel.addEventListener('click', function () { finish(null, 'blueprint-import-conflict-cancelled') })
				appendSeparated(dialog.actions, [copy, replace, cancel])
				dialog.mount(copy)
			})
		}

		function renderImportSummary(heading, envelope, metadata, bytes) {
			const section = document.createElement('section')
			section.className = 'cattail-world-editor-library-import-summary'
			const title = document.createElement('h3')
			title.textContent = heading
			const name = document.createElement('strong')
			name.textContent = envelope?.displayName || ''
			const details = document.createElement('dl')
			for (const pair of [
				[label(game, 'mode'), metadata?.mode || envelope?.blueprint?.mode || '—'],
				[label(game, 'dimensions'), String(metadata?.width || 0) + '×' + String(metadata?.height || 0)],
				[label(game, 'modified'), formatTime(envelope?.modifiedAt)],
				[label(game, 'bytes'), Number.isFinite(Number(bytes)) ? formatBytes(bytes) : '—']
			]) {
				const term = document.createElement('dt')
				term.textContent = pair[0]
				const value = document.createElement('dd')
				value.textContent = pair[1]
				details.append(term, value)
			}
			section.append(title, name, details)
			return section
		}

		function selectImportedEntry(entry) {
			model.area = 'active'
			model.selected = entryKey(entry)
			refreshLibrarySurfaces()
			setTimeout(function () {
				for (const element of document.querySelectorAll?.('[data-library-selected-entry]') || []) {
					element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
				}
			}, 0)
		}

		async function loadInteractive(entry) {
			await controller.load(entry)
			close('loaded')
			api.ui?.pages?.close?.(PAGE_ID)
			globalThis[RUNTIME_KEY]?.activate?.('blueprint-library-load')
			return true
		}

		async function renameInteractive(entry) {
			const value = await requestBlueprintName({
				title: label(game, 'renameTitle'),
				message: label(game, 'nameMessage'),
				confirm: label(game, 'renameConfirm'),
				value: entry.envelope.displayName
			})
			if (!value) return false
			await controller.rename(entry, value)
			return true
		}

		async function trashInteractive(entry) {
			const accepted = await requestConfirmation({
				title: label(game, 'trashTitle'),
				message: label(game, 'confirmTrash'),
				confirm: label(game, 'trashAction')
			})
			if (!accepted) return false
			await controller.trash(entry)
			return true
		}

		async function removeInteractive(entry) {
			const accepted = await requestConfirmation({
				title: label(game, 'removeTitle'),
				message: label(game, 'confirmRemove'),
				confirm: label(game, 'remove'),
				danger: true
			})
			if (!accepted) return false
			await controller.remove(entry)
			return true
		}

		async function saveCurrentInteractive() {
			const state = session?.snapshot?.()
			if (!state?.sourceBlueprint) return false
			if (state.origin?.id) {
				const accepted = await requestConfirmation({
					title: label(game, 'replaceTitle'),
					message: label(game, 'confirmReplace'),
					confirm: label(game, 'replaceConfirm')
				})
				if (!accepted) return false
				await controller.saveCurrent({ replace: true, entry: state.origin, displayName: state.origin.displayName })
				return true
			}
			const name = await requestBlueprintName({
				title: label(game, 'saveTitle'),
				message: label(game, 'nameMessage'),
				confirm: label(game, 'saveConfirm'),
				value: defaultName()
			})
			if (!name) return false
			await controller.saveCurrent({ displayName: name })
			return true
		}

		function requestBlueprintName(options) {
			const dialogs = globalThis[DIALOG_KEY]
			if (!dialogs || typeof dialogs.create !== 'function') {
				return Promise.reject(new Error(label(game, 'dialogUnavailable')))
			}
			interactionDialog?.close?.('blueprint-name-dialog-replaced', true)
			return new Promise(function (resolve) {
				let settled = false
				const finish = function (value, reason) {
					if (settled) return
					settled = true
					resolve(value)
					dialog.close(reason, true)
				}
				const dialog = dialogs.create({
					id: 'cattail-world-editor-blueprint-name-dialog',
					theme: game?.plane ? 'void' : 'reality',
					kind: 'blueprint-library-name',
					title: options?.title,
					message: options?.message,
					onClose() {
						if (interactionDialog === dialog) interactionDialog = null
						if (!settled) {
							settled = true
							resolve(null)
						}
					}
				})
				interactionDialog = dialog

				const form = document.createElement('form')
				form.id = 'cattail-world-editor-blueprint-name-form'
				form.className = 'cattail-world-editor-library-name-form'
				const field = document.createElement('label')
				field.className = 'cattail-world-editor-library-name-form__field'
				const fieldText = document.createElement('span')
				fieldText.textContent = label(game, 'nameLabel')
				const input = document.createElement('input')
				input.type = 'text'
				input.maxLength = 160
				input.value = String(options?.value || '').slice(0, input.maxLength)
				input.autocomplete = 'off'
				input.spellcheck = false
				input.setAttribute('data-blueprint-library-name', '')
				field.append(fieldText, input)
				form.append(field)
				dialog.content.append(form)

				const cancel = dialog.createButton(label(game, 'cancel'))
				const confirmName = dialog.createButton(options?.confirm || label(game, 'saveConfirm'), { primary: true })
				confirmName.type = 'submit'
				confirmName.setAttribute('form', form.id)
				const refresh = function () { confirmName.disabled = !input.value.trim() }
				form.addEventListener('submit', function (event) {
					event.preventDefault()
					const value = input.value.trim()
					if (!value) return refresh()
					finish(value, 'blueprint-name-confirmed')
				})
				cancel.addEventListener('click', function () { finish(null, 'blueprint-name-cancelled') })
				for (const type of ['input', 'change', 'compositionend']) input.addEventListener(type, refresh)
				appendSeparated(dialog.actions, [cancel, confirmName])
				refresh()
				dialog.mount(input)
				setTimeout(function () {
					if (!dialog.closed && input.isConnected) input.select()
				}, 0)
			})
		}

		function requestConfirmation(options) {
			const dialogs = globalThis[DIALOG_KEY]
			if (!dialogs || typeof dialogs.create !== 'function') {
				return Promise.reject(new Error(label(game, 'dialogUnavailable')))
			}
			interactionDialog?.close?.('blueprint-confirm-dialog-replaced', true)
			return new Promise(function (resolve) {
				let settled = false
				const finish = function (accepted, reason) {
					if (settled) return
					settled = true
					resolve(accepted === true)
					dialog.close(reason, true)
				}
				const dialog = dialogs.create({
					id: 'cattail-world-editor-blueprint-confirm-dialog',
					theme: game?.plane ? 'void' : 'reality',
					kind: 'blueprint-library-confirm',
					title: options?.title,
					message: options?.message,
					onClose() {
						if (interactionDialog === dialog) interactionDialog = null
						if (!settled) {
							settled = true
							resolve(false)
						}
					}
				})
				interactionDialog = dialog
				const cancel = dialog.createButton(label(game, 'cancel'))
				const confirmAction = dialog.createButton(options?.confirm, {
					primary: true,
					danger: options?.danger === true
				})
				cancel.addEventListener('click', function () { finish(false, 'blueprint-confirm-cancelled') })
				confirmAction.addEventListener('click', function () { finish(true, 'blueprint-confirm-accepted') })
				appendSeparated(dialog.actions, [cancel, confirmAction])
				dialog.mount(cancel)
			})
		}

		function showMessageDialog(options) {
			const dialogs = globalThis[DIALOG_KEY]
			if (!dialogs || typeof dialogs.create !== 'function') return false
			interactionDialog?.close?.('blueprint-message-dialog-replaced', true)
			const dialog = dialogs.create({
				id: 'cattail-world-editor-blueprint-message-dialog',
				theme: game?.plane ? 'void' : 'reality',
				kind: 'blueprint-library-message',
				title: options?.title,
				message: options?.message,
				onClose() { if (interactionDialog === dialog) interactionDialog = null }
			})
			interactionDialog = dialog
			const closeButton = dialog.createButton(label(game, 'close'), { primary: true })
			closeButton.addEventListener('click', function () { dialog.close('blueprint-message-closed', true) })
			appendSeparated(dialog.actions, [closeButton])
			dialog.mount(closeButton)
			return true
		}

		function actionButton(text, handler, disabled) {
			const button = document.createElement('button')
			button.type = 'button'
			button.textContent = text
			button.disabled = !!disabled
			button.addEventListener('click', handler)
			return button
		}

		function createMenuSelect(name, values, currentValue, onChange) {
			const menu = document.createElement('details')
			menu.className = 'cattail-world-editor-library__menu'
			menu.dataset.libraryMenu = name
			const summary = document.createElement('summary')
			summary.className = 'cattail-world-editor-library__menu-summary'
			summary.textContent = label(game, currentValue)
			summary.setAttribute('aria-haspopup', 'listbox')
			summary.setAttribute('aria-expanded', 'false')
			const popup = document.createElement('div')
			popup.className = 'cattail-world-editor-library__menu-popup'
			popup.setAttribute('role', 'listbox')
			const options = []
			for (const value of values) {
				const option = document.createElement('button')
				option.type = 'button'
				option.className = 'cattail-world-editor-library__menu-option'
				option.dataset.value = value
				option.dataset.selected = value === currentValue ? 'true' : 'false'
				option.setAttribute('role', 'option')
				option.setAttribute('aria-selected', value === currentValue ? 'true' : 'false')
				option.textContent = label(game, value)
				option.addEventListener('click', function (event) {
					event.preventDefault()
					event.stopPropagation()
					menu.open = false
					if (value !== currentValue) onChange(value)
					else summary.focus()
				})
				option.addEventListener('keydown', function (event) {
					const index = options.indexOf(option)
					let target = -1
					if (event.key === 'ArrowDown') target = (index + 1) % values.length
					else if (event.key === 'ArrowUp') target = (index - 1 + values.length) % values.length
					else if (event.key === 'Home') target = 0
					else if (event.key === 'End') target = values.length - 1
					if (target < 0) return
					event.preventDefault()
					options[target]?.focus?.()
				})
				options.push(option)
				popup.append(option)
			}
			menu.append(summary, popup)
			menu.addEventListener('toggle', function () {
				summary.setAttribute('aria-expanded', menu.open ? 'true' : 'false')
				if (!menu.open) return
				for (const sibling of menu.parentElement?.querySelectorAll?.('[data-library-menu][open]') || []) {
					if (sibling !== menu) sibling.open = false
				}
			})
			summary.addEventListener('keydown', function (event) {
				if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
				event.preventDefault()
				menu.open = true
				const selected = Math.max(0, values.indexOf(currentValue))
				const index = event.key === 'ArrowUp' ? Math.max(0, selected - 1) : selected
				setTimeout(function () { options[index]?.focus?.() }, 0)
			})
			menu.addEventListener('keydown', function (event) {
				if (event.key !== 'Escape') return
				event.preventDefault()
				event.stopPropagation()
				menu.open = false
				summary.focus()
			})
			menu.addEventListener('focusout', function () {
				setTimeout(function () {
					if (!menu.contains(document.activeElement)) menu.open = false
				}, 0)
			})
			return menu
		}

		function appendSeparated(container, items) {
			let appended = 0
			for (const item of items || []) {
				if (!item) continue
				if (appended > 0) {
					const separator = document.createElement('span')
					separator.className = 'cattail-world-editor-library__separator'
					separator.setAttribute('aria-hidden', 'true')
					container.append(separator)
				}
				container.append(item)
				appended += 1
			}
			return container
		}

		function entriesFor(state) {
			return model.area === 'problems' ? state.problems : state[model.area] || []
		}

		function entryKey(entry) { return entry.area + ':' + entry.name + ':' + entry.revision }

		function entryDetailText(metadata) {
			if (!metadata) return ''
			const transform = metadata.defaultTransform || { rotation: 0, mirrorU: false, mirrorV: false }
			const mirror = (transform.mirrorU ? ' · M-U' : '') + (transform.mirrorV ? ' · M-V' : '')
			return metadata.width + '×' + metadata.height + ' · ' + metadata.entityCount + ' Buildings · ' + metadata.blockCount + ' Cubes · ' + metadata.surgeCount + ' Surges · Schema ' + metadata.schemaVersion + ' · R' + transform.rotation + '°' + mirror
		}

		function detailText(metadata) {
			if (!metadata) return ''
			const transform = metadata.defaultTransform || { rotation: 0, mirrorU: false, mirrorV: false }
			const mirror = [transform.mirrorU ? 'U' : '', transform.mirrorV ? 'V' : ''].filter(Boolean).join('+') || 'None'
			return [
				'Area: ' + metadata.width + '×' + metadata.height,
				'Buildings: ' + metadata.entityCount,
				'Cubes: ' + metadata.blockCount,
				'Surges: ' + metadata.surgeCount,
				'Rotate: ' + transform.rotation + '°',
				'Mirror: ' + mirror,
				'Schema: ' + metadata.schemaVersion
			].join('\n')
		}

		function formatTime(value) {
			const date = new Date(value || 0)
			return Number.isFinite(date.getTime()) ? date.toLocaleString() : '—'
		}

		function formatBytes(value) {
			const bytes = Math.max(0, Number(value) || 0)
			if (bytes < 1024) return bytes + ' B'
			if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KiB'
			return (bytes / (1024 * 1024)).toFixed(1) + ' MiB'
		}

		function defaultName() {
			const date = new Date()
			return label(game, 'blueprint') + ' ' + date.toLocaleString()
		}

		function beginStatusOperation() {
			clearStatus(true)
		}

		function setStatus(kind, text, temporary) {
			statusToken += 1
			const token = statusToken
			if (statusTimer !== null) clearTimeout(statusTimer)
			statusTimer = null
			statusMessage = Object.freeze({ kind: kind === 'error' ? 'error' : 'success', text: String(text || '') })
			refreshLibrarySurfaces()
			if (temporary) {
				statusTimer = setTimeout(function () {
					if (statusToken === token) clearStatus(true)
				}, 4500)
			}
		}

		function clearStatus(refresh) {
			statusToken += 1
			if (statusTimer !== null) clearTimeout(statusTimer)
			statusTimer = null
			const changed = !!statusMessage
			statusMessage = null
			if (changed && refresh) refreshLibrarySurfaces()
		}

		function refreshLibrarySurfaces() {
			if (modal) renderModalBody()
			if (api.ui?.pages?.isActive?.(PAGE_ID)) api.ui.pages.refresh(PAGE_ID)
		}

		function formatLabel(key, values) {
			return label(game, key).replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, name) {
				return Object.prototype.hasOwnProperty.call(values || {}, name) ? String(values[name]) : match
			})
		}

		function showError(error) {
			console.warn('[Cattail World Editor] Blueprint library UI operation failed.', error)
			const message = String(error?.message || label(game, 'unavailable'))
			setStatus('error', message)
			if (!modal && !api.ui?.pages?.isActive?.(PAGE_ID)) showMessageDialog({ title: label(game, 'errorTitle'), message })
		}

		function dispose(reason) {
			if (disposed) return false
			disposed = true
			clearStatus(false)
			interactionDialog?.close?.(reason || 'blueprint-library-ui-disposed', true)
			interactionDialog = null
			stopSurfaceScroll('page')
			stopSurfaceScroll('modal')
			close(reason)
			stopLibrary?.()
			stopRuntime?.()
			stopSession?.()
			toolbarButton?.remove()
			toolbarButton = null
			toolbarSaveButton?.remove()
			toolbarSaveButton = null
			cardSaveButton?.remove()
			cardSaveButton = null
			notifyToolbarLayout('library-unmounted')
			if (globalThis[UI_KEY] === service) delete globalThis[UI_KEY]
			return true
		}

		function notifyToolbarLayout(reason) {
			try { window.dispatchEvent(new CustomEvent('cattail:world-editor-toolbar-layout', { detail: { reason } })) } catch (error) {}
		}

		function readPreference(key, fallback) {
			try { return localStorage.getItem('cattail.world-editor.library.' + key) || fallback } catch (error) { return fallback }
		}

		function writePreference(key, value) {
			try { localStorage.setItem('cattail.world-editor.library.' + key, value) } catch (error) {}
		}

		function isChinese(source) {
			const id = String(source?.language || source?.settings?.language || '').toLowerCase()
			return id === 'sch' || id === 'modsch' || id === 'tch' || id.startsWith('zh')
		}

		function label(source, key) {
			const textKey = LIBRARY_TEXT_KEYS[key]
			const i18n = globalThis[I18N_KEY]
			if (textKey && typeof i18n?.t === 'function') return i18n.t(source, textKey)
			const en = {
				library: 'Blueprint Library', close: 'Close', save: 'Save to Library', refresh: 'Refresh', folder: 'Open Folder',
				active: 'Blueprints', problems: 'Problems', trash: 'Trash', quarantine: 'Quarantine', list: 'List', grid: 'Grid', details: 'Show details',
				unavailable: 'Library unavailable', empty: 'No blueprints here.', select: 'Select a blueprint to view details.',
				load: 'Load', rename: 'Rename', duplicate: 'Duplicate', trashAction: 'Move to Trash', retry: 'Retry', quarantineAction: 'Quarantine', restore: 'Restore', remove: 'Delete Permanently',
				confirmTrash: 'Move this blueprint to Trash?', confirmRemove: 'Permanently delete this item? This cannot be undone.', confirmReplace: 'Replace the saved blueprint contents? The old version will remain recoverable in Trash.',
				saveTitle: 'Save blueprint', renameTitle: 'Rename blueprint', trashTitle: 'Move blueprint to Trash', removeTitle: 'Permanently delete blueprint', replaceTitle: 'Replace saved blueprint', errorTitle: 'Blueprint Library error', nameMessage: 'Enter a name for this blueprint.', nameLabel: 'Blueprint name', saveConfirm: 'Save', renameConfirm: 'Rename', replaceConfirm: 'Replace contents', cancel: 'Cancel', dialogUnavailable: 'The World Editor dialog service is unavailable.', blueprint: 'Blueprint'
			}
			const zh = {
				library: '蓝图库', close: '关闭', save: '保存到蓝图库', refresh: '刷新', folder: '打开文件夹',
				active: '蓝图', problems: '问题', trash: '回收站', quarantine: '隔离区', list: '列表', grid: '网格', details: '显示详细数据',
				unavailable: '蓝图库不可用', empty: '这里没有蓝图。', select: '请选择蓝图以查看详细数据。',
				load: '加载', rename: '重命名', duplicate: '创建副本', trashAction: '移到回收站', retry: '重试', quarantineAction: '移到隔离区', restore: '恢复', remove: '永久删除',
				confirmTrash: '是否把此蓝图移到回收站？', confirmRemove: '是否永久删除此项目？此操作无法撤销。', confirmReplace: '是否替换已保存蓝图的内容？旧版本仍可在回收站恢复。',
				saveTitle: '保存蓝图', renameTitle: '重命名蓝图', trashTitle: '把蓝图移到回收站', removeTitle: '永久删除蓝图', replaceTitle: '替换已保存蓝图', errorTitle: '蓝图库错误', nameMessage: '请输入这份蓝图的名称。', nameLabel: '蓝图名称', saveConfirm: '保存', renameConfirm: '重命名', replaceConfirm: '替换内容', cancel: '取消', dialogUnavailable: '世界编辑器对话框服务不可用。', blueprint: '蓝图'
			}
			return (isChinese(source) ? zh : en)[key] || key
		}

		function libraryUiError(code, message) {
			const error = new Error(message)
			error.name = 'WorldEditorBlueprintLibraryUiError'
			error.code = code
			return error
		}

		function installStyle() {
			if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
			const style = document.createElement('style')
			style.id = STYLE_ID
			style.textContent = `
				/* Save Slots / Settings Page minimalist surface. */
				.cattail-world-editor-library-modal {
					--world-editor-library-bg: rgba(248, 248, 246, .97);
					--world-editor-library-text: rgba(18, 20, 22, .94);
					--world-editor-library-muted: rgba(18, 20, 22, .62);
					--world-editor-library-border: rgba(0, 0, 0, .14);
					--world-editor-library-control: rgba(18, 20, 22, .07);
					--world-editor-library-hover: rgba(18, 20, 22, .1);
					--world-editor-library-active: rgba(113, 79, 163, .16);
					--world-editor-library-active-border: rgba(113, 79, 163, .34);
					--world-editor-library-option-bg: rgb(248, 248, 246);
					--world-editor-library-scroll-track: rgba(18, 20, 22, .14);
					--world-editor-library-scroll-thumb: rgba(18, 20, 22, .58);
					position: fixed;
					inset: 0;
					z-index: 100040;
					display: grid;
					place-items: center;
					box-sizing: border-box;
					padding: 16px;
					color: var(--world-editor-library-text);
					font: 400 13px/1.45 Montserrat, Arial, sans-serif;
				}
				.cattail-world-editor-library-modal[data-theme="void"] {
					--world-editor-library-bg: rgba(8, 10, 12, .97);
					--world-editor-library-text: rgba(255, 255, 255, .94);
					--world-editor-library-muted: rgba(255, 255, 255, .66);
					--world-editor-library-border: rgba(255, 255, 255, .16);
					--world-editor-library-control: rgba(255, 255, 255, .08);
					--world-editor-library-hover: rgba(255, 255, 255, .12);
					--world-editor-library-active: rgba(210, 188, 250, .16);
					--world-editor-library-active-border: rgba(210, 188, 250, .34);
					--world-editor-library-option-bg: rgb(8, 10, 12);
					--world-editor-library-scroll-track: rgba(255, 255, 255, .16);
					--world-editor-library-scroll-thumb: rgba(255, 255, 255, .72);
				}
				.cattail-world-editor-library-modal__backdrop {
					content: "";
					position: absolute;
					inset: 0;
					background: rgba(8, 10, 12, .36);
					backdrop-filter: blur(10px);
					-webkit-backdrop-filter: blur(10px);
				}
				.cattail-world-editor-library-modal__panel {
					position: relative;
					display: grid;
					grid-template-rows: auto minmax(0, 1fr);
					width: 1280px;
					height: 792px;
					box-sizing: border-box;
					overflow: hidden;
					border: 1px solid var(--world-editor-library-border);
					border-radius: 10px;
					background: var(--world-editor-library-bg);
					box-shadow: 0 20px 70px rgba(0, 0, 0, .34);
					transform: scale(var(--world-editor-library-modal-scale, 1));
					transform-origin: center;
					will-change: transform;
				}
				.cattail-world-editor-library__collection::-webkit-scrollbar { width: 10px; }
				.cattail-world-editor-library__details::-webkit-scrollbar { width: 10px; }
				.cattail-world-editor-library__collection::-webkit-scrollbar-track,
				.cattail-world-editor-library__details::-webkit-scrollbar-track {
					background: transparent;
					transition: background .28s ease;
				}
				.cattail-world-editor-library__collection::-webkit-scrollbar-thumb,
				.cattail-world-editor-library__details::-webkit-scrollbar-thumb {
					border: 0;
					border-radius: 0;
					background: transparent;
					transition: background .28s ease;
				}
				.cattail-world-editor-library__collection:hover::-webkit-scrollbar-track,
				.cattail-world-editor-library__collection:active::-webkit-scrollbar-track,
				.cattail-world-editor-library__collection.cattail-world-editor-library__scrollbar-visible::-webkit-scrollbar-track,
				.cattail-world-editor-library__details:hover::-webkit-scrollbar-track,
				.cattail-world-editor-library__details:active::-webkit-scrollbar-track,
				.cattail-world-editor-library__details.cattail-world-editor-library__scrollbar-visible::-webkit-scrollbar-track {
					background: linear-gradient(to right, transparent 4px, rgba(255, 255, 255, .16) 4px, rgba(255, 255, 255, .16) 6px, transparent 6px);
				}
				.cattail-world-editor-library__collection:hover::-webkit-scrollbar-thumb,
				.cattail-world-editor-library__collection:active::-webkit-scrollbar-thumb,
				.cattail-world-editor-library__collection.cattail-world-editor-library__scrollbar-visible::-webkit-scrollbar-thumb,
				.cattail-world-editor-library__details:hover::-webkit-scrollbar-thumb,
				.cattail-world-editor-library__details:active::-webkit-scrollbar-thumb,
				.cattail-world-editor-library__details.cattail-world-editor-library__scrollbar-visible::-webkit-scrollbar-thumb {
					background: linear-gradient(to right, transparent 4px, rgba(255, 255, 255, .78) 4px, rgba(255, 255, 255, .78) 6px, transparent 6px);
				}
				.cattail-world-editor-library-modal__panel > header {
					display: flex;
					align-items: center;
					justify-content: space-between;
					padding: 14px 18px;
					border-bottom: 1px solid var(--world-editor-library-border);
				}
				.cattail-world-editor-library-modal__panel h2 {
					margin: 0;
					color: var(--world-editor-library-text);
					font: 600 20px/1.3 Montserrat, Arial, sans-serif;
				}
				.cattail-world-editor-library button,
				.cattail-world-editor-library select,
				.cattail-world-editor-library-modal__panel > header button {
					appearance: none;
					min-height: 30px;
					border: 0;
					border-radius: 0;
					padding: 5px 8px;
					background: transparent;
					box-shadow: none;
					color: #fff;
					font: 600 12px/1.35 Montserrat, Arial, sans-serif;
					cursor: pointer;
					transition: color .18s ease, background .18s ease, border-color .18s ease, opacity .18s ease;
				}
				.cattail-world-editor-library button:hover:not(:disabled),
				.cattail-world-editor-library select:hover:not(:disabled),
				.cattail-world-editor-library select:focus-visible,
				.cattail-world-editor-library-modal__panel > header button:hover:not(:disabled) {
					background: rgba(255, 255, 255, .08);
					color: #b56b87;
				}
				.cattail-world-editor-library select:focus {
					outline: 0 !important;
					box-shadow: none !important;
				}
				.cattail-world-editor-library button:disabled,
				.cattail-world-editor-library select:disabled,
				.cattail-world-editor-library-modal__panel > header button:disabled {
					cursor: default;
					opacity: .3;
				}
				.cattail-world-editor-library select option { background: #0a0a0a; color: #fff; }
				.cattail-world-editor-library {
					box-sizing: border-box;
					display: grid;
					grid-template-rows: auto auto auto minmax(0, 1fr);
					height: 100%;
					min-height: 0;
					overflow: hidden;
					padding: 14px;
					color: #fff;
					font: 400 13px/1.45 Montserrat, Arial, sans-serif;
				}
				[data-library-modal-body] {
					height: 100%;
					min-height: 0;
					overflow: hidden;
				}
				.cattail-world-editor-library[data-surface="modal"] {
					height: 100%;
					min-height: 0;
				}
				.cattail-world-editor-library__toolbar-rule {
					width: 100%;
					height: 1px;
					margin: 10px 0 8px;
					background: rgba(255, 255, 255, .72);
				}
				.cattail-world-editor-library__toolbar {
					position: relative;
					z-index: 20;
					display: flex;
					align-items: center;
					flex-wrap: wrap;
					gap: 0;
					overflow: visible;
				}
				.cattail-world-editor-library__status {
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 12px;
					margin: 0 0 8px;
					padding: 8px 10px;
					border: 1px solid rgba(255, 255, 255, .18);
					color: rgba(255, 255, 255, .9);
				}
				.cattail-world-editor-library__status[hidden] { display: none; }
				.cattail-world-editor-library__status[data-kind="error"] { border-color: #ff8f8f; color: #ffd0d0; }
				.cattail-world-editor-library__status-dismiss {
					min-width: 30px;
					height: 30px;
					border: 0;
					background: transparent;
					color: inherit;
					font-size: 22px;
				}
				.cattail-world-editor-library__toolbar button,
				.cattail-world-editor-library__toolbar select {
					min-height: 40px;
					border: 0 !important;
					border-radius: 0;
					padding: 8px 12px;
					background: transparent !important;
					box-shadow: none !important;
					font-size: 15px;
				}
				.cattail-world-editor-library__toolbar button:hover:not(:disabled),
				.cattail-world-editor-library__toolbar select:hover:not(:disabled) {
					background: transparent !important;
					color: #b56b87 !important;
				}
				.cattail-world-editor-library__toolbar button:focus-visible,
				.cattail-world-editor-library__toolbar select:focus-visible {
					outline: 0;
					border-color: transparent !important;
					background: transparent !important;
					box-shadow: none !important;
					color: #b56b87 !important;
					text-decoration: underline;
					text-decoration-thickness: 1px;
					text-underline-offset: 4px;
				}
				.cattail-world-editor-library__toolbar-group {
					display: inline-flex;
					align-items: center;
					gap: 0;
				}
				.cattail-world-editor-library__menu {
					position: relative;
					display: inline-flex;
					align-items: center;
					min-height: 40px;
					color: inherit;
				}
				.cattail-world-editor-library__menu-summary {
					position: relative;
					box-sizing: border-box;
					min-height: 40px;
					padding: 9px 31px 8px 12px;
					color: inherit;
					font: 600 15px/1.35 Montserrat, Arial, sans-serif;
					cursor: pointer;
					list-style: none;
					transition: color .18s ease;
				}
				.cattail-world-editor-library__menu-summary::-webkit-details-marker { display: none; }
				.cattail-world-editor-library__menu-summary::after {
					content: "";
					position: absolute;
					right: 12px;
					top: 50%;
					width: 7px;
					height: 7px;
					border-right: 2px solid currentColor;
					border-bottom: 2px solid currentColor;
					transform: translateY(-68%) rotate(45deg);
					transition: transform .18s ease;
				}
				.cattail-world-editor-library__menu[open] > .cattail-world-editor-library__menu-summary::after {
					transform: translateY(-30%) rotate(225deg);
				}
				.cattail-world-editor-library__menu-summary:hover,
				.cattail-world-editor-library__menu[open] > .cattail-world-editor-library__menu-summary,
				.cattail-world-editor-library__menu-summary:focus-visible {
					outline: 0;
					color: #b56b87;
				}
				.cattail-world-editor-library__menu-summary:focus-visible {
					text-decoration: underline;
					text-decoration-thickness: 1px;
					text-underline-offset: 4px;
				}
				.cattail-world-editor-library__menu-popup {
					position: absolute;
					z-index: 100;
					left: 4px;
					top: calc(100% + 4px);
					display: grid;
					box-sizing: border-box;
					width: max-content;
					min-width: max(100%, 180px);
					gap: 3px;
					padding: 6px;
					border: 1px solid var(--world-editor-library-border, rgba(255, 255, 255, .18));
					border-radius: 8px;
					background: var(--world-editor-library-bg, rgba(10, 12, 14, .96));
					box-shadow: 0 12px 34px rgba(0, 0, 0, .34);
					color: var(--world-editor-library-text, #fff);
					backdrop-filter: blur(10px) saturate(1.1);
				}
				.cattail-world-editor-library__menu:not([open]) > .cattail-world-editor-library__menu-popup {
					display: none;
				}
				.cattail-world-editor-library__menu[data-library-menu="view"] .cattail-world-editor-library__menu-popup {
					min-width: max(100%, 140px);
				}
				.cattail-world-editor-library__toolbar .cattail-world-editor-library__menu-option {
					position: relative;
					box-sizing: border-box;
					width: 100%;
					min-height: 34px;
					border: 0 !important;
					border-radius: 6px !important;
					padding: 7px 30px 7px 10px;
					background: transparent !important;
					box-shadow: none !important;
					color: var(--world-editor-library-text, #fff) !important;
					font: 500 14px/1.35 Montserrat, Arial, sans-serif;
					text-align: left;
					text-decoration: none !important;
				}
				.cattail-world-editor-library__toolbar .cattail-world-editor-library__menu-option:hover,
				.cattail-world-editor-library__toolbar .cattail-world-editor-library__menu-option:focus-visible {
					outline: 0;
					background: var(--world-editor-library-hover, rgba(255, 255, 255, .1)) !important;
					box-shadow: none !important;
					color: #b56b87 !important;
					text-decoration: none !important;
				}
				.cattail-world-editor-library__toolbar .cattail-world-editor-library__menu-option[data-selected="true"] {
					background: var(--world-editor-library-active, rgba(181, 107, 135, .18)) !important;
					box-shadow: inset 0 0 0 1px var(--world-editor-library-active-border, rgba(181, 107, 135, .42)) !important;
					font-weight: 650;
				}
				.cattail-world-editor-library__menu-option[data-selected="true"]::after {
					content: "✓";
					position: absolute;
					right: 10px;
					top: 50%;
					color: #b56b87;
					font-weight: 700;
					transform: translateY(-50%);
				}
				.cattail-world-editor-library__toolbar-group > button,
				.cattail-world-editor-library__toolbar-group > select {
					border: 0;
				}
				.cattail-world-editor-library__separator {
					display: block;
					flex: 0 0 1px;
					width: 1px;
					height: 18px;
					margin: 0 12px;
					background: rgba(255, 255, 255, .42);
					pointer-events: none;
				}
				.cattail-world-editor-library__toolbar > .cattail-world-editor-library__separator,
				.cattail-world-editor-library__toolbar-group > .cattail-world-editor-library__separator {
					height: 24px;
					margin: 0 15px;
				}
				.cattail-world-editor-library__check {
					display: flex;
					align-items: center;
					gap: 9px;
					box-sizing: border-box;
					min-height: 40px;
					padding: 8px 12px;
					font-size: 15px;
				}
				.cattail-world-editor-library__check input {
					width: 18px;
					height: 18px;
					accent-color: #fff;
				}
				.cattail-world-editor-library__empty,
				.cattail-world-editor-library__item-text small { color: rgba(255, 255, 255, .58); }
				.cattail-world-editor-library__layout {
					display: grid;
					grid-template-columns: minmax(0, 1fr) 1px 400px;
					gap: 18px;
					min-height: 0;
					overflow: hidden;
				}
				.cattail-world-editor-library__layout-rule {
					width: 1px;
					height: 100%;
					background: rgba(255, 255, 255, .42);
					pointer-events: none;
				}
				.cattail-world-editor-library__collection {
					display: grid;
					align-content: start;
					gap: 8px;
					min-height: 0;
					overflow-x: hidden;
					overflow-y: auto;
					overscroll-behavior: contain;
					scrollbar-width: thin;
					scrollbar-color: transparent transparent;
					transition: scrollbar-color .28s ease;
					outline: none;
				}
				.cattail-world-editor-library__collection:hover,
				.cattail-world-editor-library__collection:active,
				.cattail-world-editor-library__collection.cattail-world-editor-library__scrollbar-visible {
					scrollbar-color: #fffc #fff2;
				}
				.cattail-world-editor-library[data-view="grid"] .cattail-world-editor-library__collection {
					grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
					grid-auto-rows: max-content;
					align-items: start;
					gap: 12px;
				}
				.cattail-world-editor-library[data-view="list"] .cattail-world-editor-library__collection { gap: 4px; }
				.cattail-world-editor-library__item {
					position: relative;
					display: flex !important;
					align-items: center;
					gap: 10px;
					width: 100%;
					padding: 8px !important;
					border: 0 !important;
					background: transparent !important;
					color: #fff !important;
					font: 400 13px/1.4 Montserrat, Arial, sans-serif !important;
					text-align: left;
				}
				.cattail-world-editor-library[data-view="grid"] .cattail-world-editor-library__item {
					display: block !important;
					align-self: start;
					height: max-content;
					min-height: max-content;
				}
				.cattail-world-editor-library__item[data-selected="true"] {
					outline: 0;
					background: rgba(255, 255, 255, .08) !important;
				}
				.cattail-world-editor-library__item img {
					width: 88px;
					height: 50px;
					border: 0;
					background: transparent;
					object-fit: cover;
				}
				.cattail-world-editor-library[data-view="grid"] .cattail-world-editor-library__item img {
					width: 100%;
					height: auto;
					aspect-ratio: 16/9;
				}
				.cattail-world-editor-library__item-text {
					display: grid;
					gap: 3px;
					min-width: 0;
				}
				.cattail-world-editor-library__item-text strong,
				.cattail-world-editor-library__item-text small {
					overflow: hidden;
					text-overflow: ellipsis;
				}
				.cattail-world-editor-library__item-text strong {
					font-size: 13px;
					font-weight: 600;
				}
				.cattail-world-editor-library__item-text small { font-size: 11px; }
				.cattail-world-editor-library__empty {
					padding: 28px;
					font-size: 13px;
					text-align: center;
				}
				.cattail-world-editor-library__details {
					min-height: 0;
					max-height: 100%;
					overflow-x: hidden;
					overflow-y: auto;
					overscroll-behavior: contain;
					border: 0;
					border-radius: 0;
					padding: 16px;
					background: transparent;
					color: #fff;
					font-size: 14px;
					scrollbar-width: thin;
					scrollbar-color: transparent transparent;
					transition: scrollbar-color .28s ease;
					outline: none;
				}
				.cattail-world-editor-library__details:hover,
				.cattail-world-editor-library__details:active,
				.cattail-world-editor-library__details.cattail-world-editor-library__scrollbar-visible {
					scrollbar-color: #fffc #fff2;
				}
				.cattail-world-editor-library__details h3 { margin: 0 0 10px; font: 600 17px/1.35 Montserrat, Arial, sans-serif; }
				.cattail-world-editor-library__details p {
					font-size: 14px;
					line-height: 1.55;
					white-space: pre-line;
				}
				.cattail-world-editor-library__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 0; }
				.cattail-world-editor-library__actions > button {
					min-height: 36px;
					border: 0;
					padding: 7px 10px;
					font-size: 14px;
				}
				.cattail-world-editor-library__actions > .cattail-world-editor-library__separator {
					height: 20px;
					margin: 0 13px;
				}
				.cattail-world-editor-blueprint-library-button > span:first-child,
				.cattail-world-editor-blueprint-save-button > span:first-child { font-size: 20px; }
				.cattail-world-editor-blueprint-card__save-library {
					position: relative;
					min-height: 34px;
					border: 0;
					border-radius: 0;
					padding: 7px 10px;
					background: transparent;
					box-shadow: none;
					color: var(--blueprint-card-text, rgba(18, 20, 22, .94));
					font: 700 11px/1.25 Montserrat, Arial, sans-serif;
					cursor: pointer;
					transition: color .18s ease, background .18s ease, border-color .18s ease, opacity .18s ease;
				}
				.cattail-world-editor-blueprint-card__save-library::after {
					content: "";
					position: absolute;
					left: 10px;
					right: 10px;
					bottom: -3px;
					height: 1px;
					background: var(--blueprint-card-border, rgba(0, 0, 0, .14));
					pointer-events: none;
				}
				.cattail-world-editor-blueprint-card__save-library:hover:not(:disabled) {
					background: color-mix(in srgb, var(--blueprint-card-text, #121416) 8%, transparent);
					color: #b56b87;
				}
				.cattail-world-editor-blueprint-card__save-library:disabled { cursor: default; opacity: .3; }
				.cattail-world-editor-shell .cattail-world-editor-blueprint-library-button,
				.cattail-world-editor-shell .cattail-world-editor-blueprint-save-button {
					border: 0 !important;
					border-radius: 0 !important;
					background: transparent !important;
					box-shadow: none !important;
					color: var(--world-editor-shell-text, rgba(18, 20, 22, .94)) !important;
				}
				.cattail-world-editor-shell .cattail-world-editor-blueprint-library-button:hover:not(:disabled),
				.cattail-world-editor-shell .cattail-world-editor-blueprint-save-button:hover:not(:disabled) {
					background: var(--world-editor-shell-hover-bg, rgba(150, 154, 160, .18)) !important;
					color: var(--world-editor-shell-hover-color, #b56b87) !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-library-button,
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-save-button,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-library-button,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-save-button {
					background: transparent !important;
					box-shadow: none !important;
					color: var(--world-editor-shell-text, rgba(18, 20, 22, .94)) !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-library-button::after,
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-save-button::after {
					border-radius: 8px !important;
					background: transparent !important;
					box-shadow: none !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-library-button:hover:not(:disabled),
				.cattail-world-editor-shell[data-toolbar-style="compact"] .cattail-world-editor-blueprint-save-button:hover:not(:disabled) {
					border-radius: 5px !important;
					background: var(--world-editor-shell-hover-bg, rgba(150, 154, 160, .18)) !important;
					color: var(--world-editor-shell-hover-color, #b56b87) !important;
				}
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-library-button:hover:not(:disabled),
				.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-blueprint-save-button:hover:not(:disabled) {
					background: transparent !important;
					color: var(--world-editor-shell-hover-color, #b56b87) !important;
				}
				/* The in-world modal follows the World Editor reality / void visual language. */
				.cattail-world-editor-library-modal .cattail-world-editor-library[data-surface="modal"] {
					color: var(--world-editor-library-text);
				}
				.cattail-world-editor-library-modal .cattail-world-editor-library[data-surface="modal"] button,
				.cattail-world-editor-library-modal .cattail-world-editor-library[data-surface="modal"] select,
				.cattail-world-editor-library-modal__panel > header button {
					border: 1px solid var(--world-editor-library-border);
					border-radius: 6px;
					background: var(--world-editor-library-control);
					color: var(--world-editor-library-text);
				}
				.cattail-world-editor-library-modal .cattail-world-editor-library[data-surface="modal"] button:hover:not(:disabled),
				.cattail-world-editor-library-modal .cattail-world-editor-library[data-surface="modal"] select:hover:not(:disabled),
				.cattail-world-editor-library-modal .cattail-world-editor-library[data-surface="modal"] select:focus-visible,
				.cattail-world-editor-library-modal__panel > header button:hover:not(:disabled) {
					background: var(--world-editor-library-hover);
					color: var(--world-editor-library-text);
				}
				.cattail-world-editor-library-modal .cattail-world-editor-library[data-surface="modal"] button:focus-visible,
				.cattail-world-editor-library-modal .cattail-world-editor-library[data-surface="modal"] select:focus-visible,
				.cattail-world-editor-library-modal__panel > header button:focus-visible {
					outline: 0;
					border-color: var(--world-editor-library-active-border);
					box-shadow: 0 0 0 2px var(--world-editor-library-active);
				}
				.cattail-world-editor-library-modal__panel > header button[data-library-close] {
					display: grid;
					width: 44px;
					min-width: 44px;
					height: 44px;
					min-height: 44px;
					padding: 0;
					place-items: center;
					border: 0 !important;
					border-radius: 0 !important;
					background: transparent !important;
					box-shadow: none !important;
				}
				.cattail-world-editor-library-modal__close-mark {
					position: relative;
					display: block;
					width: 36px;
					height: 36px;
				}
				.cattail-world-editor-library-modal__close-mark::before,
				.cattail-world-editor-library-modal__close-mark::after {
					content: "";
					position: absolute;
					left: 1px;
					top: 17px;
					width: 34px;
					height: 3px;
					border-radius: 999px;
					background: var(--world-editor-library-text);
					transform-origin: center;
					transition: background .18s ease, opacity .18s ease;
				}
				.cattail-world-editor-library-modal__close-mark::before { transform: rotate(45deg); }
				.cattail-world-editor-library-modal__close-mark::after { transform: rotate(-45deg); }
				.cattail-world-editor-library-modal__panel > header button[data-library-close]:hover .cattail-world-editor-library-modal__close-mark::before,
				.cattail-world-editor-library-modal__panel > header button[data-library-close]:hover .cattail-world-editor-library-modal__close-mark::after,
				.cattail-world-editor-library-modal__panel > header button[data-library-close]:focus-visible .cattail-world-editor-library-modal__close-mark::before,
				.cattail-world-editor-library-modal__panel > header button[data-library-close]:focus-visible .cattail-world-editor-library-modal__close-mark::after {
					background: #b56b87;
				}
				.cattail-world-editor-library-modal .cattail-world-editor-library[data-surface="modal"] select option {
					background: var(--world-editor-library-option-bg);
					color: var(--world-editor-library-text);
				}
				.cattail-world-editor-library-modal .cattail-world-editor-library__toolbar-rule,
				.cattail-world-editor-library-modal .cattail-world-editor-library__layout-rule,
				.cattail-world-editor-library-modal .cattail-world-editor-library__separator {
					background: var(--world-editor-library-border);
				}
				.cattail-world-editor-library-modal .cattail-world-editor-library__check {
					color: var(--world-editor-library-text);
				}
				.cattail-world-editor-library-modal .cattail-world-editor-library__check input {
					accent-color: var(--world-editor-library-active-border);
				}
				.cattail-world-editor-library-modal .cattail-world-editor-library__empty,
				.cattail-world-editor-library-modal .cattail-world-editor-library__item-text small,
				.cattail-world-editor-library-modal .cattail-world-editor-library__details p {
					color: var(--world-editor-library-muted);
				}
				.cattail-world-editor-library-modal .cattail-world-editor-library__item {
					border-radius: 8px !important;
					color: var(--world-editor-library-text) !important;
				}
				.cattail-world-editor-library-modal .cattail-world-editor-library__item:hover:not(:disabled) {
					background: var(--world-editor-library-control) !important;
					color: var(--world-editor-library-text) !important;
				}
				.cattail-world-editor-library-modal .cattail-world-editor-library__item[data-selected="true"],
				.cattail-world-editor-library-modal .cattail-world-editor-library__item[data-selected="true"]:hover {
					background: var(--world-editor-library-active) !important;
					box-shadow: inset 0 0 0 1px var(--world-editor-library-active-border) !important;
				}
				.cattail-world-editor-library-modal .cattail-world-editor-library__item img {
					border-radius: 6px;
				}
				.cattail-world-editor-library-modal .cattail-world-editor-library__details {
					color: var(--world-editor-library-text);
				}
				.cattail-world-editor-library-modal .cattail-world-editor-library__collection:hover,
				.cattail-world-editor-library-modal .cattail-world-editor-library__collection:active,
				.cattail-world-editor-library-modal .cattail-world-editor-library__collection.cattail-world-editor-library__scrollbar-visible,
				.cattail-world-editor-library-modal .cattail-world-editor-library__details:hover,
				.cattail-world-editor-library-modal .cattail-world-editor-library__details:active,
				.cattail-world-editor-library-modal .cattail-world-editor-library__details.cattail-world-editor-library__scrollbar-visible {
					scrollbar-color: var(--world-editor-library-scroll-thumb) var(--world-editor-library-scroll-track);
				}
				.cattail-world-editor-library-modal .cattail-world-editor-library__collection:hover::-webkit-scrollbar-track,
				.cattail-world-editor-library-modal .cattail-world-editor-library__collection:active::-webkit-scrollbar-track,
				.cattail-world-editor-library-modal .cattail-world-editor-library__collection.cattail-world-editor-library__scrollbar-visible::-webkit-scrollbar-track,
				.cattail-world-editor-library-modal .cattail-world-editor-library__details:hover::-webkit-scrollbar-track,
				.cattail-world-editor-library-modal .cattail-world-editor-library__details:active::-webkit-scrollbar-track,
				.cattail-world-editor-library-modal .cattail-world-editor-library__details.cattail-world-editor-library__scrollbar-visible::-webkit-scrollbar-track {
					background: linear-gradient(to right, transparent 4px, var(--world-editor-library-scroll-track) 4px, var(--world-editor-library-scroll-track) 6px, transparent 6px);
				}
				.cattail-world-editor-library-modal .cattail-world-editor-library__collection:hover::-webkit-scrollbar-thumb,
				.cattail-world-editor-library-modal .cattail-world-editor-library__collection:active::-webkit-scrollbar-thumb,
				.cattail-world-editor-library-modal .cattail-world-editor-library__collection.cattail-world-editor-library__scrollbar-visible::-webkit-scrollbar-thumb,
				.cattail-world-editor-library-modal .cattail-world-editor-library__details:hover::-webkit-scrollbar-thumb,
				.cattail-world-editor-library-modal .cattail-world-editor-library__details:active::-webkit-scrollbar-thumb,
				.cattail-world-editor-library-modal .cattail-world-editor-library__details.cattail-world-editor-library__scrollbar-visible::-webkit-scrollbar-thumb {
					background: linear-gradient(to right, transparent 4px, var(--world-editor-library-scroll-thumb) 4px, var(--world-editor-library-scroll-thumb) 6px, transparent 6px);
				}
				.cattail-world-editor-dialog[data-kind^="blueprint-library-"] {
					z-index: 100050;
				}
				.cattail-world-editor-dialog[data-kind^="blueprint-library-"] .cattail-world-editor-library__separator { display: none; }
				.cattail-world-editor-library-import-summary {
					display: grid;
					gap: 7px;
					margin: 0 0 14px;
					padding: 12px;
					border: 1px solid var(--world-editor-dialog-border);
					border-radius: 7px;
					background: var(--world-editor-dialog-control);
				}
				.cattail-world-editor-library-import-summary h3 { margin: 0; font-size: 14px; }
				.cattail-world-editor-library-import-summary strong { overflow-wrap: anywhere; }
				.cattail-world-editor-library-import-summary dl {
					display: grid;
					grid-template-columns: max-content minmax(0, 1fr);
					gap: 4px 12px;
					margin: 0;
					font-size: 12px;
				}
				.cattail-world-editor-library-import-summary dt { color: var(--world-editor-dialog-muted); }
				.cattail-world-editor-library-import-summary dd { margin: 0; overflow-wrap: anywhere; }
				.cattail-world-editor-library-name-form { display: grid; gap: 8px; }
				.cattail-world-editor-library-name-form__field {
					display: grid;
					gap: 7px;
					color: var(--world-editor-dialog-muted);
					font-size: 13px;
					font-weight: 600;
				}
				.cattail-world-editor-library-name-form__field input {
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
				}
				.cattail-world-editor-library-name-form__field input:focus {
					border-color: var(--world-editor-dialog-accent);
					box-shadow: 0 0 0 2px color-mix(in srgb, var(--world-editor-dialog-accent) 24%, transparent);
				}
				@media (max-width: 760px) {
					.cattail-world-editor-library[data-surface="page"] {
						height: 100%;
						min-height: 0;
					}
					.cattail-world-editor-library[data-surface="page"] .cattail-world-editor-library__layout {
						grid-template-columns: minmax(0, 1fr);
						grid-template-rows: minmax(0, 1fr) 1px minmax(140px, 220px);
						gap: 12px 0;
					}
					.cattail-world-editor-library[data-surface="page"] .cattail-world-editor-library__layout-rule {
						width: 100%;
						height: 1px;
					}
				}
			`
			document.head.append(style)
		}
	}
})
