import type { ReadInspiration } from "../inspiration";
import type { RenderFrames } from "../video/render-frames";
import type { InstallKit } from "../install-kit";
import type { WriteIcons } from "../write-icons";
import type { WriteKitFiles } from "../write-kit-files";
import type { ReviewCapture } from "../../review-capture";
import type { JsonValue } from "../../guards";
import { createHash } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DataProvider } from "../data-provider";
import type { CaptureDashboardBrowser } from "../dashboard-browser-capture";
import type { DsTopResult } from "../../design-systems/record-search";
import { PRESENTATION_RUNTIME_RULE } from "../presentation-runtime";
import { DESIGN_TRADEOFF_RULE, REDESIGN_SCOPE_CONTRACT } from "../redesign-contract";
import { selectedIconSchema } from "../selected-icon-handoff";
import {
  MCP_SESSION_WINDOW_MS,
  NO_SESSION_GUIDANCE,
  summarizeSessionGuidance,
  type SessionGuidance,
} from "../session-guidance";
import { isString } from "../../guards";

const MAX_OUTPUT_PREVIEW = 1000;

export const ICONIFY_FETCH_TIMEOUT_MS = 10_000;
export const ICONIFY_API_BASE = "https://api.iconify.design";

export const REGISTRY_BASE_URL =
  process.env.BETTER_DESIGN_REGISTRY_URL ??
  "https://better-design.com/registry";

export const APP_BASE_URL =
  process.env.BETTER_DESIGN_APP_URL ??
  "https://better-design.com";

export const WIDGET_RESOURCE_DOMAINS = [
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
];

export const WIDGET_APP_DOMAIN = `${createHash("sha256")
  .update(`${APP_BASE_URL}/api/mcp`)
  .digest("hex")
  .slice(0, 32)}.claudemcpcontent.com`;

/** The project setup the React install needs, shown above every install command so an agent prepares it first. */
export const REQUIREMENTS_MD = `> **Requirements:** these components target **Tailwind v4**. The installed \`globals.css\` uses the v4 entry point (\`@import "tailwindcss"\`), so the project needs \`tailwindcss@^4\` with \`@tailwindcss/postcss\` in its PostCSS config (or the \`@tailwindcss/vite\` plugin), plus an \`@/*\` path alias in \`tsconfig.json\`: \`shadcn init\` stops without one. On a Tailwind v3 project, migrate to v4 first, otherwise the build throws the "trying to use tailwindcss directly as a PostCSS plugin" error.\n`;

export const ANTI_MOCKUP_MD = `\n**Run the install. Do not substitute it.** Never hand-write these components from memory and never build a standalone HTML mockup as a stand-in: both skip the real design tokens, drift from the registry source, and cannot \`import\` from \`@/components/ui/*\`. The only correct output is running the command above in a real project, then composing the installed files.`;

// Single source of truth for the React-vs-HTML build-target decision. Surfaced in
// the get-design-system-kit tool description and
// outputs (tool text is NOT subject to the ~2KB server-instructions truncation in
// Claude Code, so the rule reliably reaches every host). The gate is keyed on
// CAPABILITY, not host name: Claude Desktop has a filesystem + shell, so it must
// build React too — host name alone can't tell it apart from claude.ai web. [BD-147]
/**
 * The React-versus-HTML build-target rule as the hosts receive it. Tool text
 * carries it instead of the server instructions, because Claude Code truncates
 * those at about 2 KB and this must reach every host intact.
 */
const WEB_TARGET_RULE = `**Pick the build target by capability, not by habit:**
- **You can write files into a project and run a terminal** (Claude Code, Cursor, Devin, Antigravity, an IDE agent, Claude Desktop with filesystem/shell tools, any checked-out repo): call \`get-design-system-kit\` with \`target: "react"\`, run the shadcn install, and build **real React components**. This is the default for any actual project.
- **You are in a pure inline chat canvas with NO file writes and NO terminal** (ChatGPT canvas, a Claude.ai chat artifact): call \`get-design-system-kit\` with \`target: "html"\` and build with the framework-free HTML/CSS kit.

Emitting a single standalone \`.html\` file as "the app" when you could run the React install is a bug: it can't \`import @/components/ui/*\`, drifts from the registry, and discards the real components.`;

