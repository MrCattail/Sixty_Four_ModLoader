'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const loaderPath = path.resolve(__dirname, '..', 'loader.js')
const source = fs.readFileSync(loaderPath, 'utf8')

assert.match(source, /const UI_PAGE_MENU_INERTIAL_SCROLL_OPTIONS = Object\.freeze\(\{ friction: \.88, directInfluence: \.30, tailInfluence: \.13, maxVelocity: 34, stopThreshold: \.35 \}\)/)
assert.match(source, /const UI_PAGE_MENU_MIN_HEIGHT = 128/)
assert.match(source, /const UI_PAGE_MENU_BOTTOM_MARGIN = 48/)
assert.match(source, /const UI_PAGE_MENU_MOBILE_BOTTOM_MARGIN = 24/)

assert.match(source, /const patchUiPageSplashShow = function \(\) \{[\s\S]*?api\.patch\(Splash\.prototype, 'show'[\s\S]*?const result = original\.apply\(this, args\)[\s\S]*?scheduleUiPageMenuScrolling\(this\)[\s\S]*?return result[\s\S]*?\}/)
assert.match(source, /patchUiPageSplash\('init'\)\s+patchUiPageSplash\('initMobile'\)\s+patchUiPageSplashShow\(\)/)
assert.match(source, /const scheduleUiPageMenuScrolling = function \(splash\) \{[\s\S]*?syncUiPageMenuScrolling\(splash\)[\s\S]*?requestAnimationFrame\(function \(\) \{[\s\S]*?sync\(\)[\s\S]*?requestAnimationFrame\(sync\)[\s\S]*?\}\)[\s\S]*?setTimeout\(sync, 90\)[\s\S]*?\}/)
assert.match(source, /const syncUiPageMenuScrolling = function \(splash\) \{[\s\S]*?menu\.querySelector\('\[data-modloader-ui-page-key\]'\)[\s\S]*?menu\.classList\.toggle\('modloader-ui-menu-scroll', hasUiPageButtons\)[\s\S]*?installTransientScrollbar\(menu, 'modloader-ui-menu-scrollbar-visible'\)[\s\S]*?installInertialScroll\(menu, UI_PAGE_MENU_INERTIAL_SCROLL_OPTIONS\)[\s\S]*?updateUiPageMenuScrollLimit\(splash, menu\)[\s\S]*?\}/)
assert.match(source, /const updateUiPageMenuScrollLimit = function \(splash, menu\) \{[\s\S]*?menu\.style\.setProperty\('--modloader-ui-menu-max-height', maxHeight \+ 'px'\)[\s\S]*?menu\.classList\.toggle\('modloader-ui-menu-scrollable'[\s\S]*?menu\.scrollTop = maxScrollTop[\s\S]*?\}/)
assert.match(source, /const handleUiPageMenuResize = function \(\) \{[\s\S]*?scheduleUiPageMenuScrolling\(uiPagesCurrentGame\?\.splash\)[\s\S]*?\}/)
assert.match(source, /window\.addEventListener\('resize', handleUiPageMenuResize\)/)
assert.match(source, /for \(const page of uiPages\) attachUiPageButton\(splash, page\)\s+scheduleUiPageMenuScrolling\(splash\)/)
assert.match(source, /button\.dataset\.modloaderUiPageKey === page\.key[\s\S]*?scheduleUiPageMenuScrolling\(splash\)[\s\S]*?return/)
assert.match(source, /button\.ontouchstart = openPage\s+scheduleUiPageMenuScrolling\(splash\)/)

assert.match(source, /\.splash \.menu\.modloader-ui-menu-scroll \{[^}]*max-height:var\(--modloader-ui-menu-max-height,calc\(50vh - 48px\)\)[^}]*overflow-y:auto[^}]*scrollbar-color:transparent transparent/s)
assert.match(source, /\.splash \.menu\.modloader-ui-menu-scroll:hover[\s\S]*scrollbar-color:#fffc #fff2/)
assert.match(source, /\.splash \.menu\.modloader-ui-menu-scroll::-webkit-scrollbar \{ width:10px; \}/)
assert.match(source, /linear-gradient\(to right, transparent 4px, rgba\(255,255,255,\.16\) 4px, rgba\(255,255,255,\.16\) 6px, transparent 6px\)/)
assert.match(source, /linear-gradient\(to right, transparent 4px, rgba\(255,255,255,\.78\) 4px, rgba\(255,255,255,\.78\) 6px, transparent 6px\)/)

console.log('UI page menu scroll contract passed: automatic max-height, inertial wheel, and ModLoader scrollbar styling.')
