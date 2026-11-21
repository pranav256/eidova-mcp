# Release verification

## Studio removal - 21 November 2026

At the user's request, the active product is MCP plus website only. Removed the team backend, SQLite stores, native bridge/authority/collaboration, stdio flags/tools, sync/transfer/backup commands, Railway configuration and their dedicated tests/docs. The build now has only HTTP and stdio entry points. Website Studio/shared routes, navigation, Docs link, showcase promotion, CSS, proxy settings, generated metadata and feature-map entries are removed. Private recovery data, licensed resource content and the core MCP capability-key scheme are untouched. Drizzle remains a runtime dependency of the bundled design schemas.

All **111 remaining MCP tests**, both typechecks/builds, upstream regeneration, stdio and clean package installation pass. Removed test suites account for the 20-test reduction. The installed CLI rejects both retired flags and the package omits Studio build/docs files. Website checks cover **24 views** at 390/1440/1728 px in both appearances with zero Axe violations or page errors. Source, copy and rendered spacing reviews pass for home/setup and **30 showcase states/23 panels**, with no critical/serious spacing findings or sampled contrast failures. Header and showcase screenshots were visually inspected. The 42 public/13 core tools, 31 themes and 784 resources remain available.

[Removal receipt](studio-removal-2026-11-21.json) binds source and rendered evidence. This source is ready for signed API-first push and hosted verification. Earlier Studio descriptions below are historical evidence, not current capabilities. npm/Registry publication remains deferred.

## Audit completion - 21 November 2026

The remaining 16 November audit fixes are ready for API-first release on top of branded MCP b96c576 and website a946828. Config read/write failures return the MCP error flag, overwrites retain destructive metadata, overload responses retire rejected connections after readable 429/Retry-After responses, and inset corners outside the parent curve no longer cause false spacing failures. Regression tests preserve owner isolation and genuine corner failures. The verifier matches the approved Newsreader/system appearance, full setup, current footer and theme behavior. No website component or styling changes were needed.

Fresh Node 24 checks pass: all **131 standard MCP tests**, upstream regeneration, both builds/typechecks, stdio, clean tarball installation/recovery, all 42 representative tool contracts, disposable private-state isolation, benchmark gates and zero known production dependency advisories in both repositories. The repaired rendered verifier passes at **390/1440/1728 px in both appearances**, with zero critical/serious spacing findings, zero failed copy panels (62 checked), no sampled contrast failures and no page errors. Local mixed HTTP stress plus repeated concurrency-64 stages completed **2,000 requests with zero connection failures**, expected readable 429 responses and recovery. This is local mitigation evidence, not a production load guarantee or proof of the original reset's cause.

The revalidation section of [stress-fixes-2026-11-16.json](stress-fixes-2026-11-16.json) binds current source and fresh evidence hashes. Original 16 November results below and both receipts retain their dated scope. The earlier branded release is live on both branded and compatibility aliases; these audit fixes require their own signed push and hosted verification. npm/Registry publication and optional native/live-generation acceptance remain deferred.

## Audit fixes - 16 November 2026

The follow-up fixes config failure flags (finding 1), config overwrite metadata (3), the stale website verifier (4), and contradictory API/website/Docker references (5). Missing-project and denied owner/anonymous config writes now return `isError: true`; successful reads/writes still succeed and rejected writes preserve saved values. The recovered runtime was regenerated from its source.

For burst traffic (2), overload responses now send `Connection: close` with HTTP 429 and `Retry-After: 2`, retiring rejected connections after their response. Thirty-two simultaneous overflow requests return readable retry responses, health stays available, and cancellation restores capacity. The post-change 2,000-request run and concurrency-64 repeats have zero connection failures. This mitigates reuse of overloaded connections; the earlier resets' exact cause and production behavior remain unconfirmed.

The repaired verifier retains its existing behavior coverage and now matches Newsreader/system appearance, full-profile setup, the current footer, applied themes and sibling checkout. Its complete rendered review passes at 390, 1440 and 1728 px in both appearances: no critical/serious spacing findings, failed copy panels, sampled contrast failures or page errors. That rerun also exposed and fixed a nested-radius checker false positive: a child outside the parent's corner curve can keep its own radius. The new regression fails before the fix and passes afterward while retaining real square-corner failures inside the curve. No website styling or component source changed.