const TIGHT_OUTPUT_RULE = `Whichever target, keep the output tight: build the screens the user actually asked for (one, unless they asked for more) from the system's own components/tokens, don't pad them with bespoke decorative CSS, and keep prose brief. Allow a short gain/loss comparison per material design option; skip long write-ups and trailing follow-up questions.`;

const WEB_FIDELITY_RULE = `Component fidelity is pass-fail. Before writing markup, inventory \`components/ui/*\`
and map every visible pattern to an installed component. Use \`Sidebar\` for the
primary app shell, \`Table\` and its row/cell exports for tabular records, and
\`OnboardingStepper\` for a dependent flow with more than three steps when those
components are installed. A raw \`<aside>\`, repeated \`<div>\` rows, or a custom
progress rail is a failure when the matching component exists.
Generated-registry dependency changes are part of the required component install.
Treat newly added registry-owned packages as install artifacts, not edits to existing
package versions. Preserve every pre-existing dependency version and keep required additions.
If the install attempts to change an existing version, report that exact conflict and stop;
never silently revert a required addition or replace its component.

Compose the installed Sidebar exports directly, including its header, content,
items, groups, and footer when provided. Do not restyle a raw aside to resemble
the Sidebar or override its surface, active-state, radius, and type treatment in
feature code. A design-system import that is never used does not count.

Typography fidelity is pass-fail. Read the installed font tokens before editing
\`globals.css\`; preserve their \`@font-face\`, \`@import\`, or framework font loader,
and never leave a \`var(--font-*)\` reference undefined. In the rendered app, await
\`document.fonts.ready\`, inspect the computed font-family on the page and a heading,
and confirm the intended family loaded before presenting the screen.`;

const HIERARCHY_RULE = `Hierarchy is pass/fail, not polish. Give the first view one P0 task and at most one P1 summary; move P2 history, standings, detailed metadata, and empty-state chrome below it or behind a tab/disclosure. Unless the screen is a dense tool (traces, logs, tables and dashboards) or the user asked for density, fail and simplify any first view with more than three major regions, five immediately visible actions, or 25 visible text fragments. A dense tool keeps its summary stats, its records and the selected record's detail in one view: order them with hierarchy instead of cutting them. Do not make density look compact by shrinking everything: the primary display must be at least 1.5× base UI text, section anchors at least 1.2×, and bold must be reserved for the primary display, section anchors, and active values. Labels are a last resort; remove captions that restate obvious values.`;

const DASHBOARD_RULE = `Dashboard quality is pass-fail. Start with the domain page title, one supporting line, and one primary action
in the same header group. Preserve this scan order: metrics → records → interpretation.
Metric values must dominate their labels.
Preserve an explicit overview title and supporting line verbatim when the request or fixture supplies them;
an active navigation label is not a substitute for the page h1. Do not rename the overview around its primary action.
Supplied interface copy takes precedence over generated-copy length targets; report a conflict instead of silently rewriting the supplied words.
Every requested dashboard region must exist in source before rendered review begins.
When interpretation prose is not supplied, derive a factual interpretation only from supplied counts and current values;
do not infer movement, causation, or status.
Keep action or selected-state color for actions and selection; use distinct
status colors for positive, warning, destructive, and neutral meaning, always
with text or an icon as a second cue. Use an installed Badge or StatCard semantic variant when one exists;
never style every rate with \`text-primary\`. Never invent a trend or status claim to create color or context.
Keep useful count, trend, status, record
metadata, and explanatory context instead of flattening every row into the same
neutral treatment. Do not show a workflow stepper on an overview or dashboard;
the overview is not a workflow step. Start progress only after the user begins
the dependent task, and keep it attached to the task screens. When a fixture lists its overview as the first item in a steps array, exclude that overview when counting workflow steps.
With three or fewer dependent task screens, use no stepper or progress rail.`;

