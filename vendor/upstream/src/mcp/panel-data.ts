// The data the ChatGPT design panel shows beside the catalog: the checks the
// agent ran lately, read back from the call archive, and the person's own
// generated design systems.
import { z } from "zod";
import { iconPackPath, MODIFY_COLOR_KEYS } from "../design-config-options";
import { isRecordLike, isString, type JsonObject, type JsonValue } from "../guards";
import type { DesignConfig, Project } from "../schema";
import { SPACING_FINDING_COPY } from "../inspection/finding-copy";
import { stripComments } from "./preview-html";

/** The check tools whose results the Review tab shows. */
export const PANEL_CHECK_TOOLS = ["check-comprehension", "inspect-spacing"] as const;

/** A check tool the Review tab shows. */
export type PanelCheckTool = (typeof PANEL_CHECK_TOOLS)[number];

/** One problem a check found, as the Review tab lists it. */
export interface CheckFinding {
  severity: string;
  problem: string;
  fix: string;
  /** The screen widths it showed at, in px, smallest first. Empty when the check did not say. */
  widths: number[];
}

/** One check the agent ran, as the Review tab shows it. */
export interface CheckRun {
  tool: PanelCheckTool;
  /** When the call started, as an ISO timestamp. */
  ranAt: string;
  /** What the check looked at: the screen name the agent gave, or the page's title. Null when the call named neither. */
  subject: string | null;
  findingCount: number;
  /** The most severe findings first, at most MAX_FINDINGS of them. */
  findings: CheckFinding[];
}

/** A project color the Modify controls show. */
export type ModifyColor = (typeof MODIFY_COLOR_KEYS)[number];

/** The values a project's Modify controls start from: the saved edit, else the generated theme's own. */
export type ModifyValues = { [color in ModifyColor]: string | null } & {
  radius: string | null;
  fontSans: string | null;
  fontMono: string | null;
  iconLibrary: string | null;
};

/** One design system the person generated, as the Design system tab lists it. */
export interface ProjectCard {
  id: string;
  /** The opening of the person's own prompt, because project names are random words. */
  title: string;
  /** The catalog system it was built on, when there is one. */
  baseId: string | null;
  /** When the person started it, as an ISO timestamp. */
  createdAt: string;
  /** Starting, generating, ready or failed, from the project's design system status. */
  status: "starting" | "generating" | "ready" | "failed";
  /** The newest version, whose public preview page the panel shows. Null before generation writes one. */
  fragmentId: string | null;
  values: ModifyValues;
  /** The public file that lists the project's icons, under the web app's origin, or null without an icon library. */
  iconPack: string | null;
}

const MAX_FINDINGS = 5;
const SEVERITY_ORDER = ["critical", "serious", "moderate", "minor"];

function isJsonObject(value: JsonValue): value is JsonObject {
  return isRecordLike(value);
}

function isPanelCheckTool(tool: string): tool is PanelCheckTool {
  return PANEL_CHECK_TOOLS.some((name) => name === tool);
}

// What a spacing result says about each captured state, by state name: its
// width, and the name a person reads for each element.
interface StateFacts {
  width: number;
  names: Map<string, string>;
}

// The part of an archived spacing result's states the panel reads.
const resultStateSchema = z.object({
  name: z.string(),
  viewport: z.object({ width: z.number() }),
  elements: z.array(z.object({ id: z.string(), name: z.string().optional(), label: z.string().optional() })).default([]),
});

function resultStates(content: JsonObject): Map<string, StateFacts> {
  const facts = new Map<string, StateFacts>();
  for (const raw of Array.isArray(content.states) ? content.states : []) {
    const state = resultStateSchema.safeParse(raw);
    if (!state.success) continue;
    const names = new Map<string, string>();
    for (const element of state.data.elements) {
      const name = element.name ?? element.label;
      if (name) names.set(element.id, name);
    }
    facts.set(state.data.name, { width: Math.round(state.data.viewport.width), names });
  }
  return facts;
}

// A spacing finding reads the way the tool's own summary and report put it:
// its plain title and the element it is about, such as "Gaps between items are
// uneven: the list holding “Starter” and “Team”". Anything else keeps the
// problem and fix the tool wrote.
function readFinding(value: JsonValue, states: Map<string, StateFacts>): CheckFinding | null {
  if (!isJsonObject(value)) return null;
  // check-comprehension names the fault `problem`; inspect-spacing names it `message`.
  const problem = isString(value.problem) ? value.problem : isString(value.message) ? value.message : null;
  if (!problem) return null;
  const facts = isString(value.state) ? states.get(value.state) : undefined;
  const copy = isString(value.ruleId) ? SPACING_FINDING_COPY[value.ruleId] : undefined;
  const ids = Array.isArray(value.elementIds) ? value.elementIds.filter(isString) : [];
  const target = ids[copy?.primaryElementIndex ?? 0] ?? ids[0];
  const where = target ? facts?.names.get(target) : undefined;
  return {
    severity: isString(value.severity) ? value.severity : "moderate",
    problem: copy && where ? `${copy.title}: ${where}.` : problem,
    fix: copy ? copy.fix : isString(value.fix) ? value.fix : "",
    widths: facts ? [facts.width] : [],
  };
}

// inspect-spacing reports one finding per width, so the same problem at three
// widths reads as three problems. One entry per problem keeps its widths.
function mergeAcrossWidths(findings: CheckFinding[]): CheckFinding[] {
  const merged = new Map<string, CheckFinding>();
  for (const finding of findings) {
    const key = `${finding.problem}\n${finding.fix}`;
    const seen = merged.get(key);
    if (!seen) { merged.set(key, finding); continue; }
    seen.widths = [...new Set([...seen.widths, ...finding.widths])].sort((a, b) => a - b);
    if (bySeverity(finding, seen) < 0) seen.severity = finding.severity;
  }
  return [...merged.values()];
}

