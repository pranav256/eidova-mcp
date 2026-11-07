import type {
  AlignmentEdge,
  InspectionFinding,
  InspectionSeverity,
  LayoutCornerRadii,
  LayoutElementSnapshot,
  LayoutRect,
  LayoutStateSnapshot,
  SpacingInspectionInput,
  SpacingInspectionResult,
} from "./types";
import { nameElements } from "./element-names";
import { inspectDensity } from "./density-roles";
import { coveredTextPairs, crowdedTextPairs } from "./native-text";

/** The spacing steps a value is judged against when the caller names no scale of its own. */
export const DEFAULT_SPACING_SCALE = [4, 8, 12, 16, 24, 32, 48, 64, 96, 128] as const;

const MAX_FINDINGS = 80;
const INTERACTIVE_TAGS = new Set(["button", "input", "select", "textarea", "summary"]);
const INTERACTIVE_ROLES = new Set(["button", "checkbox", "combobox", "link", "menuitem", "radio", "slider", "switch", "tab"]);

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function finite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function difference(values: number[]): number {
  return values.length ? Math.max(...values) - Math.min(...values) : 0;
}

function uniqueMeasurements(values: number[], tolerance: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const unique: number[] = [];
  for (const value of sorted) {
    if (!unique.some((item) => Math.abs(item - value) <= tolerance)) unique.push(value);
  }
  return unique;
}

function elementName(element: LayoutElementSnapshot): string {
  const label = element.label?.trim();
  if (label && label.length <= 48) return label;
  return element.selector?.trim() || element.id;
}

function severityForDelta(delta: number): InspectionSeverity {
  return delta >= 4 ? "serious" : "moderate";
}

function isInteractive(element: LayoutElementSnapshot): boolean {
  return element.interactive === true
    || INTERACTIVE_TAGS.has(element.tag?.toLowerCase() ?? "")
    || INTERACTIVE_ROLES.has(element.role?.toLowerCase() ?? "");
}

function makeFinding(
  findings: InspectionFinding[],
  finding: Omit<InspectionFinding, "id">,
): void {
  // Past the cap the rules keep running and their findings are dropped, so a
  // noisy first state can hide every later one. Counting what was dropped is
  // what stops the result reading as a complete picture.
  if (findings.length >= MAX_FINDINGS) {
    dropped += 1;
    return;
  }
  findings.push({ ...finding, id: `spacing-${findings.length + 1}` });
}

function inspectSymmetry(
  state: LayoutStateSnapshot,
  tolerance: number,
  findings: InspectionFinding[],
): void {
  for (const element of state.elements) {
    const padding = element.style?.padding;
    if (!padding) continue;

    const expected = element.expectedSymmetry;
    // A select keeps room for its arrow on one side, so only an explicit
    // data-bd-symmetry asks for even padding on it.
    const implicit = isInteractive(element) && element.tag?.toLowerCase() !== "select";
    const horizontal = expected === "horizontal" || expected === "both" || implicit;
    const vertical = expected === "vertical" || expected === "both";

    if (horizontal) {
      const delta = Math.abs(padding.left - padding.right);
      if (delta > tolerance) {
        makeFinding(findings, {
          ruleId: "spacing/asymmetric-horizontal-inset",
          state: state.name,
          severity: severityForDelta(delta),
          message: `${elementName(element)} has asymmetric horizontal padding: ${rounded(padding.left)}px left and ${rounded(padding.right)}px right.`,
          fix: "Use the same spacing token on both horizontal edges, unless the asymmetry is intentional and documented.",
          elementIds: [element.id],
          evidence: [
            { label: "Left padding", value: rounded(padding.left), unit: "px" },
            { label: "Right padding", value: rounded(padding.right), unit: "px" },
            { label: "Difference", value: rounded(delta), unit: "px" },
          ],
        });
      }
    }

    if (vertical) {
      const delta = Math.abs(padding.top - padding.bottom);
      if (delta > tolerance) {
        makeFinding(findings, {
          ruleId: "spacing/asymmetric-vertical-inset",
          state: state.name,
          severity: severityForDelta(delta),
          message: `${elementName(element)} has asymmetric vertical padding: ${rounded(padding.top)}px top and ${rounded(padding.bottom)}px bottom.`,
          fix: "Use the same spacing token on both vertical edges, unless the asymmetry is intentional and documented.",
          elementIds: [element.id],
          evidence: [
            { label: "Top padding", value: rounded(padding.top), unit: "px" },
            { label: "Bottom padding", value: rounded(padding.bottom), unit: "px" },
            { label: "Difference", value: rounded(delta), unit: "px" },
          ],
        });
      }
    }
  }
}

const CORNER_SIDES = [
  ["topLeft", "top", "left", "top-left"],
  ["topRight", "top", "right", "top-right"],
  ["bottomRight", "bottom", "right", "bottom-right"],
  ["bottomLeft", "bottom", "left", "bottom-left"],
] as const;

function hasVisibleColor(value: string | undefined): boolean {
  if (!value || value === "transparent") return false;
  const alpha = value.match(/(?:,|\/)\s*([0-9.]+)(?:%)?\s*\)$/);
  if (!alpha) return true;
  const amount = Number(alpha[1]);
  return Number.isFinite(amount) && amount > 0;
}

