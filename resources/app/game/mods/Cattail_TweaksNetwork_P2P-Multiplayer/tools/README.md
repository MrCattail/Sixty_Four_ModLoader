# Desktop 1.3 tools

## 当前33A：原生普通泵选点91自动及101玩家均通过（2026-10-28）

12个新工具位于tools/native-build-1.3/，专项tests/verify-native-build-1.3.cjs；根C:/tmp/sixtyfour-p2p-native-build13-20261028。按17路径实施，4文档先备份/441保护/4230旧引用/原依赖冻结，复制已验收449且仅9私有位置覆盖＋1输入模块，实际450。正式Mod0.2.1/协议2/Loader0.5.0及原版/API/服务/其他Mod源码、真实存档/配置/启用列表/Steam/Cloud与全部dirty保持，无版本/Git/依赖安装/包/推送/部署/发布。

| 能力 | 实现与边界 |
| --- | --- |
| 原生输入 | Host和三Guest从原生桌面商店选择普通pump，在地图任意合法空格单击；本地预览不登记世界，移除固定建造按钮，其他卡片/擦除/搬移/EQ受限 |
| 同一裁决 | Host本地固定身份与绑定Guest共用校验/扣费/单笔/幂等账本；Host不占ACK名额，每笔仍三Guest确认；不排队/预测/自动重试 |
| 一笔与取消 | 每次提交清除选择；右键/Esc/菜单/失焦/过期预览取消，拖动/无选择/菜单点击不误建，镜头/菜单/Ctrl+M本地独立 |
| 四人终点 | 合成资源32768，Host/G1/G2/G3各一次2048/4096/8192/16384，四端24→28座/8类/余额2048，ID25–28/revision2–5/统计1–4；第五次原生卡片资源不足不可选 |
| 冻结与失败 | 原24座对象/ID/字段与原生关系图保留；生产仍冻结。Host/Guest应用异常或未全ACK如实记录/隐藏问题世界/整组结束，不称回滚；任意Quit/重载/关闭/父IPC结束整组 |
| 隔离与报告 | 25B preload/DB保护主体原字节继承；新native-build-session.json统一轮询/finally，机器PENDING与人工结论分存；manual无总时限，操作失败10秒时限仍有效 |
| 自动结果 | 57纯＋2复制Loader合同＋251–282三十二真实四端＝91 AUTO_PASS，17输入READY/896覆盖引用；各组code0/零强退残留异常/服务释放/outbound0；101四人原生选点至28座8类/2048、第五次不可选及正常Quit玩家已通过，独立人工PASS绑定29原件 |

实现目录：native-build-input.js只管理商店/预览/真实鼠标和本地取消，只有请求回调；snapshot-world.js持有一次绑定的受限构造/图审计，build-command.js管理四actor/64预算/Host单笔裁决，room-wire.js负责绑定/广播/三Guest ACK，native-build.cjs负责复制/保护/控制器/统一报告/封门。没有恢复原生processUp或requestResources。

新005（镜头测试基准错误）及154/210（初始商店类别移动导致脚本误点）仍FAIL/原件保留，测试改为逐窗基准和稳定真实命中，未因此解封世界；013–015及所有预备/中间结果不叠加91。原始verification-raw-auto-pass/coverage-audit保留，最终验证另指向补充实现审计的覆盖文件。

101已获用户明确通过：Host/G1/G2/G3原生选泵/实际地图各建一次，每笔三绑定ACK，四端28座8类/2048；第五次资源不足不可选，没有第五个网络请求或Host拒绝。右键/Esc取消、镜头/菜单/Ctrl+M独立、无选择点击/EQ受限及原生Quit四窗正常关闭由用户确认。四笔原生价格/位置/ID/修订和四端字段/原生图/共享摘要一致；四端code0/signal=null/零强退残留异常/服务8787释放/outbound0，现场自有进程与监听0。新reports/101/player-acceptance.json=PASS保存逐字反馈/完整历史/隔离与cleanup并绑定29原件；原native-build-session.json=CLOSED_PENDING_PLAYER_FEEDBACK/PENDING、91自动/READY和失败原件不改写。取消的人工确认与机器末次各1次选择/提交计数分别保存，不推写额外机器取消事件。本批已关闭，无需重开或重验。

