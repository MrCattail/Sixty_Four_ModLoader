# Cattail World Editor

> An in-game World Editor for *Sixty Four* with area selection, safe disassembly, blueprint copying, complete replication, undo/redo, and a local blueprint library.

Current development version: `0.5.1`. The main feature set is complete, while interface polish and player acceptance testing are still in progress. Keep a recoverable manual save before using the editor on an important world.

## What World Editor Can Do

Cattail World Editor lets you select areas directly in the game world, inspect buildings and production data, generate or cut blueprints, and safely preview, rotate, mirror, and place them elsewhere. Blueprints can be saved as local `.64schem` files, reused across saves in the same game installation, imported, exported, or copied as share text.

Main features include:

- Create, move, resize, and overlap multiple rectangular selections in both the Reality and Void planes.
- Inspect area, occupancy, buildings, Cubes, skipped content, and actual production through the selection card.
- Generate one complete source blueprint from multiple selections while deduplicating overlaps and multi-cell buildings.
- Place a safe Standard Build in normal mode or a state-aware Complete Replica in Creative Mode.
- Control Include Cubes, Include Surges, and Include Cells independently.
- Use four preview states to distinguish buildable cells, already-satisfied cells, replaceable conflicts, and protected content.
- Safely disassemble selected buildings, or Cut a selection into a blueprint before removing eligible content.
- Undo and redo World Editor placement, disassembly, and cut transactions.
- Save blueprints to an installation-wide library with List/Grid views, thumbnails, Details, Trash, Quarantine, and Problems management.
- Perform editor economy operations for free in Creative Mode, either in the current save or in a separate creative copy.
- Follow the current game language with buttons, statuses, messages, and dialogs localized into all 20 original game languages.

## Installation and Activation

1. Install a compatible Cattail ModLoader. World Editor currently requires ModLoader `0.3.1` or later.
2. Place the Mod folder at:

   ```text
   resources/app/game/mods/Cattail_TweaksQuality_World-Editor
   ```

3. Enable `Cattail_TweaksQuality_World-Editor` in ModLoader, then fully start or reload the game.
4. Enter a save and press `V` by itself to open World Editor.

Creating a separate creative copy requires the Save Slots Service from Better UIs and at least one empty manual save slot. Dynamic Details is optional: the core editor works without it, while installing it allows selection and blueprint cards to show richer actual and theoretical production data.

## Quick Start

A typical blueprint workflow is:

1. Press `V` to enter World Editor.
2. Choose the first and second corners of a rectangular selection. Hold `Ctrl` on the first click of a new selection to add another area.
3. Select Generate Blueprint on the toolbar, or press `Ctrl+C`.
4. Move the cursor to preview the blueprint. Click the map to pin or unpin its target, or hold `Alt` for a temporary pin.
5. Choose Standard Build or, in Creative Mode, Complete Replica. Enable Include Cubes, Include Surges, or Include Cells as needed.
6. Rotate or mirror the blueprint with the toolbar or keyboard shortcuts.
7. Select Place on the blueprint card, or hover the destination cell and press `Ctrl+V`.
8. Select Save to Library for long-term storage, or open Blueprint Library to manage, import, export, or share it.

## Keyboard and Mouse Reference

| Input | Action |
| --- | --- |
| `V` | Open or close World Editor |
| Left-click the first and second corners | Create a rectangular selection |
| `Ctrl` + first click of a new selection | Add a new area to the current multi-selection |
| Hold or drag inside a selection | Move only the selection boundary, not world buildings |
| Drag one of the 8 selection handles | Resize the primary selection |
| Wheel over a handle or selection edge | Adjust its size or position one cell at a time |
| Right-drag | Keep the original map-pan behavior; top UI and cards pass input through when needed |
| `Backspace` | Remove only the primary selection without disassembling buildings |
| `Delete` | Open the Disassemble Selection safety confirmation |
| `Ctrl+C` | Generate Blueprint |
| `Ctrl+X` | Cut: generate a blueprint, then safely disassemble eligible content |
| `Ctrl+V` | Plan and place the active blueprint at the hovered cell |
| `R` / `Shift+R` | Rotate the blueprint clockwise / counterclockwise |
| `M` / `Shift+M` | Mirror the blueprint on the U / V axis |
| `Ctrl+Z` | Undo the latest World Editor world transaction |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| Hold `Alt` | Temporarily pin the current blueprint target; release to resume following |
| `Z` + wheel over a card | Adjust that card group's opacity in 10% steps, from 25% to 100% |
| Middle-click a card | Toggle between fading all content and fading only the background |
| `H` | Hide or restore World Editor UI together with the original HUD |
| `Esc` | Cancel the current layer, clear selections, or exit the editor |

`Esc` does not always exit immediately. It first closes the topmost dialog or menu and cancels an active selection, drag, resize, or blueprint preview. If no temporary operation remains but selections still exist, the first `Esc` clears all selections while keeping World Editor open. Only the next `Esc` exits once no selection remains.

## Status Bar and Toolbar

The top of World Editor contains two separate glass panels.

The status bar shows:

- The World Editor name.
- The current scene mode: Selection Mode, Standard Build, or Complete Replica.
- The number of active selections.
- The `Esc` exit hint.
- The switch between compact and large-card toolbar layouts.

Standard Build or Complete Replica appears only while an active blueprint preview actually exists in the world. A blueprint that is stored only in the current session or library, without a live preview, leaves the status at Selection Mode. When Creative Mode is enabled, the current mode text becomes deep Hell Gem green and emits a matching green glow.

The toolbar is divided into functional groups:

- Selection: Clear All Selections, Disassemble Selection, and Cut.
- History: Undo and Redo.
- Blueprint Content: Standard Build, Complete Replica, Include Cubes, Include Surges, Include Cells, and Clear Active Blueprint.
- Blueprint Library: Generate Blueprint, Save to Library, and Blueprint Library.
- Transform: rotate clockwise/counterclockwise, mirror on U/V, and reset.
- Creative Mode: enable, disable, or create a creative copy.

Compact mode uses consistently sized square icon buttons. Large-card mode adds readable localized labels and supports horizontal inertial scrolling when the cards exceed the available width. Standard controls use a rounded pale-gray hover background with the game's original pink icon feedback. Active Include controls, Creative Mode controls, and dangerous confirmations use reflective, translucent glass with a matching colored glow.

When a right-drag begins on the game canvas, or an unpinned blueprint is still following the cursor, the status bar and toolbar remain visible but temporarily pass pointer input through to the world. While World Editor is open, the original resource HUD scales down proportionally and stays aligned to the upper-left without being pushed below the two top panels.

## Selections

### Creating and Managing Selections

- Committing a normal selection replaces the previous selection set. Hold `Ctrl` on the first click of a new selection to add it instead.
- Multiple selections may overlap. The most recently created or activated selection becomes the primary selection, with blue/orange endpoints, eight resize handles, and the selection card. Secondary selections use a less prominent outline.
- Click a secondary selection to promote it to primary.
- Hold or drag inside the primary selection to move its boundary. This changes only the selected area; it never moves buildings, Cubes, or other world entities.
- Drag the four corner handles or four edge-center handles to resize the primary selection. Handles may cross the opposite side while the start/end identities remain stable.
- Use the wheel over a handle or selection edge to adjust the area one cell at a time. The change commits after settling; press `Esc` to cancel and restore the previous boundary.
- Clear All Selections removes every selection. `Backspace` removes only the primary selection and promotes the most recently active remaining selection.

### Selection Card

The selection card follows the primary selection and automatically chooses a safe position to its right, left, bottom, or top. It can show:

- U/V coordinates, width, height, area, and cell count.
- Occupied cells, empty cells, buildings, Cubes, and cross-boundary content.
- Content that will be protected or skipped during capture and safe operations.
- Building types and original game resource icons.
- With Dynamic Details, actual total production, resource outputs, consumption, net values, and per-building production companion cards.

The card normally remains visible for about three seconds after a change. Click its background to keep it visible. A green border and glow mean that the card is persistent, not that the blueprint target is pinned. Hovering pauses the auto-hide timer. During selection movement, resizing, blueprint following, or right-drag map panning, cards automatically pass pointer input through instead of capturing world controls.

## Blueprints

### Generate Blueprint and Cut

Generate Blueprint captures the exact union of all selections on the current plane as one complete source blueprint:

- Overlapping cells, duplicate entities, and multi-cell buildings are deduplicated.
- If any occupied cell of a building touches a selection, the complete building is captured and counted as cross-boundary where applicable.
- Standard purchasable buildings retain structural data. Safelisted persistent state, stable Cubes, independent Surges, and verified empty cells remain available in the complete source.
- Natural objects, temporary objects, unknown or unsafe Mod entities, and unserializable state are skipped or marked as protected. Runtime object references are never written into the blueprint.
- After a successful capture, the active blueprint remains in the current session and formatted blueprint JSON is written to the system clipboard.

Cut uses the same complete-source capture, then safely disassembles eligible content after confirmation. The world transaction does not begin until the clipboard write succeeds, and protected content remains in the world. Cancellation, insufficient resources, target changes, or transaction failure never silently substitute a different disassembly target.

### Standard Build and Complete Replica

- Standard Build is the safe structural execution view. It places building structures and stable configuration without copying internal operating state, Cubes, or Surges. It is available in both normal and Creative Mode.
- Complete Replica is a Creative Mode-only complete execution view. It can restore safelisted, normalized persistent state and may include stable Cubes and safe Surges through the toolbar toggles.
- Newly generated, cut, or saved blueprints retain their complete source. Loading a complete source in normal mode does not invalidate the file; World Editor projects it to Standard Build and keeps Complete Replica available when Creative Mode is enabled again.

### Include Toggles

- Include Cubes: adds stable Cubes with `state === 2`. Growing, transitional, exploding, or Pump-connected active Cubes are not copied.
- Include Surges: adds safe independent Surges stored in the blueprint.
- Include Cells: synchronizes verified empty cells recorded by the blueprint. Safely removable buildings in those destinations enter the disassembly preview, while protected objects are never forcibly cleared.

All three toggles are temporary choices for the current session and placement flow, and default to off. Loading, capturing, or cutting a new blueprint—or completing a placement flow—turns them off again. They are not written to blueprint files, settings, saves, or Steam Cloud.

### Preview, Pinning, and Placement

After a blueprint is generated or loaded, its preview follows the hovered cell. Status is communicated with both color and outlines/symbols:

- Green: can be built.
- Yellow: already satisfied; no duplicate build is required.
- Red: contains a conflict that can be safely replaced.
- Purple: blocked by a unique building, Cube, indestructible object, unknown content, or another protected conflict.

While the cursor moves, the last accurate preview remains visible at reduced opacity. A new exact plan is published after the cursor settles or the target is pinned, preventing large blueprints from flickering cell by cell. Click the map to permanently pin or unpin the target. Hold `Alt` for a temporary pin and release it to resume following. Clicking a card background controls only card persistence, not blueprint pinning.

Before placement, World Editor rescans the target, resources, prices, save identity, and plane instead of trusting an old preview. A red-conflict confirmation appears only when replaceable buildings actually exist. The player may preserve conflicts or disassemble and replace all safe conflicts. Safe removals from Include Cells, conflict replacement, temporary Surge cleanup, and building placement are combined into one atomic transaction.

### Rotation, Mirroring, and Clearing

A blueprint can rotate clockwise or counterclockwise, mirror on the U or V axis, or return to its default transform. Transformations apply to buildings, complete footprints, stable Cubes, Surges, the empty-cell mask, and selection bounds.

Clear Active Blueprint removes the current blueprint source, preview, transform, card result, and temporary Include state. It does not clear committed selections or exit World Editor. Pressing `Esc` by itself may leave the internal blueprint available after closing its live preview; Clear Active Blueprint can then remove the session blueprint completely.

## Cards and Production Information

World Editor uses two main floating card groups: the selection cards and the blueprint cards. Their persistence, opacity, and content-fade modes are independent.

The blueprint card can show:

- Source plane, execution mode, number of selections, area, and cross-boundary count.
- Captured, skipped, and protected entity types with original game icons.
- Buildable, already-satisfied, conflicting, and blocked counts for the current preview.
- Build cost, the player's available resources, and the Build Plan.
- Theoretical total production, capture-time actual production, and per-building production companion cards.
- Place, Save to Library, rotate, mirror, reset, and Clear actions.

Captured Types, Build Plan, and production categories can be collapsed. Their resize dividers can be dragged up or down to change the visible height. Tall content uses a narrow scrollbar, and the main card plus production companion cards automatically form a two-column layout when space allows.

## Blueprint Library

Blueprint Library is an installation-wide local blueprint manager. It uses the `blueprints/` folder at the game installation root instead of data inside a particular save, so different saves in the same installation can share blueprints.

Open it from either:

- Blueprint Library on the World Editor toolbar.
- The Blueprint Library page in ModLoader Pages.

Blueprint Library provides:

- List and Grid views with independent Show Details preferences.
- Building thumbnails, spatial Cube/Surge markers, and building-count summaries.
- A fixed right-side Details panel listing Area, Buildings, Cubes, Surges, Rotate, Mirror, and Schema.
- Save Current Blueprint, load, rename, duplicate, move to Trash, restore, and delete permanently.
- Active, Problems, Trash, and Quarantine sections.
- Corrupt-file quarantine, Problems retry, manual refresh, and Open Blueprint Folder.
- `.64schem` import and export. Legacy `.cattail-blueprint.json` files can still be read, while new exports always use `.64schem`.
- Copy Share Text, Paste Share Text, and conflict choices to create a copy, replace, or cancel when names or IDs collide.

Blueprint files change only after the player explicitly selects Save to Library, confirms an import, renames, duplicates, restores, or performs another library action. Thumbnails are rebuildable derived caches; a cache failure does not damage a `.64schem` file. Delete Permanently uses a Beta-Pylene danger-glass confirmation button, while Cancel remains the default focus.

Blueprint Library does not automatically write to Steam Cloud and does not modify the original game's Cloud saves. Blueprints, Trash, Quarantine, and thumbnail caches are local to the current game installation.

## Creative Mode

The Creative Mode control at the end of the toolbar offers two activation paths:

- Enable in Current Save: enables World Editor creative state directly in the active save.
- Create Creative Copy: consumes one empty manual slot and creates and activates exactly one separate creative copy. It does not create an additional non-creative backup copy.

While Creative Mode is enabled:

- World Editor purchase, disassembly, cut, and blueprint-placement operations neither consume nor refund normal resources.
- Complete Replica, Include Cubes, and Include Surges become available.
- The current mode in the status bar uses deep Hell Gem green text and a matching glow.
- Creative toolbar state and related confirmations use Hell Gem glass; Enable in Current Save uses Elmerine glass; dangerous actions use Beta-Pylene glass.

Disabling Creative Mode restores normal material costs, but does not delete existing buildings or the active blueprint. The complete blueprint source is not downgraded; normal mode simply uses its Standard Build projection.

## Undo, Snapshots, and Safety Boundaries

World Editor uses a conservative process for operations that modify the world:

1. Build a read-only plan from the current selection or blueprint.
2. Recheck the target, resources, prices, plane, Creative Mode state, and save identity at confirmation time.
3. Create a physical recovery snapshot immediately before writing.
4. Combine disassembly, replacement, temporary-layer handling, and construction into one transaction.
5. Verify the result after writing and attempt a complete rollback on failure.
6. Add successful operations to the current session's Undo/Redo history, up to 50 entries.

Safety protections include:

