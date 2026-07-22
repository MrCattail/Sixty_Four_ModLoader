param(
	[string]$GameRoot,
	[string]$ZipPath,
	[switch]$ReplaceMods,
	[switch]$PreserveMods,
	[switch]$DeletePackage,
	[switch]$KeepPackage
)

$ErrorActionPreference = 'Stop'

function Resolve-GameRoot {
	param([string]$Path)

	if ($Path) {
		$resolved = Resolve-Path -LiteralPath $Path
	} else {
		$resolved = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
	}

	$gamePath = Join-Path $resolved 'resources\app\game'
	if (-not (Test-Path -LiteralPath $gamePath)) {
		throw "GameRoot must point to the Sixty Four win-unpacked folder. Missing: $gamePath"
	}

	return $resolved.Path
}

function New-DirectoryIfMissing {
	param([string]$Path)

	if (-not (Test-Path -LiteralPath $Path)) {
		New-Item -ItemType Directory -Force -Path $Path | Out-Null
	}
}

function Copy-DirectoryContents {
	param(
		[string]$Source,
		[string]$Target
	)

	$sourceRoot = (Resolve-Path -LiteralPath $Source).Path
	New-DirectoryIfMissing -Path $Target
	Get-ChildItem -LiteralPath $Source -Recurse -File | ForEach-Object {
		$relative = $_.FullName.Substring($sourceRoot.Length).TrimStart('\')
		$destination = Join-Path $Target $relative
		New-DirectoryIfMissing -Path (Split-Path -Parent $destination)
		Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
	}
}

function Normalize-ZipPath {
	param([string]$Path)

	return ($Path -replace '\\', '/').TrimStart('/')
}

function Read-ZipEntryText {
	param($Entry)

	$stream = $Entry.Open()
	try {
		$reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8, $true)
		try {
			return $reader.ReadToEnd()
		} finally {
			$reader.Dispose()
		}
	} finally {
		if ($stream) {
			$stream.Dispose()
		}
	}
}

function Get-LoaderVersionFromText {
	param([string]$Text)

	if ($Text -match 'version\s*:\s*[''"]([^''"]+)[''"]') {
		return $Matches[1].Trim()
	}

	return ''
}

function ConvertTo-UtcDateTime {
	param($Value)

	if (-not $Value) { return $null }
	try {
		if ($Value -is [datetime]) {
			return $Value.ToUniversalTime()
		}
		return ([datetimeoffset]::Parse([string]$Value, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal)).UtcDateTime
	} catch {
		try {
			return ([datetime]::Parse([string]$Value, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal)).ToUniversalTime()
		} catch {
			return $null
		}
	}
}

function Get-ManifestBuildTimeUtc {
	param($Manifest)

	if (-not $Manifest) { return $null }
	foreach ($name in @('builtAtUtc', 'buildTimeUtc', 'packageBuiltAtUtc', 'createdAtUtc')) {
		if ($Manifest.PSObject.Properties[$name]) {
			$time = ConvertTo-UtcDateTime -Value $Manifest.$name
			if ($time) { return $time }
		}
	}
	return $null
}

function Get-BuildTimeSortKey {
	param($Value)

	$time = ConvertTo-UtcDateTime -Value $Value
	if (-not $time) { return [int64]0 }
	return [int64]$time.Ticks
}

function Format-BuildTime {
	param($Value)

	$time = ConvertTo-UtcDateTime -Value $Value
	if (-not $time) { return 'unknown' }
	return $time.ToString('u')
}

function Get-InstalledModLoaderInfo {
	param([string]$Root)

	$version = ''
	$buildTimeUtc = $null
	$loaderPath = Join-Path $Root 'resources\app\game\modloader\loader.js'
	$manifestPath = Join-Path $Root 'modloader-installer\modloader-package.json'

	if (Test-Path -LiteralPath $manifestPath) {
		try {
			$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
			if (-not $manifest.id -or $manifest.id -eq 'sixtyfour-modloader') {
				$version = [string]$manifest.version
				$buildTimeUtc = Get-ManifestBuildTimeUtc -Manifest $manifest
			}
		} catch {
			$version = ''
			$buildTimeUtc = $null
		}
	}

	if (Test-Path -LiteralPath $loaderPath) {
		if (-not $version) {
			$version = Get-LoaderVersionFromText -Text (Get-Content -LiteralPath $loaderPath -Raw -Encoding UTF8)
		}
		if (-not $buildTimeUtc) {
			$buildTimeUtc = (Get-Item -LiteralPath $loaderPath).LastWriteTimeUtc
		}
	}

	if (-not $version) { $version = '0.0.0' }
	return [pscustomobject]@{
		Version = $version
		VersionKey = Get-VersionSortKey -Version $version
		BuildTimeUtc = $buildTimeUtc
		BuildTimeKey = Get-BuildTimeSortKey -Value $buildTimeUtc
	}
}

