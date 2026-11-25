# Eidova MCP

Design-system selection, real React components, and practical UI review for coding agents. Eight curated families retain all 31 registry IDs. Core exposes 13 typed read-only tools; full keeps 41 public tools and 42 owner tools.

The curated [Eidova resource library](docs/BUNDLED-RESOURCES.md) includes 784 packages: 152 design systems, 115 design templates, 343 plugins, 169 skills, three framework/live-artifact templates and two catalogs. Identical assets share storage; redundant wrappers are removed. Use `search-resources`, then `read-resource` for files, previews and licenses. The website offers direct previews, downloads and an agent prompt. Interface-polish guidance is included. Eidova's 31 installable React kits remain available separately.

**0.2.0 provides public HTTP and local stdio transports.** The [website](https://eidova.vercel.app), [default HTTP endpoint](https://eidova-mcp.vercel.app/mcp) and explicit `/mcp/full` profile are configured in this source; deployment of this revision remains separate. See [rollout requirements](docs/DEPLOYMENT.md#hosting-and-endpoints). [Release verification](docs/RELEASE-VERIFICATION.md) records package checks, exact hosted evidence and remaining client acceptance.

## Run locally

Use Node 22 or newer:

```sh
npm ci
npm run build
npm start
codex mcp add eidova --url http://localhost:3000/mcp
```

The default `/mcp` profile exposes 13 essentials. Use `/mcp/full` for all 41 public tools; reconnect the client after changing the URL. Public catalog, extraction, guidance and reviews need no account or key. [Client setup](docs/CLIENTS.md) covers Codex, Claude Code/Desktop, Cursor and VS Code, with verification scope stated explicitly.

For stdio, use an absolute path to a local build. The `npx` examples become available after npm publication:

```sh
# Run directly with npx
npx -y eidova-mcp --profile core
npx -y eidova-mcp doctor

# Or from a local clone
node /absolute/path/eidova-mcp/dist/stdio.js --profile core
node /absolute/path/eidova-mcp/dist/stdio.js doctor
```

Stdio defaults to core and starts a registry on a random loopback port for the lifetime of the MCP session, so installation links work without a separate HTTP process. Set `EIDOVA_BASE_URL` only to use an existing HTTP service sharing the same assets and state. Use `--profile full` for specialist tools and owner features. `--help` and `--version` print CLI information; `doctor` checks bundled assets without credentials or network requests. In consumer environments, the installed executable is `eidova-mcp`.

## First useful tasks

For project instructions and downloadable client configs, see [Agent setup](docs/AGENT-SETUP.md). Merge the public [AGENTS.md starter](https://eidova.vercel.app/AGENTS.md) into existing project guidance. The [llms.txt index](https://eidova.vercel.app/llms.txt) links the machine-readable entry points. Neither file connects a client by itself.

The local CLI also provides `review-browser`, `preview-install` and `diff-tokens` for rendered preview checks, install conflict reports and CSS/DTCG token comparisons. See [Agent setup](docs/AGENT-SETUP.md) for input contracts and examples.

- “Find a distinctive family for this settings screen. Preserve our existing design if present and retrieve only the components we need.”
- “Extract this supplied brand CSS and extend the existing interface consistently.”
- “Review this form's source and copy. Use rendered DOM evidence for spacing and give specific repairs.”

Search returns compact family summaries. Retrieve a selected kit with `target: "react"` and a component name/list; its shadcn command resolves real source and dependencies. In an initialized React/Tailwind 4 project:

```sh
npx shadcn@latest add http://localhost:3000/registry/linear/button.json
```

The [family recipes](docs/DESIGN-FAMILIES.md) explain material, typography, geometry and density. The website's navbar slider applies all 31 themes plus the default immediately. **Preview theme** opens an isolated viewer of actual Button, Input, Card, Dialog, Table and Sidebar source. Variants have exact token links and an explicitly labelled family specimen.

## Context cost

The 25 November local benchmark measures full public discovery at **51,530 UTF-8 bytes**, compared with the **125,752-byte** baseline; core discovery is **21,632 bytes**. All six fixed full-profile workflows meet the 50% reduction gate. These are compact JSON protocol bytes; model token counts and actual client context traces were not measured. See [benchmark scope](docs/BENCHMARK.md).

Detailed guidance is at `design://workflow/v1`, with principle/review resources and three optional prompts. Ordinary tools work without these resources/prompts. Choose full for private mutation and specialist guidance; core cannot call tools absent from its discovery.

## Persistence and boundaries

Saving themes or team/project rules over HTTP requires a private capability key from `POST /api/workspace-key`, sent as `Authorization: Bearer <key>`. Anyone with that key can edit its workspace. Keys have no email recovery, rotation or revocation. Public custom-theme registry URLs intentionally reveal theme configuration; private rules stay owner-scoped and uncached.

Local state defaults to `.eidova/state` under the working directory. Set `EIDOVA_STATE_DIR` for durable state and `EIDOVA_BASE_URL` for the HTTP origin. Hosted persistence uses private Vercel Blob conditional writes, never ephemeral function disk.

The deterministic core needs no external language model. URL extraction fetches bounded public CSS without rendering pages. Source review requires inline content; spacing measures supplied rendered geometry. [DTCG export](docs/DTCG.md) is a documented 2025.10 typed subset. Reviews apply to their evidence and are not accessibility certification.

Carry the selected theme between agent sessions with its portable **DESIGN.md**. Catalog kits link to `design://systems/<id>/design.md` and a matching HTTP download, containing exact tokens, source CSS hash, component inventory and usage rules. Search explains family fit and tradeoffs and accepts required component names. The site's component viewer offers a selected-theme prompt and document download. [Reference study and scope](docs/DESIGN-STUDY.md).

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

Read the [API](docs/API.md), [release verification](docs/RELEASE-VERIFICATION.md) and [security policy](SECURITY.md). Configuration uses `EIDOVA_*` environment variables. Local state defaults to `.eidova/state` or `EIDOVA_STATE_DIR`. Production URLs require a coordinated deployment of this revision.

This independent open-source project is licensed under the MIT License. Copyright, Tabler's embedded SVG license and Lucide's ISC notice are retained in [NOTICE](NOTICE) and bundled licenses. Supplemental icons use local Lucide; some specialist registry components retain their original Iconify dependencies.
