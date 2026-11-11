# Editable guidance library

`content/library.json` is the versioned, editable content source for Eidova's local guidance. Its initial 72 principles and 25 review rules were independently written for this project under MIT. They are not a recovered copy of Better Design's hosted guidance: that private corpus was unavailable. The component catalog and its upstream license are documented separately.

You can edit this JSON directly, or import your own writing and exports you are authorized to use. The importer does not fetch vendor content, read credentials, or call a language model.

## Import an export

Run from the project root:

```powershell
npx tsx scripts/import-content.ts "D:\Exports\my-guidance.json"
```

New entries merge by exact ID into `content/library.json`. Replacing an existing ID requires `--replace`:

```powershell
npx tsx scripts/import-content.ts "D:\Exports\my-guidance.json" --replace
```

Use `--output <path>` to select another destination. The input JSON path is always required. Both the input and the resulting merged library must validate before the destination is replaced. Each successful replacement first saves the exact previous bytes in `.work/content-backups/`, then writes and syncs an adjacent temporary file and renames it over the destination. Backups stay local and should not be committed or deployed. A destination lock prevents two importer processes from overwriting each other's work; after a crashed import, remove a stale `.import.lock` only when no importer is running.

Restart a running local server or rebuild and redeploy a hosted server after editing the content. Imports are an administrator command, not a public MCP tool.

## JSON contract

Every export uses this complete envelope; either collection may be empty:

```json
{
  "version": 1,
  "principles": [
    {
      "id": "principle-my-team-ui-spacing",
      "title": "Group related content",
      "content": "Use smaller gaps within a group than between groups.",
      "area": "ui",
      "topic": "spacing",
      "aliases": ["layout", "grouping"],
      "sourceFile": "my-team/spacing.md",
      "chunkType": "parent"
    }
  ],
  "reviewRules": [
    {
      "id": "review-my-team-focus",
      "title": "Show keyboard focus",
      "content": "Check every interactive control with keyboard navigation.",
      "category": "accessibility",
      "severity": "serious"
    }
  ]
}
```

Only documented fields are accepted. `sourceFile` is mandatory for principles and is preserved exactly as supplied; the importer never guesses authorship or provenance. Record the source and applicable rights honestly in your own content. The initial library retains `src/guidance.ts` because that is where its text was written. Review rules use the published contract without a `sourceFile` field; include attribution in their content when needed.

Allowed principle areas: `ui`, `ux`, `react-native`, `swiftui`, `three-js`, `shopify`, `sales`, `motion`, `widget`, `illustration`.

Allowed review categories: `accessibility`, `visual-design`, `animation`, `content`, `comprehension`, `ai-features`, `coverage-gaps`. Severity must be `critical`, `serious`, or `moderate`.

IDs must be unique across both collections. Topics must be unique within their area after the same Unicode, case, whitespace, underscore and repeated-hyphen normalization used by local retrieval. For example, `text scale` and `TEXT_scale` collide in `ui`; `ui/spacing` and `ux/spacing` are allowed. `--replace` only replaces the same ID; it does not bypass duplicate topics or other validation.

Limits are 5,000 entries across the complete library, 200,000 characters per content field, 16 MiB per JSON file, 200 characters per ID/topic/alias, 500 characters per title, 2,000 characters per `sourceFile`, and 100 aliases per principle. Text fields must contain non-whitespace text.

## Programmatic use

`src/content-library.ts` exports strict Zod schemas, `validateContentLibrary(value)`, the bounded async `loadContentLibrary(path)`, and the pure `mergeContentLibraries(base, incoming, { replace: true })` helper. Validation and merge results are detached from their input objects, including nested alias arrays.
