# MCP runtime boundaries

This is a static audit of the **published `better-design@0.49.1` npm package**, its shipped `dist/index.js.map`, and the connected MCP metadata saved in `research/interface.json`. No target code was executed and no vendor API was called for this audit. Source-map contents establish source behavior; they do not establish successful runtime behavior or the implementation of remote endpoints.

The connected metadata advertises **46 tools**. The published package and live service differ: `check-first-visit` is present in the connected metadata but absent from the published package's source contents. The connected jig guide has additional modes not established by the published source. Those features require independent implementation rather than being described as recovered code.

Source-map SHA-256: `0ed332448cb3f1d9744153b041e88b30255de43523402cb7b5df7f922a77a333`. There are 168 shared-source modules with source contents. Type-only dependencies omitted from the bundle, such as `data-provider.ts`, are not present in the map; this is separate from the availability of runtime code.

## Recommended integration

Reuse the shared local algorithms and MCP schemas under their MIT license, then replace the original HTTP data provider. `createMcpServer` already accepts the required boundaries:

| Extension | Purpose in an independent service |
| --- | --- |
| `provider` | Local catalog, original guidance/review corpus, local icon catalog, and optional scoped storage. |
| `apiFetch` | An in-process router for project creation/status/config/registry and other replaced endpoints. Fail closed for unknown paths; do not fall through to the vendor. |
| `userId`, `authContext` | A verified caller scope for private data. Anonymous visitors must not share one writable account. |
| `captureDashboardBrowser` | A service-owned browser capture for final dashboard receipts. It receives `{ previewUrl }`. |
| `readInspiration` | A local/open reference catalog. Without it, the tool explicitly reports unavailable. |
| `renderFrames` | Optional local Remotion execution in an explicitly selected user project. Without it, the tool returns render commands. |
| `installKit`, `writeIcons`, `writeKitFiles` | Optional local filesystem operations for stdio clients. A hosted server should return files and commands. |
| `onToolUsage` | Optional scoped session guidance; no original vendor telemetry is necessary. Avoid recording private source or raw credentials. |
| `sendFeedback`, `confirmClaim` | Optional vendor/account integrations. Leaving them absent omits the corresponding tools. |
| `enableDesignPanel: false` | Omits the account-specific panel and `change-design-system` tool, which are not required for the public API. |
| `directoryListing` | Controls instruction/description presentation; it is not authentication or a feature-permission boundary. |

Other feature flags are `enableReactNativeGuide`, `enableThreeJsGuide`, `enableShopifyKit`, `enableMobileKits`, and `enableReviewUiCode`. Most tool families register by default. A tool being registered is not evidence that its provider, browser or remote replacement is available.

### Network paths outside injected `apiFetch`

Injecting `apiFetch` alone does **not** make the recovered runtime independent:

- `catalog-tokens.ts::fetchCatalog` uses global `fetch` to read `globals.json`, optional `all.json`, and five component registries.
- `design-system-tools.ts::fetchBaseVariantNames` uses global `fetch` for a design-system `index.json`.
- `tools/shared.ts::fetchWithTimeout` uses global `fetch`; icon installation uses it for Iconify.
- Shared URL constants use `BETTER_DESIGN_APP_URL` and `BETTER_DESIGN_REGISTRY_URL`, distinct from the npm HTTP client's `BETTER_DESIGN_API_URL`. Their defaults are the vendor origin. Set or replace them before module initialization and localize emitted install/preview URLs.
- Generated snippets, component source, font imports and resource HTML may contain external URLs. Scan output sources separately from server fetch sites.

Patch the catalog readers to local registry data and use an explicitly supported icon source. Do not globally monkeypatch `fetch` on a concurrent public server: per-request state could escape between callers.

## Connected tool map

Names below are canonical hyphenated names; the connected host exposes underscore-normalized names. “Local” describes the algorithm present in the published source, not a claim that an independent deployment has completed it.

