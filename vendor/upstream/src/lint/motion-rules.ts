import ts from "typescript";
import type { ClassFinding } from "./class-rules";
import { lineIndex, maskBlockComments } from "./template-masks";
import type { Finding, LintInput } from "./types";

// docs/ui/animation-and-motion.md "Animate Transform, Not Layout Properties":
// a transition or keyframe on a layout property re-runs layout on every frame,
// so the motion stutters as soon as the main thread is busy. transform and
// opacity skip layout and paint. The check reads the three static forms an
// agent writes: a stylesheet transition, a @keyframes block, and a Tailwind
// utility such as transition-[width], plus a literal inline style. [BD-1320]

const LAYOUT_ANIMATION_RULE_ID = "motion/layout-property-animation";

// The properties the doc lists, with their min-, max- and logical forms.
// grid-template-rows is left out on purpose: the 0fr to 1fr track is the doc's
// own fix for a height that is not known in advance.
const LAYOUT_PROPERTY_RE = new RegExp(
  "^(?:(?:min-|max-)?(?:width|height|inline-size|block-size)"
  + "|top|right|bottom|left"
  + "|inset(?:-(?:inline|block))?(?:-(?:start|end))?"
  + "|(?:margin|padding)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?"
  + "|font-size)$",
);
const TRANSITION_PROPERTY_RE = /^(?:-?(?:webkit|moz|ms)-?)?transition(?:-?property)?$/i;
// Any variant prefix before the utility, brackets and slashes included, such
// as `data-[state=open]:` or `group-hover/item:`, and an `!` for important.
const TRANSITION_CLASS_RE = /(?:^|\s)(?:\S*:)?!?transition-\[([^\]\s]+)\]/g;
// The one value a keyframe may read for a layout property: a primitive's
// published size, such as `var(--radix-accordion-content-height)`.
const BARE_VAR_RE = /^\s*var\(--[\w-]+\)\s*$/;

const FIX = "Animate transform and opacity instead: translate() to move, scale() for feedback. "
  + "For a size change, scale the box with a counter-scale on the content, transition grid-template-rows from 0fr to 1fr, "
  + "or measure once and play a FLIP.";

/** The layout properties named in a transition value or a Tailwind arbitrary value, in order, once each. */
function layoutTokens(value: string): string[] {
  const seen = new Set<string>();
  for (const token of value.toLowerCase().split(/[\s,_]+/)) {
    if (LAYOUT_PROPERTY_RE.test(token)) seen.add(token);
  }
  return [...seen];
}

function describeList(properties: string[]): string {
  const list = properties.length > 1
    ? `${properties.slice(0, -1).join(", ")} and ${properties[properties.length - 1]}`
    : properties[0];
  return `${list}, ${properties.length > 1 ? "layout properties" : "a layout property"}`;
}

function finding(subject: string, properties: string[]): ClassFinding {
  return {
    severity: "moderate",
    ruleId: LAYOUT_ANIMATION_RULE_ID,
    message: `${subject} animates ${describeList(properties)}, so each frame re-runs layout and the motion stutters when the main thread is busy.`,
    fix: FIX,
  };
}

/** Flags a Tailwind arbitrary transition such as `transition-[width]`. The named utilities never name a layout property. */
export function layoutTransitionClassFindings(className: string): ClassFinding[] {
  const findings: ClassFinding[] = [];
  for (const match of className.matchAll(TRANSITION_CLASS_RE)) {
    const properties = layoutTokens(match[1]);
    if (properties.length > 0) findings.push(finding(`"${match[0].trim()}"`, properties));
  }
  return findings;
}

/** Flags a literal `transition` or `transitionProperty` in an inline style object that names a layout property. */
export function layoutTransitionStyleFindings(style: ts.ObjectLiteralExpression): ClassFinding[] {
  const findings: ClassFinding[] = [];
  for (const property of style.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : "";
    if (!TRANSITION_PROPERTY_RE.test(name)) continue;
    const value = literalText(property.initializer);
    const properties = layoutTokens(value);
    if (properties.length > 0) findings.push(finding(`style.${name}`, properties));
  }
  return findings;
}

/** The text of a string or template literal, with each substitution left out, or "" for anything else. */
function literalText(node: ts.Expression): string {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ");
  return "";
}

/** Keeps every offset and line break while blanking comments and url() payloads. */
function maskCss(content: string): string {
  const blank = (value: string) => value.replace(/[^\r\n]/g, " ");
  return maskBlockComments(content, blank).replace(/url\([^)]*\)/gi, blank);
}

/** The index just past the `}` that closes a block opened at `start`, or the end of the text. */
function blockEnd(text: string, start: number): number {
  let depth = 1;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    else if (text[index] === "}" && (depth -= 1) === 0) return index;
  }
  return text.length;
}

/** Each declaration in a run of CSS as its property, value and offset. A run that ends in `{` is a selector or a prelude. */
function* declarations(text: string, from = 0, to = text.length): Generator<[property: string, value: string, index: number]> {
  for (const segment of text.slice(from, to).matchAll(/[^;{}]*[;{}]?/g)) {
    const statement = segment[0];
    if (!statement || statement.endsWith("{")) continue;
    const colon = statement.indexOf(":");
    if (colon < 0) continue;
    // The run starts right after the previous `;`, so the offset moves to the property's own line.
    const lead = statement.length - statement.trimStart().length;
    yield [statement.slice(0, colon).trim().toLowerCase(), statement.slice(colon + 1).replace(/[;}]$/, ""), from + (segment.index ?? 0) + lead];
  }
}

/**
 * Flags a stylesheet transition or @keyframes block that animates a layout
 * property, one finding per declaration, `@apply` or block. A keyframes block
 * whose layout property is a bare `var()` is the primitive pattern the doc
 * prefers, such as an accordion animating to its published content height, so
 * it is left alone.
 */
export function layoutAnimationStylesheetFindings(input: LintInput): Finding[] {
  const text = maskCss(input.content);
  const lines = lineIndex(input.content);
  const findings: Finding[] = [];
  const push = (index: number, item: ClassFinding) => {
    const line = lines.lineAt(index);
    findings.push({ file: input.path, line, snippet: lines.snippet(line), kind: "measured-source", ...item });
  };
  for (const [property, value, index] of declarations(text)) {
    if (!TRANSITION_PROPERTY_RE.test(property)) continue;
    const properties = layoutTokens(value);
    if (properties.length > 0) push(index, finding(property, properties));
  }
  for (const match of text.matchAll(/@apply\s+([^;{}]+)/gi)) {
    for (const item of layoutTransitionClassFindings(match[1])) push(match.index ?? 0, item);
  }
  for (const match of text.matchAll(/@(?:-webkit-)?keyframes\s+([^\s{]+)\s*\{/gi)) {
    const start = (match.index ?? 0) + match[0].length;
    const readsVar = new Map<string, boolean>();
    for (const [property, value] of declarations(text, start, blockEnd(text, start))) {
      if (LAYOUT_PROPERTY_RE.test(property)) readsVar.set(property, (readsVar.get(property) ?? false) || BARE_VAR_RE.test(value));
    }
    const properties = [...readsVar].filter(([, fromVar]) => !fromVar).map(([property]) => property);
    if (properties.length > 0) push(match.index ?? 0, finding(`@keyframes ${match[1]}`, properties));
  }
  return findings;
}
