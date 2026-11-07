// Feature-map tools: the coding agent keeps a map of the product's features
// and flows in the user's repo, reads it before it plans a change, and updates
// it after. The tools are pure: they take the file list or the map text and
// return text, so the hosted and stdio servers behave the same and nothing is
// stored on our side. [BD-832]
import { z } from "zod";
import {
  FEATURE_MAP_PATH,
  buildFeatureMap,
  oneLine,
  featureMapChangeSchema,
  parseFeatureMap,
  readFeatureMap,
  serializeFeatureMap,
  updateFeatureMap,
} from "../feature-map";
import { CONTEXT_ARG, READ_ONLY_TOOL_ANNOTATIONS, type RegisterToolDeps } from "./shared";

const MAP_ARG = z
  .string()
  .min(1)
  .max(2_000_000)
  .describe(`The exact contents of ${FEATURE_MAP_PATH}.`);

const text = (body: string, isError = false) => ({
  content: [{ type: "text" as const, text: body }],
  isError,
});

const fileBlock = (json: string) =>
  [`Write this to \`${FEATURE_MAP_PATH}\`, replacing the file, and commit it with the code change:`, "", "```json", json.trimEnd(), "```"].join("\n");

const UNMAPPED_SHOWN = 20;

const unmappedLines = (unmapped: string[]): string[] => {
  if (unmapped.length === 0) return [];
  const hidden = unmapped.length - UNMAPPED_SHOWN;
  return [
    `${unmapped.length} component or data file(s) matched no step. Place the ones that matter with update-feature-map:`,
    ...unmapped.slice(0, UNMAPPED_SHOWN).map((f) => `- \`${oneLine(f)}\``),
    ...(hidden > 0 ? [`- …and ${hidden} more`] : []),
    "",
  ];
};

const WHEN_TO_USE = `Use the map whenever a request names a user flow or a product area ("the cancel account flow", "checkout", "onboarding"). Read ${FEATURE_MAP_PATH} and pass it to read-feature-map before you plan the change, so you edit every screen, component and route the flow touches and nothing else. If the file does not exist, call build-feature-map first.`;

