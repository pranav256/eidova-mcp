import { z } from "zod";
import type { RegisterToolDeps } from "./shared";
import { APP_BASE_URL, CONTEXT_ARG, READ_ONLY_TOOL_ANNOTATIONS, loadSessionGuidance, mcpClientName } from "./shared";
import type { ToolRegistrationOptions } from "../tools";
import { nextBuildStep } from "../session-guidance";
import {
  INSPIRATION_PLATFORMS,
  INSPIRATION_TYPES,
  MAX_INSPIRATION_LIMIT,
  describeSet,
  type ImageInspirationResult,
  type InspirationImage,
  type InspirationRequest,
  type ReadInspiration,
} from "../inspiration";
import { describeHtmlFlow, type HtmlFlowResult } from "../html-flows";

const NOT_AVAILABLE =
  "The inspiration library is not available from this server. Try again with the hosted Better Design MCP server or the latest `better-design` npm package.";

const textBlock = (text: string) => ({ type: "text" as const, text });

const imageBlock = (image: InspirationImage) => ({ type: "image" as const, data: image.data, mimeType: image.mimeType });

const COLLECTION_NAMES = {
  "app-store-screenshots": "App Store screenshot sets",
  "app-screens": "Product screens",
} as const;

const NEXT_STEP = {
  "app-store-screenshots":
    "Each image follows the set it belongs to. Read each set for its headline style, slide order, device framing and color, then propose two or three directions for the user's own screenshots and let the user pick one.",
  "app-screens":
    "Each image follows the app it belongs to. Compare how each app lays out the screen: hierarchy, grouping, density and copy. Then design the user's own screen, keeping its content.",
} as const;

function describeSets(result: ImageInspirationResult): string {
  const lines = result.sets.map((set, i) => {
    const category = set.category ? `, ${set.category}` : "";
    const count = `${set.images.length} image${set.images.length === 1 ? "" : "s"}`;
    return `${i + 1}. ${set.title}${category}: ${count} below`;
  });
  return [`# ${COLLECTION_NAMES[result.type]}`, "", ...lines, "", NEXT_STEP[result.type]].join("\n");
}

function noMatch(result: ImageInspirationResult, request: InspirationRequest): string {
  if (result.type === "app-screens") {
    const where = request.platform ? ` on ${request.platform}` : "";
    return `No product screens${where} match "${request.query}". Try one screen word, such as "settings", "onboarding" or "checkout".`;
  }
  const asked = request.category
    ? `No App Store screenshot sets match the category "${request.category}".`
    : "The library holds no App Store screenshot sets yet.";
  return `${asked} Categories in the library: ${result.categories.join(", ")}.`;
}

function flowsContent(result: HtmlFlowResult, query: string) {
  if (result.flows.length === 0) {
    return [textBlock(`No HTML flows match "${query}". Try a shorter query, such as one screen word: "settings", "onboarding", "checkout".`)];
  }
  const lines = result.flows.map((flow, i) => `${i + 1}. ${flow.app}: ${flow.flow}`);
  const intro = [
    "# HTML flows",
    "",
    ...lines,
    "",
    "Each flow below is a shipped product's screens rebuilt as HTML, followed by real screenshots when the library has them. Read its structure, step order and copy, check them against the screenshots, then design the user's own screen. Do not copy its brand, text or assets.",
  ].join("\n");
  return [
    textBlock(intro),
    ...result.flows.flatMap((flow) => [textBlock(describeHtmlFlow(flow)), ...flow.screens.map(imageBlock)]),
  ];
}

/**
 * The guide and kit target for a mobile build, named in the result because an
 * agent working alone follows the result, not the server instructions. A key
 * without the React Native guide learns that it exists. [BD-1139]
 */
