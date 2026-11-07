// Answer "what does this change touch?" from the map: a flow's steps with the
// screen, route, components and data of each, or every flow a file belongs to.
// [BD-832] With a Main Quest it also says which initiative each flow serves,
// and checks planned work against it. [BD-1125] Planned work also lists the
// capabilities that already make it, such as a Zapier action. [BD-1239]
import { MAX_CAPABILITY_MATCHES, capabilityLine, matchCapabilities } from "./capability-match";
import { initiativeLabel, mainQuestSection, servedBy, todayIso } from "./main-quest";
import { oneLine, type FeatureMap, type FeatureMapFeature, type FeatureMapFlow, type FeatureMapStep } from "./schema";

/** What the agent asks the map about. Every field is optional. */
export interface FeatureMapQuery {
  feature?: string;
  flow?: string;
  file?: string;
  /** Routes, file paths or short names of work the agent is about to build. */
  planned?: string[];
  /** YYYY-MM-DD; decides whether the Main Quest has ended. */
  today?: string;
}

interface FlowHit {
  feature: FeatureMapFeature;
  flow: FeatureMapFlow;
}

const matches = (query: string, item: { id: string; name: string }): boolean => {
  const q = query.trim().toLowerCase();
  return item.id === q || item.name.toLowerCase().includes(q);
};

const stepFiles = (step: FeatureMapStep): string[] =>
  [step.screen, ...step.components, ...step.data].filter((f): f is string => Boolean(f));

const touchesFile = (step: FeatureMapStep, file: string): boolean => {
  const f = file.replace(/^\.\//, "");
  return step.route === f || stepFiles(step).some((p) => p === f || p.endsWith(`/${f}`));
};

const list = (items: string[]): string => (items.length ? items.map((i) => `\`${oneLine(i)}\``).join(", ") : "none");

function stepLines(step: FeatureMapStep, i: number): string[] {
  return [
    `${i + 1}. **${oneLine(step.name)}**${step.action ? `: ${oneLine(step.action)}` : ""}`,
    `   - Route: ${step.route ? `\`${oneLine(step.route)}\`` : "none (not a page)"}`,
    `   - Screen: ${step.screen ? `\`${oneLine(step.screen)}\`` : "none"}`,
    `   - Components: ${list(step.components)}`,
    `   - Data: ${list(step.data)}`,
  ];
}

function flowSection(map: FeatureMap, { feature, flow }: FlowHit): string {
  return [
    `## ${oneLine(feature.name)} › ${oneLine(flow.name)} (\`${oneLine(feature.id)}/${oneLine(flow.id)}\`)`,
    ...(flow.description ? ["", oneLine(flow.description)] : []),
    ...(map.mainQuest ? ["", `Serves: ${initiativeLabel(map, servedBy(map, feature, flow))}`] : []),
    "",
    ...flow.steps.flatMap(stepLines),
  ].join("\n");
}

/**
 * Flows one reply prints in full. Every flow can match a loose query, so this
 * keeps the reply near the size of the map it came from. [BD-832]
 */
const MAX_FLOWS_SHOWN = 50;

/** Each matched feature's own components, printed once rather than once per flow. */
function featureComponentLines(hits: FlowHit[]): string[] {
  const features = [...new Set(hits.map((h) => h.feature))].filter((f) => f.components.length > 0);
  return features.map((f) => `Components of ${oneLine(f.name)} used by no single step: ${list(f.components)}`);
}

/** Overview rows one reply prints, for the same reason as `MAX_FLOWS_SHOWN`. */
const MAX_ROWS_SHOWN = 500;

function overview(map: FeatureMap, today: string): string {
  const all = map.features.flatMap((f) => f.flows.map((fl) => ({ f, fl })));
  const rows = all.slice(0, MAX_ROWS_SHOWN).map(({ f, fl }) => {
    const cells = [f.name, fl.name, `\`${f.id}/${fl.id}\``, fl.steps.map((s) => s.name).join(" → ")];
    return `| ${cells.map((c) => oneLine(c).replace(/\|/g, "\\|")).join(" | ")} |`;
  });
  const hidden = all.length - rows.length;
  return [
    `# Feature map${map.product ? `: ${oneLine(map.product)}` : ""}`,
    "",
    `${map.features.length} features, ${all.length} flows. Ask for one with \`flow\`, \`feature\` or \`file\` to see every screen, route, component and data file it touches.`,
    "",
    "| Feature | Flow | Id | Steps |",
    "| --- | --- | --- | --- |",
    ...rows,
    ...(hidden > 0 ? ["", `${hidden} more flow(s) not listed. Ask for a feature to see them.`] : []),
    ...(map.capabilities?.length
      ? ["", `The map also lists ${map.capabilities.length} Zapier actions, API requests and MCP tools. Pass \`planned\` to see which already make a thing.`]
      : []),
    ...(map.mainQuest ? ["", mainQuestSection(map, today)] : []),
  ].join("\n");
}

type PlannedHit = { feature: FeatureMapFeature; flow?: FeatureMapFlow };

/** A planned item names a whole feature, or one of its flows by name or by a file a step touches. */
const plannedHits = (map: FeatureMap, item: string): PlannedHit[] =>
  map.features.flatMap((feature): PlannedHit[] => {
    if (matches(item, feature)) return feature.flows.length ? feature.flows.map((flow) => ({ feature, flow })) : [{ feature }];
    return feature.flows
      .filter((flow) => matches(item, flow) || flow.steps.some((s) => touchesFile(s, item)))
      .map((flow) => ({ feature, flow }));
  });

