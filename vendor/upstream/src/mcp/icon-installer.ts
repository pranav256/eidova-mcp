// Helpers for the `install-icons` MCP tool — fetch SVGs from the Iconify
// public API and turn them into React component files the agent writes to
// disk in the user's project.

export interface ParsedSvg {
  viewBox: string;
  body: string;
}

/**
 * SVG attributes that JSX requires in camelCase. Anything not in this list
 * we leave alone (it'll either already be camelCase or will be passed
 * through as a data-/aria-/xmlns: attribute which JSX accepts as-is).
 */
/** The values `KEBAB_TO_CAMEL_ATTRS` maps its keys onto. */
interface KebabToCamelAttrsTable {
  [key: string]: string;
}

const KEBAB_TO_CAMEL_ATTRS: KebabToCamelAttrsTable = {
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-dasharray": "strokeDasharray",
  "stroke-dashoffset": "strokeDashoffset",
  "stroke-miterlimit": "strokeMiterlimit",
  "stroke-opacity": "strokeOpacity",
  "fill-opacity": "fillOpacity",
  "fill-rule": "fillRule",
  "clip-path": "clipPath",
  "clip-rule": "clipRule",
  "color-interpolation-filters": "colorInterpolationFilters",
  "flood-color": "floodColor",
  "flood-opacity": "floodOpacity",
  "stop-color": "stopColor",
  "stop-opacity": "stopOpacity",
  "text-anchor": "textAnchor",
  "vector-effect": "vectorEffect",
  "paint-order": "paintOrder",
  "shape-rendering": "shapeRendering",
};

/**
 * Convert SVG attribute names from kebab-case to JSX-friendly camelCase so
 * the inlined body is valid React TSX.
 */
export function jsxifyAttrs(svgBody: string): string {
  let out = svgBody;
  for (const [from, to] of Object.entries(KEBAB_TO_CAMEL_ATTRS)) {
    out = out.replace(new RegExp(`\\b${from}=`, "g"), `${to}=`);
  }
  return out;
}

/**
 * Convert an Iconify icon name (kebab-case, may include a prefix) into a
 * PascalCase React component identifier with an "Icon" suffix.
 *
 * Examples:
 *   home              -> HomeIcon
 *   arrow-left        -> ArrowLeftIcon
 *   tabler:arrow-left -> ArrowLeftIcon
 *   brand-github      -> BrandGithubIcon
 *   1-circle          -> Icon1Circle  (component names cannot start with a digit)
 */
export function toPascalCase(rawName: string): string {
  const stripped = stripPrefix(rawName);
  const parts = stripped
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  const joined = parts.join("");
  const safe = /^[0-9]/.test(joined) ? `Icon${joined}` : `${joined}Icon`;
  return safe;
}

/**
 * Strip an Iconify prefix (`tabler:`, `phosphor:`, etc.) from an icon name.
 */
export function stripPrefix(name: string): string {
  const idx = name.indexOf(":");
  return idx === -1 ? name : name.slice(idx + 1);
}

/**
 * Extract the viewBox attribute and inner body of an `<svg>` element from a
 * raw Iconify-served SVG string. Falls back to `0 0 24 24` if no viewBox is
 * present.
 */
export function parseSvg(rawSvg: string): ParsedSvg {
  const match = rawSvg.match(/<svg([^>]*)>([\s\S]*)<\/svg>/i);
  if (!match) {
    return { viewBox: "0 0 24 24", body: rawSvg.trim() };
  }
  const attrs = match[1] ?? "";
  const body = (match[2] ?? "").trim();
  const viewBoxMatch = attrs.match(/viewBox\s*=\s*"([^"]+)"/i);
  const viewBox = viewBoxMatch?.[1] ?? "0 0 24 24";
  return { viewBox, body };
}

export interface BuildTsxOptions {
  libraryName: string;
  iconName: string;   // original Iconify name (e.g. "tabler:home" or "home")
  viewBox: string;
  body: string;
}

/**
 * Detect whether the SVG body declares its own `fill=` or `stroke=` attribute
 * on any child element. Outline-style icons (Tabler, Lucide, Feather) typically
 * leave fill/stroke off and inherit it from the parent `<svg>`. Filled/duotone
 * icons (Material Symbols Filled, Phosphor Fill, Solar Bold-Duotone) declare
 * their own fill/stroke on child paths — in that case we must NOT emit
 * SVG-level defaults or they'll override the body and break rendering.
 */
