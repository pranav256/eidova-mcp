export type IconLibraryProvenance =
  | "explicit"
  | "iconify-source"
  | "fallback";

export interface DesignSystemIconPresentation {
  id: string;
  name: string;
  prefix: string;
  variant: string;
  provenance: IconLibraryProvenance;
  conflict?: {
    declared: string;
    detected: string;
  };
}

export interface DesignSystemTypographyPresentation {
  fontFamily: string;
  stylesheetUrls: string[];
  provenance: "selector" | "token" | "fallback";
}

interface IconLibraryDefinition {
  name: string;
  prefix: string;
  defaultVariant: string;
}

/** The values `ICON_LIBRARIES` maps its keys onto. */
interface IconLibrariesTable {
  [key: string]: IconLibraryDefinition;
}

const ICON_LIBRARIES: IconLibrariesTable = {
  carbon: { name: "Carbon Icons", prefix: "carbon", defaultVariant: "default" },
  "ant-design": {
    name: "Ant Design Icons",
    prefix: "ant-design",
    defaultVariant: "outlined",
  },
  feather: { name: "Feather", prefix: "feather", defaultVariant: "default" },
  iconoir: { name: "Iconoir", prefix: "iconoir", defaultVariant: "default" },
  mingcute: { name: "MingCute", prefix: "mingcute", defaultVariant: "line" },
  ph: { name: "Phosphor", prefix: "ph", defaultVariant: "regular" },
  pixelarticons: {
    name: "Pixelarticons",
    prefix: "pixelarticons",
    defaultVariant: "default",
  },
  solar: { name: "Solar", prefix: "solar", defaultVariant: "linear" },
};

interface CatalogIconAssignment {
  id: string;
  variant: string;
}

/** Every catalog system has an intentional icon family matched to its visual style. */
/** The catalog assignment table, readable by any system id. */
interface CatalogIconAssignmentsTable {
  readonly [systemId: string]: CatalogIconAssignment;
}

