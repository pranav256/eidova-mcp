// The design panel ChatGPT opens from its sidebar and from the panel beside a
// conversation. Only the person opens it, never the model: the tool is
// app-only, and ChatGPT calls it with `{}` when an entrypoint opens.
import { z } from "zod";
import { DESIGN_PANEL_WIDGET_HTML, DESIGN_PANEL_WIDGET_URI } from "../design-panel-html";
import { DIRECTORY_TOOL_DESCRIPTIONS } from "../directory-listing";
import { toProjectCard, type CheckRun } from "../panel-data";
import {
  APP_BASE_URL,
  READ_ONLY_TOOL_ANNOTATIONS,
  WIDGET_APP_DOMAIN,
  type RegisterToolDeps,
} from "./shared";

/** Reads the newest check runs of the connection's own account. */
export type ReadRecentChecks = () => Promise<CheckRun[]>;

// The app-only tool behind the ChatGPT sidebar and side-panel entrypoints.
const DESIGN_PANEL_TOOL = "open-design-panel";

// Shared by the resources/list entry and the read result, which both must
// carry it. ChatGPT opens every entrypoint fullscreen. The panel frames the
// web app's own showcase pages and reads its public icon files, so it allows
// the web app's origin, and only that origin. The public preview widget stays
// frame-free (see preview-resource.ts); this panel is behind its rollout.
const PANEL_RESOURCE_META = {
  ui: {
    prefersBorder: false,
    domain: WIDGET_APP_DOMAIN,
    csp: {
      connectDomains: [APP_BASE_URL],
      resourceDomains: [APP_BASE_URL],
      frameDomains: [APP_BASE_URL],
    },
  },
  "openai/widgetCSP": {
    connect_domains: [APP_BASE_URL],
    resource_domains: [APP_BASE_URL],
    frame_domains: [APP_BASE_URL],
    redirect_domains: [APP_BASE_URL],
  },
  "openai/ui": {
    preferredDisplayMode: "fullscreen",
    availableDisplayModes: ["fullscreen"],
  },
} as const;

// One failed source must not blank the whole panel, so each part falls back to empty.
async function orEmpty<T>(load: (() => Promise<T[]>) | undefined): Promise<T[]> {
  if (!load) return [];
  try {
    return await load();
  } catch (error) {
    console.warn("[design-panel] a panel source failed:", error);
    return [];
  }
}

/**
 * Registers the design panel: one app-only tool with a global (sidebar) and a
 * thread (side panel) entrypoint, and the ui:// page it renders. The page
 * shows the latest checks, the person's design systems and the catalog, and
 * sends the step the person picks into the chat.
 */
export function registerDesignPanelTools(
  { server, provider, tracked, userId }: RegisterToolDeps,
  readRecentChecks?: ReadRecentChecks,
): void {
  server.registerResource(
    "design-panel-widget",
    DESIGN_PANEL_WIDGET_URI,
    {
      mimeType: "text/html;profile=mcp-app",
      _meta: PANEL_RESOURCE_META,
    },
    async () => ({
      contents: [{
        uri: DESIGN_PANEL_WIDGET_URI,
        mimeType: "text/html;profile=mcp-app",
        text: DESIGN_PANEL_WIDGET_HTML,
        _meta: PANEL_RESOURCE_META,
      }],
    }),
  );

  server.registerTool(
    DESIGN_PANEL_TOOL,
    {
      title: "Better Design",
      // Only a person opens it, so the workflow and directory profiles share one description.
      description: DIRECTORY_TOOL_DESCRIPTIONS[DESIGN_PANEL_TOOL],
      inputSchema: z.object({
        project: z
          .guid()
          .optional()
          .describe("One of the person's project ids. Returns only that project, so the panel can show a change as soon as it lands."),
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      _meta: {
        ui: { resourceUri: DESIGN_PANEL_WIDGET_URI, visibility: ["app"] },
        "ui/resourceUri": DESIGN_PANEL_WIDGET_URI,
        "openai/outputTemplate": DESIGN_PANEL_WIDGET_URI,
        "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
      },
    },
    async ({ project }) =>
      tracked(DESIGN_PANEL_TOOL, { project: project ?? null }, async () => {
        if (project) return projectResult(project);
        const { listUserProjects } = provider;
        const listProjects = listUserProjects && userId
          ? () => listUserProjects.call(provider, userId)
          : undefined;
        const [checks, projectRows, systems] = await Promise.all([
          orEmpty(readRecentChecks),
          orEmpty(listProjects),
          orEmpty(provider.listCatalogCards?.bind(provider)),
        ]);
        const projects = projectRows.map(toProjectCard);
        const text = `The Better Design panel shows ${checks.length} recent checks, ${projects.length} of the person's design systems and ${systems.length} catalog systems.`;
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { checks, projects, systems },
        };
      }),
  );

  // One project. Only the person's own projects answer; anything else reads as missing.
  async function projectResult(projectId: string) {
    const [row] = userId && provider.listUserProjects
      ? await provider.listUserProjects(userId, projectId)
      : [];
    const card = row ? toProjectCard(row) : null;
    return {
      content: [{ type: "text" as const, text: card ? `The project ${card.title}.` : "No such project." }],
      structuredContent: { project: card },
    };
  }
}
