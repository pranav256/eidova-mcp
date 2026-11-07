import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import type { LintInput } from "../lint/types";

const MAX_SAMPLES = 200;
const MAX_DIRS = 2000;
const MAX_SAMPLE_BYTES = 200_000;
const SOURCE_RE = /\.(?:tsx|jsx)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", "coverage"]);

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function realOrNull(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    // A path that does not exist yet has no package to sample.
    return null;
  }
}

// The home folder or a disk root is not a project, the same rule review-ui-code reads files by.
function notAProject(dir: string): boolean {
  return dir === parse(dir).root || dir === (realOrNull(homedir()) ?? homedir());
}

function hasPackageJson(dir: string): boolean {
  try {
    return lstatSync(join(dir, "package.json")).isFile();
  } catch {
    // No package.json here: keep walking up.
    return false;
  }
}

// The nearest folder with a package.json, from the file up to the root, so a
// monorepo samples the reviewed file's own app and not its neighbours. A file
// with no package.json above it inside the root has no package: the home
// folder or a disk root is never walked.
function packageDir(root: string, file: string): string | null {
  for (let dir = dirname(file); inside(root, dir); dir = dirname(dir)) {
    if (notAProject(dir)) return null;
    if (hasPackageJson(dir)) return dir;
    if (dir === root) break;
  }
  return null;
}

// `budget.dirs` counts the folders one walk may still list, so a package with
// few .tsx files never turns into a walk of a whole disk.
function collect(dir: string, skip: Set<string>, out: LintInput[], budget: { dirs: number }): void {
  if (budget.dirs <= 0) return;
  budget.dirs -= 1;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // A folder we cannot list adds no samples; the review still runs.
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_SAMPLES) return;
    // Links are never followed, so a sample cannot leave the package.
    if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !notAProject(path)) collect(path, skip, out, budget);
    } else if (entry.isFile() && SOURCE_RE.test(entry.name) && !skip.has(path)) {
      try {
        if (lstatSync(path).size > MAX_SAMPLE_BYTES) continue;
        out.push({ path, content: readFileSync(path, "utf8") });
      } catch {
        // An unreadable file is simply not a sample.
      }
    }
  }
}

/**
 * Reads up to 200 other .tsx and .jsx files from the package each reviewed
 * file belongs to, inside `root`, for the review to learn the project's own
 * length convention. Only counts leave these files; nothing is reported. A
 * reviewed path outside `root`, or with no package.json above it, adds none.
 */
export function readLengthSamples(root: string, reviewedPaths: readonly string[]): LintInput[] {
  const base = realOrNull(resolve(root));
  if (!base || notAProject(base)) return [];
  // Real paths, so no folder in a file's chain can be a link out of the root.
  const reviewed = reviewedPaths
    .map((path) => realOrNull(resolve(base, path)))
    .filter((path): path is string => path !== null && inside(base, path));
  const skip = new Set(reviewed);
  const packages = [...new Set(reviewed.map((path) => packageDir(base, path)))].filter((dir): dir is string => dir !== null);
  const out: LintInput[] = [];
  const budget = { dirs: MAX_DIRS };
  for (const dir of packages) collect(dir, skip, out, budget);
  return out;
}
