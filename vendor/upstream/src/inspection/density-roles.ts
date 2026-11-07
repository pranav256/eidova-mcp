import {
  closestDensity,
  DEFAULT_SPACING_UNIT_REM,
  DENSITY_MODES,
  DENSITY_STEPS,
  LAYOUT_ROLES,
  parseDensity,
  ROLE_CSS_VARS,
  ROLE_LABELS,
  type DensityMode,
  type LayoutRole,
  type LayoutRoleValues,
} from "./density";
import type {
  DensityReport,
  DensityRoleMeasurement,
  DensitySource,
  InspectionFinding,
  LayoutElementSnapshot,
  LayoutStateSnapshot,
} from "./types";

/** Below this width a dashboard collapses its sidebar and insets, so the roles do not apply. */
const DESKTOP_MIN_WIDTH = 1024;
/**
 * How many unit steps a role may sit from its value and still match. Modes
 * differ by one step on some roles, so a gap gets half a step; the sidebar,
 * whose modes sit 6 or more steps apart, gets more room.
 */
const ALLOWED_STEPS = {
  sidebarWidth: 2,
  pageInset: 0.5,
  sectionGap: 0.5,
  columnGap: 0.5,
  cardPadding: 0.5,
} satisfies Record<LayoutRole, number>;
const DEFAULT_UNIT_PX = DEFAULT_SPACING_UNIT_REM * 16;


function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function capitalized(mode: DensityMode): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** The value most elements share, so one odd card does not set the page's padding. */
function mostCommon(values: number[]): number | undefined {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(rounded(value), (counts.get(rounded(value)) ?? 0) + 1);
  let best: number | undefined;
  for (const [value, count] of counts) {
    if (best === undefined || count > (counts.get(best) ?? 0)) best = value;
  }
  return best;
}

function visibleColor(value: string | undefined): boolean {
  if (!value) return false;
  const color = value.trim().toLowerCase();
  return color !== "transparent" && !/rgba?\([^)]*,\s*0\)$/.test(color) && !/\/\s*0\)$/.test(color);
}

function isCard(element: LayoutElementSnapshot): boolean {
  const style = element.style;
  if (!style || element.interactive) return false;
  const corner = style.borderRadius?.topLeft.horizontal ?? 0;
  const painted = visibleColor(style.backgroundColor) || Boolean(style.boxShadow && style.boxShadow !== "none");
  return painted && corner > 0 && element.rect.width >= 160 && element.rect.height >= 64;
}

/**
 * How far a card's content sits from its left edge. A card component often
 * puts the padding on its header, content and footer slots rather than on
 * itself, so a card with no padding of its own reads the nearest slot's.
 */
function cardInset(card: LayoutElementSnapshot, slots: LayoutElementSnapshot[]): number {
  const own = card.style?.padding?.left ?? 0;
  if (own > 0) return own;
  const insets = slots
    .map((slot) => slot.rect.x + (slot.style?.padding?.left ?? 0) - card.rect.x)
    .filter((inset) => inset > 0);
  return insets.length ? Math.min(...insets) : 0;
}

function isSidebar(element: LayoutElementSnapshot, state: LayoutStateSnapshot): boolean {
  const tag = element.tag?.toLowerCase();
  const role = element.role?.toLowerCase();
  const shell = tag === "aside" || tag === "nav" || role === "navigation" || role === "complementary";
  const { rect } = element;
  return shell
    && rect.height >= state.viewport.height * 0.6
    && rect.width >= 120
    && rect.width <= state.viewport.width * 0.4
    && rect.x + rect.width <= state.viewport.width / 2;
}

/**
 * Measures the five roles in one desktop state. Each role is optional: a page
 * with no sidebar or no card row simply does not report that role.
 */
