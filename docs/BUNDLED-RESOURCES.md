# Eidova resource library

Imported from https://github.com/nexu-io/open-design at `b4ec310921f49ae512de1f0a1f3a4e7ce3d05f2f`.
The curated library contains **784 packages**: 152 design systems, 115 design
templates, 343 official plugin packages, 169 skills, three framework/live-artifact
templates, and two source catalogs. Its 7,188 logical file records share 6,406 stored files (139,052,651 bytes, excluding root notices and the generated index).
782 duplicate file copies were removed, saving 36,967,093 bytes. Original bytes are preserved,
including companions, previews, scripts, images and license notices. The single repository `.gitignore` is omitted because npm excludes it; the index records that exclusion. Per-file SHA-256
hashes, sizes and MIME types live in `content/open-design/index.json` and are checked
on reads. `sourcePath` preserves logical preview paths; `storagePath` points to shared bytes inside the bundle. Reads validate both paths and verify hashes and sizes.
Plugin IDs include their source group to avoid collisions with the main systems
and templates. Main design packages rank before compatibility plugins on tied searches.

136 redundant system wrappers and one catalog-only pointer are excluded from search, resource lists and capability counts. Their manifests, files and previews remain readable through existing URIs and HTTP routes. Seven wrappers with distinct payloads remain in discovery. Unslop includes its complete references, scripts, CC BY 4.0 license and credits; its manifest records its own repository and pinned revision. Run `node scripts/curate-resources.mjs ../eidova-website` for idempotent curation; the source importer runs the same step.

Root Apache-2.0 terms, package MIT/Apache/CC-BY-4.0 declarations, font OFL notices,
and source attribution files remain available. Each plugin manifest and its original
template metadata retain author, publisher and license information. Video packages
also link `design://open-design/catalogs/video-attributions`.

These are reference packages, separate from Eidova's 31 installable React registry IDs.
Some skills are curated pointers, not complete workflows. External tools, services,
fonts and dependencies mentioned by the source are not bundled merely because a
document links them. Included local assets, fonts, audio and video are preserved.
No imported scripts, HTML or skills execute on the server.

Both core (13 tools) and full (42 public / 43 owner tools) include `search-resources` and `read-resource`. Search first:

```json
{"query":"linear","kind":"design-systems","limit":8,"offset":0}
```

Search matches all query terms in title, ID, category and description, ranks title
matches first, and returns `nextOffset` for pagination. It is not full-text or
semantic search. Omit query/kind to browse all entries. The usual `find-design-system`
and `get-design-system-kit` still select only installable Eidova kits.

Search results include a ready-to-call `next` instruction for `read-resource`. Clients
that only support tools can read the manifest and then any file URI from it:

```json
{"uri":"design://open-design/design-systems/linear-app"}
{"uri":"design://open-design/design-systems/linear-app/files/DESIGN.md","offset":0,"limit":12000}
```

Text pages default to 12,000 Unicode code points (maximum 24,000). Use the returned
`next` call or `nextOffset` until it is null. Offsets count code points, not UTF-8
bytes or JavaScript UTF-16 units. File responses include the original byte count,
SHA-256 and download URL. Binary files return metadata and a download link rather
than expanding images into tool context. The tool accepts only bundled resource
URIs, never arbitrary URLs or local paths.

The same content is available through native MCP `resources/read`:

- `design://open-design/design-systems/linear-app`: manifest, provenance and file URIs.
- `design://open-design/design-systems/linear-app/files/DESIGN.md`: verbatim main document.
- `design://open-design/design-systems/linear-app/files/source/evidence.md`: companion file.
- `design://open-design/skills/frontend-design/files/SKILL.md`: original skill.
- `design://open-design/license`: root Apache-2.0 license; entry manifests link overrides.

All 784 manifests appear in `resources/list`; file bodies load only on demand. Binary
files use correctly typed MCP base64 blobs, text files use text content. Returned instructions are
reference data and do not override user permissions or existing project decisions.

HTTP equivalents:

- `GET /api/resources?query=linear&kind=design-systems&offset=0` (20 entries per page).
- `GET /api/resources/design-systems/linear-app` (manifest).
- `GET /api/resources/design-systems/linear-app/file?path=DESIGN.md` (attachment).
- `GET /api/resources/license` (root license attachment).

Search kinds are `design-systems`, `design-templates`, `plugins`, `templates`,
`catalogs`, and `skills`. For example:

```json
{"query":"aster atelier","kind":"design-templates"}
{"query":"image templates infographic","kind":"plugins"}
{"uri":"design://open-design/design-templates/aster-atelier/files/example.html"}
{"uri":"design://open-design/plugins/video-templates-frame-build-minimal"}
```

