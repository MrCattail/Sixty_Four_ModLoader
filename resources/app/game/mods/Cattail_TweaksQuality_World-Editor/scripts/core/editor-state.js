ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const MOD_ID = api.id
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')

		api.on('afterGameInit', function (payload, game) {
			const previous = globalThis[RUNTIME_KEY]
			if (previous && typeof previous.dispose === 'function') previous.dispose('runtime-replaced')

			const runtime = createRuntime(game)
			Object.defineProperty(globalThis, RUNTIME_KEY, {
				value: runtime,
				configurable: true,
				writable: true
			})

			const handleConfigPreview = function (event) {
				const detail = event?.detail
				if (detail?.modId !== MOD_ID || detail?.key !== 'enabled') return
				if (detail.value === false) runtime.deactivate('config-disabled')
			}

			window.addEventListener('modloader:config-preview', handleConfigPreview)
			runtime.addCleanup(function () {
				window.removeEventListener('modloader:config-preview', handleConfigPreview)
			})

			console.info('[Cattail World Editor] State 1B ready.')
		})

		function createRuntime(game) {
			let active = false
			let disposed = false
			let revision = 0
			let lastReason = 'initialized'
			const listeners = new Set()
			const cleanups = []

			function isEnabled() {
				return api.config.get('enabled', true) !== false
			}

			function snapshot() {
				const enabled = isEnabled()
				return {
					version: '0.1.1',
					enabled,
					active: !disposed && enabled && active,
					revision,
					lastReason,
					disposed
				}
			}

			function notify() {
				const current = snapshot()
				console.info('[Cattail World Editor] ' + (current.active ? 'Active' : 'Inactive') + ' (' + current.lastReason + ').')
				for (const listener of Array.from(listeners)) {
					try {
						listener(current)
					} catch (error) {
						console.warn('[Cattail World Editor] State listener failed.', error)
					}
				}
			}

			function transition(next, reason) {
				if (disposed) return false
				next = !!next
				if (next && !isEnabled()) return false
				if (active === next) return false
				active = next
				revision += 1
				lastReason = String(reason || (next ? 'activate' : 'deactivate'))
				notify()
				return true
			}

			const runtime = Object.freeze({
				version: '0.1.1',
				game,
				isEnabled,
				isActive() {
					if (active && !isEnabled()) transition(false, 'config-disabled')
					return !disposed && isEnabled() && active
				},
				activate(reason) {
					return transition(true, reason || 'activate')
				},
				deactivate(reason) {
					return transition(false, reason || 'deactivate')
				},
				toggle(reason) {
					if (!isEnabled()) {
						transition(false, 'config-disabled')
						return false
					}
					return transition(!active, reason || 'toggle')
				},
				snapshot,
				subscribe(listener) {
					if (typeof listener !== 'function') throw new TypeError('World Editor state listener must be a function.')
					if (disposed) return function () {}
					listeners.add(listener)
					try {
						listener(snapshot())
					} catch (error) {
						console.warn('[Cattail World Editor] State listener failed.', error)
					}
					return function () {
						listeners.delete(listener)
					}
				},
				addCleanup(cleanup) {
					if (typeof cleanup !== 'function') throw new TypeError('World Editor cleanup must be a function.')
					if (disposed) {
						cleanup()
						return function () {}
					}
					cleanups.push(cleanup)
					return function () {
						const index = cleanups.indexOf(cleanup)
						if (index >= 0) cleanups.splice(index, 1)
					}
				},
				dispose(reason) {
					if (disposed) return false
					transition(false, reason || 'disposed')
					disposed = true
					while (cleanups.length) {
						try {
							cleanups.pop()()
						} catch (error) {
							console.warn('[Cattail World Editor] Cleanup failed.', error)
						}
					}
					listeners.clear()
					if (globalThis[RUNTIME_KEY] === runtime) delete globalThis[RUNTIME_KEY]
					return true
				}
			})

			return runtime
		}
	}
})
