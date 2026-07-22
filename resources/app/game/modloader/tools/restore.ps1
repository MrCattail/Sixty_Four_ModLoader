param(
	[string]$SnapshotId,
	[switch]$ConfirmRestore
)

. "$PSScriptRoot\common.ps1"

if (-not $SnapshotId) {
	$latestPath = Join-Path $StateRoot 'latest-snapshot.txt'
	if (Test-Path -LiteralPath $latestPath) {
		$SnapshotId = (Get-Content -LiteralPath $latestPath -Raw).Trim()
	}
}

if (-not $SnapshotId) {
	throw 'No SnapshotId was provided and no latest snapshot exists.'
}

if (-not $ConfirmRestore) {
	throw 'Restore is disabled unless -ConfirmRestore is supplied.'
}

$snapshotPath = Join-Path $SnapshotRoot $SnapshotId
$manifestPath = Join-Path $snapshotPath 'snapshot.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
	throw "Snapshot manifest not found: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
foreach ($file in $manifest.files) {
	if (-not $file.exists) { continue }

	$source = Join-Path $snapshotPath $file.relativePath
	$destination = Join-Path $GameRoot $file.relativePath
	if (-not (Test-Path -LiteralPath $source)) {
		throw "Snapshot file missing: $source"
	}

	$destinationDirectory = Split-Path -Parent $destination
	New-DirectoryIfMissing -Path $destinationDirectory
	Copy-Item -LiteralPath $source -Destination $destination -Force
	Write-Host "Restored $($file.relativePath)"
}

Write-Host "Restore complete from snapshot: $SnapshotId"
