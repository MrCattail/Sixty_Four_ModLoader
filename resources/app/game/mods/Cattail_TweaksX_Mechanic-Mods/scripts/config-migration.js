(function () {
	const MOD_ID = 'Cattail_TweaksX_Reality-Pack'
	const MIGRATIONS = [
		{ key: 'surgeCount', oldModId: 'Cattail_TweaksX_Scan-Reality-Surges' },
		{ key: 'surgeRadius', oldModId: 'Cattail_TweaksX_Scan-Reality-Surges' },
		{ key: 'fillAmount', oldModId: 'Cattail_TweaksX_Super-Silo' }
	]

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			for (const item of MIGRATIONS) migrateConfigValue(api, item.key, item.oldModId)
		}
	})

	function migrateConfigValue(api, key, oldModId) {
		if (typeof localStorage === 'undefined') return
		const newKey = storageKey(MOD_ID, key)
		if (localStorage.getItem(newKey) !== null) return

		const oldValue = localStorage.getItem(storageKey(oldModId, key))
		if (oldValue === null) return
		try {
			api.config.set(key, JSON.parse(oldValue))
		} catch (error) {
			api.config.set(key, oldValue)
		}
	}

	function storageKey(modId, key) {
		return 'modloader:' + modId + ':config:' + key
	}
})()