MCP build/typecheck, website typecheck, all 42 representative tool contracts, full/core/owner profiles, built stdio, owner-isolation smoke and benchmark assertions pass. The service suite passes **129 of 130 tests** using the native TypeScript resolver; the optional native-bridge child-launch test still times out because `tsx` cannot initialize for the sandbox account. A clean canonical `npm test`, fresh npm advisories/consumer installs, remote CI and production checks remain unavailable here.

[stress-fixes-2026-11-16.json](stress-fixes-2026-11-16.json) binds the changed source and retained evidence under `.work/fixes-2026-11-16/`. These are local working changes, not a deployment or publication. The audit below and its original receipt describe the pre-fix source and preserve the intermittent failure evidence.

## Stress and claim audit - 16 November 2026

What this repo does: Eidova serves design guidance, component source and reviews through MCP, with a public website for setup, themes and resources. This audit assumed concurrent public read traffic and isolated owner writes. It exercised the local Windows/Node 24 build at 1, 8, 16, 32 and 64 concurrent requests; it did not load-test production.

Reviewed MCP `eb2c6fab736ee5d2bb6246782f2fa402a155da08` and website `e906664e27f1c9c6ac6a80277aafb9a48f858e0d`. The existing README wording edit was preserved. No application code, dependencies, deployments or published packages changed. [Compact receipt](stress-test-2026-11-16.json) records source hashes, results and local evidence paths. This dated audit takes precedence over older claims below for its tested scope.

An independent confirmation later the same day rebuilt both projects, exercised all 42 tools, reproduced the config error/annotation defects and passed 127 of 128 backend tests; one optional native-bridge child test timed out. Its 2,320 additional mixed HTTP requests, including three concurrency-64 stages with connection reuse and a connection-close control, completed without connection failures. Earlier resets remain an intermittent finding, not a reproduced failure in this confirmation. Fresh npm advisory queries and GitHub fetches were blocked. The receipt distinguishes the two runs and binds their retained evidence; confirmation logs are under `.work/stress-2026-11-16-confirmation/`.

### Must fix

1. **Failed config calls lack the MCP error flag.** These tools read or save a custom theme's values. Both tools return HTTP-404 failure text for a nonexistent project without `isError: true`; a different owner's attempted write similarly returns `Could not write the design config (HTTP 422).` without the flag. The existing value remained unchanged, so this is error reporting, not an ownership bypass. The connected hosted full MCP reproduced the missing-project read behavior. Failure branches in `vendor/upstream/src/mcp/tools/design-config-tools.ts:129` and `:172` use the success-shaped `textResult`; `src/mcp.ts:200` leaves unstructured results unchanged. Fix those error returns and add assertions for missing projects and denied writes. Otherwise clients that rely on the protocol flag can treat an unsuccessful save as successful.

2. **Earlier burst traffic sometimes reset connections instead of delivering a response.** The first 320-request stage at concurrency 64 produced four connection failures. Two 320-request repeat stages produced four and one `ECONNRESET` errors, respectively, while the server stayed alive and accepted recovery calls. The preceding concurrency-32 stage completed with 296 HTTP 200s and 24 HTTP 429s. A concurrency-64 control using `Connection: close` completed with 196 HTTP 200s, 124 HTTP 429s and no connection errors. The later confirmation completed the same workload and repeats without connection errors. Connection reuse is implicated by the earlier control; the exact server/client cause is not established. Investigate the early admission response in `src/app.ts:37` together with Node/Undici connection reuse, then retain a regression for readable overload responses and recovery. Until resolved, callers may receive transport failures without the documented `Retry-After` guidance. No production outage or write loss was observed.

### Should fix

3. **Config writes advertise that they are non-destructive.** `set-design-config` merges over existing values, including replacing a previously saved color, but live local discovery says `destructiveHint: false`. The blanket annotation assignment in `src/mcp.ts:234` overrides the original handler's explicit `true`. Include this tool in the destructive annotation or preserve its original annotation. Otherwise a client sees inaccurate metadata when deciding how to handle a saved-value overwrite; ownership checks still work.

