(function () {
	const id = 'Cattail_TweaksQuality_Tweaks'
	ModLoader.register({
		id,
		init(api) {
			// Capture the committed value once: unsaved slider previews cannot restart lessons.
			const enabled = Number(api.config.get('tutorialHints', 0)) === 1
			const initialized = new WeakSet()
			function prepare(explainer) {
				if (!explainer || initialized.has(explainer)) return
				initialized.add(explainer)
				const key = 'modloader:' + id + ':tutorialHintsActive:' + explainer.master.steamId
				const previouslyEnabled = localStorage.getItem(key) === '1'
				if (enabled && !previouslyEnabled) {
					explainer.next = 0
					explainer.state = 0
					explainer.timer = 0
					explainer.finished = false
					explainer.element.innerHTML = ''
					if (!explainer.element.isConnected) document.body.append(explainer.element)
					explainer.master.savePreferences()
				}
				localStorage.setItem(key, enabled ? '1' : '0')
				explainer.element.hidden = !enabled
				// Native .explainer uses display:flex, which can override the hidden attribute.
				if (!enabled) explainer.element.style.display = 'none'
			}
			api.on('afterVanillaScripts', function () {
				const Type = typeof DesktopExplainer !== 'undefined' ? DesktopExplainer :
					typeof Explainer !== 'undefined' ? Explainer : null
				if (!Type) return
				api.patch(Type.prototype, 'update', original => function (...args) {
					prepare(this)
					if (enabled) return original.apply(this, args)
				})
			})
			api.on('afterGameInit', function (payload, game) {
				if (!game?.isMobile) prepare(game?.explainer)
			})
		}
	})
})()
