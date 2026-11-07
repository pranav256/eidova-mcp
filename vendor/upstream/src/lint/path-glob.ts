/**
 * Path globs for review.config.json exemptions. A reviewed repository writes
 * the pattern, so matching never builds a regular expression from it: the
 * segment walk below stays polynomial for any input, and an over-long pattern
 * matches nothing. [BD-853]
 */

/** Longest glob an exemption may use; the config schema caps it too. */
export const MAX_GLOB_LENGTH = 200;

/**
 * Longest path the matcher reads. Matching is path length times glob length,
 * so a hostile config with long globs and long paths could stall the review
 * worker. A longer path is never exempt, so every rule still runs on it.
 */
export const MAX_MATCH_PATH_LENGTH = 512;

function segments(path: string): string[] {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts;
}

/** `*` matches any run of characters and `?` one character, within a segment. */
function segmentMatches(segment: string, pattern: string): boolean {
  let s = 0;
  let p = 0;
  let star = -1;
  let mark = 0;
  while (s < segment.length) {
    if (pattern[p] === "?" || pattern[p] === segment[s]) {
      s += 1;
      p += 1;
    } else if (pattern[p] === "*") {
      star = p;
      p += 1;
      mark = s;
    } else if (star !== -1) {
      p = star + 1;
      mark += 1;
      s = mark;
    } else {
      return false;
    }
  }
  while (pattern[p] === "*") p += 1;
  return p === pattern.length;
}

/**
 * Whether a repository-relative path matches a glob. `**` matches any number
 * of whole segments, `*` and `?` match within one segment.
 */
export function matchesPathGlob(path: string, glob: string): boolean {
  if (glob.length > MAX_GLOB_LENGTH || path.length > MAX_MATCH_PATH_LENGTH) return false;
  const parts = segments(path);

  // reachable[j]: the pattern so far matches the first j path segments.
  let reachable: boolean[] = Array(parts.length + 1).fill(false);
  reachable[0] = true;
  for (const segment of segments(glob)) {
    const next = reachable.map(() => false);
    if (segment === "**") {
      let seen = false;
      reachable.forEach((value, j) => {
        seen = seen || value;
        next[j] = seen;
      });
    } else {
      for (let j = 1; j <= parts.length; j += 1) {
        next[j] = reachable[j - 1] && segmentMatches(parts[j - 1], segment);
      }
    }
    reachable = next;
  }
  return reachable[parts.length];
}
