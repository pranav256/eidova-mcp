import { z } from "zod";

/** Explicit referral labels, never inferred from an editor or a raw URL. */
export const ACQUISITION_SOURCES = [
  "docs", "github", "claude_directory", "openai_catalog", "campaign", "unknown",
] as const;

/** Where the installer was discovered, separate from how it was installed. */
export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

/** Whether this key was issued by agent provisioning or signed-in key creation. */
export type ProvisioningOrigin = "agent" | "registered" | "unknown";

/** Optional metadata keeps older installers that send an empty body working. */
export const provisionAttributionSchema = z.object({
  acquisitionSource: z.enum(ACQUISITION_SOURCES).default("unknown"),
  installChannel: z.enum(["npm", "unknown"]).default("unknown"),
});

/** Stable client families used in reports; unknown remains in the denominator. */
export const MCP_CLIENT_FAMILIES = [
  "claude-code", "cursor", "vscode", "windsurf", "zed", "cline",
  "claude-desktop", "opencode", "amp", "codex", "continue", "claude",
  "chatgpt", "antigravity", "hermes", "devin",
  // Terminal agents with an install page of their own. [BD-1375]
  "gemini-cli", "github-copilot", "grok-build", "junie", "kilo", "goose", "qwen-code", "kimi",
  "mistral-vibe", "factory-droid", "auggie", "cortex-code", "codebuddy", "qoder", "poolside", "pi",
  "muse-code", "deepagents", "minimax-code", "bob", "autohand", "stakpak", "vt-code", "kimchi", "sigit",
  "unknown",
] as const;

/** An allowlisted client name, not arbitrary caller-provided text. */
export type McpClientFamily = (typeof MCP_CLIENT_FAMILIES)[number];

/** Analytics hints are self-reported and must never authorize a request. */
export interface McpClientAttribution {
  clientFamily: McpClientFamily;
  clientAttributionSource: "protocol" | "configuration" | "unknown";
}

/** Immutable key origin survives account claims and ownership transfers. */
export interface McpKeyAttribution {
  apiKeyId: string;
  provisioningOrigin: ProvisioningOrigin;
  acquisitionSource: AcquisitionSource;
  firstClient?: McpClientFamily | null;
}

const CLIENT_ALIASES: ReadonlyArray<readonly [McpClientFamily, RegExp]> = [
  ["claude-code", /^(claude[-_ ]?(code|cli))$/i],
  ["claude-desktop", /^claude[-_ ]desktop$/i],
  ["claude", /^(claude|claude[-_. ]?ai|anthropic)$/i],
  ["codex", /^codex(?:[-_ ](?:mcp[-_ ]client|cli))?$/i],
  ["vscode", /^(visual studio code|vs[-_ ]?code|github copilot)$/i],
  ["cursor", /^cursor(?:[-_ ]vscode)?$/i],
  // VT Code's add command takes one header, so its calls name it only in the handshake. [BD-1375]
  ["vt-code", /^vt[-_ ]?code$/i],
];

/** Reduce a protocol name or configuration hint to a bounded reporting label. */
export function normalizeMcpClient(value?: string | null): McpClientFamily {
  const name = value?.trim().toLowerCase();
  const canonical = MCP_CLIENT_FAMILIES.find((family) => family === name);
  if (canonical) return canonical;
  return CLIENT_ALIASES.find(([, pattern]) => name && pattern.test(name))?.[0] ?? "unknown";
}

/** Prefer recognized protocol evidence, then an explicit per-request config hint. */
export function resolveMcpClient(
  protocolName?: string | null,
  configuredName?: string | null,
): McpClientAttribution {
  const protocol = normalizeMcpClient(protocolName);
  if (protocol !== "unknown") return { clientFamily: protocol, clientAttributionSource: "protocol" };
  const configured = MCP_CLIENT_FAMILIES.find((family) => family === configuredName) ?? "unknown";
  return {
    clientFamily: configured,
    clientAttributionSource: configured === "unknown" ? "unknown" : "configuration",
  };
}

/** Shared event properties keep the remote and stdio analytics sinks aligned. */
export function mcpAttributionProperties(client: McpClientAttribution, key?: McpKeyAttribution) {
  return {
    api_key_id: key?.apiKeyId ?? null,
    provisioning_origin: key?.provisioningOrigin ?? "unknown",
    acquisition_source: key?.acquisitionSource ?? "unknown",
    client_family: client.clientFamily,
    client_attribution_source: client.clientAttributionSource,
  };
}
