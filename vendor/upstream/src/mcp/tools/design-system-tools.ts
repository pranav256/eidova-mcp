import { formatProjectIdLine } from "../project-id-line";
import { nativeVerifyText } from "../native-verify";
import { z } from "zod";
import type { DsTopResult } from "../../design-systems/record-search";
import type { DesignSystemSearchResult } from "../data-provider";
import { GUARDRAILS_SETUP_MD } from "../guardrails";
import { PRESENTATION_RUNTIME_RULE } from "../presentation-runtime";
import {
  buildDsHtmlKit,
  DS_KIT_CSS,
  DS_KIT_EXAMPLE_HTML,
  HTML_KIT_CONDUCT_MD,
  HOST_ISOLATION_CSS_TEMPLATE,
  HOVER_POLICY,
  INLINE_COMPOSITION_POLICY,
  INLINE_HIERARCHY_POLICY,
  INLINE_TEXT_COLOR_POLICY,
  MINIMUM_TEXT_CONTRAST,
} from "../html-kit";
import { tokensCssToDtcgJson } from "../dtcg";
import { parseMobilePrimitiveSet, type MobilePrimitiveSet, type MobileTarget } from "../mobile-primitives";
import { buildDsShopifyKit, SHOPIFY_KIT_CONDUCT_MD } from "../shopify-kit";
import { DESIGN_TRADEOFF_RULE, withRedesignContract } from "../redesign-contract";
import { catalogKitIcons, selectedIconSchema, withSelectedKitIcons, type SelectedKitIcons } from "../selected-icon-handoff";
import { buildStoreScreenshotFiles, storeScreenshotInstructions, storeScreenshotText } from "../store-screenshots";
import { formatComponentRulesForKit, matchComponentRuleTopics } from "../component-rules";
import {
  parseShopifyPrimitiveSet,
  type ShopifyPrimitiveSet,
} from "../shopify-primitives";
import type { ToolRegistrationOptions } from "../tools";
import {
  buildDsComponentCss,
  componentDepthCss,
  componentRadiusCss,
  cssFromRegistryVars,
  extractFontCss,
  extractRadiusScaleCss,
  extractShadowScaleCss,
  DS_PREVIEW_WIDGET_URI,
} from "../preview-html";
import { BUILD_LOOP } from "../build-loop";
import { BASE_UI_PROPS, controlMap, screenSkeleton } from "../page-skeleton";
import { flowScaffold } from "../flow-scaffold";
import { kitApiIndex } from "../kit-api-index";
import { installKitIcons } from "../kit-icons";
import type { McpAuthContext, RegisterToolDeps } from "./shared";
import { REFERENCES_LINE, referenceScreens, screenQuery, type KitContentBlock } from "../mobile-kit-references";
import { swiftUiStarterFile, swiftUiStarterNote } from "../swiftui-starter";
import {
  ANTI_MOCKUP_MD,
  APP_BASE_URL,
  buildKitOutputSchema,
  BUILD_INSTRUCTIONS_FIELD,
  BUILD_TARGET_RULE,
  buildTargetRuleFor,
  codingHostName,
  CONTEXT_ARG,
  extractOutputPreview,
  PREVIEW_OUTPUT_SCHEMA,
  READ_ONLY_TOOL_ANNOTATIONS,
  REGISTRY_BASE_URL,
  REQUIREMENTS_MD,
} from "./shared";
import { isString } from "../../guards";
import {
  fetchCatalog,
  fetchCatalogTokensCss,
  tokensCssFromRegistry,
  type RegistryFile,
} from "../catalog-tokens";
import { densityKitNote } from "../../inspection/density";


// Readies the project for `shadcn add`, and does nothing when `components.json`
// exists. In a Vite project it adds Tailwind v4 and the @/* alias first, which a
// hand-made scaffold lacks and `shadcn init` refuses to add. Only the local
// server names it: npm releases before `init` start the MCP server instead and
// hang, so the hosted kit keeps the plain shadcn init until a release ships it. [BD-1262]
const PREPARE_PROJECT = "npx -y better-design@latest init";
const SHADCN_INIT_IF_MISSING = "[ -f components.json ] || npx shadcn@latest init -d -y";
// -y -o: without them `add` asks "install a new style?" and "button.tsx already exists, overwrite?",
// and an agent with no terminal input stalls. -o replaces existing components/ui files.
const SHADCN_ADD = "npx shadcn@latest add -y -o";
// What a React kit tells the model about the local install: done, or on offer. [BD-1262]
interface LocalInstallHandoff {
  installedTo?: string;
  localInstall?: boolean;
}

// The kit's arguments on the local server, which sets the project up itself. [BD-1262]
const LOCAL_INSTALL_INPUT = z.object({
  install: z.boolean().optional()
    .describe("SwiftUI and React Native: leave this out. The server then writes the kit's theme and component files into the app folder, and for SwiftUI also a ContentView.swift holding a finished home screen built from them, only when the folder has none. It never writes an App struct, an Xcode project or a package. The reply lists the files instead of repeating their source. Pass false only when the user said not to touch their files. React: true makes this server create a Vite + React + TypeScript + Tailwind v4 project in an empty folder and install the whole design system into it; it refuses an existing project, where you run the kit's install commands yourself."),
  projectDir: z.string().optional()
    .describe("The absolute path of the project or app folder. Defaults to the folder this server runs in, which is the folder the user opened."),
});
const SAFE_COMPONENT_NAME_RE = /^[a-z0-9][a-z0-9-]*$/i;

/**
 * Creates a new Vite + React + TypeScript project with Tailwind v4, the `@/*`
 * alias and components.json in one non-interactive step. A local model that
 * hand-builds the project leaves the alias out, and `shadcn init` then stops.
 * [BD-1262]
 */
function newProjectCommand(library: "base" | "radix"): string {
  return `npx shadcn@latest init -t vite -b ${library} -p nova -n my-app -y --no-monorepo`;
}

function installCommandWithInit(installCommand: string, prepare: string): string {
  return `${prepare}\n\n${installCommand}`;
}

function authHeaders(authContext?: McpAuthContext): HeadersInit {
  if (!authContext) return {};
  const bearer = authContext.kind === "api-key" ? authContext.apiKey : authContext.accessToken;
  return { Authorization: `Bearer ${bearer}` };
}

/**
 * Inline-build steering: a model building an app INSIDE a ChatGPT canvas /
 * Claude artifact has no npm or Tailwind, so the shadcn install can't run.
 * Point it at get-design-system-kit target html (framework-free token + CSS kit) instead of
 * letting it ad-lib unstyled HTML that ignores the system. [BD-146]
 */
function inlineBuildMd(projectId: string): string {
  return `\n**Building inline (ChatGPT canvas / Claude artifact)?** There is no npm or Tailwind there, so the install above can't run. Call \`get-design-system-kit\` with \`target: "html"\` and projectId \`${projectId}\` to get this system's real tokens + a framework-free CSS kit you paste into one \`<style>\` and build with immediately.`;
}

/**
 * Token stylesheet for a *generated project* DS (vs a catalog DS). A freshly
 * created system has only a projectId, not a catalog id, so its tokens live in
 * the project's shadcn registry, not under /registry/<id>/. Lets
 * get-design-system-kit target html exports a custom DS for inline (canvas/artifact) builds
 * where the shadcn install can't run. [BD-146]
 */

async function fetchProjectTokensCss(
  projectId: string,
  apiFetch: typeof fetch,
  authContext?: McpAuthContext,
): Promise<{ tokensCss: string; name?: string; files: RegistryFile[]; iconLibrary?: SelectedKitIcons } | null> {
  try {
    const res = await apiFetch(`${APP_BASE_URL}/api/projects/${projectId}/registry/all.json`, {
      headers: authHeaders(authContext),
    });
    if (!res.ok) return null;
    // SAFETY: the JSON contract of this payload; the producing side owns the shape.
    const json = (await res.json()) as Parameters<typeof tokensCssFromRegistry>[0] & { name?: string; meta?: { iconLibrary?: unknown } };
    const parsedIcons = selectedIconSchema.safeParse(json.meta?.iconLibrary);
    return { tokensCss: tokensCssFromRegistry(json), name: json.name, files: json.files ?? [], iconLibrary: parsedIcons.success ? parsedIcons.data : undefined };
  } catch (err) {
    // Null reads as "project has no registry" to the caller; log so a dead
    // fetch is distinguishable (warn/error go to stderr, stdio-safe).
    console.warn(`fetchProjectTokensCss(${projectId}) failed`, err);
    return null;
  }
}

type ProjectShopifyPrimitives = {
  name: string;
  primitives: ShopifyPrimitiveSet;
};

function parseProjectShopifyPrimitives<TName, TValue>(
  projectId: string,
  name: TName | string,
  value: TValue,
): ProjectShopifyPrimitives | null {
  const primitives = parseShopifyPrimitiveSet(value);
  if (!primitives?.iconLibrary) return null;
  return {
    name: isString(name) ? name : `Project ${projectId.slice(0, 8)}`,
    primitives,
  };
}

/** The refusal for a caller outside the Shopify pilot, naming how to ask for access. [BD-417] */
function shopifyPilotDenied(name: string, subject: string, viewUrl: string): string {
  return `Shopify target unavailable. The Shopify kit is a private pilot and this API key is not in it, so the stored theme for ${name} was withheld. Nothing is wrong with the ${subject}. To join the pilot, email info@better-design.com. Until then, use target "react" or "html". See ${viewUrl}.`;
}

async function fetchProjectShopifyPrimitives(
  projectId: string,
  apiFetch: typeof fetch,
  authContext?: McpAuthContext,
): Promise<ProjectShopifyPrimitives | null> {
  try {
    const res = await apiFetch(
      `${APP_BASE_URL}/api/projects/${projectId}/shopify/all.json`,
      { headers: authHeaders(authContext) },
    );
    if (!res.ok) return null;
    // SAFETY: the JSON contract of this payload; the producing side owns the shape.
    const json = (await res.json()) as {
      name?: unknown;
      shopifyPrimitives?: unknown;
    };
    return parseProjectShopifyPrimitives(
      projectId,
      json.name,
      json.shopifyPrimitives,
    );
  } catch (err) {
    console.warn(`fetchProjectShopifyPrimitives(${projectId}) failed`, err);
    return null;
  }
}

function completedHtmlKitStructuredContent(
  name: string,
  viewUrl: string,
  tokensCss: string,
  componentMaterialCss = "",
) {
  return {
    status: "completed",
    name,
    viewUrl,
    buildInstructions: HTML_KIT_CONDUCT_MD,
    requiredWrapperClass: "ds" as const,
    requiredComponentClassPrefix: "ds-" as const,
    customCssScope: "layout-only" as const,
    hoverPolicy: HOVER_POLICY,
    hostIsolationCssTemplate: HOST_ISOLATION_CSS_TEMPLATE,
    minimumTextContrast: MINIMUM_TEXT_CONTRAST,
    textColorPolicy: INLINE_TEXT_COLOR_POLICY,
    hierarchyPolicy: INLINE_HIERARCHY_POLICY,
    compositionPolicy: INLINE_COMPOSITION_POLICY,
    componentCss: DS_KIT_CSS,
    componentMaterialCss,
    componentExampleHtml: DS_KIT_EXAMPLE_HTML,
    tokensCss,
  };
}

