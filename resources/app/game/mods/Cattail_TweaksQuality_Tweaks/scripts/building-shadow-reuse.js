(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const key = 'enablePlacementShadowReuse'
	const frames = new WeakMap()
	let preview = null
	ModLoader.register({
		id: MOD_ID,
		init(api) {
			const enabled = game => (preview === null ? api.config.get(key, true) !== false : preview) && game?.version === '1.3' && !game.isMobile
			window.addEventListener('modloader:config-preview', event => {
				if (event?.detail?.modId === MOD_ID && event.detail.key === key) preview = event.detail.value !== false
			})
			api.on('afterVanillaScripts', () => {
				const hooks = window.__cattailPlacementRenderHooksV1
				if (!hooks?.supported) return
				hooks.register({
					enabled,
					collecting(game) { return frames.has(game) },
					beginFrame(game) {
						// Replace, never reuse, candidates from an earlier drawing frame.
						frames.delete(game)
						if (!enabled(game) || game.halt || game.plane || !game.itemInHand || game.transportedEntity || /^eraser[23]?$/.test(game.itemInHand.name)) return
						if (!Array.isArray(game.stuff) || !hooks.plainMap(game.stuffMap)) return
						frames.set(game, { stuff: game.stuff, map: game.stuffMap, length: game.stuff.length, hand: game.itemInHand,
							passes: 0, visited: 0, complete: false, invalid: false, cells: [], unit: null })
					},
					endFrame(game) { frames.delete(game) },
					beginPass(game) {
						const frame = frames.get(game)
						if (!frame || !enabled(game)) return null
						if (frame.passes === 0) {
							frame.unit = game.unit
							// Four corner projections, not a second entity/map traversal.
							// If even one candidate per entity costs more than native's
							// whole rectangle, do not allocate any footprint candidates.
							const lt = game.xyToUV([0, 0]), rb = game.xyToUV([game.w, game.h])
							const rt = game.xyToUV([game.w, 0]), lb = game.xyToUV([0, game.h])
							const area = Math.max(0, Math.floor(rb[0]) - Math.floor(lt[0])) * Math.max(0, Math.floor(lb[1]) - Math.floor(rt[1]))
							frame.budget = Math.min(100000, area - 1)
							if (!Number.isSafeInteger(area) || area <= frame.length) { frame.invalid = true; frame.reason = 'native-area-no-larger-than-entity-count' }
						}
						if (++frame.passes !== 1) frame.invalid = true
						return frame
					},
					visit(game, entity, frame) {
						if (frames.get(game) !== frame || frame.invalid) return
						frame.visited++
						const u = entity?.position?.[0], v = entity?.position?.[1], span = entity?.entitySpan || 0
						if (!Number.isSafeInteger(u) || !Number.isSafeInteger(v) || !Number.isSafeInteger(span) || span < 0 || span > 157 || Math.abs(u) + span >= Number.MAX_SAFE_INTEGER || Math.abs(v) + span >= Number.MAX_SAFE_INTEGER || frame.cells.length + (span * 2 + 1) ** 2 > frame.budget) { frame.invalid = true; return }
						for (let y = v - span; y <= v + span; y++) for (let x = u - span; x <= u + span; x++) {
							frame.cells.push({ x, y, key: 'u' + x + 'v' + y, entity, u, v, span })
						}
					},
					endPass(game, frame, complete) {
						if (frames.get(game) === frame) frame.complete = complete === true && !frame.invalid && frame.visited === frame.length && game.stuff === frame.stuff && game.stuff.length === frame.length
					},
					draw(game, bounds) {
						const frame = frames.get(game), fallback = reason => ({ handled: false, reason, collectedCells: frame?.cells.length || 0 })
						if (!enabled(game)) return fallback('disabled')
						if (frame?.reason) return fallback(frame.reason)
						if (!frame?.complete || frame.invalid || frame.stuff !== game.stuff || frame.length !== game.stuff.length || frame.map !== game.stuffMap || frame.hand !== game.itemInHand || game.plane || game.unit !== frame.unit) return fallback('incomplete-or-changed-frame')
						const { lt, rb, rt, lb } = bounds
						const area = Math.max(0, rb[0] - lt[0]) * Math.max(0, lb[1] - rt[1])
						if (area <= frame.cells.length) return fallback('native-area-no-larger-than-footprints')
						const occupied = new Map()
						let lookups = 0
						// Preflight all candidates before issuing a fill. Exceptions after
						// drawing begins propagate; never paint a second fallback layer.
						for (const cell of frame.cells) {
							if (cell.entity.position?.[0] !== cell.u || cell.entity.position?.[1] !== cell.v || (cell.entity.entitySpan || 0) !== cell.span) return fallback('entity-moved-during-frame')
							if (cell.x < lt[0] || cell.x >= rb[0] || cell.y < rt[1] || cell.y >= lb[1] || occupied.has(cell.key)) continue
							const descriptor = Object.getOwnPropertyDescriptor(frame.map, cell.key)
							if (descriptor && !('value' in descriptor)) return fallback('accessor-occupancy')
							lookups++
							const entity = frame.map[cell.key]
							if (entity) occupied.set(cell.key, { x: cell.x, y: cell.y, entity })
						}
						const cells = Array.from(occupied.values()).sort((a, b) => a.y - b.y || a.x - b.x)
						const upgrade = cells.length ? game.codex.entities[game.itemInHand.name].isUpgradeTo : undefined
						const ctx = game.ctx, dx = .866 * game.unit, dy = .5 * game.unit
						let fills = 0
						for (const cell of cells) {
							if (upgrade === cell.entity.name) continue
							ctx.fillStyle = '#1125'
							const xy = game.uvToXYUntranslated([cell.x, cell.y])
							ctx.beginPath(); ctx.moveTo(xy[0], xy[1] - dy)
							ctx.lineTo(xy[0] + dx, xy[1]); ctx.lineTo(xy[0], xy[1] + dy); ctx.lineTo(xy[0] - dx, xy[1])
							ctx.closePath(); ctx.fill(); fills++
						}
						return { handled: true, candidateCells: frame.cells.length, mapLookups: lookups, occupiedCells: cells.length, fills, executedCells: 0 }
					}
				})
			})
		}
	})
})()