新入口node tools/native-build-1.3/native-build.cjs（--prepare/--refresh/--seal/--run 101）；专项node tests/verify-native-build-1.3.cjs --live，最终批用NATIVE_BUILD_CASE_START=251。旧31A/29A已关闭，不重跑、不refresh旧门或重开；101已通过并正常关闭，不重复运行或复用该编号。所有输入变化会使新门失效；正式其他建筑工具/持续完整世界/独立续接/正式接入/公网Steam等仍另批。下一步问题34只读路线待选，推荐普通泵拆除退款/邻接清理/ID不复用、继续冻结生产，也可选扩展建造或最小持续生产状态；先给出精确方案再另批实施，不直接创建新工具/根或开窗。详见Codex-md/progress_p2pmod.md第49项，以下31A等为各旧批历史记录。

## 31A验收记录：受控建造79自动及101玩家均通过（2026-10-28）

新入口tools/build-command-1.3/共11工具，专项tests/verify-build-command-1.3.cjs；根C:/tmp/sixtyfour-p2p-build-command13-20261028。按已批准16路径实施，4文档先备份，429范围外/3094旧引用/依赖冻结；复制29A验收448，仅8私有位置替换并新增一个纯命令模块，实际449。正式Mod0.2.1/协议2/Loader0.5.0/API/服务/其他Mod保持，不读取真实存档或Steam/Cloud，不吸收当前工作区新Loader/配置/启用列表，既有dirty全部保留，无版本/Git/依赖安装/包/推送/部署/发布。

| 私有实验能力 | 当前实现与边界 |
| --- | --- |
| 初始世界 | 24座/8类冻结状态，初始2663字节，一次Host捕获/编码、三实际peer分别ACK；0/128/256和多块边界回归 |
| 首个操作 | Guest专用“申请建造泵”按钮，Host原生价格/身份/位置/资源校验并裁决，三绑定提交ACK；普通点击/E/Q仍无权改世界 |
| 三次建造 | 资源16384，三次2048/4096/8192后余2048，四端24→25→26→27/仍8类，ID25–27/revision2–4/建造统计1–3；第四次资源不足拒绝且世界不变 |
| 正确性 | 每Guest1–64请求ID/缓存原裁决、同ID改内容拒绝、重复不重扣；单笔等待3/3、不排队/不预测；保留旧原生对象/ID/冻结字段和最终关系图 |
| 失败与退出 | 未全ACK或部分应用如实记录，坏结果隐藏/不ACK并整组结束，不称回滚或业务成功；任意Quit/关闭/重载/父连接断开均结束整组 |
| 保护/报告 | 25B preload及DB保护主体原字节继承；同一个writeSession写轮询/finally的build-command-session.json，人工记录另存；手动无总时限，单笔10秒错误时限仍有效 |
| 验证 | 最终53纯＋2复制Loader合同＋151–174二十四真实四进程＝79 AUTO_PASS；16输入READY/657证据引用；101三次建造/第四次拒绝玩家已通过，独立人工PASS绑定16原件，正常退出/零残留/服务释放 |

原首轮059因报告二次转换遇iceServers字段变化而FAIL，坏提交拒绝及正常退出本身已生效；仅新controller修正并补重复转换回归，最终完整24组重验通过。059/001/011–026/首轮原件保持，不叠加最终79；旧29A/更早验收与报告均不刷新。新128/256快照13514/26901字节（2/4块），只是本机合成实验，不代表大存档/公网性能。

101已获玩家明确通过并归档：三次建造每笔3/3，四端27座/8类/资源2048，第四次资源不足且世界不变；镜头/菜单/Ctrl+M独立，普通点击/E/Q仍无权改世界，原生Quit四窗正常关闭无异常。逐笔三绑定回执/ID/修订/扣费和四端字段/原生图/摘要、四端code0/零强退残留异常/服务8787释放/outbound0、现场自有进程/监听0均复核通过。独立reports/101/player-acceptance.json=PASS保存逐字反馈及16原件SHA，原build-command-session.json=CLOSED_PENDING_PLAYER_FEEDBACK/PENDING和79自动/READY全保持；本批无需重复验收或重开窗口。

新控制器入口为node tools/build-command-1.3/build-command.cjs，支持--prepare、--refresh、--seal、--run 101四种独立调用；prepare仅允许空的新runtime，refresh仅新根/无活动控制器，manual强制READY。专项入口node tests/verify-build-command-1.3.cjs --live，每次完整矩阵须使用全新编号范围，不能覆盖已存在报告；当前101已通过并正常收尾，不重复使用编号、重开或重跑已通过验收。验证后任何运行/专项输入变化都使门失效，先保留旧结果并重新验证；文档更新独立于封门输入。

