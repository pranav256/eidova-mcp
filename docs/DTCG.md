# Design token export

`get-design-system-kit({ target: "dtcg", designSystemId: "linear" })` returns `tokensJson`, original `tokensCss`, and `dtcgReport`. This is a **DTCG 2025.10 typed subset**, validated for exports from the local CSS converter. It is not a complete importer or universal compliance claim.

Supported values: `color` (OKLCH), `dimension` (px/rem), `shadow` (including inset and arrays), `fontFamily`, numeric `fontWeight`, `duration`, `cubicBezier`, and `number`. Unsupported expressions/composites and values without a valid supported type leave the token tree and are retained verbatim in `$extensions["org.eidova.export"].unsupported`. Original CSS remains available even if an importer ignores extensions.

Exact simple variables such as `var(--primary)` resolve to typed aliases. Chained references work; mode-scoped references prefer their mode. A token that also owns children uses `DEFAULT`. Cycles and missing targets remain unsupported instead of dangling aliases. CSS fallbacks, `calc()`, arbitrary composites, general color-space conversion and arbitrary input DTCG documents are outside this subset.

The report includes format version, valid typed-token count, alias count and unsupported count. No `$schema` is advertised as certification. Tests export all 31 actual kits, verify live alias targets/types, preserve CSS, and cover modes, cycles, invalid values and prototype-sensitive names.

Reference: [DTCG format 2025.10](https://www.designtokens.org/tr/2025.10/format/). Extend `src/dtcg.ts` and `tests/dtcg.test.ts` together; retain unsupported originals.
