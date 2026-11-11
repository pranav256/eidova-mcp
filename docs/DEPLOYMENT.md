# Self-host and release

Version 0.2.0 is a locally verified candidate; package/Registry publication remains separate work. The API and website are independent repositories/Vercel projects. A Git push can trigger their existing deployment integrations; verify the exact deployed commits and versions. Promote the API before the website: the new website defaults to core, which the previous hosted release does not provide.

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
| `server.json` remotes | Checked production core URL after it is live |

Keep previous deployment IDs, URL settings and package version before promotion. Retain the same Blob store, capability scheme and state paths. Add host-wide rate/abuse controls separately: the 16-request process cap is local to an instance, not deployment-wide enforcement.

## Eidova hosted rename

The source, package, CLI and local checkout names now use Eidova. Remote GitHub repositories and Vercel projects have not been renamed by this local change; all existing working URLs and `.vercel/project.json` links remain intact. Historical review receipts retain their original names and hashes.

When Vercel access is available, verify and assign `eidova.vercel.app` to the website and `eidova-mcp.vercel.app` to the API. These are proposed hostnames, not verified live endpoints. Rename the existing projects while preserving their IDs, deployment history, Blob store and old aliases. Rename the GitHub repositories to `eidova-website` and `eidova-mcp`, then update Git remotes, `.vercel/project.json` project names, repository metadata and source links.

After the new aliases work, update website build variables and `vercel.json` rewrites, API `EIDOVA_BASE_URL` and `EIDOVA_WEBSITE_URL`, `server.json`, defaults and setup documentation together. Deploy the API before the website and verify health, MCP discovery, catalog and registry URLs. Do not point clients at unassigned hostnames or switch the existing storage prefixes or Docker volume during the rename.

## Release sequence

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

`npm run sync:previews` copies exact public source and required licensed fonts/notices into the sibling website. `node scripts/sync-website-themes.mjs ../eidova-website` regenerates catalog tokens and appearance metadata without rewriting the source registry. The website keeps its own appearance fixed; theme selection opens an isolated viewer. Restart the MCP after registry/content edits because source is cached per process.

## Rollback

Re-promote the recorded previous API and website deployments, restore their coordinated URL settings, and verify the previous full endpoint and registry links. Keep the same persistent store and capability keys; this candidate adds no destructive schema migration. Reconnect clients changed to core to full if rolling back to a release without core. Wait out/invalidate public caches and verify returned versions before declaring recovery.

For npm, move the intended dist-tag back to the previous tested version; do not unpublish installed versions or replace a tarball. Forward fixes receive a new version. Preserve local state/Blob data and any authorized backups; package rollback is separate from user-data deletion.

## Docker

```sh
docker build -t eidova-mcp .
docker run --rm -p 3000:3000 -v open-design-state:/app/.open-design \
  -e EIDOVA_BASE_URL=http://localhost:3000 eidova-mcp
```

Docker and Vercel staging were not exercised by the local candidate checks. Verify any production deployment triggered by the pushed commits separately. The local Node builds, clean consumers and package evidence are in [RELEASE-CANDIDATE.md](RELEASE-CANDIDATE.md). Key loss, lack of revocation and security reporting are documented in [SECURITY.md](../SECURITY.md).
