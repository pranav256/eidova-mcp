import { z } from "zod";
import type { HtmlFlowResult } from "./html-flows";

/**
 * The reference collections `get-inspiration` can return. A collection joins
 * this list once the corpus bucket or the database holds it with an index.
 * `app-screens` finds product screens by flow name, and `html-flows` reads
 * flows rebuilt as HTML from the `ux_flow_library` table. [BD-966, BD-1114]
 */
export const INSPIRATION_TYPES = ["app-store-screenshots", "app-screens", "html-flows"] as const;

/** One reference collection. */
export type InspirationType = (typeof INSPIRATION_TYPES)[number];

/** The collections that arrive as images read from the corpus bucket. */
export type ImageInspirationType = Exclude<InspirationType, "html-flows">;

/** The platforms `app-screens` can narrow to, as named by the `apps/<platform>/` folders. */
export const INSPIRATION_PLATFORMS = ["ios", "android", "web"] as const;

/** One platform `app-screens` can narrow to. */
export type InspirationPlatform = (typeof INSPIRATION_PLATFORMS)[number];

/** The corpus index of every app's flows, which `app-screens` searches. [BD-1114] */
export const APP_FLOWS_INDEX_KEY = "_manifests/app-flows-latest.json";

/** The most query words a search uses. More words narrow nothing useful. */
export const MAX_QUERY_WORDS = 6;

// "in", "of" and "to" sit inside most flow names, and every app name ends in
// "web", so none of them narrows a search.
const IGNORED_WORDS = new Set(["web", "the", "and", "for", "with"]);

/**
 * Splits a query into lowercase words of letters and digits. Only those
 * characters survive, so a word can never carry a SQL pattern character.
 */
