# Agent setup

Connect the client, then give its agent project guidance. These are separate steps:
`AGENTS.md` is a project instruction convention, not an MCP transport or a connection file.
The supported MCP interface already includes initialization instructions, tool discovery,
resources, resource templates and prompts. `server.json` describes the server for Registry
publication; publication is still deferred.

## Project instructions

Download the public [AGENTS.md starter](https://eidova.vercel.app/AGENTS.md), review it,
and merge it into your project's existing `AGENTS.md`. Do not overwrite project rules.
The repositories' root `AGENTS.md` files are contributor guidance; the public starter is
for projects using Eidova. Save the selected kit's design context separately as `DESIGN.md`.

## Client configuration

The public [llms.txt index](https://eidova.vercel.app/llms.txt) links to client examples,
project guidance and reference docs. Copy the relevant example into the client's
configuration and merge its `eidova` entry with existing servers:

| Client | Example | Destination |
| --- | --- | --- |
| Codex | [codex.toml](https://eidova.vercel.app/mcp-config/codex.toml) | Project `.codex/config.toml` or the user's Codex config |
| Claude Code | [claude-code.json](https://eidova.vercel.app/mcp-config/claude-code.json) | Project `.mcp.json` |
| Cursor | [cursor.json](https://eidova.vercel.app/mcp-config/cursor.json) | Project `.cursor/mcp.json` |
| VS Code | [vscode.json](https://eidova.vercel.app/mcp-config/vscode.json) | Project `.vscode/mcp.json` |

Examples use public HTTP without credentials. Claude Desktop's local configuration
uses stdio instead; see [CLIENTS.md](CLIENTS.md). No npm installation is required for
public HTTP, and the unpublished npm package must not be presented as an available
`npx` installation.

Reconnect and check discovery: full has 42 public tools, core has 13. A core connection
cannot call full-only tools. Review results are limited to supplied evidence; the
public server does not run projects or provide trusted dashboard captures.

## Local review commands

The installed `eidova-mcp` CLI includes three local project helpers. They read the
files you explicitly name and write JSON reports. They do not upload source or
modify the project.

```sh
eidova-mcp review-browser http://127.0.0.1:5173 --output .work/eidova-review
eidova-mcp preview-install minimal-light .work/project-inventory.json button input
eidova-mcp diff-tokens before.css after.css
```

`review-browser` checks a loopback preview at 390, 1440 and 1728 pixels in light
and dark color schemes. It saves screenshots and reports overflow, automated
accessibility violations, page errors and critical or serious spacing findings.
From the source checkout, install the browser with `npx playwright install chromium`
on Linux or macOS (use `--with-deps` on Linux CI). On Windows the command uses Edge
by default. Set `PLAYWRIGHT_CHANNEL=chromium` to choose installed Playwright Chromium
instead. Use `--ready-selector` for a
screen that loads asynchronously. The command exits with status 1 when a view
fails. It loads same-origin assets, so serve externally hosted assets locally
if they are needed for a representative capture.

The project inventory for `preview-install` is JSON with `files`, `paths.ui`,
`paths.lib`, `paths.css`, `paths.utils`, and optional dependency and registry maps.
Use project-relative paths as resolved by your coding host from `components.json`
and the project aliases. Include the current CSS and utility files in `files` if
they exist. For example:

```json
{
  "files": ["src/components/ui/button.tsx", "src/lib/utils.ts", "src/index.css"],
  "paths": {"ui": "src/components/ui", "lib": "src/lib", "css": "src/index.css", "utils": "src/lib/utils.ts"},
  "dependencies": {"@radix-ui/react-slot": "^1.5.0"},
  "registries": {"@team": "https://registry.example.com/{name}.json"}
}
```

The plan identifies existing files that may need merging, declared package
versions, and registry dependencies that still need resolution. Registry URLs
are never fetched by the preview. `diff-tokens` accepts two CSS files or two
Eidova DTCG JSON exports and reports added, removed and changed declarations.
CSS comparison covers `:root`, `.dark`, `:root.dark`, `html.dark`, and `@theme`.
It compares declared values and alias references without evaluating the cascade.
