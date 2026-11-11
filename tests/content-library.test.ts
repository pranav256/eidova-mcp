import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { contentLibrarySchema, loadContentLibrary, MAX_CONTENT_CHARACTERS, MAX_LIBRARY_BYTES, MAX_LIBRARY_ENTRIES, mergeContentLibraries, validateContentLibrary, type ContentLibrary } from "../src/content-library.js";
import { importContentFile, parseImportArguments } from "../scripts/import-content.js";
import originalLibrary from "../content/library.json";

const principle = {
  id: "principle-original-ui-spacing",
  title: "Group related content",
  content: "Use space to show relationships.",
  area: "ui" as const,
  topic: "spacing",
  aliases: ["layout"],
  sourceFile: "author/export.json",
  chunkType: "parent" as const,
};
const rule = { id: "review-original-focus", title: "Show keyboard focus", content: "Focused controls have a visible indicator.", category: "accessibility" as const, severity: "serious" as const };
const library = (): ContentLibrary => ({ version: 1, principles: [{ ...principle, aliases: [...principle.aliases] }], reviewRules: [{ ...rule }] });

async function temporaryDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "eidova-content-"));
  try { await run(directory); }
  finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
}

test("the shipped original library satisfies the import contract", () => {
  const result = validateContentLibrary(originalLibrary);
  assert.ok(result.principles.length > 0);
  assert.ok(result.reviewRules.length > 0);
});

test("validation rejects unknown fields, wrong versions and missing provenance", () => {
  assert.throws(() => validateContentLibrary({ ...library(), version: 2 }));
  assert.throws(() => validateContentLibrary({ ...library(), vendorToken: "unexpected" }));
  assert.throws(() => validateContentLibrary({ ...library(), principles: [{ ...principle, telemetry: true }] }));
  const { sourceFile: omitted, ...withoutSource } = principle;
  assert.throws(() => validateContentLibrary({ ...library(), principles: [withoutSource] }));
  assert.throws(() => validateContentLibrary({ ...library(), principles: [{ ...principle, content: "  " }] }));
});

test("IDs are unique across both collections", () => {
  assert.throws(() => validateContentLibrary({ ...library(), reviewRules: [{ ...rule, id: principle.id }] }), /Duplicate ID/);
  assert.throws(() => validateContentLibrary({ ...library(), reviewRules: [rule, rule] }), /Duplicate ID/);
});

test("topics normalize like retrieval and are unique within an area", () => {
  const other = { ...principle, id: "principle-other", topic: "  ＳＰＡＣＩＮＧ  " };
  assert.throws(() => validateContentLibrary({ ...library(), principles: [principle, other] }), /Duplicate topic/);
  assert.throws(() => validateContentLibrary({ ...library(), principles: [{ ...principle, topic: "text scale" }, { ...other, topic: "TEXT_scale" }] }), /Duplicate topic/);
  assert.equal(validateContentLibrary({ ...library(), principles: [principle, { ...other, area: "ux" }] }).principles.length, 2);
});

test("entry and content limits are enforced", () => {
  assert.equal(contentLibrarySchema.safeParse({ ...library(), principles: [{ ...principle, content: "x".repeat(MAX_CONTENT_CHARACTERS + 1) }] }).success, false);
  const entries = Array.from({ length: MAX_LIBRARY_ENTRIES }, (_, index) => ({ ...principle, id: `p-${index}`, topic: `topic-${index}` }));
  assert.equal(contentLibrarySchema.safeParse({ ...library(), principles: entries }).success, false);
});

test("validation and merge results do not share mutable data with inputs", () => {
  const base = library();
  const result = validateContentLibrary(base);
  result.principles[0].aliases.push("changed");
  result.principles[0].content = "changed";
  assert.deepEqual(base, library());
  const incoming = { version: 1, principles: [{ ...principle, id: "p-new", topic: "color" }], reviewRules: [] };
  const merged = mergeContentLibraries(base, incoming);
  merged.principles[1].aliases.push("different");
  merged.reviewRules[0].title = "Different";
  assert.deepEqual(base, library());
  assert.deepEqual(incoming.principles[0].aliases, ["layout"]);
});

