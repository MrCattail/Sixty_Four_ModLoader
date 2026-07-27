ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init() {
		const SHARED_KEY = Symbol.for('cattail.world-editor.shared')
		const CREATIVE_KEY = Symbol.for('cattail.world-editor.creative-mode')
		const CREATIVE_ECONOMY_KEY = Symbol.for('cattail.world-editor.creative-economy')
		const SHARED_STYLE_ID = 'cattail-world-editor-shared-style'
		const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'
		const CARD_CONTROL_SELECTOR = 'button, input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [data-world-editor-card-control]'
		const previous = globalThis[SHARED_KEY]
		previous?.dispose?.()

		const worldDragGroups = new Map()
		const disclosureControllers = new Set()
		let worldDragListening = false
		ensureSharedStyle()

		function isEditableEvent(event) {
			return eventNodes(event, true).some(function (node) {
				return elementMatchesClosest(node, EDITABLE_SELECTOR)
			})
		}

		function isModLoaderPanelBlocking() {
			if (typeof document === 'undefined') return false
			const panel = document.getElementById('modloader-panel')
			return !!(panel && !panel.classList.contains('modloader-panel-autohidden'))
		}

		function isWorldEditorInputBlocked() {
			return !!(
				globalThis[CREATIVE_KEY]?.isInputBlocked?.() ||
				globalThis[CREATIVE_ECONOMY_KEY]?.isInputBlocked?.()
			)
		}

		function isCardControlEvent(event, extraSelector) {
			const selector = extraSelector
				? CARD_CONTROL_SELECTOR + ', ' + String(extraSelector)
				: CARD_CONTROL_SELECTOR
			return eventNodes(event, false).some(function (node) {
				return elementMatchesClosest(node, selector)
			})
		}

		function cardIsVisible(element) {
			return !!(
				element?.dataset?.visible === 'true' &&
				element?.dataset?.positionVisible === 'true' &&
				element?.getAttribute?.('aria-hidden') !== 'true'
			)
		}

		function visibleCardRect(element) {
			if (!cardIsVisible(element)) return null
			const rect = element.getBoundingClientRect?.()
			if (!rect) return null
			const width = finitePositive(rect.width, 0)
			const height = finitePositive(rect.height, 0)
			if (!width || !height) return null
			return {
				left: finiteSigned(rect.left),
				top: finiteSigned(rect.top),
				width,
				height
			}
		}

		function cardCandidateFits(candidate, options) {
			const settings = options || {}
			return !!(
				candidate &&
				candidate.left >= settings.margin &&
				candidate.top >= settings.margin &&
				candidate.left + candidate.width <= settings.viewportWidth - settings.margin &&
				candidate.top + candidate.height <= settings.viewportHeight - settings.margin
			)
		}

		function rectanglesOverlap(left, right, gap) {
			if (!left || !right) return false
			const spacing = finiteSigned(gap)
			return !(
				left.left + left.width + spacing <= right.left ||
				right.left + right.width + spacing <= left.left ||
				left.top + left.height + spacing <= right.top ||
				right.top + right.height + spacing <= left.top
			)
		}

		function rectangleOverlapArea(left, right) {
			if (!left || !right) return 0
			const width = Math.max(
				0,
				Math.min(left.left + left.width, right.left + right.width) - Math.max(left.left, right.left)
			)
			const height = Math.max(
				0,
				Math.min(left.top + left.height, right.top + right.height) - Math.max(left.top, right.top)
			)
			return width * height
		}

		function resolveEntityIcon(game, name) {
			const entityName = String(name || '').trim()
			if (!entityName) return ''
			const entity = game?.codex?.entities?.[entityName]
			const explicitPath = typeof entity?.shopImage === 'string' ? entity.shopImage.trim() : ''
			const path = explicitPath ||
				(entityName === 'stabilizer3'
					? 'img/stabilizer3.png'
					: entityName === 'surge'
						? ''
						: 'img/shop/' + (entity?.isDark ? entityName + '_dark' : entityName) + '.jpg')
			if (!path) return ''
			try {
				return globalThis.ModLoader?.resolveAsset?.(path) || path
			} catch (error) {
				return path
			}
		}

		function createDisclosureController(options) {
			const settings = options || {}
			const section = settings.section
			const toggle = settings.toggle
			const body = settings.body
			if (!section?.dataset || !toggle?.dataset || !body?.dataset) {
				return Object.freeze({
					state: Object.freeze({ expanded: false, preferredHeight: null }),
					refresh() {},
					setExpanded() {},
					cancelResize() { return false },
					release() {}
				})
			}
			ensureSharedStyle()
			const state = settings.state || {}
			state.expanded = state.expanded !== false
			state.preferredHeight = finitePositive(state.preferredHeight, null)
			state.minHeight = finitePositive(settings.minHeight, finitePositive(state.minHeight, 44))
			state.maxViewportRatio = clamp(
				finitePositive(settings.maxViewportRatio, finitePositive(state.maxViewportRatio, .45)),
				.05,
				1
			)
			const chevron = settings.chevron || toggle.querySelector?.('[data-world-editor-disclosure-chevron], .cattail-world-editor-production__chevron, .cattail-world-editor-blueprint-card__section-chevron')
			const handles = disclosureResizeHandles(section, settings.handles)
			let activeResize = null
			let released = false

			section.dataset.worldEditorDisclosure = ''
			toggle.dataset.worldEditorDisclosureToggle = ''
			toggle.dataset.worldEditorCardControl = ''
			body.dataset.worldEditorDisclosureBody = ''
			body.dataset.resizeOverflow = settings.resizeOverflow === 'children' ? 'children' : 'body'
			if (body.dataset.resizeOverflow === 'body') body.dataset.worldEditorScrollbar = ''
			else delete body.dataset.worldEditorScrollbar
			if (chevron?.dataset) chevron.dataset.worldEditorDisclosureChevron = ''

			toggle.addEventListener?.('click', handleToggle)
			for (const handle of handles) handle.addEventListener?.('pointerdown', handleResizeStart)
			if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
				window.addEventListener('pointermove', handleResizeMove, true)
				window.addEventListener('pointerup', handleResizeEnd, true)
				window.addEventListener('pointercancel', handleResizeCancel, true)
				window.addEventListener('blur', handleResizeBlur, true)
				window.addEventListener('resize', handleViewportResize)
			}

			const controller = Object.freeze({
				state,
				refresh(reason) {
					if (!released) applyState(reason || 'refresh', false)
				},
				setExpanded(expanded, reason, notify) {
					if (released) return
					const changed = state.expanded !== !!expanded
					state.expanded = !!expanded
					applyState(reason || 'set-expanded', notify !== false && changed)
				},
				cancelResize(reason, restore) {
					return cancelResize(reason || 'cancelled', restore === true)
				},
				release() {
					if (released) return
					released = true
					cancelResize('released', false)
					toggle.removeEventListener?.('click', handleToggle)
					for (const handle of handles) handle.removeEventListener?.('pointerdown', handleResizeStart)
					if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
						window.removeEventListener('pointermove', handleResizeMove, true)
						window.removeEventListener('pointerup', handleResizeEnd, true)
						window.removeEventListener('pointercancel', handleResizeCancel, true)
						window.removeEventListener('blur', handleResizeBlur, true)
						window.removeEventListener('resize', handleViewportResize)
					}
					disclosureControllers.delete(controller)
				}
			})
			disclosureControllers.add(controller)
			applyState('mounted', false)
			return controller

			function handleToggle(event) {
				if (released || !canInteract()) return
				consumeDisclosureEvent(event)
				cancelResize('toggle', false)
				state.expanded = !state.expanded
				applyState('toggle', true)
			}

			function handleResizeStart(event) {
				const handle = event?.currentTarget || event?.target
				const edge = handle?.dataset?.edge
				if (
					released ||
					event?.button !== 0 ||
					!state.expanded ||
					!canInteract() ||
					(edge !== 'top' && edge !== 'bottom')
				) {
					return
				}
				cancelResize('new-resize', false)
				consumeDisclosureEvent(event)
				const scale = currentUiScale()
				const rect = body.getBoundingClientRect?.()
				const startHeight = finitePositive(
					body.offsetHeight,
					finitePositive(rect?.height, state.minHeight * scale) / scale
				)
				activeResize = {
					pointerId: event.pointerId,
					handle,
					edge,
					startY: finiteSigned(event.clientY),
					startHeight,
					originalPreferredHeight: state.preferredHeight,
					scale
				}
				section.dataset.resizing = 'true'
				handle.dataset.active = 'true'
				body.dataset.resizing = 'true'
				handle.setPointerCapture?.(activeResize.pointerId)
				notify('resize-start')
			}

			function handleResizeMove(event) {
				if (!matchesActivePointer(event)) return
				event?.preventDefault?.()
				event?.stopPropagation?.()
				const direction = activeResize.edge === 'top' ? -1 : 1
				const deltaY = finiteSigned(event?.clientY) - activeResize.startY
				state.preferredHeight = clamp(
					activeResize.startHeight + deltaY * direction / activeResize.scale,
					state.minHeight,
					maximumHeight()
				)
				applyState('resize', true)
			}

			function handleResizeEnd(event) {
				if (!matchesActivePointer(event)) return
				consumeDisclosureEvent(event)
				cancelResize('pointerup', false)
			}

			function handleResizeCancel(event) {
				if (!matchesActivePointer(event)) return
				consumeDisclosureEvent(event)
				cancelResize('pointercancel', true)
			}

			function handleResizeBlur() {
				cancelResize('window-blur', true)
			}

			function handleViewportResize() {
				if (!released) applyState('viewport-resize', false)
			}

			function matchesActivePointer(event) {
				return !!(
					activeResize &&
					(
						event?.pointerId === undefined ||
						activeResize.pointerId === undefined ||
						event.pointerId === activeResize.pointerId
					)
				)
			}

			function cancelResize(reason, restore) {
				if (!activeResize) return false
				const resize = activeResize
				activeResize = null
				resize.handle?.releasePointerCapture?.(resize.pointerId)
				if (resize.handle?.dataset) delete resize.handle.dataset.active
				delete body.dataset.resizing
				delete section.dataset.resizing
				if (restore) {
					state.preferredHeight = resize.originalPreferredHeight
					applyState(reason, true)
				} else if (reason !== 'released') {
					notify(reason)
				}
				return true
			}

			function applyState(reason, shouldNotify) {
				const maximum = maximumHeight()
				const defaultHeight = finitePositive(
					typeof settings.defaultHeight === 'function'
						? settings.defaultHeight(state)
						: settings.defaultHeight,
					maximum
				)
				const effectiveHeight = state.preferredHeight === null
					? Math.max(1, defaultHeight)
					: clamp(state.preferredHeight, state.minHeight, maximum)
				state.effectiveHeight = effectiveHeight
				section.dataset.expanded = state.expanded ? 'true' : 'false'
				section.dataset.resizable = state.expanded && canInteract() ? 'true' : 'false'
				toggle.setAttribute?.('aria-expanded', state.expanded ? 'true' : 'false')
				body.style?.setProperty?.('--world-editor-disclosure-height', effectiveHeight + 'px')
				if (settings.heightProperty) {
					body.style?.setProperty?.(String(settings.heightProperty), effectiveHeight + 'px')
				}
				body.style.height = state.preferredHeight === null ? '' : effectiveHeight + 'px'
				body.dataset.sized = state.preferredHeight === null ? 'false' : 'true'
				if (shouldNotify) notify(reason)
				return effectiveHeight
			}

			function maximumHeight() {
				if (typeof settings.maximumHeight === 'function') {
					return Math.max(state.minHeight, finitePositive(settings.maximumHeight(state), state.minHeight))
				}
				const viewportHeight = finitePositive(
					typeof window !== 'undefined' ? window.innerHeight : 0,
					typeof document !== 'undefined' ? document.documentElement?.clientHeight || 0 : 0
				)
				return Math.max(state.minHeight, viewportHeight * state.maxViewportRatio)
			}

			function currentUiScale() {
				if (typeof settings.scale === 'function') {
					return clamp(finitePositive(settings.scale(), 1), .01, 1)
				}
				if (typeof document === 'undefined') return 1
				const root = document.documentElement
				const inlineValue = root?.style?.getPropertyValue?.('--world-editor-ui-scale')
				const computedValue = typeof globalThis.getComputedStyle === 'function'
					? globalThis.getComputedStyle(root)?.getPropertyValue?.('--world-editor-ui-scale')
					: ''
				return clamp(finitePositive(inlineValue || computedValue, 1), .01, 1)
			}

			function canInteract() {
				return typeof settings.canInteract !== 'function' || settings.canInteract() !== false
			}

			function notify(reason) {
				settings.onChange?.({
					reason,
					state,
					section,
					toggle,
					body,
					controller
				})
			}
		}

		function disclosureResizeHandles(section, suppliedHandles) {
			const supplied = Array.isArray(suppliedHandles)
				? suppliedHandles.filter(Boolean)
				: Array.from(section.querySelectorAll?.('[data-world-editor-disclosure-resize], [data-world-editor-section-resize]') || [])
			const handles = supplied.slice(0, 2)
			for (const edge of ['top', 'bottom']) {
				let handle = handles.find(function (candidate) { return candidate?.dataset?.edge === edge })
				if (!handle && typeof document !== 'undefined' && typeof document.createElement === 'function') {
					handle = document.createElement('span')
					handle.setAttribute?.('aria-hidden', 'true')
					handle.dataset.edge = edge
					if (edge === 'top') section.insertBefore?.(handle, section.firstChild || null)
					else section.append?.(handle)
					handles.push(handle)
				}
				if (!handle?.dataset) continue
				handle.dataset.worldEditorDisclosureResize = edge
				handle.dataset.worldEditorCardControl = ''
				handle.dataset.edge = edge
			}
			return handles
		}

		function consumeDisclosureEvent(event) {
			event?.preventDefault?.()
			event?.stopPropagation?.()
			event?.stopImmediatePropagation?.()
		}

		function registerWorldDragCard(game, element) {
			if (!game || !element?.dataset) return Object.freeze({ release() {} })
			let group = worldDragGroups.get(game)
			if (!group) {
				group = { game, elements: new Set(), active: false }
				worldDragGroups.set(game, group)
			}
			group.elements.add(element)
			element.dataset.worldDragPassThrough = group.active ? 'true' : 'false'
			ensureSharedStyle()
			installWorldDragListeners()
			let released = false
			return Object.freeze({
				release() {
					if (released) return
					released = true
					delete element.dataset.worldDragPassThrough
					group.elements.delete(element)
					if (!group.elements.size) worldDragGroups.delete(game)
					if (!worldDragGroups.size) removeWorldDragListeners()
				}
			})
		}

		function installWorldDragListeners() {
			if (worldDragListening || typeof window === 'undefined') return
			worldDragListening = true
			window.addEventListener('mousedown', handleWorldRightMouseDown, true)
			window.addEventListener('mouseup', handleWorldRightMouseUp, true)
			window.addEventListener('blur', handleWorldRightDragBlur, true)
		}

		function ensureSharedStyle() {
			if (
				typeof document === 'undefined' ||
				!document.head ||
				typeof document.createElement !== 'function' ||
				document.getElementById(SHARED_STYLE_ID)
			) {
				return
			}
			const style = document.createElement('style')
			style.id = SHARED_STYLE_ID
			style.textContent = `
				[data-world-drag-pass-through="true"] {
					pointer-events: none !important;
				}
				[data-world-editor-pinnable="true"] {
					--world-editor-card-pinned-border-color: rgba(166, 242, 70, .82);
					--world-editor-card-pinned-glow-color: rgba(166, 242, 70, .36);
					--world-editor-card-pinned-base-shadow: rgba(0, 0, 0, .24);
				}
				[data-world-editor-pinnable="true"][data-pinned="true"] {
					border-color: color-mix(in srgb, var(--world-editor-card-pinned-border-color) var(--world-editor-card-shell-percent), transparent);
					box-shadow: 0 10px 28px color-mix(in srgb, var(--world-editor-card-pinned-base-shadow) var(--world-editor-card-shell-percent), transparent), 0 0 16px color-mix(in srgb, var(--world-editor-card-pinned-glow-color) var(--world-editor-card-shell-percent), transparent);
				}
				[data-world-editor-scrollbar] {
					--world-editor-scrollbar-size: 4px;
					--world-editor-scrollbar-track: transparent;
					--world-editor-scrollbar-thumb: rgba(185, 185, 185, .48);
					--world-editor-scrollbar-thumb-hover: rgba(210, 210, 210, .62);
					scrollbar-width: thin;
					scrollbar-color: var(--world-editor-scrollbar-thumb) var(--world-editor-scrollbar-track);
				}
				[data-world-editor-scrollbar]::-webkit-scrollbar {
					width: var(--world-editor-scrollbar-size);
					height: var(--world-editor-scrollbar-size);
				}
				[data-world-editor-scrollbar]::-webkit-scrollbar-track {
					background: var(--world-editor-scrollbar-track);
				}
				[data-world-editor-scrollbar]::-webkit-scrollbar-thumb {
					border-radius: 999px;
					background: var(--world-editor-scrollbar-thumb);
				}
				[data-world-editor-scrollbar]::-webkit-scrollbar-thumb:hover {
					background: var(--world-editor-scrollbar-thumb-hover);
				}
				button[class*="cattail-world-editor-"]:focus,
				input[class*="cattail-world-editor-"]:focus,
				[tabindex][class*="cattail-world-editor-"]:focus,
				[data-world-editor-card-control]:focus,
				[data-world-editor-disclosure-toggle]:focus {
					outline: none !important;
					outline-offset: 0 !important;
				}
				[data-world-editor-disclosure] {
					position: relative;
				}
				[data-world-editor-disclosure-toggle] {
					display: grid;
					grid-template-columns: minmax(0, 1fr) 14px;
					align-items: center;
					width: 100%;
					min-height: 24px;
					box-sizing: border-box;
					margin: 0;
					border: 0;
					padding: 2px 1px;
					background: transparent;
					color: inherit;
					font: 500 10px/1.3 Montserrat, Arial, sans-serif;
					letter-spacing: 0;
					text-align: left;
					cursor: pointer;
				}
				[data-world-editor-disclosure-chevron] {
					position: relative;
					width: 12px;
					height: 12px;
					flex: 0 0 12px;
					transform: rotate(0deg);
					transition: transform .16s ease-out;
				}
				[data-world-editor-disclosure-chevron]::before,
				[data-world-editor-disclosure-chevron]::after {
					content: "";
					position: absolute;
					top: 6px;
					width: 7px;
					height: 1px;
					background: currentColor;
				}
				[data-world-editor-disclosure-chevron]::before {
					left: 0;
					transform: rotate(38deg);
				}
				[data-world-editor-disclosure-chevron]::after {
					right: 0;
					transform: rotate(-38deg);
				}
				[data-world-editor-disclosure][data-expanded="false"] > [data-world-editor-disclosure-toggle] [data-world-editor-disclosure-chevron] {
					transform: rotate(-90deg);
				}
				[data-world-editor-disclosure][data-expanded="false"] > [data-world-editor-disclosure-body] {
					max-height: 0;
					opacity: 0;
					pointer-events: none;
				}
				[data-world-editor-disclosure-body] {
					max-height: var(--world-editor-disclosure-height, 2000px);
					overflow: hidden;
					opacity: 1;
					transition: max-height .16s ease-out, opacity .16s ease-out;
				}
				[data-world-editor-disclosure-body][data-resizing="true"] {
					transition: none;
				}
				[data-world-editor-disclosure-body][data-sized="true"][data-resize-overflow="body"] {
					overflow-x: hidden;
					overflow-y: auto;
				}
				[data-world-editor-disclosure-resize] {
					position: absolute;
					z-index: 2;
					left: 0;
					right: 0;
					height: 10px;
					opacity: 0;
					pointer-events: none;
					cursor: ns-resize;
					transition: opacity .12s ease;
				}
				[data-world-editor-disclosure-resize]::after {
					content: "";
					position: absolute;
					left: 18%;
					right: 18%;
					top: 4px;
					height: 1px;
					background: currentColor;
				}
				[data-world-editor-disclosure-resize="top"] {
					top: -5px;
				}
				[data-world-editor-disclosure-resize="bottom"] {
					bottom: -5px;
				}
				[data-world-editor-disclosure][data-resizable="true"] > [data-world-editor-disclosure-resize] {
					pointer-events: auto;
				}
				[data-world-editor-disclosure][data-resizable="true"] > [data-world-editor-disclosure-resize]:hover,
				[data-world-editor-disclosure-resize][data-active="true"] {
					opacity: .72;
				}
				[data-world-editor-disclosure][data-resizing="true"] {
					user-select: none;
				}
			`
			document.head.append(style)
		}

		function removeWorldDragListeners() {
			if (!worldDragListening || typeof window === 'undefined') return
			worldDragListening = false
			window.removeEventListener('mousedown', handleWorldRightMouseDown, true)
			window.removeEventListener('mouseup', handleWorldRightMouseUp, true)
			window.removeEventListener('blur', handleWorldRightDragBlur, true)
		}

		function handleWorldRightMouseDown(event) {
			if (event?.button !== 2) return
			for (const group of worldDragGroups.values()) {
				setWorldDragGroupActive(group, event.target === group.game?.canvas)
			}
		}

		function handleWorldRightMouseUp(event) {
			if (event?.button !== 2) return
			clearWorldDragGroups()
		}

		function handleWorldRightDragBlur() {
			clearWorldDragGroups()
		}

		function clearWorldDragGroups() {
			for (const group of worldDragGroups.values()) {
				if (group.active) setWorldDragGroupActive(group, false)
			}
		}

		function setWorldDragGroupActive(group, active) {
			group.active = !!active
			for (const element of group.elements) {
				element.dataset.worldDragPassThrough = group.active ? 'true' : 'false'
			}
		}

		function eventNodes(event, includeActiveElement) {
			const nodes = typeof event?.composedPath === 'function'
				? event.composedPath().slice()
				: [event?.target]
			if (includeActiveElement && typeof document !== 'undefined') nodes.push(document.activeElement)
			return nodes.filter(Boolean)
		}

		function elementMatchesClosest(node, selector) {
			return !!(
				node &&
				node.nodeType === 1 &&
				typeof node.closest === 'function' &&
				node.closest(selector)
			)
		}

		function finitePositive(value, fallback) {
			const number = Number(value)
			return Number.isFinite(number) && number > 0 ? number : fallback
		}

		function finiteSigned(value) {
			const number = Number(value)
			return Number.isFinite(number) && !Object.is(number, -0) ? number : 0
		}

		function clamp(value, minimum, maximum) {
			return Math.min(Math.max(Number(value) || 0, minimum), maximum)
		}

		const shared = Object.freeze({
			version: 1,
			isEditableEvent,
			isModLoaderPanelBlocking,
			isWorldEditorInputBlocked,
			isCardControlEvent,
			cardIsVisible,
			visibleCardRect,
			cardCandidateFits,
			rectanglesOverlap,
			rectangleOverlapArea,
			resolveEntityIcon,
			createDisclosureController,
			registerWorldDragCard,
			dispose() {
				for (const controller of Array.from(disclosureControllers)) controller.release()
				disclosureControllers.clear()
				clearWorldDragGroups()
				for (const group of worldDragGroups.values()) {
					for (const element of group.elements) delete element.dataset.worldDragPassThrough
				}
				worldDragGroups.clear()
				removeWorldDragListeners()
				if (typeof document !== 'undefined') {
					document.getElementById?.(SHARED_STYLE_ID)?.remove?.()
				}
				if (globalThis[SHARED_KEY] === shared) delete globalThis[SHARED_KEY]
			}
		})

		Object.defineProperty(globalThis, SHARED_KEY, {
			configurable: true,
			value: shared
		})
	}
})