const COMPOSE_AND_COPY = `Composition is also pass/fail. Keep one visible identity block per level and size a short primary task to its content; a major surface fails when more than one-third of its height is unused after the action. Keep related input, derived value, and submit action together, with the input and button sharing a control height and bottom baseline. Decorative spatial cues stay behind the domain header, never behind controls. Paired flags or logos must be accurate and symmetric; otherwise omit every peer asset rather than drawing placeholders.

The UI copy inside the screen follows the same restraint: short headlines (about 6 words), supporting lines about 15 words and at most one per section, no filler adjectives, no exclamation marks, and no emoji as icons. Every visible text fragment needs one job: context, outcome, next action, real doubt, or legal/security. Do not add template footer, provenance, helper, or slogan copy. If deletion does not hurt meaning, action clarity, safety, compliance, or tone, keep it deleted. Never place an eyebrow, kicker, category, or status label immediately above an \`h1\`, \`h2\`, or \`h3\`; start with the title and put essential context in the supporting line or after the title. Avoid the template shapes (gradient hero with an uppercase eyebrow pill, centered three-card feature grid, left-border callout boxes) unless the user asks. After writing the UI, call \`get-review-rules\`. For dashboards, run \`review-dashboard-structure\`, \`check-comprehension\`, and \`inspect-spacing\`, deploy the exact source to a public HTTPS preview, then call \`finalize-dashboard-review\` with its URL, the exact source, installed component source, and unchanged fixture. Better Design captures the PNG, visible text, and measured DOM itself at 390, 1440, and 1728, then content-addresses the live deployment. A missing trusted capture, invalid deployment revision, invalid geometry, or hidden fixture field means incomplete. Only a VALID final receipt permits presentation; any later source or deployment edit voids it. For other UI, fix every critical or serious review, comprehension, and spacing finding before presenting. Screenshot desktop and mobile and squint-test each viewport; on a commerce or product page, only the product image, price, and primary CTA may dominate.`;

// A native app builds from the SwiftUI or React Native kit, not the React
// install. Guessing which requests are native from their words kept routing a
// homepage or a privacy policy for an iOS app to the native rules, so every
// request gets the web rules and this one pointer. [BD-1359]
const NATIVE_TARGET_RULE = `**Building a native iOS or Android app?** Call \`get-design-system-kit\` with the chosen match's id as \`designSystemId\` and \`target: "swiftui"\` for SwiftUI, or \`target: "react-native"\` for React Native and Expo, instead of the React install.`;


/** Words that mark a request for a deck, so only those searches carry the Open Slide rule. [BD-1359] */
const PRESENTATION_QUERY = /\b(?:deck|decks|slides?|presentations?|pitch|keynote|powerpoint|pptx)\b/i;

/**
 * The build-target rule for one request. A search reply stays in the agent's
 * context for the whole build, so only a request about a deck gets the Open
 * Slide section, and only an account in the mobile pilot gets the pointer to
 * the native kits. [BD-1359]
 */
export function buildTargetRuleFor(query?: string, { mobileKits = false }: { mobileKits?: boolean } = {}): string {
  const presentation = query === undefined || PRESENTATION_QUERY.test(query);
  return [
    REDESIGN_SCOPE_CONTRACT,
    DESIGN_TRADEOFF_RULE,
    ...(presentation ? [PRESENTATION_RUNTIME_RULE] : []),
    WEB_TARGET_RULE,
    // An account outside the mobile pilot has no native target to call, so a
    // caller that leaves the flag out never shows the pointer.
    ...(mobileKits ? [NATIVE_TARGET_RULE] : []),
    TIGHT_OUTPUT_RULE,
    WEB_FIDELITY_RULE,
    HIERARCHY_RULE,
    DASHBOARD_RULE,
    COMPOSE_AND_COPY,
  ].join("\n\n");
}

/** The full rule for callers with no request to read: Open Slide included, no native pointer, since the tool description is the same for every account. */
export const BUILD_TARGET_RULE = buildTargetRuleFor();

