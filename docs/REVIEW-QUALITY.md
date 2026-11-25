# Review evidence and release gate

Eidova separates findings in supplied source, measured DOM geometry, and checks
that still need a browser or person. A tool result is evidence for its stated scope,
not certification of a page's accessibility or visual quality.

## Source review

`review-ui-code` requires inline contents. Findings retain file, line, rule and fix.
The structured response includes `evidence: "supplied-source"`, `findings`,
`summary`, `skipped`, and `unverified`. Unsupported files make the result partial.
A clean result says **No deterministic issues found in the supplied source.**

The regression fixtures cover empty buttons, missing input labels, clickable divs
without a role/tab stop/keyboard handler, and explicit low-contrast pairs in JSX,
HTML and CSS. Clean JSX uses house controls; clean HTML tests native controls.
Names supplied dynamically, custom component semantics, actual keyboard activation,
and computed or inherited styles remain unverified. A handler's presence does not
prove it implements Enter and Space correctly.

Contrast checks compare opaque 3/6-digit hex and comma-separated RGB pairs in one
CSS block or static inline style. They account for local declaration overrides and
explicit large pixel text sizes (3:1); otherwise the normal-text threshold is 4.5:1.
They do not resolve cascade, variables, alpha, modern color syntax or inherited text
size. Findings describe the declarations and require rendered confirmation.

## Geometry and coverage

`inspect-spacing` without states returns `needs-capture`, incomplete coverage and
unverified checks. It performs no measurements. Submit snapshots at 390, 1440 and
1728px (40px width tolerance), and use `requiredStates` for every relevant state
name. Capture every declared state at every width.

| Evidence | Status | Geometry score |
| --- | --- | --- |
| All required widths/states, no findings | completed | 100 |
| All required widths/states, findings | completed | Finding penalties deducted |
| Missing width/state, empty capture, truncated findings or missing rubric | partial | Withheld |
| No snapshots | needs-capture | Withheld |

The score is `max(0, 100 - 20×critical - 10×serious - 5×moderate)` geometry
findings only. `coverage`, `summary`, `findings`, `scoreMeaning` and `unverified`
explain the result. Coverage is relative to declared states; a caller can omit a
needed interaction. Native captures use the device width instead of web widths.
Neither completed coverage nor 100 means visual approval.

## Capture without editing geometry

Build the checkout, serve your test page on loopback, then run:

```sh
npm run build
node dist/stdio.js review-browser http://127.0.0.1:5173 --states review-states.json
```

Browser installation and state-plan examples are in [Agent setup](AGENT-SETUP.md#local-review-commands).
Each plan starts from a fresh page at all three widths in light/dark mode. The
command writes screenshots, `report.json`, and a ready-to-submit `spacing-input.json`.
Pass that last JSON object unchanged as `inspect-spacing` arguments. Capture errors,
empty snapshots or missing states make the local report partial; no score is given.
Geometry and automated accessibility evidence are separate from human visual review.
Inspect screenshots, test keyboard activation and complete the task, including recovery.

## Kits, tools and recovery

Core exposes 13 public tools; Full exposes 41. `find-icons` and `get-icon-files`
are optional Full tools. Reconnect at `/mcp/full` to use them. Core preserves embedded
icons, uses text labels and omits additional decorative icons. Kits include
`requiredTools` and profile-qualified `optionalTools` with a fallback. Extraction
works in both profiles; storing extracted tokens as a theme needs Full and an owner
workspace. Core callers can save extracted CSS in their own project.

HTML handoffs lead with setup; CSS, examples and mandatory policies stay in structured
fields. Use `detail: "full"` for complete prose. Resource errors point developers
back to `search-resources`, the manifest and exact listed file URIs.

## Reproduce the gate

```sh
npm run build:upstream
npm run check
npm test
npm run quality:gate
npm run verify:browser-review
```

The quality gate writes `review-quality.tap`. CI retains that artifact for each
Node/OS job and the browser flow log from Ubuntu. It exercises both exposed profiles,
source locations/fixes, clean counterparts, incomplete evidence, tool references,
schemas and resource recovery. The browser flow reviews the source, captures 18
width/appearance/state combinations, then submits the generated input unchanged to
both profiles. It does not hand-edit rectangles.

Measured locally on Node 24 / Windows / Edge, 25 November 2026:

| Profile | Discovered public tools | Expected fixture detections | Missed | Clean fixture false positives |
| --- | --- | --- | --- | --- |
| Core | 13 | 8 | 0 | 0 |
| Full | 41 | 8 | 0 | 0 |

These counts cover four specified rule types in two negative source formats per
profile, not every rule or possible source program. Additional edge cases cover
static/dynamic names, native label associations, custom components, inline contrast,
local color overrides, explicit large text and unsupported source.

The complete browser test page produced 18 snapshots and, in each profile, 0
critical, 0 serious and **30 moderate geometry findings**. These remain findings;
the score is not tuned to improve the result. Missing-width, missing-state and empty
capture tests explicitly assert partial coverage and an absent score. Human hierarchy,
screen-reader and successful-task review remain outside this fixture gate.

The website review also exposed a false positive: a heading beside its longer
description was treated as unequal peer text. A regression now excludes that
semantic pairing while retaining findings for unequal peer paragraphs. The gate
includes this geometry corpus, and the capture-failure test checks six failed
width/appearance combinations return partial coverage without a score.
