import { DESIGN_TRADEOFF_RULE, REDESIGN_SCOPE_CONTRACT } from "../redesign-contract";

/**
 * The categories `get-review-rules` and `GET /v1/review-rules` accept. "all"
 * returns every rule. Each other category matches the review rule docs whose id
 * contains it, and the seed builds those ids from the `## ` headings of
 * docs/review-rules.md, so "ai-features" selects the "## AI features" section.
 * "coverage-gaps" selects docs/coverage-gaps.md, the surfaces with no rule yet.
 */
export const REVIEW_RULE_CATEGORIES = [
  "accessibility",
  "visual-design",
  "animation",
  "content",
  "comprehension",
  "ai-features",
  "coverage-gaps",
  "all",
] as const;

/** The `get-review-rules` tool description: the rule summary an agent reads before it calls the tool. */
export const REVIEW_RULES_DESCRIPTION = `Retrieves accessibility (WCAG 2.1), visual design, animation, content, comprehension, and AI feature review rules for analyzing code.

You MUST call this after writing UI code to self-review your output, then fix every critical and serious issue BEFORE presenting the result.

It returns rules to check against. It approves nothing: a clean self-review against these rules is not visual approval, because the rules are read against source, not against what renders.

${REDESIGN_SCOPE_CONTRACT}

${DESIGN_TRADEOFF_RULE}

**Accessibility (WCAG 2.1):**
- Critical: Images without alt text, icon buttons without aria-labels, form inputs without labels
- Serious: Focus outline removed, missing keyboard handlers, color-only information

**Visual Design:**
- Layout & Spacing: Inconsistent spacing, overflow issues, z-index conflicts
- Typography: Mixed fonts, line-height issues, missing fallbacks
- Color & Contrast: Contrast below 4.5:1, missing hover/focus states
- Component fidelity: Feature code that bypasses installed Sidebar and Table compositions
- Dashboard hierarchy: Verify title → metrics → records → interpretation, preserve supplied overview copy, distinguish action and status colors, reject invented trends, and reject a stepper on a dashboard overview
- Serious: Hover outside \`@media (hover: hover) and (pointer: fine)\`, hover that moves controls, or hover that overrides selected/pressed styling
- Serious: Dormant creation forms exposed on browse/manage pages instead of opening from a labeled CTA

**Animation & Motion:**
- Critical: Reduced-motion paths that hide content or prevent completion
- Serious: Motion that delays frequent tasks, breaks under repeated input, uses a disconnected origin, or misses frames under representative load
- Moderate: Choreography that competes with hierarchy or drifts from the product's motion tokens

**Content (generated-UI tells):**
- Apply these to every visible element, including the text inside a mock product screen, dashboard, table or chat panel shown on a sales page, deck or social image. Filler hides there most often
- Walls of text, overwritten copy, filler adjectives, emoji used as icons
- Ceremonial copy with no user job; run the deletion test before shipping visible text
- Serious: A second visible page title or introduction that only repeats the page, tabs, or adjacent controls
- Awkward headline or subtitle wraps that split complete phrases or leave orphaned words
- Microcopy details: pluralization, improvised unit glyphs, empty states without a next action
- Template layouts: gradient hero + eyebrow pill, left-border callout boxes
- Serious: Hero copy laid over the product photo behind a wash; put it beside the product (rule/copy-off-the-product)
- Reward feedback: confirm the outcome, surface proportional user value, and avoid decorative over-reward
- Prose tells in shipped paragraphs (hero, about, pricing, changelog, docs): banned words (delve, leverage, robust, cutting-edge, elevate), binary contrasts ("It's not X, it's Y"), throat-clearing and faux-insight openers, colon reveals, puffery and unsourced "experts agree", fake-profound kickers and recap endings, synonym cycling, emoji headings and mid-sentence bold

**Comprehension (would someone outside the team understand it?):**
- Mom test: insider vocabulary, unexplained acronyms, sentences too long to follow
- 15 second test: word count, stacked concepts, competing actions
- Screenshot test: missing title, actions that hide their outcome, icon-only controls
- Run these against the real copy with \`check-comprehension\` once the screen exists

**AI features (any surface that shows model output or sends user data to a model):**
- Critical: Output saved or sent without the user accepting it, silent failures, no manual path when AI is unavailable, user data read before consent, invented citations or unearned certainty
- Serious: AI output with no visible marker, long runs with no sign or a Stop that deletes partial output, refusals that name no topic and offer no alternative, feedback controls with no destination

Every rule carries an ID (\`rule/…\`), a source and an exceptions line. Cite the ID in each finding. The \`coverage-gaps\` category lists the surfaces that have no rule yet.

Use maxTokens to limit rule content (recommended: 5000–10000). Required workflow guidance is always returned in full.`;
