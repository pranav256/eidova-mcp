/**
 * Component rule files (`docs/components/<component>.md`): what each one may
 * hold, and how the kit shows it to an agent. [BD-1124]
 */

/** The six parts a component rule file may hold, in the order it holds them. */
export const COMPONENT_RULE_PARTS = [
  "Use it when",
  "Use another component instead when",
  "Never",
  "Do not combine with",
  "Edge cases",
  "Handoff checklist",
] as const;

type ComponentRulePart = (typeof COMPONENT_RULE_PARTS)[number];

const TRUST_LEVELS = ["tested with people", "standard", "not yet tested"] as const;

/** How far a rule can be trusted; only a rule tested with people or taken from a standard may block review. */
export type ComponentRuleTrust = (typeof TRUST_LEVELS)[number];

/** One rule line and the source line under it. */
export interface ComponentRule {
  part: ComponentRulePart;
  text: string;
  /** A doc path with its section anchor, a lint rule id, a standard, or `proposed`. */
  source: string;
  /** The review check that finds a break of this rule in source code. */
  check: string | null;
  trust: ComponentRuleTrust;
}

/** The rules a file holds, and every way it breaks the format. */
export interface ParsedComponentRules {
  rules: ComponentRule[];
  problems: string[];
}

const FILLER = [
  "when appropriate",
  "consider using",
  "as needed",
  "if necessary",
  "where possible",
  "best practice",
];

const STANDARD_SOURCE = /^(WCAG \d|WAI-ARIA|Apple HIG|Material Design)/;

function parseMeta(line: string) {
  const fields = new Map<string, string>();
  for (const field of line.trim().split(" · ")) {
    const colon = field.indexOf(": ");
    if (colon > 0) fields.set(field.slice(0, colon), field.slice(colon + 2).trim());
  }
  return fields;
}

function ruleProblems(rule: ComponentRule): string[] {
  const problems: string[] = [];
  const label = `"${rule.text}"`;
  if (!rule.source) problems.push(`${label} has an empty source`);
  const lower = rule.text.toLowerCase();
  for (const phrase of FILLER) {
    if (lower.includes(phrase)) problems.push(`${label} says "${phrase}", which names no condition`);
  }
  if (rule.part === "Use another component instead when" && !/^[a-z][a-z -]*: \S/.test(rule.text)) {
    problems.push(`${label} must start with the other component's name and a colon`);
  }
  if (rule.trust === "standard" && !STANDARD_SOURCE.test(rule.source)) {
    problems.push(`${label} is marked standard, but its source "${rule.source}" is not a standard`);
  }
  if (rule.source === "proposed" && rule.trust !== "not yet tested") {
    problems.push(`${label} has no source yet, so it stays "not yet tested"`);
  }
  if (rule.check !== null && !/^component\/[a-z-]+\/[a-z-]+$/.test(rule.check)) {
    problems.push(`${label} names the check "${rule.check}", which is not a component check id`);
  }
  return problems;
}

/**
 * Reads a rule file's body and reports every break of the format: a heading
 * outside the six parts or out of order, an empty part, a rule with no source
 * line, an unknown trust level, or a phrase that names no condition.
 */
export function parseComponentRules(markdown: string): ParsedComponentRules {
  const body = markdown.startsWith("---\n")
    ? markdown.slice(markdown.indexOf("\n---", 4) + 4)
    : markdown;
  const rules: ComponentRule[] = [];
  const problems: string[] = [];
  let lastPartIndex = -1;
  let part: ComponentRulePart | null = null;
  let pending: string | null = null;

  const closePart = () => {
    if (part && !rules.some((rule) => rule.part === part)) {
      problems.push(`"${part}" is empty; leave a part out rather than fill it`);
    }
  };

  for (const line of body.split("\n")) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      if (pending) problems.push(`"${pending}" has no source line under it`);
      pending = null;
      closePart();
      const name = heading[1].trim();
      const index = COMPONENT_RULE_PARTS.findIndex((entry) => entry === name);
      if (index === -1) {
        problems.push(`"${name}" is not one of the six parts`);
        part = null;
      } else if (index <= lastPartIndex) {
        problems.push(`"${name}" is out of order or repeated`);
        part = null;
      } else {
        part = COMPONENT_RULE_PARTS[index];
        lastPartIndex = index;
      }
      continue;
    }

    const bullet = /^- (?:\[ \] )?(.+)$/.exec(line);
    if (bullet && part) {
      if (pending) problems.push(`"${pending}" has no source line under it`);
      pending = bullet[1].trim();
      continue;
    }

    if (/^\s+source: /.test(line) && pending && part) {
      const meta = parseMeta(line);
      const trust = TRUST_LEVELS.find((level) => level === meta.get("trust"));
      if (!trust) {
        problems.push(`"${pending}" has trust "${meta.get("trust") ?? ""}"; use ${TRUST_LEVELS.join(", ")}`);
      } else {
        const rule: ComponentRule = {
          part,
          text: pending,
          source: meta.get("source") ?? "",
          check: meta.get("check") ?? null,
          trust,
        };
        problems.push(...ruleProblems(rule));
        rules.push(rule);
      }
      pending = null;
    }
  }
  if (pending) problems.push(`"${pending}" has no source line under it`);
  closePart();

  return { rules, problems };
}

/**
 * The rules section the kit appends after a component's source. It keeps the
 * file's own wording, drops the title, and says once what the trust levels
 * mean so the agent reports an untested rule as untested.
 */
export function formatComponentRulesForKit(componentName: string, content: string): string {
  const body = content.replace(/^#\s+.+\n+/, "").replace(/^## /gm, "#### ");
  return [
    `### Rules for ${componentName}`,
    "",
    "Follow these when you choose or place this component. Each rule ends with its source and trust level. When you follow a rule marked `not yet tested`, tell the person it has not been tested with people yet.",
    "",
    body.trim(),
  ].join("\n");
}

/** A rule file as the principle list returns it. */
export interface ComponentRuleTopic {
  topic?: string | null;
  aliases?: string[];
}

function componentKey(name: string): string {
  // "Radio Group", "radio_group", "RadioGroup" and "radio-group" are one part.
  return name.trim().replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().replace(/[\s_]+/g, "-");
}

/**
 * The rule file topic each name maps to, matched on the topic or an alias,
 * so a team part called "Modal" meets the dialog rules. Names with no rule
 * file are left out, and two names for one file return it once.
 */
export function matchComponentRuleTopics(names: readonly string[], files: readonly ComponentRuleTopic[]): string[] {
  const byKey = new Map<string, string>();
  for (const file of files) {
    if (!file.topic) continue;
    for (const name of [file.topic, ...(file.aliases ?? [])]) byKey.set(componentKey(name), file.topic);
  }
  return [...new Set(names.flatMap((name) => byKey.get(componentKey(name)) ?? []))];
}

const SHORT_FORM_PARTS: ReadonlySet<ComponentRulePart> = new Set([
  "Use another component instead when",
  "Never",
  "Do not combine with",
]);

/**
 * The few lines a rules file carries for one component: when to switch to
 * another one, what never to do, and what not to combine it with. The full
 * file, with sources, stays one MCP call away.
 */
export function shortComponentRules(content: string): string[] {
  return parseComponentRules(content).rules
    .filter((rule) => SHORT_FORM_PARTS.has(rule.part))
    .map((rule) => rule.part === "Use another component instead when" ? `Use ${rule.text}` : rule.text);
}
