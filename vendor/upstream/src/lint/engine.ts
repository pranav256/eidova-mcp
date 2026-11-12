import ts from "typescript";
import { copyOverProductFindings } from "./hero-copy-rules";
import {
  looksLikeKickerLabel,
  semanticTokenClassFindings,
  slopClassFindings,
} from "./class-rules";
import type { Finding, LintConfig, LintInput, Severity } from "./types";
import { isString } from "../guards";
import { emptyHandlerFinding, linkWrapsButtonFinding, loadingLabelSwapFinding, overlayConditionalFinding, type BehaviourFinding } from "./behaviour-rules";
import { COMPONENT_ELEMENT_CHECKS, toastCallHoldsInputFinding } from "./component-choice-rules";
import { lintCodeRules } from "./code-rules";
import { iconNudgeFindings } from "./icon-rules";
import { pxIsHouseStyle, pxLengthClassFindings, pxLengthStyleFindings, reactStyleNumberCss } from "./length-rules";
import { layoutTransitionClassFindings, layoutTransitionStyleFindings } from "./motion-rules";
import { ReviewBudgetExceeded } from "./template-masks";
import { lintStylesheet, lintTemplateCopy, lintTemplateMarkup } from "./template-rules";
import { matchesPathGlob } from "./path-glob";
import {
  arbitraryValueFindings,
  dynamicClassFindings,
  inlineStyleFindings,
  rawColorFindings,
  restyleFindings,
} from "./class-contract-rules";
import { buildProjectContext, type ProjectContext, type ProjectInputs } from "./project-context";

const NATIVE_HTML_TAGS = new Set([
  "a", "abbr", "address", "area", "article", "aside", "audio",
  "b", "bdi", "bdo", "blockquote", "body", "br", "button",
  "canvas", "caption", "cite", "code", "col", "colgroup",
  "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div", "dl", "dt",
  "em", "embed",
  "fieldset", "figcaption", "figure", "footer", "form",
  "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html",
  "i", "iframe", "img", "input", "ins",
  "kbd",
  "label", "legend", "li", "link",
  "main", "map", "mark", "menu", "meta", "meter",
  "nav", "noscript",
  "object", "ol", "optgroup", "option", "output",
  "p", "param", "picture", "pre", "progress",
  "q",
  "rb", "rp", "rt", "rtc", "ruby",
  "s", "samp", "script", "section", "select", "slot", "small", "source", "span", "strong", "style", "sub", "summary", "sup",
  "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time", "title", "tr", "track",
  "u", "ul",
  "var", "video",
  "wbr",
]);

const HARDCODED_COLOR_RE = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\(\s*\d+[\s,]+\d+[\s,]+\d+(?:[\s,/]+[\d.]+%?)?\s*\)|hsla?\(\s*\d+(?:deg)?[\s,]+[\d.]+%?[\s,]+[\d.]+%?(?:[\s,/]+[\d.]+%?)?\s*\)|oklch\([^)]+\)/g;

const TAILWIND_ARBITRARY_RE = /(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|accent|caret|placeholder|divide)-\[(#[0-9a-fA-F]{3,8}|rgba?\([^\]]+\)|hsla?\([^\]]+\)|oklch\([^\]]+\))\]/g;

function severityFromFlag(flag: "all" | "critical+serious", s: Severity): boolean {
  if (flag === "all") return true;
  return s === "critical" || s === "serious";
}

interface Position {
  line: number;
  column: number;
}

function pos(sourceFile: ts.SourceFile, node: ts.Node): Position {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: line + 1, column: character + 1 };
}

function endLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return line + 1;
}

function snippetForLine(lines: string[], line: number): string {
  return lines[line - 1]?.trim() ?? "";
}

function getJsxTagName(node: ts.JsxOpeningLikeElement): string | null {
  const tag = node.tagName;
  if (ts.isIdentifier(tag)) return tag.text;
  return null;
}

function returnedExpression(callback: ts.Expression): ts.Expression | null {
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return null;
  if (!ts.isBlock(callback.body)) return callback.body;
  const statement = callback.body.statements.find(ts.isReturnStatement);
  return statement?.expression ?? null;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function jsxOpening(expression: ts.Expression | null): ts.JsxOpeningLikeElement | null {
  if (!expression) return null;
  const unwrapped = unwrapExpression(expression);
  if (ts.isJsxElement(unwrapped)) return unwrapped.openingElement;
  if (ts.isJsxSelfClosingElement(unwrapped)) return unwrapped;
  return null;
}

function hasJsxAncestor(node: ts.Node, tagName: string): boolean {
  let current = node.parent;
  while (current) {
    if (ts.isJsxElement(current)
      && getJsxTagName(current.openingElement) === tagName) return true;
    current = current.parent;
  }
  return false;
}

function hasPrimaryNavigation(element: ts.JsxElement): boolean {
  const asideLabel = getStringAttrValue(getAttribute(element.openingElement, "aria-label"));
  if (asideLabel && /^(?:primary|main) navigation$/i.test(asideLabel.trim())) return true;

  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (getJsxTagName(node) === "nav") {
        const label = getStringAttrValue(getAttribute(node, "aria-label"));
        if (label && /^(?:primary|main) navigation$/i.test(label.trim())) found = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  element.children.forEach(visit);
  return found;
}

function getAttribute(
  node: ts.JsxOpeningLikeElement,
  name: string,
): ts.JsxAttribute | null {
  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name) && attr.name.text === name) {
      return attr;
    }
  }
  return null;
}

function getStringAttrValue(attr: ts.JsxAttribute | null): string | null {
  if (!attr || !attr.initializer) return null;
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    const expr = attr.initializer.expression;
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      return expr.text;
    }
  }
  return null;
}

function hasAriaLabel(node: ts.JsxOpeningLikeElement): boolean {
  const isPresent = (name: "aria-label" | "aria-labelledby") => {
    const attr = getAttribute(node, name);
    if (!attr) return false;
    const value = getStringAttrValue(attr);
    if (value === null) return true;
    return value.trim().length > 0;
  };
  return isPresent("aria-label") || isPresent("aria-labelledby");
}

function elementHasOnlyIconChild(element: ts.JsxElement): boolean {
  const children = element.children.filter((c) => {
    if (ts.isJsxText(c)) return c.text.trim().length > 0;
    return true;
  });
  if (children.length !== 1) return false;
  const only = children[0];
  if (!ts.isJsxElement(only) && !ts.isJsxSelfClosingElement(only)) return false;
  // SAFETY: narrowing inside the guard chain that validates this value.
  const tag = only as ts.JsxElement | ts.JsxSelfClosingElement;
  const tagName = ts.isJsxElement(tag) ? getJsxTagName(tag.openingElement) : getJsxTagName(tag);
  if (!tagName) return false;
  return /icon$/i.test(tagName) || /^icon/i.test(tagName) || /^(Lucide|Phosphor|Tabler|Solar)/.test(tagName);
}

/**
 * The token rule ids that name a rule rather than a matched literal.
 *
 * A configured token rule builds its id as `token/<literal>`, which is the
 * project's own source text. That is useful locally and must never leave the
 * machine, so telemetry buckets anything outside this set. Keep it in step
 * with the `ruleId: "token/..."` literals in this file and class-rules.ts.
 */
