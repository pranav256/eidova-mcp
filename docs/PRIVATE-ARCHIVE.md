# Private offline capture integration

The local stdio server can optionally serve an owner's authorized, saved MCP
captures. The HTTP server does not load the private archive, and public builds
contain no captured content. This adapter makes no vendor requests and provides
no mechanism for acquiring additional content.

## Start

Build the server with `npm run build`, then launch stdio with both paths set:

```powershell
$env:OPEN_DESIGN_CONTENT_LIBRARY = 'C:/private/archive/effective-library.json'
$env:OPEN_DESIGN_PRIVATE_ARCHIVE = 'C:/private/archive'
node D:/Projects/better-design-rea/dist/stdio.js
```

Alternatively, the committed launcher configures both paths from an archive
directory and preserves MCP stdio without a shell wrapper:

```powershell
node scripts/start-private.mjs C:/private/archive
```

Register it in Codex with absolute paths (substitute your Node installation,
checkout and private archive directory):

```powershell
codex mcp add open-design -- 'C:/Program Files/nodejs/node.exe' D:/Projects/better-design-rea/scripts/start-private.mjs C:/private/archive
```

`codex mcp get open-design` shows the saved configuration. The
[official Codex MCP documentation](https://developers.openai.com/codex/mcp/)
describes the shared CLI/app configuration and stdio command options.

The content library is independently validated by its existing schema. The
archive directory supplies successful numbered `*-tools-call.json` records with
`arguments`, `timestamp`, `response`, `rawBody` and `responseSha256`. The adapter
checks original response-body hashes and refuses mismatched saved responses,
missing kit files and unsafe file paths. It reads bounded local files and never
executes reference HTML, fetches URLs or installs source files.

Configure these environment variables only for the private local process.
`OPEN_DESIGN_CONTENT_LIBRARY` also exists on the HTTP server, so pointing that
variable at private text on a public deployment would expose that text.

## Tools

- `get-inspiration`: select `type` (`app-screens`, `html-flows` or
  `app-store-screenshots`), optionally `platform` for app screens or `category`
  for App Store sets. Search saved set names and capture queries with `query`.
  Product screens and HTML flows require a query. Use `limit: 6` for image sets
  or `limit: 3` for HTML flows. Returns original text/HTML and inline image
  blocks, grouped by saved set, with capture names and hashes.
- `get-design-system-kit`: archived `react-native`, `swiftui` and `shopify`
  targets require the captured `designSystemId`. Returns exact `nativeFiles`
  or `themeFiles` and `tokensCss` in `structuredContent`, together with original
  text and fixed reference images. `install: true`, uncaptured systems and
  custom project IDs are refused. Ordinary catalog targets retain their
  existing behavior.
- `get-capabilities`: reports saved collections, reference-set/image counts
  and available system/target/file counts. Guidance tools continue to read
  the configured content library and retain its source provenance.

Capture hash checks establish consistency with the saved bodies, not vendor
authentication or visual approval. Native and Shopify kits are source artifacts;
the integration does not establish that they compile, render or cover every
catalog system. Saved references are partial samples, and lookup is local
lexical search. Authors retain applicable rights; private captures are not
assigned this repository's MIT license.

## Verification

Synthetic fixtures exercise grouping, filters, limits, source immutability,
response integrity, path validation, protocol schemas, unavailable kits and
separate public/private instances. The private owner verification additionally
compares saved files and tokens verbatim through a built stdio subprocess,
checks all saved reference queries and verifies the configured guidance library.

The November 7 owner archive supplies 54 reference sets, 121 distinct image
files (including three kit-reference images), and Linear kits containing
2 React Native files, 7 SwiftUI files and 37 Shopify files. Its private corpus
contains 265 captured guides and 151 captured review entries; the configured
effective corpus includes 280 guides and 176 review entries after original seed
fallbacks. These numbers describe this owner's saved archive, not assets shipped
with the public repository.

## Checkout cleanup

The build dependency graph retains 146 of the 168 originally recovered source
files. Twenty-two unused modules, mainly the unsupported Figma integration,
were removed from the active source tree. Original source-map provenance and
license notices remain intact. Duplicate transcripts and obsolete local
prototype/build directories were moved into an ignored cleanup backup; the
owner's capture archive and the separate website checkout were retained.