- Unknown Mod entities, unserializable objects, and unsupported dynamic states are skipped or protected by default.
- Indestructible objects, active Cubes, Pumps with active Cubes, and similar content are never forcibly removed through normal replacement paths.
- Operations that would remove the last member of a Pump/Gradient family are protected.
- Multi-cell buildings are handled as complete buildings, with explicit warnings when they cross selection or empty-cell boundaries.
- If targets, prices, resources, or world state change during confirmation, the old plan is refreshed or rejected instead of being silently reused.
- Dangerous confirmations focus Cancel by default and can also be cancelled with `Esc` or by clicking the backdrop.

Undo/Redo replays only the world, resource, statistics, and restriction state recorded by that World Editor transaction. It does not roll back the system clipboard, active blueprint, card preferences, or temporary Include toggles. Session history does not survive a reload, and physical snapshots or transaction rollback do not replace the player's own important save backups.

## Interface and Accessibility

- Reality uses a light theme and Void uses a dark theme. Typography and resource icons reuse original game assets where possible.
- Elmerine, Hell Gem, and Beta-Pylene buttons use reflective, translucent glass and colored glows derived from the corresponding game resources.
- The toolbar, cards, and Blueprint Library scale continuously with the game canvas and window, and reflow on narrow windows.
- The in-world Blueprint Library and confirmations own keyboard input, contain Tab focus, and let `Esc` close the topmost interface before any shortcut can affect the world.
- Color states are reinforced with outlines, symbols, text, `aria-pressed`, `aria-selected`, and localized accessible names instead of relying on color alone.
- English UI uses title case while other languages use natural localization. Changing the game language at runtime refreshes World Editor text.

## Current Limitations and Data Notes

- This version is still being polished. Automated checks do not mean every hardware configuration, resolution, and save has completed in-game acceptance testing.
- Only one active session blueprint is maintained at a time. Generating, cutting, or loading another blueprint replaces it.
- Mod and unknown entities are not copied completely. Safety takes priority over forcing every object into a blueprint.
- Complete Replica can execute only in Creative Mode. Normal mode always uses the Standard Build projection.
- Blueprint Library is a local shared folder for the current installation. It is not part of Steam Cloud and does not automatically synchronize to another computer.
- Include toggles and card persistence are temporary UI/session state. Card opacity and content mode are stored in local `localStorage`.
- World Editor never creates blueprint files automatically. Files are written to `blueprints/` only after explicit save, import, or library-management actions.

---

## Developer Technical Reference

The implementation contracts, debugging entry points, and regression boundaries below are preserved in their original maintainer language for continuity.

## 模块路线

```text
scripts/
  core/
    foundation.js        # 1A：注册入口
    shared.js            # 通用输入守卫、卡片几何、固定发光、滚动条、折叠/调高控制与右键世界拖动穿透
    editor-state.js      # 1B：编辑器生命周期、订阅和清理
    editor-transactions.js # 4A-3a：会话事务历史、写前快照、重验、回滚和内部 undo/redo 状态机
    selection-state.js   # 2G：稳定 ID 多选、主选区、兼容快照及指针/滚轮事务
    tool-state.js        # 2G：单一选择工具状态和生命周期
    selection-analysis.js # 3F：可取消的分批只读统计与已完成实体只读视图
    production-state.js  # 3F：Dynamic Details 软依赖、选区实际产量刷新与蓝图生产快照
    blueprint-state.js   # 5A：schema 6、状态白名单、Surge 安全归一化、结构投影与旧 schema 兼容
    blueprint-library-format.js # 5B：稳定 UUID 文件信封、.64schem 双读单写、名称与元数据合同
    blueprint-library.js # 5B：Library API CRUD、导入/导出/分享、revision、回收站、隔离、Watcher 与 Problems 控制器
    blueprint-transform.js # 5A：固定枢轴、有序旋转/镜像、完整源/结构投影、Cube/Surge 与空地掩码变换
    blueprint-preview-plan.js # 5A：结构/完整状态四级冲突、Cube/Surge、空地目标、安全替换与 Build Plan
    blueprint-placement.js # 5A：结构/完整蓝图建造、工具栏 Cube/Surge 状态、状态恢复、Waypoint 与 undo/redo
    selection-delete.js  # 5A：建筑及创造模式可选 Cube/Surge 的同一安全删除事务
    selection-cut.js     # 5A：完整源剪切、剪贴板优先与按模式保留/删除临时层
    input-controller.js  # 5A：V / Esc / Backspace、统一手势取消与输入保护
  input/
    selection-controller.js # 2F：混合指针手势、最近边/角判定、持久目标锁定和自动提交
  render/
    resize-handles.js    # 2G：主选区的 8 手柄、滚轮优先命中、光标与绘制
    hover-overlay.js     # 2E：选区内外青色悬停与右键拖动防抖
    selected-overlay.js  # 2G：主副选区分层、淡紫矩形与主选区蓝/橙端点
    blueprint-thumbnail.js # 5A：从蓝图派生 PNG 缩略图及 Library cache 复用
  i18n/
    editor-text.js       # 20 种原版语言的选区、蓝图、工具栏短标签、预览、成本、生产和警告文本
  ui/
    card-opacity.js      # 3F：独立分组、可持久化的 Z+滚轮透明度与中键内容模式
    dialog.js            # 4B-1a：共享对话框 DOM、主题、焦点、Escape、忙碌态和错误状态
    editor-shell.js      # 独立状态栏/工具栏、紧凑/大卡片热切换与横向惯性滚动
    blueprint-library-ui.js # 5B：Pages/modal 共用蓝图库、导入/导出/分享、列表/网格与恢复操作
    selection-cut-ui.js  # 5A：完整源剪切确认与创造模式临时层选项
    selection-card.js    # 3F：主选区实时统计、右左下上定位、3 秒临时显示和点击锁定
    production-cards.js  # 3F：主卡总产量、选区/蓝图建筑明细副卡与自适应双列
  blueprint-session.js   # 5A：schema 6 完整源捕获、执行投影、剪贴板、工具栏层开关/退出预览与蓝图卡片
  blueprint-preview.js   # 5A：结构/完整状态预览、Cube/Surge、空地/拆除/保护叠层与只读渲染
```

未来模块只在对应小阶段获批后创建，并按 manifest 中的 `entry` 顺序加载。

## 1B 状态检查

开发者控制台可执行：

```js
globalThis[Symbol.for('cattail.world-editor.runtime')].snapshot()
```

`active` 会在单独按 `V` 时切换。World Editor 激活后，`Esc` 按“临时操作 → 已提交选区 → 编辑器”分层处理：先取消 dialog/手势/移动/缩放/选区预览或现场蓝图预览；没有临时操作但仍有选区时清除全部选区并保留编辑器；只有没有临时操作也没有选区时才退出，下一次 Esc 才交给原版菜单。

## 1C 渲染边界

- 使用 Render API 的 `interaction` 层，不 patch 原版渲染方法。
- 使用 `game.hoveredCell`，并将格子的四个 UV 角分别交给当前 `game.uvToXY()` 投影；不从鼠标位置重复推算格子，也不写死原版菱形角度。
- 原版视角下保持单格菱形；动态视角或其他投影 Mod 改写 `uvToXY()` 后，悬停格与已选格会随地面一起旋转和改变倾斜度。
- 右键拖动画面期间，青色悬停高亮锁定为拖动开始时的格子，避免边界浮点误差导致相邻格闪烁；右键事件仍完全交给原版处理。
- 双层边框线宽按 `sqrt(game.zoom)` 缩放，并设置远景可见下限和近景粗细上限。
- 暂停、鼠标离开画布或编辑器未激活时不需求高亮回调。
- Render API 关闭时高亮隐藏；重新开启后恢复。

## 1D 状态栏边界

- 顶部状态栏通过 ModLoader game-HUD API 注册，跟随 `H` 键隐藏和恢复。
- 暂停界面、针孔、字幕、结局或其他原版 HUD 隐藏状态不会保留编辑器状态栏。
- 游戏内切换语言时通过 `afterWords` 立即更新文本，不 patch 原版语言切换方法。
- 状态栏使用 `pointer-events: none`，不会拦截地图鼠标操作。
- 状态栏使用原版 Montserrat 字体和接近 Mod 菜单的纯色雾玻璃表面；现实为亮色，虚空为暗色。
- 场景主题读取 `game.plane`，并在原版 `Game.switchPlane()` 完成后通过 ModLoader hook 立即同步。
- 1D 当时的状态栏没有可点击工具按钮；2E 的单一“选择”按钮和选区卡片接收鼠标，其余工具栏界面仍不拦截游戏画布。

## 1E 单格选择边界

- 激活编辑器时，左键选择当前 `game.hoveredCell`；再次点击其他格子会替换选择。
- 左键的按下、按住移动、松开和 `click` 在捕获阶段被消费，避免触发原版建造、删除、搬迁或实体点击。
- 右键拖动画面和滚轮缩放保持原版行为。
- 选中格使用独立中性轮廓，并沿用 1C 的缩放线宽公式；1C 青色轮廓继续表示当前悬停格。
- 状态栏显示 `u / v` 坐标，并将模式文本切换为完整 20 语言的“选择模式”。
- 退出编辑器或切换现实/虚空时清除选择。
- 本阶段没有多选、拖拽选区、复制、删除或任何世界写入行为。

## 2A 两次点击矩形框选

- 第一次左键按下设定起点；随后不需要按住鼠标，移动鼠标即可实时改变预览终点；第二次左键按下提交矩形。
- 预览和提交后的矩形都使用淡紫色，并分别为现实/虚空场景调整明度。起点保持蓝色，终点保持橙色；提交后两个端点仍会显示在选区和普通青色悬停高亮之上。
- 预览尚未确定终点且起终点重合时只显示蓝色起点；提交 1×1 选区后，在蓝色格内增加橙色内圈，同时表达重合的起点和终点。
- 起点与终点可以向任意方向选择。状态保留真实点击顺序，同时另行计算规范化边界和包含两端格子的宽×高。
- `Esc` 在预览中只取消本次预览并保留编辑器；没有预览时才退出编辑器。右键按下、鼠标离开画布或窗口失焦也会取消预览。
- 右键取消后事件继续交给原版，因此原版拖动画面保持可用。取消新预览会恢复此前已提交的选区；提交后才替换旧选区。
- 矩形四个外角分别通过当前 `game.uvToXY()` 投影，兼容动态视角或其他改写投影的 Mod。
- 状态栏使用 20 种原版语言的“区域选择”和取消提示，并实时显示 `u 起点→终点  v 起点→终点  宽×高`。
- 本阶段仍然只有一个只读选区；没有 Ctrl 多选、实体统计、复制、删除或任何世界写入行为。

## 2B 顶部工具栏与实时选区悬浮卡片

- 原顶部状态栏升级为较大的工具栏骨架，显示 World Editor、区域选择模式、`0 / 1` 个选区和全局退出提示。
- 工具栏预留未来操作区，但当前不显示没有功能的复制、粘贴或蓝图按钮。
- 坐标、宽×高、独立的 U/V 方向长度、总格数、已占用、空格、建筑和方块移到选区悬浮卡片。
- 卡片通过 ModLoader HUD API 管理，跟随 `H` 键、原版 HUD、暂停和编辑器生命周期。
- 地图高亮继续使用 Render API `interaction` 层；DOM 卡片通过 `api.render.onFrame()` 与镜头、缩放和动态投影同步，不创建额外 Canvas 图层。
- 卡片定位使用选区四个外角的当前 `game.uvToXY()` 投影及画布 CSS 缩放，位于屏幕包围盒下方正中。
- 底部空间不足时卡片翻到选区上方；左右限制在可视区域；选区完全离屏时隐藏。
- 使用 `game.entityAtCoordinates()` 分批只读扫描；每批最多处理 512 格。
- 多格建筑按对象去重，只有部分格子进入选区时仍计一个；`cube` 单独计数，并将其所在格计为已占用。
- 预览改变时取消旧扫描，避免旧结果覆盖新选区；小选区接近即时完成，大选区显示进度。
- 预览提交时若边界未变，会复用已经完成或正在进行的统计；取消预览可恢复此前提交选区的统计快照。
- 提交后统计不持续追踪世界变化；重新框选时刷新。
- 本阶段保持单选，不做资源流量估算、复制、删除或任何世界写入。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.analysis')].snapshot()
```

## 2C 选区移动模式

- 顶部工具栏提供实际可用的“选择”和“移动”按钮；没有已提交选区时，“移动”按钮禁用。
- “选择”模式保持 2A 的两次左键框选。切回“选择”会取消尚未提交的框选或移动预览。
- “移动”模式下，只有从已提交选区内部按下左键才开始移动；选区外左键不会改变选区，也不会传给原版世界交互。
- 拖动按当前 `game.hoveredCell` 计算整数格偏移，不使用屏幕像素直接修改 UV 坐标。
- 淡紫色选区、蓝色起点、橙色终点和悬浮卡片随预览位置实时移动；真实起终点顺序、宽和高保持不变。
- 松开左键提交新位置。新位置统计完成或正在进行时，提交直接复用同一结果，不重复扫描。
- `Esc`、右键、鼠标离开画布或窗口失焦会取消移动并恢复原选区及其已完成统计。
- 右键事件不被消费，原版画面拖动保持可用；移动模式下普通青色悬停高亮隐藏。
- 退出编辑器或切换现实/虚空仍会清除选区，并把工具模式恢复为“选择”。
- 本阶段不提供缩放手柄，不移动建筑或方块，不执行任何世界写入。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.tool')].snapshot()
globalThis[Symbol.for('cattail.world-editor.selection')].snapshot()
```

## 2D 选区缩放模式