function completedShopifyKitStructuredContent(
  name: string,
  viewUrl: string,
  tokensCss: string,
  themeFiles: Array<{ path: string; content: string }>,
) {
  return {
    status: "completed",
    name,
    viewUrl,
    buildInstructions: SHOPIFY_KIT_CONDUCT_MD,
    supportedInstallationScope: "full-storefront-only" as const,
    requiredWrapperClass: "ds" as const,
    requiredComponentClassPrefix: "ds-" as const,
    customCssScope: "layout-only" as const,
    hoverPolicy: HOVER_POLICY,
    minimumTextContrast: MINIMUM_TEXT_CONTRAST,
    textColorPolicy: INLINE_TEXT_COLOR_POLICY,
    themeFiles,
    tokensCss,
  };
}

function completedShopifyKitResult(
  name: string,
  viewUrl: string,
  source:
    | { kind: "catalog"; designSystemId: string }
    | { kind: "project"; projectId: string },
  primitives: ShopifyPrimitiveSet,
) {
  const { tokensCss, themeFiles } = primitives;
  return withSelectedKitIcons({
    content: [{
      type: "text" as const,
      text: buildDsShopifyKit({ name, tokensCss, viewUrl, source, themeFiles }),
    }],
    structuredContent: {
      ...completedShopifyKitStructuredContent(name, viewUrl, tokensCss, themeFiles),
      iconMaterialStatus: primitives.iconMaterialVersion === 2 ? "current" : "legacy-unverified",
    },
  }, primitives.iconLibrary);
}

const DS_INDEX_SCHEMA = z.object({
  baseComponents: z.array(z.object({ name: z.string() })).optional(),
});

/**
 * Names of the DS's Base UI variant registry items (`<name>-base`), read from
 * the DS index.json. Empty set = the DS has no Base UI port yet, so the docs
 * tool falls back to the Radix install command with a note. [BD-210]
 */
