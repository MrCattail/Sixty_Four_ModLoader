'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const sourcePath = path.resolve(__dirname, '..', 'scripts', 'shop-categories.js')
const source = fs.readFileSync(sourcePath, 'utf8')

assert.match(source, /const SHOP_ITEM_TOOLTIP_DELAY_MS = 600/)
assert.match(source, /const tooltipCleanupKey = Symbol\('cattail-shop-category-tooltip-cleanups'\)/)
assert.match(source, /function getItemDescription\(item\) \{[\s\S]*?querySelector\('\.itemDescription'\)[\s\S]*?textContent[\s\S]*?trim\(\)/)
assert.match(source, /function attachItemTooltip\(shop, row, item\) \{[\s\S]*?api\.ui\?\.settings\?\.tooltip[\s\S]*?shop\?\.master\?\.isMobile[\s\S]*?tooltipApi\.attach\(row, description, \{[\s\S]*?root: shop\?\.\[panelKey\] \|\| shop\?\.vessel[\s\S]*?ariaLabel: false[\s\S]*?delayMs: SHOP_ITEM_TOOLTIP_DELAY_MS/)
assert.match(source, /function releaseItemTooltips\(shop\) \{[\s\S]*?shop\?\.\[tooltipCleanupKey\][\s\S]*?for \(const detach of cleanups\)[\s\S]*?detach\(\)[\s\S]*?shop\[tooltipCleanupKey\] = \[\]/)
assert.match(source, /function resetPanel\(shop\) \{[\s\S]*?releaseItemTooltips\(shop\)[\s\S]*?shop\[panelKey\]\.remove\(\)/)
assert.match(source, /function renderCompressedShop\(shop, force = false\) \{[\s\S]*?releaseItemTooltips\(shop\)[\s\S]*?panel\.innerHTML = ''/)
assert.match(source, /function renderItem\(shop, item\) \{[\s\S]*?attachItemTooltip\(shop, row, item\)[\s\S]*?return row/)
assert.doesNotMatch(source, /row\.title\s*=/)

console.log('Better UIs Shop Categories tooltip contract passed: localized vanilla descriptions, 600 ms shared API delay, disabled-card coverage, and rebuild cleanup.')