export const STATIC_TOKEN_RULE_IDS = new Set([
  "token/arbitrary-value",
  "token/hardcoded-color",
  "token/dark-variant",
  "token/raw-palette",
  "token/px-length",
]);

/** A file under an exempt path is linted with no element rules; every other rule still runs. [BD-853] */
function withElementExemptions(path: string, config: LintConfig): LintConfig {
  const fromConfigFolder = config.pathsFrom ? `${config.pathsFrom}/${path}` : path;
  const exempt = config.rules.elementExemptions?.some((exemption) => matchesPathGlob(fromConfigFolder, exemption.path));
  return exempt ? { ...config, rules: { ...config.rules, elements: {} } } : config;
}

const TOO_COMPLEX = "review/too-complex";

// A file nested deeper than the TypeScript parser's stack, or with more
// unclosed tags than the template scan budget allows, cannot be reviewed. A
// pull request can carry such a file on purpose, so it gets one finding that
// says so instead of throwing and taking the whole review down. Any other
// error still throws, so a real bug is never reported as a complex file.
// V8 and JavaScriptCore both name a stack overflow "Maximum call stack size
// exceeded". [BD-986]
function reviewable(input: LintInput, run: () => Finding[]): Finding[] {
  try {
    return run();
  } catch (error) {
    const tooComplex = error instanceof ReviewBudgetExceeded
      || (error instanceof RangeError && /maximum call stack/i.test(error.message));
    if (!tooComplex) throw error;
    return [{
      file: input.path,
      line: 1,
      // Serious, so a file the review could not read never counts as clean.
      severity: "serious",
      ruleId: TOO_COMPLEX,
      snippet: "",
      message: "This file is nested too deeply, or has too many unclosed tags, to review, so some rules did not run on it.",
      fix: "Close the open tags or split the file, then review it again.",
      kind: "measured-source",
    }];
  }
}

/** Runs every static review rule on one file and returns its findings. */
export function lintFile(input: LintInput, baseConfig: LintConfig, context: ProjectContext | null = null): Finding[] {
  return reviewable(input, () => lintReviewableFile(input, baseConfig, context));
}

