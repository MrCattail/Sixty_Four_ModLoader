(function (global) {
	'use strict'

	// en and sch are snapshots of the current vanilla words.js for side-by-side review.
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
				"modsch": "你会失去一切，我不是开玩笑的。继续长按以确认。"
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
				"modsch": "游戏包含强光频闪效果。如果你对它们敏感请考虑通过点击此图标以禁用效果。"
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
					"modsch": "永动机（并非）"
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
					"en": "Play for 64 hours",
					"sch": "玩64小时",
					"modsch": "玩64个小时"
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
					"modsch": "地心行者"
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
					"modsch": "挖掘64公里深"
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
					"modsch": "15分钟内，在不拆除任何建筑并且拥有14个及以下的核能气体储存罐，通关游戏"
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
					"modsch": "挖掘深度达64米"
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
					"modsch": "挖掘深度达640米"
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
					"modsch": "挖掘深度达6400米"
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
					"modsch": "放置一座全新的矿井 LV2 后其于6分钟内挖掘深度达到6400米"
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
					"modsch": "在全程不升级矿井 LV1的情况下通关游戏"
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
					"modsch": "在一个同时具有五种不同资源的地点上建造一个梯度矿井"
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
					"modsch": "梯度矿井"
				},
				"description": {
					"en": "An everlasting mineable cube. Responds to most destabilizers and resonators. Should be connected to the Inverse Chasm via conductors.",
					"sch": "一个永久的可开采立方体。对大多数去稳定器和共振器做出响应。应通过导体连接到逆裂缝。",
					"modsch": "一座能无视深度在垂直多个地质层中汲取资源的矿井。本体相当于一个永久的可开采的矿方体。不同的资源梯度对应不同的的资源和种类。受大多数挖矿机/解构加速器的效果影响。提示：可以通过导线连接到逆裂缝。"
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
					"modsch": "能输送资源的通道。提示：可以将逆裂缝与高级筒仓连接起来。"
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
					"modsch": "能挖掘资源并将其放置在四周。"
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
					"modsch": "矿井 LV1 升级版。能快速挖掘大量资源并能将其放置在四周更远的地方。"
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
					"modsch": "能将解构相邻矿方体的力量提高至2倍。需要投入1个[黄]稀土才能运作。多个解构加速器能叠加效果。"
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
					"modsch": "解构加速器的升级版。能将解构相邻矿方体的力量提高至4倍。需要投入64个[黄]稀土才能运作。多个解构加速器能叠加效果。"
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
					"modsch": "解构加速器 LV2 的升级版。当开采的矿方体中存在[绿]地心晶体时，解构矿方体的力量会提高至625倍；反之不进行任何力量加成。需要1颗[绿]地心晶体才能运作。多台解构加速器会叠加效果。"
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
					"modsch": "能让相邻的矿井的抬升矿方体的速度提高至2倍。多台风冷器能叠加效果。"
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
					"modsch": "风冷器 LV1 的升级版。能让相邻的矿井的抬升矿方体的速度提高至3倍。多台风冷器能叠加效果。"
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
					"modsch": "能防止相邻的矿井泄压并停止。需要1块[灰]卡戎碳才能运作。"
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
					"modsch": "辅助泵 LV1 的升级版。能为相邻的矿井持续提供压力。需要8个[黄]稀土才能运作。多个辅助泵并不会叠加效果。"
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
					"modsch": "辅助泵 LV2 的升级版。能为相邻的矿井持续提供4倍压力。需要256个[黄]稀土和4个[红]高能聚合物才能运作。多个辅助泵并不会叠加效果。"
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
					"modsch": "能定期解构相邻的矿方体。需要1块[紫]硅晶才能运作。"
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
					"modsch": "熵增挖矿机 LV1 的升级版。解构矿方体的速度提高至3倍。需要1个[青]核能气体才能运作。"
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
					"modsch": "熵增挖矿机 LV1 的升级变种版。在矿方体出现在表面的那一刻以熵增挖矿机LV1的 600% 的力量进行冲击。但每个矿方体仅限冲击一次。需要8个[青]核能气体才能运作。"
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
					"modsch": "熵增挖矿机 LV2 的升级版。每次湮灭发生，挖矿机都会以巨大的力量解构周围的矿方体。"
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
					"modsch": "燃烧[红]高能聚合物，产生微量的[黄]稀土和[紫]硅晶 和 [灰]卡戎碳。"
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
					"modsch": "吸收并存储邻近的破碎矿方体，碎矿总储量达到 1024 后，它会释放所有资源并附带精炼后的额外资源。连续释放可使精炼资源增加，最高可达原资源的100%。如果16秒内没有吸收任何资源，效果就会重置。"
				}
			},
			"preheater": {
				"name": {
					"en": "Catalytic preheater",
					"sch": "催化预热器",
					"modsch": "预热器"
				},
				"description": {
					"en": "Increases the speed of any resource conversion machine if placed next to one. Each converter increases the preheater's speed boost, up to 300%, if 8 machines are affected.",
					"sch": "如果放置在任何资源转换机旁边则可以增加该机器的转换速度。每增加一台转换机，预热器的速度提升就会增加。如果影响到8台机器，最高可达300%。",
					"modsch": "增加相邻的转换类机器的转换速度。每增加一台转换类机器，预热器的速度提升就会增加。如果同时预热到8台转换类机器，预热器最高加速效果可达300%。"
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
					"modsch": "点击目前的传送点可以将你传送到下一个传送点。"
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
					"modsch": "能量稳定器 LV1 的升级版。能提高稳定性和性能。"
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
					"modsch": "异常的升级。能提高性能并最大程度提高稳定性。该建筑上限为1个。"
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
					"modsch": "释放内核，能振动现实结构和周围完全发光的符号，并探测范围内的资源梯度。距离世界中心越远，资源梯度点位越丰富。"
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
					"modsch": "建造一座梯度矿井的地基。如果在其上建造一做梯度矿井，资源收益将翻倍。移动梯度矿井的位置将消除此加成。将材料“现实”注入进隧穿洞会将你传送到现实中心点。"
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
			}
		},
		"messages": [
			{
				"en": "Where are you?",
				"sch": "你在哪？",
				"modsch": "你在哪里？"
			},
			{
				"en": "I'm literally in the middle of nowhere",
				"sch": "真·荒无人烟之地",
				"modsch": "我在一片空白之中"
			},
			{
				"en": "Alright, what do you see?",
				"sch": "行，能看见啥？",
				"modsch": "什么都没有吗？"
			},
			{
				"en": "Well, not much. There's this machine here, it looks kinda familiar but I can't put my finger on it",
				"sch": "额，没啥。这里有一台机器，看着有点眼熟，但又说不上来",
				"modsch": "是也不是，只有一台机器在这里。看着很眼熟，但我想不起来是什么。"
			},
			{
				"en": "What machine?",
				"sch": "什么机器？",
				"modsch": "什么机器？"
			},
			{
				"en": "Hold on, maybe I can...",
				"sch": "等一下，也许我可以...",
				"modsch": "等下，让我试试..."
			},
			{
				"en": "Wait, tell me you are NOT touching some random machine right now!",
				"sch": "等会，你别是在乱摸一台不知道是啥的机器吧！",
				"modsch": "蛤？没有说明书不要乱摸啊！"
			},
			{
				"en": "It's working! It just created something",
				"sch": "它运作了！它刚刚创造了一些东西",
				"modsch": "它启动了！周围升起了些东西"
			},
			{
				"en": "???",
				"sch": "???",
				"modsch": "???"
			},
			{
				"en": "A huge black cube. It's so smooth. I really wanna break it",
				"sch": "一个巨大的黑色立方体。真是太光滑了。我真的很想敲碎它",
				"modsch": "一个超大的黑色四方体。表面跟玻璃一样光滑，我很想打碎它。"
			},
			{
				"en": "Are you high?",
				"sch": "你没事吧?",
				"modsch": "你没嗑药吧"
			},
			{
				"en": "I now have 64 stones!",
				"sch": "我现在有64块石头了！",
				"modsch": "我现在有64个石头了！"
			},
			{
				"en": "Well, okay then. Have fun with that.",
				"sch": "那好吧。祝你玩得开心。",
				"modsch": "呃呃呃，你玩得开心就好"
			},
			{
				"en": "Hey, I found a yellow stone!",
				"sch": "嘿，我找到一块黄色的石头！",
				"modsch": "诶，还有黄色的石头！"
			},
			{
				"en": "Good for you man!",
				"sch": "好样的",
				"modsch": "不错啊"
			},
			{
				"en": "I think I can build machines now. I should build something to help break these cubes more easily. If a cube shows up in an adjacent cell, even diagonally, it should work.",
				"sch": "我想我现在可以建造机器了。我应该建造一些东西来帮助更轻松地打破这些立方体。如果一个立方体出现在相邻的单元格中，即使是对角线，它也应该起作用。",
				"modsch": "我现在好像可以建造一些机器出来。建一些能帮我更快地打碎这些立方体的机器。我发现只要放在相邻或者对角的位置就有效果了"
			},
			{
				"en": "Wait, are you playing some weird game? You're starting to creep me out",
				"sch": "等等，你是在玩什么奇怪的游戏吗？别吓我",
				"modsch": "等下，你是在玩什么新游戏而已吧？我都不知道你在说什么"
			},
			{
				"en": "Now I just need to put a yellow stone inside this machine.",
				"sch": "现在我只需要将一块黄色的石头放进这台机器。",
				"modsch": "现在我只需要把一块黄色石头放进这台机器里"
			},
			{
				"en": "Whatever makes you happy... Jokes aside, are you coming over today?",
				"sch": "你开心就好……哦对了，你今天要过来吗？",
				"modsch": "你怎么开心怎么来...不开玩笑了，你今天要来还是不来？"
			},
			{
				"en": "Definitely! I'll be there in a few hours, just need to finish this up.",
				"sch": "当然！几小时后到，只需先完成这个。",
				"modsch": "来啊，几个小时之后吧，我先做完这些事"
			},
			{
				"en": "What exactly are you doing?",
				"sch": "你究竟在做什么？",
				"modsch": "你究竟在做啥？"
			},
			{
				"en": "I'll text you later. I need to keep pushing the machine, sorry.",
				"sch": "我稍后会给你发短信。我需要继续推动机器，抱歉。",
				"modsch": "我等会再发消息给你。我要先照顾这些机器。"
			},
			{
				"en": "I believe machines influence each other when placed in adjacent or diagonal cells. For example, this fan needs to be placed next to the first machine to speed up the process.",
				"sch": "我认为当机器放置在相邻或对角的单元格中时，机器会相互影响。例如，风扇需要放置在第一台机器旁边以加快流程。",
				"modsch": "我觉得这些机器只要是相邻或对角放置都会互相影响。举例来说，这个风扇可以放在矿井旁边从而加速它的运作。"
			},
			{
				"en": "You are making so much sense right now",
				"sch": "你现在说得很有道理",
				"modsch": "对对对，你说得太对了"
			},
			{
				"en": "Well?",
				"sch": "吗?",
				"modsch": "哈喽?"
			},
			{
				"en": "Where are you at?",
				"sch": "你在哪？",
				"modsch": "你在哪？"
			},
			{
				"en": "We've been waiting for you for ages now.",
				"sch": "我们已经等你很久了。",
				"modsch": "我们已经等你很久了。"
			},
			{
				"en": "What do you mean? I'm still here.",
				"sch": "你急什么？我还在这没动。",
				"modsch": "你急什么？我还在这没动。"
			},
			{
				"en": "WHERE???",
				"sch": "哪里???",
				"modsch": "哪里???"
			},
			{
				"en": "I've got a blue stone now. Or is it purple? It sounds like an antique brass candlestick. I think I could use it to remove misplaced machines.",
				"sch": "我现在有一块蓝色，额也可能是紫色的石头了。 听起来像一个古董黄铜烛台。我想我可以用它来移除放错地方的机器。",
				"modsch": "我现在有一块蓝色，额也可能是紫色的石头了。敲起来的声音像是在摇铃铛一样。我想我可以用它来删掉放错地方的机器。"
			},
			{
				"en": "Are you kidding me? I thought you said you were coming. What the hell?!",
				"sch": "你在开玩笑吗？我以为你说你要来。到底怎么回事？！",
				"modsch": "你在开玩笑吗？我以为你说你要来。到底怎么回事？！"
			},
			{
				"en": "Chill man, I'll be there in a minute",
				"sch": "冷静点，我一会儿就到",
				"modsch": "冷静点，我一会儿就到"
			},
			{
				"en": "Wow, I can use [Q] to clone machines or destroy them if I click on a free cell first! And [Alt] helps to see behind tall machines.",
				"sch": "哇，我可以使用[Q]来复制机器或先在空白方格点击然后摧毁它们！而且[Alt]可以帮助查看高大机器后面的情况。",
				"modsch": "哇，我发现我可以对着机器按 [Q] 来复制出另一个机器，并且我还可以先对着空地按 [Q] ，然后将空格复制到机器上，就等于删除机器了！还有按着 [Alt] 并且用鼠标对准机器就能查看机器的详情信息了！"
			},
			{
				"en": "CHOP CHOP",
				"sch": "快点",
				"modsch": "搞快点"
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
				"modsch": "你人跑哪里去了？？？？"
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
				"modsch": "什么鬼啊？"
			},
			{
				"en": "ARE YOU OKAY? WHERE ARE YOU?",
				"sch": "你还好吗？你在哪里？",
				"modsch": "兄弟，你人还好吗？你人在哪里？"
			},
			{
				"en": "Chill man! I am ok, what's going on?",
				"sch": "冷静点，兄弟！我没事，怎么了？",
				"modsch": "冷静点，哥们，我很好啊。怎么问我这么多次？"
			},
			{
				"en": "You tell me! You've been ghosting me for two weeks now! I even went to your place a few times, but you weren't there. Just tell me where you are, that's it. Are you home right now?",
				"sch": "好意思问我！你已经鬼鬼祟祟地躲着我两个星期了！我甚至去你家几次，但你都不在。就告诉我你在哪里，没别的。你现在在家吗？",
				"modsch": "你倒是说你现在是什么情况啊？你失踪两个星期了，我甚至去了你家好几次，但我根本没看到你。你可以跟我说发生了什么事，你是不是被绑架了？你现在回家了没？"
			},
			{
				"en": "Dude, what are talking about? We texted each other literally two minutes ago.",
				"sch": "兄弟，你在说什么？我们事实上在两分钟前才互发短信。",
				"modsch": "没有吧，两分钟前我们刚互发短信啊。"
			},
			{
				"en": "WHAT IS WRONG WITH YOU??? First you didn't show up, then you disappeared completely. And now you act like nothing happened!",
				"sch": "你到底怎么了??? 你先是没有出现，然后彻底没影了。现在你却表现得像什么事都没发生一样！",
				"modsch": "兄弟，你之前没来就算了，然后你就完全失踪了，现在你就跟失忆了一样！"
			},
			{
				"en": "I am asking you a simple question",
				"sch": "我问你一个简单的问题",
				"modsch": "我就问你一个问题"
			},
			{
				"en": "WHERE ARE YOU?",
				"sch": "你在哪里？",
				"modsch": "你 在 哪"
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
				"modsch": "等会..."
			},
			{
				"en": "It is not funny man. Where are you exactly? Can you tell me that?",
				"sch": "这一点也不好笑。你到底在哪里？你能告诉我吗？",
				"modsch": "我真的很担心你，你究竟在哪里？告诉我行不行？"
			},
			{
				"en": "Well...",
				"sch": "额……",
				"modsch": "额……"
			},
			{
				"en": "Dude, I don't actually know.",
				"sch": "兄弟，我其实不知道。",
				"modsch": "其实 我也不知道啊"
			},
			{
				"en": "Give me a minute",
				"sch": "让我想想",
				"modsch": "让我想想"
			},
			{
				"en": "What do you mean you don't know?",
				"sch": "你不知道你在哪吗？",
				"modsch": "什么叫你也不知道"
			},
			{
				"en": "I need to gather my thoughts",
				"sch": "我需要整理思绪",
				"modsch": "我需要 整理一下我的思绪"
			},
			{
				"en": "Is everything all right? Are you safe? Should I call someone?",
				"sch": "一切都还好吗？你安全吗？我应该找人吗？",
				"modsch": "你真的还好吗？没有遇到危险吧？要我帮你报警吗？"
			},
			{
				"en": "No, I am good. I just",
				"sch": "不，我很好。我只是",
				"modsch": "没事 我很好 我只是"
			},
			{
				"en": "I'll text you in a bit",
				"sch": "我一会儿给你发短信",
				"modsch": "过会我再给你发短信"
			},
			{
				"en": "Damn, man. What's going on?",
				"sch": "该死，兄弟。怎么了？",
				"modsch": "啊啊啊，兄弟，现在到底是什么情况？"
			},
			{
				"en": "I am scared",
				"sch": "我很害怕",
				"modsch": "我有点害怕"
			},
			{
				"en": "It seems I don't know where I am",
				"sch": "看来我不知道我在哪里",
				"modsch": "貌似我根本不知道我在哪"
			},
			{
				"en": "This is so weird. I mean, everything is fine with me. But I can't describe this place.",
				"sch": "这太奇怪了。就是，我这个人一切都很好。但我无法形容这个地方。",
				"modsch": "这里太怪了。我的意思是我人很好，但是我很难形容这里"
			},
			{
				"en": "It's like a dream, but then again it's not. Everything is white and there are these machines. And cubes. It doesn't make any sense.",
				"sch": "就像一场梦，但又不是。一切都是白色的，还有这些机器。还有立方体。我搞不清这一切。",
				"modsch": "这里就像梦一样。目光所及之处是白色的 还有这些机器 和 一堆方块。让我无法理解。"
			},
			{
				"en": "I am not high or anything. I just realized how strange it is that I never noticed that this wasn't like anything I'd ever seen.",
				"sch": "我并没有嗑药或咋地。我只是突然意识到，从未注意到这些与我所见过的任何事物都不同，很奇怪。",
				"modsch": "我没有嗑药，我也没喝酒。我才突然意识到一件怪事，我从来没发觉到这一切其实都非常陌生。"
			},
			{
				"en": "Now I got red stones, and it is kinda creepy that I am totally fine with all this. Ok, just a red stone, everything is fine.",
				"sch": "现在我得到了红色宝石，我对这一切有点平静得吓人。好吧，只是一块红色的石头，一切都好。",
				"modsch": "现在我挖出来了红色的东西。我像是见怪不怪一样，冷静到连我都感到不对劲。呃好像除了红一点之外没什么危险性。"
			},
			{
				"en": "So you are not kidding...",
				"sch": "所以你不是在开玩笑…",
				"modsch": "所以你不是在开玩笑…"
			},
			{
				"en": "I see how it all sounds now. But yeah, it's all here before my eyes.",
				"sch": "我现在明白这一切听起来如何了。但是，额，对，这一切都在我眼前。",
				"modsch": "我明白你的心情了。但是 额 不管怎么说，事已至此。"
			},
			{
				"en": "Can I do anything for you?",
				"sch": "我可以为你做些什么？",
				"modsch": "我能不能帮的上忙？"
			},
			{
				"en": "Just talk to me, that's it.",
				"sch": "跟我说话，就这样。",
				"modsch": "跟我说说话 就行了。"
			},
			{
				"en": "Can do buddy, can do. Btw, cops are now looking for you. Like you went missing.",
				"sch": "OK兄弟，你别担心。对了，警察现在正在找你。你像失踪了一样。",
				"modsch": "OK兄弟，你别担心。对了，警察现在正在找你。别忘记你还是个失踪人口"
			},
			{
				"en": "Did you show them our texts?",
				"sch": "你给他们看了我们的聊天记录吗？",
				"modsch": "你有没有给他们看我们的聊天记录？"
			},
			{
				"en": "How would that help? No, I turned on auto-delete.",
				"sch": "有用吗？没，何况我开启了自动删除。",
				"modsch": "给他们看也没用吧？没有，何况我开启了自动删除功能。"
			},
			{
				"en": "Thanks!",
				"sch": "谢谢！",
				"modsch": "谢谢你！"
			},
			{
				"en": "How's it going over there?",
				"sch": "那边情况如何？",
				"modsch": "那边情况怎么样了？"
			},
			{
				"en": "Well, It turns out I can move around by using WASD. But there is nothing interesting around except this strange rock up North.",
				"sch": "嗯，事实证明我可以使用 WASD 来移动。但除了北方这块奇怪的岩石之外，周围没有什么有趣的东西。",
				"modsch": "也就那样啊，事实上我可以使用 WASD 来移动。周围没什么新奇的东西，除了北边那个奇怪的石头。"
			},
			{
				"en": "So your phone's compass works there!",
				"sch": "所以你的手机指南针在那里可以运作！",
				"modsch": "所以你手机的指南针在那边能用！"
			},
			{
				"en": "Well, it is just \"up\" from here, so I guess that's North.",
				"sch": "嗯，从这里看就是「上」的方向，所以我猜那是北方。",
				"modsch": "其实，我的意思是从这往那边看是上边，那我默认就是上北下南了"
			},
			{
				"en": "Makes sense",
				"sch": "合理",
				"modsch": "合理"
			},
			{
				"en": "And the thing is I don't have a phone...",
				"sch": "而且问题是我没有手机…",
				"modsch": "而且问题是我没有手机…"
			},
			{
				"en": "So how are you texting me?",
				"sch": "那你是怎么给我发短信的？",
				"modsch": "那你是怎么给我发短信的？"
			},
			{
				"en": "I don't know!! I just know when you message me. And I can respond to you! It is not easy to explain.",
				"sch": "我不知道！！你给我发消息时我才知道。而且我可以回覆你！我怎么跟你解释呢。",
				"modsch": "我不知道！！你给我发消息时我才知道。而且我可以回覆你！我怎么跟你解释呢。"
			},
			{
				"en": "Don't sweat it. We can talk and that's already good enough.",
				"sch": "别像那个了。我们能交谈已经谢天谢地了",
				"modsch": "别像那个了。我们能交谈已经谢天谢地了"
			},
			{
				"en": "Yes, you are right.",
				"sch": "对，太对了",
				"modsch": "对，太对了"
			},
			{
				"en": "So... Tell me about the machines",
				"sch": "那么……跟我说说那些机器吧",
				"modsch": "那么……跟我说说那些机器吧"
			},
			{
				"en": "What do you mean?",
				"sch": "说啥？",
				"modsch": "说啥？"
			},
			{
				"en": "What are they, what do they do, how do they work?",
				"sch": "它们是什么、做什么、如何运作？",
				"modsch": "它们是什么、做什么、如何运作？"
			},
			{
				"en": "Well, they look fancy, with some cables and wires and stuff",
				"sch": "嗯，它们看起来很漂亮，有一些电缆和电线之类的东西",
				"modsch": "嗯，它们很好看很精致，有一些电缆电线之类的结构"
			},
			{
				"en": "One, for example, looks like a big plastic box with a copper coil on the top, where a blue stone goes. And there is a big label saying \"E—01SR\" on the side, with a smaller label \"Caution! Strong entropy radiation\"",
				"sch": "例如，其中一个看起来像一个大塑胶盒子，顶部有一个铜线圈，里面放着一块蓝色的石头。而且侧面有一个大标签写着“E—01SR”，还有一个较小的标签“注意！强熵辐射”",
				"modsch": "例如，其中一个看起来像一个大塑胶盒子，顶部有一个铜线圈，里面放着一块紫色的石头。而且侧面有一个大标签写着“E—01SR”，还有一个较小的标签“注意！强熵辐射”"
			},
			{
				"en": "What does that mean?",
				"sch": "什么意思？",
				"modsch": "什么意思？"
			},
			{
				"en": "I don't know really. There is some entropy radiation there I guess.",
				"sch": "我不知道。我猜那里有一些熵辐射。",
				"modsch": "我不知道。我猜那里有一些熵辐射。"
			},
			{
				"en": "Wait, I thought you made these machines?",
				"sch": "等等，我以为这些机器是你制造的？",
				"modsch": "等等，我以为这些机器是你制造的？"
			},
			{
				"en": "Right... I see your point.",
				"sch": "行吧……我大概知道你为啥这样想了。",
				"modsch": "行吧……我大概知道你为啥这样想了。"
			},
			{
				"en": "I just make them from cubes somehow. But I don't know what's inside. Yeah, that does sound weird, let me think about this.",
				"sch": "我只是透过立方体以某种方式制作它们。但我不知道里面是什么。不是，这什么怪话，让我思考一下。",
				"modsch": "我只是透过矿方体以某种方式制作它们。但我不知道里面是什么。不是，这什么怪话，让我思考一下。"
			},
			{
				"en": "And btw it seems like yellow and blue stones are not infinite, so I should really invest in those converters or a new mine.",
				"sch": "顺带一提，黄色和蓝色的石头似乎不是无限的，所以我真的应该考虑那些转换器或一座新矿场。",
				"modsch": "顺带一提，黄色和紫色的石头似乎不是无限的，所以我真的应该考虑那些转换器或一座新矿场。"
			},
			{
				"en": "Sounds like a plan",
				"sch": "听起来很有计划",
				"modsch": "听起来很有计划"
			},
			{
				"en": "What a pain in the ass!",
				"sch": "真是头大！",
				"modsch": "真是头大！"
			},
			{
				"en": "Huh?",
				"sch": "啊？",
				"modsch": "啊？"
			},
			{
				"en": "A green stone! It takes ages to break it. I have to come up with something if they keep showing up.",
				"sch": "一块绿色的石头！要花很长时间才能打破它。如果它们继续出现，我得想法解决。",
				"modsch": "一块绿色的石头！要花很长时间才能打破它。如果它们继续出现，我得想法解决。"
			},
			{
				"en": "I'm sure you'll make some fancy machine for that!",
				"sch": "你肯定会为此制作一台精巧的机器！",
				"modsch": "你肯定会为此制作一台精巧的机器！"
			},
			{
				"en": "You bet!",
				"sch": "一包辣条！",
				"modsch": "一包辣条！"
			},
			{
				"en": "Hell yeah! Hell gems, watch out.",
				"sch": "那当然了！地狱宝石，可得小心。",
				"modsch": "那当然了！[绿]地心晶体，可得小心。"
			},
			{
				"en": "Give 'em hell!",
				"sch": "给他们好看！",
				"modsch": "给他们好看！"
			},
			{
				"en": "Remember you asked about the machines?",
				"sch": "记得你问过关于机器的事吗？",
				"modsch": "记得你问过关于机器的事吗？"
			},
			{
				"en": "Yeah",
				"sch": "嗯",
				"modsch": "嗯"
			},
			{
				"en": "I don't think they are real",
				"sch": "我不认为它们是真实的",
				"modsch": "我不认为它们是真实的"
			},
			{
				"en": "What's that supposed to mean?",
				"sch": "什么意思？",
				"modsch": "什么意思？"
			},
			{
				"en": "It's like in a dream. I can't look inside or even see them from the other side.",
				"sch": "就像在梦中一样。我无法看到里面，甚至无法从另一边看到它们。",
				"modsch": "就像在梦中一样。我无法看到里面，甚至无法从另一边看到它们。"
			},
			{
				"en": "A vague representation of unexplainable technology",
				"sch": "这是对无法解释的技术的模糊表述",
				"modsch": "这是对无法解释的技术的模糊表述"
			},
			{
				"en": "I think these machines look this way just because of how I perceive their function.",
				"sch": "我认为这些机器看起来像这样只是因为我如何看待它们的功能。",
				"modsch": "我认为这些机器看起来像这样只是因为我如何看待它们的功能。"
			},
			{
				"en": "Like if something chops down trees it should look like an axe?",
				"sch": "如果有东西可以砍倒树木，它应该看起来像一把斧头吗？",
				"modsch": "如果有东西可以砍倒树木，它就应该看起来像一把斧头吗？"
			},
			{
				"en": "Something like that",
				"sch": "类似的东西",
				"modsch": "类似的东西"
			},
			{
				"en": "Well, at least you sound pretty real to me",
				"sch": "好吧，至少你对我来说听起来很真实",
				"modsch": "好吧，至少你对我来说听起来很真实"
			},
			{
				"en": "Yeah, I suppose you are the only real thing for me right now",
				"sch": "是的，我想你现在对我来说是唯一真实的存在",
				"modsch": "是的，我想你现在对我来说是唯一真实的存在"
			},
			{
				"en": "I've got a bunch of new cubes, which are decaying to other cubes!",
				"sch": "我有一堆新的立方体，它们正在衰变成其他立方体！",
				"modsch": "我有一堆新的矿方体，它们正在衰变成其他矿方体！"
			},
			{
				"en": "Well, not great, not terrible",
				"sch": "嗯，不是很好，也不是很糟糕",
				"modsch": "嗯，不是很好，也不是很糟糕"
			},
			{
				"en": "I have to say something really weird",
				"sch": "我必须说一件非常奇怪的事",
				"modsch": "我必须说一件非常奇怪的事"
			},
			{
				"en": "Do you see the irony in what you just wrote?",
				"sch": "你看到你刚才写的内容言语间的讽刺吗？",
				"modsch": "你看到你刚才写的内容言语间的讽刺吗？"
			},
			{
				"en": "Maybe it's because of this strange place, but I forgot your name somehow",
				"sch": "或许是因为这个奇怪的地方，我不知怎么忘记了你的名字",
				"modsch": "或许是因为这个奇怪的地方，我不知怎么忘记了你的名字"
			},
			{
				"en": "Well, I suppose we could spend a little more time together then",
				"sch": "嗯，我想我们可以再多花点时间在一起",
				"modsch": "嗯，我想我们可以再多花点时间在一起"
			},
			{
				"en": "I'm serious",
				"sch": "认真的",
				"modsch": "认真的"
			},
			{
				"en": "My name is Duke Nukem, obviously.",
				"sch": "我的名字明显是毁灭公爵。",
				"modsch": "我的名字明显是毁灭公爵。"
			},
			{
				"en": "Dude, cut it out!",
				"sch": "什么玩应！",
				"modsch": "什么玩应！"
			},
			{
				"en": "That's what she said!",
				"sch": "她就是这么说的！",
				"modsch": "她就是这么说的！"
			},
			{
				"en": "This is stupid! Stop creeping me out. What's going on?",
				"sch": "太傻逼了！别再吓我了。到底发生了什么事？",
				"modsch": "太傻逼了！别再吓我了。到底发生了什么事？"
			},
			{
				"en": "Damn",
				"sch": "我靠",
				"modsch": "我靠"
			},
			{
				"en": "It looks like I can't remember my own name either",
				"sch": "看来我也不记得自己的名字了",
				"modsch": "看来我也不记得自己的名字了"
			},
			{
				"en": "I just can't! It is batshit crazy. And I can't remember your name!",
				"sch": "我就是做不到！这简直是疯了。而且我记不起你的名字！",
				"modsch": "我就是做不到！这简直是疯了。而且我记不起你的名字！"
			},
			{
				"en": "Maybe it's just a case of mass hysteria? I've heard it can affect multiple people at once. Let's just calm down and see what happens.",
				"sch": "或许这只是一种集体歇斯底里的情况？我听说它可以一次影响多人。我们就冷静下来，看看会发生什么。",
				"modsch": "或许这只是一种集体歇斯底里的情况？我听说它可以一次影响多人。我们就冷静下来，看看会发生什么。"
			},
			{
				"en": "Yeah, right, hysteria",
				"sch": "是的，对，歇斯底里",
				"modsch": "是的，对，歇斯底里"
			},
			{
				"en": "I still can't recall names",
				"sch": "我仍然想不起名字",
				"modsch": "我仍然想不起名字"
			},
			{
				"en": "Me neither. And there's more",
				"sch": "我也想不起。而且不止名字",
				"modsch": "我也想不起。而且不止名字"
			},
			{
				"en": "Yeah! What do I look like? When did we meet?",
				"sch": "对！我长什么样？我们什么时候认识的？",
				"modsch": "对！我长什么样？我们什么时候认识的？"
			},
			{
				"en": "What does my home look like, who are our friends? Did we meet at all?",
				"sch": "我的家什么样子，我们的朋友是谁？我们有见过面吗？",
				"modsch": "我的家什么样子，我们的朋友是谁？我们有见过面吗？"
			},
			{
				"en": "It looks like we are both stuck in the same shit. And I can't even tell if it always has been like that or something happened at some point. Is this some weird dream? And who's dreaming?",
				"sch": "看来我们都陷入了同样的困境。我甚至无法分辨这是一直以来的情况还是某个时间点发生了什么事。这是一场奇怪的梦吗？是谁在做梦？",
				"modsch": "看来我们都陷入了同样的困境。我甚至无法分辨这是一直以来的情况还是某个时间点发生了什么事。这是一场奇怪的梦吗？是谁在做梦？"
			},
			{
				"en": "Any machines nearby? Maybe a cube sprung out somewhere?",
				"sch": "附近有任何机器吗？可能有个立方体突然出现了？",
				"modsch": "附近有任何机器吗？可能有个矿方体突然出现了？"
			},
			{
				"en": "Funny",
				"sch": "笑死",
				"modsch": "笑死"
			},
			{
				"en": "Well, let's come up with some names for ourselves.",
				"sch": "好吧，让我们为自己想一些名字。",
				"modsch": "好吧，让我们为自己想一些名字。"
			},
			{
				"en": "You sound like Veen",
				"sch": "你听起来像维恩",
				"modsch": "你听起来像维恩"
			},
			{
				"en": "Why not",
				"sch": "善哉",
				"modsch": "善哉"
			},
			{
				"en": "Have nothing against Veen",
				"sch": "对维恩没有任何反对意见",
				"modsch": "对维恩没有任何反对意见"
			},
			{
				"en": "Hey, Veen. Would you like some beans, Veen? Yeah, sounds ok.",
				"sch": "嘿，维恩。维恩，你想要一些豆子吗？是的，听起来不错。",
				"modsch": "嘿，维恩。维恩，你想要一些豆子吗？是的，听起来不错。"
			},
			{
				"en": "And you will be Charps",
				"sch": "而你会成为夏普",
				"modsch": "而你会成为夏普"
			},
			{
				"en": "Do you have some sharp harps, Charps?",
				"sch": "夏普，你有肉脯吗？",
				"modsch": "夏普，你有肉脯吗？"
			},
			{
				"en": "That doesn't make sense!",
				"sch": "哪跟哪啊！",
				"modsch": "哪跟哪啊！"
			},
			{
				"en": "I like Charps. Nice to meet you, Veen",
				"sch": "我喜欢夏普。很高兴认识你，维恩",
				"modsch": "我喜欢夏普。很高兴认识你，维恩"
			},
			{
				"en": "Likewise, Charps",
				"sch": "我也一样，夏普",
				"modsch": "我也一样，夏普"
			},
			{
				"en": "WHAT IS GOING ON",
				"sch": "到底是怎么回事",
				"modsch": "到底是怎么回事"
			},
			{
				"en": "What?",
				"sch": "什么？",
				"modsch": "什么？"
			},
			{
				"en": "White cubes! They are destroying the green ones!",
				"sch": "白色立方体！他们正在摧毁绿色的！",
				"modsch": "新的白色矿石！他们正在和绿色的矿石发生湮灭！"
			},
			{
				"en": "There are tons of decaying cubes too! It's like in a nuclear reactor!",
				"sch": "还有大量衰变的立方体！就像在核反应炉里一样！",
				"modsch": "还有大量衰变的矿方体！就像在核反应炉里一样！"
			},
			{
				"en": "Holy shit, are you ok?",
				"sch": "我靠，你还好吗？",
				"modsch": "我靠，你还好吗？"
			},
			{
				"en": "Yeah, I'm fine! It's just a mess now. I have to build something to handle this. Maybe I should take another look at a rock in the north.",
				"sch": "嗯，我没事！现在只是乱七八糟。我得建造一些东西来处理这个。也许我应该再去北边看看那块石头。",
				"modsch": "嗯，我没事！现在只是乱七八糟。我得建造一些东西来处理这个。也许我应该再去北边看看那块石头。"
			},
			{
				"en": "That's what you always do, Charps!",
				"sch": "夏普，你总是这么做的！",
				"modsch": "夏普，你总是这么做的！"
			},
			{
				"en": "Sounds weird!",
				"sch": "什么怪话",
				"modsch": "什么怪话"
			},
			{
				"en": "I mean, my name does. I guess I'll get used to it at some point. Right, Veen?",
				"sch": "就是，我的名字确实如此。我想我会在某个时候习惯它。对吧，维恩？",
				"modsch": "就是，我的名字确实如此。我想我会在某个时候习惯它。对吧，维恩？"
			},
			{
				"en": "Yeah! Weird indeed.",
				"sch": "是的！确实很奇怪。",
				"modsch": "是的！确实很奇怪。"
			},
			{
				"en": "Remember I mentioned a strange rock up north?",
				"sch": "记得我提到北边有块奇怪的石头吗？",
				"modsch": "记得我提到北边有块奇怪的石头吗？"
			},
			{
				"en": "Not really, no",
				"sch": "不太记得",
				"modsch": "不太记得"
			},
			{
				"en": "Well, there's this rock. And don't get me wrong, I realize that everything here is strange. But this rock feels much more strange than anything else.",
				"sch": "就这里有一块石头。别误会，我知道这里的一切都很奇怪。但这块石头比其他任何事物都要来得更奇怪。",
				"modsch": "就这里有一块石头。别误会，我知道这里的一切都很奇怪。但这块石头比其他任何事物都要来得更奇怪。"
			},
			{
				"en": "I can't make any sense of it. But now when I decided to poke it a little, it changed something in the rules of the Universe itself!",
				"sch": "我完全无法理解它。但现在当我决定稍微触碰它一下时，它竟然改变了宇宙规则的本身！",
				"modsch": "我完全无法理解它。但现在当我决定稍微触碰它一下时，它竟然改变了宇宙规则的本身！"
			},
			{
				"en": "Is it dangerous?",
				"sch": "危险吗？",
				"modsch": "危险吗？"
			},
			{
				"en": "I don't know. The change is subtle.",
				"sch": "我不知道。这种变化很隐蔽。",
				"modsch": "我不知道。这种变化很隐蔽。"
			},
			{
				"en": "I wonder what else it can do.",
				"sch": "我想知道它还能做什么。",
				"modsch": "我想知道它还能做什么。"
			},
			{
				"en": "Alright, just don't destroy the Universe accidentally.",
				"sch": "好吧，只是不要意外地毁灭宇宙。",
				"modsch": "好吧，只是不要意外地毁灭宇宙。"
			},
			{
				"en": "I'll do my best.",
				"sch": "我尽量吧",
				"modsch": "我尽量吧"
			},
			{
				"en": "Well, THAT was the hardest rock of my life! But I think I know how to break it faster now.",
				"sch": "好吧，那是我一生中见过的最坚硬的岩石！但我想我现在知道如何更快地破坏它。",
				"modsch": "好吧，那是我一生中见过的最坚硬的岩石！但我想我现在知道如何更快地破坏它。"
			},
			{
				"en": "Got new stone?",
				"sch": "新石头？",
				"modsch": "新石头？"
			},
			{
				"en": "Yep, the weirdest so far",
				"sch": "是的，目前为止最奇怪的",
				"modsch": "是的，目前为止最奇怪的"
			},
			{
				"en": "Woah, maybe the effect on the Universe wasn't so subtle. Do you feel it?",
				"sch": "哇，也许对宇宙的影响并没有那么微妙。你感觉到了吗？",
				"modsch": "哇，也许对宇宙的影响并没有那么微妙。你感觉到了吗？"
			},
			{
				"en": "Feel what?",
				"sch": "感觉什么？",
				"modsch": "感觉什么？"
			},
			{
				"en": "Well, maybe it's just me.",
				"sch": "没事了，看来只有我感觉到。",
				"modsch": "没事了，看来只有我感觉到。"
			},
			{
				"en": "Have you, by any chance, seen a huge cube in front of your eyes right now?",
				"sch": "你现在有没有看到一个巨大的立方体出现在你的眼前？",
				"modsch": "你现在有没有看到一个巨大的矿方体出现在你的眼前？"
			},
			{
				"en": "Ehm, does a fridge count?",
				"sch": "呃，冰箱？",
				"modsch": "呃，冰箱？"
			},
			{
				"en": "Well, nevermind",
				"sch": "那没事了",
				"modsch": "那没事了"
			},
			{
				"en": "Wow, this new cube is pitch black. And it feels somewhat otherworldly.",
				"sch": "哇，这个新的立方体漆黑一片。而且好像有些独特。",
				"modsch": "哇，这个新的矿方体漆黑一片。而且好像有些独特。"
			},
			{
				"en": "More otherworldly than the previous one?",
				"sch": "比上一个更加独特？",
				"modsch": "比上一个更加独特？"
			},
			{
				"en": "It is different! It's freezing cold, but not in a harmful way. Like it lacks the concept of temperature and it doesn't interact with you. It is not made of matter, doesn't have color or anything familiar, if it makes sense to you.",
				"sch": "有分别的！ 虽然天气很冷，但并没有什么坏处。 就像它缺乏温度的概念一样，它也不会与你互动。 如果我可以这样说的话，它不是由物质构成的，没有颜色或任何熟悉的东西。",
				"modsch": "有分别的！ 虽然天气很冷，但并没有什么坏处。 就像它缺乏温度的概念一样，它也不会与你互动。 如果我可以这样说的话，它不是由物质构成的，没有颜色或任何熟悉的东西。"
			},
			{
				"en": "Frankly, it does not.",
				"sch": "坦白说，我不懂。",
				"modsch": "坦白说，我不懂。"
			},
			{
				"en": "I think I get it. I can use hollow stones to condense that black stuff out of thin air. It forms weirdly identical crystals, but without any properties. And that fixes anomalies in the Universe somehow.",
				"sch": "我想我明白了。我可以用空心石，凭空凝结那些黑色的东西。它形成了奇怪的完全相同的晶体，但没有任何特性。却会以某种方式修复宇宙中的异常现象。",
				"modsch": "我想我明白了。我可以用空心石，凭空凝结那些黑色的东西。它形成了奇怪的完全相同的晶体，但没有任何特性。却会以某种方式修复宇宙中的异常现象。"
			},
			{
				"en": "Sounds like an air filter",
				"sch": "听起来像是空气过滤器",
				"modsch": "听起来像是空气过滤器"
			},
			{
				"en": "Yes, exactly! It looks like I spoiled the air at some point somehow.",
				"sch": "对，就是这样！看起来我在某种程度上破坏了空气。",
				"modsch": "对，就是这样！看起来我在某种程度上破坏了空气。"
			},
			{
				"en": "You don't have to say it aloud",
				"sch": "给你喇叭你上台说去吧",
				"modsch": "给你喇叭你上台说去吧"
			},
			{
				"en": "I decided to dig up that strange rock. Maybe there is an answer to what is happening inside. I feel it may be not just messing with everything, but it may control everything somehow!",
				"sch": "我决定把那块奇怪的石头挖出来。也许里面发生的事情有答案。我觉得它可能不仅仅是扰乱一切，而且可能以某种方式控制一切！",
				"modsch": "我决定把那块奇怪的石头挖出来。也许里面发生的事情有答案。我觉得它可能不仅仅是扰乱一切，而且可能以某种方式控制一切！"
			},
			{
				"en": "Why do you think so?",
				"sch": "为什么这么认为？",
				"modsch": "为什么这么认为？"
			},
			{
				"en": "Would you believe me if I say I sense it?",
				"sch": "我说我感觉到了你信吗？",
				"modsch": "我说我感觉到了你信吗？"
			},
			{
				"en": "Sure! I think I would believe in anything right now. A rock controlling the Universe? Why the hell not!",
				"sch": "太信了！我想我现在会相信任何事。控制宇宙的岩石？为什么不相信呢！",
				"modsch": "太信了！我想我现在会相信任何事。控制宇宙的岩石？为什么不相信呢！"
			},
			{
				"en": "I think I'm getting a seizure!",
				"sch": "我觉得我要癫痫发作了！",
				"modsch": "我觉得我要癫痫发作了！"
			},
			{
				"en": "Please don't",
				"sch": "不好",
				"modsch": "不好"
			},
			{
				"en": "These machines are getting so obnoxiously loud and flickering. Maybe I should tweak something to fix it. Or tweak myself. Or both.",
				"sch": "这些机器变得如此刺耳和闪烁。也许我应该调整一些东西来修复它。或者调整我自己。或者两者兼顾。",
				"modsch": "这些机器变得如此刺耳和闪烁。也许我应该调整一些东西来修复它。或者调整我自己。或者两者兼顾。"
			},
			{
				"en": "Now we're talking!",
				"sch": "有趣",
				"modsch": "有趣"
			},
			{
				"en": "So, what did you tweak?",
				"sch": "那么，你调整了什么？",
				"modsch": "那么，你调整了什么？"
			},
			{
				"en": "Wait, something is wrong.",
				"sch": "等等，好像有什么不对劲。",
				"modsch": "等等，好像有什么不对劲。"
			},
			{
				"en": "I built a thing out of the black stuff. And it isn't a machine. But it did something to the Waypoints.",
				"sch": "我用黑色的东西建造了一个东西。它不是一台机器。但它对航点做了一些事情。",
				"modsch": "我用黑色的东西建造了一个东西。它不是一台机器。但它对传送点做了一些事情。"
			},
			{
				"en": "What are waypoints?",
				"sch": "航点？",
				"modsch": "传送点？"
			},
			{
				"en": "They shift the Universe around you, that's how you get to different places.",
				"sch": "它们改变了你周围的宇宙，这就是你到达不同地方的方式。",
				"modsch": "它们改变了你周围的宇宙，这就是你到达不同地方的方式。"
			},
			{
				"en": "How do you know they shift the Universe and not you?",
				"sch": "你怎么知道他们改变了宇宙而不是你？",
				"modsch": "你怎么知道他们改变了宇宙而不是你？"
			},
			{
				"en": "Hmm, I didn't think about that",
				"sch": "你问的好啊！",
				"modsch": "你问的好啊！"
			},
			{
				"en": "I think I broke the Universe",
				"sch": "我想我打破了宇宙",
				"modsch": "我想我打破了宇宙"
			},
			{
				"en": "None of this makes sense!",
				"sch": "这一切都毫无意义！",
				"modsch": "这一切都毫无意义！"
			},
			{
				"en": "Machines aren't making sense, nothing is.",
				"sch": "机器没有意义，没有任何东西有意义。",
				"modsch": "机器没有意义，没有任何东西有意义。"
			},
			{
				"en": "I hope I can fix this",
				"sch": "我希望我可以解决这个问题",
				"modsch": "我希望我可以解决这个问题"
			},
			{
				"en": "Veen?",
				"sch": "维恩？",
				"modsch": "维恩？"
			},
			{
				"en": "Dude, are you there?",
				"sch": "兄弟，你在吗？",
				"modsch": "兄弟，你在吗？"
			},
			{
				"en": "Please please please not that! I hope you just went to take a leak or something.",
				"sch": "我靠别，你找点事干吧",
				"modsch": "我靠别，你找点事干吧"
			},
			{
				"en": "VEEN!",
				"sch": "维恩！",
				"modsch": "维恩！"
			},
			{
				"en": "WHAT?",
				"sch": "啊？",
				"modsch": "啊？"
			},
			{
				"en": "Still weird though.",
				"sch": "不过还是很奇怪。",
				"modsch": "不过还是很奇怪。"
			},
			{
				"en": "Oh thank god!",
				"sch": "谢天谢地",
				"modsch": "谢天谢地"
			},
			{
				"en": "Did you build something new?",
				"sch": "你建造了新东西吗？",
				"modsch": "你建造了新东西吗？"
			},
			{
				"en": "I thought I broke the Universe and you were gone forever! I was in some netherworld with some symbols around and thought these were the ruins of the Universe. But it is another Universe or a different version of this one, because they resemble each other, and they are connected now.",
				"sch": "我以为我打破了宇宙，你就永远消失了！我身处某个幽冥世界，周围有一些符号，我以为这些是宇宙的废墟。但这是另一个宇宙或这个宇宙的不同版本，因为它们彼此相似，而且它们现在是相连的。",
				"modsch": "我以为我打破了宇宙，你就永远消失了！我身处某个幽冥世界，周围有一些符号，我以为这些是宇宙的废墟。但这是另一个宇宙或这个宇宙的不同版本，因为它们彼此相似，而且它们现在是相连的。"
			},
			{
				"en": "Exploring, eh? Sounds fun!",
				"sch": "探险？好主意",
				"modsch": "探险？好主意"
			},
			{
				"en": "Fun? Did you even read my text? ANOTHER UNIVERSE!!!",
				"sch": "好你个头！睁开眼睛好好看看！另一个宇宙！！！",
				"modsch": "好你个头！睁开眼睛好好看看！另一个宇宙！！！"
			},
			{
				"en": "You have to accept that you are running out of the capacity to surprise me.",
				"sch": "你必须承认你已经没有能力给我带来惊喜了。",
				"modsch": "你必须承认你已经没有能力给我带来惊喜了。"
			},
			{
				"en": "Fair enough",
				"sch": "彳亍",
				"modsch": "彳亍"
			},
			{
				"en": "It's not a rock, it's a lens",
				"sch": "这不是石头，这是一个镜片",
				"modsch": "这不是石头，这是一个镜片"
			},
			{
				"en": "It can make everything converge into a single point. And I mean everything! Space, time, all the concepts and rules. Everything!",
				"sch": "它可以使一切汇聚成一点。我的意思是一切！空间，时间，所有的概念和规则。一切！",
				"modsch": "它可以使一切汇聚成一点。我的意思是一切！空间，时间，所有的概念和规则。一切！"
			},
			{
				"en": "Did you find the manual or something?",
				"sch": "你找到说明书之类的东西了吗？",
				"modsch": "你找到说明书之类的东西了吗？"
			},
			{
				"en": "I don't know why it's there and why we're here. I just somehow know what it does now.",
				"sch": "我不知道它为什么在那里，也不知道我们为什么在这里。我只是以某种方式知道它现在做了什么。",
				"modsch": "我不知道它为什么在那里，也不知道我们为什么在这里。我只是以某种方式知道它现在做了什么。"
			},
			{
				"en": "So... Are you going to converge everything or what?",
				"sch": "那么……你打算把所有东西都整合起来吗？",
				"modsch": "那么……你打算把所有东西都整合起来吗？"
			},
			{
				"en": "I don't know how. But maybe it's the point of this place. Now it just floats up in the air as if that's what it's supposed to do.",
				"sch": "我不知道怎么做。但或许这就是这个地方的意义。现在它就这样漂浮在空中，就好像这是它应该做的事。",
				"modsch": "我不知道怎么做。但或许这就是这个地方的意义。现在它就这样漂浮在空中，就好像这是它应该做的事。"
			},
			{
				"en": "And what happens next?",
				"sch": "然后会发生什么事？",
				"modsch": "然后会发生什么事？"
			},
			{
				"en": "No idea",
				"sch": "不知道",
				"modsch": "不知道"
			},
			{
				"en": "The more I think about it, the more I understand it's not just your machines that are not real.",
				"sch": "想得越多，就越明白不只是你的机器不是真实的。",
				"modsch": "想得越多，就越明白不只是你的机器不是真实的。"
			},
			{
				"en": "I try to ask myself specific questions and I don't have answers.",
				"sch": "我尝试问自己一些具体问题，但我没有答案。",
				"modsch": "我尝试问自己一些具体问题，但我没有答案。"
			},
			{
				"en": "Remember I mentioned that cops were searching for you? I wasn't messing with you. But now everything falls apart when I ask myself questions.",
				"sch": "记得我提到警察在找你吗？我没有跟你开玩笑。但现在当我问自己问题时，一切都崩溃了。",
				"modsch": "记得我提到警察在找你吗？我没有跟你开玩笑。但现在当我问自己问题时，一切都崩溃了。"
			},
			{
				"en": "Did I come to this police station or did I call them? And who was there? Cops? Where is that police station in the city? What is this city? Do I live in this city? What's the name of the city? And what state is it? Or are there any states at all?",
				"sch": "我是到了警察局还是打电话给他们了？谁在那里？警察？那个警察局在城里哪里？这座城市是什么？我住在这个城市吗？城市叫什么名字？在哪个国家？或有任何国家吗？",
				"modsch": "我是到了警察局还是打电话给他们了？谁在那里？警察？那个警察局在城里哪里？这座城市是什么？我住在这个城市吗？城市叫什么名字？在哪个国家？或有任何国家吗？"
			},
			{
				"en": "I can't answer a single question. Everything seemed normal until I started asking questions. I am afraid to ask more.",
				"sch": "我无法回答任何问题。一切看似正常，直到我开始提问。我害怕再问更多。",
				"modsch": "我无法回答任何问题。一切看似正常，直到我开始提问。我害怕再问更多。"
			},
			{
				"en": "Sorry about that",
				"sch": "对不起",
				"modsch": "对不起"
			},
			{
				"en": "No, it's not your fault at all. We are in the same boat as far as I can see.",
				"sch": "不，这完全不是你的错。就我所见，我们处于同样的境地。",
				"modsch": "不，这完全不是你的错。就我所见，我们处于同样的境地。"
			},
			{
				"en": "I just hope you'll find out what this boat is.",
				"sch": "我只希望你能找出这一堆是什么。",
				"modsch": "我只希望你能找出这一堆是什么。"
			},
			{
				"en": "Yeah, me too!",
				"sch": "是啊",
				"modsch": "是啊"
			},
			{
				"en": "Let's see how it ends. I just hope this is not some kind of eternal hell or limbo.",
				"sch": "让我们看看这是如何结束的。我只希望这不是某种永恒的地狱或是地狱边界。",
				"modsch": "让我们看看这是如何结束的。我只希望这不是某种永恒的地心或是地心边界。"
			},
			{
				"en": "Show'em, Dante!",
				"sch": "展示给他们看，但丁！",
				"modsch": "展示给他们看，但丁！"
			},
			{
				"en": "Now we're talking. These guys should drain this Universe dry!",
				"sch": "开干吧。这些家伙应该要把这个宇宙吸干！",
				"modsch": "开干吧。这些家伙应该要把这个宇宙吸干！"
			},
			{
				"en": "You sound like an oil company",
				"sch": "听起来像一家石油公司",
				"modsch": "听起来像一家石油公司"
			},
			{
				"en": "I am tired of tweaking everything to be a little more efficient and I am tired of the noise. This machine should change everything. It's even ripping through the other side.",
				"sch": "我厌倦了调整一切以提高那一丁点效率，也厌倦了噪音。这台机器应该会改变一切。甚至还撕裂了另一边。",
				"modsch": "我厌倦了调整一切以提高那一丁点效率，也厌倦了噪音。这台机器应该会改变一切。甚至还撕裂了另一边。"
			},
			{
				"en": "Isn't it dangerous?",
				"sch": "不危险吗？",
				"modsch": "不危险吗？"
			},
			{
				"en": "The concept of danger here is quite blurry.",
				"sch": "危险的概念在这里相当模糊。",
				"modsch": "危险的概念在这里相当模糊。"
			},
			{
				"en": "I think it's time to make something big.",
				"sch": "我想是时候做点大事了。",
				"modsch": "我想是时候做点大事了。"
			},
			{
				"en": "What's on your mind?",
				"sch": "你在想什么？",
				"modsch": "你在想什么？"
			},
			{
				"en": "I am not sure. But it should be big!",
				"sch": "我不确定。但应该很大的事情！",
				"modsch": "我不确定。但应该很大的事情！"
			},
			{
				"en": "Like a huge machine?",
				"sch": "就像一台巨大的机器？",
				"modsch": "就像一台巨大的机器？"
			},
			{
				"en": "No, I am speaking metaphorically",
				"sch": "不，我只是在打比喻",
				"modsch": "不，我只是在打比喻"
			},
			{
				"en": "Do it then!",
				"sch": "那就去做吧!",
				"modsch": "那就去做吧!"
			},
			{
				"en": "Oh fuck",
				"sch": "卧槽",
				"modsch": "卧槽"
			},
			{
				"en": "I did something wrong. The inverse chasm is destroyed. Everything's collapsing.",
				"sch": "我做错事了。逆裂缝被破坏。一切都在崩溃。",
				"modsch": "我做错事了。逆裂缝被破坏。一切都在崩溃。"
			},
			{
				"en": "Are you okay?",
				"sch": "你还好吗？",
				"modsch": "你还好吗？"
			},
			{
				"en": "Yes, but the machines are being destroyed! I can't build anything! Fuck!",
				"sch": "是的，但是机器正在被摧毁！我无法建造任何东西！该死的！",
				"modsch": "我还好，但是所有机器正在被一个个摧毁！我没办法建造任何东西！卧槽！"
			},
			{
				"en": "Wait! Maybe that's supposed to happen?",
				"sch": "也许这注定会发生？",
				"modsch": "也许这注定会发生？"
			},
			{
				"en": "NO! It is not!",
				"sch": "你胡扯！",
				"modsch": "不可能！"
			},
			{
				"en": "How do you know that?",
				"sch": "你怎么知道？",
				"modsch": "你怎么知道？"
			},
			{
				"en": "Hold on, I have to fix this somehow",
				"sch": "不对，我得想办法解决这个问题",
				"modsch": "不对，我得想办法解决这个问题"
			},
			{
				"en": "Here goes nothing!",
				"sch": "这里什么都没有！",
				"modsch": "这里什么都没有！"
			},
			{
				"en": "I see you! You just walked past a huge chestnut tree, on that funny planet in an upper galaxy arm right there.",
				"sch": "我看见你了！你刚走过一棵巨大的栗树，就在银河系上臂那个有趣的星球上。",
				"modsch": "我看见你了！你刚走过一棵巨大的栗树，就在银河系上边那个美丽的星球上。"
			},
			{
				"en": "No I did not! What galaxy?",
				"sch": "不，我没有！什么银河系？",
				"modsch": "不，我没走过...！什么银河系？"
			},
			{
				"en": "Oh, it's hard to tell the exact time, it hasn't happened yet probably. But just wait for 15 billion years!",
				"sch": "具体时间很难说，可能还没发生。但请等150亿年！",
				"modsch": "具体时间很难说，可能还没发生。请等150亿年！"
			},
			{
				"en": "You are making so much sense right now. Are you coming over btw?",
				"sch": "你现在说得很有道理。顺便说一句，你要过来吗？",
				"modsch": "你现在说得很有道理。顺便说一句，你要过来吗？"
			},
			{
				"en": "Definitely! I'll be there in a few hours, just need to finish up some stuff.",
				"sch": "当然！我几小时后会来到，只需先完成这个。",
				"modsch": "当然！我几小时后会来到，只需先完成这个。"
			},
			{
				"en": "Alright, see you then!",
				"sch": "好吧，到时候见！",
				"modsch": "好吧，到时候见！"
			},
			{
				"en": "But please, Charps",
				"sch": "但是，拜托，夏普",
				"modsch": "但是，拜托，夏普"
			},
			{
				"en": "Don't be late this time",
				"sch": "这次别迟到了",
				"modsch": "这次别迟到了"
			},
			{
				"en": "I won't, Veen, I won't!",
				"sch": "我不会，维恩，我不会！",
				"modsch": "我不会，维恩，我不会！"
			}
		],
		"credits": [
			{
				"en": "The beginning",
				"sch": "开端",
				"modsch": "开端："
			},
			{
				"en": "I really appreciate you made it to the very end, where everything starts",
				"sch": "我真的很感谢你坚持到了最后，一切都从这里开始",
				"modsch": "我真的很感谢你坚持到了最后，一切都从这里开始"
			},
			{
				"en": "Congratulations, I guess!",
				"sch": "我想，恭喜你！",
				"modsch": "我想，恭喜你！"
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
				"modsch": "[灰]卡戎碳:"
			},
			{
				"en": "Elmerines:",
				"sch": "埃尔梅林:",
				"modsch": "[黄]稀土:"
			},
			{
				"en": "Qanetites:",
				"sch": "卡内特石:",
				"modsch": "[紫]硅晶:"
			},
			{
				"en": "Beta-Pylenes:",
				"sch": "贝塔派伦:",
				"modsch": "[红]高能聚合物:"
			},
			{
				"en": "Hell Gems:",
				"sch": "地狱宝石:",
				"modsch": "[绿]地心晶体:"
			},
			{
				"en": "Chromalits:",
				"sch": "铬马利特:",
				"modsch": "[青]核能气体:"
			},
			{
				"en": "Celestial foam:",
				"sch": "天体泡沫:",
				"modsch": "[白]量子泡沫:"
			},
			{
				"en": "Hollow stones:",
				"sch": "空心石:",
				"modsch": "空心石:"
			},
			{
				"en": "Voids:",
				"sch": "虚空石:",
				"modsch": "虚空:"
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
				"modsch": "摧毁机器数量："
			},
			{
				"en": "Maximum channel depth in meters:",
				"sch": "最大通道深度（米）：",
				"modsch": "最大矿井深度（米）："
			},
			{
				"en": "Strange rock poked:",
				"sch": "奇怪的岩石的开采数量：",
				"modsch": "奇怪的岩石的开采数量："
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
				"modsch": "游戏创作者：<br>Oleg Danilov"
			},
			{
				"en": "Additional graphics:<br>Yulia Nogteva",
				"sch": "附加图形：<br>Yulia Nogteva",
				"modsch": "附加图形：<br>Yulia Nogteva"
			},
			{
				"en": "Dialogue editing:<br>Abdurahman Zulumhanov and Anna Peterson",
				"sch": "对话编辑：<br>Abdurahman Zulumhanov 和 Anna Peterson",
				"modsch": "对话编辑：<br>Abdurahman Zulumhanov 和 Anna Peterson"
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
				"modsch": "Deutsch: flex 4711, Patrick Karban"
			},
			{
				"en": "Português: selfemcrowdin, Mateus Iamarino",
				"sch": "Português: selfemcrowdin, Mateus Iamarino",
				"modsch": "Português: selfemcrowdin, Mateus Iamarino"
			},
			{
				"en": "Italiano: doralum",
				"sch": "Italiano: doralum",
				"modsch": "Italiano: doralum"
			},
			{
				"en": "Español: armangar, Syunay Kamenov",
				"sch": "Español: armangar, Syunay Kamenov",
				"modsch": "Español: armangar, Syunay Kamenov"
			},
			{
				"en": "Français: KjetilVion, Etienne Samson, William (Ekitchi)",
				"sch": "Français: KjetilVion, Etienne Samson, William (Ekitchi)",
				"modsch": "Français: KjetilVion, Etienne Samson, William (Ekitchi)"
			},
			{
				"en": "Nederlands: lievevandyck",
				"sch": "Nederlands: lievevandyck",
				"modsch": "Nederlands: lievevandyck"
			},
			{
				"en": "Čeština: Jakub Strelinger, Kryštof Kubík",
				"sch": "Čeština: Jakub Strelinger, Kryštof Kubík",
				"modsch": "Čeština: Jakub Strelinger, Kryštof Kubík"
			},
			{
				"en": "Polski: PolglishPL",
				"sch": "Polski: PolglishPL",
				"modsch": "Polski: PolglishPL"
			},
			{
				"en": "日本語: Winna Tolentino",
				"sch": "日本語: Winna Tolentino",
				"modsch": "日本語: Winna Tolentino"
			},
			{
				"en": "한국어: Ah Lon Sin, Sumin Park, Cyberowl",
				"sch": "한국어: Ah Lon Sin, Sumin Park, Cyberowl",
				"modsch": "한국어: Ah Lon Sin, Sumin Park, Cyberowl"
			},
			{
				"en": "简体中文：Daisy Chan, kevinlee7, YuLun",
				"sch": "简体中文：Daisy Chan, kevinlee7, YuLun",
				"modsch": "简体中文：Daisy Chan, kevinlee7, YuLun"
			},
			{
				"en": "繁體中文: Daisy Chan, kevinlee7",
				"sch": "繁體中文: Daisy Chan, kevinlee7",
				"modsch": "简体中文汉化优化：空灵灵"
			},
			{
				"en": "ไทย: They say P, Phimze Pym",
				"sch": "ไทย: They say P, Phimze Pym",
				"modsch": "繁體中文: Daisy Chan, kevinlee7"
			},
			{
				"en": "Magyar: Simon Dániel és Márton-Mezey Csenge",
				"sch": "Magyar: Simon Dániel és Márton-Mezey Csenge",
				"modsch": "ไทย: They say P, Phimze Pym"
			},
			{
				"en": "Latviešu valoda: Roberts Artūrs Bumburs (Arburo)",
				"sch": "Latviešu valoda: Roberts Artūrs Bumburs (Arburo)",
				"modsch": "Magyar: Simon Dániel és Márton-Mezey Csenge"
			},
			{
				"en": "Română: Eric Apetrei",
				"sch": "Română: Eric Apetrei",
				"modsch": "Latviešu valoda: Roberts Artūrs Bumburs (Arburo)"
			},
			{
				"en": "Norsk: Justina1131",
				"sch": "Norsk: Justina1131",
				"modsch": "Română: Eric Apetrei"
			},
			{
				"en": null,
				"sch": null,
				"modsch": "Norsk: Justina1131"
			}
		],
		"explainer": [
			{
				"en": "Press and hold.",
				"sch": "按住不放。",
				"modsch": "按住不放。"
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
				"modsch": "在机器上按 <span class=\"keyboard\">Q</span> 复制并在别处再建造一台。"
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
				"modsch": "储存码已复制到剪贴簿。现在请将它粘贴到安全的地方。"
			},
			"toolate": {
				"en": "It is too late to save anything. Everything has already happened.",
				"sch": "想要挽救任何事情都为时已晚。一切都已经发生了。",
				"modsch": "想要挽救任何事情都为时已晚。一切都已经发生了。"
			},
			"existed": {
				"en": "NEW",
				"sch": "新建",
				"modsch": "新建筑"
			},
			"steamWarning": {
				"en": "Steam error. Autosave and achievements will not work. Try relaunching the game.",
				"sch": "Steam发生错误。自动储存和成就将无法使用。尝试重新启动游戏。",
				"modsch": "Steam发生错误。自动储存和成就将无法使用。尝试重新启动游戏。"
			},
			"currentSurge": {
				"en": "Current surge",
				"sch": "电流浪涌",
				"modsch": "浪涌效果"
			},
			"surge0": {
				"en": "Boosts a random channel for a short time.",
				"sch": "短时间提升一个随机频道。",
				"modsch": "在短时间提升随机一个矿井。"
			},
			"surge1": {
				"en": "Attempts to refill a random machine.",
				"sch": "尝试重新填充随机机器。",
				"modsch": "满充能随机一个机器。"
			},
			"surge2": {
				"en": "Damages a random cube.",
				"sch": "损坏一个随机立方体。",
				"modsch": "直接摧毁随机一个矿方体。"
			},
			"surge3": {
				"en": "Harvests Beta-Pylene from a random cube, leaving behind Charonite and trace amount of other resources. Damages the cube.",
				"sch": "从一个随机立方体中收获贝塔派伦，留下查伦石和少量其他资源。损坏立方体。",
				"modsch": "从随机一个矿方体中获得[红]高能聚合物，留下[灰]卡戎碳和少量其他资源，并损坏矿方体。"
			},
			"surge4": {
				"en": "Boosts a random converter.",
				"sch": "增强一个随机转换器。",
				"modsch": "加强随机一个物质转换类机器。"
			},
			"surge5": {
				"en": "Spawns a surge. Only one Chromalit surge can be stabilized at a time.",
				"sch": "产生一股浪涌。每次只能稳定一股铬马利特涌浪。",
				"modsch": "产生随机一股浪涌。每次只能稳定一股[青]核能气体浪涌。"
			},
			"surge6": {
				"en": "Instantly annihilates one Hell Gem using one unit of Celestial Foam.",
				"sch": "使用一单位天体泡沫立即消灭一颗地狱宝石。",
				"modsch": "使用一个[白]量子泡沫立即消灭一颗[绿]地心晶体。"
			},
			"surge7": {
				"en": "Spawns a Hollow Stone.",
				"sch": "生成一块空心石。",
				"modsch": "生成一块空心石。"
			},
			"surge8": {
				"en": "Recharges one second-grade stabilizer, but depletes shortly afterward. Not tested against Reality Surge.",
				"sch": "为一个二级稳定器充电，但很快耗尽。未经现实浪涌测试。",
				"modsch": "为一个二级能量稳定器充电，但能量会很快耗尽。未经现实浪涌测试。"
			},
			"surge9": {
				"en": "Partially recharges all symbols.",
				"sch": "部分补充所有符号。",
				"modsch": "部分补充所有符号。"
			}
		}
	}
})(globalThis)
