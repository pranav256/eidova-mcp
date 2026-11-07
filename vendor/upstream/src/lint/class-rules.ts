import type { Finding } from "./types";

// Deterministic className checks ported from docs/review-rules.md
// ("Generated-layout tells") and the semantic-token rules the design systems
// ship with. Each rule matches static class strings only: a conservative
// matcher that never cries wolf beats full coverage, because these findings
// feed straight back to an agent as errors.

/**
 * A finding before the engine anchors it to a file position. Class rules see
 * only the class string, so the caller supplies file, line, and snippet.
 */
export type ClassFinding = Pick<Finding, "severity" | "ruleId" | "message" | "fix">;

const UPPERCASE_RE = /(?:^|\s)uppercase(?:\s|$)/;
const WIDE_TRACKING_RE = /(?:^|\s)tracking-(?:wide|wider|widest)(?:\s|$)/;
const LEFT_BORDER_RE = /(?:^|\s)border-l-(?:2|4|8)(?:\s|$)/;
// The same bar, painted two other ways. An inset shadow whose only non-zero
// value is the horizontal offset draws a left edge and nothing else, and a
// positioned pseudo-element pinned to the left edge at a hairline width is the
// hand-rolled version. Reading only `border-l-*` let both ship. [BD-574]
// Positive offsets only. A negative horizontal offset draws the bar down the
// RIGHT edge, which is a different shape and not this tell.
const INSET_STRIPE_RE = /(?:^|\s)shadow-\[inset_[1-9]\d*(?:px|rem)?(?:_0(?:px|rem)?){2,3}_/;
const PSEUDO_ABSOLUTE_RE = /(?:^|\s)(?:before|after):absolute(?:\s|$)/;
const PSEUDO_LEFT_RE = /(?:^|\s)(?:before|after):left-0(?:\s|$)/;
// A stripe is 1px to 6px wide. Zero draws nothing and 100px is a panel, so an
// arbitrary width is read as a number and held to that range.
const PSEUDO_ARBITRARY_WIDTH_RE = /(?:^|\s)(?:before|after):w-\[([0-9.]+)px\](?:\s|$)/;
const PSEUDO_TOKEN_WIDTH_RE = /(?:^|\s)(?:before|after):w-(?:0\.5|1|1\.5)(?:\s|$)/;

function hasHairlineWidth(className: string): boolean {
  if (PSEUDO_TOKEN_WIDTH_RE.test(className)) return true;
  const arbitrary = className.match(PSEUDO_ARBITRARY_WIDTH_RE);
  if (!arbitrary) return false;
  const width = Number.parseFloat(arbitrary[1]);
  return Number.isFinite(width) && width > 0 && width <= 6;
}
// Any filled background counts, semantic tokens included: a left-stripe box
// is the tell regardless of which surface color fills it.
const FILLED_BG_RE = /(?:^|\s)bg-(?!transparent|none)[a-z]/;
const GRADIENT_TEXT_RE = /(?:^|\s)bg-clip-text(?:\s|$)/;
const TRANSPARENT_TEXT_RE = /(?:^|\s)text-transparent(?:\s|$)/;
const DARK_VARIANT_RE = /(?:^|\s)dark:/;
// A leading `(?:[\w-]+:)*` accepts variant prefixes, so `hover:bg-white` and
// `md:dark:text-gray-500` are caught alongside the bare utility.
/**
 * The utilities that take a colour. token/raw-palette reads them for the
 * neutral families and class/raw-color for the colourful ones, so one list
 * keeps the two rules covering the same classes. [BD-817]
 */
export const COLOR_UTILITY_PREFIXES =
  "bg|text|border(?:-[xytrblse])?|ring|ring-offset|divide|fill|stroke|outline|decoration|accent|caret|placeholder|from|via|to|shadow";
const RAW_PALETTE_RE = new RegExp(
  `(?:^|\\s)(?:[\\w-]+:)*(?:${COLOR_UTILITY_PREFIXES})-(?:white|black|(?:neutral|gray|slate|zinc|stone)-\\d{2,3})(?:\\/\\d{1,3})?(?:\\s|$)`,
);

/**
 * Flags the generated-UI tells that live in a class string: letter-spaced
 * capital labels, left-stripe boxes and nav items, and gradient-filled text.
 * The border and pseudo-element stripes need two signals together, so an
 * ordinary uppercase label or a plain left border never trips it; an inset
 * shadow offset only horizontally needs no second signal, because it draws a
 * left edge bar and has no other use.
 */
export function slopClassFindings(className: string): ClassFinding[] {
  const findings: ClassFinding[] = [];

  if (UPPERCASE_RE.test(className) && WIDE_TRACKING_RE.test(className)) {
    findings.push({
      severity: "serious",
      ruleId: "slop/letter-spaced-caps",
      message:
        "Letter-spaced capital labels are a generated-UI tell and cost legibility at small sizes.",
      fix: "Use sentence case at the design system's own label size and muted color. Keep font-mono for code, IDs, and aligned figures.",
    });
  }

  const borderStripe = LEFT_BORDER_RE.test(className) && FILLED_BG_RE.test(className);
  const insetStripe = INSET_STRIPE_RE.test(className);
  const pseudoStripe = PSEUDO_ABSOLUTE_RE.test(className)
    && PSEUDO_LEFT_RE.test(className)
    && hasHairlineWidth(className);
  if (borderStripe || insetStripe || pseudoStripe) {
    findings.push({
      severity: "serious",
      ruleId: "slop/left-border-callout",
      message:
        "A colored bar down the left edge is a documented AI-slop tell, in a callout box and on an active nav item alike.",
      fix: "Carry the state with the surface itself: the design system's own selected fill, weight, or text color. Never a side stripe, whether drawn with border-l, an inset shadow, or a pinned pseudo-element.",
    });
  }

  if (GRADIENT_TEXT_RE.test(className) && TRANSPARENT_TEXT_RE.test(className)) {
    findings.push({
      severity: "moderate",
      ruleId: "slop/gradient-text",
      message: "Gradient-filled text is a generated-UI tell and hurts contrast.",
      fix: "Use a solid foreground token (text-foreground or text-primary) for headings and labels.",
    });
  }

  return findings;
}

/**
 * Flags styling that bypasses the design system's semantic tokens: hand-written
 * `dark:` theme forks and raw palette classes such as `bg-white` or
 * `text-gray-500`.
 */
export function semanticTokenClassFindings(className: string): ClassFinding[] {
  const findings: ClassFinding[] = [];

  if (DARK_VARIANT_RE.test(className)) {
    findings.push({
      severity: "moderate",
      ruleId: "token/dark-variant",
      message:
        "dark: variants fork the theme by hand; semantic tokens already resolve per theme.",
      fix: "Use semantic tokens (bg-background, text-foreground, border-border) and drop the dark: fork.",
    });
  }

  const raw = className.match(RAW_PALETTE_RE);
  if (raw) {
    findings.push({
      severity: "serious",
      ruleId: "token/raw-palette",
      message: `Raw palette class "${raw[0].trim()}" bypasses the design system's semantic tokens.`,
      fix: "Replace with a semantic token: bg-background, bg-card, text-foreground, text-muted-foreground, border-border.",
    });
  }

  return findings;
}

/**
 * Reports whether a class string styles its element as a kicker: uppercase, or
 * tiny text with wide tracking. Tight tracking stays exempt so an ordinary
 * byline never flags. The engine pairs this with a heading-sibling check to
 * find labels placed above titles.
 */
export function looksLikeKickerLabel(className: string): boolean {
  if (UPPERCASE_RE.test(className)) return true;
  return /(?:^|\s)text-(?:xs|sm)(?:\s|$)/.test(className) && WIDE_TRACKING_RE.test(className);
}