// Best-effort secondary signal on top of BUILD_TARGET_RULE: if the MCP client
// identifies as a known code editor / agent (a host that always has a filesystem),
// return its name so the caller can hard-steer it away from the inline HTML kit.
// Returns undefined for chat hosts and unknown clients (the capability rule covers
// those; we never want to wrongly push a chat canvas toward React). [BD-147]
const CODING_HOST_RE =
  /claude[- ]?code|cursor|windsurf|devin|antigravity|cline|continue|codeium|codex|zed|vs[- ]?code|vscode|jetbrains|intellij|webstorm|pycharm|goland|rider|neovim|nvim/i;

/**
 * The MCP client's own name from the initialize handshake, for example
 * "cursor-vscode". Returns undefined for a transport that cannot report it, in
 * which case callers must behave as if every host were the same. [BD-495]
 */
export function mcpClientName(server: McpServer): string | undefined {
  try {
    return server.server.getClientVersion?.()?.name || undefined;
  } catch {
    // Client identity is an optional hint, never a requirement.
    return undefined;
  }
}

export function codingHostName(server: McpServer): string | undefined {
  try {
    const name = server.server.getClientVersion?.()?.name;
    return name && CODING_HOST_RE.test(name) ? name : undefined;
  } catch {
    // Client identity is an optional hint; a transport that cannot report it
    // is simply an unknown host (see doc above).
    return undefined;
  }
}

export const PREVIEW_OUTPUT_SCHEMA = z.object({
  status: z.string().describe("completed | error | pending | generating | selected"),
  name: z.string().describe("Display name of the design system or project."),
  viewUrl: z.string().optional().describe("Owner-facing Better Design page (the human 'Open' link). May require login."),
  previewUrl: z.string().optional().describe("Public, cookieless showcase URL used to generate preview assets. Falls back to viewUrl."),
  shotUrl: z.string().optional().describe("Real screenshot of the showcase page for the self-contained preview widget."),
  installCommand: z.string().optional().describe("shadcn install command, when complete."),
  installedTo: z.string().optional().describe("The project folder this server installed the design system into. Build there; run no setup command."),
  localInstall: z.boolean().optional().describe("True when this server runs on the user's machine and installs the design system itself: call get-design-system-kit again with install: true."),
  newProjectCommand: z.string().optional().describe("Creates a Vite + React + TypeScript project with Tailwind v4, the @/* alias and components.json, for when there is no project yet. Run it, then run installCommand inside the new my-app folder."),
  installLibrary: z.enum(["base-ui", "radix", "mixed"]).optional().describe("Actual component library flavor installed by installCommand."),
  installNote: z.string().optional().describe("Important install flavor or fallback note for clients that read only structuredContent."),
  step: z.string().optional().describe("Current generation step, while generating."),
  tokensCss: z.string().describe("CSS custom-property stylesheet for the system's tokens."),
});

/** Shared design-choice and build guidance carried by structured-only clients. */
export const BUILD_INSTRUCTIONS_FIELD = z.string().min(1).optional().describe("Required design-choice guidance and any target-specific build/review steps for clients that read only structuredContent.");

// The MCP SDK only advertises and validates a root Zod object output schema;
// unions are dropped by normalizeObjectSchema. This tool returns React
// success, HTML success, and error shapes, so HTML-only fields remain optional
// in the shared advertised object. completedHtmlKitStructuredContent is the
// single runtime constructor for successful HTML output, and tests pin every
// mandatory field on all three HTML branches. [BD-240]
/**
 * The kit output schema is advertised verbatim in tools/list, so when the
 * Shopify target is off-pilot the schema must not name it either: no themeFiles
 * field, and no field documentation that mentions the target. [BD-369]
 */
