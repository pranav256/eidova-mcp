// Design-system guardrails shipped into a consumer project after a Better
// Design scaffold. The MCP tools (`get-design-system-kit`, `create-design-system`)
// surface GUARDRAILS_SETUP_MD as text so the calling agent wires these up, and
// the per-project shadcn registry route writes the two namespaced files
// deterministically via `registry:file` + target.
//
// Why this exists: the MCP installs ~90 components into `components/ui/` but
// nothing previously stopped the agent from hand-rolling its own `<button>`,
// `<table>`, or faking a ⌘K palette / dropdown / notification with bare divs
// (the styling still matched because both read the same globals.css tokens, but
// the interactive fakes ended up dead). These guardrails make "compose the
// installed components, never rebuild a primitive" durable across context
// compaction and tool ecosystems (Claude Code, Cursor, Codex).
//
// SINGLE SOURCE OF TRUTH: edit the content here only. Both the registry route
// and the MCP install text read these constants — do not duplicate the prose.
import { PRESENTATION_RUNTIME_RULE } from "./presentation-runtime";
import { DESIGN_TRADEOFF_RULE } from "./redesign-contract";

// Written to `.better-design/rules.md`. A namespaced file the user does not own,
// so it is always safe to (over)write. Referenced from CLAUDE.md / AGENTS.md.
export const DS_RULES_MD = `# Design system rules

The files in \`components/ui/*\` ARE the design system installed by Better Design.

Before interface work, read the repository's root \`DESIGN.md\` when it exists.
Use it to locate the approved tokens, components, design files, source
precedence, accessibility floor, and review contract. If it conflicts with the
rendered product or repository instructions, report the conflict instead of
silently inventing a new design decision.

**Compose them. Never hand-roll a primitive the DS already ships.** Rebuilding
\`Button\` as a raw \`<button>\`, an application shell as a raw \`<aside>\`, a
table as a raw \`<table>\` or repeated rows of divs, or faking a ⌘K palette,
account menu, or notification bell with bare \`<div>\`s is a bug even when it
looks right: it only matches because both read the same \`app/globals.css\`
tokens, and the faked interactive pieces end up dead (the search opens nothing,
the menu has no items, the bell does nothing).

Map each UI need to the installed component BEFORE writing markup:

- buttons, nav links (use \`asChild\`) -> \`button\`
- application shell and primary navigation -> \`sidebar\`
- panels, cards, KPI tiles, section containers -> \`card\`
- tabular records and comparable rows -> \`table\` (not a raw \`<table>\` or div list)
- status pills, tags, labels -> \`badge\`
- ⌘K / search palette -> \`command\` (\`CommandDialog\`)
- account / overflow / context menus -> \`dropdown-menu\`
- notification bell, flyouts -> \`popover\` + \`notification\`
- transient confirmations -> \`use-toast\` + \`toaster\`
- tooltips -> \`tooltip\` (wrap the app in \`TooltipProvider\`)
- modals -> \`dialog\`; tab switchers -> \`tabs\`; avatars -> \`avatar\`; dividers -> \`separator\`
- form fields -> \`input\` / \`textarea\` / \`select\` / \`checkbox\` / \`switch\` / \`radio-group\`
- onboarding, setup, checkout, surveys, and product tours -> \`ix-onboarding-stepper\`
  (\`OnboardingStepper\`). Never hand-build progress dots, rails, or paths for these flows.

Read a component's source from \`components/ui/\` to learn its props/exports. Use only
the design tokens in \`app/globals.css\`; never invent colors, spacing, or radii.
Compose the installed Sidebar exports directly, including its header, content,
items, groups, and footer when provided. Do not restyle a raw aside to resemble it
or replace its surface, active-state, radius, and type treatment in feature code.

**Font integrity is pass-fail.** Read the installed \`--font-*\` tokens before
editing \`app/globals.css\`. Preserve the matching \`@font-face\`, \`@import\`, or
framework font loader, and never leave a \`var(--font-*)\` reference undefined.
When the app renders, await \`document.fonts.ready\`, inspect the computed font-family
on the page and a heading, and confirm the intended family loaded. A fallback is
recovery, not proof that the assigned design-system font is working.

**Copy and layout restraint.** The words inside the UI are part of the design system
too. Write the fewest words that carry the meaning: headlines about 6 words, one short
supporting line per section, no filler adjectives (seamless, effortless, powerful), no
exclamation marks, never emoji as icons or status indicators (use the DS's icon library
or \`badge\` variants). Every visible text fragment needs one job: context, outcome,
next action, real doubt, or legal/security. Do not add template footer, provenance,
helper, or slogan copy. If deletion does not hurt meaning, action clarity, safety,
compliance, or tone, keep it deleted. Never place an eyebrow, kicker,
category, or status label immediately above an \`h1\`, \`h2\`, or \`h3\`; start with the
title and put essential context in the supporting line or after the title. Skip the generated-template shapes unless explicitly requested:
gradient hero with an uppercase eyebrow pill, centered three-card feature grid,
left-border callout boxes, walls of text. A colored bar down the left edge is the same
tell on an active nav item as in a callout, however it is painted: \`border-l\`, an inset
shadow offset only horizontally, or a pseudo-element pinned to the left edge. Carry a
selected state with the design system's own fill, weight, or text color instead. Never
join facts with a middot: \`Ari from Mono · Waiting 18 min\` gives two facts one weight,
so lead with the fact a person acts on and let the rest recede by size or color. A
nested corner subtracts its padding, so an inner radius is the outer radius minus the
gap, never the next token down the scale.

**Count the copy before you present.** This is a check to run, not advice to weigh.
On the first view: at most 60 visible words, at most 25 separate text fragments, one
headline of about 6 words, and at most one supporting line of about 15 words per
section. Count them. If you are over, delete copy; do not shrink the type to fit and
do not move the words into a tooltip. A section that needs three sentences to explain
itself is a section whose layout is wrong.

**A landing page needs positioning, not adjectives.** On any page whose job is to
sell or explain a product, settle four answers before writing the headline: who it is
for, what they use today, the one difference that would make them switch, and why now.
Ask the user for those answers. Never invent a customer, a testimonial, a user count,
or an award. Then test the headline by pasting a competitor's name into it: if it still
reads true, it says nothing, and the fix is the positioning, not the wording. Load
\`get-ux-principle({ topic: "positioning" })\` for the full principle.

**Labels are sentence case, never letter-spaced capitals.** Do not style section
labels, stat captions, table column headers, card headers, or badges as tiny spaced
capitals (\`text-xs uppercase tracking-widest\`, with or without \`font-mono\`). It is
the single fastest generated-UI tell, and it costs legibility at exactly the size
where legibility is scarcest. Use sentence case at the DS's own label size and muted
color. Keep \`font-mono\` for code, IDs, keyboard shortcuts, and figures that must
align in a column.

**Hierarchy is pass/fail.** Give the first view one P0 task and at most one P1
summary; move P2 history, standings, detailed metadata, and empty-state chrome
below it or behind a tab/disclosure. Unless the screen is a dense tool (traces, logs,
tables and dashboards) or the user asked for density, simplify any first view with more than three major regions, five
immediately visible actions, or 25 visible text fragments. Do not shrink everything
to make it fit: the primary display must be at least 1.5× base UI text, section
anchors at least 1.2×, and labels are a last resort. Reserve bold for the primary
display, section anchors, and active values.

Generated-registry dependency changes are part of the required component install.
If a separate constraint appears to forbid package-version changes, do not silently
revert registry-owned dependencies or replace a required component; report the conflict and stop.

**Dashboard quality is pass-fail.** The first group contains the domain page title,
one supporting line, and one primary action. Preserve the scan order metrics → records → interpretation.
Metric values dominate their labels. Reserve the action
and selected-state color for actions and selection; use semantic status colors plus
text or an icon for positive, warning, destructive, and neutral meaning.
Preserve an explicit overview title and supporting line verbatim when supplied; an active nav label does not replace the page h1.
Supplied interface copy takes precedence over generated-copy length targets; report a conflict instead of silently rewriting the supplied words.
When interpretation prose is not supplied, derive a factual interpretation only from supplied counts and current values; do not infer movement, causation, or status.
Use an installed Badge or StatCard semantic variant when one exists; do not use \`text-primary\` for every rate.
Never invent a trend or status claim. Preserve useful count, trend, status, and explanatory context instead of flattening records
into identical rows. Progress belongs to the dependent task screens: the overview is not a workflow step,
so never show a stepper on the overview or dashboard. When a fixture lists its overview as the first item in a steps array, exclude that overview when counting workflow steps.
With three or fewer dependent task screens, use no stepper or progress rail.

**Composition and proximity are pass/fail.** Keep one visible identity block per
level; do not repeat the product logo/title directly above a second identity block.
Short tasks size to content and fail when more than one-third of a major surface is
unused after the primary action. Keep an input, its derived value, and submit action
together; align the input and button to the same height and bottom baseline. A numeric
stake field should fit its value rather than stretch across the canvas. Decorative
domain geometry stays inside the event header and never crosses controls. Paired flags,
crests, or logos must be accurate and symmetric; otherwise omit all peer assets.

${PRESENTATION_RUNTIME_RULE}

${DESIGN_TRADEOFF_RULE}

After writing UI, self-review with
\`get-review-rules\` and fix every critical/serious issue before presenting.
`;

