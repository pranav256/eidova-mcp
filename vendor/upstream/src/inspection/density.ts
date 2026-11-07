/**
 * Layout density: one value per layout role, written in steps of the design
 * system's spacing unit. The kit writes the values as CSS variables, the
 * spacing principle prints the table, and inspect-spacing checks a rendered
 * page against it. [BD-1230]
 */
import { z } from "zod";

/** The three densities a design system can default to. */
export const DENSITY_MODES = ["compact", "comfortable", "spacious"] as const;

/** One density mode. */
export type DensityMode = (typeof DENSITY_MODES)[number];

/** The layout roles a density sets. */
export const LAYOUT_ROLES = ["sidebarWidth", "pageInset", "sectionGap", "columnGap", "cardPadding"] as const;

/** One layout role. */
export type LayoutRole = (typeof LAYOUT_ROLES)[number];

/**
 * Each role's value in spacing-unit steps. The section gap stays at least twice
 * the column gap in every mode, so sections read as separate groups and the
 * columns inside a section read as one. Comfortable and spacious share the
 * column gap on purpose: spacious calms the sections, not the rows.
 */
export const DENSITY_STEPS = {
  compact: { sidebarWidth: 46, pageInset: 4, sectionGap: 6, columnGap: 3, cardPadding: 4 },
  comfortable: { sidebarWidth: 56, pageInset: 6, sectionGap: 8, columnGap: 4, cardPadding: 5 },
  spacious: { sidebarWidth: 62, pageInset: 10, sectionGap: 12, columnGap: 4, cardPadding: 6 },
} satisfies Record<DensityMode, Record<LayoutRole, number>>;

/** What a person calls each role in a report. */
export const ROLE_LABELS = {
  sidebarWidth: "Sidebar width",
  pageInset: "Page inset",
  sectionGap: "Section gap",
  columnGap: "Column gap",
  cardPadding: "Card padding",
} satisfies Record<LayoutRole, string>;

/** The CSS variable the kit writes for each role. */
export const ROLE_CSS_VARS = {
  sidebarWidth: "--layout-sidebar",
  pageInset: "--layout-inset",
  sectionGap: "--layout-section-gap",
  columnGap: "--layout-column-gap",
  cardPadding: "--layout-card-padding",
} satisfies Record<LayoutRole, string>;

/** The CSS variable that names the page's density, read back by the spacing capture. */
export const DENSITY_CSS_VAR = "--layout-density";

/** The CSS variable that says where the page's density came from: `project` or `design-system`. */
export const DENSITY_SOURCE_CSS_VAR = "--layout-density-source";

/** The spacing unit in rem when a design system declares none: Tailwind's `--spacing`. */
export const DEFAULT_SPACING_UNIT_REM = 0.25;

/** Where a declared density came from. */
export type DeclaredDensitySource = "project" | "design-system";

/** Measured or expected pixels per layout role. A role a page does not have stays absent. */
export interface LayoutRoleValues {
  sidebarWidth?: number;
  pageInset?: number;
  sectionGap?: number;
  columnGap?: number;
  cardPadding?: number;
}

/** A density and where it came from. */
export interface ResolvedDensity {
  mode: DensityMode;
  source: DeclaredDensitySource;
}

const densitySchema = z.enum(DENSITY_MODES);

/** Reads a density from a CSS value or a stored string, ignoring case and spaces. */
export function parseDensity(value: string | undefined): DensityMode | undefined {
  const parsed = densitySchema.safeParse(value?.trim().toLowerCase());
  return parsed.success ? parsed.data : undefined;
}

/** A role's value in rem, at the default 0.25rem unit. */
export function roleRem(mode: DensityMode, role: LayoutRole): number {
  return DENSITY_STEPS[mode][role] * DEFAULT_SPACING_UNIT_REM;
}

/**
 * The CSS declarations for one density, ready for a `:root` block. Each value
 * multiplies the system's own `--spacing`, so a system with a larger unit gets
 * larger gaps; the fallback is the 0.25rem default.
 */
