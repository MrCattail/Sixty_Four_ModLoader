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

				const stopPropagation = function (event) {
					event.stopPropagation()
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
						element.addEventListener('keydown', handleKeydown, true)
						for (const type of EVENT_TYPES) element.addEventListener(type, stopPropagation)
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
						element.removeEventListener('keydown', handleKeydown, true)
						for (const type of EVENT_TYPES) element.removeEventListener(type, stopPropagation)
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

		function ensureStyle() {
			const existing = document.getElementById(STYLE_ID)
			if (existing) return existing
			const style = document.createElement('style')
			style.id = STYLE_ID
			style.textContent = `
				.cattail-world-editor-dialog {
					--world-editor-dialog-bg: rgba(248, 248, 246, .97);
					--world-editor-dialog-text: rgba(18, 20, 22, .94);
					--world-editor-dialog-muted: rgba(18, 20, 22, .66);
					--world-editor-dialog-border: rgba(0, 0, 0, .16);
					--world-editor-dialog-control: rgba(18, 20, 22, .06);
					--world-editor-dialog-accent: #d6a92c;
					--world-editor-dialog-accent-text: #15130c;
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
				}
				.cattail-world-editor-dialog__button--primary {
					border-color: color-mix(in srgb, var(--world-editor-dialog-accent) 76%, #000);
					background: var(--world-editor-dialog-accent);
					color: var(--world-editor-dialog-accent-text);
				}
				.cattail-world-editor-dialog__button--danger {
					--world-editor-dialog-accent: #d55a50;
					--world-editor-dialog-accent-text: #fff;
				}
				.cattail-world-editor-dialog__button:disabled {
					cursor: default;
					opacity: .38;
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