| Tool | Observed boundary | Replacement or retained behavior |
| --- | --- | --- |
| `build-feature-map` | Local feature-map parsing and draft heuristics. | Reuse; caller supplies file inventory and retains returned map. |
| `check-comprehension` | Local copy extraction, lexicon and readability/action analysis; optional session/team rules. | Reuse with original local audience vocabulary and guidance. |
| `check-first-visit` | Live metadata only; absent from npm source contents. | Independently implement the supplied-task walkthrough guide/evidence workflow; do not pretend a browser walk happened. |
| `confirm-claim` | Optional account callback; `POST /api/v1/claim/confirm`. | Omit from independent service with no vendor account system. |
| `create-design-system` | `POST /api/projects/anonymous`; asynchronous remote generation. | Local catalog-based project creation or an explicitly configured generation provider. Describe the chosen mode truthfully. |
| `cut-screen-recording` | Local recording-beat planning and browser probe script. | Reuse; caller supplies recording evidence. |
| `detect-icon-library` | Local marker/file-state interpretation. | Return inspection instructions or read only an explicitly selected local stdio project. |
| `extract-design-system` | Local CSS/token extraction and report formatting. | Reuse against caller-supplied CSS; extraction is not a screenshot audit. |
| `extract-from-url` | `GET /api/v1/brand-extract/from-url`; remote browser/extraction service. | Independent public-URL fetch/browser extraction with redirect, private-address and resource limits. |
| `finalize-dashboard-review` | Local structural/comprehension/spacing gates plus injected trusted browser capture. | Reuse algorithm and provide actual service-owned screenshots/landmarks; unavailable capture means incomplete. |
| `find-design-system` | `provider.searchDesignSystems`. | Local catalog search over the 31 included systems. Do not claim equivalence to the current hosted catalog. |
| `find-icon-library` | Provider search. | Local/open icon-library metadata search. |
| `find-icons` | Provider library lookup/search; Iconify-dependent helpers. | Local indexed SVG assets or an explicitly documented open-source icon API. |
| `get-design-config` | Project summary followed by fragment-config HTTP read. | Scoped project/config store. |
| `get-design-system-kit` | Provider catalog/components, global catalog registry fetches, project registry/API, optional local installers. | Localize all registry reads and install URLs; return real source and dependency graphs. Mobile/Shopify targets need actual maintained primitives. |
| `get-design-system-status` | Project summary and generated registry reads. | Local job/project status; no fabricated asynchronous generation or unavailable preview links. |
| `get-illustration-guide` | Provider guidance in `illustration` area. | Original local illustration guidance. |
| `get-inspiration` | Injected `readInspiration`. | Local/open references with accurate provenance. Original private reference corpus is absent. |
| `get-jig-guide` | Local scaffold/snippet generation; live metadata adds modes. | Reuse established modes; independently implement newer modes and never claim a user sent a choice when none arrived. |
| `get-motion-guide` | Local scaffold/generated video component source; provider motion principles for guidance retrieval. | Reuse shipped code and original local motion guidance. Localize generated install/asset links. |
| `get-react-native-guide` | Provider principles in `react-native` area. | Original local native guidance. |
| `get-review-rules` | Provider review corpus plus local format/session weighting. | Original local rules with ids, severity, scope and exceptions; not an approval by itself. |
| `get-sales-principle` | Provider principles in `sales` area. | Original local sales guidance. |
| `get-shopify-guide` | Provider principles in `shopify` area. | Original local Shopify guidance. |
| `get-store-listing-guide` | Local tables, field limits and instructions; instructions name npm listing commands. | Retain factual tables, provide only commands actually shipped by the independent service, and distinguish guide from publishing. |
| `get-swiftui-guide` | Provider principles in `swiftui` area. | Original local SwiftUI guidance. |
| `get-team-rules` | Optional scoped provider storage and project/component context. | Local authenticated storage, or return an explicit unavailable/private-storage requirement. |
| `get-three-js-guide` | Provider principles in `three-js` area. | Original local Three.js guidance. |
| `get-ui-principle` | Provider topic/index/search in `ui` area. | Original local visual corpus. |
| `get-ux-principle` | Provider topic/index/search in `ux` area. | Original local behavior corpus. |
| `get-widget-guide` | Local widget brief plus the format-specific UX topic read. | Reuse brief logic and supply `better-widgets` and `page-families` in area `ux`; the budget fallback uses a `## Minimum build contract` section. |
| `inspect-spacing` | Local rendered-element/native-tree analysis; provider visual-rule rubric. | Reuse exact supplied evidence and local rubric. No capture means needs-capture, not pass. |
| `install-icons` | Iconify SVG retrieval, local component formatting, optional local writes. | Package open SVG assets locally; hosted mode returns files and stdio may write only selected project paths. |
| `make-sales-page` | `POST /api/v1/assets` kind `sales-page`; remote writing/rendering/hosting. | Independently generate truthful page/PDF/image artifacts, or omit until that service exists. |
| `make-social-image` | Same assets endpoint with `social-image`. | Independently render real image artifact, or omit until supported. |
| `plan-video` | Local beat/timeline/scaffold generation and shipped component index. | Reuse; localize any install commands. |
| `preview-design-system` | Provider metadata, global catalog tokens, resource/preview HTML and emitted hosted screenshot URL. | Local assets and actual self-hosted preview route; do not emit nonexistent screenshots. |
| `propose-team-rule` | Optional `provider.proposeTeamRule`; omitted when absent. | Scoped local rule proposal/save semantics with truthful outcome. |
| `read-feature-map` | Local schema validation and feature/capability matching. | Reuse with caller-supplied map; no automatic hosted project discovery. |
| `render-video-frames` | Optional callback that executes user's Remotion project; otherwise command plan. | Command-only in public mode; local execution is optional and explicitly selected. |
| `review-dashboard-structure` | Local deterministic source/fixture/component analysis. | Reuse against exact supplied source/data; not rendered approval. |
| `review-illustration` | `POST /api/illustrations/review`; remote rendering/visual judgment. | Real renderer/visual provider or explicit unavailable status. Text-only checks cannot be presented as having seen the SVG. |
| `send-feedback` | Optional remote messaging callback. | Omit vendor messaging; an independent feedback route would require its own destination and user intent. |
| `set-design-config` | `PATCH /api/fragments/:id/config`. | Validate and scope local changes; retained original schema alone does not sanitize CSS strings. |
| `set-team-rules` | Optional provider save; omitted when no save method exists. | Authenticated durable storage; distinguish first save, replacement and project-rule saves. |
| `update-feature-map` | Local operation-based map update. | Reuse; return updated map and let caller save it. |

