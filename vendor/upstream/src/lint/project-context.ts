import ts from "typescript";
import { maskBlockComments } from "./template-masks";
import type { LintInput } from "./types";

// Reads the two facts the class checks need from a project: which colour
// tokens its theme declares, and which variant axes its components expose.
// Pure functions over file text, so the CLI, the hook and a test can feed them
// the same way. Decision: docs/adr/0007-review-reimplements-class-checks.md.
// [BD-817]

/** A style a class sets, such as padding or radius. Layout classes have none. */
export type StyleCategory =
  | "padding"
  | "height"
  | "font-size"
  | "font-weight"
  | "radius"
  | "background"
  | "text-color"
  | "border"
  | "shadow"
  | "gap";

/** One component's variant axes and the styles it already sets. */
export interface ComponentVariants {
  /** The component the variants belong to, such as "Button". */
  name: string;
  /** Each axis with its values, such as size: default, sm, lg. */
  axes: Map<string, string[]>;
  /** Which axis sets each style. "base" holds the classes every variant shares. */
  owners: Map<StyleCategory, string[]>;
}

/** What the class checks know about the project the reviewed files belong to. */
export interface ProjectContext {
  /** Colour names the theme declares, without the --color- prefix. */
  colorTokens: Set<string>;
  /** Components with variants, by component name. */
  components: Map<string, ComponentVariants>;
  /** Literal selectors supplied in the project's CSS, outside comments and strings. */
  cssClasses?: Set<string>;
}

/** Project files the CLI hands the engine next to the files under review. */
export interface ProjectInputs {
  /** The stylesheet components.json names, plus any file it imports. */
  theme: LintInput[];
  /** The component files in the project's UI folder. */
  components: LintInput[];
}

const VARIANT_PREFIX_RE = /^(?:[^:[\]]+:|\[[^\]]*\]:)*/;

const CATEGORY_PATTERNS: Array<[StyleCategory, RegExp]> = [
  ["padding", /^-?p[xytrblse]?-/],
  ["height", /^(?:h|min-h|max-h|size)-/],
  ["font-size", /^text-(?:xs|sm|base|lg|[2-9]?xl)(?:\/|$)/],
  ["font-weight", /^font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/],
  ["radius", /^rounded(?:-|$)/],
  ["background", /^bg-/],
  ["text-color", /^text-(?!(?:left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$)/],
  ["border", /^border(?:-|$)/],
  ["shadow", /^shadow(?:-|$)/],
  ["gap", /^gap-/],
];

/**
 * Names the style a class sets, or null for layout classes such as margin,
 * width or flex, which a caller may always add to a component.
 */
export function styleCategory(className: string): StyleCategory | null {
  const utility = className.replace(VARIANT_PREFIX_RE, "").replace(/^!/, "");
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(utility)) return category;
  }
  return null;
}

/** Lists the colour names a Tailwind v4 stylesheet declares inside its @theme blocks. */
export function readThemeColorTokens(css: string): Set<string> {
  const tokens = new Set<string>();
  const themeRe = /@theme\b[^{]*\{/g;
  for (const match of css.matchAll(themeRe)) {
    let depth = 1;
    let index = match.index + match[0].length;
    const start = index;
    while (index < css.length && depth > 0) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}") depth -= 1;
      index += 1;
    }
    for (const declaration of css.slice(start, index).matchAll(/--color-([\w-]+)\s*:/g)) {
      tokens.add(declaration[1]);
    }
  }
  return tokens;
}

function classesIn(node: ts.Node): string[] {
  const classes: string[] = [];
  const visit = (current: ts.Node): void => {
    if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
      classes.push(...current.text.split(/\s+/).filter(Boolean));
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return classes;
}

function propertyNamed(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && property.name.getText() === name) return property.initializer;
  }
  return undefined;
}

function propertyKey(property: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(property)) return null;
  const name = property.name;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function addOwner(owners: Map<StyleCategory, string[]>, classes: string[], owner: string): void {
  for (const className of classes) {
    const category = styleCategory(className);
    if (!category) continue;
    const list = owners.get(category) ?? [];
    if (!list.includes(owner)) list.push(owner);
    owners.set(category, list);
  }
}

// shadcn names the variants after the component: buttonVariants styles Button.
function componentNameFor(variable: string): string | null {
  const match = /^(\w+?)Variants$/.exec(variable);
  if (!match) return null;
  return match[1][0].toUpperCase() + match[1].slice(1);
}

function readAxes(options: ts.ObjectLiteralExpression, owners: Map<StyleCategory, string[]>): Map<string, string[]> {
  const axes = new Map<string, string[]>();
  const variants = propertyNamed(options, "variants");
  if (!variants || !ts.isObjectLiteralExpression(variants)) return axes;
  for (const axis of variants.properties) {
    const axisName = propertyKey(axis);
    if (!axisName || !ts.isPropertyAssignment(axis) || !ts.isObjectLiteralExpression(axis.initializer)) continue;
    axes.set(axisName, axis.initializer.properties.map(propertyKey).filter((value): value is string => value !== null));
    addOwner(owners, classesIn(axis.initializer), axisName);
  }
  return axes;
}

function variantsFromDeclaration(declaration: ts.VariableDeclaration): ComponentVariants | null {
  const call = declaration.initializer;
  if (!ts.isIdentifier(declaration.name) || !call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return null;
  const name = componentNameFor(declaration.name.text);
  const callee = call.expression.text;
  const args = call.arguments;
  // cva(base, { variants }) and tv({ base, variants }).
  const options = callee === "cva" ? args[1] : callee === "tv" ? args[0] : undefined;
  if (!name || !options || !ts.isObjectLiteralExpression(options)) return null;
  const owners = new Map<StyleCategory, string[]>();
  const base = callee === "cva" ? args[0] : propertyNamed(options, "base");
  if (base) addOwner(owners, classesIn(base), "base");
  const axes = readAxes(options, owners);
  return { name, axes, owners };
}

/** Reads the cva() and tv() calls in a component file into their variant axes. */
export function readComponentVariants(input: LintInput): ComponentVariants[] {
  const sourceFile = ts.createSourceFile(input.path, input.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: ComponentVariants[] = [];
  const visit = (node: ts.Node): void => {
    const component = ts.isVariableDeclaration(node) ? variantsFromDeclaration(node) : null;
    if (component) found.push(component);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/** Builds the context the class checks read from the project's theme and component files. */
export function buildProjectContext(inputs: ProjectInputs): ProjectContext {
  const colorTokens = new Set<string>();
  const cssClasses = new Set<string>();
  for (const input of inputs.theme) {
    for (const token of readThemeColorTokens(input.content)) colorTokens.add(token);
    const css = maskBlockComments(input.content, value => value.replace(/[^\r\n]/g, " "))
      .replace(/"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'/g, value => value.replace(/[^\r\n]/g, " "));
    for (const selector of css.matchAll(/(?:^|(?<=[{}]))([^{}]*)\{/g)) {
      for (const match of selector[1].matchAll(/\.([a-zA-Z_][\w-]*)/g)) cssClasses.add(match[1]);
    }
  }
  const components = new Map<string, ComponentVariants>();
  for (const input of inputs.components) {
    for (const component of readComponentVariants(input)) components.set(component.name, component);
  }
  return { colorTokens, components, cssClasses };
}
