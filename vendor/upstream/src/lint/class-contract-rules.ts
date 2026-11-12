import ts from "typescript";
import { COLOR_UTILITY_PREFIXES, type ClassFinding } from "./class-rules";
import { styleCategory, type ComponentVariants, type ProjectContext } from "./project-context";

// The class contract checks from ADR 0007: a component restyled from outside,
// raw palette colours, arbitrary values the scale already has, static inline
// styles, and class names built from a variable. Each reads static source
// only and stays quiet when it cannot be sure. `class/unknown` needs the
// project's Tailwind, so the CLI runs it separately. [BD-817]

// The neutral families and white or black stay with token/raw-palette.
const PALETTE_FAMILIES =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const RAW_COLOR_RE = new RegExp(
  `(?:^|\\s)((?:[^\\s:]+:)*(?:${COLOR_UTILITY_PREFIXES})-((?:${PALETTE_FAMILIES})-(?:50|[1-9]00|950)))(?:\\/\\d{1,3})?(?=\\s|$)`,
  "g",
);

function quoted(values: string[]): string {
  return values.map((value) => `"${value}"`).join(", ");
}

/**
 * Flags palette classes outside the neutral families, such as bg-emerald-500,
 * and names the theme's own colour tokens as the replacement.
 */
export function rawColorFindings(className: string, context: ProjectContext | null): ClassFinding[] {
  const raw = [...className.matchAll(RAW_COLOR_RE)]
    .filter((match) => !context?.colorTokens.has(match[2]))
    .map((match) => match[1]);
  if (raw.length === 0) return [];
  const tokens = [...(context?.colorTokens ?? [])].filter((token) => !/-\d+$/.test(token)).slice(0, 8);
  return [{
    severity: "serious",
    ruleId: "class/raw-color",
    message: `${quoted(raw)} uses the raw Tailwind palette, outside the theme.`,
    fix: tokens.length > 0
      ? `Use a theme colour (${tokens.join(", ")}), or declare --color-<name> in the theme when the brand really needs a new colour.`
      : "Use a semantic theme colour such as primary, accent or destructive, or declare --color-<name> in the theme.",
  }];
}

const TEXT_SIZES: Array<[number, string]> = [
  [0.75, "xs"], [0.875, "sm"], [1, "base"], [1.125, "lg"], [1.25, "xl"], [1.5, "2xl"],
  [1.875, "3xl"], [2.25, "4xl"], [3, "5xl"], [3.75, "6xl"], [4.5, "7xl"], [6, "8xl"], [8, "9xl"],
];
const SPACING_UTILITY =
  "-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|w|h|size|min-w|min-h|inset(?:-[xy])?|top|right|bottom|left)";
const ARBITRARY_REM_RE = new RegExp(`(?:^|\\s)((?:[^\\s:]+:)*)(${SPACING_UTILITY}|text)-\\[(\\d*\\.?\\d+)rem\\](?=\\s|$)`, "g");

// Tailwind v4 spaces its scale in quarter rems, so p-3 is 0.75rem.
function scaleClass(utility: string, rem: number): string | null {
  if (utility === "text") {
    const size = TEXT_SIZES.find(([value]) => value === rem);
    return size ? `text-${size[1]}` : null;
  }
  const step = rem / 0.25;
  if (!Number.isInteger(step)) return null;
  return `${utility}-${step}`;
}

/**
 * Flags an arbitrary rem value on a spacing, size or text utility when the
 * scale already has that step, such as p-[0.75rem] for p-3. A value off the
 * scale is left alone: it may be deliberate, and there is no class to name.
 */
export function arbitraryValueFindings(className: string): ClassFinding[] {
  const swaps: string[] = [];
  for (const match of className.matchAll(ARBITRARY_REM_RE)) {
    const replacement = scaleClass(match[2], Number.parseFloat(match[3]));
    if (replacement) swaps.push(`"${match[0].trim()}" is "${match[1]}${replacement}"`);
  }
  if (swaps.length === 0) return [];
  return [{
    severity: "moderate",
    ruleId: "class/arbitrary-value",
    message: "An arbitrary value repeats a step the scale already has.",
    fix: `Use the scale class: ${swaps.join(", ")}.`,
  }];
}

/**
 * Flags classes on a component that set a style its own variants already set,
 * such as p-4 on a Button whose size variant owns its padding, and names the
 * axis and values to use instead. Layout classes such as margin and width stay
 * allowed.
 */