- 顶部工具栏新增“缩放”按钮；没有已提交选区时禁用。
- 缩放模式在选区四角和四条边的中点绘制 8 个圆形手柄。手柄使用 Render API `interaction` 层，绘制顺序位于现有淡紫色选区之后。
- 手柄位置每帧通过当前 `game.uvToXY()` 投影；动态视角、镜头移动和缩放后不会沿用旧屏幕坐标。
- 手柄可视半径按 `sqrt(game.zoom)` 缩放并限制上下限；屏幕空间命中半径单独保留可操作下限。命中范围重叠时选择最近手柄，等距时角手柄优先。
- 从手柄按住左键开始缩放，以按下时的 `game.hoveredCell` 为锚点，按整数格偏移相应的起点/终点坐标分量；不会因按下位置落在边界两侧而立即跳格。
- 四个角手柄同时调整两个轴，四个边手柄只调整一个轴。
- 手柄可以穿过对边；规范化的 `min/max` 会自动翻转，但蓝色 `start` 和橙色 `end` 对象不会交换。
- 当某一轴的起终点相等时，`min` 侧归蓝色起点，`max` 侧归橙色终点；一次拖动期间所有权保持固定。
- 松开左键提交新范围。`Esc`、右键、鼠标离开画布、窗口失焦或切回“选择”会取消并恢复原范围及统计快照。
- 缩放预览继续使用淡紫色选区、蓝色起点、橙色终点和实时悬浮卡片；卡片显示缩放预览标题、实时尺寸与取消提示。
- 普通青色悬停格在缩放模式中隐藏；右键画面拖动和滚轮缩放仍交给原版。
- 本阶段保持单选和只读，不移动建筑、方块或任何世界状态。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.resize-handles')].snapshot()
globalThis[Symbol.for('cattail.world-editor.tool')].snapshot()
globalThis[Symbol.for('cattail.world-editor.selection')].snapshot()
```

## 2E 混合选择与卡片锁定

- 选择工具是 World Editor 的隐式默认模式，不再显示没有其他平级模式可切换的 Select 按钮；玩家直接在画布拖动即可建立选区，Esc 负责取消临时框选、移动或缩放。移动和缩放仍是按下后锁定的临时操作，不是需要切换的工具模式。
- 输入优先级固定为：缩放手柄、已提交选区内部、选区外部。一次按下识别出操作后不会因鼠标经过手柄或越过选区边界而切换类型。
- 缩放手柄按下后立即开始缩放，保留 2D 的 8 手柄、整数格偏移、越边翻转和起终点身份规则。
- 在选区内部短按并松开会以按下格作为新选区起点；旧选区在第二次点击提交前继续保留，取消预览可恢复旧选区。
- 在选区内部按住 `220ms`，或按住移动达到 `6` 个 CSS 像素，会开始移动整个选区。进入移动后使用当前 `game.hoveredCell` 的整数格偏移，松开提交。
- 在选区外短按继续使用两次点击矩形框选。已有选区预览等待终点时，下一次短按始终提交终点，不会被手柄或选区内部移动识别抢占。
- 普通青色悬停格现在也会显示在淡紫色选区内部；它保留在淡紫色半透明选区和蓝/橙端点之下，8 个手柄仍位于最上层。右键拖动画面时继续使用原有防抖锁定。
- 选区信息卡片默认在选择、移动和缩放变化后显示 `3` 秒。鼠标停在卡片上会暂停剩余时间，移开后继续计时。
- 点击卡片可切换长期显示；锁定时现实/虚空主题都使用绿色边框与外发光。再次点击恢复临时显示并重新开始 3 秒计时。卡片点击不会穿透到游戏画布。
- 选区卡内容能够完整放入高度限制时不产生滚动范围；只有窗口高度确实不足时整卡才启用纵向滚动。绿色锁定边框由卡片外壳自身绘制，不随内容滚动，也不创建额外滚动范围。
- 卡片锁定只保留在当前游戏会话；重新载入游戏后恢复临时显示。编辑器未激活、HUD 隐藏、暂停、选区离屏或没有选区时，锁定卡片仍按原有生命周期隐藏。
- `Esc`、右键、鼠标离开画布、窗口失焦、切换现实/虚空或退出编辑器仍会取消当前未提交操作；右键事件继续交给原版。
- 本阶段保持单选、只读和 20 种原版语言适配，不包含 Ctrl 多选、复制、粘贴、蓝图或任何世界写入。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.selection-interaction')].snapshot()
globalThis[Symbol.for('cattail.world-editor.resize-handles')].snapshot()
globalThis[Symbol.for('cattail.world-editor.tool')].snapshot()
```

## 2F 滚轮微调

- 鼠标指向 8 个缩放手柄时，滚轮向上把该手柄控制的边界向外扩一格，向下向内收一格；角手柄同时调整两个轴，边手柄只调整一个轴。
- 滚轮首次命中后会锁定手柄及起终点所有权。即使手柄移离鼠标、越过对边或 `1.25s` 自动提交，鼠标未移动时后续滚动仍操作同一手柄；蓝色 `start` 与橙色 `end` 身份继续保留。
- 鼠标指向已提交选区内部时，比较鼠标到当前 `game.uvToXY()` 投影后四条可见边线的屏幕距离，锁定最近的逻辑边。
- 默认情况下，滚轮向上使整个选区朝锁定边的外侧移动，向下朝相反方向移动。最接近的 U 边和 V 边距离相差不超过 `16 CSS px`，并且各自至少比对边近 `4 CSS px` 时，视为靠近角落，每格同时调整 U/V 两个轴。
- 四条边按当前投影后边中点相对选区中心的位置区分视觉上/下边。视觉左下边与视觉右下边使用默认方向的反向：滚轮向上朝内和视觉上方移动，向下朝外和视觉下方移动；视觉左上边与视觉右上边保持默认方向。
- 角落可按屏幕投影称为“视觉上角 / 右角 / 下角 / 左角”，调试时使用稳定的逻辑名 `minU-minV / maxU-minV / maxU-maxV / minU-maxV`。其中当前投影的“视觉下角”同样使用反向规则；其他角保持默认方向。
- 动态视角只参与判断鼠标最靠近哪条可见边；实际移动方向固定绑定该边的 `minU / maxU / minV / maxV`，不再根据当前画面的屏幕上/下方向反推 UV 方向。
- 每累计 `100` 个像素滚轮量移动一格；高精度触控板的小量输入会累积。单个事件最多应用 `4` 格，多余整格丢弃但保留不足一格的余量，避免突发跳跃。
- 停止滚动 `1.25s` 自动提交预览，但不释放目标锁定。静止鼠标下，即使移动中的选区碰到其他手柄，也不会从移动选区切换为缩放手柄。
- 每次有效滚轮让选区或手柄移动后，都会以该次滚轮事件的鼠标位置重新计量；随后鼠标累计移动达到 `6 CSS px` 时，立即提交现有滚轮预览并释放目标。未累计出整数格的滚轮输入不会重置基准；下一次滚轮才重新执行“手柄优先 → 选区最近边/角 → 原版”命中。左键按下也可立即提交并消费该次点击。
- 第一次点击开始两点框选后，以及选区或手柄的滚轮目标锁定、左键移动/缩放预览期间，悬浮卡片继续显示但立即切换为鼠标穿透，避免第二次点击或快速拖动被卡片拦截；操作结束后恢复卡片点击、悬停和锁定。
- 卡片与选区投影包围盒的上下间距为 `28 CSS px`，为视觉上下角手柄及其命中区留出操作空间。
- 卡片长期显示时的锁定边框使用 Mod 菜单开关按钮的 `#E3FD43 → #A6F246 → #4CB96B` 渐变及同色光晕；现实/虚空主题共享该锁定色。
- `Esc`、右键、鼠标离开画布、窗口失焦、切换场景或退出编辑器会取消滚轮预览并恢复原选区；右键事件仍交给原版。
- 横向滚轮和 `Shift / Ctrl / Alt / Meta` 修饰滚轮不被本功能消费。动态视角 Mod 的 `C / V + 滚轮` 位于 window 捕获阶段，仍先于本 Mod 的 canvas 捕获监听处理。
- 滚轮预览期间，选区悬浮卡片显示“滚动调整 / 停止后应用 / Esc 取消”，并覆盖全部 20 种原版语言。
- 本阶段保持单选和只读，不移动建筑、方块或任何世界状态；Ctrl 多选顺延到 2G。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.selection-interaction')].snapshot()
globalThis[Symbol.for('cattail.world-editor.selection')].snapshot()
```

## 2G Ctrl 多选

- 按住 Ctrl 完成第一次点击会把本次两点框选锁定为“追加”；第二次点击时不需要继续按住 Ctrl。
- 不按 Ctrl 开始的新框选使用“替换”模式；旧选区在预览期间继续以低强调轮廓显示，提交后才被替换，取消则完整恢复。
- 最后创建的选区自动成为主选区。短按副选区只将其提升为主选区；多选状态下短按主选区不会开始重新框选，单选状态继续保留 2E 的短按重框行为。
- 选区可以重叠。重叠格优先命中当前主选区；否则命中最近激活的选区。
- 长按或拖动只移动命中的选区。8 个缩放手柄、滚轮调整、悬浮卡片和只读统计只作用于主选区。
- 副选区只显示低强调淡紫轮廓，不显示蓝/橙端点、手柄或卡片；主选区保持已有完整视觉。
- 顶部工具栏显示真实选区数量，并提供“清除”图标按钮；该按钮一次清除全部已提交选区。`Backspace` 继续只移除当前主选区，移除后最近激活的剩余选区成为新的主选区。
- 清除按钮的标题和辅助说明覆盖全部 20 种原版语言，并随游戏内语言切换即时更新；完整辅助语义为“清除所有选区”，不再把 Backspace 标为同一操作。
- 本阶段不计算多选去重汇总，不创建蓝图，不复制、粘贴或修改任何世界状态。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.selection')].snapshot()
globalThis[Symbol.for('cattail.world-editor.selection-interaction')].snapshot()
```

## 3A 只读会话蓝图

- 工具栏使用“结构 / 完整”分段控件。结构模式只保存可购买原版建筑的类型、相对整数坐标、完整足迹、唯一建筑限制标记和稳定结构配置，不保存运行时状态。
- 完整模式额外复用原版 `game.getEntityString()` 及 ModLoader `entitySave` 钩子的结果，并在 JSON 深拷贝和可序列化校验后保存白名单状态。3A 只捕获这些数据；未来只有创造模式允许放置完整蓝图。
- Cube 图标按钮只在完整模式可用，默认关闭。开启后只捕获原版会存档的 `state === 2` 稳定 Cube；结构模式始终排除 Cube。
- 多个选区合并为一个蓝图，重叠格和重复实体按对象去重。只要建筑任一占位格与选区并集相交，就捕获整座建筑；`contentBounds` 扩展到完整足迹并记录跨边界数量。
- 3C 起，锚点是所有选区整体外包矩形在捕获瞬间的视觉右角。实体、Cube 和各选区在蓝图中保存相对锚点的整数 UV 坐标，同时保留来源现实/虚空平面。
- 只捕获原版 `canPurchase === true` 建筑；`onlyone` 建筑保留并标记受限。自然、临时、未知、不可序列化和所有 Mod 实体按类型与数量跳过，不保存运行时对象引用。
- 捕获使用每批最多 1024 格的可取消扫描。新捕获、退出编辑器或卸载 Mod 会取消尚未完成的扫描；已经完成的活动蓝图在编辑器开关和现实/虚空切换期间保留，页面重载或 Mod 卸载时清空。
- 工具栏“生成蓝图”按钮和焦点不在编辑控件时的 `Ctrl+C` 执行相同行为：先原子替换内部不可变蓝图，再把带 `schemaVersion` 的格式化 JSON 写入系统剪贴板。该生成入口、卡片短标签、tooltip 与 ARIA 名称在全部 20 种语言中使用自然本地化；剪贴板、分享与蓝图库“创建副本”的 Copy 语义不改名。
- 若系统剪贴板写入失败，内部蓝图仍然保留并在卡片显示错误。没有可捕获内容或根数据校验失败时，不替换此前蓝图。
- 蓝图信息卡片显示来源平面、模式、选区数、跨边界数，以及所有捕获/跳过实体类型的原版图标和数量；3E 起它同时承载预览状态和成本，宽度限制为 `270–372 CSS px`，整体高度不超过视口的 `68vh`，类型列表独立滚动。
- 原版建筑图标优先复用当前商店图片或 `shopImage`。Cube 使用原版资源颜色生成动态缩略图；图片或绘制失败时使用中性建筑/方块降级图标。
- 没有活动预览时，卡片位于来源锚点附近；活动预览时改用完整蓝图投影外框定位，按右、左、下、上的顺序选择能完整落入视口安全边距的位置，并自动避让选区卡片。捕获后显示 3 秒，可点击固定；框选、移动或缩放期间保持可见但鼠标穿透。清除图标只清除内部蓝图，不改写系统剪贴板。
- 所有新增可见文字、工具提示和无障碍名称覆盖 20 种原版语言，随游戏内语言切换即时更新，并统一使用原版 `Montserrat` 字体。
- 3A 不提供粘贴、导入、持久蓝图库、资源结算、预览建筑或任何世界写入。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.blueprint')].snapshot()
globalThis[Symbol.for('cattail.world-editor.blueprint')].exportJSON()
```

## 3B 只读结构蓝图预览

- 成功捕获结构蓝图后自动进入预览；完整蓝图仍然保留，但会退出当前预览并显示“当前版本不能预览完整蓝图”。3B 不增加工具栏真实放置命令，也不启用 `Ctrl+V`。
- 预览锚点跟随当前 `game.hoveredCell`。左键只固定或解除固定目标，不执行建造；预览活动时暂停选区框选、移动和缩放，右键拖动画面与原版滚轮缩放继续可用。
- `Esc` 只退出预览并保留编辑器。关闭编辑器或清除蓝图会退出预览；这些显式退出会立即隐藏并重置蓝图卡显示状态，但保留未清除的内部蓝图。切换到另一平面时暂停隐藏，返回蓝图来源平面后恢复。
- 纯规划器基于不可变结构蓝图和只读世界快照分批计算。目标、蓝图或平面变化会取消旧任务；发布前复核涉及的格子、实体数量、唯一标记和资源，变化时自动重试一次，不发布部分结果。
- 每座蓝图建筑只使用一个最严重状态：绿色为空且规则允许；黄色要求相同原版实体 ID、结构配置和完整足迹完全一致；红色表示可删除的占用冲突；紫色表示唯一建筑冲突、不可破坏对象、Cube 或不支持的内容。
- 为每个建筑创建不加入世界的原版临时实例，并在 World Editor 专属 Render API 缓存图层调用现实的 `renderColored` 或虚空的 `darkrenderColored`。预览按当前投影后的纵向位置稳定排序，位于原版世界上方、选区和手柄下方。
- 缓存图层只在正式计划、镜头投影、缩放、平面或画布尺寸变化时清空并重绘；固定目标的静止帧保留现有像素，不再逐帧调用全部原版实体渲染。未发生上述变化时，预览建筑动画保持静止。
- 鼠标连续移动时，专属缓存画布按“最新目标投影 − 正式计划目标投影”使用 CSS 位移跟随，不重新规划或调用原版建筑渲染。画布与 CSS 尺寸比例只在真实重绘或窗口 `resize` 时测量并缓存；纯目标跟随和相机平移不再逐帧读取合成层布局。建筑、轮廓、状态符号和已开启的 Include Cells 空地/拆除/保护叠层作为同一缓存画面保持空间对齐；新目标的准确计划发布前不会单独清空同步叠层。
- 跟随期间沿用上一份正式状态，画布仅调整为 `85%` 透明度，不再对全屏缓存层应用饱和度滤镜；卡片显示现有多语言“正在计算”，避免把暂存四色表达为准确结果。暂存与准确状态只对透明度执行 `80 ms linear` 过渡，CSS 位移不参与过渡。停止移动 `100 ms` 或点击固定会立即规划最终目标；准确结果发布并重绘后清除 CSS 位移和暂存透明度。已经固定的目标不属于暂存跟随：Include Cubes/Surges 等图层开关触发重算时，旧准确缓存保持 `opacity: 1`，直到新计划原子替换，避免固定预览在 `1 ↔ .85` 之间闪烁。
- 活动预览层稳定保留 `will-change: transform`，退出预览时清理；`transform`、透明度、transition 和合成提示只在目标值实际变化时写入，避免相同样式逐帧重复提交。
- 高频目标变化不重建类型和资源 DOM；卡片位置仍按最新目标逐帧跟随。资源行只在正式计划、资源持有量或语言变化时重建，逐目标成功日志不再写入运行日志。
- 四级状态同时使用着色、轮廓线型和状态符号，不只依赖颜色。单个原版着色渲染失败时仍绘制完整足迹轮廓，不中断其他建筑。
- Build Plan 只计算绿色可建造建筑；黄色已满足建筑不产生花费，红色冲突和紫色阻挡建筑排除。Overwrite Plan 已移除。
- 成本模拟复制原版 `priceExponent` 动态价格，只修改克隆的建筑数量与资源数组。价格缺失时明确标记结果不完整，不伪造总计。
- 固定目标每 `500 ms` 复核计划 guard。足迹实体、相关实体数量或 only-one 标记变化会请求一次完整重规划；单纯资源持有量变化只替换 Build Plan 的 `owned`、`shortfall` 和 guard 资源快照，复用现有 records、状态、需求、类型成本和预览实例，不 dirty 或重绘预览图层。
- 3E 起预览不再创建独立卡片；四级数量、Build Plan 总成本和各建筑类型的实际建造数量/分类花费合并到来源蓝图卡片。跟随时整张卡片鼠标穿透，固定后恢复交互，并自动避让选区卡片。
- 所有新增可见文本、警告、工具提示和无障碍名称覆盖现有 20 种语言、支持运行时切换，并使用原版 `Montserrat` 字体。
- 3B 仍不创建、删除或移动任何世界实体，不扣除或返还资源，不修改存档、原版脚本、ModLoader 或冻结旧版。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.blueprint-preview')].snapshot()
await globalThis[Symbol.for('cattail.world-editor.blueprint-preview')].benchmark()
```

