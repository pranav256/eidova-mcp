import { z } from "zod";
import type { DesignSystemIconPresentation } from "../design-systems/presentation";

import { mirrorSingleTheme, parseCssVars } from "../registry-css";
import {
  buildDsComponentCss,
  componentDepthCss,
  componentRadiusCss,
  cssFromRegistryVars,
  extractFontCss,
  extractRadiusScaleCss,
  extractShadowScaleCss,
} from "./preview-html";
import { buildDsShopifyFiles } from "./shopify-kit";
import { buildShopifyAccordionAdapter } from "./shopify-accordion";
import { hasShopifyDisclosureIcon } from "./shopify-icons";

export const SHOPIFY_PRIMITIVE_CONTRACT_VERSION = 1 as const;
/** Additive material version; old clients can still read the outer v1 payload. */
export const SHOPIFY_ICON_MATERIAL_VERSION = 2 as const;

/**
 * The API error code for a caller outside the Shopify pilot. The stdio client
 * reads it to tell "no grant" apart from "no stored theme". [BD-417]
 */
export const SHOPIFY_PILOT_REQUIRED = "SHOPIFY_PILOT_REQUIRED";
export { projectShopifyIcons } from "./shopify-icons";

const shopifyThemeFileSchema = z.object({
  path: z.string().min(1),
  content: z.string().min(1),
});

const primitiveFields = {
  tokensCss: z.string().min(1),
  componentMaterialCss: z.string(),
  coveredSourcePrimitives: z.array(z.string()),
  sourcePrimitivesWithShopifyAdapters: z.array(z.string()),
  themeFiles: z.array(shopifyThemeFileSchema).min(1),
};

const iconLibrarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  prefix: z.string().min(1),
  variant: z.string().min(1),
  provenance: z.enum(["explicit", "iconify-source", "fallback"]),
  conflict: z.object({ declared: z.string(), detected: z.string() }).optional(),
});

const currentShopifyPrimitiveSetSchema = z.object({
  ...primitiveFields,
  contractVersion: z.literal(SHOPIFY_PRIMITIVE_CONTRACT_VERSION),
  iconMaterialVersion: z.literal(SHOPIFY_ICON_MATERIAL_VERSION),
  iconLibrary: iconLibrarySchema,
});

/** Legacy payloads remain readable, but carry no verified icon selection. */
export const shopifyPrimitiveSetSchema = z.union([
  currentShopifyPrimitiveSetSchema,
  z.object({ ...primitiveFields, contractVersion: z.literal(1), iconMaterialVersion: z.undefined().optional(), iconLibrary: z.undefined().optional() }),
]);

export type ShopifyPrimitiveSet = z.infer<typeof shopifyPrimitiveSetSchema>;

export interface ShopifyPrimitiveSourceFile {
  path: string;
  content: string;
}

const localImport = /(^|\n)(\s*import\s*\{([^}]*)\}\s*from\s*["']\.\.?\/[^"']+["'];?)/g;