function lintReviewableFile(input: LintInput, baseConfig: LintConfig, context: ProjectContext | null): Finding[] {
  const config = withElementExemptions(input.path, baseConfig);
  if (/\.css$/i.test(input.path)) return lintStylesheet(input, config);
  // An icon file is measured once over the whole review, in lintFiles.
  if (/\.svg$/i.test(input.path)) return [];
  if (/\.(html|vue|svelte|mdx)$/i.test(input.path)) {
    // The tag checks are linear and cannot run out of budget. The copy check
    // and the code rules each fail on their own, so a crafted tail of unclosed
    // tags cannot hide the tag findings.
    const findings = [
      ...lintTemplateMarkup(input, config),
      ...reviewable(input, () => lintTemplateCopy(input, config)),
      ...reviewable(input, () => lintCodeRules(input)),
      ...(config.rules.slop?.enabled === false ? [] : reviewable(input, () => copyOverProductFindings(input))),
    ];
    const first = findings.findIndex((finding) => finding.ruleId === TOO_COMPLEX);
    return findings.filter((finding, index) => finding.ruleId !== TOO_COMPLEX || index === first);
  }
  const findings: Finding[] = [];
  const wcagSeverityFlag = config.rules.wcag?.severity ?? "all";
  const wcagEnabled = config.rules.wcag?.enabled !== false;
  const slopEnabled = config.rules.slop?.enabled !== false;
  const copyEnabled = config.rules.copy?.enabled !== false;
  const semanticTokensEnabled = config.rules.semanticTokens?.enabled !== false;
  const behaviourEnabled = config.rules.behaviour?.enabled !== false;
  const classes = config.rules.classes ?? {};

  const sourceFile = ts.createSourceFile(
    input.path,
    input.content,
    ts.ScriptTarget.Latest,
    true,
    /\.(tsx|jsx|js)$/i.test(input.path)
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  );

  const lines = input.content.split(/\r?\n/);

  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      checkElementRules(node);
      checkTokenRules(node);
      if (slopEnabled || semanticTokensEnabled) checkClassRules(node);
      if (semanticTokensEnabled) checkStyleLengths(node);
      checkClassContract(node);
      if (wcagEnabled) checkWcagOnOpening(node);
      if (behaviourEnabled) {
        const empty = emptyHandlerFinding(node);
        if (empty) pushBehaviour(node, empty);
      }
    }
    if (ts.isJsxElement(node)) {
      if (wcagEnabled) checkWcagOnElement(node);
      if (slopEnabled) checkLabelAboveTitle(node);
      if (behaviourEnabled) checkBehaviourOnElement(node);
      checkSidebarImitation(node);
    }
    if (behaviourEnabled && ts.isJsxExpression(node) && node.expression) {
      checkOverlayMount(node.expression);
    }
    if (copyEnabled && ts.isJsxText(node)) {
      checkCopyText(node, node.text);
    }
    if (ts.isCallExpression(node)) {
      checkTableImitation(node);
      if (behaviourEnabled) {
        const toast = toastCallHoldsInputFinding(node);
        if (toast) pushBehaviour(node, toast);
      }
    }
    // Copy written as a string inside braces, e.g. <p>{"Fast — really fast."}</p>,
    // is still user-facing text and reads identically on screen.
    if (
      copyEnabled
      && ts.isJsxExpression(node)
      && node.expression
      && (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))
    ) {
      checkCopyText(node.expression, node.expression.text);
    }
    ts.forEachChild(node, visit);
  }

  function checkTableImitation(node: ts.CallExpression) {
    const tableRule = config.rules.elements?.table;
    if (!tableRule) return;
    if (!ts.isPropertyAccessExpression(node.expression)
      || node.expression.name.text !== "map") return;

    const callback = node.arguments[0];
    if (!callback) return;
    const opening = jsxOpening(returnedExpression(callback));
    if (!opening
      || getJsxTagName(opening) !== "div"
      || hasJsxAncestor(node, "dl")
      || !hasTableRowSemantics(opening, node)) return;

    const p = pos(sourceFile, opening);
    findings.push({
      file: input.path,
      line: p.line,
      column: p.column,
      severity: "serious",
      ruleId: "composition/table-imitation",
      snippet: snippetForLine(lines, p.line),
      message: `A record collection is rendered as repeated <div> rows instead of the installed ${tableRule.use} composition.`,
      fix: `Use ${tableRule.use} and its row, header, and cell primitives from ${tableRule.from}. Keep the table composition inside an overflow container for narrow screens.`,
    });
  }

  function hasTableRowSemantics(
    opening: ts.JsxOpeningLikeElement,
    mapCall: ts.CallExpression,
  ): boolean {
    if (getStringAttrValue(getAttribute(opening, "role")) === "row") return true;
    const className = getStringAttrValue(getAttribute(opening, "className"))
      ?? getStringAttrValue(getAttribute(opening, "class"));
    return Boolean(className
      && (/\btable-row\b/.test(className)
        || (/\bflex\b/.test(className) && hasRecordCollectionName(mapCall))
        || (/\bgrid\b/.test(className)
          && /\bgrid-cols-/.test(className)
          && hasCompatibleGridHeader(opening, mapCall))));
  }

  function hasRecordCollectionName(mapCall: ts.CallExpression): boolean {
    if (!ts.isPropertyAccessExpression(mapCall.expression)) return false;
    const collection = mapCall.expression.expression;
    const name = ts.isIdentifier(collection)
      ? collection.text
      : ts.isPropertyAccessExpression(collection)
        ? collection.name.text
        : undefined;
    return name ? /^(?:records?|rows?)$/i.test(name) : false;
  }

  function hasCompatibleGridHeader(
    row: ts.JsxOpeningLikeElement,
    mapCall: ts.CallExpression,
  ): boolean {
    const header = precedingJsxSibling(mapCall);
    if (!header) return false;
    if (hasDescendantRole(header, "columnheader")) return true;
    const rowColumns = gridColumnClass(row);
    return Boolean(rowColumns && gridColumnClass(header) === rowColumns);
  }

  function precedingJsxSibling(node: ts.Node): ts.JsxOpeningLikeElement | null {
    let current = node.parent;
    while (current && !ts.isJsxElement(current)) current = current.parent;
    if (!current) return null;
    const childIndex = current.children.findIndex((child) =>
      child.getStart(sourceFile) <= node.getStart(sourceFile) && child.getEnd() >= node.getEnd());
    for (let index = childIndex - 1; index >= 0; index--) {
      const sibling = current.children[index];
      if (ts.isJsxElement(sibling)) return sibling.openingElement;
      if (ts.isJsxSelfClosingElement(sibling)) return sibling;
      if (!ts.isJsxText(sibling) || sibling.text.trim()) return null;
    }
    return null;
  }

  function gridColumnClass(opening: ts.JsxOpeningLikeElement): string | undefined {
    const className = getStringAttrValue(getAttribute(opening, "className"))
      ?? getStringAttrValue(getAttribute(opening, "class"));
    return className?.match(/\bgrid-cols-[^\s]+/)?.[0];
  }

  function hasDescendantRole(opening: ts.JsxOpeningLikeElement, role: string): boolean {
    let found = getStringAttrValue(getAttribute(opening, "role")) === role;
    const root = ts.isJsxElement(opening.parent) && opening.parent.openingElement === opening
      ? opening.parent
      : opening;
    const visit = (node: ts.Node): void => {
      if (found) return;
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
        && getStringAttrValue(getAttribute(node, "role")) === role) found = true;
      ts.forEachChild(node, visit);
    };
    visit(root);
    return found;
  }

  function checkSidebarImitation(element: ts.JsxElement) {
    const sidebarRule = config.rules.elements?.["app-shell"];
    if (!sidebarRule
      || getJsxTagName(element.openingElement) !== "aside"
      || !hasPrimaryNavigation(element)) return;

    const p = pos(sourceFile, element.openingElement);
    findings.push({
      file: input.path,
      line: p.line,
      column: p.column,
      severity: "serious",
      ruleId: "composition/sidebar-imitation",
      snippet: snippetForLine(lines, p.line),
      message: `The primary navigation shell is a raw <aside> instead of the installed ${sidebarRule.use} composition.`,
      fix: `Use ${sidebarRule.use} and its navigation primitives from ${sidebarRule.from}. Keep semantic <aside> elements for complementary page content.`,
    });
  }

  function checkClassRules(node: ts.JsxOpeningLikeElement) {
    const className =
      getStringAttrValue(getAttribute(node, "className"))
      ?? getStringAttrValue(getAttribute(node, "class"));
    if (!className) return;
    const p = pos(sourceFile, node);
    const classFindings = [
      ...(slopEnabled ? slopClassFindings(className) : []),
      ...(semanticTokensEnabled ? semanticTokenClassFindings(className) : []),
      ...(semanticTokensEnabled ? pxLengthClassFindings(className) : []),
    ];
    for (const f of classFindings) {
      findings.push({
        file: input.path,
        line: p.line,
        column: p.column,
        snippet: snippetForLine(lines, p.line),
        ...f,
      });
    }
  }

  // The ADR 0007 checks that read the element rather than one class string. [BD-817]
  function checkClassContract(node: ts.JsxOpeningLikeElement) {
    const classAttr = getAttribute(node, "className") ?? getAttribute(node, "class");
    const className = getStringAttrValue(classAttr);
    const classFindings = [
      ...(className && classes.rawColors !== false ? rawColorFindings(className, context) : []),
      ...(className && classes.arbitraryValues !== false ? arbitraryValueFindings(className) : []),
      ...restyleOf(node, className),
      ...inlineStylesOf(getAttribute(node, "style")?.initializer),
      ...dynamicClassesOf(classAttr?.initializer),
      // The motion check is never switched off, like transition-all in a stylesheet. [BD-1320]
      ...(className ? layoutTransitionClassFindings(className) : []),
      ...layoutTransitionStylesOf(getAttribute(node, "style")?.initializer),
    ];
    const p = pos(sourceFile, node);
    for (const f of classFindings) {
      findings.push({ file: input.path, line: p.line, column: p.column, snippet: snippetForLine(lines, p.line), ...f });
    }
  }

  function restyleOf(node: ts.JsxOpeningLikeElement, className: string | null) {
    const tag = getJsxTagName(node);
    if (classes.restyle === false || !context || !tag || !className || !isUiImport(tag)) return [];
    const component = context.components.get(tag);
    return component ? restyleFindings(component, className) : [];
  }

  function inlineStylesOf(style: ts.JsxAttributeValue | undefined) {
    if (classes.inlineStyles === false || !style || !ts.isJsxExpression(style) || !style.expression) return [];
    return ts.isObjectLiteralExpression(style.expression) ? inlineStyleFindings(style.expression) : [];
  }

  function layoutTransitionStylesOf(style: ts.JsxAttributeValue | undefined) {
    if (!style || !ts.isJsxExpression(style) || !style.expression || !ts.isObjectLiteralExpression(style.expression)) return [];
    return layoutTransitionStyleFindings(style.expression);
  }

  function dynamicClassesOf(value: ts.JsxAttributeValue | undefined) {
    if (classes.dynamicClasses === false || !value || !ts.isJsxExpression(value) || !value.expression) return [];
    return dynamicClassFindings(value.expression, context?.cssClasses);
  }

  // A tag counts as a design-system component when it comes from a ui folder
  // or a sibling file, so a local component that shares the name is left alone.
  function isUiImport(tag: string): boolean {
    return sourceFile.statements.some((statement) => ts.isImportDeclaration(statement)
      && ts.isStringLiteral(statement.moduleSpecifier)
      && /(?:^|\/)ui\/|^\.\.?\//.test(statement.moduleSpecifier.text)
      && statement.importClause?.namedBindings !== undefined
      && ts.isNamedImports(statement.importClause.namedBindings)
      && statement.importClause.namedBindings.elements.some((element) => element.name.text === tag));
  }

  // Reads only literal values, so a length computed at run time is left alone.
  function checkStyleLengths(node: ts.JsxOpeningLikeElement) {
    const style = getAttribute(node, "style");
    const initializer = style?.initializer;
    if (!style || !initializer || !ts.isJsxExpression(initializer) || !initializer.expression
      || !ts.isObjectLiteralExpression(initializer.expression)) return;
    const entries: Array<[string, string]> = [];
    for (const property of initializer.expression.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = propertyName(property.name);
      if (!name) continue;
      const text = stringLiteralText(property.initializer);
      const number = numericLiteralValue(property.initializer);
      if (text !== undefined) entries.push([name, text]);
      else if (number !== undefined) entries.push([name, reactStyleNumberCss(name, number)]);
    }
    const p = pos(sourceFile, style);
    for (const f of pxLengthStyleFindings(entries)) {
      findings.push({
        file: input.path,
        line: p.line,
        column: p.column,
        snippet: snippetForLine(lines, p.line),
        ...f,
      });
    }
  }

  // review-rules.md "Labels above titles": an eyebrow or kicker element styled
  // as a label rendered directly before an h1-h3 sibling.
  function checkLabelAboveTitle(element: ts.JsxElement) {
    const children = element.children.filter((c) => {
      if (ts.isJsxText(c)) return c.text.trim().length > 0;
      return ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c);
    });
    for (let i = 0; i + 1 < children.length; i++) {
      const current = children[i];
      const next = children[i + 1];
      if (!ts.isJsxElement(current) || !ts.isJsxElement(next)) continue;
      const nextTag = getJsxTagName(next.openingElement);
      if (!nextTag || !/^h[123]$/.test(nextTag)) continue;
      const className = getStringAttrValue(
        getAttribute(current.openingElement, "className"),
      );
      if (!className || !looksLikeKickerLabel(className)) continue;
      const p = pos(sourceFile, current.openingElement);
      findings.push({
        file: input.path,
        line: p.line,
        column: p.column,
        severity: "serious",
        ruleId: "slop/label-above-title",
        snippet: snippetForLine(lines, p.line),
        message: `A label is rendered directly above <${nextTag}>. Eyebrow and kicker labels above titles are a generated-layout tell.`,
        fix: "Start with the title. Fold essential context into the title or the supporting line after it.",
      });
    }
  }

  function pushBehaviour(node: ts.Node, finding: BehaviourFinding, end?: ts.Node) {
    const p = pos(sourceFile, node);
    const found: Finding = {
      file: input.path,
      line: p.line,
      column: p.column,
      snippet: snippetForLine(lines, p.line),
      ...finding,
    };
    if (end) found.endLine = endLine(sourceFile, end);
    findings.push(found);
  }

  function checkBehaviourOnElement(element: ts.JsxElement) {
    const nested = linkWrapsButtonFinding(element);
    if (nested) pushBehaviour(element.openingElement, nested, element);
    const swap = loadingLabelSwapFinding(element);
    if (swap) pushBehaviour(element.openingElement, swap, element);
    for (const check of COMPONENT_ELEMENT_CHECKS) {
      const choice = check(element);
      if (choice) pushBehaviour(element.openingElement, choice, element);
    }
  }

  function checkOverlayMount(expression: ts.Expression) {
    const result = overlayConditionalFinding(expression);
    if (result) pushBehaviour(result.element, result.finding);
  }

  function checkCopyText(node: ts.Node, text: string) {
    const emDashIndex = text.indexOf("—");
    if (emDashIndex === -1) return;
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile) + emDashIndex);
    findings.push({
      file: input.path,
      line: line + 1,
      severity: "moderate",
      ruleId: "copy/em-dash",
      snippet: snippetForLine(lines, line + 1),
      message: "Em dash in user-facing copy.",
      fix: "Use a comma, a colon, or rephrase the sentence. Hyphens in compound modifiers are fine.",
    });
  }

  function checkElementRules(node: ts.JsxOpeningLikeElement) {
    const elementRules = config.rules.elements ?? {};
    const tag = getJsxTagName(node);
    if (!tag) return;
    if (!NATIVE_HTML_TAGS.has(tag)) return;

    let ruleKey: string | null = null;
    if (tag === "input") {
      const typeAttr = getStringAttrValue(getAttribute(node, "type"));
      if (typeAttr) {
        const composite = `input[type=${typeAttr}]`;
        if (elementRules[composite]) ruleKey = composite;
      }
      if (!ruleKey && elementRules["input"]) ruleKey = "input";
    } else if (elementRules[tag]) {
      ruleKey = tag;
    }
    if (!ruleKey) return;

    const rule = elementRules[ruleKey];
    const p = pos(sourceFile, node);
    findings.push({
      file: input.path,
      line: p.line,
      column: p.column,
      severity: "serious",
      ruleId: `element/${ruleKey}`,
      snippet: snippetForLine(lines, p.line),
      message: `Native <${tag}> should be replaced by <${rule.use}> from ${rule.from}.`,
      fix: `Import { ${rule.use} } from "${rule.from}" and use <${rule.use}> instead of <${tag}>.`,
    });
  }

  function checkTokenRules(node: ts.JsxOpeningLikeElement) {
    const tokenRules = config.rules.tokens ?? {};
    for (const attr of node.attributes.properties) {
      if (!ts.isJsxAttribute(attr) || !attr.initializer) continue;
      const value = getStringAttrValue(attr);
      if (!value) continue;
      const attrPos = pos(sourceFile, attr);

      for (const [literal, replacement] of Object.entries(tokenRules)) {
        if (value.includes(literal)) {
          findings.push({
            file: input.path,
            line: attrPos.line,
            column: attrPos.column,
            severity: "serious",
            ruleId: `token/${literal}`,
            snippet: snippetForLine(lines, attrPos.line),
            message: `Hardcoded "${literal}" should be replaced by token "${replacement}".`,
            fix: `Replace "${literal}" with "${replacement}".`,
          });
        }
      }

      const arbMatches = value.matchAll(TAILWIND_ARBITRARY_RE);
      for (const m of arbMatches) {
        const matched = m[0];
        if (Object.keys(tokenRules).some((k) => matched.includes(k))) continue;
        findings.push({
          file: input.path,
          line: attrPos.line,
          column: attrPos.column,
          severity: "moderate",
          ruleId: "token/arbitrary-value",
          snippet: snippetForLine(lines, attrPos.line),
          message: `Tailwind arbitrary value "${matched}" bypasses the design-system tokens.`,
          fix: `Replace with a semantic token (e.g. bg-background, text-foreground, border-border).`,
        });
      }

      if (isString(value) && HARDCODED_COLOR_RE.test(value)) {
        HARDCODED_COLOR_RE.lastIndex = 0;
        const inArbitrary = TAILWIND_ARBITRARY_RE.test(value);
        TAILWIND_ARBITRARY_RE.lastIndex = 0;
        if (!inArbitrary) {
          findings.push({
            file: input.path,
            line: attrPos.line,
            column: attrPos.column,
            severity: "moderate",
            ruleId: "token/hardcoded-color",
            snippet: snippetForLine(lines, attrPos.line),
            message: `Hardcoded color literal in "${attr.name.getText(sourceFile)}" should reference a design token.`,
            fix: `Replace with a token (bg-primary, text-foreground, border-border, etc.).`,
          });
        }
      }
    }
  }

  function checkWcagOnOpening(node: ts.JsxOpeningLikeElement) {
    const tag = getJsxTagName(node);
    if (!tag) return;

    if (tag === "img") {
      const alt = getAttribute(node, "alt");
      if (!alt) {
        const p = pos(sourceFile, node);
        if (severityFromFlag(wcagSeverityFlag, "critical")) {
          findings.push({
            file: input.path,
            line: p.line,
            column: p.column,
            severity: "critical",
            ruleId: "wcag/img-alt",
            wcag: "1.1.1 (A)",
            snippet: snippetForLine(lines, p.line),
            message: "<img> is missing an alt attribute.",
            fix: 'Add alt="" for decorative images or alt="describes the image" for content images.',
          });
        }
      }
    }

    const className = getStringAttrValue(getAttribute(node, "className"));
    const removesOutline = !!className && /\boutline-none\b/.test(className);
    const restoresFocusIndicator =
      !!className &&
      (/\bfocus(?:-visible)?:(?:ring|shadow|border)\b/.test(className) ||
        /\bfocus(?:-visible)?:outline-(?!none\b)/.test(className));
    if (removesOutline && !restoresFocusIndicator) {
      const p = pos(sourceFile, node);
      if (severityFromFlag(wcagSeverityFlag, "serious")) {
        findings.push({
          file: input.path,
          line: p.line,
          column: p.column,
          severity: "serious",
          ruleId: "wcag/focus-visible",
          wcag: "2.4.7 (AA)",
          snippet: snippetForLine(lines, p.line),
          message: "outline-none removes the focus ring without providing a replacement.",
          fix: 'Pair outline-none with focus-visible:ring-2 focus-visible:ring-ring (or equivalent).',
        });
      }
    }
  }

  function checkWcagOnElement(element: ts.JsxElement) {
    const tag = getJsxTagName(element.openingElement);
    if (tag === "button" || tag === "a") {
      if (elementHasOnlyIconChild(element) && !hasAriaLabel(element.openingElement)) {
        const p = pos(sourceFile, element.openingElement);
        if (severityFromFlag(wcagSeverityFlag, "serious")) {
          findings.push({
            file: input.path,
            line: p.line,
            endLine: endLine(sourceFile, element),
            column: p.column,
            severity: "serious",
            ruleId: "wcag/icon-only-name",
            wcag: "4.1.2 (A)",
            snippet: snippetForLine(lines, p.line),
            message: `<${tag}> contains only an icon and has no accessible name.`,
            fix: `Add aria-label="..." to the <${tag}>, or include visually-hidden text.`,
          });
        }
      }
    }
  }

  visit(sourceFile);
  if (slopEnabled && /\.(tsx|jsx)$/i.test(input.path)) findings.push(...copyOverProductFindings(input));
  return [...findings, ...lintCodeRules(input)].map((finding) => ({
    ...finding,
    kind: finding.kind ?? "measured-source",
  }));
}

