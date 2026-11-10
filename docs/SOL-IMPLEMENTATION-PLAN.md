# Sol implementation plan: finish and differentiate Open Design MCP

Prepared and implemented locally: 2026-11-10. Status: **0.2.0 local release candidate; release gates remain open**. See [candidate verification](RELEASE-CANDIDATE.md) for evidence and limits.

Checked tasks below record local implementation/verification, not deployment or complete phase acceptance. Unchecked tasks identify optional omissions or remaining release work.

| Phase | Current status |
| --- | --- |
| 0 — Baseline | Repeatable SDK byte/latency benchmark and candidate checks complete |
| 1 — Families/previews | Eight internally reviewed families; all 31 IDs retained; faithful specimens complete |
| 2 — Context cost | Local byte/latency gates pass; named-host context traces pending |
| 3 — Setup | CLI/package/client examples and browser recovery complete; actual five-minute host walkthroughs pending |
| 4 — Reliability | Local protocol/security/store checks pass; CI configured; remote matrix/global abuse controls pending |
| 5 — Release | Web/DTCG/metadata/artifacts/rollback prepared; naming, staging, promotion and publication pending |

## 1. Mission and instructions for Sol

Make this a polished, dependable design MCP that is easy to connect, economical with agent context, and produces visibly different, useful design systems. The user identified theme sameness as a core product defect. Build useful differences in real components rather than adding more color presets.

The intended first result: a developer connects an agent, describes a screen, finds a suitable design family, installs only the necessary real components, and receives actionable review findings. Existing product design must remain the starting point when present.

Work through the phases below in order. Finish each phase's acceptance checks before marking it complete. Preserve existing callers, private workspace data, old theme IDs, registry URLs and client connections. Reuse existing code and dependencies; do not rewrite the server wholesale. No arbitrary public code execution, hidden model calls, or invented verification claims.

The later instructions authorized implementation and Git commits/pushes for both repositories. Package/Registry publication, permanent renaming and domain purchases remain separate decisions. Check any deployment triggered by the existing Git integration against the exact pushed commits.

### Latest website direction — authoritative

The installation guide belongs in the hero, with six client formats, Essentials as default and full tools in collapsed Tool options. Keep the website's own Geist design fixed, with its light/dark toggle in the header. Catalog selection opens a separate modal viewer of actual family components. Preserve all 31 IDs, exact variant token links, setup/scroll/focus and URL/history; explain when a variant shows its representative family. The former Precision/Editorial/Tactile hero demo and whole-site palette application were removed at the user's request. Follow this direction for future work.

### Workspace map

The parent directory is **not** a Git repository. There are two independent repositories:

- `MCP` = `D:\Projects\open-design\open-design-mcp`
- `WEB` = `D:\Projects\open-design\open-design-website`

Paths below use these prefixes. Check each repository's Git status and applicable AGENTS.md before edits. Keep this document current with completed tasks, evidence paths and outstanding blockers. Do not overwrite unrelated changes.

## 2. Observed baseline, not a fresh release certification

### Existing strengths to retain

- TypeScript service with stateless Streamable HTTP and local stdio.
- 31 registry themes, actual React/Radix source, shadcn-compatible dependency resolution and bundled Lucide icons.
- Original editable guidance, lexical retrieval, source/comprehension/spacing reviews, feature maps and first-visit report workflows.
- Deterministic custom themes, owner-scoped project rules, local persistence and private Vercel Blob persistence.
- Public URL extraction with DNS pinning and bounded fetching; public source review requires inline content.
- Website search, filtering, shareable URLs, clipboard recovery and accessibility checks.
- An opt-in private offline archive, excluded from public distribution.

`MCP/docs/RELEASE-VERIFICATION.md` reports 72 service tests and prior browser checks. Those are historical results. During planning, the local probe failed because dependencies/`tsx` were missing. Dependencies were subsequently installed in both repositories; the candidate now passes 89 service tests, both typechecks/builds and the checks in [RELEASE-CANDIDATE.md](RELEASE-CANDIDATE.md). Do not confuse those results with the earlier release.

### Live read-only measurements taken during planning

Endpoint: `https://open-design-mcp-liard.vercel.app/mcp`, server `OpenDesign` version `0.1.0`.

