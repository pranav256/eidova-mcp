// Match words against the capabilities in the feature map, so an agent learns
// that the product already makes a thing before it offers to build it. This
// file imports nothing: the prompt hook in `.claude/hooks/` loads it with plain
// Node, and `read-feature-map` uses it for `planned`. [BD-1239]

/** The fields of a capability the match reads. */
export interface CapabilityLike {
  source: "zapier" | "api" | "mcp";
  name: string;
  makes: string;
  file: string;
}

/** Lines one prompt or one planned item gets, so a long prompt cannot echo the whole list. */
export const MAX_CAPABILITY_MATCHES = 8;

const SOURCE_LABEL = {
  zapier: "Zapier action",
  api: "API request",
  mcp: "MCP tool",
} satisfies Record<CapabilityLike["source"], string>;

// Words that say nothing about what a capability makes.
const STOP = new Set(
  (
    "a an and are as at be by can could do does for from get has have how i in into is it its me my need new no not of on one or our " +
    "please should so that the their them then there this to us use want we what when where which why will with would you your " +
    "add build create make makes making let lets also any all just like same each than other app api better design " +
    "fix update change remove show see run try work help look still now"
  ).split(" "),
);

// Lowercase word stems: `pdfUrl` gives `pdf` and `url`, `pages` gives `page`.
function capabilityWords(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

const capabilityText = (c: CapabilityLike): string => `${SOURCE_LABEL[c.source]} ${c.name} ${c.makes}`;

/**
 * The capabilities that share the most telling words with `text`, best first.
 * A word that many capabilities share, such as `zapier`, counts for little, so
 * one common word alone never matches.
 */
export function matchCapabilities<T extends CapabilityLike>(capabilities: T[], text: string, max = MAX_CAPABILITY_MATCHES): T[] {
  const asked = new Set(capabilityWords(text));
  if (!asked.size || !capabilities.length) return [];
  const words = capabilities.map((c) => new Set(capabilityWords(capabilityText(c))));
  const df = new Map<string, number>();
  for (const set of words) for (const w of set) if (asked.has(w)) df.set(w, (df.get(w) ?? 0) + 1);
  const n = capabilities.length;
  const scored = capabilities.map((c, i) => {
    let score = 0;
    for (const w of asked) if (words[i].has(w)) score += Math.log(1 + n / (df.get(w) ?? n));
    return { c, score };
  });
  // Two telling words, or one word that only a few capabilities have.
  const threshold = 2 * Math.log(1 + n / Math.max(4, n * 0.1));
  return scored
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((s) => s.c);
}

/** The line the agent reads for one capability. */
export function capabilityLine(c: CapabilityLike): string {
  const flat = (text: string) => text.replace(/\s+/g, " ").trim();
  const makes = flat(c.makes);
  const short = makes.length > 240 ? `${makes.slice(0, 237)}...` : makes;
  return `Already exists: ${SOURCE_LABEL[c.source]} ${flat(c.name)} (${flat(c.file)}): ${short}`;
}