/** Cross-file evidence controls for one deterministic source-review batch. */
export interface LintOptions {
  fontEvidence?: "complete" | "partial";
  fontEvidenceInputs?: readonly LintInput[];
  fontSubjectInputs?: readonly LintInput[];
  /** The project's theme and UI component files, for the class contract checks. [BD-817] */
  project?: ProjectInputs;
  /**
   * Other source files from the reviewed files' own package. When they write
   * arbitrary lengths in px, the product's convention wins over the rem rule.
   */
  lengthSamples?: readonly LintInput[];
}

/** Reviews changed UI sources while using optional dependency files only as font evidence. */
export function lintFiles(
  inputs: LintInput[],
  config: LintConfig,
  options: LintOptions = {},
): Finding[] {
  const all: Finding[] = [];
  const context = options.project ? buildProjectContext(options.project) : null;
  for (const input of inputs) {
    all.push(...lintFile(input, config, context));
  }
  const keepPx = pxIsHouseStyle(options.lengthSamples ?? []);
  return [
    ...(keepPx ? all.filter((finding) => finding.ruleId !== "token/px-length") : all),
    ...(config.rules.icons?.enabled === false ? [] : iconNudgeFindings(inputs)),
    ...fontIntegrityFindings(
      [...inputs, ...(options.fontSubjectInputs ?? [])],
      [...inputs, ...(options.fontSubjectInputs ?? []), ...(options.fontEvidenceInputs ?? [])],
      options.fontEvidence !== "partial",
    ),
  ];
}