| Measurement | Observed value |
| --- | ---: |
| Public tools | 40 |
| Compact JSON encoding of `tools/list` result | 125,752 UTF-8 bytes |
| Tool description text combined | 51,774 characters |
| Initialize instructions | 1,961 characters |
| `get-design-system-kit` description | 13,582 characters |
| `get-ui-principle`, topic `spacing`, `maxTokens: 600` | 1,166 response bytes |
| `find-design-system`, query `minimal SaaS dashboard` | 34,523 response bytes |

These are wire-size measurements, **not token counts**. Client rendering, schema injection, repeated content and tokenizer choice change context cost. Reproduce them against the local candidate and compare with actual client traces.

### Planning diagnosis of theme sameness

Source inspection during planning found:

- At the planning baseline, `WEB/src/theme.ts` changed palette variables on the same page without loading each theme's actual component implementations.
- `WEB/src/theme.css` keeps Geist; none of the 31 entries in `WEB/src/catalog-themes.json` exports font tokens.
- 30 of the 62 website theme/mode combinations are marked `adapted`, so a large portion uses synthesized light/dark appearances.
- Exact file-content hashing across the 31 registries found 29 button implementations, 25 inputs, 29 cards, 22 sidebars and only 6 table implementations. Nineteen themes share the same table source; three metal themes share button and card source.

Shared accessible implementation is useful and does **not** prove identical rendering: CSS tokens can change its appearance. Conversely, different source does not prove useful visual variety. The confirmed planning defect was that the website presented palette changes as the main way to judge design systems. The candidate now keeps the site fixed and previews eight actual-component specimens in a separate viewer; matching-content visual and installed-consumer checks are recorded below.

### Existing boundaries and gaps

- The original preview links returned JSON metadata (`MCP/src/app.ts`). Compatible metadata endpoints remain; the candidate distinguishes actual family specimens from “View tokens” links.
- Trusted service-owned dashboard browser captures are not implemented. A supplied-evidence check must not become a visual approval.
- Public native/Shopify installation kits, proprietary inspiration, hosted AI generation and vendor account features are absent or deliberately omitted.
- `MCP/src/mcp.ts` depends on pinned SDK registration internals through `_registeredTools`.
- `MCP/scripts/build-upstream.mjs` already guards review-loader replacements and checks the built runtime for forbidden filesystem review helpers. Preserve this; extend guards where missing instead of reimplementing completed work.
- Capability keys currently act as bearer capabilities rather than a recoverable account system. Rotation/revocation is not a documentation-only change.

## 3. Product decisions

**Recommended v1 scope:** excellent web design-system selection, faithful component delivery, honest review, simple setup and low context use. Keep advanced tools available through explicit profiles where useful.

**Theme direction:** curate approximately 6–8 clearly different design families first; place minor color/material variations beneath their family. Preserve all old registry IDs as compatibility entries. Do not advertise 31 distinct visual systems merely because 31 folders exist.

**Efficiency direction:** short typed tools with progressive detail. Keep ordinary MCP calls working everywhere. Host-native tool search is an optimization, not a requirement for using the server.

**Trade-offs:** curation reduces headline theme count but makes choice easier; real component previews cost more to maintain but represent the install accurately; a smaller default tool set saves context but needs an obvious route to advanced tools. Keep shared accessible primitives rather than duplicating code to manufacture difference.

## 4. Phase 0 — Establish a reproducible baseline

Scope: both package manifests/lockfiles; `MCP/tests`, `MCP/scripts`, `MCP/src/mcp.ts`; existing review docs.

- [x] Install dependencies with `npm ci` separately in MCP and WEB. Use the required Node version, record the actual version, and do not upgrade packages as a side effect.
- [x] Run MCP typecheck, tests, production build and built-stdio smoke. Run WEB typecheck/build. Retain the failed planning probe as historical evidence and distinguish candidate results from original-release checks.
- [x] Add one small benchmark script using the existing SDK/InMemoryTransport. Measure anonymous and owner discovery, initialize instructions, representative calls, cold/warm latency, and complete workflow bytes/call counts. Use disposable local state and redact credentials/source content from reports.
- [x] Include at least six fixed tasks: choose/install a theme; preserve an existing brand; review a form; review supplied spacing evidence; save/read owner rules; recover from invalid or unsupported input.
- [x] Record wire bytes separately from real token counts. If adding a tokenizer, keep it development-only and justify it; record encoding/version. Token estimates must be labelled estimates. Sol's client must not silently stand in for every supported host.
- [x] Add checked-in benchmark fixtures and a compact results report, not private traces. Include an assert-based self-check for the new script.

