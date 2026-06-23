param(
	[string]$OutputPath = '.\dist\SixtyFour-ModLoader.zip',
	[switch]$Clean,
	[switch]$CleanEnabled
)

$ErrorActionPreference = 'Stop'

function New-DirectoryIfMissing {
	param([string]$Path)

	if (-not (Test-Path -LiteralPath $Path)) {
		New-Item -ItemType Directory -Force -Path $Path | Out-Null
	}
}

function Copy-FileWithParents {
	param(
		[string]$SourceRoot,
		[string]$TargetRoot,
		[string]$RelativePath
	)

	$source = Join-Path $SourceRoot $RelativePath
	$target = Join-Path $TargetRoot $RelativePath
	if (-not (Test-Path -LiteralPath $source)) {
		throw "Package source file missing: $source"
	}

	New-DirectoryIfMissing -Path (Split-Path -Parent $target)
	Copy-Item -LiteralPath $source -Destination $target -Force
}

function Copy-DirectoryFiltered {
	param(
		[string]$Source,
		[string]$Target,
		[string[]]$ExcludePrefixes = @()
	)

	$sourceRoot = (Resolve-Path -LiteralPath $Source).Path
	New-DirectoryIfMissing -Path $Target

	Get-ChildItem -LiteralPath $Source -Recurse -File | ForEach-Object {
		$relative = $_.FullName.Substring($sourceRoot.Length).TrimStart('\')
		$normalized = $relative.Replace('\', '/')
		foreach ($prefix in $ExcludePrefixes) {
			if ($normalized.StartsWith($prefix)) {
				return
			}
		}

		$destination = Join-Path $Target $relative
		New-DirectoryIfMissing -Path (Split-Path -Parent $destination)
		Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
	}
}

$packageRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stagingRoot = Join-Path $packageRoot 'dist\package-staging\SixtyFour-ModLoader'
if ([System.IO.Path]::IsPathRooted($OutputPath)) {
	$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
} else {
	$resolvedOutput = [System.IO.Path]::GetFullPath((Join-Path $packageRoot $OutputPath))
}

if ($Clean -and (Test-Path -LiteralPath (Join-Path $packageRoot 'dist'))) {
	Remove-Item -LiteralPath (Join-Path $packageRoot 'dist') -Recurse -Force
}

if (Test-Path -LiteralPath $stagingRoot) {
	Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
New-DirectoryIfMissing -Path $stagingRoot

$coreFiles = @(
	'resources\app\main.js',
	'resources\app\game\index.html',
	'resources\app\game\scripts\game.js',
	'resources\app\game\scripts\ui.js',
	'resources\app\game\scripts\sprites.js'
)

foreach ($relativePath in $coreFiles) {
	Copy-FileWithParents -SourceRoot $packageRoot -TargetRoot $stagingRoot -RelativePath $relativePath
}

Copy-DirectoryFiltered `
	-Source (Join-Path $packageRoot 'modloader-installer') `
	-Target (Join-Path $stagingRoot 'modloader-installer') `
	-ExcludePrefixes @()

Copy-DirectoryFiltered `
	-Source (Join-Path $packageRoot 'resources\app\game\modloader') `
	-Target (Join-Path $stagingRoot 'resources\app\game\modloader') `
	-ExcludePrefixes @('state/')

Copy-DirectoryFiltered `
	-Source (Join-Path $packageRoot 'resources\app\game\mods') `
	-Target (Join-Path $stagingRoot 'resources\app\game\mods') `
	-ExcludePrefixes @()

if ($CleanEnabled) {
	$cleanEnabledPath = Join-Path $stagingRoot 'resources\app\game\mods\enabled.json'
	"{`r`n  `"mods`": []`r`n}" | Set-Content -LiteralPath $cleanEnabledPath -Encoding ASCII -NoNewline
}

$packageReadme = @'
# Sixty Four ModLoader

## Easy Install

1. Extract this zip into the Sixty Four `win-unpacked` folder.
2. Open `modloader-installer`.
3. Double-click `Install ModLoader.cmd`.
4. Start the game.
5. Press `Ctrl+M` to open the ModLoader panel.

The folder should contain `sixtyfour.exe`, `resources`, and
`modloader-installer` at the same level.

## Command-Line Install

You can also install with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\modloader-installer\install.ps1 -GameRoot "D:\Steam\steamapps\common\Sixty Four\win-unpacked"
```

See `modloader-installer/README.md` and
`resources/app/game/modloader/README.md` for details.
'@
$packageReadme | Set-Content -LiteralPath (Join-Path $stagingRoot 'README.md') -Encoding UTF8

New-DirectoryIfMissing -Path (Split-Path -Parent $resolvedOutput)
if (Test-Path -LiteralPath $resolvedOutput) {
	Remove-Item -LiteralPath $resolvedOutput -Force
}

Compress-Archive -Path (Join-Path $stagingRoot '*') -DestinationPath $resolvedOutput -Force

Write-Host "Package created: $resolvedOutput"