function fontIntegrityFindings(
  subjects: readonly LintInput[],
  evidenceInputs: readonly LintInput[],
  evidenceComplete: boolean,
): Finding[] {
  const rootDefinitions = new Map<string, string[]>();
  const htmlDefinitions = new Map<string, string[]>();
  const bodyDefinitions = new Map<string, string[]>();
  const scopedDefinitions = new Map<string, Map<string, string[]>>();
  const loaderDefinitions = activeFontLoaderDefinitions(evidenceInputs);
  for (const input of evidenceInputs) {
    const source = /\.css$/i.test(input.path)
      ? maskCssComments(input.content)
      : input.content;
    if (/\.css$/i.test(input.path)) {
      for (const declaration of cssFontDeclarations(source)) {
        if (declaration.property === "font-family" || declaration.property === "font") continue;
        for (const selector of cssSelectors(declaration.scope)) {
          const definitions = fontDefinitionMap(
            selector,
            rootDefinitions,
            htmlDefinitions,
            bodyDefinitions,
            scopedDefinitions,
          );
          const values = definitions.get(declaration.property) ?? [];
          values.push(declaration.value);
          definitions.set(declaration.property, values);
        }
      }
    }
  }

  const findings: Finding[] = [];
  const resolutionMemos = new Map<string, Map<string, FontResolution>>();
  for (const input of subjects.filter((item) => /\.css$/i.test(item.path))) {
    const lines = input.content.split(/\r?\n/);
    const source = maskCssComments(input.content);
    for (const declaration of cssFontDeclarations(source)) {
      if (!isFontFamilyDeclaration(declaration.property)) continue;
      const selectorDefinitions = cssSelectors(declaration.scope).map((selector) => ({
        selector,
        definitions: visibleFontDefinitions(
          selector,
          rootDefinitions,
          htmlDefinitions,
          bodyDefinitions,
          scopedDefinitions,
        ),
      }));
      for (const reference of fontVariableReferences(declaration.value)) {
        if (declaration.property === "font" && isNonFamilyFontToken(reference.token)) continue;
        const resolved = selectorDefinitions.every(({ selector, definitions }) => {
          const memoKey = `${input.path}\0${selector}`;
          const resolutionMemo = resolutionMemos.get(memoKey) ?? new Map<string, FontResolution>();
          resolutionMemos.set(memoKey, resolutionMemo);
          return fontReferenceResolution(
            reference,
            definitions,
            loaderDefinitions,
            new Set(),
            resolutionMemo,
            0,
          ) === "resolved";
        });
        if (resolved) continue;
        const index = declaration.valueIndex + reference.index;
        const line = input.content.slice(0, index).split(/\r?\n/).length;
        findings.push({
          file: input.path,
          line,
          severity: evidenceComplete ? "serious" : "moderate",
          ruleId: evidenceComplete
            ? "typography/unresolved-font-variable"
            : "typography/font-evidence-incomplete",
          snippet: lines[line - 1]?.trim() ?? "",
          message: evidenceComplete
            ? `Font token ${reference.token} has no definition that resolves to a real font family in the reviewed files.`
            : `Font token ${reference.token} cannot be verified because its project font-loader evidence was not available to this review.`,
          fix: evidenceComplete
            ? "Keep the design system's font import or framework loader, define the token, or add a real fallback inside var(...). Then wait for document.fonts.ready and verify the rendered computed family."
            : "Include the layout or font-loader module in the review, then fix the token if it still has no definition or real fallback.",
          kind: "measured-source",
        });
      }
    }
  }
  return findings;
}

