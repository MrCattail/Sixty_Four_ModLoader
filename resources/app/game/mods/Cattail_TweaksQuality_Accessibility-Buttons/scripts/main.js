ModLoader.register({
	id: 'Cattail_TweaksQuality_Accessibility-Buttons',
	init(api) {
		const controllerKey = '__cattailAccessibilityButtonsController'
		const styleId = 'cattail-accessibility-buttons-style'
		const rootClass = 'cattail-accessibility-buttons'
		const hiddenClass = 'cattail-accessibility-buttons-hidden'
		const photofobiaClass = 'photofobia'
		const activeClass = 'active'

		api.on('afterVanillaScripts', function () {
			if (typeof Splash === 'undefined' || typeof Game === 'undefined') return

			installStyle()
			patchSplashBuild(api, 'init')
			patchSplashBuild(api, 'initMobile')
			patchSplashVisibility(api, 'show')
			patchSplashVisibility(api, 'close')
			patchGameToggle(api, 'togglePhotofobia')
			patchGameToggle(api, 'toggleChill')
		})

		api.on('afterGameInit', function (payload, game) {
			installStyle()
			ensureController(game)
			updateController(game)
		})

		function installStyle() {
			if (document.getElementById(styleId)) return

			const style = document.createElement('style')
			style.id = styleId
			style.textContent = `
.splash:not(.mobile) .flashlight {
	left: 18px;
	bottom: 48px;
}

.splash:not(.mobile) .chill {
	left: 18px;
	bottom: 84px;
}

.${rootClass} {
	position: fixed;
	left: 50%;
	bottom: max(12px, env(safe-area-inset-bottom));
	z-index: 2147483000;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 12px;
	box-sizing: border-box;
	padding: 6px 9px;
	border-radius: 999px;
	background: rgba(246, 246, 238, .76);
	box-shadow: 0 8px 22px rgba(0, 0, 0, .18);
	transform: translateX(-50%);
	opacity: .56;
	transition: opacity .16s ease, transform .16s ease, background .16s ease;
	-webkit-tap-highlight-color: transparent;
	user-select: none;
}

.${rootClass}:hover,
.${rootClass}:focus-within {
	opacity: .95;
	transform: translateX(-50%) translateY(-1px);
}

.${rootClass}.${photofobiaClass} {
	background: rgba(0, 0, 0, .54);
	box-shadow: 0 8px 22px rgba(0, 0, 0, .28);
}

.${rootClass}.${hiddenClass} {
	opacity: 0;
	pointer-events: none;
	transform: translateX(-50%) translateY(8px);
}

.${rootClass} button {
	appearance: none;
	-webkit-appearance: none;
	display: block;
	width: 48px;
	height: 24px;
	margin: 0;
	padding: 0;
	border: 0;
	background-color: transparent;
	background-repeat: no-repeat;
	cursor: pointer;
	opacity: .72;
	transition: opacity .14s ease, transform .08s ease;
}

.${rootClass} button:hover,
.${rootClass} button:focus-visible {
	opacity: 1;
}

.${rootClass} button:active {
	transform: translateY(1px) scale(.96);
}

.${rootClass} button:focus-visible {
	outline: 2px solid rgba(120, 150, 255, .72);
	outline-offset: 3px;
	border-radius: 3px;
}

.cattail-accessibility-flash {
	background-image: url('img/flashlight.svg');
	background-size: 100%;
	background-position: 0 0;
}

.${rootClass}.${photofobiaClass} .cattail-accessibility-flash {
	background-position: 0 100%;
}

.cattail-accessibility-chill {
	background-image: url('img/chill.svg');
	background-size: 200%;
	background-position: 0 0;
}

.cattail-accessibility-chill.${activeClass} {
	background-position: 0 100%;
}

.${rootClass}.${photofobiaClass} .cattail-accessibility-chill {
	background-position: 100% 0;
}

.${rootClass}.${photofobiaClass} .cattail-accessibility-chill.${activeClass} {
	background-position: 100% 100%;
}

@media (max-width: 700px) {
	.${rootClass} {
		bottom: max(9px, env(safe-area-inset-bottom));
		gap: 10px;
		padding: 5px 8px;
	}

	.${rootClass} button {
		width: 44px;
		height: 22px;
	}
}
`
			document.head.appendChild(style)
		}

		function patchSplashBuild(api, methodName) {
			api.patch(Splash.prototype, methodName, function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					syncSplashState(this)
					updateController(this.master, this)
					return result
				}
			})
		}

		function patchSplashVisibility(api, methodName) {
			api.patch(Splash.prototype, methodName, function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					updateController(this.master, this)
					return result
				}
			})
		}

		function patchGameToggle(api, methodName) {
			api.patch(Game.prototype, methodName, function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					syncSplashState(this.splash)
					updateController(this)
					return result
				}
			})
		}

		function syncSplashState(splash) {
			if (!splash?.master) return
			if (typeof splash.setPhotofobia === 'function') splash.setPhotofobia(!!splash.master.photofobia)
			if (splash.chill) splash.chill.classList.toggle(activeClass, !!splash.master.chillMode)
		}

		function ensureController(game) {
			if (!game || !document.body) return null

			const existing = game[controllerKey]
			if (existing?.root?.isConnected) return existing

			const root = document.createElement('div')
			root.className = rootClass
			root.setAttribute('role', 'group')
			root.setAttribute('aria-label', 'Accessibility toggles')

			const flash = createButton('cattail-accessibility-flash', 'Toggle reduced flashes', function () {
				game.togglePhotofobia()
			})
			const chill = createButton('cattail-accessibility-chill', 'Toggle chill mode', function () {
				game.toggleChill()
			})

			root.append(flash)
			root.append(chill)
			document.body.appendChild(root)

			game[controllerKey] = { root, flash, chill }
			return game[controllerKey]
		}

		function createButton(className, label, action) {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = className
			button.title = label
			button.setAttribute('aria-label', label)

			const stop = function (event) {
				event.stopPropagation()
			}

			button.addEventListener('pointerdown', stop, true)
			button.addEventListener('mousedown', stop, true)
			button.addEventListener('touchstart', stop, true)
			button.addEventListener('click', function (event) {
				event.preventDefault()
				event.stopPropagation()
				action()
			}, true)

			return button
		}

		function updateController(game, splashOverride) {
			const controller = ensureController(game)
			if (!controller) return

			const photofobia = !!game.photofobia
			const chill = !!game.chillMode
			const splash = splashOverride || game.splash
			const splashShown = !!splash?.isShown

			controller.root.classList.toggle(hiddenClass, splashShown)
			controller.root.classList.toggle(photofobiaClass, photofobia)
			controller.flash.setAttribute('aria-pressed', photofobia ? 'true' : 'false')
			controller.chill.setAttribute('aria-pressed', chill ? 'true' : 'false')
			controller.chill.classList.toggle(activeClass, chill)
		}
	}
})
