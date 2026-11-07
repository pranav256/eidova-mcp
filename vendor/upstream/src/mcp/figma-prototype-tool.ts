import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { describeDrawn, drawablePage } from "./figma-draw.js";
import { figmaKitSchema } from "./figma-kit.js";
import { kitThemes, kitTokensCss } from "./figma-kit-tokens.js";
import { loadModelDesignSystem, renderPrototypeWithModel } from "./figma-model.js";
import { type ModelMethod, finishHandoff, startHandoff } from "./figma-model-handoff.js";
import { DEFAULT_LOCAL_MODEL, ModelProviderError, type ModelProvider, localModelProvider } from "./figma-model-providers.js";
import type { ModelDesignSystem } from "./figma-model-prompt.js";
import type { PrototypeNode, PrototypeReportEntry, ProjectScreenSaved } from "./figma-prototype.js";
import { type FigmaKit, kitCounts } from "./figma-kit.js";
import { type KitGap, type ProjectFigmaKit, type ProjectFigmaKitSaved, describeKitGaps } from "./figma-kit-gaps.js";
import type { KitNameMatch } from "./figma-kit-names.js";
import { type RelayConnection, type RelayResult, missingFrameMessage, noPluginMessage } from "./figma-relay.js";

import { type FigmaRelay, startFigmaRelay } from "./figma-relay-server.js";

/**
 * Turns a frame in the designer's open Figma file into an HTML prototype,
 * without anyone pressing a button in Figma.
 *
 * Only a plugin inside Figma can read a Figma file, so the Better Design
 * plugin holds a poll open against a local relay this tool owns. The agent's
 * request travels down that poll; the plugin serializes the frame and renders
 * it through the design system's own page, and the HTML comes back here.
 *
 * Stdio only: it listens on a loopback port and writes files, so tools.ts
 * must not import this module and the Worker never registers it, exactly as
 * review-tool.ts is kept out. [BD-741]
 */

let relay: FigmaRelay | null = null;
let starting: Promise<FigmaRelay | null> | null = null;

/** The signature every relay start shares, the real loopback server and a test's. */
export type FigmaRelayStarter = () => Promise<FigmaRelay | null>;

const startRealRelay: FigmaRelayStarter = () => startFigmaRelay();

let activeStarter: FigmaRelayStarter = startRealRelay;

/**
 * Hands the relay start to a test double, so a test drives the tools through
 * a `FigmaRelayQueue` of its own without a loopback port and without mocking
 * this module. It forgets the relay already started, so the next tool call
 * goes through the double, and closes a relay that is still running so its
 * port is not held. `undefined` restores the real relay. Runs only under
 * Vitest: a `NODE_ENV` check would fail open where that variable is unset.
 * [BD-578]
 */
export function replaceFigmaRelayStarterForTesting(next: FigmaRelayStarter | undefined): void {
  if (process.env.VITEST !== "true") {
    throw new Error("replaceFigmaRelayStarterForTesting is for tests only.");
  }
  activeStarter = next ?? startRealRelay;
  void relay?.close();
  relay = null;
  starting = null;
}

/** The relay, started on first use. A port already taken means another session owns it. */
async function ensureRelay(): Promise<FigmaRelay | null> {
  if (relay) return relay;
  // The attempt is shared while it runs and forgotten once it settles, so a
  // relay that failed to bind is retried rather than cached as failure.
  starting ??= activeStarter()
    .then((started) => {
      relay = started;
      return started;
    })
    .finally(() => {
      starting = null;
    });
  return starting;
}

/** How long a first call waits for the plugin's next poll to arrive. */
const CONNECT_GRACE_MS = 10_000;

/**
 * Waits for the plugin to poll. The relay starts on the first tool call, so a
 * plugin that has been open all along still has to come round to its next
 * poll: without this wait, the first call of a session always failed.
 */
