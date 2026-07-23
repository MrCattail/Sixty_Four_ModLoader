ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const INTERACTION_KEY = Symbol.for('cattail.world-editor.selection-interaction')
		const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const selection = globalThis[SELECTION_KEY]
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Input 1B could not find the editor runtime.')
				return
			}

			const handleKeydown = function (event) {
				const key = String(event.key || '').toLowerCase()

				if ((event.ctrlKey || event.metaKey) && key === 'm') {
					runtime.deactivate('modloader-panel-opened')
					return
				}

				if (event.isComposing || event.keyCode === 229 || isEditableEvent(event)) return

				if (game.splash?.isShown) {
					runtime.deactivate('splash-visible')
					return
				}

				if (isModLoaderPanelBlocking()) {
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
					runtime.deactivate('hotkey-escape')
				}
			}

			window.addEventListener('keydown', handleKeydown, true)
			runtime.addCleanup(function () {
				window.removeEventListener('keydown', handleKeydown, true)
			})

			console.info('[Cattail World Editor] Input 2A ready.')
		})

		function isEditableEvent(event) {
			const nodes = typeof event.composedPath === 'function' ? event.composedPath() : [event.target]
			if (typeof document !== 'undefined') nodes.push(document.activeElement)
			return nodes.some(function (node) {
				return !!(node && node.nodeType === 1 && typeof node.closest === 'function' && node.closest(EDITABLE_SELECTOR))
			})
		}

		function isModLoaderPanelBlocking() {
			const panel = document.getElementById('modloader-panel')
			return !!(panel && !panel.classList.contains('modloader-panel-autohidden'))
		}

		function isPlainV(event, key) {
			const isV = event.code === 'KeyV' || key === 'v'
			return isV && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey
		}

		function isEscape(event, key) {
			return key === 'escape' || event.keyCode === 27
		}

		function consume(event) {
			event.preventDefault()
			event.stopImmediatePropagation()
		}
	}
})
