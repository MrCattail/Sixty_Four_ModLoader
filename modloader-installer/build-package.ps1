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

function Get-LoaderVersionFromText {
	param([string]$Text)

	if ($Text -match 'version\s*:\s*[''"]([^''"]+)[''"]') {
		return $Matches[1].Trim()
	}

	return '0.0.0'
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


Copy-DirectoryFiltered `
	-Source (Join-Path $packageRoot 'modloader-installer') `
	-Target (Join-Path $stagingRoot 'modloader-installer') `
	-ExcludePrefixes @()

Copy-DirectoryFiltered `
	-Source (Join-Path $packageRoot 'resources\app\game\modloader') `
	-Target (Join-Path $stagingRoot 'resources\app\game\modloader') `
	-ExcludePrefixes @('state/', 'translations.json')

Copy-DirectoryFiltered `
	-Source (Join-Path $packageRoot 'resources\app\game\mods') `
	-Target (Join-Path $stagingRoot 'resources\app\game\mods') `
	-ExcludePrefixes @()

if ($CleanEnabled) {
	$cleanEnabledPath = Join-Path $stagingRoot 'resources\app\game\mods\enabled.json'
	"{`r`n  `"mods`": []`r`n}" | Set-Content -LiteralPath $cleanEnabledPath -Encoding ASCII -NoNewline
}

$loaderVersion = Get-LoaderVersionFromText -Text (Get-Content -LiteralPath (Join-Path $stagingRoot 'resources\app\game\modloader\loader.js') -Raw -Encoding UTF8)
$builtAtUtc = (Get-Date).ToUniversalTime().ToString('o')
$packageManifest = [ordered]@{
	id = 'sixtyfour-modloader'
	name = "Cattail's ModLoader"
	version = $loaderVersion
	builtAtUtc = $builtAtUtc
	packageFormat = 1
}
$packageManifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $stagingRoot 'modloader-installer\modloader-package.json') -Encoding ASCII

$packageReadme = @'
# Sixty Four ModLoader

## Easy Install

1. Extract this zip into the Sixty Four `win-unpacked` folder.
2. Open `modloader-installer` and double-click `Install ModLoader.cmd`.
3. Start the game.
4. Press `Ctrl+M` to open the ModLoader panel.

The folder should contain `sixtyfour.exe`, `resources`, and
`modloader-installer` at the same level. This package does not include copied
Sixty Four source files; the installer patches the local game files in place.

If Windows extracts the zip into `win-unpacked\SixtyFour-ModLoader`, open
`SixtyFour-ModLoader\modloader-installer` and run `Install ModLoader.cmd` there.
The installer will detect the nested package and install into the parent
`win-unpacked` folder automatically.

## Easy Update

To update an existing install without manually extracting over the game folder:

1. Put any newer ModLoader zip in `modloader-installer`; the file name does not matter.
2. Double-click `modloader-installer\update.cmd`.
3. The updater scans all zip files there and uses the newest ModLoader package.
   A package is newer when its version is higher, or when the version is the same
   but its package build time is newer.
4. Choose whether the package mods should replace the current mods folder.
5. After a successful update, choose whether to delete the zip package that was used.

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

$forbiddenCoreFiles = @(
	'resources\app\main.js',
	'resources\app\game\index.html',
	'resources\app\game\scripts\game.js',
	'resources\app\game\scripts\ui.js',
	'resources\app\game\scripts\sprites.js'
)
foreach ($relativePath in $forbiddenCoreFiles) {
	$forbidden = Join-Path $stagingRoot $relativePath
	if (Test-Path -LiteralPath $forbidden) {
		throw "Refusing to package copied game source file: $relativePath"
	}
}

Compress-Archive -Path (Join-Path $stagingRoot '*') -DestinationPath $resolvedOutput -Force
Write-Host "Package created: $resolvedOutput"
