// Adapters that turn any brand source a client hands us into the one raw
// token-map shape extract-design-system already normalizes: pasted CSS, a
// computed-style sample read off the live site, or a design-tokens export
// (W3C format or the Figma variables API shape). Every adapter outputs
// `--name: value` pairs, so adding a source type never touches the pipeline
// behind it. [BD-491]

import { parseOklch, toOklch } from "./color-to-oklch";
import {
  buildExtractionResult,
  collectCssVars,
  type ExtractionResult,
} from "./extract-design-system";
import { isNumber, isObjectLike, isRecordLike, isString } from "../guards";

/** Which adapter reads a source: pasted CSS, a live computed-style sample, or a design-tokens export. */
export type BrandSourceKind = "css" | "computed" | "tokens";

/** Parsed-JSON shape at the source boundary; keys are author-defined and open. */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** One brand input a client hands us, before any adapter has read it. */
export interface BrandSource {
  /** Label shown in the output, e.g. "globals.css" or "live site sample". */
  name: string;
  /** Omit to infer: JSON with $value entries is tokens, JSON keyed by UI roles is computed, anything else is CSS. */
  kind?: BrandSourceKind;
  /** The colour scheme a computed sample was rendered in. A dark sample fills the dark theme. [BD-1150] */
  scheme?: "light" | "dark";
  content: string;
}


/** Picks the adapter for a source whose kind the caller left off, from the content alone. */
export function inferSourceKind(content: string): BrandSourceKind {
  const t = content.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return "css";
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    return "css";
  }
  if (t.includes('"$value"')) return "tokens";
  if (isRecordLike(parsed)) {
    // SAFETY: narrowing inside the guard chain that validates this value.
    const keys = Object.keys(parsed as object);
    if (keys.some((k) => COMPUTED_ROLES.has(k))) return "computed";
  }
  return "tokens";
}

// role -> computed style property -> token name. Reading what an element IS
// beats guessing from variable names: a button's rendered background maps to
// --primary no matter what the site's author called it. The sampling script is
// GENERATED from this map (buildRoleSampleScript), so every role listed here
// is gathered by construction; a new role only needs its selector below.
const ROLE_MAP = {
  body: { backgroundColor: "background", color: "foreground", fontFamily: "font-sans" },
  heading: { fontFamily: "font-heading" },
  // The link color is the closest rendered stand-in for an accent. On sites
  // where links reuse the primary, the alias fill leaves primary untouched, so
  // this can only add information, never fight the button's own sample.
  link: { color: "accent" },
  button: {
    backgroundColor: "primary",
    color: "primary-foreground",
    borderRadius: "radius-button",
  },
  input: { borderColor: "border", borderRadius: "radius-input" },
  card: {
    backgroundColor: "card",
    color: "card-foreground",
    borderRadius: "radius-card",
    boxShadow: "shadow-card",
  },
} satisfies Record<string, Record<string, string>>;

/** Derived from ROLE_MAP so the inference set and the mapping cannot drift. */
const COMPUTED_ROLES = new Set(Object.keys(ROLE_MAP));

/**
 * Every token name a rendered-page sample can produce, such as "primary" or
 * "radius-button". The free store check's fallback read lists these first, and its tests fail
 * when a name it lists is no longer produced here. [BD-987]
 */
export const ROLE_TOKEN_NAMES = new Set(Object.values(ROLE_MAP).flatMap((styles) => Object.values(styles)));

// Where each role lives in a page. Paired with ROLE_MAP's property lists to
// GENERATE the in-page sampling script. Both consumers, the Worker route and
// the console snippet in the tool description, interpolate the generated
// script, so neither hand-mirrors the roles.
/** The values `ROLE_SELECTORS` maps its keys onto. */
interface RoleSelectorsTable {
  [key: string]: string;
}

const ROLE_SELECTORS: RoleSelectorsTable = {
  body: "body",
  heading: "h1,h2",
  link: "a[href]",
  button: "button,[role=button],.btn,input[type=submit],a[class*=button],a[class*=btn]",
  input: "input:not([type=hidden]),textarea,select",
  card: "[class*=card]",
} satisfies Record<keyof typeof ROLE_MAP, string>;

