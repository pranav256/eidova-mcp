import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { BlobError, BlobPreconditionFailedError } from "@vercel/blob";
import {
  LocalFileStore, VercelBlobStore, StoreConfigurationError, StoreConflictError,
  MAX_DOCUMENT_BYTES, MAX_UPDATE_ATTEMPTS, createStore,
  type BlobTransport,
} from "../src/store.js";

async function temporaryStore(run: (store: LocalFileStore, directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "open-design-store-"));
  try { await run(new LocalFileStore(directory), directory); }
  finally {
    assert.equal(dirname(directory), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
}

class FakeBlobTransport implements BlobTransport {
  readonly documents = new Map<string, { bytes: Buffer; revision: number }>();
  readonly reads: Parameters<BlobTransport["get"]>[1][] = [];
  readonly writes: Parameters<BlobTransport["put"]>[2][] = [];
  conflictWrites = 0;
  createConflict = false;
  failWrites: Error | null = null;

  async get(path: string, options: Parameters<BlobTransport["get"]>[1]) {
    this.reads.push(options);
    const current = this.documents.get(path);
    if (!current) return null;
    const bytes = Buffer.from(current.bytes);
    return {
      statusCode: 200 as const,
      stream: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
      blob: { etag: `v${current.revision}`, size: bytes.length },
    };
  }

  async put(path: string, bytes: Buffer, options: Parameters<BlobTransport["put"]>[2]) {
    this.writes.push(options);
    if (this.failWrites) throw this.failWrites;
    if (this.createConflict) {
      this.createConflict = false;
      this.documents.set(path, { bytes: Buffer.from('{"count":8}'), revision: 1 });
      throw new BlobError("This blob already exists. Use allowOverwrite to overwrite it.");
    }
    if (this.conflictWrites > 0) {
      this.conflictWrites--;
      const current = this.documents.get(path);
      this.documents.set(path, { bytes: Buffer.from('{"count":8}'), revision: (current?.revision ?? 0) + 1 });
      throw new BlobPreconditionFailedError();
    }
    const current = this.documents.get(path);
    if (options.ifMatch && options.ifMatch !== `v${current?.revision}`) throw new BlobPreconditionFailedError();
    if (!options.allowOverwrite && current) throw new BlobError("This blob already exists.");
    this.documents.set(path, { bytes: Buffer.from(bytes), revision: (current?.revision ?? 0) + 1 });
    return {};
  }
}

test("local state is durable and readable by a fresh instance", async () => {
  await temporaryStore(async (store, directory) => {
    assert.equal(await store.get("workspace/settings"), null);
    await store.set("workspace/settings", { colors: { primary: "#123456" }, count: 1 });
    const reopened = new LocalFileStore(directory);
    assert.deepEqual(await reopened.get("workspace/settings"), { colors: { primary: "#123456" }, count: 1 });
    assert.deepEqual(JSON.parse(await readFile(join(directory, "workspace/settings.json"), "utf8")), { colors: { primary: "#123456" }, count: 1 });
  });
});

test("parallel local updates across instances preserve every increment", async () => {
  await temporaryStore(async (store, directory) => {
    const other = new LocalFileStore(directory);
    await Promise.all(Array.from({ length: 50 }, (_, index) => (index % 2 ? store : other).update<{ count: number }>("counter", current => ({ count: (current?.count ?? 0) + 1 }))));
    assert.deepEqual(await store.get("counter"), { count: 50 });
  });
});

test("readers never observe a partial replacement while local writes run", async () => {
  await temporaryStore(async (store) => {
    await store.set("snapshot", { data: "x".repeat(30_000), sequence: 0 });
    await Promise.all([
      ...Array.from({ length: 12 }, (_, sequence) => store.set("snapshot", { data: "x".repeat(30_000), sequence })),
      ...Array.from({ length: 15 }, async () => {
        const document = await store.get<{ data: string; sequence: number }>("snapshot");
        assert.equal(document?.data.length, 30_000);
        assert.ok(Number.isInteger(document?.sequence));
      }),
    ]);
  });
});

test("failed local updates leave existing data intact and release the queue", async () => {
  await temporaryStore(async (store) => {
    await store.set("counter", { count: 4 });
    await assert.rejects(store.update("counter", () => { throw new Error("callback failed"); }), /callback failed/);
    await assert.rejects(store.update("counter", () => ({ oversized: "x".repeat(MAX_DOCUMENT_BYTES) })), RangeError);
    assert.deepEqual(await store.get("counter"), { count: 4 });
    assert.deepEqual(await store.update<{ count: number }>("counter", current => ({ count: current!.count + 1 })), { count: 5 });
  });
});

test("both stores reject traversal, absolute paths, empty segments and oversized keys before IO", async () => {
  await temporaryStore(async (local) => {
    const transport = new FakeBlobTransport();
    const blob = new VercelBlobStore({ token: "test-token", transport });
    const keys = ["", "../secret", "/absolute", "a//b", "a/", "a\\b", "C:/state", "a.b", "a?b", "MixedCase", "x".repeat(241), "x".repeat(81), "hello\u0000world"];
    for (const store of [local, blob]) {
      for (const key of keys) {
        await assert.rejects(store.get(key), TypeError);
        await assert.rejects(store.set(key, {}), TypeError);
        await assert.rejects(store.update(key, () => ({})), TypeError);
      }
    }
    assert.equal(transport.reads.length, 0);
    assert.equal(transport.writes.length, 0);
  });
});

test("size limit counts UTF-8 bytes and accepts the exact boundary", async () => {
  await temporaryStore(async (local) => {
    const transport = new FakeBlobTransport();
    const blob = new VercelBlobStore({ token: "test-token", transport });
    for (const store of [local, blob]) {
      await store.set("limit", "a".repeat(MAX_DOCUMENT_BYTES - 2));
      assert.equal((await store.get<string>("limit"))?.length, MAX_DOCUMENT_BYTES - 2);
      await assert.rejects(store.set("limit", "a".repeat(MAX_DOCUMENT_BYTES - 1)), RangeError);
      await assert.rejects(store.set("limit", "💡".repeat(MAX_DOCUMENT_BYTES / 4)), RangeError);
      assert.equal((await store.get<string>("limit"))?.length, MAX_DOCUMENT_BYTES - 2);
    }
  });
});

test("undefined, circular and bigint documents fail without writing", async () => {
  await temporaryStore(async (local) => {
    const transport = new FakeBlobTransport();
    const blob = new VercelBlobStore({ token: "test-token", transport });
    const circular: Record<string, unknown> = {}; circular.self = circular;
    for (const store of [local, blob]) {
      for (const value of [undefined, circular, 1n]) await assert.rejects(store.set("invalid", value), TypeError);
      assert.equal(await store.get("invalid"), null);
    }
    assert.equal(transport.writes.length, 0);
  });
});

test("corrupt or oversized local documents are surfaced instead of silently reset", async () => {
  await temporaryStore(async (store, directory) => {
    await writeFile(join(directory, "broken.json"), "{");
    await assert.rejects(store.get("broken"), /not valid UTF-8 JSON/);
    await writeFile(join(directory, "broken.json"), Buffer.from([0xff, 0xfe]));
    await assert.rejects(store.get("broken"), /not valid UTF-8 JSON/);
    await writeFile(join(directory, "large.json"), "a".repeat(MAX_DOCUMENT_BYTES + 1));
    await assert.rejects(store.get("large"), RangeError);
  });
});

test("Blob uses private uncached reads and conditional deterministic writes", async () => {
  const transport = new FakeBlobTransport();
  const store = new VercelBlobStore({ token: "test-token", transport });
  await store.set("workspace/settings", { count: 1 });
  assert.equal(transport.writes[0].access, "private");
  assert.equal(transport.writes[0].allowOverwrite, false);
  assert.equal(transport.writes[0].addRandomSuffix, false);
  assert.equal(transport.writes[0].ifMatch, undefined);
  await store.update<{ count: number }>("workspace/settings", current => ({ count: current!.count + 1 }));
  assert.equal(transport.writes[1].allowOverwrite, true);
  assert.equal(transport.writes[1].ifMatch, "v1");
  assert.ok(transport.reads.every(options => options.access === "private" && options.useCache === false));
  assert.deepEqual(await new VercelBlobStore({ token: "test-token", transport }).get("workspace/settings"), { count: 2 });
});

test("parallel Blob updates across instances preserve increments", async () => {
  const transport = new FakeBlobTransport();
  const stores = [new VercelBlobStore({ token: "test-token", transport }), new VercelBlobStore({ token: "test-token", transport })];
  await Promise.all(Array.from({ length: 30 }, (_, index) => stores[index % 2].update<{ count: number }>("counter", current => ({ count: (current?.count ?? 0) + 1 }))));
  assert.deepEqual(await stores[0].get("counter"), { count: 30 });
});

test("ETag conflict reloads current data and recomputes the update", async () => {
  const transport = new FakeBlobTransport();
  const store = new VercelBlobStore({ token: "test-token", transport });
  await store.set("counter", { count: 1 });
  transport.conflictWrites = 1;
  const observed: (number | null)[] = [];
  const value = await store.update<{ count: number }>("counter", current => { observed.push(current?.count ?? null); return { count: (current?.count ?? 0) + 1 }; });
  assert.deepEqual(observed, [1, 8]);
  assert.deepEqual(value, { count: 9 });
  assert.deepEqual(await store.get("counter"), { count: 9 });
});

test("a concurrent initial create reloads rather than overwriting new state", async () => {
  const transport = new FakeBlobTransport();
  const store = new VercelBlobStore({ token: "test-token", transport });
  transport.createConflict = true;
  assert.deepEqual(await store.update<{ count: number }>("counter", current => ({ count: (current?.count ?? 0) + 1 })), { count: 9 });
  assert.equal(transport.writes[0].allowOverwrite, false);
  assert.equal(transport.writes[1].ifMatch, "v1");
});

test("five write conflicts fail explicitly and release the Blob writer queue", async () => {
  const transport = new FakeBlobTransport();
  const store = new VercelBlobStore({ token: "test-token", transport });
  transport.conflictWrites = MAX_UPDATE_ATTEMPTS;
  await assert.rejects(store.update<{ count: number }>("counter", current => ({ count: (current?.count ?? 0) + 1 })), StoreConflictError);
  assert.equal(transport.writes.length, MAX_UPDATE_ATTEMPTS);
  assert.deepEqual(await store.update<{ count: number }>("counter", current => ({ count: (current?.count ?? 0) + 1 })), { count: 9 });
});

test("storage failures are not misreported as success or treated as missing data", async () => {
  const transport = new FakeBlobTransport();
  const store = new VercelBlobStore({ token: "test-token", transport });
  transport.failWrites = new Error("storage service unavailable");
  await assert.rejects(store.set("counter", { count: 1 }), /storage service unavailable/);
  assert.equal(transport.writes.length, 1);
  transport.failWrites = null;
  await store.set("counter", { count: 1 });
  assert.deepEqual(await store.get("counter"), { count: 1 });
});

test("Blob refuses malformed and oversized responses", async () => {
  const transport = new FakeBlobTransport();
  const store = new VercelBlobStore({ token: "test-token", transport });
  transport.documents.set("open-design/state/broken.json", { bytes: Buffer.from("{"), revision: 1 });
  await assert.rejects(store.get("broken"), /not valid UTF-8 JSON/);
  transport.documents.set("open-design/state/large.json", { bytes: Buffer.from("x".repeat(MAX_DOCUMENT_BYTES + 1)), revision: 1 });
  await assert.rejects(store.get("large"), RangeError);
});

test("hosted configuration never falls back to ephemeral local function disk", async () => {
  const originalVercel = process.env.VERCEL;
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN;
  try {
    process.env.VERCEL = "1";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    assert.throws(() => createStore(), StoreConfigurationError);
    assert.throws(() => new VercelBlobStore(" "), StoreConfigurationError);
    assert.ok(createStore({ blobToken: "test-token" }) instanceof VercelBlobStore);
    delete process.env.VERCEL;
    assert.ok(createStore() instanceof LocalFileStore);
  } finally {
    if (originalVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = originalVercel;
    if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
  }
});