function Get-VersionParts {
	param([string]$Version)

	$match = [regex]::Match([string]$Version, '\d+(?:\.\d+){0,3}')
	if (-not $match.Success) {
		return $null
	}

	$parts = @($match.Value -split '\.' | ForEach-Object { [int]$_ })
	while ($parts.Count -lt 4) {
		$parts += 0
	}

	return ,$parts[0..3]
}

function Compare-VersionText {
	param(
		[string]$Left,
		[string]$Right
	)

	$leftParts = Get-VersionParts -Version $Left
	$rightParts = Get-VersionParts -Version $Right
	if (-not $leftParts -and -not $rightParts) {
		return [string]::Compare($Left, $Right, [System.StringComparison]::OrdinalIgnoreCase)
	}
	if (-not $leftParts) { return -1 }
	if (-not $rightParts) { return 1 }

	for ($i = 0; $i -lt 4; $i++) {
		if ($leftParts[$i] -gt $rightParts[$i]) { return 1 }
		if ($leftParts[$i] -lt $rightParts[$i]) { return -1 }
	}

	return 0
}

function Get-VersionSortKey {
	param([string]$Version)

	$parts = Get-VersionParts -Version $Version
	if (-not $parts) {
		return '00000000.00000000.00000000.00000000'
	}

	return ('{0:D8}.{1:D8}.{2:D8}.{3:D8}' -f $parts[0], $parts[1], $parts[2], $parts[3])
}

function Get-PackageInfoFromZip {
	param([string]$Path)

	$file = Get-Item -LiteralPath $Path
	Add-Type -AssemblyName System.IO.Compression.FileSystem
	$zip = [System.IO.Compression.ZipFile]::OpenRead($file.FullName)
	try {
		$entriesByPath = @{}
		foreach ($entry in $zip.Entries) {
			if (-not $entry.FullName) { continue }
			$normalized = Normalize-ZipPath -Path $entry.FullName
			if (-not $normalized) { continue }
			$entriesByPath[$normalized.ToLowerInvariant()] = $entry
		}

		$loaderSuffix = 'resources/app/game/modloader/loader.js'
		$roots = @()
		foreach ($entryPath in $entriesByPath.Keys) {
			if ($entryPath.EndsWith($loaderSuffix)) {
				$roots += $entryPath.Substring(0, $entryPath.Length - $loaderSuffix.Length)
			}
		}

		$packages = @()
		foreach ($root in @($roots | Sort-Object -Unique)) {
			$installKey = ($root + 'modloader-installer/install.ps1').ToLowerInvariant()
			$patchKey = ($root + 'modloader-installer/patch-source.ps1').ToLowerInvariant()
			$loaderKey = ($root + $loaderSuffix).ToLowerInvariant()
			if (-not $entriesByPath.ContainsKey($installKey) -or -not $entriesByPath.ContainsKey($patchKey) -or -not $entriesByPath.ContainsKey($loaderKey)) {
				continue
			}

			$version = ''
			$buildTimeUtc = $null
			$manifestKey = ($root + 'modloader-installer/modloader-package.json').ToLowerInvariant()
			if ($entriesByPath.ContainsKey($manifestKey)) {
				try {
					$manifest = Read-ZipEntryText -Entry $entriesByPath[$manifestKey] | ConvertFrom-Json
					if ($manifest.id -and $manifest.id -ne 'sixtyfour-modloader') {
						continue
					}
					$version = [string]$manifest.version
					$buildTimeUtc = Get-ManifestBuildTimeUtc -Manifest $manifest
				} catch {
					$version = ''
					$buildTimeUtc = $null
				}
			}
			if (-not $version) {
				$version = Get-LoaderVersionFromText -Text (Read-ZipEntryText -Entry $entriesByPath[$loaderKey])
			}
			if (-not $version) {
				continue
			}

			if (-not $buildTimeUtc) {
				$buildTimeUtc = $file.LastWriteTimeUtc
			}

			$packages += [pscustomobject]@{
				Path = $file.FullName
				Version = $version
				VersionKey = Get-VersionSortKey -Version $version
				BuildTimeUtc = $buildTimeUtc
				BuildTimeKey = Get-BuildTimeSortKey -Value $buildTimeUtc
				LastWriteTimeUtc = $file.LastWriteTimeUtc
				PackageRoot = $root.TrimEnd('/')
			}
		}

		if (-not $packages) {
			return $null
		}

		return $packages | Sort-Object @{ Expression = 'VersionKey'; Descending = $true }, @{ Expression = 'BuildTimeKey'; Descending = $true }, @{ Expression = 'LastWriteTimeUtc'; Descending = $true } | Select-Object -First 1
	} finally {
		$zip.Dispose()
	}
}