function paintsSurface(element: LayoutElementSnapshot): boolean {
  const style = element.style;
  if (!style) return false;
  return hasVisibleColor(style.backgroundColor)
    || Boolean(style.backgroundImage && style.backgroundImage !== "none")
    || Boolean(style.boxShadow && style.boxShadow !== "none");
}

function nearestPaintedAncestor(
  element: LayoutElementSnapshot,
  byId: Map<string, LayoutElementSnapshot>,
): LayoutElementSnapshot | undefined {
  const seen = new Set<string>();
  let parentId = element.parentId;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) return undefined;
    if (paintsSurface(parent)) return parent;
    parentId = parent.parentId;
  }
  return undefined;
}

function radiusAxes(value: LayoutCornerRadii["topLeft"]) {
  return {
    horizontal: Math.max(0, value.horizontal),
    vertical: Math.max(0, value.vertical),
  };
}

function normalizedRadii(radii: LayoutCornerRadii, rect: LayoutRect) {
  const raw = {
    topLeft: radiusAxes(radii.topLeft),
    topRight: radiusAxes(radii.topRight),
    bottomRight: radiusAxes(radii.bottomRight),
    bottomLeft: radiusAxes(radii.bottomLeft),
  };
  const ratios = [
    rect.width / (raw.topLeft.horizontal + raw.topRight.horizontal),
    rect.width / (raw.bottomLeft.horizontal + raw.bottomRight.horizontal),
    rect.height / (raw.topLeft.vertical + raw.bottomLeft.vertical),
    rect.height / (raw.topRight.vertical + raw.bottomRight.vertical),
  ].filter(Number.isFinite);
  const scale = Math.min(1, ...ratios);
  const scaled = (radius: LayoutCornerRadii["topLeft"]) => ({
    horizontal: radius.horizontal * scale,
    vertical: radius.vertical * scale,
  });
  return {
    topLeft: scaled(raw.topLeft),
    topRight: scaled(raw.topRight),
    bottomRight: scaled(raw.bottomRight),
    bottomLeft: scaled(raw.bottomLeft),
  };
}

function nestedInsets(parent: LayoutRect, child: LayoutRect) {
  return {
    top: child.y - parent.y,
    right: parent.x + parent.width - child.x - child.width,
    bottom: parent.y + parent.height - child.y - child.height,
    left: child.x - parent.x,
  };
}

function expectedNestedRadii(
  parent: ReturnType<typeof normalizedRadii>,
  insets: ReturnType<typeof nestedInsets>,
  childRect: LayoutRect,
) {
  return normalizedRadii({
    topLeft: {
      horizontal: Math.max(0, parent.topLeft.horizontal - insets.left),
      vertical: Math.max(0, parent.topLeft.vertical - insets.top),
    },
    topRight: {
      horizontal: Math.max(0, parent.topRight.horizontal - insets.right),
      vertical: Math.max(0, parent.topRight.vertical - insets.top),
    },
    bottomRight: {
      horizontal: Math.max(0, parent.bottomRight.horizontal - insets.right),
      vertical: Math.max(0, parent.bottomRight.vertical - insets.bottom),
    },
    bottomLeft: {
      horizontal: Math.max(0, parent.bottomLeft.horizontal - insets.left),
      vertical: Math.max(0, parent.bottomLeft.vertical - insets.bottom),
    },
  }, childRect);
}

function fillsParentInnerAxis(
  parent: LayoutElementSnapshot,
  child: LayoutElementSnapshot,
  tolerance: number,
): boolean {
  const insets = nestedInsets(parent.rect, child.rect);
  const padding = parent.style?.padding;
  if (!padding) return false;
  const parentRadii = parent.style?.borderRadius;
  const radii = parentRadii
    ? Object.values(normalizedRadii(parentRadii, parent.rect)).flatMap((radius) => [
        radius.horizontal,
        radius.vertical,
      ])
    : [];
  const radius = Math.max(...radii, 0);
  const trackTolerance = Math.max(tolerance, 2);
  const fillsHeight = Math.abs(insets.top - insets.bottom) <= trackTolerance
    && Math.abs(insets.top - padding.top) <= trackTolerance
    && Math.abs(insets.bottom - padding.bottom) <= trackTolerance
    && Math.max(insets.top, insets.bottom) <= radius + tolerance;
  const fillsWidth = Math.abs(insets.left - insets.right) <= trackTolerance
    && Math.abs(insets.left - padding.left) <= trackTolerance
    && Math.abs(insets.right - padding.right) <= trackTolerance
    && Math.max(insets.left, insets.right) <= radius + tolerance;
  return fillsHeight !== fillsWidth;
}

