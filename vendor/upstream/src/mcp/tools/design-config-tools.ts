// Design-config "jig" tools: the read/write half of the tuning loop for
// generated projects. The user tunes exact token values (in the project page or
// a host panel); the agent reads them back with get-design-config and applies
// numbers instead of re-interpreting adjectives, or writes explicit values with
// set-design-config when the user states them. Config lives on the project's
// preview fragment (`fragments.config`, shape `designConfigSchema`) behind the
// /api/fragments/:id/config endpoint. Writes check ownership; reads are public.
import { z } from "zod";
import { designConfigSchema, type DesignConfig } from "../../schema";
import {
  APP_BASE_URL,
  CONTEXT_ARG,
  READ_ONLY_TOOL_ANNOTATIONS,
  type RegisterToolDeps,
} from "./shared";

const PROJECT_ID_ARG = z
  .string()
  .min(1)
  .describe("The project id returned by create-design-system.");

const CONFIG_ARG = designConfigSchema.describe(
  "Partial design config to merge over the current one. Only pass the fields the user changed. Colors are oklch() strings (e.g. 'oklch(0.62 0.11 45)'); radius is a CSS length (e.g. '0.75rem'); fonts are family names; density is compact, comfortable or spacious and overrides the design system's layout density.",
);

/** Reads only the density from a stored config, so an older config with other faults still names it. */
const densityOnlySchema = designConfigSchema.pick({ density: true });

/** Names the configured density, so the agent builds in it before review. */
function densityLine(mode: DesignConfig["density"]): string {
  return mode
    ? `Layout density: ${mode}. Build with the --layout-* variables the kit writes, and inspect-spacing checks the page against ${mode}.`
    : "";
}

interface ProjectSummary {
  name?: string;
  designSystemStatus?: string;
  previewFragmentId?: string | null;
}

/**
 * Registers the read and write tools for a project's design config, so an
 * agent can change brand color, radius and fonts and have the change persist
 * to the project rather than live in one conversation.
 */
