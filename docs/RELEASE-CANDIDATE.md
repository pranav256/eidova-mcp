# Open Design 0.2.0 local release candidate

Verified locally on 2026-11-10 in the independent MCP and website repositories. **Implementation is ready for release evaluation; npm/Registry publication and permanent renaming remain separate work.** The evidence below covers the local 0.2.0 candidate. Check CI, deployment status and hosted versions for the pushed commits separately; a Git push can trigger the existing deployment integrations.

## Implemented behavior

- Eight curated families—Precision, Editorial, Marketplace, Tactile, Industrial, Glass, Neutral and Expressive—retain all 31 registry IDs and routes. Search favors different families and preserves explicit ID selection.
- Actual Button, Input, Card, Dialog, Table and Sidebar specimens use matching workspace-settings/member content, isolated kit CSS and licensed fonts. **View components** opens a separate modal viewer of installed family source while the website keeps its own design. Variants keep exact token links and an explicitly labelled representative family specimen.
- The installation guide sits beside the hero copy: six client formats, Essentials default, full tools in a collapsed disclosure and clipboard recovery. A header light/dark toggle controls the site's own Geist appearance. All 31 IDs open isolated viewers, preserving setup, scroll, focus and URL/history. Eight source-verified native gallery images, larger typography and numbered workflow rows remain. The eight lazy-loaded PNGs total 260,311 bytes (about 254 KiB); this is an asset measurement, not a speed score.
- Full retains 40 public tools and 41 owner tools. The optional `/mcp/core` endpoint and stdio `--profile core` expose 11 typed read-only tools. Ordinary calls work without resource-rich clients or deferred discovery.
- Short descriptions, compact structured/text results, whole-entry guidance, versioned workflow/principle/review resources and three prompts reduce discovery and workflow bytes. Explicit component retrieval still returns requested source.
- CLI help/version and offline `doctor`, a published-file allowlist, tarball installation smoke, official Registry schema validation, six client setup tabs, first tasks and useful recovery paths prepare distribution.
- DTCG 2025.10 exports validate a documented typed subset and retain unsupported originals. Bounded, DNS-pinned extraction preserves SSRF defenses and correct redirected stylesheet bases.
- Private/MCP responses are uncached; public catalog/registry responses have a 300-second cache lifetime. HTTP request size and process concurrency are bounded, 429 responses explain retry, and diagnostics omit source/rules/credentials.
- Upstream substitutions remain guarded and fail closed. Native-button source-review exemptions apply only within matching exported primitives; missing alt text and unrelated example controls remain findings. Dialog close targets and native foreground contrast were repaired without replacing vendor originals.

[Family recipes](DESIGN-FAMILIES.md), [API](API.md), [client setup](CLIENTS.md), [DTCG coverage](DTCG.md), [security](../SECURITY.md) and the [implementation checklist](SOL-IMPLEMENTATION-PLAN.md) describe behavior and compatibility.

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
| Public full discovery | 125,752 | 51,503 |
| Owner full discovery | 127,977 | 52,511 |
| Core discovery | — | 19,237 |
| Initialize instructions | 1,961 | 305 |
| Default theme search | 34,333 | 6,983 |
| Full choose/install workflow | 180,145 | 80,408 |
| Core choose/install workflow | — | 48,142 |

All six fixed full workflows meet **at least 50% byte reduction**, including complete discovery, requests/responses and both protocol representations. Five public workflows also pass through core using ordinary tools. Final 20-sample warm p95: **catalog 0.75ms**, **guidance 0.13ms**, both within the local 200ms gate. [Benchmark report and method](BENCHMARK.md) link the original/candidate measurements.

These are protocol bytes and local SDK timings. Actual model tokens, host context injection/caching and named-client traces were not measured. HTTP caching is a separate network/CPU optimization.

## Reproduce and release

From MCP after `npm ci`:

```sh
npm run build:upstream
npm run check
npm test
npm run build
npm run smoke:stdio
npm pack --dry-run --json
npm run smoke:package
npm run benchmark -- --check
npm run audit:themes
npm audit --omit=dev
```

Build the sibling website against the same local API, then use the [review commands and environment](DEPLOYMENT.md). Set `WEBSITE_SOURCE_DIR` and the local `WEBSITE_REVIEW_URL`, run `node scripts/sync-website-gallery.mjs`, and rebuild the website after capture. `npm run verify:consumers` installs fresh consumers with the actual CLI. Do not rerun unchanged browser suites for documentation-only edits; repeat the affected checks when source/build/URLs change.

Release work remains explicit:

- Observe actual Codex, Claude Code/Desktop, Cursor and VS Code walkthroughs; record host versions, five-minute first-task results, recovery and context traces. Configuration formats were checked against official docs; SDK/browser checks do not substitute for these walks.
- Execute Docker/Vercel staging checks. Configure deployment-wide rate/abuse controls: the 16-request process cap is not global rate enforcement.
- Verify package/Registry namespace ownership, activate and check the candidate hosted core route, and coordinate API then website promotion. Publish only a tested tarball/metadata under release authorization.
- Select and collision-check a replacement name before migration. **Open Design remains the working name**; Formwright, Formward and Patternwell are uncleared suggestions in the plan.

No destructive state/key migration was added. Preserve both repositories' previous deployment IDs and the same durable store; [rollback](DEPLOYMENT.md#rollback) restores coordinated deployments and moves core clients back to full if necessary. The adapter still relies on pinned SDK registration internals, tested here; upgrades require those checks. Bearer keys still lack recovery, rotation and revocation.

After the pushes, the public API still reported `0.1.0` and the website served the previous hero demo. Neither repository showed GitHub deployment records. The new installation guide needs the matching API with `/mcp/core` and website deployment; Git pushes and successful CI alone did not promote them.

Trusted rendered dashboard capture, native/Shopify installation kits, proprietary inspiration, hosted AI generation, account administration and the follow-on roadmap remain outside this candidate. The deterministic web core requires no external model. Keep the private archive excluded from publication.
