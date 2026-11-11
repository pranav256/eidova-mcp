# Public MCP execution and filesystem audit

Audit scope: `src/mcp.ts`, its recovered upstream registrations, the generated `vendor/upstream/runtime.mjs`, `scripts/build-upstream.mjs`, the immutable-asset adapter, and the public URL extraction boundary. This was source/compiled-output inspection. No caller-selected project or recording was executed and no remote URL was requested for the audit.

## Critical finding and verified source fix

The original `registerReviewTool` is a **local stdio tool**, not safe unchanged on a public server. Its `review-ui-code` schema allows `files[].content` to be omitted. `loadReviewFiles` then resolves each `files[].path` under `process.cwd()` and reads reviewable source files. A public caller could request a server source file such as `src/app.ts`; path containment does not make this an authorized public read.

There is also an implicit filesystem read even when all file contents are supplied: the original handler calls `readLengthSamples(process.cwd(), reviewedPaths)`, which can scan up to 2,000 directories and read 200 other TSX/JSX files. Requiring inline content alone would not remove that behavior.

The current fork applies both necessary fixes:

- `src/mcp.ts` updates the public tool's parameter schema so `files[].content` is required.
- `scripts/build-upstream.mjs` replaces the original `loadReviewFiles` invocation with an inline-only mapping and replaces automatic sampling with `lengthSamples: []`.
- The inspected generated runtime contains **no references to `loadReviewFiles` or `readLengthSamples`**. Its lint invocation passes `lengthSamples: []`.

The original upstream `.ts` remains unchanged as provenance. Those originals must not be imported directly by the public app; public registration must use the adapted runtime. The test in `tests/mcp.test.ts` exercises rejection of a source path without inline content and successful inline review; it should remain a release gate.

### Regeneration guard

At the audit point, the build adapter used plain `String.replace` for the security-sensitive replacements. A source change can cause a replacement to match nothing while the build succeeds. **The build should assert exact expected matches and fail if loader removal, sampler removal or network replacement no longer applies.** A final compiled-runtime assertion should reject reappearance of the forbidden loader/sample calls. This is a serious release guard, not evidence of an active filesystem leak in the inspected adapted runtime.

## Tool-by-tool boundary findings

| Registration | Caller fields of concern | Actual current handler | Public requirement |
| --- | --- | --- | --- |
| `review-ui-code` | `files[].path`, `files[].content` | Adapted inline-only lint and no automatic disk samples. | Keep required content and both build patches. Never forward to the original disk-reading callback. |
| `detect-icon-library` | `manifestContent` | Parses supplied JSON. Despite the original description saying it reads `.library.json`, it does not call filesystem APIs. | Describe manifest input accurately; do not add a server `targetDir` reader. |
| `install-icons` | `targetDir`, names, format | Validates target directory as an output label, retrieves immutable icon SVG, and returns component/file contents. It writes only if a `writeIcons` callback is injected. | No write callback in public mode. Caller paths remain labels, not server destinations. |
| `get-design-system-kit` | `projectDir`, install settings | Local filesystem setup/install runs only through `installKit`, `writeIcons`, or `writeKitFiles` callbacks. Current public registration injects none. | Return source and commands. Never inject installers or write callbacks into HTTP registration. |
| `render-video-frames` | `projectDir`, entry, composition, frames, props | Executes only when a `renderFrames` callback exists and projectDir is supplied. The current registration has no callback and returns bounded, quoted Remotion commands. | Keep command-only public behavior; do not accept remote project execution. |
| `cut-screen-recording` | `src`, `measurements.file`, measurements | With no measurements, returns a `String.raw` script. The `execFileSync`, ffprobe/ffmpeg and environment references are **inside that returned string**. With measurements, performs pure numeric planning; file/src values are labels/snippet values. | Return instructions and computed beats; do not run the probe on the server. |
| `get-jig-guide` | kind, framework | The recovered version supports tune-in-place, standalone-tool and variant-canvas and returns static strings/scaffolds. No server execution or wait listener. | Do not imply newer live-service modes such as wait-for-send were recovered or executed. |
| Feature-map tools | file labels and map text | Pure parser/heuristic/update functions over supplied input. They do not run git, read maps from disk, or save them. | Retain supplied-content behavior. |
| `extract-design-system` | CSS and other source strings | Pure extraction, color normalization and formatting. It does not evaluate scripts or read caller paths. | Treat extracted text as data and preserve input bounds. |
| `extract-from-url` | public URL | Dispatches to the independent URL fetcher; no browser execution. | Keep DNS validation/pinning, port/credential restrictions, redirect revalidation, size and timeout bounds. |
| Structural/comprehension/spacing reviews | inline source, copy, elements and screenshot data | Local parsing and deterministic evidence analysis. Lint uses the TypeScript parser; inspected code does not eval/import/execute submitted modules. | Do not introduce evaluation or client-supplied paths as server files. |
| `finalize-dashboard-review` | HTTPS preview and source/data | Current public server injects no `captureDashboardBrowser`; final review therefore remains incomplete instead of browsing the supplied URL. | Advertise incomplete/unavailable capture accurately. A future browser implementation needs a separate public-network boundary. |
| Team rules/config/projects | workspace-scoped state and project identifiers | Application storage is intentionally used; config mutations require the project owner identity. Catalog/theme previews may be public. | Separate intended scoped state persistence from arbitrary filesystem reads; never use anonymous callers as one writable account. |