Done when: a clean checkout produces a repeatable report, baseline failures are documented, and the existing deployment's numbers are not confused with the local candidate.

Local evidence: [baseline](BENCHMARK-BASELINE.json), [candidate](BENCHMARK-CANDIDATE.json), [method](BENCHMARK.md), `scripts/benchmark.ts` and `.work/verification/service-tests.log`. Reference environment: Node 24.20.0, Windows x64, Intel Core 3 100U. No tokenizer or private/client trace was added.

## 5. Phase 1 — Fix theme sameness and preview fidelity

Scope: `MCP/src/catalog.ts`, `MCP/assets/registry`, registry tests; `MCP/scripts/sync-website-themes.mjs`, website verification scripts; `WEB/src/App.tsx`, `theme.ts`, `theme.css`, `styles.css`, `catalog-themes.json`, UI components and `.better-design/feature-map.json`.

- [x] Audit all 31 themes across typography, spacing/density, radius, border/elevation, surface treatment and component states. Compare light/dark appearances separately. Record native versus adapted variants.
- [x] Render the **same content** using actual installed Button, Input, Card, Dialog, Table and navigation components from representative kits. Inspect computed fonts and CSS, not just catalog metadata. A compact settings/form specimen is sufficient; do not build a whole new dashboard to compare themes.
- [x] Group near duplicates into families. Final groups: Precision, Editorial, Marketplace, Tactile, Industrial, Glass, Neutral and Expressive.
- [x] Choose 6–8 strong initial families after comparison. Each promoted family must have a written recipe and visibly distinct treatment on at least three non-color axes. Demonstrate at least two differentiated component treatments. This is a proposed editorial gate, not an automated aesthetic score.
- [x] Keep common accessible behavior shared. Only change styling or composition where the family calls for it. Do not copy 31 complete component trees just to make their hashes differ.
- [x] Treat palette/material alternatives such as metal gold/silver/chromatic as variants when comparison supports that grouping. Keep old IDs resolvable; search should avoid filling the first results with siblings.
- [x] Add explicit family/variant metadata at the catalog's existing source of truth. Return a short distinguishing reason and relevant compatibility facts; do not introduce a second hand-maintained catalog.
- [x] Present actual component specimens in a separate viewer from family selection. Keep the site's own shell fixed. Put imported kit CSS/fonts in an isolated preview boundary so they cannot break the connection UI; label representative-family previews for variants and link their exact tokens.
- [x] Load correctly licensed fonts for previews, with useful fallbacks. Do not silently represent every kit with Geist or load every font on initial page load.
- [x] Label adapted appearances; preserve their contrast corrections. Fix adaptation only where evidence shows it flattens useful distinctions. Never sacrifice legibility to preserve a brand color.
- [x] Replace misleading JSON “preview” links with a real preview route or an honest “View tokens” label. Preserve old metadata endpoints and links where external callers depend on them.
- [x] Follow the latest website request: put installation in the hero, remove the Precision/Editorial/Tactile demo and global palette controls, keep the site fixed and preview themes in a separate viewer. Retain eight real native gallery images, improved typography and workflow composition. Reuse existing tokens/components; add no new dependencies. Preserve all 31 IDs and setup/browser behavior.
- [ ] Optional two-family playground intentionally skipped: directly comparable real specimens satisfy the minimum requirement.

Done when: the promoted families are visibly distinguishable on matching content/widths, previews reflect installed source, old theme links still work, and all required rendered/accessibility checks pass. Automated source/token distance can flag candidates; visual inspection makes the final differentiation judgment. Record that this is internal review unless real user testing actually occurred.

Local acceptance passed: eight matching-width desktop screenshots visually inspected, 96 native states checked, exact source copies/loaded fonts verified and 74 fixed-site viewer layouts / 148 parent-and-iframe states checked. [Recipes](DESIGN-FAMILIES.md) and [audit](THEME-AUDIT.json) document the differences. This does not certify every sibling's native states in both modes or substitute for user research.

