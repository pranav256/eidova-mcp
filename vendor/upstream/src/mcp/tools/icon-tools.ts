import { z } from "zod";
import {
  buildBarrel,
  buildTsxComponent,
  parseSvg,
  stripPrefix,
  toFileStem,
  toPascalCase,
  validateTargetDir,
} from "../icon-installer";
import type { WriteIcons } from "../write-icons";
import { generateIcons, iconFilesToWrite, unsafeIconWrite, type GeneratedIcon } from "../icon-files";
import type { RegisterToolDeps } from "./shared";
import {
  CONTEXT_ARG,
  fetchWithTimeout,
  ICONIFY_API_BASE,
  ICONIFY_FETCH_TIMEOUT_MS,
  READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS,
  READ_ONLY_TOOL_ANNOTATIONS,
  trackSearch,
} from "./shared";

// Iconify serves every icon as an SVG at a stable public URL. The names the
// search returns already carry their prefix; a bare name takes the library's.
function iconifySvgUrl(name: string, prefix: string): string {
  const [iconPrefix, iconName] = name.includes(":") ? name.split(":", 2) : [prefix, name];
  return `${ICONIFY_API_BASE}/${iconPrefix}/${iconName}.svg`;
}

// On the local server install-icons writes into the project, so it is no
// longer read-only there. [BD-1278]
const WRITE_ICONS_ANNOTATIONS = { ...READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS, readOnlyHint: false, destructiveHint: false };


/**
 * Saves the generated icons, their barrel and the library manifest through the
 * local writer, and tells the agent what to import. [BD-1278]
 */
async function saveIcons(
  writeIcons: WriteIcons,
  icons: {
    dir: string;
    libraryId: string;
    libraryName: string;
    prefix: string;
    generated: GeneratedIcon[];
    skipped: { name: string; reason: string }[];
  },
): Promise<string> {
  const { dir, libraryId, libraryName, prefix, generated, skipped } = icons;
  const result = await writeIcons(iconFilesToWrite({ dir, libraryId, libraryName, prefix, generated }));
  const names = generated.map((f) => f.componentName);
  const lines = [
    `Saved ${names.length} ${libraryName} icon components to \`${result.dir}/\`. Do not write them again.`,
    "",
    "Import them and use each one in the screen:",
    "",
    "```tsx",
    `import { ${names.join(", ")} } from "@/${dir}";`,
    `<${names[0]} className="size-4" />`,
    "```",
  ];
  if (skipped.length > 0) {
    lines.push("", "Not found, so not saved:", ...skipped.map((s) => `- \`${s.name}\`: ${s.reason}`));
  }
  return lines.join("\n");
}