`snapshot().performance` 和 `benchmark().runtime` 提供目标变化、实际规划、缓存层重绘和视觉跟随计数，便于比较固定与移动预览的运行成本。固定目标的周期完整性检查另提供 `integrityChecks`、`integrityGuardCells`、`integrityGuardCellChecks`、`lastIntegrityMs`、`maxIntegrityMs`、`lastIntegrityReason`、`resourceRefreshes` 和 `integrityRefreshes`；`resourceRefreshes` 只表示资源成本轻量刷新，`integrityRefreshes` 才表示结构失效触发的完整重规划。

## 3C 多选视觉右角锚点

- 捕获时先合并所有选区的逻辑范围，得到整体外包矩形；离散多选之间的未选中空格也属于外包范围，因此锚点允许落在未选中的格。
- 使用捕获瞬间的 `game.uvToXY()` 投影外包矩形四个角格及四条边，选择中点屏幕 X 最大的最右侧边，再从该边两个端点中选择屏幕 Y 更大的下端点。边中点 X 相同时选择中点 Y 更大的下侧边；端点 Y 仍相同时选择屏幕 X 更大的点。
- `uvToXY()` 缺失、抛错或任一角返回无效坐标时，使用逻辑下右角 `[maxU, maxV]` 作为确定性后备。
- 建筑足迹即使跨越选区边界，也不扩展锚点外包矩形。锚点捕获后保持不变，后续镜头移动、缩放和预览不会重新解释蓝图相对坐标。
- 新捕获蓝图使用 `schemaVersion: 2`，并在 `anchor.selectionIds` 中按数值升序记录所有参与选区 ID。schema 1 的旧结构蓝图仍可由 3B 预览规划器读取。
- 蓝图会话和 manifest 版本为 `0.3.2`。3C 不新增可见文本、翻译键或 UI 控件，不改变现有 20 语言运行时切换和原版 `Montserrat` 字体合同。
- 3C 仍是只读捕获与预览功能，不创建、删除或移动世界实体，不修改资源、存档、原版脚本、ModLoader 或冻结旧版。

## 3D 只读蓝图旋转与镜像

- 支持顺时针 90°、逆时针 90°、固定逻辑 U 轴镜像和固定逻辑 V 轴镜像。命令严格按点击顺序组合；最终状态规范化为旋转角度和 U/V 镜像选中态，旋转后选中轴可能在 U/V 之间交换。
- 变换中心来自全部选区相对坐标的整体外包矩形中心。半格中心向 `maxU/maxV` 方向取整，并在绑定源蓝图时固定；连续操作不会重新计算或漂移。
- 同步变换实体位置、完整足迹、选区起终点/边界和内容边界。锚点继续保持原 schema 2 数据，结构配置和限制对象复用不可变源引用。
- 原始会话蓝图、`exportJSON()` 和系统剪贴板保持不变。完整蓝图在当前非创造模式下只生成不含 Cube 和运行状态的结构投影；没有结构实体时不显示预览或信息卡。
- 非创造模式下玩家工具栏只显示结构模式并隐藏完整模式和 Cube 控件；4A-2a 创造状态安全就绪后才显示这些控件。程序化 `setMode('full')` 与完整捕获合同继续保留。
- 工具栏和蓝图信息卡同时提供顺/逆旋转、U/V 镜像和重置图标。默认热键为 `R`、`Shift+R`、`M`、`Shift+M`；文本输入、弹窗、组合修饰键和按键重复不会触发。
- 预览目标跟随鼠标时整张蓝图信息卡和可见选区卡都持续穿透，鼠标越过任一卡片都不会中断目标跟随；变换使用工具栏或热键。目标永久固定、按 Alt 临时固定或进入放置命令锁定后不再强制选区卡穿透，蓝图信息卡按钮和滚动也恢复交互。信息卡自身的长期显示固定状态继续保留。
- 固定目标每次变换立即取消陈旧计划并只请求一次新计划；跟随目标保留旧缓存画面，并在停止 100 ms 后只规划一次。变换不在每帧、鼠标移动或规划器内部重复计算。
- 相机纯平移与蓝图目标跟随共用缓存画布的 `translate3d` 位移，右键拖动期间不重绘全部预览实体、不重复测量合成层布局，松开后只做一次最终重绘。画布尺寸、缩放、平面或投影基向量变化仍会使缓存失效并真实重绘。
- 五个默认图标由集中式 CSS 图标工厂生成；`assets/icons/.gitkeep` 预留未来模组内贴图入口，静态映射为空或图片加载失败时回退 CSS。
- 新增文本覆盖现有 20 种语言、支持运行时切换，并使用原版 `Montserrat` 字体。
- 3D 仍不创建、删除或移动世界实体，不扣除或返还资源，不写存档，也不修改原版脚本、ModLoader 或冻结旧版。

## 3E 蓝图预览信息与交互打磨

