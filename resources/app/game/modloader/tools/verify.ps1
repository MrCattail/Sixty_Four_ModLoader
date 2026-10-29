param([switch]$LoaderOnly, [string]$ExpectedVersion)
. "$PSScriptRoot\common.ps1"
if ($LoaderOnly) { Write-Host "Legacy -LoaderOnly: installation checks only; feature suites moved to verify-development.ps1." }
if (-not $ExpectedVersion) { $ExpectedVersion = $env:MODLOADER_EXPECTED_VERSION }

$checks = @(
	[ordered]@{ file = 'index.html'; pattern = 'modloader/loader.js'; description = 'index loads ModLoader' },
	[ordered]@{ file = 'scripts\game.js'; pattern = 'ModLoader?.stage(`beforeVanillaScripts`'; description = 'game beforeVanillaScripts hook' },
	[ordered]@{ file = 'scripts\game.js'; pattern = 'ModLoader?.stage(`beforeGamePrepare`'; description = 'game early 1.3 preparation hook' },
	[ordered]@{ file = 'scripts\game.js'; pattern = 'return window.ModLoader?.applySave(saveState, this) || saveState'; description = '1.3 object save contract' },
	[ordered]@{ file = 'scripts\game.js'; pattern = 'ModLoader?.applyData'; description = 'game data hook' },
	[ordered]@{ file = 'scripts\game.js'; pattern = 'ModLoader?.applyWords'; description = 'game words hook' },
	[ordered]@{ file = 'scripts\game.js'; pattern = 'ModLoader?.applySave'; description = 'game save hook' },
	[ordered]@{ file = 'scripts\game.js'; pattern = 'ModLoader?.applySoundList'; description = 'audio sample hook' },
	[ordered]@{ file = 'scripts\sprites.js'; pattern = 'ModLoader?.resolveAsset'; description = 'sprite asset hook' },
	[ordered]@{ file = 'scripts\ui.js'; pattern = 'ModLoader?.resolveAsset(e.shopImage'; description = 'active 1.3 Store icon asset hook' },
	[ordered]@{ file = '..\main.js'; pattern = 'ModLoaderMainProcess.attachWindow(win, { accountId: STEAMID })'; description = 'main process bridge and trusted account scope' },
	[ordered]@{ file = '..\main.js'; pattern = 'ModLoaderMainProcess.getMainWindowOptions'; description = 'main window before-create options hook' },
	[ordered]@{ file = '..\main.js'; pattern = 'ModLoaderMainProcess.afterMainWindowCreated(win)'; description = 'main window after-create hook' },
	[ordered]@{ file = '..\main.js'; pattern = 'ModLoaderMainProcess.clearSnapshotContext(e.sender)'; description = 'reset clears active snapshot context' },
	[ordered]@{ file = '..\main.js'; pattern = 'toggleDevTools'; description = 'DevTools shortcut/menu support' },
	[ordered]@{ file = '..\main.js'; pattern = 'modloader:toggle-devtools'; description = 'DevTools menu button IPC support' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'module.exports'; description = 'main process window module' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'applyModloaderMainProcessManifests'; description = 'main process manifest support' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'getMainWindowOptions'; description = 'main window options hook implementation' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'afterMainWindowCreated'; description = 'main window after-create hook implementation' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'modloader:snapshots:activate'; description = 'snapshot save-context IPC support' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'modloader:snapshots:runtime'; description = 'snapshot runtime IPC support' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'modloader:snapshots:admin'; description = 'snapshot administration IPC support' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'modloader:libraries:runtime'; description = 'Library API 1.1 main-process IPC support' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'collectLibraryDeclarations'; description = 'manifest-declared library discovery' },
	[ordered]@{ file = 'modloader\loader.js'; pattern = 'window.ModLoader = api'; description = 'loader exports API' },
	[ordered]@{ file = 'modloader\loader.js'; pattern = 'const SHORTCUT_API_VERSION = 1'; description = 'Mod Keyboard Shortcut API v1 support' },
	[ordered]@{ file = 'modloader\loader.js'; pattern = "const SNAPSHOT_API_VERSION = '1.0.0'"; description = 'Storage Snapshot API v1 support' },
	[ordered]@{ file = 'modloader\loader.js'; pattern = "const LIBRARY_API_VERSION = '1.1.0'"; description = 'Library API 1.1 renderer support' },
	[ordered]@{ file = 'modloader\loader.js'; pattern = 'modloader.saveInstanceId = saveInstanceId'; description = 'snapshot save-lineage identity support' },
	[ordered]@{ file = 'modloader\loader.js'; pattern = 'const renderSnapshotPanelPage'; description = 'snapshot management subpage support' }
)

