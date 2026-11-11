# OpenDesign parity status — implementation 2026-11-11

Target: nexu-io/open-design `b4ec310921f49ae512de1f0a1f3a4e7ce3d05f2f` (0.25.1).
Architecture: own backend and user-supplied model keys. **Full parity is incomplete.**
This replaces the earlier dependency-blocked checkpoint. Final local checks were
repeated on 2026-11-12; the implementation commits use 2026-11-11 at the user's request.

| Feature boundary | Verified locally | Remaining work |
| --- | --- | --- |
| Design and skill resources | 152 design packages, 169 skill entries, companions/licenses and MCP/HTTP/website reads | Maintain pinned-source updates |
| Design tools | 13 core / 42 public full / 43 owner tools; packaged install and stdio checks | Coordinated hosted release and actual client-host walks |
| Team backend | SQLite migrations, invitations, hashed/revocable keys, one-use recovery, rotation, registration gate, quotas, rate limits, atomic commits, history, presence, shares and online backup/restore | Production HTTPS deployment, operational load and scheduled backup validation |
| Website workspace | Responsive editor, immutable revision reader/restore, feedback, invitations, access recovery and native creator/read-only policy | Actual production backend/HTTPS acceptance |
| Native membership | Exact request/project/tool authority and run-revocation adapters tested against real backend; installed daemon starts with verified own-backend membership | Complete active-run and multi-member acceptance inside the running daemon |
| Native project content | Creator-only writes, private defaults, shared teammate reads, versioned policy, atomic remote commits and journaled pulls preserving private files | Scheduler, materialization, watcher/restart and Windows durability acceptance |
| Native collaboration | File identities, stable comment cursors, attribution, idempotency, deletion ordering and presence leases | Preview anchors, feedback relay and live teammate cursor rendering |
| Combined native MCP | Real installed-engine smoke: 35 combined tools / 679 resources; create/read native project and read skill/plugin catalogs; fixture cancellation/collision/child-isolation checks | Live representative agent workflows and Local BYOK run integration |
| Local exchange | Exact transfers, watched three-way sync and portable native metadata/content | Runtime crash recovery acceptance; run history remains local |
| Native Studio | Pinned dependencies, guard/typecheck, daemon/web/desktop builds and tools-dev startup | Full preview/editor/import workflow acceptance |
| Native onboarding | Eidova copy across locales, retained theme/shared Buttons, Local AI/API Key entry, placeholder contrast and nine rendered welcome/focus/BYOK states | Live provider setup/streaming/cancel/error acceptance |
| Agent runtime and models | Installed source and focused environment/privacy tests; team service receives no model keys | Representative CLI runs, streaming/cancellation and user-configured provider checks |
| Media and exports | Installed upstream implementation | Exact image/video/audio generation and export verification with configured providers |
| Templates/plugins | Source packs retained and real native catalogs readable | Install/permissions/execution acceptance; catalog reads do not prove execution |
| Sharing/community | Website presence/revision links and native team adapters | Own public publication/community flows; legacy Vela public routes remain blocked |
| Desktop | TypeScript build and seven updater configuration/feed tests; Eidova disables upstream release feeds by default | Platform packaging, identity, signing, installers and own update-feed acceptance |
| Privacy/network | Workspace keys removed from agent/child environments; inherited upstream telemetry/cloud/Vela/AMR disabled; no external requests during reviewed onboarding | Provider/connector/plugin permissions and desktop review; this is not a network sandbox |

## Evidence

- Fresh standalone MCP suite: 116 passed; separate native integration suite: 8
  passed, no skips. Native adapter tests cover real HTTP/SQLite and exact Express
  authorization gates, rather than proving a complete daemon workflow.
- Native workspace `pnpm guard` / `pnpm typecheck` pass. Focused web tests: 64
  passed. Focused updater tests: 7 passed. Focused daemon privacy/environment tests:
  22 passed. Native daemon/web/desktop build evidence is retained locally.
- MCP and website production builds and typechecks pass. Built stdio and tarball
  installation/recovery smoke pass from another cwd, including a path with spaces.
- Website portal review: 41 states at 390/1440/1728, both appearances, sixteen
  passing copy panels; no recorded critical/serious spacing or contrast failures.
- Final native onboarding review: 9 states at those widths, four passing copy
  panels, no critical/serious source/spacing findings, no external requests/page
  errors and sampled text/placeholder contrast at least 5.71:1. Moderate findings
  retain upstream small controls, centered margins/density and legacy colors.
  See sibling Studio `docs/eidova-integration-review.json`.
- Raw logs, snapshots and DOM/tool evidence stay in ignored `.work` / `.tmp`.
  These checks are scoped local evidence, not accessibility certification or a
  trusted dashboard receipt. No provider keys or paid model calls were used.

## Next checkpoint

Run creator/teammate workflows, private/shared transitions, live revocation,
watch/restart recovery and private-file preservation inside the installed daemon.
Then verify user-configured Local BYOK, media/export and plugin execution, own
public publication/community, platform installers and production HTTPS hosting.
Preserve the existing runtime data and upstream provenance; do not infer full
parity from imported source, green adapter tests or catalog discovery.