- 蓝图来源信息和 Placement Preview 合并为一张会话卡片，内容顺序为来源/捕获状态、预览状态与警告、变换控件、四色状态、Build Plan 总成本、捕获类型、跳过类型和操作提示。预览控制器只发布状态，不再挂载第二张 DOM 卡片。
- 完全移除 Overwrite Plan、退款和方案切换。单一 Build Plan 继续使用 3B 已验证的原版 `priceExponent` 顺序成本计算，只统计当前绿色可建造记录。
- 总成本固定在捕获类型滚动区域上方。每行显示原版资源贴图、运行时本地化资源名和 `花费/总资源 -缺少`；数字使用原版 `game.makeReadable()`，无缺口时不显示负数。原版贴图不可用时才使用资源色降级方块。
- 捕获类型行保留捕获数量，并增加该类型本次实际建造数量和分类成本；已满足类型明确显示无花费。总成本和类型成本共享同一份规划结果，不重复模拟。
- 类型列表和资源列表使用与 Mod 管理菜单一致的 `4px` 极简滚动条、透明轨道和悬停反馈。
- 左右 `Alt` 按住期间临时固定当前目标，松开后恢复跟随并只同步一次最新悬停格；窗口失焦会释放临时状态，但不会再退出或清除仍在跟随的蓝图预览。临时固定期间卡片可交互，点击地图会升级为永久目标固定。
- 卡片背景点击只切换卡片自身的常驻显示，不再固定或解除蓝图目标；绿色边框只表示卡片常驻。地图点击和 `Alt` 继续独立控制目标，目标固定状态通过卡片提示文字表达。
- 普通跟随且卡片未常驻时，蓝图卡在捕获、实际变换、固定或解除目标、平面恢复或出现警告/渲染降级后显示 `3` 秒并自动隐藏；普通鼠标逐格跟随、规划对象替换和 calculating 刷新不会重启计时。永久固定目标不会让卡片常驻：固定瞬间重新开始完整 `3` 秒计时，到期只隐藏卡片，蓝图目标与预览继续固定。鼠标悬停卡片时暂停剩余时间，移开后继续。
- 绿色卡片常驻始终显示并暂停倒计时。`Alt` 临时固定期间卡片始终显示，松开后恢复跟随并重新开始完整 `3` 秒计时。
- 绿色卡片常驻继续表示“卡片不自动隐藏”；取消常驻后才重新开始完整 3 秒计时。普通跟随的 3 秒到期只隐藏卡片 DOM，活动蓝图、规划、外框和缓存预览层继续运行；准确预览层显式保持 `opacity: 1`，不依赖卡片或 Render API 的空样式后备。
- 退出蓝图预览或按 `V` 退出 World Editor 时，无论是否正在规划或显示警告，蓝图卡都会立即结束拖动、解除常驻、清除临时倒计时并隐藏；重新进入编辑器不会自动显示旧卡片或恢复旧预览。内部蓝图仍保留，下一次新捕获才重新显示完整卡片。
- U/V 镜像图标统一顺时针旋转 `45deg`。顺/逆时针旋转图标保留既有左右映射，三角箭头位于圆弧断口的下端且箭尖背离圆弧线段；重置图标使用相同的下端反向箭头几何。顺/逆旋转和重置引起角度变化时，旧缓存画面围绕固定逻辑锚点按当前 UV 投影基向量执行旋转；每 90° 至少采样 8 个等角度区间，并通过 Web Animations 在 `160 ms linear` 内播放投影矩阵关键帧和淡出。镜像仍立即切换，不对每座实体插值。
- 鼠标悬停或键盘聚焦旋转、镜像和重置按钮时，独立的 `z=41` 缓存提示层在蓝图外框外显示两条约 `150°` 旋转弧或两条平行 UV 双箭头。主线使用原版字体灰 `#889`、`1.25 CSS px` 线宽、轻描边和约 `6 CSS px` 箭头；U 镜像提示显示在 V 方向两侧，V 镜像提示显示在 U 方向两侧。镜像双箭头端点严格使用对应外框轴向投影的两端，不再额外向外延伸。提示层只做 `100 ms` 透明度过渡，目标与相机移动通过 CSS 位移跟随，不重绘建筑缓存。
- 蓝图卡位置使用“目标格定位快照”：预览目标进入新游戏格时，记录当时变换后蓝图的内容外框并重新选择右/左/下/上位置。顺/逆旋转、U/V 镜像、重置及其新计划只刷新卡片内容，不改变卡片屏幕位置；永久固定、`Alt` 临时固定或解除固定也不会在目标格未变时触发跳动。相机平移/缩放和窗口变化仍重新投影当前定位快照，使卡片随画面移动并保持在视口内；下一次目标格改变时才采用最新变换后的外框。
- 原版独立 `surge` 浪涌实体在结构蓝图规划、占格分类和完整性 guard 中按空地处理，因此对应建筑保持绿色可建造并计入 Build Plan。真实放置会把目标足迹内的独立浪涌作为无退款、无售出统计的临时环境占用事务性移除；内部 undo 恢复实际拆除瞬间的浪涌状态，redo 再移除。目标外浪涌不受影响；其他不可破坏、自然或 Mod 实体不适用此例外。
- 顶部状态栏和工具栏是两个彻底独立的玻璃浮层：状态栏在上方，只显示品牌、当前模式、选区数、退出提示和显示模式切换；工具栏在下方，按“选区操作 / 未来历史入口 / 蓝图内容 / 蓝图库 / 变换 / 创造模式”分组。蓝图内容组包含 Standard Build、Complete Replica、Include Cubes、Include Surges、Include Cells 与 Clear active blueprint；相邻的蓝图库组包含 Generate Blueprint、Save to Library 与 Blueprint Library。选择工具作为隐式默认模式，不再占用可见按钮；Clear、Delete Selection 和 Cut 仍位于选区操作组。两栏水平居中、保持 `8 CSS px` 透明间隔，各自拥有独立背景、边框、圆角、阴影和内容宽度，不存在包围二者的共同外框；二者只共享现实/虚空主题、顶部锚点和连续 UI 缩放比例。创造模式始终位于工具栏末尾；蓝图内容、蓝图库与五个变换按钮分别挂载到独立 slot，不再依赖动态追加顺序。默认紧凑模式的默认按钮与功能组均使用透明无框表面，组内按钮之间不使用分隔线，只在不同功能组之间使用较长直线分层；玩家用词“普通建造 / 完整复刻”在紧凑模式不显示文字，继续使用 `▤` / `▦` 图标，当前项以 `3 CSS px` Hell Gem 第三深绿色底线表示而不绘制紫色背景。普通可用工具栏选项及状态栏显示模式按钮使用统一 hover 语言：圆角淡灰 `rgba(150,154,160,.18)` 反馈面，文字/图标使用原版粉色 `#b56b87`；创造模式与活动 Include Cubes / Include Surges / Include Cells 属于资源色玻璃例外，hover 继续增强 Hell Gem 透光、反射和同色发光，不被淡灰/粉色覆盖。普通紫色活动态在移开鼠标后恢复，普通建造/完整复刻在 hover 时仍保留深绿色底线。大卡片惯性滚动期间继续临时抑制经过鼠标下方的普通 hover，停止后立即恢复。空间不足时只在完整功能组之间换行，不隐藏按钮、不横向滚动或裁切；窄于 `520 CSS px` 时隐藏状态栏中的品牌与退出提示，但保留模式、选区数、显示模式切换和全部操作。选区卡宽度限制为 `230–320 CSS px`，蓝图卡限制为 `270–372 CSS px`，两张卡最高均为 `68vh`。窗口变化会立刻重新约束尺寸并按 `10 CSS px` 视口边距定位。
- 状态栏模式只跟随现场实际可见的活动蓝图预览：预览必须为 `active && !paused && target && blueprint`，无论跟随鼠标尚未固定，还是永久/临时/命令固定，均按当前执行视图显示完整 20 语言的“普通建造”或“完整复刻”。仅会话或蓝图库中保存着蓝图、跨平面暂停、尚无目标或已经退出预览时显示 Selection Mode。创造模式安全状态开启时，当前模式文字使用 Hell Gem 第三深绿色 `#4CB96B`（或游戏当前资源三色的第三色），并叠加由当前 Hell Gem 三色组成的近、中、远三层柔和文字外光；关闭后文字色和 `text-shadow` 一并恢复当前现实/虚空主题普通状态。
- 状态栏右侧的横线/网格分段按钮可在默认紧凑模式与大卡片模式之间热切换；选择会写入 `largeToolbarCards`，ModLoader 设置页也可预览、取消回退和持久化该布尔配置。大卡片模式始终单行，每张功能卡为稍宽的 `120 × 112 CSS px`，视口最多完整显示 8 张；工具栏宽度上限直接使用游戏可用布局宽度，不受较窄状态栏内容宽度反向限制，不足 8 张时按实际可用卡片收缩且不留空槽。无选区时隐藏清除与生成蓝图，非创造状态隐藏完整复刻和 Cube/Surge；Include Cells 只在当前蓝图确实带空地掩码时显示，普通建造与完整复刻均可使用。Clear active blueprint 与蓝图卡右上角 Clear 共用同一 `session.clear()` 路径：只要会话中仍有源蓝图、执行蓝图、最近捕获结果或正在捕获就显示；即使先按 Esc 仅退出预览，内部蓝图仍保留时也继续可用。点击后清除内部蓝图、预览、变换、临时层开关和卡片结果，但不清除已提交选区，也不退出 World Editor。无活动普通建造蓝图预览时隐藏变换，恒等变换隐藏重置；短时忙碌操作保留禁用卡，后续卡片自然补位，空组不占空间。卡片与玻璃外框四周保留 `6 CSS px` 间隔，面板恢复 `12 CSS px` 圆角；功能组分隔线在上下各缩进 `8 CSS px`，选项分隔线在上下各缩进 `16 CSS px` 并以 `2 CSS px` 中段向上下两端逐渐收细，每个选项的可见表面再与分隔线保留 `4 CSS px` 横向距离。独立蓝图库组是明确例外：Generate Blueprint、Save to Library 与 Blueprint Library 三张卡之间不绘制选项短线，只在该组左右边界沿用其他大类相同的长分隔线。普通选项表面透明并与工具栏玻璃背景融为一体，悬停和激活时才显示反馈底色。卡片使用居中两行短标签、约 `48 CSS px` 的中性淡灰背景图标；普通建造/完整复刻的活动卡同样只显示 `3 CSS px` Hell Gem 第三深绿色底线，其他常规活动态沿用紫色，创造模式活动态沿用地心晶体黄绿色。生成蓝图使用加号，Include Cubes 使用三个等边菱形面的等轴立方体，Include Surges 使用 `currentColor` 绘制的单色闪电，Include Cells 使用 Include Cubes 顶面比例的单个等轴菱形，Clear active blueprint 使用与蓝图卡 Clear 一致的单色叉号，清除所有选区使用橡皮擦，Delete Selection 使用镐子；图标在紧凑与大卡片模式保持一致。Include Cubes 画布、Include Surges 闪电、Include Cells 菱形与 Clear 叉号都清除按钮默认内边距并按按钮几何中心对齐；大卡片模式会把这些图标放入现有的淡灰低透明背景图标层。未开启 Include Surges 时沿用普通图标颜色及淡灰底/粉色图标 hover，开启后才使用 Hell Gem 玻璃活动态。删除与剪切卡片短标签分别使用完整本地化的“Delete Selection”和“Cut”语义。
- 大卡片超过 8 张时，鼠标滚轮与触控板横向增量只在工具栏范围内转为横向速度并阻止穿透到游戏缩放。整段滚轮手势统一只累加横向速度，不在事件发生瞬间直接改写位置；完全静止后的第一格和后续同方向输入都从下一动画帧开始按速度移动。停止输入后通过 `requestAnimationFrame` 保持冰面式自由滑行，每帧速度保留系数为 `.94`；只要绝对速度仍高于 `0.01 CSS px/ms` 就绝不吸附，速度衰减到实现意义上的零后，下一帧才开始约 `400 ms` 的三次方 `ease-in` 吸附。滚动器独立保留连续浮点逻辑位置；浏览器 `scrollLeft` 继续负责裁切和边界，被设备像素量化掉的不足一格残差通过大卡片功能组的 `translate3d` 合成层补齐，因此低速滑行和吸附不会再以约 `2/3 CSS px` 的停顿/跳格显示。吸附从静止缓慢启动并持续加速，直到动画末帧自然抵达最近的 `120 CSS px` 整卡边界；此时逻辑位置、实际滚动位置和合成残差同时归整，不会在中途直接设为目标。新的滚轮输入会立即取消吸附并重新进入自由滑行。活动惯性、等待归零或吸附尚未结束时若滚轮立刻反向，旧方向速度先清零并从静止建立新方向速度；即使旧方向刚抵达首尾硬边界，也会保留最后运动方向来识别反转，避免从 `240 → 140` 或 `0 → 100` 的整格跳跃。起止位置硬限制且不回弹。左右渐隐和小箭头只在对应方向仍有内容时显示，不可点击也不占卡片空间。模式、可见卡集合、窗口/UI 缩放变化、取消和卸载都会取消动画、清零合成残差并重新限制到完整卡片。
- 大卡片滚动轨迹探针通过 `globalThis[Symbol.for('cattail.world-editor.toolbar-scroll-probe')]` 暴露，常驻保存最近 480 条只读样本，不创建面板也不改变滚动结果。`clear()` 可在复现前清空，`snapshot()` 返回逐帧时间、浏览器实际位置、连续逻辑/视觉位置、量化残差、速度、阶段、输入、吸附目标、刷新原因、原生滚动漂移和悬停目标变化；位置样本同时保留 `logicalBefore / logicalDelta / quantization / residual`。`analyze()` 汇总异常，`report()` 同时在控制台输出汇总与表格。`refresh` 样本同时标记 `layoutChanged` 与 `interrupted`；只有真实布局变化打断活动轨迹时，汇总原因才会标记为 `refresh-interrupted-motion`。
- 实机探针确认周期性的 `blueprint-transform` 刷新会在布局未变化时打断滑动。滚动器现在保存由工具栏模式、卡片可见集合、内容宽度和滚动几何组成的布局签名：签名不变的 `selection / creative / blueprint-transform / ui-scale` 刷新只更新指示状态，不取消动画或改写位置；卡片增删、可用宽度、模式或真实滚动几何变化仍取消并吸附到安全整卡边界。活动滑动期间工具栏标记 `data-scrolling="true"`，普通未激活卡片暂时不显示 hover 底色和颜色过渡，避免固定鼠标下方的卡片更替造成闪烁；停止后自动恢复 hover，激活态始终保留。
- 工具栏和蓝图卡按 `clamp(0.5, min(availableWidth / 1600, availableHeight / 1000), 1)` 连续整体缩放，字体、图标和按钮随容器同比缩放；可用尺寸取窗口、游戏画布及其非页面级父容器的有效最小值。`ResizeObserver` 主动监听游戏画布/容器，窗口 `resize` 作为后备。工具栏的未缩放布局宽度会反向补偿，避免过早换行；选区卡保持原尺寸。
- 蓝图标题行内显示结构模式和选区数量，来源文字在窄窗口下换到第二行，清除按钮保持右侧。跨边界数量作为第五个标准状态项进入可建造/已满足/冲突/阻止区域；Build Plan 与捕获类型成本数字改用原版 `Montserrat` 的 `400` 字重。
- Build Plan 与已捕获类型通过公共折叠/调高控制器独立管理；标题按钮、双线箭头、展开状态、ARIA、上下 `10 CSS px` 调高手柄、指针捕获和 `160 ms ease-out` 过渡与产量分类完全共用。拖动位移会除以当前 UI 缩放比例，保证 50%–100% 下手感一致。Build Plan 高度限制为 `44px–35vh`，已捕获类型限制为 `60px–45vh`，折叠状态与偏好高度在当前页面生命周期内保留。
- 选区卡和蓝图卡各自复用 Dynamic Details 的透明度合同：鼠标位于可见卡片范围内时，按住 `Z` 滚轮向上/下以 `10%` 步进增加/降低透明度，范围为 `25%–100%`；中键在“文字、图片和按钮跟随背景一起淡出”与“内容保持完整可见、只淡出背景/边框/阴影”之间切换。
- 选区卡组与蓝图卡组的透明度和内容模式互相独立，并分别写入 `localStorage`；重新加载页面、重载 Mod 或重新进入游戏后会恢复各自的透明度与中键内容模式。缺失或损坏值回退到 `100%` 和内容联动，越界透明度限制在 `25%–100%`。控制器按实际屏幕矩形和层级命中鼠标下方卡片，因此卡片处于选择操作或蓝图跟随的鼠标穿透状态时，只有 `Z + 滚轮`和中键会被接管，普通左键、右键和滚轮仍遵循既有地图输入合同。
- 两张卡标题行使用与 Dynamic Details 相同的本地图标提示；悬停提示、辅助名称和当前内容模式覆盖 20 种原版语言并使用原版 `Montserrat` 字体。
- 所有新增可见文本、提示和无障碍名称覆盖现有 20 种语言并支持运行时切换，字体继续使用原版 `Montserrat`。
- 3E 保持只读边界，不执行放置、删除、覆盖、资源扣除、存档写入或 `Ctrl+V`。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.blueprint-transform')].snapshot()
globalThis[Symbol.for('cattail.world-editor.blueprint-preview')].snapshot()
```

## 3F 生产数据消费层

- `production-state.js` 通过全局 Symbol 软依赖 Dynamic Details 0.1.1 的 `cattail.dynamic-details.production-telemetry` API；依赖未安装、未就绪或暂时失效时只发布不可用状态，不阻止 World Editor 的选区和蓝图流程。
- World Editor 激活且已提交选区统计完成时，每 `1000 ms` 对当前去重建筑引用调用一次 `snapshotEntities(entities, { theoretical: false, supplemental: true })`。选区扫描中、无选区或编辑器退出时不保留刷新定时器。矿井专用的 `pumpMining / instantaneous` 按当前工作状态、转速和深度资源分布映射为矿井实时实际输出，不用理论产量补零，也不与资源入账事件重复相加。
- 蓝图捕获只在结构记录接受实体后执行一次完整 `snapshotEntities(entities)`，把理论产量、捕获瞬间的 30 秒实际产量、数据质量、采样时长、不支持计数、截断状态、分类数据和 `pumpMining` 补充通道规范化为深度冻结快照。
- 3F 引入的 `production` 字段继续保留；当前新结构蓝图由 4C-1c 使用 schema 4，新完整蓝图仍使用 schema 3。旋转、镜像和非创造模式的完整蓝图结构投影保持同一份不可变生产快照；预览规划器兼容 schema 1、2、3 和 4。
- 选区主卡默认展开实际总产量；蓝图主卡保存理论总产量和捕获时实际总产量。总输出、消耗、净值、数据质量和不支持计数只放在各自主卡中，两张主卡的标题行都提供三线产量按钮。蓝图主卡内容顺序为“产量 → 已捕获类型 → 建造方案 → 已跳过类型”。
- 选区和蓝图产量副卡只显示按建筑类型明细。建筑按总输出降序、总消耗降序、本地化名称排序；有资源流的建筑持续显示资源图标、资源名、输出、消耗和净值，没有资源流的建筑归入默认收起且保留会话展开状态的分类。无流量建筑 DOM 在分类收起时仍持续更新，并通过建筑组估算和挂载后下一帧重测保证展开高度；蓝图中的无流量分类切换会在列布局同步后，从外层当前内容减去内层当前可见高度取得稳定基线，再按目标状态加上完整内层高度或保持基线，避免动画起始几何把外层 `max-height` 双向写反。理论/实际产量、建筑类型、建造方案、已捕获类型及没有资源流分类现在共用产量分类的按钮对齐、正文色箭头、展开状态控制器和上下调高手柄；拖动偏好高度在当前页面生命周期内按分类保留，嵌套无流量分类仍通过外层高度投影钩子同步。选区卡、蓝图卡、蓝图内部列表、产量卡和拖高正文统一使用共享的 4px 半透明灰色滚动条及悬停色；蓝图内部列表单独保留稳定 gutter。单列内容超过可用高度且宽卡能放入视口时自动改为两个按实际高度平衡的独立纵向列，否则保持单列。
- 选区和蓝图各自使用仅限当前页面会话的 `s / min / hr` 三档滑动条。蓝图的共享滑动条只挂载在第一个展开的总产量区：理论优先，否则使用捕获实际，两区都收起时隐藏。滑块沿用 Mod 菜单的连续拖动逻辑，松手、轨道点击或键盘操作后以 `160 ms ease-out` 动画吸附到最近档位；数值统一从每秒基准换算，不修改遥测快照。资源使用原版运行时资源贴图和本地化名称，建筑类型使用原版商店贴图。
- 选区卡常驻状态与蓝图卡使用相同的独立绿色 `border-color + box-shadow` 逻辑；绿色只作用于边框和外光，不再把绿色渐变作为背景层，因此降低卡片透明度时不会染绿卡片内部。
- 选区主卡/选区产量副卡和蓝图主卡/蓝图产量副卡分别组成两个互相独立的透明度组；组内 `Z + 滚轮` 与中键内容模式同步变化。两张副卡都跟随各自主卡的 HUD 生命周期、自动隐藏、固定、鼠标穿透、主题和视口定位状态。卡片进入输入穿透时，内部可调高分类的上下调整线也同步停止接收鼠标；退出穿透后自动恢复。计时结束或蓝图预览退出触发自动隐藏时，同组主副卡同步执行 `160 ms ease-out` 淡出并向下移动 `4px`，开始时立即停止接收输入，结束后才清除可见性；主动关闭、HUD 隐藏和退出编辑器仍立即隐藏。右键平移从世界画布开始后，四张卡及其内部调整线在本次按压周期内临时穿透，鼠标越过卡片不会中断平移；右键若从卡片内开始则仍只交给卡片，不启动地图平移。
- 蓝图主卡的三线统计按钮位于关闭按钮的直接左侧。World Editor 的工具栏、蓝图、产量、分类、滑条和可聚焦卡片统一不绘制浏览器键盘焦点边框；控件仍可通过键盘操作，选中、展开、固定和禁用状态视觉保持不变。
- 选区主卡相对选区优先放在右侧，空间不足时依次尝试左、下、上，并避让当前可见的蓝图主卡和蓝图产量副卡。
- 16 个生产界面文本覆盖现有 20 种原版语言并支持运行时切换；所有生产界面继续使用原版 `Montserrat` 字体。
- 3F 仍是只读消费层，不创建、删除、移动或放置实体，不请求或扣除资源，不写存档、原版脚本、ModLoader 或冻结旧版。自动验证完成后必须等待游戏内验收，才可提交 `0.3.5`。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.production')].snapshot()
globalThis[Symbol.for('cattail.world-editor.blueprint')].snapshot().blueprint?.production
```

## 4A-2a 创造模式安全基础

- 创造模式状态按存档保存在 `save.modloader.worldEditor`，并通过独立的 `cattail.world-editor.creative-mode` 控制器发布。缺失、损坏或未知 schema 的旧存档默认保持关闭。
- 顶部工具栏明确显示创造模式开关。开启时可以直接切换当前存档，也可以通过 Better UIs 创建独立创造副本；关闭时恢复正常材料消耗，现有建筑与蓝图不会删除。
- 工具栏的已开启状态及创造模式开启/关闭窗口使用原版地心晶体的黄绿色强调色；名称输入框取得焦点时也使用同一黄绿色反馈。
- 开启窗口只负责选择“在当前存档中开启”或“创建创造副本”。只有选择创建副本后才进入独立的名称输入与存档槽校验窗口，空名称提示只显示一次。
- 在独立命名窗口点击“取消”、按 `Escape` 或点击窗口外遮罩会返回上一层开启方式选择窗口；不会直接退出整个开启流程。
- 直接切换保留当前 `saveInstanceId`。状态只有在原版保存完成、活动存档可重新解码且谱系 ID 未变化后才会发布成功。
- 创建创造副本只要求一个空闲 Better UIs 手动槽，并且只创建一个创造模式副本；不会再额外创建普通模式原备份。创造副本严格使用 `基础名称 + 创造模式`，不会覆盖已有槽或创建同名创造副本，当前活动存档不会被复制到另一个手动槽。
- Better UIs Save Slots Service v1 在一次事务中只发布并复读验证这个创造副本槽，然后激活它；reload 前失败会恢复手动槽、活动存档和 pending marker。
- 创造副本初始载荷不继承原 `saveInstanceId`。reload 后由 ModLoader 生成新 ID，Better UIs 再把包含新 ID 的活动载荷回填到命名的创造手动槽，确保以后重载继续使用同一创造谱系。
- 原版存档编码直接使用 `btoa()`，因此 Unicode 槽名只保存在 Better UIs 槽位外层；World Editor 存档字段仅包含 ASCII 键和值、布尔值和数字。
- 创造弹窗或存档事务进行期间，World Editor 会暂停地图指针输入及游戏键盘操作；非忙碌窗口可按 `Escape` 或点击窗口外遮罩取消。名称输入框仍保留正常文字编辑。
- 只有创造状态持久化和必要的谱系回填完成后，蓝图工具栏才显示完整模式与 Cube 控件。关闭创造模式会立即回到结构模式，但不会删除已经捕获的完整蓝图数据。
- 4A-2a 不执行免费建造、升级、删除、搬迁或蓝图放置，也不新增其他世界写入。原版商店免费经济和异步写前快照协调属于 4A-2b；undo/redo 仍属于 4A-3。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.creative-mode')].snapshot()
globalThis[Symbol.for('cattail.better-uis.save-slots')]?.snapshot()
```

## 4A-2b 创造模式免费商店经济

- 创造模式下，原版商店的普通建造、升级、橡皮擦删除和搬迁均不消耗资源；升级与删除也不发放退款。普通模式继续使用原版同步结算。
- 免费经济只存在于一次已经完成写前快照和目标重验的商店事务中。机器运行、资源补充、生产、Cube 操作、自动世界事件和其他非商店价格消费者保持原样。
- 每次有效世界写入先用 `game.assembleSave(true)` 创建一份物理安全快照，再重验格子、实体、平面、创造状态、运行时和存档身份。快照失败或目标变化时不会执行世界写入。
- 快照等待期间只阻止新的商店/编辑器写入；相机和非写入菜单仍可使用。快速重复输入不会排队，也不会创建第二份快照。
- 鼠标、游戏手柄、桌面触控和移动端独立触屏路径共用同一事务协调器；搬迁仍调用当前完整 `processClick()` 补丁链，以兼容 Gradient 搬迁修复。
- 解锁、唯一建筑、不可破坏实体、Cube、平面、最后一个 Pump/Gradient 和搬迁类型等原版限制继续生效。
- World Editor 配置 `创造模式购买花费显示` 默认关闭并支持 hot 预览：
  - 关闭时，原商店、Better UIs 分类商店及鼠标旁的购买/升级/橡皮擦花费提示为空。
  - 开启时，显示关闭创造模式后当前完整 Mod 补丁链会计算出的参考花费；实际结算仍免费。
  - Dynamic Details 的购买倒计时及升级/删除退款提示在创造模式中始终隐藏。
- 独立顶部状态胶囊会显示快照、重验、执行、成功、取消和失败状态，即使世界编辑器当前未激活也可见；它仍跟随原版 HUD 隐藏规则。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.creative-economy')].snapshot()
globalThis[Symbol.for('cattail.world-editor.creative-mode')].snapshot()
```

