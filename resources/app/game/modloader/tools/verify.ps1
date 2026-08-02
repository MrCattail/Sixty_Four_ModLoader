. "$PSScriptRoot\common.ps1"

$checks = @(
	[ordered]@{ file = 'index.html'; pattern = 'modloader/loader.js'; description = 'index loads ModLoader' },
	[ordered]@{ file = 'scripts\game.js'; pattern = 'ModLoader?.stage(`beforeVanillaScripts`'; description = 'game beforeVanillaScripts hook' },
	[ordered]@{ file = 'scripts\game.js'; pattern = 'ModLoader?.applyData'; description = 'game data hook' },
	[ordered]@{ file = 'scripts\game.js'; pattern = 'ModLoader?.applyWords'; description = 'game words hook' },
	[ordered]@{ file = 'scripts\game.js'; pattern = 'ModLoader?.applySave'; description = 'game save hook' },
	[ordered]@{ file = 'scripts\game.js'; pattern = 'ModLoader?.applySoundList'; description = 'audio sample hook' },
	[ordered]@{ file = 'scripts\sprites.js'; pattern = 'ModLoader?.resolveAsset'; description = 'sprite asset hook' },
	[ordered]@{ file = 'scripts\ui.js'; pattern = 'ModLoader?.resolveAsset'; description = 'shop icon asset hook' },
	[ordered]@{ file = '..\main.js'; pattern = 'ModLoaderMainProcess.attachWindow(win, { accountId: STEAMID })'; description = 'main process bridge and trusted account scope' },
	[ordered]@{ file = '..\main.js'; pattern = 'ModLoaderMainProcess.clearSnapshotContext(e.sender)'; description = 'reset clears active snapshot context' },
	[ordered]@{ file = '..\main.js'; pattern = 'toggleDevTools'; description = 'DevTools shortcut/menu support' },
	[ordered]@{ file = '..\main.js'; pattern = 'modloader:toggle-devtools'; description = 'DevTools menu button IPC support' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'module.exports'; description = 'main process window module' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'applyModloaderMainProcessManifests'; description = 'main process manifest support' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'modloader:snapshots:activate'; description = 'snapshot save-context IPC support' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'modloader:snapshots:runtime'; description = 'snapshot runtime IPC support' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'modloader:snapshots:admin'; description = 'snapshot administration IPC support' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'modloader:libraries:runtime'; description = 'Library API 1.1 main-process IPC support' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'collectLibraryDeclarations'; description = 'manifest-declared library discovery' },
	[ordered]@{ file = 'modloader\loader.js'; pattern = 'window.ModLoader = api'; description = 'loader exports API' },
	[ordered]@{ file = 'modloader\loader.js'; pattern = "version: '0.3.1'"; description = 'ModLoader 0.3.1 runtime version' },
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

$renderApiContractTestPath = Join-Path $PSScriptRoot 'render-api-v1-contract.test.js'
if (Test-Path -LiteralPath $renderApiContractTestPath) {
	if ($nodeCommand) {
		& $nodeCommand.Source $renderApiContractTestPath
		$results += [ordered]@{
			description = 'Render API v1 runtime contract'
			file = 'modloader\tools\render-api-v1-contract.test.js'
			pattern = 'version, capabilities, ownership, conflicts, scope restore, master switch'
			ok = $LASTEXITCODE -eq 0
		}
	} else {
		$warnings += 'Node.js is not available; skipped Render API v1 runtime contract check.'
	}
}

$snapshotContractTests = @(
	[ordered]@{ file = 'snapshot-container-v1-contract.test.js'; description = 'Snapshot export container v1 contract'; pattern = 'binary framing, metadata, checksum, corruption rejection' },
	[ordered]@{ file = 'snapshot-store-v1-contract.test.js'; description = 'Snapshot store v1 contract'; pattern = 'validation, isolation, queueing, rotation, quarantine, cleanup' },
	[ordered]@{ file = 'snapshot-api-v1-contract.test.js'; description = 'Storage Snapshot API v1 runtime contract'; pattern = 'bound Mod API, data types, safe errors, save identity, admin UI boundary' },
	[ordered]@{ file = 'library-store-v1-contract.test.js'; description = 'Library store v1 contract'; pattern = 'declarations, path isolation, atomic writes, revision conflicts, trash, quarantine, cache, watcher' },
	[ordered]@{ file = 'library-api-v1-contract.test.js'; description = 'Library API 1.1 runtime contract'; pattern = 'bound named handle, safe dialogs, no path leakage, declared extensions, size and symlink rejection, atomic revision-matched export' }
)
foreach ($contract in $snapshotContractTests) {
	$contractPath = Join-Path $PSScriptRoot $contract.file
	if (-not (Test-Path -LiteralPath $contractPath)) {
		$results += [ordered]@{
			description = $contract.description
			file = "modloader\tools\$($contract.file)"
			pattern = 'file exists'
			ok = $false
		}
		continue
	}
	if ($nodeCommand) {
		& $nodeCommand.Source $contractPath
		$results += [ordered]@{
			description = $contract.description
			file = "modloader\tools\$($contract.file)"
			pattern = $contract.pattern
			ok = $LASTEXITCODE -eq 0
		}
	} else {
		$warnings += "Node.js is not available; skipped $($contract.description)."
	}
}

$modFeatureContractTests = @(
	[ordered]@{
		path = 'mods\Cattail_TweaksQuality_Better-UIs\tests\verify-save-slots-service-v1.js'
		description = 'Better UIs Save Slots Service v1 contract'
		pattern = 'atomic batch creation, activation rollback, lineage finalization, name conflict'
	},
	[ordered]@{
		path = 'mods\Cattail_TweaksQuality_World-Editor\tests\verify-4a-2a.js'
		description = 'World Editor 4A-2a creative mode contract'
		pattern = 'save persistence, in-place identity, fork identity removal, input and full-mode gates'
	}
)
foreach ($contract in $modFeatureContractTests) {
	$contractPath = Join-Path $GameRoot $contract.path
	if (-not (Test-Path -LiteralPath $contractPath)) {
		$results += [ordered]@{
			description = $contract.description
			file = $contract.path
			pattern = 'file exists'
			ok = $false
		}
		continue
	}
	if ($nodeCommand) {
		& $nodeCommand.Source $contractPath
		$results += [ordered]@{
			description = $contract.description
			file = $contract.path
			pattern = $contract.pattern
			ok = $LASTEXITCODE -eq 0
		}
	} else {
		$warnings += "Node.js is not available; skipped $($contract.description)."
	}
}

$enabledNames = @()
$enabledPath = Join-Path $GameRoot 'mods\enabled.json'
try {
    $enabledConfig = Get-Content -LiteralPath $enabledPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $enabledNames = @($enabledConfig.mods | ForEach-Object { [string]$_ })
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

$optimizedChineseFolder = -join @('Cattail_Tweaks_', [char]0x7b80, [char]0x4f53, [char]0x4e2d, [char]0x6587, [char]0x4f18, [char]0x5316)
$optimizedChineseRoot = Join-Path $GameRoot (Join-Path 'mods' $optimizedChineseFolder)
if (Test-Path -LiteralPath $optimizedChineseRoot) {
    if ($enabledNames -notcontains $optimizedChineseFolder) {
        $warnings += 'Optimized Simplified Chinese locale is installed but disabled; enable it in Ctrl+M and Save & Reload before selecting Simplified Chinese [optimized].'
    } else {
        try {
            $manifest = Get-Content -LiteralPath (Join-Path $optimizedChineseRoot 'mod.json') -Raw -Encoding UTF8 | ConvertFrom-Json
            $hasLanguage = @($manifest.languages) -contains 'modsch'
            $results += [ordered]@{
                description = 'optimized Chinese locale declares modsch'
                file = 'mods\<optimized Chinese>\mod.json'
                pattern = 'languages includes modsch'
                ok = $hasLanguage
            }
        } catch {
            $results += [ordered]@{
                description = 'optimized Chinese locale manifest parses'
                file = 'mods\<optimized Chinese>\mod.json'
                pattern = 'valid JSON'
                ok = $false
            }
        }

        try {
            $locale = Get-Content -LiteralPath (Join-Path $optimizedChineseRoot 'locale\modsch.json') -Raw -Encoding UTF8 | ConvertFrom-Json
            $hasWords = $null -ne $locale.modsch -and $null -ne $locale.modsch.splash -and $null -ne $locale.modsch.splash.language
            $results += [ordered]@{
                description = 'optimized Chinese locale words load'
                file = 'mods\<optimized Chinese>\locale\modsch.json'
                pattern = 'modsch.splash.language'
                ok = $hasWords
            }
        } catch {
            $results += [ordered]@{
                description = 'optimized Chinese locale words load'
                file = 'mods\<optimized Chinese>\locale\modsch.json'
                pattern = 'valid JSON with modsch words'
                ok = $false
            }
        }
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
Write-Host "Verification passed."