实现目录：build-command.js负责纯schema/Host仲裁/Guest幂等，snapshot-world.js持有一次绑定的受限原生能力/图审计/中文按钮，room-wire.js负责三peer身份/命令/回执与终止；main/fixtures/guard/preload/signaling/transport/codec/controller沿用隔离来源并仅在新私有工具适配。正式自由放置/原生商店建造、其他操作/生产、活动/完整永久/连续世界、独立续接/正式集成/公网NAT/TURN/Steam/Cloud均未实现/验收；本批已关闭；问题32待选下一只读方向，推荐先规划普通泵原生商店选择/地图选点及主客机共用裁决、继续冻结生产，也可先规划拆除退款或持续生产状态。先给出精确方案再批准实施，不直接改运行文件或开新窗口；详见Codex-md/progress_p2pmod.md第46项，后续规划继续按grill-me。

## 29A验收记录：8类/256边界54自动及101的24座玩家均通过（2026-10-28）

工具tools/state-coverage-1.3十文件、tests/verify-state-coverage-1.3.cjs；根C:/tmp/sixtyfour-p2p-state-coverage13-20261027。
15路径获29A批准（11新增＋4文档），4文档before备份/418保护/1998旧引用/现装依赖冻结；
只从27A验收448清单复制并覆盖8既有私有位置，仍448，不吸收新Loader/profile/state/真实配置或存档。
Mod0.2.1/协议2/Loader0.5.0与正式源/API/服务/其他Mod保持，全部范围外dirty保留，无Git/依赖安装/包/推送/部署/发布。

| 支持类型 | 冻结字段（另均含soul） |
| --- | --- |
| pump/pump2 | depth/spoolup；active/hold固定false |
| conductor | variant按完整布局重建 |
| silo/silo2 | fill/state0或2/dive/freeTimer，拒绝过渡态 |
| auxpump | fill/state，邻接重建 |
| consumer | fill/state、10资源缓存及resourceCount、timer/multiplicator，一致性校验 |
| preheater | fill/state，邻接/倍率/spriteState重建；不声称支持实际converter |

统一构造/最终init后审核真实占位、类型/计数/ID、pumps/conductors集合、auxes/邻接/导体variant和世界派生标记；
只读输入及直接consume/release/boost/pumpTo/accept等拒绝。失败隐藏画布/不ACK并结束整组，不声称回滚。
实体/netId≤256、坐标±64，正文≤65536字节、8192字节×最多8块；资源10项，未知字段/复杂引用/活动cube和永久进度排除。
新私有format/label；同PC原探针＋专用快照通道、真实peer与room/run/session/role/代次绑定、独立三ACK，正式协议2不改。

最终38纯＋2复制Loader合同＋051–064十四真实四进程＝54 AUTO_PASS，15输入READY与覆盖审计/35引用已封。
覆盖0/24/128/256及乱序24、六向4KiB/522263、两保存周期冻结/画面推进、慢ACK/错归属/新坏包、四窗面板/导航/偏好/写拒绝，
三原生Quit/重载/半包关房/父IPC。最终十四组四端code0、零强退残留异常、服务8787释放/outbound0。
纯样本0/24/64/128/256分别192/2644/6845/13495/26882字节，128与256实际2/4块；阶段耗时仅本机单轮观察。
world.auditMs为末次图审计（轮询可更新），applyMs包含应用审计/往返；不推为FPS/公网或任意大世界性能。
013的WIRE_FAILURE仍INCOMPLETE，正常四端退出证据保留；纯复现end后迟到错误路径，新增结束守卫但open错误仍失败。
013唯一事件根因未证实；021–024仪表化复验、031–044编号中间批及旧原件均保留，不叠加最终54。

**101玩家已通过：主机3/3，三Guest同24座/8类/填充外观，四窗镜头/菜单/Ctrl+M独立，点击/E/Q只读，Quit正常关闭四窗。**
三份Host ACK分别等于对应Guest回执，均2644字节/1块/同字段SHA与原生图及世界摘要，发送capture/frames各1次。
四端code0/零强退残留异常，服务及8787释放/outbound0，现场测试进程/监听均0；无main-failure或stderr。
新reports/101/player-acceptance.json=PASS独立存逐字反馈/回执/cleanup/现场审计/10原件摘要，不回写机器PENDING或54自动。
最终会话文件实际为four-current-room-session.json（CLOSED_PENDING_PLAYER_FEEDBACK）；轮询state-coverage-session.json保留末次AWAITING_PLAYER。
两个原件都保留，不重命名或refresh旧门；后继工具再统一报告名称。本批无需再开101或重复验收。
保留原DB/Storage/IPC/网络保护主体及25B精确菜单通道，未知保存/后台IPC仍拒绝，可选后台未加载。
本机8787/http+ws、空ICE/direct/cf:false/外部请求0；真实Steam/Cloud、公网/持续世界/单操作/独立续接均另批。

