import ts from "typescript";
import type { BehaviourFinding } from "./behaviour-rules";
import { aiAnswerWithoutLabelFinding, aiRefusalWithoutReasonFinding } from "./ai-part-rules";

/**
 * Checks for a wrong component choice that the source alone can show. Each one
 * enforces a rule in `docs/components/<component>.md` that has not been tested
 * with people yet, so each one warns and never blocks. [BD-1124]
 */

// Overlays that block the page. A popover or tooltip inside one is fine.
const BLOCKING_OVERLAY = new Set(["Dialog", "AlertDialog", "Sheet", "Drawer", "Modal"]);
// An alert dialog that confirms discarding unsaved input is the one stacked layer the rules ask for.
const NESTED_OVERLAY = new Set(["Dialog", "Sheet", "Drawer", "Modal"]);
const TOAST_TAG = /^Toast(?:Content|Description)?$/;
const FORM_CONTROL = new Set(["input", "textarea", "select", "form", "Input", "Textarea", "Select", "Form"]);
const INTERACTIVE = new Set(["a", "Link", "button", "Button", "input", "Input"]);
const SELECT_OPTION = new Set(["option", "SelectItem"]);
const RADIO_OPTION = new Set(["RadioGroupItem"]);

/** A radio group holds every option in view, so 4 or fewer fit in place of a select. Proposed, not measured. */
const FEW_OPTIONS = 4;
/** Above this many options a radio group stops being scannable. Proposed, not measured. */
const MANY_OPTIONS = 7;

function tagName(node: ts.JsxOpeningLikeElement): string | null {
  return ts.isIdentifier(node.tagName) ? node.tagName.text : null;
}

// The tags inside a node, never the node's own tag.
function descendantTags(node: ts.Node): string[] {
  const tags: string[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) {
      const tag = tagName(child);
      if (tag) tags.push(tag);
    }
    ts.forEachChild(child, visit);
  };
  if (ts.isJsxElement(node)) node.children.forEach(visit);
  else ts.forEachChild(node, visit);
  return tags;
}

// True when an enclosing element already answers for this one, so one fault reports once.
function insideMatching(element: ts.JsxElement, matches: (tag: string) => boolean): boolean {
  for (let node: ts.Node = element.parent; node; node = node.parent) {
    if (ts.isJsxElement(node)) {
      const tag = tagName(node.openingElement);
      if (tag && matches(tag)) return true;
    }
    if (isToastCall(node) && matches("toast()")) return true;
  }
  return false;
}

function isToastCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  return (ts.isIdentifier(callee) && callee.text === "toast")
    || (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "toast");
}

// A placeholder such as <option value="" disabled>Choose</option> is not a choice.
function isPlaceholderOption(node: ts.JsxOpeningLikeElement): boolean {
  return node.attributes.properties.some((attr) => {
    if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) return false;
    if (attr.name.text === "disabled" || attr.name.text === "hidden") return true;
    return attr.name.text === "value" && attr.initializer !== undefined
      && ts.isStringLiteral(attr.initializer) && attr.initializer.text === "";
  });
}

// Options built with `.map()` have a count the source cannot show.
function buildsOptionsInCode(element: ts.JsxElement): boolean {
  let found = false;
  const visit = (child: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression)
      && child.expression.name.text === "map") {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  element.children.forEach(visit);
  return found;
}

function selectOptionCount(element: ts.JsxElement): number {
  let count = 0;
  const visit = (child: ts.Node) => {
    if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) {
      const tag = tagName(child);
      if (tag && SELECT_OPTION.has(tag) && !isPlaceholderOption(child)) count += 1;
    }
    ts.forEachChild(child, visit);
  };
  element.children.forEach(visit);
  return count;
}

/** A dialog, sheet or drawer opened from inside another one. */
export function nestedOverlayFinding(element: ts.JsxElement): BehaviourFinding | null {
  const outer = tagName(element.openingElement);
  if (!outer || !BLOCKING_OVERLAY.has(outer)) return null;
  if (insideMatching(element, (tag) => BLOCKING_OVERLAY.has(tag))) return null;
  const inner = descendantTags(element).find((tag) => NESTED_OVERLAY.has(tag));
  if (!inner) return null;
  return {
    severity: "moderate",
    ruleId: "component/dialog/nested",
    message: `<${inner}> opens inside <${outer}>, so two blocking layers stack and focus return gets fragile.`,
    fix: "Make the inner task a step inside the same dialog, or move the task to its own page. A popover inside is fine. Rule: docs/components/dialog.md, not yet tested with people.",
  };
}

