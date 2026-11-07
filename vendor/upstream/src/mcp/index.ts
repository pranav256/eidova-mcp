import type { RenderFrames } from "./video/render-frames";
import type { InstallKit } from "./install-kit";
import type { WriteIcons } from "./write-icons";
import type { WriteKitFiles } from "./write-kit-files";
import type { JsonValue } from "../guards";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { declareAdvertisedSchemaDialect } from "./advertised-schema";
import { DIRECTORY_INSTRUCTIONS, declareDirectoryListing } from "./directory-listing";
import type { DataProvider } from "./data-provider";
import type { CaptureDashboardBrowser } from "./dashboard-browser-capture";
import type { ReadInspiration } from "./inspiration";
import type { SendAgentFeedback } from "./tools/feedback-tools";
import type { ConfirmAgentClaim } from "./tools/claim-tools";
import type { ReadRecentChecks } from "./tools/design-panel-tools";
import { getMcpInstructions } from "./instructions";
import { registerAllTools, type ToolUsageContext, type McpAuthContext } from "./tools";
import { MCP_IMPLEMENTATION_VERSION } from "./version";

export type { ToolUsageContext, McpAuthContext };
export { SEARCH_TOOLS } from "./tools";
export { authBearer, authHeaders } from "./tools/shared";
export { MCP_IMPLEMENTATION_VERSION };
export { BUILD_LOOP } from "./build-loop";
export { DIRECTORY_INSTRUCTIONS, DIRECTORY_TOOL_DESCRIPTIONS } from "./directory-listing";
export {
  ADVERTISED_JSON_SCHEMA_DIALECT,
  DRAFT_7_ONLY_KEYWORDS,
  declareAdvertisedSchemaDialect,
} from "./advertised-schema";
export {
  HISTORICAL_MCP_TOOL_NAMES,
  MCP_MEASURABLE_TOOL_NAMES,
  MCP_MEASURABLE_TOOL_NAMES_V1,
  MCP_TRACE_TOOL_NAMES,
  MCP_TOOL_NAMES,
  MCP_TOOL_NAMES_V1,
  MCP_TOOL_RENAMES,
  MCP_TOOL_RENAMES_V1,
  UNKNOWN_MCP_TOOL_NAME,
  canonicalMcpToolName,
  measurementToolFamily,
  measurementToolFamilyV1,
  type McpTraceToolName,
  type McpToolName,
} from "./tool-names";
// Shared with the retrieval A/B runner so its token counts match tool output.
export { formatSearchResultContent } from "./tools/principle-tools";

