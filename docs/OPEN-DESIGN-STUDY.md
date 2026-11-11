# OpenDesign source study

Studied [nexu-io/open-design](https://github.com/nexu-io/open-design) at commit `b4ec310921f49ae512de1f0a1f3a4e7ce3d05f2f` on 2026-11-10. The root project is Apache-2.0; its individual content packages retain separate provenance and licenses. The subsequent requested import includes actual bundled files and retained licenses; see [BUNDLED-RESOURCES.md](BUNDLED-RESOURCES.md).

## Observed in source

- [`design-systems/README.md`](https://github.com/nexu-io/open-design/blob/b4ec310921f49ae512de1f0a1f3a4e7ce3d05f2f/design-systems/README.md) defines portable `manifest.json`, `DESIGN.md`, and `tokens.css` packages. Rich packages add usage, component indexes, and source evidence.
- [`apps/daemon/src/design-systems/index.ts`](https://github.com/nexu-io/open-design/blob/b4ec310921f49ae512de1f0a1f3a4e7ce3d05f2f/apps/daemon/src/design-systems/index.ts#L592) reads those assets. `buildDesignSystemPullIndex` at line 957 lists larger files for on-demand reads instead of including all their content in every prompt.
- [`apps/daemon/src/prompts/system.ts`](https://github.com/nexu-io/open-design/blob/b4ec310921f49ae512de1f0a1f3a4e7ce3d05f2f/apps/daemon/src/prompts/system.ts#L1274) composes usage, binding CSS tokens, and the pull index into agent context.
- [`apps/daemon/src/mcp.ts`](https://github.com/nexu-io/open-design/blob/b4ec310921f49ae512de1f0a1f3a4e7ce3d05f2f/apps/daemon/src/mcp.ts#L1020) lists per-system `DESIGN.md` resources; line 1066 begins their resource read path.
- [`apps/web/src/components/DesignSystemPreviewModal.tsx`](https://github.com/nexu-io/open-design/blob/b4ec310921f49ae512de1f0a1f3a4e7ce3d05f2f/apps/web/src/components/DesignSystemPreviewModal.tsx#L154) brings kit, showcase, and tokens into a shared preview; line 219 exposes the design instructions in its sidebar.

These are observations from a complete source checkout, following REA's source-first route. No binary analysis, REA provider setup, reference application execution, or live browser behavior was needed to establish them.

## Eidova implementation decisions

Eidova keeps its native component registry, eight editorial families, and source/copy/spacing review workflow. It adopts the portable handoff pattern through generated `DESIGN.md`, and exposes OpenDesign?s bundled reference catalog separately through search-resources and MCP resource reads.

The same document is available at `GET /api/design-systems/:id/design.md` and the discoverable MCP resource `design://systems/{id}/design.md`. Kit results carry only these links and a short read-order instruction. Documents derive from the existing catalog and globals registry, include a source CSS SHA-256, distinguish representative previews from exact variant source, and require merging rather than overwriting existing project instructions.

Family suitability and tradeoffs are editorial recommendations grounded in [DESIGN-FAMILIES.md](DESIGN-FAMILIES.md). Search can require actual registry component names and reports matched terms. This is lexical retrieval, not a semantic relevance score or a measured conversion benefit.

## Verification and limits

`tests/design-context.test.ts` checks all catalog documents for deterministic identity, token values, and source hashes; representative/variant distinctions; bounded document size; HTTP/resource parity and discovery; unknown and traversal-like IDs; kit schema compatibility; core tool count; and component-constrained search.

A globals registry scope named `light` can hold the system's original dark palette. The document preserves field names and values, explains that limitation, and points to original CSS for selectors and font setup. A hash identifies source bytes; it is not rendered verification or accessibility certification.

The reference application was not run, external workflows linked by the catalog were not executed, and no claim of universal superiority is established by this study. Arbitrary repository imports, reference runtime adapters, collaboration, and broad plugin workflows remain outside this implementation. Website rendered review and deployment evidence are recorded separately.
