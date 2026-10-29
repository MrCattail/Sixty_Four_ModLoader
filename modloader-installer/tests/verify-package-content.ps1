param([string]$SourceRoot = (Join-Path $PSScriptRoot '../..'))
$ErrorActionPreference='Stop'
. (Join-Path $SourceRoot 'modloader-installer/filesystem.ps1')
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $SourceRoot 'modloader-installer/build-package.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw $errors[0] }
foreach($fn in $ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst]},$false)) { . ([scriptblock]::Create($fn.Extent.Text)) }
$root=Join-Path ([IO.Path]::GetTempPath()) ('package-content-'+[guid]::NewGuid().ToString('N'))
New-InstallerDirectory $root
try {
    $cases=@(
        @('tools/verify.ps1','loader',$true),@('tools/common.ps1','loader',$true),@('tools/modifier-watch.ps1','loader',$true),
        @('tools/helpers/translation-contract-fixtures.js','loader',$false),@('tools/fixtures/test.json','loader',$false),
        @('tools/verify-development.ps1','loader',$false),@('tools/panel-escape-contract.test.js','loader',$false),
        @('tools/game-1.3-smoke-bootstrap.cjs','loader',$false),@('diagnostics/startup-main.js','loader',$false),@('DIAGNOSTICS/nested/test.js','loader',$false),@('diagnostics-extra/keep.js','loader',$true),@('placement-render-hooks.js','loader',$true),
        @('loader.js','loader',$true),@('tools-extra/keep.js','loader',$true),@('tests/fixture.js','installer',$false),
        @('tests-extra/keep.js','installer',$true),@('filesystem.ps1','installer',$true),
        @('Archived/old/mod.json','mods',$false),@('archived/nested/test.js','mods',$false),
        @('Archived-extra/keep.js','mods',$true),@('Current/Archived/keep.js','mods',$true),
        @('template_and_example/_template-building/mod.json','mods',$true),
        @('Cattail_TweaksNetwork_P2P-Multiplayer/mod.json','mods',$false),
        @('cattail_tweaksnetwork_p2p-multiplayer/scripts/main.js','mods',$false),
        @('Cattail_TweaksNetwork_P2P-Multiplayer/services/signaling/node_modules/deep/package.json','mods',$false),
        @('Cattail_TweaksNetwork_P2P-Multiplayer-extra/keep.js','mods',$true),
        @('Current/Cattail_TweaksNetwork_P2P-Multiplayer/keep.js','mods',$true),
        @('Current/tests/contract.js','mods',$false),@('Current/TESTS/deep/input.json','mods',$false),
        @('Current/tests-extra/keep.js','mods',$true),@('Current/scripts/tests/asset.js','mods',$true),
        @('template_and_example/tests/example.js','mods',$true),
        @('template_and_example/_template-building/tests/example.js','mods',$true),
        @('Translations-20260721-191815.json','loader',$false),
        @('Translations-20260721-191815.json.extra','loader',$true)
    )
    foreach($case in $cases) {
        if ((Test-PlayerPackagePath $case[0] $case[1]) -ne $case[2]) { throw "Incorrect content decision: $($case[0])" }
        $src=Join-Path $root ('src-'+$case[1]); $file=Join-Path $src $case[0]
        New-InstallerDirectory ([IO.Path]::GetDirectoryName($file)); [IO.File]::WriteAllText($file,'fixture')
    }
    foreach($area in @('loader','installer','mods')) { Copy-DirectoryFiltered -Source (Join-Path $root ('src-'+$area)) -Target (Join-Path $root ('out-'+$area)) -PackageArea $area }
    foreach($case in $cases) { if ((Test-InstallerPath (Join-Path $root ('out-'+$case[1]+'/'+$case[0]))) -ne $case[2]) { throw "Copy filter mismatch: $($case[0])" } }
    foreach($rel in @('template_and_example/_template-building/mod.json','vendor/library.js','tests/consumer.js')) { if (-not (Test-PlayerPackagePath $rel 'mods')) { throw "Unapproved Mod exclusion: $rel" } }
    if (Test-PlayerPackagePath 'Archived' 'mods') { throw 'Archived root retained' }
    $builder=Get-Content -LiteralPath (Join-Path $SourceRoot 'modloader-installer/build-package.ps1') -Raw
    if ($builder -notmatch '(?s)-Source \(Join-Path \$packageRoot ''resources\\app\\game\\mods''\).*?-PackageArea mods') { throw 'Build mods copy does not enable player filter' }
    if (Test-PlayerPackagePath 'Cattail_TweaksNetwork_P2P-Multiplayer' 'mods') { throw 'P2P root retained' }
    $enabledFixture = Join-Path $root 'enabled.json'
    [IO.File]::WriteAllText($enabledFixture, '{"mods":["Cattail_TweaksNetwork_P2P-Multiplayer"]}')
    $beforeEnabled = [IO.File]::ReadAllText($enabledFixture)
    $rejected = $false
    try { Assert-PlayerPackageEnabledMods $enabledFixture } catch { $rejected = $_.Exception.Message -like '*excludes P2P*' }
    if (-not $rejected) { throw 'Enabled P2P was not rejected' }
    Assert-PlayerPackageEnabledMods $enabledFixture -CleanEnabled
    if ([IO.File]::ReadAllText($enabledFixture) -cne $beforeEnabled) { throw 'Source enabled list was modified' }
    [IO.File]::WriteAllText($enabledFixture, '{"mods":["Cattail_TweaksQuality_Better-UIs"]}')
    Assert-PlayerPackageEnabledMods $enabledFixture
    Assert-PlayerPackageEnabledMods (Join-Path $SourceRoot 'resources/app/game/mods/enabled.json')
    # Filter actual current Mods, then resolve every declared runtime entry.
    $sourceMods=(Resolve-Path -LiteralPath (Join-Path $SourceRoot 'resources/app/game/mods')).Path
    $filteredMods=Join-Path $root 'filtered-real-mods'
    Copy-DirectoryFiltered -Source $sourceMods -Target $filteredMods -PackageArea mods
    $entryCount=0
    foreach($folder in Get-ChildItem -LiteralPath $filteredMods -Directory) {
        if ($folder.Name -eq 'template_and_example') { continue }
        $manifestPath=Join-Path $folder.FullName 'mod.json'
        if (-not (Test-Path -LiteralPath $manifestPath)) { continue }
        if (Test-Path -LiteralPath (Join-Path $folder.FullName 'tests')) { throw "Mod tests retained: $($folder.Name)" }
        $manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach($entry in @($manifest.entry)+@($manifest.entries)) {
            if ($entry -is [string] -and $entry) {
                if (-not (Test-Path -LiteralPath (Join-Path $folder.FullName $entry))) { throw "Runtime entry missing: $($folder.Name)/$entry" }
                $entryCount++
            }
        }
    }
    foreach($file in Get-ChildItem -LiteralPath (Join-Path $sourceMods 'template_and_example') -File -Recurse) {
        $relative=$file.FullName.Substring($sourceMods.Length).TrimStart('\')
        $copied=Join-Path $filteredMods $relative
        if (-not (Test-Path -LiteralPath $copied) -or (Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath $copied).Hash) { throw "Template changed or missing: $relative" }
    }
    Write-Host "PASS: actual Mod copy excludes root tests and retains $entryCount declared runtime entries plus every template file."
    # Execute the real optional entry functions with diagnostics absent; no Electron launch.
    $diagnosticsContract = @'
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=process.argv[2], source=fs.readFileSync(path.join(root,'resources/app/game/modloader/loader.js'),'utf8');
const main=fs.readFileSync(path.join(root,'resources/app/game/modloader/main-process.js'),'utf8');
function declaration(name) {
 const start=source.indexOf('\tconst '+name+' = '); assert.ok(start>=0,name);
 const rest=source.slice(start); const next=rest.slice(1).search(/\n\t(?:const|let) /);
 assert.ok(next>=0,name+' boundary'); return rest.slice(0,next+1);
}
(async()=>{
 let loads=0,ipc=0,ui=0,installed=0;
 const hooks={}; const window={};
 const tools={gameRoot:root,path,fs:{existsSync:p=>p.endsWith('placement-render-hooks.js')},ipcRenderer:{invoke:async()=>{ipc++;return {ok:true}}}};
 const context={getModFileTools:()=>tools,clearViewProbe:null,periodicStallProbe:null,
 placementProbeController:null,placementRenderHooks:null,Game:function(){},window,
 require:p=>{loads++;assert.ok(p.endsWith('placement-render-hooks.js'));return {install:()=>{installed++;return hooks}}},
 warn:()=>{throw Error('Unexpected warning')},document:{createElement:()=>{ui++;throw Error('Diagnostic UI must be absent')}}};
 for(const name of ['renderClearViewProbeControls','renderPeriodicStallProbeControls']) {
  vm.runInNewContext(declaration(name)+'\n'+name+'({});',context);
 }
 for(const name of ['getClearViewProbe','getPeriodicStallProbe']) {
  assert.throws(()=>vm.runInNewContext(declaration(name)+'\n'+name+'();',context),/\u53ef\u9009\u8bca\u65ad\u7ec4\u4ef6/);
 }
 await vm.runInNewContext(declaration('startClearViewOriginIfArmed')+'\nstartClearViewOriginIfArmed({});',context);
 vm.runInNewContext(declaration('preparePlacementProbe')+'\npreparePlacementProbe();',context);
 assert.equal(installed,1); assert.equal(window.__cattailPlacementRenderHooksV1,hooks);
 assert.equal(loads,1); assert.equal(ipc,0); assert.equal(ui,0);
 let diagnosticLoads=0;
 const fakeFs={existsSync:()=>false};
 const request=id=>{if(id.startsWith('./diagnostics/')){diagnosticLoads++;throw Error('Missing module was requested')}
  if(id==='electron')return {app:{commandLine:{hasSwitch:()=>true}}};if(id==='fs')return fakeFs;return require(id)};
 vm.runInNewContext(main.slice(0,main.indexOf('const { SnapshotStore,')),{require:request,__dirname:root});
 const start=main.indexOf('  startupProbeService?.attachWindow(win)');
 const end=main.indexOf('  configureSnapshotStore(options)',start);assert.ok(start>=0&&end>start);
 vm.runInNewContext(main.slice(start,end),{startupProbeService:null,clearViewProbeService:null,periodicStallProbeService:null,
 fs:fakeFs,path,__dirname:root,win:{},require:request});
 assert.equal(diagnosticLoads,0);
 console.log('PASS: absent diagnostics hides UI, skips IPC/module loads even with startup switch, and retains shared placement adapter.');
})().catch(e=>{console.error(e);process.exitCode=1});
'@
    $diagnosticsContract | & node - $SourceRoot
    if ($LASTEXITCODE) { throw 'Diagnostics-absent runtime contract failed' }
    # Exercise the real filtered source without running the package builder or creating a ZIP.
    $player = Join-Path $root 'player-source'
    Copy-DirectoryFiltered -Source (Join-Path $SourceRoot 'resources/app/game/modloader') -Target (Join-Path $player 'resources/app/game/modloader') -PackageArea loader -ExcludePrefixes @('state/','backups/','translations.json')
    Copy-DirectoryFiltered -Source (Join-Path $SourceRoot 'modloader-installer') -Target (Join-Path $player 'modloader-installer') -PackageArea installer
    New-InstallerDirectory (Join-Path $player 'resources/app/game/mods')
    [IO.File]::WriteAllText((Join-Path $player 'resources/app/game/mods/enabled.json'), '{"mods":[]}')
    if (Test-InstallerPath (Join-Path $player 'resources/app/game/modloader/Translations-20260721-191815.json')) { throw 'Old translation backup leaked into player source' }
    if (Test-InstallerPath (Join-Path $player 'resources/app/game/modloader/diagnostics')) { throw 'Diagnostics leaked into player source' }
    if (-not (Test-InstallerPath (Join-Path $player 'resources/app/game/modloader/placement-render-hooks.js'))) { throw 'Shared placement hooks missing' }
    foreach($keep in @('verify.ps1','common.ps1','modifier-watch.ps1','snapshot.ps1','report.ps1','restore.ps1')) {
        if (-not (Test-InstallerPath (Join-Path $player "resources/app/game/modloader/tools/$keep"))) { throw "Missing player tool $keep" }
    }
    if (Test-InstallerPath (Join-Path $player 'resources/app/game/modloader/tools/verify-development.ps1')) { throw 'Development runner leaked into player source' }
    $native = Join-Path $root 'native'
    Expand-InstallerArchive 'D:/Mods/SixtyFourBackUp/GameOriginalScripts1.3.0.1.zip' $native
    $target = Join-Path $root 'installed-player'
    Copy-InstallerFile (Join-Path $native 'main.js') (Join-Path $target 'resources/app/main.js')
    Copy-DirectoryFiltered -Source (Join-Path $native 'game') -Target (Join-Path $target 'resources/app/game')
    $savedModules=$env:PSModulePath; Remove-Item Env:PSModulePath -ErrorAction SilentlyContinue
    $savedError=$ErrorActionPreference; $ErrorActionPreference='Continue'
    try {
        $output=& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $player 'modloader-installer/install.ps1') -GameRoot $target -SourceRoot $player 2>&1
        $code=$LASTEXITCODE
    } finally { $env:PSModulePath=$savedModules; $ErrorActionPreference=$savedError }
    if ($code -ne 0 -or "$output" -notmatch 'Installation checks passed') { throw "Filtered real player source install failed: $output" }
    $before=@(Get-InstallerFiles $target | ForEach-Object { $m=Get-InstallerFileMetadata $_.FullName; "$($_.FullName)|$($m.Hash)" })
    Remove-Item Env:PSModulePath -ErrorAction SilentlyContinue
    $ErrorActionPreference='Continue'
    try {
        $output=& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $player 'modloader-installer/install.ps1') -GameRoot $target -SourceRoot $player -Force -FullVerification 2>&1
        $code=$LASTEXITCODE
    } finally { $env:PSModulePath=$savedModules; $ErrorActionPreference=$savedError }
    $after=@(Get-InstallerFiles $target | ForEach-Object { $m=Get-InstallerFileMetadata $_.FullName; "$($_.FullName)|$($m.Hash)" })
    if ($code -eq 0 -or "$output" -notmatch 'requires development source' -or (Compare-Object $before $after)) { throw "Full verification did not reject before writes: $output" }
    Write-Host 'PASS: real filtered source installs without development suites; FullVerification rejects without target changes.'
    Write-Host 'PASS: player content selection and actual copy; Archived/P2P excluded; enabled P2P rejected; diagnostics excluded; templates/similar names/shared hooks/vendor/runtime entries retained; Mod root tests and old translation backup excluded; no package built.'
} finally { Remove-InstallerDirectory $root }
