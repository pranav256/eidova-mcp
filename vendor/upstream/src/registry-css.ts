// Pure helpers for turning a generated `globals.css` into shadcn's cssVars
// structure for the per-project registry (`/:id/registry/all.json`). Kept
// dependency-free so they are unit-testable in isolation. [BD-118]

// Pull `:root { ... }` and `.dark { ... }` blocks out of the generated globals.css and turn
// them into shadcn's cssVars structure. shadcn merges these into whichever file
// `tailwind.css` in the caller's components.json points to (e.g. src/app/globals.css).
/** A parsed block of CSS custom properties. */
export interface CssVarBlock {
  [name: string]: string;
}

/** The three variable scopes a globals.css declares. */
export interface ParsedCssVars {
  theme: CssVarBlock;
  light: CssVarBlock;
  dark: CssVarBlock;
}

/**
 * Removes every `/* ... *\/` comment, as `/\/\*[\s\S]*?\*\//g` would, in
 * one pass. The regex rescanned the rest of the sheet from every unclosed
 * `/*`, so a fetched sheet of them took time with the square of its length;
 * once no `*\/` follows, no later comment can close either. [BD-994]
 */
export function stripCssComments(css: string): string {
  let out = "";
  let from = 0;
  for (;;) {
    const open = css.indexOf("/*", from);
    if (open === -1) break;
    const close = css.indexOf("*/", open + 2);
    if (close === -1) break;
    out += css.slice(from, open);
    from = close + 2;
  }
  return out + css.slice(from);
}

/** Reads the :root/.dark custom-property blocks out of a globals.css. */
export function parseCssVars(css: string): ParsedCssVars {
  // SAFETY: the empty default is never read; the provider always supplies a value.
  const out = { theme: {}, light: {} as Record<string, string>, dark: {} as Record<string, string> };
  // Each block runs from `selector {` to the first `}`, as `[^}]*\}` did.
  // Finding that brace with indexOf, and stopping once none is left, keeps a
  // sheet of unclosed blocks linear. [BD-994]
  const matchBlock = (selector: string) => {
    const re = new RegExp(`${selector}\\s*\\{`, "g");
    const blocks: string[] = [];
    while (re.exec(css)) {
      const close = css.indexOf("}", re.lastIndex);
      if (close === -1) break;
      blocks.push(css.slice(re.lastIndex, close));
      re.lastIndex = close + 1;
    }
    return blocks.join("\n");
  };
  const extract = (body: string) => {
    const result: Record<string, string> = {};
    // Strip `/* … */` comments first, then scan for `--name: value;` declarations
    // directly. Matching each declaration (rather than splitting on `;` or `\n`)
    // is robust on two axes our seed DSes actually exercise:
    //   • the value is `[^;]+`, so multi-line shadow stacks / wrapped font lists are
    //     captured whole (a `\n`-split truncated them, leaving a dangling comma);
    //   • leading prose is ignored, so a malformed comment that leaks stray text
    //     between declarations can't swallow the token that follows it.
    // Internal whitespace is collapsed so a multi-line value lands as one clean line.
    // A value needs a `;` after it, so the scan stops at the last one: a value
    // with none after it rescanned the rest of the block from every
    // declaration start, quadratic on a sheet of them. [BD-994]
    const stripped = stripCssComments(body);
    const clean = stripped.slice(0, stripped.lastIndexOf(";") + 1);
    // The lookbehind lets only the first dash of a run start a name, so a long
    // run of dashes in a fetched sheet cannot make this quadratic. [BD-498]
    const declRe = /(?<![\w-])--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(clean))) {
      result[m[1]] = m[2].replace(/\s+/g, " ").trim();
    }
    return result;
  };
  out.light = extract(matchBlock(":root"));
  out.dark = extract(matchBlock("\\.dark"));
  return out;
}

// Our design systems are single-theme: the generated globals.css declares one
// palette under `:root` and ships no `.dark` block (see CLAUDE.md "one global
// look", verified across seed DSes). The consumer's create-next-app globals.css,
// however, ships BOTH a `:root` and a default-neutral `.dark` block, and shadcn's
// cssVars merge can only overwrite keys it is given — it cannot delete the
// consumer's `.dark`. So when the app runs in dark mode (the agent adds
// `class="dark"` for a dark DS), it renders stale neutral defaults
// (`--primary-foreground: oklch(0.205 0 0)` → dark label) while the DS's
// `--hl-*`/gradient tokens leak in via cascade from `:root` — a colored primary
// button with dark text. Mirror the authored side into the empty one so the DS
// tokens win in BOTH modes = one consistent look regardless of the `.dark` class.
// Guard: only fill an EMPTY side, so a genuinely dual-theme DS (should one ever
// ship) is left untouched. [BD-118]
export function mirrorSingleTheme<T extends { light: Record<string, string>; dark: Record<string, string> }>(vars: T): T {
  const hasLight = Object.keys(vars.light).length > 0;
  const hasDark = Object.keys(vars.dark).length > 0;
  if (hasLight && !hasDark) return { ...vars, dark: { ...vars.light } };
  if (hasDark && !hasLight) return { ...vars, light: { ...vars.dark } };
  return vars;
}

