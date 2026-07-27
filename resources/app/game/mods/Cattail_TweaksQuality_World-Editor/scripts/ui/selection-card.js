ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const ANALYSIS_KEY = Symbol.for('cattail.world-editor.analysis')
		const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
		const INTERACTION_KEY = Symbol.for('cattail.world-editor.selection-interaction')
		const CARD_OPACITY_KEY = Symbol.for('cattail.world-editor.card-opacity')
		const SHARED_KEY = Symbol.for('cattail.world-editor.shared')
		const CARD_ID = 'cattail-world-editor-selection-card'
		const SELECTION_PRODUCTION_CARD_ID = 'cattail-world-editor-selection-production-card'
		const BLUEPRINT_CARD_ID = 'cattail-world-editor-blueprint-card'
		const BLUEPRINT_PRODUCTION_CARD_ID = 'cattail-world-editor-blueprint-production-card'
		const STYLE_ID = 'cattail-world-editor-selection-card-style'
		const TEMPORARY_VISIBLE_MS = 3000
		const AUTO_HIDE_TRANSITION_MS = 160
		let refreshMountedText = null

		api.on('afterWords', function (words, game) {
			if (typeof refreshMountedText === 'function') refreshMountedText(game)
		})

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const selection = globalThis[SELECTION_KEY]
			const analysis = globalThis[ANALYSIS_KEY]
			const i18n = globalThis[I18N_KEY]
			const shared = globalThis[SHARED_KEY]
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Selection card 2F could not find the editor runtime.')
				return
			}
			if (!selection || selection.game !== game || typeof selection.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Selection card 2F could not find the selection state.')
				return
			}
			if (!analysis || analysis.game !== game || typeof analysis.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Selection card 2F could not find the analysis state.')
				return
			}
			if (!i18n || typeof i18n.t !== 'function') {
				console.warn('[Cattail World Editor] Selection card 2F could not find the editor translations.')
				return
			}
			if (
				!shared ||
				typeof shared.isCardControlEvent !== 'function' ||
				typeof shared.visibleCardRect !== 'function' ||
				typeof shared.cardCandidateFits !== 'function' ||
				typeof shared.rectanglesOverlap !== 'function' ||
				typeof shared.rectangleOverlapArea !== 'function' ||
				typeof shared.registerWorldDragCard !== 'function'
			) {
				console.warn('[Cattail World Editor] Selection card 2F could not find shared editor services.')
				return
			}
			if (!api.ui?.hud || typeof api.ui.hud.register !== 'function') {
				console.warn('[Cattail World Editor] Selection card 2F requires the ModLoader game HUD API.')
				return
			}
			if (!api.render || typeof api.render.onFrame !== 'function') {
				console.warn('[Cattail World Editor] Selection card 2F requires the Render API frame lifecycle.')
				return
			}

			const mountedCards = typeof document.querySelectorAll === 'function'
				? document.querySelectorAll('#' + CARD_ID)
				: [document.getElementById(CARD_ID)].filter(Boolean)
			mountedCards.forEach(element => element.remove())
			const style = ensureStyle()
			const card = createCard()
			document.body.append(card)
			const worldDragControls = shared.registerWorldDragCard(game, card)

			let currentRuntime = runtime.snapshot()
			let currentSelection = selection.snapshot()
			let currentAnalysis = analysis.snapshot()
			let gameHudHidden = api.ui.hud.isHidden()
			let vanillaHudHidden = api.ui.isVanillaGameHudHidden(game)
			let positionVisible = false
			let pinned = false
			let temporaryVisible = false
			let temporaryRemaining = TEMPORARY_VISIBLE_MS
			let temporaryDeadline = 0
			let temporaryTimer = null
			let pointerPaused = false
			let autoHiding = false
			let autoHideTimer = null
			let opacityControls = globalThis[CARD_OPACITY_KEY]?.register?.({
				id: 'selection',
				group: 'selection-production',
				element: card,
				hint: card.querySelector('.cattail-world-editor-card-opacity-hint'),
				priority: 47,
				getText(state) {
					return {
						instruction: i18n.t(game, 'cardOpacityControls'),
						mode: i18n.t(game, state.contentIndependent ? 'cardOpacityContentIndependent' : 'cardOpacityContentLinked')
					}
				},
				onChange() {
					refreshContent(game)
				}
			}) || null

			const activeRange = function () {
				const preview = currentSelection?.previewRange
				if (isRange(preview)) return preview
				const selected = currentSelection?.selectedRange
				return isRange(selected) ? selected : null
			}

			const refreshVisibility = function () {
				const hasRange = !!activeRange()
				const interactionVisible = isRange(currentSelection?.previewRange)
				const displayWindow = pinned || temporaryVisible || interactionVisible
				const visible = !!currentRuntime.active && hasRange && displayWindow && !game.halt && !game.splash?.isShown && !vanillaHudHidden && !gameHudHidden
				const immediateHidden = !visible && (
					!currentRuntime.active ||
					!hasRange ||
					!!game.halt ||
					!!game.splash?.isShown ||
					vanillaHudHidden ||
					gameHudHidden ||
					!positionVisible
				)
				if (autoHiding && immediateHidden) clearAutoHideTransition()
				card.dataset.visible = visible ? 'true' : 'false'
				card.dataset.positionVisible = positionVisible ? 'true' : 'false'
				card.dataset.pinned = pinned ? 'true' : 'false'
				card.setAttribute('aria-pressed', pinned ? 'true' : 'false')
				card.setAttribute('aria-hidden', visible && positionVisible && !gameHudHidden ? 'false' : 'true')
			}

			const clearTemporaryTimer = function () {
				if (temporaryTimer === null) return
				const clear = typeof globalThis.clearTimeout === 'function' ? globalThis.clearTimeout : null
				if (clear) clear(temporaryTimer)
				temporaryTimer = null
				temporaryDeadline = 0
			}

			const hideTemporary = function () {
				clearTemporaryTimer()
				temporaryRemaining = 0
				startAutoHideTransition()
			}

			const setAutoHiding = function (active) {
				autoHiding = !!active
				card.dataset.autoHiding = autoHiding ? 'true' : 'false'
				const companion = document.getElementById(SELECTION_PRODUCTION_CARD_ID)
				if (companion) {
					companion.dataset.autoHiding = autoHiding ? 'true' : 'false'
					if (autoHiding) {
						companion.dataset.visible = 'false'
						companion.setAttribute('aria-hidden', 'true')
					}
				}
			}

			const clearAutoHideTransition = function () {
				if (autoHideTimer !== null) {
					globalThis.clearTimeout?.(autoHideTimer)
					autoHideTimer = null
				}
				setAutoHiding(false)
			}

			const startAutoHideTransition = function () {
				clearAutoHideTransition()
				setAutoHiding(true)
				temporaryVisible = false
				refreshVisibility()
				autoHideTimer = globalThis.setTimeout?.(function () {
					autoHideTimer = null
					setAutoHiding(false)
				}, AUTO_HIDE_TRANSITION_MS) ?? null
			}

			const pauseTemporaryTimer = function () {
				if (temporaryTimer !== null && temporaryDeadline > 0) {
					temporaryRemaining = Math.max(0, temporaryDeadline - Date.now())
				}
				clearTemporaryTimer()
			}

			const resumeTemporaryTimer = function () {
				clearTemporaryTimer()
				if (
					!temporaryVisible ||
					pinned ||
					pointerPaused ||
					isRange(currentSelection?.previewRange)
				) {
					return
				}
				if (temporaryRemaining <= 0) {
					hideTemporary()
					return
				}
				const schedule = typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout : null
				if (!schedule) return
				temporaryDeadline = Date.now() + temporaryRemaining
				temporaryTimer = schedule(hideTemporary, temporaryRemaining)
			}

			const restartTemporaryWindow = function () {
				clearTemporaryTimer()
				clearAutoHideTransition()
				temporaryVisible = !!activeRange()
				temporaryRemaining = TEMPORARY_VISIBLE_MS
				refreshVisibility()
				resumeTemporaryTimer()
			}

			const clearTemporaryWindow = function () {
				clearTemporaryTimer()
				clearAutoHideTransition()
				temporaryVisible = false
				temporaryRemaining = TEMPORARY_VISIBLE_MS
				refreshVisibility()
			}

			const syncInputPointerPassThrough = function () {
				let latched = false
				try {
					const interaction = globalThis[INTERACTION_KEY]
					latched = !!interaction?.snapshot?.().wheelLatched
				} catch (error) {
					latched = false
				}
				const previewing = isRange(currentSelection?.previewRange)
				card.dataset.wheelLatched = latched ? 'true' : 'false'
				card.dataset.inputPassThrough = latched || previewing ? 'true' : 'false'
			}

			const refreshContent = function (languageGame) {
				const source = languageGame || game
				opacityControls?.refresh?.()
				const range = activeRange()
				const preview = isRange(currentSelection?.previewRange)
				const moving = preview && currentSelection?.previewKind === 'move'
				const resizing = preview && currentSelection?.previewKind === 'resize'
				const wheel = preview && currentSelection?.previewSource === 'wheel'
				const title = i18n.t(source, resizing ? 'cardResizePreview' : moving ? 'cardMovePreview' : preview ? 'cardPreview' : 'cardSelection')
				setText(card, 'title', title)

				if (!range) {
					setText(card, 'coordinates', 'u —  v —')
					setText(card, 'size-value', '—')
					setText(card, 'u-length-value', '—')
					setText(card, 'v-length-value', '—')
					setText(card, 'tiles-value', '—')
					setText(card, 'occupied-value', '—')
					setText(card, 'empty-value', '—')
					setText(card, 'buildings-value', '—')
					setText(card, 'cubes-value', '—')
					setText(card, 'analysis-status', '')
					setText(card, 'hint', '')
					refreshVisibility()
					return
				}

				setText(card, 'coordinates', 'u ' + range.start[0] + '→' + range.end[0] + '  v ' + range.start[1] + '→' + range.end[1])
				setText(card, 'size-label', i18n.t(source, 'labelSize'))
				setText(card, 'u-length-label', 'U ' + i18n.t(source, 'labelLength'))
				setText(card, 'v-length-label', 'V ' + i18n.t(source, 'labelLength'))
				setText(card, 'tiles-label', i18n.t(source, 'labelTiles'))
				setText(card, 'occupied-label', i18n.t(source, 'labelOccupied'))
				setText(card, 'empty-label', i18n.t(source, 'labelEmpty'))
				setText(card, 'buildings-label', i18n.t(source, 'labelBuildings'))
				setText(card, 'cubes-label', i18n.t(source, 'labelCubes'))
				setText(card, 'size-value', range.width + '×' + range.height)
				setText(card, 'u-length-value', String(range.width))
				setText(card, 'v-length-value', String(range.height))
				setText(card, 'tiles-value', String(range.width * range.height))
				setText(card, 'hint', wheel ? i18n.t(source, 'wheelHint') : resizing ? i18n.t(source, 'resizeHint') : moving ? i18n.t(source, 'moveHint') : preview ? i18n.t(source, 'cancelHint') : '')

				const key = scanKey(range, currentSelection?.plane)
				const matches = currentAnalysis?.key === key
				const status = matches ? currentAnalysis.status : 'scanning'
				const progress = matches ? clamp(Number(currentAnalysis.progress) || 0, 0, 1) : 0
				card.dataset.analysisStatus = status
				card.querySelector('[data-world-editor-progress-fill]').style.width = Math.round(progress * 100) + '%'

				if (status === 'ready') {
					setText(card, 'occupied-value', String(currentAnalysis.occupied))
					setText(card, 'empty-value', String(currentAnalysis.empty))
					setText(card, 'buildings-value', String(currentAnalysis.buildings))
					setText(card, 'cubes-value', String(currentAnalysis.cubes))
					setText(card, 'analysis-status', '')
				} else if (status === 'unavailable') {
					setText(card, 'occupied-value', '—')
					setText(card, 'empty-value', '—')
					setText(card, 'buildings-value', '—')
					setText(card, 'cubes-value', '—')
					setText(card, 'analysis-status', i18n.t(source, 'analysisUnavailable'))
				} else {
					setText(card, 'occupied-value', partialValue(matches ? currentAnalysis.occupied : 0))
					setText(card, 'empty-value', '—')
					setText(card, 'buildings-value', partialValue(matches ? currentAnalysis.buildings : 0))
					setText(card, 'cubes-value', partialValue(matches ? currentAnalysis.cubes : 0))
					setText(card, 'analysis-status', formatProgress(i18n.t(source, 'analysisScanning'), progress))
				}

				card.setAttribute('aria-label', [
					title,
					card.querySelector('[data-world-editor-text="coordinates"]').textContent,
					i18n.t(source, 'labelSize') + ' ' + range.width + '×' + range.height,
					'U ' + i18n.t(source, 'labelLength') + ' ' + range.width,
					'V ' + i18n.t(source, 'labelLength') + ' ' + range.height,
					i18n.t(source, 'labelTiles') + ' ' + range.width * range.height,
					card.querySelector('[data-world-editor-text="analysis-status"]').textContent,
					i18n.t(source, pinned ? 'cardUnpinAction' : 'cardPinAction'),
					i18n.t(source, 'cardOpacityControls'),
					i18n.t(source, opacityControls?.snapshot?.().contentIndependent
						? 'cardOpacityContentIndependent'
						: 'cardOpacityContentLinked')
				].filter(Boolean).join('. '))
				refreshVisibility()
			}

			const syncPosition = function (frameGame) {
				if (frameGame && frameGame !== game) return
				syncInputPointerPassThrough()
				card.dataset.theme = game.plane ? 'void' : 'reality'
				if (typeof api.render.isEnabled === 'function' && !api.render.isEnabled()) {
					positionVisible = false
					refreshVisibility()
					return
				}
				const range = activeRange()
				const bounds = range ? projectRangeBounds(game, range) : null
				if (!bounds) {
					positionVisible = false
					refreshVisibility()
					return
				}

				const viewportWidth = finiteOr(window.innerWidth, document.documentElement?.clientWidth || 0)
				const viewportHeight = finiteOr(window.innerHeight, document.documentElement?.clientHeight || 0)
				if (
					viewportWidth <= 0 ||
					viewportHeight <= 0 ||
					bounds.maxX < 0 ||
					bounds.minX > viewportWidth ||
					bounds.maxY < 0 ||
					bounds.minY > viewportHeight
				) {
					positionVisible = false
					refreshVisibility()
					return
				}

				const margin = 10
				const gap = 28
				const cardRect = card.getBoundingClientRect()
				const cardWidth = finitePositive(cardRect.width, finitePositive(card.offsetWidth, 288))
				const cardHeight = finitePositive(cardRect.height, finitePositive(card.offsetHeight, 178))
				const centerX = (bounds.minX + bounds.maxX) / 2
				const centerY = (bounds.minY + bounds.maxY) / 2
				const candidates = [
					{ left: bounds.maxX + gap, top: centerY - cardHeight / 2, width: cardWidth, height: cardHeight, placement: 'right' },
					{ left: bounds.minX - gap - cardWidth, top: centerY - cardHeight / 2, width: cardWidth, height: cardHeight, placement: 'left' },
					{ left: centerX - cardWidth / 2, top: bounds.maxY + gap, width: cardWidth, height: cardHeight, placement: 'below' },
					{ left: centerX - cardWidth / 2, top: bounds.minY - gap - cardHeight, width: cardWidth, height: cardHeight, placement: 'above' }
				]
				const occupiedRects = [
					shared.visibleCardRect(document.getElementById(BLUEPRINT_CARD_ID)),
					shared.visibleCardRect(document.getElementById(BLUEPRINT_PRODUCTION_CARD_ID))
				].filter(Boolean)
				const fitting = candidates.filter(function (candidate) {
					return shared.cardCandidateFits(candidate, {
						margin,
						viewportWidth,
						viewportHeight
					})
				})
				const chosen = fitting.find(function (candidate) {
					return occupiedRects.every(function (rect) {
						return !shared.rectanglesOverlap(candidate, rect, 8)
					})
				}) || (fitting.length ? fitting : candidates).slice().sort(function (left, right) {
					return candidatePenalty(left, occupiedRects, bounds, shared) -
						candidatePenalty(right, occupiedRects, bounds, shared)
				})[0]
				const left = clamp(chosen.left, margin, Math.max(margin, viewportWidth - margin - cardWidth))
				const top = clamp(chosen.top, margin, Math.max(margin, viewportHeight - margin - cardHeight))

				card.style.left = left + 'px'
				card.style.top = top + 'px'
				card.dataset.placement = chosen.placement
				positionVisible = true
				refreshVisibility()
			}

			const stopRuntimeSubscription = runtime.subscribe(function (state) {
				currentRuntime = state
				if (!state?.active) clearAutoHideTransition()
				refreshVisibility()
			})
			const stopSelectionSubscription = selection.subscribe(function (state) {
				currentSelection = state
				if (activeRange()) restartTemporaryWindow()
				else clearTemporaryWindow()
				refreshContent(game)
				syncPosition(game)
			})
			const stopAnalysisSubscription = analysis.subscribe(function (state) {
				currentAnalysis = state
				refreshContent(game)
			})
			const stopRenderFrame = api.render.onFrame(function (context) {
				syncPosition(context?.game || game)
			})

			const handleGameHud = function (event) {
				if (event?.detail?.game && event.detail.game !== game) return
				gameHudHidden = !!event?.detail?.hidden
				if (gameHudHidden) clearAutoHideTransition()
				refreshVisibility()
			}
			const handleVanillaGameHud = function (event) {
				if (event?.detail?.game && event.detail.game !== game) return
				vanillaHudHidden = !!event?.detail?.hidden
				if (vanillaHudHidden) clearAutoHideTransition()
				refreshVisibility()
			}
			const handleCardMouseEnter = function () {
				pointerPaused = true
				pauseTemporaryTimer()
			}
			const handleCardMouseLeave = function () {
				pointerPaused = false
				resumeTemporaryTimer()
			}
			const togglePinned = function (event) {
				if (shared.isCardControlEvent(event)) return
				event?.preventDefault?.()
				event?.stopPropagation?.()
				event?.stopImmediatePropagation?.()
				pinned = !pinned
				if (pinned) pauseTemporaryTimer()
				else restartTemporaryWindow()
				refreshContent(game)
				refreshVisibility()
			}
			const handleCardKeydown = function (event) {
				if (event?.key !== 'Enter' && event?.key !== ' ') return
				togglePinned(event)
			}
			const stopCardPointerDown = function (event) {
				event?.stopPropagation?.()
				event?.stopImmediatePropagation?.()
			}
			window.addEventListener('modloader:game-hud', handleGameHud)
			window.addEventListener('modloader:vanilla-game-hud', handleVanillaGameHud)
			card.addEventListener('mouseenter', handleCardMouseEnter)
			card.addEventListener('mouseleave', handleCardMouseLeave)
			card.addEventListener('mousedown', stopCardPointerDown)
			card.addEventListener('click', togglePinned)
			card.addEventListener('keydown', handleCardKeydown)
			const renderAvailabilityTimer = window.setInterval(function () {
				if (typeof api.render.isEnabled === 'function' && !api.render.isEnabled()) {
					positionVisible = false
					refreshVisibility()
				}
			}, 250)
			const releaseHud = api.ui.hud.register({
				id: 'world-editor-selection-card',
				element: card,
				side: 'top'
			})

			refreshMountedText = refreshContent
			refreshContent(game)
			syncPosition(game)

			runtime.addCleanup(function () {
				if (refreshMountedText === refreshContent) refreshMountedText = null
				window.removeEventListener('modloader:game-hud', handleGameHud)
				window.removeEventListener('modloader:vanilla-game-hud', handleVanillaGameHud)
				card.removeEventListener('mouseenter', handleCardMouseEnter)
				card.removeEventListener('mouseleave', handleCardMouseLeave)
				card.removeEventListener('mousedown', stopCardPointerDown)
				card.removeEventListener('click', togglePinned)
				card.removeEventListener('keydown', handleCardKeydown)
				window.clearInterval(renderAvailabilityTimer)
				clearTemporaryTimer()
				clearAutoHideTransition()
				if (typeof stopRuntimeSubscription === 'function') stopRuntimeSubscription()
				if (typeof stopSelectionSubscription === 'function') stopSelectionSubscription()
				if (typeof stopAnalysisSubscription === 'function') stopAnalysisSubscription()
				if (typeof stopRenderFrame === 'function') stopRenderFrame()
				opacityControls?.release?.()
				opacityControls = null
				worldDragControls?.release?.()
				if (typeof releaseHud === 'function') releaseHud()
				card.remove()
				if (style.isConnected && !document.getElementById(CARD_ID)) style.remove()
			})

			console.info('[Cattail World Editor] Selection card lock 2F ready.')
		})

		function createCard() {
			const card = document.createElement('div')
			card.id = CARD_ID
			card.className = 'cattail-world-editor-selection-card'
			card.dataset.visible = 'false'
			card.dataset.positionVisible = 'false'
			card.dataset.theme = 'reality'
			card.dataset.analysisStatus = 'scanning'
			card.dataset.pinned = 'false'
			card.dataset.worldEditorPinnable = 'true'
			card.dataset.worldEditorScrollbar = ''
			card.dataset.wheelLatched = 'false'
			card.dataset.inputPassThrough = 'false'
			card.dataset.autoHiding = 'false'
			card.setAttribute('role', 'button')
			card.setAttribute('tabindex', '0')
			card.setAttribute('aria-pressed', 'false')
			card.setAttribute('aria-live', 'polite')
			card.setAttribute('aria-atomic', 'true')
			card.setAttribute('aria-hidden', 'true')

			const header = document.createElement('div')
			header.className = 'cattail-world-editor-selection-card__header'
			const title = textElement('span', 'cattail-world-editor-selection-card__title', 'title')
			const coordinates = textElement('span', 'cattail-world-editor-selection-card__coordinates', 'coordinates')
			const headerMeta = document.createElement('span')
			headerMeta.className = 'cattail-world-editor-selection-card__header-meta'
			const opacityHint = document.createElement('span')
			opacityHint.className = 'cattail-world-editor-card-opacity-hint'
			opacityHint.setAttribute('role', 'img')
			headerMeta.append(coordinates, opacityHint)
			header.append(title, headerMeta)

			const metrics = document.createElement('div')
			metrics.className = 'cattail-world-editor-selection-card__metrics'
			for (const key of ['size', 'u-length', 'v-length', 'tiles', 'occupied', 'empty', 'buildings', 'cubes']) {
				const metric = document.createElement('div')
				metric.className = 'cattail-world-editor-selection-card__metric'
				metric.append(
					textElement('span', 'cattail-world-editor-selection-card__metric-label', key + '-label'),
					textElement('span', 'cattail-world-editor-selection-card__metric-value', key + '-value')
				)
				metrics.append(metric)
			}

			const progress = document.createElement('div')
			progress.className = 'cattail-world-editor-selection-card__progress'
			const progressFill = document.createElement('span')
			progressFill.dataset.worldEditorProgressFill = ''
			progress.append(progressFill)
			const analysisStatus = textElement('div', 'cattail-world-editor-selection-card__analysis-status', 'analysis-status')
			const hint = textElement('div', 'cattail-world-editor-selection-card__hint', 'hint')
			card.append(header, metrics, progress, analysisStatus, hint)
			return card
		}

		function textElement(tag, className, key) {
			const element = document.createElement(tag)
			element.className = className
			element.dataset.worldEditorText = key
			return element
		}

		function setText(root, key, value) {
			const element = root.querySelector('[data-world-editor-text="' + key + '"]')
			if (element) element.textContent = String(value ?? '')
		}

		function ensureStyle() {
			const existing = document.getElementById(STYLE_ID)
			if (existing) return existing
			const style = document.createElement('style')
			style.id = STYLE_ID
			style.textContent = `
				.cattail-world-editor-selection-card {
					--world-editor-card-opacity: 1;
					--world-editor-card-shell-opacity: 1;
					--world-editor-card-shell-percent: 100%;
					--world-editor-card-shell-blur-12: 12px;
					--world-editor-card-shell-saturate: 1.1;
					--world-editor-card-base-shadow: rgba(0, 0, 0, .18);
					--world-editor-card-pinned-base-shadow: rgba(0, 0, 0, .20);
					--world-editor-card-bg: color-mix(in srgb, rgba(248, 248, 246, .92) var(--world-editor-card-shell-percent), transparent);
					--world-editor-card-text: rgba(18, 20, 22, .94);
					--world-editor-card-muted: rgba(18, 20, 22, .58);
					--world-editor-card-border: color-mix(in srgb, rgba(92, 65, 132, .22) var(--world-editor-card-shell-percent), transparent);
					--world-editor-card-accent: color-mix(in srgb, rgba(170, 137, 220, .92) var(--world-editor-card-shell-percent), transparent);
					--world-editor-card-track: color-mix(in srgb, rgba(92, 65, 132, .12) var(--world-editor-card-shell-percent), transparent);
					position: fixed;
					z-index: 47;
					width: min(clamp(230px, 28vw, 320px), calc(100vw - 20px));
					max-height: min(68vh, calc(100vh - 20px));
					box-sizing: border-box;
					padding: 10px 11px 9px;
					overflow-x: hidden;
					overflow-y: auto;
					overscroll-behavior: contain;
					border: 1px solid var(--world-editor-card-border);
					border-radius: 8px;
					background: var(--world-editor-card-bg);
					box-shadow: 0 10px 28px color-mix(in srgb, var(--world-editor-card-base-shadow) var(--world-editor-card-shell-percent), transparent);
					backdrop-filter: blur(var(--world-editor-card-shell-blur-12)) saturate(var(--world-editor-card-shell-saturate));
					-webkit-backdrop-filter: blur(var(--world-editor-card-shell-blur-12)) saturate(var(--world-editor-card-shell-saturate));
					color: var(--world-editor-card-text);
					font: 400 12px/1.35 Montserrat, Arial, sans-serif;
					-webkit-font-smoothing: antialiased;
					visibility: hidden;
					opacity: 0;
					transform: translateY(4px);
					pointer-events: none;
					cursor: pointer;
					transition: opacity .16s ease-out, transform .16s ease-out, visibility 0s linear .16s, border-color .16s ease, box-shadow .16s ease;
				}
				.cattail-world-editor-selection-card[data-theme="void"] {
					--world-editor-card-bg: color-mix(in srgb, rgba(8, 10, 12, .92) var(--world-editor-card-shell-percent), transparent);
					--world-editor-card-text: rgba(255, 255, 255, .92);
					--world-editor-card-muted: rgba(255, 255, 255, .62);
					--world-editor-card-border: color-mix(in srgb, rgba(210, 188, 250, .24) var(--world-editor-card-shell-percent), transparent);
					--world-editor-card-accent: color-mix(in srgb, rgba(211, 190, 250, .94) var(--world-editor-card-shell-percent), transparent);
					--world-editor-card-track: color-mix(in srgb, rgba(211, 190, 250, .14) var(--world-editor-card-shell-percent), transparent);
					--world-editor-card-base-shadow: rgba(0, 0, 0, .36);
					--world-editor-card-pinned-base-shadow: rgba(0, 0, 0, .38);
				}
				.cattail-world-editor-selection-card[data-visible="true"][data-position-visible="true"] {
					visibility: visible;
					opacity: var(--world-editor-card-opacity);
					transform: translateY(0);
					pointer-events: auto;
					transition-delay: 0s;
				}
				.cattail-world-editor-selection-card[data-visible="true"][data-position-visible="true"][data-opacity-content-independent="true"] {
					opacity: 1;
				}
				.cattail-world-editor-selection-card[data-visible="false"][data-auto-hiding="false"],
				.cattail-world-editor-selection-card[data-position-visible="false"][data-auto-hiding="false"] {
					transition: none;
				}
				.cattail-world-editor-selection-card[data-visible="false"][data-auto-hiding="true"] {
					visibility: visible;
					opacity: 0;
					transform: translateY(4px);
					pointer-events: none;
					transition: opacity .16s ease-out, transform .16s ease-out;
				}
				.cattail-world-editor-selection-card[data-visible="true"][data-position-visible="true"][data-input-pass-through="true"] {
					pointer-events: none;
				}
				.cattail-world-editor-selection-card[data-placement="above"] {
					transform: translateY(-4px);
				}
				.cattail-world-editor-selection-card[data-visible="true"][data-position-visible="true"][data-placement="above"] {
					transform: translateY(0);
				}
				.cattail-world-editor-selection-card__header {
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 12px;
					margin-bottom: 8px;
				}
				.cattail-world-editor-selection-card__header-meta {
					display: inline-flex;
					align-items: center;
					flex: 0 1 auto;
					min-width: 0;
					gap: 6px;
				}
				.cattail-world-editor-selection-card__title {
					font-size: 14px;
					font-weight: 700;
				}
				.cattail-world-editor-selection-card__coordinates {
					color: var(--world-editor-card-muted);
					font-size: 11px;
					font-variant-numeric: tabular-nums;
					white-space: nowrap;
				}
				.cattail-world-editor-selection-card__metrics {
					display: grid;
					grid-template-columns: repeat(3, minmax(0, 1fr));
					gap: 6px;
				}
				.cattail-world-editor-selection-card__metric {
					min-width: 0;
					padding: 5px 6px;
					border-radius: 5px;
					background: var(--world-editor-card-track);
				}
				.cattail-world-editor-selection-card__metric-label,
				.cattail-world-editor-selection-card__metric-value {
					display: block;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}
				.cattail-world-editor-selection-card__metric-label {
					color: var(--world-editor-card-muted);
					font-size: 10px;
				}
				.cattail-world-editor-selection-card__metric-value {
					margin-top: 1px;
					font-size: 13px;
					font-variant-numeric: tabular-nums;
					font-weight: 700;
				}
				.cattail-world-editor-selection-card__progress {
					height: 2px;
					margin-top: 8px;
					overflow: hidden;
					border-radius: 999px;
					background: var(--world-editor-card-track);
				}
				.cattail-world-editor-selection-card__progress span {
					display: block;
					width: 0;
					height: 100%;
					border-radius: inherit;
					background: var(--world-editor-card-accent);
					transition: width .08s linear;
				}
				.cattail-world-editor-selection-card[data-analysis-status="ready"] .cattail-world-editor-selection-card__progress,
				.cattail-world-editor-selection-card[data-analysis-status="unavailable"] .cattail-world-editor-selection-card__progress {
					display: none;
				}
				.cattail-world-editor-selection-card__analysis-status,
				.cattail-world-editor-selection-card__hint {
					margin-top: 6px;
					color: var(--world-editor-card-muted);
					font-size: 10px;
					text-align: center;
				}
				.cattail-world-editor-selection-card__analysis-status:empty,
				.cattail-world-editor-selection-card__hint:empty {
					display: none;
				}
			`
			document.head.append(style)
			return style
		}

		function projectRangeBounds(game, range) {
			if (!game?.canvas || typeof game.uvToXY !== 'function') return null
			const uvCorners = [
				[range.minU - .5, range.minV - .5],
				[range.maxU + .5, range.minV - .5],
				[range.maxU + .5, range.maxV + .5],
				[range.minU - .5, range.maxV + .5]
			]
			const canvasRect = typeof game.canvas.getBoundingClientRect === 'function'
				? game.canvas.getBoundingClientRect()
				: { left: 0, top: 0, width: 0, height: 0 }
			const internalWidth = finitePositive(game.canvas.width, finitePositive(game.w, 0))
			const internalHeight = finitePositive(game.canvas.height, finitePositive(game.h, 0))
			const pixelRatio = Math.max(1, finiteOr(game.pixelRatio, finiteOr(globalThis.devicePixelRatio, 1)))
			const scaleX = finitePositive(canvasRect.width, 0) && internalWidth
				? canvasRect.width / internalWidth
				: 1 / pixelRatio
			const scaleY = finitePositive(canvasRect.height, 0) && internalHeight
				? canvasRect.height / internalHeight
				: 1 / pixelRatio
			const offsetX = finiteOr(game.w2, internalWidth / 2)
			const offsetY = finiteOr(game.h2, internalHeight / 2)
			const points = []

			try {
				for (const uv of uvCorners) {
					const projected = game.uvToXY(uv)
					if (!isPoint(projected)) return null
					points.push([
						finiteOr(canvasRect.left, 0) + (offsetX + Number(projected[0])) * scaleX,
						finiteOr(canvasRect.top, 0) + (offsetY + Number(projected[1])) * scaleY
					])
				}
			} catch (error) {
				return null
			}

			return {
				minX: Math.min(...points.map(point => point[0])),
				maxX: Math.max(...points.map(point => point[0])),
				minY: Math.min(...points.map(point => point[1])),
				maxY: Math.max(...points.map(point => point[1]))
			}
		}

		function candidatePenalty(candidate, occupiedRects, bounds, shared) {
			const previewRect = {
				left: bounds.minX,
				top: bounds.minY,
				width: Math.max(0, bounds.maxX - bounds.minX),
				height: Math.max(0, bounds.maxY - bounds.minY)
			}
			let penalty = shared.rectangleOverlapArea(candidate, previewRect) * 2
			for (const rect of occupiedRects) penalty += shared.rectangleOverlapArea(candidate, rect) * 4
			return penalty
		}

		function scanKey(range, plane) {
			return [
				plane ? 1 : 0,
				range.minU,
				range.maxU,
				range.minV,
				range.maxV
			].join(':')
		}

		function partialValue(value) {
			const number = Number(value)
			return '≥' + (Number.isFinite(number) ? number : 0)
		}

		function formatProgress(template, progress) {
			return String(template || '').replace(/\{progress\}/g, String(Math.round(clamp(progress, 0, 1) * 100)))
		}

		function isRange(value) {
			return !!(
				value &&
				Array.isArray(value.start) &&
				Array.isArray(value.end) &&
				value.start.length >= 2 &&
				value.end.length >= 2 &&
				Number.isInteger(Number(value.minU)) &&
				Number.isInteger(Number(value.maxU)) &&
				Number.isInteger(Number(value.minV)) &&
				Number.isInteger(Number(value.maxV)) &&
				Number.isInteger(Number(value.width)) &&
				Number.isInteger(Number(value.height)) &&
				Number(value.width) > 0 &&
				Number(value.height) > 0
			)
		}

		function isPoint(value) {
			return Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))
		}

		function finiteOr(value, fallback) {
			const number = Number(value)
			return Number.isFinite(number) ? number : fallback
		}

		function finitePositive(value, fallback) {
			const number = Number(value)
			return Number.isFinite(number) && number > 0 ? number : fallback
		}

		function clamp(value, min, max) {
			return Math.min(max, Math.max(min, value))
		}
	}
})
