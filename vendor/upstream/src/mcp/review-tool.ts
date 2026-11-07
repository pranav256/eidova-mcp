import type { JsonValue } from "../guards";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, parse, relative, resolve } from "node:path";
import { z } from "zod";
import { readLengthSamples } from "./length-samples";
import {
  fontEvidenceFor,
  formatFindingsReport,
  lintFiles,
  mergeReviewConfig,
  STATIC_TOKEN_RULE_IDS,
  summarise,
  swiftFindings,
  type LintInput,
  type ProjectInputs,
} from "../lint";
import {
  CONTEXT_ARG,
  createTracking,
  READ_ONLY_TOOL_ANNOTATIONS,
  type ToolUsageContext,
} from "./tools/shared";

// Registered ONLY by the stdio npm server (packages/mcp), never by the
// Cloudflare Worker: the lint engine imports the TypeScript compiler, which
// would grow the Worker bundle by roughly 9 MB. tools.ts must not import this
// module. Remote hosts keep get-review-rules; coding hosts get both.

const MAX_FILES = 24;
const MAX_FILE_CHARS = 120_000;

const NOTHING_TO_REVIEW = `# UI review

No reviewable files were passed. Send the .tsx, .jsx, .ts, .js, .css, .svg and .swift source you want checked:

review-ui-code({ files: [{ path: "components/signup-form.tsx", content: "..." }, { path: "app/globals.css", content: "..." }] })`;

/** True when the local deterministic reviewer understands this source type. */
export function isReviewableSourcePath(path: string): boolean {
  return /\.(tsx|jsx|ts|js|css|html?|svg|swift)$/i.test(path);
}

/**
 * Turns an HTML page into the stylesheet its `<style>` blocks hold, so a
 * one-file build gets the stylesheet checks. Every character outside those
 * blocks becomes a space and every newline stays, so finding lines still point
 * into the page. Other files pass through unchanged. [BD-1157]
 */
export function asReviewInput(file: LintInput): LintInput {
  if (!/\.html?$/i.test(file.path)) return file;
  const source = file.content;
  const keep = new Uint8Array(source.length);
  // Forward-only searches, never a lazy regex: an unclosed <style> made the
  // regex scan to the end of the page once per tag. The literal patterns match
  // case-insensitively on the page itself, so a lowercased copy cannot shift
  // the positions. [BD-1157]
  const openTag = /<style/gi;
  const closeTag = /<\/style/gi;
  for (let tag = openTag.exec(source); tag; tag = openTag.exec(source)) {
    const bodyStart = source.indexOf(">", tag.index) + 1;
    if (bodyStart === 0) break;
    closeTag.lastIndex = bodyStart;
    const close = closeTag.exec(source);
    if (!close) break;
    keep.fill(1, bodyStart, close.index);
    openTag.lastIndex = close.index + 7;
  }
  let content = "";
  for (let i = 0; i < source.length; i++) {
    content += keep[i] || source[i] === "\n" ? source[i] : " ";
  }
  return { path: `${file.path}.css`, content };
}

/**
 * The project context review-ui-code can read from the files an agent sends:
 * its stylesheets are the theme, and a file under a ui folder is a component
 * whose variants the class checks name. [BD-817]
 */
export function projectFromFiles(files: LintInput[]): ProjectInputs {
  return {
    theme: files.filter((file) => /\.css$/i.test(file.path)),
    components: files.filter((file) => /(?:^|\/)ui\/[^/]+\.[jt]sx?$/.test(file.path)),
  };
}

/** One file the caller named: its source, or the reason it could not be read. */
type LoadedFile = { input: LintInput } | { skipped: string };

/**
 * Reads each named file the caller sent without content, from inside the
 * project the server runs in. Agents sent a fragment or a placeholder instead
 * of a whole page, so the review passed a stripe it never saw; a path lets the
 * tool read what is on disk. A path that leaves the project, a file it cannot
 * read and a file over the size cap are skipped and named. [BD-1157]
 */
export async function loadReviewFiles(
  files: Array<{ path: string; content?: string }>,
  root: string = process.cwd(),
): Promise<LoadedFile[]> {
  const base = await realpath(root);
  // A host can start the server in the home folder or at the disk root, and
  // that is not a project: read nothing from disk there.
  const notAProject = base === parse(base).root || base === (await realpath(homedir()).catch(() => homedir()));
  return Promise.all(files.map(async (file): Promise<LoadedFile> => {
    if (file.content !== undefined) return { input: { path: file.path, content: file.content } };
    if (notAProject) return { skipped: `${file.path}: the server is not running in a project folder, so send the content` };
    try {
      const full = await realpath(resolve(base, file.path));
      const rel = relative(base, full);
      if (rel.startsWith("..") || isAbsolute(rel)) return { skipped: `${file.path}: outside the project` };
      // The file a link points to must be source too, so a link named theme.css
      // cannot hand the review a secrets file.
      if (!isReviewableSourcePath(full)) return { skipped: `${file.path}: not a source file` };
      const info = await stat(full);
      // Bytes before reading: one character takes at most four in UTF-8.
      if (!info.isFile() || info.size > MAX_FILE_CHARS * 4) return { skipped: `${file.path}: not a regular file under the size cap` };
      const content = await readFile(full, "utf8");
      if (content.length > MAX_FILE_CHARS) return { skipped: `${file.path}: over ${MAX_FILE_CHARS} characters` };
      return { input: { path: file.path, content } };
    } catch {
      return { skipped: `${file.path}: not readable` };
    }
  }));
}

