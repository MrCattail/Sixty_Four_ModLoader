ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const PRODUCTION_KEY = Symbol.for('cattail.world-editor.production')
		const BLUEPRINT_KEY = Symbol.for('cattail.world-editor.blueprint')
		const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
		const CARD_OPACITY_KEY = Symbol.for('cattail.world-editor.card-opacity')
		const SHARED_KEY = Symbol.for('cattail.world-editor.shared')
		const SELECTION_CARD_ID = 'cattail-world-editor-selection-card'
		const BLUEPRINT_CARD_ID = 'cattail-world-editor-blueprint-card'
		const SELECTION_PRODUCTION_CARD_ID = 'cattail-world-editor-selection-production-card'
		const BLUEPRINT_PRODUCTION_CARD_ID = 'cattail-world-editor-blueprint-production-card'
		const STYLE_ID = 'cattail-world-editor-production-style'
		const UNIT_NAMES = Object.freeze(['s', 'min', 'hr'])
		const UNIT_FACTORS = Object.freeze([1, 60, 3600])
		let refreshMountedText = null

		api.on('afterWords', function (words, game) {
			refreshMountedText?.(game)
		})

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const production = globalThis[PRODUCTION_KEY]
			const blueprint = globalThis[BLUEPRINT_KEY]
			const i18n = globalThis[I18N_KEY]
			const shared = globalThis[SHARED_KEY]
			const selectionCard = document.getElementById(SELECTION_CARD_ID)
			const blueprintCard = document.getElementById(BLUEPRINT_CARD_ID)
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Production cards 3F could not find the editor runtime.')
				return
			}
			if (!production || production.game !== game || typeof production.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Production cards 3F could not find production state.')
				return
			}
			if (!blueprint || blueprint.game !== game || typeof blueprint.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Production cards 3F could not find blueprint state.')
				return
			}
			if (!i18n || typeof i18n.t !== 'function' || !selectionCard || !blueprintCard) {
				console.warn('[Cattail World Editor] Production cards 3F could not mount card surfaces.')
				return
			}
			if (
				!shared ||
				typeof shared.cardIsVisible !== 'function' ||
				typeof shared.visibleCardRect !== 'function' ||
				typeof shared.cardCandidateFits !== 'function' ||
				typeof shared.rectanglesOverlap !== 'function' ||
				typeof shared.resolveEntityIcon !== 'function' ||
				typeof shared.createDisclosureController !== 'function' ||
				typeof shared.registerWorldDragCard !== 'function'
			) {
				console.warn('[Cattail World Editor] Production cards 3F could not find shared editor services.')
				return
			}

			ensureStyle()
			const selectionSummary = createSelectionSummary()
			const selectionMetrics = selectionCard.querySelector('.cattail-world-editor-selection-card__metrics')
			if (selectionMetrics) selectionMetrics.after(selectionSummary.section)
			else selectionCard.append(selectionSummary.section)

			const selectionToggle = createProductionToggle()
			const selectionHeader = selectionCard.querySelector('.cattail-world-editor-selection-card__header-meta')
			const selectionOpacityHint = selectionHeader?.querySelector('.cattail-world-editor-card-opacity-hint')
			if (selectionHeader) selectionHeader.insertBefore(selectionToggle, selectionOpacityHint || null)

			const blueprintToggle = createProductionToggle()
			const blueprintHeader = blueprintCard.querySelector('.cattail-world-editor-blueprint-card__header-primary')
			const blueprintClear = blueprintCard.querySelector('[data-world-editor-blueprint-action="clear"]')
			if (blueprintClear) blueprintClear.before(blueprintToggle)
			else if (blueprintHeader) blueprintHeader.append(blueprintToggle)
			const blueprintSummary = createBlueprintSummary()
			const blueprintCosts = blueprintCard.querySelector('.cattail-world-editor-blueprint-card__costs')
			const blueprintCaptured = blueprintCard.querySelector('[data-world-editor-blueprint-section="captured"]')
			if (blueprintCosts) {
				blueprintCard.insertBefore(blueprintSummary.section, blueprintCosts)
				if (blueprintCaptured) blueprintCard.insertBefore(blueprintCaptured, blueprintCosts)
			} else {
				blueprintCard.append(blueprintSummary.section)
			}

			document.getElementById(SELECTION_PRODUCTION_CARD_ID)?.remove()
			document.getElementById(BLUEPRINT_PRODUCTION_CARD_ID)?.remove()
			const selectionProductionCard = createSelectionProductionCard()
			const blueprintProductionCard = createBlueprintProductionCard()
			document.body.append(selectionProductionCard.card)
			document.body.append(blueprintProductionCard.card)
			const selectionWorldDragControls = shared.registerWorldDragCard(game, selectionProductionCard.card)
			const blueprintWorldDragControls = shared.registerWorldDragCard(game, blueprintProductionCard.card)

			let currentProduction = production.snapshot()
			let currentBlueprint = blueprint.snapshot()
			let selectionUnit = 0
			let blueprintUnit = 0
			let selectionVisible = false
			let blueprintVisible = false
			const disclosureControllers = new Set()
			const selectionSummaryState = disclosureState(true, 44, .35)
			const blueprintTheorySummaryState = disclosureState(true, 44, .35)
			const blueprintCapturedSummaryState = disclosureState(true, 44, .35)
			const blueprintTheoryTypesState = disclosureState(true, 60, .45)
			const blueprintCapturedTypesState = disclosureState(true, 60, .45)
			const noFlowStates = {
				selectionActual: disclosureState(false, 44, .35),
				blueprintTheoretical: disclosureState(false, 44, .35),
				blueprintActual: disclosureState(false, 44, .35)
			}
			mountProductionDisclosure(selectionSummary, selectionSummaryState, handleSummaryDisclosureChange)
			mountProductionDisclosure(blueprintSummary.theory, blueprintTheorySummaryState, handleSummaryDisclosureChange)
			mountProductionDisclosure(blueprintSummary.captured, blueprintCapturedSummaryState, handleSummaryDisclosureChange)
			mountProductionDisclosure(blueprintProductionCard.theory, blueprintTheoryTypesState, handleTypesDisclosureChange)
			mountProductionDisclosure(blueprintProductionCard.captured, blueprintCapturedTypesState, handleTypesDisclosureChange)
			let gameHudHidden = api.ui?.hud?.isHidden?.() === true
			let vanillaHudHidden = api.ui?.isVanillaGameHudHidden?.(game) === true

			const selectionOpacityControls = globalThis[CARD_OPACITY_KEY]?.register?.({
				id: 'selection-production',
				group: 'selection-production',
				element: selectionProductionCard.card,
				hint: selectionProductionCard.opacityHint,
				priority: 46,
				getText(state) {
					return {
						instruction: i18n.t(game, 'cardOpacityControls'),
						mode: i18n.t(game, state.contentIndependent ? 'cardOpacityContentIndependent' : 'cardOpacityContentLinked')
					}
				}
			})
			const blueprintOpacityControls = globalThis[CARD_OPACITY_KEY]?.register?.({
				id: 'blueprint-production',
				group: 'blueprint-production',
				element: blueprintProductionCard.card,
				hint: blueprintProductionCard.opacityHint,
				priority: 49,
				getText(state) {
					return {
						instruction: i18n.t(game, 'cardOpacityControls'),
						mode: i18n.t(game, state.contentIndependent ? 'cardOpacityContentIndependent' : 'cardOpacityContentLinked')
					}
				}
			})

			function refreshText(languageGame) {
				const source = languageGame || game
				selectionSummary.title.textContent = i18n.t(source, 'productionActual')
				selectionSummary.toggle.title = i18n.t(source, selectionSummaryState.expanded ? 'blueprintCollapseSection' : 'blueprintExpandSection')
				selectionSummary.toggle.setAttribute('aria-label', selectionSummary.toggle.title)
				selectionProductionCard.title.textContent = i18n.t(source, 'productionActual')
				blueprintSummary.title.textContent = i18n.t(source, 'productionTitle')
				blueprintSummary.theory.title.textContent = i18n.t(source, 'productionTheoretical')
				blueprintSummary.captured.title.textContent = i18n.t(source, 'productionCapturedActual')
				blueprintSummary.theory.toggle.title = i18n.t(source, blueprintTheorySummaryState.expanded ? 'blueprintCollapseSection' : 'blueprintExpandSection')
				blueprintSummary.captured.toggle.title = i18n.t(source, blueprintCapturedSummaryState.expanded ? 'blueprintCollapseSection' : 'blueprintExpandSection')
				blueprintSummary.theory.toggle.setAttribute('aria-label', blueprintSummary.theory.toggle.title)
				blueprintSummary.captured.toggle.setAttribute('aria-label', blueprintSummary.captured.toggle.title)
				blueprintProductionCard.title.textContent = i18n.t(source, 'productionTitle')
				blueprintProductionCard.theory.title.textContent = i18n.t(source, 'productionTheoretical')
				blueprintProductionCard.captured.title.textContent = i18n.t(source, 'productionCapturedActual')
				blueprintProductionCard.theory.toggle.title = i18n.t(source, blueprintTheoryTypesState.expanded ? 'blueprintCollapseSection' : 'blueprintExpandSection')
				blueprintProductionCard.captured.toggle.title = i18n.t(source, blueprintCapturedTypesState.expanded ? 'blueprintCollapseSection' : 'blueprintExpandSection')
				blueprintProductionCard.theory.toggle.setAttribute('aria-label', blueprintProductionCard.theory.toggle.title)
				blueprintProductionCard.captured.toggle.setAttribute('aria-label', blueprintProductionCard.captured.toggle.title)
				selectionOpacityControls?.refresh?.()
				blueprintOpacityControls?.refresh?.()
				refreshSelectionToggleText(source)
				refreshBlueprintToggleText(source)
				refreshSelection()
				refreshBlueprint()
			}

			function refreshBlueprintToggleText(source) {
				const text = i18n.t(source || game, blueprintVisible ? 'productionHide' : 'productionShow')
				blueprintToggle.title = text
				blueprintToggle.setAttribute('aria-label', text)
				blueprintToggle.setAttribute('aria-pressed', blueprintVisible ? 'true' : 'false')
			}

			function refreshSelectionToggleText(source) {
				const text = i18n.t(source || game, selectionVisible ? 'productionHide' : 'productionShow')
				selectionToggle.title = text
				selectionToggle.setAttribute('aria-label', text)
				selectionToggle.setAttribute('aria-pressed', selectionVisible ? 'true' : 'false')
			}

			function refreshSelection() {
				selectionToggle.disabled = !currentProduction?.selectionKey
				if (!currentProduction?.selectionKey) selectionVisible = false
				refreshSelectionToggleText(game)
				syncUnitControl(selectionSummary.unit, selectionUnit)
				const telemetry = currentProduction?.status === 'ready' ? currentProduction.telemetry : null
				renderQuality(selectionSummary.quality, telemetry)
				renderFlow(selectionSummary.resources, telemetry?.totals?.actual, selectionUnit)
				const unsupported = finiteNonNegative(telemetry?.entities?.unsupported?.actualOutput)
				renderUnsupported(selectionSummary.unsupported, unsupported)
				syncProductionSectionState(selectionSummary, selectionSummaryState.expanded)
				renderTypes(
					selectionProductionCard.types,
					telemetry?.byType,
					'actual',
					selectionUnit,
					'selectionActual'
				)
				markCompanionLayoutDirty(selectionProductionCard.card)
				syncSelectionCompanion()
			}

			function refreshBlueprint() {
				const sourceBlueprint = currentBlueprint?.blueprint
				const capturedProduction = sourceBlueprint?.production
				blueprintToggle.disabled = !sourceBlueprint
				if (!sourceBlueprint) blueprintVisible = false
				refreshBlueprintToggleText(game)
				syncUnitControl(blueprintSummary.unit, blueprintUnit)
				renderQuality(blueprintSummary.quality, capturedProduction)
				renderSummarySection(
					blueprintSummary.theory,
					capturedProduction,
					'theoretical',
					blueprintUnit,
					blueprintTheorySummaryState.expanded
				)
				renderSummarySection(
					blueprintSummary.captured,
					capturedProduction,
					'actual',
					blueprintUnit,
					blueprintCapturedSummaryState.expanded
				)
				syncBlueprintUnitPlacement()
				renderTypesSection(
					blueprintProductionCard.theory,
					capturedProduction,
					'theoretical',
					blueprintUnit,
					blueprintTheoryTypesState.expanded,
					'blueprintTheoretical'
				)
				renderTypesSection(
					blueprintProductionCard.captured,
					capturedProduction,
					'actual',
					blueprintUnit,
					blueprintCapturedTypesState.expanded,
					'blueprintActual'
				)
				markCompanionLayoutDirty(blueprintProductionCard.card)
				syncBlueprintCompanion()
			}

			function renderSummarySection(section, capturedProduction, mode, unit, expanded) {
				const ready = capturedProduction?.status === 'ready'
				const flow = ready ? capturedProduction?.totals?.[mode] : null
				renderFlow(section.resources, flow, unit)
				const unsupported = mode === 'theoretical'
					? finiteNonNegative(capturedProduction?.entities?.unsupported?.theoretical)
					: finiteNonNegative(capturedProduction?.entities?.unsupported?.actualOutput)
				renderUnsupported(section.unsupported, unsupported)
				syncProductionSectionState(section, expanded)
			}

			function renderTypesSection(section, capturedProduction, mode, unit, expanded, viewKey) {
				renderTypes(
					section.types,
					capturedProduction?.status === 'ready' ? capturedProduction?.byType : null,
					mode,
					unit,
					viewKey,
					function (nestedSection, nestedExpanded) {
						projectNestedProductionSectionHeight(section, nestedSection, nestedExpanded)
					}
				)
				syncProductionSectionState(section, expanded)
			}

			function syncBlueprintUnitPlacement() {
				const host = blueprintTheorySummaryState.expanded
					? blueprintSummary.theory.body
					: blueprintCapturedSummaryState.expanded ? blueprintSummary.captured.body : null
				if (!host) {
					blueprintSummary.unit.root.remove()
					syncProductionSectionState(blueprintSummary.theory, false)
					syncProductionSectionState(blueprintSummary.captured, false)
					return
				}
				if (host.firstChild !== blueprintSummary.unit.root) {
					host.insertBefore(blueprintSummary.unit.root, host.firstChild || null)
				}
				syncProductionSectionState(blueprintSummary.theory, blueprintTheorySummaryState.expanded)
				syncProductionSectionState(blueprintSummary.captured, blueprintCapturedSummaryState.expanded)
			}

			function renderQuality(target, value) {
				if (!value || value.status === 'unavailable' || value.ready === false) {
					target.textContent = i18n.t(game, 'productionUnavailable')
					target.dataset.quality = 'unavailable'
					return
				}
				const quality = String(value.quality || 'complete')
				target.dataset.quality = quality
				if (quality === 'collecting') {
					target.textContent = formatTemplate(i18n.t(game, 'productionCollecting'), {
						seconds: Math.max(0, Math.floor(finiteNonNegative(value.sampleDuration?.maxMs) / 1000))
					})
					return
				}
				if (quality === 'truncated') {
					target.textContent = i18n.t(game, 'productionTruncated')
					return
				}
				target.textContent = ''
			}

			function renderUnsupported(target, count) {
				target.textContent = count > 0
					? formatTemplate(i18n.t(game, 'productionUnsupported'), { count })
					: ''
			}

			function renderFlow(target, flow, unit) {
				target.replaceChildren()
				const rows = flowRows(flow)
				if (!rows.length) {
					const empty = document.createElement('div')
					empty.className = 'cattail-world-editor-production__empty'
					empty.textContent = i18n.t(game, 'productionNoFlow')
					target.append(empty)
					return
				}
				for (const row of rows) target.append(createResourceRow(row, unit))
			}

			function renderTypes(target, types, mode, unit, viewKey, onNestedLayoutChange) {
				releaseProductionDisclosure(target._worldEditorNoFlowDisclosure)
				target._worldEditorNoFlowDisclosure = null
				target.replaceChildren()
				const supportedTypes = (Array.isArray(types) ? types : []).filter(function (type) {
					if (mode === 'theoretical') return type?.support?.theoretical?.supported || type?.support?.theoretical?.partial
					return (
						type?.support?.actualOutput?.supported ||
						type?.support?.actualOutput?.partial ||
						type?.support?.actualConsume?.supported ||
						type?.support?.actualConsume?.partial
					)
				})
				if (!supportedTypes.length) return
				const entries = supportedTypes.map(function (type) {
					const rows = flowRows(type?.[mode])
					return {
						type,
						rows,
						output: rows.reduce(function (sum, row) { return sum + row.output }, 0),
						consume: rows.reduce(function (sum, row) { return sum + row.consume }, 0),
						localizedName: localizedEntityName(type?.name)
					}
				}).sort(compareProductionTypes)
				const active = entries.filter(function (entry) { return entry.rows.length > 0 })
				const noFlow = entries.filter(function (entry) { return entry.rows.length === 0 })
				const heading = document.createElement('div')
				heading.className = 'cattail-world-editor-production__types-heading'
				heading.textContent = i18n.t(game, 'productionByType')
				target.append(heading)
				if (active.length) target.append(createTypeLayout(active, unit, true))
				if (noFlow.length) {
					const noFlowSection = createNoFlowSection(noFlow, unit, viewKey, onNestedLayoutChange)
					target.append(noFlowSection.section)
					target._worldEditorNoFlowDisclosure = noFlowSection.disclosure
					syncProductionSectionState(noFlowSection, noFlowStates[viewKey].expanded)
				}
			}

			function compareProductionTypes(left, right) {
				if (right.output !== left.output) return right.output - left.output
				if (right.consume !== left.consume) return right.consume - left.consume
				return left.localizedName.localeCompare(right.localizedName)
			}

			function createTypeLayout(entries, unit, includeFlow) {
				const layout = document.createElement('div')
				layout.className = 'cattail-world-editor-production__type-layout'
				layout.dataset.productionTypeLayout = ''
				layout.dataset.columns = '1'
				const first = document.createElement('div')
				const second = document.createElement('div')
				first.className = 'cattail-world-editor-production__type-column'
				second.className = 'cattail-world-editor-production__type-column'
				const groups = entries.map(function (entry) {
					return createTypeGroup(entry, unit, includeFlow)
				})
				first.append(...groups)
				layout.append(first, second)
				layout._worldEditorTypeGroups = groups
				return layout
			}

			function createTypeGroup(entry, unit, includeFlow) {
				const type = entry.type
				const group = document.createElement('div')
				group.className = 'cattail-world-editor-production__type'
				group._worldEditorEstimatedHeight = 30 + (includeFlow ? entry.rows.length * 28 : 0)
				const header = document.createElement('div')
				header.className = 'cattail-world-editor-production__type-header'
				const icon = createEntityIcon(type.name)
				const name = document.createElement('span')
				name.textContent = entry.localizedName
				const count = document.createElement('span')
				count.className = 'cattail-world-editor-production__type-count'
				count.textContent = 'x' + finiteNonNegative(type.count)
				header.append(icon, name, count)
				group.append(header)
				if (includeFlow) {
					const body = document.createElement('div')
					body.className = 'cattail-world-editor-production__type-body'
					for (const row of entry.rows) body.append(createResourceRow(row, unit))
					group.append(body)
				}
				return group
			}

			function createNoFlowSection(entries, unit, viewKey, onNestedLayoutChange) {
				const section = document.createElement('section')
				section.className = 'cattail-world-editor-production cattail-world-editor-production--no-flow'
				const toggle = createSectionToggle()
				const title = toggle.querySelector('[data-production-title]')
				const body = document.createElement('div')
				body.className = 'cattail-world-editor-production__body'
				body.append(createTypeLayout(entries, unit, false))
				section.append(toggle, body)
				const mounted = { section, toggle, title, body }
				mounted.disclosure = mountProductionDisclosure(
					mounted,
					noFlowStates[viewKey],
					function (detail) {
						refreshNoFlowSectionText(mounted, entries.length, viewKey)
						const card = targetProductionCard(section)
						if (card) {
							markCompanionLayoutDirty(card)
							if (card === selectionProductionCard.card) syncSelectionCompanion()
							else syncBlueprintCompanion()
						}
						if (typeof onNestedLayoutChange === 'function') {
							onNestedLayoutChange(mounted, detail.state.expanded)
						}
					}
				)
				refreshNoFlowSectionText(mounted, entries.length, viewKey)
				return mounted
			}

			function refreshNoFlowSectionText(section, count, viewKey) {
				section.title.textContent = i18n.t(game, 'productionNoFlow') + ' (' + count + ')'
				const action = i18n.t(game, noFlowStates[viewKey].expanded ? 'blueprintCollapseSection' : 'blueprintExpandSection')
				section.toggle.title = action
				section.toggle.setAttribute('aria-label', action)
			}

			function targetProductionCard(element) {
				return element?.closest?.('.cattail-world-editor-production-card') || null
			}

			function disclosureState(expanded, minHeight, maxViewportRatio) {
				return {
					expanded: expanded !== false,
					preferredHeight: null,
					minHeight,
					maxViewportRatio
				}
			}

			function mountProductionDisclosure(section, state, onChange) {
				const controller = shared.createDisclosureController({
					section: section.section,
					toggle: section.toggle,
					body: section.body,
					state,
					minHeight: state.minHeight,
					maxViewportRatio: state.maxViewportRatio,
					heightProperty: '--world-editor-production-section-height',
					resizeOverflow: 'body',
					defaultHeight() {
						return measureProductionSectionHeight(section)
					},
					onChange
				})
				section.disclosure = controller
				disclosureControllers.add(controller)
				return controller
			}

			function releaseProductionDisclosure(controller) {
				if (!controller) return
				controller.release?.()
				disclosureControllers.delete(controller)
			}

			function handleSummaryDisclosureChange(detail) {
				if (detail.reason === 'toggle') {
					refreshText(game)
					return
				}
				if (detail.section === selectionSummary.section) {
					syncSelectionCompanion()
				} else {
					syncBlueprintCompanion()
				}
			}

			function handleTypesDisclosureChange(detail) {
				markCompanionLayoutDirty(blueprintProductionCard.card)
				if (detail.reason === 'toggle') refreshText(game)
				else syncBlueprintCompanion()
			}

			function syncProductionSectionState(section, expanded) {
				const body = section?.body
				if (!section?.section || !body) return
				if (section.disclosure) {
					section.disclosure.setExpanded(expanded, 'production-sync', false)
					queueProductionSectionMeasurement(section)
					return
				}
				measureProductionSection(section)
				section.section.dataset.expanded = expanded ? 'true' : 'false'
				section.toggle?.setAttribute('aria-expanded', expanded ? 'true' : 'false')
				queueProductionSectionMeasurement(section)
			}

			function measureProductionSection(section) {
				const height = measureProductionSectionHeight(section)
				if (section?.disclosure) {
					section.disclosure.refresh('production-measure')
					return height
				}
				return setProductionSectionHeight(section, height)
			}

			function measureProductionSectionHeight(section) {
				const body = section?.body
				if (!body) return 1
				const children = Array.from(body.children || [])
				const childHeight = children.reduce(function (sum, child) {
					const rect = child.getBoundingClientRect?.()
					const layoutEstimate = child?.dataset?.productionTypeLayout !== undefined
						? estimateTypeLayoutHeight(child)
						: 0
					return sum + Math.max(
						finitePositive(child.scrollHeight, 0),
						finitePositive(rect?.height, 0),
						layoutEstimate
					)
				}, 0)
				const gapHeight = Math.max(0, children.length - 1) * 5
				const height = Math.max(
					1,
					finitePositive(body.scrollHeight, 0),
					childHeight + gapHeight
				)
				return height
			}

			function projectNestedProductionSectionHeight(section, nestedSection, expanded) {
				const outerBody = section?.body
				const nestedBody = nestedSection?.body
				if (!outerBody || !nestedBody) return 1
				const currentOuterHeight = finitePositive(outerBody.scrollHeight, 0)
				const nestedRect = nestedBody.getBoundingClientRect?.()
				const currentNestedHeight = finitePositive(
					nestedRect?.height,
					finitePositive(nestedBody.clientHeight, 0)
				)
				const baseHeight = Math.max(1, currentOuterHeight - currentNestedHeight)
				if (section?.disclosure?.state?.preferredHeight !== null) {
					section.disclosure.refresh('nested-layout-fixed')
					return section.disclosure.state.preferredHeight
				}
				const targetNestedHeight = expanded
					? finitePositive(
						nestedSection?.disclosure?.state?.effectiveHeight,
						measureProductionSectionHeight(nestedSection)
					)
					: 0
				return setProductionSectionHeight(
					section,
					Math.ceil(baseHeight + targetNestedHeight)
				)
			}

			function setProductionSectionHeight(section, height) {
				const targetHeight = Math.max(1, finitePositive(height, 1))
				section?.body?.style?.setProperty(
					'--world-editor-production-section-height',
					targetHeight + 'px'
				)
				return targetHeight
			}

			function estimateTypeLayoutHeight(layout) {
				const groups = Array.isArray(layout?._worldEditorTypeGroups)
					? layout._worldEditorTypeGroups
					: []
				if (!groups.length) return 0
				const heights = groups.map(function (group) {
					return finitePositive(group?._worldEditorEstimatedHeight, 30)
				})
				if (layout?.dataset?.columns !== '2') {
					return heights.reduce(function (sum, height) { return sum + height }, 0)
				}
				const totals = [0, 0]
				for (const height of heights) {
					const target = totals[0] <= totals[1] ? 0 : 1
					totals[target] += height
				}
				return Math.max(totals[0], totals[1])
			}

			function queueProductionSectionMeasurement(section) {
				const body = section?.body
				if (!body || typeof window.requestAnimationFrame !== 'function') return
				if (body._worldEditorProductionMeasureFrame) {
					window.cancelAnimationFrame?.(body._worldEditorProductionMeasureFrame)
				}
				body._worldEditorProductionMeasureFrame = window.requestAnimationFrame(function () {
					body._worldEditorProductionMeasureFrame = 0
					if (section.section?.isConnected === false) return
					measureProductionSection(section)
				})
			}

			function createResourceRow(row, unit) {
				const element = document.createElement('div')
				element.className = 'cattail-world-editor-production__resource'
				const icon = createResourceIcon(row.index, 18, 20)
				const name = document.createElement('span')
				name.className = 'cattail-world-editor-production__resource-name'
				name.textContent = localizedResourceName(row.index)
				const values = document.createElement('span')
				values.className = 'cattail-world-editor-production__resource-values'
				values.append(
					createRateValue('output', row.output, unit),
					createRateValue('consume', row.consume, unit),
					createRateValue('net', row.net, unit)
				)
				element.append(icon, name, values)
				return element
			}

			function createRateValue(kind, value, unit) {
				const item = document.createElement('span')
				item.dataset.kind = kind
				const label = document.createElement('span')
				label.className = 'cattail-world-editor-production__rate-label'
				label.textContent = i18n.t(game, kind === 'output'
					? 'productionOutput'
					: kind === 'consume' ? 'productionConsume' : 'productionNet')
				const number = document.createElement('span')
				number.className = 'cattail-world-editor-production__rate-number'
				number.textContent = formatRate(value, unit, kind === 'net')
				item.append(label, number)
				return item
			}

			function formatRate(value, unit, signed) {
				const factor = UNIT_FACTORS[unit] || 1
				const number = finiteSigned(value) * factor
				const prefix = signed && number > 0 ? '+' : ''
				return prefix + readable(number) + '/' + UNIT_NAMES[unit]
			}

			function readable(value) {
				try {
					if (typeof game.makeReadable === 'function') return String(game.makeReadable(value))
				} catch (error) {}
				const absolute = Math.abs(value)
				const digits = absolute > 0 && absolute < 1 ? 3 : absolute < 100 ? 2 : 1
				return String(Math.round(value * (10 ** digits)) / (10 ** digits))
			}

			function flowRows(flow) {
				const size = Math.max(
					Array.isArray(flow?.output) ? flow.output.length : 0,
					Array.isArray(flow?.consume) ? flow.consume.length : 0,
					Array.isArray(flow?.net) ? flow.net.length : 0
				)
				const rows = []
				for (let index = 0; index < size; index += 1) {
					const output = finiteNonNegative(flow?.output?.[index])
					const consume = finiteNonNegative(flow?.consume?.[index])
					const net = Number.isFinite(Number(flow?.net?.[index]))
						? finiteSigned(flow.net[index])
						: output - consume
					if (!output && !consume && !net) continue
					rows.push({ index, output, consume, net })
				}
				return rows
			}

			function syncUnitControl(control, unit) {
				if (control.dragging || control.animationFrame) {
					control.root.dataset.unit = UNIT_NAMES[unit]
					control.value.textContent = UNIT_NAMES[unit]
					return
				}
				setUnitControlVisual(control, unit, unit)
			}

			function setUnitControlVisual(control, visualValue, displayUnit) {
				const value = clampUnitValue(visualValue)
				const unit = clampUnit(displayUnit ?? value)
				control.input.value = String(value)
				control.input.style.setProperty('--world-editor-production-unit-fill', (value * 50) + '%')
				control.root.dataset.unit = UNIT_NAMES[unit]
				control.value.textContent = UNIT_NAMES[unit]
			}

			function cancelUnitAnimation(control) {
				if (!control.animationFrame) return
				window.cancelAnimationFrame?.(control.animationFrame)
				control.animationFrame = 0
			}

			function animateUnitControl(control, targetUnit) {
				cancelUnitAnimation(control)
				control.dragging = false
				const target = clampUnit(targetUnit)
				const start = clampUnitValue(control.input.value)
				const delta = target - start
				if (
					Math.abs(delta) < .00001 ||
					typeof window.requestAnimationFrame !== 'function'
				) {
					setUnitControlVisual(control, target, target)
					return
				}
				const now = function () {
					return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now()
				}
				const startedAt = now()
				const duration = 160
				const tick = function () {
					const progress = Math.max(0, Math.min(1, (now() - startedAt) / duration))
					const eased = 1 - Math.pow(1 - progress, 3)
					setUnitControlVisual(control, start + delta * eased, target)
					if (progress < 1) {
						control.animationFrame = window.requestAnimationFrame(tick)
					} else {
						control.animationFrame = 0
						setUnitControlVisual(control, target, target)
					}
				}
				control.animationFrame = window.requestAnimationFrame(tick)
			}

			function previewUnitControl(control, rawValue) {
				cancelUnitAnimation(control)
				control.dragging = true
				const value = clampUnitValue(rawValue)
				const unit = clampUnit(value)
				setUnitControlVisual(control, value, unit)
				return unit
			}

			function commitUnitControl(control, rawValue) {
				const unit = clampUnit(rawValue)
				animateUnitControl(control, unit)
				return unit
			}

			function keyboardUnit(event, currentUnit) {
				const key = String(event?.key || '')
				if (key === 'ArrowLeft' || key === 'ArrowDown' || key === 'PageDown') return Math.max(0, currentUnit - 1)
				if (key === 'ArrowRight' || key === 'ArrowUp' || key === 'PageUp') return Math.min(2, currentUnit + 1)
				if (key === 'Home') return 0
				if (key === 'End') return 2
				return null
			}

			function handleSelectionCardToggle(event) {
				stopUiEvent(event)
				if (!currentProduction?.selectionKey) return
				selectionVisible = !selectionVisible
				refreshSelection()
			}

			function handleSelectionUnitInput(event) {
				event.stopPropagation?.()
				selectionUnit = previewUnitControl(selectionSummary.unit, event.target?.value)
				refreshSelection()
			}

			function handleSelectionUnitChange(event) {
				event.stopPropagation?.()
				selectionUnit = commitUnitControl(selectionSummary.unit, event.target?.value)
				refreshSelection()
			}

			function handleSelectionUnitKeydown(event) {
				const next = keyboardUnit(event, selectionUnit)
				if (next === null) return
				stopUiEvent(event)
				selectionUnit = next
				animateUnitControl(selectionSummary.unit, next)
				refreshSelection()
			}

			function handleBlueprintToggle(event) {
				stopUiEvent(event)
				if (!currentBlueprint?.blueprint) return
				blueprintVisible = !blueprintVisible
				refreshBlueprint()
			}

			function handleBlueprintUnitInput(event) {
				event.stopPropagation?.()
				blueprintUnit = previewUnitControl(blueprintSummary.unit, event.target?.value)
				refreshBlueprint()
			}

			function handleBlueprintUnitChange(event) {
				event.stopPropagation?.()
				blueprintUnit = commitUnitControl(blueprintSummary.unit, event.target?.value)
				refreshBlueprint()
			}

			function handleBlueprintUnitKeydown(event) {
				const next = keyboardUnit(event, blueprintUnit)
				if (next === null) return
				stopUiEvent(event)
				blueprintUnit = next
				animateUnitControl(blueprintSummary.unit, next)
				refreshBlueprint()
			}

			function stopCompanionEvent(event) {
				event.stopPropagation?.()
			}

			function handleSelectionCompanionMouseEnter() {
				selectionCard.dispatchEvent(new MouseEvent('mouseenter'))
			}

			function handleSelectionCompanionMouseLeave() {
				selectionCard.dispatchEvent(new MouseEvent('mouseleave'))
			}

			function handleBlueprintCompanionMouseEnter() {
				blueprintCard.dispatchEvent(new MouseEvent('mouseenter'))
			}

			function handleBlueprintCompanionMouseLeave() {
				blueprintCard.dispatchEvent(new MouseEvent('mouseleave'))
			}

			function handleGameHud(event) {
				gameHudHidden = !!event?.detail?.hidden
				syncSelectionCompanion()
				syncBlueprintCompanion()
			}

			function handleVanillaGameHud(event) {
				if (event?.detail?.game && event.detail.game !== game) return
				vanillaHudHidden = !!event?.detail?.hidden
				syncSelectionCompanion()
				syncBlueprintCompanion()
			}

			function syncSelectionCompanion(frameValue) {
				if (!frameMatchesGame(frameValue)) return
				const hasSelection = !!currentProduction?.selectionKey
				const mainVisible = shared.cardIsVisible(selectionCard)
				const visible = selectionVisible && hasSelection && mainVisible && !gameHudHidden && !vanillaHudHidden
				syncCompanionCard(selectionCard, selectionProductionCard.card, selectionToggle, visible, [
					blueprintCard,
					blueprintProductionCard.card
				])
			}

			function syncBlueprintCompanion(frameGame) {
				if (!frameMatchesGame(frameGame)) return
				const hasBlueprint = !!currentBlueprint?.blueprint
				const mainVisible = shared.cardIsVisible(blueprintCard)
				const visible = blueprintVisible && hasBlueprint && mainVisible && !gameHudHidden && !vanillaHudHidden
				syncCompanionCard(blueprintCard, blueprintProductionCard.card, blueprintToggle, visible, [
					selectionCard,
					selectionProductionCard.card
				])
			}

			function syncAllCompanions(frameValue) {
				syncSelectionCompanion(frameValue)
				syncBlueprintCompanion(frameValue)
			}

			function syncCompanionCard(mainCard, card, toggle, visible, occupiedCards) {
				card.dataset.visible = visible ? 'true' : 'false'
				card.dataset.positionVisible = visible ? 'true' : 'false'
				card.dataset.theme = mainCard.dataset.theme || (game.plane ? 'void' : 'reality')
				card.dataset.inputPassThrough = mainCard.dataset.inputPassThrough || 'false'
				card.dataset.autoHiding = mainCard.dataset.autoHiding || 'false'
				card.setAttribute('aria-hidden', visible ? 'false' : 'true')
				toggle.dataset.active = toggle === selectionToggle
					? (selectionVisible ? 'true' : 'false')
					: (blueprintVisible ? 'true' : 'false')
				if (!visible) return
				syncCompanionColumns(mainCard, card)
				positionCompanion(mainCard, card, occupiedCards)
			}

			function frameMatchesGame(frameValue) {
				const frameGame = frameValue?.game || frameValue
				return !frameGame || frameGame === game
			}

			function markCompanionLayoutDirty(card) {
				card._worldEditorProductionLayoutDirty = true
			}

			function syncCompanionColumns(mainCard, card) {
				const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1)
				const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1)
				const viewportKey = viewportWidth + 'x' + viewportHeight
				if (!card._worldEditorProductionLayoutDirty && card._worldEditorProductionViewport === viewportKey) return
				card._worldEditorProductionLayoutDirty = false
				card._worldEditorProductionViewport = viewportKey
				card.dataset.columns = '1'
				applyTypeColumns(card, 1)
				const narrowRect = card.getBoundingClientRect()
				const narrowWidth = finitePositive(narrowRect.width, 292)
				const naturalHeight = finitePositive(card.scrollHeight, finitePositive(narrowRect.height, 0))
				const maxHeight = Math.max(1, Math.min(viewportHeight * .7, viewportHeight - 16))
				const wideWidth = Math.min(620, viewportWidth - 16)
				const mainRect = mainCard.getBoundingClientRect()
				const shouldTryColumns = (
					naturalHeight > maxHeight + 1 &&
					viewportWidth >= 760 &&
					wideWidth >= Math.max(480, narrowWidth * 1.55)
				)
				if (!shouldTryColumns) return
				card.dataset.columns = '2'
				applyTypeColumns(card, 2)
				const wideRect = card.getBoundingClientRect()
				const wideHeight = finitePositive(wideRect.height, maxHeight)
				const fitsBeside = (
					viewportWidth - 8 - mainRect.right - 10 >= wideWidth ||
					mainRect.left - 8 - 10 >= wideWidth
				)
				const fitsStacked = (
					wideWidth <= viewportWidth - 16 &&
					(
						viewportHeight - 8 - mainRect.bottom - 10 >= wideHeight ||
						mainRect.top - 8 - 10 >= wideHeight
					)
				)
				if (!fitsBeside && !fitsStacked) {
					card.dataset.columns = '1'
					applyTypeColumns(card, 1)
				}
			}

			function applyTypeColumns(card, count) {
				const columns = count === 2 ? 2 : 1
				for (const layout of card.querySelectorAll('[data-production-type-layout]')) {
					const groups = Array.isArray(layout._worldEditorTypeGroups)
						? layout._worldEditorTypeGroups
						: []
					const containers = Array.from(layout.children || []).slice(0, 2)
					if (containers.length < 2) continue
					layout.dataset.columns = String(columns)
					const heights = groups.map(function (group) {
						const rect = group.getBoundingClientRect?.()
						return finitePositive(
							rect?.height,
							finitePositive(group.scrollHeight, finitePositive(group._worldEditorEstimatedHeight, 30))
						)
					})
					containers[0].replaceChildren()
					containers[1].replaceChildren()
					if (columns === 1) {
						containers[0].append(...groups)
						continue
					}
					const totals = [0, 0]
					groups.forEach(function (group, index) {
						const targetIndex = totals[0] <= totals[1] ? 0 : 1
						containers[targetIndex].append(group)
						totals[targetIndex] += heights[index]
					})
				}
			}

			function positionCompanion(mainCard, card, occupiedCards) {
				const mainRect = mainCard.getBoundingClientRect()
				const cardRect = card.getBoundingClientRect()
				const width = finitePositive(cardRect.width, 292)
				const height = finitePositive(cardRect.height, 360)
				const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1)
				const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1)
				const margin = 8
				const gap = 10
				const placement = mainCard.dataset.placement || 'right'
				const narrow = viewportWidth < 720
				const right = { left: mainRect.right + gap, top: mainRect.top, placement: 'right' }
				const left = { left: mainRect.left - gap - width, top: mainRect.top, placement: 'left' }
				const below = { left: mainRect.left, top: mainRect.bottom + gap, placement: 'below' }
				const above = { left: mainRect.left, top: mainRect.top - gap - height, placement: 'above' }
				let candidates
				if (narrow) {
					candidates = [below, above, right, left]
				} else if (placement === 'left') {
					candidates = [left, below, above, right]
				} else if (placement === 'below') {
					candidates = [right, left, below, above]
				} else if (placement === 'above') {
					candidates = [right, left, above, below]
				} else {
					candidates = [right, below, above, left]
				}
				const occupiedRects = (occupiedCards || []).map(function (occupiedCard) {
					return shared.visibleCardRect(occupiedCard)
				}).filter(Boolean)
				const fitting = candidates.filter(function (candidate) {
					return shared.cardCandidateFits(
						{ left: candidate.left, top: candidate.top, width, height },
						{ margin, viewportWidth, viewportHeight }
					)
				})
				const chosen = fitting.find(function (candidate) {
					const rect = { left: candidate.left, top: candidate.top, width, height }
					return occupiedRects.every(function (occupied) {
						return !shared.rectanglesOverlap(rect, occupied, 8)
					})
				}) || fitting[0] || candidates[0]
				const clampedLeft = clamp(chosen.left, margin, Math.max(margin, viewportWidth - margin - width))
				const clampedTop = clamp(chosen.top, margin, Math.max(margin, viewportHeight - margin - height))
				const nextLeft = Math.round(clampedLeft) + 'px'
				const nextTop = Math.round(clampedTop) + 'px'
				if (card.style.left !== nextLeft) card.style.left = nextLeft
				if (card.style.top !== nextTop) card.style.top = nextTop
				card.dataset.placement = chosen.placement
			}

			selectionToggle.addEventListener('click', handleSelectionCardToggle)
			selectionSummary.unit.input.addEventListener('input', handleSelectionUnitInput)
			selectionSummary.unit.input.addEventListener('change', handleSelectionUnitChange)
			selectionSummary.unit.input.addEventListener('keydown', handleSelectionUnitKeydown)
			selectionSummary.section.addEventListener('mousedown', stopCompanionEvent)
			selectionSummary.section.addEventListener('click', stopCompanionEvent)
			blueprintToggle.addEventListener('click', handleBlueprintToggle)
			blueprintSummary.unit.input.addEventListener('input', handleBlueprintUnitInput)
			blueprintSummary.unit.input.addEventListener('change', handleBlueprintUnitChange)
			blueprintSummary.unit.input.addEventListener('keydown', handleBlueprintUnitKeydown)
			selectionProductionCard.card.addEventListener('mousedown', stopCompanionEvent)
			selectionProductionCard.card.addEventListener('click', stopCompanionEvent)
			selectionProductionCard.card.addEventListener('mouseenter', handleSelectionCompanionMouseEnter)
			selectionProductionCard.card.addEventListener('mouseleave', handleSelectionCompanionMouseLeave)
			blueprintProductionCard.card.addEventListener('mousedown', stopCompanionEvent)
			blueprintProductionCard.card.addEventListener('click', stopCompanionEvent)
			blueprintProductionCard.card.addEventListener('mouseenter', handleBlueprintCompanionMouseEnter)
			blueprintProductionCard.card.addEventListener('mouseleave', handleBlueprintCompanionMouseLeave)
			window.addEventListener('modloader:game-hud', handleGameHud)
			window.addEventListener('modloader:vanilla-game-hud', handleVanillaGameHud)

			const stopProductionSubscription = production.subscribe(function (state) {
				currentProduction = state
				refreshSelection()
			})
			const stopBlueprintSubscription = blueprint.subscribe(function (state) {
				currentBlueprint = state
				refreshBlueprint()
			})
			const stopRenderFrame = api.render?.onFrame?.(syncAllCompanions)
			const releaseSelectionHud = api.ui?.hud?.register?.({
				id: 'world-editor-selection-production-card',
				element: selectionProductionCard.card,
				side: 'top'
			})
			const releaseBlueprintHud = api.ui?.hud?.register?.({
				id: 'world-editor-blueprint-production-card',
				element: blueprintProductionCard.card,
				side: 'top'
			})

			refreshMountedText = refreshText
			refreshText(game)
			syncSelectionCompanion()
			syncBlueprintCompanion()

			runtime.addCleanup(function () {
				if (refreshMountedText === refreshText) refreshMountedText = null
				stopProductionSubscription?.()
				stopBlueprintSubscription?.()
				stopRenderFrame?.()
				releaseSelectionHud?.()
				releaseBlueprintHud?.()
				selectionOpacityControls?.release?.()
				blueprintOpacityControls?.release?.()
				selectionWorldDragControls?.release?.()
				blueprintWorldDragControls?.release?.()
				window.removeEventListener('modloader:game-hud', handleGameHud)
				window.removeEventListener('modloader:vanilla-game-hud', handleVanillaGameHud)
				selectionToggle.removeEventListener('click', handleSelectionCardToggle)
				selectionToggle.remove()
				selectionSummary.unit.input.removeEventListener('input', handleSelectionUnitInput)
				selectionSummary.unit.input.removeEventListener('change', handleSelectionUnitChange)
				selectionSummary.unit.input.removeEventListener('keydown', handleSelectionUnitKeydown)
				cancelUnitAnimation(selectionSummary.unit)
				selectionSummary.section.remove()
				selectionProductionCard.card.remove()
				blueprintToggle.removeEventListener('click', handleBlueprintToggle)
				blueprintToggle.remove()
				blueprintSummary.unit.input.removeEventListener('input', handleBlueprintUnitInput)
				blueprintSummary.unit.input.removeEventListener('change', handleBlueprintUnitChange)
				blueprintSummary.unit.input.removeEventListener('keydown', handleBlueprintUnitKeydown)
				cancelUnitAnimation(blueprintSummary.unit)
				for (const controller of Array.from(disclosureControllers)) {
					releaseProductionDisclosure(controller)
				}
				blueprintSummary.section.remove()
				blueprintProductionCard.card.remove()
			})

			console.info('[Cattail World Editor] Production cards 3F ready.')

			function createResourceIcon(index, width, height) {
				const canvas = document.createElement('canvas')
				canvas.className = 'cattail-world-editor-production__resource-icon'
				canvas.width = Math.max(1, Number(width) || 18)
				canvas.height = Math.max(1, Number(height) || 20)
				canvas.setAttribute('aria-hidden', 'true')
				if (drawResourceSprite(canvas, index)) return canvas
				const fallback = document.createElement('span')
				fallback.className = 'cattail-world-editor-production__resource-fallback'
				fallback.style.background = resourceColor(index)
				fallback.setAttribute('aria-hidden', 'true')
				return fallback
			}

			function drawResourceSprite(canvas, index) {
				const context = canvas?.getContext?.('2d')
				const sprite = game.resourcesSprites?.[index]
				const image = sprite?.img
				if (!context || !sprite || !image) return false
				const sequence = sprite.sequences?.[sprite.currentSequence]
				const frameId = Array.isArray(sequence) ? sequence[sprite.currentFrame] ?? sequence[0] : 0
				const mask = sprite.frames?.[frameId] || [index * 108, 0, 104, 120]
				if (!Array.isArray(mask) || mask.length < 4) return false
				try {
					context.drawImage(
						image,
						finiteSigned(mask[0]),
						finiteSigned(mask[1]),
						Math.max(1, finitePositive(mask[2], 104)),
						Math.max(1, finitePositive(mask[3], 120)),
						0,
						0,
						canvas.width,
						canvas.height
					)
					return true
				} catch (error) {
					return false
				}
			}

			function createEntityIcon(name) {
				const wrapper = document.createElement('span')
				wrapper.className = 'cattail-world-editor-production__entity-icon'
				const source = shared.resolveEntityIcon(game, name)
				if (!source) {
					wrapper.textContent = '·'
					return wrapper
				}
				const image = document.createElement('img')
				image.alt = ''
				image.src = source
				image.addEventListener('error', function () {
					image.remove()
					wrapper.textContent = '·'
				}, { once: true })
				wrapper.append(image)
				return wrapper
			}

			function localizedEntityName(name) {
				try {
					const pronounced = game.pronounce?.('entities', name, 'name')
					if (pronounced && pronounced !== name) return String(pronounced)
				} catch (error) {}
				return String(name || 'unknown')
			}

			function localizedResourceName(index) {
				const resource = game.codex?.resources?.[index]
				const name = resource?.name || resource?.id || String(index)
				try {
					const pronounced = game.pronounce?.('resources', name, 'name')
					if (pronounced && pronounced !== name) return String(pronounced)
				} catch (error) {}
				return String(name)
			}

			function resourceColor(index) {
				const triplet = game.codex?.resources?.[index]?.triplet
				return Array.isArray(triplet) && triplet.length ? String(triplet[1] || triplet[0]) : '#8a96a3'
			}
		})

		function createSelectionSummary() {
			const section = document.createElement('section')
			section.className = 'cattail-world-editor-production cattail-world-editor-production--selection'
			section.dataset.expanded = 'true'
			section.dataset.worldEditorCardControl = ''
			const toggle = createSectionToggle()
			const title = toggle.querySelector('[data-production-title]')
			const body = document.createElement('div')
			body.className = 'cattail-world-editor-production__body'
			const quality = createStatus()
			const unit = createUnitControl()
			const resources = document.createElement('div')
			resources.className = 'cattail-world-editor-production__resources'
			const unsupported = createStatus()
			body.append(quality, unit.root, resources, unsupported)
			section.append(toggle, body)
			return { section, toggle, title, body, quality, unit, resources, unsupported }
		}

		function createProductionToggle() {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = 'cattail-world-editor-production-toggle'
			button.dataset.worldEditorCardControl = ''
			button.dataset.active = 'false'
			button.setAttribute('aria-pressed', 'false')
			for (const height of ['45%', '78%', '100%']) {
				const bar = document.createElement('span')
				bar.style.height = height
				bar.setAttribute('aria-hidden', 'true')
				button.append(bar)
			}
			return button
		}

		function createBlueprintSummary() {
			const section = document.createElement('section')
			section.className = 'cattail-world-editor-production-summary cattail-world-editor-production-summary--blueprint'
			section.dataset.worldEditorCardControl = ''
			const title = document.createElement('div')
			title.className = 'cattail-world-editor-production-summary__title'
			const quality = createStatus()
			const unit = createUnitControl()
			const theory = createSummarySection()
			const captured = createSummarySection()
			section.append(title, quality, theory.section, captured.section)
			return { section, title, quality, unit, theory, captured }
		}

		function createSelectionProductionCard() {
			const mounted = createProductionCompanionCard(SELECTION_PRODUCTION_CARD_ID)
			const types = document.createElement('div')
			types.className = 'cattail-world-editor-production__types'
			mounted.card.append(types)
			return Object.assign(mounted, { types })
		}

		function createBlueprintProductionCard() {
			const mounted = createProductionCompanionCard(BLUEPRINT_PRODUCTION_CARD_ID)
			const theory = createTypesSection()
			const captured = createTypesSection()
			mounted.card.append(theory.section, captured.section)
			return Object.assign(mounted, { theory, captured })
		}

		function createProductionCompanionCard(id) {
			const card = document.createElement('section')
			card.id = id
			card.className = 'cattail-world-editor-production-card cattail-world-editor-blueprint-production-card'
			card.dataset.visible = 'false'
			card.dataset.positionVisible = 'false'
			card.dataset.inputPassThrough = 'false'
			card.dataset.autoHiding = 'false'
			card.dataset.theme = 'reality'
			card.dataset.columns = '1'
			card.dataset.worldEditorScrollbar = ''
			card.setAttribute('role', 'region')
			card.setAttribute('aria-hidden', 'true')
			const header = document.createElement('header')
			header.className = 'cattail-world-editor-blueprint-production-card__header'
			const title = document.createElement('span')
			title.className = 'cattail-world-editor-blueprint-production-card__title'
			const opacityHint = document.createElement('span')
			opacityHint.className = 'cattail-world-editor-card-opacity-hint'
			opacityHint.setAttribute('role', 'img')
			header.append(title, opacityHint)
			card.append(header)
			return { card, header, title, opacityHint }
		}

		function createSummarySection() {
			const section = document.createElement('section')
			section.className = 'cattail-world-editor-production cattail-world-editor-production--blueprint'
			section.dataset.expanded = 'true'
			const toggle = createSectionToggle()
			const title = toggle.querySelector('[data-production-title]')
			const body = document.createElement('div')
			body.className = 'cattail-world-editor-production__body'
			const resources = document.createElement('div')
			resources.className = 'cattail-world-editor-production__resources'
			const unsupported = createStatus()
			body.append(resources, unsupported)
			section.append(toggle, body)
			return { section, toggle, title, body, resources, unsupported }
		}

		function createTypesSection() {
			const section = document.createElement('section')
			section.className = 'cattail-world-editor-production cattail-world-editor-production--blueprint'
			section.dataset.expanded = 'true'
			const toggle = createSectionToggle()
			const title = toggle.querySelector('[data-production-title]')
			const body = document.createElement('div')
			body.className = 'cattail-world-editor-production__body'
			const types = document.createElement('div')
			types.className = 'cattail-world-editor-production__types'
			body.append(types)
			section.append(toggle, body)
			return { section, toggle, title, body, types }
		}

		function createSectionToggle() {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = 'cattail-world-editor-production__section-toggle'
			button.dataset.worldEditorCardControl = ''
			button.setAttribute('aria-expanded', 'true')
			const title = document.createElement('span')
			title.dataset.productionTitle = ''
			const arrow = document.createElement('span')
			arrow.className = 'cattail-world-editor-production__chevron'
			arrow.setAttribute('aria-hidden', 'true')
			button.append(title, arrow)
			return button
		}

		function createStatus() {
			const status = document.createElement('div')
			status.className = 'cattail-world-editor-production__status'
			return status
		}

		function createUnitControl() {
			const root = document.createElement('div')
			root.className = 'cattail-world-editor-production-unit'
			root.dataset.worldEditorCardControl = ''
			const input = document.createElement('input')
			input.className = 'cattail-world-editor-production-unit__range'
			input.type = 'range'
			input.min = '0'
			input.max = '2'
			input.step = 'any'
			input.value = '0'
			const labels = document.createElement('div')
			labels.className = 'cattail-world-editor-production-unit__labels'
			for (const name of UNIT_NAMES) {
				const label = document.createElement('span')
				label.textContent = name
				labels.append(label)
			}
			const value = document.createElement('span')
			value.className = 'cattail-world-editor-production-unit__value'
			value.textContent = 's'
			root.append(input, labels, value)
			return { root, input, labels, value, dragging: false, animationFrame: 0 }
		}

		function ensureStyle() {
			if (document.getElementById(STYLE_ID)) return
			const style = document.createElement('style')
			style.id = STYLE_ID
			style.textContent = `
				.cattail-world-editor-production,
				.cattail-world-editor-production-summary,
				.cattail-world-editor-production-card,
				.cattail-world-editor-blueprint-production-card {
					font-family: Montserrat, Arial, sans-serif;
					font-weight: 400;
					letter-spacing: 0;
				}
				.cattail-world-editor-production--selection {
					margin-top: 7px;
					border-top: 1px solid var(--world-editor-card-track);
					padding-top: 5px;
				}
				.cattail-world-editor-production-summary--blueprint {
					margin-top: 6px;
					border-top: 1px solid var(--blueprint-card-track);
					padding-top: 5px;
				}
				.cattail-world-editor-production-summary__title {
					margin-bottom: 3px;
					font: 500 10px/1.3 Montserrat, Arial, sans-serif;
				}
				.cattail-world-editor-production__body {
					display: grid;
					gap: 5px;
					max-height: var(--world-editor-production-section-height, 2000px);
					overflow: hidden;
					opacity: 1;
					transition: max-height .16s ease-out, opacity .16s ease-out;
				}
				.cattail-world-editor-production__status {
					color: var(--world-editor-card-muted, var(--blueprint-production-muted));
					font-size: 9px;
				}
				.cattail-world-editor-production__status:empty {
					display: none;
				}
				.cattail-world-editor-production__status[data-quality="truncated"] {
					color: #bf5555;
				}
				.cattail-world-editor-production__resources {
					display: grid;
					gap: 3px;
				}
				.cattail-world-editor-production__resource {
					display: grid;
					grid-template-columns: 18px minmax(62px, .8fr) minmax(0, 1.5fr);
					align-items: center;
					gap: 4px;
					min-width: 0;
					padding: 3px 4px;
					border-radius: 4px;
					background: var(--world-editor-card-track, var(--blueprint-production-track));
					font-size: 9px;
				}
				.cattail-world-editor-production__resource-icon {
					display: block;
					width: 18px;
					height: 20px;
					object-fit: contain;
				}
				.cattail-world-editor-production__resource-fallback {
					display: block;
					width: 10px;
					height: 10px;
					margin: auto;
					border: 1px solid rgba(20, 26, 32, .3);
					border-radius: 2px;
				}
				.cattail-world-editor-production__resource-name {
					min-width: 0;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}
				.cattail-world-editor-production__resource-values {
					display: grid;
					grid-template-columns: repeat(3, minmax(0, 1fr));
					gap: 3px;
					min-width: 0;
					text-align: right;
					font-variant-numeric: tabular-nums;
				}
				.cattail-world-editor-production__resource-values > span {
					display: flex;
					min-width: 0;
					flex-direction: column;
				}
				.cattail-world-editor-production__rate-label {
					overflow: hidden;
					color: var(--world-editor-card-muted, var(--blueprint-production-muted));
					font-size: 7px;
					text-overflow: ellipsis;
					white-space: nowrap;
				}
				.cattail-world-editor-production__rate-number {
					overflow-wrap: anywhere;
				}
				.cattail-world-editor-production__empty {
					color: var(--world-editor-card-muted, var(--blueprint-production-muted));
					font-size: 9px;
				}
				.cattail-world-editor-production__types {
					display: grid;
					gap: 3px;
				}
				.cattail-world-editor-production__type-layout {
					display: block;
					min-width: 0;
				}
				.cattail-world-editor-production__type-column {
					display: grid;
					align-content: start;
					gap: 3px;
					min-width: 0;
				}
				.cattail-world-editor-production__type-layout[data-columns="1"] > .cattail-world-editor-production__type-column:nth-child(2) {
					display: none;
				}
				.cattail-world-editor-production__type-layout[data-columns="2"] {
					display: grid;
					grid-template-columns: repeat(2, minmax(0, 1fr));
					align-items: start;
					gap: 8px;
				}
				.cattail-world-editor-production--no-flow {
					margin-top: 2px;
					border-top: 1px solid var(--world-editor-card-track, var(--blueprint-production-track));
					padding-top: 2px;
				}
				.cattail-world-editor-production-card[data-columns="2"] {
					width: min(620px, calc(100vw - 16px));
				}
				.cattail-world-editor-production__types-heading,
				.cattail-world-editor-production__supplemental-title {
					color: var(--world-editor-card-muted, var(--blueprint-production-muted));
					font-size: 9px;
				}
				.cattail-world-editor-production__type {
					border-top: 1px solid var(--world-editor-card-track, var(--blueprint-production-track));
					padding-top: 2px;
				}
				.cattail-world-editor-production__type-header {
					display: grid;
					grid-template-columns: 26px minmax(0, 1fr) auto;
					align-items: center;
					gap: 4px;
					min-height: 24px;
					font-size: 9px;
				}
				.cattail-world-editor-production__entity-icon {
					display: grid;
					width: 26px;
					height: 22px;
					place-items: center;
					overflow: hidden;
				}
				.cattail-world-editor-production__entity-icon img {
					display: block;
					width: 26px;
					height: 22px;
					object-fit: contain;
				}
				.cattail-world-editor-production__type-count {
					color: var(--world-editor-card-muted, var(--blueprint-production-muted));
					font-variant-numeric: tabular-nums;
				}
				.cattail-world-editor-production__type-body {
					display: grid;
					gap: 3px;
					padding: 2px 0 4px 10px;
				}
				.cattail-world-editor-production-unit {
					display: grid;
					grid-template-columns: minmax(0, 1fr) 28px;
					align-items: center;
					gap: 0 5px;
					--world-editor-production-thumb-half: 10px;
				}
				.cattail-world-editor-production-unit__range {
					appearance: none;
					-webkit-appearance: none;
					width: 100%;
					height: 24px;
					margin: 0;
					background: transparent;
					cursor: grab;
				}
				.cattail-world-editor-production-unit__range:active {
					cursor: grabbing;
				}
				.cattail-world-editor-production-unit__range::-webkit-slider-runnable-track {
					height: 4px;
					border-radius: 999px;
					background: linear-gradient(90deg, currentColor 0 var(--world-editor-production-unit-fill, 0%), rgba(128,128,128,.18) var(--world-editor-production-unit-fill, 0%) 100%);
					opacity: .62;
				}
				.cattail-world-editor-production-unit__range::-webkit-slider-thumb {
					-webkit-appearance: none;
					width: 20px;
					height: 22px;
					margin-top: -9px;
					border: 0;
					background: url('img/resources.png') -140px 0 / 200px 22px no-repeat;
					filter: drop-shadow(0 1px 2px rgba(0,0,0,.42));
				}
				.cattail-world-editor-production-unit__range::-moz-range-track {
					height: 4px;
					border-radius: 999px;
					background: rgba(128,128,128,.18);
				}
				.cattail-world-editor-production-unit__range::-moz-range-progress {
					height: 4px;
					border-radius: 999px;
					background: currentColor;
				}
				.cattail-world-editor-production-unit__range::-moz-range-thumb {
					width: 20px;
					height: 22px;
					border: 0;
					background: url('img/resources.png') -140px 0 / 200px 22px no-repeat;
					filter: drop-shadow(0 1px 2px rgba(0,0,0,.42));
				}
				.cattail-world-editor-production-unit__labels {
					position: relative;
					grid-column: 1;
					height: 11px;
					margin: -7px var(--world-editor-production-thumb-half) 0;
					color: var(--world-editor-card-muted, var(--blueprint-production-muted));
					font-size: 8px;
				}
				.cattail-world-editor-production-unit__labels span {
					position: absolute;
					top: 0;
					transform: translateX(-50%);
				}
				.cattail-world-editor-production-unit__labels span:nth-child(1) { left: 0; }
				.cattail-world-editor-production-unit__labels span:nth-child(2) { left: 50%; }
				.cattail-world-editor-production-unit__labels span:nth-child(3) { left: 100%; }
				.cattail-world-editor-production-unit__value {
					grid-column: 2;
					grid-row: 1 / span 2;
					color: var(--world-editor-card-muted, var(--blueprint-production-muted));
					text-align: center;
					font-size: 9px;
				}
				.cattail-world-editor-production-toggle {
					display: inline-flex;
					width: 24px;
					height: 24px;
					align-items: end;
					justify-content: center;
					gap: 2px;
					border: 1px solid var(--blueprint-card-border, var(--world-editor-card-border));
					border-radius: 5px;
					padding: 5px;
					background: var(--blueprint-card-track, var(--world-editor-card-track));
					color: var(--blueprint-card-muted, var(--world-editor-card-muted));
					cursor: pointer;
				}
				.cattail-world-editor-production-toggle span {
					display: block;
					width: 3px;
					background: currentColor;
				}
				.cattail-world-editor-production-toggle[data-active="true"] {
					border-color: var(--blueprint-card-accent, var(--world-editor-card-accent));
					color: var(--blueprint-card-accent, var(--world-editor-card-accent));
				}
				.cattail-world-editor-production-toggle:disabled {
					opacity: .38;
					cursor: default;
				}
				.cattail-world-editor-blueprint-production-card {
					--blueprint-production-bg: color-mix(in srgb, rgba(248, 248, 246, .94) var(--world-editor-card-shell-percent), transparent);
					--blueprint-production-text: rgba(18, 20, 22, .94);
					--blueprint-production-muted: rgba(18, 20, 22, .58);
					--blueprint-production-border: color-mix(in srgb, rgba(92, 65, 132, .24) var(--world-editor-card-shell-percent), transparent);
					--blueprint-production-track: color-mix(in srgb, rgba(92, 65, 132, .09) var(--world-editor-card-shell-percent), transparent);
					position: fixed;
					z-index: 50;
					width: min(clamp(238px, 28vw, 320px), calc(100vw - 16px));
					max-height: min(70vh, calc(100vh - 16px));
					box-sizing: border-box;
					padding: 10px;
					overflow-x: hidden;
					overflow-y: auto;
					border: 1px solid var(--blueprint-production-border);
					border-radius: 6px;
					background: var(--blueprint-production-bg);
					box-shadow: 0 10px 28px color-mix(in srgb, rgba(0,0,0,.22) var(--world-editor-card-shell-percent), transparent);
					backdrop-filter: blur(var(--world-editor-card-shell-blur-14)) saturate(var(--world-editor-card-shell-saturate));
					-webkit-backdrop-filter: blur(var(--world-editor-card-shell-blur-14)) saturate(var(--world-editor-card-shell-saturate));
					color: var(--blueprint-production-text);
					font: 400 11px/1.35 Montserrat, Arial, sans-serif;
					letter-spacing: 0;
					visibility: hidden;
					opacity: 0;
					transform: translateY(4px) scale(var(--world-editor-ui-scale, 1));
					transform-origin: top left;
					pointer-events: none;
					transition: opacity .16s ease, transform .16s ease, visibility 0s linear .16s;
				}
				.cattail-world-editor-blueprint-production-card[data-theme="void"] {
					--blueprint-production-bg: color-mix(in srgb, rgba(8, 10, 12, .94) var(--world-editor-card-shell-percent), transparent);
					--blueprint-production-text: rgba(255,255,255,.92);
					--blueprint-production-muted: rgba(255,255,255,.62);
					--blueprint-production-border: color-mix(in srgb, rgba(210,188,250,.28) var(--world-editor-card-shell-percent), transparent);
					--blueprint-production-track: color-mix(in srgb, rgba(255,255,255,.08) var(--world-editor-card-shell-percent), transparent);
				}
				.cattail-world-editor-blueprint-production-card[data-visible="true"][data-position-visible="true"] {
					visibility: visible;
					opacity: var(--world-editor-card-opacity);
					transform: translateY(0) scale(var(--world-editor-ui-scale, 1));
					pointer-events: auto;
					transition-delay: 0s;
				}
				.cattail-world-editor-blueprint-production-card[data-visible="true"][data-position-visible="true"][data-opacity-content-independent="true"] {
					opacity: 1;
				}
				.cattail-world-editor-blueprint-production-card[data-visible="false"][data-auto-hiding="false"],
				.cattail-world-editor-blueprint-production-card[data-position-visible="false"][data-auto-hiding="false"] {
					transition: none;
				}
				.cattail-world-editor-blueprint-production-card[data-visible="false"][data-auto-hiding="true"] {
					visibility: visible;
					opacity: 0;
					transform: translateY(4px) scale(var(--world-editor-ui-scale, 1));
					pointer-events: none;
					transition: opacity .16s ease-out, transform .16s ease-out;
				}
				.cattail-world-editor-blueprint-production-card[data-input-pass-through="true"] {
					pointer-events: none;
				}
				.cattail-world-editor-blueprint-production-card__header {
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 6px;
					margin-bottom: 4px;
				}
				.cattail-world-editor-blueprint-production-card__title {
					font-size: 12px;
					font-weight: 600;
				}
				.cattail-world-editor-production--blueprint {
					margin-top: 5px;
					border-top: 1px solid var(--blueprint-production-track);
					padding-top: 3px;
				}
				@media (max-width: 720px), (max-height: 560px) {
					.cattail-world-editor-production__resource {
						grid-template-columns: 18px minmax(54px, .7fr) minmax(0, 1.6fr);
					}
					.cattail-world-editor-production__rate-label {
						font-size: 6px;
					}
					.cattail-world-editor-blueprint-production-card {
						width: min(254px, calc(100vw - 16px));
						max-height: min(56vh, calc(100vh - 16px));
					}
				}
			`
			document.head.append(style)
		}

		function clampUnit(value) {
			return Math.max(0, Math.min(2, Math.round(Number(value) || 0)))
		}

		function clampUnitValue(value) {
			const number = Number(value)
			return Math.max(0, Math.min(2, Number.isFinite(number) ? number : 0))
		}

		function finiteNonNegative(value) {
			const number = Number(value)
			return Number.isFinite(number) && number > 0 ? number : 0
		}

		function finiteSigned(value) {
			const number = Number(value)
			return Number.isFinite(number) && !Object.is(number, -0) ? number : 0
		}

		function finitePositive(value, fallback) {
			const number = Number(value)
			return Number.isFinite(number) && number > 0 ? number : fallback
		}

		function clamp(value, min, max) {
			return Math.max(min, Math.min(max, value))
		}

		function formatTemplate(template, values) {
			return String(template || '').replace(/\{(\w+)\}/g, function (match, key) {
				return Object.hasOwn(values || {}, key) ? String(values[key]) : match
			})
		}

		function stopUiEvent(event) {
			event?.preventDefault?.()
			event?.stopPropagation?.()
			event?.stopImmediatePropagation?.()
		}
	}
})
