ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const PAINT_STATE_KEY = Symbol.for('cattail.world-editor.paint-cube-state')
		const GROWTH_KEY = Symbol.for('cattail.world-editor.paint-cube-growth')
		const PAINT_UI_KEY = Symbol.for('cattail.world-editor.paint-cube-ui')
		const SUBTOOLS = Object.freeze(['brush', 'bucket', 'eraser'])
		const CUBE_MODES = Object.freeze(['stable', 'grow'])
		const CONFIG_KEY = 'paintCubeRecipeV1'
		const GROW_DURATION_CONFIG_KEY = 'growDurationSeconds'
		const CONFIG_VERSION = 1
		const SERVICE_VERSION = '0.6.0'

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const paintState = globalThis[PAINT_STATE_KEY]
			const growth = globalThis[GROWTH_KEY]
			const previous = globalThis[PAINT_UI_KEY]
			previous?.dispose?.('paint-cube-ui-replaced')
			if (
				!runtime ||
				runtime.game !== game ||
				typeof runtime.addCleanup !== 'function' ||
				!paintState ||
				typeof paintState.defaultRecipe !== 'function' ||
				typeof paintState.normalizeRecipe !== 'function' ||
				typeof paintState.validateRecipe !== 'function' ||
				typeof paintState.normalizeGrowDurationMs !== 'function' ||
				!Number.isInteger(paintState.defaultGrowDurationMs)
			) {
				console.warn('[Cattail World Editor] Paint palette state could not find its core services.')
				return
			}

			const listeners = new Set()
			let subtool = 'brush'
			let cubeMode = 'stable'
			let recipe = readStoredRecipe()
			let paletteOpen = false
			let revision = 0
			let disposed = false
			let lastReason = 'initial-brush'

			function snapshot() {
				const growAvailable = growth?.ready === true || growth?.isReady?.() === true
				return {
					version: SERVICE_VERSION,
					ready: true,
					subtool,
					cubeMode,
					growAvailable,
					growDurationMs: readGrowDurationMs(),
					recipe: clonePlain(recipe),
					paletteOpen,
					revision,
					lastReason,
					disposed
				}
			}

			function notify() {
				const state = snapshot()
				for (const listener of Array.from(listeners)) {
					try {
						listener(state)
					} catch (error) {
						console.warn('[Cattail World Editor] Paint palette listener failed.', error)
					}
				}
			}

			const service = Object.freeze({
				version: SERVICE_VERSION,
				game,
				subtools: SUBTOOLS,
				cubeModes: CUBE_MODES,
				configKey: CONFIG_KEY,
				growDurationConfigKey: GROW_DURATION_CONFIG_KEY,
				snapshot,
				setSubtool(value, reason) {
					const next = SUBTOOLS.includes(value) ? value : null
					if (disposed || !next || next === subtool) return false
					subtool = next
					revision += 1
					lastReason = String(reason || 'subtool-changed')
					notify()
					return true
				},
				setCubeMode(value, reason) {
					if (disposed) return false
					const next = CUBE_MODES.includes(value) ? value : 'stable'
					const growAvailable = growth?.ready === true || growth?.isReady?.() === true
					if (next === 'grow' && !growAvailable) return false
					if (next === cubeMode) return false
					cubeMode = next
					revision += 1
					lastReason = String(reason || 'cube-mode-' + next)
					notify()
					return true
				},
				growDurationMs() {
					return readGrowDurationMs()
				},
				setRecipe(value, reason) {
					if (disposed) return false
					const next = paintState.normalizeRecipe(value)
					if (!next) return false
					try {
						api.config.set(CONFIG_KEY, { version: CONFIG_VERSION, recipe: clonePlain(next) })
					} catch (error) {
						console.warn('[Cattail World Editor] Paint palette recipe could not be saved.', error)
						return false
					}
					recipe = next
					revision += 1
					lastReason = String(reason || 'recipe-applied')
					notify()
					return true
				},
				setPaletteOpen(value, reason) {
					const next = value === true
					if (disposed || next === paletteOpen) return false
					paletteOpen = next
					revision += 1
					lastReason = String(reason || (next ? 'palette-opened' : 'palette-closed'))
					notify()
					return true
				},
				subscribe(listener) {
					if (typeof listener !== 'function') throw new TypeError('Paint palette listener must be a function.')
					if (disposed) return function () {}
					listeners.add(listener)
					listener(snapshot())
					return function () {
						listeners.delete(listener)
					}
				},
				dispose(reason) {
					if (disposed) return false
					disposed = true
					paletteOpen = false
					cubeMode = 'stable'
					lastReason = String(reason || 'disposed')
					listeners.clear()
					if (globalThis[PAINT_UI_KEY] === service) delete globalThis[PAINT_UI_KEY]
					return true
				}
			})

			Object.defineProperty(globalThis, PAINT_UI_KEY, {
				value: service,
				configurable: true,
				writable: true
			})
			runtime.addCleanup(function () {
				service.dispose('runtime-disposed')
			})
			console.info('[Cattail World Editor] Persistent paint palette state 5C-5 ready.')

			function readStoredRecipe() {
				try {
					const stored = api.config.get(CONFIG_KEY, null)
					if (stored?.version === CONFIG_VERSION) {
						const validated = paintState.validateRecipe(stored.recipe)
						if (validated) return validated
					}
				} catch (error) {
					console.warn('[Cattail World Editor] Paint palette recipe could not be read.', error)
				}
				return paintState.defaultRecipe()
			}

			function readGrowDurationMs() {
				try {
					const seconds = Number(api.config.get(GROW_DURATION_CONFIG_KEY, paintState.defaultGrowDurationMs / 1000))
					const durationMs = paintState.normalizeGrowDurationMs(Math.round(seconds * 1000))
					if (durationMs) return durationMs
				} catch (error) {}
				return paintState.defaultGrowDurationMs
			}
		})

		function clonePlain(value) {
			return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
		}
	}
})
