import { z } from "zod";
import { DENSITY_MODES, inspectSpacing, LAYOUT_ROLES, nativeTreeToState, SPACING_CAPTURE_SCRIPT } from "../../inspection";
import { SPACING_FINDING_COPY } from "../../inspection/finding-copy";
import type { DensityReport, InspectionFinding, InspectionOverlayState, LayoutStateSnapshot, NativeAccessibilityNode } from "../../inspection";
import { SPACING_INSPECTION_WIDGET_URI } from "../spacing-inspection-html";
import type { RegisterToolDeps } from "./shared";
import { CONTEXT_ARG, READ_ONLY_TOOL_ANNOTATIONS, loadSessionGuidance, mcpClientName } from "./shared";
import { reviewDesignSystemStep } from "../session-guidance";

const finiteNumber = z.number().finite();
const rectSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  width: finiteNumber.nonnegative(),
  height: finiteNumber.nonnegative(),
});
const edgesSchema = z.object({
  top: finiteNumber,
  right: finiteNumber,
  bottom: finiteNumber,
  left: finiteNumber,
});
const cornerRadiusAxesSchema = z.object({
  horizontal: finiteNumber.nonnegative(),
  vertical: finiteNumber.nonnegative(),
});
const cornerRadiusSchema = z.union([
  cornerRadiusAxesSchema,
  finiteNumber.nonnegative().transform((value) => ({
    horizontal: value,
    vertical: value,
  })),
]);
const cornerRadiiSchema = z.object({
  topLeft: cornerRadiusSchema,
  topRight: cornerRadiusSchema,
  bottomRight: cornerRadiusSchema,
  bottomLeft: cornerRadiusSchema,
});
const styleSchema = z.object({
  display: z.string().max(60).optional(),
  position: z.string().max(60).optional(),
  flexDirection: z.string().max(60).optional(),
  flexWrap: z.string().max(60).optional(),
  alignItems: z.string().max(60).optional(),
  justifyContent: z.string().max(60).optional(),
  rowGap: finiteNumber.optional(),
  columnGap: finiteNumber.optional(),
  padding: edgesSchema.optional(),
  margin: edgesSchema.optional(),
  autoMargins: z.array(z.enum(["top", "right", "bottom", "left"])).max(4).optional(),
  overflowX: z.string().max(60).optional(),
  overflowY: z.string().max(60).optional(),
  textOverflow: z.string().max(60).optional(),
  borderRadius: cornerRadiiSchema.optional(),
  backgroundColor: z.string().max(160).optional(),
  backgroundImage: z.string().max(1000).optional(),
  boxShadow: z.string().max(1000).optional(),
});
const elementSchema = z.object({
  id: z.string().min(1).max(300),
  selector: z.string().max(500).optional(),
  tag: z.string().max(80).optional(),
  role: z.string().max(80).optional(),
  label: z.string().max(160).optional().describe("The text a person sees on it: a button's or heading's text, or an image's alt text. Reports name the element by it."),
  parentId: z.string().max(300).optional(),
  groupId: z.string().max(300).optional(),
  alignmentGroup: z.string().max(300).optional(),
  alignmentEdge: z.enum(["left", "right", "top", "bottom", "center-x", "center-y"]).optional(),
  expectedSymmetry: z.enum(["horizontal", "vertical", "both"]).optional(),
  compareSize: z.enum(["width", "height", "both"]).optional(),
  interactive: z.boolean().optional(),
  rect: rectSchema,
  style: styleSchema.optional(),
  lineCount: finiteNumber.int().positive().optional(),
  inputType: z.string().max(40).optional(),
  clientWidth: finiteNumber.nonnegative().optional(),
  clientHeight: finiteNumber.nonnegative().optional(),
  scrollWidth: finiteNumber.nonnegative().optional(),
  scrollHeight: finiteNumber.nonnegative().optional(),
  inertCrop: z.object({ width: finiteNumber.nonnegative(), height: finiteNumber.nonnegative() }).optional(),
});
const NATIVE_NODE_LIMIT = 1500;
const NATIVE_DEPTH_LIMIT = 64;
const nativeNodeSchema = z.object({
  type: z.string().max(80).optional(),
  role: z.string().max(80).optional(),
  AXLabel: z.string().max(2000).nullable().optional(),
  frame: rectSchema.optional(),
  children: z.array(z.unknown()).max(200).optional(),
});
/**
 * Checks a native tree node by node with an explicit stack, so a deep tree stops
 * at the depth limit instead of overflowing the call stack, and a screen never
 * holds more nodes than a web capture may.
 */
