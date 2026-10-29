'use strict'

// Current native methods and real Better UIs views; the world, base entities,
// Mod API registration/config/UI helpers and persistence are isolated fixtures.
// No player profile, saved world, network service or Steam is accessed.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const Module = require('node:module')
const { createRequire } = require('node:module')
let playwright
try { playwright = require('playwright') } catch (_) {
 playwright = createRequire(path.join(process.env.CODEX_NODE_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'), '_resolve.cjs'))('playwright')
}
const MOD_ROOT = process.env.FLAT_MOD_ROOT || path.resolve(__dirname, '..')
const ROOT = process.env.FLAT_GAME_ROOT || path.resolve(__dirname, '../../..')
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
const flatSource = read(process.env.FLAT_SOURCE || path.join(MOD_ROOT,'scripts/flat-build-costs.js'))
const output = process.env.FLAT_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'sixtyfour-flat-build-'))
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
  window.hooks=[];window.apis={};window.rpConfig={...defaults,enableFlatBuildCosts:!!config.flat,enableScanRealitySlider:!!config.slider};window.compositionCalls=0;window.picks=[]
  window.game=Object.assign(Object.create(Game.prototype),{
   version:'1.3',isMobile:false,language:'en',plane:true,codex:abstract_getCodex(),entitiesInGame:{mega3:1},unlockedEntities:{},onlyones:{},resources:Array(10).fill(1e12),stuff:[],stuffMap:{},stats:{totalResourcesMined:Array(10).fill(0)},eraserType:2,
   pronounce:(group,id,part)=>part==='description'?'Description '+id:part==='name'?id:'NEW',
   cleanupInteractionMode(){this.interactionMode=false},pickupEraser(){this.interactionMode='erase'},
   pickupItem(name){picks.push(name);return Game.prototype.pickupItem.call(this,name)},
   entityAtCoordinates(p){return this.stuffMap['u'+p[0]+'v'+p[1]]},uvToXYUntranslated:p=>p,getPanValueFromX:()=>0,playSound(){},clearCell(){},createExhaust(){},createResourceExplosion(){},createScan(){},updateMouseData(){}
  })
  for(const name of ['silo','silo2'])game.codex.entities[name].class=class extends Entity{constructor(master){super(master);this.name=name}};
  game.codex.entities.surge.class=Surge;game.codex.entities.scan.class=Scan
  for(const [name,entity]of Object.entries(game.codex.entities)){if(entity.canPurchase)game.unlockedEntities[name]=true;entity.shouldUnlock=()=>false}
  window.ModLoader={resolveAsset:p=>p,register(reg){
   const cfg=reg.id===ID?rpConfig:{shopVersion:config.shop,enableShopCategories:true}
   const api={config:{get:(key,fallback)=>cfg[key]??fallback},state:{get game(){return window.game}},on:(stage,fn)=>hooks.push({stage,fn}),patch:(proto,name,wrapper)=>{proto[name]=wrapper(proto[name])},
    ui:{registerCornerButton(){return()=>{}},unregisterCornerButton(){},registerHud(){return()=>{}},isVanillaGameHudHidden(game){return !!game.fixtureHudHidden},hud:{isHidden(){return !!game.fixtureHudHidden}},shortcuts:{register(){return{unregister(){}}},refresh(){}},settings:{tooltip:{attach(){return()=>{}}}}}}
   apis[reg.id]=api;reg.init(api)
  }}
 },{config,defaults,ID})
 const rpSources=order==='flat-first'?[flatSource,...realitySources]:[...realitySources,flatSource]; const sources=[...rpSources,...(config.better?betterSources:[])]
 for(const content of sources)await page.addScriptTag({content})
 await page.evaluate(async()=>{
  for(const hook of hooks)if(hook.stage==='afterVanillaScripts')await hook.fn(undefined,game)
  const composition=Store.prototype.compositionUpdate
  Store.prototype.compositionUpdate=function(...args){compositionCalls++;return composition.apply(this,args)}
  game.store=new DesktopStoreVersion(document.querySelector('.store'),game)
  game.store.compositionUpdate();game.store.visibilityUpdate()
  for(const hook of hooks)if(hook.stage==='afterGameInit')await hook.fn(undefined,game)
  game.store.centerItem('silo')
 })
 return {context,page}
}
async function verifyPriceContract() {
 const begin=gameSource.indexOf('\tgetRealPrice(name, sale, extra = 0){')
 const end=gameSource.indexOf('\n\tcanAfford(name)',begin)
 assert.ok(begin>=0&&end>begin,'current native price method located')
 const callbacks=[], frames=new Map(), listeners=new Map(), cfg={};let nextFrame=0
 const env={console,requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame},cancelAnimationFrame:id=>frames.delete(id),window:{addEventListener:(key,fn)=>listeners.set(key,fn)}}
 vm.createContext(env)
 vm.runInContext('class Game {'+gameSource.slice(begin,end)+'};this.Game=Game;this.Shop=class {check(){} updateElements(){this.refreshes=(this.refreshes||0)+1}}',env)
 const native=env.Game.prototype.getRealPrice
 let seen=[], nested=false
 env.Game.prototype.getRealPrice=function(name,sale,extra){
  seen.push({name,sale,extra,counts:this.entitiesInGame})
  if(name==='unknown')return [42]
  if(name==='throwing')throw Error('fixture price failure')
  if(name==='silo'&&!nested){nested=true;try{this.getRealPrice('silo2',false,3)}finally{nested=false}}
  const value=native.apply(this,arguments).slice();value[2]=(value[2]||0)+17;return value
 }
 const game=Object.assign(Object.create(env.Game.prototype),{codex:{entities:{silo:{price:[100,0,0],priceExponent:2},silo2:{price:[50,0,0],priceExponent:3},throwing:{price:[1]}}},entitiesInGame:Object.freeze({silo:4,silo2:7}),eraserType:0})
 const api={state:{game},config:{get:(key,fallback)=>cfg[key]??fallback},on:(key,fn)=>callbacks.push({key,fn}),patch:(proto,name,fn)=>{proto[name]=fn(proto[name])}}
 env.ModLoader={register:reg=>reg.init(api)};vm.runInContext(flatSource,env)
 for(const hook of callbacks)if(hook.key==='afterVanillaScripts')hook.fn()
 const counts=game.entitiesInGame
 await check('contract: default remains off and complete sale/extra arguments reach the original chain',()=>{
  const price=game.getRealPrice('silo',false,2);assert.equal(price[0],6400)
  assert.ok(seen.some(x=>x.name==='silo'&&x.extra===2&&x.sale===false));assert.equal(game.entitiesInGame,counts)
 })
 cfg.enableFlatBuildCosts=true;seen=[]
 await check('contract: full chained adjustments and nested quotes survive scoped count flattening',()=>{
  const price=game.getRealPrice('silo',true,-2);assert.deepEqual(Array.from(price),[100,0,17])
  assert.equal(game.entitiesInGame,counts);assert.equal(counts.silo2,7)
  assert.ok(seen.some(x=>x.name==='silo2'&&x.extra===3&&x.counts.silo2===-3))
 })
 await check('contract: exceptions restore count identity, including inherited count properties',()=>{
  assert.throws(()=>game.getRealPrice('throwing'),/fixture price failure/);assert.equal(game.entitiesInGame,counts)
  const child=Object.create(game);assert.throws(()=>child.getRealPrice('throwing'),/fixture price failure/)
  assert.equal(Object.hasOwn(child,'entitiesInGame'),false);assert.equal(child.entitiesInGame,counts)
 })
 await check('contract: unknown definitions still use the original consumer chain',()=>{assert.deepEqual(Array.from(game.getRealPrice('unknown',true,9)),[42])})
 game.shop=new env.Shop();game.shop.master=game
 const flush=()=>{for(const[id,fn]of Array.from(frames)){frames.delete(id);fn()}}
 for(const hook of callbacks)if(hook.key==='afterGameInit')hook.fn(undefined,game)
 flush()
 await check('contract: legacy Shop refreshes once on transition and stays idle when unchanged',()=>{
  const before=game.shop.refreshes;cfg.enableFlatBuildCosts=false;game.shop.check();game.shop.check();flush()
  assert.equal(game.shop.refreshes,before+1);game.shop.check();flush();assert.equal(game.shop.refreshes,before+1)
 })
 await check('contract: repeated preview requests coalesce into one legacy refresh',()=>{
  const before=game.shop.refreshes
  for(const value of [true,false,true])listeners.get('modloader:config-preview')({detail:{modId:ID,key:'enableFlatBuildCosts',value}})
  assert.equal(frames.size,1);flush();assert.equal(game.shop.refreshes,before+1)
 })
}

