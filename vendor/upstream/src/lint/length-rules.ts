import type { ClassFinding } from "./class-rules";
import type { Finding, LintInput } from "./types";

// review-rules.md "Lengths in px": every length is rem or a step from the
// system scale. A px length ignores the reader's font setting and skips the
// scale. Media and container queries measure the device, not the design, so
// their px stay; so do SVG attributes and the maths a script does at run time,
// which never reach these checks because only class strings, static style
// values, and stylesheet declarations are read. [BD-918]

// `_` stands for a space inside a Tailwind arbitrary value, so it may sit on
// either side of a length, which rules out `\w` and `\b` as the boundary.
// A leading minus stays in the match so the advice keeps the sign.
const PX_RE = /(?<![a-z0-9.])-?(?:\d+\.?\d*|\.\d+)px(?![a-z0-9])/gi;
// A quoted payload, such as `content: "12px"` or a file name inside url(''),
// is text, not a length.
const QUOTED_RE = /"[^"\n]*"|'[^'\n]*'/g;
// React appends px to every non-zero number in a style object except these
// properties and custom properties. Copied from react-dom 19.2.7.
const REACT_UNITLESS = new Set(
  ("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex "
    + "boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative "
    + "flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan "
    + "gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom "
    + "fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity "
    + "strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount "
    + "msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn "
    + "msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup "
    + "WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive "
    + "WebkitFlexShrink WebkitLineClamp").split(" "),
);
// Statements that hold a media query rather than a length.
const QUERY_STATEMENT_RE = /^(?:@(?:custom-media|custom-variant|import)\b|--breakpoint-)/i;

/** Returns the non-zero px lengths in a value. `0px` is zero in any unit. */
function pxMatches(value: string): RegExpMatchArray[] {
  const unquoted = value.replace(QUOTED_RE, (quoted) => " ".repeat(quoted.length));
  return [...unquoted.matchAll(PX_RE)].filter((match) => Number.parseFloat(match[0]) !== 0);
}

function pxValues(value: string): string[] {
  return pxMatches(value).map((match) => match[0]);
}

function toRem(length: string): string {
  return `${Number((Number.parseFloat(length) / 16).toFixed(4))}rem`;
}

/** One finding for every labelled value that holds a px length, or none. */
function pxFindings(values: ReadonlyArray<readonly [label: string, value: string]>): ClassFinding[] {
  const offenders = values.filter(([, value]) => pxValues(value).length > 0);
  if (offenders.length === 0) return [];
  const subjects = offenders.map(([label]) => label);
  const unique = [...new Set(offenders.flatMap(([, value]) => pxValues(value)))];
  return [{
    severity: "serious",
    ruleId: "token/px-length",
    message: `${subjects.join(", ")} uses px. A px length ignores the reader's font setting and skips the scale.`,
    fix: `Use rem or a step from the design system's scale: ${unique.map((length) => `${length} is ${toRem(length)}`).join(", ")}.`,
  }];
}

/** Drops variant prefixes such as `md:` or `min-[640px]:`, which hold queries, not lengths. */
function utilityPart(token: string): string {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < token.length; index += 1) {
    const char = token[index];
    if (char === "[" || char === "(") depth += 1;
    else if (char === "]" || char === ")") depth = Math.max(0, depth - 1);
    else if (char === ":" && depth === 0) start = index + 1;
  }
  return token.slice(start);
}

// An arbitrary Tailwind length such as `w-[140px]` or `max-w-[15rem]`.
const ARBITRARY_LENGTH_RE = /-\[-?(?:\d+\.?\d*|\.\d+)(px|rem)\]/g;

// Below this many px values the project has no settled habit to defer to.
const MIN_HOUSE_PX = 10;

/**
 * True when a project's own sources write arbitrary Tailwind lengths in px
 * more often than in rem. The review then keeps the product's convention and
 * stops asking for rem: Inkeep's UI writes `w-[140px]` 166 times and rem 9.
 */
export function pxIsHouseStyle(samples: readonly LintInput[]): boolean {
  let px = 0;
  let rem = 0;
  for (const sample of samples) {
    for (const match of sample.content.matchAll(ARBITRARY_LENGTH_RE)) {
      if (match[1] === "px") px += 1;
      else rem += 1;
    }
  }
  return px >= MIN_HOUSE_PX && px > rem;
}

/** Flags Tailwind arbitrary values written in px, such as `text-[11px]` or `shadow-[0_1px_2px_black]`. */
export function pxLengthClassFindings(className: string): ClassFinding[] {
  return pxFindings(className.split(/\s+/).map((token) => {
    const utility = utilityPart(token);
    return [`"${token}"`, utility.includes("[") ? utility : ""] as const;
  }));
}

/** Returns the CSS React renders for a number in a style object: px, except on unitless and custom properties. */
export function reactStyleNumberCss(property: string, value: number): string {
  if (property.startsWith("--") || REACT_UNITLESS.has(property)) return String(value);
  return `${value}px`;
}

/** Flags px lengths in the literal values of an inline style object, given as property and CSS value pairs. */
export function pxLengthStyleFindings(entries: ReadonlyArray<readonly [property: string, value: string]>): ClassFinding[] {
  return pxFindings(entries.map(([property, value]) => [`style.${property}`, value] as const));
}

/** Keeps every offset and line break while blanking comments and url() payloads. */
function maskIgnoredCss(content: string): string {
  const blank = (value: string) => value.replace(/[^\r\n]/g, " ");
  return content.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/url\([^)]*\)/gi, blank);
}

/**
 * Flags px lengths in a stylesheet, one finding per declaration. Selectors and
 * at-rule preludes such as `@media (min-width: 640px)` precede a `{` and are
 * never read, and `--breakpoint-*` tokens and `@custom-media` hold queries.
 */
export function pxLengthStylesheetFindings(input: LintInput): Finding[] {
  const text = maskIgnoredCss(input.content);
  const lines = input.content.split(/\r?\n/);
  const findings: Finding[] = [];
  // Each match is one run of text up to a `;`, `{` or `}`. A run that ends in
  // `{` is a selector or an at-rule prelude, never a declaration.
  for (const segment of text.matchAll(/[^;{}]*[;{}]?/g)) {
    const statement = segment[0];
    if (!statement || statement.endsWith("{") || QUERY_STATEMENT_RE.test(statement.trim())) continue;
    const [first] = pxMatches(statement);
    if (!first) continue;
    const line = text.slice(0, (segment.index ?? 0) + (first.index ?? 0)).split(/\r?\n/).length;
    const [finding] = pxFindings([[`"${statement.trim().split(":")[0].trim()}"`, statement]]);
    findings.push({
      file: input.path,
      line,
      snippet: lines[line - 1]?.trim() ?? "",
      kind: "measured-source",
      ...finding,
    });
  }
  return findings;
}
