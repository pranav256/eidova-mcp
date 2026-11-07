import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Source, bundled Node entry points and Vercel functions keep assets beside the package. */
export function resourcePath(relative: string): string {
  const candidates = [fileURLToPath(new URL(`../${relative}`, import.meta.url)), path.resolve(relative)];
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) throw new Error(`Required package resource is missing: ${relative}`);
  return found;
}
