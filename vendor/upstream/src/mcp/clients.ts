/**
 * Single source of truth for how Better Design's MCP server is configured in
 * each client: the server name, the remote endpoint, and the per-client config
 * shape (root key + entry, TOML block, dedicated file, or CLI command).
 *
 * Consumed by BOTH:
 *   - the `better-design setup` CLI (packages/mcp/src/setup/clients.ts),
 *     which adds OS config paths + detection on top of these shapes, and
 *   - the website install pages (packages/web/.../mcp/install/_clients.tsx),
 *     which add presentation (logo, copy, deeplinks) on top of these shapes.
 *
 * Keep config SHAPES here only. Paths/detection are CLI-only; presentation is
 * web-only. A drift guard test asserts both consumers agree with this file.
 */

import type { JsonValue } from "../guards";

export const MCP_NAME = "better-design";

// One env convention for both surfaces. NEXT_PUBLIC_APP_URL wins first so the
// web install snippets keep their original behaviour even in a build env that
// also has BETTER_DESIGN_API_URL set; the CLI (Node, no NEXT_PUBLIC_APP_URL)
// still overrides via BETTER_DESIGN_API_URL. `||` (not `??`) so an empty-string
// env value falls through to prod instead of producing a broken "/api/mcp".
const API_BASE =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.BETTER_DESIGN_API_URL ||
  "https://better-design.com";

export const MCP_URL = `${API_BASE}/api/mcp`;

const CLIENT_HEADER = "X-Better-Design-Client";

// Send the registry id with every request, including after a stateless reconnect.
const clientHeaders = (apiKey: string, clientId: string) => ({
  Authorization: `Bearer ${apiKey}`,
  [CLIENT_HEADER]: clientId,
});

/** Scope of an install: user/global vs the current project. */
export type McpScope = "global" | "project";

/** A client configured by a JSON file with a root key of server entries. */
export interface JsonConfig {
  kind: "json";
  /** Top-level key the server entry nests under (e.g. "mcpServers", "servers"). */
  rootKey: string;
  buildEntry: (apiKey: string) => Record<string, JsonValue>;
}
/** A client configured by a TOML block. */
export interface TomlConfig {
  kind: "toml";
  buildBlock: (apiKey: string) => string;
}
/** A client configured by a dedicated file this tool owns. */
export interface FileConfig {
  kind: "file";
  buildContent: (apiKey: string) => string;
}
/** A client configured by running its own CLI. */
export interface CommandConfig {
  kind: "command";
  buildCommand: (apiKey: string, scope: McpScope) => { bin: string; args: string[] };
}

/** How one MCP client is configured: JSON, TOML, a file, or a command. */
export type McpClientConfig = JsonConfig | TomlConfig | FileConfig | CommandConfig;

