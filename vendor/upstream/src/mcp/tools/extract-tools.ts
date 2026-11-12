import { BUILD_LOOP } from "../build-loop";
import { z } from "zod";
import type { RegisterToolDeps } from "./shared";
import {
  APP_BASE_URL,
  authHeaders,
  READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS,
  READ_ONLY_TOOL_ANNOTATIONS,
  truncateToTokens,
} from "./shared";
import { baseScheme, brandMaterial, collectCssVars, formatExtraction, summarizeExtraction, type BrandMaterial, type ExtractionSummary } from "../extract-design-system";
import { redactUrl } from "../../redact";
import type { DsTopResult } from "../../design-systems/record-search";
import { buildRoleSampleScript, extractFromSources, type BrandSource } from "../brand-sources";

// extract-design-system: the inverse of the catalog tools. Reads the CSS the
// user already has (globals.css / Tailwind v4 @theme) and returns an
// oklch-normalized semantic token sheet so an agent can style new components to
// match the existing app. Pure compute (no DB, no DataProvider) — the agent
// reads the file and pastes the CSS, since the MCP server has no filesystem
// access to the caller's repo.

// A token sheet carries the brand, not the technique. A user who points at a
// site usually also means "and that gradient", which no token records, so every
// extraction closes by naming the principle that reads the rest of the reference.
const REFERENCE_NOTE = [
  "What this sheet does not carry: an oversized blurred gradient, a frosted panel, a glow, a stagger on load, an easing curve.",
  "When the user points at an effect like that, read it as a layer stack with `get-ui-principle({ topic: \"reading-a-reference\" })`.",
  "Label each claim Measured, Derived, or Inferred.",
  "Then rebuild it in the user's project from the owning principle, with these tokens.",
].join(" ");

/**
 * The steps after an extraction: the build loop first, then the reference note.
 * The text and the structured result both carry them, since Claude Code shows
 * the model the structured result in place of the text. [BD-1147] [BD-1148]
 */
const NEXT_STEPS = `${BUILD_LOOP}\n\n${REFERENCE_NOTE}`;

/**
 * A structured result with the loop as its first key. The loop is written again
 * after the summary, so a summary field of the same name can never replace it,
 * while the key keeps its first place. [BD-1148]
 */
/**
 * The line a two-theme site gets before anything else. Agents read the theme
 * rule in the loop and still took a light kit for a site that ships dark too,
 * so the decision now leads the result. [BD-1152]
 */
const DUAL_THEME_NOTE =
  "This site has a light and a dark theme and follows the visitor's system setting. Build both from its extracted tokens, switched with `prefers-color-scheme`.";

/**
 * The line a one-theme site gets first. An agent given a light-only site still
 * added a system-setting dark mode, so viewers in dark mode saw an off-brand
 * screen. [BD-1152]
 */
function singleThemeNote(scheme: "light" | "dark"): string {
  const other = scheme === "light" ? "dark" : "light";
  return `This site has a ${scheme} theme only. Ship that scheme alone: do not add a ${other} mode or a \`prefers-color-scheme\` switch the brand does not have.`;
}

/**
 * Fills `paintedScheme` for an API answer that lacks it: one cached before the
 * API read the background, or from a server deployed before this change. Drop
 * it once those cache entries have expired. [BD-1152]
 */
function withPaintedScheme(input: ExtractionSummary): ExtractionSummary {
  // An answer from a server deployed before BD-1309 carries no material, so it is read here.
  const summary = input.material || !input.tokensCss ? input : { ...input, material: brandMaterial(input.tokensCss) };
  if (summary.paintedScheme || summary.themeMode !== "light" || !summary.tokensCss) return summary;
  const painted = baseScheme(collectCssVars(summary.tokensCss).light);
  return painted ? { ...summary, themeMode: painted, paintedScheme: painted } : summary;
}

type ThemeFacts = { themeMode?: string; paintedScheme?: "light" | "dark"; material?: BrandMaterial };

/**
 * A flat brand gives colour and type but no material, so copying it as-is ships
 * flat buttons and cards. The lead sends the build to a catalog system for the
 * components and keeps the brand on top. [BD-1309]
 */
const FLAT_BRAND_NOTE = "This brand is flat: its tokens set no shadow or gradient, so they give you colour, font and radius but no material. Take the components from a catalog system: call `find-design-system` with the brand's look, pick a system whose scheme matches, call `get-design-system-kit`, then set that system's primary, font and radius to the brand's values below. Keep the brand's colour and type, and take the material of the buttons, cards and inputs from the system.";