/** Flow ids one planned line names, so a loose item cannot echo the whole map. */
const MAX_PLANNED_HITS = 5;

const hitIds = (hits: PlannedHit[]): string => {
  const ids = hits.slice(0, MAX_PLANNED_HITS).map((h) => `\`${oneLine(h.feature.id)}${h.flow ? `/${oneLine(h.flow.id)}` : ""}\``);
  return `${ids.join(", ")}${hits.length > MAX_PLANNED_HITS ? ` and ${hits.length - MAX_PLANNED_HITS} more` : ""}`;
};

/** One planned item's line, whether any of it serves no initiative, and whether the map lacks it. */
type PlannedLine = { line: string; drifts: boolean; isNew: boolean };

function plannedLine(map: FeatureMap, item: string): PlannedLine {
  const label = `\`${oneLine(item)}\``;
  const hits = plannedHits(map, item);
  if (!hits.length) return { line: `- ${label} is not in the map and serves no initiative.`, drifts: true, isNew: true };
  const loose = hits.filter((h) => servedBy(map, h.feature, h.flow) === undefined);
  const served = [...new Set(hits.map((h) => servedBy(map, h.feature, h.flow)))].filter((id) => id !== undefined);
  if (!served.length) return { line: `- ${label} is in the map (${hitIds(hits)}) but serves no initiative.`, drifts: true, isNew: false };
  const serves = `- ${label} serves ${served.map((id) => initiativeLabel(map, id)).join(" and ")}`;
  if (!loose.length) return { line: `${serves}.`, drifts: false, isNew: false };
  const n = loose.length;
  return { line: `${serves}, but ${n} other matching ${n === 1 ? "part serves" : "parts serve"} no initiative (${hitIds(loose)}).`, drifts: true, isNew: false };
}

/** The capabilities that already make a planned item, so the agent says so instead of building it again. */
function existingSection(map: FeatureMap, planned: string[]): string[] {
  const hits = [...new Set(planned.flatMap((item) => matchCapabilities(map.capabilities ?? [], item)))];
  if (!hits.length) return [];
  return [
    "# The product already has this",
    "",
    ...hits.slice(0, MAX_CAPABILITY_MATCHES).map((c) => `- ${capabilityLine(c)}`),
    "",
    "Tell the user which one does the job before you offer to build it.",
    "",
  ];
}

/** Check each planned item against the capabilities and the Main Quest before the agent builds it. */
function plannedCheck(map: FeatureMap, planned: string[], today: string): string {
  return [...existingSection(map, planned), questCheck(map, planned, today)].join("\n");
}

function questCheck(map: FeatureMap, planned: string[], today: string): string {
  if (!map.mainQuest) {
    return '# No Main Quest is set\n\nAsk the user what this period is about, then call update-feature-map with op "set-main-quest" and up to 3 initiatives. Check the planned work after that.';
  }
  const results = planned.map((item) => plannedLine(map, item));
  const advice = [
    'Before you build, tell the user which items serve no initiative. Ask whether to build each anyway, link it to an initiative or Foundation with op "set-initiative", or drop it.',
    ...(results.some((r) => r.isNew)
      ? ['An item not in the map needs op "add-feature" or "set-flow" first, then op "set-initiative".']
      : []),
  ];
  return [
    `# Planned work against the Main Quest: ${oneLine(map.mainQuest.goal)}`,
    "",
    ...results.map((r) => r.line),
    "",
    ...(results.some((r) => r.drifts) ? advice : ["Every planned item serves the Main Quest. Go ahead."]),
    ...(map.mainQuest.ends < today ? ["", `This Main Quest ended on ${map.mainQuest.ends}. Ask the user for the next one.`] : []),
  ].join("\n");
}

const CHANGE_CHECKLIST = `## Before you change code

1. Name the flows above that the change touches, and for each step say whether you add, modify, delete or leave it.
2. Edit only the files those steps list, plus new files you add for them.
3. After the change, call \`update-feature-map\` once per feature or flow you added, renamed or removed, or whose steps changed, and write the result back to the map file.`;

/** Render the part of the map that answers `query`, as Markdown for the agent. */
export function readFeatureMap(map: FeatureMap, query: FeatureMapQuery = {}): string {
  const { feature, flow, file, planned, today = todayIso() } = query;
  if (planned?.length) return plannedCheck(map, planned, today);
  if (!feature && !flow && !file) return overview(map, today);

  const hits: FlowHit[] = [];
  for (const f of map.features) {
    if (feature && !matches(feature, f)) continue;
    for (const fl of f.flows) {
      if (flow && !matches(flow, fl)) continue;
      if (file && !fl.steps.some((s) => touchesFile(s, file)) && !f.components.includes(file)) continue;
      hits.push({ feature: f, flow: fl });
    }
  }

  const asked = oneLine(
    [feature && `feature "${feature}"`, flow && `flow "${flow}"`, file && `file \`${file}\``].filter(Boolean).join(", "),
  );
  if (hits.length === 0) {
    return `# No flow matches ${asked}\n\nThe map may be out of date. Call read-feature-map with no query to list every flow, or update-feature-map to add the missing one.`;
  }
  const shown = hits.slice(0, MAX_FLOWS_SHOWN);
  const hidden = hits.length - shown.length;
  return [
    `# Flows for ${asked}`,
    "",
    ...shown.map((hit) => flowSection(map, hit)).flatMap((s) => [s, ""]),
    ...featureComponentLines(shown).flatMap((line) => [line, ""]),
    ...(hidden > 0 ? [`${hidden} more flow(s) match. Narrow the query to see them.`, ""] : []),
    CHANGE_CHECKLIST,
  ].join("\n");
}
