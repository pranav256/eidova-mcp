/**
 * review-illustration: looks at an SVG the agent drew and says what is wrong.
 *
 * The agent calling this is already a capable model, so it draws. What it
 * cannot do is see its own output: it writes markup blind, and never notices
 * the shape that does not close or the part floating unattached until somebody
 * looks. This opens the drawing in a real browser and looks.
 *
 * One request, one answer, under 4 seconds. An earlier version generated the
 * drawing on our side and needed a background job and a polling tool; both are
 * gone, along with the dozen expensive model calls each drawing cost us.
 */
import { z } from "zod";
import { principleErrorResponse, runGuidanceTool } from "./principle-tools";
import {
  APP_BASE_URL,
  CONTEXT_ARG,
  READ_ONLY_TOOL_ANNOTATIONS,
  mcpClientName,
  trackSearch,
  type RegisterToolDeps,
} from "./shared";

const REVIEW_OUTPUT_SCHEMA = {
  /** Empty when nothing is visibly wrong. */
  faults: z.array(z.string()),
  /** Group ids in paint order, the parts an animation can target. */
  layers: z.array(z.string()),
  /** False when the markup was refused; faults says why. */
  reviewed: z.boolean(),
  /** True when the drawing could not be rendered, so only structure was checked. */
  unseen: z.boolean(),
  /** Pass this back to review the same drawing again without spending another credit. */
  reviewToken: z.string(),
  message: z.string(),
};

function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    structuredContent: {
      faults: [message],
      layers: [],
      reviewed: false,
      unseen: true,
      reviewToken: "",
      message,
    },
  };
}

