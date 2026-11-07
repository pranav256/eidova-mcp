import {
  PROJECT_RULE_MAX_BYTES,
  PROJECT_RULE_NAME_MAX_CHARS,
  PROJECT_RULES_MAX_PER_PROJECT,
  TEAM_RULES_MAX_BYTES,
  projectRuleKindValues,
} from "./schema";

export { PROJECT_RULE_NAME_MAX_CHARS, PROJECT_RULES_MAX_PER_PROJECT };

/** One kind of project rule: the guidelines, a part rule, a brand-wide ban or a spec. [BD-1052] */
export type ProjectRuleKind = (typeof projectRuleKindValues)[number];

/** Where one rule lives in a project. An empty screen or part means it is not tied to one. */
export interface ProjectRuleSlot {
  kind: ProjectRuleKind;
  screen: string;
  part: string;
}

/** One saved rule or spec, with its text. */
export interface ProjectRuleEntry extends ProjectRuleSlot {
  markdown: string;
}

/**
 * What one screen needs from a project [BD-1052]: the guidelines, the rules
 * for the parts it uses, the brand-wide bans and the specs on it.
 */
export interface ProjectScreenContext {
  guidelines: string;
  /** `use`, `never` and `pairing` rules, the brand-wide bans first. */
  rules: ProjectRuleEntry[];
  /** Specs on the screen, the whole-screen ones first. */
  specs: ProjectRuleEntry[];
  /** Parts with saved rules this answer leaves out, by name only, so the agent can ask for them. */
  otherParts: string[];
  /**
   * Other screens that hold specs, by name only, so a project whose specs sit
   * elsewhere never reads as empty. A server older than BD-1056 leaves it out.
   */
  specScreens?: string[];
}

/** The kinds that describe one part or value. */
const PART_RULE_KINDS: ReadonlySet<ProjectRuleKind> = new Set(["use", "never", "pairing"]);

/**
 * A screen or part name as the store keeps it: trimmed, lower case, with runs
 * of white space made one space. "Sign up" and "sign  up" name one screen.
 */
export function normalizeRuleName(name: string | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** The slot a save asks for, or the reason it cannot be saved. */
export type SlotResult = { slot: ProjectRuleSlot } | { error: string };

/**
 * Works out which slot a save fills. Without a kind, a screen means a spec and
 * nothing at all means the guidelines; a part alone needs its kind named,
 * because use, never and pairing are three different rules.
 */
export function resolveProjectRuleSlot(input: {
  kind?: ProjectRuleKind;
  screen?: string;
  part?: string;
}): SlotResult {
  const screen = normalizeRuleName(input.screen);
  const part = normalizeRuleName(input.part);
  if (screen.length > PROJECT_RULE_NAME_MAX_CHARS || part.length > PROJECT_RULE_NAME_MAX_CHARS) {
    return { error: `A screen or part name can be ${PROJECT_RULE_NAME_MAX_CHARS} characters at most.` };
  }
  const kind = input.kind ?? (screen ? "spec" : part ? undefined : "guidelines");
  if (!kind) {
    return { error: 'Name the kind of rule for this part: "use", "never" or "pairing".' };
  }
  if (kind === "spec" && !screen) return { error: "A spec needs the screen it belongs to." };
  if (kind !== "spec" && screen) {
    return { error: 'Only a spec belongs to one screen. Drop the screen, or save it as kind "spec".' };
  }
  if (kind === "guidelines" && part) return { error: "Guidelines cover the whole project, so they take no part." };
  if ((kind === "use" || kind === "pairing") && !part) {
    return { error: `A "${kind}" rule needs the part or value it is about.` };
  }
  return { slot: { kind, screen, part } };
}

/** Largest text the slot takes, in UTF-8 bytes: the guidelines get the team rules cap. */
export function projectRuleMaxBytes(kind: ProjectRuleKind): number {
  return kind === "guidelines" ? TEAM_RULES_MAX_BYTES : PROJECT_RULE_MAX_BYTES;
}

/**
 * Picks what one screen needs from all of a project's rules [BD-1052]. Part
 * rules count when the agent named the part, or when a spec on this screen is
 * about it. Every other part comes back by name only, so the answer stays
 * small however many rules the project keeps. Without a screen there are no
 * specs.
 */
export function selectScreenContext(
  entries: readonly ProjectRuleEntry[],
  request: { screen?: string; parts?: readonly string[] },
): ProjectScreenContext {
  const screen = normalizeRuleName(request.screen);
  const specs = screen
    ? entries
        .filter((entry) => entry.kind === "spec" && entry.screen === screen)
        .sort((a, b) => a.part.localeCompare(b.part))
    : [];
  const named = (request.parts ?? []).map(normalizeRuleName).filter(Boolean);
  const wanted = new Set([...named, ...specs.map((spec) => spec.part).filter(Boolean)]);
  const partRules = entries.filter((entry) => PART_RULE_KINDS.has(entry.kind));
  const rules = partRules
    .filter((entry) => !entry.part || wanted.has(entry.part))
    .sort((a, b) => a.part.localeCompare(b.part) || a.kind.localeCompare(b.kind));
  const otherParts = [...new Set(partRules.map((entry) => entry.part))]
    .filter((part) => part && !wanted.has(part))
    .sort((a, b) => a.localeCompare(b));
  const guidelines = entries.find((entry) => entry.kind === "guidelines")?.markdown ?? "";
  const specScreens = [...new Set(entries.filter((entry) => entry.kind === "spec").map((entry) => entry.screen))]
    .filter((name) => name !== screen)
    .sort((a, b) => a.localeCompare(b));
  return { guidelines, rules, specs, otherParts, specScreens };
}
