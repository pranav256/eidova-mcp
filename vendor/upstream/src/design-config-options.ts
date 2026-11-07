// The choices a generated project's Modify controls offer, and how a project's
// icon set maps to the file that lists its icons. The web app's project page
// and the ChatGPT design panel both read the fonts, icon sets, radius range and
// icon set names from here. The web app draws its six color swatches by hand;
// MODIFY_COLOR_KEYS names the same six, in the same order, for the panel.

/** One font the Modify controls offer. */
export interface FontOption {
  value: string;
  label: string;
  category: "sans-serif" | "serif" | "monospace" | "display";
}

/** The fonts the Modify controls offer, grouped by category in this order. */
export const DESIGN_FONTS: FontOption[] = [
  // Sans-serif
  { value: "Inter", label: "Inter", category: "sans-serif" },
  { value: "Geist", label: "Geist", category: "sans-serif" },
  { value: "Roboto", label: "Roboto", category: "sans-serif" },
  { value: "Open Sans", label: "Open Sans", category: "sans-serif" },
  { value: "Lato", label: "Lato", category: "sans-serif" },
  { value: "Poppins", label: "Poppins", category: "sans-serif" },
  { value: "Montserrat", label: "Montserrat", category: "sans-serif" },
  { value: "Nunito", label: "Nunito", category: "sans-serif" },
  { value: "Raleway", label: "Raleway", category: "sans-serif" },
  { value: "Work Sans", label: "Work Sans", category: "sans-serif" },
  { value: "DM Sans", label: "DM Sans", category: "sans-serif" },
  { value: "Plus Jakarta Sans", label: "Plus Jakarta Sans", category: "sans-serif" },
  { value: "Manrope", label: "Manrope", category: "sans-serif" },
  { value: "Space Grotesk", label: "Space Grotesk", category: "sans-serif" },
  { value: "Outfit", label: "Outfit", category: "sans-serif" },
  { value: "Albert Sans", label: "Albert Sans", category: "sans-serif" },
  { value: "Figtree", label: "Figtree", category: "sans-serif" },
  { value: "Sora", label: "Sora", category: "sans-serif" },
  { value: "Instrument Sans", label: "Instrument Sans", category: "sans-serif" },
  { value: "General Sans", label: "General Sans", category: "sans-serif" },

  // Serif
  { value: "Merriweather", label: "Merriweather", category: "serif" },
  { value: "Playfair Display", label: "Playfair Display", category: "serif" },
  { value: "Lora", label: "Lora", category: "serif" },
  { value: "Source Serif 4", label: "Source Serif 4", category: "serif" },
  { value: "Crimson Text", label: "Crimson Text", category: "serif" },
  { value: "Libre Baskerville", label: "Libre Baskerville", category: "serif" },
  { value: "DM Serif Display", label: "DM Serif Display", category: "serif" },
  { value: "Fraunces", label: "Fraunces", category: "serif" },
  { value: "Instrument Serif", label: "Instrument Serif", category: "serif" },
  { value: "Georgia", label: "Georgia", category: "serif" },

  // Monospace
  { value: "DM Mono", label: "DM Mono", category: "monospace" },
  { value: "Fira Code", label: "Fira Code", category: "monospace" },
  { value: "Source Code Pro", label: "Source Code Pro", category: "monospace" },
  { value: "IBM Plex Mono", label: "IBM Plex Mono", category: "monospace" },
  { value: "Roboto Mono", label: "Roboto Mono", category: "monospace" },
  { value: "Space Mono", label: "Space Mono", category: "monospace" },
  { value: "Geist Mono", label: "Geist Mono", category: "monospace" },

  // Display
  { value: "Clash Display", label: "Clash Display", category: "display" },
  { value: "Satoshi", label: "Satoshi", category: "display" },
  { value: "Cabinet Grotesk", label: "Cabinet Grotesk", category: "display" },
  { value: "Bricolage Grotesque", label: "Bricolage Grotesque", category: "display" },
  { value: "Unbounded", label: "Unbounded", category: "display" },
  { value: "Syne", label: "Syne", category: "display" },
];

// Fonts the page already has, so they need no stylesheet.
const SYSTEM_FONTS = new Set(["Georgia", "Geist", "Geist Mono"]);

/** The stylesheet that loads a font, or null for a font the page already has. */
export function fontStylesheetUrl(fontName: string, weights = "400;500;600;700"): string | null {
  if (SYSTEM_FONTS.has(fontName)) return null;
  const encoded = fontName.replace(/\s+/g, "+");
  return `https://fonts.bunny.net/css2?family=${encoded}:wght@${weights}&display=swap`;
}

/** The icon libraries the Modify controls offer. */
export const ICON_LIBRARY_OPTIONS = [
  { value: "phosphor", label: "Phosphor" },
  { value: "lucide", label: "Lucide" },
  { value: "tabler", label: "Tabler" },
  { value: "heroicons", label: "Heroicons" },
] as const;

/** The Modify slider's corner radius range, in rem. */
export const RADIUS_RANGE = { min: 0, max: 1.5, step: 0.25 } as const;

/** The project colors the Modify controls show, in their order. */
export const MODIFY_COLOR_KEYS = ["primary", "secondary", "accent", "background", "foreground", "destructive"] as const;

// Project icon library ids whose icon set prefix differs from the id.
const ICON_LIBRARY_PREFIX = new Map([
  ["phosphor", "ph"],
  ["solar-icons", "solar"],
]);

// The style an icon set shows when the project names none.
const ICON_DEFAULT_VARIANTS = new Map([
  ["ant-design", "outlined"],
  ["carbon", "default"],
  ["feather", "default"],
  ["iconoir", "default"],
  ["mingcute", "line"],
  ["ph", "regular"],
  ["pixelarticons", "default"],
  ["solar", "linear"],
]);

/** The icon set prefix of a project's icon library id, such as `ph` for `phosphor`. */
export function iconSetPrefix(libraryId: string): string {
  return ICON_LIBRARY_PREFIX.get(libraryId) ?? libraryId;
}

/** The style an icon set shows when the project names none. */
export function defaultIconVariant(prefix: string): string {
  return ICON_DEFAULT_VARIANTS.get(prefix) ?? "default";
}

/**
 * The public file that lists a project's icons for browsing, under the web
 * app's origin. Only some sets have one; a missing file answers 404.
 */
export function iconPackPath(libraryId: string, variant: string | null): string {
  const prefix = iconSetPrefix(libraryId);
  return `/design-system-icons/${prefix}-${variant ?? defaultIconVariant(prefix)}.json`;
}
