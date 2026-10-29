param(
    [string]$SourceRoot = (Join-Path $PSScriptRoot '..\..'),
    [string]$ArchiveRoot = 'D:\Mods\SixtyFourBackUp',
    [string]$EvidenceRoot,
    [switch]$HelperOnly
)
$ErrorActionPreference = 'Stop'
$SourceRoot = [IO.Path]::GetFullPath($SourceRoot)
. (Join-Path $SourceRoot 'modloader-installer\filesystem.ps1')
if (-not $EvidenceRoot) { $EvidenceRoot = Join-Path ([IO.Path]::GetTempPath()) ('loader-maintenance-' + [Guid]::NewGuid().ToString('N')) }
$EvidenceRoot = [IO.Path]::GetFullPath($EvidenceRoot)
if (Test-InstallerPath $EvidenceRoot) { throw 'Evidence directory must be new.' }
New-InstallerDirectory $EvidenceRoot
$results = @()
function Write-TestFile([string]$Path, [string]$Value) {
    New-InstallerDirectory ([IO.Path]::GetDirectoryName($Path))
    [IO.File]::WriteAllText((ConvertTo-InstallerNativePath $Path), $Value)
}
function Read-TestFile([string]$Path) { [IO.File]::ReadAllText((ConvertTo-InstallerNativePath $Path)) }
function Assert-Test([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Copy-TestTree([string]$Source, [string]$Target, [switch]$Filtered) {
    foreach ($file in Get-InstallerFiles $Source -ExcludeRelative @('state','backups','translations.json') -SkipDevelopmentCaches:$Filtered) {
        Copy-InstallerFile $file.FullName (Join-Path $Target $file.FullName.Substring($Source.TrimEnd('\').Length).TrimStart('\'))
    }
}
function Run-TestProcess([string]$Name, [string]$Executable, [string[]]$Arguments, [bool]$Success = $true) {
    $ErrorActionPreference = 'Continue'
    $savedModulePath = $env:PSModulePath
    try {
        # Windows PowerShell must resolve its own modules, not an inherited pwsh 7 path.
        Remove-Item Env:PSModulePath -ErrorAction SilentlyContinue
        $output = & $Executable @Arguments 2>&1
        $code = $LASTEXITCODE
    } finally { $env:PSModulePath = $savedModulePath }
    $ErrorActionPreference = 'Stop'
    $text = $output | Out-String
    Write-TestFile (Join-Path $EvidenceRoot ($Name + '.log')) $text
    if (($Success -and $code -ne 0) -or (-not $Success -and $code -eq 0)) { throw "Unexpected exit $code in $Name : $text" }
    $script:results += [pscustomobject]@{ name=$Name; exitCode=$code; expectedSuccess=$Success; status='PASS' }
    Write-Host "[PASS] $Name (exit $code)"
    return $text
}
$nativeExtract = Join-Path $EvidenceRoot 'native'
$oldExtract = Join-Path $EvidenceRoot 'old'
Expand-InstallerArchive (Join-Path $ArchiveRoot 'GameOriginalScripts1.3.0.1.zip') $nativeExtract
Expand-InstallerArchive (Join-Path $ArchiveRoot 'Sixty_Four_ModLoader-0.4.0.zip') $oldExtract
$oldRoot = (Get-InstallerDirectories $oldExtract | Select-Object -First 1).FullName
$oldCatalog = Join-Path $oldRoot 'resources\app\game\modloader\translations.json'
$pristine = Join-Path $EvidenceRoot 'pristine'
Copy-InstallerFile (Join-Path $nativeExtract 'main.js') (Join-Path $pristine 'resources\app\main.js')
Copy-TestTree (Join-Path $nativeExtract 'game') (Join-Path $pristine 'resources\app\game')
$payload = Join-Path $EvidenceRoot 'payload'
Copy-TestTree (Join-Path $SourceRoot 'modloader-installer') (Join-Path $payload 'modloader-installer') -Filtered
Copy-TestTree (Join-Path $SourceRoot 'resources\app\game\modloader') (Join-Path $payload 'resources\app\game\modloader') -Filtered
# Deliberately include an unwanted catalog to prove install never overwrites user overrides.
Write-TestFile (Join-Path $payload 'resources\app\game\modloader\translations.json') '{"version":1,"languages":{"en":{"modloader":{"close":"PACKAGE SHOULD NOT WIN"}}}}'
Write-TestFile (Join-Path $payload 'modloader-installer\modloader-package.json') '{"id":"sixtyfour-modloader","version":"0.5.0","builtAtUtc":"2026-10-28T12:00:00Z"}'
$dependency = 'resources\app\game\mods\fixture-mod\services\signaling\node_modules\@cloudflare\kv-asset-handler\package.json'
$cache = 'resources\app\game\mods\fixture-mod\services\signaling\node_modules\.vite\vitest\da39a3ee5e6b4b0d3255bfef95601890afd80709\results.json'
Write-TestFile (Join-Path $payload $dependency) 'real dependency retained'
Write-TestFile (Join-Path $payload $cache) 'cache must not install'
Write-TestFile (Join-Path $payload 'resources\app\game\mods\enabled.json') '{"mods":[]}'
function New-TestTarget([string]$Name, [string]$Catalog, [switch]$Fresh) {
    $target = Join-Path $EvidenceRoot ('targets\' + $Name)
    Copy-TestTree $pristine $target
    if (-not $Fresh) { Copy-TestTree (Join-Path $oldRoot 'resources\app\game\modloader') (Join-Path $target 'resources\app\game\modloader') }
    Write-TestFile (Join-Path $target 'resources\app\game\mods\enabled.json') '{"mods":[],"keep":"user preference"}'
    Write-TestFile (Join-Path $target 'resources\app\game\mods\user-only\keep.txt') 'user content'
    if ($Catalog -eq 'old') { Copy-InstallerFile $oldCatalog (Join-Path $target 'resources\app\game\modloader\translations.json') }
    if ($Catalog -eq 'custom') { Write-TestFile (Join-Path $target 'resources\app\game\modloader\translations.json') '{"version":1,"languages":{"en":{"modloader":{"searchHint":"My own wording"}}}}' }
    return $target
}
function Assert-CatalogUnchanged([string]$Target, [string]$Before) {
    $catalogPath = Join-Path $Target 'resources\app\game\modloader\translations.json'
    if ($null -eq $Before -or $Before -eq '') { Assert-Test (-not (Test-InstallerPath $catalogPath)) 'Missing catalog was created by installation' }
    else { Assert-Test ((Read-TestFile $catalogPath) -ceq $Before) 'User catalog changed' }
}
function Catalog-Before([string]$Target) {
    $file = Join-Path $Target 'resources\app\game\modloader\translations.json'
    if (Test-InstallerPath $file) { return Read-TestFile $file }
    return ''
}
try {
    $env:MODLOADER_OLD_CATALOG_PATH = $oldCatalog
    $longRelative = 'nested\' + ('deep-' * 40) + '\literal [brackets]\配置.json'
    $archiveSource = Join-Path $EvidenceRoot 'archive-source'
    Write-TestFile (Join-Path $archiveSource $longRelative) 'unicode and long paths'
    $archiveZip = Join-Path $EvidenceRoot 'archive-roundtrip-fixture.zip'
    Compress-InstallerDirectory $archiveSource $archiveZip
    $archiveTarget = Join-Path $EvidenceRoot 'archive-roundtrip'
    Expand-InstallerArchive $archiveZip $archiveTarget
    Assert-Test ((Read-TestFile (Join-Path $archiveTarget $longRelative)) -eq 'unicode and long paths') 'Archive long-path round trip failed'
    foreach ($unsafeName in @('../outside.txt', '/absolute.txt', 'C:/absolute.txt', 'dir/../../outside.txt')) {
        $badZip = Join-Path $EvidenceRoot 'unsafe-fixture.zip'
        $stream = [IO.File]::Open($badZip, [IO.FileMode]::Create)
        $zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
        $null = $zip.CreateEntry($unsafeName)
        $zip.Dispose(); $stream.Dispose()
        $rejected = $false
        try { Expand-InstallerArchive $badZip (Join-Path $EvidenceRoot 'unsafe-output') } catch { $rejected = $true }
        Assert-Test $rejected "Unsafe archive entry was accepted: $unsafeName"
        Assert-Test (-not (Test-InstallerPath (Join-Path $EvidenceRoot 'unsafe-output'))) 'Archive wrote output before name validation'
    }
    $script:results += [pscustomobject]@{name='archive-roundtrip-and-unsafe-entry-rejection';status='PASS'}
    $tokens=$null; $errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $SourceRoot 'modloader-installer\build-package.ps1'),[ref]$tokens,[ref]$errors)
    $functions=$ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$false)
    foreach($fn in $functions) { . ([scriptblock]::Create($fn.Extent.Text)) }
    $filtered = Join-Path $EvidenceRoot 'filtered'
    Copy-DirectoryFiltered -Source $payload -Target $filtered -ExcludePrefixes @('resources/app/game/modloader/translations.json')
    Assert-Test (-not (Test-InstallerPath (Join-Path $filtered $cache))) 'Package filtering retained .vite'
    Assert-Test (Test-InstallerPath (Join-Path $filtered $dependency)) 'Package filtering removed runtime dependency'
    Assert-Test (-not (Test-InstallerPath (Join-Path $filtered 'resources\app\game\modloader\translations.json'))) 'Package filtering included user override'
    $script:results += [pscustomobject]@{name='packaging-copy-filter-only';status='PASS'}
    & (Join-Path $SourceRoot 'modloader-installer/tests/verify-package-content.ps1')
    if (-not $?) { throw 'Player content filter test failed' }
    & (Join-Path $SourceRoot 'modloader-installer/tests/verify-verification-split.ps1')
    if (-not $?) { throw 'Verification split test failed' }
    Write-Host '[PASS] Archive and package-copy helper checks (no candidate package built).'
    if ($HelperOnly) {
        @{status='HELPER_ONLY_PASS'; results=$results; evidenceRoot=$EvidenceRoot} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'result.json') -Encoding UTF8
        return
    }
    foreach ($catalog in @('missing','old','custom')) {
        foreach ($mode in @('preserve','replace')) {
            $name = "upgrade-$catalog-$mode"
            $target = New-TestTarget $name $catalog
            $before = Catalog-Before $target
            $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $payload 'modloader-installer\install.ps1'),'-GameRoot',$target,'-SourceRoot',$payload,'-Force')
            if ($mode -eq 'preserve') { $arguments += '-SkipMods' } else { $arguments += '-ReplaceMods' }
            $null = Run-TestProcess $name 'powershell' $arguments
            Assert-CatalogUnchanged $target $before
            $userFile = Join-Path $target 'resources\app\game\mods\user-only\keep.txt'
            if ($mode -eq 'preserve') {
                Assert-Test ((Read-TestFile $userFile) -eq 'user content') 'PreserveMods lost user content'
                Assert-Test ((Read-TestFile (Join-Path $target 'resources\app\game\mods\enabled.json')).Contains('user preference')) 'PreserveMods changed enabled.json'
            } else {
                Assert-Test (-not (Test-InstallerPath $userFile)) 'ReplaceMods did not replace old folder'
                Assert-Test ((Read-TestFile (Join-Path $target $dependency)) -eq 'real dependency retained') 'Dependency missing'
                Assert-Test (-not (Test-InstallerPath (Join-Path $target $cache))) 'Development cache was installed'
            }
        }
    }
    $fresh = New-TestTarget 'fresh' 'missing' -Fresh
    $installArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $payload 'modloader-installer\install.ps1'),'-GameRoot',$fresh,'-SourceRoot',$payload)
    $null = Run-TestProcess 'fresh-install' 'powershell' $installArgs
    $backupRoot = Join-Path $fresh 'resources\app\game\modloader\state\install-backups'
    $firstId = (Read-TestFile (Join-Path $backupRoot 'latest-install.txt')).Trim()
    $nativeHash = (Get-InstallerFileMetadata (Join-Path $pristine 'resources\app\game\scripts\game.js')).Hash
    $null = Run-TestProcess 'repeat-install' 'powershell' ($installArgs + '-Force')
    $null = Run-TestProcess 'ordinary-uninstall' 'powershell' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $payload 'modloader-installer\uninstall.ps1'),'-GameRoot',$fresh,'-BackupId',$firstId,'-ConfirmUninstall')
    Assert-Test ((Get-InstallerFileMetadata (Join-Path $fresh 'resources\app\game\scripts\game.js')).Hash -eq $nativeHash) 'Uninstall did not restore native bytes'
    $inplace = New-TestTarget 'inplace' 'custom'
    Copy-TestTree $payload $inplace
    $before = Catalog-Before $inplace
    $null = Run-TestProcess 'inplace-install' 'powershell' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $inplace 'modloader-installer\install.ps1'),'-GameRoot',$inplace,'-SourceRoot',$inplace,'-Force')
    Assert-CatalogUnchanged $inplace $before
    $null = Run-TestProcess 'inplace-replace-rejected' 'powershell' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $inplace 'modloader-installer\install.ps1'),'-GameRoot',$inplace,'-SourceRoot',$inplace,'-Force','-ReplaceMods') $false
    # Tiny test input only; no full distribution/candidate package is built.
    $tinyZip = Join-Path $EvidenceRoot 'update-input-fixture.zip'
    Compress-InstallerDirectory $payload $tinyZip
    foreach ($mode in @('preserve','replace')) {
        $target = New-TestTarget ('updater-'+$mode) 'custom'
        $before = Catalog-Before $target
        $flag = if ($mode -eq 'preserve') { '-PreserveMods' } else { '-ReplaceMods' }
        $null = Run-TestProcess ('updater-'+$mode) 'powershell' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $SourceRoot 'modloader-installer\update.ps1'),'-GameRoot',$target,'-ZipPath',$tinyZip,$flag,'-KeepPackage')
        Assert-CatalogUnchanged $target $before
        Assert-Test (Test-InstallerPath $tinyZip) 'KeepPackage deleted test archive'
    }
    $oldBootstrapTarget = New-TestTarget 'original-04-updater' 'old'
    $before = Catalog-Before $oldBootstrapTarget
    $null = Run-TestProcess 'original-04-updater-bootstrap' 'powershell' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $oldRoot 'modloader-installer\update.ps1'),'-GameRoot',$oldBootstrapTarget,'-ZipPath',$tinyZip,'-PreserveMods','-KeepPackage')
    Assert-CatalogUnchanged $oldBootstrapTarget $before
    $null = Run-TestProcess 'installer-existing-contract' 'node' @((Join-Path $SourceRoot 'resources\app\game\modloader\tools\game-1.3-install-contract.test.js'),$SourceRoot,$pristine)
    $null = Run-TestProcess 'long-paths-and-rollback' 'powershell' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $SourceRoot 'modloader-installer\tests\verify-long-paths.ps1'))
    $null = Run-TestProcess 'watch-normal' 'node' @((Join-Path $SourceRoot 'resources\app\game\modloader\tools\library-store-v1-contract.test.js'))
    # Single-quoted JS literals survive Windows PowerShell's legacy native argument quoting.
    $libraryTest = "'" + (Join-Path $SourceRoot 'resources\app\game\modloader\tools\library-store-v1-contract.test.js').Replace('\','/').Replace("'", "\'") + "'"
    $libraryModule = "'" + (Join-Path $SourceRoot 'resources\app\game\modloader\library-store.js').Replace('\','/').Replace("'", "\'") + "'"
    $delayCode = "const fs=require('fs'),old=fs.promises.lstat; fs.promises.lstat=async(...args)=>{await new Promise(r=>setTimeout(r,20));return old(...args)};require($libraryTest)"
    $null = Run-TestProcess 'watch-delayed' 'node' @('-e',$delayCode)
    $silentCode = "require($libraryModule).LibraryStore.prototype._emitWatch=()=>{};require($libraryTest)"
    $negative = Run-TestProcess 'watch-missing-negative' 'node' @('-e',$silentCode) $false
    Assert-Test ($negative.Contains('timed out after 5000ms')) 'Missing watch notification failed for an unexpected reason'
    @{status='PASS'; sourceRoot=$SourceRoot; evidenceRoot=$EvidenceRoot; results=$results; candidatePackageBuilt=$false; version='0.5.0'} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'result.json') -Encoding UTF8
    Write-Host "All maintenance checks passed. Evidence: $EvidenceRoot"
} catch {
    @{status='FAIL'; error=$_.Exception.Message; results=$results; evidenceRoot=$EvidenceRoot} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'result.json') -Encoding UTF8
    throw
} finally {
    Remove-Item Env:MODLOADER_OLD_CATALOG_PATH -ErrorAction SilentlyContinue
}
