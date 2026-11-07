// Session-aware review [BD-495]. The review tools used to be blind to the
// session: get-review-rules returned the same rules whether the agent had read
// the depth principle five minutes earlier or never. This module turns the
// guidance calls a caller already made into an ordering + a sentence, so the
// review is checked against what the session actually loaded.
//
// It is deliberately pure: no database, no network, no PostHog. The stdio npm
// client bundles it, so it must not pull a server dependency in. The reading of
// the ledger lives behind DataProvider.getRecentGuidance; everything here just
// shapes what that returns.

/**
 * The session grain for MCP work, in milliseconds.
 *
 * The transport is stateless, so there is no connection id to group calls by. A
 * fixed 30-minute window is the grain, and it is the same one the PostHog trace
 * session uses (`mcpTraceSessionId`), which imports this constant so the two can
 * never drift apart.
 */
export const MCP_SESSION_WINDOW_MS = 30 * 60_000;

/** Tools that serve design guidance, the first step of the loop. */
export const GUIDANCE_TOOLS: ReadonlySet<string> = new Set([
  "get-ui-principle",
  "get-ux-principle",
  "get-react-native-guide",
  "get-swiftui-guide",
  "get-three-js-guide",
  "get-shopify-guide",
  "get-motion-guide",
  "get-widget-guide",
]);

/**
 * Tools that close the loop by reviewing what was built.
 *
 * In practice `get-review-rules` is the one that reaches the ledger:
 * `check-comprehension` carries no query and no topic, so `parseSearchCapture`
 * drops it on both transports and it is never recorded. It is listed here so
 * the set stays the honest definition of the review step, and so it counts the
 * day that capture contract changes.
 */
export const REVIEW_TOOLS: ReadonlySet<string> = new Set([
  "get-review-rules",
  "check-comprehension",
  "finalize-dashboard-review",
]);

/**
 * The guidance and review tools: the loop that the review nudge and the review
 * ordering read. Design system calls join them in `SESSION_LEDGER_TOOLS`.
 */
export const SESSION_LOOP_TOOLS: ReadonlySet<string> = new Set([
  ...GUIDANCE_TOOLS,
  ...REVIEW_TOOLS,
]);

/**
 * Tools that pick or install a design system. One of them in the window means
 * the session already chose its system, so no result asks for that step
 * again. [BD-1139]
 */
export const DESIGN_SYSTEM_TOOLS: ReadonlySet<string> = new Set([
  "find-design-system",
  "create-design-system",
  "get-design-system-kit",
]);

/**
 * The tool that reads a brand off a live site. Its ledger row carries the site
 * as its one result when the read found a primary colour, and nothing when it
 * did not, so the session can tell a product with its own design from a page
 * with none. [BD-1337]
 */
export const BRAND_READ_TOOL = "extract-from-url";

/**
 * Every tool the session lookup reads from the ledger. The stdio relay records
 * all of them except `find-design-system`, which its own /v1 route records, so
 * no call lands twice. Status polls and icon searches stay out of the window.
 */
export const SESSION_LEDGER_TOOLS: ReadonlySet<string> = new Set([
  ...SESSION_LOOP_TOOLS,
  ...DESIGN_SYSTEM_TOOLS,
  BRAND_READ_TOOL,
]);

/** One earlier tool call in the session window, as the ledger holds it. */
export interface RecentGuidanceCall {
  /** MCP tool name, for example "get-ui-principle". */
  tool: string;
  /** Topic the call was keyed by, for example "depth". Null for a free-text search. */
  topic: string | null;
  /** Ids of the docs the call returned, for example ["principle-depth-and-surfaces"]. */
  docIds: string[];
  /**
   * Host that made the call, for example "cursor-vscode". Null on rows written
   * before the client identified itself. Used to keep one host's session out of
   * another's when the same person works in two at once.
   */
  clientName?: string | null;
}

/** What the session did before the current call. */
export interface SessionGuidance {
  /** Guidance topics already served, oldest first, deduplicated. */
  topics: string[];
  /** Whether the window already holds a review call. */
  reviewed: boolean;
  /** How many guidance calls the window holds. */
  guidanceCalls: number;
  /** Whether the window already holds a design system search, creation or kit install. */
  designSystemChosen: boolean;
}

/** An empty session. Every failed or absent lookup degrades to this. */
export const NO_SESSION_GUIDANCE: SessionGuidance = {
  topics: [],
  reviewed: false,
  guidanceCalls: 0,
  designSystemChosen: false,
};

