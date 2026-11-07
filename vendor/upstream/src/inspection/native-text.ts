/**
 * Geometry for the spacing rules that run only on a native screen, where the
 * accessibility tree gives every frame. `spacing.ts` turns each pair into a
 * finding. [BD-1324] [BD-1330]
 */

import type { LayoutElementSnapshot, LayoutStateSnapshot } from "./types";

/** A control and the content it hides, with the hidden area in points. */
export interface CoveredText {
  control: LayoutElementSnapshot;
  text: LayoutElementSnapshot;
  area: number;
}

/**
 * A native control placed on top of content in the same scroll view, such as a
 * button stacked over a chart, hides that content. A control that hides a fifth
 * or more of a labelled leaf in its own scroll view counts. A bar that floats
 * over the scroll view, such as a tab bar or a floating button, is left alone:
 * content scrolls under it by design.
 */
export function coveredTextPairs(state: LayoutStateSnapshot): CoveredText[] {
  const parents = new Map(state.elements.map((element) => [element.id, element.parentId]));
  const contains = (ancestorId: string, id: string | undefined) => {
    for (let current = id; current; current = parents.get(current)) if (current === ancestorId) return true;
    return false;
  };
  const scrollViews = new Set(state.elements.filter((element) => element.tag === "section").map((element) => element.id));
  const scrollViewOf = (id: string) => {
    for (let current = parents.get(id); current; current = parents.get(current)) if (scrollViews.has(current)) return current;
    return undefined;
  };
  const parentIds = new Set(state.elements.map((element) => element.parentId));
  // Content is a labelled leaf a person reads: text, an icon, a chart's bar and its axis label.
  const texts = state.elements.filter((element) => element.label && !element.interactive && !parentIds.has(element.id));
  const pairs: CoveredText[] = [];
  for (const control of state.elements.filter((element) => element.interactive)) {
    for (const text of texts) {
      if (contains(control.id, text.id) || contains(text.id, control.id)) continue;
      if (scrollViewOf(control.id) !== scrollViewOf(text.id)) continue;
      const width = Math.min(control.rect.x + control.rect.width, text.rect.x + text.rect.width) - Math.max(control.rect.x, text.rect.x);
      const height = Math.min(control.rect.y + control.rect.height, text.rect.y + text.rect.height) - Math.max(control.rect.y, text.rect.y);
      if (width <= 0 || height <= 0 || width * height < text.rect.width * text.rect.height * 0.2) continue;
      pairs.push({ control, text, area: width * height });
    }
  }
  return pairs;
}

/** Two stacked lines of text, with how far the lower one starts inside the upper one. */
export interface CrowdedText {
  upper: LayoutElementSnapshot;
  lower: LayoutElementSnapshot;
  overlap: number;
}

/**
 * Two lines of native text stacked so close that their frames overlap read as
 * one cramped block, such as a date that `.navigationSubtitle` places inside the
 * large title's frame. A pair counts when it shares a column and the lower line
 * starts below the middle of the upper one, so two labels on one row never match.
 */
export function crowdedTextPairs(state: LayoutStateSnapshot): CrowdedText[] {
  const lines = state.elements.filter((element) => element.label && (element.tag === "p" || element.tag === "h2"));
  const pairs: CrowdedText[] = [];
  for (const upper of lines) {
    for (const lower of lines) {
      if (upper === lower) continue;
      const sharedWidth = Math.min(upper.rect.x + upper.rect.width, lower.rect.x + lower.rect.width) - Math.max(upper.rect.x, lower.rect.x);
      const upperBottom = upper.rect.y + upper.rect.height;
      const overlap = upperBottom - lower.rect.y;
      // A line wholly inside the other frame is the same text, read once by a combined element.
      const inside = lower.rect.y + lower.rect.height <= upperBottom + 0.5;
      if (sharedWidth <= 0 || inside || lower.rect.y <= upper.rect.y + upper.rect.height / 2 || overlap < 1) continue;
      pairs.push({ upper, lower, overlap });
    }
  }
  return pairs;
}
