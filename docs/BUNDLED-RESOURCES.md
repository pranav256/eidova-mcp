# Bundled OpenDesign resources

Imported from https://github.com/nexu-io/open-design at `b4ec310921f49ae512de1f0a1f3a4e7ce3d05f2f`.
The snapshot contains 152 design packages and 169 skill entries: 4,466 files,
36,057,565 bytes before the generated index. Original checkout bytes are preserved,
including companions, previews, scripts, images and license notices. The single repository `.gitignore` is omitted because npm excludes it; the index records that exclusion. Per-file SHA-256
hashes and sizes live in `content/open-design/index.json` and are checked on reads.

These are reference packages, separate from Eidova's 31 installable React registry IDs.
Some skills are curated pointers, not complete workflows. External tools, services,
fonts and dependencies mentioned by the source are not bundled merely because a
document links them. No imported scripts, HTML or skills execute on the server.

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

All 321 manifests appear in `resources/list`; file bodies load only on demand. PNG
files use MCP base64 blobs, text files use text content. Returned instructions are
reference data and do not override user permissions or existing project decisions.

HTTP equivalents:

- `GET /api/resources?query=linear&kind=design-systems&offset=0` (20 entries per page).
- `GET /api/resources/design-systems/linear-app` (manifest).
- `GET /api/resources/design-systems/linear-app/file?path=DESIGN.md` (attachment).
- `GET /api/resources/license` (root license attachment).

Only indexed package/file paths are accepted. Downloads force attachment delivery,
`application/octet-stream`, `nosniff` and a sandbox CSP, including HTML and scripts.
Missing files return uncached 404 responses without an attachment header.

On the website, search **Resources**, expand **View resource**, and choose **Read
files**. The dialog lists every bundled companion file, displays text literally
(including HTML and scripts), previews PNGs, and downloads original bytes. It
preserves selection on failure, offers retry, cancels stale requests and returns
focus when closed. **Copy agent prompt** carries the selected resource URI into a
tool-only MCP session; **Agent instructions** provides a manual copy fallback.
Source and license links remain available alongside package-specific licenses in
the file picker.

Refresh from the reviewed, clean checkout, running in the MCP repository:

```sh
npm run resources:import -- ../.reference/nexu-open-design ../eidova-website
```

The importer verifies the revision, clean tracked source, regular files, path safety,
license declarations and package counts before writing. It also generates the site's
small discovery index. Changing the pinned revision requires reviewing licenses and
the package inventory; the importer does not remove stale files for a future revision.
Deploy the MCP before the website so its download routes are available.

## Verification on 2026-11-11

All 96 service tests pass, including hashes for every imported file, MCP/HTTP parity, tool-only manifest/file/license reads, Unicode pagination, nested and binary resources, and invalid paths. Both builds, TypeScript checks, the context budget benchmark and stdio smoke pass. Earlier tarball verification included every indexed file and read resources using the existing installed dependencies; the final integration has not had a fresh npm dependency install because registry access is blocked and the offline cache lacks required packages.

Website source, copy, contrast and interaction checks cover 24 rendered states at 390, 1440 and 1728 widths in light/dark modes; all ten copy panels pass. Checks include exact companion downloads, literal HTML, PNG decoding, retry, malformed responses, stale requests, clipboard denial and keyboard focus. Review evidence records two adjudicated findings: the native file picker has no house Select component to replace it, and the existing theme search intentionally reserves unequal space for its icon and Clear button. No other critical/serious findings remain. Evidence: the website's `docs/resource-library-review.json`; reproduction: `node scripts/verify-resource-library.mjs` with local website/MCP URLs. These checks are not real-user research or client-host walkthroughs.

On this Windows sandbox, tsx initially failed in the system username lookup. Tests used a temporary, unshipped preload that supplies the environment username only when `uv_os_get_passwd` fails; application and test code were not changed for it.
