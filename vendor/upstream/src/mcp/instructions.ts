// Kept under 2KB on purpose: Claude Code truncates MCP server instructions at
// 2048 bytes, so the trigger sentence and core tool chain must come first.
// Detailed per-tool guidance lives in each tool's own description (loaded on
// demand), not here.
import { PRESENTATION_RUNTIME_RULE } from "./presentation-runtime";
import { DESIGN_TRADEOFF_REMINDER } from "./redesign-contract";

export const INSTRUCTIONS = `# Better Design

Use for any frontend, UI, styling, presentation, sales, React Native, Expo, or Three.js work.

SwiftUI: get-swiftui-guide.
RN/Expo: get-react-native-guide; Three.js/R3F: get-three-js-guide.
Shopify: get-shopify-guide; get-design-system-kit target "shopify" for theme files.
Sales: get-sales-principle. Widgets: get-widget-guide.

${PRESENTATION_RUNTIME_RULE}

## Build or modify UI, in order
${DESIGN_TRADEOFF_REMINDER}
Classify: repair, polish or redesign. Redesign needs layout/component changes, before/after at matching widths. Follow the kit's scope contract.
1. Design system: keep the selected DS and its icons. Else find-design-system, show ~4 choices (unattended: top one); custom brand: create-design-system, poll status. get-design-system-kit: "react" with files/terminal, "html" in inline canvases; real components, never runtime @iconify/react. Live site: extract-from-url tokens (app screen: accent, font only).
2. get-ui-principle before styling; get-ux-principle before behavior.
3. Build: semantic HTML, keyboard access, WCAG AA.
4. Review every panel: get-review-rules (copy/AI-tell rules), review-ui-code, check-comprehension, inspect-spacing; fix critical/serious; dashboards need a VALID finalize-dashboard-review receipt. No rendered evidence means unverified.
Never present UI that skipped step 2 or 4.
`.trim();

export interface McpInstructionOptions {
  enableReactNativeGuide?: boolean;
  enableThreeJsGuide?: boolean;
  enableShopifyKit?: boolean;
  /** Only the stdio server registers review-ui-code, through registerReviewTool. */
  enableReviewUiCode?: boolean;
}

export function getMcpInstructions(options: McpInstructionOptions = {}): string {
  const {
    enableReactNativeGuide = true,
    enableThreeJsGuide = true,
    enableShopifyKit = true,
    enableReviewUiCode = false,
  } = options;
  let instructions = INSTRUCTIONS;

  if (!enableReactNativeGuide && !enableThreeJsGuide) {
    instructions = instructions
      .replace(", React Native, Expo, or Three.js", "")
      .replace(/\nRN\/Expo:[^\n]+/, "");
  } else if (!enableReactNativeGuide) {
    instructions = instructions
      .replace("React Native, Expo, or Three.js", "or Three.js")
      .replace(", get-react-native-guide", "")
      .replace(
        "RN/Expo: get-react-native-guide; Three.js/R3F: get-three-js-guide.",
        "Three.js/R3F: get-three-js-guide.",
      );
  } else if (!enableThreeJsGuide) {
    instructions = instructions
      .replace(", Expo, or Three.js work", ", or Expo work")
      .replace(", get-three-js-guide", "")
      .replace("; Three.js/R3F: get-three-js-guide", "");
  }

  if (!enableReviewUiCode) {
    instructions = instructions.replace(", review-ui-code", "");
  }

  if (!enableShopifyKit) {
    instructions = instructions.replace(/\nShopify:[^\n]+/, "");
  }

  return instructions.replace(/\n{3,}/g, "\n\n");
}
