param([switch]$CheckInputsOnly)
. "$PSScriptRoot\common.ps1"
$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw 'Development verification incomplete: Node.js is required.' }
$requiredTools = @('render-api-v1-contract.test.js','translation-catalog-compatibility-contract.test.js','config-identifier-compatibility-contract.test.js','game-1.3-runtime-contract.test.js','ui-page-menu-scroll-contract.test.js','panel-description-display-mode-contract.test.js','panel-header-quick-toggles-contract.test.js','panel-escape-contract.test.js','panel-config-layout-contract.test.js','panel-search-recent-log-contract.test.js','settings-api-v1-contract.test.js','shortcut-api-v1-contract.test.js','tooltip-lifecycle-contract.test.js','chinese-optimization-traditional-contract.test.js','chinese-optimization-open-translation-contract.test.js','chinese-optimization-author-export-contract.test.js','snapshot-container-v1-contract.test.js','snapshot-store-v1-contract.test.js','snapshot-api-v1-contract.test.js','library-store-v1-contract.test.js','library-api-v1-contract.test.js','helpers/translation-contract-fixtures.js','fixtures/panel-translations-v0.5.0.json','fixtures/config-identifier-v0.5.0.json')
$requiredMods = @('mods\Cattail_TweaksQuality_Better-UIs\tests\verify-save-slots-service-v1.js','mods\Cattail_TweaksQuality_Better-UIs\tests\verify-shop-categories-tooltips.js','mods\Cattail_TweaksQuality_World-Editor\tests\verify-4a-2a.js','mods\Cattail_TweaksQuality_World-Editor\tests\verify-shortcut-hints.js')
foreach ($relative in $requiredTools) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $relative))) { throw "Development verification incomplete: missing tools/$relative" }
}
foreach ($relative in $requiredMods) {
    if (-not (Test-Path -LiteralPath (Join-Path $GameRoot $relative))) { throw "Development verification incomplete: missing $relative" }
}
foreach ($folder in @('Cattail_Tweaks_简体中文优化','Cattail_TweaksQuality_Better-UIs','Cattail_TweaksQuality_World-Editor')) {
    if (-not (Test-Path -LiteralPath (Join-Path $GameRoot "mods/$folder/mod.json"))) { throw "Development verification incomplete: missing $folder manifest" }
}
if ($CheckInputsOnly) { Write-Host 'Development inputs present (tests not executed).'; exit 0 }
$results = @()
$warnings = @()
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
	[ordered]@{ file = 'translation-catalog-compatibility-contract.test.js'; description = 'Optional translation catalog compatibility contract'; pattern = 'missing, old, custom, invalid and removed overrides; built-in fallbacks; no write-back' },
	[ordered]@{ file = 'config-identifier-compatibility-contract.test.js'; description = 'Config identifier compatibility contract'; pattern = 'canonical priority, legacy reads, disabled panel, preview, layout backup and retry' },
	[ordered]@{ file = 'game-1.3-runtime-contract.test.js'; description = 'Game 1.3 foundational runtime contract'; pattern = 'object save, asynchronous identity readback, early lifecycle, Store HUD' },
	[ordered]@{ file = 'ui-page-menu-scroll-contract.test.js'; description = 'UI page menu scroll contract'; pattern = 'automatic max-height, inertial wheel, ModLoader scrollbar styling' },
	[ordered]@{ file = 'panel-description-display-mode-contract.test.js'; description = 'Panel description display mode contract'; pattern = 'hover default, inline descriptions, translated settings' },
	[ordered]@{ file = 'panel-header-quick-toggles-contract.test.js'; description = 'Panel header quick toggles contract'; pattern = 'button order, sun/moon, pin states, persistence, manual edge hiding, themes, translations' },
	[ordered]@{ file = 'panel-escape-contract.test.js'; description = 'Panel Escape hierarchy contract'; pattern = 'config collapse, settings collapse, edge hiding, event interception, repeat suppression, cleanup' },
	[ordered]@{ file = 'panel-config-layout-contract.test.js'; description = 'Panel config layout sorting contract'; pattern = 'legacy migration, item order, detach and rejoin, long press, persistence, stale-schema safety' },
	[ordered]@{ file = 'panel-search-recent-log-contract.test.js'; description = 'Panel search and recent log contract'; pattern = 'localized matching, exact-prefix-substring ranking, five-result jumps, Escape ownership, persisted collapse state' },
	[ordered]@{ file = 'settings-api-v1-contract.test.js'; description = 'Settings API v1 contract'; pattern = 'registration, actions, shared renderer, typed values, validation, persistence, themes, scrolling, tooltips, cleanup' },
	[ordered]@{ file = 'shortcut-api-v1-contract.test.js'; description = 'Shortcut API v1 contract'; pattern = 'ownership, normalization, generation-safe handles, diagnostics, UI structure, documentation, and 20 languages' },
	[ordered]@{ file = 'tooltip-lifecycle-contract.test.js'; description = 'Tooltip lifecycle contract'; pattern = 'persistent pointer/focus ownership, shared portal isolation, delays, and cleanup' },
	[ordered]@{ file = 'chinese-optimization-traditional-contract.test.js'; description = 'Chinese Optimization modtch contract'; pattern = 'offline conversion, word coverage, language menus, Loader settings, source preservation' },
	[ordered]@{ file = 'chinese-optimization-open-translation-contract.test.js'; description = 'Chinese Optimization open translation contract'; pattern = '20 languages, feature detection, immediate select, Explorer reveal, default association' },
	[ordered]@{ file = 'chinese-optimization-author-export-contract.test.js'; description = 'Chinese Optimization author words export contract'; pattern = 'standalone source, complete translations, source preservation, save dialog, cancel, atomic failure, path guards' },
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
		path = 'mods\Cattail_TweaksQuality_Better-UIs\tests\verify-shop-categories-tooltips.js'
		description = 'Better UIs Shop Categories tooltip contract'
		pattern = 'localized vanilla descriptions, shared API delay, disabled-card coverage, rebuild cleanup'
	},
	[ordered]@{
		path = 'mods\Cattail_TweaksQuality_World-Editor\tests\verify-4a-2a.js'
		description = 'World Editor 4A-2a creative mode contract'
		pattern = 'save persistence, in-place identity, fork identity removal, input and full-mode gates'
	},
	[ordered]@{
		path = 'mods\Cattail_TweaksQuality_World-Editor\tests\verify-shortcut-hints.js'
		description = 'World Editor Shortcut API consumer contract'
		pattern = '16 localized functional shortcuts, dynamic contexts, feature detection, refresh, and cleanup'
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
	Write-Host "Development verification failed: $($failed.Count) issue(s)." -ForegroundColor Red
	exit 1
}

Write-Host ""
Write-Host "Development verification passed: 25 suites."
