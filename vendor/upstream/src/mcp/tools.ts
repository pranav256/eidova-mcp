import type { JsonValue } from "../guards";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DataProvider } from "./data-provider";
import type { CaptureDashboardBrowser } from "./dashboard-browser-capture";
import {
  createTracking,
  type ToolUsageContext,
  type McpAuthContext,
} from "./tools/shared";
import { registerPrincipleTools } from "./tools/principle-tools";
import { registerComprehensionTools } from "./tools/comprehension-tools";
import { registerIconTools } from "./tools/icon-tools";
import { registerDesignSystemTools } from "./tools/design-system-tools";
import { registerDesignConfigTools } from "./tools/design-config-tools";
import { registerJigTools } from "./tools/jig-tools";
import { registerExtractTools } from "./tools/extract-tools";
import { registerIllustrationTools } from "./tools/illustration-tools";
import { registerPreviewResource } from "./tools/preview-resource";
import { registerInspectionTools } from "./tools/inspection-tools";
import { registerInspectionResource } from "./tools/inspection-resource";
import { registerDashboardReviewTools } from "./tools/dashboard-review-tools";
import { registerFinalUiReviewTools } from "./tools/final-ui-review-tools";
import { registerWidgetTools } from "./tools/widget-tools";
import { registerFeatureMapTools } from "./tools/feature-map-tools";
import { registerTeamRulesTools } from "./tools/team-rules-tools";
import { registerInspirationTools } from "./tools/inspiration-tools";
import { registerFeedbackTools, type SendAgentFeedback } from "./tools/feedback-tools";
import { registerDesignPanelTools, type ReadRecentChecks } from "./tools/design-panel-tools";
import { registerProjectChangeTools } from "./tools/project-change-tools";
import { registerClaimTools, type ConfirmAgentClaim } from "./tools/claim-tools";
import { registerVideoTools } from "./tools/video-tools";
import { registerStoreListingTools } from "./tools/store-listing-tools";
import { registerDesignMakerTools } from "./tools/design-maker-tools";
import type { RenderFrames } from "./video/render-frames";
import type { InstallKit } from "./install-kit";
import type { WriteIcons } from "./write-icons";
import type { WriteKitFiles } from "./write-kit-files";
import type { ReadInspiration } from "./inspiration";

export type { ToolUsageContext, McpAuthContext };
export { SEARCH_TOOLS } from "./tools/shared";

export interface ToolRegistrationOptions {
  enableReactNativeGuide?: boolean;
  enableThreeJsGuide?: boolean;
  enableShopifyKit?: boolean;
  /** The stored React Native and SwiftUI kits, gated like Shopify. [ADR 0003] */
  enableMobileKits?: boolean;
  /** The ChatGPT design panel. Off for the npm client, which no ChatGPT reaches. */
  enableDesignPanel?: boolean;
}

export function registerAllTools(
  server: McpServer,
  provider: DataProvider,
  onToolUsage?: (
    tool: string,
    params: Record<string, JsonValue | undefined>,
    context: ToolUsageContext,
  ) => void,
  authContext?: McpAuthContext,
  options: ToolRegistrationOptions = {},
  apiFetch: typeof fetch = globalThis.fetch,
  userId?: string,
  captureDashboardBrowser?: CaptureDashboardBrowser,
  readInspiration?: ReadInspiration,
  sendFeedback?: SendAgentFeedback,
  confirmClaim?: ConfirmAgentClaim,
  renderFrames?: RenderFrames,
  readRecentChecks?: ReadRecentChecks,
  installKit?: InstallKit,
  writeIcons?: WriteIcons,
  writeKitFiles?: WriteKitFiles,
): void {
  const { track, tracked } = createTracking(server, onToolUsage);
  const deps = {
    server,
    provider,
    track,
    tracked,
    authContext,
    apiFetch,
    userId,
    captureDashboardBrowser,
    renderFrames,
    installKit,
    writeIcons,
    writeKitFiles,
    readInspiration,
  };

  registerPrincipleTools(deps, options);
  registerVideoTools(deps);
  registerWidgetTools(deps);
  registerComprehensionTools(deps);
  registerDashboardReviewTools(deps);
  registerFinalUiReviewTools(deps);
  registerIconTools(deps);
  registerDesignSystemTools(deps, options);
  registerDesignConfigTools(deps);
  registerJigTools(deps);
  registerStoreListingTools(deps);
  registerDesignMakerTools(deps);
  registerExtractTools(deps);
  registerIllustrationTools(deps);
  registerInspectionTools(deps);
  registerFeatureMapTools(deps);
  registerTeamRulesTools(deps);
  registerInspirationTools(deps, readInspiration, options);
  registerFeedbackTools(deps, sendFeedback);
  registerClaimTools(deps, confirmClaim);
  registerPreviewResource(deps);
  registerInspectionResource(deps);
  // The panel and the tool its change box relies on ship behind one rollout.
  if (options.enableDesignPanel ?? true) {
    registerDesignPanelTools(deps, readRecentChecks);
    registerProjectChangeTools(deps);
  }
}