### 2026-10-28 实施时交接（玩家已通过，收尾见下）

- 已完成的事项：15路径/448副本交付，8类字段与关系校验，54自动/15输入READY及101实际四窗开放。
- 关键决策：只读合成世界/64KiB预算保持，原失败与中间批保留不叠加；正式源/API/版本/Git发布边界保持。
- 未完成的待办：101玩家操作/反馈和最终收尾/独立人工PASS，完整永久/持续世界、单操作/续接/公网Steam等独立。
- 即将进行的任务/规划：玩家Host发送一次并核对三Guest24座8类/独立控制/只读/原生Quit，反馈后核对并归档。

### 2026-10-28 玩家验收收尾

- 已完成的事项：101玩家24座/8类/填充/独立控制/只读/正常Quit通过，三ACK与最终收尾/现场资源释放核对完成，新独立玩家PASS已保存。
- 关键决策：仅关闭本批玩家门，10原件摘要/15输入/448/54自动及旧证据保持；记录最终/轮询双文件名，完整收尾已生成，旧原件和源码不改。
- 未完成的待办：后继工具报告命名统一、完整永久/活动世界、单操作/持续同步、独立续接/公网Steam等仍独立。
- 即将进行的任务/规划：问题30推荐A只读规划首个受控建造的请求/主机校验/四端应用，B继续扩展快照；路线未选，实施另批。

实现/自动测量见Codex-md/progress_p2pmod.md第42项；玩家收尾/双报告名称和问题30见第43项，下方为历史时点。

## 当前27A：一主三客快照37自动及101玩家均通过（2026-10-27）

新工具tools/four-current-room-1.3、tests/verify-four-current-room-1.3.cjs；独立根C:/tmp/sixtyfour-p2p-four-current-room13-20261027。
13路径（9新增/4文档）按27A交付，仅从已验收24A/25B的448程序逐项复制并覆盖6个私有位置，仍448。
4文档before备份、409范围外保护、1379旧程序/验收引用、63Loader与已装依赖摘要见baseline.json。
旧单客机33/101玩家及其他旧证据保持；不吸收新Loader，不复制profile/真实配置/state/缓存/存档。

四实例host/guest1/guest2/guest3各自合成身份/profile；Host3PC、各Guest1PC，同PC原探针＋新私有快照通道，
按真实信令peerId绑定；无客客连接。唯一世界manager＋逐peer会话，发送操作只capture/frames一次，三路共享
383字节规范正文/各自接收及ACK；room-ack外层同时核对room/run/session/Host/Guest/role/代次与承载通道，
只有三份有效回执才显示3/3。DTO/codec/正式Mod0.2.1/协议2/Loader0.5.0与服务源码保持。

最终25专项＋2适用Loader合同＋001–010十组真实四进程＝37 AUTO_PASS，13输入READY已封。
覆盖六方向4KiB探针/522263、三份同383字节/SHA/3建筑资源、≥20.5秒两保存周期冻结、
慢Guest1先2/3后3/3、Guest2错归属ACK拒绝不污染另外两路、定向坏包/重复拒绝、四窗导航/菜单/偏好/写拒绝、
Host/Guest1/Guest3原生Quit、Guest1重载、Guest2半包关房（另两Guest已应用但目标未应用）、父IPC整体断连。
十组均四端code0/signal=null/forced0/residual0/errors0、服务及8787释放/outbound0；预备25不叠加，
890/891为专项故意半启动mock拒绝/正常收尾，不是十个真实场景。相关结果在verification.json及各reports/001–010。

**101玩家已通过：主机3/3，三客机同3建筑，四窗镜头/菜单/Ctrl+M独立，点击/E/Q只读，Quit四窗正常关闭。**
三份Host ACK分别等于对应Guest接收回执，均383字节/同SHA与世界摘要，capture/encode各1次；
四端code0/signal=null、forced0/residual0/errors0，服务与8787已释放/outbound0，现场测试进程/监听均0。
新reports/101/player-acceptance.json=PASS独立记录玩家逐字反馈、回执/cleanup/现场复核及8份原件摘要；
原机器CLOSED_PENDING_PLAYER_FEEDBACK/PENDING、37自动与READY不改写，13输入/448/409保护/1379旧引用复核保持。
末次wire.open/signaling-ready为退出前观测。本批无需再开窗或重验；任一退出整组结束的边界保持，无单客续接。

