# Public API — 0.2.0 candidate

These routes describe the local candidate. The existing hosted `/mcp` is the previous release; hosted core and new component previews require the coordinated [release](DEPLOYMENT.md).

| Route | Method | Result |
| --- | --- | --- |
| `/` | GET | Service metadata and website/repository links |
| `/health` | GET | Health and candidate version |
| `/mcp`, `/api/mcp` | POST | Full MCP, stateless Streamable HTTP |
| `/mcp/core`, `/api/mcp/core` | POST | Core MCP, 13 typed read-only tools |
| `/api/catalog` | GET | All 31 compatible IDs with family/variant metadata |
| `/api/design-systems/{id}/design.md` | GET | Portable DESIGN.md attachment with exact tokens, CSS hash and usage rules |
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

MCP uses POST, not a browser GET or legacy SSE connection. GET on MCP routes returns 405. Initialize each stateless connection; there is no persistent session ID. Core/full selection is fixed before connecting. Full discovery has 42 anonymous tools and 43 with an owner key; core stays at 13. Exact schemas, resources and prompts are discoverable through the protocol. A missing tool in core requires reconnecting to full.

`find-design-system` accepts `query`, optional `limit` (1–8) and optional `requiredComponents` (1–12 exact registry names). Results include actual matched terms, family use cases and tradeoffs. Required components are hard constraints; an unknown component produces no matches. Ranking is lexical, ignores common brief filler, and preserves exact ID selection. Suitability is editorial guidance, not user research.

Catalog kits include `designContext: { uri, url }`. Read `design://systems/{id}/design.md` through MCP or download the identical document from the HTTP route. All 31 documents appear in `resources/list`. Save DESIGN.md only if absent; otherwise merge with existing project decisions. Documents preserve registry scope names, which do not necessarily describe the palette's appearance. Their hash covers source CSS only. Unknown IDs return 404 without a download header or public cache. Custom projects and archived native kits do not receive catalog web instructions.

Public catalog, extraction and reviews need no key. Private edits/rules require `Authorization: Bearer <workspace-key>`. Other owners receive 404 for private project-rule access. Keys never belong in URLs. Public custom-theme names/configuration and registry source are intentionally visible; private rules are owner-scoped.

Source review accepts inline content only and executes no submitted code. Export is a [DTCG 2025.10 typed subset](DTCG.md). URL extraction pins public DNS, validates redirect destinations, bounds bodies/time and supports cancellation; it does not render pages. Spacing/comprehension reviews assess supplied evidence. Video/native instructions and incomplete browser review never become execution or capture claims.

JSON bodies are limited to 4 MB. A shared 16-request process cap covers MCP and REST extraction before body parsing; overload returns 429 and `Retry-After: 2`. This is not a global hosting rate limit. MCP/private API responses use `no-store`; public catalog/registry responses use a 300-second cache and Express ETags.

Diagnostics contain request ID, whitelisted operation, elapsed milliseconds, parsed body bytes, HTTP status and boundary error class. They exclude source, rules, credentials and caller URLs. MCP tool errors delivered with HTTP 200 remain protocol tool errors, not HTTP failure counts.

See [client setup](CLIENTS.md), [security](../SECURITY.md) and [candidate evidence](RELEASE-CANDIDATE.md).

## Bundled OpenDesign resources

Both tool profiles include `search-resources` and `read-resource`. Search returns a next tool call; reading a manifest lists the file URIs, hashes, previews and license paths. Text reads paginate by Unicode code points; binary reads return typed download URLs. See [BUNDLED-RESOURCES.md](BUNDLED-RESOURCES.md) for all 784 package manifests, native MCP resources, paginated HTTP search, original media, safe attachment routes and sandboxed HTML previews used by the website reader. `get-capabilities` reports the full library count and its resource kinds.
