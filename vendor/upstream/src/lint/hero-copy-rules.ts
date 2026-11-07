import type { Finding, LintInput } from "./types";

// review-rules.md "Copy laid over the product" (rule/copy-off-the-product).
// The page's first h1 must not sit on top of a full-bleed photo or video: the
// copy then crosses the product, and a dark wash over it hides the one thing
// the page sells. The check reads source text only, so it works on a one-file
// HTML page and on JSX alike, and it stays linear in the file's length. [BD-1309]

const RULE_ID = "slop/copy-over-product";
const VOID_TAGS = new Set(["img", "br", "hr", "input", "meta", "link", "source", "track", "wbr", "area", "base", "col", "embed", "param"]);
const MEDIA_TAGS = new Set(["img", "video", "picture"]);
const REGION_TAGS = new Set(["section", "header", "main", "article"]);
/** A hero sits near the top of the tree, so nesting past this depth is read as flat. */
const MAX_DEPTH = 64;
/** Attribute and rule text past this length is not read, so one huge value cannot slow the check. */
const MAX_TEXT = 4000;

interface Tag {
  name: string;
  attrs: string;
  start: number;
  parent: Tag | null;
  children: Tag[];
}

interface ClassRule {
  positioned: boolean;
  covers: boolean;
  imageBackground: boolean;
}

/** Index of the `>` that ends the tag starting at `from`, skipping quoted text and JSX braces, or -1. */
function tagEnd(content: string, from: number): number {
  let quote: string | null = null;
  let braces = 0;
  for (let j = from; j < content.length; j++) {
    const ch = content[j];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "\"" || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") braces++;
    else if (ch === "}") braces = Math.max(0, braces - 1);
    else if (ch === ">" && braces === 0) return j;
  }
  return -1;
}

/** Reads opening and closing tags into a tree, so `=>` inside a JSX attribute never ends a tag. */
function readTags(content: string): Tag[] {
  const roots: Tag[] = [];
  const stack: Tag[] = [];
  // Lowered once: lowering the file per style tag would make many style tags quadratic.
  const lower = content.toLowerCase();
  let i = 0;
  while (i < content.length) {
    const lt = content.indexOf("<", i);
    if (lt === -1) break;
    const closing = content[lt + 1] === "/";
    const nameStart = closing ? lt + 2 : lt + 1;
    const nameMatch = /^[A-Za-z][\w.-]*/.exec(content.slice(nameStart, nameStart + 64));
    if (!nameMatch) {
      i = lt + 1;
      continue;
    }
    const name = nameMatch[0].toLowerCase();
    const end = tagEnd(content, nameStart + nameMatch[0].length);
    // An unclosed tag runs to the end of the file, so nothing after it is a tag.
    if (end === -1) break;
    const attrs = content.slice(nameStart + nameMatch[0].length, end);
    i = end + 1;
    if (closing) {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].name !== name) continue;
        stack.length = k;
        break;
      }
      continue;
    }
    const parent = stack[stack.length - 1] ?? null;
    const tag: Tag = { name, attrs, start: lt, parent, children: [] };
    (parent ? parent.children : roots).push(tag);
    if (name === "script" || name === "style") {
      const close = lower.indexOf(`</${name}`, i);
      i = close === -1 ? content.length : close;
      continue;
    }
    // Past MAX_DEPTH a tag is read as a leaf, which bounds a closing tag's search of the stack.
    if (VOID_TAGS.has(name) || attrs.trimEnd().endsWith("/") || stack.length >= MAX_DEPTH) continue;
    stack.push(tag);
  }
  return roots;
}

