// The Main Quest in the feature map: the changes that set and end it, and the
// one-screen plan that read-feature-map prints. The tool refuses a plan that
// grows past what one person can hold in their head, and flags work that
// serves no initiative. [BD-1125]
import { z } from "zod";
import {
  DATE,
  findByRef,
  FOUNDATION,
  MAIN_QUEST_LIMITS,
  NAME,
  OUTCOME,
  oneLine,
  slugify,
  type FeatureMap,
  type FeatureMapFeature,
  type FeatureMapFlow,
  type MainQuest,
  type MainQuestInitiative,
} from "./schema";

const INITIATIVE_INPUT = z.object({ name: NAME, outcome: OUTCOME });

/** The `update-feature-map` changes that edit the Main Quest or link work to it. */
export const mainQuestChangeSchemas = [
  z.object({
    op: z.literal("set-main-quest"),
    goal: z.string().trim().min(1).max(200),
    ends: DATE,
    starts: DATE.optional(),
    initiatives: z.array(INITIATIVE_INPUT).optional(),
  }),
  z.object({ op: z.literal("end-main-quest") }),
  z.object({ op: z.literal("add-initiative"), name: NAME, outcome: OUTCOME }),
  z.object({ op: z.literal("remove-initiative"), initiative: NAME }),
  z.object({
    op: z.literal("set-initiative"),
    feature: NAME,
    flow: NAME.optional(),
    initiative: NAME.nullable().describe(`An initiative id or name, "${FOUNDATION}", or null to remove the link.`),
  }),
] as const;

type MainQuestChange = z.infer<(typeof mainQuestChangeSchemas)[number]>;
type Result = { map: FeatureMap; summary: string } | { error: string };

/**
 * Today as YYYY-MM-DD in the last time zone to reach it (UTC-12), so a user
 * anywhere can still pick their own today and a Main Quest stays open until
 * its end date is over everywhere.
 */
export const todayIso = (): string => new Date(Date.now() - 12 * 3_600_000).toISOString().slice(0, 10);

const words = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

function initiativeError(initiatives: { name: string; outcome: string }[]): string | undefined {
  if (initiatives.length > MAIN_QUEST_LIMITS.initiatives) {
    return `A Main Quest takes at most ${MAIN_QUEST_LIMITS.initiatives} initiatives, so one person can hold the whole plan. Ask the user which ones matter most.`;
  }
  const ids = initiatives.map((i) => slugify(i.name));
  if (ids.includes(FOUNDATION)) return `"${FOUNDATION}" is the built-in bucket for upkeep. Name the initiative something else.`;
  const clash = ids.find((id, i) => ids.indexOf(id) !== i);
  if (clash) return `Two initiatives get the same id "${clash}". Give each a name with its own Latin letters or numbers.`;
  const long = initiatives.find((i) => words(i.outcome) > MAIN_QUEST_LIMITS.outcomeWords);
  if (long) {
    return `The outcome of "${long.name}" has ${words(long.outcome)} words. Keep it to ${MAIN_QUEST_LIMITS.outcomeWords}: one sentence that is true when it is done.`;
  }
  return undefined;
}

const toInitiative = (i: { name: string; outcome: string }): MainQuestInitiative => ({ id: slugify(i.name), ...i });

const findInitiative = (quest: MainQuest | undefined, ref: string): MainQuestInitiative | undefined =>
  quest && findByRef(quest.initiatives, ref);

/** Drop every link to an initiative the Main Quest no longer has. Foundation links stay. */
function pruneLinks(features: FeatureMapFeature[], quest: MainQuest | undefined): void {
  const keep = (id: string | undefined) => id === FOUNDATION || Boolean(quest?.initiatives.some((i) => i.id === id));
  for (const feature of features) {
    if (!keep(feature.initiative)) delete feature.initiative;
    for (const flow of feature.flows) if (!keep(flow.initiative)) delete flow.initiative;
  }
}