function radiusMismatch(
  parent: LayoutElementSnapshot,
  child: LayoutElementSnapshot,
  tolerance: number,
) {
  const parentRadii = parent.style?.borderRadius;
  const childRadii = child.style?.borderRadius;
  if (!parentRadii || !childRadii) return undefined;
  const insets = nestedInsets(parent.rect, child.rect);
  const normalizedParent = normalizedRadii(parentRadii, parent.rect);
  const normalizedChild = normalizedRadii(childRadii, child.rect);
  const normalizedExpected = expectedNestedRadii(normalizedParent, insets, child.rect);

  for (const [corner, vertical, horizontal, label] of CORNER_SIDES) {
    const parentRadius = normalizedParent[corner];
    const childRadius = normalizedChild[corner];
    const verticalInset = insets[vertical];
    const horizontalInset = insets[horizontal];
    if (Math.max(parentRadius.horizontal, parentRadius.vertical) <= tolerance) continue;
    if (verticalInset < -tolerance || horizontalInset < -tolerance) continue;
    if (verticalInset > parentRadius.vertical + tolerance
      || horizontalInset > parentRadius.horizontal + tolerance) continue;
    if (Math.abs(verticalInset - horizontalInset) > tolerance) continue;
    const expected = normalizedExpected[corner];
    const delta = {
      horizontal: Math.abs(childRadius.horizontal - expected.horizontal),
      vertical: Math.abs(childRadius.vertical - expected.vertical),
    };
    const largestDelta = Math.max(delta.horizontal, delta.vertical);
    if (largestDelta > tolerance) {
      return {
        label,
        parentRadius,
        childRadius,
        inset: { horizontal: horizontalInset, vertical: verticalInset },
        expected,
        delta,
        largestDelta,
      };
    }
  }
  return undefined;
}

// Overflow that hides what does not fit, rather than showing or scrolling it.
function clips(overflow?: string): boolean {
  return overflow === "hidden" || overflow === "clip";
}

function clipsBothAxes(element: LayoutElementSnapshot): boolean {
  return clips(element.style?.overflowX) && clips(element.style?.overflowY);
}

// How far in a parent's corner curve reaches, as a share of its radius: a
// square corner closer than 1 - 1/√2 of the radius gets cut by the curve.
const CURVE_REACH = 1 - Math.SQRT1_2;

function inspectConcentricRadii(
  state: LayoutStateSnapshot,
  tolerance: number,
  findings: InspectionFinding[],
): void {
  const byId = new Map(state.elements.map((element) => [element.id, element]));
  for (const child of state.elements) {
    const parent = nearestPaintedAncestor(child, byId);
    if (!parent || !paintsSurface(child)) continue;
    if (!fillsParentInnerAxis(parent, child, tolerance)) continue;
    const mismatch = radiusMismatch(parent, child, tolerance);
    if (!mismatch) continue;
    // A parent that clips its content cuts a corner that sits inside its own
    // curve, so that corner's radius never shows. Further in, it shows in full.
    if (clipsBothAxes(parent)
      && mismatch.inset.horizontal < CURVE_REACH * mismatch.parentRadius.horizontal
      && mismatch.inset.vertical < CURVE_REACH * mismatch.parentRadius.vertical) continue;
    makeFinding(findings, {
      ruleId: "spacing/non-concentric-radius",
      state: state.name,
      severity: severityForDelta(mismatch.largestDelta),
      message: `${elementName(child)} has ${rounded(mismatch.childRadius.horizontal)} × ${rounded(mismatch.childRadius.vertical)}px ${mismatch.label} corners inside ${elementName(parent)}; the measured inset calls for about ${rounded(mismatch.expected.horizontal)} × ${rounded(mismatch.expected.vertical)}px.`,
      fix: "Set each outer-facing radius axis to the parent axis minus its inset, with CSS radius scaling applied.",
      elementIds: [parent.id, child.id],
      evidence: [
        { label: "Parent radius", value: rounded(Math.min(mismatch.parentRadius.horizontal, mismatch.parentRadius.vertical)), unit: "px" },
        { label: "Child radius", value: rounded(Math.min(mismatch.childRadius.horizontal, mismatch.childRadius.vertical)), unit: "px" },
        { label: "Inset", value: rounded(Math.min(mismatch.inset.horizontal, mismatch.inset.vertical)), unit: "px" },
        { label: "Expected radius", value: rounded(Math.min(mismatch.expected.horizontal, mismatch.expected.vertical)), unit: "px" },
        { label: "Difference", value: rounded(mismatch.largestDelta), unit: "px" },
        { label: "Expected horizontal radius", value: rounded(mismatch.expected.horizontal), unit: "px" },
        { label: "Expected vertical radius", value: rounded(mismatch.expected.vertical), unit: "px" },
        { label: "Horizontal difference", value: rounded(mismatch.delta.horizontal), unit: "px" },
        { label: "Vertical difference", value: rounded(mismatch.delta.vertical), unit: "px" },
      ],
    });
  }
}

function inspectSpacingScale(
  state: LayoutStateSnapshot,
  scale: number[],
  tolerance: number,
  findings: InspectionFinding[],
): void {
  const violations: Array<{ element: LayoutElementSnapshot; label: string; value: number }> = [];
  for (const element of state.elements) {
    const style = element.style;
    if (!style) continue;
    const edges = [
      ["Padding top", style.padding?.top],
      ["Padding right", style.padding?.right],
      ["Padding bottom", style.padding?.bottom],
      ["Padding left", style.padding?.left],
      ["Margin top", style.margin?.top],
      ["Margin right", style.margin?.right],
      ["Margin bottom", style.margin?.bottom],
      ["Margin left", style.margin?.left],
      ["Row gap", style.rowGap],
      ["Column gap", style.columnGap],
    ] as const;

    for (const [label, value] of edges) {
      if (!finite(value) || value <= 0) continue;
      if (!scale.some((token) => Math.abs(token - value) <= tolerance)) {
        violations.push({ element, label, value: rounded(value) });
      }
    }
  }

  if (violations.length === 0) return;
  const distinctValues = uniqueMeasurements(violations.map((item) => item.value), tolerance);
  const elementIds = [...new Set(violations.map((item) => item.element.id))];
  makeFinding(findings, {
    ruleId: "spacing/off-scale-value",
    state: state.name,
    severity: "moderate",
    message: `${state.name} uses ${distinctValues.length} off-scale spacing value${distinctValues.length === 1 ? "" : "s"} across ${elementIds.length} element${elementIds.length === 1 ? "" : "s"}: ${distinctValues.map((value) => `${rounded(value)}px`).join(", ")}.`,
    fix: `Replace the measured values with the nearest project spacing token. Active scale: ${scale.join(", ")}px.`,
    elementIds,
    evidence: violations.slice(0, 20).map(({ element, label, value }) => ({
      label: `${elementName(element)} ${label.toLowerCase()}`,
      value,
      unit: "px" as const,
    })),
  });
}