export function measureLayoutRoles(state: LayoutStateSnapshot): LayoutRoleValues {
  const measured: LayoutRoleValues = {};
  const children = new Map<string, LayoutElementSnapshot[]>();
  for (const element of state.elements) {
    if (!element.parentId) continue;
    const list = children.get(element.parentId) ?? [];
    list.push(element);
    children.set(element.parentId, list);
  }
  const byId = new Map(state.elements.map((element) => [element.id, element]));
  // A snapshot is caller input, so a parentId chain can loop back on itself.
  // Each walk stops at an id it has already seen.
  const ancestors = (element: LayoutElementSnapshot) => {
    const seen: LayoutElementSnapshot[] = [];
    const ids = new Set<string>([element.id]);
    for (let id = element.parentId; id && !ids.has(id); id = byId.get(id)?.parentId) {
      ids.add(id);
      const parent = byId.get(id);
      if (parent) seen.push(parent);
    }
    return seen;
  };
  const nestedInSidebar = (element: LayoutElementSnapshot) =>
    ancestors(element).some((parent) => isSidebar(parent, state));

  const sidebar = state.elements.find((element) => isSidebar(element, state) && !nestedInSidebar(element));
  if (sidebar) measured.sidebarWidth = sidebar.rect.width;

  const main = state.elements.find((element) => element.tag?.toLowerCase() === "main" || element.role?.toLowerCase() === "main");
  if (!main) return measured;

  // Walk down through single-child wrappers. Their left padding adds up to the
  // page inset; a centring margin does not, because it is not padding.
  let sections = main;
  let inset = main.style?.padding?.left ?? 0;
  const walked = new Set([main.id]);
  for (let kids = children.get(sections.id) ?? []; kids.length === 1 && !walked.has(kids[0].id); kids = children.get(sections.id) ?? []) {
    sections = kids[0];
    walked.add(sections.id);
    inset += sections.style?.padding?.left ?? 0;
  }
  if (inset > 0) measured.pageInset = inset;

  const stacked = [...(children.get(sections.id) ?? [])].sort((a, b) => a.rect.y - b.rect.y);
  const rowGap = sections.style?.rowGap ?? 0;
  // Sections stack. A container whose children share a row is a grid of
  // cards, and its row gap is a column gap, not a section gap.
  const stacks = stacked.every((element, index) =>
    index === 0 || element.rect.y >= stacked[index - 1].rect.y + stacked[index - 1].rect.height - 1);
  if (stacked.length >= 2 && stacks) {
    const gaps = stacked.slice(1)
      .map((element, index) => element.rect.y - (stacked[index].rect.y + stacked[index].rect.height))
      .filter((gap) => gap > 0);
    const gap = rowGap > 0 ? rowGap : median(gaps);
    if (gap) measured.sectionGap = gap;
  }

  // One walk down from main, so each element is checked once, not per ancestor.
  const insideMain = new Set<string>();
  for (const queue = [main.id]; queue.length;) {
    const id = queue.pop() ?? "";
    for (const child of children.get(id) ?? []) {
      if (insideMain.has(child.id) || child.id === main.id) continue;
      insideMain.add(child.id);
      queue.push(child.id);
    }
  }
  const inMain = (element: LayoutElementSnapshot) => insideMain.has(element.id);
  const columnGaps: number[] = [];
  const cardPaddings: number[] = [];
  for (const element of state.elements) {
    if (!inMain(element)) continue;
    if (isCard(element)) {
      const padding = cardInset(element, children.get(element.id) ?? []);
      if (padding > 0) cardPaddings.push(padding);
    }
    const row = (children.get(element.id) ?? []).filter(isCard).sort((a, b) => a.rect.x - b.rect.x);
    const sideBySide = row.filter((card) => Math.abs(card.rect.y - row[0].rect.y) <= 1);
    if (sideBySide.length < 2) continue;
    const declared = element.style?.columnGap ?? 0;
    const gap = declared > 0
      ? declared
      : sideBySide[1].rect.x - (sideBySide[0].rect.x + sideBySide[0].rect.width);
    if (gap > 0) columnGaps.push(gap);
  }
  const columnGap = mostCommon(columnGaps);
  if (columnGap) measured.columnGap = columnGap;
  const cardPadding = mostCommon(cardPaddings);
  if (cardPadding) measured.cardPadding = cardPadding;
  return measured;
}

