import ts from "typescript";
import { releaseSpeedHits } from "./release-speed-rules";
import type { Finding, LintInput } from "./types";

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function snippet(lines: string[], line: number): string {
  return lines[line - 1]?.trim() ?? "";
}

// The file is split once per input, not once per finding: a file of many
// findings otherwise cost time with the square of its length. [BD-986]
const splitLines = new WeakMap<LintInput, string[]>();

function finding(input: LintInput, line: number, values: Omit<Finding, "file" | "line" | "snippet">): Finding {
  let lines = splitLines.get(input);
  if (!lines) {
    lines = input.content.split(/\r?\n/);
    splitLines.set(input, lines);
  }
  return { file: input.path, line, snippet: snippet(lines, line), ...values };
}

function hasRationale(source: ts.SourceFile, block: ts.Block): boolean {
  return /\/\/|\/\*/.test(source.text.slice(block.getStart(source), block.getEnd()));
}

function handlesError(block: ts.Block, binding: string | null): boolean {
  const body = block.getText();
  if (/\b(console\.(?:error|warn|log)|throw|captureException|report|logger)\b/.test(body)) return true;
  return binding !== null && new RegExp(`\\b${binding.replace(/[$]/g, "\\$")}\\b`).test(body.replace(/^\{/, ""));
}

function isSilentCatch(node: ts.CatchClause, source: ts.SourceFile): boolean {
  if (hasRationale(source, node.block)) return false;
  const binding = node.variableDeclaration?.name.getText(source) ?? null;
  if (handlesError(node.block, binding)) return false;
  return node.block.statements.length === 0
    || (node.block.statements.length === 1 && ts.isReturnStatement(node.block.statements[0]));
}

/** Runs deterministic JavaScript and TypeScript quality checks. */
export function lintCodeRules(input: LintInput): Finding[] {
  const source = ts.createSourceFile(input.path, input.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];

  function visit(node: ts.Node): void {
    if (ts.isAsExpression(node) && node.type.kind === ts.SyntaxKind.AnyKeyword) {
      findings.push(finding(input, lineOf(source, node), {
        severity: "serious",
        ruleId: "code/as-any",
        message: "An as any cast removes type safety from this value.",
        fix: "Type the value, narrow unknown, or use a specific assertion instead of any.",
        kind: "measured-source",
      }));
    }
    if (ts.isCatchClause(node) && isSilentCatch(node, source)) {
      findings.push(finding(input, lineOf(source, node), {
        severity: "serious",
        ruleId: "code/silent-catch",
        message: "This catch hides the failure, so an outage can look like empty data.",
        fix: "Log, report, or return the cause. If silence is correct, add a short rationale in the catch.",
        kind: "measured-source",
      }));
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  for (const hit of releaseSpeedHits(source)) {
    findings.push(finding(input, lineOf(source, hit.node), {
      severity: "moderate",
      ruleId: "motion/release-drops-speed",
      message: "This drag release settles without the gesture's speed, so a flicked element stops or jumps before it moves into place.",
      fix: hit.fix,
      kind: "measured-source",
    }));
  }
  return [...findings, ...cargoTimerFindings(input)];
}

function cargoTimerFindings(input: LintInput): Finding[] {
  const lines = input.content.split(/\r?\n/);
  const findings: Finding[] = [];
  lines.forEach((line, index) => {
    if (!/\bsetTimeout\s*\(/.test(line)) return;
    const context = lines.slice(Math.max(0, index - 2), index + 1).join("\n");
    if (!/\/\/.*\b(settle|give .{0,20}time|ensure .{0,40}(updated|loaded|ready|applied)|wait for .{0,40}(load|render|update))\b/i.test(context)) return;
    findings.push(finding(input, index + 1, {
      severity: "serious",
      ruleId: "code/cargo-timer",
      message: "A timer is being used as a guessed readiness signal.",
      fix: "Wait for the real event, promise, document.fonts.ready, transitionend, or library callback.",
      kind: "measured-source",
    }));
  });
  return findings;
}
