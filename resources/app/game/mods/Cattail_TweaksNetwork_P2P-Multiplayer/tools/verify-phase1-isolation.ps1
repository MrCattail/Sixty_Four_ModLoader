[CmdletBinding()]
param(
    [string]$Phase1Root = 'C:\tmp\sixtyfour-p2p-phase1',
    [switch]$RequireLiveAudit
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = [IO.Path]::GetFullPath($Phase1Root)
$failures = [Collections.Generic.List[string]]::new()

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

$baselinePath = Join-Path $resolvedRoot 'real-profile-baseline.json'
if (-not (Test-Path -LiteralPath $baselinePath)) { throw "Baseline not found: $baselinePath" }
$baseline = Get-Content -LiteralPath $baselinePath -Raw -Encoding UTF8 | ConvertFrom-Json
$currentRoaming = Get-ProfileFingerprint ([string]$baseline.realRoamingPath)
$currentLocal = Get-ProfileFingerprint ([string]$baseline.realLocalPath)
if (($baseline.realRoaming | ConvertTo-Json -Depth 8 -Compress) -ne ($currentRoaming | ConvertTo-Json -Depth 8 -Compress)) { $failures.Add('Real Roaming profile changed after the baseline.') }
if (($baseline.realLocal | ConvertTo-Json -Depth 8 -Compress) -ne ($currentLocal | ConvertTo-Json -Depth 8 -Compress)) { $failures.Add('Real Local profile changed after the baseline.') }

$enabledPath = Join-Path $resolvedRoot 'runtime\resources\app\game\mods\enabled.json'
$enabled = Get-Content -LiteralPath $enabledPath -Raw -Encoding UTF8 | ConvertFrom-Json
$mods = @($enabled.mods)
if ($mods.Count -ne 1 -or $mods[0] -ne 'Cattail_TweaksNetwork_P2P-Multiplayer') { $failures.Add('Clone enabled.json does not contain only the P2P mod.') }

if ($RequireLiveAudit) {
    foreach ($role in @('host', 'guest')) {
        $auditPath = Join-Path $resolvedRoot ('logs\' + $role + '-audit.jsonl')
        if (-not (Test-Path -LiteralPath $auditPath)) {
            $failures.Add("Missing $role audit log.")
            continue
        }
        $types = @(Get-Content -LiteralPath $auditPath -Encoding UTF8 | ForEach-Object { ($_ | ConvertFrom-Json).type })
        foreach ($required in @('ipc-guard-installed', 'game-guards-installed', 'safe-mode-installed', 'phase1-initialized')) {
            if ($types -notcontains $required) { $failures.Add("$role audit log is missing $required.") }
        }
    }
}

if ($failures.Count) {
    $failures | ForEach-Object { Write-Error $_ -ErrorAction Continue }
    throw "P2P_PHASE1_ISOLATION_VERIFY=FAIL ($($failures.Count))"
}
Write-Host 'P2P_PHASE1_ISOLATION_VERIFY=PASS'
Write-Host ("P2P_PHASE1_LIVE_AUDIT_REQUIRED={0}" -f [bool]$RequireLiveAudit)

