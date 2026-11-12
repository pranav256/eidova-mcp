# MCP regressions — 12 November 2026

The Hooky run exposed failures in public extraction, scoped component requests
and deterministic reviews. These fixes change the MCP implementation; no Hooky
website changes are included.

- Public extraction honors both Node DNS callback shapes, including `all:true`
  under automatic family selection. It still returns only the pinned validated
  address, rejects private/reserved destinations, revalidates redirects and
  retains existing byte/time limits. The previously failing public URL returned
  HTTP 200 and completed extraction through the built stdio tool on Node 24.20.0.
  Refused or failed HTTP extractions now return `isError:true` to MCP callers.
  The live Hooky response currently reports zero recognized tokens and
  `themeMode:"none"`; fetch success does not imply a tokenized brand. Supplied
  token CSS is covered by a separate extraction regression.
- React kits accept `component` or the compatibility alias `components`.
  Empty/conflicting selections fail validation, and any unknown name fails the
  whole selection. Existing singular selections and non-React callers remain
  supported. `lumen-dark` with `components:["table"]` returns Table source and a
  Table registry command, without an aggregate `all.json` install.
- Copy extraction recognizes h1–h6 and reads a link's accessible literal text
  before removing nested headings. Common uppercase English words are not
  treated as acronyms; unexplained API/SSO/SSOT still fail.
- `surface:"reference"` is an explicit documentation/data mode. Word/time
  budgets cover the title and actions, with total and budget word counts reported
  separately. Body jargon, acronyms, sentences and brand bans still apply, along
  with title/action/accessibility checks. Normal screens, slides, marketing and
  product mock-ups retain their full-copy density budgets.
- Overflow uses horizontal intersections with clipping/scrolling ancestors.
  Oversized containers, exposed overflow, fixed content and actual lost content
  still fail. Ragged-row review excludes inline text and semantic table cells.
  Captures preserve auto margins through CSS Typed OM; the gap check excludes
  only the gap that an auto margin expands.
- Source color review skips token declarations and comments while preserving
  finding lines. Dynamic class families defined by literal supplied CSS selectors
  do not depend on Tailwind discovery. Unresolved dynamic classes still fail the
  existing source check; no caller source or stylesheet is executed.

Verification: 123 standalone tests, TypeScript check, upstream rebuild and MCP
production build passed. Built stdio and installed-package smoke passed. Replayed
the six recorded 390/1440/1728 Hooky DOM snapshots through both the old and rebuilt
reviewers: 34 serious findings became zero (32 scroll descendants and two inline
table-text comparisons); all 34 moderate findings remained. Fresh Edge/Chromium
fixtures at those widths verified the returned capture script and MCP schema,
with no serious findings or target-rule false positives. Recorded source review
returned zero critical/serious findings and no dynamic-class findings. Synthetic
regressions retain real overflow, clipping, missing labels, long copy, unknown
components and unresolved utility failures.

Raw replay evidence is ignored under `.work/verification/2026-11-12/mcp-regression-verification.json`.
Local changes to recovered upstream source are listed separately in its
provenance manifest; original package/source-map hashes and license remain.

Limits: these are deterministic source/layout heuristics. The uppercase word
list is conservative. Authored selector families do not prove that every runtime
variant exists; verify actual states. Browsers without CSS Typed OM may not
report stylesheet auto margins, so older captures can still report gap drift.
Complex transforms/containing blocks and nested JSX need rendered evidence.
No deployment or whole-product Studio acceptance was performed here.
