# Private-alpha deployment gate

This file is a deployment and rollback checklist, not deployment authorization.
The repository remains local-only until the user separately approves Cloudflare
login, resource creation, secret writes, and deployment.

## Current fail-closed defaults

`wrangler.alpha.jsonc` is separate from the localhost configuration and has:

- `workers_dev=false`, no route, and no custom domain;
- `preview_urls=false`;
- `SERVICE_DISABLED=true`;
- `TURN_DISABLED=true`;
- signed alpha invitations required;
- missing Origin rejected, with only Electron `null` and `file://` allowed;
- 20 room creations per UTC day across the Worker;
- 32 real TURN credential grants per UTC day across the Worker;
- 16 real TURN credential grants per room per UTC day;
- 15-minute TURN credentials with a refresh request after 10 minutes;
- observability disabled;
- no Cloudflare or signing secret in source control.

The daily guards reduce exposure but are not a billing cap. Keeping TURN disabled
is the only current zero-TURN-egress guarantee.

## Local checks that do not contact an account

From `services/signaling`:

```powershell
npm.cmd test
npm.cmd audit
npm.cmd run check:alpha-config
```

`check:alpha-config` invokes `wrangler deploy --dry-run`; it only validates and
bundles the production configuration locally.

## Secrets required before any enabled service

Create independent random values of at least 32 characters for:

- `INTERNAL_AUTH` — Worker-to-Durable-Object authorization;
- `ALPHA_INVITE_SIGNING_SECRET` — HMAC signing and verification for invitations.

After separate authorization, the user writes them through Wrangler's
interactive secret prompts. `wrangler secret put` immediately creates and
deploys a new Worker version, so secret writes happen only after the unreachable
bootstrap has been deployed and while `SERVICE_DISABLED=true` remains in force.
Never place either value in `.dev.vars`, Wrangler vars, shell history, logs, the
Mod, or this document. Codex must not receive or echo the plaintext values.

TURN remains disabled during the first WSS/STUN deployment. A later, separately
authorized TURN test also requires dedicated test values for:

- `TURN_KEY_ID`;
- `TURN_KEY_API_TOKEN`.

## Staged first deployment after authorization

1. Re-run all local checks and record the exact Git/worktree scope.
2. Use `wrangler login --use-keyring`; the user completes browser OAuth. Run
   `wrangler whoami` and confirm the dedicated personal/test account is on Workers
   Free. Stop on any unexpected or unconfirmed account choice.
3. Confirm Worker name `cattail-p2p-signaling-alpha`. Do not configure a
   `workers.dev` hostname, route, custom domain, Access application, or TURN key.
4. Deploy `wrangler.alpha.jsonc` unchanged and without secrets. This provisions
   the Worker and the two SQLite Durable Object namespaces, but no public endpoint
   can invoke the Worker because `workers_dev=false` and no route exists.
5. Inspect the deployment output, Worker version, and `ROOMS`/`ADMISSION`
   bindings. Do not instantiate room/admission objects or write application data.
6. The user enters `INTERNAL_AUTH` through Wrangler's interactive secret prompt.
   This deploys a new version that remains unreachable and service-disabled.
7. The user enters `ALPHA_INVITE_SIGNING_SECRET` through the same interactive
   flow. This deploys another unreachable, service-disabled version.
8. List secret names and deployments without reading secret values. Confirm both
   required names exist, the two DO exports are unchanged, TURN remains disabled,
   and no public route exists.
9. Run `wrangler logout` and stop. Do not enable `workers.dev`, the service, or
   TURN in this authorization.

There is no external health check during bootstrap because the Worker has no
public route. A later WSS/STUN authorization must first expose a reviewed
`workers.dev` route while the service is still disabled, verify the expected 503
health/operation behavior and configuration readiness, and only then separately
deploy `SERVICE_DISABLED=false` with `TURN_DISABLED=true`.

Generate a one-room, 24-hour invitation locally only after the signing secret is
installed. Set `CATTAIL_P2P_ALPHA_SIGNING_SECRET` in the current process through
the user's secret-handling workflow, run `npm.cmd run invite:create`, copy the
result privately, then clear the environment variable. The generator never
writes a token or secret to disk.

## Later TURN test gate

Use a dedicated test TURN key. Keep the 900-second credential TTL and 600-second
refresh setting. Only after separate authorization:

1. write `TURN_KEY_ID` and `TURN_KEY_API_TOKEN` as Worker secrets;
2. set `TURN_DISABLED=false` in a reviewed deployment version;
3. test a short forced-relay window and inspect grant/egress usage;
4. immediately restore `TURN_DISABLED=true` and deploy;
5. revoke/delete the dedicated TURN key after confirming no more tests need it.

## Stop and rollback order

The bootstrap is already unreachable. If a later public version fails, the
recoverable first response is to deploy a reviewed configuration with
`workers_dev=false`, no routes, `SERVICE_DISABLED=true`, and
`TURN_DISABLED=true`. The route is removed, and any existing sockets close when
the disabled version receives their next message or heartbeat during the
transition.

If a prior known-safe Worker version exists, version rollback may follow after
reviewing its bindings and secret expectations. Do not roll back to a version
that lacks the invitation and account-level cost guards.

Revoking a test TURN key, deleting a Worker, and permanently deleting Durable
Object namespaces/data are separate external state changes. Namespace/data
deletion is irreversible and always requires explicit target confirmation and
authorization. A first rollback should leave Durable Object storage intact.
