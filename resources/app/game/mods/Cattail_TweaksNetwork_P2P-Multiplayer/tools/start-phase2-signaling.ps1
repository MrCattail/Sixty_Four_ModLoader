[CmdletBinding()]
param(
    [string]$Phase2Root = 'C:\tmp\sixtyfour-p2p-phase2',
    [int]$Port = 8787
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = [IO.Path]::GetFullPath($Phase2Root)
$serviceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\services\signaling'))
$wranglerScript = Join-Path $serviceRoot 'node_modules\wrangler\bin\wrangler.js'
$pidPath = Join-Path $resolvedRoot 'signaling-process.json'
$logsRoot = Join-Path $resolvedRoot 'logs'
$stateRoot = Join-Path $resolvedRoot 'wrangler-state'
if (-not (Test-Path -LiteralPath $wranglerScript)) { throw "Wrangler is not installed: $wranglerScript" }
if (Test-Path -LiteralPath $pidPath) {
    $previous = Get-Content -LiteralPath $pidPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($previous.pid -and (Get-Process -Id ([int]$previous.pid) -ErrorAction SilentlyContinue)) { throw "A Phase 2 signaling process is already running with PID $($previous.pid)." }
}
New-Item -ItemType Directory -Path $logsRoot -Force | Out-Null
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdoutPath = Join-Path $logsRoot ("signaling-$stamp.stdout.log")
$stderrPath = Join-Path $logsRoot ("signaling-$stamp.stderr.log")
$nodePath = (Get-Command node -ErrorAction Stop).Source
$arguments = @(
    ('"' + $wranglerScript + '"'),
    'dev', '--local', '--ip', '127.0.0.1', '--port', [string]$Port,
    '--persist-to', $stateRoot, '--show-interactive-dev-session=false'
)
$process = Start-Process -FilePath $nodePath -ArgumentList $arguments -WorkingDirectory $serviceRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
[pscustomobject][ordered]@{
    pid = $process.Id
    startedAt = (Get-Date).ToUniversalTime().ToString('o')
    nodePath = $nodePath
    serviceRoot = $serviceRoot
    port = $Port
    stdout = $stdoutPath
    stderr = $stderrPath
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pidPath -Encoding UTF8

$health = $null
for ($attempt = 0; $attempt -lt 80; $attempt++) {
    if ($process.HasExited) { throw "Signaling process exited early. Inspect $stderrPath" }
    try {
        $health = Invoke-RestMethod -Uri ("http://127.0.0.1:$Port/health") -Method Get -TimeoutSec 1
        if ($health.ok) { break }
    } catch {}
    Start-Sleep -Milliseconds 250
}
if (-not $health.ok) { throw "Signaling health check timed out. Inspect $stderrPath" }
Write-Host 'P2P_PHASE2_SIGNALING=PASS'
Write-Host "P2P_PHASE2_SIGNALING_PID=$($process.Id)"
Write-Host "P2P_PHASE2_SIGNALING_URL=http://127.0.0.1:$Port"
Write-Host "P2P_PHASE2_TURN_ENABLED=$($health.turnEnabled)"