export function densityDeclarations(mode: DensityMode, source: DeclaredDensitySource): string[] {
  return [
    `${DENSITY_CSS_VAR}: ${mode};`,
    `${DENSITY_SOURCE_CSS_VAR}: ${source};`,
    ...LAYOUT_ROLES.map((role) =>
      `${ROLE_CSS_VARS[role]}: calc(var(--spacing, ${DEFAULT_SPACING_UNIT_REM}rem) * ${DENSITY_STEPS[mode][role]});`),
  ];
}

/** The density as a standalone `:root` rule. */
export function densityCss(mode: DensityMode, source: DeclaredDensitySource): string {
  return `:root {\n${densityDeclarations(mode, source).map((line) => `  ${line}`).join("\n")}\n}\n`;
}

const COMPACT_WORDS = /\b(technical|(?:data|grid)?[- ]?dense|compact|developer(?:[- ](?:tools?|focused|friendly))?|dev[- ]?tools?|terminal|keyboard[- ]driven|engineering|utilitarian|power[- ]users?|spreadsheet|data[- ](?:heavy|driven)|instrument)\b/gi;
const SPACIOUS_WORDS = /\b(soft|editorial|airy|spacious|calm|luxur(?:y|ious)|serene|gentle|magazine|elegant|generous|quiet|content[- ]first|breathing room)\b/gi;

/**
 * Picks a density from brand words. Technical or dense words pick compact,
 * soft or editorial words pick spacious, and anything else picks comfortable.
 * When both kinds appear, the kind with more words wins, then the one named first.
 */
export function densityFromBrandWords(text: string): DensityMode {
  const compact = [...text.matchAll(COMPACT_WORDS)];
  const spacious = [...text.matchAll(SPACIOUS_WORDS)];
  if (!compact.length && !spacious.length) return "comfortable";
  if (compact.length !== spacious.length) return compact.length > spacious.length ? "compact" : "spacious";
  return (compact[0].index ?? 0) <= (spacious[0].index ?? 0) ? "compact" : "spacious";
}

/**
 * The mode whose values sit closest to the measured ones, in relative terms so
 * the sidebar does not outweigh the card padding. Ties go to comfortable, the
 * middle mode. Returns undefined when nothing was measured.
 */
export function closestDensity(
  measured: LayoutRoleValues,
  unitPx = 16 * DEFAULT_SPACING_UNIT_REM,
): DensityMode | undefined {
  const roles = LAYOUT_ROLES.filter((role) => {
    const value = measured[role];
    return value !== undefined && Number.isFinite(value) && value > 0;
  });
  if (!roles.length) return undefined;
  const distance = (mode: DensityMode) => roles.reduce((sum, role) => {
    const expected = DENSITY_STEPS[mode][role] * unitPx;
    return sum + Math.abs((measured[role] ?? 0) - expected) / expected;
  }, 0);
  const order: DensityMode[] = ["comfortable", "compact", "spacious"];
  return order.reduce((best, mode) => (distance(mode) < distance(best) ? mode : best));
}

/** The density a token sheet declares through `--layout-density`, if any. */
export function densityFromCss(css: string): DensityMode | undefined {
  return parseDensity(/--layout-density\s*:\s*([a-z]+)/i.exec(css)?.[1]);
}

/**
 * The kit's one line on density, so the agent builds the first screen with the
 * role variables. Empty when the sheet declares no density.
 */
export function densityKitNote(css: string): string {
  const mode = densityFromCss(css);
  if (!mode) return "";
  const roles = LAYOUT_ROLES.map((role) => `\`var(${ROLE_CSS_VARS[role]})\` for ${ROLE_LABELS[role].toLowerCase()} (${roleRem(mode, role)}rem)`);
  return `**Layout density:** ${mode}. Use ${roles.slice(0, -1).join(", ")} and ${roles.at(-1)}. inspect-spacing checks the page against this density.`;
}

/**
 * A generated project's density: the design config's override, else the
 * density its brand sheet measured on a live site, else the mode its brand
 * words pick. The source tells inspect-spacing which one it read.
 */
export function resolveProjectDensity(
  configured: DensityMode | undefined,
  brandWords: string,
  brandCss = "",
): ResolvedDensity {
  if (configured) return { mode: configured, source: "project" };
  return { mode: densityFromCss(brandCss) ?? densityFromBrandWords(brandWords), source: "design-system" };
}