export function buildKitOutputSchema(enableShopifyKit = true) {
  const shared = enableShopifyKit ? "HTML and Shopify targets." : "HTML target only.";
  const base = PREVIEW_OUTPUT_SCHEMA.extend({
    buildInstructions: BUILD_INSTRUCTIONS_FIELD,
    iconLibrary: selectedIconSchema.optional().describe("The design system's existing icon family and variant. Reuse it; do not select another pack."),
    iconSelectionStatus: z.enum(["selected", "unverified"]).optional().describe("Selected means identity is known, not that rendered icon use was reviewed."),
    iconInstructions: z.string().optional().describe("Instructions for exact selected-icon lookup, or an explicit missing-selection warning."),
    requiredWrapperClass: z.literal("ds").optional().describe(`${shared} The artifact or snippet root must retain this class exactly.`),
    requiredComponentClassPrefix: z.literal("ds-").optional().describe(`${shared} Interactive components must retain classes with this prefix; never rename it.`),
    customCssScope: z.literal("layout-only").optional().describe(`${shared} Custom classes may arrange layout but must not replace kit component styling.`),
    hoverPolicy: z.string().min(1).optional().describe(`${shared} Mandatory pointer-safe hover contract to verify before presenting.`),
    hostIsolationCssTemplate: z.string().min(1).optional().describe("HTML target only. Replace APP_ROOT with the artifact root selector and paste after host/base CSS so semantic text cannot inherit the host's light/dark colors."),
    minimumTextContrast: z.literal("4.5:1").optional().describe(`${shared} Minimum contrast for normal visible text against its computed background.`),
    textColorPolicy: z.string().min(1).optional().describe(`${shared} Mandatory semantic foreground-token contract; surface tokens and opacity must not be used to mute text.`),
    hierarchyPolicy: z.string().min(1).optional().describe("HTML target only. Mandatory first-view hierarchy, progressive-disclosure, and information-budget contract."),
    compositionPolicy: z.string().min(1).optional().describe("HTML target only. Mandatory layout-density and container-restraint policy."),
    componentCss: z.string().min(1).optional().describe("HTML target only. Paste this token-driven ds-* component stylesheet verbatim."),
    componentMaterialCss: z.string().optional().describe("HTML target only. Paste this design-system-specific material override after componentCss."),
    componentExampleHtml: z.string().min(1).optional().describe("HTML target only. Starter markup that demonstrates the required .ds wrapper and ds-* component classes."),
    tokensJson: z.string().min(1).optional().describe("DTCG target only. The design tokens as a W3C Design Tokens (DTCG) document. Write it to tokens.json; every token tool reads this format, including Style Dictionary, Tokens Studio, Terrazzo, and the Figma plugins that create variables."),
    nativeFiles: z
      .array(z.object({ path: z.string().min(1), content: z.string().min(1) }))
      .optional()
      .describe("React Native and SwiftUI targets only. Write each file verbatim at its path: this system's stored theme and material, and the primitives that read it."),
    screenshotFiles: z
      .array(z.object({ path: z.string().min(1), content: z.string().min(1) }))
      .optional()
      .describe("Store screenshots target only. Write each file verbatim at its path, then follow buildInstructions to capture screens, write the slides and render the PNG files."),
    unsupportedTokens: z
      .array(z.object({
        name: z.string().min(1),
        value: z.string().min(1),
        mode: z.enum(["light", "dark"]),
      }))
      .optional()
      .describe("React Native and SwiftUI targets only. Tokens that need a browser to resolve, a calc(), a var(), or a relative oklch(), so they carry no native value. Set them by hand if the screen needs them. A token whose mode is dark matters more: the dark palette inherits the light value for any key it does not set, so a dropped dark override reads as the light colour on a dark screen."),
  });

  if (!enableShopifyKit) return base;

  return base.extend({
    supportedInstallationScope: z.literal("full-storefront-only").optional().describe("Shopify full kit is not page-scoped. Withhold installation for a page-only task until isolated files and styles exist."),
    iconMaterialStatus: z.enum(["current", "legacy-unverified"]).optional().describe("Shopify stored glyph metadata is current, or legacy and unverified. This is not rendered review evidence."),
    themeFiles: z
      .array(z.object({ path: z.string().min(1), content: z.string().min(1) }))
      .optional()
      .describe("Shopify target only. Theme files to write verbatim at each path: the per-system CSS asset, the Liquid snippets, and the theme editor sections."),
  });
}

export const BUILD_KIT_OUTPUT_SCHEMA = buildKitOutputSchema();