4. **The older main website verifier rejects the current approved design.** `scripts/verify-website.mjs:175` fails on the real Newsreader heading because it requires Inter. It also assumes a light default despite a dark system context (`:176`) and a GitHub client-guide footer destination (`:56`) instead of `/docs`. Align these assertions with the current `DESIGN.md`, or retire the duplicate verifier after carrying over any unique behavior checks. The three maintained website suites pass; leaving this script stale makes the documented reproduction command fail and prevents its later checks from running.

5. **Maintained references contradict their own later release evidence.** `docs/API.md:3` and website `README.md:58` still say hosted core needs deployment. The acceptance-boundaries paragraph below says Docker runtime checks have not completed, while the preceding 15 November entry records successful Docker CI. The paragraphs labeled current also name older commits without qualifying their date. Website `README.md:37` says saved palette choices are ignored and `:69` says theme selection does not apply tokens; `src/theme.ts:13` reads saved `eidova-page-theme` and `:43` applies the selected palette. Local build/review instructions also omit `WEBSITE_EXPECTED_MCP_URL`, which the maintained redesign script reads at line 81; leaving its hosted default while building with a local endpoint produces a false setup failure. Date release claims, distinguish local Docker absence from remote CI, describe the working navbar palette separately from isolated specimens, and include the expected endpoint setting. Otherwise readers and local reviewers receive contradictory instructions. Fresh remote Git heads and CI status could not be checked in this sandbox.

### Passing checks and measured limits

| Check | Fresh result |
| --- | --- |
| MCP TypeScript/build; website production build including TypeScript | Passed |
| Production dependency audits | Earlier audit reported zero known vulnerabilities; later confirmation could not query npm's advisory endpoint |
| Existing service tests | 127 distinct tests passed using a temporary native TypeScript resolver; one optional native-bridge child-launch test remained blocked by `tsx` account lookup |
| Catalog and bundled files | 31 themes, 8 families, 784 advertised entries, 137 legacy entries; all 7,188 referenced file records passed existing hash/read checks |
| Public tools | All 42 invoked with representative inputs; expected incomplete-evidence/private-access rejections checked; the two config error-flag failures above remain |
| Full/core/owner profiles and built stdio | 42 / 13 / 43 tools; standalone stdio, profile calls and invalid-input recovery passed |
| Disposable private-state smoke | Rules persist across clients; project rules and config writes are owner-isolated; rejected writes preserve saved values |
| HTTP boundaries | Invalid JSON 400; oversized body 413; invalid key 401; bad query values 400; traversal 404; MCP GET 405; private/credentialed URL extraction refused |
| Admission/cancellation | Sixteen held bodies cause 429 with `Retry-After: 2`; health remains 200; cancellation frees the slots |
| Benchmark | All byte-reduction/budget assertions passed again; confirmation in-memory warm p95: guidance 0.35 ms, catalog 2.84 ms |
| Current website suites | `test:redesign`, `test:resources`, `test:page-themes` all passed; 36 route/appearance/width views, all 784 resources and all 31 themes covered |
| Detailed resource/showcase review | 36 resource states with 12 passing copy panels; 30 showcase states with 24 passing panels; no critical/serious spacing findings, sampled contrast failures or page errors |
| Rendered evidence | 390, 1440 and 1728 px, both appearances; mobile/desktop home captures also visually inspected |
| Packaging | Tarball file/license/private-state exclusion assertions passed before clean installation was blocked by registry access |

The first mixed HTTP run completed 1,360 requests. At concurrency 1/8/16/32, p95 was 504/2,826/4,508/8,955 ms; these are real HTTP timings, not the in-memory benchmark above. There were 2,320 mixed requests including the repeats and connection-close control. The nine connection failures occurred in the 960 concurrency-64 requests using connection reuse. Early stages shared the machine with browser/package checks, so these measurements are diagnostics, not production capacity or an SLA. The server was not observed crashing.

