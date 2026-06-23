. "$PSScriptRoot\common.ps1"

New-DirectoryIfMissing -Path $SnapshotRoot

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $SnapshotRoot $stamp
New-DirectoryIfMissing -Path $target

$files = @()
foreach ($relativePath in $TrackedFiles) {
	$info = Get-TrackedFileInfo -RelativePath $relativePath
	$files += $info

	if ($info.exists) {
		$destination = Join-Path $target $relativePath
		$destinationDirectory = Split-Path -Parent $destination
		New-DirectoryIfMissing -Path $destinationDirectory
		Copy-Item -LiteralPath $info.fullPath -Destination $destination -Force
	}
}

$manifest = [ordered]@{
	createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
	gameRoot = $GameRoot.Path
	snapshotId = $stamp
	files = $files
}

$manifestPath = Join-Path $target 'snapshot.json'
ConvertTo-PrettyJson -Value $manifest | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$latestPath = Join-Path $StateRoot 'latest-snapshot.txt'
New-DirectoryIfMissing -Path $StateRoot
$stamp | Set-Content -LiteralPath $latestPath -Encoding ASCII

Write-Host "Snapshot created: $target"
Write-Host "Manifest: $manifestPath"
