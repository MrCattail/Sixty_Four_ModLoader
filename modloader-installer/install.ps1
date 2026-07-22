param(
	[string]$GameRoot,
	[string]$SourceRoot,
	[switch]$Force,
	[switch]$SkipMods,
	[switch]$ReplaceMods
)

$ErrorActionPreference = 'Stop'

function Resolve-GameRoot {
	param([string]$Path)

	if ($Path) {
		$resolved = Resolve-Path -LiteralPath $Path
	} else {
		$resolved = Resolve-Path -LiteralPath (Get-Location)
	}

	$gamePath = Join-Path $resolved 'resources\app\game'
	if (-not (Test-Path -LiteralPath $gamePath)) {
		throw "GameRoot must point to the Sixty Four win-unpacked folder. Missing: $gamePath"
	}

	return $resolved.Path
}

function Find-SourceRoot {
	param([string]$ExplicitSourceRoot)

	$candidates = @()
	if ($ExplicitSourceRoot) { $candidates += $ExplicitSourceRoot }
	$candidates += $PSScriptRoot
	$candidates += (Join-Path $PSScriptRoot 'payload')
	$candidates += (Join-Path $PSScriptRoot '..')
	$candidates += (Join-Path $PSScriptRoot '..\..')

	foreach ($candidate in $candidates) {
		try {
			$resolved = Resolve-Path -LiteralPath $candidate
		} catch {
			continue
		}

		$loader = Join-Path $resolved 'resources\app\game\modloader\loader.js'
		$patcher = Join-Path $resolved 'modloader-installer\patch-source.ps1'
		if ((Test-Path -LiteralPath $loader) -and (Test-Path -LiteralPath $patcher)) {
			return $resolved.Path
		}
	}

	throw 'Could not find installer source files. Pass -SourceRoot pointing to the loader package root.'
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
		[string]$Target,
		[string[]]$ExcludeRelative = @()
	)

	New-DirectoryIfMissing -Path $Target
	$sourceRoot = (Resolve-Path -LiteralPath $Source).Path
	$exclude = @{}
	foreach ($item in $ExcludeRelative) {
		$exclude[$item.ToLowerInvariant()] = $true
	}

	Get-ChildItem -LiteralPath $Source -Recurse -File | ForEach-Object {
		$relative = $_.FullName.Substring($sourceRoot.Length).TrimStart('\')
		if ($exclude[$relative.ToLowerInvariant()]) { return }

		$destination = Join-Path $Target $relative
		$resolvedDestination = Resolve-Path -LiteralPath $destination -ErrorAction SilentlyContinue
		if ($resolvedDestination -and $resolvedDestination.Path -eq $_.FullName) { return }
		New-DirectoryIfMissing -Path (Split-Path -Parent $destination)
		Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
	}
}

function Restore-InstallBackup {
	param(
		[object[]]$ManifestFiles,
		[string]$TargetRoot,
		[string]$BackupPath
	)

	foreach ($entry in $ManifestFiles) {
		$relativePath = $entry.relativePath
		$target = Join-Path $TargetRoot $relativePath
		if ($entry.exists) {
			$backup = Join-Path $BackupPath $relativePath
			if (Test-Path -LiteralPath $backup) {
				New-DirectoryIfMissing -Path (Split-Path -Parent $target)
				Copy-Item -LiteralPath $backup -Destination $target -Force
			}
		} elseif (Test-Path -LiteralPath $target) {
			Remove-Item -LiteralPath $target -Force
		}
	}
}

$targetRoot = Resolve-GameRoot -Path $GameRoot
$sourceRoot = Find-SourceRoot -ExplicitSourceRoot $SourceRoot
if ($SkipMods -and $ReplaceMods) {
	throw 'Use either -SkipMods or -ReplaceMods, not both.'
}

$targetGame = Join-Path $targetRoot 'resources\app\game'
$sourceGame = Join-Path $sourceRoot 'resources\app\game'
$stateRoot = Join-Path $targetGame 'modloader\state'
$backupRoot = Join-Path $stateRoot 'install-backups'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $backupRoot $stamp

$trackedFiles = @(
	'resources\app\main.js',
	'resources\app\game\index.html',
	'resources\app\game\scripts\game.js',
	'resources\app\game\scripts\ui.js',
	'resources\app\game\scripts\sprites.js',
	'resources\app\game\mods\enabled.json'
)

if ((Test-Path -LiteralPath (Join-Path $targetGame 'modloader\loader.js')) -and -not $Force) {
	throw 'ModLoader appears to be installed already. Re-run with -Force to reinstall after backing up current files.'
}

New-DirectoryIfMissing -Path $backupPath

