param([string]$SourceRoot = (Join-Path $PSScriptRoot '../..'))
$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('verification-split-'+[guid]::NewGuid().ToString('N'))
$game=Join-Path $root 'resources/app/game'; $tools=Join-Path $game 'modloader/tools'
New-Item -ItemType Directory -Force -Path $tools | Out-Null
function Write-Fixture([string]$Path,[string]$Text) { New-Item -ItemType Directory -Force -Path (Split-Path $Path) | Out-Null; [IO.File]::WriteAllText($Path,$Text,[Text.UTF8Encoding]::new($true)) }
function Run-Expected([string]$File,[string[]]$Arguments,[bool]$Success,[string]$Pattern,[int]$SuiteCount=0) {
    $saved=$env:PSModulePath; Remove-Item Env:PSModulePath -ErrorAction SilentlyContinue
    $savedError=$ErrorActionPreference; $ErrorActionPreference='Continue'
    try { $output=& powershell -NoProfile -ExecutionPolicy Bypass -File $File @Arguments 2>&1; $code=$LASTEXITCODE } finally { $env:PSModulePath=$saved; $ErrorActionPreference=$savedError }
    if (($code -eq 0) -ne $Success -or "$output" -notmatch $Pattern) { throw "Unexpected verification result $code : $output" }
    if ($SuiteCount -and ([regex]::Matches(($output | Out-String), 'DISPATCH_SUITE_OK').Count -ne $SuiteCount)) { throw 'Incorrect developer suite dispatch count' }
}
try {
    foreach($f in @('verify.ps1','verify-development.ps1','common.ps1')) { Copy-Item -LiteralPath (Join-Path $SourceRoot ('resources/app/game/modloader/tools/'+$f)) -Destination (Join-Path $tools $f) }
    $source=Get-Content -LiteralPath (Join-Path $tools 'verify.ps1') -Raw
    foreach($match in [regex]::Matches($source,"file = '([^']+)'; pattern = '([^']*)'")) {
        $path=Join-Path $game $match.Groups[1].Value
        if (-not (Test-Path -LiteralPath $path)) { Write-Fixture $path '' }
        [IO.File]::AppendAllText($path,"// "+$match.Groups[2].Value+"`n")
    }
    foreach($f in @('library-store.js','snapshot-store.js','snapshot-container.js')) { Write-Fixture (Join-Path $game ('modloader/'+$f)) '// fixture' }
    [IO.File]::AppendAllText((Join-Path $game 'scripts/game.js'),"// changeLanguage(id){ ModLoader?.applyWords if (!words[this.language]) this.words_en = words.en`n")
    [IO.File]::AppendAllText((Join-Path $game 'modloader/loader.js'),"// version: '0.5.0'`n// const SNAPSHOT_API_VERSION = '1.0.0'`n// const LIBRARY_API_VERSION = '1.1.0'`n")
    Write-Fixture (Join-Path $game 'mods/enabled.json') '{"mods":[]}'
    Run-Expected (Join-Path $tools 'verify.ps1') @('-LoaderOnly','-ExpectedVersion','0.5.0') $true 'Installation checks passed'
    Run-Expected (Join-Path $tools 'verify.ps1') @('-ExpectedVersion','99.0') $false 'Verification failed'
    Write-Fixture (Join-Path $game 'mods/enabled.json') '{"mods":"wrong"}'
    Run-Expected (Join-Path $tools 'verify.ps1') @() $false 'Verification failed'
    Write-Fixture (Join-Path $game 'mods/enabled.json') '{"mods":[]}'
    [IO.File]::AppendAllText((Join-Path $game 'modloader/loader.js'),"`nconst = ;")
    Run-Expected (Join-Path $tools 'verify.ps1') @() $false 'Verification failed'
    $savedPath=$env:PATH
    try {
        $env:PATH="$env:WINDIR/System32;$env:WINDIR/System32/WindowsPowerShell/v1.0"
        Run-Expected (Join-Path $tools 'verify.ps1') @() $true 'Node.js is not available; skipped'
        Run-Expected (Join-Path $tools 'verify-development.ps1') @('-CheckInputsOnly') $false 'Node.js is required'
    } finally { $env:PATH=$savedPath }
    Run-Expected (Join-Path $tools 'verify-development.ps1') @('-CheckInputsOnly') $false 'incomplete'
    $dev=Get-Content -LiteralPath (Join-Path $tools 'verify-development.ps1') -Raw
    foreach($name in @('requiredTools','requiredMods')) {
        $assignment=[regex]::Match($dev,('\$'+$name+' = @\(([^\r\n]+)\)')).Groups[1].Value
        foreach($match in [regex]::Matches($assignment,"'([^']+)'")) {
            $path=Join-Path $(if($name -eq 'requiredTools'){$tools}else{$game}) $match.Groups[1].Value
            Write-Fixture $path $(if($path.EndsWith('.js')){"console.log('DISPATCH_SUITE_OK')"}else{'{}'})
        }
    }
    foreach($folder in @('Cattail_Tweaks_简体中文优化','Cattail_TweaksQuality_Better-UIs','Cattail_TweaksQuality_World-Editor')) { Write-Fixture (Join-Path $game "mods/$folder/mod.json") '{}' }
    Run-Expected (Join-Path $tools 'verify-development.ps1') @('-CheckInputsOnly') $true 'inputs present'
    Run-Expected (Join-Path $tools 'verify-development.ps1') @() $true '25 suites' 25
    Write-Fixture (Join-Path $tools 'panel-escape-contract.test.js') 'process.exit(17)'
    Run-Expected (Join-Path $tools 'verify-development.ps1') @() $false 'Development verification failed'
    Write-Host 'PASS: install without suites, legacy flag, version/JSON/syntax rejection, missing dev inputs, 25-suite dispatch and nonzero propagation. Dispatch fixtures are not feature acceptance.'
} finally {
    if (-not ([IO.Path]::GetFullPath($root).StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase))) { throw 'Invalid fixture cleanup root' }
    Remove-Item -LiteralPath $root -Recurse -Force
}