function Compare-PackageInfoToInstalled {
	param(
		$Package,
		$Installed
	)

	$versionCompare = Compare-VersionText -Left $Package.Version -Right $Installed.Version
	if ($versionCompare -ne 0) { return $versionCompare }

	$packageBuild = ConvertTo-UtcDateTime -Value $Package.BuildTimeUtc
	$installedBuild = ConvertTo-UtcDateTime -Value $Installed.BuildTimeUtc
	if ($packageBuild -and $installedBuild) {
		if ($packageBuild -gt $installedBuild) { return 1 }
		if ($packageBuild -lt $installedBuild) { return -1 }
		return 0
	}
	if ($packageBuild -and -not $installedBuild) { return 1 }
	return 0
}

function Find-PackageZip {
	param(
		[string]$ExplicitZipPath,
		$CurrentInfo
	)

	if ($ExplicitZipPath) {
		$resolved = Resolve-Path -LiteralPath $ExplicitZipPath
		$info = Get-PackageInfoFromZip -Path $resolved.Path
		if (-not $info) {
			throw 'The selected zip is not a Sixty Four ModLoader package.'
		}
		if ((Compare-PackageInfoToInstalled -Package $info -Installed $CurrentInfo) -le 0) {
			throw "The selected package ($($info.Version), built $(Format-BuildTime $info.BuildTimeUtc)) is not newer than the installed ModLoader ($($CurrentInfo.Version), built $(Format-BuildTime $CurrentInfo.BuildTimeUtc))."
		}
		return $info
	}

	$zipFiles = @(Get-ChildItem -LiteralPath $PSScriptRoot -File -Filter '*.zip')
	if (-not $zipFiles) {
		throw 'Could not find any zip package next to update.cmd. Put the new ModLoader zip in modloader-installer and run update.cmd again.'
	}

	$packages = @()
	foreach ($zipFile in $zipFiles) {
		try {
			$info = Get-PackageInfoFromZip -Path $zipFile.FullName
			if ($info) {
				$packages += $info
			}
		} catch {
			Write-Host "Skipping unreadable zip: $($zipFile.Name)" -ForegroundColor DarkGray
		}
	}

	$newerPackages = @($packages | Where-Object { (Compare-PackageInfoToInstalled -Package $_ -Installed $CurrentInfo) -gt 0 })
	if (-not $newerPackages) {
		throw "Could not find a newer Sixty Four ModLoader package in modloader-installer. Installed version: $($CurrentInfo.Version); installed build: $(Format-BuildTime $CurrentInfo.BuildTimeUtc)"
	}

	return $newerPackages | Sort-Object @{ Expression = 'VersionKey'; Descending = $true }, @{ Expression = 'BuildTimeKey'; Descending = $true }, @{ Expression = 'LastWriteTimeUtc'; Descending = $true } | Select-Object -First 1
}

function Find-PackageRoot {
	param([string]$ExtractRoot)

	$candidates = @((Get-Item -LiteralPath $ExtractRoot)) + @(Get-ChildItem -LiteralPath $ExtractRoot -Directory -Recurse)
	foreach ($candidate in $candidates) {
		$installer = Join-Path $candidate.FullName 'modloader-installer\install.ps1'
		$patcher = Join-Path $candidate.FullName 'modloader-installer\patch-source.ps1'
		$loader = Join-Path $candidate.FullName 'resources\app\game\modloader\loader.js'
		if ((Test-Path -LiteralPath $installer) -and (Test-Path -LiteralPath $patcher) -and (Test-Path -LiteralPath $loader)) {
			return $candidate.FullName
		}
	}

	throw 'The zip does not look like a Sixty Four ModLoader package. Missing modloader-installer\install.ps1, modloader-installer\patch-source.ps1, or resources\app\game\modloader\loader.js.'
}

function Get-ReplaceModsPromptText {
	return -join @(
		[char]0x662f, [char]0x5426, [char]0x4f7f, [char]0x7528,
		'modloader',
		[char]0x91cc, [char]0x7684,
		'mods',
		[char]0x8986, [char]0x76d6,
		[char]0x76ee, [char]0x524d,
		[char]0x5df2, [char]0x6709,
		[char]0x7684,
		'mod?'
	)
}

