param(
	[string]$GameRoot
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

	if (-not $Text.Contains($Old)) {
		throw "Could not patch $Description. The game file may have changed or was edited by another tool."
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
		Write-TextFile -Path $path -Text $after
		Write-Host "Patched $RelativePath"
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
	if (-not (Test-Path -LiteralPath $path)) {
		throw "Patch verification failed: missing $RelativePath for $Description"
	}
	$text = Read-TextFile -Path $path
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

	if (-not $Text.Contains('ModLoader?.stage(`beforeVanillaScripts`')) {
		$loadScriptsPattern = '(?m)^(\t\t)await this\.loadScripts\(\)\n(\t\tawait this\.loadStyle\(`cascade(?:_mobile)?\.css`\)\n)'
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
        const moddedLanguageId = this.getLanguageId()
        if (moddedLanguageId !== null) this.languageId = moddedLanguageId
        if (!this.languages[this.languageId]) this.languageId = 0
        this.language = this.languages[this.languageId]

        this.codex = window.ModLoader?.applyData(abstract_getCodex(), this) || abstract_getCodex()
        this.images = this.preloadImages()
        const words = window.ModLoader?.applyWords(abstract_getWords(), this) || abstract_getWords()
        if (!words[this.language]) {
            this.languageId = 0
            this.language = this.languages[this.languageId] || `en`
            localStorage.setItem(`abstractv03_language${this.steamId}`, this.languageId)
        }
        this.words = words[this.language]
        this.words_en = words.en
'@
		if (-not [regex]::IsMatch($Text, $oldDataPattern)) {
			throw 'Could not patch game data and language hooks. The game file may have changed or was edited by another tool.'
		}
		$Text = [regex]::Replace($Text, $oldDataPattern, { param($match) $newData + "`n" })
	}

	if (-not $Text.Contains('afterGameInit')) {
		$afterMousePattern = '(?m)^\t\tthis\.updateMouseData\(this\.w2/2, this\.h2/2\)\n\t\tthis\.processMousemove2\(\)\n'
		$newAfterMouse = @'
        this.updateMouseData(this.w2/2, this.h2/2)
        this.processMousemove2()
        await window.ModLoader?.stage(`afterGameInit`, this)
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
        $Text = Apply-Required $Text "`t`tconst string = JSON.stringify({" "`t`tconst saveState = {" "save hook start"
		$saveEndPattern = '(?m)^\t\t\}\)\n\n\t\treturn this\.encodeSave\(string\)'
		if (-not [regex]::IsMatch($Text, $saveEndPattern)) {
			throw 'Could not patch save hook finish. The game file may have changed or was edited by another tool.'
		}
        $Text = [regex]::Replace($Text, $saveEndPattern, "`t`t}`n`t`tconst string = JSON.stringify(window.ModLoader?.applySave(saveState, this) || saveState)`n`n`t`treturn this.encodeSave(string)", 1)
	}

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

	if ($Text.Contains('ModLoader?.resolveAsset(this.master.codex.entities[params.id]?.shopImage')) {
		return $Text
	}

	$shopImagePattern = '(?m)^(\t+)image\.src = `img/shop/\$\{params\.isDark \? params\.id \+ ._dark. : params\.id\}\.jpg`'
	if (-not [regex]::IsMatch($Text, $shopImagePattern)) {
		throw 'Could not patch shop icon asset hook. The game file may have changed or was edited by another tool.'
	}
	$shopPath = '`img/shop/${params.isDark ? params.id + String.fromCharCode(95, 100, 97, 114, 107) : params.id}.jpg`'
    return [regex]::Replace($Text, $shopImagePattern, {
        param($match)
        $indent = $match.Groups[1].Value
        $indent + "image.src = window.ModLoader?.resolveAsset(this.master.codex.entities[params.id]?.shopImage || " + $shopPath + ") || this.master.codex.entities[params.id]?.shopImage || " + $shopPath
    }, 1)
}

function Patch-MainJs {
	param([string]$Text)

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

	if (-not $Text.Contains('ModLoaderMainProcess')) {
		$Text = Apply-Required $Text "const path = require('path')" "const path = require('path')`nconst ModLoaderMainProcess = require('./game/modloader/main-process.js')" 'main-process bridge require'
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

	if (-not $Text.Contains('ModLoaderMainProcess.attachWindow(win)')) {
		$oldAttach = '  if (!options.fullscreen) win.setFullScreen(false)'
		$newAttach = "  if (!options.fullscreen) win.setFullScreen(false)`n  ModLoaderMainProcess.attachWindow(win)"
		$Text = Apply-Required $Text $oldAttach $newAttach 'main window attachment'
	}

	if (-not $Text.Contains('toggleDevTools')) {
		$devToolsBlock = @'
  const isMac = process.platform === 'darwin'
  const temp = [
    {
      label: 'View',
      submenu: [
        {role: 'reload'},
        {role: 'forceReload'},
        {role: 'toggleDevTools'}
      ]
    }
  ]
  const menu = Menu.buildFromTemplate(temp)
  Menu.setApplicationMenu(menu)

  globalShortcut.register('CommandOrControl+Shift+I', _=>{
    win.webContents.toggleDevTools()
  })
  globalShortcut.register('F12', _=>{
    win.webContents.toggleDevTools()
  })

  win.webContents.on('console-message', (event, level, message, line, sourceId)=>{
    ModLoaderMainProcess.runtimeLog('console', level, message, `${sourceId}:${line}`)
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
Assert-Contains -RelativePath 'resources\app\main.js' -Pattern 'ModLoaderMainProcess.attachWindow(win)' -Description 'main process bridge'
Assert-Contains -RelativePath 'resources\app\game\modloader\main-process.js' -Pattern 'module.exports' -Description 'main process module'

Write-Host 'ModLoader source hooks are installed.'
