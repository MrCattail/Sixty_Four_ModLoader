. "$PSScriptRoot\common.ps1"

$enabledPath = Join-Path $GameRoot 'mods\enabled.json'
$enabled = $null
if (Test-Path -LiteralPath $enabledPath) {
	$enabled = Get-Content -LiteralPath $enabledPath -Raw | ConvertFrom-Json
}

$mods = @()
$enabledMods = @()
if ($enabled -and $enabled.mods) {
	$enabledMods = @($enabled.mods)
}

foreach ($entry in $enabledMods) {
	$pathName = if ($entry -is [string]) { $entry } else { $entry.path }
	if (-not $pathName) { $pathName = $entry.id }
	$manifestPath = Join-Path $GameRoot "mods\$pathName\mod.json"
	if (Test-Path -LiteralPath $manifestPath) {
		$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
		$mods += [ordered]@{
			path = $pathName
			id = $manifest.id
			name = $manifest.name
			version = $manifest.version
			entry = $manifest.entry
			dependencies = $manifest.dependencies
			conflicts = $manifest.conflicts
		}
	} else {
		$mods += [ordered]@{
			path = $pathName
			missingManifest = $true
		}
	}
}

$files = foreach ($relativePath in $TrackedFiles) {
	Get-TrackedFileInfo -RelativePath $relativePath
}

$latestSnapshotPath = Join-Path $StateRoot 'latest-snapshot.txt'
$latestSnapshot = if (Test-Path -LiteralPath $latestSnapshotPath) {
	(Get-Content -LiteralPath $latestSnapshotPath -Raw).Trim()
} else {
	$null
}

$report = [ordered]@{
	generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
	gameRoot = $GameRoot.Path
	latestSnapshot = $latestSnapshot
	enabledMods = $enabledMods
	mods = $mods
	trackedFiles = $files
}

ConvertTo-PrettyJson -Value $report