## Own-API dispatcher contracts

These are the **request/response slices consumed by the shipped client**. They are not recovered server schemas and do not establish additional server behavior. All are reachable through injected `apiFetch`, except emitted OG URLs, which are client-facing links.

| Method and route | Request | Consumed response |
| --- | --- | --- |
| `POST /api/projects/anonymous` | JSON `{ value: string, designSystemId?: string, brandCss?: string }`; optional bearer. | `{ id?: string }`; missing id is failure. |
| `GET /api/projects/:projectId` | Optional bearer. | `{ name?: string, designSystemStatus?: string, currentStep?: string|null, previewFragmentId?: string|null }`. `COMPLETED` enables completed kit/config paths. |
| `GET /api/projects/:projectId/registry/all.json` | Optional bearer in most call sites; one status read omits it. | Shadcn registry: `{ name?, files?: [{path?,content?}], cssVars?: {light?,dark?,theme?}, meta?: {globalsCss?,installInstructions?,iconLibrary?} }`. `meta.iconLibrary` includes id/name/prefix/variant/defaultVariant. |
| `GET /api/projects/:projectId/shopify/all.json` | Optional bearer. | `{ name?: unknown, shopifyPrimitives?: unknown }`, validated by local primitive-set parser. |
| `GET /api/projects/:projectId/mobile/all.json` | Optional bearer. | `{ name?: unknown, reactNativePrimitives?: unknown, swiftUiPrimitives?: unknown }`, parsed locally. |
| `GET /api/fragments/:fragmentId/config` | Optional bearer; fragment id first read from project. | Raw design-config object. |
| `PATCH /api/fragments/:fragmentId/config` | JSON `{ config: DesignConfig }`, optional bearer. | `{ config?: unknown }`; 404 is ownership/not-found failure. |
| `GET /api/v1/brand-extract/from-url?url=...&name=...` | URL and optional name query; optional bearer; 90-second timeout. | `{ markdown: string, notes?: string[], summary?: ExtractionSummary }`; failed request consumes `{ message?: string }`. |
| `POST /api/illustrations/review` | JSON `{ svg, intent, animated: boolean, style, reviewToken? }`, optional bearer; 60-second timeout. | `{ faults?: string[], layers?: string[], reviewed?: boolean, unseen?: boolean, reviewToken?: string }`. Do not set reviewed true without actual render/visual evidence. |
| `POST /api/v1/assets` | JSON `{ kind: 'sales-page'|'social-image', designSystemId, company, website, offer, ctaUrl, notes?, headline?, ctaLabel?, problem?, proof1?, proof2?, proof3? }`; requires authContext in original tool. Only sales-page accepts ctaLabel/problem/proof fields; headline is shared. | `{ id:string, status:string, viewUrl:string, imageUrl:string|null, pdfUrl:string|null }`. These must be real artifacts/links. |
| `POST /api/v1/feedback` | Optional callback posts supplied report with bearer. | `{ id, status?, message? }`. Not registered without callback. |
| `POST /api/v1/claim/confirm` | Optional callback posts `{code,confirm}` with bearer. | `{claimed?,keysMoved?,account?,message?}`. Not registered without callback. |
| `POST /api/messages` | JSON `{value:change, projectId}`, optional bearer. | Change-start response; used only by panel's project-change tool. Disable panel to omit. |
| Emitted `/api/og/preview?id=...` or `?fragment=...` | Client-facing screenshot image URLs, no server-side fetch here. | Real preview image required if these fields remain in responses. |

