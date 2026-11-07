import type { JsonValue } from "../../guards";
import { z } from "zod";
import { nativeVerifyText, type NativeTarget } from "../native-verify";

import { MOTION_SCAFFOLD_FILES, MOTION_SCAFFOLD_STEPS } from "../scaffold/motion-scaffold";
import { formatVideoComponentIndex, renderVideoComponent } from "../scaffold/video-components";
import type { DataProvider, PrincipleArea } from "../data-provider";
import type { DsTopResult } from "../../design-systems/record-search";
import { normalizePrincipleTopic } from "../../foundational-docs/topic-utils";
import type { ToolRegistrationOptions } from "../tools";
import type { RegisterToolDeps } from "./shared";
import { REVIEW_RULE_CATEGORIES, REVIEW_RULES_DESCRIPTION } from "./review-rules-description";
import { CONTEXT_ARG, READ_ONLY_TOOL_ANNOTATIONS, loadSessionGuidance, mcpClientName, trackSearch, truncateToTokens } from "./shared";
import { loadTeamRules, teamRulesReviewSection } from "./team-rules-tools";
import {
  designSystemNudge,
  guidancePreamble,
  reviewDesignSystemStep,
  reviewNudge,
  weightReviewRules,
  type SessionGuidance,
} from "../session-guidance";

type PrincipleListItem = Awaited<ReturnType<DataProvider["listPrinciples"]>>[number];

interface ToolTextResponse {
  content: { type: "text"; text: string }[];
  // The MCP SDK's result type keeps an open bag for vendor extensions.
  [x: string]: JsonValue | undefined;
}

interface PrincipleRun {
  response: ToolTextResponse;
  capture: { query?: string; topic?: string; topResults: DsTopResult[] };
}

const SEARCH_RESULT_PREVIEW_CHARS = 4000;
const GUIDE_AREAS = new Set<PrincipleArea>([
  "illustration",
  "motion",
  "react-native",
  "shopify",
  "swiftui",
  "three-js",
]);

function principleTopic(principle: PrincipleListItem): string {
  return principle.topic ?? principle.id.replace("principle-", "");
}

/** The text a guidance tool returns when its lookup failed. */
export function principleErrorResponse(message: string): ToolTextResponse {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
}

/**
 * Caps one search result for the tool response, closing a code fence the cut
 * would otherwise leave open. Exported so the retrieval A/B runner measures the
 * same text the tool returns; a harness with its own copy of the truncation
 * drifts and reports token counts production never produces.
 */
