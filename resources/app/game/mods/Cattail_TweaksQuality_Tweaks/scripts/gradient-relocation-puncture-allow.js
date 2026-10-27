(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const configKey = 'enableGradientRelocationPunctureAllow'
	const penaltyKey = 'enableGradientRelocationNoPenalty'
	const installedKey = '__cattailTweaksGradientRelocationPunctureAllowInstalled'
	const activeKey = '__cattailTweaksGradientRelocationPunctureAllowActive'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				if (window[installedKey] || typeof Game === 'undefined') return
				window[installedKey] = true
				api.patch(Game.prototype, 'processMove', function (original) {
					return function () {
						const result = original.apply(this, arguments)
						if (!isEnabled(api) || this.interactionMode !== 'relocate') return result
						const entities = this.relocationList
						if (!Array.isArray(entities) || !Array.isArray(this.relocationOffsets) || !isPosition(this.hoveredCell)) return result
						const positions = this.relocationOffsets.map(offset => isPosition(offset) ? [this.hoveredCell[0] + offset[0], this.hoveredCell[1] + offset[1]] : null)
						if (hasUpgradeTarget(this, entities, positions)) this.canPlace = !!planRelocation(this, entities, positions)
						return result
					}
				})
				api.patch(Game.prototype, 'massRelocate', function (original) {
					return function (entities, positions) {
						if (this[activeKey]) return
						if (!isEnabled(api) || !hasUpgradeTarget(this, entities, positions)) return original.apply(this, arguments)
						const plan = planRelocation(this, entities, positions)
						if (!plan) return
						return commitRelocation(this, plan, original, api)
					}
				})
			})
		}
	})

	function isPosition(p) { return Array.isArray(p) && p.length === 2 && p.every(Number.isSafeInteger) }
	function key(p) { return 'u' + p[0] + 'v' + p[1] }
	function at(game, p) { return game.stuffMap[key(p)] }
	function samePosition(a, b) { return a[0] === b[0] && a[1] === b[1] }
	function hasUpgradeTarget(game, entities, positions) {
		return Array.isArray(entities) && Array.isArray(positions) && entities.some((entity, i) =>
			entity?.name === 'gradient' && isPosition(positions[i]) && game.entityAtCoordinates(positions[i])?.name === 'puncture')
	}

	// Consuming a Puncture is an upgrade exception, not permission to move/swap Punctures.
	function planRelocation(game, entities, positions) {
		if (game.interactionMode !== 'relocate' || game.plane || game.entitiesInGame.pinhole || !(game.entitiesInGame.mega3 > 0)) return null
		if (!Array.isArray(game.stuff) || !game.stuffMap || !entities.length || entities.length !== positions.length) return null
		const moving = new Set(entities)
		if (moving.size !== entities.length || !positions.every(isPosition)) return null
		const targets = new Set(positions.map(key))
		if (targets.size !== positions.length) return null
		const upgrades = [], swaps = [], swapPositions = [], world = new Set(game.stuff)
		for (let i = 0; i < entities.length; i++) {
			const entity = entities[i], position = positions[i]
			// Native massRelocate updates center cells only; refuse large footprints in this special batch.
			if (!entity || entity.entitySpan || !isPosition(entity.position) || !world.has(entity) || at(game, entity.position) !== entity || !game.canRelocate(entity)) return null
			if (entity.indestructible || game.isWithinMemoryComplex(entity.position) || game.isWithinMemoryComplex(position)) return null
			const target = at(game, position)
			if (!target || moving.has(target)) continue
			if (target.entitySpan || target.indestructible || !world.has(target) || !samePosition(target.position, position)) return null
			if (entity.name === 'gradient' && target.name === 'puncture') {
				upgrades.push({ entity, target, position: position.slice() })
			} else {
				if (!game.canRelocate(target) || targets.has(key(entity.position)) || swaps.includes(target)) return null
				swaps.push(target)
				swapPositions.push(entity.position.slice())
			}
		}
		if (!upgrades.length || !Number.isSafeInteger(game.entitiesInGame.puncture) || game.entitiesInGame.puncture < upgrades.length) return null
		const allEntities = entities.concat(swaps), allPositions = positions.concat(swapPositions).map(p => p.slice())
		if (new Set(allPositions.map(key)).size !== allPositions.length) return null
		return { entities: entities.slice(), positions: positions.map(p => p.slice()), allEntities, allPositions, upgrades }
	}

	function captureObject(object) {
		const descriptors = Object.getOwnPropertyDescriptors(object), arrays = []
		for (const descriptor of Object.values(descriptors)) {
			if (Array.isArray(descriptor.value)) arrays.push([descriptor.value, descriptor.value.slice()])
		}
		return { object, descriptors, arrays }
	}
	function captureWorld(game) {
		// Neighbour init refreshes Chasm paths outside the moving batch, too.
		const objects = new Set([game, game.stuffMap, game.entitiesInGame, game.stats, game.punch, game.chasm, ...game.stuff])
		return Array.from(objects).filter(object => object && typeof object === 'object').map(captureObject)
	}
	function restoreWorld(snapshot) {
		for (const saved of snapshot) {
			for (const name of Reflect.ownKeys(saved.object)) {
				if (!Object.prototype.hasOwnProperty.call(saved.descriptors, name)) delete saved.object[name]
			}
			Object.defineProperties(saved.object, saved.descriptors)
			for (const [array, values] of saved.arrays) {
				array.length = values.length
				for (let i = 0; i < values.length; i++) array[i] = values[i]
			}
		}
	}

	function commitRelocation(game, plan, original, api) {
		const snapshot = captureWorld(game)
		const initialPunctures = game.entitiesInGame.puncture, initialGradients = game.entitiesInGame.gradient
		const upgraded = new Set(plan.upgrades.map(item => item.entity))
		const penalties = plan.allEntities.filter(entity => entity.name === 'gradient').map(entity => ({
			entity, value: upgraded.has(entity) ? 1 : api.config.get(penaltyKey, true) !== false ? entity.penalty : .5
		}))
		game[activeKey] = true
		try {
			const refund = new Array(10).fill(0), source = game.uvToXYUntranslated(plan.upgrades[0].position)
			for (const item of plan.upgrades) {
				if (at(game, item.position) !== item.target) throw new Error('Puncture target changed during relocation')
				game.clearCell(item.position)
				if (at(game, item.position) || game.stuff.includes(item.target)) throw new Error('Puncture removal did not complete')
				// Repeated vanilla upgrades: remove ONE target, then quote with the remaining count.
				const price = game.getRealPrice('puncture')
				if (!Array.isArray(price) || !price.every(value => Number.isFinite(value) && value >= 0)) throw new Error('Invalid Puncture refund')
				for (let i = 0; i < price.length; i++) refund[i] = (refund[i] || 0) + price[i]
			}
			if (!refund.every(Number.isFinite)) throw new Error('Puncture refund overflow')
			const result = original.call(game, plan.entities, plan.positions)
			for (let i = 0; i < plan.allEntities.length; i++) {
				const entity = plan.allEntities[i], position = plan.allPositions[i]
				if (at(game, position) !== entity || !samePosition(entity.position, position)) throw new Error('Relocation did not complete')
			}
			if (game.entitiesInGame.puncture !== initialPunctures - plan.upgrades.length || game.entitiesInGame.gradient !== initialGradients) throw new Error('Relocation count mismatch')
			for (const saved of penalties) {
				if (saved.entity.penalty === saved.value) continue
				saved.entity.penalty = saved.value
				saved.entity.init()
			}
			game.stats.timeSinceLastDelete = 0
			// The native transfer credits inventory on completion, only after the whole batch succeeds.
			game.createResourceTransfer(refund, source, undefined, undefined, undefined, true)
			return result
		} catch (error) {
			restoreWorld(snapshot)
			try { game.store.compositionUpdate() } catch (refreshError) { console.warn('[Tweaks] Relocation shop refresh failed.', refreshError) }
			console.warn('[Tweaks] Gradient/Puncture relocation rolled back.', error)
		} finally {
			delete game[activeKey]
		}
	}
	function isEnabled(api) { return api.config.get(configKey, true) !== false }
})()
