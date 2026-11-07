// DS-as-HTML/CSS export kit for "Journey B": vibecoding an app INLINE inside a
// ChatGPT/Claude artifact, where there is no npm, no build step and no Tailwind
// compile, so the real shadcn React components cannot be installed. This ships
// the system as plain, framework-free HTML + CSS: the token globals.css plus a
// curated set of token-driven component classes the agent can paste into a
// single <style> and use immediately. [BD-98]
//
// Every component reads a DS token with an oklch fallback, so the same kit works
// for any system (light or dark) and degrades gracefully if a token is missing.

import { MOTION_PROFILES } from "../motion-tokens";
import { densityKitNote } from "../inspection/density";

// Curated, framework-free component CSS. Class names are `ds-`-prefixed so they
// never collide with the agent's own markup. Mirrors the real components'
// token contract (oklch tokens, --radius scale, --shadow-* depth) without
// requiring Tailwind. Keep this self-contained: it is pasted verbatim.
export const MINIMUM_TEXT_CONTRAST = "4.5:1" as const;

// Shared by the HTML and Shopify kit envelopes so the pointer-safe hover
// contract is stated once. [BD-341]
export const HOVER_POLICY =
  "Put every :hover rule inside @media (hover: hover) and (pointer: fine); never move controls or override selected/pressed styling. For selectable controls, unselected hover stays neutral: only strengthen the neutral surface or edge, never changes text to the primary color, and never borrows the primary/accent fill. Do not add app-specific :hover rules to ds-* controls; use the kit states verbatim.";

export const INLINE_TEXT_COLOR_POLICY = [
  "Use semantic foreground tokens for text: `--foreground` on the page, `--card-foreground` on cards, and `--muted-foreground` for secondary copy.",
  "The background, card, muted, secondary, accent, and input tokens are surfaces: never use surface tokens as text colors.",
  "Never dim text with opacity. Muted and supporting copy must still meet 4.5:1 against its computed background.",
].join(" ");

// Inline-canvas hosts commonly inject explicit light/dark colors on bare h*,
// strong and label elements. Root inheritance cannot beat those declarations,
// so clients that rebuild the kit under their own root selector need this
// scoped reset. APP_ROOT is deliberately a placeholder because some hosts
// rewrite `.ds` even when the contract tells them not to. [BD-240]
export const HOST_ISOLATION_CSS_TEMPLATE = `APP_ROOT{color:var(--foreground,oklch(0.2 0 0));background:var(--background,oklch(1 0 0))}
APP_ROOT :where(h1,h2,h3,h4,h5,h6,p,strong,label,legend,li,dt,dd,small):not(.ds-supporting):not(.ds-card-desc):not(.ds-muted){color:inherit!important}`;

/**
 * What separates a bespoke asset from generic decoration, and why one is welcome.
 *
 * Shared by BOTH inline deliverables, the generated kit and the stored
 * framework-free doc branch of get-design-system-kit, for the same reason
 * HTML_KIT_CONDUCT_MD is: a client served a pre-compiled kit bypasses
 * buildDsHtmlKit entirely, so guidance written only there never reaches it and
 * that client keeps generating the characterless output this text exists to
 * fix. [BD-505]
 */
export const BESPOKE_ASSET_POLICY = [
  "Cut GENERIC decoration: faux maps, gradient washes, glassmorphism panels, radial-glow backgrounds. Those attach to no particular product, so they read as filler.",
  "A bespoke asset is the opposite and it is welcome. ONE illustration, section seam or piece of hero art, drawn from what this product actually does, is what makes a page look authored instead of generated.",
  "Apply this test before you keep it: could this asset sit unchanged on a competitor's page? If yes, cut it. If no, keep it.",
  "Draw it with these tokens, and reuse its visual language (its drawing style, palette, grid and line weight) for every later asset so the set reads as one family rather than clip art from different sources.",
  "An asset you draw yourself, an inline `<svg>` or an illustration block, is NOT a `ds-*` component: style it freely, as long as every colour comes from these tokens.",
].join(" ");