/**
 * Registers `review-ui-code` on an MCP server. Call it only from the stdio
 * server: the lint engine pulls in the TypeScript compiler, which the Worker
 * bundle cannot afford, which is why `tools.ts` does not register this.
 */
export function registerReviewTool(
  server: McpServer,
  onToolUsage?: (
    tool: string,
    params: Record<string, JsonValue | undefined>,
    context: ToolUsageContext,
  ) => void,
): void {
  const { track } = createTracking(server, onToolUsage);

  server.registerTool(
    "review-ui-code",
    {
      title: "Review UI Code",
      description: `Deterministic UI and UX review of React component source and its CSS, and of SwiftUI .swift views. Run it on every UI file you write or change, including globals.css and a one-file .html page (its <style> blocks are checked), before you present the result. Pass the markup of every mock product screen or embedded panel too, not only the page around it. When CSS references a framework font variable, include the layout or font-loader .ts/.tsx/.js/.jsx module in the same call.

get-review-rules gives you the judgment rules to apply yourself. This tool is the mechanical half: it parses the code and returns exact findings with line numbers and fixes, the same input always producing the same findings. It catches:

- Native elements the installed design system already ships: raw <button>, <input>, <select>, <textarea>, <table>.
- Raw <aside> app shells and repeated record rows that bypass installed Sidebar and Table compositions.
- Undefined font variables that leave the rendered app on an unintended fallback family.
- Hardcoded colors and Tailwind arbitrary color values that bypass semantic tokens, raw palette classes (bg-white, text-gray-500), and dark: forks.
- Generated-UI tells: letter-spaced capital labels, a left-edge stripe on a callout, selected row or active nav item, gradient text, eyebrow labels above titles, em dashes in copy, a page title laid over a full-bleed product photo or video.
- WCAG basics: images without alt, icon-only buttons without an accessible name, removed focus outlines.
- SwiftUI: literal colours outside the theme, text that ignores Dynamic Type, icon-only buttons with no accessibility label, tap gestures used as buttons, and a chart axis inside a small card.

This source reviewer cannot judge rendered hierarchy or semantic color roles. After it passes, inspect the rendered dashboard and confirm title → metrics → records → interpretation, distinct action and status colors, and that a stepper begins only after a task starts.

Send each file's path and leave out content to have the tool read the whole file from disk. Fix every critical and serious finding, then call it again on the fixed source. Findings feed the same loop as a human code review: read, fix, re-check.`,
      inputSchema: z.object({
        files: z
          .array(
            z.object({
              path: z.string().trim().min(1).max(400)
                .describe("Repo-relative file path, e.g. components/signup-form.tsx."),
              content: z.string().max(MAX_FILE_CHARS).optional()
                .describe("The file's full source. Leave it out to have the tool read the file at `path` from the project on disk, which is the safer way to send a whole page."),
            }),
          )
          .min(1)
          .max(MAX_FILES)
          .describe("The .tsx, .jsx, .ts, .js, .css, .html, .svg and .swift files to review, as written. Send an icon's own file beside the pages that use it, so a nudge finding can name the viewBox or path to fix."),
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ files, context }) => {
      const start = Date.now();
      const loaded = await loadReviewFiles(files.filter((f) => isReviewableSourcePath(f.path)));
      const skipped = loaded.flatMap((f) => ("skipped" in f ? [f.skipped] : []));
      const reviewable: LintInput[] = loaded.flatMap((f) => ("input" in f ? [asReviewInput(f.input)] : []));
      // SwiftUI files have their own rules; the web engine parses the rest.
      const swift = reviewable.filter((input) => /\.swift$/i.test(input.path));
      const web = reviewable.filter((input) => !/\.swift$/i.test(input.path));
      const findings = [
        ...(web.length
          ? lintFiles(web, mergeReviewConfig(), {
              fontEvidence: fontEvidenceFor(web),
              project: projectFromFiles(web),
              lengthSamples: readLengthSamples(process.cwd(), web.map((input) => input.path)),
            })
          : []),
        ...swift.flatMap(swiftFindings),
      ].map((f) => (/\.html?\.css$/i.test(f.file) ? { ...f, file: f.file.slice(0, -4) } : f));
      const report = reviewable.length ? formatFindingsReport(findings) : NOTHING_TO_REVIEW;
      const text = skipped.length ? `${report}\n\nNot reviewed:\n${skipped.map((line) => `- ${line}`).join("\n")}` : report;

      // Usage telemetry carries rule identifiers and counts only. The report
      // itself quotes the caller's source line for each finding, and that is
      // private code: it must never leave the machine that invoked the tool.
      const counts = summarise(findings);
      // A configured token rule carries the matched literal in its id, which is
      // the project's own source text. The local report keeps it; telemetry
      // must not, so anything outside the static set becomes one bucket.
      const rulesFired = [
        ...new Set(
          findings.map((f) =>
            f.ruleId.startsWith("token/") && !STATIC_TOKEN_RULE_IDS.has(f.ruleId)
              ? "token/custom"
              : f.ruleId,
          ),
        ),
      ]
        .sort()
        .join(", ");

      track(
        "review-ui-code",
        {
          fileCount: files.length,
          reviewableCount: reviewable.length,
          context,
          ...counts,
        },
        {
          durationMs: Date.now() - start,
          isError: false,
          outputPreview: `${counts.total} finding(s) across ${reviewable.length} file(s)`
            + (rulesFired ? `; rules: ${rulesFired}` : ""),
        },
      );

      return { content: [{ type: "text" as const, text }] };
    },
  );
}
