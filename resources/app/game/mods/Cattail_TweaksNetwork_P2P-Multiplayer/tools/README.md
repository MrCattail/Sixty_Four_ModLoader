# Phase 2 tools

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

Canonical tools for the current Phase 1 acceptance:

1. `prepare-phase1.ps1` creates a new disposable clone. It refuses to overwrite an existing root.
2. If preparation stopped because the original game was open, close the original game and run `finalize-phase1-preparation-v2.ps1`.
3. Run `verify-phase1-isolation-v2.ps1` before launching either clone instance.
4. Run `start-phase1-instance.ps1 -Role Host` and `start-phase1-instance.ps1 -Role Guest` only after the preflight passes.
5. After closing both instances, run `verify-phase1-isolation-v2.ps1 -RequireLiveAudit`.

Deprecated in this working tree:

- `finalize-phase1-preparation.ps1` has an unquoted PowerShell metadata key. Do not execute it; use v2.
- `verify-phase1-isolation.ps1` treats a missing Local profile as different from an empty baseline object. Do not use it; use v2.

The v2 files exist because the current Windows patch sandbox can add files but cannot update newly added files in place. No shell-based source rewrite was used to bypass that constraint.