export function registerIllustrationTools({
  server,
  provider,
  track,
  tracked,
  authContext,
  userId,
  apiFetch = globalThis.fetch,
}: RegisterToolDeps): void {
  const authHeaders = () => {
    /** The values `headers` maps its keys onto. */
    interface HeadersTable {
      [key: string]: string;
    }

    const headers: HeadersTable = { "Content-Type": "application/json" };
    if (authContext) {
      const bearer = authContext.kind === "api-key" ? authContext.apiKey : authContext.accessToken;
      headers.Authorization = `Bearer ${bearer}`;
    }
    return headers;
  };

  server.registerTool(
    "get-illustration-guide",
    {
      title: "Get Illustration Guide",
      description: `Load Better Design's guide for figures that explain a technical idea: an isometric drawing of a small machine whose working is the idea, instead of boxes and arrows. [BD-1143]

Use it when the user wants an illustration, diagram or explainer figure for docs, a blog post, a landing page or a launch, that shows how a system, algorithm or component works.

Topics:
- isometric-concept: pick a real object whose movement is the idea
- isometric-parts: the parts list, the detail and the tones, coloured by the design system
- isometric-camera-and-depth: the camera, shading by facing, painting far to near
- isometric-lines: every line ends on a part; no labels inside the drawing
- isometric-card-and-motion: the card, the live readout, motion and accessibility
- isometric-kit: install our kit and draw with it
- isometric-review: check the render, then review-illustration with style "isometric"

Call get-illustration-guide({ topic: "isometric-concept" }) first, or get-illustration-guide({}) for the index.`,
      inputSchema: z.object({
        topic: z.string().trim().min(1).max(120).optional()
          .describe("A topic or alias, for example isometric-concept or isometric-kit."),
        query: z.string().trim().min(1).max(500).optional()
          .describe("The figure or the problem in plain words."),
        maxTokens: z.number().min(500).max(50000).optional()
          .describe("Maximum tokens to return. Recommended: 5000-10000."),
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ topic, query, maxTokens, context }) => {
      const start = Date.now();
      try {
        const { response, capture } = await runGuidanceTool(
          provider,
          userId,
          mcpClientName(server),
          "illustration",
          "Illustration",
          "get-illustration-guide",
          { topic, query, maxTokens },
        );
        return trackSearch(track, "get-illustration-guide", { ...capture, context }, start, response);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return trackSearch(
          track,
          "get-illustration-guide",
          { query, topic, topResults: [], context },
          start,
          principleErrorResponse(message),
          true,
          message,
        );
      }
    },
  );

  server.registerTool(
    "review-illustration",
    {
      title: "Review an Illustration",
      description: `Look at an SVG illustration you drew and get back what is visibly wrong with it.

You write SVG blind. This renders it in a real browser and judges it against this project's illustration principles, so you find out that a shape does not close, a part floats unattached, the light comes from two directions, or contents sit outside the container meant to hold them.

Use it whenever you have drawn an illustration, before you hand it to anyone. Drawing something worth shipping usually takes 2 or 3 rounds.

How to call it:
1. Get the rules first with \`get-ui-principle({ topic: "svg-illustration" })\` and draw against them. For an isometric technical figure, use \`get-illustration-guide\` and pass \`style: "isometric"\`.
2. \`review-illustration({ svg, intent: "an open inbox tray with letters" })\`. Say what the drawing is meant to be, in your own words.
3. Fix what \`faults\` names, then call again passing \`reviewToken\` back. Reviewing the same drawing again costs nothing while that token is valid.
4. Stop when \`faults\` is empty.

Markup carrying script, event handlers, remote references, or styles that reach outside the drawing is refused rather than cleaned, so the drawing you fix is the drawing you sent.`,
      inputSchema: z.object({
        svg: z.string().min(1).describe("The complete svg element you drew."),
        intent: z
          .string()
          .min(1)
          .describe('What it is meant to be, in plain words. For example "an open inbox tray with letters".'),
        animated: z
          .boolean()
          .optional()
          .describe("Set when the drawing was meant to move, so the motion checks apply."),
        style: z
          .enum(["flat", "isometric"])
          .optional()
          .describe('Use "isometric" for a figure drawn with get-illustration-guide, so it is judged by those rules.'),
        reviewToken: z
          .string()
          .optional()
          .describe("The token from a previous review of this drawing. Reviews it again free."),
      }),
      outputSchema: REVIEW_OUTPUT_SCHEMA,
      // A review without a valid reviewToken passes the paywall, so it spends
      // an illustration credit. That debit is a state change, and a repeat of
      // the same call spends another one, so this tool is neither read-only nor
      // idempotent. It creates no design system, project or file, and it
      // renders the caller's own markup on Better Design. [BD-316]
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({
      svg,
      intent,
      animated,
      style,
      reviewToken,
    }: {
      svg: string;
      intent: string;
      animated?: boolean;
      style?: "flat" | "isometric";
      reviewToken?: string;
    }) =>
      tracked(
        "review-illustration",
        { query: intent, animated, style, repeat: Boolean(reviewToken) },
        async () => {
          try {
            const res = await apiFetch(`${APP_BASE_URL}/api/illustrations/review`, {
              method: "POST",
              headers: authHeaders(),
              signal: AbortSignal.timeout(60_000),
              body: JSON.stringify({ svg, intent, animated: animated ?? false, style, reviewToken }),
            });
            if (!res.ok) {
              const detail = await res.text().catch(() => "");
              return fail(`Could not review that drawing (HTTP ${res.status}). ${detail.slice(0, 300)}`);
            }

            // SAFETY: the JSON contract of this payload; the producing side owns the shape.
            const body = (await res.json()) as {
              faults?: string[];
              layers?: string[];
              reviewed?: boolean;
              unseen?: boolean;
              reviewToken?: string;
            };
            const faults = body.faults ?? [];
            const layers = body.layers ?? [];

            const message = !body.reviewed
              ? (faults[0] ?? "That drawing was not reviewed.")
              : faults.length === 0
                ? "Nothing visibly wrong. The drawing is ready to use."
                : [
                    `${faults.length} thing${faults.length === 1 ? "" : "s"} to fix:`,
                    ...faults.map((f) => `- ${f}`),
                    body.unseen
                      ? "The drawing could not be rendered, so only its structure was checked."
                      : "",
                    body.reviewToken
                      ? "Fix these and call again with the same reviewToken, which costs nothing."
                      : "Fix these and call again.",
                  ]
                    .filter(Boolean)
                    .join("\n");

            return {
              content: [
                {
                  type: "text" as const,
                  text: layers.length
                    ? `${message}\n\nLayers, in paint order: ${layers.join(", ")}.`
                    : message,
                },
              ],
              structuredContent: {
                faults,
                layers,
                reviewed: body.reviewed ?? false,
                unseen: body.unseen ?? false,
                reviewToken: body.reviewToken ?? "",
                message,
              },
            };
          } catch (err) {
            return fail(
              `Could not reach the review service: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        },
      ),
  );

}
