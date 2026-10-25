(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const configKey = 'enableEscapeActionFix'
	const installedKey = '__cattailEscapeActionFixInstalled'
	const editable = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			let activeGame = null
			let preview
			let handledPress = false
			const enabled = () => preview === undefined ? api.config.get(configKey, true) !== false : preview
			const isEscape = event => event.code === 'Escape' || event.key === 'Escape'
			const consume = event => { event.preventDefault(); event.stopImmediatePropagation() }
			const visible = element => element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
			function blocked(event, game) {
				const nativeClone = game.interactionMode === 'clone' && typeof game.cleanupInteractionMode === 'function'
				if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.metaKey) return true
				// Ctrl switches native relocation to cloning in 1.3.0.1. Keep the
				// same press consumed after cancellation while Ctrl is still down.
				if (event.ctrlKey && !nativeClone && !handledPress) return true
				const nodes = [...(event.composedPath?.() || [event.target]), document.activeElement]
				if (nodes.some(node => node?.closest?.(editable))) return true
				if (game.splash?.isShown || game.orbifoldUI) return true
				if (visible(document.querySelector('#modloader-panel:not(.modloader-panel-autohidden)'))) return true
				if ([...document.querySelectorAll('[role="dialog"][aria-modal="true"], dialog[open]')].some(visible)) return true
				const runtime = window[Symbol.for('cattail.world-editor.runtime')]
				const shared = window[Symbol.for('cattail.world-editor.shared')]
				return runtime?.game === game && (runtime.isActive?.() || shared?.isWorldEditorInputBlocked?.())
			}
			function keydown(event) {
				const game = activeGame
				if (!isEscape(event) || !supported(game) || !enabled() || blocked(event, game)) return
				// Capture-phase UI/editor owners have already had their turn. This
				// listener is installed before the native window bubble listener.
				if (handledPress) { consume(event); return }
				const building = (game.interactionMode === 'build' && !!game.itemInHand && !game.itemInHand.eraser) || orphanedBuildingPreview(game)
				if (game.itemInHand && !building) return // Other held objects stay native.
				const unifiedCleanup = typeof game.cleanupInteractionMode === 'function'
				const tool = building || game.interactionMode === 'erase' || game.interactionMode === 'relocate' || (unifiedCleanup && game.interactionMode === 'clone')
				const cards = game.store?.isOpen === true && typeof game.store.closeTypes === 'function'
				if (!tool && !cards) return
				if (tool && !unifiedCleanup && (typeof game.cleanupErase !== 'function' || typeof game.cleanupRelocation !== 'function')) return
				consume(event)
				// A held key, including a repeat that began in another UI, must
				// not advance to a second layer. Keyup/blur permits a new press.
				if (event.repeat) return
				handledPress = true
				game.gamepadControl = false
				game.thereWasZoomAction = true
				if (tool) {
					// Both builds still report version 1.3; select the native cleanup
					// by capability so the unified selection state is cleared too.
					if (unifiedCleanup) game.cleanupInteractionMode()
					else {
						delete game.interactionMode
						if (building) delete game.itemInHand
						game.cleanupErase()
						game.cleanupRelocation()
					}
					delete game.transportedEntity
					game.canPlace = false
					game.store?.visibilityUpdate?.()
				} else {
					game.store.closeTypes()
				}
			}
			api.on('afterVanillaScripts', function (_payload, game) {
				activeGame = game
				if (!supported(game) || window[installedKey]) return
				window[installedKey] = true
				window.addEventListener('keydown', keydown)
				window.addEventListener('keyup', event => { if (isEscape(event)) handledPress = false }, true)
				window.addEventListener('blur', () => { handledPress = false })
				window.addEventListener('modloader:config-preview', function (event) {
					const detail = event?.detail
					if (detail?.modId !== MOD_ID || detail.key !== configKey) return
					preview = detail.value !== false
					handledPress = false
				})
			})
			api.on('afterGameInit', function (_payload, game) { activeGame = game })
		}
	})
	function orphanedBuildingPreview(game) {
		// Native category clicks delete the mode without clearing the preview.
		// Recognize only a detached purchase instance owned by this game.
		const item = game.itemInHand
		if (game.interactionMode != null || !item || item.eraser || game.transportedEntity || item.master !== game) return false
		const definition = game.codex?.entities?.[item.name]
		return definition?.canPurchase === true && typeof definition.class === 'function' && !!definition.class.prototype &&
			item instanceof definition.class && Array.isArray(game.stuff) && !game.stuff.includes(item)
	}
	function supported(game) { return game?.version === '1.3' && !game.isMobile }
})()