// Optional agent-intent field added to non-search tool schemas so the caller can
// state WHY it invoked the tool. Search tools already carry a natural-language
// query; id/prompt-keyed tools (install-icons, get-design-system-kit, preview,
// …) carried nothing, so their alert showed the tool fired but not the intent.
// The agent fills it (mirrors PostHog's MCP `context` pattern); we forward it to
// onToolUsage and render it as `📝 intent:` in the alert. Analytics only —
// never alters the tool result. [BD-188]
export const CONTEXT_ARG = z
  .string()
  .max(280)
  .optional()
  .describe(
    "Optional. One sentence on WHY you are calling this and what the user asked for (e.g. 'adding nav icons for the fintech dashboard'). Used only for usage analytics; does not change the result.",
  );

/**
 * Annotations for a tool that only reads Better Design's own catalog, or that
 * analyses text the caller passed in, and returns the answer.
 *
 * All four hints are set on purpose. A hint left undefined reads as "unknown"
 * to a host and to an app reviewer, so every tool states all four. See
 * `docs/mcp-tool-annotations.md` for the per-tool justification. [BD-316]
 *
 * - `readOnlyHint: true`: the call changes no state the caller can observe.
 * - `destructiveHint: false`: it writes nothing, so it deletes nothing.
 * - `idempotentHint: true`: repeating the call adds no effect.
 * - `openWorldHint: false`: it reads a bounded catalog or selected project,
 *   without browsing external content or publishing changes.
 */
export const READ_ONLY_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * Annotations for a read-only tool that accesses public external content,
 * including Iconify search and caller-supplied public URLs. Everything else matches
 * `READ_ONLY_TOOL_ANNOTATIONS`.
 */
export const READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export interface ToolUsageContext {
  /** MCP client name from the initialize handshake (e.g. "claude-ai", "cursor-vscode", "windsurf"). */
  clientName?: string;
  /** MCP client version from the initialize handshake. */
  clientVersion?: string;
  /** Wall-clock time the tool took, in milliseconds. For the trace span latency [BD-109]. */
  durationMs?: number;
  /** Error message when isError is true. */
  errorMessage?: string;
  /** Whether the tool threw / returned an error. */
  isError?: boolean;
  /** First ~1000 chars of the tool's text response, used for eval inspection in PostHog. */
  outputPreview?: string;
  /**
   * The full source a review tool received and its full findings [BD-816].
   * The remote transport writes it to R2; the stdio client never sends it.
   */
  review?: ReviewCapture;
}

export type TrackMeta = Omit<ToolUsageContext, "clientName" | "clientVersion">;

export type McpAuthContext =
  | { kind: "api-key"; apiKey: string }
  | { kind: "oauth"; accessToken: string };

/**
 * The bearer a tool sends to a Better Design v1 route for this connection: the
 * API key, or the connector session's OAuth access token. The routes the tools
 * call accept both, verified the same way `/api/mcp` verifies them. [BD-1337]
 */
export function authBearer(authContext: McpAuthContext): string {
  return authContext.kind === "api-key" ? authContext.apiKey : authContext.accessToken;
}

/** The `Authorization` header for `authBearer`, or no header without a connection credential. */
export function authHeaders(authContext?: McpAuthContext): HeadersInit {
  return authContext ? { Authorization: `Bearer ${authBearer(authContext)}` } : {};
}

export type TrackToolUsage = (
  tool: string,
  params: Record<string, JsonValue | undefined>,
  meta?: TrackMeta,
) => void;

export interface SearchCapture {
  query?: string;
  topic?: string;
  topResults: DsTopResult[];
  /** Agent-stated intent (the `context` arg) for tools that carry both a query and a why. [BD-205] */
  context?: string;
}

export type TrackedToolRunner = <TArgs, TResult>(
  tool: string,
  args: TArgs,
  run: () => Promise<TResult>,
) => Promise<TResult>;