/** Most topics a response names, so the sentence stays readable. */
const MAX_NAMED_TOPICS = 4;

/**
 * Strip the storage prefix off a doc id so it reads as the topic an agent can
 * ask for again, turning "principle-depth-and-surfaces" into
 * "depth-and-surfaces".
 */
function topicFromDocId(docId: string): string {
  return docId.replace(/^(principle|foundational|doc)-/, "").trim();
}

/**
 * Keep only the calls the current host made, so one person working in two
 * editors at once does not get the other one's topics.
 *
 * Falls back to the whole window whenever scoping would answer nothing: an
 * unknown host, or rows written before the client identified itself. A narrower
 * answer is better than a wrong one, and no answer is the same as today.
 */
function scopeToClient(
  calls: readonly RecentGuidanceCall[],
  clientName?: string,
): readonly RecentGuidanceCall[] {
  if (!clientName) return calls;
  const sameClient = calls.filter((call) => call.clientName === clientName);
  return sameClient.length > 0 ? sameClient : calls;
}

/**
 * Reduce the calls in the session window to the topics served and whether a
 * review has happened yet. Order is preserved, so the topics read in the order
 * the session loaded them.
 *
 * @param clientName Host making the current call. When given, the window is
 * narrowed to that host's own calls, unless it has none in the window.
 */
export function summarizeSessionGuidance(
  calls: readonly RecentGuidanceCall[],
  clientName?: string,
): SessionGuidance {
  const topics: string[] = [];
  const seen = new Set<string>();
  let guidanceCalls = 0;
  let reviewed = false;
  // Read before the client scoping: the stdio /v1 search route records
  // find-design-system with no client name, so scoping would drop it. A site
  // whose brand read found a primary colour is the product's own design, so
  // it counts as the choice too. [BD-1337]
  const designSystemChosen = calls.some(
    (call) => DESIGN_SYSTEM_TOOLS.has(call.tool) || (call.tool === BRAND_READ_TOOL && call.docIds.length > 0),
  );

  for (const call of scopeToClient(calls, clientName)) {
    if (DESIGN_SYSTEM_TOOLS.has(call.tool) || call.tool === BRAND_READ_TOOL) continue;
    if (REVIEW_TOOLS.has(call.tool)) {
      reviewed = true;
      continue;
    }
    if (!GUIDANCE_TOOLS.has(call.tool)) continue;
    guidanceCalls += 1;

    const raw = call.topic?.trim() || call.docIds.map(topicFromDocId).find(Boolean);
    if (!raw) continue;
    const topic = topicFromDocId(raw).toLowerCase();
    if (!topic || seen.has(topic)) continue;
    seen.add(topic);
    topics.push(topic);
  }

  return { topics, reviewed, guidanceCalls, designSystemChosen };
}

