export {
  lintFile,
  lintFiles,
  hasActiveFontLoaderEvidence,
  fontEvidenceFor,
  STATIC_TOKEN_RULE_IDS,
  summarise,
  type LintOptions,
} from "./engine";
export {
  DEFAULT_REVIEW_CONFIG,
  DEFAULT_VISUAL_MODEL_SCREENSHOTS,
  mergeReviewConfig,
  parseReviewConfigOverride,
  visualReviewConfigSchema,
} from "./config";
export type { ReviewConfigOverride } from "./config";
export { formatFindingsReport, sortFindings } from "./report";
export { pxIsHouseStyle } from "./length-rules";
export { swiftFindings } from "./swift-rules";
export { ICON_NUDGE_RULE_ID, OFF_CENTRE_SHARE, iconNudgeFindings, iconNudgeSites, isNudgeClass, isNudgeStyleNumber, isNudgeStyleText } from "./icon-rules";
export { svgGlyphBounds, svgGlyphOffset, svgPathBounds, svgViewBox, type GlyphOffset, type SvgBounds, type SvgViewBox } from "./svg-bounds";
export { staticClassCandidates, type ClassCandidates } from "./class-candidates";
export {
  readComponentVariants,
  readThemeColorTokens,
  styleCategory,
  type ProjectInputs,
} from "./project-context";
export { matchesPathGlob } from "./path-glob";
export type {
  Finding,
  Severity,
  LintConfig,
  LintInput,
  ElementRule,
  ElementExemption,
  FindingKind,
  FindingPrinciple,
  VisualReviewConfig,
  ComponentGalleryConfig,
  ReviewFlow,
  ReviewFlowStep,
  ReviewViewport,
} from "./types";
