param(
	[string]$GameRoot,
	[string]$ZipPath,
	[switch]$ReplaceMods,
	[switch]$PreserveMods
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

function Find-PackageZip {
	param([string]$ExplicitZipPath)

	if ($ExplicitZipPath) {
		$resolved = Resolve-Path -LiteralPath $ExplicitZipPath
		return $resolved.Path
	}

	$exactNames = @('sixtyfour-modloader.zip', 'SixtyFour-ModLoader.zip')
	foreach ($name in $exactNames) {
		$candidate = Join-Path $PSScriptRoot $name
		if (Test-Path -LiteralPath $candidate) {
			return (Resolve-Path -LiteralPath $candidate).Path
		}
	}

	$matches = Get-ChildItem -LiteralPath $PSScriptRoot -File -Filter '*.zip' | Where-Object {
		$_.Name -match '^sixty[-_]?four[-_]?modloader.*\.zip$'
	} | Sort-Object LastWriteTimeUtc -Descending

	if (-not $matches) {
		throw 'Could not find sixtyfour-modloader.zip next to update.cmd. Put the new ModLoader zip in modloader-installer and run update.cmd again.'
	}

	return $matches[0].FullName
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

if ($ReplaceMods -and $PreserveMods) {
	throw 'Use either -ReplaceMods or -PreserveMods, not both.'
}

$targetRoot = Resolve-GameRoot -Path $GameRoot
$zip = Find-PackageZip -ExplicitZipPath $ZipPath
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "SixtyFour-ModLoader-Update-$stamp"

try {
	if (Test-Path -LiteralPath $tempRoot) {
		Remove-Item -LiteralPath $tempRoot -Recurse -Force
	}
	New-DirectoryIfMissing -Path $tempRoot

	Write-Host "Using package: $zip"
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
} finally {
	if (Test-Path -LiteralPath $tempRoot) {
		Remove-Item -LiteralPath $tempRoot -Recurse -Force
	}
}