Only indexed package/file paths are accepted. Downloads force attachment delivery,
`application/octet-stream`, `nosniff` and a sandbox CSP, including HTML and scripts.
Missing files return uncached 404 responses without an attachment header.

On the website, choose **Preview design** or **Read files** directly. Sixteen results appear initially; **Show more resources** and **Show all resources** expose remaining matches. Optional metadata and an entrypoint download sit under **Details**. The dialog lists every bundled companion file, displays text literally
(including HTML and scripts), previews images/audio/video, and downloads original bytes. It
preserves selection on failure, offers retry, cancels stale requests and returns
focus when closed. **Copy agent prompt** carries the selected resource URI into a
tool-only MCP session; **Agent instructions** provides a manual copy fallback.
License downloads remain available alongside package-specific notices in the file picker.

**Preview design** opens the package's original HTML or publisher media. The importer
discovers local HTML previews and image/video previews. HTML uses
an opaque sandbox with scripts allowed, no host storage access, no network actions
or form submission, and no child frames. `GET /api/resources/:kind/:id/preview?path=...`
accepts only an indexed HTML file and redirects to `/api/resource-previews/...`.
That route exposes indexed source files with their original MIME types, so relative
stylesheets, scripts, fonts and media resolve within the preserved source tree.
Preview HTML receives a scoped base URL and an Escape-key dismissal bridge; the
reader accepts that signal only from its own iframe. Original file downloads remain byte exact.
Previews can read published assets or scripts from HTTPS sources but cannot call
provider APIs. A failed preview preserves the file selection and offers retry or
**Read source**. The reader accepts indexed assets up to 16 MiB, including the
original landing-page images that exceed the previous 1 MiB limit.

These are upstream source packages with their own build instructions. The existing
31 Eidova Radix registry kits remain available. Packages needing build tools,
external assets or generation services retain those dependencies; the library
does not claim every linked workflow or preview interaction runs without them.

Refresh from the reviewed, clean checkout, running in the MCP repository:

```sh
npm run resources:import -- ../.reference/nexu-open-design ../eidova-website
```

The importer verifies the revision, clean tracked source, regular files, path safety,
license declarations and package counts before writing. It also generates the site's
small discovery index. Changing the pinned revision requires reviewing licenses and
the package inventory; the importer does not remove stale files for a future revision.
Deploy the MCP before the website so its download routes are available.

## Verification on 2026-11-13

All 124 regression tests pass without an environment preload. The three complete-library integration tests include hashes for all 7,173 indexed files, every package's entrypoint and license paths, MCP/HTTP parity, Unicode pagination, nested and binary resources, sandboxed preview delivery and invalid paths. The 7,177 imported originals also include supporting root notices and documentation. The staged Git blobs were independently checked against all indexed originals. MCP TypeScript/build, website TypeScript/build and built stdio smoke pass.

Website source, copy, contrast and interaction checks pass across 36 rendered states at 390, 1440 and 1728 widths in both appearances; all 12 copy panels pass. Checks include exact downloads, literal HTML, sandbox isolation, preview retry, large images, font/video assets, malformed responses, stale requests, clipboard denial, keyboard focus and Escape dismissal inside a preview. Eidova naming and the labeled type filter cover the full catalog, including both source catalogs. The receipt preserves two adjudications: no house Select exists for the labeled native controls, and the existing theme search intentionally reserves unequal space for its icon and Clear button. No unresolved critical/serious findings remain. Evidence: the website's `docs/full-library-review.json`; reproduction: `node scripts/verify-resource-library.mjs` with local website/MCP URLs. These checks are not real-user research or client-host walkthroughs. This continuation did not deploy the changed library or repeat full native Studio acceptance.

Fresh package smoke passes archive-content and private-path checks, installation into an empty consumer directory containing spaces, packaged diagnostics, core MCP discovery and original template/font reads. The tested tarball contains 10,389 files and all required notices. Package evidence is in `.work/verification/2026-11-13/library-release/package.log`; the full regression log is `library-release-tests.log` in the parent verification directory. npm/Registry publication remains separate from this package-install check.

A separate rendered-spacing check of the resource subtree at 390/1440/1728
found zero critical or serious findings. Latest local browser evidence is under
`.work/verification/2026-11-13/library-resume`; the website receipt links its hashes.
The library changes exclude separate showcase source, assets and navigation work.
Hosted checks must verify the matching deployed MCP before the website is promoted.