25B精确菜单通道继承，早期guard仅适配四身份校验，原DB/Storage/IPC/网络白名单主体保持；
未知存储/保存后台IPC仍拒绝，可选后台未加载，物理进度0。搜索自动检查为DOM input，不证明放行其他键盘输入。
真实网络仅127.0.0.1:8787/http+ws、空ICE/host direct、TURN禁用、cf:false/外部请求0，新根状态缓存；
无真实profile/存档/Steam/Cloud或Git/版本/依赖安装/打包/推送/部署/发布。正式完整/持续世界及独立续接/公网另批。
当前实现/验证见Codex-md/progress_p2pmod.md第39项，玩家收尾与问题28见第40项；下方旧“当前/下一步”为历史。
### 2026-10-27 本轮交接

- 已完成的事项：27A/101四端玩家PASS及三ACK/正常退出/现场资源释放复核，独立人工记录已保存。
- 关键决策：本批玩家门关闭，原始PENDING/37自动/旧门保持，不重复开窗，正式运行/API/版本/Git发布边界保持。
- 未完成的待办：更多实体/状态体量、单操作与持续同步、续接、公网及Steam/Cloud均独立。
- 即将进行的任务/规划：问题28推荐A先只读规划快照状态/合成体量，B先只读规划单操作；路线未选，实施另批。

## 当前24A＋25B：448新基线33自动及101玩家均通过（2026-10-27）

新工具tools/current-room-1.3及tests/verify-current-room-1.3.cjs；独立根C:/tmp/sixtyfour-p2p-current-room13-20261027。
24A精确14路径（9新增/5文档）已交付：445旧程序加当前已跟踪63份Loader覆盖为448（17替换/3新增），
仅P2P、单Host/Guest、3建筑一次只读快照；正式Loader/API/其他Mod运行源及真实启用列表不改。
5文档写前备份、399范围外保护/63Loader来源/914旧程序证据引用及三项并行摘要差异见新baseline.json。
state/安装备份/日志/真实配置不带入；早期guard与20A原件逐字节相同，旧门/报告不refresh。

最终23专项＋2适用Loader合同＋021–028八真实场景＝33 AUTO_PASS，verification.json与13输入READY已封。
真实覆盖同PC双通道/双向4KiB探针、383字节快照SHA/ACK/3建筑、两保存周期冻结、坏包拒绝、
独立镜头菜单/世界只读/新面板偏好、两Quit/重载/半包关房/父IPC全组正常结束；八组均code0/forced0/residual0，
服务停止/8787释放/outbound0。部分011/012/014–018不叠加；prelive换行、001 ID误断言、013键盘失败原件保留。

25B明确批准仅新preload捕获Ctrl/Meta+M、非Alt/Shift，keydown非repeat调用Loader.togglePanel，keyup仅吞事件；
事件不传游戏，冻结snapshot-world与早期白名单不改。新专项及真实双端证明开关/长按不反复/其他组合仍阻断，
搜索与布局/隔离偏好成功，未知存储和保存后台IPC拒绝，Better UIs后台未加载，物理进度0。
搜索自动检查使用实际DOM input事件，不代表已放行其他被只读工具拦住的键盘输入/快捷键。

**101玩家已明确通过：Guest同3建筑，镜头、菜单和Ctrl+M互不影响，点击/E/Q只读，原生Quit两窗正常关闭，无异常。**
实际回执383字节/SHA/ACK与3建筑/资源一致、Guest完整应用，各1PC同PC双通道，Loader仅P2P/issue0，
guard errors0/物理进度及IDB行0；两端code0/signal=null、forced0/residual[]/processErrors[]，
serviceStopped/port8787Released=true、outbound0/controllerFailure=null；实时相关进程0/8787监听0、stderr空。
独立reports/101/player-acceptance.json=PASS绑定原会话/cleanup/33自动/门/运行及基线摘要；
原CLOSED_PENDING_PLAYER_FEEDBACK/PENDING、自动报告/READY/失败原件不覆写。末次wire.open是退出前观测，连接已随退出释放。
13门输入/448程序/399保护/63Loader/914旧引用本轮复核保持；无需重开窗口或重复已通过验收。