The installation-first website has 51 passing comprehension panels plus 31 passing viewer copy checks and before/after captures at all three widths. Keyboard opening, iframe/nested Escape, close focus return, sample reset, setup/scroll retention, URL/history, old saved palettes, invalid IDs and disabled storage passed without changing the site tokens or refetching the catalog. Eight native PNGs total 260,311 bytes; kit/composer/CSS/image hashes are verified. Current evidence is in `MCP/.work/installation-first/`, retained native evidence in `MCP/.work/site-elevation/specimens/`, and the sibling website's `docs/REVIEW.md`. Reproduce gallery captures only after specimen source/style changes, then rebuild the website.

## 6. Phase 2 — Reduce discovery and response cost

Scope: `MCP/src/mcp.ts`, `provider.ts`, `guidance.ts`, `catalog.ts`, `app.ts`, `stdio.ts`; relevant upstream adapter/registration source, tests and setup docs.

- [x] Shorten descriptions to purpose, key inputs and essential side effects/boundaries. Remove repeated essays from discovery. Keep precise names, enums and validation rather than replacing every tool with an untyped `execute(action, payload)` dispatcher.
- [x] Put detailed workflow guidance into a versioned resource and a small number of optional MCP prompts. Resources/prompts do not automatically load or enforce behavior: retain concise critical constraints in relevant descriptions and tool results.
- [x] Keep `/mcp` backward compatible. Add a documented core profile, preferably a deterministic `/mcp/core` endpoint and equivalent stdio option. Map the existing provider/handlers into it; do not clone implementations.
- [x] Public core has 11 tools: capabilities, design-system search, kit retrieval, supplied-source extraction, URL extraction, UI guidance, UX guidance, review rules, source review, comprehension and spacing. Private mutation and specialist workflows stay in full.
- [x] Client setup must show how to choose full or core before connecting. Never assume an absent tool becomes callable because a search result mentions it. Do not depend on dynamic tool-list mutation in the current stateless HTTP design.
- [x] Search returns a few compact summaries: stable ID, family/variant, why it fits, key visual differences, supported target and next retrieval input. No full component source/CSS or exhaustive catalog by default.
- [x] Fetch only selected components. Keep full kits/code behind explicit retrieval and registry URLs. Do not dump all source into both prose and structured output on a search call.
- [x] Bound guidance/review output by whole items; return a clear continuation when more exists. Do not chop JSON, code, citations or essential failure explanations at an arbitrary character offset.
- [x] Reuse existing detail/limit/maxTokens support where possible. Add parameters only where they solve a measured problem. Do not spread unused options across every tool.
- [x] Preserve MCP structured-result compatibility. When serializing structuredContent into text for older clients, use the same compact payload; do not add a second long prose explanation. Validate any advertised outputSchema. Measure both representations because hosts may expose both.
- [x] Correct irrelevant “next tool” boilerplate: return the next useful action for the request. Do not restart theme discovery after every review or guidance result.
- [x] Cache immutable public catalog/registry content with appropriate version/ETag behavior. Keep private results owner-scoped and out of shared caches. HTTP caching reduces network/CPU; do not present it as automatic model-context savings.
- [ ] Record actual named-host discovery/context traces and successful workflows, including a host without resource-rich UI or deferred tool loading.

Proposed performance gates, to validate against Phase 0:

| Gate | Target |
| --- | --- |
| Core `tools/list`, compact UTF-8 JSON | <= 32 KiB |
| Full `tools/list` | <= 70 KiB, preserving necessary schemas |
| Default theme search result | <= 8 KiB, including compatibility text |
| Ordinary focused guidance result | <= 4 KiB by default |
| Same-task MCP protocol bytes versus baseline | >= 50% reduction on the fixed benchmark; host context/token savings require separate traces |
| Local warm catalog/guidance latency | p95 <= 200 ms on recorded reference hardware |

These targets now pass in the local benchmark; they are not universal host guarantees. If a budget conflicts with correctness, explain and adjust the budget with evidence rather than deleting required data. Separate large explicit source retrieval and network extraction from small-response budgets.

Done when: budgets are enforced by meaningful checks, old schemas/calls still work, and recorded client workflows show successful selection/install/review with reduced context. Test at least one host without resource-rich UI or deferred tool loading.

Local gates passed: full public discovery 51,503 bytes; owner 52,511; core 19,237; search 6,983. All six full workflows reduce bytes by at least 50%; five core workflows use plain tools. Warm catalog/guidance p95 is 0.75/0.13ms over 20 samples each. Host walkthroughs and real token/context traces remain open acceptance work. See [BENCHMARK.md](BENCHMARK.md).

