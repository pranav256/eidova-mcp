// The feature map is a file in the user's repository, not a row in our
// database: it changes with the code, so it ships in the same commit. The MCP
// tools never touch the disk. The agent passes the file in and writes the
// result back, which keeps the hosted and stdio servers identical. [BD-832]
import { z } from "zod";

/** Where the agent keeps the map, relative to the repository root. */
export const FEATURE_MAP_PATH = ".better-design/feature-map.json";

/** Size limits of the stored map. The build clips to them, so its output always parses. */
export const FEATURE_MAP_LIMITS = { features: 200, flows: 100, steps: 50, paths: 200, name: 120, capabilities: 400 } as const;

/** A display name for a feature, flow or initiative. */
export const NAME = z.string().trim().min(1).max(FEATURE_MAP_LIMITS.name);
const PATHS = z.array(z.string().trim().min(1).max(500)).max(FEATURE_MAP_LIMITS.paths).default([]);

/**
 * The Main Quest is the one direction a product takes for a set time, and its
 * initiatives are the few pieces of work that carry it out. It lives in the map
 * so one file answers "which goal does this flow serve?". The limits keep the
 * whole plan small enough for one person to hold in their head. [BD-1125]
 */
export const MAIN_QUEST_LIMITS = { initiatives: 3, goalWords: 12, outcomeWords: 25 } as const;

/** The built-in bucket for upkeep that serves no initiative but must stay, such as sign-in and billing. */
export const FOUNDATION = "foundation";

/** A real calendar date as YYYY-MM-DD, which compares correctly as a string. */
export const DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.")
  .refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s, "That date does not exist.");
/** An initiative id, or `foundation`. A link to an id the Main Quest lacks counts as no link. */
const INITIATIVE_LINK = z.string().trim().min(1).max(FEATURE_MAP_LIMITS.name).optional();

/** One sentence that is true when the initiative is done. */
export const OUTCOME = z.string().trim().min(1).max(300).describe("One sentence that is true when the initiative is done.");

/** One piece of work that carries out the Main Quest. */
export const mainQuestInitiativeSchema = z.object({
  id: NAME,
  name: NAME,
  outcome: OUTCOME,
});

/** The one direction for a set time, with its initiatives. */
export const mainQuestSchema = z.object({
  goal: z.string().trim().min(1).max(200),
  starts: DATE.optional(),
  ends: DATE,
  initiatives: z.array(mainQuestInitiativeSchema).max(MAIN_QUEST_LIMITS.initiatives),
});

/** One screen or action in a flow, with the files it touches. */
export const featureMapStepSchema = z.object({
  name: NAME,
  /** URL path such as `/settings/billing`. Absent for a dialog or an email. */
  route: z.string().trim().max(300).optional(),
  /** The file that renders the step, such as the route's page file. */
  screen: z.string().trim().max(500).optional(),
  /** What the user does here, such as "confirms the cancellation". */
  action: z.string().trim().max(300).optional(),
  components: PATHS,
  /** API routes, server actions, hooks and queries the step reads or writes. */
  data: PATHS,
});

/** A named sequence of steps a user walks through, such as "Cancel account". */
export const featureMapFlowSchema = z.object({
  id: NAME,
  name: NAME,
  description: z.string().trim().max(500).optional(),
  /** Overrides the feature's initiative for this flow. */
  initiative: INITIATIVE_LINK,
  steps: z.array(featureMapStepSchema).min(1).max(FEATURE_MAP_LIMITS.steps),
});

/** A product area that owns one or more flows. */
export const featureMapFeatureSchema = z.object({
  id: NAME,
  name: NAME,
  description: z.string().trim().max(500).optional(),
  initiative: INITIATIVE_LINK,
  flows: z.array(featureMapFlowSchema).max(FEATURE_MAP_LIMITS.flows),
  /** Components that belong to the feature but to no single step. */
  components: PATHS,
});

/**
 * Something the product already makes outside its screens: a Zapier action, an
 * API request or an MCP tool. A script builds these from the code, so an agent
 * sees that the product makes a PDF before it offers to build one. [BD-1239]
 */
export const featureMapCapabilitySchema = z.object({
  source: z.enum(["zapier", "api", "mcp"]),
  /** What a person calls it, such as `Create Sales Page` or `POST /api/v1/designs`. */
  name: NAME,
  /** What it makes or does, including the outputs it hands back. */
  makes: z.string().trim().max(600),
  /** The file that defines it, relative to the repository root. */
  file: z.string().trim().max(500),
});

/** The whole map, as stored in `FEATURE_MAP_PATH`. */
export const featureMapSchema = z.object({
  version: z.literal(1),
  product: z.string().trim().max(120).optional(),
  mainQuest: mainQuestSchema.optional(),
  features: z.array(featureMapFeatureSchema).max(FEATURE_MAP_LIMITS.features),
  capabilities: z.array(featureMapCapabilitySchema).max(FEATURE_MAP_LIMITS.capabilities).optional(),
});

/** One step of a flow. */
export type FeatureMapStep = z.infer<typeof featureMapStepSchema>;
/** One flow of a feature. */
export type FeatureMapFlow = z.infer<typeof featureMapFlowSchema>;
/** One feature of the product. */
export type FeatureMapFeature = z.infer<typeof featureMapFeatureSchema>;
/** The Main Quest stored in the map. */
export type MainQuest = z.infer<typeof mainQuestSchema>;
/** One initiative of the Main Quest. */
export type MainQuestInitiative = z.infer<typeof mainQuestInitiativeSchema>;
/** One capability the product already has. */
export type FeatureMapCapability = z.infer<typeof featureMapCapabilitySchema>;
/** The stored feature map. */
export type FeatureMap = z.infer<typeof featureMapSchema>;

/**
 * Map text comes from the repository, so tool output collapses it to one line:
 * a newline in a name could otherwise pose as a heading or a step. [BD-832]
 */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A stable id from a display name: "Cancel account" becomes `cancel-account`. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

/** The item whose id is `ref`, or whose name is `ref` in any case. */
export function findByRef<T extends { id: string; name: string }>(items: T[], ref: string): T | undefined {
  const r = ref.trim();
  return items.find((i) => i.id === r || i.name.toLowerCase() === r.toLowerCase());
}

/**
 * Parse the text of a feature-map file. Returns the map, or an error the agent
 * can act on without reading our source.
 */
export function parseFeatureMap(text: string): { map: FeatureMap } | { error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return {
      error: `The map is not valid JSON (${err instanceof Error ? err.message : String(err)}). Pass the exact contents of ${FEATURE_MAP_PATH}, or call build-feature-map to create it.`,
    };
  }
  const parsed = featureMapSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: `The map does not match the feature-map format: ${issue?.path.join(".") || "root"}: ${issue?.message}. Rebuild it with build-feature-map, or fix that field.`,
    };
  }
  return { map: parsed.data };
}

/** The file text for a map: stable key order, two-space indent, final newline. */
export function serializeFeatureMap(map: FeatureMap): string {
  return `${JSON.stringify(featureMapSchema.parse(map), null, 2)}\n`;
}