// Written to `.better-design/eslint-design-system.mjs`. A flat-config fragment the
// project's eslint.config.mjs spreads in. `warn` (not `error`) so it surfaces in
// the agent's lint run without hard-failing legitimate one-off raw elements;
// bump to "error" to gate CI.
//
// The uppercase-label selector matches static className string literals only, so
// `cn("uppercase", x)` and template literals slip through. That is deliberate: a
// narrow selector that never cries wolf is worth more here than full coverage,
// because this config lands in the user's own lint run. `DS_RULES_MD` and
// `get-review-rules` cover the cases the selector cannot see.
export const DS_ESLINT_CONFIG = `// Better Design — design-system guardrail (flat ESLint config fragment).
// Flags raw HTML primitives in feature code when the installed DS ships an
// equivalent in components/ui/*, plus the uppercase micro-label tell.
// Wire it into eslint.config.mjs:
//
//   import dsGuardrail from "./.better-design/eslint-design-system.mjs"; // better-design-guardrail
//   export default [ ...dsGuardrail, /* ...your config */ ];
//
// Scoped to app/** and components/** but NOT components/ui/** (the DS itself).
// Bump "warn" -> "error" to fail lint/CI on violations.
const banned = [
  { selector: "JSXOpeningElement[name.name='aside']:has(JSXAttribute[name.name='aria-label'][value.value='Primary navigation'])", message: "Use <Sidebar> from @/components/ui/sidebar instead of a raw primary-navigation <aside>." },
  { selector: "JSXOpeningElement[name.name='aside']:has(JSXAttribute[name.name='aria-label'][value.value='Main navigation'])", message: "Use <Sidebar> from @/components/ui/sidebar instead of a raw main-navigation <aside>." },
  { selector: "JSXOpeningElement[name.name='button']", message: "Use <Button> from @/components/ui/button instead of a raw <button>." },
  { selector: "JSXOpeningElement[name.name='table']", message: "Use <Table> from @/components/ui/table instead of a raw <table>." },
  { selector: "JSXOpeningElement[name.name='input']", message: "Use <Input> from @/components/ui/input instead of a raw <input>." },
  { selector: "JSXOpeningElement[name.name='select']", message: "Use <Select> from @/components/ui/select instead of a raw <select>." },
  { selector: "JSXOpeningElement[name.name='textarea']", message: "Use <Textarea> from @/components/ui/textarea instead of a raw <textarea>." },
  { selector: "JSXAttribute[name.name='className'] Literal[value=/(^|[ ])uppercase([ ]|$)/][value=/(^|[ ])tracking-[^ ]+([ ]|$)/]", message: "Letter-spaced capitals are a generated-UI tell. Use sentence case at the design system's own label size; keep font-mono for code, IDs, and aligned figures." },
];

export default [
  {
    files: ["app/**/*.{tsx,jsx}", "components/**/*.{tsx,jsx}"],
    // Exclude the DS itself and co-located tests, which legitimately render raw
    // <button>/<input> for queries/assertions and would otherwise emit noise.
    ignores: ["components/ui/**", "**/*.{test,spec}.{tsx,jsx}", "**/__tests__/**"],
    rules: { "no-restricted-syntax": ["warn", ...banned] },
  },
];
`;

