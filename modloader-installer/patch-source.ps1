param(
	[string]$GameRoot,
	[switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$script:PendingWrites = @()

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

function Convert-ToLf {
	param([string]$Text)
	return $Text -replace "`r`n", "`n" -replace "`r", "`n"
}

function Read-TextFile {
	param([string]$Path)
	return Convert-ToLf ([System.IO.File]::ReadAllText($Path))
}

function Write-TextFile {
	param(
		[string]$Path,
		[string]$Text
	)
	[System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($false))
}

function Apply-Required {
	param(
		[string]$Text,
		[string]$Old,
		[string]$New,
		[string]$Description
	)

	if ([regex]::Matches($Text, [regex]::Escape($Old)).Count -ne 1) {
		throw "Could not patch $Description uniquely. The game file may have changed or was edited by another tool."
	}
	return $Text.Replace($Old, $New)
}

function Apply-Optional {
	param(
		[string]$Text,
		[string]$Old,
		[string]$New
	)

	if ($Text.Contains($Old)) {
		return $Text.Replace($Old, $New)
	}
	return $Text
}

function Insert-BeforeStandaloneLine {
	param(
		[string]$Text,
		[string]$Line,
		[string]$Insertion,
		[string]$Description
	)

	$pattern = '(?m)^' + [regex]::Escape($Line) + '$'
	$lineMatches = [regex]::Matches($Text, $pattern)
	if ($lineMatches.Count -ne 1) {
		throw "Could not patch $Description. The game file may have changed or was edited by another tool."
	}
	$match = $lineMatches[0]
	return $Text.Insert($match.Index, $Insertion)
}

function Update-TextFile {
	param(
		[string]$RelativePath,
		[scriptblock]$Patch
	)

	$path = Join-Path $script:TargetRoot $RelativePath
	if (-not (Test-Path -LiteralPath $path)) {
		throw "Missing file to patch: $RelativePath"
	}

	$before = Read-TextFile -Path $path
	$after = & $Patch $before
	if ($after -ne $before) {
		$script:PendingWrites += [pscustomobject]@{ Path=$path; Text=$after; Before=[IO.File]::ReadAllBytes($path) }
		Write-Host "Planned $RelativePath"
	} else {
		Write-Host "Already patched $RelativePath"
	}
}
function Assert-Contains {
	param(
		[string]$RelativePath,
		[string]$Pattern,
		[string]$Description
	)

	$path = Join-Path $script:TargetRoot $RelativePath
	$pending = @($script:PendingWrites | Where-Object { $_.Path -eq $path })
	if ($pending.Count) {
		$text = $pending[0].Text
	} else {
		if (-not (Test-Path -LiteralPath $path)) {
			if ($RelativePath -notlike 'resources\app\game\modloader\*') { throw "Missing $RelativePath" }
			$path = Join-Path (Split-Path -Parent $PSScriptRoot) $RelativePath
		}
		$text = Read-TextFile -Path $path
	}
	if (-not $text.Contains($Pattern)) {
		throw "Patch verification failed: missing $Description in $RelativePath"
	}
}

function Patch-IndexHtml {
	param([string]$Text)

	if ($Text.Contains('modloader/loader.js')) {
		return $Text
	}

	$pattern = '(<script\s+type="text/javascript"\s+src="scripts/game\.js[^"]*"></script>)'
	if (-not [regex]::IsMatch($Text, $pattern)) {
		throw 'Could not patch index.html. Missing scripts/game.js script tag.'
	}

	$replacement = '$1' + "`n        <script type=`"text/javascript`" src=`"modloader/loader.js?v=1`"></script>"
	return [regex]::Replace($Text, $pattern, $replacement, 1)
}

function Patch-GameJs {
	param([string]$Text)

	if (-not $Text.Contains('ModLoader?.stage(`beforeGamePrepare`')) {
		$Text = Apply-Required $Text "`t`tawait this.prepareSavedGameData(preload)" "`t`tpreload = await window.ModLoader?.stage(``beforeGamePrepare``, this, preload) ?? preload`n`t`tawait this.prepareSavedGameData(preload)" 'early preparation lifecycle'
	}
	if (-not $Text.Contains('ModLoader?.stage(`beforeVanillaScripts`')) {
		$loadScriptsPattern = '(?m)^(\t+)await this\.loadScripts\(\)\n(\t+await this\.loadStyle\(`cascade\.css`\)\n)'
		if (-not [regex]::IsMatch($Text, $loadScriptsPattern)) {
			throw 'Could not patch vanilla script stage hooks. The game file may have changed or was edited by another tool.'
		}
        $Text = [regex]::Replace($Text, $loadScriptsPattern, {
            param($match)
            $indent = $match.Groups[1].Value
            $indent + "await window.ModLoader?.stage(``beforeVanillaScripts``, this)`n" +
                $indent + "await this.loadScripts()`n" +
                $indent + "await window.ModLoader?.stage(``afterVanillaScripts``, this)`n" +
                $match.Groups[2].Value
        })
	}

	if (-not $Text.Contains('ModLoader?.applyData')) {
		$oldDataPattern = '(?m)^\t\tthis\.codex = abstract_getCodex\(\)\n\t\tthis\.images = this\.preloadImages\(\)\n\t\tconst words = abstract_getWords\(\)\n\t\tthis\.words = words\[this\.language\]\n(?:\t\tthis\.words_en = words\.en\n)?'
		$newData = @'
        this.languages = window.ModLoader?.applyLanguages(this.languages) || this.languages
        if (!this.languages[this.languageId]) this.languageId = 0
        this.language = this.languages[this.languageId]

        const vanillaCodex = abstract_getCodex()
        this.codex = window.ModLoader?.applyData(vanillaCodex, this) || vanillaCodex
        this.images = this.preloadImages()
        const vanillaWords = abstract_getWords()
        const words = window.ModLoader?.applyWords(vanillaWords, this) || vanillaWords
        if (!words[this.language]) {
            this.languageId = 0
            this.language = this.languages[this.languageId] || `en`
        }
        this.words = words[this.language]
        this.words_en = words.en
'@
		# The October 2026 build awaits images before selecting the language.
		# Patch its two separate consumers without moving or repeating preload.
		$splitDataPattern = '(?m)^\t\tthis\.codex = abstract_getCodex\(\)\n\t\tthis\.images = await this\.preloadImages\(\)\n'
		$splitWordsPattern = '(?m)^\t\tconst words = abstract_getWords\(\)\n\t\tthis\.words = words\[this\.language\]\n\t\tthis\.words_en = words\.en\n'
		$splitLanguagePattern = '(?m)^\t\tthis\.language = this\.languages\[this\.languageId \?\? 0\]\n'
		if ([regex]::Matches($Text, $oldDataPattern).Count -eq 1) {
			$Text = [regex]::Replace($Text, $oldDataPattern, { param($match) $newData + "`n" }, 1)
		} elseif ([regex]::Matches($Text, $splitDataPattern).Count -eq 1 -and
			[regex]::Matches($Text, $splitWordsPattern).Count -eq 1 -and
			[regex]::Matches($Text, $splitLanguagePattern).Count -eq 1) {
			$splitData = @'
        const vanillaCodex = abstract_getCodex()
        this.codex = window.ModLoader?.applyData(vanillaCodex, this) || vanillaCodex
        this.images = await this.preloadImages()
'@
			$splitLanguage = @'
        this.languages = window.ModLoader?.applyLanguages(this.languages) || this.languages
        if (!this.languages[this.languageId]) this.languageId = 0
        this.language = this.languages[this.languageId]
'@
			$splitWords = @'
        const vanillaWords = abstract_getWords()
        const words = window.ModLoader?.applyWords(vanillaWords, this) || vanillaWords
        if (!words[this.language]) {
            this.languageId = 0
            this.language = this.languages[this.languageId] || `en`
        }
        this.words = words[this.language]
        this.words_en = words.en
'@
			$Text = [regex]::Replace($Text, $splitDataPattern, { param($match) $splitData + "`n" }, 1)
			$Text = [regex]::Replace($Text, $splitLanguagePattern, { param($match) $splitLanguage + "`n" }, 1)
			$Text = [regex]::Replace($Text, $splitWordsPattern, { param($match) $splitWords + "`n" }, 1)
		} else {
			throw 'Could not patch game data and language hooks. The game file may have changed or was edited by another tool.'
		}
	}
	$initMatches = [regex]::Matches($Text, '(?ms)^\tasync init\(preload\)\{\n.*?^\t\}')
	if ($initMatches.Count -ne 1) { throw 'Expected one active desktop init method.' }
	foreach ($hook in @('applyData', 'applyLanguages', 'applyWords')) {
		if ([regex]::Matches($initMatches[0].Value, "ModLoader\?\.$hook\(").Count -ne 1) {
			throw "Incomplete game initialization hook: $hook"
		}
	}
	if ($Text.Contains('async preloadImages()') -and -not $initMatches[0].Value.Contains('this.images = await this.preloadImages()')) {
		throw 'Async image preload must remain awaited.'
	}

	if (-not $Text.Contains('afterGameInit')) {
		$afterMousePattern = '(?m)^\t\t//Pinhole test$'
		$newAfterMouse = @'
        await window.ModLoader?.stage(`afterGameInit`, this)
		//Pinhole test
'@
		if (-not [regex]::IsMatch($Text, $afterMousePattern)) {
			throw 'Could not patch afterGameInit hook. The game file may have changed or was edited by another tool.'
		}
        $Text = [regex]::Replace($Text, $afterMousePattern, { param($match) $newAfterMouse + "`n" })
	}

	if (-not $Text.Contains('ModLoader?.applyPreloadList')) {
		$Text = Apply-Required $Text "		const list = this.codex.preload" "		const list = window.ModLoader?.applyPreloadList(this.codex.preload) || this.codex.preload" 'preload list hook'
	}

	$oldChangeLanguage = @'
		this.language = this.languages[this.languageId]
		this.words = abstract_getWords()[this.language]
'@
	$newChangeLanguage = @'
		this.language = this.languages[this.languageId]
		const words = window.ModLoader?.applyWords(abstract_getWords(), this) || abstract_getWords()
		if (!words[this.language]) {
			this.languageId = 0
			this.language = this.languages[this.languageId] || `en`
		}
		this.words = words[this.language]
		this.words_en = words.en
'@
	$oldModLoaderChangeLanguage = @'
		this.language = this.languages[this.languageId]
		const words = window.ModLoader?.applyWords(abstract_getWords(), this) || abstract_getWords()
		this.words = words[this.language] || words.en || abstract_getWords()[this.language]
'@
	$Text = Apply-Optional $Text $oldChangeLanguage $newChangeLanguage
	$Text = Apply-Optional $Text $oldModLoaderChangeLanguage $newChangeLanguage

	$robustChangeLanguagePattern = '(?s)changeLanguage\(id\)\{.*?ModLoader\?\.applyWords.*?if \(!words\[this\.language\]\).*?this\.words_en = words\.en'
	if (-not [regex]::IsMatch($Text, $robustChangeLanguagePattern)) {
		$vanillaChangeLanguageWordsPattern = '(?m)^(\s*)this\.language = this\.languages\[this\.languageId\]\s*\n\s*this\.words = abstract_getWords\(\)\[this\.language\]\s*\n'
		if (-not [regex]::IsMatch($Text, $vanillaChangeLanguageWordsPattern)) {
			throw 'Could not patch language-change words hook. The game file may have changed or was edited by another tool.'
		}
		$Text = [regex]::Replace($Text, $vanillaChangeLanguageWordsPattern, { param($match) $indent = $match.Groups[1].Value; [regex]::Replace($newChangeLanguage, '(?m)^\t\t', $indent) + "`n" }, 1)
	}

	if (-not $Text.Contains('ModLoader?.applyLoadedSave')) {
		$loadedSavePattern = '(?m)^(\t\ttry \{\n)(\t\t\t//To make sure\n)'
		if (-not [regex]::IsMatch($Text, $loadedSavePattern)) {
			throw 'Could not patch loaded save hook. The game file may have changed or was edited by another tool.'
		}
        $Text = [regex]::Replace($Text, $loadedSavePattern, { param($match) $match.Groups[1].Value + "`t`t`tmanual = window.ModLoader?.applyLoadedSave(manual, this) || manual`n" + $match.Groups[2].Value }, 1)
	}

	if (-not $Text.Contains('rememberOrphanEntity')) {
		$orphanPattern = '(?m)^(\t+const s = manual\.stuff\[i\]\n)(\t+)const entity = '
		if (-not [regex]::IsMatch($Text, $orphanPattern)) {
			throw 'Could not patch orphan entity save guard. The game file may have changed or was edited by another tool.'
		}
        $Text = [regex]::Replace($Text, $orphanPattern, {
            param($match)
            $indent = $match.Groups[2].Value
            $match.Groups[1].Value +
                $indent + "if (!window.ModLoader?.canLoadEntity(s.name, this) && !this.codex.entities[s.name]) {`n" +
                $indent + "`twindow.ModLoader?.rememberOrphanEntity(s)`n" +
                $indent + "`tcontinue`n" +
                $indent + "}`n" +
                $indent + "const entity = "
        }, 1)
	}

	if (-not $Text.Contains('ModLoader?.applySave')) {
		$savePattern = '(?ms)^\tassembleSave\(\)\{\n.*?^\t\}'
		if ([regex]::Matches($Text, $savePattern).Count -ne 1) { throw 'Expected one active 1.3 assembleSave method.' }
		$Text = [regex]::Replace($Text, $savePattern, {
			param($match)
			$body = Apply-Required $match.Value "`t`treturn {" "`t`tconst saveState = {" 'object save start'
			Apply-Required $body "`n`t}" "`n`t`treturn window.ModLoader?.applySave(saveState, this) || saveState`n`t}" 'object save return'
		}, 1)
	}
	$Text = $Text.Replace('if (!this.codex.entities[i].onlyone)', 'if (!this.codex.entities[i]?.onlyone)')

	if (-not $Text.Contains('ModLoader?.applyEntitySave')) {
		$oldEntitySave = '		return {name: e.name, position: e.position, par: par}'
		$newEntitySave = @'
		const entityState = {name: e.name, position: e.position, par: par}
		return window.ModLoader?.applyEntitySave(entityState, e, this) || entityState
'@
		$Text = Apply-Required $Text $oldEntitySave $newEntitySave 'entity save hook'
	}

	if (-not $Text.Contains('ModLoader?.applySoundList')) {
        $Text = Apply-Optional $Text "`t`tconst samples = [" "`t`tlet samples = ["
		$soundPattern = '(?m)^(\t+\]\n\n)(\t+for \(let i = 0; i < samples\.length; i\+\+\)\{)'
		if (-not [regex]::IsMatch($Text, $soundPattern)) {
			throw 'Could not patch sound list hook. The game file may have changed or was edited by another tool.'
		}
        $Text = [regex]::Replace($Text, $soundPattern, { param($match) $indent = $match.Groups[2].Value -replace "for.*$", ""; $match.Groups[1].Value + $indent + "samples = window.ModLoader?.applySoundList(samples) || samples`n`n" + $match.Groups[2].Value }, 1)
	}

	if (-not $Text.Contains('ModLoader?.resolveMusic')) {
		$Text = Apply-Required $Text '		fetch(`sfx/${name}.mp3`).then(r => {' '		fetch(window.ModLoader?.resolveMusic(name) || `sfx/${name}.mp3`).then(r => {' 'music asset hook'
	}

	return $Text
}

function Patch-SpritesJs {
	param([string]$Text)

	if (-not $Text.Contains('args.src = window.ModLoader?.resolveAsset')) {
		$spritePattern = '(?m)^(\t+this\.bctx = this\.master\.bctx\n\n)(\t+)if \(this\.master\.images\[args\.src\]\)\{'
		if (-not [regex]::IsMatch($Text, $spritePattern)) {
			throw 'Could not patch sprite asset hook. The game file may have changed or was edited by another tool.'
		}
        $Text = [regex]::Replace($Text, $spritePattern, { param($match) $match.Groups[1].Value + $match.Groups[2].Value + "args.src = window.ModLoader?.resolveAsset(args.src) || args.src`n" + $match.Groups[2].Value + "if (this.master.images[args.src]){" }, 1)
	}

	if (-not $Text.Contains('this.src = window.ModLoader?.resolveAsset')) {
		$Text = Apply-Required $Text '		this.src = args.src' '		this.src = window.ModLoader?.resolveAsset(args.src) || args.src' 'GL sprite asset hook'
	}

	return $Text
}

function Patch-UiJs {
	param([string]$Text)

	if ($Text.Contains('ModLoader?.resolveAsset(e.shopImage')) {
		return $Text
	}
	$old = 'image.src = `img/shop/${e.isDark ? id + ''_dark'' : id}.jpg`'
	$new = 'image.src = window.ModLoader?.resolveAsset(e.shopImage || `img/shop/${e.isDark ? id + ''_dark'' : id}.jpg`) || e.shopImage || `img/shop/${e.isDark ? id + ''_dark'' : id}.jpg`'
	return Apply-Required $Text $old $new 'active Store image hook'
}

function Patch-MainSaveBridge {
	param([string]$Text)
	$Text = [regex]::Replace($Text, '(?m)^[ \t]+(?=if \(client\.cloud\?\.fileExists\(`charpsMemory`\) \|\| ModLoaderMainProcess\.hasSaveOverlay\(client\.cloud\))', '  ')
	$sendBlock = @'
ipcMain.on(`store`, (e,slots)=>{
  return ModLoaderMainProcess.dispatchSaveStore(e, slots, value => {
    try {
      return client.cloud?.writeFile(`charpsMemory`, JSON.stringify(value))
    } catch (_) {
      win.webContents.send(`console`, `Error! Error! Error! Can't serialize and write slots to the cloud.`)
      return false
    }
  })
})
'@
	$invokeBlock = @'
ipcMain.handle(`store`, async (e, slots) => {
  return ModLoaderMainProcess.dispatchSaveStore(e, slots, value => {
    try {
      console.log(`Saving to Steam...`)
      return client.cloud?.writeFile('charpsMemory', JSON.stringify(value)) === true
    } catch (_) {
      console.error('Steam save failed.')
      return false
    }
  })
})
'@
	$marker = '// ModLoader save bridge v2'
	$sendPattern = '(?ms)^ipcMain\.on\(`store`, \(e,slots\)=>\{\n.*?^\}\)'
	$invokePattern = '(?ms)^ipcMain\.handle\(`store`, async \(e, slots\) => \{\n.*?^\}\)'
	$sendMatches = [regex]::Matches($Text, $sendPattern)
	$invokeMatches = [regex]::Matches($Text, $invokePattern)
	if ($sendMatches.Count -ne 1 -or $invokeMatches.Count -ne 1) { throw 'Save bridge needs exactly one store send and invoke handler.' }
	if ($Text.Contains($marker)) {
		if ($sendMatches[0].Value -cne $sendBlock -or $invokeMatches[0].Value -cne $invokeBlock) { throw 'Incomplete or edited save dispatch bridge.' }
		foreach ($required in @('ModLoaderMainProcess.configureSaveCloud(client.cloud)', 'return ModLoaderMainProcess.readSaveOverlay(client.cloud, JSON.parse(save))', 'savePolicyLayout: slots?.policyLayout,', 'ModLoaderMainProcess.hasSaveOverlay(client.cloud)', "if (e?.code === 'SAVE_COLLECTION_INVALID' || e?.code === 'SAVE_BASELINE_MISSING')")) {
			if ([regex]::Matches($Text, [regex]::Escape($required)).Count -ne 1) { throw "Incomplete or duplicate save bridge: $required" }
		}
		return $Text
	}
	if ($Text -match 'ModLoaderMainProcess\.(configureSaveCloud|readSaveOverlay|dispatchSaveStore)') { throw 'Partial save bridge without its complete version marker.' }
	$Text = Apply-Required $Text $sendMatches[0].Value $sendBlock 'save send dispatch'
	$Text = Apply-Required $Text $invokeMatches[0].Value $invokeBlock 'save invoke dispatch'
	$configure = "$marker`nModLoaderMainProcess.configureSaveCloud(client.cloud)`n`n"
	$Text = Insert-BeforeStandaloneLine $Text '// LANGUAGE CODES' $configure 'save cloud configuration'
	$Text = Apply-Required $Text 'if (client.cloud?.fileExists(`charpsMemory`)){' 'if (client.cloud?.fileExists(`charpsMemory`) || ModLoaderMainProcess.hasSaveOverlay(client.cloud)){' 'save overlay presence'
	$Text = Apply-Required $Text '      slots: slots,' "      slots: slots,`n      savePolicyLayout: slots?.policyLayout," 'save layout forwarding'
	$Text = Apply-Required $Text 'const save = client.cloud.readFile(`charpsMemory`)' "const save = client.cloud?.fileExists(``charpsMemory``) ? client.cloud.readFile(``charpsMemory``) : '[]'" 'save baseline read'
	$Text = Apply-Required $Text 'return JSON.parse(save)' 'return ModLoaderMainProcess.readSaveOverlay(client.cloud, JSON.parse(save))' 'save overlay reconstruction'
	$readFailure = @'
    } catch(e){
      if (e?.code === 'SAVE_COLLECTION_INVALID' || e?.code === 'SAVE_BASELINE_MISSING') {
        console.error('Invalid cloud save collection; loading stopped.')
        return false
      }
      console.warn(`Cloud read failed, attempt ${i + 1}`)
'@
	$oldReadFailure = @'
    } catch(e){
      console.warn(`Cloud read failed, attempt ${i + 1}`)
'@
	$Text = Apply-Required $Text $oldReadFailure $readFailure 'invalid cloud input rejection'
	return Patch-MainSaveBridge $Text
}

function Patch-MainJs {
	param([string]$Text)
	# The 1.3 main process uses tabs in bodies formerly indented with two spaces.
	$Text = [regex]::Replace($Text, '(?m)^\t+', { param($m) '  ' * $m.Length })
	$Text = Patch-MainSaveBridge $Text
	if (-not $Text.Contains('clearSnapshotContext(e.sender) // reload')) {
		$Text = Apply-Required $Text 'ipcMain.on(`getMyStuff`, async (e,d)=>{' "ipcMain.on(``getMyStuff``, async (e,d)=>{`n  ModLoaderMainProcess.clearSnapshotContext(e.sender) // reload" 'reload snapshot context'
	}

	$removedLegacyMainProcess = $false
	$legacyStart = $Text.IndexOf('function getModloaderWindowWorkArea(bounds){')
	if ($legacyStart -ge 0) {
		$legacyEnd = $Text.IndexOf('//1111111111111111', $legacyStart)
		if ($legacyEnd -lt 0) {
			throw 'Could not remove legacy ModLoader main-process block. Missing sentinel marker.'
		}
		$Text = $Text.Remove($legacyStart, $legacyEnd - $legacyStart)
		$removedLegacyMainProcess = $true
	}

	if ($removedLegacyMainProcess -or $Text.Contains("const { spawn } = require('child_process')") -or $Text.Contains('const modloaderWindows = new Map()')) {
		$Text = $Text.Replace("const { app, BrowserWindow, Tray, ipcMain, Menu, shell, globalShortcut, screen } = require('electron')", "const { app, BrowserWindow, Tray, ipcMain, Menu, shell, globalShortcut } = require('electron')")
		$Text = [regex]::Replace($Text, "(?s)const \{ spawn \} = require\('child_process'\)\nconst runtimeLogPath = path\.join\(__dirname, 'game', 'modloader', 'state', 'runtime\.log'\)\nfunction runtimeLog\(\.\.\.args\)\{.*?\n\}\n", '', 1)
		$Text = $Text.Replace("const modloaderWindows = new Map()`nlet modloaderParentWindowState = null`nconst modloaderWindowMargin = 12`n", '')
		$Text = $Text.Replace("runtimeLog('gameError'", "ModLoaderMainProcess.runtimeLog('gameError'")
		$Text = $Text.Replace("runtimeLog('console'", "ModLoaderMainProcess.runtimeLog('console'")
		$Text = $Text.Replace("runtimeLog('render-process-gone'", "ModLoaderMainProcess.runtimeLog('render-process-gone'")
		$Text = $Text.Replace("runtimeLog('did-fail-load'", "ModLoaderMainProcess.runtimeLog('did-fail-load'")
	}

	if (-not $Text.Contains("const ModLoaderMainProcess = require('./game/modloader/main-process.js')")) {
		$Text = Apply-Required $Text "const path = require('path')" "const path = require('path')`nconst ModLoaderMainProcess = require('./game/modloader/main-process.js')" 'main-process bridge require'
	}

	if (-not $Text.Contains('function saveAppOptions()')) {
		$oldOptionsLoad = @'
try {
  options = JSON.parse(fs.readFileSync(optpath))
} catch (e){
  console.log(e)
}
'@
		$newOptionsLoad = @'
try {
  options = JSON.parse(fs.readFileSync(optpath))
} catch (e){
  console.log(e)
}
function saveAppOptions(){
  try {
    fs.writeFileSync(optpath, JSON.stringify(options))
  } catch (e) {
    console.log(e)
  }
}
'@
		$Text = Apply-Required $Text $oldOptionsLoad $newOptionsLoad 'app options save hook'
	}

	if (-not $Text.Contains("runtimeLog('gameError'") -and -not $Text.Contains("ModLoaderMainProcess.runtimeLog('gameError'")) {
		$oldGameError = @'
ipcMain.on(`gameError`, (e,d)=>{
  TrackJS?.track(d)
})
'@
		$newGameError = @'
ipcMain.on(`gameError`, (e,d)=>{
  TrackJS?.track(d)
  ModLoaderMainProcess.runtimeLog('gameError', d && (d.stack || d.message || d.toString ? d.toString() : d))
})
'@
		$Text = Apply-Required $Text $oldGameError $newGameError 'game error runtime log hook'
	}

	if (-not $Text.Contains('ModLoaderMainProcess.toggleMainWindowFullscreen()')) {
		$oldFullscreenToggle = @'
ipcMain.on(`toggleFullscreen`, (e,d)=>{
  options.fullscreen = !win.fullScreen
  win.setFullScreen(!win.fullScreen)
  fs.writeFileSync(optpath, JSON.stringify(options))
})
'@
		$newFullscreenToggle = @'
ipcMain.on(`toggleFullscreen`, (e,d)=>{
  ModLoaderMainProcess.toggleMainWindowFullscreen()
})
'@
		$Text = Apply-Required $Text $oldFullscreenToggle $newFullscreenToggle 'main window fullscreen toggle hook'
	}

	if (-not $Text.Contains('function recreateWindow()')) {
		$recreateWindowBlock = @'
function recreateWindow(){
  if (recreatingWindow) return
  recreatingWindow = true
  setImmediate(()=>{
    const previousWindow = win
    createWindow()
    if (previousWindow && !previousWindow.isDestroyed?.()) previousWindow.destroy()
    recreatingWindow = false
  })
}

'@
		$Text = Apply-Required $Text "let DEBUG = ``" "let DEBUG = ```nlet recreatingWindow = false" 'main window recreate state'
		$Text = Apply-Required $Text "const createWindow = _=> {" ($recreateWindowBlock + "const createWindow = _=> {") 'main window recreate hook'
	}

	if (-not $Text.Contains('ModLoaderMainProcess.getMainWindowOptions')) {
		$oldWindowCreate = @'
const createWindow = _=> {
  win = new BrowserWindow({
'@
		$newWindowCreate = @'
const createWindow = _=> {
  ModLoaderMainProcess.configureMainWindowHost({
    appOptions: options,
    saveAppOptions,
    recreateWindow
  })
  const windowOptions = ModLoaderMainProcess.getMainWindowOptions({
'@
		$Text = Apply-Required $Text $oldWindowCreate $newWindowCreate 'main window before-create options hook'
		$Text = Apply-Required $Text "  })`n`n  if (!options.fullscreen) win.setFullScreen(false)" "  })`n  win = new BrowserWindow(windowOptions)`n" 'main window options hook application'
	}

	$Text = $Text.Replace('ModLoaderMainProcess.attachWindow(win)', 'ModLoaderMainProcess.attachWindow(win, { accountId: STEAMID })')
	if (-not [regex]::IsMatch($Text, 'ModLoaderMainProcess\.attachWindow\(win(?:\s*,|\s*\))')) {
		$windowOptionsAttach = '  win = new BrowserWindow(windowOptions)'
		if ($Text.Contains($windowOptionsAttach)) {
			$Text = Apply-Required $Text $windowOptionsAttach "$windowOptionsAttach`n  ModLoaderMainProcess.attachWindow(win, { accountId: STEAMID })" 'main window attachment'
		} else {
			$oldAttach = '  if (!options.fullscreen) win.setFullScreen(false)'
			$newAttach = "  if (!options.fullscreen) win.setFullScreen(false)`n  ModLoaderMainProcess.attachWindow(win, { accountId: STEAMID })"
			$Text = Apply-Required $Text $oldAttach $newAttach 'main window attachment'
		}
	}
	if (-not $Text.Contains('ModLoaderMainProcess.afterMainWindowCreated(win)')) {
		$Text = Apply-Required $Text '  ModLoaderMainProcess.attachWindow(win, { accountId: STEAMID })' "  ModLoaderMainProcess.attachWindow(win, { accountId: STEAMID })`n  ModLoaderMainProcess.afterMainWindowCreated(win)" 'main window after-create hook'
	}

	$badDevToolsInlineBlock = @'
  // win.webContents.openDevTools()ipcMain.on(`modloader:toggle-devtools`, ()=>{
  win?.webContents?.toggleDevTools()
})
//1111111111111111
'@
	$fixedDevToolsInlineBlock = @'
  // win.webContents.openDevTools()//1111111111111111
'@
	$Text = $Text.Replace($badDevToolsInlineBlock, $fixedDevToolsInlineBlock)

	if (-not [regex]::IsMatch($Text, '(?m)^ipcMain\.on\(`modloader:toggle-devtools`,')) {
		$devToolsIpcBlock = @'
ipcMain.on(`modloader:toggle-devtools`, ()=>{
  if (win && win.webContents) win.webContents.toggleDevTools()
})

'@
		$Text = Insert-BeforeStandaloneLine $Text '//1111111111111111' $devToolsIpcBlock 'DevTools renderer IPC'
	}

	# The native menu and our IPC already mention toggleDevTools. Neither proves
	# that shortcuts or renderer diagnostics have been installed.
	$Text = $Text.Replace("// {role: 'toggleDevTools'}", "{role: 'toggleDevTools'}")
	if (-not $Text.Contains("ModLoaderMainProcess.runtimeLog('console'")) {
		$devToolsBlock = @'
  globalShortcut.register('CommandOrControl+Shift+I', _=>{
    win.webContents.toggleDevTools()
  })
  globalShortcut.register('F12', _=>{
    win.webContents.toggleDevTools()
  })

  win.webContents.on('console-message', (event, level, message, line, sourceId)=>{
    if (level && typeof level === 'object') {
      ModLoaderMainProcess.runtimeLog('console', level.level, level.message, `${level.sourceId}:${level.lineNumber}`)
    } else {
      ModLoaderMainProcess.runtimeLog('console', level, message, `${sourceId}:${line}`)
    }
  })
  win.webContents.on('render-process-gone', (event, details)=>{
    ModLoaderMainProcess.runtimeLog('render-process-gone', details)
  })
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL)=>{
    ModLoaderMainProcess.runtimeLog('did-fail-load', errorCode, errorDescription, validatedURL)
  })

'@
		$Text = Apply-Required $Text '  //LOAD' ($devToolsBlock + '  //LOAD') 'DevTools menu and runtime diagnostics'
	}

	return $Text
}

$script:TargetRoot = Resolve-GameRoot -Path $GameRoot

$gameSource = Read-TextFile -Path (Join-Path $script:TargetRoot 'resources\app\game\scripts\game.js')
if ($gameSource -notmatch 'this\.version\s*=\s*`1\.3`') { throw 'This installer supports game 1.3 only.' }

Update-TextFile -RelativePath 'resources\app\game\index.html' -Patch { param($Text) Patch-IndexHtml $Text }
Update-TextFile -RelativePath 'resources\app\game\scripts\game.js' -Patch { param($Text) Patch-GameJs $Text }
Update-TextFile -RelativePath 'resources\app\game\scripts\sprites.js' -Patch { param($Text) Patch-SpritesJs $Text }
Update-TextFile -RelativePath 'resources\app\game\scripts\ui.js' -Patch { param($Text) Patch-UiJs $Text }
Update-TextFile -RelativePath 'resources\app\main.js' -Patch { param($Text) Patch-MainJs $Text }

Assert-Contains -RelativePath 'resources\app\game\index.html' -Pattern 'modloader/loader.js' -Description 'index loader script'
Assert-Contains -RelativePath 'resources\app\game\scripts\game.js' -Pattern 'ModLoader?.stage(`beforeVanillaScripts`' -Description 'beforeVanillaScripts hook'
Assert-Contains -RelativePath 'resources\app\game\scripts\game.js' -Pattern 'ModLoader?.applyData' -Description 'data hook'
Assert-Contains -RelativePath 'resources\app\game\scripts\game.js' -Pattern 'ModLoader?.applyWords' -Description 'words hook'
Assert-Contains -RelativePath 'resources\app\game\scripts\game.js' -Pattern 'ModLoader?.applySave' -Description 'save hook'
Assert-Contains -RelativePath 'resources\app\game\scripts\game.js' -Pattern 'ModLoader?.applySoundList' -Description 'sound list hook'
Assert-Contains -RelativePath 'resources\app\game\scripts\sprites.js' -Pattern 'ModLoader?.resolveAsset' -Description 'sprite asset hook'
Assert-Contains -RelativePath 'resources\app\game\scripts\ui.js' -Pattern 'ModLoader?.resolveAsset' -Description 'shop icon asset hook'
Assert-Contains -RelativePath 'resources\app\main.js' -Pattern 'ModLoaderMainProcess.attachWindow(win' -Description 'main process bridge'
Assert-Contains -RelativePath 'resources\app\main.js' -Pattern 'ModLoaderMainProcess.getMainWindowOptions' -Description 'main window before-create options hook'
Assert-Contains -RelativePath 'resources\app\main.js' -Pattern 'ModLoaderMainProcess.afterMainWindowCreated(win)' -Description 'main window after-create hook'
Assert-Contains -RelativePath 'resources\app\game\modloader\main-process.js' -Pattern 'module.exports' -Description 'main process module'
Assert-Contains -RelativePath 'resources\app\game\modloader\main-process.js' -Pattern 'getMainWindowOptions' -Description 'main window options hook implementation'
Assert-Contains -RelativePath 'resources\app\game\modloader\main-process.js' -Pattern 'afterMainWindowCreated' -Description 'main window after-create hook implementation'
Assert-Contains -RelativePath 'resources\app\game\modloader\main-process.js' -Pattern 'modloader:libraries:runtime' -Description 'Library API v1 main process bridge'
Assert-Contains -RelativePath 'resources\app\game\modloader\library-store.js' -Pattern "const API_VERSION = '1.0.0'" -Description 'Library store v1 module'

if ($CheckOnly) {
	Write-Host 'All 1.3 patch checks passed; no files written.'
	return
}
# All transformations and required runtime checks have succeeded. Preserve exact
# original bytes if an I/O failure occurs while publishing the five-file plan.
foreach ($entry in $script:PendingWrites) {
	if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($entry.Path)) -cne [Convert]::ToBase64String($entry.Before)) { throw "Changed since preflight: $($entry.Path)" }
}
$written = @()
try {
	foreach ($entry in $script:PendingWrites) {
		$written += $entry
		Write-TextFile -Path $entry.Path -Text $entry.Text
	}
} catch {
	$failure = $_
	foreach ($entry in $written) { [IO.File]::WriteAllBytes($entry.Path, $entry.Before) }
	throw $failure
}
Write-Host 'ModLoader 1.3 source hooks are installed.'