function Ask-ReplaceMods {
	if ($ReplaceMods) { return $true }
	if ($PreserveMods) { return $false }

	$message = Get-ReplaceModsPromptText
	try {
		Add-Type -AssemblyName System.Windows.Forms
		$result = [System.Windows.Forms.MessageBox]::Show(
			$message,
			'Sixty Four ModLoader Update',
			[System.Windows.Forms.MessageBoxButtons]::YesNo,
			[System.Windows.Forms.MessageBoxIcon]::Question
		)
		return $result -eq [System.Windows.Forms.DialogResult]::Yes
	} catch {
		$answer = Read-Host "$message [Y/N]"
		return $answer -match '^(y|yes)$'
	}
}

function Get-DeletePackagePromptText {
	param([string]$PackagePath)

	return (-join @(
		[char]0x662f, [char]0x5426,
		[char]0x5220, [char]0x9664,
		[char]0x521a, [char]0x624d,
		[char]0x4f7f, [char]0x7528,
		[char]0x7684,
		[char]0x5b89, [char]0x88c5,
		[char]0x5305, [char]0xff1f
	)) + "`n$PackagePath"
}

function Ask-DeletePackage {
	param([string]$PackagePath)

	if ($DeletePackage) { return $true }
	if ($KeepPackage) { return $false }

	$message = Get-DeletePackagePromptText -PackagePath $PackagePath
	try {
		Add-Type -AssemblyName System.Windows.Forms
		$result = [System.Windows.Forms.MessageBox]::Show(
			$message,
			'Sixty Four ModLoader Update',
			[System.Windows.Forms.MessageBoxButtons]::YesNo,
			[System.Windows.Forms.MessageBoxIcon]::Question
		)
		return $result -eq [System.Windows.Forms.DialogResult]::Yes
	} catch {
		$answer = Read-Host "$message [Y/N]"
		return $answer -match '^(y|yes)$'
	}
}

if ($ReplaceMods -and $PreserveMods) {
	throw 'Use either -ReplaceMods or -PreserveMods, not both.'
}
if ($DeletePackage -and $KeepPackage) {
	throw 'Use either -DeletePackage or -KeepPackage, not both.'
}

$targetRoot = Resolve-GameRoot -Path $GameRoot
$currentInfo = Get-InstalledModLoaderInfo -Root $targetRoot
$package = Find-PackageZip -ExplicitZipPath $ZipPath -CurrentInfo $currentInfo
$zip = $package.Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "SixtyFour-ModLoader-Update-$stamp"

try {
	if (Test-Path -LiteralPath $tempRoot) {
		Remove-Item -LiteralPath $tempRoot -Recurse -Force
	}
	New-DirectoryIfMissing -Path $tempRoot

	Write-Host "Using package: $zip"
	Write-Host "Installed ModLoader version: $($currentInfo.Version)"
	Write-Host "Installed ModLoader build: $(Format-BuildTime $currentInfo.BuildTimeUtc)"
	Write-Host "Package ModLoader version: $($package.Version)"
	Write-Host "Package ModLoader build: $(Format-BuildTime $package.BuildTimeUtc)"
	Write-Host "Extracting package..."
	Expand-Archive -LiteralPath $zip -DestinationPath $tempRoot -Force
	$packageRoot = Find-PackageRoot -ExtractRoot $tempRoot
	$replaceCurrentMods = Ask-ReplaceMods

	$installScript = Join-Path $packageRoot 'modloader-installer\install.ps1'
	$installArgs = @(
		'-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $installScript,
		'-GameRoot', $targetRoot,
		'-SourceRoot', $packageRoot,
		'-Force'
	)
	if ($replaceCurrentMods) {
		$installArgs += '-ReplaceMods'
		Write-Host 'Player chose to replace the current mods folder with the package mods.'
	} else {
		$installArgs += '-SkipMods'
		Write-Host 'Player chose to keep the current mods folder unchanged.'
	}

	& powershell @installArgs
	if ($LASTEXITCODE) {
		throw "install.ps1 failed with exit code $LASTEXITCODE"
	}

	$sourceInstaller = Join-Path $packageRoot 'modloader-installer'
	$targetInstaller = Join-Path $targetRoot 'modloader-installer'
	if (Test-Path -LiteralPath $sourceInstaller) {
		Copy-DirectoryContents -Source $sourceInstaller -Target $targetInstaller
		Write-Host 'Updated modloader-installer files.'
	}

	Write-Host ''
	Write-Host 'ModLoader update completed.'
	if (Ask-DeletePackage -PackagePath $zip) {
		Remove-Item -LiteralPath $zip -Force
		Write-Host "Deleted package: $zip"
	}
} finally {
	if (Test-Path -LiteralPath $tempRoot) {
		Remove-Item -LiteralPath $tempRoot -Recurse -Force
	}
}