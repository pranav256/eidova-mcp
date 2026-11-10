# Component registry consumer verification

## 0.2.0 candidate — 2026-11-10

Six clean consumers installed Linear, Tactile and Industrial through actual shadcn 4.23.0 in both Vite 7.3.7 and Next 16.4.6. All production builds, forms, dialog focus, font checks, source/comprehension review and 72 rendered spacing/contrast states passed; minimum sampled text contrast was 4.719:1. The fixture uses React 19.2.0, Tailwind 4.3.5 and Node 24.20.0 on Windows.

Run `npm run verify:consumers` against the local candidate to reproduce. Raw evidence: `.work/consumers/1794301807557/`; scope and release status: [RELEASE-CANDIDATE.md](RELEASE-CANDIDATE.md). This checks representative web kits, not every component or a named agent-host walkthrough.

## Historical 2026-11-07 verification

Verification target: the standalone service at `http://localhost:3000`, on 2026-11-07. The disposable consumer is `.work/consumer/`; it is a verification fixture, not the public product site.

## Consumer setup

The fixture uses React 19.2, Vite 7.2.2, TypeScript 5.9.3, Tailwind 4, a `@/*` source alias and a valid shadcn `components.json`. Components are installed by the actual shadcn CLI rather than copied into the fixture manually.

```powershell
cd .work/consumer
npm.cmd install
npx.cmd shadcn@latest add http://localhost:3000/registry/minimal-light/globals.json http://localhost:3000/registry/minimal-light/button.json http://localhost:3000/registry/minimal-light/input.json --yes
npm.cmd run build
npx.cmd shadcn@latest add http://localhost:3000/registry/airbnb/alert-dialog.json --yes --overwrite
npm.cmd run build
```

Initial observations:

- Both CLI installations completed successfully.
- The minimal-light installation created global CSS, the utility module and the real Button/Input source files, and updated the consumer CSS.
- Installing Airbnb AlertDialog fetched its local Button dependency and updated the Button source. The generic `utils` dependency is resolved by shadcn's standard registry; npm dependencies are installed normally. No Better Design service was needed for the tested component dependency chain.
- TypeScript and Vite builds passed for both states.

## Defects found by independent consumer checks

1. **Theme bindings used undefined CSS variables.** Some upstream `cssVars` keys include leading `--`. Passing these directly through the registry makes shadcn generate entries such as `--color-primary: var(----primary)`. The browser rendered the primary Button with `backgroundColor: rgba(0, 0, 0, 0)` although the `--primary` token existed. The fix is to normalize the served shadcn `cssVars` key names, not patch each consumer by hand.
2. **Ten aggregate shared entries returned 404.** Generated `all.json` roots referenced `_shared.json`, while the initial identifier validator rejected its leading underscore. The source files exist and their imports may be needed; the fix is safe support for the `_shared` identifier rather than omission of the shared source.

Before-fix evidence is retained in `.work/consumer/browser-before-fix.json` and `.work/consumer/registry-before-fix.json`.

The full root check enumerated all 31 systems, fetched 3,119 aggregate item references, and confirmed zero Better Design registry dependency URLs. Before correction, 3,109 items returned successfully and 10 `_shared` items returned 404; 1,684 served CSS variable keys retained a leading `--`.

## Rendered checks

The verification script uses the existing Microsoft Edge installation through Playwright. It exercises the installed Input and Button, captures computed colors and geometry at 390 pixels wide, and checks for browser errors and page overflow.

```powershell
npm.cmd run dev
node verify-browser.mjs --expect-styled browser-after-fix.json
node verify-registry.mjs --expect-normalized registry-after-fix.json
```

## Post-correction result

**The tested registry installation, build, interactions and rendered token styling pass.** After the server fixes, the fixture CSS was reset to its initial Tailwind imports and the same three minimal-light items were reinstalled with `--yes --overwrite`. This checks the served registry rather than applying a manual CSS repair in the consumer.

- TypeScript and Vite production build: passed.
- Real installed Input accepts edits and the Button action updates the output: passed.
- Normal primary Button: opaque black background `[0, 0, 0, 255]`, white foreground `[255, 255, 255, 255]`.
- Input background: opaque `#f5f5f5`, `[245, 245, 245, 255]`.
- Browser errors: none. Horizontal page overflow at 390 pixels: none.
- All 31 aggregate roots returned coherent local item references; all **3,119 referenced items** returned successfully, including the ten `_shared` entries.
- Better Design registry dependency URL references: **0**. CSS variable names with the invalid leading `--`: **0**.

Final machine-readable results: `.work/consumer/browser-after-fix.json` and `.work/consumer/registry-after-fix.json`.

