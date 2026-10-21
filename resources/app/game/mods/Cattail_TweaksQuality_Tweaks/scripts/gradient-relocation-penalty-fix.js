(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const configKey = 'enableGradientRelocationPenaltyFix'
	const punctureKey = 'enableGradientPunctureRelocationFix'
	const installedKey = '__cattailGradientRelocationPenaltyFixInstalled'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				if (window[installedKey] || typeof Game === 'undefined') return
				window[installedKey] = true
				api.patch(Game.prototype, 'massRelocate', function (original) {
					return function (entities, positions) {
						if (api.config.get(configKey, true) === false) return original.apply(this, arguments)
						const saved = capturePenalties(this, entities, positions, api)
						const result = original.apply(this, arguments)
						const world = new Set(this.stuff)
						for (const item of saved) {
							// Native returns undefined on success AND refusal; check identity and destination.
							if (!world.has(item.entity) || this.entityAtCoordinates(item.destination) !== item.entity || !samePosition(item.entity.position, item.destination)) continue
							if (item.entity.penalty === item.penalty) continue
							item.entity.penalty = item.penalty
							item.entity.init()
						}
						return result
					}
				})
			})
		}
	})
	function samePosition(a, b) { return a[0] === b[0] && a[1] === b[1] }
	function capturePenalties(game, entities, positions, api) {
		if (!Array.isArray(entities) || !Array.isArray(positions) || entities.length !== positions.length) return []
		const moving = new Set(entities), captured = new Set(), saved = []
		const add = (entity, destination, upgrade) => {
			if (entity?.name === 'gradient' && Array.isArray(destination) && !captured.has(entity)) {
				captured.add(entity)
				saved.push({ entity, destination: destination.slice(), penalty: upgrade ? 1 : entity.penalty })
			}
		}
		for (let i = 0; i < entities.length; i++) {
			if (!entities[i] || !Array.isArray(positions[i])) continue
			const target = game.entityAtCoordinates(positions[i])
			add(entities[i], positions[i], api.config.get(punctureKey, true) !== false && target?.name === 'puncture')
			if (target && !moving.has(target) && game.canRelocate(target)) add(target, entities[i].position, false)
		}
		return saved
	}
})()