$results = @()
foreach ($check in $checks) {
	$path = Join-Path $GameRoot $check.file
	$exists = Test-Path -LiteralPath $path
	$ok = $false
	if ($exists) {
		$text = Get-Content -LiteralPath $path -Raw
		$ok = $text.Contains($check.pattern)
	}

	$results += [ordered]@{
		description = $check.description
		file = $check.file
		pattern = $check.pattern
		ok = $ok
	}
}

$gameScriptPath = Join-Path $GameRoot 'scripts\game.js'
$languageChangeHookOk = $false
if (Test-Path -LiteralPath $gameScriptPath) {
    $gameScriptText = Get-Content -LiteralPath $gameScriptPath -Raw -Encoding UTF8
    $languageChangePattern = 'changeLanguage\(id\)\{[\s\S]*?ModLoader\?\.applyWords[\s\S]*?if \(!words\[this\.language\]\)[\s\S]*?this\.words_en = words\.en'
    $languageChangeHookOk = [regex]::IsMatch($gameScriptText, $languageChangePattern)
}
$results += [ordered]@{
    description = 'game language-change words hook'
    file = 'scripts\game.js'
    pattern = 'changeLanguage applies ModLoader words with fallback'
    ok = $languageChangeHookOk
}

$warnings = @()
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue

$mainJsPath = Join-Path $GameRoot '..\main.js'
if (Test-Path -LiteralPath $mainJsPath) {
	if ($nodeCommand) {
		& $nodeCommand.Source --check $mainJsPath
		$results += [ordered]@{
			description = 'main process JavaScript syntax'
			file = '..\main.js'
			pattern = 'node --check'
			ok = $LASTEXITCODE -eq 0
		}
	} else {
		$warnings += 'Node.js is not available; skipped main process JavaScript syntax check.'
	}
}

$modloaderJavaScriptFiles = @(
	'modloader\loader.js',
	'modloader\main-process.js',
	'modloader\library-store.js',
	'modloader\snapshot-container.js',
	'modloader\snapshot-store.js'
)
foreach ($relativePath in $modloaderJavaScriptFiles) {
	$javaScriptPath = Join-Path $GameRoot $relativePath
	if (-not (Test-Path -LiteralPath $javaScriptPath)) {
		$results += [ordered]@{
			description = "$relativePath JavaScript syntax"
			file = $relativePath
			pattern = 'file exists'
			ok = $false
		}
		continue
	}
	if ($nodeCommand) {
		& $nodeCommand.Source --check $javaScriptPath
		$results += [ordered]@{
			description = "$relativePath JavaScript syntax"
			file = $relativePath
			pattern = 'node --check'
			ok = $LASTEXITCODE -eq 0
		}
	} else {
		$warnings += "Node.js is not available; skipped $relativePath JavaScript syntax check."
	}
}

$loaderPath = Join-Path $GameRoot 'modloader/loader.js'
$loaderText = Get-Content -LiteralPath $loaderPath -Raw -Encoding UTF8
$actualVersion = if ($loaderText -match 'version\s*:\s*[''"]([^''"]+)[''"]') { $Matches[1] } else { '' }
if (-not $ExpectedVersion) {
    $packagePath = Join-Path $GameRoot '../../../modloader-installer/modloader-package.json'
    if (Test-Path -LiteralPath $packagePath) { $ExpectedVersion = (Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json).version }
}
$results += @{ description = 'Loader version matches source/package'; ok = ([bool]$actualVersion -and (-not $ExpectedVersion -or $actualVersion -ceq $ExpectedVersion)) }
if (-not $ExpectedVersion) { $warnings += 'Expected package version unavailable; consistency not checked.' }
$enabledNames = @()
$enabledPath = Join-Path $GameRoot 'mods\enabled.json'
try {
    $enabledConfig = Get-Content -LiteralPath $enabledPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -eq $enabledConfig.mods -or $enabledConfig.mods -isnot [System.Array] -or @($enabledConfig.mods | Where-Object { $_ -isnot [string] }).Count) { throw 'enabled.json mods must be an array of strings' }
    $enabledNames = @($enabledConfig.mods)
    $results += [ordered]@{
        description = 'mods enabled.json parses'
        file = 'mods\enabled.json'
        pattern = 'valid JSON'
        ok = $true
    }
} catch {
    $results += [ordered]@{
        description = 'mods enabled.json parses'
        file = 'mods\enabled.json'
        pattern = 'valid JSON'
        ok = $false
    }
}

$failed = @($results | Where-Object { -not $_.ok })
foreach ($result in $results) {
	$status = if ($result.ok) { 'OK' } else { 'FAIL' }
	Write-Host "[$status] $($result.description)"
}

foreach ($warning in $warnings) {
    Write-Host "[WARN] $warning" -ForegroundColor Yellow
}

if ($failed.Count) {
	Write-Host ""
	Write-Host "Verification failed: $($failed.Count) issue(s)." -ForegroundColor Red
	exit 1
}

Write-Host ""
Write-Host "Installation checks passed (not functional or player acceptance)."