export interface CreateMcpServerOptions {
  provider: DataProvider;
  name?: string;
  version?: string;
  /** Optional hook called on every tool invocation for analytics. */
  onToolUsage?: (
    tool: string,
    params: Record<string, JsonValue | undefined>,
    context: ToolUsageContext,
  ) => void;
  /**
   * Caller identity for the current MCP request. When set, tools that hit
   * upstream Better Design endpoints (notably `create-design-system`) forward
   * the bearer so the server can meter per-user credits instead of falling
   * back to the IP-keyed anonymous quota.
   */
  authContext?: McpAuthContext;
  /** Whether the private React Native/Expo guidance tool is registered. */
  enableReactNativeGuide?: boolean;
  /** Whether the Three.js/React Three Fiber guidance tool is registered. */
  enableThreeJsGuide?: boolean;
  /** Whether the Shopify Liquid kit and implementation guide are registered. */
  enableShopifyKit?: boolean;
  /** Whether the caller registers review-ui-code, so the instructions may name it. */
  enableReviewUiCode?: boolean;
  /** Whether the stored React Native and SwiftUI kit targets are registered. */
  enableMobileKits?: boolean;
  /** Whether the ChatGPT design panel is registered. */
  enableDesignPanel?: boolean;
  /**
   * How tools reach Better Design's own /api routes. On the remote transport
   * the server runs INSIDE the Cloudflare Worker that serves those routes, and
   * a Worker subrequest to its own zone route does not re-enter the Worker, so
   * the request never reaches the handler. The Worker passes a fetch bound to
   * its self service binding here. Defaults to the global fetch, which is what
   * the stdio npm client uses to reach the public host. [BD-356]
   */
  apiFetch?: typeof fetch;
  /**
   * Verified user id of the caller, when the transport knows one. Session-aware
   * review uses it to look up the guidance this session already loaded. The
   * stdio client leaves it unset: it never learns its own user id, so its
   * provider resolves the caller from the API key instead. [BD-495]
   */
  userId?: string;
  /** Trusted browser used to capture deployed dashboards for final receipts. */
  captureDashboardBrowser?: CaptureDashboardBrowser;
  /**
   * Serve the connection that Claude and ChatGPT list in their directories:
   * plain tool descriptions and instructions, and no analytics-only `context`
   * field. Off for the npm and API-key paths, which keep the workflow text. [BD-389]
   */
  directoryListing?: boolean;
  /**
   * Reads the inspiration library. The Worker reads its corpus bucket; the
   * stdio client calls the API. Without it, `get-inspiration` says the library
   * is not available. [BD-966]
   */
  readInspiration?: ReadInspiration;
  /**
   * Sends an agent's report to `POST /api/v1/feedback`. The stdio client and
   * the Worker's API-key path pass one; without it, `send-feedback` is not
   * registered. [BD-956]
   */
  sendFeedback?: SendAgentFeedback;
  /**
   * Sends a claim code to `POST /api/v1/claim/confirm` with the connection's
   * own key. The stdio client and the Worker's API-key path pass one; without
   * it, `confirm-claim` is not registered. [BD-983]
   */
  confirmClaim?: ConfirmAgentClaim;
  /**
   * Renders video frames in the user's Remotion project. Only the stdio client
   * passes one; without it, render-video-frames returns the commands. [BD-1133]
   */
  renderFrames?: RenderFrames;
  /**
   * Sets up the user's project and installs a design system into it. Only the
   * stdio client passes one; without it, get-design-system-kit has no install
   * argument and returns the commands. [BD-1262]
   */
  installKit?: InstallKit;
  /**
   * Saves install-icons files into the user's project. Only the stdio client
   * passes one; without it, install-icons returns the files to save. [BD-1278]
   */
  writeIcons?: WriteIcons;
  /**
   * Saves a SwiftUI or React Native kit into the user's app folder. Only the
   * stdio client passes one; without it, the kit returns its files to save. [BD-1336]
   */
  writeKitFiles?: WriteKitFiles;
  /**
   * Reads the account's newest check results from the call archive, for the
   * design panel's Review tab. Only the Worker passes one; without it, the
   * tab shows no checks.
   */
  readRecentChecks?: ReadRecentChecks;
}

export function createMcpServer(options: CreateMcpServerOptions): McpServer {
  const {
    provider,
    name = "BetterDesign",
    version = MCP_IMPLEMENTATION_VERSION,
    onToolUsage,
    authContext,
    enableReactNativeGuide = true,
    enableThreeJsGuide = true,
    enableShopifyKit = true,
    enableReviewUiCode = false,
    enableMobileKits = true,
    enableDesignPanel = true,
    apiFetch = globalThis.fetch,
    userId,
    captureDashboardBrowser,
    directoryListing = false,
    readInspiration,
    sendFeedback,
    confirmClaim,
    renderFrames,
    readRecentChecks,
    installKit,
    writeIcons,
    writeKitFiles,
  } = options;

  const server = new McpServer(
    { name, version },
    {
      instructions: directoryListing
        ? DIRECTORY_INSTRUCTIONS
        : getMcpInstructions({
            enableReactNativeGuide,
            enableThreeJsGuide,
            enableShopifyKit,
            enableReviewUiCode,
          }),
    },
  );

  // Must run before the first registerTool, and before any tool a caller
  // registers on the returned server, such as registerReviewTool.
  declareAdvertisedSchemaDialect(server);
  if (directoryListing) declareDirectoryListing(server);

  registerAllTools(
    server,
    provider,
    onToolUsage,
    authContext,
    {
      enableReactNativeGuide,
      enableThreeJsGuide,
      enableShopifyKit,
      enableMobileKits,
      enableDesignPanel,
    },
    apiFetch,
    userId,
    captureDashboardBrowser,
    readInspiration,
    sendFeedback,
    confirmClaim,
    renderFrames,
    readRecentChecks,
    installKit,
    writeIcons,
    writeKitFiles,
  );

  return server;
}