const SUBJECT_LENGTH = 80;

// The copy check takes a screen name; a spacing capture records the page title.
function checkSubject(tool: PanelCheckTool, args: JsonObject): string | null {
  const states = Array.isArray(args.states) ? args.states.filter(isJsonObject) : [];
  const name = tool === "check-comprehension" ? args.screen : states.map((state) => state.title).find(isString);
  return isString(name) ? name.replace(/\s+/g, " ").trim().slice(0, SUBJECT_LENGTH) || null : null;
}

function bySeverity(a: CheckFinding, b: CheckFinding): number {
  const rank = (s: string) => (SEVERITY_ORDER.includes(s) ? SEVERITY_ORDER.indexOf(s) : SEVERITY_ORDER.length);
  return rank(a.severity) - rank(b.severity);
}

/**
 * Reads one archived call record into a check run. Returns null for a tool
 * the panel does not show, an errored call, and a spacing call that only
 * asked for the capture script, since that call measured nothing.
 */
export function toCheckRun(record: JsonValue): CheckRun | null {
  if (!isJsonObject(record) || !isString(record.tool) || !isString(record.created_at)) return null;
  if (!isPanelCheckTool(record.tool)) return null;
  const result = record.result;
  if (!isJsonObject(result) || result.isError === true) return null;
  const content = result.structuredContent;
  if (!isJsonObject(content)) return null;
  if (record.tool === "inspect-spacing" && content.status !== "completed") return null;
  if (record.tool === "check-comprehension" && content.verdict === "no-copy") return null;
  const args = isJsonObject(record.arguments) ? record.arguments : {};
  const states = resultStates(content);
  const all = mergeAcrossWidths(
    Array.isArray(content.findings) ? content.findings.flatMap((f) => readFinding(f, states) ?? []) : [],
  );
  return {
    tool: record.tool,
    ranAt: record.created_at,
    subject: checkSubject(record.tool, args),
    findingCount: all.length,
    findings: all.sort(bySeverity).slice(0, MAX_FINDINGS),
  };
}

const STATUS = {
  PENDING: "starting",
  SELECTED: "starting",
  GENERATING: "generating",
  COMPLETED: "ready",
  ERROR: "failed",
} as const satisfies Record<DesignSystemStatus, ProjectCard["status"]>;

/** The project columns a card needs, plus the first message the person sent and its newest version. */
export type ProjectRow = Pick<
  Project,
  "id" | "name" | "designSystemStatus" | "designSystemId" | "createdAt" | "iconLibraryId" | "iconVariant"
> & {
  firstPrompt: string | null;
  /** The newest version's id, or null before generation writes one. */
  fragmentId: string | null;
  /** The newest version's globals.css, or null before generation writes one. */
  globalsCss: string | null;
  /** Token edits saved with the Modify controls or set-design-config, or null when there are none. */
  config: DesignConfig | null;
};

const TITLE_LENGTH = 60;

// The first sentence of the prompt, cut at a word near TITLE_LENGTH characters.
function promptTitle(prompt: string | null): string | null {
  // Drop markdown markers without leaving a gap, then fold whitespace.
  const text = (prompt ?? "").replace(/[*_#`>]+/g, "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  if (sentence.length <= TITLE_LENGTH) return sentence.replace(/[.,;:]$/, "");
  const cut = sentence.slice(0, TITLE_LENGTH);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 20 ? cut.lastIndexOf(" ") : TITLE_LENGTH).replace(/[.,;:]$/, "")}\u2026`;
}

type DesignSystemStatus = NonNullable<ProjectRow["designSystemStatus"]>;

// The light token block a generated globals.css writes under :root, by token name.
function rootTokens(globalsCss: string | null) {
  const block = /:root\s*\{([^}]*)\}/.exec(stripComments(globalsCss ?? ""))?.[1] ?? "";
  return new Map(Array.from(block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi), ([, name, value]) => [name, value.trim()]));
}

// The first family of a font stack, or null when the stack only names a variable.
function firstFamily(stack: string | undefined): string | null {
  const first = stack?.split(",")[0]?.replace(/["']/g, "").trim();
  return first && !first.startsWith("var(") ? first : null;
}

function modifyValues(row: ProjectRow): ModifyValues {
  const root = rootTokens(row.globalsCss);
  const saved = row.config;
  const color = (key: ModifyColor) => saved?.colors?.[key] ?? root.get(`--${key}`) ?? null;
  return {
    primary: color("primary"),
    secondary: color("secondary"),
    accent: color("accent"),
    background: color("background"),
    foreground: color("foreground"),
    destructive: color("destructive"),
    radius: saved?.radius ?? root.get("--radius") ?? null,
    fontSans: saved?.font?.sans ?? firstFamily(root.get("--font-sans")),
    fontMono: saved?.font?.mono ?? firstFamily(root.get("--font-mono")),
    iconLibrary: saved?.icons?.libraryId ?? row.iconLibraryId,
  };
}

/** Maps a project row to its card. A project with no status yet counts as starting. */
export function toProjectCard(row: ProjectRow): ProjectCard {
  return {
    id: row.id,
    title: promptTitle(row.firstPrompt) ?? row.name,
    baseId: row.designSystemId,
    createdAt: row.createdAt.toISOString(),
    status: STATUS[row.designSystemStatus ?? "PENDING"],
    fragmentId: row.fragmentId,
    values: modifyValues(row),
    iconPack: row.iconLibraryId ? iconPackPath(row.iconLibraryId, row.iconVariant) : null,
  };
}