The initial CLI generated a detached `src/components/globals.css` while inserting only tokens into `src/index.css`. That left upstream typography and base-layer rules inactive. This final fidelity gap is now fixed: catalog and custom globals share one CSS converter that inserts the complete supported stylesheet into shadcn's configured CSS entry, without a detached CSS file or manual import. Raw source assets and `tokensCss` remain intact.

After this correction the default minimal-light globals, Button and Input were reinstalled with the actual shadcn CLI from a reset CSS entry. The install and Vite 7.3.7 production build passed, and Edge rendered the fixture at 390 pixels in both modes. Body and Input backgrounds are opaque `#f5f5f5`; body foreground resolves to `[75, 77, 83, 255]`; the body inherits the complete `Geist, GeistSans, ui-sans-serif, system-ui, ...` font stack. The primary Button is black with white text and a 16px radius. Input/Button actions pass, with no browser errors or horizontal overflow. Both package imports are retained without duplication by the real CLI formatter. Machine-readable evidence: `.work/consumer/default-globals-browser.json`.

The three focused `tests/registry-css.test.ts` checks cover raw-source preservation, supported inline theme/base styles, quoted CSS delimiters, repeated layers, theme keyframes, and normalized inline globals across all 31 systems. The shared converter preserves the known package imports and trusted Google/Bunny font stylesheet imports; consumers still need to supply fonts when the source only names a local font family.

Coverage limits: the selected components were installed and compiled; all aggregate-referenced items were fetched and inspected, but every component in every theme was not separately rendered or compiled in this fixture. The public product site is covered by separate checks. A source build alone did not establish correct styling and is not treated as visual approval.

## Custom project registry verification

Custom projects now derive one effective theme for every registry child: catalog defaults, then extracted light/dark brand declarations, then explicit saved configuration. Children no longer restore the base catalog colors after the custom globals item is installed. Explicit shared configuration overrides both modes; distinct brand light/dark values remain distinct when not overridden.

The project globals item inserts its stylesheet into shadcn's configured CSS entry through `css` and `cssVars.theme`; it does not create a separate CSS file that the consumer must remember to import. Theme variables use `cssVars.theme` because the actual shadcn formatter interprets property keys nested directly below `css["@theme inline"]` as selectors. The first CLI attempt caught that formatter error, and the corrected representation was reinstalled and verified.

The custom fixture used a minimal-light base, distinct brand light/dark surface colors, explicit primary `#2457a6`, white primary foreground, a `10px` radius token, Arial/Helvetica body font, Courier New monospace font and compact density. No manually patched CSS or import of the old detached globals file was used.

```powershell
# Replace <project-id> with a created custom project's id.
npx.cmd shadcn@latest add http://localhost:3000/api/projects/<project-id>/registry/globals.json http://localhost:3000/api/projects/<project-id>/registry/button.json http://localhost:3000/api/projects/<project-id>/registry/input.json --yes --overwrite
npm.cmd run build
node verify-custom-browser.mjs http://127.0.0.1:4175/
```

Results after correction:

- Actual shadcn installation: passed with no CSS formatter errors.
- TypeScript and Vite **7.3.7** production build: passed; the updated disposable consumer's npm audit reports zero vulnerabilities.
- Primary Button background in both modes: `[36, 87, 166, 255]` (`#2457a6`); foreground: white.
- Light/dark Input backgrounds: `[238, 247, 255, 255]` and `[22, 36, 52, 255]`.
- Light/dark body backgrounds: `[243, 248, 255, 255]` and `[18, 25, 33, 255]`.
- Computed body font: `Arial, Helvetica, sans-serif`, applied through the actual base-layer font rule.
- Button radius: `14px`, preserving the base component's `radius-xl = radius + 4px` mapping with the custom `10px` token.
- Input and Button behavior: passed. Browser errors and horizontal overflow at 390 pixels: none.

The five focused `tests/custom-project.test.ts` checks cover child override consistency, light/dark precedence, inline stylesheet/font handling, restricted brand extraction and valid hexadecimal color lengths. Machine-readable browser evidence is `.work/consumer/custom-browser-after-fix.json`; `.work/consumer/custom-project.json` records the public test project id and returned token scopes without its private workspace key.

The custom project was reinstalled and rendered again after catalog/project CSS conversion was consolidated; the same light/dark colors, Arial/Courier New fonts, radius and interactions pass against the shared helper.

Font family configuration applies the correct CSS stack; it does not claim to download every named font. Consumers must provide font assets for families that are not installed on the user's system. The actual installation/render checks cover custom globals, Button and Input rather than every component in a full custom aggregate.