/**
 * The sampling script a browser runs inside the target page. Generated from
 * ROLE_MAP and ROLE_SELECTORS so its output is, by construction, exactly the
 * shape the computed adapter reads. Returns a JSON-serializable object.
 */
export function buildRoleSampleScript(): string {
  // SAFETY: the keys of a closed literal object.
  const entries = (Object.keys(ROLE_MAP) as Array<keyof typeof ROLE_MAP>)
    .map((role) => {
      const selector = ROLE_SELECTORS[role];
      const propList = JSON.stringify(Object.keys(ROLE_MAP[role]));
      // The first button is often a menu toggle, a ghost button or a cookie
      // banner's, so the button role takes the first visible filled one,
      // preferring a class that names it primary, then the most colourful of
      // the first twelve: a cream tab or a white chip can come before the
      // coloured call to action. [BD-1158]
      if (role === "button") return `    ${role}: action(${JSON.stringify(selector)}, ${propList}),`;
      return `    ${role}: pick(document.querySelector(${JSON.stringify(selector)}), ${propList}),`;
    })
    .join("\n");
  return `(() => {
  const pick = (el, props) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return Object.fromEntries(props.map((p) => [p, cs[p]]));
  };
  const clear = (c) => {
    const flat = (c || "").split(" ").join("");
    return !flat || flat === "transparent" || flat.endsWith(",0)") || flat.endsWith("/0)");
  };
  const aside = "dialog,[role=dialog],[aria-modal=true],[class*=cookie],[id*=cookie],[class*=consent],[id*=consent],[class*=cky-]";
  const action = (selector, props) => {
    const all = Array.from(document.querySelectorAll(selector)).slice(0, 200).filter((el) => !el.closest(aside));
    const shown = all.filter((el) => {
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && !clear(getComputedStyle(el).backgroundColor);
    });
    const isPrimaryClass = (t) => t === "primary" || ((t.startsWith("btn") || t.startsWith("button")) && t.endsWith("primary"));
    const named = shown.find((el) => String(el.className).split(" ").some(isPrimaryClass));
    const spread = (el) => {
      const rgb = (getComputedStyle(el).backgroundColor.match(/[0-9.]+/g) || []).slice(0, 3).map(Number);
      return rgb.length === 3 ? Math.max(...rgb) - Math.min(...rgb) : 0;
    };
    const colourful = shown.slice(0, 12).reduce((best, el) => (spread(el) > (best ? spread(best) : 39) ? el : best), null);
    const sample = pick(named ?? colourful ?? shown[0] ?? all[0] ?? null, props);
    return sample && { ...sample, namedPrimary: named ? "yes" : "" };
  };
  return {
${entries}
  };
})()`;
}

// A caller may set an explicit kind, which skips inference, so a "computed"
// or "tokens" source is not guaranteed to be JSON. A source that does not
// parse contributes nothing instead of throwing out of the extraction.
function parseJsonOrNull(content: string): JsonValue | null {
  try {
    // SAFETY: the JSON contract of this payload; the producing side owns the shape.
    return JSON.parse(content) as JsonValue;
  } catch {
    return null;
  }
}

// A filled button whose class does not name it primary may be any button, so
// its colours fill the primary slot only when the stylesheet left it empty:
// the "button" aliases below never overwrite a real --primary. [BD-1158]
const UNNAMED_BUTTON = {
  backgroundColor: "button",
  color: "button-text",
  borderRadius: "radius-button",
} satisfies Record<keyof typeof ROLE_MAP.button, string>;

function computedToVars(content: string) {
  const out: Record<string, string> = {};
  // SAFETY: the roles document maps role names to token groups; malformed
  // input already yielded null.
  const roles = parseJsonOrNull(content) as Record<string, Record<string, JsonValue> | null> | null;
  if (!isObjectLike(roles)) return out;
  for (const [role, styles] of Object.entries(roles)) {
    if (!COMPUTED_ROLES.has(role) || !isObjectLike(styles)) continue;
    // SAFETY: the keys of a closed literal object.
    // Only the sampler marks a button as unnamed; a sample from another caller
    // keeps the old meaning, a rendered primary that beats the stylesheet.
    const map: Record<string, string> = role === "button" && styles.namedPrimary === ""
      ? UNNAMED_BUTTON
      : ROLE_MAP[role as keyof typeof ROLE_MAP];
    for (const [prop, token] of Object.entries(map)) {
      const value = styles[prop];
      // An outlined button samples as transparent, which is never the brand
      // color: leave the slot for the stylesheet to fill. [BD-498]
      if (isString(value) && value.trim() && parseOklch(toOklch(value) ?? "")?.alpha !== 0) out[token] = value.trim();
    }
  }
  // The input's rendered border fills both slots: --border and shadcn's --input.
  if (out.border) out.input = out.border;
  return out;
}

