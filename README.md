# Open Design MCP

Design-system selection, real React components, and practical UI review for coding agents. Eight curated families retain all 31 registry IDs. Core exposes 11 typed read-only tools; full keeps 40 public tools and 41 owner tools.

**0.2.0 is a release candidate, not a published npm package.** Verify the [website](https://open-design-website.vercel.app), [full HTTP endpoint](https://open-design-mcp-liard.vercel.app/mcp) and `/mcp/core` against the matching deployed version. Hosted core URLs and new specimens need the coordinated [release](docs/DEPLOYMENT.md); local checks alone do not certify deployment.

## Run locally

Use Node 22 or newer:

```sh
npm ci
npm run build
npm start
codex mcp add open-design --url http://localhost:3000/mcp/core
```

Use `/mcp` for full. Public catalog, extraction, guidance and reviews need no account or key. [Client setup](docs/CLIENTS.md) covers Codex, Claude Code/Desktop, Cursor and VS Code, with verification scope stated explicitly.

For stdio use an absolute path, independently of your client's working directory:

```sh
node /absolute/path/open-design-mcp/dist/stdio.js --profile core
node /absolute/path/open-design-mcp/dist/stdio.js doctor
```

Stdio defaults to full. `--help` and `--version` print CLI information; `doctor` checks bundled assets without credentials or network requests. Before publication, run `npm pack` and install the resulting tarball in your consumer environment. Its installed executable is `open-design-mcp`.

## First useful tasks

- “Find a distinctive family for this settings screen. Preserve our existing design if present and retrieve only the components we need.”
- “Extract this supplied brand CSS and extend the existing interface consistently.”
- “Review this form's source and copy. Use rendered DOM evidence for spacing and give specific repairs.”

Search returns compact family summaries. Retrieve a selected kit with `target: "react"` and a component name/list; its shadcn command resolves real source and dependencies. In an initialized React/Tailwind 4 project:

```sh
npx shadcn@latest add http://localhost:3000/registry/linear/button.json
```

The [family recipes](docs/DESIGN-FAMILIES.md) explain material, typography, geometry and density. The website puts installation in the hero and keeps its own appearance fixed. **View components** opens a separate viewer of actual Button, Input, Card, Dialog, Table and Sidebar source. Variants have exact token links and an explicitly labelled family specimen.

## Context cost

Full public discovery falls from **125,752 to 51,503 UTF-8 bytes**; core discovery is **19,237 bytes**. All six fixed full-profile workflows meet the 50% reduction gate. These are compact JSON protocol bytes; model token counts and actual client context traces were not measured. See [benchmark scope](docs/BENCHMARK.md).

Detailed guidance is at `design://workflow/v1`, with principle/review resources and three optional prompts. Ordinary tools work without these resources/prompts. Choose full for private mutation and specialist guidance; core cannot call tools absent from its discovery.

## Persistence and boundaries

Saving themes or team/project rules over HTTP requires a private capability key from `POST /api/workspace-key`, sent as `Authorization: Bearer <key>`. Anyone with that key can edit its workspace. Keys have no email recovery, rotation or revocation. Public custom-theme registry URLs intentionally reveal theme configuration; private rules stay owner-scoped and uncached.

Local state defaults to `.open-design/state` under the working directory. Set `OPEN_DESIGN_STATE_DIR` for durable state and `OPEN_DESIGN_BASE_URL` for the HTTP origin. Hosted persistence uses private Vercel Blob conditional writes, never ephemeral function disk.

The deterministic core needs no external language model. URL extraction fetches bounded public CSS without rendering pages. Source review requires inline content; spacing measures supplied rendered geometry. [DTCG export](docs/DTCG.md) is a documented 2025.10 typed subset. Reviews apply to their evidence and are not accessibility certification.

Hosted AI generation, proprietary inspiration, vendor accounts, native/Shopify install kits, credential administration and trusted dashboard browser receipts remain outside this release. The opt-in [private archive](docs/PRIVATE-ARCHIVE.md) serves an owner's existing saved responses offline; archived files are excluded from distribution.

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

Read the [API](docs/API.md), [candidate verification](docs/RELEASE-CANDIDATE.md), [implementation status](docs/SOL-IMPLEMENTATION-PLAN.md) and [security policy](SECURITY.md). Open Design remains the working name until a replacement is selected and checked.

This independent MIT project is unaffiliated with Better Design. Copyright, Tabler's embedded SVG license and Lucide's ISC notice are retained in [NOTICE](NOTICE) and bundled licenses. Supplemental icons use local Lucide; some specialist registry components retain their original Iconify dependencies.
