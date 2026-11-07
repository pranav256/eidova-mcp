import { toRedactedJson } from "../../review-capture";
import { z } from "zod";

import type { RegisterToolDeps } from "./shared";
import { CONTEXT_ARG, READ_ONLY_TOOL_ANNOTATIONS } from "./shared";

/** Fixture-derived contract that a submitted dashboard page must satisfy. */
export interface DashboardStructureInput {
  source: string;
  requiredTitle: string;
  requiredSupportingLine: string;
  requiredPrimaryAction: string;
  interpretation: string;
  dependentTaskScreens: number;
  records?: DashboardRecordInput[];
  componentSources?: DashboardComponentSources;
}

/** One metric supplied by a dashboard fixture. */
export interface DashboardMetricInput {
  label: string;
  value: string;
}

/** One record supplied by a dashboard fixture. */
export interface DashboardRecordInput {
  title: string;
  detail: string;
  meta: string;
  status: string;
}

/** Fixture fields the dashboard review derives its contract from. */
export interface DashboardFixture {
  stats?: DashboardMetricInput[];
  records?: DashboardRecordInput[];
  steps: Array<{
    title: string;
    description: string;
    action: string;
  }>;
}

/** Installed component sources used to verify compound composition. */
export interface DashboardComponentSources {
  sidebar: string;
  statCard: string;
  table: string;
}

/** Blocking source-contract violation returned with a deterministic repair. */
export interface DashboardStructureFinding {
  id: string;
  severity: "critical" | "serious";
  message: string;
  fix: string;
}

/** Stable analyzer result consumed by the MCP transport and benchmark audit. */
export interface DashboardStructureReport {
  verdict: "pass" | "fail";
  findings: DashboardStructureFinding[];
}

/** Zod contract shared by dashboard review tools. */
export const dashboardFixtureSchema = z.object({
  stats: z.array(z.object({
    label: z.string().trim().min(1).max(300),
    value: z.string().trim().min(1).max(300),
  })).max(100).optional(),
  records: z.array(z.object({
    title: z.string().trim().min(1).max(300),
    detail: z.string().trim().min(1).max(1000),
    meta: z.string().trim().min(1).max(300),
    status: z.string().trim().min(1).max(300),
  })).max(100).optional(),
  steps: z.array(z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).max(1000),
    action: z.string().trim().min(1).max(200),
  })).min(2).max(50),
});

/** Zod contract for the installed dashboard component source files. */
export const dashboardComponentSourcesSchema = z.object({
  sidebar: z.string().min(1).max(120000),
  statCard: z.string().min(1).max(120000),
  table: z.string().min(1).max(120000),
});