function actualSiblingGaps(
  parent: LayoutElementSnapshot,
  children: LayoutElementSnapshot[],
): number[] {
  const direction = parent.style?.flexDirection ?? "row";
  const display = parent.style?.display;
  const wrap = parent.style?.flexWrap;
  // inline-flex lays out its children exactly the same way, and wrap-reverse
  // wraps just as wrap does. Reading only "flex" and "wrap" skipped the first
  // and ran single-axis gap analysis across the rows of the second, which
  // reports drift that is not there.
  if ((display !== "flex" && display !== "inline-flex") || wrap === "wrap" || wrap === "wrap-reverse") {
    return [];
  }
  if (children.length < 3) return [];

  if (direction === "column" || direction === "column-reverse") {
    const sorted = [...children].sort((a, b) => a.rect.y - b.rect.y);
    return sorted.slice(1).map((child, index) => child.rect.y - (sorted[index].rect.y + sorted[index].rect.height));
  }

  const sorted = [...children].sort((a, b) => a.rect.x - b.rect.x);
  return sorted.slice(1).map((child, index) => child.rect.x - (sorted[index].rect.x + sorted[index].rect.width));
}

function inspectSiblingGaps(
  state: LayoutStateSnapshot,
  tolerance: number,
  findings: InspectionFinding[],
): void {
  const childrenByParent = new Map<string, LayoutElementSnapshot[]>();
  for (const element of state.elements) {
    if (!element.parentId) continue;
    const children = childrenByParent.get(element.parentId) ?? [];
    children.push(element);
    childrenByParent.set(element.parentId, children);
  }

  for (const parent of state.elements) {
    const children = childrenByParent.get(parent.id) ?? [];
    const gaps = actualSiblingGaps(parent, children).filter((gap) => gap >= 0);
    const distinct = uniqueMeasurements(gaps, tolerance);
    if (distinct.length <= 1) continue;
    const delta = difference(gaps);
    makeFinding(findings, {
      ruleId: "spacing/sibling-gap-drift",
      state: state.name,
      severity: severityForDelta(delta),
      message: `${elementName(parent)} has inconsistent sibling gaps: ${gaps.map((gap) => `${rounded(gap)}px`).join(", ")}.`,
      fix: "Set one row or column gap token on the parent and remove competing child margins.",
      elementIds: [parent.id, ...children.map((child) => child.id)],
      evidence: gaps.map((gap, index) => ({ label: `Gap ${index + 1}`, value: rounded(gap), unit: "px" as const })),
    });
  }
}

function inspectRepeatedGroups(
  state: LayoutStateSnapshot,
  tolerance: number,
  findings: InspectionFinding[],
): void {
  const groups = new Map<string, LayoutElementSnapshot[]>();
  for (const element of state.elements) {
    if (!element.groupId) continue;
    const group = groups.get(element.groupId) ?? [];
    group.push(element);
    groups.set(element.groupId, group);
  }

  for (const [groupId, elements] of groups) {
    if (elements.length < 2) continue;
    for (const property of ["rowGap", "columnGap"] as const) {
      const measured = elements
        .map((element) => ({ element, value: element.style?.[property] }))
        .filter((item): item is { element: LayoutElementSnapshot; value: number } => finite(item.value));
      if (measured.length < 2 || uniqueMeasurements(measured.map((item) => item.value), tolerance).length <= 1) continue;
      const values = measured.map((item) => item.value);
      makeFinding(findings, {
        ruleId: "spacing/repeated-component-gap-drift",
        state: state.name,
        severity: severityForDelta(difference(values)),
        message: `Repeated group ${groupId} uses inconsistent ${property === "rowGap" ? "row" : "column"} gaps: ${values.map((value) => `${rounded(value)}px`).join(", ")}.`,
        fix: "Apply one shared gap token to every instance of the repeated component.",
        elementIds: measured.map((item) => item.element.id),
        evidence: measured.map((item) => ({ label: elementName(item.element), value: rounded(item.value), unit: "px" as const })),
      });
    }

    for (const dimension of ["width", "height"] as const) {
      const measured = elements.filter((element) => {
        if (element.compareSize === "both" || element.compareSize === dimension) return true;
        return dimension === "height" && isInteractive(element);
      });
      if (measured.length < 2) continue;
      const values = measured.map((element) => element.rect[dimension]);
      if (uniqueMeasurements(values, tolerance).length <= 1) continue;
      makeFinding(findings, {
        ruleId: "spacing/repeated-component-size-drift",
        state: state.name,
        severity: severityForDelta(difference(values)),
        message: `Repeated group ${groupId} has inconsistent ${dimension}: ${values.map((value) => `${rounded(value)}px`).join(", ")}.`,
        fix: `Use one shared ${dimension} token or constraint for equivalent instances.`,
        elementIds: measured.map((element) => element.id),
        evidence: measured.map((element) => ({ label: elementName(element), value: rounded(element.rect[dimension]), unit: "px" as const })),
      });
    }
  }
}