async function verifyCreativePrices() {
 const results=[]
 const check=(value,message)=>{if(!value)throw Error(message)}
 const same=(a,b,message)=>check(JSON.stringify(a)===JSON.stringify(b),message)
 const tick=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
 await runHook('afterVanillaScripts');const game=await newWorld();game.entitiesInGame.pump=3
 const mode=window[Symbol.for('cattail.world-editor.creative-mode')]
 const economy=window[Symbol.for('cattail.world-editor.creative-economy')]
 const starting=testConfig.enableFlatBuildCosts
 check(!game.canAfford('pump'),'normal insufficient resources')
 mode.setDialogOpen(true);await mode.enableInPlace()
 check(game.canAfford('pump'),'Creative final price exemption');check(game.getRealPrice('pump')[0]>0,'reference chain stays positive')
 results.push('normal qualification versus Creative reference/final exemption')
 for(const flat of [true,false]){
  testConfig.enableFlatBuildCosts=flat;game.store.visibilityUpdate();await tick()
  const expected=game.codex.entities.pump.price[0]*(flat?1:1.2**3)
  check(Math.abs(game.getRealPrice('pump')[0]-expected)<1e-6,'live Flat reference chain')
  check(game.canAfford('pump'),'live Flat never defeats Creative qualification')
 }
 results.push('live Flat on/off preserves references and Creative qualification in either patch order')
 game.pickupItem('pump');testConfig.showCreativePurchaseCosts=false;economy.refreshPricePresentation()
 testConfig.enableFlatBuildCosts=!testConfig.enableFlatBuildCosts;game.store.visibilityUpdate();await tick()
 check(!game.itemInHandPriceTag&&!game.itemInHandPriceAndRefundTag,'hidden Creative hints stay absent')
 testConfig.showCreativePurchaseCosts=true;economy.refreshPricePresentation();check(game.itemInHandPriceTag.master===game,'current Cloud owner')
 results.push('hidden Creative references stay hidden through Flat transition')
 function target(name,cell){game.pickupItem(name);game.hoveredCell=cell;game.hoveredEntity=game.entityAtCoordinates(cell);game.mouse.state=1;game.mouse.positionChanged=false}
 const funds=game.resources.slice();target('gradient',[1,1]);let op=await game.processUp()
 check(op?.executed&&game.entityAtCoordinates([1,1])?.name==='gradient','free native build');same(game.resources,funds,'zero build debit')
 game.addEntity('base',[3,3]);target('upgrade',[3,3]);op=await game.processUp()
 check(op?.executed&&game.entityAtCoordinates([3,3])?.name==='upgrade','free upgrade');same(game.resources,funds,'zero upgrade debit/refund')
 check(game.testTransfers.every(t=>t.resources.every(n=>n===0)),'no paid transfer')
 results.push('current native build/upgrade remains zero debit/refund')
 await mode.disable();check(!game.canAfford('pump'),'normal qualification restored')
 testConfig.enableFlatBuildCosts=starting;results.push('Creative exit restores ordinary pricing')
 return results
}

