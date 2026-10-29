ModLoader.register({
	id: 'Cattail_TweaksQuality_Dynamic-Details',
	init(api) {
		const ownerKey = Symbol.for('cattail.dynamic-details.shortcut-hints')
		window[ownerKey]?.dispose()
		let handles = [], releases = [], currentGame = null, unsubscribe = null
		function dispose() {
			for (const handle of handles) handle.unregister()
			for (const release of releases) release()
			unsubscribe?.()
			handles = []; releases = []; currentGame = null; unsubscribe = null
		}
		const owner = { dispose }
		window[ownerKey] = owner
		api.on('afterGameInit', (_payload, game) => {
			if (window[ownerKey] !== owner) return
			const shortcuts = api.ui?.shortcuts
			const core = window.CattailDynamicDetails
			if (typeof shortcuts?.register !== 'function' || typeof core?.getShortcutState !== 'function') return
			if (currentGame === game) return
			dispose(); currentGame = game
			const state = () => core.getShortcutState(currentGame)
			const locale = () => texts[currentGame?.language] || texts.en
			const category = { id: 'dynamic-details-information', label: () => locale().category, order: 30 }
			const sharedCombinationIds = new Set([
				'building-hold', 'building-pin', 'opacity-wheel', 'opacity-scope',
				'resource-hold', 'resource-pin', 'line-lock', 'coordinates-hold',
				'teleport-close', 'directions-hold', 'directions-pin'
			])
			const entries = [
				['building-hold', ['Alt', 'Shift'], 'building', s => s.buildingContext, 0],
				['building-pin', ['Ctrl', 'Alt'], 'building', s => s.buildingContext && !s.hoveredResource, 0],
				['opacity-wheel', [['Z', 'WheelUp'], ['Z', 'WheelDown']], 'opacity', s => s.opacityContext, 1],
				['opacity-scope', 'Mouse5', 'opacity', s => s.buildingContext && !s.hoveredResource, 0],
				['resource-hold', 'Alt', 'resources', s => s.resourceView, 2],
				['resource-pin', ['Ctrl', 'Alt'], 'resources', s => s.hoveredResource, 2],
				['line-preview', 'Shift', 'resources', s => s.linePreview, 3],
				['line-lock', 'Mouse5', 'resources', s => s.hoveredResource, 2],
				['resource-chart', [['WheelUp'], ['WheelDown']], 'chart', s => s.chartContext, 4],
				['line-renderer', 'O', 'resources', () => true, 5],
				['source-profiler', 'F8', 'resources', () => true, 5],
				['coordinates-hold', 'Alt', 'coordinates', s => s.cell, 6],
				['coordinates-pin', ['Alt', 'C'], 'coordinates', () => true, 5],
				['teleport-open', ['Alt', 'Shift', 'C'], 'coordinates', s => s.emptyCell, 7],
				['teleport-confirm', 'Enter', 'coordinates', s => s.panelFocused, 8],
				['teleport-close', 'Escape', 'coordinates', s => s.panelFocused, 8],
				['directions-hold', ['Alt', 'Shift'], 'directions', s => s.emptyCell, 7],
				['directions-pin', ['Ctrl', 'Alt'], 'directions', s => s.emptyCell && !s.buildingContext && !s.hoveredResource, 7]
			]
			entries.forEach(([id, keys, feature, available, context], index) => {
				handles.push(shortcuts.register({
					id, keys, order: index + 1, category,
					allowSharedCombination: sharedCombinationIds.has(id),
					description: () => locale().labels[index],
					context: () => locale().contexts[context],
					visible: () => { const s = state(); return s[feature] && (id !== 'opacity-scope' || s.building) },
					active: () => { const s = state(); return s.playing && (id.startsWith('teleport-') && id !== 'teleport-open' ? s.panelFocused : s.ready) && available(s) }
				}))
			})
			unsubscribe = core.subscribeShortcutState?.(() => shortcuts.refresh())
			// Focus changes need a refresh even when the game is not drawing a frame.
			const refresh = () => shortcuts.refresh()
			for (const event of ['focusin', 'focusout']) {
				window.addEventListener(event, refresh)
				releases.push(() => window.removeEventListener(event, refresh))
			}
			shortcuts.refresh()
		})

		const texts = {
		"en": {
				"category": "Information and diagnostics",
				"labels": [
						"Hold to show building details",
						"Pin or unpin building details",
						"Adjust information-card opacity",
						"Switch whole-card/detail-only opacity",
						"Hold to show resource sources and consumers",
						"Pin or unpin the resource panel",
						"Hold to preview resource lines; release to restore the lock",
						"Lock, move or release resource lines",
						"Switch resource bar/line chart",
						"Switch Canvas 2D/WebGL resource lines",
						"Toggle resource-source performance profiler (diagnostics)",
						"Hold to show tile coordinates",
						"Pin or unpin coordinates",
						"Open coordinate teleport",
						"Teleport to the entered coordinates",
						"Close coordinate teleport",
						"Hold to show directions to key targets",
						"Pin or unpin target directions"
				],
				"contexts": [
						"Point at a building or a supported tile hint.",
						"Hold Alt or pin details; leave the resource-source controls.",
						"Point at a resource icon.",
						"Point at a resource; without a line lock, hold Alt or pin the resource panel first.",
						"Unlock resource charts, then point at a resource icon.",
						"Available during gameplay.",
						"Point at a valid tile.",
						"Point at empty ground without holding a building.",
						"Focus a control inside the coordinate panel."
				]
		},
		"sch": {
				"category": "信息与诊断",
				"labels": [
						"按住显示建筑详情",
						"固定或取消固定建筑详情",
						"调整信息卡透明度",
						"切换整卡或仅详情透明模式",
						"按住查看资源来源与消耗",
						"固定或取消固定资源面板",
						"按住临时查看资源连线，松开恢复锁线",
						"锁定、转移或解除资源连线",
						"切换资源柱状图与折线图",
						"切换资源连线 Canvas 2D/WebGL 渲染器",
						"开关资源来源性能分析器（诊断）",
						"按住显示地块坐标",
						"固定或取消固定坐标",
						"打开坐标传送面板",
						"传送到输入的坐标",
						"关闭坐标传送面板",
						"按住显示重要目标方向",
						"固定或取消固定目标方向"
				],
				"contexts": [
						"指向建筑或受支持的地块提示。",
						"按住 Alt 或固定详情，并离开资源来源操作语境。",
						"指向资源图标。",
						"指向资源；未锁线时，先按 Alt 或固定资源面板。",
						"解锁资源图表后，指向资源图标。",
						"游戏中可用。",
						"指向有效地块。",
						"指向空地，且未拿起建筑。",
						"焦点位于坐标面板内的控件。"
				]
		},
		"modsch": {
				"category": "信息与诊断",
				"labels": [
						"按住显示建筑详情",
						"固定或取消固定建筑详情",
						"调整信息卡透明度",
						"切换整卡或仅详情透明模式",
						"按住查看资源来源与消耗",
						"固定或取消固定资源面板",
						"按住临时查看资源连线，松开恢复锁线",
						"锁定、转移或解除资源连线",
						"切换资源柱状图与折线图",
						"切换资源连线 Canvas 2D/WebGL 渲染器",
						"开关资源来源性能分析器（诊断）",
						"按住显示地块坐标",
						"固定或取消固定坐标",
						"打开坐标传送面板",
						"传送到输入的坐标",
						"关闭坐标传送面板",
						"按住显示重要目标方向",
						"固定或取消固定目标方向"
				],
				"contexts": [
						"指向建筑或受支持的地块提示。",
						"按住 Alt 或固定详情，并离开资源来源操作语境。",
						"指向资源图标。",
						"指向资源；未锁线时，先按 Alt 或固定资源面板。",
						"解锁资源图表后，指向资源图标。",
						"游戏中可用。",
						"指向有效地块。",
						"指向空地，且未拿起建筑。",
						"焦点位于坐标面板内的控件。"
				]
		},
		"tch": {
				"category": "資訊與診斷",
				"labels": [
						"按住顯示建築詳情",
						"固定或取消固定建築詳情",
						"調整資訊卡透明度",
						"切換整張卡片或僅詳情透明模式",
						"按住查看資源來源與消耗",
						"固定或取消固定資源面板",
						"按住暫時查看資源連線，放開恢復鎖定連線",
						"鎖定、轉移或解除資源連線",
						"切換資源長條圖與折線圖",
						"切換資源連線 Canvas 2D/WebGL 繪製器",
						"開關資源來源效能分析器（診斷）",
						"按住顯示地塊座標",
						"固定或取消固定座標",
						"開啟座標傳送面板",
						"傳送到輸入的座標",
						"關閉座標傳送面板",
						"按住顯示重要目標方向",
						"固定或取消固定目標方向"
				],
				"contexts": [
						"指向建築或支援的地塊提示。",
						"按住 Alt 或固定詳情，並離開資源來源操作情境。",
						"指向資源圖示。",
						"指向資源；未鎖定連線時，先按 Alt 或固定資源面板。",
						"解鎖資源圖表後，指向資源圖示。",
						"遊戲中可用。",
						"指向有效地塊。",
						"指向空地，且未拿起建築。",
						"焦點位於座標面板內的控制項。"
				]
		},
		"ru": {
				"category": "Информация и диагностика",
				"labels": [
						"Удерживать для показа сведений о здании",
						"Закрепить или открепить сведения о здании",
						"Изменить прозрачность карточки",
						"Переключить прозрачность всей карточки или только сведений",
						"Удерживать для показа источников и потребителей ресурса",
						"Закрепить или открепить панель ресурса",
						"Временно показать связи ресурса; отпустить для возврата к закреплённым",
						"Закрепить, перенести или снять связи ресурса",
						"Переключить столбчатый и линейный график ресурса",
						"Переключить связи ресурса между Canvas 2D и WebGL",
						"Включить профилировщик источников ресурсов (диагностика)",
						"Удерживать для показа координат клетки",
						"Закрепить или открепить координаты",
						"Открыть телепортацию по координатам",
						"Перейти к введённым координатам",
						"Закрыть телепортацию по координатам",
						"Удерживать для показа направлений к важным целям",
						"Закрепить или открепить направления"
				],
				"contexts": [
						"Наведите на здание или поддерживаемую подсказку клетки.",
						"Удерживайте Alt или закрепите сведения; выйдите из управления источниками ресурсов.",
						"Наведите на значок ресурса.",
						"Наведите на ресурс; без закреплённых связей сначала удерживайте Alt или закрепите панель.",
						"Откройте графики ресурсов и наведите на значок ресурса.",
						"Доступно во время игры.",
						"Наведите на допустимую клетку.",
						"Наведите на пустую клетку, не держа здание.",
						"Установите фокус на элементе панели координат."
				]
		},
		"de": {
				"category": "Information und Diagnose",
				"labels": [
						"Gedrückt halten: Gebäudedetails anzeigen",
						"Gebäudedetails anheften oder lösen",
						"Deckkraft der Infokarte anpassen",
						"Deckkraft für ganze Karte oder nur Details umschalten",
						"Gedrückt halten: Ressourcenquellen und Verbraucher anzeigen",
						"Ressourcenfenster anheften oder lösen",
						"Ressourcenlinien vorübergehend zeigen; loslassen stellt Fixierung wieder her",
						"Ressourcenlinien fixieren, wechseln oder lösen",
						"Zwischen Balken- und Liniendiagramm wechseln",
						"Ressourcenlinien zwischen Canvas 2D und WebGL umschalten",
						"Leistungsprofil für Ressourcenquellen ein-/ausschalten (Diagnose)",
						"Gedrückt halten: Feldkoordinaten anzeigen",
						"Koordinaten anheften oder lösen",
						"Koordinatenteleport öffnen",
						"Zu den eingegebenen Koordinaten springen",
						"Koordinatenteleport schließen",
						"Gedrückt halten: Richtungen zu wichtigen Zielen anzeigen",
						"Zielrichtungen anheften oder lösen"
				],
				"contexts": [
						"Auf ein Gebäude oder einen unterstützten Feldhinweis zeigen.",
						"Alt halten oder Details anheften; Ressourcensteuerung verlassen.",
						"Auf ein Ressourcensymbol zeigen.",
						"Auf eine Ressource zeigen; ohne fixierte Linien zuerst Alt halten oder das Ressourcenfenster anheften.",
						"Ressourcendiagramme freischalten, dann auf ein Ressourcensymbol zeigen.",
						"Während des Spiels verfügbar.",
						"Auf ein gültiges Feld zeigen.",
						"Auf freien Boden zeigen, ohne ein Gebäude zu halten.",
						"Ein Steuerelement im Koordinatenfenster fokussieren."
				]
		},
		"ptbr": {
				"category": "Informações e diagnóstico",
				"labels": [
						"Segurar para mostrar detalhes da construção",
						"Fixar ou soltar detalhes da construção",
						"Ajustar opacidade do cartão",
						"Alternar opacidade do cartão inteiro ou só dos detalhes",
						"Segurar para mostrar fontes e consumidores do recurso",
						"Fixar ou soltar painel do recurso",
						"Ver linhas temporariamente; soltar restaura as linhas fixadas",
						"Fixar, mudar ou soltar linhas do recurso",
						"Alternar gráfico de barras/linhas do recurso",
						"Alternar linhas entre Canvas 2D e WebGL",
						"Ativar/desativar perfilador de fontes de recursos (diagnóstico)",
						"Segurar para mostrar coordenadas do terreno",
						"Fixar ou soltar coordenadas",
						"Abrir teleporte por coordenadas",
						"Ir às coordenadas inseridas",
						"Fechar teleporte por coordenadas",
						"Segurar para mostrar direções de alvos importantes",
						"Fixar ou soltar direções"
				],
				"contexts": [
						"Aponte para uma construção ou dica de terreno compatível.",
						"Segure Alt ou fixe os detalhes; saia dos controles de fontes de recursos.",
						"Aponte para um ícone de recurso.",
						"Aponte para um recurso; sem linhas fixadas, segure Alt ou fixe o painel primeiro.",
						"Desbloqueie gráficos de recursos e aponte para um ícone de recurso.",
						"Disponível durante o jogo.",
						"Aponte para um terreno válido.",
						"Aponte para terreno vazio, sem carregar uma construção.",
						"Foque um controle dentro do painel de coordenadas."
				]
		},
		"it": {
				"category": "Informazioni e diagnostica",
				"labels": [
						"Tieni premuto per mostrare i dettagli degli edifici",
						"Fissa o libera i dettagli degli edifici",
						"Regola l’opacità della scheda",
						"Alterna opacità dell’intera scheda o dei soli dettagli",
						"Tieni premuto per mostrare fonti e consumatori della risorsa",
						"Fissa o libera il pannello della risorsa",
						"Mostra temporaneamente i collegamenti; rilascia per ripristinare quelli fissati",
						"Fissa, cambia o libera i collegamenti della risorsa",
						"Alterna grafico a barre e lineare della risorsa",
						"Alterna collegamenti Canvas 2D/WebGL",
						"Attiva il profiler delle fonti di risorse (diagnostica)",
						"Tieni premuto per mostrare le coordinate",
						"Fissa o libera le coordinate",
						"Apri teletrasporto per coordinate",
						"Vai alle coordinate inserite",
						"Chiudi teletrasporto per coordinate",
						"Tieni premuto per mostrare le direzioni degli obiettivi importanti",
						"Fissa o libera le direzioni"
				],
				"contexts": [
						"Punta un edificio o un suggerimento di casella supportato.",
						"Tieni Alt o fissa i dettagli; esci dai controlli delle fonti di risorse.",
						"Punta un’icona di risorsa.",
						"Punta una risorsa; senza collegamenti fissati, tieni Alt o fissa prima il pannello.",
						"Sblocca i grafici delle risorse e punta un’icona di risorsa.",
						"Disponibile durante il gioco.",
						"Punta una casella valida.",
						"Punta terreno vuoto senza tenere un edificio.",
						"Porta il focus su un controllo nel pannello coordinate."
				]
		},
		"es": {
				"category": "Información y diagnóstico",
				"labels": [
						"Mantener para mostrar detalles de edificios",
						"Fijar o soltar detalles de edificios",
						"Ajustar opacidad de la tarjeta",
						"Alternar opacidad de toda la tarjeta o solo de los detalles",
						"Mantener para mostrar fuentes y consumidores del recurso",
						"Fijar o soltar el panel del recurso",
						"Ver conexiones temporalmente; soltar restaura las fijadas",
						"Fijar, cambiar o soltar conexiones del recurso",
						"Alternar gráfico de barras y líneas del recurso",
						"Alternar conexiones Canvas 2D/WebGL",
						"Activar perfilador de fuentes de recursos (diagnóstico)",
						"Mantener para mostrar coordenadas",
						"Fijar o soltar coordenadas",
						"Abrir teletransporte por coordenadas",
						"Ir a las coordenadas introducidas",
						"Cerrar teletransporte por coordenadas",
						"Mantener para mostrar direcciones de objetivos importantes",
						"Fijar o soltar direcciones"
				],
				"contexts": [
						"Apunta a un edificio o una indicación de casilla compatible.",
						"Mantén Alt o fija los detalles; sal de los controles de fuentes de recursos.",
						"Apunta a un icono de recurso.",
						"Apunta a un recurso; sin conexiones fijadas, mantén Alt o fija primero el panel.",
						"Desbloquea los gráficos y apunta a un icono de recurso.",
						"Disponible durante el juego.",
						"Apunta a una casilla válida.",
						"Apunta a terreno vacío sin sostener un edificio.",
						"Enfoca un control dentro del panel de coordenadas."
				]
		},
		"fr": {
				"category": "Informations et diagnostic",
				"labels": [
						"Maintenir pour afficher les détails du bâtiment",
						"Épingler ou détacher les détails du bâtiment",
						"Régler l’opacité de la fiche",
						"Changer l’opacité de toute la fiche ou des détails seuls",
						"Maintenir pour voir les sources et consommateurs de la ressource",
						"Épingler ou détacher le panneau de ressource",
						"Voir temporairement les liaisons ; relâcher restaure les liaisons fixées",
						"Fixer, déplacer ou libérer les liaisons de ressource",
						"Alterner histogramme et courbe de ressource",
						"Alterner les liaisons Canvas 2D/WebGL",
						"Activer le profileur des sources de ressources (diagnostic)",
						"Maintenir pour afficher les coordonnées",
						"Épingler ou détacher les coordonnées",
						"Ouvrir la téléportation par coordonnées",
						"Aller aux coordonnées saisies",
						"Fermer la téléportation par coordonnées",
						"Maintenir pour voir la direction des cibles importantes",
						"Épingler ou détacher les directions"
				],
				"contexts": [
						"Pointer un bâtiment ou une infobulle de case compatible.",
						"Maintenir Alt ou épingler les détails ; quitter les commandes des sources de ressources.",
						"Pointer une icône de ressource.",
						"Pointer une ressource ; sans liaison fixée, maintenir Alt ou épingler le panneau au préalable.",
						"Débloquer les graphiques puis pointer une icône de ressource.",
						"Disponible en cours de partie.",
						"Pointer une case valide.",
						"Pointer un terrain vide sans tenir de bâtiment.",
						"Placer le focus sur un contrôle du panneau de coordonnées."
				]
		},
		"nl": {
				"category": "Informatie en diagnose",
				"labels": [
						"Vasthouden om gebouwdetails te tonen",
						"Gebouwdetails vastzetten of losmaken",
						"Ondoorzichtigheid van infokaart aanpassen",
						"Hele kaart of alleen details transparant maken",
						"Vasthouden om bron en verbruikers te tonen",
						"Grondstoffenpaneel vastzetten of losmaken",
						"Lijnen tijdelijk bekijken; loslaten herstelt vastgezette lijnen",
						"Grondstoflijnen vastzetten, verplaatsen of losmaken",
						"Wisselen tussen staaf- en lijngrafiek",
						"Grondstoflijnen wisselen tussen Canvas 2D/WebGL",
						"Prestatieprofiel voor grondstofbronnen schakelen (diagnose)",
						"Vasthouden om veldcoördinaten te tonen",
						"Coördinaten vastzetten of losmaken",
						"Coördinatenteleport openen",
						"Naar ingevoerde coördinaten gaan",
						"Coördinatenteleport sluiten",
						"Vasthouden om richtingen naar belangrijke doelen te tonen",
						"Doelrichtingen vastzetten of losmaken"
				],
				"contexts": [
						"Wijs een gebouw of ondersteunde veldhint aan.",
						"Houd Alt vast of zet details vast; verlaat de grondstofbediening.",
						"Wijs een grondstofpictogram aan.",
						"Wijs een grondstof aan; houd zonder vaste lijnen eerst Alt vast of zet het paneel vast.",
						"Ontgrendel grondstofgrafieken en wijs een grondstofpictogram aan.",
						"Beschikbaar tijdens het spelen.",
						"Wijs een geldig veld aan.",
						"Wijs lege grond aan zonder een gebouw vast te houden.",
						"Focus een bediening in het coördinatenpaneel."
				]
		},
		"cz": {
				"category": "Informace a diagnostika",
				"labels": [
						"Podržet pro zobrazení podrobností budovy",
						"Připnout nebo uvolnit podrobnosti budovy",
						"Upravit neprůhlednost karty",
						"Přepnout neprůhlednost celé karty nebo jen podrobností",
						"Podržet pro zobrazení zdrojů a spotřebitelů suroviny",
						"Připnout nebo uvolnit panel suroviny",
						"Dočasně zobrazit spojnice; uvolnění obnoví připnuté",
						"Připnout, přesunout nebo uvolnit spojnice suroviny",
						"Přepnout sloupcový a čárový graf suroviny",
						"Přepnout spojnice Canvas 2D/WebGL",
						"Zapnout profilování zdrojů surovin (diagnostika)",
						"Podržet pro zobrazení souřadnic",
						"Připnout nebo uvolnit souřadnice",
						"Otevřít teleport podle souřadnic",
						"Přejít na zadané souřadnice",
						"Zavřít teleport podle souřadnic",
						"Podržet pro zobrazení směrů k důležitým cílům",
						"Připnout nebo uvolnit směry"
				],
				"contexts": [
						"Ukažte na budovu nebo podporovanou nápovědu políčka.",
						"Podržte Alt nebo připněte podrobnosti; opusťte ovládání zdrojů surovin.",
						"Ukažte na ikonu suroviny.",
						"Ukažte na surovinu; bez připnutých spojnic nejdříve podržte Alt nebo připněte panel.",
						"Odemkněte grafy surovin a ukažte na ikonu suroviny.",
						"Dostupné během hry.",
						"Ukažte na platné políčko.",
						"Ukažte na prázdné místo bez držené budovy.",
						"Zaměřte ovládací prvek v panelu souřadnic."
				]
		},
		"pl": {
				"category": "Informacje i diagnostyka",
				"labels": [
						"Przytrzymaj, aby pokazać szczegóły budynku",
						"Przypnij lub odepnij szczegóły budynku",
						"Zmień przezroczystość karty",
						"Przełącz przezroczystość całej karty lub samych szczegółów",
						"Przytrzymaj, aby pokazać źródła i odbiorców zasobu",
						"Przypnij lub odepnij panel zasobu",
						"Tymczasowo pokaż połączenia; zwolnienie przywraca przypięte",
						"Przypnij, przenieś lub zwolnij połączenia zasobu",
						"Przełącz wykres słupkowy i liniowy zasobu",
						"Przełącz połączenia Canvas 2D/WebGL",
						"Włącz profiler źródeł zasobów (diagnostyka)",
						"Przytrzymaj, aby pokazać współrzędne",
						"Przypnij lub odepnij współrzędne",
						"Otwórz teleport według współrzędnych",
						"Przejdź do wpisanych współrzędnych",
						"Zamknij teleport według współrzędnych",
						"Przytrzymaj, aby pokazać kierunki ważnych celów",
						"Przypnij lub odepnij kierunki"
				],
				"contexts": [
						"Wskaż budynek lub obsługiwaną podpowiedź pola.",
						"Przytrzymaj Alt lub przypnij szczegóły; opuść sterowanie źródłami zasobów.",
						"Wskaż ikonę zasobu.",
						"Wskaż zasób; bez przypiętych połączeń najpierw przytrzymaj Alt lub przypnij panel.",
						"Odblokuj wykresy i wskaż ikonę zasobu.",
						"Dostępne podczas gry.",
						"Wskaż prawidłowe pole.",
						"Wskaż pusty teren bez trzymanego budynku.",
						"Ustaw fokus na kontrolce panelu współrzędnych."
				]
		},
		"jp": {
				"category": "情報と診断",
				"labels": [
						"長押しで建物の詳細を表示",
						"建物の詳細を固定・解除",
						"情報カードの不透明度を調整",
						"カード全体・詳細のみの透明化を切り替え",
						"長押しで資源の供給元と消費先を表示",
						"資源パネルを固定・解除",
						"長押しで資源の接続線を一時表示し、離すと固定線に戻す",
						"資源の接続線を固定・移動・解除",
						"資源の棒グラフ・折れ線グラフを切り替え",
						"資源の接続線を Canvas 2D/WebGL で切り替え",
						"資源供給元の性能プロファイラーを切り替え（診断）",
						"長押しでタイル座標を表示",
						"座標を固定・解除",
						"座標テレポートを開く",
						"入力した座標へ移動",
						"座標テレポートを閉じる",
						"長押しで重要な目標の方向を表示",
						"目標の方向を固定・解除"
				],
				"contexts": [
						"建物または対応するタイルのヒントを指してください。",
						"Alt を押すか詳細を固定し、資源供給元の操作対象から離れてください。",
						"資源アイコンを指してください。",
						"資源を指してください。線が未固定なら先に Alt を押すかパネルを固定してください。",
						"資源グラフを解放してから資源アイコンを指してください。",
						"ゲーム中に使用できます。",
						"有効なタイルを指してください。",
						"建物を持たずに空き地を指してください。",
						"座標パネル内の操作項目にフォーカスしてください。"
				]
		},
		"kr": {
				"category": "정보 및 진단",
				"labels": [
						"누르고 있으면 건물 상세 정보 표시",
						"건물 상세 정보 고정 또는 해제",
						"정보 카드 불투명도 조절",
						"전체 카드 또는 상세 정보만 투명하게 전환",
						"누르고 있으면 자원 공급원과 소비처 표시",
						"자원 패널 고정 또는 해제",
						"누르고 있으면 연결선을 임시 표시하고 놓으면 고정선 복원",
						"자원 연결선 고정, 이동 또는 해제",
						"자원 막대/선 그래프 전환",
						"자원 연결선 Canvas 2D/WebGL 전환",
						"자원 공급원 성능 프로파일러 전환 (진단)",
						"누르고 있으면 타일 좌표 표시",
						"좌표 고정 또는 해제",
						"좌표 순간이동 열기",
						"입력한 좌표로 이동",
						"좌표 순간이동 닫기",
						"누르고 있으면 주요 목표 방향 표시",
						"목표 방향 고정 또는 해제"
				],
				"contexts": [
						"건물 또는 지원되는 타일 도움말을 가리키세요.",
						"Alt를 누르거나 상세 정보를 고정하고 자원 공급원 조작에서 벗어나세요.",
						"자원 아이콘을 가리키세요.",
						"자원을 가리키세요. 고정선이 없으면 먼저 Alt를 누르거나 패널을 고정하세요.",
						"자원 그래프를 해제한 뒤 자원 아이콘을 가리키세요.",
						"게임 중 사용 가능합니다.",
						"유효한 타일을 가리키세요.",
						"건물을 들지 않은 상태로 빈 땅을 가리키세요.",
						"좌표 패널 안의 조작 항목에 초점을 두세요."
				]
		},
		"thai": {
				"category": "ข้อมูลและการวินิจฉัย",
				"labels": [
						"กดค้างเพื่อแสดงรายละเอียดสิ่งปลูกสร้าง",
						"ตรึงหรือเลิกตรึงรายละเอียดสิ่งปลูกสร้าง",
						"ปรับความทึบของบัตรข้อมูล",
						"สลับความโปร่งใสทั้งบัตรหรือเฉพาะรายละเอียด",
						"กดค้างเพื่อแสดงแหล่งผลิตและผู้ใช้ทรัพยากร",
						"ตรึงหรือเลิกตรึงแผงทรัพยากร",
						"กดค้างเพื่อดูเส้นเชื่อมชั่วคราว ปล่อยเพื่อคืนเส้นที่ตรึงไว้",
						"ตรึง ย้าย หรือปล่อยเส้นเชื่อมทรัพยากร",
						"สลับกราฟแท่งและกราฟเส้นทรัพยากร",
						"สลับเส้นเชื่อม Canvas 2D/WebGL",
						"เปิดหรือปิดตัววิเคราะห์ประสิทธิภาพแหล่งทรัพยากร (วินิจฉัย)",
						"กดค้างเพื่อแสดงพิกัดช่อง",
						"ตรึงหรือเลิกตรึงพิกัด",
						"เปิดการย้ายตามพิกัด",
						"ย้ายไปยังพิกัดที่ป้อน",
						"ปิดการย้ายตามพิกัด",
						"กดค้างเพื่อแสดงทิศทางเป้าหมายสำคัญ",
						"ตรึงหรือเลิกตรึงทิศทาง"
				],
				"contexts": [
						"ชี้สิ่งปลูกสร้างหรือคำแนะนำช่องที่รองรับ",
						"กด Alt หรือตรึงรายละเอียด และออกจากส่วนควบคุมแหล่งทรัพยากร",
						"ชี้ไอคอนทรัพยากร",
						"ชี้ทรัพยากร หากยังไม่ตรึงเส้น ให้กด Alt หรือตรึงแผงก่อน",
						"ปลดล็อกกราฟทรัพยากรแล้วชี้ไอคอนทรัพยากร",
						"ใช้ได้ระหว่างเล่นเกม",
						"ชี้ช่องที่ใช้งานได้",
						"ชี้พื้นที่ว่างโดยไม่ได้ถือสิ่งปลูกสร้าง",
						"โฟกัสตัวควบคุมภายในแผงพิกัด"
				]
		},
		"hu": {
				"category": "Információ és diagnosztika",
				"labels": [
						"Tartsd nyomva az épületadatok megjelenítéséhez",
						"Épületadatok rögzítése vagy feloldása",
						"Információs kártya átlátszatlanságának állítása",
						"Teljes kártya vagy csak az adatok átlátszóságának váltása",
						"Tartsd nyomva az erőforrás forrásainak és fogyasztóinak megjelenítéséhez",
						"Erőforráspanel rögzítése vagy feloldása",
						"Kapcsolatok ideiglenes megjelenítése; felengedve visszaállnak a rögzítettek",
						"Erőforráskapcsolatok rögzítése, áthelyezése vagy feloldása",
						"Erőforrás oszlop-/vonaldiagram váltása",
						"Canvas 2D/WebGL erőforráskapcsolatok váltása",
						"Erőforrásforrások teljesítményprofilozójának kapcsolása (diagnosztika)",
						"Tartsd nyomva a mezőkoordinátákhoz",
						"Koordináták rögzítése vagy feloldása",
						"Koordinátás teleport megnyitása",
						"Ugrás a megadott koordinátákra",
						"Koordinátás teleport bezárása",
						"Tartsd nyomva a fontos célok irányaihoz",
						"Célirányok rögzítése vagy feloldása"
				],
				"contexts": [
						"Mutass épületre vagy támogatott mezőtipp-re.",
						"Tartsd az Alt billentyűt vagy rögzítsd az adatokat; hagyd el az erőforrás-kezelést.",
						"Mutass egy erőforrásikonra.",
						"Mutass erőforrásra; rögzített vonalak nélkül előbb tartsd az Alt-ot vagy rögzítsd a panelt.",
						"Oldd fel a diagramokat, majd mutass egy erőforrásikonra.",
						"Játék közben érhető el.",
						"Mutass érvényes mezőre.",
						"Mutass üres területre épület tartása nélkül.",
						"Fókuszálj a koordinátapanel egyik vezérlőjére."
				]
		},
		"lv": {
				"category": "Informācija un diagnostika",
				"labels": [
						"Turēt, lai rādītu ēkas informāciju",
						"Piespraust vai atbrīvot ēkas informāciju",
						"Mainīt informācijas kartes necaurspīdīgumu",
						"Pārslēgt visas kartes vai tikai informācijas caurspīdīgumu",
						"Turēt, lai rādītu resursa avotus un patērētājus",
						"Piespraust vai atbrīvot resursa paneli",
						"Īslaicīgi rādīt saites; atlaižot atjaunot fiksētās",
						"Fiksēt, pārvietot vai atbrīvot resursa saites",
						"Pārslēgt resursa stabiņu/līniju diagrammu",
						"Pārslēgt resursa saišu Canvas 2D/WebGL",
						"Ieslēgt resursu avotu veiktspējas profilētāju (diagnostika)",
						"Turēt, lai rādītu lauciņa koordinātas",
						"Piespraust vai atbrīvot koordinātas",
						"Atvērt teleportāciju pēc koordinātām",
						"Doties uz ievadītajām koordinātām",
						"Aizvērt teleportāciju pēc koordinātām",
						"Turēt, lai rādītu svarīgu mērķu virzienus",
						"Piespraust vai atbrīvot virzienus"
				],
				"contexts": [
						"Norādiet uz ēku vai atbalstītu lauciņa padomu.",
						"Turiet Alt vai piespraudiet informāciju; izejiet no resursu avotu vadības.",
						"Norādiet uz resursa ikonu.",
						"Norādiet uz resursu; bez fiksētām saitēm vispirms turiet Alt vai piespraudiet paneli.",
						"Atbloķējiet diagrammas un norādiet uz resursa ikonu.",
						"Pieejams spēles laikā.",
						"Norādiet uz derīgu lauciņu.",
						"Norādiet uz tukšu zemi, neturot ēku.",
						"Fokusējiet vadīklu koordinātu panelī."
				]
		},
		"ro": {
				"category": "Informații și diagnostic",
				"labels": [
						"Ține apăsat pentru detaliile clădirii",
						"Fixează sau eliberează detaliile clădirii",
						"Ajustează opacitatea cardului",
						"Schimbă opacitatea întregului card sau doar a detaliilor",
						"Ține apăsat pentru sursele și consumatorii resursei",
						"Fixează sau eliberează panoul resursei",
						"Arată temporar legăturile; eliberarea restabilește legăturile fixate",
						"Fixează, mută sau eliberează legăturile resursei",
						"Comută graficul resursei între bare și linii",
						"Comută legăturile Canvas 2D/WebGL",
						"Comută profilarea surselor de resurse (diagnostic)",
						"Ține apăsat pentru coordonatele celulei",
						"Fixează sau eliberează coordonatele",
						"Deschide teleportarea prin coordonate",
						"Mergi la coordonatele introduse",
						"Închide teleportarea prin coordonate",
						"Ține apăsat pentru direcțiile țintelor importante",
						"Fixează sau eliberează direcțiile"
				],
				"contexts": [
						"Indică o clădire sau un indiciu de celulă acceptat.",
						"Ține Alt sau fixează detaliile; ieși din comenzile surselor de resurse.",
						"Indică o pictogramă de resursă.",
						"Indică o resursă; fără legături fixate, ține Alt sau fixează mai întâi panoul.",
						"Deblochează graficele, apoi indică o pictogramă de resursă.",
						"Disponibil în timpul jocului.",
						"Indică o celulă validă.",
						"Indică teren gol fără să ții o clădire.",
						"Focalizează un control din panoul de coordonate."
				]
		},
		"no": {
				"category": "Informasjon og diagnostikk",
				"labels": [
						"Hold inne for å vise bygningsdetaljer",
						"Fest eller løsne bygningsdetaljer",
						"Juster infokortets ugjennomsiktighet",
						"Bytt gjennomsiktighet for hele kortet eller bare detaljer",
						"Hold inne for å vise ressurskilder og forbrukere",
						"Fest eller løsne ressurspanelet",
						"Vis forbindelser midlertidig; slipp for å gjenopprette låste linjer",
						"Lås, flytt eller frigjør ressurslinjer",
						"Bytt mellom stolpe- og linjediagram",
						"Bytt ressurslinjer mellom Canvas 2D/WebGL",
						"Slå på ressurskildenes ytelsesprofilering (diagnostikk)",
						"Hold inne for å vise rutekoordinater",
						"Fest eller løsne koordinater",
						"Åpne koordinatteleportering",
						"Gå til de angitte koordinatene",
						"Lukk koordinatteleportering",
						"Hold inne for å vise retninger til viktige mål",
						"Fest eller løsne målretninger"
				],
				"contexts": [
						"Pek på en bygning eller et støttet rutehint.",
						"Hold Alt eller fest detaljene; forlat ressurskildekontrollene.",
						"Pek på et ressursikon.",
						"Pek på en ressurs; uten låste linjer må du først holde Alt eller feste panelet.",
						"Lås opp ressursdiagrammer og pek på et ressursikon.",
						"Tilgjengelig mens du spiller.",
						"Pek på en gyldig rute.",
						"Pek på tom mark uten å holde en bygning.",
						"Fokuser en kontroll i koordinatpanelet."
				]
		}
}
	}
})