/** Registers the icon tools: find a library, find icons in it, install them, detect the one in use. */
export function registerIconTools({ server, provider, tracked, track, writeIcons }: RegisterToolDeps): void {
  const iconLibraryConfig = {
    title: "Find Icon Library",
    description: `Search for icon libraries matching a design style or personality using semantic search, and return the closest matches.

After a design system is ready, call this and SHOW the user the closest matches (name + style, no scores), then ask which they want, don't auto-pick. Use this to find an icon library that matches your design system's personality:
- Style traits (minimal, bold, rounded, sharp, outlined, filled)
- Mood (friendly, professional, playful, serious, warm, elegant)
- Use case (consumer, enterprise, developer, dashboard, mobile)

Examples:
- "minimal clean professional" → Iconoir, Feather Icons
- "friendly rounded warm" → Phosphor, MingCute
- "bold technical enterprise" → Tabler, Carbon`,
    inputSchema: z.object({
      query: z.string().describe("Style description or personality traits to match."),
    }),
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
  };

  const makeIconLibraryHandler =
    (toolName: string) =>
    async ({ query }: { query: string }) => {
      const start = Date.now();
      try {
        const results = await provider.searchIconLibraries(query, 5);
        const topResults = results.map((result) => ({ id: result.id, score: result.matchScore }));

        if (results.length === 0) {
          return trackSearch(
            track,
            toolName,
            { query, topResults },
            start,
            { content: [{ type: "text" as const, text: "No icon libraries found matching your query." }] },
          );
        }

        const formatted = results
          .map((r) => {
            // Iconify's per-set browser shows every icon in the set, so the user
            // can open the name and SEE the library before choosing. Exists for
            // any Iconify prefix. [BD-184]
            const browseUrl = `https://icon-sets.iconify.design/${r.prefix}/`;
            const lines = [
              `### [${r.name}](${browseUrl})`,
              `_${r.tags.join(", ")}_ · id: \`${r.id}\` · prefix: \`${r.prefix}\``,
            ];
            if (r.variants?.length) {
              lines.push(`Variants: ${r.variants.join(", ")} (default: ${r.defaultVariant || r.variants[0]})`);
            }
            return lines.join("\n");
          })
          .join("\n\n");

        return trackSearch(
          track,
          toolName,
          { query, topResults },
          start,
          {
            content: [{
              type: "text" as const,
              text: `# Matching icon libraries\n\nShow these to the user as options (no scores), keeping each name as its clickable link so they can open it and SEE the icons before choosing. Ask which fits their brand, don't auto-pick. Once they choose, use \`find-icons\` + \`install-icons\` with that library's \`id\`. (Iconify usage: \`<Icon icon="prefix:icon-name" />\`.)\n\n---\n\n${formatted}`,
            }],
          },
        );
      } catch (error) {
        return trackSearch(
          track,
          toolName,
          { query, topResults: [] },
          start,
          { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : "Unknown error"}` }] },
          true,
          error instanceof Error ? error.message : String(error),
        );
      }
    };

  // find-icon-library (renamed from resolve-icon-library). [BD-173]
  server.registerTool("find-icon-library", iconLibraryConfig, makeIconLibraryHandler("find-icon-library"));

  const iconSearchConfig = {
    title: "Find Icons",
    description: `Search for specific icons within an icon library.

Use this after find-icon-library to find specific icons by name/concept.

**Query with a single canonical noun** ("inbox", "calendar", "paperclip"), not a multi-word phrase. The underlying index keyword-matches, so "home" beats "home house dwelling". Multi-word queries still work (they fall back to a per-keyword union) but a single noun gives the best ranking. Search once per concept; you don't need to retry with synonyms.

Examples:
- find-icons({ query: "home", libraryId: "ph" })
- find-icons({ query: "settings", libraryId: "tabler" })

Every name returned exists in the library, so pass them to \`install-icons\` verbatim. A \`variant\` only re-orders the results, putting the names that carry that variant first; it never rewrites a name.`,
    inputSchema: z.object({
      query: z.string().describe("What icon you need (e.g., 'home', 'settings', 'user')"),
      libraryId: z.string().describe("The icon library ID from find-icon-library"),
      variant: z.string().optional().describe("Optional variant style (e.g., 'bold', 'outline', 'duotone')."),
    }),
    // Searches the public Iconify API; it does not change the icon catalog.
    annotations: READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS,
  };

  const makeIconSearchHandler =
    (toolName: string) =>
    async ({ query, libraryId, variant }: { query: string; libraryId: string; variant?: string }) => {
      const start = Date.now();
      try {
        const library = await provider.getIconLibraryById(libraryId);
        if (!library) {
          return trackSearch(
            track,
            toolName,
            { query, topResults: [] },
            start,
            { content: [{ type: "text" as const, text: `Icon library '${libraryId}' not found.` }] },
          );
        }

        const icons = await provider.searchIconsInLibrary(query, library, variant, 15);
        const topResults = icons.map((icon) => ({ id: icon }));

        if (icons.length === 0) {
          return trackSearch(
            track,
            toolName,
            { query, topResults },
            start,
            {
              content: [{ type: "text" as const, text: `No icons found in ${library.name}.` }],
              // An empty list, not an error: a Zap's search step reads it as
              // "nothing found" and the Zap carries on. [BD-1142]
              structuredContent: { library: { id: library.id, name: library.name }, icons: [] },
            },
          );
        }

        const lines = [
          `# Icons from ${library.name}`,
          "",
          "**Next step:** call `install-icons` with these names to scaffold them as SSR-clean React component files in the user's repo. Avoid the runtime `<Icon icon=\"...\" />` import, it requires a CDN fetch on every page load.",
          "",
          "```ts",
          `install-icons({ libraryId: "${library.id}", names: [${icons.slice(0, 3).map((i) => `"${stripPrefix(i)}"`).join(", ")}${icons.length > 3 ? ", ..." : ""}] })`,
          "```",
          "",
          "Found icons:",
          "",
          ...icons.map((icon) => `- \`${icon}\``),
        ];

        return trackSearch(
          track,
          toolName,
          { query, topResults },
          start,
          {
            content: [{ type: "text" as const, text: lines.join("\n") }],
            // Named fields for callers that read fields, such as a Zap step. [BD-1142]
            structuredContent: {
              library: { id: library.id, name: library.name },
              icons: icons.map((name) => ({ name, svgUrl: iconifySvgUrl(name, library.prefix) })),
            },
          },
        );
      } catch (error) {
        return trackSearch(
          track,
          toolName,
          { query, topResults: [] },
          start,
          { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : "Unknown error"}` }] },
          true,
          error instanceof Error ? error.message : String(error),
        );
      }
    };

  // find-icons (renamed from search-icons). [BD-173]
  server.registerTool("find-icons", iconSearchConfig, makeIconSearchHandler("find-icons"));

  server.registerTool(
    "install-icons",
    {
      title: "Prepare Icon Component Files",
      description: `Fetch SVG icons and return component file contents for the agent to save. On a local Better Design server it saves them into the project's icons folder instead; the hosted server writes no files.

Call this after \`find-icons\` to materialise the chosen icons as owned, SSR-clean component files, with no runtime CDN fetch from \`api.iconify.design\` and no first-paint flash.

The tool fetches each SVG from the public Iconify API, inlines its viewBox + body into a small \`<Name>Icon\` React component, and returns a list of \`<file path="...">\`-tagged blocks for the agent to write to disk. A barrel \`index.ts\` is also returned.

Usage after writing the files:
\`\`\`tsx
import { HomeIcon } from "@/components/icons";
<HomeIcon className="size-4" />
\`\`\`

If \`components/icons/index.ts\` already exists in the project, MERGE the new exports into it rather than overwriting.`,
      inputSchema: z.object({
        libraryId: z.string().describe("Icon library ID from find-icon-library (e.g. 'tabler', 'phosphor')."),
        names: z.array(z.string()).min(1).describe("Icon names to install. May be bare (e.g. 'home') or prefixed (e.g. 'tabler:home')."),
        targetDir: z.string().optional().describe("Directory inside the project to write into. Defaults to 'components/icons'."),
        format: z.enum(["tsx", "svg"]).optional().describe("Output format. 'tsx' (default) generates React components; 'svg' generates raw .svg files."),
        variant: z.string().optional().describe("Optional library variant (e.g. 'outline', 'filled')."),
        context: CONTEXT_ARG,
      }),
      // Fetching Iconify SVGs and returning file text has no stored effect.
      // Any later host file write is a separate action. [BD-316]
      annotations: writeIcons ? WRITE_ICONS_ANNOTATIONS : READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS,
    },
    async ({ libraryId, names, targetDir, format, variant, context }) => tracked(
      "install-icons",
      { libraryId, count: names.length, format: format ?? "tsx", context },
      async () => {
        try {
          const dirResult = validateTargetDir(targetDir);
          if (!dirResult.ok) {
            return { content: [{ type: "text" as const, text: `Invalid targetDir: ${dirResult.error}` }] };
          }
          const dir = dirResult.dir;

          const library = await provider.getIconLibraryById(libraryId);
          if (!library) {
            return { content: [{ type: "text" as const, text: `Icon library '${libraryId}' not found. Call find-icon-library first.` }] };
          }
          const outFormat = format ?? "tsx";
          const prefix = library.prefix;

          const { generated, skipped, duplicates } = await generateIcons(library, names, dir, outFormat, variant);

          // An SVG body with a brace would become a JSX expression, so only
          // braceless icons are written without a person seeing them.
          let writeRefused: string | undefined;
          if (writeIcons && outFormat === "tsx" && generated.length > 0) {
            writeRefused = unsafeIconWrite(generated);
            if (!writeRefused) {
              try {
                return { content: [{ type: "text" as const, text: await saveIcons(writeIcons, {
                  dir,
                  libraryId: library.id,
                  libraryName: library.name,
                  prefix: library.prefix,
                  generated,
                  skipped,
                }) }] };
              } catch (err) {
                writeRefused = err instanceof Error ? err.message : "The icons could not be saved.";
              }
            }
          }

          const parts: string[] = [
            ...(writeRefused ? [`The server did not save these icons: ${writeRefused} Save them yourself.`, ""] : []),
            `# Install icons from ${library.name}`,
            "",
            "Write each file below to disk in the user's project. Then import via:",
            "",
            "```tsx",
            `import { HomeIcon } from "@/${dir}";`,
            `<HomeIcon className=\"size-4\" />`,
            "```",
            "",
            `If \`${dir}/index.ts\` already exists, **merge** the new exports into it instead of overwriting.`,
            "",
            `If \`${dir}/.library.json\` already exists, **merge** the new \`icons\` array into the existing one (set-union, sorted) and update \`installedAt\`. Do not overwrite the file blindly.`,
            "",
            "## Files",
            "",
          ];

          for (const file of generated) {
            parts.push(`<file path="${file.path}">`);
            parts.push(file.content.trimEnd());
            parts.push(`</file>`);
            parts.push("");
          }

          if (outFormat === "tsx" && generated.length > 0) {
            const barrel = buildBarrel(
              generated.map((f) => ({
                componentName: f.componentName,
                importPath: `./${f.stem}`,
              })),
              { libraryName: library.name, prefix: library.prefix },
            );
            parts.push(`<file path="${dir}/index.ts">`);
            parts.push(barrel.trimEnd());
            parts.push(`</file>`);
            parts.push("");
          }

          if (generated.length > 0) {
            const installedIcons = Array.from(
              new Set(generated.map((f) => f.stem)),
            ).sort();
            const manifest = {
              library: library.id,
              prefix: library.prefix,
              source: "iconify" as const,
              installedAt: new Date().toISOString(),
              icons: installedIcons,
            };
            parts.push(`<file path="${dir}/.library.json">`);
            parts.push(JSON.stringify(manifest, null, 2));
            parts.push(`</file>`);
            parts.push("");
          }

          if (skipped.length > 0) {
            parts.push("## Skipped (fetch failed)");
            parts.push("");
            for (const s of skipped) {
              parts.push(`- \`${s.name}\`: ${s.reason}`);
            }
            parts.push("");
          }

          if (duplicates.length > 0) {
            parts.push("## Duplicates (skipped)");
            parts.push("");
            parts.push("These names resolved to the same file stem or component name as an earlier entry:");
            parts.push("");
            for (const name of duplicates) {
              parts.push(`- \`${name}\``);
            }
            parts.push("");
          }

          if (generated.length === 0) {
            parts.push("");
            parts.push("No icons were generated. Check the icon names and try again.");
          }

          return { content: [{ type: "text" as const, text: parts.join("\n") }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : "Unknown error"}` }] };
        }
      },
    ),
  );

  server.registerTool(
    "detect-icon-library",
    {
      title: "Detect Existing Icon Library",
      description: `Check if the user's project already has an icon library installed via Better Design.

Reads <targetDir>/.library.json (default targetDir: "components/icons") if it exists and returns the locked library + installed icon list.

Call this BEFORE find-icon-library / install-icons. If a library is already locked, use it for any new icon work. Do NOT switch libraries mid-project.

Returns either:
- The locked library info + installed icon list, with a hint to call install-icons using that libraryId, OR
- A "no library detected" response, prompting the agent to call find-icon-library normally.`,
      inputSchema: z.object({
        manifestContent: z.string().optional()
          .describe("Contents of the project's components/icons/.library.json file, if it exists. The agent should attempt to read this file from disk and pass it here. If the file doesn't exist or can't be read, omit this field."),
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ manifestContent, context }) => tracked("detect-icon-library", { hasManifest: Boolean(manifestContent), context }, async () => {
      if (!manifestContent || !manifestContent.trim()) {
        return { content: [{ type: "text" as const, text: "No `.library.json` manifest found. Proceed by calling `find-icon-library` to pick a library, then `install-icons` to scaffold icons. The library you pick will be locked for subsequent installs." }] };
      }
      try {
        const parsed = JSON.parse(manifestContent);
        const lines = [
          `# Locked icon library: ${parsed.library ?? "(unknown)"}`,
          "",
          `- Prefix: \`${parsed.prefix ?? "?"}\``,
          `- Source: ${parsed.source ?? "?"}`,
          `- Installed at: ${parsed.installedAt ?? "?"}`,
          `- Already-installed icons: ${Array.isArray(parsed.icons) ? parsed.icons.length : 0}`,
          "",
          "**Use this library for any new icon work.** Call `install-icons` with `libraryId: \"" + (parsed.library ?? "") + "\"`. Do NOT pick a different library.",
        ];
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Failed to parse .library.json: ${err instanceof Error ? err.message : "unknown error"}\n\nProceed by calling \`find-icon-library\` to pick a library.` }] };
      }
    }),
  );
}
