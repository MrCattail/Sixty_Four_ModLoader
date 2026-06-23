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
	[ordered]@{ file = '..\main.js'; pattern = 'toggleDevTools'; description = 'DevTools shortcut/menu support' },
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

$failed = @($results | Where-Object { -not $_.ok })
foreach ($result in $results) {
	$status = if ($result.ok) { 'OK' } else { 'FAIL' }
	Write-Host "[$status] $($result.description)"
}

if ($failed.Count) {
	Write-Host ""
	Write-Host "Verification failed: $($failed.Count) issue(s)." -ForegroundColor Red
	exit 1
}

Write-Host ""
Write-Host "Verification passed."