const nativeTreeSchema = z.array(z.unknown()).min(1).max(20).superRefine((roots, ctx) => {
  const stack: Array<{ node: unknown; depth: number }> = roots.map((node) => ({ node, depth: 1 }));
  let count = 0;
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    count += 1;
    if (count > NATIVE_NODE_LIMIT || depth > NATIVE_DEPTH_LIMIT) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `A screen may hold ${NATIVE_NODE_LIMIT} nodes at most, ${NATIVE_DEPTH_LIMIT} levels deep.` });
      return;
    }
    const parsed = nativeNodeSchema.safeParse(node);
    if (!parsed.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `A node does not match the accessibility tree shape: ${parsed.error.issues[0]?.message ?? "invalid"}.` });
      return;
    }
    for (const child of parsed.data.children ?? []) stack.push({ node: child, depth: depth + 1 });
  }
});
/** One screen of a native app, as the accessibility tree `axe describe-ui` prints for an iOS simulator. */
export const nativeStateSchema = z.object({
  name: z.string().min(1).max(100),
  tree: nativeTreeSchema,
});
const screenshotSchema = z.string()
  .max(5_000_000)
  .regex(/^data:image\/(?:png|jpeg|webp);base64,/, "Use a PNG, JPEG, or WebP data URL.");
/** Zod contract for one browser-captured layout state. */
export const spacingStateSchema = z.object({
  name: z.string().min(1).max(100),
  title: z.string().max(160).optional().describe("The page title, document.title. The Review tab names the check by it."),
  viewport: z.object({
    width: finiteNumber.positive().max(20_000),
    height: finiteNumber.positive().max(20_000),
    devicePixelRatio: finiteNumber.positive().max(10).optional(),
  }),
  elements: z.array(elementSchema).max(1500).describe("Every element, in page order."),
  density: z.object({
    mode: z.string().max(20).optional(),
    source: z.string().max(20).optional(),
    unit: finiteNumber.positive().max(64).optional(),
  }).optional().describe("The density the page declares through the kit's --layout-density variable. The capture script fills it."),
  screenshotDataUrl: screenshotSchema.optional()
    .describe("Optional browser screenshot as a data URL. It remains in the structured evidence for report renderers and is not persisted."),
});

const evidenceSchema = z.object({
  label: z.string(),
  value: z.union([z.number(), z.string()]),
  unit: z.enum(["px", "count"]).optional(),
});
const findingSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  state: z.string(),
  severity: z.enum(["critical", "serious", "moderate"]),
  message: z.string(),
  fix: z.string(),
  elementIds: z.array(z.string()),
  evidence: z.array(evidenceSchema),
});
const densityReportSchema = z.object({
  mode: z.enum(DENSITY_MODES),
  source: z.enum(["argument", "project", "design-system", "measured"]),
  roles: z.array(z.object({
    role: z.enum(LAYOUT_ROLES),
    state: z.string(),
    measured: z.number(),
    expected: z.number(),
    matches: z.boolean(),
  })),
});
const overlayStateSchema = z.object({
  name: z.string(),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
    devicePixelRatio: z.number().optional(),
  }),
  elements: z.array(z.object({ id: z.string(), label: z.string().optional(), name: z.string().optional(), rect: rectSchema })),
  screenshotDataUrl: z.string().optional(),
});
/**
 * The widths the tool asks for. A layout fault is only true at a width, and
 * these three are where the common ones live: the phone, the laptop, and the
 * wide screen where a centred shell starts leaving a gutter. [BD-574]
 */
export const RECOMMENDED_VIEWPORT_WIDTHS = [390, 1440, 1728] as const;
/** How far a capture may sit from a recommended width and still count as that width. */
const WIDTH_TOLERANCE = 40;