/** The icon library each catalog design system ships with. */
export const CATALOG_ICON_LIBRARY_ASSIGNMENTS: CatalogIconAssignmentsTable = {
  airbnb: { id: "mingcute", variant: "line" },
  "airy-docs": { id: "feather", variant: "default" },
  apple: { id: "feather", variant: "default" },
  atelier: { id: "iconoir", variant: "default" },
  "beam-lib": { id: "feather", variant: "default" },
  broadsheet: { id: "ph", variant: "regular" },
  brutalism: { id: "pixelarticons", variant: "default" },
  carbon: { id: "carbon", variant: "default" },
  cashmere: { id: "iconoir", variant: "default" },
  cerulean: { id: "feather", variant: "default" },
  "chrome-azure": { id: "solar", variant: "bold-duotone" },
  "chrome-bronze": { id: "solar", variant: "bold-duotone" },
  "chrome-crimson": { id: "solar", variant: "bold-duotone" },
  "chrome-emerald": { id: "solar", variant: "bold-duotone" },
  "chrome-gold": { id: "solar", variant: "bold-duotone" },
  "chrome-silver": { id: "solar", variant: "bold-duotone" },
  "cinematic-dark": { id: "solar", variant: "bold-duotone" },
  clicky: { id: "mingcute", variant: "line" },
  cobalt: { id: "carbon", variant: "default" },
  cornflower: { id: "mingcute", variant: "line" },
  "corporate-fintech": { id: "ant-design", variant: "outlined" },
  "cream-editorial": { id: "ph", variant: "regular" },
  "dark-orange": { id: "ph", variant: "duotone" },
  "editorial-dark": { id: "iconoir", variant: "default" },
  "editorial-warm": { id: "iconoir", variant: "default" },
  ember: { id: "ph", variant: "duotone" },
  evergreen: { id: "ph", variant: "duotone" },
  figma: { id: "iconoir", variant: "default" },
  firefly: { id: "carbon", variant: "default" },
  "ink-mail": { id: "ph", variant: "regular" },
  folio: { id: "iconoir", variant: "default" },
  "frosted-glass": { id: "solar", variant: "linear" },
  "glassmorphic-dark": { id: "solar", variant: "bold-duotone" },
  graphite: { id: "carbon", variant: "default" },
  halo: { id: "solar", variant: "linear" },
  haptic: { id: "mingcute", variant: "line" },
  heyclicky: { id: "mingcute", variant: "line" },
  hyperline: { id: "carbon", variant: "default" },
  "inset-dark": { id: "carbon", variant: "default" },
  instrument: { id: "carbon", variant: "default" },
  interior: { id: "iconoir", variant: "default" },
  lane: { id: "iconoir", variant: "default" },
  "leather-luxe": { id: "iconoir", variant: "default" },
  "light-marketplace": { id: "mingcute", variant: "line" },
  linear: { id: "iconoir", variant: "default" },
  "linear-quality": { id: "iconoir", variant: "default" },
  loam: { id: "feather", variant: "default" },
  "lumen-dark": { id: "solar", variant: "linear" },
  marigold: { id: "ph", variant: "duotone" },
  "metal-fx-chromatic": { id: "solar", variant: "bold-duotone" },
  "metal-fx-gold": { id: "solar", variant: "bold-duotone" },
  "metal-fx-silver": { id: "solar", variant: "bold-duotone" },
  "midnight-glass": { id: "solar", variant: "bold-duotone" },
  "minimal-light": { id: "iconoir", variant: "default" },
  "monochrome-industrial": { id: "carbon", variant: "default" },
  neon: { id: "solar", variant: "bold-duotone" },
  "neon-vault": { id: "solar", variant: "bold-duotone" },
  "neutral-monochrome": { id: "feather", variant: "default" },
  notion: { id: "feather", variant: "default" },
  pebble: { id: "mingcute", variant: "line" },
  "pillow-light": { id: "ph", variant: "duotone" },
  "playful-console": { id: "ph", variant: "duotone" },
  platine: { id: "iconoir", variant: "default" },
  playdesk: { id: "mingcute", variant: "line" },
  "bevel": { id: "solar", variant: "linear" },
  "bold-retail": { id: "mingcute", variant: "line" },
  precision: { id: "iconoir", variant: "default" },
  "precision-light": { id: "iconoir", variant: "default" },
  pulse: { id: "mingcute", variant: "line" },
  putty: { id: "ph", variant: "duotone" },
  "retro-lcd": { id: "pixelarticons", variant: "default" },
  riso: { id: "pixelarticons", variant: "default" },
  romanesque: { id: "iconoir", variant: "default" },
  sienna: { id: "ph", variant: "duotone" },
  "skeuo-next": { id: "solar", variant: "bold-duotone" },
  slate: { id: "feather", variant: "default" },
  "sonic-airy": { id: "feather", variant: "default" },
  "sonic-bright": { id: "mingcute", variant: "line" },
  "sonic-glassy": { id: "solar", variant: "bold-duotone" },
  "sonic-lofi": { id: "pixelarticons", variant: "default" },
  "sonic-metallic": { id: "carbon", variant: "default" },
  "sonic-organic": { id: "ph", variant: "duotone" },
  "sonic-punchy": { id: "solar", variant: "bold-duotone" },
  "sonic-retro": { id: "pixelarticons", variant: "default" },
  "sonic-warm": { id: "ph", variant: "duotone" },
  sorbet: { id: "mingcute", variant: "line" },
  squircle: { id: "mingcute", variant: "line" },
  stripe: { id: "solar", variant: "linear" },
  supabase: { id: "carbon", variant: "default" },
  telemetry: { id: "carbon", variant: "default" },
  terminal: { id: "pixelarticons", variant: "default" },
  "tv-style": { id: "pixelarticons", variant: "default" },
  velour: { id: "iconoir", variant: "default" },
  vercel: { id: "feather", variant: "default" },
  voltage: { id: "solar", variant: "bold-duotone" },
};

const FALLBACK_FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";

function libraryDefinition(id: string): IconLibraryDefinition {
  return (
    ICON_LIBRARIES[id] ?? {
      name: id
        .split(/[-_]/)
        .filter(Boolean)
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(" "),
      prefix: id,
      defaultVariant: "default",
    }
  );
}

