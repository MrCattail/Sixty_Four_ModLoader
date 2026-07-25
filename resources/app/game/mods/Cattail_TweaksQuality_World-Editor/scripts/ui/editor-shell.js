ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const TOOL_KEY = Symbol.for('cattail.world-editor.tool')
		const SHELL_ID = 'cattail-world-editor-shell'
		const STYLE_ID = 'cattail-world-editor-shell-style'
		const UI_SCALE_BASE_WIDTH = 1600
		const UI_SCALE_BASE_HEIGHT = 1000
		const UI_SCALE_MIN = .5
		let refreshMountedText = null
		let refreshMountedTheme = null

		api.on('afterVanillaScripts', function () {
			if (typeof Game === 'undefined' || !Game.prototype || typeof Game.prototype.switchPlane !== 'function') return
			api.patch(Game.prototype, 'switchPlane', function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					if (typeof refreshMountedTheme === 'function') refreshMountedTheme(this)
					return result
				}
			})
		})

		api.on('afterWords', function (words, game) {
			if (typeof refreshMountedText === 'function') refreshMountedText(game)
		})

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const i18n = globalThis[I18N_KEY]
			const selection = globalThis[SELECTION_KEY]
			const tool = globalThis[TOOL_KEY]
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Toolbar 2G could not find the editor runtime.')
				return
			}
			if (!i18n || typeof i18n.t !== 'function') {
				console.warn('[Cattail World Editor] Toolbar 2G could not find the editor translations.')
				return
			}
			if (
				!selection ||
				selection.game !== game ||
				typeof selection.subscribe !== 'function'
			) {
				console.warn('[Cattail World Editor] Toolbar 2G could not find the selection state.')
				return
			}
			if (!tool || typeof tool.subscribe !== 'function' || typeof tool.setMode !== 'function') {
				console.warn('[Cattail World Editor] Toolbar 2E could not find the tool state.')
				return
			}
			if (!api.ui?.hud || typeof api.ui.hud.register !== 'function') {
				console.warn('[Cattail World Editor] Toolbar 2E requires the ModLoader game HUD API.')
				return
			}

			document.getElementById(SHELL_ID)?.remove()
			const style = ensureStyle()
			const shell = createShell()
			document.body.append(shell)
			const rootStyle = document.documentElement?.style
			const previousScale = readStyleProperty(rootStyle, '--world-editor-ui-scale')
			const previousToolbarWidth = readStyleProperty(rootStyle, '--world-editor-toolbar-layout-width')

			let currentState = runtime.snapshot()
			let currentSelection = selection.snapshot()
			let currentTool = tool.snapshot()
			let gameHudHidden = api.ui.hud.isHidden()
			let vanillaHudHidden = api.ui.isVanillaGameHudHidden(game)
			const selectButton = shell.querySelector('[data-world-editor-action="select"]')
			const removeButton = shell.querySelector('[data-world-editor-action="remove-selection"]')
			const accessibleText = {
				brand: '',
				mode: '',
				count: '',
				remove: '',
				exitHint: ''
			}

			const refreshAccessibility = function () {
				shell.setAttribute('aria-label', [
					accessibleText.brand,
					accessibleText.mode,
					accessibleText.count,
					accessibleText.remove,
					accessibleText.exitHint
				].filter(Boolean).join('. ') + '.')
			}

			const refreshText = function (languageGame) {
				const source = languageGame || game
				const brand = i18n.t(source, 'brand')
				shell.querySelector('[data-world-editor-text="brand"]').textContent = brand
				shell.querySelector('[data-world-editor-text="tool-select"]').textContent = i18n.t(source, 'toolSelect')
				const removeText = i18n.t(source, 'removeSelection')
				removeButton.title = removeText
				removeButton.setAttribute('aria-label', removeText)
				accessibleText.brand = brand
				accessibleText.remove = removeText
				refreshTool(source)
				refreshHint(source)
				refreshSelectionCount(source)
				refreshAccessibility()
			}

			const refreshTool = function (languageGame) {
				const source = languageGame || game
				const mode = i18n.t(source, 'toolbarModeArea')
				shell.dataset.mode = 'select'
				shell.querySelector('[data-world-editor-text="mode"]').textContent = mode
				selectButton.setAttribute('aria-pressed', 'true')
				selectButton.dataset.active = 'true'
				accessibleText.mode = mode
				refreshAccessibility()
			}

			const refreshHint = function (languageGame) {
				const source = languageGame || game
				const hint = i18n.t(source, 'exitHint')
				shell.querySelector('[data-world-editor-text="hint"]').textContent = hint
				accessibleText.exitHint = hint
				refreshAccessibility()
			}

			const refreshSelectionCount = function (languageGame) {
				const source = languageGame || game
				const count = Number.isInteger(Number(currentSelection?.selectionCount))
					? Math.max(0, Number(currentSelection.selectionCount))
					: isRange(currentSelection?.previewRange) || isRange(currentSelection?.selectedRange) ? 1 : 0
				const countText = formatCount(i18n.t(source, 'selectionCount'), count)
				shell.querySelector('[data-world-editor-text="selection-count"]').textContent = countText
				removeButton.disabled = (
					typeof selection.removePrimary !== 'function' ||
					!Number.isInteger(currentSelection?.primaryId) ||
					isRange(currentSelection?.previewRange)
				)
				accessibleText.count = countText
				refreshAccessibility()
			}

			const refreshTheme = function (themeGame) {
				if (themeGame && themeGame !== game) return
				shell.dataset.theme = game.plane ? 'void' : 'reality'
			}

			const refreshVisibility = function () {
				const editorVisible = !!currentState.active && !game.halt && !game.splash?.isShown && !vanillaHudHidden
				shell.dataset.visible = editorVisible ? 'true' : 'false'
				shell.setAttribute('aria-hidden', editorVisible && !gameHudHidden ? 'false' : 'true')
			}

			const refreshUiScale = function () {
				const viewport = responsiveViewport(game)
				const viewportWidth = viewport.width
				const viewportHeight = viewport.height
				const scale = Math.min(
					1,
					Math.max(
						UI_SCALE_MIN,
						Math.min(viewportWidth / UI_SCALE_BASE_WIDTH, viewportHeight / UI_SCALE_BASE_HEIGHT)
					)
				)
				const roundedScale = Math.round(scale * 1000) / 1000
				writeStyleProperty(rootStyle, '--world-editor-ui-scale', String(roundedScale))
				writeStyleProperty(
					rootStyle,
					'--world-editor-toolbar-layout-width',
					Math.max(0, (viewportWidth - 24) / scale) + 'px'
				)
				shell.dataset.uiScale = String(roundedScale)
			}

			const stopStateSubscription = runtime.subscribe(function (state) {
				currentState = state
				refreshVisibility()
			})

			const stopSelectionSubscription = selection.subscribe(function (state) {
				currentSelection = state
				refreshSelectionCount(game)
				refreshTool(game)
			})

			const stopToolSubscription = tool.subscribe(function (state) {
				currentTool = state
				refreshTool(game)
			})

			const handleSelectClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				if (selection.hasPreview()) selection.cancelPreview('toolbar-select')
				tool.setMode('select', 'toolbar-select')
			}

			const handleRemoveClick = function (event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				if (selection.hasPreview()) return
				if (typeof selection.removePrimary === 'function') {
					selection.removePrimary('toolbar-remove-primary')
				}
			}

			selectButton.addEventListener('click', handleSelectClick)
			removeButton.addEventListener('click', handleRemoveClick)

			const handleGameHud = function (event) {
				if (event?.detail?.game && event.detail.game !== game) return
				gameHudHidden = !!event?.detail?.hidden
				refreshVisibility()
			}

			const handleVanillaGameHud = function (event) {
				if (event?.detail?.game && event.detail.game !== game) return
				vanillaHudHidden = !!event?.detail?.hidden
				refreshVisibility()
			}

			window.addEventListener('modloader:game-hud', handleGameHud)
			window.addEventListener('modloader:vanilla-game-hud', handleVanillaGameHud)
			window.addEventListener('resize', refreshUiScale)
			const uiScaleObserver = createUiScaleObserver(game, refreshUiScale)
			const releaseHud = api.ui.hud.register({
				id: 'world-editor-shell',
				element: shell,
				side: 'top'
			})

			refreshMountedText = refreshText
			refreshMountedTheme = refreshTheme
			refreshText(game)
			refreshSelectionCount(game)
			refreshTheme(game)
			refreshUiScale()
			refreshVisibility()

			runtime.addCleanup(function () {
				if (refreshMountedText === refreshText) refreshMountedText = null
				if (refreshMountedTheme === refreshTheme) refreshMountedTheme = null
				window.removeEventListener('modloader:game-hud', handleGameHud)
				window.removeEventListener('modloader:vanilla-game-hud', handleVanillaGameHud)
				window.removeEventListener('resize', refreshUiScale)
				uiScaleObserver?.disconnect?.()
				if (typeof stopStateSubscription === 'function') stopStateSubscription()
				if (typeof stopSelectionSubscription === 'function') stopSelectionSubscription()
				if (typeof stopToolSubscription === 'function') stopToolSubscription()
				selectButton.removeEventListener('click', handleSelectClick)
				removeButton.removeEventListener('click', handleRemoveClick)
				if (typeof releaseHud === 'function') releaseHud()
				writeStyleProperty(rootStyle, '--world-editor-ui-scale', previousScale)
				writeStyleProperty(rootStyle, '--world-editor-toolbar-layout-width', previousToolbarWidth)
				shell.remove()
				if (style.isConnected && !document.getElementById(SHELL_ID)) style.remove()
			})

			console.info('[Cattail World Editor] Unified toolbar 2G ready.')
		})

		function createShell() {
			const shell = document.createElement('div')
			shell.id = SHELL_ID
			shell.className = 'cattail-world-editor-shell'
			shell.dataset.visible = 'false'
			shell.dataset.theme = 'reality'
			shell.dataset.mode = 'select'
			shell.setAttribute('role', 'toolbar')
			shell.setAttribute('aria-hidden', 'true')

			const bar = document.createElement('div')
			bar.className = 'cattail-world-editor-shell__bar'

			const identity = document.createElement('span')
			identity.className = 'cattail-world-editor-shell__identity'
			const dot = document.createElement('span')
			dot.className = 'cattail-world-editor-shell__dot'
			dot.setAttribute('aria-hidden', 'true')
			const brand = document.createElement('span')
			brand.className = 'cattail-world-editor-shell__brand'
			brand.dataset.worldEditorText = 'brand'
			identity.append(dot, brand)

			const divider = document.createElement('span')
			divider.className = 'cattail-world-editor-shell__divider'
			divider.setAttribute('aria-hidden', 'true')

			const mode = document.createElement('span')
			mode.className = 'cattail-world-editor-shell__mode'
			mode.dataset.worldEditorText = 'mode'

			const count = document.createElement('span')
			count.className = 'cattail-world-editor-shell__count'
			count.dataset.worldEditorText = 'selection-count'

			const status = document.createElement('span')
			status.className = 'cattail-world-editor-shell__status'
			status.append(mode, count)

			const actions = document.createElement('span')
			actions.className = 'cattail-world-editor-shell__actions'
			actions.dataset.worldEditorSlot = 'actions'
			const selectButton = createToolButton('select', 'tool-select')
			const removeButton = createIconButton('remove-selection', '×')
			actions.append(selectButton, removeButton)

			const hint = document.createElement('span')
			hint.className = 'cattail-world-editor-shell__hint'
			hint.dataset.worldEditorText = 'hint'

			bar.append(identity, divider, status, actions, hint)
			shell.append(bar)
			return shell
		}

		function createToolButton(action, textKey) {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = 'cattail-world-editor-shell__tool'
			button.dataset.worldEditorAction = action
			button.dataset.active = action === 'select' ? 'true' : 'false'
			button.setAttribute('aria-pressed', action === 'select' ? 'true' : 'false')
			const label = document.createElement('span')
			label.dataset.worldEditorText = textKey
			button.append(label)
			return button
		}

		function createIconButton(action, symbol) {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = 'cattail-world-editor-shell__tool cattail-world-editor-shell__tool--icon'
			button.dataset.worldEditorAction = action
			button.disabled = true
			const icon = document.createElement('span')
			icon.setAttribute('aria-hidden', 'true')
			icon.textContent = symbol
			button.append(icon)
			return button
		}

		function ensureStyle() {
			const existing = document.getElementById(STYLE_ID)
			if (existing) return existing

			const style = document.createElement('style')
			style.id = STYLE_ID
			style.textContent = `
				.cattail-world-editor-shell {
					--world-editor-shell-bg: rgba(248, 248, 246, .88);
					--world-editor-shell-text: rgba(18, 20, 22, .94);
					--world-editor-shell-muted: rgba(18, 20, 22, .58);
					--world-editor-shell-border: rgba(0, 0, 0, .12);
					--world-editor-shell-dot: rgba(18, 20, 22, .82);
					--world-editor-shell-chip: rgba(18, 20, 22, .07);
					--world-editor-shell-active: rgba(113, 79, 163, .16);
					--world-editor-shell-active-border: rgba(113, 79, 163, .34);
					--world-editor-shell-shadow: 0 12px 36px rgba(0, 0, 0, .18);
					position: fixed;
					top: max(12px, env(safe-area-inset-top));
					left: 0;
					right: 0;
					z-index: 48;
					display: flex;
					justify-content: center;
					box-sizing: border-box;
					padding: 0 12px;
					visibility: hidden;
					opacity: 0;
					transform: translateY(-8px);
					pointer-events: none;
					transition: opacity .16s ease, transform .16s ease, visibility 0s linear .16s;
				}
				.cattail-world-editor-shell[data-theme="void"] {
					--world-editor-shell-bg: rgba(8, 10, 12, .88);
					--world-editor-shell-text: rgba(255, 255, 255, .92);
					--world-editor-shell-muted: rgba(255, 255, 255, .62);
					--world-editor-shell-border: rgba(255, 255, 255, .14);
					--world-editor-shell-dot: rgba(242, 242, 237, .94);
					--world-editor-shell-chip: rgba(255, 255, 255, .09);
					--world-editor-shell-active: rgba(210, 188, 250, .16);
					--world-editor-shell-active-border: rgba(210, 188, 250, .34);
					--world-editor-shell-shadow: 0 12px 36px rgba(0, 0, 0, .35);
				}
				.cattail-world-editor-shell[data-visible="true"] {
					visibility: visible;
					opacity: 1;
					transform: translateY(0);
					transition-delay: 0s;
				}
				.cattail-world-editor-shell__bar {
					display: flex;
					align-items: center;
					flex-wrap: wrap;
					gap: 14px;
					max-width: var(--world-editor-toolbar-layout-width, calc(100vw - 24px));
					min-height: 54px;
					box-sizing: border-box;
					padding: 10px 16px;
					border: 1px solid var(--world-editor-shell-border);
					border-radius: 8px;
					background: var(--world-editor-shell-bg);
					box-shadow: var(--world-editor-shell-shadow);
					backdrop-filter: blur(14px) saturate(1.12);
					-webkit-backdrop-filter: blur(14px) saturate(1.12);
					color: var(--world-editor-shell-text);
					font: 400 14px/1.4 Montserrat, Arial, sans-serif;
					-webkit-font-smoothing: antialiased;
					white-space: nowrap;
					transform: scale(var(--world-editor-ui-scale, 1));
					transform-origin: top center;
					transition: background .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease;
				}
				.cattail-world-editor-shell__identity {
					display: inline-flex;
					align-items: center;
					gap: 8px;
					min-width: 0;
				}
				.cattail-world-editor-shell__dot {
					width: 8px;
					height: 8px;
					flex: 0 0 auto;
					border-radius: 50%;
					background: var(--world-editor-shell-dot);
				}
				.cattail-world-editor-shell__brand {
					overflow: hidden;
					text-overflow: ellipsis;
					font-weight: 600;
				}
				.cattail-world-editor-shell__divider {
					width: 1px;
					height: 20px;
					background: var(--world-editor-shell-border);
				}
				.cattail-world-editor-shell__mode {
					color: var(--world-editor-shell-text);
					font-size: 18px;
					font-weight: 600;
				}
				.cattail-world-editor-shell__status {
					display: inline-flex;
					align-items: center;
					gap: 10px;
				}
				.cattail-world-editor-shell__count {
					padding: 4px 8px;
					border: 1px solid var(--world-editor-shell-border);
					border-radius: 999px;
					background: var(--world-editor-shell-chip);
					color: var(--world-editor-shell-muted);
					font-size: 12px;
					font-variant-numeric: tabular-nums;
					font-weight: 600;
				}
				.cattail-world-editor-shell__actions {
					display: inline-flex;
					align-items: center;
					flex-wrap: wrap;
					gap: 6px;
					pointer-events: auto;
				}
				.cattail-world-editor-shell__tool {
					min-height: 30px;
					box-sizing: border-box;
					padding: 5px 10px;
					border: 1px solid var(--world-editor-shell-border);
					border-radius: 6px;
					background: var(--world-editor-shell-chip);
					color: var(--world-editor-shell-muted);
					font: 600 12px/1.2 Montserrat, Arial, sans-serif;
					cursor: pointer;
					transition: background .12s ease, border-color .12s ease, color .12s ease, opacity .12s ease;
				}
				.cattail-world-editor-shell__tool--icon {
					width: 30px;
					min-width: 30px;
					height: 30px;
					min-height: 30px;
					padding: 0;
					font-size: 20px;
					line-height: 1;
				}
				.cattail-world-editor-shell__tool:hover:not(:disabled) {
					color: var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell__tool[data-active="true"] {
					border-color: var(--world-editor-shell-active-border);
					background: var(--world-editor-shell-active);
					color: var(--world-editor-shell-text);
				}
				.cattail-world-editor-shell__tool:focus-visible {
					outline: 2px solid var(--world-editor-shell-active-border);
					outline-offset: 2px;
				}
				.cattail-world-editor-shell__tool:disabled {
					opacity: .38;
					cursor: default;
				}
				.cattail-world-editor-shell__hint {
					margin-left: auto;
					padding-left: 14px;
					border-left: 1px solid var(--world-editor-shell-border);
					color: var(--world-editor-shell-muted);
					font-size: 13px;
				}
				@media (max-width: 900px) {
					.cattail-world-editor-shell__bar {
						justify-content: center;
						gap: 8px;
						padding: 8px 10px;
					}
					.cattail-world-editor-shell__actions {
						justify-content: center;
					}
					.cattail-world-editor-shell__hint {
						margin-left: 0;
						padding-left: 0;
						border-left: 0;
					}
				}
				@media (max-width: 520px) {
					.cattail-world-editor-shell__bar { gap: 7px; }
					.cattail-world-editor-shell__brand,
					.cattail-world-editor-shell__divider { display: none; }
					.cattail-world-editor-shell__mode { font-size: 16px; }
					.cattail-world-editor-shell__tool { padding-inline: 8px; }
				}
			`
			document.head.append(style)
			return style
		}

		function finitePositive(value, fallback) {
			const number = Number(value)
			return Number.isFinite(number) && number > 0 ? number : Number(fallback) || 0
		}

		function responsiveViewport(game) {
			const fallbackWidth = finitePositive(
				typeof window !== 'undefined' ? window.innerWidth : 0,
				document.documentElement?.clientWidth || UI_SCALE_BASE_WIDTH
			)
			const fallbackHeight = finitePositive(
				typeof window !== 'undefined' ? window.innerHeight : 0,
				document.documentElement?.clientHeight || UI_SCALE_BASE_HEIGHT
			)
			const widths = [fallbackWidth]
			const heights = [fallbackHeight]
			for (const element of uiScaleTargets(game)) {
				const rect = element?.getBoundingClientRect?.()
				const width = finitePositive(rect?.width, 0)
				const height = finitePositive(rect?.height, 0)
				if (width) widths.push(width)
				if (height) heights.push(height)
			}
			return {
				width: Math.min(...widths),
				height: Math.min(...heights)
			}
		}

		function uiScaleTargets(game) {
			const canvas = game?.canvas
			const host = canvas?.parentElement
			return Array.from(new Set([canvas, host])).filter(function (element) {
				return !!(
					element &&
					element !== document.body &&
					element !== document.documentElement &&
					typeof element.getBoundingClientRect === 'function'
				)
			})
		}

		function createUiScaleObserver(game, refresh) {
			const Observer = globalThis.ResizeObserver
			if (typeof Observer !== 'function') return null
			const observer = new Observer(function () {
				refresh()
			})
			for (const target of uiScaleTargets(game)) {
				try {
					observer.observe(target)
				} catch (error) {
					console.warn('[Cattail World Editor] UI scale observer skipped an unsupported target.', error)
				}
			}
			return observer
		}

		function readStyleProperty(style, property) {
			if (!style) return ''
			if (typeof style.getPropertyValue === 'function') return style.getPropertyValue(property)
			return String(style[property] || '')
		}

		function writeStyleProperty(style, property, value) {
			if (!style) return
			if (value) {
				if (typeof style.setProperty === 'function') style.setProperty(property, value)
				else style[property] = value
				return
			}
			if (typeof style.removeProperty === 'function') style.removeProperty(property)
			else delete style[property]
		}

		function isRange(value) {
			return !!(
				value &&
				Array.isArray(value.start) &&
				Array.isArray(value.end) &&
				value.start.length >= 2 &&
				value.end.length >= 2 &&
				Number.isInteger(Number(value.start[0])) &&
				Number.isInteger(Number(value.start[1])) &&
				Number.isInteger(Number(value.end[0])) &&
				Number.isInteger(Number(value.end[1])) &&
				Number.isInteger(Number(value.width)) &&
				Number.isInteger(Number(value.height)) &&
				Number(value.width) > 0 &&
				Number(value.height) > 0
			)
		}

		function formatCount(template, count) {
			return String(template || '').replace(/\{count\}/g, String(count))
		}
	}
})
