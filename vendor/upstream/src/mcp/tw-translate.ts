// Hand-translate the subset of Tailwind v4 utility classes our DS components use
// into plain CSS, one rule per class (`.items-center{align-items:center}`),
// matching the shape the real Tailwind compiler emits. Pure JS — runs anywhere,
// no oxide/filesystem — so it works in the Worker and the build/seed scripts.
// Verified class-by-class against the real compiler (the oracle) so it stays
// faithful instead of leaky. [BD-163]
//
// Model: the HTML keeps the component's real Tailwind class names; this module
// produces the CSS that makes those classes render. Unknown classes are reported
// (not silently dropped) so the oracle harness can surface gaps to close.

import { TW_STATIC_EXTRACTED, TW_VARIANTS_EXTRACTED, TW_KEYFRAMES } from "./tw-extracted.generated";

export interface TranslatedRule {
  /** The full CSS selector, e.g. `.bg-primary` or `.hover\:bg-accent:hover`. */
  selector: string;
  /** CSS declarations without braces, e.g. `background-color:var(--primary)`. */
  body: string;
  /** Optional media query wrapper for responsive variants (`sm:`, `md:`…). */
  media?: string;
}

// Responsive breakpoints → min-width. Variant `sm:` wraps the rule in @media.

/** A translation table keyed by the class fragment it recognises. */
interface CssValueTable {
  [utility: string]: string;
}

/** A table whose utility expands to several CSS properties. */
interface CssPropsTable {
  [utility: string]: string[];
}

/** Variant tables that rewrite the selector they apply to. */
interface SelectorTable {
  [variant: string]: (selector: string) => string;
}

/** Palette families, each a shade-to-color table. */
interface PaletteTable {
  [family: string]: CssValueTable;
}

/** Composers that build a declaration from an arbitrary value. */
interface ComposerTable {
  [prefix: string]: (value: string) => string;
}

/** Hints that pick which arbitrary-value kind a bracket value is. */
interface HintKindTable {
  [hint: string]: ArbitraryKind;
}

/** Arbitrary-prefix handlers, keyed by the utility prefix they resolve. */
interface ArbitrarySpecTable {
  [prefix: string]: ArbitraryPrefixSpec;
}

const BREAKPOINTS: CssValueTable = {
  sm: "40rem", md: "48rem", lg: "64rem", xl: "80rem", "2xl": "96rem",
};

// Marker classes that emit no CSS of their own (they are targeted by group-*/
// peer-* selectors). Known, but produce an empty rule. [BD-163]
const KNOWN_EMPTY = new Set(["group", "peer"]);

// Tailwind palette colors some DS components use directly (success/warning
// badges) — the common shades, as the v4 oklch values. [BD-163]
const PALETTE: PaletteTable = {
  emerald: { "50": "oklch(0.979 0.021 166.1)", "100": "oklch(0.95 0.052 163.1)", "200": "oklch(0.905 0.093 164.2)", "400": "oklch(0.765 0.177 163.2)", "500": "oklch(0.696 0.17 162.5)", "600": "oklch(0.596 0.145 163.2)", "700": "oklch(0.508 0.118 165.6)" },
  green: { "50": "oklch(0.982 0.018 155.8)", "100": "oklch(0.962 0.044 156.7)", "400": "oklch(0.792 0.209 151.7)", "500": "oklch(0.723 0.219 149.6)", "600": "oklch(0.627 0.194 149.2)", "700": "oklch(0.527 0.154 150.1)" },
  orange: { "50": "oklch(0.98 0.016 73.7)", "100": "oklch(0.954 0.038 75.2)", "200": "oklch(0.901 0.076 70.7)", "400": "oklch(0.75 0.183 55.9)", "500": "oklch(0.705 0.213 47.6)", "600": "oklch(0.646 0.222 41.1)", "700": "oklch(0.553 0.195 38.4)" },
  amber: { "50": "oklch(0.987 0.022 95.3)", "100": "oklch(0.962 0.059 95.6)", "400": "oklch(0.828 0.189 84.4)", "500": "oklch(0.769 0.188 70.1)", "600": "oklch(0.666 0.179 58.3)", "700": "oklch(0.555 0.163 48.998)" },
  red: { "50": "oklch(0.971 0.013 17.4)", "100": "oklch(0.936 0.032 17.7)", "200": "oklch(0.885 0.062 18.3)", "300": "oklch(0.808 0.114 19.6)", "400": "oklch(0.704 0.191 22.2)", "500": "oklch(0.637 0.237 25.3)", "600": "oklch(0.577 0.245 27.3)", "700": "oklch(0.505 0.213 27.5)" },
  yellow: { "50": "oklch(0.987 0.026 102.2)", "100": "oklch(0.973 0.071 103.2)", "400": "oklch(0.852 0.199 91.9)", "500": "oklch(0.795 0.184 86.05)", "600": "oklch(0.681 0.162 75.8)", "700": "oklch(0.554 0.135 66.4)" },
  blue: { "50": "oklch(0.97 0.014 254.6)", "100": "oklch(0.932 0.032 255.6)", "500": "oklch(0.623 0.214 259.8)", "600": "oklch(0.546 0.245 262.9)", "700": "oklch(0.488 0.243 264.4)" },
  sky: { "50": "oklch(0.977 0.013 236.6)", "100": "oklch(0.951 0.026 236.8)", "500": "oklch(0.685 0.169 237.3)", "600": "oklch(0.588 0.158 241.97)", "700": "oklch(0.5 0.134 242.7)" },
  rose: { "50": "oklch(0.969 0.015 12.4)", "100": "oklch(0.941 0.03 12.6)", "500": "oklch(0.645 0.246 16.4)", "600": "oklch(0.586 0.253 17.6)", "700": "oklch(0.514 0.222 16.9)" },
  slate: { "50": "oklch(0.984 0.003 247.9)", "100": "oklch(0.968 0.007 247.9)", "500": "oklch(0.554 0.046 257.4)", "600": "oklch(0.446 0.043 257.3)", "700": "oklch(0.372 0.044 257.3)", "900": "oklch(0.208 0.042 265.8)" },
  zinc: { "50": "oklch(0.985 0 0)", "100": "oklch(0.967 0.001 286.4)", "400": "oklch(0.705 0.015 286.1)", "500": "oklch(0.552 0.016 285.9)", "600": "oklch(0.442 0.017 285.8)", "700": "oklch(0.37 0.013 285.8)", "800": "oklch(0.274 0.006 286)", "900": "oklch(0.21 0.006 285.9)" },
  gray: { "50": "oklch(0.985 0.002 247.8)", "100": "oklch(0.967 0.003 264.5)", "400": "oklch(0.707 0.022 261.3)", "500": "oklch(0.551 0.027 264.4)", "600": "oklch(0.446 0.03 256.8)", "700": "oklch(0.373 0.034 259.7)", "900": "oklch(0.21 0.034 264.7)" },
  neutral: { "50": "oklch(0.985 0 0)", "100": "oklch(0.97 0 0)", "400": "oklch(0.708 0 0)", "500": "oklch(0.556 0 0)", "600": "oklch(0.439 0 0)", "700": "oklch(0.371 0 0)", "900": "oklch(0.205 0 0)" },
};