The confirmation's full HTTP run completed 1,360 requests with p95 of 71/605/1,286/2,241/2,300 ms at concurrency 1/8/16/32/64. Its two additional concurrency-64 stages and connection-close control brought confirmation traffic to 2,320 requests with zero transport failures. Successful responses and expected 429 overload responses are counted separately in the receipt. Timing variation between runs reinforces the measurement limit above.

Reproduction evidence and bounded harnesses are retained under `.work/stress-2026-11-16/` in each checkout. From MCP, `node .work/stress-2026-11-16/http-stress.mjs` starts and stops its own disposable server on port 3001; `--repeat-overload` repeats the 64-client stages and `--close` runs the connection-close control. `tool-contracts.mjs` targets the disposable service on port 3000 and intentionally fails on the two remaining config contract defects. These ignored harnesses are audit evidence, not shipped features.

For website confirmation, use `REVIEW_URL=http://127.0.0.1:5512` and `WEBSITE_EXPECTED_MCP_URL=http://localhost:3000/mcp` to match the local production build. All three maintained suites pass with that contract. The disposable private-state smoke and built stdio pass again; package inventory confirms all bundled files and required licenses while excluding private state. Clean consumer installation remains unverified here.

Verdict: the documented catalog, source delivery and main website behaviors largely hold. Fix the protocol error flags and investigate burst connection resets before claiming the stress pass is clean; reconcile the metadata, verifier and documentation findings.

Not checked: a clean canonical `npm test` run (`tsx` fails before execution with `uv_os_get_passwd`/`ENOMEM` for the sandbox account), the remaining optional bridge child test, fresh package installation/consumer builds and dependency advisories (npm network requests blocked), fresh remote heads/CI, direct production HTTP or WAF load, other browser engines, live native Studio, Docker execution on this machine, real Vercel Blob races, paid generation and host token/timing studies. The connected full MCP did answer capability and missing-project reads during the earlier audit; new hosted calls, direct website/API probes and GitHub fetches were blocked in the confirmation. No trusted dashboard visual receipt, accessibility certification or exhaustive resource-script execution is claimed.

Current evidence reconciled on 15 November 2026. This reference preserves completed checks from the consolidated handoffs. npm/Registry publication and its remaining client acceptance were deferred by the user; their prerequisites remain in [DEPLOYMENT.md](DEPLOYMENT.md) and [CLIENTS.md](CLIENTS.md). Historical sections describe their dated revisions.

## Hosted state last verified - 15 November 2026

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

Named-client five-minute workflows/context traces and npm/Registry publication remain deferred. The optional Studio product and native bridge were subsequently removed; dated evidence below describes the earlier source. Docker image/runtime full/core/private smokes passed remote CI as recorded above; Docker remains absent on this local machine. Installed CLIs, adapter tests and catalog reads do not prove generation, plugin execution or installer release. No provider keys or paid model calls were used.

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

## 21 November 2026: branded endpoint and agent setup

The assigned API alias https://eidova-mcp.vercel.app returned healthy 0.2.0 during release preparation. Source defaults and setup examples now use its /mcp and /mcp/core endpoints directly. Website canonical/search/social metadata uses https://eidova.vercel.app. Existing hostnames remain compatibility aliases. Vercel API EIDOVA_BASE_URL/EIDOVA_WEBSITE_URL and website VITE_MCP_URL/VITE_REGISTRY_ORIGIN were updated to these branded origins for Production and Preview.

Added public AGENTS.md guidance, llms.txt, client config downloads, contributor instructions and an HTTP server.json route with Docker/Vercel packaging. An isolated export of the staged source passed Node 24 typecheck/build, upstream regeneration, all 129 standard MCP tests and the built stdio smoke. The website build and agent-setup checks passed. Earlier uncommitted stress fixes and the unrelated README wording edit remain excluded from this release.

The earlier local proxy smoke passed full/core discovery (42/13), tool calls, metadata, registry downloads and setup files. Production rollout must deploy API support first, then the website, and verify exact deployed source and branded/compatibility endpoints. npm/Registry publication remains deferred. Historical hosted receipts retain their original URLs.
