/**
 * The two dev-only inspection tools every new React project ships with, the
 * same ones better-design.com runs in development: the Agentation toolbar,
 * which annotates an element and copies a note for the agent, and react-grab,
 * which picks an element and copies its source context. Both load only under
 * the dev server, so a production build carries neither. [BD-1292]
 */

/** The two packages, installed as dev dependencies, pinned to the majors better-design.com runs. */
export const DEV_TOOLS_PACKAGES = ["agentation@^3", "react-grab@^0.2"] as const;

/** The install line for a host that runs the commands itself. */
export const DEV_TOOLS_INSTALL_COMMAND = `npm install -D ${DEV_TOOLS_PACKAGES.join(" ")}`;

// The toolbar's import is static: agentation declares `sideEffects: false`, so
// a production build drops it with the dead `import.meta.env.DEV` branch, and
// a search of `dist/` for either package name finds nothing. [BD-1292]
/** The lines that go after the imports of `src/main.tsx`: the toolbar's import, and the picker loaded in dev only. */
const DEV_TOOLS_IMPORT_LINES = [
  'import { Agentation } from "agentation"',
  "",
  'if (import.meta.env.DEV) void import("react-grab")',
];

/** The toolbar, rendered beside the app in dev only. */
const DEV_TOOLS_MOUNT = "{import.meta.env.DEV && <Agentation />}";

/** The setup a host does itself, as one paragraph for the kit's text. */
export const DEV_TOOLS_SETUP = `In a Vite project, then add to \`src/main.tsx\`, after the imports, \`${DEV_TOOLS_IMPORT_LINES[0]}\` and \`${DEV_TOOLS_IMPORT_LINES[2]}\`, and render \`${DEV_TOOLS_MOUNT}\` beside \`<App />\`. In another framework, mount them the same way in its entry file, in development only. They are the inspection tools the user marks a wrong element with; a production build leaves them out.`;

// The line that ends an import statement: a one-line import, or the closing
// line of a multi-line one. Only after the last of these is a safe place to insert.
const IMPORT_END = /^(import\b.*|\s*\}.*\bfrom\s+)?["'][^"']+["'];?\s*$/;

/**
 * Adds both tools to a Vite entry file: the import lines after the last
 * import, and the toolbar beside the first `<App />`. Returns null when the
 * file has no import, or `<App />` has no JSX parent to hold a sibling, so
 * the caller warns instead of writing a file that cannot build.
 */
export function withDevTools(mainTsx: string): string | null {
  const app = "<App />";
  const at = mainTsx.indexOf(app);
  // A bare `render(<App />)` cannot take a sibling; only `<Parent>...<App />` can.
  if (at < 0 || !mainTsx.slice(0, at).trimEnd().endsWith(">")) return null;
  const lines = mainTsx.split("\n");
  let lastImport = -1;
  lines.forEach((line, index) => { if (IMPORT_END.test(line) && /\bimport\b|\bfrom\b/.test(line)) lastImport = index; });
  if (lastImport < 0) return null;
  lines.splice(lastImport + 1, 0, ...DEV_TOOLS_IMPORT_LINES);
  const source = lines.join("\n");
  const start = source.indexOf(app);
  const end = start + app.length;
  const indent = source.slice(source.lastIndexOf("\n", start) + 1, start).replace(/\S/g, " ");
  return `${source.slice(0, end)}\n${indent}${DEV_TOOLS_MOUNT}${source.slice(end)}`;
}
