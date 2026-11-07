import { createReadStream } from "node:fs";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import {
  BlobError,
  BlobNotFoundError,
  BlobPreconditionFailedError,
  get as getBlob,
  put as putBlob,
} from "@vercel/blob";

/** Maximum serialized UTF-8 size for one private state document. */
export const MAX_DOCUMENT_BYTES = 256 * 1024;
export const MAX_UPDATE_ATTEMPTS = 5;

export interface JsonStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  /** The callback may be retried; keep it synchronous and free of side effects. */
  update<T>(key: string, update: (current: T | null) => T): Promise<T>;
}

export class StoreConfigurationError extends Error {
  override name = "StoreConfigurationError";
}

export class StoreConflictError extends Error {
  override name = "StoreConflictError";

  constructor() {
    super("The document changed repeatedly during this update. Retry the operation.");
  }
}

/** Keys are logical names, never paths or URLs supplied to the filesystem/SDK. */
function validateKey(key: string): void {
  if (
    typeof key !== "string" ||
    key.length === 0 ||
    key.length > 240 ||
    !/^[a-z0-9/_-]+$/.test(key) ||
    key.split("/").some((segment) => !/^[a-z0-9_-]{1,80}$/.test(segment))
  ) {
    throw new TypeError("Invalid storage key. Use bounded lowercase names separated by single slashes.");
  }
}

function serialize(value: unknown): Buffer {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    throw new TypeError("The document must be JSON serializable.");
  }
  if (text === undefined) throw new TypeError("The document must be JSON serializable.");
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    throw new RangeError("The document exceeds the 256 KiB storage limit.");
  }
  return bytes;
}

function parse<T>(bytes: Buffer): T {
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    throw new RangeError("The stored document exceeds the 256 KiB storage limit.");
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
  } catch {
    throw new Error("The stored document is not valid UTF-8 JSON.");
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

/** Serializes writers across store instances in this process, including failed writes. */
const writeQueues = new Map<string, Promise<void>>();

async function queued<T>(identity: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(identity) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
  const tail = previous.catch(() => undefined).then(() => gate);
  writeQueues.set(identity, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (writeQueues.get(identity) === tail) writeQueues.delete(identity);
  }
}

/**
 * Durable single-process local storage. Atomic replacement makes readers see
 * either the previous document or the complete replacement. Writers using this
 * module share per-key queues even when they use separate LocalFileStore instances.
 */
export class LocalFileStore implements JsonStore {
  readonly directory: string;

  constructor(directory = ".open-design/state") {
    this.directory = resolve(directory);
  }

  private path(key: string): string {
    validateKey(key);
    return resolve(this.directory, `${key}.json`);
  }

  async get<T>(key: string): Promise<T | null> {
    const path = this.path(key);
    const chunks: Buffer[] = [];
    let count = 0;
    try {
      for await (const chunk of createReadStream(path)) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        count += bytes.length;
        if (count > MAX_DOCUMENT_BYTES) throw new RangeError("The stored document exceeds the 256 KiB storage limit.");
        chunks.push(bytes);
      }
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    return parse<T>(Buffer.concat(chunks, count));
  }

  private async write(path: string, bytes: Buffer): Promise<void> {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, path);
    } finally {
      await unlink(temporary).catch((error: unknown) => {
        if (!isMissing(error)) throw error;
      });
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    const path = this.path(key);
    const bytes = serialize(value);
    await queued(`file:${process.platform === "win32" ? path.toLowerCase() : path}`, () => this.write(path, bytes));
  }

  async update<T>(key: string, update: (current: T | null) => T): Promise<T> {
    const path = this.path(key);
    return queued(`file:${process.platform === "win32" ? path.toLowerCase() : path}`, async () => {
      const value = update(await this.get<T>(key));
      await this.write(path, serialize(value));
      return value;
    });
  }
}

/** Small injectable boundary: tests exercise storage semantics without contacting a cloud store. */
export interface BlobTransport {
  get(path: string, options: {
    access: "private";
    token: string;
    useCache: false;
    abortSignal: AbortSignal;
  }): Promise<{
    statusCode: 200 | 304;
    stream: ReadableStream<Uint8Array> | null;
    blob: { etag: string; size: number | null };
  } | null>;
  put(path: string, bytes: Buffer, options: {
    access: "private";
    token: string;
    addRandomSuffix: false;
    allowOverwrite: boolean;
    ifMatch?: string;
    contentType: "application/json";
    cacheControlMaxAge: number;
    abortSignal: AbortSignal;
  }): Promise<unknown>;
}

