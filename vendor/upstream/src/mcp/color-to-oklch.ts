// Dependency-free color parsing + sRGB -> OKLCH conversion for the
// extract-design-system MCP tool. The repo mandates oklch() for every color
// value (CLAUDE.md "Color Values"), so when we read tokens out of a consumer's
// globals.css (which is usually hex/rgb/hsl) we normalize them to oklch on the
// way out. Kept self-contained (no culori dependency) so the MCP server bundle
// stays lean and this is unit-testable in isolation.
//
// Conversion math is Björn Ottosson's OKLab/OKLCH (https://bottosson.github.io/posts/oklab/).

// The full CSS named-color table (CSS Color Module Level 4), mapped to hex so a
// single converter path handles them. `transparent` is special-cased below
// (alpha 0). Lets the extractor normalize tokens authored as `red`, `slategray`,
// `rebeccapurple`, etc. instead of dropping them as non-colors.
/** The values `NAMED_HEX` maps its keys onto. */
interface NamedHexTable {
  [key: string]: string;
}

const NAMED_HEX: NamedHexTable = {
  aliceblue: "#f0f8ff", antiquewhite: "#faebd7", aqua: "#00ffff", aquamarine: "#7fffd4",
  azure: "#f0ffff", beige: "#f5f5dc", bisque: "#ffe4c4", black: "#000000",
  blanchedalmond: "#ffebcd", blue: "#0000ff", blueviolet: "#8a2be2", brown: "#a52a2a",
  burlywood: "#deb887", cadetblue: "#5f9ea0", chartreuse: "#7fff00", chocolate: "#d2691e",
  coral: "#ff7f50", cornflowerblue: "#6495ed", cornsilk: "#fff8dc", crimson: "#dc143c",
  cyan: "#00ffff", darkblue: "#00008b", darkcyan: "#008b8b", darkgoldenrod: "#b8860b",
  darkgray: "#a9a9a9", darkgreen: "#006400", darkgrey: "#a9a9a9", darkkhaki: "#bdb76b",
  darkmagenta: "#8b008b", darkolivegreen: "#556b2f", darkorange: "#ff8c00", darkorchid: "#9932cc",
  darkred: "#8b0000", darksalmon: "#e9967a", darkseagreen: "#8fbc8f", darkslateblue: "#483d8b",
  darkslategray: "#2f4f4f", darkslategrey: "#2f4f4f", darkturquoise: "#00ced1", darkviolet: "#9400d3",
  deeppink: "#ff1493", deepskyblue: "#00bfff", dimgray: "#696969", dimgrey: "#696969",
  dodgerblue: "#1e90ff", firebrick: "#b22222", floralwhite: "#fffaf0", forestgreen: "#228b22",
  fuchsia: "#ff00ff", gainsboro: "#dcdcdc", ghostwhite: "#f8f8ff", gold: "#ffd700",
  goldenrod: "#daa520", gray: "#808080", green: "#008000", greenyellow: "#adff2f",
  grey: "#808080", honeydew: "#f0fff0", hotpink: "#ff69b4", indianred: "#cd5c5c",
  indigo: "#4b0082", ivory: "#fffff0", khaki: "#f0e68c", lavender: "#e6e6fa",
  lavenderblush: "#fff0f5", lawngreen: "#7cfc00", lemonchiffon: "#fffacd", lightblue: "#add8e6",
  lightcoral: "#f08080", lightcyan: "#e0ffff", lightgoldenrodyellow: "#fafad2", lightgray: "#d3d3d3",
  lightgreen: "#90ee90", lightgrey: "#d3d3d3", lightpink: "#ffb6c1", lightsalmon: "#ffa07a",
  lightseagreen: "#20b2aa", lightskyblue: "#87cefa", lightslategray: "#778899", lightslategrey: "#778899",
  lightsteelblue: "#b0c4de", lightyellow: "#ffffe0", lime: "#00ff00", limegreen: "#32cd32",
  linen: "#faf0e6", magenta: "#ff00ff", maroon: "#800000", mediumaquamarine: "#66cdaa",
  mediumblue: "#0000cd", mediumorchid: "#ba55d3", mediumpurple: "#9370db", mediumseagreen: "#3cb371",
  mediumslateblue: "#7b68ee", mediumspringgreen: "#00fa9a", mediumturquoise: "#48d1cc", mediumvioletred: "#c71585",
  midnightblue: "#191970", mintcream: "#f5fffa", mistyrose: "#ffe4e1", moccasin: "#ffe4b5",
  navajowhite: "#ffdead", navy: "#000080", oldlace: "#fdf5e6", olive: "#808000",
  olivedrab: "#6b8e23", orange: "#ffa500", orangered: "#ff4500", orchid: "#da70d6",
  palegoldenrod: "#eee8aa", palegreen: "#98fb98", paleturquoise: "#afeeee", palevioletred: "#db7093",
  papayawhip: "#ffefd5", peachpuff: "#ffdab9", peru: "#cd853f", pink: "#ffc0cb",
  plum: "#dda0dd", powderblue: "#b0e0e6", purple: "#800080", rebeccapurple: "#663399",
  red: "#ff0000", rosybrown: "#bc8f8f", royalblue: "#4169e1", saddlebrown: "#8b4513",
  salmon: "#fa8072", sandybrown: "#f4a460", seagreen: "#2e8b57", seashell: "#fff5ee",
  sienna: "#a0522d", silver: "#c0c0c0", skyblue: "#87ceeb", slateblue: "#6a5acd",
  slategray: "#708090", slategrey: "#708090", snow: "#fffafa", springgreen: "#00ff7f",
  steelblue: "#4682b4", tan: "#d2b48c", teal: "#008080", thistle: "#d8bfd8",
  tomato: "#ff6347", turquoise: "#40e0d0", violet: "#ee82ee", wheat: "#f5deb3",
  white: "#ffffff", whitesmoke: "#f5f5f5", yellow: "#ffff00", yellowgreen: "#9acd32",
};