**下一步待26选择：A只读规划基于448新基线的1主3客快照；B只读规划更多单客机建筑/状态。**
推荐A，继续原四端目标，先列精确文件、逐peer状态/一次捕获/三份ACK与退出验证，再另批实施。
两项都只是规划，不启动新实验；旧23不恢复。
仍仅私有本机单客机新基线；1主3客快照需后续另批，旧23不生效。版本0.2.1/协议2/Loader0.5.0不变，
无依赖安装/Git/包/推送/部署/发布；正式完整持续世界、公网/跨NAT/Steam/Cloud未验收。
当前实现/证据/下一步见Codex-md/progress_p2pmod.md第36–37项；下方各“当前/下一步”为历史时点，以本节为准。
## 当前1.3房间快照实验：20A自动27项及room-snapshot13/101玩家均通过（2026-10-27）

新工具tools/room-snapshot-1.3；新根C:/tmp/sixtyfour-p2p-room-snapshot13-20261027。
已通过snapshot13/101的444程序，只覆盖4测试入口和新副本内transport，再增加room-wire，共445。
正式P2P脚本/协议2/0.2.1、Loader0.5.0、原版、启用清单及旧工具/根保持；389保护源与继承证据已核对。

原createRoom/joinRoom与本地Worker/WS信令建连，同一PC保留探针通道并增加快照专用通道；
快照绑定runId/房间/peer/角色/代次，握手及本机direct、双方就绪后才发，正文仅DataChannel。
最终19专项＋031–038八真实场景＝27自动通过，见verification.json及live-final-031.log：
4KiB双向522263收/发/ACK、383字节/SHA/ACK/3原生建筑资源一致、两周期冻结且渲染推进，
坏包/绑定/输入拒绝、独立镜头菜单、两Quit/重载/关房部分传输/父IPC正常全组收尾。
原001/011/028失败及021–027初版保留，不叠加最终数；修正仅私有工具/专项，13输入READY保持。

**本轮玩家已明确通过：Guest同样3建筑，镜头和菜单互不影响，点击/E/Q不能改变世界，Quit两窗正常关闭。**
原101回执证明完整应用、383字节/SHA/ACK一致，各1PC/同PC两通道、信令错误0；两端code0/signal=null，
forced=0/residual=[]/processErrors=[]，serviceStopped=true/port8787Released=true/outboundRequests=0。
实时相关进程0、8787监听0、控制器标记已移除、stderr空、main-failure0；末次物理进度写入/行0。
人工PASS独立存reports/101/player-acceptance.json并绑定原会话/cleanup/verification/门哈希；
原CLOSED_PENDING_PLAYER_FEEDBACK/PENDING及自动/原始证据不覆写。末次wire.open/signaling-ready为退出前观测。
新13输入/445程序/389保护/依赖和旧444/442及旧验收引用已再核对保持，不需再开窗口或重复验收。

**下一步待问题21决定：推荐A仅只读规划1主3客的房间快照；B仅只读规划更多建筑/状态覆盖。
选定后先明确逐peer状态、失败/掉线及验收方案，再单独批准实施。当前不写运行码、不启动新实验。**
首版目标2–4人；旧四端只验证探针，当前快照endpoint只有单channel/binding/ACK，尚不支持3Guest。
固定回环服务/空ICE/TURN禁用、cf:false/外部请求拒绝/新根缓存及只读世界保护保持；手动无总寿命。

仍为私有隔离接入实验，正式运行源未接入，不证明完整/持续同步、新旧客户端混用或公网/Steam/Cloud。
不要prepare/refresh旧根、覆盖已用attempt或改原证据。功能/失败历史/下一步见Codex-md/progress_p2pmod.md第33项；
无版本/Git/打包/推送/部署/发布，其他dirty保持。

## 当前1.3快照实验：18A自动26项及snapshot13/101玩家均通过（2026-10-27）

独立工具位于tools/snapshot-1.3；新根C:/tmp/sixtyfour-p2p-snapshot13-20261027。
基于已通过four13/101复制442程序，仅覆盖4份测试入口并新增2模块，共444条目；
P2P运行协议2/0.2.1、Loader0.5.0、原版、旧desktop工具/冻结根和正式启用列表保持。
375份范围外输入、旧23门输入及原four13/101报告保持；4文档写前备份见新根before-18A。

最终19项专项＋021–027七组实际双进程＝26项自动通过，原证据见verification.json与live-final-021.log。
真实跨renderer WebRTC传输383字节的一次快照，SHA-256/ACK/3种原生实体/资源一致；
≥20秒且两保存周期世界/统计冻结、画面推进，非法快照/重复拒绝、输入只读与独立镜头/菜单；
两原生Quit、重载和父IPC断连均正常收尾。原生外层updateLoop计时及浏览器计时器/ACK限时已修正，
先前901–904调试、001失败及011–017初版通过保留，不计入最终26项。

