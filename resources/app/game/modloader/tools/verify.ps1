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
	[ordered]@{ file = '..\main.js'; pattern = 'ModLoaderMainProcess.attachWindow(win)'; description = 'main process bridge support' },
	[ordered]@{ file = '..\main.js'; pattern = 'toggleDevTools'; description = 'DevTools shortcut/menu support' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'module.exports'; description = 'main process window module' },
	[ordered]@{ file = 'modloader\main-process.js'; pattern = 'applyModloaderMainProcessManifests'; description = 'main process manifest support' },
	[ordered]@{ file = 'modloader\loader.js'; pattern = 'window.ModLoader = api'; description = 'loader exports API' }
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

$renderApiContractTestPath = Join-Path $PSScriptRoot 'render-api-v1-contract.test.js'
$renderApiContractOk = $false
if (Test-Path -LiteralPath $renderApiContractTestPath) {
	& node $renderApiContractTestPath
	$renderApiContractOk = $LASTEXITCODE -eq 0
}
$results += [ordered]@{
	description = 'Render API v1 runtime contract'
	file = 'modloader\tools\render-api-v1-contract.test.js'
	pattern = 'version, capabilities, ownership, conflicts, scope restore, master switch'
	ok = $renderApiContractOk
}

$warnings = @()
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
