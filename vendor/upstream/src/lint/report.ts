import { summarise } from "./engine";
import type { Finding, Severity } from "./types";

/** The values `SEVERITY_ORDER` maps its keys onto. */
interface SeverityOrderTable {
  [key: string]: number;
}

const SEVERITY_ORDER: SeverityOrderTable = {
  critical: 0,
  serious: 1,
  moderate: 2,
} satisfies Record<Severity, number>;

/**
 * Orders findings for reading: grouped by file, worst severity first, then by
 * line. Returns a new array so a caller's own ordering survives.
 */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    // Plain code-unit comparison, not localeCompare: the review's promise is
    // that the same input always produces the same output, and locale-aware
    // ordering varies with the machine's locale.
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (SEVERITY_ORDER[a.severity] !== SEVERITY_ORDER[b.severity]) {
      return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    }
    return a.line - b.line;
  });
}

/**
 * Renders findings as the markdown a coding agent or a human in a terminal
 * acts on directly: every finding carries its line, rule, and concrete fix. An
 * empty list produces an explicit clean-pass report rather than a blank string,
 * so a caller can always show the result.
 */
export function formatFindingsReport(findings: Finding[], title = "UI review"): string {
  const counts = summarise(findings);
  if (counts.total === 0) {
    return `# ${title}\n\nNo findings. The checked files pass every deterministic rule.`;
  }

  const parts: string[] = [
    `# ${title} — ${counts.total} finding${counts.total === 1 ? "" : "s"} (${counts.critical} critical, ${counts.serious} serious, ${counts.moderate} moderate)`,
  ];

  let currentFile = "";
  for (const f of sortFindings(findings)) {
    if (f.file !== currentFile) {
      currentFile = f.file;
      parts.push(`\n## ${f.file}`);
    }
    const wcag = f.wcag ? ` (WCAG ${f.wcag})` : "";
    parts.push(
      `\n- **${f.severity}** \`${f.ruleId}\` line ${f.line}${wcag}: ${f.message}`
      + (f.snippet ? `\n  \`${f.snippet.slice(0, 160)}\`` : "")
      + `\n  Fix: ${f.fix}`,
    );
  }

  parts.push(
    "\n\nFix every critical and serious finding, then run the review again. These checks are deterministic: the same input always produces the same findings.",
  );
  return parts.join("\n");
}