export function platformRoute(
  platform: InspirationRequest["platform"],
  { enableReactNativeGuide = true, enableMobileKits = true }: ToolRegistrationOptions = {},
): string {
  if (platform !== "ios" && platform !== "android") return "";
  const kit = (target: string) => (enableMobileKits ? ` and \`get-design-system-kit\` with target "${target}"` : "");
  const reactNative = enableReactNativeGuide
    ? `In React Native or Expo, call \`get-react-native-guide\`${kit("react-native")}.`
    : `For React Native or Expo, Better Design has a \`get-react-native-guide\` on Pro accounts: ${APP_BASE_URL}/pricing.`;
  const native = platform === "ios" ? `In native SwiftUI, call \`get-swiftui-guide\`${kit("swiftui")}. ` : "";
  return `${native}${reactNative}`;
}

/**
 * Registers `get-inspiration`, which sends real reference designs from Better
 * Design's library: App Store screenshot sets and product screens as images,
 * and flows rebuilt as HTML. [BD-966, BD-1114]
 */
export function registerInspirationTools(
  { server, provider, tracked, userId }: RegisterToolDeps,
  readInspiration?: ReadInspiration,
  options: ToolRegistrationOptions = {},
): void {
  server.registerTool(
    "get-inspiration",
    {
      title: "Get Inspiration",
      description: `Send real reference designs from Better Design's library, so you can study how shipped products solved the same design problem before you design the user's own.

\`type\` picks the collection:
- \`app-screens\`: product screens of shipped apps as images. Pass a few words in \`query\`, such as "settings" or "invite team", and optionally a \`platform\`. Each app sends the flow whose name matches best.
- \`html-flows\`: shipped flows rebuilt as HTML, so you can read their structure and copy, not only a picture. Pass a few words in \`query\`, such as "settings" or "create project". Web apps only.
- \`app-store-screenshots\`: App Store screenshot sets. Pass a \`category\` such as "Health & Fitness".

Use it before a redesign or a new screen, then design the user's own screen from what the references do well.`,
      inputSchema: z.object({
        type: z.enum(INSPIRATION_TYPES).describe("The kind of reference to send: \"app-screens\", \"html-flows\" or \"app-store-screenshots\"."),
        category: z.string().trim().min(1).max(60).optional()
          .describe("For app-store-screenshots only: an App Store category such as \"Productivity\". Ignores case."),
        platform: z.enum(INSPIRATION_PLATFORMS).optional()
          .describe("For app-screens only: \"ios\", \"android\" or \"web\"."),
        query: z.string().trim().min(1).max(120).optional()
          .describe("For app-screens and html-flows: words matched against flow names, such as \"settings\" or \"invite team\"."),
        limit: z.number().int().min(1).max(MAX_INSPIRATION_LIMIT).optional()
          .describe(`How many sets or flows to send. Defaults to 3 sets or 2 flows; at most ${MAX_INSPIRATION_LIMIT} sets or 3 flows.`),
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ type, category, platform, query, limit, context }) =>
      tracked(
        "get-inspiration",
        { type, category: category ?? null, platform: platform ?? null, query: query ?? null, limit: limit ?? null, context },
        async () => {
          if (!readInspiration) return { content: [textBlock(NOT_AVAILABLE)] };
          if (type !== "app-store-screenshots" && !query) {
            return { content: [textBlock(`Pass a few words in \`query\` for ${type}, such as "settings" or "create project".`)] };
          }
          const request: InspirationRequest = { type, category, platform, query, limit };
          const [result, session] = await Promise.all([
            readInspiration(request),
            loadSessionGuidance(provider, userId, mcpClientName(server)),
          ]);
          // The next steps close the result, so they are the last thing the agent reads. [BD-1139]
          const next = [platformRoute(platform, options), nextBuildStep(session)].filter(Boolean).map(textBlock);
          if (result.type === "html-flows") return { content: [...flowsContent(result, query ?? ""), ...next] };
          if (result.sets.length === 0) {
            return { content: [textBlock(noMatch(result, request)), ...next] };
          }
          return {
            content: [
              textBlock(describeSets(result)),
              ...result.sets.flatMap((set) => [textBlock(describeSet(set)), ...set.images.map(imageBlock)]),
              ...next,
            ],
          };
        },
      ),
  );
}
