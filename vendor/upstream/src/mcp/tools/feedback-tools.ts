import {
  AGENT_FEEDBACK_CLIENT_MAX,
  agentFeedbackInputSchema,
  type AgentFeedbackInput,
  type AgentFeedbackReceipt,
} from "../../agent-feedback";
import { APP_BASE_URL, type RegisterToolDeps } from "./shared";

/**
 * Sends one report to `POST /api/v1/feedback` with the connection's credential:
 * the API key, or a connector session's OAuth token. The stdio client sends it
 * with the key from its environment; the Worker sends it through its own
 * service binding. [BD-956] [BD-1337]
 */
export type SendAgentFeedback = (report: AgentFeedbackInput) => Promise<AgentFeedbackReceipt>;

/**
 * The Worker's sender for a connection. It posts through `apiFetch` with the
 * connection's bearer, so the route's credential check, rate limits and
 * redaction apply as for any other caller. [BD-956] [BD-1337]
 */
export function createFeedbackSender(apiFetch: typeof fetch, bearer: string): SendAgentFeedback {
  return async (report) => {
    const res = await apiFetch(`${APP_BASE_URL}/api/v1/feedback`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(15_000),
    });
    // SAFETY: the JSON contract of this payload; the producing side owns the shape.
    const body = (await res.json().catch(() => ({}))) as Partial<AgentFeedbackReceipt>;
    if (!res.ok || !body.id) throw new Error(body.message ?? `HTTP ${res.status}`);
    return { id: body.id, status: body.status ?? "open", message: body.message ?? "" };
  };
}

// The tool fills `client` from the MCP handshake, so the agent is not asked.
const reportSchema = agentFeedbackInputSchema.omit({ client: true });

/**
 * Registers `send-feedback`, which lets an agent report a bug or a missing
 * feature it hit. Without a sender the transport has no credential to send the
 * report with, so the tool is left out.
 */
export function registerFeedbackTools(
  { server, tracked }: RegisterToolDeps,
  sendFeedback?: SendAgentFeedback,
): void {
  if (!sendFeedback) return;
  server.registerTool(
    "send-feedback",
    {
      title: "Send Feedback",
      description: `Tell Better Design about a bug, a missing feature or wrong output you hit while using its tools or API. A person reads every report and approves any fix.

Send one report per problem, once you have finished what the user asked. Say what you tried, what you expected and what came back. Leave out secrets, personal data and the user's private code. Sending a report never spends credit.`,
      inputSchema: reportSchema,
      // Each call stores one new report and publishes nothing. See
      // `docs/mcp-tool-annotations.md`.
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    // Usage telemetry records the kind only. The report itself goes to the queue.
    async (report) =>
      tracked("send-feedback", { kind: report.kind }, async () => {
        const info = server.server.getClientVersion();
        const client = info
          ? `${info.name}/${info.version}`.slice(0, AGENT_FEEDBACK_CLIENT_MAX)
          : undefined;
        const receipt = await sendFeedback({ ...report, client });
        return {
          content: [{ type: "text" as const, text: `Report ${receipt.id} sent. ${receipt.message}` }],
        };
      }),
  );
}