// `currentColor` is a genuine color keyword that resolves at use-site, so pass it
// through untouched rather than dropping it. The CSS-wide keywords
// (inherit/initial/unset) can appear on ANY property and are NOT colors, so they
// must return null and never be classified as color tokens.
const PASSTHROUGH_KEYWORDS = new Set(["currentcolor"]);
const NON_COLOR_KEYWORDS = new Set(["inherit", "initial", "unset"]);

interface Rgba {
  r: number; // 0..1
  g: number;
  b: number;
  a: number; // 0..1
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function parseAlpha(raw: string | undefined): number {
  if (raw == null) return 1;
  const s = raw.trim();
  if (s.endsWith("%")) return clamp01(parseFloat(s) / 100);
  const n = parseFloat(s);
  return Number.isFinite(n) ? clamp01(n) : 1;
}

function parseChannel(raw: string): number {
  // Returns 0..1 from a "255-scale or %" channel.
  const s = raw.trim();
  if (s.endsWith("%")) return clamp01(parseFloat(s) / 100);
  return clamp01(parseFloat(s) / 255);
}

function parseHex(hex: string): Rgba | null {
  let h = hex.trim().replace(/^#/, "");
  if (![3, 4, 6, 8].includes(h.length) || /[^0-9a-fA-F]/.test(h)) return null;
  if (h.length === 3 || h.length === 4) {
    h = h.split("").map((c) => c + c).join("");
  }
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

// Split the inside of rgb()/hsl() on commas or whitespace, peeling off a
// `/ alpha` or `, alpha` tail. Handles both legacy `rgb(r, g, b, a)` and modern
// `rgb(r g b / a)` syntaxes.
function splitColorArgs(inner: string) {
  let alpha: string | undefined;
  let body = inner;
  const slash = inner.indexOf("/");
  if (slash !== -1) {
    alpha = inner.slice(slash + 1);
    body = inner.slice(0, slash);
  }
  const parts = body.trim().split(/[\s,]+/).filter(Boolean);
  if (alpha === undefined && parts.length === 4) {
    alpha = parts.pop();
  }
  return { parts, alpha };
}

// Reject any channel that didn't parse to a real number, so malformed input like
// `rgb(abc, def, ghi)` returns null (classified non-color) instead of producing
// `oklch(NaN 0 0)`.
function finiteRgba(rgba: Rgba): Rgba | null {
  return [rgba.r, rgba.g, rgba.b, rgba.a].every((n) => Number.isFinite(n)) ? rgba : null;
}

function parseRgb(value: string): Rgba | null {
  const m = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!m) return null;
  const { parts, alpha } = splitColorArgs(m[1]);
  if (parts.length < 3) return null;
  return finiteRgba({
    r: parseChannel(parts[0]),
    g: parseChannel(parts[1]),
    b: parseChannel(parts[2]),
    a: parseAlpha(alpha),
  });
}

// Shopify's Dawn-derived themes (and forks like Uclips's) store colors as a
// bare "r,g,b" triplet meant to be consumed as `rgb(var(--color-button))`,
// with no wrapper on the custom property itself. Without this, every color
// in a Shopify theme's :root block was invisible to extraction: this module
// only recognized rgb()/hsl()/hex/named, so a merchant's real palette came
// back as "no semantic color tokens recognized" while radius, type, and
// borders extracted fine. Comma-separated only (not space-separated, which
// is ambiguous with unrelated numeric lists like grid breakpoints) and every
// channel must fall in a plausible 0-255 range, so this cannot misfire on an
// unrelated multi-value custom property such as `--grid-gap: 24, 32`.
function parseBareTriplet(value: string): Rgba | null {
  const parts = value.split(",").map((p) => p.trim());
  if (parts.length !== 3 && parts.length !== 4) return null;
  if (!parts.every((p) => /^\d{1,3}(\.\d+)?$/.test(p))) return null;
  const [r, g, b] = parts.map(Number);
  if (![r, g, b].every((n) => n >= 0 && n <= 255)) return null;
  const a = parts.length === 4 ? Number(parts[3]) : 1;
  if (a < 0 || a > 1) return null;
  // Channels are 0-255 here, same scale parseChannel() normalizes for rgb().
  return finiteRgba({ r: r / 255, g: g / 255, b: b / 255, a });
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

// CSS hue accepts an optional angle unit: deg (default), turn, grad, rad.
// `grad` is checked before `rad` since it also ends in "rad".
function parseHue(raw: string): number {
  const s = raw.trim().toLowerCase();
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return NaN;
  if (s.endsWith("turn")) return n * 360;
  if (s.endsWith("grad")) return n * 0.9;
  if (s.endsWith("rad")) return n * (180 / Math.PI);
  return n;
}

function parseHsl(value: string): Rgba | null {
  const m = value.match(/^hsla?\(([^)]+)\)$/i);
  if (!m) return null;
  const { parts, alpha } = splitColorArgs(m[1]);
  if (parts.length < 3) return null;
  const hRaw = parseHue(parts[0]);
  const sRaw = parseFloat(parts[1]);
  const lRaw = parseFloat(parts[2]);
  if (![hRaw, sRaw, lRaw].every((n) => Number.isFinite(n))) return null;
  const h = ((hRaw % 360) + 360) % 360 / 360;
  const s = clamp01(sRaw / 100);
  const l = clamp01(lRaw / 100);
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }
  return { r, g, b, a: parseAlpha(alpha) };
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function rgbaToOklch({ r, g, b, a }: Rgba): string {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const aa = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.sqrt(aa * aa + bb * bb);
  let h = (Math.atan2(bb, aa) * 180) / Math.PI;
  if (h < 0) h += 360;

  const Lr = round(clamp01(L), 4);
  const Cr = round(Math.max(0, C), 4);
  // Hue is meaningless for near-neutral colors; pin to 0 so greys read cleanly.
  const hr = Cr < 0.0005 ? 0 : round(h, 2);

  const core = `${Lr} ${Cr} ${hr}`;
  return a < 1 ? `oklch(${core} / ${round(a, 3)})` : `oklch(${core})`;
}

/**
 * Convert a single CSS color value to `oklch(...)`. Returns the normalized
 * oklch string, an already-oklch value untouched, a known keyword's mapping, or
 * `null` when the value is not a color we recognize (so callers can classify the
 * declaration as non-color).
 */
export function toOklch(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  const lower = v.toLowerCase();
  if (lower.startsWith("oklch(")) return v;
  if (lower === "transparent") return "oklch(0 0 0 / 0)";
  if (PASSTHROUGH_KEYWORDS.has(lower)) return v;
  if (NON_COLOR_KEYWORDS.has(lower)) return null;

  const named = NAMED_HEX[lower];
  if (named) {
    const rgbaNamed = parseHex(named);
    if (rgbaNamed) return rgbaToOklch(rgbaNamed);
  }

  let rgba: Rgba | null = null;
  if (v.startsWith("#")) rgba = parseHex(v);
  else if (/^rgba?\(/i.test(v)) rgba = parseRgb(v);
  else if (/^hsla?\(/i.test(v)) rgba = parseHsl(v);
  else if (v.includes(",")) rgba = parseBareTriplet(v);

  return rgba ? rgbaToOklch(rgba) : null;
}

/** True when a CSS value looks like a color this module can normalize. */
export function isColorValue(value: string): boolean {
  return toOklch(value) !== null;
}

/** The four channels of an `oklch()` value, with alpha defaulted to 1. */
export interface OklchChannels {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

/**
 * Reads the channels out of a plain `oklch()` string.
 *
 * Returns null for anything a browser would have to resolve first, such as the
 * relative form `oklch(from var(--primary) calc(l - 0.09) c h)`. Callers that
 * need numbers, the DTCG color value and the Figma sRGB conversion, both go
 * through this so there is one parser to be wrong. The hue may be negative,
 * which is valid CSS a hand-written sheet can carry, even though this module
 * writes every hue it generates as 0 to 360.
 */
export function parseOklch(value: string): OklchChannels | null {
  const m = value
    .trim()
    .match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+(-?[\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i);
  if (!m) return null;

  const percent = (raw: string): number =>
    raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);

  const channels: OklchChannels = {
    l: percent(m[1]),
    c: parseFloat(m[2]),
    h: parseFloat(m[3]),
    alpha: m[4] === undefined ? 1 : percent(m[4]),
  };
  if (!Object.values(channels).every(Number.isFinite)) return null;

  // Lightness is 0 to 1 and hue is 0 to 360 wherever these numbers travel: the
  // design token format states both ranges, and the sRGB conversion below
  // assumes them. A hand-written `-30` is the same hue as `330`.
  channels.l = Math.min(1, Math.max(0, channels.l));
  channels.h = ((channels.h % 360) + 360) % 360;
  channels.alpha = Math.min(1, Math.max(0, channels.alpha));
  return channels;
}

/** Figma-style 0..1 sRGB channels. Not 0..255, and not a CSS string. */
export interface SrgbChannels {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * OKLCH to 0..1 sRGB, using Björn Ottosson's OKLab matrices, the same source
 * this module's sRGB to OKLCH conversion uses in the other direction.
 *
 * Anything that cannot read oklch needs this: a Figma variable, and the 6-digit
 * hex fallback the design token format carries beside a color.
 */
export function oklchToSrgb({ l, c, h, alpha }: OklchChannels): SrgbChannels {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const gamma = (channel: number): number =>
    clamp01(channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055);

  return {
    r: gamma(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    g: gamma(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    b: gamma(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
    a: clamp01(alpha),
  };
}

/** The 6-digit hex for an oklch color. Alpha is carried separately, so it is dropped here. */
export function oklchToHex(channels: OklchChannels): string {
  const { r, g, b } = oklchToSrgb(channels);
  const byte = (channel: number): string =>
    Math.round(channel * 255).toString(16).padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}
