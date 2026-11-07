// Serializes a design system's token sheet to the W3C Design Tokens Community
// Group format (DTCG), the interchange format every token tool reads: Style
// Dictionary, Tokens Studio, Terrazzo, and the Figma plugins that write
// variables. We already READ this format (brand-sources.ts) but could only
// emit React, HTML and Shopify, so a Better Design system could not be pushed
// back into a design tool. [BD-517]
//
// The input is the same `tokensCss` string the other targets consume, so this
// adds an output format and changes no upstream behavior.

import { oklchToHex, parseOklch, toOklch } from "./color-to-oklch";
import { isObjectLike } from "../guards";

/**
 * Marks the group that holds a mode's values, so a reader finds it by this
 * mark and not by its name.
 *
 * `dark` is an ordinary token namespace as well as our name for the dark mode:
 * a system with a `--dark-surface` token owns `dark` first, and the mode group
 * moves aside. Vendor keys under `$extensions` are what the format provides
 * for exactly this.
 */
export const MODE_EXTENSION = "com.better-design.mode";

/** A length, in one of the two units DTCG allows. */
export interface DtcgDimensionValue {
  value: number;
  unit: "px" | "rem";
}

/** A time, in one of the two units DTCG allows. */
export interface DtcgDurationValue {
  value: number;
  unit: "ms" | "s";
}

/** A timing curve's two control points, x1, y1, x2, y2. Both x lie in 0..1. */
export type DtcgCubicBezierValue = [number, number, number, number];

/** A color as DTCG carries it: a space, its channels, and optional alpha. */
export interface DtcgColorValue {
  colorSpace: "oklch";
  /** Lightness 0..1, chroma, hue 0..360. */
  components: [number, number, number];
  /** Omitted when the color is opaque, which DTCG reads as 1. */
  alpha?: number;
  /** The 6-digit fallback, for a tool that cannot resolve oklch itself. */
  hex: string;
}

/** One shadow layer. DTCG wants the parts, not the CSS shorthand. */
export interface DtcgShadowValue {
  color: DtcgColorValue;
  offsetX: DtcgDimensionValue;
  offsetY: DtcgDimensionValue;
  blur: DtcgDimensionValue;
  spread: DtcgDimensionValue;
  inset?: boolean;
}

/** Every shape a `$value` can take across the types we emit. */
export type DtcgValue =
  | string
  | string[]
  | number
  | DtcgDimensionValue
  | DtcgDurationValue
  | DtcgCubicBezierValue
  | DtcgColorValue
  | DtcgShadowValue
  | DtcgShadowValue[];

/** The DTCG types we emit. */
export type DtcgTypeName =
  | "color"
  | "dimension"
  | "fontFamily"
  | "fontWeight"
  | "shadow"
  | "duration"
  | "cubicBezier"
  | "number";

/**
 * A leaf: one design token, with the DTCG `$`-prefixed keys.
 *
 * `$type` is absent when the value does not fit any DTCG type, a `calc()`
 * radius or a `1px solid` border shorthand. An untyped token is legal and a
 * validating consumer passes over it; a token typed `dimension` holding
 * `calc(...)` is rejected, or silently dropped, along with the file around it.
 */
export interface DtcgToken {
  $type?: DtcgTypeName;
  $value: DtcgValue;
  $description?: string;
}

/** A DTCG group is a nested map; leaves are tokens. */
export interface DtcgGroup {
  [key: string]: DtcgGroup | DtcgToken | string | Record<string, string> | undefined;
  $description?: string;
  /** Vendor keys the format reserves for data it does not define, such as [[MODE_EXTENSION]]. */
  $extensions?: Record<string, string>;
}

/** The whole token file: the root group, plus the format's schema marker. */
export interface DtcgDocument extends DtcgGroup {
  $schema?: string;
}

/**
 * The token's candidate DTCG type, from its value and name.
 *
 * Name first for the two cases a value cannot settle: `--radius: 0` is a
 * dimension, not a number, and a bare `600` under a `font-weight` name is a
 * fontWeight. Everything else is decided by the value, so an unfamiliar name
 * still lands in the right type. A value nothing recognizes gets no type at
 * all rather than the nearest guess.
 *
 * Size beats font, or `--font-size` reads as a font family and `16px` ships as
 * the name of a typeface.
 */