/** A form field inside a toast, which leaves on its own. */
export function toastHoldsInputFinding(element: ts.JsxElement): BehaviourFinding | null {
  const outer = tagName(element.openingElement);
  if (!outer || !TOAST_TAG.test(outer)) return null;
  if (insideMatching(element, (tag) => tag === "toast()" || TOAST_TAG.test(tag))) return null;
  const inner = descendantTags(element).find((tag) => FORM_CONTROL.has(tag));
  if (!inner) return null;
  return toastInputFinding(inner);
}

/** The same rule for a toast built as `toast(<... />)` or `toast.custom(...)`. */
export function toastCallHoldsInputFinding(call: ts.CallExpression): BehaviourFinding | null {
  if (!isToastCall(call)) return null;
  const inner = call.arguments.flatMap((argument) => [
    ...(ts.isJsxElement(argument) || ts.isJsxSelfClosingElement(argument)
      ? [tagName(ts.isJsxElement(argument) ? argument.openingElement : argument) ?? ""]
      : []),
    ...descendantTags(argument),
  ]).find((tag) => FORM_CONTROL.has(tag));
  return inner ? toastInputFinding(inner) : null;
}

function toastInputFinding(inner: string): BehaviourFinding {
  return {
    severity: "moderate",
    ruleId: "component/toast/holds-input",
    message: `A toast holds <${inner}>, but a toast leaves on its own, often before the person finishes typing.`,
    fix: "Collect the input in a dialog or an inline form. Keep the toast to a message and at most one action. Rule: docs/components/toast.md, not yet tested with people.",
  };
}

/** A link or button inside tooltip content, which cannot take focus. */
export function tooltipInteractiveFinding(element: ts.JsxElement): BehaviourFinding | null {
  if (tagName(element.openingElement) !== "TooltipContent") return null;
  const inner = descendantTags(element).find((tag) => INTERACTIVE.has(tag));
  if (!inner) return null;
  return {
    severity: "moderate",
    ruleId: "component/tooltip/interactive",
    message: `Tooltip content holds <${inner}>, but a tooltip closes when the pointer leaves and a keyboard cannot reach it.`,
    fix: "Use a popover, which takes focus and stays open until dismissed. Rule: docs/components/tooltip.md, not yet tested with people.",
  };
}

/** A select with 4 or fewer options written out, which a radio group shows without a click. */
export function selectFewOptionsFinding(element: ts.JsxElement): BehaviourFinding | null {
  const tag = tagName(element.openingElement);
  if (tag !== "select" && tag !== "Select") return null;
  if (buildsOptionsInCode(element)) return null;
  const count = selectOptionCount(element);
  if (count === 0 || count > FEW_OPTIONS) return null;
  return {
    severity: "moderate",
    ruleId: "component/select/few-options",
    message: `This <${tag}> has ${count} options, so the person must open it to compare choices that would fit on screen.`,
    fix: "Use a radio group or a segmented control, so every choice shows without a click. Rule: docs/components/select.md, not yet tested with people.",
  };
}

/** A radio group with more than 7 options written out. */
export function radioGroupManyOptionsFinding(element: ts.JsxElement): BehaviourFinding | null {
  const tag = tagName(element.openingElement);
  if (tag !== "RadioGroup") return null;
  if (buildsOptionsInCode(element)) return null;
  const count = descendantTags(element).filter((child) => RADIO_OPTION.has(child)).length;
  if (count <= MANY_OPTIONS) return null;
  return {
    severity: "moderate",
    ruleId: "component/radio-group/many-options",
    message: `This radio group has ${count} options, which is too many to scan in place.`,
    fix: "Use a select, or a combobox when the person knows the name of the option. Rule: docs/components/radio-group.md, not yet tested with people.",
  };
}

/** Every element-level component check, in the order the engine reports them. */
export const COMPONENT_ELEMENT_CHECKS = [
  nestedOverlayFinding,
  toastHoldsInputFinding,
  tooltipInteractiveFinding,
  selectFewOptionsFinding,
  radioGroupManyOptionsFinding,
  aiAnswerWithoutLabelFinding,
  aiRefusalWithoutReasonFinding,
];
