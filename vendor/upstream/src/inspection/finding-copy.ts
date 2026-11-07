/** The problem and suggested change shown before technical spacing details. */
export interface SpacingFindingCopy {
  title: string;
  fix: string;
  /** Index of the single correction target; omit when all listed elements need changes. */
  primaryElementIndex?: number;
  /** Keep the measured property or group context that is absent from evidence labels. */
  needsMeasurementContext?: boolean;
}

/** Copy indexed by inspection rule, with no entry for unknown rules. */
interface SpacingFindingCopyCatalog {
  [ruleId: string]: SpacingFindingCopy | undefined;
}

/** Plain problem and action copy shared by the text and visual spacing reports. */
export const SPACING_FINDING_COPY: SpacingFindingCopyCatalog = {
  "spacing/asymmetric-horizontal-inset": {
    title: "Uneven side padding",
    fix: "Match the sides unless the difference is intentional.",
  },
  "spacing/asymmetric-vertical-inset": {
    title: "Uneven top and bottom padding",
    fix: "Match the top and bottom unless the difference is intentional.",
  },
  "spacing/off-scale-value": {
    title: "Spacing does not match the project scale",
    fix: "Use the nearest spacing value from the project’s spacing scale.",
    needsMeasurementContext: true,
  },
  "spacing/sibling-gap-drift": {
    title: "Gaps between items are uneven",
    fix: "Use one gap between these items and remove any extra margins.",
    primaryElementIndex: 0,
  },
  "spacing/repeated-component-gap-drift": {
    title: "Repeated items use different gaps",
    fix: "Use the same gap in each repeated item.",
    needsMeasurementContext: true,
  },
  "spacing/repeated-component-size-drift": {
    title: "Repeated items use different sizes",
    fix: "Give matching items the same size.",
    needsMeasurementContext: true,
  },
  "spacing/alignment-drift": {
    title: "Items do not line up",
    fix: "Align these items to the same edge.",
    needsMeasurementContext: true,
  },
  "spacing/viewport-overflow": {
    title: "Content extends past the screen edge",
    fix: "Make this content fit within the screen at every width.",
  },
  "spacing/clipped-content": {
    title: "Some content is cut off",
    fix: "Let the content wrap, give it more room, or make the area scroll.",
  },
  "spacing/touch-target": {
    title: "The tap area is too small",
    fix: "Make the tappable area at least 44×44px.",
  },
  "spacing/stretched-field": {
    title: "A one-line field is stretched tall",
    fix: "Give the field one control height instead of letting the layout stretch it.",
  },
  "spacing/shell-gutter": {
    title: "An unwanted gap sits beside the sidebar",
    fix: "Extend the sidebar to the screen edge and keep only the page content centered.",
    primaryElementIndex: 0,
  },
  "spacing/non-concentric-radius": {
    title: "Nested corners do not follow the same curve",
    fix: "Adjust the inner corners so the space around them stays even.",
    primaryElementIndex: 1,
  },
};