const FONT_METRIC_SEGMENT = /(?:^|-)(?:size|weight|style|stretch|feature|variation|line-height|leading|tracking|letter-spacing)(?:-|$)/i;

function isNonFamilyFontToken(token: string): boolean {
  const suffix = /^--font-(.+)$/i.exec(token)?.[1];
  return suffix ? FONT_METRIC_SEGMENT.test(suffix) : false;
}

function isFontFamilyDeclaration(property: string): boolean {
  return property === "font-family" || property === "font"
    || (property.toLowerCase().startsWith("--font-") && !isNonFamilyFontToken(property));
}

function visibleFontDefinitions(
  selector: string,
  rootDefinitions: ReadonlyMap<string, string[]>,
  htmlDefinitions: ReadonlyMap<string, string[]>,
  bodyDefinitions: ReadonlyMap<string, string[]>,
  scopedDefinitions: ReadonlyMap<string, ReadonlyMap<string, string[]>>,
): Map<string, string[]> {
  const visible = new Map<string, string[]>();
  const kind = fontScopeKind(selector);
  const sources = [
    rootDefinitions,
    ...(kind === "html" || kind === "body" || kind === "local" ? [htmlDefinitions] : []),
    ...(kind === "body" || kind === "local" ? [bodyDefinitions] : []),
    ...(kind === "local"
      ? [...scopedDefinitions]
          .filter(([candidate]) => isProvableFontAncestor(candidate, selector))
          .map(([, definitions]) => definitions)
      : []),
  ];
  for (const definitions of sources) {
    for (const [token, values] of definitions ?? []) {
      visible.set(token, [...(visible.get(token) ?? []), ...values]);
    }
  }
  return visible;
}

type FontScopeKind = "root" | "html" | "body" | "local";

function fontDefinitionMap(
  selector: string,
  rootDefinitions: Map<string, string[]>,
  htmlDefinitions: Map<string, string[]>,
  bodyDefinitions: Map<string, string[]>,
  scopedDefinitions: Map<string, Map<string, string[]>>,
): Map<string, string[]> {
  const kind = fontScopeKind(selector);
  if (kind === "root") return rootDefinitions;
  if (kind === "html") return htmlDefinitions;
  if (kind === "body") return bodyDefinitions;
  const definitions = scopedDefinitions.get(selector) ?? new Map<string, string[]>();
  scopedDefinitions.set(selector, definitions);
  return definitions;
}

function fontScopeKind(selector: string): FontScopeKind {
  if (selector === ":root" || /^@theme(?:\s|$)/.test(selector)) return "root";
  if (selector === "html") return "html";
  if (selector === "body") return "body";
  return "local";
}

function leadingCompoundSelectors(selector: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let quote = "";
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index]!;
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "[" || char === "(") depth += 1;
    else if (char === "]" || char === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && /[\s>+~]/.test(char)) break;
    else if (depth === 0 && (char === "." || char === "#")) {
      const token = selector.slice(index).match(/^[.#]-?[_a-zA-Z][\w-]*/)?.[0];
      if (token) tokens.push(token);
    }
  }
  return tokens;
}

function leadingCompoundUsesSiblingCombinator(selector: string): boolean {
  let depth = 0;
  let quote = "";
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index]!;
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "[" || char === "(") depth += 1;
    else if (char === "]" || char === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && (char === "+" || char === "~")) return true;
    else if (depth === 0 && char === ">") return false;
    else if (depth === 0 && /\s/.test(char)) {
      return /^[+~]/.test(selector.slice(index).trimStart());
    }
  }
  return false;
}

function isProvableFontAncestor(candidate: string, selector: string): boolean {
  if (candidate === selector) return true;
  if (!candidate) return false;
  if (selector.startsWith(candidate)) {
    const suffix = selector.slice(candidate.length);
    const validBoundary = /^(?:\s|>|[.#[:])/.test(suffix);
    return validBoundary && !leadingCompoundUsesSiblingCombinator(suffix);
  }
  return /^[.#]-?[_a-zA-Z][\w-]*$/.test(candidate)
    && leadingCompoundSelectors(selector).includes(candidate)
    && !leadingCompoundUsesSiblingCombinator(selector);
}

/** True only when active JS/TS syntax supplies a framework font variable. */
export function hasActiveFontLoaderEvidence(inputs: readonly LintInput[]): boolean {
  return activeFontLoaderDefinitions(inputs).size > 0;
}

/**
 * How much font evidence a set of reviewed files carries. A stylesheet reviewed
 * without the module that loads its fonts cannot prove a font token missing,
 * so its token findings report the gap rather than a broken font.
 */
export function fontEvidenceFor(inputs: readonly LintInput[]): NonNullable<LintOptions["fontEvidence"]> {
  const hasStylesheet = inputs.some((input) => /\.css$/i.test(input.path));
  return hasStylesheet && !hasActiveFontLoaderEvidence(inputs) ? "partial" : "complete";
}

function activeFontLoaderDefinitions(inputs: readonly LintInput[]): Set<string> {
  const modules = new Map<string, FontModuleEvidence>();
  for (const input of inputs) {
    if (!/\.(?:ts|tsx|js|jsx)$/i.test(input.path)) continue;
    const evidence = collectFontLoaderEvidence(input);
    modules.set(normalizeSourcePath(input.path), evidence);
  }

  const tokens = new Set<string>();
  for (const module of modules.values()) {
    for (const binding of module.appliedBindings) {
      const localToken = module.loaderBindings.get(binding);
      if (localToken) {
        tokens.add(localToken);
        continue;
      }
      const imported = module.imports.get(binding);
      if (!imported) continue;
      const target = resolveImportedModule(module.path, imported.source, modules);
      const importedToken = target
        ? resolveExportedFontToken(target, imported.exportedName, modules, new Set())
        : undefined;
      if (importedToken) tokens.add(importedToken);
    }
  }
  return tokens;
}

interface FontImportBinding {
  source: string;
  exportedName: string;
}

interface FontModuleEvidence {
  path: string;
  loaderBindings: Map<string, string>;
  appliedBindings: Set<string>;
  imports: Map<string, FontImportBinding>;
  exports: Map<string, string>;
  reExports: Map<string, FontImportBinding>;
}

function collectFontLoaderEvidence(input: LintInput): FontModuleEvidence {
  const loaderBindings = new Map<string, string>();
  const appliedBindings = new Set<string>();
  const imports = new Map<string, FontImportBinding>();
  const exports = new Map<string, string>();
  const reExports = new Map<string, FontImportBinding>();
  const sourceFile = ts.createSourceFile(
    input.path,
    input.content,
    ts.ScriptTarget.Latest,
    true,
    /\.(?:tsx|jsx)$/i.test(input.path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const fontFactories = collectFontFactoryImports(sourceFile);
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)
      && propertyName(node.name) === "variable"
      && ts.isObjectLiteralExpression(node.parent)
      && ts.isCallExpression(node.parent.parent)
      && isFontFactoryCall(node.parent.parent, fontFactories)) {
      const token = stringLiteralText(node.initializer);
      const binding = variableBindingName(node.parent.parent);
      if (binding && token && /^--font-[a-z0-9_-]+$/i.test(token)) {
        loaderBindings.set(binding, token);
      }
    }
    if (ts.isPropertyAccessExpression(node)
      && node.name.text === "variable"
      && ts.isIdentifier(node.expression)
      && isInsideDocumentShellClass(node)) {
      appliedBindings.add(node.expression.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  for (const statement of sourceFile.statements) {
    collectFontImports(statement, imports);
    collectFontExports(statement, loaderBindings, exports, reExports);
  }
  return {
    path: normalizeSourcePath(input.path),
    loaderBindings,
    appliedBindings,
    imports,
    exports,
    reExports,
  };
}

function collectFontFactoryImports(sourceFile: ts.SourceFile): Set<string> {
  const factories = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)
      || !statement.importClause
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || !/^(?:next|@next)\/font(?:\/|$)/i.test(statement.moduleSpecifier.text)) continue;
    if (statement.importClause.name) factories.add(statement.importClause.name.text);
    const named = statement.importClause.namedBindings;
    if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) factories.add(element.name.text);
    }
  }
  return factories;
}

