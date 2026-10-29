'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const root=path.resolve(__dirname,'..'),gameRoot=path.resolve(root,'../..')
const {fixture,extract,manifest,storageKey}=require(path.join(gameRoot,'modloader/tools/config-identifier-compatibility-contract.test.js'))
const modId=manifest.id
const plain=x=>JSON.parse(JSON.stringify(x))
function fn(source,name){const m=source.match(new RegExp('^([\\t ]*)function '+name+'\\([^]*?\\n\\1\\}', 'm'));assert(m,'actual function '+name);return m[0]}
const apis=[
 ['chasm-transfer-index.js','CattailTweaksChasmTransferPathIndex','chasmTransferIndex'],
 ['cube-resource-cache.js','CattailTweaksCubeResourceCache','cubeResourceCache'],
 ['building-batch-cache.js','CattailTweaksEntitySliceCache','buildingBatchCache'],
 ['building-sprite-cache.js','CattailTweaksEntitySpriteCache','buildingSpriteCache'],
 ['building-webgl-recorder.js','CattailTweaksEntityWebGLRenderer','buildingWebGLRecorder'],
 ['resource-explosion-path-reuse.js','CattailTweaksResourceExplosionBezierFastPath','resourceExplosionPathReuse'],
 ['resource-sprite-cache.js','CattailTweaksResourceIconCache','resourceSpriteCache'],
 ['resource-render-timing.js','CattailTweaksResourceRenderTiming','resourceRenderTiming'],
 ['kernel-range-preview.js','CattailTweaksScanRangePreview','kernelRangePreview'],
 ['camera-angles.js','__cattailDynamicCameraCubeProjectionV1','cameraCubeProjectionV1'],
 ['grid.js','__cattailTweaksFloorGridV1','gridV1']
]
let checks=0
function check(name,run){run();checks++}
check('55 settings, seven contiguous groups and 39 existing entry paths retain structure',()=>{
 assert.equal(Object.keys(manifest.config).length,55);assert.equal(manifest.entries.length,39)
 assert.equal(new Set(manifest.entries.map(x=>x.toLowerCase())).size,39)
 const groups=[];for(const item of Object.values(manifest.config))if(groups.at(-1)!==item.section)groups.push(item.section)
 assert.deepEqual(groups,['window','improvements','disabledFeatures','fixes','visuals','other','performance'])
 for(const f of manifest.entries)assert(fs.existsSync(path.join(root,f)))
 assert(manifest.entries.includes('scripts/void-Altar-Wave.js'))
 assert.equal(manifest.config.enableExplainer.type,'slider');assert.equal(manifest.config.enableExplainer.default,0)
 assert.equal(manifest.config.resourceGlowColor.type,'colorPalette');assert.equal(manifest.config.enableBuildingWebGLRecorder.default,false)
})
for(const [file,old,next] of apis)check('canonical/legacy same-object forwarding: '+next,()=>{
 const window={};const context=vm.createContext({window,ModLoader:{register(){}},console})
 vm.runInContext(fs.readFileSync(path.join(root,'scripts',file),'utf8'),context)
 assert.equal(typeof Object.getOwnPropertyDescriptor(window,old)?.get,'function')
 const first={stats(){return this},probe:1};window[old]=first
 assert.equal(window.CattailTweaks[next],first);assert.equal(window[old].stats(),first)
 const replacement={stats(){return this},probe:2};window.CattailTweaks[next]=replacement
 assert.equal(window[old],replacement);assert.equal(window[old].stats(),replacement)
})
check('a foreign namespace root is preserved and legacy access remains usable',()=>{
 const window={CattailTweaks:'foreign'},warnings=[]
 vm.runInNewContext(fs.readFileSync(path.join(root,'scripts/cube-resource-cache.js'),'utf8'),{window,ModLoader:{register(){}},console:{warn(x){warnings.push(x)}}})
 assert.equal(window.CattailTweaks,'foreign');const api={stats(){return this}};window.CattailTweaksCubeResourceCache=api
 assert.equal(window.CattailTweaksCubeResourceCache,api);assert.equal(warnings.length,1)
})
check('game camera state aliases share writes, replacement and cleanup per owner',()=>{
 const source=fs.readFileSync(path.join(root,'scripts/camera-angles.js'),'utf8')
 const bind=vm.runInNewContext('const cameraStateAliasOwners=new WeakSet();'+fn(source,'bindCameraStateAlias')+'\nbindCameraStateAlias')
 const a={__cattailDynamicCameraState:{pitch:0.8}},b={};bind(a);bind(b)
 assert.equal(a.__cattailTweaksCameraAngleState,a.__cattailDynamicCameraState)
 const newer={pitch:0.6};a.__cattailTweaksCameraAngleState=newer;assert.equal(a.__cattailDynamicCameraState,newer)
 const oldWriter={pitch:1};a.__cattailDynamicCameraState=oldWriter;assert.equal(a.__cattailTweaksCameraAngleState,oldWriter)
 assert.equal(b.__cattailDynamicCameraState,undefined);delete a.__cattailTweaksCameraAngleState;assert.equal(a.__cattailDynamicCameraState,undefined)
 bind(a);a.__cattailTweaksCameraAngleState={pitch:0.9};assert.equal(a.__cattailDynamicCameraState.pitch,0.9)
})
check('legacy palette positions keep their existing persisted addresses',()=>{
 const source=fs.readFileSync(path.join(root,'scripts/quick-settings.js'),'utf8')
 const key=vm.runInNewContext(fn(source,'storageKey')+'\nstorageKey',{
  floorPalettePositionKey:'__cattailTweaksQuickSettingsFloorPalettePosition',
  floorGridRealityPalettePositionKey:'__cattailTweaksQuickSettingsFloorGridRealityPalettePosition',
  floorGridVoidPalettePositionKey:'__cattailTweaksQuickSettingsFloorGridVoidPalettePosition'
 })
 assert.equal(key({steamId:'account'},'__cattailTweaksQuickSettingsFloorGridRealityPalettePosition'),'cattailAccessibilityButtons:account:__cattailAccessibilityFloorGridRealityPalettePosition')
 assert.equal(key({steamId:'account'},'__cattailTweaksQuickSettingsFloorGridVoidPalettePosition'),'cattailAccessibilityButtons:account:__cattailAccessibilityFloorGridVoidPalettePosition')
 assert.equal(key({steamId:'account'},'floorPalette'),'cattailAccessibilityButtons:account:floorPalette')
})
check('old floor preferences prevent an older account palette from overwriting inherited values',()=>{
 const f=fixture(new Map([[storageKey('enableFloorColorOverride'),'false'],[storageKey('floorColorOverrideRealityColor'),'"#123456"'],['cattailAccessibilityButtons:account:floorOverride','true'],['cattailAccessibilityButtons:account:floorColor','#FFFFFF']]))
 const handlers={};vm.runInNewContext(fs.readFileSync(path.join(root,'scripts/floor-color.js'),'utf8'),{
  ModLoader:{register(def){def.init({config:{get:(k,d)=>f.get(modId,k,d),set:(k,v)=>f.set(modId,k,v)},on:(n,h)=>{handlers[n]=h}})}},
  window:{addEventListener(){}},localStorage:{getItem:k=>f.store.has(k)?f.store.get(k):null}
 })
 handlers.afterGameInit(null,{steamId:'account'})
 assert.equal(f.get(modId,'enableFloorColor'),false);assert.equal(f.get(modId,'floorColor'),'#123456');assert.equal(f.writes.length,0)
})
check('actual Better UIs bridge reads the canonical setting and receives one preview/cancel',()=>{
 const f=fixture(new Map([[storageKey('disableShiftCtrlZoomShortcut'),'false']]))
 const source=fs.readFileSync(path.join(gameRoot,'mods/Cattail_TweaksQuality_Better-UIs/scripts/settings-page.js'),'utf8')
 const key=source.match(/const shiftCtrlZoomDisableKey = '([^']+)'/)[1];assert.equal(key,'enableZoomResetBlock')
 const window=new EventTarget();window.ModLoader={getConfigValue:(...args)=>f.get(...args)}
 const api={state:{modById:{[modId]:{}}}}
 const bridge=vm.runInNewContext(`let shiftCtrlZoomDisablePreview=null;const tweaksModId='${modId}';const shiftCtrlZoomDisableKey='${key}';${fn(source,'installConfigPreviewListener')}\n${fn(source,'isShiftCtrlZoomResetDisabled')}\ninstallConfigPreviewListener();isShiftCtrlZoomResetDisabled`,{window,api})
 assert.equal(bridge(),false);f.preview({mod:f.mod,item:{key:'disableShiftCtrlZoomShortcut'},value:true});assert.equal(f.events.length,1)
 window.dispatchEvent(new CustomEvent('modloader:config-preview',{detail:f.events[0]}));assert.equal(bridge(),true)
 window.dispatchEvent(new CustomEvent('modloader:config-preview',{detail:{...f.events[0],value:false}}));assert.equal(bridge(),false)
 delete api.state.modById[modId];assert.equal(bridge(),false)
})
check('resource palette preserves the old sharing type and old import field',()=>{
 const functions=['getColorPaletteShareType','normalizeColorPaletteImportKey','addColorPaletteImportValue','normalizeColorPaletteImportData','normalizePanelHexColor'].map(extract).join('\n')
 const api=vm.runInNewContext(functions+';\n({type:getColorPaletteShareType,parse:normalizeColorPaletteImportData})',{getInlineLocalizedText:x=>x,CONFIG_INLINE_TEXT:{colorClipboardInvalid:'invalid'}})
 assert.equal(api.type({...manifest.config.resourceGlowColor,key:'resourceGlowColor'}),'CattailResourceGlowColors')
 assert.deepEqual(plain(api.parse({type:'CattailResourceGlowColors',resourceGlowColors:{r1:'#aabbcc',2:'#123456'}})),{'1':'#AABBCC','2':'#123456'})
})
console.log(`Tweaks identifier compatibility: ${checks} scenario groups passed (11 live-source aliases, camera owner state, legacy palettes, actual Better UIs bridge and old share format).`)
