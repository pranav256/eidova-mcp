# Deploy and self-host

The API and marketing website are separate repositories and Vercel projects:
`pranav256/open-design-mcp` and `pranav256/open-design-website`.

## Vercel API

Import this repository or run `vercel deploy --prod` from its root. `vercel.json`
builds the Node service and routes `/mcp`, `/api/*`, registry/icon requests and
service metadata to `api/index.ts`. API functions have a 60-second maximum.

Link a **private** Vercel Blob store to production and preview. Vercel supplies
`BLOB_READ_WRITE_TOKEN`; never commit it. The API fails explicitly rather than
storing persistent work on ephemeral function disk when this secret is absent.
Documents use deterministic private paths, uncached reads and conditional ETag
writes. Local storage instead supports a single Node writer process.

Set `OPEN_DESIGN_BASE_URL` to a custom public origin if needed; otherwise the
Vercel production project hostname is used. The anonymous catalog does not
require workspace authentication. Private team rules and theme edits require a
43–128 character base64url capability key on HTTP.

Verify a deployment with `npm run smoke -- https://your-host/mcp` and
`GET /health`. Smoke captures remain under ignored `.work/verification`.

`npm run smoke:private -- https://your-host` creates disposable workspace rules
and a theme, confirms persistence across clients, verifies that another workspace
cannot overwrite them, and checks the public custom registry. It never prints
or saves the temporary workspace keys. `npm run smoke:stdio` verifies the built
stdio package from a different working directory.

## Website

Deploy the website repository independently. Its `VITE_MCP_URL` points to
the full MCP endpoint, and its Vercel `/api/catalog` rewrite points to that same API.
When changing the API hostname, update both values and redeploy. Browser clients
can also fetch the catalog directly using the API's public CORS support.

From this service checkout, with the website checked out at `website/` or a
supplied path, run the source and rendered checks:

```sh
npm run review:website -- https://open-design-mcp-liard.vercel.app/mcp ./website
node scripts/verify-website.mjs
```

The browser check uses Microsoft Edge on Windows. Set `PLAYWRIGHT_CHANNEL` to
another installed browser channel, or install Playwright Chromium on other
platforms with `npx playwright install chromium`. `WEBSITE_REVIEW_URL` and
`MCP_REVIEW_URL` override the reviewed website and review service. The release
check expects the public Open Design endpoint in the site's connection example.
It records screenshots and DOM measurements, exercises search, keyboard and
clipboard actions and catalog recovery, and fails on blocking spacing or copy
findings. See [the release report](RELEASE-VERIFICATION.md) for exact coverage.

## Docker

```sh
docker build -t open-design-mcp .
docker run --rm -p 3000:3000 -v open-design-state:/app/.open-design \
  -e OPEN_DESIGN_BASE_URL=http://localhost:3000 open-design-mcp
```

No external language model is required. Protect any public deployment with the
hosting controls appropriate to its capacity; this project does not promise
unlimited third-party infrastructure. The public Vercel deployment runs stateless
MCP HTTP and uses Blob only for intentional workspace persistence.
