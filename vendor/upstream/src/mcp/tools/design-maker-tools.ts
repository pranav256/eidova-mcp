import { z } from "zod";
import { APP_BASE_URL, authHeaders, type McpAuthContext, type RegisterToolDeps } from "./shared";

// One step makes one hosted sales asset: a sales page with its one-page PDF,
// or a social image. Each tool posts to POST /api/v1/assets, the same endpoint
// Zapier and the Clay columns call, so the price, the writing, the drawn
// visual and the links match. [BD-1175] [BD-1236]

/** The links POST /api/v1/assets answers with, before the asset is ready. */
type AssetLinks = z.infer<typeof assetLinksSchema>;

type AssetKind = "sales-page" | "social-image";

type ToolText = { content: Array<{ type: "text"; text: string }>; isError: true };

const errorResult = (text: string): ToolText => ({ content: [{ type: "text", text }], isError: true });

// A connection with no credential, such as the npm server without a key,
// cannot call /api/v1 at all. Say what to use instead.
const NEEDS_API_KEY =
  "Making a sales page or a social image needs a Better Design API key. Create one at https://better-design.com/mcp/install and connect with it, or call POST https://better-design.com/api/v1/assets with the key.";
// The route refused the key or the connector session's token. [BD-1337]
const CREDENTIAL_REFUSED =
  "Better Design refused this connection's credential. Reconnect Better Design, or create an API key at https://better-design.com/mcp/install and connect with it.";

// The paywall answers 429 for a spent balance, the same status as the rate
// limit, so only its message tells the two apart: "You have run out of
// credits" for an account, the claim nudge for a provisioned agent key.
const OUT_OF_CREDITS = /run out of credits|free Better Design queries|free trial/i;

// The prices in ASSET_COST (packages/server/src/lib/assets/input.ts).
const CREDITS_TEXT = "A sales page spends 3 credits, its PDF included, and a social image spends 2.";
// The paywall's message names the refill date and the Pro offer, so the link is added only when it is missing.
const UPGRADE_TEXT = "Upgrade at https://better-design.com/pricing.";

/** Turns the server's error answer into one sentence the person can act on. */
function designErrorText(status: number, message: string | undefined): string {
  const detail = message?.trim();
  if (status === 401) return CREDENTIAL_REFUSED;
  if ((status === 429 || status === 402) && detail && OUT_OF_CREDITS.test(detail)) {
    // The agent nudge carries its own claim link, so it goes out as sent.
    if (/free Better Design queries/i.test(detail)) return detail;
    const upgrade = /better-design\.com\/pricing/.test(detail) ? "" : ` ${UPGRADE_TEXT}`;
    return `${detail.replace(/\.$/, "")}. ${CREDITS_TEXT}${upgrade}`;
  }
  if (status === 429) return `Better Design is rate limiting this key. ${detail ?? "Try again in a minute."}`;
  if (status === 403) {
    return detail || "Public designs need an account with a verified email. Claim your key at https://better-design.com.";
  }
  return `Better Design could not make this design (HTTP ${status}).${detail ? ` ${detail}` : ""}`;
}

// The two answers POST /api/v1/assets gives: the pending asset's links, or an error.
const assetLinksSchema = z.object({
  id: z.string(),
  status: z.string(),
  viewUrl: z.string(),
  imageUrl: z.string().nullable(),
  pdfUrl: z.string().nullable(),
});

const issuesSchema = z.array(z.object({ path: z.array(z.union([z.string(), z.number()])).optional(), message: z.string() }));

/**
 * The route's validator (@hono/zod-validator on zod 4) answers
 * `{ success: false, error: { name: "ZodError", message } }`, where `message`
 * is zod's issue list as a JSON string.
 */
const validatorIssues = z.string().transform((text, ctx) => {
  try {
    return issuesSchema.parse(JSON.parse(text));
  } catch {
    ctx.addIssue({ code: "custom", message: "Not an issue list." });
    return z.NEVER;
  }
});

const designErrorSchema = z.object({
  /** An app error: `{ code, message }`. */
  message: z.string().optional(),
  /** An input the route's validator rejected. */
  error: z.object({ message: z.string() }).optional(),
});

