import { toRedactedJson } from "../../review-capture";
import { z } from "zod";
import {
  analyzeComprehension,
  formatComprehensionReport,
  type ComprehensionInput,
} from "../comprehension";
import type { RegisterToolDeps } from "./shared";
import { CONTEXT_ARG, READ_ONLY_TOOL_ANNOTATIONS, loadSessionGuidance, mcpClientName } from "./shared";
import { guidancePreamble, reviewDesignSystemStep } from "../session-guidance";
import { readTeamRulesWords } from "../team-rules-outline";
import { loadTeamRules } from "./team-rules-tools";

const NOTHING_TO_CHECK = `# Comprehension check

No user-facing copy was found. Pass the screen's copy directly:

check-comprehension({ screen: "Lesson end card", headline: "...", body: ["..."], actions: ["..."] })

or pass the screen's markup as \`code\` and the check will read the copy out of it.`;

/**
 * Register `check-comprehension`, the comprehension half of the review loop.
 *
 * The check itself runs in process on the copy it is given. The only thing it
 * reads from the session is the guidance already served, which it names at the
 * top of the report so the copy is read against those principles. [BD-495]
 */
export function registerComprehensionTools({ server, provider, track, userId }: RegisterToolDeps): void {
  server.registerTool(
    "check-comprehension",
    {
      title: "Check Comprehension",
      description: `Run the comprehension check on an interface you just built. Call this after get-review-rules, before you present the screen to the user.

Review rules catch what is broken. This catches what is unclear: copy that makes sense to the people who built the product and to nobody else.

It reads text only: the copy you pass, or the text it extracts from your markup. It does not see what renders: not screenshots, text inside images, or visual hierarchy. A pass is a text result, not visual approval.

Three tests, run on the screen's own words:
1. Mom test. Would a person outside the team understand this? Flags insider vocabulary, unexplained acronyms and sentences too long to follow.
2. 15 second test. If the screen takes longer than 15 seconds to explain, it is too complex. Flags word count, stacked concepts and competing actions.
3. Screenshot test. With zero context, can someone say what the screen does? Flags a missing title, actions that hide the outcome ("Continue", "Got it") and icon-only controls.

Pass either the copy or the markup:
- check-comprehension({ screen: "Lesson end card", headline: "Lesson complete", body: ["Claim the June badge by collecting more quest points from your daily, friend and weekend quests."], actions: ["Continue"] })
- check-comprehension({ screen: "Billing page", code: "<section>…the JSX you wrote…</section>" })

Check every panel, not only the page's own copy. When a sales page, deck or social image shows a mock product screen, dashboard, table or chat panel, call this once per panel with that panel's text. Text inside a mock-up is still copy the reader reads, and long or insider text hides there most often.

For a slide, pass surface: "slide" (a screen named slide, deck or presentation gets it by default) and call once per slide. A slide adds a density test, and it never passes on text: approve it only after you review its rendered screenshot.

For documentation or a data reference, explicitly pass surface: "reference". The short-screen word/time budgets then cover the title and actions; the body still gets jargon, acronym, sentence and brand checks. Use screen or slide for onboarding, forms, marketing sections and product mock-ups, even when they contain a sample table.

Use knownTerms for words your audience genuinely knows, so the check stops flagging them. When the team saved rules, their approved words count as known and their banned words fail a brand test. Fix every critical and serious finding, then call this again on the rewritten copy.`,
      inputSchema: z.object({
        screen: z.string().trim().min(1).max(120)
          .describe("What this screen is, e.g. 'lesson end card', 'billing page'."),
        headline: z.string().trim().max(300).optional()
          .describe("The screen's title, if you are passing copy rather than markup."),
        body: z.array(z.string().trim().min(1).max(2000)).max(50).optional()
          .describe("Supporting copy, one string per visible line or paragraph."),
        actions: z.array(z.string().trim().min(1).max(120)).max(20).optional()
          .describe("Visible button and link labels, e.g. ['Claim badge', 'Not now']. Search fields, filters and selects are not actions."),
        code: z.string().max(60000).optional()
          .describe("JSX, TSX or HTML for the screen. Copy is extracted from it when headline/body/actions are omitted."),
        knownTerms: z.array(z.string().trim().min(1).max(60)).max(50).optional()
          .describe("Words this audience already knows, so they are not flagged as insider language."),
        surface: z.enum(["screen", "slide", "reference"]).optional()
          .describe("Reference documentation/data applies short-screen density budgets to title and actions, retaining all body language checks. Slides add density checks and require screenshot review. Defaults to screen, or slide for slide/deck/presentation names."),
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ context, ...args }) => {
      const start = Date.now();
      // The team's rules approve and ban words [BD-1015]. An account without
      // rules, or a lookup that fails, leaves the check exactly as it was.
      // Session-aware review [BD-495] names the principles this session already
      // loaded. Neither lookup needs the other, so they run together.
      const [rules, session] = await Promise.all([
        loadTeamRules(provider, userId),
        loadSessionGuidance(provider, userId, mcpClientName(server)),
      ]);
      const words = readTeamRulesWords(rules);
      // SAFETY: the runtime object carries this field; the public type omits it.
      const input = args as ComprehensionInput;
      const report = analyzeComprehension({
        ...input,
        knownTerms: [...(input.knownTerms ?? []), ...words.use],
        bannedTerms: words.never,
      });
      const hasCopy = Boolean(report.copy.headline)
        || report.copy.body.length > 0
        || report.copy.actions.length > 0;
      const body = hasCopy ? formatComprehensionReport(report) : NOTHING_TO_CHECK;
      const preamble = guidancePreamble(session.topics, "this copy");
      const nextStep = reviewDesignSystemStep(session);
      const text = [preamble, body, nextStep].filter(Boolean).join("\n\n");

      track(
        "check-comprehension",
        {
          screen: args.screen,
          context,
          verdict: hasCopy ? report.verdict : "no-copy",
          findingCount: hasCopy ? report.findings.length : 0,
        },
        {
          durationMs: Date.now() - start,
          isError: false,
          outputPreview: text.slice(0, 1000),
          review: {
            page: args.screen,
            input: toRedactedJson(args),
            output: text,
            findings: report.findings.map((f) => ({
              key: `${f.test}:${f.evidence}`,
              severity: f.severity,
              problem: f.problem,
            })),
          },
        },
      );

      // Named fields for callers that read fields, such as a Zap step. [BD-1142]
      // Claude Code passes these fields, not the text, to the model, so the
      // design system step goes here too. [BD-1172]
      const fields = hasCopy
        ? {
            verdict: report.verdict,
            findingCount: report.findings.length,
            findings: report.findings.map(({ test, severity, problem, evidence, fix }) => ({
              test,
              severity,
              problem,
              evidence,
              fix,
            })),
            words: report.stats.words,
            surface: report.surface,
            budgetWords: report.stats.budgetWords,
            estimatedExplainSeconds: report.stats.estimatedExplainSeconds,
          }
        : { verdict: "no-copy", findingCount: 0, findings: [] };
      const structuredContent = { ...fields, ...(nextStep && { nextStep }) };
      return { content: [{ type: "text" as const, text }], structuredContent };
    },
  );
}
