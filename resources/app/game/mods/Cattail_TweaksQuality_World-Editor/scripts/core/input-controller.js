ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const INTERACTION_KEY = Symbol.for('cattail.world-editor.selection-interaction')
		const SHARED_KEY = Symbol.for('cattail.world-editor.shared')

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const selection = globalThis[SELECTION_KEY]
			const shared = globalThis[SHARED_KEY]
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Input 1B could not find the editor runtime.')
				return
			}
			if (!shared || typeof shared.isEditableEvent !== 'function' || typeof shared.isModLoaderPanelBlocking !== 'function') {
				console.warn('[Cattail World Editor] Input 2G could not find shared guards.')
				return
			}

			const handleKeydown = function (event) {
				const key = String(event.key || '').toLowerCase()

				if ((event.ctrlKey || event.metaKey) && key === 'm') {
					runtime.deactivate('modloader-panel-opened')
					return
				}

				if (event.isComposing || event.keyCode === 229 || shared.isEditableEvent(event)) return
				if (shared.isWorldEditorInputBlocked?.()) return

				if (game.splash?.isShown) {
					runtime.deactivate('splash-visible')
					return
				}

				if (shared.isModLoaderPanelBlocking()) {
					runtime.deactivate('modloader-panel-visible')
					return
				}

				if (isPlainV(event, key)) {
					if (!runtime.isEnabled()) {
						runtime.deactivate('config-disabled')
						return
					}
					consume(event)
					if (!event.repeat) runtime.toggle('hotkey-v')
					return
				}

				if (isBackspace(event, key) && runtime.isActive()) {
					if (selection && typeof selection.hasPreview === 'function' && selection.hasPreview()) {
						consume(event)
						return
					}
					if (event.repeat) {
						consume(event)
						return
					}
					const interaction = globalThis[INTERACTION_KEY]
					if (interaction && typeof interaction.cancelPending === 'function') {
						interaction.cancelPending('hotkey-backspace')
					}
					if (selection && typeof selection.removePrimary === 'function' && selection.removePrimary('hotkey-backspace')) {
						consume(event)
						return
					}
				}

				if (isEscape(event, key) && runtime.isActive()) {
					consume(event)
					const interaction = globalThis[INTERACTION_KEY]
					if (interaction && typeof interaction.cancelPending === 'function' && interaction.cancelPending('hotkey-escape')) {
						return
					}
					if (selection && typeof selection.hasPreview === 'function' && selection.hasPreview()) {
						selection.cancelPreview('hotkey-escape')
						return
					}
					const selectionCount = Number(selection?.snapshot?.().selectionCount) || 0
					if (selectionCount > 0 && typeof selection?.clear === 'function' && selection.clear('hotkey-escape')) {
						return
					}
					runtime.deactivate('hotkey-escape')
				}
			}

			window.addEventListener('keydown', handleKeydown, true)
			runtime.addCleanup(function () {
				window.removeEventListener('keydown', handleKeydown, true)
			})

			console.info('[Cattail World Editor] Input 2G ready.')
		})

		function isPlainV(event, key) {
			const isV = event.code === 'KeyV' || key === 'v'
			return isV && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey
		}

		function isEscape(event, key) {
			return key === 'escape' || event.keyCode === 27
		}

		function isBackspace(event, key) {
			return key === 'backspace' || event.keyCode === 8
		}

		function consume(event) {
			event.preventDefault()
			event.stopImmediatePropagation()
		}
	}
})