function setMainQuest(map: FeatureMap, change: Extract<MainQuestChange, { op: "set-main-quest" }>, today: string): Result {
  if (map.mainQuest && map.mainQuest.ends >= today) {
    return { error: `The Main Quest "${oneLine(map.mainQuest.goal)}" is open until ${map.mainQuest.ends}. Only one runs at a time: end it with op "end-main-quest" first, then set the next one.` };
  }
  if (words(change.goal) > MAIN_QUEST_LIMITS.goalWords) {
    return { error: `The goal has ${words(change.goal)} words. Keep it to ${MAIN_QUEST_LIMITS.goalWords}, such as "This quarter is about team planning".` };
  }
  if (change.ends < today) return { error: `The end date ${change.ends} has passed. Pick ${today} or later.` };
  if (change.starts && change.starts > change.ends) return { error: "The start date comes after the end date." };
  const initiatives = change.initiatives ?? [];
  const problem = initiativeError(initiatives);
  if (problem) return { error: problem };

  const quest: MainQuest = { goal: change.goal, ends: change.ends, initiatives: initiatives.map(toInitiative) };
  if (change.starts) quest.starts = change.starts;
  // A new Main Quest starts clean, the same as after end-main-quest: only Foundation links stay.
  const features = structuredClone(map.features);
  pruneLinks(features, undefined);
  const n = quest.initiatives.length;
  const count = n === 0 ? "no initiatives yet" : `${n} ${n === 1 ? "initiative" : "initiatives"}`;
  return {
    map: { ...map, mainQuest: quest, features },
    summary: `Set the Main Quest "${oneLine(change.goal)}" until ${change.ends} with ${count}.`,
  };
}

function setInitiative(map: FeatureMap, change: Extract<MainQuestChange, { op: "set-initiative" }>): Result {
  const features = structuredClone(map.features);
  const feature = findByRef(features, change.feature);
  if (!feature) return { error: `No feature matches "${change.feature}". Known features: ${features.map((f) => f.id).join(", ") || "none"}.` };
  const flow = change.flow === undefined ? undefined : findByRef(feature.flows, change.flow);
  if (change.flow !== undefined && !flow) {
    return { error: `No flow in "${feature.name}" matches "${change.flow}". Its flows: ${feature.flows.map((f) => f.id).join(", ") || "none"}.` };
  }
  const target = flow ?? feature;
  const label = flow ? `flow "${flow.name}"` : `feature "${feature.name}"`;
  if (change.initiative === null) {
    delete target.initiative;
    return { map: { ...map, features }, summary: `Removed the initiative link from ${label}.` };
  }
  const id = change.initiative.trim().toLowerCase() === FOUNDATION ? FOUNDATION : findInitiative(map.mainQuest, change.initiative)?.id;
  if (!id) {
    const known = [...(map.mainQuest?.initiatives.map((i) => i.id) ?? []), FOUNDATION].join(", ");
    return { error: `No initiative matches "${change.initiative}". Known: ${known}.${map.mainQuest ? "" : ' Set a Main Quest first with op "set-main-quest".'}` };
  }
  target.initiative = id;
  return { map: { ...map, features }, summary: `Linked ${label} to ${id === FOUNDATION ? "Foundation" : `"${findInitiative(map.mainQuest, id)?.name}"`}.` };
}

/** Apply one Main Quest change. `today` is YYYY-MM-DD. Never mutates `map`. */
export function updateMainQuest(map: FeatureMap, change: MainQuestChange, today: string): Result {
  if (change.op === "set-main-quest") return setMainQuest(map, change, today);
  if (change.op === "set-initiative") return setInitiative(map, change);

  const quest = map.mainQuest;
  if (!quest) return { error: 'The map has no Main Quest. Set one first with op "set-main-quest".' };
  const features = structuredClone(map.features);

  if (change.op === "end-main-quest") {
    pruneLinks(features, undefined);
    const { mainQuest: _ended, ...rest } = map;
    return { map: { ...rest, features }, summary: `Ended the Main Quest "${oneLine(quest.goal)}". Git keeps it in the file's history.` };
  }
  if (change.op === "add-initiative") {
    const problem = initiativeError([...quest.initiatives, change]);
    if (problem) return { error: problem };
    const next = { ...quest, initiatives: [...quest.initiatives, toInitiative(change)] };
    return { map: { ...map, mainQuest: next, features }, summary: `Added the initiative "${change.name}".` };
  }
  const gone = findInitiative(quest, change.initiative);
  if (!gone) return { error: `No initiative matches "${change.initiative}". Known: ${quest.initiatives.map((i) => i.id).join(", ") || "none"}.` };
  const next = { ...quest, initiatives: quest.initiatives.filter((i) => i.id !== gone.id) };
  pruneLinks(features, next);
  return { map: { ...map, mainQuest: next, features }, summary: `Removed the initiative "${gone.name}" and its links.` };
}

