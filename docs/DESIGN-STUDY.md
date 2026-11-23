# Design Architecture Study

## Architectural Principles

- Portable `manifest.json`, `DESIGN.md`, and `tokens.css` packages allow design systems to be carried between agent sessions.
- Rich packages provide usage guidelines, component indexes, and source evidence.
- Larger files are indexed for on-demand reads rather than including all their content in every prompt.
- Usage, binding CSS tokens, and pull indexes are cleanly composed into agent context.
- Per-system `DESIGN.md` resources are discoverable via MCP.
- Shared previews bring kit, showcase, and tokens into a unified workspace.

## Eidova Implementation Decisions

Eidova keeps its native component registry, eight editorial families, and source/copy/spacing review workflow. It adopts the portable handoff pattern through generated `DESIGN.md`, and exposes the bundled reference catalog separately through `search-resources` and MCP resource reads.

The document is available at `GET /api/design-systems/:id/design.md` and the discoverable MCP resource `design://systems/{id}/design.md`. Kit results carry only these links and a short read-order instruction. Documents derive from the existing catalog and globals registry, include a source CSS SHA-256, distinguish representative previews from exact variant source, and require merging rather than overwriting existing project instructions.

Family suitability and tradeoffs are editorial recommendations grounded in [DESIGN-FAMILIES.md](DESIGN-FAMILIES.md). Search can require actual registry component names and reports matched terms.

## Verification and Limits

`tests/design-context.test.ts` checks all catalog documents for deterministic identity, token values, and source hashes; representative/variant distinctions; bounded document size; HTTP/resource parity and discovery; unknown and traversal-like IDs; kit schema compatibility; core tool count; and component-constrained search.

A globals registry scope named `light` can hold the system's original dark palette. The document preserves field names and values, explains that limitation, and points to original CSS for selectors and font setup. A hash identifies source bytes; it is not rendered verification or accessibility certification.
