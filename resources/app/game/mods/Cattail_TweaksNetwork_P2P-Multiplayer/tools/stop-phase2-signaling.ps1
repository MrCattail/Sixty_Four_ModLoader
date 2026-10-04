[CmdletBinding()]
param([string]$Phase2Root = 'C:\tmp\sixtyfour-p2p-phase2')

$ErrorActionPreference = 'Stop'
$resolvedRoot = [IO.Path]::GetFullPath($Phase2Root)
$pidPath = Join-Path $resolvedRoot 'signaling-process.json'
if (-not (Test-Path -LiteralPath $pidPath)) { throw "Signaling process record is missing: $pidPath" }
$record = Get-Content -LiteralPath $pidPath -Raw -Encoding UTF8 | ConvertFrom-Json
$pidValue = [int]$record.pid
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $pidValue" -ErrorAction SilentlyContinue
if (-not $process) {
    Write-Host 'P2P_PHASE2_SIGNALING_ALREADY_STOPPED=True'
    exit 0
}
$expectedRoot = [IO.Path]::GetFullPath([string]$record.serviceRoot)
if ($process.Name -ne 'node.exe' -or [string]$process.CommandLine -notlike "*$expectedRoot*wrangler*") {
    throw "Refusing to stop PID $pidValue because it is not the recorded Phase 2 Wrangler process."
}
Stop-Process -Id $pidValue
Wait-Process -Id $pidValue -Timeout 10 -ErrorAction SilentlyContinue
Write-Host 'P2P_PHASE2_SIGNALING_STOP=PASS'
Write-Host "P2P_PHASE2_SIGNALING_STOPPED_PID=$pidValue"
