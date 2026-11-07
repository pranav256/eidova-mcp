import type { LayoutElementSnapshot, LayoutStateSnapshot } from "./types";

/**
 * Browser-side capture helper returned by the MCP tool when no snapshots are
 * supplied. It deliberately reads layout only. It does not upload or persist
 * page source, cookies, form values, or network data.
 */
export function captureSpacingSnapshot(): LayoutStateSnapshot {
  const maxElements = 1500;
  const candidates = Array.from(document.querySelectorAll("body *"));
  // opacity does not inherit, so a child of an `opacity: 0` dialog computes to
  // 1 and keeps a real rectangle. Checking the element alone therefore captures
  // closed menus and dialogs and reports layout findings against them.
  // checkVisibility walks the ancestors; the fallback does the same by hand for
  // the one property that needs it.
  const hiddenByAncestor = (element: Element) => {
    const visible = element.checkVisibility?.({
      opacityProperty: true,
      visibilityProperty: true,
      contentVisibilityAuto: true,
    });
    if (visible !== undefined) return !visible;
    for (let node: Element | null = element; node; node = node.parentElement) {
      if (Number(getComputedStyle(node).opacity) === 0) return true;
    }
    return false;
  };

  const visible = candidates.filter((element) => {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    if (hiddenByAncestor(element)) return false;
    // Nobody can reach an inert subtree, such as a shrunken preview screen
    // drawn at a scale. The capture keeps its root as one box and leaves out
    // what is inside.
    if (element.parentElement?.closest("[inert]")) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }).slice(0, maxElements);

  const ids = new Map<Element, string>();
  const selectorFor = (element: Element, index: number) => {
    const explicit = element.getAttribute("data-bd-inspect-id");
    if (explicit) return explicit;
    if (element.id) return `#${element.id}`;
    const tag = element.tagName.toLowerCase();
    const parent = element.parentElement;
    if (!parent) return `${tag}:${index + 1}`;
    const siblings = Array.from(parent.children).filter((child) => child.tagName === element.tagName);
    return `${tag}:nth-of-type(${siblings.indexOf(element) + 1})@${index + 1}`;
  };
  visible.forEach((element, index) => ids.set(element, selectorFor(element, index)));

  const number = (value: string) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const edges = (style: CSSStyleDeclaration, prefix: "padding" | "margin") => ({
    top: number(style[`${prefix}Top`]),
    right: number(style[`${prefix}Right`]),
    bottom: number(style[`${prefix}Bottom`]),
    left: number(style[`${prefix}Left`]),
  });
  const resolvedLength = (value: string, size: number) => {
    const trimmed = value.trim();
    if (!trimmed.startsWith("calc(") || !trimmed.endsWith(")")) {
      return trimmed.endsWith("%") ? number(trimmed) * size / 100 : number(trimmed);
    }
    const expression = trimmed.slice(5, -1).trim();
    const term = /\s*([+-]?)\s*((?:\d+(?:\.\d*)?|\.\d+))(px|%)/gy;
    let total = 0;
    let cursor = 0;
    while (cursor < expression.length) {
      term.lastIndex = cursor;
      const match = term.exec(expression);
      if (!match) return 0;
      const sign = match[1] === "-" ? -1 : 1;
      const amount = Number(match[2]);
      total += sign * (match[3] === "%" ? amount * size / 100 : amount);
      cursor = term.lastIndex;
    }
    return total;
  };
  const radiusComponents = (value: string) => {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const character of value.trim()) {
      if (/\s/.test(character) && depth === 0) {
        if (current) parts.push(current);
        current = "";
        continue;
      }
      if (character === "(") depth += 1;
      if (character === ")") depth -= 1;
      current += character;
    }
    if (current) parts.push(current);
    return parts;
  };
  const cornerRadius = (value: string, rect: DOMRect) => {
    const [horizontal = "0", vertical = horizontal] = radiusComponents(value);
    return {
      horizontal: resolvedLength(horizontal, rect.width),
      vertical: resolvedLength(vertical, rect.height),
    };
  };
  const attribute = (element: Element, name: string) => element.getAttribute(name) || undefined;
  const alignmentEdge = (
    value: string | undefined,
  ): LayoutElementSnapshot["alignmentEdge"] =>
    value === "left" ||
    value === "right" ||
    value === "top" ||
    value === "bottom" ||
    value === "center-x" ||
    value === "center-y"
      ? value
      : undefined;
  const symmetry = (
    value: string | undefined,
  ): LayoutElementSnapshot["expectedSymmetry"] =>
    value === "horizontal" || value === "vertical" || value === "both"
      ? value
      : undefined;
  const compareSize = (
    value: string | undefined,
  ): LayoutElementSnapshot["compareSize"] =>
    value === "width" || value === "height" || value === "both"
      ? value
      : undefined;
  const interactiveRoles = new Set(["button", "checkbox", "combobox", "link", "menuitem", "radio", "slider", "switch", "tab"]);
  const interactiveTags = new Set(["a", "button", "input", "select", "summary", "textarea"]);

  // How many line boxes the element's text actually rendered. A Range over a text
  // node returns one rect per line, so this counts what the browser drew rather
  // than dividing height by a guessed line-height. Rects sharing a top belong to
  // one line that an inline child split, so they collapse to a single count.
  //
  // The walk follows inline children, because `<strong>` and `<a>` are part of the
  // same run of text, and stops at anything that is not. A block child starts its
  // own flow, so its lines belong to it. An absolutely positioned child is out of
  // flow: that is how a screen-reader-only label is built, and counting its clipped
  // rect turned a one-line price into a two-line block.
  const lineBoxes = (element: Element) => {
    const tops: number[] = [];
    let sawText = false;
    const walk = (node: Element) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3) {
          if (!(child.textContent || "").trim()) continue;
          sawText = true;
          const range = document.createRange();
          range.selectNodeContents(child);
          for (const box of Array.from(range.getClientRects())) {
            if (box.width <= 0 || box.height <= 0) continue;
            if (!tops.some((top) => Math.abs(top - box.top) <= 1)) tops.push(box.top);
          }
          continue;
        }
        if (child.nodeType !== 1) continue;
        // SAFETY: nodeType 1 is an element node, which is what getComputedStyle
        // and this walk both take.
        const childElement = child as Element;
        const childStyle = getComputedStyle(childElement);
        if (childStyle.position === "absolute" || childStyle.position === "fixed") continue;
        if (childStyle.display === "none" || childStyle.visibility === "hidden") continue;
        if (childStyle.display !== "inline" && childStyle.display !== "contents") continue;
        walk(childElement);
      }
    };
    walk(element);
    return sawText && tops.length ? tops.length : undefined;
  };

  // A select showing more than one row is a list box, not a one-line field.
  const controlType = (element: Element): string | undefined => {
    if (element instanceof HTMLSelectElement) return element.multiple || element.size > 1 ? "select-multiple" : "select-one";
    if (element instanceof HTMLInputElement) return element.type;
    return undefined;
  };
  const elements = visible.map((element) => {
    // SAFETY: the handler and lookup target this element type in this DOM.
    const html = element as HTMLElement;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const tag = element.tagName.toLowerCase();
    const role = attribute(element, "role");
    const parentId = element.parentElement ? ids.get(element.parentElement) : undefined;
    const tabIndex = html.tabIndex;
    const interactive = interactiveTags.has(tag) || interactiveRoles.has(role || "") || tabIndex >= 0;
    const explicitLabel = attribute(element, "data-bd-inspect-label") || attribute(element, "aria-label");
    // A control and a heading go by their text and an image by its alt text,
    // so a report names them the way a person sees them.
    const shownText = tag === "img" ? attribute(element, "alt") : interactive || /^h[1-6]$/.test(tag) || role === "heading" ? element.textContent : undefined;
    const text = (explicitLabel || shownText || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const id = ids.get(element)!;
    // For a box that holds an inert picture: how far everything outside the
    // picture reaches, measured from its padding edge.
    const reach = (edge: "right" | "bottom", start: number, inner: number) => Math.max(
      inner,
      ...Array.from(element.querySelectorAll("*"))
        .filter((node) => !node.closest("[inert]"))
        .map((node) => node.getBoundingClientRect()[edge] - start),
    );
    const inertCrop = Array.from(element.children).some((child) => child.hasAttribute("inert"))
      ? {
        width: reach("right", rect.left + html.clientLeft, html.clientWidth),
        height: reach("bottom", rect.top + html.clientTop, html.clientHeight),
      }
      : undefined;

    return {
      id,
      selector: id,
      tag,
      role,
      label: text || undefined,
      parentId,
      groupId: attribute(element, "data-bd-group"),
      alignmentGroup: attribute(element, "data-bd-align-group"),
      alignmentEdge: alignmentEdge(attribute(element, "data-bd-align-edge")),
      expectedSymmetry: symmetry(attribute(element, "data-bd-symmetry")),
      compareSize: compareSize(attribute(element, "data-bd-compare-size")),
      interactive,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      style: {
        display: style.display,
        position: style.position,
        flexDirection: style.flexDirection,
        flexWrap: style.flexWrap,
        alignItems: style.alignItems,
        justifyContent: style.justifyContent,
        rowGap: number(style.rowGap),
        columnGap: number(style.columnGap),
        padding: edges(style, "padding"),
        margin: edges(style, "margin"),
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        textOverflow: style.textOverflow,
        borderRadius: {
          topLeft: cornerRadius(style.borderTopLeftRadius, rect),
          topRight: cornerRadius(style.borderTopRightRadius, rect),
          bottomRight: cornerRadius(style.borderBottomRightRadius, rect),
          bottomLeft: cornerRadius(style.borderBottomLeftRadius, rect),
        },
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
      },
      lineCount: lineBoxes(element),
      inputType: controlType(element),
      clientWidth: html.clientWidth,
      clientHeight: html.clientHeight,
      scrollWidth: html.scrollWidth,
      scrollHeight: html.scrollHeight,
      inertCrop,
    };
  });

  // The kit writes the page's density as CSS variables. Read them from the
  // root, or from the kit's own scope, so the check knows which density the
  // page was built in. One --spacing step is read in pixels so the expected
  // values scale with the system's unit. [BD-1230]
  const variable = (node: Element, name: string) => getComputedStyle(node).getPropertyValue?.(name)?.trim() ?? "";
  const densityScope = [document.documentElement, document.body, document.querySelector(".ds")]
    .find((node): node is Element => Boolean(node && variable(node, "--layout-density")));
  const density = (() => {
    if (!densityScope) return undefined;
    const spacing = variable(densityScope, "--spacing");
    const rootSize = number(getComputedStyle(document.documentElement).fontSize) || 16;
    const amount = Number.parseFloat(spacing);
    const unit = !Number.isFinite(amount) ? undefined
      : /^[\d.]+rem$/.test(spacing) ? amount * rootSize
        : /^[\d.]+px$/.test(spacing) ? amount
          : undefined;
    return {
      mode: variable(densityScope, "--layout-density").slice(0, 20),
      source: variable(densityScope, "--layout-density-source").slice(0, 20) || undefined,
      unit,
    };
  })();

  return {
    name: `viewport-${window.innerWidth}`,
    title: document.title.trim().slice(0, 160) || undefined,
    density,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    elements,
  };
}

/**
 * Turns a function's own source into a script that runs in any page. Wrangler
 * bundles the Worker with esbuild's keep-names, which rewrites the source to
 * call a `__name` helper the page never defines, so every capture stopped with
 * a ReferenceError in production. The script declares a no-op helper instead.
 */
export function pageScript<Result>(fn: () => Result): string {
  return `(() => { const __name = (target) => target; return (${fn.toString()})(); })()`;
}

/**
 * The script a host runs inside the page to measure it. It returns a snapshot
 * rather than a verdict, so the rules stay out of the browser and stay testable.
 */
export const SPACING_CAPTURE_SCRIPT = pageScript(captureSpacingSnapshot);
