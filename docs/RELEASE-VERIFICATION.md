# Release verification — 2026-11-07

The later compatibility pass raises the passing suite to **66 tests**, restores
private project rule slots and implements the first-visit brief/rank/recheck
workflow. See [the evidence and scope](COMPATIBILITY-PASS.md). The website now
defaults to dark mode and preserves a visitor's explicit light/dark preference.
Both schemes were reviewed at 390, 1440 and 1728 pixels; all **41 copy panels**
pass, with no critical or serious source/spacing findings. The original release
results below are retained as the initial baseline.

The independent Open Design service and website are deployed publicly:

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
