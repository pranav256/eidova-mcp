import { z } from "zod";
import type { ElementRule, LintConfig } from "./types";
import type { JsonValue } from "../guards";
import { MAX_GLOB_LENGTH } from "./path-glob";

/** Default paid-model evidence budget for one pull-request review. */
export const DEFAULT_VISUAL_MODEL_SCREENSHOTS = 24;

// The default review config assumes the shadcn-style layout every Better
// Design install produces: components in components/ui/*, imported via
// @/components/ui/*. A project overrides it with
// .better-design/review.config.json, which replaces whole rule groups rather
// than merging into them (see mergeReviewConfig).
/** The values `DEFAULT_ELEMENTS` maps its keys onto. */
interface DefaultElementsTable {
  [key: string]: ElementRule;
}

const DEFAULT_ELEMENTS: DefaultElementsTable = {
  "app-shell": { use: "Sidebar", from: "@/components/ui/sidebar" },
  button: { use: "Button", from: "@/components/ui/button" },
  input: { use: "Input", from: "@/components/ui/input" },
  "input[type=checkbox]": { use: "Checkbox", from: "@/components/ui/checkbox" },
  "input[type=radio]": {
    use: "RadioGroup",
    from: "@/components/ui/radio-group",
  },
  select: { use: "Select", from: "@/components/ui/select" },
  textarea: { use: "Textarea", from: "@/components/ui/textarea" },
  table: { use: "Table", from: "@/components/ui/table" },
};

/**
 * The config every review starts from. It assumes the shadcn-style layout a
 * Better Design install produces, so a project that keeps its components
 * elsewhere overrides the element rules rather than editing this.
 */
export const DEFAULT_REVIEW_CONFIG: LintConfig = {
  visual: {
    enabled: true,
    model: { enabled: true, maxScreenshots: DEFAULT_VISUAL_MODEL_SCREENSHOTS },
    routes: [],
    viewports: ["desktop", "mobile", "reflow"],
    componentGallery: { enabled: true, maxComponents: 60 },
  },
  rules: {
    elements: DEFAULT_ELEMENTS,
    tokens: {},
    wcag: { enabled: true, severity: "all" },
    slop: { enabled: true },
    copy: { enabled: true },
    semanticTokens: { enabled: true },
    behaviour: { enabled: true },
    icons: { enabled: true },
    classes: {},
  },
};

/**
 * The shape a project writes in `.better-design/review.config.json`. Every
 * field is optional: what it omits keeps the default.
 */
export type ReviewConfigOverride = Partial<Omit<LintConfig, "rules">> & {
  rules?: Partial<LintConfig["rules"]>;
};

const reviewFlowStepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("click"), selector: z.string() }),
  z.object({ action: z.literal("type"), selector: z.string(), value: z.string() }),
  z.object({ action: z.literal("press"), key: z.string() }),
  z.object({ action: z.literal("wait"), milliseconds: z.number().finite().nonnegative() }),
]);

/** Runtime contract for the rendered-review section shared by config and API boundaries. */
export const visualReviewConfigSchema = z.object({
  enabled: z.boolean().optional(),
  model: z.object({
    enabled: z.boolean().optional(),
    maxScreenshots: z.number().int().nonnegative().optional(),
  }).optional(),
  routes: z.array(z.string()).optional(),
  viewports: z.array(z.enum(["desktop", "mobile", "reflow"])).optional(),
  flows: z.array(z.object({
    name: z.string(),
    persona: z.string(),
    path: z.string().optional(),
    steps: z.array(reviewFlowStepSchema),
  })).optional(),
  componentGallery: z.object({
    enabled: z.boolean().optional(),
    componentSelector: z.string().optional(),
    canvasSelector: z.string().optional(),
    labelSelector: z.string().optional(),
    maxComponents: z.number().int().nonnegative().optional(),
  }).optional(),
});

const reviewConfigOverrideSchema = z.object({
  designSystem: z.string().optional(),
  visual: visualReviewConfigSchema.optional(),
  rules: z.object({
    elements: z.record(z.string(), z.object({ use: z.string(), from: z.string() })).optional(),
    elementExemptions: z.array(z.object({
      path: z.string().min(1).max(MAX_GLOB_LENGTH),
      reason: z.string().trim().min(1).max(300),
    })).max(20).optional(),
    tokens: z.record(z.string(), z.string()).optional(),
    wcag: z.object({
      enabled: z.boolean().optional(),
      severity: z.enum(["all", "critical+serious"]).optional(),
    }).optional(),
    slop: z.object({ enabled: z.boolean().optional() }).optional(),
    copy: z.object({ enabled: z.boolean().optional() }).optional(),
    semanticTokens: z.object({ enabled: z.boolean().optional() }).optional(),
    behaviour: z.object({ enabled: z.boolean().optional() }).optional(),
    classes: z.object({
      restyle: z.boolean().optional(),
      rawColors: z.boolean().optional(),
      arbitraryValues: z.boolean().optional(),
      inlineStyles: z.boolean().optional(),
      unknownClasses: z.boolean().optional(),
      dynamicClasses: z.boolean().optional(),
    }).optional(),
  }).optional(),
});

/** Validates one JSON value read from `.better-design/review.config.json`. */
export function parseReviewConfigOverride(value: JsonValue): ReviewConfigOverride | null {
  const parsed = reviewConfigOverrideSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Layers a project's override onto the defaults. The merge is per rule group,
 * not deep: an override group replaces the default group wholesale, so setting
 * `elements: {}` opts out of element rules entirely.
 */
export function mergeReviewConfig(override?: ReviewConfigOverride): LintConfig {
  if (!override) return DEFAULT_REVIEW_CONFIG;
  return {
    designSystem: override.designSystem ?? DEFAULT_REVIEW_CONFIG.designSystem,
    visual: {
      ...DEFAULT_REVIEW_CONFIG.visual,
      ...override.visual,
      model: {
        ...DEFAULT_REVIEW_CONFIG.visual?.model,
        ...override.visual?.model,
      },
      componentGallery: {
        ...DEFAULT_REVIEW_CONFIG.visual?.componentGallery,
        ...override.visual?.componentGallery,
      },
    },
    rules: {
      ...DEFAULT_REVIEW_CONFIG.rules,
      ...override.rules,
    },
  };
}
