# Release verification

Current evidence reconciled on 15 November 2026. This reference preserves completed checks; the only active workspace checklist is `../../TODO.md`. Historical sections describe their dated revisions.

## Current source and hosted state

- Signed MCP commit **9b23c02** and website commit **4ab5743** are on their remote default branches. Both production deployments are Ready. MCP CI [passed on the exact commit](https://github.com/pranav256/eidova-mcp/actions/runs/43691196675); website CI passed on 4ab5743.
- The public API reports **0.2.0**. Full [`/mcp`](https://open-design-mcp-liard.vercel.app/mcp) has **42** public tools; optional `/mcp/core` has **13**. Fresh hosted discovery and read-only tool/source smokes pass on both profiles. Existing connections need reconnection to refresh discovery.
- https://eidova.vercel.app/ and https://open-design-website.vercel.app/ use the warm paper/rust reference and the working navbar theme slider. Website setup, Docs and Registry metadata default to full. The website's `docs/theme-slider-review.json` records all 31 themes, pointer/keyboard/history/storage recovery and the rendered review.
- Fresh standalone MCP tests: **128 passed**. Separate real-backend/native-adapter integration tests: **8 passed**. Actual tarball installation, all resource bytes/notices, doctor/recovery and core stdio passed (approximately 89.9 MB compressed). These adapter checks do not establish full native runtime acceptance.
- Eidova GitHub repositories and the branded website alias are assigned. Existing API hostname, routes, keys and storage stay compatible. npm currently returns E404 for `eidova-mcp`; the authenticated publisher is `pranav256`. An absent listing does not prove ownership. Registry publication is unverified.
- GitHub private vulnerability reporting is enabled for MCP and website. The rate-limit smoke returned 120 normal 404 responses and ten 429 responses with zero network errors; GET health remained 200. Vercel's active valid rule limits POST requests to **120/minute per IP per region**, using a fixed window. It leaves GET registry downloads available. Counters are regional, not a single global cap; the process cap of 16 remains an independent boundary. See [operating controls](DEPLOYMENT.md).

Current packaging, clients, targets and compatibility are documented in [API](API.md), [clients](CLIENTS.md), [family recipes](DESIGN-FAMILIES.md), [DTCG](DTCG.md), [security](../SECURITY.md) and [deployment/rollback](DEPLOYMENT.md). The retired Sol plan's implementation is represented by those references and the evidence below.

## Additional verification - 15 November 2026

Signed consolidation source `e7c63c4` passes the complete remote CI matrix. Website consolidation `f35ac58` passes CI and is Ready in production. The Docker readiness fix `3144848` passes its Linux Node 24 Docker job: image build, hosted full/core calls and private owner-isolation/configuration/registry smoke against a disposable volume. No Docker installation was added to the local machine.

The actual Codex CLI 0.169.0 session exposes 42 full tools and passes design selection, requested component source, invalid-component recovery, resource pagination and copy review. Claude Code 2.1.318 passes temporary local HTTP configuration/connection; that configuration was removed afterward. Those are scoped host checks, not first-time setup timings or model-context token measurements.

The user confirmed MCP/website-only scope; native Studio production is optional and preserved. Both temporary streamline folders were removed by the user after automatic approval review blocked agent deletion; both paths are verified absent. npm authentication identifies `pranav256`, but the signed-source release tarball publication returned E403 requiring publishing 2FA or a granular token with bypass 2FA. No npm or Registry publication is claimed.

## Acceptance boundaries

Named-client five-minute workflows/context traces, Docker runtime checks (Docker is absent), npm/Registry publication, persistent Studio HTTPS hosting and the live native acceptance in [STUDIO-PARITY.md](STUDIO-PARITY.md) have not been completed. Installed CLIs, adapter tests and catalog reads do not prove generation, plugin execution or installer release. No provider keys or paid model calls were used.

Explicitly deferred work stays deferred: the optional two-family playground, trusted dashboard capture worker, public native/Shopify install kits, proprietary inspiration, hosted AI generation and account administration. Personal resource Keep/Skip choices remain the user's optional decisions. The deterministic public web core needs no model provider.

## Historical candidate evidence — 10 November 2026

The following measurements cover the then-current candidate, not the subsequent paper redesign or live slider. Some raw captures and disposable installs were removed by workspace cleanup; compact receipts, hashes and reproducible scripts remain.


## Verification and evidence

Local reference environment: Windows x64, Node **24.20.0**, Intel Core 3 100U, Edge through Playwright **1.56.1**. Browser widths: **390, 1440 and 1728px**. Remote CI subsequently passed Node 22/24 on Linux/Windows plus clean installed consumers on MCP `3f30dd4`; website CI passed `6441ac4`. The browser job pins Ubuntu 24.04 for the locked Playwright version.

| Check | Recorded result | Evidence |
| --- | --- | --- |
| MCP typecheck / production build | Passed | Local commands; package prepack repeats these checks |
| Remote service CI | All four Node 22/24 Linux/Windows jobs and six installed consumers passed | [MCP run on 3f30dd4](https://github.com/pranav256/open-design-mcp/actions/runs/42818900705) |
| Remote website CI | Typecheck/build and production audit passed | [Website run on 6441ac4](https://github.com/pranav256/open-design-website/actions/runs/42818368810) |
| Service suite | **89 passed**, zero failures/skips | `.work/verification/service-tests.log` |
| Both production dependency audits | Zero reported vulnerabilities | Local `npm audit --omit=dev`; not an all-dependency security certification |
| Built stdio | Passed from a different working directory | `npm run smoke:stdio` |
| Final package | Dry-run and tarball installation checks passed; assets/notices/release docs included, private state excluded | `npm pack --dry-run --json`, `npm run smoke:package` |
| Package recovery | Version, offline doctor, missing-assets recovery, invalid profile, core search/resource passed from a Windows path containing spaces | `scripts/smoke-package.mjs` assertions |
| Profiles/protocol/security | Full/core HTTP and stdio discovery, schema/error/resource/prompt checks, private isolation/concurrency and fetch-boundary cases passed | Service suite and benchmark |
| Eight native specimens | **96 states**; eight registry copies matched; zero critical/serious source or spacing findings, no copy failures/page errors/runtime Google or Iconify requests | `.work/site-elevation/specimens/`; sibling website `docs/specimen-review.json` |
| Specimen sampled text contrast | Minimum **4.542:1** | Specimen summary/contrast evidence |
| Actual installed React consumers | Six Vite/Next builds and interactions passed; **72 states**; minimum sampled contrast **4.719:1** | `.work/consumers/1794301807557/` |
| Website typecheck / production build | Passed | Latest built preview at `http://127.0.0.1:5174` |
| Website source/comprehension/spacing | **51 panels**, zero copy failures and zero critical/serious spacing findings; setup spacing findings zero | `.work/installation-first/after/summary.json`; sibling `docs/review-candidate.json` |
| Installation and gallery | Six setup formats, keyboard tabs, core/full disclosure and clipboard recovery passed; eight native image source/CSS/image hashes verified | Website summary and `src/family-preview-manifest.json` |
| Website footer | Displayed package version, Docs destination and actual `/health` response version passed | `scripts/verify-website.mjs` assertions |
| Fixed-site theme viewers | **74 layouts / 148 parent-and-iframe states**, all 31 IDs retained; **31 copy checks** passed; minimum sampled contrast **4.542:1**; zero critical/serious spacing findings/page errors | `.work/installation-first/viewers/`; sibling `docs/theme-viewer-review.json` |
| Theme audit / DTCG / metadata | All 31 IDs covered; aliases/types/unsupported values and prepared Registry schema checked | [THEME-AUDIT.json](THEME-AUDIT.json), service tests |

All eight settled 1440px specimen screenshots were visually inspected. Typography, geometry, density and material treatments differ on matching content; [recipes](DESIGN-FAMILIES.md) document at least three non-color axes and two component treatments per promoted family. This is internal review, not user preference research. The optional separate two-family playground was unnecessary because the real specimens are directly comparable.

The installation-first marketing/catalog page was compared against the preceding page at matching 390/1440/1728px widths. Mobile and desktop hero appearances, Tactile mobile and Editorial desktop viewers were visually inspected. The copy comparison allows the user-requested removal of the hero demo and global palette controls, decorative icons and the readable Inter font-label correction. Iframe Escape, nested invitation Escape, focus return, sample reset, setup/scroll retention, legacy URL migration, invalid IDs, disabled storage and no catalog refetch passed. No additional dependency was added for this change.

The six consumers use actual **shadcn 4.23.0**, **React 19.2.0**, **Tailwind 4.3.5**, **Vite 7.3.7** and **Next 16.4.6**, installing Linear, Tactile and Industrial in each framework. Their forms check required names, email validation, save feedback, Dialog Escape/focus return and member addition. This does not certify every retained component, framework version or agent host.

Raw screenshots, DOM states and tool responses remain in ignored `.work` directories and are excluded from distribution. Checked-in compact summaries and scripts retain the reproducible scope. Moderate findings remain in legacy component scales, source declarations/comments and font alias evidence; there are no recorded critical/serious findings in the reviewed source/DOM scope. Solid ancestor backgrounds are composited for contrast; image/gradient pixels are not measured. These checks are not accessibility certification or trusted dashboard receipts.

## Context and latency

| Compact JSON UTF-8 bytes | Baseline | Candidate |
| --- | ---: | ---: |
| Public full discovery | 125,752 | 53,393 |
| Owner full discovery | 127,977 | 54,401 |
| Core discovery | — | 21,127 |
| Initialize instructions | 1,961 | 305 |
| Default theme search | 34,333 | 5,183 |
| Full choose/install workflow | 180,145 | 81,134 |
| Core choose/install workflow | — | 48,868 |

All six fixed full workflows meet **at least 50% byte reduction**, including complete discovery, requests/responses and both protocol representations. Five public workflows also pass through core using ordinary tools. Final 20-sample warm p95: **catalog 0.77ms**, **guidance 0.21ms**, both within the local 200ms gate. [Benchmark report and method](BENCHMARK.md) link the original/candidate measurements.

These are protocol bytes and local SDK timings. Actual model tokens, host context injection/caching and named-client traces were not measured. HTTP caching is a separate network/CPU optimization.


## Historical release - 7 November 2026

The latest review passes **72 service tests**, TypeScript and builds. Theme
search now includes font names. Private archive integration remains opt-in and
excluded from public deployments. Compatibility behavior is documented in
[the evidence and scope](COMPATIBILITY-PASS.md).

The website now applies any of its 31 themes to the entire site, with persistent
light/dark mode, a sticky theme/reset control and shareable URLs. The playground
and separate preview pages are removed. Search, filters, scroll, focus and
connection setup survive theme changes. Original public registry assets remain
unchanged; missing appearances and readable site text are adapted locally.

Browser checks cover all 31 themes in both modes at 390px and three representative
themes in both modes at 1440px and 1728px: **74 theme layouts**, plus the baseline
website checks. Rendered text contrast is at least **4.52:1**, including input
and hover checks. Source and spacing reviews have no critical or serious findings.
The separate website repository maintains the final deployment results in its
[release review](https://github.com/pranav256/open-design-website/blob/main/docs/REVIEW.md).

The original release results below are retained as the initial baseline.

The independent Eidova service and website are deployed publicly:

- MCP: https://open-design-mcp-liard.vercel.app/mcp
- Website: https://open-design-website.vercel.app
- Service repository: https://github.com/pranav256/open-design-mcp
- Website repository: https://github.com/pranav256/open-design-website

## Service

TypeScript and production builds pass. All **51 tests** pass, including catalog
resolution, guidance retrieval/imports, inline source review, CSS registry
conversion, private-address rejection, workspace isolation, local atomic writes
and Blob conditional updates. npm audit reports zero advisories in both projects
at this verification date.

The built stdio entry works from another working directory. Public HTTPS MCP
discovery and representative catalog, principles, review, icons and React kit
requests work without authentication. Anonymous discovery exposes 40 tools;
private workspace discovery additionally exposes rule mutation.

The production private-state smoke creates separate random workspaces and verifies
that rules persist across clients, another workspace cannot read those rules or
overwrite the theme, rejected writes leave the saved primary color unchanged,
and the public custom registry contains the saved light/dark overrides. Temporary
workspace keys are neither printed nor saved. The test writes disposable records
to the production private Blob store.

Catalog globals now insert full CSS into shadcn's configured stylesheet, including
base typography and theme bindings. Tests cover every catalog globals item,
normalized variable names, nested/repeated rules and preservation of raw assets.
The separate [consumer report](REGISTRY-VERIFICATION.md) records actual shadcn
installation, compilation and rendered checks and their component coverage.

## Website

The existing minimal-light theme and actual React primitives were retained.
Guidance and all review calls used our own deployed MCP, as authorized by the user.

The rendered HTTPS review uses Edge through Playwright at **390, 1440 and 1728**
pixels. It verifies 31 catalog entries, one page title, no browser errors or page
overflow, keyboard skip navigation, theme search, empty-search recovery, clipboard
URL copying, keyboard configuration copying, catalog failure/retry, focus return
and reduced-motion behavior. Public registry links return valid inline theme CSS
and tokens.

The MCP spacing check completed with **0 critical, 0 serious and 1 moderate**
finding. The moderate finding is the 224px automatic outer margin of the centered
1280px content container at 1728px; it is intentional responsive centering.
Comprehension passed for all **40 panels**, including each theme card, the mock
token response and connection example. Source review returned **0 critical,
0 serious and 22 moderate** findings, confined to literal token definitions and
color comments in the retained upstream theme. Mobile and desktop screenshots
were visually inspected.

Raw service evidence is under ignored `.work/verification/`; website screenshots,
DOM states and tool replies are under ignored `website/evidence/`. The website
repository retains a small public review summary, not the raw private handoff.

## Scope

These checks establish the stated deployment behavior, not accessibility
certification, real visitor research, every theme component's rendered behavior,
or complete Better Design parity. The private vendor guidance corpus, AI
generation, proprietary inspiration, vendor accounts, mobile/Shopify install kits
and trusted dashboard browser receipts remain unavailable. See
[README](../README.md) and [runtime boundaries](RUNTIME-BOUNDARIES.md).