export function restyleFindings(component: ComponentVariants, className: string): ClassFinding[] {
  const clashes = new Map<string, string[]>();
  for (const cls of className.split(/\s+/).filter(Boolean)) {
    const category = styleCategory(cls);
    const owners = category ? component.owners.get(category) : undefined;
    if (!owners) continue;
    for (const owner of owners) clashes.set(owner, [...(clashes.get(owner) ?? []), cls]);
  }
  if (clashes.size === 0) return [];
  const restyled = [...new Set([...clashes.values()].flat())];
  const axes = [...clashes.keys()].filter((owner) => owner !== "base");
  const choices = axes.map((axis) => `${axis} (${(component.axes.get(axis) ?? []).join(", ")})`);
  return [{
    severity: "serious",
    ruleId: "class/restyle",
    message: `${quoted(restyled)} restyles ${component.name}, which already sets that style itself.`,
    fix: choices.length > 0
      ? `Pick a ${component.name} ${choices.join(" or ")} instead. If none fits, add a variant to the component.`
      : `Drop the class, or add a variant to ${component.name} if the design needs a new look.`,
  }];
}

const CSS_COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(/;

function literalText(expression: ts.Expression): string | null {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression) || ts.isNumericLiteral(expression)) {
    return expression.text;
  }
  return null;
}

function isColorVariable(property: ts.PropertyAssignment): boolean {
  const value = literalText(property.initializer);
  return property.name.getText().replace(/["']/g, "").startsWith("--") && value !== null && CSS_COLOR_RE.test(value);
}

/**
 * Flags a style={{ ... }} object whose values are all fixed, which a class
 * could express, and any colour written into a custom property. Values
 * computed at run time, such as a measured width, stay allowed.
 */
export function inlineStyleFindings(style: ts.ObjectLiteralExpression): ClassFinding[] {
  const findings: ClassFinding[] = [];
  const assignments = style.properties.filter(ts.isPropertyAssignment);
  const colorVariables = assignments.filter(isColorVariable);
  if (colorVariables.length > 0) {
    findings.push({
      severity: "serious",
      ruleId: "class/inline-style",
      message: `A colour is written into ${colorVariables.map((property) => property.name.getText()).join(", ")} inline, outside the theme.`,
      fix: "Declare the colour as a theme token in the stylesheet and use its class.",
    });
  }
  const allFixed = assignments.length > 0
    && assignments.length === style.properties.length
    && assignments.every((property) => literalText(property.initializer) !== null);
  if (allFixed && colorVariables.length < assignments.length) {
    findings.push({
      severity: "moderate",
      ruleId: "class/inline-style",
      message: "An inline style holds only fixed values, which the design system's classes can express.",
      fix: "Move the values into classes from the scale and theme. Keep inline styles for values computed at run time.",
    });
  }
  return findings;
}

function templateFragments(template: ts.TemplateExpression): string[] {
  const pieces = [template.head.text, ...template.templateSpans.map((span) => span.literal.text)];
  const fragments: string[] = [];
  for (let index = 0; index < pieces.length - 1; index += 1) {
    if (/[\w-]$/.test(pieces[index]) || /^[\w-]/.test(pieces[index + 1])) {
      fragments.push(`${pieces[index].split(/\s+/).pop()}\${…}${pieces[index + 1].split(/\s+/)[0]}`);
    }
  }
  return fragments;
}

/**
 * Flags a class name assembled from a variable, such as `bg-${tone}-500`.
 * Tailwind never sees the finished class, so it generates no CSS for it, and
 * no other check can read it. A whole class chosen by a condition is fine.
 */
export function dynamicClassFindings(expression: ts.Expression, cssClasses: Set<string> = new Set()): ClassFinding[] {
  const fragments: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTemplateExpression(node)) fragments.push(...templateFragments(node));
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = literalText(node.left);
      if (left !== null && /[\w-]$/.test(left) && literalText(node.right) === null) {
        fragments.push(`${left.split(/\s+/).pop()} + …`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  const unresolved = fragments.filter(fragment => {
    const [prefix, suffix = ""] = fragment.split(/\$\{…\}| \+ …/);
    // shortcut: selector families do not prove every runtime value; verify rendered variants.
    return ![...cssClasses].some(name => name.startsWith(prefix) && name.endsWith(suffix));
  });
  if (unresolved.length === 0) return [];
  return [{
    severity: "moderate",
    ruleId: "class/dynamic",
    message: `${quoted(unresolved)} builds a class name from a variable, so Tailwind never generates it.`,
    fix: "Map each value to a complete class in a lookup object, or use a component variant.",
  }];
}
