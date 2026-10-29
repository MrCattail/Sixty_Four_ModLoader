param(
	[string]$GameRoot,
	[string]$BackupId,
	[switch]$ConfirmUninstall,
	[switch]$RemoveModloaderFiles
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'filesystem.ps1')

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

function New-DirectoryIfMissing {
	param([string]$Path)

	New-InstallerDirectory $Path
}

if (-not $ConfirmUninstall) {
	throw 'Uninstall is disabled unless -ConfirmUninstall is supplied.'
}

$targetRoot = Resolve-GameRoot -Path $GameRoot
$targetGame = Join-Path $targetRoot 'resources\app\game'
$backupRoot = Join-Path $targetGame 'modloader\state\install-backups'

if (-not $BackupId) {
	$latestPath = Join-Path $backupRoot 'latest-install.txt'
	if (Test-Path -LiteralPath $latestPath) {
		$BackupId = (Get-Content -LiteralPath $latestPath -Raw).Trim()
	}
}

if (-not $BackupId) {
	throw 'No BackupId was provided and no latest install backup exists.'
}

$backupPath = Join-Path $backupRoot $BackupId
$manifestPath = Join-Path $backupPath 'install-backup.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
	throw "Install backup manifest not found: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
foreach ($file in $manifest.files) {
	$target = Join-Path $targetRoot $file.relativePath
	if ($file.exists) {
		$source = Join-Path $backupPath $file.relativePath
		if (-not (Test-InstallerPath $source)) {
			throw "Backup file missing: $source"
		}
		New-DirectoryIfMissing -Path (Split-Path -Parent $target)
		Copy-InstallerFile $source $target
		Write-Host "Restored $($file.relativePath)"
	} elseif (Test-InstallerPath $target) {
		Remove-InstallerFile $target
		Write-Host "Removed installed file $($file.relativePath)"
	}
}

if ($RemoveModloaderFiles) {
	$modloaderPath = Join-Path $targetGame 'modloader'
	if (Test-Path -LiteralPath $modloaderPath) {
		$cleanupPath = Assert-InstallerChildPath $targetGame $modloaderPath
		Remove-InstallerDirectory $cleanupPath
		Write-Host "Removed $modloaderPath"
	}
}

Write-Host ""
Write-Host "ModLoader uninstalled from backup: $BackupId"
Write-Host "Mods folder was left in place unless files were part of the backup restore."