function alignmentValue(rect: LayoutRect, edge: AlignmentEdge): number {
  switch (edge) {
    case "right": return rect.x + rect.width;
    case "top": return rect.y;
    case "bottom": return rect.y + rect.height;
    case "center-x": return rect.x + rect.width / 2;
    case "center-y": return rect.y + rect.height / 2;
    case "left":
    default: return rect.x;
  }
}

/**
 * Groups elements into rows: a pair belongs to the same row when their vertical
 * spans overlap, their horizontal spans do not, and neither is much wider than
 * the other. The width test is what separates a row of equal cells from a label
 * sitting beside its own longer value, where different lengths are the point.
 */
function rowClusters(
  elements: LayoutElementSnapshot[],
  tolerance: number,
): LayoutElementSnapshot[][] {
  const sharesRow = (a: LayoutElementSnapshot, b: LayoutElementSnapshot): boolean => {
    const overlap = Math.min(a.rect.y + a.rect.height, b.rect.y + b.rect.height) - Math.max(a.rect.y, b.rect.y);
    if (overlap <= tolerance) return false;
    if (Math.abs(a.rect.y - b.rect.y) > tolerance) return false;
    const apart = a.rect.x + a.rect.width <= b.rect.x + tolerance
      || b.rect.x + b.rect.width <= a.rect.x + tolerance;
    if (!apart) return false;
    const [narrow, wide] = a.rect.width <= b.rect.width ? [a.rect.width, b.rect.width] : [b.rect.width, a.rect.width];
    return wide > 0 && narrow / wide >= 0.6;
  };

  const clusters: LayoutElementSnapshot[][] = [];
  for (const element of [...elements].sort((a, b) => a.rect.x - b.rect.x)) {
    const row = clusters.find((cluster) => cluster.some((member) => sharesRow(member, element)));
    if (row) row.push(element);
    else clusters.push([element]);
  }
  return clusters;
}

/**
 * Text blocks standing side by side should end level with each other. When one
 * wraps to fewer lines than its neighbours the short cell stops early, the row's
 * bottom edge goes ragged, and the gap under it reads as a mistake rather than a
 * decision. Every other measure of such a row agrees: the cells share a top, a
 * width and a gap, so nothing else catches it.
 *
 * Both the line counts and the rendered heights must differ. Heights alone would
 * catch a price standing beside a padded badge, where one line each is correct.
 * Counts alone would keep firing after the fix, which is to give the short cell
 * the tallest cell's height and leave the wrapping where it is.
 *
 * The shortfall must also be at least a third of the tallest block. That keeps
 * labels, where one missing line is half the block, and drops paragraphs, where
 * ending a line apart is ordinary typesetting and not a fault.
 *
 * Membership is geometric, so a column of stacked paragraphs never qualifies. The
 * blocks are also required to be cousins, sharing a grandparent, because a row is
 * built as a set of cells and the text usually sits one level inside each cell.
 */
function inspectRaggedTextRows(
  state: LayoutStateSnapshot,
  tolerance: number,
  findings: InspectionFinding[],
): void {
  const parentOf = new Map(state.elements.map((element) => [element.id, element.parentId]));
  const rows = new Map<string, LayoutElementSnapshot[]>();
  for (const element of state.elements) {
    if (!finite(element.lineCount) || element.lineCount < 1) continue;
    if (element.rect.width <= 0 || element.rect.height <= 0) continue;
    const parent = element.parentId;
    if (!parent) continue;
    const key = parentOf.get(parent) ?? parent;
    const group = rows.get(key) ?? [];
    group.push(element);
    rows.set(key, group);
  }

  for (const group of rows.values()) {
    if (group.length < 2) continue;
    for (const row of rowClusters(group, tolerance)) {
      if (row.length < 2) continue;
      const counts = row.map((element) => element.lineCount ?? 0);
      // Both conditions, never either. Differing heights alone catch a price
      // sitting beside a padded badge, which is not ragged. Differing counts
      // alone keep firing after the fix, which is to give the short cell the
      // tallest height and leave the wrapping as it is.
      if (new Set(counts).size <= 1) continue;
      // A paragraph one line short of a five-line neighbour is missing a fifth of
      // its height, and paragraphs are expected to end unevenly. A label one line
      // short of a two-line neighbour is missing half, and that reads as a hole.
      const tallest = Math.max(...counts);
      if ((tallest - Math.min(...counts)) / tallest < 1 / 3) continue;
      const heights = row.map((element) => element.rect.height);
      if (uniqueMeasurements(heights, tolerance).length <= 1) continue;
      const shortest = row.reduce((min, element) => (element.rect.height < min.rect.height ? element : min), row[0]!);

      makeFinding(findings, {
        ruleId: "spacing/ragged-text-row",
        state: state.name,
        severity: severityForDelta(difference(heights)),
        message: `${row.length} text blocks share a row but wrap to ${counts.join(", ")} lines, so ${elementName(shortest)} ends short, leaves a gap under it, and the row's bottom edge is ragged.`,
        fix: "Give every block in the row the tallest block's height, or shorten the copy so they all wrap alike.",
        elementIds: row.map((element) => element.id),
        evidence: [
          ...row.map((element) => ({ label: elementName(element), value: rounded(element.rect.height), unit: "px" as const })),
          ...row.map((element) => ({ label: `${elementName(element)} lines`, value: element.lineCount ?? 0, unit: "count" as const })),
        ],
      });
    }
  }
}

