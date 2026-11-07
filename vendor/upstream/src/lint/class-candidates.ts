import ts from "typescript";
import type { LintInput } from "./types";

/** The static classes on one element, with the position the report anchors them to. */
export interface ClassCandidates {
  line: number;
  column: number;
  snippet: string;
  classes: string[];
}

function staticText(initializer: ts.JsxAttributeValue | undefined): string | null {
  const value = initializer && ts.isJsxExpression(initializer) ? initializer.expression : initializer;
  if (value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))) return value.text;
  return null;
}

/**
 * Lists every literal className in a JSX or TSX file, per element. The CLI asks
 * the project's Tailwind about these, because only Tailwind knows which of
 * them generate CSS. A class built at run time is not listed. [BD-817]
 */
export function staticClassCandidates(input: LintInput): ClassCandidates[] {
  const sourceFile = ts.createSourceFile(input.path, input.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = input.content.split(/\r?\n/);
  const found: ClassCandidates[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && ["className", "class"].includes(node.name.getText(sourceFile))) {
      const text = staticText(node.initializer);
      if (text) {
        const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        found.push({
          line: start.line + 1,
          column: start.character + 1,
          snippet: lines[start.line]?.trim() ?? "",
          classes: text.split(/\s+/).filter(Boolean),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}
