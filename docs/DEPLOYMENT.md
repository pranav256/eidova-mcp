# Self-host and release

Version 0.2.0 is deployed on the public API and website; package/Registry publication remains separate work. The API and website are independent repositories/Vercel projects. A Git push can trigger their deployment integrations; verify the exact deployed commits and versions. Promote the API before a website that depends on its changes. Setup defaults to full `/mcp`; optional `/mcp/core` is also deployed.

The new [Studio team backend](STUDIO.md) is a separate Node 24+ process with persistent SQLite storage. It cannot run in Vercel functions. Its website connection uses `VITE_STUDIO_API_URL` and exact allowed origins; without that setting the production `/studio` page shows setup instructions. Configure EIDOVA_STUDIO_REGISTRATION_KEY and exact allowed origins for remote access. Signup gating, quotas and rate limiting are implemented; production load and operational validation remain outstanding.

## Local service and website

Use Node 22+ for the MCP; the Vite website requires Node 22.12+. In separate terminals:

```powershell
# eidova-mcp
npm ci
npm run build:upstream
npm run check
npm test
npm run build
$env:EIDOVA_BASE_URL='http://localhost:3000'
$env:EIDOVA_WEBSITE_URL='http://127.0.0.1:5174'
npm start
```

Set `EIDOVA_STATE_DIR` to an absolute durable directory when local persistence is needed; otherwise state lives under the service working directory. Existing capability keys/state need no migration. Use stdio `--profile core` for public design work or the default full profile for owner features.

```powershell
# eidova-website
npm ci
$env:VITE_MCP_URL='http://localhost:3000/mcp'
$env:VITE_REGISTRY_ORIGIN='http://localhost:3000'
$env:MCP_PROXY_ORIGIN='http://localhost:3000'
npm run build
npm run preview -- --port 5174
```

Vite preview serves the built files. Use the explicit registry origin above and the local catalog proxy setting for local review; production proxy rewrites are a separate configuration. Never put private keys in `VITE_*` variables.

## Vercel and coordinated URLs

The Node API functions have a 60-second maximum. Link a **private** Vercel Blob store to each environment; `BLOB_READ_WRITE_TOKEN` is supplied as a secret. Missing Blob credentials fail explicitly on hosted persistence instead of writing to ephemeral function disk. Reads are uncached; writes use conditional ETags.

| Setting | Required relationship |
| --- | --- |
| API `EIDOVA_BASE_URL` | Public API origin; otherwise uses the Vercel production project hostname |
| API `EIDOVA_WEBSITE_URL` | Website origin used for family specimen links |
| Website `VITE_MCP_URL` | The same API origin plus `/mcp`; UI derives `/mcp/core` |
| Website `VITE_REGISTRY_ORIGIN` | The same API origin |
| Website `vercel.json` rewrites | `/api/catalog` and `/registry/*` point to that API |
| Local `MCP_PROXY_ORIGIN` | Development/local-preview API origin |
| `server.json` remotes | Public full URL, verified after deployment |

Keep previous deployment IDs, URL settings and package version before promotion. Retain the same Blob store, capability scheme and state paths. The 16-request process cap is local to an instance. On 15 November 2026 Vercel firewall version 1 (`waf_cC9Yii5SCOuF`) activated a valid fixed-window rule for all POST requests: 120/minute per IP per region, returning HTTP 429. A bounded smoke against an absent route returned 120 normal 404 responses and ten 429 responses; GET `/health` remained 200. GET registry downloads do not match the rule. Vercel counters are regional, so this is not a single global limit. Shared proxy/NAT clients share an IP's allowance; monitor firewall events and adjust deliberately. The Hobby project uses its included single rate-limit rule. To roll back this control, deactivate the named `Eidova POST rate limit` rule without changing source, keys or data. API deployments do not replace project firewall settings.

## Eidova hosted rename

The source, package, CLI and local checkout names use Eidova. GitHub repositories are now `pranav256/eidova-mcp` and `pranav256/eidova-website`; local remotes and current repository metadata use those canonical URLs. Native Studio has a separate private `pranav256/eidova-studio` repository. Existing Vercel project IDs and working hostnames remain intact. Historical review receipts retain their original names and hashes.

The website alias `eidova.vercel.app` and API alias `eidova-mcp.vercel.app` are assigned to the existing Vercel projects. Source uses `https://eidova-mcp.vercel.app/mcp` as the canonical full endpoint and `/mcp/core` for essentials. Client connections go directly to the API; website catalog/registry rewrites and optional `/mcp` forwarding also target the branded API alias. Keep `open-design-website.vercel.app` and `open-design-mcp-liard.vercel.app` as compatibility aliases. Do not point API rewrites back to the website, which would create a loop. Preserve project IDs, deployment history, Blob store, WAF rules and old aliases.

Before production rollout, set API `EIDOVA_BASE_URL=https://eidova-mcp.vercel.app` and `EIDOVA_WEBSITE_URL=https://eidova.vercel.app`, and website `VITE_MCP_URL=https://eidova-mcp.vercel.app/mcp`, `VITE_REGISTRY_ORIGIN=https://eidova-mcp.vercel.app`. Existing environment overrides take precedence over source defaults. Deploy API support for `/server.json` first, then the website routing and assets. Verify POST initialization/discovery and tool calls on branded full/core, registry downloads, `/server.json`, website `/AGENTS.md`, `/llms.txt` and the old aliases before declaring the rename live. Keep the API's WAF enforcement in the request path.

