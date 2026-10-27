# P2P Multiplayer 0.2.1 — Phase 2.1 local hardening

## 可见双实例玩家验收：8A＋9A＋10A＋11A（2026-10-27）

本批在 C:\tmp\sixtyfour-p2p-player13-20261027 使用008基线，只启用P2P，
旧008目录保持只读。fixtures/main/start、玩家入口和专项测试已接入；
自动模式仍为离屏，可见模式使用普通窗口和独立新profile，最长15分钟。

当前状态：**11A已实施，本轮94项自动检查及严格正常退出通过；全新可见201已启动，玩家反馈PENDING。**
新副本基于008，明确覆盖main/fixtures，并采用10A诊断关闭修复与11A路径统计修复。
P2P transport优先浏览器明确选中路径；统计不全最多20次/250ms重试，关闭后不发布旧结果；
严格candidateAllowed保持。新增路径专项9、原客户端31、真实游戏103的43项、玩家工具940/941的11项通过。
旧101/911/921/931失败和932/933诊断原件保留；自动检查不代替玩家反馈。
本轮控制器等待旧房间原生WebSocket close后再建立新房间，重载后可能约10秒才恢复连接。
当前状态与最终收尾见 reports/201/player-session.json、cleanup.json。201已经使用，勿重复启动或覆盖。

可见入口会验证 acceptance-gate.json 的READY状态和输入哈希。
未就绪时拒绝启动。201已经使用；以后从仓库根运行时选未使用attempt，例如202：

~~~powershell
node resources/app/game/mods/Cattail_TweaksNetwork_P2P-Multiplayer/tools/desktop-1.3/player.cjs --run 202
~~~

两个窗口自动建连，玩家各自点击 Send 4 KiB probe to all，核对4096/522263；
分别平移、缩放和开关菜单，等待至少30秒，再通过“测试→重载此测试窗口”
或Ctrl+R检查重载。重载后控制器会创建新房间，世界进度仍只在内存。
关闭任一测试窗口会结束整轮并正常关闭另一端及本机服务；超时记未完成。
报告不会代替玩家反馈写入PASS。

HTTP/WS仅127.0.0.1:8787，ICE无STUN/TURN，仅本机host候选；进度仅在会话
内存、偏好仅在隔离profile，不读真实存档或系统剪贴板。原版、当前Loader源码、
其他Mods、正式enabled.json、版本、Git和发布均不在本批写入范围。
不要对旧008目录再次运行prepare；新根已准备，不重复执行--prepare。


Phase 2 replaces manual SDP copy/paste with a private room signaling layer. It
still does **not** synchronize the game world, entities, resources, saves,
cameras, or player actions.

Implemented locally:

- eight-character private room codes;
- one Host plus up to three Guests in a host-star topology;
- WebSocket signaling with rotating in-process resume tokens;
- signed, short-lived, one-room private-alpha invitations;
- a global admission guard capped at 20 room creations and 32 real TURN grants
  per UTC day;
- automatic offer/answer and trickle ICE;
- STUN-first WebRTC with server-issued TURN credential support;
- ten-second signaling and thirty-second ICE/DTLS timeouts;
- one automatic reconnect/rebuild attempt;
- direct/relay path reporting without logging candidate addresses;
- ordered reliable DataChannel handshake and 4 KiB probes;
- sanitized diagnostics export;
- isolated safe-test write guards.

The Cloudflare Worker uses a SQLite Durable Object per room, one global
admission Durable Object, and the WebSocket Hibernation API. Local configuration
keeps invitations optional and TURN disabled. The production alpha configuration
fails closed, starts with the whole service disabled, starts with TURN disabled,
has no `workers.dev`/route/custom-domain entry point, and contains no secret
values. Deployment and Cloudflare secrets require
separate approval; see `services/signaling/DEPLOYMENT_ALPHA.md`.

## Current desktop 1.3 local acceptance (2026-10-24)

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
visually reviewed. This is automated local P1-equivalent evidence. Player,
four-instance 1.3, public network and world synchronization acceptance remain open.

Miniflare must use cf:false and caches inside the approved root. Early attempts
001–004 omitted that setting and refreshed the existing project
.wrangler/cache/cf.json through public metadata fetch. The incident and missing
old backup are recorded in scope-incident.json; do not describe those attempts
as zero-public-network evidence. No account API or deployment was performed.

## Automated client checks

```powershell
node .\tests\verify-phase2.js
node .\tests\verify-safe-mode-1.3.cjs
node .\tests\verify-desktop-1.3.cjs
```

## Archived pre-1.3 four-instance workflow

Historical instructions below are retained for reference. They are not validated
for current 1.3 and must not be used as the current safe launcher.


Run these from this mod directory in PowerShell:

```powershell
.\tools\prepare-phase2.ps1
.\tools\verify-phase2-isolation.ps1
.\tools\start-phase2-signaling.ps1
.\tools\start-phase2-instance.ps1 -Role Host
.\tools\start-phase2-instance.ps1 -Role Guest1
.\tools\start-phase2-instance.ps1 -Role Guest2
.\tools\start-phase2-instance.ps1 -Role Guest3
```

The local Worker does not require an invitation. When testing a strict alpha
service, supply the private token through the launcher parameter; the launcher
passes it to the game through the child process environment, not its command
line:

```powershell
$env:CATTAIL_P2P_ALPHA_INVITE = Read-Host 'Private alpha invitation'
.\tools\start-phase2-instance.ps1 -Role Host -SignalingUrl 'https://example.workers.dev' -AlphaInvite $env:CATTAIL_P2P_ALPHA_INVITE
$env:CATTAIL_P2P_ALPHA_INVITE = $null
```

In the Host instance, open `P2P MULTIPLAYER` and create a room. Copy the room
code into each Guest and join. Require all three Host-to-Guest channels to open,
then send the 4 KiB probe to all peers.

After closing all four games:

```powershell
.\tools\verify-phase2-isolation.ps1 -RequireLiveAudit
.\tools\stop-phase2-signaling.ps1
```

The runtime, profiles, Worker state, logs, baseline and backups are retained
under `C:\tmp\sixtyfour-p2p-phase2`. No cleanup is automatic.

## Security boundary

- Long-lived TURN keys belong only in Cloudflare secrets.
- Private-alpha TURN credentials use a 15-minute lifetime and refresh after
  about 10 minutes.
- Alpha invitation tokens are HMAC-signed, expire within at most seven days,
  and are scoped to one room by default. They never enter public state snapshots
  or sanitized diagnostics.
- Production rejects missing origins, weak/missing internal and invitation
  secrets, and missing TURN secrets when TURN is enabled.
- `SERVICE_DISABLED=true` is the initial production kill switch. Existing
  sockets close on their next message/heartbeat after the disabled configuration
  is deployed.
- `workers_dev=false` and no route make the bootstrap Worker unreachable from
  the public Internet. Publishing a `workers.dev` endpoint is a later gate.
- Persistent logs must not contain room codes, tokens, SDP, ICE candidates, IP
  addresses, or TURN credentials.
- This private alpha allows the Electron `null` origin because the game is
  loaded from local files; room credentials and server-side limits remain
  mandatory.
- `npm run deploy` is intentionally blocked until a separate deployment
  authorization is recorded.

The Phase 1 files remain only as acceptance history. Do not use the old manual
SDP workflow for Phase 2.