export interface VercelBlobStoreOptions {
  token?: string;
  transport?: BlobTransport;
  prefix?: string;
}

function isConflict(error: unknown, creating: boolean): boolean {
  if (error instanceof BlobPreconditionFailedError) return true;
  if (!(error instanceof Error)) return false;
  if (error.name === "BlobPreconditionFailedError") return true;
  if (!creating) return false;
  if (error.name === "BlobAlreadyExistsError") return true;
  // SDK 2.8.2 maps a create collision reported as bad_request to BlobError.
  return error instanceof BlobError && /\b(?:blob|file)\b[\s\S]*\balready exists\b/i.test(error.message);
}

/** Private origin reads and conditional writes preserve updates across server instances. */
export class VercelBlobStore implements JsonStore {
  private readonly token: string;
  private readonly transport: BlobTransport;
  private readonly prefix: string;
  private readonly queueIdentity: string;

  constructor(tokenOrOptions: string | VercelBlobStoreOptions = {}) {
    const options = typeof tokenOrOptions === "string" ? { token: tokenOrOptions } : tokenOrOptions;
    const token = options.token ?? process.env.BLOB_READ_WRITE_TOKEN;
    if (!token?.trim()) {
      throw new StoreConfigurationError("Durable hosted storage is unavailable. Configure BLOB_READ_WRITE_TOKEN for a private Vercel Blob store.");
    }
    this.token = token;
    this.transport = options.transport ?? { get: getBlob, put: putBlob };
    this.prefix = options.prefix ?? "open-design/state";
    validateKey(this.prefix);
    this.queueIdentity = createHash("sha256").update(token).digest("hex");
  }

  private path(key: string): string {
    validateKey(key);
    return `${this.prefix}/${key}.json`;
  }

  private async snapshot<T>(path: string): Promise<{ value: T; etag: string } | null> {
    let result: Awaited<ReturnType<BlobTransport["get"]>>;
    try {
      result = await this.transport.get(path, {
        access: "private", token: this.token, useCache: false,
        abortSignal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
    if (!result) return null;
    if (result.statusCode !== 200 || !result.stream || !result.blob.etag) {
      throw new Error("The private storage read did not return a complete versioned document.");
    }
    if (result.blob.size !== null && result.blob.size > MAX_DOCUMENT_BYTES) {
      await result.stream.cancel();
      throw new RangeError("The stored document exceeds the 256 KiB storage limit.");
    }
    const reader = result.stream.getReader();
    const chunks: Buffer[] = [];
    let count = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        count += chunk.value.byteLength;
        if (count > MAX_DOCUMENT_BYTES) {
          await reader.cancel();
          throw new RangeError("The stored document exceeds the 256 KiB storage limit.");
        }
        chunks.push(Buffer.from(chunk.value));
      }
    } finally {
      reader.releaseLock();
    }
    return { value: parse<T>(Buffer.concat(chunks, count)), etag: result.blob.etag };
  }

  async get<T>(key: string): Promise<T | null> {
    return (await this.snapshot<T>(this.path(key)))?.value ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    // Validate before contacting storage, even when the existing document is missing.
    this.path(key);
    serialize(value);
    await this.update<unknown>(key, () => value);
  }

  async update<T>(key: string, update: (current: T | null) => T): Promise<T> {
    const path = this.path(key);
    return queued(`blob:${this.queueIdentity}:${path}`, async () => {
      for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt++) {
        const current = await this.snapshot<T>(path);
        const value = update(current?.value ?? null);
        const bytes = serialize(value);
        try {
          await this.transport.put(path, bytes, {
            access: "private", token: this.token,
            addRandomSuffix: false, allowOverwrite: current !== null,
            ...(current && { ifMatch: current.etag }),
            contentType: "application/json", cacheControlMaxAge: 60,
            abortSignal: AbortSignal.timeout(15_000),
          });
          return value;
        } catch (error) {
          if (!isConflict(error, current === null)) throw error;
          if (attempt === MAX_UPDATE_ATTEMPTS - 1) throw new StoreConflictError();
          await new Promise((resolveRetry) => setTimeout(resolveRetry, 10 * 2 ** attempt + Math.random() * 10));
        }
      }
      throw new StoreConflictError();
    });
  }
}

/** Never falls back to ephemeral Vercel function disk when durable storage is missing. */
export function createStore(options: { localDirectory?: string; blobToken?: string } = {}): JsonStore {
  return process.env.VERCEL
    ? new VercelBlobStore({ token: options.blobToken })
    : new LocalFileStore(options.localDirectory ?? process.env.OPEN_DESIGN_STATE_DIR ?? ".open-design/state");
}
