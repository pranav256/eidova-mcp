import ts from "typescript";
import type { BehaviourFinding } from "./behaviour-rules";

/**
 * Checks on the AI parts every catalog design system ships [BD-1055]. An
 * answer a model wrote must say so on screen (`rule/ai-output-needs-marker`),
 * and a refusal must name its topic and an alternative.
 */

// The answer part, as a system exports it: `TextResponse` or `Ui.TextResponse`.
const ANSWER_PART = "TextResponse";

function partName(node: ts.JsxOpeningLikeElement): string | null {
  const tag = node.tagName;
  if (ts.isIdentifier(tag)) return tag.text;
  if (ts.isPropertyAccessExpression(tag)) return tag.name.text;
  return null;
}

function attribute(node: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return node.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name,
  );
}

// The literal text an attribute holds, or undefined when it is not a literal.
function literalValue(attr: ts.JsxAttribute): string | undefined {
  const value = attr.initializer;
  if (!value) return undefined;
  if (ts.isStringLiteral(value)) return value.text;
  if (ts.isJsxExpression(value) && value.expression) {
    const expression = value.expression;
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  }
  return undefined;
}

/** An answer part whose AI label is blank, so nothing on screen says a model wrote it. */
export function aiAnswerWithoutLabelFinding(element: ts.JsxElement): BehaviourFinding | null {
  const opening = element.openingElement;
  if (partName(opening) !== ANSWER_PART) return null;
  const label = attribute(opening, "label");
  if (!label || literalValue(label)?.trim() !== "") return null;
  return {
    severity: "serious",
    ruleId: "ai/output-without-label",
    message: `<${opening.tagName.getText()}> hides its AI label, so nothing on screen says a model wrote this answer.`,
    fix: "Remove the empty label, or pass a short one such as \"AI-generated\". Rule: rule/ai-output-needs-marker.",
  };
}

/** A refused answer that names no topic and offers no alternative. */
export function aiRefusalWithoutReasonFinding(element: ts.JsxElement): BehaviourFinding | null {
  const opening = element.openingElement;
  if (partName(opening) !== ANSWER_PART) return null;
  const status = attribute(opening, "status");
  if (!status || literalValue(status) !== "refused" || attribute(opening, "refusal")) return null;
  return {
    severity: "serious",
    ruleId: "ai/refusal-without-reason",
    message: `<${opening.tagName.getText()}> refuses without a refusal prop, so the person sees no topic and no way forward.`,
    fix: "Pass refusal={{ topic, alternative }}: the topic the model will not cover, and what the person can do instead.",
  };
}
