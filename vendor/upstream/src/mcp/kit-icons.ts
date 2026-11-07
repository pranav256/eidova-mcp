/**
 * Installs a design system's everyday icons with the local kit install. A
 * local model never called the icon tools, so its screens had no icons; the
 * install now puts them in the project and the reply names them. [BD-1285]
 */

import type { DataProvider } from "./data-provider";
import { generateIcons, iconFilesToWrite, unsafeIconWrite } from "./icon-files";
import type { SelectedKitIcons } from "./selected-icon-handoff";
import type { WriteIcons } from "./write-icons";

// What an app screen most often shows an icon for, and the word the library
// search finds it by.
const EVERYDAY_ICONS: [use: string, query: string][] = [
  ["done", "check"],
  ["add", "plus"],
  ["close", "x"],
  ["back", "arrow-left"],
  ["next", "arrow-right"],
  ["date", "calendar"],
  ["time", "clock"],
  ["reminder", "bell"],
  ["search", "search"],
  ["settings", "settings"],
  ["profile", "user"],
  ["home", "home"],
  ["favourite", "star"],
  ["delete", "trash"],
  ["edit", "pencil"],
  ["morning", "sun"],
  ["evening", "moon"],
  ["water", "droplet"],
  ["reading", "book"],
  ["exercise", "dumbbell"],
];

const ICONS_DIR = "components/icons";

const NONE = { note: "", names: [] };

/**
 * Finds the everyday icons in the system's own library, writes them into the
 * project, and returns the component names and the lines that name them for
 * the kit reply. Returns no names and an empty note when the icons cannot be
 * found or saved, so the install itself never fails on icons.
 */
export async function installKitIcons(
  provider: DataProvider,
  writeIcons: WriteIcons,
  icons: SelectedKitIcons,
  projectDir: string,
): Promise<{ note: string; names: string[] }> {
  try {
    // The selection already names the library. The hosted provider looks a
    // library up by a semantic search that can miss it, so build it here.
    const library = { id: icons.id, name: icons.name ?? icons.id, prefix: icons.prefix, variants: null, defaultVariant: icons.variant, variantFormat: null };
    // "default" is no suffix: asking for it costs two failed fetches per icon.
    const variant = icons.variant === "default" ? undefined : icons.variant;
    const found = await Promise.all(EVERYDAY_ICONS.map(async ([use, query]) => {
      const [name] = await provider.searchIconsInLibrary(query, library, variant, 1);
      return name ? { use, name } : null;
    }));
    const picked = found.filter((icon) => icon !== null);
    const { generated } = await generateIcons(library, picked.map((icon) => icon.name), ICONS_DIR, "tsx", variant);
    if (generated.length === 0 || unsafeIconWrite(generated)) return NONE;
    const result = await writeIcons(
      iconFilesToWrite({ dir: ICONS_DIR, libraryId: library.id, libraryName: library.name, prefix: library.prefix, generated }),
      projectDir,
    );
    const uses = new Map(picked.map((icon) => [icon.name, icon.use]));
    const listed = generated.map((icon) => {
      const use = [...uses].find(([name]) => icon.path.endsWith(`/${name.split(":").pop()}.tsx`))?.[1];
      return use ? `${icon.componentName} (${use})` : icon.componentName;
    });
    const note = [
      `${generated.length} ${library.name} icons, the system's own, are installed in \`${result.dir}\`. Use them for every icon in the screen, and import them from \`@/components/icons\`, for example \`import { ${generated[0]?.componentName} } from "@/components/icons"\`. Never draw an SVG by hand or install an icon package; call \`install-icons\` with libraryId \`${library.id}\` for one not listed.`,
      `Icons: ${listed.join(", ")}.`,
    ].join("\n");
    return { note, names: generated.map((icon) => icon.componentName) };
  } catch (error) {
    // Icons are an extra: a failed search or write leaves the install as it was.
    console.warn(`Installing the kit's icons failed: ${error instanceof Error ? error.message : String(error)}`);
    return NONE;
  }
}
