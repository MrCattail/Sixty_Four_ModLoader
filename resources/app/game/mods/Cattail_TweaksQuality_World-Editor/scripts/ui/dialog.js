ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const DIALOG_KEY = Symbol.for('cattail.world-editor.dialogs')
		const STYLE_ID = 'cattail-world-editor-dialog-style'
		const EVENT_TYPES = Object.freeze([
			'mousedown',
			'mouseup',
			'click',
			'pointerdown',
			'pointerup',
			'touchstart',
			'touchend',
			'wheel'
		])
		const KEY_EVENT_TYPES = Object.freeze([
			'keydown',
			'keyup',
			'keypress'
		])
		const FOCUSABLE_SELECTOR = [
			'button:not(:disabled)',
			'input:not(:disabled)',
			'select:not(:disabled)',
			'textarea:not(:disabled)',
			'[href]',
			'[tabindex]:not([tabindex="-1"])'
		].join(', ')

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const previous = globalThis[DIALOG_KEY]
			previous?.dispose?.('dialog-service-replaced')
			const service = createService(game)
			Object.defineProperty(globalThis, DIALOG_KEY, {
				value: service,
				configurable: true,
				writable: true
			})
			runtime?.addCleanup?.(function () {
				service.dispose('runtime-disposed')
			})
			console.info('[Cattail World Editor] Shared dialog service 4B-1a ready.')
		})

		function createService(game) {
			ensureStyle()
			const handles = new Set()
			let disposed = false

			function create(options) {
				if (disposed) throw new Error('dialog-service-disposed')
				const settings = options || {}
				const id = String(settings.id || '').trim()
				if (!id) throw new TypeError('A dialog ID is required.')
				for (const handle of Array.from(handles)) {
					if (handle.element?.id === id) handle.close('dialog-replaced', true)
				}
				document.getElementById(id)?.remove()

				const element = document.createElement('div')
				element.id = id
				element.className = 'cattail-world-editor-dialog'
				element.dataset.theme = normalizeTheme(settings.theme)
				element.dataset.kind = String(settings.kind || 'default')
				element.dataset.busy = 'false'
				element.setAttribute('role', 'dialog')
				element.setAttribute('aria-modal', 'true')

				const box = document.createElement('div')
				box.className = 'cattail-world-editor-dialog__box'
				const title = document.createElement('h2')
				title.className = 'cattail-world-editor-dialog__title'
				title.id = id + '-title'
				title.textContent = String(settings.title || '')
				const message = document.createElement('p')
				message.className = 'cattail-world-editor-dialog__message'
				message.textContent = String(settings.message || '')
				const content = document.createElement('div')
				content.className = 'cattail-world-editor-dialog__content'
				const errorNode = document.createElement('div')
				errorNode.className = 'cattail-world-editor-dialog__error'
				errorNode.hidden = true
				errorNode.setAttribute('role', 'alert')
				const actions = document.createElement('div')
				actions.className = 'cattail-world-editor-dialog__actions'
				box.append(title, message, content, errorNode, actions)
				element.append(box)
				element.setAttribute('aria-labelledby', title.id)

				let mounted = false
				let closed = false
				let busy = false
				const previousFocus = document.activeElement

				const handleSurfaceEvent = function (event) {
					event.stopPropagation()
					if (
						event.type === 'click' &&
						event.target === element &&
						settings.closeOnBackdrop !== false &&
						!busy
					) {
						event.preventDefault()
						event.stopImmediatePropagation()
						handle.close('dialog-backdrop')
					}
				}
				const handleKeydown = function (event) {
					if (event.key === 'Escape') {
						event.preventDefault()
						event.stopImmediatePropagation()
						if (!busy) handle.close('dialog-escape')
						return
					}
					if (event.key !== 'Tab') return
					const focusable = Array.from(element.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isFocusable)
					if (!focusable.length) {
						event.preventDefault()
						box.focus()
						return
					}
					const first = focusable[0]
					const last = focusable[focusable.length - 1]
					if (event.shiftKey && document.activeElement === first) {
						event.preventDefault()
						last.focus()
					} else if (!event.shiftKey && document.activeElement === last) {
						event.preventDefault()
						first.focus()
					}
				}
				const handleWindowKeyEvent = function (event) {
					if (!mounted || closed) return
					event.stopImmediatePropagation()
					if (event.type === 'keydown') handleKeydown(event)
				}

				const handle = {
					element,
					box,
					title,
					message,
					content,
					errorNode,
					actions,
					previousFocus,
					get busy() {
						return busy
					},
					get mounted() {
						return mounted
					},
					get closed() {
						return closed
					},
					createButton(text, options) {
						const button = document.createElement('button')
						const buttonOptions = options || {}
						button.type = 'button'
						button.className = 'cattail-world-editor-dialog__button'
						if (buttonOptions.primary) button.className += ' cattail-world-editor-dialog__button--primary'
						if (buttonOptions.danger) button.className += ' cattail-world-editor-dialog__button--danger'
						button.textContent = String(text || '')
						return button
					},
					mount(focusTarget) {
						if (closed || mounted) return false
						mounted = true
						releaseGameKeyboardState(game)
						for (const type of KEY_EVENT_TYPES) window.addEventListener(type, handleWindowKeyEvent, true)
						for (const type of EVENT_TYPES) element.addEventListener(type, handleSurfaceEvent)
						document.body.append(element)
						const target = focusTarget || element.querySelector(FOCUSABLE_SELECTOR) || box
						if (target === box) box.tabIndex = -1
						setTimeout(function () {
							if (!closed && target?.isConnected) target.focus?.()
						}, 0)
						return true
					},
					setBusy(next) {
						if (closed) return false
						const nextBusy = !!next
						if (busy === nextBusy) return false
						busy = nextBusy
						element.dataset.busy = busy ? 'true' : 'false'
						for (const control of element.querySelectorAll('button, input, select, textarea')) {
							if (busy) {
								control.dataset.worldEditorDialogWasDisabled = control.disabled ? 'true' : 'false'
								control.disabled = true
							} else {
								const wasDisabled = control.dataset.worldEditorDialogWasDisabled === 'true'
								delete control.dataset.worldEditorDialogWasDisabled
								control.disabled = wasDisabled
							}
						}
						return true
					},
					showError(value) {
						if (closed) return false
						errorNode.textContent = String(value?.message || value || '')
						errorNode.hidden = !errorNode.textContent
						return true
					},
					clearError() {
						if (closed) return false
						errorNode.textContent = ''
						errorNode.hidden = true
						return true
					},
					setTheme(value) {
						if (closed) return false
						element.dataset.theme = normalizeTheme(value)
						return true
					},
					close(reason, force) {
						if (closed || (busy && !force)) return false
						closed = true
						mounted = false
						handles.delete(handle)
						for (const type of KEY_EVENT_TYPES) window.removeEventListener(type, handleWindowKeyEvent, true)
						for (const type of EVENT_TYPES) element.removeEventListener(type, handleSurfaceEvent)
						element.remove()
						try {
							settings.onClose?.(String(reason || 'dialog-closed'), handle)
						} catch (closeError) {
							console.warn('[Cattail World Editor] Shared dialog close callback failed.', closeError)
						}
						const fallbackFocus = settings.fallbackFocus
						if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus()
						else if (fallbackFocus?.isConnected && typeof fallbackFocus.focus === 'function') fallbackFocus.focus()
						return true
					}
				}
				handles.add(handle)
				return handle
			}

			const service = Object.freeze({
				version: '1.0.0',
				game,
				create,
				closeAll(reason, force) {
					let changed = false
					for (const handle of Array.from(handles)) {
						if (handle.close(reason || 'dialog-close-all', force)) changed = true
					}
					return changed
				},
				snapshot() {
					return Object.freeze({
						version: '1.0.0',
						ready: !disposed,
						openCount: disposed ? 0 : handles.size,
						disposed
					})
				},
				dispose(reason) {
					if (disposed) return false
					service.closeAll(reason || 'dialog-service-disposed', true)
					disposed = true
					if (globalThis[DIALOG_KEY] === service) delete globalThis[DIALOG_KEY]
					return true
				}
			})
			return service
		}

		function normalizeTheme(value) {
			return value === 'void' ? 'void' : 'reality'
		}

		function isFocusable(element) {
			return !!(
				element &&
				element.isConnected &&
				element.hidden !== true &&
				element.getAttribute?.('aria-hidden') !== 'true'
			)
		}

		function releaseGameKeyboardState(game) {
			if (Array.isArray(game?.translationMap)) {
				for (let index = 0; index < game.translationMap.length; index += 1) {
					game.translationMap[index] = 0
				}
			}
			if (game) {
				delete game.keyboardMovementHappening
				game.altActive = false
			}
			document.body?.classList?.remove?.('altHolded')
		}

		function ensureStyle() {
			const existing = document.getElementById(STYLE_ID)
			if (existing) return existing
			const style = document.createElement('style')
			style.id = STYLE_ID
			style.textContent = `
				:root {
					--world-editor-elmerine-1: #FFC759;
					--world-editor-elmerine-2: #FFE86F;
					--world-editor-elmerine-3: #FF8F60;
					--world-editor-beta-pylene-1: #F26F67;
					--world-editor-beta-pylene-2: #FFB68C;
					--world-editor-beta-pylene-3: #C02E63;
					--world-editor-hell-gem-1: #A6F246;
					--world-editor-hell-gem-2: #E3FD43;
					--world-editor-hell-gem-3: #4CB96B;
				}
				.cattail-world-editor-dialog {
					--world-editor-dialog-bg: rgba(248, 248, 246, .97);
					--world-editor-dialog-text: rgba(18, 20, 22, .94);
					--world-editor-dialog-muted: rgba(18, 20, 22, .66);
					--world-editor-dialog-border: rgba(0, 0, 0, .16);
					--world-editor-dialog-control: rgba(18, 20, 22, .06);
					--world-editor-dialog-accent: var(--world-editor-elmerine-1);
					--world-editor-dialog-accent-text: #15130c;
					--world-editor-dialog-primary-1: var(--world-editor-elmerine-1);
					--world-editor-dialog-primary-2: var(--world-editor-elmerine-2);
					--world-editor-dialog-primary-3: var(--world-editor-elmerine-3);
					--world-editor-dialog-glass-backdrop: blur(10px) saturate(1.2) brightness(1.05);
					position: fixed;
					inset: 0;
					z-index: 80;
					display: grid;
					place-items: center;
					box-sizing: border-box;
					padding: 20px;
					background: rgba(8, 10, 12, .36);
					backdrop-filter: blur(10px);
					-webkit-backdrop-filter: blur(10px);
					color: var(--world-editor-dialog-text);
					font-family: Montserrat, Arial, sans-serif;
					pointer-events: auto;
				}
				.cattail-world-editor-dialog[data-theme="void"] {
					--world-editor-dialog-bg: rgba(8, 10, 12, .97);
					--world-editor-dialog-text: rgba(255, 255, 255, .94);
					--world-editor-dialog-muted: rgba(255, 255, 255, .66);
					--world-editor-dialog-border: rgba(255, 255, 255, .18);
					--world-editor-dialog-control: rgba(255, 255, 255, .08);
					--world-editor-dialog-accent-text: #17150b;
				}
				.cattail-world-editor-dialog[data-kind^="creative-"] {
					--world-editor-dialog-accent: var(--world-editor-hell-gem-1);
					--world-editor-dialog-accent-text: #17200c;
					--world-editor-dialog-primary-1: var(--world-editor-hell-gem-1);
					--world-editor-dialog-primary-2: var(--world-editor-hell-gem-2);
					--world-editor-dialog-primary-3: var(--world-editor-hell-gem-3);
				}
				.cattail-world-editor-dialog[data-theme="void"][data-kind^="creative-"] {
					--world-editor-dialog-accent: var(--world-editor-hell-gem-2);
					--world-editor-dialog-accent-text: #171a05;
				}
				.cattail-world-editor-dialog__button[data-glass-theme="elmerine"] {
					--world-editor-dialog-accent: var(--world-editor-elmerine-1);
					--world-editor-dialog-accent-text: #15130c;
					--world-editor-dialog-primary-1: var(--world-editor-elmerine-1);
					--world-editor-dialog-primary-2: var(--world-editor-elmerine-2);
					--world-editor-dialog-primary-3: var(--world-editor-elmerine-3);
				}
				.cattail-world-editor-dialog__box {
					width: min(620px, calc(100vw - 32px));
					max-height: calc(100vh - 40px);
					overflow: auto;
					box-sizing: border-box;
					padding: 24px;
					border: 1px solid var(--world-editor-dialog-border);
					border-radius: 10px;
					background: var(--world-editor-dialog-bg);
					box-shadow: 0 20px 70px rgba(0, 0, 0, .34);
					outline: none;
				}
				.cattail-world-editor-dialog__title {
					margin: 0 0 10px;
					font-size: 22px;
					line-height: 1.3;
				}
				.cattail-world-editor-dialog__message {
					margin: 0 0 18px;
					color: var(--world-editor-dialog-muted);
					font-size: 14px;
					line-height: 1.55;
					white-space: pre-line;
				}
				.cattail-world-editor-dialog__content {
					display: grid;
					gap: 10px;
				}
				.cattail-world-editor-dialog__error {
					margin-top: 12px;
					color: #c14b45;
					font-size: 13px;
					line-height: 1.45;
				}
				.cattail-world-editor-dialog__actions {
					display: flex;
					justify-content: flex-end;
					flex-wrap: wrap;
					gap: 8px;
					margin-top: 20px;
				}
				.cattail-world-editor-dialog__button {
					min-height: 38px;
					border: 1px solid var(--world-editor-dialog-border);
					border-radius: 6px;
					padding: 8px 12px;
					background: var(--world-editor-dialog-control);
					color: var(--world-editor-dialog-text);
					font: 600 13px/1.2 Montserrat, Arial, sans-serif;
					cursor: pointer;
					outline: none;
					transition: background .12s ease, border-color .12s ease, box-shadow .12s ease, color .12s ease, opacity .12s ease, transform .08s ease;
				}
				.cattail-world-editor-dialog__button--primary {
					--world-editor-dialog-primary-glass:
						radial-gradient(ellipse 92% 72% at 50% -18%, rgba(255, 255, 255, .72) 0%, rgba(255, 255, 255, .22) 46%, transparent 72%),
						linear-gradient(180deg, rgba(255, 255, 255, .28) 0%, rgba(255, 255, 255, .06) 34%, rgba(255, 255, 255, .03) 60%, rgba(255, 255, 255, .3) 100%),
						linear-gradient(112deg, transparent 8%, rgba(255, 255, 255, .46) 24%, rgba(255, 255, 255, .09) 43%, transparent 59%),
						linear-gradient(145deg, color-mix(in srgb, var(--world-editor-dialog-primary-2) 24%, transparent), color-mix(in srgb, var(--world-editor-dialog-primary-1) 16%, transparent) 54%, color-mix(in srgb, var(--world-editor-dialog-primary-3) 22%, transparent));
					--world-editor-dialog-primary-glass-hover:
						radial-gradient(ellipse 96% 78% at 50% -18%, rgba(255, 255, 255, .84) 0%, rgba(255, 255, 255, .32) 48%, transparent 74%),
						linear-gradient(180deg, rgba(255, 255, 255, .36) 0%, rgba(255, 255, 255, .08) 34%, rgba(255, 255, 255, .05) 60%, rgba(255, 255, 255, .42) 100%),
						linear-gradient(108deg, transparent 6%, rgba(255, 255, 255, .58) 24%, rgba(255, 255, 255, .14) 44%, transparent 61%),
						linear-gradient(145deg, color-mix(in srgb, var(--world-editor-dialog-primary-2) 30%, transparent), color-mix(in srgb, var(--world-editor-dialog-primary-1) 22%, transparent) 54%, color-mix(in srgb, var(--world-editor-dialog-primary-3) 28%, transparent));
					--world-editor-dialog-primary-glass-shadow:
						inset 0 0 0 1px rgba(255, 255, 255, .62),
						inset 0 1px 1px rgba(255, 255, 255, .92),
						inset 0 -1px 1px rgba(255, 255, 255, .68),
						inset 1px 0 1px rgba(255, 255, 255, .38),
						inset -1px 0 1px color-mix(in srgb, var(--world-editor-dialog-primary-2) 34%, transparent),
						inset 0 -6px 12px color-mix(in srgb, var(--world-editor-dialog-primary-3) 18%, transparent),
						0 5px 12px rgba(10, 16, 24, .16),
						0 0 12px color-mix(in srgb, var(--world-editor-dialog-primary-1) 42%, transparent),
						0 0 26px color-mix(in srgb, var(--world-editor-dialog-primary-2) 22%, transparent);
					--world-editor-dialog-primary-glass-shadow-hover:
						inset 0 0 0 1px rgba(255, 255, 255, .76),
						inset 0 1px 1px rgba(255, 255, 255, .98),
						inset 0 -2px 2px rgba(255, 255, 255, .78),
						inset 1px 0 1px rgba(255, 255, 255, .5),
						inset -1px 0 1px color-mix(in srgb, var(--world-editor-dialog-primary-2) 42%, transparent),
						inset 0 -7px 14px color-mix(in srgb, var(--world-editor-dialog-primary-3) 22%, transparent),
						0 6px 14px rgba(10, 16, 24, .18),
						0 0 16px color-mix(in srgb, var(--world-editor-dialog-primary-1) 54%, transparent),
						0 0 32px color-mix(in srgb, var(--world-editor-dialog-primary-2) 30%, transparent);
					--world-editor-dialog-primary-glass-shadow-pressed:
						inset 0 0 0 1px rgba(255, 255, 255, .58),
						inset 0 1px 1px rgba(255, 255, 255, .74),
						inset 0 4px 9px color-mix(in srgb, var(--world-editor-dialog-primary-3) 24%, transparent),
						inset 0 -1px 1px rgba(255, 255, 255, .54),
						0 2px 7px rgba(10, 16, 24, .16),
						0 0 10px color-mix(in srgb, var(--world-editor-dialog-primary-1) 38%, transparent),
						0 0 20px color-mix(in srgb, var(--world-editor-dialog-primary-2) 20%, transparent);
					border-color: color-mix(in srgb, rgba(255, 255, 255, .88) 54%, var(--world-editor-dialog-primary-1));
					background: var(--world-editor-dialog-primary-glass);
					background-blend-mode: screen, screen, screen, normal;
					backdrop-filter: var(--world-editor-dialog-glass-backdrop);
					-webkit-backdrop-filter: var(--world-editor-dialog-glass-backdrop);
					box-shadow: var(--world-editor-dialog-primary-glass-shadow);
					color: var(--world-editor-dialog-accent-text);
				}
				.cattail-world-editor-dialog__button--primary:hover:not(:disabled) {
					border-color: color-mix(in srgb, rgba(255, 255, 255, .96) 68%, var(--world-editor-dialog-primary-1));
					background: var(--world-editor-dialog-primary-glass-hover);
					box-shadow: var(--world-editor-dialog-primary-glass-shadow-hover);
				}
				.cattail-world-editor-dialog__button--primary:active:not(:disabled) {
					transform: translateY(1px);
					box-shadow: var(--world-editor-dialog-primary-glass-shadow-pressed);
				}
				.cattail-world-editor-dialog__button--primary:focus-visible {
					box-shadow: var(--world-editor-dialog-primary-glass-shadow), 0 0 0 2px var(--world-editor-dialog-text);
				}
				.cattail-world-editor-dialog__button--danger {
					--world-editor-dialog-accent: var(--world-editor-beta-pylene-1);
					--world-editor-dialog-accent-text: #2b0d18;
					--world-editor-dialog-primary-1: var(--world-editor-beta-pylene-1);
					--world-editor-dialog-primary-2: var(--world-editor-beta-pylene-2);
					--world-editor-dialog-primary-3: var(--world-editor-beta-pylene-3);
				}
				.cattail-world-editor-dialog__button:disabled {
					cursor: default;
					opacity: .38;
				}
				.cattail-world-editor-dialog__button--primary:disabled {
					box-shadow: none;
				}
				.cattail-world-editor-dialog[data-busy="true"] {
					cursor: progress;
				}
			`
			document.head.append(style)
			return style
		}
	}
})
