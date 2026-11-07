/**
 * The public API of a mobile kit, one line per declaration. Once the local
 * server has written the kit into the app folder, a model still needs to know
 * what each view takes. Without this list a local model opened the files to
 * find out, filled its context and lost them again on every compaction, in a
 * loop that never reached the screen. The list is about a seventh of the
 * source. [BD-1336]
 */

import type { KitFile } from "./write-kit-files";

// Swift: public types, properties, initialisers and functions, plus the kit's
// `ds` modifiers and style shortcuts, which live inside public extensions. The
// properties matter most: they are the theme's token names, and a model that
// cannot see them opens the theme file to find them.
const SWIFT_DECLARATION = /^\s*(?:public\s+(?:struct|enum|final class|class|protocol|init|func|let|var|static (?:var|let|func))\b|(?:static (?:var|let|func)|func) ds)/;
// TypeScript: what a React Native kit file exports.
const TS_DECLARATION = /^\s*export\s+(?:function|const|type|interface|class)\b/;
const MAX_LINE = 160;

/** Each kit file's public declarations, as markdown, or an empty string when none match. */
export function kitApiIndex(files: KitFile[]): string {
  const sections = files.flatMap((file) => {
    const pattern = file.path.endsWith(".swift") ? SWIFT_DECLARATION : TS_DECLARATION;
    const lines = file.content
      .split("\n")
      .filter((line) => pattern.test(line))
      // A one-line body or a default value adds nothing to the signature.
      .map((line) => line.trim().replace(/\s*(\{.*|= .*)$/, "").slice(0, MAX_LINE));
    return lines.length > 0 ? [`### ${file.path}`, "", "```", ...lines, "```", ""] : [];
  });
  return sections.join("\n").trimEnd();
}
