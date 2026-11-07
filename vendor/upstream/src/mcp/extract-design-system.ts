// Pure extraction logic for the extract-design-system MCP tool.
//
// The inverse of the rest of the catalog: instead of handing the user one of OUR
// design systems, this reads the CSS the user ALREADY has (their globals.css /
// Tailwind v4 @theme block) and distills it back into a clean, oklch-normalized
// token set so an agent can style new components to match the app they already
// built. The MCP server can't read the caller's filesystem, so the agent pastes
// the CSS text in; this module does the parsing, color normalization, and
// classification. Kept dependency-free and side-effect-free for unit testing.

import { parseCssVars, stripCssComments } from "../registry-css";
import { toOklch } from "./color-to-oklch";
import type { DensityMode } from "../inspection/density";

export type ThemeMode = "light" | "dark" | "dual" | "none";

export type TokenKind = "color" | "radius" | "font" | "shadow" | "other";

export interface ExtractionResult {
  name?: string;
  /** Source labels when the extraction merged more than one input. [BD-491] */
  sources?: string[];
  /** Vendor names mapped into empty semantic slots, as [from, to]. [BD-491] */
  aliased?: Array<[string, string]>;
  themeMode: ThemeMode;
  /** The scheme a one-block site's background paints, when it could be read. [BD-1152] */
  paintedScheme?: "light" | "dark";
  /** Normalized token maps (colors converted to oklch), keyed by var name without `--`. */
  light: Record<string, string>;
  dark: Record<string, string>;
  /** Per-token classification, computed from the light map (or dark when light is empty). */
  kinds: Record<string, TokenKind>;
  tokenCount: number;
  /** The layout density closest to the rendered page's gaps, when a page was measured. [BD-1230] */
  density?: DensityMode;
}

// Canonical shadcn / Tailwind semantic-token order. Recognized tokens are emitted
// first, in this order, so the normalized `:root` reads like a real design system
// rather than parse order. Anything not listed is appended after, grouped by kind.
const SEMANTIC_ORDER = [
  "background", "foreground",
  "card", "card-foreground",
  "popover", "popover-foreground",
  "primary", "primary-foreground",
  "secondary", "secondary-foreground",
  "muted", "muted-foreground",
  "accent", "accent-foreground",
  "destructive", "destructive-foreground",
  "border", "input", "ring",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
  "sidebar", "sidebar-foreground",
  "sidebar-primary", "sidebar-primary-foreground",
  "sidebar-accent", "sidebar-accent-foreground",
  "sidebar-border", "sidebar-ring",
  "radius",
  "font-sans", "font-serif", "font-mono",
];

function classify(name: string, value: string): TokenKind {
  const n = name.toLowerCase();
  if (n.includes("shadow")) return "shadow";
  if (n.includes("font")) return "font";
  if (n.includes("radius")) return "radius";
  if (toOklch(value) !== null) return "color";
  return "other";
}

// Tailwind v4 puts tokens in `@theme { ... }` (and `@theme inline { ... }`)
// instead of `:root`. parseCssVars only knows `:root` / `.dark`, so pull the
// @theme declarations out separately and fold them into the base (light) layer.
/** The declarations of every `@theme` block in comment-free CSS, merged in order. */
export function extractThemeBlock(stripped: string) {
  const out: Record<string, string> = {};
  // @theme holds flat declarations only (no nested rules), so a block runs
  // from the first `{` after `@theme` to the first `}` after that, as
  // `/@theme[^{]*\{([^}]*)\}/g` matched. indexOf finds both, and the loop
  // stops once either is missing, so a sheet of `@theme` with no brace stays
  // linear where the regex rescanned it from every occurrence. [BD-994]
  let from = 0;
  for (;;) {
    const at = stripped.indexOf("@theme", from);
    if (at === -1) break;
    const open = stripped.indexOf("{", at + "@theme".length);
    if (open === -1) break;
    const close = stripped.indexOf("}", open + 1);
    if (close === -1) break;
    Object.assign(out, declarations(stripped.slice(open + 1, close)));
    from = close + 1;
  }
  return out;
}