/** Every supported client's config recipe, by client id. */
export const MCP_CLIENT_CONFIGS = {
  "claude-code": {
    kind: "command",
    buildCommand: (apiKey, scope) => ({
      bin: "claude",
      args: [
        "mcp",
        "add",
        "--scope",
        scope === "global" ? "user" : "project",
        MCP_NAME,
        "--transport",
        "http",
        MCP_URL,
        "--header",
        `Authorization: Bearer ${apiKey}`,
        "--header",
        `${CLIENT_HEADER}: claude-code`,
      ],
    }),
  },
  cursor: {
    kind: "json",
    rootKey: "mcpServers",
    buildEntry: (apiKey) => ({ url: MCP_URL, headers: clientHeaders(apiKey, "cursor") }),
  },
  vscode: {
    kind: "json",
    rootKey: "servers",
    buildEntry: (apiKey) => ({ type: "http", url: MCP_URL, headers: clientHeaders(apiKey, "vscode") }),
  },
  // Devin Desktop (formerly Windsurf). The default Devin Local agent reads the
  // Devin CLI config; `devin mcp add` writes exactly this entry.
  devin: {
    kind: "json",
    rootKey: "mcpServers",
    buildEntry: (apiKey) => ({ url: MCP_URL, transport: "http", headers: clientHeaders(apiKey, "devin") }),
  },
  // Devin's legacy Cascade agent still reads the old Windsurf file and shape.
  windsurf: {
    kind: "json",
    rootKey: "mcpServers",
    buildEntry: (apiKey) => ({ serverUrl: MCP_URL, headers: clientHeaders(apiKey, "windsurf") }),
  },
  antigravity: {
    kind: "json",
    rootKey: "mcpServers",
    buildEntry: (apiKey) => ({ serverUrl: MCP_URL, headers: clientHeaders(apiKey, "antigravity") }),
  },
  zed: {
    kind: "json",
    rootKey: "context_servers",
    buildEntry: (apiKey) => ({ url: MCP_URL, headers: clientHeaders(apiKey, "zed") }),
  },
  cline: {
    kind: "json",
    rootKey: "mcpServers",
    buildEntry: (apiKey) => ({
      type: "streamableHttp",
      url: MCP_URL,
      headers: clientHeaders(apiKey, "cline"),
      disabled: false,
    }),
  },
  "claude-desktop": {
    kind: "json",
    rootKey: "mcpServers",
    // Claude Desktop only launches stdio processes, so a key-based remote MCP
    // runs through the mcp-remote npx bridge.
    buildEntry: (apiKey) => ({
      command: "npx",
      args: [
        "-y",
        "mcp-remote",
        MCP_URL,
        "--header",
        "Authorization:${AUTH_HEADER}",
        "--header",
        `${CLIENT_HEADER}:claude-desktop`,
      ],
      env: { AUTH_HEADER: `Bearer ${apiKey}` },
    }),
  },
  opencode: {
    kind: "json",
    rootKey: "mcp",
    buildEntry: (apiKey) => ({
      type: "remote",
      url: MCP_URL,
      enabled: true,
      headers: clientHeaders(apiKey, "opencode"),
    }),
  },
  amp: {
    kind: "json",
    rootKey: "amp.mcpServers",
    buildEntry: (apiKey) => ({ url: MCP_URL, headers: clientHeaders(apiKey, "amp") }),
  },
  codex: {
    kind: "toml",
    buildBlock: (apiKey) =>
      `[mcp_servers.${MCP_NAME}]\nurl = "${MCP_URL}"\nhttp_headers = { Authorization = "Bearer ${apiKey}", ${CLIENT_HEADER} = "codex" }`,
  },
  continue: {
    kind: "file",
    buildContent: (apiKey) =>
      `name: Better Design MCP\nversion: 0.0.1\nschema: v1\nmcpServers:\n  - name: ${MCP_NAME}\n    type: streamable-http\n    url: ${MCP_URL}\n    requestOptions:\n      headers:\n        Authorization: "Bearer ${apiKey}"\n        ${CLIENT_HEADER}: "continue"\n`,
  },
  // Terminal coding agents with a page on the website only. `better-design setup`
  // does not configure them yet. [BD-1375]
  "gemini-cli": {
    kind: "json",
    rootKey: "mcpServers",
    // Gemini CLI reads `httpUrl` as Streamable HTTP; `url` would mean SSE.
    buildEntry: (apiKey) => ({ httpUrl: MCP_URL, headers: clientHeaders(apiKey, "gemini-cli") }),
  },
  "github-copilot": {
    kind: "json",
    rootKey: "mcpServers",
    buildEntry: (apiKey) => ({
      type: "http",
      url: MCP_URL,
      headers: clientHeaders(apiKey, "github-copilot"),
      tools: ["*"],
    }),
  },
  "grok-build": {
    kind: "toml",
    buildBlock: (apiKey) =>
      `[mcp_servers.${MCP_NAME}]\nurl = "${MCP_URL}"\nheaders = { Authorization = "Bearer ${apiKey}", ${CLIENT_HEADER} = "grok-build" }`,
  },
  junie: {
    kind: "json",
    rootKey: "mcpServers",
    buildEntry: (apiKey) => ({ url: MCP_URL, headers: clientHeaders(apiKey, "junie") }),
  },
  kilo: {
    kind: "json",
    rootKey: "mcp",
    buildEntry: (apiKey) => ({
      type: "remote",
      url: MCP_URL,
      headers: clientHeaders(apiKey, "kilo"),
      enabled: true,
    }),
  },
  "qwen-code": {
    kind: "json",
    rootKey: "mcpServers",
    // Qwen Code reads `httpUrl` as Streamable HTTP, like Gemini CLI.
    buildEntry: (apiKey) => ({ httpUrl: MCP_URL, headers: clientHeaders(apiKey, "qwen-code") }),
  },
  kimi: {
    kind: "json",
    rootKey: "mcpServers",
    buildEntry: (apiKey) => ({ url: MCP_URL, headers: clientHeaders(apiKey, "kimi") }),
  },
  "mistral-vibe": {
    kind: "toml",
    buildBlock: (apiKey) =>
      `[[mcp_servers]]\nname = "${MCP_NAME}"\ntransport = "streamable-http"\nurl = "${MCP_URL}"\n\n[mcp_servers.auth]\ntype = "static"\nheaders = { "Authorization" = "Bearer ${apiKey}", "${CLIENT_HEADER}" = "mistral-vibe" }`,
  },
  "factory-droid": {
    kind: "json",
    rootKey: "mcpServers",
    buildEntry: (apiKey) => ({ type: "http", url: MCP_URL, headers: clientHeaders(apiKey, "factory-droid") }),
  },
  auggie: {
    kind: "json",
    rootKey: "mcpServers",
    buildEntry: (apiKey) => ({ type: "http", url: MCP_URL, headers: clientHeaders(apiKey, "auggie") }),
  },
  "cortex-code": {
    kind: "json",
    rootKey: "mcpServers",
    buildEntry: (apiKey) => ({ type: "http", url: MCP_URL, headers: clientHeaders(apiKey, "cortex-code") }),
  },
  codebuddy: {
    kind: "json",
    rootKey: "mcpServers",
    buildEntry: (apiKey) => ({ type: "http", url: MCP_URL, headers: clientHeaders(apiKey, "codebuddy") }),
  },
  qoder: {
    kind: "json",
    rootKey: "mcpServers",
    buildEntry: (apiKey) => ({ type: "http", url: MCP_URL, headers: clientHeaders(apiKey, "qoder") }),
  },
  poolside: {
    // The pool CLI writes its own YAML, so the page gives its add command.
    kind: "command",
    buildCommand: (apiKey) => ({
      bin: "pool",
      args: [
        "mcp",
        "add",
        "--transport",
        "http",
        "--header",
        `Authorization: Bearer ${apiKey}`,
        "--header",
        `${CLIENT_HEADER}: poolside`,
        MCP_NAME,
        MCP_URL,
      ],
    }),
  },
  pi: {
    kind: "json",
    rootKey: "mcpServers",
    buildEntry: (apiKey) => ({ url: MCP_URL, headers: clientHeaders(apiKey, "pi") }),
  },
  "muse-code": {
    kind: "json",
    rootKey: "mcp_servers",
    // A server marked required stops the run when it cannot connect; optional only warns.
    buildEntry: (apiKey) => ({
      transport: "streamable_http",
      url: MCP_URL,
      headers: clientHeaders(apiKey, "muse-code"),
      mode: "optional",
    }),
  },
  deepagents: {
    kind: "json",
    rootKey: "mcpServers",
    buildEntry: (apiKey) => ({ type: "http", url: MCP_URL, headers: clientHeaders(apiKey, "deepagents") }),
  },
  "minimax-code": {
    kind: "json",
    rootKey: "mcpServers",
    buildEntry: (apiKey) => ({ type: "http", url: MCP_URL, headers: clientHeaders(apiKey, "minimax-code") }),
  },
  bob: {
    kind: "json",
    rootKey: "mcpServers",
    // Bob Shell reads `httpURL` for Streamable HTTP and ignores a plain `url`.
    buildEntry: (apiKey) => ({ httpURL: MCP_URL, headers: clientHeaders(apiKey, "bob") }),
  },
  kimchi: {
    kind: "json",
    rootKey: "mcpServers",
    buildEntry: (apiKey) => ({ url: MCP_URL, headers: clientHeaders(apiKey, "kimchi") }),
  },
  stakpak: {
    kind: "toml",
    buildBlock: (apiKey) =>
      `[mcpServers.${MCP_NAME}]\nurl = "${MCP_URL}"\nheaders = { Authorization = "Bearer ${apiKey}", ${CLIENT_HEADER} = "stakpak" }`,
  },
  sigit: {
    kind: "toml",
    buildBlock: (apiKey) =>
      `[[server]]\nname = "${MCP_NAME}"\nurl = "${MCP_URL}"\n\n[server.headers]\nAuthorization = "Bearer ${apiKey}"\n${CLIENT_HEADER} = "sigit"`,
  },
  "vt-code": {
    // VT Code's global config path differs per platform, so its own add command writes it.
    kind: "command",
    buildCommand: (apiKey) => ({
      bin: "vtcode",
      args: ["mcp", "add", MCP_NAME, "--url", MCP_URL, "--header", `Authorization=Bearer ${apiKey}`],
    }),
  },
} satisfies Record<string, McpClientConfig>;

