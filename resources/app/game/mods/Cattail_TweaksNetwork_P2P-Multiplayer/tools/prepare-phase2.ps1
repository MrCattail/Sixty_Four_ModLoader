[CmdletBinding()]
param(
    [string]$Phase2Root = 'C:\tmp\sixtyfour-p2p-phase2',
    [string]$Phase1Root = 'C:\tmp\sixtyfour-p2p-phase1'
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = [IO.Path]::GetFullPath($Phase2Root)
$resolvedPhase1 = [IO.Path]::GetFullPath($Phase1Root)
$runtimeRoot = Join-Path $resolvedRoot 'runtime'
$profilesRoot = Join-Path $resolvedRoot 'profiles'
$sourceMod = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$phase1Runtime = Join-Path $resolvedPhase1 'runtime'
$phase1Profile = Join-Path $resolvedPhase1 'profiles\host'

if (-not $resolvedRoot.StartsWith('C:\tmp\sixtyfour-p2p-phase2', [StringComparison]::OrdinalIgnoreCase)) {
    throw "Phase 2 root must remain under C:\tmp\sixtyfour-p2p-phase2: $resolvedRoot"
}
if (Test-Path -LiteralPath $runtimeRoot) { throw "Refusing to overwrite an existing Phase 2 runtime: $runtimeRoot" }
if (Test-Path -LiteralPath $profilesRoot) { throw "Refusing to overwrite existing Phase 2 profiles: $profilesRoot" }
if (-not (Test-Path -LiteralPath (Join-Path $phase1Runtime 'sixtyfour.exe'))) { throw "Phase 1 isolated runtime was not found: $phase1Runtime" }
if (-not (Test-Path -LiteralPath $phase1Profile) ) { throw "Phase 1 restored profile was not found: $phase1Profile" }

New-Item -ItemType Directory -Path $resolvedRoot -Force | Out-Null
Copy-Item -LiteralPath $phase1Runtime -Destination $runtimeRoot -Recurse

$runtimeMod = Join-Path $runtimeRoot 'resources\app\game\mods\Cattail_TweaksNetwork_P2P-Multiplayer'
Get-ChildItem -LiteralPath $sourceMod -Recurse -File | Where-Object {
    $_.FullName -notlike '*\services\signaling\node_modules\*' -and
    $_.FullName -notlike '*\services\signaling\.wrangler\*'
} | ForEach-Object {
    $relative = $_.FullName.Substring($sourceMod.Length).TrimStart('\')
    $destination = Join-Path $runtimeMod $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
}

New-Item -ItemType Directory -Path $profilesRoot -Force | Out-Null
foreach ($profileName in @('host', 'guest1', 'guest2', 'guest3')) {
    Copy-Item -LiteralPath $phase1Profile -Destination (Join-Path $profilesRoot $profileName) -Recurse
}
New-Item -ItemType Directory -Path (Join-Path $resolvedRoot 'logs') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $resolvedRoot 'wrangler-state') -Force | Out-Null

$phase1BaselinePath = Join-Path $resolvedPhase1 'real-profile-baseline.json'
if (-not (Test-Path -LiteralPath $phase1BaselinePath)) { throw "Phase 1 real-profile baseline is missing: $phase1BaselinePath" }
$phase1Baseline = Get-Content -LiteralPath $phase1BaselinePath -Raw -Encoding UTF8 | ConvertFrom-Json

function Get-ProfileFingerprint([string]$ProfilePath) {
    if (-not (Test-Path -LiteralPath $ProfilePath)) { return }
    Get-ChildItem -LiteralPath $ProfilePath -File -Recurse | Sort-Object FullName | ForEach-Object {
        [pscustomobject][ordered]@{
            path = $_.FullName.Substring($ProfilePath.Length).TrimStart('\')
            length = $_.Length
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        }
    }
}

$baseline = [pscustomobject][ordered]@{
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    realRoamingPath = [string]$phase1Baseline.realRoamingPath
    realLocalPath = [string]$phase1Baseline.realLocalPath
    realRoaming = @(Get-ProfileFingerprint ([string]$phase1Baseline.realRoamingPath))
    realLocal = @(Get-ProfileFingerprint ([string]$phase1Baseline.realLocalPath))
}
$baseline | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $resolvedRoot 'real-profile-baseline.json') -Encoding UTF8

$coreFiles = @('mod.json', 'scripts\protocol.js', 'scripts\safe-mode.js', 'scripts\signaling.js', 'scripts\transport.js', 'scripts\ui.js', 'scripts\main.js')
foreach ($relative in $coreFiles) {
    $sourceHash = (Get-FileHash -LiteralPath (Join-Path $sourceMod $relative) -Algorithm SHA256).Hash
    $runtimeHash = (Get-FileHash -LiteralPath (Join-Path $runtimeMod $relative) -Algorithm SHA256).Hash
    if ($sourceHash -ne $runtimeHash) { throw "Runtime mod copy hash mismatch: $relative" }
}

$manifest = Get-Content -LiteralPath (Join-Path $runtimeMod 'mod.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.version -ne '0.2.1') { throw "Prepared runtime has unexpected P2P version: $($manifest.version)" }

[pscustomobject][ordered]@{
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    phase2Root = $resolvedRoot
    phase1Source = $resolvedPhase1
    runtime = $runtimeRoot
    sourceMod = $sourceMod
    profiles = @('host', 'guest1', 'guest2', 'guest3')
    modVersion = [string]$manifest.version
    protocolVersion = 2
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $resolvedRoot 'metadata.json') -Encoding UTF8

Write-Host 'P2P_PHASE2_PREPARE=PASS'
Write-Host "P2P_PHASE2_ROOT=$resolvedRoot"
Write-Host 'P2P_PHASE2_PROFILES=host,guest1,guest2,guest3'
