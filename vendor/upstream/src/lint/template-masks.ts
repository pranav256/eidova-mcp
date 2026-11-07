// Linear masks for template markup [BD-986]. The GitHub app lints template
// files from any pull request, and the regexes these replace rescanned the
// rest of the file from every unclosed opener, so a file of them took time
// with the square of its length. Each mask here finds an opener, then its
// closer with indexOf or a forward regex search, and gives up on that kind of
// opener once no closer is left, since no later one could close either. Each
// returns exactly what its regex returned.

const QUOTED_TAGS = ["script", "style", "pre", "code", "blockquote"] as const;

/** Thrown when a file needs more scanning than its budget allows; lintFile reports it as too complex. */
export class ReviewBudgetExceeded extends RangeError {}

/**
 * Masks every `<!-- -->` comment and every script, style, pre, code and
 * blockquote element, as
 * `/<!--[\s\S]*?-->|<(script|style|pre|code|blockquote)\b[^>]*>[\s\S]*?<\/\1\s*>/gi`
 * did.
 */
export function maskQuotedRegions(content: string, mask: (value: string) => string): string {
  const opener = /<!--|<(script|style|pre|code|blockquote)\b/gi;
  const deadTags = new Set<string>();
  let commentsDead = false;
  let tagsDead = false;
  let out = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(content))) {
    const start = match.index;
    const end = match[1] ? quotedElementEnd(content, opener.lastIndex, match[1].toLowerCase()) : commentEnd(content, opener.lastIndex);
    if (end === null) {
      // A failed opener tells us its whole kind is dead; carry on past it.
      opener.lastIndex = start + 1;
      if (commentsDead && tagsDead) break;
      continue;
    }
    out += content.slice(cursor, start) + mask(content.slice(start, end));
    cursor = end;
    opener.lastIndex = end;
  }
  return out + content.slice(cursor);

  function commentEnd(text: string, from: number): number | null {
    if (commentsDead) return null;
    const close = text.indexOf("-->", from);
    if (close === -1) commentsDead = true;
    return close === -1 ? null : close + 3;
  }

  function quotedElementEnd(text: string, from: number, tag: string): number | null {
    if (tagsDead || deadTags.has(tag)) return null;
    const open = text.indexOf(">", from);
    if (open === -1) {
      tagsDead = true;
      return null;
    }
    const closer = new RegExp(`</${tag}\\s*>`, "gi");
    closer.lastIndex = open + 1;
    if (!closer.exec(text)) {
      deadTags.add(tag);
      if (deadTags.size === QUOTED_TAGS.length) tagsDead = true;
      return null;
    }
    return closer.lastIndex;
  }
}

/** Masks every `/* *\/` comment, as `/\/\*[\s\S]*?\*\//g` did. */
export function maskBlockComments(content: string, mask: (value: string) => string): string {
  let out = "";
  let cursor = 0;
  for (;;) {
    const open = content.indexOf("/*", cursor);
    if (open === -1) break;
    const close = content.indexOf("*/", open + 2);
    if (close === -1) break;
    out += content.slice(cursor, open) + mask(content.slice(open, close + 2));
    cursor = close + 2;
  }
  return out + content.slice(cursor);
}

/**
 * Replaces every `{{ }}` expression with what `render` returns for it, as
 * `content.replace(/\{\{([\s\S]*?)\}\}/g, render)` did.
 */
export function maskMustache(content: string, render: (value: string, expression: string) => string): string {
  let out = "";
  let cursor = 0;
  for (;;) {
    const open = content.indexOf("{{", cursor);
    if (open === -1) break;
    const close = content.indexOf("}}", open + 2);
    if (close === -1) break;
    out += content.slice(cursor, open) + render(content.slice(open, close + 2), content.slice(open + 2, close));
    cursor = close + 2;
  }
  return out + content.slice(cursor);
}

/**
 * Line numbers and line text for one file, built once, so each finding costs
 * a binary search instead of a split of the whole file.
 */
export function lineIndex(content: string) {
  const starts = [0];
  for (let at = content.indexOf("\n"); at !== -1; at = content.indexOf("\n", at + 1)) starts.push(at + 1);
  const lines = content.split(/\r?\n/);
  return {
    lineAt(index: number): number {
      let low = 0;
      let high = starts.length;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (starts[middle] <= index) low = middle + 1;
        else high = middle;
      }
      return low;
    },
    snippet(line: number): string {
      return lines[line - 1]?.trim() ?? "";
    },
  };
}