4A-2b 不包含蓝图真实放置、世界编辑器删除/剪切/移动、undo/redo、快照恢复或导入界面。

## 4A-3a 内部事务引擎

- `cattail.world-editor.transactions` 提供会话内的事务适配器、写前物理快照、二次预检、结果验证、失败回滚以及最多 50 项的内部 undo/redo 历史。
- 一次完整编辑器命令对应一条事务。事务记录只保存冻结的纯数据、精确 guard scope、before/after 状态、资源与统计增量以及快照 ID，不保存 DOM、实体对象或整份存档。
- forward、undo 和 redo 都必须在任何世界写入前创建物理快照。快照失败或目标在等待期间改变时不会执行写入；apply 开始后的失败必须恢复操作前状态，恢复失败会阻止后续事务直到重新载入。
- 外部变化检查只比较适配器声明的危险状态；不会比较带时间戳的整份存档，也不会把正常生产得到的资源或累计统计恢复成旧绝对值。
- 4B-1a 现已注册结构蓝图放置适配器；4B-1b 通过同一事务服务提供玩家可见的撤销/重做按钮与热键。4A-2b 的原版商店操作不进入编辑器历史。
- 4A-3a 的冻结基础本身不修改原版、ModLoader、Better UIs、配置、翻译或现有 UI。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.transactions')].snapshot()
```

完成 4B-1a 加载后，`registeredKinds` 应包含 `blueprint-placement`；在第一次成功放置前，`undoCount` 和 `redoCount` 仍应为 `0`。

## 4B-1a 结构蓝图安全放置

- 仅支持 `mode: "structure"` 的结构蓝图，不恢复完整蓝图的 Cube 或内部运行状态。
- 永久固定和按住 Alt 的临时固定都可使用蓝图卡片中的“放置蓝图”按钮；`Ctrl+V` 无需预先固定，会捕获按键时的 `game.hoveredCell`、临时锁定该命令目标、重新规划并放置，随后恢复此前的跟随/临时固定/永久固定状态。
- 放置事务始终重新构建计划，不信任界面缓存。绿色建筑进入最终建造集合，黄色与紫色跳过；红色冲突每次放置只询问一次，默认焦点为“跳过红色冲突”，也可选择“拆除并替换”全部安全红色冲突。
- 除上述独立 `surge` 空地例外外，动态、不可破坏、未知 Mod、Cube、正在搬迁、Pump/Stabilizer 与 Cube/Surge 关联或缺少明确恢复适配的冲突不会被删除，而会降为紫色 `unsafe-replacement`。
- 普通模式按确定顺序模拟并结算当前橡皮擦成本、50%/90%/100% 退款及逐个建造价格；每一步都必须可负担。创造模式不扣款、不退款，也不产生零资源转移动画。
- 一次放置只创建一条事务和一份写前 Snapshot。没有任何最终建筑时不会创建 Snapshot；apply 开始后的失败会本地回滚，完整恢复失败则由 4A-3a 锁定后续事务并要求重载。
- 内部 undo 会移除本次新建筑、恢复被替换建筑、精确反转本次资源和 `machinesBuild` / `machinesSold` 增量；若撤销需要收回净资源收益但当前资源不足，则返回 `INSUFFICIENT_RESOURCES`，不修改世界且保留历史。
- 成功、取消和可恢复失败都会保留蓝图、变换和固定状态并立即重规划；终止性回滚失败会保留预览但禁用放置。
- 创造模式开关确认框和蓝图红色冲突确认框共用 `cattail.world-editor.dialogs` 的 DOM、主题、焦点陷阱、Escape、忙碌态和错误规则。
- 4B-1b 在不改变本阶段放置事务语义的前提下，提供玩家可见的 undo/redo 控件与热键。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.blueprint-placement')].snapshot()
globalThis[Symbol.for('cattail.world-editor.transactions')].snapshot()
```

4B-1a 不修改原版、ModLoader、Better UIs、其他 Mod、`enabled.json` 或归档旧版，也不包含完整蓝图放置、Cube 恢复、导入界面、玩家可见 undo/redo 控件、打包或发布。

## 4B-1b 撤销与重做控件

- 顶部工具栏的历史组位于选区操作之后、蓝图与变换之前，并直接使用 `cattail.world-editor.transactions` 的 `snapshot()`、`subscribe()`、`undo({ input })` 与 `redo({ input })`；不会创建第二套历史。
- 紧凑模式提供始终可聚焦的 `↶` / `↷` 30px 按钮。不可执行时使用 `aria-disabled="true"`、本地化工具提示和无障碍原因，但不使用原生 `disabled`，因此仍可聚焦并说明阻止原因。
- 大卡片模式提供两张 `120 × 112 CSS px` 的中性灰色撤销/重做卡。无历史、服务未就绪、平面/存档变化或终止锁定等长期阻止状态会隐藏并自动回流；事务忙碌时两张卡保持可见但不可再次执行。
- Windows 快捷键为 `Ctrl+Z` 撤销，以及 `Ctrl+Y` / `Ctrl+Shift+Z` 重做。监听位于捕获阶段；组合键只有在编辑器活动、非重复/输入法组合、焦点不在可编辑控件、启动画面隐藏、ModLoader 面板未阻挡且创造/经济/共享对话框未占用输入时才会被消费。通过全部守卫后，即使当前没有可执行历史，也会阻止浏览器默认行为并显示本地原因。
- 鼠标点击以 `mouse`、键盘激活按钮与快捷键以 `keyboard` 传给事务服务。本地忙碌锁覆盖事务 Promise 及成功后的预览刷新；忙碌期间不会排队或启动第二条命令。
- 只有 `result.executed === true` 才会对活动中的 `cattail.world-editor.blueprint-preview` 调用一次 `refreshNow('transaction-undo-complete')` 或 `refreshNow('transaction-redo-complete')`。预览未活动或控制器不可用不影响事务成功；预览刷新失败也不会把已完成的事务改写为失败。
- 工具栏下方、横向大卡片滚动区之外共用一个 `role="status"`、`aria-live="polite"` 的非模态状态胶囊。成功显示约 3 秒，可恢复警告和失败显示约 6 秒，忙碌持续到命令结束；`ROLLBACK_FAILED` 等终止锁定会持续显示到重新载入。
- 无历史属于中性状态；资源不足、外部变化、平面/存档/价格/经济状态变化、适配器或服务暂不可用属于可恢复警告；快照、预检、应用、验证和失效错误属于失败。若事务已经回滚，界面明确说明旧状态已恢复；回滚失败则要求重新载入。
- 所有新增按钮、卡片、状态、阻止原因、成功与失败文本覆盖现有 20 种原版语言，并随游戏语言切换即时刷新。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.transactions')].snapshot()
globalThis[Symbol.for('cattail.world-editor.blueprint-preview')]?.snapshot()
```

4B-1b 不修改事务引擎、蓝图放置适配器、预览控制器、原版、ModLoader、Better UIs、其他 Mod、`enabled.json` 或归档旧版，也不包含打包、发布或提交。

## 4C-1a 选区安全删除

- 顶部工具栏新增独立的“删除内容”命令，`Delete` 是对应快捷键；现有 `Backspace` / `×` 仍然只移除主选区边界，不会删除世界建筑。
- 删除目标是当前平面全部已提交选区的精确并集。重叠格和同一多格建筑会去重；建筑任一占格碰到选区就按整栋处理，并在确认框中单独显示跨选区边界数量。
- 每次实际删除前都会显示危险确认框，列出可安全删除数、受保护数、跨边界数和资源净变化。默认焦点是“取消”，`Escape` 或点击遮罩也会取消。
- `Cube`、不可破坏对象、未知 Mod / 无法序列化对象、正在搬迁的对象、带 Cube 的 Pump、带 Surge 的 Stabilizer，以及会导致 Pump / Gradient 家族全部消失的对象都会保留。其他安全建筑仍可在同一命令中继续删除。
- 普通模式按稳定的 `v → u → 名称 → 会话实体身份` 顺序逐项模拟和执行原版橡皮擦费用与动态退款；任一步资源不足就不会创建快照或写入世界。创造模式零费用、零退款。
- 确认后的事务仍会在物理写前快照之前和之后各重算一次选区、目标实体完整存档、创造/经济状态和价格。任何变化都会以零写入拒绝，不会使用过期确认结果。
- 一次命令只创建一份物理快照、一条 `selection-delete` 事务和一条 undo/redo 历史。应用或验证失败会完整回滚；回滚失败会终止锁定到重新加载。
- 成功删除、撤销和重做都保留全部选区，不倒带选区状态；删除会精确恢复/反转建筑存档、资源、`machinesSold`、`timeSinceLastDelete` 和 only-one 链，并刷新当前选区统计。活动蓝图预览刷新失败只显示警告，不改写已经成功的事务。
- 扫描每批最多 512 格且可取消；应用按小批次执行并在整个事务期间阻止新的编辑器写入。每次 forward/redo 删除只播放一次回收音效，不创建逐建筑资源飞行动画。
- 核心服务同时公开 `planSelections()`、`planRanges()` 和 `planCells()` 只读规划入口，供后续剪切和蓝图“同步空地”组合事务复用；4C-1a 本身不显示或执行任何同步空地 UI/行为。
- 所有新增按钮、确认、状态、警告和失败文本覆盖现有 20 种原版语言。自动验证完成后仍必须进行真实游戏验收。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.selection-delete')].snapshot()
globalThis[Symbol.for('cattail.world-editor.selection-delete')].diagnostics()
globalThis[Symbol.for('cattail.world-editor.transactions')].snapshot()
globalThis[Symbol.for('cattail.world-editor.analysis')].snapshot()
```

若删除没有生效，可在开发者工具 Console 中复制最近一次有界探针报告：

```js
copy(JSON.stringify(globalThis[Symbol.for('cattail.world-editor.selection-delete')].diagnostics(), null, 2))
```

探针最多保留 160 条内存事件，只记录 UI/事务阶段、计数、错误码、实体名称与坐标，不记录完整实体存档或资源数组；重载后自动清空。

4C-1a 不修改原版、ModLoader、Better UIs、其他 Mod、`enabled.json` 或归档旧版，不包含剪切、结构/完整蓝图同步空地、打包、发布或提交。

## 4C-1b 剪切为结构蓝图

