'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const modloaderDir = path.resolve(__dirname, '..')
const loaderPath = path.join(modloaderDir, 'loader.js')
const translationsPath = path.join(modloaderDir, 'translations.json')
const readmePath = path.join(modloaderDir, 'README.md')
const source = fs.readFileSync(loaderPath, 'utf8')
const translations = JSON.parse(fs.readFileSync(translationsPath, 'utf8'))
const readme = fs.readFileSync(readmePath, 'utf8')

const helperSource = source.match(/\tconst normalizePanelSearchText = function \(value\) \{[\s\S]*?\n\t\}(?=\n\n\tconst showPanelChoice)/)
assert.ok(helperSource, 'panel search normalization and ranking helpers exist')

const helperResult = vm.runInNewContext(`(() => {
	${helperSource?.[0]?.trim() || ''}
	let dynamicOrder = 8
	const entries = [
		{ label: 'contains', fields: [ 'World Editor advanced' ], order: 40 },
		{ label: 'prefix', fields: [ 'Editor tools' ], order: 30 },
		{ label: 'exact-late', fields: [ 'editor' ], order: 20 },
		{ label: 'exact-dynamic', fields: [ 'EDITOR' ], order: () => dynamicOrder },
		{ label: 'contains-early', fields: [ 'Better editor config' ], order: 10 },
		{ label: 'contains-last', fields: [ 'Another editor option' ], order: 90 }
	]
	const ranked = rankPanelSearchResults('  EDITOR  ', entries, 5).map(item => item.label)
	dynamicOrder = 28
	const reranked = rankPanelSearchResults('editor', entries, 2).map(item => item.label)
	return {
		normalized: normalizePanelSearchText('  Ａ　 B  '),
		ranks: [
			getPanelSearchMatchRank('editor', [ 'Editor' ]),
			getPanelSearchMatchRank('editor', [ 'Editor tools' ]),
			getPanelSearchMatchRank('editor', [ 'World Editor' ]),
			getPanelSearchMatchRank('editor', [ 'World builder' ])
		],
		ranked,
		reranked,
		empty: rankPanelSearchResults('   ', entries, 5).length
	}
})()`)

assert.deepEqual(JSON.parse(JSON.stringify(helperResult)), {
	normalized: 'a b',
	ranks: [ 0, 1, 2, -1 ],
	ranked: [ 'exact-dynamic', 'exact-late', 'prefix', 'contains-early', 'contains' ],
	reranked: [ 'exact-late', 'exact-dynamic' ],
	empty: 0
}, 'search ranking is normalized, exact-first, prefix-second, substring-last, live-order aware, stable, and limited')

