# Public API — 0.2.0 candidate

These routes describe the local candidate. The existing hosted `/mcp` is the previous release; hosted core and new component previews require the coordinated [release](DEPLOYMENT.md).

| Route | Method | Result |
| --- | --- | --- |
| `/` | GET | Service metadata and website/repository links |
| `/health` | GET | Health and candidate version |
| `/mcp`, `/api/mcp` | POST | Full MCP, stateless Streamable HTTP |
| `/mcp/core`, `/api/mcp/core` | POST | Core MCP, 11 typed read-only tools |
| `/api/catalog` | GET | All 31 compatible IDs with family/variant metadata |
| `/registry/{system}/{component}.json` | GET | shadcn item with local dependency closure |
| `/registry/{system}/all.json` | GET | Aggregate registry install |
| `/icons/lucide/{name}.svg` | GET | Bundled SVG |
| `/api/workspace-key` | POST | New bearer capability; no email account |
| `/api/projects/anonymous` | POST, owner key | Persistent catalog-based custom theme |
| `/api/projects/{id}` | GET | Public custom-theme status |
| `/api/projects/{id}/registry/{component}.json` | GET | Public custom-theme registry |
| `/api/fragments/{id}/config` | GET | Public theme configuration |
| `/api/fragments/{id}/config` | PATCH, owner key | Update `{ "config": { ... } }` |
| `/api/v1/brand-extract/from-url?url=...` | GET | Bounded public CSS extraction |
| `/api/v1/project-rules/{id}?screen=...&parts=...` | GET, owner key | Private selected rules/context |
| `/api/v1/project-rules/{id}` | PUT, owner key | Save a slot; conflicting replacement requires `replaceExisting: true` |
| `/design-systems/{id}`, `/projects/{id}`, `/preview/{id}` | GET | Retained JSON metadata endpoints |

MCP uses POST, not a browser GET or legacy SSE connection. GET on MCP routes returns 405. Initialize each stateless connection; there is no persistent session ID. Core/full selection is fixed before connecting. Full discovery has 40 anonymous tools and 41 with an owner key; core stays at 11. Exact schemas, resources and prompts are discoverable through the protocol. A missing tool in core requires reconnecting to full.

Public catalog, extraction and reviews need no key. Private edits/rules require `Authorization: Bearer <workspace-key>`. Other owners receive 404 for private project-rule access. Keys never belong in URLs. Public custom-theme names/configuration and registry source are intentionally visible; private rules are owner-scoped.

Source review accepts inline content only and executes no submitted code. Export is a [DTCG 2025.10 typed subset](DTCG.md). URL extraction pins public DNS, validates redirect destinations, bounds bodies/time and supports cancellation; it does not render pages. Spacing/comprehension reviews assess supplied evidence. Video/native instructions and incomplete browser review never become execution or capture claims.

JSON bodies are limited to 4 MB. A shared 16-request process cap covers MCP and REST extraction before body parsing; overload returns 429 and `Retry-After: 2`. This is not a global hosting rate limit. MCP/private API responses use `no-store`; public catalog/registry responses use a 300-second cache and Express ETags.

Diagnostics contain request ID, whitelisted operation, elapsed milliseconds, parsed body bytes, HTTP status and boundary error class. They exclude source, rules, credentials and caller URLs. MCP tool errors delivered with HTTP 200 remain protocol tool errors, not HTTP failure counts.

See [client setup](CLIENTS.md), [security](../SECURITY.md) and [candidate evidence](RELEASE-CANDIDATE.md).