- 选区工具栏新增独立“剪切内容”命令，快捷键为 `Ctrl+X`。它使用当前平面全部已提交选区的精确并集，并沿用 4C-1a 的重叠去重、跨边界整栋处理、保护对象、最后一个 Pump/Gradient、经济和事务守卫。
- 4C-1b 的基线剪切生成 schema 3 结构蓝图；从 4C-1c 起，新剪切结果升级为 schema 4 并附带空地掩码。Cube、完整运行状态、Mod/未知对象和其他受保护或跳过对象留在世界，也不会进入剪切蓝图。完整蓝图剪切继续留给后续 4D。
- 蓝图实体与世界删除实体来自同一份 `selection-delete` plan 的安全 removals，不会分别扫描并产生两套目标。没有安全目标时不打开危险确认、不覆盖剪贴板、不创建 Snapshot 或 history。
- 每次剪切都显示危险确认，列出将剪切、保留和跨选区边界的建筑数量及资源变化。已有蓝图时会提示确认后将替换当前蓝图和系统剪贴板；取消、`Escape` 或点击遮罩均没有副作用。
- 确认后先把候选结构蓝图写入系统剪贴板。写入失败时保留旧蓝图和世界；写入成功后，新蓝图立即成为当前预览，再由既有 `selection-delete` adapter 执行一次世界删除。
- 系统剪贴板无法加入游戏 Snapshot。若确认后的目标、价格、模式或资源变化，或删除事务被拒绝/回滚，世界保持或恢复原状，新蓝图仍作为“只复制、未剪切”（copied only）结果可用，并显示明确警告。
- 成功剪切只创建一个物理 Snapshot、一条 `selection-delete` 事务和一条 undo/redo history，并记录 `origin: cut`。普通模式沿用原版橡皮擦费用/退款，创造模式零费用零退款，forward/redo 每次只播放一次回收音效。
- 成功、失败、undo 和 redo 都保留全部选区。undo/redo 只往返世界建筑、资源、统计和 only-one；不会清空蓝图或回滚系统剪贴板。
- 活动蓝图预览不会阻止剪切；确认成功复制后会由新结构蓝图替换。输入框/IME、重复快捷键、选区 preview/move/resize、其他 dialog、事务 busy、splash 和 ModLoader 面板继续阻止剪切。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.selection-cut')].snapshot()
globalThis[Symbol.for('cattail.world-editor.blueprint')].snapshot()
globalThis[Symbol.for('cattail.world-editor.selection-delete')].diagnostics()
globalThis[Symbol.for('cattail.world-editor.transactions')].snapshot()
```

4C-1b 不新增事务 adapter，不修改原版、ModLoader、Better UIs、其他 Mod、`enabled.json` 或归档旧版，也不包含结构/完整蓝图同步空地、完整状态/Cube 恢复、打包、发布或提交。

## 4C-1c 结构蓝图同步空地

- 新复制和新剪切的结构蓝图使用 schema 4，`emptyCells` 是选区精确并集内真正没有任何实体的相对格坐标，并按 `v → u` 排序和去重。被 Cube、Mod/未知、受保护、跳过或跨边界建筑占用的格不会被误记为空地。
- schema 1–3 结构蓝图继续按原行为放置，但没有可同步的空地掩码；当前完整蓝图仍维持 schema 3 和既有行为，完整蓝图同步空地留给 4D。
- 旋转、镜像、会话复制和 JSON 导出会与建筑使用同一枢轴、矩阵和稳定顺序精确保留/变换 `emptyCells`。
- Include Cubes、Include Surges 与 Include Cells 都由顶部工具栏作为会话临时开关控制。Include Cells 只在当前蓝图带 `emptyCells` 时显示；三个开关默认关闭，开启后使用 Hell Gem 玻璃态并通过 `aria-pressed` 暴露状态，新加载/捕获/剪切蓝图或一次放置流程结束后恢复关闭，不写入蓝图文件、设置、存档或 Cloud。
- 放置不再打开 `Place full blueprint?` 临时层确认框，也不再显示 `Place stable Cubes` / `Place safe Surges` 选项或相关说明；预览规划与最终放置直接使用工具栏 Include Cubes、Include Surges、Include Cells 的当前状态。确认框只在目标确实存在冲突建筑时打开，并只保留“替换冲突建筑”选项；工具栏 Include Cells 与弹窗冲突替换仍形成四种内部组合，并共享确认前的一次只读扫描。摘要实时显示建造、拆除、保护、跨边界和资源净变化；有实际拆除时最终确认按钮变为危险色。
- 同步空地按整栋建筑处理：任一占格碰到变换后的空地掩码即成为候选。工具栏开关开启后，安全对象立即显示红色拆除叠层；Cube、不可安全恢复对象和最后一个 Pump/Gradient 家族对象保持紫色保护；跨掩码边界使用虚线整栋轮廓。蓝图跟随鼠标时，上一份叠层与蓝图缓存共同以 `85%` 透明度连续平移；停止 `100 ms` 后用新目标分析原子刷新，因而移动期间不再只显示蓝图而丢失空地预览。关闭工具栏开关或放置确认框会恢复对应预览。
- 冲突替换和空地同步命中的同一建筑按稳定会话身份去重。普通模式先逐项结算橡皮擦费用和退款，再结算建造成本；创造模式全部为零。每栋实体只更新一次删除统计、only-one 链和存档状态。
- 最终冲突拆除、空地同步拆除、临时 Surge 清理和全部建造合并到现有 `blueprint-placement` 的一份 Snapshot、一条事务和一条 history；不会创建独立删除事务。允许 `0` 建造加 `N` 次同步拆除；若四种选项结果都不改变世界，则不创建 Snapshot 或 history。
- 点击确认时先针对锁定计划刷新仅资源变化并重新生成当前精确 proposal；若建筑/拆除/保护集合、数量或玩家可见经济发生变化，窗口会更新并要求再次确认，不静默换目标。随后 prepare 重建计划，并重验确认时的选项签名、实体存档、平面/存档、价格、模式、资源、统计和 only-one；从点击确认到第一次 preflight 的漂移保持零写入拒绝。物理 Snapshot 的异步创建期间若只有资源余额自然变化，第二次 preflight 会改用最新余额重新检查可负担性并让 apply 以该余额为基准；目标、价格、统计、only-one 或不可负担变化仍会在写世界前拒绝。应用/验证失败完整回滚，回滚失败继续沿用事务引擎的终止锁定。
- undo/redo 只往返该条放置事务记录的世界、资源、统计和 only-one 状态，不回滚蓝图、剪贴板、工具栏临时开关或确认框按钮；一次放置流程结束后 Include Cubes、Include Surges 与 Include Cells 都恢复关闭。

4C-1c 保留最近 200 条定向 placement 环形诊断，但不再把每个事件主动写入 Console。需要排错时可通过以下命令按需导出：

```js
globalThis[Symbol.for('cattail.world-editor.blueprint-placement')].diagnostics()
```

环形诊断覆盖目标锁、只读分析、弹窗跳过/打开、按钮组合、确认签名、事务 prepare/preflight/capture/apply/verify/rollback、每栋建筑 `clearCell` 前后和最终执行结果。诊断只保存在内存中，不主动输出 Console，也不额外写入世界。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.blueprint')].snapshot()
globalThis[Symbol.for('cattail.world-editor.blueprint-preview')].snapshot()
globalThis[Symbol.for('cattail.world-editor.blueprint-placement')].snapshot()
globalThis[Symbol.for('cattail.world-editor.transactions')].snapshot()
```

4C-1c 不修改原版、ModLoader、Better UIs、其他 Mod、`enabled.json` 或归档旧版，不包含完整蓝图同步空地、完整状态/Cube 恢复、导入界面、打包、发布或提交。

## 4D schema 5 完整蓝图