assert.match(source, /panelRecentLogExpanded: false/)
assert.match(source, /state\.panelRecentLogExpanded = stored\.recentLogExpanded === true/)
assert.match(source, /recentLogExpanded: state\.panelRecentLogExpanded === true/)
assert.match(source, /const modHeading = element\('div', 'modloader-mod-heading'\)/)
assert.match(source, /modHeading\.append\(element\('h3', '', t\('modManager'\)\), element\('span', 'modloader-mod-heading-note', t\('toggleNote'\)\)\)/)
assert.match(source, /const searchButton = createPanelActionButton\('search', t\('search'\), t\('search'\)\)/)
assert.match(source, /searchButton\.classList\.add\('modloader-search-button'\)/)
assert.match(source, /searchInput\.placeholder = t\('searchPlaceholder'\)/)
assert.match(source, /searchField\.append\(searchInput, searchClear\)/)
assert.match(source, /searchControl\.append\(searchField, searchButton, searchResults\)/)
assert.match(source, /left\.append\(selectAllWrap, searchControl, reloadNote, configNote, message\)/)
assert.match(source, /actions\.append\(cancelChanges, snapshots, insert, folder, save\)/)
assert.match(source, /rankPanelSearchResults\(query, searchEntries, 5\)/)
assert.match(source, /fields: \[ localizedModName, mod\.path, mod\.id \]/)
assert.match(source, /fields: \[ sectionLabel \]/)
assert.match(source, /fields: \[ model\.label, model\.description, model\.item\.key \]/)
assert.match(source, /if \(modConfig\.schema\.length && !mod\.loadError\)/)
assert.match(source, /if \(needsExpansion\) expandConfigRow\(rowModel\)/)
assert.match(source, /target\.scrollIntoView\(\{ block: 'center', behavior: 'smooth' \}\)/)
assert.match(source, /highlightPanelSearchTarget\(target\)/)
assert.match(source, /searchResults\.appendChild\(element\('div', 'modloader-search-empty', t\('searchNoResults'\)\)\)/)
assert.match(source, /resultContext\.appendChild\(element\('span', 'modloader-search-result-type'/)
assert.match(source, /resultContext\.append\(element\('span', 'modloader-search-result-separator', '\|'\), element\('span', 'modloader-search-result-path', entry\.context\)\)/)
assert.match(source, /result\.append\(element\('span', 'modloader-search-result-label', entry\.label\), resultContext\)/)
assert.match(source, /searchInput\.addEventListener\('focus', restorePanelSearchResults\)/)
assert.match(source, /searchInput\.addEventListener\('click', restorePanelSearchResults\)/)
assert.match(source, /searchInput\.value = ''[\s\S]*?renderPanelSearchResults\(\)[\s\S]*?searchInput\.focus\(\)/)
assert.match(source, /searchResults\.classList\.contains\('active'\)[\s\S]*?closeSearchResults\(\)[\s\S]*?searchInput\.blur\(\)[\s\S]*?return/)
assert.ok(source.indexOf("searchResults.classList.contains('active')") < source.indexOf('const escapeAction = getPanelEscapeAction({'), 'search results consume Escape before existing panel layers')
assert.match(source, /const recentLogToggle = element\('button', 'modloader-recent-log-toggle'\)/)
assert.match(source, /recentLogToggle\.setAttribute\('aria-controls', recentLog\.id\)/)
assert.match(source, /state\.panelRecentLogExpanded = !state\.panelRecentLogExpanded[\s\S]*?syncRecentLogState\(\)[\s\S]*?savePanelState\(\)/)
assert.match(source, /\.modloader-action-icon-search:before/)
assert.match(source, /\.modloader-search-control \{[^\n]*max-width: 460px;/)
assert.match(source, /\.modloader-search-button \{[^\n]*min-width: 96px;[^\n]*white-space: nowrap;/)
assert.match(source, /\.modloader-search-input::-webkit-search-cancel-button \{ display: none;/)
assert.match(source, /\.modloader-search-clear:before, #modloader-panel \.modloader-search-clear:after/)
assert.match(source, /\.modloader-search-result-type \{[^\n]*font-size: 11px;[^\n]*font-weight: 600;/)
assert.match(source, /\.modloader-panel-theme-light \.modloader-search-input \{ background: #fff; \}/)
assert.match(source, /\.modloader-search-target-highlight \{ animation: modloader-search-target-highlight 1\.5s ease-out; \}/)
assert.match(source, /\.modloader-recent-log-toggle\[aria-expanded="true"\]/)

const requiredTranslationKeys = [
	'searchHint', 'searchPlaceholder', 'search', 'searchResultMod', 'searchResultSection',
	'searchResultConfig', 'searchNoResults', 'recentLogExpand', 'recentLogCollapse'
]
assert.equal(Object.keys(translations.languages || {}).length, 20, 'translation catalog still exposes 20 languages')
for (const [language, group] of Object.entries(translations.languages || {})) {
	for (const key of requiredTranslationKeys) {
		assert.equal(typeof group.modloader?.[key], 'string', `${language}.${key} is translated`)
		assert.ok(group.modloader[key].trim(), `${language}.${key} is not empty`)
	}
}
assert.equal(translations.languages.sch.modloader.searchHint, '搜索可更快找到想要的配置。')

assert.match(readme, /Mod config search/)
assert.match(readme, /five read-only jump results/)
assert.match(readme, /Recent Log starts collapsed/)

console.log('Panel search and recent-log contract passed: localized matching, ranking, five-result jump UI, Escape ownership, and persisted collapse state.')
