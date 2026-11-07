import { open } from "node:fs/promises";
import { z } from "zod";

export const MAX_LIBRARY_ENTRIES = 5_000;
export const MAX_CONTENT_CHARACTERS = 200_000;
export const MAX_LIBRARY_BYTES = 16 * 1024 * 1024;

const text = (maximum: number) => z.string().min(1).max(maximum).refine(value => value.trim().length > 0, "Must contain non-whitespace text");
const id = text(200);

export const principleSchema = z.strictObject({
  id,
  title: text(500),
  content: text(MAX_CONTENT_CHARACTERS),
  area: z.enum(["ui", "ux", "react-native", "swiftui", "three-js", "shopify", "sales", "motion", "widget", "illustration"]),
  topic: text(200),
  aliases: z.array(text(200)).max(100),
  // Imported provenance is retained verbatim, never inferred from a filename.
  sourceFile: text(2_000),
  chunkType: z.literal("parent"),
});

export const reviewRuleSchema = z.strictObject({
  id,
  title: text(500),
  content: text(MAX_CONTENT_CHARACTERS),
  category: z.enum(["accessibility", "visual-design", "animation", "content", "comprehension", "ai-features", "coverage-gaps"]),
  severity: z.enum(["critical", "serious", "moderate"]),
});

const normalizeTopic = (value: string) => value.normalize("NFKC").toLowerCase().trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");

export const contentLibrarySchema = z.strictObject({
  version: z.literal(1),
  principles: z.array(principleSchema).max(MAX_LIBRARY_ENTRIES),
  reviewRules: z.array(reviewRuleSchema).max(MAX_LIBRARY_ENTRIES),
}).superRefine((library, context) => {
  if (library.principles.length + library.reviewRules.length > MAX_LIBRARY_ENTRIES) {
    context.addIssue({ code: "custom", message: `A library may contain at most ${MAX_LIBRARY_ENTRIES} entries` });
  }
  const ids = new Set<string>();
  const topics = new Set<string>();
  for (const collection of ["principles", "reviewRules"] as const) {
    library[collection].forEach((entry, index) => {
      if (ids.has(entry.id)) context.addIssue({ code: "custom", path: [collection, index, "id"], message: `Duplicate ID: ${entry.id}` });
      ids.add(entry.id);
    });
  }
  library.principles.forEach((entry, index) => {
    const topic = `${entry.area}:${normalizeTopic(entry.topic)}`;
    if (topics.has(topic)) context.addIssue({ code: "custom", path: ["principles", index, "topic"], message: `Duplicate topic in area ${entry.area}: ${entry.topic}` });
    topics.add(topic);
  });
});

export type ContentLibrary = z.infer<typeof contentLibrarySchema>;
export type ContentPrinciple = z.infer<typeof principleSchema>;
export type ContentReviewRule = z.infer<typeof reviewRuleSchema>;

/** Zod returns detached objects, including aliases; callers cannot mutate input. */
export function validateContentLibrary(input: unknown): ContentLibrary {
  return contentLibrarySchema.parse(input);
}

/** Bounded reads also protect against a file growing after its initial stat. */
export async function loadContentLibrary(filename: string): Promise<ContentLibrary> {
  const file = await open(filename, "r");
  try {
    if ((await file.stat()).size > MAX_LIBRARY_BYTES) throw new Error(`Content library exceeds ${MAX_LIBRARY_BYTES} bytes`);
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_LIBRARY_BYTES + 1 - total));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > MAX_LIBRARY_BYTES) throw new Error(`Content library exceeds ${MAX_LIBRARY_BYTES} bytes`);
      chunks.push(buffer.subarray(0, bytesRead));
    }
    return validateContentLibrary(JSON.parse(Buffer.concat(chunks, total).toString("utf8")));
  } finally {
    await file.close();
  }
}

/** Merge by exact ID. A replacement must be explicitly requested. */
export function mergeContentLibraries(baseInput: unknown, incomingInput: unknown, options: { replace?: boolean } = {}): ContentLibrary {
  const base = validateContentLibrary(baseInput);
  const incoming = validateContentLibrary(incomingInput);
  const existingIds = new Set([...base.principles, ...base.reviewRules].map(entry => entry.id));
  if (!options.replace) {
    const collisions = [...incoming.principles, ...incoming.reviewRules].filter(entry => existingIds.has(entry.id));
    if (collisions.length) throw new Error(`IDs already exist; pass --replace to replace them: ${collisions.map(entry => entry.id).join(", ")}`);
  }
  const merge = <T extends { id: string }>(current: T[], additions: T[]): T[] => {
    const entries = new Map(current.map(entry => [entry.id, entry]));
    for (const entry of additions) entries.set(entry.id, entry);
    return [...entries.values()];
  };
  return validateContentLibrary({
    version: 1,
    principles: merge(base.principles, incoming.principles),
    reviewRules: merge(base.reviewRules, incoming.reviewRules),
  });
}