const FONT_FAMILY: CssValueTable = {
  "font-sans": "font-family:var(--font-sans)",
  "font-serif": "font-family:var(--font-serif)",
  "font-mono": "font-family:var(--font-mono)",
};
const FLEX_EXTRA: CssValueTable = {
  "flex-col-reverse": "flex-direction:column-reverse",
  "flex-wrap-reverse": "flex-wrap:wrap-reverse",
  "caption-bottom": "caption-side:bottom",
  "shrink": "flex-shrink:1",
  "sr-only": "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border-width:0",
};

// Initial values for the `--tw-*` custom properties the verified extracted map
// composes (ring, shadow, transform). Tailwind's own base layer declares these;
// we emit a compact version so the composed forms render in a paste-anywhere
// kit that has no Tailwind preflight. Prepended only when a rule references one.
export const TW_DEFAULTS =
  "*,::before,::after,::backdrop{" +
  "--tw-ring-color:currentcolor;--tw-ring-shadow:0 0 0 transparent;--tw-ring-offset-shadow:0 0 0 transparent;" +
  "--tw-ring-offset-width:0px;--tw-ring-offset-color:oklch(1 0 0);--tw-ring-inset:;" +
  "--tw-shadow:0 0 0 transparent;--tw-inset-shadow:0 0 0 transparent;--tw-inset-ring-shadow:0 0 0 transparent;" +
  "--tw-scale-x:1;--tw-scale-y:1;--tw-scale-z:1;--tw-translate-x:0;--tw-translate-y:0;--tw-translate-z:0;" +
  "--tw-rotate-x:;--tw-rotate-y:;--tw-rotate-z:;--tw-skew-x:;--tw-skew-y:;" +
  "--tw-gradient-from:transparent;--tw-gradient-to:transparent;--tw-gradient-stops:;" +
  "--tw-blur:;--tw-brightness:;--tw-contrast:;--tw-saturate:;--tw-content:''}";