After the new aliases work, update website build variables and `vercel.json` rewrites, API `EIDOVA_BASE_URL` and `EIDOVA_WEBSITE_URL`, `server.json`, defaults and setup documentation together. Deploy the API before the website and verify health, MCP discovery, catalog and registry URLs. Do not point clients at unassigned hostnames or switch the existing storage prefixes or Docker volume during the rename.

## Release sequence

npm/Registry publication was deferred by the user on 15 November 2026. The tested `eidova-mcp@0.2.0` tarball was built from signed source `e7c63c4`; its SHA-1 is `7f769037660a726a769c8a10326f906ff6eae12e`. A retained local copy is `.work/release-publish/eidova-mcp-0.2.0.tgz`; that ignored artifact is not part of the repository or production deployment. Publication returned E403 because npm requires publishing 2FA or a granular token with bypass 2FA. No version was published. The official Registry publisher 1.8.9 validated `server.json` and authenticated as the matching GitHub owner; package-backed Registry publication waits for npm. Resume the sequence below with fresh credentials and complete the named-client acceptance in [CLIENTS.md](CLIENTS.md). Do not describe the deferred host timings/context traces as measured.

1. Finish remote CI and named-client walkthroughs; record client versions, profile, first-task time and context traces. Resolve naming/package/namespace ownership before publishing metadata.
2. Build the exact MCP commit; run tests, stdio/package smoke, benchmark and theme audit. Stage it with separate disposable state/Blob records.
3. Verify staging `/health`, full and core initialize/discovery, recovery, registry source and owner isolation. `npm run smoke -- <staging-origin>/mcp` is read-only. `smoke:private` creates disposable records; use it only within the authorized environment.
4. Point a website preview's build variables and proxy rewrites at that staged API. Sync catalog metadata/specimens when registry source changes and run the website, isolated-viewer and specimen checks below.
5. With release authorization, promote the API and verify `/mcp/core` before promoting the matching website. Preserve old routes and all 31 registry IDs. Invalidate affected public caches or allow the 300-second TTL to expire.
6. Publish the tested tarball and verified Registry metadata only after namespace/package ownership and the remote URL are confirmed. Never republish an npm version; use a new version for a repair.

No trusted dashboard worker is included. The current previews are workspace settings forms and member lists, not dashboards. A future dashboard needs a genuine service-owned capture and VALID receipt.

## Verification and reproducibility

From MCP with the sibling website checkout:

```powershell
$env:WEBSITE_REVIEW_URL='http://127.0.0.1:5174'
$env:WEBSITE_SOURCE_DIR='../eidova-website'
$env:WEBSITE_EXPECTED_MCP_URL='http://localhost:3000/mcp'
$env:MCP_REVIEW_URL='http://localhost:3000/mcp'
node scripts/verify-website.mjs
node scripts/verify-website-themes.mjs
node scripts/verify-specimens.mjs
npm run verify:consumers
```

The browser scripts use Edge on Windows or installed Playwright Chromium elsewhere. `PLAYWRIGHT_CHANNEL` can select another installed channel. On Linux, install Chromium with `npx playwright install --with-deps chromium`; the CI browser job pins Ubuntu 24.04 for the locked Playwright 1.56.1 version. Clean consumers use actual shadcn 4.23.0, React 19.2, Tailwind 4.3.5, Vite 7.3.7 and Next 16.4.6, and run only against a local registry.

`npm run sync:previews` copies exact public source and required licensed fonts/notices into the sibling website. `node scripts/sync-website-themes.mjs ../eidova-website` regenerates catalog tokens and appearance metadata without rewriting the source registry. The website keeps its reference design by default; the landing navbar applies selected themes while component specimens stay isolated. Restart the MCP after registry/content edits because source is cached per process.

## Rollback

Re-promote the recorded previous API and website deployments, restore their coordinated URL settings, and verify the previous full endpoint and registry links. Keep the same persistent store and capability keys; this candidate adds no destructive schema migration. Reconnect clients changed to core to full if rolling back to a release without core. Wait out/invalidate public caches and verify returned versions before declaring recovery.

For npm, move the intended dist-tag back to the previous tested version; do not unpublish installed versions or replace a tarball. Forward fixes receive a new version. Preserve local state/Blob data and any authorized backups; package rollback is separate from user-data deletion.

## Docker

```sh
docker build -t eidova-mcp .
docker run --rm -p 3000:3000 -v open-design-state:/app/.open-design \
  -e EIDOVA_BASE_URL=http://localhost:3000 eidova-mcp
```

Docker is absent from the local machine. The 15 November remote CI passed the actual Docker build and full/core/private runtime smokes; the Linux Node 24 CI job repeats them for subsequent pushes. Local Docker absence does not negate that dated remote evidence. Vercel production API/website deployments and full/core hosted checks pass; verify the exact source of future deployments separately. The local Node builds, clean consumers and package evidence are in [RELEASE-VERIFICATION.md](RELEASE-VERIFICATION.md). Key loss, lack of revocation and security reporting are documented in [SECURITY.md](../SECURITY.md).