/** Which initiative a flow serves: its own link, else its feature's. `undefined` means none. */
export function servedBy(map: FeatureMap, feature: FeatureMapFeature, flow?: FeatureMapFlow): string | undefined {
  // A stale flow link falls through to the feature's link, as the schema promises.
  const live = (id: string | undefined): id is string =>
    id === FOUNDATION || Boolean(map.mainQuest?.initiatives.some((i) => i.id === id));
  if (live(flow?.initiative)) return flow?.initiative;
  return live(feature.initiative) ? feature.initiative : undefined;
}

/** The display name of an initiative id from `servedBy`. */
export function initiativeLabel(map: FeatureMap, id: string | undefined): string {
  if (id === undefined) return "no initiative";
  if (id === FOUNDATION) return "Foundation";
  return oneLine(findInitiative(map.mainQuest, id)?.name ?? id);
}

/** Rows one plan prints, so a large map keeps the reply short. */
const MAX_PLAN_ROWS = 200;

/** The Main Quest on one screen: each initiative with what serves it, then Foundation, then what serves none. */
export function mainQuestSection(map: FeatureMap, today: string): string {
  const quest = map.mainQuest;
  if (!quest) return "";
  const rows = map.features.flatMap((f) =>
    f.flows.length
      ? f.flows.map((fl) => ({ label: `${oneLine(f.name)} › ${oneLine(fl.name)} (\`${oneLine(f.id)}/${oneLine(fl.id)}\`)`, id: servedBy(map, f, fl) }))
      : [{ label: `${oneLine(f.name)} (\`${oneLine(f.id)}\`)`, id: servedBy(map, f) }],
  );
  const group = (id: string | undefined): string[] => {
    const hits = rows.filter((r) => r.id === id);
    const shown = hits.slice(0, MAX_PLAN_ROWS).map((r) => `- ${r.label}`);
    return hits.length > MAX_PLAN_ROWS ? [...shown, `- …and ${hits.length - MAX_PLAN_ROWS} more`] : shown;
  };
  const dates = `${quest.starts ? `${quest.starts} to ` : "Until "}${quest.ends}.`;
  const ended = quest.ends < today
    ? [`**Flag:** this Main Quest ended on ${quest.ends}. Ask the user for the next one, then call update-feature-map with "end-main-quest" and "set-main-quest".`, ""]
    : [];
  const initiativeBlocks = quest.initiatives.flatMap((initiative, i) => {
    const served = group(initiative.id);
    return [
      `### ${i + 1}. ${oneLine(initiative.name)}`,
      oneLine(initiative.outcome),
      "",
      ...(served.length ? served : ["**Flag:** nothing in the map serves this initiative yet."]),
      "",
    ];
  });
  const foundation = group(FOUNDATION);
  const none = group(undefined);
  return [
    `## Main Quest: ${oneLine(quest.goal)}`,
    "",
    dates,
    "",
    ...ended,
    ...(quest.initiatives.length ? initiativeBlocks : ['**Flag:** the Main Quest has no initiatives. Add up to 3 with op "add-initiative".', ""]),
    ...(foundation.length ? ["### Foundation", ...foundation, ""] : []),
    "### Serves no initiative",
    ...(none.length
      ? [...none, "", 'Ask the user which initiative each one serves, or whether it is Foundation, and save each answer with op "set-initiative".']
      : ["Everything in the map serves an initiative or Foundation."]),
  ].join("\n");
}