// ---------------------------------------------------------------------------
// Selector escaping — Tailwind escapes `:[]/.#(),%` etc. in the class selector.
// ---------------------------------------------------------------------------
const ESCAPE_RE = /[:\\[\]/.#(),%!&>~*+="'@]/g;
export function escapeClassName(cls: string): string {
  return cls.replace(ESCAPE_RE, (c) => `\\${c}`).replace(/ /g, "\\ ");
}

// ---------------------------------------------------------------------------
// Variant prefixes → selector transform. Order: applied left-to-right.
// ---------------------------------------------------------------------------
type VariantFn = (base: string) => string;
const STATE_VARIANTS: CssValueTable = {
  hover: ":hover",
  focus: ":focus",
  "focus-visible": ":focus-visible",
  "focus-within": ":focus-within",
  active: ":active",
  visited: ":visited",
  disabled: ":disabled",
  checked: ":checked",
  required: ":required",
  "read-only": ":read-only",
  "first": ":first-child",
  "last": ":last-child",
  "odd": ":nth-child(odd)",
  "even": ":nth-child(even)",
  "empty": ":empty",
};
const GROUP_PEER: SelectorTable = {
  "group-hover": (s) => `.group:hover ${s}`,
  "group-focus": (s) => `.group:focus ${s}`,
  "peer-hover": (s) => `.peer:hover ~ ${s}`,
  "peer-focus": (s) => `.peer:focus ~ ${s}`,
  "peer-checked": (s) => `.peer:checked ~ ${s}`,
  "peer-disabled": (s) => `.peer:disabled ~ ${s}`,
};

// `data-[state=checked]:` → `[data-state="checked"]`, `aria-[...]`, etc.
function dataAriaVariant(v: string): VariantFn | null {
  const m = v.match(/^(data|aria)-\[([^\]]+)\]$/);
  if (!m) return null;
  const [, kind, expr] = m;
  const eq = expr.match(/^([\w-]+)\s*=\s*(.+)$/);
  if (eq) {
    const val = eq[2].replace(/^["']|["']$/g, "");
    return (base) => `${base}[${kind}-${eq[1]}="${val}"]`;
  }
  // boolean attribute, e.g. data-[disabled] / aria-[expanded]
  return (base) => `${base}[${kind}-${expr}]`;
}

// Pseudo-ELEMENT variants (verified extracted set): placeholder → ::placeholder,
// before → ::before, etc. before/after need a default content unless the class
// sets one. [BD-163]
const PSEUDO_ELEMENTS: CssValueTable = {
  placeholder: "::placeholder",
  before: "::before",
  after: "::after",
  file: "::file-selector-button",
  marker: "::marker",
  selection: "::selection",
  "first-line": "::first-line",
  "first-letter": "::first-letter",
  backdrop: "::backdrop",
};

function applyVariant(selector: string, variant: string): string | null {
  if (STATE_VARIANTS[variant]) return `${selector}${STATE_VARIANTS[variant]}`;
  if (PSEUDO_ELEMENTS[variant]) return `${selector}${PSEUDO_ELEMENTS[variant]}`;
  if (GROUP_PEER[variant]) return GROUP_PEER[variant](selector);
  if (TW_VARIANTS_EXTRACTED[variant] && !PSEUDO_ELEMENTS[variant] && !STATE_VARIANTS[variant]) {
    const suffix = TW_VARIANTS_EXTRACTED[variant];
    return suffix.startsWith(":") ? `${selector}${suffix}` : `${selector}${suffix}`;
  }
  const da = dataAriaVariant(variant);
  if (da) return da(selector);
  // aria shorthand: aria-selected → [aria-selected="true"]
  const ariaShort = variant.match(/^aria-(selected|checked|expanded|disabled|current|pressed|hidden)$/);
  if (ariaShort) return `${selector}[aria-${ariaShort[1]}="true"]`;
  // has-[...] → :has(...)
  const has = variant.match(/^has-\[(.+)\]$/);
  if (has) return `${selector}:has(${has[1].replace(/(?<!\\)_/g, " ")})`;
  // group-data-[state=open] / group-aria-... → `.group[...] <selector>`
  const groupData = variant.match(/^group-(data|aria)-\[([^\]]+)\]$/);
  if (groupData) {
    const eq = groupData[2].match(/^([\w-]+)\s*=\s*(.+)$/);
    const attr = eq
      ? `${groupData[1]}-${eq[1]}="${eq[2].replace(/^["']|["']$/g, "")}"`
      : `${groupData[1]}-${groupData[2]}`;
    return `.group[${attr}] ${selector}`;
  }
  // group-[.destructive] arbitrary group variant → `.group.destructive <sel>`
  const groupArb = variant.match(/^group-\[(.+)\]$/);
  if (groupArb) {
    const inner = groupArb[1].replace(/&/g, "").replace(/(?<!\\)_/g, " ");
    return `.group${inner} ${selector}`;
  }
  // Arbitrary variant `[&>svg]` / `[&_svg]` / `[&:has(...)]` → replace & with the
  // class selector; `_` is a descendant space. [BD-163]
  const arb = variant.match(/^\[(.+)\]$/);
  if (arb && arb[1].includes("&")) {
    const inner = arb[1].replace(/&/g, selector).replace(/(?<!\\)_/g, " ");
    return inner;
  }
  // Unsupported variant (responsive sm:/md:, dark:, supports-[]) — caller drops it.
  return null;
}

// before:/after: render nothing without `content`; Tailwind auto-injects it.
function needsContent(variants: string[], body: string): boolean {
  return (variants.includes("before") || variants.includes("after")) && !/(^|;)\s*content\s*:/.test(body);
}

// ---------------------------------------------------------------------------
// Spacing scale: Tailwind v4 maps numeric steps to `calc(var(--spacing)*n)`.
// We resolve to rems (--spacing = 0.25rem) so the CSS is token-free + portable.
// Fractions (1.5, 2.5, 3.5) and px/full/auto handled too.
// ---------------------------------------------------------------------------
function spacing(token: string): string | null {
  if (token === "px") return "1px";
  if (token === "full") return "100%";
  if (token === "auto") return "auto";
  if (token === "screen") return "100vh"; // overridden per-axis where needed
  if (/^\d+(\.\d+)?$/.test(token)) {
    const n = parseFloat(token);
    return `${(n * 0.25).toFixed(4).replace(/\.?0+$/, "")}rem`;
  }
  const frac = token.match(/^(\d+)\/(\d+)$/);
  if (frac) return `${((+frac[1] / +frac[2]) * 100).toFixed(4).replace(/\.?0+$/, "")}%`;
  return null;
}

const SPACING_PROP: CssPropsTable = {
  p: ["padding"],
  px: ["padding-left", "padding-right"],
  py: ["padding-top", "padding-bottom"],
  pt: ["padding-top"], pr: ["padding-right"], pb: ["padding-bottom"], pl: ["padding-left"],
  ps: ["padding-inline-start"], pe: ["padding-inline-end"],
  m: ["margin"],
  mx: ["margin-left", "margin-right"],
  my: ["margin-top", "margin-bottom"],
  mt: ["margin-top"], mr: ["margin-right"], mb: ["margin-bottom"], ml: ["margin-left"],
  ms: ["margin-inline-start"], me: ["margin-inline-end"],
  gap: ["gap"], "gap-x": ["column-gap"], "gap-y": ["row-gap"],
  "space-x": ["column-gap"], "space-y": ["row-gap"], // approximation
  inset: ["inset"], top: ["top"], right: ["right"], bottom: ["bottom"], left: ["left"],
};
const SIZE_PROP: CssPropsTable = {
  w: ["width"], "min-w": ["min-width"], "max-w": ["max-width"],
  h: ["height"], "min-h": ["min-height"], "max-h": ["max-height"],
  size: ["width", "height"],
};

// ---------------------------------------------------------------------------
// Color: bg-/text-/border-/ring-/fill-/stroke-/from-/via-/to- + semantic token.
// Renders to `var(--token)`; `/opacity` → color-mix with transparent.
// Numeric Tailwind palette (red-500) → left to the oracle (DSes use tokens).
// ---------------------------------------------------------------------------
const COLOR_PROP: CssValueTable = {
  bg: "background-color",
  text: "color",
  border: "border-color",
  "border-t": "border-top-color", "border-r": "border-right-color",
  "border-b": "border-bottom-color", "border-l": "border-left-color",
  ring: "--tw-ring-color",
  fill: "fill",
  stroke: "stroke",
  outline: "outline-color",
  decoration: "text-decoration-color",
  caret: "caret-color",
  accent: "accent-color",
  from: "--tw-gradient-from",
  to: "--tw-gradient-to",
  via: "--tw-gradient-via",
};
const SEMANTIC_TOKENS = new Set([
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted",
  "muted-foreground", "accent", "accent-foreground", "destructive", "destructive-foreground",
  "border", "input", "ring", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
  "sidebar", "sidebar-foreground", "sidebar-primary", "sidebar-accent", "sidebar-border",
]);
function colorValue(token: string): string | null {
  // token may carry an opacity suffix: primary/50
  const [name, op] = token.split("/");
  let base: string | null = null;
  if (name === "transparent") base = "transparent";
  else if (name === "current") base = "currentColor";
  else if (name === "white") base = "oklch(1 0 0)";
  else if (name === "black") base = "oklch(0 0 0)";
  else if (SEMANTIC_TOKENS.has(name)) base = `var(--${name})`;
  if (!base) return null;
  if (op && /^\d+$/.test(op)) {
    return `color-mix(in oklab, ${base} ${op}%, transparent)`;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Radius / shadow / typography static-ish maps.
// ---------------------------------------------------------------------------
const RADIUS: CssValueTable = {
  "rounded-none": "0",
  "rounded-sm": "var(--radius-sm, calc(var(--radius) - 4px))",
  "rounded": "0.25rem",
  "rounded-md": "var(--radius-md, calc(var(--radius) - 2px))",
  "rounded-lg": "var(--radius-lg, var(--radius))",
  "rounded-xl": "var(--radius-xl, calc(var(--radius) + 4px))",
  "rounded-2xl": "var(--radius-2xl, 1rem)",
  "rounded-3xl": "var(--radius-3xl, 1.5rem)",
  "rounded-full": "calc(infinity * 1px)",
};
const RADIUS_SIDE: CssPropsTable = {
  t: ["border-top-left-radius", "border-top-right-radius"],
  r: ["border-top-right-radius", "border-bottom-right-radius"],
  b: ["border-bottom-left-radius", "border-bottom-right-radius"],
  l: ["border-top-left-radius", "border-bottom-left-radius"],
  tl: ["border-top-left-radius"], tr: ["border-top-right-radius"],
  br: ["border-bottom-right-radius"], bl: ["border-bottom-left-radius"],
};
const FONT_SIZE: CssValueTable = {
  "text-xs": "font-size:0.75rem;line-height:1rem",
  "text-sm": "font-size:0.875rem;line-height:1.25rem",
  "text-base": "font-size:1rem;line-height:1.5rem",
  "text-lg": "font-size:1.125rem;line-height:1.75rem",
  "text-xl": "font-size:1.25rem;line-height:1.75rem",
  "text-2xl": "font-size:1.5rem;line-height:2rem",
  "text-3xl": "font-size:1.875rem;line-height:2.25rem",
  "text-4xl": "font-size:2.25rem;line-height:2.5rem",
  "text-5xl": "font-size:3rem;line-height:1",
  "text-6xl": "font-size:3.75rem;line-height:1",
};
const FONT_WEIGHT: CssValueTable = {
  "font-thin": "100", "font-extralight": "200", "font-light": "300",
  "font-normal": "400", "font-medium": "500", "font-semibold": "600",
  "font-bold": "700", "font-extrabold": "800", "font-black": "900",
};

// ---------------------------------------------------------------------------
// Static utility map — high-frequency, non-parametric utilities.
// The workflow expands this against the oracle; keep entries alphabetical-ish.
// ---------------------------------------------------------------------------
const STATIC: CssValueTable = {
  // display / box
  block: "display:block", "inline-block": "display:inline-block", inline: "display:inline",
  flex: "display:flex", "inline-flex": "display:inline-flex", grid: "display:grid",
  "inline-grid": "display:inline-grid", hidden: "display:none", contents: "display:contents",
  invisible: "visibility:hidden", visible: "visibility:visible", "sr-only-x": "",
  table: "display:table", "table-cell": "display:table-cell", "table-row": "display:table-row",
  // flex / grid
  "flex-row": "flex-direction:row", "flex-col": "flex-direction:column",
  "flex-row-reverse": "flex-direction:row-reverse", "flex-wrap": "flex-wrap:wrap",
  "flex-nowrap": "flex-wrap:nowrap", "flex-1": "flex:1 1 0%", "flex-auto": "flex:1 1 auto",
  "flex-initial": "flex:0 1 auto", "flex-none": "flex:none", "flex-shrink-0": "flex-shrink:0",
  "shrink-0": "flex-shrink:0", grow: "flex-grow:1", "grow-0": "flex-grow:0",
  "items-center": "align-items:center", "items-start": "align-items:flex-start",
  "items-end": "align-items:flex-end", "items-stretch": "align-items:stretch",
  "items-baseline": "align-items:baseline",
  "justify-center": "justify-content:center", "justify-start": "justify-content:flex-start",
  "justify-end": "justify-content:flex-end", "justify-between": "justify-content:space-between",
  "justify-around": "justify-content:space-around", "justify-evenly": "justify-content:space-evenly",
  "self-center": "align-self:center", "self-start": "align-self:flex-start", "self-end": "align-self:flex-end",
  "self-stretch": "align-self:stretch",
  "content-center": "align-content:center", "place-items-center": "place-items:center",
  "place-content-center": "place-content:center",
  // position
  relative: "position:relative", absolute: "position:absolute", fixed: "position:fixed",
  sticky: "position:sticky", static: "position:static",
  "inset-0": "inset:0", "inset-x-0": "left:0;right:0", "inset-y-0": "top:0;bottom:0",
  // sizing shorthands
  "w-full": "width:100%", "h-full": "height:100%", "w-screen": "width:100vw",
  "h-screen": "height:100vh", "min-h-screen": "min-height:100vh", "w-fit": "width:fit-content",
  "h-fit": "height:fit-content", "w-auto": "width:auto", "h-auto": "height:auto",
  "min-w-0": "min-width:0", "max-w-full": "max-width:100%", "min-h-0": "min-height:0",
  "size-full": "width:100%;height:100%",
  // overflow / misc
  "overflow-hidden": "overflow:hidden", "overflow-auto": "overflow:auto",
  "overflow-x-auto": "overflow-x:auto", "overflow-y-auto": "overflow-y:auto",
  "overflow-visible": "overflow:visible", "overflow-x-hidden": "overflow-x:hidden",
  "overflow-y-hidden": "overflow-y:hidden",
  truncate: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap",
  "whitespace-nowrap": "white-space:nowrap", "whitespace-pre": "white-space:pre",
  "break-words": "overflow-wrap:break-word", "break-all": "word-break:break-all",
  "select-none": "user-select:none", "select-text": "user-select:text",
  "pointer-events-none": "pointer-events:none", "pointer-events-auto": "pointer-events:auto",
  "cursor-pointer": "cursor:pointer", "cursor-default": "cursor:default",
  "cursor-not-allowed": "cursor:not-allowed", "cursor-text": "cursor:text",
  // typography
  "text-left": "text-align:left", "text-center": "text-align:center",
  "text-right": "text-align:right", "text-justify": "text-align:justify",
  italic: "font-style:italic", "not-italic": "font-style:normal",
  underline: "text-decoration-line:underline", "line-through": "text-decoration-line:line-through",
  "no-underline": "text-decoration-line:none", uppercase: "text-transform:uppercase",
  lowercase: "text-transform:lowercase", capitalize: "text-transform:capitalize",
  "normal-case": "text-transform:none",
  "leading-none": "line-height:1", "leading-tight": "line-height:1.25",
  "leading-snug": "line-height:1.375", "leading-normal": "line-height:1.5",
  "leading-relaxed": "line-height:1.625", "leading-loose": "line-height:2",
  "tracking-tighter": "letter-spacing:-0.05em", "tracking-tight": "letter-spacing:-0.025em",
  "tracking-normal": "letter-spacing:0", "tracking-wide": "letter-spacing:0.025em",
  "tracking-wider": "letter-spacing:0.05em", "tracking-widest": "letter-spacing:0.1em",
  "tabular-nums": "font-variant-numeric:tabular-nums",
  "antialiased": "-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale",
  // borders
  border: "border-width:1px", "border-0": "border-width:0", "border-2": "border-width:2px",
  "border-t": "border-top-width:1px", "border-r": "border-right-width:1px",
  "border-b": "border-bottom-width:1px", "border-l": "border-left-width:1px",
  "border-solid": "border-style:solid", "border-dashed": "border-style:dashed",
  "border-none": "border-style:none",
  // effects
  "shadow-none": "box-shadow:none",
  "shadow-xs": "box-shadow:var(--shadow-xs, 0 1px 2px 0 oklch(0 0 0 / 0.05))",
  "shadow-sm": "box-shadow:var(--shadow-sm, 0 1px 3px 0 oklch(0 0 0 / 0.1))",
  shadow: "box-shadow:var(--shadow, 0 1px 3px 0 oklch(0 0 0 / 0.1))",
  "shadow-md": "box-shadow:var(--shadow-md, 0 4px 6px -1px oklch(0 0 0 / 0.1))",
  "shadow-lg": "box-shadow:var(--shadow-lg, 0 10px 15px -3px oklch(0 0 0 / 0.1))",
  "shadow-xl": "box-shadow:var(--shadow-xl, 0 20px 25px -5px oklch(0 0 0 / 0.1))",
  "shadow-2xl": "box-shadow:var(--shadow-2xl, 0 25px 50px -12px oklch(0 0 0 / 0.25))",
  "opacity-0": "opacity:0", "opacity-50": "opacity:0.5", "opacity-100": "opacity:1",
  "ring-0": "box-shadow:0 0 0 0", "outline-none": "outline:2px solid transparent;outline-offset:2px",
  // transitions
  "transition-none": "transition-property:none",
  transition: "transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms",
  "transition-colors": "transition-property:color,background-color,border-color,text-decoration-color,fill,stroke;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms",
  "transition-transform": "transition-property:transform;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms",
  "transition-opacity": "transition-property:opacity;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms",
  "transition-shadow": "transition-property:box-shadow;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms",
  "duration-75": "transition-duration:75ms", "duration-100": "transition-duration:100ms",
  "duration-150": "transition-duration:150ms", "duration-200": "transition-duration:200ms",
  "duration-300": "transition-duration:300ms", "duration-500": "transition-duration:500ms",
  "ease-linear": "transition-timing-function:linear",
  "ease-in": "transition-timing-function:cubic-bezier(0.4,0,1,1)",
  "ease-out": "transition-timing-function:cubic-bezier(0,0,0.2,1)",
  "ease-in-out": "transition-timing-function:cubic-bezier(0.4,0,0.2,1)",
  // z-index
  "z-0": "z-index:0", "z-10": "z-index:10", "z-20": "z-index:20", "z-30": "z-index:30",
  "z-40": "z-index:40", "z-50": "z-index:50", "z-auto": "z-index:auto",
  // transform-origin
  "origin-center": "transform-origin:center", "origin-top": "transform-origin:top",
  "origin-bottom": "transform-origin:bottom", "origin-left": "transform-origin:left",
  "origin-right": "transform-origin:right", "origin-top-left": "transform-origin:top left",
  "origin-top-right": "transform-origin:top right", "origin-bottom-left": "transform-origin:bottom left",
  "origin-bottom-right": "transform-origin:bottom right", "origin-top-center": "transform-origin:top center",
  // table / misc
  "border-collapse": "border-collapse:collapse", "border-separate": "border-collapse:separate",
  "table-auto": "table-layout:auto", "table-fixed": "table-layout:fixed",
  "align-middle": "vertical-align:middle", "align-top": "vertical-align:top",
  "align-bottom": "vertical-align:bottom", "align-baseline": "vertical-align:baseline",
  "list-none": "list-style-type:none", "list-disc": "list-style-type:disc",
  "list-decimal": "list-style-type:decimal", "appearance-none": "appearance:none",
  "resize-none": "resize:none", "isolate": "isolation:isolate",
  "object-cover": "object-fit:cover", "object-contain": "object-fit:contain",
  "object-center": "object-position:center", "aspect-square": "aspect-ratio:1/1",
  "aspect-video": "aspect-ratio:16/9", "aspect-auto": "aspect-ratio:auto",
  "backdrop-blur-sm": "backdrop-filter:blur(4px)", "backdrop-blur": "backdrop-filter:blur(8px)",
  "backdrop-blur-md": "backdrop-filter:blur(12px)", "backdrop-blur-lg": "backdrop-filter:blur(16px)",
  "backdrop-blur-xl": "backdrop-filter:blur(24px)", "backdrop-blur-2xl": "backdrop-filter:blur(40px)",
  "backdrop-blur-3xl": "backdrop-filter:blur(64px)", "backdrop-blur-none": "backdrop-filter:blur(0)",
  "underline-offset-2": "text-underline-offset:2px", "underline-offset-4": "text-underline-offset:4px",
  "rounded-xs": "border-radius:var(--radius-xs, 0.125rem)",
};

// Decode an arbitrary value: underscores → spaces (`\_` literal); reject CSS-breaking chars.
function decodeArbitrary(raw: string): string | null {
  const v = raw.replace(/(?<!\\)_/g, " ").replace(/\\_/g, "_").trim();
  return v && !/[{}<>;]/.test(v) ? v : null;
}

// Arbitrary utility `prefix-[value]` → property, for prefixes that target ONE
// property whatever the value is. Ambiguous prefixes live in ARBITRARY_KINDS
// below. `[prop:value]` is handled separately.
const ARBITRARY_PROP: CssValueTable = {
  w: "width", h: "height", "min-w": "min-width",
  "max-w": "max-width", "min-h": "min-height", "max-h": "max-height",
  p: "padding", px: "padding-inline", py: "padding-block", pt: "padding-top",
  pr: "padding-right", pb: "padding-bottom", pl: "padding-left",
  m: "margin", mx: "margin-inline", my: "margin-block", mt: "margin-top",
  mr: "margin-right", mb: "margin-bottom", ml: "margin-left",
  gap: "gap", rounded: "border-radius",
  top: "top", left: "left", right: "right", bottom: "bottom", inset: "inset",
  "leading": "line-height", "tracking": "letter-spacing", opacity: "opacity",
  z: "z-index", grid: "grid-template-columns",
  "aspect": "aspect-ratio",
  duration: "transition-duration",
  delay: "transition-delay", ease: "transition-timing-function",
};

// Arbitrary utilities that set several properties at once (`size-[18px]`).
const ARBITRARY_PROPS_MULTI: CssPropsTable = {
  size: ["width", "height"],
};

// Utilities whose arbitrary value composes into a Tailwind variable chain rather
// than a single declaration. Without these the DS's authored glass blur, glow
// drop-shadows, press scale, and transition timing were dropped entirely, so the
// kit rendered the shell with none of the system's motion or depth. The emitted
// shape matches the extracted static utilities (`blur-sm`, `ring-2`,
// `transition-colors`) so arbitrary and named values compose the same way. [BD-385]
const FILTER_CHAIN =
  "var(--tw-blur,) var(--tw-brightness,) var(--tw-contrast,) var(--tw-grayscale,) " +
  "var(--tw-hue-rotate,) var(--tw-invert,) var(--tw-saturate,) var(--tw-sepia,) var(--tw-drop-shadow,)";
const BACKDROP_CHAIN =
  "var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) " +
  "var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) " +
  "var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,)";
const RING_BOX_SHADOW =
  "var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), " +
  "var(--tw-ring-shadow), var(--tw-shadow)";
const TRANSITION_TAIL =
  "transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms";

const ARBITRARY_COMPOSED: ComposerTable = {
  blur: (v) => `--tw-blur:blur(${v});filter:${FILTER_CHAIN}`,
  "backdrop-blur": (v) =>
    `--tw-backdrop-blur:blur(${v});-webkit-backdrop-filter:${BACKDROP_CHAIN};backdrop-filter:${BACKDROP_CHAIN}`,
  "drop-shadow": (v) => `--tw-drop-shadow:drop-shadow(${v});filter:${FILTER_CHAIN}`,
  scale: (v) => `--tw-scale-x:${v};--tw-scale-y:${v};--tw-scale-z:${v};scale:var(--tw-scale-x) var(--tw-scale-y)`,
  origin: (v) => `transform-origin:${v}`,
  "underline-offset": (v) => `text-underline-offset:${v}`,
  // Tailwind's `transition-[a,b]` still applies the default duration and easing;
  // emitting only transition-property leaves every transition at 0s.
  transition: (v) => `transition-property:${v};${TRANSITION_TAIL}`,
};

function ringWidthRule(width: string): string {
  return (
    `--tw-ring-shadow:var(--tw-ring-inset,) 0 0 0 calc(${width} + var(--tw-ring-offset-width)) ` +
    `var(--tw-ring-color,currentcolor);box-shadow:${RING_BOX_SHADOW}`
  );
}

// Prefixes whose arbitrary value can mean more than one property. Tailwind picks
// the property from an optional CSS data-type hint (`bg-[image:var(--g)]`), and
// otherwise from the value's own shape. Without this, `border-[color:oklch(…)]`
// compiled to `border-width:color:oklch(…)` and `text-[13px]` to `color:13px`:
// invalid declarations the browser drops, so the design system silently lost its
// authored border colors, gradients, and type scale. Every mapping below was
// checked against the real Tailwind 4.3 compiler. [BD-385]
type ArbitraryKind = "color" | "length" | "image" | "family" | "number" | "position";

// CSS data types Tailwind accepts as a hint, grouped by the property they select.
const HINT_KIND: HintKindTable = {
  color: "color",
  image: "image", url: "image",
  length: "length", "line-width": "length", percentage: "length",
  size: "length", "bg-size": "length",
  "absolute-size": "length", "relative-size": "length",
  "family-name": "family", "generic-name": "family",
  number: "number", integer: "number", ratio: "number", angle: "number",
  position: "position",
};

interface ArbitraryPrefixSpec {
  /** Property Tailwind uses when the value's type cannot be determined (bare `var()`). */
  fallback: string;
  /** Kind that fallback property represents, so `/opacity` still mixes. */
  fallbackKind: ArbitraryKind;
  props: Partial<Record<ArbitraryKind, string>>;
}

const ARBITRARY_KINDS: ArbitrarySpecTable = {
  bg: {
    fallback: "background-color",
    fallbackKind: "color",
    props: {
      color: "background-color", image: "background-image",
      length: "background-size", position: "background-position",
    },
  },
  text: { fallback: "color", fallbackKind: "color", props: { color: "color", length: "font-size" } },
  font: {
    fallback: "font-weight",
    fallbackKind: "number",
    props: { family: "font-family", number: "font-weight", length: "font-size" },
  },
  border: { fallback: "border-color", fallbackKind: "color", props: { color: "border-color", length: "border-width" } },
  "border-x": { fallback: "border-inline-color", fallbackKind: "color", props: { color: "border-inline-color", length: "border-inline-width" } },
  "border-y": { fallback: "border-block-color", fallbackKind: "color", props: { color: "border-block-color", length: "border-block-width" } },
  "border-t": { fallback: "border-top-color", fallbackKind: "color", props: { color: "border-top-color", length: "border-top-width" } },
  "border-r": { fallback: "border-right-color", fallbackKind: "color", props: { color: "border-right-color", length: "border-right-width" } },
  "border-b": { fallback: "border-bottom-color", fallbackKind: "color", props: { color: "border-bottom-color", length: "border-bottom-width" } },
  "border-l": { fallback: "border-left-color", fallbackKind: "color", props: { color: "border-left-color", length: "border-left-width" } },
  divide: { fallback: "border-color", fallbackKind: "color", props: { color: "border-color", length: "border-width" } },
  outline: { fallback: "outline-color", fallbackKind: "color", props: { color: "outline-color", length: "outline-width" } },
  // `--tw-ring-width` is not a real Tailwind variable: it marks the ring-WIDTH
  // branch so the caller can emit the composed ring box-shadow instead of a
  // declaration. `ring-[<color>]` still sets the ring color.
  ring: { fallback: "--tw-ring-color", fallbackKind: "color", props: { color: "--tw-ring-color", length: "--tw-ring-width" } },
  // The kit has no Tailwind shadow-var machinery, so a shadow value goes straight
  // onto box-shadow; only the color hint targets the tint var.
  shadow: { fallback: "box-shadow", fallbackKind: "length", props: { color: "--tw-shadow-color" } },
  stroke: { fallback: "stroke", fallbackKind: "color", props: { color: "stroke", length: "stroke-width", number: "stroke-width" } },
  fill: { fallback: "fill", fallbackKind: "color", props: { color: "fill" } },
  decoration: {
    fallback: "text-decoration-color",
    fallbackKind: "color",
    props: { color: "text-decoration-color", length: "text-decoration-thickness" },
  },
};

const COLOR_FUNCTIONS = /^(?:#[0-9a-f]{3,8}$|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\()/i;
const IMAGE_FUNCTIONS = /^(?:url\(|(?:repeating-)?(?:linear|radial|conic)-gradient\(|image-set\(|cross-fade\()/i;
const LENGTH_VALUE = /^-?(?:\d*\.)?\d+(?:px|rem|em|%|vh|vw|vmin|vmax|svh|lvh|dvh|svw|lvw|dvw|ch|ex|cap|ic|lh|pt|pc|cm|mm|q|in)$/i;
const MATH_VALUE = /^(?:calc|clamp|min|max)\(/i;

/** The CSS data type a bare arbitrary value announces, or null when it is opaque. */
function inferArbitraryKind(value: string): ArbitraryKind | null {
  if (IMAGE_FUNCTIONS.test(value)) return "image";
  if (COLOR_FUNCTIONS.test(value)) return "color";
  if (LENGTH_VALUE.test(value) || MATH_VALUE.test(value)) return "length";
  if (/^-?(?:\d*\.)?\d+$/.test(value)) return "number";
  return null;
}

/**
 * Resolve `prefix-[value]` to the declaration Tailwind emits, honoring an
 * explicit data-type hint first, then the value's shape, then the prefix's own
 * fallback. Returns null for prefixes this module does not treat as ambiguous.
 */
export function resolveArbitraryDeclaration(
  prefix: string,
  rawValue: string,
): { property: string; value: string; kind: ArbitraryKind } | null {
  const spec = ARBITRARY_KINDS[prefix];
  if (!spec) return null;

  const hinted = rawValue.match(/^([a-z][a-z-]*):([\s\S]+)$/i);
  const hintKind = hinted ? HINT_KIND[hinted[1].toLowerCase()] : undefined;
  const value = hintKind ? hinted![2].trim() : rawValue;
  const kind = hintKind ?? inferArbitraryKind(value);
  const property = kind ? spec.props[kind] : undefined;

  return property
    ? { property, value, kind: kind! }
    : { property: spec.fallback, value, kind: spec.fallbackKind };
}

/**
 * Resolve a single BASE utility (no variants) → CSS declarations, or null if
 * unknown. Returns declarations without the selector.
 */
// tailwindcss-animate enter/exit modifiers → the `--tw-enter-*` / `--tw-exit-*`
// vars the animate-in/animate-out keyframes consume. [BD-163]
function animateModifier(base: string): string | null {
  const spin: CssValueTable = {
    "animate-spin": "animation:spin 1s linear infinite",
    "animate-pulse": "animation:pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
    "animate-bounce": "animation:bounce 1s infinite",
    "animate-ping": "animation:ping 1s cubic-bezier(0,0,0.2,1) infinite",
    "animate-accordion-down": "animation:accordion-down 0.2s ease-out",
    "animate-accordion-up": "animation:accordion-up 0.2s ease-out",
    "animate-collapsible-down": "animation:collapsible-down 0.2s ease-out",
    "animate-collapsible-up": "animation:collapsible-up 0.2s ease-out",
    "animate-none": "animation:none",
  };
  if (spin[base]) return spin[base];
  let m = base.match(/^(fade|zoom)-(in|out)-(\d+)$/);
  if (m) {
    const kind = m[2] === "in" ? "enter" : "exit";
    if (m[1] === "fade") return `--tw-${kind}-opacity:${(+m[3] / 100).toString().replace(/^0\./, ".")}`;
    return `--tw-${kind}-scale:${(+m[3] / 100).toString().replace(/^0\./, ".")}`;
  }
  m = base.match(/^slide-(in-from|out-to)-(top|bottom|left|right)-(.+)$/);
  if (m) {
    const kind = m[1] === "in-from" ? "enter" : "exit";
    const axis = m[2] === "top" || m[2] === "bottom" ? "y" : "x";
    const sign = m[2] === "top" || m[2] === "left" ? "-" : "";
    const v = m[3].startsWith("[") ? decodeArbitrary(m[3].slice(1, -1)) : spacing(m[3]);
    if (v) return `--tw-${kind}-translate-${axis}:${sign}${v}`;
  }
  return null;
}

// Tailwind palette color → CSS, with optional /opacity. [BD-163]
function paletteColor(base: string): string | null {
  const m = base.match(/^([a-z]+(?:-[trbl])?)-([a-z]+)-(\d{2,3})(?:\/(\d+))?$/);
  if (!m) return null;
  const prop = COLOR_PROP[m[1]];
  const shade = PALETTE[m[2]]?.[m[3]];
  if (!prop || !shade) return null;
  const val = m[4] ? `color-mix(in oklab, ${shade} ${m[4]}%, transparent)` : shade;
  return `${prop}:${val}`;
}

export function translateBase(base: string): string | null {
  // Verified, real-compiler-checked map first (571 classes the DS components
  // use), then the hand-written portable fallbacks + parametric handlers. [BD-163]
  if (TW_STATIC_EXTRACTED[base]) return TW_STATIC_EXTRACTED[base];
  if (STATIC[base]) return STATIC[base];
  if (KNOWN_EMPTY.has(base)) return "";
  if (FONT_FAMILY[base]) return FONT_FAMILY[base];
  if (FLEX_EXTRA[base]) return FLEX_EXTRA[base];
  // tailwindcss-animate enter/exit modifiers set the vars the keyframes consume.
  const anim = animateModifier(base);
  if (anim) return anim;
  // Palette colors: bg-emerald-500, text-orange-700, border-red-500/50
  const pal = paletteColor(base);
  if (pal) return pal;
  if (FONT_SIZE[base]) return FONT_SIZE[base];
  if (FONT_WEIGHT[base]) return `font-weight:${FONT_WEIGHT[base]}`;
  if (RADIUS[base]) return `border-radius:${RADIUS[base]}`;

  // arbitrary property form: [box-shadow:var(--x)] / [mask-type:luminance]
  const propArb = base.match(/^\[([\w-]+):(.+)\]$/);
  if (propArb) {
    const val = decodeArbitrary(propArb[2]);
    return val ? `${propArb[1]}:${val}` : null;
  }

  // arbitrary radius side: rounded-t-[20px], rounded-l-[10px]
  const rsa = base.match(/^rounded-(t|r|b|l|tl|tr|br|bl)-\[(.+)\]$/);
  if (rsa && RADIUS_SIDE[rsa[1]]) {
    const v = decodeArbitrary(rsa[2]);
    if (v) return RADIUS_SIDE[rsa[1]].map((p) => `${p}:${v}`).join(";");
  }

  // prefix-[value] arbitrary, with optional /opacity for colors
  // (border-[oklch(...)]/30). Falls THROUGH to specialized handlers when the
  // prefix isn't a plain property/color. [BD-163]
  const arb = base.match(/^(-?[a-z][\w-]*)-\[(.+)\](?:\/(\d+))?$/);
  if (arb) {
    const val = decodeArbitrary(arb[2]);
    if (val) {
      const withAlpha = (v: string) =>
        arb[3] ? `color-mix(in oklab, ${v} ${arb[3]}%, transparent)` : v;
      // Ambiguous prefixes resolve their property from the data-type hint or the
      // value's shape, so typed values keep the material they were authored with.
      const resolved = resolveArbitraryDeclaration(arb[1], val);
      if (resolved?.property === "--tw-ring-width") return ringWidthRule(resolved.value);
      if (resolved) {
        const value =
          resolved.kind === "color" ? withAlpha(resolved.value) : resolved.value;
        return `${resolved.property}:${value}`;
      }
      const composed = ARBITRARY_COMPOSED[arb[1]];
      if (composed) return composed(val);
      const multi = ARBITRARY_PROPS_MULTI[arb[1]];
      if (multi) return multi.map((p) => `${p}:${val}`).join(";");
      const prop = ARBITRARY_PROP[arb[1]];
      if (prop) return `${prop}:${val}`;
      const colorProp = COLOR_PROP[arb[1]];
      if (colorProp) return `${colorProp}:${withAlpha(val)}`;
      // Negative arbitrary offsets: `-left-[25px]` → `left: calc(25px * -1)`.
      const negated = arb[1].startsWith("-") ? ARBITRARY_PROP[arb[1].slice(1)] : undefined;
      if (negated) return `${negated}:calc(${val} * -1)`;
    }
  }

  // radius side: rounded-t-lg, rounded-tl-md
  const rside = base.match(/^rounded-(t|r|b|l|tl|tr|br|bl)(?:-(.+))?$/);
  if (rside_ok(rside)) {
    const props = RADIUS_SIDE[rside![1]];
    const key = rside![2] ? `rounded-${rside![2]}` : "rounded";
    const val = RADIUS[key];
    if (val) return props.map((p) => `${p}:${val}`).join(";");
  }

  // color utilities: bg-primary, text-muted-foreground/50, border-border
  const colorMatch = base.match(/^([a-z]+(?:-[trbl])?)-(.+)$/);
  if (colorMatch && COLOR_PROP[colorMatch[1]]) {
    const val = colorValue(colorMatch[2]);
    if (val) return `${COLOR_PROP[colorMatch[1]]}:${val}`;
  }

  // spacing: p-4, px-2, gap-1.5, mt-2, -mt-2
  const sp = base.match(/^(-)?([a-z]+(?:-[xytrbl])?)-(.+)$/);
  if (sp && SPACING_PROP[sp[2]]) {
    const v = spacing(sp[3]);
    if (v) {
      const val = sp[1] ? `-${v}` : v;
      return SPACING_PROP[sp[2]].map((p) => `${p}:${val}`).join(";");
    }
  }

  // sizing: w-4, h-full handled in STATIC; numeric + min/max-content here
  const sz = base.match(/^(w|h|min-w|max-w|min-h|max-h|size)-(.+)$/);
  if (sz && SIZE_PROP[sz[1]]) {
    const v = sz[2] === "max" ? "max-content" : sz[2] === "min" ? "min-content" : sz[2] === "fit" ? "fit-content" : MAX_W_SCALE[sz[2]] ?? spacing(sz[2]);
    if (v) return SIZE_PROP[sz[1]].map((p) => `${p}:${v}`).join(";");
  }

  // translate: translate-x-5, -translate-y-1/2, translate-x-[3px]. Composed via
  // the --tw-translate-* vars (defaults supply the other axis). [BD-163]
  const tr = base.match(/^(-)?translate-([xy])-(.+)$/);
  if (tr) {
    const raw = tr[3].startsWith("[") ? decodeArbitrary(tr[3].slice(1, -1)) : spacing(tr[3]);
    if (raw) {
      const v = `${tr[1] ?? ""}${raw}`;
      return `--tw-translate-${tr[2]}:${v};translate:var(--tw-translate-x) var(--tw-translate-y)`;
    }
  }

  // negative z-index: -z-10
  const nz = base.match(/^-z-(\d+)$/);
  if (nz) return `z-index:-${nz[1]}`;

  // border side width: border-l-2, border-t-0
  const bw = base.match(/^border-([trbl])-(\d+)$/);
  if (bw) {
    const side = { t: "top", r: "right", b: "bottom", l: "left" }[bw[1]];
    return `border-${side}-width:${bw[2]}px`;
  }

  // leading-5 (numeric line-height on the spacing scale)
  const lh = base.match(/^leading-(\d+)$/);
  if (lh) return `line-height:${(+lh[1] * 0.25).toString().replace(/\.?0+$/, "")}rem`;

  // filters: brightness-105, saturate-200, contrast-125, grayscale-0; backdrop-*
  const fil = base.match(/^(backdrop-)?(brightness|saturate|contrast|grayscale|invert|sepia|blur)-(\d+|none)$/);
  if (fil) {
    const prop = fil[1] ? "backdrop-filter" : "filter";
    const fn = fil[2];
    const n = fil[3] === "none" ? (fn === "blur" ? "0" : "100") : fil[3];
    const arg = fn === "blur" ? `${n}px` : ["grayscale", "invert", "sepia"].includes(fn) ? `${+n / 100}` : `${n}%`;
    return `${prop}:${fn}(${arg})`;
  }

  // scroll-margin / scroll-padding: scroll-m-20, scroll-mt-4
  const sm = base.match(/^scroll-(m|mt|mr|mb|ml|p|pt|pr|pb|pl)([xy])?-(.+)$/);
  if (sm) {
    const v = spacing(sm[3]);
    if (v) {
      const kind = sm[1][0] === "m" ? "margin" : "padding";
      const side = { t: "-top", r: "-right", b: "-bottom", l: "-left", x: "-inline", y: "-block" }[sm[1][1] ?? sm[2] ?? ""] ?? "";
      return `scroll-${kind}${side}:${v}`;
    }
  }

  return null;
}

// Named max-width container scale.
const MAX_W_SCALE: CssValueTable = {
  xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem",
  "2xl": "42rem", "3xl": "48rem", "4xl": "56rem", "5xl": "64rem", "6xl": "72rem",
  "7xl": "80rem", prose: "65ch", none: "none",
};

function rside_ok(m: RegExpMatchArray | null): m is RegExpMatchArray {
  return !!m && !!RADIUS_SIDE[m[1]];
}

/**
 * Translate one full Tailwind class (with variants) into a CSS rule. Returns
 * null when the base is unknown OR a variant is unsupported (responsive/dark),
 * so the harness can report it. [BD-163]
 */
export function translateClass(cls: string): TranslatedRule | null {
  if (!cls || cls.startsWith("//")) return null;
  // Split variants from base on `:` but NOT inside [...] (data-[state=open]:).
  const parts = splitVariants(cls);
  const base = parts.pop()!;
  let body = translateBase(base);
  if (body === null) return null;
  if (needsContent(parts, body)) body = `content:"";${body}`;
  let selector = `.${escapeClassName(cls)}`;
  let media: string | undefined;
  for (const v of parts) {
    if (BREAKPOINTS[v]) {
      media = `(min-width:${BREAKPOINTS[v]})`;
      continue;
    }
    const next = applyVariant(selector, v);
    if (!next) return null; // unsupported variant
    selector = next;
  }
  return { selector, body, media };
}

// Split `data-[state=open]:hover:bg-x` → ["data-[state=open]", "hover", "bg-x"].
function splitVariants(cls: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of cls) {
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    if (ch === ":" && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Translate a set of class names → a CSS stylesheet (one rule per class) plus
 * the list of classes that could not be translated (for oracle reconciliation).
 */
export function translateClasses(classes: Iterable<string>) {
  const rules: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  let usesTwVars = false;
  let usesAnimate = false;
  for (const cls of classes) {
    if (seen.has(cls)) continue;
    seen.add(cls);
    const r = translateClass(cls);
    if (r) {
      // Marker classes (group/peer) translate to an empty body — known, but emit
      // no rule.
      if (r.body !== "") {
        const rule = `${r.selector} { ${r.body} }`;
        rules.push(r.media ? `@media ${r.media} { ${rule} }` : rule);
      }
      if (r.body.includes("--tw-")) usesTwVars = true;
      if (/animate-(in|out)|animation:|--tw-(enter|exit)-/.test(r.body)) usesAnimate = true;
    } else unknown.push(cls);
  }
  // Prepend the --tw-* initial values (so ring/transform compositions render
  // without Tailwind preflight) and append the keyframes the animate utilities
  // reference, only when actually used. [BD-163]
  const preamble = usesTwVars ? `${TW_DEFAULTS}\n` : "";
  const suffix = usesAnimate && TW_KEYFRAMES ? `\n${TW_KEYFRAMES}` : "";
  return { css: preamble + rules.join("\n") + suffix, unknown };
}
