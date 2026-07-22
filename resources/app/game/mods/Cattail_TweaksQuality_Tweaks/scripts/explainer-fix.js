(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const configKey = 'enableExplainerFix'
	const legacyConfigKey = 'enableExplainerLanguageFix'
	const installedKey = '__cattailExplainerFixInstalled'
	const styleId = 'cattail-explainer-fix-style'
	const voidClass = 'cattail-explainer-void'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			migrateLegacyExplainerConfig(api)
			api.on('afterVanillaScripts', function () {
				installExplainerFix(api)
			})
		}
	})

	function installExplainerFix(api) {
		if (window[installedKey] || typeof Game === 'undefined' || typeof Explainer === 'undefined') return
		window[installedKey] = true
		ensureExplainerFixStyle()

		Explainer.prototype.refreshLanguage = function () {
			if (!isExplainerFixEnabled(api) || !this.state || this.finished || !this.stuff?.[this.next]) return
			this.element.innerHTML = this.master.pronounce('explainer', this.next)
			updateExplainerTheme(this, api)
		}

		api.patch(Explainer.prototype, 'update', function (original) {
			return function (...args) {
				const result = original.apply(this, args)
				updateExplainerTheme(this, api)
				return result
			}
		})

		api.patch(Game.prototype, 'changeLanguage', function (original) {
			return function (...args) {
				const result = original.apply(this, args)
				this.explainer?.refreshLanguage?.()
				return result
			}
		})

		api.patch(Game.prototype, 'switchPlane', function (original) {
			return function (...args) {
				const result = original.apply(this, args)
				updateExplainerTheme(this.explainer, api)
				return result
			}
		})
	}

	function updateExplainerTheme(explainer, api) {
		const element = explainer?.element
		if (!element?.classList) return
		const enabled = isExplainerFixEnabled(api)
		const darkPlane = enabled && explainer.master?.plane === 1
		element.classList.toggle(voidClass, darkPlane)
	}

	function ensureExplainerFixStyle() {
		if (document.getElementById(styleId)) return
		const style = document.createElement('style')
		style.id = styleId
		style.textContent = `
			.explainer.${voidClass} {
				color: rgba(255, 255, 255, .94);
				text-shadow: 0 0 4px rgba(0, 0, 0, .72), 0 1px 2px rgba(0, 0, 0, .78);
			}
			.explainer.${voidClass} .keyboard {
				border-color: rgba(255, 255, 255, .82);
				background: rgba(0, 0, 0, .16);
			}
		`
		document.head.appendChild(style)
	}

	function isExplainerFixEnabled(api) {
		return api.config.get(configKey, true) !== false
	}

	function migrateLegacyExplainerConfig(api) {
		try {
			const ownKey = configStorageKey(api.id, configKey)
			if (localStorage.getItem(ownKey) !== null) return
			const legacyRaw = localStorage.getItem(configStorageKey(api.id, legacyConfigKey))
			if (legacyRaw !== null) localStorage.setItem(ownKey, legacyRaw)
		} catch (error) {}
	}

	function configStorageKey(modId, key) {
		return 'modloader:' + modId + ':config:' + key
	}
})()