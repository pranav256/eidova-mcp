// One change to the map per call: add, rename or remove a feature, and set,
// rename or remove a flow. Ids follow names, so a rename changes both. [BD-832]
// The Main Quest changes live in main-quest.ts. [BD-1125]
import { z } from "zod";
import { mainQuestChangeSchemas, todayIso, updateMainQuest } from "./main-quest";
import {
  featureMapFlowSchema,
  findByRef,
  slugify,
  type FeatureMap,
  type FeatureMapFeature,
} from "./schema";

const NAME = z.string().trim().min(1).max(120);
const REF = z.string().trim().min(1).max(120).describe("The id or exact name of an existing feature or flow.");
const FLOW_INPUT = featureMapFlowSchema.omit({ id: true, initiative: true });

/** Every change `update-feature-map` accepts, keyed by `op`. */
export const featureMapChangeSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add-feature"),
    name: NAME,
    description: z.string().trim().max(500).optional(),
    flows: z.array(FLOW_INPUT).max(100).optional(),
  }),
  z.object({ op: z.literal("rename-feature"), feature: REF, name: NAME }),
  z.object({ op: z.literal("remove-feature"), feature: REF }),
  z.object({ op: z.literal("set-flow"), feature: REF, flow: FLOW_INPUT }),
  z.object({ op: z.literal("rename-flow"), feature: REF, flow: REF, name: NAME }),
  z.object({ op: z.literal("remove-flow"), feature: REF, flow: REF }),
  ...mainQuestChangeSchemas,
]);

/** One change to the map. */
export type FeatureMapChange = z.infer<typeof featureMapChangeSchema>;

function find<T extends { id: string; name: string }>(items: T[], ref: string): { index: number; item: T } | undefined {
  const item = findByRef(items, ref);
  return item ? { index: items.indexOf(item), item } : undefined;
}

const idTaken = (items: { id: string }[], id: string, except?: number): boolean =>
  items.some((item, i) => item.id === id && i !== except);

const toFlow = (f: z.infer<typeof FLOW_INPUT>) => ({ id: slugify(f.name), ...f });

/**
 * Apply one change and return the new map with a sentence saying what
 * changed, or an error naming what the agent must fix. Never mutates `map`.
 * `today` (YYYY-MM-DD) decides whether the Main Quest is still open.
 */
export function updateFeatureMap(
  map: FeatureMap,
  change: FeatureMapChange,
  today: string = todayIso(),
): { map: FeatureMap; summary: string } | { error: string } {
  switch (change.op) {
    case "set-main-quest":
    case "end-main-quest":
    case "add-initiative":
    case "remove-initiative":
    case "set-initiative":
      return updateMainQuest(map, change, today);
  }
  const features = structuredClone(map.features);
  const next = (summary: string) => ({ map: { ...map, features }, summary });

  if (change.op === "add-feature") {
    const id = slugify(change.name);
    if (idTaken(features, id)) return { error: `A feature with id \`${id}\` already exists. Use set-flow to change its flows, or pick another name.` };
    const feature: FeatureMapFeature = { id, name: change.name, flows: (change.flows ?? []).map(toFlow), components: [] };
    if (change.description) feature.description = change.description;
    features.push(feature);
    return next(`Added feature "${change.name}" (\`${id}\`) with ${feature.flows.length} flow(s).`);
  }

  const hit = find(features, change.feature);
  if (!hit) {
    return { error: `No feature matches "${change.feature}". Known features: ${features.map((f) => f.id).join(", ") || "none"}.` };
  }
  const feature = hit.item;

  switch (change.op) {
    case "rename-feature": {
      const id = slugify(change.name);
      if (idTaken(features, id, hit.index)) return { error: `Another feature already has the id \`${id}\`.` };
      features[hit.index] = { ...feature, id, name: change.name };
      return next(`Renamed feature "${feature.name}" to "${change.name}" (\`${id}\`).`);
    }
    case "remove-feature":
      features.splice(hit.index, 1);
      return next(`Removed feature "${feature.name}" and its ${feature.flows.length} flow(s).`);
    case "set-flow": {
      const flow = toFlow(change.flow);
      const existing = find(feature.flows, flow.id) ?? find(feature.flows, flow.name);
      // A replaced flow keeps the initiative it served. [BD-1125]
      if (existing) feature.flows[existing.index] = existing.item.initiative ? { ...flow, initiative: existing.item.initiative } : flow;
      else feature.flows.push(flow);
      return next(`${existing ? "Replaced" : "Added"} flow "${flow.name}" in "${feature.name}" with ${flow.steps.length} step(s).`);
    }
    default: {
      const flowHit = find(feature.flows, change.flow);
      if (!flowHit) {
        return { error: `No flow in "${feature.name}" matches "${change.flow}". Its flows: ${feature.flows.map((f) => f.id).join(", ") || "none"}.` };
      }
      if (change.op === "remove-flow") {
        feature.flows.splice(flowHit.index, 1);
        return next(`Removed flow "${flowHit.item.name}" from "${feature.name}".`);
      }
      const id = slugify(change.name);
      if (idTaken(feature.flows, id, flowHit.index)) {
        return { error: `"${feature.name}" already has a flow with the id \`${id}\`.` };
      }
      feature.flows[flowHit.index] = { ...flowHit.item, id, name: change.name };
      return next(`Renamed flow "${flowHit.item.name}" to "${change.name}" (\`${id}\`).`);
    }
  }
}