/** The first state that declares a density, so every width agrees on one. */
function declaredDensity(states: LayoutStateSnapshot[]) {
  for (const state of states) {
    const mode = parseDensity(state.density?.mode);
    if (mode) {
      const source: DensitySource = state.density?.source === "project" ? "project" : "design-system";
      return { mode, source };
    }
  }
  return undefined;
}

function unitFor(states: LayoutStateSnapshot[]): number {
  const unit = states.find((state) => (state.density?.unit ?? 0) > 0)?.density?.unit;
  return unit && Number.isFinite(unit) ? unit : DEFAULT_UNIT_PX;
}

/** A finding the caller numbers and caps with the rest. */
export type DensityFinding = Omit<InspectionFinding, "id">;

/** The density report, absent when there was nothing to say, and its findings. */
export interface DensityInspection {
  report?: DensityReport;
  findings: DensityFinding[];
}

/**
 * Checks each desktop state against one density. The density comes from the
 * argument, then the density the page declares, then the mode closest to what
 * was measured. Returns undefined only when there is nothing to say.
 */
export function inspectDensity(
  states: LayoutStateSnapshot[],
  requested: DensityMode | undefined,
  tolerance: number,
): DensityInspection {
  const unit = unitFor(states);
  const desktop = states
    .filter((state) => state.viewport.width >= DESKTOP_MIN_WIDTH)
    .map((state) => ({ state, measured: measureLayoutRoles(state) }));

  const declared = declaredDensity(states);
  let mode = requested ?? declared?.mode;
  let source: DensitySource = requested ? "argument" : declared?.source ?? "measured";
  if (!mode) {
    const pooled: LayoutRoleValues = {};
    for (const role of LAYOUT_ROLES) {
      const value = median(desktop.flatMap(({ measured }) => (measured[role] ? [measured[role]] : [])));
      if (value) pooled[role] = value;
    }
    mode = closestDensity(pooled, unit);
    source = "measured";
  }
  if (!mode) return { findings: [] };

  const roles: DensityRoleMeasurement[] = [];
  const findings: DensityFinding[] = [];
  for (const { state, measured } of desktop) {
    for (const role of LAYOUT_ROLES) {
      const value = measured[role];
      if (!value) continue;
      const expected = DENSITY_STEPS[mode][role] * unit;
      const allowed = Math.max(tolerance, ALLOWED_STEPS[role] * unit);
      const matches = Math.abs(value - expected) <= allowed;
      roles.push({ role, state: state.name, measured: rounded(value), expected: rounded(expected), matches });
      if (matches) continue;
      // A value nearer another mode's reads as that mode, which is the fault
      // worth fixing first. A measured mode is a guess, so it never escalates.
      const nearest = DENSITY_MODES.reduce((best, other) =>
        Math.abs(value - DENSITY_STEPS[other][role] * unit) < Math.abs(value - DENSITY_STEPS[best][role] * unit) ? other : best);
      // A kit's own Card keeps the padding its system authored, so card
      // padding stays a judgement call rather than a fault to fix first.
      const readsAsOther = source !== "measured" && role !== "cardPadding"
        && DENSITY_STEPS[nearest][role] !== DENSITY_STEPS[mode][role];
      findings.push({
        ruleId: "spacing/density-role",
        state: state.name,
        severity: readsAsOther ? "serious" : "moderate",
        message: `${ROLE_LABELS[role]} is ${rounded(value)}px; the ${mode} density sets ${rounded(expected)}px (${DENSITY_STEPS[mode][role]} steps).`,
        fix: `Use var(${ROLE_CSS_VARS[role]}) or ${rounded(expected / 16)}rem.`,
        elementIds: [],
        evidence: [
          { label: "Measured", value: rounded(value), unit: "px" },
          { label: capitalized(mode), value: rounded(expected), unit: "px" },
          { label: "Density source", value: source },
        ],
      });
    }
  }
  return { report: { mode, source, roles }, findings };
}