export interface RegisterToolDeps {
  server: McpServer;
  /** Renders video frames on the user's machine. Only the stdio server passes one. [BD-1133] */
  renderFrames?: RenderFrames;
  /** Sets up the project and installs a design system. Only the stdio server passes one. [BD-1262] */
  installKit?: InstallKit;
  /** Saves install-icons files into the project; stdio only. [BD-1278] */
  writeIcons?: WriteIcons;
  /** Saves a SwiftUI or React Native kit into the app folder; stdio only. [BD-1336] */
  writeKitFiles?: WriteKitFiles;
  /** Reads reference screens from the corpus, so a mobile kit can show how shipped apps built the screen. [BD-1349] */
  readInspiration?: ReadInspiration;
  provider: DataProvider;
  tracked: TrackedToolRunner;
  track: TrackToolUsage;
  authContext?: McpAuthContext;
  /**
   * Use this, not the global fetch, for every call to Better Design's own
   * /api routes. Inside the Cloudflare Worker it is bound to the Worker's self
   * service binding, because a subrequest to the Worker's own zone route never
   * re-enters the Worker. Outside it (the stdio npm client) it is the global
   * fetch against the public host. [BD-356]
   */
  apiFetch?: typeof fetch;
  /**
   * Verified user id for this request, when the transport knows one. The remote
   * transport passes the id it already authenticated; the stdio client has no
   * user id and leaves it unset, so its provider resolves the caller from the
   * API key instead. [BD-495]
   */
  userId?: string;
  /** Server-owned browser capture. Without it, dashboard finalization stays incomplete. */
  captureDashboardBrowser?: CaptureDashboardBrowser;
}

/**
 * How long the session lookup may take before the tool answers without it. A
 * slow ledger must not hold up a review, so the wait is capped well below any
 * client timeout.
 */
const SESSION_LOOKUP_TIMEOUT_MS = 2_000;

/**
 * Read what this session already did, for session-aware review. [BD-495]
 *
 * Degrades to an empty session on every failure path: a provider that does not
 * implement the lookup, a rejected promise, a slow one, a malformed payload, or
 * simply no rows. The ledger behind it has been silently dead before (BD-180),
 * so an empty window is the expected case and must never surface as a tool
 * error.
 *
 * @param clientName Host making the current call, so a person working in two
 * editors at once does not read the other one's session.
 */
export async function loadSessionGuidance(
  provider: DataProvider,
  userId?: string,
  clientName?: string,
  now: number = Date.now(),
): Promise<SessionGuidance> {
  if (!provider.getRecentGuidance) return NO_SESSION_GUIDANCE;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const calls = await Promise.race([
      provider.getRecentGuidance(userId, now - MCP_SESSION_WINDOW_MS),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), SESSION_LOOKUP_TIMEOUT_MS);
      }),
    ]);
    if (!Array.isArray(calls) || calls.length === 0) return NO_SESSION_GUIDANCE;
    return summarizeSessionGuidance(calls, clientName);
  } catch {
    // Session awareness is an enhancement, never a dependency. A failed lookup
    // reads as an empty session, never as a tool error.
    return NO_SESSION_GUIDANCE;
  } finally {
    // Never leave the race timer holding the event loop open once the answer
    // is in: the stdio client is a long-lived process and tests wait on it.
    if (timer) clearTimeout(timer);
  }
}

export const SEARCH_TOOLS: ReadonlySet<string> = new Set([
  "find-design-system",
  "get-ui-principle",
  "get-ux-principle",
  "get-react-native-guide",
  "get-swiftui-guide",
  "get-three-js-guide",
  "get-shopify-guide",
  "get-sales-principle",
  "get-motion-guide",
  "get-widget-guide",
  "get-review-rules",
  "find-icon-library",
  "find-icons",
  "create-design-system",
  "get-design-system-kit",
]);

/** Pulls the first text block out of an MCP tool result, for telemetry previews. */
export function extractOutputPreview<TResult>(result: TResult): string | undefined {
  // SAFETY: an MCP tool result carries a content list; entries are checked
  // before use.
  const content = (result as { content?: Array<{ type?: unknown; text?: unknown }> } | null | undefined)?.content;
  if (!Array.isArray(content)) return undefined;
  const first = content.find((c) => c?.type === "text" && isString(c.text));
  const text = first?.text;
  if (!isString(text) || !text) return undefined;
  return text.length > MAX_OUTPUT_PREVIEW
    ? text.slice(0, MAX_OUTPUT_PREVIEW) + "…"
    : text;
}

