'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const loaderPath = path.resolve(__dirname, '..', 'loader.js')
const source = fs.readFileSync(loaderPath, 'utf8')

const layoutHelpers = source.match(/\tconst getConfigSectionId = function \(item\) \{[\s\S]*?\n\t\}(?=\n\n\tconst syncPanelConfigSectionOrderForMod)/)
assert.ok(layoutHelpers, 'config layout grouping and resolution helpers exist')

const layoutResult = vm.runInNewContext(`(() => {
	const state = { panelConfigSectionOrder: { demo: [ 'section:b', 'section:a' ] }, panelConfigLayout: {} }
	const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value)
	const pickLocalizedText = value => typeof value === 'string' ? value : (value?.en || '')
	const getLocaleCandidates = () => [ 'en' ]
	const getPanelConfigSectionOrderKey = mod => String(mod?.path || mod?.id || '')
	${layoutHelpers?.[0]?.trim() || ''}
	const mod = { id: 'demo', path: 'demo' }
	const schema = [
		{ key: 'a2', section: 'a' },
		{ key: 'a1', section: 'a', sectionLabel: 'Alpha' },
		{ key: 'b1', section: 'b', sectionLabel: 'Beta' }
	]
	const simplify = blocks => blocks.map(block => block.type === 'item'
		? { type: 'item', key: block.key }
		: { type: 'section', key: block.key, label: block.label, items: block.items.map(item => item.key) })
	const legacy = simplify(resolvePanelConfigLayout(mod, schema))
	state.panelConfigLayout.demo = { blocks: [
		{ type: 'section', key: 'section:a', items: [ 'a1' ] },
		{ type: 'item', key: 'a2' },
		{ type: 'section', key: 'section:b', items: [ 'b1' ] }
	] }
	const detached = simplify(resolvePanelConfigLayout(mod, schema))
	const withNewItem = simplify(resolvePanelConfigLayout(mod, [
		{ key: 'a2', section: 'a' },
		{ key: 'a1', section: 'a', sectionLabel: 'Alpha' },
		{ key: 'a3', section: 'a' },
		{ key: 'b1', section: 'b', sectionLabel: 'Beta' }
	]))
	state.panelConfigLayout.demo = { blocks: [
		{ type: 'section', key: 'section:a', items: [] },
		{ type: 'section', key: 'section:b', items: [ 'b1', 'a1' ] },
		{ type: 'item', key: 'a2' }
	] }
	const reassigned = simplify(resolvePanelConfigLayout(mod, schema))
	state.panelConfigLayout.demo = { blocks: [
		{ type: 'section', key: 'section:a', items: [ 'missing', 'a1', 'a1' ] },
		{ type: 'item', key: 'a2' },
		{ type: 'section', key: 'removed-section', items: [ 'b1' ] }
	] }
	const stale = simplify(resolvePanelConfigLayout(mod, schema))
	return { legacy, detached, withNewItem, reassigned, stale }
})()`)

assert.deepEqual(JSON.parse(JSON.stringify(layoutResult.legacy)), [
	{ type: 'section', key: 'section:b', label: 'Beta', items: [ 'b1' ] },
	{ type: 'section', key: 'section:a', label: 'Alpha', items: [ 'a2', 'a1' ] }
], 'legacy section order migrates while a label declared later in the section remains visible')

assert.deepEqual(JSON.parse(JSON.stringify(layoutResult.detached)), [
	{ type: 'section', key: 'section:a', label: 'Alpha', items: [ 'a1' ] },
	{ type: 'item', key: 'a2' },
	{ type: 'section', key: 'section:b', label: 'Beta', items: [ 'b1' ] }
], 'a config item can be detached as its own unclassified layout block')

assert.deepEqual(JSON.parse(JSON.stringify(layoutResult.withNewItem)), [
	{ type: 'section', key: 'section:a', label: 'Alpha', items: [ 'a1', 'a3' ] },
	{ type: 'item', key: 'a2' },
	{ type: 'section', key: 'section:b', label: 'Beta', items: [ 'b1' ] }
], 'new config keys append to their source section without disturbing the stored layout')

assert.deepEqual(JSON.parse(JSON.stringify(layoutResult.reassigned)), [
	{ type: 'section', key: 'section:a', label: 'Alpha', items: [] },
	{ type: 'section', key: 'section:b', label: 'Beta', items: [ 'b1', 'a1' ] },
	{ type: 'item', key: 'a2' }
], 'an unclassified item can later join another section and empty known sections remain available as drop targets')

