# Eidova MCP

Design-system selection, real React components, and practical UI review for coding agents. Eight curated families retain all 31 registry IDs. Core exposes 13 typed read-only tools; full keeps 42 public tools and 43 owner tools.

The curated [Eidova resource library](docs/BUNDLED-RESOURCES.md) includes 784 packages: 152 design systems, 115 design templates, 343 plugins, 169 skills, three framework/live-artifact templates and two catalogs. Identical assets share storage; 137 legacy links remain readable. Use `search-resources`, then `read-resource` for files, previews and licenses. The website offers direct previews, downloads and an agent prompt. Unslop supports focused interface polish. Eidova's 31 installable React kits remain available separately.

**0.2.0 provides public HTTP and local stdio transports.** The [website](https://eidova.vercel.app), [branded full HTTP endpoint](https://eidova-mcp.vercel.app/mcp) and optional `/mcp/core` are deployed and verified. The existing API hostname remains available for compatibility. See [rollout requirements](docs/DEPLOYMENT.md#eidova-hosted-rename). [Release verification](docs/RELEASE-VERIFICATION.md) records package checks, exact hosted evidence and remaining client acceptance.

## Run locally

Use Node 22 or newer:

```sh
npm ci
npm run build
npm start
codex mcp add eidova --url http://localhost:3000/mcp
```

The default `/mcp` profile exposes all 42 tools. Use `/mcp/core` for 13 essentials; reconnect the client after changing the URL. Public catalog, extraction, guidance and reviews need no account or key. [Client setup](docs/CLIENTS.md) covers Codex, Claude Code/Desktop, Cursor and VS Code, with verification scope stated explicitly.

For stdio use an absolute path, independently of your client's working directory:

```sh
node /absolute/path/eidova-mcp/dist/stdio.js --profile full
node /absolute/path/eidova-mcp/dist/stdio.js doctor
```

Stdio defaults to full. `--help` and `--version` print CLI information; `doctor` checks bundled assets without credentials or network requests. Before publication, run `npm pack` and install the resulting tarball in your consumer environment. Its installed executable is `eidova-mcp`.

## First useful tasks

For project instructions and downloadable client configs, see [Agent setup](docs/AGENT-SETUP.md). Merge the public [AGENTS.md starter](https://eidova.vercel.app/AGENTS.md) into existing project guidance. The [llms.txt index](https://eidova.vercel.app/llms.txt) links the machine-readable entry points. Neither file connects a client by itself.

- “Find a distinctive family for this settings screen. Preserve our existing design if present and retrieve only the components we need.”
- “Extract this supplied brand CSS and extend the existing interface consistently.”
- “Review this form's source and copy. Use rendered DOM evidence for spacing and give specific repairs.”

Search returns compact family summaries. Retrieve a selected kit with `target: "react"` and a component name/list; its shadcn command resolves real source and dependencies. In an initialized React/Tailwind 4 project:

```sh
npx shadcn@latest add http://localhost:3000/registry/linear/button.json
```

The [family recipes](docs/DESIGN-FAMILIES.md) explain material, typography, geometry and density. The website's navbar slider applies all 31 themes plus the default immediately. **Preview theme** opens an isolated viewer of actual Button, Input, Card, Dialog, Table and Sidebar source. Variants have exact token links and an explicitly labelled family specimen.

## Context cost

The 21 November local benchmark measures full public discovery at **54,065 UTF-8 bytes**, compared with the **125,752-byte** baseline; core discovery is **21,800 bytes**. All six fixed full-profile workflows meet the 50% reduction gate. These are compact JSON protocol bytes; model token counts and actual client context traces were not measured. See [benchmark scope](docs/BENCHMARK.md).

Detailed guidance is at `design://workflow/v1`, with principle/review resources and three optional prompts. Ordinary tools work without these resources/prompts. Choose full for private mutation and specialist guidance; core cannot call tools absent from its discovery.

## Persistence and boundaries

Saving themes or team/project rules over HTTP requires a private capability key from `POST /api/workspace-key`, sent as `Authorization: Bearer <key>`. Anyone with that key can edit its workspace. Keys have no email recovery, rotation or revocation. Public custom-theme registry URLs intentionally reveal theme configuration; private rules stay owner-scoped and uncached.

Local state defaults to `.open-design/state` under the working directory. Set `EIDOVA_STATE_DIR` for durable state and `EIDOVA_BASE_URL` for the HTTP origin. Hosted persistence uses private Vercel Blob conditional writes, never ephemeral function disk.

The deterministic core needs no external language model. URL extraction fetches bounded public CSS without rendering pages. Source review requires inline content; spacing measures supplied rendered geometry. [DTCG export](docs/DTCG.md) is a documented 2025.10 typed subset. Reviews apply to their evidence and are not accessibility certification.

Carry the selected theme between agent sessions with its portable **DESIGN.md**. Catalog kits link to `design://systems/<id>/design.md` and a matching HTTP download, containing exact tokens, source CSS hash, component inventory and usage rules. Search explains family fit and tradeoffs and accepts required component names. The site's component viewer offers a selected-theme prompt and document download. [Reference study and scope](docs/OPEN-DESIGN-STUDY.md).

Hosted AI generation, proprietary inspiration, vendor accounts, Shopify install kits, credential administration and trusted dashboard browser receipts remain outside this release. The opt-in [private archive](docs/PRIVATE-ARCHIVE.md) serves an owner's existing saved responses offline; archived files are excluded from distribution.

## Verify and maintain

```sh
npm run build:upstream
npm run check
npm test
npm run build
npm run smoke:stdio
npm run smoke:package
npm run benchmark -- --check
npm run audit:themes
```

`npm run verify:consumers` uses the local registry and actual shadcn CLI in six disposable Vite/Next consumers. Website checks are in [deployment](docs/DEPLOYMENT.md). Edit `content/library.json` or use the [content importer](docs/CONTENT-LIBRARY.md); restart to load changes.

Read the [API](docs/API.md), [release verification](docs/RELEASE-VERIFICATION.md) and [security policy](SECURITY.md). Eidova is the selected name; the GitHub repositories and website alias are assigned; npm/Registry publication remains unverified.

Configuration uses `EIDOVA_*`; existing `OPEN_DESIGN_*` settings remain fallback aliases. Local `.open-design/state` and the private Blob `open-design/state` prefix are retained so saved workspaces remain accessible. Old review-rule resource links still resolve to the renamed rules. Branded GitHub and Vercel URLs are live; previous hosted aliases remain compatible after the coordinated [hosted rename](docs/DEPLOYMENT.md#eidova-hosted-rename).

This independent MIT project is unaffiliated with Better Design. Copyright, Tabler's embedded SVG license and Lucide's ISC notice are retained in [NOTICE](NOTICE) and bundled licenses. Supplemental icons use local Lucide; some specialist registry components retain their original Iconify dependencies.