/** The server's error message: the app error's, or the first rejected field. */
function readErrorMessage(payload: z.infer<typeof designErrorSchema> | undefined): string | undefined {
  if (payload?.message) return payload.message;
  if (!payload?.error) return undefined;
  const issues = validatorIssues.safeParse(payload.error.message);
  if (!issues.success) return payload.error.message;
  const issue = issues.data[0];
  if (!issue) return undefined;
  const path = issue.path?.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

async function makeAsset(
  apiFetch: typeof fetch,
  authContext: McpAuthContext | undefined,
  kind: AssetKind,
  fields: Record<string, string | undefined>,
): Promise<AssetLinks | ToolText> {
  if (!authContext) return errorResult(NEEDS_API_KEY);
  const url = `${APP_BASE_URL}/api/v1/assets`;
  let res: Response;
  try {
    // A connector session sends its OAuth token; the route takes both. [BD-1337]
    res = await apiFetch(url, {
      method: "POST",
      headers: { ...authHeaders(authContext), "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ...fields }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    return errorResult(`Network error calling ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const raw = await res.json().catch(() => undefined);
  if (!res.ok) return errorResult(designErrorText(res.status, readErrorMessage(designErrorSchema.safeParse(raw).data)));
  const links = assetLinksSchema.safeParse(raw);
  if (!links.success) return errorResult("Better Design started the design but sent links this tool could not read.");
  return links.data;
}

const designSystemId = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{1,64}$/)
  .describe("A catalog design system id from find-design-system, for example \"cashmere\". It sets the colours and type.");

// The same checks the server runs, so a bad field fails before the round trip.
const webUrl = (what: string) =>
  z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine((value) => /^https?:\/\//i.test(value), "Use an http or https link.")
    .describe(what);

const text = (max: number, what: string) => z.string().trim().min(1).max(max).describe(what);
const optionalText = (max: number, what: string) => z.string().trim().max(max).optional().describe(what);

// The fields every asset needs, as POST /api/v1/assets takes them.
const leadFields = {
  designSystemId,
  company: text(120, "The account's company name."),
  website: webUrl("The account's website, for example https://acme.com."),
  offer: text(1200, "What you offer this account and what it gets."),
  ctaUrl: webUrl("Where the call to action goes, for example your calendar link."),
  notes: optionalText(2000, "Optional. What you know about the account: its business, its problem, the conversation so far."),
};

const salesPageInput = z.object({
  ...leadFields,
  ctaLabel: optionalText(40, "Optional. The button label, for example \"Book a call\"."),
  headline: optionalText(160, "Optional. The page's headline. Left out, Better Design writes it."),
  problem: optionalText(600, "Optional. The problem the account has today. Left out, Better Design writes it."),
  proof1: optionalText(200, "Optional. A proof point, such as a result or a customer quote."),
  proof2: optionalText(200, "Optional. A second proof point."),
  proof3: optionalText(200, "Optional. A third proof point."),
});

const socialImageInput = z.object({
  ...leadFields,
  // The image draws at most 120 characters (packages/server/src/lib/assets/copy.ts).
  headline: optionalText(120, "Optional. The image's headline. Left out, Better Design writes it."),
});

// Said with every answer, because the links come back before the asset is drawn.
const PENDING_TEXT = "The page link shows progress until the asset is ready. The image and PDF links work once it is ready.";

// Each call charges credits and publishes a new public link, so it writes, is
// not idempotent, and reaches past Better Design's own data. It replaces
// nothing. See `docs/mcp-tool-annotations.md`.
const MAKER_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

/** Registers make-sales-page and make-social-image. */
export function registerDesignMakerTools({ server, tracked, authContext, apiFetch = globalThis.fetch }: RegisterToolDeps): void {
  server.registerTool(
    "make-sales-page",
    {
      title: "Make a Sales Page",
      description: `Make a hosted sales page for one account, with the same page as a one-page PDF, in a catalog design system. Pass the account's company, website, offer and call-to-action link. Better Design writes the headline and the copy you leave out, and draws the page's visual.

Each call spends 3 Better Design credits and returns public links at once: \`viewUrl\` shows progress, then the page, for anyone who has it; \`imageUrl\` is a PNG of the page and \`pdfUrl\` the PDF, both working once the page is ready. Take \`designSystemId\` from find-design-system. It needs a Better Design account with a verified email.`,
      inputSchema: salesPageInput,
      annotations: MAKER_ANNOTATIONS,
    },
    async (fields) =>
      tracked("make-sales-page", { designSystemId: fields.designSystemId }, async () => {
        const made = await makeAsset(apiFetch, authContext, "sales-page", fields);
        if ("content" in made) return made;
        return {
          content: [{ type: "text" as const, text: `Sales page: ${made.viewUrl}\nImage: ${made.imageUrl}\nPDF: ${made.pdfUrl}\n${PENDING_TEXT}` }],
          structuredContent: { ...made, note: PENDING_TEXT },
        };
      }),
  );

  server.registerTool(
    "make-social-image",
    {
      title: "Make a Social Image",
      description: `Make a LinkedIn-size social image for one account, in a catalog design system. Pass the account's company, website, offer and call-to-action link. Better Design writes the headline when you leave it out, and draws the image.

Each call spends 2 Better Design credits and returns public links at once: \`viewUrl\` shows progress, then the image's page; \`imageUrl\` is the PNG once it is ready. Take \`designSystemId\` from find-design-system. It needs a Better Design account with a verified email.`,
      inputSchema: socialImageInput,
      annotations: MAKER_ANNOTATIONS,
    },
    async (fields) =>
      tracked("make-social-image", { designSystemId: fields.designSystemId }, async () => {
        const made = await makeAsset(apiFetch, authContext, "social-image", fields);
        if ("content" in made) return made;
        return {
          content: [{ type: "text" as const, text: `Social image: ${made.imageUrl}\nPage: ${made.viewUrl}\n${PENDING_TEXT}` }],
          structuredContent: { ...made, note: PENDING_TEXT },
        };
      }),
  );
}
