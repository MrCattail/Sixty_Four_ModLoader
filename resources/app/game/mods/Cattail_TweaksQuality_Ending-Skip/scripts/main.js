ModLoader.register({
	id: 'Cattail_TweaksQuality_Ending-Skip',
	init(api) {
		const controllerKey = '__cattailEndingSkipController'
		const styleId = 'cattail-ending-skip-style'
		const buttonClass = 'cattail-ending-skip-button'
		const hiddenClass = 'cattail-ending-skip-hidden'

		const installStyle = function () {
			if (document.getElementById(styleId)) return

			const style = document.createElement('style')
			style.id = styleId
			style.textContent = `
.${buttonClass} {
	position: fixed;
	right: max(22px, env(safe-area-inset-right));
	bottom: max(22px, env(safe-area-inset-bottom));
	z-index: 2147483000;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 9px;
	box-sizing: border-box;
	min-width: 94px;
	height: 34px;
	padding: 0 13px 1px 15px;
	border: 1px solid currentColor;
	border-radius: 999px;
	background: transparent;
	color: #fff;
	mix-blend-mode: difference;
	font: 600 16px/1 Montserrat, Arial, sans-serif;
	letter-spacing: 0;
	cursor: pointer;
	-webkit-tap-highlight-color: transparent;
	user-select: none;
	transition: transform .08s ease, opacity .16s ease;
}

.${buttonClass}:hover {
	transform: translateY(-.5px);
}

.${buttonClass}:active {
	transform: translateY(1px) scale(.98);
}

.${buttonClass}.${hiddenClass} {
	display: none;
}

.${buttonClass} span {
	pointer-events: none;
}

.cattail-ending-skip-label {
	display: inline-block;
	transform: translateY(-.5px);
}

.cattail-ending-skip-icon {
	position: relative;
	display: inline-flex;
	align-items: center;
	width: 20px;
	height: 14px;
}

.cattail-ending-skip-triangle {
	width: 0;
	height: 0;
	border-top: 6px solid transparent;
	border-bottom: 6px solid transparent;
	border-left: 8px solid currentColor;
}

.cattail-ending-skip-triangle + .cattail-ending-skip-triangle {
	margin-left: 1px;
}

@media (max-width: 700px) {
	.${buttonClass} {
		right: max(14px, env(safe-area-inset-right));
		bottom: max(14px, env(safe-area-inset-bottom));
		gap: 8px;
		min-width: 84px;
		height: 30px;
		padding: 0 11px 1px 13px;
		font-size: 14px;
	}

	.cattail-ending-skip-icon {
		width: 18px;
		height: 12px;
	}

	.cattail-ending-skip-triangle {
		border-top-width: 5px;
		border-bottom-width: 5px;
		border-left-width: 7px;
	}
}
`
			document.head.appendChild(style)
		}

		const createButton = function () {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = buttonClass + ' ' + hiddenClass
			button.setAttribute('aria-label', 'Skip ending')
			button.innerHTML = '<span class="cattail-ending-skip-label">skip</span><span class="cattail-ending-skip-icon" aria-hidden="true"><span class="cattail-ending-skip-triangle"></span><span class="cattail-ending-skip-triangle"></span></span>'
			document.body.appendChild(button)
			return button
		}

		const isEndingVisible = function (game) {
			return !!(game && (game.credits || game.pinhole || game.entitiesInGame?.pinhole > 0))
		}

		const skipCredits = function () {
			location.reload()
		}

		const skipEnding = function (game) {
			if (!game || typeof game.watchCredits !== 'function') return
			if (!game.credits) game.watchCredits()
		}

		const installController = function (game) {
			if (!game || game[controllerKey]) return

			installStyle()

			const controller = {
				button: createButton(),
				mode: 'hidden',
				raf: 0
			}

			const sync = function () {
				const visible = isEndingVisible(game)
				const mode = game.credits ? 'credits' : visible ? 'ending' : 'hidden'

				if (mode !== controller.mode) {
					controller.mode = mode
					controller.button.classList.toggle(hiddenClass, mode === 'hidden')
					controller.button.setAttribute('aria-label', mode === 'credits' ? 'Skip credits' : 'Skip ending')
				}

				controller.raf = requestAnimationFrame(sync)
			}

			controller.button.addEventListener('click', function (event) {
				event.preventDefault()
				event.stopPropagation()

				if (game.credits) {
					skipCredits()
					return
				}

				if (game.pinhole || game.entitiesInGame?.pinhole > 0) {
					skipEnding(game)
				}
			})

			game[controllerKey] = controller
			sync()
		}

		api.on('afterGameInit', function (payload, game) {
			installController(game)
		})
	}
})