// shadcn also accepts a `css` field with arbitrary @layer blocks. Pull any non-variable
// rules (e.g. `@layer base { ... }`) into that field so they install alongside the cssVars.
// Shared by BOTH registry builders — the per-project route and the seed-catalog generator —
// so a single source of truth governs how globals.css becomes a shadcn payload. [BD-118]
// oxlint-disable-next-line typescript/no-restricted-types -- existing broad object type; replace it with a specific type when this code changes
/** Raw at-rule blocks keyed by their selector text. */
interface RawCssBlocks {
  [selector: string]: string | CssVarBlock;
}

/** Collects the raw CSS blocks shadcn merges verbatim, keyed by selector. */
export function parseRawCssBlocks(css: string): RawCssBlocks {
  const out: RawCssBlocks = {};
  // Webfont imports must ship with the tokens or the installed brand renders
  // in a fallback stack. shadcn's css field accepts `"@import url(...)": {}`
  // keys and hoists them to the top of the caller's CSS file. Only font URLs:
  // the Tailwind import is the caller's own, and relative imports would 404
  // outside this repo. [BD-490]
  const importRe = /@import\s+url\(["']?(https:\/\/fonts\.(?:googleapis\.com|bunny\.net)\/[^"')]+)["']?\)[^;]*;/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(css))) {
    out[`@import url("${m[1]}")`] = {};
  }
  // A layer can appear more than once in a file. Join the blocks, so a rule in
  // an earlier block still installs. [BD-1028]
  const layerRe = /@layer\s+(base|components|utilities)\s*\{([\s\S]*?)\n\}/g;
  const layers = new Map<string, string[]>();
  while ((m = layerRe.exec(css))) {
    const key = `@layer ${m[1]}`;
    layers.set(key, [...(layers.get(key) ?? []), m[2].trim()]);
  }
  for (const [key, blocks] of layers) out[key] = blocks.join("\n\n  ");
  return out;
}

// The tokens every shadcn project already declares, plus the theme-wide font
// and radius tokens. A component item never ships these: shadcn adds a cssVar
// the project lacks, and the project's own value for these must stay. The full
// install carries them through the globals item. [BD-1370]
const PROJECT_TOKEN =
  /^(?:background|foreground|(?:card|popover|primary|secondary|muted|accent|destructive)(?:-foreground)?|border|input|ring|radius|chart-\d+|sidebar(?:-[a-z-]+)?|font-(?:sans|serif|mono)|shadow-(?:2xs|xs|sm|md|lg|xl|2xl))$/;

/** Escapes a token name for use inside a regular expression. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The design-system tokens one component reads, for a scoped install. A token
 * counts when the source names it as `--name` or as the tail of a utility
 * class, such as `bg-success` or `shadow-well`. Tokens that other tokens'
 * values read come along. A component that reads none returns undefined, so
 * the item carries no cssVars and leaves the project's stylesheet alone.
 * [BD-1370]
 */
export function componentCssVars(sources: string[], vars: ParsedCssVars): ParsedCssVars | undefined {
  const text = sources.join("\n");
  const candidates = [...new Set([...Object.keys(vars.light), ...Object.keys(vars.dark)])]
    .filter((name) => !PROJECT_TOKEN.test(name));
  // A one-word token needs a utility in front (`bg-success`), so the word in a
  // comment does not count; a token such as `shadow-well` is its own utility.
  const reads = (name: string): boolean => {
    const utility = name.includes("-") ? "(?:[a-z0-9]+-)*" : "[a-z0-9]+(?:-[a-z0-9]+)*-";
    return new RegExp(`(?:--|(?<![\\w-])${utility})${escapeRegExp(name)}(?![\\w-])`).test(text);
  };
  const used = new Set(candidates.filter(reads));
  if (used.size === 0) return undefined;
  // A value such as `var(--shadow-lift)` needs the token it points at.
  const queue = [...used];
  while (queue.length > 0) {
    const name = queue.pop() ?? "";
    const values = [vars.light[name], vars.dark[name]].filter(Boolean).join(" ");
    for (const [, ref] of values.matchAll(/var\(--([a-zA-Z0-9_-]+)/g)) {
      if (used.has(ref) || PROJECT_TOKEN.test(ref)) continue;
      if (!(ref in vars.light) && !(ref in vars.dark)) continue;
      used.add(ref);
      queue.push(ref);
    }
  }
  const pick = (block: CssVarBlock): CssVarBlock =>
    Object.fromEntries(Object.entries(block).filter(([name]) => used.has(name)));
  return { theme: {}, light: pick(vars.light), dark: pick(vars.dark) };
}