/** The theme line that leads an extraction's next steps, or nothing when the scheme is unknown. */
function themeLead({ themeMode, paintedScheme }: ThemeFacts): string {
  if (themeMode === "dual") return `${DUAL_THEME_NOTE}\n\n`;
  // A one-theme claim needs a background that was read: a guess must not forbid a scheme.
  if (paintedScheme) return `${singleThemeNote(paintedScheme)}\n\n`;
  return "";
}

/** The flat-brand note, placed right after the loop so the loop still leads. */
function materialNote({ material }: ThemeFacts): string {
  return material === "flat" ? `\n\n${FLAT_BRAND_NOTE}` : "";
}

/** The next steps for one extraction, led by the site's theme note. */
function nextStepsFor(facts: ThemeFacts): string {
  return `${themeLead(facts)}${NEXT_STEPS}${materialNote(facts)}`;
}

function withLoopFirst<T extends ThemeFacts>(summary: T): { buildInstructions: string } & T {
  const steps = nextStepsFor(summary);
  return Object.assign({ buildInstructions: steps }, summary, { buildInstructions: steps });
}

// The note always lands, so the sheet gives up its budget rather than the
// note overrunning the maxTokens the schema promises. Same 4-chars-per-token
// estimate truncateToTokens uses, plus one token for the blank line between.
const NOTE_TOKENS = Math.ceil((NEXT_STEPS.length + FLAT_BRAND_NOTE.length) / 4) + 1;

function fitSheet(text: string, maxTokens?: number): string {
  if (!maxTokens) return text;
  // No floor here: the schema's minimum of 500 already leaves the sheet about
  // 400 tokens, and a floor would push the total past the promised limit.
  return truncateToTokens(text, Math.max(0, maxTokens - NOTE_TOKENS));
}

function withNextSteps(text: string, facts: ThemeFacts = {}): string {
  return `${themeLead(facts)}${BUILD_LOOP}${materialNote(facts)}\n\n${text}\n\n${REFERENCE_NOTE}`;
}

/** The site a brand read names in the session ledger: its host, without a `www.`. */
function siteId(url: string, fallback?: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return fallback ?? "site";
  }
}