$manifestFiles = @()
foreach ($relativePath in $trackedFiles) {
	$target = Join-Path $targetRoot $relativePath
	$exists = Test-Path -LiteralPath $target
	$entry = [ordered]@{
		relativePath = $relativePath
		exists = $exists
	}

	if ($exists) {
		$backupTarget = Join-Path $backupPath $relativePath
		New-DirectoryIfMissing -Path (Split-Path -Parent $backupTarget)
		Copy-Item -LiteralPath $target -Destination $backupTarget -Force
		$item = Get-Item -LiteralPath $target
		$hash = Get-FileHash -LiteralPath $target -Algorithm SHA256
		$entry.length = $item.Length
		$entry.sha256 = $hash.Hash
	}

	$manifestFiles += $entry
}

$fullModsBackup = $null
if ($ReplaceMods -and -not $SkipMods) {
	$targetModsForBackup = Join-Path $targetGame 'mods'
	if (Test-Path -LiteralPath $targetModsForBackup) {
		$fullModsBackup = 'resources\app\game\mods'
		Copy-DirectoryContents -Source $targetModsForBackup -Target (Join-Path $backupPath $fullModsBackup)
	}
}

$manifest = [ordered]@{
	createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
	backupId = $stamp
	gameRoot = $targetRoot
	sourceRoot = $sourceRoot
	files = $manifestFiles
	fullModsBackup = $fullModsBackup
}

$manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $backupPath 'install-backup.json') -Encoding UTF8
New-DirectoryIfMissing -Path $backupRoot
$stamp | Set-Content -LiteralPath (Join-Path $backupRoot 'latest-install.txt') -Encoding ASCII

try {
Copy-DirectoryContents -Source (Join-Path $sourceGame 'modloader') -Target (Join-Path $targetGame 'modloader') -ExcludeRelative @(
	'state\install-backups\latest-install.txt'
)

$patcher = Join-Path $sourceRoot 'modloader-installer\patch-source.ps1'
& powershell -NoProfile -ExecutionPolicy Bypass -File $patcher -GameRoot $targetRoot
if ($LASTEXITCODE) {
	throw "patch-source.ps1 failed with exit code $LASTEXITCODE"
}

$sourceMods = Join-Path $sourceGame 'mods'
$targetMods = Join-Path $targetGame 'mods'
if ($SkipMods) {
	Write-Host 'Keeping existing mods folder unchanged.'
} else {
	if (-not (Test-Path -LiteralPath $sourceMods)) {
		throw "Installer source mods folder missing: $sourceMods"
	}
	if ($ReplaceMods -and (Test-Path -LiteralPath $targetMods)) {
		$resolvedTargetMods = (Resolve-Path -LiteralPath $targetMods).Path.TrimEnd('\')
		$resolvedTargetGame = (Resolve-Path -LiteralPath $targetGame).Path.TrimEnd('\')
		$targetGamePrefix = $resolvedTargetGame + '\'
		if (-not $resolvedTargetMods.StartsWith($targetGamePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
			throw "Refusing to replace mods folder outside game root: $resolvedTargetMods"
		}
		Remove-Item -LiteralPath $targetMods -Recurse -Force
		Write-Host 'Replaced existing mods folder.'
	}
	New-DirectoryIfMissing -Path $targetMods
	Get-ChildItem -LiteralPath $sourceMods -Directory | ForEach-Object {
		$destination = Join-Path $targetMods $_.Name
		Copy-DirectoryContents -Source $_.FullName -Target $destination
	}

	$sourceEnabled = Join-Path $sourceMods 'enabled.json'
	$targetEnabled = Join-Path $targetMods 'enabled.json'
	if (-not (Test-Path -LiteralPath $targetEnabled)) {
		Copy-Item -LiteralPath $sourceEnabled -Destination $targetEnabled -Force
	} elseif ($ReplaceMods) {
		Copy-Item -LiteralPath $sourceEnabled -Destination $targetEnabled -Force
	} else {
		Write-Host 'Keeping existing mods\enabled.json.'
	}
}

$sourceInstaller = Join-Path $sourceRoot 'modloader-installer'
$targetInstaller = Join-Path $targetRoot 'modloader-installer'
if (Test-Path -LiteralPath $sourceInstaller) {
	Copy-DirectoryContents -Source $sourceInstaller -Target $targetInstaller
	Write-Host 'Updated modloader-installer files.'
}

$verify = Join-Path $targetGame 'modloader\tools\verify.ps1'
if (Test-Path -LiteralPath $verify) {
	& powershell -NoProfile -ExecutionPolicy Bypass -File $verify
}
} catch {
	Write-Host ""
	Write-Host "ModLoader install failed: $($_.Exception.Message)" -ForegroundColor Red
	Write-Host "Restoring backed-up core files from: $backupPath"
	Restore-InstallBackup -ManifestFiles $manifestFiles -TargetRoot $targetRoot -BackupPath $backupPath
	throw
}

Write-Host ""
Write-Host "ModLoader installed."
Write-Host "Backup id: $stamp"
Write-Host "Backup path: $backupPath"