**本轮玩家已明确通过：客机同样3建筑，镜头和菜单互不影响，点击/E/Q不能改变世界，Quit两窗正常关闭。**
新reports/101/player-acceptance.json单独保存人工PASS及原证据哈希；原机器snapshot-session.json的
CLOSED_PENDING_PLAYER_FEEDBACK/PENDING、cleanup、verification及门不覆写。最终两端code0/signal=null，
forced=0/residual=[]/processErrors=[]，实时相关进程0、active-controller已移除、stderr空、无main-failure。
最后wire.open是退出前观测，renderer连接已随进程退出释放；末次物理进度写入/行均0。
新门READY的11输入、444程序、375保护源及旧23输入/442程序已再核对。

**下一步待问题19决定：推荐A仅只读规划接入现有本地建房/入房连接；B仅只读规划扩大建筑/状态覆盖。
选定后先给精确文件、兼容策略与验证方案，再单独确认实施。当前无需再开窗口或重复验收。**
手动无总时限；关闭/重载/父IPC断连结束两端，不自动重发，各阶段时限保持。
快照正文只经实验独立DataChannel；父IPC仅协商/控制摘要，本轮未启房间/Miniflare/8787服务。
现有正式通道仍仅握手/探针路径，尚无快照分发；完整进度/活动Cube/permanents/持续同步和公网仍待。

不要重跑prepare、覆盖已用attempt或刷新旧根。自动与人工证据分开；完整实现及下一步见
Codex-md/progress_p2pmod.md第31项及最新四段式记录。版本/Git/打包/推送/部署/发布均无动作。

## 当前1.3四实例验收：15A自动与101玩家均通过（2026-10-27）

新根C:\tmp\sixtyfour-p2p-four13-20261027仅复制205已通过的442份程序输入，
继承诊断/路径统计/退出修正；新根覆盖测试main/fixtures/guard，旧008/player13保持只读。
Host、Guest1/2/3各有独立合成身份、profile、进度内存、偏好和日志；只本机8787、
空ICE/host候选，store/save/Cloud/统计/高危UI写入继续拒绝，正式enabled.json不改。

当前最终92项自动通过：四端22专项＋旧玩家23/guard16/路径9/Phase2纯9/服务核心13。
011验证三轮新房6方向4096/522263探针及Guest/Host重载后的独立进度，012/013验证原生Quit，
014验证父IPC断连；每轮4端code0、无强退/残留/主进程错误、8787释放。
文件游标统计本房新回执，避免内存审计只保留500条后的漏计；不输出房间码/地址/存档正文。
新READY绑定23份工具、运行manifest、相关测试及本机服务/依赖/验证输入。

101四端玩家验收通过：首轮及Guest1重载后的第二轮均6方向4096/522263回执齐全，
用户确认镜头/菜单互不影响，点原生QUIT后四窗全部正常关闭、无异常。
最终4端code0、无强退/残留/进程错误、8787释放，现场运行根进程/监听/main-failure均0，
active-controller已移除；四端物理进度写入/磁盘行/未处理错误均0。
人工结论另存reports/101/player-acceptance.json（PASS），绑定原始报告/cleanup/verification哈希；
原始four-session.json的CLOSED_PENDING_PLAYER_FEEDBACK/PENDING机器状态及自动报告保持。
本批已关闭，不重复探针/重载/退出。手动无总时限、关一窗结束全组的合同保持；
重载会整房重建三条连接，不是单端无感续接；世界/资源/操作同步仍未实现。
16A调查与17A目标已确认，18A快照实验见本文顶部；旧四端通过保持。
实施、真实存档读取、游戏启动及云动作均须另行确认，正式Phase3仍保留公网/Phase0前置。

001–004、011–014、101已使用，原始报告不可覆盖复用。
以后重新验收用未使用attempt；four.cjs --prepare只用于首次准备，已有新根会拒绝覆盖。
旧双端源码启动门因共享源更新按计划失配，保留旧门及通过证据，不自动刷新旧运行根。
实现/检查/下一步见Codex-md/progress_p2pmod.md第28项；本批精确11文件，
Mod0.2.1/协议2/Loader0.5.0不变，无Git/打包/推送/部署/发布。

## 双实例历史：13A与204/205均已通过