function classNames(attrs: string): string[] {
  const match = /\b(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["'`]([^"'`]*)["'`]\s*\})/.exec(attrs.slice(0, MAX_TEXT));
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").split(/\s+/).filter(Boolean);
}

function hasImageBackground(text: string): boolean {
  const clipped = text.slice(0, MAX_TEXT);
  return /background(?:-image|Image)?\s*:[^;}]{0,400}url\(/i.test(clipped) || /\bbg-\[url\(/.test(clipped);
}

function isPositioned(text: string): boolean {
  return /position\s*:\s*["']?(?:absolute|fixed)/i.test(text.slice(0, MAX_TEXT));
}

function coversArea(text: string): boolean {
  const clipped = text.slice(0, MAX_TEXT);
  return /\binset\s*:\s*["']?0(?![.\d])/i.test(clipped) || /object-?fit\s*:\s*["']?cover/i.test(clipped);
}

/** The text inside each style block, found with indexOf so an unclosed tag cannot make the search quadratic. */
function styleBlocks(content: string): string[] {
  const lower = content.toLowerCase();
  const blocks: string[] = [];
  let from = 0;
  while (from < lower.length) {
    const open = lower.indexOf("<style", from);
    if (open === -1) break;
    const bodyStart = lower.indexOf(">", open);
    if (bodyStart === -1) break;
    const close = lower.indexOf("</style", bodyStart);
    if (close === -1) break;
    blocks.push(content.slice(bodyStart + 1, close));
    from = close + 7;
  }
  return blocks;
}

/** Collects what each class name sets in the file's own style blocks. */
function classRules(content: string): Map<string, ClassRule> {
  const rules = new Map<string, ClassRule>();
  for (const block of styleBlocks(content)) {
    // One pass: each chunk ends at a closing brace, and its last opening brace
    // splits the selector from the declarations.
    for (const chunk of block.split("}")) {
      const brace = chunk.lastIndexOf("{");
      if (brace === -1) continue;
      const body = chunk.slice(brace + 1);
      const flags = { positioned: isPositioned(body), covers: coversArea(body), imageBackground: hasImageBackground(body) };
      if (!flags.positioned && !flags.covers && !flags.imageBackground) continue;
      for (const selector of chunk.slice(Math.max(0, brace - MAX_TEXT), brace).split(",")) {
        // Only the last compound names the element the declarations land on.
        const last = selector.trim().split(/[\s>+~]+/).filter(Boolean).pop() ?? "";
        for (const [, name] of last.matchAll(/\.([\w-]+)/g)) {
          const prev = rules.get(name) ?? { positioned: false, covers: false, imageBackground: false };
          rules.set(name, {
            positioned: prev.positioned || flags.positioned,
            covers: prev.covers || flags.covers,
            imageBackground: prev.imageBackground || flags.imageBackground,
          });
        }
      }
    }
  }
  return rules;
}

function layoutFacts(tag: Tag, rules: Map<string, ClassRule>): ClassRule {
  const classes = classNames(tag.attrs);
  const fromClasses = classes.map((name) => rules.get(name)).filter((rule): rule is ClassRule => Boolean(rule));
  const tailwindPositioned = classes.includes("absolute") || classes.includes("fixed");
  const tailwindCovers = classes.includes("inset-0") || classes.includes("object-cover");
  return {
    positioned: tailwindPositioned || isPositioned(tag.attrs) || fromClasses.some((rule) => rule.positioned),
    covers: tailwindCovers || coversArea(tag.attrs) || fromClasses.some((rule) => rule.covers),
    imageBackground: hasImageBackground(tag.attrs) || fromClasses.some((rule) => rule.imageBackground),
  };
}

function firstTag(tags: Tag[], name: string): Tag | null {
  for (const tag of tags) {
    if (tag.name === name) return tag;
    const found = firstTag(tag.children, name);
    if (found) return found;
  }
  return null;
}

/** Whether a tag or any ancestor inside the hero region is positioned out of flow, and whether one covers its box. */
type Reach = Pick<ClassRule, "positioned" | "covers">;

/** A media element behind the copy: positioned out of flow and covering its box, set by itself or a wrapper inside the region. */
function coveringMedia(region: Tag, heading: Tag, rules: Map<string, ClassRule>): Tag | null {
  const headingBranch = new Set<Tag>();
  for (let node: Tag | null = heading; node && node !== region; node = node.parent) headingBranch.add(node);
  // Each tag's facts, and what it and its ancestors inside the region add up to, are
  // read once: thousands of media tags under one deep wrapper would otherwise rescan it each time.
  const factsOf = new Map<Tag, ClassRule>();
  const facts = (tag: Tag): ClassRule => {
    let found = factsOf.get(tag);
    if (!found) factsOf.set(tag, (found = layoutFacts(tag, rules)));
    return found;
  };
  const reachOf = new Map<Tag, Reach>();
  const reach = (tag: Tag): Reach => {
    const known = reachOf.get(tag);
    if (known) return known;
    const own = facts(tag);
    const above: Reach = tag.parent && tag.parent !== region ? reach(tag.parent) : { positioned: false, covers: false };
    const result: Reach = { positioned: own.positioned || above.positioned, covers: own.covers || above.covers };
    reachOf.set(tag, result);
    return result;
  };
  const queue = [...region.children];
  for (let index = 0; index < queue.length; index++) {
    const tag = queue[index];
    if (headingBranch.has(tag)) {
      // A wrapper around the copy that paints a photo puts the copy on the photo.
      if (facts(tag).imageBackground) return tag;
      if (tag !== heading) queue.push(...tag.children);
      continue;
    }
    if (MEDIA_TAGS.has(tag.name) || facts(tag).imageBackground) {
      const { positioned, covers } = reach(tag);
      if (positioned && covers) return tag;
      if (MEDIA_TAGS.has(tag.name)) continue;
    }
    queue.push(...tag.children);
  }
  return null;
}

/** Flags the page's first h1 when it sits over a full-bleed photo or video in its own hero region. */
export function copyOverProductFindings(input: LintInput): Finding[] {
  const heading = firstTag(readTags(input.content), "h1");
  if (!heading) return [];
  // The hero region is the nearest section-like ancestor. Without one, it is the
  // outermost ancestor named hero, so an inner "hero-copy" wrapper never stands in for it.
  let region: Tag | null = null;
  let heroNamed: Tag | null = null;
  for (let node = heading.parent; node; node = node.parent) {
    if (REGION_TAGS.has(node.name)) {
      region = node;
      break;
    }
    if (classNames(node.attrs).some((name) => /hero/i.test(name))) heroNamed = node;
  }
  region ??= heroNamed ?? heading.parent;
  if (!region) return [];
  const rules = classRules(input.content);
  const media = layoutFacts(region, rules).imageBackground ? region : coveringMedia(region, heading, rules);
  if (!media) return [];
  const line = input.content.slice(0, heading.start).split("\n").length;
  return [{
    file: input.path,
    line,
    severity: "serious",
    ruleId: RULE_ID,
    snippet: input.content.split(/\r?\n/)[line - 1]?.trim() ?? "",
    message: "The page title sits on top of a full-bleed photo or video, so the copy crosses the product and a wash over it hides what the page sells.",
    fix: "Put the title and its action beside the product, in a two-column hero, or in the photo's empty space. Never lay copy across the product or its subject.",
    kind: "measured-source",
  }];
}