async function waitForPlugin(relay: FigmaRelay): Promise<RelayConnection | null> {
  const deadline = Date.now() + CONNECT_GRACE_MS;
  for (;;) {
    const connection = relay.queue.connected();
    if (connection || Date.now() >= deadline) return connection;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function describe(report: Array<{ name: string; reason: string }>): string {
  if (!report.length) return "Every layer mapped.";
  return [`${report.length} layer(s) need a look:`, ...report.map((entry) => `- ${entry.name}: ${entry.reason}`)].join("\n");
}

/**
 * Sends a finished page to the plugin, which draws it on a new page of the
 * open file with the client's components as instances. [BD-1056]
 */
async function drawInFigma(name: string, html: string, width: number, height: number): Promise<{ note: string } | { error: string }> {
  const started = await ensureRelay();
  if (!started) return { error: "Another Better Design session already owns the Figma relay port. Close it and try again." };
  if (!(await waitForPlugin(started))) return { error: noPluginMessage() };
  const result = await started.queue.ask(undefined, undefined, undefined, { name, html: drawablePage(html, name), width, height }).answer;
  if (result.error) return { error: result.error };
  if (!result.drawn) return { error: "The plugin drew nothing. Update the Better Design plugin and try again." };
  return { note: describeDrawn(result.drawn) };
}

/** How long a model may take over one frame before the tool gives up on it. */
const MODEL_TIMEOUT_MS = 600_000;

/** A finished page, its report, and the sentence that opens the tool's reply. */
interface PrototypePage {
  html: string;
  report: PrototypeReportEntry[];
  summary: string;
  components?: number;
}

/** The largest answer file the finish step reads: a page is tens of kilobytes. */
const ANSWER_LIMIT_BYTES = 2_000_000;

/**
 * Model mode with a local model, after the plugin answered: the serialized
 * frame and its image go to the model with the design system's components,
 * and the page and the report come back, or the reason they could not. The
 * plugin's own report lines, such as a failed image export, lead the report.
 * [BD-866]
 */
async function rebuildWithModel(result: RelayResult, designSystem: ModelDesignSystem, provider: ModelProvider, method: ModelMethod): Promise<PrototypePage | { error: string }> {
  if (!result.tree) return { error: "The plugin sent no frame. Update the Better Design plugin and try again." };
  try {
    const run = await renderPrototypeWithModel({
      frame: result.tree,
      png: result.png,
      designSystem,
      provider,
      method,
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
    const seconds = Math.round(run.durationMs / 1000);
    return {
      html: run.html,
      report: [...modelModeNotes(result.report), ...run.report],
      summary: `${provider.model} rebuilt ${result.frame ?? "the frame"} with ${designSystem.id} components in ${seconds} s.`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { error: `${provider.model} could not rebuild the frame: ${reason}` };
  }
}

/** The plugin's note on a component outside a Better Design library (packages/figma-plugin/code.js). */
const NOT_A_LIBRARY_INSTANCE = "instance is not from a Better Design library";

/**
 * The plugin's notes that matter in model mode. Model mode is for frames that
 * hold no library component, so the library note is true of every instance
 * there and buries the notes that matter, as it did on the Matrix Risks frame. [BD-1056]
 */
function modelModeNotes(report: PrototypeReportEntry[]): PrototypeReportEntry[] {
  return report.filter((entry) => !entry.reason.startsWith(NOT_A_LIBRARY_INSTANCE));
}

/** The largest kit file read: the Matrix kit, 1824 components, is about 0.65 MB. */
const KIT_LIMIT_BYTES = 8_000_000;

/** A kit file from read-figma-kit, or why it cannot be used. */
async function kitFromFile(kitPath: string): Promise<FigmaKit | { error: string }> {
  const file = resolve(process.cwd(), kitPath);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return { error: `No kit file at ${file}. Write one with read-figma-kit.` };
  if (info.size > KIT_LIMIT_BYTES) return { error: `The kit file is ${info.size} bytes; a kit from read-figma-kit is far smaller.` };
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch {
    // Not silent: the caller reports this error to the agent, and the JSON
    // parser's own message would only repeat that the file is not JSON.
    return { error: `${file} is not a kit from read-figma-kit.` };
  }
  const parsed = figmaKitSchema.safeParse(raw);
  return parsed.success ? parsed.data : { error: `${file} is not a kit from read-figma-kit.` };
}

/**
 * A catalog system wearing a client's kit [BD-1056]: the kit's token CSS goes
 * after the system's own, so the system's parts take the client's colours,
 * font and radius.
 */
function withKit(system: ModelDesignSystem, kit: FigmaKit, theme: string | undefined): ModelDesignSystem | { error: string } {
  const themes = kitThemes(kit);
  if (theme && !themes.includes(theme)) return { error: `The kit has no theme named "${theme}". It has: ${themes.join(", ") || "none"}.` };
  const tokens = kitTokensCss(kit, { theme });
  if (!tokens) return { error: `${kit.file} has no light and dark collection of semantic colours, so it cannot theme the page.` };
  // The file name reaches the model prompt, so it stays one short line. [BD-1056]
  const fileName = kit.file.replace(/\s+/g, " ").trim().slice(0, 80);
  return {
    ...system,
    id: `${system.id}+kit`,
    name: `the ${JSON.stringify(fileName)} kit on ${system.name}`,
    tokensCss: `${system.tokensCss}\n${tokens}`,
    componentCss: `${system.componentCss}\n${KIT_FIELD_CSS}`,
  };
}

/**
 * A kit's tokens follow shadcn's meaning, where `--input` is a field's border
 * and the field sits on the surface behind it. A catalog system that fills
 * its fields with `--input` would paint them in the kit's border grey. [BD-1163]
 */
const KIT_FIELD_CSS = ".ds-input,.ds-textarea,.ds-select{background-color:transparent;border-color:var(--input)}";

/** Reads the kit a Better Design project keeps; the stdio server passes the API call. [BD-1056] */
export type LoadProjectKit = (projectId: string) => Promise<ProjectFigmaKit>;

/** Keeps a screen on a Better Design project; the stdio server passes the API call. [BD-1056] */
export type SaveProjectScreen = (projectId: string, screen: { name: string; file: string; tree: PrototypeNode }) => Promise<ProjectScreenSaved>;

/** The project calls model mode makes, when the server can reach Better Design. [BD-1056] */
export interface ProjectCalls {
  loadKit: LoadProjectKit;
  saveScreen: SaveProjectScreen;
}

/**
 * Keeps the frame the plugin sent on the project, under the frame's name
 * [BD-1056]. The page does not depend on it, so a failed save is a sentence
 * in the answer rather than a failed call.
 */
async function keepScreen(saveScreen: SaveProjectScreen, projectId: string, file: string, tree: PrototypeNode): Promise<string> {
  try {
    const saved = await saveScreen(projectId, { name: tree.name, file, tree });
    return `The screen is kept on project ${projectId} as "${saved.name}" (${saved.screens} screen(s) there).`;
  } catch (error) {
    return `The screen was not kept on project ${projectId}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Where model mode takes its kit from: a file, a project, or neither. */
type KitSource = { kitPath?: string; project?: ProjectFigmaKit };

/**
 * The catalog system model mode builds with, wearing the client's kit when one
 * is given. A project's kit also brings its name map, so the page keeps each
 * client component as a named part. [BD-1056]
 */
/** The catalog system a model builds with, wearing the client's kit when one is named; the scoring script reuses it. [BD-1299] */
export async function modelDesignSystem(systemId: string, source: KitSource, theme: string | undefined): Promise<ModelDesignSystem | { error: string }> {
  const system = await loadModelDesignSystem(systemId);
  if (!system) {
    return { error: `Could not load a catalog design system named "${systemId}". Check the id with find-design-system; if it is right, the registry may be down.` };
  }
  if (source.project) {
    const worn = withKit(system, source.project.kit, theme);
    return "error" in worn ? worn : { ...worn, clientParts: source.project.nameMap };
  }
  if (!source.kitPath) return system;
  const kit = await kitFromFile(source.kitPath);
  return "error" in kit ? kit : withKit(system, kit, theme);
}

/** Registers `create-figma-prototype` on a stdio server. */
export function registerFigmaPrototypeTool(server: McpServer, projectCalls?: ProjectCalls) {
  server.registerTool(
    "create-figma-prototype",
    {
      title: "Create an HTML prototype from a Figma frame",
      description: [
        "Reads a frame from the Figma file the designer has open and returns it as one HTML page,",
        "built from the same components the design system ships. Name a frame, or omit the name to",
        "take whatever is selected in Figma. The Better Design plugin must be open in that file:",
        "run Plugins, Development, Better Design once and leave the panel open.",
        "Every layer that could not map is reported rather than dropped.",
        "For a frame from a file that was not built from a Better Design library, pass mode \"model\" and a",
        "catalog design system. The designer confirms in the plugin panel. By default you rebuild the frame",
        "yourself: the tool returns a prompt file and the frame's image, you write the answer to a file, and",
        "you call this tool again with frameId and answerPath so it checks the page and reports what is missing.",
        "Pass a projectId whose project keeps a client's Figma kit to build with that kit, and the page keeps",
        "each client component as a named part.",
      ].join(" "),
      inputSchema: z.object({
        frame: z.string().optional().describe("The frame's name as it reads in Figma. Omit to use the current selection."),
        outputPath: z.string().optional().describe("Where to write the HTML. Relative paths resolve against the working directory."),
        mode: z.enum(["library", "model"]).optional().describe(
          "library (the default) maps components from a Better Design library. model asks a model to rebuild a frame from any file.",
        ),
        system: z.string().optional().describe("Model mode: the catalog design system to build with, as find-design-system names it."),
        provider: z.enum(["agent", "openai-compatible"]).optional().describe(
          "Model mode: agent (the default) hands the frame to you to rebuild; openai-compatible calls a local server, Ollama by default.",
        ),
        model: z.string().optional().describe(`Model mode with openai-compatible: the local model id. Defaults to ${DEFAULT_LOCAL_MODEL}.`),
        method: z.enum(["page", "blocks"]).optional().describe(
          "Model mode: page (the default) has the model write the whole page. blocks draws the frame in code first, so layout, text and icons match Figma, and the model only turns the client's components into working parts. blocks suits a cheaper model.",
        ),
        frameId: z.string().optional().describe("Model mode, second call: the frameId the first call returned."),
        answerPath: z.string().optional().describe("Model mode, second call: the file holding your answer, as the prompt file asks."),
        kitPath: z.string().optional().describe(
          "Model mode: a kit file from read-figma-kit. The page then uses that kit's colours, font and radius on the system's parts.",
        ),
        theme: z.string().optional().describe("Model mode with a kit: the kit's brand theme, such as Matrix. Defaults to the kit's first theme."),
        projectId: z.guid().optional().describe(
          "Model mode: a Better Design project that keeps a Figma kit from read-figma-kit. The page wears that kit, builds with the project's design system unless system is given, and keeps each client component as a named part.",
        ),
        drawInFigma: z.boolean().optional().describe(
          "Model mode, second call: also draw the finished page on a new page of the open Figma file, each named part as an instance of the client's component found on the page Figma shows when the draw starts, so keep the frame's page open. Use a copy of the client's file; the designer confirms in the plugin panel.",
        ),
      }),
      outputSchema: z.object({
        status: z.enum(["completed", "failed", "needs-answer"]),
        message: z.string(),
        frameId: z.string().optional(),
        promptPath: z.string().optional(),
        imagePath: z.string().optional(),
        path: z.string().optional(),
        components: z.number().optional(),
        report: z.array(z.object({ name: z.string(), reason: z.string() })).optional(),
        model: z.string().optional(),
      }),
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ frame, outputPath, mode, system, provider: providerId, model, method, frameId, answerPath, kitPath, theme, projectId, drawInFigma: draw }) => {
      const failed = (message: string) => ({
        content: [{ type: "text" as const, text: message }],
        structuredContent: { status: "failed" as const, message },
        isError: true,
      });
      const completed = async (page: PrototypePage, modelName?: string) => {
        let path: string | undefined;
        if (outputPath) {
          path = resolve(process.cwd(), outputPath);
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, page.html, "utf8");
        }
        const message = [page.summary, path ? `Written to ${path}.` : "", describe(page.report)].filter(Boolean).join(" ");
        return {
          content: [{ type: "text" as const, text: path ? message : `${message}\n\n${page.html}` }],
          structuredContent: { status: "completed" as const, message, path, components: page.components, report: page.report, model: modelName },
        };
      };

      // The second call of the agent path: the answer comes back, and Figma is
      // not needed again. [BD-866]
      if (frameId || answerPath) {
        if (!frameId || !answerPath) return failed("Pass both frameId and answerPath to finish a model-mode page.");
        const file = resolve(process.cwd(), answerPath);
        const info = await stat(file).catch(() => null);
        if (!info) return failed(`No answer file at ${file}.`);
        // A device or pipe reports no size, so only a regular file is read.
        if (!info.isFile()) return failed(`${file} is not a regular file.`);
        if (info.size > ANSWER_LIMIT_BYTES) return failed(`The answer file is ${info.size} bytes; a page this size is not a single frame.`);
        let finished: ReturnType<typeof finishHandoff>;
        try {
          finished = finishHandoff(frameId, await readFile(file, "utf8"));
        } catch (error) {
          return failed(`Could not finish the page: ${error instanceof Error ? error.message : String(error)}. Fix the answer file and call again.`);
        }
        if (!finished) return failed(`No frame waits under frameId "${frameId}". Ask for the frame again with mode "model".`);
        const summary = `The page for ${finished.frameName} is built from ${finished.systemId} components.`;
        const drawn = draw ? await drawInFigma(finished.frameName, finished.html, finished.width, finished.height) : null;
        const drawNote = !drawn ? "" : "error" in drawn ? ` It was not drawn in Figma: ${drawn.error}` : ` ${drawn.note}`;
        return completed({ html: finished.html, report: finished.report, summary: `${summary}${drawNote}` });
      }

      const started = await ensureRelay();
      if (!started) {
        return failed("Another Better Design session already owns the Figma relay port. Close it and try again.");
      }
      const plugin = await waitForPlugin(started);
      if (!plugin) return failed(noPluginMessage());

      // Model mode checks its settings and loads the design system before
      // Figma is asked for anything, so a wrong id fails at once instead of
      // after the designer confirms the export. [BD-866]
      let modelRun:
        | { kind: "agent"; designSystem: ModelDesignSystem }
        | { kind: "local"; provider: ModelProvider; designSystem: ModelDesignSystem }
        | null = null;
      if (mode === "model") {
        if (projectId && kitPath) return failed("Pass kitPath or projectId, not both: each one names the kit to build with.");
        let project: ProjectFigmaKit | undefined;
        if (projectId) {
          if (!projectCalls) return failed("This server cannot reach a Better Design project. Run the stdio server with an API key.");
          try {
            project = await projectCalls.loadKit(projectId);
          } catch (error) {
            return failed(`Could not read the kit on project ${projectId}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        const systemId = system?.trim() || project?.designSystemId;
        if (!systemId) return failed("Model mode needs a design system: pass system, a catalog id from find-design-system.");
        let provider: ModelProvider | null = null;
        if (providerId === "openai-compatible") {
          try {
            provider = localModelProvider(model, {
              BETTER_DESIGN_MODEL_BASE_URL: process.env.BETTER_DESIGN_MODEL_BASE_URL,
              BETTER_DESIGN_MODEL_API_KEY: process.env.BETTER_DESIGN_MODEL_API_KEY,
            });
          } catch (error) {
            if (error instanceof ModelProviderError) return failed(error.message);
            throw error;
          }
        }
        const designSystem = await modelDesignSystem(systemId, { kitPath, project }, theme);
        if ("error" in designSystem) return failed(designSystem.error);
        modelRun = provider ? { kind: "local", provider, designSystem } : { kind: "agent", designSystem };
      }

      const { answer } = started.queue.ask(frame, mode);
      const result = await answer;
      if (result.error) return failed(result.error);
      if (result.frames) return failed(missingFrameMessage(frame ?? "", result.frames));
      const screenNote = modelRun && projectId && projectCalls && result.tree
        ? await keepScreen(projectCalls.saveScreen, projectId, plugin.file, result.tree)
        : "";

      if (modelRun?.kind === "agent") {
        // The agent path: the caller is the model, on its own subscription.
        if (!result.tree) return failed("The plugin sent no frame. Update the Better Design plugin and try again.");
        const handoff = await startHandoff({
          frame: result.tree,
          png: result.png,
          designSystem: modelRun.designSystem,
          pluginReport: modelModeNotes(result.report),
          method,
        });
        const message = [
          screenNote,
          `Read ${handoff.promptPath}${handoff.imagePath ? ` and look at ${handoff.imagePath}` : ""}.`,
          "Write your answer to a file exactly as the prompt asks, then call create-figma-prototype",
          `with frameId "${handoff.frameId}", answerPath set to that file${outputPath ? `, and outputPath "${outputPath}"` : " and an outputPath"}.`,
        ].filter(Boolean).join(" ");
        return {
          content: [{ type: "text" as const, text: message }],
          structuredContent: { status: "needs-answer" as const, message, ...handoff },
        };
      }

      if (modelRun?.kind === "local") {
        const rebuilt = await rebuildWithModel(result, modelRun.designSystem, modelRun.provider, method ?? "page");
        if ("error" in rebuilt) return failed(rebuilt.error);
        return completed(screenNote ? { ...rebuilt, summary: `${rebuilt.summary} ${screenNote}` } : rebuilt, modelRun.provider.model);
      }

      if (!result.html) return failed("The plugin returned no HTML.");
      const components = result.components ?? 0;
      return completed({
        html: result.html,
        report: result.report,
        components,
        summary: `${components} component(s) from ${result.frame ?? frame ?? "the selection"} in ${plugin.file} mapped to live markup.`,
      });
    },
  );
}

/** Keeps a kit on a Better Design project; the stdio server passes the API call. [BD-1056] */
export type SaveProjectKit = (projectId: string, kit: FigmaKit) => Promise<ProjectFigmaKitSaved>;

/**
 * Registers `read-figma-kit` on a stdio server. It shares this module's relay,
 * because one port serves both tools. With `saveKit`, a projectId also keeps
 * the kit on that project. [BD-1056]
 */
export function registerFigmaKitTool(server: McpServer, saveKit?: SaveProjectKit) {
  server.registerTool(
    "read-figma-kit",
    {
      title: "Read a Figma kit",
      description: [
        "Reads the design kit in the Figma file the designer has open: every variable in every mode,",
        "the text and effect styles, and every component with the options of its variant properties.",
        "Writes them as one JSON file and returns the counts. The Better Design plugin must be open in",
        "that file, and the designer confirms the read in the plugin panel. Only the file's own items are",
        "read; a library the file uses is read from its own file. Pass a projectId to also keep the kit on",
        "that Better Design project, so later calls build with the client's own names and values.",
      ].join(" "),
      inputSchema: z.object({
        outputPath: z.string().describe("Where to write the kit JSON. Relative paths resolve against the working directory."),
        projectId: z.guid().optional().describe("A Better Design project id. The kit is kept on it, replacing the one it held."),
      }),
      outputSchema: z.object({
        status: z.enum(["completed", "failed"]),
        message: z.string(),
        path: z.string().optional(),
        file: z.string().optional(),
        collections: z.number().optional(),
        variables: z.number().optional(),
        textStyles: z.number().optional(),
        effectStyles: z.number().optional(),
        components: z.number().optional(),
        projectId: z.string().optional(),
        gaps: z
          .array(
            z.object({
              component: z.string(),
              page: z.string(),
              reason: z.enum(["many-variant-properties", "no-use-rule", "no-match-in-code", "name-differs-from-code"]),
              detail: z.string(),
            }),
          )
          .optional(),
        nameMap: z
          .array(z.object({ component: z.string(), part: z.string().nullable(), match: z.enum(["same", "family", "none"]) }))
          .optional(),
      }),
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ outputPath, projectId }) => {
      const failed = (message: string) => ({
        content: [{ type: "text" as const, text: message }],
        structuredContent: { status: "failed" as const, message },
        isError: true,
      });
      const started = await ensureRelay();
      if (!started) {
        return failed("Another Better Design session already owns the Figma relay port. Close it and try again.");
      }
      if (projectId && !saveKit) return failed("This server cannot reach a Better Design project. Run the stdio server with an API key.");
      if (!(await waitForPlugin(started))) return failed(noPluginMessage());

      const { answer } = started.queue.ask(undefined, undefined, "kit");
      const result = await answer;
      if (result.error) return failed(result.error);
      if (!result.kit) return failed("The plugin sent no kit. Update the Better Design plugin and try again.");

      const kit = result.kit;
      const path = resolve(process.cwd(), outputPath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(kit, null, 2)}\n`, "utf8");
      const { file, ...counts } = kitCounts(kit);
      let message =
        `${file}: ${counts.components} component(s), ${counts.variables} variable(s) in ${counts.collections} collection(s), ` +
        `${counts.textStyles} text style(s) and ${counts.effectStyles} effect style(s). Written to ${path}.`;
      let gaps: KitGap[] | undefined;
      let nameMap: KitNameMatch[] | undefined;
      if (projectId && saveKit) {
        // The file is already written, so a failed save still leaves the agent the kit. [BD-1056]
        try {
          ({ gaps, nameMap } = await saveKit(projectId, kit));
          // The gaps lead the answer: they are what the client must fix first.
          message = `${describeKitGaps(gaps)}\n\n${message} Kept on project ${projectId}.`;
        } catch (error) {
          return failed(`${message} The kit was not kept on project ${projectId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return {
        content: [{ type: "text" as const, text: message }],
        structuredContent: { status: "completed" as const, message, path, file, ...counts, projectId, gaps, nameMap },
      };
    },
  );
}
