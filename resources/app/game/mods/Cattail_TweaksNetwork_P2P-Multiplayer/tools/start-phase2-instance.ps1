[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Host', 'Guest1', 'Guest2', 'Guest3')]
    [string]$Role,
    [string]$Phase2Root = 'C:\tmp\sixtyfour-p2p-phase2',
    [string]$SignalingUrl = 'http://127.0.0.1:8787',
    [string]$AlphaInvite = ''
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = [IO.Path]::GetFullPath($Phase2Root)
$runtimeRoot = Join-Path $resolvedRoot 'runtime'
$exePath = Join-Path $runtimeRoot 'sixtyfour.exe'
if (-not (Test-Path -LiteralPath $exePath)) { throw "Prepared Phase 2 runtime was not found: $exePath" }
try {
    $health = Invoke-RestMethod -Uri ($SignalingUrl.TrimEnd('/') + '/health') -Method Get -TimeoutSec 2
    if (-not $health.ok -or $health.protocolVersion -ne 2) { throw 'Unexpected signaling health response.' }
} catch { throw "Phase 2 signaling is not ready at $SignalingUrl. Start it before launching the game. $($_.Exception.Message)" }

$profileName = $Role.ToLowerInvariant()
$networkRole = if ($Role -eq 'Host') { 'host' } else { 'guest' }
$roamingRoot = Join-Path (Join-Path (Join-Path $resolvedRoot 'profiles') $profileName) 'Roaming'
$localRoot = Join-Path (Join-Path (Join-Path $resolvedRoot 'profiles') $profileName) 'Local'
$userDataRoot = Join-Path $roamingRoot 'sixtyfour'
$auditPath = Join-Path (Join-Path $resolvedRoot 'logs') ($profileName + '-audit.jsonl')
$previous = @{}
foreach ($name in @('APPDATA', 'LOCALAPPDATA', 'CATTAIL_P2P_SAFE_TEST', 'CATTAIL_P2P_ROLE', 'CATTAIL_P2P_TEST_ROOT', 'CATTAIL_P2P_AUDIT_PATH', 'CATTAIL_P2P_SESSION', 'CATTAIL_P2P_SIGNALING_URL', 'CATTAIL_P2P_ALPHA_INVITE')) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
    $env:APPDATA = $roamingRoot
    $env:LOCALAPPDATA = $localRoot
    $env:CATTAIL_P2P_SAFE_TEST = '1'
    $env:CATTAIL_P2P_ROLE = $networkRole
    $env:CATTAIL_P2P_TEST_ROOT = $resolvedRoot
    $env:CATTAIL_P2P_AUDIT_PATH = $auditPath
    $env:CATTAIL_P2P_SESSION = ('phase2-local-' + $profileName)
    $env:CATTAIL_P2P_SIGNALING_URL = $SignalingUrl
    $env:CATTAIL_P2P_ALPHA_INVITE = $AlphaInvite
    $arguments = @(
        '--p2p-safe-test',
        ('--p2p-role=' + $networkRole),
        ('--p2p-session=phase2-local-' + $profileName),
        ('--p2p-signaling-url=' + $SignalingUrl),
        ('--p2p-test-root=' + $resolvedRoot),
        ('--p2p-audit-path=' + $auditPath),
        ('--p2p-appdata=' + $roamingRoot),
        ('--user-data-dir=' + $userDataRoot)
    )
    $process = Start-Process -FilePath $exePath -ArgumentList $arguments -WorkingDirectory $runtimeRoot -PassThru
    Write-Host ("P2P_PHASE2_{0}_PID={1}" -f $Role.ToUpperInvariant(), $process.Id)
    Write-Host "P2P_PHASE2_ROLE=$networkRole"
    Write-Host "P2P_PHASE2_PROFILE=$profileName"
    Write-Host "P2P_PHASE2_AUDIT=$auditPath"
} finally {
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