// Per-project icon-library directive, appended to `.better-design/rules.md` so it
// is durable on disk. The MCP server is frequently NOT loaded when the agent runs
// `npx shadcn add` (it works straight from the installed files), so guidance that
// lives only in MCP `meta` never reaches the agent — it then defaults to
// lucide-react and clashes with the generated DS. Shipping it in the rules file the
// agent already reads fixes that. [BD-118]
export function iconLibraryRule(
  { name, prefix, variant }: { name: string; prefix: string; variant: string },
): string {
  return `

## Icons — use ${name}

This project's design system is paired with **${name}** icons (Iconify prefix \`${prefix}\`, variant \`${variant}\`). Use this library for EVERY icon in the app. Do NOT use \`lucide-react\` or mix icon sets — that breaks visual consistency with the installed components.

Add icons as SSR-clean inline React components (no runtime CDN fetch, no first-paint flash): fetch each from \`https://api.iconify.design/${prefix}/<name>.svg\` and inline it as a component, or use the Better Design \`install-icons\` MCP tool when available. Avoid the runtime \`<Icon icon="${prefix}:name" />\` pattern.
`;
}

// shadcn `registry:file` entries that write the two namespaced files. Returned
// from the per-project registry route so a single `shadcn add` drops them
// alongside components/ui/*. Namespaced paths the user does not own -> safe.
// `iconRule` (from `iconLibraryRule`) is appended to the rules doc so the chosen
// icon library is recorded on disk per project.
export function guardrailRegistryFiles(
  opts?: { iconRule?: string },
): Array<{
  path: string;
  content: string;
  type: "registry:file";
  target: string;
}> {
  return [
    {
      path: ".better-design/rules.md",
      content: opts?.iconRule ? DS_RULES_MD + opts.iconRule : DS_RULES_MD,
      type: "registry:file",
      target: ".better-design/rules.md",
    },
    {
      path: ".better-design/eslint-design-system.mjs",
      content: DS_ESLINT_CONFIG,
      type: "registry:file",
      target: ".better-design/eslint-design-system.mjs",
    },
  ];
}