export function formatSearchResultContent(content: string): string {
  if (content.length <= SEARCH_RESULT_PREVIEW_CHARS) return content;

  const preview = content.slice(0, SEARCH_RESULT_PREVIEW_CHARS);
  const fences = [...preview.matchAll(/^```/gm)];
  let end = SEARCH_RESULT_PREVIEW_CHARS;

  if (fences.length % 2 === 1) {
    const closingFencePattern = /^```\s*$/gm;
    closingFencePattern.lastIndex = Math.max(0, SEARCH_RESULT_PREVIEW_CHARS - 3);
    const closingFence = closingFencePattern.exec(content);
    if (closingFence) {
      end = closingFence.index + closingFence[0].length;
    } else {
      end = fences.at(-1)?.index ?? SEARCH_RESULT_PREVIEW_CHARS;
    }
  }

  return `${content.slice(0, end).trimEnd()}\n\n...(truncated)`;
}

function levenshteinDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

function formatPrincipleIndex(
  principles: PrincipleListItem[],
  toolName: string,
  label: string,
  resourceLabel: string,
): string {
  const indexText = principles
    .map((principle) => {
      const aliases = principle.aliases?.length
        ? ` (aliases: ${principle.aliases.slice(0, 5).join(", ")})`
        : "";
      return `- **${principleTopic(principle)}**: ${principle.title}${aliases}`;
    })
    .join("\n");

  return `# Available ${label} ${resourceLabel}\n\nUse \`${toolName}({ topic: "..." })\` to load a specific ${resourceLabel.toLowerCase().replace(/s$/, "")}:\n\n${indexText}\n\nOr use \`${toolName}({ query: "..." })\` to search by natural language.`;
}

function formatTopicNotFound(
  topic: string,
  principles: PrincipleListItem[],
  toolName: string,
  resourceLabel: string,
): string {
  const needle = normalizePrincipleTopic(topic);
  const suggestions = principles
    .map((principle) => {
      const candidates = [
        principleTopic(principle),
        principle.title,
        ...(principle.aliases ?? []),
      ];
      const distance = Math.min(
        ...candidates.map((candidate) => levenshteinDistance(needle, normalizePrincipleTopic(candidate))),
      );
      return { principle, distance };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
    .map(({ principle }) => principleTopic(principle));

  return [
    `${resourceLabel.replace(/s$/, "")} '${topic}' not found.`,
    suggestions.length ? `Closest topics: ${suggestions.map((item) => `\`${item}\``).join(", ")}.` : "",
    `Call \`${toolName}({})\` for the full index.`,
  ].filter(Boolean).join("\n");
}

/**
 * Add the next missing step to a guidance response. On the session's first
 * guidance call it names the design system step when no system is chosen yet
 * [BD-1139]. After that it names the review step until a review lands [BD-495],
 * so a project that keeps its own styling still hears about the review.
 */
function appendReviewNudge(
  response: ToolTextResponse,
  session: SessionGuidance,
): ToolTextResponse {
  const nudge = session.guidanceCalls === 0 ? designSystemNudge(session) : reviewNudge(session);
  if (!nudge) return response;
  const [first, ...rest] = response.content;
  if (!first) return response;
  return {
    ...response,
    content: [{ ...first, text: `${first.text}\n\n${nudge}` }, ...rest],
  };
}

/** End a mobile guide reply with the on-device check, as the mobile kits do. [BD-1319] */
function withNativeVerify(response: ToolTextResponse, target: NativeTarget): ToolTextResponse {
  const [first, ...rest] = response.content;
  if (!first) return response;
  return { ...response, content: [{ ...first, text: `${first.text}\n\n${nativeVerifyText(target)}` }, ...rest] };
}

/**
 * Cap prose with maxTokens. The scaffold and component branches return whole
 * files on purpose: a cut file is worse than a long reply. [BD-621]
 */
const fitTokens = (text: string, maxTokens: number | undefined): string =>
  maxTokens ? truncateToTokens(text, maxTokens) : text;

async function runPrincipleTool(
  provider: DataProvider,
  area: PrincipleArea,
  label: string,
  toolName: string,
  args: { topic?: string; query?: string; maxTokens?: number },
): Promise<PrincipleRun> {
  const { topic, query, maxTokens } = args;
  const resourceLabel = GUIDE_AREAS.has(area) ? "Guides" : "Principles";
  const finish = (text: string, capture: PrincipleRun["capture"]): PrincipleRun => ({
    response: { content: [{ type: "text" as const, text }] },
    capture,
  });

  if (topic && query) {
    return finish(
      `Pass either 'topic' or 'query' to ${toolName}, not both.`,
      { query, topic, topResults: [] },
    );
  }

  if (topic) {
    const principle = await provider.getPrincipleByTopic(topic, area);
    if (!principle) {
      const principles = await provider.listPrinciples(area);
      return finish(
        formatTopicNotFound(topic, principles, toolName, resourceLabel),
        { topic, topResults: [] },
      );
    }

    const topicLine = principle.topic ? `\n\nTopic: ${principle.topic}` : "";
    const aliasesLine = principle.aliases?.length ? `\nAliases: ${principle.aliases.join(", ")}` : "";
    let text = `# ${principle.title}${topicLine}${aliasesLine}\n\n${principle.content}`;
    if (maxTokens) text = truncateToTokens(text, maxTokens);
    return finish(
      text,
      // Normalize aliases to their canonical topic so analytics and scrape
      // coverage count one resource no matter which supported name was used.
      { topic: principle.topic ?? topic, topResults: [{ id: principle.id }] },
    );
  }

  if (query) {
    const results = await provider.searchPrinciples(query, 5, area);
    const topResults = results.map((result) => ({ id: result.id, score: result.matchScore }));

    if (results.length === 0) {
      return finish(
        `No matching ${label.toLowerCase()} ${resourceLabel.toLowerCase()} found. Try a different query.`,
        { query, topResults },
      );
    }

    const formatted = results
      .map((result) =>
        `## ${result.title} (${result.matchScore}% match)\n\n${formatSearchResultContent(result.content)}`,
      )
      .join("\n\n---\n\n");

    let text = `# ${label} ${resourceLabel} matching "${query}"\n\n${formatted}`;
    if (maxTokens) text = truncateToTokens(text, maxTokens);
    return finish(text, { query, topResults });
  }

  const principles = await provider.listPrinciples(area);

  if (principles.length === 0) {
    return finish(
      `No ${label.toLowerCase()} ${resourceLabel.toLowerCase()} found.`,
      { topResults: [] },
    );
  }

  return finish(
    formatPrincipleIndex(principles, toolName, label, resourceLabel),
    { topResults: [] },
  );
}

/**
 * Appended to every get-review-rules response. These rules read source and copy,
 * so they cannot see a misaligned row, a shifting active state, or a nav item
 * that was styled but never wired. Naming the runtime checks here is what
 * makes them run: `inspect-spacing` carries no query or topic, so the session
 * ledger can never observe whether it was called. [BD-574]
 * An agent that judges its own screen in one pass prefers its own result, so
 * the host checks each rule section in a clean context and a skeptic removes
 * the false flags. The host does that work; this tool calls no model. [BD-905]
 */
const RENDERED_REVIEW_DIRECTIVE = `${REDESIGN_SCOPE_CONTRACT}

${DESIGN_TRADEOFF_RULE}

## Before you present this screen

These rules were read against source. They cannot see layout. Four checks remain:

1. Dashboard review: call \`review-dashboard-structure\` with the complete source, unchanged request fixture, factual interpretation, and installed component source. FAIL blocks completion. Use it to compare the h1 and supporting line to the request and enforce title, metrics, records, interpretation order. The header has one primary action; metric values lead labels; action/selection color differs from status color. Use installed semantic variants. Do not invent trends. The overview is not a workflow step. When a fixture lists the overview first, exclude it from progress; with three remaining task screens use no stepper. An active nav label is not the page title.
2. Call \`inspect-spacing\` on the rendered DOM at 1440, 1728 and 390 wide. The first call returns a capture script and measures nothing; the layout is measured only when a second call, with the captured states, returns status \`completed\`. Rules read code; only measurement catches a label sitting 9px off its own circle, an active state that is 2px wider than its siblings and shifts the row, or a sidebar that leaves page background beside it on a wide screen. A Shopify theme preview or a React Native web export is a rendered DOM, so measure it. A native SwiftUI or Android app has no DOM: review a simulator screenshot at each screen size against these rules instead, and say that spacing was not measured.
3. Call \`check-comprehension\` on the screen's visible copy, and fix every finding it returns.
4. For dashboards, deploy the exact source to a public HTTPS preview, then call \`finalize-dashboard-review\` with that URL, the exact complete and visible source, unchanged fixture, and installed component source. Better Design's own browser captures the preview at 390, 1440, and 1728, content-addresses the live deployment, derives the factual interpretation, and issues the only valid review receipt. No trusted browser capture means incomplete. An invalid deployment revision, invalid geometry, or hidden fixture field also blocks approval. Any later source or deployment edit voids the receipt. Then confirm every nav item, link, tab and button works.

## Presentations

A deck passes only on rendered evidence. For every slide:

1. Call \`check-comprehension\` with \`surface: "slide"\`. Keep one idea per slide and fix every density finding.
2. Render the deck and review a screenshot of every slide: the title reads first, one element holds the eye, and nothing competes with it. Text checks and \`inspect-spacing\` cannot see this, so no score stands in for the screenshot.

## Check the rules below in two passes

An agent that reviews its own screen in one pass tends to approve it. Split the review:

1. Per rule: give each rule section below (each \`# \` heading) to its own subagent, in a clean context that holds only that section and the source. A host without subagents checks one section at a time and writes down its findings before it reads the next.
2. Skeptic pass: give every flag to one fresh subagent that tries to disprove it. It keeps a flag only when it can cite the file and line that break the rule.

Cite the rule ID with every finding: the \`rule/…\` line under each rule heading. Read its Exceptions line before you flag. A surface listed under coverage gaps has no rule yet, so say that instead of inventing one.

Fix every critical and serious finding before you present.`;

/**
 * Run a guidance tool and add the next missing step. [BD-495, BD-1139]
 *
 * The session lookup runs beside the guidance query, not after it, so session
 * awareness costs no extra wait. It resolves to an empty session on every
 * failure, which reads the same as a session with no calls yet.
 */
export async function runGuidanceTool(
  provider: DataProvider,
  userId: string | undefined,
  clientName: string | undefined,
  area: PrincipleArea,
  label: string,
  toolName: string,
  args: { topic?: string; query?: string; maxTokens?: number },
): Promise<PrincipleRun> {
  const [run, session] = await Promise.all([
    runPrincipleTool(provider, area, label, toolName, args),
    loadSessionGuidance(provider, userId, clientName),
  ]);
  return { ...run, response: appendReviewNudge(run.response, session) };
}

export function registerPrincipleTools(
  { server, provider, track, userId }: RegisterToolDeps,
  {
    enableReactNativeGuide = true,
    enableThreeJsGuide = true,
    enableShopifyKit = true,
  }: ToolRegistrationOptions = {},
): void {
  // Which host is calling. Read per call, not at registration: tools are
  // registered before the client connects, so the handshake name does not exist
  // yet at this point. [BD-495]
  const clientName = () => mcpClientName(server);
  server.registerTool(
    "get-ui-principle",
    {
      title: "Get UI Design Principle",
      description: `Load visual UI design principles into context on-demand.

Use this for visual surface decisions: hierarchy and emphasis, spacing/layout and grouping, typography, color, depth, images, accessibility, polish, and animation. Building a shop, product page, or product imagery: load product-pages and product-imagery. Building a landing or marketing page: load marketing, then also load positioning from get-ux-principle before writing the headline, because what the page says is decided before how it looks. For behavior, flows, forms, navigation, notifications, errors, search, onboarding, microcopy, positioning, rewards, behavior change, design process, or psychology/cognitive laws, use get-ux-principle instead.

You can either:
1. Request a specific topic or alias: get-ui-principle({ topic: "spacing" })
2. Semantic search: get-ui-principle({ query: "group this dense screen with clearer proximity" })
3. Get index of all principles: get-ui-principle({})

Use maxTokens to keep responses focused (recommended: 5000–10000).`,
      inputSchema: z.object({
        topic: z.string().trim().min(1).max(120).optional()
          .describe("Specific UI topic or alias to load, e.g. spacing, gestalt, hierarchy, blur test, accessibility, color, depth, animation, product-pages, product-imagery."),
        query: z.string().trim().min(1).max(500).optional()
          .describe("Natural language search query to find relevant principles."),
        maxTokens: z.number().min(500).max(50000).optional()
          .describe("Maximum tokens to return. Truncates content to fit. Recommended: 5000-10000."),
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ topic, query, maxTokens, context }) => {
      const start = Date.now();
      try {
        const { response, capture } = await runGuidanceTool(provider, userId, clientName(), "ui", "UI", "get-ui-principle", { topic, query, maxTokens });
        return trackSearch(track, "get-ui-principle", { ...capture, context }, start, response);
      } catch (error) {
        return trackSearch(
          track,
          "get-ui-principle",
          { query, topic, topResults: [], context },
          start,
          principleErrorResponse(error instanceof Error ? error.message : "Unknown error"),
          true,
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  );

  server.registerTool(
    "get-ux-principle",
    {
      title: "Get UX Design Principle",
      description: `Load UX behavior and product-flow principles into context on-demand.

Use this before implementing flows or interactive behavior: forms, navigation, notifications, errors, dialogs, search, onboarding, responsive behavior, microcopy, positioning, value proposition, rewards and behavior change, design process and clarity audits, motion briefs, interaction patterns, mobile patterns, sound, anti-patterns, understanding users, and cognitive laws / psychology / behavioral science. Writing a landing page headline, value proposition, or any copy that has to say why a product is worth attention: load positioning first, and ask the user for the answers rather than inventing them. Building a catalog, collection page, or product listing: load commerce-catalog. Building a cart, checkout, or payment step: load commerce-checkout. Building a chat, agent, or near-empty prompt-and-response product, or deciding where brand lives once the chrome is gone: load brand-in-sparse-interfaces.

You can either:
1. Request a specific topic: get-ux-principle({ topic: "behavior-change" })
2. Use an alias: get-ux-principle({ topic: "reward design" })
3. Semantic search: get-ux-principle({ query: "confirm progress with control, competence, or recognition" })
4. Get index of all UX principles: get-ux-principle({})

Use maxTokens to keep responses focused (recommended: 5000–10000).`,
      inputSchema: z.object({
        topic: z.string().trim().min(1).max(120).optional()
          .describe("Specific UX topic or alias to load, e.g. forms, navigation, microcopy, positioning, value proposition, reward design, behavior-change, clarity audit, motion brief, design-process, cognitive-laws, psychology, commerce-catalog, commerce-checkout, brand-in-sparse-interfaces."),
        query: z.string().trim().min(1).max(500).optional()
          .describe("Natural language search query to find relevant UX principles."),
        maxTokens: z.number().min(500).max(50000).optional()
          .describe("Maximum tokens to return. Truncates content to fit. Recommended: 5000-10000."),
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ topic, query, maxTokens, context }) => {
      const start = Date.now();
      try {
        const { response, capture } = await runGuidanceTool(provider, userId, clientName(), "ux", "UX", "get-ux-principle", { topic, query, maxTokens });
        return trackSearch(track, "get-ux-principle", { ...capture, context }, start, response);
      } catch (error) {
        return trackSearch(
          track,
          "get-ux-principle",
          { query, topic, topResults: [], context },
          start,
          principleErrorResponse(error instanceof Error ? error.message : "Unknown error"),
          true,
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  );

  server.registerTool(
    "get-sales-principle",
    {
      title: "Get Sales Principle",
      description: `Load practical sales guidance before a live conversation or before writing a sales asset.

Use this to handle objections, prepare a champion, map features to value, or decide when honesty means recommending a different approach. For objections, load the sales-principles topic and follow ACERS in order: Acknowledge, Clarify, Empathize, Reframe, Sell.

You can either:
1. Request a specific topic or alias: get-sales-principle({ topic: "ACERS" })
2. Search for the situation: get-sales-principle({ query: "help a champion answer an implementation objection" })
3. Get the index of all sales principles: get-sales-principle({})

Use maxTokens to keep responses focused (recommended: 5000–10000).`,
      inputSchema: z.object({
        topic: z.string().trim().min(1).max(120).optional()
          .describe("Specific sales topic or alias, e.g. sales-principles, ACERS, objection handling, champion enablement, or feature value."),
        query: z.string().trim().min(1).max(500).optional()
          .describe("Natural language description of the sales conversation, objection, or asset."),
        maxTokens: z.number().min(500).max(50000).optional()
          .describe("Maximum tokens to return. Truncates content to fit. Recommended: 5000-10000."),
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ topic, query, maxTokens, context }) => {
      const start = Date.now();
      try {
        const { response, capture } = await runPrincipleTool(
          provider,
          "sales",
          "Sales",
          "get-sales-principle",
          { topic, query, maxTokens },
        );
        return trackSearch(
          track,
          "get-sales-principle",
          { ...capture, context },
          start,
          response,
        );
      } catch (error) {
        return trackSearch(
          track,
          "get-sales-principle",
          { query, topic, topResults: [], context },
          start,
          principleErrorResponse(error instanceof Error ? error.message : "Unknown error"),
          true,
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  );

  if (enableReactNativeGuide) {
    server.registerTool(
      "get-react-native-guide",
      {
        title: "Get React Native Guide",
        description: `Load implementation guidance for React Native and Expo projects.

Use this while planning, building, debugging, testing, or releasing a React Native app. It covers project setup, components and styling, Expo Router, data and authentication, native UI, animations and gestures, notifications, development builds, EAS workflows, testing, native modules, monetization, and store submission. It also includes copyable TypeScript and TSX recipes for secure sessions, validated API routes, purchases and usage credits, media sharing, realtime audio, durable generation, platform adapters, typed data clients, animation, chat interfaces, and social feeds. Preserve the examples when adapting them so the surrounding invariants remain visible to the coding agent.

The official Expo skills are included as a pinned, MIT-licensed source layer. They cover current Expo UI and Router APIs, project structure, networking, DOM components, web-to-native migration, native modules, brownfield apps, development clients, examples, App Clips, SDK upgrades, app-store delivery, EAS Hosting, Workflows, Observe, Update Insights, and remote simulators. Topics use the \`official-\` prefix, for example \`official-expo-native-ui\` and \`official-eas-app-stores\`. Paid EAS guides describe costs and plan limits; do not run a paid or state-changing command without the user's approval.

This complements the design tools: use get-ui-principle for visual decisions and get-ux-principle for product behavior.

You can either:
1. Request a known topic: get-react-native-guide({ topic: "auth-session-recipes" })
2. Use an alias: get-react-native-guide({ topic: "official expo native ui" })
3. Search for the current task or code example: get-react-native-guide({ query: "code example for a notification action while the app is terminated" })
4. Get the full topic index: get-react-native-guide({})

Prefer query search when you do not know the topic name. Use maxTokens to keep responses focused (recommended: 5000–10000).`,
        inputSchema: z.object({
          topic: z.string().trim().min(1).max(120).optional()
            .describe("Specific React Native topic or alias, e.g. auth-session-recipes, chat-component-recipes, development-builds, official-expo-native-ui, official-eas-app-stores."),
          query: z.string().trim().min(1).max(500).optional()
            .describe("Natural language description of the React Native task or problem."),
          maxTokens: z.number().min(500).max(50000).optional()
            .describe("Maximum tokens to return. Truncates content to fit. Recommended: 5000-10000."),
          context: CONTEXT_ARG,
        }),
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      },
      async ({ topic, query, maxTokens, context }) => {
        const start = Date.now();
        try {
          const { response, capture } = await runGuidanceTool(
            provider,
            userId,
            clientName(),
            "react-native",
            "React Native",
            "get-react-native-guide",
            { topic, query, maxTokens },
          );
          return trackSearch(
            track,
            "get-react-native-guide",
            { ...capture, context },
            start,
            withNativeVerify(response, "react-native"),
          );
        } catch (error) {
          return trackSearch(
            track,
            "get-react-native-guide",
            { query, topic, topResults: [], context },
            start,
            principleErrorResponse(error instanceof Error ? error.message : "Unknown error"),
            true,
            error instanceof Error ? error.message : String(error),
          );
        }
      },
    );
  }

  if (enableThreeJsGuide) {
    server.registerTool(
      "get-three-js-guide",
      {
        title: "Get Three.js Guide",
        description: `Load implementation guidance for Three.js and React Three Fiber projects.

Use this while planning, building, debugging, or optimizing 3D web scenes. It covers Three.js fundamentals, geometries, materials, textures, lights and shadows, models and 3D text, particles, physics with Rapier, performance, postprocessing, React Three Fiber and its drei helper catalog, WebGPU and TSL node materials, shader fundamentals, and copyable shader effect recipes. It also covers auditing existing scenes: establish a repeatable baseline, trace resource ownership and repeated work, decide when demand rendering fits, and validate changes in the running scene. Before you model an object from code, load the building-procedural-objects topic: it covers parts that must touch, stay clear, stay in one piece and rest on the ground, faces that point outward, surfaces that must not flicker, and readable text. Preserve the examples when adapting them so the surrounding invariants remain visible to the coding agent.

This complements the design tools: use get-ui-principle for visual decisions and get-ux-principle for product behavior.

You can either:
1. Request a known topic: get-three-js-guide({ topic: "fundamentals" })
2. Use an alias: get-three-js-guide({ topic: "webgpu and tsl" })
3. Search for the current task or code example: get-three-js-guide({ query: "code example for a dissolve shader effect" })
4. Audit an existing scene: get-three-js-guide({ topic: "auditing-and-fixing-a-scene" })
5. Model an object whose parts fit together: get-three-js-guide({ topic: "building-procedural-objects" })
6. Get the full topic index: get-three-js-guide({})

Prefer query search when you do not know the topic name. Use maxTokens to keep responses focused (recommended: 5000-10000).`,
        inputSchema: z.object({
          topic: z.string().trim().min(1).max(120).optional()
            .describe("Specific Three.js topic or alias, e.g. fundamentals, shader-effects-recipes, drei-catalog, webgpu-and-tsl."),
          query: z.string().trim().min(1).max(500).optional()
            .describe("Natural language description of the Three.js or React Three Fiber task or problem."),
          maxTokens: z.number().min(500).max(50000).optional()
            .describe("Maximum tokens to return. Truncates content to fit. Recommended: 5000-10000."),
          context: CONTEXT_ARG,
        }),
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      },
      async ({ topic, query, maxTokens, context }) => {
        const start = Date.now();
        try {
          const { response, capture } = await runGuidanceTool(
            provider,
            userId,
            clientName(),
            "three-js",
            "Three.js",
            "get-three-js-guide",
            { topic, query, maxTokens },
          );
          return trackSearch(
            track,
            "get-three-js-guide",
            { ...capture, context },
            start,
            response,
          );
        } catch (error) {
          return trackSearch(
            track,
            "get-three-js-guide",
            { query, topic, topResults: [], context },
            start,
            principleErrorResponse(error instanceof Error ? error.message : "Unknown error"),
            true,
            error instanceof Error ? error.message : String(error),
          );
        }
      },
    );
  }

  if (enableShopifyKit) {
    server.registerTool(
      "get-shopify-guide",
      {
        title: "Get Shopify Theme Guide",
        description: `Load Better Design's Shopify Liquid and Online Store 2.0 implementation guidance directly from the MCP. No separate agent skill is required.

Use this before creating or changing Liquid, JSON templates, sections, blocks, snippets, locale files, theme assets, product forms, cart behavior, or Shopify CLI workflows. The guides cover theme architecture, Liquid objects/tags/filters, merchant-editable schema, LiquidDoc, localization, accessibility, performance, validation with Shopify Theme Check, and building a sales page, advertorial, or product landing page on a store's own brand. They link to Shopify's primary documentation for version-sensitive API details.

You can either:
1. Request a known topic: get-shopify-guide({ topic: "shopify-theme-architecture" })
2. Use an alias: get-shopify-guide({ topic: "liquiddoc" })
3. Search for the current task or error: get-shopify-guide({ query: "product form variant selector and money formatting" })
4. Get the full topic index: get-shopify-guide({})

Prefer query search when you do not know the topic name. Run Shopify Theme Check after writing files. Use maxTokens to keep responses focused (recommended: 5000-10000).`,
        inputSchema: z.object({
          topic: z.string().trim().min(1).max(120).optional()
            .describe("Specific Shopify topic or alias, e.g. shopify-theme-architecture, shopify-liquid-language, shopify-sales-page, section-schema, localization, or theme-check."),
          query: z.string().trim().min(1).max(500).optional()
            .describe("Natural language description of the Shopify theme task, API, or validation error."),
          maxTokens: z.number().min(500).max(50000).optional()
            .describe("Maximum tokens to return. Truncates content to fit. Recommended: 5000-10000."),
          context: CONTEXT_ARG,
        }),
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      },
      async ({ topic, query, maxTokens, context }) => {
        const start = Date.now();
        try {
          const { response, capture } = await runGuidanceTool(
            provider,
            userId,
            clientName(),
            "shopify",
            "Shopify",
            "get-shopify-guide",
            { topic, query, maxTokens },
          );
          return trackSearch(
            track,
            "get-shopify-guide",
            { ...capture, context },
            start,
            response,
          );
        } catch (error) {
          return trackSearch(
            track,
            "get-shopify-guide",
            { query, topic, topResults: [], context },
            start,
            principleErrorResponse(error instanceof Error ? error.message : "Unknown error"),
            true,
            error instanceof Error ? error.message : String(error),
          );
        }
      },
    );
  }

  server.registerTool(
    "get-motion-guide",
    {
      title: "Get Motion Guide",
      description: `Load Better Design's video design-system guidance for building a product demo or promo video in code.

Use this before writing a Remotion composition, and while debugging one. It covers the product-demo brief, brand and motion tokens, responsive format profiles, product interactions, captions and accessibility, story and rhythm, layout traps, rendering, and visual review.

Start with scaffold: true. It returns a complete brand-aware Remotion project with landscape and vertical compositions, typed Studio props, a shared timeline, product-interaction scene, sourced proof, captions and an optional generated music bed.

Then pick the product shots from the video components: agent and prompt screens, phone and laptop mockups, cropped screen recordings, terminal sessions, charts and counters, title reveals, captions, logo stings, social proof, transitions and backgrounds. get-motion-guide({}) lists them by group; get-motion-guide({ component: "phone-mockup" }) returns that component's source, prop defaults, natural length and install command. Better Design wrote every one and serves them from its registry, so the shadcn CLI installs them with the video kit they share. plan-video turns a one-line brief into beats with one component each, cut-screen-recording cuts a recording into beats, and render-video-frames renders chosen frames so you check the work.

Install and follow the twelve official Remotion skills from https://www.remotion.dev/docs/ai/skills for current APIs. Better Design owns brand, hierarchy, story, pacing and review. RemotionUI, remocn and Remotion Bits are optional, source-labelled pattern libraries; ask before installing community code and adapt it to the active video tokens.

This tool does not render. Rendering needs Remotion and a large headless-browser download in the user's own project. Write the files into their repo, then use render-video-frames to check chosen frames before the full render.

This complements the design tools: use get-ui-principle for visual decisions and get-ux-principle for product behavior. For in-app animation whose timing the user should tune by eye (durations, springs, stagger), call get-jig-guide and mount its tuning panel instead of guessing values.

You can either:
1. Get the starter project: get-motion-guide({ scaffold: true })
2. Get one video component as files: get-motion-guide({ component: "answer-reply" })
3. Request a known topic: get-motion-guide({ topic: "video-design-system" })
4. Use an alias: get-motion-guide({ topic: "product demo structure" })
5. Search for the current task or problem: get-motion-guide({ query: "reflow my product demo for vertical video" })
6. Get the full topic and component index: get-motion-guide({})

Prefer query search when you do not know the topic name. Use maxTokens to keep responses focused (recommended: 5000-10000).`,
      inputSchema: z.object({
        scaffold: z.boolean().optional()
          .describe("Return a complete brand-aware Remotion product-demo project, as files to write. Start here when building a video."),
        component: z.string().trim().min(1).max(80).optional()
          .describe("A video component name, e.g. answer-reply, prompt-compose, terminal-session, phone-mockup, laptop-mockup, recording-shot, headline-reveal, captions, logo-reveal, stat-count. Returns its source files, prop defaults, natural length and install command."),
        topic: z.string().trim().min(1).max(120).optional()
          .describe("Specific motion topic or alias, e.g. video-design-system, product-demo-brief, formats-and-safe-areas, product-interactions, captions-and-accessibility, remotion-resources, video-components, verifying-a-render."),
        query: z.string().trim().min(1).max(500).optional()
          .describe("Natural language description of the video or animation task or problem."),
        maxTokens: z.number().min(500).max(50000).optional()
          .describe("Maximum tokens to return for guidance and the index. Truncates content to fit. Recommended: 5000-10000. Ignored by scaffold and component, which always return whole files."),
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ scaffold, component, topic, query, maxTokens, context }) => {
      const start = Date.now();
      if (component) {
        // component answers first. Name any other selector the call passed so
        // the agent knows what it still has to ask for, rather than losing it
        // silently. [BD-621]
        const skipped = [
          scaffold ? "scaffold: true" : undefined,
          topic ? `topic: "${topic}"` : undefined,
          query ? `query: "${query}"` : undefined,
        ].filter((selector): selector is string => selector !== undefined);
        const note = skipped.length === 0
          ? ""
          : `\n\nThis call also passed ${skipped.join(" and ")}. Only component was answered. Call get-motion-guide again with the rest to get it.`;
        const text = `${renderVideoComponent(component)}${note}`;
        return trackSearch(
          track,
          "get-motion-guide",
          { query, topic: `component:${component}`, topResults: [], context },
          start,
          {
            content: [{
              type: "text" as const,
              text,
            }],
          },
        );
      }
      if (scaffold) {
        const files = MOTION_SCAFFOLD_FILES.map(
          (file) => `--- ${file.path} ---\n${file.contents}`,
        ).join("\n");
        return trackSearch(
          track,
          "get-motion-guide",
          { query, topic: "scaffold", topResults: [], context },
          start,
          {
            content: [
              {
                type: "text" as const,
                text: `A brand-aware Remotion product-demo project. Write these files, then follow the steps.\n\n${MOTION_SCAFFOLD_STEPS}\n\n${files}`,
              },
            ],
          },
        );
      }
      try {
        const { response, capture } = await runGuidanceTool(
          provider,
          userId,
          clientName(),
          "motion",
          "Motion",
          "get-motion-guide",
          { topic, query, maxTokens },
        );
        // The bare index also lists the video components, so one call shows
        // every topic and every shot an agent can load. The joined text is
        // fitted again so maxTokens caps the whole reply. [BD-621]
        if (!topic && !query) {
          const joined = response.content
            .map((block) => block.text)
            .concat(formatVideoComponentIndex())
            .join("\n\n");
          response.content = [{
            type: "text" as const,
            text: fitTokens(joined, maxTokens),
          }];
        }
        return trackSearch(track, "get-motion-guide", { ...capture, context }, start, response);
      } catch (error) {
        return trackSearch(
          track,
          "get-motion-guide",
          { query, topic, topResults: [], context },
          start,
          principleErrorResponse(error instanceof Error ? error.message : "Unknown error"),
          true,
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  );

  server.registerTool(
    "get-swiftui-guide",
    {
      title: "Get SwiftUI Guide",
      description: `Load implementation guidance for SwiftUI and native Apple platform work.

Use this while planning, building, or debugging a SwiftUI interface. It covers native layout and view composition, animation and gestures, Metal shader effects, and the platform APIs those depend on, with copyable Swift examples.

This complements the design tools: use get-ui-principle for visual decisions, get-ux-principle for product behavior, and get-react-native-guide when the target is React Native or Expo rather than native Swift.

You can either:
1. Request a known topic: get-swiftui-guide({ topic: "swiftui-ripple-refraction" })
2. Use an alias: get-swiftui-guide({ topic: "water ripple" })
3. Search for the current task: get-swiftui-guide({ query: "bend an image where the user touches it" })
4. Get the full topic index: get-swiftui-guide({})

Prefer query search when you do not know the topic name. Use maxTokens to keep responses focused (recommended: 5000-10000).`,
      inputSchema: z.object({
        topic: z.string().trim().min(1).max(120).optional()
          .describe("Specific SwiftUI topic or alias, e.g. swiftui-ripple-refraction."),
        query: z.string().trim().min(1).max(500).optional()
          .describe("Natural language description of the SwiftUI task or problem."),
        maxTokens: z.number().min(500).max(50000).optional()
          .describe("Maximum tokens to return. Truncates content to fit. Recommended: 5000-10000."),
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ topic, query, maxTokens, context }) => {
      const start = Date.now();
      try {
        const { response, capture } = await runGuidanceTool(
          provider,
          userId,
          clientName(),
          "swiftui",
          "SwiftUI",
          "get-swiftui-guide",
          { topic, query, maxTokens },
        );
        return trackSearch(
          track,
          "get-swiftui-guide",
          { ...capture, context },
          start,
          withNativeVerify(response, "swiftui"),
        );
      } catch (error) {
        return trackSearch(
          track,
          "get-swiftui-guide",
          { query, topic, topResults: [], context },
          start,
          principleErrorResponse(error instanceof Error ? error.message : "Unknown error"),
          true,
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  );

  server.registerTool(
    "get-review-rules",
    {
      title: "Get Code Review Rules",
      description: REVIEW_RULES_DESCRIPTION,
      inputSchema: z.object({
        category: z.enum(REVIEW_RULE_CATEGORIES).optional()
          .describe("Filter rules by category (defaults to 'all')"),
        maxTokens: z.number().min(500).max(50000).optional()
          .describe("Maximum tokens of rule content. Required workflow guidance is returned in full outside this budget. Recommended: 5000–10000."),
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ category = "all", maxTokens, context }) => {
      const start = Date.now();
      try {
        const [allRules, session, teamRules] = await Promise.all([
          provider.getReviewRules(category),
          loadSessionGuidance(provider, userId, clientName()),
          loadTeamRules(provider, userId),
        ]);
        // The account's own team rules follow the house rules in full, outside
        // the maxTokens budget. No saved rules add nothing. [BD-922]
        const teamSection = teamRulesReviewSection(teamRules);
        // Session-aware review [BD-495]: the rules that bear on the principles
        // this session already loaded are ordered first and named in the opening
        // line. Nothing is dropped, so a caller with no session history reads the
        // same full rule set in the same order as before.
        const { rules, sections } = weightReviewRules(allRules, session.topics);
        const topResults = rules.map((rule) => ({ id: rule.id }));

        if (rules.length === 0) {
          return trackSearch(
            track,
            "get-review-rules",
            { query: category, topic: category, topResults, context },
            start,
            {
              content: [{
                type: "text" as const,
                text: `${RENDERED_REVIEW_DIRECTIVE}\n\nNo review rules found. Rule retrieval is incomplete; do not report a passed review.${teamSection}`,
              }],
            },
          );
        }

        const rulesOutput = rules
          .map((rule) => `# ${rule.title}\n\n${rule.content}`)
          .join("\n\n---\n\n");

        const preamble = guidancePreamble(session.topics, "the build", sections);
        // Keep required workflow guidance intact even with a small rule budget.
        const ruleContent = maxTokens ? truncateToTokens(rulesOutput, maxTokens) : rulesOutput;
        // The design system step sits after the rules and outside the token
        // budget, so a small maxTokens never cuts it. [BD-1172]
        const text = [
          "# Code Review Rules",
          preamble,
          RENDERED_REVIEW_DIRECTIVE,
          `${ruleContent}${teamSection}`,
          reviewDesignSystemStep(session),
        ].filter(Boolean).join("\n\n");

        return trackSearch(
          track,
          "get-review-rules",
          { query: category, topic: category, topResults, context },
          start,
          { content: [{ type: "text" as const, text }] },
        );
      } catch (error) {
        return trackSearch(
          track,
          "get-review-rules",
          { query: category, topic: category, topResults: [], context },
          start,
          principleErrorResponse(error instanceof Error ? error.message : "Unknown error"),
          true,
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  );
}
import { DESIGN_TRADEOFF_RULE, REDESIGN_SCOPE_CONTRACT } from "../redesign-contract";