/** Join topics into a readable list: "depth", "depth and spacing", "a, b and c". */
export function formatTopicList(topics: readonly string[]): string {
  const named = topics.slice(0, MAX_NAMED_TOPICS);
  if (named.length === 0) return "";
  if (named.length === 1) return named[0];
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

/**
 * Which review section a guidance topic bears on. First match wins, and a topic
 * that matches nothing simply leaves the rule order alone. The section strings
 * are the same ones the `category` argument uses, because both are matched
 * against the rule doc id.
 */
const REVIEW_SECTION_BY_TOPIC: ReadonlyArray<{ match: RegExp; section: string }> = [
  { match: /accessib|a11y|contrast|keyboard|screen-reader/, section: "accessibility" },
  { match: /animation|motion|transition|spring|scroll|reveal|particle|canvas|hover|pointer|gesture|interaction/, section: "animation" },
  // `\bform` on purpose: bare `form` also matches "performance", which the
  // visual-design row below claims, and "information".
  { match: /microcopy|copy|content|marketing|onboarding|error|notification|dialog|\bform|search|navigation|psycholog|behavior|widget|calculator|estimator|converter|generator|quiz|checklist/, section: "content" },
  { match: /hierarchy|spacing|layout|typograph|color|depth|surface|polish|image|grid|component|distill|bolder|quieter|performance/, section: "visual-design" },
];

/** Map one topic to the review section it bears on, or null when none fits. */
export function reviewSectionForTopic(topic: string): string | null {
  const needle = topic.toLowerCase();
  return REVIEW_SECTION_BY_TOPIC.find(({ match }) => match.test(needle))?.section ?? null;
}

/** A review rule doc, narrowed to the fields the ordering reads. */
export interface WeightableRule {
  id: string;
  title: string;
}

/** The reordered rules, plus the sections that were pulled to the front. */
export interface WeightedRules<T extends WeightableRule> {
  rules: T[];
  sections: string[];
}

/**
 * Order the rules that bear on the topics this session already loaded to the
 * front. Nothing is removed and nothing is rewritten: every rule stays in the
 * response, and rules within each half keep their original order.
 */
export function weightReviewRules<T extends WeightableRule>(
  rules: readonly T[],
  topics: readonly string[],
): WeightedRules<T> {
  const sections = [...new Set(topics.map(reviewSectionForTopic).filter((s): s is string => Boolean(s)))];
  if (sections.length === 0) return { rules: [...rules], sections: [] };

  const matches = (rule: T) =>
    sections.some((section) => rule.id.toLowerCase().includes(section));

  const first = rules.filter(matches);
  if (first.length === 0 || first.length === rules.length) {
    return { rules: [...rules], sections: [] };
  }

  return {
    rules: [...first, ...rules.filter((rule) => !matches(rule))],
    sections: sections.filter((section) =>
      first.some((rule) => rule.id.toLowerCase().includes(section)),
    ),
  };
}

/**
 * The sentence a review response opens with when the session already loaded
 * guidance. `subject` names what is being reviewed, so the same builder serves
 * the rules ("the build") and the comprehension check ("this copy").
 */
export function guidancePreamble(
  topics: readonly string[],
  subject: string,
  orderedSections: readonly string[] = [],
): string {
  if (topics.length === 0) return "";
  const list = formatTopicList(topics);
  const plural = topics.length > 1 ? "principles" : "principle";
  const ordering = orderedSections.length
    ? ` The ${formatTopicList(orderedSections.map((s) => s.replace(/-/g, " ")))} rules are ordered first below.`
    : "";
  return `Earlier this session you loaded the ${list} ${plural}. Check ${subject} against these first.${ordering}`;
}

/**
 * The line a guidance response ends with when the session has loaded guidance
 * and never reviewed the result. It names the missing step once, in one
 * sentence, and disappears as soon as a review call lands in the window.
 */
export function reviewNudge(session: SessionGuidance): string {
  if (session.reviewed || session.guidanceCalls === 0) return "";
  return "You have loaded design guidance in this session and not reviewed the result yet. When the screen exists, call `get-review-rules`, then `check-comprehension` and `inspect-spacing`. For a dashboard, deploy the exact source to a public HTTPS preview; `finalize-dashboard-review` must return VALID after Better Design captures it at 390, 1440, and 1728. Confirm every nav item, link, tab and button works. Fix every critical and serious finding before you present it.";
}

/**
 * The line that names the design system step when the session has not taken
 * it. An agent working alone follows tool results, not the server
 * instructions, so the result is where the step has to appear. [BD-1139]
 */
export function designSystemNudge(session: SessionGuidance): string {
  if (session.designSystemChosen) return "";
  return "Next: call `find-design-system` with the product's description. If no person is there to choose, take the top match and say which one you took. Then call `get-design-system-kit` to install it.";
}

/**
 * The line a review result ends with when the session has no design system
 * call. A new user often starts with a review, and a session that starts there
 * rarely reaches a design system on its own. The matches go in the report and
 * the restyle waits for the person, because a product may keep its own
 * design. [BD-1172]
 *
 * Only a recorded `get-review-rules` call marks the session as reviewed: the
 * ledger records neither `check-comprehension` nor `inspect-spacing`. So the
 * line shows on one `get-review-rules` result per session, but on every
 * `check-comprehension` and finished `inspect-spacing` result until a review
 * or design system call lands.
 */
export function reviewDesignSystemStep(session: SessionGuidance): string {
  if (session.designSystemChosen || session.reviewed) return "";
  return "Before you finish this review, call `find-design-system` with the product's description and list its top matches in your report, so the person can pick a style. Restyle the screen only with the one they pick.";
}

/**
 * The first missing step before the build: the design system, then the
 * guidance. Inspiration and other research tools end with it. [BD-1139]
 */
export function nextBuildStep(session: SessionGuidance): string {
  const designSystem = designSystemNudge(session);
  if (designSystem) return designSystem;
  if (session.guidanceCalls > 0) return "";
  return "Next: call `get-ui-principle` before styling and `get-ux-principle` before behavior.";
}
