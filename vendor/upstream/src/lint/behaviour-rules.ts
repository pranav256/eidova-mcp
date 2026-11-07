import ts from "typescript";
import type { Finding } from "./types";

/**
 * A behaviour finding before the engine adds the file, line and snippet. The
 * three checks here catch interaction bugs an agent writes every week and a
 * screenshot never shows: nested controls, an overlay that unmounts instead of
 * closing, and a button label that changes while it works.
 */
export type BehaviourFinding = Pick<Finding, "severity" | "ruleId" | "message" | "fix">;

const LINK_TAGS = new Set(["a", "Link"]);
const BUTTON_TAGS = new Set(["button", "Button"]);

// Overlay roots that own mount, exit motion and focus return when driven by an
// `open` prop. Their Content and Trigger parts are not listed on purpose: they
// sit inside the root, and the root is where the condition does the damage.
const OVERLAY_ROOT = /^(?:Dialog|AlertDialog|Sheet|Drawer|Popover|HoverCard|Tooltip|DropdownMenu|ContextMenu|Menubar|Modal|CommandDialog)$/;

// Words that say a control is working, as they appear in a condition name.
const WORKING_WORD = /loading|pending|submitting|saving|sending|busy|fetching|processing|working/i;
// Tested on a trimmed literal, so the anchor never backtracks through trailing spaces.
const TRAILING_ELLIPSIS = /(?:\.\.\.|\u2026)$/;

function tagName(node: ts.JsxOpeningLikeElement): string | null {
  return ts.isIdentifier(node.tagName) ? node.tagName.text : null;
}

function hasAttribute(node: ts.JsxOpeningLikeElement, name: string): boolean {
  return node.attributes.properties.some(
    (attr) => ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name) && attr.name.text === name,
  );
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function openingOf(expression: ts.Expression): ts.JsxOpeningLikeElement | null {
  const node = unwrap(expression);
  if (ts.isJsxElement(node)) return node.openingElement;
  if (ts.isJsxSelfClosingElement(node)) return node;
  return null;
}

function isNothing(expression: ts.Expression): boolean {
  const node = unwrap(expression);
  return node.kind === ts.SyntaxKind.NullKeyword
    || node.kind === ts.SyntaxKind.FalseKeyword
    || (ts.isIdentifier(node) && node.text === "undefined");
}