// Tailwind v4 exposes semantic COLORS as `--color-<name>` in `@theme` (e.g.
// `--color-primary` powers `bg-primary`), so strip that one namespace to line up
// with the `:root` form (`--primary`). Other token families keep their canonical
// names verbatim: `--font-sans`, `--radius`, `--radius-lg`, `--shadow-md` are
// already the names `:root` and Tailwind use, so stripping their prefix would
// mangle them (`--font-sans` -> `sans`).
function denamespace(name: string): string {
  return name.replace(/^color-/, "");
}

function normalizeMap(raw: Record<string, string>) {
  const tokens: Record<string, string> = {};
  const kinds: Record<string, TokenKind> = {};
  for (const [rawName, value] of Object.entries(raw)) {
    const kind = classify(rawName, value);
    const normalizedValue = kind === "color" ? (toOklch(value) ?? value) : value;
    tokens[rawName] = normalizedValue;
    kinds[rawName] = kind;
  }
  return { tokens, kinds };
}

// The lookbehind lets only the first dash of a run start a name, so a hostile
// run of dashes cannot make the match quadratic. `;?` tolerates a last
// declaration with no semicolon, and `[^;}]` stops a value at the closing brace.
const DECLARATION = /(?<![\w-])--([\w-]+)\s*:\s*([^;}]+);?/g;

function declarations(body: string) {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(DECLARATION)) out[m[1]] = m[2].replace(/\s+/g, " ").trim();
  return out;
}

// Shopify's Dawn themes scope the palette to color-scheme classes, sometimes in
// a selector list with :root (`:root, .color-scheme-1 { ... }`), which the
// plain `:root {` match never sees. The first scheme block is the store's
// default scheme. [BD-498]
const SCHEME_SELECTOR = /(^|,)\s*\.color-(scheme|background)-[\w-]+\s*(,|$)/;

function schemeVars(stripped: string) {
  // A split on "}" and two lastIndexOf calls per rule keep this linear. A
  // regex over the whole sheet would go quadratic on a hostile page's long
  // brace-free run, and extract-from-url reads any site's CSS.
  for (const chunk of stripped.split("}")) {
    const open = chunk.lastIndexOf("{");
    if (open === -1) continue;
    const selector = chunk.slice(chunk.lastIndexOf("{", open - 1) + 1, open).trim();
    if (!SCHEME_SELECTOR.test(selector)) continue;
    const found = declarations(chunk.slice(open + 1));
    if (Object.keys(found).length > 0) return found;
  }
  return {};
}

const UNIT_ONLY = /^(px|r?em|%|vh|vw|vmin|vmax|ch|ex|s|ms|deg|fr)$/i;
const JAMMED = /\s+(?=--[\w-]+\s*:)/;

// Minified sheets can run two declarations into one value
// (`fadeIn var(--x) --easter-egg: none`), and an empty Liquid value leaves a
// bare unit (`px`). Split the first and drop the second. [BD-498]
function cleanTokens(raw: Record<string, string>) {
  const out: Record<string, string> = {};
  const keep = (name: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed && !UNIT_ONLY.test(trimmed) && out[name] === undefined) out[name] = trimmed;
  };
  for (const [name, value] of Object.entries(raw)) {
    const [first, ...rest] = value.split(JAMMED);
    keep(name, first);
    for (const piece of rest) {
      const match = /^--([\w-]+)\s*:\s*(.*)$/.exec(piece);
      if (match && raw[match[1]] === undefined) keep(match[1], match[2]);
    }
  }
  return out;
}

/**
 * Raw CSS custom properties from :root / .dark / @theme, pre-normalization.
 * Exported for brand-sources, whose non-CSS adapters produce maps of the same
 * shape so every source funnels through one build step. [BD-491]
 */
export function collectCssVars(css: string) {
  const { light: rootLight, dark: rootDark } = parseCssVars(css);
  // Strip comments once, so a stray `@theme` or scheme selector inside a
  // `/* ... */` comment cannot match and swallow the next rule's body.
  const stripped = stripCssComments(css);
  const themeVars = extractThemeBlock(stripped);

  // Fold @theme into the base layer, de-namespacing so `--color-primary` merges
  // with a `:root` `--primary`. Existing :root values win (they are the resolved
  // theme); @theme fills gaps.
  const mergedLight: Record<string, string> = {};
  for (const [k, v] of Object.entries(themeVars)) {
    mergedLight[denamespace(k)] = v;
  }
  // A scheme block fills gaps only: a plain :root value is the resolved theme.
  Object.assign(mergedLight, schemeVars(stripped), rootLight);
  return { light: cleanTokens(mergedLight), dark: cleanTokens(rootDark) };
}

