// Reads a catalog design system's token stylesheet out of the public shadcn
// registry.
//
// It lived inside the MCP tools module, where only a tool could reach it. The
// v1 tokens endpoint serves the same bytes to the Figma plugin, so it moved
// here rather than being fetched a second way: a plugin that parsed the CSS
// itself would drift from this the first time a token shape changed. [BD-539]

import { z } from "zod";

import {
  componentDepthCss,
  componentRadiusCss,
  cssFromRegistryVars,
  extractFontCss,
  extractRadiusScaleCss,
  extractShadowScaleCss,
} from "./preview-html";
import { REGISTRY_BASE_URL } from "./tools/shared";

/** One file inside a registry item: a path and its source. */
export type RegistryFile = { path?: string; content?: string };

/** Published install entries split so visual coverage never counts globals or runtime helpers. */
export interface CatalogInventory {
  components: string[];
  foundations: string[];
}

/** The slice of a shadcn registry item this reads: its tokens and its files. */
export const REGISTRY_ITEM_SCHEMA = z.object({
  cssVars: z
    .object({
      light: z.record(z.string(), z.string()).optional(),
      dark: z.record(z.string(), z.string()).optional(),
      theme: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  files: z.array(z.object({ path: z.string().optional(), content: z.string().optional() })).optional(),
});

const REGISTRY_ALL_SCHEMA = z.object({
  registryDependencies: z.array(z.string()),
});

const FOUNDATION_ENTRY = /^(?:_shared|globals|utils|use-.+|.+-utils|sonner|toaster|sound-provider|haptics-provider|stagger-fade-in)$/;

/** Turns an `all.json` install graph into visual assets and non-visual support files. */
export function inventoryFromRegistryDependencies(dependencies: string[]): CatalogInventory {
  const inventory: CatalogInventory = { components: [], foundations: [] };
  for (const dependency of dependencies) {
    const name = dependency.split("/").at(-1)?.replace(/\.json$/, "");
    if (!name) continue;
    (FOUNDATION_ENTRY.test(name) ? inventory.foundations : inventory.components).push(name);
  }
  return inventory;
}

/**
 * Token stylesheet for the DS preview from a shadcn registry payload: parsed
 * cssVars give the color/radius/shadow tokens; the raw globals.css inside
 * `files` supplies the `--font-*` vars + the Google Fonts import that the
 * parsed vars never carry (see extractFontCss). [BD-84]
 */
export function tokensCssFromRegistry(json: {
  cssVars?: { light?: Record<string, string>; dark?: Record<string, string>; theme?: Record<string, string> };
  files?: RegistryFile[];
  meta?: { globalsCss?: string };
}): string {
  const files = json.files ?? [];
  const vars = json.cssVars ? cssFromRegistryVars(json.cssVars) : "";
  // Generated-project registries don't ship globals.css as a file (it is
  // parsed into cssVars); the raw source rides in meta.globalsCss instead so
  // the preview keeps the project's fonts + radius scale. [BD-86]
  const globals =
    files.find((f) => f.path?.endsWith("globals.css"))?.content ?? json.meta?.globalsCss ?? "";
  const { fontVars, fontImport } = extractFontCss(globals);
  return [
    fontImport,
    vars,
    fontVars,
    extractRadiusScaleCss(globals),
    extractShadowScaleCss(globals),
    componentRadiusCss(files),
    componentDepthCss(files),
  ]
    .filter(Boolean)
    .join("\n");
}

// Components fetched for the catalog HTML kit: tokens come from globals, real
// component material (radius/depth/fill) is extracted from these sources. [BD-149]
const CATALOG_KIT_COMPONENTS = ["button", "input", "card", "badge", "switch"];

/** The registry payload for a catalog system: its token CSS and its files. */
export async function fetchCatalog(
  designSystemId: string,
  options: { includeInventory?: boolean } = {},
): Promise<{ tokensCss: string; files: RegistryFile[]; inventory: CatalogInventory }> {
  try {
    const [globalsRes, allRes, ...componentResults] = await Promise.all([
      fetch(`${REGISTRY_BASE_URL}/${designSystemId}/globals.json`),
      options.includeInventory
        ? fetch(`${REGISTRY_BASE_URL}/${designSystemId}/all.json`).catch((err) => {
            console.warn(`catalog inventory fetch failed: ${designSystemId}`, err);
            return null;
          })
        : null,
      ...CATALOG_KIT_COMPONENTS.map((c) =>
        fetch(`${REGISTRY_BASE_URL}/${designSystemId}/${c}.json`).catch((err) => {
          // A dropped component silently thins the kit the user gets, so name
          // it here; the outer catch never sees this failure.
          console.warn(`catalog component fetch failed: ${designSystemId}/${c}`, err);
          return null;
        }),
      ),
    ]);
    if (!globalsRes.ok) return { tokensCss: "", files: [], inventory: { components: [], foundations: [] } };
    const globals = REGISTRY_ITEM_SCHEMA.safeParse(await globalsRes.json());
    if (!globals.success) return { tokensCss: "", files: [], inventory: { components: [], foundations: [] } };
    const all = allRes?.ok
      ? REGISTRY_ALL_SCHEMA.safeParse(await allRes.json().catch(() => null))
      : null;
    const inventory = all?.success
      ? inventoryFromRegistryDependencies(all.data.registryDependencies)
      : { components: [], foundations: [] };
    const files = [...(globals.data.files ?? [])];
    for (const [i, res] of componentResults.entries()) {
      if (!res) continue;
      if (!res.ok) {
        console.warn(
          `catalog component unavailable: ${designSystemId}/${CATALOG_KIT_COMPONENTS[i]} (HTTP ${res.status})`,
        );
        continue;
      }
      const item = REGISTRY_ITEM_SCHEMA.safeParse(await res.json().catch(() => null));
      if (item.success && item.data.files) files.push(...item.data.files);
    }
    return { tokensCss: tokensCssFromRegistry({ cssVars: globals.data.cssVars, files }), files, inventory };
  } catch (error) {
    // A registry outage would silently produce an empty kit for the user, so
    // log it; the empty result still lets callers degrade gracefully.
    console.warn(`catalog registry fetch failed for ${designSystemId}`, error);
    return { tokensCss: "", files: [], inventory: { components: [], foundations: [] } };
  }
}

/** Just the token stylesheet, for callers that do not need the component files. */
export async function fetchCatalogTokensCss(designSystemId: string): Promise<string> {
  return (await fetchCatalog(designSystemId)).tokensCss;
}