## 7. Phase 3 — Make first use and everyday use straightforward

Scope: both READMEs, `WEB/src/App.tsx` and connection flow, MCP package/stdio entry, capabilities and error responses; packaging/client smoke fixtures.

- [x] Offer two clear setup paths: hosted connection and local package. No account/key for public catalog and reviews. Explain private workspace setup only when saving is needed.
- [x] Provide client-specific examples for Codex, Claude Code/Desktop, Cursor and VS Code, checked against official formats on 2026-11-10. Their configuration formats differ; do not copy one generic JSON shape into all tabs. Actual host walkthroughs remain unverified.
- [x] Make local packaging installable: deliberate candidate package name/version, `bin`, explicit published-file allowlist, correct resource resolution and Node engine. Removed `private: true` during packaging work; no publication occurred and namespace ownership remains unchecked.
- [x] Use `npm pack --dry-run` and install the resulting tarball in a disposable directory. Confirm assets/content/runtime/notices/release docs ship, while `.work`, private archives, workspace state and secrets do not. Test from a different working directory and Windows paths containing spaces.
- [x] Add offline `doctor` for version, transport and bundled assets; keep public connectivity checks separate in `/health` and read-only protocol smoke. Do not print keys/private data or edit client configuration implicitly.
- [x] Give three copyable first tasks: “find a distinctive theme for this screen,” “use this existing brand,” and “review this form.” Optional MCP prompts should reuse these examples.
- [x] Normalize recoverable errors: what failed, whether anything changed, and the next valid action. Preserve submitted context where safe. Mark execution failures with `isError`; use proper protocol errors for malformed requests. Do not turn missing capability into a success-shaped empty result.
- [x] Make capabilities truthful per mode: public HTTP, local stdio, owner workspace and saved archive. Distinguish installed/generated/captured/instructions-only/source-only/rendered evidence.
- [x] Show package version, docs, status and self-hosting path without inflating the page into a marketing dashboard. Put installation in the hero and first tasks below the workflow. Keep existing header/footer links and preview/search/connection state.
- [ ] Observe fresh five-minute setup/recovery walks in the named hosts; record actual host versions and results.

Done when: a fresh setup can connect and get its first useful result within five minutes in an observed walkthrough; clipboard denial, wrong URL, invalid key, unsupported target and missing assets all have useful recovery. Record tested client versions; untested clients are labelled as such.

Local package/SDK/browser checks passed. The installation-first website has six setup tabs and 51 reviewed panels; footer version/docs/health assertions passed. [CLIENTS.md](CLIENTS.md) distinguishes documented formats from actual host verification. Verify hosted core support and coordinated versions when observing the deployment triggered by the authorized pushes.

## 8. Phase 4 — Strengthen quality, protocol and operational reliability

Scope: `MCP/src/app.ts`, `safe-fetch.ts`, `public-fetch.ts`, `store.ts`, `projects.ts`, `project-rules-store.ts`, `mcp.ts`; runtime build adapter; security/protocol/store tests and deployment config.

- [x] Verify tool annotations for read-only, destructive, idempotent and external effects against actual handlers. Annotations guide clients; they are not authorization enforcement.
- [x] Add protocol tests for initialize/version negotiation, schema validation, errors, advertised resources/prompts, stateless reconnects and stdio stdout cleanliness. Preserve public compatibility and test auth-dependent discovery.
- [x] Keep private rules/edits isolated and require explicit replacement semantics already enforced. Test partial persistence failure and concurrent writes. Do not reduce current atomic/conditional-write protections.
- [x] Document capability-key storage and loss. Do not promise revocation or recovery that the hash-derived capability model cannot deliver. If user-controlled rotation/revocation is a release requirement, design a minimal persisted workspace credential mapping and migration before claiming support.
- [x] Verify private responses use appropriate cache controls, credentials never enter URLs/logs, public registry data is intentionally public, and errors do not expose server paths or source.
- [x] Preserve SSRF protections on every externally fetched resource. Check redirects, DNS rebinding, IPv4/IPv6 edge cases, response/time limits and cancellation behavior. A browser worker later needs separate controls for subresources/WebSockets/downloads.
- [x] Extend fail-closed upstream patch checks to security-critical network substitutions and assert expected match counts. Test a changed patch target fails the build. Never directly re-enable unsafe upstream filesystem/installer callbacks on HTTP.
- [x] Pin/test the current `_registeredTools` adapter. Supported registration APIs are used for new resources/prompts; the existing vendor-tool adapter still relies on SDK internals. Do not launch an unrelated full vendor rewrite.
- [x] Bound HTTP request sizes/expensive-request concurrency and return safe 429 responses with retry guidance.
- [ ] Configure and verify deployment-wide Vercel rate/abuse controls. The 16-request process cap is local to one instance and is not global enforcement.
- [x] Add minimal diagnostics: request ID, operation, duration, size and error class. No user source, project-rule text or secrets in default logs. Publish only measured uptime/latency and hosting limits.
- [x] Improve review usefulness with a small labelled corpus: known real defects, clean examples and previous false positives. Check finding IDs, severity, file/line/evidence and repair guidance. Critical/serious findings must remain visible under output budgets.
- [x] Add CI for the existing checks, package smoke, benchmark regressions, registry integrity and critical boundary tests. Use available dependency scanning; do not mass-upgrade unrelated libraries.
- [ ] Run remote CI across its Node 22/24 and Linux/Windows matrix, including the clean consumer job.

