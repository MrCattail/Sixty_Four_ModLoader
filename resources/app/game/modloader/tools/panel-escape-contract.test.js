'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const loaderPath = path.resolve(__dirname, '..', 'loader.js')
const source = fs.readFileSync(loaderPath, 'utf8')

const helpers = source.match(/\tconst getPanelEscapeAction = function \(options\) \{[\s\S]*?\n\t\}(?:\n\n\tconst consumePanelEscapeEvent = function \(event\) \{[\s\S]*?\n\t\})/)
assert.ok(helpers, 'panel Escape action and event-consumption helpers exist')

const result = vm.runInNewContext(`(() => {
	${helpers?.[0]?.trim() || ''}
	const consumed = { prevented: 0, stopped: 0, immediate: 0 }
	consumePanelEscapeEvent({
		preventDefault() { consumed.prevented++ },
		stopPropagation() { consumed.stopped++ },
		stopImmediatePropagation() { consumed.immediate++ }
	})
	return {
		blocked: getPanelEscapeAction({ blocked: true, configExpanded: true, settingsOpen: true }),
		hidden: getPanelEscapeAction({ hidden: true }),
		configBeforeSettings: getPanelEscapeAction({ configExpanded: true, settingsOpen: true }),
		settingsAfterConfig: getPanelEscapeAction({ configExpanded: false, settingsOpen: true }),
		hideLast: getPanelEscapeAction({ configExpanded: false, settingsOpen: false }),
		consumed
	}
})()`)

assert.deepEqual(JSON.parse(JSON.stringify(result)), {
	blocked: null,
	hidden: null,
	configBeforeSettings: 'config',
	settingsAfterConfig: 'settings',
	hideLast: 'hide',
	consumed: { prevented: 1, stopped: 1, immediate: 1 }
}, 'Escape resolves one panel layer at a time and fully consumes handled events')

const handlerStart = source.indexOf('\t\tlet panelEscapeHandledUntilKeyup = false')
const handlerEnd = source.indexOf('\n\n\t\tsave.onclick = function', handlerStart)
const handlerSource = source.slice(handlerStart, handlerEnd)
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'panel Escape handler source exists')
assert.match(handlerSource, /event\.repeat && panelEscapeHandledUntilKeyup[\s\S]*?consumePanelEscapeEvent\(event\)/)
assert.match(handlerSource, /blocked: panel\.classList\.contains\('modloader-panel-modal-open'\) \|\| !!document\.querySelector\('\.modloader-select-menu'\)/)
assert.match(handlerSource, /if \(escapeAction === 'config'\)[\s\S]*?collapseConfigRow\(expandedRow, true\)/)
assert.match(handlerSource, /else if \(escapeAction === 'settings'\)[\s\S]*?closePanelSettingsPage\(panel\)[\s\S]*?savePanelState\(\)/)
assert.match(handlerSource, /else \{[\s\S]*?hidePanelToEdge\(panel, true\)/)
assert.match(handlerSource, /document\.addEventListener\('keydown', documentKeyHandler, true\)/)
assert.match(handlerSource, /document\.addEventListener\('keyup', documentKeyupHandler, true\)/)
assert.match(handlerSource, /document\.removeEventListener\('keydown', documentKeyHandler, true\)/)
assert.match(handlerSource, /document\.removeEventListener\('keyup', documentKeyupHandler, true\)/)

assert.match(source, /if \(pendingEscapeConfigCollapse && expandedRow === rowModel\)[\s\S]*?collapseConfigRow\(rowModel, true\)/)

console.log('Panel Escape contract passed: config, settings, edge hide, event interception, repeat suppression, and cleanup.')