function stringText(expression: ts.Expression): string | null {
  const node = unwrap(expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function firstDescendantTag(element: ts.JsxElement, tags: Set<string>): string | null {
  let found: string | null = null;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagName(node);
      if (tag && tags.has(tag)) {
        found = tag;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  element.children.forEach(visit);
  return found;
}

/**
 * A link that wraps a button, or a button that wraps a link. The DOM then holds
 * two interactive controls in one spot: the keyboard stops twice, a screen
 * reader announces one role for two behaviours, and a click may fire both. A
 * `Button` with `asChild` renders its child as the one control, so it is exempt.
 */
export function linkWrapsButtonFinding(element: ts.JsxElement): BehaviourFinding | null {
  const outer = tagName(element.openingElement);
  if (!outer || hasAttribute(element.openingElement, "asChild")) return null;
  if (LINK_TAGS.has(outer)) {
    const inner = firstDescendantTag(element, BUTTON_TAGS);
    if (!inner) return null;
    return {
      severity: "serious",
      ruleId: "behaviour/link-wraps-button",
      message: `<${outer}> wraps <${inner}>, so two interactive controls nest: the keyboard stops twice and a screen reader announces one role for two behaviours.`,
      fix: `Make it one control. Render the link through <Button asChild>, or style the <${outer}> as a button and drop the inner <${inner}>.`,
    };
  }
  if (BUTTON_TAGS.has(outer)) {
    const inner = firstDescendantTag(element, LINK_TAGS);
    if (!inner) return null;
    return {
      severity: "serious",
      ruleId: "behaviour/link-wraps-button",
      message: `<${outer}> wraps <${inner}>, so two interactive controls nest: the keyboard stops twice and a screen reader announces one role for two behaviours.`,
      fix: `Make it one control. Use <Button asChild> around the <${inner}>, or move the link outside the button.`,
    };
  }
  return null;
}

/**
 * An overlay root rendered behind a condition, as `{open && <Dialog>}` or
 * `{open ? <Sheet /> : null}`. Unmounting skips the exit motion and leaves
 * focus with nowhere to return, and the primitive already does both when it is
 * rendered always and driven by `open`. Returns the overlay's opening element so
 * the finding points at it, not at the condition.
 */
export function overlayConditionalFinding(
  expression: ts.Expression,
): { element: ts.JsxOpeningLikeElement; finding: BehaviourFinding } | null {
  const node = unwrap(expression);
  let candidate: ts.Expression | null = null;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    candidate = node.right;
  } else if (ts.isConditionalExpression(node)) {
    if (isNothing(node.whenFalse)) candidate = node.whenTrue;
    else if (isNothing(node.whenTrue)) candidate = node.whenFalse;
  }
  if (!candidate) return null;
  const element = openingOf(candidate);
  const tag = element ? tagName(element) : null;
  if (!element || !tag || !OVERLAY_ROOT.test(tag)) return null;
  return {
    element,
    finding: {
      severity: "moderate",
      ruleId: "behaviour/overlay-conditional-render",
      message: `<${tag}> is mounted by a condition, so it cannot animate out and focus has nowhere to return when it unmounts.`,
      fix: `Render <${tag}> always and drive it with open and onOpenChange. The primitive owns mount, exit motion and focus return.`,
    },
  };
}

/**
 * A button whose label is a conditional between two strings, where the
 * condition or one string says the control is working. The label swap moves the
 * button's width and hides the action name at the moment the person waits on it.
 */
export function loadingLabelSwapFinding(element: ts.JsxElement): BehaviourFinding | null {
  const tag = tagName(element.openingElement);
  if (!tag || !BUTTON_TAGS.has(tag)) return null;
  for (const child of element.children) {
    if (!ts.isJsxExpression(child) || !child.expression) continue;
    const expression = unwrap(child.expression);
    if (!ts.isConditionalExpression(expression)) continue;
    const whenTrue = stringText(expression.whenTrue);
    const whenFalse = stringText(expression.whenFalse);
    if (whenTrue === null || whenFalse === null || whenTrue === whenFalse) continue;
    const conditionWorks = WORKING_WORD.test(expression.condition.getText());
    const trueWorks = TRAILING_ELLIPSIS.test(whenTrue.trimEnd()) || WORKING_WORD.test(whenTrue);
    const falseWorks = TRAILING_ELLIPSIS.test(whenFalse.trimEnd()) || WORKING_WORD.test(whenFalse);
    if (!conditionWorks && !trueWorks && !falseWorks) continue;
    const [busy, idle] = falseWorks && !trueWorks ? [whenFalse, whenTrue] : [whenTrue, whenFalse];
    return {
      severity: "moderate",
      ruleId: "behaviour/loading-label-swap",
      message: `The <${tag}> label swaps from "${idle}" to "${busy}" while it works, so its width jumps and the action name disappears.`,
      fix: `Keep the label "${idle}". Set disabled and aria-busy while it works, and show a spinner beside the text with its width reserved.`,
    };
  }
  return null;
}

/**
 * A control whose event handler does nothing, as `onClick={() => {}}`. It looks
 * interactive and is not: a local model emptied a card's toggle, so clicking a
 * habit did nothing. Only an empty block body counts, so `() => toggle(id)` and
 * a handler with statements pass. [BD-1285]
 */
export function emptyHandlerFinding(opening: ts.JsxOpeningLikeElement): BehaviourFinding | null {
  for (const attr of opening.attributes.properties) {
    if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name) || !/^on[A-Z]/.test(attr.name.text)) continue;
    const value = attr.initializer;
    if (!value || !ts.isJsxExpression(value) || !value.expression) continue;
    const handler = unwrap(value.expression);
    const isFunction = ts.isArrowFunction(handler) || ts.isFunctionExpression(handler);
    if (!isFunction || !ts.isBlock(handler.body) || handler.body.statements.length > 0) continue;
    const name = tagName(opening) ?? "element";
    return {
      severity: "serious",
      ruleId: "behaviour/empty-handler",
      message: `<${name}> has ${attr.name.text}={() => {}}, so it looks interactive and does nothing when used.`,
      fix: `Give ${attr.name.text} the action the control promises, such as toggling the item, or remove the handler and its pointer styling.`,
    };
  }
  return null;
}

