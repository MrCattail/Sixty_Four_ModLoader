[CmdletBinding()]
param(
    [string]$Phase1Root = 'C:\tmp\sixtyfour-p2p-phase1',
    [string]$RecoveryRoot = 'C:\tmp\sixtyfour-p2p-phase1\recovery\failed-launch-20260804-073732'
)

$ErrorActionPreference = 'Stop'
$expectedParent = [IO.Path]::GetFullPath('C:\tmp')
$resolvedRoot = [IO.Path]::GetFullPath($Phase1Root)
if ($resolvedRoot -eq $expectedParent -or -not $resolvedRoot.StartsWith($expectedParent + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Phase1Root must be a child of C:\tmp. Received: $resolvedRoot"
}
if (-not (Test-Path -LiteralPath $resolvedRoot)) { throw "Phase 1 root not found: $resolvedRoot" }
if (Get-Process -Name 'sixtyfour' -ErrorAction SilentlyContinue) { throw 'Close every Sixty Four instance before refreshing Phase 1 profiles.' }

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
$profileBackup = Join-Path $resolvedRoot 'profiles-before-recovery-refresh'
if (Test-Path -LiteralPath $profileBackup) { throw "Refusing to overwrite profile backup: $profileBackup" }
if (Test-Path -LiteralPath $profilesRoot) {
    Move-Item -LiteralPath $profilesRoot -Destination $profileBackup
}
New-Item -ItemType Directory -Path $profilesRoot -Force | Out-Null

$realRoaming = Join-Path $env:APPDATA 'sixtyfour'
$realLocal = Join-Path $env:LOCALAPPDATA 'sixtyfour'
foreach ($role in @('host', 'guest')) {
    $roamingRoot = Join-Path (Join-Path $profilesRoot $role) 'Roaming'
    $localRoot = Join-Path (Join-Path $profilesRoot $role) 'Local'
    New-Item -ItemType Directory -Path $roamingRoot, $localRoot -Force | Out-Null
    if (Test-Path -LiteralPath $realRoaming) { Copy-Item -LiteralPath $realRoaming -Destination $roamingRoot -Recurse -Force }
    if (Test-Path -LiteralPath $realLocal) { Copy-Item -LiteralPath $realLocal -Destination $localRoot -Recurse -Force }
}

$baselinePath = Join-Path $resolvedRoot 'real-profile-baseline.json'
if (Test-Path -LiteralPath $baselinePath) {
    $baselineBackup = Join-Path $RecoveryRoot 'real-profile-baseline-before-recovery.json'
    if (Test-Path -LiteralPath $baselineBackup) { throw "Refusing to overwrite baseline backup: $baselineBackup" }
    Copy-Item -LiteralPath $baselinePath -Destination $baselineBackup
}

$baseline = [ordered]@{
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    reason = 'Refreshed after successful failed-launch save recovery.'
    realRoamingPath = $realRoaming
    realLocalPath = $realLocal
    realRoaming = Get-ProfileFingerprint $realRoaming
    realLocal = Get-ProfileFingerprint $realLocal
}
[IO.File]::WriteAllText($baselinePath, ($baseline | ConvertTo-Json -Depth 8) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))

$enabledPath = Join-Path $resolvedRoot 'runtime\resources\app\game\mods\enabled.json'
$enabled = Get-Content -LiteralPath $enabledPath -Raw -Encoding UTF8 | ConvertFrom-Json
$mods = @($enabled.mods)
if ($mods.Count -ne 1 -or $mods[0] -ne 'Cattail_TweaksNetwork_P2P-Multiplayer') {
    throw 'Clone enabled.json must contain only Cattail_TweaksNetwork_P2P-Multiplayer.'
}

$metadata = [ordered]@{
    refreshedAt = (Get-Date).ToUniversalTime().ToString('o')
    recoveryRoot = [IO.Path]::GetFullPath($RecoveryRoot)
    previousProfiles = $profileBackup
    hostProfile = (Join-Path $profilesRoot 'host')
    guestProfile = (Join-Path $profilesRoot 'guest')
    gameLaunched = $false
}
[IO.File]::WriteAllText((Join-Path $resolvedRoot 'recovery-refresh-metadata.json'), ($metadata | ConvertTo-Json -Depth 5) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))

Write-Host "P2P_PHASE1_RECOVERY_REFRESH=$resolvedRoot"
Write-Host "P2P_PHASE1_PREVIOUS_PROFILES=$profileBackup"
Write-Host 'P2P_PHASE1_LAUNCHED=false'
