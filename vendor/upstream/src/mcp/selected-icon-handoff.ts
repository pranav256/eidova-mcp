import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CATALOG_ICON_LIBRARY_ASSIGNMENTS, resolveDesignSystemIcons } from "../design-systems/presentation";
import type { DataProvider, DesignSystemMetadata } from "./data-provider";

/** Exact icon identity shared by registry metadata and kit handoffs. */
export const selectedIconSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  prefix: z.string().min(1),
  variant: z.string().min(1),
});

/** Selected family and variant, not evidence that rendered icons were reviewed. */
export type SelectedKitIcons = z.infer<typeof selectedIconSchema>;

/** Read the existing catalog assignment without inventing a fallback selection. */
export async function catalogKitIcons(metadata: DesignSystemMetadata, provider: DataProvider): Promise<SelectedKitIcons | undefined> {
  if (CATALOG_ICON_LIBRARY_ASSIGNMENTS[metadata.id]) return resolveDesignSystemIcons({ id: metadata.id });
  if (!metadata.iconLibraryId) return undefined;
  const library = await provider.getIconLibraryById(metadata.iconLibraryId);
  if (!library) return undefined;
  const variant = metadata.iconVariant ?? library.defaultVariant;
  if (!variant) return undefined;
  return { id: library.id, name: library.name, prefix: library.prefix, variant };
}

/** Explain how to reuse the selection without guessing names or switching packs. */
export function selectedIconInstructions(icons?: SelectedKitIcons): string {
  if (!icons) return "The selected icon family and variant are unverified in this kit. Read the existing design-system assignment before adding icons. Do not substitute a pack or claim the icons match. Report missing selection or material explicitly.";
  return `This design system already selects ${icons.name ?? icons.id} (${icons.variant}). Do not call \`find-icon-library\` or choose a substitute. Call \`find-icons\` with \`libraryId: ${JSON.stringify(icons.id)}\` and \`variant: ${JSON.stringify(icons.variant)}\` for each needed concept, then use the exact returned names and source. Preserve the family, variant, viewBox, fill, stroke, and duotone opacity. If exact material is unavailable, report it; do not guess slugs or draw replacement SVGs.`;
}

/** Carry selected icons in text and structured output for every build host. */
export function withSelectedKitIcons(result: CallToolResult, icons?: SelectedKitIcons): CallToolResult {
  if (result.structuredContent?.status !== "completed") return result;
  const selection = icons ? selectedIconSchema.parse(icons) : undefined;
  const iconInstructions = selectedIconInstructions(icons);
  return {
    ...result,
    content: result.content.map((entry) => entry.type === "text" ? { ...entry, text: `${iconInstructions}\n\n${entry.text}` } : entry),
    structuredContent: {
      ...result.structuredContent,
      ...(selection && { iconLibrary: selection }),
      iconSelectionStatus: icons ? "selected" : "unverified",
      iconInstructions,
    },
  };
}