export function queryWords(query: string | undefined): string[] {
  const words = (query ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const useful = words.filter((word) => word.length >= 3 && !IGNORED_WORDS.has(word));
  return [...new Set(useful)].slice(0, MAX_QUERY_WORDS);
}

/** True when a query word starts one of the hyphen-separated words of `name`, so "setting" finds "account-settings". */
export function nameMatches(name: string, word: string): boolean {
  return name.toLowerCase().split(/[^a-z0-9]+/).some((part) => part.startsWith(word));
}

/** Sets sent when the caller names no limit. A few sets keep the reply light. */
export const DEFAULT_INSPIRATION_LIMIT = 3;

/** The most sets one call sends, whatever limit the caller asks for. */
export const MAX_INSPIRATION_LIMIT = 6;

/** Stills sent per set. A listing tells its story in its first slides, so those go first. */
export const IMAGES_PER_SET = 3;

/**
 * Characters of base64 image data one call may carry, so a few heavy files
 * cannot swell it. It counts the encoded text, because that is what the reply
 * sends. A batch of calls in one request is not bounded here (BD-968).
 */
export const INSPIRATION_BYTE_BUDGET = 2_500_000;

/** The index file in the corpus bucket that lists each collection's sets and keys. */
export const INSPIRATION_INDEX_KEYS = {
  "app-store-screenshots": "_manifests/app-store-screenshots-latest.json",
} as const;

/**
 * The notes file for each collection: our own words on each set, written once
 * by `packages/server/scripts/write-inspiration-notes.ts`. [BD-966]
 */
export const INSPIRATION_NOTES_KEYS = {
  "app-store-screenshots": "_manifests/app-store-screenshots-notes-latest.json",
} as const;

const noteSchema = z.object({
  slug: z.string(),
  /** The day the note was written, as YYYY-MM-DD. A listing can change after it. */
  writtenAt: z.string(),
  headline: z.string(),
  order: z.string(),
  framing: z.string(),
  color: z.string(),
});

/** The notes file: the model that wrote it and one note per set. */
export const inspirationNotesFileSchema = z.object({
  model: z.string(),
  notes: z.array(noteSchema),
});

/** Our notes on one set: how its headlines, slide order, framing and color sell the app. */
export type InspirationNote = z.infer<typeof noteSchema>;

/** The whole notes file, as the job writes it and the reader parses it. */
export type InspirationNotesFile = z.infer<typeof inspirationNotesFileSchema>;

const indexFileSchema = z.object({
  key: z.string(),
  type: z.string(),
  width: z.number(),
  height: z.number(),
});

const indexEntrySchema = z.object({
  title: z.string(),
  slug: z.string(),
  category: z.string().nullish(),
  files: z.array(indexFileSchema),
});

/** A collection's index file, as the corpus ingest writes it. */
export const inspirationIndexSchema = z.object({
  entries: z.array(indexEntrySchema),
});

/** A collection's index file, parsed: every set and the bucket keys of its files. */
export type InspirationIndex = z.infer<typeof inspirationIndexSchema>;

/** What the caller asks for: a collection, and optionally a category and a count. */
export interface InspirationRequest {
  type: InspirationType;
  /** For `app-store-screenshots` only: the App Store category, matched ignoring case and outer spaces. */
  category?: string;
  /** For `app-screens` only: keep the screens of one platform. */
  platform?: InspirationPlatform;
  /** For `app-screens` and `html-flows`: words matched against flow names. */
  query?: string;
  /** Number of sets, clamped to 1 through `MAX_INSPIRATION_LIMIT`. */
  limit?: number;
}

/** The image types a still can have, read from its key's extension. */
export type InspirationMimeType = "image/webp" | "image/png" | "image/jpeg";

/** One still from the bucket, ready to send as MCP image content. */
export interface InspirationImage {
  key: string;
  mimeType: InspirationMimeType;
  /** Known for App Store sets; the flow index does not record it. */
  width?: number;
  height?: number;
  /** The image bytes, base64 encoded. */
  data: string;
}

/** One app's store screenshot set. */
export interface InspirationSet {
  title: string;
  slug: string;
  category: string | null;
  images: InspirationImage[];
  /** Our notes on the set, or null when none have been written for it. */
  notes: InspirationNote | null;
}

/** The image sets that matched, and every category the collection holds. */
export interface ImageInspirationResult {
  type: ImageInspirationType;
  categories: string[];
  sets: InspirationSet[];
}

/** What one call returns: image sets from the bucket, or HTML flows from the database. */
export type InspirationResult = ImageInspirationResult | HtmlFlowResult;

/** Reads a collection. The Worker reads its bucket; the stdio client calls the API. */
export type ReadInspiration = (request: InspirationRequest) => Promise<InspirationResult>;

/** The part of an R2 object this module reads: its size, known before its body loads. */
export interface InspirationObject {
  /** The object's size in bytes. */
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  /** Present on a real R2 object; cancelled when the object is skipped unread. */
  body?: { cancel(): Promise<void> };
}

/** The part of an R2 bucket this module reads. */
export interface InspirationBucket {
  get(key: string): Promise<InspirationObject | null>;
}

interface PlannedStill {
  key: string;
  width?: number;
  height?: number;
}

interface PlannedSet {
  title: string;
  slug: string;
  category: string | null;
  stills: PlannedStill[];
}

/** The sets and stills a request resolves to, before any image is read. */
export interface InspirationPlan {
  categories: string[];
  sets: PlannedSet[];
}

/**
 * A still is a webp image or a video's poster inside the collection's own
 * folder. The clip itself never goes out, and a key that climbs out of the
 * folder never gets read, whatever the index file says.
 */
function isStill(file: z.infer<typeof indexFileSchema>): boolean {
  return (
    (file.type === "image" || file.type === "poster") &&
    file.key.startsWith("app-store-screenshots/") &&
    file.key.endsWith(".webp") &&
    !file.key.split("/").some((part) => part === ".." || part === ".")
  );
}

/** Clamps a requested count to 1 through `max`, with `fallback` when none is given. */
export function clampLimit(limit: number | undefined, max = MAX_INSPIRATION_LIMIT, fallback = DEFAULT_INSPIRATION_LIMIT): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(limit)));
}

/**
 * Resolves a request against a collection's index file: which sets, in index
 * order, and which of their stills. Pure, so the Worker route and the tool
 * pick exactly the same keys.
 */
export function planInspiration({ entries }: InspirationIndex, request: InspirationRequest): InspirationPlan {
  const wanted = request.category?.trim().toLowerCase();
  const categories = [...new Set(entries.flatMap((e) => (e.category ? [e.category] : [])))].sort();
  const matching = wanted ? entries.filter((e) => e.category?.trim().toLowerCase() === wanted) : entries;

  // A set with no still to send is dropped before the limit, so it never takes
  // the place of a set that has screenshots.
  const sets = matching
    .map((entry) => ({
      title: entry.title,
      slug: entry.slug,
      category: entry.category ?? null,
      stills: entry.files
        .filter((file) => isStill(file))
        .slice(0, IMAGES_PER_SET)
        .map(({ key, width, height }) => ({ key, width, height })),
    }))
    .filter((planned) => planned.stills.length > 0)
    .slice(0, clampLimit(request.limit));

  return { categories, sets };
}

const FLOW_ENTRY = z.tuple([z.string(), z.number()]).rest(z.string());

/**
 * The corpus flow index that `app-screens` searches: each app folder, and each
 * flow in it as `[flow, screen count, ...first screens]`. Written by
 * `packages/server/scripts/build-app-flows-index.ts`. [BD-1114]
 */