function exportedStringConstants(
  files: ShopifyPrimitiveSourceFile[],
): Map<string, string> {
  const constants = new Map<string, string>();
  const declaration = /export\s+const\s+([A-Za-z_$][\w$]*)(?:\s*:[^=;]+)?\s*=\s*([\s\S]*?);/g;
  const literal = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;

  for (const { content } of files) {
    for (const match of content.matchAll(declaration)) {
      const expression = match[2] ?? "";
      const values = [...expression.matchAll(literal)].map((part) =>
        (part[1] ?? part[2] ?? "").replace(/\\([\\"'])/g, "$1"),
      );
      const residue = expression.replace(literal, "").replace(/\+/g, "").trim();
      if (values.length && !residue) constants.set(match[1], values.join(""));
    }
  }
  return constants;
}

function importedMaterialNames(
  content: string,
  constants: Map<string, string>,
): Set<string> {
  const names = new Set<string>();
  for (const match of content.matchAll(localImport)) {
    for (const item of (match[3] ?? "").split(",")) {
      const imported = item.trim().split(/\s+as\s+/)[0];
      if (imported && constants.has(imported)) names.add(imported);
    }
  }
  return names;
}

function replaceMaterialNames(
  source: string,
  names: Set<string>,
  constants: Map<string, string>,
): string {
  let result = source;
  for (const name of names) {
    result = result.replace(
      new RegExp(`\\b${name.replace(/[$]/g, "\\$")}\\b`, "g"),
      JSON.stringify(constants.get(name)),
    );
  }
  return result;
}

function materializeFile(
  file: ShopifyPrimitiveSourceFile,
  constants: Map<string, string>,
): ShopifyPrimitiveSourceFile {
  const names = importedMaterialNames(file.content, constants);
  if (!names.size) return file;

  let cursor = 0;
  let content = "";
  for (const match of file.content.matchAll(localImport)) {
    content += replaceMaterialNames(file.content.slice(cursor, match.index), names, constants);
    content += match[0];
    cursor = (match.index ?? 0) + match[0].length;
  }
  content += replaceMaterialNames(file.content.slice(cursor), names, constants);
  return { ...file, content };
}

/**
 * Catalog components often keep their material recipes in `_shared.ts` and
 * reference them from `cn(...)`. Materialize those imported string constants
 * before compilation so the stored Shopify implementation never silently
 * loses the canonical button/card/field treatment. [BD-385]
 */
function materializeImportedMaterial(
  files: ShopifyPrimitiveSourceFile[],
): ShopifyPrimitiveSourceFile[] {
  const constants = exportedStringConstants(files);
  if (!constants.size) return files;
  return files.map((file) => materializeFile(file, constants));
}

function globalsSource(files: ShopifyPrimitiveSourceFile[]): string {
  return (
    files.find(({ path }) => /(^|\/)globals\.css$/.test(path))?.content ?? ""
  );
}

/**
 * The system's hand-written stand-in for an effect its React components draw
 * at runtime, which no extraction step can reach. [BD-444]
 */
export function staticKitSource(files: ShopifyPrimitiveSourceFile[]): string {
  return (
    files.find(({ path }) => /(^|\/)static-kit\.css$/.test(path))?.content.trim() ?? ""
  );
}

/**
 * Build the token sheet once, at persistence time. Shopify consumers must not
 * reconstruct a design system from React source at request time. [BD-385]
 */
export function buildShopifyTokensCss(
  files: ShopifyPrimitiveSourceFile[],
): string {
  const globals = globalsSource(files);
  if (!globals.trim()) {
    throw new Error("Shopify primitives require a globals.css token source");
  }

  const vars = mirrorSingleTheme(parseCssVars(globals));
  const { fontVars, fontImport } = extractFontCss(globals);
  return [
    fontImport,
    cssFromRegistryVars(vars),
    fontVars,
    extractRadiusScaleCss(globals),
    extractShadowScaleCss(globals),
    componentRadiusCss(files),
    componentDepthCss(files),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Compile the maintained Shopify representation that is stored on a catalog
 * design system or generated project. Runtime MCP calls only read this payload.
 */
export function buildShopifyPrimitiveSet(
  files: ShopifyPrimitiveSourceFile[],
  iconLibrary: DesignSystemIconPresentation,
): z.infer<typeof currentShopifyPrimitiveSetSchema> {
  const materializedFiles = materializeImportedMaterial(files);
  const tokensCss = buildShopifyTokensCss(materializedFiles);
  const componentKit = buildDsComponentCss(materializedFiles);
  // A system whose signature is drawn by React at runtime declares a static
  // stand-in in static-kit.css. It is appended after the extracted component
  // material so it can override it, and it is the last thing in the sheet so
  // an author can reason about specificity by reading their own file. [BD-444]
  const staticKitCss = staticKitSource(materializedFiles);
  const material = staticKitCss
    ? { ...componentKit, css: `${componentKit.css}\n${staticKitCss}` }
    : componentKit;
  const accordionSource = materializedFiles.find(({ path }) => /(^|\/)accordion\.tsx$/.test(path))?.content ?? "";
  const accordion = hasShopifyDisclosureIcon(iconLibrary) ? buildShopifyAccordionAdapter(accordionSource) : null;
  const themeFiles = buildDsShopifyFiles({ tokensCss, componentKit: material, iconLibrary, accordion });

  return currentShopifyPrimitiveSetSchema.parse({
    contractVersion: SHOPIFY_PRIMITIVE_CONTRACT_VERSION,
    iconMaterialVersion: SHOPIFY_ICON_MATERIAL_VERSION,
    iconLibrary,
    tokensCss,
    componentMaterialCss: material.css,
    coveredSourcePrimitives: componentKit.covered,
    sourcePrimitivesWithShopifyAdapters: componentKit.excluded,
    themeFiles,
  });
}

/** Validates a stored value against the Shopify primitive set schema. */
export function parseShopifyPrimitiveSet<TValue>(
  value: TValue,
): ShopifyPrimitiveSet | null {
  const parsed = shopifyPrimitiveSetSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
