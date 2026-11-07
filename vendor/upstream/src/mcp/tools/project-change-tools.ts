// change-design-system: change a design system the user already generated,
// through the same agent as the project chat on the website. It is its own
// tool, not an option of create-design-system, because it replaces what the
// project's public install URL and preview serve, so a host must be able to
// ask before it runs. It ships behind the design panel's rollout.
import { z } from "zod";
import { formatProjectIdLine } from "../project-id-line";
import { APP_BASE_URL, CONTEXT_ARG, type RegisterToolDeps } from "./shared";

const TOOL = "change-design-system";

/** Registers change-design-system on a server that has the design panel. */
export function registerProjectChangeTools({ server, tracked, authContext, apiFetch = globalThis.fetch }: RegisterToolDeps): void {
  const authHeaders = (): HeadersInit => {
    if (!authContext) return {};
    const bearer = authContext.kind === "api-key" ? authContext.apiKey : authContext.accessToken;
    return { Authorization: `Bearer ${bearer}` };
  };
  const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

  server.registerTool(
    TOOL,
    {
      title: "Change a Design System",
      description: `Change a design system the user already generated, such as one component, the icons or a style, in the user's own words. The same agent as the project chat on better-design.com edits the project's files and saves a new version, which the project's install command and preview then serve; earlier versions stay in the project's history. It typically takes 1-3 minutes: poll \`get-design-system-status\` afterwards. Use \`set-design-config\` instead when the user names exact token values. Each call uses one credit from the user's Better Design account.`,
      inputSchema: z.object({
        projectId: z.guid().describe("The id of the project to change, from create-design-system or the design panel."),
        change: z.string().min(1).max(10000).describe("The change, in the user's words, e.g. 'make the card shadow softer'."),
        context: CONTEXT_ARG,
      }),
      // It replaces what the project's public registry and preview serve, so a
      // host should confirm it. Earlier versions stay, but the published URL
      // moves to the new one. Repeating it runs the agent again.
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ projectId, change, context }) =>
      tracked(TOOL, { projectId, query: change, context }, async () => {
        const url = `${APP_BASE_URL}/api/messages`;
        try {
          const res = await apiFetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ value: change, projectId }),
          });
          if (res.status === 404) {
            return text(`Could not change project ${projectId}: it was not found or is not this user's. Only the account that created a project can change it.`);
          }
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            return text(`Could not start the change (HTTP ${res.status}). ${body.slice(0, 500)}`);
          }
        } catch (err) {
          return text(`Network error calling ${url}: ${err instanceof Error ? err.message : String(err)}`);
        }
        const projectUrl = `${APP_BASE_URL}/projects/${projectId}`;
        const lines = [
          "# Change started",
          "",
          formatProjectIdLine(projectId),
          "",
          `The project's agent is making this change: ${change}`,
          "",
          `It typically takes 1-3 minutes. Wait ~60 seconds, then call \`get-design-system-status\` with the project id. Watch it live (signed in as the owner): ${projectUrl}`,
        ];
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: { projectId, projectUrl, status: "changing" },
        };
      }),
  );
}
