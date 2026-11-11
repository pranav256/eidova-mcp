# Eidova Studio integration

The selected architecture is **Eidova's own backend with user-supplied model keys**.
Full OpenDesign feature parity is **incomplete**. Native membership, project policy,
content synchronization, comments and presence now use the own backend in source.
Their adapters pass real backend checks. The pinned native engine is installed and
built; guard/typecheck and local tools-dev/MCP project/catalog checks pass.

## What works locally

- Persistent SQLite workspaces, one-use invitations, owner/member roles and revocation.
- Shared projects, exact binary downloads, UTF-8 editing, feedback and resolution.
- Project-version checks reject concurrent overwrites with HTTP 409.
- Fourteen opt-in team tools alongside Eidova's existing design MCP tools.
- Explicit transfers and watched three-way synchronization of a chosen file set.
- Atomic multi-file commits, versioned project metadata, revision history and restore.
- Recent member presence, expiring immutable share links, recovery keys and rotation.
- `/studio` on the website, with session keys, manual key recovery, unsaved-edit
  protection, clipboard fallback, and light/dark responsive layouts.

Access keys are random capabilities; the database stores only their SHA-256 hashes.
Keep a private copy of your workspace key and generate a separate one-use recovery
key under Workspace access. Recovery replaces a lost key; rotation disconnects other
devices using the old key. Revoked members cannot recover access. Ordinary team files
are workspace-visible. Native projects start private; their creators control sharing
and file edits, while teammates can read shared projects and leave feedback. History retains previous
file and metadata revisions, including deletions. Existing databases migrate their
current bytes as one baseline revision; earlier history cannot be reconstructed.

## Start the team backend and website

The persistent backend requires Node 24+. The design MCP still supports Node 22+.
From the `eidova-mcp` checkout:

```powershell
npm run build
npm run studio:backend
```

This starts the **team file service**, not the upstream generation engine. In a
second terminal, from `eidova-website`:

```powershell
npm run dev
```

Open `http://127.0.0.1:5173/studio`. Create a workspace and project. Expand **Use with
a coding agent** to copy your private key. Owners use **Workspace access** to invite
members; invitations work once and expire after 24 hours.

| Backend setting | Default / purpose |
| --- | --- |
| `EIDOVA_STUDIO_DB` | `.eidova/studio.sqlite`; use a durable disk and back it up |
| `EIDOVA_STUDIO_HOST` | `127.0.0.1` |
| `EIDOVA_STUDIO_PORT` | `3210` |
| `EIDOVA_STUDIO_REGISTRATION_KEY` | At least 32 characters; required when binding beyond loopback |
| `EIDOVA_STUDIO_ORIGINS` | Exact origins `http://127.0.0.1:5173,http://localhost:5173` |

