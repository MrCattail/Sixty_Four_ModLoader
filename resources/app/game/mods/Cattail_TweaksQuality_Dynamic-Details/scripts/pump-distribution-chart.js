ModLoader.register({
	id: 'Cattail_TweaksQuality_Dynamic-Details',
	init(api) {
		const svgNamespace = 'http://www.w3.org/2000/svg'
		const frameInterval = 1000 / 30
		const defaults = {
			title: 'Mineral depth distribution', depth: 'Depth', probability: 'Probability',
			nonlinear: 'Nonlinear depth axis', current: 'Current depth', unknown: 'Unknown mineral',
			hidden: 'Undiscovered minerals are hidden; probabilities are not rescaled.', empty: 'No minerals discovered yet.',
			unitNote: 'Theoretical probability per resource unit; actual cubes vary.',
			widthNote: 'Band width uses the same 0–100% probability scale.',
			unavailable: 'Distribution unavailable'
		}

		// This is the native Pump.getProbability formula evaluated without touching a Pump.
		function probabilityAt(depth, point = 0, spread = 0, value = 0, span = 0) {
			if (depth < point - spread || depth > point + spread + span) return 0
			if (!spread && span) return value
			if (span) return depth < point ? value * (.5 * Math.cos((depth - point) * (Math.PI / spread)) + .5) : depth > point + span ? value * (.5 * Math.cos((depth - point - span) * (Math.PI / spread)) + .5) : value
			return value * (.5 * Math.cos((depth - point) * (Math.PI / spread)) + .5)
		}

		function distributionAt(resources, depthInternal) {
			const weights = Array.from(resources || [], resource => {
				let weight = 0
				for (const segment of resource?.probabilities || []) {
					weight = Math.max(weight, probabilityAt(depthInternal, segment.point, segment.spread, segment.value, segment.span))
				}
				return weight
			})
			const total = weights.reduce((sum, weight) => sum + weight, 0)
			return weights.map(weight => total > 0 && Number.isFinite(total) ? weight / total : 0)
		}

		function depthRatio(meters, maxMeters) {
			if (!(maxMeters > 0)) return 0
			return Math.max(0, Math.min(1, Math.log1p(Math.max(0, meters) / 100) / Math.log1p(maxMeters / 100)))
		}

		function niceCeiling(value) {
			if (!(value > 0) || !Number.isFinite(value)) return 1000
			const magnitude = 10 ** Math.floor(Math.log10(value))
			const normalized = value / magnitude
			return magnitude * (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10)
		}

		function getMaxDepth(resources, currentMeters = 0) {
			let end = 1000
			for (const resource of resources || []) {
				for (const segment of resource?.probabilities || []) {
					const point = Number(segment.point) || 0
					const spread = Number(segment.spread) || 0
					const span = segment.span === undefined ? 0 : Number(segment.span)
					// An infinite span is flat after point. A finite span has a falling shoulder.
					for (const boundary of [point - spread, point, Number.isFinite(span) ? point + span + spread : point]) {
						if (Number.isFinite(boundary)) end = Math.max(end, boundary * 10)
					}
				}
			}
			if (Number.isFinite(currentMeters)) end = Math.max(end, currentMeters)
			return niceCeiling(end)
		}

		function sampleDepths(resources, maxMeters) {
			const depths = new Set([0, maxMeters])
			const add = meters => {
				if (Number.isFinite(meters) && meters >= 0 && meters <= maxMeters) depths.add(meters)
			}
			const logMax = Math.log1p(maxMeters / 100)
			for (let i = 0; i <= 320; i++) add(Math.expm1(logMax * i / 320) * 100)
			for (const resource of resources || []) {
				for (const segment of resource?.probabilities || []) {
					const point = Number(segment.point) || 0
					const spread = Math.max(0, Number(segment.spread) || 0)
					const span = segment.span === undefined ? 0 : Number(segment.span)
					add(point * 10)
					// Extra shoulder samples preserve narrow peaks even millions of meters down.
					for (let i = 0; i <= 32; i++) {
						add((point - spread + spread * i / 32) * 10)
						if (Number.isFinite(span)) add((point + span + spread * i / 32) * 10)
					}
					if (!spread) {
						const epsilon = Math.max(.000001, Math.abs(point) * 1e-10)
						add((point - epsilon) * 10)
						if (Number.isFinite(span)) {
							add((point + span) * 10)
							add((point + span + epsilon) * 10)
						}
					}
				}
			}
			return Array.from(depths).sort((a, b) => a - b)
		}

		function formatPercent(probability) {
			const percent = probability * 100
			if (!(percent > 0)) return '0%'
			if (percent < .0001) return percent.toExponential(2) + '%'
			return Number(percent.toPrecision(5)).toString() + '%'
		}

		function text(game, key) {
			let value
			try { value = game?.pronounce?.('cattailMineDistribution', key) } catch (_) {}
			return typeof value === 'string' && value && value !== key && value !== 'NEW' && value !== 'undefined' ? value : defaults[key] || key
		}

		function resourceName(game, id, resource) {
			let value
			try { value = game?.pronounce?.('resources', id) } catch (_) {}
			return typeof value === 'string' && value ? value : resource?.name || String(id + 1)
		}

		function element(tag, className, label) {
			const node = document.createElement(tag)
			if (className) node.className = className
			if (label !== undefined) node.textContent = label
			return node
		}

		function svgElement(tag, attributes, label) {
			const node = document.createElementNS(svgNamespace, tag)
			for (const [key, value] of Object.entries(attributes || {})) node.setAttribute(key, String(value))
			if (label !== undefined) node.textContent = label
			return node
		}

		function installStyle() {
			if (document.getElementById('cattail-mine-distribution-style')) return
			const style = element('style')
			style.id = 'cattail-mine-distribution-style'
			style.textContent = `
.hintBubble.cattail-mine-distribution-card { width:max-content!important; max-width:none!important; }
.cattail-mine-distribution { box-sizing:border-box; display:block; border-top:1px solid #ccd0d9; margin-top:9px; padding-top:8px; color:#424650; font:500 11px/1.35 Montserrat,Arial,sans-serif; white-space:normal; }
.cattail-mine-distribution[hidden] { display:none!important; }
.cattail-mine-heading { font-size:12px; font-weight:700; margin-bottom:2px; }
.cattail-mine-subtitle,.cattail-mine-note,.cattail-mine-hidden { color:#6c717c; font-size:10px; }
.cattail-mine-note,.cattail-mine-hidden { margin-top:4px; }
.cattail-mine-chart-svg { display:block; width:100%; height:auto; overflow:visible; font:500 9px Montserrat,Arial,sans-serif; }
.cattail-mine-chart-svg text { fill:currentColor; }
.cattail-mine-chart-background { fill:#eff1f6; }
.cattail-mine-grid { stroke:#9ba3b5; stroke-opacity:.28; stroke-width:.7; }
.cattail-mine-depth-axis { stroke:#697382; stroke-width:1; }
.cattail-mine-area { stroke:#3a414a; stroke-opacity:.2; stroke-width:.35; }
.cattail-mine-current-line { stroke:#fff; stroke-width:1.5; filter:drop-shadow(0 0 1px #182033); }
.cattail-mine-current-dot { fill:#fff; stroke:#303949; stroke-width:1.4; }
.cattail-mine-current { margin-top:2px; font-variant-numeric:tabular-nums; font-size:11px; font-weight:600; }
.cattail-mine-legend { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:3px 9px; margin-top:5px; }
.cattail-mine-legend-item { display:flex; align-items:center; min-width:0; gap:4px; }
.cattail-mine-resource-icon,.cattail-mine-unknown-icon { flex:none; display:inline-block; position:relative; width:13.866667px; height:16px; overflow:hidden; }
.cattail-mine-resource-icon .hintResourceIcon { position:absolute; left:0; top:0; width:26px; height:30px; margin:0; transform:scale(.5333333333); transform-origin:top left; }
.cattail-mine-unknown-icon { color:#818895; font:700 12px/16px Arial,sans-serif; text-align:center; }
.cattail-mine-label { overflow-wrap:anywhere; min-width:0; }
.cattail-mine-current-value { margin-left:auto; white-space:nowrap; font-variant-numeric:tabular-nums; }
.cattail-mine-compact { margin-top:5px; padding-top:4px; }
.cattail-mine-compact .cattail-mine-legend { gap:1px 7px; margin-top:2px; }
.cattail-mine-compact .cattail-mine-note,.cattail-mine-compact .cattail-mine-hidden { margin-top:2px; }
.hintBubble.dark .cattail-mine-distribution { color:#e1e6ef; border-top-color:#424856; }
.hintBubble.dark .cattail-mine-subtitle,.hintBubble.dark .cattail-mine-note,.hintBubble.dark .cattail-mine-hidden { color:#a8b1c0; }
.hintBubble.dark .cattail-mine-chart-background { fill:#242b35; }
`
			;(document.head || document.documentElement).append(style)
		}

		function getState(panel) {
			if (panel.mineDistributionState) return panel.mineDistributionState
			const hint = panel.hintElement
			return panel.mineDistributionState = {
				active: false, geometryKey: '', lastUpdate: -Infinity, nextMeasure: 0,
				width: 0, height: 0, wasConnected: false, legend: [],
				originalTransform: hint.style.getPropertyValue('transform'),
				originalTransformPriority: hint.style.getPropertyPriority('transform'),
				originalOrigin: hint.style.getPropertyValue('transform-origin'),
				originalOriginPriority: hint.style.getPropertyPriority('transform-origin'),
				originalTransitions: ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay', 'transition-behavior'].map(key => ({ key, value: hint.style.getPropertyValue(key), priority: hint.style.getPropertyPriority(key) }))
			}
		}

		function restorePosition(panel, state) {
			if (!panel?.hintElement || !state) return
			panel.hintElement.classList.remove('cattail-mine-distribution-card')
			const style = panel.hintElement.style
			if (state.originalTransform) style.setProperty('transform', state.originalTransform, state.originalTransformPriority)
			else style.removeProperty('transform')
			if (state.originalOrigin) style.setProperty('transform-origin', state.originalOrigin, state.originalOriginPriority)
			else style.removeProperty('transform-origin')
			style.removeProperty('transition')
			for (const item of state.originalTransitions) {
				if (item.value) style.setProperty(item.key, item.value, item.priority)
				else style.removeProperty(item.key)
			}
		}

		function viewport(game) {
			return {
				width: Math.max(1, Number(window.innerWidth) || (game?.w / (game?.pixelRatio || 1)) || 1280),
				height: Math.max(1, Number(window.innerHeight) || (game?.h / (game?.pixelRatio || 1)) || 720)
			}
		}

		function position(panel, state, game, screen, now, forceMeasure) {
			const hint = panel.hintElement
			const connected = !!hint.isConnected
			if (!connected) { state.wasConnected = false; return }
			if (forceMeasure || panel.chartLayoutDirty || !state.wasConnected || now >= state.nextMeasure) {
				state.width = hint.offsetWidth || state.width
				state.height = hint.offsetHeight || state.height
				state.nextMeasure = now + 500
				panel.chartLayoutDirty = false
			}
			state.wasConnected = true
			if (!(state.width && state.height)) return
			const margin = Math.min(8, screen.width / 8, screen.height / 8)
			const scale = Math.min(1, (screen.width - margin * 2) / state.width, (screen.height - margin * 2) / state.height)
			const width = state.width * scale, height = state.height * scale
			const mouseX = Number(game?.mouse?.sxy?.[0]) || 0, mouseY = Number(game?.mouse?.sxy?.[1]) || 0
			let left = mouseX + 24
			if (left + width > screen.width - margin) left = mouseX - width - 24
			left = Math.max(margin, Math.min(left, screen.width - width - margin))
			const top = Math.max(margin, Math.min(mouseY - height / 2, screen.height - height - margin))
			// The game writes left/top from mouse.sxy after Cloud.update. Offset that anchor.
			// The shared hint transition would interpolate this offset outside the viewport.
			hint.style.setProperty('transition', 'none')
			hint.style.setProperty('transform-origin', '0 0')
			hint.style.setProperty('transform', 'translate(' + (left - mouseX) + 'px,' + (top - mouseY) + 'px) scale(' + scale + ')')
		}

		function depthTicks(maxMeters, pixels, vertical = false) {
			const candidates = [0]
			for (let magnitude = 100; magnitude <= maxMeters; magnitude *= 10) candidates.push(magnitude)
			if (candidates[candidates.length - 1] !== maxMeters) candidates.push(maxMeters)
			const result = []
			for (const value of candidates) {
				const overlaps = previous => {
					const distance = (depthRatio(value, maxMeters) - depthRatio(previous, maxMeters)) * pixels
					if (vertical) return distance < 24
					const previousWidth = depthLabel(previous, true).length * 5.1
					const valueWidth = depthLabel(value, true).length * 5.1
					return distance < (previous === 0 ? previousWidth : previousWidth / 2) + (value === maxMeters ? valueWidth : valueWidth / 2) + 5
				}
				if (value === maxMeters) {
					while (result.length > 1 && overlaps(result[result.length - 1])) result.pop()
				} else if (result.length && overlaps(result[result.length - 1])) continue
				result.push(value)
			}
			return result
		}

		function depthLabel(value, compact = false) {
			if (compact && value >= 1000) return (value / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'km'
			return value.toLocaleString('en-US', { maximumFractionDigits: 2 }) + (compact ? 'm' : ' m')
		}

		function renderGeometry(panel, state, game, resources, entries, width, plotHeight, maxMeters, view, visibility, compact) {
			const root = panel.chartRoot
			root.replaceChildren()
			root.style.width = width + 'px'
			root.classList.toggle('cattail-mine-compact', compact)
			root.dataset.view = view
			root.dataset.visibility = visibility
			root.append(element('div', 'cattail-mine-heading', text(game, 'title')))
			root.append(element('div', 'cattail-mine-subtitle', text(game, 'nonlinear')))
			const left = view === 'bands' ? 60 : 32, right = width - 7, top = 17, bottom = top + plotHeight
			const plotWidth = right - left
			const svg = svgElement('svg', { class: 'cattail-mine-chart-svg', viewBox: '0 0 ' + width + ' ' + (bottom + 30), role: 'img', 'aria-label': text(game, 'title'), 'data-view': view })
			svg.append(svgElement('rect', { class: 'cattail-mine-chart-background', x: left, y: top, width: plotWidth, height: plotHeight }))
			const depths = sampleDepths(resources, maxMeters)
			const samples = depths.map(depth => ({ ratio: depthRatio(depth, maxMeters), values: distributionAt(resources, depth / 10) }))
			const points = []
			for (let i = 0; i < entries.length; i++) {
				const entry = entries[i], upper = [], lower = []
				for (const sample of samples) {
					const probability = sample.values[entry.id] || 0
					if (view === 'bands') {
						const columnWidth = plotWidth / Math.max(1, entries.length)
						const center = left + columnWidth * (i + .5)
						const halfWidth = probability * Math.max(0, columnWidth - 6) / 2
						const y = top + sample.ratio * plotHeight
						upper.push([center + halfWidth, y]); lower.push([center - halfWidth, y])
					} else {
						let baseline = 0
						for (let j = 0; j < i; j++) baseline += sample.values[entries[j].id] || 0
						const x = left + sample.ratio * plotWidth
						upper.push([x, bottom - (baseline + probability) * plotHeight]); lower.push([x, bottom - baseline * plotHeight])
					}
				}
				points.push(upper.concat(lower.reverse()))
				const attributes = { class: 'cattail-mine-area', fill: entry.color, d: 'M' + points[i].map(point => point[0].toFixed(3) + ',' + point[1].toFixed(3)).join('L') + 'Z' }
				if (!entry.anonymous) attributes['data-resource-id'] = entry.id
				svg.append(svgElement('path', attributes))
				if (view === 'bands') {
					const columnWidth = plotWidth / Math.max(1, entries.length)
					const center = left + columnWidth * (i + .5)
					svg.append(svgElement('line', { class: 'cattail-mine-grid', x1: center, x2: center, y1: top, y2: bottom }))
					svg.append(svgElement('text', { x: center, y: top - 5, 'text-anchor': 'middle' }, String(i + 1)))
				}
			}
			if (view === 'stacked') {
				for (const percent of [0, 50, 100]) {
					const y = bottom - plotHeight * percent / 100
					svg.append(svgElement('line', { class: 'cattail-mine-grid', x1: left, x2: right, y1: y, y2: y }))
					svg.append(svgElement('text', { x: left - 4, y: y + 3, 'text-anchor': 'end' }, percent + '%'))
				}
			}
			for (const tick of depthTicks(maxMeters, view === 'bands' ? plotHeight : plotWidth, view === 'bands')) {
				const ratio = depthRatio(tick, maxMeters)
				if (view === 'bands') {
					const y = top + ratio * plotHeight
					svg.append(svgElement('line', { class: 'cattail-mine-grid', x1: left, x2: right, y1: y, y2: y }))
					svg.append(svgElement('text', { x: left - 5, y: y + 3, 'text-anchor': 'end' }, depthLabel(tick, true)))
				} else {
					const x = left + ratio * plotWidth
					svg.append(svgElement('line', { class: 'cattail-mine-grid', x1: x, x2: x, y1: top, y2: bottom }))
					svg.append(svgElement('text', { x, y: bottom + 15, 'text-anchor': tick === 0 ? 'start' : tick === maxMeters ? 'end' : 'middle' }, depthLabel(tick, true)))
				}
			}
			svg.append(svgElement('line', { class: 'cattail-mine-depth-axis', x1: left, x2: view === 'bands' ? left : right, y1: view === 'bands' ? top : bottom, y2: bottom }))
			const currentLine = svgElement('line', { class: 'cattail-mine-current-line' })
			const currentDot = svgElement('circle', { class: 'cattail-mine-current-dot', r: 3.5 })
			svg.append(currentLine, currentDot)
			root.append(svg)
			const current = element('div', 'cattail-mine-current')
			root.append(current)
			const legend = element('div', 'cattail-mine-legend')
			state.legend = entries.map((entry, index) => {
				const row = element('div', 'cattail-mine-legend-item')
				if (!entry.anonymous) row.dataset.resourceId = entry.id
				const icon = element('span', entry.anonymous ? 'cattail-mine-unknown-icon' : 'cattail-mine-resource-icon', entry.anonymous ? '?' : undefined)
				icon.setAttribute('aria-hidden', 'true')
				if (!entry.anonymous) icon.append(element('span', 'hintResourceIcon r' + entry.id))
				row.append(icon, element('span', 'cattail-mine-label', (view === 'bands' ? (index + 1) + '. ' : '') + entry.label))
				const value = element('span', 'cattail-mine-current-value')
				row.append(value); legend.append(row)
				return { id: entry.id, value }
			})
			root.append(legend)
			const possible = resources.filter(resource => resource?.probabilities?.some(segment => segment.value > 0)).length
			if (!possible) root.append(element('div', 'cattail-mine-note', text(game, 'unavailable')))
			else if (!entries.length) root.append(element('div', 'cattail-mine-note', text(game, 'empty')))
			let hiddenValue = null
			if (visibility === 'discovered' && entries.length < possible) {
				const hidden = element('div', 'cattail-mine-hidden', text(game, 'hidden') + ' ')
				hiddenValue = element('span', 'cattail-mine-hidden-value')
				hidden.append(hiddenValue); root.append(hidden)
			}
			if (view === 'bands') root.append(element('div', 'cattail-mine-note', text(game, 'widthNote')))
			state.geometry = { left, right, top, bottom, plotWidth, plotHeight, view, maxMeters, currentLine, currentDot, current, hiddenValue }
			state.geometryBuilds = (state.geometryBuilds || 0) + 1
		}

		function updateMarker(state, game, resources, currentMeters) {
			const geometry = state.geometry
			if (!geometry) return
			const ratio = depthRatio(currentMeters, geometry.maxMeters)
			const x = geometry.view === 'bands' ? geometry.left : geometry.left + ratio * geometry.plotWidth
			const y = geometry.view === 'bands' ? geometry.top + ratio * geometry.plotHeight : geometry.bottom
			const line = geometry.currentLine
			line.setAttribute('x1', x); line.setAttribute('y1', geometry.view === 'bands' ? y : geometry.top)
			line.setAttribute('x2', geometry.view === 'bands' ? geometry.right : x); line.setAttribute('y2', y)
			geometry.currentDot.setAttribute('cx', x); geometry.currentDot.setAttribute('cy', y)
			geometry.currentDot.setAttribute('data-depth-meters', currentMeters)
			geometry.current.textContent = text(game, 'current') + ': ' + depthLabel(currentMeters)
			const values = distributionAt(resources, currentMeters / 10)
			let shown = 0
			for (const item of state.legend) {
				const value = values[item.id] || 0
				shown += value
				item.value.textContent = formatPercent(value)
			}
			if (geometry.hiddenValue) geometry.hiddenValue.textContent = formatPercent(Math.max(0, values.reduce((sum, value) => sum + value, 0) - shown))
			state.markerUpdates = (state.markerUpdates || 0) + 1
		}

		function hide(panel) {
			if (panel?.chartRoot) panel.chartRoot.hidden = true
			const state = panel?.mineDistributionState
			if (!state?.active) return
			state.active = false
			state.wasConnected = false
			restorePosition(panel, state)
		}

		function update(panel, entity, active) {
			if (!panel?.hintElement || !panel.body || !active || !entity || !['pump', 'pump2'].includes(entity.name) || api.config.get('enableBuildingDetails', true) === false || api.config.get('enableMineDistributionChart', true) === false) {
				hide(panel)
				return
			}
			const game = entity.master
			if (!game) { hide(panel); return }
			installStyle()
			const state = getState(panel), wasActive = state.active
			if (!panel.chartRoot) {
				panel.chartRoot = element('div', 'cattail-mine-distribution')
				panel.body.insertAdjacentElement('afterend', panel.chartRoot)
			}
			panel.chartRoot.hidden = false
			// Keep the hint's white shell around cached-width detail rows even at a screen edge.
			// Native absolute-position shrink-to-fit otherwise permits those rows to overflow it.
			panel.hintElement.classList.add('cattail-mine-distribution-card')
			state.active = true
			const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
			const screen = viewport(game)
			const rawView = api.config.get('mineDistributionChartView', 'stacked')
			const view = rawView === 'bands' ? 'bands' : 'stacked'
			const rawVisibility = api.config.get('mineDistributionVisibility', 'discovered')
			const visibility = ['all', 'anonymous', 'discovered'].includes(rawVisibility) ? rawVisibility : 'discovered'
			const compact = screen.height < 700
			const width = Math.max(180, Math.min(380, screen.width - 36))
			const plotHeight = view === 'bands' ? (compact ? Math.max(130, Math.min(240, Math.round(screen.height * .32))) : 240) : (compact ? Math.max(100, Math.min(180, Math.round(screen.height * .25))) : 180)
			const currentMeters = Math.max(0, Number(entity.depth) * 10 || 0)
			const resources = game.codex?.resources || []
			const maxMeters = getMaxDepth(resources, currentMeters)
			const discoveries = game.stats?.totalResourcesMined || []
			const entries = []
			const tableKey = []
			for (let id = 0; id < resources.length; id++) {
				const resource = resources[id]
				tableKey.push((resource?.probabilities || []).map(segment => [segment.point, segment.spread, segment.value, segment.span].map(value => String(value)).join(',')).join(';'))
				if (!resource?.probabilities?.some(segment => segment.value > 0)) continue
				const discovered = Number(discoveries[id]) > 0
				if (visibility === 'discovered' && !discovered) continue
				const anonymous = visibility === 'anonymous' && !discovered
				entries.push({ id, anonymous, label: anonymous ? text(game, 'unknown') : resourceName(game, id, resource), color: anonymous ? '#9299a6' : resource?.triplet?.[0] || '#9299a6' })
			}
			const languageKey = String(game.language || 'en') + '|' + Object.keys(defaults).map(key => text(game, key)).join('|')
			const geometryKey = [view, visibility, width, plotHeight, compact, maxMeters, tableKey.join('|'), languageKey, entries.map(entry => [entry.id, entry.anonymous, entry.label, entry.color].join(':')).join('|')].join('~')
			const rebuild = geometryKey !== state.geometryKey
			if (rebuild) {
				state.geometryKey = geometryKey
				renderGeometry(panel, state, game, resources, entries, width, plotHeight, maxMeters, view, visibility, compact)
			}
			if (rebuild || !wasActive || now - state.lastUpdate >= frameInterval) {
				updateMarker(state, game, resources, currentMeters)
				state.lastUpdate = now
			}
			position(panel, state, game, screen, now, rebuild || !wasActive)
		}

		function invalidateLayout(panel) {
			if (panel) panel.chartLayoutDirty = true
		}

		function dispose(panel) {
			if (!panel) return
			restorePosition(panel, panel.mineDistributionState)
			panel.chartRoot?.remove()
			delete panel.chartRoot
			delete panel.mineDistributionState
			delete panel.chartLayoutDirty
		}

		const namespace = window.CattailDynamicDetails = window.CattailDynamicDetails || {}
		namespace.pumpDistributionChart = { update, dispose, invalidateLayout, distributionAt, depthRatio, getMaxDepth, sampleDepths, formatPercent }
	}
})
