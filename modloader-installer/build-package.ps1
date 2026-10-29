param(
	[string]$OutputPath = '.\dist\SixtyFour-ModLoader.zip',
	[switch]$Clean,
	[switch]$CleanEnabled
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'filesystem.ps1')

function New-DirectoryIfMissing {
	param([string]$Path)

	New-InstallerDirectory $Path
}

function Get-LoaderVersionFromText {
	param([string]$Text)

	if ($Text -match 'version\s*:\s*[''"]([^''"]+)[''"]') {
		return $Matches[1].Trim()
	}

	return '0.0.0'
}


function Test-PlayerPackagePath {
    param([string]$RelativePath, [string]$Area)
    $relative = $RelativePath.Replace('\', '/').TrimStart('/')
    if ($Area -eq 'mods' -and $relative -notmatch '(?i)^template_and_example(?:/|$)' -and $relative -match '(?i)^[^/]+/tests(?:/|$)') { return $false }
    if ($Area -eq 'loader' -and $relative -ieq 'Translations-20260721-191815.json') { return $false }
    if ($Area -eq 'mods' -and ($relative -ieq 'Cattail_TweaksNetwork_P2P-Multiplayer' -or $relative.StartsWith('Cattail_TweaksNetwork_P2P-Multiplayer/', [StringComparison]::OrdinalIgnoreCase))) { return $false }
    if ($Area -eq 'mods' -and ($relative -ieq 'Archived' -or $relative.StartsWith('Archived/', [StringComparison]::OrdinalIgnoreCase))) { return $false }
    if ($Area -eq 'installer' -and ($relative -eq 'tests' -or $relative.StartsWith('tests/', [StringComparison]::OrdinalIgnoreCase))) { return $false }
    if ($Area -eq 'loader' -and ($relative -ieq 'diagnostics' -or $relative.StartsWith('diagnostics/', [StringComparison]::OrdinalIgnoreCase))) { return $false }
    if ($Area -eq 'loader' -and $relative.StartsWith('tools/', [StringComparison]::OrdinalIgnoreCase)) {
        return $relative.ToLowerInvariant() -in @('tools/verify.ps1','tools/common.ps1','tools/modifier-watch.ps1','tools/snapshot.ps1','tools/report.ps1','tools/restore.ps1','tools/readme.md')
    }
    return $true
}

function Assert-PlayerPackageEnabledMods {
    param([string]$EnabledPath, [switch]$CleanEnabled)
    if ($CleanEnabled) { return }
    $enabled = Get-Content -LiteralPath $EnabledPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (@($enabled.mods | Where-Object { $_ -ieq 'Cattail_TweaksNetwork_P2P-Multiplayer' }).Count) {
        throw 'Player package excludes P2P but enabled.json still enables it. Adjust the source list explicitly or use CleanEnabled for the package copy.'
    }
}

function Copy-DirectoryFiltered {
	param(
		[string]$Source,
		[string]$Target,
		[string[]]$ExcludePrefixes = @(),
        [string]$PackageArea = ''
	)

	$sourceRoot = (Resolve-Path -LiteralPath $Source).Path
	New-DirectoryIfMissing -Path $Target

	Get-InstallerFiles $Source -ExcludeRelative $ExcludePrefixes -SkipDevelopmentCaches | ForEach-Object {
		$relative = $_.FullName.Substring($sourceRoot.Length).TrimStart('\')
		$normalized = $relative.Replace('\', '/')
        if (-not (Test-PlayerPackagePath $normalized $PackageArea)) { return }
		foreach ($prefix in $ExcludePrefixes) {
			if ($normalized.StartsWith($prefix)) {
				return
			}
		}

		$destination = Join-Path $Target $relative
		New-DirectoryIfMissing -Path (Split-Path -Parent $destination)
		Copy-InstallerFile $_.FullName $destination
	}
}

$packageRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Assert-PlayerPackageEnabledMods -EnabledPath (Join-Path $packageRoot 'resources/app/game/mods/enabled.json') -CleanEnabled:$CleanEnabled
$stagingRoot = Join-Path $packageRoot 'dist\package-staging\SixtyFour-ModLoader'
if ([System.IO.Path]::IsPathRooted($OutputPath)) {
	$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
} else {
	$resolvedOutput = [System.IO.Path]::GetFullPath((Join-Path $packageRoot $OutputPath))
}

if ($Clean -and (Test-Path -LiteralPath (Join-Path $packageRoot 'dist'))) {
	$cleanTarget = Assert-InstallerChildPath $packageRoot (Join-Path $packageRoot 'dist')
	Remove-InstallerDirectory $cleanTarget
}

if (Test-Path -LiteralPath $stagingRoot) {
	$cleanTarget = Assert-InstallerChildPath (Join-Path $packageRoot 'dist') $stagingRoot
	Remove-InstallerDirectory $cleanTarget
}
New-DirectoryIfMissing -Path $stagingRoot


Copy-DirectoryFiltered `
	-Source (Join-Path $packageRoot 'modloader-installer') `
	-Target (Join-Path $stagingRoot 'modloader-installer') `
    -PackageArea installer `
	-ExcludePrefixes @()

Copy-DirectoryFiltered `
	-Source (Join-Path $packageRoot 'resources\app\game\modloader') `
	-Target (Join-Path $stagingRoot 'resources\app\game\modloader') `
	-PackageArea loader `
	-ExcludePrefixes @('state/', 'backups/', 'translations.json')

Copy-DirectoryFiltered `
	-Source (Join-Path $packageRoot 'resources\app\game\mods') `
	-Target (Join-Path $stagingRoot 'resources\app\game\mods') `
    -PackageArea mods `
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
	Remove-InstallerFile $resolvedOutput
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

Compress-InstallerDirectory $stagingRoot $resolvedOutput
Write-Host "Package created: $resolvedOutput"
