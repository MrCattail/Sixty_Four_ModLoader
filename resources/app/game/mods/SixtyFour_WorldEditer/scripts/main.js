ModLoader.register({
	id: 'SixtyFour_WorldEditer',
	init(api) {
		const MOD_ID = api.id
		const BLUEPRINT_STORAGE_KEY = 'modloader:' + MOD_ID + ':blueprints'
		const MAX_UNDO = 32
		const renderLayerId = 'interaction'
		const renderCallbackId = 'worldediter-overlay'
		const cursorLayerId = 'cursor'
		const cursorCallbackId = 'worldediter-cursor'
		let renderApiOverlayRegistered = false
		let renderApiCursorRegistered = false
		const state = {
			api,
			game: null,
			active: false,
			mode: 'idle',
			selections: [],
			selectStart: null,
			selectPreview: null,
			drag: null,
			clipboard: null,
			paste: null,
			placementMode: 'strict',
			blueprints: [],
			toolbar: null,
			cardLayer: null,
			style: null,
			ctrlDown: false,
			mouse: { x: 0, y: 0, ctrlKey: false },
			undoStack: [],
			redoStack: [],
			libraryOpen: false
		}

		api.on('afterVanillaScripts', function () {
			registerRenderApiOverlay()
			registerRenderApiCursor()
			if (typeof Game === 'undefined' || !Game.prototype) return
			api.patch(Game.prototype, 'processMousemove2', function (original) {
				return function (xy, dxy, click) {
					if (!isActiveForGame(this)) return original.apply(this, arguments)
					handleEditorMouseMove(this, xy, dxy, click)
				}
			})
			api.patch(Game.prototype, 'processDown', function (original) {
				return function (rightclick) {
					if (!isActiveForGame(this)) return original.apply(this, arguments)
					handleEditorDown(this, !!rightclick)
				}
			})
			api.patch(Game.prototype, 'processClick', function (original) {
				return function () {
					if (!isActiveForGame(this)) return original.apply(this, arguments)
				}
			})
			api.patch(Game.prototype, 'processMouseup', function (original) {
				return function () {
					if (!isActiveForGame(this)) return original.apply(this, arguments)
					finishDrag()
					this.mouse.state = 0
					this.mouse.timer = this.mouse.maxTimer
					this.selectedEntity = false
				}
			})
			api.patch(Game.prototype, 'processMouseout', function (original) {
				return function () {
					if (!isActiveForGame(this)) return original.apply(this, arguments)
					finishDrag()
					if (!this.isMobile) this.mouse.cursorVisible = false
					this.selectedEntity = false
					this.removeHint?.()
				}
			})
			api.patch(Game.prototype, 'processQ', function (original) {
				return function () {
					if (!isActiveForGame(this)) return original.apply(this, arguments)
				}
			})
			api.patch(Game.prototype, 'processE', function (original) {
				return function () {
					if (!isActiveForGame(this)) return original.apply(this, arguments)
				}
			})
			api.patch(Game.prototype, 'renderCursor', function (original) {
				return function () {
					if (!isActiveForGame(this)) return original.apply(this, arguments)
					if (!shouldUseRenderApiCursor()) renderEditorCursor(this)
				}
			})
			api.patch(Game.prototype, 'renderHoveredCell', function (original) {
				return function () {
					const result = original.apply(this, arguments)
					if (isActiveForGame(this) && !shouldUseRenderApiOverlay()) renderEditorOverlay(this)
					return result
				}
			})
		})

		api.on('afterGameInit', function (payload, game) {
			state.game = game
			loadBlueprintLibrary()
			installDom(game)
			installInputCapture(game)
			updateDom()
		})

		function registerRenderApiOverlay() {
			if (!api.render || typeof api.render.onLayer !== 'function') return
			api.render.onLayer(renderLayerId, function ({ game, ctx }) {
				if (!isActiveForGame(game)) return
				renderEditorOverlay(game, ctx, { translateToMap: true })
			}, {
				id: renderCallbackId,
				order: 35,
				space: 'screen',
				enabled({ game }) { return isActiveForGame(game) }
			})
			renderApiOverlayRegistered = true
		}

		function shouldUseRenderApiOverlay() {
			if (!renderApiOverlayRegistered || !api.render) return false
			if (typeof api.render.isEnabled === 'function') return api.render.isEnabled() !== false
			return true
		}

		function registerRenderApiCursor() {
			if (!api.render || typeof api.render.onLayer !== 'function') return
			api.render.onLayer(cursorLayerId, function ({ game, ctx }) {
				if (!isActiveForGame(game)) return
				renderEditorCursor(game, ctx)
			}, {
				id: cursorCallbackId,
				order: 40,
				space: 'screen',
				enabled({ game }) { return isActiveForGame(game) }
			})
			renderApiCursorRegistered = true
		}

		function shouldUseRenderApiCursor() {
			if (!renderApiCursorRegistered || !api.render) return false
			if (typeof api.render.isEnabled === 'function') return api.render.isEnabled() !== false
			return true
		}

		function enabled() {
			return api.config.get('enabled', true) !== false
		}

		function isActiveForGame(game) {
			return enabled() && state.active && state.game === game
		}

		function installInputCapture(game) {
			if (game.__sixtyFourWorldEditerInputInstalled) return
			game.__sixtyFourWorldEditerInputInstalled = true
			window.addEventListener('keydown', function (event) {
				if (event.key === 'Control') state.ctrlDown = true
				if (!enabled()) return
				const key = (event.key || '').toLowerCase()
				if (key === 'v' && !event.ctrlKey && !event.metaKey) {
					event.preventDefault()
					event.stopImmediatePropagation()
					toggleEditor(game)
					return
				}
				if (!state.active) return
				if (event.key === 'Escape') {
					event.preventDefault()
					event.stopImmediatePropagation()
					if (state.paste) cancelPaste()
					else if (state.mode === 'selecting') cancelSelectionPreview()
					else if (state.selections.length) clearSelections()
					else setActive(game, false)
					return
				}
				if (event.ctrlKey || event.metaKey) {
					if (key === 'c') {
						event.preventDefault()
						event.stopImmediatePropagation()
						copySelection(game, false)
					} else if (key === 'x') {
						event.preventDefault()
						event.stopImmediatePropagation()
						copySelection(game, true)
					} else if (key === 'v') {
						event.preventDefault()
						event.stopImmediatePropagation()
						pasteOrPlace(game)
					} else if (key === 'z') {
						event.preventDefault()
						event.stopImmediatePropagation()
						undo(game)
					} else if (key === 'y') {
						event.preventDefault()
						event.stopImmediatePropagation()
						redo(game)
					}
					return
				}
				if (key === 'delete' || key === 'backspace') {
					event.preventDefault()
					event.stopImmediatePropagation()
					deleteSelection(game)
				} else if (key === 'r') {
					event.preventDefault()
					event.stopImmediatePropagation()
					transformPaste('rotate')
				} else if (key === 'h') {
					event.preventDefault()
					event.stopImmediatePropagation()
					transformPaste('mirrorX')
				} else if (key === 'j') {
					event.preventDefault()
					event.stopImmediatePropagation()
					transformPaste('mirrorY')
				}
			}, true)
			window.addEventListener('keyup', function (event) {
				if (event.key === 'Control') state.ctrlDown = false
				if (state.active && (event.keyCode === 16 || event.keyCode === 17)) {
					game.shiftPressed = false
					delete game.zoomWhenShiftPressed
				}
			}, true)
			game.canvas?.addEventListener('mousemove', function (event) {
				state.mouse.x = event.offsetX
				state.mouse.y = event.offsetY
				state.mouse.ctrlKey = event.ctrlKey
			}, true)
			game.canvas?.addEventListener('mousedown', function (event) {
				state.mouse.x = event.offsetX
				state.mouse.y = event.offsetY
				state.mouse.ctrlKey = event.ctrlKey
				if (state.active) game.updateMouseData(event.offsetX, event.offsetY)
			}, true)
			game.canvas?.addEventListener('wheel', function (event) {
				if (!state.active || !state.paste) return
				event.preventDefault()
				event.stopImmediatePropagation()
				cyclePlacementMode(event.deltaY || -event.wheelDeltaY || 1)
			}, true)
			game.canvas?.addEventListener('contextmenu', function (event) {
				if (!state.active) return
				event.preventDefault()
				event.stopImmediatePropagation()
			}, true)
		}

		function installDom(game) {
			ensureStyle()
			if (!state.toolbar) {
				state.toolbar = document.createElement('div')
				state.toolbar.className = 'swe-toolbar'
				state.toolbar.innerHTML = [
					'<div class="swe-brand">WorldEditer</div>',
					'<button type="button" data-action="copy">Copy</button>',
					'<button type="button" data-action="paste">Paste</button>',
					'<button type="button" data-action="cut">Cut</button>',
					'<button type="button" data-action="delete">Delete</button>',
					'<button type="button" data-action="save">Save</button>',
					'<button type="button" data-action="library">Library</button>',
					'<button type="button" data-action="rotate">Rotate</button>',
					'<button type="button" data-action="mirrorX">Mirror X</button>',
					'<button type="button" data-action="mirrorY">Mirror Y</button>',
					'<button type="button" data-action="mode">Strict</button>',
					'<button type="button" data-action="undo">Undo</button>',
					'<button type="button" data-action="redo">Redo</button>',
					'<button type="button" data-action="close">Esc</button>',
					'<div class="swe-status"></div>',
					'<div class="swe-library" hidden></div>'
				].join('')
				state.toolbar.addEventListener('pointerdown', function (event) {
					event.stopPropagation()
				})
				state.toolbar.addEventListener('click', function (event) {
					const action = event.target?.dataset?.action
					if (!action) return
					event.preventDefault()
					event.stopPropagation()
					runToolbarAction(game, action)
				})
				document.body.appendChild(state.toolbar)
			}
			if (!state.cardLayer) {
				state.cardLayer = document.createElement('div')
				state.cardLayer.className = 'swe-card-layer'
				document.body.appendChild(state.cardLayer)
			}
		}

		function ensureStyle() {
			if (state.style || document.getElementById('sixty-four-world-editer-style')) return
			const style = document.createElement('style')
			style.id = 'sixty-four-world-editer-style'
			style.textContent = `
				body.swe-active { cursor: none !important; }
				body.swe-active canvas { cursor: none !important; }
				.swe-toolbar { position: fixed; z-index: 2147483000; left: 50%; top: 10px; display: none; align-items: center; gap: 6px; max-width: calc(100vw - 24px); padding: 7px; transform: translateX(-50%); border: 1px solid rgba(35,38,46,.16); border-radius: 7px; background: rgba(255,255,255,.92); color: #252933; box-shadow: 0 8px 28px rgba(0,0,0,.16); font: 12px/1.25 Montserrat, Arial, sans-serif; pointer-events: auto; user-select: none; backdrop-filter: blur(8px); }
				.swe-toolbar.swe-visible { display: flex; }
				.swe-brand { padding: 0 5px 0 2px; font-weight: 700; white-space: nowrap; }
				.swe-toolbar button { height: 27px; min-width: 0; border: 1px solid rgba(37,41,51,.16); border-radius: 5px; padding: 0 8px; background: rgba(37,41,51,.06); color: inherit; font: inherit; cursor: pointer; white-space: nowrap; }
				.swe-toolbar button:hover { background: rgba(77,108,156,.16); }
				.swe-toolbar button:disabled { opacity: .4; cursor: default; }
				.swe-toolbar button[data-danger="true"] { background: rgba(182,46,35,.12); border-color: rgba(182,46,35,.26); color: #7b2018; }
				.swe-status { min-width: 130px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(37,41,51,.68); }
				.swe-library { position: absolute; right: 7px; top: 42px; width: 292px; max-height: min(70vh, 440px); overflow: auto; padding: 8px; border: 1px solid rgba(35,38,46,.16); border-radius: 7px; background: rgba(255,255,255,.96); box-shadow: 0 10px 30px rgba(0,0,0,.18); }
				.swe-library-item { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(37,41,51,.08); }
				.swe-library-item:last-child { border-bottom: 0; }
				.swe-library-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
				.swe-library-meta { display: block; margin-top: 2px; color: rgba(37,41,51,.55); font-size: 11px; }
				.swe-card-layer { position: fixed; inset: 0; z-index: 2147482999; pointer-events: none; font: 12px/1.35 Montserrat, Arial, sans-serif; }
				.swe-card { position: absolute; min-width: 174px; max-width: 260px; box-sizing: border-box; padding: 8px 9px; border-radius: 7px; background: rgba(255,255,255,.93); color: #252933; box-shadow: 0 8px 24px rgba(0,0,0,.16); border: 1px solid rgba(37,41,51,.12); backdrop-filter: blur(8px); }
				.swe-card-title { font-weight: 700; margin-bottom: 5px; }
				.swe-card-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; white-space: nowrap; }
				.swe-card-row span:last-child { font-weight: 600; }
				.swe-card-flow { margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(37,41,51,.1); }
				.swe-flow-line { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
				.swe-flow-line[data-kind="out"] span:last-child { color: #377d4f; }
				.swe-flow-line[data-kind="in"] span:last-child { color: #a14c42; }
				.swe-toast { position: fixed; left: 50%; bottom: 22px; z-index: 2147483001; transform: translateX(-50%); padding: 7px 10px; border-radius: 7px; background: rgba(37,41,51,.9); color: white; font: 12px/1.35 Montserrat, Arial, sans-serif; pointer-events: none; opacity: 0; transition: opacity .16s ease; }
				.swe-toast.swe-toast-visible { opacity: 1; }
			`
			document.head.appendChild(style)
			state.style = style
		}

		function runToolbarAction(game, action) {
			if (action === 'copy') copySelection(game, false)
			else if (action === 'paste') pasteOrPlace(game)
			else if (action === 'cut') copySelection(game, true)
			else if (action === 'delete') deleteSelection(game)
			else if (action === 'save') saveCurrentBlueprint(game)
			else if (action === 'library') toggleLibrary()
			else if (action === 'rotate') transformPaste('rotate')
			else if (action === 'mirrorX') transformPaste('mirrorX')
			else if (action === 'mirrorY') transformPaste('mirrorY')
			else if (action === 'mode') cyclePlacementMode(1)
			else if (action === 'undo') undo(game)
			else if (action === 'redo') redo(game)
			else if (action === 'close') {
				if (state.paste) cancelPaste()
				else setActive(game, false)
			}
		}

		function toggleEditor(game) {
			setActive(game, !state.active)
		}

		function setActive(game, active) {
			if (!enabled()) active = false
			state.active = !!active
			state.game = game
			if (active) {
				state.mode = state.selections.length ? 'selected' : 'idle'
				delete game.itemInHand
				delete game.transportedEntity
				game.selectedEntity = false
				game.mouse.cursorVisible = true
				game.removeHint?.()
				api.ui?.hud?.hide?.({ force: true })
			} else {
				state.mode = 'idle'
				state.selectStart = null
				state.selectPreview = null
				state.drag = null
				state.paste = null
				state.libraryOpen = false
				api.ui?.hud?.show?.({ force: true })
			}
			document.body.classList.toggle('swe-active', state.active)
			updateDom()
			if (active) toast(text(game, 'enabled'))
		}

		function handleEditorMouseMove(game, xy, dxy, click) {
			if (xy) {
				game.updateMouseData(xy[0], xy[1])
				state.mouse.x = xy[0]
				state.mouse.y = xy[1]
			}
			if (dxy && click === 2) {
				game.translation[0] -= dxy[0]
				game.translation[1] -= dxy[1]
			}
			if (state.mode === 'selecting' && game.hoveredCell) {
				state.selectPreview = normalizeRect(state.selectStart, game.hoveredCell)
			}
			if (state.drag && game.hoveredCell) updateDrag(game)
			if (state.paste && game.hoveredCell) state.paste.anchorCell = game.hoveredCell.slice()
			updateDom()
		}

		function handleEditorDown(game, rightclick) {
			if (rightclick) {
				if (state.paste) cancelPaste()
				else if (state.mode === 'selecting') cancelSelectionPreview()
				return
			}
			const cell = game.hoveredCell ? game.hoveredCell.slice() : null
			if (!cell) return
			if (state.paste) {
				setBlueprintAnchorFromSelection(cell)
				return
			}
			if (state.mode === 'selecting') {
				commitSelection(cell)
				return
			}
			const hit = hitSelectionPart(cell)
			if (hit) {
				startSelectionDrag(hit, cell)
				return
			}
			startSelection(cell, state.ctrlDown || state.mouse.ctrlKey)
		}

		function startSelection(cell, additive) {
			if (!additive) state.selections = []
			state.selectStart = cell.slice()
			state.selectPreview = normalizeRect(cell, cell)
			state.mode = 'selecting'
			updateDom()
		}

		function commitSelection(cell) {
			const rect = normalizeRect(state.selectStart, cell)
			state.selections.push(rect)
			state.selectStart = null
			state.selectPreview = null
			state.mode = 'selected'
			updateDom()
		}

		function cancelSelectionPreview() {
			state.selectStart = null
			state.selectPreview = null
			state.mode = state.selections.length ? 'selected' : 'idle'
			updateDom()
		}

		function startSelectionDrag(hit, cell) {
			state.drag = {
				hit,
				startCell: cell.slice(),
				startSelections: clone(state.selections)
			}
			state.mode = hit.kind === 'move' ? 'movingSelection' : 'resizingSelection'
		}

		function finishDrag() {
			if (!state.drag) return
			state.drag = null
			state.mode = state.selections.length ? 'selected' : 'idle'
			updateDom()
		}

		function updateDrag(game) {
			const drag = state.drag
			const cell = game.hoveredCell
			if (!drag || !cell) return
			if (drag.hit.kind === 'move') {
				const dx = cell[0] - drag.startCell[0]
				const dy = cell[1] - drag.startCell[1]
				state.selections = drag.startSelections.map(function (rect) {
					return normalizeBounds(rect.minX + dx, rect.maxX + dx, rect.minY + dy, rect.maxY + dy)
				})
			} else {
				state.selections = drag.startSelections.map(function (rect, index) {
					if (index !== drag.hit.index) return rect
					const out = Object.assign({}, rect)
					if (drag.hit.handle.indexOf('w') !== -1) out.minX = cell[0]
					if (drag.hit.handle.indexOf('e') !== -1) out.maxX = cell[0]
					if (drag.hit.handle.indexOf('n') !== -1) out.minY = cell[1]
					if (drag.hit.handle.indexOf('s') !== -1) out.maxY = cell[1]
					return normalizeBounds(out.minX, out.maxX, out.minY, out.maxY)
				})
			}
		}

		function clearSelections() {
			state.selections = []
			state.selectStart = null
			state.selectPreview = null
			state.mode = 'idle'
			updateDom()
		}

		function copySelection(game, cut) {
			const blueprint = createBlueprintFromSelections(game)
			if (!blueprint || !blueprint.items.length) {
				toast(text(game, 'nothingToCopy'))
				return
			}
			state.clipboard = blueprint
			state.paste = { blueprint: clone(blueprint), anchorCell: game.hoveredCell ? game.hoveredCell.slice() : [0, 0] }
			state.mode = cut ? 'cutting' : 'pasting'
			if (cut) deleteSelection(game, { asCut: true })
			updateDom()
			toast(cut ? text(game, 'cutReady') : text(game, 'copyReady'))
		}

		function pasteOrPlace(game) {
			if (!state.paste) {
				if (!state.clipboard) {
					toast(text(game, 'nothingToPaste'))
					return
				}
				state.paste = { blueprint: clone(state.clipboard), anchorCell: game.hoveredCell ? game.hoveredCell.slice() : [0, 0] }
				state.mode = 'pasting'
				updateDom()
				return
			}
			placePaste(game)
		}

		function cancelPaste() {
			state.paste = null
			state.mode = state.selections.length ? 'selected' : 'idle'
			updateDom()
		}

		function setBlueprintAnchorFromSelection(cell) {
			if (!state.paste?.blueprint) return
			const blueprint = state.paste.blueprint
			const bounds = getSelectionBounds()
			if (!bounds || !pointInRect(cell, bounds)) return
			blueprint.anchor = [cell[0] - bounds.minX, cell[1] - bounds.minY]
			state.clipboard = clone(blueprint)
			toast('Anchor: ' + blueprint.anchor.join(', '))
			updateDom()
		}

		function transformPaste(kind) {
			const target = state.paste?.blueprint || state.clipboard
			if (!target) {
				toast('No blueprint')
				return
			}
			const transformed = transformBlueprint(target, kind)
			if (state.paste) state.paste.blueprint = transformed
			state.clipboard = clone(transformed)
			updateDom()
		}

		function cyclePlacementMode(direction) {
			const allowOverwrite = api.config.get('allowOverwriteMode', false) === true
			const modes = allowOverwrite ? ['strict', 'skip', 'overwrite'] : ['strict', 'skip']
			let index = modes.indexOf(state.placementMode)
			if (index === -1) index = 0
			index = (index + (direction > 0 ? 1 : -1) + modes.length) % modes.length
			state.placementMode = modes[index]
			updateDom()
		}

		function placePaste(game) {
			const paste = state.paste
			if (!paste?.blueprint || !paste.anchorCell) return
			const plan = buildPlacementPlan(game, paste.blueprint, paste.anchorCell)
			if (state.placementMode === 'strict' && !plan.canStrictPlace) {
				toast(text(game, 'blocked'))
				return
			}
			const placed = []
			const removed = []
			for (const entry of plan.entries) {
				if (entry.uniqueConflict) continue
				if (state.placementMode === 'strict' && entry.status !== 'empty') continue
				if (state.placementMode === 'skip' && entry.status !== 'empty') continue
				if (state.placementMode === 'overwrite' && entry.status === 'conflict') {
					for (const existing of entry.existing) {
						if (!canOverwrite(existing)) continue
						const save = getEntitySave(game, existing)
						if (save) removed.push(save)
						game.clearCell(existing.position)
					}
				}
				if (entry.status !== 'empty' && state.placementMode !== 'overwrite') continue
				const entity = restoreEntitySave(game, entry.save, entry.position)
				if (entity) placed.push(getEntitySave(game, entity))
			}
			if (!placed.length) {
				toast(text(game, 'nothingPlaced'))
				return
			}
			game.shop?.updateElements?.()
			pushUndo({ type: 'paste', placed, removed })
			state.mode = state.selections.length ? 'selected' : 'idle'
			state.paste = null
			updateDom()
			toast(text(game, 'placed') + ': ' + placed.length)
		}

		function deleteSelection(game, options) {
			options = options || {}
			const saves = getSelectedEntitySaves(game)
			if (!saves.length) {
				if (!options.asCut) toast(text(game, 'nothingSelected'))
				return
			}
			for (const save of saves) {
				const entity = game.entityAtCoordinates(save.position)
				if (entity && !entity.indestructible && entity.name !== 'cube') game.clearCell(entity.position)
			}
			game.shop?.updateElements?.()
			if (!options.asCut) pushUndo({ type: 'delete', removed: saves })
			state.selections = []
			state.mode = state.paste ? 'pasting' : 'idle'
			updateDom()
			if (!options.asCut) toast(text(game, 'deleted') + ': ' + saves.length)
		}

		function undo(game) {
			const action = state.undoStack.pop()
			if (!action) return
			applyActionInverse(game, action)
			state.redoStack.push(action)
			updateDom()
		}

		function redo(game) {
			const action = state.redoStack.pop()
			if (!action) return
			applyAction(game, action)
			state.undoStack.push(action)
			updateDom()
		}

		function pushUndo(action) {
			state.undoStack.push(action)
			if (state.undoStack.length > MAX_UNDO) state.undoStack.shift()
			state.redoStack = []
		}

		function applyAction(game, action) {
			if (action.type === 'paste') {
				for (const save of action.removed || []) {
					const entity = game.entityAtCoordinates(save.position)
					if (entity) game.clearCell(entity.position)
				}
				for (const save of action.placed || []) restoreEntitySave(game, save, save.position)
			} else if (action.type === 'delete') {
				for (const save of action.removed || []) {
					const entity = game.entityAtCoordinates(save.position)
					if (entity) game.clearCell(entity.position)
				}
			}
			game.shop?.updateElements?.()
		}

		function applyActionInverse(game, action) {
			if (action.type === 'paste') {
				for (const save of action.placed || []) {
					const entity = game.entityAtCoordinates(save.position)
					if (entity) game.clearCell(entity.position)
				}
				for (const save of action.removed || []) restoreEntitySave(game, save, save.position)
			} else if (action.type === 'delete') {
				for (const save of action.removed || []) restoreEntitySave(game, save, save.position)
			}
			game.shop?.updateElements?.()
		}

		function saveCurrentBlueprint(game) {
			const blueprint = state.paste?.blueprint || createBlueprintFromSelections(game)
			if (!blueprint || !blueprint.items.length) {
				toast(text(game, 'nothingToSave'))
				return
			}
			blueprint.name = 'Blueprint ' + new Date().toLocaleString()
			blueprint.savedAt = Date.now()
			state.blueprints.unshift(blueprint)
			state.blueprints = state.blueprints.slice(0, 30)
			saveBlueprintLibrary()
			renderLibrary()
			toast(text(game, 'saved'))
		}

		function toggleLibrary() {
			state.libraryOpen = !state.libraryOpen
			renderLibrary()
			updateDom()
		}

		function renderLibrary() {
			const root = state.toolbar?.querySelector('.swe-library')
			if (!root) return
			root.hidden = !state.libraryOpen
			if (!state.blueprints.length) {
				root.innerHTML = '<div class="swe-library-empty">No saved blueprints</div>'
				return
			}
			root.innerHTML = ''
			state.blueprints.forEach(function (blueprint, index) {
				const item = document.createElement('div')
				item.className = 'swe-library-item'
				const label = document.createElement('div')
				label.innerHTML = '<span class="swe-library-name"></span><span class="swe-library-meta"></span>'
				label.querySelector('.swe-library-name').textContent = blueprint.name || ('Blueprint ' + (index + 1))
				label.querySelector('.swe-library-meta').textContent = blueprint.width + ' x ' + blueprint.height + ' | ' + blueprint.items.length
				const load = document.createElement('button')
				load.type = 'button'
				load.textContent = 'Load'
				load.addEventListener('click', function (event) {
					event.stopPropagation()
					state.clipboard = clone(blueprint)
					state.paste = { blueprint: clone(blueprint), anchorCell: state.game?.hoveredCell ? state.game.hoveredCell.slice() : [0, 0] }
					state.mode = 'pasting'
					updateDom()
				})
				const remove = document.createElement('button')
				remove.type = 'button'
				remove.textContent = 'X'
				remove.addEventListener('click', function (event) {
					event.stopPropagation()
					state.blueprints.splice(index, 1)
					saveBlueprintLibrary()
					renderLibrary()
				})
				item.append(label, load, remove)
				root.appendChild(item)
			})
		}

		function loadBlueprintLibrary() {
			try {
				const raw = localStorage.getItem(BLUEPRINT_STORAGE_KEY)
				state.blueprints = raw ? JSON.parse(raw) : []
			} catch (error) {
				state.blueprints = []
			}
		}

		function saveBlueprintLibrary() {
			try {
				localStorage.setItem(BLUEPRINT_STORAGE_KEY, JSON.stringify(state.blueprints))
			} catch (error) {}
		}

		function createBlueprintFromSelections(game) {
			const saves = getSelectedEntitySaves(game)
			if (!saves.length) return null
			const bounds = saves.reduce(function (acc, save) {
				const span = getSavedSpan(game, save)
				acc.minX = Math.min(acc.minX, save.position[0] - span)
				acc.maxX = Math.max(acc.maxX, save.position[0] + span)
				acc.minY = Math.min(acc.minY, save.position[1] - span)
				acc.maxY = Math.max(acc.maxY, save.position[1] + span)
				return acc
			}, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })
			const width = bounds.maxX - bounds.minX + 1
			const height = bounds.maxY - bounds.minY + 1
			return {
				version: 1,
				name: 'Temporary blueprint',
				width,
				height,
				anchor: [0, height - 1],
				items: saves.map(function (save) {
					return {
						x: save.position[0] - bounds.minX,
						y: save.position[1] - bounds.minY,
						save: clone(save),
						span: getSavedSpan(game, save)
					}
				})
			}
		}

		function transformBlueprint(blueprint, kind) {
			const next = clone(blueprint)
			if (kind === 'rotate') {
				const width = next.width
				const height = next.height
				next.items.forEach(function (item) {
					const x = item.x
					item.x = height - 1 - item.y
					item.y = x
				})
				const ax = next.anchor[0]
				next.anchor = [height - 1 - next.anchor[1], ax]
				next.width = height
				next.height = width
			} else if (kind === 'mirrorX') {
				next.items.forEach(function (item) {
					item.x = next.width - 1 - item.x
				})
				next.anchor = [next.width - 1 - next.anchor[0], next.anchor[1]]
			} else if (kind === 'mirrorY') {
				next.items.forEach(function (item) {
					item.y = next.height - 1 - item.y
				})
				next.anchor = [next.anchor[0], next.height - 1 - next.anchor[1]]
			}
			return next
		}

		function buildPlacementPlan(game, blueprint, anchorCell) {
			const entries = []
			let canStrictPlace = true
			for (const item of blueprint.items) {
				const position = [
					anchorCell[0] + item.x - blueprint.anchor[0],
					anchorCell[1] + item.y - blueprint.anchor[1]
				]
				const save = clone(item.save)
				save.position = position.slice()
				const existing = uniqueEntitiesForFootprint(game, position, item.span || getSavedSpan(game, save))
				const same = existing.length && existing.every(function (entity) { return entity.name === save.name })
				const uniqueConflict = isUniqueConflict(game, save, existing)
				const status = uniqueConflict ? 'unique' : !existing.length ? 'empty' : same ? 'same' : 'conflict'
				if (status !== 'empty') canStrictPlace = false
				entries.push({ item, save, position, existing, status, uniqueConflict })
			}
			return { entries, canStrictPlace }
		}

		function getSelectedEntitySaves(game) {
			const seen = new Set()
			const out = []
			for (const rect of state.selections) {
				for (let y = rect.minY; y <= rect.maxY; y++) {
					for (let x = rect.minX; x <= rect.maxX; x++) {
						const entity = game.entityAtCoordinates([x, y])
						if (!entity || seen.has(entity)) continue
						seen.add(entity)
						if (entity.indestructible || entity.name === 'cube') continue
						const save = getEntitySave(game, entity)
						if (save) {
							save.__worldEditerSpan = Number(entity.entitySpan) || 0
							out.push(save)
						}
					}
				}
			}
			return out
		}

		function getEntitySave(game, entity) {
			const save = game.getEntityString?.(entity)
			return save ? clone(save) : null
		}

		function restoreEntitySave(game, save, position) {
			if (!save || !game.codex?.entities?.[save.name]) return null
			const next = clone(save)
			next.position = position ? position.slice() : next.position.slice()
			const misc = getRestoreMisc(next)
			const entity = game.addEntity(next.name, next.position, misc, { skipShopUpdate: true })
			if (!entity) return null
			if (next.par) {
				for (const key in next.par) entity[key] = clone(next.par[key])
			}
			entity.position = next.position.slice()
			entity.init?.()
			if (game.codex.entities[next.name]?.onlyone) game.onlyones[next.name] = true
			return entity
		}

		function getRestoreMisc(save) {
			const par = save.par || {}
			if (save.name === 'cube') return { pump: false, resources: par.resources }
			if (save.name === 'surge') return {
				resources: par.resources,
				rayNumber: par.rayNumber,
				grade: par.grade,
				colors: par.colors,
				type: par.type,
				maxLife: par.maxLife,
				life: par.life
			}
			if (save.name === 'waypoint' || save.name === 'waypoint2') return { timestamp: par.timestamp }
			return undefined
		}

		function canOverwrite(entity) {
			return entity && !entity.indestructible && entity.name !== 'cube'
		}

		function isUniqueConflict(game, save, existing) {
			if (!game.codex?.entities?.[save.name]?.onlyone) return false
			if (!game.onlyones?.[save.name]) return false
			return !existing.some(function (entity) { return entity.name === save.name })
		}

		function uniqueEntitiesForFootprint(game, position, span) {
			const out = []
			const seen = new Set()
			for (let y = position[1] - span; y <= position[1] + span; y++) {
				for (let x = position[0] - span; x <= position[0] + span; x++) {
					const entity = game.entityAtCoordinates([x, y])
					if (entity && !seen.has(entity)) {
						seen.add(entity)
						out.push(entity)
					}
				}
			}
			return out
		}

		function getSavedSpan(game, save) {
			if (Number.isFinite(Number(save?.__worldEditerSpan))) return Number(save.__worldEditerSpan) || 0
			const klass = save?.name && game.codex?.entities?.[save.name]?.class
			if (!klass) return 0
			try {
				const probe = new klass(game)
				return Number(probe.entitySpan) || 0
			} catch (error) {
				return Number(save.span) || 0
			}
		}

		function getSelectionStats(game, rect) {
			const occupiedCells = new Set()
			const entities = new Set()
			for (let y = rect.minY; y <= rect.maxY; y++) {
				for (let x = rect.minX; x <= rect.maxX; x++) {
					const entity = game.entityAtCoordinates([x, y])
					if (!entity) continue
					occupiedCells.add(x + ':' + y)
					entities.add(entity)
				}
			}
			const flow = estimateFlow(game, Array.from(entities))
			return {
				total: rect.width * rect.height,
				occupied: occupiedCells.size,
				buildings: Array.from(entities).filter(function (entity) { return entity.name !== 'cube' }).length,
				empty: rect.width * rect.height - occupiedCells.size,
				flow
			}
		}

		function estimateFlow(game, entities) {
			const size = game.resources?.length || game.codex?.resources?.length || 10
			const input = new Array(size).fill(0)
			const output = new Array(size).fill(0)
			for (const entity of entities) {
				if (!entity || entity.name === 'cube') continue
				if ((entity.name === 'pump' || entity.name === 'pump2') && typeof entity.getProbability === 'function') {
					const speed = estimatePumpSpeed(entity)
					const distribution = estimatePumpDistribution(game, entity)
					for (let i = 0; i < size; i++) output[i] += (distribution[i] || 0) * speed
				}
				if (typeof entity.getConversionOutput === 'function' && entity.baseConversionSpeed) {
					const multiplier = estimateConverterMultiplier(entity)
					const rate = entity.baseConversionSpeed * 1000 * multiplier
					const produced = entity.getConversionOutput() || []
					for (let i = 0; i < size; i++) {
						output[i] += (produced[i] || 0) * rate
						input[i] += ((entity.fuel || [])[i] || 0) * rate
					}
				} else if (entity.fuel && entity.state === 2 && entity.fill) {
					const slowRate = 1 / 60
					for (let i = 0; i < size; i++) input[i] += (entity.fuel[i] || 0) * slowRate
				}
				if (entity.name === 'gradient' && typeof entity.getDiscrete === 'function') {
					const power = estimateAdjacentEntropicPower(entity)
					const produced = entity.getDiscrete(power) || []
					for (let i = 0; i < size; i++) output[i] += produced[i] || 0
				}
			}
			return { input, output }
		}

		function estimatePumpSpeed(entity) {
			const pumpSpeed = entity.pumpSpeed || entity.basePumpSpeed || 0
			const aux = entity.active ? 0 : (entity.auxes || []).reduce(function (value, aux) {
				if (aux?.state !== 2) return value
				return Math.max(value, aux.name === 'auxpump2' ? 1 : aux.name === 'auxpump' ? 0.25 : 0)
			}, 0)
			const active = entity.active ? pumpSpeed : 0
			const surge = entity.surgeBoost || 0
			const spooled = (entity.spoolup || 0) >= 1 ? active + (aux + surge) * pumpSpeed : 0
			return spooled * 1000
		}

		function estimatePumpDistribution(game, entity) {
			const resources = game.codex?.resources || []
			const raw = new Array(resources.length).fill(0)
			let sum = 0
			for (let i = 0; i < resources.length; i++) {
				const probabilities = resources[i]?.probabilities || []
				for (const probability of probabilities) {
					raw[i] = Math.max(raw[i], entity.getProbability(probability.point, probability.spread, probability.value, probability.span))
				}
				sum += raw[i]
			}
			return raw.map(function (value) { return sum ? value / sum : 0 })
		}

		function estimateConverterMultiplier(entity) {
			let multiplier = 1
			for (const preheater of entity.preheaters || []) {
				if (preheater?.state === 2) multiplier += preheater.tap ? preheater.tap() : preheater.multiplicator || 0
			}
			if (entity.name === 'converter64') multiplier *= (1 + (entity.reflectorCount || 0) / 8)
			if (entity.name === 'converter64' && entity.alone === false) return 0
			return multiplier
		}

		function estimateAdjacentEntropicPower(entity) {
			let value = 0
			for (const offset of entity.soi || []) {
				const neighbour = entity.master.entityAtCoordinates([entity.position[0] + offset[0], entity.position[1] + offset[1]])
				if (!neighbour || neighbour.state !== 2) continue
				if (neighbour.power && /^entropic/.test(neighbour.name)) value += neighbour.power / (neighbour.interval ? neighbour.interval / 1000 : 1)
			}
			return value
		}

		function renderEditorOverlay(game, ctx = game.ctx, options = {}) {
			if (!ctx) return
			ctx.save()
			try {
				if (options.translateToMap) {
					ctx.setTransform(1, 0, 0, 1, 0, 0)
					ctx.translate(Number(game.w2) || 0, Number(game.h2) || 0)
				}
				drawSelections(game, ctx)
				drawPastePreview(game, ctx)
			} finally {
				ctx.restore()
			}
			renderCards(game)
		}

		function drawSelections(game, ctx) {
			for (const rect of state.selections) drawRect(game, ctx, rect, 'rgba(132, 92, 190, .22)', 'rgba(101, 67, 154, .72)')
			if (state.selectPreview) {
				drawRect(game, ctx, state.selectPreview, 'rgba(145, 92, 206, .26)', 'rgba(94, 82, 170, .86)')
				drawCell(game, ctx, state.selectStart, 'rgba(74, 177, 255, .42)')
				const end = [state.selectPreview.maxX, state.selectPreview.maxY]
				drawCell(game, ctx, end, 'rgba(255, 116, 116, .42)')
			}
			if (game.hoveredCell) drawCell(game, ctx, game.hoveredCell, 'rgba(110, 190, 255, .18)', 'rgba(73, 135, 198, .62)')
			for (const rect of state.selections) drawHandles(game, ctx, rect)
		}

		function drawPastePreview(game, ctx) {
			if (!state.paste?.blueprint || !state.paste.anchorCell) return
			const plan = buildPlacementPlan(game, state.paste.blueprint, state.paste.anchorCell)
			for (const entry of plan.entries) {
				const color = entry.status === 'empty' ? 'rgba(62, 202, 112, .34)' : entry.status === 'same' ? 'rgba(242, 199, 74, .42)' : 'rgba(228, 62, 52, .44)'
				drawFootprint(game, ctx, entry.position, entry.item.span || 0, color, 'rgba(32, 37, 42, .62)')
				drawBlueprintEntity(game, ctx, entry)
			}
			drawCell(game, ctx, state.paste.anchorCell, 'rgba(255, 255, 255, .22)', 'rgba(37, 41, 51, .82)')
		}

		function drawBlueprintEntity(game, ctx, entry) {
			if (!game.codex?.entities?.[entry.save.name]) return
			try {
				const entity = new game.codex.entities[entry.save.name].class(game, getRestoreMisc(entry.save))
				if (entry.save.par) for (const key in entry.save.par) entity[key] = clone(entry.save.par[key])
				entity.position = entry.position.slice()
				ctx.save()
				ctx.globalAlpha = .58
				const c = entry.status === 'empty' ? '#63d88a88' : entry.status === 'same' ? '#ffd45f99' : '#ec554d99'
				if (typeof entity.renderColored === 'function') entity.renderColored(0, entry.position, c)
				else entity.render?.(0, entry.position)
				ctx.restore()
			} catch (error) {}
		}

		function renderEditorCursor(game, ctx = game?.ctx) {
			if (!ctx) return
			const mouse = game.mouse?.offsetxy || [state.mouse.x, state.mouse.y]
			const cell = game.hoveredCell || [0, 0]
			const target = game.uvToXYUntranslated(cell)
			const x = mouse[0] * game.pixelRatio
			const y = mouse[1] * game.pixelRatio
			const angle = Math.atan2(target[1] - y, target[0] - x)
			ctx.save()
			ctx.translate(x, y)
			ctx.rotate(angle)
			ctx.fillStyle = 'rgba(25, 28, 36, .92)'
			ctx.strokeStyle = 'rgba(255, 255, 255, .9)'
			ctx.lineWidth = Math.max(1, game.pixelRatio)
			const size = Math.max(10, game.screenUnit * .24)
			ctx.beginPath()
			ctx.moveTo(size, 0)
			ctx.lineTo(-size * .48, -size * .54)
			ctx.lineTo(-size * .22, 0)
			ctx.lineTo(-size * .48, size * .54)
			ctx.closePath()
			ctx.fill()
			ctx.stroke()
			ctx.restore()
		}

		function drawRect(game, ctx, rect, fill, stroke) {
			const cells = rect.width * rect.height
			if (cells <= 1600) {
				for (let y = rect.minY; y <= rect.maxY; y++) {
					for (let x = rect.minX; x <= rect.maxX; x++) drawCell(game, ctx, [x, y], fill)
				}
			}
			drawRectOutline(game, ctx, rect, stroke)
		}

		function drawFootprint(game, ctx, position, span, fill, stroke) {
			for (let y = position[1] - span; y <= position[1] + span; y++) {
				for (let x = position[0] - span; x <= position[0] + span; x++) drawCell(game, ctx, [x, y], fill)
			}
			drawRectOutline(game, ctx, normalizeBounds(position[0] - span, position[0] + span, position[1] - span, position[1] + span), stroke)
		}

		function drawCell(game, ctx, cell, fill, stroke) {
			if (!cell) return
			const p = game.uvToXY(cell)
			const dx = .866 * game.unit
			const dy = .5 * game.unit
			ctx.save()
			ctx.beginPath()
			ctx.moveTo(p[0], p[1] - dy)
			ctx.lineTo(p[0] + dx, p[1])
			ctx.lineTo(p[0], p[1] + dy)
			ctx.lineTo(p[0] - dx, p[1])
			ctx.closePath()
			if (fill) {
				ctx.fillStyle = fill
				ctx.fill()
			}
			if (stroke) {
				ctx.strokeStyle = stroke
				ctx.lineWidth = Math.max(1, game.pixelRatio)
				ctx.stroke()
			}
			ctx.restore()
		}

		function drawRectOutline(game, ctx, rect, color) {
			const corners = [
				game.uvToXY([rect.minX, rect.minY]),
				game.uvToXY([rect.maxX, rect.minY]),
				game.uvToXY([rect.maxX, rect.maxY]),
				game.uvToXY([rect.minX, rect.maxY])
			]
			ctx.save()
			ctx.strokeStyle = color
			ctx.lineWidth = Math.max(2, game.pixelRatio * 1.5)
			ctx.beginPath()
			ctx.moveTo(corners[0][0], corners[0][1])
			for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i][0], corners[i][1])
			ctx.closePath()
			ctx.stroke()
			ctx.restore()
		}

		function drawHandles(game, ctx, rect) {
			const points = [
				[rect.minX, rect.minY], [Math.round((rect.minX + rect.maxX) / 2), rect.minY], [rect.maxX, rect.minY],
				[rect.maxX, Math.round((rect.minY + rect.maxY) / 2)], [rect.maxX, rect.maxY],
				[Math.round((rect.minX + rect.maxX) / 2), rect.maxY], [rect.minX, rect.maxY],
				[rect.minX, Math.round((rect.minY + rect.maxY) / 2)]
			]
			ctx.save()
			ctx.fillStyle = 'rgba(255,255,255,.92)'
			ctx.strokeStyle = 'rgba(45,52,64,.82)'
			ctx.lineWidth = Math.max(1, game.pixelRatio)
			for (const point of points) {
				const xy = game.uvToXY(point)
				const r = Math.max(3, game.screenUnit * .055)
				ctx.beginPath()
				ctx.arc(xy[0], xy[1], r, 0, Math.PI * 2)
				ctx.fill()
				ctx.stroke()
			}
			ctx.restore()
		}

		function renderCards(game) {
			if (!state.cardLayer || api.config.get('showStatsCards', true) === false) return
			if (!state.active) {
				state.cardLayer.innerHTML = ''
				return
			}
			const cards = []
			const activeRects = state.selectPreview ? [state.selectPreview].concat(state.selections) : state.selections.slice()
			activeRects.forEach(function (rect, index) {
				const stats = getSelectionStats(game, rect)
				const center = game.uvToXYUntranslated([Math.floor((rect.minX + rect.maxX) / 2), Math.floor((rect.minY + rect.maxY) / 2)])
				const html = statsCardHtml(game, rect, stats, index)
				cards.push({ x: Math.min(game.w - 280, Math.max(8, center[0] / game.pixelRatio + 22)), y: Math.min(game.h - 170, Math.max(54, center[1] / game.pixelRatio - 12)), html })
			})
			if (state.paste?.blueprint && game.hoveredCell) {
				const plan = buildPlacementPlan(game, state.paste.blueprint, state.paste.anchorCell || game.hoveredCell)
				cards.push({
					x: Math.min(game.w - 280, Math.max(8, game.mouse.offsetxy[0] + 24)),
					y: Math.min(game.h - 150, Math.max(54, game.mouse.offsetxy[1] + 18)),
					html: pasteCardHtml(game, plan)
				})
			}
			state.cardLayer.innerHTML = cards.map(function (card) {
				return '<div class="swe-card" style="left:' + card.x + 'px;top:' + card.y + 'px">' + card.html + '</div>'
			}).join('')
		}

		function statsCardHtml(game, rect, stats, index) {
			return [
				'<div class="swe-card-title">Selection ' + (index + 1) + '</div>',
				rowHtml(text(game, 'size'), rect.width + ' x ' + rect.height),
				rowHtml(text(game, 'tiles'), stats.total),
				rowHtml(text(game, 'buildings'), stats.buildings),
				rowHtml(text(game, 'empty'), stats.empty),
				flowHtml(game, stats.flow)
			].join('')
		}

		function pasteCardHtml(game, plan) {
			const counts = plan.entries.reduce(function (acc, entry) {
				acc[entry.status] = (acc[entry.status] || 0) + 1
				return acc
			}, {})
			return [
				'<div class="swe-card-title">Paste Preview</div>',
				rowHtml(text(game, 'mode'), text(game, state.placementMode)),
				rowHtml(text(game, 'placeable'), counts.empty || 0),
				rowHtml(text(game, 'same'), counts.same || 0),
				rowHtml(text(game, 'conflict'), (counts.conflict || 0) + (counts.unique || 0)),
				state.placementMode === 'overwrite' ? '<div class="swe-card-flow">' + text(game, 'overwriteWarning') + '</div>' : ''
			].join('')
		}

		function flowHtml(game, flow) {
			const lines = []
			for (let i = 0; i < flow.output.length; i++) {
				if (Math.abs(flow.output[i]) >= 0.001) lines.push('<div class="swe-flow-line" data-kind="out"><span>' + resourceName(game, i) + '</span><span>+' + formatNumber(game, flow.output[i]) + '/s</span></div>')
			}
			for (let i = 0; i < flow.input.length; i++) {
				if (Math.abs(flow.input[i]) >= 0.001) lines.push('<div class="swe-flow-line" data-kind="in"><span>' + resourceName(game, i) + '</span><span>-' + formatNumber(game, flow.input[i]) + '/s</span></div>')
			}
			if (!lines.length) return ''
			return '<div class="swe-card-flow">' + lines.join('') + '</div>'
		}

		function rowHtml(label, value) {
			return '<div class="swe-card-row"><span>' + escapeHtml(String(label)) + '</span><span>' + escapeHtml(String(value)) + '</span></div>'
		}

		function updateDom() {
			if (!state.toolbar) return
			state.toolbar.classList.toggle('swe-visible', state.active)
			const hasSelection = !!state.selections.length
			const hasPaste = !!state.paste
			const hasClipboard = !!state.clipboard
			setButton('copy', !hasSelection)
			setButton('cut', !hasSelection)
			setButton('delete', !hasSelection)
			setButton('paste', !hasClipboard && !hasPaste)
			setButton('save', !(hasSelection || hasPaste))
			setButton('rotate', !(hasPaste || hasClipboard))
			setButton('mirrorX', !(hasPaste || hasClipboard))
			setButton('mirrorY', !(hasPaste || hasClipboard))
			setButton('undo', !state.undoStack.length)
			setButton('redo', !state.redoStack.length)
			const modeButton = state.toolbar.querySelector('[data-action="mode"]')
			if (modeButton) {
				modeButton.textContent = text(state.game, state.placementMode)
				modeButton.dataset.danger = state.placementMode === 'overwrite' ? 'true' : 'false'
			}
			const status = state.toolbar.querySelector('.swe-status')
			if (status) status.textContent = getStatusText()
			renderLibrary()
		}

		function setButton(action, disabled) {
			const button = state.toolbar?.querySelector('[data-action="' + action + '"]')
			if (button) button.disabled = !!disabled
		}

		function getStatusText() {
			if (!state.active) return ''
			if (state.paste?.blueprint) return 'Pasting | ' + state.paste.blueprint.width + ' x ' + state.paste.blueprint.height
			if (state.mode === 'selecting' && state.selectPreview) return 'Selecting | ' + state.selectPreview.width + ' x ' + state.selectPreview.height
			if (state.selections.length) return state.selections.length + ' selection(s)'
			return 'V / Esc'
		}

		function toast(message) {
			let el = document.querySelector('.swe-toast')
			if (!el) {
				el = document.createElement('div')
				el.className = 'swe-toast'
				document.body.appendChild(el)
			}
			el.textContent = message
			el.classList.add('swe-toast-visible')
			clearTimeout(el.__sweTimer)
			el.__sweTimer = setTimeout(function () {
				el.classList.remove('swe-toast-visible')
			}, 1400)
		}

		function hitSelectionPart(cell) {
			for (let i = state.selections.length - 1; i >= 0; i--) {
				const rect = state.selections[i]
				if (!pointInRect(cell, rect)) continue
				const west = cell[0] === rect.minX
				const east = cell[0] === rect.maxX
				const north = cell[1] === rect.minY
				const south = cell[1] === rect.maxY
				if ((west || east || north || south) && (rect.width > 1 || rect.height > 1)) {
					return { kind: 'resize', index: i, handle: (north ? 'n' : '') + (south ? 's' : '') + (west ? 'w' : '') + (east ? 'e' : '') }
				}
				return { kind: 'move', index: i }
			}
			return null
		}

		function getSelectionBounds() {
			if (!state.selections.length) return null
			return state.selections.reduce(function (acc, rect) {
				acc.minX = Math.min(acc.minX, rect.minX)
				acc.maxX = Math.max(acc.maxX, rect.maxX)
				acc.minY = Math.min(acc.minY, rect.minY)
				acc.maxY = Math.max(acc.maxY, rect.maxY)
				return acc
			}, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })
		}

		function normalizeRect(a, b) {
			return normalizeBounds(a[0], b[0], a[1], b[1])
		}

		function normalizeBounds(x1, x2, y1, y2) {
			const minX = Math.min(x1, x2)
			const maxX = Math.max(x1, x2)
			const minY = Math.min(y1, y2)
			const maxY = Math.max(y1, y2)
			return { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 }
		}

		function pointInRect(point, rect) {
			return point[0] >= rect.minX && point[0] <= rect.maxX && point[1] >= rect.minY && point[1] <= rect.maxY
		}

		function resourceName(game, id) {
			try {
				return game.pronounce('resources', id) || ('R' + id)
			} catch (error) {
				return 'R' + id
			}
		}

		function formatNumber(game, value) {
			if (Math.abs(value) < 0.001) return '0'
			if (game?.makeReadable) return game.makeReadable(value)
			if (Math.abs(value) >= 1000) return value.toFixed(1)
			return value.toFixed(value >= 10 ? 1 : 2)
		}

		function text(game, key) {
			const lang = game?.language
			const zh = lang === 'sch' || lang === 'modsch' || lang === 'tch'
			const dict = zh ? zhText : enText
			return dict[key] || enText[key] || key
		}

		const enText = {
			enabled: 'WorldEditer enabled',
			size: 'Size',
			tiles: 'Tiles',
			buildings: 'Buildings',
			empty: 'Empty',
			mode: 'Mode',
			placeable: 'Placeable',
			same: 'Same',
			conflict: 'Conflict',
			strict: 'Strict',
			skip: 'Skip conflicts',
			overwrite: 'Overwrite',
			overwriteWarning: 'Overwrite mode will remove replaceable target buildings.',
			nothingToCopy: 'No selected buildings',
			nothingToPaste: 'No blueprint',
			copyReady: 'Blueprint copied',
			cutReady: 'Blueprint cut',
			blocked: 'Blocked by conflicts',
			nothingPlaced: 'Nothing placed',
			placed: 'Placed',
			nothingSelected: 'No selected buildings',
			deleted: 'Deleted',
			nothingToSave: 'No blueprint to save',
			saved: 'Blueprint saved'
		}
		const zhText = {
			enabled: 'WorldEditer 已启用',
			size: '尺寸',
			tiles: '总格数',
			buildings: '建筑',
			empty: '空格',
			mode: '模式',
			placeable: '可放置',
			same: '同名',
			conflict: '冲突',
			strict: '严格',
			skip: '跳过冲突',
			overwrite: '覆盖',
			overwriteWarning: '覆盖模式会拆除目标位置可替换建筑。',
			nothingToCopy: '选区内没有可复制建筑',
			nothingToPaste: '没有蓝图',
			copyReady: '蓝图已复制',
			cutReady: '蓝图已剪切',
			blocked: '存在冲突，无法放置',
			nothingPlaced: '没有放置任何建筑',
			placed: '已放置',
			nothingSelected: '没有选中建筑',
			deleted: '已删除',
			nothingToSave: '没有可保存蓝图',
			saved: '蓝图已保存'
		}

		function escapeHtml(value) {
			return value.replace(/[&<>"']/g, function (char) {
				return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
			})
		}

		function clone(value) {
			return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
		}
	}
})
