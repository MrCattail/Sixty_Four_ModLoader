(function (global) {
	'use strict'

	// en and sch are snapshots of desktop 1.3 vanilla words.js for side-by-side review.
	// Edit modsch values for the optimized in-game language. null means vanilla has no source entry.
	global.__cattailTweaksSimplifiedChineseTrilingual = {
		"splash": {
			"sixtyfour": {
				"en": "SIXTY&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;FOUR",
				"sch": "陆&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;肆",
				"modsch": "陆&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;肆"
			},
			"continue": {
				"en": "<span>CONTINUE</span><div class=\"keyboard\">Esc</div>",
				"sch": "<span>继续</span><div class=\"keyboard\">Esc</div>",
				"modsch": "<span>继续</span><div class=\"keyboard\">Esc</div>"
			},
			"start": {
				"en": "<span>START</span><div class=\"keyboard\">Esc</div>",
				"sch": "<span>开始</span><div class=\"keyboard\">Esc</div>",
				"modsch": "<span>开始</span><div class=\"keyboard\">Esc</div>"
			},
			"soundoff": {
				"en": "SOUND IS OFF",
				"sch": "声音已关闭",
				"modsch": "声音已关闭"
			},
			"soundon": {
				"en": "SOUND IS ON",
				"sch": "声音已开启",
				"modsch": "声音已开启"
			},
			"save": {
				"en": "SAVE",
				"sch": "保存",
				"modsch": "保存"
			},
			"load": {
				"en": "LOAD",
				"sch": "加载",
				"modsch": "加载"
			},
			"language": {
				"en": "LANGUAGE: ENGLISH",
				"sch": "语言：简体中文",
				"modsch": "语言：简体中文[优化]"
			},
			"reset": {
				"en": "RESET",
				"sch": "重置",
				"modsch": "重置进度"
			},
			"credit": {
				"en": "©2024 Oleg Danilov, published by Playsaurus. Version",
				"sch": "©2024 Oleg Danilov，由 Playsaurus 出版。版本",
				"modsch": "©2024 Oleg Danilov，由 Playsaurus 出版。版本"
			},
			"warning": {
				"en": "You'll lose everything, I kid you not. Keep holding to commit.",
				"sch": "你会失去一切，我没骗你。继续按住以确认。",
				"modsch": "你会失去一切，我可不是闹着玩的。继续长按以确认。"
			},
			"glory": {
				"en": "ACHIEVEMENTS",
				"sch": "成就",
				"modsch": "成就"
			},
			"deglory": {
				"en": "BACK",
				"sch": "返回",
				"modsch": "返回"
			},
			"quit": {
				"en": "QUIT",
				"sch": "退出",
				"modsch": "退出"
			},
			"export": {
				"en": "Export",
				"sch": "导出",
				"modsch": "导出"
			},
			"import": {
				"en": "Import",
				"sch": "导入",
				"modsch": "导入"
			},
			"flashbang": {
				"en": "Bright flashing lights are part of this game. If you are sensitive to them, you may consider disabling flashes by clicking this icon.",
				"sch": "游戏包含强光频闪画面。如果你对它们敏感请考虑通过点击此图标以禁用它们。",
				"modsch": "游戏包含强光频闪视效。如果你对它们敏感可以点击此图标以禁用相关效果。"
			},
			"slot": {
				"en": "Slot",
				"sch": null,
				"modsch": "存档槽"
			},
			"newslot": {
				"en": "New game",
				"sch": null,
				"modsch": "新游戏"
			},
			"imported": {
				"en": "Imported",
				"sch": null,
				"modsch": "已导入"
			},
			"importClipboard": {
				"en": "Import from clipboard",
				"sch": null,
				"modsch": "从剪贴板导入"
			},
			"wipe": {
				"en": "Delete this slot",
				"sch": null,
				"modsch": "删除此存档槽"
			},
			"switchslot": {
				"en": "Switch to this slot",
				"sch": null,
				"modsch": "切换到此存档槽"
			}
		},
		"achievements": [
			{
				"name": {
					"en": "Fool's gold",
					"sch": "假冒的金",
					"modsch": "假冒黄金"
				},
				"description": {
					"en": "Get some Elmerine",
					"sch": "获得埃尔梅林",
					"modsch": "获得[黄]稀土"
				}
			},
			{
				"name": {
					"en": "Deep Purple",
					"sch": "紫气东来",
					"modsch": "紫气东来"
				},
				"description": {
					"en": "Get Qanetite",
					"sch": "获得卡内特石",
					"modsch": "获得[紫]硅晶"
				}
			},
			{
				"name": {
					"en": "Blood of the land",
					"sch": "大地之血",
					"modsch": "大地之血"
				},
				"description": {
					"en": "Get Beta-Pylene",
					"sch": "获得贝塔派伦",
					"modsch": "获得[红]高能聚合物"
				}
			},
			{
				"name": {
					"en": "Green energy",
					"sch": "绿色能源",
					"modsch": "绿色能源"
				},
				"description": {
					"en": "Find a Hell gem",
					"sch": "获得地狱宝石",
					"modsch": "获得[绿]地心晶体"
				}
			},
			{
				"name": {
					"en": "Hot glass",
					"sch": "炽热玻璃",
					"modsch": "炽热玻璃"
				},
				"description": {
					"en": "Find a Chromalit",
					"sch": "获得铬马利特",
					"modsch": "获得[青]核能气体"
				}
			},
			{
				"name": {
					"en": "Holy concrete",
					"sch": "神圣砼土",
					"modsch": "神圣砼土"
				},
				"description": {
					"en": "Get some Celestial Foam",
					"sch": "获得天体泡沫",
					"modsch": "获得[白]量子泡沫"
				}
			},
			{
				"name": {
					"en": "Can it do dishes?",
					"sch": "刷碗神器",
					"modsch": "刷碗神器"
				},
				"description": {
					"en": "Get a Hollow Stone",
					"sch": "获得空心石",
					"modsch": "获得空心石"
				}
			},
			{
				"name": {
					"en": "Where the Sun don't shine",
					"sch": "无尽深渊",
					"modsch": "无尽深渊"
				},
				"description": {
					"en": "Get some Void",
					"sch": "获得虚空石",
					"modsch": "获得虚空"
				}
			},
			{
				"name": {
					"en": "Who you gonna call?",
					"sch": "捉鬼敢死队",
					"modsch": "捉鬼敢死队"
				},
				"description": {
					"en": "Get some Reality",
					"sch": "获得现实石",
					"modsch": "获得现实"
				}
			},
			{
				"name": {
					"en": "Nietzsche",
					"sch": "尼采",
					"modsch": "尼采"
				},
				"description": {
					"en": "Stare into the abyss 64 times",
					"sch": "凝视深渊64次",
					"modsch": "凝视深渊64次"
				}
			},
			{
				"name": {
					"en": "64K",
					"sch": "64K",
					"modsch": "64K"
				},
				"description": {
					"en": "Get 64 000 stones",
					"sch": "获得64,000块石头",
					"modsch": "获得64,000块石头"
				}
			},
			{
				"name": {
					"en": "64M",
					"sch": "64M",
					"modsch": "64M"
				},
				"description": {
					"en": "Get 64 000 000 stones",
					"sch": "获得64,000,000,000块石头",
					"modsch": "获得64,000,000,000块石头"
				}
			},
			{
				"name": {
					"en": "64B",
					"sch": "64B",
					"modsch": "64B"
				},
				"description": {
					"en": "Get 64 000 000 000 stones",
					"sch": "获得64,000,000,000块石头",
					"modsch": "获得64,000,000,000块石头"
				}
			},
			{
				"name": {
					"en": "You may reset now",
					"sch": "您重开罢",
					"modsch": "您重开罢"
				},
				"description": {
					"en": "Get stuck in the beginning",
					"sch": "一开始就卡住",
					"modsch": "刚开始就卡住"
				}
			},
			{
				"name": {
					"en": "Perpetum shmobile",
					"sch": "永动机",
					"modsch": "永动机你太美"
				},
				"description": {
					"en": "Put two silos together",
					"sch": "将两个筒仓放在一起",
					"modsch": "将两个筒仓放在一起"
				}
			},
			{
				"name": {
					"en": "Need a break?",
					"sch": "需要休息吗？",
					"modsch": "需要休息吗？"
				},
				"description": {
					"en": "Play for 64 hours in a single run",
					"sch": "玩64小时",
					"modsch": "在同一轮游戏中累计游玩 64 小时"
				}
			},
			{
				"name": {
					"en": "Must... Destroy",
					"sch": "必须……摧毁",
					"modsch": "必须……摧毁"
				},
				"description": {
					"en": "Click a cube 6400 times",
					"sch": "点击资源立方体6400次",
					"modsch": "点击矿方体6400次"
				}
			},
			{
				"name": {
					"en": "Architect",
					"sch": "建筑师",
					"modsch": "建筑师"
				},
				"description": {
					"en": "Build 64 machines",
					"sch": "建造64台机器",
					"modsch": "建造64台机器"
				}
			},
			{
				"name": {
					"en": "Destroyer",
					"sch": "拆迁办",
					"modsch": "拆迁办"
				},
				"description": {
					"en": "Destroy 64 machines",
					"sch": "摧毁64台机器",
					"modsch": "摧毁64台机器"
				}
			},
			{
				"name": {
					"en": "Hellraiser",
					"sch": "地狱行者",
					"modsch": "地心富翁"
				},
				"description": {
					"en": "Have 9 Hell Vaults",
					"sch": "拥有9个地狱金库",
					"modsch": "拥有9个地心金库"
				}
			},
			{
				"name": {
					"en": "End/Beginning",
					"sch": "结束/开始",
					"modsch": "结束/开始"
				},
				"description": {
					"en": "Explode the Inverse Chasm",
					"sch": "引爆逆裂缝",
					"modsch": "引爆逆裂缝"
				}
			},
			{
				"name": {
					"en": "Cookie clicker",
					"sch": "饼干点击器",
					"modsch": "饼干点击器"
				},
				"description": {
					"en": "Click a cookie",
					"sch": "点击饼干",
					"modsch": "点击饼干"
				}
			},
			{
				"name": {
					"en": "Drunken sailor",
					"sch": "醉酒水手",
					"modsch": "醉酒水手"
				},
				"description": {
					"en": "Honk 64 times for no reason",
					"sch": "无故鸣笛64次",
					"modsch": "无故鸣笛64次"
				}
			},
			{
				"name": {
					"en": "Mr. Mine",
					"sch": "矿工先生",
					"modsch": "矿工先生"
				},
				"description": {
					"en": "Have 9 Excavating Channels",
					"sch": "拥有9条挖掘通道",
					"modsch": "拥有9座矿井 LV2"
				}
			},
			{
				"name": {
					"en": "Is there a limit?",
					"sch": "有下限吗？",
					"modsch": "能挖到底吗？"
				},
				"description": {
					"en": "Dig down 64 km deep",
					"sch": "挖掘64公里深",
					"modsch": "下钻深度达64公里"
				}
			},
			{
				"name": {
					"en": "Seth Brundle",
					"sch": "赛斯·布朗多",
					"modsch": "变蝇人"
				},
				"description": {
					"en": "Teleport <s>1</s> 64 times",
					"sch": "传送 <s>1</s> 64次",
					"modsch": "传送 <s>1</s> 64次"
				}
			},
			{
				"name": {
					"en": "Red-Blue Rock",
					"sch": "红蓝岩",
					"modsch": "红蓝岩"
				},
				"description": {
					"en": "Finish the game without deleting anything for 15 minutes and having less than 15 Containment Silos",
					"sch": "在不删除任何东西的情况下，游戏进行15分钟并且拥有少于15个隔离仓",
					"modsch": "15分钟内，在不拆除任何建筑并且拥有15个以下的核能气体储存罐，通关游戏"
				}
			},
			{
				"name": {
					"en": "Straight to hell!",
					"sch": "直奔地狱！",
					"modsch": "直奔地心！"
				},
				"description": {
					"en": "Get a Hell Gem within the first 64 minutes from the start",
					"sch": "开始后的64分钟内获得地狱宝石",
					"modsch": "开始后的64分钟内获得[绿]地心晶体"
				}
			},
			{
				"name": {
					"en": "Scratch the surface",
					"sch": "流于表面",
					"modsch": "初见端倪"
				},
				"description": {
					"en": "Dig down 64 meters deep",
					"sch": "挖掘64米深",
					"modsch": "下钻深度达64米"
				}
			},
			{
				"name": {
					"en": "Is it hot?",
					"sch": "它热吗？",
					"modsch": "热不热？"
				},
				"description": {
					"en": "Dig down 640 meters deep",
					"sch": "挖掘640米深",
					"modsch": "下钻深度达640米"
				}
			},
			{
				"name": {
					"en": "Too deep",
					"sch": "深渊",
					"modsch": "深渊"
				},
				"description": {
					"en": "Dig down 6400 meters deep",
					"sch": "挖掘6400米深",
					"modsch": "下钻深度达6400米"
				}
			},
			{
				"name": {
					"en": "64 kmph down",
					"sch": "快速下坠",
					"modsch": "高速下坠"
				},
				"description": {
					"en": "Reach a depth of 6400m within 6 minutes of placing a fresh Excavation channel",
					"sch": "在放置新的挖掘通道后于6分钟内达到6400米的深度",
					"modsch": "放置一座全新的矿井 LV2 后其于6分钟内下钻深度达到6400米"
				}
			},
			{
				"name": {
					"en": "Neophobia",
					"sch": "新事物恐惧症",
					"modsch": "恐惧新事物"
				},
				"description": {
					"en": "Complete the game without ever upgrading extraction channels",
					"sch": "在不升级提取通道的情况下完成游戏",
					"modsch": "在全程不升级矿井 LV1 的情况下通关游戏"
				}
			},
			{
				"name": {
					"en": "Swiss army well",
					"sch": "瑞士刀井",
					"modsch": "百宝井"
				},
				"description": {
					"en": "Construct a gradient well on a site with five unique resources",
					"sch": "在具有五种独特资源的场地上建造一个渐变井",
					"modsch": "在一个同时具有五种不同资源的地点上建造一个丰度矿井"
				}
			}
		],
		"resources": [
			{
				"en": "Charonite",
				"sch": "查伦石",
				"modsch": "[灰]卡戎碳"
			},
			{
				"en": "Elmerine",
				"sch": "埃尔梅林",
				"modsch": "[黄]稀土"
			},
			{
				"en": "Qanetite",
				"sch": "卡内特石",
				"modsch": "[紫]硅晶"
			},
			{
				"en": "Beta-Pylene",
				"sch": "贝塔派伦",
				"modsch": "[红]高能聚合物"
			},
			{
				"en": "Hell Gem",
				"sch": "地狱宝石",
				"modsch": "[绿]地心晶体"
			},
			{
				"en": "Chromalit",
				"sch": "铬马利特",
				"modsch": "[青]核能气体"
			},
			{
				"en": "Celestial foam",
				"sch": "天体泡沫",
				"modsch": "[白]量子泡沫"
			},
			{
				"en": "Hollow stone",
				"sch": "空心石",
				"modsch": "空心石"
			},
			{
				"en": "Void",
				"sch": "虚空石",
				"modsch": "虚空"
			},
			{
				"en": "Reality",
				"sch": "现实石",
				"modsch": "现实"
			}
		],
		"entities": {
			"pinhole": {
				"name": {
					"en": "?",
					"sch": "？",
					"modsch": "？"
				},
				"description": {
					"en": "U/D, C/S, T/B, E/νE, μ/νμ, τ/ντ, G/γ, Z/W, H, Δ/νΔ",
					"sch": "U/D、C/S、T/B、E/νE、μ/νμ、τ/ντ、G/γ、Z/W、H、Δ/νΔ",
					"modsch": "U/D、C/S、T/B、E/νE、μ/νμ、τ/ντ、G/γ、Z/W、H、Δ/νΔ"
				}
			},
			"gradient": {
				"name": {
					"en": "Gradient well",
					"sch": "渐变井",
					"modsch": "丰度矿井"
				},
				"description": {
					"en": "An everlasting mineable cube. Responds to most destabilizers and resonators. Should be connected to the Inverse Chasm via conductors.",
					"sch": "一个永久的可开采立方体。对大多数去稳定器和共振器做出响应。应通过导体连接到逆裂缝。",
					"modsch": "一座能发现并同时开采多种资源的特殊矿井。本体相当于一个可无限开采的矿方体，受大多数挖矿机/解构加速器的效果影响。提示：可以用导线连接到逆裂缝。"
				}
			},
			"chasm": {
				"name": {
					"en": "The Inverse Chasm",
					"sch": "逆裂缝",
					"modsch": "逆裂缝"
				},
				"description": {
					"en": "A bridge to the unknown.",
					"sch": "通往未知的桥。",
					"modsch": "一座通往未知维度的桥。"
				}
			},
			"conductor": {
				"name": {
					"en": "Conductor",
					"sch": "导体",
					"modsch": "导线"
				},
				"description": {
					"en": "Connects the Inverse Chasm to industrial silos.",
					"sch": "将逆裂缝与工业筒仓连接起来。",
					"modsch": "能在机器之间输送资源的通道。提示：可以将逆裂缝与高级筒仓连接起来。"
				}
			},
			"pump": {
				"name": {
					"en": "Extracting channel",
					"sch": "提取通道",
					"modsch": "矿井 LV1"
				},
				"description": {
					"en": "Extracts resources and places them all around itself.",
					"sch": "提取资源并将其放置在自身周围。",
					"modsch": "能开采资源并将矿方体放置在四周。"
				}
			},
			"pump2": {
				"name": {
					"en": "Excavating channel",
					"sch": "挖掘通道",
					"modsch": "矿井 LV2"
				},
				"description": {
					"en": "An extracting channel upgrade. Excavates a lot of resources fast and places them further around itself.",
					"sch": "提取通道升级。快速挖掘大量资源并将其放置在自身周围更远的地方。",
					"modsch": "矿井 LV1 的升级版。能快速挖掘大量资源并将矿方体放置在四周更远的地方。"
				}
			},
			"vault": {
				"name": {
					"en": "Hell vault",
					"sch": "地狱金库",
					"modsch": "地心金库"
				},
				"description": {
					"en": "Insulates 1024 Hell Gems from environment.",
					"sch": "将1024颗地狱宝石与周遭隔绝。",
					"modsch": "能密封存储1024颗[绿]地心晶体的容器。防止它们进行湮灭。"
				}
			},
			"cube": {
				"name": {
					"en": "Resource cube",
					"sch": "资源立方体",
					"modsch": "矿方体"
				},
				"description": {
					"en": "Extracted resources.",
					"sch": "提取的资源。",
					"modsch": "挖上来的巨大方形矿体。"
				}
			},
			"destabilizer": {
				"name": {
					"en": "Destabilizer",
					"sch": "去稳定器",
					"modsch": "解构加速器 LV1"
				},
				"description": {
					"en": "Place this next to a cube to break it twice as fast. Requires an Elmerine to operate. Additional destabilizers increase the effect.",
					"sch": "将周围资源立方体的破坏速度提高至2倍。需要1个埃尔梅林才能运作。额外的不稳定器会增加效果。",
					"modsch": "放置在矿方体旁边，破坏矿方体的力量提高至2倍。需要投入1个[黄]稀土才能运作。多个解构加速器能叠加效果。"
				}
			},
			"destabilizer2": {
				"name": {
					"en": "Industrial destabilizer",
					"sch": "工业去稳定器",
					"modsch": "解构加速器 LV2"
				},
				"description": {
					"en": "A destabilizer upgrade. Quadruples the power of resource-crushing process. Requires 64 Elmerine to operate. Additional destabilizers increase the effect.",
					"sch": "去稳定器的升级版。可以将资源粉碎过程的威力提高至4倍。需要64个埃尔梅林才能运作。额外的不稳定器可以增加效果。",
					"modsch": "解构加速器的升级版。放置在矿方体旁边，破坏矿方体的力量提高至4倍。需要投入64个[黄]稀土才能运作。多个解构加速器能叠加效果。"
				}
			},
			"destabilizer2a": {
				"name": {
					"en": "Hell Gem destabilizer",
					"sch": "地狱宝石去稳定器",
					"modsch": "解构加速器 LV3"
				},
				"description": {
					"en": "An industrial destabilizer upgrade. Boosts the power of resource-crushing process by 625 times when a Hell Gem is present in the extracted cube. Otherwise, it provides no benefit. Requires 1 Hell Gem to operate. Additional destabilizers increase the effect.",
					"sch": "工业去稳定器的升级版。当开采的立方体中存在地狱宝石时，资源粉碎过程的威力提高至625倍，否则不会提供任何好处。需要1颗地狱宝石才能运作。额外的不稳定器可以增加效果。",
					"modsch": "解构加速器 LV2 的升级版。放置在矿方体旁边，当开采的矿方体中存在[绿]地心晶体时，破坏矿方体的力量提高至625倍；反之不进行任何力量加成。需要1颗[绿]地心晶体才能运作。多台解构加速器会叠加效果。"
				}
			},
			"doublechannel": {
				"name": {
					"en": "Channel cooler",
					"sch": "通道冷却器",
					"modsch": "矿井风冷器 LV1"
				},
				"description": {
					"en": "Place this next to the cube-extracting machine to extract cubes twice as fast. Additional coolers increase the effect.",
					"sch": "将其放置在立方体开采装置旁边，开采速度提高至2倍。额外的冷却器可增强效果。",
					"modsch": "放置在矿井旁边，矿井下钻速度可以提高至2倍。多台风冷器能叠加效果。"
				}
			},
			"doublechannel2": {
				"name": {
					"en": "Active channel cooler",
					"sch": "主动式通道冷却器",
					"modsch": "矿井风冷器 LV2"
				},
				"description": {
					"en": "A channel cooler upgrade. Triples the flow in a source channel if placed next to it. Additional coolers increase the effect.",
					"sch": "通道冷却器升级。如果放置在资源通道旁边，则其流量将增加至3倍。额外的冷却器可增强效果。",
					"modsch": "风冷器 LV1 的升级版。放置在矿井旁边，矿井下钻速度可以提高至3倍。多台风冷器能叠加效果。"
				}
			},
			"valve": {
				"name": {
					"en": "Reverse valve",
					"sch": "反向阀",
					"modsch": "辅助泵 LV1"
				},
				"description": {
					"en": "Prevents the cube-extracting machine from resetting to the original position if placed next to it. Requires a Charonite to operate.",
					"sch": "如果放置在立方体开采装置旁边，可防止开采装置重置到原始位置。需要1块查伦石才能运作。",
					"modsch": "放置在矿井旁边，矿井不会因泄压自动归位。需要1块[灰]卡戎碳才能运作。"
				}
			},
			"auxpump": {
				"name": {
					"en": "Auxiliary pump",
					"sch": "辅助泵",
					"modsch": "辅助泵 LV2"
				},
				"description": {
					"en": "A reverse valve upgrade. Provides pressure to a source channel if placed next to it. Requires 8 Elmerine to operate. Additional pumps do not increase the pressure in a source channel.",
					"sch": "反向阀的升级版。如果放置在资源通道旁边，则会为通道提供压力。需要8个埃尔梅林才能运作。额外的泵不会增加通道中的压力。",
					"modsch": "辅助泵 LV1 的升级版。放置在矿井旁边，能为矿井提供更强的压力。需要8个[黄]稀土才能运作。多个辅助泵并不会叠加效果。"
				}
			},
			"auxpump2": {
				"name": {
					"en": "Pump station",
					"sch": "抽水站",
					"modsch": "辅助泵 LV3"
				},
				"description": {
					"en": "An auxiliary pump upgrade. Provides quadrupled pressure to a source channel if placed next to it. Requires 256 Elmerine and 4 Beta-Pylene to operate. Multiple stations do not increase the flow in a source channel.",
					"sch": "辅助泵的升级版。如果放置在资源通道旁边，可提供4倍压力。需要256个埃尔梅林和4个贝塔派伦才能运作。多个抽水站并不会增加通道中的流量。",
					"modsch": "辅助泵 LV2 的升级版。放置在矿井旁边，能为矿井提供4倍的压力。需要256个[黄]稀土和4个[红]高能聚合物才能运作。多个辅助泵并不会叠加效果。"
				}
			},
			"entropic": {
				"name": {
					"en": "Entropy resonator",
					"sch": "熵共振器",
					"modsch": "熵增挖矿机 LV1"
				},
				"description": {
					"en": "Periodically crushes resources if placed next to a cube. Requires a Qanetite to operate.",
					"sch": "如果放置在立方体旁边，则会定期粉碎资源。需要1块卡内特石才能运作。",
					"modsch": "放置在矿方体旁边，能脉冲式破坏矿方体。需要1块[紫]硅晶才能运作。"
				}
			},
			"entropic2": {
				"name": {
					"en": "Entropy resonator II",
					"sch": "熵共振器 II",
					"modsch": "熵增挖矿机 LV2"
				},
				"description": {
					"en": "An entropy resonator upgrade. Crushes resources 3 times faster. Requires a Chromalit to operate.",
					"sch": "熵共振器的升级版。粉碎资源的速度提高至3倍。需要1个铬马利特才能运作。",
					"modsch": "熵增挖矿机 LV1 的升级版。放置在矿方体旁边，破坏矿方体的速度提高至3倍。需要1个[青]核能气体才能运作。"
				}
			},
			"entropic2a": {
				"name": {
					"en": "Entropy capacitor",
					"sch": "熵电容器",
					"modsch": "熵增挖矿机 LV2 [辐射冲击]"
				},
				"description": {
					"en": "An entropy resonator upgrade. Crushes resources at the moment they appear on the surface with 600% power. But just once per cube. Requires 8 Chromalits to operate.",
					"sch": "熵共振器的升级版。在资源出现在表面的那一刻以600%的力量进行粉碎。但每个立方体仅限一次。需要8个铬马利特才能运作。",
					"modsch": "熵增挖矿机 LV1 的升级变种版。放置在矿方体旁边，在矿方体出现在表面的那一刻以熵增挖矿机LV1的 600% 的力量进行冲击。但每个矿方体仅限冲击一次。需要8个[青]核能气体才能运作。"
				}
			},
			"entropic3": {
				"name": {
					"en": "Void resonator",
					"sch": "虚空共鸣器",
					"modsch": "熵增挖矿机 LV3 [虚空共鸣]"
				},
				"description": {
					"en": "An entropy resonator II upgrade. When annihilation occurs the resonator crushes cubes around it with immense power.",
					"sch": "熵共振器 II的升级版。当湮灭发生时，共振器会以巨大的力量粉碎周围的立方体。",
					"modsch": "熵增挖矿机 LV2 的升级版。放置在矿方体旁边，每次湮灭发生，挖矿机都会以巨大的力量解构周围的矿方体。"
				}
			},
			"converter32": {
				"name": {
					"en": "Charonite enrichment vat",
					"sch": "查伦石浓缩槽",
					"modsch": "稀土富集槽"
				},
				"description": {
					"en": "Slowly reacts Qanetite with Charonite to produce Elmerine.",
					"sch": "卡内特石与查伦石缓慢反应产生埃尔梅林。",
					"modsch": "[紫]硅晶与[灰]卡戎碳缓慢反应，产生[黄]稀土。"
				}
			},
			"converter13": {
				"name": {
					"en": "Charonite sump",
					"sch": "查伦石坑",
					"modsch": "硅晶沉积池"
				},
				"description": {
					"en": "Reclaims Qanetite from liquefied Charonite sediments in the presence of catalysts.",
					"sch": "在催化剂作用下从液化的查伦石沉积物中回收卡内特石。",
					"modsch": "在催化剂作用下从液化的[灰]卡戎碳沉积物中，回收[紫]硅晶。"
				}
			},
			"converter41": {
				"name": {
					"en": "Beta-Pylene oxidizer",
					"sch": "贝塔派伦氧化塔",
					"modsch": "高能聚合物氧化塔"
				},
				"description": {
					"en": "Burns Beta-Pylene to produce Charonite and trace amounts of other elements.",
					"sch": "燃烧贝塔派伦以产生查伦石和微量其他元素。",
					"modsch": "燃烧[红]高能聚合物，产生微量的[黄]稀土和[紫]硅晶，和多数[灰]卡戎碳。"
				}
			},
			"converter76": {
				"name": {
					"en": "Celestial irradiator",
					"sch": "天体辐射器",
					"modsch": "核能气体裂变器"
				},
				"description": {
					"en": "Irradiates Celestial Foam with a Chromalit, converting the Foam into Chromalits, which are a great source of Hell Gems, Beta-Pylene, Qanetite and Elmerine due to Chromalit decay.",
					"sch": "用铬马利特照射天体泡沫，将泡沫转化为铬马利特，由于铬马利特衰变，它是地狱宝石、贝塔派伦、卡内特石 和埃尔梅林的重要来源。",
					"modsch": "用[青]核能气体辐射[白]量子泡沫，将泡沫转化为[青]核能气体；由于[青]核能气体会衰变成其他资源，它是[绿]地心晶体、[红]高能聚合物、[紫]硅晶 和[黄]稀土的重要来源。"
				}
			},
			"converter64": {
				"name": {
					"en": "Celestial reactor",
					"sch": "天体反应器",
					"modsch": "核聚变反应炉"
				},
				"description": {
					"en": "Supports controllable fusion of Chromalits and Celestial Foam to produce Beta-Pylene. Can't operate in close proximity to other celestial reactors.",
					"sch": "允许铬马利特和天体泡沫的可控融合来生产贝塔派伦。无法在其他天体反应器附近运作。",
					"modsch": "允许[青]核能气体和[白]量子泡沫的可控核聚变来 生产[红]高能聚合物。！不同的核能气体反应炉范围重叠将使其无法运作！"
				}
			},
			"reflector": {
				"name": {
					"en": "Celestial reflector",
					"sch": "天体反射器",
					"modsch": "反射板"
				},
				"description": {
					"en": "Improves an adjacent celestial reactor's performance.",
					"sch": "提升相邻的天体反应器的性能。",
					"modsch": "能提升相邻的核能气体反应炉的性能。"
				}
			},
			"mega1": {
				"name": {
					"en": "Material streamer tower",
					"sch": "物料传输塔",
					"modsch": "物质传输塔 MK1"
				},
				"description": {
					"en": "Increases visibility by compressing moving resources. There can only be one.",
					"sch": "通过压缩移动资源来提高可见性。只能有一个。",
					"modsch": "通过压缩资源传输动效来提高视觉可见性。该建筑上限为1个。"
				}
			},
			"mega1a": {
				"name": {
					"en": "Material streamer tower MKII",
					"sch": "物料传输塔 MKII",
					"modsch": "物质传输塔 MK2"
				},
				"description": {
					"en": "A material streamer tower upgrade. Increases the speed of resource transfer. There can only be one.",
					"sch": "物料串流塔升级。提高资源传输速度。只能有一个。",
					"modsch": "物质传输塔 MK1 的升级版。提高资源传输速度。该建筑上限为1个。"
				}
			},
			"mega1b": {
				"name": {
					"en": "Material streamer tower MKIII",
					"sch": "物料传输塔 MKIII",
					"modsch": "物质传输塔 MK3"
				},
				"description": {
					"en": "A material streamer tower MKII upgrade. Compresses moving resources even more. There can only be one.",
					"sch": "物料传输塔MKII升级版。进一步压缩移动资源。只能有一个。",
					"modsch": "物质传输塔 MK2 的升级版。进一步压缩资源传输动效。该建筑上限为1个。"
				}
			},
			"mega2": {
				"name": {
					"en": "Recycling tower",
					"sch": "回收塔",
					"modsch": "回收塔"
				},
				"description": {
					"en": "Allows machine recycling which returns 90% of the resources. There can only be one.",
					"sch": "允许拆除机器时回收90%的资源。只能有一个。",
					"modsch": "拆除机器时能回收90%的资源。该建筑上限为1个。"
				}
			},
			"mega3": {
				"name": {
					"en": "Disassembling tower",
					"sch": "拆解塔",
					"modsch": "拆解塔"
				},
				"description": {
					"en": "A recycling tower upgrade. Allows machine disassembly which returns all the resources and machine relocation if you press [E]. There can only be one.",
					"sch": "回收塔的升级。允许机器拆除时返还所有资源。只能有一个。",
					"modsch": "回收塔的升级。拆除机器时能回收100%资源。该建筑上限为1个。"
				}
			},
			"voidsculpture": {
				"name": {
					"en": "Void admiration chancel",
					"sch": "虚空仰慕圣坛",
					"modsch": "虚空神坛"
				},
				"description": {
					"en": "Enables you to ignore visual drawbacks of the void machines.",
					"sch": "使你能够无视虚空机器造成的视线阻挡。",
					"modsch": "让人心生敬仰的坛柱。能够使你无视虚空类机器造成的频闪视效。"
				}
			},
			"eye": {
				"name": {
					"en": "Fill director",
					"sch": "填料指导器",
					"modsch": "填料提示器"
				},
				"description": {
					"en": "Indicates machines ready for filling. There can only be one.",
					"sch": "表示机器已准备好进行填充。只能有一个。",
					"modsch": "能让鼠标指向待充能状态的机器。该建筑上限为1个。"
				}
			},
			"cookie": {
				"name": {
					"en": "A cookie",
					"sch": "一块饼干",
					"modsch": "一块饼干"
				},
				"description": {
					"en": "How did it get there?",
					"sch": "你怎么在这啊？",
					"modsch": "你怎么在这啊？"
				}
			},
			"injector": {
				"name": {
					"en": "Hell Gem injector",
					"sch": "地狱宝石注射器",
					"modsch": "[绿]地心晶体注入器"
				},
				"description": {
					"en": "Swaps a random resource from an adjacent cube with a Hell Gem if there is none. Has 32 charges if provided with 32 Hell Gems and 64 Qanetite.",
					"sch": "如果没有地狱宝石，则将相邻资源立方体中的一个随机资源与地狱宝石交换。如果提供32颗地狱宝石和64颗卡内特石，则可交换32次。",
					"modsch": "如果相邻的矿方体没有[绿]地心晶体，则将其随机一个资源与[绿]地心晶体交换。一次充能可以提供32次交换。"
				}
			},
			"silo": {
				"name": {
					"en": "Underground silo",
					"sch": "地下筒仓",
					"modsch": "普通筒仓"
				},
				"description": {
					"en": "On activation refills nearby machines and then automatically refills them 16 more times",
					"sch": "激活后为附近的机器充能，并且之后会自动再充能16次",
					"modsch": "激活后能立刻充能相邻的机器，并且再自动连续充能16次。"
				}
			},
			"silo2": {
				"name": {
					"en": "Industrial silo",
					"sch": "工业筒仓",
					"modsch": "高级筒仓"
				},
				"description": {
					"en": "An underground silo upgrade. On activation refills nearby machines and then automatically refills them 64 more times",
					"sch": "地下筒仓升级。激活后会重新填充附近的机器，然后自动再填充 64 次",
					"modsch": "普通筒仓的升级版。激活后能立刻充能相邻的机器，并且再自动连续充能64次。"
				}
			},
			"vessel": {
				"name": {
					"en": "Containment vessel",
					"sch": "密封容器",
					"modsch": "核能气体储存罐 LV1"
				},
				"description": {
					"en": "Stores 32 Chromalits, preventing their fission. Consumes a Hell Gem.",
					"sch": "储存32个铬马利特，防止它们裂变。消耗1个地狱宝石。",
					"modsch": "能密封储存32个[青]核能气体以防止它们裂变。每隔一段时间需要投入1个[绿]地心晶体来维持密封。"
				}
			},
			"vessel2": {
				"name": {
					"en": "Containment silo",
					"sch": "密封筒仓",
					"modsch": "核能气体储存罐 LV2"
				},
				"description": {
					"en": "A containment vessel upgrade. Stores 32768 Chromalits preventing their fission. Consumes Reality.",
					"sch": "密封容器的升级版。储存32768个铬马利特以防止它们裂变。消耗现实石。",
					"modsch": "核能气体储存罐的升级版。能密封储存32768个[青]核能气体以防止它们裂变。每隔一段时间需要投入1个现实来维持密封。"
				}
			},
			"consumer": {
				"name": {
					"en": "Catalytic refinery",
					"sch": "催化炼油厂",
					"modsch": "催化精炼厂"
				},
				"description": {
					"en": "Consumes adjacent broken resources. After accumulating 1024 resources, it releases everything with an additional bonus. The amount of the bonus increases with each consecutive release, reaching up to 100%. If no resources are consumed in 16 seconds, the effect resets.",
					"sch": "消耗相邻的损坏资源立方体。累积1024资源后，它会释放所有资源并附带额外奖励。连续释放可使奖励金额增加，最高可达100%。如果16秒内没有消耗任何资源，效果就会重设。",
					"modsch": "吸收并存储相邻的破碎矿方体，碎矿总储量达到 1024 后，它会释放所有资源并附带精炼后的额外资源。连续释放可使精炼资源增加，最高可达原资源的100%。如果16秒内没有吸收任何资源，效果就会重置。"
				}
			},
			"preheater": {
				"name": {
					"en": "Catalytic preheater",
					"sch": "催化预热器",
					"modsch": "转换预热器"
				},
				"description": {
					"en": "Increases the speed of any resource conversion machine if placed next to one. Each converter increases the preheater's speed boost, up to 300%, if 8 machines are affected.",
					"sch": "如果放置在任何资源转换机旁边则可以增加该机器的转换速度。每增加一台转换机，预热器的速度提升就会增加。如果影响到8台机器，最高可达300%。",
					"modsch": "放置在任意转换类机器旁边，增加其转换速度。周围的转换类机器越多，预热器的速度加速效果越高。如果同时预热到8台转换类机器，预热器最高加速效果可达300%。"
				}
			},
			"hollow": {
				"name": {
					"en": "Hollow outcrop",
					"sch": "镂空岩石",
					"modsch": "空心石"
				},
				"description": {
					"en": "So many holes.",
					"sch": "这么多洞。",
					"modsch": "太多洞了..."
				}
			},
			"strange": {
				"name": {
					"en": "Hollow rock",
					"sch": "中空岩",
					"modsch": "巨大的空心石"
				},
				"description": {
					"en": "It looks like it's been there for awhile.",
					"sch": "看起来已经有一段时间了。",
					"modsch": "看起来有点古老。"
				}
			},
			"strange1": {
				"name": {
					"en": "Hollow rock research site",
					"sch": "空心石研究所",
					"modsch": "空心石研究站"
				},
				"description": {
					"en": "Makes Celestial Foam annihilate with 512 Hell Gems instead of 64. NORTH.",
					"sch": "使每块天体泡沫以512颗而非64颗地狱宝石的比率进行湮灭。位于北方。",
					"modsch": "能将[白]量子泡沫和[绿]地心晶体以 1:512 的比例进行湮灭(而非 1:64 )，(大幅度减缓[白]量子泡沫湮灭速度，相对的大幅度提高[绿]地心晶体湮灭速度)。你预感到会有全新的物质和现象即将到来..."
				}
			},
			"strange2": {
				"name": {
					"en": "Hollow rock facility",
					"sch": "空心石设施",
					"modsch": "空心石工厂"
				},
				"description": {
					"en": "Doubles the maximum amount of Hollow Stones and increases their spawn rate.",
					"sch": "将空心石的最大数量加倍，并增加它们的生成速率。",
					"modsch": "能将空心石的最大数量翻倍，并增加它们的生成速率。空心石越多，时间扭曲的几率越高。"
				}
			},
			"strange3": {
				"name": {
					"en": "Reconstructed Hollow",
					"sch": "重构空心石",
					"modsch": "重构空心石"
				},
				"description": {
					"en": "Dramatically increases Hollow Stone spawn rate and does everything silently.",
					"sch": "显著提高空心石的生成速度并默默地完成一切。",
					"modsch": "能显著提高空心石的生成速度并且安静下来。"
				}
			},
			"generaldecay": {
				"name": {
					"en": "General decay reactor",
					"sch": "通用衰变反应器",
					"modsch": "核能气体衰变限制器"
				},
				"description": {
					"en": "Dramatically improves Chromalit decay performance. There can only be one.",
					"sch": "显著提高的铬马利特衰减性能。只能有一个。",
					"modsch": "能显著提高的[青]核能气体衰减性能。该建筑上限为1个。"
				}
			},
			"waypoint": {
				"name": {
					"en": "Waypoint",
					"sch": "航点",
					"modsch": "传送点 LV1"
				},
				"description": {
					"en": "Teleports the next existing Waypoint to you.",
					"sch": "将下一个现有的导航点传送到你的位置。",
					"modsch": "点击可以将你传送到下一个传送点。"
				}
			},
			"annihilator": {
				"name": {
					"en": "Annihilator",
					"sch": "歼灭者",
					"modsch": "湮灭反应器"
				},
				"description": {
					"en": "Produces Void when Hell Gems annihilate with Celestial Foam. Requires a Hollow Stone to operate.",
					"sch": "当地狱宝石被天体泡沫消灭时会产生虚空。需要空心石才能运作。",
					"modsch": "能利用[绿]地心晶体和[白]量子泡沫的湮灭产生虚空。需要空心石才能运作。"
				}
			},
			"flower": {
				"name": {
					"en": "Hollow flower",
					"sch": "空心花",
					"modsch": "空心花"
				},
				"description": {
					"en": "Reduces the chance of time warp. Counteracts the effect of one Hollow Stone. Must be built upon a Hollow Stone. Destroys the Hollow Stone it was built upon.",
					"sch": "减少时间扭曲的机会。抵销一块空心石的效果。必须建造在空心石上，同时摧毁这块空心石。",
					"modsch": "能抵销一块空心石的效果，减少时间扭曲的机率。其必须建造在空心石上."
				}
			},
			"fruit": {
				"name": {
					"en": "Hollow fruit",
					"sch": "空心果",
					"modsch": "空心果"
				},
				"description": {
					"en": "A Hollow Flower evolution. Prevents the formation of Hollow Stones to nourish itself. Produces Hollow Stones.",
					"sch": "空心花的进化体。通过防止空心石的形成以滋养自身。可生产空心石。",
					"modsch": "空心花的进化体。能通过吞噬一颗即将生成的空心石以进入成长阶段。采摘的果实越成熟可以获得的空心石越多。"
				}
			},
			"eraser": {
				"name": {
					"en": "Demolish",
					"sch": "拆除",
					"modsch": "拆除"
				},
				"description": {
					"en": "Destroys a machine returning 50% of the resources used to construct it.",
					"sch": "摧毁一台机器，归还建造它所用资源的50%。",
					"modsch": "摧毁一台机器，能回收建造它所用资源的50%。"
				}
			},
			"eraser2": {
				"name": {
					"en": "Recycle",
					"sch": "回收",
					"modsch": "回收"
				},
				"description": {
					"en": "Recycles a machine returning 90% of the resources used to construct it.",
					"sch": "回收一台机器，归还建造它所用资源的90%。",
					"modsch": "回收一台机器，能回收建造它所用资源的90%。"
				}
			},
			"eraser3": {
				"name": {
					"en": "Disassemble",
					"sch": "拆解",
					"modsch": "拆解"
				},
				"description": {
					"en": "Disassembles a machine returning all the resources used to construct it.",
					"sch": "拆解一台机器，归还建造它所用的所有资源。",
					"modsch": "拆解一台机器，能回收建造它所用的所有资源。"
				}
			},
			"clicker1": {
				"name": {
					"en": "Qanetite oscillator",
					"sch": "卡内特石振荡器",
					"modsch": "振荡器 LV1 [硅晶]"
				},
				"description": {
					"en": "Allows you to click and hold on resources to break them. There can only be one.",
					"sch": "允许您点击并按住资源以破坏它们。只能有一个。",
					"modsch": "让你能长按矿方体进行手动破坏。该建筑上限为1个。"
				}
			},
			"clicker2": {
				"name": {
					"en": "Hell Gem oscillator",
					"sch": "地狱宝石振荡器",
					"modsch": "振荡器 LV2 [地心晶体]"
				},
				"description": {
					"en": "An upgrade to Qanetite oscillator. Increases the oscillation frequency. There can only be one.",
					"sch": "卡内特石振荡器的升级。增加振荡频率。只能有一个。",
					"modsch": "振荡器 LV1 的升级版。能增加振荡频率。该建筑上限为1个。"
				}
			},
			"clicker3": {
				"name": {
					"en": "Chromalit oscillator",
					"sch": "铬马利特振荡器",
					"modsch": "振荡器 LV3 [核能气体]"
				},
				"description": {
					"en": "An upgrade to Hell Gem oscillator. Maximizes the oscillation frequency. There can only be one.",
					"sch": "地狱宝石振荡器的升级。最大化振荡频率。只能有一个。",
					"modsch": "振荡器 LV2 的升级版。能最大化振荡频率。该建筑上限为1个。"
				}
			},
			"stabilizer": {
				"name": {
					"en": "Stabilizer",
					"sch": "稳定器",
					"modsch": "能量稳定器 LV1"
				},
				"description": {
					"en": "Stabilizes one adjacent surge to temporarily harness its power.",
					"sch": "稳定一个相邻的浪涌以暂时利用其能量。",
					"modsch": "能稳定一个相邻的浪涌以暂时利用其能量。或许我们可以利用那些从地上冒出来的异常电流..."
				}
			},
			"stabilizer2": {
				"name": {
					"en": "Stabilizer II",
					"sch": "稳定器 II",
					"modsch": "能量稳定器 LV2"
				},
				"description": {
					"en": "An upgrade to stabilizer. Improves stability and performance.",
					"sch": "稳定器升级。提高稳定性和性能。",
					"modsch": "能量稳定器 LV1 的升级版。能提高浪涌的稳定性和性能。"
				}
			},
			"stabilizer3": {
				"name": {
					"en": "Shattered stabilizer",
					"sch": "破碎的稳定器",
					"modsch": "破碎的能量稳定器"
				},
				"description": {
					"en": "Anomalous upgrade. Improves performance and maximizes stability. There can only be one.",
					"sch": "异常升级。提高性能并最大程度提高稳定性。只能有一个。",
					"modsch": "能量稳定器 LV2 的异常升级版。能提高浪涌的性能并永久稳定浪涌。该建筑上限为1个。"
				}
			},
			"scan": {
				"name": {
					"en": "Supercritical kernel",
					"sch": "超临界内核",
					"modsch": "超临界内核"
				},
				"description": {
					"en": "Knocks symbols off. Highlights potential puncture points. Spots get richer the farther you move from the center of the world.",
					"sch": "敲掉符号。突出潜在的穿刺点。距离世界中心越远，点位越丰富。",
					"modsch": "释放内核并振动一定范围内的现实结构。能收集范围内完全发光的符号，并探测范围内的资源丰度。距离世界中心越远，资源丰度点位越丰富。"
				}
			},
			"puncture": {
				"name": {
					"en": "Puncture",
					"sch": "穿刺点",
					"modsch": "隧穿洞"
				},
				"description": {
					"en": "Creates a gradient channel: a foundation for a gradient well. If a well is constructed on top, resource gains are doubled. Relocating the well removes this bonus. Feeding Reality into a raw puncture resets your position.",
					"sch": "创造渐变通道：渐变井的地基。如果在其上建造一口井，资源收益将翻倍。迁移井位将消除此加成。将现实注入原始穿刺点将重置你的位置。",
					"modsch": "一座丰度矿井的地基。如果在其上建造一做丰度矿井，资源收益将翻倍。移动丰度矿井的位置将消除此加成。将材料“现实”注入进隧穿洞会将你传送到现实中心点。"
				}
			},
			"waypoint2": {
				"name": {
					"en": "Direct chasm",
					"sch": "直接鸿沟",
					"modsch": "传送点 LV2"
				},
				"description": {
					"en": "An upgrade to waypoint. If one is connected to the inverse chasm via conductors, all others are linked to it as well, regardless of distance.",
					"sch": "航点的升级。如果一个通过导体连接到逆裂缝，所有其他的都将连接到它，无论距离多远。",
					"modsch": "传送点 LV1 的升级版。只要逆裂缝通过导线跟传送点 LV2 连接，所有资源都会被吸入传送点网络并最终流向逆裂缝。"
				}
			},
			"whitehole": {
				"name": {
					"en": "Orifice",
					"sch": null,
					"modsch": "拓井"
				},
				"description": {
					"en": "Enables you to pull out and contain a part of alien universe. Interact to choose topology. You can change topology at any time by disassembling.",
					"sch": null,
					"modsch": "让你可以拉取另一个宇宙的一部分，并且收容于此。与其交互可以选择拓扑结构。你可以随时通过拆解建筑来重新选择拓扑结构。"
				}
			},
			"collapsing": {
				"name": {
					"en": "Collapsing Orbifold",
					"sch": null,
					"modsch": "坍缩轨形"
				},
				"description": {
					"en": "Periodically crushes all the cubes with unthinkable power. Affects the Malformed Orbifold. Higher tiers reduce the cooldown.",
					"sch": null,
					"modsch": "能定期施加超乎想象的力量，破坏全图的矿方体。畸变轨形也会受到影响。等级越高，冷却时间越短。"
				}
			},
			"malformed": {
				"name": {
					"en": "Malformed Orbifold",
					"sch": null,
					"modsch": "畸变轨形"
				},
				"description": {
					"en": "Collects all the mined resources. Resources could be extracted with clicks, destabilizers, resonators, injectors and catalytic refineries. Higher tiers multiply resources.",
					"sch": null,
					"modsch": "能把所有采出的资源集中收存。提取资源的方式包括点击，以及使用解构加速器、熵增挖矿机、地心晶体注入器和催化精炼厂。等级越高，资源倍率越高。"
				}
			},
			"oversaturated": {
				"name": {
					"en": "Oversaturated Orbifold",
					"sch": null,
					"modsch": "过饱和轨形"
				},
				"description": {
					"en": "Periodically recharges all the machines. Higher tiers reduce cooldown.",
					"sch": null,
					"modsch": "能定期自动为全图的机器进行补给。等级越高，冷却时间越短。"
				}
			},
			"expanding": {
				"name": {
					"en": "Expanding Orbifold",
					"sch": null,
					"modsch": "膨胀轨形"
				},
				"description": {
					"en": "Supplies all the extractors with pressure. Coolers increase the effect. Pumps vastly increase extractors descent rate but drain double the resources. Higher tiers increase the pressure.",
					"sch": null,
					"modsch": "能为全图的矿井提供压力。在膨胀轨形周围放置矿井风冷器和辅助泵都能对下钻速度和矿井压力叠加增益。参与加成的辅助泵的燃料消耗速度会翻倍。等级越高，提供的压力越大。"
				}
			},
			"morphing": {
				"name": {
					"en": "Morphing Orbifold",
					"sch": null,
					"modsch": "变换轨形"
				},
				"description": {
					"en": "Periodically accelerates all the converters within its range. The amount of acceleration depends on the distance. Higher tiers increase the acceleration.",
					"sch": null,
					"modsch": "能定期加速以此处为中心作用范围内的所有转换器。距离越近，加速效果越强。等级越高，加速效果越强。"
				}
			},
			"intercalating": {
				"name": {
					"en": "Intercalating Orbifold",
					"sch": null,
					"modsch": "插层轨形"
				},
				"description": {
					"en": "Boosts Gradient Wells for a specific resource type. Other types are halved. Higher tiers increase the boost. Interact to select resource. Switches automatically after tier 6. Collects Reality.",
					"sch": null,
					"modsch": "能大幅提高全图的丰度矿井的指定资源的产出，但是其他资源的产出减半；并且能自动收集“现实”。等级越高，增幅越大。与其交互选择要增产的资源。达到 6 级后，会自动选择当前库存数量最少的资源种类。"
				}
			}
		},
		"messages": [
			{
				"en": "Where are you?",
				"sch": "你在哪？",
				"modsch": "你现在在什么地方？"
			},
			{
				"en": "I'm literally in the middle of nowhere",
				"sch": "真·荒无人烟之地",
				"modsch": "我都不知道这能算什么地方。像是一片荒无人烟的天堂。"
			},
			{
				"en": "Alright, what do you see?",
				"sch": "行，能看见啥？",
				"modsch": "行吧，具体能看到些什么？"
			},
			{
				"en": "Well, not much. There's this machine here, it looks kinda familiar but I can't put my finger on it",
				"sch": "额，没啥。这里有一台机器，看着有点眼熟，但又说不上来",
				"modsch": "能看到的不多。只有一台机器在这里，看着挺眼熟，但我就是想不起来是什么。"
			},
			{
				"en": "What machine?",
				"sch": "什么机器？",
				"modsch": "什么样的机器？"
			},
			{
				"en": "Hold on, maybe I can...",
				"sch": "等一下，也许我可以...",
				"modsch": "等下，我试试能不能……"
			},
			{
				"en": "Wait, tell me you are NOT touching some random machine right now!",
				"sch": "等会，你别是在乱摸一台不知道是啥的机器吧！",
				"modsch": "蛤？没有说明书的话先不要乱摸啊！"
			},
			{
				"en": "It's working! It just created something",
				"sch": "它运作了！它刚刚创造了一些东西",
				"modsch": "有反应了！有什么东西出来了！"
			},
			{
				"en": "???",
				"sch": "???",
				"modsch": "？？？"
			},
			{
				"en": "A huge black cube. It's so smooth. I really wanna break it",
				"sch": "一个巨大的黑色立方体。真是太光滑了。我真的很想敲碎它",
				"modsch": "一个超大的黑色四方体升起来了。表面跟冰面一样光滑，看得我手痒了，现在想把它打碎。"
			},
			{
				"en": "Are you high?",
				"sch": "你没事吧?",
				"modsch": "你是不是嗑嗨了？"
			},
			{
				"en": "I now have 64 stones!",
				"sch": "我现在有64块石头了！",
				"modsch": "我弄到64块石头了！"
			},
			{
				"en": "Well, okay then. Have fun with that.",
				"sch": "那好吧。祝你玩得开心。",
				"modsch": "呃呃呃，你玩得开心就好。"
			},
			{
				"en": "Hey, I found a yellow stone!",
				"sch": "嘿，我找到一块黄色的石头！",
				"modsch": "诶，我还找到一块黄色的石头！"
			},
			{
				"en": "Good for you man!",
				"sch": "好样的",
				"modsch": "那你可太厉害了!"
			},
			{
				"en": "I think I can build machines now. I should build something to help break these cubes more easily. If a cube shows up in an adjacent cell, even diagonally, it should work.",
				"sch": "我想我现在可以建造机器了。我应该建造一些东西来帮助更轻松地打破这些立方体。如果一个立方体出现在相邻的单元格中，即使是对角线，它也应该起作用。",
				"modsch": "我现在好像可以造机器了。我想先造一些机器，让我省点敲方块的力气。我发现机器只要放在方块的相邻或者对角的位置就有效果。"
			},
			{
				"en": "Wait, are you playing some weird game? You're starting to creep me out",
				"sch": "等等，你是在玩什么奇怪的游戏吗？别吓我",
				"modsch": "你是在玩什么新游戏吗？不要自言自语啊。"
			},
			{
				"en": "Now I just need to put a yellow stone inside this machine.",
				"sch": "现在我只需要将一块黄色的石头放进这台机器。",
				"modsch": "现在我只需要把一块黄色石头放进这台机器里就好。"
			},
			{
				"en": "Whatever makes you happy... Jokes aside, are you coming over today?",
				"sch": "你开心就好……哦对了，你今天要过来吗？",
				"modsch": "你怎么开心怎么来吧...说正经的，你今天还过来我这吗？"
			},
			{
				"en": "Definitely! I'll be there in a few hours, just need to finish this up.",
				"sch": "当然！几小时后到，只需先完成这个。",
				"modsch": "来啊！等我把这里弄完，几个小时后就过去。"
			},
			{
				"en": "What exactly are you doing?",
				"sch": "你究竟在做什么？",
				"modsch": "你到底在忙什么啊？"
			},
			{
				"en": "I'll text you later. I need to keep pushing the machine, sorry.",
				"sch": "我稍后会给你发短信。我需要继续推动机器，抱歉。",
				"modsch": "不好意思，我晚点再给你发消息，现在我的手离不开这台机器。"
			},
			{
				"en": "I believe machines influence each other when placed in adjacent or diagonal cells. For example, this fan needs to be placed next to the first machine to speed up the process.",
				"sch": "我认为当机器放置在相邻或对角的单元格中时，机器会相互影响。例如，风扇需要放置在第一台机器旁边以加快流程。",
				"modsch": "机器摆在相邻或斜对角的格子里，好像就能互相影响。比如这个风扇，只有放在最开始那台机器旁边，才有加速效果。"
			},
			{
				"en": "You are making so much sense right now",
				"sch": "你现在说得很有道理",
				"modsch": "对对对，你说得太对了"
			},
			{
				"en": "Well?",
				"sch": "吗?",
				"modsch": "人呢？"
			},
			{
				"en": "Where are you at?",
				"sch": "你在哪？",
				"modsch": "你现在人到哪了？"
			},
			{
				"en": "We've been waiting for you for ages now.",
				"sch": "我们已经等你很久了。",
				"modsch": "我们已经等你很久了。"
			},
			{
				"en": "What do you mean? I'm still here.",
				"sch": "你急什么？我还在这没动。",
				"modsch": "你急什么？我还没动呢。"
			},
			{
				"en": "WHERE???",
				"sch": "哪里???",
				"modsch": "你说什么？？？"
			},
			{
				"en": "I've got a blue stone now. Or is it purple? It sounds like an antique brass candlestick. I think I could use it to remove misplaced machines.",
				"sch": "我现在有一块蓝色，额也可能是紫色的石头了。 听起来像一个古董黄铜烛台。我想我可以用它来移除放错地方的机器。",
				"modsch": "我现在有一块蓝色的石头了，额也有点偏紫色。敲起来的声音像是在摇铃铛一样。貌似它可以把摆错的机器给删掉。"
			},
			{
				"en": "Are you kidding me? I thought you said you were coming. What the hell?!",
				"sch": "你在开玩笑吗？我以为你说你要来。到底怎么回事？！",
				"modsch": "你逗我呢？不是说好了要过来吗？搞什么啊？！"
			},
			{
				"en": "Chill man, I'll be there in a minute",
				"sch": "冷静点，我一会儿就到",
				"modsch": "行了行了，我马上过来。"
			},
			{
				"en": "Wow, I can use [Q] to clone machines or destroy them if I click on a free cell first! And [Alt] helps to see behind tall machines.",
				"sch": "哇，我可以使用[Q]来复制机器或先在空白方格点击然后摧毁它们！而且[Alt]可以帮助查看高大机器后面的情况。",
				"modsch": "我好像又知道怎么弄了！不仅按 [Q]能复制选中的机器，还能复制空地去拆除机器！对着机器按住Alt还能看机器的各种信息！"
			},
			{
				"en": "CHOP CHOP",
				"sch": "快点",
				"modsch": "搞快点！"
			},
			{
				"en": "Are you guys still there?",
				"sch": "你们还在吗？",
				"modsch": "你们人呢？"
			},
			{
				"en": "HOLY CRAP!!!",
				"sch": "哎呦我去！",
				"modsch": "卧槽！！"
			},
			{
				"en": "Where are you????",
				"sch": "跑哪去了？",
				"modsch": "你人上哪里去了？？？？"
			},
			{
				"en": "Are you okay??",
				"sch": "你没事吧？？",
				"modsch": "你还好吗？？"
			},
			{
				"en": "????",
				"sch": "????",
				"modsch": "？？？？"
			},
			{
				"en": "What the hell?",
				"sch": "什么鬼？",
				"modsch": "什么情况？"
			},
			{
				"en": "ARE YOU OKAY? WHERE ARE YOU?",
				"sch": "你还好吗？你在哪里？",
				"modsch": "你没出事吧？你 人 在 哪 里 ？？"
			},
			{
				"en": "Chill man! I am ok, what's going on?",
				"sch": "冷静点，兄弟！我没事，怎么了？",
				"modsch": "你冷静点！我这儿没事啊，怎么了？"
			},
			{
				"en": "You tell me! You've been ghosting me for two weeks now! I even went to your place a few times, but you weren't there. Just tell me where you are, that's it. Are you home right now?",
				"sch": "好意思问我！你已经鬼鬼祟祟地躲着我两个星期了！我甚至去你家几次，但你都不在。就告诉我你在哪里，没别的。你现在在家吗？",
				"modsch": "好意思问我！你失踪两个星期了，我跑遍所有地方包括你家，根本就找不到你。你先告诉我你在哪儿。你现在回家了没？"
			},
			{
				"en": "Dude, what are talking about? We texted each other literally two minutes ago.",
				"sch": "兄弟，你在说什么？我们事实上在两分钟前才互发短信。",
				"modsch": "不是，你说什么呢？咱俩两分钟前不是还在发消息吗？"
			},
			{
				"en": "WHAT IS WRONG WITH YOU??? First you didn't show up, then you disappeared completely. And now you act like nothing happened!",
				"sch": "你到底怎么了??? 你先是没有出现，然后彻底没影了。现在你却表现得像什么事都没发生一样！",
				"modsch": "你搞什么啊？先是放我鸽子，接着人间蒸发，现在还当什么都没发生？！"
			},
			{
				"en": "I am asking you a simple question",
				"sch": "我问你一个简单的问题",
				"modsch": "你就回答我一个问题。"
			},
			{
				"en": "WHERE ARE YOU?",
				"sch": "你在哪里？",
				"modsch": "你 在 哪??"
			},
			{
				"en": "I am here.",
				"sch": "我在这里。",
				"modsch": "我在这边"
			},
			{
				"en": "W H E R E",
				"sch": "哪里",
				"modsch": "哪边？？"
			},
			{
				"en": "Hold on...",
				"sch": "等一下……",
				"modsch": "我想想……"
			},
			{
				"en": "It is not funny man. Where are you exactly? Can you tell me that?",
				"sch": "这一点也不好笑。你到底在哪里？你能告诉我吗？",
				"modsch": "真没心思跟你闹。你到底在哪儿啊？说个具体的地点行不行？"
			},
			{
				"en": "Well...",
				"sch": "额……",
				"modsch": "额……"
			},
			{
				"en": "Dude, I don't actually know.",
				"sch": "兄弟，我其实不知道。",
				"modsch": "说真的，我也不知道自己在哪儿。"
			},
			{
				"en": "Give me a minute",
				"sch": "让我想想",
				"modsch": "让我想想"
			},
			{
				"en": "What do you mean you don't know?",
				"sch": "你不知道你在哪吗？",
				"modsch": "什么叫你也不知道？"
			},
			{
				"en": "I need to gather my thoughts",
				"sch": "我需要整理思绪",
				"modsch": "我得整理一下头绪。"
			},
			{
				"en": "Is everything all right? Are you safe? Should I call someone?",
				"sch": "一切都还好吗？你安全吗？我应该找人吗？",
				"modsch": "你真的还好吗？没有遇到危险吧？要不要我找人帮忙？"
			},
			{
				"en": "No, I am good. I just",
				"sch": "不，我很好。我只是",
				"modsch": "没事，真没事。就是……"
			},
			{
				"en": "I'll text you in a bit",
				"sch": "我一会儿给你发短信",
				"modsch": "等会儿再跟你说。"
			},
			{
				"en": "Damn, man. What's going on?",
				"sch": "该死，兄弟。怎么了？",
				"modsch": "不是，哥们，现在到底是什么情况？"
			},
			{
				"en": "I am scared",
				"sch": "我很害怕",
				"modsch": "我心里有点发毛。"
			},
			{
				"en": "It seems I don't know where I am",
				"sch": "看来我不知道我在哪里",
				"modsch": "我好像真的没办法知道自己身在何处。"
			},
			{
				"en": "This is so weird. I mean, everything is fine with me. But I can't describe this place.",
				"sch": "这太奇怪了。就是，我这个人一切都很好。但我无法形容这个地方。",
				"modsch": "怪就怪在，我人没事，但我在一个无法形容的地方。"
			},
			{
				"en": "It's like a dream, but then again it's not. Everything is white and there are these machines. And cubes. It doesn't make any sense.",
				"sch": "就像一场梦，但又不是。一切都是白色的，还有这些机器。还有立方体。我搞不清这一切。",
				"modsch": "我可能是在做梦吧。目光所及之处全是白色的，还有这些机器和一堆方块。让我无法理解。"
			},
			{
				"en": "I am not high or anything. I just realized how strange it is that I never noticed that this wasn't like anything I'd ever seen.",
				"sch": "我并没有嗑药或咋地。我只是突然意识到，从未注意到这些与我所见过的任何事物都不同，很奇怪。",
				"modsch": "先说清楚，我没嗑药。我才突然意识，这里明明完全超出了我的认知范围，但我却一直没觉得有什么不对。"
			},
			{
				"en": "Now I got red stones, and it is kinda creepy that I am totally fine with all this. Ok, just a red stone, everything is fine.",
				"sch": "现在我得到了红色宝石，我对这一切有点平静得吓人。好吧，只是一块红色的石头，一切都好。",
				"modsch": "现在我挖出来了红色的东西。我像是见怪不怪一样，冷静到连我都感到不对劲。还好除了红一点之外没什么危险性。"
			},
			{
				"en": "So you are not kidding...",
				"sch": "所以你不是在开玩笑…",
				"modsch": "所以你不是在开玩笑…"
			},
			{
				"en": "I see how it all sounds now. But yeah, it's all here before my eyes.",
				"sch": "我现在明白这一切听起来如何了。但是，额，对，这一切都在我眼前。",
				"modsch": "我明白你的心情了。但真不是我编出来的。"
			},
			{
				"en": "Can I do anything for you?",
				"sch": "我可以为你做些什么？",
				"modsch": "我能不能帮的上忙？"
			},
			{
				"en": "Just talk to me, that's it.",
				"sch": "跟我说话，就这样。",
				"modsch": "陪我说说话就行。"
			},
			{
				"en": "Can do buddy, can do. Btw, cops are now looking for you. Like you went missing.",
				"sch": "OK兄弟，你别担心。对了，警察现在正在找你。你像失踪了一样。",
				"modsch": "行，没问题。别忘记你还是个失踪人口，警察现在都在找你。"
			},
			{
				"en": "Did you show them our texts?",
				"sch": "你给他们看了我们的聊天记录吗？",
				"modsch": "你有没有给他们看我们的聊天记录？"
			},
			{
				"en": "How would that help? No, I turned on auto-delete.",
				"sch": "有用吗？没，何况我开启了自动删除。",
				"modsch": "给他们看能有什么用？没有，而且我设置了自动删除功能。"
			},
			{
				"en": "Thanks!",
				"sch": "谢谢！",
				"modsch": "那我真谢谢你！"
			},
			{
				"en": "How's it going over there?",
				"sch": "那边情况如何？",
				"modsch": "你那边怎么样了？"
			},
			{
				"en": "Well, It turns out I can move around by using WASD. But there is nothing interesting around except this strange rock up North.",
				"sch": "嗯，事实证明我可以使用 WASD 来移动。但除了北方这块奇怪的岩石之外，周围没有什么有趣的东西。",
				"modsch": "我弄明白了，原来按WASD 就能四处移动。周围没什么新奇的东西，除了北边那个奇怪的石头。"
			},
			{
				"en": "So your phone's compass works there!",
				"sch": "所以你的手机指南针在那里可以运作！",
				"modsch": "所以你手机的指南针在那边能用！"
			},
			{
				"en": "Well, it is just \"up\" from here, so I guess that's North.",
				"sch": "嗯，从这里看就是「上」的方向，所以我猜那是北方。",
				"modsch": "呃，我的意思是从这往那边看是上边，那我默认就是上北下南了"
			},
			{
				"en": "Makes sense",
				"sch": "合理",
				"modsch": "行吧。"
			},
			{
				"en": "And the thing is I don't have a phone...",
				"sch": "而且问题是我没有手机…",
				"modsch": "说到手机……我这里根本就没有手机。"
			},
			{
				"en": "So how are you texting me?",
				"sch": "那你是怎么给我发短信的？",
				"modsch": "那你现在是怎么给我发消息的？"
			},
			{
				"en": "I don't know!! I just know when you message me. And I can respond to you! It is not easy to explain.",
				"sch": "我不知道！！你给我发消息时我才知道。而且我可以回覆你！我怎么跟你解释呢。",
				"modsch": "我也想知道！我能知道你发了消息，也能回你。但我完全解释不了具体怎么回事。"
			},
			{
				"en": "Don't sweat it. We can talk and that's already good enough.",
				"sch": "别像那个了。我们能交谈已经谢天谢地了",
				"modsch": "没事。我们能联系上已经是谢天谢地了。"
			},
			{
				"en": "Yes, you are right.",
				"sch": "对，太对了",
				"modsch": "嗯，你说得对。"
			},
			{
				"en": "So... Tell me about the machines",
				"sch": "那么……跟我说说那些机器吧",
				"modsch": "对了，给我讲讲那些机器吧"
			},
			{
				"en": "What do you mean?",
				"sch": "说啥？",
				"modsch": "怎么讲？"
			},
			{
				"en": "What are they, what do they do, how do they work?",
				"sch": "它们是什么、做什么、如何运作？",
				"modsch": "比如那是什么机器，有什么用，靠什么运转之类的。"
			},
			{
				"en": "Well, they look fancy, with some cables and wires and stuff",
				"sch": "嗯，它们看起来很漂亮，有一些电缆和电线之类的东西",
				"modsch": "嗯，外观看着挺精致的，带着一些整齐的电线电缆"
			},
			{
				"en": "One, for example, looks like a big plastic box with a copper coil on the top, where a blue stone goes. And there is a big label saying \"E—01SR\" on the side, with a smaller label \"Caution! Strong entropy radiation\"",
				"sch": "例如，其中一个看起来像一个大塑胶盒子，顶部有一个铜线圈，里面放着一块蓝色的石头。而且侧面有一个大标签写着“E—01SR”，还有一个较小的标签“注意！强熵辐射”",
				"modsch": "拿其中一台来说，主体是一个大塑料盒，顶部有一个铜线圈，中间放着一块紫色的石头。塑料盒的侧面贴标写着\"E—01SR\"，还有一个小标签写着”注意！强熵辐射\""
			},
			{
				"en": "What does that mean?",
				"sch": "什么意思？",
				"modsch": "什么是强熵辐射？"
			},
			{
				"en": "I don't know really. There is some entropy radiation there I guess.",
				"sch": "我不知道。我猜那里有一些熵辐射。",
				"modsch": "我也不懂，反正就是机器会产生熵的辐射吧..."
			},
			{
				"en": "Wait, I thought you made these machines?",
				"sch": "等等，我以为这些机器是你制造的？",
				"modsch": "啊？这些机器不是你自己造的吗？"
			},
			{
				"en": "Right... I see your point.",
				"sch": "行吧……我大概知道你为啥这样想了。",
				"modsch": "对哦……你这么一说，还真是。"
			},
			{
				"en": "I just make them from cubes somehow. But I don't know what's inside. Yeah, that does sound weird, let me think about this.",
				"sch": "我只是透过立方体以某种方式制作它们。但我不知道里面是什么。不是，这什么怪话，让我思考一下。",
				"modsch": "我是用那些方形石头做的，但是具体是怎么造的我也说不清，至于里面的构造就更不知道了。呃，听上去有点矛盾，让我想一想。"
			},
			{
				"en": "And btw it seems like yellow and blue stones are not infinite, so I should really invest in those converters or a new mine.",
				"sch": "顺带一提，黄色和蓝色的石头似乎不是无限的，所以我真的应该考虑那些转换器或一座新矿场。",
				"modsch": "顺带一提，黄色和紫色的石头似乎很快就会挖空，所以我真的应该考虑造一些转换器和开一座新矿场了。"
			},
			{
				"en": "Sounds like a plan",
				"sch": "听起来很有计划",
				"modsch": "听上去不错。"
			},
			{
				"en": "What a pain in the ass!",
				"sch": "真是头大！",
				"modsch": "这也太难搞了吧！"
			},
			{
				"en": "Huh?",
				"sch": "啊？",
				"modsch": "啥情况？"
			},
			{
				"en": "A green stone! It takes ages to break it. I have to come up with something if they keep showing up.",
				"sch": "一块绿色的石头！要花很长时间才能打破它。如果它们继续出现，我得想法解决。",
				"modsch": "冒出来一块绿色的石头，难敲得要命！要是之后还会出现，我必须想办法对付它才行。"
			},
			{
				"en": "I'm sure you'll make some fancy machine for that!",
				"sch": "你肯定会为此制作一台精巧的机器！",
				"modsch": "没事，你一定可以造得出一台专门对付它的机器！"
			},
			{
				"en": "You bet!",
				"sch": "一包辣条！",
				"modsch": "那必须的！"
			},
			{
				"en": "Hell yeah! Hell gems, watch out.",
				"sch": "那当然了！地狱宝石，可得小心。",
				"modsch": "来吧，地心晶体！准备迎接我的出招！"
			},
			{
				"en": "Give 'em hell!",
				"sch": "给他们好看！",
				"modsch": "干穿地心！"
			},
			{
				"en": "Remember you asked about the machines?",
				"sch": "记得你问过关于机器的事吗？",
				"modsch": "还记得你之前问我那些机器的事吗？"
			},
			{
				"en": "Yeah",
				"sch": "嗯",
				"modsch": "嗯，记得。"
			},
			{
				"en": "I don't think they are real",
				"sch": "我不认为它们是真实的",
				"modsch": "我觉得那些机器可能不是真的。"
			},
			{
				"en": "What's that supposed to mean?",
				"sch": "什么意思？",
				"modsch": "什么意思？"
			},
			{
				"en": "It's like in a dream. I can't look inside or even see them from the other side.",
				"sch": "就像在梦中一样。我无法看到里面，甚至无法从另一边看到它们。",
				"modsch": "跟在梦里一样，我看不到机器里面，连它们另一面的样子都看不到。"
			},
			{
				"en": "A vague representation of unexplainable technology",
				"sch": "这是对无法解释的技术的模糊表述",
				"modsch": "像是给某种无法解释的科技或者现象，套了个模糊的外形。"
			},
			{
				"en": "I think these machines look this way just because of how I perceive their function.",
				"sch": "我认为这些机器看起来像这样只是因为我如何看待它们的功能。",
				"modsch": "我觉得是我对它们用途的理解，决定了我所看到的外观。"
			},
			{
				"en": "Like if something chops down trees it should look like an axe?",
				"sch": "如果有东西可以砍倒树木，它应该看起来像一把斧头吗？",
				"modsch": "你的意思是，如果一件东西是用来砍树的，它在你眼中就会长得像把斧头？"
			},
			{
				"en": "Something like that",
				"sch": "类似的东西",
				"modsch": "对，差不多就是这个意思。"
			},
			{
				"en": "Well, at least you sound pretty real to me",
				"sch": "好吧，至少你对我来说听起来很真实",
				"modsch": "不管怎么说，至少对我来说你是真实存在的。"
			},
			{
				"en": "Yeah, I suppose you are the only real thing for me right now",
				"sch": "是的，我想你现在对我来说是唯一真实的存在",
				"modsch": "是啊。眼下对我来说，只有你是真的了。"
			},
			{
				"en": "I've got a bunch of new cubes, which are decaying to other cubes!",
				"sch": "我有一堆新的立方体，它们正在衰变成其他立方体！",
				"modsch": "我挖到一种新的方块，它居然会不停地衰变成其他种类的方块！"
			},
			{
				"en": "Well, not great, not terrible",
				"sch": "嗯，不是很好，也不是很糟糕",
				"modsch": "还行，不算好但也不算糟。"
			},
			{
				"en": "I have to say something really weird",
				"sch": "我必须说一件非常奇怪的事",
				"modsch": "我得告诉你一件很诡异的事。"
			},
			{
				"en": "Do you see the irony in what you just wrote?",
				"sch": "你看到你刚才写的内容言语间的讽刺吗？",
				"modsch": "你不觉得你发这句话很讽刺吗？"
			},
			{
				"en": "Maybe it's because of this strange place, but I forgot your name somehow",
				"sch": "或许是因为这个奇怪的地方，我不知怎么忘记了你的名字",
				"modsch": "或许就是这里太诡异导致的，我忘记了你的名字。"
			},
			{
				"en": "Well, I suppose we could spend a little more time together then",
				"sch": "嗯，我想我们可以再多花点时间在一起",
				"modsch": "这样啊，看来我们相处的时间还不够久。"
			},
			{
				"en": "I'm serious",
				"sch": "认真的",
				"modsch": "我真想不起来。"
			},
			{
				"en": "My name is Duke Nukem, obviously.",
				"sch": "我的名字明显是毁灭公爵。",
				"modsch": "还用问嘛，我的名字是：毁灭公爵！"
			},
			{
				"en": "Dude, cut it out!",
				"sch": "什么玩应！",
				"modsch": "不要，别闹了！"
			},
			{
				"en": "That's what she said!",
				"sch": "她就是这么说的！",
				"modsch": "那个女人当初也是这么说的！"
			},
			{
				"en": "This is stupid! Stop creeping me out. What's going on?",
				"sch": "太傻逼了！别再吓我了。到底发生了什么事？",
				"modsch": "不是哥们，别再发癫了。现在我身上到底发生了什么事？"
			},
			{
				"en": "Damn",
				"sch": "我靠",
				"modsch": "完了"
			},
			{
				"en": "It looks like I can't remember my own name either",
				"sch": "看来我也不记得自己的名字了",
				"modsch": "我好像连我自己的名字也想不起来了"
			},
			{
				"en": "I just can't! It is batshit crazy. And I can't remember your name!",
				"sch": "我就是做不到！这简直是疯了。而且我记不起你的名字！",
				"modsch": "真想不起来了。卧槽。我也忘记你的名字了！"
			},
			{
				"en": "Maybe it's just a case of mass hysteria? I've heard it can affect multiple people at once. Let's just calm down and see what happens.",
				"sch": "或许这只是一种集体歇斯底里的情况？我听说它可以一次影响多人。我们就冷静下来，看看会发生什么。",
				"modsch": "可能是种集体失忆症？我之前听过进入百慕大三角的人都会失忆的传闻。先冷静下来等等看，说不定会记起来。"
			},
			{
				"en": "Yeah, right, hysteria",
				"sch": "是的，对，歇斯底里",
				"modsch": "是是是，百慕大三角，外星飞碟抓人做实验来了。"
			},
			{
				"en": "I still can't recall names",
				"sch": "我仍然想不起名字",
				"modsch": "我还是想不起咱俩叫什么。"
			},
			{
				"en": "Me neither. And there's more",
				"sch": "我也想不起。而且不止名字",
				"modsch": "我也是。更严重的是有别的事情我也记不清了。"
			},
			{
				"en": "Yeah! What do I look like? When did we meet?",
				"sch": "对！我长什么样？我们什么时候认识的？",
				"modsch": "嘶...我的脸长什么样？我们什么时候认识的？"
			},
			{
				"en": "What does my home look like, who are our friends? Did we meet at all?",
				"sch": "我的家什么样子，我们的朋友是谁？我们有见过面吗？",
				"modsch": "我的家在哪里，我有哪些朋友，我们以前见过面吗？"
			},
			{
				"en": "It looks like we are both stuck in the same shit. And I can't even tell if it always has been like that or something happened at some point. Is this some weird dream? And who's dreaming?",
				"sch": "看来我们都陷入了同样的困境。我甚至无法分辨这是一直以来的情况还是某个时间点发生了什么事。这是一场奇怪的梦吗？是谁在做梦？",
				"modsch": "看来我们现在是难兄难弟了。我们是一直都这样的，还是某个时间点变成这样的？是我在做梦还是我活在别人的梦里？"
			},
			{
				"en": "Any machines nearby? Maybe a cube sprung out somewhere?",
				"sch": "附近有任何机器吗？可能有个立方体突然出现了？",
				"modsch": "你看看周围有没有出现机器？没准还会冒出个方块？"
			},
			{
				"en": "Funny",
				"sch": "笑死",
				"modsch": "哈哈。不好笑哥们。"
			},
			{
				"en": "Well, let's come up with some names for ourselves.",
				"sch": "好吧，让我们为自己想一些名字。",
				"modsch": "我们先各自起一个新名字吧。"
			},
			{
				"en": "You sound like Veen",
				"sch": "你听起来像维恩",
				"modsch": "听你说话，感觉你就该叫维恩。"
			},
			{
				"en": "Why not",
				"sch": "善哉",
				"modsch": "善"
			},
			{
				"en": "Have nothing against Veen",
				"sch": "对维恩没有任何反对意见",
				"modsch": "我没意见"
			},
			{
				"en": "Hey, Veen. Would you like some beans, Veen? Yeah, sounds ok.",
				"sch": "嘿，维恩。维恩，你想要一些豆子吗？是的，听起来不错。",
				"modsch": "\"维恩，你是我唯一的恩人！\"嗯，听着可以。"
			},
			{
				"en": "And you will be Charps",
				"sch": "而你会成为夏普",
				"modsch": "那你就叫夏普吧。"
			},
			{
				"en": "Do you have some sharp harps, Charps?",
				"sch": "夏普，你有肉脯吗？",
				"modsch": "\"夏普，吓到心里没谱？\""
			},
			{
				"en": "That doesn't make sense!",
				"sch": "哪跟哪啊！",
				"modsch": "难绷"
			},
			{
				"en": "I like Charps. Nice to meet you, Veen",
				"sch": "我喜欢夏普。很高兴认识你，维恩",
				"modsch": "夏普这个名字听着不错。幸会幸会，维恩！"
			},
			{
				"en": "Likewise, Charps",
				"sch": "我也一样，夏普",
				"modsch": "夏普请多关照！"
			},
			{
				"en": "WHAT IS GOING ON",
				"sch": "到底是怎么回事",
				"modsch": "怎么突然会这样？！"
			},
			{
				"en": "What?",
				"sch": "什么？",
				"modsch": "什么事？"
			},
			{
				"en": "White cubes! They are destroying the green ones!",
				"sch": "白色立方体！他们正在摧毁绿色的！",
				"modsch": "出现了白色的矿石！他们正在和地心晶体发生湮灭！"
			},
			{
				"en": "There are tons of decaying cubes too! It's like in a nuclear reactor!",
				"sch": "还有大量衰变的立方体！就像在核反应炉里一样！",
				"modsch": "到处都是在衰变的矿石！这里要变成核反应堆了！"
			},
			{
				"en": "Holy shit, are you ok?",
				"sch": "我靠，你还好吗？",
				"modsch": "卧槽！你没出什么事吧？"
			},
			{
				"en": "Yeah, I'm fine! It's just a mess now. I have to build something to handle this. Maybe I should take another look at a rock in the north.",
				"sch": "嗯，我没事！现在只是乱七八糟。我得建造一些东西来处理这个。也许我应该再去北边看看那块石头。",
				"modsch": "我没事！就是眼下乱作一团。我必须想办法造一个新的机器来处理这个问题。北边那一块巨石说不定会有用。"
			},
			{
				"en": "That's what you always do, Charps!",
				"sch": "夏普，你总是这么做的！",
				"modsch": "我们的夏普，越来越得心应手了！"
			},
			{
				"en": "Sounds weird!",
				"sch": "什么怪话",
				"modsch": "听着还是有点不太习惯。"
			},
			{
				"en": "I mean, my name does. I guess I'll get used to it at some point. Right, Veen?",
				"sch": "就是，我的名字确实如此。我想我会在某个时候习惯它。对吧，维恩？",
				"modsch": "我说“夏普”这名字。会慢慢习惯的，对吧“维恩”？"
			},
			{
				"en": "Yeah! Weird indeed.",
				"sch": "是的！确实很奇怪。",
				"modsch": "确实，短时间内还不太适应。"
			},
			{
				"en": "Remember I mentioned a strange rock up north?",
				"sch": "记得我提到北边有块奇怪的石头吗？",
				"modsch": "还记得我之前说过的北边那一块巨石吗？"
			},
			{
				"en": "Not really, no",
				"sch": "不太记得",
				"modsch": "呃，不太记得。"
			},
			{
				"en": "Well, there's this rock. And don't get me wrong, I realize that everything here is strange. But this rock feels much more strange than anything else.",
				"sch": "就这里有一块石头。别误会，我知道这里的一切都很奇怪。但这块石头比其他任何事物都要来得更奇怪。",
				"modsch": "总之就是有这么块石头。我知道，这地方没一样东西是正常的，但它给我的感觉更怪。"
			},
			{
				"en": "I can't make any sense of it. But now when I decided to poke it a little, it changed something in the rules of the Universe itself!",
				"sch": "我完全无法理解它。但现在当我决定稍微触碰它一下时，它竟然改变了宇宙规则的本身！",
				"modsch": "这岩石看上去太迷了。我刚刚就碰了一下它，宇宙的规则居然变得有些不一样了！"
			},
			{
				"en": "Is it dangerous?",
				"sch": "危险吗？",
				"modsch": "你别碰了吧，好像有点危险？"
			},
			{
				"en": "I don't know. The change is subtle.",
				"sch": "我不知道。这种变化很隐蔽。",
				"modsch": "不知道，变是变了，但不太明显。"
			},
			{
				"en": "I wonder what else it can do.",
				"sch": "我想知道它还能做什么。",
				"modsch": "不知道这东西还有什么本事。"
			},
			{
				"en": "Alright, just don't destroy the Universe accidentally.",
				"sch": "好吧，只是不要意外地毁灭宇宙。",
				"modsch": "你悠着点，别一不小心把宇宙炸了。"
			},
			{
				"en": "I'll do my best.",
				"sch": "我尽量吧",
				"modsch": "这你放心，下一秒就炸给你看。"
			},
			{
				"en": "Well, THAT was the hardest rock of my life! But I think I know how to break it faster now.",
				"sch": "好吧，那是我一生中见过的最坚硬的岩石！但我想我现在知道如何更快地破坏它。",
				"modsch": "好家伙，这个石头绝对是我这辈子遇到过的最硬的石头！不过我好像捣鼓出敲得更快的方法。"
			},
			{
				"en": "Got new stone?",
				"sch": "新石头？",
				"modsch": "石头又有新的品种了？"
			},
			{
				"en": "Yep, the weirdest so far",
				"sch": "是的，目前为止最奇怪的",
				"modsch": "有的，这回的古怪程度又刷新纪录了。"
			},
			{
				"en": "Woah, maybe the effect on the Universe wasn't so subtle. Do you feel it?",
				"sch": "哇，也许对宇宙的影响并没有那么微妙。你感觉到了吗？",
				"modsch": "不对劲，你有没有感觉到？这次宇宙的变化好像没我说的那么小。"
			},
			{
				"en": "Feel what?",
				"sch": "感觉什么？",
				"modsch": "什么感觉？"
			},
			{
				"en": "Well, maybe it's just me.",
				"sch": "没事了，看来只有我感觉到。",
				"modsch": "好吧，看来只有我感觉到了。"
			},
			{
				"en": "Have you, by any chance, seen a huge cube in front of your eyes right now?",
				"sch": "你现在有没有看到一个巨大的立方体出现在你的眼前？",
				"modsch": "问一下，你那边有没有被一个超大的方块突脸？"
			},
			{
				"en": "Ehm, does a fridge count?",
				"sch": "呃，冰箱？",
				"modsch": "呃，被大运突脸算吗？"
			},
			{
				"en": "Well, nevermind",
				"sch": "那没事了",
				"modsch": "算了...当我没问。"
			},
			{
				"en": "Wow, this new cube is pitch black. And it feels somewhat otherworldly.",
				"sch": "哇，这个新的立方体漆黑一片。而且好像有些独特。",
				"modsch": "哇，这次的新方块是纯黑的。感觉都不像是这世界的东西。"
			},
			{
				"en": "More otherworldly than the previous one?",
				"sch": "比上一个更加独特？",
				"modsch": "又刷新了古怪石头的纪录了吗？"
			},
			{
				"en": "It is different! It's freezing cold, but not in a harmful way. Like it lacks the concept of temperature and it doesn't interact with you. It is not made of matter, doesn't have color or anything familiar, if it makes sense to you.",
				"sch": "有分别的！ 虽然天气很冷，但并没有什么坏处。 就像它缺乏温度的概念一样，它也不会与你互动。 如果我可以这样说的话，它不是由物质构成的，没有颜色或任何熟悉的东西。",
				"modsch": "这回不一样！它不会对我起任何反应。摸上去冷冰冰的，但不至于到冻伤我的程度。感觉它根本没有温度这个概念，甚至不是由物质构成的。不光是颜色都不存在，连这个东西的性质跟我认知里的任何一个东西都匹配不上......这么说你能懂吗？"
			},
			{
				"en": "Frankly, it does not.",
				"sch": "坦白说，我不懂。",
				"modsch": "说实话，没懂。"
			},
			{
				"en": "I think I get it. I can use hollow stones to condense that black stuff out of thin air. It forms weirdly identical crystals, but without any properties. And that fixes anomalies in the Universe somehow.",
				"sch": "我想我明白了。我可以用空心石，凭空凝结那些黑色的东西。它形成了奇怪的完全相同的晶体，但没有任何特性。却会以某种方式修复宇宙中的异常现象。",
				"modsch": "我大概知道怎么回事了。空心石能把那些黑东西凭空凝结成一种完全相同形状的晶体，像是一棵树，一朵花，一条猫尾巴，全都像一个模子里刻出来的，同样是什么性质都没有。更离奇的是，它可以修复掉目前宇宙的异常状况。"
			},
			{
				"en": "Sounds like an air filter",
				"sch": "听起来像是空气过滤器",
				"modsch": "合着是个空气过滤器？"
			},
			{
				"en": "Yes, exactly! It looks like I spoiled the air at some point somehow.",
				"sch": "对，就是这样！看起来我在某种程度上破坏了空气。",
				"modsch": "对，就是这样！估计我之前不知道做了什么，把空气给污染了。"
			},
			{
				"en": "You don't have to say it aloud",
				"sch": "给你喇叭你上台说去吧",
				"modsch": "虽然我们是朋友，但是放屁这种事你不用这么坦诚。"
			},
			{
				"en": "I decided to dig up that strange rock. Maybe there is an answer to what is happening inside. I feel it may be not just messing with everything, but it may control everything somehow!",
				"sch": "我决定把那块奇怪的石头挖出来。也许里面发生的事情有答案。我觉得它可能不仅仅是扰乱一切，而且可能以某种方式控制一切！",
				"modsch": "我决定了研究那块诡异的巨石。说不定里面藏着这一切的答案。我怀疑它不只是把这里搞乱了，甚至可能在操控这一切！"
			},
			{
				"en": "Why do you think so?",
				"sch": "为什么这么认为？",
				"modsch": "为什么这么觉得？"
			},
			{
				"en": "Would you believe me if I say I sense it?",
				"sch": "我说我感觉到了你信吗？",
				"modsch": "我就是有这种感觉……这么说你信吗？"
			},
			{
				"en": "Sure! I think I would believe in anything right now. A rock controlling the Universe? Why the hell not!",
				"sch": "太信了！我想我现在会相信任何事。控制宇宙的岩石？为什么不相信呢！",
				"modsch": "你说我就信！都到这份上了，还有什么是我不能信的？一块石头控制宇宙？也不差这一件怪事了。"
			},
			{
				"en": "I think I'm getting a seizure!",
				"sch": "我觉得我要癫痫发作了！",
				"modsch": "我觉得自己都要癫痫发作了！"
			},
			{
				"en": "Please don't",
				"sch": "不好",
				"modsch": "别"
			},
			{
				"en": "These machines are getting so obnoxiously loud and flickering. Maybe I should tweak something to fix it. Or tweak myself. Or both.",
				"sch": "这些机器变得如此刺耳和闪烁。也许我应该调整一些东西来修复它。或者调整我自己。或者两者兼顾。",
				"modsch": "这些机器非常刺耳，并且持续爆闪，我真受不了了。我是不是该修一下机器？还是说修一下我自己？也可能两边都得修。"
			},
			{
				"en": "Now we're talking!",
				"sch": "有趣",
				"modsch": "这下终于舒服多了！"
			},
			{
				"en": "So, what did you tweak?",
				"sch": "那么，你调整了什么？",
				"modsch": "说说，怎么修的？"
			},
			{
				"en": "Wait, something is wrong.",
				"sch": "等等，好像有什么不对劲。",
				"modsch": "不对……好像出问题了。"
			},
			{
				"en": "I built a thing out of the black stuff. And it isn't a machine. But it did something to the Waypoints.",
				"sch": "我用黑色的东西建造了一个东西。它不是一台机器。但它对航点做了一些事情。",
				"modsch": "我用虚空造了一个建筑，不是一台机器，结果传送点被它影响了。"
			},
			{
				"en": "What are waypoints?",
				"sch": "航点？",
				"modsch": "传送点又是什么？"
			},
			{
				"en": "They shift the Universe around you, that's how you get to different places.",
				"sch": "它们改变了你周围的宇宙，这就是你到达不同地方的方式。",
				"modsch": "它可以挪动我周围的空间，然后我就能穿越到不同的地方。"
			},
			{
				"en": "How do you know they shift the Universe and not you?",
				"sch": "你怎么知道他们改变了宇宙而不是你？",
				"modsch": "你怎么确定是空间被挪动了？万一动的是你呢？"
			},
			{
				"en": "Hmm, I didn't think about that",
				"sch": "你问的好啊！",
				"modsch": "嗯……这我还真没想过。"
			},
			{
				"en": "I think I broke the Universe",
				"sch": "我想我打破了宇宙",
				"modsch": "完了，我是不是把宇宙弄坏了？"
			},
			{
				"en": "None of this makes sense!",
				"sch": "这一切都毫无意义！",
				"modsch": "所有的东西我都完全搞不懂！"
			},
			{
				"en": "Machines aren't making sense, nothing is.",
				"sch": "机器没有意义，没有任何东西有意义。",
				"modsch": "机器也好，别的也好，没一样能理解的。"
			},
			{
				"en": "I hope I can fix this",
				"sch": "我希望我可以解决这个问题",
				"modsch": "但愿我还能把它修好。"
			},
			{
				"en": "Veen?",
				"sch": "维恩？",
				"modsch": "那个……维恩？"
			},
			{
				"en": "Dude, are you there?",
				"sch": "兄弟，你在吗？",
				"modsch": "哥们，还在吗？"
			},
			{
				"en": "Please please please not that! I hope you just went to take a leak or something.",
				"sch": "我靠别，你找点事干吧",
				"modsch": "求你了，快快回我一句吧！你只是去上了个厕所之类的，对吧？"
			},
			{
				"en": "VEEN!",
				"sch": "维恩！",
				"modsch": "维恩！！"
			},
			{
				"en": "WHAT?",
				"sch": "啊？",
				"modsch": "干什么！！"
			},
			{
				"en": "Still weird though.",
				"sch": "不过还是很奇怪。",
				"modsch": "看来我还是不太习惯你叫我这个名字。"
			},
			{
				"en": "Oh thank god!",
				"sch": "谢天谢地",
				"modsch": "谢天谢地，你还在！"
			},
			{
				"en": "Did you build something new?",
				"sch": "你建造了新东西吗？",
				"modsch": "有新东西造出来了？"
			},
			{
				"en": "I thought I broke the Universe and you were gone forever! I was in some netherworld with some symbols around and thought these were the ruins of the Universe. But it is another Universe or a different version of this one, because they resemble each other, and they are connected now.",
				"sch": "我以为我打破了宇宙，你就永远消失了！我身处某个幽冥世界，周围有一些符号，我以为这些是宇宙的废墟。但这是另一个宇宙或这个宇宙的不同版本，因为它们彼此相似，而且它们现在是相连的。",
				"modsch": "我刚才都快吓死了！我以为我把宇宙搞坏了，连你也跟着一起消失了！刚才我在一个像冥界的地方，周围全是些鬼画符，还以为那是宇宙毁掉后留下的废墟。不过我现在想，那里应该是另一个空间或者是这个宇宙的变体，它们不仅有点相似，而且现在两边互通了。"
			},
			{
				"en": "Exploring, eh? Sounds fun!",
				"sch": "探险？好主意",
				"modsch": "原来是去探险了啊？听着挺好玩啊！"
			},
			{
				"en": "Fun? Did you even read my text? ANOTHER UNIVERSE!!!",
				"sch": "好你个头！睁开眼睛好好看看！另一个宇宙！！！",
				"modsch": "你管这叫好玩？！你再好好读一次！！那可是另！一！个！宇！宙！！！"
			},
			{
				"en": "You have to accept that you are running out of the capacity to surprise me.",
				"sch": "你必须承认你已经没有能力给我带来惊喜了。",
				"modsch": "没办法，你说的那些怪事一件接着一件，我耳朵听着都长茧了。"
			},
			{
				"en": "Fair enough",
				"sch": "彳亍",
				"modsch": "……行吧，行吧。"
			},
			{
				"en": "It's not a rock, it's a lens",
				"sch": "这不是石头，这是一个镜片",
				"modsch": "这根本不是石头，这是个透镜！"
			},
			{
				"en": "It can make everything converge into a single point. And I mean everything! Space, time, all the concepts and rules. Everything!",
				"sch": "它可以使一切汇聚成一点。我的意思是一切！空间，时间，所有的概念和规则。一切！",
				"modsch": "它能把所有东西都汇聚到一个点上。空间也好，时间也好，所有的概念和规则，一切的一切！"
			},
			{
				"en": "Did you find the manual or something?",
				"sch": "你找到说明书之类的东西了吗？",
				"modsch": "你终于找到了那本说明书？"
			},
			{
				"en": "I don't know why it's there and why we're here. I just somehow know what it does now.",
				"sch": "我不知道它为什么在那里，也不知道我们为什么在这里。我只是以某种方式知道它现在做了什么。",
				"modsch": "我不知道为什么那块石头会在那里，也不知道我们为什么会在这里。只是突然之间，我就明白了它的作用。"
			},
			{
				"en": "So... Are you going to converge everything or what?",
				"sch": "那么……你打算把所有东西都整合起来吗？",
				"modsch": "那么……你接下来是打算把所有东西都汇聚到一个点上吗？"
			},
			{
				"en": "I don't know how. But maybe it's the point of this place. Now it just floats up in the air as if that's what it's supposed to do.",
				"sch": "我不知道怎么做。但或许这就是这个地方的意义。现在它就这样漂浮在空中，就好像这是它应该做的事。",
				"modsch": "我还不知道怎么弄。不过，让一切汇到一点，说不定就是这个地方存在的意义。现在它就这样漂浮在空中，就像是它坚定不移的职责。"
			},
			{
				"en": "And what happens next?",
				"sch": "然后会发生什么事？",
				"modsch": "聚到一起，再往后会发生什么？"
			},
			{
				"en": "No idea",
				"sch": "不知道",
				"modsch": "……不知道。"
			},
			{
				"en": "The more I think about it, the more I understand it's not just your machines that are not real.",
				"sch": "想得越多，就越明白不只是你的机器不是真实的。",
				"modsch": "我想得越多，就越明白，不光是你那些机器，别的东西也不是真的。"
			},
			{
				"en": "I try to ask myself specific questions and I don't have answers.",
				"sch": "我尝试问自己一些具体问题，但我没有答案。",
				"modsch": "我试着回想着一些更加具体细节的内容，但脑子里却一点答案都没有。"
			},
			{
				"en": "Remember I mentioned that cops were searching for you? I wasn't messing with you. But now everything falls apart when I ask myself questions.",
				"sch": "记得我提到警察在找你吗？我没有跟你开玩笑。但现在当我问自己问题时，一切都崩溃了。",
				"modsch": "还记得我说警察在找你吗？我当时没有在开玩笑。但现在只要我一回想起来，就像一盘散沙，无法拼凑起事情的全貌。"
			},
			{
				"en": "Did I come to this police station or did I call them? And who was there? Cops? Where is that police station in the city? What is this city? Do I live in this city? What's the name of the city? And what state is it? Or are there any states at all?",
				"sch": "我是到了警察局还是打电话给他们了？谁在那里？警察？那个警察局在城里哪里？这座城市是什么？我住在这个城市吗？城市叫什么名字？在哪个国家？或有任何国家吗？",
				"modsch": "我是亲自去的警察局，还是给他们打了电话？是警察接了我的电话吗？警察局在城里哪一边？我住在哪一座城市？这座城市归哪一个省？或者根本不存在\"省\"这一个区域划分？"
			},
			{
				"en": "I can't answer a single question. Everything seemed normal until I started asking questions. I am afraid to ask more.",
				"sch": "我无法回答任何问题。一切看似正常，直到我开始提问。我害怕再问更多。",
				"modsch": "我完全答不上来。原本一切都很正常，直到我开始思考这些问题...我真不敢再想下去。"
			},
			{
				"en": "Sorry about that",
				"sch": "对不起",
				"modsch": "很抱歉让你经历了这么多事。"
			},
			{
				"en": "No, it's not your fault at all. We are in the same boat as far as I can see.",
				"sch": "不，这完全不是你的错。就我所见，我们处于同样的境地。",
				"modsch": "没事，事情又不是你引起的。要我说，咱俩都在同一条船上。"
			},
			{
				"en": "I just hope you'll find out what this boat is.",
				"sch": "我只希望你能找出这一堆是什么。",
				"modsch": "就看你能不能弄清，这到底是条什么船了。"
			},
			{
				"en": "Yeah, me too!",
				"sch": "是啊",
				"modsch": "是啊，我也在想。"
			},
			{
				"en": "Let's see how it ends. I just hope this is not some kind of eternal hell or limbo.",
				"sch": "让我们看看这是如何结束的。我只希望这不是某种永恒的地狱或是地狱边界。",
				"modsch": "走一步看一步吧。只希望我们不是被打进了阿鼻地狱或者被压在了五行山底下之类的。"
			},
			{
				"en": "Show'em, Dante!",
				"sch": "展示给他们看，但丁！",
				"modsch": "拿出你的本事来，孙悟空！"
			},
			{
				"en": "Now we're talking. These guys should drain this Universe dry!",
				"sch": "开干吧。这些家伙应该要把这个宇宙吸干！",
				"modsch": "这样才像样嘛。这些矿井应该能把宇宙榨得一滴不剩！"
			},
			{
				"en": "You sound like an oil company",
				"sch": "听起来像一家石油公司",
				"modsch": "听上去跟某个爱石油的超级大国一样。"
			},
			{
				"en": "I am tired of tweaking everything to be a little more efficient and I am tired of the noise. This machine should change everything. It's even ripping through the other side.",
				"sch": "我厌倦了调整一切以提高那一丁点效率，也厌倦了噪音。这台机器应该会改变一切。甚至还撕裂了另一边。",
				"modsch": "我不想再为那一点效率调这调那，还吵得要死。这台机器应该能让产量迎来质的飞跃。甚至连宇宙的另一边都被它撕裂开了。"
			},
			{
				"en": "Isn't it dangerous?",
				"sch": "不危险吗？",
				"modsch": "无视风险，继续安装？"
			},
			{
				"en": "The concept of danger here is quite blurry.",
				"sch": "危险的概念在这里相当模糊。",
				"modsch": "这里的一切都是危险，就等于这里没有危险。"
			},
			{
				"en": "I think it's time to make something big.",
				"sch": "我想是时候做点大事了。",
				"modsch": "是时候来做点大的了。"
			},
			{
				"en": "What's on your mind?",
				"sch": "你在想什么？",
				"modsch": "你打算做什么？"
			},
			{
				"en": "I am not sure. But it should be big!",
				"sch": "我不确定。但应该很大的事情！",
				"modsch": "不知道。总之得往大了搞！"
			},
			{
				"en": "Like a huge machine?",
				"sch": "就像一台巨大的机器？",
				"modsch": "比如一座梅洛尼基地？"
			},
			{
				"en": "No, I am speaking metaphorically",
				"sch": "不，我只是在打比喻",
				"modsch": "不是那个大，我是说干件大事。"
			},
			{
				"en": "Do it then!",
				"sch": "那就去做吧!",
				"modsch": "那就去做吧！"
			},
			{
				"en": "Oh fuck",
				"sch": "卧槽",
				"modsch": "完了！"
			},
			{
				"en": "I did something wrong. The inverse chasm is destroyed. Everything's collapsing.",
				"sch": "我做错事了。逆裂缝被破坏。一切都在崩溃。",
				"modsch": "我搞砸了。逆裂缝已经炸了，整个地方都在崩溃！"
			},
			{
				"en": "Are you okay?",
				"sch": "你还好吗？",
				"modsch": "你还好吧？！"
			},
			{
				"en": "Yes, but the machines are being destroyed! I can't build anything! Fuck!",
				"sch": "是的，但是机器正在被摧毁！我无法建造任何东西！该死的！",
				"modsch": "我没事，可我的机器正一台台地被毁掉！我还什么都造不出来！操！"
			},
			{
				"en": "Wait! Maybe that's supposed to happen?",
				"sch": "也许这注定会发生？",
				"modsch": "等一下！没准这就是正常的流程？"
			},
			{
				"en": "NO! It is not!",
				"sch": "你胡扯！",
				"modsch": "不可能！绝对不是这样！"
			},
			{
				"en": "How do you know that?",
				"sch": "你怎么知道？",
				"modsch": "你凭什么这么确定？？"
			},
			{
				"en": "Hold on, I have to fix this somehow",
				"sch": "不对，我得想办法解决这个问题",
				"modsch": "先别说了，我得想办法拯救这里。"
			},
			{
				"en": "Here goes nothing!",
				"sch": "这里什么都没有！",
				"modsch": "抱着必死的决心，豁出去了！"
			},
			{
				"en": "I see you! You just walked past a huge chestnut tree, on that funny planet in an upper galaxy arm right there.",
				"sch": "我看见你了！你刚走过一棵巨大的栗树，就在银河系上臂那个有趣的星球上。",
				"modsch": "我看见你了！那个星系的上旋臂里，那个美丽的星球上，你刚从一颗参天栗树旁走过去！"
			},
			{
				"en": "No I did not! What galaxy?",
				"sch": "不，我没有！什么银河系？",
				"modsch": "不，我没有...你在说什么星系？"
			},
			{
				"en": "Oh, it's hard to tell the exact time, it hasn't happened yet probably. But just wait for 15 billion years!",
				"sch": "具体时间很难说，可能还没发生。但请等150亿年！",
				"modsch": "啊，我也说不准具体是什么时候，也许现在还没发生呢。总之再等个150亿年就好了！"
			},
			{
				"en": "You are making so much sense right now. Are you coming over btw?",
				"sch": "你现在说得很有道理。顺便说一句，你要过来吗？",
				"modsch": "你说的话真的是越来越好让人理解了。顺便问一句，你还要过来我这边吗？"
			},
			{
				"en": "Definitely! I'll be there in a few hours, just need to finish up some stuff.",
				"sch": "当然！我几小时后会来到，只需先完成这个。",
				"modsch": "当然来！等我先忙完，过几个小时后就到！"
			},
			{
				"en": "Alright, see you then!",
				"sch": "好吧，到时候见！",
				"modsch": "那就说好了，到时候见！"
			},
			{
				"en": "But please, Charps",
				"sch": "但是，拜托，夏普",
				"modsch": "不过，夏普，有件事拜托你了..."
			},
			{
				"en": "Don't be late this time",
				"sch": "这次别迟到了",
				"modsch": "这次不要再迟到了。"
			},
			{
				"en": "I won't, Veen, I won't!",
				"sch": "我不会，维恩，我不会！",
				"modsch": "这次肯定不会，维恩。肯定不会！"
			},
			{
				"en": "Hey! Are you still there?",
				"sch": null,
				"modsch": "人呢？还在吧？"
			},
			{
				"en": "Sure, why?",
				"sch": null,
				"modsch": "嗯？找我有事？"
			},
			{
				"en": "What’s you up to?",
				"sch": null,
				"modsch": "你在忙什么？"
			},
			{
				"en": "Oh, well, I decided to do it one more time. But there’s a hole in the ground this time.",
				"sch": null,
				"modsch": "就……我想重新再来一次。不过这回地上多了个坑洞。"
			},
			{
				"en": "Do what exactly?",
				"sch": null,
				"modsch": "什么东西再来一次？"
			},
			{
				"en": "The usual, machines and stuff.",
				"sch": null,
				"modsch": "造机器啊，还是那些。"
			},
			{
				"en": "Why?",
				"sch": null,
				"modsch": "怎么又弄这个？"
			},
			{
				"en": "I don’t know, there’s not much to do here anyway.",
				"sch": null,
				"modsch": "没什么，反正闲着也是闲着。"
			},
			{
				"en": "I mean… Why don’t you make something new? Like different machines maybe? Idk, does it make sense?",
				"sch": null,
				"modsch": "我是说，就不能换点花样？造点新机器什么的。懂我意思？"
			},
			{
				"en": "What do you have in mind?",
				"sch": null,
				"modsch": "那你说说，造什么？"
			},
			{
				"en": "Err… Nothing specific. I even don’t know how it works. Just curious.",
				"sch": null,
				"modsch": "呃……我哪知道。我连你怎么造的都不懂，就是好奇。"
			},
			{
				"en": "But why do you ask anyway?",
				"sch": null,
				"modsch": "合着你就负责出题啊？"
			},
			{
				"en": "I don’t know! Forget it. What’s with the hole?",
				"sch": null,
				"modsch": "就问问嘛！算了算了。地上那个洞，你研究明白了吗？"
			},
			{
				"en": "Okay… It’s hard to explain, but it appears I can pull a part of other universe through this hole. And it has an effect on this one.",
				"sch": null,
				"modsch": "那个洞啊……有点难说。我好像能从里面把另一个宇宙的一部分拉过来。拉过来以后，还会影响这边的宇宙。"
			},
			{
				"en": "Same old Charps, same old cryptic bullshit! Does this hole count as something new?",
				"sch": null,
				"modsch": "又开始了，夏普，又是我听不懂的天书。那这洞，算不算新花样？"
			},
			{
				"en": "Well, yeah, I guess.",
				"sch": null,
				"modsch": "嗯……应该算吧。"
			},
			{
				"en": "I've been thinking about what you said",
				"sch": null,
				"modsch": "你之前说的那事，我后来又想了想。"
			},
			{
				"en": "Which is...",
				"sch": null,
				"modsch": "哪句？"
			},
			{
				"en": "I think you're right. I can't build anything new. It's like I have some options and can only choose between them.",
				"sch": null,
				"modsch": "好像还真让你说中了。我能做的就那几样，挑来挑去，也变不出新东西。"
			},
			{
				"en": "Okay, but what happens exactly when you, like, try to build something? Do you somehow see a list or what?",
				"sch": null,
				"modsch": "那么你具体是怎么选的？有个魔法菜单悬浮在你面前吗？"
			},
			{
				"en": "Not really...",
				"sch": null,
				"modsch": "也不是吧……"
			},
			{
				"en": "Let me think",
				"sch": null,
				"modsch": "我想想该怎么说。"
			},
			{
				"en": "It just happens and then I realize it's there",
				"sch": null,
				"modsch": "就是……等我意识到的时候，它就已经出现了。"
			},
			{
				"en": "But how do you choose what's supposed to be built? Do you close your eyes and make a wish or something?",
				"sch": null,
				"modsch": "要造什么，总得先想好吧？还是说，闭眼默念一句“我想要这个”？"
			},
			{
				"en": "Heed the words I am to say! Industrial destabilizer, industrial destabilizer, industrial destabilizer is on the way!",
				"sch": null,
				"modsch": "听我召唤，速速现身！二级解构加速器，二级解构加速器，二级解构加速器！"
			},
			{
				"en": "Funny, but no. I don't do anything special.",
				"sch": null,
				"modsch": "你倒挺会编。真没有，我没做什么特别的事。"
			},
			{
				"en": "But you do something, right?",
				"sch": null,
				"modsch": "总不能什么都没干吧？"
			},
			{
				"en": "Well, yeah... I don't know, I feel like trying to tell what I do to raise my hand or to look at something.",
				"sch": null,
				"modsch": "应该是吧，但这就跟抬个手或者眨个眼，都是下意识的。"
			},
			{
				"en": "You're just a natural born sorcerer",
				"sch": null,
				"modsch": "合着是个天生的魔法师。"
			},
			{
				"en": "Okay, you have to help my thinking.",
				"sch": null,
				"modsch": "来，帮我捋一捋。"
			},
			{
				"en": "What if I can't think of anything new to build not just because of imagination or something, but because this stuff is something inherent to this place and something different just doesn't exist?",
				"sch": null,
				"modsch": "有没有可能，造不出新东西跟我的想象力无关，而是有些东西本来就属于这里，有些东西不可能存在？"
			},
			{
				"en": "Does it make sense?",
				"sch": null,
				"modsch": "你觉得？"
			},
			{
				"en": "Well, yeah, but how do you know all this stuff?",
				"sch": null,
				"modsch": "有可能，问题是你怎么知道这些的？"
			},
			{
				"en": "What do you mean?",
				"sch": null,
				"modsch": "没太明白。"
			},
			{
				"en": "How do you know what you can build and what you can't? For you to make a choice you have to know what's you options are, right?",
				"sch": null,
				"modsch": "就是你怎么知道哪些东西可以造，哪些你不能造？总得要知道有哪几样，才能做选择不是吗？"
			},
			{
				"en": "Like, how do you know how to build something that you haven't build before?",
				"sch": null,
				"modsch": "就好比你头一回造机器的时候，你以前都没造过，怎么就知道该怎么造？"
			},
			{
				"en": "Good point, but I do somehow.",
				"sch": null,
				"modsch": "你这么一问……还真是。可我就是知道。"
			},
			{
				"en": "Do you?",
				"sch": null,
				"modsch": "你是知道，还是觉得自己知道？"
			},
			{
				"en": "What are you trying to say?",
				"sch": null,
				"modsch": "什么意思？"
			},
			{
				"en": "What if you don't?",
				"sch": null,
				"modsch": "有没有可能，压根就不是你造的？"
			},
			{
				"en": "Then who's building it?",
				"sch": null,
				"modsch": "不是我在造，那是谁？"
			},
			{
				"en": "I don't know, just a thought.",
				"sch": null,
				"modsch": "不知道，我就随便说说。"
			},
			{
				"en": "There's no one around anyway.",
				"sch": null,
				"modsch": "反正我周围一个人都没有。"
			},
			{
				"en": "I have an increasingly strong feeling with all these new created universes",
				"sch": null,
				"modsch": "随着这些宇宙一个个被造出来，我有种越来越强烈的感觉。"
			},
			{
				"en": "But it's so weird, don't judge.",
				"sch": null,
				"modsch": "不过说出来有点怪，你先别笑。"
			},
			{
				"en": "Me? Never!",
				"sch": null,
				"modsch": "我？我是那种人吗？"
			},
			{
				"en": "I feel like I am someone. I mean someone real, not the one stuck here, but like normal person with a normal life.",
				"sch": null,
				"modsch": "我感觉到我是一个真正活着的人。不是眼下这个困在这里的我，而是在正常的世界里过着正常日子的人。"
			},
			{
				"en": "It's something like a distant memory growing stronger and stronger with each universe.",
				"sch": null,
				"modsch": "感觉有一段很模糊的记忆，每多造一个宇宙，那段记忆就清晰一点。"
			},
			{
				"en": "There is something, that is not a white plane with machines.",
				"sch": null,
				"modsch": "除了这片白茫茫的地方、这些机器，还有别的东西。"
			},
			{
				"en": "Do you remember the beginning of our conversation?",
				"sch": null,
				"modsch": "你还记得一开始咱俩聊了什么吗？"
			},
			{
				"en": "You were erraticaly touching some machine",
				"sch": null,
				"modsch": "我记得，当时你在瞎捣鼓一台机器。"
			},
			{
				"en": "No, I mean all the stuff with coming over, police, guys waiting for me",
				"sch": null,
				"modsch": "不是，我说的是你叫我过去，还有警察、大家都在等我那些事。"
			},
			{
				"en": "Yeah, it's funny because now it sounds like a total bullshit.",
				"sch": null,
				"modsch": "哦，那些啊。说来也好笑，我现在自己听着都觉得扯。"
			},
			{
				"en": "Well, yeah. And now I'm almost sure at least some of that stuff should be real!",
				"sch": null,
				"modsch": "是挺扯的。可我现在几乎能肯定，至少有些事是真的！"
			},
			{
				"en": "Because these new universes told you so?",
				"sch": null,
				"modsch": "怎么，新造的那些宇宙告诉你的？"
			},
			{
				"en": "Well, in a nutshell because these new universes told me.",
				"sch": null,
				"modsch": "你别说，你真别说。就是它们告诉我的。"
			},
			{
				"en": "What if they're messing with you?",
				"sch": null,
				"modsch": "什么意思呢？这是它们给你带来的幻觉吧？"
			},
			{
				"en": "You'll see, let me make a few more.",
				"sch": null,
				"modsch": "让我再造几个，到时候你就明白了。"
			},
			{
				"en": "I think maybe you could be right. Just MAYBE.",
				"sch": null,
				"modsch": "我认为你可能是对的。只是可能啦。"
			},
			{
				"en": "At least I can't think of anything to disprove your point.",
				"sch": null,
				"modsch": "至少目前我找不出理由来反驳你。"
			},
			{
				"en": "I'm intrigued!",
				"sch": null,
				"modsch": "哟，展开说说？"
			},
			{
				"en": "I am not sure how to tell if I build all the stuff or I am just looking at stuff being built.",
				"sch": null,
				"modsch": "我想要搞明白，到底是不是我亲手造的这些东西。说不定我只是看着它们被造出来。"
			},
			{
				"en": "In principle it should be simple: you flick the switch, the lights turn on. If you don't flick the switch, it's dark. Easy to check. But there's no switch here to flick.",
				"sch": null,
				"modsch": "要是跟开灯一样简单就好了，拨一下开关它就亮，反之则不亮。但这里没有给我这种机会去验证。"
			},
			{
				"en": "If it just lights turn on without any switch, how do you tell if it was you?",
				"sch": null,
				"modsch": "灯可能到点就亮，你怎么知道灯是谁开的？"
			},
			{
				"en": "There should be a switch. At least imaginary switch in your head.",
				"sch": null,
				"modsch": "有因才有果。要说是你开的，至少你心里得有个开关。"
			},
			{
				"en": "I'm not sure if I have it.",
				"sch": null,
				"modsch": "关键我就是无法验证。"
			},
			{
				"en": "Then why do you think it's you who turn on the lights?",
				"sch": null,
				"modsch": "那你为什么最初会觉得是自己造的？"
			},
			{
				"en": "I'm not sure anymore.",
				"sch": null,
				"modsch": "确实，我现在心里没底了。"
			},
			{
				"en": "Can you close your eyes and turn away to see if something is changed without you looking?",
				"sch": null,
				"modsch": "要不试一下闭上眼转身不看，过一会看看它们有没有变化？"
			},
			{
				"en": "That'll be convenient. It's not like I'm looking at something. More like I'm experiencing it.",
				"sch": null,
				"modsch": "没你说得这么容易。我说“看”其实不太准，更像是心灵感知。"
			},
			{
				"en": "Let's just assume that whoever turns the lights on, it doesn't matter because you have no way knowing it?",
				"sch": null,
				"modsch": "查又查不出来，要不就别管是谁开的灯了？当它无所谓好了。"
			},
			{
				"en": "Guess I have no choice.",
				"sch": null,
				"modsch": "确实，继续纠结下去也没什么意义。"
			},
			{
				"en": "Wow, that's so vivid!",
				"sch": null,
				"modsch": "哇啊！这里跟现实世界一样！"
			},
			{
				"en": "I remember now!",
				"sch": null,
				"modsch": "我全都记起来了！"
			},
			{
				"en": "The law has limits. Justice has none. It's the phrase from Ultimate Justice! Oh my god!",
				"sch": null,
				"modsch": "“法律有界，正义无疆。”是《终极正义》里的台词！天哪！"
			},
			{
				"en": "That was unexpected. But yeah, I saw it too! Remember Charles and Vincent?",
				"sch": null,
				"modsch": "真是意想不到。我也看到了！你还记得夏尔斯和维森特吧？"
			},
			{
				"en": "Yes! These cop guys! They packed a punch for sure! Do you remember the jump from a helicopter with a miniguns in both hands?",
				"sch": null,
				"modsch": "当然，就那俩猛得离谱的警察！还记得他们双持加特林机枪从直升机往下跳那一段吗？"
			},
			{
				"en": "Of course! They landed with the sheer recoil from the miniguns. And Vincent was raining fire from a flamethrower all the time sitting on Vincent's neck!",
				"sch": null,
				"modsch": "对对对！他们利用机枪的后坐力成功落地了！维森特骑在夏尔斯肩上拿着喷火器杀出一条火路！"
			},
			{
				"en": "Damn, how it's possible?",
				"sch": null,
				"modsch": "奇了怪了，我们是怎么回想起来的？"
			},
			{
				"en": "Idk, let me process it for a bit.",
				"sch": null,
				"modsch": "别问我，我也得缓一缓。"
			},
			{
				"en": "Wait...",
				"sch": null,
				"modsch": "等等……"
			},
			{
				"en": "Charles and Vincent!!!",
				"sch": null,
				"modsch": "夏尔斯和维森特！！"
			},
			{
				"en": "Yeah?",
				"sch": null,
				"modsch": "怎么了？"
			},
			{
				"en": "Charps and...",
				"sch": null,
				"modsch": "夏普和..."
			},
			{
				"en": "Veen! It can't be a coincidence, right?",
				"sch": null,
				"modsch": "维恩……不会这么巧吧？"
			},
			{
				"en": "I'm sure it's not. Subconsious memory 100%.",
				"sch": null,
				"modsch": "这绝不可能是巧合。百分之一百是我们潜意识里的记忆。"
			},
			{
				"en": "Wild! I remember watching The Ultimate Justice as a kid in grandma's house, but it's like it happened yesterday!",
				"sch": null,
				"modsch": "太神了。小时候在奶奶家看《终极正义》的事现在记忆犹新，就跟昨天才看过一般。"
			},
			{
				"en": "Me too! I was watching it every weekend at grandma's in the summer! What a times!",
				"sch": null,
				"modsch": "我也是！一到暑假，每个周末都在奶奶家看。太让我怀念了。"
			},
			{
				"en": "Wait, in the country? On Sundays?",
				"sch": null,
				"modsch": "等下，你奶奶是住在乡下吗？每个星期天看的？"
			},
			{
				"en": "Yeah! How do you know?",
				"sch": null,
				"modsch": "是啊，你怎么会知道？"
			},
			{
				"en": "While nibbling on a raspberry pie drinking milk? On a red couch turned 90 degrees to the black and white tv between two windows?",
				"sch": null,
				"modsch": "是不是还边吃树莓边喝牛奶？躺在红沙发上，两扇窗户中间放着那台黑白电视？"
			},
			{
				"en": "Hold on!",
				"sch": null,
				"modsch": "你先打住！"
			},
			{
				"en": "And there is a few tomatoes riping near the window, some of them are green and some are red, and you definitely will grab the red one after the show but it will turn out moldy?",
				"sch": null,
				"modsch": "窗边是不是还放着几个西红柿，有的还青着，有的已经红了？你看完电视，专门挑了个红的，结果一看发霉了？"
			},
			{
				"en": "Why do you know this?",
				"sch": null,
				"modsch": "你在我家装监控了？"
			},
			{
				"en": "Because I see it as clear as it was yesterday.",
				"sch": null,
				"modsch": "这些都是我回想到的记忆，每个细节都清清楚楚。"
			},
			{
				"en": "Wait a second. Why do you have the same memory?",
				"sch": null,
				"modsch": "不对...怎么你跟我有共同的记忆？"
			},
			{
				"en": "Oh, Charps, why do people have the same memory?",
				"sch": null,
				"modsch": "夏普，你想想，什么情况下两个人会有同一段记忆？"
			},
			{
				"en": "I don't know! People usually don't have the same memory! What is this?!",
				"sch": null,
				"modsch": "我不知道！正常来说每个人的记忆都是不同的！怎么会这样？？"
			},
			{
				"en": "Come on. You really don't understand what it means?",
				"sch": null,
				"modsch": "都说到这儿了，你还没明白？"
			},
			{
				"en": "Stop speaking in riddles! You're driving me mad!",
				"sch": null,
				"modsch": "别打哑谜了！你快把我逼疯了！"
			},
			{
				"en": "People do have the same memory, but only in one case.",
				"sch": null,
				"modsch": "两个人有同一段记忆，只有一种可能。"
			},
			{
				"en": "If the people is in fact the single person.",
				"sch": null,
				"modsch": "那就是，这两个人其实是同一个人。"
			},
			{
				"en": "Oh it's BULLSHIT!",
				"sch": null,
				"modsch": "胡扯！"
			},
			{
				"en": "And when I went to sleep that day I spent an hour listening to the angry hum of the wasp nest inside the wall, when you punch it.",
				"sch": null,
				"modsch": "那天晚上我去睡觉，墙里的马蜂窝还在嗡嗡响。一捶墙，它们就怒气冲冲地叫——我听了整整一个钟头。"
			},
			{
				"en": "It can't be true! Wait... No... It's wrong. Why in the world should I be talking to myself?",
				"sch": null,
				"modsch": "不可能！等会儿……不，不对。我怎么就成了在跟自己说话？"
			},
			{
				"en": "Listen, I don't know. All I can tell is that we are the same person. That's it.",
				"sch": null,
				"modsch": "我也不清楚。我只能确定，咱俩是同一个人。就这样。"
			},
			{
				"en": "But it's fun talking to you! It shouldn't be fun if I talk to myself and know all the answers!",
				"sch": null,
				"modsch": "可跟你聊天明明很有意思啊！如果跟我自己聊天哪有这么多惊喜和未知？"
			},
			{
				"en": "You don't! And I don't know all of your questions. We are not the same anymore, but we were for sure.",
				"sch": null,
				"modsch": "我们以前是同一个人，但现在不是了；我猜不到你心里想着什么。"
			},
			{
				"en": "Fuck! I am just afraid of loosing you, man. You are my best and only friend. I don't want to be alone!",
				"sch": null,
				"modsch": "害！我只是太害怕失去你了！你是我最好的朋友，也是唯一的朋友。我不想只有我自己孤零零的！"
			},
			{
				"en": "Dude, calm down. You won't loose me! I'm here right now and I'm not you. Who cares what it was before? It's fine now!",
				"sch": null,
				"modsch": "别急啊，我这不是还在吗？我又不会消失。我是我，你是你。以前怎么样就随它去，咱们现在好好的就行！"
			},
			{
				"en": "THIS IS BULLSHIT!",
				"sch": null,
				"modsch": "实在是太荒谬了！"
			},
			{
				"en": "Yeah, you right.",
				"sch": null,
				"modsch": "行吧， 你说得对。"
			},
			{
				"en": "Or...",
				"sch": null,
				"modsch": "还是说..."
			},
			{
				"en": "Am I right?..",
				"sch": null,
				"modsch": "\"我\"是对的？"
			},
			{
				"en": "That's my dude!",
				"sch": null,
				"modsch": "哈哈，不愧是你！"
			},
			{
				"en": "In any case, that's too much for me today.",
				"sch": null,
				"modsch": "不管怎么说，今天这些事我是真消化不了了。"
			},
			{
				"en": "Yeah...",
				"sch": null,
				"modsch": "可不是嘛……"
			},
			{
				"en": "What is this place?",
				"sch": null,
				"modsch": "这是什么地方？"
			},
			{
				"en": "It's so ugly and yet familiar",
				"sch": null,
				"modsch": "这里看上去不咋地，但是感觉很熟悉。"
			},
			{
				"en": "I think it's home",
				"sch": null,
				"modsch": "我想……这是家。"
			},
			{
				"en": "You live in a concrete labyrinth of leaning towers without streets?",
				"sch": null,
				"modsch": "你家就住这种地方？歪歪斜斜的高楼，连条街都没有，整个一混凝土迷宫？"
			},
			{
				"en": "First of all, we both do. And seconly I don't think it was exactly like this. It's just an impression.",
				"sch": null,
				"modsch": "纠正一下，是我们住那儿。眼前的跟原貌的有点出入，这一个应该只是大概的印象。"
			},
			{
				"en": "Bleak, but somehow cozy, right?",
				"sch": null,
				"modsch": "看着挺冷清，可又莫名觉得挺温馨，是吧？"
			},
			{
				"en": "I don't know how that could be cosy, but you're not wrong.",
				"sch": null,
				"modsch": "虽然这地方的模样跟温馨沾不上边，但确实有那么点感觉。"
			},
			{
				"en": "Look at this tower!",
				"sch": null,
				"modsch": "快看这座塔！"
			},
			{
				"en": "Yeah?",
				"sch": null,
				"modsch": "怎么了？"
			},
			{
				"en": "Do you see what's on the rooftop?",
				"sch": null,
				"modsch": "看到楼顶上是什么了吗？"
			},
			{
				"en": "Air conditioning? Ventilation?",
				"sch": null,
				"modsch": "空调机？还是通风用的？"
			},
			{
				"en": "No, it's the machines i've been building. Or at least was watching being built.",
				"sch": null,
				"modsch": "不是，那是我造的那些机器...呃...被我看着造出来的机器。"
			},
			{
				"en": "Oh, that's what they look like? It is some filtration systems or vents.",
				"sch": null,
				"modsch": "哦，原来你那些机器长这样啊？这不就是过滤设备、通风口什么的吗？"
			},
			{
				"en": "The big one looks exactly like Beta-Pylene Oxidizer. And the smaller ones are active channel coolers.",
				"sch": null,
				"modsch": "大的那台，跟高能聚合物氧化塔一模一样。小的那些就是矿井风冷器 LV2。"
			},
			{
				"en": "I guess we found out where you inspiration comes from! We've been on this rooftop a few times.",
				"sch": null,
				"modsch": "看来你的灵感就来自这儿啊！咱俩以前上过这屋顶好几回呢。"
			},
			{
				"en": "Yeah. And we've been working here.",
				"sch": null,
				"modsch": "是啊，咱们以前在这里工作。"
			},
			{
				"en": "From 7 to 5 every day except weekends. Remember the security checkpoint woman?",
				"sch": null,
				"modsch": "我记得是朝七晚五双休。还记得安检口那个女的吗？"
			},
			{
				"en": "Oh yeah, I think she is a robot.",
				"sch": null,
				"modsch": "哦，她啊。我都怀疑她是机器人。"
			},
			{
				"en": "Or an alien sent to study us before the invasion",
				"sch": null,
				"modsch": "也可能是个外星人，入侵之前先派来摸摸咱们的底。"
			},
			{
				"en": "Oh man, I even miss her right now",
				"sch": null,
				"modsch": "哎，我甚至有点想她了。"
			},
			{
				"en": "Can't say the same for myself.",
				"sch": null,
				"modsch": "我可一点儿都不想。"
			},
			{
				"en": "Oh Veen, I think that's it. It's where we are right now.",
				"sch": null,
				"modsch": "维恩，我想就是这儿了。咱们现在就在这里。"
			},
			{
				"en": "I was working this night. That's the last memory.",
				"sch": null,
				"modsch": "这天晚上我在上班。之后的事我就想不起来了。"
			},
			{
				"en": "Something happened. Do you remember what you were doing?",
				"sch": null,
				"modsch": "那晚出事了。你还记得当时在干什么吗？"
			},
			{
				"en": "Yeah. Replacing thousands of breakers in that tube.",
				"sch": null,
				"modsch": "记得啊。当时在换那根管子里的断路器，足足几千个。"
			},
			{
				"en": "I was almost sleeping after the first hour. It's so tedious and boring.",
				"sch": null,
				"modsch": "那活儿又单调又无聊，做了一个多小时我的眼皮都快撑不住了。"
			},
			{
				"en": "Why was the stand operational that night?",
				"sch": null,
				"modsch": "那天晚上试验台为什么没停？"
			},
			{
				"en": "I dont know, did I fall asleep in the end? It's funny that you can never tell when exactly you fall asleep.",
				"sch": null,
				"modsch": "不知道。我后来该不会真睡着了吧？说来好笑，你永远说不准自己是什么时候睡着的。"
			},
			{
				"en": "Oh my god, if it's true, then we are just disassembled to subatomic particles.",
				"sch": null,
				"modsch": "不会吧……那咱们岂不是已经被分解成亚原子粒子了？"
			},
			{
				"en": "Yeah, at this exact moment I am a plasma ball. But how is it possible? Why am I thinking now? Why we are still alive?",
				"sch": null,
				"modsch": "对，就在这一刻，我已经是一团等离子体了。可不应该啊……我还在思考，我们还活着，怎么可能？"
			},
			{
				"en": "Maybe we don't. It looks like we got the coherency at last.",
				"sch": null,
				"modsch": "也许咱们已经死了。看来，相干终于实现了。"
			},
			{
				"en": "What?",
				"sch": null,
				"modsch": "啥意思？"
			},
			{
				"en": "Coherency on a scale. It's the only explanation of our existense. What if my brain doesn't exist, but all the information it was holding is not lost. At least for a moment.",
				"sch": null,
				"modsch": "大尺度的相干啊。这是我们能存在的唯一的可能性。也许我的大脑已经不存在了，原来那些信息却全都还在，至少这一瞬间还在。"
			},
			{
				"en": "But human being is not just an information, it's the complex system evolving in time. This information should live somewhere to be self-aware.",
				"sch": null,
				"modsch": "可光有信息还不够吧？人是个随时间不断变化的复杂系统。这些信息总得有个载体，才能有自我意识啊。"
			},
			{
				"en": "It lives everywhere. It must be almost intact, but it's not a property of the brain anymore, it's some sort of a huge coherent wavefunction. And it does not experience time and space.",
				"sch": null,
				"modsch": "这些信息现在无处不在，应该几乎都还完整，只是不再由大脑承载，而是以某种巨大的相干波函数存在。它不再经历时间，也不再经历空间。"
			},
			{
				"en": "Like a photon.",
				"sch": null,
				"modsch": "跟光子一样？"
			},
			{
				"en": "Yeah, something like that.",
				"sch": null,
				"modsch": "嗯，差不多吧。"
			},
			{
				"en": "So...",
				"sch": null,
				"modsch": "那……"
			},
			{
				"en": "What do we do?",
				"sch": null,
				"modsch": "我们接下来该做什么？"
			},
			{
				"en": "Assuming we have an eternity here, we do all the stuff we can infinite times. Maybe let's watch a few more universes being created or whatever it is?",
				"sch": null,
				"modsch": "要是这儿真有无穷无尽的时间，那就把能干的事都干上无数遍呗。要不再看几个宇宙诞生之类的？"
			},
			{
				"en": "Okay. But you know what? If I got here somehow, there is a way to get out.",
				"sch": null,
				"modsch": "好吧。不过我跟你说，既然我能进来，就肯定有办法出去。"
			},
			{
				"en": "You have no idea what are you talking about.",
				"sch": null,
				"modsch": "说得倒轻巧，你自己都没弄明白呢。"
			},
			{
				"en": "Yeah, but I have a few years to figure it out.",
				"sch": null,
				"modsch": "是这样，但我在这里有的是时间想办法。"
			},
			{
				"en": "Alright, I'm in!",
				"sch": null,
				"modsch": "行，算我一个！"
			},
			{
				"en": "As if you have a choice!",
				"sch": null,
				"modsch": "说得好像你有得选似的！"
			}
		],
		"credits": [
			{
				"en": "The beginning",
				"sch": "开端",
				"modsch": "引言"
			},
			{
				"en": "I really appreciate you made it to the very end, where everything starts",
				"sch": "我真的很感谢你坚持到了最后，一切都从这里开始",
				"modsch": "我真的很感谢你坚持到了最后，这里是一切的起点"
			},
			{
				"en": "Congratulations, I guess!",
				"sch": "我想，恭喜你！",
				"modsch": "恭喜你！"
			},
			{
				"en": "Just look at this:",
				"sch": "看看这个：",
				"modsch": "看看你这周目的数据吧："
			},
			{
				"en": "Resources mined in total:",
				"sch": "总共开采资源：",
				"modsch": "总共开采资源："
			},
			{
				"en": "Charonites:",
				"sch": "查伦石:",
				"modsch": "[灰]卡戎碳："
			},
			{
				"en": "Elmerines:",
				"sch": "埃尔梅林:",
				"modsch": "[黄]稀土："
			},
			{
				"en": "Qanetites:",
				"sch": "卡内特石:",
				"modsch": "[紫]硅晶："
			},
			{
				"en": "Beta-Pylenes:",
				"sch": "贝塔派伦:",
				"modsch": "[红]高能聚合物："
			},
			{
				"en": "Hell Gems:",
				"sch": "地狱宝石:",
				"modsch": "[绿]地心晶体："
			},
			{
				"en": "Chromalits:",
				"sch": "铬马利特:",
				"modsch": "[青]核能气体："
			},
			{
				"en": "Celestial foam:",
				"sch": "天体泡沫:",
				"modsch": "[白]量子泡沫："
			},
			{
				"en": "Hollow stones:",
				"sch": "空心石:",
				"modsch": "空心石："
			},
			{
				"en": "Voids:",
				"sch": "虚空石:",
				"modsch": "虚空："
			},
			{
				"en": "Realities:",
				"sch": "现实石：",
				"modsch": "现实："
			},
			{
				"en": "Machines built:",
				"sch": "建造机器数量：",
				"modsch": "建造机器数量："
			},
			{
				"en": "Machines destroyed:",
				"sch": "摧毁机器数量：",
				"modsch": "拆除机器数量："
			},
			{
				"en": "Maximum channel depth in meters:",
				"sch": "最大通道深度（米）：",
				"modsch": "最深矿井下钻深度（米）："
			},
			{
				"en": "Strange rock poked:",
				"sch": "奇怪的岩石的开采数量：",
				"modsch": "空心石开采数量："
			},
			{
				"en": "Times teleported:",
				"sch": "传送次数：",
				"modsch": "传送次数："
			},
			{
				"en": "Cube clicks:",
				"sch": "立方体点击次数：",
				"modsch": "矿方体点击次数："
			},
			{
				"en": "Time warps:",
				"sch": "时间扭曲次数：",
				"modsch": "时间扭曲次数："
			},
			{
				"en": "Play time:",
				"sch": "游玩时间：",
				"modsch": "游玩时间："
			},
			{
				"en": "h",
				"sch": "小时",
				"modsch": "小时"
			},
			{
				"en": "Game created by:<br>Oleg Danilov",
				"sch": "游戏创作者：<br>Oleg Danilov",
				"modsch": "游戏作者：<br>Oleg Danilov"
			},
			{
				"en": "Additional graphics:<br>Yulia Nogteva",
				"sch": "附加图形：<br>Yulia Nogteva",
				"modsch": "其他美术：<br>Yulia Nogteva"
			},
			{
				"en": "Dialogue editing:<br>Abdurahman Zulumhanov and Anna Peterson",
				"sch": "对话编辑：<br>Abdurahman Zulumhanov 和 Anna Peterson",
				"modsch": "剧情编辑：<br>Abdurahman Zulumhanov 和 Anna Peterson"
			},
			{
				"en": "Steam publishing:<br>Playsaurus",
				"sch": "Steam 发布：<br>Playsaurus",
				"modsch": "Steam 发布：<br>Playsaurus"
			},
			{
				"en": "Play testing:<br>Community of Leprosorium, Abdurahman Zulumhanov, Playsaurus",
				"sch": "游戏测试：<br>Leprosorium 社群、Abdurahman Zulumhanov、Playsaurus",
				"modsch": "游戏测试：<br>Leprosorium 社群、Abdurahman Zulumhanov、Playsaurus"
			},
			{
				"en": "THE END",
				"sch": "终",
				"modsch": "终"
			},
			{
				"en": "You may go and play Cookie Clicker or something now.",
				"sch": "你现在可以去玩 Cookie Clicker 或其他游戏了。",
				"modsch": "你现在可以去玩 Cookie Clicker 或其他游戏了。"
			},
			{
				"en": "Music:<br>Jake Chudnow, Hernán Marandino",
				"sch": "音乐：<br>Jake Chudnow、Hernán Marandino",
				"modsch": "音乐：<br>Jake Chudnow、Hernán Marandino"
			},
			{
				"en": "Deutsch: flex 4711, Patrick Karban",
				"sch": "Deutsch: flex 4711, Patrick Karban",
				"modsch": "德语: flex 4711, Patrick Karban"
			},
			{
				"en": "Português: selfemcrowdin, Mateus Iamarino",
				"sch": "Português: selfemcrowdin, Mateus Iamarino",
				"modsch": "葡萄牙语: selfemcrowdin, Mateus Iamarino"
			},
			{
				"en": "Italiano: doralum",
				"sch": "Italiano: doralum",
				"modsch": "意大利语: doralum"
			},
			{
				"en": "Español: armangar, Syunay Kamenov",
				"sch": "Español: armangar, Syunay Kamenov",
				"modsch": "西班牙语: armangar, Syunay Kamenov"
			},
			{
				"en": "Français: KjetilVion, Etienne Samson, William (Ekitchi)",
				"sch": "Français: KjetilVion, Etienne Samson, William (Ekitchi)",
				"modsch": "法语: KjetilVion, Etienne Samson, William (Ekitchi)"
			},
			{
				"en": "Nederlands: lievevandyck",
				"sch": "Nederlands: lievevandyck",
				"modsch": "荷兰语: lievevandyck"
			},
			{
				"en": "Čeština: Jakub Strelinger, Kryštof Kubík",
				"sch": "Čeština: Jakub Strelinger, Kryštof Kubík",
				"modsch": "捷克语: Jakub Strelinger, Kryštof Kubík"
			},
			{
				"en": "Polski: PolglishPL",
				"sch": "Polski: PolglishPL",
				"modsch": "波兰语: PolglishPL"
			},
			{
				"en": "日本語: Winna Tolentino",
				"sch": "日本語: Winna Tolentino",
				"modsch": "日语: Winna Tolentino"
			},
			{
				"en": "한국어: Ah Lon Sin, Sumin Park, Cyberowl",
				"sch": "한국어: Ah Lon Sin, Sumin Park, Cyberowl",
				"modsch": "韩语: Ah Lon Sin, Sumin Park, Cyberowl"
			},
			{
				"en": "简体中文：Daisy Chan, kevinlee7, YuLun",
				"sch": "简体中文：Daisy Chan, kevinlee7, YuLun",
				"modsch": "简体中文：空灵灵(Cattail), Daisy Chan, kevinlee7, YuLun"
			},
			{
				"en": "繁體中文: Daisy Chan, kevinlee7",
				"sch": "繁體中文: Daisy Chan, kevinlee7",
				"modsch": "繁體中文：空灵灵(Cattail), Daisy Chan, kevinlee7"
			},
			{
				"en": "ไทย: They say P, Phimze Pym",
				"sch": "ไทย: They say P, Phimze Pym",
				"modsch": "泰语: They say P, Phimze Pym"
			},
			{
				"en": "Magyar: Simon Dániel és Márton-Mezey Csenge",
				"sch": "Magyar: Simon Dániel és Márton-Mezey Csenge",
				"modsch": "匈牙利语: Simon Dániel és Márton-Mezey Csenge"
			},
			{
				"en": "Latviešu valoda: Roberts Artūrs Bumburs (Arburo)",
				"sch": "Latviešu valoda: Roberts Artūrs Bumburs (Arburo)",
				"modsch": "拉脱维亚语: Roberts Artūrs Bumburs (Arburo)"
			},
			{
				"en": "Română: Eric Apetrei",
				"sch": "Română: Eric Apetrei",
				"modsch": "罗马尼亚语: Eric Apetrei"
			},
			{
				"en": "Norsk: Justina1131",
				"sch": "Norsk: Justina1131",
				"modsch": "挪威语: Justina1131"
			},
			{
				"en": null,
				"sch": null,
				"modsch": ""
			}
		],
		"explainer": [
			{
				"en": "Press and hold.",
				"sch": "按住不放。",
				"modsch": "长按。"
			},
			{
				"en": "Always click on the cell underneath.",
				"sch": "总是点击底下的单元格。",
				"modsch": "快速点击矿方块下方的单元格。"
			},
			{
				"en": "<span class=\"keyboard\">Q</span>, <span class=\"keyboard\">Esc</span> or right-click to cancel.",
				"sch": "<span class=\"keyboard\">Q</span>, <span class=\"keyboard\">Esc</span> 或鼠标右键取消。",
				"modsch": "<span class=\"keyboard\">Q</span>, <span class=\"keyboard\">Esc</span> 或鼠标右键取消。"
			},
			{
				"en": "Hold <span class=\"keyboard\">Alt</span> to take a closer look.",
				"sch": "按住 <span class=\"keyboard\">Alt</span> 仔细查看。",
				"modsch": "按住 <span class=\"keyboard\">Alt</span> 查看详情。"
			},
			{
				"en": "Press <span class=\"keyboard\">Q</span> over an empty cell to pick a demolishing tool.",
				"sch": "在空白单元格上按 <span class=\"keyboard\">Q</span> 选择拆除工具。",
				"modsch": "在空白单元格上按 <span class=\"keyboard\">Q</span> 选择拆除工具。"
			},
			{
				"en": "Press <span class=\"keyboard\">Q</span> over a machine to try to build one more.",
				"sch": "在机器上按 <span class=\"keyboard\">Q</span> 尝试再建造一台。",
				"modsch": "在机器上按 <span class=\"keyboard\">Q</span> 复制可以在其他地方再建造一台。"
			},
			{
				"en": "WASD or right-click and drag to look around.",
				"sch": "WASD 或右键单击并拖曳以环顾四周。",
				"modsch": "WASD 或长按右键并拖拽以环顾四周。"
			}
		],
		"random": {
			"paste": {
				"en": "A save code has been copied to the clipboard. Now paste it somewhere safe.",
				"sch": "储存码已复制到剪贴簿。现在请将它粘贴到安全的地方。",
				"modsch": "存档码已复制到剪贴簿。现在请将它粘贴到安全的地方。"
			},
			"toolate": {
				"en": "It is too late to save anything. Everything has already happened.",
				"sch": "想要挽救任何事情都为时已晚。一切都已经发生了。",
				"modsch": "想要挽救任何事情都为时已晚。一切都已经发生了。"
			},
			"existed": {
				"en": "NEW",
				"sch": "新建",
				"modsch": "新内容"
			},
			"steamWarning": {
				"en": "Steam error. Autosave and achievements will not work. Try relaunching the game.",
				"sch": "Steam发生错误。自动储存和成就将无法使用。尝试重新启动游戏。",
				"modsch": "Steam发生错误。自动储存和成就将无法使用。请尝试重新启动游戏。"
			},
			"currentSurge": {
				"en": "Current surge",
				"sch": "电流浪涌",
				"modsch": "浪涌效果"
			},
			"surge0": {
				"en": "Boosts a random channel for a short time.",
				"sch": "短时间提升一个随机频道。",
				"modsch": "短时间随机提升一个矿井。"
			},
			"surge1": {
				"en": "Attempts to refill a random machine.",
				"sch": "尝试重新填充随机机器。",
				"modsch": "随机满充能一个机器。"
			},
			"surge2": {
				"en": "Damages a random cube.",
				"sch": "损坏一个随机立方体。",
				"modsch": "随机摧毁一个矿方体。"
			},
			"surge3": {
				"en": "Harvests Beta-Pylene from a random cube, leaving behind Charonite and trace amount of other resources. Damages the cube.",
				"sch": "从一个随机立方体中收获贝塔派伦，留下查伦石和少量其他资源。损坏立方体。",
				"modsch": "从随机一个矿方体中抽出所有的[红]高能聚合物，用[灰]卡戎碳和少量其他资源进行替换，并破坏矿方体当前耐久的80%。"
			},
			"surge4": {
				"en": "Boosts a random converter.",
				"sch": "增强一个随机转换器。",
				"modsch": "随机加强一个物质转换类机器。"
			},
			"surge5": {
				"en": "Spawns a surge. Only one Chromalit surge can be stabilized at a time.",
				"sch": "产生一股浪涌。每次只能稳定一股铬马利特涌浪。",
				"modsch": "随机产生一股浪涌。每次只能稳定一股[青]核能气体浪涌。"
			},
			"surge6": {
				"en": "Instantly annihilates one Hell Gem using one unit of Celestial Foam.",
				"sch": "使用一单位天体泡沫立即消灭一颗地狱宝石。",
				"modsch": "让一个[白]量子泡沫和一颗[绿]地心晶体进行湮灭。"
			},
			"surge7": {
				"en": "Spawns a Hollow Stone.",
				"sch": "生成一块空心石。",
				"modsch": "生成一块空心石。"
			},
			"surge8": {
				"en": "Recharges one second-grade stabilizer, but depletes shortly afterward. Not tested against Reality Surge.",
				"sch": "为一个二级稳定器充电，但很快耗尽。未经现实浪涌测试。",
				"modsch": "为一个二级能量稳定器充能。该浪涌的消耗速度极快。还没有给现实浪涌测试过呢。"
			},
			"surge9": {
				"en": "Partially recharges all symbols.",
				"sch": "部分补充所有符号。",
				"modsch": "缩短所有符号的生长进度。"
			},
			"newHole": {
				"en": "Reset and get +1 Orifice",
				"sch": null,
				"modsch": "重置并获得1个新拓井"
			},
			"newUpgrade": {
				"en": "Reset and upgrade existing Orifice",
				"sch": null,
				"modsch": "重置并升级当前拓井"
			},
			"lowTier": {
				"en": "REQUIRES TIER",
				"sch": null,
				"modsch": "所需等级："
			},
			"orificeUpgrade": {
				"en": "Upgrade this Orifice to tier",
				"sch": null,
				"modsch": "升级当前拓井至等级"
			},
			"tier": {
				"en": "Tier",
				"sch": null,
				"modsch": "等级"
			},
			"noorbs": {
				"en": "No orbifolds",
				"sch": null,
				"modsch": "本轮未使用轨形"
			}
		},
		"memories": {
			"memory0": {
				"header": {
					"en": "The Ultimate Justice",
					"sch": null,
					"modsch": "终极正义"
				},
				"lore": {
					"en": "There's that old trashy tv-show about two cops. The city is is devoured by crime of course, everybody is corrupt except those two guys. Charles, the sheriff, and his partner Vincent would be considered criminals by todays standards though. Even a petty crime is enough for them to destoy half of the block to get you. Justice justifies everything.",
					"sch": null,
					"modsch": "有这么部俗套的老电视剧，讲的是两个警察的故事。满城罪恶，人人腐败，偏偏这两位出淤泥而不染。只是换成今天的眼光，夏尔斯警长和他的搭档维森特，恐怕也该被抓起来。甭管你犯的罪有多轻，他们只要是为了抓你，半个街区照毁不误。只要打着正义的旗号，干什么都能理直气壮。"
				}
			},
			"memory1": {
				"header": {
					"en": "The Home",
					"sch": null,
					"modsch": "家"
				},
				"lore": {
					"en": "Everything around is made of the same blocks. Scale doesn't matter. Something big is just more blocks, something small — less blocks. But spending a lot of time here teaches to notice the slightest variations and faint patterns to tell one place from another one.",
					"sch": null,
					"modsch": "周围的一切，都是用同样的方块搭出来的。东西无论大小，在构成上都没什么分别。无非是大东西用的方块多，小东西用的方块少。不过，时间久了，再细小的不同、再不起眼的规律也能看出来，地方自然就分得清了。"
				}
			},
			"memory2": {
				"header": {
					"en": "The Tower",
					"sch": null,
					"modsch": "高塔"
				},
				"lore": {
					"en": "There's a place called \"Field Coherence Research Facility\" usually referred as \"NII\". Every morning an enormous tidal wave of people rushes into the tower and every evening another wave washes everyone away and dissolves into the town. One breath a day. This is the only reason this town exists.",
					"sch": null,
					"modsch": "有个地方名为“场相干性研究所”，大家平时都叫它“NII”。每日清晨，大批人群如潮水般涌入高塔；傍晚，又随另一阵浪潮离开，消散在小镇各处。就像是每天呼吸一次的巨兽。这座小镇存在的理由，也就只有这一个。"
				}
			},
			"memory3": {
				"header": {
					"en": "The Incident",
					"sch": null,
					"modsch": "事故"
				},
				"lore": {
					"en": "An engineer is replacing all the fuses inside the Collapsed Topology Accelerator Arc Test Stand. They were testing the limits of wavefunction coherency on a large scale there. There are lots of fuses inside the accelerator pipe, much more than safeguards, working regulations and minutes of sleep for a single engineer. In general, a brain is just a collection of wavefunctions on a very large scale. The scale which is now proven to remain coherent for a single moment in time even with body being evaporated. For this brain in this exact moment the time and space doesn't exist. This mind is observing the existence of everything, just in a way it can.",
					"sch": null,
					"modsch": "“坍缩拓扑加速器弧段试验台”内部，一名工程师正逐一更换全部保险丝。这里的实验，是要探明波函数在大尺度下保持相干的极限。加速器管道里最不缺的就是保险丝：比防护措施多得多，比作业规程多得多，也远比一个工程师能睡上的分钟数多。说到底，大脑也不过是一个尺度极大的波函数集合。如今已经证实：即使肉体被蒸发，如此大尺度的整体也能在一瞬间维持相干。就在这一刻，时间和空间对大脑来说已经不复存在。意识会以它所及之处观察世间万物。"
				}
			}
		}
	}
})(globalThis)