test("merge appends by ID and requires explicit replacement", () => {
  const base = library();
  const incoming = { version: 1, principles: [{ ...principle, content: "Revised original advice", sourceFile: "authorized-export/principles.json" }], reviewRules: [] };
  assert.throws(() => mergeContentLibraries(base, incoming), /--replace/);
  const result = mergeContentLibraries(base, incoming, { replace: true });
  assert.equal(result.principles.length, 1);
  assert.equal(result.principles[0].content, "Revised original advice");
  assert.equal(result.principles[0].sourceFile, incoming.principles[0].sourceFile);
  assert.equal(result.reviewRules.length, 1);
  assert.deepEqual(base, library());
});

test("replacement cannot introduce a duplicate topic or cross-collection ID", () => {
  assert.throws(() => mergeContentLibraries(library(), { version: 1, principles: [{ ...principle, id: "another-id" }], reviewRules: [] }, { replace: true }), /Duplicate topic/);
  assert.throws(() => mergeContentLibraries(library(), { version: 1, principles: [], reviewRules: [{ ...rule, id: principle.id }] }, { replace: true }), /Duplicate ID/);
});

test("CLI parsing requires an explicit input and accepts replacement and output", () => {
  assert.throws(() => parseImportArguments([]), /Usage:/);
  assert.throws(() => parseImportArguments(["--output"]), /destination/);
  assert.throws(() => parseImportArguments(["input.json", "other.json"]), /Unexpected/);
  assert.throws(() => parseImportArguments(["input.json", "--fetch-vendor"]), /Unexpected/);
  assert.deepEqual(parseImportArguments(["input.json", "--replace", "--output", "content/custom.json"]), { input: "input.json", output: "content/custom.json", replace: true });
});

test("file imports back up exact original bytes before replacing and remove temporary files", async () => {
  await temporaryDirectory(async directory => {
    const target = join(directory, "library.json");
    const input = join(directory, "incoming.json");
    const original = JSON.stringify(library());
    await writeFile(target, original);
    await writeFile(input, JSON.stringify({ version: 1, principles: [{ ...principle, content: "Updated original advice" }], reviewRules: [] }));
    const result = await importContentFile({ input, output: target, replace: true, projectDirectory: directory });
    assert.ok(result.backup);
    assert.equal(await readFile(result.backup, "utf8"), original);
    assert.equal((await loadContentLibrary(target)).principles[0].content, "Updated original advice");
    assert.deepEqual((await readdir(directory)).sort(), [".work", "incoming.json", "library.json"]);
  });
});

test("a rejected import leaves the target bytes intact and creates no backup", async () => {
  await temporaryDirectory(async directory => {
    const target = join(directory, "library.json");
    const input = join(directory, "incoming.json");
    const original = JSON.stringify(library());
    await writeFile(target, original);
    await writeFile(input, original);
    await assert.rejects(importContentFile({ input, output: target, projectDirectory: directory }), /--replace/);
    assert.equal(await readFile(target, "utf8"), original);
    assert.deepEqual((await readdir(directory)).sort(), ["incoming.json", "library.json"]);
  });
});

test("first import creates the default library without claiming a backup", async () => {
  await temporaryDirectory(async directory => {
    const input = join(directory, "incoming.json");
    await writeFile(input, JSON.stringify(library()));
    const result = await importContentFile({ input, projectDirectory: directory });
    assert.equal(result.output, join(directory, "content", "library.json"));
    assert.equal(result.backup, null);
    assert.deepEqual(await loadContentLibrary(result.output), library());
  });
});

test("an import lock prevents overwriting a concurrently edited library", async () => {
  await temporaryDirectory(async directory => {
    const target = join(directory, "library.json");
    const input = join(directory, "incoming.json");
    await writeFile(input, JSON.stringify(library()));
    await writeFile(`${target}.import.lock`, "active");
    await assert.rejects(importContentFile({ input, output: target, projectDirectory: directory }), /Another import holds/);
    assert.equal(await readFile(`${target}.import.lock`, "utf8"), "active");
  });
});

test("the loader rejects oversized files and malformed JSON", async () => {
  await temporaryDirectory(async directory => {
    const input = join(directory, "input.json");
    await writeFile(input, "not-json");
    await assert.rejects(loadContentLibrary(input), SyntaxError);
    await writeFile(input, Buffer.alloc(MAX_LIBRARY_BYTES + 1, 32));
    await assert.rejects(loadContentLibrary(input), /exceeds/);
  });
});
