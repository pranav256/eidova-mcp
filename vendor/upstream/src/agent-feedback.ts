import { z } from "zod";

// The report an agent sends to `POST /api/v1/feedback`. The route validates it,
// `GET /api/v1/feedback` publishes it, and the `send-feedback` MCP tool
// advertises it, so all three read this one module. It imports nothing from
// the schema, because many tests replace that module with a partial mock and
// the MCP server loads this one. [BD-956]

/** What an agent reports through `POST /api/v1/feedback`. [BD-956] */
export const agentFeedbackKindValues = [
  "bug",
  "missing-feature",
  "wrong-output",
  "docs-gap",
  "other",
] as const;

const TEXT_MAX = 4000;
const SURFACE_MAX = 200;
const SUMMARY_MAX = 500;
/** Longest `client` value the route accepts, in characters. [BD-956] */
export const AGENT_FEEDBACK_CLIENT_MAX = 100;

const FIELD_DESCRIPTIONS = {
  kind: "What kind of problem this is.",
  surface: "The endpoint path or MCP tool name you called.",
  summary: "One sentence: what is wrong or missing.",
  attempted: "What you tried to do, and the request you sent.",
  expected: "What you expected to get back.",
  actual: "What you got back instead.",
  client: "Your agent name and version.",
} as const;

const optionalText = (description: string) =>
  z.string().trim().max(TEXT_MAX).optional().describe(description);

/** The body an agent posts to `POST /api/v1/feedback`. [BD-956] */
export const agentFeedbackInputSchema = z.object({
  kind: z.enum(agentFeedbackKindValues).describe(FIELD_DESCRIPTIONS.kind),
  surface: z.string().trim().min(1).max(SURFACE_MAX).describe(FIELD_DESCRIPTIONS.surface),
  summary: z.string().trim().min(1).max(SUMMARY_MAX).describe(FIELD_DESCRIPTIONS.summary),
  attempted: optionalText(FIELD_DESCRIPTIONS.attempted),
  expected: optionalText(FIELD_DESCRIPTIONS.expected),
  actual: optionalText(FIELD_DESCRIPTIONS.actual),
  client: z.string().trim().max(AGENT_FEEDBACK_CLIENT_MAX).optional().describe(FIELD_DESCRIPTIONS.client),
});

/** A validated agent report, before redaction. */
export type AgentFeedbackInput = z.infer<typeof agentFeedbackInputSchema>;

/** What `POST /api/v1/feedback` answers once it has stored a report. */
export interface AgentFeedbackReceipt {
  id: string;
  status: string;
  message: string;
}

/**
 * The self-description `GET /api/v1/feedback` returns, so an agent can learn
 * the report shape from the API itself instead of from docs. [BD-956]
 */
export const AGENT_FEEDBACK_CONTRACT = {
  method: "POST",
  path: "/api/v1/feedback",
  purpose:
    "Tell Better Design about a bug or a missing feature you hit while calling this API. A person reads every report.",
  fields: {
    kind: { required: true, description: FIELD_DESCRIPTIONS.kind, oneOf: agentFeedbackKindValues },
    surface: { required: true, description: FIELD_DESCRIPTIONS.surface, maxLength: SURFACE_MAX },
    summary: { required: true, description: FIELD_DESCRIPTIONS.summary, maxLength: SUMMARY_MAX },
    attempted: { required: false, description: FIELD_DESCRIPTIONS.attempted, maxLength: TEXT_MAX },
    expected: { required: false, description: FIELD_DESCRIPTIONS.expected, maxLength: TEXT_MAX },
    actual: { required: false, description: FIELD_DESCRIPTIONS.actual, maxLength: TEXT_MAX },
    client: { required: false, description: FIELD_DESCRIPTIONS.client, maxLength: AGENT_FEEDBACK_CLIENT_MAX },
  },
  notes: [
    "Send it with your Better Design API key: Authorization: Bearer <key>.",
    "Do not include secrets or personal data. Known secret shapes are removed before storage.",
    "Sending feedback never spends credit.",
  ],
} as const;