## Network audit

The recovered runtime originally used global fetch for catalog tokens, catalog variant discovery and Iconify. The inspected adapted runtime replaces five active fetch sites with `globalThis.__EIDOVA_PUBLIC_FETCH__`.

`src/public-fetch.ts` only serves catalog registry and locally packaged Lucide SVG routes on this service's configured origin. It uses no request-scoped credentials. An unknown origin or path fails; it does not fall through to network fetch. Sharing this immutable adapter on `globalThis` is not a request-scoped fetch monkeypatch.

Other `globalThis.fetch` references in the adapted runtime are default values for optional `apiFetch` dependencies. The public `createMcpServer` call explicitly supplies `apiDispatcher(projects)`, so those defaults are not selected for the reviewed registration. Every own-API dispatch route is local; unknown capabilities return an explicit unavailable response.

The only intentionally open network operation inspected is `safeFetchPublic` for a caller-supplied page or linked CSS. It:

- accepts HTTP(S) without credentials and only standard ports;
- rejects listed private/local/reserved IPv4 addresses and restricts IPv6 to an allowed global range with exclusions;
- rejects a hostname if any returned DNS address is disallowed;
- pins the validated address into the actual request lookup;
- independently validates redirects, with three redirects maximum;
- requests identity encoding, refuses compressed responses, and limits each body to 1 MB;
- bounds DNS resolution and requests with timeouts;
- does not forward the workspace key or Vercel storage credential to the external page.

These observations establish the implemented boundary, not completeness of every future platform's special network endpoint list. Adding browser navigation or another HTTP client must not bypass this boundary.

## Runtime callbacks that must stay absent publicly

The audited public `createMcpServer` call provides no `renderFrames`, `installKit`, `writeIcons`, `writeKitFiles`, `captureDashboardBrowser`, `sendFeedback`, or `confirmClaim` callbacks. Account panel registration is disabled. Figma prototype/kit tools, whose upstream code can read/write files and launch a local relay, are not registered by the current public app.

Source snippets that mention shell commands, filesystem operations or environment variables are not active server effects by themselves. However, a release must not enable a new callback merely because a tool already exists in the upstream bundle. Public registration, adapted runtime regeneration, filesystem-read rejection and owner-isolated state tests should be checked together before publishing.

## Release checklist for this audit scope

1. Build from the adapted runtime; fail closed if required security patches stop matching.
2. Require inline review content and verify that no implicit source sampling returns.
3. Preserve command-only video/installer behavior and do not register local Figma execution tools.
4. Preserve fail-closed immutable fetch and safe public URL extraction.
5. Run the MCP regression tests against the deployment build and verify private state mutation remains owner-scoped.

No claim is made here that inaccessible hosted features were reconstructed or that a source-only audit proves complete production security.


## Release hardening, 2026-11-07

SDK 1.32.2, Zod 4.6.7 and Drizzle 0.45.4 replace vulnerable versions. Scoped
overrides select patched Hono node-server 2.1.6 and Vercel CLI-config 0.3.7;
Blob remains 2.8.2 for private/ETag features. The unused Vercel Node development
dependency was removed. npm audit reported zero advisories at release time.

The local source reviewer permits a native element only inside the matching
components/ui primitive file that exports its expected public component. This
is a style exemption, not a security boundary; all accessibility, token and
other checks still run. Inline source labels never authorize filesystem reads.

Public URL extraction has a shared 20-second redirect deadline. Up to five
linked stylesheets are fetched concurrently with 15-second deadlines rather
than accumulating sequential waits beyond the function duration.
