'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {ROOT,MOD,inside}=require('./fixtures.cjs');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function prepare(source=path.resolve(__dirname,'../../../../../../..')){
 if(!fs.existsSync(path.join(ROOT,'baseline.json')))throw Error('APPROVED_BACKUP_REQUIRED');
 const runtime=path.join(ROOT,'runtime'),app=path.join(runtime,'resources/app'),game=path.join(app,'game');
 fs.mkdirSync(app,{recursive:true});
 const copied=[];
 function copy(src,dst){
  if(!inside(ROOT,dst))throw Error('OUTSIDE_OUTPUT_ROOT');
  fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);
  copied.push({source:src,target:dst,sha256:hash(src)});
 }
 function tree(src,dst,skip=new Set()){
  for(const e of fs.readdirSync(src,{withFileTypes:true})){
   if(skip.has(e.name))continue;
   if(e.isDirectory())tree(path.join(src,e.name),path.join(dst,e.name),skip);
   else copy(path.join(src,e.name),path.join(dst,e.name));
  }
 }
 for(const name of ['sixtyfour.exe','chrome_100_percent.pak','chrome_200_percent.pak','d3dcompiler_47.dll','dxcompiler.dll','electron_wer.dll','ffmpeg.dll','icudtl.dat','resources.pak','snapshot_blob.bin','v8_context_snapshot.bin','vk_swiftshader_icd.json','vk_swiftshader.dll','vulkan-1.dll','LICENSE.electron.txt','LICENSES.chromium.html','locales/en-US.pak'])copy(path.join(source,name),path.join(runtime,name));
 for(const name of ['scripts','img','sfx','font'])tree(path.join(source,'resources/app/game',name),path.join(game,name));
 for(const name of ['index.html','cascade.css','cascade_mobile.css','manifest.json'])copy(path.join(source,'resources/app/game',name),path.join(game,name));
 tree(path.join(source,'resources/app/game/modloader'),path.join(game,'modloader'),new Set(['state','backups','logs','node_modules','.temp']));
 const mod=path.join(source,'resources/app/game/mods',MOD),clone=path.join(game,'mods',MOD);
 copy(path.join(mod,'mod.json'),path.join(clone,'mod.json'));tree(path.join(mod,'scripts'),path.join(clone,'scripts'));
 fs.writeFileSync(path.join(game,'mods/enabled.json'),JSON.stringify({mods:[MOD]},null,2));
 for(const name of ['main.cjs','preload.cjs','session-guard.cjs','fixtures.cjs'])copy(path.join(__dirname,name),path.join(app,name));
 fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'sixtyfour-p2p-desktop13-isolated',version:'0.0.0',main:'main.cjs'}));
 const sdk=path.join(app,'node_modules/@playsaurus-inc/sdk');fs.mkdirSync(sdk,{recursive:true});
 fs.writeFileSync(path.join(sdk,'index.js'),"let initialized=false;module.exports={GamePlatform:{Web:'offline'},GameStorefront:{PlaysaurusWeb:'offline'},initialize(){initialized=true},isInitialized(){return initialized},analytics:{sendEvent(){}}};\n");
 fs.writeFileSync(path.join(ROOT,'source-manifest.json'),JSON.stringify({copied,generated:['package.json','mods/enabled.json','SDK stub'],officialMainLoaded:false},null,2));
 return {runtime,files:copied.length};
}
if(require.main===module)console.log(prepare(process.argv[2]||process.cwd()));
module.exports={prepare};
