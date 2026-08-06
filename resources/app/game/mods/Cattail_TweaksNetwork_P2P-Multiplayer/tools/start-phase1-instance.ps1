[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Host', 'Guest')]
    [string]$Role,
    [string]$Phase1Root = 'C:\tmp\sixtyfour-p2p-phase1'
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = [IO.Path]::GetFullPath($Phase1Root)
$runtimeRoot = Join-Path $resolvedRoot 'runtime'
$exePath = Join-Path $runtimeRoot 'sixtyfour.exe'
if (-not (Test-Path -LiteralPath $exePath)) { throw "Prepared runtime was not found: $exePath" }

$roleName = $Role.ToLowerInvariant()
$roamingRoot = Join-Path (Join-Path (Join-Path $resolvedRoot 'profiles') $roleName) 'Roaming'
$localRoot = Join-Path (Join-Path (Join-Path $resolvedRoot 'profiles') $roleName) 'Local'
$userDataRoot = Join-Path $roamingRoot 'sixtyfour'
$auditPath = Join-Path (Join-Path $resolvedRoot 'logs') ($roleName + '-audit.jsonl')
$previous = @{}
foreach ($name in @('APPDATA', 'LOCALAPPDATA', 'CATTAIL_P2P_SAFE_TEST', 'CATTAIL_P2P_ROLE', 'CATTAIL_P2P_TEST_ROOT', 'CATTAIL_P2P_AUDIT_PATH', 'CATTAIL_P2P_SESSION')) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
    $env:APPDATA = $roamingRoot
    $env:LOCALAPPDATA = $localRoot
    $env:CATTAIL_P2P_SAFE_TEST = '1'
    $env:CATTAIL_P2P_ROLE = $roleName
    $env:CATTAIL_P2P_TEST_ROOT = $resolvedRoot
    $env:CATTAIL_P2P_AUDIT_PATH = $auditPath
    $env:CATTAIL_P2P_SESSION = 'phase1-local'
    $arguments = @(
        '--p2p-safe-test',
        ('--p2p-role=' + $roleName),
        '--p2p-session=phase1-local',
        ('--p2p-test-root=' + $resolvedRoot),
        ('--p2p-audit-path=' + $auditPath),
        ('--p2p-appdata=' + $roamingRoot),
        ('--user-data-dir=' + $userDataRoot)
    )
    $process = Start-Process -FilePath $exePath -ArgumentList $arguments -WorkingDirectory $runtimeRoot -PassThru
    Write-Host ("P2P_PHASE1_{0}_PID={1}" -f $Role.ToUpperInvariant(), $process.Id)
    Write-Host "P2P_PHASE1_AUDIT=$auditPath"
} finally {
    foreach ($name in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
}
