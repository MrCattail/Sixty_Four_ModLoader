'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const loader = fs.readFileSync(path.resolve(__dirname, '../loader.js'), 'utf8')
const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../mods/Cattail_TweaksQuality_Tweaks/mod.json'), 'utf8'))
const modId = manifest.id
const storageKey = key => `modloader:${modId}:config:${key}`
const panelKey = 'modloader:panelState'
const plain = value => JSON.parse(JSON.stringify(value))
function extract(name) {
 const match = loader.match(new RegExp('\\tconst ' + name + ' = function \\([^]*?\\n\\t\\}(?=\\r?\\n)'))
 assert.ok(match, 'actual Loader function: ' + name)
 return match[0]
}
function fixture(input = new Map(), options = {}) {
 const store = input instanceof Map ? input : new Map(Object.entries(input))
 const writes = [], warnings = [], events = [], fail = options.fail || {}
 const state = { configs: {}, panelConfigSectionOrder: {}, panelConfigLayout: {}, panelSettings: {}, shortcutSettings: { mods: {} }, panelModOrder: [], panelTabPositions: {} }
 const context = vm.createContext({
  state, localStorage: {
   getItem(key) { if (fail.read === key) throw Error('injected read failure'); return store.has(key) ? store.get(key) : null },
   setItem(key, value) { if (fail.write === key) throw Error('injected write failure'); store.set(key, String(value)); writes.push(key) }
  }, console: { warn(...args) { warnings.push(args) } },
  PANEL_STATE_STORAGE_KEY: panelKey, showStatus() {}, document: { getElementById() { return null } },
  isPanelAutoHideEnabled() { return false }, getLocaleCandidates() { return ['en'] },
  getLocalizedConfigValueLabels() { return null }, getLocalizedConfigText() { return '' },
  pickLocalizedText(value) { return typeof value === 'string' ? value : value?.en || '' },
  isSettingsActionItem(item) { return item.type === 'action' },
  window: { dispatchEvent(event) { events.push(event.detail) } },
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail } }
 })
 const names = ['isObject','clone','cloneConfigValue','cloneConfigSchemaItem','normalizeConfigSchema','inferConfigType','getConfigType','parseStoredConfig','storageKey','readCompatibleConfigValue','loadModConfig','getConfigValue','setConfigValue','readConfigForPanel','dispatchConfigPreview','getConfigSectionId','mapCompatibleConfigSectionKey','mapCompatiblePanelConfigLayout','mapCompatibleConfigSectionOrder','prepareCompatiblePanelState','getConfigSectionLabel','makeUniqueConfigSectionKey','applyPanelConfigSectionOrder','buildRawConfigSectionGroups','createResolvedConfigSection','resolvePanelConfigLayout','getPanelConfigSectionOrderKey','savePanelState']
 vm.runInContext(names.map(extract).join('\n') + '\nthis.api = { load: loadModConfig, get: getConfigValue, set: setConfigValue, panel: readConfigForPanel, preview: dispatchConfigPreview, layout: resolvePanelConfigLayout, mapLayout: mapCompatiblePanelConfigLayout, mapOrder: mapCompatibleConfigSectionOrder, savePanel: savePanelState };', context)
 const mod = { id: modId, path: modId, manifest: options.manifest || plain(manifest) }
 if (options.enabled !== false) context.api.load(mod)
 return { ...context.api, state, mod, store, writes, warnings, events, fail, context }
}

