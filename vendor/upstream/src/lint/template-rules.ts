import ts from "typescript";
import { semanticTokenClassFindings, slopClassFindings } from "./class-rules";
import { pxLengthClassFindings, pxLengthStylesheetFindings } from "./length-rules";
import { layoutAnimationStylesheetFindings, layoutTransitionClassFindings } from "./motion-rules";
import { sideStripeStylesheetFindings } from "./stripe-rules";
import { lineIndex, maskBlockComments, maskMustache, maskQuotedRegions, ReviewBudgetExceeded } from "./template-masks";
import type { Finding, LintConfig, LintInput } from "./types";

const COLOR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\([^)]+\)|hsla?\([^)]+\)/g;

type LineIndex = ReturnType<typeof lineIndex>;

function sourceFinding(input: LintInput, lines: LineIndex, line: number, values: Omit<Finding, "file" | "line" | "snippet">): Finding {
  return {
    file: input.path,
    line,
    snippet: lines.snippet(line),
    kind: "measured-source",
    ...values,
  };
}

function classFindings(input: LintInput, lines: LineIndex, config: LintConfig, value: string, line: number): Finding[] {
  return [
    ...(config.rules.slop?.enabled === false ? [] : slopClassFindings(value)),
    ...(config.rules.semanticTokens?.enabled === false ? [] : semanticTokenClassFindings(value)),
    ...(config.rules.semanticTokens?.enabled === false ? [] : pxLengthClassFindings(value)),
    ...layoutTransitionClassFindings(value),
  ].map((item) => sourceFinding(input, lines, line, item));
}

// An import continues until a line ends in its module string. Only the
// current line can end the statement, so only it is tested: testing the whole
// statement so far at every line cost time with the square of its length.
// [BD-986]
function statementContinues(line: string, isImport: boolean, nextLine: string): boolean {
  const trimmed = line.trimEnd();
  if (/(?:=>|[=,+\-*/&|?.:])$/.test(trimmed)) return true;
  if (/^[\t ]*[?:.,+\-*/&|=]/.test(nextLine)) return true;
  // On the trimmed line, so one `\s*` suffices: `\s*;?\s*$` backtracked over
  // a long run of spaces with the square of its length.
  return isImport && !/(?:\bfrom\s*)?["'][^"']+["']\s*;?$/.test(trimmed);
}

function mdxStatementEnd(content: string, start: number): number {
  const importAt = /\s*import\b/y;
  importAt.lastIndex = start;
  const isImport = importAt.test(content);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (quote) {
      if (!escaped && char === quote) quote = "";
      escaped = !escaped && char === "\\";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if ("{([".includes(char)) depth += 1;
    else if ("})]".includes(char)) depth = Math.max(0, depth - 1);
    else if (char === ";" && depth === 0) return index + 1;
    else if (char === "\n" && depth === 0) {
      const lineStart = content.lastIndexOf("\n", index - 1) + 1;
      const nextLineEnd = content.indexOf("\n", index + 1);
      const nextLine = content.slice(index + 1, nextLineEnd < 0 ? content.length : nextLineEnd);
      if (!statementContinues(content.slice(lineStart, index), isImport, nextLine)) return index;
    }
  }
  return content.length;
}

// A statement starts after horizontal space only. `^\s*` also crossed blank
// lines, which rescanned each run of them from every line in it, and started
// the statement on the blank line, where it ended at once and left the import
// unmasked. A start inside the previous statement is skipped, so each line is
// scanned once, and the mask is built in one pass. [BD-986]
function maskMdxEsm(content: string, mask: (value: string) => string): string {
  const statementStart = /^[^\S\r\n\u2028\u2029]*(?:import|export)\b/gm;
  let out = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = statementStart.exec(content))) {
    const end = mdxStatementEnd(content, match.index);
    out += content.slice(cursor, match.index) + mask(content.slice(match.index, end));
    cursor = end;
    statementStart.lastIndex = Math.max(end, statementStart.lastIndex);
  }
  return out + content.slice(cursor);
}

type Range = readonly [start: number, end: number];

function literalRange(node: ts.StringLiteral | ts.TemplateLiteralToken, offset: number): Range {
  const start = node.getStart() - offset;
  const end = node.getEnd() - offset;
  if (node.kind === ts.SyntaxKind.TemplateHead || node.kind === ts.SyntaxKind.TemplateMiddle) {
    return [start + 1, end - 2];
  }
  return [start + 1, end - 1];
}