function isFontFactoryCall(call: ts.CallExpression, importedFactories: ReadonlySet<string>): boolean {
  return ts.isIdentifier(call.expression) && importedFactories.has(call.expression.text);
}

function resolveExportedFontToken(
  module: FontModuleEvidence,
  exportedName: string,
  modules: ReadonlyMap<string, FontModuleEvidence>,
  visiting: ReadonlySet<string>,
): string | undefined {
  const visitKey = `${module.path}:${exportedName}`;
  if (visiting.has(visitKey)) return undefined;
  const next = new Set(visiting).add(visitKey);
  const localBinding = module.exports.get(exportedName);
  if (localBinding) return module.loaderBindings.get(localBinding);
  const reExport = module.reExports.get(exportedName);
  if (!reExport) return undefined;
  const target = resolveImportedModule(module.path, reExport.source, modules);
  return target
    ? resolveExportedFontToken(target, reExport.exportedName, modules, next)
    : undefined;
}

function collectFontImports(
  statement: ts.Statement,
  imports: Map<string, FontImportBinding>,
): void {
  if (!ts.isImportDeclaration(statement)
    || !statement.importClause
    || !ts.isStringLiteral(statement.moduleSpecifier)) return;
  const source = statement.moduleSpecifier.text;
  if (statement.importClause.name) {
    imports.set(statement.importClause.name.text, { source, exportedName: "default" });
  }
  const named = statement.importClause.namedBindings;
  if (!named || !ts.isNamedImports(named)) return;
  for (const element of named.elements) {
    imports.set(element.name.text, {
      source,
      exportedName: element.propertyName?.text ?? element.name.text,
    });
  }
}

function collectFontExports(
  statement: ts.Statement,
  loaderBindings: ReadonlyMap<string, string>,
  exports: Map<string, string>,
  reExports: Map<string, FontImportBinding>,
): void {
  if (ts.isVariableStatement(statement)
    && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && loaderBindings.has(declaration.name.text)) {
        exports.set(declaration.name.text, declaration.name.text);
      }
    }
  }
  if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
    exports.set("default", statement.expression.text);
  }
  if (!ts.isExportDeclaration(statement)
    || !statement.exportClause
    || !ts.isNamedExports(statement.exportClause)) return;
  const source = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
    ? statement.moduleSpecifier.text
    : undefined;
  for (const element of statement.exportClause.elements) {
    const localName = element.propertyName?.text ?? element.name.text;
    if (source) {
      reExports.set(element.name.text, { source, exportedName: localName });
    } else if (loaderBindings.has(localName)) {
      exports.set(element.name.text, localName);
    }
  }
}

function resolveImportedModule(
  importerPath: string,
  specifier: string,
  modules: ReadonlyMap<string, FontModuleEvidence>,
): FontModuleEvidence | undefined {
  const directory = importerPath.split("/").slice(0, -1).join("/");
  const segments = importerPath.split("/");
  const srcIndex = segments.lastIndexOf("src");
  const aliasRoot = srcIndex >= 0
    ? segments.slice(0, srcIndex + 1).join("/")
    : /^(?:apps|packages)\//.test(importerPath)
      ? segments.slice(0, 2).join("/")
      : "src";
  const bases = /^(?:@|~|#)\//.test(specifier)
    ? [`${aliasRoot}/${specifier.slice(2)}`, `src/${specifier.slice(2)}`, specifier.slice(2)]
    : specifier.startsWith(".")
      ? [`${directory}/${specifier}`]
      : [];
  for (const rawBase of bases) {
    const base = normalizeSourcePath(rawBase);
    const candidates = [
      base,
      ...["ts", "tsx", "js", "jsx"].map((extension) => `${base}.${extension}`),
      ...["ts", "tsx", "js", "jsx"].map((extension) => `${base}/index.${extension}`),
    ];
    for (const candidate of candidates) {
      const resolved = modules.get(candidate);
      if (resolved) return resolved;
    }
  }
  return undefined;
}

function normalizeSourcePath(path: string): string {
  const segments: string[] = [];
  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

function isInsideDocumentShellClass(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isStatement(current)) {
    if (ts.isJsxAttribute(current)
      && ts.isIdentifier(current.name)
      && (current.name.text === "className" || current.name.text === "class")) {
      const opening = current.parent.parent;
      return (ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening))
        && /^(?:html|body)$/.test(getJsxTagName(opening) ?? "");
    }
    current = current.parent;
  }
  return false;
}

function variableBindingName(call: ts.CallExpression): string | undefined {
  return ts.isVariableDeclaration(call.parent) && ts.isIdentifier(call.parent.name)
    ? call.parent.name.text
    : undefined;
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function numericLiteralValue(node: ts.Expression): number | undefined {
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node)
    && node.operator === ts.SyntaxKind.MinusToken
    && ts.isNumericLiteral(node.operand)) return -Number(node.operand.text);
  return undefined;
}