13A自动96项、204联机核心与205菜单QUIT玩家验收全部通过，原始机器PENDING报告保留，
人工结论另存各自player-acceptance.json。旧player13冻结根不刷新、不重复玩家验收。
四实例新根与新门不扩展到真实Steam/Cloud、公网/跨NAT或世界同步。




## Historical desktop 1.3 acceptance (2026-10-24; frozen, do not rerun)

The tools/desktop-1.3 harness runs the actual copied game, assets, clock, world,
shop and ModLoader with only P2P enabled in the clone. An early preload guard
redirects progress to session memory; native autosave still runs. Reset,
import/export and destructive slot actions resolve false. Only isolated
preference fields persist. Steam/Cloud/SDK use synthetic substitutes.

This path requires a validated early context, game readiness, fixed
127.0.0.1:8787 signaling, empty ICE servers and same-machine host candidates.
Creation, joining and refresh never adopt the Worker's STUN/TURN servers.
The real enabled list remains unchanged.

Approved output root: C:\tmp\sixtyfour-p2p-desktop13-20261024. The baseline and
before/ backups were created before this batch. Do not overwrite a running
runtime or an existing report attempt. From the repository root, after reviewing
the handoff and authorization:

~~~powershell
node resources/app/game/mods/Cattail_TweaksNetwork_P2P-Multiplayer/tools/desktop-1.3/prepare.cjs
node resources/app/game/mods/Cattail_TweaksNetwork_P2P-Multiplayer/tools/desktop-1.3/verify.cjs "D:\Steam\steamapps\common\Sixty Four\win-unpacked" 010
~~~

Attempt 008 passed 43 full-game checks; three startup rejections, 31 client
unit/regression checks and 18 service regressions also passed. Screenshots were
visually reviewed. This was automated local P1-equivalent evidence; the 204 player core is now accepted.
Native Quit also passed 205 player acceptance. Current four-instance automation passed 15A and player101 is accepted; public network and world synchronization remain separate.

Miniflare must use cf:false and caches inside the approved root. Early attempts
001–004 omitted that setting and refreshed the existing project
.wrangler/cache/cf.json through public metadata fetch. The incident and missing
old backup are recorded in scope-incident.json; do not describe those attempts
as zero-public-network evidence. No account API or deployment was performed.


## Archived pre-1.3 Phase 2 tools

Historical workflow below is not the current 1.3 launcher; it uses older runtime/profile assumptions.


Phase 2 local workflow (no Cloudflare deployment):

1. `prepare-phase2.ps1` creates a separate runtime and four independent profiles under `C:\tmp\sixtyfour-p2p-phase2`. It refuses to overwrite an existing runtime/profile set.
2. `start-phase2-signaling.ps1` starts a hidden localhost-only Wrangler server and records its exact PID and logs.
3. `verify-phase2-isolation.ps1` checks real-profile fingerprints, clone mod selection and source/clone core hashes.
4. `start-phase2-instance.ps1 -Role Host|Guest1|Guest2|Guest3` launches visible isolated instances. Start Host first, create a room, then join from each Guest.
5. Close all game instances, run `verify-phase2-isolation.ps1 -RequireLiveAudit`, then run `stop-phase2-signaling.ps1`.

The local Worker has TURN disabled. Cloudflare credentials and deployment remain a separate authorization gate.

For a strict private-alpha endpoint, add `-SignalingUrl 'https://...'` and
`-AlphaInvite $env:CATTAIL_P2P_ALPHA_INVITE`. The launcher places the invitation
only in the child process environment and restores the parent environment after
launch. Do not paste the token directly into a command that will be retained in
PowerShell history.

## Archived Phase 1 tools

Historical tools for the old Phase 1 acceptance:

1. `prepare-phase1.ps1` creates a new disposable clone. It refuses to overwrite an existing root.
2. If preparation stopped because the original game was open, close the original game and run `finalize-phase1-preparation-v2.ps1`.
3. Run `verify-phase1-isolation-v2.ps1` before launching either clone instance.
4. Run `start-phase1-instance.ps1 -Role Host` and `start-phase1-instance.ps1 -Role Guest` only after the preflight passes.
5. After closing both instances, run `verify-phase1-isolation-v2.ps1 -RequireLiveAudit`.

Deprecated in this working tree:

- `finalize-phase1-preparation.ps1` has an unquoted PowerShell metadata key. Do not execute it; use v2.
- `verify-phase1-isolation.ps1` treats a missing Local profile as different from an empty baseline object. Do not use it; use v2.

The v2 files exist because the current Windows patch sandbox can add files but cannot update newly added files in place. No shell-based source rewrite was used to bypass that constraint.
