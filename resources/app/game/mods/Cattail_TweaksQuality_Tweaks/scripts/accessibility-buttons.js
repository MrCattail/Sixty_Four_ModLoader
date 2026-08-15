ModLoader.register({
	id: 'Cattail_TweaksQuality_Tweaks',
	init(api) {
		if (api.config.get('enableAccessibilityButtons', true) === false) return

		const controllerKey = '__cattailAccessibilityButtonsController'
		const styleId = 'cattail-accessibility-buttons-style'
		const rootClass = 'cattail-accessibility-buttons'
		const hotspotClass = 'cattail-accessibility-buttons-hotspot'
		const paletteClass = 'cattail-accessibility-buttons-palette'
		const paletteMarkerClass = 'cattail-accessibility-buttons-palette-marker'
		const floorButtonClass = 'cattail-accessibility-floor'
		const floorGridButtonClass = 'cattail-accessibility-floor-grid'
		const hiddenClass = 'cattail-accessibility-buttons-hidden'
		const autoHiddenClass = 'cattail-accessibility-buttons-auto-hidden'
		const photofobiaClass = 'photofobia'
		const activeClass = 'active'
		const autoHideDelay = 5000
		const floorLongPressDelay = 520
		const floorPalettePositionKey = '__cattailAccessibilityFloorPalettePosition'
		const floorColorOverrideEnabledConfigKey = 'enableFloorColorOverride'
		const floorColorOverrideRealityColorConfigKey = 'floorColorOverrideRealityColor'
		const floorColorOverrideDefaultColor = '#FFFFFF'
		const floorGridEnabledConfigKey = 'enableFloorGridLines'
		const floorGridRealityColorConfigKey = 'floorGridLineRealityColor'
		const floorGridVoidColorConfigKey = 'floorGridLineVoidColor'
		const floorGridRealityDefaultColor = '#1D232B'
		const floorGridVoidDefaultColor = '#FFFFFF'
		const floorGridRealityPalettePositionKey = '__cattailAccessibilityFloorGridRealityPalettePosition'
		const floorGridVoidPalettePositionKey = '__cattailAccessibilityFloorGridVoidPalettePosition'
		const paletteTargetFloor = 'floor'
		const paletteTargetGrid = 'grid'
		const grayStripWidth = .2

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
			loadPalettePositions(game)
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
	transition: opacity .22s ease, transform .24s ease, background .16s ease;
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

.${rootClass}.${autoHiddenClass} {
	opacity: 0;
	pointer-events: none;
	transform: translateX(-50%) translateY(calc(100% + max(18px, env(safe-area-inset-bottom))));
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

.${hotspotClass} {
	position: fixed;
	left: 50%;
	bottom: 0;
	z-index: 2147482999;
	width: min(220px, 46vw);
	height: max(18px, env(safe-area-inset-bottom));
	transform: translateX(-50%);
	background: transparent;
}

.${hotspotClass}.${hiddenClass} {
	display: none;
}

.${floorButtonClass} {
	position: relative;
	display: inline-grid !important;
	place-items: center;
	width: 48px !important;
	height: 24px !important;
	border: 0 !important;
	border-radius: 0;
	color: #111;
	background-image: none;
}

.${rootClass}.${photofobiaClass} .${floorButtonClass} {
	color: #fff;
}

.${floorGridButtonClass} {
	position: relative;
	display: inline-grid !important;
	place-items: center;
	width: 48px !important;
	height: 24px !important;
	border: 0 !important;
	border-radius: 0;
	color: #111;
	background-image: none;
}

.${rootClass}.${photofobiaClass} .${floorGridButtonClass} {
	color: #fff;
}

.${floorButtonClass} span {
	display: block;
	width: 15px;
	height: 9px;
	border-radius: 1px;
	background: currentColor;
	transform: rotate(-24deg) skewX(-22deg);
	pointer-events: none;
}

.${floorGridButtonClass} span {
	display: block;
	width: 19px;
	height: 13px;
	box-sizing: border-box;
	border: 2px solid currentColor;
	border-radius: 1px;
	background:
		linear-gradient(currentColor, currentColor) 50% 0 / 2px 100% no-repeat,
		linear-gradient(currentColor, currentColor) 0 50% / 100% 2px no-repeat;
	opacity: .46;
	transform: rotate(-24deg) skewX(-22deg);
	pointer-events: none;
}

.${floorGridButtonClass}.${activeClass} span {
	opacity: 1;
	box-shadow: 0 0 0 1px rgba(255, 255, 255, .35), 0 0 8px rgba(0, 0, 0, .18);
}

.${paletteClass} {
	position: fixed;
	left: 50%;
	bottom: calc(max(12px, env(safe-area-inset-bottom)) + 52px);
	z-index: 2147483001;
	width: 168px;
	height: 168px;
	box-sizing: border-box;
	border: 1px solid rgba(0, 0, 0, .16);
	border-radius: 10px;
	overflow: hidden;
	background: linear-gradient(to bottom, #fff 0%, #808080 50%, #000 100%);
	box-shadow: 0 12px 32px rgba(0, 0, 0, .24);
	cursor: crosshair;
	opacity: .96;
	transform: translateX(-50%);
	transition: opacity .16s ease, transform .18s ease;
	touch-action: none;
	user-select: none;
	-webkit-user-select: none;
}

.${paletteClass}::before {
	content: '';
	position: absolute;
	left: 20%;
	top: 0;
	right: 0;
	bottom: 0;
	background:
		linear-gradient(to bottom, #fff 0%, rgba(255, 255, 255, 0) 42%, rgba(0, 0, 0, 0) 58%, #000 100%),
		linear-gradient(90deg, #f43, #ff0, #0e6, #0df, #36f, #c3f, #f43);
	pointer-events: none;
}

.${paletteClass}::after {
	content: '';
	position: absolute;
	left: 20%;
	top: 0;
	bottom: 0;
	width: 1px;
	background: rgba(0, 0, 0, .18);
	pointer-events: none;
}

.${paletteClass}.${hiddenClass} {
	opacity: 0;
	pointer-events: none;
	transform: translateX(-50%) translateY(8px) scale(.98);
}

.${paletteClass}.${photofobiaClass} {
	border-color: rgba(255, 255, 255, .18);
	box-shadow: 0 12px 32px rgba(0, 0, 0, .38);
}

.${paletteMarkerClass} {
	position: absolute;
	left: 0;
	top: 0;
	width: 13px;
	height: 13px;
	box-sizing: border-box;
	border: 2px solid #fff;
	border-radius: 50%;
	box-shadow: 0 0 0 1px rgba(0, 0, 0, .55), 0 2px 6px rgba(0, 0, 0, .3);
	transform: translate(-50%, -50%);
	pointer-events: none;
	z-index: 1;
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

	.${hotspotClass} {
		width: min(200px, 54vw);
		height: max(22px, env(safe-area-inset-bottom));
	}

	.${floorButtonClass} {
		width: 44px !important;
		height: 22px !important;
	}

	.${floorGridButtonClass} {
		width: 44px !important;
		height: 22px !important;
	}

	.${paletteClass} {
		bottom: calc(max(9px, env(safe-area-inset-bottom)) + 48px);
		width: 156px;
		height: 156px;
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

			const hotspot = document.createElement('div')
			hotspot.className = hotspotClass
			hotspot.setAttribute('aria-hidden', 'true')

			const palette = document.createElement('div')
			palette.className = paletteClass + ' ' + hiddenClass
			palette.setAttribute('aria-label', 'Reality floor color palette')
			palette.setAttribute('role', 'application')

			const marker = document.createElement('div')
			marker.className = paletteMarkerClass
			palette.append(marker)

			const flash = createButton('cattail-accessibility-flash', 'Toggle reduced flashes', function () {
				game.togglePhotofobia()
			})
			const chill = createButton('cattail-accessibility-chill', 'Toggle chill mode', function () {
				game.toggleChill()
			})
			const floor = createFloorButton(game)
			const floorGrid = createFloorGridButton(game)

			root.append(flash)
			root.append(chill)
			root.append(floor.button)
			root.append(floorGrid.button)
			document.body.appendChild(hotspot)
			document.body.appendChild(root)
			document.body.appendChild(palette)

			game[controllerKey] = {
				root,
				hotspot,
				palette,
				marker,
				flash,
				chill,
				floor: floor.button,
				floorIcon: floor.icon,
				floorGrid: floorGrid.button,
				floorGridIcon: floorGrid.icon,
				floorLongPressTimer: null,
				floorLongPressTriggered: false,
				floorPointerId: null,
				floorGridLongPressTimer: null,
				floorGridLongPressTriggered: false,
				floorGridPointerId: null,
				pointerInside: false,
				paletteOpen: false,
				paletteTarget: paletteTargetFloor,
				paletteDragging: false,
				autoHidden: false,
				autoHideTimer: null
			}
			bindAutoHide(game, game[controllerKey])
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

		function createFloorButton(game) {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = floorButtonClass
			button.title = 'Toggle reality floor color override; hold to adjust color'
			button.setAttribute('aria-label', 'Toggle reality floor color override; hold to adjust color')
			button.setAttribute('aria-expanded', 'false')
			button.setAttribute('aria-pressed', 'true')

			const icon = document.createElement('span')
			icon.setAttribute('aria-hidden', 'true')
			button.append(icon)

			const stop = function (event) {
				event.stopPropagation()
			}
			const clearLongPress = function (event) {
				const controller = ensureController(game)
				if (!controller) return
				if (controller.floorLongPressTimer) {
					clearTimeout(controller.floorLongPressTimer)
					controller.floorLongPressTimer = null
				}
				if (controller.floorPointerId !== null && (!event || event.pointerId === controller.floorPointerId)) {
					try { button.releasePointerCapture(controller.floorPointerId) } catch (error) {}
					controller.floorPointerId = null
				}
			}

			button.addEventListener('pointerdown', function (event) {
				event.preventDefault()
				event.stopPropagation()
				const controller = ensureController(game)
				if (!controller) return
				clearLongPress(event)
				controller.floorLongPressTriggered = false
				controller.floorPointerId = event.pointerId
				try { button.setPointerCapture(event.pointerId) } catch (error) {}
				controller.floorLongPressTimer = setTimeout(function () {
					controller.floorLongPressTimer = null
					controller.floorLongPressTriggered = true
					openPaletteWithOverride(game)
				}, floorLongPressDelay)
			}, true)
			button.addEventListener('pointerup', clearLongPress, true)
			button.addEventListener('pointercancel', clearLongPress, true)
			button.addEventListener('pointerleave', function (event) {
				if (event.pointerType === 'mouse') clearLongPress(event)
			}, true)
			button.addEventListener('mousedown', stop, true)
			button.addEventListener('touchstart', stop, true)
			button.addEventListener('contextmenu', function (event) {
				event.preventDefault()
				event.stopPropagation()
			}, true)
			button.addEventListener('click', function (event) {
				event.preventDefault()
				event.stopPropagation()
				const controller = ensureController(game)
				const consumed = !!controller?.floorLongPressTriggered
				if (controller) controller.floorLongPressTriggered = false
				if (consumed) return
				if (controller?.paletteOpen && controller.paletteTarget === paletteTargetFloor) {
					closePalette(game)
					scheduleAutoHide(game)
					updateController(game)
					return
				}
				toggleFloorOverride(game)
			}, true)

			return { button, icon }
		}

		function createFloorGridButton(game) {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = floorGridButtonClass
			button.title = 'Toggle floor grid outlines; hold to adjust current dimension color'
			button.setAttribute('aria-label', 'Toggle floor grid outlines; hold to adjust current dimension color')
			button.setAttribute('aria-expanded', 'false')
			button.setAttribute('aria-pressed', 'false')

			const icon = document.createElement('span')
			icon.setAttribute('aria-hidden', 'true')
			button.append(icon)

			const stop = function (event) {
				event.stopPropagation()
			}
			const clearLongPress = function (event) {
				const controller = ensureController(game)
				if (!controller) return
				if (controller.floorGridLongPressTimer) {
					clearTimeout(controller.floorGridLongPressTimer)
					controller.floorGridLongPressTimer = null
				}
				if (controller.floorGridPointerId !== null && (!event || event.pointerId === controller.floorGridPointerId)) {
					try { button.releasePointerCapture(controller.floorGridPointerId) } catch (error) {}
					controller.floorGridPointerId = null
				}
			}

			button.addEventListener('pointerdown', function (event) {
				event.preventDefault()
				event.stopPropagation()
				const controller = ensureController(game)
				if (!controller) return
				clearLongPress(event)
				controller.floorGridLongPressTriggered = false
				controller.floorGridPointerId = event.pointerId
				try { button.setPointerCapture(event.pointerId) } catch (error) {}
				controller.floorGridLongPressTimer = setTimeout(function () {
					controller.floorGridLongPressTimer = null
					controller.floorGridLongPressTriggered = true
					openPaletteForFloorGrid(game)
				}, floorLongPressDelay)
			}, true)
			button.addEventListener('pointerup', clearLongPress, true)
			button.addEventListener('pointercancel', clearLongPress, true)
			button.addEventListener('pointerleave', function (event) {
				if (event.pointerType === 'mouse') clearLongPress(event)
			}, true)
			button.addEventListener('mousedown', stop, true)
			button.addEventListener('touchstart', stop, true)
			button.addEventListener('contextmenu', function (event) {
				event.preventDefault()
				event.stopPropagation()
			}, true)
			button.addEventListener('click', function (event) {
				event.preventDefault()
				event.stopPropagation()
				const controller = ensureController(game)
				const consumed = !!controller?.floorGridLongPressTriggered
				if (controller) controller.floorGridLongPressTriggered = false
				if (consumed) return
				if (controller?.paletteOpen && controller.paletteTarget === paletteTargetGrid) {
					closePalette(game)
					scheduleAutoHide(game)
					updateController(game)
					return
				}
				setFloorGridEnabled(game, !isFloorGridEnabled())
				updateController(game)
			}, true)

			return { button, icon }
		}

		function bindAutoHide(game, controller) {
			const enter = function () {
				controller.pointerInside = true
				showController(game)
			}
			const leave = function () {
				controller.pointerInside = false
				scheduleAutoHide(game)
			}

			controller.root.addEventListener('mouseenter', enter)
			controller.root.addEventListener('mouseleave', leave)
			controller.hotspot.addEventListener('mouseenter', enter)
			controller.hotspot.addEventListener('mouseleave', leave)
			controller.palette.addEventListener('mouseenter', enter)
			controller.palette.addEventListener('mouseleave', leave)
			controller.root.addEventListener('focusin', enter)
			controller.root.addEventListener('focusout', leave)
			bindPalette(game, controller)
		}

		function showController(game) {
			const controller = ensureController(game)
			if (!controller) return

			controller.autoHidden = false
			controller.root.classList.remove(autoHiddenClass)
			if (controller.autoHideTimer) {
				clearTimeout(controller.autoHideTimer)
				controller.autoHideTimer = null
			}
		}

		function scheduleAutoHide(game) {
			const controller = ensureController(game)
			if (!controller) return
			if (controller.autoHideTimer) clearTimeout(controller.autoHideTimer)

			controller.autoHideTimer = setTimeout(function () {
				controller.autoHideTimer = null
				if (controller.pointerInside || controller.paletteOpen || game.splash?.isShown) return
				controller.autoHidden = true
				controller.root.classList.add(autoHiddenClass)
			}, autoHideDelay)
		}

		function bindPalette(game, controller) {
			controller.palette.addEventListener('pointerdown', function (event) {
				event.preventDefault()
				event.stopPropagation()
				controller.paletteDragging = true
				controller.pointerInside = true
				showController(game)
				try { controller.palette.setPointerCapture(event.pointerId) } catch (error) {}
				applyPalettePointer(game, event)
			}, true)

			controller.palette.addEventListener('pointermove', function (event) {
				if (!controller.paletteDragging) return
				event.preventDefault()
				event.stopPropagation()
				applyPalettePointer(game, event)
			}, true)

			const stopDrag = function (event) {
				if (!controller.paletteDragging) return
				event.preventDefault()
				event.stopPropagation()
				controller.paletteDragging = false
				try { controller.palette.releasePointerCapture(event.pointerId) } catch (error) {}
			}

			controller.palette.addEventListener('pointerup', stopDrag, true)
			controller.palette.addEventListener('pointercancel', stopDrag, true)
			controller.palette.addEventListener('click', function (event) {
				event.preventDefault()
				event.stopPropagation()
			}, true)
		}

		function toggleFloorOverride(game) {
			setFloorOverrideEnabled(game, !isFloorOverrideEnabled())
			updateController(game)
		}

		function setFloorOverrideEnabled(game, enabled) {
			api.config.set(floorColorOverrideEnabledConfigKey, !!enabled)
			dispatchConfigPreview(floorColorOverrideEnabledConfigKey, !!enabled)
			if (!enabled) closePalette(game)
			updateController(game)
		}

		function isFloorOverrideEnabled() {
			return api.config.get(floorColorOverrideEnabledConfigKey, true) === true
		}

		function setFloorGridEnabled(game, enabled) {
			api.config.set(floorGridEnabledConfigKey, !!enabled)
			dispatchConfigPreview(floorGridEnabledConfigKey, !!enabled)
			updateController(game)
		}

		function isFloorGridEnabled() {
			return api.config.get(floorGridEnabledConfigKey, true) === true
		}

		function openPaletteWithOverride(game) {
			setFloorOverrideEnabled(game, true)
			const controller = ensureController(game)
			if (!controller) return
			controller.paletteTarget = paletteTargetFloor
			controller.paletteOpen = true
			controller.floor.setAttribute('aria-expanded', 'true')
			controller.floorGrid.setAttribute('aria-expanded', 'false')
			controller.palette.setAttribute('aria-label', 'Reality floor color palette')
			showController(game)
			updateController(game)
		}

		function openPaletteForFloorGrid(game) {
			setFloorGridEnabled(game, true)
			const controller = ensureController(game)
			if (!controller) return
			controller.paletteTarget = paletteTargetGrid
			controller.paletteOpen = true
			controller.floor.setAttribute('aria-expanded', 'false')
			controller.floorGrid.setAttribute('aria-expanded', 'true')
			controller.palette.setAttribute('aria-label', game?.plane ? 'Void floor grid outline color palette' : 'Reality floor grid outline color palette')
			showController(game)
			updateController(game)
		}

		function closePalette(game) {
			const controller = ensureController(game)
			if (!controller) return
			controller.paletteOpen = false
			controller.floor.setAttribute('aria-expanded', 'false')
			controller.floorGrid.setAttribute('aria-expanded', 'false')
		}

		function togglePalette(game) {
			const controller = ensureController(game)
			if (!controller) return
			if (controller.paletteOpen) {
				closePalette(game)
				scheduleAutoHide(game)
			} else {
				openPaletteWithOverride(game)
			}
			updateController(game)
		}

		function applyPalettePointer(game, event) {
			const controller = ensureController(game)
			if (!controller) return
			const rect = controller.palette.getBoundingClientRect()
			if (!rect.width || !rect.height) return
			const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
			const y = clamp((event.clientY - rect.top) / rect.height, 0, 1)
			if (controller.paletteTarget === paletteTargetGrid) {
				setFloorGridColorFromPalette(game, controller, x, y)
			} else {
				setFloorColorFromPalette(game, controller, x, y)
			}
		}

		function setFloorColorFromPalette(game, controller, x, y) {
			setFloorOverrideEnabled(game, true)
			const position = { x: clamp(x, 0, 1), y: clamp(y, 0, 1) }
			const color = paletteHexColor(position.x, position.y)
			game[floorPalettePositionKey] = position
			api.config.set(floorColorOverrideRealityColorConfigKey, color)
			dispatchConfigPreview(floorColorOverrideRealityColorConfigKey, color)
			try {
				localStorage.setItem(storageKey(game, 'floorPalette'), JSON.stringify(position))
			} catch (error) {}
			updatePaletteMarker(controller, game)
		}

		function setFloorGridColorFromPalette(game, controller, x, y) {
			const position = { x: clamp(x, 0, 1), y: clamp(y, 0, 1) }
			const color = paletteHexColor(position.x, position.y)
			const configKey = getFloorGridColorConfigKey(game)
			const positionKey = getFloorGridPalettePositionKey(game)
			game[positionKey] = position
			api.config.set(configKey, color)
			dispatchConfigPreview(configKey, color)
			try {
				localStorage.setItem(storageKey(game, positionKey), JSON.stringify(position))
			} catch (error) {}
			updatePaletteMarker(controller, game)
		}

		function loadPalettePositions(game) {
			if (!game) return
			let position = null
			let gridRealityPosition = null
			let gridVoidPosition = null
			try {
				position = parsePalettePosition(localStorage.getItem(storageKey(game, 'floorPalette')))
				gridRealityPosition = parsePalettePosition(localStorage.getItem(storageKey(game, floorGridRealityPalettePositionKey)))
				gridVoidPosition = parsePalettePosition(localStorage.getItem(storageKey(game, floorGridVoidPalettePositionKey)))
			} catch (error) {}
			game[floorPalettePositionKey] = position || palettePositionFromHex(getFloorOverrideConfiguredColor())
			game[floorGridRealityPalettePositionKey] = gridRealityPosition || palettePositionFromHex(getFloorGridConfiguredColor(false))
			game[floorGridVoidPalettePositionKey] = gridVoidPosition || palettePositionFromHex(getFloorGridConfiguredColor(true))
		}

		function updatePaletteMarker(controller, game) {
			const editingGrid = controller.paletteTarget === paletteTargetGrid
			const position = editingGrid ? getFloorGridPalettePosition(game) : (game[floorPalettePositionKey] || { x: 0, y: 0 })
			const floorColor = getFloorOverrideConfiguredColor()
			const gridColor = getFloorGridConfiguredColor(!!game?.plane)
			const override = isFloorOverrideEnabled()
			const gridEnabled = isFloorGridEnabled()
			const gridTitle = (gridEnabled ? 'Hide' : 'Show') + ' floor grid outlines; hold to adjust current dimension color'
			controller.marker.style.left = (position.x * 100) + '%'
			controller.marker.style.top = (position.y * 100) + '%'
			controller.floor.classList.toggle(activeClass, override)
			controller.floor.setAttribute('aria-pressed', override ? 'true' : 'false')
			controller.floor.title = override ? 'Use original reality floor color; hold to adjust custom color' : 'Use custom reality floor color; hold to adjust custom color'
			controller.floor.setAttribute('aria-label', controller.floor.title)
			controller.floorIcon.style.backgroundColor = override ? floorColor : 'transparent'
			controller.floorIcon.style.boxShadow = override ? 'none' : 'inset 0 0 0 1px currentColor'
			controller.floorGrid.classList.toggle(activeClass, gridEnabled)
			controller.floorGrid.setAttribute('aria-pressed', gridEnabled ? 'true' : 'false')
			controller.floorGrid.title = gridTitle
			controller.floorGrid.setAttribute('aria-label', gridTitle)
			controller.floorGridIcon.style.color = gridColor
		}

		function getFloorGridColorConfigKey(game) {
			return game?.plane ? floorGridVoidColorConfigKey : floorGridRealityColorConfigKey
		}

		function getFloorOverrideConfiguredColor() {
			return normalizeHexColor(api.config.get(floorColorOverrideRealityColorConfigKey, '')) || floorColorOverrideDefaultColor
		}

		function getFloorGridPalettePositionKey(game) {
			return game?.plane ? floorGridVoidPalettePositionKey : floorGridRealityPalettePositionKey
		}

		function getFloorGridPalettePosition(game) {
			const key = getFloorGridPalettePositionKey(game)
			const stored = game?.[key]
			if (stored) return stored
			return palettePositionFromHex(getFloorGridConfiguredColor(!!game?.plane))
		}

		function getFloorGridConfiguredColor(voidPlane) {
			const key = voidPlane ? floorGridVoidColorConfigKey : floorGridRealityColorConfigKey
			const fallback = voidPlane ? floorGridVoidDefaultColor : floorGridRealityDefaultColor
			return normalizeHexColor(api.config.get(key, '')) || fallback
		}

		function dispatchConfigPreview(key, value) {
			try {
				window.dispatchEvent(new CustomEvent('modloader:config-preview', {
					detail: {
						modId: 'Cattail_TweaksQuality_Tweaks',
						key,
						value
					}
				}))
			} catch (error) {}
		}

		function parsePalettePosition(value) {
			if (!value) return null
			try {
				const parsed = JSON.parse(value)
				if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') return null
				return { x: clamp(parsed.x, 0, 1), y: clamp(parsed.y, 0, 1) }
			} catch (error) {
				return null
			}
		}

		function paletteHexColor(x, y) {
			const normalizedX = clamp(x, 0, 1)
			const lightness = clamp(y, 0, 1)
			if (normalizedX <= grayStripWidth) {
				const channel = Math.round((1 - lightness) * 255)
				return rgbToHex(channel, channel, channel)
			}
			const hueX = (normalizedX - grayStripWidth) / (1 - grayStripWidth)
			return hslToHex(clamp(hueX, 0, 1) * 360, 1, 1 - lightness)
		}

		function palettePositionFromHex(value) {
			const rgb = parseHexRgb(value)
			if (!rgb) return { x: 0, y: 0 }
			const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)
			if (hsl.s < .08) return { x: 0, y: clamp(1 - hsl.l, 0, 1) }
			return {
				x: clamp(grayStripWidth + (hsl.h / 360) * (1 - grayStripWidth), 0, 1),
				y: clamp(1 - hsl.l, 0, 1)
			}
		}

		function hslToHex(h, s, l) {
			const c = (1 - Math.abs(2 * l - 1)) * s
			const hp = (((h % 360) + 360) % 360) / 60
			const x = c * (1 - Math.abs((hp % 2) - 1))
			let r = 0
			let g = 0
			let b = 0
			if (hp < 1) {
				r = c
				g = x
			} else if (hp < 2) {
				r = x
				g = c
			} else if (hp < 3) {
				g = c
				b = x
			} else if (hp < 4) {
				g = x
				b = c
			} else if (hp < 5) {
				r = x
				b = c
			} else {
				r = c
				b = x
			}
			const m = l - c / 2
			return rgbToHex(Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255))
		}

		function rgbToHsl(r, g, b) {
			r /= 255
			g /= 255
			b /= 255
			const max = Math.max(r, g, b)
			const min = Math.min(r, g, b)
			const l = (max + min) / 2
			if (max === min) return { h: 0, s: 0, l }
			const d = max - min
			const s = l > .5 ? d / (2 - max - min) : d / (max + min)
			let h = 0
			if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
			else if (max === g) h = ((b - r) / d + 2) * 60
			else h = ((r - g) / d + 4) * 60
			return { h, s, l }
		}

		function rgbToHex(r, g, b) {
			return '#' + [r, g, b].map(function (channel) {
				return clamp(channel, 0, 255).toString(16).padStart(2, '0')
			}).join('').toUpperCase()
		}

		function normalizeHexColor(value) {
			if (value === undefined || value === null) return ''
			const text = String(value).trim()
			const shortMatch = text.match(/^#?([0-9a-f]{3})$/i)
			if (shortMatch) {
				return '#' + shortMatch[1].split('').map(function (part) { return part + part }).join('').toUpperCase()
			}
			const fullMatch = text.match(/^#?([0-9a-f]{6})$/i)
			return fullMatch ? '#' + fullMatch[1].toUpperCase() : ''
		}

		function parseHexRgb(value) {
			const color = normalizeHexColor(value)
			if (!color) return null
			return {
				r: parseInt(color.slice(1, 3), 16),
				g: parseInt(color.slice(3, 5), 16),
				b: parseInt(color.slice(5, 7), 16)
			}
		}

		function storageKey(game, key) {
			return 'cattailAccessibilityButtons:' + (game?.steamId || 'default') + ':' + key
		}

		function clamp(value, min, max) {
			return Math.max(min, Math.min(max, value))
		}

		function updateController(game, splashOverride) {
			const controller = ensureController(game)
			if (!controller) return

			const photofobia = !!game.photofobia
			const chill = !!game.chillMode
			const splash = splashOverride || game.splash
			const splashShown = !!splash?.isShown

			controller.root.classList.toggle(hiddenClass, splashShown)
			controller.hotspot.classList.toggle(hiddenClass, splashShown)
			controller.palette.classList.toggle(hiddenClass, splashShown || !controller.paletteOpen)
			controller.root.classList.toggle(photofobiaClass, photofobia)
			controller.palette.classList.toggle(photofobiaClass, photofobia)
			if (controller.paletteTarget === paletteTargetGrid) {
				controller.palette.setAttribute('aria-label', game?.plane ? 'Void floor grid outline color palette' : 'Reality floor grid outline color palette')
			}
			controller.flash.setAttribute('aria-pressed', photofobia ? 'true' : 'false')
			controller.chill.setAttribute('aria-pressed', chill ? 'true' : 'false')
			controller.chill.classList.toggle(activeClass, chill)
			updatePaletteMarker(controller, game)
			if (splashShown) {
				controller.paletteOpen = false
				controller.floor.setAttribute('aria-expanded', 'false')
				controller.floorGrid.setAttribute('aria-expanded', 'false')
				showController(game)
			} else if (controller.paletteOpen) {
				showController(game)
			} else if (!controller.pointerInside && !controller.autoHidden) {
				scheduleAutoHide(game)
			}
		}
	}
})
