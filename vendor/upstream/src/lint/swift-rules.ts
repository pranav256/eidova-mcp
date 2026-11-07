import type { Finding, LintInput } from "./types";

/**
 * The SwiftUI half of review-ui-code. Agents building an iOS app sent their
 * .swift files and the review refused them, so a native screen shipped with no
 * mechanical check at all. These rules read the source line by line, with
 * comments and string contents blanked, and catch what a SwiftUI screen gets
 * wrong most often: colours outside the theme, text that ignores Dynamic Type,
 * icon buttons VoiceOver cannot name, taps that are not buttons, and a chart
 * axis squeezed into a small card. [BD-1349]
 */

const ICON_LABEL_WINDOW = 14;

/** Blanks string contents and line comments, keeping every line and column. */
function codeOnly(line: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (!inString && ch === "/" && line[i + 1] === "/") return out + " ".repeat(line.length - i);
    if (ch === '"' && line[i - 1] !== "\\") {
      inString = !inString;
      out += ch;
      continue;
    }
    out += inString ? " " : ch;
  }
  return out;
}

/** The lines of one Swift statement or block that starts at `start`, by brace balance. */
function blockEnd(code: string[], start: number): number {
  let depth = 0;
  let opened = false;
  for (let i = start; i < code.length && i < start + ICON_LABEL_WINDOW; i++) {
    for (const ch of code[i]) {
      if (ch === "{") { depth++; opened = true; }
      if (ch === "}") depth--;
    }
    if (opened && depth <= 0) return i;
  }
  return Math.min(code.length - 1, start + ICON_LABEL_WINDOW - 1);
}

function finding(file: string, line: number, raw: string, rule: Omit<Finding, "file" | "line" | "snippet">): Finding {
  return { file, line: line + 1, snippet: raw.trim().slice(0, 160), ...rule };
}

/** True for a file that defines the palette itself, such as the kit's Theme.swift. */
function definesPalette(input: LintInput): boolean {
  return /(?:^|\/)Theme\//.test(input.path) || /init\s*\(\s*hex\s*:/.test(input.content);
}

/** Findings for one SwiftUI source file. */
export function swiftFindings(input: LintInput): Finding[] {
  const raw = input.content.split("\n");
  const code = raw.map(codeOnly);
  const out: Finding[] = [];
  const palette = definesPalette(input);

  code.forEach((line, i) => {
    if (!palette && /\b(?:Color|UIColor)\s*\(\s*(?:red|hex|white)\s*:|#colorLiteral/.test(line)) {
      out.push(finding(input.path, i, raw[i], {
        severity: "moderate",
        ruleId: "swift/hardcoded-color",
        message: "A literal colour bypasses the theme, so it ignores dark mode and the design system's palette.",
        fix: "Read the colour from the theme, such as `theme.colors.primary`, or add a named token to the theme.",
      }));
    }

    if (/\.font\s*\(\s*\.system\s*\(\s*size\s*:/.test(line) && !/relativeTo/.test(line)
      && code.slice(Math.max(0, i - 2), i + 1).some((near) => /\bText\s*\(/.test(near))) {
      out.push(finding(input.path, i, raw[i], {
        severity: "serious",
        ruleId: "swift/fixed-text-size",
        wcag: "1.4.4",
        message: "Text set with a fixed point size does not grow with Dynamic Type.",
        fix: "Use a text style such as `.font(.body)`, the kit's `.dsFont(size, relativeTo:)`, or `@ScaledMetric` for the size.",
      }));
    }

    if (/\.onTapGesture\b/.test(line)) {
      out.push(finding(input.path, i, raw[i], {
        severity: "serious",
        ruleId: "swift/tap-gesture-not-button",
        wcag: "4.1.2",
        message: "A tap gesture is invisible to VoiceOver and Full Keyboard Access, so the action cannot be reached without a touch.",
        fix: "Wrap the view in a `Button` and give it `.buttonStyle(.plain)` to keep its look.",
      }));
    }

    if (/^\s*Chart\s*[({]/.test(line)) {
      const end = blockEnd(code, i);
      const tail = code.slice(i, Math.min(code.length, end + 6)).join("\n");
      if (!/\.chartYAxis\s*\(\s*\.hidden\s*\)/.test(tail)) {
        out.push(finding(input.path, i, raw[i], {
          severity: "moderate",
          ruleId: "swift/chart-axis-in-card",
          message: "A Swift Charts chart keeps its y axis, whose labels collide with the card's own text and push the list down.",
          fix: "Add `.chartYAxis(.hidden)`, or draw a week as seven capsule bars on tracks, as the kit's starter screen does.",
        }));
      }
    }

    if (/\bButton\s*[({]/.test(line)) {
      const end = blockEnd(code, i);
      const body = code.slice(i, end + 1).join("\n");
      const after = code.slice(i, Math.min(code.length, end + 4)).join("\n");
      const iconOnly = /Image\s*\(\s*systemName\s*:/.test(body) && !/\b(?:Text|Label)\s*\(/.test(body) && !/Button\s*\(\s*"/.test(raw[i]);
      if (iconOnly && !/\.accessibilityLabel\s*\(/.test(after)) {
        out.push(finding(input.path, i, raw[i], {
          severity: "serious",
          ruleId: "swift/icon-button-no-label",
          wcag: "4.1.2",
          message: "An icon-only button has no name, so VoiceOver reads the SF Symbol's file name or nothing.",
          fix: "Add `.accessibilityLabel(\"Add habit\")` to the button, naming what it does.",
        }));
      }
    }

    if (/Text\s*\(\s*"[^"]*—/.test(raw[i])) {
      out.push(finding(input.path, i, raw[i], {
        severity: "moderate",
        ruleId: "copy/em-dash",
        message: "An em dash in interface copy reads as generated text.",
        fix: "Use a comma, a colon or a full stop, or rephrase the sentence.",
      }));
    }
  });
  return out;
}