function main() {
 let checks = 0
 const check = (name, run) => { run(); checks++ }
 check('all renamed keys inherit each original value without writing or deleting', () => {
  for (const [old, next] of Object.entries(manifest.configCompatibility.keys)) {
   const value = manifest.config[next].default
   const source = new Map([[storageKey(old), JSON.stringify(value)]])
   const f = fixture(source)
   // Position order has an explicit historical marker; all other values retain type.
   if (next !== 'playTimeDisplayPosition') assert.deepEqual(plain(f.get(modId,next)), value)
   assert.equal(source.get(storageKey(old)), JSON.stringify(value)); assert.equal(f.writes.length,0)
   assert.equal(f.panel(f.mod).schema.length,55)
  }
 })
 for (const value of [false,0,'',null,{ nested: [0,false,''] },[1,2]]) check('existing canonical value wins: '+JSON.stringify(value), () => {
  const store = new Map([[storageKey('enableGrid'),JSON.stringify(value)],[storageKey('enableFloorGridLines'),'true']])
  const f = fixture(store)
  assert.deepEqual(plain(f.get(modId,'enableGrid')),value)
  assert.deepEqual(plain(f.get(modId,'enableFloorGridLines')),value)
  assert.deepEqual(plain(f.panel(f.mod).values.enableGrid),value)
  assert.equal(f.writes.length,0)
 })
 check('disabled Mod panel shares the same compatibility read and remains read-only', () => {
  const f = fixture(new Map([[storageKey('disableIdleSplash'),'true'],[storageKey('chasmLineRendererMode'),'0']]),{enabled:false})
  const p = f.panel(f.mod)
  assert.equal(p.values.enableOfflineSimulationSkip,true); assert.equal(p.values.enableChasmLineWebGL,false)
  assert.equal(f.writes.length,0); assert.equal(p.schema.length,55)
 })
 check('old get/set names resolve canonical values; writes are canonical only', () => {
  const f=fixture(new Map([[storageKey('disableIdleSplash'),'false']]))
  f.set(modId,'disableIdleSplash',true)
  assert.equal(f.get(modId,'enableOfflineSimulationSkip'),true)
  assert.equal(f.store.get(storageKey('disableIdleSplash')),'false')
  assert.deepEqual(f.writes,[storageKey('enableOfflineSimulationSkip')])
  const disabled=fixture(new Map(),{enabled:false}); disabled.panel(disabled.mod); disabled.set(modId,'disableIdleSplash',true)
  assert.equal(disabled.store.get(storageKey('enableOfflineSimulationSkip')),'true')
 })
 check('preview is canonical, single, read-only and cancellation restores the saved value', () => {
  const f=fixture(new Map([[storageKey('disableShiftCtrlZoomShortcut'),'false']]))
  const model={mod:f.mod,item:{key:'disableShiftCtrlZoomShortcut'},value:true}
  f.preview(model); assert.equal(f.events.length,1); assert.equal(f.events[0].key,'enableZoomResetBlock')
  assert.equal(f.get(modId,'enableZoomResetBlock'),false); assert.equal(f.writes.length,0)
  model.value=f.get(modId,'enableZoomResetBlock');f.preview(model)
  assert.equal(f.events[1].value,false);assert.equal(f.writes.length,0)
  f.set(modId,'enableZoomResetBlock',true);assert.equal(fixture(f.store).get(modId,'enableZoomResetBlock'),true)
 })
 const modes=[[0,false],[1,true],[-2,false],[2,true],['canvas',false],['Canvas2D',false],['canvas 2d',false],['vanilla',false],['webgl',true],['gpu',true],['1',true],['0',false],[null,false],[false,false],[true,true],['unexpected',true],[{},true]]
 for(const flag of [false,true])for(const [mode,expected] of modes)check('old bool/mode effective combination '+flag+'/'+JSON.stringify(mode),()=>{
  const store=new Map([[storageKey('enableChasmLineRenderer'),JSON.stringify(flag)],[storageKey('chasmLineRendererMode'),JSON.stringify(mode)]])
  const f=fixture(store);assert.equal(f.get(modId,'enableChasmLineWebGL'),flag&&expected);assert.equal(f.writes.length,0)
  f.set(modId,'enableChasmLineWebGL',true)
  assert.equal(fixture(store).get(modId,'enableChasmLineWebGL'),true)
  assert.equal(store.get(storageKey('chasmLineRendererMode')),JSON.stringify(mode))
 })
 check('unreadable old mode is conservative and new value bypasses old mode completely',()=>{
  const f=fixture(new Map(),{fail:{read:storageKey('chasmLineRendererMode')}});assert.equal(f.get(modId,'enableChasmLineWebGL'),false)
  const g=fixture(new Map([[storageKey('enableChasmLineWebGL'),'true']]),{fail:{read:storageKey('chasmLineRendererMode')}});assert.equal(g.get(modId,'enableChasmLineWebGL'),true)
 })
 for(const marker of [false,true])for(const value of [0,1,2])check('position order '+marker+'/'+value,()=>{
  const store=new Map([[storageKey('playTimeCounterPosition'),String(value)],[storageKey('playTimeCounterPositionOrderV2'),String(marker)]])
  const expected=marker?value:value===0?2:value===2?0:1
  const f=fixture(store);assert.equal(f.get(modId,'playTimeDisplayPosition'),expected)
  assert.equal(fixture(store).get(modId,'playTimeDisplayPosition'),expected,'read-only conversion is repeatable, not cumulative')
  f.set(modId,'playTimeDisplayPosition',value);assert.equal(fixture(store).get(modId,'playTimeDisplayPosition'),value,'new key never re-converts')
  assert.equal(store.get(storageKey('playTimeCounterPosition')),String(value));assert.equal(store.get(storageKey('playTimeCounterPositionOrderV2')),String(marker))
 })
 check('older camera, zoom, language and time sources retain explicit priority',()=>{
  const f=fixture(new Map([
   ['modloader:Cattail_TweaksQuality_Dynamic-Camera:config:enableDynamicCamera','false'],
   [storageKey('defaultPitch'),'0.8'],['modloader:Cattail_TweaksQuality_Dynamic-Camera:config:cameraPitch','0.7'],
   ['modloader:Cattail_TweaksQuality_View-Distance:config:farthestZoom','0.04'],
   [storageKey('enableExplainerLanguageFix'),'false'],
   ['modloader:Cattail_TweaksQuality_Dynamic-Details:config:playTimeCounterPosition','0']
  ]))
  assert.equal(f.get(modId,'enableCameraAngle'),false);assert.equal(f.get(modId,'cameraPitch'),0.8)
  assert.equal(f.get(modId,'cameraZoomMin'),0.04);assert.equal(f.get(modId,'enableExplainerFix'),false)
  assert.equal(f.get(modId,'playTimeDisplayPosition'),2);assert.equal(f.writes.length,0)
 })
 const oldLayout={blocks:[{type:'section',key:'section:extraFeatures',items:['resourceGlowColors','playTimeCounterPosition']},{type:'item',key:'disableIdleSplash'},{type:'section',key:'section:gameWindow',items:['windowSizePreset']}]}
 const oldOrder=['section:extraFeatures','section:gameWindow']
 check('layout mapping preserves custom order, reassignment and detached items without mutation',()=>{
  const f=fixture();const original=plain(oldLayout);f.state.panelConfigLayout[modId]=oldLayout
  const result=plain(f.layout(f.mod,f.state.configs[modId].schema))
  assert.equal(result[0].key,'section:other');assert.deepEqual(result[0].items.slice(0,2).map(x=>x.key),['resourceGlowColor','playTimeDisplayPosition'])
  assert.equal(result[1].type,'item');assert.equal(result[1].key,'enableOfflineSimulationSkip');assert.deepEqual(oldLayout,original)
  assert.deepEqual(plain(f.mapOrder(f.mod,oldOrder)),['section:other','section:window'])
 })
 check('canonical layout entries win even when old aliases occur first',()=>{
  const f=fixture();const mapped=plain(f.mapLayout(f.mod,{blocks:[
   {type:'item',key:'disableIdleSplash'},
   {type:'section',key:'section:extraFeatures',items:['resourceGlowColors','playTimeCounterPosition']},
   {type:'item',key:'enableOfflineSimulationSkip'},
   {type:'section',key:'section:other',items:['resourceGlowColor']}
  ]}))
  assert.equal(mapped.blocks[0].key,'enableOfflineSimulationSkip')
  assert.equal(mapped.blocks[1].key,'section:other');assert.deepEqual(mapped.blocks[1].items,['resourceGlowColor','playTimeDisplayPosition'])
 })
 for(const failure of ['backup','panel',null])check('layout persistence, backup failure/retry and other state: '+failure,()=>{
  const raw={configLayout:{[modId]:oldLayout,foreign:{blocks:[{type:'item',key:'opaque'}]}},configSectionOrder:{[modId]:oldOrder},unknownPanelField:{keep:true}}
  const key=`modloader:${modId}:identifierMigrationBackupV1`,store=new Map([[panelKey,JSON.stringify(raw)]])
  const f=fixture(store,{fail:{write:failure==='backup'?key:failure==='panel'?panelKey:undefined}})
  f.state.panelConfigLayout=plain(raw.configLayout);f.state.panelConfigSectionOrder=plain(raw.configSectionOrder)
  f.savePanel();let saved=JSON.parse(store.get(panelKey))
  if(failure==='backup'){assert.deepEqual(saved.configLayout[modId],oldLayout);assert.equal(store.has(key),false);assert.equal(f.warnings.length,1)}
  else if(failure==='panel')assert.deepEqual(saved,raw)
  else assert.equal(saved.configLayout[modId].blocks[0].key,'section:other')
  delete f.fail.write;f.savePanel();saved=JSON.parse(store.get(panelKey))
  assert.equal(saved.configLayout[modId].blocks[0].key,'section:other');assert.deepEqual(saved.configLayout.foreign,raw.configLayout.foreign)
  assert.deepEqual(saved.unknownPanelField,{keep:true});const snapshot=store.get(key);assert.deepEqual(JSON.parse(snapshot).layout,oldLayout)
  f.savePanel();assert.equal(store.get(key),snapshot,'original snapshot is never overwritten')
 })
 check('ordinary Mods without metadata retain original keys, values and layout',()=>{
  const m={id:modId,config:{old:{default:false,section:'before'}}};const f=fixture(new Map([[storageKey('old'),'true']]),{manifest:m})
  assert.equal(f.get(modId,'old'),true);assert.equal(f.state.configCompatibilityMods,undefined)
  const raw={blocks:[{type:'item',key:'old'}]};assert.equal(f.mapLayout(f.mod,raw),raw)
 })
 console.log(`Config identifier compatibility: ${checks} actual Loader scenario groups passed (read-only inheritance, value priority, old modes/order, layouts, backup/retry, previews and isolation).`)
 return checks
}
module.exports={fixture,extract,manifest,storageKey,main}
if(require.main===module)main()
