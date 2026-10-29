ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
		const PREVIEW_KEY = Symbol.for('cattail.world-editor.blueprint-preview')
		const BLUEPRINT_KEY = Symbol.for('cattail.world-editor.blueprint')
		const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
		const CATEGORY = Object.freeze({
			id: 'world-editing',
			label: function () { return text('shortcutCategoryWorldEditing', 'World Editing') },
			order: 20
		})
		const SHARED_COMBINATION_IDS = new Set(['cancel-layer', 'temporary-pin', 'card-opacity'])
		let currentGame = null
		let installTimer = null
		let installed = false

		api.on('afterGameInit', function (payload, game) {
			currentGame = game || null
			const shortcuts = api.ui?.shortcuts
			if (shortcuts?.version === 1 && typeof shortcuts.register === 'function') {
				installTimer = globalThis.setTimeout(function () {
					installTimer = null
					installShortcutHints(shortcuts)
				}, 0)
			}
			console.info('[Cattail World Editor] Foundation ready.')
		})

		function installShortcutHints(shortcuts) {
			if (installed) return
			installed = true
			const handles = []
			const unsubscribers = []
			const refresh = function () {
				try {
					shortcuts.refresh?.()
				} catch (error) {
					console.warn('[Cattail World Editor] Shortcut hint refresh failed.', error)
				}
			}
			const definitions = [
				shortcut('toggle-editor', ['V'], 'shortcutToggleEditor', 10, isEnabled),
				shortcut('cancel-layer', ['Esc'], 'shortcutCancelLayer', 20, isActive, editorContext),
				shortcut('add-selection', ['Ctrl', 'Mouse1'], 'shortcutAddSelection', 30, isActive, editorContext),
				shortcut('remove-primary-selection', ['Backspace'], 'shortcutRemovePrimarySelection', 40, hasSelection, selectionContext),
				shortcut('disassemble-selection', ['Delete'], 'shortcutDisassembleSelection', 50, hasSelection, selectionContext),
				shortcut('generate-blueprint', ['Ctrl', 'C'], 'shortcutGenerateBlueprint', 60, hasSelection, selectionContext),
				shortcut('cut-selection', ['Ctrl', 'X'], 'shortcutCutSelection', 70, hasSelection, selectionContext),
				shortcut('place-blueprint', ['Ctrl', 'V'], 'shortcutPlaceBlueprint', 80, hasPreview, previewContext),
				shortcut('rotate-clockwise', ['R'], 'shortcutRotateClockwise', 90, hasPreview, previewContext),
				shortcut('rotate-counterclockwise', ['Shift', 'R'], 'shortcutRotateCounterclockwise', 100, hasPreview, previewContext),
				shortcut('mirror-u', ['M'], 'shortcutMirrorU', 110, hasPreview, previewContext),
				shortcut('mirror-v', ['Shift', 'M'], 'shortcutMirrorV', 120, hasPreview, previewContext),
				shortcut('temporary-pin', ['Alt'], 'shortcutTemporaryPin', 130, hasPreview, previewContext),
				shortcut('undo', ['Ctrl', 'Z'], 'shortcutUndo', 140, canUndo, undoContext),
				shortcut('redo', [['Ctrl', 'Y'], ['Ctrl', 'Shift', 'Z']], 'shortcutRedo', 150, canRedo, redoContext),
				shortcut('card-opacity', [['Z', 'WheelUp'], ['Z', 'WheelDown']], 'shortcutCardOpacity', 160, hasEditableCard, cardContext)
			]
			try {
				for (const definition of definitions) handles.push(shortcuts.register(definition))
			} catch (error) {
				console.warn('[Cattail World Editor] Shortcut hint registration failed.', error)
				cleanupHandles(handles)
				installed = false
				return
			}
			for (const key of [RUNTIME_KEY, SELECTION_KEY, TRANSACTIONS_KEY, PREVIEW_KEY, BLUEPRINT_KEY]) {
				const service = globalThis[key]
				if (typeof service?.subscribe !== 'function') continue
				try {
					const unsubscribe = service.subscribe(refresh)
					if (typeof unsubscribe === 'function') unsubscribers.push(unsubscribe)
				} catch (error) {
					console.warn('[Cattail World Editor] Shortcut state subscription failed.', error)
				}
			}
			const cleanup = function () {
				if (installTimer !== null) {
					globalThis.clearTimeout?.(installTimer)
					installTimer = null
				}
				while (unsubscribers.length) {
					try {
						unsubscribers.pop()()
					} catch (error) {
						console.warn('[Cattail World Editor] Shortcut subscription cleanup failed.', error)
					}
				}
				cleanupHandles(handles)
				installed = false
			}
			const runtime = globalThis[RUNTIME_KEY]
			if (typeof runtime?.addCleanup === 'function') runtime.addCleanup(cleanup)
			refresh()
		}

		function shortcut(id, keys, descriptionKey, order, active, context) {
			return {
				id,
				keys,
				description: function () { return text(descriptionKey, id) },
				order,
				category: CATEGORY,
				allowSharedCombination: SHARED_COMBINATION_IDS.has(id),
				visible: isEnabled,
				active,
				context
			}
		}

		function cleanupHandles(handles) {
			while (handles.length) {
				const handle = handles.pop()
				try {
					if (typeof handle?.unregister === 'function') handle.unregister()
					else if (typeof handle?.dispose === 'function') handle.dispose()
					else if (typeof handle === 'function') handle()
				} catch (error) {
					console.warn('[Cattail World Editor] Shortcut hint cleanup failed.', error)
				}
			}
		}

		function serviceSnapshot(key) {
			const service = globalThis[key]
			try {
				return typeof service?.snapshot === 'function' ? service.snapshot() || {} : {}
			} catch (error) {
				return {}
			}
		}

		function isEnabled() {
			const runtime = globalThis[RUNTIME_KEY]
			try {
				return typeof runtime?.isEnabled === 'function' && runtime.isEnabled() === true
			} catch (error) {
				return false
			}
		}

		function isActive() {
			const runtime = globalThis[RUNTIME_KEY]
			try {
				return isEnabled() && typeof runtime?.isActive === 'function' && runtime.isActive() === true
			} catch (error) {
				return false
			}
		}

		function hasSelection() {
			return isActive() && Number(serviceSnapshot(SELECTION_KEY).selectionCount) > 0
		}

		function hasPreview() {
			return isActive() && serviceSnapshot(PREVIEW_KEY).active === true
		}

		function canUndo() {
			return isActive() && serviceSnapshot(TRANSACTIONS_KEY).canUndo === true
		}

		function canRedo() {
			return isActive() && serviceSnapshot(TRANSACTIONS_KEY).canRedo === true
		}

		function hasEditableCard() {
			return isActive() && (hasSelection() || hasPreview())
		}

		function editorContext() {
			return isActive() ? '' : text('shortcutContextOpenEditor', 'Open World Editor first')
		}

		function selectionContext() {
			return !isActive()
				? text('shortcutContextOpenEditor', 'Open World Editor first')
				: text('shortcutContextCreateSelection', 'Create a selection first')
		}

		function previewContext() {
			return !isActive()
				? text('shortcutContextOpenEditor', 'Open World Editor first')
				: text('shortcutContextOpenBlueprint', 'Open a blueprint preview first')
		}

		function undoContext() {
			return !isActive()
				? text('shortcutContextOpenEditor', 'Open World Editor first')
				: text('shortcutContextNothingToUndo', 'Nothing to undo')
		}

		function redoContext() {
			return !isActive()
				? text('shortcutContextOpenEditor', 'Open World Editor first')
				: text('shortcutContextNothingToRedo', 'Nothing to redo')
		}

		function cardContext() {
			return !isActive()
				? text('shortcutContextOpenEditor', 'Open World Editor first')
				: text('shortcutContextShowEditableCard', 'Show a selection or blueprint card first')
		}

		function text(key, fallback) {
			try {
				const i18n = globalThis[I18N_KEY]
				if (typeof i18n?.t === 'function') return i18n.t(currentGame, key)
			} catch (error) {}
			return fallback
		}
	}
})
