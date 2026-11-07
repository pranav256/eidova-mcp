import { toOklch } from "./color-to-oklch";
import type { FigmaKit } from "./figma-kit";

/**
 * Turns a client's Figma kit into the token CSS a prototype is built with
 * [BD-1056]. A shadcn kit names its semantic colours like the token contract
 * our parts already read (`base/background`, `sidebar/sidebar-border`), keeps
 * them in a collection with Light and Dark modes, and points each one through a
 * brand theme to a raw colour. This follows that chain for the theme asked for,
 * so the page wears the client's colours, font and radius.
 */

type KitVariable = FigmaKit["collections"][number]["variables"][number];
type KitValue = KitVariable["values"][string];

/** Variable groups whose last name segment is a token our parts read. */
const SEMANTIC_GROUPS = ["base/", "sidebar/", "chart/"];

/** Longest alias chain followed before a value counts as unresolved. */
const ALIAS_DEPTH = 8;

const isLightDark = (modes: readonly string[]) => modes.some((mode) => /^light$/i.test(mode)) && modes.some((mode) => /^dark$/i.test(mode));

/** The brand themes a kit offers: the modes of its collections that are not light and dark. */
export function kitThemes(kit: FigmaKit): string[] {
  const themes = kit.collections.filter((collection) => collection.modes.length > 1 && !isLightDark(collection.modes));
  return [...new Set(themes.flatMap((collection) => collection.modes))];
}

/** What a resolved token can hold. */
type Resolved = { color: { r: number; g: number; b: number; a: number } } | { number: number } | { string: string };

/**
 * The token CSS for one theme of a kit: `:root` for light, `.dark` for dark.
 * Empty when the kit has no light and dark collection of semantic colours.
 */
export function kitTokensCss(kit: FigmaKit, options: { theme?: string }): string {
  const themes = kitThemes(kit);
  const theme = options.theme && themes.includes(options.theme) ? options.theme : themes[0];
  const owner = new Map<string, { modes: string[]; variable: KitVariable }>();
  for (const collection of kit.collections) {
    for (const variable of collection.variables) owner.set(variable.name, { modes: collection.modes, variable });
  }

  // Each collection answers in one mode: light or dark for the mode collection, the chosen theme for the rest.
  const resolve = (name: string, scheme: "light" | "dark", depth = 0): Resolved | null => {
    const entry = owner.get(name);
    if (!entry || depth > ALIAS_DEPTH) return null;
    const mode =
      entry.modes.find((candidate) => candidate.toLowerCase() === scheme) ??
      entry.modes.find((candidate) => candidate === theme) ??
      entry.modes[0];
    const value: KitValue | undefined = mode === undefined ? undefined : entry.variable.values[mode];
    if (!value) return null;
    if ("alias" in value) return resolve(value.alias, scheme, depth + 1);
    if ("boolean" in value) return null;
    return value;
  };

  const modeCollection = kit.collections.find((collection) => isLightDark(collection.modes));
  if (!modeCollection) return "";
  const colours = modeCollection.variables.filter((variable) => variable.type === "COLOR")
  const isSemantic = (variable: KitVariable) => SEMANTIC_GROUPS.some((group) => variable.name.startsWith(group))
  const tokenOf = (variable: KitVariable) => variable.name.split("/").pop() ?? ""
  const semantic = colours.filter(isSemantic)
  // The kit's other named colours, such as a palette of tints, become tokens
  // too, so a page can colour an icon the way the frame does. A semantic token
  // keeps its name when a palette colour shares it. [BD-1163]
  const taken = new Set(semantic.map(tokenOf))
  // A palette name starts with a letter, so a helper scale such as
  // `alpha/Light/10` stays out.
  const palette = colours.filter((variable) => !isSemantic(variable) && /^[a-z]/.test(tokenOf(variable)) && !taken.has(tokenOf(variable)))
  const block = (scheme: "light" | "dark") =>
    [...semantic, ...palette].flatMap((variable) => {
      const token = variable.name.split("/").pop() ?? "";
      const value = resolve(variable.name, scheme);
      if (!/^[a-z0-9-]+$/.test(token) || !value || !("color" in value)) return [];
      const css = cssColor(value.color);
      return css ? [`  --${token}: ${css};`] : [];
    });

  const light = block("light");
  if (light.length === 0) return "";
  const extras = [fontToken(kit, resolve), radiusToken(kit, resolve)].filter((line): line is string => Boolean(line));
  const dark = block("dark");
  return [`:root {\n${[...light, ...extras].join("\n")}\n}`, dark.length ? `.dark {\n${dark.join("\n")}\n}` : ""].filter(Boolean).join("\n\n");
}

/** A Figma colour, channels from 0 to 1, as oklch. */
function cssColor({ r, g, b, a }: { r: number; g: number; b: number; a: number }): string | null {
  const channel = (value: number) => Math.round(value * 255);
  return toOklch(`rgba(${channel(r)}, ${channel(g)}, ${channel(b)}, ${a})`);
}

type Resolver = (name: string, scheme: "light" | "dark") => Resolved | null;

/** The sans font family, from the variable whose name ends in `font-sans`. */
function fontToken(kit: FigmaKit, resolve: Resolver): string | null {
  const variable = kit.collections.flatMap((collection) => collection.variables).find((candidate) => candidate.name.endsWith("font-sans"));
  const value = variable ? resolve(variable.name, "light") : null;
  if (!value || !("string" in value) || !/^[\w .-]+$/.test(value.string)) return null;
  return `  --font-sans: "${value.string}", ui-sans-serif, system-ui, sans-serif;`;
}

/** The base radius in rem, from `border radius/default` or a variable named `radius`. */
function radiusToken(kit: FigmaKit, resolve: Resolver): string | null {
  const variable = kit.collections
    .flatMap((collection) => collection.variables)
    .find((candidate) => candidate.name === "border radius/default" || candidate.name.split("/").pop() === "radius");
  const value = variable ? resolve(variable.name, "light") : null;
  if (!value || !("number" in value)) return null;
  return `  --radius: ${Number((value.number / 16).toFixed(4))}rem;`;
}
