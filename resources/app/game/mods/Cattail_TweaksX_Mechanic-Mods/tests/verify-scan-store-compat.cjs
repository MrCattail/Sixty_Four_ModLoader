'use strict'

// Current native methods and real Better UIs views; the world, base entities,
// Mod API registration/config/UI helpers and persistence are isolated fixtures.
// No player profile, saved world, network service or Steam is accessed.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createRequire } = require('node:module')
let playwright
try { playwright = require('playwright') } catch (_) {
 playwright = createRequire(path.join(process.env.CODEX_NODE_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'), '_resolve.cjs'))('playwright')
}
const MOD_ROOT = process.env.SCAN_MOD_ROOT || path.resolve(__dirname, '..')
const ROOT = process.env.SCAN_GAME_ROOT || path.resolve(__dirname, '../../..')
const BETTER = path.join(ROOT, 'mods/Cattail_TweaksQuality_Better-UIs')
const ID = 'Cattail_TweaksX_Reality-Pack'
const read = file => fs.readFileSync(file, 'utf8')
const ui = read(path.join(ROOT, 'scripts/ui.js'))
const gameSource = read(path.join(ROOT, 'scripts/game.js'))
const stuff = read(path.join(ROOT, 'scripts/stuff.js'))
const codex = read(path.join(ROOT, 'scripts/codex.js'))
const manifest = JSON.parse(read(path.join(MOD_ROOT, 'mod.json')))
const defaults = Object.fromEntries(Object.entries(manifest.config).map(([key, value]) => [key, value.default]))
const betterSources = ['classic-shop.js', 'shop-categories.js', 'native-accordion-shop.js'].map(file => read(path.join(BETTER, 'scripts', file)))
const realitySources = ['scan-reality-surges.js', 'scan-reality-slider.js'].map(file => read(path.join(MOD_ROOT, 'scripts', file)))
const output = process.env.SCAN_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'sixtyfour-scan-store-'))
fs.mkdirSync(output, { recursive: true })
const classNames = [...new Set([...codex.matchAll(/class:\s*(\w+)/g)].map(match => match[1]))].filter(name => !['Scan', 'Surge'].includes(name))
const prerequisites = [
 'class Entity { constructor(master){this.master=master;this.soi=[]} setPosition(p){this.position=p} initHint(){} initSellHint(){} init(){} }',
 'class VFX { constructor(master){this.master=master} }',
 ...classNames.map(name => 'class ' + name + ' {}'),
 'class Surge extends Entity { constructor(master,args){super(master);this.name="surge";this.args=args} }',
 stuff.slice(stuff.indexOf('class Scan extends Entity'), stuff.indexOf('class Puncture extends Entity')),
 codex, gameSource.slice(gameSource.indexOf('class Game {')),
 ui.slice(ui.indexOf('class Cloud {'), ui.indexOf('class Store {')),
 ui.slice(ui.indexOf('class Store {'), ui.indexOf('class DesktopExplainer {'))
].join('\n')
const cases = [
 {name:'native-only', shop:'1.3', style:'native', better:false},
 {name:'better-native', shop:'1.3', style:'native', better:true},
 {name:'better-accordion', shop:'1.3', style:'accordion', better:true},
 {name:'classic-long', shop:'1.2.1', style:'native', better:true, compact:false},
 {name:'classic-categories', shop:'1.2.1', style:'native', better:true, compact:true}
]
const results = [], errors = [], consoleErrors = []
let browser
async function check(name, fn) { await fn(); results.push(name); console.log('PASS ' + name) }
async function settle(page) {
 await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0)))))
}
async function setup(config, order) {
 const context = await browser.newContext({viewport:{width:1440,height:900}})
 const page = await context.newPage()
 page.on('pageerror', error => errors.push({case:config.name, order, error:error.stack}))
 page.on('console', message => { if(message.type()==='error')consoleErrors.push(message.text()) })
 await context.route('**/*', route => {
  const url=new URL(route.request().url())
  if(url.origin!=='http://scan.fixture')return route.abort()
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><div class="store"></div>'})
  if(!/^\/(img|font)\/[\w./-]+$/.test(url.pathname))return route.abort()
  const target=path.resolve(ROOT,url.pathname.slice(1))
  if(!target.startsWith(ROOT+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile())return route.abort()
  const contentType={'.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(target)]||'application/octet-stream'
  return route.fulfill({contentType,body:fs.readFileSync(target)})
 })
 await page.goto('http://scan.fixture/')
 await page.addStyleTag({content:read(path.join(ROOT,'cascade.css'))})
 await page.addScriptTag({content:prerequisites})
 await page.evaluate(({config, defaults, ID}) => {
  localStorage.setItem('cattailNativeShopStyle',config.style)
  localStorage.setItem('cattailShopCategoriesCompressed',config.compact?'1':'0')
  window.fixtureWrites=[]
  const setItem=Storage.prototype.setItem
  Storage.prototype.setItem=function(key,value){fixtureWrites.push({key,value:String(value)});return setItem.call(this,key,value)}
  const canvasGet=HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).startsWith('webgl')?null:canvasGet.call(this,type,...args)}
  window.hooks=[];window.apis={};window.rpConfig={...defaults};window.compositionCalls=0;window.picks=[]
  window.game=Object.assign(Object.create(Game.prototype),{
   version:'1.3',isMobile:false,language:'en',plane:true,codex:abstract_getCodex(),entitiesInGame:{mega3:1},unlockedEntities:{},onlyones:{},resources:Array(10).fill(1e12),stuff:[],stuffMap:{},stats:{totalResourcesMined:Array(10).fill(0)},eraserType:2,
   pronounce:(group,id,part)=>part==='description'?'Description '+id:part==='name'?id:'NEW',
   cleanupInteractionMode(){this.interactionMode=false},pickupEraser(){this.interactionMode='erase'},
   pickupItem(name){picks.push(name);this.itemInHand={name};this.interactionMode='build'},
   entityAtCoordinates(p){return this.stuffMap['u'+p[0]+'v'+p[1]]},uvToXYUntranslated:p=>p,getPanValueFromX:()=>0,playSound(){},clearCell(){},createExhaust(){},createResourceExplosion(){},createScan(){},updateMouseData(){}
  })
  game.codex.entities.surge.class=Surge;game.codex.entities.scan.class=Scan
  for(const [name,entity]of Object.entries(game.codex.entities)){if(entity.canPurchase)game.unlockedEntities[name]=true;entity.shouldUnlock=()=>false}
  window.ModLoader={resolveAsset:p=>p,register(reg){
   const cfg=reg.id===ID?rpConfig:{shopVersion:config.shop,enableShopCategories:true}
   const api={config:{get:(key,fallback)=>cfg[key]??fallback},state:{game},on:(stage,fn)=>hooks.push({stage,fn}),patch:(proto,name,wrapper)=>{proto[name]=wrapper(proto[name])},
    ui:{registerCornerButton(){return()=>{}},unregisterCornerButton(){},registerHud(){return()=>{}},isVanillaGameHudHidden(game){return !!game.fixtureHudHidden},hud:{isHidden(){return !!game.fixtureHudHidden}},shortcuts:{register(){return{unregister(){}}},refresh(){}},settings:{tooltip:{attach(){return()=>{}}}}}}
   apis[reg.id]=api;reg.init(api)
  }}
 },{config,defaults,ID})
 const sources=order==='reality-first'?[...realitySources,...(config.better?betterSources:[])]:[...betterSources,...realitySources]
 for(const content of sources)await page.addScriptTag({content})
 await page.evaluate(async()=>{
  for(const hook of hooks)if(hook.stage==='afterVanillaScripts')await hook.fn(undefined,game)
  const composition=Store.prototype.compositionUpdate
  Store.prototype.compositionUpdate=function(...args){compositionCalls++;return composition.apply(this,args)}
  game.store=new DesktopStoreVersion(document.querySelector('.store'),game)
  game.store.compositionUpdate();game.store.visibilityUpdate()
  for(const hook of hooks)if(hook.stage==='afterGameInit')await hook.fn(undefined,game)
  game.store.centerItem('scan')
 })
 return {context,page}
}
const visibleControl = page => page.locator('.cattail-scan-reality-slider:visible').first()
async function commit(page, value) {
 await visibleControl(page).locator('input').evaluate((node,value)=>{
  node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:7}))
  node.value=String(value);node.dispatchEvent(new Event('input',{bubbles:true}))
  node.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:7}))
  node.dispatchEvent(new Event('change',{bubbles:true}))
 },value)
 await settle(page)
}
async function main() {
 const executablePath=process.env.SCAN_BROWSER || [playwright.chromium.executablePath(),'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)
 browser=await playwright.chromium.launch({headless:true,executablePath,ignoreDefaultArgs:['--hide-scrollbars']})
 try {
 for(const config of cases)for(const order of config.better?['reality-first','better-first']:['reality-first']){
  const {context,page}=await setup(config,order)
  const prefix=config.name+'/'+order+' '
  try {
   await check(prefix+'current Store controls and first-use default 32 without persistence write',async()=>{
    await page.waitForFunction(()=>document.querySelectorAll('.cattail-scan-reality-slider').length>0,null,{timeout:3000})
    await settle(page)
    assert.equal(await visibleControl(page).locator('input').inputValue(),'32')
    assert.deepEqual(await page.evaluate(()=>({price:game.getRealPrice('scan')[9],stored:localStorage.getItem('cattailScanRealityDiameter'),alias:!!game.shop})),{price:256,stored:null,alias:false})
    assert.equal(await page.locator('.cattail-scan-reality-slider[data-context="shop"]').count(),1)
    assert.equal(await page.locator('.cattail-scan-category-control').count(),config.compact?1:0)
   })
   await check(prefix+'drag remains local; pointer and keyboard commits refresh real price and Cloud',async()=>{
    await page.evaluate(()=>{game.itemInHand={name:'scan'};window.beforeComposition=compositionCalls;window.beforeWrites=fixtureWrites.length})
    await visibleControl(page).locator('input').evaluate(node=>{node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:9}));node.value='64';node.dispatchEvent(new Event('input',{bubbles:true}))})
    await settle(page)
    assert.deepEqual(await page.evaluate(()=>({shared:window.__cattailScanRealitySliderDiameter,price:game.getRealPrice('scan')[9],stored:localStorage.getItem('cattailScanRealityDiameter'),writes:fixtureWrites.length-beforeWrites})),{shared:32,price:256,stored:null,writes:0})
    await visibleControl(page).locator('input').evaluate(node=>{node.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:9}));node.dispatchEvent(new Event('change',{bubbles:true}));node.dispatchEvent(new PointerEvent('lostpointercapture',{bubbles:true,pointerId:9}))})
    await settle(page)
    const state=await page.evaluate(()=>({shared:window.__cattailScanRealitySliderDiameter,price:game.getRealPrice('scan')[9],stored:localStorage.getItem('cattailScanRealityDiameter'),writes:fixtureWrites.slice(beforeWrites).filter(x=>x.key==='cattailScanRealityDiameter').length,composition:compositionCalls-beforeComposition,text:game.store.html.priceContainers.scan.textContent,cloud:game.itemInHandPriceTag?.master===game}))
    assert.deepEqual(state,{shared:64,price:4096,stored:'64',writes:1,composition:1,text:'4096',cloud:true})
    for(const [value,expected]of [[40,512],[64,4096]]){
     await visibleControl(page).locator('input').evaluate((node,value)=>{node.value=String(value);node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}))},value)
     await settle(page)
     assert.equal(await page.evaluate(()=>game.getRealPrice('scan')[9]),expected)
     assert.equal(await page.evaluate(()=>localStorage.getItem('cattailScanRealityDiameter')),String(value))
    }
    assert.deepEqual(await page.evaluate(()=>picks),[])
   })
   await check(prefix+'language reinit, price-driven category replacement and stable control identity',async()=>{
    await page.evaluate(()=>{delete game.itemInHand;game.language='sch';game.store.reinit();game.store.centerItem('scan')})
    await settle(page)
    assert.equal(await visibleControl(page).locator('input').inputValue(),'64')
    assert.equal(await visibleControl(page).locator('button').textContent(),'重置')
    await page.evaluate(()=>{game.store.html.priceContainers.scan.dataset.fixture='changed';game.resources[9]=0;game.store.visibilityUpdate()})
    await settle(page)
    assert.equal(await visibleControl(page).locator('input').inputValue(),'64')
    assert.equal(await page.locator('.cattail-scan-reality-slider[data-context="shop"]').count(),1)
    assert.equal(await page.locator('.cattail-scan-category-control').count(),config.compact?1:0)
    await page.evaluate(()=>{window.controlIdentity=document.querySelector('.cattail-scan-reality-slider');for(let i=0;i<4;i++)game.store.visibilityUpdate()})
    await settle(page)
    assert.equal(await page.evaluate(()=>controlIdentity===document.querySelector('.cattail-scan-reality-slider')),true)
    const mutations=await page.evaluate(async()=>{
     if(typeof game.makeReadable(32)!=='number')throw new Error('Use the real native numeric formatter')
     let writes=0
     const observer=new MutationObserver(records=>{writes+=records.length})
     observer.observe(document.querySelector('.cattail-scan-reality-slider'),{childList:true,subtree:true})
     for(let i=0;i<4;i++)await new Promise(requestAnimationFrame)
     observer.disconnect()
     return writes
    })
    assert.equal(mutations,0,'unchanged numeric labels must not drive a MutationObserver/RAF loop')
   })
   await check(prefix+'disabled card permits tuning without a purchase, Reset and native visibility follow',async()=>{
    await commit(page,32)
    assert.equal(await page.evaluate(()=>game.getRealPrice('scan')[9]),256)
    assert.deepEqual(await page.evaluate(()=>picks),[])
    await visibleControl(page).locator('button').click()
    await settle(page)
    assert.equal(await page.evaluate(()=>window.__cattailScanRealitySliderDiameter),32)
    await page.evaluate(()=>{game.plane=false;game.store.visibilityUpdate()})
    await settle(page)
    assert.equal(await page.locator('.cattail-scan-reality-slider:visible').count(),0)
    await page.evaluate(()=>{game.plane=true;game.resources[9]=1e12;game.store.visibilityUpdate();game.store.centerItem('scan')})
    await settle(page)
    assert.equal(await visibleControl(page).locator('input').inputValue(),'32')
   })
   await check(prefix+'hot disable clears controls/shared preview; enable restores committed value',async()=>{
    await visibleControl(page).locator('input').evaluate(node=>{node.value='64';node.dispatchEvent(new Event('input',{bubbles:true}))})
    await settle(page)
    await page.evaluate(ID=>{rpConfig.enableScanRealitySlider=false;window.dispatchEvent(new CustomEvent('modloader:config-preview',{detail:{modId:ID,key:'enableScanRealitySlider',value:false}}))},ID)
    await settle(page)
    assert.equal(await page.locator('.cattail-scan-reality-slider').count(),0)
    assert.deepEqual(await page.evaluate(()=>({flag:window.__cattailScanRealitySliderEnabled,stored:localStorage.getItem('cattailScanRealityDiameter'),price:game.getRealPrice('scan')[9]})),{flag:false,stored:'32',price:256})
    await page.evaluate(ID=>{rpConfig.enableScanRealitySlider=true;window.dispatchEvent(new CustomEvent('modloader:config-preview',{detail:{modId:ID,key:'enableScanRealitySlider',value:true}}));game.store.centerItem('scan')},ID)
    await settle(page)
    assert.equal(await visibleControl(page).locator('input').inputValue(),'32')
   })
   await check(prefix+'Store replacement removes stale controls and preserves native purchase handler',async()=>{
    await page.evaluate(()=>{window.oldStore=game.store;const container=document.createElement('div');container.className='store';document.body.append(container);game.store=new DesktopStoreVersion(container,game);game.store.compositionUpdate();game.store.visibilityUpdate();game.store.centerItem('scan')})
    await settle(page)
    assert.equal(await page.locator('.cattail-scan-reality-slider[data-context="shop"]').count(),1)
    assert.equal(await page.evaluate(()=>oldStore.html.items.scan.querySelector('.cattail-scan-reality-slider')===null),true)
    await page.evaluate(()=>game.store.html.items.scan.onmousedown({stopPropagation(){}}))
    assert.deepEqual(await page.evaluate(()=>picks),['scan'])
    await page.evaluate(()=>{delete game.itemInHand;picks.length=0;oldStore.vessel.remove()})
    await page.evaluate(async()=>{
     const old=game;window.previousGame=old
     game=Object.assign(Object.create(Game.prototype),old,{store:null,stuff:[],stuffMap:{},onlyones:{}})
     for(const api of Object.values(apis))api.state.game=game
     const container=document.createElement('div');container.className='store';document.body.append(container)
     game.store=new DesktopStoreVersion(container,game);game.store.compositionUpdate();game.store.visibilityUpdate()
     for(const hook of hooks)if(hook.stage==='afterGameInit')await hook.fn(undefined,game)
     game.store.centerItem('scan')
    })
    await settle(page)
    assert.equal(await page.locator('.cattail-scan-reality-slider[data-context="shop"]').count(),1)
    assert.equal(await page.evaluate(()=>previousGame.store.html.items.scan.querySelector('.cattail-scan-reality-slider')===null),true)
    await page.evaluate(()=>previousGame.store.vessel.remove())
   })
   await check(prefix+'HUD hiding and restoration keep tuning owned by the visible Store',async()=>{
    await page.evaluate(()=>{game.fixtureHudHidden=true;game.store.vessel.style.display='none';game.store.visibilityUpdate()})
    await settle(page)
    assert.equal(await page.locator('.cattail-scan-reality-slider:visible').count(),0)
    await page.evaluate(()=>{game.fixtureHudHidden=false;game.store.vessel.style.display='';game.store.visibilityUpdate();game.store.centerItem('scan')})
    await settle(page)
    assert.equal(await visibleControl(page).locator('input').inputValue(),'32')
   })
   if(config.better)await check(prefix+'live layout switch preserves committed tuning and exactly one visible control',async()=>{
    const toggle=config.shop==='1.2.1'?'.cattail-shop-compact-toggle':'.cattail-native-style'
    for(let i=0;i<2;i++){
     await page.locator(toggle).click();await settle(page)
     await page.evaluate(()=>game.store.centerItem('scan'));await settle(page)
     assert.equal(await page.locator('.cattail-scan-reality-slider:visible').count(),1)
     assert.equal(await visibleControl(page).locator('input').inputValue(),'32')
     assert.equal(await page.evaluate(()=>localStorage.getItem('cattailScanRealityDiameter')),'32')
    }
   })
   if(config.name==='native-only') {
    await check('actual Scan placement/impact mapping, flags, independent fallback and one batch refresh',async()=>{
     const mappings=await page.evaluate(()=>{
      const output=[]
      for(const d of [8,32,64,256,1024]){
       localStorage.setItem('cattailScanRealityDiameter',String(d));game.stuff=[];game.stuffMap={};const scan=new Scan(game);scan.setPosition([0,0]);scan.lifeTime=1;const before=compositionCalls;scan.update(2)
       const radius=Math.max(0,...game.stuff.map(e=>Math.hypot(...e.position)))
       output.push({d,count:game.stuff.length,refresh:compositionCalls-before,scanRadius:scan.__cattailScanRealitySliderRadius,limit:Math.min(256,Math.round(d/4)),inside:radius<=Math.min(256,Math.round(d/4))})
      }
      rpConfig.surgeCount=5;rpConfig.surgeRadius=6;rpConfig.enableScanRealitySurgesSliderStrength=false
      game.stuff=[];game.stuffMap={};const independent=new Scan(game);independent.setPosition([0,0]);independent.lifeTime=1;independent.update(2)
      const fallback={count:game.stuff.length,inside:game.stuff.every(e=>Math.hypot(...e.position)<=6)}
      rpConfig.enableScanRealitySurges=false;game.stuff=[];game.stuffMap={};const disabled=new Scan(game);disabled.setPosition([0,0]);disabled.lifeTime=1;disabled.update(2)
      return{output,fallback,disabled:game.stuff.length}
     })
     assert.deepEqual(mappings.output.map(x=>x.count),[2,8,16,64,64])
     assert.ok(mappings.output.every(x=>x.refresh===1&&x.inside&&x.scanRadius===x.d/2))
     assert.deepEqual(mappings.fallback,{count:5,inside:true})
     assert.equal(mappings.disabled,0)
    })
    await check('all eight feature-flag combinations and per-placement tuning remain independent',async()=>{
     const combinations=await page.evaluate(()=>{
      const outcomes=[]
      for(const surges of [false,true])for(const slider of [false,true])for(const strength of [false,true]){
       rpConfig.enableScanRealitySurges=surges;rpConfig.enableScanRealitySlider=slider;rpConfig.enableScanRealitySurgesSliderStrength=strength
       localStorage.setItem('cattailScanRealityDiameter','64');game.stuff=[];game.stuffMap={}
       const scan=new Scan(game);scan.setPosition([0,0]);scan.lifeTime=1;const before=compositionCalls;scan.update(2)
       outcomes.push({surges,slider,strength,count:game.stuff.length,refresh:compositionCalls-before})
      }
      rpConfig.enableScanRealitySurges=true;rpConfig.enableScanRealitySlider=true;rpConfig.enableScanRealitySurgesSliderStrength=true
      localStorage.setItem('cattailScanRealityDiameter','64');const first=new Scan(game);first.setPosition([0,0])
      localStorage.setItem('cattailScanRealityDiameter','32');const second=new Scan(game);second.setPosition([0,0])
      rpConfig.enableScanRealitySlider=false
      const counts=[]
      for(const scan of [first,second]){game.stuff=[];game.stuffMap={};scan.lifeTime=1;scan.update(2);counts.push(game.stuff.length)}
      rpConfig.enableScanRealitySlider=true
      return{outcomes,counts}
     })
     for(const row of combinations.outcomes){assert.equal(row.count,row.surges?(row.slider&&row.strength?16:5):0);assert.equal(row.refresh,row.surges?1:0)}
     assert.deepEqual(combinations.counts,[16,8])
    })
    await check('config preview/cancel and subsequent saved hot change do not retain stale overrides',async()=>{
     await page.evaluate(ID=>{rpConfig.enableScanRealitySlider=true;localStorage.setItem('cattailScanRealityDiameter','64');game.store.visibilityUpdate();window.dispatchEvent(new CustomEvent('modloader:config-preview',{detail:{modId:ID,key:'enableScanRealitySlider',value:false}}))},ID)
     await settle(page)
     assert.equal(await page.locator('.cattail-scan-reality-slider').count(),0)
     assert.equal(await page.evaluate(()=>game.getRealPrice('scan')[9]),256)
     await page.evaluate(ID=>window.dispatchEvent(new CustomEvent('modloader:config-preview',{detail:{modId:ID,key:'enableScanRealitySlider',value:true}})),ID)
     await settle(page)
     assert.equal(await visibleControl(page).locator('input').inputValue(),'64')
     await page.evaluate(()=>{rpConfig.enableScanRealitySlider=false;game.store.visibilityUpdate()});await settle(page)
     assert.equal(await page.locator('.cattail-scan-reality-slider').count(),0)
     await page.evaluate(()=>{rpConfig.enableScanRealitySlider=true;game.store.visibilityUpdate();game.store.centerItem('scan')});await settle(page)
     assert.equal(await visibleControl(page).locator('input').inputValue(),'64')
    })
    await check('missing/blank/nonfinite inputs fall back 32; valid old 8 and normalized bounds remain',async()=>{
     const values=await page.evaluate(()=>{
      const values=[]
      for(const value of [null,'','   ','garbage','Infinity','0','8','64','65','9999']){
       if(value===null)localStorage.removeItem('cattailScanRealityDiameter');else localStorage.setItem('cattailScanRealityDiameter',value)
       const scan=new Scan(game);scan.setPosition([0,0]);values.push(scan.__cattailScanRealitySliderRadius*2)
      }
      return values
     })
     assert.deepEqual(values,[32,32,32,32,32,32,8,64,64,1024])
    })
   }
   if(order==='reality-first'){
    await page.evaluate(()=>{localStorage.setItem('cattailScanRealityDiameter','32');game.store.compositionUpdate();game.store.visibilityUpdate();game.store.centerItem('scan')})
    await settle(page)
    if(config.name==='better-accordion')await page.setViewportSize({width:640,height:720})
    await settle(page)
    await page.screenshot({path:path.join(output,config.name+'.png')})
   }
  } finally { await context.close() }
 }
 assert.equal(errors.length,0,JSON.stringify(errors))
 } finally {
  await browser.close()
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:results.length,results,errors,consoleErrors,boundary:'Real current methods/views and DOM; synthetic API/world/base entities, WebGL deliberately unavailable, no player/Steam/full-game acceptance'},null,2))
 }
 console.log('TOTAL='+results.length+' PASS='+results.length+' OUTPUT='+output)
}
main().catch(error=>{console.error(error.stack);process.exitCode=1})