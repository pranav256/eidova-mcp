# Compatibility investigation — 2026-11-07

## Artifact evidence

The REA CLI analyzed the archived published `better-design@0.49.1` package as
inert JavaScript. The source-map inspection is Evidence
`ev_71455c00d52773bb2b7f0c73e9646f65e7e3a8feea99b05af451a347373001ca`.
The focused compiled-entry analysis is Evidence
`ev_fd2be75d9274941dabf44c7a09f42c05b17c871b41fde6041c7c5603507101ae`.
It parsed `dist/index.js`, visited 221,174 AST nodes, retained 321 modules and
reported zero parse failures. The referenced source map matches the existing
recorded SHA-256 `0ed332448cb3f1d9744153b041e88b30255de43523402cb7b5df7f922a77a333`.

These are static observations. REA reports partial graph coverage and dynamic
relationships remain unknown; the target package was not executed. Complete
Evidence and current MCP metadata are saved under ignored `.work/verification/`.
The CLI works independently of MCP registration, so this investigation changed
no Codex configuration and required no native analysis engine.

A normal connected Better Design guidance request still returned the 300-call
quota error and no guidance, with the stated reset date December 5. That response
does not reveal the private guidance library; authentication/trial URL material
is excluded from this public report.

## Restored project rules

The shipped `project-rules.ts` and `mcp/tools/team-rules-tools.ts` establish the
slot defaults, normalized names, limits, selected-screen behavior and provider
callbacks. The initial replacement had narrowed away the project fields. Those
fields are now restored on `get-team-rules` and `set-team-rules`, preserving
`personApproved: true` and explicit replacement approval.

The independent storage adapter implements project guidelines, use/never/pairing
rules for parts or values, brand-wide bans and exact screen/part specifications.
Reads and writes require the project owner's workspace. Immutable revisions and
an atomic manifest keep 500 rule slots within the storage document cap, preserve
concurrent saves and refuse implicit replacement. Names are limited to 120
characters, guidelines/team rules to 32KiB UTF-8, and part rules/specifications to
4KiB UTF-8. These semantics reuse the published contract; the vendor's database
implementation was not recovered.

The archived client's consumed HTTP contract is implemented at
`/api/v1/project-rules/{id}`: GET with optional `screen` and repeated `parts`, PUT
with the rule slot and optional `replaceExisting`, HTTP 409 for conflicting text,
and HTTP 404 for a project belonging to another workspace.

## First-visit workflow

The connected metadata describes a newer first-visit workflow absent from the
published package. This pass independently implements its `brief`, `rank` and
`recheck` inputs and the hurry, doubt, small-screen, literal and breaker walks.
Task blockers rank ahead of frequency; identical page/element/kind findings are
deduplicated with stable IDs. A reported fix is confirmed only when every walk
that reported the issue reran under its conditions and no longer reports it.
Missing or incomplete walks cannot produce a pass. Legacy task/observations
calls still work.

Receipts bind the supplied reports by SHA-256 and explicitly state that the
server did not open a browser or conduct real visitor research. They are not
vendor receipts or trusted dashboard browser approvals. Exact proprietary
first-visit wording and algorithms remain unknown.

## Validation and remaining gaps

All **66 tests** pass and TypeScript checks pass. The new tests exercise protocol
schemas, approval refusal, owner isolation, HTTP conflict semantics, concurrent
updates, byte/slot limits, failed persistence, first-visit ranking and strict
rerun requirements. Built stdio also works from another working directory.

The production private-state check additionally verifies project screen rules
through fresh MCP clients and the HTTP endpoint, cross-owner refusal and implicit
replacement rejection. Public MCP discovery accepts the first-visit brief input.

The shipped token preview resource already has a real HTML fallback, so removing
nonexistent screenshot links remains correct. Some emitted showcase links still
lead to JSON metadata; a full browser showcase remains a separate UI gap.
Vendor private content, AI generation, proprietary inspiration, account services,
mobile/Shopify installation kits and service-owned dashboard captures remain
unreconstructed. This pass improves compatibility and does not establish an
exact reproduction of the live vendor service.