async function verifyWorldEditor() {
 // Reuse the existing isolated runner. Only its synthetic world gains the
 // required current Alfa field; no existing test or runtime source is written.
 const file=path.join(ROOT,'mods/Cattail_TweaksQuality_World-Editor/tests/verify-1.3-creative.js')
 let source=read(file)
 const anchor='completions: 2, orbUpgrades: 3'
 assert.equal(source.split(anchor).length,2,'WE fixture Alfa anchor')
 source=source.replace(anchor,'alfa: { currentEvents: [] }, completions: 2, orbUpgrades: 3')
 const module=new Module(file);module.filename=file;module.paths=Module._nodeModulePaths(path.dirname(file));module._compile(source,file)
 await module.exports.run({label:'Flat-9A-price-coexistence',setup:function(){},exercise:verifyCreativePrices})
}

async function preview(page, value) {
 await page.evaluate(({ID,value}) => window.dispatchEvent(new CustomEvent('modloader:config-preview', {detail:{modId:ID,key:'enableFlatBuildCosts',value}})), {ID,value})
 await settle(page)
}
async function state(page) {
 return page.evaluate(() => ({price:game.getRealPrice('silo'),base:game.codex.entities.silo.price,
  text:game.store.html.priceContainers.silo.textContent,held:game.itemInHandPriceTag?.element.textContent,
  expected:game.getRealPrice('silo').filter(Boolean).map(n=>String(game.makeReadable(Math.ceil(n)))).join(''),
  disabled:game.store.html.items.silo.classList.contains('disabled'),calls:compositionCalls,
  row:document.querySelector('[data-shop-item="silo"] .itemPrice')?.textContent}))
}
async function main() {
 await verifyPriceContract()
 const executablePath=process.env.FLAT_BROWSER || [playwright.chromium.executablePath(),'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)
 browser=await playwright.chromium.launch({headless:true,executablePath})
 try {
 for(const config of cases)for(const order of ['flat-first','flat-last']) {
  const {context,page}=await setup(config,order)
  const label=config.name+'/'+order+' '
  try {
   await settle(page)
   await page.evaluate(()=>{
    game.plane=false;game.entitiesInGame.silo=4
    game.resources=game.codex.entities.silo.price.map(n=>n*1.2)
    game.store.compositionUpdate();game.store.visibilityUpdate();game.store.centerItem('silo');game.pickupItem('silo')
   });await settle(page)
   await check(label+'hot preview refreshes actual prices, availability, native/visible row and current Cloud',async()=>{
    const before=await state(page);assert.notDeepEqual(before.price,before.base);assert.equal(before.disabled,true)
    await preview(page,true)
    const next=await state(page);assert.deepEqual(next.price,next.base);assert.equal(next.disabled,false)
    assert.equal(next.text,next.expected);assert.equal(next.held,next.expected)
    if(config.compact)assert.equal(next.row,next.expected)
   })
   await check(label+'cancel, save and later direct config changes leave no stale preview override',async()=>{
    await preview(page,null);let s=await state(page);assert.notDeepEqual(s.price,s.base);assert.equal(s.text,s.expected);assert.equal(s.held,s.expected)
    await preview(page,true)
    await page.evaluate(()=>{rpConfig.enableFlatBuildCosts=true;game.store.visibilityUpdate()});await settle(page)
    await page.evaluate(()=>{rpConfig.enableFlatBuildCosts=false;game.store.visibilityUpdate()});await settle(page)
    s=await state(page);assert.notDeepEqual(s.price,s.base);assert.equal(s.text,s.expected);assert.equal(s.held,s.expected)
    await page.evaluate(()=>{rpConfig.enableFlatBuildCosts=true;game.store.visibilityUpdate()});await settle(page)
    s=await state(page);assert.deepEqual(s.price,s.base);assert.equal(s.text,s.expected)
   })
   await check(label+'upgrade held cost/refund tags track toggles without repicking or purchase',async()=>{
    await page.evaluate(()=>{game.entitiesInGame.silo2=3;game.pickupItem('silo2');window.heldBefore=game.itemInHand})
    await preview(page,false)
    const tag=await page.evaluate(()=>({same:heldBefore===game.itemInHand,master:game.itemInHandPriceAndRefundTag.master===game,
     text:game.itemInHandPriceAndRefundTag.element.textContent,cost:game.getRealPrice('silo2').filter(Boolean).map(n=>String(game.makeReadable(Math.ceil(n)))).join('')}))
    assert.equal(tag.same,true);assert.equal(tag.master,true);assert.ok(tag.text.startsWith(tag.cost));assert.ok(tag.text.includes('+'))
    await preview(page,null)
   })
   await check(label+'language rebuild, replacement Store and world discard queued stale refreshes',async()=>{
    await page.evaluate(()=>{game.language='sch';game.store.reinit()});await settle(page)
    await page.evaluate(()=>{
     window.oldStore=game.store;const vessel=document.createElement('div');vessel.className='store';document.body.append(vessel)
     game.store=new DesktopStoreVersion(vessel,game);game.store.compositionUpdate();game.store.visibilityUpdate()
    });await settle(page)
    await preview(page,false);let s=await state(page);assert.equal(s.text,s.expected)
    await page.evaluate(async()=>{
     window.oldGame=game;window.oldHeld=oldGame.itemInHandPriceTag
     window.dispatchEvent(new CustomEvent('modloader:config-preview',{detail:{modId:'Cattail_TweaksX_Reality-Pack',key:'enableFlatBuildCosts',value:true}}))
     const next=Object.assign(Object.create(Game.prototype),game,{entitiesInGame:{mega3:1,silo:2},itemInHand:null,itemInHandPriceTag:null})
     window.game=next;const vessel=document.createElement('div');vessel.className='store';document.body.append(vessel)
     game.store=new DesktopStoreVersion(vessel,game);game.store.compositionUpdate();game.store.visibilityUpdate()
     for(const hook of hooks)if(hook.stage==='afterGameInit')await hook.fn(undefined,game)
     oldStore.visibilityUpdate();oldGame.store.visibilityUpdate()
    });await settle(page)
    assert.equal(await page.evaluate(()=>oldHeld===oldGame.itemInHandPriceTag),true)
    s=await state(page);assert.deepEqual(s.price,s.base);assert.equal(s.text,s.expected)
    await page.evaluate(()=>{oldStore.vessel.remove();oldGame.store.vessel.remove()})
   })
   await check(label+'unchanged visibility has no repeated price rebuild or persistence writes',async()=>{
    const before=await page.evaluate(()=>({calls:compositionCalls,writes:fixtureWrites.length}))
    for(let i=0;i<4;i++){await page.evaluate(()=>game.store.visibilityUpdate());await settle(page)}
    assert.deepEqual(await page.evaluate(()=>({calls:compositionCalls,writes:fixtureWrites.length})),before)
   })
   if(order==='flat-last'&&(config.name==='better-accordion'||config.compact)){
    await page.evaluate(()=>game.store.centerItem('silo'));await settle(page)
    await page.screenshot({path:path.join(output,config.compact?'categories.png':'accordion.png')})
   }
  } finally {await context.close()}
 }
 for(const order of ['flat-first','flat-last']) {
  const {context,page}=await setup({...cases[0],flat:true,slider:true},order)
  try {
   await check(order+' scan 64/1024 retains tuning with Flat and both price wrapper orders',async()=>{
    for(const [diameter,cost]of [[64,4096],[1024,Math.ceil(256*2**124)]]){
     await page.evaluate(d=>localStorage.setItem('cattailScanRealityDiameter',String(d)),diameter)
     assert.equal(await page.evaluate(()=>game.getRealPrice('scan')[9]),cost)
    }
   })
  } finally {await context.close()}
 }
 const {context,page}=await setup({...cases[0],flat:true},'flat-last')
 try {
  await check('sale/extra flatten consistently, preserve count identity and return independent arrays',async()=>{
   const result=await page.evaluate(()=>{
    game.entitiesInGame.silo=4;const counts=game.entitiesInGame,base=game.codex.entities.silo.price.slice(),prices=[]
    for(const tier of [0,1,2])for(const sale of [false,true])for(const extra of [-3,0,2]){game.eraserType=tier;prices.push(game.getRealPrice('silo',sale,extra))}
    const value=game.getRealPrice('silo');value[0]=123
    return{prices,base,unchanged:counts===game.entitiesInGame&&counts.silo===4,notMutated:game.codex.entities.silo.price[0]===base[0]}
   });assert.equal(result.unchanged,true);assert.equal(result.notMutated,true);for(const price of result.prices)assert.deepEqual(price,result.base)
  })
  await check('Q quote is rechecked before payout even when config changes before any Store tick',async()=>{
   const result=await page.evaluate(()=>{
    rpConfig.enableFlatBuildCosts=false;game.entitiesInGame.silo=4;game.eraserType=0
    game.selectionOrigin=[0,0];game.selectionTarget=[1,0];game.hoveredCell=[0,0]
    game.selectionCandidateSet=new Set([{name:'silo',position:[0,0]},{name:'silo',position:[1,0]}])
    game.updateSelectionArea=()=>{};game.canEraseEntity=()=>true;game.memoryBuffer=[];game.stats.machinesSold=0
    game.updateEraseArea();const quoted=game.totalRefund[0];rpConfig.enableFlatBuildCosts=true
    let paid;game.createResourceTransfer=price=>{paid=price[0]};game.finalizeErase()
    return{quoted,paid,expected:game.codex.entities.silo.price[0]*2}
   });assert.notEqual(result.quoted,result.expected);assert.equal(result.paid,result.expected)
  })
  await check('clone cost and affordability are rechecked before release after Flat switches off',async()=>{
   const result=await page.evaluate(()=>{
    rpConfig.enableFlatBuildCosts=true;game.entitiesInGame.silo=4;game.resources=game.codex.entities.silo.price.map(n=>n*2.1)
    const list=[{name:'silo',position:[0,0]},{name:'silo',position:[1,0]}]
    game.interactionMode='clone';game.selectionOrigin=[0,0];game.selectionTarget=[1,0];game.selectionCandidateSet=new Set(list)
    game.canClone=()=>true;game.updateCloneArea();const low=game.totalPrice[0]
    game.selectionList=list;game.selectionOffsets=[[0,0],[1,0]];game.hoveredCell=[8,8];let executed=0
    game.massClone=()=>{executed++};rpConfig.enableFlatBuildCosts=false;game.finalizeCloning()
    return{low,high:game.totalPrice[0],executed}
   });assert.ok(result.high>result.low);assert.equal(result.executed,0)
  })
  await check('repricing an affordable clone cannot grant invalid spatial placement permission',async()=>{
   const result=await page.evaluate(async()=>{
    rpConfig.enableFlatBuildCosts=false;game.resources.fill(1e30);game.interactionMode='clone';game.canPlace=false
    game.store.visibilityUpdate();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
    rpConfig.enableFlatBuildCosts=true;game.store.visibilityUpdate();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
    return{canPlace:game.canPlace,total:game.totalPrice[0],base:game.codex.entities.silo.price[0]*2}
   });assert.equal(result.canPlace,false);assert.equal(result.total,result.base)
  })
 } finally {await context.close()}
 assert.equal(errors.length,0,JSON.stringify(errors))
 } finally {
  await browser.close()
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:results.length,results,errors,consoleErrors,boundary:'Current Game/Codex/Store/Cloud and Better UIs; synthetic API/world/base entities, isolated storage, WebGL unavailable. No player profile, Steam or full-game acceptance.'},null,2))
 }
 console.log('TOTAL='+results.length+' PASS='+results.length+' OUTPUT='+output)
 if(process.env.FLAT_SKIP_WORLD_EDITOR!=='1')await verifyWorldEditor()
}
main().catch(error=>{console.error(error.stack);console.error('OUTPUT='+output);process.exitCode=1})
