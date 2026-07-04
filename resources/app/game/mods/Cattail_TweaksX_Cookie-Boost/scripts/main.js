ModLoader.register({
	id: 'Cattail_TweaksX_Cookie-Boost',
	init(api) {
		const saveKey = 'Cattail_TweaksX_Cookie-Boost'
		const claimedKey = '__cattailCookieBoostClaimed'
		const achievementPatchKey = '__cattailCookieBoostAchievementPatch'
		const grantAmount = 1e12
		const unlocks = ['chasm', 'pinhole']
		const satisfiedAchievements = {
			REDBLUEROCK: true,
			NEOPHOBIA: true
		}

		api.on('beforeSaveLoad', function (save, game) {
			game[claimedKey] = !!save?.modloader?.[saveKey]?.claimed
			return save
		})

		api.on('beforeSaveWrite', function (save, game) {
			save.modloader = save.modloader || {}
			save.modloader[saveKey] = {
				claimed: !!game?.[claimedKey]
			}
			return save
		})

		api.on('afterVanillaScripts', function () {
			if (typeof Cookie === 'undefined') return

			api.patch(Cookie.prototype, 'onmousedown', function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					grantCookieBoost(this)
					return result
				}
			})
		})

		api.on('afterData', function (data) {
			for (const achievement of data?.achievements || []) {
				if (!achievement?.steamid || !satisfiedAchievements[achievement.steamid]) continue
				if (achievement[achievementPatchKey] || typeof achievement.condition !== 'function') continue

				const originalCondition = achievement.condition
				achievement.condition = function (game) {
					return !!game?.[claimedKey] || originalCondition(game)
				}
				achievement[achievementPatchKey] = true
			}
			return data
		})

		function grantCookieBoost(cookie) {
			const game = cookie?.master
			if (!game || game[claimedKey]) return

			const grant = createGrant(game)
			if (grant.length) {
				game.addResourcesFromArray(grant)
				showGrantTransfer(cookie, grant)
			}

			game.unlockedEntities = game.unlockedEntities || {}
			for (const id of unlocks) {
				if (game.codex?.entities?.[id]) game.unlockedEntities[id] = true
			}

			game[claimedKey] = true
			game.shop?.check?.()
			game.shop?.updateElements?.()
			game.achiever?.update?.(0)
			game.saveGame?.()
		}

		function createGrant(game) {
			const length = Math.max(
				Array.isArray(game?.resources) ? game.resources.length : 0,
				Array.isArray(game?.codex?.resources) ? game.codex.resources.length : 0
			)
			return new Array(length).fill(grantAmount)
		}

		function showGrantTransfer(cookie, grant) {
			const game = cookie?.master
			if (!game || typeof game.createResourceTransfer !== 'function') return
			const source = typeof game.uvToXYUntranslated === 'function' ? game.uvToXYUntranslated(cookie.position) : undefined
			game.createResourceTransfer(grant, source, undefined, function () {}, undefined, true)
		}
	}
})
