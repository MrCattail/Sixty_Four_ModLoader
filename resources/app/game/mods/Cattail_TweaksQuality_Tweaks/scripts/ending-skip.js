ModLoader.register({
	id: 'Cattail_TweaksQuality_Tweaks',
	init(api) {
		if (api.config.get('enableEndingSkip', true) === false) return

		const controllerKey = '__cattailTweaksEndingSkipController'
		const styleId = 'cattail-ending-skip-style'
		const buttonClass = 'cattail-ending-skip-button'
		const hiddenClass = 'cattail-ending-skip-hidden'
		const movieSkippedKey = '__cattailTweaksEndingSkipMovieSkipped'
		const creditOffsetKey = '__cattailTweaksEndingSkipCreditOffset'
		const creditScrollSpeed = .02
		const creditFastMultiplier = 10
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
			if (!pillar?.parentNode) return
			const controller = game[controllerKey]
			let wrapper = game[creditOffsetKey]
			if (!wrapper || pillar.parentNode !== wrapper) {
				wrapper = document.createElement('div')
				wrapper.className = 'cattail-ending-skip-credit-offset'
				pillar.parentNode.insertBefore(wrapper, pillar)
				wrapper.appendChild(pillar)
				game[creditOffsetKey] = wrapper
				controller.creditOffset = 0
			}
			// Add to the native pillar transform without changing its RAF or clock.
			controller.creditOffset += offset
			wrapper.style.transform = 'translate(0,-' + controller.creditOffset + 'px)'
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

		const skipEnding = function (game) {
			if (!game || typeof game.watchCredits !== 'function') return
			if (!game.credits) game.watchCredits()
		}

		const installController = function (game) {
			if (!game || game[controllerKey]) return
			if (game.version !== '1.3' || game.isMobile) return
			if (typeof api.patch !== 'function' || typeof game.watchCredits !== 'function' || typeof game.deployOrbElement !== 'function') return

			installStyle()

			const controller = {
				button: createButton(),
				mode: 'hidden',
				language: null,
				raf: 0,
				returning: false,
				spaceHeld: false,
				spaceCaptured: false,
				lastScrollTime: 0,
				creditOffset: 0,
				rewardOpen: false,
				rewardOpening: false,
				rewardChosen: false,
				rewardPanels: new Set(),
				guardedMovies: new WeakSet()
			}

			const syncMode = function () {
				let mode = 'hidden'
				if (!controller.returning && !controller.rewardChosen && !controller.rewardOpening) {
					if (game.credits?.isConnected) mode = isCreditMovieActive(game) ? 'movie' : 'credits'
					else if (!game.credits && !controller.rewardOpen && isEndingVisible(game)) mode = 'ending'
				}

				if (mode !== controller.mode || controller.language !== game.language) {
					controller.mode = mode
					controller.language = game.language
					const chinese = ['sch', 'modsch', 'tch'].includes(game.language)
					const returnLabel = chinese ? '返回本周目' : 'Return to this run'
					controller.button.classList.toggle(hiddenClass, mode === 'hidden')
					controller.button.querySelector('.cattail-ending-skip-label').textContent = mode === 'credits' ? returnLabel : 'skip'
					controller.button.querySelector('.cattail-ending-skip-icon').style.display = mode === 'credits' ? 'none' : ''
					controller.button.setAttribute('aria-label', mode === 'movie' ? 'Skip movie' : mode === 'credits' ? returnLabel : 'Skip ending')
					controller.button.title = mode === 'credits' ? (chinese ? '返回最近存档，不领取本次奖励。按住空格加速字幕（10倍）。' : 'Return to the latest save without this run’s reward. Hold Space for 10x credits.') : ''
				}
			}

			const canScroll = function () {
				return !controller.returning && !controller.rewardChosen && !document.hidden && controller.button.isConnected && game.credits?.isConnected && game.creditPillar?.isConnected
			}
			const advanceCredits = function () {
				const now = performance.now()
				if (controller.spaceHeld && canScroll() && game.creditPillar.getBoundingClientRect().bottom >= 0) {
					applyCreditOffset(game, Math.max(0, now - controller.lastScrollTime) * creditScrollSpeed * (creditFastMultiplier - 1))
				}
				controller.lastScrollTime = now
			}
			const releaseSpace = function () {
				advanceCredits()
				controller.spaceHeld = false
			}
			const lockRewards = function () {
				for (const wrap of controller.rewardPanels) {
					for (const choice of wrap.querySelectorAll('.orbResetButton')) {
						choice.setAttribute('aria-disabled', 'true')
						choice.style.pointerEvents = 'none'
					}
				}
			}

			const adoptRewards = function () {
				// Native 1.3 does not keep a reference to its reward wrapper. It
				// may already exist when loading a Pinhole save before afterGameInit.
				for (const panel of document.querySelectorAll('.orbResetWrap')) {
					if (controller.rewardPanels.has(panel)) continue
					controller.rewardPanels.add(panel)
					controller.rewardOpen = true
					panel.addEventListener('click', function (event) {
						const button = event.target?.closest?.('.orbResetButton')
						if (!button || !panel.contains(button)) return
						if (controller.rewardChosen || controller.returning) {
							event.preventDefault()
							event.stopImmediatePropagation()
							return
						}
						// Lock before the native target handler increments anything.
						// Keep locked on a failed write too; a retry must not count twice.
						controller.rewardChosen = true
						releaseSpace()
						lockRewards()
						syncMode()
					}, true)
				}
			}

			const guardMovie = function () {
				const movie = getCreditMovie(game)
				if (!movie || controller.guardedMovies.has(movie)) return
				controller.guardedMovies.add(movie)
				const pauseIfSkipped = function () {
					if (!game[movieSkippedKey] && game.credits?.style.visibility !== 'hidden') return
					try { movie.pause() } catch (error) {}
				}
				// Registered after the native canplay listener: a late media event
				// cannot restart the movie after the player skipped it.
				movie.addEventListener('canplay', pauseIfSkipped)
				movie.addEventListener('play', pauseIfSkipped)
			}

			api.patch(game, 'deployOrbElement', function (original) {
				return function (...args) {
					if (this !== game) return original.apply(this, args)
					adoptRewards()
					if (controller.returning || controller.rewardChosen || controller.rewardOpen || controller.rewardOpening) {
						syncMode()
						return
					}
					controller.rewardOpening = true
					try {
						return original.apply(this, args)
					} finally {
						controller.rewardOpening = false
						adoptRewards()
						syncMode()
					}
				}
			})

			api.patch(game, 'watchCredits', function (original) {
				return function (...args) {
					if (this !== game) return original.apply(this, args)
					if (controller.returning || controller.rewardChosen || controller.rewardOpen || controller.rewardOpening || game.credits) return
					const result = original.apply(this, args)
					guardMovie()
					syncMode()
					return result
				}
			})

			const isEditable = function (target) {
				return !!(target?.isContentEditable || target?.closest?.('input, textarea, select, [role="textbox"]'))
			}
			const isSpace = event => event.code === 'Space' || event.key === ' '
			const consumeSpace = function (event) {
				event.preventDefault()
				event.stopImmediatePropagation()
			}
			const keyDown = function (event) {
				if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing || isEditable(event.target) || isEditable(document.activeElement)) {
					releaseSpace()
					return
				}
				if (!isSpace(event) || !canScroll()) return
				consumeSpace(event)
				// After losing focus, require a fresh press instead of resuming on repeat.
				if (event.repeat && !controller.spaceHeld) return
				if (!controller.spaceHeld) controller.lastScrollTime = performance.now()
				controller.spaceCaptured = true
				controller.spaceHeld = true
			}
			const keyUp = function (event) {
				if (!isSpace(event)) return
				if (controller.spaceCaptured) consumeSpace(event)
				releaseSpace()
				controller.spaceCaptured = false
			}
			const blur = function () {
				releaseSpace()
				controller.spaceCaptured = false
			}
			const visibilityChange = function () { if (document.hidden) blur() }
			const focusIn = function (event) { if (isEditable(event.target)) releaseSpace() }
			window.addEventListener('keydown', keyDown, true)
			window.addEventListener('keyup', keyUp, true)
			window.addEventListener('blur', blur)
			document.addEventListener('visibilitychange', visibilityChange)
			document.addEventListener('focusin', focusIn)

			const sync = function () {
				if (!controller.button.isConnected) {
					blur()
					window.removeEventListener('keydown', keyDown, true)
					window.removeEventListener('keyup', keyUp, true)
					window.removeEventListener('blur', blur)
					document.removeEventListener('visibilitychange', visibilityChange)
					document.removeEventListener('focusin', focusIn)
					return
				}
				if (!canScroll()) releaseSpace()
				else advanceCredits()
				syncMode()
				controller.raf = requestAnimationFrame(sync)
			}

			controller.button.addEventListener('click', function (event) {
				event.preventDefault()
				event.stopPropagation()
				if (controller.returning || controller.rewardChosen || controller.rewardOpening || event.detail > 1) return

				if (game.credits?.isConnected) {
					if (isCreditMovieActive(game)) {
						skipCreditMovie(game)
					} else {
						// Return is an alternative to settlement, like the old T-1.
						// Lock both exits before navigation; never interrupt a reward write.
						controller.returning = true
						releaseSpace()
						lockRewards()
						syncMode()
						location.reload()
					}
					syncMode()
					return
				}

				if (!controller.rewardOpen && (game.pinhole || game.entitiesInGame?.pinhole > 0)) {
					skipEnding(game)
				}
			})

			game[controllerKey] = controller
			adoptRewards()
			guardMovie()
			sync()
		}

		api.on('afterGameInit', function (payload, game) {
			installController(game)
		})
	}
})