// Re-exports
export type { DataProvider };
export type {
  InspirationRequest,
  InspirationResult,
  ReadInspiration,
} from "./inspiration";
export type { HtmlFlowResult } from "./html-flows";
export { createFeedbackSender, type SendAgentFeedback } from "./tools/feedback-tools";
export type { CatalogCard } from "./catalog-cards";
export { DESIGN_PANEL_WIDGET_URI } from "./design-panel-html";
export type { ReadRecentChecks } from "./tools/design-panel-tools";
export type { CheckRun, ProjectCard } from "./panel-data";
export { createClaimConfirmer, type AgentClaimReceipt, type ConfirmAgentClaim } from "./tools/claim-tools";
export type {
  CaptureDashboardBrowser,
  DashboardBrowserCapture,
  DashboardBrowserCaptureRequest,
  DashboardBrowserCaptureState,
} from "./dashboard-browser-capture";
export type {
  DesignSystemSearchResult,
  DesignSystemMetadata,
  DesignSystemComponent,
  DesignSystemWithComponents,
  DesignSystemLookupOptions,
  FoundationalDoc,
  FoundationalDocSearchResult,
  IconLibrarySearchResult,
  IconLibraryInfo,
  PrincipleArea,
  TeamRuleProposalInput,
  TeamRuleProposeOutcome,
} from "./data-provider";
export { teamRuleProposalParts } from "./team-rule-proposal";
export { INSTRUCTIONS } from "./instructions";
export {
  BRAND_READ_TOOL,
  DESIGN_SYSTEM_TOOLS,
  GUIDANCE_TOOLS,
  MCP_SESSION_WINDOW_MS,
  REVIEW_TOOLS,
  SESSION_LEDGER_TOOLS,
  SESSION_LOOP_TOOLS,
  designSystemNudge,
  formatTopicList,
  guidancePreamble,
  nextBuildStep,
  reviewDesignSystemStep,
  reviewNudge,
  reviewSectionForTopic,
  summarizeSessionGuidance,
  weightReviewRules,
  type RecentGuidanceCall,
  type SessionGuidance,
} from "./session-guidance";
export { BUILD_TARGET_RULE, buildTargetRuleFor } from "./tools/shared";
export { REVIEW_RULE_CATEGORIES } from "./tools/review-rules-description";
export {
  analyzeDashboardStructure,
  formatDashboardStructureReport,
  type DashboardStructureFinding,
  type DashboardStructureInput,
  type DashboardStructureReport,
  type DashboardComponentSources,
  type DashboardFixture,
  type DashboardMetricInput,
  type DashboardRecordInput,
  deriveDashboardInterpretation,
} from "./tools/dashboard-review-tools";
export {
  finalizeDashboardUiReview,
  verifyUiReviewReceipt,
  type FinalDashboardUiReviewInput,
  type FinalUiReviewDecision,
  type FinalUiReviewFinding,
  type UiReviewReceipt,
} from "./tools/final-ui-review-tools";
export {
  buildShopifyPrimitiveSet,
  parseShopifyPrimitiveSet,
  SHOPIFY_PRIMITIVE_CONTRACT_VERSION,
  type ShopifyPrimitiveSet,
  type ShopifyPrimitiveSourceFile,
} from "./shopify-primitives";
export { spacingStateSchema } from "./tools/inspection-tools";