// MCP-text setup step appended to both scaffold flows. Catalog and generated
// project all.json payloads write the namespaced files; the text remains so the
// agent can wire them into user-owned config files without overwriting those
// files. All writes are idempotent.
export const GUARDRAILS_SETUP_MD = `## Set up the design-system guardrails (one-time, idempotent)

These keep feature code composing the installed components instead of re-building
primitives. Apply all four; never overwrite a user-owned file, only create-if-missing
or append a guarded block.

**1. Rules doc** — write \`.better-design/rules.md\` (skip if the install already wrote it):

\`\`\`md
${DS_RULES_MD}\`\`\`

**2. Reference it from the agent config files** (create if missing, append if absent, never clobber):
- \`CLAUDE.md\`: ensure it contains the line \`@.better-design/rules.md\`.
- \`AGENTS.md\`: AGENTS.md has no import mechanic, so inline the rule in a marker block. Append if \`better-design:start\` is absent; replace between markers if present:
  \`\`\`
  <!-- better-design:start -->
  Read DESIGN.md when present. Compose installed components/ui/* primitives: use Sidebar for the app shell, Table for records instead of repeated div rows, and the installed stepper for dependent flows. Never hand-roll a <button>/<input>/<dialog> or fake a ⌘K palette / menu / notification bell. Preserve the installed font loader and resolve every --font-* token. Use only app/globals.css design tokens. See .better-design/rules.md.
  <!-- better-design:end -->
  \`\`\`

**3. ESLint guardrail** — write \`.better-design/eslint-design-system.mjs\` (skip if the install already wrote it):

\`\`\`js
${DS_ESLINT_CONFIG}\`\`\`

Then wire it into the project's \`eslint.config.mjs\` (flat config), guarded so re-runs don't duplicate — skip if the marker \`// better-design-guardrail\` is already present:

\`\`\`js
import dsGuardrail from "./.better-design/eslint-design-system.mjs"; // better-design-guardrail
// spread ...dsGuardrail into the exported config array
\`\`\`

After wiring, \`npm run lint\` flags raw primitives in feature code (warnings; bump to "error" to gate CI).

**4. Review hook.** The check that keeps the system honest after this session. Run it once; it is idempotent:

\`\`\`bash
npx -y better-design review --install-hook
\`\`\`

It adds a post-edit hook for Claude Code and for each agent whose folder the project has (Codex, GitHub Copilot, Cursor, Devin; pick with \`--host\`), so every edit of a \`.tsx\`, \`.jsx\` or \`.css\` file is checked against the installed components, the token rules, the generated-UI tells and the behaviour traps, and findings feed back to the agent. Then write \`.better-design/review.config.json\` (skip if present) so the review names the system:

\`\`\`json
{ "designSystem": "<the design system id you passed to this tool>" }
\`\`\`

CI runs the same check with \`npx better-design review --base main\`.
`;
