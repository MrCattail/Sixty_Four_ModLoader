ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const DELETE_KEY = Symbol.for('cattail.world-editor.selection-delete')
		const BLUEPRINT_KEY = Symbol.for('cattail.world-editor.blueprint')
		const CUT_KEY = Symbol.for('cattail.world-editor.selection-cut')
		const SERVICE_VERSION = '1.1.0'
		const PLAN_SCHEMA = 1

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const deletion = globalThis[DELETE_KEY]
			const blueprint = globalThis[BLUEPRINT_KEY]
			const previous = globalThis[CUT_KEY]
			previous?.dispose?.('selection-cut-replaced')
			if (
				!runtime ||
				runtime.game !== game ||
				typeof runtime.addCleanup !== 'function' ||
				!deletion ||
				deletion.game !== game ||
				typeof deletion.planSelections !== 'function' ||
				typeof deletion.execute !== 'function' ||
				!blueprint ||
				blueprint.game !== game ||
				typeof blueprint.prepareCut !== 'function' ||
				typeof blueprint.publishCut !== 'function' ||
				typeof blueprint.completeCut !== 'function'
			) {
				console.warn('[Cattail World Editor] Selection cut 4C-1b could not find its core services.')
				return
			}

			const service = createService(game, deletion, blueprint)
			Object.defineProperty(globalThis, CUT_KEY, {
				value: service,
				configurable: true,
				writable: true
			})
			runtime.addCleanup(function () {
				service.dispose('runtime-disposed')
			})
			console.info('[Cattail World Editor] Safe selection cut 4C-1b ready.')
		})

		function createService(game, deletion, blueprint) {
			const listeners = new Set()
			let disposed = false
			let planning = false
			let busy = false
			let dialogOpen = false
			let phase = 'idle'
			let revision = 0
			let planToken = 0
			let lastReason = 'initialized'
			let lastPlan = null
			let lastResult = null
			let error = null

			function snapshot() {
				return deepFreeze({
					version: SERVICE_VERSION,
					ready: !disposed,
					planning: !disposed && planning,
					busy: !disposed && busy,
					dialogOpen: !disposed && dialogOpen,
					phase: disposed ? 'idle' : phase,
					revision,
					lastReason,
					lastPlan: lastPlan ? publicPlan(lastPlan) : null,
					lastResult,
					error,
					disposed
				})
			}

			function notify(reason) {
				if (disposed) return
				if (reason) lastReason = String(reason)
				revision += 1
				const current = snapshot()
				for (const listener of Array.from(listeners)) {
					try {
						listener(current)
					} catch (listenerError) {
						console.warn('[Cattail World Editor] Selection cut listener failed.', listenerError)
					}
				}
			}

			async function plan(options) {
				if (disposed) throw cutError('NOT_READY', 'Selection cut is unavailable.')
				if (planning || busy || dialogOpen || deletion.isInputBlocked?.() || blueprint.snapshot?.().capturing) {
					throw cutError('BUSY', 'Another World Editor operation is running.')
				}
				const token = ++planToken
				planning = true
				phase = 'planning'
				error = null
				notify('selection-cut-planning-started')
				try {
					const requestedOptions = normalizeCutOptions(options)
					const deletionPlan = await deletion.planSelections(requestedOptions)
					if (token !== planToken || disposed) throw cutError('INVALIDATED', 'Selection cut planning was cancelled.')
					const safeCount = nonNegativeInteger(deletionPlan?.summary?.safeCount)
					let candidate
					try {
						candidate = await blueprint.prepareCut(deletionPlan)
					} catch (candidateError) {
						throw normalizeCandidateError(candidateError)
					}
					const effectiveOptions = normalizeCutOptions(requestedOptions, deletionPlan?.summary?.creative === true)
					const result = deepFreeze({
						schema: PLAN_SCHEMA,
						deletionPlan,
						candidate,
						options: effectiveOptions,
						replacesBlueprint: !!blueprint.snapshot?.().blueprint,
						summary: {
							sourceCellCount: nonNegativeInteger(deletionPlan?.summary?.sourceCellCount),
							safeCount,
							protectedCount: nonNegativeInteger(deletionPlan?.summary?.protectedCount),
							crossBoundaryCount: nonNegativeInteger(deletionPlan?.summary?.crossBoundaryCount),
							resourceDelta: Array.isArray(deletionPlan?.summary?.resourceDelta)
								? deletionPlan.summary.resourceDelta.slice()
								: [],
							creative: deletionPlan?.summary?.creative === true,
							buildingCount: nonNegativeInteger(deletionPlan?.summary?.buildingCount),
							cubeCount: nonNegativeInteger(candidate?.blueprint?.blocks?.length),
							surgeCount: nonNegativeInteger(candidate?.blueprint?.surges?.length)
						}
					})
					lastPlan = result
					phase = candidate ? 'planned' : 'nothing'
					return result
				} catch (planError) {
					error = publicError(planError)
					phase = planError?.code === 'INVALIDATED' ? 'cancelled' : 'failed'
					throw planError
				} finally {
					if (token === planToken) {
						planning = false
						notify('selection-cut-planning-' + phase)
					}
				}
			}

			async function execute(planValue, input, options) {
				if (disposed) return rejectedResult('NOT_READY', 'Selection cut is unavailable.')
				if (planning || busy || deletion.isInputBlocked?.() || blueprint.snapshot?.().capturing) {
					return rejectedResult('BUSY', 'Another World Editor operation is running.')
				}
				let planRequest
				try {
					planRequest = normalizePlan(planValue)
				} catch (planError) {
					return rejectedResult(planError?.code || 'INVALID_PLAN', planError?.message)
				}
				if (!planRequest.candidate) return rejectedResult('NOTHING_SAFE', 'The selection contains no capturable blueprint content.')

				busy = true
				phase = 'planning'
				error = null
				notify('selection-cut-execution-planning')
				const requestedOptions = normalizeCutOptions(options, planRequest.summary.creative === true)
				if (!sameCutOptions(requestedOptions, planRequest.options)) {
					try {
						const deletionPlan = await deletion.planSelections(requestedOptions)
						const candidate = await blueprint.prepareCut(deletionPlan)
						planRequest = normalizePlan(Object.assign({}, planRequest, {
							deletionPlan,
							candidate,
							options: requestedOptions,
							summary: Object.assign({}, planRequest.summary, {
								safeCount: nonNegativeInteger(deletionPlan?.summary?.safeCount),
								protectedCount: nonNegativeInteger(deletionPlan?.summary?.protectedCount),
								crossBoundaryCount: nonNegativeInteger(deletionPlan?.summary?.crossBoundaryCount),
								resourceDelta: Array.isArray(deletionPlan?.summary?.resourceDelta) ? deletionPlan.summary.resourceDelta.slice() : [],
								buildingCount: nonNegativeInteger(deletionPlan?.summary?.buildingCount)
							})
						}))
					} catch (replanError) {
						error = publicError(normalizeCandidateError(replanError), 'CUT_PLAN_FAILED')
						phase = 'failed'
						lastResult = rejectedResult(error.code, error.message)
						busy = false
						notify('selection-cut-execution-failed')
						return lastResult
					}
				}
				phase = 'copying'
				notify('selection-cut-copying')
				let published
				try {
					published = await blueprint.publishCut(planRequest.candidate, 'selection-cut-copied')
				} catch (clipboardError) {
					published = {
						status: 'clipboard-failed',
						error: publicError(clipboardError, 'CLIPBOARD_FAILED')
					}
				}
				if (published?.status !== 'ready') {
					const copied = published?.clipboard === 'ready'
					const publishedError = published?.error || {
						code: 'CLIPBOARD_FAILED',
						message: 'The cut blueprint could not be written to the clipboard.'
					}
					error = publicError(publishedError, 'CLIPBOARD_FAILED')
					phase = copied ? 'copied-only' : 'failed'
					lastResult = deepFreeze({
						accepted: true,
						executed: false,
						copied,
						deleted: false,
						reason: copied ? 'copied-only' : 'clipboard-failed',
						transaction: null,
						snapshotId: null,
						error
					})
					busy = false
					notify(copied ? 'selection-cut-copied-only' : 'selection-cut-clipboard-failed')
					return lastResult
				}

				if (!planRequest.summary.safeCount) {
					blueprint.completeCut(
						published.cutToken,
						{ status: 'success' },
						'selection-cut-copy-complete'
					)
					phase = 'success'
					lastResult = deepFreeze({
						accepted: true,
						executed: true,
						copied: true,
						deleted: false,
						reason: 'success-retained-layers',
						transaction: null,
						snapshotId: null,
						options: planRequest.options,
						error: null
					})
					busy = false
					notify('selection-cut-execution-success')
					return lastResult
				}

				phase = 'deleting'
				notify('selection-cut-deleting')
				try {
					const deletionResult = await deletion.execute(
						planRequest.deletionPlan,
						normalizeInput(input),
						{ origin: 'cut' }
					)
					if (deletionResult?.executed === true) {
						blueprint.completeCut(
							published.cutToken,
							{ status: 'success' },
							'selection-cut-complete'
						)
						phase = 'success'
						lastResult = deepFreeze({
							accepted: true,
							executed: true,
							copied: true,
							deleted: true,
							reason: 'success',
							transaction: deletionResult.transaction || null,
							snapshotId: deletionResult.snapshotId || null,
							deletion: deletionResult,
							error: null
						})
					} else {
						const deletionError = deletionResult?.error || {
							code: 'CUT_DELETE_FAILED',
							message: 'The blueprint was copied, but the selected buildings were not deleted.'
						}
						const cutStatus = String(deletionError.code || '') === 'ROLLBACK_FAILED'
							? 'failed'
							: 'copied-only'
						blueprint.completeCut(
							published.cutToken,
							{ status: cutStatus, error: deletionError },
							'selection-cut-' + cutStatus
						)
						error = publicError(deletionError, 'CUT_DELETE_FAILED')
						phase = cutStatus === 'failed' ? 'blocked' : 'copied-only'
						lastResult = deepFreeze({
							accepted: true,
							executed: false,
							copied: true,
							deleted: false,
							reason: cutStatus,
							transaction: deletionResult?.transaction || null,
							snapshotId: deletionResult?.snapshotId || null,
							deletion: deletionResult || null,
							error
						})
					}
					return lastResult
				} catch (executionError) {
					error = publicError(executionError, 'CUT_DELETE_FAILED')
					blueprint.completeCut(
						published.cutToken,
						{ status: 'copied-only', error },
						'selection-cut-copied-only'
					)
					phase = 'copied-only'
					lastResult = deepFreeze({
						accepted: true,
						executed: false,
						copied: true,
						deleted: false,
						reason: 'copied-only',
						transaction: null,
						snapshotId: null,
						error
					})
					return lastResult
				} finally {
					busy = false
					notify('selection-cut-execution-' + phase)
				}
			}

			const service = Object.freeze({
				version: SERVICE_VERSION,
				planSchema: PLAN_SCHEMA,
				game,
				snapshot,
				plan,
				execute,
				subscribe(listener) {
					if (typeof listener !== 'function') throw new TypeError('Selection cut listener must be a function.')
					if (disposed) return function () {}
					listeners.add(listener)
					listener(snapshot())
					return function () {
						listeners.delete(listener)
					}
				},
				setDialogOpen(next, reason) {
					if (disposed) return false
					next = next === true
					if (dialogOpen === next) return false
					dialogOpen = next
					notify(reason || (next ? 'selection-cut-dialog-opened' : 'selection-cut-dialog-closed'))
					return true
				},
				isInputBlocked() {
					return !disposed && (planning || busy || dialogOpen)
				},
				dispose(reason) {
					if (disposed) return false
					disposed = true
					planToken += 1
					dialogOpen = false
					listeners.clear()
					lastReason = String(reason || 'disposed')
					if (globalThis[CUT_KEY] === service) delete globalThis[CUT_KEY]
					return true
				}
			})
			return service
		}

		function normalizePlan(value) {
			const safeCount = nonNegativeInteger(value?.summary?.safeCount)
			const candidateValid = value?.candidate == null
				? safeCount === 0
				: (
					Number(value?.candidate?.schema) === 1 &&
					value.candidate?.cutToken === value?.deletionPlan?.signature
				)
			if (
				Number(value?.schema) !== PLAN_SCHEMA ||
				Number(value?.deletionPlan?.schema) !== 1 ||
				typeof value?.deletionPlan?.signature !== 'string' ||
				!value.deletionPlan.signature ||
				!candidateValid ||
				!value?.summary
			) {
				throw cutError('INVALID_PLAN', 'A valid selection cut plan is required.')
			}
			return Object.assign({}, value, {
				options: normalizeCutOptions(value.options, value.summary?.creative === true)
			})
		}

		function normalizeCutOptions(value, creative) {
			const enabled = creative === undefined ? true : creative === true
			return {
				removeCubes: enabled && value?.removeCubes === true,
				removeSurges: enabled && value?.removeSurges === true
			}
		}

		function sameCutOptions(left, right) {
			return !!left?.removeCubes === !!right?.removeCubes && !!left?.removeSurges === !!right?.removeSurges
		}

		function normalizeCandidateError(error) {
			const message = String(error?.message || 'Cut blueprint preparation failed.')
			if (message === 'cut-target-changed' || message === 'cut-plane-changed') {
				return cutError('TARGET_CHANGED', 'The selection target changed while the cut blueprint was prepared.')
			}
			return cutError('BLUEPRINT_FAILED', message)
		}

		function publicPlan(plan) {
			return {
				schema: plan.schema,
				replacesBlueprint: plan.replacesBlueprint,
				summary: plan.summary,
				signature: plan.deletionPlan?.signature || '',
				options: plan.options
			}
		}

		function rejectedResult(code, message) {
			return deepFreeze({
				accepted: false,
				executed: false,
				copied: false,
				deleted: false,
				reason: String(code || 'CUT_FAILED').toLowerCase().replace(/_/g, '-'),
				transaction: null,
				snapshotId: null,
				error: {
					code: String(code || 'CUT_FAILED'),
					message: String(message || 'Selection cut failed.')
				}
			})
		}

		function publicError(value, fallbackCode) {
			if (!value) return null
			return {
				code: String(value.code || fallbackCode || 'CUT_FAILED'),
				message: String(value.message || 'Selection cut failed.')
			}
		}

		function cutError(code, message) {
			const error = new Error(String(message || code || 'Selection cut failed.'))
			error.code = String(code || 'CUT_FAILED')
			return error
		}

		function normalizeInput(value) {
			const input = String(value || 'api')
			return ['mouse', 'keyboard', 'gamepad', 'touch', 'api'].includes(input) ? input : 'api'
		}

		function nonNegativeInteger(value) {
			return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0
		}

		function deepFreeze(value) {
			if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
			Object.freeze(value)
			for (const key of Object.keys(value)) deepFreeze(value[key])
			return value
		}
	}
})
