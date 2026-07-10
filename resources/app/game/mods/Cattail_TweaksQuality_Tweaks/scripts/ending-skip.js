ModLoader.register({
	id: 'Cattail_TweaksQuality_Tweaks',
	init(api) {
		if (api.config.get('enableEndingSkip', true) === false) return

		const controllerKey = '__cattailEndingSkipController'
		const styleId = 'cattail-ending-skip-style'
		const buttonClass = 'cattail-ending-skip-button'
		const hiddenClass = 'cattail-ending-skip-hidden'
		const movieSkippedKey = '__cattailEndingSkipMovieSkipped'
		const creditOffsetKey = '__cattailEndingSkipCreditOffset'
		const creditScrollSpeed = .02
		const fallbackMovieOffset = 1000

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

.cattail-ending-skip-credit-offset {
	position: relative;
	will-change: transform;
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

		const getCreditMovie = function (game) {
			return game?.creditImage?.tagName === 'VIDEO' ? game.creditImage : null
		}

		const isCreditMovieActive = function (game) {
			const movie = getCreditMovie(game)
			if (!game?.credits || !movie || game[movieSkippedKey]) return false
			if (movie.ended) return false

			const duration = Number(movie.duration)
			const currentTime = Number(movie.currentTime) || 0
			if (Number.isFinite(duration) && duration > 0 && currentTime >= duration - .25) return false

			return true
		}

		const getRemainingMovieOffset = function (movie) {
			if (!movie) return fallbackMovieOffset

			const duration = Number(movie.duration)
			const currentTime = Number(movie.currentTime) || 0
			if (Number.isFinite(duration) && duration > currentTime) {
				return Math.max(0, (duration - currentTime) * 1000 * creditScrollSpeed)
			}

			return fallbackMovieOffset
		}

		const applyCreditOffset = function (game, offset) {
			const pillar = game?.creditPillar
			if (!pillar || game[creditOffsetKey]) return

			const wrapper = document.createElement('div')
			wrapper.className = 'cattail-ending-skip-credit-offset'
			wrapper.style.transform = 'translate(0,-' + Math.round(offset) + 'px)'
			pillar.parentNode.insertBefore(wrapper, pillar)
			wrapper.appendChild(pillar)
			game[creditOffsetKey] = wrapper
		}

		const skipCreditMovie = function (game) {
			const movie = getCreditMovie(game)
			const offset = getRemainingMovieOffset(movie)
			game[movieSkippedKey] = true

			if (movie) {
				try { movie.pause() } catch (error) {}
				movie.style.transition = 'none'
				movie.style.opacity = 0
				movie.style.display = 'none'
				try {
					if (Number.isFinite(movie.duration) && movie.duration > 0) movie.currentTime = movie.duration
				} catch (error) {}
			}

			applyCreditOffset(game, offset)
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
				const mode = game.credits ? (isCreditMovieActive(game) ? 'movie' : 'credits') : visible ? 'ending' : 'hidden'

				if (mode !== controller.mode) {
					controller.mode = mode
					controller.button.classList.toggle(hiddenClass, mode === 'hidden')
					controller.button.setAttribute('aria-label', mode === 'movie' ? 'Skip movie' : mode === 'credits' ? 'Skip credits' : 'Skip ending')
				}

				controller.raf = requestAnimationFrame(sync)
			}

			controller.button.addEventListener('click', function (event) {
				event.preventDefault()
				event.stopPropagation()

				if (game.credits) {
					if (isCreditMovieActive(game)) {
						skipCreditMovie(game)
					} else {
						skipCredits()
					}
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
