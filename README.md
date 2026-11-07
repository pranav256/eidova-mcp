# Open Design MCP

Independent, MIT-licensed design tools for coding agents. The server uses its own
component registry, editable guidance and deterministic review algorithms. It
does not call Better Design or require its subscription.

- Website: https://open-design-website.vercel.app
- Streamable HTTP MCP: https://open-design-mcp-liard.vercel.app/mcp
- Website source: https://github.com/pranav256/open-design-website

## Connect

Use Streamable HTTP with the public MCP URL. Clients supporting `mcpServers` can
use this configuration; check your client's configuration format.

```json
{
  "mcpServers": {
    "open-design": {
      "type": "streamable-http",
      "url": "https://open-design-mcp-liard.vercel.app/mcp"
    }
  }
}
```

For Codex: `codex mcp add open-design --url https://open-design-mcp-liard.vercel.app/mcp`.

## Included

31 design systems with actual React/Radix component source and shadcn-compatible
registry dependencies, local Lucide icons, 72 original guidance topics and 25
original review rules. Tools support theme search/kits, extraction from supplied
CSS or public page stylesheets, custom catalog-based themes, comprehension,
rendered spacing evidence, inline source review, feature maps and video planning.

Private project rules support guidelines, part rules and exact screen specs with
owner isolation and explicit replacement. First-visit tools support brief, ranking
and recheck against supplied walk reports. See the
[compatibility investigation](docs/COMPATIBILITY-PASS.md) for recovered contracts,
independently implemented behavior and remaining gaps.

Public catalog/guidance/review calls need no account. Persistent theme edits and
team rules use a private workspace capability key. Generate one with
`POST /api/workspace-key` and send it as `Authorization: Bearer <key>` on MCP
requests. Store it securely; anyone holding the key can edit that workspace.
Theme registries are public by unguessable project URL; do not put secrets in theme names.

## Run locally

Node 22 or newer:

```sh
npm ci
npm run check
npm test
npm run build
npm start
```

HTTP listens on port 3000. Configure `OPEN_DESIGN_BASE_URL` when using another
origin. `npm run dev` runs TypeScript directly; `node /absolute/path/dist/stdio.js`
runs stdio. Catalog/content assets resolve from the package location, while local
state defaults to `.open-design/state` under the working directory. Set
`OPEN_DESIGN_STATE_DIR` to choose a durable local location.

Install component source in a consumer project:

```sh
npx shadcn@latest add https://open-design-mcp-liard.vercel.app/registry/minimal-light/button.json
```

Edit `content/library.json` or import authorized writing with
`npm run content:import -- /path/to/export.json`. See
[the library contract](docs/CONTENT-LIBRARY.md). Restart or redeploy to load edits.

## Hosting and scope

See [deployment](docs/DEPLOYMENT.md), [API](docs/API.md),
[source coverage](docs/REPOSITORY-COVERAGE.md),
[runtime boundaries](docs/RUNTIME-BOUNDARIES.md) and
[registry verification](docs/REGISTRY-VERIFICATION.md).

This is an independent replacement, not full vendor parity. The private hosted
content library was unavailable; guidance here is independently authored and
editable. AI generation, proprietary inspiration, hosted sales/image generation,
vendor accounts, mobile/Shopify install kits and trusted dashboard browser receipts
are not implemented. Custom themes reuse a catalog base and supplied tokens.
Review tools report only the evidence they actually receive.

There is no project-imposed monthly call quota. The public service remains subject
to Vercel capacity and hosting limits; self-hosting lets you choose that capacity.

Upstream copyright and MIT notices are preserved in [NOTICE](NOTICE),
`assets/LICENSE` and `vendor/upstream/LICENSE`. This project is unaffiliated with
Better Design. Research captures, credentials and private workspaces are excluded
from the public repositories.