function inspectAlignmentGroups(
  state: LayoutStateSnapshot,
  tolerance: number,
  findings: InspectionFinding[],
): void {
  const groups = new Map<string, LayoutElementSnapshot[]>();
  for (const element of state.elements) {
    if (!element.alignmentGroup || !element.alignmentEdge) continue;
    const key = `${element.alignmentGroup}:${element.alignmentEdge}`;
    const group = groups.get(key) ?? [];
    group.push(element);
    groups.set(key, group);
  }

  for (const [key, elements] of groups) {
    if (elements.length < 2) continue;
    const edge = elements[0].alignmentEdge ?? "left";
    const values = elements.map((element) => alignmentValue(element.rect, edge));
    const delta = difference(values);
    if (delta <= tolerance) continue;
    makeFinding(findings, {
      ruleId: "spacing/alignment-drift",
      state: state.name,
      severity: severityForDelta(delta),
      message: `Alignment group ${key} drifts by ${rounded(delta)}px across ${elements.length} elements.`,
      fix: "Align these peers with the same grid track, flex alignment, or anchored footer constraint.",
      elementIds: elements.map((element) => element.id),
      evidence: elements.map((element) => ({ label: elementName(element), value: rounded(alignmentValue(element.rect, edge)), unit: "px" as const })),
    });
  }
}

function inspectOverflow(
  state: LayoutStateSnapshot,
  tolerance: number,
  findings: InspectionFinding[],
): void {
  for (const element of state.elements) {
    const { rect } = element;
    // Horizontal only. getBoundingClientRect is viewport-relative, so every
    // element above the current scroll position has a negative y, and testing
    // it would report ordinary scrolled content as overflow on any capture
    // taken after a scroll.
    const outsideViewport = rect.x < -tolerance
      || rect.x + rect.width > state.viewport.width + tolerance;
    if (outsideViewport) {
      makeFinding(findings, {
        ruleId: "spacing/viewport-overflow",
        state: state.name,
        severity: "serious",
        message: `${elementName(element)} extends outside the ${state.viewport.width}px viewport.`,
        fix: "Constrain the element to the viewport and verify the same content at narrow and wide breakpoints.",
        elementIds: [element.id],
        evidence: [
          { label: "Left edge", value: rounded(rect.x), unit: "px" },
          { label: "Right edge", value: rounded(rect.x + rect.width), unit: "px" },
          { label: "Viewport width", value: rounded(state.viewport.width), unit: "px" },
        ],
      });
    }

    // A box that crops an inert picture shows what it means to show, so only
    // its other children count. A line that ends in an ellipsis tells the
    // reader the text goes on, so its horizontal cut is not lost content.
    const contentWidth = element.inertCrop?.width ?? element.scrollWidth;
    const contentHeight = element.inertCrop?.height ?? element.scrollHeight;
    const clipsX = element.style?.textOverflow !== "ellipsis"
      && finite(contentWidth)
      && finite(element.clientWidth)
      && contentWidth - element.clientWidth > tolerance
      && clips(element.style?.overflowX);
    const clipsY = finite(contentHeight)
      && finite(element.clientHeight)
      && contentHeight - element.clientHeight > tolerance
      && clips(element.style?.overflowY);
    if (!clipsX && !clipsY) continue;
    // SAFETY: these DOM measurements are numbers at runtime.
    makeFinding(findings, {
      ruleId: "spacing/clipped-content",
      state: state.name,
      severity: "serious",
      message: `${elementName(element)} clips ${clipsX && clipsY ? "horizontal and vertical" : clipsX ? "horizontal" : "vertical"} content.`,
      fix: "Remove the conflicting fixed size, allow wrapping, or make overflow intentionally scrollable.",
      elementIds: [element.id],
      evidence: [
        ...(clipsX ? [
          { label: "Client width", value: element.clientWidth as number, unit: "px" as const },
          { label: element.inertCrop ? "Width outside the inert picture" : "Scroll width", value: contentWidth as number, unit: "px" as const },
        ] : []),
        ...(clipsY ? [
          { label: "Client height", value: element.clientHeight as number, unit: "px" as const },
          { label: element.inertCrop ? "Height outside the inert picture" : "Scroll height", value: contentHeight as number, unit: "px" as const },
        ] : []),
      ],
    });
  }
}

