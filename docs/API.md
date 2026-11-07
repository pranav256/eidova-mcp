# Public API

Origin: `https://open-design-mcp-liard.vercel.app`.

| Route | Method | Result |
| --- | --- | --- |
| `/` | GET | Service metadata and website/repository links |
| `/health` | GET | Service health |
| `/mcp`, `/api/mcp` | POST | MCP JSON-RPC over stateless Streamable HTTP |
| `/api/catalog` | GET | 31 local catalog entries |
| `/registry/{system}/{component}.json` | GET | shadcn registry item with local dependencies |
| `/registry/{system}/all.json` | GET | Aggregate registry install |
| `/icons/lucide/{name}.svg` | GET | Bundled SVG icon |
| `/api/workspace-key` | POST | Fresh capability key; not registered to an email account |
| `/api/projects/anonymous` | POST, bearer key | Catalog-based persistent theme creation |
| `/api/projects/{id}` | GET | Public project status |
| `/api/projects/{id}/registry/{component}.json` | GET | Public custom-theme registry |
| `/api/fragments/{id}/config` | GET | Current theme configuration |
| `/api/fragments/{id}/config` | PATCH, owner bearer key | Configuration update: `{ "config": { ... } }` |
| `/api/v1/brand-extract/from-url?url=...` | GET | Limited CSS-only token extraction from public URL |

List the exact supported MCP schema with `tools/list`, and use
`get-capabilities` for scope. Anonymous tool discovery omits private mutation
tools such as `set-team-rules`; authenticated discovery includes them. No vendor
keys, account claims, telemetry or vendor HTTP fallbacks are used.

Source review requires inline file contents, never a path to read on the server.
Spacing accepts rendered DOM measurements. URL extraction validates/pins public
DNS and bounds redirects, bodies and total request duration. It does not render
the page. Video tools return plans and commands; they do not execute a caller's
project on the hosted server.

Custom themes are deterministic; a selected base supplies the implementations.
Public project URLs intentionally allow registry installation without embedding
the private workspace key. Treat public theme names/configuration as published
content and use the capability only for private rules and mutations.
