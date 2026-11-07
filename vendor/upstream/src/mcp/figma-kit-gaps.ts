import { normalizeRuleName } from "../project-rules";
import type { FigmaKit, KitCounts } from "./figma-kit";
import type { KitNameMatch } from "./figma-kit-names";

/**
 * The most variant properties a set may have before an agent struggles to
 * pick the right variant. In the Matrix kit, 3 of 234 sets went past it,
 * Button among them with 4 and Table / Cell with 6. [BD-1056]
 */
export const VARIANT_PROPERTY_LIMIT = 3;

/** Why an agent cannot use a kit component yet. */
export type KitGapReason = "many-variant-properties" | "no-use-rule" | "no-match-in-code" | "name-differs-from-code";

/** One component an agent cannot use yet, and why. */
export interface KitGap {
  component: string;
  page: string;
  reason: KitGapReason;
  detail: string;
}

/** What a project holds after a kit save, with what an agent cannot use yet. */
export interface ProjectFigmaKitSaved extends KitCounts {
  gaps: KitGap[];
  /** Each set and the part it maps to. Empty when the project has no design system parts. */
  nameMap: KitNameMatch[];
}

/**
 * The kit a project keeps, as model mode reads it back [BD-1056]: the kit,
 * the project's design system, and the part each component set maps to.
 */
export interface ProjectFigmaKit {
  kit: FigmaKit;
  /** The project's design system id, or null before it has one. */
  designSystemId: string | null;
  nameMap: KitNameMatch[];
}

/**
 * Lists the component sets in a kit that an agent cannot use yet [BD-1056]:
 * sets with too many variant properties, sets that no `use` rule names, and,
 * when a name map is given, sets with no part in code and sets whose name
 * differs from their part. `ruleParts` holds the part names of the project's
 * use rules. Standalone components, such as icons, are left out: an agent
 * places them by name.
 */
export function kitGaps(
  components: FigmaKit["components"],
  ruleParts: readonly string[],
  nameMap: readonly KitNameMatch[] = [],
): KitGap[] {
  const sets = components.filter((component) => component.variants > 1);
  const covered = new Set(ruleParts.map(normalizeRuleName));
  const crowded = sets
    .filter((set) => Object.keys(set.properties).length > VARIANT_PROPERTY_LIMIT)
    .map((set): KitGap => {
      const properties = Object.keys(set.properties);
      return {
        component: set.name,
        page: set.page,
        reason: "many-variant-properties",
        detail: `${properties.length} variant properties: ${properties.join(", ")}.`,
      };
    });
  const unruled = sets
    .filter((set) => !covered.has(normalizeRuleName(set.name)))
    .map((set): KitGap => ({ component: set.name, page: set.page, reason: "no-use-rule", detail: "No use rule names this part." }));
  const setNames = new Set(sets.map((set) => set.name));
  const pageOf = new Map(sets.map((set) => [set.name, set.page]));
  const unmatched = nameMap
    .filter((entry) => setNames.has(entry.component) && entry.match !== "same")
    .map((entry): KitGap => ({
      component: entry.component,
      page: pageOf.get(entry.component) ?? "",
      reason: entry.part ? "name-differs-from-code" : "no-match-in-code",
      detail: entry.part ? `Builds as the ${entry.part} part.` : "No part in code has this name.",
    }));
  return [...crowded, ...unmatched.filter((gap) => gap.reason === "no-match-in-code"), ...unmatched.filter((gap) => gap.reason === "name-differs-from-code"), ...unruled];
}

/** Longest component name a summary line shows. */
const NAME_MAX_CHARS = 80;

/**
 * A Figma name as a quoted string of one line, at most NAME_MAX_CHARS long.
 * The quotes mark it as the file's text, not the tool's own words.
 */
const quoted = (name: string) => JSON.stringify(name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX_CHARS));

/** How many names a summary line shows before it counts the rest. */
const NAMES_SHOWN = 8;

/**
 * The gap list as the opening lines of a tool answer, so a new client reads
 * it first. Each reason gets one line, with the first names and a count of
 * the rest; the full list stays in the structured answer.
 */
export function describeKitGaps(gaps: readonly KitGap[]): string {
  if (gaps.length === 0) return "An agent can use every component set in this kit.";
  const names = (reason: KitGapReason) => {
    // A name comes from the client's Figma file, so each one is quoted and kept short. [BD-1056]
    const all = gaps.filter((gap) => gap.reason === reason).map((gap) => quoted(gap.component));
    const shown = all.slice(0, NAMES_SHOWN).join(", ");
    return { count: all.length, list: all.length > NAMES_SHOWN ? `${shown} and ${all.length - NAMES_SHOWN} more` : shown };
  };
  const crowded = names("many-variant-properties");
  const missing = names("no-match-in-code");
  const renamed = names("name-differs-from-code");
  const unruled = names("no-use-rule");
  return [
    "Before an agent builds with this kit:",
    crowded.count
      ? `- ${crowded.count} set(s) have more than ${VARIANT_PROPERTY_LIMIT} variant properties, so an agent may pick the wrong variant: ${crowded.list}.`
      : "",
    missing.count ? `- ${missing.count} set(s) have no part in code, so an agent builds them from plain layers: ${missing.list}.` : "",
    renamed.count
      ? `- ${renamed.count} set(s) build as a part with another name, so check each one: ${renamed.list}.`
      : "",
    unruled.count
      ? `- ${unruled.count} set(s) have no use rule, so an agent does not know when to use them: ${unruled.list}. Save one with set-team-rules, kind "use".`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
