/**
 * Builds icon component files from Iconify, for `install-icons` and for the
 * local kit install, which installs a system's everyday icons with its
 * components. [BD-1285]
 */

import type { IconLibraryInfo } from "./data-provider";
import { buildBarrel, buildTsxComponent, parseSvg, stripPrefix, toFileStem, toPascalCase } from "./icon-installer";
import type { IconFile } from "./write-icons";
import { fetchWithTimeout, ICONIFY_API_BASE, ICONIFY_FETCH_TIMEOUT_MS } from "./tools/shared";

/** One icon fetched and turned into a file. */
export interface GeneratedIcon {
  path: string;
  content: string;
  componentName: string;
  stem: string;
  /** The SVG markup inside the component, as Iconify sent it. */
  body: string;
}

/** Fetches each named icon from Iconify and builds its file, reporting the ones it could not. */
export async function generateIcons(
  library: Pick<IconLibraryInfo, "name" | "prefix">,
  names: string[],
  dir: string,
  outFormat: "tsx" | "svg",
  variant?: string,
): Promise<{ generated: GeneratedIcon[]; skipped: { name: string; reason: string }[]; duplicates: string[] }> {
  const prefix = library.prefix;
  const generated: GeneratedIcon[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const duplicates: string[] = [];

  const seenStems = new Set<string>();
  const uniqueNames: string[] = [];
  for (const rawName of names) {
    let stem: string;
    try {
      stem = toFileStem(rawName);
    } catch {
      uniqueNames.push(rawName);
      continue;
    }
    if (seenStems.has(stem)) {
      duplicates.push(rawName);
      continue;
    }
    seenStems.add(stem);
    uniqueNames.push(rawName);
  }

  const seenComponentNames = new Set<string>();

  for (const rawName of uniqueNames) {
    const bare = stripPrefix(rawName);
    let stem: string;
    try {
      stem = toFileStem(rawName);
    } catch (err) {
      skipped.push({
        name: rawName,
        reason: err instanceof Error ? err.message : "invalid name",
      });
      continue;
    }
    const candidateNames = variant && !bare.endsWith(`-${variant}`) && !bare.startsWith(`${variant}-`)
      ? [`${bare}-${variant}`, `${variant}-${bare}`, bare]
      : [bare];

    let rawSvg: string | null = null;
    let lastFailureReason = "fetch failed";
    for (const candidateName of candidateNames) {
      const url = `${ICONIFY_API_BASE}/${prefix}/${candidateName}.svg`;
      try {
        const res = await fetchWithTimeout(url);
        if (!res.ok) {
          lastFailureReason = `HTTP ${res.status}`;
          continue;
        }

        const candidateSvg = await res.text();
        if (candidateSvg.includes('width="1"') && candidateSvg.includes('height="1"') && !candidateSvg.includes("<path") && !candidateSvg.includes("<g")) {
          lastFailureReason = "not found in library";
          continue;
        }

        rawSvg = candidateSvg;
        break;
      } catch (err) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        lastFailureReason = isAbort
          ? `timeout after ${ICONIFY_FETCH_TIMEOUT_MS}ms`
          : err instanceof Error
            ? err.message
            : "fetch failed";
      }
    }

    if (!rawSvg) {
      skipped.push({ name: rawName, reason: lastFailureReason });
      continue;
    }

    if (outFormat === "svg") {
      generated.push({
        path: `${dir}/${stem}.svg`,
        content: rawSvg.trim() + "\n",
        componentName: "",
        stem,
        body: rawSvg,
      });
      continue;
    }

    const { viewBox, body } = parseSvg(rawSvg);
    const componentName = toPascalCase(rawName);
    if (seenComponentNames.has(componentName)) {
      duplicates.push(rawName);
      continue;
    }
    seenComponentNames.add(componentName);
    const content = buildTsxComponent({
      libraryName: library.name,
      iconName: rawName,
      viewBox,
      body,
    });
    generated.push({
      path: `${dir}/${stem}.tsx`,
      content,
      componentName,
      stem,
      body,
    });
  }

  return { generated, skipped, duplicates };
}

/**
 * Why these icons must not be written without a person seeing them, or
 * undefined when they are safe: a brace in the SVG or a name that is not
 * plain letters and digits would become code. [BD-1278]
 */
export function unsafeIconWrite(generated: GeneratedIcon[]): string | undefined {
  if (generated.some((icon) => /[{}]/.test(icon.body))) {
    return "An icon's SVG holds a brace, so it is not saved automatically.";
  }
  if (generated.some((icon) => !/^[A-Z][A-Za-z0-9]*$/.test(icon.componentName))) {
    return "An icon name holds characters other than letters and digits, so it is not saved automatically.";
  }
  return undefined;
}

/** The icon files plus their barrel and library manifest, ready for a writer. */
export function iconFilesToWrite(icons: {
  dir: string;
  libraryId: string;
  libraryName: string;
  prefix: string;
  generated: GeneratedIcon[];
}): IconFile[] {
  const { dir, libraryId, libraryName, prefix, generated } = icons;
  const barrel = buildBarrel(
    generated.map((f) => ({ componentName: f.componentName, importPath: `./${f.stem}` })),
    { libraryName, prefix },
  );
  const manifest = {
    library: libraryId,
    prefix,
    source: "iconify" as const,
    installedAt: new Date().toISOString(),
    icons: [...new Set(generated.map((f) => f.stem))].sort(),
  };
  return [
    ...generated.map(({ path, content }) => ({ path, content })),
    { path: `${dir}/index.ts`, content: barrel },
    { path: `${dir}/.library.json`, content: JSON.stringify(manifest, null, 2) },
  ];
}