function collectRenderedRanges(node: ts.Expression, offset: number, ranges: Range[]): void {
  if (ts.isParenthesizedExpression(node)
    || ts.isAsExpression(node)
    || ts.isSatisfiesExpression(node)
    || ts.isNonNullExpression(node)
    || ts.isAwaitExpression(node)) {
    collectRenderedRanges(node.expression, offset, ranges);
  } else if (ts.isStringLiteralLike(node)) {
    ranges.push(literalRange(node, offset));
  } else if (ts.isTemplateExpression(node)) {
    ranges.push(literalRange(node.head, offset));
    for (const span of node.templateSpans) {
      collectRenderedRanges(span.expression, offset, ranges);
      ranges.push(literalRange(span.literal, offset));
    }
  } else if (ts.isConditionalExpression(node)) {
    collectRenderedRanges(node.whenTrue, offset, ranges);
    collectRenderedRanges(node.whenFalse, offset, ranges);
  } else if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) collectRenderedRanges(element, offset, ranges);
  } else if (ts.isBinaryExpression(node)) {
    collectRenderedBinaryRanges(node, offset, ranges);
  }
}

function collectRenderedBinaryRanges(node: ts.BinaryExpression, offset: number, ranges: Range[]): void {
  const kind = node.operatorToken.kind;
  if (kind === ts.SyntaxKind.CommaToken || kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    collectRenderedRanges(node.right, offset, ranges);
    return;
  }
  if (kind === ts.SyntaxKind.PlusToken
    || kind === ts.SyntaxKind.BarBarToken
    || kind === ts.SyntaxKind.QuestionQuestionToken) {
    collectRenderedRanges(node.left, offset, ranges);
    collectRenderedRanges(node.right, offset, ranges);
  }
}

function revealRenderedExpression(expression: string, mask: (value: string) => string): string {
  const prefix = "const __betterDesignValue = (";
  const source = ts.createSourceFile("expression.tsx", `${prefix}${expression});`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const statement = source.statements[0];
  if (!statement || !ts.isVariableStatement(statement)) return mask(expression);
  const initializer = statement.declarationList.declarations[0]?.initializer;
  if (!initializer || !ts.isParenthesizedExpression(initializer)) return mask(expression);
  const ranges: Range[] = [];
  collectRenderedRanges(initializer.expression, prefix.length, ranges);
  // One character array, so many rendered literals cost one pass, not one
  // rebuild of the expression each. [BD-986]
  const chars = [...mask(expression)];
  for (const [rawStart, rawEnd] of ranges) {
    for (let index = Math.max(0, rawStart); index < Math.min(expression.length, rawEnd); index += 1) chars[index] = expression[index];
  }
  const revealed = chars.join("");
  return revealed;
}

/** Characters tag scans may read for one file before it counts as too complex to review. */
interface ScanBudget {
  left: number;
}

function tagEnd(content: string, start: number, budget: ScanBudget): number | null {
  let braces = 0;
  let quote = "";
  let escaped = false;
  for (let index = start + 1; index < content.length; index += 1) {
    // A tag with no end is read to the end of the file, from every opener.
    // Real markup closes its tags, so it stays far inside this budget.
    if (--budget.left < 0) throw new ReviewBudgetExceeded("lint: the file has too many unclosed tags to review");
    const char = content[index];
    if (quote) {
      if (!escaped && char === quote) quote = "";
      escaped = !escaped && char === "\\";
    } else if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") braces += 1;
    else if (char === "}") braces = Math.max(0, braces - 1);
    else if (char === ">" && braces === 0) return index + 1;
  }
  return null;
}

function maskTags(content: string, mask: (value: string) => string): string {
  const pattern = /<\/?[a-z][\w:.-]*/gi;
  const budget: ScanBudget = { left: 4 * content.length + 100_000 };
  let visible = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    const start = match.index;
    const end = tagEnd(content, start, budget);
    if (end === null) continue;
    visible += content.slice(cursor, start) + mask(content.slice(start, end));
    cursor = end;
    pattern.lastIndex = end;
  }
  return visible + content.slice(cursor);
}

function maskTemplateImplementation(content: string, isMdx: boolean): string {
  const mask = (value: string) => value.replace(/[^\r\n]/g, " ");
  // Horizontal space only after each `---`: `\s*` crossed blank lines and
  // backtracked over every run of them. The masked text differs only in the
  // blank lines after the closing `---`, which hold no copy. [BD-986]
  let visible = content.replace(/^---[^\S\r\n\u2028\u2029]*$[\s\S]*?^---[^\S\r\n\u2028\u2029]*$/m, mask);
  if (isMdx) visible = maskMdxEsm(visible, mask);
  // Script and style are code, and pre, code and blockquote hold quoted text
  // such as a patch or a citation, so none of them is authored copy. The
  // artifact copy hook draws the same line. [BD-756]
  visible = maskQuotedRegions(visible, mask);
  visible = maskBlockComments(visible, mask);
  visible = maskTags(visible, mask);
  visible = maskMustache(visible, (value, expression) =>
    mask(value.slice(0, 2)) + revealRenderedExpression(expression, mask) + mask(value.slice(-2)));
  for (let depth = 0; depth < 4; depth += 1) {
    const next = visible.replace(/\{([^{}]*)\}/g, (value, expression: string) =>
      mask(value.slice(0, 1)) + revealRenderedExpression(expression, mask) + mask(value.slice(-1)));
    if (next === visible) break;
    visible = next;
  }
  return visible;
}