function stringLiteralText(node: ts.Expression): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text.trim();
  return undefined;
}

interface CssFontDeclaration {
  property: string;
  value: string;
  valueIndex: number;
  scope: string;
}

interface FontVariableReference {
  token: string;
  fallback?: string;
  index: number;
}

function maskCssComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\r\n]/g, " "));
}

function cssFontDeclarations(content: string): CssFontDeclaration[] {
  const declarations: CssFontDeclaration[] = [];
  const pattern = /(--[a-z0-9_-]+|font-family|font)\s*:\s*([^;{}]*?)(?:;|(?=\s*}))/gi;
  for (const match of content.matchAll(pattern)) {
    const value = match[2];
    const scope = cssScopeAt(content, match.index ?? 0);
    declarations.push({
      property: match[1].startsWith("--") ? match[1] : match[1].toLowerCase(),
      value,
      valueIndex: (match.index ?? 0) + match[0].indexOf(value),
      scope,
    });
  }
  return declarations;
}

function cssScopeAt(content: string, index: number): string {
  let depth = 0;
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    if (content[cursor] === "}") depth++;
    if (content[cursor] !== "{") continue;
    if (depth > 0) {
      depth--;
      continue;
    }
    const previousClose = content.lastIndexOf("}", cursor - 1);
    const previousOpen = content.lastIndexOf("{", cursor - 1);
    return content.slice(Math.max(previousClose, previousOpen) + 1, cursor).trim();
  }
  return "";
}

function cssSelectors(scope: string): string[] {
  const selectors = scope.split(",").map((selector) => selector.trim()).filter(Boolean);
  return selectors.length > 0 ? selectors : [""];
}

function fontVariableReferences(value: string): FontVariableReference[] {
  const references: FontVariableReference[] = [];
  const pattern = /var\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    const start = match.index ?? 0;
    let depth = 1;
    let end = start + match[0].length;
    for (; end < value.length && depth > 0; end++) {
      if (value[end] === "(") depth++;
      if (value[end] === ")") depth--;
    }
    if (depth !== 0) {
      pattern.lastIndex = value.length;
      break;
    }
    const body = value.slice(start + match[0].length, end - 1);
    let comma = -1;
    let nested = 0;
    for (let index = 0; index < body.length; index++) {
      if (body[index] === "(") nested++;
      else if (body[index] === ")") nested--;
      else if (body[index] === "," && nested === 0) {
        comma = index;
        break;
      }
    }
    const token = body.slice(0, comma < 0 ? undefined : comma).trim();
    if (!/^--[a-z0-9_-]+$/i.test(token)) continue;
    const fallback = comma < 0 ? undefined : body.slice(comma + 1).trim();
    references.push({ token, fallback, index: start });
    pattern.lastIndex = end;
  }
  return references;
}

type FontResolution = "resolved" | "unresolved" | "cycle";
const MAX_FONT_TOKEN_DEPTH = 256;

function fontReferenceResolution(
  reference: FontVariableReference,
  definitions: ReadonlyMap<string, string[]>,
  loaderDefinitions: ReadonlySet<string>,
  visiting: Set<string>,
  memo: Map<string, FontResolution>,
  depth: number,
): FontResolution {
  const tokenResolution = fontTokenResolution(
    reference.token,
    definitions,
    loaderDefinitions,
    visiting,
    memo,
    depth,
  );
  if (tokenResolution !== "unresolved") return tokenResolution;
  return reference.fallback
    ? fontValueResolution(reference.fallback, definitions, loaderDefinitions, visiting, memo, depth)
    : "unresolved";
}

function fontTokenResolution(
  token: string,
  definitions: ReadonlyMap<string, string[]>,
  loaderDefinitions: ReadonlySet<string>,
  visiting: Set<string>,
  memo: Map<string, FontResolution>,
  depth: number,
): FontResolution {
  if (loaderDefinitions.has(token)) return "resolved";
  if (visiting.has(token)) return "cycle";
  const cached = memo.get(token);
  if (cached) return cached;
  if (depth >= MAX_FONT_TOKEN_DEPTH) return "unresolved";
  const values = definitions.get(token);
  if (!values?.length) return "unresolved";
  visiting.add(token);
  const resolutions = values.map((value) =>
    fontValueResolution(value, definitions, loaderDefinitions, visiting, memo, depth + 1));
  visiting.delete(token);
  const resolution = resolutions.includes("resolved")
    ? "resolved"
    : resolutions.includes("cycle") ? "cycle" : "unresolved";
  if (resolution !== "cycle") memo.set(token, resolution);
  return resolution;
}

function fontValueResolution(
  value: string,
  definitions: ReadonlyMap<string, string[]>,
  loaderDefinitions: ReadonlySet<string>,
  visiting: Set<string>,
  memo: Map<string, FontResolution>,
  depth: number,
): FontResolution {
  const references = fontVariableReferences(value);
  if (references.length === 0) return isConcreteFontValue(value) ? "resolved" : "unresolved";
  let resolution: FontResolution = "resolved";
  for (const reference of references) {
    const current = fontReferenceResolution(
      reference,
      definitions,
      loaderDefinitions,
      visiting,
      memo,
      depth,
    );
    if (current === "unresolved") return "unresolved";
    if (current === "cycle") resolution = "cycle";
  }
  return resolution;
}

const GENERIC_FONT_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
  "-apple-system",
]);
const NON_FAMILY_KEYWORDS = new Set([
  "inherit",
  "initial",
  "revert",
  "revert-layer",
  "unset",
  "normal",
  "italic",
  "oblique",
  "bold",
  "bolder",
  "lighter",
  "small-caps",
]);

function isConcreteFontValue(value: string): boolean {
  const clean = value.replace(/\s*!important\s*$/i, "").trim();
  if (!clean || /[{};]/.test(clean)) return false;
  const shorthand = /(?:^|\s)(?:\d*\.?\d+)(?:px|r?em|%|pt|pc|ch|ex|vw|vh|vmin|vmax)(?:\/[^\s]+)?\s+(.+)$/i.exec(clean);
  return isFontFamilyList(shorthand?.[1] ?? clean);
}

function isFontFamilyList(value: string): boolean {
  const families = value.split(",").map((family) => family.trim());
  if (!families.length || families.some((family) => !family)) return false;
  return families.every((family) => {
    if (/^(?:"(?:[^"\\]|\\.)+"|'(?:[^'\\]|\\.)+')$/.test(family)) return true;
    const lower = family.toLowerCase();
    if (GENERIC_FONT_FAMILIES.has(lower)) return true;
    if (NON_FAMILY_KEYWORDS.has(lower) || /^\d/.test(family) || /[()#:/]/.test(family)) return false;
    const words = family.split(/\s+/);
    return words.every((word) => /^[a-z_][a-z0-9_-]*$/i.test(word)
      && !NON_FAMILY_KEYWORDS.has(word.toLowerCase()));
  });
}

/** Counts findings by severity for the review summary line. */
export function summarise(findings: Finding[]) {
  const counts = { critical: 0, serious: 0, moderate: 0, total: findings.length };
  for (const f of findings) counts[f.severity]++;
  return counts;
}