export function hasOwnStrokeOrFill(body: string): boolean {
  return /\b(fill|stroke)=/.test(body);
}

/**
 * Generate the source for a single `<Name>Icon` React component file.
 * Inlines the SVG body so there is no runtime CDN fetch.
 */
export function buildTsxComponent(opts: BuildTsxOptions): string {
  const componentName = toPascalCase(opts.iconName);
  const indentedBody = jsxifyAttrs(opts.body)
    .split("\n")
    .map((line) => (line.length ? `      ${line}` : line))
    .join("\n");
  const useOutlineDefaults = !hasOwnStrokeOrFill(opts.body);
  const svgAttrs = useOutlineDefaults
    ? `      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
`
    : "";
  return `// From ${opts.libraryName} — used via Iconify (https://iconify.design)
import type { SVGProps } from "react";

export function ${componentName}(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="${opts.viewBox}"
${svgAttrs}      {...props}
    >
${indentedBody}
    </svg>
  );
}
`;
}

export interface BarrelEntry {
  /** PascalCase component name, e.g. "HomeIcon". */
  componentName: string;
  /** File stem to import from (no extension), e.g. "./home". */
  importPath: string;
}

export interface BuildBarrelOptions {
  /** Human-readable library name, e.g. "Tabler Icons". */
  libraryName?: string;
  /** Iconify prefix, e.g. "tabler" or "ph". */
  prefix?: string;
}

/**
 * Build a barrel `index.ts` that re-exports every icon component.
 * The agent is instructed to merge this with any existing barrel rather
 * than overwrite, so duplicate exports stay the caller's problem.
 *
 * When `libraryName` and `prefix` are provided, a header comment is
 * prepended that names the locked library and points at follow-up tools.
 */
export function buildBarrel(
  entries: BarrelEntry[],
  options: BuildBarrelOptions = {},
): string {
  if (entries.length === 0) return "";
  const lines = entries
    .map((e) => `export { ${e.componentName} } from "${e.importPath}";`)
    .join("\n");
  const body = `${lines}\n`;
  const { libraryName, prefix } = options;
  if (!libraryName || !prefix) return body;
  const header = [
    `// Icons from ${libraryName} (https://iconify.design/?prefix=${prefix}).`,
    `// To add more: invoke the install-icons MCP tool with libraryId="${prefix}",`,
    `// or run \`bun run add-icon <name>\` if scripts/add-icon.ts exists in this repo.`,
    `// Do NOT mix in icons from other libraries — see .library.json for the locked choice.`,
    ``,
    ``,
  ].join("\n");
  return `${header}${body}`;
}

/**
 * Convert an icon name (with or without prefix) into a filesystem-safe
 * kebab-case file stem. Sanitises to `[a-z0-9-]` so a malicious or
 * malformed icon name (path separators, dots, control chars) can never
 * escape the target directory or produce an invalid filename. Throws if
 * the resulting stem would be empty so the caller can report it cleanly
 * via the skipped-list mechanism.
 */
export function toFileStem(rawName: string): string {
  const stem = stripPrefix(rawName).toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!stem) {
    throw new Error(`Icon name "${rawName}" sanitizes to empty stem.`);
  }
  return stem;
}

/**
 * Validate a user-supplied `targetDir` for the install-icons tool. Allowed:
 * relative paths only, no `..` segments, no leading `/`, no Windows drive
 * letters, no backslashes (Windows traversal), no null bytes. Trims trailing
 * slashes. Returns a discriminated-union result so callers can surface the
 * error via the existing MCP error-content pattern rather than throwing.
 */
export function validateTargetDir(
  input: string | undefined,
): { ok: true; dir: string } | { ok: false; error: string } {
  const dir = (input ?? "components/icons").replace(/\/+$/g, "");
  if (!dir) return { ok: false, error: "targetDir cannot be empty." };
  if (dir.startsWith("/") || /^[A-Za-z]:/.test(dir)) {
    return { ok: false, error: "targetDir must be a relative path." };
  }
  if (dir.split("/").some((seg) => seg === "..")) {
    return { ok: false, error: "targetDir cannot contain '..' segments." };
  }
  if (dir.includes("\\")) {
    return { ok: false, error: "targetDir cannot contain backslashes." };
  }
  if (/\0/.test(dir)) {
    return { ok: false, error: "targetDir contains invalid characters." };
  }
  return { ok: true, dir };
}