function inspectTouchTargets(
  state: LayoutStateSnapshot,
  findings: InspectionFinding[],
): void {
  for (const element of state.elements) {
    if (!isInteractive(element)) continue;
    if (element.style?.display === "inline") continue;
    const smallest = Math.min(element.rect.width, element.rect.height);
    if (smallest >= 44) continue;
    const severity: InspectionSeverity = smallest < 24 ? "serious" : "moderate";
    makeFinding(findings, {
      ruleId: "spacing/touch-target",
      state: state.name,
      severity,
      message: `${elementName(element)} measures ${rounded(element.rect.width)}x${rounded(element.rect.height)}px, below the recommended 44x44px touch target.`,
      fix: "Increase the interactive hit area to at least 44x44px without relying on the visible icon size.",
      elementIds: [element.id],
      evidence: [
        { label: "Width", value: rounded(element.rect.width), unit: "px" },
        { label: "Height", value: rounded(element.rect.height), unit: "px" },
      ],
    });
  }
}

/** Control types that hold one line of text. An input with no type is a text input. */
const ONE_LINE_TYPES = new Set(["text", "search", "email", "url", "tel", "password", "number", "date", "datetime-local", "month", "time", "week", "select-one"]);
/** Twice the touch target. A one-line field taller than this was stretched by its layout. */
const STRETCHED_FIELD_HEIGHT = 88;

/**
 * Flags a one-line field stretched far taller than a control. A search box in a
 * flex column with `flex: 1` grows to fill the column: every rule passes, and
 * the screen shows a field several lines tall that holds one line.
 */
function inspectStretchedFields(
  state: LayoutStateSnapshot,
  findings: InspectionFinding[],
): void {
  for (const element of state.elements) {
    const tag = element.tag?.toLowerCase();
    if (tag !== "input" && tag !== "select") continue;
    const type = element.inputType?.toLowerCase() ?? (tag === "select" ? "select-one" : "text");
    if (!ONE_LINE_TYPES.has(type)) continue;
    if (element.rect.height <= STRETCHED_FIELD_HEIGHT) continue;
    makeFinding(findings, {
      ruleId: "spacing/stretched-field",
      state: state.name,
      severity: "serious",
      message: `${elementName(element)} is ${rounded(element.rect.height)}px tall but holds one line, so its layout stretched it.`,
      fix: "Size the field to one control height. In a flex column, set flex: none on it instead of flex: 1, or align it to the start.",
      elementIds: [element.id],
      evidence: [
        { label: "Height", value: rounded(element.rect.height), unit: "px" },
        { label: "Expected at most", value: STRETCHED_FIELD_HEIGHT, unit: "px" },
      ],
    });
  }
}

const SHELL_TAGS = new Set(["aside", "nav"]);
const SHELL_ROLES = new Set(["navigation", "complementary"]);
/** App chrome pins itself; a nav that scrolls with the page is a column of that page, not a wall beside it. */
const SHELL_POSITIONS = new Set(["sticky", "fixed"]);
/** Widest gutter a sidebar may leave before it reads as a hole rather than a margin. */
const SHELL_GUTTER_LIMIT = 24;
/** Gutter at or above which the hole is wide enough to read as a layout fault, not a rounding slip. */
const SHELL_GUTTER_SERIOUS = 48;

function ancestorIds(element: LayoutElementSnapshot, byId: Map<string, LayoutElementSnapshot>): Set<string> {
  const ids = new Set<string>();
  for (let parent = element.parentId; parent && !ids.has(parent); parent = byId.get(parent)?.parentId) {
    ids.add(parent);
  }
  return ids;
}

function isShell(element: LayoutElementSnapshot): boolean {
  return SHELL_TAGS.has(element.tag?.toLowerCase() ?? "")
    || SHELL_ROLES.has(element.role?.toLowerCase() ?? "");
}