Done when: no known unresolved critical/serious issue remains in the release scope, CI passes, and each advertised behavior has a relevant check. A deterministic checker passing is not accessibility certification or proof that an entire product works.

Local service suite: 89/89 passing. Both production audits report zero vulnerabilities. Upstream guards, primitive scoping and labelled review regressions pass; remote CI/global controls remain release gates. [SECURITY.md](../SECURITY.md) records key and review boundaries.

## 9. Phase 5 — Complete web delivery and prepare release

- [x] Validate all retained registry IDs, dependency closure and CSS variables. Install representative families in clean supported React/Vite and Next.js consumer fixtures; test actual build and interactive states. Specify Tailwind/Radix/framework requirements and unsupported versions.
- [x] Verify existing DTCG export against the chosen Design Tokens Community Group format version. Preserve aliases/types where supported; document unsupported composites. Do not label a partial CSS dictionary as complete standards compliance.
- [x] Address measured guidance gaps with versioned workflow/first-task examples, whole-entry retrieval, actionable review regressions, provenance and explicit evidence boundaries. Existing original guidance remains editable; no embeddings/vector database added.
- [x] Prepare `server.json` and npm/registry metadata, changelog, supported-client matrix, security reporting, licensing/provenance notices and concise self-hosting docs. Verify the current official registry schema rather than copying a stale example.
- [x] Prepare local build/package artifacts and rollback instructions. Coordinate MCP URLs, website build variables/proxy rewrites, install examples and package metadata across both repositories; execution on Docker/Vercel remains untested.
- [ ] Apply the chosen name only after selection and basic collision checks. Preserve transport routes, registry IDs, old environment variables and saved theme preferences through documented aliases/migration. Existing bearer keys and private data must remain valid.
- [x] Run final local/preview checks against the candidate and verify final packaged docs/notices/assets with private state excluded.
- [ ] Run authorized Docker/Vercel staging and release checks, verify package/Registry namespace ownership and hosted core, then coordinate promotion/publication. Production private smoke writes disposable records; use staging first and perform external mutations only within authorized release scope.

Release gate: Phases 0–5 complete, reproducible installs and measured context savings, curated distinguishable families, honest capability documentation, no known blocking regressions, and a concrete rollback path. If the name is still undecided, keep building under Open Design; do not block technical progress or silently pick a permanent brand.

Local web acceptance passed: six actual shadcn-installed Vite/Next consumers, 72 states, DTCG tests across all 31 IDs and schema-checked metadata. The final [release report](RELEASE-CANDIDATE.md) and [deployment/rollback guide](DEPLOYMENT.md) form the handoff. Publication/promotion, remote-host claims and replacement-name migration remain unperformed.

## 10. Follow-on roadmap: finish specific capabilities when justified

These are explicit later milestones, not promises that v1 already supports everything.

