# Can the GitHub repository replace the whole service?

Checked on 2026-11-07. **The repository supplies reusable UI assets, not the complete hosted MCP service.** No reverse engineering is needed to use the included component sources. A standalone replacement still needs a local MCP/data backend and replacements for hosted capabilities.

## Source checked

- Checkout: `../better-design`, origin `https://github.com/marvkr/better-design`.
- Commit: `175e7ba49bcf83857abc32933686b5aa3abb197e`, dated 2026-10-25.
- Published package inspected: `better-design@0.49.1` from npm.
- Separate plugin checkout: `better-designs/better-design-plugin`; its README explicitly says it contains plugin files only and connects to the hosted server.

## Repository inventory

| Area | What is available | What this establishes |
| --- | --- | --- |
| Design systems | 31 directories each in `components/` and `registry/` | These systems' shipped source can be reused directly. This does not establish coverage of the current hosted catalog. |
| Components and themes | 3,110 files under `components/` | Includes React component sources, global CSS and supporting files. |
| Registry | 3,152 JSON files, all parsed successfully; 3,244 embedded file entries | The checked-in registry holds actual source content, not just download links. |
| Agent workflow | `skills/better-design/SKILL.md` | Workflow instructions are available, but refer agents to MCP tools for guidance and data. |
| Animation assets | Transition sources, generation scripts and the animate-text skill/assets | These included assets are usable without recovering an executable. |
| License | MIT, copyright 2026 Marvin Kaunda | Reuse is permitted with the required copyright and permission notice. |
| MCP/backend project | No root `package.json`, `src/`, or `shared/` | This checkout is not the source tree required to build the published MCP/server. |

README lines 63–65 describe the repository as agent skill, component and registry sources.

## Hosted dependencies confirmed from the published package

The npm package includes `dist/index.js.map` with source contents. Selected originals were saved verbatim in `source-map-excerpts/`; these are static source observations, not runtime captures or reconstructed server code.

- `api-url.ts`: defaults to `https://better-design.com`, with an API-origin override.
- `api-client.ts`: its opening comment states that all data flows through the backend. The request helper requires an API key and calls `${API_URL}/api${path}` with bearer authentication.
- `http-data-provider.ts`: delegates design-system search/detail/components, principles and their search, review rules, icon-library/icon search, session guidance, team rules and project rules to that HTTP client.
- `index.ts`: creates the MCP server using `createHttpDataProvider()` and injects remote dashboard capture, inspiration, feedback, claims and project-kit storage callbacks. It also contains local functionality, such as lint registration, local icon/component writing and Remotion frame rendering.

The repository therefore does not supply the full principle/review corpus, hosted search indexes, account/project storage, custom generation backend, or browser/asset services. Some local algorithms and tool implementations are present in the published package's source map; that is a useful additional source, but it is not the missing hosted implementation or data.

Source-map SHA-256: `0ed332448cb3f1d9744153b041e88b30255de43523402cb7b5df7f922a77a333`.

## Work required for independent use

1. Reuse the MIT component/theme sources directly; keep their license notice.
2. Serve or resolve the registry locally. There are **665 absolute registry dependency references** to `www.better-design.com`; these need local resolution or rewriting. npm package dependencies still need installation.
3. Supply a local MCP server and data provider using the available catalog and local storage.
4. Supply the missing guidance corpus, search and generation functionality independently or through configured providers.
5. Replace hosted capture, asset and project services if full feature coverage is required.

The README advertises `cashmere` and `all.json` examples, but this checkout has no `cashmere` directory and no `*/all.json` bundles. Those examples cannot be assumed to work from this snapshot alone.

Recommendation: start with source reuse and a local data provider. Reserve reverse engineering for specific remaining behavior that cannot be established from the repository or published source contents. Cloning the repository alone does not make the hosted service unlimited or fully self-contained.

Verification was static: repository inventory, license and README inspection, parsing all registry JSON, dependency-reference inspection, and published-package source inspection. No hosted account was changed and no UI runtime was tested.