/** Runs the tag checks (class rules, img alt, focus) on HTML-like Vue, Svelte, HTML, and MDX markup. */
export function lintTemplateMarkup(input: LintInput, config: LintConfig): Finding[] {
  const findings: Finding[] = [];
  const lines = lineIndex(input.content);
  // A tag's end is the first `>` after its name, as `<([a-z][\w-]*)([^>]*)>`
  // matched. Once no `>` is left, no later tag can end, so the scan stops
  // instead of rescanning the rest of the file from every opener. [BD-986]
  const tagStart = /<([a-z][\w-]*)/gi;
  let tag: RegExpExecArray | null;
  while ((tag = tagStart.exec(input.content))) {
    const end = input.content.indexOf(">", tagStart.lastIndex);
    if (end === -1) break;
    const line = lines.lineAt(tag.index);
    const attrs = input.content.slice(tagStart.lastIndex, end);
    tagStart.lastIndex = end + 1;
    const classValue = /\bclass\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (classValue) findings.push(...classFindings(input, lines, config, classValue, line));
    if (config.rules.wcag?.enabled !== false
      && tag[1].toLowerCase() === "img"
      && !/\balt\s*=/i.test(attrs)) {
      findings.push(sourceFinding(input, lines, line, {
        severity: "critical",
        ruleId: "wcag/img-alt",
        wcag: "1.1.1 (A)",
        message: "<img> is missing an alt attribute.",
        fix: 'Add alt="" for decorative images or descriptive alt text for content images.',
      }));
    }
    if (config.rules.wcag?.enabled !== false
      && classValue?.includes("outline-none")
      && !/focus(?:-visible)?:(?:ring|outline|border|shadow)/.test(classValue)) {
      findings.push(sourceFinding(input, lines, line, {
        severity: "serious",
        ruleId: "wcag/focus-visible",
        wcag: "2.4.7 (AA)",
        message: "outline-none removes the focus indicator without a replacement.",
        fix: "Add an equally visible focus or focus-visible style.",
      }));
    }
  }
  return findings;
}

/**
 * Runs the copy check on the template's visible text. It masks code, quoted
 * text and tags first, which can exceed its scan budget on a file of unclosed
 * tags, so it is kept apart from the tag checks: running out of budget then
 * costs only this check. [BD-986]
 */
export function lintTemplateCopy(input: LintInput, config: LintConfig): Finding[] {
  const findings: Finding[] = [];
  if (config.rules.copy?.enabled !== false) {
    const lines = lineIndex(input.content);
    for (const match of maskTemplateImplementation(input.content, input.path.endsWith(".mdx")).matchAll(/—/g)) {
      findings.push(sourceFinding(input, lines, lines.lineAt(match.index ?? 0), {
        severity: "moderate",
        ruleId: "copy/em-dash",
        message: "Em dash in visible template copy.",
        fix: "Use a comma, a colon, or rephrase the sentence.",
      }));
    }
  }
  return findings;
}

/** Runs deterministic token, motion and side-stripe checks on a stylesheet. */
export function lintStylesheet(input: LintInput, config: LintConfig): Finding[] {
  const findings: Finding[] = [];
  const lines = lineIndex(input.content);
  if (config.rules.semanticTokens?.enabled !== false) {
    // Token declarations define the palette; only literal usage bypasses it.
    const usage = maskBlockComments(input.content, value => value.replace(/[^\r\n]/g, " "))
      .replace(/--[\w-]+\s*:[^;{}]+/g, value => value.replace(/[^\r\n]/g, " "));
    for (const match of usage.matchAll(COLOR)) {
      findings.push(sourceFinding(input, lines, lines.lineAt(match.index ?? 0), {
        severity: "moderate",
        ruleId: "token/hardcoded-color",
        message: `Hardcoded color ${match[0]} bypasses the design-system tokens.`,
        fix: "Replace it with a semantic custom property.",
      }));
    }
    findings.push(...pxLengthStylesheetFindings(input));
  }
  if (config.rules.slop?.enabled !== false) findings.push(...sideStripeStylesheetFindings(input));
  for (const match of input.content.matchAll(/\btransition\s*:\s*all\b/gi)) {
    findings.push(sourceFinding(input, lines, lines.lineAt(match.index ?? 0), {
      severity: "moderate",
      ruleId: "motion/transition-all",
      message: "transition: all animates unrelated properties and makes motion hard to control.",
      fix: "List only the properties that should animate, with a duration and curve for each.",
    }));
  }
  findings.push(...layoutAnimationStylesheetFindings(input));
  return findings;
}
