# Better UIs

Sixty Four 界面模组，清单版本保持 `0.2.0`。官方开发交接见工作区 `Codex-md/progress_BetterUI.md`。

## 桌面 1.3 商店

在 **ModLoader 菜单 → Better UIs（更好的 UI 界面）→ 商店版本** 中选择，点击保存并重载后生效：

- **1.3 商店**：默认选项，使用原生分类商店。
- **1.2.1 商店**：经典长列表，右下角可缩小／展开；开启“商店分类”后，另一个右下角按钮可切换八类紧凑视图。分类为空时不显示，未分配建筑进入“其他”。

两种视图均使用游戏 1.3 的商品、价格、解锁和购买逻辑。独立拆除／搬迁按钮保留在经典列表左侧；不恢复旧版拆除商品。设置名中的版本指界面，不会降级游戏或转换存档。

经典商店距窗口右边缘保留 8px，另外固定预留 14px 滚动条区域；分类展开产生滚动时卡片不会变窄。长列表、缩小和紧凑视图共用这一区域，拆除／搬迁按钮同步避让。

分类卡片的图片、价格、数量和说明取自活动 Store；说明复用 ModLoader 的 600 ms Tooltip。紧凑分类偏好沿用本机 `cattailShopCategoriesCompressed`，与世界存档分开。语言重建、现实／虚空切换及 HUD 隐藏／恢复由适配层同步。

实现入口按 `classic-shop.js` → `shop-categories.js` 加载。经典视图移动原生商品卡片并保留其引用与购买事件，通过私有 Symbol 协作；不创建 `game.shop`，不重启遗留 `Shop`，不新增计时循环或另一套存档／价格逻辑。原生模式不安装经典补丁和控件。

## 其他子功能与边界

Save Slots、Language Menu、Settings Page 继续使用各自入口和开关；本次商店实现没有修改这些脚本。多存档停留在用户已确认的阶段。

首批适配仅覆盖桌面商店自身。其他 Mod 的倒计时、扫描控件、创造模式经济和旧商店滚动补丁尚未完成组合验收；恢复经典界面不代表这些功能已适配。移动端不启用经典界面。

## 验证

- `node tests/verify-classic-shop-browser.js`：真实 1.3 Store、当前 ModLoader 和当前商店脚本，在临时浏览器上下文与模拟世界中验证界面、配置及交互。覆盖 1440/1000/640 px、菜单保存重载、语言、价格数量、位面、Tooltip、HUD 和原生工具。
- `node tests/verify-shop-categories-tooltips.js`：共享 Tooltip 静态合同。
- 工作区 `resources/app/game/modloader/tools/verify.ps1 -LoaderOnly`：Loader 基础检查。

浏览器检查需要 Playwright；可用 `CODEX_NODE_MODULES`、`BETTER_UI_BROWSER` 指定运行时，`BETTER_UI_SHOP_TEST_OUTPUT` 指定截图／报告目录。默认使用临时目录和全新浏览器上下文，只提供商店所需资源；不读取正式启用清单、玩家 profile 或 Steam。

自动检查不能替代游戏内验收。下一步由玩家重启后分别测试两种商店、缩小／八类切换、滚动定位和拆除／搬迁。
