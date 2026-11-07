import type { LayoutElementSnapshot, LayoutStateSnapshot } from "./types";

/**
 * One node of a native accessibility tree, as `axe describe-ui` prints it for an
 * iOS simulator. Frames are in points, which play the part of CSS pixels.
 */
export interface NativeAccessibilityNode {
  type?: string;
  role?: string;
  AXLabel?: string | null;
  AXValue?: string | null;
  frame?: { x: number; y: number; width: number; height: number };
  children?: NativeAccessibilityNode[];
}

const INTERACTIVE = new Set(["Button", "CheckBox", "Switch", "Slider", "TextField", "SecureTextField", "Link", "Tab", "Toggle", "PopUpButton", "SearchField"]);
const TAGS = {
  Heading: "h2",
  StaticText: "p",
  Image: "img",
  Button: "button",
  CheckBox: "button",
  Switch: "button",
  Link: "a",
  TextField: "input",
  SearchField: "input",
  ScrollArea: "section",
} as const;

const tagFor = (type: string): string => {
  if (!Object.hasOwn(TAGS, type)) return "div";
  // SAFETY: Object.hasOwn just proved type is one of TAGS' own keys.
  return TAGS[type as keyof typeof TAGS];
};

/** The same cap the web capture has, so a native screen costs the engine no more. */
const MAX_ELEMENTS = 1500;

const sameRect = (a: NativeAccessibilityNode["frame"], b: NativeAccessibilityNode["frame"]) =>
  !!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/**
 * Turns a native accessibility tree into the layout snapshot the spacing engine
 * reads, so a SwiftUI screen is measured with the same rules as a web page.
 * A wrapper that only repeats its parent's frame is folded into the parent, and
 * a node with no area is dropped, since neither adds a box a person sees.
 */
export function nativeTreeToState(
  tree: NativeAccessibilityNode | NativeAccessibilityNode[],
  name: string,
): LayoutStateSnapshot {
  const roots = Array.isArray(tree) ? tree : [tree];
  const app = roots.find((node) => node.frame && node.frame.width > 0) ?? roots[0];
  const viewport = { width: app?.frame?.width ?? 0, height: app?.frame?.height ?? 0 };
  const elements: LayoutElementSnapshot[] = [];

  const visit = (
    node: NativeAccessibilityNode,
    parent: { id?: string; frame?: NativeAccessibilityNode["frame"] },
    insideControl: boolean,
  ) => {
    const frame = node.frame;
    const type = node.type ?? node.role ?? "Group";
    const label = (node.AXLabel ?? "").trim() || undefined;
    let next = parent;
    const folded = type === "Group" && !label && sameRect(frame, parent.frame);
    // A chart reports an accessibility frame wider than the marks it draws, so a
    // container past the screen edge is skipped and its children are measured instead.
    const wideContainer = !!node.children?.length && !!frame && (frame.x < 0 || frame.x + frame.width > viewport.width);
    const interactive = INTERACTIVE.has(type);
    if (elements.length >= MAX_ELEMENTS) return;
    if (frame && frame.width > 0 && frame.height > 0 && !folded && !wideContainer && node !== app) {
      const id = `n${elements.length}`;
      elements.push({
        id,
        tag: tagFor(type),
        role: type === "Heading" ? "heading" : undefined,
        label: label?.slice(0, 160),
        parentId: parent.id,
        interactive: interactive || undefined,
        ...(screenHeading(type, frame, insideControl) && { alignmentGroup: "screen-headings", alignmentEdge: "left" as const }),
        rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
        lineCount: type === "StaticText" || type === "Heading" ? 1 : undefined,
      });
      next = { id, frame };
    }
    for (const child of node.children ?? []) {
      visit(child, next.id ? next : { ...parent, frame: frame ?? parent.frame }, insideControl || interactive);
    }
  };

  // The screen's headings share one left edge unless one is centred, so a
  // heading in the left third joins the group the alignment rule compares.
  const screenHeading = (type: string, frame: NativeAccessibilityNode["frame"], insideControl: boolean) =>
    type === "Heading" && !insideControl && !!frame && frame.x < viewport.width / 3;

  for (const root of roots) visit(root, { frame: app?.frame }, false);
  return { name, title: app?.AXLabel ?? undefined, viewport, elements, platform: "native" };
}