export function createTracking(
  server: McpServer,
  onToolUsage?: (
    tool: string,
    params: Record<string, JsonValue | undefined>,
    context: ToolUsageContext,
  ) => void,
) {
  const track: TrackToolUsage = (tool, params, meta) => {
    if (!onToolUsage) return;
    try {
      const info = server.server.getClientVersion?.();
      onToolUsage(tool, params, {
        clientName: info?.name,
        clientVersion: info?.version,
        durationMs: meta?.durationMs,
        errorMessage: meta?.errorMessage,
        isError: meta?.isError,
        outputPreview: meta?.outputPreview,
        review: meta?.review,
      });
    } catch {
      // analytics must never break MCP tool responses
    }
  };

  // Record successful and thrown tool calls so failed calls are not invisible in
  // session telemetry. [BD-109]
  const tracked: TrackedToolRunner = async (tool, args, run) => {
    const start = Date.now();
    try {
      const result = await run();
      // SAFETY: tool args arrive as a JSON-RPC params object.
      track(tool, args as Record<string, JsonValue | undefined>, {
        durationMs: Date.now() - start,
        isError: false,
        outputPreview: extractOutputPreview(result),
      });
      return result;
    } catch (error) {
      // SAFETY: tool args arrive as a JSON-RPC params object.
      track(tool, args as Record<string, JsonValue | undefined>, {
        durationMs: Date.now() - start,
        errorMessage: error instanceof Error ? error.message : String(error),
        isError: true,
      });
      throw error;
    }
  };

  return { track, tracked };
}

export function trackSearch<T>(
  track: TrackToolUsage,
  tool: string,
  capture: SearchCapture,
  start: number,
  response: T,
  isError = false,
  errorMessage?: string,
): T {
  track(
    tool,
    { query: capture.query, topic: capture.topic, topResults: capture.topResults, context: capture.context },
    {
      durationMs: Date.now() - start,
      errorMessage,
      isError,
      outputPreview: extractOutputPreview(response),
    },
  );
  return response;
}

export async function fetchWithTimeout(
  url: string,
  timeoutMs = ICONIFY_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await globalThis.fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

type MarkdownFence = {
  marker: "`" | "~";
  length: number;
  start: number;
};

function findUnclosedFenceStart(markdown: string): number | null {
  let activeFence: MarkdownFence | null = null;
  let offset = 0;

  for (const line of markdown.split("\n")) {
    const logicalLine = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (activeFence) {
      const closing = /^ {0,3}(`+|~+)[ \t]*$/.exec(logicalLine);
      if (
        closing
        && closing[1][0] === activeFence.marker
        && closing[1].length >= activeFence.length
      ) {
        activeFence = null;
      }
    } else {
      const opening = /^ {0,3}(`{3,}|~{3,})/.exec(logicalLine);
      if (opening) {
        // SAFETY: the regex alternatives admit only these values.
        activeFence = {
          marker: opening[1][0] as MarkdownFence["marker"],
          length: opening[1].length,
          start: offset,
        };
      }
    }
    offset += line.length + 1;
  }

  return activeFence?.start ?? null;
}

export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;

  let truncated = text.slice(0, maxChars);
  const lastCompleteLine = truncated.lastIndexOf("\n");
  if (lastCompleteLine > 0) truncated = truncated.slice(0, lastCompleteLine);

  // Never hand an agent half a code example. If the token budget lands inside
  // a fenced block, keep the preceding complete content instead.
  const unclosedFenceStart = findUnclosedFenceStart(truncated);
  if (unclosedFenceStart !== null) {
    truncated = truncated.slice(0, unclosedFenceStart).trimEnd();
  }

  return truncated + `\n\n...(truncated to ~${maxTokens} tokens)`;
}
