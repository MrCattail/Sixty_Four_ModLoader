ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const TOOL_KEY = Symbol.for('cattail.world-editor.tool')
		const MODES = Object.freeze(['select'])

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const selection = globalThis[SELECTION_KEY]
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Tool state 2F could not find the editor runtime.')
				return
			}
			if (!selection || selection.game !== game || typeof selection.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Tool state 2F could not find the selection state.')
				return
			}

			const previous = globalThis[TOOL_KEY]
			if (previous && typeof previous.dispose === 'function') previous.dispose('tool-replaced')

			const tool = createToolState()
			Object.defineProperty(globalThis, TOOL_KEY, {
				value: tool,
				configurable: true,
				writable: true
			})

			const stopRuntimeSubscription = runtime.subscribe(function (state) {
				if (!state.active) tool.setMode('select', 'editor-inactive')
			})
			runtime.addCleanup(function () {
				if (typeof stopRuntimeSubscription === 'function') stopRuntimeSubscription()
				tool.dispose('runtime-disposed')
			})

			console.info('[Cattail World Editor] Tool state 2F ready.')
		})

		function createToolState() {
			let mode = 'select'
			let revision = 0
			let lastReason = 'initialized'
			let disposed = false
			const listeners = new Set()

			function snapshot() {
				return {
					version: '0.2.6',
					mode,
					revision,
					lastReason,
					disposed
				}
			}

			function notify() {
				const current = snapshot()
				for (const listener of Array.from(listeners)) {
					try {
						listener(current)
					} catch (error) {
						console.warn('[Cattail World Editor] Tool state listener failed.', error)
					}
				}
			}

			const tool = Object.freeze({
				version: '0.2.6',
				modes: MODES,
				snapshot,
				setMode(nextMode, reason) {
					if (disposed || !MODES.includes(nextMode) || nextMode === mode) return false
					mode = nextMode
					revision += 1
					lastReason = String(reason || 'mode-changed')
					notify()
					return true
				},
				subscribe(listener) {
					if (typeof listener !== 'function') throw new TypeError('World Editor tool listener must be a function.')
					if (disposed) return function () {}
					listeners.add(listener)
					try {
						listener(snapshot())
					} catch (error) {
						console.warn('[Cattail World Editor] Tool state listener failed.', error)
					}
					return function () {
						listeners.delete(listener)
					}
				},
				dispose() {
					if (disposed) return false
					disposed = true
					listeners.clear()
					if (globalThis[TOOL_KEY] === tool) delete globalThis[TOOL_KEY]
					return true
				}
			})

			return tool
		}
	}
})
