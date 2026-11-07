/** Tool names registered by the current hosted and stdio MCP servers. */
export const MCP_TOOL_NAMES = [
  "build-feature-map",
  "change-design-system",
  "check-comprehension",
  "confirm-claim",
  "create-design-system",
  "create-figma-prototype",
  "cut-screen-recording",
  "detect-icon-library",
  "extract-design-system",
  "extract-from-url",
  "finalize-dashboard-review",
  "find-design-system",
  "find-icon-library",
  "find-icons",
  "get-design-config",
  "get-design-system-kit",
  "get-design-system-status",
  "get-illustration-guide",
  "get-inspiration",
  "get-jig-guide",
  "get-motion-guide",
  "get-react-native-guide",
  "get-review-rules",
  "get-sales-principle",
  "get-shopify-guide",
  "get-store-listing-guide",
  "get-swiftui-guide",
  "get-team-rules",
  "get-three-js-guide",
  "get-ui-principle",
  "get-ux-principle",
  "get-widget-guide",
  "inspect-spacing",
  "install-icons",
  "make-sales-page",
  "make-social-image",
  "open-design-panel",
  "plan-video",
  "preview-design-system",
  "propose-team-rule",
  "read-feature-map",
  "render-video-frames",
  "review-dashboard-structure",
  "review-illustration",
  "review-ui-code",
  "send-feedback",
  "set-design-config",
  "set-team-rules",
  "update-feature-map",
] as const;

/** Immutable copy of the live tool catalog pinned into trace definition v1. */
export const MCP_TOOL_NAMES_V1 = Object.freeze([
  "build-feature-map",
  "change-design-system",
  "check-comprehension",
  "confirm-claim",
  "create-design-system",
  "create-figma-prototype",
  "cut-screen-recording",
  "detect-icon-library",
  "extract-design-system",
  "extract-from-url",
  "finalize-dashboard-review",
  "find-design-system",
  "find-icon-library",
  "find-icons",
  "get-design-config",
  "get-design-system-kit",
  "get-design-system-status",
  "get-illustration-guide",
  "get-inspiration",
  "get-jig-guide",
  "get-motion-guide",
  "get-react-native-guide",
  "get-review-rules",
  "get-sales-principle",
  "get-shopify-guide",
  "get-store-listing-guide",
  "get-swiftui-guide",
  "get-team-rules",
  "get-three-js-guide",
  "get-ui-principle",
  "get-ux-principle",
  "get-widget-guide",
  "inspect-spacing",
  "install-icons",
  "make-sales-page",
  "make-social-image",
  "open-design-panel",
  "plan-video",
  "preview-design-system",
  "propose-team-rule",
  "read-feature-map",
  "render-video-frames",
  "review-dashboard-structure",
  "review-illustration",
  "review-ui-code",
  "send-feedback",
  "set-design-config",
  "set-team-rules",
  "update-feature-map",
] as const);

/** A tool name that can be emitted by a Better Design MCP server. */
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];
type McpToolNameV1 = (typeof MCP_TOOL_NAMES_V1)[number];

/** Safe tool names emitted by earlier Better Design MCP releases. */
export const HISTORICAL_MCP_TOOL_NAMES = [
  "build-ui-app",
  "check-design-system-status",
  "find-design",
  "get-design-system-docs",
  "get-design-system-html",
  "resolve-design-system",
  "resolve-icon-library",
  "search-icons",
] as const;

/** Fixed privacy-safe replacement for unrecognized caller-supplied tool names. */
export const UNKNOWN_MCP_TOOL_NAME = "unknown-tool" as const;

/** Current, historical, and sentinel names permitted in durable trace metadata. */
export const MCP_TRACE_TOOL_NAMES = [
  ...MCP_TOOL_NAMES,
  ...HISTORICAL_MCP_TOOL_NAMES,
  UNKNOWN_MCP_TOOL_NAME,
] as const;

/** A privacy-safe tool identity permitted in the trace and improvement ledgers. */
export type McpTraceToolName = (typeof MCP_TRACE_TOOL_NAMES)[number];

/**
 * Proven historical-to-current renames. This is deliberately narrower than
 * the trace allowlist: retired names without an evidence-backed successor are
 * safe to retain for audit, but cannot start a new measurement cycle.
 */
export const MCP_TOOL_RENAMES = [
  ["find-design", "find-design-system"],
  ["resolve-design-system", "find-design-system"],
  ["check-design-system-status", "get-design-system-status"],
  ["resolve-icon-library", "find-icon-library"],
  ["search-icons", "find-icons"],
] as const satisfies readonly (readonly [McpTraceToolName, McpToolName])[];

/** Immutable rename catalog pinned into trace definition v1. */
export const MCP_TOOL_RENAMES_V1 = Object.freeze([
  Object.freeze(["find-design", "find-design-system"] as const),
  Object.freeze(["resolve-design-system", "find-design-system"] as const),
  Object.freeze([
    "check-design-system-status",
    "get-design-system-status",
  ] as const),
  Object.freeze(["resolve-icon-library", "find-icon-library"] as const),
  Object.freeze(["search-icons", "find-icons"] as const),
] as const satisfies readonly (readonly [McpTraceToolName, McpToolNameV1])[]);

/** Current names and historical aliases with a proven measurement successor. */
export const MCP_MEASURABLE_TOOL_NAMES_V1 = Object.freeze([
  ...MCP_TOOL_NAMES_V1,
  ...MCP_TOOL_RENAMES_V1.map(([retired]) => retired),
] as const);

/** Tools measurable by the current detector definition. */
export const MCP_MEASURABLE_TOOL_NAMES = [
  ...MCP_TOOL_NAMES,
  ...MCP_TOOL_RENAMES.map(([retired]) => retired),
] as const;

/**
 * Resolves a safe tool to every trace name that represents the same runtime
 * capability. Current tools without a rename form a one-name family. Retired
 * names without a proven mapping and the privacy sentinel are not measurable.
 */
export function measurementToolFamilyV1(
  tool: string,
): readonly McpTraceToolName[] | null {
  const current = MCP_TOOL_NAMES_V1.find((candidate) => candidate === tool);
  const renamed = MCP_TOOL_RENAMES_V1.find(([retired]) => retired === tool);
  const canonical = current ?? renamed?.[1];
  if (!canonical) return null;
  return Object.freeze([
    canonical,
    ...MCP_TOOL_RENAMES_V1.filter(
      ([, successor]) => successor === canonical,
    ).map(([retired]) => retired),
  ]);
}

/** Resolves aliases under the current measurement definition. */
export function measurementToolFamily(
  tool: string,
): readonly McpTraceToolName[] | null {
  const current = MCP_TOOL_NAMES.find((candidate) => candidate === tool);
  const renamed = MCP_TOOL_RENAMES.find(([retired]) => retired === tool);
  const canonical = current ?? renamed?.[1];
  if (!canonical) return null;
  return [
    canonical,
    ...MCP_TOOL_RENAMES.filter(([, successor]) => successor === canonical).map(
      ([retired]) => retired,
    ),
  ];
}

/**
 * Keep only exact names from the closed MCP registration set so caller text
 * can never become durable tool metadata.
 */
export function canonicalMcpToolName(
  tool: string,
): McpTraceToolName {
  return (
    MCP_TRACE_TOOL_NAMES.find((registeredTool) => registeredTool === tool) ??
    UNKNOWN_MCP_TOOL_NAME
  );
}
