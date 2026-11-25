# Eidova MCP contributor instructions

This repository owns the TypeScript HTTP/stdio MCP service and bundled registry.
Use Node 24 and the committed npm lockfile. Read the relevant source and Git diff
before editing; preserve existing work, current tool schemas,
license bytes, private-state isolation and fetch/SSRF limits.
Use current Eidova interfaces only; do not add legacy aliases or migrations.
Keep product copy, examples and generated guidance branded as Eidova. Preserve
required license notices and accurate source attribution separately.

Run `npm run check`, focused tests (`node --import tsx --test tests/<file>.test.ts`),
and `npm run build` for service changes. Changes to runtime adapters also need
`npm run build:upstream`; stdio changes need `npm run smoke:stdio`.
Read `docs/DEPLOYMENT.md` before deployment. Do not publish npm/Registry packages
unless explicitly requested. Product scope is MCP and website only; do not reintroduce a team editor or native bridge.

Consumer project guidance and client configs are documented in [Agent setup](docs/AGENT-SETUP.md).

## MCP website defaults

Use the user-selected reference foundation in [website DESIGN.md](https://github.com/pranav256/eidova-website/blob/main/DESIGN.md): warm paper surfaces, rust accents, locally loaded Newsreader headings, Inter controls and JetBrains Mono code. Use the actual Minimal Light React/Radix controls with the reference's tokens and .5/.75rem geometry. Follow system appearance by default while preserving explicit URL and saved choices. Apply this to future MCP website builds unless another brand is supplied. Keep unrelated products and original specimens faithful to their own systems.

Start UI builds with find-design-system and retrieve the actual selected kit. Load get-ui-principle before styling and get-ux-principle before behavior. Preserve routes, drafts, error recovery, licenses and existing working changes. Before delivery run get-review-rules, review-ui-code, check-comprehension and inspect-spacing on rendered DOM, fixing critical and serious findings. Follow the dashboard review workflow for dashboards.

Local MCP team rules contain this preference; never publish private workspace state or capability keys.
