[CmdletBinding()]
param(
    [string]$Phase1Root = 'C:\tmp\sixtyfour-p2p-phase1'
)

$ErrorActionPreference = 'Stop'
$expectedParent = [IO.Path]::GetFullPath('C:\tmp')
$resolvedRoot = [IO.Path]::GetFullPath($Phase1Root)
if ($resolvedRoot -eq $expectedParent -or -not $resolvedRoot.StartsWith($expectedParent + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Phase1Root must be a child of C:\tmp. Received: $resolvedRoot"
}
if (-not (Test-Path -LiteralPath $resolvedRoot)) { throw "Partial Phase 1 root was not found: $resolvedRoot" }

$modRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = $modRoot
1..5 | ForEach-Object { $sourceRoot = Split-Path -Parent $sourceRoot }
$sourceRoot = [IO.Path]::GetFullPath($sourceRoot)
$sourceExe = Join-Path $sourceRoot 'sixtyfour.exe'
$sourceProcesses = @(Get-Process -Name 'sixtyfour' -ErrorAction SilentlyContinue | Where-Object {
    try { [IO.Path]::GetFullPath($_.Path) -eq $sourceExe } catch { $false }
})
if ($sourceProcesses.Count) {
    throw "Close the original Sixty Four window before finalizing. Active source PIDs: $($sourceProcesses.Id -join ', ')"
}

function Get-ProfileFingerprint([string]$ProfilePath) {
    if (-not (Test-Path -LiteralPath $ProfilePath)) { return @() }
    return @(Get-ChildItem -LiteralPath $ProfilePath -File -Recurse | Sort-Object FullName | ForEach-Object {
        [ordered]@{
            path = $_.FullName.Substring($ProfilePath.Length).TrimStart('\')
            length = $_.Length
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        }
    })
}

$profilesRoot = Join-Path $resolvedRoot 'profiles'
$backupRoot = Join-Path $resolvedRoot 'profiles-initial-open-copy'
if (Test-Path -LiteralPath $backupRoot) { throw "Refusing to overwrite previous profile backup: $backupRoot" }
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
foreach ($role in @('host', 'guest')) {
    $roleRoot = Join-Path $profilesRoot $role
    $backupRoleRoot = Join-Path $backupRoot $role
    New-Item -ItemType Directory -Path $backupRoleRoot -Force | Out-Null
    foreach ($scope in @('Roaming', 'Local')) {
        $existing = Join-Path $roleRoot $scope
        if (Test-Path -LiteralPath $existing) { Move-Item -LiteralPath $existing -Destination $backupRoleRoot }
        New-Item -ItemType Directory -Path $existing -Force | Out-Null
    }
}

$realRoaming = Join-Path $env:APPDATA 'sixtyfour'
$realLocal = Join-Path $env:LOCALAPPDATA 'sixtyfour'
foreach ($role in @('host', 'guest')) {
    $roamingRoot = Join-Path (Join-Path $profilesRoot $role) 'Roaming'
    $localRoot = Join-Path (Join-Path $profilesRoot $role) 'Local'
    if (Test-Path -LiteralPath $realRoaming) { Copy-Item -LiteralPath $realRoaming -Destination $roamingRoot -Recurse -Force }
    if (Test-Path -LiteralPath $realLocal) { Copy-Item -LiteralPath $realLocal -Destination $localRoot -Recurse -Force }
}

$enabledPath = Join-Path $resolvedRoot 'runtime\resources\app\game\mods\enabled.json'
$enabled = [ordered]@{ mods = @('Cattail_TweaksNetwork_P2P-Multiplayer') } | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText($enabledPath, $enabled + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))

$baseline = [ordered]@{
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    sourceRoot = $sourceRoot
    realRoamingPath = $realRoaming
    realLocalPath = $realLocal
    realRoaming = Get-ProfileFingerprint $realRoaming
    realLocal = Get-ProfileFingerprint $realLocal
}
[IO.File]::WriteAllText((Join-Path $resolvedRoot 'real-profile-baseline.json'), ($baseline | ConvertTo-Json -Depth 8) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))

$metadata = [ordered]@{
    phase = 1
    finalizedAt = (Get-Date).ToUniversalTime().ToString('o')
    sourceRoot = $sourceRoot
    runtimeRoot = (Join-Path $resolvedRoot 'runtime')
    enabledMods = @('Cattail_TweaksNetwork_P2P-Multiplayer')
    originalGameClosedDuringFinalization = $true
    previousOpenProfileCopy = $backupRoot
    note = 'Ready for manual Host/Guest acceptance. No game instance was launched by finalization.'
}
[IO.File]::WriteAllText((Join-Path $resolvedRoot 'metadata.json'), ($metadata | ConvertTo-Json -Depth 6) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))

Write-Host "P2P_PHASE1_FINALIZED=$resolvedRoot"
Write-Host 'P2P_PHASE1_LAUNCHED=false'