export function dtcgType(name: string, value: string): DtcgTypeName | undefined {
  const n = name.toLowerCase();
  // A `--shadow-color` is a color, not a shadow, and the value settles it.
  if (n.includes("shadow")) return toOklch(value) !== null ? "color" : "shadow";
  if (n.includes("font-weight") || n.includes("weight")) return "fontWeight";
  if (n.includes("radius") || n.includes("spacing") || n.includes("size")) return "dimension";
  if (n.includes("font") || n.includes("family")) return "fontFamily";
  if (n.includes("duration") || n.includes("delay")) return "duration";
  if (/^cubic-bezier\(/i.test(value.trim())) return "cubicBezier";
  if (toOklch(value) !== null) return "color";
  if (/^-?[\d.]+(px|rem|em|%|vh|vw|ch)$/.test(value.trim())) return "dimension";
  if (/^-?[\d.]+m?s$/.test(value.trim())) return "duration";
  if (/^-?[\d.]+$/.test(value.trim())) return "number";
  return undefined;
}

const ZERO_PX: DtcgDimensionValue = { value: 0, unit: "px" };

/**
 * A DTCG dimension, or null when the length is not one.
 *
 * Only px and rem exist in the format. An em, a percentage or a `calc()` has
 * no DTCG dimension to become, so it stays untyped instead of being labelled
 * one. A unitless number is px, which is how `--radius: 0` reads.
 */
function toDimension(value: string): DtcgDimensionValue | null {
  const m = /^(-?[\d.]+)(px|rem)?$/i.exec(value.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  // SAFETY: the regex alternatives admit only these values.
  return { value: n, unit: (m[2]?.toLowerCase() as "px" | "rem" | undefined) ?? "px" };
}

/** A DTCG duration, or null. A unitless number under a duration name is ms. */
function toDuration(value: string): DtcgDurationValue | null {
  const m = /^(-?[\d.]+)(ms|s)?$/i.exec(value.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  // SAFETY: the regex alternatives admit only these values.
  return { value: n, unit: (m[2]?.toLowerCase() as "ms" | "s" | undefined) ?? "ms" };
}

/**
 * A DTCG cubicBezier, or null. The format allows a y outside 0..1, which is an
 * overshoot, but never an x, because time cannot run backwards.
 */
function toCubicBezier(value: string): DtcgCubicBezierValue | null {
  const m = /^cubic-bezier\(([^)]*)\)$/i.exec(value.trim());
  if (!m) return null;
  // An empty slot is no number, though Number("") would read it as 0.
  const points = m[1].split(",").map((part) => (part.trim() === "" ? Number.NaN : Number(part)));
  if (points.length !== 4 || !points.every(Number.isFinite)) return null;
  const [x1, y1, x2, y2] = points;
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return null;
  return [x1, y1, x2, y2];
}

/**
 * A DTCG color, or null.
 *
 * Values normalize to oklch, matching the repo's color rule and what our own
 * token sheets already carry. The relative form, `oklch(from var(--primary)
 * ...)`, needs a browser to resolve, so it keeps its string and loses its type.
 */
function toColor(value: string): DtcgColorValue | null {
  const oklch = toOklch(value);
  if (oklch === null) return null;
  const channels = parseOklch(oklch);
  if (channels === null) return null;
  const color: DtcgColorValue = {
    colorSpace: "oklch",
    components: [channels.l, channels.c, channels.h],
    hex: oklchToHex(channels),
  };
  if (channels.alpha < 1) color.alpha = channels.alpha;
  return color;
}

/** Splits on a separator that sits outside every bracket, so `oklch(0 0 0 / .1)` survives. */
function splitOutsideParens(value: string, separator: "," | " "): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    const isBreak = depth === 0 && (separator === "," ? char === "," : /\s/.test(char));
    if (isBreak) {
      if (current.trim()) out.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** One `0 1px 2px oklch(...)` layer as DTCG parts, or null if it is not one. */
function toShadowLayer(layer: string): DtcgShadowValue | null {
  const lengths: DtcgDimensionValue[] = [];
  let color: DtcgColorValue | null = null;
  let inset = false;

  for (const part of splitOutsideParens(layer, " ")) {
    if (part.toLowerCase() === "inset") {
      inset = true;
      continue;
    }
    const length = toDimension(part);
    if (length) {
      lengths.push(length);
      continue;
    }
    const parsed = toColor(part);
    if (parsed && !color) {
      color = parsed;
      continue;
    }
    // A var(), a keyword, a second color: the layer is not one this can state
    // in DTCG parts, so the whole shadow keeps its CSS string untyped.
    return null;
  }

  if (!color || lengths.length < 2 || lengths.length > 4) return null;
  const [offsetX, offsetY, blur = ZERO_PX, spread = ZERO_PX] = lengths;
  const shadow: DtcgShadowValue = { color, offsetX, offsetY, blur, spread };
  if (inset) shadow.inset = true;
  return shadow;
}

/** A shadow stack as DTCG: one layer is an object, several are an array. */
function toShadow(value: string): DtcgShadowValue | DtcgShadowValue[] | null {
  const layers = splitOutsideParens(value, ",").map(toShadowLayer);
  if (layers.length === 0 || layers.some((layer) => layer === null)) return null;
  // SAFETY: the JSON contract of this payload; the producing side owns the shape.
  const parsed = layers as DtcgShadowValue[];
  return parsed.length === 1 ? parsed[0] : parsed;
}

/**
 * The DTCG value for a token of this type, or null when the CSS cannot become
 * one. Returning null is what keeps a wrong type off the token: the caller
 * emits the raw string with no `$type` instead.
 */
function typedValue(type: DtcgTypeName, value: string): DtcgValue | null {
  const v = value.trim();
  switch (type) {
    case "color":
      return toColor(v);
    case "dimension":
      return toDimension(v);
    case "duration":
      return toDuration(v);
    case "cubicBezier":
      return toCubicBezier(v);
    case "shadow":
      return toShadow(v);
    case "fontFamily":
      // A length is never a typeface, whatever the name suggested.
      if (toDimension(v) !== null) return null;
      // A font stack becomes an array, which is the DTCG shape and what
      // importers expect. A single family stays a string.
      return v.includes(",")
        ? splitOutsideParens(v, ",").map((part) => part.replace(/^["']|["']$/g, ""))
        : v.replace(/^["']|["']$/g, "");
    case "fontWeight":
    case "number": {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
  }
}

/** The token for one `--name: value` declaration, typed only where it fits. */
export function dtcgToken(name: string, value: string): DtcgToken {
  const type = dtcgType(name, value);
  const typed = type ? typedValue(type, value) : null;
  return typed === null ? { $value: value.trim() } : { $type: type, $value: typed };
}

/**
 * Groups a flat token name into a DTCG tree.
 *
 * `--color-button-text` becomes color.button.text. Figma renders a group as a
 * variable collection folder, so this is what stops an import landing as one
 * flat pile of variables. A single-segment name stays at the root rather than
 * being forced under a synthetic group.
 */
function groupPath(name: string): string[] {
  return name.replace(/^--/, "").split("-").filter(Boolean);
}

/** Reads `--name: value;` pairs out of one CSS block. */
function declarations(block: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.push([m[1], m[2].trim()]);
  }
  return out;
}

/**
 * Splits a token sheet into its light and dark blocks.
 *
 * Both `.dark` and a `prefers-color-scheme` block are treated as dark, because
 * our generated systems use one or the other and a consumer only cares which
 * mode a value belongs to.
 */
export function splitModes(css: string) {
  const dark: Array<[string, string]> = [];
  let light: Array<[string, string]> = [];

  const darkBlocks = [
    ...css.matchAll(/\.dark\s*\{([^}]*)\}/g),
    ...css.matchAll(/@media[^{]*prefers-color-scheme:\s*dark[^{]*\{\s*:root[^{]*\{([^}]*)\}/g),
    ...css.matchAll(/:root\[data-theme=["']dark["']\]\s*\{([^}]*)\}/g),
  ];
  for (const block of darkBlocks) dark.push(...declarations(block[1]));

  // Everything not inside a dark block is the light mode. Strip the dark
  // blocks first so their declarations are not counted twice.
  let remaining = css;
  for (const block of darkBlocks) remaining = remaining.replace(block[0], "");
  for (const root of remaining.matchAll(/:root[^{]*\{([^}]*)\}/g)) {
    light.push(...declarations(root[1]));
  }
  // A sheet with no :root at all still has tokens worth exporting.
  if (light.length === 0) light = declarations(remaining);

  return { light, dark };
}

/**
 * A name can be both a leaf and a group: `--card` is a color and
 * `--card-foreground` makes `card` a parent. Nesting the leaf under DEFAULT
 * keeps both, which is the Style Dictionary and Tailwind convention for this
 * exact collision. Writing the group over the leaf instead silently loses a
 * color, which is what the first version of this did to `--card`.
 */
const LEAF_KEY = "DEFAULT";

/**
 * Every group is prototype-less.
 *
 * A token named `--__proto__` or `--constructor` walks this tree by name, so a
 * group that inherits from Object.prototype would hand the writer the shared
 * prototype to write onto, and one odd token name in one design system would
 * poison every object in the MCP process. With no prototype there is nothing
 * to reach: the name becomes an ordinary key and the token survives.
 */
function newGroup(init?: DtcgGroup): DtcgGroup {
  // SAFETY: the null-prototype object starts empty and is filled with the
  // group's members here.
  return Object.assign(Object.create(null) as DtcgGroup, init);
}

function isToken(node: DtcgGroup | DtcgToken | string | undefined): node is DtcgToken {
  return typeof node === "object" && node !== null && "$value" in node;
}

function insert(tree: DtcgGroup, path: string[], token: DtcgToken): void {
  let node = tree;
  for (const segment of path.slice(0, -1)) {
    const next = node[segment];
    if (isToken(next)) {
      // A leaf already holds this name. Demote it so the group can exist.
      const promoted = newGroup({ [LEAF_KEY]: next });
      node[segment] = promoted;
      node = promoted;
    } else if (!isObjectLike(next)) {
      const created = newGroup();
      node[segment] = created;
      node = created;
    } else {
      node = next;
    }
  }
  const last = path[path.length - 1];
  const existing = node[last];
  if (isObjectLike(existing) && !isToken(existing)) {
    // The group came first; park the leaf inside it rather than overwrite.
    existing[LEAF_KEY] = token;
    return;
  }
  node[last] = token;
}

/**
 * Builds the DTCG document for a token sheet.
 *
 * Dark values go under a top-level `dark` group rather than a second file,
 * because a single document is what an importer reads in one call, and the
 * group maps to a Figma mode.
 */
export function tokensCssToDtcg(css: string, name?: string): DtcgDocument {
  const { light, dark } = splitModes(css);
  // SAFETY: the document root is a group; the $schema field is the only
  // addition to the group contract.
  const doc = newGroup({
    $schema: "https://tr.designtokens.org/format/",
  }) as DtcgDocument;
  if (name) doc.$description = `${name} design tokens, exported from Better Design.`;

  for (const [rawName, value] of light) {
    insert(doc, groupPath(rawName), dtcgToken(rawName, value));
  }

  if (dark.length > 0) {
    // A light token can own `dark` already, and then it keeps it: the mode
    // group takes the next free key and is found by its mark, not its name.
    let key = "dark";
    for (let n = 0; doc[key] !== undefined; n += 1) key = n === 0 ? "dark-mode" : `dark-mode-${n + 1}`;
    for (const [rawName, value] of dark) {
      insert(doc, [key, ...groupPath(rawName)], dtcgToken(rawName, value));
    }
    const darkGroup = doc[key];
    if (isObjectLike(darkGroup) && !isToken(darkGroup)) {
      darkGroup.$description = "Dark mode values.";
      darkGroup.$extensions = { [MODE_EXTENSION]: "dark" };
    }
  }

  return doc;
}

/** The document as the JSON string a caller writes to `tokens.json`. */
export function tokensCssToDtcgJson(css: string, name?: string): string {
  return JSON.stringify(tokensCssToDtcg(css, name), null, 2);
}
