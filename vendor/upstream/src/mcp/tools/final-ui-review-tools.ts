import { toRedactedJson } from "../../review-capture";
import { createHash } from "node:crypto";
import { z } from "zod";

import { inspectSpacing } from "../../inspection";
import type {
  DashboardBrowserCapture,
  DashboardBrowserCaptureState,
} from "../dashboard-browser-capture";
import { analyzeComprehension } from "../comprehension";
import {
  analyzeDashboardStructure,
  dashboardComponentSourcesSchema,
  dashboardFixtureSchema,
  deriveDashboardInterpretation,
  type DashboardComponentSources,
  type DashboardFixture,
} from "./dashboard-review-tools";
import {
  coversRecommendedWidth,
  missingRecommendedWidths,
  RECOMMENDED_VIEWPORT_WIDTHS,
} from "./inspection-tools";
import type { RegisterToolDeps } from "./shared";
import { CONTEXT_ARG, READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "./shared";

/** Inputs the final dashboard review binds into one receipt. */
export interface FinalDashboardUiReviewInput {
  screen: string;
  previewUrl: string;
  source: string;
  visibleSource: string;
  fixture: DashboardFixture;
  componentSources: DashboardComponentSources;
  knownTerms?: string[];
}

interface FinalDashboardReviewEvaluation extends FinalDashboardUiReviewInput {
  capture?: DashboardBrowserCapture;
  captureError?: string;
}

/** One blocking failure across source, copy, component, or rendered review. */
export interface FinalUiReviewFinding {
  id: string;
  severity: "critical" | "serious";
  message: string;
  fix: string;
}

/** Receipt issued only when every final UI gate passes. */
export interface UiReviewReceipt {
  schemaVersion: 1;
  issuedBy: "better-design-mcp";
  receiptId: string;
  sourceSha256: string;
  deploymentRevisionSha256: string;
  previewUrl: string;
  visibleSourceSha256: string;
  fixtureSha256: string;
  componentSourcesSha256: string;
  renderedEvidenceSha256: string;
  requiredWidths: number[];
  capturedWidths: number[];
  interpretation: string;
  review: {
    structure: "pass";
    comprehension: "pass";
    renderedSpacing: "pass";
  };
}

/** Complete or incomplete final review result. */
export interface FinalUiReviewDecision {
  status: "valid" | "incomplete";
  findings: FinalUiReviewFinding[];
  interpretation?: string;
  receipt?: UiReviewReceipt;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function reviewFinding(
  id: string,
  severity: FinalUiReviewFinding["severity"],
  message: string,
  fix: string,
): FinalUiReviewFinding {
  return { id, severity, message, fix };
}

function comprehensionFindings(
  input: Pick<
    FinalDashboardUiReviewInput,
    "screen" | "visibleSource" | "knownTerms"
  >,
): FinalUiReviewFinding[] {
  const report = analyzeComprehension({
    screen: input.screen,
    code: input.visibleSource,
    knownTerms: input.knownTerms,
    // A dashboard is a screen even when its name mentions slides. [BD-593]
    surface: "screen",
  });
  return report.findings.flatMap((item, index) =>
    item.severity === "minor"
      ? []
      : [
          reviewFinding(
            `comprehension-${item.test}-${index + 1}`,
            item.severity,
            item.problem,
            item.fix,
          ),
        ],
  );
}

interface PngEvidence {
  width: number;
  height: number;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngEvidence(dataUrl: string): PngEvidence | undefined {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) return undefined;
  const bytes = Buffer.from(dataUrl.slice(prefix.length), "base64");
  const signature = "89504e470d0a1a0a";
  if (bytes.length < 45 || bytes.subarray(0, 8).toString("hex") !== signature)
    return undefined;
  let offset = 8;
  let dimensions: PngEvidence | undefined;
  let hasImageData = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return undefined;
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const expectedCrc = bytes.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(bytes.subarray(offset + 4, offset + 8 + length));
    if (actualCrc !== expectedCrc) return undefined;
    if (type === "IHDR" && length === 13 && offset === 8) {
      dimensions = {
        width: bytes.readUInt32BE(offset + 8),
        height: bytes.readUInt32BE(offset + 12),
      };
    }
    if (type === "IDAT" && length > 0) hasImageData = true;
    if (type === "IEND") {
      return length === 0 && hasImageData && end === bytes.length
        ? dimensions
        : undefined;
    }
    offset = end;
  }
  return undefined;
}

function hasMeasuredLandmarks(
  state: DashboardBrowserCaptureState,
  action: string,
  needsTable: boolean,
): boolean {
  const measured = state.elements.filter(
    ({ rect }) => rect.width > 0 && rect.height > 0,
  );
  const tags = new Set(measured.map(({ tag }) => tag?.toLowerCase()));
  const capturedAction = action.trim().slice(0, 80);
  const hasAction = measured.some(
    ({ interactive, label }) => interactive && label?.trim() === capturedAction,
  );
  return (
    measured.length >= 4 &&
    tags.has("main") &&
    tags.has("h1") &&
    (!needsTable || tags.has("table")) &&
    hasAction
  );
}

function invalidCaptureWidths(input: FinalDashboardReviewEvaluation): number[] {
  return (input.capture?.states ?? []).flatMap((state) => {
    const image = state.screenshotDataUrl
      ? pngEvidence(state.screenshotDataUrl)
      : undefined;
    const ratio = state.viewport.devicePixelRatio ?? 1;
    const acceptedWidths = new Set([
      Math.round(state.viewport.width),
      Math.round(state.viewport.width * ratio),
    ]);
    const imageScale = image ? image.width / state.viewport.width : 0;
    const validImage =
      image !== undefined &&
      acceptedWidths.has(image.width) &&
      image.height >= Math.round(state.viewport.height * imageScale);
    const validLayout = hasMeasuredLandmarks(
      state,
      input.fixture.steps[0]?.action ?? "",
      Boolean(input.fixture.records?.length),
    );
    return validImage && validLayout ? [] : [state.viewport.width];
  });
}

function renderedEvidenceFindings(
  input: FinalDashboardReviewEvaluation,
): FinalUiReviewFinding[] {
  const states = input.capture?.states;
  if (input.captureError) {
    return [
      reviewFinding(
        "trusted-browser-capture-failed",
        "critical",
        input.captureError,
        "Deploy the exact dashboard to a public HTTPS preview and retry the server-owned browser capture.",
      ),
    ];
  }
  if (!states?.length) {
    return [
      reviewFinding(
        "rendered-evidence-missing",
        "critical",
        "Better Design's browser did not capture rendered evidence.",
        "Use a public HTTPS preview so Better Design can capture 390, 1440, and 1728 pixels itself.",
      ),
    ];
  }

  const findings: FinalUiReviewFinding[] = [];
  const missing = missingRecommendedWidths(states);
  if (missing.length) {
    findings.push(
      reviewFinding(
        "rendered-width-missing",
        "critical",
        `Rendered evidence is missing ${missing.join(", ")} pixels.`,
        "Keep the public preview reachable so Better Design can recapture every required width.",
      ),
    );
  }
  const screenshotStates = states.filter(({ screenshotDataUrl }) =>
    Boolean(screenshotDataUrl),
  );
  const missingScreenshots = RECOMMENDED_VIEWPORT_WIDTHS.filter(
    (width) => !coversRecommendedWidth(screenshotStates, width),
  );
  if (missingScreenshots.length) {
    findings.push(
      reviewFinding(
        "screenshot-evidence-missing",
        "critical",
        `Screenshot evidence is missing for ${missingScreenshots.join(", ")} pixels.`,
        "Keep the public preview reachable so Better Design can recapture each required viewport.",
      ),
    );
  }
  const invalidWidths = invalidCaptureWidths(input);
  if (invalidWidths.length) {
    findings.push(
      reviewFinding(
        "rendered-evidence-invalid",
        "critical",
        `Rendered evidence is not a correlated PNG and measured landmark capture at ${invalidWidths.join(", ")} pixels.`,
        "Fix the rendered page landmarks, then retry Better Design's server-owned browser capture.",
      ),
    );
  }
  const spacing = inspectSpacing({ states });
  findings.push(
    ...spacing.findings.flatMap((item) =>
      item.severity === "moderate"
        ? []
        : [
            reviewFinding(
              `spacing-${item.ruleId}`,
              item.severity,
              item.message,
              item.fix,
            ),
          ],
    ),
  );
  return findings;
}

function recordsContextFindings(
  input: FinalDashboardReviewEvaluation,
): FinalUiReviewFinding[] {
  const count = input.fixture.records?.length ?? 0;
  const tablePosition = input.visibleSource.search(/<Table\b/);
  if (!count || tablePosition < 0) return [];
  const prefix = input.visibleSource.slice(0, tablePosition);
  const regionStart = Math.max(
    prefix.lastIndexOf("<CardHeader"),
    prefix.lastIndexOf("<section"),
    prefix.lastIndexOf("<article"),
  );
  const region = prefix.slice(Math.max(0, regionStart));
  const findings: FinalUiReviewFinding[] = [];
  if (!/<(?:p|CardDescription)\b/.test(region)) {
    findings.push(
      reviewFinding(
        "missing-records-description",
        "serious",
        "The records region has no supporting line to explain what the saved views are.",
        "Add one short factual description beside the records heading.",
      ),
    );
  }
  const countPattern = new RegExp(
    `(?:>\\s*${count}\\s+(?:charts?|reports?|records?)\\s*<|\\{\\s*(?:records|fixture\\.records)\\.length\\s*\\})`,
    "i",
  );
  if (!countPattern.test(region)) {
    findings.push(
      reviewFinding(
        "missing-records-count",
        "serious",
        "The records region hides how many saved views it contains.",
        "Show the fixture-backed record count beside the records heading.",
      ),
    );
  }
  return findings;
}

function visibleInEveryCapture(
  input: FinalDashboardReviewEvaluation,
  values: string[],
): boolean {
  return (
    Boolean(input.capture?.states.length) &&
    input.capture!.states.every(({ visibleText }) => {
      const normalized = visibleText.replace(/\s+/g, " ").toLocaleLowerCase();
      return values.every((value) =>
        normalized.includes(value.toLocaleLowerCase()),
      );
    })
  );
}

function omittedFixtureLabels(input: FinalDashboardReviewEvaluation) {
  const metrics = (input.fixture.stats ?? [])
    .filter(({ label, value }) => !visibleInEveryCapture(input, [label, value]))
    .map(({ label }) => label);
  const records = (input.fixture.records ?? [])
    .filter(
      ({ title, detail, meta, status }) =>
        !visibleInEveryCapture(input, [title, detail, meta, status]),
    )
    .map(({ title }) => title);
  return { metrics, records };
}

function fixtureCoverageFindings(
  input: FinalDashboardReviewEvaluation,
): FinalUiReviewFinding[] {
  const { metrics, records } = omittedFixtureLabels(input);
  const findings: FinalUiReviewFinding[] = [];
  if (metrics.length)
    findings.push(
      reviewFinding(
        "missing-fixture-metrics",
        "critical",
        `The browser captures omit fixture metrics: ${metrics.join(", ")}.`,
        "Render every supplied metric label and value at every required viewport without rewriting the fixture.",
      ),
    );
  if (records.length)
    findings.push(
      reviewFinding(
        "missing-fixture-records",
        "critical",
        `The browser captures omit fixture record fields for: ${records.join(", ")}.`,
        "Render every supplied record title, detail, date, and status at every required viewport.",
      ),
    );
  return findings;
}

function renderedCopyFindings(
  input: FinalDashboardReviewEvaluation,
  interpretation: string,
): FinalUiReviewFinding[] {
  const overview = input.fixture.steps[0]!;
  const required = [
    overview.title,
    overview.description,
    overview.action,
    interpretation,
  ];
  if (visibleInEveryCapture(input, required)) return [];
  return [
    reviewFinding(
      "rendered-copy-missing",
      "critical",
      "A browser capture omits the required title, support, action, or fixture-derived interpretation.",
      "Keep the complete overview hierarchy and factual interpretation visible at every required viewport.",
    ),
  ];
}

function sourceFindings(
  input: FinalDashboardReviewEvaluation,
  interpretation: string | undefined,
): FinalUiReviewFinding[] {
  const findings: FinalUiReviewFinding[] = [];
  if (
    input.capture &&
    !/^[a-f0-9]{64}$/.test(input.capture.deploymentRevisionSha256)
  ) {
    findings.push(
      reviewFinding(
        "deployment-revision-invalid",
        "critical",
        "The trusted browser capture has no valid content-addressed deployment revision.",
        "Retry the final review so Better Design can bind the receipt to the deployed response and assets it captured.",
      ),
    );
  }
  if (input.capture && input.capture.previewUrl !== input.previewUrl) {
    findings.push(
      reviewFinding(
        "captured-preview-mismatch",
        "critical",
        "The trusted browser evidence came from a different preview URL.",
        "Retry the final review with one public HTTPS preview URL and do not change it during capture.",
      ),
    );
  }
  const overview = input.fixture.steps[0];
  const visibleCopy = [
    overview?.title,
    overview?.description,
    overview?.action,
  ].filter((value): value is string => Boolean(value));
  const completeVisibleSource =
    input.source.includes(input.visibleSource) &&
    /\b(?:function|const)\b/.test(input.visibleSource) &&
    /<h1\b/.test(input.visibleSource) &&
    visibleCopy.every((value) => input.visibleSource.includes(value));
  if (!completeVisibleSource) {
    findings.push(
      reviewFinding(
        "visible-source-not-bound",
        "critical",
        "The visible review source is narrowed or is not an exact complete component from the submitted source.",
        "Copy the complete visible component, including its title, support, action, and interpretation.",
      ),
    );
  }
  if (!interpretation) {
    findings.push(
      reviewFinding(
        "interpretation-source-missing",
        "critical",
        "The fixture has no record or metric from which to derive a factual interpretation.",
        "Supply unchanged dashboard records or metrics in the fixture.",
      ),
    );
    return findings;
  }
  const [, ...taskSteps] = input.fixture.steps;
  const report = analyzeDashboardStructure({
    source: input.source,
    requiredTitle: overview!.title,
    requiredSupportingLine: overview!.description,
    requiredPrimaryAction: overview!.action,
    interpretation,
    dependentTaskScreens: taskSteps.length,
    records: input.fixture.records,
    componentSources: input.componentSources,
  });
  return [
    ...findings,
    ...report.findings,
    ...fixtureCoverageFindings(input),
    ...renderedCopyFindings(input, interpretation),
    ...recordsContextFindings(input),
  ];
}

function issueReceipt(
  input: FinalDashboardReviewEvaluation,
  interpretation: string,
): UiReviewReceipt {
  const states = input.capture?.states ?? [];
  const unsigned = {
    schemaVersion: 1 as const,
    issuedBy: "better-design-mcp" as const,
    sourceSha256: digest(input.source),
    deploymentRevisionSha256: input.capture?.deploymentRevisionSha256 ?? "",
    previewUrl: input.previewUrl,
    visibleSourceSha256: digest(input.visibleSource),
    fixtureSha256: digest(JSON.stringify(input.fixture)),
    componentSourcesSha256: digest(JSON.stringify(input.componentSources)),
    renderedEvidenceSha256: digest(JSON.stringify(states)),
    requiredWidths: [...RECOMMENDED_VIEWPORT_WIDTHS],
    capturedWidths: [
      ...new Set(states.map(({ viewport }) => viewport.width)),
    ].sort((left, right) => left - right),
    interpretation,
    review: {
      structure: "pass" as const,
      comprehension: "pass" as const,
      renderedSpacing: "pass" as const,
    },
  };
  return { ...unsigned, receiptId: digest(JSON.stringify(unsigned)) };
}

/** Runs every final dashboard review gate and issues no receipt on incomplete evidence. */
export function finalizeDashboardUiReview(
  input: FinalDashboardUiReviewInput,
  capture?: DashboardBrowserCapture,
  captureError?: string,
): FinalUiReviewDecision {
  const evaluation = { ...input, capture, captureError };
  const interpretation = deriveDashboardInterpretation(input.fixture);
  const findings = [
    ...sourceFindings(evaluation, interpretation),
    ...comprehensionFindings(input),
    ...renderedEvidenceFindings(evaluation),
  ];
  if (findings.length || !interpretation) {
    return { status: "incomplete", findings, interpretation };
  }
  return {
    status: "valid",
    findings: [],
    interpretation,
    receipt: issueReceipt(evaluation, interpretation),
  };
}

/** Confirms that a receipt still matches the exact source, fixture, components, and evidence. */
export function verifyUiReviewReceipt(
  receipt: UiReviewReceipt,
  input: FinalDashboardUiReviewInput,
  capture: DashboardBrowserCapture,
): boolean {
  const decision = finalizeDashboardUiReview(input, capture);
  return (
    decision.status === "valid" &&
    decision.receipt?.receiptId === receipt.receiptId
  );
}

function formatDecision(decision: FinalUiReviewDecision): string {
  if (decision.status === "valid" && decision.receipt) {
    return `# Final dashboard review: VALID

Receipt \`${decision.receipt.receiptId}\` binds the complete source, visible source, unchanged fixture, installed components, and rendered evidence.

Required interpretation: ${decision.receipt.interpretation}`;
  }
  const findings = decision.findings
    .map(
      (item) =>
        `- **${item.severity.toUpperCase()} — ${item.id}:** ${item.message} Fix: ${item.fix}`,
    )
    .join("\n");
  return `# Final dashboard review: INCOMPLETE

No receipt was issued.

${findings}

Fix every finding and submit the complete evidence set again.`;
}

/** Registers the evidence-gated final UI review tool. */
export function registerFinalUiReviewTools({
  server,
  track,
  captureDashboardBrowser,
}: RegisterToolDeps): void {
  server.registerTool(
    "finalize-dashboard-review",
    {
      title: "Finalize Dashboard Review",
      description: `Issue a source-bound receipt for a completed dashboard.

Submit the public HTTPS preview plus exact source, unchanged data, and installed components. Better Design's own browser captures the deployed page at 390, 1440, and 1728 pixels and content-addresses the live deployment. No trusted browser capture means incomplete. The review blocks weak hierarchy, under-composed components, hidden fixture fields, unclear copy, spacing defects, unsupported interpretations, or source edits.`,
      inputSchema: z.object({
        screen: z.string().trim().min(1).max(120),
        previewUrl: z
          .string()
          .url()
          .max(2048)
          .refine((value) => new URL(value).protocol === "https:", {
            message: "Use a public HTTPS preview URL.",
          })
          .describe("Public HTTPS URL for the exact deployed dashboard route."),
        source: z
          .string()
          .min(1)
          .max(240000)
          .describe(
            "Complete TSX or JSX page source, including its default export.",
          ),
        visibleSource: z
          .string()
          .min(1)
          .max(120000)
          .describe(
            "Exact visible screen component copied unchanged from source.",
          ),
        fixture: dashboardFixtureSchema.describe(
          "The request's unchanged dashboard fixture.",
        ),
        componentSources: dashboardComponentSourcesSchema.describe(
          "Exact installed Sidebar, StatCard, and Table component source files.",
        ),
        knownTerms: z
          .array(z.string().trim().min(1).max(60))
          .max(50)
          .optional(),
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS,
    },
    async ({ context, ...input }) => {
      const start = Date.now();
      let capture: DashboardBrowserCapture | undefined;
      let captureError: string | undefined;
      if (!captureDashboardBrowser) {
        captureError = "Better Design's trusted browser capture is unavailable.";
      } else {
        try {
          capture = await captureDashboardBrowser({
            previewUrl: input.previewUrl,
          });
        } catch (error) {
          captureError = error instanceof Error
            ? error.message
            : "Better Design's trusted browser capture failed.";
        }
      }
      const decision = finalizeDashboardUiReview(input, capture, captureError);
      const text = formatDecision(decision);
      track(
        "finalize-dashboard-review",
        {
          screen: input.screen,
          context,
          status: decision.status,
          findingCount: decision.findings.length,
          receiptId: decision.receipt?.receiptId,
        },
        {
          durationMs: Date.now() - start,
          isError: decision.status === "incomplete",
          outputPreview: text.slice(0, 1000),
          review: {
            page: input.screen,
            // A preview URL's query can carry a deployment bypass token.
            input: toRedactedJson({ ...input, previewUrl: input.previewUrl.split(/[?#]/)[0] }),
            output: text,
            findings: decision.findings.map((f) => ({ key: f.id, severity: f.severity, problem: f.message })),
          },
        },
      );
      const structuredContent = {
        status: decision.status,
        findings: decision.findings,
        interpretation: decision.interpretation,
        receipt: decision.receipt,
      } satisfies FinalUiReviewDecision;
      return {
        content: [{ type: "text" as const, text }],
        structuredContent,
        isError: decision.status === "incomplete",
      };
    },
  );
}
