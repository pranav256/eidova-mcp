import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadContentLibrary, MAX_LIBRARY_BYTES, mergeContentLibraries, type ContentLibrary } from "../src/content-library.js";

export interface ImportContentOptions {
  input: string;
  output?: string;
  replace?: boolean;
  projectDirectory?: string;
}

export interface ImportContentResult {
  output: string;
  backup: string | null;
  principles: number;
  reviewRules: number;
}

const isMissing = (error: unknown): boolean => !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";

export async function importContentFile(options: ImportContentOptions): Promise<ImportContentResult> {
  const projectDirectory = resolve(options.projectDirectory ?? process.cwd());
  const output = resolve(projectDirectory, options.output ?? "content/library.json");
  const input = resolve(projectDirectory, options.input);
  const incoming = await loadContentLibrary(input);
  await mkdir(dirname(output), { recursive: true });
  const lockPath = `${output}.import.lock`;
  const lock = await open(lockPath, "wx", 0o600).catch(error => {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") throw new Error(`Another import holds ${lockPath}; remove a stale lock only after confirming no import is running`);
    throw error;
  });
  let temporary: string | null = null;
  try {
    let current: ContentLibrary = { version: 1, principles: [], reviewRules: [] };
    let original: Buffer | null = null;
    try {
      current = await loadContentLibrary(output);
      original = await readFile(output);
      if (original.length > MAX_LIBRARY_BYTES) throw new Error(`Content library exceeds ${MAX_LIBRARY_BYTES} bytes`);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    const merged = mergeContentLibraries(current, incoming, { replace: options.replace });
    const serialized = Buffer.from(JSON.stringify(merged, null, 2) + "\n", "utf8");
    if (serialized.length > MAX_LIBRARY_BYTES) throw new Error(`Merged content library exceeds ${MAX_LIBRARY_BYTES} bytes`);
    let backup: string | null = null;
    if (original) {
      const backupDirectory = resolve(projectDirectory, ".work/content-backups");
      await mkdir(backupDirectory, { recursive: true });
      backup = resolve(backupDirectory, `${basename(output)}.${new Date().toISOString().replace(/[:.]/g, "-")}.${randomUUID()}.json`);
      const backupFile = await open(backup, "wx", 0o600);
      try { await backupFile.writeFile(original); await backupFile.sync(); }
      finally { await backupFile.close(); }
    }
    temporary = resolve(dirname(output), `.${basename(output)}.${randomUUID()}.tmp`);
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(serialized); await file.sync(); }
    finally { await file.close(); }
    // The adjacent temporary file keeps replacement on one filesystem.
    await rename(temporary, output);
    temporary = null;
    return { output, backup, principles: merged.principles.length, reviewRules: merged.reviewRules.length };
  } finally {
    try {
      if (temporary) await unlink(temporary).catch(error => { if (!isMissing(error)) throw error; });
    } finally {
      try { await lock.close(); }
      finally { await unlink(lockPath); }
    }
  }
}

export function parseImportArguments(args: string[]): ImportContentOptions {
  let input: string | undefined;
  let output: string | undefined;
  let replace = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--replace") { replace = true; continue; }
    if (argument === "--output") {
      if (output || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("--output requires one destination path");
      output = args[++index];
      continue;
    }
    if (argument.startsWith("--") || input) throw new Error(`Unexpected argument: ${argument}`);
    input = argument;
  }
  if (!input) throw new Error("Usage: npx tsx scripts/import-content.ts <input.json> [--replace] [--output <path>]");
  return { input, output, replace };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await importContentFile(parseImportArguments(process.argv.slice(2)));
    console.log(`Saved ${result.principles} principles and ${result.reviewRules} review rules to ${result.output}`);
    if (result.backup) console.log(`Previous library backed up to ${result.backup}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Content import failed");
    process.exitCode = 1;
  }
}