- 新捕获的完整蓝图使用 schema 5；结构蓝图继续使用 schema 4。旧完整 schema 3 在内存中安全归一化后仍可查看和放置，但不会推断不存在的 `emptyCells`。
- 完整模式只在创造模式提供捕获和放置。退出创造模式不会删除、降级或改写当前完整蓝图；卡片、预览、旋转和镜像仍可用，并显示“完整蓝图 · 仅创造模式”锁定提示。
- 状态捕获采用原版 `getEntityString()` 结果的字段级白名单。绝对身份、对象引用、生成对象关系、运行时时间和其他不安全字段不会复制；`spawnedHollows` 等生成计数安全归零，Pump2 运行计时归一化。
- `Include Cubes` 只捕获和放置 `state === 2` 的稳定 Cube。生长、过渡、爆炸或仍连接 Pump 的活动 Cube 不进入蓝图；目标上的活动 Cube 和带活动 Cube 的 Pump 保持受保护。
- Hollow、Surge、Mod/未知对象和其他不支持对象会被跳过或保护；它们占据的来源格不会误记为蓝图空地。建筑任一占格碰到选区时按完整建筑捕获并记录跨界数量。
- Waypoint 不复制绝对时间戳，而是保存蓝图内部相对顺序；每次 forward/redo 放置生成不冲突的新时间戳。undo 恢复操作前目标的最新时间戳和顺序。
- 完整预览只有类型、占格、配置和全部归一化持久状态均一致时才显示黄色；同类型但状态不同显示红色，不能安全替换的目标显示紫色。
- schema 5 的 `emptyCells` 只来自真正没有实体的来源格。同步空地默认关闭并由顶部工具栏开关控制；放置弹窗不再提供该按钮。没有实际红色冲突时直接按工具栏状态放置，不显示冲突确认框。
- 完整状态替换、稳定 Cube、同步空地拆除和建造合并到现有单一 `blueprint-placement` 事务。普通生产进度或库存漂移可在物理 Snapshot 后以最新目标状态重定 undo 基线；身份、类型、占格、保护或操作集合变化仍会零写入拒绝或要求重新确认。
- undo/redo 沿用现有工具栏和 history，记录名为 `Full blueprint placement`。undo 恢复最新目标状态，redo 恢复归一化蓝图副本；当前蓝图、变换、固定和卡片状态不被历史操作清除。
- 默认 Console 保持静默；`diagnostics()` 的最近 200 条内存事件会额外记录 mode/schema、完整状态差异、稳定 Cube、归一化数量、状态重定基线和失败阶段。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.blueprint-state')]
globalThis[Symbol.for('cattail.world-editor.blueprint')].snapshot()
globalThis[Symbol.for('cattail.world-editor.blueprint-preview')].snapshot()
globalThis[Symbol.for('cattail.world-editor.blueprint-placement')].diagnostics()
globalThis[Symbol.for('cattail.world-editor.transactions')].snapshot()
```

自动验证入口为 `node tests/verify-4d.js`，并须同时通过全部旧 World Editor 回归。自动门禁不能代替真实游戏内三批验收。4D 不修改原版、ModLoader、Better UIs、其他 Mod、`enabled.json` 或归档旧版，也不包含导入界面、持久蓝图库、打包、发布或提交。

## 5A schema 6 与持久蓝图库

- 新复制、新剪切和新保存的源蓝图统一使用 `mode: "full"` / `schemaVersion: 6`。源文件包含普通建筑的安全持久状态、稳定 Cube、独立 `surges` 层、真正空格、选择范围和生产摘要；不会保存 Surge 的绝对 Stabilizer 关联或其他运行时对象引用。
- 普通模式不会拒绝完整蓝图。预览和放置会把完整源投影为 schema 4 结构执行视图：建筑只保留结构数据，Cube/Surge 所在格成为 `neutralCells`，既不放置临时层，也不会被 Include Cells 误删。创造模式默认使用完整执行视图，也可切换结构执行视图。
- 创造模式放置含临时层的完整蓝图时，直接读取工具栏 Include Cubes / Include Surges 的当前状态，不再二次询问；两项默认关闭，结束本次放置流程后自动复位。Cube/Surge 不参与购买成本、退款、`machinesBuild` 或 `machinesSold`，但与普通建筑共享同一放置 Snapshot、事务、回滚和 undo/redo。
- 普通模式剪切仍只从世界删除可安全删除的普通建筑，但剪贴板和当前会话会保留选区内可捕获的完整源数据。创造模式剪切额外提供“同时移除 Cube”和“同时移除 Surge”两个仅本次生效、默认关闭的选项；启用后临时层进入同一 `selection-delete` 事务，不另开世界写入路径。
- 蓝图库是安装根的 `blueprints/` 本地受管文件夹，不属于单个存档。同一款游戏、同一安装中的不同存档都可加载其中的蓝图；自动测试不会预先创建该真实目录。
- 捕获、复制和剪切只更新当前会话与系统剪贴板。没有手动保存的当前蓝图可以被新捕获、剪切或加载直接覆盖，也可以在清空或会话结束时直接丢弃，不弹出未保存提醒。只有玩家主动点击“保存到蓝图库”才写文件。每个 `.64schem` 或兼容期旧 `.cattail-blueprint.json` 文件使用独立 Library schema 信封，包含游戏标识、稳定 UUID、显示名称、创建/修改时间和 schema 6 完整源；文件名使用清理后的显示名称和完整 UUID 后缀，并按 Library API 的 240 UTF-8 字节名称上限安全截断，因此重复显示名称仍不会冲突。
- 新写入文件使用 Library schema 2，并在完整、未烘焙的 `blueprint` 旁保存规范化 `defaultTransform:{rotation,mirrorU,mirrorV}`。保存当前蓝图或替换内容时记录当前 0/90/180/270° 与 U/V 镜像；加载时先绑定完整源并按当前创造/普通模式生成执行视图，再恢复默认变换，因此普通模式不会把结构投影写入文件。加载后变换按钮保持保存时状态，“重置”回到最初捕获朝向。Library schema 1 文件继续兼容，缺失的默认变换按 0°、无镜像处理；重命名、复制或替换旧条目时自然升级为 schema 2。
- 保存现有条目时必须携带预期 revision；内容替换和改名产生的旧版本由 Library API 留在回收站，可恢复。蓝图库还提供创建副本、移到回收站、恢复、永久删除、隔离损坏文件、Problems 重试、手动刷新和打开文件夹。外部 Watcher 继续在后台刷新蓝图库，但页面不显示常驻的 Watcher 状态文字或独占状态行。
- 蓝图库同时注册到 ModLoader `api.ui.pages` 菜单和世界编辑器顶部蓝图工具栏；两个入口共用同一筛选、选择和视图模型。顶部工具栏另有直接“保存到蓝图库”按钮，蓝图悬浮卡片也提供同名按钮，蓝图库窗口内仍保留保存操作；三个入口调用同一显式保存流程。通过顶部工具栏打开的世界内模态蓝图库在显示期间独占键盘和表面指针输入：开窗会释放游戏中已经按住的移动、Q/E 与 Alt 状态，所有 `keydown` / `keyup` / `keypress` 不再传给世界或 World Editor，`Tab` 焦点限制在窗口内，`Escape` 只关闭蓝图库并把焦点还给原控件；ModLoader 菜单中的 Pages 入口不使用这套世界内模态锁。列表与网格分别保存“显示详细数据”偏好；无论缩略图是否已经生成，都可显示变换后的尺寸、建筑/Cube/Surge 数量、蓝图 schema 以及 `R0/90/180/270°`、`M-U`、`M-V` 默认变换。列表与网格都会按需读取或生成派生 PNG：v2 缩略图使用游戏商店中的真实建筑图像，并在投影绘制前应用文件的默认旋转/镜像；Cube/Surge 保留蓝色/紫色标记。新缓存键会自然绕过只含色块的旧 PNG，而不删除玩家缓存。派生图片只写入 Library 的 `thumbnails` 缓存，缓存失败不会损坏蓝图文件。蓝图库内容、控件、标题和元数据使用游戏现有 Montserrat，不使用浏览器默认字体。蓝图库窗口、List/Grid 条目、详情面板、工具栏/蓝图卡片入口和蓝图库专属游戏内对话框统一采用 Better UIs Save Slots / Settings Page 的透明背景、主题文字、无阴影和直角视觉：完整的“保存到蓝图库 / 刷新 / 打开文件夹 / 区域 / List-Grid / 显示详细数据”工具栏使用 14px 文字、36px 最小高度、7×10px 内边距和 16px 复选框，工具栏短竖线统一放大为 22px；工具栏与下方蓝图 List/Grid 和 Details 内容之间显示全宽 1px 横线，该线不放在蓝图库 Pages 标题下，横线后直接进入蓝图内容布局，不保留常驻状态行。蓝图库主体固定为“可独立上下滚动的蓝图文件区域 / 独立 1px 分隔线 / 固定 Details 区域”；外层 Pages/模态内容不滚动，Details 不随文件列表移动，内容过长时只滚动自身；窄屏改为文件区、横向分隔线和固定底部 Details 的上下布局。蓝图库详情操作和专属对话框操作继续使用独立且为 18px 高的 1px 分隔节点；按钮、蓝图条目、蓝图预览图和详情面板本身均不绘制边框，条目改用留白及轻微背景表示间距、悬停与选中；主菜单入口不增加额外装饰线。亮色工具栏/蓝图卡片使用黑色主题文字，暗色主题自动使用白字；蓝图库 Pages 视图为 1280×720，世界内模态窗口最大使用 1280px / 96vw 与 94vh。悬停只使用轻微主题色透明层与原版菜单的粉紫强调色。
- Better UIs 的可重绑定游戏按键处理器必须在执行移动、Q/E 或其他绑定前检查当前文档是否存在 `[aria-modal="true"]`。这项上游保护覆盖注册早于 World Editor 的捕获监听器；蓝图库自己的命名、替换和删除确认框出现时，底层蓝图库键盘监听会让行，由最上层共享对话框处理 Escape、Tab 和输入。
- 蓝图库尺寸修订：上一条视觉合同中的工具栏 `14px / 36px / 7×10px / 16px` 规格已由更易读的 `15px / 40px / 8×12px / 18px` 规格替代，22px 工具栏分隔线同步增至 24px。固定 Blueprint Details 列由 360px 增至 400px，面板内边距为 16px，标题为 17px、正文/元数据为 14px，详情操作按钮为 14px / 36px；窄屏固定详情区同步由 120–180px 增至 140–220px。蓝图文件条目与缩略图尺寸不随本次调整改变。
- 蓝图文件 List/Grid 与 Details 的滚动行为直接复用 ModLoader Pages API 已公开的 `installTransientScrollbar()` 和 `installInertialScroll()`，不在 World Editor 内复制惯性算法。两个区域分别使用与 Better UIs Language Page 相同的惯性参数：`friction .88`、`directInfluence .30`、`tailInfluence .13`、`maxVelocity 34`、`stopThreshold .35`；蓝图库 Page 外层 `inertialScroll` 明确关闭，避免嵌套滚轮重复处理。滚动条静止时使用透明 track/thumb；鼠标悬停、按下或发生滚动时显示中央 2px 白色细线，并在最后一次交互约 900ms 后由 ModLoader 移除可见类，颜色以 `.28s ease` 淡出。页面刷新、关闭、模态窗口替换和 Mod 卸载都会停止对应区域的惯性动画并清理事件属性。
- Grid 视图使用 `grid-auto-rows:max-content` 与 `align-items:start`，每个蓝图条目同时使用内容驱动的 `height/min-height:max-content` 和 `align-self:start`。因此窄窗口或较低文件区域中，Grid 行高始终完整包含 16:9 缩略图、名称和可选元数据；超出可用高度的完整行由文件区域自身滚动容纳，不会把条目压缩到通用按钮的 30px 最小高度，也不通过 `overflow:hidden` 裁切内容来掩盖重叠。
- 蓝图库的区域与 List/Grid 视图选择不再创建 Electron 原生 `<select>`，而使用同一套可访问的自定义菜单。收起态触发器继续与“刷新 / 打开文件夹”按钮共用纯文字、粉紫 hover 和细下划线键盘焦点；展开层读取现实/虚空主题的背景、文字、边框、hover、选中与焦点变量，使用 8px 圆角、半透明模糊表面、阴影、粉紫交互反馈及当前项勾选标记。区域仍提供 Blueprints / Problems / Trash / Quarantine，视图仍提供 List / Grid，并继续调用既有筛选、偏好写入与完整 20 语言文本；方向键、Home/End、Escape、失焦关闭及同级菜单互斥均有明确键盘合同，世界内 modal 的 Escape 会先关闭展开菜单而不是直接退出整个蓝图库。
- 成功读取或生成的 v2 缩略图 data URL 另存于进程内 128 项 LRU 缓存；`peek(entry)` 可在蓝图库重建 `<img>` 的首次绘制前同步命中同一 ID/revision，因此重新进入页面、Refresh、选择条目和切换“显示详细数据”不会先闪回占位图，也不会再次读取相同磁盘 PNG。新的 revision 和首次冷加载仍按原异步路径读取或生成；失败结果不进入内存缓存，dispose 会清空缓存。默认占位 SVG 改为中性灰色的“下方两个、上方一个”三个等距立方体，替代旧菱形与中线图案。
- 新蓝图第一次手动保存会通过世界编辑器内置命名对话框询问名称，不调用 Electron 不支持的浏览器原生 `prompt()`；该对话框支持输入、Enter 确认、Esc/取消放弃，空名称不能提交。蓝图库中的重命名操作复用同一对话框。替换已保存内容、移到回收站、永久删除和错误提示也全部使用相同的游戏内共享对话框，不调用会暂停游戏的原生 `confirm()` / `alert()`。从蓝图库加载的蓝图再次保存时仍确认是否替换原条目，并使用预期 revision 与可恢复旧版本保护。加载成功后把库 UUID、文件名和 revision 记为会话来源；该来源状态只服务显式保存，不阻止后续覆盖、清空或退出。
- 世界内工具栏打开的模态蓝图库不再沿用上一条中的固定透明白字/直角外观：该入口现与 World Editor 工具栏及共享弹窗使用同一套现实/虚空双主题语言。现实层为亮色高不透明面板、深色文字和深色细线，虚空层为暗色高不透明面板、白色文字和亮色细线；两者都使用 10px 外框圆角、6–8px 控件/条目圆角、半透明控件表面、主题化 hover/选中/焦点反馈、模糊遮罩与浮层阴影。列表、网格、Details、分隔线、下拉菜单和瞬态滚动条都读取当前 modal 的主题变量；蓝图库触发的命名、替换、删除和错误对话框不再覆盖共享弹窗的背景、圆角、按钮或阴影，只保留高于蓝图库 modal 的层级。此修订只覆盖存档内工具栏 modal；ModLoader 主菜单 Pages 蓝图库继续保持 Save Slots / Settings Page 的菜单页面视觉。
- 蓝图库顶部操作区下方的 1px 分隔线在原有 10px 上间距之外增加 8px 下间距，使分隔线与首行蓝图文件留出轻微呼吸空间。派生缩略图缓存升为 v3：PNG 画布不再绘制深色底板或外框，建筑、Cube、Surge 与统计文字以透明背景输出；统计文字使用深色描边和浅色填充，兼容现实亮色与虚空暗色表面。默认三方块占位 SVG 的画布背景也为透明。v3 缓存键会自然绕过旧 v2 深色缩略图，不删除玩家的蓝图文件或旧缓存。
- 顶部“保存到蓝图库 / 刷新 / 打开文件夹 / 区域 / List-Grid”操作在 Pages 和世界内 modal 中继续使用纯文字收起表面：不绘制按钮或菜单触发器底板、边框与阴影，hover 只改变文字颜色，键盘 `:focus-visible` 使用同色文字与细下划线。区域与 List/Grid 展开后的自定义浮层及选项是明确例外，按现实/虚空主题显示圆角、边框、半透明背景、阴影、hover 与选中反馈。显示详细数据仍保留必要的 checkbox 与文字，Details 内的加载/重命名/删除等操作按钮和 modal 关闭按钮不属于这项顶部工具栏修订。
- 世界内工具栏 modal 的关闭控件不再显示字符 `×` 或主题按钮表面：44×44px 透明无框点击区内使用两个 34×3px CSS 伪元素绘制大号 X，现实/虚空主题分别读取主文字色，hover/focus 仅变为粉紫色。世界内 modal 同时使用 1280×792 的固定设计画布；打开及每次窗口 `resize` 都先计算当前窗口占当前显示器可用宽高的最小比例，再通过 `0.5 + 0.5 × displayRatio` 得到较温和的连续缩放曲线，并与“当前窗口可用宽高 / 设计画布宽高”共同取最小值后对整个 panel 执行 `transform:scale()`。因此窗口从全屏开始缩小时比例会立即变化，但不会在超宽显示器的小窗口中直接缩成窗口占屏比例；设计画布适配项仍保证 panel 不超出窗口。标题、X、toolbar、字体、缩略图、列表/Grid、Details、线条与间距按完全相同的比例缩小，窄窗口不把 modal 改成上下重排。该缩放只属于世界内 modal；主菜单 Pages 继续使用自身的 760px 响应式上下布局。
- 继续兼容 schema 1–4 结构蓝图与 schema 3/5 完整蓝图。旧格式只使用其实际存在的数据，不推断不存在的 Surge；5A 初始范围不包含跨安装导入、导出、在线分享或发布流程，5B 只增加本地文件与显式剪贴板分享，不增加在线服务。

## 5B `.64schem` 导入、导出与分享

- Library manifest 同时声明 `.64schem` 与 `.cattail-blueprint.json`，因此 active、trash 和 quarantine 的旧文件继续可见；所有新建、复制、外部导入和规范文件名只使用 `.64schem`。启动、刷新、加载、查看和分享不会批量迁移或改名玩家文件；恢复旧 trash 条目保留旧后缀，只有玩家明确重命名或替换旧 active 条目时才自然转为 `.64schem`，旧 revision 继续保留在回收站。
- 顶部纯文字“导入”在 Pages 与世界内 modal 共用同一操作窗口，玩家可以通过 Library API 1.1 的系统文件选择器读取单个 `.64schem` / 旧后缀文件，或明确选择“粘贴分享文本”后才读取剪贴板。两条入口都执行 16 MiB 上限、UTF-8 JSON、游戏 ID、Library schema v1/v2 与蓝图 schema 校验；空文本、裸蓝图 JSON、其他游戏和不兼容格式不会写入 active。
- 只有 active 中相同 UUID 才触发冲突窗口；默认焦点和安全动作为“作为副本导入”，也可明确“替换”或取消。副本生成新 UUID 与当前创建/修改时间；替换保留目标 UUID 和创建时间，采用导入的名称、内容及默认变换，并在写入前二次核对 exact revision。替换产生的旧版本进入回收站；trash 历史和 quarantine 不参与 UUID 身份冲突。
- active Details 提供“导出文件”和“复制分享文本”。两者始终序列化为完整 Library schema v2 envelope；旧 v1 resident 通过 Library API 的可选导出 payload 生成规范 v2 外部文件，但不会写回、改名、改变 revision 或产生 trash。游戏内原有裸蓝图复制/粘贴语义保持不变。文件对话框取消和冲突取消保持静默；导入成功会选中并滚动到新条目，替换保持目标选中；成功通过短暂 `aria-live` 状态提示，错误保留到玩家关闭或下一次操作。
- 蓝图库新增文本键由全部 20 种原版语言表拥有；简体中文、Mod 简体中文和繁体中文使用中文文本，其余语言当前使用英文 fallback。自动完整性测试不等同于逐语言真实游戏验收。

开发者控制台可检查：

```js
globalThis[Symbol.for('cattail.world-editor.blueprint')].snapshot()
globalThis[Symbol.for('cattail.world-editor.blueprint-library')].snapshot()
globalThis[Symbol.for('cattail.world-editor.blueprint-library-ui')]
globalThis[Symbol.for('cattail.world-editor.blueprint-state')]
globalThis[Symbol.for('cattail.world-editor.transactions')].snapshot()
```

专项自动验证入口为：

```text
node tests/verify-5a-data.js
node tests/verify-5a-library.js
node tests/verify-5a-ui.js
node tests/verify-5b-import-export.js
```

自动门禁不能替代真实游戏验收。游戏内应分别验证：schema 6 捕获、普通模式结构投影、创造模式 Cube/Surge 放置和剪切撤销；跨存档手动保存/加载、无阻拦覆盖、revision、回收站/隔离与外部 Watcher；Pages 菜单、顶部工具栏与蓝图卡片保存入口、列表/网格详情偏好、缩略图及代表性语言显示。5A 不修改原版、ModLoader、Better UIs、其他 Mod、`enabled.json`、归档回归工具或玩家现有蓝图，也不授权暂存、提交、打包、推送或发布。

## 界面打磨：穿透、资源色玻璃按钮与左上资源 HUD

- World Editor 顶部状态栏和工具栏在两种情况下保持可见但整体不接收鼠标：右键拖图从原版游戏 canvas 开始，或结构/完整蓝图预览仍在跟随鼠标且尚未固定。右键松开、窗口失焦、蓝图固定或退出预览后恢复；进入穿透时会释放栏内焦点。共享 dialog 与蓝图库 modal 位于顶部 shell 之外，继续独占输入；`V`、undo/redo、旋转和镜像等既有全局快捷键不因鼠标穿透被关闭。
- 普通共享对话框主按钮使用 Elmerine 三色玻璃；创造模式按钮、创造类对话框主按钮、Place、活动的 Include Cubes / Include Surges / Include Cells、剪切层及 Replace conflicts 使用 Hell Gem 三色玻璃，但创造模式第一层的 `Enable in Current Save` 明确覆盖为 Elmerine。危险主按钮（包括蓝图库 `Delete Permanently`）不再使用纯红色，而是使用 Beta-Pylene 三色玻璃。颜色优先读取当前游戏 `codex.resources[1/3/4].triplet`，缺失时才使用 Elmerine `#FFC759/#FFE86F/#FF8F60`、Beta-Pylene `#F26F67/#FFB68C/#C02E63` 与 Hell Gem `#A6F246/#E3FD43/#4CB96B`。每个主按钮在自身作用域内用最终三色变量计算完整玻璃表面，确保按钮级 Elmerine/Beta-Pylene 覆盖不会继承父弹窗已按 Hell Gem/Elmerine 计算的旧渐变。材质按参考玻璃按钮使用四层半透明表面：顶部椭圆乳白反射、纵向透光/底部亮边、宽斜向反光带和低浓度资源三色底层；背景使用 `10px` 模糊与轻微增亮饱和，边缘同时具有白色外轮廓、上下左右内折射和底部资源色折射。正常态保留柔和下投影及约 `12/26px` 同色光，hover 提高反射、白边和同色光至约 `16/32px`，不会回退到淡灰/粉色或原纯色反馈。按下下沉 `1px` 并收紧内部阴影；禁用态为 `.38` 且不发外光，键盘焦点在玻璃材质外保留 `2px` 高对比环。
- 顶部剪切工具按钮恢复原普通工具栏样式，不使用玻璃；普通选择/撤销/重做/Library/保存/变换/style 按钮，以及黄色警告/忙碌/preview、红色错误文本和绿色成功文字/buildable preview/pinned 边框保持原色。危险按钮仍保留原确认与危险语义，只替换视觉材质。大卡片工具栏只为仍在玻璃范围内的按钮复用既有 `::after` 层，不改变分隔线、命中范围或横向惯性滚动。
- 紧凑工具栏中的每个可见按钮使用统一的 `30 × 30 CSS px` 外框，普通建造/完整复刻不再使用较宽的 `34px` 特例；同组相邻按钮及蓝图/变换内部控件保留 `4 CSS px` 间隙。普通按钮之间不额外画短线；Generate Blueprint、Save to Library 与 Blueprint Library 位于同一个独立大类，三项内部同样只有 `4px` 间隙而没有短分隔线。该蓝图库组与左侧蓝图内容组、右侧变换组之间使用和其他大类一致的长分隔线；大卡片模式保持相同分组，并同样禁止蓝图库组三项之间的选项短线。大卡片尺寸和滚动物理不受影响。
- 只在 World Editor active 时，原版 canvas 资源 HUD 保持左到右顺序并动画到左上安全区。左/上安全边距为 20/16 CSS px，整组统一比例按空间自适应并限制为 `.48–.64`。HUD 不测量也不避让顶部状态栏/工具栏，允许与两栏直接重叠且始终保持顶部对齐，不再下移。进入、退出和 resize 使用 180ms ease-out-cubic，从当前视觉状态连续过渡。
- HUD 仍调用原版 `renderResources()` / `renderDarkResources()`，通过临时 base homes 和统一 canvas transform 同比例绘制图标、数量、hover 名称、速率及图表。活动的 `game.resourceHomes` 始终保存可见坐标，因此资源输送/VFX 端点、`updateMouseData()` 和 `processMousemove2()` 的 hover 命中同步移动并缩放。退出、异常或 Mod cleanup 会恢复原 homes、实例方法和属性描述符；不修改原版 `game.js`，不影响独立 Resource Watcher、ModLoader Pages 或其他 DOM HUD。
- 蓝图库缩略图缓存现为 v4。透明 PNG 仍绘制建筑图标以及 Cube/Surge 的空间标记，但底部统计文字只显示 `n Buildings`，不再加入 `n Cubes` 或 `n Surges`；v4 缓存键会自然绕过旧 v3 图片，不删除蓝图文件或旧缓存。List/Grid 蓝图文件条目的 Show Details 保留原 `尺寸 · Buildings · Cubes · Surges · Schema · R角度 · M轴` 单行摘要与省略规则；只有右侧固定 Details 面板按 `Area → Buildings → Cubes → Surges → Rotate → Mirror → Schema` 七行竖排，使用 `Area: n×n`、`Rotate: n°` 与 `Mirror: None/U/V/U+V` 格式。
- 英语玩家可见 i18n 输出统一使用标题式首字母大写；`a / an / and / as / at / but / by / for / from / in / nor / of / on / or / per / the / to / via / with / yet` 等短连接词在非段首保持小写，变量占位符、全大写缩写、快捷键和 `.64schem` 后缀保持原样。该规则覆盖按钮、卡片、Tooltip、ARIA、状态与对话框；例如 `Clear Active Blueprint`、`Save to Library`。选区拆解工具的完整提示改为 `Disassemble Selected Building`，大卡片短标签改为 `Disassemble Selection`，两项均同步全部 20 种语言；功能、镐子图标与 Delete 快捷键不变。
- 专项验证入口为 `node tests/verify-ui-polish.js`。自动门禁不能代替实机检查；应覆盖 compact/cards 下普通剪切按钮、现实/虚空、未固定/已固定蓝图、右键拖图、不同窗口尺寸、资源与顶部两栏重叠、资源 hover/图表和退出恢复。本批不读写存档或 Steam Cloud。
