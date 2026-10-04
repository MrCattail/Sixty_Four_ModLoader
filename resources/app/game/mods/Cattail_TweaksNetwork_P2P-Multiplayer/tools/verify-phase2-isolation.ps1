[CmdletBinding()]
param(
    [string]$Phase2Root = 'C:\tmp\sixtyfour-p2p-phase2',
    [switch]$RequireLiveAudit
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = [IO.Path]::GetFullPath($Phase2Root)
$failures = [Collections.Generic.List[string]]::new()

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

function ConvertTo-ComparableFingerprint($Value) {
    $items = @($Value) | Where-Object { $null -ne $_ -and $_.PSObject.Properties.Name -contains 'path' } | Sort-Object path
    return ConvertTo-Json -InputObject @($items) -Depth 8 -Compress
}

$baselinePath = Join-Path $resolvedRoot 'real-profile-baseline.json'
if (-not (Test-Path -LiteralPath $baselinePath)) { throw "Baseline not found: $baselinePath" }
$baseline = Get-Content -LiteralPath $baselinePath -Raw -Encoding UTF8 | ConvertFrom-Json
$currentRoaming = @(Get-ProfileFingerprint ([string]$baseline.realRoamingPath))
$currentLocal = @(Get-ProfileFingerprint ([string]$baseline.realLocalPath))
if ((ConvertTo-ComparableFingerprint $baseline.realRoaming) -ne (ConvertTo-ComparableFingerprint $currentRoaming)) { $failures.Add('Real Roaming profile changed after the Phase 2 baseline.') }
if ((ConvertTo-ComparableFingerprint $baseline.realLocal) -ne (ConvertTo-ComparableFingerprint $currentLocal)) { $failures.Add('Real Local profile changed after the Phase 2 baseline.') }

$enabledPath = Join-Path $resolvedRoot 'runtime\resources\app\game\mods\enabled.json'
if (-not (Test-Path -LiteralPath $enabledPath)) {
    $failures.Add('Clone enabled.json is missing.')
} else {
    $enabled = Get-Content -LiteralPath $enabledPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $mods = @($enabled.mods)
    if ($mods.Count -ne 1 -or $mods[0] -ne 'Cattail_TweaksNetwork_P2P-Multiplayer') { $failures.Add('Clone enabled.json does not contain only the P2P mod.') }
}

$runtimeMod = Join-Path $resolvedRoot 'runtime\resources\app\game\mods\Cattail_TweaksNetwork_P2P-Multiplayer'
$sourceMod = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
foreach ($relative in @('mod.json', 'scripts\protocol.js', 'scripts\safe-mode.js', 'scripts\signaling.js', 'scripts\transport.js', 'scripts\ui.js', 'scripts\main.js')) {
    $sourcePath = Join-Path $sourceMod $relative
    $runtimePath = Join-Path $runtimeMod $relative
    if (-not (Test-Path -LiteralPath $runtimePath)) { $failures.Add("Clone core file missing: $relative"); continue }
    if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $runtimePath -Algorithm SHA256).Hash) { $failures.Add("Clone core hash mismatch: $relative") }
}

if ($RequireLiveAudit) {
    $runtimeExe = [IO.Path]::GetFullPath((Join-Path $resolvedRoot 'runtime\sixtyfour.exe'))
    $remaining = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath) -eq $runtimeExe })
    if ($remaining.Count) { $failures.Add("Phase 2 game processes are still running: $($remaining.ProcessId -join ', ')") }
    foreach ($profileName in @('host', 'guest1', 'guest2', 'guest3')) {
        $auditPath = Join-Path $resolvedRoot ('logs\' + $profileName + '-audit.jsonl')
        if (-not (Test-Path -LiteralPath $auditPath)) { $failures.Add("Missing $profileName audit log."); continue }
        $entries = @(Get-Content -LiteralPath $auditPath -Encoding UTF8 | ForEach-Object { $_ | ConvertFrom-Json })
        $types = @($entries.type)
        foreach ($required in @('ipc-guard-installed', 'game-guards-installed', 'safe-mode-installed', 'phase2-initialized')) {
            if ($types -notcontains $required) { $failures.Add("$profileName audit log is missing $required.") }
        }
        $raw = Get-Content -LiteralPath $auditPath -Raw -Encoding UTF8
        if ($raw -match '"(?:participantToken|resumeToken|credential|sdp|roomCode)"\s*:') { $failures.Add("$profileName audit log contains a forbidden private network field.") }
    }
}

if ($failures.Count) {
    $failures | ForEach-Object { Write-Error $_ -ErrorAction Continue }
    throw "P2P_PHASE2_ISOLATION_VERIFY=FAIL ($($failures.Count))"
}
Write-Host 'P2P_PHASE2_ISOLATION_VERIFY=PASS'
Write-Host ("P2P_PHASE2_LIVE_AUDIT_REQUIRED={0}" -f [bool]$RequireLiveAudit)