`DesignConfig` is a partial object:

```ts
{
  colors?: Partial<Record<
    'primary'|'secondary'|'accent'|'muted'|'destructive'|'background'|
    'foreground'|'card'|'cardForeground'|'popover'|'popoverForeground'|
    'border'|'input'|'ring', string>>;
  radius?: string;
  font?: { sans?: string; mono?: string };
  icons?: { libraryId?: string; variant?: string|null };
  density?: 'compact'|'comfortable'|'spacious';
}
```

The original schema accepts arbitrary strings for CSS/color/font fields. An independent public implementation needs length and syntax validation before interpolating them into CSS or HTML.

## Original HTTP-provider methods

The original provider is a thin wrapper around these remote data operations. A local provider can implement the methods directly without exposing these REST routes:

- `searchDesignSystems(query,limit)` → ranked catalog entries.
- `getDesignSystemById(id,options)` → `{metadata,components}`; options include component names/code, HTML and mobile/Shopify primitive selection.
- `listPrinciples(area)` → topic/title/alias index.
- `getPrincipleByTopic(topic,area)` → principle/document or null.
- `searchPrinciples(query,limit,area)` → ranked guidance results.
- `getReviewRules(category)` → rule array.
- `getRecentGuidance(userId,sinceMs)` → scoped session-call array.
- `getTeamRules(userId)` → markdown.
- `saveTeamRules`, `proposeTeamRule`, `getProjectScreenContext`, `saveProjectRule` → optional authenticated state operations.
- `searchIconLibraries`, `getIconLibraryById`, `searchIconsInLibrary` → icon catalog and assets.
- `getProjectShopifyPrimitives`, `getProjectMobilePrimitives` → optional persisted counterpart sources, never a promise that generic web components are native equivalents.

The area values observed in guide calls are `ui`, `ux`, `sales`, `react-native`, `three-js`, `shopify`, `motion`, `swiftui`, `illustration`; team component guidance additionally queries `components`.

## Trusted dashboard evidence

The final review callback receives `{ previewUrl }`. The consumed capture includes that same URL, a valid `deploymentRevisionSha256`, and measured `states` at 390, 1440 and 1728 pixels. Each state needs actual PNG screenshot data and correlated measured dashboard landmarks. The algorithm checks source, fixture, component composition, copy and rendered spacing before returning a receipt.

The original receipt labels `issuedBy` as `better-design-mcp`. Change that to the independent service identity. Its `receiptId` is a SHA-256 digest of receipt fields, **not a keyed signature**; this establishes content addressing, not cryptographic authenticity. Missing or unsupported browser evidence must continue to return an incomplete result.

## Audit limits

The private guidance corpus, hosted generation model/prompt pipeline, database contents, billing/access rules, reference-screen library and browser service were not recovered. Provider/endpoint contracts show what needs replacing, not how the original service implemented it. A public release should publish an accurate supported-tool inventory and disable incomplete capabilities rather than presenting fallback plans or registration as successful execution.
