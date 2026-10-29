(function () {
	const MOD_ID = 'Cattail_TweaksX_Reality-Pack'
	const localized = (en, sch, tch) => ({ en, sch, modsch: sch, tch })
	const text = {
		label: localized('Unlock ? building now', '立即解锁 ? 建筑', '立即解鎖 ? 建築'),
		description: localized(
			'Unlocks ? in the current save\'s shop. Normal costs and upgrade requirements still apply. Kept by normal game saving; does not buy or build it.',
			'立即解锁当前存档商店中的 ? 建筑。仍需满足正常耗材和升级条件，随游戏正常保存保留；不会自动购买或建造。',
			'立即解鎖目前存檔商店中的 ? 建築。仍需滿足正常耗材和升級條件，隨遊戲正常儲存保留；不會自動購買或建造。'),
		section: localized('Shop unlock', '商店解锁', '商店解鎖'),
		pending: localized('Unlocking…', '正在解锁…', '正在解鎖…'),
		success: localized('? is unlocked in this save. Normal game saving keeps it.', '当前存档已解锁 ?，随游戏正常保存保留。', '目前存檔已解鎖 ?，隨遊戲正常儲存保留。'),
		already: localized('? is already unlocked in this save.', '当前存档已解锁 ?。', '目前存檔已解鎖 ?。'),
		notReady: localized('Enter a loaded game before unlocking ?.', '请进入游戏并等待存档加载完成后再解锁。', '請進入遊戲並等待存檔載入完成後再解鎖。'),
		cannotSave: localized('Saving is currently unavailable. Unlock ? after normal saving is available again.', '当前游戏无法保存，请在恢复正常保存后再解锁。', '目前遊戲無法儲存，請在恢復正常儲存後再解鎖。'),
		refreshFailed: localized('The shop could not refresh. Please try again.', '商店刷新失败，请重试。', '商店重新整理失敗，請重試。')
	}
	const getText = (value, game) => value[game?.language] || value.en

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			const settings = api.ui?.settings
			if (!settings?.types?.includes('action') || typeof settings.register !== 'function') return
			let readyGame = null
			api.on('afterGameInit', function (_, game) { readyGame = game })
			settings.register([{
				key: 'unlockPinhole',
				type: 'action',
				section: 'shopUnlock',
				sectionLabel: text.section,
				label: text.label,
				description: text.description,
				buttonLabel: text.label,
				pendingText: text.pending,
				errorText: '{value}',
				onAction() {
					// Resolve the active world on every click, never retain a save's unlock table.
					const game = api.state?.game
					if (!game || game !== readyGame || game.version !== '1.3' || game.isMobile ||
						!game.codex?.entities?.pinhole?.canPurchase ||
						!game.unlockedEntities || typeof game.unlockedEntities !== 'object' ||
						Array.isArray(game.unlockedEntities) || typeof game.store?.visibilityUpdate !== 'function') {
						throw new Error(getText(text.notReady, game))
					}
					if (game.preventSaving) throw new Error(getText(text.cannotSave, game))
					const unlocks = game.unlockedEntities
					const hadKey = Object.prototype.hasOwnProperty.call(unlocks, 'pinhole')
					const previous = unlocks.pinhole
					if (!previous) unlocks.pinhole = true
					try {
						game.store.visibilityUpdate()
					} catch (error) {
						if (hadKey) unlocks.pinhole = previous
						else delete unlocks.pinhole
						throw new Error(getText(text.refreshFailed, game))
					}
					return getText(previous ? text.already : text.success, game)
				}
			}])
		}
	})
})()