async function fetchBaseVariantNames(designSystemId: string): Promise<Set<string>> {
  try {
    const res = await fetch(`${REGISTRY_BASE_URL}/${designSystemId}/index.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return new Set();
    const parsed = DS_INDEX_SCHEMA.safeParse(await res.json());
    if (!parsed.success) return new Set();
    return new Set((parsed.data.baseComponents ?? []).map((c) => c.name));
  } catch {
    // Registry unreachable or index malformed: same as "no Base UI port", and
    // the docs tool falls back to the Radix command with a note (see doc above).
    return new Set();
  }
}

// A product page follows the product-pages principles, but a plain build
// request never reached them. Name them here, where the agent decides what it
// is building. "app store" is excluded: those are screenshots, not a shop. [BD-307]
const COMMERCIAL_QUERY = /\b(product pages?|pdp|shops?|(?<!app )stores?|storefront|e-?commerce|webshop|dtc|d2c|shopify|checkout|buy box)\b|[$€£]\s?\d/i;
const PRODUCT_PAGE_POINTER = 'This looks like a product page or a store. Before you build, call `get-ui-principle({ topic: "product-pages" })` for section order by buyer objection, the squint test and buyer-matched tone. For a catalog or checkout, also call `get-ux-principle` with topic `commerce-catalog` or `commerce-checkout`.';

// What the kit says when it wrote the starting flow into App.tsx. [BD-1285]
const SCAFFOLD_NOTE = "`App.tsx` already holds a working three-step flow built from this design system: its stepper, tabs that filter item cards with icons, a day toggle group, a time picker, a switch, a multi-select and radio buttons, with a side panel. It builds as it is. Change it in place with the edit tool, never by rewriting the file: replace the items, titles and copy with the real ones and adapt the steps to the request. Keep every component it uses, the full-width layout and the side panel. Every control comes from `components/ui`: never write a button row, a list or an input where an installed component does that job.";

export function registerDesignSystemTools({
  server,
  provider,
  tracked,
  track,
  authContext,
  apiFetch = globalThis.fetch,
  installKit,
  writeIcons,
  writeKitFiles,
  readInspiration,
}: RegisterToolDeps, { enableShopifyKit = true, enableMobileKits = true }: ToolRegistrationOptions = {}): void {
  const prepareProject = installKit ? PREPARE_PROJECT : SHADCN_INIT_IF_MISSING;
  const searchInputSchema = z.object({
    query: z.string().describe(
      "The user's app, UI, industry, or visual direction. Examples: 'World Cup betting app for friends', 'warm editorial ecommerce', or 'professional fintech dashboard'.",
    ),
  });

  const searchDescription = (): string =>
    `Use this when the user asks to build, create, design, redesign, improve, search, browse, or compare any app, website, page, dashboard, component, UI, or design system. It also applies to pitch decks, presentations, and slide systems. This is the required first step for UI builds even when the user does not mention Better Design, branding, or design systems. Call it before a generic coding, canvas, artifact, or site-building tool, including presentation builders, so the eventual build receives a real design system and the mandatory review guardrails.

${PRESENTATION_RUNTIME_RULE}

${DESIGN_TRADEOFF_RULE}

This starts the Better Design build workflow by searching the catalog for relevant brand foundations and returning ranked matches with Preview links. Indirect requests such as "build me a World Cup betting app", "make a landing page", or "improve this form" should trigger this tool.

Do not use this for backend-only work, data analysis, copywriting, or requests with no UI, frontend, design, or accessibility outcome.

**On a "build/make me <app>" request, call this FIRST.** If a design system is already selected, retain it and its assigned icons; do not restart brand selection or generation unless requested. Otherwise show the user the top ~4 matches (name + Preview link, NOT scores) as starting points and ASK which they want to base their brand on, or whether to go fully custom. Then pass the chosen id to create-design-system as \`baseDesignSystemId\`. Don't auto-pick or skip straight to generating, the user should choose the direction.

**Recommend by buyer, never by the product's material or subject.** A steel tool does not need a steel-dark UI; a coffee brand does not need a brown one. When presenting the matches, explain each option's expected fit for the known buyer and its trade-offs; do not claim conversion effects without evidence. For ecommerce and DTC product pages, default to light, warm, photography-led systems unless the brand already owns a dark identity; dark technical systems suit developer tools and dashboards, not impulse purchases.

Search by:
- Industry (fintech, education, travel, developer tools)
- Personality traits (professional, playful, minimal, warm)
- Natural language descriptions of the UI you want

Examples:
- "fintech startup" → Stripe design system
- "playful education app" → Duolingo design system
- "minimal developer tools" → Linear design system`;

  const formatCatalogMatches = (results: DesignSystemSearchResult[]) => results
    .map((r) =>
      [
        // Markdown link so the NAME is clickable in the host (Claude Code,
        // ChatGPT, claude.ai all render markdown links). Keep it intact when
        // presenting so the user can open the preview in one click.
        `### [${r.title}](${APP_BASE_URL}/design-systems/${r.id})`,
        r.description,
        `_${r.personality.join(", ")}_ · id: \`${r.id}\``,
      ].join("\n"),
    )
    .join("\n\n");

  // A host that skips find-design-system still gets the choice in front of the
  // user: without a pick, a brand sheet or a confirmed custom request, the tool
  // returns the options and generates nothing. Prose alone did not stop it. [BD-219]
  const askForBaseChoice = async (prompt: string) => {
    const heading = "# Choose a starting point first\n\nNothing was generated.";
    try {
      const results = await provider.searchDesignSystems(prompt, 4);
      if (results.length === 0) {
        return `${heading} No catalog system matched this prompt. Ask the user whether to go fully custom, then call create-design-system again with \`userConfirmedCustom: true\`.`;
      }
      return `${heading} Show the user these options, keeping each name as its clickable link, and ask which to start from or whether to go fully custom. Then call create-design-system again with the chosen \`id\` as \`baseDesignSystemId\`, or with \`userConfirmedCustom: true\` if the user chose fully custom. Do not pick for the user.\n\n---\n\n${formatCatalogMatches(results)}`;
    } catch (error) {
      console.warn("[create-design-system] the catalog search failed:", error);
      return `${heading} The catalog search failed, so call \`find-design-system\` with the app description, show the user the top matches, and ask which to start from or whether to go fully custom.`;
    }
  };

  // What the agent does with the matches. The text and the structured result
  // both carry it: Claude Code shows the model the structured result in place of
  // the text, and an agent that never reads it writes the page without the kit,
  // the principles or the review. [BD-1147]
  const MATCH_INSTRUCTIONS = `Keep any already selected design system and its assigned icons; do not reopen that choice unless requested. If none is selected, present these as options, keeping each name as its clickable markdown link (no scores) so they can open the preview. Explain each option's expected buyer fit and trade-offs using known project context; do not claim conversion effects without evidence. Recommend by buyer, never by the product's material or subject (a steel tool does not need a steel-dark UI). For ecommerce and DTC product pages, default to light, warm, photography-led systems unless the brand already owns a dark identity. Ask which to start their brand from, or to go fully custom, then pass the chosen \`id\` as \`baseDesignSystemId\` to create-design-system, or pass \`userConfirmedCustom: true\` if they choose fully custom. If no person is there to answer, as in an unattended run, take the top match whose buyer and colour scheme fit yourself (a consumer app never takes a system made for developer tools; a dark or two-theme site needs a system with a dark mode), say which one you took and why, and call \`get-design-system-kit\` with its \`id\`.`;

  const makeSearchHandler =
    (toolName: string, includeBuildRules = false) =>
    async ({ query }: { query: string }) => {
      const start = Date.now();
      const finish = <T>(response: T, topResults: DsTopResult[], isError = false, errorMessage?: string): T => {
        track(toolName, { query, topResults }, {
          durationMs: Date.now() - start,
          errorMessage,
          isError,
          outputPreview: extractOutputPreview(response),
        });
        return response;
      };
      try {
        const results = await provider.searchDesignSystems(query, 5);
        const topResults = results.map((r) => ({ id: r.id, score: r.matchScore }));

        if (results.length === 0) {
          return finish(
            {
              content: [{
                type: "text" as const,
                text: `No design systems found matching your query.\n\n${BUILD_LOOP}\n\n${includeBuildRules ? buildTargetRuleFor(query, { mobileKits: enableMobileKits }) : DESIGN_TRADEOFF_RULE}`,
              }],
              structuredContent: { buildInstructions: `${BUILD_LOOP}\n\n${includeBuildRules ? buildTargetRuleFor(query, { mobileKits: enableMobileKits }) : DESIGN_TRADEOFF_RULE}`, matches: [] },
            },
            topResults,
          );
        }

        const productPagePointer = COMMERCIAL_QUERY.test(query) ? `\n\n${PRODUCT_PAGE_POINTER}` : "";
        return finish(
          {
            content: [{
              type: "text" as const,
              text: `# Catalog matches\n\n${BUILD_LOOP}\n\n${MATCH_INSTRUCTIONS}${productPagePointer}\n\n---\n\n${formatCatalogMatches(results)}\n\n---\n\n${includeBuildRules ? buildTargetRuleFor(query, { mobileKits: enableMobileKits }) : DESIGN_TRADEOFF_RULE}`,
            }],
            // Named fields for callers that read fields, such as a Zap step
            // [BD-1142], plus the instructions for agents that read only this. [BD-1147]
            structuredContent: {
              // The loop comes first, so an agent reads it before the matches. [BD-1148]
              buildInstructions: `${BUILD_LOOP}\n\n${MATCH_INSTRUCTIONS}${productPagePointer}\n\n${includeBuildRules ? buildTargetRuleFor(query, { mobileKits: enableMobileKits }) : DESIGN_TRADEOFF_RULE}`,
              matches: results.map((r) => ({
                id: r.id,
                name: r.title,
                description: r.description,
                personality: r.personality.join(", "),
                previewUrl: `${APP_BASE_URL}/design-systems/${r.id}`,
              })),
            },
          },
          topResults,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return finish(
          { content: [{ type: "text" as const, text: `Error: ${message}` }] },
          [],
          true,
          message,
        );
      }
    };

  // One discovery entry point for both build intent and catalog browsing.
  // The action-oriented title/description keeps generic app requests routed
  // through Better Design without exposing a duplicate routing-only tool.
  server.registerTool(
    "find-design-system",
    {
      title: "Find a Design System for a UI Build",
      description: searchDescription(),
      inputSchema: searchInputSchema,
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    makeSearchHandler("find-design-system", true),
  );

  const getHtmlKit = async ({
    designSystemId,
    projectId,
    context,
  }: {
    designSystemId?: string;
    projectId?: string;
    context?: string;
  }) => tracked("get-design-system-kit", { target: "html", designSystemId, projectId, context }, async () => {
    if (projectId) {
      const viewUrl = `${APP_BASE_URL}/projects/${projectId}`;
      const host = codingHostName(server);
      if (host) {
        return {
          content: [{
            type: "text" as const,
            text: `You appear to be in ${host}, a coding environment with a filesystem. Do not use the inline HTML kit for this generated project. Call \`get-design-system-status\` with projectId \`${projectId}\` and run the React install command it returns.`,
          }],
          structuredContent: { status: "error", name: `Project ${projectId.slice(0, 8)}`, viewUrl, tokensCss: "" },
        };
      }
      const result = await fetchProjectTokensCss(projectId, apiFetch, authContext);
      if (!result?.tokensCss) {
        return {
          content: [{ type: "text" as const, text: `Could not load tokens for project "${projectId}". It may still be generating, or the id is wrong. Check ${viewUrl}.` }],
          structuredContent: { status: "error", name: `Project ${projectId.slice(0, 8)}`, viewUrl, tokensCss: "" },
        };
      }
      const componentKit = buildDsComponentCss(result.files);
      const name = result.name ?? `Project ${projectId.slice(0, 8)}`;
      const text = buildDsHtmlKit({
        name,
        tokensCss: result.tokensCss,
        viewUrl,
        source: { kind: "project", projectId },
        componentKit,
      });
      return withSelectedKitIcons({
        content: [{ type: "text" as const, text }],
        structuredContent: completedHtmlKitStructuredContent(
          name,
          viewUrl,
          result.tokensCss,
          componentKit.css,
        ),
      }, result.iconLibrary);
    }
    if (!designSystemId) {
      return {
        content: [{ type: "text" as const, text: "For target html, pass either a catalog designSystemId (from find-design-system) or a projectId (from create-design-system)." }],
        structuredContent: { status: "error", name: "Missing design system", tokensCss: "", buildInstructions: "For target html, pass either a catalog designSystemId (from find-design-system) or a projectId (from create-design-system)." },
      };
    }
    const ds = await provider.getDesignSystemById(designSystemId, {
      includeComponents: false,
      includeHtml: true,
    });
    if (!ds) {
      return {
        content: [{ type: "text" as const, text: `Design system "${designSystemId}" not found. Call find-design-system first to get a valid id, or pass a projectId for a generated system.` }],
        structuredContent: { status: "error", name: designSystemId, tokensCss: "" },
      };
    }
    const viewUrl = `${APP_BASE_URL}/design-systems/${designSystemId}`;
    const icons = await catalogKitIcons(ds.metadata, provider);
    const host = codingHostName(server);
    const steer = host
      ? `> ⚠️ **You appear to be in ${host}, a coding environment with a filesystem.** Call \`get-design-system-kit\` with \`target: "react"\` and run the shadcn install instead of shipping a standalone HTML file. The HTML target is only for inline chat canvases (ChatGPT / Claude artifacts) that cannot run a build.\n\n`
      : "";

    if (ds.metadata.html) {
      const intro = `Framework-free HTML/CSS version of **${ds.metadata.title}**. One self-contained document: every component rendered with the exact compiled CSS inline, no JS, no build. Render it directly in a ChatGPT canvas / Claude artifact, or lift the markup + \`<style>\` you need. Full live showcase: ${viewUrl}\n\n`;
      const longestRun = Math.max(0, ...[...ds.metadata.html.matchAll(/`+/g)].map((m) => m[0].length));
      const fence = "`".repeat(Math.max(3, longestRun + 1));
      const { tokensCss, files } = await fetchCatalog(designSystemId);
      const componentMaterialCss = buildDsComponentCss(files).css;
      return withSelectedKitIcons({
        // Put the mandatory conduct block before the potentially huge stored
        // document so hosted agents cannot truncate it away. [BD-240]
        content: [{ type: "text" as const, text: `${steer}${intro}${HTML_KIT_CONDUCT_MD}\n\n${fence}html\n${ds.metadata.html}\n${fence}` }],
        structuredContent: completedHtmlKitStructuredContent(
          ds.metadata.title,
          viewUrl,
          tokensCss,
          componentMaterialCss,
        ),
      }, icons);
    }

    const { tokensCss, files } = await fetchCatalog(designSystemId);
    if (!tokensCss) {
      return {
        content: [{ type: "text" as const, text: `Could not load tokens for "${designSystemId}". The full live showcase is at ${viewUrl}.` }],
        structuredContent: { status: "error", name: ds.metadata.title, viewUrl, tokensCss: "" },
      };
    }
    const componentKit = buildDsComponentCss(files);
    const text = buildDsHtmlKit({
      name: ds.metadata.title,
      tokensCss,
      viewUrl,
      source: { kind: "catalog", designSystemId },
      componentKit,
    });
    return withSelectedKitIcons({
      content: [{ type: "text" as const, text: steer + text }],
      structuredContent: completedHtmlKitStructuredContent(
        ds.metadata.title,
        viewUrl,
        tokensCss,
        componentKit.css,
      ),
    }, icons);
  });

  // Shopify target: same catalog/project sources as the HTML target, rendered
  // as Liquid theme files. No coding-host refusal: theme work is filesystem
  // work, so every host may use it. [BD-341]
  /**
   * DTCG target: the token sheet as a W3C Design Tokens document.
   *
   * Unlike the other targets this ships no components, because DTCG describes
   * tokens only. It is what lets a Better Design system leave for a design
   * tool: Style Dictionary, Tokens Studio, Terrazzo, and the Figma plugins
   * that create variables all read this one format. [BD-517]
   */
  /**
   * Loads the token sheet a token-only target reads: a generated project's, or
   * a catalog system's from the registry, the same source the react and html
   * targets read. Null when the caller named neither.
   */
  const loadTokenSource = async ({ designSystemId, projectId }: { designSystemId?: string; projectId?: string }) => {
    if (projectId) {
      const result = await fetchProjectTokensCss(projectId, apiFetch, authContext);
      return {
        tokensCss: result?.tokensCss,
        name: result?.name ?? `Project ${projectId.slice(0, 8)}`,
        viewUrl: `${APP_BASE_URL}/projects/${projectId}`,
        icons: result?.iconLibrary,
      };
    }
    if (!designSystemId) return null;
    const ds = await provider.getDesignSystemById(designSystemId, { includeComponents: false, includeHtml: false });
    return {
      tokensCss: await fetchCatalogTokensCss(designSystemId),
      name: ds?.metadata.title ?? designSystemId,
      viewUrl: `${APP_BASE_URL}/design-systems/${designSystemId}`,
      icons: ds ? await catalogKitIcons(ds.metadata, provider) : undefined,
    };
  };

  const getDtcgKit = async ({
    designSystemId,
    projectId,
    context,
  }: {
    designSystemId?: string;
    projectId?: string;
    context?: string;
  }) => tracked("get-design-system-kit", { target: "dtcg", designSystemId, projectId, context }, async () => {
    const source = await loadTokenSource({ designSystemId, projectId });
    if (!source) {
      return {
        content: [{ type: "text" as const, text: "For target dtcg, pass either a catalog designSystemId (from find-design-system) or a projectId (from create-design-system)." }],
        structuredContent: { status: "error", name: "Missing design system", tokensCss: "", buildInstructions: "For target dtcg, pass either a catalog designSystemId (from find-design-system) or a projectId (from create-design-system)." },
      };
    }
    const { tokensCss, name, viewUrl, icons } = source;

    if (!tokensCss) {
      return {
        content: [{ type: "text" as const, text: `Could not load tokens for "${projectId ?? designSystemId}". A generated project may still be building. Check ${viewUrl}.` }],
        structuredContent: { status: "error", name, viewUrl, tokensCss: "" },
      };
    }

    const tokensJson = tokensCssToDtcgJson(tokensCss, name);
    const text = [
      `# ${name} design tokens (DTCG)`,
      "",
      "Write the JSON below to `tokens.json`. It is the W3C Design Tokens format, so it imports directly into Style Dictionary, Tokens Studio, Terrazzo, and Figma plugins that create variables.",
      "",
      'Colors are oklch, with a `hex` fallback, and a size, a time or a shadow arrives as the format\'s own value object. A CSS value the format cannot state, a `calc()` or a `var()`, keeps its string and carries no `$type`. Dark-mode values, when the system has them, sit in the top-level group marked `$extensions["com.better-design.mode"] = "dark"`, which is named `dark` unless a token of the system already owns that name. A name that is both a value and a group keeps its own value under `DEFAULT`.',
      "",
      "```json",
      tokensJson,
      "```",
      "",
      `Source: ${viewUrl}`,
    ].join("\n");

    return withSelectedKitIcons({
      content: [{ type: "text" as const, text }],
      structuredContent: { status: "completed" as const, name, viewUrl, tokensCss, tokensJson },
    }, icons);
  });

  /**
   * Store screenshots target: slide files styled from the system's tokens and
   * a render script that writes App Store and Google Play PNG files on the
   * user's own machine. Open to every plan, because nothing renders here.
   * [BD-966]
   */
  const getStoreScreenshots = async ({
    designSystemId,
    projectId,
    context,
  }: {
    designSystemId?: string;
    projectId?: string;
    context?: string;
  }) => tracked("get-design-system-kit", { target: "store-screenshots", designSystemId, projectId, context }, async () => {
    const source = await loadTokenSource({ designSystemId, projectId });
    if (!source?.tokensCss) {
      const reason = source
        ? `Could not load tokens for "${projectId ?? designSystemId}". A generated project may still be building. Check ${source.viewUrl}.`
        : "For target store-screenshots, pass either a catalog designSystemId (from find-design-system) or a projectId (from create-design-system).";
      return {
        content: [{ type: "text" as const, text: reason }],
        structuredContent: { status: "error", name: source?.name ?? "Missing design system", tokensCss: "" },
      };
    }
    const files = buildStoreScreenshotFiles(source.tokensCss);
    const instructions = storeScreenshotInstructions(source.name);
    return {
      content: [{ type: "text" as const, text: storeScreenshotText(source.name, files) }],
      structuredContent: {
        status: "completed" as const,
        name: source.name,
        viewUrl: source.viewUrl,
        tokensCss: source.tokensCss,
        buildInstructions: instructions,
        screenshotFiles: files,
      },
    };
  });

  /**
   * The mobile targets: one stored set per system per target, read verbatim.
   *
   * Like Shopify, nothing compiles at request time. The seed job and the
   * Inngest completion step store a React Native set and a SwiftUI set built
   * from the system's own component source, so the kit a developer receives
   * carries that system's button radius, card depth and switch track rather
   * than tokens on generic parts. [ADR 0003]
   */
  const fetchProjectMobilePrimitives = async (projectId: string) => {
    try {
      const res = await apiFetch(`${APP_BASE_URL}/api/projects/${projectId}/mobile/all.json`, { headers: authHeaders(authContext) });
      if (!res.ok) return null;
      // SAFETY: the JSON contract of this payload; the producing side owns the shape.
      const json = (await res.json()) as { name?: unknown; reactNativePrimitives?: unknown; swiftUiPrimitives?: unknown };
      return {
        name: isString(json.name) ? json.name : `Project ${projectId.slice(0, 8)}`,
        reactNativePrimitives: parseMobilePrimitiveSet(json.reactNativePrimitives),
        swiftUiPrimitives: parseMobilePrimitiveSet(json.swiftUiPrimitives),
      };
    } catch (err) {
      console.warn(`fetchProjectMobilePrimitives(${projectId}) failed`, err);
      return null;
    }
  };

  // The rules that go with the files. Claude Code reads structuredContent instead of the text, so both carry them.
  const mobileKitInstructions = (target: MobileTarget, set: MobilePrimitiveSet, written = false) => {
    const guide = target === "react-native" ? "get-react-native-guide" : "get-swiftui-guide";
    const rules = target === "react-native"
      ? [
          "1. React Native paints one shadow per view and has no inset shadow. The compiled shadow keeps the outer layer; an inset highlight has to be a gradient overlay.",
          "2. A hairline is thinner than one point. Use `StyleSheet.hairlineWidth` for a divider, never `1`.",
          "3. Android has no arbitrary shadow, only elevation. A card reads flatter there than the same card on iOS.",
        ]
      : [
          "1. SwiftUI paints one `.shadow()` per modifier. The compiled shadow keeps the web stack's outer layer; an inset highlight has to be an overlay.",
          "2. `Divider()` is one physical pixel on every density; never draw a rule at `1`.",
          "3. The toggle, slider and date picker keep the platform's own track, thumb and calendar; only their tint is this system's.",
        ];
    return [
      DESIGN_TRADEOFF_RULE,
      "",
      written
        ? "The kit's files are already in the app folder. Leave them as they are and build your screens on them."
        : target === "react-native"
        ? "Write both files as they are. The theme is this system's own tokens and material, lifted from its web components; the primitives read it and are the same for every system."
        : "Write every file as it is. The theme is this system's own tokens and material, lifted from its web components; the views read it and are the same for every system. The kit needs iOS 17, and the charts import Swift Charts.",
      "",
      target === "react-native"
        ? "Wrap the app in `ThemeProvider` once, then build screens from the primitives."
        : "Apply `.dsTheme(for: colorScheme)` once at the root, then build screens from the primitives.",
      "",
      "Three rules of the sheet do not survive the crossing, so do not try to reproduce them:",
      "",
      ...rules,
      "",
      "Compose the screen around its one job, not as a settings page. A stack of grouped list sections, each under a small grey caption, reads as the system Settings app whatever the theme. Instead:",
      "",
      "- Open with a compact summary of the state the person comes for, in one card no taller than a third of the screen: a progress ring with its percentage, what is left in words, such as \"3 habits to go\", and a streak or similar badge.",
      "- Put the list the person acts on directly under that summary, so its first items show without scrolling. A chart or a history goes after the list, never between the summary and the list.",
      "- A week of history inside the summary is seven short capsule bars on their own tracks, today in the accent, not a Swift Charts chart: an axis in a card that small collides with its own labels and pushes the list down.",
      "- Give each item its own tappable surface with a title, a short detail line under it and its own colour from the kit's palette. Its icon sits white on a solid tile of that colour, and the same colour marks its done state.",
      "- Glass needs something behind it. Lay a soft gradient of two or three of the kit's accent tints behind the content, so the cards read as glass on a lit surface, not white on white.",
      "- Show a done item three ways at once: a filled check in the item's colour, a surface tinted in that colour and its title struck through and dimmed.",
      "- Seed the sample data part-way through the day, so the first screen shows progress, a streak and a mix of done and open items. An empty ring or a zero count is the screen nobody wants to see first.",
      "- Keep a setting, such as a reminder switch, compact and last.",
      "- Give the header the screen's add action, a round glass + button beside the title with an accessibility label, so the person can add an item from the first screen.",
      ...(target === "swiftui"
        ? ["`.navigationSubtitle` places its line inside the large title's frame. Set a date or a count in the content's own header instead, with a spacing token above and below it."]
        : []),
      "",
      set.unsupportedTokens.length > 0
        ? `${set.unsupportedTokens.length} token(s) need a browser to resolve, a calc(), a var(), or a relative oklch(), so they carry no value here. The theme header lists them.`
        : "Every token in the sheet compiled.",
      "",
      nativeVerifyText(target),
      "",
      `Call Better Design's \`${guide}\` for the platform guidance.`,
    ].join("\n");
  };

  const mobileKitText = (name: string, viewUrl: string, target: MobileTarget, set: MobilePrimitiveSet) => {
    const label = target === "react-native" ? "React Native" : "SwiftUI";
    const fence = target === "react-native" ? "tsx" : "swift";
    return [
      `# ${name} ${label} kit`,
      "",
      ...set.files.flatMap((file) => [`### ${file.path}`, "", `\`\`\`${fence}`, file.content, "\`\`\`", ""]),
      mobileKitInstructions(target, set),
      "",
      `Source: ${viewUrl}`,
    ].join("\n");
  };

  // Claude Code shows the model this JSON instead of the text when a tool has
  // an output schema, and cuts it at 25,000 tokens. So the guidance leads it,
  // and the CSS and the kit source come last. [BD-1349]
  const completedMobileKitResult = (name: string, viewUrl: string, target: MobileTarget, set: MobilePrimitiveSet, note = "") => ({
    content: [{ type: "text" as const, text: note + mobileKitText(name, viewUrl, target, set) }],
    structuredContent: {
      status: "completed" as const,
      name,
      viewUrl,
      buildInstructions: note + mobileKitInstructions(target, set),
      unsupportedTokens: set.unsupportedTokens,
      nativeFiles: set.files,
      tokensCss: set.tokensCss,
    },
  });

  // On the local server the kit saves itself, so a model with a small context
  // never copies thousands of lines out of the reply. A failed write falls back
  // to the files in the reply. [BD-1336]
  const deliverMobileKit = async (name: string, viewUrl: string, target: MobileTarget, set: MobilePrimitiveSet, install: boolean, projectDir?: string) => {
    if (!writeKitFiles) return completedMobileKitResult(name, viewUrl, target, set);
    if (!install) {
      // An agent that passed false out of caution would otherwise copy thousands
      // of lines by hand and skip the starter screen. [BD-1349]
      const note = "Nothing was written, because this call passed install: false. Unless the user said not to touch their files, call get-design-system-kit again without install: the server then writes these files" + (target === "swiftui" ? ", and a ContentView.swift with a finished home screen built from them," : "") + " into the app folder for you. It never writes an App struct, an Xcode project or a package. The source below may be cut off, so do not rebuild the kit from it.\n\n";
      return completedMobileKitResult(name, viewUrl, target, set, note);
    }
    try {
      const starter = target === "swiftui" ? [swiftUiStarterFile()] : [];
      const { dir, written } = await writeKitFiles([...set.files, ...starter], projectDir);
      const note = swiftUiStarterNote(written);
      const starterNote = note ? [note, ""] : [];
      const instructions = mobileKitInstructions(target, set, true);
      const api = kitApiIndex(set.files);
      const apiPart = api ? ["## The kit's API", "", "Build from this list. Do not open the kit files to learn it: they are long, and this is every public view, initializer and modifier in them.", "", api, ""] : [];
      const guidance = [...starterNote, instructions, "", ...apiPart].join("\n");
      // The files on disk already carry the compiled theme and list the
      // unsupported tokens in its header. The token sheet and that list stayed
      // in context on every later turn and doubled what Haiku paid. [BD-1359]
      return {
        content: [{ type: "text" as const, text: [`# ${name} kit, written into ${dir}`, "", ...written.map((file) => `- ${file}`), "", guidance, `Source: ${viewUrl}`].join("\n") }],
        structuredContent: { status: "completed" as const, name, viewUrl, installedTo: dir, buildInstructions: guidance, tokensCss: "" },
      };
    } catch (err) {
      const note = `This server could not write the kit (${err instanceof Error ? err.message : String(err)}), so write the files below yourself.\n\n`;
      return completedMobileKitResult(name, viewUrl, target, set, note);
    }
  };

  const withReferences = async <R extends { content: KitContentBlock[]; structuredContent?: { buildInstructions?: string } }>(result: R, screen: string | undefined): Promise<R> => {
    const refs = await referenceScreens(readInspiration, screen);
    if (refs.length === 0) return result;
    const guide = result.structuredContent?.buildInstructions;
    const structuredContent = guide === undefined ? result.structuredContent : { ...result.structuredContent, buildInstructions: `${REFERENCES_LINE(screenQuery(screen))}\n\n${guide}` };
    return { ...result, content: [...result.content, ...refs], structuredContent };
  };

  const getMobileKit = async ({
    target,
    designSystemId,
    projectId,
    context,
    install = true,
    projectDir,
    screen,
  }: {
    target: MobileTarget;
    screen?: string;
    designSystemId?: string;
    projectId?: string;
    context?: string;
    install?: boolean;
    projectDir?: string;
  }) => tracked("get-design-system-kit", { target, designSystemId, projectId, context, install, screen }, async () => {
    const label = target === "react-native" ? "React Native" : "SwiftUI";
    const pick = (sets: { reactNativePrimitives: MobilePrimitiveSet | null; swiftUiPrimitives: MobilePrimitiveSet | null }) =>
      target === "react-native" ? sets.reactNativePrimitives : sets.swiftUiPrimitives;

    if (projectId) {
      const viewUrl = `${APP_BASE_URL}/projects/${projectId}`;
      // The provider hands back the stored jsonb behind a cast, so it goes
      // through the same parse the fetch path uses. A malformed row then reads
      // as "no set" and the caller gets the documented message, instead of the
      // shape reaching set.files and throwing.
      const providerResult = await provider.getProjectMobilePrimitives?.(projectId);
      const result = providerResult
        ? {
            name: providerResult.name,
            reactNativePrimitives: parseMobilePrimitiveSet(providerResult.reactNativePrimitives),
            swiftUiPrimitives: parseMobilePrimitiveSet(providerResult.swiftUiPrimitives),
          }
        : await fetchProjectMobilePrimitives(projectId);
      const set = result ? pick(result) : null;
      if (!set) {
        return {
          content: [{ type: "text" as const, text: `${label} version unavailable. Project "${projectId}" has no maintained ${label} primitive set yet. It may still be building, or predate mobile persistence. Check ${viewUrl}.` }],
          structuredContent: { status: "error", name: result?.name ?? `Project ${projectId.slice(0, 8)}`, viewUrl, tokensCss: "" },
        };
      }
      return withReferences(await deliverMobileKit(result?.name ?? `Project ${projectId.slice(0, 8)}`, viewUrl, target, set, install, projectDir), screen ?? context);
    }
    if (!designSystemId) {
      return {
        content: [{ type: "text" as const, text: `For target ${target}, pass either a catalog designSystemId (from find-design-system) or a projectId (from create-design-system).` }],
        structuredContent: { status: "error", name: "Missing design system", tokensCss: "", buildInstructions: `For target ${target}, pass either a catalog designSystemId (from find-design-system) or a projectId (from create-design-system).` },
      };
    }
    const ds = await provider.getDesignSystemById(designSystemId, { includeComponents: false, includeMobilePrimitives: true });
    if (!ds) {
      return {
        content: [{ type: "text" as const, text: `Design system "${designSystemId}" not found. Call find-design-system first to get a valid id, or pass a projectId for a generated system.` }],
        structuredContent: { status: "error", name: designSystemId, tokensCss: "" },
      };
    }
    const viewUrl = `${APP_BASE_URL}/design-systems/${designSystemId}`;
    const set = parseMobilePrimitiveSet(target === "react-native" ? ds.metadata.reactNativePrimitives : ds.metadata.swiftUiPrimitives);
    if (!set) {
      // Two different states, two different answers, as for Shopify. [BD-421]
      const text = ds.metadata.mobileAccess === "denied"
        ? `${label} target unavailable. The mobile kits are a private pilot and this API key is not in it, so the stored set for "${designSystemId}" was withheld. Nothing is wrong with the design system. Ask for pilot access, or use target "react" or "html". See ${viewUrl}.`
        : `${label} version unavailable. Design system "${designSystemId}" has no maintained ${label} primitive set. Mobile output is unavailable until that system is seeded and certified; no generic fallback was returned. See ${viewUrl}.`;
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { status: "error", name: ds.metadata.title, viewUrl, tokensCss: "" },
      };
    }
    return withReferences(await deliverMobileKit(ds.metadata.title, viewUrl, target, set, install, projectDir), screen ?? context);
  });

  const getShopifyKit = async ({
    designSystemId,
    projectId,
    context,
  }: {
    designSystemId?: string;
    projectId?: string;
    context?: string;
  }) => tracked("get-design-system-kit", { target: "shopify", designSystemId, projectId, context }, async () => {
    if (projectId) {
      const viewUrl = `${APP_BASE_URL}/projects/${projectId}`;
      const providerResult = await provider.getProjectShopifyPrimitives?.(projectId);
      const denied = Boolean(providerResult && "shopifyAccess" in providerResult);
      const result = denied
        ? null
        : providerResult && "shopifyPrimitives" in providerResult
        ? parseProjectShopifyPrimitives(
            projectId,
            providerResult.name,
            providerResult.shopifyPrimitives,
          )
        : await fetchProjectShopifyPrimitives(projectId, apiFetch, authContext);
      if (!result) {
        return {
          content: [{
            type: "text" as const,
            text: denied
              ? shopifyPilotDenied(`project "${projectId}"`, "project", viewUrl)
              : `Shopify version unavailable. Project "${projectId}" has no maintained Shopify primitive set yet. It may still be generating, belong to another account, or predate Shopify persistence. Check ${viewUrl}.`,
          }],
          structuredContent: { status: "error", name: `Project ${projectId.slice(0, 8)}`, viewUrl, tokensCss: "" },
        };
      }
      return completedShopifyKitResult(
        result.name,
        viewUrl,
        { kind: "project", projectId },
        result.primitives,
      );
    }
    if (!designSystemId) {
      return {
        content: [{ type: "text" as const, text: "For target shopify, pass either a catalog designSystemId (from find-design-system) or a projectId (from create-design-system)." }],
        structuredContent: { status: "error", name: "Missing design system", tokensCss: "", buildInstructions: "For target shopify, pass either a catalog designSystemId (from find-design-system) or a projectId (from create-design-system)." },
      };
    }
    const ds = await provider.getDesignSystemById(designSystemId, {
      includeComponents: false,
      includeShopifyPrimitives: true,
    });
    if (!ds) {
      return {
        content: [{ type: "text" as const, text: `Design system "${designSystemId}" not found. Call find-design-system first to get a valid id, or pass a projectId for a generated system.` }],
        structuredContent: { status: "error", name: designSystemId, tokensCss: "" },
      };
    }
    const viewUrl = `${APP_BASE_URL}/design-systems/${designSystemId}`;
    const primitives = parseShopifyPrimitiveSet(ds.metadata.shopifyPrimitives);
    if (!primitives) {
      // Two different states, two different answers. Reporting "no stored
      // theme" to a caller outside the pilot sends them to look for missing
      // data that is present. [BD-421]
      const text =
        ds.metadata.shopifyAccess === "denied"
          ? shopifyPilotDenied(`"${designSystemId}"`, "design system", viewUrl)
          : `Shopify version unavailable. Design system "${designSystemId}" has no maintained Shopify primitive set. Shopify output is unavailable until that system is seeded and certified; no generic fallback was returned. See ${viewUrl}.`;
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { status: "error", name: ds.metadata.title, viewUrl, tokensCss: "" },
      };
    }
    const icons = await catalogKitIcons(ds.metadata, provider);
    const storedIcons = primitives.iconLibrary;
    if (!icons || !storedIcons || icons.id !== storedIcons.id || icons.prefix !== storedIcons.prefix || icons.variant !== storedIcons.variant) {
      return {
        content: [{ type: "text" as const, text: `The stored Shopify kit for "${designSystemId}" has missing, legacy, or mismatched selected icons. Refresh the maintained payload and verify its assignment before using it; no substitute kit was returned.` }],
        structuredContent: { status: "error", name: ds.metadata.title, viewUrl, tokensCss: "" },
      };
    }
    return completedShopifyKitResult(
      ds.metadata.title,
      viewUrl,
      { kind: "catalog", designSystemId },
      primitives,
    );
  });

  server.registerTool(
    "get-design-system-kit",
    {
      title: "Get a Design System Build Kit",
      description: `Return the correct build kit for a design system through one capability-based entry point.

Use \`target: "react"\` whenever the host can write files and run a terminal. It returns the shadcn install command and real React components. Use \`target: "html"\` only for pure inline canvases or artifacts where npm and a build step are unavailable; it returns the framework-free token and component CSS kit. ${enableMobileKits ? `Use \`target: "react-native"\` for a React Native or Expo app and \`target: "swiftui"\` for an iOS app, never the react target: each returns this system's stored mobile kit, its own material on native primitives, plus the handoff to the matching guide.` : ""}${enableShopifyKit ? ` Use \`target: "shopify"\` when the user is styling a Shopify store or theme; it returns ready-to-write Liquid theme files (a CSS asset with this system's real tokens, snippets, and theme editor sections) plus the mandatory handoff to Better Design's \`get-shopify-guide\` MCP tool for documentation and validation.` : ""}

For \`target: "html"\`, the returned class contract is mandatory, including inside a host-provided visualization workflow: paste the kit CSS verbatim, keep \`class="ds"\` on the artifact root, and keep \`ds-*\` component classes on interactive controls. App-specific classes may sit alongside them for layout only; never rename or replace the \`ds-*\` classes. Before presenting, inspect the artifact source and revise it if either \`class="ds"\` or \`ds-\` is absent. Put hover-only CSS inside \`@media (hover: hover) and (pointer: fine)\` and never let hover move a control or override its selected/pressed styling.

Inline canvases also inject their own semantic-element colors. Replace \`APP_ROOT\` in \`hostIsolationCssTemplate\` with the artifact's real root selector and paste it after host/base CSS. Inspect rendered text against its computed background and fix anything below 4.5:1 contrast before presenting. Do not stretch cards to fill the canvas or turn every group into a card or pill.

Reuse the selected design system ID or generated \`projectId\`. If none is selected, obtain a design system ID from \`find-design-system\` first. A redesign does not authorize changing the selected system or its assigned icons.

For the React target, calling with a designSystemId returns ONE shadcn command that
installs every component (globals + all UI primitives) into components/ui/ in
one shot. Run that command before writing feature code so the agent has the
full component library available.

Pass 'component' only when the user explicitly asks to inspect or customise a
specific component's source code. In that mode the tool returns the requested
components, a scoped install command, and their source code.

Base UI (@base-ui/react) is the default flavor. BEFORE installing, inspect the
user's project: if package.json has any @radix-ui/* dependency (or
components/ui already imports @radix-ui), pass 'library: "radix"' to match their
existing setup; otherwise use the default Base UI. Both flavors install to the
same components/ui/ paths.

${BUILD_TARGET_RULE}`,
      inputSchema: (() => {
        const kitInput = z.object({
        // Off-pilot callers must not see the target at all, not merely be refused it.
        target: z.enum(
          // SAFETY: at least the three open targets are always present.
          [
            "react",
            "html",
            ...(enableShopifyKit ? ["shopify"] : []),
            "dtcg",
            "store-screenshots",
            ...(enableMobileKits ? ["react-native", "swiftui"] : []),
          ] as [string, ...string[]],
        ).describe(`Required build target. Use "react" for any host with filesystem + terminal; use "html" only for inline chat canvases/artifacts.${enableShopifyKit ? ' Use "shopify" for Shopify stores and themes.' : ""} Use "dtcg" to hand the tokens to a design tool: it returns a W3C Design Tokens document for Style Dictionary, Tokens Studio, Terrazzo, or a Figma plugin that creates variables. Use "store-screenshots" for App Store and Google Play screenshots in this system: it returns slide files and a render script that writes PNG files at the store sizes. ${enableMobileKits ? ' Use "react-native" for a React Native or Expo app and "swiftui" for an iOS app: each returns this system\'s stored mobile kit, its own material on native primitives, plus the handoff to the matching guide.' : ""}`),
        designSystemId: z.string().min(1).optional().describe(`Catalog design system ID from find-design-system. Required for target react; for every other target pass this or projectId.`),
        projectId: z.string().min(1).optional().describe(`Generated project ID from create-design-system / get-design-system-status. Supported with every target but react.`),
        component: z.union([z.string(), z.array(z.string())]).optional()
          .describe('React target only. Pass only when the user asks to inspect specific component source code. Omit to scaffold the entire design system.'),
        library: z.enum(["radix", "base-ui"]).optional()
          .describe('React target only, default "base-ui". Pass "radix" when the project already uses Radix primitives.'),
        screen: z.string().trim().min(1).max(80).optional()
          .describe('react-native and swiftui only: a few words naming the screen you are building, such as "habit tracker today" or "workout log". The kit then shows how shipped apps built it.'),
        context: CONTEXT_ARG,
        });
        // Only a server that can reach the user's files offers install and projectDir.
        return installKit || writeKitFiles ? kitInput.merge(LOCAL_INSTALL_INPUT) : kitInput;
      })(),
      outputSchema: buildKitOutputSchema(enableShopifyKit),
      // With the local installer, install: true downloads and runs npm packages,
      // so hosts must not treat the tool as read-only. [BD-1262]
      annotations: installKit || writeKitFiles
        ? { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
        : READ_ONLY_TOOL_ANNOTATIONS,
      // This tool returns build instructions, not a visual preview. Attaching
      // the preview template makes ChatGPT render a large visual card;
      // when that preview is unavailable the user sees a large blank card even
      // though the kit succeeded. preview-design-system remains the dedicated
      // interactive preview path. [BD-240]
    },
    async ({ target, designSystemId, projectId, component, library, context, screen, ...local }) => {
      const { install = false, projectDir } = LOCAL_INSTALL_INPUT.parse(local);
      if (target !== "react" && target !== "html" && target !== "shopify" && target !== "dtcg" && target !== "store-screenshots" && target !== "react-native" && target !== "swiftui") {
        return {
          content: [{ type: "text" as const, text: `Unknown target "${target}".` }],
          structuredContent: { status: "error", name: "Unknown target", tokensCss: "" },
        };
      }
      if (target === "html") {
        return withRedesignContract(await getHtmlKit({ designSystemId, projectId, context }));
      }
      if (target === "dtcg") {
        return withRedesignContract(await getDtcgKit({ designSystemId, projectId, context }));
      }
      if (target === "store-screenshots") {
        return getStoreScreenshots({ designSystemId, projectId, context });
      }
      if (target === "react-native" || target === "swiftui") {
        if (!enableMobileKits) {
          return {
            content: [{ type: "text" as const, text: 'The mobile targets are in a private pilot and are not enabled for this account. Use target "react" or "html", or ask Better Design for pilot access.' }],
            structuredContent: { status: "error", name: "Mobile target unavailable", tokensCss: "" },
          };
        }
        return getMobileKit({ target, designSystemId, projectId, context, screen, install: LOCAL_INSTALL_INPUT.parse(local).install ?? true, projectDir });
      }
      if (target === "shopify") {
        if (!enableShopifyKit) {
          return {
            content: [{ type: "text" as const, text: 'The Shopify target is in a private pilot and is not enabled for this account. Use target "react" to build the storefront as components, or ask Better Design for pilot access.' }],
            structuredContent: { status: "error", name: "Shopify target unavailable", tokensCss: "" },
          };
        }
        return withRedesignContract(await getShopifyKit({ designSystemId, projectId, context }));
      }
      if (!designSystemId) {
        return {
          content: [{ type: "text" as const, text: 'For target "react", pass a catalog designSystemId from find-design-system.' }],
          structuredContent: { status: "error", name: "Missing design system", tokensCss: "", buildInstructions: 'For target "react", pass a catalog designSystemId from find-design-system.' },
        };
      }
      return withRedesignContract(await tracked("get-design-system-kit", { target: "react", designSystemId, component, library, context, install }, async () => {
        const requestedComponentNames = component
          ? (Array.isArray(component) ? component : [component])
          : undefined;
        const system = await provider.getDesignSystemById(designSystemId, {
          includeComponents: true,
          includeComponentCode: Boolean(component),
          componentNames: requestedComponentNames,
        });
        if (!system) {
          return {
            content: [{ type: "text" as const, text: `Design system '${designSystemId}' not found.` }],
            structuredContent: { status: "error", name: designSystemId, tokensCss: "" },
          };
        }

        const { metadata, components: allComponents } = system;
        const icons = await catalogKitIcons(metadata, provider);
        const previewViewUrl = `${APP_BASE_URL}/design-systems/${metadata.id}`;
        const previewStructured = {
          status: "completed",
          name: metadata.title,
          viewUrl: previewViewUrl,
          tokensCss: await fetchCatalogTokensCss(metadata.id),
        };

        const header: string[] = [
          `# ${metadata.title}\n`,
          `**Description:** ${metadata.description}`,
          `**Personality:** ${metadata.personality.join(", ")}`,
          `**Industry:** ${metadata.industry.join(", ")}`,
        ];
        if (metadata.primaryColor) header.push(`**Primary Color:** ${metadata.primaryColor}`);
        if (metadata.borderRadius) header.push(`**Border Radius:** ${metadata.borderRadius}`);
        if (metadata.font) header.push(`**Font:** ${metadata.font}`);
        const densityNote = densityKitNote(previewStructured.tokensCss);
        if (densityNote) header.push(densityNote);
        header.push(`**Preview (see it live):** ${APP_BASE_URL}/design-systems/${metadata.id}`);

        // Base UI flavor: swap each component for its `<name>-base` registry
        // twin when the DS ships one. Same components/ui/ paths on install;
        // only the primitive library underneath changes. [BD-210]
        const wantsBase = library !== "radix";
        const baseNames = wantsBase
          ? await fetchBaseVariantNames(metadata.id)
          : new Set<string>();
        const baseUnavailableNote =
          wantsBase && baseNames.size === 0
            ? `\n> Note: ${metadata.title} has no Base UI port yet, so the commands below install the Radix components.\n`
            : "";
        const toInstallName = (name: string): string =>
          baseNames.has(`${name}-base`) ? `${name}-base` : name;
        const describeInstall = (installNames: string[]) => {
          const componentInstallNames = installNames.filter((name) => name !== "globals");
          const baseCount = componentInstallNames.filter((name) => name.endsWith("-base")).length;
          const plainCount = componentInstallNames.length - baseCount;

          if (!wantsBase) {
            return {
              installLibrary: "radix" as const,
              installNote: "This installs the Radix flavor (matched to the project's existing Radix primitives).",
            };
          }

          if (baseNames.size === 0) {
            return {
              installLibrary: "radix" as const,
              installNote: "This installs the Radix flavor because this design system has no Base UI port yet.",
            };
          }

          if (baseCount > 0 && plainCount > 0) {
            return {
              installLibrary: "mixed" as const,
              installNote: 'This installs the Base UI flavor where available, plus plain registry entries for components without a Base UI twin. If the project uses Radix, re-run this tool with `library: "radix"` instead.',
            };
          }

          if (baseCount > 0) {
            return {
              installLibrary: "base-ui" as const,
              installNote: 'This installs the Base UI flavor (the default). If the project uses Radix, re-run this tool with `library: "radix"` instead.',
            };
          }

          return {
            installLibrary: "radix" as const,
            installNote: "This installs plain registry entries because the requested components do not have Base UI twins yet.",
          };
        };

        if (!component) {
          const componentInstallNames = allComponents
            .map((c) => c.name)
            .filter((name) => name !== "globals")
            .map(toInstallName)
            .sort();
          const installNames = [
            "globals",
            ...componentInstallNames,
          ];
          const { installLibrary, installNote } = describeInstall(installNames);
          const aggregateName = wantsBase && baseNames.size > 0 ? "all-base" : "all";
          const installUrl = `${REGISTRY_BASE_URL}/${metadata.id}/${aggregateName}.json`;
          const installCommand = `${SHADCN_ADD} ${installUrl}`;
          const structuredInstallCommand = installCommandWithInit(installCommand, prepareProject);
          const createCommand = newProjectCommand(aggregateName === "all-base" ? "base" : "radix");
          const parts = [
            ...header,
            "\n## Scaffold the full design system\n",
            ...(baseUnavailableNote ? [baseUnavailableNote] : []),
            "_This is the React target, the right choice whenever you have a filesystem + terminal. Build real components from `components/ui/`. Use this same tool with `target: \"html\"` only for inline chat canvases (ChatGPT / Claude artifacts) that cannot run a build._\n",
            REQUIREMENTS_MD,
            `In an existing project, run these commands in its root. The first readies the project for shadcn and does nothing when \`components.json\` exists; the second installs **all ${installNames.length} pieces** (globals.css + ${componentInstallNames.length} components) into \`components/ui/\` from one aggregate registry item. \`-o\` replaces any file already in \`components/ui/\`, so commit local edits first:`,
            "```bash",
            `# 1. Ready the project for shadcn. Does nothing when components.json exists.`,
            prepareProject,
            "",
            `# 2. Install Better Design's full DS into components/ui/`,
            installCommand,
            "```",
            `\n_${installNote}_`,
            ANTI_MOCKUP_MD,
            "\nAfter the install completes, read files from `components/ui/` directly when writing feature code. Do not ask this tool for component source unless the user wants to inspect or customise a specific file.",
            "\n## Included components\n",
            installNames.map((n) => `- \`${n}\``).join("\n"),
            "\n" + GUARDRAILS_SETUP_MD,
          ];

          const library = aggregateName === "all-base" ? "base" : "radix";
          let installedTo: string | undefined;
          let installedText: string | undefined;
          if (installKit && install) {
            try {
              const installed = await installKit({ projectDir, registryUrl: installUrl, library });
              installedTo = installed.projectDir;
              // The system's own icons go in with its components, so a model
              // that skips the icon tools still builds with them. [BD-1285]
              const kitIcons = icons && writeIcons
                ? await installKitIcons(provider, writeIcons, icons, installed.projectDir)
                : { note: "", names: [] };
              // A local model drops layout and component choices described in
              // text, so a created project gets a working flow built from the
              // installed components, and the model fills in the content. [BD-1285]
              const scaffold = installed.readComponent && installed.writeEntry
                ? flowScaffold({ library, read: installed.readComponent, icons: kitIcons.names })
                : null;
              if (scaffold) installed.writeEntry?.(scaffold);
              // A short reply: a local model re-reads every token of it on each later step. [BD-1262]
              installedText = [
                `# ${metadata.title}`,
                "",
                `The ${componentInstallNames.length} components are files in \`${installed.uiDir}\`. Import each one as \`@/components/ui/<name>\`, for example \`import { Button } from "@/components/ui/button"\`. Read a file there before you use a component you do not know.`,
                "",
                `Write the screen in \`${installed.entryFile}\`, then run \`npm run build\` in \`${installed.projectDir}\`. Stop only once \`npm run build\` ends with no error; then reply in two lines.`,
                "",
                ...(scaffold
                  ? [SCAFFOLD_NOTE, ...(library === "base" ? ["", BASE_UI_PROPS] : [])]
                  : [screenSkeleton(kitIcons.names), "", controlMap(componentInstallNames, library)]),
                "",
                ...(kitIcons.note ? [kitIcons.note, ""] : []),
                `Components: ${componentInstallNames.join(", ")}.`,
                ...(installed.warnings ?? []).flatMap((warning) => ["", `Warning: ${warning}`]),
              ].join("\n");
            } catch (error) {
              return {
                isError: true,
                content: [{ type: "text" as const, text: `This server could not set up the project: ${error instanceof Error ? error.message : String(error)}\n\nIn an existing project, run these commands in its root:\n\n\`\`\`bash\n${structuredInstallCommand}\n\`\`\`\n\nWith no project yet, run \`${createCommand}\` first, then the commands above inside \`my-app\`.` }],
              };
            }
          }

          // Where the local server stands: it installed the system, or it can.
          const localHandoff: LocalInstallHandoff = {};
          if (installedTo) localHandoff.installedTo = installedTo;
          else if (installKit) localHandoff.localInstall = true;
          return withSelectedKitIcons({
            content: [{ type: "text" as const, text: installedText ?? parts.join("\n") }],
            structuredContent: {
              ...previewStructured,
              installCommand: structuredInstallCommand,
              newProjectCommand: createCommand,
              installLibrary,
              installNote,
              ...localHandoff,
            },
          }, icons);
        }

        if (install) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: "install: true installs the whole design system into a new project. Call again without component, or leave install out to read component source." }],
          };
        }
        const componentNames = Array.isArray(component) ? component : [component];
        const components = allComponents.filter((c) => componentNames.includes(c.name));
        const resolvedNames = components.map((c) => c.name);

        if (resolvedNames.length === 0) {
          const requestedNames = componentNames
            .filter((name) => SAFE_COMPONENT_NAME_RE.test(name))
            .map((name) => `- \`${name}\``);
          return {
            content: [{
              type: "text" as const,
              text: [
                `No matching components found in ${metadata.title}.`,
                ...(requestedNames.length > 0 ? ["", "Requested components:", ...requestedNames] : []),
                "",
                "Available components:",
                ...allComponents.map((c) => `- \`${c.name}\``),
              ].join("\n"),
            }],
            structuredContent: {
              status: "error",
              name: metadata.title,
              viewUrl: previewViewUrl,
              tokensCss: previewStructured.tokensCss,
            },
          };
        }

        const scopedInstallNames = resolvedNames.map((name) => toInstallName(name));
        const { installLibrary, installNote } = describeInstall(scopedInstallNames);
        const scopedUrls = scopedInstallNames
          .map((name) => `${REGISTRY_BASE_URL}/${metadata.id}/${name}.json`)
          .join(" \\\n  ");
        const installCommand = `${SHADCN_ADD} \\\n  ${scopedUrls}`;
        const structuredInstallCommand = installCommandWithInit(installCommand, prepareProject);

        const parts = [
          ...header,
          "\n## Install just these components\n",
          ...(baseUnavailableNote ? [baseUnavailableNote] : []),
          REQUIREMENTS_MD,
          "```bash",
          `# Ready the project for shadcn (does nothing when components.json exists)`,
          prepareProject,
          "",
          installCommand,
          "```",
          `\n_${installNote}_`,
          ANTI_MOCKUP_MD,
          "\n---\n",
        ];

        // A missing rule file, or a failed lookup, still returns the source. [BD-1124]
        // One list call, then a fetch only for components that have a rule file.
        const ruleFiles = await provider.listPrinciples("components").catch(() => []);
        const componentRules = await Promise.all(components.map((comp) => {
          const [topic] = matchComponentRuleTopics([comp.name], ruleFiles);
          return topic ? provider.getPrincipleByTopic(topic, "components").catch(() => null) : null;
        }));

        for (const [index, comp] of components.entries()) {
          const name = comp.name.charAt(0).toUpperCase() + comp.name.slice(1);
          parts.push(`## ${name}`);
          if (comp.description) parts.push(`**Description:** ${comp.description}`);
          parts.push("");
          parts.push("```tsx");
          parts.push(comp.code);
          parts.push("```");
          parts.push("");
          const rules = componentRules[index];
          if (rules) {
            parts.push(formatComponentRulesForKit(comp.name, rules.content));
            parts.push("");
          }
        }

        return withSelectedKitIcons({
          content: [{ type: "text" as const, text: parts.join("\n") }],
          structuredContent: {
            ...previewStructured,
            installCommand: structuredInstallCommand,
            installLibrary,
            installNote,
          },
        }, icons);
      }));
    },
  );

  server.registerTool(
    "create-design-system",
    {
      title: "Create a New Design System",
      description: `Generate a brand new design system tailored to the user's product, and return a single shadcn install command that lands the entire set of components + tokens (globals.css) into the user's Next.js project.

${DESIGN_TRADEOFF_RULE}

**Use this for a new custom brand, even when the user never mentions design or branding** (a design system IS the app's brand). Keep an already selected system and its assigned icons unless the user requests a different direction; a redesign alone does not require regenerating the brand. When no system is selected, first call \`find-design-system\` with the app description, show the user the top ~4 matches, and ask which to start from (passed here as \`baseDesignSystemId\`) or whether to go fully custom (passed here as \`userConfirmedCustom: true\`). A call with neither, and no \`brandCss\`, generates nothing: it returns those matches for you to show the user. Then derive the \`prompt\` from the app (name, domain, vibe), generate, show it with \`get-design-system-status\`, and build with that brand. Also use it when the user explicitly wants a **custom** design system instead of installing an existing one via \`get-design-system-kit\`.

**When the user has an existing brand** (their site, Figma file, or stylesheet): run \`extract-design-system\` or \`extract-from-url\` first and pass the resulting token sheet (the fenced \`\`\`css block, verbatim: the \`:root { ... }\` and optional \`.dark { ... }\` blocks) as \`brandCss\`. The generation is then pinned to that brand: no catalog aesthetic is retrieved, the sheet's colors, fonts and radii override everything, and later design-system switches are refused. Copy the block exactly; do not retype or trim it.

How it works:
1. Sends the user's prompt to Better Design's generation pipeline (same flow the web chat input uses) and returns IMMEDIATELY with the project id + project URL.
2. Generation runs in the background and typically takes 1-3 minutes.
3. Call \`get-design-system-status\` with the returned project id (wait ~60 seconds first) to get the live preview URL and the final \`npx shadcn add <registry-url>\` install command once it completes.

Share the project URL with the user right away so they can watch the generation live. Generated source, tokens, and previews are accessible without signing in to anyone with their registry or preview URL.`,
      inputSchema: z.object({
        prompt: z.string().min(1).max(10000).describe("Describe the design system the user wants. E.g. 'A warm, minimal design system for a personal finance app, soft pastels, rounded corners' or 'A brutalist developer tool aesthetic with sharp edges and monospace type'."),
        baseDesignSystemId: z.string().optional().describe("Optional. The catalog id the USER picked from the `find-design-system` matches you showed them, used to bias generation toward that aesthetic (e.g. a theme tweak on top of Linear). Leave empty only when the user chose fully custom."),
        userConfirmedCustom: z.boolean().optional().describe("Set true only when the user saw the find-design-system matches and chose fully custom. Without it, baseDesignSystemId or brandCss, the tool returns the matches and generates nothing."),
        brandCss: z.string().max(50_000).optional().describe("Optional. The user's extracted brand token sheet, verbatim: the fenced css block from extract-design-system / extract-from-url (`:root { --background: ...; }` plus optional `.dark { ... }`). When set, generation builds FROM this brand instead of a catalog look-alike, and baseDesignSystemId is ignored (a catalog base would leak its identity past the brand tokens)."),
      }),
      // Each call starts a new generation and returns a new project id, so it
      // writes and is not idempotent. It only adds a project, never replaces or
      // deletes one. Generated registry and preview URLs are public, so the
      // generation publishes content even on our own hostname. [BD-316]
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ prompt, baseDesignSystemId, brandCss, userConfirmedCustom }) => tracked("create-design-system", { query: prompt, hasBase: Boolean(baseDesignSystemId), hasBrand: Boolean(brandCss), userConfirmedCustom: Boolean(userConfirmedCustom) }, async () => {
      if (!baseDesignSystemId && !brandCss && !userConfirmedCustom) {
        return { content: [{ type: "text" as const, text: await askForBaseChoice(prompt) }] };
      }
      const startUrl = `${APP_BASE_URL}/api/projects/anonymous`;
      let projectId: string;
      /** The values `requestHeaders` maps its keys onto. */
      interface RequestheadersTable {
        [key: string]: string;
      }

      const requestHeaders: RequestheadersTable = { "Content-Type": "application/json" };
      if (authContext) {
        const bearer =
          authContext.kind === "api-key" ? authContext.apiKey : authContext.accessToken;
        requestHeaders.Authorization = `Bearer ${bearer}`;
      }
      try {
        const startRes = await apiFetch(startUrl, {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify({
            value: prompt,
            designSystemId: baseDesignSystemId ? baseDesignSystemId : undefined,
            ...(brandCss && { brandCss }),
          }),
        });
        if (!startRes.ok) {
          const text = await startRes.text().catch(() => "");
          return { content: [{ type: "text" as const, text: `Failed to start generation (HTTP ${startRes.status}). ${text.slice(0, 500)}` }] };
        }
        // SAFETY: the JSON contract of this payload; the producing side owns the shape.
        const body = (await startRes.json()) as { id?: string };
        if (!body.id) {
          return { content: [{ type: "text" as const, text: "Generation endpoint did not return a project id." }] };
        }
        projectId = body.id;
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Network error calling ${startUrl}: ${err instanceof Error ? err.message : String(err)}` }] };
      }

      const projectUrl = `${APP_BASE_URL}/projects/${projectId}`;
      const lines = [
        `# Generation started`,
        "",
        formatProjectIdLine(projectId),
        "",
        ...(authContext
          // This link is owner-scoped: signed-out visitors get "Project not
          // found". Say so here instead of letting the user share a dead link.
          // The public one only exists once a preview fragment does, so
          // get-design-system-status hands it over. [BD-423]
          ? [`Saved to your Better Design account. Watch it generate live (sign in with the account that created it, this link is private to you):`]
          : [`Watch it generate live:`]),
        projectUrl,
        "",
        `Generation takes 1-3 minutes. Wait ~60 seconds, then call \`get-design-system-status\` with the project id: it returns a shareable preview link that opens without signing in, plus the final install command. Give the user that link, not this one.`,
        inlineBuildMd(projectId),
      ];
      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        structuredContent: { projectId, projectUrl, status: "generating" },
      };
    }),
  );

  // Shared body for the status tool + its hidden alias. [BD-173]
  const runDesignSystemStatus = async (projectId: string) => {
      const headers: Record<string, string> = {};
      if (authContext) {
        const bearer =
          authContext.kind === "api-key" ? authContext.apiKey : authContext.accessToken;
        headers.Authorization = `Bearer ${bearer}`;
      }
      const statusUrl = `${APP_BASE_URL}/api/projects/${projectId}`;
      let project: { name?: string; designSystemStatus?: string; currentStep?: string | null; previewFragmentId?: string | null };
      try {
        const res = await apiFetch(statusUrl, { headers });
        if (!res.ok) {
          return { content: [{ type: "text" as const, text: `Could not read project ${projectId} (HTTP ${res.status}). Check the id, or view it at ${APP_BASE_URL}/projects/${projectId}.` }] };
        }
        // SAFETY: the JSON contract of this payload; the producing side owns the shape.
        project = (await res.json()) as typeof project;
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Network error calling ${statusUrl}: ${err instanceof Error ? err.message : String(err)}` }] };
      }

      const projectUrl = `${APP_BASE_URL}/projects/${projectId}`;
      if (project.designSystemStatus === "COMPLETED") {
        const registryUrl = `${APP_BASE_URL}/api/projects/${projectId}/registry/all.json`;
        let body = `\`\`\`bash\n${SHADCN_ADD} ${registryUrl}\n\`\`\``;
        let tokensCss = "";
        let dsName = `Project ${projectId.slice(0, 8)}`;
        let iconLibrary: {
          id: string;
          name?: string;
          prefix?: string;
          variant?: string;
        } | undefined;
        try {
          const res = await apiFetch(registryUrl);
          if (res.ok) {
            // SAFETY: the JSON contract of this payload; the producing side owns the shape.
            const json = (await res.json()) as {
              name?: string;
              cssVars?: { light?: Record<string, string>; dark?: Record<string, string>; theme?: Record<string, string> };
              files?: Array<{ path?: string; content?: string }>;
              meta?: {
                installInstructions?: string;
                globalsCss?: string;
                iconLibrary?: {
                  id?: string;
                  name?: string;
                  prefix?: string;
                  variant?: string;
                  defaultVariant?: string;
                };
              };
            };
            if (json.meta?.installInstructions) body = json.meta.installInstructions;
            const assignedIcons = json.meta?.iconLibrary;
            if (assignedIcons?.id) {
              iconLibrary = {
                id: assignedIcons.id,
                name: assignedIcons.name,
                prefix: assignedIcons.prefix,
                variant: assignedIcons.variant ?? assignedIcons.defaultVariant,
              };
            }
            tokensCss = tokensCssFromRegistry(json);
            if (project.name) dsName = project.name;
            else if (json.name) dsName = json.name;
          }
        } catch {
          // keep fallbacks
        }
        // The interactive widget (DS_PREVIEW_WIDGET via _meta outputTemplate) is
        // the canonical preview. We deliberately do NOT ask the model to render a
        // standalone HTML artifact: a hand-rendered token document never matches
        // the DS's real shadows/material and reads as a flat look-alike. Tell the
        // model not to fabricate one. [BD-121]
        // previewUrl remains the public, cookieless source used to generate
        // preview assets. The human "Open" link points at projectUrl, where the
        // owner has their browser session. [BD-316]
        const previewUrl = project.previewFragmentId
          ? `${APP_BASE_URL}/preview/${project.previewFragmentId}`
          : projectUrl;
        // /projects/<id> is owner-scoped, so a signed-out visitor sees "Project
        // not found" and reads the whole response as a lie. Give the shareable
        // public link its own line in the TEXT, not only in structuredContent
        // (most hosts never show the user structured output). [BD-423]
        const shareLines = project.previewFragmentId
          ? [
              `Shareable preview, opens without signing in:`,
              previewUrl,
              "",
            ]
          : [];
        const iconNextStep = iconLibrary
          ? `This generated project already assigns ${iconLibrary.name ?? iconLibrary.id}${iconLibrary.variant ? ` (${iconLibrary.variant})` : ""}. Do not call \`find-icon-library\` or choose a substitute. Before \`install-icons\`, call \`find-icons\` once per canonical noun with \`libraryId: "${iconLibrary.id}"\`${iconLibrary.variant ? ` and \`variant: "${iconLibrary.variant}"\`` : ""}, then copy the returned icon names verbatim. Never guess, translate, suffix, or synthesize icon slugs.`
          : `No icon library has been picked yet: call \`find-icon-library\` (query from the brand's personality), SHOW the closest matches and let the user pick one. Then call \`find-icons\` for each needed concept and pass its returned names verbatim to \`install-icons\`; never guess icon slugs.`;
        const lines = [
          `# Design system ready`,
          "",
          DESIGN_TRADEOFF_RULE,
          "",
          ...shareLines,
          ...(authContext
            ? [`Saved to your Better Design account. View, edit, and re-grab the install command here (sign in with the account that created it, this link is private to you):`]
            : [`View and preview your design system anytime here:`]),
          projectUrl,
          "",
          formatProjectIdLine(projectId),
          "",
          `To install it into a local project (Cursor, Claude Code, a checked-out repo):`,
          "",
          REQUIREMENTS_MD,
          body,
          ...(densityKitNote(tokensCss) ? [densityKitNote(tokensCss)] : []),
          ANTI_MOCKUP_MD,
          inlineBuildMd(projectId),
          "",
          `In a real codebase, run the install above; do NOT hand-build an HTML/React copy of the components. The preview widget already shows it, and ${projectUrl} has the full showcase.`,
          "",
          `Now help the user finish, don't stop here. ${iconNextStep} After that, start building with the installed components.`,
        ];
        // Render a real screenshot of the public preview page so a
        // generated DS shows its actual material, not the generic token fallback
        // (which reads as "0 match" to the real system). Only when we have a
        // fragment to screenshot. [BD-164]
        const shotUrl = project.previewFragmentId
          ? `${APP_BASE_URL}/api/og/preview?fragment=${project.previewFragmentId}`
          : undefined;
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: {
            status: "completed",
            name: dsName,
            viewUrl: projectUrl,
            previewUrl,
            ...(shotUrl && { shotUrl }),
            installCommand: `${SHADCN_ADD} ${registryUrl}`,
            buildInstructions: DESIGN_TRADEOFF_RULE,
            tokensCss,
            ...(iconLibrary && { iconLibrary }),
          },
        };
      }
      if (project.designSystemStatus === "ERROR") {
        return {
          content: [{ type: "text" as const, text: `Generation failed for project ${projectId}. Last step: ${project.currentStep ?? "(none)"}. The user can retry from ${projectUrl}.` }],
          structuredContent: { status: "error", name: `Project ${projectId.slice(0, 8)}`, viewUrl: projectUrl, tokensCss: "" },
        };
      }
      const step = project.currentStep ? project.currentStep.replace(/^[a-z]+:/, "") : undefined;
      const stepNote = step ? ` Current step: ${step}.` : "";
      return {
        content: [{ type: "text" as const, text: `Still generating (status: ${project.designSystemStatus ?? "PENDING"}).${stepNote}\nCheck again in ~30 seconds. Watch it live on the project page: ${projectUrl}` }],
        structuredContent: {
          status: (project.designSystemStatus ?? "PENDING").toLowerCase(),
          name: `Project ${projectId.slice(0, 8)}`,
          viewUrl: projectUrl,
          step,
          tokensCss: "",
        },
      };
  };

  const statusConfig = {
    title: "Get Design System Generation Status",
    description: `Check on a design system generation started with 'create-design-system'. Returns progress while generating, and the live preview URL + the \`npx shadcn add\` install command once complete. Generation typically takes 1-3 minutes; poll every ~30 seconds until it reports ready. Once ready, ask the user what's next (icon library, install, or build) instead of stopping.`,
    inputSchema: z.object({
      projectId: z.string().min(1).describe("The project id returned by create-design-system."),
      context: CONTEXT_ARG,
    }),
    outputSchema: PREVIEW_OUTPUT_SCHEMA.extend({
      buildInstructions: BUILD_INSTRUCTIONS_FIELD,
    }),
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    _meta: {
      ui: { resourceUri: DS_PREVIEW_WIDGET_URI },
      "ui/resourceUri": DS_PREVIEW_WIDGET_URI,
      "openai/outputTemplate": DS_PREVIEW_WIDGET_URI,
      "openai/toolInvocation/invoking": "Checking your design system...",
      "openai/toolInvocation/invoked": "Design system status ready",
    },
  };

  // get-design-system-status (renamed from check-design-system-status). [BD-173]
  server.registerTool(
    "get-design-system-status",
    statusConfig,
    ({ projectId, context }) => tracked("get-design-system-status", { context }, () => runDesignSystemStatus(projectId)),
  );

  server.registerTool(
    "preview-design-system",
    {
      title: "Preview a Design System",
      description: `Show the user a visual preview of a design system from the catalog (use the id from 'find-design-system'). Returns a token-true HTML preview: palette, typography, buttons, card, input, badge, plus a link to the full live showcase. Use this when the user wants to SEE a design system before installing it.`,
      inputSchema: z.object({
        designSystemId: z.string().min(1).describe("Design system id from find-design-system, e.g. 'linear', 'editorial-warm'."),
        context: CONTEXT_ARG,
      }),
      outputSchema: PREVIEW_OUTPUT_SCHEMA,
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      _meta: {
        ui: { resourceUri: DS_PREVIEW_WIDGET_URI },
        "ui/resourceUri": DS_PREVIEW_WIDGET_URI,
        "openai/outputTemplate": DS_PREVIEW_WIDGET_URI,
        "openai/toolInvocation/invoking": "Building the preview...",
        "openai/toolInvocation/invoked": "Preview ready",
      },
    },
    async ({ designSystemId, context }) => tracked("preview-design-system", { designSystemId, context }, async () => {
      const ds = await provider.getDesignSystemById(designSystemId, {
        includeComponents: false,
      });
      if (!ds) {
        return {
          content: [{ type: "text" as const, text: `Design system "${designSystemId}" not found. Call find-design-system first to get a valid id.` }],
          structuredContent: { status: "error", name: designSystemId, tokensCss: "" },
        };
      }
      const tokensCss = await fetchCatalogTokensCss(designSystemId);
      const viewUrl = `${APP_BASE_URL}/design-systems/${designSystemId}`;
      if (!tokensCss) {
        return {
          content: [{ type: "text" as const, text: `Could not load tokens for "${designSystemId}". The full live showcase is at ${viewUrl}.` }],
          structuredContent: { status: "error", name: ds.metadata.title, viewUrl, tokensCss: "" },
        };
      }
      // Canonical preview is the interactive widget (_meta outputTemplate); do not
      // ask the model to hand-render an HTML artifact — a token document never
      // matches the DS's real shadows/material and looks like a flat copy. [BD-121]
      const text = [
        `# ${ds.metadata.title}`,
        "",
        ds.metadata.description,
        "",
        `Full live showcase (every component): ${viewUrl}`,
        "",
        `Do NOT hand-build or render an HTML/React preview of this design system; it will not match the real components. The preview widget already shows it, and ${viewUrl} has the full showcase.`,
      ].join("\n");
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: {
          status: "completed",
          name: ds.metadata.title,
          viewUrl,
          // Real screenshot of the showcase for the self-contained widget.
          shotUrl: `${APP_BASE_URL}/api/og/preview?id=${encodeURIComponent(designSystemId)}`,
          tokensCss,
        },
      };
    }),
  );

}
