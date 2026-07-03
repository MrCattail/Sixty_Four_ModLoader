ModLoader.register({
	id: 'Cattail_TweaksQuality_Dynamic-Details',
	init(api) {
		const detailKey = '_cattailDynamicDetails'
		const cubeHintKey = '_cattailDynamicCubeHint'
		const cubeProbeKey = '_cattailDynamicCubeProbe'
		const cubeMemoryKey = '_cattailDynamicCubeMemory'
		const detailToggleKey = '_cattailDynamicDetailsToggle'
		const widthStateKey = '_cattailDynamicWidthState'
		const cubeMemoryTtl = 15000
		const stableWidthTtl = 10000
		const rateWindow = 30000
		const opacityStorageKey = 'cattailDynamicDetailsHintOpacity'
		const opacityInfoStorageKey = 'cattailDynamicDetailsHintOpaqueInfo'
		const opacityMin = 0.25
		const opacityMax = 1
		const opacityStep = 0.1
		const buildCountdownStateKey = '_cattailShopBuildCountdownState'
		const buildCountdownElementKey = '_cattailShopBuildCountdownElement'
		const buildCountdownNextRefreshKey = '_cattailShopBuildCountdownNextRefresh'
		const buildCountdownLastAffordableKey = '_cattailShopBuildCountdownAffordable'
		const buildCountdownLastTextKey = '_cattailShopBuildCountdownText'
		const buildCountdownClass = 'cattail-build-countdown'
		const buildCountdownActivePriceClass = 'cattail-has-active-build-countdown'
		const buildCountdownStyleId = 'cattail-dynamic-build-countdown-style'
		const buildCountdownSampleWindowMs = 30000
		const buildCountdownSampleMinAgeMs = 2000
		const buildCountdownRateCacheMs = 500
		const buildCountdownRefreshMs = 1000
		const buildCountdownSnapshotSampleMs = 1000
		const rates = new WeakMap()
		const events = new WeakMap()
		let lastGame = null
		let zPressed = false
		let hintOpacity = 1
		let hintInfoOpaque = false

		api.on('afterVanillaScripts', function () {
			if (typeof Cloud === 'undefined' || typeof Entity === 'undefined') return

			installStyles()
			patchShortcutHints()
			patchCloudUpdate()
			patchHintProducers()
			patchMeasuredOutputs()
			installDetailToggle()
			installOpacityControls()
			patchTransientCubeHints()
			installBuildCountdown()
		})

		function patchCloudUpdate() {
			api.patch(Cloud.prototype, 'update', function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					updateDetailPanel(this)
					return result
				}
			})
		}

		function patchHintProducers() {
			patchHintProducer(Entity.prototype, 'getHint')
			patchOwnHint(typeof Pump !== 'undefined' ? Pump : null)
			patchOwnHint(typeof Gradient !== 'undefined' ? Gradient : null)
			patchOwnHint(typeof Conductor !== 'undefined' ? Conductor : null)
			patchOwnHint(typeof Hollow !== 'undefined' ? Hollow : null)
			patchOwnHint(typeof Strange !== 'undefined' ? Strange : null)
			patchOwnHint(typeof Strange1 !== 'undefined' ? Strange1 : null)
			patchOwnHint(typeof Strange2 !== 'undefined' ? Strange2 : null)
			patchOwnHint(typeof Strange3 !== 'undefined' ? Strange3 : null)
			patchOwnHint(typeof Surge !== 'undefined' ? Surge : null)
			patchOwnHint(typeof Stabilizer !== 'undefined' ? Stabilizer : null)
			patchOwnHint(typeof Stabilizer2 !== 'undefined' ? Stabilizer2 : null)
			patchOwnHint(typeof Stabilizer3 !== 'undefined' ? Stabilizer3 : null)
			patchOwnHint(typeof Puncture !== 'undefined' ? Puncture : null)
			patchOwnHint(typeof Scan !== 'undefined' ? Scan : null)

			if (typeof Cube !== 'undefined') {
				api.patch(Cube.prototype, 'getHint', function (original) {
					return function (...args) {
						const hint = original.apply(this, args)
						if (hint) return hint
						if (!isDetailActive(this.master)) return hint
						return getCubeHint(this)
					}
				})

				api.patch(Cube.prototype, 'init', function (original) {
					return function (...args) {
						const result = original.apply(this, args)
						rememberCubeSnapshot(this)
						return result
					}
				})

				api.patch(Cube.prototype, 'onmousedown', function (original) {
					return function (...args) {
						const result = original.apply(this, args)
						rememberCubeSnapshot(this)
						return result
					}
				})

				api.patch(Cube.prototype, 'onDelete', function (original) {
					return function (...args) {
						rememberCubeSnapshot(this)
						return original.apply(this, args)
					}
				})
			}
		}

		function patchOwnHint(klass) {
			if (!klass?.prototype) return
			if (!Object.prototype.hasOwnProperty.call(klass.prototype, 'getHint')) return
			patchHintProducer(klass.prototype, 'getHint')
		}

		function patchHintProducer(target, methodName) {
			api.patch(target, methodName, function (original) {
				return function (...args) {
					const hint = original.apply(this, args)
					if (hint) ensureDetailPanel(hint, this)
					return hint
				}
			})
		}

		function patchMeasuredOutputs() {
			if (typeof Consumer !== 'undefined') {
				api.patch(Consumer.prototype, 'release', function (original) {
					return function (...args) {
						const output = (this.resources || []).map((value) => Math.floor(value * (1 + (this.multiplicator * this.bonus))))
						const result = original.apply(this, args)
						recordOutput(this, output)
						return result
					}
				})
			}

			if (typeof Annihilator !== 'undefined') {
				api.patch(Annihilator.prototype, 'tap', function (original) {
					return function (...args) {
						const result = original.apply(this, args)
						if (result) recordOutput(this, [0, 0, 0, 0, 0, 0, 0, 0, 1])
						return result
					}
				})
			}

			if (typeof Entropic3 !== 'undefined') {
				api.patch(Entropic3.prototype, 'tap', function (original) {
					return function (...args) {
						const result = original.apply(this, args)
						recordEvent(this)
						return result
					}
				})
			}
		}

		function patchShortcutHints() {
			if (typeof Cloud === 'undefined') return
			api.patch(Cloud.prototype, 'addQEString', function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					ensureOpacityShortcutHint(this.element)
					return result
				}
			})
		}

		function ensureOpacityShortcutHint(hintElement) {
			const qe = hintElement?.querySelector?.('.hintQE')
			if (!qe || qe.querySelector('.cattail-dynamic-z-wheel')) return
			if (qe.querySelector('.q_mobile, .e_mobile')) return
			const hint = document.createElement('div')
			hint.className = 'cattail-dynamic-z-wheel'
			qe.append(hint)
		}

		function getCubeHint(entity) {
			const language = entity.master?.language || 'en'
			const cached = entity[cubeHintKey]
			if (cached?.language === language) {
				ensureDetailPanel(cached.hint, entity)
				return cached.hint
			}

			const hint = new Cloud(entity.master)
			const description = '<b>' + entity.master.pronounce('entities', entity.name, 'name') + '</b><br/>' + entity.master.pronounce('entities', entity.name, 'description')
			hint.addDescription(description)
			ensureDetailPanel(hint, entity)
			entity[cubeHintKey] = { language, hint }
			return hint
		}

		function ensureDetailPanel(hint, entity) {
			if (!hint?.element || !entity?.master) return

			ensureOpacityShortcutHint(hint.element)
			const widthKey = getWidthStateKey(entity)
			const current = hint[detailKey]
			if (current?.entity === entity && current.widthKey === widthKey) return

			if (current?.topFlow) current.topFlow.remove()
			if (current?.line) current.line.remove()
			if (current?.body) current.body.remove()

			const line = document.createElement('div')
			line.className = 'hintLine cattail-dynamic-detail-line'
			const body = document.createElement('div')
			body.className = 'cattail-dynamic-detail'

			const description = hint.element.querySelector('.hintDescription')
			if (description?.parentNode) {
				description.insertAdjacentElement('afterend', line)
				line.insertAdjacentElement('afterend', body)
			} else {
				hint.element.append(line, body)
			}

			hint[detailKey] = {
				entity,
				widthKey,
				hintElement: hint.element,
				topFlow: null,
				line,
				body,
				lastSignature: '',
				nextRefresh: 0,
				widthState: getWidthState(entity, widthKey)
			}
		}

		function updateDetailPanel(hint) {
			const panel = hint?.[detailKey]
			const entity = panel?.entity
			const game = entity?.master
			if (!panel || !entity || !game) return

			const active = isDetailActive(game)
			panel.line.classList.toggle('active', active)
			panel.body.classList.toggle('active', active)
			if (!active) {
				renderTopFlow(panel, game, null)
				clearStableWidths(panel)
				return
			}

			const details = describeEntity(entity)
			const now = performance.now()
			const signature = details.signature + '|lang:' + (game.language || 'en')
			if (signature === panel.lastSignature && now < panel.nextRefresh) return

			panel.lastSignature = signature
			panel.nextRefresh = now + (details.refreshMs || 500)
			renderTopFlow(panel, game, details.topFlow)
			renderDetails(panel.body, entity, details.rows)
			stabilizeDetailWidths(panel)
		}

		function isDetailActive(game) {
			return !!(isDetailToggleActive(game) || (game?.altActive && game?.shiftPressed))
		}

		function installDetailToggle() {
			if (window._cattailDynamicDetailsToggleInstalled) return
			window._cattailDynamicDetailsToggleInstalled = true
			addEventListener('keydown', function (event) {
				if (!isDetailToggleEvent(event) || event.repeat) return
				const game = lastGame
				if (!game) return
				setDetailToggle(game, !isDetailToggleActive(game))
				event.preventDefault()
				event.stopImmediatePropagation()
			}, true)
		}

		function isDetailToggleEvent(event) {
			return !!(
				event?.altKey &&
				event?.ctrlKey &&
				(event.keyCode === 17 || event.keyCode === 18 || event.key === 'Control' || event.key === 'Alt')
			)
		}

		function isDetailToggleActive(game) {
			return !!game?.[detailToggleKey]
		}

		function setDetailToggle(game, active) {
			game[detailToggleKey] = !!active
			document.body.classList.toggle('cattail-dynamic-details-locked', !!active)
			if (!active && !game.altActive) game.removeHint?.()
		}

		function installOpacityControls() {
			if (window._cattailDynamicDetailsOpacityInstalled) return
			window._cattailDynamicDetailsOpacityInstalled = true
			hintOpacity = loadHintOpacity()
			hintInfoOpaque = loadHintInfoOpaque()
			applyHintOpacity(hintOpacity)
			applyHintInfoOpacityMode(hintInfoOpaque)

			addEventListener('keydown', function (event) {
				if (isOpacityKey(event)) zPressed = true
			}, true)
			addEventListener('mousedown', function (event) {
				if (!isOpacityInfoToggleMouseEvent(event) || !lastGame) return
				setHintInfoOpaque(!hintInfoOpaque)
				event.preventDefault()
				event.stopImmediatePropagation()
			}, true)
			addEventListener('auxclick', function (event) {
				if (!isOpacityInfoToggleMouseEvent(event)) return
				event.preventDefault()
				event.stopImmediatePropagation()
			}, true)
			addEventListener('keyup', function (event) {
				if (isOpacityKey(event)) zPressed = false
			}, true)
			addEventListener('blur', function () {
				zPressed = false
			}, true)
			addEventListener('wheel', function (event) {
				const game = lastGame
				if (!game || !zPressed || !isOpacityWheelActive(game, event)) return
				const delta = event.deltaY || event.deltaX || 0
				event.preventDefault()
				event.stopImmediatePropagation()
				if (!delta) return
				const direction = delta < 0 ? 1 : -1
				const next = clampOpacity(hintOpacity + direction * opacityStep)
				if (next === hintOpacity) return
				hintOpacity = next
				saveHintOpacity(hintOpacity)
				applyHintOpacity(hintOpacity)
			}, { capture: true, passive: false })
		}

		function isOpacityKey(event) {
			const key = String(event?.key || '').toLowerCase()
			return key === 'z' || event?.code === 'KeyZ' || event?.keyCode === 90
		}

		function isOpacityInfoToggleMouseEvent(event) {
			return event?.button === 1
		}

		function isOpacityWheelActive(game, event) {
			return !!(isDetailToggleActive(game) || event?.altKey || game?.altActive)
		}

		function loadHintOpacity() {
			try {
				const value = Number(localStorage.getItem(opacityStorageKey))
				if (Number.isFinite(value)) return clampOpacity(value)
			} catch (error) {}
			return opacityMax
		}

		function saveHintOpacity(value) {
			try {
				localStorage.setItem(opacityStorageKey, String(value))
			} catch (error) {}
		}

		function loadHintInfoOpaque() {
			try {
				return localStorage.getItem(opacityInfoStorageKey) === '1'
			} catch (error) {}
			return false
		}

		function saveHintInfoOpaque(value) {
			try {
				localStorage.setItem(opacityInfoStorageKey, value ? '1' : '0')
			} catch (error) {}
		}

		function setHintInfoOpaque(active) {
			hintInfoOpaque = !!active
			saveHintInfoOpaque(hintInfoOpaque)
			applyHintInfoOpacityMode(hintInfoOpaque)
		}

		function applyHintInfoOpacityMode(active) {
			document.documentElement.classList.toggle('cattail-dynamic-info-opaque', !!active)
		}

		function applyHintOpacity(value) {
			const opacity = clampOpacity(value)
			const shellOpacity = Math.max(0, Math.min(1, (opacity - opacityMin) / (opacityMax - opacityMin)))
			document.documentElement.style.setProperty('--cattail-dynamic-hint-opacity', String(opacity))
			document.documentElement.style.setProperty('--cattail-dynamic-hint-shell-opacity', String(round(shellOpacity)))
			document.documentElement.style.setProperty('--cattail-dynamic-hint-shadow-opacity', String(round(shellOpacity * 0.12)))
		}

		function clampOpacity(value) {
			return Math.max(opacityMin, Math.min(opacityMax, Math.round(Number(value) * 100) / 100))
		}

		function patchTransientCubeHints() {
			if (typeof Game === 'undefined') return
			api.patch(Game.prototype, 'renderCursor', function (original) {
				return function (...args) {
					lastGame = this
					const locked = isDetailToggleActive(this)
					const previousAlt = this.altActive
					const previousShift = this.shiftPressed
					const previousHovered = this.hoveredEntity
					let probe = null

					if (locked) {
						this.altActive = true
						this.shiftPressed = true
					}

					try {
						if (shouldUseTransientCubeHint(this)) {
							probe = getTransientCubeProbe(this)
							if (probe) this.hoveredEntity = probe
						}
						return original.apply(this, args)
					} finally {
						if (probe && this.hoveredEntity === probe) this.hoveredEntity = previousHovered
						if (locked) {
							this.altActive = previousAlt
							this.shiftPressed = previousShift
						}
					}
				}
			})
		}

		function shouldUseTransientCubeHint(game) {
			return !!(
				game &&
				isDetailActive(game) &&
				!game.plane &&
				!game.itemInHand &&
				!game.hoveredEntity &&
				Array.isArray(game.hoveredCell) &&
				!game.entityAtCoordinates?.(game.hoveredCell)
			)
		}

		function getTransientCubeProbe(game) {
			const position = game.hoveredCell
			const sourcePump = findCubeGeneratingPump(game, position)
			if (!sourcePump) return null

			const memory = getRememberedCube(game, position)
			const counts = memory?.counts?.slice() || estimatePumpResourceCounts(sourcePump)
			let probe = game[cubeProbeKey]
			if (!probe) {
				probe = {
					name: 'cube',
					isTransientCubeProbe: true,
					baseBreakPower: 0.08,
					soi: defaultSoi(),
					canHit() { return false },
					canDarkHit() { return false },
					getHint() { return getCubeHint(this) },
					getDarkHint() { return false }
				}
				game[cubeProbeKey] = probe
			}

			probe.master = game
			probe.position = position.slice()
			probe.pump = sourcePump
			probe.state = memory?.state === 3 ? 2 : (memory?.state ?? 2)
			probe.broken = memory?.state === 3 ? 0 : (memory?.broken || 0)
			probe.resourceCounts = normalizeResourceCounts(game, counts)
			probe.resources = memory?.resources?.slice() || []
			probe.composition = countsToComposition(game, probe.resourceCounts)
			probe.consumers = []
			probe.destabilizers = []
			return probe
		}

		function findCubeGeneratingPump(game, position) {
			if (!game || !Array.isArray(position) || game.entityAtCoordinates?.(position)) return null

			let winner = null
			let winnerFlow = 0
			for (const pump of getPumps(game)) {
				if (!pump || (pump.name !== 'pump' && pump.name !== 'pump2')) continue
				if (!pumpCoversCell(pump, position)) continue

				const flow = getPumpFlow(pump)
				if (flow.actualResourcesPerSecond <= 0) continue
				if (flow.actualResourcesPerSecond > winnerFlow) {
					winner = pump
					winnerFlow = flow.actualResourcesPerSecond
				}
			}
			return winner
		}

		function getPumps(game) {
			if (game?.pumps && typeof game.pumps[Symbol.iterator] === 'function') return Array.from(game.pumps)
			return (game?.stuff || []).filter((entity) => entity?.name === 'pump' || entity?.name === 'pump2')
		}

		function pumpCoversCell(pump, position) {
			const offsets = (pump.name === 'pump2' && pump.soe) ? pump.soe : (pump.soi || [])
			for (const offset of offsets) {
				if (pump.position[0] + offset[0] === position[0] && pump.position[1] + offset[1] === position[1]) return true
			}
			return false
		}

		function estimatePumpResourceCounts(pump) {
			return normalizeResourceCounts(pump.master, getPumpDistribution(pump).map((value) => value * 64))
		}

		function rememberCubeSnapshot(entity, counts) {
			if (!entity?.master || !Array.isArray(entity.position) || entity.isTransientCubeProbe) return
			const game = entity.master
			if (!game[cubeMemoryKey]) game[cubeMemoryKey] = Object.create(null)
			const normalized = normalizeResourceCounts(game, counts || getCubeResourceCounts(entity))
			game[cubeMemoryKey][cellKey(entity.position)] = {
				time: typeof performance !== 'undefined' ? performance.now() : Date.now(),
				counts: normalized,
				resources: Array.isArray(entity.resources) ? entity.resources.slice() : [],
				composition: Array.isArray(entity.composition) ? entity.composition.slice() : undefined,
				broken: entity.broken || 0,
				state: entity.state
			}
		}

		function getRememberedCube(game, position) {
			const memory = game?.[cubeMemoryKey]?.[cellKey(position)]
			if (!memory) return null
			const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
			if (now - memory.time > cubeMemoryTtl) {
				delete game[cubeMemoryKey][cellKey(position)]
				return null
			}
			return memory
		}

		function cellKey(position) {
			return 'u' + position[0] + 'v' + position[1]
		}

		function defaultSoi() {
			return [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]
		}

		function describeEntity(entity) {
			if (!entity?.name) return details([], 500)
			if (entity.name === 'pump' || entity.name === 'pump2') return describePump(entity)
			if (entity.name === 'gradient') return describeGradient(entity)
			if (entity.name === 'cube') return describeCube(entity)
			if (isEntropic(entity)) return describeEntropic(entity)
			if (isConverter(entity)) return describeConverter(entity)
			if (entity.name === 'annihilator') return describeAnnihilator(entity)
			if (entity.name === 'consumer') return describeConsumer(entity)
			if (entity.name === 'conductor') return describeConductor(entity)
			if (entity.name === 'preheater') return describePreheater(entity)
			if (isStabilizer(entity)) return describeStabilizer(entity)
			if (isPumpSupport(entity)) return describePumpSupport(entity)
			if (isDestabilizer(entity)) return describeDestabilizer(entity)
			if (entity.name === 'silo' || entity.name === 'silo2') return describeSilo(entity)
			if (entity.name === 'vessel' || entity.name === 'vessel2' || entity.name === 'vault') return describeStorage(entity)
			if (entity.name === 'injector') return describeInjector(entity)
			if (entity.name === 'reflector') return describeReflector(entity)
			if (entity.name === 'chasm' || entity.name === 'waypoint2' || entity.name === 'generaldecay') return describeNetworkNode(entity)
			return describeGeneric(entity)
		}

		function details(rows, refreshMs, signature, topFlow) {
			return { rows, refreshMs, topFlow, signature: signature || rows.map((row) => row.signature || row.label + ':' + row.value).join('|') }
		}

		function describePump(entity) {
			const game = entity.master
			const flow = getPumpFlow(entity)
			const distribution = getPumpDistribution(entity)
			const resources = distribution.map((value) => value * flow.actualResourcesPerSecond)
			const rows = [
				resourceRow(text(game, 'production'), resources, '/s'),
				textRow(text(game, 'depthSpeed'), formatNumber(game, flow.depthMetersPerSecond) + ' m/s'),
				textRow(text(game, 'coolerBonus'), '+' + formatPercent(flow.coolerBonus) + ' (' + formatNumber(game, flow.coolerUnitsPerSecond) + '/s)'),
				textRow(text(game, 'auxBonus'), '+' + formatPercent(flow.auxBonus) + ' (' + formatNumber(game, flow.auxUnitsPerSecond) + '/s)'),
				textRow(text(game, 'surgeBonus'), '+' + formatPercent(flow.surgeBonus)),
				textRow(text(game, 'spool'), formatPercent(entity.spoolup || 0))
			]
			return details(rows, 500, [
				entity.name,
				entity.active,
				round(entity.depth),
				round(entity.spoolup),
				round(entity.surgeBoost),
				flow.signature,
				nearbySignature(entity)
			].join('|'))
		}

		function describeGradient(entity) {
			const game = entity.master
			const flow = getGradientFlow(entity)
			const resources = typeof entity.getDiscrete === 'function' ? entity.getDiscrete(flow.periodicPowerPerSecond) : []
			const rows = [
				resourceRow(text(game, 'production'), resources, '/s'),
				textRow(text(game, 'force'), formatNumber(game, flow.periodicPowerPerSecond) + '/s'),
				textRow(text(game, 'speedBonus'), '+' + formatPercent(flow.destabilizerBonus)),
				textRow(text(game, 'connection'), entity.isConnected?.() ? text(game, 'connected') : text(game, 'disconnected'))
			]
			if (flow.triggerPower) rows.push(textRow(text(game, 'triggerPower'), formatNumber(game, flow.triggerPower)))
			return details(rows, 500, [
				entity.name,
				entity.isConnected?.(),
				round(flow.periodicPowerPerSecond),
				round(flow.destabilizerBonus),
				round(flow.triggerPower),
				nearbySignature(entity)
			].join('|'))
		}

		function describeCube(entity) {
			const game = entity.master
			const counts = getCubeResourceCounts(entity)
			if (!entity.isTransientCubeProbe) rememberCubeSnapshot(entity, counts)
			const force = getCubeForce(entity)
			const rows = [
				resourceRow(text(game, 'resources'), counts, ''),
				textRow(text(game, 'speedBonus'), '+' + formatPercent(force.destabilizerBonus)),
				textRow(text(game, 'power'), formatNumber(game, force.hitPower)),
				textRow(text(game, 'entropicPower'), formatNumber(game, force.entropicPowerPerSecond) + '/s'),
				textRow(text(game, 'breakProgress'), formatPercent(entity.broken || 0)),
				textRow(text(game, 'consumerBonus'), force.consumerCount ? '+' + force.consumerCount : text(game, 'none'))
			]
			if (force.triggerPower) rows.push(textRow(text(game, 'triggerPower'), formatNumber(game, force.triggerPower)))
			return details(rows, 500, [
				entity.name,
				entity.state,
				round(entity.broken),
				round(force.hitPower),
				round(force.entropicPowerPerSecond),
				round(force.triggerPower),
				nearbySignature(entity),
				resourceSignature(counts)
			].join('|'))
		}

		function describeEntropic(entity) {
			const game = entity.master
			const info = getEntropicInfo(entity)
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				textRow(text(game, 'power'), formatNumber(game, entity.power || 0)),
				textRow(text(game, 'frequency'), info.frequencyText),
				textRow(text(game, 'targets'), String(countAdjacentTargets(entity, true))),
				textRow(text(game, 'fill'), entity.fill !== undefined ? formatPercent(entity.fill) : text(game, 'none'))
			]
			return details(rows, 500, [
				entity.name,
				entity.state,
				round(entity.fill),
				round(entity.power),
				info.signature,
				nearbySignature(entity)
			].join('|'))
		}

		function describeConverter(entity) {
			const game = entity.master
			const info = getConverterInfo(entity)
			const flow = conversionFlowRow(entity.fuel || [], info.outputOnce, 'conversionFlow')
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity), 'status'),
				resourceRow(text(game, 'output'), info.outputPerSecond, '/s', 'outputPerSecond'),
				textRow(text(game, 'efficiency'), formatNumber(game, info.progressPerSecond * 100) + '%/s'),
				textRow(text(game, 'speedBonus'), '+' + formatPercent(info.multiplier - 1)),
				textRow(text(game, 'progress'), formatPercent(entity.conversion || 0))
			]
			if (entity.name === 'converter64') {
				rows.push(textRow(text(game, 'reflectors'), String(entity.reflectorCount || 0)))
				rows.push(textRow(text(game, 'connection'), entity.alone === false ? text(game, 'blocked') : text(game, 'ready')))
			}
			return details(rows, 2000, [
				entity.name,
				entity.state,
				round(entity.conversion),
				round(entity.fill),
				round(info.multiplier),
				round(info.progressPerSecond),
				resourceSignature(info.outputOnce),
				entity.reflectorCount,
				entity.alone,
				nearbySignature(entity)
			].join('|'), entity.state === 2 ? flow : undefined)
		}

		function describeAnnihilator(entity) {
			const game = entity.master
			const output = [0, 0, 0, 0, 0, 0, 0, 0, 1]
			const flow = conversionFlowRow(entity.fuel || [], output, 'conversionFlow')
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity), 'status'),
				resourceRow(text(game, 'releaseRate'), getRecentRate(entity), '/s', 'releaseRate'),
				textRow(text(game, 'charges'), formatNumber(game, Math.floor((entity.fill || 0) / 0.03125)), 'charges'),
				textRow(text(game, 'fill'), formatPercent(entity.fill || 0), 'fill')
			]
			return details(rows, 500, [
				entity.name,
				entity.state,
				round(entity.fill),
				rateSignature(entity)
			].join('|'), entity.state === 2 ? flow : undefined)
		}

		function describeConsumer(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				resourceRow(text(game, 'stored'), entity.resources || [], ''),
				textRow(text(game, 'storage'), formatNumber(game, entity.resourceCount || 0) + ' / ' + formatNumber(game, entity.maxResourceCount || 0)),
				resourceRow(text(game, 'releaseRate'), getRecentRate(entity), '/s'),
				textRow(text(game, 'releaseBonus'), '+' + formatPercent((entity.multiplicator || 0) * (entity.bonus || 0))),
				textRow(text(game, 'resetTimer'), formatSeconds(entity.timer || 0))
			]
			return details(rows, 500, [
				entity.name,
				entity.state,
				round(entity.fill),
				round(entity.resourceCount),
				round(entity.multiplicator),
				resourceSignature(entity.resources || []),
				rateSignature(entity)
			].join('|'))
		}

		function describeConductor(entity) {
			const game = entity.master
			const transferResources = getConductorTransfers(entity)
			const rows = [
				textRow(text(game, 'connection'), entity.isConnected?.() ? text(game, 'connected') : text(game, 'disconnected')),
				textRow(text(game, 'network'), entity.chasmNetwork || text(game, 'none')),
				resourceRow(text(game, 'transporting'), transferResources, ''),
				textRow(text(game, 'nearby'), String(countNetworkNeighbours(entity)))
			]
			return details(rows, 500, [
				entity.name,
				entity.chasmNetwork,
				resourceSignature(transferResources),
				nearbySignature(entity)
			].join('|'))
		}

		function describePreheater(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				textRow(text(game, 'efficiency'), '+' + formatPercent((entity.multiplicator || 1) - 1)),
				textRow(text(game, 'targets'), String(entity.convertersNearby || 0)),
				textRow(text(game, 'fill'), formatPercent(entity.fill || 0)),
				resourceRow(text(game, 'input'), entity.fuel || [], '')
			]
			return details(rows, 2000, [
				entity.name,
				entity.state,
				round(entity.fill),
				round(entity.multiplicator),
				entity.convertersNearby,
				nearbySignature(entity)
			].join('|'))
		}

		function describeStabilizer(entity) {
			const game = entity.master
			const surge = entity.surge
			const rows = [
				textRow(text(game, 'surgeResource'), surge ? pronounceResource(game, surge.type) : text(game, 'none'), 'surgeResource'),
				textRow(text(game, 'surgeEffect'), surge ? pronounceRandom(game, 'surge' + surge.type) : text(game, 'none'), 'surgeEffect', { wrap: true }),
				textRow(text(game, 'energyRemaining'), surge ? formatStabilizedSurgeTime(game, entity, surge.lifeTimer || 0) + ' / ' + formatStabilizedSurgeTime(game, entity, surge.maxLifeTimer || 0) : text(game, 'none'), 'energyRemaining')
			]
			return details(rows, 500, [
				entity.name,
				surge ? surge.type : 'none',
				surge ? surge.grade : 'none',
				round(surge?.lifeTimer),
				round(surge?.maxLifeTimer),
				round(entity.power?.timer),
				nearbySignature(entity)
			].join('|'))
		}

		function describePumpSupport(entity) {
			const game = entity.master
			const bonus = entity.name === 'doublechannel' ? 1 : entity.name === 'doublechannel2' ? 3 : entity.name === 'auxpump' ? 0.25 : entity.name === 'auxpump2' ? 1 : 0
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				textRow(text(game, 'speedBonus'), '+' + formatPercent(bonus)),
				textRow(text(game, 'targets'), String(countAdjacentNames(entity, ['pump', 'pump2']))),
				textRow(text(game, 'fill'), entity.fill !== undefined ? formatPercent(entity.fill) : text(game, 'alwaysOn')),
				resourceRow(text(game, 'input'), entity.fuel || [], '')
			]
			return details(rows, 2000, [
				entity.name,
				entity.state,
				round(entity.fill),
				nearbySignature(entity)
			].join('|'))
		}

		function describeDestabilizer(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				textRow(text(game, 'power'), formatNumber(game, getDestabilizerValue(entity))),
				textRow(text(game, 'targets'), String(countAdjacentTargets(entity, false))),
				textRow(text(game, 'fill'), formatPercent(entity.fill || 0)),
				resourceRow(text(game, 'input'), entity.fuel || [], '')
			]
			return details(rows, 500, [
				entity.name,
				entity.state,
				round(entity.fill),
				nearbySignature(entity)
			].join('|'))
		}

		function describeSilo(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				textRow(text(game, 'charges'), formatNumber(game, Math.floor((entity.fill || 0) / 0.0625))),
				textRow(text(game, 'connection'), entity.isConnected?.() ? text(game, 'connected') : text(game, 'disconnected')),
				textRow(text(game, 'fill'), formatPercent(entity.fill || 0)),
				resourceRow(text(game, 'input'), entity.fuel || [], '')
			]
			return details(rows, 500, [
				entity.name,
				entity.state,
				round(entity.fill),
				entity.chasmNetwork,
				nearbySignature(entity)
			].join('|'))
		}

		function describeStorage(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				textRow(text(game, 'capacity'), formatNumber(game, entity.capacity || (entity.name === 'vault' ? 1024 : 0))),
				textRow(text(game, 'fill'), entity.fill !== undefined ? formatPercent(entity.fill) : text(game, 'none')),
				resourceRow(text(game, 'input'), entity.fuel || [], '')
			]
			return details(rows, 2000, [
				entity.name,
				entity.state,
				round(entity.fill),
				entity.capacity,
				nearbySignature(entity)
			].join('|'))
		}

		function describeInjector(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				resourceRow(text(game, 'conversion'), [0, 0, 0, 0, 1], ''),
				textRow(text(game, 'charges'), formatNumber(game, Math.floor((entity.fill || 0) / 0.03125))),
				textRow(text(game, 'targets'), String(countAdjacentNames(entity, ['cube']))),
				resourceRow(text(game, 'input'), entity.fuel || [], '')
			]
			return details(rows, 500, [
				entity.name,
				entity.state,
				round(entity.fill),
				nearbySignature(entity)
			].join('|'))
		}

		function describeReflector(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'speedBonus'), '+12.5%'),
				textRow(text(game, 'targets'), String(countAdjacentNames(entity, ['converter64']))),
				textRow(text(game, 'nearby'), String(countNeighbours(entity)))
			]
			return details(rows, 2000, [entity.name, nearbySignature(entity)].join('|'))
		}

		function describeNetworkNode(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'connection'), entity.isConnected?.() ? text(game, 'connected') : text(game, 'disconnected')),
				textRow(text(game, 'network'), entity.chasmNetwork || text(game, 'none')),
				textRow(text(game, 'nearby'), String(countNetworkNeighbours(entity)))
			]
			return details(rows, 2000, [entity.name, entity.chasmNetwork, nearbySignature(entity)].join('|'))
		}

		function describeGeneric(entity) {
			const game = entity.master
			const rows = [
				textRow(text(game, 'status'), statusText(game, entity)),
				textRow(text(game, 'siloSupply'), entity.isNextToSilo ? text(game, 'yes') : text(game, 'no'))
			]
			if (entity.fill !== undefined) rows.push(textRow(text(game, 'fill'), formatPercent(entity.fill)))
			if (entity.power !== undefined) rows.push(textRow(text(game, 'power'), formatNumber(game, entity.power)))
			if (entity.fuel) rows.push(resourceRow(text(game, 'input'), entity.fuel, ''))
			return details(rows, 1000, [
				entity.name,
				entity.state,
				round(entity.fill),
				round(entity.power),
				entity.isNextToSilo,
				nearbySignature(entity)
			].join('|'))
		}

		function getPumpFlow(entity) {
			const basePumpSpeed = entity.basePumpSpeed || 0
			const pumpSpeed = entity.pumpSpeed || basePumpSpeed
			const coolerBonus = pumpSpeed && basePumpSpeed ? (pumpSpeed / basePumpSpeed) - 1 : (entity.doublechannel || 0)
			const auxBonus = getActiveAuxBonus(entity)
			const surgeBonus = entity.surgeBoost || 0
			const rawUnitsPerMs = (entity.active ? pumpSpeed : 0) + (auxBonus + surgeBonus) * pumpSpeed
			const actualUnitsPerMs = (entity.spoolup || 0) >= 1 ? rawUnitsPerMs : 0
			const actualResourcesPerSecond = actualUnitsPerMs * 1000
			const depthMetersPerSecond = entity.digSpeed ? entity.digSpeed * actualUnitsPerMs * 1000 * 10 / (1 + (entity.depth || 0) ** 0.7) : 0
			return {
				coolerBonus,
				auxBonus,
				surgeBonus,
				actualResourcesPerSecond,
				depthMetersPerSecond,
				coolerUnitsPerSecond: basePumpSpeed * coolerBonus * 1000,
				auxUnitsPerSecond: pumpSpeed * auxBonus * 1000,
				signature: [round(rawUnitsPerMs), round(actualUnitsPerMs), round(coolerBonus), round(auxBonus), round(surgeBonus)].join(':')
			}
		}

		function getActiveAuxBonus(entity) {
			let bonus = 0
			const auxes = entity.auxes || []
			for (const aux of auxes) {
				if (aux?.state !== 2) continue
				if (aux.name === 'auxpump2') bonus = Math.max(bonus, 1)
				else if (aux.name === 'auxpump') bonus = Math.max(bonus, 0.25)
			}
			return bonus
		}

		function getPumpDistribution(entity) {
			const resources = entity.master?.codex?.resources || []
			const raw = []
			let sum = 0
			for (let i = 0; i < resources.length; i++) {
				const probs = resources[i]?.probabilities
				let value = 0
				if (probs) {
					for (const probability of probs) {
						value = Math.max(value, entity.getProbability(probability.point, probability.spread, probability.value, probability.span))
					}
				}
				raw[i] = value
				sum += value
			}
			return raw.map((value) => sum ? value / sum : 0)
		}

		function getGradientFlow(entity) {
			const periodic = getAdjacentEntropicPower(entity, false)
			const trigger = getAdjacentEntropicPower(entity, true)
			const destab = getDestabilizerBonus(entity, { includeIndustrial: false })
			return {
				periodicPowerPerSecond: periodic * (1 + destab),
				triggerPower: trigger * (1 + destab),
				destabilizerBonus: destab
			}
		}

		function getCubeForce(entity) {
			const hellgem = !!getCubeResourceCounts(entity)[4]
			const destab = getDestabilizerBonus(entity, { includeIndustrial: true, hellgem })
			const hardMultiplier = hellgem ? 0.03 : 1
			const hitPower = (entity.baseBreakPower || 0) * (1 + destab) * hardMultiplier
			const consumerCount = getNeighbours(entity).filter((neighbour) => neighbour?.name === 'consumer' && neighbour.state === 2).length
			return {
				destabilizerBonus: destab,
				hitPower,
				entropicPowerPerSecond: getAdjacentEntropicPower(entity, false),
				triggerPower: getAdjacentEntropicPower(entity, true),
				consumerCount
			}
		}

		function getAdjacentEntropicPower(entity, triggerOnly) {
			let value = 0
			for (const neighbour of getNeighbours(entity)) {
				if (!neighbour || !isEntropic(neighbour) || neighbour.state !== 2) continue
				if (neighbour.name === 'entropic3') {
					if (triggerOnly) value += neighbour.power || 0
				} else if (neighbour.name === 'entropic2a') {
					if (triggerOnly) value += neighbour.power || 0
				} else if (!triggerOnly) {
					value += (neighbour.power || 0) * (1000 / (neighbour.interval || 1000))
				}
			}
			return value
		}

		function getDestabilizerBonus(entity, options = {}) {
			let value = 0
			const hellgem = !!options.hellgem
			for (const neighbour of getNeighbours(entity)) {
				if (!neighbour || !isDestabilizer(neighbour) || neighbour.state !== 2) continue
				if (neighbour.name === 'destabilizer2a' && !options.includeIndustrial) continue
				if (neighbour.name === 'destabilizer2a' && !hellgem) continue
				value += getDestabilizerValue(neighbour)
			}
			return value
		}

		function getDestabilizerValue(entity) {
			if (entity.name === 'destabilizer2a') return 625
			if (entity.name === 'destabilizer2') return 2
			if (entity.name === 'destabilizer') return 1
			return 0
		}

		function getCubeResourceCounts(entity) {
			if (Array.isArray(entity.resourceCounts)) return normalizeResourceCounts(entity.master, entity.resourceCounts)
			const counts = new Array(resourceCountSize(entity.master)).fill(0)
			if (entity.composition) {
				for (let i = 0; i < entity.composition.length; i++) counts[i] = Math.round((entity.composition[i] || 0) * 64)
				return counts
			}
			for (const id of entity.resources || []) counts[id] = (counts[id] || 0) + 1
			return counts
		}

		function normalizeResourceCounts(game, resources) {
			const counts = new Array(resourceCountSize(game, resources?.length)).fill(0)
			for (let i = 0; i < (resources || []).length && i < counts.length; i++) counts[i] = Number(resources[i]) || 0
			return counts
		}

		function resourceCountSize(game, fallback) {
			return game?.resources?.length || game?.codex?.resources?.length || fallback || 10
		}

		function countsToComposition(game, counts) {
			return normalizeResourceCounts(game, counts).map((value) => value / 64)
		}

		function getEntropicInfo(entity) {
			if (entity.name === 'entropic2a') return { frequencyText: text(entity.master, 'oncePerCube'), signature: 'oncePerCube' }
			if (entity.name === 'entropic3') {
				const frequency = getRecentEventFrequency(entity)
				return {
					frequencyText: formatNumber(entity.master, frequency) + '/s',
					signature: eventRateSignature(entity)
				}
			}
			return {
				frequencyText: formatNumber(entity.master, 1000 / (entity.interval || 1000)) + '/s',
				signature: entity.interval
			}
		}

		function getConverterInfo(entity) {
			let multiplier = 1
			for (const preheater of entity.preheaters || []) {
				if (preheater?.state === 2) multiplier += preheater.multiplicator || 0
			}
			if (entity.name === 'converter64') multiplier *= (1 + (entity.reflectorCount || 0) / 8)
			const blocked = entity.name === 'converter64' && entity.alone === false
			const progressPerSecond = blocked ? 0 : (entity.baseConversionSpeed || 0) * 1000 * multiplier
			const output = typeof entity.getConversionOutput === 'function' ? entity.getConversionOutput() : []
			return {
				multiplier,
				progressPerSecond,
				outputOnce: output,
				outputPerSecond: output.map((value) => value * progressPerSecond)
			}
		}

		function getConductorTransfers(entity) {
			const out = new Array(entity.master?.resources?.length || 10).fill(0)
			const position = entity.position || []
			for (const transfer of entity.master?.chasmVfx || []) {
				if (!Array.isArray(transfer?.path) || !pathContains(transfer.path, position)) continue
				for (let i = 0; i < (transfer.resources || []).length; i++) out[i] += transfer.resources[i] || 0
			}
			return out
		}

		function pathContains(path, position) {
			return path.some((point) => point && point[0] === position[0] && point[1] === position[1])
		}

		function countAdjacentTargets(entity, includeGradient) {
			let count = 0
			for (const neighbour of getNeighbours(entity)) {
				if (!neighbour) continue
				if (neighbour.name === 'cube') count++
				if (includeGradient && neighbour.name === 'gradient') count++
			}
			return count
		}

		function countAdjacentNames(entity, names) {
			const wanted = new Set(names)
			return getNeighbours(entity).filter((neighbour) => neighbour?.name && wanted.has(neighbour.name)).length
		}

		function countNetworkNeighbours(entity) {
			const names = ['conductor', 'silo2', 'gradient', 'chasm', 'generaldecay', 'waypoint2']
			return countAdjacentNames(entity, names)
		}

		function countNeighbours(entity) {
			return getNeighbours(entity).filter(Boolean).length
		}

		function getNeighbours(entity) {
			const out = []
			const game = entity.master
			const soi = entity.soi || []
			for (const offset of soi) {
				out.push(game?.entityAtCoordinates?.([entity.position[0] + offset[0], entity.position[1] + offset[1]]))
			}
			return out
		}

		function isEntropic(entity) {
			return entity?.name === 'entropic' || entity?.name === 'entropic2' || entity?.name === 'entropic2a' || entity?.name === 'entropic3'
		}

		function isConverter(entity) {
			return entity?.name === 'converter32' || entity?.name === 'converter13' || entity?.name === 'converter41' || entity?.name === 'converter76' || entity?.name === 'converter64'
		}

		function isDestabilizer(entity) {
			return entity?.name === 'destabilizer' || entity?.name === 'destabilizer2' || entity?.name === 'destabilizer2a'
		}

		function isStabilizer(entity) {
			return entity?.name === 'stabilizer' || entity?.name === 'stabilizer2' || entity?.name === 'stabilizer3'
		}

		function isPumpSupport(entity) {
			return entity?.name === 'doublechannel' || entity?.name === 'doublechannel2' || entity?.name === 'auxpump' || entity?.name === 'auxpump2' || entity?.name === 'valve'
		}

		function recordOutput(entity, resources) {
			if (!entity || !Array.isArray(resources)) return
			const now = performance.now()
			let entry = rates.get(entity)
			if (!entry) {
				entry = []
				rates.set(entity, entry)
			}
			entry.push({ time: now, resources: resources.slice() })
			trimRateEntry(entry, now)
		}

		function recordEvent(entity) {
			if (!entity) return
			const now = performance.now()
			let entry = events.get(entity)
			if (!entry) {
				entry = []
				events.set(entity, entry)
			}
			entry.push({ time: now })
			trimRateEntry(entry, now)
		}

		function getRecentRate(entity) {
			const out = new Array(entity.master?.resources?.length || 10).fill(0)
			const now = performance.now()
			const entry = rates.get(entity) || []
			trimRateEntry(entry, now)
			if (!entry.length) return out
			let first = now
			for (const sample of entry) {
				first = Math.min(first, sample.time)
				for (let i = 0; i < sample.resources.length; i++) out[i] += sample.resources[i] || 0
			}
			const seconds = Math.max(1, (now - first) / 1000)
			return out.map((value) => value / seconds)
		}

		function getRecentEventFrequency(entity) {
			const now = performance.now()
			const entry = events.get(entity) || []
			trimRateEntry(entry, now)
			if (!entry.length) return 0
			let first = now
			for (const sample of entry) first = Math.min(first, sample.time)
			const seconds = Math.max(1, (now - first) / 1000)
			return entry.length / seconds
		}

		function trimRateEntry(entry, now) {
			while (entry.length && now - entry[0].time > rateWindow) entry.shift()
		}

		function rateSignature(entity) {
			const entry = rates.get(entity) || []
			return entry.length + ':' + resourceSignature(getRecentRate(entity))
		}

		function eventRateSignature(entity) {
			const entry = events.get(entity) || []
			return entry.length + ':' + round(getRecentEventFrequency(entity))
		}

		function nearbySignature(entity) {
			return getNeighbours(entity).map((neighbour) => {
				if (!neighbour) return '-'
				return [neighbour.name, neighbour.state, round(neighbour.fill), round(neighbour.power), round(neighbour.multiplicator)].join(':')
			}).join(',')
		}

		function resourceSignature(resources) {
			return (resources || []).map((value) => round(value)).join(',')
		}

		function renderTopFlow(panel, game, flow) {
			if (!panel?.hintElement) return
			if (!flow) {
				if (panel.topFlow) {
					panel.topFlow.remove()
					panel.topFlow = null
				}
				return
			}

			if (!panel.topFlow) {
				panel.topFlow = document.createElement('div')
				panel.topFlow.className = 'cattail-dynamic-top-flow active'
				panel.hintElement.insertBefore(panel.topFlow, panel.hintElement.firstChild)
			}
			panel.topFlow.classList.add('active')
			panel.topFlow.innerHTML = ''
			if (!appendConversionFlow(panel.topFlow, game, flow.input || [], flow.output || [], flow.key || 'conversionFlow')) {
				panel.topFlow.remove()
				panel.topFlow = null
			}
		}

		function renderDetails(body, entity, rows) {
			body.innerHTML = ''
			for (const item of rows) {
				if (!item) continue

				if (item.flow) {
					const row = document.createElement('div')
					row.className = 'cattail-dynamic-detail-flow-row'
					row.dataset.stableWidthBucket = 'values'
					row.dataset.stableWidthKey = 'flow:' + (item.key || '')
					row.dataset.stableHeightBucket = 'rows'
					row.dataset.stableHeightKey = 'flow:' + (item.key || '')
					if (appendConversionFlow(row, entity.master, item.input || [], item.output || [], item.key || '')) body.append(row)
					continue
				}

				const row = document.createElement('div')
				const rowKey = item.key || item.label || ''
				row.className = 'cattail-dynamic-detail-row'
				row.dataset.stableHeightBucket = 'rows'
				row.dataset.stableHeightKey = 'row:' + rowKey

				const label = document.createElement('div')
				label.className = 'cattail-dynamic-detail-label'
				label.textContent = item.label
				const value = document.createElement('div')
				value.className = 'cattail-dynamic-detail-value'
				if (item.wrap) value.classList.add('cattail-dynamic-detail-value-wrap')
				value.dataset.stableWidthBucket = 'values'
				value.dataset.stableWidthKey = 'row:' + rowKey + ':' + (item.suffix || '')

				if (item.resources) appendResourceList(value, entity.master, item.resources, item.suffix || '', rowKey)
				else value.textContent = item.value === undefined ? '' : String(item.value)

				row.append(label, value)
				body.append(row)
			}
		}

		function appendConversionFlow(parent, game, input, output, rowKey) {
			const original = createOriginalConversionFlow(game, input, output)
			if (original) {
				parent.append(original)
				return true
			}

			if (!hasAnyResource(input)) return false
			const vessel = document.createElement('div')
			vessel.className = 'converterOutputVessel'
			const inputWrap = document.createElement('div')
			inputWrap.className = 'converterInput'
			const outputWrap = document.createElement('div')
			outputWrap.className = 'converterOutput'
			appendResourceChunks(inputWrap, game, input, '', 'flow:' + rowKey + ':input')
			appendResourceChunks(outputWrap, game, output, '', 'flow:' + rowKey + ':output')
			vessel.append(inputWrap, outputWrap)
			parent.append(vessel)
			return true
		}

		function createOriginalConversionFlow(game, input, output) {
			if (typeof Cloud === 'undefined' || typeof Cloud.prototype.addConvertersOutput !== 'function') return null
			const cloud = new Cloud(game)
			cloud.addConvertersOutput(input, function () { return output })
			cloud.update?.()
			const vessel = cloud.element.querySelector('.converterOutputVessel')
			if (!vessel) return null
			vessel.remove()
			return vessel
		}

		function appendResourceList(parent, game, resources, suffix, rowKey) {
			if (!appendResourceChunks(parent, game, resources, suffix, rowKey, 'span')) parent.textContent = text(game, 'none')
		}

		function hasAnyResource(resources) {
			return (resources || []).some((value) => Math.abs(value || 0) >= 0.0001)
		}

		function appendResourceChunks(parent, game, resources, suffix, rowKey, tagName = 'div') {
			let hasAny = false
			for (let i = 0; i < resources.length; i++) {
				const amount = resources[i] || 0
				if (Math.abs(amount) < 0.0001) continue
				hasAny = true
				const chunk = document.createElement(tagName)
				chunk.className = tagName === 'span' ? 'cattail-dynamic-resource' : 'hintResourceChunk'
				const icon = document.createElement(tagName)
				icon.className = 'hintResourceIcon r' + i
				const textEl = document.createElement(tagName)
				textEl.className = tagName === 'span' ? 'cattail-dynamic-resource-amount' : 'hintResourceString cattail-dynamic-resource-amount'
				textEl.dataset.stableWidthBucket = 'amounts'
				textEl.dataset.stableWidthKey = 'resource:' + rowKey + ':' + i + ':' + suffix
				textEl.textContent = formatNumber(game, amount) + suffix
				chunk.append(icon, textEl)
				parent.append(chunk)
			}
			return hasAny
		}

		function getWidthStateKey(entity) {
			if (entity?.name === 'cube' && Array.isArray(entity.position)) return 'cube:' + cellKey(entity.position)
			return ''
		}

		function getWidthState(entity, key = getWidthStateKey(entity)) {
			if (!key || !entity?.master) return createWidthState()
			const store = entity.master[widthStateKey] || (entity.master[widthStateKey] = Object.create(null))
			return store[key] || (store[key] = createWidthState())
		}

		function createWidthState() {
			return {
				values: Object.create(null),
				amounts: Object.create(null),
				rows: Object.create(null),
				heights: Object.create(null)
			}
		}

		function clearStableWidths(panel) {
			for (const element of panel?.body?.querySelectorAll?.('[data-stable-width-key]') || []) element.style.minWidth = ''
			for (const element of panel?.body?.querySelectorAll?.('[data-stable-height-key]') || []) element.style.minHeight = ''
			if (panel?.body) panel.body.style.minHeight = ''
		}

		function stabilizeDetailWidths(panel) {
			if (!panel?.body) return
			if (!panel.body.isConnected) {
				if (!panel.widthMeasureQueued && typeof requestAnimationFrame === 'function') {
					panel.widthMeasureQueued = true
					requestAnimationFrame(function () {
						panel.widthMeasureQueued = false
						stabilizeDetailWidths(panel)
					})
				}
				return
			}

			const now = performance.now()
			const state = panel.widthState || (panel.widthState = createWidthState())
			for (const element of panel.body.querySelectorAll('[data-stable-width-key]')) {
				const bucketName = element.dataset.stableWidthBucket || 'values'
				const bucket = state[bucketName] || (state[bucketName] = Object.create(null))
				syncStableWidth(element, element.dataset.stableWidthKey, bucket, now)
			}
			for (const element of panel.body.querySelectorAll('[data-stable-height-key]')) {
				const bucketName = element.dataset.stableHeightBucket || 'rows'
				const bucket = state[bucketName] || (state[bucketName] = Object.create(null))
				syncStableHeight(element, element.dataset.stableHeightKey, bucket, now)
			}
			stabilizeDetailHeight(panel, state, now)
		}

		function syncStableWidth(element, key, bucket, now) {
			if (!element || !key) return
			const entry = bucket[key]
			const active = !!(entry && now - entry.time <= stableWidthTtl)
			element.style.minWidth = active ? Math.ceil(entry.width) + 'px' : ''

			const naturalWidth = measureNaturalWidth(element)
			if (!naturalWidth) return

			if (!entry || !active || naturalWidth >= entry.width - 0.5) {
				const width = active ? Math.max(entry.width, naturalWidth) : naturalWidth
				bucket[key] = { width, time: now }
				element.style.minWidth = Math.ceil(width) + 'px'
				return
			}

			element.style.minWidth = Math.ceil(entry.width) + 'px'
		}

		function syncStableHeight(element, key, bucket, now) {
			if (!element || !key) return
			const entry = bucket[key]
			const active = !!(entry && now - entry.time <= stableWidthTtl)
			element.style.minHeight = active ? Math.ceil(entry.height) + 'px' : ''

			const naturalHeight = measureNaturalHeight(element)
			if (!naturalHeight) return

			if (!entry || !active || naturalHeight >= entry.height - 0.5) {
				const height = active ? Math.max(entry.height, naturalHeight) : naturalHeight
				bucket[key] = { height, time: now }
				element.style.minHeight = Math.ceil(height) + 'px'
				return
			}

			element.style.minHeight = Math.ceil(entry.height) + 'px'
		}

		function stabilizeDetailHeight(panel, state, now) {
			if (!panel?.body) return
			const bucket = state.heights || (state.heights = Object.create(null))
			const key = 'detail'
			const entry = bucket[key]
			const active = !!(entry && now - entry.time <= stableWidthTtl)
			const topHeight = measureElementHeight(panel.topFlow)
			const naturalBodyHeight = measureNaturalHeight(panel.body)
			const naturalTotalHeight = naturalBodyHeight + topHeight
			if (!naturalTotalHeight) return

			let targetTotalHeight = naturalTotalHeight
			if (!entry || !active || naturalTotalHeight >= entry.height - 0.5) {
				targetTotalHeight = active ? Math.max(entry.height, naturalTotalHeight) : naturalTotalHeight
				bucket[key] = { height: targetTotalHeight, time: now }
			} else {
				targetTotalHeight = entry.height
			}

			const bodyHeight = Math.max(naturalBodyHeight, targetTotalHeight - topHeight)
			panel.body.style.minHeight = Math.ceil(bodyHeight) + 'px'
		}

		function measureNaturalWidth(element) {
			const previous = element.style.minWidth
			element.style.minWidth = ''
			const rect = element.getBoundingClientRect?.()
			const width = Math.max(rect?.width || 0, element.scrollWidth || 0)
			element.style.minWidth = previous
			return Math.ceil(width)
		}

		function measureNaturalHeight(element) {
			const previous = element.style.minHeight
			element.style.minHeight = ''
			const rect = element.getBoundingClientRect?.()
			const height = Math.max(rect?.height || 0, element.scrollHeight || 0)
			element.style.minHeight = previous
			return Math.ceil(height)
		}

		function measureElementHeight(element) {
			if (!element) return 0
			const rect = element.getBoundingClientRect?.()
			return Math.ceil(Math.max(rect?.height || 0, element.scrollHeight || 0))
		}

		function conversionFlowRow(input, output, key) {
			return { flow: true, input, output, key, signature: 'flow:' + resourceSignature(input) + '>' + resourceSignature(output) }
		}

		function textRow(label, value, key, options) {
			return { label, value, key, ...(options || {}), signature: label + ':' + value }
		}

		function resourceRow(label, resources, suffix, key) {
			return { label, resources, suffix, key, signature: label + ':' + resourceSignature(resources) + ':' + suffix }
		}

		function statusText(game, entity) {
			if (entity.active) return text(game, 'active')
			if (entity.state === 0) return text(game, 'idle')
			if (entity.state === 1) return text(game, 'starting')
			if (entity.state === 2) return text(game, 'active')
			if (entity.state === 3) return text(game, 'transition')
			if (entity.state === 4) return text(game, 'cooldown')
			return text(game, 'ready')
		}

		function text(game, key) {
			const value = game?.pronounce?.('cattailDynamicDetails', key)
			return typeof value === 'string' ? value : key
		}

		function pronounceResource(game, id) {
			const value = game?.pronounce?.('resources', id)
			return typeof value === 'string' ? value : String(id)
		}

		function pronounceRandom(game, key) {
			const value = game?.pronounce?.('random', key)
			return typeof value === 'string' ? value : key
		}

		function formatNumber(game, value) {
			const number = Number(value) || 0
			const sign = number < 0 ? '-' : ''
			const abs = Math.abs(number)
			if (abs === 0) return '0'
			if (abs < 0.001) return sign + abs.toExponential(2)
			if (abs < 1) return sign + trimNumber(abs, 3)
			if (abs < 1000) return sign + trimNumber(abs, abs < 10 ? 2 : 1)
			if (typeof game?.makeReadable === 'function') return String(game.makeReadable(number))
			return sign + Math.round(abs).toString()
		}

		function formatPercent(value) {
			const percent = (Number(value) || 0) * 100
			return trimNumber(percent, Math.abs(percent) < 10 ? 1 : 0) + '%'
		}

		function formatSeconds(ms) {
			return trimNumber((Number(ms) || 0) / 1000, 1) + 's'
		}

		function formatStabilizedSurgeTime(game, entity, ms) {
			const stabilization = Number(entity?.stabilization)
			if (!Number.isFinite(stabilization) || stabilization <= 0) return text(game, 'alwaysOn')
			return formatDuration((Number(ms) || 0) / stabilization)
		}

		function formatDuration(ms) {
			const seconds = Math.max(0, (Number(ms) || 0) / 1000)
			if (seconds < 90) return trimNumber(seconds, seconds < 10 ? 1 : 0) + 's'
			const minutes = Math.floor(seconds / 60)
			const restSeconds = Math.floor(seconds % 60)
			if (minutes < 60) return minutes + 'm ' + restSeconds + 's'
			return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm'
		}

		function trimNumber(value, digits) {
			return Number(value).toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
		}

		function round(value) {
			const number = Number(value)
			if (!Number.isFinite(number)) return 0
			return Math.round(number * 10000) / 10000
		}

		function installBuildCountdown() {
			if (typeof Shop === 'undefined') return

			installBuildCountdownStyles()

			api.patch(Shop.prototype, 'updatePrice', function (original) {
			  return function (item) {
			    const result = original.call(this, item)
			    ensureCountdownElement(item)
			    updateCountdown(this, item, true)
			    return result
			  }
			})

			api.patch(Shop.prototype, 'updateElements', function (original) {
			  return function () {
			    const result = original.apply(this, arguments)
			    sampleResourceSnapshot(this.master)
			    updateShopCountdowns(this, true)
			    return result
			  }
			})

			api.patch(Shop.prototype, 'check', function (original) {
			  return function () {
			    const result = original.apply(this, arguments)
			    sampleResourceSnapshot(this.master)
			    updateShopCountdowns(this, false)
			    return result
			  }
			})
		}

		function installBuildCountdownStyles() {
		  if (document.getElementById(buildCountdownStyleId)) return
		  const style = document.createElement('style')
		  style.id = buildCountdownStyleId
		  style.textContent = `
		    .shop .shopItem .itemPrice .${buildCountdownClass} {
		      display: none;
		      clear: both;
		      width: 100%;
		      margin-top: calc(var(--unit) * 0.32);
		      text-align: center;
		      color: rgba(120, 120, 130, 0.95);
		      font-size: calc(var(--unit) * 0.68);
		      font-weight: 600;
		      line-height: 1.25;
		      white-space: nowrap;
		    }
		    .shop .shopItem .itemPrice .${buildCountdownClass}.active {
		      display: block;
		    }
		    .shop.darkShop .shopItem .itemPrice .${buildCountdownClass} {
		      color: rgba(205, 205, 214, 0.9);
		    }
		    .shop .shopItem.disabled .itemPrice .${buildCountdownClass} {
		      opacity: 0.95;
		    }
		    .shop.minimized .shopItem .itemPrice .${buildCountdownClass} {
		      display: none;
		    }
		    .shop.minimized .shopItem.newItem .itemPrice .${buildCountdownClass}.active {
		      display: block;
		    }
		    .shop.mobile .shopItem .itemPrice .${buildCountdownClass} {
		      margin-top: calc(var(--munit) * 0.24);
		      font-size: calc(var(--munit) * 1.05);
		    }
		    .cattail-shop-category-item-meta .itemPrice.${buildCountdownActivePriceClass} {
		      width: 100%;
		    }
		    .cattail-shop-category-item-meta .itemPrice.${buildCountdownActivePriceClass} .${buildCountdownClass} {
		      width: 100%;
		      margin-top: calc(var(--unit) * 0.18);
		      text-align: center;
		    }
		    .shop.minimized .cattail-shop-category-item-meta .${buildCountdownClass} {
		      display: none;
		    }
		  `
		  document.head.appendChild(style)
		}

		function updateShopCountdowns(shop, force) {
		  if (!shop || !shop.items) return
		  for (const item of shop.items) {
		    updateCountdown(shop, item, force)
		  }
		}

		function updateCountdown(shop, item, force) {
		  if (!shop || !shop.master || !item || !item.name || !item.priceHtml) return
		  const element = ensureCountdownElement(item)
		  if (!element) return

		  const now = performance.now()
		  const affordable = isAffordable(shop.master, item)
		  if (!force && item[buildCountdownNextRefreshKey] && now < item[buildCountdownNextRefreshKey] && item[buildCountdownLastAffordableKey] === affordable) {
		    return
		  }
		  item[buildCountdownNextRefreshKey] = now + buildCountdownRefreshMs
		  item[buildCountdownLastAffordableKey] = affordable

		  const seconds = affordable ? 0 : getCountdownSeconds(shop.master, item)
		  if (affordable) {
		    setCountdownText(item, element, '')
		    return
		  }

		  const label = translate(shop.master, 'buildableIn')
		  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
		    setCountdownText(item, element, label + ': --')
		    return
		  }

		  setCountdownText(item, element, label + ': ' + formatBuildCountdownDuration(seconds))
		}

		function ensureCountdownElement(item) {
		  if (!item || !item.priceHtml) return null
		  let element = item[buildCountdownElementKey]
		  if (!element || element.parentNode !== item.priceHtml) {
		    element = item.priceHtml.querySelector('.' + buildCountdownClass)
		  }
		  if (!element) {
		    element = document.createElement('div')
		    element.className = buildCountdownClass
		    item.priceHtml.appendChild(element)
		  }
		  item[buildCountdownElementKey] = element
		  return element
		}

		function setCountdownText(item, element, text) {
		  const nextText = text || ''
		  if (item[buildCountdownLastTextKey] !== nextText) {
		    element.textContent = nextText
		    item[buildCountdownLastTextKey] = nextText
		  }
		  element.classList.toggle('active', Boolean(nextText))
		  if (item.priceHtml) {
		    item.priceHtml.classList.toggle(buildCountdownActivePriceClass, Boolean(nextText))
		  }
		}

		function isAffordable(game, item) {
		  if (!game || !item || !item.name || typeof game.getRealPrice !== 'function') return true
		  const price = game.getRealPrice(item.name) || []
		  const resources = game.resources || []
		  for (let i = 0; i < price.length; i++) {
		    if ((Number(price[i]) || 0) > (Number(resources[i]) || 0)) return false
		  }
		  return true
		}

		function getCountdownSeconds(game, item) {
		  const price = game.getRealPrice(item.name) || []
		  const resources = game.resources || []
		  const rates = getRates(game, price.length)
		  let longest = 0
		  let hasMissingResource = false

		  for (let i = 0; i < price.length; i++) {
		    const needed = Number(price[i]) || 0
		    const stored = Number(resources[i]) || 0
		    if (needed <= stored) continue

		    hasMissingResource = true
		    const rate = Number(rates[i]) || 0
		    if (rate <= 0.000001) return null
		    longest = Math.max(longest, (needed - stored) / rate)
		  }

		  return hasMissingResource ? Math.max(1, longest) : 0
		}

		function getState(game) {
		  if (!game[buildCountdownStateKey]) {
		    Object.defineProperty(game, buildCountdownStateKey, {
		      configurable: true,
		      value: {
		        snapshots: [],
		        lastSnapshotAt: 0,
		        cachedRates: [],
		        cachedRateAt: 0,
		        cachedRateLength: 0
		      }
		    })
		  }
		  return game[buildCountdownStateKey]
		}

		function sampleResourceSnapshot(game, now = performance.now(), force = false) {
		  if (!game || !game.resources) return
		  const state = getState(game)
		  if (!force && state.lastSnapshotAt && now - state.lastSnapshotAt < buildCountdownSnapshotSampleMs) return

		  const current = normalizeResourceArray(game.resources, game.resources.length)
		  state.snapshots.push({ time: now, resources: current })
		  state.lastSnapshotAt = now
		  trimBuildCountdownSnapshots(state, now)
		  state.cachedRateAt = 0
		}

		function getRates(game, length) {
		  const now = performance.now()
		  const state = getState(game)
		  sampleResourceSnapshot(game, now)
		  trimBuildCountdownSnapshots(state, now)

		  if (state.cachedRates && state.cachedRateLength >= length && now - state.cachedRateAt < buildCountdownRateCacheMs) {
		    return state.cachedRates
		  }

		  const rates = calculateNetSnapshotRates(game, state.snapshots, length)
		  state.cachedRates = rates
		  state.cachedRateAt = now
		  state.cachedRateLength = length
		  return rates
		}

		function calculateNetSnapshotRates(game, snapshots, length) {
		  const rates = new Array(length).fill(0)
		  if (!snapshots || snapshots.length < 2) return rates

		  const oldest = snapshots[0]
		  const newest = snapshots[snapshots.length - 1]
		  const ageMs = newest.time - oldest.time
		  if (ageMs < buildCountdownSampleMinAgeMs) return rates

		  const seconds = ageMs / 1000
		  for (let i = 0; i < length; i++) {
		    const rate = ((Number(newest.resources[i]) || 0) - (Number(oldest.resources[i]) || 0)) / seconds
		    rates[i] = isStorageBoundOscillation(game, snapshots, i, rate) ? 0 : rate
		  }
		  return rates
		}

		function isStorageBoundOscillation(game, snapshots, resourceId, rate) {
		  const cap = getProtectedResourceCapacity(game, snapshots, resourceId)
		  if (cap === null) return false

		  const values = snapshots.map((snapshot) => Number(snapshot.resources[resourceId]) || 0)
		  const min = Math.min(...values)
		  const max = Math.max(...values)
		  const margin = getProtectedOscillationMargin(game, resourceId, cap, max - min)
		  const touchesProtectedCap = max >= cap - margin
		  const escapesProtectedCap = max > cap + margin

		  return touchesProtectedCap && !escapesProtectedCap
		}

		function getProtectedResourceCapacity(game, snapshots, resourceId) {
		  if (resourceId === 4) {
		    const hasFoam = snapshots.some((snapshot) => (Number(snapshot.resources[6]) || 0) > 0) || (Number(game?.resources?.[6]) || 0) > 0
		    if (!hasFoam) return null
		    return (game?.vaults?.size || 0) * 1024
		  }

		  if (resourceId === 5) {
		    const capacity = getChromalitProtectedCapacity(game)
		    return capacity > 0 ? capacity : null
		  }

		  return null
		}

		function getChromalitProtectedCapacity(game) {
		  let capacity = 0
		  for (const entity of game?.stuff || []) {
		    if (!entity || (entity.name !== 'vessel' && entity.name !== 'vessel2')) continue
		    if (entity.state !== 2) continue
		    capacity += Number(entity.capacity) || 0
		  }
		  return capacity
		}

		function getProtectedResourceMargin(game, resourceId, cap) {
		  if (resourceId === 4) return Math.max(1, Number(game?.hellgemChunk) || 64, cap * 0.01)
		  if (resourceId === 5) return Math.max(1, 32, cap * 0.02)
		  return 1
		}

		function getProtectedOscillationMargin(game, resourceId, cap, range) {
		  const base = getProtectedResourceMargin(game, resourceId, cap)
		  const capLimit = Math.max(base, cap * (resourceId === 4 ? 0.2 : 0.15))
		  const rangeMargin = Math.max(base, (Number(range) || 0) * 0.25)
		  return Math.min(capLimit, rangeMargin)
		}

		function trimBuildCountdownSnapshots(state, now) {
		  const snapshots = state.snapshots
		  const cutoff = now - buildCountdownSampleWindowMs
		  while (snapshots.length > 2 && snapshots[1].time < cutoff) {
		    snapshots.shift()
		  }
		}

		function normalizeResourceArray(resources, length) {
		  const result = new Array(length || 0).fill(0)
		  for (let i = 0; i < result.length; i++) {
		    result[i] = Math.max(0, Number(resources[i]) || 0)
		  }
		  return result
		}

		function formatBuildCountdownDuration(rawSeconds) {
		  const total = Math.max(1, Math.ceil(rawSeconds))
		  const hours = Math.floor(total / 3600)
		  const minutes = Math.floor((total % 3600) / 60)
		  const seconds = total % 60
		  const parts = []

		  if (hours > 0) parts.push(hours + ' h')
		  if (hours > 0 || minutes > 0) parts.push(minutes + ' m')
		  parts.push(seconds + ' s')
		  return parts.join(' ')
		}

		function translate(game, key) {
		  if (game && typeof game.pronounce === 'function') {
		    const translated = game.pronounce('cattailBuildCountdown', key)
		    if (translated && translated !== key) return translated
		  }
		  const fallback = {
		    buildableIn: 'Buildable'
		  }
		  return fallback[key] || key
		}
		function installStyles() {
			if (document.getElementById('cattail-dynamic-details-style')) return
			const style = document.createElement('style')
			style.id = 'cattail-dynamic-details-style'
			style.textContent = `
.hintBubble {
	opacity: var(--cattail-dynamic-hint-opacity, 1);
}
.cattail-dynamic-info-opaque .hintBubble {
	opacity: 1;
	background: rgba(255, 255, 255, var(--cattail-dynamic-hint-shell-opacity, 1));
	box-shadow: 0px 8px 36px rgba(0, 0, 0, var(--cattail-dynamic-hint-shadow-opacity, .12));
}
.cattail-dynamic-info-opaque .hintBubble.dark {
	background: rgba(0, 0, 0, var(--cattail-dynamic-hint-shell-opacity, 1));
}
.cattail-dynamic-info-opaque .hintBubble .entityName,
.cattail-dynamic-info-opaque .hintBubble .hintProgressBarBack {
	background: rgba(238, 238, 238, var(--cattail-dynamic-hint-shell-opacity, 1));
}
.cattail-dynamic-info-opaque .hintBubble .hintLine,
.cattail-dynamic-info-opaque .hintBubble .cattail-dynamic-detail-line {
	background: rgba(221, 221, 238, var(--cattail-dynamic-hint-shell-opacity, 1));
}
.cattail-dynamic-info-opaque .hintBubble .hintDescription {
	border-top-color: rgba(221, 221, 238, var(--cattail-dynamic-hint-shell-opacity, 1));
}
.hintBubble .cattail-dynamic-detail-line,
.hintBubble .cattail-dynamic-detail {
	display: none;
}
.hintBubble .cattail-dynamic-detail-line.active {
	display: block;
}
.hintBubble .cattail-dynamic-top-flow {
	display: none;
	justify-content: center;
	margin-bottom: calc(var(--unit) * .28);
}
.hintBubble .cattail-dynamic-top-flow.active {
	display: flex;
}
.hintBubble .converterOutputVessel {
	justify-content: center;
}
.hintBubble .hintQE .cattail-dynamic-z-wheel {
	height: 16px;
	width: 21px;
	background: url('mods/Cattail_TweaksQuality_Dynamic-Details/img/zopacityhint.svg') no-repeat;
	background-size: auto 100%;
	display: none;
	vertical-align: top;
}
.altHolded .hintBubble .hintQE .cattail-dynamic-z-wheel {
	display: inline-block;
}
.hintBubble .cattail-dynamic-detail.active {
	display: grid;
	gap: calc(var(--unit) * .22);
	margin-top: calc(var(--unit) * .35);
	color: #8f8f98;
	font: 500 calc(var(--unit) * .64)/1.35 Montserrat, Arial, sans-serif;
	min-width: calc(var(--unit) * 12);
}
.hintBubble .cattail-dynamic-detail-row {
	display: grid;
	grid-template-columns: minmax(calc(var(--unit) * 4.8), auto) minmax(calc(var(--unit) * 5.5), 1fr);
	align-items: center;
	gap: calc(var(--unit) * .48);
}
.hintBubble .cattail-dynamic-detail-flow-row {
	display: flex;
	justify-content: flex-end;
	min-width: 0;
}

.hintBubble .cattail-dynamic-detail-label {
	color: #a7a7ae;
	white-space: nowrap;
}
.hintBubble .cattail-dynamic-detail-value {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	flex-wrap: wrap;
	gap: calc(var(--unit) * .22) calc(var(--unit) * .45);
	min-width: 0;
	color: #52525a;
	text-align: right;
}
.hintBubble .cattail-dynamic-detail-value-wrap {
	display: block;
	justify-self: end;
	max-width: calc(var(--unit) * 20);
	white-space: normal;
	text-align: right;
	overflow-wrap: break-word;
}
.hintBubble.dark .cattail-dynamic-detail-value {
	color: #d7d7dd;
}
.hintBubble.dark .cattail-dynamic-detail,
.hintBubble.dark .cattail-dynamic-detail-label {
	color: #b9b9c2;
}
.hintBubble .cattail-dynamic-resource {
	display: inline-flex;
	align-items: center;
	gap: calc(var(--unit) * .14);
	white-space: nowrap;
}
.hintBubble .cattail-dynamic-resource .hintResourceIcon {
	flex: 0 0 auto;
}
.hintBubble .cattail-dynamic-resource-amount {
	display: inline-block;
	min-width: calc(var(--unit) * 1.7);
	text-align: left;
}
`
			document.head.append(style)
		}
	}
})