function verticalOverlap(a: LayoutRect, b: LayoutRect): number {
  return Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

/**
 * A full-height sidebar inside a centred max-width container leaves page
 * background beside it on a wide screen. The sidebar is the one element that
 * looks like a wall, so a gap to its left reads as a hole, not a margin.
 * Nothing else in the rule set measures the space between an element and the
 * viewport edge, so a 1400px shell passes at 1440 and fails at 1728. [BD-574]
 *
 * Three shapes are deliberately not gutters: a nav nested inside the aside,
 * which would report the same gap twice; a gap beside a rail that spans most
 * of the sidebar's height, which is a second column, not a hole; and a panel
 * on the right half of the viewport, which is a drawer, not a sidebar. A nav
 * that is not sticky or fixed scrolls with the page, so it is part of a centred
 * composition rather than chrome, and is not a gutter either.
 */
function inspectShellGutter(
  state: LayoutStateSnapshot,
  tolerance: number,
  findings: InspectionFinding[],
): void {
  const byId = new Map(state.elements.map((element) => [element.id, element]));
  for (const element of state.elements) {
    if (!isShell(element)) continue;
    if (!SHELL_POSITIONS.has(element.style?.position ?? "")) continue;
    const { rect } = element;
    if (rect.height < state.viewport.height * 0.8) continue;
    if (rect.width > state.viewport.width * 0.4) continue;
    if (rect.x + rect.width > state.viewport.width / 2) continue;
    const gutter = rect.x;
    if (gutter <= Math.max(SHELL_GUTTER_LIMIT, tolerance)) continue;

    const ancestors = ancestorIds(element, byId);
    if ([...ancestors].some((id) => { const parent = byId.get(id); return parent ? isShell(parent) : false; })) continue;

    const occupied = state.elements.some((other) => other.id !== element.id
      && other.rect.width > 0
      && other.rect.x + other.rect.width <= rect.x + tolerance
      && verticalOverlap(other.rect, rect) >= rect.height / 2);
    if (occupied) continue;

    const container = [...ancestors]
      .map((id) => byId.get(id))
      .find((candidate) => candidate
        && Math.abs(candidate.rect.x - rect.x) <= tolerance
        && candidate.rect.width < state.viewport.width - tolerance);
    makeFinding(findings, {
      ruleId: "spacing/shell-gutter",
      state: state.name,
      severity: gutter >= SHELL_GUTTER_SERIOUS ? "serious" : "moderate",
      message: `${elementName(element)} is a full-height sidebar that starts ${rounded(gutter)}px from the left edge of the ${rounded(state.viewport.width)}px viewport, leaving page background beside it.`,
      fix: "Move the sidebar outside the centred max-width container, or stretch the shell to the viewport and centre only the content column.",
      elementIds: container ? [element.id, container.id] : [element.id],
      evidence: [
        { label: "Gutter", value: rounded(gutter), unit: "px" },
        { label: "Sidebar width", value: rounded(rect.width), unit: "px" },
        { label: "Viewport width", value: rounded(state.viewport.width), unit: "px" },
        ...(container ? [{ label: `${elementName(container)} width`, value: rounded(container.rect.width), unit: "px" as const }] : []),
      ],
    });
  }
}

/** Findings the cap discarded during the current inspectSpacing call. */
let dropped = 0;

function summary(findings: InspectionFinding[]) {
  const result = {
    critical: 0,
    serious: 0,
    moderate: 0,
    total: findings.length,
    truncated: dropped > 0 ? dropped : undefined,
  };
  for (const finding of findings) result[finding.severity] += 1;
  return result;
}

// The overlay's elements, each with the name a person reads in every report.
function namedElements(state: LayoutStateSnapshot) {
  const names = nameElements(state);
  return state.elements.map((element) => ({ id: element.id, label: element.label, name: names.get(element.id), rect: element.rect }));
}

// Native-only rules: the geometry lives in native-text.ts, the findings here.
function inspectCoveredText(state: LayoutStateSnapshot, findings: InspectionFinding[]): void {
  for (const { control, text, area } of coveredTextPairs(state)) {
    makeFinding(findings, {
      ruleId: "spacing/covered-text",
      state: state.name,
      severity: "serious",
      message: `${elementName(control)} covers ${elementName(text)}.`,
      fix: "Inset the content under the control, with safeAreaInset or contentMargins, so nothing sits beneath it at rest.",
      elementIds: [control.id, text.id],
      evidence: [{ label: "Covered area", value: rounded(area), unit: "px" }],
    });
  }
}

function inspectCrowdedText(state: LayoutStateSnapshot, findings: InspectionFinding[]): void {
  for (const { upper, lower, overlap } of crowdedTextPairs(state)) {
    makeFinding(findings, {
      ruleId: "spacing/crowded-text",
      state: state.name,
      severity: "moderate",
      message: `${elementName(lower)} starts ${rounded(overlap)}px inside ${elementName(upper)}.`,
      fix: "Give the lower line its own space: set it in the content's header with a spacing token, or add the gap the type scale gives that size.",
      elementIds: [upper.id, lower.id],
      evidence: [{ label: "Overlap", value: rounded(overlap), unit: "px" }],
    });
  }
}

/**
 * Judges one captured snapshot and returns the findings with the overlay that
 * shows them. Pure: it does no measuring itself, so the same snapshot always
 * produces the same result.
 */
export function inspectSpacing(input: SpacingInspectionInput): SpacingInspectionResult {
  // Reset per call, so the same snapshot always produces the same result no
  // matter what ran before it.
  dropped = 0;
  const tolerance = finite(input.tolerance) ? Math.max(0, input.tolerance) : 1;
  const scale = (input.spacingScale?.length ? input.spacingScale : [...DEFAULT_SPACING_SCALE])
    .filter((value) => finite(value) && value > 0)
    .sort((a, b) => a - b);
  const findings: InspectionFinding[] = [];

  for (const state of input.states) {
    inspectSymmetry(state, tolerance, findings);
    inspectConcentricRadii(state, tolerance, findings);
    inspectSpacingScale(state, scale, tolerance, findings);
    inspectSiblingGaps(state, tolerance, findings);
    inspectRepeatedGroups(state, tolerance, findings);
    inspectAlignmentGroups(state, tolerance, findings);
    inspectRaggedTextRows(state, tolerance, findings);
    inspectOverflow(state, tolerance, findings);
    inspectShellGutter(state, tolerance, findings);
    inspectTouchTargets(state, findings);
    inspectStretchedFields(state, findings);
    if (state.platform === "native") {
      inspectCoveredText(state, findings);
      inspectCrowdedText(state, findings);
    }
  }
  const density = inspectDensity(input.states, input.density, tolerance);
  for (const finding of density.findings) makeFinding(findings, finding);

  const counts = summary(findings);
  const score = Math.max(0, 100 - counts.critical * 20 - counts.serious * 10 - counts.moderate * 5);
  return {
    score,
    summary: counts,
    findings,
    states: input.states.map((state) => ({
      name: state.name,
      viewport: state.viewport,
      screenshotDataUrl: state.screenshotDataUrl ? state.screenshotDataUrl : undefined,
      elements: namedElements(state),
    })),
    ...(density.report && { density: density.report }),
  };
}
