# Desktop 1.3 tools

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