/** Whether a captured viewport covers one required review width. */
export function coversRecommendedWidth(
  states: Array<{ viewport: { width: number } }>,
  width: number,
): boolean {
  return states.some(
    (state) => Math.abs(state.viewport.width - width) <= WIDTH_TOLERANCE,
  );
}

/**
 * Names the recommended widths this capture set does not cover, so a caller
 * cannot read `completed` on one desktop capture as full coverage. It reports
 * rather than refuses: the tool measures any surface, and a caller with a good
 * reason to capture one width still gets its findings.
 */
export function missingRecommendedWidths(
  states: Array<{ viewport: { width: number } }>,
): number[] {
  return RECOMMENDED_VIEWPORT_WIDTHS.filter(
    (width) => !coversRecommendedWidth(states, width),
  );
}

function formatFindingSummary(finding: InspectionFinding, states: InspectionOverlayState[]): string {
  const copy = SPACING_FINDING_COPY[finding.ruleId];
  if (!copy) return `- ${finding.message} ${finding.fix}`;
  const state = states.find((item) => item.name === finding.state);
  const targetId = finding.elementIds[copy.primaryElementIndex ?? 0] ?? finding.elementIds[0];
  const element = state?.elements.find((item) => item.id === targetId);
  const named = element?.name || element?.label || element?.id || finding.state;
  // A description such as "the list holding …" opens the line, so it takes a capital.
  const location = element?.name && element.name !== element.label ? named.charAt(0).toUpperCase() + named.slice(1) : named;
  return `- ${location} (${finding.state}): ${copy.title}. ${copy.fix}`;
}

function formatFindings(findings: InspectionFinding[], states: InspectionOverlayState[], full: boolean): string {
  const priority = { critical: 0, serious: 1, moderate: 2 };
  const sorted = [...findings].sort((a, b) => priority[a.severity] - priority[b.severity]);
  if (full) {
    return sorted.map((finding) => {
      const evidence = finding.evidence.map((item) => `${item.label}: ${item.value}${item.unit ?? ""}`).join(", ");
      return `- ${finding.severity} [${finding.state}]: ${finding.message} ${finding.fix}\n  Evidence: ${evidence}`;
    }).join("\n");
  }
  const [first] = sorted;
  if (!first) return "";
  const summary = formatFindingSummary(first, states);
  if (findings.length === 1) return summary;
  return `${summary}\nSee the report for more results, or use detail: "full" for all measurements in text.`;
}

function formatWidths(widths: number[]): string {
  if (widths.length === 1) return `${widths[0]}px`;
  return `${widths.slice(0, -1).join(", ")} and ${widths.at(-1)}px`;
}

/** Closes every measured result, so a clean score never reads as approval. [BD-593] */
const GEOMETRY_ONLY = "This measured geometry only. A clean result or a score of 100 is not visual approval: it cannot judge hierarchy or whether the design works.";

const DENSITY_SOURCE_TEXT = {
  argument: "the density argument",
  project: "the project's design config",
  "design-system": "the design system's default",
  measured: "the closest match to the measured page",
} satisfies Record<DensityReport["source"], string>;

/** One line naming the density the page was checked against and where it came from. */
function densityLine(report: DensityReport | undefined): string {
  if (!report) return "";
  const head = `Density: ${report.mode}, from ${DENSITY_SOURCE_TEXT[report.source]}.`;
  if (!report.roles.length) return `${head} No layout role was measured: capture a desktop width of at least 1024px with a main element.`;
  const off = report.roles.filter((role) => !role.matches).length;
  return off ? `${head} ${off} of ${report.roles.length} measured layout roles depart from it.` : `${head} Every measured layout role matches it.`;
}

function resultTitle(total: number, full: boolean): string {
  if (total === 0) return "No spacing issues found";
  if (!full) return "Spacing needs attention";
  if (total === 1) return "One spacing issue needs attention";
  return `${total} spacing issues need attention`;
}

/**
 * Registers inspect-spacing, which measures a rendered DOM and returns the
 * findings in an inline report with a concise text summary. It reports what the
 * layout actually is, rather than what the guidance says it should be.
 */