export const INLINE_COMPOSITION_POLICY = [
  "Start with the primary user moment and make it the largest, highest-contrast composition in the first view; supporting data must read as secondary.",
  "Keep one visible identity block per level. Do not stack an app logo and title directly above a second logo and title for the same experience; make a pool, league, or workspace name subordinate context inside the primary composition instead of another header.",
  "Do not default to a dashboard shell: app title plus metric pills, equal rounded cards, and a sidebar or leaderboard is a generic template unless the user explicitly asked for a dashboard.",
  "Use the inline canvas deliberately: choose a width and grid that fit the requested experience instead of floating a narrow mini-dashboard inside a wide preview or leaving an orphaned column of background.",
  "When one task dominates, compose the primary experience directly on the canvas instead of nesting it in a generic raised card beside another card. Use no more than one major bordered or elevated surface above the fold unless the surfaces are true peers.",
  "Express the product through structure, not nouns alone. If the UI could serve a different product after renaming labels, add domain-specific composition.",
  "Domain expression is pass/fail: do not stop at domain nouns, initials, or three-letter codes. Give the first view at least two unmistakable visual cues from the real activity—such as an event stage, paired opponents, round or time strip, rank movement, route, inventory object, or timeline—using the selected system's tokens and layout rather than decorative filler.",
  "For a sports fixture, build a compact full-width event header with a scoreboard or arena composition, not a plain form inside a white card or a flat neutral slab: pair opponents at display scale around the competition, round, and event state, then keep selection, stake, return, and submit attached as the match's action layer. A pitch or arena cue is optional, not a checkbox; if used, confine it to the event header and make its geometry exact—the center circle must share the exact center point of the halfway lines—and never continue behind form controls or cross text. Put standings below the primary action or behind a tab, never in a co-equal side panel.",
  "When flags, crests, or logos identify paired opponents, paired peers use the same asset treatment and every asset must be accurate; never approximate a flag or logo with a colored rectangle or invented mark. If exact assets are unavailable, omit them for every peer and use consistent names or codes; never invent a one-letter logo.",
  "Do not stretch cards to fill the canvas or match a taller unrelated panel. Repeated peer cards in a grid still align; distinct panels size to their content.",
  "A short primary task must size to content. At the actual canvas size, fail any major bordered or elevated surface when more than one-third of its height is unused after the primary action. Do not use viewport height or a large min-height merely to fill the preview.",
  "Size controls from the value they accept, not from available canvas width: a numeric stake field should be roughly 8–12 characters wide, not a nearly full-width bar. Keep the input, derived value, and primary action in one compact action group; on wide screens the input and button use the same control height and bottom baseline, and on narrow screens they stack in reading order.",
  "Use at least a 1:3 proximity ratio: spacing inside a label/input/action group is no more than one-third of the spacing between separate sections. Keep labels attached to inputs, return values attached to the stake, and the submit action attached to both.",
  "Use cards only for distinct interactive surfaces, reserve pills for compact controls or status, and put deliberate whitespace between groups instead of empty space inside giant bordered boxes.",
  "Empty states stay compact and sit where future content will appear; do not reserve a large bordered panel for one sentence. Hide secondary chrome until data exists.",
].join(" ");

export const INLINE_HIERARCHY_POLICY = [
  "Give the first view one P0 task and at most one P1 summary; move P2 history, standings, detailed metadata, and empty-state chrome below the first view or behind a tab or disclosure.",
  "At the actual inline-canvas size, the first view fails when it exposes more than three major regions, more than five immediately visible actions, or more than 25 visible text fragments unless the screen is a dense tool (traces, logs, tables and dashboards) or the user asked for density.",
  "Do not make a busy screen feel compact by shrinking everything. Use `ds-display` only inside the one P0 composition: once for a single primary task or value, or on co-equal peers within the same event, such as opposing teams. It must compute to at least 1.5× the base UI text. Use `ds-section-title` for scan anchors at at least 1.2× the base UI text, and `ds-supporting` for genuinely secondary copy.",
  "Labels are a last resort: remove captions that restate an obvious value, do not label the same fact twice, and keep no more than two supporting metadata items around the primary entity.",
  "Bold is selective hierarchy, not decoration: emphasize the primary display, section anchors, and the active value; keep labels, metadata, table headers, and helper copy quieter.",
].join(" ");

// Each control moves by the system's motion tokens, falling back to the
// standard profile when a sheet has none. [BD-1137]
const { "--transition-duration-fast": KIT_FAST, "--ease-out": KIT_EASE } = MOTION_PROFILES.standard;
const KIT_TIMING = `var(--transition-duration-fast,${KIT_FAST}) var(--ease-out,${KIT_EASE})`;