assert.deepEqual(JSON.parse(JSON.stringify(layoutResult.stale)), [
	{ type: 'section', key: 'section:a', label: 'Alpha', items: [ 'a1' ] },
	{ type: 'item', key: 'a2' },
	{ type: 'section', key: 'section:b', label: 'Beta', items: [ 'b1' ] }
], 'missing keys, duplicate keys, and removed section ids are ignored safely')

const storageHelpers = source.match(/\tconst readPanelConfigLayout = function \(source\) \{[\s\S]*?\n\t\}(?=\n\n\tconst getPanelConfigSectionOrderKey)/)
assert.ok(storageHelpers, 'config layout storage normalization helpers exist')
const storageResult = vm.runInNewContext(`(() => {
	const sameStringList = (a, b) => a.length === b.length && a.every((value, index) => value === b[index])
	${storageHelpers?.[0]?.trim() || ''}
	const source = {
		demo: { blocks: [
			{ type: 'section', key: 'section:a', items: [ 'a1', '', null, 'a2' ] },
			{ type: 'item', key: 'b1' },
			{ type: 'unknown', key: 'ignored' }
		] },
		invalid: []
	}
	const normalized = readPanelConfigLayout(source)
	const cloned = clonePanelConfigLayout(normalized)
	return { normalized, cloned, same: samePanelConfigLayout(normalized, cloned) }
})()`)
assert.deepEqual(JSON.parse(JSON.stringify(storageResult.normalized)), {
	demo: { blocks: [
		{ type: 'section', key: 'section:a', items: [ 'a1', 'a2' ] },
		{ type: 'item', key: 'b1' }
	] }
}, 'stored layout accepts only normalized section and item records')
assert.deepEqual(JSON.parse(JSON.stringify(storageResult.cloned)), JSON.parse(JSON.stringify(storageResult.normalized)), 'stored layout cloning is lossless')
assert.equal(storageResult.same, true, 'stored layout equality is stable')

assert.match(source, /panelConfigLayout: \{\}/)
assert.match(source, /state\.panelConfigLayout = readPanelConfigLayout\(stored\.configLayout\)/)
assert.match(source, /configLayout: state\.panelConfigLayout/)
assert.match(source, /const originalPanelConfigLayout = clonePanelConfigLayout\(state\.panelConfigLayout\)/)
assert.match(source, /state\.panelConfigLayout = clonePanelConfigLayout\(originalPanelConfigLayout\)/)
assert.match(source, /samePanelConfigLayout\(state\.panelConfigLayout, originalPanelConfigLayout\)/)

assert.match(source, /const installConfigItemSortDrag = function \(rowModel, itemModel\)/)
assert.match(source, /setTimeout\(beginDrag, 300\)/)
assert.match(source, /Math\.abs\(dx\) \+ Math\.abs\(dy\) > 5/)
assert.match(source, /event\.target === field \|\| event\.target\?\.closest\?\.\('\.modloader-config-text'\)/)
assert.match(source, /if \(!startedStandalone && sectionModel !== originSectionModel\) continue/)
assert.match(source, /field\.classList\.toggle\('modloader-config-item-standalone', field\.parentNode === rowModel\.configScroll\)/)
assert.match(source, /syncPanelConfigLayoutForMod\(rowModel\)[\s\S]*?savePanelState\(\)/)
assert.match(source, /for \(const itemModel of rowConfigModels\) installConfigItemSortDrag\(rowModel, itemModel\)/)
assert.match(source, /PANEL_TEXT\.en\.configSectionSorting = 'Config layout sorting'/)
assert.match(source, /PANEL_TEXT\.sch\.configSectionSorting = '\\u914d\\u7f6e\\u5e03\\u5c40\\u624b\\u52a8\\u6392\\u5e8f'/)
assert.match(source, /\.modloader-config-item-dragging \{[^}]*cursor: grabbing[^}]*pointer-events: none/s)
assert.match(source, /\.modloader-config-section-body:empty \{[^}]*min-height: 24px/s)

console.log('Panel config layout contract passed: migration, item order, detach/rejoin, long press, persistence, and stale-schema safety.')
