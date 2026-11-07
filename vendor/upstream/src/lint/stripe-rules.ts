import type { Finding, LintInput } from "./types";

const LENGTH = String.raw`(-?[\d.]+)(px|rem|em)?`;
const BORDER_LEFT_RE = new RegExp(String.raw`border-(?:left|inline-start)\s*:\s*${LENGTH}\s+(?:solid|double)\s+([^;]+)`, "i");
const BORDER_LEFT_COLOR_RE = /border-(?:left|inline-start)-color\s*:\s*([^;]+)/i;
const INSET_STRIPE_RE = new RegExp(String.raw`inset\s+${LENGTH}\s+0(?:px|rem|em)?\s+0(?:px|rem|em)?(?:\s|;|$|[a-z(])`, "i");
const PSEUDO_SELECTOR_RE = /::?(?:before|after)\b/i;

/** A CSS length in px, with rem and em at 16px. */
function toPx(value: string, unit: string | undefined): number {
  const n = Math.abs(Number(value));
  return unit === "rem" || unit === "em" ? n * 16 : n;
}

function isClear(color: string): boolean {
  return /^\s*(?:transparent|none|inherit|initial|unset|currentcolor)\b/i.test(color);
}

function declaration(body: string, property: string): string | undefined {
  return new RegExp(String.raw`(?:^|;)\s*${property}\s*:\s*([^;]+)`, "i").exec(body)?.[1]?.trim();
}

/** True when a rule paints a coloured bar down an element's left edge. */
function paintsSideStripe(selector: string, body: string): boolean {
  const border = BORDER_LEFT_RE.exec(body);
  if (border && toPx(border[1], border[2]) >= 2 && !isClear(border[3])) return true;
  const borderColor = BORDER_LEFT_COLOR_RE.exec(body);
  if (borderColor && !isClear(borderColor[1])) return true;
  const inset = INSET_STRIPE_RE.exec(body);
  if (inset && toPx(inset[1], inset[2]) > 0) return true;
  if (!PSEUDO_SELECTOR_RE.test(selector)) return false;
  const width = /^([\d.]+)(px|rem|em)?$/.exec(declaration(body, "width") ?? "");
  return declaration(body, "position") === "absolute"
    && /^0(?:px|rem|em)?$/.test(declaration(body, "left") ?? "")
    && width !== null
    && toPx(width[1], width[2]) >= 1
    && toPx(width[1], width[2]) <= 4;
}

/**
 * Flags two generated-UI tells written in plain CSS: letter-spaced capitals,
 * and a side stripe: a coloured left border, a
 * left-only inset shadow, or a thin pseudo-element pinned to the left edge. The
 * class check already catches the Tailwind forms; agents that write a
 * stylesheet or one HTML page shipped it on selected rows and active nav items,
 * where it bends with the rounded corner. [BD-1157]
 */
export function sideStripeStylesheetFindings(input: LintInput): Finding[] {
  const css = input.content;
  const lines = css.split(/\r?\n/);
  const lineStarts = [0];
  for (let i = 0; i < css.length; i++) if (css[i] === "\n") lineStarts.push(i + 1);
  const findings: Finding[] = [];
  // One pass over the braces, never a regex: a long run without braces made a
  // backtracking rule pattern quadratic. A body is the text between a `{` and
  // the next `}` with no brace between, so a nested at-rule yields its inner
  // rules. [BD-1157]
  let boundary = -1;
  let open = -1;
  let selector = "";
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch !== "{" && ch !== "}") continue;
    if (ch === "{") {
      selector = css.slice(boundary + 1, i).trim();
      open = i;
    } else if (open === boundary && selector && !selector.startsWith("@")) {
      const body = css.slice(open + 1, i);
      const line = lineOf(lineStarts, open);
      if (paintsSideStripe(selector, body)) findings.push(stripeFinding(input, lines, line, selector));
      if (letterSpacedCaps(body)) findings.push(capsFinding(input, lines, line, selector));
    }
    boundary = i;
  }
  return findings;
}

/** True when a rule sets capital letters with positive letter spacing. */
function letterSpacedCaps(body: string): boolean {
  if (declaration(body, "text-transform") !== "uppercase") return false;
  const spacing = /^([\d.]+)(em|rem|px)?$/.exec(declaration(body, "letter-spacing") ?? "");
  return spacing !== null && Number(spacing[1]) > 0;
}

function quoted(selector: string): string {
  return selector.length > 120 ? `${selector.slice(0, 117)}...` : selector;
}

function capsFinding(input: LintInput, lines: string[], line: number, selector: string): Finding {
  return {
    file: input.path,
    line,
    snippet: lines[line - 1]?.trim() ?? "",
    kind: "measured-source",
    severity: "serious",
    ruleId: "slop/letter-spaced-caps",
    message: `Letter-spaced capital labels in \`${quoted(selector)}\` are a generated-UI tell and cost legibility at small sizes.`,
    fix: "Use sentence case at the design system's own label size and muted colour.",
  };
}

/** The 1-based line holding a character, by binary search over line starts. */
function lineOf(lineStarts: number[], index: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (lineStarts[mid] <= index) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}

function stripeFinding(input: LintInput, lines: string[], line: number, selector: string): Finding {
  return {
    file: input.path,
    line,
    snippet: lines[line - 1]?.trim() ?? "",
    kind: "measured-source",
    severity: "serious",
    ruleId: "slop/left-border-callout",
    message: `A coloured bar down the left edge of \`${quoted(selector)}\` is a documented AI tell, on a callout, a selected row and an active nav item alike.`,
    fix: "Carry the state with the surface itself: the design system's own selected fill, weight or text colour. Never a side stripe.",
  };
}
