import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { isString } from "../guards";
import { DEV_TOOLS_INSTALL_COMMAND, DEV_TOOLS_SETUP } from "./dev-tools";

/** Keep the core decision guidance in hosts' truncated instruction and kit prefixes. */
export const DESIGN_TRADEOFF_REMINDER = "For material design choices, explain gains, losses, affected users/team, and fit to known project goals in conversation or handoff, not product UI. Label assumptions; preserve chosen directions.";

/** Explain material design choices using the caller's current project context. */
export const DESIGN_TRADEOFF_RULE = `## Explain design trade-offs

Before choosing or changing a design direction, tell the user what each real option gains and loses, which users or team bear the cost, and why you recommend it for this project's known audience, goals, and constraints. Use a short line per option: "Gain: ...; lose: ...; affects: ...; fits because: ...". Load get-ux-principle with topic "tradeoffs" when deeper guidance is needed.

Use the current conversation and project evidence. Label assumptions and predicted effects. Do not invent research, conversion gains, metrics, or project facts. If the user has already chosen, explain the accepted trade-off without reopening the choice. Keep minor edits brief; this adds no approval step and never excuses an accessibility or safety failure.

Put the explanation in the conversation or requested project handoff, not extra product UI copy. Before presenting the result, check that material gains and losses were communicated and report any changed trade-off.`;

/** Shared scope and evidence contract for agents building with a selected system. */
export const REDESIGN_SCOPE_CONTRACT = `## Match the requested change

Classify the request as repair, polish, or redesign: restore behavior, refine layout, or rebuild layout and components. Follow the user's scope, not analytics-only tool context. Do not downgrade redesign to polish, expand repair, or turn token export/source inspection into a redesign.

Keep the selected design system and assigned icon family/variant unless the user requests a change. Use exact returned icon names/source, never substitute packs, emoji, or invented SVGs. Inventory sections, components, states and responsive layouts; map requested patterns to real system components and record missing primitives.

Plan structural changes and component adoption before redesigning. Rebuild the requested hierarchy, layout and interactions; token swaps and unused imports do not count. Preserve unrelated behavior, accessibility and production/control boundaries.

Preserve all supplied paragraphs, reviews, offer details, links and disclosures, including collapsed answers and inactive tabs, unless the user requests cuts or rewrites. Require a source-to-render content comparison; investigate every omission, not just section counts. A shortened fixture is not a completed page. Label partial prototypes and never treat their checks as full-page evidence.

Compare before/after renders of the same content and states at the same desktop and mobile widths. Show which planned structural changes and component adoption are visible; verify the selected icons, spacing, hierarchy, and working interactions. Copy and accessibility fixes alone do not complete a redesign. Tool calls, generated files, or a source-only review are not visual evidence. If a baseline or rendered check is unavailable, name the missing evidence and report the redesign as unverified. Keep all existing build, accessibility, hover, comprehension, and review gates.`;

/** Scope boundary for isolated Shopify page builds, distinct from a full storefront install. */
export const SHOPIFY_PAGE_SCOPE_CONTRACT = `## Keep Shopify page work isolated

For a page-only test or redesign, withhold installation of this full-store kit: its global CSS and default templates are not page-scoped. Report that a page-scoped kit is required before writing. Only proceed once the files are genuinely isolated: uniquely named alternate templates such as \`templates/page.better-design-test.json\`, uniquely named sections/assets, and only required primitives whose styles stay inside the test root. No global \`html\`, \`body\`, or shared control overrides; load the scoped stylesheet only from the test section, not \`layout/theme.liquid\`.

Confirm the unpublished theme ID before any write. Preserve the live theme, original/control page, shared sections, and global page/template assignments. Update scoped files' internal references together and preview the alternate template in the confirmed draft theme. Renaming files alone does not isolate CSS.

Do not install or overwrite default \`templates/index.json\`, \`templates/product.json\`, or \`templates/collection.json\` for page-only work. Full-storefront template installation requires a user request for that scope; publishing or changing live/global assignments requires separate authorization. A kit returning full-storefront examples is not permission to apply them.`;

/**
 * The first lines of a React kit that can start a project. A small local model
 * plans its build from the top of a long reply and scaffolds Vite by hand when
 * the command sits further down, so the commands lead. [BD-1262]
 */
// The fields of a React kit's handoff that decide how its text opens.
const KIT_START = z.object({
  newProjectCommand: z.string().optional(),
  installCommand: z.string().optional(),
  installedTo: z.string().optional(),
  localInstall: z.boolean().optional(),
});

function startHere({ newProjectCommand, installCommand, installedTo, localInstall }: z.infer<typeof KIT_START>): string {
  // The local server set the project up itself, so the model only builds. [BD-1262]
  if (isString(installedTo)) {
    return [
      "## Installed",
      "",
      `This server created the project and installed the whole design system in \`${installedTo}\`. Run no setup, create or install command. Build the screen now.`,
      "",
      "",
    ].join("\n");
  }
  if (localInstall === true) {
    return [
      "## Start here",
      "",
      "With no project yet, this Better Design server creates it for you: call `get-design-system-kit` again with the same arguments plus `install: true`. It needs an empty folder, creates a Vite + React + TypeScript + Tailwind project there, and installs every component. Do not run `npm create vite`, `create-vite` or `tailwindcss init` yourself.",
      "",
      ...(isString(installCommand) ? ["In an existing project, run these commands in its root instead:", "```bash", installCommand, DEV_TOOLS_INSTALL_COMMAND, "```", DEV_TOOLS_SETUP, ""] : []),
      "",
    ].join("\n");
  }
  if (!isString(newProjectCommand) || !isString(installCommand)) return "";
  return [
    "## Start here",
    "",
    "With no project yet, run these commands first. They create a Vite + React + TypeScript project with Tailwind v4 and the `@/*` alias, then install this design system into `my-app/components/ui/`. Do not run `npm create vite` or `tailwindcss init` instead. In an existing project, run only the last command, in its root.",
    "```bash",
    newProjectCommand,
    "cd my-app",
    installCommand,
    DEV_TOOLS_INSTALL_COMMAND,
    "```",
    DEV_TOOLS_SETUP,
    "",
    "",
  ].join("\n");
}

/** Add the same scope contract to every successful kit's text and structured handoff. */
export function withRedesignContract(result: CallToolResult): CallToolResult {
  if (result.structuredContent?.status !== "completed") return result;
  const kit = KIT_START.safeParse(result.structuredContent);
  const start = kit.success ? startHere(kit.data) : "";
  const instructions = result.structuredContent.buildInstructions;
  const buildInstructions = isString(instructions)
    ? `${instructions}\n\n${REDESIGN_SCOPE_CONTRACT}\n\n${DESIGN_TRADEOFF_RULE}`
    : `${REDESIGN_SCOPE_CONTRACT}\n\n${DESIGN_TRADEOFF_RULE}`;
  return {
    ...result,
    content: [
      ...result.content.map((entry) => entry.type === "text"
        ? { ...entry, text: `${start}${DESIGN_TRADEOFF_REMINDER}\n\n${REDESIGN_SCOPE_CONTRACT}\n\n${entry.text}` }
        : entry),
      { type: "text", text: DESIGN_TRADEOFF_RULE },
    ],
    structuredContent: { ...result.structuredContent, buildInstructions },
  };
}