export const appFlowsIndexSchema = z.object({
  createdAt: z.string(),
  apps: z.array(z.object({ folder: z.string(), flows: z.array(FLOW_ENTRY) })),
});

/** The flow index, parsed. */
export type AppFlowsIndex = z.infer<typeof appFlowsIndexSchema>;

const SCREEN_EXTENSIONS = new Map<string, InspirationMimeType>([
  ["webp", "image/webp"],
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
]);

/** The image type of a key, from its extension, or null for any other file. */
export function stillMimeType(key: string): InspirationMimeType | null {
  return SCREEN_EXTENSIONS.get(key.slice(key.lastIndexOf(".") + 1).toLowerCase()) ?? null;
}

const unsafePart = (part: string) => part === "" || part === ".." || part === ".";

/**
 * The platform of an app folder, `apps/<platform>/<app>`, or null when the
 * folder is anything else. A folder that climbs out of `apps/` is never read,
 * whatever the index says.
 */
function folderPlatform(folder: string): string | null {
  const parts = folder.split("/");
  return parts.length === 3 && parts[0] === "apps" && !parts.some(unsafePart) ? parts[1] : null;
}

/** "google-calendar" reads as "Google Calendar". */
function titleOf(slug: string): string {
  return slug.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

interface FlowMatch {
  folder: string;
  platform: string;
  flow: string;
  count: number;
  files: string[];
  score: number;
}

/** The flow in one app that matches the most query words, more screens breaking a tie. */
function bestFlow(app: AppFlowsIndex["apps"][number], platform: string, words: string[]): FlowMatch | null {
  let best: FlowMatch | null = null;
  for (const [flow, count, ...files] of app.flows) {
    const score = words.filter((word) => nameMatches(flow, word)).length;
    if (score === 0) continue;
    if (!best || score > best.score || (score === best.score && count > best.count)) {
      best = { folder: app.folder, platform, flow, count, files, score };
    }
  }
  return best;
}

/**
 * Resolves an `app-screens` request against the flow index: for each app, the
 * flow whose name matches the most query words, then one set per app, best
 * matches first and more screens breaking a tie. Pure, like
 * `planInspiration`. [BD-1114]
 */
export function planAppScreens({ apps }: AppFlowsIndex, request: InspirationRequest): InspirationPlan {
  const words = queryWords(request.query);
  const matches: FlowMatch[] = [];
  for (const app of apps) {
    const platform = folderPlatform(app.folder);
    if (!platform || (request.platform && platform !== request.platform)) continue;
    const match = words.length > 0 ? bestFlow(app, platform, words) : null;
    if (match) matches.push(match);
  }

  // A stable sort keeps index order among equal matches. A set with no
  // readable screen is dropped before the limit, so it never takes a place.
  const sets = matches
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .map((match) => ({
      title: `${titleOf(match.folder.split("/")[2])}: ${titleOf(match.flow).toLowerCase()}`,
      slug: `${match.folder}/${match.flow}`,
      category: match.platform,
      stills: match.files
        .filter((file) => !file.includes("/") && !unsafePart(file) && stillMimeType(file))
        .slice(0, IMAGES_PER_SET)
        .map((file) => ({ key: `${match.folder}/${file}` })),
    }))
    .filter((planned) => planned.stills.length > 0)
    .slice(0, clampLimit(request.limit));

  return { categories: [], sets };
}

// How long a Worker isolate keeps a parsed index file before it reads the bucket again.
const INDEX_CACHE_MS = 10 * 60 * 1000;

interface CachedIndex {
  at: number;
  schema: z.ZodType<unknown>;
  value: unknown;
}

// Parsed index files, per bucket and key. The flow index runs to megabytes, so
// parsing it on every call would spend the Worker's CPU on the same work.
const indexCache = new WeakMap<InspirationBucket, Map<string, CachedIndex>>();

/** Reads a JSON index file from the bucket and parses it with `schema`, reusing a recent parse by the same schema. */
export async function readIndexFile<T>(bucket: InspirationBucket, key: string, schema: z.ZodType<T>): Promise<T> {
  const cached = indexCache.get(bucket)?.get(key);
  if (cached && cached.schema === schema && Date.now() - cached.at < INDEX_CACHE_MS) {
    // SAFETY: the entry was written below from `schema.parse`, and the check above proves the same schema wrote it.
    return cached.value as T;
  }
  const object = await bucket.get(key);
  // The message stays generic: it reaches the caller, and the key is internal.
  if (!object) throw new Error("The inspiration library index is missing.");
  const value = schema.parse(JSON.parse(new TextDecoder().decode(await object.arrayBuffer())));
  const entries = indexCache.get(bucket) ?? new Map<string, CachedIndex>();
  entries.set(key, { at: Date.now(), schema, value });
  indexCache.set(bucket, entries);
  return value;
}

/** Plans an image request from its collection's index, with notes where the collection has them. */
async function planFromBucket(
  bucket: InspirationBucket,
  request: InspirationRequest,
): Promise<{ plan: InspirationPlan; notes: Map<string, InspirationNote> }> {
  if (request.type === "app-screens") {
    const index = await readIndexFile(bucket, APP_FLOWS_INDEX_KEY, appFlowsIndexSchema);
    return { plan: planAppScreens(index, request), notes: new Map() };
  }
  const [index, notes] = await Promise.all([
    readIndexFile(bucket, INSPIRATION_INDEX_KEYS["app-store-screenshots"], inspirationIndexSchema),
    readNotes(bucket),
  ]);
  return { plan: planInspiration(index, request), notes };
}

/**
 * Reads the collection's notes file, keyed by slug. Notes are an extra, so a
 * missing file gives no notes, and an unreadable one gives no notes and a
 * warning, while the sets still go out.
 */
async function readNotes(bucket: InspirationBucket): Promise<Map<string, InspirationNote>> {
  try {
    const object = await bucket.get(INSPIRATION_NOTES_KEYS["app-store-screenshots"]);
    if (!object) return new Map();
    const file = inspirationNotesFileSchema.parse(JSON.parse(new TextDecoder().decode(await object.arrayBuffer())));
    return new Map(file.notes.map((note) => [note.slug, note]));
  } catch (error) {
    console.warn("[get-inspiration] The notes file could not be read, so the sets go out without notes.", error);
    return new Map();
  }
}

/** Length of the base64 text that carries `bytes` bytes. */
function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

/**
 * Reads one still if it fits what is left of `INSPIRATION_BYTE_BUDGET`, and
 * charges it to `budget`. A still the bucket no longer holds, or one too large
 * for the budget, gives null, and a large one is skipped without loading its
 * body.
 */
export async function readStill(
  bucket: InspirationBucket,
  still: { key: string; width?: number; height?: number },
  budget: { spent: number },
): Promise<InspirationImage | null> {
  const mimeType = stillMimeType(still.key);
  if (!mimeType) return null;
  const object = await bucket.get(still.key);
  if (!object) return null;
  if (budget.spent + base64Length(object.size) > INSPIRATION_BYTE_BUDGET) {
    await object.body?.cancel();
    return null;
  }
  const encoded = Buffer.from(new Uint8Array(await object.arrayBuffer())).toString("base64");
  if (budget.spent + encoded.length > INSPIRATION_BYTE_BUDGET) return null;
  budget.spent += encoded.length;
  return { ...still, mimeType, data: encoded };
}

/**
 * Reads the sets a request resolves to from the corpus bucket. It reads the
 * index file and the notes file, then only the stills the plan names. It skips a still the
 * bucket no longer holds, and it skips a still that would take the reply past
 * `INSPIRATION_BYTE_BUDGET` without loading its body, so smaller stills after
 * it still go out.
 */
export async function readInspirationFromBucket(
  bucket: InspirationBucket,
  request: InspirationRequest & { type: ImageInspirationType },
): Promise<ImageInspirationResult> {
  const { plan, notes } = await planFromBucket(bucket, request);
  const budget = { spent: 0 };
  const sets: InspirationSet[] = [];

  for (const planned of plan.sets) {
    const images: InspirationImage[] = [];
    for (const still of planned.stills) {
      if (budget.spent >= INSPIRATION_BYTE_BUDGET) break;
      const image = await readStill(bucket, still, budget);
      if (image) images.push(image);
    }
    sets.push({
      title: planned.title,
      slug: planned.slug,
      category: planned.category,
      images,
      notes: notes.get(planned.slug) ?? null,
    });
  }

  return { type: request.type, categories: plan.categories, sets };
}

const NOTE_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * The text that goes before a set's images: its title and category, then our
 * notes on the set with the day they were written, when notes exist. [BD-966]
 */
export function describeSet(set: InspirationSet): string {
  const heading = `## ${set.title}${set.category ? ` (${set.category})` : ""}`;
  if (!set.notes) return heading;
  const written = new Date(`${set.notes.writtenAt}T00:00:00Z`);
  const date = Number.isNaN(written.getTime()) ? set.notes.writtenAt : NOTE_DATE.format(written);
  return [
    heading,
    `Headlines: ${set.notes.headline}`,
    `Slide order: ${set.notes.order}`,
    `Framing: ${set.notes.framing}`,
    `Color: ${set.notes.color}`,
    `Better Design's notes, written by a vision model from these screenshots on ${date}. The listing may have changed since.`,
  ].join("\n");
}
