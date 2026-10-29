$ErrorActionPreference = 'Stop'
$installerRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $installerRoot 'filesystem.ps1')
$root = Join-Path ([IO.Path]::GetTempPath()) ('loader-longpath-' + [Guid]::NewGuid().ToString('N'))
New-InstallerDirectory $root
$source = Join-Path $root 'source'
$target = Join-Path $root ('SteamLibrary\steamapps\common\Sixty Four\win-unpacked')
$mod = 'resources\app\game\mods\Cattail_TweaksNetwork_P2P-Multiplayer\services\signaling\node_modules\'
$paths = @(
    ($mod + '@cloudflare\kv-asset-handler\package.json'),
    ($mod + 'literal [brackets]\' + ('deep-' * 12) + '\package.json')
)
function Write-Fixture([string]$Path, [string]$Text) {
    New-InstallerDirectory ([IO.Path]::GetDirectoryName($Path))
    [IO.File]::WriteAllText((ConvertTo-InstallerNativePath $Path), $Text)
}
function Assert-Text([string]$Path, [string]$Expected) {
    if ([IO.File]::ReadAllText((ConvertTo-InstallerNativePath $Path)) -cne $Expected) { throw "Content mismatch: $Path" }
}
function Run-Install([bool]$Fail, [bool]$Replace) {
    $env:LOADER_LONGPATH_TEST_FAIL = if ($Fail) { '1' } else { '0' }
    $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $installerRoot 'install.ps1'),'-GameRoot',$target,'-SourceRoot',$source,'-Force')
    if ($Replace) { $arguments += '-ReplaceMods' }
    $ErrorActionPreference = 'Continue'
    $output = & powershell @arguments 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if (($Fail -and $code -eq 0) -or (-not $Fail -and $code -ne 0)) { throw "Unexpected install result $code : $output" }
    if ($Fail -and "$output" -notmatch 'Restoring backed-up core files') { throw "Did not reach rollback: $output" }
}
try {
    Write-Fixture (Join-Path $source 'modloader-installer\patch-source.ps1') 'param([string]$GameRoot,[switch]$CheckOnly); if (-not $CheckOnly) { [IO.File]::WriteAllText((Join-Path $GameRoot "resources\app\main.js"), "patched") }'
    Write-Fixture (Join-Path $source 'resources\app\game\modloader\loader.js') '// fixture'
    Write-Fixture (Join-Path $source 'resources\app\game\modloader\tools\verify.ps1') 'param([switch]$LoaderOnly); if ($env:LOADER_LONGPATH_TEST_FAIL -eq "1") { exit 1 }; exit 0'
    Write-Fixture (Join-Path $source 'resources\app\game\mods\enabled.json') '{"mods":[]}'
    Write-Fixture (Join-Path $target 'resources\app\main.js') 'original hook'
    Write-Fixture (Join-Path $target 'resources\app\game\mods\enabled.json') '{"mods":[]}'
    foreach ($relative in $paths) {
        Write-Fixture (Join-Path $source $relative) 'new dependency'
        Write-Fixture (Join-Path $target $relative) 'old dependency'
    }
    $cacheRelative = $mod + '.vite\vitest\da39a3ee5e6b4b0d3255bfef95601890afd80709\results.json'
    Write-Fixture (Join-Path $source $cacheRelative) 'do not distribute'
    Write-Fixture (Join-Path $target $cacheRelative) 'existing cache untouched'
    # On Windows PowerShell 5.1 this reproduces the original provider failure.
    $probe = Join-Path $root ('original-provider\' + ('x' * 100) + '\' + ('y' * 100) + '\results.json')
    $providerFailed = $false
    try {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $probe) | Out-Null
        Copy-Item -LiteralPath (Join-Path $target 'resources\app\main.js') -Destination $probe -Force
    } catch { $providerFailed = $true }
    Write-Host "Original provider failure reproduced on this host: $providerFailed"
    Run-Install $false $false
    $backupRoot = Join-Path $target 'resources\app\game\modloader\state\install-backups'
    $id = (Get-Content -LiteralPath (Join-Path $backupRoot 'latest-install.txt') -Raw).Trim()
    $backup = Join-Path $backupRoot $id
    Assert-Text (Join-Path $target $cacheRelative) 'existing cache untouched'
    if (Test-InstallerPath (Join-Path $backup $cacheRelative)) { throw 'Development cache was selected for overwrite backup.' }
    $manifest = Get-Content -LiteralPath (Join-Path $backup 'install-backup.json') -Raw | ConvertFrom-Json
    foreach ($relative in $paths) {
        Assert-Text (Join-Path $target $relative) 'new dependency'
        $backupFile = Join-Path $backup $relative
        if ($backupFile.Length -le 260) { throw 'Fixture did not exercise a long backup path.' }
        Assert-Text $backupFile 'old dependency'
        $entry = @($manifest.rollbackFiles | Where-Object { $_.relativePath -eq $relative })
        $metadata = Get-InstallerFileMetadata $backupFile
        if ($entry.Count -ne 1 -or $entry[0].sha256 -ne $metadata.Hash -or $entry[0].length -ne $metadata.Length) { throw 'Backup metadata mismatch.' }
    }
    Write-Host '[PASS] Installation, long source scan, backup and SHA256 verified.'
    foreach ($relative in $paths) { Write-Fixture (Join-Path $source $relative) 'failed update' }
    Write-Fixture (Join-Path $target 'resources\app\main.js') 'before failure'
    $newRelative = $mod + 'new-only\' + ('n' * 90) + '\package.json'
    Write-Fixture (Join-Path $source $newRelative) 'new only'
    Run-Install $true $false
    foreach ($relative in $paths) { Assert-Text (Join-Path $target $relative) 'new dependency' }
    Assert-Text (Join-Path $target 'resources\app\main.js') 'before failure'
    if (Test-InstallerPath (Join-Path $target $newRelative)) { throw 'Rollback left a newly installed long file.' }
    Write-Host '[PASS] Failed verification restores old bytes and removes newly installed long files.'
    $extra = $mod + 'target-only\' + ('z' * 90) + '\package.json'
    Write-Fixture (Join-Path $target $extra) 'target only'
    [IO.File]::SetAttributes((ConvertTo-InstallerNativePath (Join-Path $target $extra)), [IO.FileAttributes]::ReadOnly)
    Run-Install $true $true
    foreach ($relative in $paths) { Assert-Text (Join-Path $target $relative) 'new dependency' }
    Assert-Text (Join-Path $target $extra) 'target only'
    Assert-Text (Join-Path $target $cacheRelative) 'existing cache untouched'
    Write-Host '[PASS] ReplaceMods full backup, recursive removal and rollback preserve target-only long files.'
    # Exercise uninstall against a synthetic old-format manifest containing long entries.
    $uninstallBackup = Join-Path $backupRoot 'synthetic-uninstall'
    New-InstallerDirectory $uninstallBackup
    $entries = @()
    foreach ($relative in $paths) {
        Copy-InstallerFile (Join-Path $target $relative) (Join-Path $uninstallBackup $relative)
        Write-Fixture (Join-Path $target $relative) 'changed after backup'
        $entries += @{ relativePath=$relative; exists=$true }
    }
    Write-Fixture (Join-Path $target $newRelative) 'remove on uninstall'
    $entries += @{ relativePath=$newRelative; exists=$false }
    @{ files=$entries } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $uninstallBackup 'install-backup.json') -Encoding UTF8
    $output = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $installerRoot 'uninstall.ps1') -GameRoot $target -BackupId synthetic-uninstall -ConfirmUninstall 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Uninstall failed: $output" }
    foreach ($relative in $paths) { Assert-Text (Join-Path $target $relative) 'new dependency' }
    if (Test-InstallerPath (Join-Path $target $newRelative)) { throw 'Uninstall left a new long file.' }
    $readOnlyCopy = Join-Path $target $extra
    Copy-InstallerFile (Join-Path $target $paths[0]) $readOnlyCopy
    Assert-Text $readOnlyCopy 'new dependency'
    if ((ConvertTo-InstallerNativePath '\\server\share\file') -ne '\\?\UNC\server\share\file') { throw 'UNC conversion failed.' }
    Write-Host '[PASS] Old manifest uninstall restore/removal and UNC path conversion.'
    Write-Host "Evidence directory: $root"
} finally {
    Remove-Item Env:LOADER_LONGPATH_TEST_FAIL -ErrorAction SilentlyContinue
}
