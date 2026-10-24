param(
	[string]$GameRoot,
	[string]$SourceRoot,
	[switch]$Force,
	[switch]$SkipMods,
	[switch]$ReplaceMods,
	[switch]$FullVerification
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

try {
	$script:installerAnimationEnabled = -not [Console]::IsOutputRedirected
} catch {
	$script:installerAnimationEnabled = $false
}
$script:installerSpinnerFrames = @('|', '/', '-', '\')
$script:installerSpinnerIndex = 0
$script:installerActivityWidth = 0
$script:installerActivityActive = $false
$script:installerLastFrameAt = [DateTime]::MinValue

function Write-InstallerActivityFrame {
	param(
		[string]$Message,
		[switch]$Force
	)

	if (-not $script:installerActivityActive -or -not $script:installerAnimationEnabled) { return }
	$now = [DateTime]::UtcNow
	if (-not $Force -and ($now - $script:installerLastFrameAt).TotalMilliseconds -lt 80) { return }
	$frame = $script:installerSpinnerFrames[$script:installerSpinnerIndex % $script:installerSpinnerFrames.Count]
	$script:installerSpinnerIndex++
	$script:installerLastFrameAt = $now
	$text = "$frame $Message"
	$padding = ' ' * [Math]::Max(0, $script:installerActivityWidth - $text.Length)
	[Console]::Write("`r$text$padding")
	$script:installerActivityWidth = [Math]::Max($script:installerActivityWidth, $text.Length)
}

function Start-InstallerActivity {
	param([string]$Message)

	$script:installerSpinnerIndex = 0
	$script:installerActivityWidth = 0
	$script:installerActivityActive = $true
	$script:installerLastFrameAt = [DateTime]::MinValue
	if ($script:installerAnimationEnabled) {
		Write-InstallerActivityFrame -Message $Message -Force
	} else {
		Write-Host $Message
	}
}

function Update-InstallerActivity {
	param([string]$Message)

	Write-InstallerActivityFrame -Message $Message
}

function Complete-InstallerActivity {
	param([string]$Message)

	if (-not $script:installerActivityActive) { return }
	if ($script:installerAnimationEnabled) {
		$text = "[OK] $Message"
		$padding = ' ' * [Math]::Max(0, $script:installerActivityWidth - $text.Length)
		[Console]::Write("`r$text$padding")
		[Console]::WriteLine()
	}
	$script:installerActivityActive = $false
	$script:installerActivityWidth = 0
}

function Stop-InstallerActivity {
	param([string]$Message = 'Installation step stopped.')

	if (-not $script:installerActivityActive) { return }
	if ($script:installerAnimationEnabled) {
		$text = "[!] $Message"
		$padding = ' ' * [Math]::Max(0, $script:installerActivityWidth - $text.Length)
		[Console]::Write("`r$text$padding")
		[Console]::WriteLine()
	}
	$script:installerActivityActive = $false
	$script:installerActivityWidth = 0
}


function Copy-DirectoryContents {
	param(
		[string]$Source,
		[string]$Target,
		[string[]]$ExcludeRelative = @(),
		[string]$ActivityLabel
	)

	New-DirectoryIfMissing -Path $Target
	$sourceRoot = (Resolve-Path -LiteralPath $Source).Path
	$exclude = @{}
	foreach ($item in $ExcludeRelative) {
		$exclude[$item.ToLowerInvariant()] = $true
	}

	if ($ActivityLabel) { Start-InstallerActivity -Message "${ActivityLabel}: scanning files..." }
	$files = @(Get-ChildItem -LiteralPath $Source -Recurse -File)
	$index = 0
	$copiedCount = 0
	try {
		foreach ($file in $files) {
			$index++
			if ($ActivityLabel) { Update-InstallerActivity -Message "$ActivityLabel ($index/$($files.Count) checked; $copiedCount copied)" }
			$relative = $file.FullName.Substring($sourceRoot.Length).TrimStart('\')
			if ($exclude[$relative.ToLowerInvariant()]) { continue }
			$excludedByPrefix = $false
			foreach ($prefix in $ExcludeRelative) {
				if ($prefix.EndsWith('\') -and $relative.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
					$excludedByPrefix = $true
					break
				}
			}
			if ($excludedByPrefix) { continue }

			$destination = Join-Path $Target $relative
			$resolvedDestination = Resolve-Path -LiteralPath $destination -ErrorAction SilentlyContinue
			if ($resolvedDestination -and $resolvedDestination.Path -eq $file.FullName) { continue }
			New-DirectoryIfMissing -Path (Split-Path -Parent $destination)
			Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
			$copiedCount++
		}
	} catch {
		Stop-InstallerActivity
		throw
	}
	if ($ActivityLabel) { Complete-InstallerActivity -Message "$ActivityLabel complete ($copiedCount files copied)." }
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
$patcher = Join-Path $sourceRoot 'modloader-installer\patch-source.ps1'
# Complete the source plan before creating backups, copying runtime files, or replacing mods.
& powershell -NoProfile -ExecutionPolicy Bypass -File $patcher -GameRoot $targetRoot -CheckOnly
if ($LASTEXITCODE) { throw "ModLoader 1.3 preflight failed (exit $LASTEXITCODE); target was not changed." }
Start-InstallerActivity -Message 'Preparing installation file list...'
$stateRoot = Join-Path $targetGame 'modloader\state'
$backupRoot = Join-Path $stateRoot 'install-backups'
$stamp = (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
$backupPath = Join-Path $backupRoot $stamp

$trackedFiles = @(
	'resources\app\main.js',
	'resources\app\game\index.html',
	'resources\app\game\scripts\game.js',
	'resources\app\game\scripts\ui.js',
	'resources\app\game\scripts\sprites.js',
	'resources\app\game\mods\enabled.json'
)
$uninstallFiles = $trackedFiles.Clone()
# Back up every file the installer can overwrite, not just the five game hooks.
$copyRoots = @('resources\app\game\modloader', 'modloader-installer')
if (-not $SkipMods) { $copyRoots += 'resources\app\game\mods' }
try {
	$scannedFileCount = 0
	foreach ($relativeRoot in $copyRoots) {
		$copySource = Join-Path $sourceRoot $relativeRoot
		Get-ChildItem -LiteralPath $copySource -Recurse -File -Force | ForEach-Object {
			$scannedFileCount++
			Update-InstallerActivity -Message "Preparing installation file list ($scannedFileCount checked; $($trackedFiles.Count) selected)..."
			$relative = $_.FullName.Substring($sourceRoot.Length).TrimStart('\')
			if ($relative -like 'resources\app\game\modloader\state\*' -or $relative -like 'resources\app\game\modloader\backups\*') { return }
			$trackedFiles += $relative
		}
	}
	$trackedFiles = @($trackedFiles | Select-Object -Unique)
} catch {
	Stop-InstallerActivity
	throw
}
Complete-InstallerActivity -Message "Installation file list ready ($($trackedFiles.Count) files)."

if ((Test-Path -LiteralPath (Join-Path $targetGame 'modloader\loader.js')) -and -not $Force) {
	throw 'ModLoader appears to be installed already. Re-run with -Force to reinstall after backing up current files.'
}

New-DirectoryIfMissing -Path $backupPath

$manifestFiles = @()
$trackedIndex = 0
Start-InstallerActivity -Message "Checking and backing up files (0/$($trackedFiles.Count))..."
try {
	foreach ($relativePath in $trackedFiles) {
		$trackedIndex++
		Update-InstallerActivity -Message "Checking and backing up files ($trackedIndex/$($trackedFiles.Count))..."
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
} catch {
	Stop-InstallerActivity
	throw
}
Complete-InstallerActivity -Message "Backup check complete ($($trackedFiles.Count) files)."

$fullModsBackup = $null
if ($ReplaceMods -and -not $SkipMods) {
	$targetModsForBackup = Join-Path $targetGame 'mods'
	if (Test-Path -LiteralPath $targetModsForBackup) {
		$fullModsBackup = 'resources\app\game\mods'
		Copy-DirectoryContents -Source $targetModsForBackup -Target (Join-Path $backupPath $fullModsBackup) -ActivityLabel 'Backing up the existing Mods folder'
	}
}

$manifest = [ordered]@{
	createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
	backupId = $stamp
	gameRoot = $targetRoot
	sourceRoot = $sourceRoot
	# Keep ordinary uninstall limited to the established core/enabled list.
	# Installation failure recovery additionally restores every overwritten file.
	files = @($manifestFiles | Where-Object { $_.relativePath -in $uninstallFiles })
	rollbackFiles = $manifestFiles
	fullModsBackup = $fullModsBackup
}

$manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $backupPath 'install-backup.json') -Encoding UTF8
New-DirectoryIfMissing -Path $backupRoot
$stamp | Set-Content -LiteralPath (Join-Path $backupRoot 'latest-install.txt') -Encoding ASCII

try {
Copy-DirectoryContents -Source (Join-Path $sourceGame 'modloader') -Target (Join-Path $targetGame 'modloader') -ExcludeRelative @(
	'state\', 'backups\'
) -ActivityLabel 'Copying ModLoader files'

$patcher = Join-Path $sourceRoot 'modloader-installer\patch-source.ps1'
Write-Host 'Patching game files...'
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
		Copy-DirectoryContents -Source $_.FullName -Target $destination -ActivityLabel "Copying Mod files: $($_.Name)"
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
	Copy-DirectoryContents -Source $sourceInstaller -Target $targetInstaller -ActivityLabel 'Copying installer files'
	Write-Host 'Updated modloader-installer files.'
}

$verify = Join-Path $targetGame 'modloader\tools\verify.ps1'
if (Test-Path -LiteralPath $verify) {
	Write-Host 'Running installed Loader verification...'
	if ($FullVerification) { & powershell -NoProfile -ExecutionPolicy Bypass -File $verify }
	else { & powershell -NoProfile -ExecutionPolicy Bypass -File $verify -LoaderOnly }
	if ($LASTEXITCODE) { throw "Installed verification failed (exit $LASTEXITCODE)." }
} else {
	throw 'Installed verification tool is missing.'
}
} catch {
	Stop-InstallerActivity
	Write-Host ""
	Write-Host "ModLoader install failed: $($_.Exception.Message)" -ForegroundColor Red
	Write-Host "Restoring backed-up core files from: $backupPath"
	Restore-InstallBackup -ManifestFiles $manifestFiles -TargetRoot $targetRoot -BackupPath $backupPath
	if ($fullModsBackup) {
		# Recreate all pre-existing files removed by -ReplaceMods. Each destination
		# is an original backup entry underneath the explicit game directory.
		Copy-DirectoryContents -Source (Join-Path $backupPath $fullModsBackup) -Target (Join-Path $targetRoot $fullModsBackup)
	}
	throw
}

Write-Host ""
Write-Host "ModLoader installed."
Write-Host "Backup id: $stamp"
Write-Host "Backup path: $backupPath"