function finding(
  id: string,
  severity: DashboardStructureFinding["severity"],
  message: string,
  fix: string,
): DashboardStructureFinding {
  return { id, severity, message, fix };
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactHeadingPosition(source: string, value: string): number {
  return source.search(new RegExp(`<h1\\b[^>]*>\\s*${escaped(value)}\\s*</h1>`, "s"));
}

function hasTitleEyebrow(source: string, titlePosition: number): boolean {
  if (titlePosition < 0) return false;
  const prefix = source.slice(Math.max(0, titlePosition - 2000), titlePosition);
  return /<(p|span|small|Badge|Label)\b[^>]*>[^<]*<\/\1>\s*$/i.test(prefix);
}

interface ElementSpan {
  tag: string;
  start: number;
  end: number;
}

function elementSpans(source: string): ElementSpan[] {
  const open: Array<Omit<ElementSpan, "end">> = [];
  const spans: ElementSpan[] = [];
  for (const match of source.matchAll(/<\/?([A-Za-z][\w.$:-]*)\b[^>]*>/g)) {
    const token = match[0];
    const tag = match[1]!.toLowerCase();
    if (token.startsWith("</")) {
      let index = open.length - 1;
      while (index >= 0 && open[index]?.tag !== tag) index -= 1;
      if (index >= 0) spans.push({ ...open[index]!, end: match.index + token.length });
      if (index >= 0) open.splice(index);
    } else if (!/\/\s*>$/.test(token)) {
      open.push({ tag, start: match.index });
    }
  }
  return spans;
}

function enclosingRegions(spans: ElementSpan[], position: number): ElementSpan[] {
  return spans.filter(({ start, end }) => start < position && position < end);
}

function sameElement(left: ElementSpan | undefined, right: ElementSpan | undefined): boolean {
  return left?.tag === right?.tag && left?.start === right?.start && left?.end === right?.end;
}

function sharesContainer(
  regions: ElementSpan[][],
  matches: (candidate: ElementSpan) => boolean,
): boolean {
  return regions[0]?.some((candidate) =>
    matches(candidate)
    && regions.slice(1).every((items) => items.some((item) => sameElement(item, candidate)))
  ) ?? false;
}

function sharesPageHeaderContainer(source: string, positions: number[]): boolean {
  if (positions.some((position) => position < 0)) return false;
  const spans = elementSpans(source);
  const regions = positions.map((position) => enclosingRegions(spans, position));
  const semanticTags = new Set(["header", "pageheader", "section"]);
  const isSemantic = ({ tag }: ElementSpan) =>
    semanticTags.has(tag.split(".").at(-1) ?? tag);
  if (sharesContainer(regions, isSemantic)) return true;
  if (!sharesContainer(regions, ({ tag }) => tag === "div")) return false;
  const semanticRegions = regions.filter((items) => items.some(isSemantic));
  return semanticRegions.length === 0
    || (semanticRegions.length > 1 && sharesContainer(semanticRegions, isSemantic));
}

function componentPosition(source: string, name: string): number {
  return source.search(new RegExp(`<${name}\\b`));
}

function likelyStringStart(source: string, index: number): boolean {
  if (source[index] === "`") return true;
  const prefix = source.slice(Math.max(0, index - 16), index);
  const previous = prefix.match(/\S(?=\s*$)/)?.[0];
  return Boolean(previous && /[=([{,:;!?+\-*%&|]/.test(previous))
    || /\b(?:return|case|throw|from|import)\s*$|=>\s*$/.test(prefix);
}

function maskLexical(source: string, strings: boolean): string {
  const output = source.split("");
  let quote: string | undefined;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    const next = source[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      else output[index] = " ";
      continue;
    }
    if (blockComment) {
      output[index] = char === "\n" ? "\n" : " ";
      if (char === "*" && next === "/") {
        output[index + 1] = " ";
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (char === "\\") {
        if (strings) output[index] = " ";
        if (strings && next !== "\n") output[index + 1] = " ";
        index += 1;
      } else if (char === quote) {
        quote = undefined;
      } else if (strings && char !== "\n") {
        output[index] = " ";
      }
      continue;
    }
    if (char === "/" && next === "/") {
      output[index] = output[index + 1] = " ";
      lineComment = true;
      index += 1;
    } else if (char === "/" && next === "*") {
      output[index] = output[index + 1] = " ";
      blockComment = true;
      index += 1;
    } else if ((char === '"' || char === "'" || char === "`")
      && likelyStringStart(source, index)) {
      quote = char;
    }
  }
  return output.join("");
}

function resolveStaticCopyBindings(source: string): string {
  const bindings = new Map<string, string>();
  const declaration = /^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])([^"'`]*)\2\s*;/;
  const declarationShell = /\bconst\s+[A-Za-z_$][\w$]*\s*=\s*(["'`])\s*\1\s*;/g;
  for (const shell of maskLexical(source, true).matchAll(declarationShell)) {
    const segment = source.slice(shell.index, shell.index + shell[0].length);
    const [, name, , value] = segment.match(declaration) ?? [];
    if (name && value !== undefined && !/[<>]/.test(value)) bindings.set(name, value);
  }
  if (bindings.size === 0) return source;
  return source.replace(/\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (expression, name: string) =>
    bindings.get(name) ?? expression
  );
}

function importedBindings(source: string, path: string, component: string): string[] {
  const importShell = /\bimport\s*\{([^}]*)\}\s*from\s*(["'])\s*\2/g;
  return [...maskLexical(source, true).matchAll(importShell)].flatMap((shell) => {
    const segment = source.slice(shell.index, shell.index + shell[0].length);
    const parsed = segment.match(/\bimport\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/);
    if (!parsed?.[2]?.includes(`components/ui/${path}`)) return [];
    return (parsed[1] ?? "").split(",").flatMap((specifier) => {
      const binding = specifier.trim().match(
        new RegExp(`^(?:type\\s+)?${escaped(component)}(?:\\s+as\\s+([A-Za-z_$][\\w$]*))?$`),
      );
      return binding ? [binding[1] ?? component] : [];
    });
  });
}

function installedComponentPosition(
  source: string,
  renderableSource: string,
  path: string,
  component: string,
): number {
  const positions = importedBindings(source, path, component)
    .map((binding) => componentPosition(renderableSource, binding))
    .filter((position) => position >= 0);
  return positions.length > 0 ? Math.min(...positions) : -1;
}

function occurrenceCount(source: string, value: string): number {
  return [...source.matchAll(new RegExp(escaped(value), "g"))].length;
}

function usesActionColorForEveryRecord(source: string): boolean {
  return importedBindings(source, "table", "TableCell").some((binding) =>
    new RegExp(
      `<${escaped(binding)}\\b[^>]*className=["'][^"']*\\btext-primary\\b[^"']*["'][^>]*>\\s*\\{\\s*record\\.status\\s*\\}`,
      "s",
    ).test(source)
  );
}

function hasCustomStepRail(source: string): boolean {
  const labelledRail = /aria-label\s*=\s*\{?[^>]{0,200}\bStep\b[^>]{0,200}\bof\b[^>]*>[\s\S]{0,800}\bh-px\b/i;
  const decoratedCount = /\brounded-full\b[^>]*>[\s\S]{0,120}?(?:\{\s*\w+\s*\}|\d+)[\s\S]{0,400}?\b(?:steps?|of)\b/i;
  return labelledRail.test(source) || decoratedCount.test(source);
}

function numericStatus(status: string): number | undefined {
  const match = status.replaceAll(",", "").match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : undefined;
}

function rankedRecordTitles(
  records: DashboardRecordInput[],
  direction: "highest" | "lowest",
): string[] {
  const ranked = records.flatMap((record) => {
    const value = numericStatus(record.status);
    return value === undefined ? [] : [{ title: record.title, value }];
  });
  if (ranked.length < 2) return [];
  const target = direction === "highest"
    ? Math.max(...ranked.map(({ value }) => value))
    : Math.min(...ranked.map(({ value }) => value));
  return ranked.filter(({ value }) => value === target).map(({ title }) => title);
}

function mentionedRecordTitles(
  interpretation: string,
  records: DashboardRecordInput[],
): string[] {
  let remaining = interpretation;
  const titles = [...new Set(records.map(({ title }) => title))]
    .sort((left, right) => right.length - left.length);
  return titles.filter((title) => {
    const pattern = new RegExp(`(?:^|\\W)${escaped(title)}(?=$|\\W)`, "i");
    if (!pattern.test(remaining)) return false;
    remaining = remaining.replace(pattern, (match) => " ".repeat(match.length));
    return true;
  });
}

function hasUnsupportedInterpretationClaim(
  interpretation: string,
  records: DashboardRecordInput[] = [],
): boolean {
  const unsupportedTrend = /\b(?:trend(?:s|ed|ing)?|improv(?:e|es|ed|ing|ement)|increas(?:e|es|ed|ing)|decreas(?:e|es|ed|ing)|grew|declin(?:e|es|ed|ing)|rose|fell)\b|\b(?:up|down)\s+[-+]?\d/i;
  if (unsupportedTrend.test(interpretation)) return true;

  const ranking = /\b(?:leading|highest|best|top)\b/i.test(interpretation)
    ? "highest"
    : /\b(?:lowest|worst|bottom)\b/i.test(interpretation)
    ? "lowest"
    : undefined;
  if (!ranking) return false;
  const expectedTitles = rankedRecordTitles(records, ranking);
  const mentionedTitles = mentionedRecordTitles(interpretation, records);
  return expectedTitles.length === 0
    || !expectedTitles.some((title) =>
      mentionedTitles.some((mentioned) => mentioned.toLowerCase() === title.toLowerCase())
    );
}

/** Derives one factual dashboard takeaway from the unchanged fixture. */
export function deriveDashboardInterpretation(
  fixture: Pick<DashboardFixture, "records" | "stats">,
): string | undefined {
  const ranked = (fixture.records ?? []).flatMap((record) => {
    const value = numericStatus(record.status);
    return value === undefined ? [] : [{ record, value }];
  });
  if (ranked.length >= 2) {
    const highest = ranked.reduce((best, item) => item.value > best.value ? item : best);
    return `${highest.record.title} has the highest reported rate at ${highest.record.status}.`;
  }
  if (ranked[0]) {
    return `${ranked[0].record.title} is reported at ${ranked[0].record.status}.`;
  }
  const record = fixture.records?.[0];
  if (record) return `${record.title} is reported as ${record.status}.`;
  const stat = fixture.stats?.[0];
  return stat ? `${stat.label} is ${stat.value}.` : undefined;
}

function componentOpeningTags(source: string, binding: string): string[] {
  return [...source.matchAll(new RegExp(`<${escaped(binding)}\\b[^>]*>`, "g"))]
    .map(([tag]) => tag);
}

function declaresOptionalProp(source: string, prop: string): boolean {
  return new RegExp(`\\b${escaped(prop)}\\s*\\?\\s*:`).test(source);
}

function usesSupportedProp(tag: string, props: string[]): boolean {
  return props.some((prop) => new RegExp(`\\b${escaped(prop)}\\s*=`).test(tag));
}

function installedComponentTags(
  source: string,
  renderableSource: string,
  path: string,
  component: string,
): string[] {
  return importedBindings(source, path, component).flatMap((binding) =>
    componentOpeningTags(renderableSource, binding)
  );
}

function missingInstalledPrimitives(
  source: string,
  renderableSource: string,
  componentSource: string,
  path: string,
  names: string[],
): string[] {
  return names.filter((name) =>
    new RegExp(`\\b${escaped(name)}\\b`).test(componentSource)
    && installedComponentPosition(source, renderableSource, path, name) < 0
  );
}

function missingCompoundFinding(
  id: string,
  label: string,
  missing: string[],
  fix: string,
): DashboardStructureFinding[] {
  if (!missing.length) return [];
  return [finding(
    id,
    "serious",
    `The installed ${label} composition omits ${missing.join(", ")}.`,
    fix,
  )];
}

function compoundCompositionFindings(
  source: string,
  renderableSource: string,
  componentSources: DashboardComponentSources,
): DashboardStructureFinding[] {
  const sidebarMissing = missingInstalledPrimitives(
    source,
    renderableSource,
    componentSources.sidebar,
    "sidebar",
    ["SidebarHeader", "SidebarContent", "SidebarItem"],
  );
  const tableMissing = missingInstalledPrimitives(
    source,
    renderableSource,
    componentSources.table,
    "table",
    ["TableHeader", "TableHead", "TableBody", "TableRow", "TableCell"],
  );
  return [
    ...missingCompoundFinding(
      "under-composed-sidebar",
      "Sidebar",
      sidebarMissing,
      "Use the installed compound Sidebar exports instead of rebuilding those regions.",
    ),
    ...missingCompoundFinding(
      "under-composed-table",
      "Table",
      tableMissing,
      "Build the full table from its installed header, body, row, head, and cell exports.",
    ),
  ];
}

function statCardCompositionFindings(
  source: string,
  renderableSource: string,
  statCardSource: string,
): DashboardStructureFinding[] {
  const contextualProps = ["icon", "change", "description"].filter((prop) =>
    declaresOptionalProp(statCardSource, prop)
  );
  const tags = installedComponentTags(source, renderableSource, "stat-card", "StatCard");
  if (!contextualProps.length || !tags.some((tag) => !usesSupportedProp(tag, contextualProps))) {
    return [];
  }
  return [finding(
    "under-composed-stat-cards",
    "serious",
    "One or more StatCards omit every contextual slot exposed by the installed component.",
    `Give each StatCard at least one truthful installed slot: ${contextualProps.join(", ")}.`,
  )];
}

function sidebarItemCompositionFindings(
  source: string,
  renderableSource: string,
  sidebarSource: string,
): DashboardStructureFinding[] {
  if (!declaresOptionalProp(sidebarSource, "icon")) return [];
  const tags = installedComponentTags(source, renderableSource, "sidebar", "SidebarItem");
  if (!tags.some((tag) => !usesSupportedProp(tag, ["icon"]))) return [];
  return [finding(
    "under-composed-sidebar-items",
    "serious",
    "One or more SidebarItems omit the icon slot exposed by the installed component.",
    "Use a truthful icon from the project's installed icon library on every primary navigation item.",
  )];
}

function dashboardCompositionFindings(
  source: string,
  renderableSource: string,
  componentSources: DashboardComponentSources,
): DashboardStructureFinding[] {
  return [
    ...compoundCompositionFindings(source, renderableSource, componentSources),
    ...sidebarItemCompositionFindings(source, renderableSource, componentSources.sidebar),
    ...statCardCompositionFindings(source, renderableSource, componentSources.statCard),
  ];
}

/** Deterministic source gate for the dashboard contract served by the MCP. */
export function analyzeDashboardStructure(input: DashboardStructureInput): DashboardStructureReport {
  const findings: DashboardStructureFinding[] = [];
  const source = maskLexical(resolveStaticCopyBindings(input.source), true);
  const titlePosition = exactHeadingPosition(source, input.requiredTitle);
  const sidebarPosition = installedComponentPosition(input.source, source, "sidebar", "Sidebar");
  const metricsPosition = installedComponentPosition(input.source, source, "stat-card", "StatCard");
  const recordsPosition = installedComponentPosition(input.source, source, "table", "Table");
  const progressPosition = installedComponentPosition(input.source, source, "progress", "Progress");
  const interpretationPosition = source.indexOf(
    input.interpretation,
    Math.max(0, titlePosition),
  );
  const supportingLinePosition = source.indexOf(
    input.requiredSupportingLine,
    Math.max(0, titlePosition),
  );
  const primaryActionPosition = source.indexOf(
    input.requiredPrimaryAction,
    Math.max(0, titlePosition),
  );
  const overviewSource = titlePosition >= 0 && interpretationPosition >= 0
    ? source.slice(titlePosition, interpretationPosition + input.interpretation.length)
    : source;
  const primaryActionCount = occurrenceCount(overviewSource, input.requiredPrimaryAction);

  if (!/\bexport\s+default\b/.test(source)) {
    findings.push(finding(
      "incomplete-page-source",
      "critical",
      "The submitted source is an excerpt rather than the complete page module.",
      "Pass the complete page source, including its default export, without summarizing or reconstructing it.",
    ));
  }

  if (titlePosition < 0) {
    findings.push(finding(
      "missing-title",
      "critical",
      "The exact supplied dashboard title is not the page h1.",
      `Render <h1>${input.requiredTitle}</h1> without rewriting it.`,
    ));
  } else if (hasTitleEyebrow(source, titlePosition)) {
    findings.push(finding(
      "title-eyebrow",
      "serious",
      "A category, status, or kicker appears immediately above the page title.",
      "Start the page header with the h1 and place essential context in its supporting line.",
    ));
  }
  if (supportingLinePosition < 0) {
    findings.push(finding(
      "missing-supporting-line",
      "critical",
      "The exact supplied supporting line is absent.",
      "Restore the supplied supporting line in the page header.",
    ));
  }
  if (primaryActionCount === 0) {
    findings.push(finding(
      "missing-primary-action",
      "critical",
      "The exact supplied primary action is absent.",
      `Render one ${input.requiredPrimaryAction} action in the page header.`,
    ));
  } else if (primaryActionCount > 1) {
    findings.push(finding(
      "duplicate-primary-action",
      "critical",
      "The overview repeats its primary action in multiple surfaces.",
      `Keep one ${input.requiredPrimaryAction} action in the page header and remove the duplicate task card.`,
    ));
  }
  if (titlePosition >= 0 && supportingLinePosition >= 0 && primaryActionPosition >= 0
    && !sharesPageHeaderContainer(
      source,
      [titlePosition, supportingLinePosition, primaryActionPosition],
    )) {
    findings.push(finding(
      "split-page-header",
      "serious",
      "The title, supporting line, and primary action are split across separate regions.",
      "Group the h1, its one supporting line, and the single primary action in the page header.",
    ));
  }
  if (sidebarPosition < 0) {
    findings.push(finding(
      "missing-sidebar-component",
      "critical",
      "The installed Sidebar is not both imported and composed.",
      "Build the app shell from the installed Sidebar exports.",
    ));
  }
  if (recordsPosition < 0) {
    findings.push(finding(
      "missing-table-component",
      "critical",
      "The installed Table is not both imported and composed.",
      "Render the records with the installed Table exports.",
    ));
  }
  if (/<aside\b/.test(source)) {
    findings.push(finding(
      "raw-sidebar",
      "critical",
      "A raw aside bypasses the installed Sidebar composition.",
      "Replace the raw aside with installed Sidebar exports.",
    ));
  }
  if (/<table\b/.test(source)) {
    findings.push(finding(
      "raw-table",
      "critical",
      "A raw table bypasses the installed Table composition.",
      "Replace the raw table with installed Table exports.",
    ));
  }
  if (metricsPosition < 0) {
    findings.push(finding(
      "missing-stat-card-component",
      "critical",
      "The installed StatCard is not both imported and composed.",
      "Compose the supplied metrics with the installed StatCard.",
    ));
  }
  if (interpretationPosition < 0) {
    findings.push(finding(
      "missing-interpretation",
      "critical",
      "The required factual interpretation is absent from source.",
      "Add the supplied or factually derived interpretation after the records.",
    ));
  }
  if (hasUnsupportedInterpretationClaim(input.interpretation, input.records)) {
    findings.push(finding(
      "unsupported-interpretation-claim",
      "critical",
      "The interpretation makes a trend or ranking claim that the supplied fixture does not support.",
      "Use a snapshot fact from the fixture, or name the actual highest or lowest numeric record.",
    ));
  }
  const ordered = [titlePosition, metricsPosition, recordsPosition, interpretationPosition];
  if (ordered.every((position) => position >= 0)
    && ordered.some((position, index) => index > 0 && position <= ordered[index - 1]!)) {
    findings.push(finding(
      "wrong-scan-order",
      "serious",
      "The source does not follow title, metrics, records, interpretation order.",
      "Move the interpretation after the Table and keep metrics before records.",
    ));
  }
  if (input.dependentTaskScreens <= 3
    && (progressPosition >= 0
      || hasCustomStepRail(input.source)
      || /<OnboardingStepper\b|role=["']progressbar["']|aria-label=["'][^"']*progress/i.test(input.source))) {
    findings.push(finding(
      "short-flow-stepper",
      "serious",
      "A stepper or progress rail is present for three or fewer dependent task screens.",
      "Remove the stepper; simple Step N of M text inside task screens is sufficient.",
    ));
  }
  if (usesActionColorForEveryRecord(input.source)) {
    findings.push(finding(
      "record-rate-action-color",
      "serious",
      "Every record rate uses the primary action color.",
      "Use a neutral or semantic Badge treatment and reserve primary color for actions and selection.",
    ));
  }
  if (primaryActionPosition >= 0 && metricsPosition >= 0 && primaryActionPosition > metricsPosition) {
    findings.push(finding(
      "primary-action-after-metrics",
      "serious",
      "The primary action appears after the metrics instead of in the page header.",
      "Move the single primary action into the title and supporting-line header group.",
    ));
  }
  if (input.componentSources) {
    findings.push(...dashboardCompositionFindings(
      input.source,
      source,
      input.componentSources,
    ));
  }

  return { verdict: findings.length === 0 ? "pass" : "fail", findings };
}

/** Formats a dashboard analysis as the blocking review shown to an MCP client. */
export function formatDashboardStructureReport(report: DashboardStructureReport): string {
  const status = report.verdict.toUpperCase();
  if (report.findings.length === 0) {
    return `# Dashboard structure review: ${status}\n\nThe source satisfies the dashboard contract. This PASS applies only to the exact submitted source. Any source edit invalidates this PASS; rerun this tool before finalizing the UI review.`;
  }
  const details = report.findings.map((item) =>
    `- **${item.severity.toUpperCase()} — ${item.id}:** ${item.message} Fix: ${item.fix}`
  ).join("\n");
  return `# Dashboard structure review: ${status}\n\n${details}\n\nFix every finding, then call this tool again.`;
}

/** Registers the final, source-aware dashboard review gate on an MCP server. */
export function registerDashboardReviewTools({ server, track }: RegisterToolDeps): void {
  server.registerTool(
    "review-dashboard-structure",
    {
      title: "Review Dashboard Structure",
      description: `Deterministically review the source of a dashboard or overview before presenting it. For every dashboard, call this after get-review-rules and before check-comprehension. A prose self-review is not a substitute.

Pass the complete page module source, the unchanged fixture, the factual interpretation, and the installed Sidebar, StatCard, and Table source files. Never summarize, reconstruct, or submit only the overview component. The tool derives the overview contract from the fixture. It fails incomplete source, rewritten copy, unsupported claims, weak hierarchy, missing or under-composed installed components, raw aside/table markup, the wrong scan order, action color on every rate, and stepper rails on short flows.

FAIL is blocking and returns an MCP tool error. Fix every finding and call the tool again until PASS. Then run check-comprehension and inspect-spacing, and call finalize-dashboard-review. Only its VALID source-bound receipt permits presentation.`,
      inputSchema: z.object({
        screen: z.string().trim().min(1).max(120)
          .describe("What this dashboard is, e.g. 'funnel report overview'."),
        source: z.string().min(1).max(120000)
          .describe("Complete TSX or JSX source for the dashboard page."),
        fixture: dashboardFixtureSchema
          .describe("The request's unchanged fixture object. The first step is the overview; remaining steps are dependent task screens."),
        interpretation: z.string().trim().min(1).max(2000)
          .describe("Exact supplied or factually derived takeaway that must appear after records."),
        componentSources: dashboardComponentSourcesSchema.optional()
          .describe("Installed Sidebar, StatCard, and Table source files for compound-composition review."),
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ screen, context, source, fixture, interpretation, componentSources }) => {
      const start = Date.now();
      const [overview, ...taskSteps] = fixture.steps;
      const report = analyzeDashboardStructure({
        source,
        requiredTitle: overview!.title,
        requiredSupportingLine: overview!.description,
        requiredPrimaryAction: overview!.action,
        interpretation,
        dependentTaskScreens: taskSteps.length,
        records: fixture.records,
        componentSources,
      });
      const text = formatDashboardStructureReport(report);
      track(
        "review-dashboard-structure",
        { screen, context, verdict: report.verdict, findingCount: report.findings.length },
        {
          durationMs: Date.now() - start,
          isError: report.verdict === "fail",
          outputPreview: text.slice(0, 1000),
          review: {
            page: screen,
            input: toRedactedJson({ screen, source, fixture, interpretation, componentSources }),
            output: text,
            findings: report.findings.map((f) => ({ key: f.id, severity: f.severity, problem: f.message })),
          },
        },
      );
      return {
        content: [{ type: "text" as const, text }],
        isError: report.verdict === "fail",
      };
    },
  );
}
