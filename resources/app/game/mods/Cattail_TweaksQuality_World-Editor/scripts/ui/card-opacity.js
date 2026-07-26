ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init() {
		const CONTROLLER_KEY = Symbol.for('cattail.world-editor.card-opacity')
		const STYLE_ID = 'cattail-world-editor-card-opacity-style'
		const OPACITY_MIN = .25
		const OPACITY_MAX = 1
		const OPACITY_STEP = .1
		const previous = globalThis[CONTROLLER_KEY]
		previous?.dispose?.()

		const registrations = new Map()
		const groups = new Map()
		let sequence = 0
		let zPressed = false
		let listening = false
		let controller = null

		function register(options) {
			const element = options?.element
			if (!element || typeof element.getBoundingClientRect !== 'function') return null
			ensureStyle()
			const existing = registrations.get(element)
			existing?.release?.()
			const group = options?.group ? String(options.group) : null
			let shared = group ? groups.get(group) : null
			if (!shared) {
				shared = {
					opacity: OPACITY_MAX,
					contentIndependent: false
				}
				if (group) groups.set(group, shared)
			}
			const state = {
				id: String(options.id || element.id || 'card'),
				group,
				shared,
				element,
				hint: options.hint || null,
				priority: finiteOr(options.priority, 0),
				order: ++sequence,
				getText: typeof options.getText === 'function' ? options.getText : null,
				onChange: typeof options.onChange === 'function' ? options.onChange : null,
				released: false,
				release: null
			}
			const release = function () {
				if (state.released) return
				state.released = true
				registrations.delete(element)
				element.style.removeProperty('--world-editor-card-opacity')
				element.style.removeProperty('--world-editor-card-shell-opacity')
				element.style.removeProperty('--world-editor-card-shell-percent')
				element.style.removeProperty('--world-editor-card-shell-blur-12')
				element.style.removeProperty('--world-editor-card-shell-blur-14')
				element.style.removeProperty('--world-editor-card-shell-saturate')
				delete element.dataset.opacityContentIndependent
				delete element.dataset.cardOpacity
				if (state.group && !Array.from(registrations.values()).some(function (entry) {
					return entry.group === state.group
				})) {
					groups.delete(state.group)
				}
				if (!registrations.size) removeListeners()
			}
			state.release = release
			registrations.set(element, state)
			installListeners()
			applyState(state)
			return Object.freeze({
				refresh() {
					if (!state.released) applyState(state)
				},
				snapshot() {
					return stateSnapshot(state)
				},
				release
			})
		}

		function installListeners() {
			if (listening || typeof window === 'undefined') return
			listening = true
			window.addEventListener('keydown', handleKeydown, true)
			window.addEventListener('keyup', handleKeyup, true)
			window.addEventListener('blur', handleBlur, true)
			window.addEventListener('mousedown', handleMouseDown, true)
			window.addEventListener('auxclick', handleAuxClick, true)
			window.addEventListener('wheel', handleWheel, { capture: true, passive: false })
		}

		function removeListeners() {
			if (!listening || typeof window === 'undefined') return
			listening = false
			zPressed = false
			window.removeEventListener('keydown', handleKeydown, true)
			window.removeEventListener('keyup', handleKeyup, true)
			window.removeEventListener('blur', handleBlur, true)
			window.removeEventListener('mousedown', handleMouseDown, true)
			window.removeEventListener('auxclick', handleAuxClick, true)
			window.removeEventListener('wheel', handleWheel, true)
		}

		function handleKeydown(event) {
			if (isOpacityKey(event)) zPressed = true
		}

		function handleKeyup(event) {
			if (isOpacityKey(event)) zPressed = false
		}

		function handleBlur() {
			zPressed = false
		}

		function handleWheel(event) {
			if (!zPressed) return
			const state = cardAtEvent(event)
			if (!state) return
			const delta = finiteOr(event?.deltaY, 0) || finiteOr(event?.deltaX, 0)
			consume(event)
			if (!delta) return
			const direction = delta < 0 ? 1 : -1
			const next = clampOpacity(state.shared.opacity + direction * OPACITY_STEP)
			if (next === state.shared.opacity) return
			state.shared.opacity = next
			applySharedState(state.shared)
		}

		function handleMouseDown(event) {
			if (event?.button !== 1) return
			const state = cardAtEvent(event)
			if (!state) return
			state.shared.contentIndependent = !state.shared.contentIndependent
			applySharedState(state.shared)
			consume(event)
		}

		function handleAuxClick(event) {
			if (event?.button !== 1 || !cardAtEvent(event)) return
			consume(event)
		}

		function cardAtEvent(event) {
			const x = Number(event?.clientX)
			const y = Number(event?.clientY)
			if (!Number.isFinite(x) || !Number.isFinite(y)) return null
			return Array.from(registrations.values())
				.filter(function (state) {
					return !state.released && cardContainsPoint(state.element, x, y)
				})
				.sort(function (left, right) {
					return right.priority - left.priority || right.order - left.order
				})[0] || null
		}

		function cardContainsPoint(element, x, y) {
			if (
				!element?.isConnected ||
				element.dataset.visible !== 'true' ||
				element.dataset.positionVisible !== 'true' ||
				element.getAttribute('aria-hidden') === 'true'
			) {
				return false
			}
			const rect = element.getBoundingClientRect()
			return !!(
				rect &&
				rect.width > 0 &&
				rect.height > 0 &&
				x >= rect.left &&
				x <= rect.right &&
				y >= rect.top &&
				y <= rect.bottom
			)
		}

		function applyState(state) {
			const shellOpacity = state.shared.contentIndependent
				? clampUnit((state.shared.opacity - OPACITY_MIN) / (OPACITY_MAX - OPACITY_MIN))
				: 1
			state.element.style.setProperty('--world-editor-card-opacity', String(state.shared.opacity))
			state.element.style.setProperty('--world-editor-card-shell-opacity', String(round(shellOpacity)))
			state.element.style.setProperty('--world-editor-card-shell-percent', String(round(shellOpacity * 100)) + '%')
			state.element.style.setProperty('--world-editor-card-shell-blur-12', String(round(shellOpacity * 12)) + 'px')
			state.element.style.setProperty('--world-editor-card-shell-blur-14', String(round(shellOpacity * 14)) + 'px')
			state.element.style.setProperty('--world-editor-card-shell-saturate', String(round(1 + shellOpacity * .1)))
			state.element.dataset.opacityContentIndependent = state.shared.contentIndependent ? 'true' : 'false'
			state.element.dataset.cardOpacity = String(state.shared.opacity)
			const text = state.getText?.(stateSnapshot(state)) || {}
			const tooltip = [text.instruction, text.mode].filter(Boolean).join(' ')
			if (state.hint) {
				state.hint.dataset.tooltip = tooltip
				state.hint.dataset.contentIndependent = state.shared.contentIndependent ? 'true' : 'false'
				state.hint.setAttribute('aria-label', tooltip)
			}
		}

		function applySharedState(shared) {
			for (const state of registrations.values()) {
				if (state.shared !== shared || state.released) continue
				applyState(state)
				state.onChange?.(stateSnapshot(state))
			}
		}

		function stateSnapshot(state) {
			return Object.freeze({
				id: state.id,
				group: state.group,
				opacity: state.shared.opacity,
				contentIndependent: state.shared.contentIndependent
			})
		}

		function isOpacityKey(event) {
			const key = String(event?.key || '').toLowerCase()
			return key === 'z' || event?.code === 'KeyZ' || event?.keyCode === 90
		}

		function clampOpacity(value) {
			return Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, Math.round(Number(value) * 100) / 100))
		}

		function clampUnit(value) {
			return Math.max(0, Math.min(1, finiteOr(value, 0)))
		}

		function round(value) {
			return Math.round(Number(value) * 1000) / 1000
		}

		function finiteOr(value, fallback) {
			return Number.isFinite(Number(value)) ? Number(value) : fallback
		}

		function consume(event) {
			event?.preventDefault?.()
			event?.stopPropagation?.()
			event?.stopImmediatePropagation?.()
		}

		function ensureStyle() {
			if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
			const style = document.createElement('style')
			style.id = STYLE_ID
			style.textContent = `
				.cattail-world-editor-card-opacity-hint {
					position: relative;
					display: inline-block;
					flex: 0 0 21px;
					width: 21px;
					height: 16px;
					background: url('mods/Cattail_TweaksQuality_World-Editor/assets/icons/z-opacity-hint.svg') no-repeat;
					background-size: auto 100%;
					opacity: .66;
					vertical-align: middle;
				}
				.cattail-world-editor-card-opacity-hint[data-content-independent="true"] {
					opacity: .94;
				}
				.cattail-world-editor-card-opacity-hint::after {
					content: attr(data-tooltip);
					position: absolute;
					z-index: 4;
					top: calc(100% + 6px);
					right: 0;
					width: max-content;
					max-width: 220px;
					padding: 5px 7px;
					border: 1px solid rgba(92, 65, 132, .18);
					border-radius: 5px;
					background: rgba(248, 248, 246, .96);
					box-shadow: 0 5px 16px rgba(0, 0, 0, .14);
					color: rgba(18, 20, 22, .78);
					font: 400 10px/1.35 Montserrat, Arial, sans-serif;
					letter-spacing: 0;
					opacity: 0;
					visibility: hidden;
					white-space: normal;
					pointer-events: none;
					transition: opacity .1s ease, visibility 0s linear .1s;
				}
				[data-theme="void"] .cattail-world-editor-card-opacity-hint::after {
					border-color: rgba(210, 188, 250, .22);
					background: rgba(8, 10, 12, .96);
					color: rgba(255, 255, 255, .82);
				}
				.cattail-world-editor-card-opacity-hint:hover::after {
					opacity: 1;
					visibility: visible;
					transition-delay: 0s;
				}
			`
			document.head.append(style)
		}

		function snapshot() {
			return Object.freeze(Array.from(registrations.values(), stateSnapshot))
		}

		function dispose() {
			for (const state of Array.from(registrations.values())) state.release()
			groups.clear()
			removeListeners()
			if (globalThis[CONTROLLER_KEY] === controller) delete globalThis[CONTROLLER_KEY]
		}

		controller = Object.freeze({
			version: '0.3.5',
			min: OPACITY_MIN,
			max: OPACITY_MAX,
			step: OPACITY_STEP,
			register,
			snapshot,
			dispose
		})
		globalThis[CONTROLLER_KEY] = controller
	}
})