export const DS_KIT_CSS = `*,*::before,*::after{box-sizing:border-box}
:where(.ds){font-family:var(--font-sans,ui-sans-serif,system-ui,sans-serif);color:var(--foreground,oklch(0.2 0 0));background:var(--background,oklch(1 0 0));line-height:1.5}
.ds :where(h1,h2,h3,h4,h5,h6,p,strong,label,legend,li,dt,dd,small){color:inherit}
.ds h1,.ds h2,.ds h3,.ds h4{font-family:inherit;font-weight:600;margin:0 0 .5em;color:var(--foreground,oklch(0.2 0 0))}
.ds .ds-display{font-family:inherit;font-size:clamp(1.75rem,4vw,2.5rem);font-weight:700;line-height:1.05;letter-spacing:-.03em;margin:0;color:var(--foreground,oklch(0.2 0 0))}
.ds .ds-section-title{font-family:inherit;font-size:1.25rem;font-weight:600;line-height:1.2;letter-spacing:-.01em;margin:0;color:var(--foreground,oklch(0.2 0 0))}
.ds .ds-supporting{font-size:.875rem;font-weight:400;line-height:1.5;color:var(--muted-foreground,oklch(0.55 0 0));margin:0}
/* A link styled as a button keeps the button's own label colour, so the link
   colour skips .ds-btn. Resetting it with color:inherit outranked every button
   variant and put the page's dark text on the dark primary fill. */
.ds a:not(.ds-btn){color:var(--primary,oklch(0.45 0.15 264));text-decoration:none}
.ds a.ds-btn:hover{text-decoration:none}
.ds p{margin:0 0 1em}
.ds-muted{color:var(--muted-foreground,oklch(0.55 0 0))}

/* Button */
.ds-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;font:inherit;font-size:.875rem;font-weight:500;line-height:1;padding:.6rem 1rem;border-radius:var(--radius-md,calc(var(--radius,0.5rem) - 2px));border:1px solid transparent;cursor:pointer;touch-action:manipulation;transition:opacity ${KIT_TIMING},background ${KIT_TIMING};text-decoration:none}
.ds-btn:focus-visible{outline:2px solid var(--ring,var(--primary,oklch(0.45 0.15 264)));outline-offset:2px}
.ds-btn:disabled{background:var(--muted,oklch(0.94 0 0));color:var(--foreground,oklch(0.2 0 0));border-color:var(--border,oklch(0.85 0 0));opacity:1;cursor:not-allowed}
.ds-btn-primary{background:var(--primary,oklch(0.45 0.15 264));color:var(--primary-foreground,oklch(1 0 0));box-shadow:var(--shadow-sm,var(--shadow-xs,none))}
.ds-btn-secondary{background:var(--secondary,oklch(0.96 0 0));color:var(--secondary-foreground,oklch(0.25 0 0));box-shadow:var(--shadow-xs,none)}
.ds-btn-outline{background:transparent;color:var(--foreground,oklch(0.2 0 0));border-color:var(--border,oklch(0.85 0 0))}
.ds-btn-ghost{background:transparent;color:var(--foreground,oklch(0.2 0 0))}
.ds .ds-btn[aria-pressed="true"],.ds .ds-btn[aria-pressed="true"]:hover{background:var(--primary,oklch(0.45 0.15 264));color:var(--primary-foreground,oklch(1 0 0));border-color:var(--primary,oklch(0.45 0.15 264));opacity:1}
.ds-btn-sm{padding:.4rem .7rem;font-size:.8125rem}
.ds-btn-lg{padding:.75rem 1.4rem;font-size:1rem}

/* Form fields */
.ds-label{display:block;font-size:.8125rem;font-weight:500;margin-bottom:.4rem;color:var(--foreground,oklch(0.2 0 0))}
.ds-input,.ds-textarea,.ds-select{width:100%;font:inherit;font-size:.875rem;padding:.55rem .75rem;border-radius:var(--radius-lg,var(--radius,0.5rem));border:1px solid var(--border,oklch(0.85 0 0));background:var(--input,var(--background,oklch(1 0 0)));color:var(--foreground,oklch(0.2 0 0));box-shadow:var(--shadow-inset,var(--shadow-2xs,none));transition:border-color ${KIT_TIMING},box-shadow ${KIT_TIMING}}
.ds-input::placeholder,.ds-textarea::placeholder{color:var(--muted-foreground,oklch(0.6 0 0))}
.ds-input:focus,.ds-textarea:focus,.ds-select:focus{outline:none;border-color:var(--ring,var(--primary,oklch(0.45 0.15 264)));box-shadow:var(--shadow-inset,0 0 0 0 transparent),0 0 0 2px color-mix(in oklab,var(--ring,var(--primary,oklch(0.45 0.15 264))) 35%,transparent)}
.ds-textarea{min-height:5rem;resize:vertical}

/* Card */
.ds-card{display:flex;flex-direction:column;background:var(--card,var(--background,oklch(1 0 0)));color:var(--card-foreground,var(--foreground,oklch(0.2 0 0)));border:1px solid var(--border,oklch(0.9 0 0));border-radius:var(--radius-xl,calc(var(--radius,0.5rem) + 4px));box-shadow:var(--shadow-glass,var(--shadow-md,var(--shadow-sm,none)));overflow:hidden}
.ds-card-header{padding:1.1rem 1.25rem .5rem}
.ds-card-body{padding:.5rem 1.25rem 1.1rem}
.ds-card-footer{margin-top:auto;padding:.9rem 1.25rem;border-top:1px solid var(--border,oklch(0.92 0 0));display:flex;gap:.5rem;align-items:center}
.ds-card-title{font-size:1.05rem;margin:0 0 .25rem}
.ds-card-desc{font-size:.875rem;color:var(--muted-foreground,oklch(0.55 0 0));margin:0}

/* Badge */
.ds-badge{display:inline-flex;align-items:center;font-size:.6875rem;font-weight:600;padding:.15rem .55rem;border-radius:999px;background:var(--secondary,oklch(0.96 0 0));color:var(--secondary-foreground,oklch(0.25 0 0));line-height:1.4}
.ds-badge-primary{background:var(--primary,oklch(0.45 0.15 264));color:var(--primary-foreground,oklch(1 0 0))}
.ds-badge-outline{background:transparent;border:1px solid var(--border,oklch(0.85 0 0));color:var(--foreground,oklch(0.2 0 0))}
.ds-badge-safe{background:var(--pop-green,oklch(0.92 0.06 150));color:var(--pop-green-foreground,oklch(0.42 0.11 152))}
.ds-badge-warn{background:var(--pop-orange,oklch(0.93 0.05 40));color:var(--pop-orange-foreground,oklch(0.52 0.18 35))}
.ds-badge-danger{background:var(--destructive,oklch(0.58 0.22 32));color:var(--destructive-foreground,oklch(0.99 0 0))}
.ds-badge-unknown{background:var(--pop-yellow,oklch(0.95 0.06 92));color:var(--pop-yellow-foreground,oklch(0.5 0.1 75))}
.ds-badge-verified{background:var(--pop-blue,oklch(0.92 0.045 245));color:var(--pop-blue-foreground,oklch(0.48 0.14 252))}

/* Alert */
.ds-alert{border:1px solid var(--border,oklch(0.9 0 0));border-radius:var(--radius-lg,var(--radius,0.5rem));padding:.9rem 1rem;background:var(--card,var(--background,oklch(1 0 0)));color:var(--card-foreground,var(--foreground,oklch(0.2 0 0)));font-size:.875rem}
.ds-alert-title{font-weight:600;margin:0 0 .2rem}

/* Avatar + misc */
.ds-avatar{width:2.25rem;height:2.25rem;border-radius:999px;background:var(--muted,oklch(0.95 0 0));color:var(--muted-foreground,oklch(0.45 0 0));display:inline-flex;align-items:center;justify-content:center;font-size:.8125rem;font-weight:600}
.ds-divider{height:1px;background:var(--border,oklch(0.9 0 0));border:0;margin:1rem 0}
.ds-row{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}
.ds-field{margin-bottom:1rem}
.ds-control-row{display:grid;grid-template-columns:minmax(8rem,14rem) auto;gap:.75rem;align-items:end;justify-content:start}
.ds-control-row>.ds-field{margin:0}
.ds-control-row>.ds-btn,.ds-control-row .ds-input,.ds-control-row .ds-select{min-height:2.75rem}
.ds-container{max-width:42rem;margin:0 auto;padding:1.5rem}

/* Switch */
.ds-switch{display:inline-flex;align-items:center;gap:.6rem;font-size:.875rem;cursor:pointer}
.ds-switch-track{width:2.25rem;height:1.25rem;border-radius:999px;background:var(--muted,oklch(0.9 0 0));position:relative;transition:background ${KIT_TIMING};flex:none}
.ds-switch-track.on{background:var(--primary,oklch(0.45 0.15 264))}
.ds-switch-thumb{position:absolute;top:2px;left:2px;width:calc(1.25rem - 4px);height:calc(1.25rem - 4px);border-radius:999px;background:var(--background,oklch(1 0 0));box-shadow:var(--shadow-sm,0 1px 2px oklch(0 0 0 / 0.2));transition:transform ${KIT_TIMING}}
.ds-switch-track.on .ds-switch-thumb{transform:translateX(1rem)}

/* Tabs */
.ds-tabs{display:inline-flex;gap:.15rem;padding:.25rem;border-radius:var(--radius-lg,var(--radius,0.5rem));background:var(--muted,oklch(0.96 0 0))}
.ds-tab{font:inherit;font-size:.8125rem;font-weight:500;padding:.4rem .8rem;border:0;border-radius:var(--radius-md,calc(var(--radius,0.5rem) - 2px));background:transparent;color:var(--muted-foreground,oklch(0.5 0 0));cursor:pointer;touch-action:manipulation}
.ds-tab.active{background:var(--background,oklch(1 0 0));color:var(--foreground,oklch(0.2 0 0));box-shadow:var(--shadow-sm,var(--shadow-xs,none))}

/* Progress */
.ds-progress{height:.5rem;border-radius:999px;background:var(--muted,oklch(0.92 0 0));overflow:hidden}
.ds-progress-bar{height:100%;border-radius:999px;background:var(--primary,oklch(0.45 0.15 264))}

/* Table */
.ds-table{width:100%;border-collapse:collapse;font-size:.8125rem}
.ds-table th,.ds-table td{text-align:left;padding:.5rem .75rem;border-bottom:1px solid var(--border,oklch(0.92 0 0))}
.ds-table th{font-weight:600;color:var(--muted-foreground,oklch(0.5 0 0));font-size:.6875rem;text-transform:uppercase;letter-spacing:.04em}

/* Chip / keyboard key */
.ds-chip{display:inline-flex;align-items:center;gap:.35rem;font:inherit;font-size:.8125rem;padding:.3rem .7rem;border-radius:999px;border:1px solid var(--border,oklch(0.88 0 0));background:var(--background,oklch(1 0 0));color:var(--foreground,oklch(0.2 0 0));cursor:pointer;touch-action:manipulation;transition:background-color ${KIT_TIMING},border-color ${KIT_TIMING},color ${KIT_TIMING}}
.ds-chip:focus-visible{outline:2px solid var(--ring,var(--primary,oklch(0.45 0.15 264)));outline-offset:2px}
.ds .ds-chip[aria-pressed="true"],.ds .ds-chip[aria-pressed="true"]:hover{background:var(--primary,oklch(0.45 0.15 264));color:var(--primary-foreground,oklch(1 0 0));border-color:var(--primary,oklch(0.45 0.15 264))}
.ds-kbd{font-family:var(--font-mono,ui-monospace,monospace);font-size:.75rem;padding:.1rem .4rem;border-radius:var(--radius-sm,4px);border:1px solid var(--border,oklch(0.85 0 0));background:var(--muted,oklch(0.97 0 0));color:var(--foreground,oklch(0.2 0 0))}

/* Touch canvases need finger-sized hit areas and inputs that do not trigger mobile zoom. */
@media (pointer:coarse){
.ds-btn,.ds-tab,.ds-chip{min-height:44px}
.ds-input,.ds-select{min-height:44px;font-size:1rem}
}
@media (max-width:40rem){
.ds-control-row{grid-template-columns:1fr}
.ds-control-row>.ds-btn{width:100%}
}

/* Hover is a neutral fine-pointer cue, never a second selection color. */
@media (hover:hover) and (pointer:fine){
.ds a:hover{text-decoration:underline}
.ds-btn:hover:not(:disabled):not([aria-pressed="true"]){opacity:.9}
.ds-btn-ghost:hover:not(:disabled):not([aria-pressed="true"]){background:var(--accent,oklch(0.96 0 0));opacity:1}
.ds-input:hover:not(:disabled),.ds-textarea:hover:not(:disabled),.ds-select:hover:not(:disabled){border-color:color-mix(in oklab,var(--foreground,oklch(0.2 0 0)) 20%,transparent)}
.ds .ds-chip:hover:not([aria-pressed="true"]){background:color-mix(in oklab,var(--foreground,oklch(0.2 0 0)) 4%,var(--background,oklch(1 0 0)));color:var(--foreground,oklch(0.2 0 0));border-color:color-mix(in oklab,var(--foreground,oklch(0.2 0 0)) 28%,var(--border,oklch(0.88 0 0)))}
}

/* Selection adopts the accent, matching the real systems */
.ds ::selection{background:var(--primary,oklch(0.45 0.15 264));color:var(--primary-foreground,oklch(1 0 0))}`;

