// Pulls the user-visible copy out of a screen's JSX/HTML so the comprehension
// check reads what a person reads, not what the component tree contains.
// Regex-based on purpose: the TypeScript compiler is far too heavy to pull into
// the Cloudflare Worker bundle that serves the remote MCP transport. [BD-268]

export interface ExtractedScreen {
  headline: string | null;
  body: string[];
  actions: string[];
  /** Buttons and links that render an icon with no text and no accessible name. */
  unlabelledControls: number;
}

const HEADING_TAGS = [
  "h1", "h2", "h3",
  "CardTitle", "DialogTitle", "AlertDialogTitle", "SheetTitle", "DrawerTitle",
];

const ACTION_TAGS = ["Button", "button", "a", "Link", "MenuItem", "DropdownMenuItem"];

const TEXT_PROPS = [
  "title", "label", "placeholder", "description", "heading", "subtitle",
  "emptyMessage", "helperText", "aria-label", "alt",
];

const ICON_ONLY_TAGS = /^(?:Button|button|a|IconButton)$/;

function stripComments(code: string): string {
  return code
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

/** Strips nested markup and `{expressions}` so only literal copy survives. */
function plainText(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, " ")
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attributeValue(attributes: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*["'\`]([^"'\`]*)["'\`]\\s*\\})`)
    .exec(attributes);
  if (!match) return null;
  const value = match[1] ?? match[2] ?? match[3] ?? "";
  return value.trim() || null;
}

function elementPattern(tags: string[]): RegExp {
  return new RegExp(`<(${tags.join("|")})\\b([^>]*)>([\\s\\S]*?)<\\/\\1>`, "g");
}

interface Collected {
  headline: string | null;
  actions: string[];
  unlabelledControls: number;
  remainder: string;
}

function collectHeadline(code: string) {
  let headline: string | null = null;
  const remainder = code.replace(elementPattern(HEADING_TAGS), (_match, _tag, _attrs, inner) => {
    const text = plainText(inner);
    if (text && !headline) headline = text;
    return " ";
  });
  return { headline, remainder };
}

function collectActions(code: string): Omit<Collected, "headline"> {
  const actions: string[] = [];
  let unlabelledControls = 0;

  const remainder = code.replace(elementPattern(ACTION_TAGS), (_match, tag, attrs, inner) => {
    const text = plainText(inner);
    if (text) {
      actions.push(text);
      return " ";
    }
    const label = attributeValue(attrs, "aria-label") ?? attributeValue(attrs, "title");
    if (label) actions.push(label);
    else if (ICON_ONLY_TAGS.test(tag)) unlabelledControls += 1;
    return " ";
  });

  return { actions, unlabelledControls, remainder };
}

function collectSelfClosingActions(code: string) {
  const actions: string[] = [];
  const remainder = code.replace(/<(?:Button|IconButton)\b([^>]*)\/>/g, (_match, attrs) => {
    const label = attributeValue(attrs, "label")
      ?? attributeValue(attrs, "children")
      ?? attributeValue(attrs, "aria-label");
    if (label) actions.push(label);
    return " ";
  });
  return { actions, remainder };
}

function collectBody(code: string): string[] {
  const body: string[] = [];

  for (const match of code.matchAll(/>([^<>{}]+)</g)) {
    const text = plainText(match[1]);
    if (text && /[a-z]/i.test(text)) body.push(text);
  }

  for (const prop of TEXT_PROPS) {
    for (const match of code.matchAll(new RegExp(`\\b${prop}\\s*=\\s*"([^"]+)"`, "g"))) {
      const text = match[1].trim();
      if (text) body.push(text);
    }
  }

  return body;
}

/**
 * Drops site navigation before the copy is read: a footer, a nav, and a header
 * that holds a nav. Their links help a visitor find a page, they do not compete
 * for the next step, so a full footer must not fail the action or word limits.
 * A header without a nav is a page header with the title and its action, and
 * stays. [BD-1309]
 */
function stripWayfinding(code: string): string {
  return ["header", "nav", "footer"].reduce((text, tag) => removeBlocks(text, tag), code);
}

/**
 * Removes each `<tag>…</tag>` block, a header only when it holds a nav. It
 * walks with indexOf, so an unclosed tag ends the walk instead of making the
 * search quadratic on the server. [BD-1309]
 */
function removeBlocks(code: string, tag: string): string {
  const lower = code.toLowerCase();
  const opening = new RegExp(`<${tag}\\b`, "g");
  let out = "";
  let from = 0;
  for (;;) {
    opening.lastIndex = from;
    const open = opening.exec(lower);
    if (!open) break;
    const close = lower.indexOf(`</${tag}`, open.index);
    if (close === -1) break;
    const closeEnd = lower.indexOf(">", close);
    const end = closeEnd === -1 ? lower.length : closeEnd + 1;
    const block = lower.slice(open.index, end);
    const isSiteNavigation = tag !== "header" || /<nav\b|role\s*=\s*["']navigation["']/.test(block);
    out += code.slice(from, open.index) + (isSiteNavigation ? " " : code.slice(open.index, end));
    from = end;
  }
  return out + code.slice(from);
}

export function extractScreenCopy(code: string): ExtractedScreen {
  const cleaned = stripWayfinding(stripComments(code));
  const { headline, remainder: withoutHeadings } = collectHeadline(cleaned);
  const { actions, unlabelledControls, remainder } = collectActions(withoutHeadings);
  const selfClosing = collectSelfClosingActions(remainder);

  return {
    headline,
    body: collectBody(selfClosing.remainder),
    actions: [...actions, ...selfClosing.actions],
    unlabelledControls,
  };
}