/** Registers build-feature-map, read-feature-map and update-feature-map. */
export function registerFeatureMapTools({ server, tracked }: RegisterToolDeps): void {
  server.registerTool(
    "build-feature-map",
    {
      title: "Build a Feature Map",
      description: `Draft a map of the product's features and flows from the repository's file list. ${WHEN_TO_USE}

Run \`git ls-files\` in the repository and pass every path as \`files\`. Routes become screens (Next.js app and pages routers, Remix and React Router flat routes, SvelteKit, Nuxt), each chain of nested routes becomes a flow (/settings/billing/cancel is Settings → Billing → Cancel), and components, API routes, hooks and server actions join the step whose name they share.

The result is a first draft. Write it to ${FEATURE_MAP_PATH}, show the user the flows, and ask which steps are missing: a dialog, an email or a background job has no route, so add those with update-feature-map (op "set-flow").`,
      inputSchema: z.object({
        files: z.array(z.string().max(500)).min(1).max(50_000)
          .describe("Every file path in the repository, relative to its root, as printed by `git ls-files`."),
        product: z.string().trim().max(120).optional().describe("The product's name, stored at the top of the map."),
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ files, product, context }) =>
      tracked("build-feature-map", { fileCount: files.length, context }, async () => {
        const { map, unmapped, skippedRoutes } = buildFeatureMap(files, product);
        const flowCount = map.features.reduce((n, f) => n + f.flows.length, 0);
        if (flowCount === 0) {
          return text(
            `# No routes found\n\nNone of the ${files.length} paths follow a router convention this tool reads. Build the map with the user instead: call update-feature-map with op "add-feature" for each product area, starting from an empty map:\n\n\`\`\`json\n${serializeFeatureMap(map).trimEnd()}\n\`\`\``,
          );
        }
        const skipped = skippedRoutes.length
          ? [`${skippedRoutes.length} page route(s) were left out to keep the map within its limits, starting with \`${oneLine(skippedRoutes[0] ?? "")}\`. Add the ones that matter with update-feature-map.`, ""]
          : [];
        return text([readFeatureMap(map), "", ...skipped, ...unmappedLines(unmapped), fileBlock(serializeFeatureMap(map))].join("\n"));
      }),
  );

  server.registerTool(
    "read-feature-map",
    {
      title: "Read the Feature Map",
      description: `Find the flows a change touches, with the screen, route, components and data files of every step. ${WHEN_TO_USE}

Pass \`flow\` ("cancel account"), \`feature\` ("billing") or \`file\` (a path you are about to edit) to narrow it. With no query it lists every flow, and the Main Quest when the map has one: each initiative with what serves it, and what serves none.

Before you build a new feature, screen or marketing page, pass its route, file or name in \`planned\`. When the answer names a Zapier action, API request or MCP tool that already makes it, or says it serves no initiative, tell the user before you build it.`,
      inputSchema: z.object({
        map: MAP_ARG,
        feature: z.string().trim().max(120).optional().describe("A feature id or part of its name."),
        flow: z.string().trim().max(120).optional().describe("A flow id or part of its name."),
        file: z.string().trim().max(500).optional().describe("A file path or route; returns every flow that uses it."),
        planned: z.array(z.string().trim().min(1).max(500)).max(50).optional()
          .describe("Routes, file paths or names of work you are about to build; checks each against what the product already makes and the Main Quest."),
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ map, feature, flow, file, planned, context }) =>
      tracked("read-feature-map", { feature, flow, file, planned: planned?.length, context }, async () => {
        const parsed = parseFeatureMap(map);
        if ("error" in parsed) return text(parsed.error, true);
        return text(readFeatureMap(parsed.map, { feature, flow, file, planned }));
      }),
  );

  server.registerTool(
    "update-feature-map",
    {
      title: "Update the Feature Map",
      description: `Apply one change to the feature map and get the new file back. Call it after you add, rename or remove a feature or a flow, or change a flow's steps, so the map stays in step with the code.

Changes, one per call:
- { op: "add-feature", name, description?, flows? }
- { op: "rename-feature", feature, name }
- { op: "remove-feature", feature }
- { op: "set-flow", feature, flow: { name, description?, steps: [{ name, route?, screen?, action?, components?, data? }] } } adds the flow, or replaces the one with that name
- { op: "rename-flow", feature, flow, name }
- { op: "remove-flow", feature, flow }

The Main Quest is the one goal for a set time, with at most 3 initiatives that carry it out. When the user names a direction ("this quarter is about team planning"), save it:
- { op: "set-main-quest", goal (12 words at most), ends: "YYYY-MM-DD", starts?, initiatives?: [{ name, outcome }] } refused while another is open
- { op: "end-main-quest" }
- { op: "add-initiative", name, outcome (one sentence, 25 words at most) }
- { op: "remove-initiative", initiative }
- { op: "set-initiative", feature, flow?, initiative } links work to an initiative, to "foundation" for upkeep such as sign-in and billing, or null to unlink

\`feature\` and \`flow\` take an id or an exact name. Write the returned file to ${FEATURE_MAP_PATH}.`,
      inputSchema: z.object({
        map: MAP_ARG,
        change: featureMapChangeSchema,
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ map, change, context }) =>
      tracked("update-feature-map", { op: change.op, context }, async () => {
        const parsed = parseFeatureMap(map);
        if ("error" in parsed) return text(parsed.error, true);
        const result = updateFeatureMap(parsed.map, change);
        if ("error" in result) return text(oneLine(result.error), true);
        return text([`# ${oneLine(result.summary)}`, "", fileBlock(serializeFeatureMap(result.map))].join("\n"));
      }),
  );
}
