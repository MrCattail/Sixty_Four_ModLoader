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
if (Test-Path -LiteralPath $resolvedRoot) {
    throw "Refusing to overwrite existing Phase 1 root: $resolvedRoot"
}

$modRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = $modRoot
1..5 | ForEach-Object { $sourceRoot = Split-Path -Parent $sourceRoot }
$sourceRoot = [IO.Path]::GetFullPath($sourceRoot)
$runtimeRoot = Join-Path $resolvedRoot 'runtime'
$profilesRoot = Join-Path $resolvedRoot 'profiles'
$logsRoot = Join-Path $resolvedRoot 'logs'

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

New-Item -ItemType Directory -Path $runtimeRoot, $profilesRoot, $logsRoot -Force | Out-Null
Get-ChildItem -LiteralPath $sourceRoot -Force | Where-Object { $_.Name -ne '.git' } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $runtimeRoot -Recurse -Force
}

$realRoaming = Join-Path $env:APPDATA 'sixtyfour'
$realLocal = Join-Path $env:LOCALAPPDATA 'sixtyfour'
foreach ($role in @('host', 'guest')) {
    $roamingRoot = Join-Path (Join-Path $profilesRoot $role) 'Roaming'
    $localRoot = Join-Path (Join-Path $profilesRoot $role) 'Local'
    New-Item -ItemType Directory -Path $roamingRoot, $localRoot -Force | Out-Null
    if (Test-Path -LiteralPath $realRoaming) { Copy-Item -LiteralPath $realRoaming -Destination $roamingRoot -Recurse -Force }
    if (Test-Path -LiteralPath $realLocal) { Copy-Item -LiteralPath $realLocal -Destination $localRoot -Recurse -Force }
}

$enabledPath = Join-Path $runtimeRoot 'resources\app\game\mods\enabled.json'
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
$baselinePath = Join-Path $resolvedRoot 'real-profile-baseline.json'
[IO.File]::WriteAllText($baselinePath, ($baseline | ConvertTo-Json -Depth 8) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))

$metadata = [ordered]@{
    phase = 1
    preparedAt = (Get-Date).ToUniversalTime().ToString('o')
    sourceRoot = $sourceRoot
    runtimeRoot = $runtimeRoot
    enabledMods = @('Cattail_TweaksNetwork_P2P-Multiplayer')
    note = 'Disposable clone retained until explicit acceptance; no game instance was launched by preparation.'
}
[IO.File]::WriteAllText((Join-Path $resolvedRoot 'metadata.json'), ($metadata | ConvertTo-Json -Depth 6) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))

Write-Host "P2P_PHASE1_PREPARED=$resolvedRoot"
Write-Host 'P2P_PHASE1_LAUNCHED=false'