export function registerDesignConfigTools({
  server,
  tracked,
  authContext,
  apiFetch = globalThis.fetch,
}: RegisterToolDeps): void {
  const authHeaders = (): HeadersInit => {
    if (!authContext) return {};
    const bearer =
      authContext.kind === "api-key" ? authContext.apiKey : authContext.accessToken;
    return { Authorization: `Bearer ${bearer}` };
  };

  const textResult = (text: string) => ({
    content: [{ type: "text" as const, text }],
  });

  /** Resolve a project to its preview fragment (where the tunable config lives). */
  const resolveFragmentId = async (
    projectId: string,
  ): Promise<{ fragmentId: string; project: ProjectSummary } | { error: string }> => {
    const projectUrl = `${APP_BASE_URL}/api/projects/${projectId}`;
    let project: ProjectSummary;
    try {
      const res = await apiFetch(projectUrl, { headers: authHeaders() });
      if (!res.ok) {
        return { error: `Could not read project ${projectId} (HTTP ${res.status}). Check the id, or view it at ${APP_BASE_URL}/projects/${projectId}.` };
      }
      // SAFETY: the JSON contract of this payload; the producing side owns the shape.
      project = (await res.json()) as ProjectSummary;
    } catch (err) {
      return { error: `Network error calling ${projectUrl}: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (!project.previewFragmentId) {
      const status = project.designSystemStatus ?? "PENDING";
      return {
        error:
          status === "COMPLETED"
            ? `Project ${projectId} has no preview fragment to configure.`
            : `Project ${projectId} is not ready yet (status: ${status}). Poll get-design-system-status until it completes, then try again.`,
      };
    }
    return { fragmentId: project.previewFragmentId, project };
  };

  const configMd = <TConfig,>(
    heading: string,
    config: TConfig,
    project: ProjectSummary,
    projectId: string,
  ): string => {
    // Read only the density, so an older config with another fault still names it.
    const parsed = densityOnlySchema.safeParse(config);
    const density = parsed.success ? parsed.data.density : undefined;
    return [
      `# ${heading}`,
      "",
      `Project: ${project.name ?? projectId} (\`${projectId}\`)`,
      "",
      "```json",
      JSON.stringify(config ?? {}, null, 2),
      "```",
      "",
      `These are the user's tuned values: treat them as the design spec. When building or restyling UI for this project, apply these EXACT values (colors, radius, fonts); do not re-derive them from taste words. An empty object means nothing has been tuned yet and the generated theme stands as-is.`,
      ...(densityLine(density) ? ["", densityLine(density)] : []),
    ].join("\n");
  };

  server.registerTool(
    "get-design-config",
    {
      title: "Get a Project's Tuned Design Config",
      description: `Read the user-tuned design config (exact color tokens, radius, fonts, icon library, layout density) of a generated project. Call this BEFORE building or restyling UI for the project, and again after the user tunes values on the project page, so you apply their exact numbers instead of guessing from adjectives.`,
      inputSchema: z.object({
        projectId: PROJECT_ID_ARG,
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ projectId, context }) =>
      tracked("get-design-config", { projectId, context }, async () => {
        const resolved = await resolveFragmentId(projectId);
        if ("error" in resolved) return textResult(resolved.error);
        const configUrl = `${APP_BASE_URL}/api/fragments/${resolved.fragmentId}/config`;
        try {
          const res = await apiFetch(configUrl, { headers: authHeaders() });
          if (!res.ok) {
            return textResult(`Could not read the design config (HTTP ${res.status}).`);
          }
          // SAFETY: the JSON contract of this payload; the producing side owns the shape.
          const config = (await res.json()) as unknown;
          return textResult(
            configMd("Design config", config, resolved.project, projectId),
          );
        } catch (err) {
          return textResult(`Network error calling ${configUrl}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
  );

  server.registerTool(
    "set-design-config",
    {
      title: "Set a Project's Design Config",
      description: `Write exact design-token values (colors, radius, fonts, icon library, layout density) onto a generated project. Use this when the user states concrete values ("make primary oklch(0.62 0.11 45)", "radius 12px"). It merges over the current config and persists, so the change survives restarts and every later get-design-config returns it. Saved config is publicly readable by anyone with the fragment config URL. For vague direction ("warmer", "more playful"), iterate with the user toward concrete values first; do not invent numbers on their behalf.`,
      inputSchema: z.object({
        projectId: PROJECT_ID_ARG,
        config: CONFIG_ARG,
        context: CONTEXT_ARG,
      }),
      // The PATCH merges over the stored config, so a key the caller sends
      // replaces the value the user tuned before, and nothing keeps the old
      // one. That overwrite is why destructiveHint is true. Sending the same
      // config again leaves the same config values. The resulting config is
      // publicly readable by fragment id, so this is open world. [BD-316]
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ projectId, config, context }) =>
      tracked("set-design-config", { projectId, context }, async () => {
        const resolved = await resolveFragmentId(projectId);
        if ("error" in resolved) return textResult(resolved.error);
        const configUrl = `${APP_BASE_URL}/api/fragments/${resolved.fragmentId}/config`;
        try {
          const res = await apiFetch(configUrl, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ config }),
          });
          if (res.status === 404) {
            return textResult(
              `Could not write the design config: the project was not found or is not yours. Only the project's owner can change its config. Check the project id, or pass the API key that created it.`,
            );
          }
          if (!res.ok) {
            return textResult(`Could not write the design config (HTTP ${res.status}).`);
          }
          // SAFETY: the JSON contract of this payload; the producing side owns the shape.
          const updated = (await res.json()) as { config?: unknown };
          return textResult(
            configMd("Design config updated", updated.config, resolved.project, projectId),
          );
        } catch (err) {
          return textResult(`Network error calling ${configUrl}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
  );
}