// The page background, under the names sites give it: `--background`, `--bg`,
// or one of these prefixes, such as Arcade's `--initial--background`. A section
// colour such as `--footer-background` never decides the scheme.
const BACKGROUND_KEY = /^(?:(?:initial|color|page|body|base|main|site|theme|surface)-+)?(?:background|bg)$/;

/** Follows `var(--x)` references through one token map, a few hops at most. */
function resolveVar(tokens: Record<string, string>, value: string): string {
  let current = value;
  for (let hop = 0; hop < 5; hop++) {
    const ref = /^var\(--([\w-]+)/.exec(current.trim());
    // Own keys only: a page's `var(--constructor)` must not reach Object.prototype.
    if (!ref || !Object.hasOwn(tokens, ref[1])) return current;
    current = tokens[ref[1]];
  }
  return current;
}

/** Lightness from 0 to 1 of an `oklch()` value or bare shadcn HSL channels (`0 0% 3.9%`), or undefined. */
function lightnessOf(value: string): number | undefined {
  const oklch = /oklch\(\s*([\d.]+)(%?)/.exec(value);
  if (oklch) return Number(oklch[1]) / (oklch[2] ? 100 : 1);
  const hsl = /^\s*[\d.]+(?:deg)?\s+[\d.]+%\s+([\d.]+)%\s*$/.exec(value);
  return hsl ? Number(hsl[1]) / 100 : undefined;
}

/**
 * Which scheme a site with one token block paints, or undefined when its
 * background cannot be read. Many dark sites keep their only tokens in `:root`,
 * so the block alone says nothing: the background's lightness decides. An agent
 * told a black site was light built it light and lost the brand. [BD-1152]
 */
export function baseScheme(tokens: Record<string, string>): "light" | "dark" | undefined {
  const key = Object.keys(tokens).find((k) => BACKGROUND_KEY.test(k));
  if (!key) return undefined;
  const lightness = lightnessOf(resolveVar(tokens, tokens[key]));
  if (lightness === undefined) return undefined;
  return lightness < 0.5 ? "dark" : "light";
}

/**
 * Turns a raw light and dark token map into the finished extraction: normalized
 * values, theme mode, aliases, and the token count callers report. Shared by
 * every entry point so pasted CSS and a live site read produce the same shape.
 */
export function buildExtractionResult(
  raw: { light: Record<string, string>; dark: Record<string, string> },
  name?: string,
): ExtractionResult {
  const light = normalizeMap(raw.light);
  const dark = normalizeMap(raw.dark);

  const hasLight = Object.keys(light.tokens).length > 0;
  const hasDark = Object.keys(dark.tokens).length > 0;
  const painted = hasLight && !hasDark ? baseScheme(light.tokens) : undefined;
  const themeMode: ThemeMode = hasLight && hasDark ? "dual" : hasDark ? "dark" : hasLight ? (painted ?? "light") : "none";

  const primaryKinds = hasLight ? light.kinds : dark.kinds;

  return {
    name,
    themeMode,
    ...(painted && { paintedScheme: painted }),
    light: light.tokens,
    dark: dark.tokens,
    kinds: primaryKinds,
    tokenCount: new Set([...Object.keys(light.tokens), ...Object.keys(dark.tokens)]).size,
  };
}

/**
 * The deliberate single-CSS public entry, kept for library callers. Note the
 * MCP tool no longer uses it: the tool routes every input, pasted CSS
 * included, through brand-sources' extractFromSources, which additionally
 * applies vendor-name aliases and reports sources/aliased. [BD-491]
 */
export function extractDesignSystem(css: string, name?: string): ExtractionResult {
  return buildExtractionResult(collectCssVars(css), name);
}

function orderedEntries(tokens: Record<string, string>): [string, string][] {
  const names = Object.keys(tokens);
  const rank = (n: string) => {
    const i = SEMANTIC_ORDER.indexOf(n);
    return i === -1 ? SEMANTIC_ORDER.length : i;
  };
  // SAFETY: the two-element literal is the tuple the chart math consumes.
  return names
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((n) => [n, tokens[n]] as [string, string]);
}

function renderBlock(selector: string, tokens: Record<string, string>): string {
  const lines = orderedEntries(tokens).map(([n, v]) => `  --${n}: ${v};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

/**
 * Just the token sheet: the `:root` and `.dark` blocks, no prose around them.
 * This is the `brandCss` shape POST /api/projects accepts, so a caller that
 * builds from an extraction does not have to cut a fenced block back out of
 * the markdown formatExtraction returns. [BD-513]
 */
export function toBrandSheet(result: ExtractionResult): string {
  return sheetBlocks(result).join("\n\n");
}

/**
 * Records the density measured on the rendered page. It joins the `:root`
 * block as `--layout-density`, so create-design-system keeps it when the sheet
 * comes back as `brandCss`. [BD-1230]
 */
export function withLayoutDensity(result: ExtractionResult, density: DensityMode): ExtractionResult {
  return { ...result, density };
}

/**
 * The `:root` and `.dark` blocks. The density joins the first block written,
 * outside the token maps, so a dark-only brand stays dark-only.
 */
function sheetBlocks(result: ExtractionResult): string[] {
  const density: Record<string, string> = result.density ? { "layout-density": result.density } : {};
  const hasLight = Object.keys(result.light).length > 0;
  const blocks: string[] = [];
  if (hasLight) blocks.push(renderBlock(":root", { ...result.light, ...density }));
  if (Object.keys(result.dark).length > 0) {
    blocks.push(renderBlock(".dark", hasLight ? result.dark : { ...result.dark, ...density }));
  }
  return blocks;
}

/** The named fields an extraction returns as structuredContent, for callers such as a Zap step that read fields, not prose. [BD-1142] */
export type ExtractionSummary = {
  name?: string;
  themeMode: ThemeMode;
  /** The scheme a one-block site's background paints, when it could be read. [BD-1152] */
  paintedScheme?: "light" | "dark";
  tokenCount: number;
  /** The `:root` and `.dark` blocks, the same sheet `toBrandSheet` returns. */
  tokensCss: string;
  primary?: string;
  background?: string;
  foreground?: string;
  fontSans?: string;
  radius?: string;
  density?: DensityMode;
  /** "flat" when the brand sets no shadow, gradient or inset anywhere, so it carries colour and type but no material. [BD-1309] */
  material?: BrandMaterial;
};

/** Whether a brand's tokens carry material (shadow, gradient, inset) or only flat fills. */
export type BrandMaterial = "flat" | "rich";

const ZERO_SHADOW = /^0(?:px|rem)?(?:\s+0(?:px|rem)?)*$/;

/**
 * Reads a token sheet for material. A brand is rich when any token sets a real
 * shadow or a gradient; otherwise its buttons and cards are flat fills, and a
 * build should take its components' material from a catalog system while
 * keeping the brand's colour, font and radius. [BD-1309]
 */
export function brandMaterial(tokensCss: string): BrandMaterial {
  for (const match of tokensCss.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1].toLowerCase();
    const value = match[2].trim().toLowerCase();
    if (value.includes("gradient(")) return "rich";
    const shadowToken = /shadow|elevation/.test(name);
    if (shadowToken && value !== "none" && !ZERO_SHADOW.test(value) && !value.startsWith("var(")) return "rich";
  }
  return "flat";
}

/** Picks the tokens a non-developer reads first, plus the whole sheet. [BD-1142] */
export function summarizeExtraction(result: ExtractionResult): ExtractionSummary {
  const base = Object.keys(result.light).length > 0 ? result.light : result.dark;
  const summary: ExtractionSummary = {
    themeMode: result.themeMode,
    tokenCount: result.tokenCount,
    tokensCss: toBrandSheet(result),
  };
  summary.material = brandMaterial(summary.tokensCss);
  if (result.name) summary.name = result.name;
  if (result.paintedScheme) summary.paintedScheme = result.paintedScheme;
  if (result.density) summary.density = result.density;
  const picks = [
    ["primary", "primary"],
    ["background", "background"],
    ["foreground", "foreground"],
    ["fontSans", "font-sans"],
    ["radius", "radius"],
  ] as const;
  for (const [field, token] of picks) {
    if (base[token]) summary[field] = base[token];
  }
  return summary;
}

// Human-readable summary + a pasteable, oklch-normalized token sheet. This text
// is what the tool returns to the agent.
export function formatExtraction(result: ExtractionResult): string {
  if (result.themeMode === "none") {
    return [
      "# No design tokens found",
      "",
      "Could not find any CSS custom properties (`--name: value;`) in a `:root`, `.dark`, or `@theme` block.",
      "Paste the contents of the project's `globals.css` (or wherever the design tokens live) as the `css` argument.",
    ].join("\n");
  }

  const base = Object.keys(result.light).length > 0 ? result.light : result.dark;
  const pick = (n: string) => base[n];
  const swatch = (label: string, n: string) => {
    const v = pick(n);
    return v ? `- **${label}** (\`--${n}\`): \`${v}\`` : null;
  };

  const palette = [
    swatch("Primary", "primary"),
    swatch("Background", "background"),
    swatch("Foreground", "foreground"),
    swatch("Accent", "accent"),
    swatch("Secondary", "secondary"),
    swatch("Border", "border"),
    swatch("Ring", "ring"),
    swatch("Destructive", "destructive"),
  ].filter(Boolean);

  const radius = pick("radius");
  const fontSans = pick("font-sans");
  const fontMono = pick("font-mono");
  const shadowCount = Object.values(result.kinds).filter((k) => k === "shadow").length;

  /** The values `modeLabel` maps its keys onto. */
  interface ModelabelTable {
    [key: string]: string;
  }

  const modeLabel: ModelabelTable = {
    light: "single light theme",
    dark: "single dark theme",
    dual: "light + dark themes",
    none: "none",
  } satisfies Record<ThemeMode, string>;

  const meta = [
    result.name ? `**Source:** ${result.name}` : null,
    result.sources && result.sources.length > 1 ? `**Merged from:** ${result.sources.join(", ")}` : null,
    result.aliased && result.aliased.length
      ? `**Vendor names mapped:** ${result.aliased.map(([f, t]) => `--${f} → --${t}`).join(", ")}`
      : null,
    `**Theme:** ${modeLabel[result.themeMode]}`,
    `**Tokens extracted:** ${result.tokenCount}`,
    `**Colors normalized to oklch.**`,
  ].filter(Boolean);

  const blocks = sheetBlocks(result);

  const details: string[] = [];
  if (radius) details.push(`- **Radius:** \`${radius}\``);
  if (fontSans) details.push(`- **Font (sans):** \`${fontSans}\``);
  if (fontMono) details.push(`- **Font (mono):** \`${fontMono}\``);
  if (result.density) details.push(`- **Layout density:** ${result.density}, the closest mode to the rendered page's gaps`);
  if (shadowCount > 0) details.push(`- **Shadow scale:** ${shadowCount} token${shadowCount === 1 ? "" : "s"}`);

  const sections: string[] = [
    `# Extracted design system${result.name ? `: ${result.name}` : ""}`,
    meta.join("  \n"),
    "## Palette\n" + (palette.length
      ? palette.join("\n")
      : "_No semantic color tokens recognized; see the full token sheet below._"),
  ];
  if (details.length) {
    sections.push("## Type, radius & depth\n" + details.join("\n"));
  }
  sections.push(
    "## Token sheet (oklch-normalized, paste into globals.css)\n\n```css\n" +
      blocks.join("\n\n") +
      "\n```",
    "## How to use\n" +
      "- Style new components against these tokens (`bg-background`, `text-foreground`, `bg-primary`, `border-border`, `ring-ring`) so they match the existing app.\n" +
      "- To turn this into a full Better Design system, pass the token sheet above (the fenced css block, verbatim) to `create-design-system` as `brandCss`. Generation then builds FROM this brand instead of a catalog look-alike.",
  );
  return sections.join("\n\n");
}