/** The id of a client this repo knows how to configure. */
export type McpClientId = keyof typeof MCP_CLIENT_CONFIGS;

/** Serialize a JSON-shaped client's config the way both surfaces present/write it. */
export function jsonConfigString(client: JsonConfig, apiKey: string): string {
  return JSON.stringify({ [client.rootKey]: { [MCP_NAME]: client.buildEntry(apiKey) } }, null, 2);
}

/** Render a command-shaped client as a copy-paste shell string (quoting args with spaces). */
export function commandConfigString(client: CommandConfig, apiKey: string, scope: McpScope): string {
  const { bin, args } = client.buildCommand(apiKey, scope);
  const quoted = args.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg));
  return `${bin} ${quoted.join(" ")}`;
}

/** Opening marker fence, so the rule block can be found, replaced, or removed idempotently. */
export const RULE_START = "<!-- better-design:start -->";
/** Closing marker fence of the rule block. */
export const RULE_END = "<!-- better-design:end -->";

/**
 * The auto-invoke rule written into CLAUDE.md / client rules files. Setup writes
 * it, and every web page that shows the key offers it, so both read it here.
 */
export const RULE_BODY = `## Better Design

For every UI build, run these steps in order, and never present a page that skipped step 2 or 4:
1. Design system: keep the product's own design. Use its theme and components when the code has them, or its \`extract-from-url\` tokens for a live site. A product with no design of its own, or a brand \`extract-from-url\` reports as flat, takes \`find-design-system\`, then \`get-design-system-kit\`, keeping the brand's colour, font and radius.
2. Principles: \`get-ui-principle\` before styling, \`get-ux-principle\` before behavior.
3. Build. A product screen sits inside its app shell, with realistic sample data and an app-scale title. A marketing page keeps its copy beside the product photo, never on top of it, and keeps the site's header and footer links.
4. Review: \`get-review-rules\`, \`check-comprehension\` and \`inspect-spacing\`. Fix every critical and serious finding.

Always use the Better Design MCP tools for any frontend, UI, UX, interaction, flow, form, navigation, dialog, error, onboarding, component, styling, article widget, calculator, estimator, converter, generator, quiz, checklist, React Native, Expo, Three.js, Shopify, or sales work, without me having to explicitly ask. For a calculator or article widget, load \`get-widget-guide\`; for React Native or Expo, load task guidance with \`get-react-native-guide\`; for Three.js or React Three Fiber, use \`get-three-js-guide\`; for Shopify Liquid or theme work, use \`get-shopify-guide\`; for sales conversations or assets, use \`get-sales-principle\`. Load visual guidance with \`get-ui-principle\`, load flow guidance with \`get-ux-principle\`, and self-review with \`get-review-rules\` and \`check-comprehension\`. Run \`inspect-spacing\` on rendered DOM evidence. For dashboards, deploy the exact source to a public HTTPS preview; \`finalize-dashboard-review\` must return VALID after Better Design captures it at 390, 1440, and 1728. Start UI builds with \`find-design-system\`. For a custom brand, call \`create-design-system\`, poll \`get-design-system-status\`, and run its React install command in coding hosts; in inline canvases, call \`get-design-system-kit\` with target \`html\` and the generated projectId. For a catalog system, call \`get-design-system-kit\` with target \`react\` in coding hosts or \`html\` in inline canvases. For a Shopify store, load \`get-shopify-guide\`, then call \`get-design-system-kit\` with target \`shopify\`.`;

/** The rule wrapped in its fences: what setup writes and what the key pages offer to copy. */
export const RULE_BLOCK = `${RULE_START}\n${RULE_BODY}\n${RULE_END}`;