This SQLite database belongs to the independent Eidova team service. For the
upstream daemon's separate managed data, follow
[`eidova-studio/AGENTS.md`, Daemon data directory contract](../../eidova-studio/AGENTS.md#daemon-data-directory-contract).

For a built website, set the public `VITE_STUDIO_API_URL` to the backend's HTTPS
origin before `npm run build`, and include the website's exact origin in
`EIDOVA_STUDIO_ORIGINS`. A same-origin reverse proxy can use `/api/studio` and strip
that prefix. Development uses `STUDIO_PROXY_ORIGIN`, defaulting to loopback port 3210.
The production website shows a setup state when `VITE_STUDIO_API_URL` is absent;
Vercel has `/studio` route rewrites but does not host the SQLite service.

**Hosting boundary:** use private access while production deployment remains unverified.
Set a private `EIDOVA_STUDIO_REGISTRATION_KEY` for remote hosting, including behind a
reverse proxy that forwards to loopback. Give this key only to people allowed to
create workspaces; invitations do not need it. The website provides its registration
field when creating a workspace. Never bake this key into VITE settings.

Limits are 100 workspaces/server, 100 projects/workspace, 100 active members/workspace,
1 GiB of revision payloads/server, 10,000 revisions/project and 600 requests/minute
per socket IP. Forwarded IP headers are not trusted; users behind a reverse proxy
share its rate bucket. These are pilot limits, not a tested multi-tenant capacity
promise. Current files and SQLite overhead add to the revision payload quota.
The backend refuses
Vercel's ephemeral function environment. Use a persistent Node process, HTTPS, a
durable volume and restricted access before testing it with a remote team. Stop the
process before a simple filesystem backup so SQLite's WAL is checkpointed, or use a
SQLite-aware online backup. Back up the database and its WAL consistently.

## Connect the design MCP to the team service

Set these in the MCP host's private environment, never a `VITE_*` variable, project
file, prompt, or committed configuration:

```text
EIDOVA_STUDIO_URL=http://127.0.0.1:3210
EIDOVA_STUDIO_KEY=<your private workspace key>
```

Run the built stdio entry with an absolute path:

```text
node /absolute/path/eidova-mcp/dist/stdio.js --studio
```

`--studio` adds fourteen tools to the chosen core/full profile. It does not add write
tools to either public HTTP endpoint. Remote URLs must use HTTPS; redirects are
rejected so credentials cannot follow them to another origin.

| Tool | Operation |
| --- | --- |
| `get-studio-workspace` | Read projects and members |
| `create-studio-project` | Create a shared project |
| `list-studio-files` | Read file metadata and current project version |
| `read-studio-file` | Read paginated literal UTF-8 or base64 content |
| `write-studio-file` | Save with `expectedVersion`; reject stale edits |
| `get-studio-comments` | Read feedback |
| `add-studio-comment` | Post user-authorized feedback |
| `resolve-studio-comment` | Resolve/reopen feedback as author or owner |
| `commit-studio-files` | Commit files, deletions and optional metadata atomically |
| `get-studio-history` | Paginate revision history |
| `restore-studio-revision` | Restore as a new revision using expectedVersion |
| `get-studio-presence` | Read activity during the past minute |
| `share-studio-revision` | Owner creates an expiring revision capability |
| `revoke-studio-share` | Owner revokes the capability |

The agent first reads `get-studio-workspace`, then `list-studio-files`. It reads and
reviews content before saving with the returned project version. A 409 means another
save occurred: read the latest version and merge intentionally before retrying.

## Transfer a local Studio file

The same private URL/key environment is used by the transfer command. Select an
explicit local project folder and file; uploads do not scan directories or include
credentials automatically. Get the shared project UUID/version from the team MCP.

```text
npm run studio:transfer -- upload --directory <local-project-folder> --project <shared-project-uuid> --path index.html --expected-version 0
npm run studio:transfer -- download --directory <empty-review-folder> --project <shared-project-uuid> --path index.html
```

Downloads create new files exclusively. If a local file exists, download to a
separate directory and compare/merge. This preserves unsaved native Studio work.
The server allows 8 MiB per file and 64 MiB/1,000 files per project. Paths must be
relative and portable; transfers reject symbolic links and directory junctions.
Run the transfer in a directory you control; this is not a sandbox for a hostile
local process that can replace directory entries during a transfer.

## Synchronize a chosen file set

```text
npm run studio:sync -- --directory <local-project-folder> --project <shared-project-uuid> --file index.html --file tokens.css --watch
```

Without `--watch`, this performs one synchronization. Watch mode checks every two
seconds and exits on conflicts or failures. Only named files are synchronized;
credentials and other files are never discovered automatically. Do not select
secret files. After the first successful sync, deletions of those named files also
synchronize. A first sync with different nonempty files on both sides is a conflict.

The synchronizer compares local/remote hashes to a persisted baseline. Independent
changes merge; competing edits stop without selecting a winner. Backend updates are
one version-checked transaction. Incoming local replacements retain old files under
`.eidova-sync/backups/`; installation refuses to overwrite a concurrent new file.
Local installation is per-file, not an atomic directory swap. Backups preserve files
if interrupted; inspect them before removing them. A crash can leave a lock: verify
that no sync process is running before removing `.eidova-sync/lock` and retrying.

Resolve a conflict by comparing local and remote copies. To keep a reviewed local
version, upload it with `studio:transfer` and the current remote expected-version,
then restart sync. To keep the remote version, first preserve the local draft, then
replace it with the downloaded remote copy and restart. The baseline file contains
backend/project identifiers and hashes, never credentials. Changing the backend,
project or chosen file set requires a separate directory to avoid accidental deletes.

Native Studio can use this watcher on a user-selected project folder, but its own
project/run history, account context and cloud memberships are not integrated.
Project metadata is versioned through the commit API; the watcher handles only the
explicit file set, not native database metadata.

## History, presence and sharing

The website's Revision history panel previews saved text and restores a whole
revision. Restoration creates a new version, preserving the current version in
history, and fails on concurrent changes. Previews cap display at 200,000 characters;
revision JSON downloads preserve the complete base64 file payloads.

Presence means activity within the past minute; browser heartbeats refresh every
15 seconds. It is not an editing lock or live cursor stream. Revoked users disappear
from presence immediately.

Owners create links to fixed revisions. Anyone with a link can download its files
and project metadata; comments and workspace access keys are excluded. Links expire
in 24 hours from the UI (up to seven days through the API) and can be revoked. Tokens
stay in the URL fragment, are sent in a Share authorization header, and are stored
only as hashes. Revocation prevents future reads; it cannot recall downloaded copies.
Shared HTML/scripts remain literal text and are never executed by the viewer.

## Upstream Studio and user-supplied models

The sibling `eidova-studio` checkout contains the complete upstream source at
`b4ec310921f49ae512de1f0a1f3a4e7ce3d05f2f`, version 0.25.1, plus the new native
own-backend adapters, daemon wiring and focused test entries. It is not a built/released Eidova
engine. Its retained upstream license is Apache-2.0.
It has not been pushed to an Eidova remote or included in the MCP npm package.

It requires Node **24** and **pnpm 10.33.2**, plus upstream native build prerequisites.
On Windows, better-sqlite3 may require Visual Studio Build Tools. With dependency
network access and Corepack available, run from the MCP checkout:

```text
npm run studio:check
npm run studio:install
npm run studio:start
```

The launcher uses upstream `tools-dev`, daemon port 7456 and web port 7457. Port
overrides are `--daemon-port` and `--web-port`. `npm run studio:stop` uses the same
`eidova` lifecycle namespace. `npm run studio:mcp` starts upstream's native stdio
adapter after its daemon is built and running. It can run separately, or the
combined stdio connection below can expose its tools alongside Eidova's tools.

Before `studio:start`, set the private `EIDOVA_STUDIO_URL` and `EIDOVA_STUDIO_KEY`,
and choose an absolute `OD_DATA_DIR` following the native checkout's
[Daemon data directory contract](../../eidova-studio/AGENTS.md#daemon-data-directory-contract).
The launcher selects `OD_WORKSPACE_CONTEXT_SOURCE=eidova`; it does not invent a
native data-root fallback. `studio:install` installs the pinned dependencies only;
`studio:start` builds through `tools-dev`. A package-scoped daemon build is also
available with `pnpm --filter @open-design/daemon build` in the native checkout.

### Check native membership against the own backend

With `EIDOVA_STUDIO_URL` and `EIDOVA_STUDIO_KEY` in the private host environment:

```text
npm run studio:check -- --backend
```

This runs the native membership adapter against the authenticated `/api/identity`
endpoint. It works without installing native dependencies because the adapter uses
Node 24 only. The report separates backend membership verification from the native
build/runtime status. The command still exits with status 1 if the native daemon
is unbuilt, even when `backend.verified` is true. It never prints the access key.

The new adapter in `eidova-studio/apps/daemon/src/collab/eidova-workspace-context.ts`
checks workspace/member IDs against the key's actual membership. Browser claims
cannot select another member or grant an owner role. Each check authenticates anew;
there is no successful-read cache. Credential changes and explicit authorization
rejections invalidate in-flight results and change the cache identity. Responses
Membership responses are bounded to 32 KiB, redirects refused and ordinary requests
time out after eight seconds. Content requests use explicit larger limits/timeouts.
It projects BYOK mode and the own backend's permissions, without billing controls
or Vela console URLs.

The daemon now selects this authority for its workspace directory, exact request
scope, project and tool authorization, catalog, content, comment and presence paths.
Registered projects use server-owned creator and visibility policy. Publishing uses
atomic remote commits and version checks. Pulls stage complete snapshots, preserve
excluded local credentials/cache entries and retain a recovery journal around local
directory replacement. A five-second authority monitor cancels pinned runs after
explicit member/project revocation; transient backend outages do not cancel them.
The full native daemon now starts through tools-dev with the own backend. Real MCP
checks cover project creation/reads and skill/plugin catalogs; complete scheduler,
watch/restart and multi-member UI acceptance remain separate checks.

The adapter's focused Node tests are available as
`pnpm --filter @open-design/daemon test:eidova-authority` after installing the pinned
toolchain. Local checks use the actual SQLite/HTTP backend. The pinned workspace
guard/typecheck, daemon build, native web build and desktop TypeScript build pass.

### One MCP connection for design, team files and the native engine

After building and starting the native daemon, configure these private MCP-host
environment variables (use the actual absolute entry path on your machine):

```text
EIDOVA_NATIVE_STUDIO_ENTRY=D:\Projects\open-design\eidova-studio\apps\daemon\bin\od.mjs
EIDOVA_NATIVE_STUDIO_URL=http://127.0.0.1:7456
```

Run `eidova-mcp --profile core --studio --native-studio`, with the team URL/key
settings from above. `--native-studio` also works without `--studio`. It requires
Node 24 and an installed native adapter; it does not install or start the daemon.
The native daemon URL must be an HTTP loopback origin. This connection is stdio
only; native tools are never exposed through the public HTTP MCP endpoints.

The bridge discovers the native tool catalog and retains its names, JSON schemas,
annotations, structured results, and brief-app resource metadata. Eidova's existing
design resources, preview widgets, templates and prompts remain available. Duplicate
tool names and resource namespace collisions are errors. Resource/tool catalog pages
are bounded and repeated cursors rejected. The native subprocess receives the SDK's
OS environment allowlist, without the parent's team or model-key environment.

`start_run` requires an explicit local CLI `agent` from `list_agents`; default and
AMR/Vela cloud execution are refused. Raw model keys are still not MCP arguments.
Native Local BYOK generation must start through its existing UI. Tool writes are
never automatically retried. MCP request cancellation is forwarded, but stopping
an already-started generation still requires `cancel_run`. Closing the MCP host's
stdin or sending a termination signal closes the bridge and native adapter; the
independently running daemon stays available.

The bridge and daemon authority are separate boundaries. Native project IDs map
to backend storage IDs through the native catalog, with portable metadata and
immutable content revisions. Native run history remains local. The explicit file
synchronizer remains available for non-native projects. Passing the protocol fixture
does not verify the native engine, UI, Local BYOK or media runtime.

Source inspection confirms native Local BYOK providers for Anthropic, OpenAI
compatible endpoints, Azure, Google, Ollama and SenseAudio. Configure provider keys
through the upstream **Local BYOK** UI and start BYOK runs there. The upstream MCP
explicitly rejects raw `apiKey`/`byokProvider` arguments to `start_run`; do not paste
model keys into an agent prompt. The independent team backend does not store or
proxy model keys, and no paid provider call has been made in this integration.

In Eidova mode, the daemon consumes workspace capability keys before startup tasks
can spawn children, while the runtime environment filter also strips explicit
overrides. Install/stop/native-MCP child environments omit team capability keys.
PostHog, Langfuse, anonymous relay and Vela telemetry sinks return disabled even
with inherited telemetry credentials. Legacy cloud authentication/proxy/touchpoint
routes are blocked, Vela commands fail before execution, and managed AMR is excluded
from the native agent registry. Local BYOK and other installed CLI agents remain.
This is a boundary for upstream cloud services, not a network sandbox: user-selected
providers, connectors and plugins still have their existing network behavior.
Native branding and onboarding have local rendered review at 390/1440/1728.
Public publication/community and desktop packaging still need runtime review
before a production Eidova Studio release.

## Verification and remaining work

`npm test` exercises actual HTTP, SQLite restart persistence, token
hashing/revocation, workspace isolation, version conflicts, MCP calls, exact binary
transfer and path/link protection. Its standalone suite does not need a sibling
Studio checkout. From Node 24 with the modified sibling `eidova-studio` checkout,
run `npm run test:studio-native` for the cross-repository checks under
`tests/native-integration/`. These checks use the actual native authority, project,
content and collaboration adapters with the real backend; they do not require or
prove a built native daemon. The separate command fails when its prerequisites
are missing rather than silently skipping integration checks.

The native project-route checks cover creator writes, exact read-only teammate
mirrors, comments, mismatched resources, private transitions and revoked keys.
Upstream mirror bindings deliberately have no local creator; reads and comments
require their exact remote resource to remain shared, while the existing local
gate continues to reject file writes.

`scripts/verify-studio.mjs` exercises the live
website and retains source review, measured DOM geometry, contrast and copy checks
under `.work/studio-review`; the portable summary is in the website's
`docs/studio-review.json`. These tests create disposable local review workspaces.

The latest website review covers 41 rendered states at 390/1440/1728 in both
appearances, including native creators, read-only teammates and removal of access.
All 16 comprehension panels pass; no critical/serious spacing, measured contrast
failures or browser errors remain. The final native checks also exercise the
actual plain-Node launcher, not only the TypeScript test runner. The latest
standalone suite passes 116 tests and the separate native integration suite passes
8 tests, with no skips. MCP typecheck, production build, original stdio smoke and
built combined-bridge smoke also pass.

The previous registry restriction was resolved. Node 24 and pinned pnpm 10.33.2 now
run the installed native workspace. Native guard/typecheck/build, focused tests,
tools-dev startup and the real native MCP project/catalog smoke pass. The final
onboarding review covers nine rendered states with no critical/serious source or
spacing findings, four passing copy panels and no external requests or page errors.
Sampled text/placeholder contrast is at least 5.71:1. No live BYOK generation,
media export, plugin execution or signed desktop installer has been verified.

`tests/studio-native-mcp.test.ts` verifies combined routing against the real design
server and a native protocol fixture, including child startup/EOF cleanup,
credential isolation, cancellation/progress and collision/error paths. A built
combined-stdio smoke also passed against the actual team backend and native fixture
from another working directory. A separate real-engine smoke exposed 35 combined
tools and 679 resources, created/read a native project and read skill/plugin catalogs.
Catalog reads do not establish successful plugin execution or model generation.

See [the parity matrix](STUDIO-PARITY.md) for the remaining feature-level work.