/** Registers the two brand-extraction tools on an MCP server: paste sources, or point at a live URL. */
export function registerExtractTools({ server, tracked, authContext, apiFetch = globalThis.fetch }: RegisterToolDeps): void {
  server.registerTool(
    "extract-design-system",
    {
      title: "Extract Design System From Existing Code",
      description: `Distill the design tokens out of a project's EXISTING CSS so new components match the app the user already built.

Use this when the user says "match our existing style", "use our design system", "style this like the rest of the app", or you are adding UI to a codebase that already has its own look. This is the inverse of find-design-system / create-design-system: instead of giving the user one of our systems, it reads theirs.

How to use it: read the project's \`globals.css\` (or wherever the design tokens / CSS custom properties live, e.g. a Tailwind v4 \`@theme\` block) and pass its full contents as \`css\`. The MCP server cannot read your filesystem, so you must paste the text.

Returns: the semantic palette (primary, background, foreground, accent, border, ring, etc.), radius, fonts, and shadow scale, plus a pasteable token sheet with every color normalized to \`oklch()\`. Handles hex, rgb()/rgba(), hsl()/hsla(), named colors, bare Shopify "r,g,b" triplets, and existing oklch values, across \`:root\`, \`.dark\`, and \`@theme\` blocks.

Beyond pasted CSS, \`sources\` accepts any mix of inputs and merges them (later sources win):
- kind "css": any stylesheet text, same as the \`css\` param.
- kind "computed": a JSON sample of rendered styles read off the LIVE site, which beats variable-name guessing because it records what elements actually look like. Gather it by running this in the site's browser console and passing the printed JSON:
\`\`\`js
JSON.stringify(${buildRoleSampleScript()})
\`\`\`
- kind "tokens": a design-tokens JSON export ($value entries, W3C format or the Figma variables API shape with 0..1 rgb floats).

Common vendor names (Shopify's --color-button family) are mapped into empty semantic slots automatically and the mapping is reported in the output.`,
      inputSchema: z.object({
        css: z.string().trim().min(1).max(200_000).optional()
          .describe("Full contents of the project's globals.css (or any CSS holding the design tokens / CSS custom properties). Optional when `sources` is given."),
        sources: z.array(z.object({
          name: z.string().trim().min(1).max(120)
            .describe("Label for this source, e.g. 'globals.css', 'live site sample', 'figma variables'."),
          kind: z.enum(["css", "computed", "tokens"]).optional()
            .describe("Omit to infer: JSON with $value entries is tokens, JSON keyed by UI roles is computed, anything else is CSS."),
          content: z.string().trim().min(1).max(200_000),
        })).max(10).optional()
          .describe("Any mix of brand sources, merged in order (later sources win). See the tool description for how to gather each kind."),
        name: z.string().trim().min(1).max(120).optional()
          .describe("Optional label for the extracted system, e.g. the app or repo name."),
        maxTokens: z.number().min(500).max(50000).optional()
          .describe("Maximum tokens to return. Truncates the token sheet to fit."),
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ css, sources, name, maxTokens }) =>
      tracked("extract-design-system", { name: name ?? null, sourceCount: (sources?.length ?? 0) + (css ? 1 : 0) }, async () => {
        const all: BrandSource[] = [
          ...(css ? [{ name: "pasted css", kind: "css" as const, content: css }] : []),
          ...(sources ?? []),
        ];
        if (all.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: "Nothing to extract: pass `css`, or one or more `sources`.",
            }],
          };
        }
        const result = extractFromSources(all, name);
        const text = fitSheet(formatExtraction(result), maxTokens);
        return {
          content: [{ type: "text" as const, text: withNextSteps(text, result) }],
          structuredContent: withLoopFirst(summarizeExtraction(result)),
        };
      }),
  );

  server.registerTool(
    "extract-from-url",
    {
      title: "Extract Design System From a Live Site",
      description: `Point Better Design at a URL and get the site's brand back as an oklch token sheet, without pasting anything.

Use this when the user names their site ("match uclips.eu", "use our website's style") or hands you any public URL whose look should be reused. Server side, Better Design fetches the page's stylesheets AND renders the page in a headless browser to sample what role elements actually look like (body, heading, link, button, input, card), then merges both, rendered truth last. That reads the brand even when the site's variable names are unrecognizable.

Slow by nature (a real browser loads the page): expect 10 to 45 seconds. For CSS the user already has locally, prefer extract-design-system, which is instant.`,
      inputSchema: z.object({
        url: z.string().trim().min(8).max(2048)
          .describe("Public http(s) URL of the page to read, usually the homepage."),
        name: z.string().trim().min(1).max(120).optional()
          .describe("Optional label for the extracted system. Defaults to the site's hostname."),
        maxTokens: z.number().min(500).max(50000).optional()
          .describe("Maximum tokens to return. Truncates the token sheet to fit."),
      }),
      // Reads any public page the user names, so the set of hosts it reaches is
      // the open web, not Better Design's catalog. It stores nothing. [BD-316]
      annotations: READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS,
    },
    async ({ url, name, maxTokens }) => {
      // `tracked` reads these params once the run has settled, so the run adds
      // the site as its one result when the read found a primary colour. The
      // session ledger reads that row as the design system choice and stops
      // asking for a catalog system. [BD-1337]
      const topResults: DsTopResult[] = [];
      return tracked("extract-from-url", { query: redactUrl(url), topResults }, async () => {
        const params = new URLSearchParams({ url });
        if (name) params.set("name", name);
        const res = await apiFetch(`${APP_BASE_URL}/api/v1/brand-extract/from-url?${params}`, {
          headers: authHeaders(authContext),
          signal: AbortSignal.timeout(90_000),
        });
        if (!res.ok) {
          // SAFETY: the JSON contract of this payload; the producing side owns the shape.
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          return {
            content: [{
              type: "text" as const,
              // The loop survives a failed extraction, so the agent still runs the
              // principles and the review on what it builds instead. [BD-1148]
              text: `${`Could not extract from that URL (HTTP ${res.status}). ${body.message ?? ""}`.trim()}\n\n${BUILD_LOOP}`,
            }],
            isError: true,
          };
        }
        // SAFETY: the JSON contract of this payload; the producing side owns the shape.
        const body = (await res.json()) as { markdown: string; notes?: string[]; summary?: ExtractionSummary };
        // The degradation note leads, so truncation can never silently drop it.
        const raw = body.notes?.length ? `> ${body.notes.join("\n> ")}\n\n${body.markdown}` : body.markdown;
        const text = fitSheet(raw, maxTokens);
        const summary = body.summary && withPaintedScheme(body.summary);
        // An answer cached before the API returned `summary` has none, so the
        // text alone goes back until that cache entry expires. [BD-1142]
        const result = {
          content: [{ type: "text" as const, text: withNextSteps(text, summary) }],
          ...(summary && { structuredContent: withLoopFirst(summary) }),
        };
        // Named last, so a read that fails on its way out never counts as the choice.
        if (summary?.primary) topResults.push({ id: siteId(url, summary.name) });
        return result;
      });
    },
  );
}