function detectSourceIconLibrary(sourceFiles: readonly string[]) {
  const counts = new Map<string, number>();

  for (const source of sourceFiles) {
    for (const match of source.matchAll(/["'`]([a-z][a-z0-9-]+):[a-z0-9][a-z0-9-]*/gi)) {
      const prefix = match[1]?.toLowerCase();
      if (!prefix || !ICON_LIBRARIES[prefix]) continue;
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
  }

  const iconifyPrefix = [...counts.entries()].sort(
    ([aPrefix, aCount], [bPrefix, bCount]) => bCount - aCount || aPrefix.localeCompare(bPrefix),
  )[0]?.[0];

  if (iconifyPrefix) {
    return { id: iconifyPrefix, provenance: "iconify-source" as const };
  }
  return null;
}

export function resolveDesignSystemIcons({
  id,
  iconLibraryId,
  iconLibraryName,
  iconPrefix,
  iconVariant,
  sourceFiles = [],
}: {
  id: string;
  iconLibraryId?: string | null;
  iconLibraryName?: string | null;
  iconPrefix?: string | null;
  iconVariant?: string | null;
  sourceFiles?: readonly string[];
}): DesignSystemIconPresentation {
  const catalogAssignment = CATALOG_ICON_LIBRARY_ASSIGNMENTS[id];
  const validExplicitId = iconLibraryId && ICON_LIBRARIES[iconLibraryId] ? iconLibraryId : null;
  const declaredId = catalogAssignment?.id ?? validExplicitId;
  const detected = detectSourceIconLibrary(sourceFiles);
  const resolvedId = declaredId ?? detected?.id ?? "iconoir";
  const definition = libraryDefinition(resolvedId);
  const provenance: IconLibraryProvenance = declaredId
    ? "explicit"
    : detected?.provenance ?? "fallback";

  return {
    id: resolvedId,
    name: catalogAssignment ? definition.name : iconLibraryName ?? definition.name,
    prefix: catalogAssignment ? definition.prefix : iconPrefix ?? definition.prefix,
    variant: catalogAssignment?.variant ?? iconVariant ?? definition.defaultVariant,
    provenance,
    ...(declaredId && detected && declaredId !== detected.id && { conflict: { declared: declaredId, detected: detected.id } }),
  };
}

function collectCssVariables(css: string): Map<string, string> {
  const variables = new Map<string, string>();
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2]?.trim();
    if (!name || !value) continue;
    if (value.includes(`var(${name})`) && variables.has(name)) continue;
    variables.set(name, value);
  }
  return variables;
}

function resolveCssVariables(
  value: string,
  variables: Map<string, string>,
  seen = new Set<string>(),
): string {
  return value.replace(
    /var\((--[\w-]+)(?:,\s*([^()]+))?\)/g,
    (original, name: string, fallback?: string) => {
      if (seen.has(name)) return fallback?.trim() ?? original;
      const replacement = variables.get(name);
      if (!replacement || replacement.includes(`var(${name})`)) {
        return fallback?.trim() ?? original;
      }
      const nextSeen = new Set(seen).add(name);
      return resolveCssVariables(replacement, variables, nextSeen);
    },
  );
}

function sanitizeFontFamily(value: string): string {
  const portableValue = value
    .replace(/var\(--[\w-]+\)\s*,?\s*/g, "")
    .trim();

  return portableValue || FALLBACK_FONT_STACK;
}

function fontRules(css: string): Array<{ selector: string; value: string }> {
  const rules: Array<{ selector: string; value: string }> = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1]?.trim();
    const body = match[2];
    const value = body?.match(/font-family\s*:\s*([^;}]+)/)?.[1]?.trim();
    if (selector && value && !selector.startsWith("@font-face")) {
      rules.push({ selector, value });
    }
  }
  return rules;
}

function rulePriority(selector: string): number {
  if (/\[data-ds(?:=|\^=)/.test(selector) && /(?:,|\*)/.test(selector)) return 3;
  if (/(?:^|,)\s*body(?:\s|,|$)/.test(selector)) return 2;
  if (/(?:^|,)\s*html(?:\s|,|$)/.test(selector)) return 1;
  return 0;
}

export function extractDesignSystemTypography(
  globalsCss: string,
): DesignSystemTypographyPresentation {
  const variables = collectCssVariables(globalsCss);
  const selectedRule = fontRules(globalsCss)
    .map((rule, index) => ({ ...rule, index, priority: rulePriority(rule.selector) }))
    .filter((rule) => rule.priority > 0)
    .sort((a, b) => b.priority - a.priority || b.index - a.index)[0];
  const tokenFamily = variables.get("--font-sans");
  const rawFamily = selectedRule?.value ?? tokenFamily;
  const stylesheetUrls = [...globalsCss.matchAll(/@import\s+url\(["']?(https:\/\/fonts\.googleapis\.com[^"')]+)["']?\)/g)]
    .map((match) => match[1])
    .filter((url): url is string => Boolean(url))
    // Pages on better-design.com load fonts from Bunny, which serves the same
    // css2 API without sending visitor IPs to Google. The source file keeps
    // its own URL for customers. [BD-1088]
    .map((url) => url.replace("https://fonts.googleapis.com/", "https://fonts.bunny.net/"));

  return {
    fontFamily: rawFamily
      ? sanitizeFontFamily(resolveCssVariables(rawFamily, variables))
      : FALLBACK_FONT_STACK,
    stylesheetUrls: [...new Set(stylesheetUrls)],
    provenance: selectedRule ? "selector" : tokenFamily ? "token" : "fallback",
  };
}

/**
 * Light or dark, from the first `--background` in a system's globals.css. The
 * seed stores this on the `design_systems` row, and the web catalog uses the
 * same rule so a build without the database shows the same theme. [BD-862]
 */
export function designSystemThemeFromCss(
  globalsCss: string,
): "light" | "dark" | undefined {
  const bg = globalsCss.match(/--background:\s*([^;]+);/)?.[1]?.trim();
  if (!bg) return undefined;
  const oklch = bg.match(/oklch\(\s*([\d.]+)/);
  if (oklch) return parseFloat(oklch[1]) > 0.5 ? "light" : "dark";
  const hex = bg.match(/#([0-9a-fA-F]{3,6})/);
  if (hex) {
    // #rgb and #rgba are short form; the alpha digit does not change the theme.
    const h = hex[1].length < 6
      ? hex[1].slice(0, 3).split("").map((c) => c + c).join("")
      : hex[1];
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "light" : "dark";
  }
  return undefined;
}