// Isolated component wiring only. A previous full-page "Dashboard" sample
// anchored hosted agents to that generic composition regardless of the user's
// actual product, so this reference deliberately provides no page layout.
export const DS_KIT_EXAMPLE_HTML = `<div class="ds">
  <!-- Component class reference — not a page layout. Compose around the requested product's primary user moment. -->
  <div>
    <h1 class="ds-display">Primary task or event</h1>
    <p class="ds-supporting">One short supporting line.</p>
  </div>
  <h2 class="ds-section-title">Section anchor</h2>
  <div class="ds-control-row">
    <div class="ds-field">
      <label class="ds-label" for="example-value">Visible label</label>
      <input class="ds-input" id="example-value" placeholder="Input value" />
    </div>
    <button class="ds-btn ds-btn-primary">Primary action</button>
  </div>
  <div class="ds-row">
    <button class="ds-btn ds-btn-outline">Secondary action</button>
    <button class="ds-chip" aria-pressed="false">Toggle option</button>
    <span class="ds-badge ds-badge-safe">Status</span>
  </div>
</div>`;

function fence(lang: string, body: string): string {
  return "```" + lang + "\n" + body + "\n```";
}

/** Parse `prop:value;` declarations from a CSS block body, dropping blanks and
 * self-referential no-ops (`--x: var(--x)`), preserving first-seen order. */