| Priority | Capability | Smallest complete version and gate |
| --- | --- | --- |
| Next | Trustworthy rendered review | Isolated browser worker captures exact deployed source at required widths, binds source/fixture/build hashes to a server-issued receipt, expires receipts, and returns VALID only on genuine completed checks. Budget time/concurrency/storage and separate it from short-lived API functions. |
| Next | Better design context interoperability | Import/export public CSS/DTCG and user-supplied Figma context; use official Figma MCP alongside this server where available. Do not duplicate its canvas editor or scrape private design files. |
| Later | Native/Shopify kits | Ship one genuinely supported target at a time with licensed source, reproducible installation and real device/theme validation. Saved captures remain labelled archives. Guidance is not an install kit. |
| Later | Team administration | Add revocation/rotation and narrowly scoped credentials when needed; then standards-aligned OAuth for clients requiring it. Anonymous public calls stay simple. No premature billing platform. |
| Later | Inspiration library | Owner-supplied/licensed references with provenance, retrieval and export/deletion. Never bundle proprietary captures or claim a scraped vendor collection is original. |
| Later | Generative design/media | Opt-in provider, explicit cost/data behavior, provenance and usable failure path. Require evidence of user demand; keep deterministic core model-free. |

Do not add a marketplace, visual page builder, universal execution sandbox, custom vector store, multi-model router or dozens more themes merely to increase feature count. Revisit only with a concrete user task and acceptance test.

## 11. Mandatory design workflow for any UI implementation

The user's AGENTS.md applies to the website, specimens, dialogs, navigation and any new preview UI. Do not bypass review to save tokens.

1. Read the existing feature map with `read-feature-map` and map touched flows. Start UI work with `find-design-system`; retain the product's own chosen design/theme and components. Use `extract-from-url` when extracting an existing live brand. For a new custom system call `create-design-system`, poll status and install its React kit; catalog kits use `get-design-system-kit` with the actual target. Do not replace a chosen family just because discovery returns another.
2. Call `get-ui-principle` before styling and `get-ux-principle` before behavior. Load task-specific widget/native/Shopify/Three.js/sales guidance only when applicable.
3. Build with real components, realistic matching sample content and accessible states. Product specimens use an appropriate app context; marketing copy stays beside product imagery. Keep existing header/footer links.
4. Call `get-review-rules`, `check-comprehension` and `inspect-spacing` with rendered DOM evidence; also run source review. Fix every critical/serious finding. Compare matching widths, states and content. Update the feature map.
5. If any specimen is a dashboard, deploy the exact source to public HTTPS and obtain a `finalize-dashboard-review` VALID receipt after service-owned captures at 390, 1440 and 1728. The current replacement server cannot do this: use an authorized capable Better Design service, implement the proper capture milestone, or report the dashboard blocked/unverified. Never manufacture a receipt or relabel a dashboard to evade this gate.

Keep fixed-site viewer verification for all 31 IDs in both site modes at 390px and three representatives at 1440/1728px (74 layouts / 148 parent-and-iframe states). Update fixtures/counts deliberately when changing families. Verify unchanged site tokens, focus, iframe/nested Escape, search, URL/history, scroll, selected preview, connection state, reduced motion and storage/network failure recovery.

## 12. Names to consider

Recommendation: **Formwright** as the leading candidate, with **Formward** and **Patternwell** as alternatives. These are creative proposals, not cleared brands.

| Candidate | Why it fits | Main consideration |
| --- | --- | --- |
| Formwright | Craft and careful construction; broad enough for components and review | “Wright” may need spelling out; check design/form-builder collisions |
| Formward | Short, forward movement, design-related | Invented word; needs a clear descriptor |
| Patternwell | Useful patterns and considered quality | Longer, and “pattern” can suggest textiles |
| Motiflane | Visual identity plus a guided workflow | Less immediately technical |
| Craftframe | Design craft and UI structure | Generic compound; likely competitive search space |
| Formstead | Consistency and a stable home for a design system | Can sound architectural |
| UI Foundry | Immediately explains UI construction | Very descriptive; likely difficult to own uniquely |
| Draftwell | Friendly, deliberate creation | Can suggest writing rather than interfaces |

Possible descriptor: “Design systems and review for coding agents.” Keep MCP in the descriptor/package metadata rather than requiring it in the permanent brand.

Before selection: check exact and similar names on web search, GitHub, npm, the MCP Registry, relevant domains/social handles and trademark databases in intended markets. Check pronunciation and spelling with a few people. Domain availability is not trademark clearance. Search-engine results returned during planning were irrelevant to the queried candidate names, so **no candidate has reliable availability clearance**. Do not spend money or rename deployed assets based on this shortlist alone.

