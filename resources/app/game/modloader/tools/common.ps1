$ErrorActionPreference = 'Stop'

$GameRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$StateRoot = Join-Path $GameRoot 'modloader\state'
$SnapshotRoot = Join-Path $StateRoot 'snapshots'

$TrackedFiles = @(
	'..\main.js',
	'index.html',
	'scripts\game.js',
	'scripts\ui.js',
	'scripts\sprites.js',
	'modloader\loader.js',
	'mods\enabled.json'
)

function Get-TrackedFileInfo {
	param(
		[Parameter(Mandatory = $true)]
		[string]$RelativePath
	)

	$path = Join-Path $GameRoot $RelativePath
	if (-not (Test-Path -LiteralPath $path)) {
		return [ordered]@{
			relativePath = $RelativePath
			exists = $false
		}
	}

	$item = Get-Item -LiteralPath $path
	$hash = Get-FileHash -LiteralPath $path -Algorithm SHA256
	return [ordered]@{
		relativePath = $RelativePath
		fullPath = $item.FullName
		exists = $true
		length = $item.Length
		lastWriteTimeUtc = $item.LastWriteTimeUtc.ToString('o')
		sha256 = $hash.Hash
	}
}

function New-DirectoryIfMissing {
	param(
		[Parameter(Mandatory = $true)]
		[string]$Path
	)

	if (-not (Test-Path -LiteralPath $Path)) {
		New-Item -ItemType Directory -Force -Path $Path | Out-Null
	}
}

function ConvertTo-PrettyJson {
	param(
		[Parameter(Mandatory = $true)]
		[object]$Value
	)

	return $Value | ConvertTo-Json -Depth 20
}
