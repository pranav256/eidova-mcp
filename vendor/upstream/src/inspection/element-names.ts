import type { LayoutElementSnapshot, LayoutStateSnapshot } from "./types";

/** A word for what an element is, by its role or tag. */
interface NounTable {
  readonly [key: string]: string;
}

// What an element is, in words, for one without a label of its own.
const NOUN_BY_ROLE = {
  list: "list", listitem: "list item", navigation: "navigation", button: "button", link: "link",
  tab: "tab", tablist: "tab row", menu: "menu", dialog: "dialog", form: "form", table: "table", heading: "heading",
} satisfies NounTable;
const NOUN_BY_TAG = {
  ul: "list", ol: "list", li: "list item", nav: "navigation", header: "header", footer: "footer",
  section: "section", form: "form", table: "table", button: "button", a: "link", input: "field",
  select: "menu", textarea: "text box", img: "image", aside: "sidebar", main: "main area",
  p: "paragraph", h1: "heading", h2: "heading", h3: "heading", h4: "heading", h5: "heading", h6: "heading",
  label: "label",
} satisfies NounTable;
const LABEL_LENGTH = 48;
// How far up an element without a name looks for a named area around it.
const PARENT_STEPS = 4;

// Roles and tags are caller input, so only the table's own words count, never
// a built-in such as "constructor".
function nounIn(table: NounTable, key: string | undefined): string | undefined {
  return key && Object.hasOwn(table, key) ? table[key] : undefined;
}

function noun(element: LayoutElementSnapshot): string {
  return nounIn(NOUN_BY_ROLE, element.role) ?? nounIn(NOUN_BY_TAG, element.tag)
    ?? (element.interactive ? "control" : element.lineCount ? "text block" : "group");
}

function usableLabel(element: LayoutElementSnapshot): string | null {
  const label = element.label?.trim();
  return label && label.length <= LABEL_LENGTH ? label : null;
}

// "“Apple”", "“Apple” and “Atelier”", "“Apple”, “Atelier” and 2 more".
function heldList(labels: string[]): string {
  const quoted = labels.map((label) => `“${label}”`);
  if (quoted.length > 3) return `${quoted.slice(0, 2).join(", ")} and ${quoted.length - 2} more`;
  return quoted.length < 2 ? quoted.join("") : `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
}

/**
 * Names every element in one captured state, by id, for a person to read. An
 * element with a short label goes by it. One without goes by what it holds:
 * "the list holding “Starter”, “Team” and “Enterprise”", where a child without
 * a label goes by the first label inside it, such as a card by its button. With
 * nothing to quote, it goes by the nearest named area around it, "an unnamed
 * group inside “Pricing” (id x11)", else by the heading before it in page
 * order, "an unnamed group under “Pricing” (id x11)". With neither, it is "an
 * unnamed group with id x11", so an agent can still find it. Ids are caller
 * input and may repeat, so each lookup runs once per id.
 */
export function nameElements(state: LayoutStateSnapshot): Map<string, string> {
  const children = new Map<string, LayoutElementSnapshot[]>();
  for (const element of state.elements) {
    if (!element.parentId) continue;
    const list = children.get(element.parentId);
    if (list) list.push(element);
    else children.set(element.parentId, [element]);
  }
  const below = new Map<string, string | null>();
  const labelIn = (node: LayoutElementSnapshot, depth: number): string | null => {
    const own = usableLabel(node);
    if (own || depth === 0) return own;
    const key = `${depth}:${node.id}`;
    if (below.has(key)) return below.get(key) ?? null;
    below.set(key, null);
    for (const kid of children.get(node.id) ?? []) {
      const found = labelIn(kid, depth - 1);
      if (found) {
        below.set(key, found);
        return found;
      }
    }
    return null;
  };
  const byId = new Map<string, LayoutElementSnapshot>();
  for (const element of state.elements) if (!byId.has(element.id)) byId.set(element.id, element);
  // The name an element earns from itself and what it holds, or null.
  const quotable = new Map<string, string | null>();
  const quotableName = (element: LayoutElementSnapshot): string | null => {
    const cached = quotable.get(element.id);
    if (cached !== undefined) return cached;
    const own = usableLabel(element);
    const held = own ? [] : (children.get(element.id) ?? []).flatMap((child) => labelIn(child, 2) ?? []);
    const name = own ?? (held.length ? `the ${noun(element)} holding ${heldList(held)}` : null);
    quotable.set(element.id, name);
    return name;
  };
  // The nearest named area around an element, quoted when it is a label.
  const around = (element: LayoutElementSnapshot): string | null => {
    let parent = element.parentId ? byId.get(element.parentId) : undefined;
    for (let step = 0; parent && step < PARENT_STEPS; step++) {
      const name = quotableName(parent);
      if (name) return usableLabel(parent) ? `“${name}”` : name;
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return null;
  };
  // The heading a person reads last before each element, in page order.
  const headingBefore = new Map<string, string>();
  let heading: string | null = null;
  for (const element of state.elements) {
    if (heading && !headingBefore.has(element.id)) headingBefore.set(element.id, heading);
    if (noun(element) === "heading") heading = usableLabel(element) ?? heading;
  }
  const names = new Map<string, string>();
  for (const element of state.elements) {
    if (names.has(element.id)) continue;
    const own = quotableName(element);
    if (own) {
      names.set(element.id, own);
      continue;
    }
    const area = around(element);
    const under = headingBefore.get(element.id);
    const place = area ? `inside ${area}` : under ? `under “${under}”` : null;
    names.set(element.id, place ? `an unnamed ${noun(element)} ${place} (id ${element.id})` : `an unnamed ${noun(element)} with id ${element.id}`);
  }
  return names;
}