export function registerInspectionTools({ server, provider, tracked, userId }: RegisterToolDeps): void {
  server.registerTool(
    "inspect-spacing",
    {
      title: "Inspect Rendered Spacing",
      description: `Measure spacing in a rendered interface. Returns an inline report with a clear problem and correction, plus a short text summary. Full measurements remain available in the report and structuredContent. Use after UI changes when a browser or DOM evaluator is available. A Shopify theme preview or a React Native web export counts: run the script in that page. A native app on an iOS simulator (SwiftUI, or React Native) is measured from its accessibility tree instead: run \`axe describe-ui --udid <simulator id>\` (AXe: \`brew install cameroncooke/axe/axe\`; point \`DEVELOPER_DIR\` at Xcode if it asks) on each screen and pass the printed JSON as nativeStates. That needs no capture script and no widths.

This is the runtime counterpart to get-review-rules. It automatically loads the live visual-design rubric, but it does not guess pixel values from a screenshot. Exact claims come from DOM geometry.

It measures geometry only. A score of 100 is not visual approval: it cannot judge hierarchy or whether the design works, so look at a screenshot before you call a screen done.

Workflow:
1. Call with no states to receive a read-only browser capture script in structuredContent.captureScript. Use detail: "full" if your client reads only text; it includes the script in text. That call measures nothing.
2. Evaluate that script in each rendered state you need to review: at minimum 1440, 1728 and 390 wide. Also capture named hover, focus, selected, and open states when they change a control's surface or layout.
3. Call again with the captured states and the project's spacing scale when known. The layout counts as measured only when this second call returns status \`completed\`; reading the snapshot yourself is not a measurement. The report and summary start with the highest-priority correction. Read structuredContent.findings or use detail: "full" for every returned finding, measurement, and fix. Structured evidence retains captured geometry and optional screenshots for report renderers.
4. At desktop widths it also checks five layout roles (sidebar width, page inset, section gap, column gap, card padding) against one density: the density argument, else the density the page's kit declares, else the closest measured mode. structuredContent.density names the mode, where it came from, and each role's measured and expected value.

The capture reads visible layout geometry, computed spacing, corner radii, surface styles, the number of line boxes each text block rendered, short accessible labels for interactive controls, the text of headings, the alt text of images, and the page title. It does not collect source code, cookies, form values, or network data. Add data-bd-inspect-label, data-bd-symmetry, data-bd-group, data-bd-compare-size, data-bd-align-group, and data-bd-align-edge attributes when the intended relationship cannot be inferred safely.`,
      inputSchema: z.object({
        states: z.array(spacingStateSchema).min(1).max(6).optional()
          .describe("Rendered layout states from the capture script. Omit on the first call to receive the script."),
        nativeStates: z.array(nativeStateSchema).min(1).max(6).optional()
          .describe("Native screens: a name for each, and the JSON `axe describe-ui` printed for it. Frames are in points and are measured as pixels."),
        spacingScale: z.array(finiteNumber.positive()).min(2).max(32).optional()
          .describe("Project spacing tokens in CSS pixels. Defaults to 4, 8, 12, 16, 24, 32, 48, 64, 96, 128."),
        tolerance: finiteNumber.min(0).max(4).optional()
          .describe("Pixel tolerance for grouping measurements. Defaults to 1px."),
        density: z.enum(DENSITY_MODES).optional()
          .describe("The layout density to check against: compact, comfortable or spacious. Omit it to use the project's design config, then the design system's default, both read from the page's --layout-density variable, then the mode closest to the measured page."),
        detail: z.enum(["summary", "full"]).default("summary")
          .describe("Defaults to a short summary alongside the inline report. Use full for the capture script or all findings and measurements in text-only clients."),
        context: CONTEXT_ARG,
      }),
      outputSchema: z.object({
        status: z.enum(["needs-capture", "completed"]),
        score: z.number().optional(),
        summary: z.object({
          critical: z.number(),
          serious: z.number(),
          moderate: z.number(),
          total: z.number(),
          truncated: z.number().optional(),
        }).optional(),
        findings: z.array(findingSchema).optional(),
        capturedWidths: z.array(z.number()).optional(),
        missingWidths: z.array(z.number()).optional(),
        states: z.array(overlayStateSchema).optional(),
        rubric: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
        rubricStatus: z.enum(["loaded", "unavailable"]).optional(),
        captureScript: z.string().optional(),
        nextStep: z.string().optional(),
        density: densityReportSchema.optional(),
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      _meta: {
        ui: { resourceUri: SPACING_INSPECTION_WIDGET_URI },
        "ui/resourceUri": SPACING_INSPECTION_WIDGET_URI,
        "openai/outputTemplate": SPACING_INSPECTION_WIDGET_URI,
        "openai/toolInvocation/invoking": "Measuring rendered spacing...",
        "openai/toolInvocation/invoked": "Spacing inspection ready",
      },
    },
    async ({ states: webStates, nativeStates, spacingScale, tolerance, density, detail, context }) => tracked(
      "inspect-spacing",
      { context, density, stateCount: (webStates?.length ?? 0) + (nativeStates?.length ?? 0), native: Boolean(nativeStates?.length), hasScreenshots: webStates?.some((state) => Boolean(state.screenshotDataUrl)) ?? false },
      async () => {
        const native = !webStates?.length && Boolean(nativeStates?.length);
        // SAFETY: nativeTreeSchema checked every node's shape, the node count and the depth.
        const states = webStates ?? nativeStates?.map((screen) => nativeTreeToState(screen.tree as NativeAccessibilityNode[], screen.name));
        if (!states?.length) {
          return {
            content: [{
              type: "text" as const,
              text: [
                'No measurements yet. Run structuredContent.captureScript at 390, 1440 and 1728px, then submit the captured states. Include hover, focus, selected and open states if the layout changes. Use detail: "full" for the script in text.',
                detail === "full" ? `\`\`\`javascript\n${SPACING_CAPTURE_SCRIPT}\n\`\`\`` : "",
              ].filter(Boolean).join("\n\n"),
            }],
            structuredContent: {
              status: "needs-capture" as const,
              captureScript: SPACING_CAPTURE_SCRIPT,
            },
          };
        }

        // The session lookup never throws, so it runs beside the rubric. [BD-1172]
        const sessionLookup = loadSessionGuidance(provider, userId, mcpClientName(server));
        let rubric: Array<{ id: string; title: string }> = [];
        let rubricStatus: "loaded" | "unavailable" = "loaded";
        try {
          const rules = await provider.getReviewRules("visual-design");
          const seenTitles = new Set<string>();
          rubric = rules.flatMap((rule) => {
            const key = rule.title.trim().toLowerCase();
            if (seenTitles.has(key)) return [];
            seenTitles.add(key);
            return [{ id: rule.id, title: rule.title }];
          });
        } catch {
          rubricStatus = "unavailable";
        }

        // SAFETY: the JSON contract of this payload; the producing side owns the shape.
        const result = inspectSpacing({
          states: states as LayoutStateSnapshot[],
          spacingScale,
          tolerance,
          density,
        });
        const captured = [...new Set(states.map((state) => state.viewport.width))].sort((a, b) => a - b);
        // A native screen has one width, the device's, so the web widths do not apply.
        const missing = native ? [] : missingRecommendedWidths(states);
        const coverageLine = missing.length
          ? `Add ${formatWidths(missing)} to cover every recommended width.`
          : "";
        const findingsText = formatFindings(result.findings, result.states, detail === "full");
        // Clients that read an output schema pass only structuredContent to the
        // model, so the step goes in both places.
        const nextStep = reviewDesignSystemStep(await sessionLookup);
        const text = [
          `${resultTitle(result.summary.total, detail === "full")}. Checked at ${formatWidths(captured)}.`,
          detail === "full" ? `Spacing score: ${result.score}/100.` : "",
          coverageLine,
          densityLine(result.density),
          findingsText,
          result.summary.truncated
            ? `${result.summary.truncated} additional findings exceeded the analysis limit. Inspect smaller sections before treating this review as complete.`
            : "",
          GEOMETRY_ONLY,
          nextStep,
        ].filter(Boolean).join("\n\n");
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            status: "completed" as const,
            ...result,
            capturedWidths: captured,
            missingWidths: missing,
            rubric,
            rubricStatus,
            ...(nextStep && { nextStep }),
          },
        };
      },
    ),
  );
}
