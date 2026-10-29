param(
    [Parameter(Mandatory=$true)][string]$CandidateZip,
    [Parameter(Mandatory=$true)][string]$SourceRoot,
    [Parameter(Mandatory=$true)][string]$EvidenceRoot,
    [string]$ArchiveRoot='D:/Mods/SixtyFourBackUp'
)
$ErrorActionPreference='Stop'
$SourceRoot=[IO.Path]::GetFullPath($SourceRoot)
$CandidateZip=[IO.Path]::GetFullPath($CandidateZip)
$EvidenceRoot=[IO.Path]::GetFullPath($EvidenceRoot)
. (Join-Path $SourceRoot 'modloader-installer/filesystem.ps1')
if (Test-InstallerPath $EvidenceRoot) { throw 'Candidate evidence directory must be new.' }
New-InstallerDirectory $EvidenceRoot
$zipHash=(Get-FileHash -LiteralPath $CandidateZip).Hash
$results=@()
function Write-Test([string]$Path,[string]$Text) {New-InstallerDirectory ([IO.Path]::GetDirectoryName($Path));[IO.File]::WriteAllText((ConvertTo-InstallerNativePath $Path),$Text,[Text.UTF8Encoding]::new($true))}
function Assert-Test([bool]$Ok,[string]$Message) {if(-not $Ok){throw $Message}}
function Copy-Tree([string]$From,[string]$To) {foreach($f in Get-InstallerFiles $From){Copy-InstallerFile $f.FullName (Join-Path $To $f.FullName.Substring($From.TrimEnd('\').Length).TrimStart('\'))}}
function Run-Test([string]$Name,[string]$Script,[string[]]$Arguments,[bool]$Success=$true) {
    $saved=$env:PSModulePath;Remove-Item Env:PSModulePath -ErrorAction SilentlyContinue
    $savedError=$ErrorActionPreference;$ErrorActionPreference='Continue'
    try {$out=& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Script @Arguments 2>&1;$code=$LASTEXITCODE}
    finally {$env:PSModulePath=$saved;$ErrorActionPreference=$savedError}
    $text=$out|Out-String
    Write-Test (Join-Path $EvidenceRoot ($Name+'.log')) $text
    Assert-Test (($code -eq 0) -eq $Success) "Unexpected exit $code in $Name : $text"
    $script:results+=@{name=$Name;exitCode=$code;expectedSuccess=$Success;status='PASS'}
    Write-Host "[PASS] $Name"
    return $text
}
$core=@('resources/app/main.js','resources/app/game/index.html','resources/app/game/scripts/game.js','resources/app/game/scripts/ui.js','resources/app/game/scripts/sprites.js')
function Core-Hashes([string]$Target) {return @($core|ForEach-Object{(Get-FileHash -LiteralPath (Join-Path $Target $_)).Hash})}
try {
    $payload=Join-Path $EvidenceRoot 'actual-zip'
    Expand-InstallerArchive $CandidateZip $payload
    $stage=Join-Path $SourceRoot 'dist/package-staging/SixtyFour-ModLoader'
    Assert-Test (Test-InstallerPath $stage) 'Frozen build staging is required for content comparison'
    $expected=@(Get-InstallerFiles $stage|ForEach-Object{$_.FullName.Substring($stage.Length).TrimStart('\').Replace('\','/')}|Sort-Object)
    $actual=@(Get-InstallerFiles $payload|ForEach-Object{$_.FullName.Substring($payload.Length).TrimStart('\').Replace('\','/')}|Sort-Object)
    Assert-Test (-not (Compare-Object $expected $actual)) 'ZIP file list differs from frozen staging'
    foreach($relative in $actual){Assert-Test ((Get-FileHash -LiteralPath (Join-Path $payload $relative)).Hash -eq (Get-FileHash -LiteralPath (Join-Path $stage $relative)).Hash) "ZIP hash mismatch $relative"}
    foreach($relative in $actual){
        Assert-Test ($relative -notmatch '^resources/app/game/modloader/(diagnostics/|state/|backups/|Translations-20260721-191815.json$|translations.json$)') "Excluded Loader path $relative"
        Assert-Test ($relative -notmatch '^resources/app/game/mods/(Archived|Cattail_TweaksNetwork_P2P-Multiplayer)/') "Excluded Mod $relative"
        Assert-Test ($relative -notmatch '^resources/app/game/mods/(?!template_and_example/)[^/]+/tests/') "Mod tests leaked $relative"
        Assert-Test ($relative -notmatch '^modloader-installer/tests/') "Installer tests leaked $relative"
        Assert-Test ($relative -notmatch '(^|/)\.vite/') "Cache leaked $relative"
        Assert-Test ($relative -notin $core) "Native game source leaked $relative"
    }
    $enabled=Get-Content -LiteralPath (Join-Path $payload 'resources/app/game/mods/enabled.json') -Raw|ConvertFrom-Json
    Assert-Test (@($enabled.mods).Count -eq 0) 'Candidate enabled list is not empty'
    $manifest=Get-Content -LiteralPath (Join-Path $payload 'modloader-installer/modloader-package.json') -Raw|ConvertFrom-Json
    Assert-Test ($manifest.version -eq '0.5.0') 'Candidate version changed'
    Assert-Test ([bool]$manifest.builtAtUtc) 'Candidate build time missing'
    $tokens=$null;$parseErrors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $SourceRoot 'modloader-installer/build-package.ps1'),[ref]$tokens,[ref]$parseErrors)
    foreach($fn in $ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst]},$false)){. ([scriptblock]::Create($fn.Extent.Text))}
    foreach($relative in $actual){if($relative.StartsWith('resources/app/game/modloader/')){Assert-Test (Test-PlayerPackagePath $relative.Substring(('resources/app/game/modloader/').Length) 'loader') "Unexpected Loader developer file $relative"}}
    $mods=Join-Path $payload 'resources/app/game/mods'
    $modCount=0;$entryCount=0
    foreach($folder in Get-ChildItem -LiteralPath $mods -Directory){
        if($folder.Name -eq 'template_and_example'){continue}
        $mf=Get-Content -LiteralPath (Join-Path $folder.FullName 'mod.json') -Raw -Encoding UTF8|ConvertFrom-Json;$modCount++
        foreach($entry in @($mf.entry)+@($mf.entries)){if($entry -is [string] -and $entry){Assert-Test (Test-InstallerPath (Join-Path $folder.FullName $entry)) "Missing runtime entry $entry";$entryCount++}}
    }
    Assert-Test ($modCount -eq 9) 'Expected exactly nine distributed Mods'
    foreach($file in Get-InstallerFiles (Join-Path $SourceRoot 'resources/app/game/mods/template_and_example')){
        $rel=$file.FullName.Substring((Join-Path $SourceRoot 'resources/app/game/mods').Length).TrimStart('\')
        Assert-Test ((Get-FileHash -LiteralPath $file.FullName).Hash -eq (Get-FileHash -LiteralPath (Join-Path $mods $rel)).Hash) "Template mismatch $rel"
    }
    $inventory=@($actual|ForEach-Object{$f=Join-Path $payload $_;@{path=$_;bytes=(Get-Item -LiteralPath $f).Length;sha256=(Get-FileHash -LiteralPath $f).Hash}})
    $inventory|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $EvidenceRoot 'zip-inventory.json') -Encoding UTF8
    $results+=@{name='actual-zip-content-hashes-entries-templates';status='PASS';files=$actual.Count;mods=$modCount;entries=$entryCount}
    $native=Join-Path $EvidenceRoot 'native';Expand-InstallerArchive (Join-Path $ArchiveRoot 'GameOriginalScripts1.3.0.1.zip') $native
    $old=Join-Path $EvidenceRoot 'old';Expand-InstallerArchive (Join-Path $ArchiveRoot 'Sixty_Four_ModLoader-0.4.0.zip') $old
    $oldRoot=(Get-InstallerDirectories $old|Select-Object -First 1).FullName
    function New-Target([string]$Name,[string]$Catalog,[switch]$OldLoader) {
        $target=Join-Path $EvidenceRoot ('targets/'+$Name)
        Copy-InstallerFile (Join-Path $native 'main.js') (Join-Path $target 'resources/app/main.js')
        Copy-Tree (Join-Path $native 'game') (Join-Path $target 'resources/app/game')
        if($OldLoader){Copy-Tree (Join-Path $oldRoot 'resources/app/game/modloader') (Join-Path $target 'resources/app/game/modloader')}
        $catalogPath=Join-Path $target 'resources/app/game/modloader/translations.json'
        if(Test-InstallerPath $catalogPath){Remove-InstallerFile $catalogPath}
        if($Catalog -eq 'old'){Copy-InstallerFile (Join-Path $oldRoot 'resources/app/game/modloader/translations.json') $catalogPath}
        if($Catalog -eq 'custom'){Write-Test $catalogPath '{"version":1,"languages":{"en":{"modloader":{"close":"USER CUSTOM"}}}}'}
        Write-Test (Join-Path $target 'resources/app/game/mods/enabled.json') '{"mods":[],"userMarker":"preserve"}'
        Write-Test (Join-Path $target 'resources/app/game/mods/user-only/keep.txt') 'user content'
        return $target
    }
    function Catalog-Bytes([string]$Target){$p=Join-Path $Target 'resources/app/game/modloader/translations.json';if(Test-InstallerPath $p){return (Get-FileHash -LiteralPath $p).Hash};return 'MISSING'}
    $installer=Join-Path $payload 'modloader-installer/install.ps1'
    foreach($catalog in @('missing','old','custom')){foreach($mode in @('preserve','replace')){
        $name="zip-upgrade-$catalog-$mode";$target=New-Target $name $catalog -OldLoader;$before=Catalog-Bytes $target
        $arguments=@('-GameRoot',$target,'-SourceRoot',$payload,'-Force');if($mode -eq 'preserve'){$arguments+='-SkipMods'}else{$arguments+='-ReplaceMods'}
        $null=Run-Test $name $installer $arguments
        Assert-Test ((Catalog-Bytes $target) -ceq $before) 'User catalog changed'
        $user=Join-Path $target 'resources/app/game/mods/user-only/keep.txt'
        Assert-Test ((Test-InstallerPath $user) -eq ($mode -eq 'preserve')) 'Mod replacement mismatch'
        $text=Get-Content -LiteralPath (Join-Path $target 'resources/app/game/mods/enabled.json') -Raw
        if($mode -eq 'preserve'){Assert-Test ($text.Contains('userMarker')) 'User enabled list changed'}else{Assert-Test (@(($text|ConvertFrom-Json).mods).Count -eq 0) 'Replacement enabled list not empty'}
    }}
    $fresh=New-Target 'zip-fresh' 'missing';$baseline=Core-Hashes $fresh
    $null=Run-Test 'zip-fresh' $installer @('-GameRoot',$fresh,'-SourceRoot',$payload)
    $backupId=(Get-Content -LiteralPath (Join-Path $fresh 'resources/app/game/modloader/state/install-backups/latest-install.txt') -Raw).Trim()
    $null=Run-Test 'zip-repeat' $installer @('-GameRoot',$fresh,'-SourceRoot',$payload,'-Force')
    $null=Run-Test 'zip-uninstall' (Join-Path $payload 'modloader-installer/uninstall.ps1') @('-GameRoot',$fresh,'-BackupId',$backupId,'-ConfirmUninstall')
    Assert-Test (-not (Compare-Object $baseline (Core-Hashes $fresh))) 'Uninstall did not restore exact native core'
    foreach($mode in @('preserve','replace')){
        $target=New-Target ('zip-updater-'+$mode) 'custom' -OldLoader;$before=Catalog-Bytes $target
        $flag=if($mode -eq 'preserve'){'-PreserveMods'}else{'-ReplaceMods'}
        $null=Run-Test ('zip-updater-'+$mode) (Join-Path $payload 'modloader-installer/update.ps1') @('-GameRoot',$target,'-ZipPath',$CandidateZip,$flag,'-KeepPackage')
        Assert-Test ((Catalog-Bytes $target) -eq $before) 'Updater changed catalog'
    }
    $target=New-Target 'zip-old-bootstrap' 'old' -OldLoader;$before=Catalog-Bytes $target
    $null=Run-Test 'zip-old-bootstrap' (Join-Path $oldRoot 'modloader-installer/update.ps1') @('-GameRoot',$target,'-ZipPath',$CandidateZip,'-PreserveMods','-KeepPackage')
    Assert-Test ((Catalog-Bytes $target) -eq $before) 'Old updater changed catalog'
    # Inject only the verifier subprocess exit; actual candidate payload remains unchanged.
    $target=New-Target 'zip-failed-verifier' 'custom' -OldLoader;$before=Catalog-Bytes $target;$baseline=Core-Hashes $target
    $oldRuntime=(Get-FileHash -LiteralPath (Join-Path $target 'resources/app/game/modloader/loader.js')).Hash
    $modsBefore=@(Get-InstallerFiles (Join-Path $target 'resources/app/game/mods') | ForEach-Object { $_.FullName+'|'+(Get-FileHash -LiteralPath $_.FullName).Hash } | Sort-Object)
    $launcher=Join-Path $EvidenceRoot 'inject-verifier-exit.ps1'
    $quote={param($v) "'"+$v.Replace("'","''")+"'"}
    $text="function global:powershell { if (@(`$args | Where-Object { `$_ -is [string] -and `$_ -like '*modloader*tools*verify.ps1' }).Count) { `$global:LASTEXITCODE=17; return }; & '$env:WINDIR/System32/WindowsPowerShell/v1.0/powershell.exe' @args }; & "
    $text+=(& $quote $installer)+' -GameRoot '+(& $quote $target)+' -SourceRoot '+(& $quote $payload)+' -Force -ReplaceMods'
    Write-Test $launcher $text
    $failure=Run-Test 'zip-verification-failure-rollback' $launcher @() $false
    Assert-Test ($failure -match 'exit 17' -and $failure -match 'backup restoration completed') 'Failure injection did not reach expected verify rollback'
    Assert-Test (-not (Compare-Object $baseline (Core-Hashes $target))) 'Failure did not restore native core'
    Assert-Test ((Get-FileHash -LiteralPath (Join-Path $target 'resources/app/game/modloader/loader.js')).Hash -eq $oldRuntime) 'Old runtime not restored'
    Assert-Test ((Catalog-Bytes $target) -eq $before) 'Rollback changed custom catalog'
    Assert-Test ((Get-Content -LiteralPath (Join-Path $target 'resources/app/game/mods/user-only/keep.txt') -Raw) -eq 'user content') 'Rollback lost user Mod'
    $modsAfter=@(Get-InstallerFiles (Join-Path $target 'resources/app/game/mods') | ForEach-Object { $_.FullName+'|'+(Get-FileHash -LiteralPath $_.FullName).Hash } | Sort-Object)
    Assert-Test (-not (Compare-Object $modsBefore $modsAfter)) 'Rollback changed Mod file inventory or bytes (empty directories are not installed Mods)'
    Assert-Test ((Get-FileHash -LiteralPath $CandidateZip).Hash -eq $zipHash) 'Candidate ZIP changed during verification'
    @{status='PASS';zip=$CandidateZip;sha256=$zipHash;version=$manifest.version;builtAtUtc=$manifest.builtAtUtc;results=$results;gameLaunched=$false;playerAcceptance='PENDING'}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $EvidenceRoot 'result.json') -Encoding UTF8
    Write-Host 'Candidate actual-ZIP verification PASS (no game launch).'
} catch {
    @{status='FAIL';zip=$CandidateZip;sha256=$zipHash;error=$_.Exception.Message;results=$results}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $EvidenceRoot 'result.json') -Encoding UTF8
    throw
}
