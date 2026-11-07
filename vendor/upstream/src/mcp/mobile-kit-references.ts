/**
 * Reference screens a mobile kit brings with it: screens from shipped apps for
 * the screen the agent names, read from the corpus. [BD-1349]
 */

import { describeSet, type ReadInspiration } from "./inspiration";

// Words a kit request carries that name the platform, the style or the act of
// building, not the screen. Left in, "home" alone pulled a property listing
// into a habit tracker's references. [BD-1349]
const KIT_QUERY_NOISE = new Set([
  "building", "build", "builds", "swiftui", "react", "native", "expo", "ios", "iphone", "ipad", "android", "app", "apps",
  "screen", "screens", "view", "views", "home", "page", "modern", "liquid", "glass", "style", "using", "kit", "design",
  "system", "the", "and", "for", "with", "that", "this", "from", "into",
]);
const REFERENCE_SETS = 2;
// Each screenshot stays in context for the rest of the build, so three show the
// pattern without paying for six on every later turn. [BD-1359]
const MAX_REFERENCE_IMAGES = 3;
/** The line that tells the agent what the reference images are. */
export const REFERENCES_LINE = (query: string) => `The images in this reply are screens from shipped apps for "${query}". Before you compose, note what they do with state, colour per item and the done state. Build the user's screen from that, in this kit's tokens.`;
const REFERENCE_TIMEOUT_MS = 8_000;
/** One block of a kit reply: text or an image. */
export type KitContentBlock = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

/** The few words of a kit request that name the screen, for the corpus search. Empty when none do. */
export function screenQuery(text: string | undefined): string {
  const words = (text ?? "").toLowerCase().match(/[a-z]+/g) ?? [];
  return [...new Set(words.filter((word) => word.length >= 3 && !KIT_QUERY_NOISE.has(word)))].slice(0, 4).join(" ");
}

/**
 * Reference screens from shipped apps, read from the corpus for the screen the
 * agent names. Agents almost never call get-inspiration on their own, so the
 * kit brings the references with it. A failed or slow read costs the kit
 * nothing. [BD-1349]
 */
export async function referenceScreens(readInspiration: ReadInspiration | undefined, screen: string | undefined): Promise<KitContentBlock[]> {
  const query = screenQuery(screen);
  if (!readInspiration || !query) return [];
  try {
    const result = await Promise.race([
      readInspiration({ type: "app-screens", platform: "ios", query, limit: REFERENCE_SETS }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), REFERENCE_TIMEOUT_MS)),
    ]);
    if (!result || result.type === "html-flows" || result.sets.length === 0) return [];
    // Every set shows at least one screen before any set shows a second.
    const perSet = Math.max(1, Math.floor(MAX_REFERENCE_IMAGES / result.sets.length));
    let left = MAX_REFERENCE_IMAGES;
    return [
      { type: "text" as const, text: `## How shipped apps built this screen\n\n${REFERENCES_LINE(query)}` },
      ...result.sets.flatMap((set, i) => {
        const take = Math.min(left, i === result.sets.length - 1 ? left : perSet);
        left -= take;
        return [
          { type: "text" as const, text: describeSet(set) },
          ...set.images.slice(0, take).map((image) => ({ type: "image" as const, data: image.data, mimeType: image.mimeType })),
        ];
      }),
    ];
  } catch {
    return [];
  }
}
