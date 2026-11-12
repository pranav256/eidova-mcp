import type { ComprehensionFinding, ComprehensionReport, ComprehensionTest } from "./analyze";

/** The values `TEST_TITLES` maps its keys onto. */
interface TestTitlesTable {
  [key: string]: string;
}

const TEST_TITLES: TestTitlesTable = {
  mom: "Mom test: would someone outside the team understand this?",
  "fifteen-second": "15 second test: can you explain the screen in 15 seconds?",
  screenshot: "Screenshot test: with zero context, is it clear what this does?",
  slide: "Slide test: one idea, and few enough words to hear the speaker?",
  brand: "Brand test: does the copy keep to the team's own words?",
} satisfies Record<ComprehensionTest, string>;

const SEVERITY_ORDER = { critical: 0, serious: 1, minor: 2 } as const;

function formatFinding(finding: ComprehensionFinding): string {
  return [
    `- **${finding.severity}** ${finding.problem}`,
    `  - Found: ${finding.evidence}`,
    `  - Fix: ${finding.fix}`,
  ].join("\n");
}

function formatTestSection(report: ComprehensionReport, test: ComprehensionTest): string {
  const findings = report.findings
    .filter((finding) => finding.test === test)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const body = findings.length > 0
    ? findings.map(formatFinding).join("\n")
    : "- Passed.";

  return `## ${TEST_TITLES[test]}\n\n${body}`;
}

function formatStats(report: ComprehensionReport): string {
  const { words, actionCount, insiderTerms, estimatedExplainSeconds } = report.stats;
  return [
    "## What the check measured",
    "",
    `- Visible copy: ${words} words across ${actionCount} action${actionCount === 1 ? "" : "s"}.`,
    ...(report.surface === "reference" ? [`- Reference mode: the short-screen word and time budgets cover ${report.stats.budgetWords} title/action words. All body copy is still checked for jargon, acronyms, long sentences and banned terms.`] : []),
    `- Insider words found: ${insiderTerms.length > 0 ? insiderTerms.join(", ") : "none"}.`,
    `- Rough explain time: about ${estimatedExplainSeconds} seconds. This is a heuristic budget from word count, insider words and choices, not a measurement of real users.`,
    "- It read text only: the copy passed in, or the text in the markup. It cannot see screenshots, text inside images, or visual hierarchy.",
  ].join("\n");
}

const VERDICTS = {
  pass: {
    line: "Pass. Nothing blocking. Read the copy once more out loud before you present it.",
    next: "Say in one sentence what a first-time user can do on this screen. If that sentence needs a second sentence to make sense, simplify the screen.",
  },
  "needs-screenshot": {
    line: "The text passes. This is not approval: a slide passes only after you review its rendered screenshot.",
    next: "Render the slide at its real size and look at the screenshot. Confirm it carries one idea, the title reads first, and one element holds the eye. Split or restyle the slide if any of the three fails.",
  },
} satisfies Record<Exclude<ComprehensionReport["verdict"], "revise">, { line: string; next: string }>;

export function formatComprehensionReport(report: ComprehensionReport): string {
  const counts = report.findings.reduce(
    (totals, finding) => ({ ...totals, [finding.severity]: totals[finding.severity] + 1 }),
    { critical: 0, serious: 0, minor: 0 },
  );

  const { line: verdict, next } = report.verdict === "revise"
    ? {
      line: `Revise before presenting. ${counts.critical} critical, ${counts.serious} serious, ${counts.minor} minor.`,
      next: "Rewrite the copy so it survives every test, then call check-comprehension again on the new copy. Do not present the screen while a critical or serious finding stands.",
    }
    : VERDICTS[report.verdict];
  const slideSection = report.surface === "slide" ? ["", formatTestSection(report, "slide")] : [];
  const brandSection = report.brandChecked ? ["", formatTestSection(report, "brand")] : [];

  return [
    `# Comprehension check: ${report.screen}`,
    "",
    verdict,
    "",
    formatTestSection(report, "mom"),
    "",
    formatTestSection(report, "fifteen-second"),
    "",
    formatTestSection(report, "screenshot"),
    ...slideSection,
    ...brandSection,
    "",
    formatStats(report),
    "",
    "## Next step",
    "",
    next,
  ].join("\n");
}