## 13. Internet research used for this plan

Primary documentation and project sources retrieved on 2026-11-10. Product docs evolve; recheck relevant pages before implementation. The recommendations below are adaptations, not claims that another project's measured savings apply here.

| Source | Useful idea | Application here |
| --- | --- | --- |
| [MCP server concepts](https://modelcontextprotocol.io/docs/learn/server-concepts) | Tools, resources and prompts have different control/discovery roles | Keep actions typed; move optional long reference material to resources/prompts with a plain-tool fallback |
| [MCP tools specification, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) | Structured results/output schemas, resource links, annotations and error semantics | Compact validated payloads and honest effects; preserve older-client text compatibility |
| [Anthropic: code execution with MCP](https://www.anthropic.com/research/code-execution-with-mcp) | On-demand discovery and avoiding unnecessary intermediate context | Borrow progressive disclosure; do not create a public arbitrary execution endpoint |
| [Anthropic: advanced tool use](https://www.anthropic.com/research/advanced-tool-use) | Tool search and examples can improve large tool libraries | Support compatible hosts while retaining deterministic profiles and ordinary calls; these are not universal MCP features |
| [Context7 source/README](https://github.com/upstash/context7) | Resolve an identifier, then query focused content through a small tool surface | Search concise family summaries before fetching selected kit/guidance |
| [GitHub MCP server](https://github.com/github/github-mcp-server) | Explicit toolsets, individual tool selection and read-only configurations | Small core profile and deliberate advanced capabilities |
| [shadcn MCP docs](https://ui.shadcn.com/docs/mcp) | Browse/search/install interoperable registries | Strengthen the existing registry rather than inventing another installer format |
| [Figma MCP docs](https://developers.figma.com/docs/figma-mcp-server/) | Use real design context and design-system mappings | Faithful context/implementation, with optional interoperability rather than a competing Figma editor |
| [DTCG format 2025.10](https://www.designtokens.org/tr/2025.10/format/) | Typed tokens, aliases and portable formats | Validate the current DTCG target and document its real coverage |
| [MCP security best practices](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices) | SSRF, token passthrough, confused deputy and session boundaries | Keep server/client credentials separate and retain public/private execution boundaries |
| [Official MCP Registry publishing guide](https://modelcontextprotocol.io/registry/quickstart) | Package metadata, server.json, namespace verification and publication | Prepare discoverable, verifiable distribution after packaging is tested |

Local evidence: `MCP/src/mcp.ts`, `src/catalog.ts`, `src/app.ts`, `src/local-api.ts`, `src/guidance.ts`, `scripts/build-upstream.mjs`, package manifests/tests and existing deployment/security/release docs; `WEB/src/theme.ts`, `src/theme.css`, `src/catalog-themes.json` and `.better-design/feature-map.json`. Open Design UX guidance and the connection feature map were also read for planning. No UI was built during the original planning session. The later implementation built/reviewed the website and eight settings specimens using the mandatory workflow; source/DOM/behavior evidence and internal visual inspection are recorded in [RELEASE-CANDIDATE.md](RELEASE-CANDIDATE.md).

## 14. Execution checklist and handoff

Suggested change order: baseline/benchmarks → theme audit/family metadata → faithful specimens → compact discovery/results → client/package onboarding → reliability/security/CI → compatibility/release preparation → selected-name migration. Keep related caller/test/doc updates in the same change; use separate changes where rollback needs differ.

Existing validation entry points:

```text
# In MCP, after npm ci
npm run check
npm test
npm run build
npm run smoke:stdio

# In WEB, after npm ci
npm run check
npm run build

# MCP browser/review scripts: inspect their required environment first
# Point WEBSITE_SOURCE_DIR at the sibling website checkout.
npm run review:website -- <authorized-review-mcp-url> ../open-design-website
node scripts/verify-website.mjs
node scripts/verify-website-themes.mjs
```

Benchmark/package/profile checks are now included in CI; remote execution is pending. Run each relevant suite after changes; broaden testing when a failure or new concern justifies it. Never report old release documents as a fresh check.

For each phase, Sol should report: what changed, what was measured/tested, evidence file paths, compatibility implications and remaining work. End with what was not checked and material risks. The final release handoff must explicitly state the theme-family count versus retained variants, measured token/byte savings by client, supported targets, remaining unavailable capabilities and naming/publication status.
