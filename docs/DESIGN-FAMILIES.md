# Eight design families

Eidova promotes eight representative web kits and retains all **31 compatible registry IDs**. A family is an editorial grouping, not a claim that every sibling has the same implementation. Minor palette/material alternatives live beneath their family; exact ID lookup and registry URLs still work.

The website keeps its own theme. **View components** loads real source in an isolated workspace-settings specimen and shows family suitability and tradeoffs. **Copy agent prompt** carries the exact selected ID to the agent; **Project instructions** contains its DESIGN.md download. Compare specimens at the same width and with the same form/member content; color strips alone cannot show component differences.

## Recipes established from source and rendering

Measurements below are the settled default controls at 1440px with a 16px root font size. Catalog lengths use their own scales; rendered pixel sizes are observations, not hardcoded implementation requirements.

| Family / representative | Three non-color axes | Two component treatments | Best fit and trade-off |
| --- | --- | --- | --- |
| **Precision** / `linear` | Compact 36px controls; small 6px control/8px card corners; fine borders with restrained inset/cast shadows | Input has a thin border and small inset shadow. Button has a narrow edge/highlight and compact padding. | Dense working tools; less generous touch spacing than Tactile/Marketplace. |
| **Editorial** / `editorial-dark` | Georgia serif headings with Inter body; large 28px card corners; borderless inset-lit card surfaces | CardTitle uses serif type and tight reading hierarchy. Button is quiet, flat and rounded at 16px. | Content-led interfaces; serif hierarchy is less suited to dense numeric controls. |
| **Marketplace** / `light-marketplace` | Roomy 44px actions and 40px fields; open borderless 16px cards; elevation concentrated on primary actions | Input is borderless with generous side padding. Button has a soft raised shadow while the Card stays flat. | Consumer forms and commerce; larger controls reduce information density. |
| **Tactile** / `tactile-minimal` | OS system typography; 44px controls with 12px corners and 20px cards; physical raised/inset depth | Input/Textarea share an inset field style. Button has a raised edge and pressed response; Cards add a soft paper shadow and 28px content padding. | Calm forms with physical feedback; shadows need consistent surface contrast. Optional audio degrades to silence when unavailable. |
| **Industrial** / `monochrome-industrial` | Square geometry; Doto display/Space Mono controls/Space Grotesk body; visible divider rules without soft elevation | Input and Button are square, 40px and monospace. CardFooter separates actions with a full rule; labels retain a technical type role. | Technical/instrument interfaces; decorative Doto is reserved for the title/display role, not form text. |
| **Glass** / `glassmorphic-dark` | Pill-shaped 40px controls; translucent layers with 24–40px backdrop blur; inner illumination and deeper card shadows | Input has a luminous inset edge. Card/Dialog use translucent rounded layers; table surface uses semantic card/border tokens. | Layered interfaces; blur/transparency depend on the surrounding background and cost more to render. |
| **Neutral** / `minimal-light` | Balanced 38px controls; consistent 16px geometry; thin outlined surfaces without shadows | Input and Button share rounded proportions. Card uses a quiet outline; Table remains visually open with simple row rules. | An unobtrusive base for existing brands; its distinction is restraint rather than expressive material. |
| **Expressive** / `vibrant-dark` | Inter typography; rounded 40px filled fields/actions and 14px cards; pronounced action/card elevation | Button has a strong glow/cast shadow. Input is filled and borderless; Card has a soft elevated edge. | Interfaces needing stronger action emphasis; keep status colors distinct from the primary action. |

Shared accessible behavior is retained. Required-field/email validation, keyboard action activation, Dialog Escape/focus return and sample resets are part of the specimen checks. Dialog close targets are at least 44px across all retained kits. Family-specific text roles were repaired where native contrast measurements exposed dim labels/actions, while original palette tokens remain available.

## Variants and appearances

The sole hand-maintained family source is `content/design-families.json`; catalog/search, the website's generated family data and preview synchronization derive from it. [THEME-AUDIT.json](THEME-AUDIT.json) records all 31 IDs, font rules, source hashes, geometry/spacing/shadows and token scopes. Matching hashes can identify shared implementation; different hashes do not establish visual quality.

Metal gold/silver/chromatic are retained Expressive variants, not three promoted systems. Other siblings keep their existing IDs and exact token links. Search prioritizes different families before filling results with siblings and preserves an explicitly requested ID.

Native source appearance and website adaptation are separate. All 31 site palettes support both modes, including adaptations where the registry does not supply both. Native specimen checks use each representative's original appearance; they do not certify every variant's component states in both modes.

## Evidence and limits

On 2026-11-10, source review of the eight copied JSX/CSS kits plus font-loader evidence had zero critical/serious findings. All eight settled 1440px screenshots were visually inspected; the forms, material treatments and typography remain visibly distinguishable with matching content. This is internal review, not user preference research or an automatic aesthetic score.

Edge/Playwright captured **96 states** at 390, 1440 and 1728px: base, primary hover/focus and invite dialog. Source hashes matched the registry copies; required-field/email checks, save, member addition and focus return passed. Measured solid-background text contrast was at least **4.542:1**, spacing had no critical/serious findings, and there were no page errors or runtime Google/Iconify requests.

Raw local evidence is `.work/verification/specimens/`; the website retains a compact specimen summary. Six actual CLI-installed Vite/Next consumers separately passed with Linear, Tactile and Industrial. [RELEASE-CANDIDATE.md](RELEASE-CANDIDATE.md) records exact versions and scope.

Contrast sampling composites solid ancestor backgrounds. It does not inspect pixels over images/gradients or certify accessibility. Moderate source findings include legacy token declarations/comments and Tailwind font alias evidence; moderate spacing findings include off-scale values in retained components. Reviews of supplied evidence are not trusted dashboard receipts.

Regenerate with `npm run sync:previews`, then run `node scripts/verify-specimens.mjs` against the built website and current MCP. Do not replace source fidelity with token/source-distance metrics or recolor the same specimen and count it as another family.