/** Figma's variables API returns color values as 0..1 float channels. */
function figmaColorToRgbString(v: Record<string, JsonValue>): string | null {
  const { r, g, b, a } = v;
  if (!isNumber(r) || !isNumber(g) || !isNumber(b)) return null;
  const to255 = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 255);
  const alpha = isNumber(a) && a < 1 ? `, ${a}` : "";
  return `rgb(${to255(r)}, ${to255(g)}, ${to255(b)}${alpha})`;
}

function kebab(part: string): string {
  return part
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function tokensToVars(content: string) {
  const out: Record<string, string> = {};
  const walk = (node: JsonValue, path: string[]) => {
    if (!isRecordLike(node)) return;
    // SAFETY: narrowing inside the guard chain that validates this value.
    const obj = node as Record<string, JsonValue>;
    const value = "$value" in obj ? obj.$value : "value" in obj && "type" in obj ? obj.value : undefined;
    if (value !== undefined) {
      const name = path.map(kebab).join("-");
      if (!name) return;
      if (isString(value) || isNumber(value)) {
        out[name] = String(value);
      } else if (Array.isArray(value) && value.every((x) => isString(x))) {
        out[name] = value.join(", ");
      } else if (isObjectLike(value)) {
        // SAFETY: the control only emits the values rendered into it.
        const rgb = figmaColorToRgbString(value as Record<string, JsonValue>);
        if (rgb) out[name] = rgb;
      }
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith("$")) continue;
      walk(v, [...path, k]);
    }
  };
  walk(parseJsonOrNull(content), []);
  return out;
}

// Vendor token names -> the semantic slot they mean. Shopify's Dawn family
// ships every one of these; without the mapping the palette summary reported
// "no semantic color tokens recognized" while the sheet held all the colors.
// A slot is only filled when empty, so a real --primary always wins.
const SEMANTIC_ALIASES: Array<[string, string]> = [
  ["color-background", "background"],
  ["color-foreground", "foreground"],
  ["color-button", "primary"],
  ["color-button-text", "primary-foreground"],
  ["color-secondary-button", "secondary"],
  ["color-secondary-button-text", "secondary-foreground"],
  ["color-link", "accent"],
  ["font-body-family", "font-sans"],
  ["button", "primary"],
  ["button-text", "primary-foreground"],
];

function applyAliases(vars: Record<string, string>): Array<[string, string]> {
  const applied: Array<[string, string]> = [];
  for (const [from, to] of SEMANTIC_ALIASES) {
    if (vars[from] !== undefined && vars[to] === undefined) {
      vars[to] = vars[from];
      applied.push([from, to]);
    }
  }
  return applied;
}

/**
 * Merge any mix of sources into one extraction. Later sources override earlier
 * ones token by token, so callers list the most authoritative source last
 * (a computed sample from the live site beats a stale stylesheet).
 */
export function extractFromSources(sources: BrandSource[], name?: string): ExtractionResult {
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};

  for (const source of sources) {
    const kind = source.kind ?? inferSourceKind(source.content);
    if (kind === "css") {
      const parsed = collectCssVars(source.content);
      Object.assign(light, parsed.light);
      Object.assign(dark, parsed.dark);
    } else if (kind === "computed") {
      Object.assign(source.scheme === "dark" ? dark : light, computedToVars(source.content));
    } else {
      Object.assign(light, tokensToVars(source.content));
    }
  }

  const aliased = applyAliases(light);
  for (const pair of applyAliases(dark)) {
    if (!aliased.some(([f, t]) => f === pair[0] && t === pair[1])) aliased.push(pair);
  }

  const result = buildExtractionResult({ light, dark }, name);
  result.sources = sources.map((s) => s.name);
  if (aliased.length) result.aliased = aliased;
  return result;
}