function parseDecls(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const decl of body.split(";")) {
    const i = decl.indexOf(":");
    if (i === -1) continue;
    const prop = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (!prop || !val) continue;
    // `--x: var(--x)` resolves to itself — pure noise the generator emits.
    if (prop.startsWith("--") && val.replace(/\s+/g, "") === `var(${prop})`) continue;
    out.set(prop, val);
  }
  return out;
}

/** Pull `@charset` / `@import` statements off the CSS (in source order) and
 * return them plus the remaining body. An `@import` after any style rule is
 * invalid + ignored by browsers, so these MUST stay at the very top — the DS
 * webfont loads via `@import url("…googlefonts…")`. url() values contain `;`
 * (font weights `wght@400;500;…`), so the quoted url is matched explicitly
 * rather than splitting on `;`. [BD-197] */
function hoistAtRules(css: string) {
  const atRules: string[] = [];
  const grab = (m: string) => {
    atRules.push(m.trim());
    return "";
  };
  const body = css
    .replace(/@charset\s+(['"]).*?\1\s*;/g, grab)
    .replace(/@import\s+url\(\s*(['"]).*?\1\s*\)[^;]*;/g, grab)
    .replace(/@import\s+(['"]).*?\1[^;]*;/g, grab);
  return { atRules, body };
}

/**
 * Compact the raw token stylesheet before it ships in the kit [BD-197]. The
 * generated `globals.css` is dumped verbatim and is bloated + partly broken:
 *  - several separate `:root{}` blocks (tokens / fonts / radius / shadows),
 *  - a `.dark{}` that is a byte-copy of the light `:root` (a theming bug — and
 *    pure bloat for a single-theme inline artifact),
 *  - self-referential no-ops like `--shadow-s: var(--shadow-s)`.
 * Strip comments (a `}` inside `/* … *\/` would truncate a brace-naive block
 * match), keep `@import`/`@charset` hoisted to the top, merge every `:root` into
 * one (last value wins), strip the self-refs, and drop the `.dark` vars that
 * match `:root`. Non-`:root`/`.dark` rules (component overrides) pass through.
 */
export function compactTokensCss(css: string): string {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const { atRules, body } = hoistAtRules(noComments);
  const header = atRules.length ? atRules.join("\n") + "\n\n" : "";

  const merged = new Map<string, string>();
  for (const m of body.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const [prop, val] of parseDecls(m[1])) merged.set(prop, val);
  }
  if (merged.size === 0) return (header + body.trim()).trim() || css.trim();
  const rootBody = [...merged].map(([p, v]) => `  ${p}: ${v};`).join("\n");

  // Keep only the `.dark` vars that actually differ from `:root` — overriding to
  // the same value is a no-op. If none differ, `.dark` is a pure copy → drop it.
  let darkOut = "";
  const darkMatch = body.match(/\.dark\s*\{([^}]*)\}/);
  if (darkMatch) {
    const diff = [...parseDecls(darkMatch[1])].filter(([p, v]) => merged.get(p) !== v);
    if (diff.length) {
      const darkBody = diff.map(([p, v]) => `  ${p}: ${v};`).join("\n");
      darkOut = `\n.dark {\n${darkBody}\n}`;
    }
  }

  const rest = body
    .replace(/:root\s*\{[^}]*\}/g, "")
    .replace(/\.dark\s*\{[^}]*\}/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();

  return `${header}:root {\n${rootBody}\n}${darkOut}${rest ? "\n\n" + rest : ""}`;
}

export interface DsHtmlKitInput {
  name: string;
  /** Token stylesheet: `:root{--background:...}` etc. from the registry. */
  tokensCss: string;
  /** Link to the full live showcase / project page. */
  viewUrl?: string;
  /** Identifies where this kit came from so follow-up instructions use the right workflow. */
  source?:
    | { kind: "catalog"; designSystemId: string }
    | { kind: "project"; projectId: string };
  /**
   * Per-DS `.ds-*` overrides carrying THIS system's real component material
   * (card depth, switch checked fill, badge radius, etc.) plus the covered /
   * excluded manifest, from buildDsComponentCss. Omit for the generic shell. [BD-149]
   */
  componentKit?: { css: string; covered: string[]; excluded: string[] };
}

// Copy restraint + mandatory pre-present review chain. Shared by BOTH inline
// deliverables: the generated kit below AND the stored framework-free doc branch
// in get-design-system-kit (which bypasses buildDsHtmlKit entirely) — a real
// ChatGPT session shipped emoji icons, template layouts and unlabeled inputs
// because no payload it read carried these rules. [BD-218]
export const HTML_KIT_CONDUCT_MD = [
  "## Build with the selected system (mandatory)",
  "1. Before composing the UI, call `get-ui-principle` for visual hierarchy, spacing, typography, color and polish, then call `get-ux-principle` for the requested navigation, forms and interactions.",
  "2. Wrap the entire artifact in `.ds` and use the kit's `ds-*` classes for component styling. Custom CSS is layout-only; do not replace the selected system's components, tokens, states, radii or shadows.",
  "3. This class contract is pass/fail: do not rename `ds-*` to an app-specific prefix. Before presenting, inspect the artifact source. If it does not contain a root `class=\"ds\"` and `ds-*` component classes, revise the artifact instead of presenting it.",
  "4. Paste `hostIsolationCssTemplate` after host/base CSS, replacing `APP_ROOT` with the real root. Follow `textColorPolicy`: never use surface tokens as text colors, never dim text with opacity, and use `--muted-foreground` for secondary copy.",
  "5. First-view hierarchy is pass/fail: one P0 task, at most one P1 summary; unless the screen is a dense tool (traces, logs, tables and dashboards) or density was requested, no more than three major regions, five immediately visible actions, or 25 visible text fragments.",
  "6. Composition is pass/fail: one identity, content-sized task, aligned field/action, accurate paired assets, and event-only decoration.",
  "",
  "## Before you show it (mandatory)",
  "1. Call `get-review-rules` (category `all`) and fix every critical and serious issue it reports BEFORE presenting the artifact to the user.",
  "2. Self-check the rendered artifact, not just its source: every visible text color has at least 4.5:1 contrast against its computed background (never rely on inherited host text color or opacity); every input has a visible `<label>`; selected/active states use the role-appropriate native or ARIA state (`aria-pressed` for toggle buttons, `aria-selected` for tabs/options, native `checked` for checkboxes, `aria-current` for current links) plus a visible non-color cue; interactive tiles look pressable (border, hover, pressed state); hover-only CSS lives inside `@media (hover: hover) and (pointer: fine)`, never moves a control, and never overrides its selected/pressed treatment. For selectable controls, unselected hover stays neutral: it may slightly strengthen the neutral surface or edge, but never changes text to the primary color or borrows the primary/accent fill; only selection gets the saturated brand treatment. Do not add app-specific `:hover` rules to `ds-*` controls; use the kit states verbatim. Selected states also stay spatially stable (no translate/scale); focus stays visible (never remove an outline without a replacement); toasts and status text use `role=\"status\"`; every color comes from the system's tokens; radii come from the `--radius` scale.",
  "3. Inspect the artifact at its actual inline-canvas size, not only the source or a narrow crop. It fails if the purpose, context, and primary action are not obvious in three seconds; if the primary user moment is not the visual focal point; if this contract's hierarchy and information budget is exceeded; or if empty and secondary regions dominate the first view.",
  "4. Keep one source of truth for mutable domain data and derive every balance, rank, total, return, counter, and success message from it. Exercise the main interaction through enough repetitions to cross a boundary or change an ordering, then verify the displayed state is internally consistent: sort ranked lists by the value the rank represents; if an action changes the sort key, re-sort and re-render the full list immediately; never patch one DOM label while leaving peer values stale; make balances, totals, returns, and success messages agree; never hard-code sample data that contradicts the state.",
  "",
  "## Disclosure and page-title discipline (pass/fail)",
  "- On browse, list, overview, and manage screens, keep creation and configuration forms behind a labeled CTA; reveal them in a popover, dialog, sheet, drawer, or dedicated route after intent. Inline forms are reserved for screens where completing the form is the P0 task, including sign-in, checkout, onboarding, settings, focused editors, and controls that operate the current view.",
  "- Keep one visible page title. Delete later headings or helper lines that only rename the page or paraphrase the tabs and controls immediately below them; retain accessible labels on those controls.",
  "",
  "## Hierarchy and information budget (pass/fail)",
  INLINE_HIERARCHY_POLICY,
  "",
  "## Draw one asset that only this product could carry",
  BESPOKE_ASSET_POLICY,
  "",
  "## Compose the screen, do not decorate the canvas",
  INLINE_COMPOSITION_POLICY,
  "",
  "## Write the UI copy like a designer",
  "The words inside the screen are part of the design, and overwriting them is the fastest generated-content tell:",
  "- Headlines: about 6 words max. Supporting line: about 15 words, at most one per section.",
  "- No filler adjectives (seamless, effortless, powerful), no exclamation marks.",
  "- Never use emoji as icons or status indicators. Use the badge/status classes this system ships or an inline SVG.",
  "- Every visible text fragment needs one job: context, outcome, next action, real doubt, or legal/security. Do not add template footer, provenance, helper, or slogan copy.",
  "- Run the deletion test: if deletion does not hurt meaning, action clarity, safety, compliance, or tone, keep it deleted.",
  "- A second page title or section introduction fails when it only repeats the page noun, tabs, or adjacent controls. Keep the control's accessible label and delete the visible duplicate.",
  "- Sweat the small strings: pluralize counts (1 bet, 2 bets), no redundant self-labels (\"You (you)\"), spell out abbreviations, units and currency as real words or an inline icon (\"1,000 coins\", never an improvised glyph like \"§\"), and empty states name the next action.",
  "- Never place an eyebrow, kicker, category, or status label immediately above an h1, h2, or h3. Start with the title and put essential context in the supporting line or after the title.",
  "- Skip the template-landing-page shapes unless the user asks for them: gradient hero with an uppercase eyebrow pill, centered three-card feature grid, left-border callout boxes.",
  "- Status surfaces (warnings, banners) use the system's semantic status tokens; if it ships none, use a bordered card on the default surface, never a chart/data-viz tint. Selected rows get a clearly contrasting treatment (primary fill or a visible edge), not the hover token's faint tint.",
].join("\n");

// Build the Markdown the MCP tool returns: paste-ready tokens + component CSS +
// example, with a short usage guide. This is the "Journey B" deliverable.
export function buildDsHtmlKit({ name, tokensCss, viewUrl, source, componentKit }: DsHtmlKitInput): string {
  const materialCss = componentKit?.css?.trim();
  const sourceLine =
    source?.kind === "catalog"
      ? `Source designSystemId: \`${source.designSystemId}\``
      : source?.kind === "project"
        ? `Source projectId: \`${source.projectId}\``
        : null;
  const realComponentsHint =
    source?.kind === "catalog"
      ? ` For these, install the real React components with \`get-design-system-kit({ target: "react", designSystemId: "${source.designSystemId}" })\`.`
      : source?.kind === "project"
        ? ` This kit came from generated projectId \`${source.projectId}\`; call \`get-design-system-status\` with that projectId for the real React install command.`
        : "";
  return [
    `# ${name} — HTML/CSS kit`,
    "",
    "Framework-free build kit for vibecoding an app **inline** (ChatGPT canvas / Claude artifact), where you cannot run the shadcn React install. Paste both stylesheets into one `<style>`, wrap your UI in a `.ds` element, and use the `ds-` classes. Every value comes from this system's real tokens.",
    ...(sourceLine ? ["", sourceLine] : []),
    "",
    // Keep the behavioral contract before the large CSS blocks. Hosted agents
    // may truncate long tool results; putting the mandatory review chain first
    // ensures it survives even when the tail of the kit does not. [BD-240]
    HTML_KIT_CONDUCT_MD,
    "",
    "## 0. Protect the system from host canvas CSS",
    "Replace `APP_ROOT` with the artifact's actual root selector, then paste this after any host/base stylesheet. This keeps host typography rules from overriding the selected system's foreground color.",
    "",
    fence("css", HOST_ISOLATION_CSS_TEMPLATE),
    "",
    "## 1. Design tokens (paste first)",
    "These are the system's actual oklch tokens, fonts, radius and shadow scale.",
    ...(densityKitNote(tokensCss) ? ["", densityKitNote(tokensCss)] : []),
    "",
    fence("css", compactTokensCss(tokensCss)),
    "",
    "## 2. Component CSS (paste second)",
    "Token-driven, vanilla CSS. No Tailwind, no build step.",
    "",
    fence("css", DS_KIT_CSS),
    "",
    ...(materialCss
      ? [
          "## 2b. This system's real component material (paste last)",
          "Pulled from this DS's actual components: card depth, the switch's checked fill, badge radius, the hero button's gradient/rim. Overrides the generic shell so the kit looks like THIS system, not a neutral default. Paste after the block above.",
          "",
          fence("css", materialCss),
          "",
        ]
      : []),
    "## 3. Component class reference (not a page layout)",
    "",
    fence("html", DS_KIT_EXAMPLE_HTML),
    "",
    "## How to use",
    "- Paste every CSS block above VERBATIM into a single `<style>` tag (tokens first, real material last). Copy the blocks exactly, never retype or summarize them from memory: retyped CSS silently drops this system's material.",
    "- Wrap your app in `<div class=\"ds\">` so the base type/color apply.",
    "- Typography: use `ds-display` once for the primary task or event, `ds-section-title` for short scan anchors, and `ds-supporting` for secondary copy. Do not override these into a flat, uniformly small type scale.",
    "- Components: `ds-btn` (`ds-btn-primary|secondary|outline|ghost`, `ds-btn-sm|lg`), `ds-input` / `ds-textarea` / `ds-select` + `ds-label`, `ds-card` (`ds-card-header|body|footer`, `ds-card-title|desc`), `ds-badge` (`ds-badge-primary|outline|safe|warn|danger|unknown|verified`), `ds-alert`, `ds-avatar`, `ds-divider`, layout helpers `ds-row` / `ds-field` / `ds-control-row` / `ds-container`. Use `ds-control-row` for a labeled field beside its primary action so their control edges align.",
    "- Status colors: the `ds-badge-safe|warn|danger|unknown|verified` classes are colour modifiers, so add them ALONGSIDE the base `ds-badge`, for example `<span class=\"ds-badge ds-badge-safe\">Sesame-free</span>`. They map to the system's own status tokens. Reach for these instead of hand-writing a colored badge from a raw token.",
    "- Filters, toggles and any tappable pill use `ds-chip` (or `ds-btn`) rendered as a real `<button>`, never a `ds-badge` span. Badges are read-only status labels.",
    "- Make the mock WORK, not just render: wire a few lines of vanilla JS so every control has a VISIBLE EFFECT. Filter chips toggle `aria-pressed` (the kit styles `ds-chip[aria-pressed=\"true\"]` as selected) AND actually filter: tag each list item with `data-tags=\"...\"` and hide items that do not match the pressed chips. Search inputs filter the list on `input`. A control that changes nothing reads as broken.",
    "- Custom classes are for LAYOUT only (position, spacing, grid). Never restyle a `ds-*` component's geometry or surface (border-radius, borders, shadows, fills) — those carry this system's identity. If a component looks wrong, use a different `ds-*` component, do not reshape it. An asset you draw yourself (an inline `<svg>` or an illustration block) is NOT a `ds-*` component: style it freely, as long as every colour comes from these tokens.",
    "- Cards in a grid must stay aligned: the kit pins `ds-card-footer` to the card bottom so rows of cards keep equal footer lines even when a badge row wraps — do not override that. Keep wrap-prone rows (badges, chips) in the same slot on every card so nothing reads as misaligned.",
    "- Build any layout you want with these tokens, do not invent new colors. For the full React component set in a real project, call `get-design-system-kit` with `target: \"react\"` instead.",
    "",
    "## Keep it tight",
    "Build the screens the user actually asked for (one, unless they asked for more) and compose the `ds-*` components above.",
    BESPOKE_ASSET_POLICY,
    "Skip a long write-up: ship the artifact with a one-line note, no multi-paragraph explanation or trailing follow-up questions.",
    ...(componentKit?.excluded?.length
      ? [
          "",
          "## Not in this kit (use the real components)",
          `Interactive components can't be reproduced as static HTML in their real look: ${componentKit.excluded.join(", ")}.${realComponentsHint}${viewUrl ? ` See the live showcase: ${viewUrl}.` : ""}`,
        ]
      : []),
    viewUrl ? `\nFull live showcase: ${viewUrl}` : "",
  ].join("\n");
}
