ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const RESIZE_HANDLES = Object.freeze({
			'minU-minV': Object.freeze({ u: 'min', v: 'min' }),
			'midU-minV': Object.freeze({ u: null, v: 'min' }),
			'maxU-minV': Object.freeze({ u: 'max', v: 'min' }),
			'maxU-midV': Object.freeze({ u: 'max', v: null }),
			'maxU-maxV': Object.freeze({ u: 'max', v: 'max' }),
			'midU-maxV': Object.freeze({ u: null, v: 'max' }),
			'minU-maxV': Object.freeze({ u: 'min', v: 'max' }),
			'minU-midV': Object.freeze({ u: 'min', v: null })
		})
		let refreshMountedPlane = null

		api.on('afterVanillaScripts', function () {
			if (typeof Game === 'undefined' || !Game.prototype || typeof Game.prototype.switchPlane !== 'function') return
			api.patch(Game.prototype, 'switchPlane', function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					if (typeof refreshMountedPlane === 'function') refreshMountedPlane(this)
					return result
				}
			})
		})

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Selection 2F could not find the editor runtime.')
				return
			}

			const previous = globalThis[SELECTION_KEY]
			if (previous && typeof previous.dispose === 'function') previous.dispose('selection-replaced')

			const selection = createSelection(game)
			Object.defineProperty(globalThis, SELECTION_KEY, {
				value: selection,
				configurable: true,
				writable: true
			})

			let currentPlane = game.plane ? 1 : 0
			refreshMountedPlane = function (switchedGame) {
				if (switchedGame !== game) return
				const nextPlane = game.plane ? 1 : 0
				if (nextPlane === currentPlane) return
				currentPlane = nextPlane
				selection.clear('plane-changed')
			}

			const stopRuntimeSubscription = runtime.subscribe(function (state) {
				if (!state.active) selection.clear('editor-inactive')
			})

			runtime.addCleanup(function () {
				if (refreshMountedPlane && globalThis[SELECTION_KEY] === selection) refreshMountedPlane = null
				if (typeof stopRuntimeSubscription === 'function') stopRuntimeSubscription()
				selection.dispose('runtime-disposed')
			})

			console.info('[Cattail World Editor] Selection 2G ready.')
		})

		function createSelection(game) {
			let selections = []
			let primaryId = null
			let nextSelectionId = 1
			let previewRange = null
			let previewPlane = null
			let previewMode = null
			let moveSession = null
			let resizeSession = null
			let revision = 0
			let lastReason = 'initialized'
			let disposed = false
			const listeners = new Set()

			function primaryEntry() {
				return selections.find(function (entry) {
					return entry.id === primaryId
				}) || null
			}

			function createEntry(range, plane, id) {
				return Object.freeze({
					id: Number.isInteger(id) ? id : nextSelectionId++,
					range: cloneRange(range),
					plane: plane ? 1 : 0
				})
			}

			function selectionSnapshot(entry) {
				return {
					id: entry.id,
					range: cloneRange(entry.range),
					plane: entry.plane,
					primary: entry.id === primaryId
				}
			}

			function replaceEntryRange(id, range, plane) {
				let replaced = false
				selections = selections.map(function (entry) {
					if (entry.id !== id) return entry
					replaced = true
					return createEntry(range, plane, entry.id)
				})
				return replaced
			}

			function snapshot() {
				const primary = primaryEntry()
				return {
					version: '0.2.6',
					selections: selections.map(selectionSnapshot),
					primaryId,
					selectionCount: selections.length,
					selectedCell: primary ? primary.range.start.slice() : null,
					selectedRange: primary ? cloneRange(primary.range) : null,
					previewRange: cloneRange(previewRange),
					previewKind: previewRange ? (moveSession ? 'move' : resizeSession ? 'resize' : 'selection') : null,
					previewSource: previewRange ? (moveSession?.source || resizeSession?.source || 'pointer') : null,
					previewMode: previewRange && !moveSession && !resizeSession ? previewMode : null,
					previewTargetId: moveSession?.targetId || resizeSession?.targetId || null,
					resizeHandle: resizeSession ? currentResizeHandle(previewRange || primary?.range, resizeSession) : null,
					resizeOriginHandle: resizeSession ? resizeSession.handle : null,
					plane: previewRange ? previewPlane : primary ? primary.plane : null,
					revision,
					lastReason,
					disposed
				}
			}

			function notify() {
				const current = snapshot()
				for (const listener of Array.from(listeners)) {
					try {
						listener(current)
					} catch (error) {
						console.warn('[Cattail World Editor] Selection listener failed.', error)
					}
				}
			}

			function select(cell, plane, reason) {
				if (disposed) return false
				const normalized = normalizeCell(cell)
				if (!normalized) return false
				const normalizedPlane = plane ? 1 : 0
				const nextRange = createRange(normalized, normalized)
				const primary = primaryEntry()
				if (
					!previewRange &&
					selections.length === 1 &&
					primary?.plane === normalizedPlane &&
					rangesEqual(primary.range, nextRange)
				) {
					return false
				}
				const entry = createEntry(nextRange, normalizedPlane)
				selections = [entry]
				primaryId = entry.id
				previewRange = null
				previewPlane = null
				previewMode = null
				moveSession = null
				resizeSession = null
				revision += 1
				lastReason = String(reason || 'selected')
				notify()
				return true
			}

			function begin(cell, plane, reason, options) {
				if (disposed) return false
				const normalized = normalizeCell(cell)
				if (!normalized) return false
				const normalizedPlane = plane ? 1 : 0
				const nextRange = createRange(normalized, normalized)
				const nextMode = options === true || options?.additive ? 'append' : 'replace'
				if (
					previewPlane === normalizedPlane &&
					previewMode === nextMode &&
					rangesEqual(previewRange, nextRange)
				) {
					return false
				}
				moveSession = null
				resizeSession = null
				previewRange = nextRange
				previewPlane = normalizedPlane
				previewMode = nextMode
				revision += 1
				lastReason = String(reason || 'preview-started')
				notify()
				return true
			}

			function updatePreview(cell, plane, reason) {
				if (disposed || !previewRange || moveSession || resizeSession) return false
				const normalized = normalizeCell(cell)
				const normalizedPlane = plane ? 1 : 0
				if (!normalized || normalizedPlane !== previewPlane) return false
				const nextRange = createRange(previewRange.start, normalized)
				if (rangesEqual(previewRange, nextRange)) return false
				previewRange = nextRange
				revision += 1
				lastReason = String(reason || 'preview-updated')
				notify()
				return true
			}

			function commit(cell, plane, reason) {
				if (disposed || !previewRange || moveSession || resizeSession) return false
				const normalized = normalizeCell(cell)
				const normalizedPlane = plane ? 1 : 0
				if (!normalized || normalizedPlane !== previewPlane) return false
				const nextRange = createRange(previewRange.start, normalized)
				const entry = createEntry(nextRange, normalizedPlane)
				selections = previewMode === 'append'
					? selections.concat(entry)
					: [entry]
				primaryId = entry.id
				previewRange = null
				previewPlane = null
				previewMode = null
				moveSession = null
				resizeSession = null
				revision += 1
				lastReason = String(reason || 'selection-committed')
				notify()
				return true
			}

			function beginMove(cell, plane, reason, source) {
				const primary = primaryEntry()
				if (disposed || previewRange || !primary) return false
				const normalized = normalizeCell(cell)
				const normalizedPlane = plane ? 1 : 0
				if (!normalized || normalizedPlane !== primary.plane || !rangeContains(primary.range, normalized)) return false
				moveSession = {
					targetId: primary.id,
					anchor: normalized,
					originRange: primary.range,
					source: normalizeSource(source)
				}
				resizeSession = null
				previewRange = createRange(primary.range.start, primary.range.end)
				previewPlane = primary.plane
				previewMode = null
				revision += 1
				lastReason = String(reason || 'move-started')
				notify()
				return true
			}

			function updateMove(cell, plane, reason) {
				if (disposed || !moveSession || !previewRange) return false
				const nextRange = movedRange(cell, plane)
				if (!nextRange || rangesEqual(previewRange, nextRange)) return false
				previewRange = nextRange
				revision += 1
				lastReason = String(reason || 'move-updated')
				notify()
				return true
			}

			function commitMove(cell, plane, reason) {
				if (disposed || !moveSession || !previewRange) return false
				const nextRange = movedRange(cell, plane)
				if (!nextRange) return false
				if (!replaceEntryRange(moveSession.targetId, nextRange, previewPlane)) return false
				previewRange = null
				previewPlane = null
				previewMode = null
				moveSession = null
				resizeSession = null
				revision += 1
				lastReason = String(reason || 'move-committed')
				notify()
				return true
			}

			function movedRange(cell, plane) {
				const normalized = normalizeCell(cell)
				const normalizedPlane = plane ? 1 : 0
				if (!normalized || normalizedPlane !== previewPlane || !moveSession) return null
				const deltaU = normalized[0] - moveSession.anchor[0]
				const deltaV = normalized[1] - moveSession.anchor[1]
				return createRange(
					[
						moveSession.originRange.start[0] + deltaU,
						moveSession.originRange.start[1] + deltaV
					],
					[
						moveSession.originRange.end[0] + deltaU,
						moveSession.originRange.end[1] + deltaV
					]
				)
			}

			function beginResize(handle, cell, plane, reason, source) {
				const primary = primaryEntry()
				if (disposed || previewRange || !primary) return false
				const definition = RESIZE_HANDLES[handle]
				const normalized = normalizeCell(cell)
				const normalizedPlane = plane ? 1 : 0
				if (!definition || !normalized || normalizedPlane !== primary.plane) return false
				resizeSession = {
					targetId: primary.id,
					handle,
					anchor: normalized,
					originRange: primary.range,
					source: normalizeSource(source),
					uOwner: definition.u ? endpointOwner(primary.range, 0, definition.u) : null,
					vOwner: definition.v ? endpointOwner(primary.range, 1, definition.v) : null
				}
				moveSession = null
				previewRange = createRange(primary.range.start, primary.range.end)
				previewPlane = primary.plane
				previewMode = null
				revision += 1
				lastReason = String(reason || 'resize-started')
				notify()
				return true
			}

			function updateResize(cell, plane, reason) {
				if (disposed || !resizeSession || !previewRange) return false
				const nextRange = resizedRange(cell, plane)
				if (!nextRange || rangesEqual(previewRange, nextRange)) return false
				previewRange = nextRange
				revision += 1
				lastReason = String(reason || 'resize-updated')
				notify()
				return true
			}

			function commitResize(cell, plane, reason) {
				if (disposed || !resizeSession || !previewRange) return false
				const nextRange = resizedRange(cell, plane)
				if (!nextRange) return false
				if (!replaceEntryRange(resizeSession.targetId, nextRange, previewPlane)) return false
				previewRange = null
				previewPlane = null
				previewMode = null
				moveSession = null
				resizeSession = null
				revision += 1
				lastReason = String(reason || 'resize-committed')
				notify()
				return true
			}

			function resizedRange(cell, plane) {
				const normalized = normalizeCell(cell)
				const normalizedPlane = plane ? 1 : 0
				if (!normalized || normalizedPlane !== previewPlane || !resizeSession) return null
				const start = resizeSession.originRange.start.slice()
				const end = resizeSession.originRange.end.slice()
				const deltaU = normalized[0] - resizeSession.anchor[0]
				const deltaV = normalized[1] - resizeSession.anchor[1]
				if (resizeSession.uOwner) {
					const endpoint = resizeSession.uOwner === 'start' ? start : end
					endpoint[0] += deltaU
				}
				if (resizeSession.vOwner) {
					const endpoint = resizeSession.vOwner === 'start' ? start : end
					endpoint[1] += deltaV
				}
				return createRange(start, end)
			}

			function currentResizeHandle(range, session) {
				const definition = RESIZE_HANDLES[session.handle]
				if (!range || !definition) return session.handle
				const uSide = session.uOwner
					? endpointSide(range, session.uOwner, 0, definition.u)
					: 'mid'
				const vSide = session.vOwner
					? endpointSide(range, session.vOwner, 1, definition.v)
					: 'mid'
				return uSide + 'U-' + vSide + 'V'
			}

			function cancelPreview(reason) {
				if (disposed || !previewRange) return false
				previewRange = null
				previewPlane = null
				previewMode = null
				moveSession = null
				resizeSession = null
				revision += 1
				lastReason = String(reason || 'preview-cancelled')
				notify()
				return true
			}

			function clear(reason) {
				if (disposed || (!selections.length && !previewRange)) return false
				selections = []
				primaryId = null
				previewRange = null
				previewPlane = null
				previewMode = null
				moveSession = null
				resizeSession = null
				revision += 1
				lastReason = String(reason || 'cleared')
				notify()
				return true
			}

			const selection = Object.freeze({
				version: '0.2.6',
				resizeHandles: Object.freeze(Object.keys(RESIZE_HANDLES)),
				game,
				snapshot,
				select,
				begin,
				updatePreview,
				commit,
				beginMove,
				updateMove,
				commitMove,
				beginResize,
				updateResize,
				commitResize,
				cancelPreview,
				clear,
				setPrimary(id, reason) {
					if (disposed || previewRange || !Number.isInteger(Number(id))) return false
					const normalizedId = Number(id)
					const index = selections.findIndex(function (entry) {
						return entry.id === normalizedId
					})
					if (index < 0) return false
					if (primaryId === normalizedId && index === selections.length - 1) return false
					const next = selections.slice()
					const entry = next.splice(index, 1)[0]
					next.push(entry)
					selections = next
					primaryId = normalizedId
					revision += 1
					lastReason = String(reason || 'primary-changed')
					notify()
					return true
				},
				remove(id, reason) {
					if (disposed || previewRange || !Number.isInteger(Number(id))) return false
					const normalizedId = Number(id)
					const index = selections.findIndex(function (entry) {
						return entry.id === normalizedId
					})
					if (index < 0) return false
					selections = selections.slice(0, index).concat(selections.slice(index + 1))
					if (primaryId === normalizedId) {
						primaryId = selections.length ? selections[selections.length - 1].id : null
					}
					revision += 1
					lastReason = String(reason || 'selection-removed')
					notify()
					return true
				},
				removePrimary(reason) {
					return primaryId === null ? false : selection.remove(primaryId, reason || 'primary-removed')
				},
				selectionAt(cell, plane) {
					const normalized = normalizeCell(cell)
					const normalizedPlane = plane ? 1 : 0
					if (!normalized) return null
					const primary = primaryEntry()
					if (primary?.plane === normalizedPlane && rangeContains(primary.range, normalized)) return primary.id
					for (let index = selections.length - 1; index >= 0; index -= 1) {
						const entry = selections[index]
						if (entry.plane === normalizedPlane && rangeContains(entry.range, normalized)) return entry.id
					}
					return null
				},
				hasPreview() {
					return !disposed && !!previewRange
				},
				isMoving() {
					return !disposed && !!moveSession
				},
				isResizing() {
					return !disposed && !!resizeSession
				},
				isSelected(cell, plane) {
					return !disposed && selection.selectionAt(cell, plane) !== null
				},
				isPrimarySelected(cell, plane) {
					const normalized = normalizeCell(cell)
					const primary = primaryEntry()
					return !!(
						!disposed &&
						normalized &&
						primary &&
						primary.plane === (plane ? 1 : 0) &&
						rangeContains(primary.range, normalized)
					)
				},
				subscribe(listener) {
					if (typeof listener !== 'function') throw new TypeError('World Editor selection listener must be a function.')
					if (disposed) return function () {}
					listeners.add(listener)
					try {
						listener(snapshot())
					} catch (error) {
						console.warn('[Cattail World Editor] Selection listener failed.', error)
					}
					return function () {
						listeners.delete(listener)
					}
				},
				dispose(reason) {
					if (disposed) return false
					if (selections.length || previewRange) clear(reason || 'disposed')
					disposed = true
					listeners.clear()
					if (globalThis[SELECTION_KEY] === selection) delete globalThis[SELECTION_KEY]
					return true
				}
			})

			return selection
		}

		function normalizeCell(cell) {
			if (!Array.isArray(cell) || cell.length < 2) return null
			const u = Number(cell[0])
			const v = Number(cell[1])
			if (!Number.isInteger(u) || !Number.isInteger(v)) return null
			return [u, v]
		}

		function normalizeSource(source) {
			return source === 'wheel' ? 'wheel' : 'pointer'
		}

		function createRange(start, end) {
			const normalizedStart = normalizeCell(start)
			const normalizedEnd = normalizeCell(end)
			if (!normalizedStart || !normalizedEnd) return null
			const minU = Math.min(normalizedStart[0], normalizedEnd[0])
			const maxU = Math.max(normalizedStart[0], normalizedEnd[0])
			const minV = Math.min(normalizedStart[1], normalizedEnd[1])
			const maxV = Math.max(normalizedStart[1], normalizedEnd[1])
			return Object.freeze({
				start: Object.freeze(normalizedStart),
				end: Object.freeze(normalizedEnd),
				minU,
				maxU,
				minV,
				maxV,
				width: maxU - minU + 1,
				height: maxV - minV + 1
			})
		}

		function cloneRange(range) {
			if (!range) return null
			return {
				start: range.start.slice(),
				end: range.end.slice(),
				minU: range.minU,
				maxU: range.maxU,
				minV: range.minV,
				maxV: range.maxV,
				width: range.width,
				height: range.height
			}
		}

		function rangesEqual(left, right) {
			return !!(
				left &&
				right &&
				left.start[0] === right.start[0] &&
				left.start[1] === right.start[1] &&
				left.end[0] === right.end[0] &&
				left.end[1] === right.end[1]
			)
		}

		function rangeContains(range, cell) {
			return !!(
				range &&
				cell &&
				cell[0] >= range.minU &&
				cell[0] <= range.maxU &&
				cell[1] >= range.minV &&
				cell[1] <= range.maxV
			)
		}

		function endpointOwner(range, axis, side) {
			const start = Number(range.start[axis])
			const end = Number(range.end[axis])
			if (side === 'min') return start <= end ? 'start' : 'end'
			if (side === 'max') return start > end ? 'start' : 'end'
			return null
		}

		function endpointSide(range, owner, axis, tieSide) {
			const endpoint = owner === 'start' ? range.start : range.end
			const other = owner === 'start' ? range.end : range.start
			const value = Number(endpoint[axis])
			const otherValue = Number(other[axis])
			if (value < otherValue) return 'min'
			if (value > otherValue) return 'max'
			return tieSide === 'max' ? 'max' : 'min'
		}
	}
})
