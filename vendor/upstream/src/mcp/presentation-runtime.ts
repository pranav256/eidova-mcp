/**
 * Tells a coding host to build a deck in Open Slide rather than a one-off
 * static file. It lives in its own module because the rule prefixes
 * `BUILD_TARGET_RULE` and is served on its own to presentation tools, and a
 * shared constant keeps those two copies from drifting.
 */
export const PRESENTATION_RUNTIME_RULE = `## Presentation builds use Open Slide

For any pitch deck, presentation, or slide system in a coding host with filesystem and terminal access, use Open Slide (\`@open-slide/core\`) with React slide components as the primary editable source. Do not substitute PowerPoint, Google Slides, Reveal, or a standalone static artifact unless the user explicitly requests a different primary format. Unless the user explicitly requests that format as primary, PPTX and PDF are secondary exports only. If Open Slide is unavailable, add and configure it before authoring the deck.`;
